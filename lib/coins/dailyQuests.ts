import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { isMissingRelationError } from '@/lib/supabase/missingRelation';
import { logError } from '@/lib/logging/logError';

// "Gündəlik Missiyalar + Günün Sandığı" (Daily Quests + Daily Chest,
// 0081_daily_quests.sql). Three missions per Baku day — ask >= CHAT_TARGET
// questions, play "Nişan Sürəti" once, read one lesson — then a single chest
// claim credits a flat reward. Mission TARGETS are code constants, not
// app_settings (product decision — only the reward amount is admin-tunable),
// mirroring lib/coins/adWatch.ts's getAdWatchRewardAmount pattern exactly.

// Product constant, not app_settings — how many chat questions count as
// "today's chat mission" complete.
export const CHAT_TARGET = 2;

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

export type DailyQuestStatusResult =
  | {
      ok: true;
      chatCount: number;
      chatTarget: number;
      gamePlayed: boolean;
      lessonRead: boolean;
      chestClaimed: boolean;
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
  const result = data as {
    chatCount?: number;
    gamePlayed?: boolean;
    lessonRead?: boolean;
    chestClaimed?: boolean;
  };

  return {
    ok: true,
    chatCount: Number(result.chatCount ?? 0),
    chatTarget: CHAT_TARGET,
    gamePlayed: Boolean(result.gamePlayed),
    lessonRead: Boolean(result.lessonRead),
    chestClaimed: Boolean(result.chestClaimed),
  };
}

export type ClaimDailyChestError = 'already_claimed' | 'quests_incomplete' | 'unavailable' | 'error';

export type ClaimDailyChestResult =
  | { ok: true; balance: number; reward: number }
  | { ok: false; error: ClaimDailyChestError };

// One claim per Baku day per user — enforced by claim_daily_chest's row lock
// + chest_claimed flag, this function just translates its outcome (mirrors
// claimAdWatchReward's error-mapping technique).
export async function claimDailyChest(userId: string): Promise<ClaimDailyChestResult> {
  const reward = await getDailyChestRewardAmount();

  const { data, error } = await createAdminClient().rpc('claim_daily_chest', {
    p_user_id: userId,
    p_chat_target: CHAT_TARGET,
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
  const result = data as { balance?: number; reward?: number };

  return { ok: true, balance: Number(result.balance ?? 0), reward: Number(result.reward ?? reward) };
}

// Fire-and-forget counter bump, called from the hot chat path
// (app/api/chat/route.ts) once per persisted user message. CONTRACT: this
// must NEVER throw — the caller invokes it unawaited (`void
// recordQuestChatActivity(...)`) from inside an existing try/catch it must
// not be able to disturb.
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
