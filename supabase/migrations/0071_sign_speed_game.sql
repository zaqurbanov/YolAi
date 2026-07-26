-- 0071_sign_speed_game.sql — "Nişan Sürəti" (sign speed quiz), the third
-- retention mini-game alongside XO (0067) and the wheel (0068). Full design
-- rationale: docs/sign-speed-game-plan.md.
--
-- SHAPE: one round = 10 questions, each a sign code ("Kod X.Y") with 4
-- shuffled description options (1 correct + 3 distractors). The server picks
-- the question set + correct answers at round-start and stores them
-- server-side in `sign_speed_sessions`; the client only ever sees
-- { code, options } — never the correct index. Submitting grades against the
-- stored answers, never trusts a client-reported score.
--
-- ENERGY DESIGN DECISION (read before touching this file): the plan says "1
-- energy per round-start, not per question". Energy is therefore spent INSIDE
-- start_sign_speed_round, atomically with inserting the session row, NOT
-- inside settle_sign_speed_round. This is deliberate: if energy were instead
-- spent at settle time, a user could start a round, let it go stale
-- (never submit, or wait past the TTL), and start another round for free —
-- the round-start is the resource that must be metered, since that's the
-- action that reveals 10 real questions and consumes server-picked content.
-- A `no_energy` failure inside start_sign_speed_round means NO session row is
-- created at all, so there is nothing left over to later expire or replay.
--
-- This reuses the ONE shared `user_energy` table / `grant_daily_energy`
-- function from 0067 — there is a single energy pool for "the games section"
-- as a whole (XO and this game draw from the same daily allowance). No second
-- energy table or function is created here.
--
-- REWARD CAP DESIGN DECISION: unlike settle_tictactoe (which either pays the
-- full win reward or zero, gated by a per-day WIN COUNT cap), this game pays
-- a per-correct-answer reward that must be CLAMPED, not rejected, once the
-- daily coin cap is reached — a user near the cap should still get partial
-- credit for whatever room is left, not lose an entire round's reward over a
-- boundary. The cap is enforced by summing `reward_credited` already paid out
-- by THIS user's OTHER sessions since the start of the current Baku day (a
-- column on sign_speed_sessions itself, so no separate ledger table is
-- needed), then clamping this round's computed reward down to
-- `greatest(0, cap - already_credited)`. Because the clamp is computed and
-- applied inside the same transaction that flips `used = true` and writes
-- `reward_credited`, a user cannot exceed the cap by racing concurrent
-- submits (the `for update` row lock below plus the atomic used-flip make
-- each session settle exactly once).
--
-- Baku-day boundary conventions match 0070 exactly:
--   "today's date":          (now() at time zone 'Asia/Baku')::date
--   "start of today (tstz)": date_trunc('day', now() at time zone 'Asia/Baku') at time zone 'Asia/Baku'
--
-- Idempotent: safe to re-run (create table if not exists, create or replace
-- function, guarded alter table). APPLY THIS BY HAND in the Supabase SQL
-- editor, after 0070_baku_day_boundary.sql.

-- ---------------------------------------------------------------------------
-- sign_speed_sessions — one row per round, server-authoritative question set.
-- ---------------------------------------------------------------------------
create table if not exists sign_speed_sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references profiles(id) on delete cascade,
  question_codes   text[] not null,
  correct_indices  smallint[] not null,
  reward_credited  numeric not null default 0,
  issued_at        timestamptz not null default now(),
  used             boolean not null default false
);

alter table sign_speed_sessions enable row level security;

drop policy if exists sign_speed_sessions_select_own on sign_speed_sessions;
create policy sign_speed_sessions_select_own
  on sign_speed_sessions for select
  to authenticated
  using (user_id = auth.uid());

-- No insert/update/delete policy — those only ever happen via the service-role
-- RPCs below (start_sign_speed_round / settle_sign_speed_round).
grant select, insert, update on sign_speed_sessions to service_role;

create index if not exists sign_speed_sessions_user_id_idx on sign_speed_sessions(user_id);

-- ---------------------------------------------------------------------------
-- start_sign_speed_round — spends the round-start energy AND inserts the
-- session row atomically. A no_energy failure creates NO row.
-- ---------------------------------------------------------------------------
create or replace function start_sign_speed_round(
  p_user_id             uuid,
  p_question_codes      text[],
  p_correct_indices     smallint[],
  p_daily_energy_grant  int,
  p_energy_cost         int
)
returns jsonb
language plpgsql
as $$
declare
  v_energy    int;
  v_session   uuid;
