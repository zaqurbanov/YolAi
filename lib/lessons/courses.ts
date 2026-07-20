import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { isMissingRelationError } from '@/lib/supabase/missingRelation';
import {
  buildCitations,
  generateTopicReadingContent,
  generateTopicQuestions,
  loadChunksByIds,
  TOPIC_POOL_MIN,
  type TopicCitation,
  type TopicSourceChunk,
} from '@/lib/lessons/generateTopicContent';

// Admin data layer for lesson courses and topics. Same posture as
// lib/admin/quizQuestions.ts: service-role client throughout, every function
// returns a discriminated union or an empty list, and nothing throws.
//
// AUTHORIZATION IS NOT DONE HERE. Every function in this file uses the
// service-role client and therefore bypasses RLS entirely. requireAdmin() must
// be called by the entry point (the server action) BEFORE any of these are
// reached — see app/admin/kurslar/actions.ts, where it is the unconditional
// first statement of every action. Do not add a caller that skips it.
//
// Everything created here is a DRAFT. Publishing is a separate, explicit admin
// action, because the content is LLM-drafted and unreviewed drafts must never
// be reachable by a learner.

export interface LessonCourseRow {
  id: string;
  documentId: string;
  documentTitle: string | null;
  title: string;
  description: string | null;
  orderIndex: number;
  isFree: boolean;
  /** null means "use the global lesson_course_unlock_price setting". */
  unlockPrice: number | null;
  status: 'draft' | 'published';
  topicCount: number;
  publishedTopicCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface LessonTopicRow {
  id: string;
  courseId: string;
  title: string;
  content: string | null;
  sourceCitations: TopicCitation[];
  orderIndex: number;
  status: 'draft' | 'published';
  questionCount: number;
  publishedQuestionCount: number;
  createdAt: string;
  updatedAt: string;
}

const COURSE_COLUMNS =
  'id, document_id, title, description, order_index, is_free, unlock_price, status, created_at, updated_at, documents(title)';

const TOPIC_COLUMNS =
  'id, course_id, title, content, source_citations, order_index, status, created_at, updated_at';

interface CourseSelectRow {
  id: string;
  document_id: string;
  title: string;
  description: string | null;
  order_index: number;
  is_free: boolean;
  unlock_price: number | string | null;
  status: 'draft' | 'published';
  created_at: string;
  updated_at: string;
  documents: { title: string } | { title: string }[] | null;
}

function documentTitleOf(row: CourseSelectRow): string | null {
  if (!row.documents) return null;
  return Array.isArray(row.documents) ? (row.documents[0]?.title ?? null) : row.documents.title;
}

// The DB column is numeric(10,2); PostgREST may return it as a string. Parsed
// once, here, so no caller has to think about it.
function parsePrice(value: number | string | null): number | null {
  if (value === null) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

// listCourses runs two extra aggregate-ish reads rather than N+1 per course:
// the topic counts come from one select over all topics of the listed courses.
// Admin-only page, but the topic table grows with every generated topic and
// the shape shouldn't need revisiting.
export async function listCourses(): Promise<LessonCourseRow[]> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('lesson_courses')
    .select(COURSE_COLUMNS)
    .order('order_index', { ascending: true })
    .returns<CourseSelectRow[]>();

  if (error || !data) {
    // Pre-migration state: the admin screen renders an empty list rather than
    // erroring, same rationale as lib/quiz/lessons.ts.
    if (isMissingRelationError(error)) return [];
    console.error('[lessons/courses] listCourses failed:', error);
    return [];
  }

  const courseIds = data.map((c) => c.id);
  const topicCounts = new Map<string, { total: number; published: number }>();

  if (courseIds.length > 0) {
    const { data: topics, error: topicsError } = await admin
      .from('lesson_topics')
      .select('course_id, status')
      .in('course_id', courseIds);

    if (topicsError && !isMissingRelationError(topicsError)) {
      console.error('[lessons/courses] listCourses topic counts failed:', topicsError);
    }

    for (const topic of topics ?? []) {
      const courseId = topic.course_id as string;
      const entry = topicCounts.get(courseId) ?? { total: 0, published: 0 };
      entry.total += 1;
      if (topic.status === 'published') entry.published += 1;
      topicCounts.set(courseId, entry);
    }
  }

  return data.map((row) => {
    const counts = topicCounts.get(row.id) ?? { total: 0, published: 0 };
    return {
      id: row.id,
      documentId: row.document_id,
      documentTitle: documentTitleOf(row),
      title: row.title,
      description: row.description,
      orderIndex: row.order_index,
      isFree: row.is_free,
      unlockPrice: parsePrice(row.unlock_price),
      status: row.status,
      topicCount: counts.total,
      publishedTopicCount: counts.published,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
}

export interface CreateCourseInput {
  documentId: string;
  title: string;
  description?: string | null;
  orderIndex?: number;
  isFree?: boolean;
  unlockPrice?: number | null;
  createdBy: string;
}

export async function createCourse(
  input: CreateCourseInput
): Promise<{ ok: true; course: LessonCourseRow } | { ok: false; error: string }> {
  if (!input.title.trim()) return { ok: false, error: 'Kursun adı boş ola bilməz' };

  const { data, error } = await createAdminClient()
    .from('lesson_courses')
    .insert({
      document_id: input.documentId,
      title: input.title.trim(),
      description: input.description ?? null,
      order_index: input.orderIndex ?? 0,
      is_free: input.isFree ?? false,
      unlock_price: input.unlockPrice ?? null,
      status: 'draft',
      created_by: input.createdBy,
    })
    .select(COURSE_COLUMNS)
    .single<CourseSelectRow>();

  if (error || !data) {
    console.error('[lessons/courses] createCourse failed:', error);
    if (isMissingRelationError(error)) {
      return { ok: false, error: 'Kurs cədvəlləri hələ yaradılmayıb (0060 migrasiyası icra edilməyib)' };
    }
    return { ok: false, error: 'Kursu yaratmaq uğursuz oldu' };
  }

  return {
    ok: true,
    course: {
      id: data.id,
      documentId: data.document_id,
      documentTitle: documentTitleOf(data),
      title: data.title,
      description: data.description,
      orderIndex: data.order_index,
      isFree: data.is_free,
      unlockPrice: parsePrice(data.unlock_price),
      status: data.status,
      topicCount: 0,
      publishedTopicCount: 0,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    },
  };
}

export interface CoursePatch {
  title?: string;
  description?: string | null;
  orderIndex?: number;
  isFree?: boolean;
  unlockPrice?: number | null;
  status?: 'draft' | 'published';
}

// Publishing a course with no published topics is blocked here rather than in
// the UI: it would appear on /oyrenme as a purchasable course containing
// nothing. unlockLessonCourse has its own `no_content` guard, but that only
// stops the sale, not the empty listing.
export async function updateCourse(
  id: string,
  patch: CoursePatch
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient();

  if (patch.unlockPrice !== undefined && patch.unlockPrice !== null && patch.unlockPrice < 0) {
    return { ok: false, error: 'Qiymət mənfi ola bilməz' };
  }

  if (patch.status === 'published') {
    const { count, error: countError } = await admin
      .from('lesson_topics')
      .select('*', { count: 'exact', head: true })
      .eq('course_id', id)
      .eq('status', 'published');

    if (countError) {
      console.error('[lessons/courses] publish topic count failed:', countError);
      return { ok: false, error: 'Kursu yoxlamaq uğursuz oldu' };
    }
    if ((count ?? 0) === 0) {
      return { ok: false, error: 'Ən azı bir dərc edilmiş mövzu olmadan kurs dərc edilə bilməz' };
    }
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) update.title = patch.title.trim();
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.orderIndex !== undefined) update.order_index = patch.orderIndex;
  if (patch.isFree !== undefined) update.is_free = patch.isFree;
  if (patch.unlockPrice !== undefined) update.unlock_price = patch.unlockPrice;
  if (patch.status !== undefined) update.status = patch.status;

  const { error } = await admin.from('lesson_courses').update(update).eq('id', id);

  if (error) {
    console.error('[lessons/courses] updateCourse failed:', error);
    return { ok: false, error: 'Kursu yeniləmək uğursuz oldu' };
  }

  return { ok: true };
}

// Cascades to lesson_topics and, through them, to quiz_questions.topic_id —
// both FKs are `on delete cascade` in 0060. A user's unlock rows cascade too;
// deleting a purchased course is destructive and the UI must confirm it.
export async function deleteCourse(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await createAdminClient().from('lesson_courses').delete().eq('id', id);

  if (error) {
    console.error('[lessons/courses] deleteCourse failed:', error);
    return { ok: false, error: 'Kursu silmək uğursuz oldu' };
  }

  return { ok: true };
}

interface TopicSelectRow {
  id: string;
  course_id: string;
  title: string;
  content: string | null;
  source_citations: TopicCitation[] | null;
  order_index: number;
  status: 'draft' | 'published';
  created_at: string;
  updated_at: string;
}

export async function listCourseTopics(courseId: string): Promise<LessonTopicRow[]> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('lesson_topics')
    .select(TOPIC_COLUMNS)
    .eq('course_id', courseId)
    .order('order_index', { ascending: true })
    .returns<TopicSelectRow[]>();

  if (error || !data) {
    if (isMissingRelationError(error)) return [];
    console.error('[lessons/courses] listCourseTopics failed:', error);
    return [];
  }

  const topicIds = data.map((t) => t.id);
  const questionCounts = new Map<string, { total: number; published: number }>();

  if (topicIds.length > 0) {
    const { data: questions, error: questionsError } = await admin
      .from('quiz_questions')
      .select('topic_id, status')
      .in('topic_id', topicIds);

    if (questionsError && !isMissingRelationError(questionsError)) {
      console.error('[lessons/courses] listCourseTopics question counts failed:', questionsError);
    }

    for (const question of questions ?? []) {
      const topicId = question.topic_id as string;
      const entry = questionCounts.get(topicId) ?? { total: 0, published: 0 };
      entry.total += 1;
      if (question.status === 'published') entry.published += 1;
      questionCounts.set(topicId, entry);
    }
  }

  return data.map((row) => {
    const counts = questionCounts.get(row.id) ?? { total: 0, published: 0 };
    return {
      id: row.id,
      courseId: row.course_id,
      title: row.title,
      content: row.content,
      sourceCitations: row.source_citations ?? [],
      orderIndex: row.order_index,
      status: row.status,
      questionCount: counts.total,
      publishedQuestionCount: counts.published,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
}

export interface CreateTopicInput {
  courseId: string;
  title: string;
  orderIndex: number;
  /** Chunk ids this topic covers — from a ProposedTopic, or hand-picked. */
  chunkIds: string[];
}

// Creates the topic SHELL only: title, order and the chunk citations, with no
// content and no questions. Generation is a separate, explicitly-triggered
// per-topic step (generateTopicMaterial below) precisely so that accepting a
// 20-topic proposal is one fast write, not a 20-minute LLM run inside one
// request.
export async function createTopics(
  inputs: CreateTopicInput[]
): Promise<{ ok: true; topics: LessonTopicRow[] } | { ok: false; error: string }> {
  if (inputs.length === 0) return { ok: true, topics: [] };

  const admin = createAdminClient();

  const chunkIds = [...new Set(inputs.flatMap((i) => i.chunkIds))];
  const chunks = await loadChunksByIds(chunkIds);
  const chunkById = new Map(chunks.map((c) => [c.id, c]));

  const rows = inputs.map((input) => ({
    course_id: input.courseId,
    title: input.title.trim(),
    order_index: input.orderIndex,
    content: null,
    source_citations: buildCitations(
      input.chunkIds
        .map((id) => chunkById.get(id))
        .filter((c): c is TopicSourceChunk => Boolean(c))
    ),
    status: 'draft' as const,
  }));

  const { data, error } = await admin
    .from('lesson_topics')
    .insert(rows)
    .select(TOPIC_COLUMNS)
    .returns<TopicSelectRow[]>();

  if (error || !data) {
    console.error('[lessons/courses] createTopics failed:', error);
    if (isMissingRelationError(error)) {
      return { ok: false, error: 'Kurs cədvəlləri hələ yaradılmayıb (0060 migrasiyası icra edilməyib)' };
    }
    return { ok: false, error: 'Mövzuları yaratmaq uğursuz oldu' };
  }

  return {
    ok: true,
    topics: data.map((row) => ({
      id: row.id,
      courseId: row.course_id,
      title: row.title,
      content: row.content,
      sourceCitations: row.source_citations ?? [],
      orderIndex: row.order_index,
      status: row.status,
      questionCount: 0,
      publishedQuestionCount: 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  };
}

export interface TopicPatch {
  title?: string;
  content?: string | null;
  status?: 'draft' | 'published';
}

// Publishing a topic with no published questions is blocked: its test would
// have nothing to draw from and the topic would be impossible to pass, which
// also permanently blocks every topic after it in the course.
export async function updateTopic(
  id: string,
  patch: TopicPatch
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient();

  if (patch.status === 'published') {
    const { count, error: countError } = await admin
      .from('quiz_questions')
      .select('*', { count: 'exact', head: true })
      .eq('topic_id', id)
      .eq('status', 'published');

    if (countError) {
      console.error('[lessons/courses] publish question count failed:', countError);
      return { ok: false, error: 'Mövzunu yoxlamaq uğursuz oldu' };
    }
    if ((count ?? 0) === 0) {
      return { ok: false, error: 'Dərc edilmiş sual olmadan mövzu dərc edilə bilməz' };
    }
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) update.title = patch.title.trim();
  if (patch.content !== undefined) update.content = patch.content;
  if (patch.status !== undefined) update.status = patch.status;

  const { error } = await admin.from('lesson_topics').update(update).eq('id', id);

  if (error) {
    console.error('[lessons/courses] updateTopic failed:', error);
    return { ok: false, error: 'Mövzunu yeniləmək uğursuz oldu' };
  }

  return { ok: true };
}

export async function deleteTopic(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await createAdminClient().from('lesson_topics').delete().eq('id', id);

  if (error) {
    console.error('[lessons/courses] deleteTopic failed:', error);
    return { ok: false, error: 'Mövzunu silmək uğursuz oldu' };
  }

  return { ok: true };
}

// Goes through the reorder_lesson_topics RPC rather than issuing N updates:
// the unique (course_id, order_index) constraint is DEFERRABLE INITIALLY
// DEFERRED specifically so a permutation can be written inside one
// transaction. N separate PostgREST updates are N transactions and the
// constraint would fire on the first collision.
export async function reorderTopics(
  courseId: string,
  topicIds: string[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await createAdminClient().rpc('reorder_lesson_topics', {
    p_course_id: courseId,
    p_topic_ids: topicIds,
  });

  if (error) {
    console.error('[lessons/courses] reorderTopics failed:', error);
    return { ok: false, error: 'Mövzu sırasını dəyişmək uğursuz oldu' };
  }

  return { ok: true };
}

export interface GenerateTopicMaterialResult {
  ok: true;
  topicId: string;
  contentGenerated: boolean;
  questionsCreated: number;
  /** True when the model returned fewer than TOPIC_POOL_MIN valid questions. */
  belowPoolMinimum: boolean;
  /** Citations that no longer resolve to a chunk row (document re-ingested). */
  missingChunkCount: number;
}

export type GenerateTopicMaterialOutcome =
  | GenerateTopicMaterialResult
  | { ok: false; error: string };

// ONE topic per call. See the header of lib/lessons/generateTopicContent.ts
// for why this must never be batched over a whole document: the caller drives
// a per-topic loop with visible progress, and a failure costs one topic.
//
// Existing generated questions for the topic are DELETED first so a
// regeneration replaces the pool rather than growing it to 40 — but only after
// the new pool is in hand, so a failed generation leaves the old pool intact.
export async function generateTopicMaterial(
  topicId: string,
  createdBy: string
): Promise<GenerateTopicMaterialOutcome> {
  const admin = createAdminClient();

  const { data: topic, error: topicError } = await admin
    .from('lesson_topics')
    .select('id, title, source_citations, status')
    .eq('id', topicId)
    .maybeSingle<{
      id: string;
      title: string;
      source_citations: TopicCitation[] | null;
      status: 'draft' | 'published';
    }>();

  if (topicError || !topic) {
    console.error('[lessons/courses] generateTopicMaterial topic lookup failed:', topicError);
    return { ok: false, error: 'Mövzu tapılmadı' };
  }

  const citations = topic.source_citations ?? [];
  const chunkIds = citations.map((c) => c.chunk_id).filter(Boolean);
  const chunks = await loadChunksByIds(chunkIds);

  if (chunks.length === 0) {
    return { ok: false, error: 'Mövzunun mənbə mətni tapılmadı (sənəd yenidən yüklənib ola bilər)' };
  }

  const missingChunkCount = chunkIds.length - chunks.length;

  // Sequential, not Promise.all: both calls hit the same provider and the
  // free-tier account limits are shared, so firing them together mainly buys a
  // rate-limit rejection. The reading draft is also the more valuable of the
  // two — generating it first means a question-generation failure still leaves
  // the admin something to review.
  const reading = await generateTopicReadingContent(topic.title, chunks);
  const questions = await generateTopicQuestions(topic.title, chunks);

  if (!reading && questions.length === 0) {
    return { ok: false, error: 'Material yaradılmadı — model heç nə qaytarmadı' };
  }

  if (reading && reading.content.trim()) {
    const { error: contentError } = await admin
      .from('lesson_topics')
      .update({
        content: reading.content,
        // The model's suggested title is applied only when it produced one;
        // the admin's own edit is never silently overwritten with a blank.
        ...(reading.title.trim() ? { title: reading.title.trim() } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', topicId);

    if (contentError) {
      console.error('[lessons/courses] topic content write failed:', contentError);
      return { ok: false, error: 'Dərs materialını yadda saxlamaq uğursuz oldu' };
    }
  }

  let questionsCreated = 0;

  if (questions.length > 0) {
    const { error: deleteError } = await admin
      .from('quiz_questions')
      .delete()
      .eq('topic_id', topicId);

    if (deleteError) {
      console.error('[lessons/courses] old question pool delete failed:', deleteError);
      return { ok: false, error: 'Köhnə sual bankını silmək uğursuz oldu' };
    }

    const { data: inserted, error: insertError } = await admin
      .from('quiz_questions')
      .insert(
        questions.map((q) => ({
          topic_id: topicId,
          // quiz_questions.category is NOT NULL and still serves the 0051
          // category-authored bank (app/admin/quiz). Topic-authored questions
          // are not part of that taxonomy, so the topic title is written here
          // as a human-readable placeholder rather than a real category — the
          // topic_id is what the lessons flow reads.
          category: topic.title.slice(0, 200),
          question: q.question,
          options: q.options,
          correct_index: q.correctIndex,
          explanation: q.explanation ?? null,
          status: 'draft' as const,
          source_title: topic.title,
          created_by: createdBy,
        }))
      )
      .select('id');

    if (insertError) {
      console.error('[lessons/courses] question insert failed:', insertError);
      return { ok: false, error: 'Sualları yadda saxlamaq uğursuz oldu' };
    }

    questionsCreated = inserted?.length ?? 0;
  }

  return {
    ok: true,
    topicId,
    contentGenerated: Boolean(reading && reading.content.trim()),
    questionsCreated,
    belowPoolMinimum: questionsCreated < TOPIC_POOL_MIN,
    missingChunkCount,
  };
}

// Bulk publish of a topic's reviewed question pool. Separate from
// updateTopic({ status: 'published' }) because an admin reviews questions and
// the topic body independently, and updateTopic REQUIRES published questions
// to already exist — so this necessarily runs first.
export async function publishTopicQuestions(
  topicId: string
): Promise<{ ok: true; published: number } | { ok: false; error: string }> {
  const { data, error } = await createAdminClient()
    .from('quiz_questions')
    .update({ status: 'published', updated_at: new Date().toISOString() })
    .eq('topic_id', topicId)
    .eq('status', 'draft')
    .select('id');

  if (error) {
    console.error('[lessons/courses] publishTopicQuestions failed:', error);
    return { ok: false, error: 'Sualları dərc etmək uğursuz oldu' };
  }

  return { ok: true, published: data?.length ?? 0 };
}

export interface IngestedDocumentOption {
  id: string;
  title: string;
  chunkCount: number;
  createdAt: string;
}

// The document picker that starts the whole flow: only 'ready' documents are
// offered, since a pending/failed one has no chunks to build topics from.
export async function listIngestedDocuments(): Promise<IngestedDocumentOption[]> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('documents')
    .select('id, title, created_at')
    .eq('status', 'ready')
    .order('created_at', { ascending: false });

  if (error || !data) {
    console.error('[lessons/courses] listIngestedDocuments failed:', error);
    return [];
  }

  // One count query per document is an N+1, but this is an admin-only picker
  // over ~27 documents behind a head-only count (no rows transferred), and the
  // alternative (a dedicated aggregate RPC) is a migration for a page that
  // loads once per course creation. Revisit if the document count grows an
  // order of magnitude.
  const counts = await Promise.all(
    data.map(async (doc) => {
      const { count } = await admin
        .from('chunks')
        .select('*', { count: 'exact', head: true })
        .eq('document_id', doc.id);
      return count ?? 0;
    })
  );

  return data.map((doc, index) => ({
    id: doc.id as string,
    title: doc.title as string,
    chunkCount: counts[index],
    createdAt: doc.created_at as string,
  }));
}
