-- THROWAWAY DIAGNOSTIC — not part of the application's normal schema.
-- Performance phase 4: tests whether a transaction-scoped set_config(...,
-- true) succeeds where 0014's function-level `SET
-- pg_trgm.word_similarity_threshold = 0.3` clause failed with "permission
-- denied to set parameter" against Supabase's managed `postgres` role (see
-- 0014/0018's comments for the original failure, and 0030 for the
-- unindexed word_similarity() workaround this is trying to avoid).
--
-- set_config(setting, value, is_local) with is_local = true is the SQL-level
-- equivalent of `SET LOCAL` (transaction-scoped, not session-scoped). This is
-- a genuinely different code path in Postgres's GUC permission model from a
-- plain `SET` / a function's `SET` clause (which is session-scoped for the
-- duration of the function call but still evaluated through the same
-- permission check as session-level SET) -- worth testing empirically rather
-- than assuming the same denial applies.
--
-- Same access-path constraint as 0031: this environment only has
-- PostgREST/RPC (no DATABASE_URL/raw Postgres connection, no `supabase
-- link`), so the test itself must be wrapped in a plpgsql function and
-- invoked via `.rpc()` from a script using SUPABASE_SERVICE_ROLE_KEY.
--
-- Apply via the Supabase SQL editor, run once, then DROP this function --
-- it is not referenced by any application code path and should never ship
-- to a state where it lingers as dead schema.
create or replace function test_trgm_guc_local() returns text
language plpgsql
as $$
begin
  perform set_config('pg_trgm.word_similarity_threshold', '0.3', true);
  return 'succeeded';
exception when others then
  return 'failed: ' || sqlerrm;
end;
$$;
