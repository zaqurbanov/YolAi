'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { answerQuestion } from '@/lib/admin/questions';

export interface AdminQuestionsFormState {
  error?: string;
  success?: string;
}

export async function answerQuestionAction(
  _prevState: AdminQuestionsFormState,
  formData: FormData
): Promise<AdminQuestionsFormState> {
  const admin = await requireAdmin();
  if (!admin.ok) return { error: admin.message };

  const rawQuestionId = formData.get('questionId');
  const rawAnswer = formData.get('answer');

  const questionId = typeof rawQuestionId === 'string' ? rawQuestionId.trim() : '';
  const answer = typeof rawAnswer === 'string' ? rawAnswer : '';

  if (!questionId) return { error: 'Sual tapılmadı' };

  const result = await answerQuestion(questionId, answer, admin.userId);

  if (!result.ok) return { error: result.error };

  revalidatePath('/admin/questions');
  return { success: 'Cavab göndərildi' };
}
