import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { isMissingRelationError } from '@/lib/supabase/missingRelation';

// Coin-facing layer for the COURSE unlock economy (0060_lesson_courses.sql).
//
// Retargeted from the previous category-keyed model: a course is a row in
// lesson_courses (one per source document), not an entry in a static 8-item
// array, so the old isValidCategory/RULE_CATEGORIES gate is replaced by a real
// existence check — "the course exists and is published". The completion-bonus
// mechanic is gone entirely; Phase 3 defines how coins are earned.
//
// The fail-open/fail-closed split from lib/coins/adWatch.ts is preserved and
// is the important thing to keep straight when editing this file:
//   * SETTINGS READERS fail OPEN to the hardcoded defaults. A missing or
//     malformed app_settings row must not make the lessons page unusable —
//     and since this repo seeds no settings rows at all, "missing" is the
//     normal state, not an error.
//   * SPEND/CLAIM WRAPPERS fail CLOSED. Any error means the unlock did not
//     happen; never optimistically assume it did.

const COURSE_UNLOCK_PRICE_KEY = 'lesson_course_unlock_price';
const DEFAULT_COURSE_UNLOCK_PRICE = 20;

const PASS_THRESHOLD_KEY = 'lesson_topic_pass_threshold';
const DEFAULT_PASS_THRESHOLD = 8;

const QUESTIONS_PER_ATTEMPT_KEY = 'lesson_topic_questions_per_attempt';
const DEFAULT_QUESTIONS_PER_ATTEMPT = 10;

const RETRY_COST_KEY = 'lesson_retry_cost';
const DEFAULT_RETRY_COST = 5;

export {
  COURSE_UNLOCK_PRICE_KEY,
  DEFAULT_COURSE_UNLOCK_PRICE,
  PASS_THRESHOLD_KEY,
  DEFAULT_PASS_THRESHOLD,
  QUESTIONS_PER_ATTEMPT_KEY,
  DEFAULT_QUESTIONS_PER_ATTEMPT,
  RETRY_COST_KEY,
  DEFAULT_RETRY_COST,
};

// Shared reader for the positive-number settings. `value <= 0` falls back to
// the default rather than being honoured: zero or negative is never a valid
// price/threshold/count here, so it can only be a bad write.
async function readPositiveSetting(
  key: string,
  fallback: number,
  integerOnly: boolean
): Promise<number> {
  const { data, error } = await createAdminClient()
    .from('app_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();

  if (error || !data) return fallback;

  const value = typeof data.value === 'number' ? data.value : Number(data.value);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  if (integerOnly && !Number.isInteger(value)) return fallback;
  return value;
}

// The GLOBAL default price. Prefer getCourseUnlockPrice(), which honours a
// per-course override; this is only the value to use when a course has none.
export async function getDefaultCourseUnlockPrice(): Promise<number> {
  return readPositiveSetting(COURSE_UNLOCK_PRICE_KEY, DEFAULT_COURSE_UNLOCK_PRICE, false);
}

export async function getTopicPassThreshold(): Promise<number> {
  return readPositiveSetting(PASS_THRESHOLD_KEY, DEFAULT_PASS_THRESHOLD, true);
}

export async function getTopicQuestionsPerAttempt(): Promise<number> {
  return readPositiveSetting(QUESTIONS_PER_ATTEMPT_KEY, DEFAULT_QUESTIONS_PER_ATTEMPT, true);
}

export async function getLessonRetryCost(): Promise<number> {
  return readPositiveSetting(RETRY_COST_KEY, DEFAULT_RETRY_COST, false);
}

// Both settings are independently editable, so nothing stops an admin from
// setting a threshold above the number of questions asked — which would make
// every topic unpassable. Clamped at read time rather than validated at write
// time so a bad pre-existing row can't brick the feature.
export async function getTopicTestConfig(): Promise<{
  questionsPerAttempt: number;
  passThreshold: number;
}> {
  const [questionsPerAttempt, rawThreshold] = await Promise.all([
    getTopicQuestionsPerAttempt(),
    getTopicPassThreshold(),
  ]);

  return {
    questionsPerAttempt,
    passThreshold: Math.min(rawThreshold, questionsPerAttempt),
  };
}

interface CoursePricingRow {
  id: string;
  is_free: boolean;
  unlock_price: number | null;
  status: 'draft' | 'published';
}

// Replaces isValidCategory. A course id arriving from outside (server action
// argument, route param) is an arbitrary uuid until this says otherwise —
// unlocking or gating against an unvalidated id would create a purchase ledger
// row for a course that does not exist, or one that is still a draft.
//
// Returns null both when the course is absent and when it is unpublished;
// callers must not distinguish those for an end user.
async function getPublishedCourse(courseId: string): Promise<CoursePricingRow | null> {
  const { data, error } = await createAdminClient()
    .from('lesson_courses')
    .select('id, is_free, unlock_price, status')
    .eq('id', courseId)
    .eq('status', 'published')
    .maybeSingle<CoursePricingRow>();

  if (error) {
    if (!isMissingRelationError(error)) {
      console.error('[coins/lessonUnlock] getPublishedCourse read failed:', error);
    }
    return null;
  }

  return data ?? null;
}

// The price a specific course actually costs right now: its own override when
// set, otherwise the global setting. `unlock_price` of 0 is a legitimate
// override (a deliberately free-but-not-flagged course), hence the explicit
// null check rather than a falsy one.
export async function getCourseUnlockPrice(courseId: string): Promise<number | null> {
  const course = await getPublishedCourse(courseId);
  if (!course) return null;
  if (course.unlock_price !== null) return Number(course.unlock_price);
  return getDefaultCourseUnlockPrice();
}

// Authorization read, used on the course page and before any topic content is
// served, so it fails CLOSED: a DB error returns false ("not unlocked"), which
// denies access. Uses the service-role client so it is independent of the
// caller's RLS context — callers pass a userId they have already
// authenticated.
export async function hasUnlockedCourse(userId: string, courseId: string): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from('user_course_unlocks')
    .select('id')
    .eq('user_id', userId)
    .eq('course_id', courseId)
    .maybeSingle();

  if (error) {
    if (!isMissingRelationError(error)) {
      console.error('[coins/lessonUnlock] hasUnlockedCourse read failed:', error);
    }
    return false;
  }

  return Boolean(data);
}

