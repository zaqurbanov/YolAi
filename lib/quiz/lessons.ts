import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isMissingRelationError } from '@/lib/supabase/missingRelation';
import { getDefaultCourseUnlockPrice } from '@/lib/coins/lessonUnlock';
import { isUserAdmin } from '@/lib/auth/isAdmin';

// User-facing reads for the restructured lessons feature (/oyrenme).
//
// RLS-respecting client (createClient) by default: everything read here is
// either a published lesson_courses row (public-to-authenticated select
// policy) or the caller's own user_course_unlocks/user_topic_progress rows
// (self-select policies), so RLS stays a real second line of defence rather
// than something bypassed by habit.
//
// ONE documented exception: the published-topic COUNT in getCourses, which RLS
// cannot express (see the comment at that query). It selects ids only, never
// content. Everything else here must keep using the user-scoped client.
//
// GRACEFUL DEGRADATION IS LOAD-BEARING HERE. 0060_lesson_courses.sql is
// applied by hand by the owner, so between this code deploying and that SQL
// running, lesson_courses/lesson_topics/user_course_unlocks DO NOT EXIST. The
// previous iteration of this file crashed /oyrenme with a 500 for exactly that
// reason (it queried user_unlocked_categories from a migration that was never
// applied). Every read below therefore treats "relation missing" as an EMPTY
// RESULT, not an error — the page renders an empty state and starts working on
// its own once the migration lands. See lib/supabase/missingRelation.ts.
//
// Phase 1 only needs the course list to render. The learn -> test flow
// (topic content, question sampling, attempt submission) is Phase 2 and is
// intentionally not implemented here yet.

export interface CourseSummary {
  id: string;
  title: string;
  description: string | null;
  orderIndex: number;
  /** Free courses never cost coins, regardless of unlock_price. */
  isFree: boolean;
  /**
   * The access predicate the UI should gate on: free, or purchased by this
   * user. DISPLAY ONLY — the authoritative check is canAccessCourse() run
   * server-side wherever content is actually served. A server action is a
   * plain POST endpoint and a UI-level lock is not a lock.
   */
  isUnlocked: boolean;
  /** Effective price: the course's own override, else the global setting. */
  price: number;
  /** Published topics in this course. 0 means there is nothing to sell yet. */
  totalTopics: number;
  /** Published topics this user has passed. */
  passedTopics: number;
  progressPct: number;
}

interface CourseRow {
  id: string;
  title: string;
  description: string | null;
  order_index: number;
  is_free: boolean;
  unlock_price: number | null;
}

interface TopicIdRow {
  id: string;
  course_id: string;
}

// Four fixed queries plus one settings read, regardless of how many courses or
// topics exist — never one query per course. This is a user-facing page load
// path; today's volume (27 documents) wouldn't make an N+1 painful yet, but the
// topic count grows with every generated topic and the shape should not have to
// be revisited then.
export async function getCourses(userId: string): Promise<CourseSummary[]> {
  const supabase = await createClient();

  const { data: courses, error: coursesError } = await supabase
    .from('lesson_courses')
    .select('id, title, description, order_index, is_free, unlock_price')
    .eq('status', 'published')
    .order('order_index', { ascending: true })
    .returns<CourseRow[]>();

  if (coursesError) {
    // The pre-migration state. Not an error worth logging on every page load.
    if (isMissingRelationError(coursesError)) return [];
    console.error('[quiz/lessons] getCourses courses read failed:', coursesError);
    return [];
  }

  if (!courses || courses.length === 0) return [];

  const courseIds = courses.map((c) => c.id);

  const [
    { data: topics, error: topicsError },
    { data: unlocks, error: unlocksError },
    { data: progress, error: progressError },
    defaultPrice,
    isAdmin,
  ] = await Promise.all([
    // THE ONE ADMIN-CLIENT READ ON THIS PAGE, and it is deliberate.
    //
    // lesson_topics' RLS policy (0060) requires the course to be free or
    // unlocked by the caller — correct, because a topic row carries the full
    // reading material, which is the paid product. But that also hid the topic
    // COUNT of every locked course, so `totalTopics` came back 0 and CourseGrid
    // rendered a fully-prepared paid course as "Tezliklə — Hələ mövzu yoxdur"
    // instead of "Kilidli, N mövzu". Its `isLocked` branch was dead code.
    // Confirmed live against a published course with 3 published topics.
    //
    // Only `id` and `course_id` of PUBLISHED topics in PUBLISHED courses are
    // selected — no title, no content. That leaks nothing beyond "this course
    // has N sections", which the card is supposed to advertise. Do NOT widen
    // this select to include content/title: that is precisely what the RLS
    // policy exists to prevent, and the user-scoped client must stay the only
    // way material is read.
    createAdminClient()
      .from('lesson_topics')
      .select('id, course_id')
      .eq('status', 'published')
      .in('course_id', courseIds)
      .returns<TopicIdRow[]>(),
    supabase.from('user_course_unlocks').select('course_id').eq('user_id', userId),
    supabase.from('user_topic_progress').select('topic_id').eq('user_id', userId).eq('passed', true),
    getDefaultCourseUnlockPrice(),
    // Admins bypass the unlock paywall entirely — every published course reads
    // as open (see canAccessCourse). Display-only here; the authoritative gate
    // is server-side. isUserAdmin fails closed to a normal (non-admin) view.
    isUserAdmin(userId),
  ]);

  // Each of the three below degrades to "no rows" independently: a partially
  // applied migration should still render the list, just with zeroed counts.
  if (topicsError && !isMissingRelationError(topicsError)) {
    console.error('[quiz/lessons] getCourses topics read failed:', topicsError);
  }
  // Display-path read: a failure renders paid courses as LOCKED, which is the
  // safe direction (the real gate is canAccessCourse, server-side).
  if (unlocksError && !isMissingRelationError(unlocksError)) {
    console.error('[quiz/lessons] getCourses unlocks read failed:', unlocksError);
  }
  if (progressError && !isMissingRelationError(progressError)) {
    console.error('[quiz/lessons] getCourses progress read failed:', progressError);
  }

  const unlockedCourseIds = new Set((unlocks ?? []).map((u) => u.course_id as string));
  const passedTopicIds = new Set((progress ?? []).map((p) => p.topic_id as string));

  const totalByCourse = new Map<string, number>();
  const passedByCourse = new Map<string, number>();
  for (const topic of topics ?? []) {
    totalByCourse.set(topic.course_id, (totalByCourse.get(topic.course_id) ?? 0) + 1);
    if (passedTopicIds.has(topic.id)) {
      passedByCourse.set(topic.course_id, (passedByCourse.get(topic.course_id) ?? 0) + 1);
    }
  }

  return courses.map((course) => {
    const totalTopics = totalByCourse.get(course.id) ?? 0;
    const passedTopics = passedByCourse.get(course.id) ?? 0;
    return {
      id: course.id,
      title: course.title,
      description: course.description,
      orderIndex: course.order_index,
      isFree: course.is_free,
      isUnlocked: isAdmin || course.is_free || unlockedCourseIds.has(course.id),
      // 0 is a legitimate per-course override, so check for null explicitly
      // rather than relying on falsiness.
      price: course.unlock_price !== null ? Number(course.unlock_price) : defaultPrice,
      totalTopics,
      passedTopics,
      progressPct: totalTopics > 0 ? Math.round((passedTopics / totalTopics) * 100) : 0,
    };
  });
}

