import 'server-only';
import { randomInt } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { isMissingRelationError } from '@/lib/supabase/missingRelation';
import { logError } from '@/lib/logging/logError';
import {
  DEFAULT_WEEKLY_MARATHON_SCHEDULE,
  DEFAULT_DAILY_MISSION_REWARD,
  getWeeklyMarathonSchedule,
  getDailyMissionReward,
  type MarathonRewardType,
  type WeeklyMarathonSlot,
} from '@/lib/coins/weeklyMarathon';

// "Gündəlik Missiyalar + Günün Sandığı" (Daily Quests + Daily Chest).
// Originally 3 fixed daily missions (0081_daily_quests.sql); as of
// 0085_daily_quest_rotation.sql this is a POOL of 8 possible missions,
// rotating 3/day. Mission definitions (label/kind/target) are TS code
// constants, not app_settings.
//
// As of 0097_daily_quest_split.sql the MISSIONS and the CHEST are SEPARATE:
//   - Each daily mission pays its OWN per-mission ENERGY reward, claimed
//     individually via claimDailyMission (amount from the
//     `daily_mission_reward` app_settings key, resolved server-side).
//   - The chest is FREE — no mission gate at all, still one open per user per
//     Baku day. Its reward is a 7-slot STREAK-DAY schedule (energy days 1-6,
//     coins on streak day 7), admin-tunable via the `weekly_marathon_rewards`
//     app_settings key with a TS-side default (lib/coins/weeklyMarathon.ts).
//     "Streak day" is per-user: day 1 = the first day the user opens the
//     chest, a missed day resets to day 1, a completed day-7 cycle restarts
//     at day 1.

export interface MissionDef {
  key: string;
  label: string;
  kind: 'chat' | 'sign_speed' | 'lesson' | 'xo' | 'wheel' | 'daily_quiz';
  target?: number;
}

// The full pool. See 0085_daily_quest_rotation.sql's top comment for why 3
// of these 8 are picked "longest unused first" rather than a fixed set, and
// why that is a best-effort spread rather than a mathematically guaranteed
// no-repeat window (8 keys / 3 shown per day cannot guarantee, e.g., a
// strict multi-day gap for every key forever — pigeonhole).
export const MISSION_POOL: MissionDef[] = [
  { key: 'chat_1', label: 'AI-a ən azı 1 sual ver', kind: 'chat', target: 1 },
  { key: 'chat_2', label: 'AI-a ən azı 2 sual ver', kind: 'chat', target: 2 },
  { key: 'chat_3', label: 'AI-a ən azı 3 sual ver', kind: 'chat', target: 3 },
  { key: 'sign_speed', label: 'Nişan Sürəti oyununda 1 dəfə oyna', kind: 'sign_speed' },
  { key: 'lesson', label: '1 dərs oxu', kind: 'lesson' },
  { key: 'xo', label: 'XO oyununda 1 dəfə oyna', kind: 'xo' },
  { key: 'wheel', label: 'Çarxı fırlat', kind: 'wheel' },
  { key: 'daily_quiz', label: 'Bugünkü sualı cavablandır', kind: 'daily_quiz' },
];

const MISSIONS_PER_DAY = 3;
const ROTATION_HISTORY_ROWS = 7;

// The legacy scalar chest reward below stays exported for the old admin
// endpoint (GET/PATCH ?type=daily-chest-reward); the claim path no longer
// reads it — the chest is streak-scheduled via weeklyMarathon.ts and missions
// pay per-mission energy (daily_mission_reward) since 0097.
const DAILY_CHEST_REWARD_KEY = 'daily_chest_reward';
const DEFAULT_DAILY_CHEST_REWARD = 10;

export { DAILY_CHEST_REWARD_KEY, DEFAULT_DAILY_CHEST_REWARD };

