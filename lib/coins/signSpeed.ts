import 'server-only';
import { randomInt } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { isMissingRelationError } from '@/lib/supabase/missingRelation';
import { getSignPool, type SignPoolEntry } from '@/lib/coins/signPool';
import { GAME_DAILY_ENERGY_KEY, DEFAULT_GAME_DAILY_ENERGY } from '@/lib/coins/games';
import { getEffectiveEnergyGrant } from '@/lib/garage/perks';
import { logError } from '@/lib/logging/logError';

// "Nişan Sürəti" (sign speed quiz) — see docs/sign-speed-game-plan.md.
// SERVER-AUTHORITATIVE, same posture as XO/wheel: the server picks the
// question set + correct answers at round-start and never sends the correct
// index to the client; grading happens server-side against the stored
// answers. Energy is spent ONCE per round-start (not per question, not at
// settle) — see the migration's top comment for why.

// ---------------------------------------------------------------------------
// Config — app_settings with TS-side defaults (house convention, no seed rows).
// The daily energy GRANT amount is intentionally reused from games.ts
// (GAME_DAILY_ENERGY_KEY) — one shared energy pool for the whole games
// section, not a second one for this game.
// ---------------------------------------------------------------------------
const SIGN_SPEED_PER_CORRECT_REWARD_KEY = 'sign_speed_per_correct_reward';
const DEFAULT_SIGN_SPEED_PER_CORRECT_REWARD = 1;

const SIGN_SPEED_DAILY_REWARD_CAP_KEY = 'sign_speed_daily_reward_cap';
const DEFAULT_SIGN_SPEED_DAILY_REWARD_CAP = 20;

const SIGN_SPEED_ENERGY_COST_KEY = 'sign_speed_energy_cost';
const DEFAULT_SIGN_SPEED_ENERGY_COST = 1;

const SIGN_SPEED_SESSION_TTL_SECONDS_KEY = 'sign_speed_session_ttl_seconds';
const DEFAULT_SIGN_SPEED_SESSION_TTL_SECONDS = 180;

export {
  SIGN_SPEED_PER_CORRECT_REWARD_KEY,
  DEFAULT_SIGN_SPEED_PER_CORRECT_REWARD,
  SIGN_SPEED_DAILY_REWARD_CAP_KEY,
  DEFAULT_SIGN_SPEED_DAILY_REWARD_CAP,
  SIGN_SPEED_ENERGY_COST_KEY,
  DEFAULT_SIGN_SPEED_ENERGY_COST,
  SIGN_SPEED_SESSION_TTL_SECONDS_KEY,
  DEFAULT_SIGN_SPEED_SESSION_TTL_SECONDS,
};

const QUESTIONS_PER_ROUND = 10;
const OPTIONS_PER_QUESTION = 4;
// Need 10 unique correct answers plus enough remaining entries to draw 3
// distractors per question from (never a hard requirement that they're
// distinct across questions, only never reusing a correct answer as a
// distractor) — comfortable minimum per the plan.
const MIN_POOL_SIZE = 14;

