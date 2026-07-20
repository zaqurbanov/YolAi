import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

// Per-lesson-question answering path (distinct from the Phase 1 daily quiz in
// lib/coins/quiz.ts): the correct index is always looked up server-side, never
// trusted from the client.
//
// THIS PATH NO LONGER PAYS COINS. The per-question +1 reward is gone, and so
// is the per-category completion bonus that briefly replaced it (that whole
// model was superseded by the course/topic structure in
// 0060_lesson_courses.sql; Phase 3 defines how coins are earned).
// It still RECORDS every attempt via award_quiz_question_reward with
// p_reward = 0 — that unconditional insert plus unique(user_id, question_id)
// is the one-attempt anti-brute-force guard from 0059 section C.2 and must not
// be weakened. Passing 0 rather than changing the RPC keeps the guard intact;
// user_quiz_answers has no reward column and user_coins.balance has no
// positivity constraint, so `balance + 0` is a valid no-op.

const NO_PER_QUESTION_REWARD = 0;

export type SubmitLessonAnswerResult =
  | {
      correct: true;
      alreadyAnswered: false;
      balance: number;
      explanation: string | null;
    }
  | { correct: true; alreadyAnswered: true; explanation: string | null }
  | { correct: false; alreadyAnswered: boolean; explanation: string | null }
  | { correct: false; error: 'not_found' | 'error' };

interface QuizQuestionAnswerRow {
  category: string;
  correct_index: number;
  explanation: string | null;
}

// The question's OWN category, read server-side from the question row. Callers
// use this to authorize against the unlock ledger — a client-supplied category
// would let a user answer a locked category's questions by claiming a free
// one. Returns null when the question doesn't exist or isn't published.
export async function getQuestionCategory(questionId: string): Promise<string | null> {
  const { data, error } = await createAdminClient()
    .from('quiz_questions')
    .select('category')
    .eq('id', questionId)
    .eq('status', 'published')
    .maybeSingle();

  if (error) {
    console.error('[coins/lessonQuiz] getQuestionCategory failed:', error);
    return null;
  }

  return data?.category ?? null;
}

// WAS: returned immediately on a wrong answer with no DB write, which made
// every question brute-forceable in at most 4 POSTs. NOW: the answer is
// recorded regardless of correctness and coins are credited only when
// correct, so unique(user_id, question_id) caps each question at ONE attempt
// ever (0059_security_hardening.sql, section C.2). Wrong answers still cost
// no coins.
//
// This is also what contains the separate "arbitrary questionId, no check
// the user opened the lesson" exposure in app/oyrenme/actions.ts: the bank
// is still addressable, but probing a question permanently burns it for the
// probing account.
export async function submitLessonAnswer(
  userId: string,
  questionId: string,
  selectedIndex: number
): Promise<SubmitLessonAnswerResult> {
  const admin = createAdminClient();

  const { data: question, error: fetchError } = await admin
    .from('quiz_questions')
    .select('category, correct_index, explanation')
    .eq('id', questionId)
    .eq('status', 'published')
    .single<QuizQuestionAnswerRow>();

  if (fetchError || !question) {
    console.error('[coins/lessonQuiz] question lookup failed:', fetchError);
    return { correct: false, error: 'not_found' };
  }

  const isCorrect = selectedIndex === question.correct_index;

  const { data, error } = await admin.rpc('award_quiz_question_reward', {
    p_user_id: userId,
    p_question_id: questionId,
    p_reward: NO_PER_QUESTION_REWARD,
    p_is_correct: isCorrect,
  });

  if (error) {
    const message = error.message ?? '';
    if (message.includes('already_answered')) {
      // The question is locked either way; only the wording differs, which
      // is the caller's concern.
      return isCorrect
        ? { correct: true, alreadyAnswered: true, explanation: question.explanation }
        : { correct: false, alreadyAnswered: true, explanation: question.explanation };
    }
    console.error('[coins/lessonQuiz] award_quiz_question_reward RPC failed:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return { correct: false, error: 'error' };
  }

  if (typeof data !== 'number') return { correct: false, error: 'error' };

  // Only reported after the attempt is durably recorded above.
  if (!isCorrect) {
    return { correct: false, alreadyAnswered: false, explanation: question.explanation };
  }

  return {
    correct: true,
    alreadyAnswered: false,
    balance: data,
    explanation: question.explanation,
  };
}
