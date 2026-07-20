-- Security hardening pass, from a three-part audit of the coin economy and
-- the retrieval RPC surface. Every change here closes a CONFIRMED abuse
-- path, most of them empirically verified against the live app.
--
-- THREAT MODEL FOR THIS ENTIRE MIGRATION: email confirmation is currently
-- DISABLED on this Supabase project (the built-in email service only
-- delivers to team members, 2 msg/hour, so the owner turned confirmation
-- off pending a custom SMTP provider). An attacker can therefore create
-- UNLIMITED free accounts at zero cost. Nothing below may rely on "an
-- account is expensive/scarce" as a defence -- that assumption is exactly
-- what the referral and transfer findings (section D) exploited.
--
-- Sections, in apply order:
--   A. ad_view_tokens + consume_ad_view_token   (proof-of-watch for ad reward)
--   C. daily quiz / lesson quiz attempt recording (anti brute-force)
--   D. referral caps, deferred crediting, transfer sender-age + receive cap
--   E. drop leftover debug functions, lock down the match_chunks family
--
-- (Section B of the audit -- push-subscription endpoint validation and a
-- real test-push before crediting -- is pure application code and needs no
-- schema change, so it has no section here.)
--
-- ORDERING NOTE: several functions below CHANGE THEIR ARGUMENT LIST. In
-- Postgres a function is identified by its full argument-type signature, so
-- `create or replace` with an extra parameter does NOT replace the old
-- function -- it creates a SECOND OVERLOAD alongside it, and PostgREST then
-- fails to resolve calls with PGRST203 ("Could not choose the best candidate
-- function"). This project has already been broken once exactly this way --
-- see 0027_fix_match_chunks_overload.sql. Every such function below is
-- therefore explicitly DROPped at its old signature before being recreated.


-- ===========================================================================
-- A. Ad-watch proof-of-watch
-- ===========================================================================
-- Finding: claimAdWatchRewardAction() took NO arguments -- no token, no
-- nonce, no elapsed-time check. The 5-second countdown existed only in the
-- client component (components/account/AdWatchCard.tsx), so five direct
-- POSTs to the server action yielded five coins in under a second, trivially
-- exhausting the daily cap (ad_watch_daily_max, default 5) with no ad ever
-- rendered.
--
-- Fix: the server issues a single-use nonce when an ad view STARTS, and the
-- claim must present it. The elapsed-time check is then a comparison of two
-- SERVER-side timestamps (issued_at vs now()), so no client-supplied
-- duration is ever trusted.
--
-- WHY A TABLE AND NOT AN IN-PROCESS MAP: this app runs on Vercel serverless.
-- The instance that issues a nonce is very often not the instance that
-- receives the claim, so in-memory state would both lose valid nonces and,
-- worse, be unable to detect a replay against a different instance.
--
-- RLS: enabled with NO policies at all -- not even self-select. Same posture
-- as app_settings (0024). This table is written and read exclusively by the
-- service-role client (lib/coins/adWatch.ts) via the RPC below; a user has
-- no legitimate reason to read their own outstanding nonces, and exposing
-- them over PostgREST would hand an attacker the very value the claim path
-- requires them to prove they received.
create table if not exists ad_view_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  nonce text not null unique,
  issued_at timestamptz not null default now(),
  consumed_at timestamptz
);

alter table ad_view_tokens enable row level security;

-- Supports both the per-user staleness sweep in lib/coins/adWatch.ts
-- (delete where user_id = ? and issued_at < ?) and keeps that sweep bounded
-- to one user's rows rather than a full-table scan as the table grows.
create index if not exists ad_view_tokens_user_issued_idx
  on ad_view_tokens (user_id, issued_at);

