import 'server-only';
import { randomBytes } from 'crypto';
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

// Proof-of-watch (0059_security_hardening.sql, section A). The claim path
// used to take no arguments at all, so five direct POSTs to the server
// action were five coins in under a second — the countdown existed only in
// the client component. These constants are the SERVER's copy of the ad
// duration; components/account/AdWatchCard.tsx's countdown (fed the same
// value as a prop) is only a UI affordance and is never trusted or
// transmitted.
//
// Admin-tunable via app_settings.ad_view_duration_seconds (positive integer,
// seconds; no seed row - TS-side default below, edited from /admin/users
// economy card through /api/admin/chat-meta?type=lesson-economy).
const AD_VIEW_DURATION_KEY = 'ad_view_duration_seconds';
const DEFAULT_AD_VIEW_DURATION_SECONDS = 5;
// Ceiling on what the setting may demand - an absurd stored value (e.g. 9999)
// falls back to the default rather than locking users into an unwatchable ad.
const MAX_AD_VIEW_DURATION_SECONDS = 60;
// Subtracted from the required elapsed time so a user whose round trip is
// marginally faster than the countdown isn't rejected. Small enough that it
// can't meaningfully shorten the watch.
const AD_VIEW_SKEW_MARGIN_SECONDS = 1;
// A token is only valid for a short window after issuance. Bounds how long a
// stockpiled batch of nonces stays spendable, and gives the sweep below a
// definition of "stale".
const AD_VIEW_TOKEN_MAX_AGE_SECONDS = 10 * 60;

export { AD_VIEW_DURATION_KEY, DEFAULT_AD_VIEW_DURATION_SECONDS, MAX_AD_VIEW_DURATION_SECONDS };

// Same shape as getAdWatchDailyMax: fail-open to the default, and require a
// sane positive integer - this value gates a security check (minimum elapsed
// seconds) AND drives the client countdown, so an out-of-range row must never
// win over the default.
export async function getAdViewDurationSeconds(): Promise<number> {
  const { data, error } = await createAdminClient()
    .from('app_settings')
    .select('value')
    .eq('key', AD_VIEW_DURATION_KEY)
    .maybeSingle();

  if (error || !data) return DEFAULT_AD_VIEW_DURATION_SECONDS;

  const value = typeof data.value === 'number' ? data.value : Number(data.value);
  if (!Number.isInteger(value) || value < 1 || value > MAX_AD_VIEW_DURATION_SECONDS) {
    return DEFAULT_AD_VIEW_DURATION_SECONDS;
  }
  return value;
}

// Issued when an ad view STARTS. 32 random bytes, hex — unguessable, so a
// claim can only present a nonce the server actually handed this user.
export async function issueAdViewToken(userId: string): Promise<string | null> {
  const admin = createAdminClient();
  const nonce = randomBytes(32).toString('hex');

  const { error } = await admin.from('ad_view_tokens').insert({ user_id: userId, nonce });

  if (error) {
    console.error('[coins] issueAdViewToken insert failed:', error);
    return null;
  }

  // Opportunistic staleness sweep, scoped to this one user (indexed by
  // (user_id, issued_at)) so it stays cheap — no cron/edge function needed
  // for a table this small. Best-effort: expiry is already enforced in the
  // RPC's WHERE clause, so a failed sweep leaves dead rows, never valid ones.
  const staleCutoff = new Date(Date.now() - AD_VIEW_TOKEN_MAX_AGE_SECONDS * 1000).toISOString();
  const { error: sweepError } = await admin
    .from('ad_view_tokens')
    .delete()
    .eq('user_id', userId)
    .lt('issued_at', staleCutoff);

  if (sweepError) console.error('[coins] issueAdViewToken stale sweep failed:', sweepError);

  return nonce;
}

export type AdViewTokenFailure = 'not_found' | 'consumed' | 'expired' | 'too_early' | 'error';

// Delegates every check to consume_ad_view_token, which does the validity
// test and the consume in ONE conditional UPDATE — read-then-write here
// would be replayable under concurrency. Fail-closed: an unrecognised
// return value or any RPC error means the token is not consumed and no
// reward follows.
async function consumeAdViewToken(
  userId: string,
  nonce: string,
  minElapsedSeconds: number
): Promise<{ ok: true } | { ok: false; error: AdViewTokenFailure }> {
  const { data, error } = await createAdminClient().rpc('consume_ad_view_token', {
    p_user_id: userId,
    p_nonce: nonce,
    p_min_elapsed_seconds: minElapsedSeconds,
    p_max_age_seconds: AD_VIEW_TOKEN_MAX_AGE_SECONDS,
  });

  if (error) {
    console.error('[coins] consume_ad_view_token RPC failed:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return { ok: false, error: 'error' };
  }

  if (data === 'ok') return { ok: true };
  if (data === 'not_found' || data === 'consumed' || data === 'expired' || data === 'too_early') {
    return { ok: false, error: data };
  }
  return { ok: false, error: 'error' };
}

type ClaimResult =
  | { ok: true; balance: number; reward: number }
  | { ok: false; error: 'daily_limit_reached' | 'invalid_token' | 'too_early' | 'error' };

// Repeatable, unlike claimPushNotificationReward/claimDailyQuizReward — a
// caller may call this multiple times in the same day, and each call that
// isn't blocked by the daily cap credits coins again. The RPC's row-locked
// count against ad_watch_claims is the real guard, this function just
// translates its outcome.
export async function claimAdWatchReward(userId: string, nonce: string): Promise<ClaimResult> {
  // Token first, before any settings reads or the credit RPC — a claim that
  // can't prove it watched must never reach the daily-cap machinery at all.
  if (typeof nonce !== 'string' || !nonce) {
    return { ok: false, error: 'invalid_token' };
  }

  // Server-resolved duration (never client-supplied), converted to the RPC's
  // minimum-elapsed requirement with the skew margin, floored at 1 second so
  // a duration of 1 still requires real time to pass.
  const durationSeconds = await getAdViewDurationSeconds();
  const minElapsedSeconds = Math.max(1, durationSeconds - AD_VIEW_SKEW_MARGIN_SECONDS);

  const consumed = await consumeAdViewToken(userId, nonce, minElapsedSeconds);
  if (!consumed.ok) {
    if (consumed.error === 'too_early') return { ok: false, error: 'too_early' };
    if (consumed.error === 'error') return { ok: false, error: 'error' };
    // not_found (never issued, or issued to a DIFFERENT user), consumed
    // (replay), expired — all indistinguishable to the caller on purpose.
    return { ok: false, error: 'invalid_token' };
  }

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
