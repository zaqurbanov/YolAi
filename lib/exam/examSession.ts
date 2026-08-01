import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { isMissingRelationError } from '@/lib/supabase/missingRelation';
import { logError } from '@/lib/logging/logError';
import { drawExamQuestions, type ExamQuestion } from '@/lib/exam/examPool';
import { EXAM_COIN_PRICE_KEY, DEFAULT_EXAM_COIN_PRICE } from '@/lib/exam/examPricing';
import { maybeApplyFine } from '@/lib/garage/fines';

// "Sınaq İmtahanı" (real exam simulator) — SERVER-AUTHORITATIVE, same posture
// as sign speed / XO: the server picks the 10-question set + correct answers
// at start and never sends the correct index to the client; grading happens
// server-side against the stored answers. Unlike sign speed / XO, this pays NO
// reward on completion — pure sink, not a new earning path.
//
// ENTRY COSTS COINS ONLY. 0094_two_currency_economy.sql had briefly made this
// energy-funded; that was reversed on the owner's call — the exam is a
// high-value feature and the premium currency is the right price tag, and coin
// needed a third sink beyond chat and the garage. The energy path is gone
// end-to-end (TS, server action, RPC signature); there is no dual "coin OR
// energy" choice either.
//
// This does NOT breach 0094's energy-never-becomes-coin invariant: the
// invariant forbids energy being spent on something that PAYS coins, and this
// pays nothing at all — settle_exam_session credits neither currency. Money
// flows one way only.

// ---------------------------------------------------------------------------
// Config — app_settings with TS-side defaults (house convention, no seed
// rows). The entry price itself lives in examPricing.ts, shared with the
// display path and the admin panel so there is exactly one key and one
// default.
// ---------------------------------------------------------------------------
const EXAM_SESSION_TTL_SECONDS_KEY = 'exam_session_ttl_seconds';
const DEFAULT_EXAM_SESSION_TTL_SECONDS = 1200;

export { EXAM_SESSION_TTL_SECONDS_KEY, DEFAULT_EXAM_SESSION_TTL_SECONDS };

const QUESTIONS_PER_EXAM = 10;
const OPTIONS_PER_QUESTION = 4;

// `allowZero` exists because 0 means two different things depending on the
// key: for a PRICE it is a real admin choice (free exam), for a TTL/reward it
// is an unreadable value that must fall back. Same split as
// getGlobalDailyCoinGrant() in lib/chat/coins.ts.
async function readNumericSetting(
  key: string,
  fallback: number,
  allowZero = false
): Promise<number> {
  const { data, error } = await createAdminClient()
    .from('app_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();

  if (error || !data) return fallback;

  const value = typeof data.value === 'number' ? data.value : Number(data.value);
  if (!Number.isFinite(value)) return fallback;
  if (allowZero ? value < 0 : value <= 0) return fallback;
  return value;
}

export type ExamStartError = 'insufficient_coins' | 'pool_too_small' | 'unavailable' | 'error';

export type ExamStartResult =
  | {
      ok: true;
      sessionId: string;
      questions: ExamQuestion[];
      /** New COIN balance after the entry cost was debited. */
      balance: number;
      /** Energy balance — never touched by the exam, returned for the shared meter. */
      energy: number;
    }
  | { ok: false; error: ExamStartError };

export async function startExamSession(userId: string): Promise<ExamStartResult> {
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

  // Price is resolved SERVER-SIDE and never accepted from the caller — this
  // function is reachable from a server action, which is a plain POST.
  const coinPrice = await readNumericSetting(EXAM_COIN_PRICE_KEY, DEFAULT_EXAM_COIN_PRICE, true);

  // No daily-grant argument any more: the top-up is automatic on read paths
  // (apply_daily_grant), so a spend path must not re-trigger it.
  const { data, error } = await createAdminClient().rpc('start_exam_session', {
    p_user_id: userId,
    p_question_ids: questionIds,
    p_correct_indices: correctIndices,
    p_coin_price: Math.round(coinPrice),
  });

  if (error) {
    const message = error.message ?? '';
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

export type ExamAnswerError =
  | 'session_not_found'
  | 'already_used'
  | 'session_expired'
  | 'invalid_answer'
  | 'unavailable'
  | 'error';

export type ExamAnswerResult =
  | { ok: true; correct: boolean; locked: number; wasAlreadyAnswered: boolean }
  | { ok: false; error: ExamAnswerError };

/**
 * Records ONE answer and returns only whether it was right — the correct index
 * itself never leaves the database (0091). The first answer for a question is
 * final: a second call returns the original verdict and ignores the new value,
 * which is what stops the boolean verdict from becoming a brute-forceable
 * answer oracle. See 0091_exam_per_question_answers.sql's header.
 */
export async function answerExamQuestion(
  userId: string,
  sessionId: string,
  index: number,
  answer: number
): Promise<ExamAnswerResult> {
  if (!Number.isInteger(index) || index < 0 || index >= QUESTIONS_PER_EXAM) {
    return { ok: false, error: 'invalid_answer' };
  }
  if (!Number.isInteger(answer) || answer < 0 || answer >= OPTIONS_PER_QUESTION) {
    return { ok: false, error: 'invalid_answer' };
  }

  const ttlSeconds = await readNumericSetting(
    EXAM_SESSION_TTL_SECONDS_KEY,
    DEFAULT_EXAM_SESSION_TTL_SECONDS
  );

  const { data, error } = await createAdminClient().rpc('answer_exam_question', {
    p_user_id: userId,
    p_session_id: sessionId,
    p_index: index,
    p_answer: answer,
    p_session_ttl_seconds: Math.round(ttlSeconds),
  });

  if (error) {
    const message = error.message ?? '';
    if (message.includes('session_not_found')) return { ok: false, error: 'session_not_found' };
    if (message.includes('already_used')) return { ok: false, error: 'already_used' };
    if (message.includes('session_expired')) return { ok: false, error: 'session_expired' };
    if (message.includes('invalid_index') || message.includes('invalid_answer')) {
      return { ok: false, error: 'invalid_answer' };
    }
    if (isMissingRelationError(error)) return { ok: false, error: 'unavailable' };
    void logError('exam.examSession.answer', error, { userId });
    console.error('[exam] answer_exam_question RPC failed:', {
      message: error.message,
      code: error.code,
    });
    return { ok: false, error: 'error' };
  }

  if (typeof data !== 'object' || data === null) return { ok: false, error: 'error' };
  const result = data as { correct?: boolean; locked?: number; wasAlreadyAnswered?: boolean };
  return {
    ok: true,
    correct: Boolean(result.correct),
    locked: Number(result.locked ?? answer),
    wasAlreadyAnswered: Boolean(result.wasAlreadyAnswered),
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
