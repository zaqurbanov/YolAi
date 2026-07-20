-- Restructured lessons system ("Öyrənmə"): COURSES built from ingested
-- documents, replacing the 8 fixed RULE_CATEGORIES model entirely.
--
-- WHY THE MODEL CHANGED
-- The previous design (a superseded, NEVER-APPLIED 0060_lesson_unlock_economy
-- .sql, deleted in the same change as this file) keyed everything on a static
-- 8-entry category list in lib/content/ruleCategories.ts. That list is
-- application constant data with no relationship to what an admin actually
-- uploaded: 27 documents are ingested, each with its own structure, and there
-- is no sane mapping from "Nişanlar"/"Cərimələr" onto them. Nothing in the
-- database was ever created for that model, so there is no data to migrate --
-- this file is the first lessons-structure migration to actually run.
--
-- THE MODEL
--   course  = one source document (lesson_courses.document_id -> documents).
--   topic   = one ordered section of that course (lesson_topics), carrying
--             LLM-drafted reading material plus a pool of 15-20 questions.
--   test    = 10 questions drawn at random from that topic's pool; passing is
--             >= 8 correct (both numbers are app_settings tunables, see the
--             trailing comment block at the bottom of this file).
--   unlock  = passing a topic unlocks the NEXT topic in the SAME course.
--             Progress is per-course, not global: a user stuck on topic 4 of
--             course A can still work through course B. This is why
--             user_topic_progress is keyed on topic and not on any global
--             sequence number -- there is no global sequence.
--   limit   = one attempt per topic per calendar day (UTC), enforced in
--             record_lesson_attempt below against lesson_attempts, with paid
--             retries as the escape hatch.
--
-- PHASE BOUNDARIES. Phase 1 (this migration + the admin content-generation
-- layer) only needs lesson_courses/lesson_topics/quiz_questions.topic_id to be
-- populated. Phase 2 (the end-user learn -> test flow) reads
-- user_topic_progress/lesson_attempts. Phase 3 (coin integration) drives
-- unlock_lesson_course and the retry counters. All of it is defined HERE, in
-- one migration, deliberately: the per-user tables and their RPCs are cheap to
-- create and impossible to add later without a second migration against live
-- data, and the whole point of this file is that the schema serves all three
-- phases without re-migrating.
--
-- RLS POSTURE (this repo has 100% RLS coverage; a security audit confirmed it
-- and this migration does not become the first gap):
--   * lesson_courses  -- published rows readable by any authenticated user.
--     Locked courses MUST still be listable, otherwise there is nothing to
--     show a purchase button for.
--   * lesson_topics   -- readable only when the topic is published AND the
--     enclosing course is published AND the user can actually access that
--     course (course is_free, or a user_course_unlocks row exists). This is
--     deliberately STRICTER than lesson_courses: a topic row carries the full
--     reading material, which is the paid product. A "published topics are
--     readable" policy would let anyone with the anon key read every paid
--     course's content straight out of PostgREST, bypassing the purchase
--     entirely. The subquery is indexed by user_course_unlocks' unique
--     (user_id, course_id).
--   * user_*/lesson_attempts -- self-SELECT only, and NO insert/update/delete
--     policy for anon or authenticated. Every write goes through the RPCs
--     below, called with the service-role client from server-side code that
--     has already established the caller's identity. Same shape as
--     user_quiz_answers (0051), daily_quiz_claims (0042), ad_watch_claims
--     (0053).

-- ---------------------------------------------------------------------------
-- RE-RUN GUARD
--
-- The first attempt at this migration aborted partway (`42P01: relation
-- "user_course_unlocks" does not exist` -- lesson_topics' RLS policy
-- subqueried a table that was declared further down; that ordering is fixed
-- below). Depending on whether the SQL editor wrapped the script in a
-- transaction, that attempt may have left lesson_courses / lesson_topics
-- already created, which would make a straight re-run fail on "already
-- exists" instead.
--
-- These drops make the file safe to run from either state. They are scoped to
-- exactly the objects THIS migration creates and nothing else -- note in
-- particular that quiz_questions itself is never dropped, only the topic_id
-- column this migration adds to it. All five tables are new here, so there is
-- no user data to lose. Once this migration has applied cleanly, this block is
-- a no-op on every subsequent run.
-- ---------------------------------------------------------------------------
drop function if exists unlock_lesson_course(uuid, uuid, numeric);
drop function if exists purchase_lesson_retry(uuid, uuid, numeric);
drop function if exists record_lesson_attempt(uuid, uuid, int, int, int);
drop function if exists reorder_lesson_topics(uuid, uuid[]);

