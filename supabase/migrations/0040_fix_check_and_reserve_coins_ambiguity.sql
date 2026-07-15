-- Root-cause fix for the coin economy never actually working: in 0036's
-- check_and_reserve_coins, the RETURNS TABLE columns `balance` and
-- `daily_limit` are plpgsql OUT variables, and the function body's
--   select balance, daily_limit, last_reset_at into ... from user_coins
-- makes those references ambiguous (variable vs. user_coins column). With
-- the default plpgsql variable_conflict=error, EVERY call raises 42702
-- ("column reference \"balance\" is ambiguous") at that statement, which
-- aborts the whole function — including rolling back the on-conflict INSERT
-- above it. Net effect observed in production: user_coins stayed permanently
-- empty, checkAndReserveCoins (lib/chat/coins.ts) fail-opened on every
-- request, and debit_coins then ran against a nonexistent row, returning
-- greatest(0, null - p_price) = 0 — the phantom "0 coin" the UI displayed.
-- This masked itself because both TS callers fail open and the SQL editor
-- runs of 0036-0039 only (re)defined the functions without calling them.
--
-- create or replace preserves the existing grants from 0037/0038 (Postgres
-- keeps a function's ACL across replace when the signature is unchanged), so
-- no re-grant is needed here. Logic is identical to 0036 plus 0039's
-- debit_coins; the only changes are alias-qualified column references and a
-- no-row guard in debit_coins.
create or replace function check_and_reserve_coins(
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

  select uc.balance, uc.daily_limit, uc.last_reset_at
    into v_balance, v_daily_limit, v_last_reset_at
    from user_coins uc
    where uc.user_id = p_user_id
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

-- debit_coins had no ambiguity (all locals are v_-prefixed and it returns a
-- scalar), but when the user_coins row is missing it fabricated a balance of
-- 0 (greatest(0, null - p_price) ignores the null) and updated nothing —
-- exactly the misleading number that reached the UI. Return null instead so
-- the TS caller's existing null handling ("debit failed, keep prior
-- balance / omit metadata") kicks in. With check_and_reserve_coins fixed the
-- row always exists by debit time, so this is a guard, not a code path the
-- happy flow uses.
create or replace function debit_coins(
  p_user_id uuid,
  p_price numeric
)
returns numeric
language plpgsql
as $$
declare
  v_balance_before numeric;
  v_balance_after numeric;
begin
  select uc.balance into v_balance_before
    from user_coins uc
    where uc.user_id = p_user_id
    for update;

  if not found then
    return null;
  end if;

  v_balance_after := greatest(0, v_balance_before - p_price);

  update user_coins
    set balance = v_balance_after,
        total_spent = total_spent + (v_balance_before - v_balance_after)
    where user_id = p_user_id;

  return v_balance_after;
end;
$$;

-- Sanity check to run alongside this migration in the SQL editor (read/write
-- inside a rolled-back transaction, leaves no trace):
--   begin;
--   select * from check_and_reserve_coins(
--     (select id from profiles limit 1), 1, 10);
--   rollback;
-- Expected: one row (allowed=true, balance=10.00, daily_limit=null), no
-- 42702 error.
