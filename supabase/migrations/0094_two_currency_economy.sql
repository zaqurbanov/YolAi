-- ===========================================================================
-- 0094_two_currency_economy.sql — split the YOL economy into TWO currencies.
--
--   COIN   = PREMIUM currency. Sinks: chat messages (-1/msg), garage cars,
--            VIP plates, lesson unlocks/retries, energy purchases. Income is
--            deliberately scarce (ad watch, referral, the new daily grant,
--            the admin-configured daily chat allowance). Coins are intended
--            to be SOLD for real money later, so every coin-granting path is
--            treated as money-equivalent and must survive an attacker who can
--            mint unlimited free accounts (email confirmation is disabled).
--
--   ENERGY = GAMEPLAY currency. Powers every game. NOT the official exam —
--            exam entry is coin-priced (see the OFFICIAL EXAM section below
--            for why that is still invariant-safe).
--
-- ###########################################################################
-- ## THE INVARIANT: ENERGY MUST NEVER BE CONVERTIBLE BACK INTO COINS,      ##
-- ## DIRECTLY OR INDIRECTLY.                                              ##
-- ##                                                                      ##
-- ## COIN -> ENERGY is allowed and intentional (purchase_energy, 0072) —  ##
-- ## it is a coin SINK. ENERGY -> COIN must not exist in ANY form: no RPC ##
-- ## may credit user_coins on a path that spends user_energy, and no game ##
-- ## settled with energy may pay out in coins. Before adding ANY new RPC  ##
-- ## that touches user_coins, ask: can a user reach this by spending      ##
-- ## energy? If yes, it is forbidden.                                     ##
-- ##                                                                      ##
-- ## WHY: this dissolves the farming loop that existed before this        ##
-- ## migration — 5 coins bought 10 energy, and 10 energy fed the          ##
-- ## sign-speed game for up to 20 coins/day. A round trip that ends with  ##
-- ## more coins than it started with is a coin printer, and coins are     ##
-- ## money.                                                               ##
-- ###########################################################################
--
-- WHAT CHANGES (currency retarget — amounts themselves are unchanged, they
-- just denominate energy now, and stay admin-tunable via the SAME
-- app_settings keys so nothing has to be re-configured):
--   daily quiz + streak milestones .. coins -> ENERGY
--   wheel of fortune ................ coins -> ENERGY
--   daily chest (quests) ............ coins -> ENERGY
--   sign speed ...................... coins -> ENERGY
--   XO win .......................... coins -> ENERGY
--   official exam entry ............. coins OR energy -> COIN ONLY, priced by
--                                     exam_coin_price (admin-tunable)
--   ad watch / referral / chat ...... unchanged (still coins)
--   NEW: apply_daily_grant .......... AUTOMATIC once-per-Baku-day top-up of
--                                     BOTH balances to their configured FLOOR
--
-- ###########################################################################
-- ## THE DAILY GRANT IS A FLOOR, NOT AN INCREMENT.                         ##
-- ##                                                                       ##
-- ## Owner's requirement: "əgər istifadəçinin 6 coini varsa bu zaman 3     ##
-- ## coin verilmir, yalnız limitdən az olanda limit qədər coini olur."     ##
-- ##                                                                       ##
-- ## For BOTH currencies, once per Baku day:                               ##
-- ##   balance <  floor  ->  credit exactly (floor - balance)              ##
-- ##   balance >= floor  ->  credit NOTHING, and never reduce the surplus  ##
-- ##                                                                       ##
-- ## There is NO claim button and no claim RPC. The top-up fires           ##
-- ## automatically on the first server-side read of the user's balances    ##
-- ## each day (lib/chat/coins.ts, lib/coins/dailyGrant.ts).                ##
-- ###########################################################################
--
-- WHY apply_daily_grant REPLACED THE ADDITIVE claim_daily_grant: this file
-- originally shipped a user-initiated "Günlük hədiyyə" that ADDED 3 coins on
-- top of whatever the user already held, alongside the legacy floor-up that
-- lived inside check_and_reserve_coins. That was two independent recurring
-- coin incomes with two different shapes. There is now exactly ONE mechanism,
-- with floor semantics, and it owns both currencies. The 3-coin
-- `daily_grant_coins` setting is gone; the coin floor is the pre-existing,
-- admin-exposed `daily_coin_grant` key (default 10).
--
-- STRUCTURAL FIX — grant_daily_energy no longer RESETS the balance.
-- The 0067/0070 definition did `balance = p_daily_grant` on the first call of
-- a new Baku day, i.e. unused energy was wiped. That was harmless while energy
-- was purely an allowance, but it is fatal now that games PAY energy: the
-- reset would delete everything a player earned. It is now a FLOOR top-up
-- (`balance = greatest(balance, p_daily_grant)`), still idempotent per Baku
-- day via last_grant_date so it cannot be spammed to refill. A player sitting
-- at 25 energy earned from games is above the floor and loses nothing.
--   * energy_purchase_max_balance stays a PURCHASE-time guard only. Earned
--     energy is deliberately NOT capped by it — capping earnings would silently
--     void a player's winnings, and the earning side is already bounded by the
--     per-game daily caps listed below.
--   * SUPERSEDES 0072_energy_purchase.sql's header, which states "purchased
--     energy does NOT carry over ... do NOT 'fix' this into an accumulating
--     balance across days". That instruction was correct while energy was a
--     pure allowance and is now obsolete: energy accumulates. purchase_energy
--     itself is unchanged and still safe, because the stockpiling it warned
--     about is bounded by energy_purchase_max_balance at purchase time and,
--     more importantly, stockpiled energy can no longer be turned into coins.
--
-- TOTAL DAILY ENERGY INCOME IS PROVABLY BOUNDED (per user, per Baku day) —
-- every energy source has a server-enforced daily bound. NOTE the daily grant
-- line: as a FLOOR it contributes at most game_daily_energy (10) of NEW energy
-- per day, and only to a user who ended the previous day below 10 — a player
-- who is actively earning gets 0 from it. The worst case below therefore
-- assumes a user who spends to 0 every night:
--   daily grant ....... game_daily_energy (10)      once/day via user_energy.last_grant_date
--                                                   AND capped by greatest(), so <= 10
--   daily quiz ........ daily_quiz_reward (3)       once/day via unique(user_id, claim_date)
--   streak milestone .. streak_milestone_bonuses    at most one milestone/day, max 75 (day 30)
--   wheel ............. max wheel_prizes value (20) once/day via unique(user_id, spin_date)
--   daily chest ....... daily_chest_reward (10)     once/day via daily_quest_claims.chest_claimed
--   XO ................ tictactoe_win_reward (2) x tictactoe_daily_win_cap (3) = 6
--   sign speed ........ sign_speed_daily_reward_cap (20)
--   => 10 + 3 + 75 + 20 + 10 + 6 + 20 = 144 energy/day absolute worst case
--      (69/day on a normal, non-milestone day) — unchanged as an upper bound,
--      but now unreachable in practice by anyone who already holds >= 10.
-- Games ARE net-positive in energy for a skilled player. That is a deliberate
-- product decision and it is safe ONLY because of the caps above AND because
-- energy can never become coins.
--
-- MAXIMUM RECURRING DAILY COIN INCOME (per user, per Baku day):
--   daily floor top-up  at most daily_coin_grant (10), and 0 for anyone
--                       already at/above the floor
--   ad watch            ad_watch_reward x ad_watch_daily_max
--   referral            one-off per referred user, not recurring
--   => the recurring coin ceiling is the floor itself (10) plus ad watch.
--   The old "10 + 3" double income is gone: there is no additive 3-coin claim.
--
-- BALANCE SEMANTICS IN THE RETURNED JSON: every converted RPC keeps returning
-- 'balance' as the user's COIN balance (a plain, unlocked read — never
-- mutated on these paths) and adds 'energy' for the new energy balance. That
-- way the frontend's coin meter keeps reading the field it always read, and
-- the energy meter reads the new one. `reward` on a converted RPC now means
-- ENERGY.
--
-- LOCK ORDER (unchanged, must be preserved): user_energy FIRST, user_coins
-- SECOND — matches purchase_energy/settle_tictactoe/start_sign_speed_round.
-- The converted RPCs only ever READ user_coins (no lock), so they cannot
-- deadlock against it.
--
-- NO DATA MIGRATION: existing user_coins.balance values are untouched. Coins
-- users already hold carry over as-is. Nobody's surplus is ever clawed back —
-- greatest() only ever raises a balance.
--
-- check_and_reserve_coins IS ALSO REDEFINED HERE (it is defined in 0040 and
-- redefined in 0070). It used to contain the OTHER daily grant — the
-- `if v_last_reset_at < v_day_start then balance := greatest(balance, limit)`
-- block. That block's SEMANTICS are what we adopted above, but it must not
-- survive as a SECOND independent grant firing on a different marker
-- (user_coins.last_reset_at) from apply_daily_grant's ledger row. It is moved
-- into apply_daily_grant and check_and_reserve_coins becomes a pure
-- affordability check.
--
-- Idempotent: safe to re-run. APPLY THIS BY HAND in the Supabase SQL editor,
-- AFTER 0082-0093 (it create-or-replaces functions those files define —
-- notably start_exam_session from 0082, settle_sign_speed_round from 0088 and
-- claim_daily_chest from 0085. Running 0094 before them would let the older
-- file overwrite this one's definitions and silently restore coin payouts).
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- credit_energy — the ONLY way energy is credited outside grant_daily_energy.
-- Rounds to int (user_energy.balance is int; reward amounts are numeric because
-- app_settings values and garage perk multipliers can be fractional) and floors
-- at 0, so a misconfigured negative setting can never debit energy here.
-- Deliberately has NO inverse: nothing in this schema converts energy to coins.
-- ---------------------------------------------------------------------------
create or replace function credit_energy(p_user_id uuid, p_amount numeric)
returns int
language plpgsql
as $$
declare
  v_amount  int := greatest(0, round(coalesce(p_amount, 0)))::int;
  v_balance int;
begin
  insert into user_energy (user_id, balance)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;

  update user_energy
    set balance = balance + v_amount,
        updated_at = now()
    where user_id = p_user_id
    returning balance into v_balance;

  return v_balance;
end;
$$;

revoke execute on function credit_energy(uuid, numeric) from public, anon, authenticated;
grant execute on function credit_energy(uuid, numeric) to service_role;

grant select, insert, update on user_energy to service_role;


-- ---------------------------------------------------------------------------
-- grant_daily_energy — WAS a reset (`balance = p_daily_grant`), IS NOW a
-- once-per-Baku-day top-up TO A FLOOR (`balance = greatest(balance, grant)`).
-- Everything else (idempotency marker, lock, seeding insert, return value) is
-- the 0070 definition unchanged. See the header for why the reset had to go
-- and why the floor — not an increment — is the correct shape.
--
-- The seeding insert already seeds `balance = v_grant`, which IS the floor for
-- a brand-new row, so it needs no change.
--
-- Idempotency: last_grant_date is written in the SAME update that applies the
-- floor, under the `for update` lock taken just above, so two concurrent
-- callers serialize and only one of them observes `v_last < v_today`. The
-- greatest() makes a second application harmless anyway, but the date guard is
-- what stops a user who spends down to 0 mid-day from being refilled.
-- ---------------------------------------------------------------------------
create or replace function grant_daily_energy(p_user_id uuid, p_daily_grant int)
returns int
language plpgsql
as $$
declare
  v_balance int;
  v_last    date;
  v_grant   int := greatest(0, coalesce(p_daily_grant, 0));
  v_today   date := (now() at time zone 'Asia/Baku')::date;
begin
  insert into user_energy (user_id, balance, last_grant_date)
  values (p_user_id, v_grant, v_today)
  on conflict (user_id) do nothing;

  select balance, last_grant_date into v_balance, v_last
    from user_energy
    where user_id = p_user_id
    for update;

  if v_last is null or v_last < v_today then
    update user_energy
      set balance = greatest(balance, v_grant),
          last_grant_date = v_today,
          updated_at = now()
      where user_id = p_user_id
      returning balance into v_balance;
  end if;

  return v_balance;
end;
$$;

revoke execute on function grant_daily_energy(uuid, int) from public, anon, authenticated;
grant execute on function grant_daily_energy(uuid, int) to service_role;


-- ===========================================================================
-- NEW: the automatic daily grant — tops BOTH balances up to their floor, once
-- per Baku day, with no user action.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- daily_grant_claims — the TOP-UP LEDGER and the concurrency guard.
-- (Named "claims" for history; nothing is claimed any more. A row means "the
-- automatic top-up for this user on this Baku day has already run", and
-- coins/energy record how much was ACTUALLY added, which is legitimately 0
-- when the user was already at or above the floor.)
--
-- unique(user_id, grant_date) on the BAKU date is what makes a repeated or
-- concurrent call impossible to pay twice: apply_daily_grant INSERTS HERE
-- FIRST and only credits coins if that insert succeeded.
--
-- This is a COIN-granting table, so it gets the full treatment: RLS on,
-- select-own only, no insert/update/delete policy at all (writes happen
-- exclusively through the service-role RPC below).
-- ---------------------------------------------------------------------------
create table if not exists daily_grant_claims (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  grant_date date not null,
  coins      numeric(10,2) not null default 0 check (coins >= 0),
  energy     int not null default 0 check (energy >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, grant_date)
);

alter table daily_grant_claims enable row level security;

drop policy if exists daily_grant_claims_select_own on daily_grant_claims;
create policy daily_grant_claims_select_own
  on daily_grant_claims for select
  to authenticated
  using (user_id = auth.uid());

grant select, insert, update on daily_grant_claims to service_role;

create index if not exists daily_grant_claims_user_id_idx on daily_grant_claims(user_id);

-- ---------------------------------------------------------------------------
-- apply_daily_grant — the ONE automatic daily top-up. Raises the coin balance
-- to p_coin_floor and the energy balance to p_energy_floor, once per Baku day,
-- never lowering either. Called on READ paths (every balance read), so it is a
-- silent no-op after the first call of the day — it must NOT raise
-- 'already_claimed' or any other error on the repeat path.
--
-- p_coin_floor / p_energy_floor are resolved server-side in
-- lib/coins/dailyGrant.ts from app_settings; this RPC never sees a
-- client-supplied amount. The per-user override user_coins.daily_limit still
-- wins over p_coin_floor when set (same coalesce() the old
-- check_and_reserve_coins used), so per-user limits keep working AND the
-- transfer_coins "transferable = balance - daily_limit" reserve stays coherent.
--
-- ### THE CRITICAL PROPERTY: the LEDGER ROW is the gate, not the balance. ###
-- `balance < floor` is NEVER on its own sufficient to top up. A user who
-- receives the floor at 00:05 and spends it all by 00:10 stays at 0 for the
-- rest of the day, because daily_grant_claims already holds their
-- (user_id, today) row. This is the whole point of the table.
--
-- ### CONCURRENCY: two simultaneous requests cannot double-credit. ###
-- T1 and T2 both call this for the same user on the same day, no ledger row
-- yet. Both attempt the insert. Postgres' unique index on
-- (user_id, grant_date) makes the SECOND inserter BLOCK on the first one's
-- uncommitted tuple — it does not see "no row" and proceed. When T1 commits,
-- T2's insert raises unique_violation; when T1 rolls back, T2's insert
-- succeeds. Exactly one transaction ever owns the row, and only the owner runs
-- the coin update. The plpgsql `exception when unique_violation` block is a
-- SUBTRANSACTION, so catching it rolls back only the failed insert and the
-- function continues — which is required, because the energy half must still
-- run (see below). The coin update additionally takes `for update` on the
-- user_coins row, so the read-then-greatest() is not itself racy against a
-- concurrent spend.
--
-- ### ENERGY IS NOT GATED BY THE COIN LEDGER ROW. ###
-- grant_daily_energy carries its OWN once-per-Baku-day marker
-- (user_energy.last_grant_date) and is the same lazy top-up the games pages
-- already trigger. It is therefore called UNCONDITIONALLY here, outside
-- the unique_violation branch: if the coin insert lost the race, energy may
-- still be owed (e.g. the row was written by a path that ran before the energy
-- row existed). Double-granting energy is impossible regardless — its own date
-- marker plus greatest() both prevent it. The recorded 'energy' is the ACTUAL
-- delta, never an assumed amount.
--
-- LOCK ORDER: daily_grant_claims -> user_energy -> user_coins. The
-- energy-before-coins suffix matches every other RPC in this schema
-- (purchase_energy, settle_tictactoe, start_sign_speed_round), and nothing
-- else in the schema writes daily_grant_claims, so the added prefix cannot
-- deadlock against anything.
-- ---------------------------------------------------------------------------
create or replace function apply_daily_grant(
  p_user_id      uuid,
  p_coin_floor   numeric,
  p_energy_floor int
)
returns jsonb
language plpgsql
as $$
declare
  v_today          date    := (now() at time zone 'Asia/Baku')::date;
  v_coin_floor     numeric := greatest(0, coalesce(p_coin_floor, 0));
  v_energy_floor   int     := greatest(0, coalesce(p_energy_floor, 0));
  v_owns_today     boolean := true;
  v_coin_before    numeric;
  v_coin_balance   numeric;
  v_coins_granted  numeric := 0;
  v_daily_limit    numeric;
  v_effective_floor numeric;
  v_energy_before  int;
  v_energy_after   int;
  v_energy_granted int := 0;
begin
  -- (1) Take the day. Losing this race means the top-up already ran today.
  begin
    insert into daily_grant_claims (user_id, grant_date, coins, energy)
    values (p_user_id, v_today, 0, 0);
  exception
    when unique_violation then
      v_owns_today := false;
  end;

  -- (2) Energy first — repo-wide lock order. Unconditional; see header.
  select balance into v_energy_before from user_energy where user_id = p_user_id;
  v_energy_after := grant_daily_energy(p_user_id, v_energy_floor);
  v_energy_granted := greatest(0, v_energy_after - coalesce(v_energy_before, 0));

  -- (3) Coins. Seeded at 0 — the greatest() below is the single place the
  -- floor is ever applied, so a brand-new row cannot be granted twice.
  insert into user_coins (user_id, balance, daily_limit)
  values (p_user_id, 0, null)
  on conflict (user_id) do nothing;

  if v_owns_today then
    select uc.balance, uc.daily_limit
      into v_coin_before, v_daily_limit
      from user_coins uc
      where uc.user_id = p_user_id
      for update;

    v_effective_floor := coalesce(v_daily_limit, v_coin_floor);

    update user_coins uc
      set balance = greatest(uc.balance, v_effective_floor),
          last_reset_at = now()
      where uc.user_id = p_user_id
      returning uc.balance into v_coin_balance;

    v_coins_granted := greatest(0, v_coin_balance - v_coin_before);
  else
    select uc.balance into v_coin_balance
      from user_coins uc
      where uc.user_id = p_user_id;
  end if;

  -- Accumulate rather than overwrite: the losing transaction may still be the
  -- one that applied the energy delta.
  if v_coins_granted > 0 or v_energy_granted > 0 then
    update daily_grant_claims dgc
      set coins  = dgc.coins + v_coins_granted,
          energy = dgc.energy + v_energy_granted
      where dgc.user_id = p_user_id and dgc.grant_date = v_today;
  end if;

  return jsonb_build_object(
    'coinsGranted', v_coins_granted,
    'energyGranted', v_energy_granted,
    'balance', coalesce(v_coin_balance, 0),
    'energy', coalesce(v_energy_after, 0),
    'applied', true
  );
end;
$$;

revoke execute on function apply_daily_grant(uuid, numeric, int) from public, anon, authenticated;
grant execute on function apply_daily_grant(uuid, numeric, int) to service_role;

-- The additive, user-initiated predecessor. Dropped so no code path and no
-- stale PostgREST schema cache can reach it.
drop function if exists claim_daily_grant(uuid, numeric, int);

grant select, insert, update on user_coins to service_role;


-- ---------------------------------------------------------------------------
-- check_and_reserve_coins (was 0040, redefined 0070) — NOW A PURE
-- AFFORDABILITY CHECK. The daily floor-up block it used to carry
--
--   if v_last_reset_at < v_day_start then
--     v_balance := greatest(v_balance, v_effective_limit); ...
--
-- has MOVED into apply_daily_grant. Two recurring grants keyed on two
-- different markers (user_coins.last_reset_at here vs the daily_grant_claims
-- row there) would fight: this one would re-top-up a user who had already
-- received and spent the day's floor, defeating the whole point of the ledger.
--
-- SIGNATURE CHANGE: p_default_daily_limit is gone — this function no longer
-- has an opinion about the floor. Postgres cannot drop an argument via
-- create-or-replace, so the 3-arg version is dropped explicitly.
--
-- The seeding insert now seeds balance 0, not the limit, for the same reason:
-- apply_daily_grant is the only thing that may put coins into a row.
-- lib/chat/coins.ts calls applyDailyGrant() BEFORE this, so a first-time user
-- is already at the floor by the time affordability is evaluated.
-- ---------------------------------------------------------------------------
drop function if exists check_and_reserve_coins(uuid, numeric, numeric);

-- `create OR REPLACE` — see the note on start_exam_session below: re-running
-- this file must not fail with 42723 on the new signature.
create or replace function check_and_reserve_coins(
  p_user_id uuid,
  p_price   numeric
)
returns table (
  allowed     boolean,
  balance     numeric,
  daily_limit numeric
)
language plpgsql
as $$
declare
  v_balance     numeric;
  v_daily_limit numeric;
begin
  insert into user_coins (user_id, balance, daily_limit)
  values (p_user_id, 0, null)
  on conflict (user_id) do nothing;

  select uc.balance, uc.daily_limit
    into v_balance, v_daily_limit
    from user_coins uc
    where uc.user_id = p_user_id;

  return query select (v_balance >= p_price), v_balance, v_daily_limit;
end;
$$;

revoke execute on function check_and_reserve_coins(uuid, numeric) from public, anon, authenticated;
grant execute on function check_and_reserve_coins(uuid, numeric) to service_role;


-- ===========================================================================
-- CURRENCY RETARGET: every game/quiz reward below now credits ENERGY.
-- In each case the ONLY changes from the previous definition are (a) the
-- credit target (credit_energy instead of `update user_coins ... + reward`)
-- and (b) the returned payload gaining 'energy' while 'balance' becomes a
-- plain unlocked READ of the coin balance. All caps, locks, uniqueness
-- guards, attempt-recording and validation are byte-for-byte the originals.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- claim_daily_quiz_reward (legacy pre-0064 fallback path; was 0070, 3-arg).
-- Return type changes numeric -> jsonb, so it must be dropped first.
-- STILL RECORDS THE ATTEMPT REGARDLESS OF CORRECTNESS (reward 0 on a wrong
-- answer) — that row is what makes the quiz un-brute-forceable. Do not
-- "optimize" the wrong-answer path into an early return.
-- ---------------------------------------------------------------------------
drop function if exists claim_daily_quiz_reward(uuid, numeric, boolean);

-- `create OR REPLACE` — re-run safety, see start_exam_session below.
create or replace function claim_daily_quiz_reward(
  p_user_id uuid,
  p_reward numeric,
  p_is_correct boolean
)
returns jsonb
language plpgsql
as $$
declare
  v_energy   int;
  v_balance  numeric;
  v_credited numeric;
  v_today    date := (now() at time zone 'Asia/Baku')::date;
begin
  v_credited := case when p_is_correct then p_reward else 0 end;

  begin
    insert into daily_quiz_claims (user_id, claim_date, reward)
    values (p_user_id, v_today, v_credited);
  exception
    when unique_violation then
      raise exception 'already_claimed';
  end;

  v_energy := credit_energy(p_user_id, v_credited);
  v_balance := coalesce((select uc.balance from user_coins uc where uc.user_id = p_user_id), 0);

  return jsonb_build_object('balance', v_balance, 'energy', v_energy, 'reward', v_credited);
end;
$$;

revoke execute on function claim_daily_quiz_reward(uuid, numeric, boolean) from public, anon, authenticated;
grant execute on function claim_daily_quiz_reward(uuid, numeric, boolean) to service_role;


-- ---------------------------------------------------------------------------
-- claim_daily_quiz_with_streak (was 0070) — base reward AND streak milestone
-- bonuses now pay ENERGY. Streak arithmetic, the Baku-day claim guard and the
-- record-the-attempt-regardless-of-correctness rule are unchanged.
-- ---------------------------------------------------------------------------
create or replace function claim_daily_quiz_with_streak(
  p_user_id uuid,
  p_reward numeric,
  p_is_correct boolean,
  p_streak_bonuses jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_energy          int;
  v_balance         numeric;
  v_credited        numeric;
  v_current_streak  int := 0;
  v_longest_streak  int := 0;
  v_last_date       date;
  v_milestone_bonus numeric := 0;
  v_today           date := (now() at time zone 'Asia/Baku')::date;
begin
  v_credited := case when p_is_correct then p_reward else 0 end;

  begin
    insert into daily_quiz_claims (user_id, claim_date, reward)
    values (p_user_id, v_today, v_credited);
  exception
    when unique_violation then
      raise exception 'already_claimed';
  end;

  if p_is_correct then
    select current_streak, longest_streak, last_claim_date
      into v_current_streak, v_longest_streak, v_last_date
      from user_streaks
      where user_id = p_user_id;

    if v_last_date = v_today then
      null;
    elsif v_last_date = v_today - 1 then
      v_current_streak := coalesce(v_current_streak, 0) + 1;
    else
      v_current_streak := 1;
    end if;

    v_longest_streak := greatest(coalesce(v_longest_streak, 0), v_current_streak);

    insert into user_streaks (user_id, current_streak, longest_streak, last_claim_date, updated_at)
    values (p_user_id, v_current_streak, v_longest_streak, v_today, now())
    on conflict (user_id) do update
      set current_streak = excluded.current_streak,
          longest_streak = excluded.longest_streak,
          last_claim_date = excluded.last_claim_date,
          updated_at = excluded.updated_at;

    if p_streak_bonuses ? v_current_streak::text then
      v_milestone_bonus := coalesce((p_streak_bonuses ->> v_current_streak::text)::numeric, 0);
      if v_milestone_bonus < 0 then
        v_milestone_bonus := 0;
      end if;
    end if;
  end if;

  v_energy := credit_energy(p_user_id, v_credited + v_milestone_bonus);
  v_balance := coalesce((select uc.balance from user_coins uc where uc.user_id = p_user_id), 0);

  return jsonb_build_object(
    'balance', v_balance,
    'energy', v_energy,
    'current_streak', v_current_streak,
    'longest_streak', v_longest_streak,
    'milestone_bonus', v_milestone_bonus
  );
end;
$$;

revoke execute on function claim_daily_quiz_with_streak(uuid, numeric, boolean, jsonb) from public, anon, authenticated;
grant execute on function claim_daily_quiz_with_streak(uuid, numeric, boolean, jsonb) to service_role;


-- ---------------------------------------------------------------------------
-- claim_wheel_spin (was 0070) — the prize is now ENERGY. Return type changes
-- numeric -> jsonb, so drop first. The one-spin-per-Baku-day guard is still
-- the unique(user_id, spin_date) violation, and the prize is still bounded by
-- the server-computed p_max_prize.
-- ---------------------------------------------------------------------------
drop function if exists claim_wheel_spin(uuid, numeric, numeric);

-- `create OR REPLACE` — re-run safety, see start_exam_session below.
create or replace function claim_wheel_spin(p_user_id uuid, p_prize numeric, p_max_prize numeric)
returns jsonb
language plpgsql
as $$
declare
  v_energy  int;
  v_balance numeric;
begin
  if p_prize is null or p_prize < 0 then
    raise exception 'invalid_prize';
  end if;
  if p_max_prize is null or p_prize > p_max_prize then
    raise exception 'prize_exceeds_max';
  end if;

  begin
    insert into wheel_spins (user_id, spin_date, prize)
    values (p_user_id, (now() at time zone 'Asia/Baku')::date, p_prize);
  exception
    when unique_violation then
      raise exception 'already_spun';
  end;

  v_energy := credit_energy(p_user_id, p_prize);
  v_balance := coalesce((select uc.balance from user_coins uc where uc.user_id = p_user_id), 0);

  return jsonb_build_object('balance', v_balance, 'energy', v_energy, 'reward', p_prize);
end;
$$;

revoke execute on function claim_wheel_spin(uuid, numeric, numeric) from public, anon, authenticated;
grant execute on function claim_wheel_spin(uuid, numeric, numeric) to service_role;


-- ---------------------------------------------------------------------------
-- settle_tictactoe (was 0070) — a win now pays ENERGY, not coins. The game
-- still COSTS energy to play, so a win is net +1 energy at the default
-- 2-reward / 1-cost, bounded at tictactoe_daily_win_cap rewarded wins per
-- Baku day. user_coins is no longer written or locked here at all — only read.
-- ---------------------------------------------------------------------------
create or replace function settle_tictactoe(
  p_user_id              uuid,
  p_outcome              text,
  p_win_reward           numeric,
  p_daily_energy_grant   int,
  p_energy_cost          int,
  p_daily_win_reward_cap int
)
returns jsonb
language plpgsql
as $$
declare
  v_energy      int;
  v_balance     numeric;
  v_day_start   timestamptz;
  v_win_count   int;
  v_reward      numeric := 0;
begin
  if p_outcome not in ('win', 'draw', 'loss') then
    raise exception 'invalid_outcome';
  end if;
  if p_energy_cost is null or p_energy_cost <= 0 then
    raise exception 'invalid_energy_cost';
  end if;

  perform grant_daily_energy(p_user_id, p_daily_energy_grant);

  update user_energy
    set balance = balance - p_energy_cost,
        updated_at = now()
    where user_id = p_user_id
      and balance >= p_energy_cost
    returning balance into v_energy;

  if v_energy is null then
    raise exception 'no_energy';
  end if;

  if p_outcome = 'win' and p_win_reward > 0 and p_daily_win_reward_cap > 0 then
    v_day_start := date_trunc('day', now() at time zone 'Asia/Baku') at time zone 'Asia/Baku';
    select count(*) into v_win_count
      from coin_game_plays
      where user_id = p_user_id
        and game = 'tictactoe'
        and outcome = 'win'
        and payout > 0
        and created_at >= v_day_start;

    if v_win_count < p_daily_win_reward_cap then
      v_reward := round(p_win_reward);
    end if;
  end if;

  if v_reward > 0 then
    v_energy := credit_energy(p_user_id, v_reward);
  end if;

  -- coin_game_plays.payout now records the ENERGY paid out. It stays the
  -- ledger the daily win cap counts, so the column keeps its meaning as
  -- "was this win rewarded", just in the new currency.
  insert into coin_game_plays (user_id, game, bet, outcome, payout)
  values (p_user_id, 'tictactoe', 0, p_outcome, v_reward);

  v_balance := coalesce((select uc.balance from user_coins uc where uc.user_id = p_user_id), 0);

  return jsonb_build_object('balance', v_balance, 'energy', v_energy, 'reward', v_reward);
end;
$$;

revoke execute on function settle_tictactoe(uuid, text, numeric, int, int, int) from public, anon, authenticated;
grant execute on function settle_tictactoe(uuid, text, numeric, int, int, int) to service_role;

grant select, insert on coin_game_plays to service_role;


-- ---------------------------------------------------------------------------
-- settle_sign_speed_round (was 0088) — per-correct reward now pays ENERGY.
-- This is the RPC that made the old farming loop profitable; with the payout
-- moved to energy the loop is closed by construction. Everything else — the
-- session lock, the atomic used-flip double-submit guard, the TTL check, the
-- per-question grading and the sign_speed_daily_reward_cap clamp — is the
-- 0088 definition verbatim. reward_credited still stores the amount, which is
-- what the daily cap sums, now denominated in energy.
-- ---------------------------------------------------------------------------
create or replace function settle_sign_speed_round(
  p_user_id              uuid,
  p_session_id           uuid,
  p_answers              int[],
  p_per_correct_reward   numeric,
  p_daily_reward_cap     numeric,
  p_session_ttl_seconds  int
)
returns jsonb
language plpgsql
as $$
declare
  v_question_codes   text[];
  v_correct_indices  smallint[];
  v_issued_at        timestamptz;
  v_correct_count    int := 0;
  v_correct_flags    boolean[] := array[]::boolean[];
  v_reward           numeric := 0;
  v_already_credited numeric;
  v_day_start        timestamptz := date_trunc('day', now() at time zone 'Asia/Baku') at time zone 'Asia/Baku';
  v_energy           int;
  v_balance          numeric;
  i                  int;
begin
  if p_answers is null or array_length(p_answers, 1) <> 10 then
    raise exception 'invalid_answers';
  end if;
  for i in 1..10 loop
    if p_answers[i] is null or p_answers[i] < 0 or p_answers[i] > 3 then
      raise exception 'invalid_answers';
    end if;
  end loop;

  perform 1
    from sign_speed_sessions
    where id = p_session_id and user_id = p_user_id
    for update;

  if not found then
    raise exception 'session_not_found';
  end if;

  update sign_speed_sessions
    set used = true
    where id = p_session_id
      and user_id = p_user_id
      and used = false
    returning question_codes, correct_indices, issued_at
    into v_question_codes, v_correct_indices, v_issued_at;

  if not found then
    raise exception 'already_used';
  end if;

  if v_issued_at < now() - make_interval(secs => p_session_ttl_seconds) then
    raise exception 'session_expired';
  end if;

  for i in 1..10 loop
    v_correct_flags := array_append(v_correct_flags, p_answers[i] = v_correct_indices[i]);
    if p_answers[i] = v_correct_indices[i] then
      v_correct_count := v_correct_count + 1;
    end if;
  end loop;

  v_reward := v_correct_count * p_per_correct_reward;

  select coalesce(sum(s.reward_credited), 0) into v_already_credited
    from sign_speed_sessions s
    where s.user_id = p_user_id
      and s.used = true
      and s.issued_at >= v_day_start;

  if v_already_credited + v_reward > p_daily_reward_cap then
    v_reward := greatest(0, p_daily_reward_cap - v_already_credited);
  end if;

  v_reward := round(v_reward);

  v_energy := credit_energy(p_user_id, v_reward);
  v_balance := coalesce((select uc.balance from user_coins uc where uc.user_id = p_user_id), 0);

  update sign_speed_sessions
    set reward_credited = v_reward
    where id = p_session_id;

  return jsonb_build_object(
    'balance', v_balance,
    'energy', v_energy,
    'correctCount', v_correct_count,
    'correctFlags', v_correct_flags,
    'reward', v_reward
  );
end;
$$;

revoke execute on function settle_sign_speed_round(uuid, uuid, int[], numeric, numeric, int) from public, anon, authenticated;
grant execute on function settle_sign_speed_round(uuid, uuid, int[], numeric, numeric, int) to service_role;


-- ---------------------------------------------------------------------------
-- claim_daily_chest (was 0085) — the chest now pays ENERGY. The completion
-- check (fixed CASE over exactly the 8 allowed pool keys, unknown key = NOT
-- done) and the once-per-Baku-day chest_claimed guard under a row lock are the
-- 0085 definitions verbatim. That flag IS the chest's per-day bound.
-- ---------------------------------------------------------------------------
create or replace function claim_daily_chest(
  p_user_id      uuid,
  p_mission_keys text[],
  p_reward       numeric
)
returns jsonb
language plpgsql
as $$
declare
  v_day_start       timestamptz := date_trunc('day', now() at time zone 'Asia/Baku') at time zone 'Asia/Baku';
  v_today           date := (now() at time zone 'Asia/Baku')::date;
  v_chat_count      int;
  v_chest_claimed   boolean;
  v_sign_speed_done boolean;
  v_lesson_done     boolean;
  v_xo_done         boolean;
  v_wheel_done      boolean;
  v_daily_quiz_done boolean;
  v_energy          int;
  v_balance         numeric;
  v_key             text;
  v_key_done        boolean;
begin
  insert into daily_quest_claims (user_id, quest_date)
  values (p_user_id, v_today)
  on conflict (user_id, quest_date) do nothing;

  select chat_message_count, chest_claimed
    into v_chat_count, v_chest_claimed
    from daily_quest_claims
    where user_id = p_user_id and quest_date = v_today
    for update;

  if v_chest_claimed then
    raise exception 'already_claimed';
  end if;

  select exists (
    select 1 from sign_speed_sessions
    where user_id = p_user_id and used = true and issued_at >= v_day_start
  ) into v_sign_speed_done;

  select exists (
    select 1 from lesson_attempts
    where user_id = p_user_id and created_at >= v_day_start
  ) into v_lesson_done;

  select exists (
    select 1 from coin_game_plays
    where user_id = p_user_id and game = 'tictactoe' and created_at >= v_day_start
  ) into v_xo_done;

  select exists (
    select 1 from wheel_spins
    where user_id = p_user_id and spin_date = v_today
  ) into v_wheel_done;

  select exists (
    select 1 from daily_quiz_claims
    where user_id = p_user_id and claim_date = v_today
  ) into v_daily_quiz_done;

  foreach v_key in array p_mission_keys loop
    v_key_done := case v_key
      when 'chat_1' then v_chat_count >= 1
      when 'chat_2' then v_chat_count >= 2
      when 'chat_3' then v_chat_count >= 3
      when 'sign_speed' then v_sign_speed_done
      when 'lesson' then v_lesson_done
      when 'xo' then v_xo_done
      when 'wheel' then v_wheel_done
      when 'daily_quiz' then v_daily_quiz_done
      else false
    end;

    if not coalesce(v_key_done, false) then
      raise exception 'quests_incomplete';
    end if;
  end loop;

  v_energy := credit_energy(p_user_id, p_reward);
  v_balance := coalesce((select uc.balance from user_coins uc where uc.user_id = p_user_id), 0);

  update daily_quest_claims
    set chest_claimed = true,
        chest_claimed_at = now(),
        updated_at = now()
    where user_id = p_user_id and quest_date = v_today;

  return jsonb_build_object('balance', v_balance, 'energy', v_energy, 'reward', round(p_reward));
end;
$$;

revoke execute on function claim_daily_chest(uuid, text[], numeric) from public, anon, authenticated;
grant execute on function claim_daily_chest(uuid, text[], numeric) to service_role;


-- ===========================================================================
-- OFFICIAL EXAM — COIN ONLY. The energy entry path is removed end-to-end.
--
-- This REVERSES an earlier revision of this same file, which had made the exam
-- energy-funded. Owner's decision: the exam is a high-value feature and the
-- premium currency is the right price tag for it. Coin previously had only two
-- sinks (chat messages, garage/VIP plates); the exam becomes the third, which
-- matters because coins are meant to be SOLD for real money later — a scarce
-- currency needs somewhere to go.
--
-- THIS DOES NOT BREACH THE INVARIANT. Energy -> coin conversion would require
-- the exam to PAY something, and it pays nothing: settle_exam_session credits
-- neither currency (0082's header: "pure sink, never an earning path"). Money
-- flows one way only — coins in, nothing out.
-- ===========================================================================

-- New sessions are always coin-paid; the column and its check constraint are
-- kept (historical rows may legitimately hold 'energy') but now default to
-- 'coin' and are never written with anything else.
alter table exam_sessions alter column payment_method set default 'coin';

-- ---------------------------------------------------------------------------
-- start_exam_session — SIGNATURE CHANGE: p_payment_method, p_energy_cost and
-- p_daily_energy_grant are gone; a single p_coin_price replaces them.
--
-- Postgres cannot drop arguments via create-or-replace, so BOTH historical
-- signatures are dropped explicitly, in the order they existed:
--   (1) 0082's 7-arg "coin OR energy" chooser;
--   (2) this file's own interim 5-arg energy-only version — which DOES exist
--       in the owner's database from a partial run of this migration. Leaving
--       it in place would let two overloads coexist, and PostgREST would then
--       have to guess which one an RPC call means (or resolve to the stale
--       one), so dropping it is not optional.
--
-- p_coin_price is `numeric` to match user_coins.balance and every other coin
-- price in the schema (check_and_reserve_coins, purchase_energy, garage).
--
-- There is no grant_daily_energy / apply_daily_grant call here any more: the
-- daily top-up is automatic on READ paths (apply_daily_grant, above), so a
-- spend path repeating it would be both redundant and a second place where a
-- grant could fire.
--
-- settle_exam_session is unchanged and still pays nothing: the exam remains a
-- pure sink, never an earning path.
-- ---------------------------------------------------------------------------
drop function if exists start_exam_session(uuid, uuid[], smallint[], text, numeric, int, int);
drop function if exists start_exam_session(uuid, uuid[], smallint[], int, int);

-- `create OR REPLACE`, not bare `create`: on a re-run of this file the NEW
-- 4-arg signature already exists and a bare `create` fails with 42723
-- (duplicate_function). Migrations here are applied by hand and get re-run
-- after a partial failure, so every function in this file must be safe to
-- apply twice.
create or replace function start_exam_session(
  p_user_id             uuid,
  p_question_ids        uuid[],
  p_correct_indices     smallint[],
  p_coin_price          numeric
)
returns jsonb
language plpgsql
as $$
declare
  v_energy   int;
  v_balance  numeric;
  v_session  uuid;
begin
  if p_question_ids is null or array_length(p_question_ids, 1) <> 10 then
    raise exception 'invalid_questions';
  end if;
  if p_correct_indices is null or array_length(p_correct_indices, 1) <> 10 then
    raise exception 'invalid_questions';
  end if;
  -- 0 is a VALID price (admin may make the exam free); only null/negative is a
  -- misconfiguration.
  if p_coin_price is null or p_coin_price < 0 then
    raise exception 'invalid_coin_price';
  end if;

  insert into user_coins (user_id, balance, daily_limit)
  values (p_user_id, 0, null)
  on conflict (user_id) do nothing;

  -- Conditional decrement, same pattern as every other coin sink: the
  -- `balance >= price` predicate is what makes affordability and debit a
  -- single atomic step, so two concurrent starts cannot both pass a check and
  -- then both spend.
  update user_coins
    set balance = balance - p_coin_price
    where user_id = p_user_id
      and balance >= p_coin_price
    returning balance into v_balance;

  if v_balance is null then
    raise exception 'insufficient_coins';
  end if;

  -- Plain UNLOCKED read of the energy balance, for the response's shared
  -- meter only. This path never writes user_energy.
  v_energy := coalesce((select ue.balance from user_energy ue where ue.user_id = p_user_id), 0);

  insert into exam_sessions (user_id, question_ids, correct_indices, payment_method)
  values (p_user_id, p_question_ids, p_correct_indices, 'coin')
  returning id into v_session;

  return jsonb_build_object(
    'sessionId', v_session,
    'balance', v_balance,
    'energy', v_energy
  );
end;
$$;

revoke execute on function start_exam_session(uuid, uuid[], smallint[], numeric) from public, anon, authenticated;
grant execute on function start_exam_session(uuid, uuid[], smallint[], numeric) to service_role;

grant select, insert, update on exam_sessions to service_role;


-- ===========================================================================
-- app_settings keys (house convention — NO seed rows, TS defaults in code).
--
-- THE TWO RECURRING DAILY GRANTS — both are FLOORS, not increments, and both
-- are applied by apply_daily_grant once per Baku day. There is exactly one key
-- per currency; do not add a second.
--   daily_coin_grant             -- default 10  (COIN floor; lib/chat/coins.ts,
--                                   DAILY_COIN_GRANT_SETTING_KEY, admin UI at
--                                   /api/admin/chat-meta. 0 is a VALID value —
--                                   it switches the coin income off. Per-user
--                                   override: user_coins.daily_limit.)
--   game_daily_energy            -- default 10  (ENERGY floor; lib/coins/games.ts,
--                                   plus the Prius garage perk via
--                                   getEffectiveEnergyGrant)
--
-- CHANGED DEFAULT (same key, TS default only — no row to update):
--   referral_bonus_amount        -- default 5 -> 2 (lib/coins/referrals.ts)
--
-- UNCHANGED KEYS THAT NOW DENOMINATE **ENERGY** INSTEAD OF COINS. Deliberately
-- reused rather than duplicated: any override the owner already set stays
-- meaningful, and there is exactly one number per mechanic to tune.
--   daily_quiz_reward            -- default 3   (lib/coins/quiz.ts)
--   streak_milestone_bonuses     -- default {3:5, 7:15, 14:30, 30:75} (lib/coins/quiz.ts)
--   wheel_prizes                 -- default 1..20 weighted segments (lib/coins/wheel.ts)
--   daily_chest_reward           -- default 10  (lib/coins/dailyQuests.ts)
--   sign_speed_per_correct_reward-- default 1   (lib/coins/signSpeed.ts)
--   sign_speed_daily_reward_cap  -- default 20  (lib/coins/signSpeed.ts)
--   tictactoe_win_reward         -- default 2   (lib/coins/games.ts)
--   tictactoe_daily_win_cap      -- default 3   (lib/coins/games.ts)
--
-- STILL COINS (unchanged):
--   chat_message_price, ad_watch_reward*, referral_*, energy_purchase_*,
--   garage/plate prices, lesson unlock/retry prices.
--
-- NEWLY COINS (was energy in an earlier revision of this same file):
--   exam_coin_price              -- default 5 (lib/exam/examPricing.ts). Chosen
--                                   against the coin floor of 10, so the exam
--                                   is affordable twice on a user's first day
--                                   while still costing 5x a chat message.
--                                   0 is a VALID value — a free exam.
--
-- REMOVED FROM USE (key may still exist as a row; nothing reads it anymore):
--   exam_energy_cost             -- the exam's energy entry path no longer
--                                   exists; entry is coin-priced
--   daily_grant_coins            -- the additive 3-coin claim is gone; the coin
--                                   grant is daily_coin_grant, as a floor
-- ===========================================================================
