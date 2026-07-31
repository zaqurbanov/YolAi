-- 0090_exam_question_images.sql — image support for quiz questions, so the
-- "Rəsmi İmtahan" (/imtahan) can present real DYP-style questions where the
-- situation is a picture ("Göstərilən vəziyyətdə hansı nəqliyyat vasitəsi
-- üstünlüyə malikdir?") and, for sign questions, where each ANSWER is itself
-- an image ("Aşağıdakı nişanlardan hansı ...").
--
-- Additive only. Both columns are nullable, so every existing question keeps
-- working untouched as a text-only question, and both the per-topic lesson
-- quizzes (lib/quiz/topicTest.ts) and the games-section exam simulator
-- (lib/exam/*) continue to function without any change. Nothing here alters
-- exam_sessions or the start_exam_session/settle_exam_session RPCs — grading
-- is unchanged, because an image never changes which INDEX is correct.
--
-- APPLY THIS BY HAND in the Supabase SQL editor. It must run AFTER
-- 0082_exam_simulator.sql (which creates exam_sessions and the two exam RPCs);
-- if 0082 has not been applied yet, apply it first or /imtahan will fail at
-- start with a missing-relation error.
--
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- quiz_questions.image_path — storage path of ONE illustration shown above the
-- question text. Path within the `exam-images` bucket below, not a full URL:
-- the bucket is public, so the app builds the URL at render time and the row
-- stays valid if the project's storage domain ever changes. Same convention as
-- sign_images.storage_path (0080).
-- ---------------------------------------------------------------------------
alter table quiz_questions
  add column if not exists image_path text;

-- ---------------------------------------------------------------------------
-- quiz_questions.option_image_paths — per-ANSWER images, for sign-recognition
-- questions where the four options are pictures rather than sentences.
--
-- Shape: a 4-element jsonb array positionally aligned with `options`, each
-- entry either a storage path (string) or null. NOT a separate table: the
-- length is fixed at 4 by the same constraint that already governs `options`,
-- the entries are only ever read as a unit alongside their question, and a
-- child table would need its own RLS policy plus a join on the hottest read
-- path in the app (the exam pool draw).
--
-- The check accepts null (text-only options — the overwhelmingly common case)
-- so this stays a zero-touch change for existing rows.
-- ---------------------------------------------------------------------------
alter table quiz_questions
  add column if not exists option_image_paths jsonb;

alter table quiz_questions
  drop constraint if exists quiz_questions_option_image_paths_len;

alter table quiz_questions
  add constraint quiz_questions_option_image_paths_len
  check (
    option_image_paths is null
    or jsonb_array_length(option_image_paths) = 4
  );

-- ---------------------------------------------------------------------------
-- exam-images storage bucket. Same idiom as 0048's public-assets and 0080's
-- sign-images: public read via Storage's own object-serving endpoint (which
-- bypasses RLS for GET), service-role-only writes.
--
-- Public is correct here and is NOT a leak: an exam illustration is a drawing
-- of a road situation, it carries no answer and no user data. The answer lives
-- in quiz_questions.correct_index, which is never selected on any path that
-- reaches a client (see lib/exam/examPool.ts and lib/exam/examSession.ts).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('exam-images', 'exam-images', true)
on conflict (id) do nothing;

-- Belt-and-suspenders SELECT policy, mirroring 0080's reasoning: not strictly
-- required while bucket.public = true, but keeps anon reads working if that
-- flag is ever toggled off by mistake.
drop policy if exists "exam_images_bucket_select_public" on storage.objects;
create policy "exam_images_bucket_select_public"
  on storage.objects for select
  to public
  using (bucket_id = 'exam-images');

-- Writes are service-role only — uploads go through the requireAdmin()-gated
-- server action in app/admin/quiz/actions.ts, never straight from a browser.
-- No insert/update/delete policy is created for authenticated on purpose.

-- ---------------------------------------------------------------------------
-- No new app_settings keys. /imtahan deliberately reuses the existing exam
-- tunables from 0082 (exam_coin_price 100, exam_energy_cost 1,
-- exam_session_ttl_seconds 1200, exam_pass_threshold 8) so the official exam
-- and the games-section simulator can never drift to different prices.
-- ---------------------------------------------------------------------------