alter table quiz_questions drop column if exists topic_id;

drop table if exists lesson_attempts cascade;
drop table if exists user_topic_progress cascade;
drop table if exists user_course_unlocks cascade;
drop table if exists lesson_topics cascade;
drop table if exists lesson_courses cascade;

-- lesson_courses: one row per document an admin has turned into a course.
--
-- document_id is `on delete cascade` -- a course has no meaning without its
-- source document, and citations in lesson_topics.source_citations point at
-- that document's chunks. It is NOT unique: an admin may legitimately want to
-- build two differently-scoped courses (e.g. a short intro and a full course)
-- from one large document.
--
-- unlock_price is NULLABLE and null means "use the global
-- lesson_course_unlock_price setting". A per-course override is stored only
-- when an admin deliberately sets one. Do not backfill this with the global
-- default -- that would silently freeze every existing course's price at
-- whatever the global happened to be on migration day.
--
-- is_free is independent of order_index (unlike the deleted design's "first N
-- categories in array order are free"): which course is the free one is an
-- explicit editorial decision, not a side effect of sort order.
create table lesson_courses (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  title text not null,
  description text,
  order_index int not null default 0,
  is_free boolean not null default false,
  unlock_price numeric(10,2) check (unlock_price is null or unlock_price >= 0),
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table lesson_courses enable row level security;

create policy lesson_courses_select_published
  on lesson_courses for select
  to authenticated
  using (status = 'published');

-- The /oyrenme course list is exactly "published courses in order_index
-- order", one query per page load.
create index lesson_courses_status_order_idx on lesson_courses (status, order_index);
create index lesson_courses_document_id_idx on lesson_courses (document_id);

-- lesson_topics: the ordered sections of a course.
--
-- content is the LLM-drafted reading material, in Azerbaijani, grounded in the
-- source document's chunks. It is NEVER auto-published (status defaults to
-- 'draft') -- same posture as quiz_questions (0051): a generated artifact that
-- an admin must review before a user can see it. Hallucination avoidance is a
-- hard product requirement here, and an LLM draft is not review.
--
-- source_citations is a jsonb array of the chunks the content was drawn from,
-- shaped [{ "chunk_id": uuid, "article_label": "Maddə 45.", "page_number": 12 }].
-- Stored as a snapshot rather than a join table on purpose: it records what the
-- generation actually saw, and must stay stable even if the document is later
-- re-ingested and its chunk rows are replaced. Consequently chunk_id is NOT a
-- foreign key and may dangle -- readers must treat it as a hint, and rely on
-- article_label/page_number for display.
--
-- unique (course_id, order_index) is DEFERRABLE INITIALLY DEFERRED because the
-- obvious admin action -- drag-to-reorder topics -- writes a permutation of
-- existing indexes, and any permutation of more than one row transiently
-- collides. With an immediate constraint the only ways to reorder are a
-- temporary-negative-index dance or renumbering with gaps, both of which leak
-- into application code. Deferred, reorder_lesson_topics below just writes the
-- new indexes and the constraint is checked once at commit.
-- NOTE: a deferrable unique constraint cannot back an ON CONFLICT clause. No
-- code path upserts on (course_id, order_index), and none should be added.
-- user_course_unlocks: the purchase ledger AND the authorization record.
--
-- DEFINED BEFORE lesson_topics ON PURPOSE: lesson_topics' RLS policy below
-- subqueries this table, and Postgres resolves relation names when the policy
-- is created, not when it is evaluated. Declaring it later made the whole
-- migration abort with `42P01: relation "user_course_unlocks" does not exist`.
-- If these blocks are ever reordered again, this dependency has to move with
-- them.
--
-- unique (user_id, course_id) is what makes unlock_lesson_course idempotent
-- under a double-submit or a race -- the second concurrent call blocks on the
-- user_coins row lock, then loses the insert and raises 'already_unlocked'
-- rather than debiting a second time.
--
-- price_paid records the price AT PURCHASE TIME, not the current price: it is
-- an audit trail of what the user was actually charged and must never be read
-- back as "the current price" (that always resolves from
-- lesson_courses.unlock_price or app_settings).
create table user_course_unlocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  course_id uuid not null references lesson_courses(id) on delete cascade,
  price_paid numeric(10,2) not null check (price_paid >= 0),
  unlocked_at timestamptz not null default now(),
  unique (user_id, course_id)
);

