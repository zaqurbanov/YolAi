'use client';

import { useEffect, useState } from 'react';
import { Chip, Skeleton } from '@heroui/react';
import type { IngestedDocumentOption } from '@/lib/lessons/courses';
import { listIngestedDocumentsAction } from './actions';

// Extracted from CourseCreateForm when the multi-course flow
// (CourseGroupsCreator) needed the exact same picker: a document list with its
// chunk count, where a 0-chunk document is visibly unusable rather than hidden.
// Both call sites must refuse the same documents, so the rule lives in one
// place instead of being restated per form.

export interface IngestedDocumentsState {
  /** null while loading. [] means "loaded, none available". */
  documents: IngestedDocumentOption[] | null;
  error: string | null;
}

// Fetched on demand by the form that needs it rather than passed down from the
// page: the underlying read is one exact-count query per document and would
// otherwise stall the whole admin page's first paint.
export function useIngestedDocuments(): IngestedDocumentsState {
  const [documents, setDocuments] = useState<IngestedDocumentOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await listIngestedDocumentsAction();
        if (cancelled) return;
        if (result.ok) {
          setDocuments(result.data);
        } else {
          setDocuments([]);
          setError(result.error);
        }
      } catch (e) {
        // A rejected action resolves nowhere near the !ok branch — without this
        // the picker stays on its skeleton forever.
        if (cancelled) return;
        setDocuments([]);
        setError(e instanceof Error ? e.message : 'Sənədlər yüklənmədi');
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { documents, error };
}

interface DocumentPickerProps {
  documents: IngestedDocumentOption[] | null;
  selectedId: string | null;
  onSelect: (doc: IngestedDocumentOption) => void;
  isDisabled?: boolean;
}

// A scrollable list of documents rather than a Select: the picker has to show
// chunk count per document (the admin's signal for whether a document is
// actually ingested and worth building courses from), and there are ~27 of
// them, which is past the point where a dropdown reads well.
export default function DocumentPicker({
  documents,
  selectedId,
  onSelect,
  isDisabled = false,
}: DocumentPickerProps) {
  if (documents === null) {
    return (
      <div className="space-y-2">
        <div className="text-label-sm text-on-surface-variant">Sənədlər yüklənir…</div>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-9 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <p className="text-sm text-on-surface-variant">
        Ingest edilmiş sənəd yoxdur. Əvvəlcə «Sənədlər» bölməsindən PDF yükləyin.
      </p>
    );
  }

  const unusableCount = documents.filter((d) => d.chunkCount === 0).length;

  return (
    <div>
      <div className="mb-2 text-label-sm text-on-surface-variant">
        Mənbə sənədi ({documents.length})
      </div>
      <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-xl border border-outline-variant/40 p-2">
        {documents.map((doc) => {
          // A chunkCount of 0 means ingest reported success but persisted no
          // text. Every server action behind this picker refuses such a
          // document, so it is refused here too rather than leading the admin
          // into a step that is guaranteed to fail.
          const isUnusable = doc.chunkCount === 0;
          return (
            <button
              key={doc.id}
              type="button"
              disabled={isUnusable || isDisabled}
              aria-disabled={isUnusable || isDisabled}
              title={
                isUnusable
                  ? 'Bu sənəddə mətn hissəsi yoxdur — kurs qurmaq üçün yenidən ingest edilməlidir'
                  : undefined
              }
              onClick={() => onSelect(doc)}
              className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition ${
                isUnusable
                  ? 'cursor-not-allowed text-on-surface-variant/60 line-through decoration-danger/50'
                  : doc.id === selectedId
                    ? 'bg-primary/15 text-primary'
                    : 'hover:bg-surface-tertiary/50'
              }`}
            >
              <span className="min-w-0 truncate">{doc.title}</span>
              <Chip
                size="sm"
                variant="soft"
                color={isUnusable ? 'danger' : 'default'}
                className="mono-label shrink-0"
              >
                {isUnusable ? '0 hissə — yararsız' : `${doc.chunkCount} hissə`}
              </Chip>
            </button>
          );
        })}
      </div>

      {unusableCount > 0 && (
        <p className="mono-label mt-2 text-caution-orange">
          {unusableCount} sənəd mətn hissəsi olmadan «hazır» görünür və seçilə bilmir — onları
          «Sənədlər» bölməsindən yenidən ingest edin.
        </p>
      )}
    </div>
  );
}