-- consume_ad_view_token: the atomic claim gate. The validity checks live in
-- the WHERE clause of a single UPDATE, which is what makes replay
-- impossible: two concurrent claims for the same nonce serialise on the
-- row lock, and the loser re-evaluates `consumed_at is null` against the
-- winner's committed value and matches ZERO rows. A read-then-write in
-- application code could not give this guarantee.
--
-- All four required properties are enforced here, in one statement:
--   * nonce exists                     -> `t.nonce = p_nonce`
--   * belongs to THIS user             -> `t.user_id = p_user_id`
--   * unused                           -> `t.consumed_at is null`
--   * ad duration actually elapsed     -> `issued_at <= now() - min_elapsed`
--   * plus: not stale                  -> `issued_at >= now() - max_age`
--
-- Both time bounds use the DATABASE's now() against the DATABASE's stored
-- issued_at, never a timestamp computed by the application server -- so app
-- server/DB clock skew cannot widen or narrow the window.
--
-- The follow-up SELECT only classifies an already-failed attempt into a
-- specific reason for the UI ("wait a moment" vs "start again"). It is
-- scoped by user_id exactly like the UPDATE, so probing another user's
-- nonce returns 'not_found' and leaks nothing about its existence.
create or replace function consume_ad_view_token(
  p_user_id uuid,
  p_nonce text,
  p_min_elapsed_seconds int,
  p_max_age_seconds int
)
returns text
language plpgsql
as $$
declare
  v_id uuid;
  v_issued_at timestamptz;
  v_consumed_at timestamptz;
begin
  update ad_view_tokens t
    set consumed_at = now()
    where t.nonce = p_nonce
      and t.user_id = p_user_id
      and t.consumed_at is null
      and t.issued_at <= now() - make_interval(secs => p_min_elapsed_seconds)
      and t.issued_at >= now() - make_interval(secs => p_max_age_seconds)
    returning t.id into v_id;

  if v_id is not null then
    return 'ok';
  end if;

  select t.issued_at, t.consumed_at
    into v_issued_at, v_consumed_at
    from ad_view_tokens t
    where t.nonce = p_nonce
      and t.user_id = p_user_id;

  if v_issued_at is null then
    return 'not_found';
  end if;
  if v_consumed_at is not null then
    return 'consumed';
  end if;
  if v_issued_at < now() - make_interval(secs => p_max_age_seconds) then
    return 'expired';
  end if;
  return 'too_early';
end;
$$;

-- Same execute-grant gotcha as every prior RPC in this economy (0037/0041/
-- 0042/0049/0051/0053): revoke-from-public also strips service_role's own
-- implicit access, so it must be re-granted explicitly.
revoke execute on function consume_ad_view_token(uuid, text, int, int) from public, anon, authenticated;
grant execute on function consume_ad_view_token(uuid, text, int, int) to service_role;

grant select, insert, update, delete on ad_view_tokens to service_role;


-- ===========================================================================
-- C. Quiz brute-force
-- ===========================================================================
-- Finding, both quizzes: a WRONG answer wrote NOTHING to the database. An
-- attacker simply POSTed every option index until one was accepted -- 4
-- options meant a guaranteed reward by the 4th attempt, every time. The
-- "wrong answers never touch the DB, no cost to guessing" posture documented
-- in 0042/0051 was the bug.
--
-- Fix, both quizzes: RECORD THE ATTEMPT REGARDLESS OF CORRECTNESS, and let
-- the existing unique constraints do the rest. A wrong answer still costs no
-- coins -- it just consumes the one attempt the user gets.

-- C.1 -- daily quiz.
-- A wrong answer now inserts a daily_quiz_claims row with reward = 0, which
-- the original `check (reward > 0)` would reject. Relaxed to >= 0. The
-- constraint still exists (a NEGATIVE reward would be a real bug worth
-- rejecting), it just admits the recorded-but-unrewarded case.
--
-- unique(user_id, claim_date) then blocks the second attempt that day, with
-- no new constraint needed -- exactly the guard 0042 already described, now
-- actually reached by wrong answers too.
alter table daily_quiz_claims drop constraint if exists daily_quiz_claims_reward_check;
alter table daily_quiz_claims add constraint daily_quiz_claims_reward_check check (reward >= 0);

-- Signature change (added p_is_correct) -- must drop the old 2-arg version,
-- see this file's ORDERING NOTE.
drop function if exists claim_daily_quiz_reward(uuid, numeric);

-- Insert-then-CONDITIONALLY-credit, still one transaction, still fail-closed:
-- any unexpected error aborts everything, including the attempt record. The
-- insert happens BEFORE the correctness branch, so an incorrect answer can
-- never leave the DB untouched.
--
-- Returns the user's balance in both cases (unchanged on a wrong answer) so
-- the caller has a consistent numeric return type to check.
create function claim_daily_quiz_reward(
  p_user_id uuid,
  p_reward numeric,
  p_is_correct boolean
)
returns numeric
language plpgsql
as $$
declare
  v_balance numeric;
  v_credited numeric;
