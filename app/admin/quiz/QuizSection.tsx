import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { listQuestions } from '@/lib/admin/quizQuestions';
import QuizPdfUploadForm from './QuizPdfUploadForm';
import QuestionEditor from './QuestionEditor';

export default async function QuizSection() {
  const auth = await requireAdmin();
  if (!auth.ok) redirect(auth.status === 401 ? '/login' : '/chat');

  const [drafts, published] = await Promise.all([listQuestions('draft'), listQuestions('published')]);

  return (
    <div className="pt-6 space-y-8">
      <h1 className="text-2xl font-semibold">Test sualları</h1>

      <QuizPdfUploadForm />

      <div>
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-lg font-semibold">Baxılmamış layihələr</h2>
          {drafts.length > 0 && (
            <span className="text-legal-citation rounded-full bg-caution-orange/15 px-2.5 py-1 text-caution-orange">
              {drafts.length} nəzərdən keçirilməlidir
            </span>
          )}
        </div>
        {drafts.length === 0 ? (
          <div className="glass-panel rounded-2xl px-4 py-8 text-center text-sm text-on-surface-variant">
            Baxılmamış sual layihəsi yoxdur
          </div>
        ) : (
          <div className="space-y-4">
            {drafts.map((q) => (
              <QuestionEditor key={q.id} question={q} accent="draft" />
            ))}
          </div>
        )}
      </div>

      <details className="group">
        <summary className="cursor-pointer text-lg font-semibold text-on-surface-variant marker:content-none">
          <span className="inline-flex items-center gap-2">
            Dərc edilmiş suallar
            <span className="text-legal-citation rounded-full bg-go-green/15 px-2.5 py-1 text-go-green">
              {published.length}
            </span>
          </span>
        </summary>
        <div className="mt-4 space-y-4">
          {published.length === 0 ? (
            <div className="glass-panel rounded-2xl px-4 py-8 text-center text-sm text-on-surface-variant">
              Hələ dərc edilmiş sual yoxdur
            </div>
          ) : (
            published.map((q) => <QuestionEditor key={q.id} question={q} accent="published" />)
          )}
        </div>
      </details>
    </div>
  );
}
