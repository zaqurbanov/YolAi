import 'server-only';
import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isMissingRelationError } from '@/lib/supabase/missingRelation';
import { canAccessCourse, getTopicTestConfig, getLessonRetryCost } from '@/lib/coins/lessonUnlock';
import { isUserAdmin } from '@/lib/auth/isAdmin';
import { getCourseTopics, type TopicSummary } from '@/lib/quiz/lessons';

// Phase 2 of the lessons feature: reading a topic, drawing a topic test,
// scoring it, and recording the attempt. Lives beside lib/quiz/lessons.ts
// rather than inside it because lessons.ts is deliberately a user-scoped
// (RLS-respecting) display-read module with one documented service-role
// exception, while everything here is service-role machinery around a write
// path. Keeping the dependency one-directional (topicTest -> lessons) also
// avoids the import cycle that putting getTopicForReading in lessons.ts would
// create, since the gate below needs getCourseTopics.
//
// NOT ROUTED THROUGH submitLessonAnswer/award_quiz_question_reward, and that
// is not an oversight: user_quiz_answers has unique(user_id, question_id), so
// that RPC allows ONE attempt per question EVER. A topic test redraws from the
// same 15-20 question pool on every attempt, so using it would permanently
// burn the pool on the first attempt and fail on the second. Topic tests are
// scored in memory here and written ONLY via record_lesson_attempt (0060).
//
// GRACEFUL DEGRADATION, same posture as lib/quiz/lessons.ts: 0060 is applied
// by hand, so every read treats "relation missing" as an empty result. The
// spend/write paths still fail CLOSED — a missing relation there means "no
// attempt recorded", never an optimistic success.

// A drawn test stays valid for this long. Long enough for an unhurried
// attempt, short enough that a stockpiled draw isn't a durable asset.
const ATTEMPT_TOKEN_TTL_MS = 45 * 60 * 1000;
const ATTEMPT_TOKEN_VERSION = 'v1';

// Below this many published questions a topic test is not worth selling: with
// 1-2 questions a random guess passes often enough that "passed" stops meaning
// anything, and the next topic unlocks on luck. Refuse instead.
const MIN_TOPIC_POOL_SIZE = 3;

export interface TopicSourceCitation {
  chunkId: string | null;
  articleLabel: string | null;
  pageNumber: number | null;
}

export interface TopicReading {
  id: string;
  courseId: string;
  courseTitle: string;
  title: string;
  orderIndex: number;
  content: string | null;
  sourceCitations: TopicSourceCitation[];
  passed: boolean;
  bestScore: number;
  attempts: number;
  prevTopicId: string | null;
  nextTopicId: string | null;
  /** True once a lesson_attempts row exists for this topic today (UTC). */
  attemptedToday: boolean;
  /** retries_purchased > retries_used on user_topic_progress. */
  hasUnusedRetry: boolean;
  /** !attemptedToday || hasUnusedRetry — the two facts are exposed separately
   *  so the UI can offer the paid retry instead of just saying "come back". */
  canAttemptToday: boolean;
  /** Published questions in this topic's pool. */
  poolSize: number;
  /** How many questions the next attempt will actually ask, or 0 if the pool
   *  is too small to run a test at all. */
  testSize: number;
  /** Correct answers needed for THIS test size (see resolveTestShape). */
  passThreshold: number;
  retryCost: number;
}

export interface DrawnQuestion {
  id: string;
  question: string;
  /** Exactly 4 options, in their stored order — correct_index is positional. */
  options: string[];
}

export interface TopicAnswerInput {
  questionId: string;
  /** 0-3, or -1 for "left unanswered" (scored as wrong). */
  selectedIndex: number;
}

export interface TopicAnswerReview {
  questionId: string;
  selectedIndex: number;
  correctIndex: number;
  explanation: string | null;
}

interface TopicRow {
  id: string;
  course_id: string;
}

interface PoolRow {
  id: string;
  question: string;
  options: unknown;
}

interface AnswerRow {
  id: string;
  correct_index: number;
  explanation: string | null;
}

// "Today" must mean exactly what record_lesson_attempt means by it:
// date_trunc('day', now()) with the database in UTC. A client-supplied date is
// never accepted anywhere in this file — this is the server clock, and the RPC
// re-decides the limit against the DB clock regardless of what this returns.
function utcDayStartIso(): string {
  return `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`;
}

