'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { proposeTopicsForDocument, type TopicProposal } from '@/lib/lessons/proposeTopics';
import { aiProposeTopicsForDocument } from '@/lib/lessons/aiProposeTopics';
import {
  previewTopicSplit,
  splitTopic,
  suggestTopicSplit,
  type TopicSplitAdvice,
  type TopicSplitPart,
} from '@/lib/lessons/splitTopic';
import {
  assertDocumentHasChunks,
  createCourse,
  createTopics,
  deleteCourse,
  deleteTopic,
  generateTopicContent,
  generateTopicQuestionPool,
  listCourseTopics,
  listCourses,
  listIngestedDocuments,
  publishTopicQuestions,
  reorderTopics,
  updateCourse,
  updateTopic,
  type CoursePatch,
  type CreateTopicInput,
  type GenerateTopicContentResult,
  type GenerateTopicQuestionsResult,
  type IngestedDocumentOption,
  type LessonCourseRow,
  type LessonTopicRow,
  type TopicPatch,
} from '@/lib/lessons/courses';

// Admin server actions for the lessons content pipeline.
//
// EVERY action below opens with an unconditional `requireAdmin()`. A server
// action is a plain POST endpoint that any client can invoke directly with
// arbitrary arguments — the admin UI never being rendered for a normal user is
// not a gate. This is not hypothetical in this repo: an unauthenticated
// /api/chat was found live for exactly this reason. The check is the FIRST
// statement, never inside an `if`, and everything below it runs with the
// service-role client which bypasses RLS entirely.
//
// No new route.ts is created for any of this. The repo sits at 6 route
// handlers under app/ against a hard budget (Vercel Hobby's 12-function cap
// minus proxy.ts — see CLAUDE.md); server actions cost nothing against it.

export type AdminActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function denied(message: string): { ok: false; error: string } {
  return { ok: false, error: message };
}

export async function listIngestedDocumentsAction(): Promise<
  AdminActionResult<IngestedDocumentOption[]>
> {
  const admin = await requireAdmin();
  if (!admin.ok) return denied(admin.message);

  return { ok: true, data: await listIngestedDocuments() };
}

export async function listCoursesAction(): Promise<AdminActionResult<LessonCourseRow[]>> {
  const admin = await requireAdmin();
  if (!admin.ok) return denied(admin.message);

  return { ok: true, data: await listCourses() };
}

export async function createCourseAction(input: {
  documentId: string;
  title: string;
  description?: string | null;
  orderIndex?: number;
  isFree?: boolean;
  unlockPrice?: number | null;
}): Promise<AdminActionResult<LessonCourseRow>> {
  const admin = await requireAdmin();
  if (!admin.ok) return denied(admin.message);

  const result = await createCourse({ ...input, createdBy: admin.userId });
  if (!result.ok) return denied(result.error);

  revalidatePath('/admin/kurslar');
  revalidatePath('/oyrenme');
  return { ok: true, data: result.course };
}

export async function updateCourseAction(
  courseId: string,
  patch: CoursePatch
): Promise<AdminActionResult<null>> {
  const admin = await requireAdmin();
  if (!admin.ok) return denied(admin.message);

  const result = await updateCourse(courseId, patch);
  if (!result.ok) return denied(result.error);

  revalidatePath('/admin/kurslar');
  revalidatePath('/oyrenme');
  return { ok: true, data: null };
}

export async function deleteCourseAction(courseId: string): Promise<AdminActionResult<null>> {
  const admin = await requireAdmin();
  if (!admin.ok) return denied(admin.message);

  const result = await deleteCourse(courseId);
  if (!result.ok) return denied(result.error);

  revalidatePath('/admin/kurslar');
  revalidatePath('/oyrenme');
  return { ok: true, data: null };
}

// Read-only: proposes topic boundaries from the document's chunks without
// writing anything, so the admin can re-run it freely.
//
// 'ai' (the default) runs the batched outline pass in lib/lessons/
// aiProposeTopics.ts — several small structured LLM calls, so this action is
// the slow one on this page; the admin catch-all page exports maxDuration = 300
// for it. 'deterministic' is the instant mechanical split, kept selectable both
// as an escape hatch and because it is the fallback the AI path degrades to.
// `data.source` tells the UI which one actually produced the result.
//
// AN EMPTY PROPOSAL IS A FAILURE HERE even though proposeTopicsForDocument
// returning `{ topics: [] }` for a chunk-less document is honest at its own
// layer. Returning ok:true with zero topics is what made the propose button
// silently vanish with nothing in its place — three 'ready' documents in the
// live DB have no chunk rows at all.
export async function proposeTopicsAction(
  documentId: string,
  strategy: 'ai' | 'deterministic' = 'ai'
): Promise<AdminActionResult<TopicProposal>> {
  const admin = await requireAdmin();
  if (!admin.ok) return denied(admin.message);

  const hasChunks = await assertDocumentHasChunks(documentId);
  if (!hasChunks.ok) return denied(hasChunks.error);

  const proposal =
    strategy === 'deterministic'
      ? await proposeTopicsForDocument(documentId)
      : await aiProposeTopicsForDocument(documentId);

  if (!proposal) return denied('Sənəd və ya onun mətn hissələri tapılmadı');

  if (proposal.topics.length === 0) {
    return denied('Bu sənəddə mətn hissəsi yoxdur — sənəd yenidən ingest edilməlidir');
  }

  return { ok: true, data: proposal };
}