alter table user_course_unlocks enable row level security;

create policy user_course_unlocks_select_own
  on user_course_unlocks for select
  to authenticated
  using (user_id = auth.uid());

-- getCourses() reads all of a user's unlocks in one query per page load;
-- user_id alone is the whole access pattern. The unique constraint above
-- separately covers the (user_id, course_id) point lookup used by the
-- lesson_topics RLS policy.
create index user_course_unlocks_user_id_idx on user_course_unlocks (user_id);

create table lesson_topics (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references lesson_courses(id) on delete cascade,
  title text not null,
  content text,
  source_citations jsonb not null default '[]'::jsonb,
  order_index int not null,
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lesson_topics_course_order_key unique (course_id, order_index)
    deferrable initially deferred
);

alter table lesson_topics enable row level security;

-- See the RLS POSTURE note at the top: intentionally stricter than
-- lesson_courses. Reading material is the paid product.
create policy lesson_topics_select_accessible
  on lesson_topics for select
  to authenticated
  using (
    status = 'published'
    and exists (
      select 1
        from lesson_courses c
        where c.id = lesson_topics.course_id
          and c.status = 'published'
          and (
            c.is_free
            or exists (
              select 1
                from user_course_unlocks u
                where u.course_id = c.id
                  and u.user_id = auth.uid()
            )
          )
    )
  );

create index lesson_topics_course_order_idx on lesson_topics (course_id, order_index);

-- quiz_questions gains topic_id. The existing `category` column is KEPT and
-- kept NOT NULL: 0051's admin quiz bank (app/admin/quiz, /api/admin/quiz-
-- questions) still writes and reads it, and dropping it would break those
-- paths for no benefit. The two coexist -- category-authored questions have a
-- null topic_id, topic-authored questions carry both (the generator writes a
-- placeholder category so the NOT NULL holds).
--
-- topic_id is `on delete cascade`: a topic's question pool has no meaning
-- without the topic. Deleting a topic deletes its generated pool, which is the
-- intended admin behaviour -- regeneration is one click.
alter table quiz_questions
  add column topic_id uuid references lesson_topics(id) on delete cascade;

-- The Phase 2 hot query is "published questions for one topic", which is then
-- sampled down to lesson_topic_questions_per_attempt in the application.
create index quiz_questions_topic_status_idx on quiz_questions (topic_id, status);

-- user_topic_progress: the per-(user, topic) rollup. Derivable from
-- lesson_attempts by aggregation, and stored anyway -- the gate "is the next
-- topic unlocked" is read on every course page load for every topic in the
-- course, and answering it with a max()/bool_or() over an ever-growing
-- attempts table is the wrong shape for a hot read path.
--
-- retries_purchased/retries_used are the paid-retry counters (Phase 3). They
-- live here rather than in a separate grants table because a retry is only
-- ever meaningful against one (user, topic) and is consumed immediately;
-- `retries_purchased > retries_used` is the entire "may attempt again today
-- despite the daily limit" predicate, evaluated inside record_lesson_attempt.
create table user_topic_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  topic_id uuid not null references lesson_topics(id) on delete cascade,
  passed boolean not null default false,
  best_score int not null default 0 check (best_score >= 0),
  attempts int not null default 0 check (attempts >= 0),
  retries_purchased int not null default 0 check (retries_purchased >= 0),
  retries_used int not null default 0 check (retries_used >= 0),
  passed_at timestamptz,
  last_attempt_at timestamptz,
  unique (user_id, topic_id)
);

alter table user_topic_progress enable row level security;

create policy user_topic_progress_select_own
  on user_topic_progress for select
  to authenticated
  using (user_id = auth.uid());

create index user_topic_progress_user_id_idx on user_topic_progress (user_id);

