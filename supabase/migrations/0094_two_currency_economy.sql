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
--   ENERGY = GAMEPLAY currency. Powers every game and the official exam.
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
--   official exam entry ............. coins OR energy -> ENERGY ONLY
--   ad watch / referral / chat ...... unchanged (still coins)
--   NEW: claim_daily_grant .......... 3 coins + the daily energy top-up
--
-- STRUCTURAL FIX — grant_daily_energy no longer RESETS the balance.
-- The 0067/0070 definition did `balance = p_daily_grant` on the first call of
-- a new Baku day, i.e. unused energy was wiped. That was harmless while energy
-- was purely an allowance, but it is fatal now that games PAY energy: the
-- reset would delete everything a player earned. It is now an ADDITIVE top-up
-- (`balance = balance + p_daily_grant`), still idempotent per Baku day via
-- last_grant_date so it cannot be spammed to refill.
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
-- every energy source has a server-enforced daily bound:
--   daily grant ....... game_daily_energy (10)      once/day via user_energy.last_grant_date
--   daily quiz ........ daily_quiz_reward (3)       once/day via unique(user_id, claim_date)
--   streak milestone .. streak_milestone_bonuses    at most one milestone/day, max 75 (day 30)
--   wheel ............. max wheel_prizes value (20) once/day via unique(user_id, spin_date)
--   daily chest ....... daily_chest_reward (10)     once/day via daily_quest_claims.chest_claimed
--   XO ................ tictactoe_win_reward (2) x tictactoe_daily_win_cap (3) = 6
--   sign speed ........ sign_speed_daily_reward_cap (20)
--   => 10 + 3 + 75 + 20 + 10 + 6 + 20 = 144 energy/day absolute worst case
--      (69/day on a normal, non-milestone day).
-- Games ARE net-positive in energy for a skilled player. That is a deliberate
-- product decision and it is safe ONLY because of the caps above AND because
-- energy can never become coins.
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
-- users already hold carry over as-is.
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
-- grant_daily_energy — WAS a reset, IS NOW an additive once-per-Baku-day
-- top-up. Everything else (idempotency marker, lock, return value) is the
-- 0070 definition unchanged. See the header for why the reset had to go.
--
-- Idempotency: last_grant_date is written in the SAME update that adds the
-- grant, under the `for update` lock taken just above, so two concurrent
-- callers serialize and only one of them observes `v_last < v_today`.
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
      set balance = balance + v_grant,
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
-- NEW: the daily grant — 3 coins + the daily energy top-up, once per Baku day.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- daily_grant_claims — the ledger AND the concurrency guard. unique(user_id,
-- grant_date) on the BAKU date is what makes a repeated or concurrent POST
-- impossible to pay twice: claim_daily_grant INSERTS HERE FIRST and only
-- credits after the insert has succeeded, so a unique violation rejects the
-- whole transaction before a single coin moves.
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
-- claim_daily_grant — credits p_coins coins and tops up the daily energy.
--
-- ENERGY IS DELEGATED TO grant_daily_energy ON PURPOSE. It is the SAME
-- once-per-Baku-day top-up the energy meter already triggers lazily, not a
-- second one — otherwise a user who opened the games page before claiming
-- would receive the daily energy twice. The returned 'energy' is therefore the
-- ACTUAL delta applied (0 if the lazy top-up already fired today), never an
-- assumed amount, so the UI cannot claim to have granted energy it didn't.
--
-- p_coins / p_daily_energy_grant are resolved server-side in
-- lib/coins/dailyGrant.ts from app_settings; this RPC never sees a
-- client-supplied amount.
-- ---------------------------------------------------------------------------
create or replace function claim_daily_grant(
  p_user_id            uuid,
  p_coins              numeric,
  p_daily_energy_grant int
)
returns jsonb
language plpgsql
as $$
declare
  v_today          date := (now() at time zone 'Asia/Baku')::date;
  v_coin_balance   numeric;
  v_energy_before  int;
  v_energy_after   int;
  v_energy_granted int;
