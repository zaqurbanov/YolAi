-- 0088_sign_speed_correct_flags.sql — settle_sign_speed_round now also
-- returns a per-question boolean[] ('correctFlags') alongside the existing
-- aggregate correctCount, so the result screen can show ✓/✗ per question.
-- This does NOT change the security posture: the correct index for each
-- question is still never exposed until settle is called, and settle is
-- still the only place grading happens (server-authoritative, same as
-- before). Signature is byte-identical to 0071's so this is a straight
-- create-or-replace of the same overload — no new grants needed beyond the
-- usual re-grant that follows every revoke in this repo.
--
-- APPLY THIS BY HAND in the Supabase SQL editor, after 0087_fix_chat_rate_limit_ambiguous_column.sql.

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
    v_correct_flags := array_append(v_correct_flags, p_answers[i] = v_correct_indices[i]);
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
    'correctFlags', v_correct_flags,
    'reward', v_reward
  );
end;
$$;

revoke execute on function settle_sign_speed_round(uuid, uuid, int[], numeric, numeric, int) from public, anon, authenticated;
grant execute on function settle_sign_speed_round(uuid, uuid, int[], numeric, numeric, int) to service_role;
