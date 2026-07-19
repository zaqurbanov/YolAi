import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

// Repeatable coin reward for watching an ad (reklam izləyib coin qazanmaq),
// capped at N times per day (0053_ad_watch_reward.sql). Unlike the one-time
// mechanics (lib/coins/pushNotifications.ts, referrals) or the once/day
// quiz (lib/coins/quiz.ts), a user can claim this many times in the same
// day up to the configured daily max — the real gate is the RPC's
// row-locked count, not anything in this file. Fail-closed like
// claimDailyQuizReward — a claim is a deliberate reward action, any DB
// error means no reward, never a silent success assumption.

const AD_WATCH_REWARD_KEY = 'ad_watch_reward';
const DEFAULT_AD_WATCH_REWARD = 1;

const AD_WATCH_DAILY_MAX_KEY = 'ad_watch_daily_max';
const DEFAULT_AD_WATCH_DAILY_MAX = 5;

export { AD_WATCH_REWARD_KEY, DEFAULT_AD_WATCH_REWARD, AD_WATCH_DAILY_MAX_KEY, DEFAULT_AD_WATCH_DAILY_MAX };

// Mirrors getPushNotificationRewardAmount's/getQuizRewardAmount's shape.
export async function getAdWatchRewardAmount(): Promise<number> {
  const { data, error } = await createAdminClient()
    .from('app_settings')
    .select('value')
    .eq('key', AD_WATCH_REWARD_KEY)
    .maybeSingle();

  if (error || !data) return DEFAULT_AD_WATCH_REWARD;

  const value = typeof data.value === 'number' ? data.value : Number(data.value);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_AD_WATCH_REWARD;
  return value;
}

// Same shape as getAdWatchRewardAmount, but must additionally be a positive
// integer (it bounds a claim count, not a coin amount).
export async function getAdWatchDailyMax(): Promise<number> {
  const { data, error } = await createAdminClient()
    .from('app_settings')
    .select('value')
    .eq('key', AD_WATCH_DAILY_MAX_KEY)
    .maybeSingle();

  if (error || !data) return DEFAULT_AD_WATCH_DAILY_MAX;

  const value = typeof data.value === 'number' ? data.value : Number(data.value);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_AD_WATCH_DAILY_MAX;
  return Math.round(value);
}

// All-time-today claim count for a "N/max bugün istifadə edilib" display —
// not a security gate (the real gate is the RPC's row-locked count), so
// fail open to 0 on error, same bias as getQuizClaimsCount/hasClaimedToday.
export async function getAdWatchClaimsToday(userId: string): Promise<number> {
  const todayUtc = new Date().toISOString().slice(0, 10);

  const { count, error } = await createAdminClient()
    .from('ad_watch_claims')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('claim_date', todayUtc);

  if (error) {
    console.error('[coins] getAdWatchClaimsToday read failed:', error);
    return 0;
  }

  return count ?? 0;
}

type ClaimResult =
  | { ok: true; balance: number; reward: number }
  | { ok: false; error: 'daily_limit_reached' | 'error' };

// Repeatable, unlike claimPushNotificationReward/claimDailyQuizReward — a
// caller may call this multiple times in the same day, and each call that
// isn't blocked by the daily cap credits coins again. The RPC's row-locked
// count against ad_watch_claims is the real guard, this function just
// translates its outcome.
export async function claimAdWatchReward(userId: string): Promise<ClaimResult> {
  const [reward, dailyMax] = await Promise.all([getAdWatchRewardAmount(), getAdWatchDailyMax()]);

  const { data, error } = await createAdminClient().rpc('claim_ad_watch_reward', {
    p_user_id: userId,
    p_reward: reward,
    p_daily_max: dailyMax,
  });

  if (error) {
    const message = error.message ?? '';
    if (message.includes('daily_limit_reached')) {
      return { ok: false, error: 'daily_limit_reached' };
    }
    console.error('[coins] claim_ad_watch_reward RPC failed:', {
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
