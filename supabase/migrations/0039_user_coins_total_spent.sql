-- Lifetime coin-spend tracking, for display on the admin users list
-- (lib/admin/getUsers.ts). user_coins.balance is the current/resettable
-- figure ("remaining"); this is a separate, never-reset running total.
alter table user_coins
  add column total_spent numeric(10,2) not null default 0;

alter table user_coins
  add constraint user_coins_total_spent_non_negative check (total_spent >= 0);

-- create or replace is safe here: the signature (uuid, numeric) and return
-- type (numeric) are unchanged from 0036, only the function body changes to
-- also accumulate total_spent. Captures the pre-debit balance so the
-- increment reflects the *actual* amount debited (balance clamps at 0 via
-- greatest(), so a request priced at p_price can debit less than p_price
-- when the balance was already below it) rather than blindly adding
-- p_price, which would overstate lifetime spend past what the user actually
-- had.
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
  select balance into v_balance_before
    from user_coins
    where user_id = p_user_id
    for update;

  v_balance_after := greatest(0, v_balance_before - p_price);

  update user_coins
    set balance = v_balance_after,
        total_spent = total_spent + (v_balance_before - v_balance_after)
    where user_id = p_user_id;

  return v_balance_after;
end;
$$;
