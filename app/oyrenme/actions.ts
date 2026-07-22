'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import {
  getCourseUnlockPrice,
  getLessonRetryCost,
  getTopicTestConfig,
  purchaseLessonRetry,
  unlockLessonCourse,
} from '@/lib/coins/lessonUnlock';
import { getCoinBalanceStatus } from '@/lib/chat/coins';
import {
  drawTopicQuestions,
  getAttemptState,
  issueAttemptToken,
  recordTopicAttempt,
  resolveAccessibleTopic,
  resolveThresholdForTotal,
  scoreAnswers,
  verifyAttemptToken,
  type DrawnQuestion,
  type TopicAnswerInput,
  type TopicAnswerReview,
} from '@/lib/quiz/topicTest';

export interface UnlockCourseState {
  status:
    | 'success'
    | 'already_unlocked'
    | 'insufficient_coins'
    | 'invalid_course'
    | 'already_free'
    | 'no_content'
    | 'unauthenticated'
    | 'error';
  message: string;
  balance?: number;
  price?: number;
  missing?: number;
}

// Spends coins to unlock a paid course. Mirrors app/coin-qazan/actions.ts:
// session lookup with the RLS-respecting client, then delegate to the lib
// function, which owns the price resolution and the fail-closed debit.
//
// The argument is ONLY the course id — a server action is a plain POST
// endpoint any authenticated user can call directly, so accepting a price or
// an eligibility flag here would be accepting it from an attacker.
export async function unlockCourseAction(courseId: string): Promise<UnlockCourseState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: 'unauthenticated', message: 'Giriş tələb olunur' };
  }

  if (typeof courseId !== 'string' || courseId.trim() === '') {
    return { status: 'invalid_course', message: 'Kurs tapılmadı' };
  }

  const result = await unlockLessonCourse(user.id, courseId);

  if (!result.ok) {
    if (result.error === 'already_unlocked') {
      // The unlock exists but the rendered page said otherwise — refresh it.
      revalidatePath('/oyrenme');
      return { status: 'already_unlocked', message: 'Bu kurs artıq açıqdır' };
    }

    if (result.error === 'insufficient_coins') {
      // Display-only lookups. The debit already refused; nothing here re-decides it.
      const [balance, price] = await Promise.all([
        getCoinBalanceStatus(user.id)
          .then((status) => status.balance)
          .catch(() => null),
        getCourseUnlockPrice(courseId).catch(() => null),
      ]);

      if (typeof balance === 'number' && typeof price === 'number') {
        const missing = Math.max(0, price - balance);
        return {
          status: 'insufficient_coins',
          message: `Balansınız kifayət etmir. ${missing} coin çatmır`,
          balance,
          price,
          missing,
        };
      }

      return { status: 'insufficient_coins', message: 'Balansınız kifayət etmir' };
    }

    if (result.error === 'invalid_course') {
      return { status: 'invalid_course', message: 'Kurs tapılmadı' };
    }
    if (result.error === 'already_free') {
      return { status: 'already_free', message: 'Bu kurs onsuz da pulsuzdur' };
    }
    if (result.error === 'no_content') {
      return { status: 'no_content', message: 'Bu kursda hələ material yoxdur' };
    }

    return { status: 'error', message: 'Xəta baş verdi. Bir az sonra yenidən cəhd edin' };
  }

  revalidatePath('/oyrenme');
  return {
    status: 'success',
    message: 'Kurs açıldı',
    balance: result.balance,
    price: result.price,
  };
}

// Every lessons page lives under /oyrenme, so one layout-scoped revalidation
// refreshes the course grid, the course page and the topic page together —
// progress written by a submitted attempt has to flow back to all three, and
// the grid already reads passedTopics.
function revalidateLessons() {
  revalidatePath('/oyrenme', 'layout');
}

export interface StartTopicAttemptState {
  status:
    | 'success'
    | 'unauthenticated'
    | 'not_found'
    | 'no_questions'
    | 'daily_limit_reached'
    | 'error';
  message: string;
  /** Opaque HMAC over the drawn question ids; hand back to submit unchanged. */
  token?: string;
  questions?: DrawnQuestion[];
  total?: number;
  passThreshold?: number;
  /** Set on 'daily_limit_reached' so the UI can offer the paid retry. */
  hasUnusedRetry?: boolean;
  retryCost?: number;
}

