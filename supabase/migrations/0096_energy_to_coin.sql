-- ===========================================================================
-- 0096_energy_to_coin.sql — ENERGY -> COIN conversion: the ONE owner-sanctioned
-- exception to the 0094 invariant.
--
-- ###########################################################################
-- ## 0094'S INVARIANT IS REVERSED FOR THIS ONE PATH (OWNER DECISION).      ##
-- ##                                                                       ##
-- ## 0094 declared: "ENERGY MUST NEVER BE CONVERTIBLE BACK INTO COINS,     ##
-- ## DIRECTLY OR INDIRECTLY." The owner has EXPLICITLY chosen to reverse    ##
-- ## that for THIS single conversion path: 100 energy -> 1.5 coins at the  ##
-- ## defaults (energy_to_coin_energy_unit / energy_to_coin_coin_rate),     ##
-- ## ledgered in energy_to_coin_conversions, hard-capped PER ACCOUNT PER   ##
-- ## BAKU DAY by energy_to_coin_daily_cap (default 100 energy/day, admin-  ##
-- ## tunable via /api/admin/chat-meta?type=energy-to-coin). Every OTHER    ##
-- ## energy path remains invariant-safe: no function other than            ##
-- ## convert_energy_to_coins may spend energy and write user_coins.        ##
-- ##                                                                       ##
-- ## WHY THE DAILY CAP IS THE REAL BOUND: accounts are free (email         ##
-- ## confirmation is disabled, no IP limiter), energy is free from the     ##
-- ## daily grant (game_daily_energy, default 10/day) + the per-game daily  ##
-- ## caps, and coins are intended to be SOLD for real money later. Without ##
-- ## a per-account daily cap, unlimited accounts x free energy ->          ##
-- ## unlimited coins. The cap is the whole point of this feature.          ##
-- ##                                                                       ##
-- ## WHY COIN -> ENERGY -> COIN IS NOT A VECTOR: the roundtrip is ~97%     ##
-- ## lossy — 50 coins buys 100 energy (purchase_energy) and 100 energy     ##
-- ## converts back to 1.5 coins. There is no way to end with more coins    ##
-- ## than you started with, so only FREE energy (the daily grant + game    ##
-- ## winnings) can feed this path — which is exactly what the daily cap    ##
-- ## bounds.                                                               ##
-- ##                                                                       ##
-- ## FUTURE WORK MUST PRESERVE THE CAP: any later energy->coin path must   ##
-- ## be daily-capped and ledgered the same way. Do not "simplify" this     ##
-- ## into an uncapped RPC, and do not add a second conversion path.        ##
-- ###########################################################################
--
-- WHAT CHANGES:
--   NEW table energy_to_coin_conversions .... the conversion ledger. RLS on,
--       select-own only (the UI reads "converted today / remaining"). No
--       insert/update/delete policy — writes go exclusively through the
--       service-role RPC below, same posture as daily_grant_claims in 0094.
--   NEW RPC convert_energy_to_coins ......... a single transaction that
--       validates, locks, cap-checks, debits energy and credits coins. The
--       ONLY place in the schema that spends energy AND writes user_coins.
--
-- LOCK ORDER (unchanged, must be preserved): user_energy FIRST, user_coins
-- SECOND — matches purchase_energy/settle_tictactoe/start_sign_speed_round
-- and apply_daily_grant. See the function body for why the user_energy lock is
-- taken BEFORE the daily-cap sum (a deliberate improvement over a naive
-- "sum then lock" ordering: in READ COMMITTED a second transaction could run
-- its sum() before the first commits and then both pass the cap check).
--
-- COIN ROUNDING: v_coins = round(energy_amount / unit * rate, 2). With a
-- sane admin config this is always >= 0.01, satisfying the table's
-- coins_credited > 0 check; an absurd config (e.g. 1 energy against
-- unit=10000/rate=0.01) rounds to 0, the insert fails and the whole
-- transaction rolls back — fail-closed, by design.
--
-- Idempotent: safe to re-run. APPLY THIS BY HAND in the Supabase SQL editor,
-- AFTER 0095 (it does not redefine anything an earlier migration defines,
-- so ordering against the rest is not load-bearing, but keep the sequence
-- anyway).
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- energy_to_coin_conversions — the CONVERSION LEDGER and the daily-cap source
-- of truth. A row means "this user converted this much energy at this time".
-- The daily cap check inside convert_energy_to_coins sums this table for the
-- Baku day; because every conversion must take the user_energy row lock first,
-- concurrent conversions for one user serialize and the sum is race-free.
--
-- COIN-granting table, so it gets the full treatment: RLS on, select-own
-- only, no insert/update/delete policy at all (writes happen exclusively
-- through the service-role RPC below).
-- ---------------------------------------------------------------------------
create table if not exists energy_to_coin_conversions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references profiles(id) on delete cascade,
  energy_amount  int not null check (energy_amount > 0),
  coins_credited numeric not null check (coins_credited > 0),
  converted_at   timestamptz not null default now()
);

