'use client';

import { useEffect, useState } from 'react';
import { Button, Chip, Input, Label, Skeleton, Switch, TextArea, TextField } from '@heroui/react';
import { Spinner } from '@/components/Spinner';
import type { IngestedDocumentOption, LessonCourseRow } from '@/lib/lessons/courses';
import { createCourseAction, listIngestedDocumentsAction } from './actions';

interface CourseCreateFormProps {
  nextOrderIndex: number;
  onCreated: (course: LessonCourseRow) => void;
}

// A scrollable list of documents rather than a Select: the picker has to show
// chunk count per document (the admin's signal for whether a document is
// actually ingested and worth building a course from), and there are ~27 of
// them, which is past the point where a dropdown reads well.
export default function CourseCreateForm({ nextOrderIndex, onCreated }: CourseCreateFormProps) {
  // Fetched here rather than passed down from the page: the underlying read is
  // one exact-count query per document and would otherwise stall the whole
  // admin page's first paint for a list only this form needs.
  const [documents, setDocuments] = useState<IngestedDocumentOption[] | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isFree, setIsFree] = useState(false);
  const [unlockPrice, setUnlockPrice] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const result = await listIngestedDocumentsAction();
      if (cancelled) return;
      if (result.ok) setDocuments(result.data);
      else {
        setDocuments([]);
        setError(result.error);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  function pickDocument(doc: IngestedDocumentOption) {
    setDocumentId(doc.id);
    // Prefill from the document, still fully editable — the course title is
    // usually the document title, but not always.
    if (!title.trim()) setTitle(doc.title);
  }

  async function handleSubmit() {
    setError(null);

    if (!documentId) {
      setError('Sənəd seçin');
      return;
    }
    if (!title.trim()) {
      setError('Kurs adı boş ola bilməz');
      return;
    }

    const trimmedPrice = unlockPrice.trim();
    let price: number | null = null;
    if (trimmedPrice !== '') {
      const parsed = Number(trimmedPrice);
      if (!Number.isFinite(parsed) || parsed < 0) {
        setError('Qiymət düzgün ədəd olmalıdır');
        return;
      }
      price = parsed;
    }

    setPending(true);
    try {
      const result = await createCourseAction({
        documentId,
        title: title.trim(),
        description: description.trim() || null,
        orderIndex: nextOrderIndex,
        isFree,
        unlockPrice: price,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setDocumentId(null);
      setTitle('');
      setDescription('');
      setIsFree(false);
      setUnlockPrice('');
      onCreated(result.data);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="mono-label text-on-surface-variant uppercase">Yeni kurs</div>

      {documents === null ? (
        <div className="mt-4 space-y-2">
          <div className="text-label-sm text-on-surface-variant">Sənədlər yüklənir…</div>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-9 w-full rounded-lg" />
          ))}
        </div>
      ) : documents.length === 0 ? (
        <p className="mt-4 text-sm text-on-surface-variant">
          Ingest edilmiş sənəd yoxdur. Əvvəlcə «Sənədlər» bölməsindən PDF yükləyin.
        </p>
      ) : (
        <>
          <div className="mt-4">
            <div className="mb-2 text-label-sm text-on-surface-variant">
              Mənbə sənədi ({documents.length})
            </div>
            <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-xl border border-outline-variant/40 p-2">
              {documents.map((doc) => (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => pickDocument(doc)}
                  className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition ${
                    doc.id === documentId
                      ? 'bg-primary/15 text-primary'
                      : 'hover:bg-surface-tertiary/50'
                  }`}
                >
                  <span className="min-w-0 truncate">{doc.title}</span>
                  <Chip size="sm" variant="soft" color="default" className="mono-label shrink-0">
                    {doc.chunkCount} hissə
                  </Chip>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <TextField value={title} onChange={setTitle}>
              <Label>Kurs adı</Label>
              <Input placeholder="Məsələn: Piyada Hərəkəti" />
            </TextField>

            <TextField value={unlockPrice} onChange={setUnlockPrice} isDisabled={isFree}>
              <Label>Qiymət (boş = qlobal standart)</Label>
              <Input type="number" min={0} step={0.01} placeholder="standart" />
            </TextField>
          </div>

          <div className="mt-4">
            <TextField value={description} onChange={setDescription}>
              <Label>Təsvir (istəyə bağlı)</Label>
              <TextArea rows={2} placeholder="Kursun qısa təsviri" />
            </TextField>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <Switch isSelected={isFree} onChange={setIsFree}>
              Pulsuz kurs
            </Switch>

            <Button
              variant="primary"
              size="sm"
              isPending={pending}
              isDisabled={pending}
              onPress={() => void handleSubmit()}
            >
              {({ isPending }) => (
                <>
                  {isPending ? <Spinner size="sm" tone="current" /> : null}
                  Kurs yarat
                </>
              )}
            </Button>
          </div>

          {error && <p className="mono-label mt-3 text-danger">{error}</p>}
        </>
      )}
    </div>
  );
}