// Draws one topic test. The client learns the questions ONLY after the daily
// limit has been checked — discovering the draw and then being told it can't
// be submitted would leak a free look at the pool every day.
//
// 'not_found' deliberately covers "no such topic", "course not unlocked" and
// "previous topic not passed" alike; the UI must not distinguish them.
export async function startTopicAttemptAction(topicId: string): Promise<StartTopicAttemptState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: 'unauthenticated', message: 'Giriş tələb olunur' };
  }

  const access = await resolveAccessibleTopic(user.id, topicId);
  if (!access) {
    return { status: 'not_found', message: 'Mövzu tapılmadı' };
  }

  const attemptState = await getAttemptState(user.id, topicId);
  if (attemptState.attemptedToday && !attemptState.hasUnusedRetry) {
    return {
      status: 'daily_limit_reached',
      message: 'Bu mövzu üzrə bugünkü cəhdiniz istifadə olunub',
      hasUnusedRetry: false,
      retryCost: await getLessonRetryCost(),
    };
  }

  const draw = await drawTopicQuestions(topicId);
  if (!draw.ok) {
    if (draw.error === 'no_questions') {
      return { status: 'no_questions', message: 'Bu mövzu üçün hələ test hazır deyil' };
    }
    return { status: 'error', message: 'Xəta baş verdi. Bir az sonra yenidən cəhd edin' };
  }

  const token = issueAttemptToken(
    user.id,
    topicId,
    draw.questions.map((q) => q.id)
  );
  if (!token) {
    return { status: 'error', message: 'Xəta baş verdi. Bir az sonra yenidən cəhd edin' };
  }

  return {
    status: 'success',
    message: 'Test hazırdır',
    token,
    questions: draw.questions,
    total: draw.shape.total,
    passThreshold: draw.shape.passThreshold,
    hasUnusedRetry: attemptState.hasUnusedRetry,
  };
}

export interface SubmitTopicAttemptInput {
  topicId: string;
  token: string;
  answers: TopicAnswerInput[];
}

export interface SubmitTopicAttemptState {
  status:
    | 'success'
    | 'unauthenticated'
    | 'not_found'
    | 'invalid_token'
    | 'expired_token'
    | 'invalid_answers'
    | 'daily_limit_reached'
    | 'error';
  message: string;
  score?: number;
  total?: number;
  passed?: boolean;
  bestScore?: number;
  attempts?: number;
  usedRetry?: boolean;
  passThreshold?: number;
  /** The next topic in this course, present only when this attempt passed. */
  unlockedTopicId?: string;
  unlockedTopicTitle?: string;
  /** Review data — safe to expose only AFTER the attempt is recorded. */
  perQuestion?: TopicAnswerReview[];
}

// Scores and records one topic test. Nothing about the outcome comes from the
// client: the answer key, the score, the pass threshold and the pass flag are
// all resolved server-side, and the question SET is pinned by the token issued
// at draw time.
export async function submitTopicAttemptAction(
  input: SubmitTopicAttemptInput
): Promise<SubmitTopicAttemptState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: 'unauthenticated', message: 'Giriş tələb olunur' };
  }

  const topicId = input?.topicId;
  const answers = Array.isArray(input?.answers) ? input.answers : [];

  const wellFormed =
    answers.length > 0 &&
    answers.length <= 100 &&
    answers.every(
      (a) =>
        a &&
        typeof a.questionId === 'string' &&
        a.questionId.trim() !== '' &&
        Number.isInteger(a.selectedIndex) &&
        a.selectedIndex >= -1 &&
        a.selectedIndex <= 3
    ) &&
    new Set(answers.map((a) => a.questionId)).size === answers.length;

  if (!wellFormed) {
    return { status: 'invalid_answers', message: 'Cavablar düzgün göndərilmədi' };
  }

  const access = await resolveAccessibleTopic(user.id, topicId);
  if (!access) {
    return { status: 'not_found', message: 'Mövzu tapılmadı' };
  }

  const tokenCheck = verifyAttemptToken(
    input.token,
    user.id,
    topicId,
    answers.map((a) => a.questionId)
  );
  if (tokenCheck === 'expired') {
    return { status: 'expired_token', message: 'Testin vaxtı bitdi. Yenidən başlayın' };
  }
  if (tokenCheck !== 'ok') {
    return { status: 'invalid_token', message: 'Test doğrulanmadı. Yenidən başlayın' };
  }

  const scored = await scoreAnswers(topicId, answers);
  if (!scored.ok) {
    if (scored.error === 'invalid_answers') {
      return { status: 'invalid_answers', message: 'Cavablar düzgün göndərilmədi' };
    }
    return { status: 'error', message: 'Xəta baş verdi. Bir az sonra yenidən cəhd edin' };
  }

  // The threshold is derived from the SIGNED question count, using the same
  // rescaling rule the draw used, so a short pool stays passable and the bar
  // can't be moved by the client.
  const config = await getTopicTestConfig();
  const passThreshold = resolveThresholdForTotal(answers.length, config);

  const recorded = await recordTopicAttempt(
    user.id,
    topicId,
    scored.score,
    answers.length,
    passThreshold
  );

  if (!recorded.ok) {
    if (recorded.error === 'daily_limit_reached') {
      return {
        status: 'daily_limit_reached',
        message: 'Bu mövzu üzrə bugünkü cəhdiniz istifadə olunub',
      };
    }
    return { status: 'error', message: 'Xəta baş verdi. Bir az sonra yenidən cəhd edin' };
  }

  const attemptPassed = scored.score >= passThreshold;
  // access.topics was read BEFORE the attempt, so `!next.isUnlocked` means
  // this pass is what opened it — a retake of an already-passed topic reports
  // no new unlock.
  const index = access.topics.findIndex((t) => t.id === topicId);
  const nextTopic = index >= 0 ? access.topics[index + 1] : undefined;
  const newlyUnlocked = attemptPassed && nextTopic && !nextTopic.isUnlocked ? nextTopic : undefined;

  revalidateLessons();

  return {
    status: 'success',
    message: attemptPassed ? 'Təbriklər, mövzunu keçdiniz' : 'Bu dəfə alınmadı',
    score: scored.score,
    total: answers.length,
    passed: attemptPassed,
    bestScore: recorded.bestScore,
    attempts: recorded.attempts,
    usedRetry: recorded.usedRetry,
    passThreshold,
    unlockedTopicId: newlyUnlocked?.id,
    unlockedTopicTitle: newlyUnlocked?.title,
    perQuestion: scored.perQuestion,
  };
}

