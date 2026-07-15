-- 0023/0028 (check_chat_rate_limit) and 0036 (check_and_reserve_coins,
-- debit_coins) each revoke the implicit PUBLIC execute grant Postgres
-- creates for every new function, intending to lock these RPCs down to
-- "only callable via the service-role client". That revoke unintentionally
-- also stripped service_role's own access: service_role in Supabase is an
-- ordinary role, not a superuser, and was never separately granted EXECUTE
-- on these functions — it was relying on the same implicit PUBLIC grant that
-- got revoked. Since then, every call from createAdminClient() (the
-- service-role client used in lib/chat/coins.ts and lib/chat/rateLimit.ts)
-- to these three RPCs has been erroring, silently tripping their fail-open
-- branches on every chat request for non-admin users.
grant execute on function check_and_reserve_coins(uuid, numeric, numeric) to service_role;
grant execute on function debit_coins(uuid, numeric) to service_role;
grant execute on function check_chat_rate_limit(uuid, int, int, int) to service_role;
