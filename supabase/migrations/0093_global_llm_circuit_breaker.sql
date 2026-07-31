-- 0093_global_llm_circuit_breaker.sql — a GLOBAL, account-independent daily cap
-- on LLM-backed chat requests, plus the counter it reads.
--
-- WHY THIS EXISTS (the gap it closes):
-- Every existing limiter in this app is keyed by user_id — chat_rate_limits
-- (0023), user_coins (0040), the per-user daily caps in the coin economy. Email
-- confirmation is currently DISABLED in Supabase (blocked on wiring up custom
-- SMTP), so accounts are free, instant and unlimited. That makes every per-user
-- limit trivially defeatable: a script that mints N accounts gets N times the
-- free daily allowance of LLM spend, billed to this project's provider keys.
-- There is no IP-based limiter and, until this migration, no global one either.
-- This table + RPC is the outermost bound: no matter how many accounts exist,
-- the whole deployment stops calling the LLM once it has served
-- `daily_llm_message_cap` chat requests in a single Baku calendar day.
--
-- It is a CIRCUIT BREAKER, not a budget: it is sized so that legitimate traffic
-- never reaches it, and tripping it is an incident (the server logs the trip to
-- error_logs, which is the alarm half of the feature).
--
-- WHY THE DEFAULT IS 2000/DAY:
--   * per-user default allowance is 20 messages/day (chat_rate_limit_max_per_day)
--   * the real user base today is small (tens of users, most of them far below
--     their own daily allowance)
--   * so even if 50 genuinely active users each maxed out their personal limit
--     on the same day, that is 1000 requests — 2000 is ~2x that ceiling, i.e.
--     generous headroom that organic growth will announce well before it hits.
--   * cost per message on the deployed model (deepseek-v4-flash) is ~$0.0013,
--     so 2000 requests bounds WORST-CASE LLM spend at roughly
--         2000 x $0.0013 = ~$2.60/day  (~$78/month if abused every single day).
--     That is a survivable, knowable number; unbounded is not.
-- Raise it from /admin/users (app_settings.daily_llm_message_cap) as real
-- traffic grows — it is meant to be re-tuned, not left forever at 2000.
--
-- DAY BOUNDARY: Baku local midnight, matching every other daily reset in this
-- schema (see 0070_baku_day_boundary.sql). No new date convention is invented
-- here: "today" is `(now() at time zone 'Asia/Baku')::date`, and the TS mirror
-- is lib/date/baku.ts.
--
-- SECURITY POSTURE: the counter table is service-role-only — RLS enabled with
-- ZERO policies, same as app_settings. It is written exclusively by the server
-- (lib/chat/globalLimit.ts via the service-role client) and read by the admin
-- panel through an admin-gated route handler, never directly by a browser.
--
-- APPLY THIS BY HAND in the Supabase SQL editor, after 0092. Fully idempotent
-- and safe to re-run.


-- ===========================================================================
-- Counter table: one row per Baku calendar day.
--
-- Deliberately a COUNTER, not a log of individual requests: the only question
-- ever asked of it is "how many LLM-backed chat requests has the whole
-- deployment served today", which one row per day answers in a single indexed
-- lookup and cannot grow with traffic volume. Per-request forensics already
-- live in chat_request_logs (0007) and error_logs (0073).
-- ===========================================================================
create table if not exists llm_usage_counters (
  usage_date    date primary key,
  request_count int not null default 0,
  updated_at    timestamptz not null default now()
);

alter table llm_usage_counters enable row level security;

-- No policies on purpose: RLS-enabled with zero policies denies anon and
-- authenticated entirely, which is exactly right for a global counter that
-- would leak deployment-wide traffic volume to any logged-in user. Matches the
-- app_settings posture. service_role bypasses RLS and is the only writer.

grant select, insert, update on llm_usage_counters to service_role;


-- ===========================================================================
-- consume_llm_budget(p_cap) — ATOMIC "increment and tell me if I'm over".
--
-- One statement, one round trip, never read-then-write: a read-then-write pair
-- would let two concurrent chat requests both observe count = cap - 1 and both
-- proceed, which is precisely the concurrency the breaker exists to bound.
--
-- The `where c.request_count < p_cap` on the DO UPDATE is what makes this both
-- atomic AND non-inflating: once the cap is reached the row stops being
-- updated, so a sustained flood cannot run the counter to absurd values and the
-- number the admin panel shows stays meaningful ("we stopped at the cap"). The
-- ON CONFLICT path takes a row lock on the day's row, so concurrent callers
-- serialize on it.
--
-- Returns the CURRENT count and whether this particular request is allowed.
-- `allowed = false` means the increment did NOT happen — a rejected request
-- costs no budget.
-- ===========================================================================
create or replace function consume_llm_budget(p_cap int)
returns table (
  usage_count int,
  allowed     boolean
)
language plpgsql
as $$
declare
  v_today date := (now() at time zone 'Asia/Baku')::date;
  v_count int;
begin
  if p_cap is null or p_cap <= 0 then
    raise exception 'invalid_cap';
  end if;

  insert into llm_usage_counters as c (usage_date, request_count, updated_at)
  values (v_today, 1, now())
  on conflict (usage_date) do update
    set request_count = c.request_count + 1,
        updated_at = now()
    where c.request_count < p_cap
  returning c.request_count into v_count;

  if v_count is null then
    -- DO UPDATE's WHERE was not satisfied: the cap is already reached, nothing
    -- was incremented. Read the (frozen-at-cap) count purely for reporting.
    select lc.request_count into v_count
      from llm_usage_counters lc
      where lc.usage_date = v_today;

    return query select coalesce(v_count, 0), false;
  end if;

  return query select v_count, true;
end;
$$;

revoke execute on function consume_llm_budget(int) from public, anon, authenticated;
grant execute on function consume_llm_budget(int) to service_role;


-- ===========================================================================
-- llm_budget_usage_today() — READ-ONLY peek for the admin panel.
--
-- Separate function rather than a flag on the one above, so it is structurally
-- impossible for a dashboard refresh to consume budget: this one has no INSERT
-- or UPDATE in its body at all. Returns 0 (not null) before the day's first
-- request, so the caller never has to distinguish "no row yet" from "zero".
-- ===========================================================================
create or replace function llm_budget_usage_today()
returns int
language sql
stable
as $$
  select coalesce(
    (select lc.request_count
       from llm_usage_counters lc
       where lc.usage_date = (now() at time zone 'Asia/Baku')::date),
    0
  );
$$;

revoke execute on function llm_budget_usage_today() from public, anon, authenticated;
grant execute on function llm_budget_usage_today() to service_role;


-- ===========================================================================
-- app_settings key introduced by this migration (NOT seeded as a row — house
-- convention is a documented key with a TS-side default, so an unset key means
-- "use the code default" rather than a magic row someone has to remember to
-- create):
--
--   daily_llm_message_cap
--     int > 0. Max LLM-backed chat requests the WHOLE deployment will serve in
--     one Baku calendar day. TS default: 2000
--     (DEFAULT_DAILY_LLM_MESSAGE_CAP in lib/chat/globalLimit.ts, overridable at
--     deploy time via the DAILY_LLM_MESSAGE_CAP env var). Editable at
--     /admin/users via PATCH /api/admin/chat-meta?type=llm-circuit-breaker.
-- ===========================================================================