// Mirrors getAdWatchRewardAmount's shape byte-for-byte.
export async function getDailyChestRewardAmount(): Promise<number> {
  const { data, error } = await createAdminClient()
    .from('app_settings')
    .select('value')
    .eq('key', DAILY_CHEST_REWARD_KEY)
    .maybeSingle();

  if (error || !data) return DEFAULT_DAILY_CHEST_REWARD;

  const value = typeof data.value === 'number' ? data.value : Number(data.value);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_DAILY_CHEST_REWARD;
  return value;
}

// Fisher-Yates using crypto randomInt — never Math.random() for anything
// reward-adjacent (copied verbatim from lib/coins/signSpeed.ts; which 3
// missions show today is reward-adjacent since it gates the chest).
function shuffle<T>(items: T[]): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function bakuToday(): string {
  // en-CA locale formats as YYYY-MM-DD, which matches Postgres `date` text
  // representation exactly — safe to compare/store as-is.
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Baku' });
}

// Both inputs are plain YYYY-MM-DD calendar dates (no time component), so
// parsing as UTC midnight avoids any local-timezone-of-the-server skew.
function daysBetween(laterIso: string, earlierIso: string): number {
  const toUtcMs = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtcMs(laterIso) - toUtcMs(earlierIso)) / 86_400_000);
}

// Picks today's 3 mission keys, "longest unused first" (best-effort spread —
// see 0085_daily_quest_rotation.sql for why this cannot be a hard
// no-repeat guarantee). Idempotent per Baku day: the first request of the
// day to reach the INSERT wins; every other concurrent/later request
// (including a status read racing a claim) converges on the SAME stored row
// via ON CONFLICT DO NOTHING + a re-select, so a single day never shows two
// different rotations to two different requests.
export async function getTodaysMissionKeys(): Promise<string[]> {
  const today = bakuToday();
  const admin = createAdminClient();

  try {
    const { data: existing, error: existingError } = await admin
      .from('daily_quest_rotation')
      .select('mission_keys')
      .eq('quest_date', today)
      .maybeSingle();

    if (existingError && !isMissingRelationError(existingError)) {
      void logError('coins.dailyQuests.rotation.readToday', existingError, {});
      console.error('[coins] daily_quest_rotation read failed:', existingError);
    }

    if (existing?.mission_keys && Array.isArray(existing.mission_keys)) {
      return existing.mission_keys as string[];
    }

    if (existingError && isMissingRelationError(existingError)) {
      // 0085 not applied yet — degrade to an unpersisted random pick rather
      // than hard-failing the whole daily quest card. Not stable across
      // requests, but this only happens before the migration is run.
      return shuffle(MISSION_POOL.map((m) => m.key)).slice(0, MISSIONS_PER_DAY);
    }

    const { data: history, error: historyError } = await admin
      .from('daily_quest_rotation')
      .select('quest_date, mission_keys')
      .order('quest_date', { ascending: false })
      .limit(ROTATION_HISTORY_ROWS);

    if (historyError) {
      void logError('coins.dailyQuests.rotation.readHistory', historyError, {});
      console.error('[coins] daily_quest_rotation history read failed:', historyError);
    }

    const rows = (history ?? []) as { quest_date: string; mission_keys: string[] }[];

    // For each pool key, how many days ago it most recently appeared in the
    // last 7 rotation rows, or Infinity if it doesn't appear at all in that
    // window (rows are already ordered most-recent-first, so the first row
    // containing a key is its most recent occurrence).
    const daysSinceUse = new Map<string, number>(MISSION_POOL.map((m) => [m.key, Infinity]));
    for (const row of rows) {
      const gap = daysBetween(today, row.quest_date);
      for (const key of row.mission_keys ?? []) {
        if (daysSinceUse.get(key) === Infinity) {
          daysSinceUse.set(key, gap);
        }
      }
    }

    // Group by staleness tier, shuffle within each tier (crypto-random tie
    // break), then walk tiers most-stale-first taking keys until we have 3.
    const tiers = new Map<number, string[]>();
    for (const mission of MISSION_POOL) {
      const gap = daysSinceUse.get(mission.key) ?? Infinity;
      if (!tiers.has(gap)) tiers.set(gap, []);
      tiers.get(gap)!.push(mission.key);
    }
    const orderedGaps = [...tiers.keys()].sort((a, b) => b - a);

    const chosen: string[] = [];
    for (const gap of orderedGaps) {
      for (const key of shuffle(tiers.get(gap)!)) {
        if (chosen.length >= MISSIONS_PER_DAY) break;
        chosen.push(key);
      }
      if (chosen.length >= MISSIONS_PER_DAY) break;
    }

    const { error: insertError } = await admin
      .from('daily_quest_rotation')
      .insert({ quest_date: today, mission_keys: chosen })
      .select()
      .single();

    if (insertError && insertError.code !== '23505') {
      // Anything other than "someone else already inserted today's row" is
      // worth logging, but not worth failing the request over — fall back
      // to the locally computed selection.
      void logError('coins.dailyQuests.rotation.insert', insertError, {});
      console.error('[coins] daily_quest_rotation insert failed:', insertError);
      return chosen;
    }

    // Re-select regardless of whether WE won the insert, so a request that
    // lost a concurrent race converges on the winner's stored keys instead
    // of using its own locally computed (and now discarded) selection.
    const { data: finalRow, error: finalError } = await admin
      .from('daily_quest_rotation')
      .select('mission_keys')
      .eq('quest_date', today)
      .maybeSingle();

    if (finalError || !finalRow?.mission_keys) {
      return chosen;
    }
    return finalRow.mission_keys as string[];
  } catch (error) {
    void logError('coins.dailyQuests.rotation.unexpected', error, {});
    console.error('[coins] getTodaysMissionKeys unexpected failure:', error);
    return shuffle(MISSION_POOL.map((m) => m.key)).slice(0, MISSIONS_PER_DAY);
  }
}

