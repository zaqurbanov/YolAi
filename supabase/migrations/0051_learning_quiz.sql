-- Duolingo-style "Öyrənmə" (learning) feature: replaces the static
-- /qaydalar catalog with per-category lessons built from an admin-reviewed
-- quiz-question bank. Questions are LLM-drafted from an uploaded PDF
-- (lib/quiz/generateQuestionsFromPdf.ts) but never auto-published — see
-- quiz_questions.status below.

-- quiz_questions: the question bank. category must match one of
-- RULE_CATEGORIES[].title (lib/content/ruleCategories.ts) — enforced in TS,
-- not a DB check, since the category list is static application data, not
-- a lookup table.
--
-- options is a jsonb array of exactly 4 strings — enforced here with a
-- check constraint (jsonb_array_length) since it's cheap and catches a
-- malformed insert at the DB boundary regardless of which code path wrote
-- it; TS also validates this via the zod schema in
-- lib/quiz/generateQuestionsFromPdf.ts before it ever reaches the DB.
--
-- RLS: authenticated users can only ever see published questions — no
-- insert/update/delete policy for authenticated/anon at all, exactly like
-- documents/admin_questions: every write goes through requireAdmin()-gated
-- server actions/route using the service-role client
-- (lib/admin/quizQuestions.ts).
create table quiz_questions (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  question text not null,
  options jsonb not null check (jsonb_array_length(options) = 4),
  correct_index smallint not null check (correct_index between 0 and 3),
  explanation text,
  status text not null default 'draft' check (status in ('draft', 'published')),
  source_title text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table quiz_questions enable row level security;

create policy quiz_questions_select_published
  on quiz_questions for select
  to authenticated
  using (status = 'published');

create index quiz_questions_category_status_idx on quiz_questions (category, status);

-- user_quiz_answers: first-correct-answer ledger, mirrors daily_quiz_claims'
-- "wrong answers never touch the DB" posture — a row here only ever gets
-- inserted on a verified-correct answer (lib/coins/lessonQuiz.ts), never on
-- a guess. Doubles as both the progress source (distinct rows per user per
-- category = lessons completed) and the reward-idempotency guard via
-- unique(user_id, question_id).
--
-- RLS: self-select-only, no insert/update/delete policy for
-- authenticated/anon — all writes go through award_quiz_question_reward
-- below via the service-role client.
create table user_quiz_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  question_id uuid not null references quiz_questions(id),
  created_at timestamptz not null default now(),
  unique (user_id, question_id)
);

alter table user_quiz_answers enable row level security;

create policy user_quiz_answers_select_own
  on user_quiz_answers for select
  to authenticated
  using (user_id = auth.uid());

create index user_quiz_answers_user_id_idx on user_quiz_answers (user_id);

-- award_quiz_question_reward: insert-then-credit, single transaction, same
-- shape as claim_daily_quiz_reward (0042) and grant_referral_bonus (0049).
-- unique(user_id, question_id) is the actual double-award guard — a repeat
-- call for a question this user already answered correctly hits
-- on conflict do nothing, v_id stays null, and we raise 'already_answered'
-- (caught in lib/coins/lessonQuiz.ts exactly like 'already_claimed') rather
-- than re-crediting.
--
-- Fails closed like every prior RPC in this economy: any unexpected error
-- aborts the whole function, since this is a deliberate reward-claim
-- action, not a background/best-effort check.
create function award_quiz_question_reward(
  p_user_id uuid,
  p_question_id uuid,
  p_reward numeric
)
returns numeric
language plpgsql
as $$
declare
  v_id uuid;
  v_balance numeric;
begin
  insert into user_quiz_answers (user_id, question_id)
  values (p_user_id, p_question_id)
  on conflict (user_id, question_id) do nothing
  returning id into v_id;

  if v_id is null then
    raise exception 'already_answered';
  end if;

  insert into user_coins (user_id, balance, daily_limit)
  values (p_user_id, 10, null)
  on conflict (user_id) do nothing;

  update user_coins uc
    set balance = uc.balance + p_reward
    where uc.user_id = p_user_id
    returning uc.balance into v_balance;

  return v_balance;
end;
$$;

-- Same execute-grant gotcha as every prior RPC in this economy (0037/0041/
-- 0042/0049): revoke-from-public also strips service_role's own implicit
-- access, so it must be re-granted explicitly.
revoke execute on function award_quiz_question_reward(uuid, uuid, numeric) from public, anon, authenticated;
grant execute on function award_quiz_question_reward(uuid, uuid, numeric) to service_role;

grant select, insert, update, delete on quiz_questions to service_role;
grant select, insert on user_quiz_answers to service_role;
-- Re-grant on user_coins/profiles is harmless/idempotent, restated here for
-- this migration's self-sufficiency (see 0037/0041/0042/0049).
grant select, insert, update on user_coins to service_role;
grant select on profiles to service_role;

-- New admin-configurable tunable, same app_settings key-value convention as
-- chat_message_price/coin_transfer_min_amount/daily_quiz_reward/
-- referral_bonus_amount — no seed row inserted; lib/coins/lessonQuiz.ts
-- hardcodes the TS-side default when no row exists yet.
--   lesson_question_reward   -- default 1 (coins credited per first-correct
--                                lesson-quiz answer; deliberately smaller
--                                than daily_quiz_reward's default of 3,
--                                since a single lesson has many questions —
--                                a per-question reward the same size as the
--                                once-a-day quiz would make the daily quiz
--                                mechanic pointless by comparison)
