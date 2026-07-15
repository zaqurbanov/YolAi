import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

// User -> admin "Sual-cavab" (Q&A) feature. Same fail-closed posture as
// lib/coins/transfers.ts: every write goes through the service-role client
// and returns a discriminated union, never throws.

const MAX_QUESTION_LENGTH = 4000;

export interface UserQuestionRow {
  id: string;
  question: string;
  answer: string | null;
  answeredAt: string | null;
  createdAt: string;
}

export interface AdminQuestionRow extends UserQuestionRow {
  userId: string;
  answeredBy: string | null;
}

interface AdminQuestionsSelectRow {
  id: string;
  user_id: string;
  question: string;
  answer: string | null;
  answered_at: string | null;
  answered_by: string | null;
  created_at: string;
}

export async function submitQuestion(
  userId: string,
  question: string
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const trimmed = question.trim();
  if (!trimmed) return { ok: false, error: 'Sual boş ola bilməz' };
  if (trimmed.length > MAX_QUESTION_LENGTH) {
    return { ok: false, error: `Sual ${MAX_QUESTION_LENGTH} simvoldan uzun ola bilməz` };
  }

  const { data, error } = await createAdminClient()
    .from('admin_questions')
    .insert({ user_id: userId, question: trimmed })
    .select('id')
    .single<{ id: string }>();

  if (error || !data) {
    console.error('[admin/questions] submitQuestion failed:', error);
    return { ok: false, error: 'Sual göndərilərkən xəta baş verdi' };
  }

  return { ok: true, id: data.id };
}

export async function getUserQuestions(userId: string): Promise<UserQuestionRow[]> {
  const { data, error } = await createAdminClient()
    .from('admin_questions')
    .select('id, question, answer, answered_at, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .returns<Omit<AdminQuestionsSelectRow, 'user_id' | 'answered_by'>[]>();

  if (error || !data) {
    console.error('[admin/questions] getUserQuestions failed:', error);
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    question: row.question,
    answer: row.answer,
    answeredAt: row.answered_at,
    createdAt: row.created_at,
  }));
}

// Unanswered first, then newest first — cheap ordering off
// admin_questions_answered_at_idx, no need for a bespoke query per admin
// (this table's expected volume doesn't warrant pagination yet).
export async function getAllQuestions(): Promise<AdminQuestionRow[]> {
  const { data, error } = await createAdminClient()
    .from('admin_questions')
    .select('id, user_id, question, answer, answered_at, answered_by, created_at')
    .order('answered_at', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: false })
    .returns<AdminQuestionsSelectRow[]>();

  if (error || !data) {
    console.error('[admin/questions] getAllQuestions failed:', error);
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    userId: row.user_id,
    question: row.question,
    answer: row.answer,
    answeredAt: row.answered_at,
    answeredBy: row.answered_by,
    createdAt: row.created_at,
  }));
}

// Sets answer/answered_at/answered_by, then inserts a plain notification for
// the asking user. Non-transactional by explicit product decision (unlike
// the coin-transfer notification, which is folded into transfer_coins
// itself) — there's no race here worth paying for atomicity.
export async function answerQuestion(
  questionId: string,
  answer: string,
  adminUserId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const trimmed = answer.trim();
  if (!trimmed) return { ok: false, error: 'Cavab boş ola bilməz' };
  if (trimmed.length > MAX_QUESTION_LENGTH) {
    return { ok: false, error: `Cavab ${MAX_QUESTION_LENGTH} simvoldan uzun ola bilməz` };
  }

  const admin = createAdminClient();

  const { data: existing, error: fetchError } = await admin
    .from('admin_questions')
    .select('user_id')
    .eq('id', questionId)
    .single<{ user_id: string }>();

  if (fetchError || !existing) {
    console.error('[admin/questions] answerQuestion lookup failed:', fetchError);
    return { ok: false, error: 'Sual tapılmadı' };
  }

  const { error: updateError } = await admin
    .from('admin_questions')
    .update({
      answer: trimmed,
      answered_at: new Date().toISOString(),
      answered_by: adminUserId,
    })
    .eq('id', questionId);

  if (updateError) {
    console.error('[admin/questions] answerQuestion update failed:', updateError);
    return { ok: false, error: 'Cavab yadda saxlanılarkən xəta baş verdi' };
  }

  const { error: notifyError } = await admin.from('notifications').insert({
    user_id: existing.user_id,
    message: 'Sualınıza cavab verildi',
    link: '/sual',
  });

  if (notifyError) {
    // Answer itself already saved successfully — a failed notification
    // insert is logged, not surfaced as an overall failure to the admin.
    console.error('[admin/questions] answerQuestion notification insert failed:', notifyError);
  }

  return { ok: true };
}