// ---------------------------------------------------------------------------
// Access gate
// ---------------------------------------------------------------------------

export interface AccessibleTopic {
  topicId: string;
  courseId: string;
  /** The ordered published topic list of the enclosing course. */
  topics: TopicSummary[];
  summary: TopicSummary;
}

// THE gate. Every read and every action in Phase 2 runs this before touching
// content, questions or the attempt RPCs, in this order:
//   1. the topic exists and is published (service-role, ids only — no content
//      leaves the database before authorization);
//   2. canAccessCourse() on the topic's OWN course_id, resolved server-side.
//      A client-supplied courseId would let a user read a paid course's topic
//      by naming a free one;
//   3. the sequential unlock rule, derived from getCourseTopics rather than
//      reimplemented, so there is exactly one definition of "unlocked".
// Returns null on any failure, without distinguishing them for the caller —
// "not found" and "not allowed" must look identical to an end user.
export async function resolveAccessibleTopic(
  userId: string,
  topicId: string
): Promise<AccessibleTopic | null> {
  if (typeof topicId !== 'string' || topicId.trim() === '') return null;

  const { data: topicRow, error } = await createAdminClient()
    .from('lesson_topics')
    .select('id, course_id')
    .eq('id', topicId)
    .eq('status', 'published')
    .maybeSingle<TopicRow>();

  if (error) {
    if (!isMissingRelationError(error)) {
      console.error('[quiz/topicTest] topic lookup failed:', error);
    }
    return null;
  }
  if (!topicRow) return null;

  const allowed = await canAccessCourse(userId, topicRow.course_id);
  if (!allowed) return null;

  const topics = await getCourseTopics(topicRow.course_id, userId);
  const summary = topics.find((t) => t.id === topicId);
  if (!summary || !summary.isUnlocked) return null;

  return { topicId, courseId: topicRow.course_id, topics, summary };
}

// ---------------------------------------------------------------------------
// Daily attempt / retry state
// ---------------------------------------------------------------------------

export interface AttemptState {
  attemptedToday: boolean;
  hasUnusedRetry: boolean;
}

// Read errors resolve to { false, false }. That is the fail-closed direction
// for the path that matters: purchaseRetryAction only sells a retry when
// attemptedToday is true, so an unreadable state sells nothing. It is also the
// non-blocking direction for starting a test, which is safe because
// record_lesson_attempt re-evaluates the daily limit under a row lock and is
// the only authority on it.
export async function getAttemptState(userId: string, topicId: string): Promise<AttemptState> {
  const admin = createAdminClient();

  const [{ count, error: attemptsError }, { data: progress, error: progressError }] =
    await Promise.all([
      admin
        .from('lesson_attempts')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('topic_id', topicId)
        .gte('created_at', utcDayStartIso()),
      admin
        .from('user_topic_progress')
        .select('retries_purchased, retries_used')
        .eq('user_id', userId)
        .eq('topic_id', topicId)
        .maybeSingle(),
    ]);

  if (attemptsError && !isMissingRelationError(attemptsError)) {
    console.error('[quiz/topicTest] daily attempt count failed:', attemptsError);
  }
  if (progressError && !isMissingRelationError(progressError)) {
    console.error('[quiz/topicTest] progress read failed:', progressError);
  }

  const purchased = Number(progress?.retries_purchased ?? 0);
  const used = Number(progress?.retries_used ?? 0);

  return {
    attemptedToday: (count ?? 0) > 0,
    hasUnusedRetry: purchased > used,
  };
}

// ---------------------------------------------------------------------------
// Test shape
// ---------------------------------------------------------------------------

export interface TestShape {
  total: number;
  passThreshold: number;
}

// The configured threshold is clamped to questionsPerAttempt by
// getTopicTestConfig, but a topic whose published pool is SMALLER than
// questionsPerAttempt would still be unpassable (8 correct out of a 5-question
// test). So the test size is min(pool, questionsPerAttempt) and the threshold
// is rescaled to keep the same ratio — 8/10 becomes 4/5, not 8/5. Returns null
// when the pool is too small to run a meaningful test at all; callers surface
// that as a distinct status rather than selling an unwinnable one.
export function resolveTestShape(
  poolSize: number,
  config: { questionsPerAttempt: number; passThreshold: number }
): TestShape | null {
  if (poolSize < MIN_TOPIC_POOL_SIZE) return null;

  const total = Math.min(poolSize, config.questionsPerAttempt);
  return { total, passThreshold: resolveThresholdForTotal(total, config) };
}

