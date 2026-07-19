import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

// Admin CRUD for the LLM-drafted lesson-quiz question bank. Same fail-closed
// posture as lib/admin/questions.ts: every write goes through the
// service-role client and returns a discriminated union, never throws.

export interface QuizQuestionRow {
  id: string;
  category: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string | null;
  status: 'draft' | 'published';
  sourceTitle: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface QuizQuestionsSelectRow {
  id: string;
  category: string;
  question: string;
  options: string[];
  correct_index: number;
  explanation: string | null;
  status: 'draft' | 'published';
  source_title: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

function mapRow(row: QuizQuestionsSelectRow): QuizQuestionRow {
  return {
    id: row.id,
    category: row.category,
    question: row.question,
    options: row.options,
    correctIndex: row.correct_index,
    explanation: row.explanation,
    status: row.status,
    sourceTitle: row.source_title,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_COLUMNS =
  'id, category, question, options, correct_index, explanation, status, source_title, created_by, created_at, updated_at';

export async function listQuestions(status?: 'draft' | 'published'): Promise<QuizQuestionRow[]> {
  let query = createAdminClient()
    .from('quiz_questions')
    .select(SELECT_COLUMNS)
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);

  const { data, error } = await query.returns<QuizQuestionsSelectRow[]>();

  if (error || !data) {
    console.error('[admin/quizQuestions] listQuestions failed:', error);
    return [];
  }

  return data.map(mapRow);
}

export interface DraftQuestionInput {
  question: string;
  options: string[];
  correctIndex: number;
  category: string;
  explanation?: string;
  sourceTitle: string;
  createdBy: string;
}

// options.length !== 4 or an out-of-range correctIndex is rejected here in
// TS rather than relying solely on the DB check constraint, so a bad draft
// batch fails as a whole with a clear error instead of a partial insert
// followed by an opaque Postgres constraint-violation message.
export async function createDraftQuestions(
  rows: DraftQuestionInput[]
): Promise<{ ok: true; questions: QuizQuestionRow[] } | { ok: false; error: string }> {
  if (rows.length === 0) return { ok: true, questions: [] };

  for (const row of rows) {
    if (row.options.length !== 4) {
      return { ok: false, error: 'Hər sualın dəqiq 4 variantı olmalıdır' };
    }
    if (row.correctIndex < 0 || row.correctIndex > 3) {
      return { ok: false, error: 'correctIndex 0-3 aralığında olmalıdır' };
    }
  }

  const { data, error } = await createAdminClient()
    .from('quiz_questions')
    .insert(
      rows.map((row) => ({
        category: row.category,
        question: row.question,
        options: row.options,
        correct_index: row.correctIndex,
        explanation: row.explanation ?? null,
        status: 'draft' as const,
        source_title: row.sourceTitle,
        created_by: row.createdBy,
      }))
    )
    .select(SELECT_COLUMNS)
    .returns<QuizQuestionsSelectRow[]>();

  if (error || !data) {
    console.error('[admin/quizQuestions] createDraftQuestions failed:', error);
    return { ok: false, error: 'Sual layihələrini yaratmaq uğursuz oldu' };
  }

  return { ok: true, questions: data.map(mapRow) };
}

export interface QuestionPatch {
  question?: string;
  options?: string[];
  correctIndex?: number;
  category?: string;
  explanation?: string | null;
}

export async function updateQuestion(
  id: string,
  patch: QuestionPatch
): Promise<{ ok: true; question: QuizQuestionRow } | { ok: false; error: string }> {
  if (patch.options && patch.options.length !== 4) {
    return { ok: false, error: 'Hər sualın dəqiq 4 variantı olmalıdır' };
  }
  if (
    patch.correctIndex !== undefined &&
    (patch.correctIndex < 0 || patch.correctIndex > 3)
  ) {
    return { ok: false, error: 'correctIndex 0-3 aralığında olmalıdır' };
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.question !== undefined) update.question = patch.question;
  if (patch.options !== undefined) update.options = patch.options;
  if (patch.correctIndex !== undefined) update.correct_index = patch.correctIndex;
  if (patch.category !== undefined) update.category = patch.category;
  if (patch.explanation !== undefined) update.explanation = patch.explanation;

  const { data, error } = await createAdminClient()
    .from('quiz_questions')
    .update(update)
    .eq('id', id)
    .select(SELECT_COLUMNS)
    .single<QuizQuestionsSelectRow>();

  if (error || !data) {
    console.error('[admin/quizQuestions] updateQuestion failed:', error);
    return { ok: false, error: 'Sualı yeniləmək uğursuz oldu' };
  }

  return { ok: true, question: mapRow(data) };
}

export async function publishQuestion(
  id: string
): Promise<{ ok: true; question: QuizQuestionRow } | { ok: false; error: string }> {
  const { data, error } = await createAdminClient()
    .from('quiz_questions')
    .update({ status: 'published', updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(SELECT_COLUMNS)
    .single<QuizQuestionsSelectRow>();

  if (error || !data) {
    console.error('[admin/quizQuestions] publishQuestion failed:', error);
    return { ok: false, error: 'Sualı dərc etmək uğursuz oldu' };
  }

  return { ok: true, question: mapRow(data) };
}

export async function deleteQuestion(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await createAdminClient().from('quiz_questions').delete().eq('id', id);

  if (error) {
    console.error('[admin/quizQuestions] deleteQuestion failed:', error);
    return { ok: false, error: 'Sualı silmək uğursuz oldu' };
  }

  return { ok: true };
}
