-- Persists per-request chat pipeline latency (rewrite/embed/db-search/LLM
-- timings) that was previously only emitted as a console.log JSON line in
-- app/api/chat/route.ts, so an admin dashboard can query it later.
--
-- Inserts happen exclusively via the service-role client
-- (lib/supabase/admin.ts createAdminClient()) from within the chat route's
-- onFinish callback, which bypasses RLS entirely. Deliberately no INSERT
-- policy is defined for the authenticated/anon roles — there is no
-- legitimate client-side write path for this table, and omitting the
-- policy means any attempt via a user-scoped or anon client is denied by
-- default under RLS.
create table chat_request_logs (
  id uuid primary key default gen_random_uuid(),
  request_id text,
  conversation_id uuid references conversations(id) on delete set null,
  query text,
  rewrite_ms numeric,
  embed_ms numeric,
  db_search_ms numeric,
  llm_first_token_ms numeric,
  llm_total_ms numeric,
  created_at timestamptz not null default now()
);

create index chat_request_logs_created_at_idx
  on chat_request_logs (created_at desc);

alter table chat_request_logs enable row level security;

-- Admin-only read access for the (future) dashboard; no write policy on
-- purpose, see header comment.
create policy "chat_request_logs_select_admin" on chat_request_logs
  for select using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );
