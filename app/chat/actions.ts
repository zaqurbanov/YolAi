'use server';

// Phase 1 of the coin roadmap (docs/coin-roadmap.md): the daily-quiz
// coin-earning action lives here rather than app/account/actions.ts because
// its natural entry point is the chat surface/CoinBadge (per the roadmap's
// frontend-touchpoints note: "a link/modal, not inline" off the chat page),
// not the account page — keeping it in app/chat/ colocates it with where
// it's actually triggered from. This is a plain exported-function module
// with 'use server' at the top, not a route.ts file, so it doesn't count
// against the Vercel Hobby route budget.

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { claimDailyQuizReward as claimDailyQuizRewardLib, hasClaimedToday } from '@/lib/coins/quiz';
import { getDailyQuestionForUser } from '@/lib/quiz/questions';

export interface QuizClaimState {
  status: 'idle' | 'correct' | 'incorrect' | 'already_claimed' | 'error';
  message: string;
  balance?: number;
  reward?: number;
}

// Server action for the daily quiz's answer submission. Looks the day's
// question back up server-side from (userId, today) instead of trusting a
// client-submitted correctIndex, so a tampered client request can't claim
// an answer as "correct" — the only inputs trusted from the client are the
// selected option index and the fact that the user is authenticated.
export async function claimDailyQuizReward(selectedIndex: number): Promise<QuizClaimState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: 'error', message: 'Giriş tələb olunur' };
  }

  if (await hasClaimedToday(user.id)) {
    return { status: 'already_claimed', message: 'Artıq bugün sualı cavablandırmısınız' };
  }

  const { correctIndex } = getDailyQuestionForUser(user.id, new Date());

  const result = await claimDailyQuizRewardLib(user.id, selectedIndex, correctIndex);

  if (!result.ok) {
    switch (result.error) {
      case 'already_claimed':
        return { status: 'already_claimed', message: 'Artıq bugün sualı cavablandırmısınız' };
      case 'incorrect':
        return { status: 'incorrect', message: 'Səhv cavab, sabah yenidən cəhd edin' };
      default:
        return { status: 'error', message: 'Xəta baş verdi. Bir az sonra yenidən cəhd edin' };
    }
  }

  revalidatePath('/account');
  revalidatePath('/chat');
  return {
    status: 'correct',
    message: `Düz cavab! ${result.reward} coin qazandınız`,
    balance: result.balance,
    reward: result.reward,
  };
}
