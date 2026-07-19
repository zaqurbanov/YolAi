'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/requireAdmin';
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

export async function deleteQuestionAction(id: string): Promise<QuizActionResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return { ok: false, error: admin.message };

  const result = await deleteQuestion(id);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath('/admin/quiz');
  return { ok: true };
}
