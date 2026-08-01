import 'server-only';
import { randomInt } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { isMissingRelationError } from '@/lib/supabase/missingRelation';
import { getSignPool, type SignPoolEntry } from '@/lib/coins/signPool';
import { NISAN_TAPMACASI_LABELS } from '@/lib/coins/nisanTapmacasiLabels';
import { GAME_DAILY_ENERGY_KEY, DEFAULT_GAME_DAILY_ENERGY } from '@/lib/coins/games';
import { getEffectiveEnergyGrant } from '@/lib/garage/perks';
import { logError } from '@/lib/logging/logError';

// "Nişan Tapmacası" (road sign riddle) — the fourth games-section mini-game,
// an exact architectural mirror of "Nişan Sürəti" (lib/coins/signSpeed.ts).
// One round = 10 questions, each a BLURRED photo of a road sign + a
// hand-written "İpucu" hint + a 2x2 grid of four TEXT option labels.
//
// CRITICAL DESIGN DECISION: the options are TEXT LABELS (short official sign
// names), NOT the actual sign artwork. Showing unblurred sign images as the
// options would turn the game into trivial visual shape-matching — the answer
// would be the image that looks like the photo, the hint would be pointless,
// and the correct option would be given away by the very picture meant to be
// the question. The player must reason from the blurred shape + the hint.
//
// SERVER-AUTHORITATIVE, same posture as sign speed: the server picks the
// 10-question set + correct answers at round-start (from the curated
// nisan_tapmacasi_questions rows + the live sign pool for images) and never
// sends the correct index to the client; grading happens server-side against
// the stored answers. Energy is spent ONCE per round-start (not per question,
// not at settle) — see the migration's top comment for why.
//
// CURRENCY: the per-correct reward pays ENERGY since
// 0094_two_currency_economy.sql (via credit_energy in the settle RPC). Never
// move this payout back to coins.
//
// IMAGE-COVERAGE FILTER: a curated question row is UNUSABLE without a live
// sign image, because the blurred image IS the question. Round-start therefore
// filters the curated rows down to those whose code has a truthy imageUrl in
// the current sign pool, and refuses to build a round below
// MIN_QUESTION_COUNT such rows.

// ---------------------------------------------------------------------------
// Config — app_settings with TS-side defaults (house convention, no seed rows).
// The daily energy GRANT amount is intentionally reused from games.ts
// (GAME_DAILY_ENERGY_KEY) — one shared energy pool for the whole games
// section, not a second one for this game.
// ---------------------------------------------------------------------------
const NISAN_TAPMACASI_PER_CORRECT_REWARD_KEY = 'nisan_tapmacasi_per_correct_reward';
const DEFAULT_NISAN_TAPMACASI_PER_CORRECT_REWARD = 1;

const NISAN_TAPMACASI_DAILY_REWARD_CAP_KEY = 'nisan_tapmacasi_daily_reward_cap';
const DEFAULT_NISAN_TAPMACASI_DAILY_REWARD_CAP = 20;

const NISAN_TAPMACASI_ENERGY_COST_KEY = 'nisan_tapmacasi_energy_cost';
const DEFAULT_NISAN_TAPMACASI_ENERGY_COST = 1;

const NISAN_TAPMACASI_SESSION_TTL_SECONDS_KEY = 'nisan_tapmacasi_session_ttl_seconds';
const DEFAULT_NISAN_TAPMACASI_SESSION_TTL_SECONDS = 180;

export {
  NISAN_TAPMACASI_PER_CORRECT_REWARD_KEY,
  DEFAULT_NISAN_TAPMACASI_PER_CORRECT_REWARD,
  NISAN_TAPMACASI_DAILY_REWARD_CAP_KEY,
  DEFAULT_NISAN_TAPMACASI_DAILY_REWARD_CAP,
  NISAN_TAPMACASI_ENERGY_COST_KEY,
  DEFAULT_NISAN_TAPMACASI_ENERGY_COST,
  NISAN_TAPMACASI_SESSION_TTL_SECONDS_KEY,
  DEFAULT_NISAN_TAPMACASI_SESSION_TTL_SECONDS,
};

const QUESTIONS_PER_ROUND = 10;
const OPTIONS_PER_QUESTION = 4;
// Need at least 12 curated rows WITH a live sign image to sample 10 from —
// below that the 3 wrong answers per question start to collide with correct
// answers, and a game that can't vary is not worth playing.
const MIN_QUESTION_COUNT = 12;

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

// Fisher-Yates using crypto randomInt — never Math.random() for anything that
// determines a reward-bearing outcome (mirrors signSpeed.ts / wheel.ts).
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

export interface NisanTapmacasiQuestion {
  code: string;
  hint: string;
  imageUrl: string;
  options: string[];
}

export type NisanTapmacasiStartError = 'no_energy' | 'unavailable' | 'pool_too_small' | 'error';

export type NisanTapmacasiStartResult =
  | { ok: true; sessionId: string; questions: NisanTapmacasiQuestion[] }
  | { ok: false; error: NisanTapmacasiStartError };

