import 'server-only';
import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { isMissingRelationError } from '@/lib/supabase/missingRelation';
import { logError } from '@/lib/logging/logError';

// Virtual Qaraj Mərhələ 4 — "Rəqəmsal Cərimələr və Bərpa İmtahanı" (digital
// fines + redemption exam). See supabase/migrations/0089_car_fines.sql for
// the schema/RPCs this drives and docs/VIRTUAL_QARAJ_ROADMAP.md ("Mərhələ 4")
// for the product framing. Pure status symbol — grants/costs NO coins, ever.
//
// Deliberately does NOT import from lib/quiz/topicTest.ts or lib/exam/*: this
// module is imported BY topicTest.ts (recordTopicAttempt) and examSession.ts
// (submitExamSession), so importing back would create a cycle. Anything this
// file needs from those domains (lesson_attempts rows, quiz_questions) is read
// directly here instead.

const FINE_FAIL_THRESHOLD_PCT_KEY = 'garage_fine_fail_threshold_pct';
const DEFAULT_FINE_FAIL_THRESHOLD_PCT = 50;

const REDEMPTION_DAILY_LIMIT_KEY = 'redemption_exam_daily_limit';
const DEFAULT_REDEMPTION_DAILY_LIMIT = 3;

const REDEMPTION_PASS_THRESHOLD_KEY = 'redemption_exam_pass_threshold';
const DEFAULT_REDEMPTION_PASS_THRESHOLD = 3;

export {
  FINE_FAIL_THRESHOLD_PCT_KEY,
  DEFAULT_FINE_FAIL_THRESHOLD_PCT,
  REDEMPTION_DAILY_LIMIT_KEY,
  DEFAULT_REDEMPTION_DAILY_LIMIT,
  REDEMPTION_PASS_THRESHOLD_KEY,
  DEFAULT_REDEMPTION_PASS_THRESHOLD,
};

const REDEMPTION_QUESTION_COUNT = 3;
const REDEMPTION_WINDOW_SECONDS = 86_400;
const REDEMPTION_TOKEN_TTL_MS = 15 * 60 * 1000;
const REDEMPTION_TOKEN_VERSION = 'v1';
const REDEMPTION_TOKEN_CONTEXT = 'redemption_exam';