begin
  v_credited := case when p_is_correct then p_reward else 0 end;

  begin
    insert into daily_quiz_claims (user_id, claim_date, reward)
    values (p_user_id, current_date, v_credited);
  exception
    when unique_violation then
      raise exception 'already_claimed';
  end;

  insert into user_coins (user_id, balance, daily_limit)
  values (p_user_id, 10, null)
  on conflict (user_id) do nothing;

  update user_coins uc
    set balance = uc.balance + v_credited
    where uc.user_id = p_user_id
    returning uc.balance into v_balance;

  return v_balance;
end;
$$;

revoke execute on function claim_daily_quiz_reward(uuid, numeric, boolean) from public, anon, authenticated;
grant execute on function claim_daily_quiz_reward(uuid, numeric, boolean) to service_role;

-- C.2 -- lesson quiz.
-- user_quiz_answers was a "first CORRECT answer" ledger (0051). It becomes a
-- "first answer, correct or not" ledger, so unique(user_id, question_id)
-- caps every question at ONE attempt ever.
--
-- DEFAULT TRUE IS LOAD-BEARING: every row that exists today was written by
-- the old award_quiz_question_reward, which only ever inserted on a verified
-- correct answer. Defaulting to true keeps all historical rows correctly
-- classified, so existing users' lesson progress is unchanged by this
-- migration.
--
-- RLS: user_quiz_answers_select_own (0051) is a row-level policy with no
-- column list, so it already covers this new column for the owning user --
-- no policy change needed. lib/quiz/lessons.ts reads this column through the
-- RLS-respecting client and works unchanged.
alter table user_quiz_answers add column if not exists is_correct boolean not null default true;

-- Lets getLessons'/getLessonQuestions' per-user reads filter on correctness
-- without a full per-user scan as the answer ledger grows.
create index if not exists user_quiz_answers_user_correct_idx
  on user_quiz_answers (user_id, is_correct);

-- Signature change (added p_is_correct) -- must drop the old 3-arg version,
-- see this file's ORDERING NOTE.
drop function if exists award_quiz_question_reward(uuid, uuid, numeric);

-- Same shape as claim_daily_quiz_reward above: the insert is unconditional
-- and happens first; only the credit is conditional on correctness.
-- unique(user_id, question_id) remains the double-award guard AND is now
-- also the one-attempt guard -- a second call for the same question raises
-- 'already_answered' whether the first attempt was right or wrong.
--
-- Side effect worth stating: this also defangs the separate finding that
-- app/oyrenme/actions.ts accepts an arbitrary questionId with no check that
-- the user ever opened the lesson. Enumerating the published bank is still
-- possible, but each probe PERMANENTLY BURNS that question for the attacker's
-- own account, so enumeration destroys exactly the thing it was trying to
-- farm.
create function award_quiz_question_reward(
  p_user_id uuid,
  p_question_id uuid,
  p_reward numeric,
  p_is_correct boolean
)
returns numeric
language plpgsql
as $$
declare
  v_id uuid;
  v_balance numeric;
  v_credited numeric;
begin
  v_credited := case when p_is_correct then p_reward else 0 end;

  insert into user_quiz_answers (user_id, question_id, is_correct)
  values (p_user_id, p_question_id, p_is_correct)
  on conflict (user_id, question_id) do nothing
  returning id into v_id;

  if v_id is null then
    raise exception 'already_answered';
  end if;

  insert into user_coins (user_id, balance, daily_limit)
  values (p_user_id, 10, null)
  on conflict (user_id) do nothing;

  update user_coins uc
    set balance = uc.balance + v_credited
    where uc.user_id = p_user_id
    returning uc.balance into v_balance;

  return v_balance;
end;
$$;

revoke execute on function award_quiz_question_reward(uuid, uuid, numeric, boolean) from public, anon, authenticated;
grant execute on function award_quiz_question_reward(uuid, uuid, numeric, boolean) to service_role;


