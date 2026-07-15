'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { submitQuestion } from '@/lib/admin/questions';

export interface SualFormState {
  error?: string;
  success?: string;
}

export async function submitQuestionAction(
  _prevState: SualFormState,
  formData: FormData
): Promise<SualFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: 'Giriş tələb olunur' };

  const rawQuestion = formData.get('question');
  const question = typeof rawQuestion === 'string' ? rawQuestion : '';

  const result = await submitQuestion(user.id, question);

  if (!result.ok) return { error: result.error };

  revalidatePath('/sual');
  return { success: 'Sualınız göndərildi' };
}
