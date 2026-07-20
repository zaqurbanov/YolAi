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

// Deliberately unfiltered by reward: since section C.1 a wrong answer also
// writes a row, and "already attempted today" is exactly the lock we want —
// the user gets one attempt per day, not one CORRECT attempt per day.
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

// WAS: returned immediately on a wrong answer without touching the DB at
// all. That made the quiz trivially brute-forceable — 4 options, no record
// of a wrong guess, so POSTing indices 0..3 guaranteed the reward by the 4th
// attempt (0059_security_hardening.sql, section C.1).
//
// NOW: the attempt is recorded FIRST, regardless of correctness (reward 0
// when wrong), and only then is the reward conditionally credited — both
// inside claim_daily_quiz_reward's single transaction. Wrong answers still
// cost no coins; they just consume the one attempt per day that
// unique(user_id, claim_date) allows.
export async function claimDailyQuizReward(
  userId: string,
  selectedIndex: number,
  correctIndex: number
): Promise<ClaimResult> {
  const isCorrect = selectedIndex === correctIndex;
  const reward = await getQuizRewardAmount();

  const { data, error } = await createAdminClient().rpc('claim_daily_quiz_reward', {
    p_user_id: userId,
    p_reward: reward,
    p_is_correct: isCorrect,
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

  // Reported only after the attempt is durably recorded, so a wrong answer
  // can't be retried by simply ignoring this result.
  if (!isCorrect) return { ok: false, error: 'incorrect' };

  return { ok: true, balance: data, reward };
}

// All-time claim count for a motivational "you've done this N times" display
// — not a security gate, so fail open to 0 on error rather than throwing.
// Filtered to reward > 0: since section C.1, daily_quiz_claims also holds
// recorded-but-wrong attempts (reward 0), which are not achievements.
export async function getQuizClaimsCount(userId: string): Promise<number> {
  const { count, error } = await createAdminClient()
    .from('daily_quiz_claims')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gt('reward', 0);

  if (error) {
    console.error('[coins] getQuizClaimsCount read failed:', error);
    return 0;
  }

  return count ?? 0;
}

// Consecutive-day streak over CORRECT answers only (reward > 0) — a wrong
// attempt records a row but is not a streak day. Computed at read time from
// claim_date rows (no
// dedicated streak column). A missing claim for *today* does not break the
// streak (the user may still claim later today) — only a gap before today
// does. Fail open to 0 on error, same display-only bias as
// getQuizClaimsCount above.
export async function getQuizStreak(userId: string): Promise<number> {
  const { data, error } = await createAdminClient()
    .from('daily_quiz_claims')
    .select('claim_date')
    .eq('user_id', userId)
    .gt('reward', 0)
    .order('claim_date', { ascending: false })
    .limit(400);

  if (error) {
    console.error('[coins] getQuizStreak read failed:', error);
    return 0;
  }

  const claimDates = (data ?? []).map((row) => row.claim_date as string);
  if (claimDates.length === 0) return 0;

  const todayUtc = new Date().toISOString().slice(0, 10);
  const oneDayMs = 24 * 60 * 60 * 1000;

  const parseUtcDate = (dateStr: string): number => {
    const [year, month, day] = dateStr.split('-').map(Number);
    return Date.UTC(year, month - 1, day);
  };

  const todayMs = parseUtcDate(todayUtc);
  const mostRecentMs = parseUtcDate(claimDates[0]);
  const daysSinceMostRecent = Math.round((todayMs - mostRecentMs) / oneDayMs);

  if (daysSinceMostRecent > 1) return 0;

  let streak = 1;
  let previousMs = mostRecentMs;

  for (let i = 1; i < claimDates.length; i++) {
    const currentMs = parseUtcDate(claimDates[i]);
    const gapDays = Math.round((previousMs - currentMs) / oneDayMs);

    if (gapDays === 0) continue; // defensive: shouldn't happen given unique(user_id, claim_date)
    if (gapDays === 1) {
      streak += 1;
      previousMs = currentMs;
    } else {
      break;
    }
  }

  return streak;
}
