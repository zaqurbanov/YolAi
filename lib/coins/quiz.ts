import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

// Phase 1 coin-earning mechanic (docs/coin-roadmap.md): a daily
// traffic-law mini-quiz, one question per user per day
// (lib/quiz/questions.ts). Fail-closed like lib/coins/transfers.ts — a
// claim is a deliberate reward action, any DB error means no reward, never
// a silent success assumption.

const QUIZ_REWARD_KEY = 'daily_quiz_reward';
const DEFAULT_QUIZ_REWARD = 3;

export { QUIZ_REWARD_KEY, DEFAULT_QUIZ_REWARD };

// Mirrors getGlobalMessagePrice's shape (lib/chat/coins.ts).
export async function getQuizRewardAmount(): Promise<number> {
  const { data, error } = await createAdminClient()
    .from('app_settings')
    .select('value')
    .eq('key', QUIZ_REWARD_KEY)
    .maybeSingle();

  if (error || !data) return DEFAULT_QUIZ_REWARD;

  const value = typeof data.value === 'number' ? data.value : Number(data.value);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_QUIZ_REWARD;
  return value;
}

export async function hasClaimedToday(userId: string): Promise<boolean> {
  const todayUtc = new Date().toISOString().slice(0, 10);

  const { data, error } = await createAdminClient()
    .from('daily_quiz_claims')
    .select('id')
    .eq('user_id', userId)
    .eq('claim_date', todayUtc)
    .maybeSingle();

  if (error) {
    console.error('[coins] hasClaimedToday read failed:', error);
    // Fail closed: if we can't tell, assume already claimed so we never
    // double-credit on an infra hiccup — the user can retry, worst case
    // they see "artıq bugün cavablandırmısınız" once more than necessary.
    return true;
  }

  return Boolean(data);
}

type ClaimResult =
  | { ok: true; balance: number; reward: number }
  | { ok: false; error: 'already_claimed' | 'incorrect' | 'error' };

// If the answer is wrong, returns immediately without touching the DB at
// all (no RPC call) — no cost to guessing wrong, no reward either, per the
// roadmap's accepted soft-abuse note for Phase 1.
export async function claimDailyQuizReward(
  userId: string,
  selectedIndex: number,
  correctIndex: number
): Promise<ClaimResult> {
  if (selectedIndex !== correctIndex) {
    return { ok: false, error: 'incorrect' };
  }

  const reward = await getQuizRewardAmount();

  const { data, error } = await createAdminClient().rpc('claim_daily_quiz_reward', {
    p_user_id: userId,
    p_reward: reward,
  });

  if (error) {
    const message = error.message ?? '';
    if (message.includes('already_claimed')) {
      return { ok: false, error: 'already_claimed' };
    }
    console.error('[coins] claim_daily_quiz_reward RPC failed:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return { ok: false, error: 'error' };
  }

  if (typeof data !== 'number') return { ok: false, error: 'error' };

  return { ok: true, balance: data, reward };
}
