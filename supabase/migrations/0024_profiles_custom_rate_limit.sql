-- Per-user override for the daily chat message cap. Nullable: null means
-- "use the effective global default" (table-configured value in
-- app_settings, falling back to the env default CHAT_RATE_LIMIT_MAX_PER_DAY,
-- both read in lib/chat/rateLimit.ts); a non-null value overrides that
-- default for this user only, set individually by an admin via
-- app/api/admin/users/[id]/rate-limit/route.ts. This is a plain profile
-- attribute, not a new table, because it's a single scalar keyed 1:1 on
-- user_id and is read in the same profiles lookup app/api/chat/route.ts
-- already does for the admin-role check — adding a column avoids a second
-- round trip on the hot chat path.
--
-- No RLS policy changes here: profiles already has RLS enabled (0002) and
-- read policies for admins (0009/0010) plus a super-admin update policy
-- (0020). This column follows the existing update path used for
-- custom_max_per_day writes — the admin API route uses the service-role
-- client (lib/supabase/admin.ts createAdminClient()) after requireAdmin()
-- has already authorized the request, the same pattern as
-- app/api/admin/documents/route.ts, rather than adding a new RLS policy
-- granting plain admins UPDATE on profiles.
alter table profiles
  add column custom_max_per_day int;

alter table profiles
  add constraint profiles_custom_max_per_day_positive
  check (custom_max_per_day is null or custom_max_per_day > 0);

-- Admin-configurable global default for the daily chat rate limit, read at
-- runtime instead of only via the CHAT_RATE_LIMIT_MAX_PER_DAY env var.
-- Key-value shape (rather than a single-row fixed-column table) so future
-- runtime-configurable settings can reuse this table without another
-- migration. Queried in lib/chat/rateLimit.ts via createAdminClient().
--
-- Mirrors chat_rate_limits' (0023) RLS posture: RLS is enabled with
-- deliberately NO policies for authenticated/anon roles — there is no
-- legitimate client-side read/write path for this table, only the
-- service-role client (app/api/admin/settings/rate-limit/route.ts, gated by
-- requireAdmin(), and lib/chat/rateLimit.ts on the read side) may access it.
create table app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table app_settings enable row level security;
