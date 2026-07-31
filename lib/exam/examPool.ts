import 'server-only';
import { randomInt } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { isMissingRelationError } from '@/lib/supabase/missingRelation';
import { logError } from '@/lib/logging/logError';

// Question pool for "Sınaq İmtahanı" (exam simulator) — unlike
// lib/quiz/topicTest.ts's readPool(), this draws from the FULL published
// quiz_questions pool across ALL topics (no topic_id filter), since the whole
// point of this feature is an all-topics-mixed mock exam. Only
// `id, question, options` are selected — correct_index is never read here,
// mirroring topicTest.ts's readPool() exactly (it is read separately, later
// and narrower, in lib/exam/examSession.ts, and never returned to a caller).

const QUESTIONS_PER_EXAM = 10;

/** Public bucket created in 0090_exam_question_images.sql. */
export const EXAM_IMAGE_BUCKET = 'exam-images';

// Same cap and rationale as lib/quiz/topicTest.ts's MAX_FINE_AMOUNT_QUESTIONS
// (see that file and the 0086 migration header) — kept as a separate
// constant since exam size (10) and topic-test size (variable) are unrelated.
const MAX_FINE_AMOUNT_QUESTIONS = 2;

export interface ExamQuestion {
  id: string;
  question: string;
  options: string[];
  /** Public URL of the illustration shown above the question, or null. */
  imageUrl: string | null;
  /**
   * Positionally aligned with `options` — entry i is the picture for answer i,
   * or null. Always length 4 when present so the renderer can index it
   * directly; null (not an array of nulls) when the question has no answer
   * images at all, which is the common case.
   */
  optionImageUrls: (string | null)[] | null;
}

interface PoolRow {
  id: string;
  question: string;
  options: unknown;
  is_fine_amount: boolean;
  image_path: string | null;
  option_image_paths: unknown;
}

interface PoolQuestion extends ExamQuestion {
  isFineAmount: boolean;
}

// Storage paths are stored, not URLs (see 0090's header) — resolved to public
// URLs here, at the single point where question rows become client-facing
// data, so nothing downstream has to know the bucket name.
export function examImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const { data } = createAdminClient().storage.from(EXAM_IMAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl || null;
}

// Tolerant by design: a row whose option_image_paths is malformed (wrong
// length, wrong type) degrades to a normal text-only question instead of
// dropping the question from the pool or throwing mid-exam. The DB constraint
// in 0090 already rejects the wrong length on write; this guards rows written
// before it, or by hand.
function parseOptionImageUrls(raw: unknown): (string | null)[] | null {
  if (!Array.isArray(raw) || raw.length !== 4) return null;
  const urls = raw.map((entry) => (typeof entry === 'string' && entry ? examImageUrl(entry) : null));
  return urls.some((url) => url !== null) ? urls : null;
}

// Fisher-Yates using crypto randomInt — copied verbatim from
// lib/coins/signSpeed.ts's shuffle().
function shuffle<T>(items: T[]): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export async function drawExamQuestions(): Promise<ExamQuestion[] | null> {
  const { data, error } = await createAdminClient()
    .from('quiz_questions')
    .select('id, question, options, is_fine_amount, image_path, option_image_paths')
    .eq('status', 'published')
    .returns<PoolRow[]>();

  if (error) {
    if (!isMissingRelationError(error)) {
      void logError('exam.examPool.poolRead', error);
      console.error('[exam/examPool] pool read failed:', error);
    }
    return null;
  }

  // A malformed row (options not an array of 4) is dropped rather than
  // rendered as a broken question; it simply shrinks the effective pool.
  const pool: PoolQuestion[] = (data ?? []).flatMap((row) => {
    if (!Array.isArray(row.options) || row.options.length !== 4) return [];
    return [
      {
        id: row.id,
        question: row.question,
        options: row.options.map((option) => String(option)),
        imageUrl: examImageUrl(row.image_path),
        optionImageUrls: parseOptionImageUrls(row.option_image_paths),
        isFineAmount: Boolean(row.is_fine_amount),
      },
    ];
  });

  // Guard is against the TOTAL pool size, same as before splitting — a
  // fine-amount-heavy corpus should not spuriously fail this check just
  // because the normal side alone is thin (the draw below backfills).
  if (pool.length < QUESTIONS_PER_EXAM) return null;

  const fineAmount = shuffle(pool.filter((q) => q.isFineAmount));
  const normal = shuffle(pool.filter((q) => !q.isFineAmount));

  const fineAmountTake = Math.min(MAX_FINE_AMOUNT_QUESTIONS, fineAmount.length);
  const normalTake = Math.min(normal.length, QUESTIONS_PER_EXAM - fineAmountTake);

  const selected = [...fineAmount.slice(0, fineAmountTake), ...normal.slice(0, normalTake)];

  if (selected.length < QUESTIONS_PER_EXAM) {
    const shortfall = QUESTIONS_PER_EXAM - selected.length;
    selected.push(...fineAmount.slice(fineAmountTake, fineAmountTake + shortfall));
  }

  return shuffle(selected).map(({ id, question, options, imageUrl, optionImageUrls }) => ({
    id,
    question,
    options,
    imageUrl,
    optionImageUrls,
  }));
}
