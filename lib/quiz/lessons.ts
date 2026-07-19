import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { RULE_CATEGORIES } from '@/lib/content/ruleCategories';

// User-facing reads only — plain RLS-respecting client (createClient), never
// the service-role admin client, since this only ever reads: published
// quiz_questions (public-select RLS policy) and the caller's own
// user_quiz_answers rows (self-select RLS policy). No admin gate needed.

export interface LessonProgress {
  category: string;
  total: number;
  completed: number;
  progressPct: number;
}

// Two queries total regardless of category count (not one query per
// category) — retrieval-adjacent reads like this are still on a
// user-facing page load path, so avoid an N+1 pattern here even though
// today's data volume wouldn't make it painful yet.
export async function getLessons(userId: string): Promise<LessonProgress[]> {
  const supabase = await createClient();

  const [{ data: questions, error: questionsError }, { data: answers, error: answersError }] =
    await Promise.all([
      supabase.from('quiz_questions').select('id, category').eq('status', 'published'),
      supabase.from('user_quiz_answers').select('question_id').eq('user_id', userId),
    ]);

  if (questionsError) {
    console.error('[quiz/lessons] getLessons questions read failed:', questionsError);
  }
  if (answersError) {
    console.error('[quiz/lessons] getLessons answers read failed:', answersError);
  }

  const questionCategoryById = new Map<string, string>();
  const totalByCategory = new Map<string, number>();
  for (const q of questions ?? []) {
    questionCategoryById.set(q.id, q.category);
    totalByCategory.set(q.category, (totalByCategory.get(q.category) ?? 0) + 1);
  }

  const completedByCategory = new Map<string, number>();
  for (const a of answers ?? []) {
    const category = questionCategoryById.get(a.question_id);
    if (!category) continue; // answered question no longer published — don't count it
    completedByCategory.set(category, (completedByCategory.get(category) ?? 0) + 1);
  }

  return RULE_CATEGORIES.map(({ title }) => {
    const total = totalByCategory.get(title) ?? 0;
    const completed = completedByCategory.get(title) ?? 0;
    const progressPct = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { category: title, total, completed, progressPct };
  });
}

export interface LessonQuestion {
  id: string;
  question: string;
  options: string[];
  explanation: string | null;
  answeredCorrectly: boolean;
}

// Deliberately omits correct_index — the frontend must never receive it
// (same "never trust/expose the client-side answer" stance as
// claimDailyQuizReward), grading happens server-side in
// lib/coins/lessonQuiz.ts.
export async function getLessonQuestions(category: string, userId: string): Promise<LessonQuestion[]> {
  const supabase = await createClient();

  const [{ data: questions, error: questionsError }, { data: answers, error: answersError }] =
    await Promise.all([
      supabase
        .from('quiz_questions')
        .select('id, question, options, explanation')
        .eq('status', 'published')
        .eq('category', category)
        .order('created_at', { ascending: true }),
      supabase.from('user_quiz_answers').select('question_id').eq('user_id', userId),
    ]);

  if (questionsError) {
    console.error('[quiz/lessons] getLessonQuestions questions read failed:', questionsError);
    return [];
  }
  if (answersError) {
    console.error('[quiz/lessons] getLessonQuestions answers read failed:', answersError);
  }

  const answeredIds = new Set((answers ?? []).map((a) => a.question_id));

  return (questions ?? []).map((q) => ({
    id: q.id,
    question: q.question,
    options: q.options as string[],
    explanation: q.explanation,
    answeredCorrectly: answeredIds.has(q.id),
  }));
}
