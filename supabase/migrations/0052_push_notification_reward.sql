-- One-time coin reward for turning on push notifications
-- (components/account/PushNotificationOptIn.tsx). Credited once, ever, per
-- user — enabling, disabling, and re-enabling later must NOT re-credit.
-- Same idempotency shape as daily_quiz_claims/referrals: a small ledger
-- table with a uniqueness constraint is the actual guard, not application
-- logic, since push_subscriptions rows themselves are deleted on
-- unsubscribe (0050_push_subscriptions.sql) and can't be used to detect
-- "has this user ever subscribed before".
--
-- RLS: self-select-only, same posture as daily_quiz_claims/referrals — no
-- INSERT/UPDATE/DELETE policy for authenticated/anon, all writes go through
-- grant_push_notification_reward below via the service-role client
-- (lib/coins/pushNotifications.ts).
create table push_notification_rewards (
  user_id uuid primary key references profiles(id),
  created_at timestamptz not null default now()
);

alter table push_notification_rewards enable row level security;

create policy push_notification_rewards_select_own
  on push_notification_rewards for select
  to authenticated
  using (user_id = auth.uid());

-- grant_push_notification_reward: insert-then-credit, single transaction.
-- The primary key on user_id is the actual one-time-ever guard — a second
-- call for the same user (re-enabling after disabling) hits a
-- unique_violation, caught here and re-raised as a distinct,
-- TS-matchable exception message ('already_claimed'), mirroring
-- claim_daily_quiz_reward exactly.
create function grant_push_notification_reward(
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
    insert into push_notification_rewards (user_id)
    values (p_user_id);
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

-- Same execute-grant gotcha as every prior RPC in this economy (0037/0041/
-- 0042/0049): revoke-from-public also strips service_role's own implicit
-- access, so it must be re-granted explicitly.
revoke execute on function grant_push_notification_reward(uuid, numeric) from public, anon, authenticated;
grant execute on function grant_push_notification_reward(uuid, numeric) to service_role;

grant select, insert on push_notification_rewards to service_role;
-- Re-grant on user_coins is harmless/idempotent, restated for this
-- migration's self-sufficiency (see 0037, 0041, 0042, 0049).
grant select, insert, update on user_coins to service_role;

-- New admin-configurable tunable, same app_settings convention as
-- daily_quiz_reward/referral_bonus_amount — no seed row inserted;
-- lib/coins/pushNotifications.ts hardcodes the TS-side default when no row
-- exists yet.
--   push_notification_reward   -- default 3 (coins credited once, ever, the
--                                  first time a user enables push notifications)