// Split out so the SUBMIT path can derive the threshold from the number of
// questions actually drawn (which the token pins) rather than re-deriving the
// pool size. Without this, an admin lowering questionsPerAttempt mid-attempt
// would silently score an in-flight test against a shorter test's bar.
export function resolveThresholdForTotal(
  total: number,
  config: { questionsPerAttempt: number; passThreshold: number }
): number {
  const ratio = config.passThreshold / config.questionsPerAttempt;
  return Math.min(total, Math.max(1, Math.round(ratio * total)));
}

// ---------------------------------------------------------------------------
// Draw token (tamper evidence)
// ---------------------------------------------------------------------------
//
// There is no table to persist a draw in and no migration is wanted, so the
// draw is made tamper-EVIDENT instead of tamper-proof: the server signs
// (user, topic, sorted question ids, issued-at) with HMAC-SHA256 and the
// client hands the signature back on submit. Same posture as ad_view_tokens
// (0053/0059) — the client may hold the token, it just cannot forge one.
//
// This is what stops a submit from naming an easier question set than the one
// drawn (or a 1-question set), which is the only way scoring could be gamed
// given correct_index never leaves the server.
//
// Keyed off SUPABASE_SERVICE_ROLE_KEY rather than a new env var: it is already
// required for every server path here, is never sent to the client, and
// rotating it invalidates outstanding draws, which is harmless at a 45-minute
// TTL.
//
// Deliberately NOT single-use — there is nowhere to record consumption without
// a table. Replaying a token means submitting a second attempt for the same
// topic, which record_lesson_attempt already rejects with 'daily_limit_reached'
// unless a retry was actually paid for.

function canonicalIds(questionIds: string[]): string {
  return [...questionIds].sort().join(',');
}

function sign(userId: string, topicId: string, questionIds: string[], issuedAt: number): string | null {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    console.error('[quiz/topicTest] SUPABASE_SERVICE_ROLE_KEY missing; cannot sign a draw');
    return null;
  }

  return createHmac('sha256', secret)
    .update(
      `${ATTEMPT_TOKEN_VERSION}|${userId}|${topicId}|${canonicalIds(questionIds)}|${issuedAt}`
    )
    .digest('hex');
}

export function issueAttemptToken(
  userId: string,
  topicId: string,
  questionIds: string[]
): string | null {
  const issuedAt = Date.now();
  const signature = sign(userId, topicId, questionIds, issuedAt);
  if (!signature) return null;
  return `${ATTEMPT_TOKEN_VERSION}.${issuedAt}.${signature}`;
}

export type AttemptTokenCheck = 'ok' | 'invalid' | 'expired';

export function verifyAttemptToken(
  token: unknown,
  userId: string,
  topicId: string,
  questionIds: string[]
): AttemptTokenCheck {
  if (typeof token !== 'string') return 'invalid';

  const parts = token.split('.');
  if (parts.length !== 3) return 'invalid';
  const [version, issuedAtRaw, signature] = parts;
  if (version !== ATTEMPT_TOKEN_VERSION) return 'invalid';

  const issuedAt = Number(issuedAtRaw);
  if (!Number.isFinite(issuedAt)) return 'invalid';

  const expected = sign(userId, topicId, questionIds, issuedAt);
  if (!expected) return 'invalid';

  const a = Buffer.from(signature, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length || a.length === 0) return 'invalid';
  if (!timingSafeEqual(a, b)) return 'invalid';

  // Expiry is checked only after the signature verifies, so an unsigned token
  // never gets a different answer than a forged one.
  if (Date.now() - issuedAt > ATTEMPT_TOKEN_TTL_MS || issuedAt > Date.now() + 60_000) {
    return 'expired';
  }

  return 'ok';
}

// ---------------------------------------------------------------------------
// Question pool
// ---------------------------------------------------------------------------

