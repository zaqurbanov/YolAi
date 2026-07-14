-- THROWAWAY DIAGNOSTIC — not part of the application's normal schema.
-- Added to get a real EXPLAIN (ANALYZE, BUFFERS) plan for
-- match_chunks_per_document (0025/0030) out of a hosted Supabase project.
-- supabase-js only talks PostgREST/HTTPS (see lib/supabase/admin.ts's own
-- comment on this), not a raw Postgres connection, and this repo has no
-- DATABASE_URL/POSTGRES_URL configured (checked .env.local /
-- .env.local.example — only NEXT_PUBLIC_SUPABASE_URL + anon/service-role
-- keys) and no `supabase link` (no supabase/config.toml), so there is no way
-- to run a bare `EXPLAIN` from this environment. This function wraps EXPLAIN
-- so it can be invoked like any other RPC with the service-role client and
-- have its output (the plan, as text rows) come back over PostgREST.
--
-- Run once via the Supabase SQL editor, then call it via
-- `supabase.rpc('debug_explain_match_chunks_per_document', { query_embedding, query_text, per_document_limit })`
-- from a script using SUPABASE_SERVICE_ROLE_KEY (this must go through the
-- service-role client, same as match_chunks_per_document's only real caller
-- in lib/retrieval/search.ts — never exposed to a route a non-admin can
-- reach). DROP this function once the diagnosis is done — it is not
-- referenced by any application code path.
create or replace function debug_explain_match_chunks_per_document(
  query_embedding vector(384),
  query_text text default null,
  per_document_limit int default 20
)
returns setof text
language plpgsql
as $$
begin
  return query execute
    'explain (analyze, buffers, format text) select * from match_chunks_per_document($1, $2, $3)'
    using query_embedding, query_text, per_document_limit;
end;
$$;