begin
  if p_question_codes is null or array_length(p_question_codes, 1) <> 10 then
    raise exception 'invalid_questions';
  end if;
  if p_correct_indices is null or array_length(p_correct_indices, 1) <> 10 then
    raise exception 'invalid_questions';
  end if;
  if p_energy_cost is null or p_energy_cost <= 0 then
    raise exception 'invalid_energy_cost';
  end if;

  -- Lazy daily grant, then spend the round-start energy. Mirrors
  -- settle_tictactoe's energy step exactly (0067/0070).
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

  insert into sign_speed_sessions (user_id, question_codes, correct_indices)
  values (p_user_id, p_question_codes, p_correct_indices)
  returning id into v_session;

  return jsonb_build_object('sessionId', v_session, 'energy', v_energy);
end;
$$;

revoke execute on function start_sign_speed_round(uuid, text[], smallint[], int, int) from public, anon, authenticated;
grant execute on function start_sign_speed_round(uuid, text[], smallint[], int, int) to service_role;

-- ---------------------------------------------------------------------------
-- settle_sign_speed_round — grades a round, credits a daily-capped reward.
-- Energy is NOT touched here (already spent at start).
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
  v_reward           numeric := 0;
  v_already_credited numeric;
  v_day_start        timestamptz := date_trunc('day', now() at time zone 'Asia/Baku') at time zone 'Asia/Baku';
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

  -- Lock the session row first so concurrent submits of the same session
  -- serialize on this lock rather than racing the used-flip below.
  perform 1
    from sign_speed_sessions
    where id = p_session_id and user_id = p_user_id
    for update;

  if not found then
    raise exception 'session_not_found';
  end if;

  -- Atomic double-submit guard: the used-flip and the read of the session's
  -- content happen in the SAME statement, gated on used = false, so a second
  -- concurrent/racing submit of the same session_id returns no row here and
  -- is rejected, never double-credited.
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
    if p_answers[i] = v_correct_indices[i] then
      v_correct_count := v_correct_count + 1;
    end if;
  end loop;

  v_reward := v_correct_count * p_per_correct_reward;

  -- Daily reward cap (Baku day boundary): clamp, don't reject — a round that
  -- pushes past the cap still credits whatever headroom is left. Sums this
  -- user's OTHER already-settled sessions' reward_credited today; this row's
  -- own reward_credited is still 0 at this point (default), so it is not
  -- double-counted.
  select coalesce(sum(s.reward_credited), 0) into v_already_credited
    from sign_speed_sessions s
    where s.user_id = p_user_id
      and s.used = true
      and s.issued_at >= v_day_start;

  if v_already_credited + v_reward > p_daily_reward_cap then
    v_reward := greatest(0, p_daily_reward_cap - v_already_credited);
  end if;

  insert into user_coins (user_id, balance, daily_limit)
  values (p_user_id, 10, null)
  on conflict (user_id) do nothing;

  update user_coins uc
    set balance = uc.balance + v_reward
    where uc.user_id = p_user_id
    returning uc.balance into v_balance;

  update sign_speed_sessions
    set reward_credited = v_reward
    where id = p_session_id;

  return jsonb_build_object(
    'balance', v_balance,
    'correctCount', v_correct_count,
    'reward', v_reward
  );
end;
$$;

revoke execute on function settle_sign_speed_round(uuid, uuid, int[], numeric, numeric, int) from public, anon, authenticated;
grant execute on function settle_sign_speed_round(uuid, uuid, int[], numeric, numeric, int) to service_role;

grant select, insert, update on user_coins to service_role;

-- New admin-configurable tunables (house convention — NO seed rows; TS
-- defaults in lib/coins/signSpeed.ts):
--   sign_speed_per_correct_reward  -- default 1   (coins per correct answer)
--   sign_speed_daily_reward_cap    -- default 20  (max coins/day from this game, per user, Baku day)
--   sign_speed_energy_cost         -- default 1   (energy spent per round-START)
--   sign_speed_session_ttl_seconds -- default 180 (staleness ceiling for a round)
-- The daily ENERGY GRANT amount is NOT a new setting — it reuses
-- game_daily_energy (0067/games.ts), the one shared energy pool for XO + this
-- game.
