-- ===========================================================================
-- 0100 — FREE PREVIEW: a course is enterable, its first N topics are free.
-- ===========================================================================
--
-- WHAT CHANGES, AND WHY
--   Until now a course was all-or-nothing: `lesson_courses.is_free`, or an
--   energy unlock (0060 + 0098). A user browsing /oyrenme saw a locked card and
--   had to spend energy on faith — no title of what is inside, no sample, no
--   reason to trust it. That is the worst possible conversion shape for a
--   product whose whole pitch is the quality of the lessons.
--
--   After this migration every course carries `free_topic_count`: the number of
--   leading topics readable WITHOUT an unlock. The default is 1 — enter the
--   course, read lesson one, take its test, then decide. 0 restores the old
--   all-or-nothing behaviour for a specific course, and the admin sets it per
--   course in /admin/kurslar.
--
--   The paywall itself is unchanged: topics at or beyond the free window still
--   require the same one-time energy unlock, at the same price. This is a
--   funnel change, not a pricing change.
--
-- WHY A COLUMN AND NOT AN app_settings KEY
--   Every other tunable in this economy is an app_settings key with a TS-side
--   default (house convention, CLAUDE.md). This one CANNOT be, because the
--   lesson_topics RLS policy below has to read it: app_settings has RLS enabled
--   with zero policies, so a policy subquery against it evaluates as the
--   AUTHENTICATED caller and returns no rows. The free window would then
--   coalesce to nothing and the preview would be invisible to exactly the users
--   it exists for. `lesson_courses` is already selectable by authenticated
--   users for published rows, so a column on it is readable from the policy.
--
--   NOT NULL with a default rather than nullable-means-global for the same
--   reason: there is no readable global to fall back to inside the policy.
--
-- THE FREE WINDOW IS `order_index < free_topic_count`
--   order_index is 0-based (reorder_lesson_topics writes idx-1, and every
--   creation path starts at 0), so "the first N topics" is exactly
--   `order_index < N`. If a course's indexes ever started above 0, no topic
--   would fall inside the window and the course would simply stay fully paid —
--   a visible, safe failure rather than a leak.
--
-- THE SEQUENTIAL PASS RULE IS UNTOUCHED. Paying opens the DOOR; passing the
-- topic test is still the only thing that opens the NEXT one (0060's
-- user_topic_progress + getCourseTopics). A free preview topic is still gated
-- by the same rule as every other topic — free means "not behind the paywall",
-- never "skip the test".
-- ---------------------------------------------------------------------------

alter table lesson_courses
  add column if not exists free_topic_count int not null default 1
  check (free_topic_count >= 0);

comment on column lesson_courses.free_topic_count is
  'Number of leading topics (order_index < this) readable without an unlock. 0 = fully paid course.';

-- ---------------------------------------------------------------------------
-- lesson_topics RLS: add the preview clause.
--
-- This policy is the reason a paid course cannot be read straight out of
-- PostgREST with the anon key, and it is ON THE LIVE READ PATH — getTopicForReading
-- reads the body with the USER-SCOPED client for non-admins precisely so this
-- policy stays a real second line of defence. It is therefore replaced whole
-- rather than patched, and the original three conditions are reproduced
-- verbatim below with only the fourth (`order_index <`) added:
--
--   1. the topic itself is published, AND
--   2. its course is published, AND
--   3. the course is free OR this user has an unlock row
--      -- NEW -- OR the topic falls inside the course's free window.
--
-- Note the free-window test sits INSIDE the same exists() on lesson_courses, so
-- it can never grant access to a topic whose course is still a draft.
-- ---------------------------------------------------------------------------
drop policy if exists lesson_topics_select_accessible on lesson_topics;

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
            or lesson_topics.order_index < c.free_topic_count
            or exists (
              select 1
                from user_course_unlocks u
                where u.course_id = c.id
                  and u.user_id = auth.uid()
            )
          )
    )
  );

-- Restated for this migration's self-sufficiency (house convention; harmless
-- and idempotent). The new column needs no separate grant — it is covered by
-- the table-level grants from 0060.
grant select, insert, update, delete on lesson_courses to service_role;
grant select, insert, update, delete on lesson_topics to service_role;