interface RawQuestSignals {
  chatCount: number;
  signSpeedDone: boolean;
  lessonDone: boolean;
  xoDone: boolean;
  wheelDone: boolean;
  dailyQuizDone: boolean;
  chestClaimed: boolean;
  claimedMissionKeys?: string[];
  chestStreak?: number;
}

function isSignalDone(signals: RawQuestSignals, mission: MissionDef): boolean {
  switch (mission.kind) {
    case 'chat':
      return signals.chatCount >= (mission.target ?? 1);
    case 'sign_speed':
      return signals.signSpeedDone;
    case 'lesson':
      return signals.lessonDone;
    case 'xo':
      return signals.xoDone;
    case 'wheel':
      return signals.wheelDone;
    case 'daily_quiz':
      return signals.dailyQuizDone;
    default:
      return false;
  }
}

export interface DailyQuestMissionStatus {
  key: string;
  label: string;
  done: boolean;
  /** Whether THIS user has already claimed this mission's energy reward today. */
  claimed: boolean;
  progress?: string;
}

export type DailyQuestStatusResult =
  | {
      ok: true;
      missions: DailyQuestMissionStatus[];
      chestClaimed: boolean;
      allDone: boolean;
      /** Per-mission ENERGY reward (resolved server-side from app_settings). */
      missionReward: number;
      // Weekly-marathon display data: the full 7-slot schedule (index 0 =
      // streak day 1 .. index 6 = streak day 7 = COINS), the user's current
      // consecutive-claim streak, and whether today is already claimed.
      // Fail-open — never gates the status.
      marathon: { schedule: WeeklyMarathonSlot[]; streak: number; todayClaimed: boolean };
    }
  | { ok: false; error: 'unavailable' | 'error' };

