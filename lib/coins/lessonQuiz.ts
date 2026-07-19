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
  | { correct: false; explanation: string | null }
  | { correct: false; error: 'not_found' | 'error' };

interface QuizQuestionAnswerRow {
  correct_index: number;
  explanation: string | null;
}

// If the answer is wrong, returns immediately without any DB write at all
// (no RPC call) — no cost to guessing wrong, no reward either, matching
// claimDailyQuizReward's exact stance.
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

  if (selectedIndex !== question.correct_index) {
    return { correct: false, explanation: question.explanation };
  }

  const reward = await getLessonQuestionRewardAmount();

  const { data, error } = await admin.rpc('award_quiz_question_reward', {
    p_user_id: userId,
    p_question_id: questionId,
    p_reward: reward,
  });

  if (error) {
    const message = error.message ?? '';
    if (message.includes('already_answered')) {
      return { correct: true, alreadyAnswered: true, explanation: question.explanation };
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

  return {
    correct: true,
    alreadyAnswered: false,
    reward,
    balance: data,
    explanation: question.explanation,
  };
}
