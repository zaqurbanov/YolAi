-- 0092_exam_only_questions.sql — separates the "Rəsmi İmtahan" question pool
-- from the lesson-quiz pool.
--
-- WHY. /imtahan currently draws from EVERY published row in quiz_questions
-- (lib/exam/examPool.ts applies no filter beyond status), and that table is
-- mostly LLM-drafted questions generated from lesson topics. The admin's
-- assessment is that those are not good enough to sit in a mock DYP exam, and
-- that the exam should contain only questions they author by hand.
--
-- Rather than deleting or re-purposing the existing rows — the per-topic lesson
-- tests (lib/quiz/topicTest.ts) depend on them and are unaffected by this
-- change — a flag marks the exam-eligible subset. Lesson tests filter by
-- topic_id and never look at this column, so they keep working exactly as
-- before.
--
-- DEFAULT false is the important part: every existing row is excluded from the
-- exam the moment this runs. The exam pool then contains only what the admin
-- explicitly marks, which is the requirement.
--
-- ⚠️ Until at least 10 questions are flagged, /imtahan will report
-- "İmtahan hazırda əlçatan deyil" — drawExamQuestions returns null below its
-- QUESTIONS_PER_EXAM floor. That is a correct, fail-closed empty state, not a
-- crash, but it does mean the exam is inert until the pool is filled.
--
-- APPLY THIS BY HAND in the Supabase SQL editor. Idempotent: safe to re-run.

alter table quiz_questions
  add column if not exists is_exam boolean not null default false;

-- The exam draw is "every published exam question", so this is the index that
-- serves it. Partial: the exam subset is expected to stay far smaller than the
-- lesson-generated bulk of the table.
create index if not exists quiz_questions_exam_idx
  on quiz_questions (status)
  where is_exam = true;

comment on column quiz_questions.is_exam is
  'True only for hand-authored questions eligible for the Rəsmi İmtahan pool (lib/exam/examPool.ts). Lesson tests ignore this column.';
