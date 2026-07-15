-- Per-user chat rate limiting (regular users only; admins are exempt in
-- app/api/chat/route.ts before this is ever consulted). One row per user,
-- updated via check_chat_rate_limit() below rather than read/written
-- directly, so all reads and writes happen exclusively through the
-- service-role client (lib/supabase/admin.ts createAdminClient()) from
-- lib/chat/rateLimit.ts. Mirrors chat_request_logs_
-- (0007_chat_request_logs.sql): deliberately no policies for authenticated/
-- anon roles are defined below — there is no legitimate client-side
-- read/write path for this table, and omitting the policies means any
-- attempt via a user-scoped or anon client is denied by default under RLS.
create table chat_rate_limits (
  user_id uuid primary key references profiles(id) on delete cascade,
  window_start timestamptz not null default now(),
  window_count int not null default 0,
  last_message_at timestamptz
);

alter table chat_rate_limits enable row level security;

-- check_chat_rate_limit: fixed-window counter (not sliding window / token
-- bucket) — the simplest option that's still correct for this app's scale,
-- with a known trade-off: a burst straddling a window boundary can let a
-- user send up to ~2x p_max_per_window messages in a short span (e.g.
-- p_max_per_window messages just before window_start + p_window_seconds,
-- then another p_max_per_window just after). This is accepted, not a bug —
-- the per-message min-spacing check below already bounds worst-case burst
-- rate regardless.
--
-- Single-transaction, row-locked (`select ... for update`) so concurrent
-- requests from the same user are serialized and can't race past the
-- count/spacing checks together.
create or replace function check_chat_rate_limit(
  p_user_id uuid,
  p_max_per_window int,
  p_window_seconds int,
  p_min_spacing_seconds int
)
returns table (
  allowed boolean,
  reason text,
  retry_after_seconds int
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
      greatest(0, ceil(p_min_spacing_seconds - v_elapsed_since_last))::int;
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
      greatest(0, ceil(p_window_seconds - v_elapsed_since_window_start))::int;
    return;
  end if;

  v_window_count := v_window_count + 1;

  update chat_rate_limits
    set window_start = v_window_start,
        window_count = v_window_count,
        last_message_at = now()
    where user_id = p_user_id;

  return query select true, null::text, null::int;
end;
$$;

-- Postgres grants EXECUTE on new functions to PUBLIC by default; revoke it
-- so this is only callable via the service-role client (lib/chat/rateLimit.ts),
-- never directly by an authenticated or anon client.
revoke execute on function check_chat_rate_limit(uuid, int, int, int) from public, anon, authenticated;

-- NOTE (added retroactively, see 0037_grant_service_role_rpc_execute.sql):
-- the above revoke also strips service_role's implicit PUBLIC-derived
-- execute access, since service_role is not a superuser and is never
-- separately granted here. This went unnoticed until 0037 because the
-- caller (lib/chat/rateLimit.ts) fails open on RPC error. For reference,
-- the fix applied in 0037 (do not re-run here — 0023 is already applied):
--   grant execute on function check_chat_rate_limit(uuid, int, int, int) to service_role;
