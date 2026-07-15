import { Chip } from '@heroui/react';
import { formatAzDateTime } from '@/lib/format/date';
import type { UserQuestionRow } from '@/lib/admin/questions';

interface QuestionHistoryListProps {
  questions: UserQuestionRow[];
}

export default function QuestionHistoryList({ questions }: QuestionHistoryListProps) {
  return (
    <div className="glass-card rounded-2xl p-6 space-y-4">
      <h2 className="mono-label uppercase text-on-surface-variant">Sual tarixçəniz</h2>

      {questions.length === 0 ? (
        <p className="text-sm text-on-surface-variant">Hələ sual göndərməmisiniz.</p>
      ) : (
        <ul className="space-y-3">
          {questions.map((q) => (
            <li key={q.id} className="rounded-xl border border-outline-variant/40 px-4 py-3 space-y-2">
              <div className="flex items-start justify-between gap-4">
                <p className="text-sm text-on-surface">{q.question}</p>
                <Chip size="sm" variant="soft" color={q.answer ? 'success' : 'default'} className="shrink-0">
                  {q.answer ? 'cavablandı' : 'gözləyir'}
                </Chip>
              </div>
              <p className="mono-label text-xs text-on-surface-variant">{formatAzDateTime(q.createdAt)}</p>
              {q.answer && (
                <div className="mt-2 rounded-lg bg-surface-tertiary/30 px-3 py-2">
                  <p className="text-sm text-on-surface">{q.answer}</p>
                  {q.answeredAt && (
                    <p className="mono-label mt-1 text-xs text-on-surface-variant">
                      Cavab tarixi: {formatAzDateTime(q.answeredAt)}
                    </p>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
