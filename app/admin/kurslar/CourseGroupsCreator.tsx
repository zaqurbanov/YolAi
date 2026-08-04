'use client';

import { useEffect, useState } from 'react';
import { Button, Chip } from '@heroui/react';
import { Spinner } from '@/components/Spinner';
import type { CourseGroupProposal } from '@/lib/lessons/groupTopicsIntoCourses';
import type { CreatedCourseWithTopics, FailedCourseCreation } from '@/lib/lessons/courses';
import { proposeCourseGroupsAction } from './actions';
import DocumentPicker, { useIngestedDocuments } from './DocumentPicker';
import CourseGroupProposalEditor from './CourseGroupProposalEditor';

interface CourseGroupsCreatorProps {
  /** Called after a batch that created at least one course, to resync the list. */
  onCoursesCreated: (created: CreatedCourseWithTopics[]) => void;
  onClose: () => void;
}

interface BatchResult {
  created: CreatedCourseWithTopics[];
  failed: FailedCourseCreation[];
}

// The MULTI-course flow: one document becomes 6-8 separately priced courses.
// The single-course CourseCreateForm is untouched and still the right tool for
// a small document — this is a second entry point, not a replacement.
//
// Three steps, one panel: pick a document, review/edit the AI grouping
// (CourseGroupProposalEditor), read the result. The result step is not
// cosmetic: createCoursesWithTopicsAction can partially succeed and the admin
// has to be told exactly which groups failed and whether one left an empty
// course row behind.
export default function CourseGroupsCreator({
  onCoursesCreated,
  onClose,
}: CourseGroupsCreatorProps) {
  const { documents, error: documentsError } = useIngestedDocuments();
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [proposing, setProposing] = useState<'ai' | 'deterministic' | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [proposal, setProposal] = useState<CourseGroupProposal | null>(null);
  // Bumped per proposal so the editor remounts with fresh drafts instead of
  // being reset from an effect (react-hooks/set-state-in-effect is an error).
  const [proposalKey, setProposalKey] = useState(0);
  const [result, setResult] = useState<BatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Two LLM passes (topic outline, then grouping) — 20-40s on a big document.
  // A bare spinner for that long reads as "hung", so the wait counts out loud.
  useEffect(() => {
    if (!proposing) return;
    const timer = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [proposing]);

  async function handlePropose(strategy: 'ai' | 'deterministic') {
    if (!documentId) {
      setError('Sənəd seçin');
      return;
    }
    setError(null);
    setResult(null);
    setElapsed(0);
    setProposing(strategy);
    try {
      const response = await proposeCourseGroupsAction(documentId, strategy);
      if (!response.ok) {
        // Deliberately does NOT store a failed proposal: an empty one would
        // collapse the panel and leave no way to retry.
        setError(response.error);
        return;
      }
      setProposal(response.data);
      setProposalKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Xəta baş verdi');
    } finally {
      setProposing(null);
    }
  }

  function handleCreated(batch: BatchResult) {
    setProposal(null);
    setResult(batch);
    if (batch.created.length > 0) onCoursesCreated(batch.created);
  }

  if (result) {
    return (
      <div className="glass-card rounded-2xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-[12px] font-bold uppercase tracking-[0.1em] text-navy">
            Nəticə
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              onPress={() => {
                setResult(null);
                setDocumentId(null);
              }}
            >
              Başqa sənəd
            </Button>
            <Button variant="primary" size="sm" className="rounded-full" onPress={onClose}>
              Bağla
            </Button>
          </div>
        </div>

        <p className="mt-2 text-sm text-on-surface">
          {result.created.length} kurs yaradıldı
          {result.failed.length > 0 ? `, ${result.failed.length} kurs yaradıla bilmədi` : ''}.
        </p>

        {result.created.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {result.created.map(({ course, topics }) => (
              <div
                key={course.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-outline-variant/40 px-3 py-2"
              >
                <span className="min-w-0 text-sm text-on-surface">{course.title}</span>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Chip size="sm" variant="soft" color="default" className="mono-label">
                    {topics.length} mövzu
                  </Chip>
                  <Chip size="sm" variant="soft" color="success" className="mono-label">
                    {course.isFree
                      ? 'pulsuz'
                      : course.unlockPrice !== null
                        ? `${course.unlockPrice} enerji`
                        : 'qlobal qiymət'}
                  </Chip>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* A partial failure is never reported as success. Each failed group
            carries the backend's own error text, and an orphanCourseId means an
            EMPTY course row is live and only a human can clean it up. */}
        {result.failed.length > 0 && (
          <div className="mt-4 rounded-xl border border-danger/40 bg-danger/5 p-3">
            <p className="mono-label uppercase text-danger">Uğursuz kurslar</p>
            <div className="mt-2 space-y-2">
              {result.failed.map((fail, i) => (
                <div key={`${fail.title}-${i}`}>
                  <p className="text-sm font-medium text-on-surface">{fail.title}</p>
                  <p className="mono-label break-words text-danger">{fail.error}</p>
                  {fail.orphanCourseId && (
                    <p className="mono-label mt-1 break-words text-caution-orange">
                      Boş kurs sətri qaldı və avtomatik silinmədi — kurs siyahısından «
                      {fail.title}» kursunu (id: {fail.orphanCourseId}) əl ilə silin.
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {result.created.length > 0 && (
          <p className="mono-label mt-3 text-on-surface-variant">
            Kurslar layihə (draft) statusundadır. Hər kurs üçün mövzuların materialını və suallarını
            yaradın, sonra dərc edin.
          </p>
        )}
      </div>
    );
  }

  if (proposal) {
    return (
      <CourseGroupProposalEditor
        key={proposalKey}
        proposal={proposal}
        onCancel={() => setProposal(null)}
        onCreated={handleCreated}
      />
    );
  }

  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[18px] font-semibold text-navy">Sənəddən kurslar yarat</div>
          <p className="mt-1 text-label-sm text-on-surface-variant">
            AI sənədin mövzularını 6–8 kursa bölür. Təsdiqləməzdən əvvəl qruplaşdırmanı,
            adları və enerji qiymətlərini redaktə edə bilərsiniz.
          </p>
        </div>
        <Button variant="ghost" size="sm" isDisabled={proposing !== null} onPress={onClose}>
          Bağla
        </Button>
      </div>

      <div className="mt-4">
        <DocumentPicker
          documents={documents}
          selectedId={documentId}
          onSelect={(doc) => {
            setDocumentId(doc.id);
            setError(null);
          }}
          isDisabled={proposing !== null}
        />
      </div>

      {(error || documentsError) && (
        <p className="mono-label mt-3 break-words text-danger">{error ?? documentsError}</p>
      )}

      {proposing ? (
        <div className="mt-4 rounded-xl border border-primary/40 bg-primary/5 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-primary">
            <Spinner size="sm" tone="current" />
            {proposing === 'ai'
              ? 'AI sənədi mövzulara, sonra mövzuları kurslara bölür…'
              : 'Sənəd mexaniki olaraq bölünür…'}
            <span className="mono-label ml-auto">{elapsed} san.</span>
          </div>
          <p className="mt-1.5 text-label-sm text-on-surface-variant">
            {proposing === 'ai'
              ? 'Böyük sənədlərdə bu 20–40 saniyə çəkə bilər. Səhifəni bağlamayın.'
              : 'Bir neçə saniyə çəkir.'}
          </p>
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-surface-tertiary">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
          </div>
        </div>
      ) : (
        documents !== null &&
        documents.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              className="rounded-full"
              isDisabled={!documentId}
              onPress={() => void handlePropose('ai')}
            >
              Kursları təklif et (AI)
            </Button>
            {/* Escape hatch: the mechanical split is instant and is also what
                the AI path degrades to, so it stays selectable. */}
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              isDisabled={!documentId}
              onPress={() => void handlePropose('deterministic')}
            >
              Mexaniki bölgü
            </Button>
          </div>
        )
      )}
    </div>
  );
}
