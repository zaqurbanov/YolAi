-- 0081_daily_quests.sql — "Gündəlik Missiyalar + Günün Sandığı" (Daily Quests +
-- Daily Chest), the fourth retention mechanic alongside the wheel (0068), the
-- coin mini-games (0066/0067/0071) and the quiz streak (0064).
--
-- SHAPE: 3 daily missions — (1) ask the AI >= CHAT_TARGET questions today,
-- (2) play "Nişan Sürəti" once today, (3) read one lesson today. Once all
-- three are complete, the user may open the chest once per Baku day for a
-- flat coin reward.
--
-- MISSION TARGETS ARE CODE CONSTANTS, NOT app_settings: only the coin reward
-- is admin-tunable (mirrors lib/coins/dailyQuests.ts's CHAT_TARGET = 2).
-- Product decision, not a technical limitation — see the plan doc.
--
-- WHY A NEW TABLE INSTEAD OF READING chat_rate_limits: chat_rate_limits is a
-- ROLLING 24h window keyed for the coin-spend limiter, not a Baku-calendar-day
-- counter, and `messages` has no user_id column at all — there is no existing
-- Baku-aligned "questions asked today" signal to read. daily_quest_claims adds
-- exactly that one counter; game-played and lesson-read are NOT duplicated
-- into it and are instead re-derived on every read from the existing
-- sign_speed_sessions / lesson_attempts tables (see get_daily_quest_status and
-- claim_daily_chest below) — those tables are the single source of truth for
-- those two signals, so there is nothing to keep in sync.
--
-- get_daily_quest_status does NOT insert a row when one doesn't exist yet — a
-- user who hasn't asked a question today simply reads back zero counts. Only
-- record_quest_chat_activity (on an actual chat message) and claim_daily_chest
-- (on an actual claim) ever write a row.
--
-- Baku-day boundary conventions match 0070/0071 exactly:
--   "today's date":          (now() at time zone 'Asia/Baku')::date
--   "start of today (tstz)": date_trunc('day', now() at time zone 'Asia/Baku') at time zone 'Asia/Baku'
--
-- Idempotent: safe to re-run (create table if not exists, create or replace
-- function, guarded policy drops). APPLY THIS BY HAND in the Supabase SQL
-- editor, after 0080 (or whatever the latest applied migration is at the
-- time this is run).

-- ---------------------------------------------------------------------------
-- daily_quest_claims — one row per user per Baku day. chat_message_count is
-- the only counter actually accumulated here; game_played/lesson_read are
-- derived at read time from sign_speed_sessions/lesson_attempts, never stored.
-- ---------------------------------------------------------------------------
create table if not exists daily_quest_claims (
  user_id           uuid not null references profiles(id) on delete cascade,
  quest_date        date not null,
  chat_message_count int not null default 0,
  chest_claimed     boolean not null default false,
  chest_claimed_at  timestamptz,
  updated_at        timestamptz not null default now(),
  primary key (user_id, quest_date)
);

alter table daily_quest_claims enable row level security;

drop policy if exists daily_quest_claims_select_own on daily_quest_claims;
create policy daily_quest_claims_select_own
  on daily_quest_claims for select
  to authenticated
  using (user_id = auth.uid());

-- No insert/update/delete policy — those only ever happen via the
-- service-role RPCs below (record_quest_chat_activity / claim_daily_chest).
grant select, insert, update on daily_quest_claims to service_role;

create index if not exists daily_quest_claims_user_id_idx on daily_quest_claims(user_id);

-- ---------------------------------------------------------------------------
-- record_quest_chat_activity — fire-and-forget upsert bump, called from the
-- hot chat path (app/api/chat/route.ts) once per user message. No validation
-- beyond the upsert itself: this is an internal counter, not a reward action.
-- ---------------------------------------------------------------------------
create or replace function record_quest_chat_activity(p_user_id uuid)
returns void
language plpgsql
as $$
declare
  v_today date := (now() at time zone 'Asia/Baku')::date;
begin
  insert into daily_quest_claims (user_id, quest_date, chat_message_count)
  values (p_user_id, v_today, 1)
  on conflict (user_id, quest_date) do update
    set chat_message_count = daily_quest_claims.chat_message_count + 1,
        updated_at = now();
end;
$$;

revoke execute on function record_quest_chat_activity(uuid) from public, anon, authenticated;
grant execute on function record_quest_chat_activity(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- get_daily_quest_status — read-only. Does NOT insert a row: a missing row
-- for today just means zero chat count / nothing claimed. game_played and
-- lesson_read are computed fresh from sign_speed_sessions/lesson_attempts on
-- every call, never trusted from a cache.
-- ---------------------------------------------------------------------------
create or replace function get_daily_quest_status(p_user_id uuid)
returns jsonb
language plpgsql
as $$
declare
  v_day_start   timestamptz := date_trunc('day', now() at time zone 'Asia/Baku') at time zone 'Asia/Baku';
  v_today       date := (now() at time zone 'Asia/Baku')::date;
  v_chat_count  int := 0;
  v_chest_claimed boolean := false;
  v_game_played boolean;
  v_lesson_read boolean;
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
  ) into v_game_played;

  select exists (
    select 1 from lesson_attempts
    where user_id = p_user_id and created_at >= v_day_start
  ) into v_lesson_read;

  return jsonb_build_object(
    'chatCount', v_chat_count,
    'gamePlayed', v_game_played,
    'lessonRead', v_lesson_read,
    'chestClaimed', v_chest_claimed
  );
end;
$$;

revoke execute on function get_daily_quest_status(uuid) from public, anon, authenticated;
grant execute on function get_daily_quest_status(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- claim_daily_chest — locks (creating if missing) today's row, re-derives
-- game_played/lesson_read from source tables (never trusts anything cached),
-- and credits the reward exactly once per Baku day per user.
-- ---------------------------------------------------------------------------
create or replace function claim_daily_chest(
  p_user_id     uuid,
  p_chat_target int,
  p_reward      numeric
)
returns jsonb
language plpgsql
as $$
declare
  v_day_start     timestamptz := date_trunc('day', now() at time zone 'Asia/Baku') at time zone 'Asia/Baku';
  v_today         date := (now() at time zone 'Asia/Baku')::date;
  v_chat_count    int;
  v_chest_claimed boolean;
  v_game_played   boolean;
  v_lesson_read   boolean;
  v_balance       numeric;
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
  ) into v_game_played;

  select exists (
    select 1 from lesson_attempts
    where user_id = p_user_id and created_at >= v_day_start
  ) into v_lesson_read;

  if not (v_chat_count >= p_chat_target and v_game_played and v_lesson_read) then
    raise exception 'quests_incomplete';
  end if;

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

revoke execute on function claim_daily_chest(uuid, int, numeric) from public, anon, authenticated;
grant execute on function claim_daily_chest(uuid, int, numeric) to service_role;

grant select, insert, update on user_coins to service_role;
grant select on sign_speed_sessions to service_role;
grant select on lesson_attempts to service_role;

-- New admin-configurable tunable (house convention — NO seed row; TS default
-- in lib/coins/dailyQuests.ts):
--   daily_chest_reward -- default 10 (coins awarded when all 3 daily quests are completed)
-- CHAT_TARGET (2 questions), the game-play requirement (1 round) and the
-- lesson-read requirement (1 lesson) are deliberately CODE constants, not
-- app_settings — see lib/coins/dailyQuests.ts.
