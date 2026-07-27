-- 0086_fine_amount_flag.sql — flags "cərimə məbləği" (fine amount) questions
-- in quiz_questions so topic tests / exam draws can CAP them (max 1-2 per
-- drawn set) instead of leaving them unbounded. Fine-amount figures are the
-- single most frequently updated part of AZ traffic law (amendments change
-- manat amounts without touching the underlying rule), so a pool that is
-- allowed to draw 4-5 of these into one 5-10 question test/exam both feels
-- repetitive to the user and is disproportionately exposed to going stale.
-- Capping, not removing: fine amounts are still legitimate, testable content.
--
-- The cap itself is applied in TS (lib/quiz/topicTest.ts, lib/exam/examPool.ts)
-- at draw time — this migration only adds the column those draws read.
--
-- Idempotent: safe to re-run (add column if not exists, backfill only rows
-- still at the default). APPLY THIS BY HAND in the Supabase SQL editor, after
-- 0085.

alter table quiz_questions
  add column if not exists is_fine_amount boolean not null default false;

-- Backfill heuristic: flags existing rows whose question/options mention a
-- fine amount (manat/AZN/₼ + a number, or "cərimə" near currency). Imperfect
-- by nature (false pos/neg possible) — admin can correct via the quiz admin
-- UI checkbox. This is a starting estimate only.
update quiz_questions
set is_fine_amount = true
where is_fine_amount = false
  and (
    question ~* '(cərimə).{0,40}(manat|azn|₼|\d)' or
    question ~* '(manat|azn|₼)' or
    exists (
      select 1 from jsonb_array_elements_text(options) opt
      where opt ~* '(manat|azn|₼)'
    )
  );
