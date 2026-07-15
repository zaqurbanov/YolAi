-- Phase 1 of the coin roadmap (docs/coin-roadmap.md): daily traffic-law
-- mini-quiz as the first (and, for Phase 1, only) coin-earning mechanic.
-- The question bank itself is static code (lib/quiz/questions.ts), not a
-- table — this migration only needs to record "did this user already claim
-- today's reward" and credit the coins.
--
-- RLS: self-select-only, same posture as user_coins/coin_transfers — no
-- INSERT/UPDATE/DELETE policy for authenticated/anon, all writes go through
-- claim_daily_quiz_reward below via the service-role client
-- (lib/coins/quiz.ts).
create table daily_quiz_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  claim_date date not null,
  reward numeric(10,2) not null check (reward > 0),
  created_at timestamptz not null default now(),
  unique (user_id, claim_date)
);

alter table daily_quiz_claims enable row level security;

create policy daily_quiz_claims_select_own
  on daily_quiz_claims for select
  to authenticated
  using (user_id = auth.uid());

-- claim_daily_quiz_reward: insert-then-credit, single transaction. The
-- unique(user_id, claim_date) constraint is the actual double-claim guard;
-- a same-day second call hits a unique_violation, which is caught here and
-- re-raised as a distinct, TS-matchable exception message ('already_claimed')
-- rather than leaking the raw 23505/constraint-name text up through
-- PostgREST. lib/coins/quiz.ts matches on this exact message string.
--
-- Fails closed like transfer_coins: any error aborts the whole function
-- (including the credit), since this is a deliberate reward-claim action,
-- not a background/best-effort check.
--
-- On first-ever coin interaction for a user, creates their user_coins row
-- with the table's own default balance/daily_limit convention from 0036
-- (balance 10, daily_limit null == "use global default"), not the caller's
-- own p_reward — the claimed reward is credited on top of that starting
-- balance in the same statement sequence.
create function claim_daily_quiz_reward(
  p_user_id uuid,
  p_reward numeric
)
returns numeric
language plpgsql
as $$
declare
  v_balance numeric;
begin
  begin
    insert into daily_quiz_claims (user_id, claim_date, reward)
    values (p_user_id, current_date, p_reward);
  exception
    when unique_violation then
      raise exception 'already_claimed';
  end;

  insert into user_coins (user_id, balance, daily_limit)
  values (p_user_id, 10, null)
  on conflict (user_id) do nothing;

  update user_coins uc
    set balance = uc.balance + p_reward
    where uc.user_id = p_user_id
    returning uc.balance into v_balance;

  return v_balance;
end;
$$;

-- Same execute-grant gotcha as every prior RPC in this economy (0037/0041):
-- revoke-from-public also strips service_role's own implicit access, so it
-- must be re-granted explicitly.
revoke execute on function claim_daily_quiz_reward(uuid, numeric) from public, anon, authenticated;
grant execute on function claim_daily_quiz_reward(uuid, numeric) to service_role;

grant select, insert, update on daily_quiz_claims to service_role;
-- Re-grant on user_coins is harmless/idempotent, restated for this
-- migration's self-sufficiency (see 0037, 0041).
grant select, insert, update on user_coins to service_role;

-- New admin-configurable tunable, same app_settings convention as
-- chat_message_price/coin_transfer_min_amount — no seed row inserted;
-- lib/coins/quiz.ts hardcodes the TS-side default when no row exists yet.
--   daily_quiz_reward   -- default 3 (coins credited for a correct daily quiz answer)
