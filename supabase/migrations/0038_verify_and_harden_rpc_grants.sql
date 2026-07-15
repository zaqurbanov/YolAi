-- Belt-and-suspenders follow-up to 0037: re-assert (idempotently, safe even
-- if 0037 already ran successfully) the service_role EXECUTE grants, and
-- explicitly grant table-level access on user_coins/chat_rate_limits to
-- service_role. Supabase's default privileges should already cover
-- service_role for tables created by the migration-running role, but this
-- exact class of bug (an implicit/assumed grant silently missing for
-- service_role) has already bitten this schema once via the PUBLIC-execute
-- revokes in 0023/0028/0036 — make the table grants explicit rather than
-- assumed too, instead of relying on inference a second time.
--
-- GRANT is idempotent in Postgres (re-granting an already-held privilege is
-- a no-op, not an error), so this is safe to run regardless of whether 0037
-- succeeded.
grant execute on function check_and_reserve_coins(uuid, numeric, numeric) to service_role;
grant execute on function debit_coins(uuid, numeric) to service_role;
grant execute on function check_chat_rate_limit(uuid, int, int, int) to service_role;

grant select, insert, update on user_coins to service_role;
grant select, insert, update on chat_rate_limits to service_role;