-- lesson_attempts: the immutable per-attempt history. Two jobs:
--   1. enforces the one-attempt-per-topic-per-day rule (the `exists` check in
--      record_lesson_attempt is against THIS table, not against
--      user_topic_progress.last_attempt_at -- an append-only log is the honest
--      source for "did they attempt today", and it survives any future change
--      to how the rollup is maintained).
--   2. gives the user and the admin a real attempt history (scores over time),
--      which the rollup deliberately does not retain.
create table lesson_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  topic_id uuid not null references lesson_topics(id) on delete cascade,
  score int not null check (score >= 0),
  total int not null check (total > 0),
  passed boolean not null,
  created_at timestamptz not null default now()
);

alter table lesson_attempts enable row level security;

create policy lesson_attempts_select_own
  on lesson_attempts for select
  to authenticated
  using (user_id = auth.uid());

-- Serves both the daily-limit existence check (user_id, topic_id, today) and
-- the "my attempt history, newest first" read, in that column order.
create index lesson_attempts_user_topic_created_idx
  on lesson_attempts (user_id, topic_id, created_at desc);

-- unlock_lesson_course: debit + record in ONE transaction.
--
-- This is the reviewed shape carried over verbatim from the deleted 0060's
-- unlock_lesson_category, retargeted from `p_category text` to
-- `p_course_id uuid`. The reasoning below is unchanged and still applies:
--
-- Lock ordering follows claim_ad_watch_reward (0053) and transfer_coins
-- (0045/0059): take `for update` on the user's user_coins row BEFORE reading
-- the balance, so two concurrent unlock attempts serialise. Without the lock
-- both could read a sufficient balance and both debit; with it, the second
-- blocks until the first commits, then either sees the reduced balance or
-- loses the unique-constraint race on the insert.
--
-- The insert comes BEFORE the debit deliberately: 'already_unlocked' must
-- abort the function with no coins moved. Since the whole plpgsql body is one
-- transaction, a raise at any point rolls back the insert too -- fails closed
-- either way, but this ordering keeps the failure mode obvious.
--
-- p_price is passed in from TS (resolved server-side from
-- lesson_courses.unlock_price or app_settings, never from the client) rather
-- than read here, matching every other RPC in this economy -- the
-- price-resolution logic lives in one place, in lib/coins/lessonUnlock.ts.
--
-- Creates the user_coins row on first-ever coin interaction with the same
-- default convention as 0036 (balance 10, daily_limit null == global default).
create function unlock_lesson_course(
  p_user_id uuid,
  p_course_id uuid,
  p_price numeric
)
returns numeric
language plpgsql
as $$
declare
  v_id uuid;
  v_balance numeric;
begin
  if p_price is null or p_price < 0 then
    raise exception 'invalid_price';
  end if;

  insert into user_coins (user_id, balance, daily_limit)
  values (p_user_id, 10, null)
  on conflict (user_id) do nothing;

  select uc.balance into v_balance
    from user_coins uc
    where uc.user_id = p_user_id
    for update;

  if v_balance is null then
    raise exception 'insufficient_coins';
  end if;

  insert into user_course_unlocks (user_id, course_id, price_paid)
  values (p_user_id, p_course_id, p_price)
  on conflict (user_id, course_id) do nothing
  returning id into v_id;

  if v_id is null then
    raise exception 'already_unlocked';
  end if;

  if v_balance < p_price then
    raise exception 'insufficient_coins';
  end if;

  update user_coins uc
    set balance = uc.balance - p_price
    where uc.user_id = p_user_id
    returning uc.balance into v_balance;

  return v_balance;
end;
$$;

-- Same execute-grant gotcha as every prior RPC in this economy (0037/0041/
-- 0042/0049/0051/0052/0053): revoke-from-public also strips service_role's own
-- implicit access, so it must be re-granted explicitly. Forgetting the re-grant
-- is a recurring bug in this repo.
revoke execute on function unlock_lesson_course(uuid, uuid, numeric) from public, anon, authenticated;
grant execute on function unlock_lesson_course(uuid, uuid, numeric) to service_role;

