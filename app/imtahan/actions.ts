'use server';

import { createClient } from '@/lib/supabase/server';
import { answerExamQuestion } from '@/lib/exam/examSession';

// Per-question answer for /imtahan. Deliberately NOT in
// app/coin-qazan/actions.ts alongside the start/submit pair: those two are
// shared with the games-section simulator, this one is specific to the
// official exam's answer-then-lock flow.
//
// Returns ONLY a boolean verdict. The correct index is compared inside the
// database (answer_exam_question, 0091) and never crosses this boundary.

export interface AnswerExamState {
  status:
    | 'success'
    | 'session_not_found'
    | 'already_used'
    | 'session_expired'
    | 'invalid_answer'
    | 'unavailable'
    | 'error';
  message: string;
  correct?: boolean;
  /** The answer the server considers final for this question. */
  locked?: number;
}

export async function answerExamQuestionAction(
  sessionId: string,
  index: number,
  answer: number
): Promise<AnswerExamState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { status: 'error', message: 'Giriş tələb olunur' };
  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    return { status: 'invalid_answer', message: 'Yanlış sessiya' };
  }

  const result = await answerExamQuestion(user.id, sessionId, index, answer);
  if (!result.ok) {
    if (result.error === 'session_not_found') {
      return { status: 'session_not_found', message: 'Sessiya tapılmadı' };
    }
    if (result.error === 'already_used') {
      return { status: 'already_used', message: 'Bu imtahan artıq təqdim edilib' };
    }
    if (result.error === 'session_expired') {
      return { status: 'session_expired', message: 'Vaxt bitib' };
    }
    if (result.error === 'invalid_answer') {
      return { status: 'invalid_answer', message: 'Yanlış cavab' };
    }
    if (result.error === 'unavailable') {
      return { status: 'unavailable', message: 'İmtahan hazırda əlçatan deyil' };
    }
    return { status: 'error', message: 'Xəta baş verdi' };
  }

  return {
    status: 'success',
    message: 'ok',
    correct: result.correct,
    locked: result.locked,
  };
}
