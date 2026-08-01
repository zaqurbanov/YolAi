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
//
// CURRENCY: the per-correct reward pays ENERGY since
// 0094_two_currency_economy.sql. This RPC paying COINS while the round cost
// energy was the profitable half of the old coin->energy->coin farming loop;
// the two-currency split closes it. Never move this payout back to coins.

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

// `allowZero` mirrors lib/coins/games.ts: 0 is a legitimate PRICE (free play,
// set from the admin panel) but a "couldn't read it" signal for a reward/cap.
async function readNumericSetting(
  key: string,
  fallback: number,
  options?: { allowZero?: boolean }
): Promise<number> {
  const { data, error } = await createAdminClient()
    .from('app_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();

  if (error || !data) return fallback;

  const value = typeof data.value === 'number' ? data.value : Number(data.value);
  if (!Number.isFinite(value)) return fallback;
  if (options?.allowZero ? value < 0 : value <= 0) return fallback;
  return value;
}

// The Nişan Sürəti round price in ENERGY (for display). Fails open to the TS
// default; the authoritative charge is start_sign_speed_round's decrement.
export async function getSignSpeedEnergyCost(): Promise<number> {
  return readNumericSetting(SIGN_SPEED_ENERGY_COST_KEY, DEFAULT_SIGN_SPEED_ENERGY_COST, {
    allowZero: true,
  });
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
    readNumericSetting(SIGN_SPEED_ENERGY_COST_KEY, DEFAULT_SIGN_SPEED_ENERGY_COST, {
      allowZero: true,
    }),
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
  | {
      ok: true;
      correctCount: number;
      correctFlags: boolean[];
      /** The right option per question. Only ever returned AFTER settling. */
      correctIndices: number[];
      /** ENERGY paid for this round (since 0094). */
      reward: number;
      /** New ENERGY balance, after the round's cost AND its reward. */
      energy: number;
      /** Coin balance — unchanged by a round, returned for the shared meter. */
      balance: number;
    }
  | { ok: false; error: SignSpeedSubmitError };

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
  const result = data as {
    balance?: number;
    energy?: number;
    correctCount?: number;
    reward?: number;
    correctFlags?: unknown;
  };

  // Read the round's correct answers back AFTER settling, so the result screen
  // can show which option was right on the ones the player missed. Safe at this
  // point and only at this point: settle_sign_speed_round has already flipped
  // the session to used, so these can no longer influence a score. They are
  // never read on the start path (see drawSignSpeedQuestions, which selects the
  // options but never the answer key).
  //
  // Read separately rather than added to the RPC's return so this needs no new
  // migration — migrations here are applied by hand and already lag the code.
  let correctIndices: number[] = [];
  const { data: sessionRow } = await createAdminClient()
    .from('sign_speed_sessions')
    .select('correct_indices')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .maybeSingle<{ correct_indices: number[] | null }>();
  if (Array.isArray(sessionRow?.correct_indices)) {
    correctIndices = sessionRow.correct_indices.map((n) => Number(n));
  }

  // correctFlags is only present once 0088 is applied — fail safe (not
  // throw) against a DB that's still only on 0071, since migrations here are
  // applied by hand and may lag the code.
  const correctFlags =
    Array.isArray(result.correctFlags) &&
    result.correctFlags.length === QUESTIONS_PER_ROUND &&
    result.correctFlags.every((f) => typeof f === 'boolean')
      ? (result.correctFlags as boolean[])
      : Array(QUESTIONS_PER_ROUND).fill(false);

  return {
    ok: true,
    correctCount: Number(result.correctCount ?? 0),
    correctFlags,
    correctIndices,
    reward: Number(result.reward ?? 0),
    energy: Number(result.energy ?? 0),
    balance: Number(result.balance ?? 0),
  };
}