// Pools are 15-20 rows per topic, so reading the whole pool and sampling in
// process is one round trip and cheaper than any SQL-side random sampling.
// correct_index and explanation are NOT selected here — they are looked up
// again at submit time, so they cannot leak through this path even by mistake.
async function readPool(topicId: string): Promise<DrawnQuestion[] | null> {
  const { data, error } = await createAdminClient()
    .from('quiz_questions')
    .select('id, question, options')
    .eq('topic_id', topicId)
    .eq('status', 'published')
    .returns<PoolRow[]>();

  if (error) {
    if (!isMissingRelationError(error)) {
      console.error('[quiz/topicTest] pool read failed:', error);
    }
    return null;
  }

  // A malformed row (options not an array of 4) is dropped rather than
  // rendered as a broken question; it simply shrinks the effective pool.
  return (data ?? []).flatMap((row) => {
    if (!Array.isArray(row.options) || row.options.length !== 4) return [];
    return [
      {
        id: row.id,
        question: row.question,
        options: row.options.map((option) => String(option)),
      },
    ];
  });
}

export async function getTopicPoolSize(topicId: string): Promise<number> {
  const pool = await readPool(topicId);
  return pool?.length ?? 0;
}

// Fisher-Yates over the whole pool with crypto randomness. Math.random would
// be adequate for fairness but not for unpredictability, and the draw is the
// thing a determined user would most like to predict.
function sample(pool: DrawnQuestion[], count: number): DrawnQuestion[] {
  const items = [...pool];
  for (let i = items.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items.slice(0, count);
}

export type DrawResult =
  | { ok: true; questions: DrawnQuestion[]; shape: TestShape }
  | { ok: false; error: 'no_questions' | 'error' };

export async function drawTopicQuestions(topicId: string): Promise<DrawResult> {
  const [pool, config] = await Promise.all([readPool(topicId), getTopicTestConfig()]);
  if (pool === null) return { ok: false, error: 'error' };

  const shape = resolveTestShape(pool.length, config);
  if (!shape) return { ok: false, error: 'no_questions' };

  return { ok: true, questions: sample(pool, shape.total), shape };
}

// ---------------------------------------------------------------------------
// Reading view
// ---------------------------------------------------------------------------

function parseCitations(raw: unknown): TopicSourceCitation[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const record = entry as Record<string, unknown>;
    const page = Number(record.page_number);
    return [
      {
        chunkId: typeof record.chunk_id === 'string' ? record.chunk_id : null,
        articleLabel: typeof record.article_label === 'string' ? record.article_label : null,
        pageNumber: Number.isFinite(page) ? page : null,
      },
    ];
  });
}

// The topic reading page's single server read. Returns null — never a partial
// object and never `content` — for a topic the caller may not read, so a
// caller that forgets to branch on null renders "not found" rather than the
// paid material.
export async function getTopicForReading(
  topicId: string,
  userId: string
): Promise<TopicReading | null> {
  const access = await resolveAccessibleTopic(userId, topicId);
  if (!access) return null;

  const supabase = await createClient();

  // Content is read with the USER-SCOPED client, after the gate above: RLS on
  // lesson_topics (0060) independently requires the course to be free or
  // unlocked, so this stays a real second line of defence FOR NORMAL USERS.
  //
  // An admin is exempt from the unlock paywall (canAccessCourse, run inside
  // resolveAccessibleTopic above, already granted them the topic) but never
  // BUYS the course, so that same RLS policy would hide the content row and
  // the course-title row from them — leaving canAttemptToday/read broken with a
  // spurious not-found. So the two lesson_topics/lesson_courses reads below go
  // through the service-role client for an admin, mirroring getCourseTopics.
  // Everything else here is already service-role machinery. isAdmin fails
  // closed: a non-admin (or an unreadable role) keeps the user-scoped reads.
  const isAdmin = await isUserAdmin(userId);
  const readClient = isAdmin ? createAdminClient() : supabase;

  const [
    { data: topic, error: topicError },
    { data: course, error: courseError },
    attemptState,
    poolSize,
    config,
    retryCost,
  ] = await Promise.all([
    readClient
      .from('lesson_topics')
      .select('title, content, source_citations, order_index')
      .eq('id', topicId)
      .eq('status', 'published')
      .maybeSingle(),
    readClient.from('lesson_courses').select('title').eq('id', access.courseId).maybeSingle(),
    getAttemptState(userId, topicId),
    getTopicPoolSize(topicId),
    getTopicTestConfig(),
    getLessonRetryCost(),
  ]);

  if (topicError || !topic) {
    if (topicError && !isMissingRelationError(topicError)) {
      console.error('[quiz/topicTest] topic content read failed:', topicError);
    }
    return null;
  }
  if (courseError && !isMissingRelationError(courseError)) {
    console.error('[quiz/topicTest] course title read failed:', courseError);
  }

  const index = access.topics.findIndex((t) => t.id === topicId);
  const shape = resolveTestShape(poolSize, config);

  return {
    id: topicId,
    courseId: access.courseId,
    courseTitle: (course?.title as string | undefined) ?? '',
    title: topic.title as string,
    orderIndex: topic.order_index as number,
    content: (topic.content as string | null) ?? null,
    sourceCitations: parseCitations(topic.source_citations),
    passed: access.summary.passed,
    bestScore: access.summary.bestScore,
    attempts: access.summary.attempts,
    prevTopicId: index > 0 ? access.topics[index - 1].id : null,
    nextTopicId: index >= 0 && index < access.topics.length - 1 ? access.topics[index + 1].id : null,
    attemptedToday: attemptState.attemptedToday,
    hasUnusedRetry: attemptState.hasUnusedRetry,
    canAttemptToday: !attemptState.attemptedToday || attemptState.hasUnusedRetry,
    poolSize,
    testSize: shape?.total ?? 0,
    passThreshold: shape?.passThreshold ?? 0,
    retryCost,
  };
}

