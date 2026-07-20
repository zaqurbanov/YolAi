'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { proposeTopicsForDocument, type TopicProposal } from '@/lib/lessons/proposeTopics';
import {
  createCourse,
  createTopics,
  deleteCourse,
  deleteTopic,
  generateTopicMaterial,
  listCourseTopics,
  listCourses,
  listIngestedDocuments,
  publishTopicQuestions,
  reorderTopics,
  updateCourse,
  updateTopic,
  type CoursePatch,
  type CreateTopicInput,
  type GenerateTopicMaterialResult,
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

// Read-only and deterministic: proposes boundaries from the document's chunks
// without writing anything or calling an LLM, so the admin can re-run it while
// adjusting without side effects.
export async function proposeTopicsAction(
  documentId: string
): Promise<AdminActionResult<TopicProposal>> {
  const admin = await requireAdmin();
  if (!admin.ok) return denied(admin.message);

  const proposal = await proposeTopicsForDocument(documentId);
  if (!proposal) return denied('Sənəd və ya onun mətn hissələri tapılmadı');

  return { ok: true, data: proposal };
}

// Persists the admin-adjusted proposal as DRAFT topic shells — titles, order
// and source citations only. Fast, one insert, no LLM. Content and questions
// come afterwards, one topic at a time, via generateTopicMaterialAction.
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

// ONE TOPIC PER CALL. The frontend drives the loop and renders progress;
// generating a whole document in one action would exceed Vercel's maxDuration
// (300s ceiling on Hobby) and lose every topic already generated. Do not add a
// "generate all" action that wraps this in a server-side loop — the loop
// belongs on the client precisely so each topic commits independently and a
// failure is resumable.
export async function generateTopicMaterialAction(
  topicId: string
): Promise<AdminActionResult<GenerateTopicMaterialResult>> {
  const admin = await requireAdmin();
  if (!admin.ok) return denied(admin.message);

  const result = await generateTopicMaterial(topicId, admin.userId);
  if (!result.ok) return denied(result.error);

  revalidatePath('/admin/kurslar');
  return { ok: true, data: result };
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
