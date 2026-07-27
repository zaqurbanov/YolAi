-- 0085_daily_quest_rotation.sql — rotate "Gündəlik Missiyalar" from 3 fixed
-- daily missions to a POOL of 8, showing 3/day, picked "longest unused
-- first". Layered on top of 0081_daily_quests.sql (NOT modifying it — assume
-- it may already be applied) via create-or-replace / drop-then-create where
-- signatures change.
--
-- WHY A POOL TABLE: the rotation decision has to be made once per Baku day
-- and then be STABLE for every request that day (including concurrent ones),
-- otherwise two users — or two requests from the same user racing a page
-- load and a claim — could disagree on which 3 missions are "today's". A
-- single `daily_quest_rotation` row per quest_date, written once (first
-- request of the day wins via ON CONFLICT DO NOTHING, everyone else reads
-- the stored row back), gives that stability without a cron job.
--
-- ALGORITHM — "longest unused first", picked in TS (lib/coins/dailyQuests.ts,
-- getTodaysMissionKeys), not SQL: look at the last 7 days of rotation rows,
-- rank the 8 pool keys by how long ago (or never, within that window) each
-- last appeared, take the 3 stalest, break ties with a crypto-random
-- shuffle. This is DELIBERATELY NOT a mathematical no-repeat guarantee: a
-- pool of 8 showing 3/day has no combinatorial way to guarantee, say, a
-- strict 2-day minimum gap for every key forever (pigeonhole — 3 keys must
-- repeat within a 3-day span at the latest, since 8 keys / 3 per day cycles
-- through the pool in under 3 days). What this DOES guarantee is a
-- best-effort spread: a key that showed up yesterday is provably less
-- likely to show up today than a key that hasn't appeared in a week, because
-- it's ranked less stale. Do not "fix" this into a stronger guarantee later
-- without changing the pool size or the show-per-day count — the shape is a
-- product constraint (MISSION_POOL / 3-per-day), not a bug in this file.
--
-- Mission pool itself is a TS code constant (lib/coins/dailyQuests.ts
-- MISSION_POOL), not a table or app_settings row — mirrors 0081's existing
-- "targets are code constants" convention. This migration only adds the
-- STORAGE for which 3 of those 8 keys were chosen on a given day, plus the
-- read/claim functions needed to check them.
--
-- Idempotent: safe to re-run (create table if not exists, create or replace
-- function, guarded policy drops, explicit drop-then-create only where a
-- function's argument types actually change). APPLY THIS BY HAND in the
-- Supabase SQL editor, after 0084 (or whatever the latest applied migration
-- is at the time this is run). 0081 must already be applied first.

-- ---------------------------------------------------------------------------
-- daily_quest_rotation — one row per Baku day, the 3 mission keys shown that
-- day. Read by everyone (it's not sensitive — just "what are today's
-- quests"), written only by the service-role client from
-- getTodaysMissionKeys() in lib/coins/dailyQuests.ts.
-- ---------------------------------------------------------------------------
create table if not exists daily_quest_rotation (
  quest_date   date primary key,
  mission_keys text[] not null,
  created_at   timestamptz not null default now()
);

alter table daily_quest_rotation enable row level security;

drop policy if exists daily_quest_rotation_select_all on daily_quest_rotation;
create policy daily_quest_rotation_select_all
  on daily_quest_rotation for select
  to public
  using (true);

-- No insert/update/delete policy for authenticated/anon — rotation rows are
-- only ever written by getTodaysMissionKeys() via the service-role client.
grant select on daily_quest_rotation to authenticated, anon;
grant select, insert on daily_quest_rotation to service_role;

-- ---------------------------------------------------------------------------
-- get_daily_quest_status — NEW SHAPE. Previously returned the fixed 3-field
-- shape (chatCount/gamePlayed/lessonRead/chestClaimed). Now returns ALL raw
-- signal states for every mission in the 8-key pool, so the TS layer can
-- pick out whichever 3 keys are today's rotation and compute done/progress
-- from these same raw values claim_daily_chest checks against. Still
-- read-only: never inserts a row for daily_quest_claims itself (unchanged
-- from 0081 — a user with no activity today just reads back zero/false).
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
  v_sign_speed_done  boolean;
  v_lesson_done      boolean;
  v_xo_done          boolean;
  v_wheel_done       boolean;
  v_daily_quiz_done  boolean;
begin
  select chat_message_count, chest_claimed
    into v_chat_count, v_chest_claimed
    from daily_quest_claims
    where user_id = p_user_id and quest_date = v_today;

  v_chat_count := coalesce(v_chat_count, 0);
  v_chest_claimed := coalesce(v_chest_claimed, false);

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

  return jsonb_build_object(
    'chatCount', v_chat_count,
    'signSpeedDone', v_sign_speed_done,
    'lessonDone', v_lesson_done,
    'xoDone', v_xo_done,
    'wheelDone', v_wheel_done,
    'dailyQuizDone', v_daily_quiz_done,
    'chestClaimed', v_chest_claimed
  );
end;
$$;

revoke execute on function get_daily_quest_status(uuid) from public, anon, authenticated;
grant execute on function get_daily_quest_status(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- claim_daily_chest — SIGNATURE CHANGE: drops p_chat_target int, adds
-- p_mission_keys text[] (today's rotation, resolved in TS and passed in so
-- SQL never has to know about the pool/rotation algorithm). Postgres can't
-- change an existing function's argument types via create-or-replace, so the
-- old 3-arg version is dropped explicitly first.
--
-- Completion check uses a FIXED CASE expression over exactly the 8 allowed
-- pool keys — not dynamic SQL — so an unrecognized key can never be used to
-- inject or to bypass the check; per the "fail safe" rule, an unknown key
-- always evaluates to NOT done.
-- ---------------------------------------------------------------------------
drop function if exists claim_daily_chest(uuid, int, numeric);

create function claim_daily_chest(
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

  insert into user_coins (user_id, balance, daily_limit)
  values (p_user_id, 10, null)
  on conflict (user_id) do nothing;

  update user_coins uc
    set balance = uc.balance + p_reward
    where uc.user_id = p_user_id
    returning uc.balance into v_balance;

  update daily_quest_claims
    set chest_claimed = true,
        chest_claimed_at = now(),
        updated_at = now()
    where user_id = p_user_id and quest_date = v_today;

  return jsonb_build_object('balance', v_balance, 'reward', p_reward);
end;
$$;

revoke execute on function claim_daily_chest(uuid, text[], numeric) from public, anon, authenticated;
grant execute on function claim_daily_chest(uuid, text[], numeric) to service_role;

-- coin_game_plays / wheel_spins / daily_quiz_claims already grant
-- `select ... to service_role` in their own migrations (0066, 0068, 0042
-- respectively) — no re-grant needed here. user_coins/sign_speed_sessions/
-- lesson_attempts grants are restated in 0081 already and remain valid.

-- No new app_settings key in this migration: MISSION_POOL (the 8 mission
-- definitions — key, label, kind, target) lives entirely as a TS code
-- constant in lib/coins/dailyQuests.ts, same "targets are code constants"
-- convention 0081 established. Only the chest reward amount
-- (daily_chest_reward) remains admin-tunable via app_settings, unchanged
-- from 0081.