export async function startNisanTapmacasiRound(userId: string): Promise<NisanTapmacasiStartResult> {
  const { data: curated } = await createAdminClient()
    .from('nisan_tapmacasi_questions')
    .select('code, label, hint')
    .eq('active', true);

  if (!Array.isArray(curated) || curated.length === 0) {
    return { ok: false, error: 'pool_too_small' };
  }

  const pool = await getSignPool();
  // Pool codes carry the "Kod " prefix ("Kod 2.5"); the curated question codes
  // are bare digits ("2.5"), so strip the prefix to make the two match.
  const poolByCode = new Map<string, SignPoolEntry>();
  for (const entry of pool) {
    poolByCode.set(entry.code.replace(/^Kod\s+/i, ''), entry);
  }

  // Image-coverage filter: a curated question is unusable without a live sign
  // image, because the blurred image IS the question. Refuse the round if too
  // few curated+imaged rows survive.
  const filtered = curated.filter((row) => {
    const poolEntry = poolByCode.get(row.code);
    return Boolean(poolEntry && poolEntry.imageUrl);
  });

  if (filtered.length < MIN_QUESTION_COUNT) {
    return { ok: false, error: 'pool_too_small' };
  }

  const chosen = sampleWithoutReplacement(filtered, QUESTIONS_PER_ROUND);

  const questionCodes: string[] = [];
  const correctIndices: number[] = [];
  const questions: NisanTapmacasiQuestion[] = [];

  for (const row of chosen) {
    const correctLabel = row.label;
    // Case-insensitive exclusion handles the duplicate-label case ('Piyada
    // keçidi' exists for 1.20 AND 5.16.1) — within one question the correct
    // label must never appear as its own distractor.
    const distractorCandidates = NISAN_TAPMACASI_LABELS.filter(
      (l) => l.toLowerCase() !== correctLabel.toLowerCase()
    );
    const distractors = sampleWithoutReplacement(distractorCandidates, OPTIONS_PER_QUESTION - 1);
    const optionEntries = shuffle([correctLabel, ...distractors]);
    const correctIndex = optionEntries.findIndex((o) => o === correctLabel);

    questionCodes.push(row.code);
    correctIndices.push(correctIndex);
    questions.push({
      code: row.code,
      hint: row.hint,
      imageUrl: poolByCode.get(row.code)!.imageUrl!,
      options: optionEntries,
    });
  }

  const [baseDailyEnergyGrant, energyCost] = await Promise.all([
    readNumericSetting(GAME_DAILY_ENERGY_KEY, DEFAULT_GAME_DAILY_ENERGY),
    readNumericSetting(NISAN_TAPMACASI_ENERGY_COST_KEY, DEFAULT_NISAN_TAPMACASI_ENERGY_COST, {
      allowZero: true,
    }),
  ]);
  const dailyEnergyGrant = await getEffectiveEnergyGrant(userId, baseDailyEnergyGrant);

  const { data, error } = await createAdminClient().rpc('start_nisan_tapmacasi_round', {
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
    void logError('coins.nisanTapmacasi.startRound', error, { userId });
    console.error('[coins] start_nisan_tapmacasi_round RPC failed:', {
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

export type NisanTapmacasiSubmitError =
  | 'session_not_found'
  | 'already_used'
  | 'session_expired'
  | 'invalid_answers'
  | 'unavailable'
  | 'error';

export type NisanTapmacasiSubmitResult =
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
  | { ok: false; error: NisanTapmacasiSubmitError };

export async function submitNisanTapmacasiRound(
  userId: string,
  sessionId: string,
  answers: number[]
): Promise<NisanTapmacasiSubmitResult> {
  if (
    !Array.isArray(answers) ||
    answers.length !== QUESTIONS_PER_ROUND ||
    !answers.every((a) => Number.isInteger(a) && a >= 0 && a < OPTIONS_PER_QUESTION)
  ) {
    return { ok: false, error: 'invalid_answers' };
  }

  const [perCorrectReward, dailyRewardCap, ttlSeconds] = await Promise.all([
    readNumericSetting(NISAN_TAPMACASI_PER_CORRECT_REWARD_KEY, DEFAULT_NISAN_TAPMACASI_PER_CORRECT_REWARD),
    readNumericSetting(NISAN_TAPMACASI_DAILY_REWARD_CAP_KEY, DEFAULT_NISAN_TAPMACASI_DAILY_REWARD_CAP),
    readNumericSetting(NISAN_TAPMACASI_SESSION_TTL_SECONDS_KEY, DEFAULT_NISAN_TAPMACASI_SESSION_TTL_SECONDS),
  ]);

  const { data, error } = await createAdminClient().rpc('settle_nisan_tapmacasi_round', {
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
    void logError('coins.nisanTapmacasi.settleRound', error, { userId });
    console.error('[coins] settle_nisan_tapmacasi_round RPC failed:', {
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
  // point and only at this point: settle_nisan_tapmacasi_round has already
  // flipped the session to used, so these can no longer influence a score.
  // They are never read on the start path (see startNisanTapmacasiRound, which
  // builds the options but never sends the answer key).
  //
  // Read separately rather than added to the RPC's return so this needs no new
  // migration — migrations here are applied by hand and already lag the code.
  let correctIndices: number[] = [];
  const { data: sessionRow } = await createAdminClient()
    .from('nisan_tapmacasi_sessions')
    .select('correct_indices')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .maybeSingle<{ correct_indices: number[] | null }>();
  if (Array.isArray(sessionRow?.correct_indices)) {
    correctIndices = sessionRow.correct_indices.map((n) => Number(n));
  }

  // correctFlags is only present once 0099 is applied — fail safe (not throw)
  // against a DB that's still on a pre-0099 state, since migrations here are
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
