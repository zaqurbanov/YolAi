import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { logError } from '@/lib/logging/logError';

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
  isFineAmount: boolean;
  /** True only for hand-authored questions in the Rəsmi İmtahan pool (0092). */
  isExam: boolean;
  /** Storage path (not URL) of the illustration above the question, or null. */
  imagePath: string | null;
  /**
   * 4-element array positionally aligned with `options`; entry i is answer i's
   * picture path, or null. `null` (rather than [null,null,null,null]) when the
   * question has no answer images at all.
   */
  optionImagePaths: (string | null)[] | null;
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
  is_fine_amount: boolean;
  is_exam: boolean;
  image_path: string | null;
  option_image_paths: unknown;
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
    isFineAmount: row.is_fine_amount,
    isExam: Boolean(row.is_exam),
    imagePath: row.image_path ?? null,
    optionImagePaths:
      Array.isArray(row.option_image_paths) && row.option_image_paths.length === 4
        ? row.option_image_paths.map((entry) =>
            typeof entry === 'string' && entry ? entry : null
          )
        : null,
  };
}

const SELECT_COLUMNS =
  'id, category, question, options, correct_index, explanation, status, source_title, created_by, created_at, updated_at, is_fine_amount, is_exam, image_path, option_image_paths';

export async function listQuestions(status?: 'draft' | 'published'): Promise<QuizQuestionRow[]> {
  let query = createAdminClient()
    .from('quiz_questions')
    .select(SELECT_COLUMNS)
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);

  const { data, error } = await query.returns<QuizQuestionsSelectRow[]>();

  if (error || !data) {
    void logError('admin.quizQuestions.list', error);
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
  isFineAmount?: boolean;
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
        is_fine_amount: row.isFineAmount ?? false,
      }))
    )
    .select(SELECT_COLUMNS)
    .returns<QuizQuestionsSelectRow[]>();

  if (error || !data) {
    void logError('admin.quizQuestions.createDrafts', error);
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
  isFineAmount?: boolean;
  isExam?: boolean;
  /** Storage path, or null to clear the question illustration. */
  imagePath?: string | null;
  /** 4-element path array, or null to clear all answer images. */
  optionImagePaths?: (string | null)[] | null;
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
  if (patch.isFineAmount !== undefined) update.is_fine_amount = patch.isFineAmount;
  if (patch.isExam !== undefined) update.is_exam = patch.isExam;
  if (patch.imagePath !== undefined) update.image_path = patch.imagePath;
  if (patch.optionImagePaths !== undefined) {
    // Collapse an all-null array back to NULL so "no answer images" has one
    // representation in the DB rather than two — examPool's parser treats them
    // identically, but a stored [null,null,null,null] would make the admin UI
    // and any future query need to handle both.
    const paths = patch.optionImagePaths;
    update.option_image_paths =
      paths && paths.some((entry) => entry != null) ? paths : null;
  }

  const { data, error } = await createAdminClient()
    .from('quiz_questions')
    .update(update)
    .eq('id', id)
    .select(SELECT_COLUMNS)
    .single<QuizQuestionsSelectRow>();

  if (error || !data) {
    void logError('admin.quizQuestions.update', error, { details: { questionId: id } });
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
    void logError('admin.quizQuestions.publish', error, { details: { questionId: id } });
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
    void logError('admin.quizQuestions.delete', error, { details: { questionId: id } });
    console.error('[admin/quizQuestions] deleteQuestion failed:', error);
    return { ok: false, error: 'Sualı silmək uğursuz oldu' };
  }

  return { ok: true };
}

export interface NewQuestionInput {
  question: string;
  options: string[];
  correctIndex: number;
  category: string;
  explanation?: string | null;
  /** Defaults true — this path exists precisely to author exam questions. */
  isExam?: boolean;
  isFineAmount?: boolean;
}

/**
 * Creates ONE hand-authored question. Distinct from createDraftQuestions,
 * which ingests an LLM batch extracted from a PDF: this is the admin typing a
 * question themselves, which is now the only way anything reaches the Rəsmi
 * İmtahan pool (see 0092).
 *
 * Inserted as `draft` like every other question — publishing stays a separate,
 * deliberate action, so a half-typed question can never appear in a live exam.
 */
export async function createQuestion(
  input: NewQuestionInput,
  createdBy: string | null
): Promise<{ ok: true; question: QuizQuestionRow } | { ok: false; error: string }> {
  const question = input.question.trim();
  if (!question) return { ok: false, error: 'Sual mətni boş ola bilməz' };

  const options = input.options.map((option) => option.trim());
  if (options.length !== 4 || options.some((option) => !option)) {
    return { ok: false, error: 'Hər sualın dolu 4 variantı olmalıdır' };
  }
  if (
    !Number.isInteger(input.correctIndex) ||
    input.correctIndex < 0 ||
    input.correctIndex > 3
  ) {
    return { ok: false, error: 'Düzgün cavab 0-3 aralığında olmalıdır' };
  }

  const { data, error } = await createAdminClient()
    .from('quiz_questions')
    .insert({
      question,
      options,
      correct_index: input.correctIndex,
      category: input.category,
      explanation: input.explanation?.trim() || null,
      status: 'draft',
      is_exam: input.isExam ?? true,
      is_fine_amount: input.isFineAmount ?? false,
      created_by: createdBy,
    })
    .select(SELECT_COLUMNS)
    .single<QuizQuestionsSelectRow>();

  if (error || !data) {
    void logError('admin.quizQuestions.create', error);
    console.error('[admin/quizQuestions] createQuestion failed:', error);
    return { ok: false, error: 'Sualı yaratmaq uğursuz oldu' };
  }

  return { ok: true, question: mapRow(data) };
}
