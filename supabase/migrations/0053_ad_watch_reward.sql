-- Repeatable coin reward for watching an ad (reklam izləyib coin qazanmaq),
-- capped at N times per day per user. Unlike every prior reward mechanic in
-- this series (daily_quiz_claims: once/day; push_notification_rewards/
-- referrals: once-ever), this one is deliberately claimable multiple times
-- within the same day, up to p_daily_max — so there is intentionally NO
-- unique constraint on (user_id, claim_date) here, unlike
-- daily_quiz_claims's unique(user_id, claim_date). The daily cap is
-- enforced by counting existing rows for today under a row lock in the RPC
-- below, not by a table constraint.
--
-- RLS: self-select-only, same posture as daily_quiz_claims/
-- push_notification_rewards — no INSERT/UPDATE/DELETE policy for
-- authenticated/anon, all writes go through claim_ad_watch_reward below via
-- the service-role client (lib/coins/adWatch.ts).
create table ad_watch_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  claim_date date not null default current_date,
  reward numeric(10,2) not null check (reward > 0),
  created_at timestamptz not null default now()
);

alter table ad_watch_claims enable row level security;

create policy ad_watch_claims_select_own
  on ad_watch_claims for select
  to authenticated
  using (user_id = auth.uid());

-- claim_ad_watch_reward: unlike claim_daily_quiz_reward/
-- grant_push_notification_reward, the guard here can't be a table
-- constraint (repeatable claims are legitimate), so it has to be an
-- explicit count-under-lock instead. Row-locks the user's user_coins row
-- (`select ... for update`, mirrors check_and_reserve_coins's approach in
-- 0036) BEFORE counting today's claims, so two concurrent calls can't both
-- read "count < max" and both slip past the cap — the second call blocks
-- on the lock until the first's insert (and count) is committed.
--
-- Fails closed like claim_daily_quiz_reward: any error, including hitting
-- the cap, aborts the whole function with no partial credit.
--
-- On first-ever coin interaction for a user, creates their user_coins row
-- with the table's own default balance/daily_limit convention from 0036
-- (balance 10, daily_limit null == "use global default"), same as
-- claim_daily_quiz_reward/grant_push_notification_reward.
create function claim_ad_watch_reward(
  p_user_id uuid,
  p_reward numeric,
  p_daily_max int
)
returns numeric
language plpgsql
as $$
declare
  v_balance numeric;
  v_count int;
begin
  insert into user_coins (user_id, balance, daily_limit)
  values (p_user_id, 10, null)
  on conflict (user_id) do nothing;

  perform 1
    from user_coins
    where user_id = p_user_id
    for update;

  select count(*) into v_count
    from ad_watch_claims
    where user_id = p_user_id
      and claim_date = current_date;

  if v_count >= p_daily_max then
    raise exception 'daily_limit_reached';
  end if;

  insert into ad_watch_claims (user_id, claim_date, reward)
  values (p_user_id, current_date, p_reward);

  update user_coins uc
    set balance = uc.balance + p_reward
    where uc.user_id = p_user_id
    returning uc.balance into v_balance;

  return v_balance;
end;
$$;

-- Same execute-grant gotcha as every prior RPC in this economy (0037/0041/
-- 0042/0049/0052): revoke-from-public also strips service_role's own
-- implicit access, so it must be re-granted explicitly.
revoke execute on function claim_ad_watch_reward(uuid, numeric, int) from public, anon, authenticated;
grant execute on function claim_ad_watch_reward(uuid, numeric, int) to service_role;

grant select, insert on ad_watch_claims to service_role;
-- Re-grant on user_coins is harmless/idempotent, restated for this
-- migration's self-sufficiency (see 0037, 0041, 0042, 0049, 0052).
grant select, insert, update on user_coins to service_role;

-- New admin-configurable tunables, same app_settings convention as
-- daily_quiz_reward/push_notification_reward — no seed rows inserted;
-- lib/coins/adWatch.ts hardcodes the TS-side defaults when no row exists yet.
--   ad_watch_reward      -- default 1 (deliberately smaller than
--                            daily_quiz_reward's 3, since this is repeatable
--                            many times a day)
--   ad_watch_daily_max   -- default 5 (max number of ad-watch claims per user
--                            per day)
