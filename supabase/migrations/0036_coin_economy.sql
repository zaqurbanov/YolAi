-- Coin/credit economy replacing the message-count half of the rate limiter
-- (chat_rate_limits/0023 stays as-is and continues to enforce min-spacing
-- anti-spam only — see app/api/chat/route.ts for how the two are combined).
--
-- One row per user, numeric(10,2) (not int) because the per-message price is
-- explicitly allowed to be fractional (e.g. 0.5/message), so balances must
-- support fractional values too. daily_limit is nullable: null means "use
-- the global default" (mirrors profiles.custom_max_per_day/0024's
-- null-means-global-default convention).
--
-- RLS: follows chat_rate_limits' posture (RLS enabled, no
-- INSERT/UPDATE/DELETE policies for authenticated/anon — all writes go
-- through the service-role client, either via the two RPCs below on the chat
-- path or via admin routes after requireAdmin()) with ONE deliberate
-- exception: a SELECT policy so a user can read their own balance directly
-- (needed for the frontend's live balance display without a dedicated
-- read-through API round trip on every poll).
create table user_coins (
  user_id uuid primary key references profiles(id) on delete cascade,
  balance numeric(10,2) not null default 10,
  daily_limit numeric(10,2),
  last_reset_at timestamptz not null default now()
);

alter table user_coins enable row level security;

create policy user_coins_select_own
  on user_coins for select
  to authenticated
  using (user_id = auth.uid());

alter table user_coins
  add constraint user_coins_balance_non_negative check (balance >= 0),
  add constraint user_coins_daily_limit_positive check (daily_limit is null or daily_limit > 0);

-- check_and_reserve_coins: row-locked (`select ... for update`), single
-- transaction, mirrors check_chat_rate_limit's (0023) style. Creates the
-- user's row on first use (default balance = the resolved daily limit, not
-- the table's own default of 10, so a user's very first check already
-- reflects any per-user override or admin-configured global default).
-- Performs a floor/top-up 24h reset when due: balance is raised to
-- coalesce(daily_limit, p_default_daily_limit) only if it's currently below
-- that limit (greatest(balance, effective_limit)) — discarding unused
-- leftover from the previous window (it doesn't carry over/stack), but never
-- lowering a balance already at or above the limit, so an admin top-up
-- granted mid-window survives the next reset instead of being wiped.
-- Only checks sufficiency here; does NOT decrement — decrementing happens
-- exclusively in debit_coins below, called only after a fully successful
-- LLM response, so a request that fails after this check costs the user
-- nothing.
create function check_and_reserve_coins(
  p_user_id uuid,
  p_price numeric,
  p_default_daily_limit numeric
)
returns table (
  allowed boolean,
  balance numeric,
  daily_limit numeric
)
language plpgsql
as $$
declare
  v_balance numeric;
  v_daily_limit numeric;
  v_last_reset_at timestamptz;
  v_effective_limit numeric;
begin
  insert into user_coins (user_id, balance, daily_limit)
  values (p_user_id, p_default_daily_limit, null)
  on conflict (user_id) do nothing;

  select balance, daily_limit, last_reset_at
    into v_balance, v_daily_limit, v_last_reset_at
    from user_coins
    where user_id = p_user_id
    for update;

  v_effective_limit := coalesce(v_daily_limit, p_default_daily_limit);

  if now() - v_last_reset_at >= interval '24 hours' then
    v_balance := greatest(v_balance, v_effective_limit);
    v_last_reset_at := now();
    update user_coins
      set balance = v_balance,
          last_reset_at = v_last_reset_at
      where user_id = p_user_id;
  end if;

  return query select (v_balance >= p_price), v_balance, v_daily_limit;
end;
$$;

-- debit_coins: row-locked, clamps at 0 so concurrent debits can never drive
-- balance negative. Called only from onFinish (fully successful stream),
-- never on error/abort — see app/api/chat/route.ts.
create function debit_coins(
  p_user_id uuid,
  p_price numeric
)
returns numeric
language plpgsql
as $$
declare
  v_balance numeric;
begin
  update user_coins
    set balance = greatest(0, balance - p_price)
    where user_id = p_user_id
    returning balance into v_balance;

  return v_balance;
end;
$$;

-- Postgres grants EXECUTE on new functions to PUBLIC by default; revoke it
-- so these are only callable via the service-role client
-- (lib/chat/coins.ts), never directly by an authenticated or anon client.
revoke execute on function check_and_reserve_coins(uuid, numeric, numeric) from public, anon, authenticated;
revoke execute on function debit_coins(uuid, numeric) from public, anon, authenticated;

-- Global per-message coin price, reusing the existing app_settings
-- key-value table (0024) rather than a new one — same pattern as
-- chat_rate_limit_max_per_day. No env var fallback (unlike
-- CHAT_RATE_LIMIT_MAX_PER_DAY): this is a brand-new concept with no prior
-- env var, so lib/chat/coins.ts hardcodes a `1` default in TS when no row
-- exists. Key: 'chat_message_price'.