async function readNumericSetting(key: string, fallback: number): Promise<number> {
  const { data, error } = await createAdminClient()
    .from('app_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();

  if (error || !data) return fallback;

  const value = typeof data.value === 'number' ? data.value : Number(data.value);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return value;
}

// Fisher-Yates using crypto randomInt — never Math.random() for anything that
// determines a reward-bearing outcome (mirrors wheel.ts).
function shuffle<T>(items: T[]): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function sampleWithoutReplacement<T>(items: T[], count: number): T[] {
  return shuffle(items).slice(0, count);
}

export interface SignSpeedQuestion {
  code: string;
  options: string[];
  imageUrl?: string;
}

export type SignSpeedStartError = 'no_energy' | 'unavailable' | 'pool_too_small' | 'error';

export type SignSpeedStartResult =
  | { ok: true; sessionId: string; questions: SignSpeedQuestion[] }
  | { ok: false; error: SignSpeedStartError };

export async function startSignSpeedRound(userId: string): Promise<SignSpeedStartResult> {
  const pool = await getSignPool();
  if (pool.length < MIN_POOL_SIZE) {
    return { ok: false, error: 'pool_too_small' };
  }

  const chosen = sampleWithoutReplacement(pool, QUESTIONS_PER_ROUND);
  const chosenDescriptions = new Set(chosen.map((entry) => entry.description));
  // Distractor candidates exclude every entry used as a correct answer this
  // round, so a distractor can never double as (or give away) another
  // question's correct answer.
  const distractorCandidates = pool.filter((entry) => !chosenDescriptions.has(entry.description));

  const questionCodes: string[] = [];
  const correctIndices: number[] = [];
  const questions: SignSpeedQuestion[] = [];

  for (const entry of chosen) {
    const distractors = sampleWithoutReplacement(distractorCandidates, OPTIONS_PER_QUESTION - 1);
    const optionEntries: SignPoolEntry[] = shuffle([entry, ...distractors]);
    const correctIndex = optionEntries.findIndex((o) => o.description === entry.description);

    questionCodes.push(entry.code);
    correctIndices.push(correctIndex);
    questions.push({
      code: entry.code,
      options: optionEntries.map((o) => o.description),
      imageUrl: entry.imageUrl,
    });
  }

  const [baseDailyEnergyGrant, energyCost] = await Promise.all([
    readNumericSetting(GAME_DAILY_ENERGY_KEY, DEFAULT_GAME_DAILY_ENERGY),
    readNumericSetting(SIGN_SPEED_ENERGY_COST_KEY, DEFAULT_SIGN_SPEED_ENERGY_COST),
  ]);
  const dailyEnergyGrant = await getEffectiveEnergyGrant(userId, baseDailyEnergyGrant);

  const { data, error } = await createAdminClient().rpc('start_sign_speed_round', {
    p_user_id: userId,
    p_question_codes: questionCodes,
    p_correct_indices: correctIndices,
    p_daily_energy_grant: Math.round(dailyEnergyGrant),
    p_energy_cost: Math.round(energyCost),
  });

  if (error) {
    const message = error.message ?? '';
    if (message.includes('no_energy')) return { ok: false, error: 'no_energy' };
    if (isMissingRelationError(error)) return { ok: false, error: 'unavailable' };
    void logError('coins.signSpeed.startRound', error, { userId });
    console.error('[coins] start_sign_speed_round RPC failed:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return { ok: false, error: 'error' };
  }

  if (typeof data !== 'object' || data === null) return { ok: false, error: 'error' };
  const result = data as { sessionId?: string };
  if (typeof result.sessionId !== 'string') return { ok: false, error: 'error' };

  return { ok: true, sessionId: result.sessionId, questions };
}

export type SignSpeedSubmitError =
  | 'session_not_found'
  | 'already_used'
  | 'session_expired'
  | 'invalid_answers'
  | 'unavailable'
  | 'error';

export type SignSpeedSubmitResult =
  | { ok: true; correctCount: number; reward: number; energy: number; balance: number }
  | { ok: false; error: SignSpeedSubmitError };

// Energy was already spent atomically inside startSignSpeedRound — settling a
// round never touches user_energy. This is a plain, no-grant read of the
// CURRENT balance purely so the frontend's shared energy meter can refresh
// after a round without a second RPC round-trip. Fails open to 0 (display
// only; the authoritative spend already happened at start).
async function readCurrentEnergyBalance(userId: string): Promise<number> {
  try {
    const { data, error } = await createAdminClient()
      .from('user_energy')
      .select('balance')
      .eq('user_id', userId)
      .maybeSingle();
    if (error || !data) return 0;
    return Number(data.balance ?? 0);
  } catch {
    return 0;
  }
}

export async function submitSignSpeedRound(
  userId: string,
  sessionId: string,
  answers: number[]
): Promise<SignSpeedSubmitResult> {
  if (
    !Array.isArray(answers) ||
    answers.length !== QUESTIONS_PER_ROUND ||
    !answers.every((a) => Number.isInteger(a) && a >= 0 && a < OPTIONS_PER_QUESTION)
  ) {
    return { ok: false, error: 'invalid_answers' };
  }

  const [perCorrectReward, dailyRewardCap, ttlSeconds] = await Promise.all([
    readNumericSetting(SIGN_SPEED_PER_CORRECT_REWARD_KEY, DEFAULT_SIGN_SPEED_PER_CORRECT_REWARD),
    readNumericSetting(SIGN_SPEED_DAILY_REWARD_CAP_KEY, DEFAULT_SIGN_SPEED_DAILY_REWARD_CAP),
    readNumericSetting(SIGN_SPEED_SESSION_TTL_SECONDS_KEY, DEFAULT_SIGN_SPEED_SESSION_TTL_SECONDS),
  ]);

  const { data, error } = await createAdminClient().rpc('settle_sign_speed_round', {
    p_user_id: userId,
    p_session_id: sessionId,
    p_answers: answers,
    p_per_correct_reward: perCorrectReward,
    p_daily_reward_cap: dailyRewardCap,
    p_session_ttl_seconds: Math.round(ttlSeconds),
  });

  if (error) {
    const message = error.message ?? '';
    if (message.includes('session_not_found')) return { ok: false, error: 'session_not_found' };
    if (message.includes('already_used')) return { ok: false, error: 'already_used' };
    if (message.includes('session_expired')) return { ok: false, error: 'session_expired' };
    if (message.includes('invalid_answers')) return { ok: false, error: 'invalid_answers' };
    if (isMissingRelationError(error)) return { ok: false, error: 'unavailable' };
    void logError('coins.signSpeed.settleRound', error, { userId });
    console.error('[coins] settle_sign_speed_round RPC failed:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return { ok: false, error: 'error' };
  }

  if (typeof data !== 'object' || data === null) return { ok: false, error: 'error' };
  const result = data as { balance?: number; correctCount?: number; reward?: number };

  const energy = await readCurrentEnergyBalance(userId);

  return {
    ok: true,
    correctCount: Number(result.correctCount ?? 0),
    reward: Number(result.reward ?? 0),
    energy,
    balance: Number(result.balance ?? 0),
  };
}