// Persists the admin-adjusted proposal as DRAFT topic shells — titles, order
// and source citations only. Fast, one insert, no LLM. Content and questions
// come afterwards, one topic at a time, via generateTopicContentAction /
// generateTopicQuestionsAction.
export async function createTopicsAction(
  inputs: CreateTopicInput[]
): Promise<AdminActionResult<LessonTopicRow[]>> {
  const admin = await requireAdmin();
  if (!admin.ok) return denied(admin.message);

  const result = await createTopics(inputs);
  if (!result.ok) return denied(result.error);

  revalidatePath('/admin/kurslar');
  return { ok: true, data: result.topics };
}

export async function listCourseTopicsAction(
  courseId: string
): Promise<AdminActionResult<LessonTopicRow[]>> {
  const admin = await requireAdmin();
  if (!admin.ok) return denied(admin.message);

  return { ok: true, data: await listCourseTopics(courseId) };
}

// ONE TOPIC PER CALL, and content and questions are now TWO calls.
//
// The frontend drives the loop and renders progress; generating a whole
// document in one action would exceed Vercel's maxDuration (300s ceiling on
// Hobby) and lose every topic already generated. Do not add a "generate all"
// action that wraps these in a server-side loop — the loop belongs on the
// client precisely so each topic commits independently and a failure is
// resumable.
//
// The former combined generateTopicMaterialAction is GONE. The client sequences
// generateTopicContentAction then generateTopicQuestionsAction, which is what
// makes "Suallar yarat" a per-topic button in its own right and makes a
// question failure reportable without discarding a successful content draft.
export async function generateTopicContentAction(
  topicId: string
): Promise<AdminActionResult<GenerateTopicContentResult>> {
  const admin = await requireAdmin();
  if (!admin.ok) return denied(admin.message);

  const result = await generateTopicContent(topicId);
  if (!result.ok) return denied(result.error);

  revalidatePath('/admin/kurslar');
  return { ok: true, data: result };
}

// Replaces the topic's DRAFT question pool. Published questions are never
// touched by this path — see generateTopicQuestionPool.
export async function generateTopicQuestionsAction(
  topicId: string
): Promise<AdminActionResult<GenerateTopicQuestionsResult>> {
  const admin = await requireAdmin();
  if (!admin.ok) return denied(admin.message);

  const result = await generateTopicQuestionPool(topicId, admin.userId);
  if (!result.ok) return denied(result.error);

  revalidatePath('/admin/kurslar');
  return { ok: true, data: result };
}

// Split advice: one cheap structured LLM call, non-destructive, re-runnable.
export async function suggestTopicSplitAction(
  topicId: string
): Promise<AdminActionResult<TopicSplitAdvice>> {
  const admin = await requireAdmin();
  if (!admin.ok) return denied(admin.message);

  const result = await suggestTopicSplit(topicId);
  if (!result.ok) return denied(result.error);

  return { ok: true, data: result.advice };
}

// Recomputes the seams at the admin's chosen count. No LLM, no writes — safe to
// call on every change of a part-count control.
export async function previewTopicSplitAction(
  topicId: string,
  partCount: number
): Promise<AdminActionResult<TopicSplitPart[]>> {
  const admin = await requireAdmin();
  if (!admin.ok) return denied(admin.message);

  const result = await previewTopicSplit(topicId, partCount);
  if (!result.ok) return denied(result.error);

  return { ok: true, data: result.parts };
}

// Destructive. Replaces the topic with `partCount` DRAFT parts (content = null,
// the parent's draft questions cascade away with it) and reflows the course's
// order_index. Refuses a published topic. Returns the course's full refreshed
// topic list so the UI can replace its state wholesale.
export async function splitTopicAction(
  topicId: string,
  partCount: number
): Promise<AdminActionResult<LessonTopicRow[]>> {
  const admin = await requireAdmin();
  if (!admin.ok) return denied(admin.message);

  const result = await splitTopic(topicId, partCount);
  if (!result.ok) return denied(result.error);

  revalidatePath('/admin/kurslar');
  revalidatePath('/oyrenme');
  return { ok: true, data: result.topics };
}

export async function updateTopicAction(
  topicId: string,
  patch: TopicPatch
): Promise<AdminActionResult<null>> {
  const admin = await requireAdmin();
  if (!admin.ok) return denied(admin.message);

  const result = await updateTopic(topicId, patch);
  if (!result.ok) return denied(result.error);

  revalidatePath('/admin/kurslar');
  revalidatePath('/oyrenme');
  return { ok: true, data: null };
}

export async function deleteTopicAction(topicId: string): Promise<AdminActionResult<null>> {
  const admin = await requireAdmin();
  if (!admin.ok) return denied(admin.message);

  const result = await deleteTopic(topicId);
  if (!result.ok) return denied(result.error);

  revalidatePath('/admin/kurslar');
  revalidatePath('/oyrenme');
  return { ok: true, data: null };
}

export async function reorderTopicsAction(
  courseId: string,
  topicIds: string[]
): Promise<AdminActionResult<null>> {
  const admin = await requireAdmin();
  if (!admin.ok) return denied(admin.message);

  const result = await reorderTopics(courseId, topicIds);
  if (!result.ok) return denied(result.error);

  revalidatePath('/admin/kurslar');
  return { ok: true, data: null };
}

// Publishes the whole reviewed pool for one topic. Must run BEFORE
// updateTopicAction({ status: 'published' }), which refuses to publish a topic
// that has no published questions.
export async function publishTopicQuestionsAction(
  topicId: string
): Promise<AdminActionResult<{ published: number }>> {
  const admin = await requireAdmin();
  if (!admin.ok) return denied(admin.message);

  const result = await publishTopicQuestions(topicId);
  if (!result.ok) return denied(result.error);

  revalidatePath('/admin/kurslar');
  return { ok: true, data: { published: result.published } };
}
