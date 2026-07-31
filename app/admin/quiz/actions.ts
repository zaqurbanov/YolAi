'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { createAdminClient } from '@/lib/supabase/admin';
import { logError } from '@/lib/logging/logError';
import { EXAM_IMAGE_BUCKET, examImageUrl } from '@/lib/exam/examPool';
import {
  updateQuestion,
  publishQuestion,
  deleteQuestion,
  type QuestionPatch,
} from '@/lib/admin/quizQuestions';

// Plain typed-arg async functions, not the useActionState `(prevState,
// formData) => Promise<State>` shape used by app/admin/questions/actions.ts
// — that shape fits a single page-level <form>, but these actions are
// naturally called per-question-card from a client component (edit/publish/
// delete on one card among many), where passing typed args directly from
// an onClick handler is a cleaner fit than serializing through FormData.
// Document this here since it diverges from the sibling admin actions file.

export interface QuizActionResult {
  ok: boolean;
  error?: string;
}

export async function updateQuestionAction(
  id: string,
  patch: QuestionPatch
): Promise<QuizActionResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return { ok: false, error: admin.message };

  const result = await updateQuestion(id, patch);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath('/admin/quiz');
  return { ok: true };
}

export async function publishQuestionAction(id: string): Promise<QuizActionResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return { ok: false, error: admin.message };

  const result = await publishQuestion(id);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath('/admin/quiz');
  revalidatePath('/oyrenme');
  return { ok: true };
}

// Image upload for exam questions (0090_exam_question_images.sql). The file
// never reaches Storage from the browser: the `exam-images` bucket has no
// insert policy for `authenticated` at all, so writes are only possible
// through this requireAdmin()-gated action using the service-role client.
//
// FormData rather than typed args (unlike the sibling actions above) because a
// File cannot be passed any other way; it is the same shape
// app/admin/documents' upload path already uses.
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export interface ImageUploadResult {
  ok: boolean;
  /** Storage path to persist on the question row (not a URL). */
  path?: string;
  url?: string;
  error?: string;
}

export async function uploadQuestionImageAction(formData: FormData): Promise<ImageUploadResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return { ok: false, error: admin.message };

  const file = formData.get('file');
  const questionId = formData.get('questionId');
  if (!(file instanceof File) || typeof questionId !== 'string' || !questionId) {
    return { ok: false, error: 'Fayl və ya sual seçilməyib' };
  }
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return { ok: false, error: 'Yalnız PNG, JPEG və ya WebP yükləmək olar' };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, error: 'Şəkil 4 MB-dan böyük olmamalıdır' };
  }

  // `slot` is 'question' or '0'..'3' (an answer index). Included in the path so
  // one question's five possible images never collide, and so a re-upload to
  // the same slot is a clean overwrite rather than an orphaned file.
  const rawSlot = formData.get('slot');
  const slot =
    rawSlot === 'question' || (typeof rawSlot === 'string' && /^[0-3]$/.test(rawSlot))
      ? rawSlot
      : null;
  if (slot === null) return { ok: false, error: 'Yanlış şəkil sahəsi' };

  const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${questionId}/${slot}.${extension}`;

  const supabase = createAdminClient();
  const { error } = await supabase.storage
    .from(EXAM_IMAGE_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });

  if (error) {
    void logError('admin.quiz.uploadQuestionImage', error, { details: { questionId, slot } });
    return { ok: false, error: 'Şəkli yükləmək uğursuz oldu' };
  }

  revalidatePath('/admin/quiz');
  return { ok: true, path, url: examImageUrl(path) ?? undefined };
}

export async function deleteQuestionAction(id: string): Promise<QuizActionResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return { ok: false, error: admin.message };

  const result = await deleteQuestion(id);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath('/admin/quiz');
  return { ok: true };
}