// ---------------------------------------------------------------------------
// Scoring + recording
// ---------------------------------------------------------------------------

export type ScoreResult =
  | { ok: true; score: number; perQuestion: TopicAnswerReview[] }
  | { ok: false; error: 'invalid_answers' | 'error' };

// Looks the correct answers up server-side, scoped to THIS topic and to
// published rows. Even with a valid token, a question id that does not belong
// to this topic fails the row-count check below — the signature and the scope
// check are independent, and neither is trusted alone.
export async function scoreAnswers(
  topicId: string,
  answers: TopicAnswerInput[]
): Promise<ScoreResult> {
  const ids = answers.map((a) => a.questionId);

  const { data, error } = await createAdminClient()
    .from('quiz_questions')
    .select('id, correct_index, explanation')
    .eq('topic_id', topicId)
    .eq('status', 'published')
    .in('id', ids)
    .returns<AnswerRow[]>();

  if (error) {
    console.error('[quiz/topicTest] answer key read failed:', error);
    return { ok: false, error: 'error' };
  }
  if (!data || data.length !== ids.length) return { ok: false, error: 'invalid_answers' };

  const keyById = new Map(data.map((row) => [row.id, row]));

  let score = 0;
  const perQuestion: TopicAnswerReview[] = [];
  for (const answer of answers) {
    const key = keyById.get(answer.questionId);
    if (!key) return { ok: false, error: 'invalid_answers' };
    if (answer.selectedIndex === key.correct_index) score += 1;
    perQuestion.push({
      questionId: answer.questionId,
      selectedIndex: answer.selectedIndex,
      correctIndex: key.correct_index,
      explanation: key.explanation,
    });
  }

  return { ok: true, score, perQuestion };
}

export type RecordAttemptResult =
  | { ok: true; passed: boolean; bestScore: number; attempts: number; usedRetry: boolean }
  | { ok: false; error: 'daily_limit_reached' | 'error' };

interface RecordAttemptRow {
  passed: boolean;
  best_score: number;
  attempts: number;
  used_retry: boolean;
}

// The ONLY write path for a completed topic test. Fails closed: any error
// means nothing was recorded and nothing unlocked.
export async function recordTopicAttempt(
  userId: string,
  topicId: string,
  score: number,
  total: number,
  passThreshold: number
): Promise<RecordAttemptResult> {
  const { data, error } = await createAdminClient().rpc('record_lesson_attempt', {
    p_user_id: userId,
    p_topic_id: topicId,
    p_score: score,
    p_total: total,
    p_pass_threshold: passThreshold,
  });

  if (error) {
    if ((error.message ?? '').includes('daily_limit_reached')) {
      return { ok: false, error: 'daily_limit_reached' };
    }
    console.error('[quiz/topicTest] record_lesson_attempt RPC failed:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return { ok: false, error: 'error' };
  }

  const row = (Array.isArray(data) ? data[0] : data) as RecordAttemptRow | undefined;
  if (!row) return { ok: false, error: 'error' };

  return {
    ok: true,
    passed: Boolean(row.passed),
    bestScore: Number(row.best_score ?? 0),
    attempts: Number(row.attempts ?? 0),
    usedRetry: Boolean(row.used_retry),
  };
}
