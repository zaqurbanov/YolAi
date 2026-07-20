import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

// Per-lesson-question coin-earning mechanic (distinct from the Phase 1
// daily quiz in lib/coins/quiz.ts): same "wrong answers never touch the DB,
// no cost to guessing" posture, and the correct index is always looked up
// server-side, never trusted from the client.

const LESSON_QUESTION_REWARD_KEY = 'lesson_question_reward';
const DEFAULT_LESSON_QUESTION_REWARD = 1;

export { LESSON_QUESTION_REWARD_KEY, DEFAULT_LESSON_QUESTION_REWARD };

// Mirrors getQuizRewardAmount's shape (lib/coins/quiz.ts).
export async function getLessonQuestionRewardAmount(): Promise<number> {
  const { data, error } = await createAdminClient()
    .from('app_settings')
    .select('value')
    .eq('key', LESSON_QUESTION_REWARD_KEY)
    .maybeSingle();

  if (error || !data) return DEFAULT_LESSON_QUESTION_REWARD;

  const value = typeof data.value === 'number' ? data.value : Number(data.value);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_LESSON_QUESTION_REWARD;
  return value;
}

export type SubmitLessonAnswerResult =
  | { correct: true; alreadyAnswered: false; reward: number; balance: number; explanation: string | null }
  | { correct: true; alreadyAnswered: true; explanation: string | null }
  | { correct: false; alreadyAnswered: boolean; explanation: string | null }
  | { correct: false; error: 'not_found' | 'error' };

interface QuizQuestionAnswerRow {
  correct_index: number;
  explanation: string | null;
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
    .select('correct_index, explanation')
    .eq('id', questionId)
    .eq('status', 'published')
    .single<QuizQuestionAnswerRow>();

  if (fetchError || !question) {
    console.error('[coins/lessonQuiz] question lookup failed:', fetchError);
    return { correct: false, error: 'not_found' };
  }

  const isCorrect = selectedIndex === question.correct_index;
  const reward = await getLessonQuestionRewardAmount();

  const { data, error } = await admin.rpc('award_quiz_question_reward', {
    p_user_id: userId,
    p_question_id: questionId,
    p_reward: reward,
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
    reward,
    balance: data,
    explanation: question.explanation,
  };
}