-- ===========================================================================
-- D. Referral farming and coin concentration
-- ===========================================================================
-- Finding: grant_referral_bonus (0049) only conflicted on referred_id, so
-- referrer_id was completely unconstrained -- ONE account could refer
-- unlimited accounts at +5 each. The only self-referral guard was
-- `p_referrer_id = p_referred_id`, which two accounts owned by the same
-- person trivially pass. And the bonus was granted AT SIGNUP, before the
-- referred account did anything at all. Under this migration's threat model
-- (free unlimited accounts) that is an uncapped coin printer.
--
-- Three independent changes, all needed -- any one alone leaves the loop
-- viable:
--   D.1 cap paid referrals per referrer in a rolling 30-day window
--   D.2 pay only after the referred account demonstrates real usage
--   D.3 slow the concentration step (transfers) with a sender account-age
--       minimum and a per-RECIPIENT daily cap

-- D.1 + D.2 -- the referral row is now recorded at signup as PENDING
-- (bonus_claimed = false, which 0049's schema already supports) and credited
-- later, from the referred user's first successfully-completed chat message.
-- Splitting the old single grant_referral_bonus into two functions is what
-- makes that possible: the two halves happen in different requests, minutes
-- or days apart, and the second half doesn't know (and must not be told by
-- the client) who the referrer was -- it looks that up from the pending row.