export interface PurchaseRetryState {
  status:
    | 'success'
    | 'unauthenticated'
    | 'not_found'
    | 'not_needed'
    | 'already_has_retry'
    | 'insufficient_coins'
    | 'error';
  message: string;
  balance?: number;
  price?: number;
  missing?: number;
}

// Buys one extra same-day attempt. The price is resolved server-side by
// getLessonRetryCost() inside purchaseLessonRetry — never accepted here.
//
// The two product guards (0060's comment puts them in TS on purpose) fail
// CLOSED: an unreadable attempt state reports attemptedToday = false, which
// lands on 'not_needed' and sells nothing.
export async function purchaseRetryAction(topicId: string): Promise<PurchaseRetryState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: 'unauthenticated', message: 'Giriş tələb olunur' };
  }

  const access = await resolveAccessibleTopic(user.id, topicId);
  if (!access) {
    return { status: 'not_found', message: 'Mövzu tapılmadı' };
  }

  const attemptState = await getAttemptState(user.id, topicId);
  if (!attemptState.attemptedToday) {
    return { status: 'not_needed', message: 'Bugünkü cəhdiniz hələ istifadə olunmayıb' };
  }
  if (attemptState.hasUnusedRetry) {
    return { status: 'already_has_retry', message: 'İstifadə olunmamış təkrar cəhdiniz var' };
  }

  const result = await purchaseLessonRetry(user.id, topicId);

  if (!result.ok) {
    if (result.error === 'insufficient_coins') {
      // Display-only lookups; the debit already refused and nothing here
      // re-decides it. Same shape unlockCourseAction returns, so the frontend
      // can reuse UnlockCourseCard's pricing / «Coin qazan» exit verbatim.
      const [balance, price] = await Promise.all([
        getCoinBalanceStatus(user.id)
          .then((status) => status.balance)
          .catch(() => null),
        getLessonRetryCost().catch(() => null),
      ]);

      if (typeof balance === 'number' && typeof price === 'number') {
        return {
          status: 'insufficient_coins',
          message: `Balansınız kifayət etmir. ${Math.max(0, price - balance)} coin çatmır`,
          balance,
          price,
          missing: Math.max(0, price - balance),
        };
      }

      return { status: 'insufficient_coins', message: 'Balansınız kifayət etmir' };
    }

    if (result.error === 'invalid_topic') {
      return { status: 'not_found', message: 'Mövzu tapılmadı' };
    }

    return { status: 'error', message: 'Xəta baş verdi. Bir az sonra yenidən cəhd edin' };
  }

  revalidateLessons();

  return {
    status: 'success',
    message: 'Təkrar cəhd alındı',
    balance: result.balance,
    price: result.price,
  };
}
