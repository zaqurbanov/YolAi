-- ===========================================================================
-- 0097 — GÜNDƏLİK MİSSİYALAR / MARAFON SPLIT: missions and chest separate.
-- ===========================================================================
--
-- WHAT CHANGES
--   1. MISSIONS AND CHEST ARE SEPARATE. Previously the chest was the ONLY
--      reward: complete all 3 daily missions, then open the chest once per
--      Baku day (0081/0085/0095). Now each daily mission pays its OWN ENERGY
--      reward the moment it is completed (claim_daily_mission, per-mission
--      amount from the NEW `daily_mission_reward` app_settings key), and the
--      chest is FREE — no mission gate at all, still one open per user per
--      Baku day. The `quests_incomplete` error is GONE from the schema.
--   2. THE CHEST IS STREAK-DAY-INDEXED, NOT WEEKDAY-INDEXED. 0095's
--      weekly_marathon_rewards schedule was anchored to the Baku weekday
--      (Monday..Sunday). From this migration on the same 7-slot jsonb array
--      is indexed by the user's PER-USER STREAK DAY: day 1 = the first Baku
--      day the user opens the chest, day 7 = COINS, a missed day RESETS the
--      streak to day 1, and a completed day-7 cycle restarts at day 1 of a
--      new cycle. `claim_daily_chest` counts consecutive chest_claimed=true
--      days ending YESTERDAY and maps the raw run length onto the cycle with
--      `v_streak_day := (v_streak % 7) + 1` (see the function body).
--      `get_daily_quest_status` reports the same streak to the UI via
--      `chestStreak` (see below).
--   3. CLAIM SIGNATURE CHANGES. `claim_daily_chest` drops its old 4-arg
--      signature (p_mission_keys, p_reward, p_reward_type) and becomes
--      `claim_daily_chest(p_user_id uuid, p_schedule jsonb)`: the FULL 7-slot
--      schedule is resolved server-side in TS and passed in, and the function
--      picks the slot by the user's streak day. The old 4-arg signature is
--      dropped explicitly first (Postgres cannot change argument types via
--      create-or-replace). The only TS callers are lib/coins/dailyQuests.ts's
--      claimDailyChest / claimDailyMission, which this change set updates.
--
-- WHY THIS DOES NOT BREACH THE ENERGY→COIN INVARIANT
--   The invariant (0094_two_currency_economy.sql) forbids energy being
--   convertible BACK into coins. A chest COIN reward is a coin INCOME path —
--   no longer quest-gated, but still 1 claim per user per Baku day via
--   daily_quest_claims.chest_claimed, amount resolved server-side, and it
--   never spends energy to mint coins. The COINS branch below writes only
--   user_coins; it NEVER writes user_energy (it may only READ user_energy via
--   the unlocked coalesce, for the shared UI meter). The ENERGY branches keep
--   writing only user_energy (via credit_energy). No function here converts
--   energy into coins.
--
-- ONE CLAIM PER BAKU DAY — UNCHANGED
--   Both claim functions run inside a single transaction that first
--   insert-ignores today's daily_quest_claims row, then `select ... for
--   update` it. The `update daily_quest_claims ...` step that flips
--   chest_claimed / appends to claimed_mission_keys happens in the SAME
--   transaction as the credit, so a failure rolls back the credit and the
--   flag/keys together. Two concurrent claims for the same user serialize on
--   the row lock: the second blocks on the first's uncommitted row, then sees
--   the flag already true (chest) or the key already in claimed_mission_keys
--   (mission) and raises.
--
-- STREAK COUNTING IS STABLE UNDER CONCURRENCY
--   The chest streak walks PAST daily_quest_claims rows (chest_claimed=true).
--   Those rows are immutable history — claims only ever target v_today, and
--   today's row is already locked above — so the walk is race-free. The walk
--   counts PAST 7 (never capped) so `(v_streak % 7) + 1` stays correct across
--   cycle boundaries: 0 prior days -> day 1, 6 -> day 7, 7 (a full cycle
--   claimed) -> day 1 of a NEW cycle, 8 -> day 2, etc.
--
-- LOCK ORDER
--   The repo-wide lock order is user_energy first, then user_coins. Each
--   branch here locks ONLY its own currency table: the COINS branch locks
--   user_coins and never writes user_energy; the ENERGY branches delegate to
--   credit_energy (user_energy only). No function locks both tables, so there
--   is no lock-order violation.
--
-- NOT SEEDED
--   `weekly_marathon_rewards` (now streak-day-indexed) and the NEW
--   `daily_mission_reward` are deliberately NOT seeded here — their TS-side
--   defaults live in lib/coins/weeklyMarathon.ts (established convention: new
--   app_settings keys get a TS default, not a seeded row). The legacy
--   `daily_chest_reward` key and its admin endpoint are untouched.
--
-- Idempotent: safe to re-run (add column if not exists, create or replace
-- function, explicit drop only where argument types change). APPLY THIS BY
-- HAND in the Supabase SQL editor, AFTER 0096.
-- ===========================================================================

-- Per-mission claim ledger: the mission keys this user has already claimed
-- today. The chest and each mission share the ONE daily_quest_claims row per
-- Baku day (its unique(user_id, quest_date) PK + the row lock serialize all
-- three claim paths).
alter table daily_quest_claims add column if not exists claimed_mission_keys text[] not null default '{}';

-- Old 4-arg signature (0095). Postgres cannot change argument types via
-- create-or-replace, so it is dropped explicitly before the new 2-arg version.
drop function if exists claim_daily_chest(uuid, text[], numeric, text);

-- ---------------------------------------------------------------------------
-- claim_daily_chest(p_user_id, p_schedule) — FREE (no mission gate) once-per-
-- Baku-day chest open. The FULL 7-slot schedule is passed in (resolved
-- server-side in TS); the function picks the slot by the user's STREAK DAY.
-- ---------------------------------------------------------------------------
create or replace function claim_daily_chest(
  p_user_id  uuid,
  p_schedule jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_today         date := (now() at time zone 'Asia/Baku')::date;
  v_chest_claimed boolean;
  v_streak        int := 0;
  v_streak_day    int;
  v_d             date;
  v_slot          jsonb;
  v_type          text;
  v_amount        numeric;
  v_energy        int;
  v_balance       numeric;
  v_entry         jsonb;
begin
  -- All-or-nothing: exactly 7 entries, each an object with type ∈
  -- {'energy','coins'} and a JSON number amount > 0. A single bad entry
  -- rejects the WHOLE schedule — a partially-applied cycle would pay the
  -- wrong currency on some streak days. Fail-closed by design.
  if jsonb_typeof(p_schedule) <> 'array' or jsonb_array_length(p_schedule) <> 7 then
    raise exception 'invalid_schedule';
  end if;

  for v_entry in select * from jsonb_array_elements(p_schedule) loop
    if jsonb_typeof(v_entry) <> 'object'
       or v_entry ->> 'type' is null
       or (v_entry ->> 'type') not in ('energy', 'coins')
       or jsonb_typeof(v_entry -> 'amount') is distinct from 'number'
       or (v_entry ->> 'amount')::numeric <= 0 then
      raise exception 'invalid_schedule';
    end if;
  end loop;

  insert into daily_quest_claims (user_id, quest_date)
  values (p_user_id, v_today)
  on conflict (user_id, quest_date) do nothing;

  select chest_claimed
    into v_chest_claimed
    from daily_quest_claims
    where user_id = p_user_id and quest_date = v_today
    for update;

  if v_chest_claimed then
    raise exception 'already_claimed';
  end if;

  -- Streak: count consecutive chest_claimed=true days ending YESTERDAY (Baku
  -- dates). Yesterday's rows are immutable history (claims only ever target
  -- v_today), so this walk is stable under concurrency.
  v_d := v_today - 1;
  loop
    if exists (
      select 1 from daily_quest_claims
      where user_id = p_user_id and quest_date = v_d and chest_claimed = true
    ) then
      v_streak := v_streak + 1;
      v_d := v_d - 1;
    else
      exit;
    end if;
  end loop;

  -- Map the raw run length onto the 7-slot cycle: day 1 for 0 prior days,
  -- day 7 for 6, day 1 for 7 (new cycle), day 2 for 8, etc. v_streak is the
  -- count ending YESTERDAY, so this is the DAY TO CLAIM TODAY.
  v_streak_day := (v_streak % 7) + 1;

  -- The schedule was fully validated above (every entry is an object with a
  -- numeric amount > 0), so this slot is guaranteed well-formed and the cast
  -- is safe.
  v_slot   := p_schedule -> (v_streak_day - 1);
  v_type   := v_slot ->> 'type';
  v_amount := (v_slot ->> 'amount')::numeric;

  if v_type = 'coins' then
    -- Coin income path. Mirror 0095's coins branch exactly: insert-on-missing
    -- + for-update + balance += round(amount). LOCK ORDER: this branch never
    -- writes user_energy — it only READS it via the unlocked coalesce below,
    -- for the shared UI meter.
    insert into user_coins (user_id, balance, daily_limit)
    values (p_user_id, 0, null)
    on conflict (user_id) do nothing;

    select uc.balance into v_balance
      from user_coins uc
      where uc.user_id = p_user_id
      for update;
    v_balance := coalesce(v_balance, 0) + round(v_amount);
    update user_coins uc set balance = v_balance where uc.user_id = p_user_id;

    v_energy := coalesce((select ue.balance from user_energy ue where ue.user_id = p_user_id), 0);
  else
    -- ENERGY path — credit_energy (user_energy only, no coin write).
    v_energy := credit_energy(p_user_id, v_amount);
    v_balance := coalesce((select uc.balance from user_coins uc where uc.user_id = p_user_id), 0);
  end if;

  update daily_quest_claims
    set chest_claimed = true,
        chest_claimed_at = now(),
        updated_at = now()
    where user_id = p_user_id and quest_date = v_today;

  return jsonb_build_object(
    'balance', v_balance,
    'energy', v_energy,
    'reward', round(v_amount),
    'reward_type', v_type,
    'streak_day', v_streak_day
  );
end;
$$;

revoke execute on function claim_daily_chest(uuid, jsonb) from public, anon, authenticated;
grant execute on function claim_daily_chest(uuid, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- claim_daily_mission(p_user_id, p_mission_key, p_reward) — per-mission ENERGY
-- reward. Exactly one claim per mission per Baku day, ledgered in
-- daily_quest_claims.claimed_mission_keys (under the same row lock as the
-- chest, so the two claim paths serialize on today's row). The completion
-- check is a FIXED CASE expression over exactly the 8 allowed pool keys — not
-- dynamic SQL — so an unrecognized key can never inject or bypass the check;
-- per the "fail safe" rule, an unknown key always evaluates to NOT done.
-- ---------------------------------------------------------------------------
create or replace function claim_daily_mission(
  p_user_id     uuid,
  p_mission_key text,
  p_reward      numeric
)
returns jsonb
language plpgsql
as $$
declare
  v_day_start       timestamptz := date_trunc('day', now() at time zone 'Asia/Baku') at time zone 'Asia/Baku';
  v_today           date := (now() at time zone 'Asia/Baku')::date;
  v_chat_count      int;
  v_chest_claimed   boolean;
  v_claimed_keys    text[];
  v_rotation_keys   text[];
  v_sign_speed_done boolean;
  v_lesson_done     boolean;
  v_xo_done         boolean;
  v_wheel_done      boolean;
  v_daily_quiz_done boolean;
  v_key_done        boolean;
  v_energy          int;
  v_balance         numeric;
begin
  if p_mission_key is null or p_mission_key = '' then
    raise exception 'mission_not_available';
  end if;

  if p_reward is null or p_reward <= 0 then
    raise exception 'invalid_reward';
  end if;

  insert into daily_quest_claims (user_id, quest_date)
  values (p_user_id, v_today)
  on conflict (user_id, quest_date) do nothing;

  select chat_message_count, chest_claimed, claimed_mission_keys
    into v_chat_count, v_chest_claimed, v_claimed_keys
    from daily_quest_claims
    where user_id = p_user_id and quest_date = v_today
    for update;

  v_chat_count   := coalesce(v_chat_count, 0);
  v_claimed_keys := coalesce(v_claimed_keys, '{}');

  if p_mission_key = any(v_claimed_keys) then
    raise exception 'already_claimed';
  end if;

  -- Only today's rotation keys are claimable. Fail-closed: a missing rotation
  -- row (or a key outside it) is 'mission_not_available', never a silent no-op.
  select mission_keys into v_rotation_keys
    from daily_quest_rotation
    where quest_date = v_today;

  if v_rotation_keys is null or not (p_mission_key = any(v_rotation_keys)) then
    raise exception 'mission_not_available';
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

  v_key_done := case p_mission_key
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
    raise exception 'mission_incomplete';
  end if;

  -- ENERGY reward — credit_energy only, never a coin write (0094 invariant).
  v_energy := credit_energy(p_user_id, p_reward);

  update daily_quest_claims
    set claimed_mission_keys = v_claimed_keys || p_mission_key,
        updated_at = now()
    where user_id = p_user_id and quest_date = v_today;

  -- READ-ONLY coin balance for the shared UI meter — this function must never
  -- write user_coins.
  v_balance := coalesce((select uc.balance from user_coins uc where uc.user_id = p_user_id), 0);

  return jsonb_build_object('energy', v_energy, 'balance', v_balance);
end;
$$;

revoke execute on function claim_daily_mission(uuid, text, numeric) from public, anon, authenticated;
grant execute on function claim_daily_mission(uuid, text, numeric) to service_role;

-- ---------------------------------------------------------------------------
-- get_daily_quest_status — ADDITIVE over the 0085 shape. Returns every raw
-- signal it returned before (chatCount, signSpeedDone, lessonDone, xoDone,
-- wheelDone, dailyQuizDone, chestClaimed) PLUS:
--   claimedMissionKeys — today's row's claimed_mission_keys (coalesced to []).
--   chestStreak — the length of the user's consecutive chest_claimed=true run
--     ending TODAY if today is claimed, otherwise the run ending YESTERDAY
--     (the in-progress cycle position — lets the UI render "today highlighted,
--     prior cycle days filled" when today is not yet claimed). 0 when there is
--     no active run at all.
-- Still read-only: never inserts a row for daily_quest_claims itself.
-- ---------------------------------------------------------------------------
create or replace function get_daily_quest_status(p_user_id uuid)
returns jsonb
language plpgsql
as $$
declare
  v_day_start        timestamptz := date_trunc('day', now() at time zone 'Asia/Baku') at time zone 'Asia/Baku';
  v_today            date := (now() at time zone 'Asia/Baku')::date;
  v_chat_count       int := 0;
  v_chest_claimed    boolean := false;
  v_claimed_keys     text[] := '{}';
  v_sign_speed_done  boolean;
  v_lesson_done      boolean;
  v_xo_done          boolean;
  v_wheel_done       boolean;
  v_daily_quiz_done  boolean;
  v_chest_streak     int := 0;
  v_d                date;
begin
  select chat_message_count, chest_claimed, claimed_mission_keys
    into v_chat_count, v_chest_claimed, v_claimed_keys
    from daily_quest_claims
    where user_id = p_user_id and quest_date = v_today;

  v_chat_count    := coalesce(v_chat_count, 0);
  v_chest_claimed := coalesce(v_chest_claimed, false);
  v_claimed_keys  := coalesce(v_claimed_keys, '{}');

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

  -- chestStreak: consecutive chest_claimed=true days ending TODAY if today is
  -- claimed, else ending YESTERDAY (the in-progress cycle position).
  if v_chest_claimed then
    v_d := v_today;
  else
    v_d := v_today - 1;
  end if;

  while exists (
    select 1 from daily_quest_claims
    where user_id = p_user_id and quest_date = v_d and chest_claimed = true
  ) loop
    v_chest_streak := v_chest_streak + 1;
    v_d := v_d - 1;
  end loop;

  return jsonb_build_object(
    'chatCount', v_chat_count,
    'signSpeedDone', v_sign_speed_done,
    'lessonDone', v_lesson_done,
    'xoDone', v_xo_done,
    'wheelDone', v_wheel_done,
    'dailyQuizDone', v_daily_quiz_done,
    'chestClaimed', v_chest_claimed,
    'claimedMissionKeys', v_claimed_keys,
    'chestStreak', v_chest_streak
  );
end;
$$;

revoke execute on function get_daily_quest_status(uuid) from public, anon, authenticated;
grant execute on function get_daily_quest_status(uuid) to service_role;

-- ===========================================================================
-- app_settings keys (house convention — NO seed rows, TS defaults in code,
-- documented at lib/coins/weeklyMarathon.ts):
--   daily_mission_reward     -- default 2  (ENERGY paid per completed daily
--                              mission via claim_daily_mission; admin UI at
--                              /api/admin/chat-meta?type=daily-mission-reward)
--   weekly_marathon_rewards  -- unchanged key, but now STREAK-DAY-indexed:
--                              index 0 = streak day 1 .. index 6 = streak day 7
--                              (COINS). No longer weekday-anchored.
-- ===========================================================================