-- record_pending_referral: signup-time half. Records the relationship, mints
-- NOTHING. Keeps 0049's self_referral guard and its `on conflict
-- (referred_id) do nothing` idempotency -- a given account can be recorded as
-- "referred" at most once ever, by whoever got there first.
create or replace function record_pending_referral(
  p_referrer_id uuid,
  p_referred_id uuid
)
returns boolean
language plpgsql
as $$
declare
  v_id uuid;
begin
  if p_referrer_id = p_referred_id then
    raise exception 'self_referral';
  end if;

  insert into referrals (referrer_id, referred_id, bonus_claimed)
  values (p_referrer_id, p_referred_id, false)
  on conflict (referred_id) do nothing
  returning id into v_id;

  return v_id is not null;
end;
$$;

revoke execute on function record_pending_referral(uuid, uuid) from public, anon, authenticated;
grant execute on function record_pending_referral(uuid, uuid) to service_role;

-- claim_pending_referral: usage-time half, called from the chat route's
-- post-stream success path (the same point debitCoins already runs).
--
-- `for update skip locked` is the race guard. Two chat completions finishing
-- concurrently for the same brand-new user would otherwise both read the
-- pending row and both credit. With skip locked, the loser finds no row and
-- returns "nothing to do" rather than blocking or double-paying.
--
-- THE 30-DAY CAP COUNTS ONLY bonus_claimed = true ROWS, deliberately. Pending
-- rows are attacker-controlled (anyone can sign up with someone's code), so
-- counting them would let an attacker exhaust a legitimate user's referral
-- cap with throwaway signups that never chat -- a denial-of-earnings attack.
-- Only actually-PAID referrals count against the limit.
--
-- Hitting the cap returns (false, null, null) rather than raising. This runs
-- on a best-effort, non-blocking path inside a chat response; an exception
-- there is noise, not signal, and must never surface to the user.
create or replace function claim_pending_referral(
  p_referred_id uuid,
  p_bonus_amount numeric,
  p_max_per_30d int
)
returns table (
  bonus_claimed boolean,
  referrer_balance numeric,
  referred_balance numeric
)
language plpgsql
as $$
declare
  v_id uuid;
  v_referrer_id uuid;
  v_recent_count int;
  v_referrer_balance numeric;
  v_referred_balance numeric;
begin
  select r.id, r.referrer_id
    into v_id, v_referrer_id
    from referrals r
    where r.referred_id = p_referred_id
      and r.bonus_claimed = false
    for update skip locked;

  if v_id is null then
    return query select false, null::numeric, null::numeric;
    return;
  end if;

  select count(*) into v_recent_count
    from referrals r
    where r.referrer_id = v_referrer_id
      and r.bonus_claimed = true
      and r.created_at >= now() - interval '30 days';

  if v_recent_count >= p_max_per_30d then
    return query select false, null::numeric, null::numeric;
    return;
  end if;

  insert into user_coins (user_id, balance, daily_limit)
  values (v_referrer_id, 10, null)
  on conflict (user_id) do nothing;

  insert into user_coins (user_id, balance, daily_limit)
  values (p_referred_id, 10, null)
  on conflict (user_id) do nothing;

  update user_coins uc
    set balance = uc.balance + p_bonus_amount
    where uc.user_id = v_referrer_id
    returning uc.balance into v_referrer_balance;

  update user_coins uc
    set balance = uc.balance + p_bonus_amount
    where uc.user_id = p_referred_id
    returning uc.balance into v_referred_balance;

  update referrals
    set bonus_claimed = true
    where id = v_id;

  return query select true, v_referrer_balance, v_referred_balance;
end;
$$;

revoke execute on function claim_pending_referral(uuid, numeric, int) from public, anon, authenticated;
grant execute on function claim_pending_referral(uuid, numeric, int) to service_role;

-- Supports claim_pending_referral's rolling-window count. The partial
-- predicate keeps it small -- only paid referrals are ever counted.
create index if not exists referrals_referrer_claimed_idx
  on referrals (referrer_id, created_at)
  where bonus_claimed = true;

-- The old single-shot mint is now fully replaced by the two functions above
-- and has NO remaining call sites (lib/coins/referrals.ts was rewritten).
-- Dropping it rather than leaving it in place: it is an uncapped,
-- signup-time coin mint, and a leftover mint function is precisely the class
-- of thing section E is about.
drop function if exists grant_referral_bonus(uuid, uuid, numeric);

-- D.3 -- transfers.
-- Two gaps, both on the concentration step of the farming loop (many
-- throwaway accounts funnelling coins into one real account):
--   (a) no minimum account age on the SENDER, so a 10-second-old account
--       could immediately forward its starting balance and any referral
--       bonus onward;
--   (b) the daily cap at 0045 counted sender_id ONLY, leaving the RECEIVING
--       side completely unbounded -- N farmed accounts could each send under
--       their own cap and concentrate arbitrarily much into one recipient.
--
-- Signature change (added two params) -- must drop the old 5-arg version,
-- see this file's ORDERING NOTE.
drop function if exists transfer_coins(uuid, uuid, numeric, numeric, numeric);

-- Body is 0045's, unchanged except for the two new checks (marked below).
-- Still fails closed: any raised exception aborts the whole transfer,
-- including the notification insert.
create function transfer_coins(
  p_sender_id uuid,
  p_recipient_id uuid,
  p_amount numeric,
  p_default_daily_limit numeric,
  p_daily_transfer_cap numeric,
  p_min_account_age_days int,
  p_daily_receive_cap numeric
)
returns table (
  sender_balance numeric,
  recipient_balance numeric
)
language plpgsql
as $$
declare
  v_sender_balance numeric;
  v_sender_daily_limit numeric;
  v_recipient_balance numeric;
  v_effective_daily_limit numeric;
  v_transferable numeric;
  v_already_sent_today numeric;
  v_already_received_today numeric;
  v_sender_created_at timestamptz;
  v_sender_balance_after numeric;
  v_recipient_balance_after numeric;
begin
  if p_sender_id = p_recipient_id then
    raise exception 'sender_equals_recipient';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_amount';
  end if;

  -- NEW (D.3a): minimum sender account age. Checked before any balance work
  -- so a too-new sender never even takes the row locks below. A missing
  -- profiles row is treated as too-new (fail closed) rather than skipped.
  select p.created_at into v_sender_created_at
    from profiles p where p.id = p_sender_id;

  if v_sender_created_at is null
     or v_sender_created_at > now() - make_interval(days => p_min_account_age_days) then
    raise exception 'sender_account_too_new';
  end if;

  insert into user_coins (user_id, balance, daily_limit)
  values (p_sender_id, p_default_daily_limit, null)
  on conflict (user_id) do nothing;

  insert into user_coins (user_id, balance, daily_limit)
  values (p_recipient_id, p_default_daily_limit, null)
  on conflict (user_id) do nothing;

  -- Locks are taken in a deterministic id order to avoid deadlocking against
  -- a simultaneous transfer in the opposite direction (0041/0045).
  if p_sender_id < p_recipient_id then
    select uc.balance, uc.daily_limit into v_sender_balance, v_sender_daily_limit
      from user_coins uc where uc.user_id = p_sender_id for update;
    select uc.balance into v_recipient_balance
      from user_coins uc where uc.user_id = p_recipient_id for update;
  else
    select uc.balance into v_recipient_balance
      from user_coins uc where uc.user_id = p_recipient_id for update;
    select uc.balance, uc.daily_limit into v_sender_balance, v_sender_daily_limit
      from user_coins uc where uc.user_id = p_sender_id for update;
  end if;

  v_effective_daily_limit := coalesce(v_sender_daily_limit, p_default_daily_limit);
  v_transferable := greatest(0, v_sender_balance - v_effective_daily_limit);

  if p_amount > v_transferable then
    raise exception 'insufficient_transferable_balance';
  end if;

  select coalesce(sum(ct.amount), 0) into v_already_sent_today
    from coin_transfers ct
    where ct.sender_id = p_sender_id
      and ct.created_at >= date_trunc('day', now());

  if v_already_sent_today + p_amount > p_daily_transfer_cap then
    raise exception 'daily_transfer_cap_exceeded';
  end if;

  -- NEW (D.3b): per-RECIPIENT daily received cap, symmetric to the
  -- per-sender cap above. Safe under concurrency because the recipient's
  -- user_coins row is already locked at this point, so two inbound transfers
  -- to the same recipient serialise here rather than both reading a stale
  -- received-today sum.
  select coalesce(sum(ct.amount), 0) into v_already_received_today
    from coin_transfers ct
    where ct.recipient_id = p_recipient_id
      and ct.created_at >= date_trunc('day', now());

  if v_already_received_today + p_amount > p_daily_receive_cap then
    raise exception 'daily_receive_cap_exceeded';
  end if;

  update user_coins uc
    set balance = uc.balance - p_amount
    where uc.user_id = p_sender_id
    returning uc.balance into v_sender_balance_after;

  update user_coins uc
    set balance = uc.balance + p_amount
    where uc.user_id = p_recipient_id
    returning uc.balance into v_recipient_balance_after;

  insert into coin_transfers (sender_id, recipient_id, amount)
  values (p_sender_id, p_recipient_id, p_amount);

  insert into notifications (user_id, message, link)
  values (p_recipient_id, 'Sizə ' || p_amount || ' coin köçürüldü', '/account');

  return query select v_sender_balance_after, v_recipient_balance_after;
end;
$$;

revoke execute on function transfer_coins(uuid, uuid, numeric, numeric, numeric, int, numeric) from public, anon, authenticated;
grant execute on function transfer_coins(uuid, uuid, numeric, numeric, numeric, int, numeric) to service_role;

-- Makes the new per-recipient daily sum an index lookup rather than a scan
-- of the sender-indexed table from the wrong side.
create index if not exists coin_transfers_recipient_created_idx
  on coin_transfers (recipient_id, created_at);

-- Re-grants on the tables touched above are harmless/idempotent, restated
-- here for this migration's self-sufficiency (see 0037/0041/0042/0049).
grant select, insert, update on referrals to service_role;
grant select, insert, update on coin_transfers to service_role;
grant select, insert, update on user_coins to service_role;
grant select, insert, update on notifications to service_role;
grant select on profiles to service_role;
grant select, insert on user_quiz_answers to service_role;
grant select, insert on daily_quiz_claims to service_role;


-- ===========================================================================
-- E. Leftover and ungated database functions
-- ===========================================================================

-- E.1 -- throwaway diagnostics that were never dropped.
--
-- debug_explain_match_chunks_per_document (0031) wraps EXPLAIN (ANALYZE,
-- BUFFERS) over the entire corpus. It has no execute revoke, so it kept
-- Postgres' default PUBLIC grant, meaning ANY authenticated user could call
-- it over PostgREST and run unbounded analyse-everything queries in a loop --
-- a cheap denial-of-service against the same database that serves chat. Its
-- own header comment says to drop it once diagnosis is done; this is that.
drop function if exists debug_explain_match_chunks_per_document(vector(384), text, int);

-- test_trgm_guc_local (0033) is the other throwaway from the same
-- investigation, and is ungated for the same reason. It is far more benign
-- (a transaction-local set_config probe returning a string, no corpus
-- access), but its own comment likewise says to drop it after one run, and
-- dead ungated schema is what section E exists to remove.
drop function if exists test_trgm_guc_local();

-- E.2 -- lock down the match_chunks family.
--
-- Unlike every coin RPC, these six never had execute revoked, so they kept
-- the default PUBLIC grant and were directly callable over PostgREST by any
-- authenticated user (and, via the anon key, without an account at all).
-- They are the most expensive queries in the system -- an unindexed
-- word_similarity() trigram join plus a full sequential vector scan (there
-- is no vector index; see 0008 and 0058's header) -- and
-- match_chunks_per_document takes a CALLER-CONTROLLED per_document_limit
-- that directly scales the candidate pool. Calling them directly bypasses
-- the chat route's auth gate, rate limiting (0023/0028) and coin gating
-- (0036) entirely.
--
-- VERIFIED BEFORE REVOKING: lib/retrieval/search.ts is the only application
-- call site for all six, and every one of its three functions builds its
-- client with createAdminClient() (the service-role client), never the
-- RLS-respecting createClient(). So revoking authenticated/anon execute
-- cannot break retrieval.
--
-- Signatures below are taken from the CURRENT live definitions -- the local
-- three from 0057 (match_chunks, match_chunks_per_document) and 0032
-- (match_chunks_by_article), the gemini three from 0058 -- not from their
-- original migrations. A revoke against a signature that doesn't exist is a
-- SILENT NO-OP that leaves the function wide open, so these must match
-- exactly. Note in particular that match_chunks is the 5-arg version: 0027
-- dropped the old 4-arg overload, so only this one remains.
revoke execute on function match_chunks(vector(384), int, uuid, text, uuid[]) from public, anon, authenticated;
grant execute on function match_chunks(vector(384), int, uuid, text, uuid[]) to service_role;

revoke execute on function match_chunks_per_document(vector(384), text, int) from public, anon, authenticated;
grant execute on function match_chunks_per_document(vector(384), text, int) to service_role;

revoke execute on function match_chunks_by_article(vector(384), text[], int) from public, anon, authenticated;
grant execute on function match_chunks_by_article(vector(384), text[], int) to service_role;

revoke execute on function match_chunks_gemini(vector(1536), int, uuid, text, uuid[]) from public, anon, authenticated;
grant execute on function match_chunks_gemini(vector(1536), int, uuid, text, uuid[]) to service_role;

revoke execute on function match_chunks_per_document_gemini(vector(1536), text, int) from public, anon, authenticated;
grant execute on function match_chunks_per_document_gemini(vector(1536), text, int) to service_role;

revoke execute on function match_chunks_by_article_gemini(vector(1536), text[], int) from public, anon, authenticated;
grant execute on function match_chunks_by_article_gemini(vector(1536), text[], int) to service_role;

-- az_unaccent (0057) is deliberately NOT revoked: it is a pure, cheap
-- translate() on a single text value with no table access, and the six
-- functions above call it internally, which is unaffected by caller grants.


-- ===========================================================================
-- New admin-configurable tunables
-- ===========================================================================
-- Same app_settings key-value convention as every prior migration in this
-- series (chat_message_price/daily_quiz_reward/ad_watch_reward/...) -- NO
-- SEED ROWS INSERTED; the TS side hardcodes the default and passes the
-- resolved value into the RPC as a parameter.
--
--   referral_max_per_30d               -- default 10 (lib/coins/referrals.ts).
--                                         Max PAID referrals one referrer can
--                                         collect in a rolling 30-day window.
--                                         10 is generous for a genuine user
--                                         sharing with friends, while capping
--                                         a farmer at 50 coins/month from this
--                                         mechanic instead of unbounded.
--
--   coin_transfer_min_account_age_days -- default 7 (lib/coins/transfers.ts).
--                                         A sender's profiles.created_at must
--                                         be older than this before
--                                         transfer_coins will accept a send.
--                                         Directly targets the "create account,
--                                         immediately forward its coins" step;
--                                         7 days makes each mule account cost a
--                                         week of waiting, which no amount of
--                                         free signups can compress.
--
--   coin_transfer_daily_receive_cap    -- default 20 (lib/coins/transfers.ts).
--                                         Max coins one account may RECEIVE per
--                                         day across all senders. Set equal to
--                                         coin_transfer_daily_cap's default of
--                                         20 so the two sides are symmetric: one
--                                         account can no longer absorb the daily
--                                         output of arbitrarily many senders.
--
-- app_settings already has RLS enabled with no policies (0024), i.e. it is
-- service-role-only -- none of these keys need a new policy.
