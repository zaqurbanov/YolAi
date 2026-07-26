-- 0072_energy_purchase.sql — "buy energy with coins", a COIN SINK, not a new
-- coin-extraction path. Coins are earned elsewhere (ads, quizzes, referrals,
-- games); this RPC only ever moves coins OUT of a user's balance and ENERGY
-- IN, at a fixed, admin-configurable exchange rate. It cannot mint coins.
--
-- IMPORTANT — purchased energy does NOT carry over: grant_daily_energy (0067)
-- RESETS user_energy.balance to the daily grant amount (does not add to it) on
-- the first call of a new day. So energy bought today is wiped at tomorrow's
-- reset exactly like unused daily-grant energy is. This is intentional — do
-- NOT "fix" this into an accumulating balance across days; that would let a
-- user stockpile energy indefinitely by buying it once.
--
-- LOCK ORDER (must match start_sign_speed_round / settle_tictactoe exactly,
-- see 0067/0071): user_energy is locked FIRST via grant_daily_energy (which
-- does the lazy daily reset AND takes the `for update` lock, held for the
-- rest of this transaction), THEN user_coins is locked. Reversing this order
-- risks a deadlock against the other games' RPCs which lock in the same
-- energy-then-coins order.
create or replace function purchase_energy(
  p_user_id             uuid,
  p_coin_cost           numeric,
  p_energy_amount       int,
  p_daily_energy_grant  int,
  p_max_energy          int
)
returns jsonb
language plpgsql
as $$
declare
  v_energy_balance int;
  v_coin_balance   numeric;
begin
  if p_coin_cost is null or p_coin_cost <= 0 then
    raise exception 'invalid_coin_cost';
  end if;
  if p_energy_amount is null or p_energy_amount <= 0 then
    raise exception 'invalid_energy_amount';
  end if;
  if p_max_energy is null or p_max_energy <= 0 then
    raise exception 'invalid_max_energy';
  end if;

  -- (1) Energy row FIRST — lazy daily reset + row lock held for the rest of
  -- this transaction, exactly mirroring start_sign_speed_round/settle_tictactoe.
  perform grant_daily_energy(p_user_id, p_daily_energy_grant);

  select balance into v_energy_balance
    from user_energy
    where user_id = p_user_id
    for update;

  -- (2) user_coins SECOND — same lock order as the other games' RPCs.
  insert into user_coins (user_id, balance, daily_limit)
  values (p_user_id, 10, null)
  on conflict (user_id) do nothing;

  select balance into v_coin_balance
    from user_coins
    where user_id = p_user_id
    for update;

  if v_coin_balance < p_coin_cost then
    raise exception 'insufficient_coins';
  end if;

  -- (3) Reject the WHOLE purchase (no rows touched) if it would push energy
  -- past the cap — no partial credit.
  if v_energy_balance + p_energy_amount > p_max_energy then
    raise exception 'energy_cap_reached';
  end if;

  update user_coins
    set balance = balance - p_coin_cost
    where user_id = p_user_id
    returning balance into v_coin_balance;

  update user_energy
    set balance = balance + p_energy_amount,
        updated_at = now()
    where user_id = p_user_id
    returning balance into v_energy_balance;

  return jsonb_build_object('coinBalance', v_coin_balance, 'energy', v_energy_balance);
end;
$$;

-- Same execute-grant gotcha as every prior coin RPC in this repo: the revoke
-- from public also strips service_role's own implicit access, so it MUST be
-- re-granted explicitly.
revoke execute on function purchase_energy(uuid, numeric, int, int, int) from public, anon, authenticated;
grant execute on function purchase_energy(uuid, numeric, int, int, int) to service_role;

grant select, insert, update on user_coins to service_role;
grant select, insert, update on user_energy to service_role;

-- New admin-configurable tunables (house convention — NO seed rows; TS
-- defaults in lib/coins/games.ts):
--   energy_purchase_coin_cost      -- default 5  (coins spent per purchase)
--   energy_purchase_energy_amount  -- default 10 (energy granted per purchase)
--   energy_purchase_max_balance    -- default 50 (soft cap on total energy balance)