export interface TopicSummary {
  id: string;
  courseId: string;
  title: string;
  orderIndex: number;
  passed: boolean;
  bestScore: number;
  attempts: number;
  /**
   * Topic 1 of a course is always unlocked; every later topic requires the
   * PREVIOUS topic in the same course to be passed. Progress is per-course,
   * so a user blocked here can still advance in another course.
   *
   * DISPLAY ONLY, same caveat as CourseSummary.isUnlocked — Phase 2 must
   * re-check this server-side before serving topic content or accepting an
   * attempt.
   */
  isUnlocked: boolean;
}

// Ordered topic list for one course. Does NOT return `content` — the reading
// material is fetched separately, only after a server-side access check, so a
// course-overview render can never leak the paid body text.
//
// Callers must have already established that this user can access the course
// (canAccessCourse). RLS on lesson_topics enforces the same rule independently,
// so a caller that forgets gets an empty list rather than a leak — but do not
// rely on that as the gate.
export async function getCourseTopics(courseId: string, userId: string): Promise<TopicSummary[]> {
  const supabase = await createClient();

  // Admins see the whole course open: every published topic is unlocked
  // regardless of the sequential pass rule, so they can read content without
  // passing tests. Resolved BEFORE the topic-list read because it also decides
  // which client that read uses (see below). Fails closed to the normal view.
  const isAdmin = await isUserAdmin(userId);

  // The topic list (ids/titles, no content) is normally read USER-SCOPED so
  // lesson_topics' RLS (0060) stays a real second line of defence. But that
  // policy hides EVERY row of a paid course the caller has not purchased — and
  // an admin never purchases — so for an admin the list must go through the
  // service-role client or it comes back empty. Same "THE ONE ADMIN-CLIENT
  // READ" reasoning as getCourses: ids/titles of published topics leak nothing
  // beyond the course structure the admin already fully controls.
  const topicsClient = isAdmin ? createAdminClient() : supabase;

  const [
    { data: topics, error: topicsError },
    { data: progress, error: progressError },
  ] = await Promise.all([
      topicsClient
        .from('lesson_topics')
        .select('id, course_id, title, order_index')
        .eq('course_id', courseId)
        .eq('status', 'published')
        .order('order_index', { ascending: true }),
      supabase
        .from('user_topic_progress')
        .select('topic_id, passed, best_score, attempts')
        .eq('user_id', userId),
    ]);

  if (topicsError) {
    if (isMissingRelationError(topicsError)) return [];
    console.error('[quiz/lessons] getCourseTopics topics read failed:', topicsError);
    return [];
  }

  if (progressError && !isMissingRelationError(progressError)) {
    console.error('[quiz/lessons] getCourseTopics progress read failed:', progressError);
  }

  const progressByTopic = new Map(
    (progress ?? []).map((p) => [
      p.topic_id as string,
      {
        passed: Boolean(p.passed),
        bestScore: Number(p.best_score ?? 0),
        attempts: Number(p.attempts ?? 0),
      },
    ])
  );

  // Sequential unlock walks the list in order_index order, carrying "was the
  // previous one passed" forward. Computed from the ALREADY-FILTERED published
  // list, so an unpublished topic in the middle of a course does not
  // permanently block the ones after it.
  let previousPassed = true;
  return (topics ?? []).map((topic) => {
    const p = progressByTopic.get(topic.id as string);
    const passed = p?.passed ?? false;
    const isUnlocked = isAdmin || previousPassed;
    previousPassed = passed;
    return {
      id: topic.id as string,
      courseId: topic.course_id as string,
      title: topic.title as string,
      orderIndex: topic.order_index as number,
      passed,
      bestScore: p?.bestScore ?? 0,
      attempts: p?.attempts ?? 0,
      isUnlocked,
    };
  });
}