-- purchase_lesson_retry: debit coins, increment the retry allowance for one
-- (user, topic). Same lock-then-read-balance ordering as unlock_lesson_course.
--
-- Unlike the unlock, this is intentionally REPEATABLE -- a user may buy a
-- second retry after burning the first -- so there is no unique constraint to
-- lean on for idempotency. The `for update` on user_coins is therefore doing
-- all of the serialising work here, and is not optional.
--
-- Only sold when the user actually needs it; the "already has an unused retry"
-- and "hasn't attempted today anyway" checks live in TS, since selling a
-- pointless retry is a product bug, not a data-integrity one.
create function purchase_lesson_retry(
  p_user_id uuid,
  p_topic_id uuid,
  p_price numeric
)
returns numeric
language plpgsql
as $$
declare
  v_balance numeric;
begin
  if p_price is null or p_price < 0 then
    raise exception 'invalid_price';
  end if;

  insert into user_coins (user_id, balance, daily_limit)
  values (p_user_id, 10, null)
  on conflict (user_id) do nothing;

  select uc.balance into v_balance
    from user_coins uc
    where uc.user_id = p_user_id
    for update;

  if v_balance is null or v_balance < p_price then
    raise exception 'insufficient_coins';
  end if;

  insert into user_topic_progress (user_id, topic_id, retries_purchased)
  values (p_user_id, p_topic_id, 1)
  on conflict (user_id, topic_id) do update
    set retries_purchased = user_topic_progress.retries_purchased + 1;

  update user_coins uc
    set balance = uc.balance - p_price
    where uc.user_id = p_user_id
    returning uc.balance into v_balance;

  return v_balance;
end;
$$;

revoke execute on function purchase_lesson_retry(uuid, uuid, numeric) from public, anon, authenticated;
grant execute on function purchase_lesson_retry(uuid, uuid, numeric) to service_role;

-- record_lesson_attempt: the single write path for a completed topic test.
-- Appends to lesson_attempts, enforces the daily limit, consumes a paid retry
-- when one is needed and available, and updates the rollup -- all in one
-- transaction, so a rejected attempt leaves no trace and an accepted one can
-- never be logged without its rollup update.
--
-- DAILY LIMIT. "Today" is `created_at >= date_trunc('day', now())` in the
-- database's timezone (UTC on Supabase). This is a deliberate simplification
-- over per-user local midnight: the same convention every other daily
-- mechanic in this app uses (daily_quiz_claims 0042, ad_watch_claims 0053),
-- and being consistent with those matters more than being locally correct in
-- one of them.
--
-- The `for update` on user_topic_progress is what makes the limit real: two
-- concurrent submissions would otherwise both see no attempt today and both
-- be accepted. Note it is taken on the ROLLUP row, not on lesson_attempts --
-- there is no row to lock in an append-only table before the first insert.
-- The row is created up front (on conflict do nothing) precisely so there is
-- always something to lock.
--
-- p_pass_threshold is passed in from TS, resolved from app_settings, for the
-- same reason p_price is in the RPCs above: one place owns settings reads.
create function record_lesson_attempt(
  p_user_id uuid,
  p_topic_id uuid,
  p_score int,
  p_total int,
  p_pass_threshold int
)
returns table (passed boolean, best_score int, attempts int, used_retry boolean)
language plpgsql
as $$
declare
  v_passed boolean;
  v_attempted_today boolean;
  v_used_retry boolean := false;
  v_retries_purchased int;
  v_retries_used int;
