-- check_chat_rate_limit now also returns the resulting window_count (the
-- post-window-reset, post-increment count on the success path; the count at
-- rejection time on reason='count'/'spacing' paths), so lib/chat/rateLimit.ts
-- can report the caller's updated used-count without a second query. Full
-- body copied from 0023_chat_rate_limits.sql with v_window_count added to
-- every return query select — logic is otherwise unchanged.
create or replace function check_chat_rate_limit(
  p_user_id uuid,
  p_max_per_window int,
  p_window_seconds int,
  p_min_spacing_seconds int
)
returns table (
  allowed boolean,
  reason text,
  retry_after_seconds int,
  window_count int
)
language plpgsql
as $$
declare
  v_window_start timestamptz;
  v_window_count int;
  v_last_message_at timestamptz;
  v_elapsed_since_last numeric;
  v_elapsed_since_window_start numeric;
begin
  insert into chat_rate_limits (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select window_start, window_count, last_message_at
    into v_window_start, v_window_count, v_last_message_at
    from chat_rate_limits
    where user_id = p_user_id
    for update;

  if v_last_message_at is not null
     and now() - v_last_message_at < (p_min_spacing_seconds || ' seconds')::interval
  then
    v_elapsed_since_last := extract(epoch from (now() - v_last_message_at));
    return query select
      false,
      'spacing'::text,
      greatest(0, ceil(p_min_spacing_seconds - v_elapsed_since_last))::int,
      v_window_count;
    return;
  end if;

  if now() - v_window_start >= (p_window_seconds || ' seconds')::interval then
    v_window_start := now();
    v_window_count := 0;
  end if;

  if v_window_count >= p_max_per_window then
    v_elapsed_since_window_start := extract(epoch from (now() - v_window_start));
    update chat_rate_limits
      set window_start = v_window_start,
          window_count = v_window_count
      where user_id = p_user_id;
    return query select
      false,
      'count'::text,
      greatest(0, ceil(p_window_seconds - v_elapsed_since_window_start))::int,
      v_window_count;
    return;
  end if;

  v_window_count := v_window_count + 1;

  update chat_rate_limits
    set window_start = v_window_start,
        window_count = v_window_count,
        last_message_at = now()
    where user_id = p_user_id;

  return query select true, null::text, null::int, v_window_count;
end;
$$;

-- Postgres grants EXECUTE on new functions to PUBLIC by default; revoke it
-- defensively (also enforced by 0023) so this stays only callable via the
-- service-role client (lib/chat/rateLimit.ts), never directly by an
-- authenticated or anon client.
revoke execute on function check_chat_rate_limit(uuid, int, int, int) from public, anon, authenticated;
