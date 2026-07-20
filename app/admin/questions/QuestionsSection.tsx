import { redirect } from 'next/navigation';
import { Chip } from '@heroui/react';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { getAllQuestions } from '@/lib/admin/questions';
import { formatAzDateTime } from '@/lib/format/date';
import AnswerQuestionForm from './AnswerQuestionForm';

export default async function QuestionsSection() {
  const auth = await requireAdmin();
  if (!auth.ok) redirect(auth.status === 401 ? '/login' : '/chat');

  const questions = await getAllQuestions();
  const unansweredCount = questions.filter((q) => !q.answer).length;

  return (
    <div className="pt-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Suallar</h1>
        <span className="mono-label text-on-surface-variant">
          Cəmi {questions.length} · Cavabsız {unansweredCount}
        </span>
      </div>

      {questions.length === 0 ? (
        <div className="glass-panel rounded-2xl py-16 text-center text-sm text-on-surface-variant">
          Hələ sual yoxdur
        </div>
      ) : (
        <ul className="space-y-4">
          {questions.map((q) => (
            <li key={q.id} className="glass-card rounded-2xl p-6">
              <div className="flex items-start justify-between gap-4">
                <p className="text-sm text-on-surface">{q.question}</p>
                <Chip size="sm" variant="soft" color={q.answer ? 'success' : 'accent'} className="shrink-0">
                  {q.answer ? 'cavablandı' : 'cavabsız'}
                </Chip>
              </div>
              <p className="mono-label mt-2 text-xs text-on-surface-variant">
                {formatAzDateTime(q.createdAt)}
              </p>

              {q.answer ? (
                <div className="mt-3 rounded-lg bg-surface-tertiary/30 px-3 py-2">
                  <p className="text-sm text-on-surface">{q.answer}</p>
                  {q.answeredAt && (
                    <p className="mono-label mt-1 text-xs text-on-surface-variant">
                      Cavab tarixi: {formatAzDateTime(q.answeredAt)}
                    </p>
                  )}
                </div>
              ) : (
                <AnswerQuestionForm questionId={q.id} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
