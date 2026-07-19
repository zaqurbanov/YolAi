'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { submitLessonAnswer } from '@/lib/coins/lessonQuiz';

export interface LessonAnswerState {
  status: 'correct' | 'incorrect' | 'already_answered' | 'error';
  message: string;
  reward?: number;
  balance?: number;
  explanation?: string | null;
}

// Mirrors app/chat/actions.ts's claimDailyQuizReward wrapper: session
// lookup via the normal RLS-respecting client, then delegate grading +
// reward to the lib function (which uses the admin client internally and
// never trusts a client-supplied correct index).
export async function submitLessonAnswerAction(
  questionId: string,
  selectedIndex: number
): Promise<LessonAnswerState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: 'error', message: 'Giriş tələb olunur' };
  }

  const result = await submitLessonAnswer(user.id, questionId, selectedIndex);

  if (!result.correct) {
    if ('error' in result) {
      return { status: 'error', message: 'Xəta baş verdi. Bir az sonra yenidən cəhd edin' };
    }
    return { status: 'incorrect', message: 'Səhv cavab', explanation: result.explanation };
  }

  if (result.alreadyAnswered) {
    return {
      status: 'already_answered',
      message: 'Bu sualı artıq düzgün cavablandırmısınız',
      explanation: result.explanation,
    };
  }

  revalidatePath('/oyrenme');
  revalidatePath('/account');
  return {
    status: 'correct',
    message: `Düz cavab! ${result.reward} coin qazandınız`,
    reward: result.reward,
    balance: result.balance,
    explanation: result.explanation,
  };
}
