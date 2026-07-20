'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { claimAdWatchReward, issueAdViewToken } from '@/lib/coins/adWatch';

export interface AdWatchClaimState {
  status: 'success' | 'daily_limit_reached' | 'invalid_token' | 'too_early' | 'error';
  message: string;
  reward?: number;
  balance?: number;
}

export interface AdViewStartState {
  status: 'success' | 'error';
  nonce?: string;
  message?: string;
}

// Starts an ad view and hands back a single-use, server-issued nonce that
// claimAdWatchRewardAction must present. The elapsed-time check is a
// comparison of the token's server-recorded issued_at against the server's
// clock at claim time, so the client cannot shorten the ad by lying about
// how long it waited — the only thing it can do with this value is present
// it back, once, after enough real time has passed.
export async function startAdViewAction(): Promise<AdViewStartState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: 'error', message: 'Giriş tələb olunur' };
  }

  const nonce = await issueAdViewToken(user.id);
  if (!nonce) {
    return { status: 'error', message: 'Xəta baş verdi. Bir az sonra yenidən cəhd edin' };
  }

  return { status: 'success', nonce };
}

// Mirrors app/oyrenme/actions.ts's submitLessonAnswerAction: session lookup
// via the normal RLS-respecting client, then delegate the actual claim to
// the lib function (which uses the admin client internally and is the sole
// place the daily cap is enforced, via the RPC's row-locked count).
export async function claimAdWatchRewardAction(nonce: string): Promise<AdWatchClaimState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: 'error', message: 'Giriş tələb olunur' };
  }

  const result = await claimAdWatchReward(user.id, typeof nonce === 'string' ? nonce : '');

  if (!result.ok) {
    if (result.error === 'daily_limit_reached') {
      return { status: 'daily_limit_reached', message: 'Bugünkü reklam limitinə çatmısınız' };
    }
    if (result.error === 'too_early') {
      return { status: 'too_early', message: 'Reklam hələ bitməyib. Bir az gözləyin' };
    }
    if (result.error === 'invalid_token') {
      return { status: 'invalid_token', message: 'Reklam sessiyası etibarsızdır. Yenidən başlayın' };
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
