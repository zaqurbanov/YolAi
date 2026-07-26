-- 0073_error_logs.sql — server-side ERROR LOG so every caught error is
-- persisted and queryable, instead of vanishing into a console line on a dev
-- server nobody is watching.
--
-- WHY: chat_request_logs (0007) only records TIMING for SUCCESSFUL requests
-- (its insert is in the chat route's onFinish, which never runs on a failed
-- request), and it has no user_id — so when a user hit an image-upload error
-- there was no trace to investigate. This table is the opposite: it exists to
-- capture FAILURES, with enough context (who, where, what) to debug them.
--
-- Written EXCLUSIVELY via the service-role client (lib/logging/logError.ts),
-- same posture as chat_request_logs: no INSERT policy for authenticated/anon,
-- so RLS denies any client-side write by default. Admin-only SELECT for the
-- logs dashboard.
--
-- The logging helper is fail-SAFE (it swallows its own errors) — logging must
-- never turn a handled error into an unhandled one — so this table being
-- missing (pre-migration) or erroring simply means no row is written, never a
-- crash in the path being logged.

create table if not exists error_logs (
  id          uuid primary key default gen_random_uuid(),
  -- Short machine-ish label for WHERE it happened, e.g. 'chat.identifySign',
  -- 'chat.stream', 'chat.route'. Free text, indexed for filtering.
  context     text not null,
  -- The human-readable error message (error.message, or a coerced string).
  message     text not null,
  -- Optional structured extras: stack, error code/name, http status, the
  -- offending image mediaType/size, etc. Whatever the call site knows.
  details     jsonb,
  -- Who hit it (nullable — some errors happen with no authenticated user).
  user_id     uuid references profiles(id) on delete set null,
  -- Correlates with chat_request_logs.request_id when the error is in the
  -- chat pipeline, so a slow/failed request can be cross-referenced.
  request_id  text,
  created_at  timestamptz not null default now()
);

create index if not exists error_logs_created_at_idx on error_logs (created_at desc);
create index if not exists error_logs_context_idx on error_logs (context);

alter table error_logs enable row level security;

-- Admin-only read (the logs dashboard). No write policy on purpose — writes go
-- through the service-role client only. Mirrors chat_request_logs (0007/0009).
drop policy if exists error_logs_select_admin on error_logs;
create policy error_logs_select_admin on error_logs
  for select using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

grant select, insert on error_logs to service_role;
