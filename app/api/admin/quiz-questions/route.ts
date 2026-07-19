import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { apiError, serverError, logApiError } from '@/lib/api/errors';
import { generateQuestionsFromPdf } from '@/lib/quiz/generateQuestionsFromPdf';
import { createDraftQuestions } from '@/lib/admin/quizQuestions';

// LLM extraction over a full PDF can be slow — same reasoning as
// app/api/admin/documents/route.ts's maxDuration.
export const maxDuration = 300;

// The one new route file this feature is budgeted for (see CLAUDE.md's
// Vercel route-count ceiling) — everything else in this feature is a server
// action. `category` form field is accepted but currently unused: the LLM
// picks a category per question itself (lib/quiz/generateQuestionsFromPdf.ts),
// this field is reserved for a future "bias toward this category" hint.
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return apiError(auth.status, auth.message);

  const formData = await request.formData();
  const file = formData.get('file');

  if (!(file instanceof File)) {
    return apiError(400, 'file tələb olunur');
  }
  if (file.type !== 'application/pdf') {
    return apiError(400, 'Yalnız PDF fayllar qəbul olunur');
  }

  let generated;
  try {
    const buffer = await file.arrayBuffer();
    generated = await generateQuestionsFromPdf(buffer);
  } catch (err) {
    logApiError(`generate quiz questions from pdf file=${file.name}`, err);
    return serverError(err, 'Sənəddən suallar hazırlamaq uğursuz oldu');
  }

  if (generated.length === 0) {
    return NextResponse.json({ questions: [] });
  }

  const result = await createDraftQuestions(
    generated.map((q) => ({
      question: q.question,
      options: q.options,
      correctIndex: q.correctIndex,
      category: q.category,
      explanation: q.explanation,
      sourceTitle: file.name,
      createdBy: auth.userId,
    }))
  );

  if (!result.ok) return apiError(500, result.error);

  return NextResponse.json({ questions: result.questions });
}
