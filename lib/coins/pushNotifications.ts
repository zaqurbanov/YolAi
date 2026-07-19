import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

// One-time coin reward for enabling push notifications (0052_push_notification_reward.sql).
// Fail-closed like lib/coins/quiz.ts's claimDailyQuizReward — a claim is a
// deliberate reward action, any DB error means no reward, never a silent
// success assumption.

const PUSH_REWARD_KEY = 'push_notification_reward';
const DEFAULT_PUSH_REWARD = 3;

export { PUSH_REWARD_KEY, DEFAULT_PUSH_REWARD };

// Mirrors getQuizRewardAmount's/getReferralBonusAmount's shape.
export async function getPushNotificationRewardAmount(): Promise<number> {
  const { data, error } = await createAdminClient()
    .from('app_settings')
    .select('value')
    .eq('key', PUSH_REWARD_KEY)
    .maybeSingle();

  if (error || !data) return DEFAULT_PUSH_REWARD;

  const value = typeof data.value === 'number' ? data.value : Number(data.value);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_PUSH_REWARD;
  return value;
}

type ClaimResult =
  | { ok: true; balance: number; reward: number }
  | { ok: false; error: 'already_claimed' | 'error' };

// Idempotent regardless of how many times this is called for the same user
// (enable -> disable -> re-enable, retried requests, etc.) — the RPC's
// unique constraint on push_notification_rewards.user_id is the real guard,
// this function just translates its outcome.
export async function claimPushNotificationReward(userId: string): Promise<ClaimResult> {
  const reward = await getPushNotificationRewardAmount();

  const { data, error } = await createAdminClient().rpc('grant_push_notification_reward', {
    p_user_id: userId,
    p_reward: reward,
  });

  if (error) {
    const message = error.message ?? '';
    if (message.includes('already_claimed')) {
      return { ok: false, error: 'already_claimed' };
    }
    console.error('[coins] grant_push_notification_reward RPC failed:', {
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