begin
  if p_coins is null or p_coins < 0 then
    raise exception 'invalid_coins';
  end if;
  if p_daily_energy_grant is null or p_daily_energy_grant < 0 then
    raise exception 'invalid_energy_grant';
  end if;

  -- (1) Claim the day FIRST. Nothing below runs unless this row is ours.
  begin
    insert into daily_grant_claims (user_id, grant_date, coins, energy)
    values (p_user_id, v_today, p_coins, 0);
  exception
    when unique_violation then
      raise exception 'already_claimed';
  end;

  -- (2) Energy before coins — repo-wide lock order.
  select balance into v_energy_before from user_energy where user_id = p_user_id;
  v_energy_after := grant_daily_energy(p_user_id, p_daily_energy_grant);
  v_energy_granted := greatest(0, v_energy_after - coalesce(v_energy_before, 0));

  -- (3) Coins. The insert seeds balance 0, NOT p_coins — the update below is
  -- the single place the grant is applied, so a brand-new row can't be paid
  -- the grant twice.
  insert into user_coins (user_id, balance, daily_limit)
  values (p_user_id, 0, null)
  on conflict (user_id) do nothing;

  update user_coins uc
    set balance = uc.balance + p_coins
    where uc.user_id = p_user_id
    returning uc.balance into v_coin_balance;

  update daily_grant_claims
    set energy = v_energy_granted
    where user_id = p_user_id and grant_date = v_today;

  return jsonb_build_object(
    'coins', p_coins,
    'energyGranted', v_energy_granted,
    'balance', v_coin_balance,
    'energy', v_energy_after
  );
end;
$$;

revoke execute on function claim_daily_grant(uuid, numeric, int) from public, anon, authenticated;
grant execute on function claim_daily_grant(uuid, numeric, int) to service_role;

grant select, insert, update on user_coins to service_role;


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

create function claim_daily_quiz_reward(
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

create function claim_wheel_spin(p_user_id uuid, p_prize numeric, p_max_prize numeric)
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
-- OFFICIAL EXAM — energy only. The coin entry path is removed end-to-end.
-- ===========================================================================

-- New sessions are always energy-paid; the column and its check constraint are
-- kept (historical rows may legitimately hold 'coin') but now default to
-- 'energy' and are never written with anything else.
alter table exam_sessions alter column payment_method set default 'energy';

-- ---------------------------------------------------------------------------
-- start_exam_session — SIGNATURE CHANGE: p_payment_method and p_coin_price are
-- gone. Postgres cannot drop arguments via create-or-replace, so the 7-arg
-- version is dropped explicitly. Entry costs ENERGY, full stop — there is no
-- longer any branch of this function that reads or writes user_coins for
-- payment (it only READS the coin balance for the response's shared meter).
--
-- settle_exam_session is unchanged and still pays nothing: the exam remains a
-- pure sink, never an earning path.
-- ---------------------------------------------------------------------------
drop function if exists start_exam_session(uuid, uuid[], smallint[], text, numeric, int, int);

create function start_exam_session(
  p_user_id             uuid,
  p_question_ids        uuid[],
  p_correct_indices     smallint[],
  p_energy_cost         int,
  p_daily_energy_grant  int
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

  -- Plain read of the coin balance for the response's shared meter. Never a
  -- write: an energy-spending path must not touch user_coins (THE INVARIANT).
  v_balance := coalesce((select uc.balance from user_coins uc where uc.user_id = p_user_id), 0);

  insert into exam_sessions (user_id, question_ids, correct_indices, payment_method)
  values (p_user_id, p_question_ids, p_correct_indices, 'energy')
  returning id into v_session;

  return jsonb_build_object(
    'sessionId', v_session,
    'balance', v_balance,
    'energy', v_energy
  );
end;
$$;

revoke execute on function start_exam_session(uuid, uuid[], smallint[], int, int) from public, anon, authenticated;
grant execute on function start_exam_session(uuid, uuid[], smallint[], int, int) to service_role;

grant select, insert, update on exam_sessions to service_role;


-- ===========================================================================
-- app_settings keys (house convention — NO seed rows, TS defaults in code).
--
-- NEW:
--   daily_grant_coins            -- default 3   (coins paid by claim_daily_grant; lib/coins/dailyGrant.ts)
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
--   game_daily_energy            -- default 10  (lib/coins/games.ts) — now ADDITIVE per Baku day
--
-- STILL COINS (unchanged):
--   chat_message_price, daily_coin_grant, ad_watch_reward*, referral_*,
--   energy_purchase_*, garage/plate prices, lesson unlock/retry prices.
--
-- REMOVED FROM USE (key may still exist as a row; nothing reads it anymore):
--   exam_coin_price              -- the exam's coin entry path no longer exists
-- ===========================================================================
