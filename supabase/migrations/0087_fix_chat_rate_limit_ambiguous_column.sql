-- 0087_fix_chat_rate_limit_ambiguous_column.sql — fixes a real production
-- error surfaced via /admin/logs (context "chat.rateLimit.check", Postgres
-- code 42702): "column reference \"window_count\" is ambiguous".
--
-- ROOT CAUSE: 0028_chat_rate_limit_status.sql added `window_count int` to
-- check_chat_rate_limit's `returns table (...)` list. In PL/pgSQL, every
-- column in a function's RETURNS TABLE becomes an implicitly-declared
-- variable in scope for the whole function body — so from that migration
-- onward, the unqualified `window_count` in this function's
-- `select window_start, window_count, last_message_at into ...` query
-- (line ~39 of 0028) was ambiguous between the OUT-parameter variable
-- `window_count` and the `chat_rate_limits.window_count` table column.
-- Postgres has been raising 42702 on every call ever since; the caller
-- (lib/chat/rateLimit.ts's checkChatRateLimit) fails OPEN on any RPC error
-- (deliberately, so an infra hiccup never blocks chat), which is why this
-- went unnoticed functionally — every request was silently allowed through
-- WITHOUT the rate limit actually being enforced or the counter incrementing.
--
-- FIX: qualify the table columns in that SELECT with the table name. No
-- other logic changes — parameter list and return table shape are identical
-- to 0028, so this is a same-signature `create or replace`, no drop needed.
--
-- Idempotent: safe to re-run. APPLY THIS BY HAND in the Supabase SQL editor.

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

  select chat_rate_limits.window_start, chat_rate_limits.window_count, chat_rate_limits.last_message_at
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
-- (also re-grant to service_role — CREATE OR REPLACE with an unchanged
-- signature preserves prior grants in Postgres, but re-issuing this is
-- defensive/idempotent per 0037's hard-learned lesson: revoking from PUBLIC
-- also strips service_role's implicit access if it were ever missing).
revoke execute on function check_chat_rate_limit(uuid, int, int, int) from public, anon, authenticated;
grant execute on function check_chat_rate_limit(uuid, int, int, int) to service_role;
