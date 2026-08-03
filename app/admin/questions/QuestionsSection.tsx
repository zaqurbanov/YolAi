import { redirect } from 'next/navigation';
import { Chip } from '@heroui/react';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { getAllQuestions } from '@/lib/admin/questions';
import { formatAzDateTime } from '@/lib/format/date';
import { createClient } from '@/lib/supabase/server';
import AnswerQuestionForm from './AnswerQuestionForm';

export default async function QuestionsSection() {
  const auth = await requireAdmin();
  if (!auth.ok) redirect(auth.status === 401 ? '/login' : '/chat');

  const questions = await getAllQuestions();
  const unansweredCount = questions.filter((q) => !q.answer).length;

  // getAllQuestions() already returns userId per question (lib/admin/questions.ts),
  // but the sender was never resolved to something readable — same email-lookup
  // pattern as app/admin/logs/LogsSection.tsx's error log rows.
  const userIds = Array.from(new Set(questions.map((q) => q.userId)));
  const emailsByUserId = new Map<string, string>();
  if (userIds.length > 0) {
    const supabase = await createClient();
    const { data: profileRows } = await supabase
      .from('profiles')
      .select('id, email')
      .in('id', userIds);
    for (const p of profileRows ?? []) {
      if (p.email) emailsByUserId.set(p.id, p.email);
    }
  }

  return (
    <div className="pt-6 space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div className="space-y-1">
          <span className="text-[12px] font-bold uppercase tracking-[0.1em] text-primary">İstifadəçi sualları</span>
          <h1 className="text-[28px] font-semibold leading-tight text-navy">Suallar</h1>
        </div>
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
                {emailsByUserId.get(q.userId) ?? q.userId.slice(0, 8)} · {formatAzDateTime(q.createdAt)}
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
