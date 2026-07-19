'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { claimAdWatchReward } from '@/lib/coins/adWatch';

export interface AdWatchClaimState {
  status: 'success' | 'daily_limit_reached' | 'error';
  message: string;
  reward?: number;
  balance?: number;
}

// Mirrors app/oyrenme/actions.ts's submitLessonAnswerAction: session lookup
// via the normal RLS-respecting client, then delegate the actual claim to
// the lib function (which uses the admin client internally and is the sole
// place the daily cap is enforced, via the RPC's row-locked count).
export async function claimAdWatchRewardAction(): Promise<AdWatchClaimState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: 'error', message: 'Giriş tələb olunur' };
  }

  const result = await claimAdWatchReward(user.id);

  if (!result.ok) {
    if (result.error === 'daily_limit_reached') {
      return { status: 'daily_limit_reached', message: 'Bugünkü reklam limitinə çatmısınız' };
    }
    return { status: 'error', message: 'Xəta baş verdi. Bir az sonra yenidən cəhd edin' };
  }

  revalidatePath('/coin-qazan');
  return {
    status: 'success',
    message: `Reklam izlədiniz! ${result.reward} coin qazandınız`,
    reward: result.reward,
    balance: result.balance,
  };
}
