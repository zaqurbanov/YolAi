import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { isMissingRelationError } from '@/lib/supabase/missingRelation';
import { bakuTodayDate } from '@/lib/date/baku';
import { logError } from '@/lib/logging/logError';

// Phase 1 coin-earning mechanic (docs/coin-roadmap.md): a daily
// traffic-law mini-quiz, one question per user per day
// (lib/quiz/questions.ts). Fail-closed like lib/coins/transfers.ts — a
// claim is a deliberate reward action, any DB error means no reward, never
// a silent success assumption.

const QUIZ_REWARD_KEY = 'daily_quiz_reward';
const DEFAULT_QUIZ_REWARD = 3;

// Streak milestone bonuses: consecutive-correct-day -> extra coins credited on
// exactly that day. Resolved server-side (never client-supplied). The RPC
// (0064_daily_streak.sql) only APPLIES the map it is handed; this is the
// authoritative default, overridable via app_settings.streak_milestone_bonuses.
const STREAK_MILESTONE_KEY = 'streak_milestone_bonuses';
const DEFAULT_STREAK_MILESTONE_BONUSES: Record<number, number> = {
  3: 5,
  7: 15,
  14: 30,
  30: 75,
};

export {
  QUIZ_REWARD_KEY,
  DEFAULT_QUIZ_REWARD,
  STREAK_MILESTONE_KEY,
  DEFAULT_STREAK_MILESTONE_BONUSES,
};

export interface StreakStatus {
  current: number;
  longest: number;
  nextMilestone: number | null;
  nextMilestoneBonus: number | null;
}

// Reads the app_settings override for the milestone map, failing OPEN to the
// hardcoded TS default. Malformed entries (non-numeric day or bonus, <= 0) are
// ignored individually rather than discarding the whole override.
export async function getStreakMilestoneBonuses(): Promise<Record<number, number>> {
  const { data, error } = await createAdminClient()
    .from('app_settings')
    .select('value')
    .eq('key', STREAK_MILESTONE_KEY)
    .maybeSingle();

  if (error || !data || data.value == null) return DEFAULT_STREAK_MILESTONE_BONUSES;

  const raw = data.value;
  if (typeof raw !== 'object' || Array.isArray(raw)) return DEFAULT_STREAK_MILESTONE_BONUSES;

  const parsed: Record<number, number> = {};
  for (const [dayKey, bonusValue] of Object.entries(raw as Record<string, unknown>)) {
    const day = Number(dayKey);
    const bonus = typeof bonusValue === 'number' ? bonusValue : Number(bonusValue);
    if (!Number.isInteger(day) || day <= 0) continue;
    if (!Number.isFinite(bonus) || bonus <= 0) continue;
    parsed[day] = bonus;
  }

  return Object.keys(parsed).length > 0 ? parsed : DEFAULT_STREAK_MILESTONE_BONUSES;
}

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
  const todayUtc = bakuTodayDate();

  const { data, error } = await createAdminClient()
    .from('daily_quiz_claims')
    .select('id')
    .eq('user_id', userId)
    .eq('claim_date', todayUtc)
    .maybeSingle();

  if (error) {
    void logError('coins.quiz.hasClaimedToday', error, { userId });
    console.error('[coins] hasClaimedToday read failed:', error);
    // Fail closed: if we can't tell, assume already claimed so we never
    // double-credit on an infra hiccup — the user can retry, worst case
    // they see "artıq bugün cavablandırmısınız" once more than necessary.
    return true;
  }

  return Boolean(data);
}