begin
  if p_total is null or p_total <= 0 then
    raise exception 'invalid_total';
  end if;
  if p_score is null or p_score < 0 or p_score > p_total then
    raise exception 'invalid_score';
  end if;
  if p_pass_threshold is null or p_pass_threshold <= 0 then
    raise exception 'invalid_threshold';
  end if;

  insert into user_topic_progress (user_id, topic_id)
  values (p_user_id, p_topic_id)
  on conflict (user_id, topic_id) do nothing;

  select utp.retries_purchased, utp.retries_used
    into v_retries_purchased, v_retries_used
    from user_topic_progress utp
    where utp.user_id = p_user_id and utp.topic_id = p_topic_id
    for update;

  select exists (
    select 1
      from lesson_attempts la
      where la.user_id = p_user_id
        and la.topic_id = p_topic_id
        and la.created_at >= date_trunc('day', now())
  ) into v_attempted_today;

  if v_attempted_today then
    if v_retries_purchased > v_retries_used then
      v_used_retry := true;
    else
      raise exception 'daily_limit_reached';
    end if;
  end if;

  v_passed := p_score >= p_pass_threshold;

  insert into lesson_attempts (user_id, topic_id, score, total, passed)
  values (p_user_id, p_topic_id, p_score, p_total, v_passed);

  -- passed and passed_at are sticky: once a topic is passed it stays passed,
  -- and passed_at keeps the FIRST pass timestamp. A later failed retake must
  -- not re-lock the next topic for a user who has already earned it.
  update user_topic_progress utp
    set attempts = utp.attempts + 1,
        best_score = greatest(utp.best_score, p_score),
        passed = utp.passed or v_passed,
        passed_at = coalesce(utp.passed_at, case when v_passed then now() end),
        last_attempt_at = now(),
        retries_used = utp.retries_used + case when v_used_retry then 1 else 0 end
    where utp.user_id = p_user_id and utp.topic_id = p_topic_id
    returning utp.passed, utp.best_score, utp.attempts
    into passed, best_score, attempts;

  used_retry := v_used_retry;
  return next;
end;
$$;

revoke execute on function record_lesson_attempt(uuid, uuid, int, int, int) from public, anon, authenticated;
grant execute on function record_lesson_attempt(uuid, uuid, int, int, int) to service_role;

-- reorder_lesson_topics: apply a full permutation of a course's topic order in
-- one transaction. Exists because of the deferrable unique constraint on
-- (course_id, order_index) -- see that constraint's comment. p_topic_ids is
-- the new order, index 0 first.
--
-- Scoped by p_course_id in the WHERE clause so a topic id from a DIFFERENT
-- course silently affects nothing rather than being reassigned across courses.
create function reorder_lesson_topics(
  p_course_id uuid,
  p_topic_ids uuid[]
)
returns void
language plpgsql
as $$
begin
  update lesson_topics lt
    set order_index = new_order.idx - 1,
        updated_at = now()
    from unnest(p_topic_ids) with ordinality as new_order(topic_id, idx)
    where lt.id = new_order.topic_id
      and lt.course_id = p_course_id;
end;
$$;

revoke execute on function reorder_lesson_topics(uuid, uuid[]) from public, anon, authenticated;
grant execute on function reorder_lesson_topics(uuid, uuid[]) to service_role;

grant select, insert, update, delete on lesson_courses to service_role;
grant select, insert, update, delete on lesson_topics to service_role;
grant select, insert on user_course_unlocks to service_role;
grant select, insert, update on user_topic_progress to service_role;
grant select, insert on lesson_attempts to service_role;
-- Re-grants on pre-existing tables are harmless/idempotent, restated for this
-- migration's self-sufficiency (see 0037, 0041, 0042, 0049, 0051, 0052, 0053).
grant select, insert, update, delete on quiz_questions to service_role;
grant select, insert, update on user_coins to service_role;
grant select on documents to service_role;
grant select on chunks to service_role;

-- New admin-configurable tunables, same app_settings key-value convention as
-- daily_quiz_reward/ad_watch_reward/chat_message_price -- NO seed rows are
-- inserted; lib/coins/lessonUnlock.ts hardcodes the TS-side defaults and its
-- settings readers fail OPEN to them, so a missing row is the normal state,
-- not an error.
--   lesson_course_unlock_price          -- default 20 (one-time coin cost to
--                                          unlock a course, used only when
--                                          lesson_courses.unlock_price is null;
--                                          a per-course override wins)
--   lesson_topic_pass_threshold         -- default 8 (correct answers required
--                                          to pass a topic test; must be <=
--                                          lesson_topic_questions_per_attempt,
--                                          enforced in TS)
--   lesson_topic_questions_per_attempt  -- default 10 (how many questions are
--                                          drawn at random from the topic's
--                                          15-20 question pool per attempt)
--   lesson_retry_cost                   -- default 5 (coin cost of one extra
--                                          same-day attempt at a topic, i.e.
--                                          one purchase_lesson_retry call)
--
-- DEAD KEYS from the previous model, left in place rather than deleted so a
-- stale row in an already-deployed environment is inert rather than an error.
-- Nothing reads them any more:
--   lesson_category_unlock_price, lesson_completion_bonus,
--   lesson_free_category_count, lesson_question_reward
