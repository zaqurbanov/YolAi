-- 0074_error_logs_user_rate_limit_index.sql — composite index supporting the
-- per-user rate limit on CLIENT-side error reporting.
--
-- WHY: app/actions/reportClientError.ts is an open write path (a server action
-- is a plain POST endpoint any authenticated user can call). Before each write
-- it counts that user's own `client.%` rows from the last 60 seconds and
-- refuses past the cap. error_logs already has error_logs_created_at_idx and
-- error_logs_context_idx (0073), but neither serves a
-- `user_id = ? and created_at >= ?` count without scanning every row that user
-- has ever produced — and this table only ever grows. The (user_id, created_at
-- desc) composite turns that into a bounded index range scan, which matters
-- because the check runs on EVERY report, including the pathological case the
-- limit exists to stop (a client error loop firing continuously).
--
-- Requires 0073_error_logs.sql to have been applied first. Idempotent, so it is
-- safe to re-run.

create index if not exists error_logs_user_created_at_idx
  on error_logs (user_id, created_at desc);
