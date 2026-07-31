import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { isMissingRelationError } from '@/lib/supabase/missingRelation';

/**
 * Read-only summary of a user's graded exam attempts, for the /imtahan landing
 * screen's result badge and stats.
 *
 * Every figure comes from settled exam_sessions rows (0082/0091).
 *
 * Display-only path: fails OPEN to an empty summary, per the app-wide split
 * where read-only surfaces degrade quietly and only coin-granting paths fail
 * closed.
 */
export interface CategoryCompetency {
  category: string;
  /** Questions answered in this category across all counted attempts. */
  answered: number;
  correct: number;
  /** 0-100. */
  percent: number;
}

export interface ExamHistorySummary {
  /** Graded attempts. 0 means the user has never finished an exam. */
  attempts: number;
  /** Most recent graded attempt, or null. */
  lastScore: number | null;
  lastTotal: number | null;
  /** Highest score across all graded attempts, or null. */
  bestScore: number | null;
  /** Most recent attempts, newest first, capped. */
  recent: { score: number; total: number; at: string }[];
  /**
   * Per-category accuracy, strongest first. Built ONLY from attempts that have
   * a stored per-question `answers` array (0091) — i.e. exams taken through
   * /imtahan's answer-then-lock flow. The games-section simulator never calls
   * answer_exam_question, so its sessions carry no per-question record and are
   * skipped rather than guessed at.
   */
  competency: CategoryCompetency[];
}

const EMPTY: ExamHistorySummary = {
  attempts: 0,
  lastScore: null,
  lastTotal: null,
  bestScore: null,
  recent: [],
  competency: [],
};

const RECENT_LIMIT = 5;
// Caps the competency computation. Beyond this the picture stops changing and
// the id set handed to the category lookup would grow without bound.
const COMPETENCY_SESSION_LIMIT = 30;
// A single answered question is not a competency reading — it is noise. Below
// this the category is dropped rather than shown as 0% or 100%.
const MIN_ANSWERS_PER_CATEGORY = 3;

interface SessionRow {
  score: number;
  total: number;
  issued_at: string;
  question_ids: string[] | null;
  correct_indices: number[] | null;
  answers: number[] | null;
}

/**
 * Tallies right/wrong per question category across the given attempts.
 *
 * Correctness is recomputed here from the stored answer and the stored key
 * rather than trusting any client-supplied value — both arrays come straight
 * off the settled session row.
 */
async function buildCompetency(sessions: SessionRow[]): Promise<CategoryCompetency[]> {
  const usable = sessions
    .filter((s) => Array.isArray(s.question_ids) && Array.isArray(s.correct_indices) && Array.isArray(s.answers))
    .slice(0, COMPETENCY_SESSION_LIMIT);

  if (usable.length === 0) return [];

  const ids = new Set<string>();
  for (const session of usable) {
    for (const id of session.question_ids!) ids.add(id);
  }
  if (ids.size === 0) return [];

  const { data: rows, error } = await createAdminClient()
    .from('quiz_questions')
    .select('id, category')
    .in('id', [...ids])
    .returns<{ id: string; category: string }[]>();

  if (error || !rows) return [];

  const categoryById = new Map(rows.map((row) => [row.id, row.category]));
  const tally = new Map<string, { answered: number; correct: number }>();

  for (const session of usable) {
    const questionIds = session.question_ids!;
    const key = session.correct_indices!;
    const given = session.answers!;

    for (let i = 0; i < questionIds.length; i++) {
      const category = categoryById.get(questionIds[i]);
      // A deleted question leaves no category to attribute the answer to.
      if (!category) continue;
      // null = the candidate never answered that one (ran out of time). It is
      // not a wrong answer about the category, so it is not counted at all.
      const answer = given[i];
      if (answer == null) continue;

      const entry = tally.get(category) ?? { answered: 0, correct: 0 };
      entry.answered += 1;
      if (answer === key[i]) entry.correct += 1;
      tally.set(category, entry);
    }
  }

  return [...tally.entries()]
    .filter(([, entry]) => entry.answered >= MIN_ANSWERS_PER_CATEGORY)
    .map(([category, entry]) => ({
      category,
      answered: entry.answered,
      correct: entry.correct,
      percent: Math.round((entry.correct / entry.answered) * 100),
    }))
    .sort((a, b) => b.percent - a.percent);
}

export async function getExamHistory(userId: string): Promise<ExamHistorySummary> {
  const { data, error } = await createAdminClient()
    .from('exam_sessions')
    .select('score, total, issued_at, question_ids, correct_indices, answers')
    // `used` alone isn't enough: a session can be flipped used and still have a
    // null score if settling failed midway. Requiring a non-null score means
    // "attempts" only counts exams that actually produced a grade.
    .eq('user_id', userId)
    .not('score', 'is', null)
    .order('issued_at', { ascending: false })
    .returns<SessionRow[]>();

  if (error || !data) {
    // Missing relation = 0082 not applied yet. Silent: the landing screen just
    // shows the no-attempts state, which is also correct in that case.
    if (!isMissingRelationError(error)) {
      console.error('[exam/examHistory] read failed:', error);
    }
    return EMPTY;
  }

  if (data.length === 0) return EMPTY;

  const competency = await buildCompetency(data);

  return {
    attempts: data.length,
    lastScore: data[0].score,
    lastTotal: data[0].total,
    bestScore: data.reduce((best, row) => Math.max(best, row.score), 0),
    recent: data.slice(0, RECENT_LIMIT).map((row) => ({
      score: row.score,
      total: row.total,
      at: row.issued_at,
    })),
    competency,
  };
}
