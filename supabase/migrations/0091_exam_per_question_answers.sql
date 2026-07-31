-- 0091_exam_per_question_answers.sql — per-question answer locking + immediate
-- correct/wrong feedback for the "Rəsmi İmtahan" (/imtahan).
--
-- WHY THIS NEEDS A MIGRATION AT ALL. The product ask is: the candidate cannot
-- advance without answering, and each answered question immediately shows a
-- green tick or a red cross. Showing that verdict means SOMETHING has to
-- compare the answer to correct_index. It must not be the browser: the entire
-- exam security model (see 0082 and lib/exam/examPool.ts) rests on
-- correct_index never reaching a client.
--
-- So the verdict is computed server-side and only a boolean is returned. But a
-- boolean oracle you can call repeatedly IS the answer key — call it with 0, 1,
-- 2, 3 and keep the one that returns true. The fix is to make the first answer
-- FINAL: answer_exam_question below writes into a per-session answers array
-- only when that slot is still null, and every later call for the same index
-- returns the stored verdict without re-reading the submitted value. One shot
-- per question, exactly like a real exam.
--
-- settle_exam_session is amended to prefer those stored answers over the array
-- the client sends at the end — otherwise a client could answer honestly
-- question by question and then submit a different, perfect array. The
-- fallback to p_answers is retained so the games-section simulator
-- (components/games/ExamSimulatorGame.tsx), which never calls
-- answer_exam_question and therefore leaves `answers` null, keeps working
-- unchanged.
--
-- APPLY THIS BY HAND in the Supabase SQL editor, AFTER 0082_exam_simulator.sql
-- (and 0090). Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- exam_sessions.answers — the candidate's locked answers, 1-based to match the
-- existing question_ids / correct_indices arrays. NULL entries = not yet
-- answered. Left NULL entirely for sessions that never use the per-question
-- flow.
-- ---------------------------------------------------------------------------
alter table exam_sessions
  add column if not exists answers smallint[];

-- ---------------------------------------------------------------------------
-- answer_exam_question — records ONE answer and returns whether it was right.
-- First write wins; later calls for the same index are idempotent reads.
-- Returns only a boolean verdict, never the correct index.
-- ---------------------------------------------------------------------------
create or replace function answer_exam_question(
  p_user_id              uuid,
  p_session_id           uuid,
  p_index                int,
  p_answer               int,
  p_session_ttl_seconds  int
)
returns jsonb
language plpgsql
as $$
declare
  v_correct_indices  smallint[];
  v_answers          smallint[];
  v_issued_at        timestamptz;
  v_used             boolean;
  v_existing         smallint;
  v_stored           smallint;
begin
  if p_index is null or p_index < 0 or p_index > 9 then
    raise exception 'invalid_index';
  end if;
  if p_answer is null or p_answer < 0 or p_answer > 3 then
    raise exception 'invalid_answer';
  end if;

  -- Row lock so two concurrent answers to the same question serialize; without
  -- it both could see a null slot and the second would overwrite the first,
  -- which is precisely the re-answer the lock exists to prevent.
  select correct_indices, answers, issued_at, used
    into v_correct_indices, v_answers, v_issued_at, v_used
    from exam_sessions
    where id = p_session_id and user_id = p_user_id
    for update;

  if not found then
    raise exception 'session_not_found';
  end if;
  if v_used then
    raise exception 'already_used';
  end if;
  if v_issued_at < now() - make_interval(secs => p_session_ttl_seconds) then
    raise exception 'session_expired';
  end if;

  if v_answers is null then
    v_answers := array_fill(null::smallint, array[10]);
  end if;

  v_existing := v_answers[p_index + 1];

  if v_existing is null then
    v_answers[p_index + 1] := p_answer::smallint;
    update exam_sessions set answers = v_answers where id = p_session_id;
    v_stored := p_answer::smallint;
  else
    -- Already answered: report the ORIGINAL verdict and ignore p_answer
    -- entirely. This is what closes the brute-force oracle.
    v_stored := v_existing;
  end if;

  return jsonb_build_object(
    'correct', v_stored = v_correct_indices[p_index + 1],
    'locked', v_stored,
    'wasAlreadyAnswered', v_existing is not null
  );
end;
$$;

revoke execute on function answer_exam_question(uuid, uuid, int, int, int) from public, anon, authenticated;
grant execute on function answer_exam_question(uuid, uuid, int, int, int) to service_role;

-- ---------------------------------------------------------------------------
-- settle_exam_session — REPLACED. Only change vs 0082: when the session has
-- stored per-question answers, those are graded instead of the client-supplied
-- array. Everything else (row lock, atomic used-flip double-submit guard, TTL
-- check, sink-only / no coin or energy movement) is byte-for-byte the same
-- behaviour as 0082 and must stay that way.
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
  v_stored_answers   smallint[];
  v_issued_at        timestamptz;
  v_score            int := 0;
  v_effective        int;
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
    from exam_sessions
    where id = p_session_id and user_id = p_user_id
    for update;

  if not found then
    raise exception 'session_not_found';
  end if;

  update exam_sessions
    set used = true
    where id = p_session_id
      and user_id = p_user_id
      and used = false
    returning question_ids, correct_indices, issued_at, answers
    into v_question_ids, v_correct_indices, v_issued_at, v_stored_answers;

  if not found then
    raise exception 'already_used';
  end if;

  if v_issued_at < now() - make_interval(secs => p_session_ttl_seconds) then
    raise exception 'session_expired';
  end if;

  for i in 1..10 loop
    -- Server-recorded answer wins. Falls back to the submitted value only for
    -- slots that were never locked (the games simulator's whole array, or a
    -- question the candidate ran out of time on).
    if v_stored_answers is not null and v_stored_answers[i] is not null then
      v_effective := v_stored_answers[i];
    else
      v_effective := p_answers[i];
    end if;

    if v_effective = v_correct_indices[i] then
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
