import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { logError } from '@/lib/logging/logError';

// HEFTƏLIK MARAFON — the daily chest's reward is a 7-slot STREAK-DAY schedule
// (0097_daily_quest_split.sql, replacing 0095's weekday-anchored version). The
// marathon is now a per-user, per-cycle streak: day 1 = the first Baku day the
// user opens the chest, day 7 = COINS; a missed day resets the streak to day
// 1, and a completed day-7 cycle restarts at day 1 of a new cycle. The
// schedule is resolved SERVER-SIDE only from the `weekly_marathon_rewards`
// app_settings key, with a TS-side default (never seeded). The coin day is a
// FREE (no mission gate) coin INCOME path — 1 claim per user per Baku day via
// daily_quest_claims.chest_claimed — it does not breach the 0094 energy→coin
// invariant, because no energy is spent to mint it.
//
// This module also owns the per-mission ENERGY reward (`daily_mission_reward`):
// since 0097 the missions and the chest are SEPARATE — each of today's
// missions pays its own energy amount via claim_daily_mission.
//
// Read path fails OPEN (display AND the claim's reward resolution both fall
// back to the default on any error); reward amount/type are never
// client-supplied.

export const WEEKLY_MARATHON_REWARDS_KEY = 'weekly_marathon_rewards';

export const DAILY_MISSION_REWARD_KEY = 'daily_mission_reward';
export const DEFAULT_DAILY_MISSION_REWARD = 2;

export type MarathonRewardType = 'energy' | 'coins';

export interface WeeklyMarathonSlot {
  type: MarathonRewardType;
  amount: number;
}

// Index 0 = streak day 1 .. index 6 = streak day 7 (COINS). Streak-day
// indexing, NOT weekday: day 1 is the first day the user opens the chest, a
// missed day resets to day 1, and after a completed day-7 cycle the next open
// starts a new cycle at day 1. The claim RPC picks the slot by
// `(consecutive_chest_claimed_days % 7) + 1`.
export const DEFAULT_WEEKLY_MARATHON_SCHEDULE: WeeklyMarathonSlot[] = [
  { type: 'energy', amount: 3 },   // 0 — streak day 1
  { type: 'energy', amount: 5 },   // 1 — streak day 2
  { type: 'energy', amount: 7 },   // 2 — streak day 3
  { type: 'energy', amount: 10 },  // 3 — streak day 4
  { type: 'energy', amount: 12 },  // 4 — streak day 5
  { type: 'energy', amount: 15 },  // 5 — streak day 6
  { type: 'coins', amount: 5 },    // 6 — streak day 7 → COINS
];

// All-or-nothing validation: exactly 7 entries, each with type ∈
// {'energy','coins'} and a finite amount > 0. A single bad entry invalidates
// the WHOLE schedule — a partially-applied week would silently pay the wrong
// currency on some streak days.
function isValidSchedule(value: unknown): value is WeeklyMarathonSlot[] {
  if (!Array.isArray(value) || value.length !== 7) return false;
  return value.every((entry) => {
    if (typeof entry !== 'object' || entry === null) return false;
    const type = (entry as Record<string, unknown>).type;
    const amount = (entry as Record<string, unknown>).amount;
    return (type === 'energy' || type === 'coins') && typeof amount === 'number' && Number.isFinite(amount) && amount > 0;
  });
}

// Reads + validates the configured schedule, failing OPEN to the default (read
// path; the claim path resolves its reward from this same function, so a bad
// or absent table value can never mint an unintended reward).
export async function getWeeklyMarathonSchedule(): Promise<WeeklyMarathonSlot[]> {
  try {
    const { data, error } = await createAdminClient()
      .from('app_settings')
      .select('value')
      .eq('key', WEEKLY_MARATHON_REWARDS_KEY)
      .maybeSingle();

    if (error || !data) return DEFAULT_WEEKLY_MARATHON_SCHEDULE;
    if (isValidSchedule(data.value)) return data.value;
    return DEFAULT_WEEKLY_MARATHON_SCHEDULE;
  } catch (error) {
    void logError('coins.weeklyMarathon.read', error, {});
    return DEFAULT_WEEKLY_MARATHON_SCHEDULE;
  }
}

// Per-mission ENERGY reward, resolved server-side for claim_daily_mission.
// Mirrors getDailyChestRewardAmount's shape (lib/coins/dailyQuests.ts): reads
// the key, failing OPEN to the default on any read error or non-finite/<=0
// configured value. Reward amounts are never client-supplied.
export async function getDailyMissionReward(): Promise<number> {
  const { data, error } = await createAdminClient()
    .from('app_settings')
    .select('value')
    .eq('key', DAILY_MISSION_REWARD_KEY)
    .maybeSingle();

  if (error || !data) return DEFAULT_DAILY_MISSION_REWARD;

  const value = typeof data.value === 'number' ? data.value : Number(data.value);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_DAILY_MISSION_REWARD;
  return value;
}
