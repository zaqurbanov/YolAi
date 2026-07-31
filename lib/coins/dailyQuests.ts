import 'server-only';
import { randomInt } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { isMissingRelationError } from '@/lib/supabase/missingRelation';
import { logError } from '@/lib/logging/logError';

// "Gündəlik Missiyalar + Günün Sandığı" (Daily Quests + Daily Chest).
// Originally 3 fixed daily missions (0081_daily_quests.sql); as of
// 0085_daily_quest_rotation.sql this is a POOL of 8 possible missions,
// rotating 3/day. Mission definitions (label/kind/target) are TS code
// constants, not app_settings — only the chest reward amount is
// admin-tunable (mirrors lib/coins/adWatch.ts's getAdWatchRewardAmount
// pattern), same product decision 0081 made, just extended to 8 entries.

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

// CURRENCY: the chest pays ENERGY since 0094_two_currency_economy.sql. Its
// per-day bound is daily_quest_claims.chest_claimed, flipped under a row lock
// inside claim_daily_chest — one chest per user per Baku day.
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
  progress?: string;
}

export type DailyQuestStatusResult =
  | {
      ok: true;
      missions: DailyQuestMissionStatus[];
      chestClaimed: boolean;
      allDone: boolean;
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

  const todaysKeys = await getTodaysMissionKeys();
  const missions: DailyQuestMissionStatus[] = todaysKeys.map((key) => {
    const mission = MISSION_POOL.find((m) => m.key === key);
    if (!mission) {
      // Unknown/stale key (e.g. pool shrank since this key was rotated in)
      // — fail safe, same "never counts as done" posture as the SQL side.
      return { key, label: key, done: false };
    }
    const done = isSignalDone(signals, mission);
    const progress = mission.kind === 'chat' ? `${signals.chatCount}/${mission.target}` : undefined;
    return { key: mission.key, label: mission.label, done, progress };
  });

  return {
    ok: true,
    missions,
    chestClaimed: signals.chestClaimed,
    allDone: missions.length > 0 && missions.every((m) => m.done),
  };
}

export type ClaimDailyChestError = 'already_claimed' | 'quests_incomplete' | 'unavailable' | 'error';

export type ClaimDailyChestResult =
  | {
      ok: true;
      /** Coin balance — unchanged by the chest, returned for the shared meter. */
      balance: number;
      /** New ENERGY balance. */
      energy: number;
      /** ENERGY paid by the chest (since 0094). */
      reward: number;
    }
  | { ok: false; error: ClaimDailyChestError };

// One claim per Baku day per user — enforced by claim_daily_chest's row lock
// + chest_claimed flag, this function just translates its outcome (mirrors
// claimAdWatchReward's error-mapping technique).
export async function claimDailyChest(userId: string): Promise<ClaimDailyChestResult> {
  const [reward, missionKeys] = await Promise.all([getDailyChestRewardAmount(), getTodaysMissionKeys()]);

  const { data, error } = await createAdminClient().rpc('claim_daily_chest', {
    p_user_id: userId,
    p_mission_keys: missionKeys,
    p_reward: reward,
  });

  if (error) {
    const message = error.message ?? '';
    if (message.includes('already_claimed')) return { ok: false, error: 'already_claimed' };
    if (message.includes('quests_incomplete')) return { ok: false, error: 'quests_incomplete' };
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
  const result = data as { balance?: number; energy?: number; reward?: number };

  return {
    ok: true,
    balance: Number(result.balance ?? 0),
    energy: Number(result.energy ?? 0),
    reward: Number(result.reward ?? reward),
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
