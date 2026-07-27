import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { isMissingRelationError } from '@/lib/supabase/missingRelation';
import { logError } from '@/lib/logging/logError';
import { drawExamQuestions, type ExamQuestion } from '@/lib/exam/examPool';
import { GAME_DAILY_ENERGY_KEY, DEFAULT_GAME_DAILY_ENERGY } from '@/lib/coins/games';
import { getEffectiveEnergyGrant } from '@/lib/garage/perks';
import { maybeApplyFine } from '@/lib/garage/fines';

// "Sınaq İmtahanı" (real exam simulator) — SERVER-AUTHORITATIVE, same posture
// as sign speed / XO: the server picks the 10-question set + correct answers
// at start and never sends the correct index to the client; grading happens
// server-side against the stored answers. Entry costs EITHER 100 coins OR 1
// energy (the user's choice) — see lib/coins/games.ts's purchaseEnergy() for
// the closest existing "coin sink" precedent. Unlike sign speed / XO, this
// pays NO reward on completion — pure sink, not a new earning path.

// ---------------------------------------------------------------------------
// Config — app_settings with TS-side defaults (house convention, no seed
// rows). The daily energy GRANT amount is intentionally reused from games.ts
// (GAME_DAILY_ENERGY_KEY) — one shared energy pool for the whole games
// section, not a second one for this feature.
// ---------------------------------------------------------------------------
const EXAM_COIN_PRICE_KEY = 'exam_coin_price';
const DEFAULT_EXAM_COIN_PRICE = 100;

const EXAM_ENERGY_COST_KEY = 'exam_energy_cost';
const DEFAULT_EXAM_ENERGY_COST = 1;

const EXAM_SESSION_TTL_SECONDS_KEY = 'exam_session_ttl_seconds';
const DEFAULT_EXAM_SESSION_TTL_SECONDS = 1200;

export {
  EXAM_COIN_PRICE_KEY,
  DEFAULT_EXAM_COIN_PRICE,
  EXAM_ENERGY_COST_KEY,
  DEFAULT_EXAM_ENERGY_COST,
  EXAM_SESSION_TTL_SECONDS_KEY,
  DEFAULT_EXAM_SESSION_TTL_SECONDS,
};

const QUESTIONS_PER_EXAM = 10;
const OPTIONS_PER_QUESTION = 4;

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

export type ExamPaymentMethod = 'coin' | 'energy';

export type ExamStartError =
  | 'no_energy'
  | 'insufficient_coins'
  | 'pool_too_small'
  | 'unavailable'
  | 'error';

export type ExamStartResult =
  | {
      ok: true;
      sessionId: string;
      questions: ExamQuestion[];
      balance: number;
      energy: number;
    }
  | { ok: false; error: ExamStartError };