type ClaimResult =
  | {
      ok: true;
      balance: number;
      reward: number;
      currentStreak: number;
      longestStreak: number;
      milestoneBonus: number;
    }
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
  const bonuses = await getStreakMilestoneBonuses();

  // Primary path: the streak-aware RPC (0064) does the claim AND the streak
  // advance + milestone bonus in one transaction. Bonuses are passed from here
  // (trusted server code), never from the client.
  const { data, error } = await createAdminClient().rpc('claim_daily_quiz_with_streak', {
    p_user_id: userId,
    p_reward: reward,
    p_is_correct: isCorrect,
    p_streak_bonuses: bonuses,
  });

  if (error) {
    const message = error.message ?? '';
    if (message.includes('already_claimed')) {
      return { ok: false, error: 'already_claimed' };
    }
    // Graceful degradation: the migration is applied by hand, so until it runs
    // the new RPC does not exist. Fall back to the old claim RPC so the base
    // reward is still credited (streak fields default to 0). Any OTHER error
    // stays fail-closed.
    if (isMissingRelationError(error)) {
      return claimViaLegacyRpc(userId, isCorrect, reward);
    }
    void logError('coins.quiz.claimWithStreak', error, { userId });
    console.error('[coins] claim_daily_quiz_with_streak RPC failed:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return { ok: false, error: 'error' };
  }

  if (typeof data !== 'object' || data === null) return { ok: false, error: 'error' };

  // Reported only after the attempt is durably recorded, so a wrong answer
  // can't be retried by simply ignoring this result.
  if (!isCorrect) return { ok: false, error: 'incorrect' };

  const result = data as {
    balance?: number;
    current_streak?: number;
    longest_streak?: number;
    milestone_bonus?: number;
  };

  return {
    ok: true,
    balance: Number(result.balance ?? 0),
    reward,
    currentStreak: Number(result.current_streak ?? 0),
    longestStreak: Number(result.longest_streak ?? 0),
    milestoneBonus: Number(result.milestone_bonus ?? 0),
  };
}

// Pre-0064 fallback: credits the base reward via the still-present
// claim_daily_quiz_reward RPC (returns numeric balance). No streak state, so
// the streak fields report 0 until the migration is applied.
async function claimViaLegacyRpc(
  userId: string,
  isCorrect: boolean,
  reward: number
): Promise<ClaimResult> {
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
    void logError('coins.quiz.claimLegacy', error, { userId });
    console.error('[coins] claim_daily_quiz_reward (legacy) RPC failed:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return { ok: false, error: 'error' };
  }

  if (typeof data !== 'number') return { ok: false, error: 'error' };
  if (!isCorrect) return { ok: false, error: 'incorrect' };

  return {
    ok: true,
    balance: data,
    reward,
    currentStreak: 0,
    longestStreak: 0,
    milestoneBonus: 0,
  };
}

// Read-only display helper for the streak card. FAILS OPEN: a missing table,
// any error, or no row all yield a zeroed streak whose nextMilestone points at
// the smallest configured milestone — the display never blocks on infra.
export async function getStreakStatus(userId: string): Promise<StreakStatus> {
  const bonuses = await getStreakMilestoneBonuses();

  const emptyStatus = (): StreakStatus => {
    const { day, bonus } = smallestMilestone(bonuses);
    return { current: 0, longest: 0, nextMilestone: day, nextMilestoneBonus: bonus };
  };

  const { data, error } = await createAdminClient()
    .from('user_streaks')
    .select('current_streak, longest_streak')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    if (!isMissingRelationError(error)) {
      void logError('coins.quiz.streakStatus', error, { userId });
      console.error('[coins] getStreakStatus read failed:', error);
    }
    return emptyStatus();
  }

  if (!data) return emptyStatus();

  const current = Number(data.current_streak ?? 0);
  const longest = Number(data.longest_streak ?? 0);
  const next = nextMilestoneAfter(bonuses, current);

  return {
    current,
    longest,
    nextMilestone: next.day,
    nextMilestoneBonus: next.bonus,
  };
}

function smallestMilestone(bonuses: Record<number, number>): {
  day: number | null;
  bonus: number | null;
} {
  const days = Object.keys(bonuses)
    .map(Number)
    .sort((a, b) => a - b);
  if (days.length === 0) return { day: null, bonus: null };
  return { day: days[0], bonus: bonuses[days[0]] };
}

// Smallest milestone day strictly greater than `current`; null once the user
// is at or past the largest configured milestone.
function nextMilestoneAfter(
  bonuses: Record<number, number>,
  current: number
): { day: number | null; bonus: number | null } {
  const days = Object.keys(bonuses)
    .map(Number)
    .sort((a, b) => a - b);
  for (const day of days) {
    if (day > current) return { day, bonus: bonuses[day] };
  }
  return { day: null, bonus: null };
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
    void logError('coins.quiz.claimsCount', error, { userId });
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
    void logError('coins.quiz.streak', error, { userId });
    console.error('[coins] getQuizStreak read failed:', error);
    return 0;
  }

  const claimDates = (data ?? []).map((row) => row.claim_date as string);
  if (claimDates.length === 0) return 0;

  const todayUtc = bakuTodayDate();
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
