-- Phase 2 of the coin roadmap (docs/coin-roadmap.md): referral bonus.
-- A user shares their referral code; when someone signs up with it, both
-- sides are credited a fixed amount of coins, once, ever, per referred
-- user.

-- referral_code is nullable at the DB level and has no generator here on
-- purpose: a bespoke short-code generator inside plpgsql (collision retry,
-- alphabet choice, etc.) is more naturally expressed in TS
-- (lib/coins/referrals.ts's getOrCreateReferralCode), which can just retry
-- the update on a unique_violation in a small bounded loop. The column is
-- lazily populated on first request (e.g. first visit to the referral
-- share UI), not at signup time.
alter table profiles add column referral_code text unique;

-- RLS: same posture as coin_transfers/daily_quiz_claims — RLS enabled, no
-- INSERT/UPDATE/DELETE policy for authenticated/anon (all writes go through
-- grant_referral_bonus below via the service-role client,
-- lib/coins/referrals.ts), one SELECT policy so each party can see
-- referrals they're involved in.
--
-- referred_id is UNIQUE (not just referrer_id, referred_id together) —
-- this is the actual idempotency guard, mirroring how daily_quiz_claims'
-- unique(user_id, claim_date) is the real guard behind
-- claim_daily_quiz_reward: a given signup can be credited as "referred"
-- at most once, ever, no matter how many times a bonus grant is attempted
-- for them (retried request, double-submit, etc.), and no matter who the
-- referrer was.
create table referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references profiles(id),
  referred_id uuid not null unique references profiles(id),
  bonus_claimed boolean not null default false,
  created_at timestamptz not null default now()
);

alter table referrals enable row level security;

create policy referrals_select_own
  on referrals for select
  to authenticated
  using (referrer_id = auth.uid() or referred_id = auth.uid());

create index referrals_referrer_id_idx on referrals (referrer_id);

-- grant_referral_bonus: fails closed like transfer_coins/
-- claim_daily_quiz_reward — this is a deliberate coin-mint action, not a
-- background best-effort check, so any unexpected error aborts the whole
-- function rather than partially crediting one side.
--
-- Unlike transfer_coins, this is a pure mint (no sender balance to check
-- or debit) — both user_coins rows are credited directly by p_bonus_amount,
-- not moved from one to the other.
--
-- Idempotency: the insert into referrals uses
-- `on conflict (referred_id) do nothing`. If a row for this referred_id
-- already exists (this referred user was already credited once, by this
-- referrer or another), the insert is a no-op and NO credit is issued —
-- the function returns gracefully (both balances null, bonus_claimed
-- false) instead of raising, so the TS caller can tell "already handled"
-- apart from a genuine error and doesn't need to treat a repeat call
-- (e.g. a retried request) as a failure.
create function grant_referral_bonus(
  p_referrer_id uuid,
  p_referred_id uuid,
  p_bonus_amount numeric
)
returns table (
  bonus_claimed boolean,
  referrer_balance numeric,
  referred_balance numeric
)
language plpgsql
as $$
declare
  v_inserted_id uuid;
  v_referrer_balance numeric;
  v_referred_balance numeric;
begin
  if p_referrer_id = p_referred_id then
    raise exception 'self_referral';
  end if;

  insert into referrals (referrer_id, referred_id)
  values (p_referrer_id, p_referred_id)
  on conflict (referred_id) do nothing
  returning id into v_inserted_id;

  if v_inserted_id is null then
    -- Already referred before (conflict) — no-op, not an error.
    return query select false, null::numeric, null::numeric;
    return;
  end if;

  insert into user_coins (user_id, balance, daily_limit)
  values (p_referrer_id, 10, null)
  on conflict (user_id) do nothing;

  insert into user_coins (user_id, balance, daily_limit)
  values (p_referred_id, 10, null)
  on conflict (user_id) do nothing;

  update user_coins uc
    set balance = uc.balance + p_bonus_amount
    where uc.user_id = p_referrer_id
    returning uc.balance into v_referrer_balance;

  update user_coins uc
    set balance = uc.balance + p_bonus_amount
    where uc.user_id = p_referred_id
    returning uc.balance into v_referred_balance;

  update referrals
    set bonus_claimed = true
    where id = v_inserted_id;

  return query select true, v_referrer_balance, v_referred_balance;
end;
$$;

-- Same execute-grant gotcha as every prior RPC in this economy (0037/0041/
-- 0042): revoke-from-public also strips service_role's own implicit
-- access, so it must be re-granted explicitly.
revoke execute on function grant_referral_bonus(uuid, uuid, numeric) from public, anon, authenticated;
grant execute on function grant_referral_bonus(uuid, uuid, numeric) to service_role;

grant select, insert, update on referrals to service_role;
-- Re-grant on user_coins/profiles is harmless/idempotent, restated here for
-- this migration's self-sufficiency (see 0037/0041/0042).
grant select, insert, update on user_coins to service_role;
grant select, insert, update on profiles to service_role;

-- New admin-configurable tunable, same app_settings key-value convention as
-- chat_message_price/coin_transfer_min_amount/daily_quiz_reward — no seed
-- row inserted; lib/coins/referrals.ts hardcodes the TS-side default when
-- no row exists yet.
--   referral_bonus_amount   -- default 5 (coins credited to EACH side —
--                              referrer and referred — per successful
--                              referral). Chosen to be the same order of
--                              magnitude as the daily quiz reward's default
--                              of 3, but slightly higher since a referral
--                              is a one-time, higher-value action (bringing
--                              in a whole new user) versus a repeatable
--                              daily action.