// Mirrors lib/garage/perks.ts's readNumericSetting exactly (min: 0 allowed —
// an admin can set the fail threshold to 0 to disable fining without deleting
// the row), except the two redemption-exam knobs, which must be >= 1.
async function readNumericSetting(key: string, fallback: number, allowZero: boolean): Promise<number> {
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

// ---------------------------------------------------------------------------
// Fine status (read-only display path)
// ---------------------------------------------------------------------------

export interface FineStatus {
  isFined: boolean;
  finedAt: string | null;
  fineReason: string | null;
}

const NOT_FINED: FineStatus = { isFined: false, finedAt: null, fineReason: null };

// Read-only display path — fails OPEN to "not fined", same posture as
// getUserGarage/getActiveGaragePerk. A user with no user_garage row (never
// purchased a car) has nothing to be fined.
export async function getFineStatus(userId: string): Promise<FineStatus> {
  const { data, error } = await createAdminClient()
    .from('user_garage')
    .select('is_fined, fined_at, fine_reason')
    .eq('user_id', userId)
    .maybeSingle();

  if (error && !isMissingRelationError(error)) {
    console.error('[garage/fines] getFineStatus failed:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
  }

  if (!data) return NOT_FINED;

  return {
    isFined: Boolean(data.is_fined),
    finedAt: (data.fined_at as string | null) ?? null,
    fineReason: (data.fine_reason as string | null) ?? null,
  };
}

// ---------------------------------------------------------------------------
// Fine trigger — called from the two existing submit paths
// (lib/quiz/topicTest.ts's recordTopicAttempt, lib/exam/examSession.ts's
// submitExamSession) AFTER their own RPC already succeeded. Must never throw
// into its caller and must never block/slow the response the user is waiting
// on more than one extra RPC round trip — a fine-check failure degrades to
// "no fine applied", not to a broken submit.
// ---------------------------------------------------------------------------

export type FineSource = 'topic_test' | 'exam';

export interface MaybeApplyFineInput {
  score: number;
  total: number;
  source: FineSource;
  topicId?: string;
}

export async function maybeApplyFine(userId: string, input: MaybeApplyFineInput): Promise<void> {
  try {
    if (input.total <= 0) return;

    const thresholdPct = await readNumericSetting(
      FINE_FAIL_THRESHOLD_PCT_KEY,
      DEFAULT_FINE_FAIL_THRESHOLD_PCT,
      true
    );
    if (thresholdPct <= 0) return;

    const scorePct = (input.score / input.total) * 100;
    if (scorePct >= thresholdPct) return;

    const reason = input.source === 'topic_test' && input.topicId
      ? `topic_test:${input.topicId}`
      : input.source;

    const { error } = await createAdminClient().rpc('apply_car_fine', {
      p_user_id: userId,
      p_reason: reason,
    });

    if (error && !isMissingRelationError(error)) {
      void logError('garage.fines.maybeApplyFine', error, { userId, details: { source: input.source, topicId: input.topicId } });
      console.error('[garage/fines] apply_car_fine RPC failed:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
    }
  } catch (error) {
    void logError('garage.fines.maybeApplyFine.unexpected', error, { userId });
    console.error('[garage/fines] maybeApplyFine threw unexpectedly:', error);
  }
}

// ---------------------------------------------------------------------------
// Redemption exam — draw
// ---------------------------------------------------------------------------

export interface RedemptionQuestion {
  id: string;
  question: string;
  options: string[];
}

export type DrawRedemptionExamError = 'rate_limited' | 'not_fined' | 'no_questions' | 'error';

export type DrawRedemptionExamResult =
  | { ok: true; token: string; questions: RedemptionQuestion[] }
  | { ok: false; error: DrawRedemptionExamError };

interface FailedTopicRow {
  topic_id: string;
}

interface PoolRow {
  id: string;
  question: string;
  options: unknown;
}

function shuffle<T>(items: T[]): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function parsePoolRows(rows: PoolRow[] | null): RedemptionQuestion[] {
  return (rows ?? []).flatMap((row) => {
    if (!Array.isArray(row.options) || row.options.length !== 4) return [];
    return [{ id: row.id, question: row.question, options: row.options.map((o) => String(o)) }];
  });
}

// Draws from the user's most recently FAILED topics (lesson_attempts.passed =
// false), most-recent-first, up to 3 distinct topic_ids. This is a KNOWN,
// ACCEPTED gap: a fine raised by the exam simulator (source: 'exam') has no
// topic granularity to redeem against (settle_exam_session stores only
// score/total, not per-question data — see lib/exam/examSession.ts's header
// comment), so that case — and any case where the user has no failed-topic
// history at all — falls back to a random 3-question draw from the FULL
// published pool, same shape as lib/exam/examPool.ts's drawExamQuestions.
// Not inventing a new taxonomy (e.g. per-question wrong-answer logging) to
// close this gap was an explicit instruction for this task.
async function drawQuestionPool(userId: string): Promise<RedemptionQuestion[] | null> {
  const admin = createAdminClient();

  const { data: failedRows, error: failedError } = await admin
    .from('lesson_attempts')
    .select('topic_id')
    .eq('user_id', userId)
    .eq('passed', false)
    .order('created_at', { ascending: false })
    .limit(20)
    .returns<FailedTopicRow[]>();

  if (failedError && !isMissingRelationError(failedError)) {
    void logError('garage.fines.drawQuestionPool.failedTopics', failedError, { userId });
    console.error('[garage/fines] failed-topic read failed:', failedError);
  }

  const topicIds: string[] = [];
  for (const row of failedRows ?? []) {
    if (!topicIds.includes(row.topic_id)) topicIds.push(row.topic_id);
    if (topicIds.length >= 3) break;
  }

  if (topicIds.length > 0) {
    const { data, error } = await admin
      .from('quiz_questions')
      .select('id, question, options')
      .in('topic_id', topicIds)
      .eq('status', 'published')
      .returns<PoolRow[]>();

    if (error && !isMissingRelationError(error)) {
      void logError('garage.fines.drawQuestionPool.topicPool', error, { userId });
      console.error('[garage/fines] topic-scoped pool read failed:', error);
    }

    const pool = parsePoolRows(data);
    if (pool.length >= REDEMPTION_QUESTION_COUNT) return pool;
    // Falls through to the full-pool fallback below if the failed topics
    // don't have enough published questions between them.
  }

  const { data: fullData, error: fullError } = await admin
    .from('quiz_questions')
    .select('id, question, options')
    .eq('status', 'published')
    .returns<PoolRow[]>();

  if (fullError) {
    if (isMissingRelationError(fullError)) return null;
    void logError('garage.fines.drawQuestionPool.fullPool', fullError, { userId });
    console.error('[garage/fines] full pool read failed:', fullError);
    return null;
  }

  return parsePoolRows(fullData);
}

function canonicalIds(ids: string[]): string {
  return [...ids].sort().join(',');
}

function sign(userId: string, ids: string[], issuedAt: number): string | null {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    void logError('garage.fines.signMissingSecret', 'SUPABASE_SERVICE_ROLE_KEY missing; cannot sign a draw', { userId });
    console.error('[garage/fines] SUPABASE_SERVICE_ROLE_KEY missing; cannot sign a draw');
    return null;
  }
  return createHmac('sha256', secret)
    .update(`${REDEMPTION_TOKEN_VERSION}|${REDEMPTION_TOKEN_CONTEXT}|${userId}|${canonicalIds(ids)}|${issuedAt}`)
    .digest('hex');
}

function issueToken(userId: string, ids: string[]): string | null {
  const issuedAt = Date.now();
  const signature = sign(userId, ids, issuedAt);
  if (!signature) return null;
  return `${REDEMPTION_TOKEN_VERSION}.${issuedAt}.${signature}`;
}

type TokenCheck = 'ok' | 'invalid' | 'expired';

function verifyToken(token: unknown, userId: string, ids: string[]): TokenCheck {
  if (typeof token !== 'string') return 'invalid';

  const parts = token.split('.');
  if (parts.length !== 3) return 'invalid';
  const [version, issuedAtRaw, signature] = parts;
  if (version !== REDEMPTION_TOKEN_VERSION) return 'invalid';

  const issuedAt = Number(issuedAtRaw);
  if (!Number.isFinite(issuedAt)) return 'invalid';

  const expected = sign(userId, ids, issuedAt);
  if (!expected) return 'invalid';

  const a = Buffer.from(signature, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length || a.length === 0) return 'invalid';
  if (!timingSafeEqual(a, b)) return 'invalid';

  if (Date.now() - issuedAt > REDEMPTION_TOKEN_TTL_MS || issuedAt > Date.now() + 60_000) {
    return 'expired';
  }

  return 'ok';
}

export async function drawRedemptionExam(userId: string): Promise<DrawRedemptionExamResult> {
  const dailyLimit = await readNumericSetting(REDEMPTION_DAILY_LIMIT_KEY, DEFAULT_REDEMPTION_DAILY_LIMIT, false);

  const { data: allowed, error: rateLimitError } = await createAdminClient().rpc('try_record_redemption_attempt', {
    p_user_id: userId,
    p_window_seconds: REDEMPTION_WINDOW_SECONDS,
    p_limit: Math.round(dailyLimit),
  });

  if (rateLimitError) {
    if (isMissingRelationError(rateLimitError)) return { ok: false, error: 'error' };
    void logError('garage.fines.drawRedemptionExam.rateLimit', rateLimitError, { userId });
    console.error('[garage/fines] try_record_redemption_attempt RPC failed:', rateLimitError);
    return { ok: false, error: 'error' };
  }

  if (allowed !== true) return { ok: false, error: 'rate_limited' };

  const pool = await drawQuestionPool(userId);
  if (pool === null) return { ok: false, error: 'error' };
  if (pool.length < REDEMPTION_QUESTION_COUNT) return { ok: false, error: 'no_questions' };

  const questions = shuffle(pool).slice(0, REDEMPTION_QUESTION_COUNT);
  const token = issueToken(userId, questions.map((q) => q.id));
  if (!token) return { ok: false, error: 'error' };

  return { ok: true, token, questions };
}

// ---------------------------------------------------------------------------
// Redemption exam — submit
// ---------------------------------------------------------------------------

export interface RedemptionAnswerInput {
  questionId: string;
  /** 0-3, or -1 for "left unanswered" (scored as wrong). */
  selectedIndex: number;
}

export type SubmitRedemptionExamError = 'invalid_token' | 'expired_token' | 'invalid_answers' | 'error';

export type SubmitRedemptionExamResult =
  | { ok: true; score: number; total: number; cleared: boolean }
  | { ok: false; error: SubmitRedemptionExamError };

interface AnswerKeyRow {
  id: string;
  correct_index: number;
}

export async function submitRedemptionExam(
  userId: string,
  token: string,
  answers: RedemptionAnswerInput[]
): Promise<SubmitRedemptionExamResult> {
  if (
    !Array.isArray(answers) ||
    answers.length !== REDEMPTION_QUESTION_COUNT ||
    !answers.every(
      (a) =>
        typeof a.questionId === 'string' &&
        a.questionId.length > 0 &&
        Number.isInteger(a.selectedIndex) &&
        a.selectedIndex >= -1 &&
        a.selectedIndex <= 3
    )
  ) {
    return { ok: false, error: 'invalid_answers' };
  }

  const ids = answers.map((a) => a.questionId);
  const check = verifyToken(token, userId, ids);
  if (check === 'invalid') return { ok: false, error: 'invalid_token' };
  if (check === 'expired') return { ok: false, error: 'expired_token' };

  const { data, error } = await createAdminClient()
    .from('quiz_questions')
    .select('id, correct_index')
    .eq('status', 'published')
    .in('id', ids)
    .returns<AnswerKeyRow[]>();

  if (error) {
    void logError('garage.fines.submitRedemptionExam.answerKey', error, { userId });
    console.error('[garage/fines] answer key read failed:', error);
    return { ok: false, error: 'error' };
  }
  if (!data || data.length !== ids.length) return { ok: false, error: 'invalid_answers' };

  const keyById = new Map(data.map((row) => [row.id, row.correct_index]));

  let score = 0;
  for (const answer of answers) {
    const correctIndex = keyById.get(answer.questionId);
    if (correctIndex === undefined) return { ok: false, error: 'invalid_answers' };
    if (answer.selectedIndex === correctIndex) score += 1;
  }

  const passThreshold = await readNumericSetting(
    REDEMPTION_PASS_THRESHOLD_KEY,
    DEFAULT_REDEMPTION_PASS_THRESHOLD,
    false
  );
  const cleared = score >= passThreshold;

  if (cleared) {
    const { error: clearError } = await createAdminClient().rpc('clear_car_fine', { p_user_id: userId });
    if (clearError && !isMissingRelationError(clearError)) {
      void logError('garage.fines.submitRedemptionExam.clearFine', clearError, { userId });
      console.error('[garage/fines] clear_car_fine RPC failed:', clearError);
      return { ok: false, error: 'error' };
    }
  }

  return { ok: true, score, total: REDEMPTION_QUESTION_COUNT, cleared };
}