// THE access predicate. Every path that gates course content must call this
// rather than re-deriving the rule from is_free + the ledger separately.
// A draft/nonexistent course is not accessible, regardless of unlock rows.
export async function canAccessCourse(userId: string, courseId: string): Promise<boolean> {
  const course = await getPublishedCourse(courseId);
  if (!course) return false;
  if (course.is_free) return true;
  return hasUnlockedCourse(userId, courseId);
}

export type UnlockCourseResult =
  | { ok: true; balance: number; price: number }
  | {
      ok: false;
      error:
        | 'already_unlocked'
        | 'insufficient_coins'
        | 'invalid_course'
        | 'already_free'
        | 'no_content'
        | 'error';
    };

// Fail-closed spend path. The price is resolved HERE, from the course row and
// app_settings, and is never accepted from a caller upstream of this module.
//
// The `no_content` branch is not a nicety — it is carried over from the
// previous model for the same reason: selling access to a course with no
// published topics is selling nothing, and during Phase 1 that is the state
// every freshly created course is in. Checked BEFORE the debit RPC.
export async function unlockLessonCourse(
  userId: string,
  courseId: string
): Promise<UnlockCourseResult> {
  const course = await getPublishedCourse(courseId);
  if (!course) return { ok: false, error: 'invalid_course' };
  if (course.is_free) return { ok: false, error: 'already_free' };

  const admin = createAdminClient();

  const { count, error: countError } = await admin
    .from('lesson_topics')
    .select('*', { count: 'exact', head: true })
    .eq('course_id', courseId)
    .eq('status', 'published');

  // Fail closed: if we can't confirm the course has content, don't charge.
  if (countError) {
    console.error('[coins/lessonUnlock] published topic count failed:', countError);
    return { ok: false, error: 'error' };
  }
  if ((count ?? 0) === 0) {
    return { ok: false, error: 'no_content' };
  }

  const price =
    course.unlock_price !== null
      ? Number(course.unlock_price)
      : await getDefaultCourseUnlockPrice();

  if (!Number.isFinite(price) || price < 0) {
    console.error('[coins/lessonUnlock] resolved a non-finite course price:', { courseId, price });
    return { ok: false, error: 'error' };
  }

  const { data, error } = await admin.rpc('unlock_lesson_course', {
    p_user_id: userId,
    p_course_id: courseId,
    p_price: price,
  });

  if (error) {
    const message = error.message ?? '';
    if (message.includes('already_unlocked')) return { ok: false, error: 'already_unlocked' };
    if (message.includes('insufficient_coins')) return { ok: false, error: 'insufficient_coins' };
    console.error('[coins/lessonUnlock] unlock_lesson_course RPC failed:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return { ok: false, error: 'error' };
  }

  if (typeof data !== 'number') return { ok: false, error: 'error' };

  return { ok: true, balance: data, price };
}

export type PurchaseRetryResult =
  | { ok: true; balance: number; price: number }
  | { ok: false; error: 'insufficient_coins' | 'invalid_topic' | 'error' };

// Buys ONE extra same-day attempt at a topic (Phase 3 surface; the schema and
// RPC exist now so Phase 3 needs no second migration). Fail-closed like every
// other spend path.
//
// Deliberately does not check "has the user already attempted today" — that is
// a product-level question the Phase 2 flow answers before offering the button,
// and duplicating it here would mean two places deciding when a retry is
// sellable. What IS checked is that the topic exists and is published, since an
// arbitrary uuid would otherwise create a progress row for a nonexistent topic.
export async function purchaseLessonRetry(
  userId: string,
  topicId: string
): Promise<PurchaseRetryResult> {
  const admin = createAdminClient();

  const { data: topic, error: topicError } = await admin
    .from('lesson_topics')
    .select('id')
    .eq('id', topicId)
    .eq('status', 'published')
    .maybeSingle();

  if (topicError) {
    if (!isMissingRelationError(topicError)) {
      console.error('[coins/lessonUnlock] retry topic lookup failed:', topicError);
    }
    return { ok: false, error: 'invalid_topic' };
  }
  if (!topic) return { ok: false, error: 'invalid_topic' };

  const price = await getLessonRetryCost();

  const { data, error } = await admin.rpc('purchase_lesson_retry', {
    p_user_id: userId,
    p_topic_id: topicId,
    p_price: price,
  });

  if (error) {
    const message = error.message ?? '';
    if (message.includes('insufficient_coins')) return { ok: false, error: 'insufficient_coins' };
    console.error('[coins/lessonUnlock] purchase_lesson_retry RPC failed:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return { ok: false, error: 'error' };
  }

  if (typeof data !== 'number') return { ok: false, error: 'error' };

  return { ok: true, balance: data, price };
}
