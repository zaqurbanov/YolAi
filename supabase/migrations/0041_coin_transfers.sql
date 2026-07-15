-- Phase 1 of the coin roadmap (docs/coin-roadmap.md): peer-to-peer coin
-- transfers. New table + RPC, modeled on 0036/0040's coin economy
-- (user_coins, check_and_reserve_coins) but deliberately fail-CLOSED (not
-- fail-open like the chat-gating RPCs) — a transfer is a deliberate
-- financial action initiated by the user, so any error here must block the
-- transfer rather than silently letting it through.
--
-- RLS: same posture as user_coins/chat_rate_limits — RLS enabled, no
-- INSERT/UPDATE/DELETE policy for authenticated/anon (all writes go through
-- transfer_coins below via the service-role client, lib/coins/transfers.ts),
-- one SELECT policy so each party can read transfers they're involved in for
-- their own history view.
create table coin_transfers (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references profiles(id),
  recipient_id uuid not null references profiles(id),
  amount numeric(10,2) not null check (amount > 0),
  created_at timestamptz not null default now()
);

alter table coin_transfers enable row level security;

create policy coin_transfers_select_own
  on coin_transfers for select
  to authenticated
  using (sender_id = auth.uid() or recipient_id = auth.uid());

create index coin_transfers_sender_created_at_idx
  on coin_transfers (sender_id, created_at);

create index coin_transfers_recipient_idx
  on coin_transfers (recipient_id);

-- transfer_coins: row-locks both users' user_coins rows in a consistent
-- order (by uuid comparison — deterministic, total, avoids the classic
-- deadlock from two opposite-direction transfers between the same two users
-- locking in opposite order simultaneously), then enforces, in order:
--   1. sender != recipient (defense in depth — lib/coins/transfers.ts's
--      lookupRecipientByEmail already excludes the caller's own id, but the
--      RPC re-checks since it's the actual authority boundary).
--   2. transferable = greatest(0, sender_balance - effective_daily_limit)
--      (effective_daily_limit = coalesce(sender.daily_limit,
--      p_default_daily_limit)) — a user can never transfer away the coins
--      that make up their own daily free allowance.
--   3. daily transfer cap: sum of this sender's coin_transfers created
--      today (date_trunc('day', now()) — calendar-day boundary in the
--      database's session timezone, simpler than a rolling 24h window and
--      close enough for an anti-abuse cap) plus this transfer must not
--      exceed p_daily_transfer_cap.
-- All column references inside are alias-qualified (uc.balance, not bare
-- balance) per 0040's fix — the RETURNS TABLE OUT params here
-- (sender_balance/recipient_balance) don't collide with user_coins' own
-- column names, but v_* locals + alias-qualified selects are used
-- throughout anyway for consistency and to not re-introduce the trap if a
-- column is ever renamed to match.
create function transfer_coins(
  p_sender_id uuid,
  p_recipient_id uuid,
  p_amount numeric,
  p_default_daily_limit numeric,
  p_daily_transfer_cap numeric
)
returns table (
  sender_balance numeric,
  recipient_balance numeric
)
language plpgsql
as $$
declare
  v_sender_balance numeric;
  v_sender_daily_limit numeric;
  v_recipient_balance numeric;
  v_effective_daily_limit numeric;
  v_transferable numeric;
  v_already_sent_today numeric;
  v_sender_balance_after numeric;
  v_recipient_balance_after numeric;
begin
  if p_sender_id = p_recipient_id then
    raise exception 'sender_equals_recipient';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_amount';
  end if;

  -- Ensure both rows exist before locking (mirrors check_and_reserve_coins'
  -- insert-on-conflict-do-nothing pattern; default balance on first touch is
  -- the resolved daily limit, same convention as 0036/0040).
  insert into user_coins (user_id, balance, daily_limit)
  values (p_sender_id, p_default_daily_limit, null)
  on conflict (user_id) do nothing;

  insert into user_coins (user_id, balance, daily_limit)
  values (p_recipient_id, p_default_daily_limit, null)
  on conflict (user_id) do nothing;

  -- Lock in a consistent order (smaller uuid first) regardless of who is
  -- sender vs. recipient, so two opposite-direction transfers between the
  -- same two users can never deadlock against each other.
  if p_sender_id < p_recipient_id then
    select uc.balance, uc.daily_limit into v_sender_balance, v_sender_daily_limit
      from user_coins uc where uc.user_id = p_sender_id for update;
    select uc.balance into v_recipient_balance
      from user_coins uc where uc.user_id = p_recipient_id for update;
  else
    select uc.balance into v_recipient_balance
      from user_coins uc where uc.user_id = p_recipient_id for update;
    select uc.balance, uc.daily_limit into v_sender_balance, v_sender_daily_limit
      from user_coins uc where uc.user_id = p_sender_id for update;
  end if;

  v_effective_daily_limit := coalesce(v_sender_daily_limit, p_default_daily_limit);
  v_transferable := greatest(0, v_sender_balance - v_effective_daily_limit);

  if p_amount > v_transferable then
    raise exception 'insufficient_transferable_balance';
  end if;

  select coalesce(sum(ct.amount), 0) into v_already_sent_today
    from coin_transfers ct
    where ct.sender_id = p_sender_id
      and ct.created_at >= date_trunc('day', now());

  if v_already_sent_today + p_amount > p_daily_transfer_cap then
    raise exception 'daily_transfer_cap_exceeded';
  end if;

  update user_coins uc
    set balance = uc.balance - p_amount
    where uc.user_id = p_sender_id
    returning uc.balance into v_sender_balance_after;

  update user_coins uc
    set balance = uc.balance + p_amount
    where uc.user_id = p_recipient_id
    returning uc.balance into v_recipient_balance_after;

  insert into coin_transfers (sender_id, recipient_id, amount)
  values (p_sender_id, p_recipient_id, p_amount);

  return query select v_sender_balance_after, v_recipient_balance_after;
end;
$$;

-- Postgres grants EXECUTE on new functions to PUBLIC by default; revoke it,
-- then re-grant explicitly to service_role only — see 0037's note, the
-- revoke-from-public also strips service_role's own implicit access since
-- service_role is not a superuser and must be granted separately.
revoke execute on function transfer_coins(uuid, uuid, numeric, numeric, numeric) from public, anon, authenticated;
grant execute on function transfer_coins(uuid, uuid, numeric, numeric, numeric) to service_role;

grant select, insert, update on coin_transfers to service_role;
-- Re-grant on user_coins is harmless/idempotent — already granted by 0037,
-- restated here so this migration is self-sufficient reading it in
-- isolation.
grant select, insert, update on user_coins to service_role;

-- Two new admin-configurable tunables, same key-value app_settings table as
-- chat_message_price (0036) — no seed rows inserted here, following that
-- same convention: lib/coins/transfers.ts hardcodes the TS-side default
-- (mirroring getGlobalMessagePrice) when no row exists yet.
--   coin_transfer_min_amount   -- default 1  (minimum coins per transfer)
--   coin_transfer_daily_cap    -- default 20 (max coins a user can send out per calendar day)