alter table energy_to_coin_conversions enable row level security;

drop policy if exists energy_to_coin_conversions_select_own on energy_to_coin_conversions;
create policy energy_to_coin_conversions_select_own
  on energy_to_coin_conversions for select
  to authenticated
  using (user_id = auth.uid());

grant select, insert on energy_to_coin_conversions to service_role;

create index if not exists energy_to_coin_conversions_user_id_idx on energy_to_coin_conversions(user_id);


-- ---------------------------------------------------------------------------
-- convert_energy_to_coins — the ONE energy->coin conversion, and the only
-- function in the schema that spends energy AND writes user_coins.
--
-- p_unit / p_rate / p_daily_cap are resolved SERVER-SIDE in
-- lib/coins/energyToCoin.ts from app_settings; this RPC never sees a
-- client-supplied unit, rate or cap.
--
-- ### CONCURRENCY: the user_energy LOCK comes BEFORE the daily-cap sum. ###
-- A naive implementation would sum() the ledger and then lock. In READ
-- COMMITTED, T1 and T2 both sum() = 0, both pass the cap check, then serialize
-- on the lock and both convert — the cap is breached. Taking the user_energy
-- row lock FIRST makes the second transaction BLOCK on the first's uncommitted
-- row; when T1 commits, T2 acquires the lock and its fresh-statement sum()
-- sees T1's committed ledger row, so it correctly trips daily_cap_reached.
-- This preserves the repo-wide lock order (user_energy before user_coins)
-- while making the cap check atomic with the debit.
--
-- Fail-closed by construction: any validation failure or the cap/balance check
-- raising aborts the whole transaction, so nothing is partially applied.
-- ---------------------------------------------------------------------------
create or replace function convert_energy_to_coins(
  p_user_id       uuid,
  p_energy_amount int,
  p_unit          numeric,
  p_rate          numeric,
  p_daily_cap     numeric
)
returns jsonb
language plpgsql
as $$
declare
  v_energy     int;
  v_balance    numeric;
  v_coins      numeric;
  v_today_used numeric;
  v_day_start  timestamptz;
begin
  if p_energy_amount is null or p_energy_amount <= 0
     or p_unit is null or p_unit <= 0
     or p_rate is null or p_rate <= 0
     or p_daily_cap is null or p_daily_cap <= 0 then
    raise exception 'invalid_amount';
  end if;

  insert into user_energy (user_id, balance)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;

  -- TAKE THE LOCK FIRST — serializes concurrent conversions for this user (see
  -- header). The row always exists after the insert above.
  select balance into v_energy
    from user_energy
    where user_id = p_user_id
    for update;

  v_day_start := date_trunc('day', now() at time zone 'Asia/Baku') at time zone 'Asia/Baku';

  select coalesce(sum(energy_amount), 0) into v_today_used
    from energy_to_coin_conversions
    where user_id = p_user_id
      and converted_at >= v_day_start;

  if v_today_used + p_energy_amount > p_daily_cap then
    raise exception 'daily_cap_reached';
  end if;

  if coalesce(v_energy, 0) < p_energy_amount then
    raise exception 'insufficient_energy';
  end if;

  update user_energy
    set balance = balance - p_energy_amount,
        updated_at = now()
    where user_id = p_user_id
    returning balance into v_energy;

  v_coins := round(p_energy_amount / p_unit * p_rate, 2);

  insert into user_coins (user_id, balance, daily_limit)
  values (p_user_id, 0, null)
  on conflict (user_id) do nothing;

  select balance into v_balance
    from user_coins
    where user_id = p_user_id
    for update;

  update user_coins
    set balance = balance + v_coins,
        last_reset_at = now()
    where user_id = p_user_id
    returning balance into v_balance;

  insert into energy_to_coin_conversions (user_id, energy_amount, coins_credited)
  values (p_user_id, p_energy_amount, v_coins);

  return jsonb_build_object(
    'balance', v_balance,
    'energy', v_energy,
    'coins_credited', v_coins
  );
end;
$$;

revoke execute on function convert_energy_to_coins(uuid, int, numeric, numeric, numeric) from public, anon, authenticated;
grant execute on function convert_energy_to_coins(uuid, int, numeric, numeric, numeric) to service_role;


-- ===========================================================================
-- app_settings keys (house convention — NO seed rows, TS defaults in code,
-- documented at lib/coins/energyToCoin.ts):
--   energy_to_coin_energy_unit  -- default 100  (energy required per conversion)
--   energy_to_coin_coin_rate    -- default 1.5  (coins paid per unit converted)
--   energy_to_coin_daily_cap    -- default 100  (energy convertible per Baku day)
-- ===========================================================================