// Read-only status probe for the /coin-qazan quest card. Fail-closed like
// signSpeed.ts's RPC wrappers: a missing migration reports 'unavailable',
// any other error is logged and reported generically rather than assuming
// zero progress (which would visually reset a user's real progress).
export async function getDailyQuestStatus(userId: string): Promise<DailyQuestStatusResult> {
  const { data, error } = await createAdminClient().rpc('get_daily_quest_status', {
    p_user_id: userId,
  });

  if (error) {
    if (isMissingRelationError(error)) return { ok: false, error: 'unavailable' };
    void logError('coins.dailyQuests.status', error, { userId });
    console.error('[coins] get_daily_quest_status RPC failed:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return { ok: false, error: 'error' };
  }

  if (typeof data !== 'object' || data === null) return { ok: false, error: 'error' };
  const raw = data as Partial<RawQuestSignals>;
  const signals: RawQuestSignals = {
    chatCount: Number(raw.chatCount ?? 0),
    signSpeedDone: Boolean(raw.signSpeedDone),
    lessonDone: Boolean(raw.lessonDone),
    xoDone: Boolean(raw.xoDone),
    wheelDone: Boolean(raw.wheelDone),
    dailyQuizDone: Boolean(raw.dailyQuizDone),
    chestClaimed: Boolean(raw.chestClaimed),
  };

  const claimedKeys = new Set((raw.claimedMissionKeys ?? []).map(String));
  const todaysKeys = await getTodaysMissionKeys();
  const missions: DailyQuestMissionStatus[] = todaysKeys.map((key) => {
    const mission = MISSION_POOL.find((m) => m.key === key);
    if (!mission) {
      // Unknown/stale key (e.g. pool shrank since this key was rotated in)
      // — fail safe, same "never counts as done" posture as the SQL side.
      return { key, label: key, done: false, claimed: false };
    }
    const done = isSignalDone(signals, mission);
    const progress = mission.kind === 'chat' ? `${signals.chatCount}/${mission.target}` : undefined;
    return { key: mission.key, label: mission.label, done, claimed: claimedKeys.has(mission.key), progress };
  });

  // Marathon display data fails OPEN: getWeeklyMarathonSchedule and
  // getDailyMissionReward already degrade to their defaults, but the outer
  // guard below makes the whole fallback explicit — a bad or missing table
  // value must never fail the quest card.
  const streak = Number(raw.chestStreak ?? 0);
  const todayClaimed = signals.chestClaimed;
  let marathon: { schedule: WeeklyMarathonSlot[]; streak: number; todayClaimed: boolean };
  let missionReward: number;
  try {
    const [schedule, reward] = await Promise.all([getWeeklyMarathonSchedule(), getDailyMissionReward()]);
    marathon = { schedule, streak, todayClaimed };
    missionReward = reward;
  } catch (error) {
    void logError('coins.dailyQuests.marathon.status', error, { userId });
    marathon = { schedule: DEFAULT_WEEKLY_MARATHON_SCHEDULE, streak, todayClaimed };
    missionReward = DEFAULT_DAILY_MISSION_REWARD;
  }

  return {
    ok: true,
    missions,
    chestClaimed: signals.chestClaimed,
    allDone: missions.length > 0 && missions.every((m) => m.done),
    missionReward,
    marathon,
  };
}

export type ClaimDailyChestError = 'already_claimed' | 'unavailable' | 'error';

export type ClaimDailyChestResult =
  | {
      ok: true;
      /** Coin balance — incremented by a coin chest, unchanged by an energy chest; returned for the shared meter either way. */
      balance: number;
      /** New ENERGY balance (unchanged by a coin chest). */
      energy: number;
      /** Reward paid by the chest — ENERGY or COINS depending on rewardType. */
      reward: number;
      /** Which currency the chest actually paid ('coins' | 'energy'). */
      rewardType: MarathonRewardType;
    }
  | { ok: false; error: ClaimDailyChestError };

// One claim per Baku day per user — enforced by claim_daily_chest's row lock
// + chest_claimed flag, this function just translates its outcome (mirrors
// claimAdWatchReward's error-mapping technique).
export async function claimDailyChest(userId: string): Promise<ClaimDailyChestResult> {
  // The FULL 7-slot streak schedule is resolved server-side and passed to the
  // RPC, which picks the slot by the user's STREAK day (day 1 = first day the
  // user opens the marathon; day 7 = coins; a missed day resets). The chest
  // has NO mission gate since 0097 — it is free. Reward amount/type are never
  // client-supplied beyond this server-resolved schedule.
  const schedule = await getWeeklyMarathonSchedule();

  const { data, error } = await createAdminClient().rpc('claim_daily_chest', {
    p_user_id: userId,
    p_schedule: schedule,
  });

  if (error) {
    const message = error.message ?? '';
    if (message.includes('already_claimed')) return { ok: false, error: 'already_claimed' };
    if (isMissingRelationError(error)) return { ok: false, error: 'unavailable' };
    void logError('coins.dailyQuests.claim', error, { userId });
    console.error('[coins] claim_daily_chest RPC failed:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return { ok: false, error: 'error' };
  }

  if (typeof data !== 'object' || data === null) return { ok: false, error: 'error' };
  const result = data as { balance?: number; energy?: number; reward?: number; reward_type?: string | null };

  return {
    ok: true,
    balance: Number(result.balance ?? 0),
    energy: Number(result.energy ?? 0),
    reward: Number(result.reward ?? 0),
    // Fail-safe: anything other than an explicit 'coins' from the RPC is
    // treated as energy, so a mis-typed or stale RPC payload can never be
    // reported as a coin payout.
    rewardType: result.reward_type === 'coins' ? 'coins' : 'energy',
  };
}

export type ClaimDailyMissionError = 'already_claimed' | 'mission_not_available' | 'mission_incomplete' | 'unavailable' | 'error';

export type ClaimDailyMissionResult =
  | {
      ok: true;
      /** New ENERGY balance after the reward. */
      energy: number;
      /** READ-ONLY coin balance, for the shared UI meter (missions never write coins). */
      balance: number;
      /** The energy reward paid for this mission (resolved server-side). */
      reward: number;
    }
  | { ok: false; error: ClaimDailyMissionError };

// Exactly one claim per mission per Baku day — enforced by claim_daily_mission's
// row lock + claimed_mission_keys append, this function just translates its
// outcome (same error-mapping technique as claimDailyChest).
export async function claimDailyMission(userId: string, missionKey: string): Promise<ClaimDailyMissionResult> {
  // The reward amount is resolved server-side from app_settings
  // (daily_mission_reward) — never client-supplied.
  const reward = await getDailyMissionReward();

  const { data, error } = await createAdminClient().rpc('claim_daily_mission', {
    p_user_id: userId,
    p_mission_key: missionKey,
    p_reward: reward,
  });

  if (error) {
    const message = error.message ?? '';
    if (message.includes('already_claimed')) return { ok: false, error: 'already_claimed' };
    if (message.includes('mission_not_available')) return { ok: false, error: 'mission_not_available' };
    if (message.includes('mission_incomplete')) return { ok: false, error: 'mission_incomplete' };
    if (isMissingRelationError(error)) return { ok: false, error: 'unavailable' };
    void logError('coins.dailyQuests.claimMission', error, { userId });
    console.error('[coins] claim_daily_mission RPC failed:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return { ok: false, error: 'error' };
  }

  if (typeof data !== 'object' || data === null) return { ok: false, error: 'error' };
  const result = data as { energy?: number; balance?: number };

  return {
    ok: true,
    energy: Number(result.energy ?? 0),
    balance: Number(result.balance ?? 0),
    reward,
  };
}

// Fire-and-forget counter bump, called from the hot chat path
// (app/api/chat/route.ts) once per persisted user message. CONTRACT: this
// must NEVER throw — the caller invokes it unawaited (`void
// recordQuestChatActivity(...)`) from inside an existing try/catch it must
// not be able to disturb. Signature/behavior UNCHANGED from 0081.
export async function recordQuestChatActivity(userId: string): Promise<void> {
  try {
    const { error } = await createAdminClient().rpc('record_quest_chat_activity', {
      p_user_id: userId,
    });
    if (error) {
      void logError('coins.dailyQuests.recordChat', error, { userId });
    }
  } catch (error) {
    void logError('coins.dailyQuests.recordChat', error, { userId });
  }
}
