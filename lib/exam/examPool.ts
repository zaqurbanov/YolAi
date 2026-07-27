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

// Same cap and rationale as lib/quiz/topicTest.ts's MAX_FINE_AMOUNT_QUESTIONS
// (see that file and the 0086 migration header) — kept as a separate
// constant since exam size (10) and topic-test size (variable) are unrelated.
const MAX_FINE_AMOUNT_QUESTIONS = 2;

export interface ExamQuestion {
  id: string;
  question: string;
  options: string[];
}

interface PoolRow {
  id: string;
  question: string;
  options: unknown;
  is_fine_amount: boolean;
}

interface PoolQuestion extends ExamQuestion {
  isFineAmount: boolean;
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
    .select('id, question, options, is_fine_amount')
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

  return shuffle(selected).map(({ id, question, options }) => ({ id, question, options }));
}