export async function startExamSession(
  userId: string,
  paymentMethod: ExamPaymentMethod
): Promise<ExamStartResult> {
  const questions = await drawExamQuestions();
  if (!questions) {
    return { ok: false, error: 'pool_too_small' };
  }

  // Correct indices are read separately and as late/narrow as possible: only
  // this admin-client query ever touches quiz_questions.correct_index, and
  // its result never leaves this function.
  const questionIds = questions.map((q) => q.id);
  const { data: answerRows, error: answerError } = await createAdminClient()
    .from('quiz_questions')
    .select('id, correct_index')
    .in('id', questionIds)
    .returns<{ id: string; correct_index: number }[]>();

  if (answerError) {
    if (isMissingRelationError(answerError)) return { ok: false, error: 'unavailable' };
    void logError('exam.examSession.answerRead', answerError, { userId });
    console.error('[exam] correct_index read failed:', answerError);
    return { ok: false, error: 'error' };
  }

  const byId = new Map((answerRows ?? []).map((row) => [row.id, row.correct_index]));
  const correctIndices = questionIds.map((id) => byId.get(id));
  if (correctIndices.some((idx) => typeof idx !== 'number')) {
    return { ok: false, error: 'error' };
  }

  const [coinPrice, energyCost, baseDailyEnergyGrant] = await Promise.all([
    readNumericSetting(EXAM_COIN_PRICE_KEY, DEFAULT_EXAM_COIN_PRICE),
    readNumericSetting(EXAM_ENERGY_COST_KEY, DEFAULT_EXAM_ENERGY_COST),
    readNumericSetting(GAME_DAILY_ENERGY_KEY, DEFAULT_GAME_DAILY_ENERGY),
  ]);
  const dailyEnergyGrant = await getEffectiveEnergyGrant(userId, baseDailyEnergyGrant);

  const { data, error } = await createAdminClient().rpc('start_exam_session', {
    p_user_id: userId,
    p_question_ids: questionIds,
    p_correct_indices: correctIndices,
    p_payment_method: paymentMethod,
    p_coin_price: coinPrice,
    p_energy_cost: Math.round(energyCost),
    p_daily_energy_grant: Math.round(dailyEnergyGrant),
  });

  if (error) {
    const message = error.message ?? '';
    if (message.includes('no_energy')) return { ok: false, error: 'no_energy' };
    if (message.includes('insufficient_coins')) return { ok: false, error: 'insufficient_coins' };
    if (isMissingRelationError(error)) return { ok: false, error: 'unavailable' };
    void logError('exam.examSession.start', error, { userId });
    console.error('[exam] start_exam_session RPC failed:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return { ok: false, error: 'error' };
  }

  if (typeof data !== 'object' || data === null) return { ok: false, error: 'error' };
  const result = data as { sessionId?: string; balance?: number; energy?: number };
  if (typeof result.sessionId !== 'string') return { ok: false, error: 'error' };

  return {
    ok: true,
    sessionId: result.sessionId,
    questions,
    balance: Number(result.balance ?? 0),
    energy: Number(result.energy ?? 0),
  };
}

export type ExamSubmitError =
  | 'session_not_found'
  | 'already_used'
  | 'session_expired'
  | 'invalid_answers'
  | 'unavailable'
  | 'error';

export type ExamSubmitResult =
  | { ok: true; score: number; total: number }
  | { ok: false; error: ExamSubmitError };

export async function submitExamSession(
  userId: string,
  sessionId: string,
  answers: number[]
): Promise<ExamSubmitResult> {
  if (
    !Array.isArray(answers) ||
    answers.length !== QUESTIONS_PER_EXAM ||
    !answers.every((a) => Number.isInteger(a) && a >= 0 && a < OPTIONS_PER_QUESTION)
  ) {
    return { ok: false, error: 'invalid_answers' };
  }

  const ttlSeconds = await readNumericSetting(
    EXAM_SESSION_TTL_SECONDS_KEY,
    DEFAULT_EXAM_SESSION_TTL_SECONDS
  );

  const { data, error } = await createAdminClient().rpc('settle_exam_session', {
    p_user_id: userId,
    p_session_id: sessionId,
    p_answers: answers,
    p_session_ttl_seconds: Math.round(ttlSeconds),
  });

  if (error) {
    const message = error.message ?? '';
    if (message.includes('session_not_found')) return { ok: false, error: 'session_not_found' };
    if (message.includes('already_used')) return { ok: false, error: 'already_used' };
    if (message.includes('session_expired')) return { ok: false, error: 'session_expired' };
    if (message.includes('invalid_answers')) return { ok: false, error: 'invalid_answers' };
    if (isMissingRelationError(error)) return { ok: false, error: 'unavailable' };
    void logError('exam.examSession.submit', error, { userId });
    console.error('[exam] settle_exam_session RPC failed:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return { ok: false, error: 'error' };
  }

  if (typeof data !== 'object' || data === null) return { ok: false, error: 'error' };
  const result = data as { score?: number; total?: number };
  const score = Number(result.score ?? 0);
  const total = Number(result.total ?? QUESTIONS_PER_EXAM);

  // Awaited (not fire-and-forget) — see topicTest.ts's recordTopicAttempt for
  // why. No topicId: the exam simulator has no topic granularity to fine
  // against (see lib/garage/fines.ts's drawQuestionPool for the accepted gap
  // this creates on the redemption side).
  await maybeApplyFine(userId, { score, total, source: 'exam' });

  return { ok: true, score, total };
}
