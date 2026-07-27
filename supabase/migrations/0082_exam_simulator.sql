-- 0082_exam_simulator.sql — "Sınaq İmtahanı" (real exam simulator), a
-- 15-minute / 10-question / all-topics-mixed timed mock exam. Entry costs
-- either 100 coins OR 1 energy (user's choice) — pure SINK, no reward on
-- completion, unlike sign_speed_sessions (0071) which pays a per-correct
-- coin reward. Result can be shared via a public link (share_token), mirroring
-- conversations.share_token (see lib/chat/getSharedConversation.ts).
--
-- SHAPE: copies the two-RPC atomic session model from 0071 exactly
-- (start_* picks questions + debits a resource + creates the session row
-- in ONE RPC so the client never sees the correct index; settle_* uses a
-- `for update` row lock, an atomic used=false→true flip in the same UPDATE
-- statement, and a TTL check) but settle_exam_session does NOT touch
-- user_coins or user_energy at all — grading only. Do not add a reward step
-- here; that would turn a coin/energy sink into a new earning path.
--
-- Questions are drawn from the FULL published quiz_questions pool across all
-- topics (lib/exam/examPool.ts does not filter by topic_id), unlike the
-- per-topic quizzes in lib/quiz/topicTest.ts.
--
-- Idempotent: safe to re-run (create table if not exists, create or replace
-- function, guarded grants). APPLY THIS BY HAND in the Supabase SQL editor,
-- after 0081_daily_quests.sql.

-- ---------------------------------------------------------------------------
-- exam_sessions — one row per exam attempt, server-authoritative question set.
-- ---------------------------------------------------------------------------
create table if not exists exam_sessions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references profiles(id) on delete cascade,
  question_ids      uuid[] not null,
  correct_indices   smallint[] not null,
  payment_method    text not null check (payment_method in ('coin', 'energy')),
  score             int,
  total             int not null default 10,
  issued_at         timestamptz not null default now(),
  used              boolean not null default false,
  share_token       text unique
);

alter table exam_sessions enable row level security;

drop policy if exists exam_sessions_select_own on exam_sessions;
create policy exam_sessions_select_own
  on exam_sessions for select
  to authenticated
  using (user_id = auth.uid());

-- No insert/update/delete policy — those only ever happen via the
-- service-role RPCs below (start_exam_session / settle_exam_session) or the
-- share-link write in lib/exam/examShare.ts (also service-role).
grant select, insert, update on exam_sessions to service_role;

create index if not exists exam_sessions_user_id_idx on exam_sessions(user_id);

-- ---------------------------------------------------------------------------
-- start_exam_session — debits EITHER coins OR energy (never both) and inserts
-- the session row atomically. A no_energy/insufficient_coins failure creates
-- NO row. Also returns the CURRENT balance of whichever pool was NOT spent
-- (a plain read, not a grant) so the frontend's shared coin/energy meters can
-- refresh both numbers after a single RPC round-trip.
-- ---------------------------------------------------------------------------
create or replace function start_exam_session(
  p_user_id             uuid,
  p_question_ids        uuid[],
  p_correct_indices     smallint[],
  p_payment_method      text,
  p_coin_price          numeric,
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

  if p_payment_method = 'energy' then
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

    -- Plain read of the unspent pool (coins) for the response's shared meter.
    insert into user_coins (user_id, balance, daily_limit)
    values (p_user_id, 10, null)
    on conflict (user_id) do nothing;

    select balance into v_balance from user_coins where user_id = p_user_id;

  elsif p_payment_method = 'coin' then
    if p_coin_price is null or p_coin_price <= 0 then
      raise exception 'invalid_coin_price';
    end if;

    insert into user_coins (user_id, balance, daily_limit)
    values (p_user_id, 10, null)
    on conflict (user_id) do nothing;

    update user_coins
      set balance = balance - p_coin_price
      where user_id = p_user_id
        and balance >= p_coin_price
      returning balance into v_balance;

    if v_balance is null then
      raise exception 'insufficient_coins';
    end if;

    -- Plain read of the unspent pool (energy) for the response's shared meter.
    select balance into v_energy from user_energy where user_id = p_user_id;

  else
    raise exception 'invalid_payment_method';
  end if;

  insert into exam_sessions (user_id, question_ids, correct_indices, payment_method)
  values (p_user_id, p_question_ids, p_correct_indices, p_payment_method)
  returning id into v_session;

  return jsonb_build_object(
    'sessionId', v_session,
    'balance', coalesce(v_balance, 0),
    'energy', coalesce(v_energy, 0)
  );
end;
$$;

revoke execute on function start_exam_session(uuid, uuid[], smallint[], text, numeric, int, int) from public, anon, authenticated;
grant execute on function start_exam_session(uuid, uuid[], smallint[], text, numeric, int, int) to service_role;

-- ---------------------------------------------------------------------------
-- settle_exam_session — grades an exam attempt. SINK ONLY: never touches
-- user_coins or user_energy (the spend already happened at start). This is
-- the one deliberate structural difference from settle_sign_speed_round.
-- ---------------------------------------------------------------------------
create or replace function settle_exam_session(
  p_user_id              uuid,
  p_session_id           uuid,
  p_answers              int[],
  p_session_ttl_seconds  int
)
returns jsonb
language plpgsql
as $$
declare
  v_question_ids     uuid[];
  v_correct_indices  smallint[];
  v_issued_at        timestamptz;
  v_score            int := 0;
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
    from exam_sessions
    where id = p_session_id and user_id = p_user_id
    for update;

  if not found then
    raise exception 'session_not_found';
  end if;

  -- Atomic double-submit guard: the used-flip and the read of the session's
  -- content happen in the SAME statement, gated on used = false, so a second
  -- concurrent/racing submit of the same session_id returns no row here and
  -- is rejected, never double-graded.
  update exam_sessions
    set used = true
    where id = p_session_id
      and user_id = p_user_id
      and used = false
    returning question_ids, correct_indices, issued_at
    into v_question_ids, v_correct_indices, v_issued_at;

  if not found then
    raise exception 'already_used';
  end if;

  if v_issued_at < now() - make_interval(secs => p_session_ttl_seconds) then
    raise exception 'session_expired';
  end if;

  for i in 1..10 loop
    if p_answers[i] = v_correct_indices[i] then
      v_score := v_score + 1;
    end if;
  end loop;

  update exam_sessions
    set score = v_score
    where id = p_session_id;

  return jsonb_build_object('score', v_score, 'total', 10);
end;
$$;

revoke execute on function settle_exam_session(uuid, uuid, int[], int) from public, anon, authenticated;
grant execute on function settle_exam_session(uuid, uuid, int[], int) to service_role;

grant select, insert, update on user_coins to service_role;
grant select, insert, update on user_energy to service_role;

-- New admin-configurable tunables (house convention — NO seed rows; TS
-- defaults in lib/exam/examSession.ts):
--   exam_coin_price          -- default 100  (coin price to start an exam)
--   exam_energy_cost         -- default 1    (energy cost to start an exam)
--   exam_pass_threshold      -- default 8    (score needed to "pass" — frontend badge only, NOT enforced here)
--   exam_session_ttl_seconds -- default 1200 (20 min; 15-min exam + network latency headroom before hard TTL expiry)
-- The daily ENERGY GRANT amount is NOT a new setting — it reuses
-- game_daily_energy (0067/games.ts), the one shared energy pool for the whole
-- games section.
