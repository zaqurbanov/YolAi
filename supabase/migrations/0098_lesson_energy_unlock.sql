-- ===========================================================================
-- 0098 — LESSON UNLOCK / RETRY MOVED TO ENERGY (user_energy), NOT COINS.
-- ===========================================================================
--
-- WHAT CHANGES
--   `unlock_lesson_course(uuid, uuid, numeric)` and
--   `purchase_lesson_retry(uuid, uuid, numeric)` previously debited user_coins
--   (0060_lesson_courses.sql). This migration rewrites BOTH bodies to debit
--   user_energy instead, using the same conditional-decrement pattern the
--   games use (0069 settle_tictactoe, 0071 sign_speed, 0070):
--
--       update user_energy
--         set balance = balance - v_cost,
--             updated_at = now()
--         where user_id = p_user_id
--           and balance >= v_cost
--         returning balance into v_balance;
--
--       if v_balance is null then
--         raise exception 'insufficient_energy';
--       end if;
--
--   A missing user_energy row (a brand-new account that never touched any
--   energy surface) matches zero rows, so it fails closed as
--   'insufficient_energy' — a user with no energy row has 0 energy.
--
-- WHY THIS DOES NOT BREACH THE ENERGY→COIN INVARIANT
--   0094_two_currency_economy.sql forbids energy being convertible BACK into
--   coins; the only sanctioned conversion is convert_energy_to_coins (0096).
--   Spending energy to UNLOCK a course is a pure energy SINK (like playing a
--   game): energy leaves the account and nothing comes back. Neither rewritten
--   body touches user_coins at all — the only writes are user_energy and the
--   existing ledger rows (user_course_unlocks / user_topic_progress). There is
--   therefore no energy→coin conversion here, and no lock-order concern (each
--   body locks only user_energy, never both currency tables).
--
-- PRICE SEMANTICS
--   Energy balances are integers (user_energy.balance int). The p_price
--   numeric argument is rounded to the nearest integer with round(p_price)::int
--   before the comparison and debit, and the TS side resolves integer prices
--   (lib/coins/lessonUnlock.ts). The two settings keys are unchanged:
--     lesson_course_unlock_price  -- default 20 (now ENERGY)
--     lesson_retry_cost           -- default 5  (now ENERGY)
--   admin labels updated in /admin/kurslar to say "enerji".
--
-- DAILY GRANT
--   Unlike the game spend RPCs, neither body calls grant_daily_energy() first.
--   That is deliberate: every unlock/retry UI lives under /oyrenme, whose page
--   already applies the lazy daily top-up by reading the energy meter
--   (getEnergyStatus → grant_daily_energy). The grant is therefore always
--   already applied before the buy dialog is shown, and re-applying it inside
--   the RPC would both be redundant and require a signature change (the grant
--   amount is a server-resolved app_settings value, not something the 3-arg
--   signature can know).
--
-- Idempotent: create or replace keeps the SAME signature and return type
-- (numeric) — Postgres cannot change those via create-or-replace — so the
-- existing service_role EXECUTE grants from 0060 survive. The revoke+grant
-- pair below is re-issued defensively (house convention: revoke-from-public
-- strips service_role's implicit access too). user_energy's table grants
-- (select/insert/update to service_role) come from 0067 and remain in force.
-- APPLY THIS BY HAND in the Supabase SQL editor, AFTER 0097.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- unlock_lesson_course — ENERGY version. Same signature/return type as 0060.
--   The ledger insert comes FIRST so 'already_unlocked' aborts before any
--   energy moves (a raise rolls the insert back anyway, but ordering it first
--   keeps the check a clean early exit). The debit is a single conditional
--   UPDATE — that IS the atomic serialize: two concurrent unlocks for the same
--   user/course serialize on the user_course_unlocks unique constraint, and two
--   concurrent spends for the same user serialize on the row lock behind the
--   `balance >= v_cost` predicate.
-- ---------------------------------------------------------------------------
create or replace function unlock_lesson_course(
  p_user_id  uuid,
  p_course_id uuid,
  p_price    numeric
)
returns numeric
language plpgsql
as $$
declare
  v_id      uuid;
  v_balance int;
  v_cost    int := round(p_price)::int;
begin
  if p_price is null or p_price < 0 then
    raise exception 'invalid_price';
  end if;

  insert into user_course_unlocks (user_id, course_id, price_paid)
  values (p_user_id, p_course_id, p_price)
  on conflict (user_id, course_id) do nothing
  returning id into v_id;

  if v_id is null then
    raise exception 'already_unlocked';
  end if;

  -- Energy spend. Never touches user_coins (0094 invariant).
  update user_energy
    set balance = balance - v_cost,
        updated_at = now()
    where user_id = p_user_id
      and balance >= v_cost
    returning balance into v_balance;

  if v_balance is null then
    raise exception 'insufficient_energy';
  end if;

  return v_balance;
end;
$$;

revoke execute on function unlock_lesson_course(uuid, uuid, numeric) from public, anon, authenticated;
grant execute on function unlock_lesson_course(uuid, uuid, numeric) to service_role;

-- ---------------------------------------------------------------------------
-- purchase_lesson_retry — ENERGY version. Same signature/return type as 0060.
--   The debit runs FIRST here because the retry's progress-row update is a
--   non-idempotent increment (unlike the unlock's on-conflict-do-nothing): a
--   failed debit raises and rolls the increment back, so no increment is ever
--   paid for by energy that did not actually leave. The conditional UPDATE
--   serializes concurrent retries for the same user the same way the games do.
-- ---------------------------------------------------------------------------
create or replace function purchase_lesson_retry(
  p_user_id uuid,
  p_topic_id uuid,
  p_price   numeric
)
returns numeric
language plpgsql
as $$
declare
  v_balance int;
  v_cost    int := round(p_price)::int;
begin
  if p_price is null or p_price < 0 then
    raise exception 'invalid_price';
  end if;

  -- Energy spend. Never touches user_coins (0094 invariant).
  update user_energy
    set balance = balance - v_cost,
        updated_at = now()
    where user_id = p_user_id
      and balance >= v_cost
    returning balance into v_balance;

  if v_balance is null then
    raise exception 'insufficient_energy';
  end if;

  insert into user_topic_progress (user_id, topic_id, retries_purchased)
  values (p_user_id, p_topic_id, 1)
  on conflict (user_id, topic_id) do update
    set retries_purchased = user_topic_progress.retries_purchased + 1;

  return v_balance;
end;
$$;

revoke execute on function purchase_lesson_retry(uuid, uuid, numeric) from public, anon, authenticated;
grant execute on function purchase_lesson_retry(uuid, uuid, numeric) to service_role;

-- Keep the table grant explicit alongside the function grants (house
-- convention; already granted in 0067, harmless to re-issue).
grant select, insert, update on user_energy to service_role;
