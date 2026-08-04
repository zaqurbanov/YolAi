'use client';

import { useState } from 'react';
import { Button, Input, Label, Switch, TextArea, TextField } from '@heroui/react';
import { Spinner } from '@/components/Spinner';
import type { IngestedDocumentOption, LessonCourseRow } from '@/lib/lessons/courses';
import { createCourseAction } from './actions';
import DocumentPicker, { useIngestedDocuments } from './DocumentPicker';

interface CourseCreateFormProps {
  nextOrderIndex: number;
  onCreated: (course: LessonCourseRow) => void;
}

// The SINGLE-course flow: one document becomes one course. The multi-course
// flow (CourseGroupsCreator) is a separate entry point; this one stays because
// it is still the right tool for a small document.
export default function CourseCreateForm({ nextOrderIndex, onCreated }: CourseCreateFormProps) {
  const { documents, error: documentsError } = useIngestedDocuments();
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isFree, setIsFree] = useState(false);
  const [unlockPrice, setUnlockPrice] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    } catch (e) {
      // A rejected server action (network drop, function timeout) resolves
      // nowhere near the `!result.ok` branch — without this the spinner just
      // stops and nothing is rendered.
      setError(e instanceof Error ? e.message : 'Xəta baş verdi');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="text-[18px] font-semibold text-navy">Yeni kurs</div>

      <div className="mt-4">
        <DocumentPicker documents={documents} selectedId={documentId} onSelect={pickDocument} />
      </div>

      {documents !== null && documents.length > 0 && (
        <>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <TextField value={title} onChange={setTitle}>
              <Label>Kurs adı</Label>
              <Input placeholder="Məsələn: Piyada Hərəkəti" />
            </TextField>

            <TextField value={unlockPrice} onChange={setUnlockPrice} isDisabled={isFree}>
              <Label>Enerji qiyməti (boş = qlobal standart)</Label>
              <Input type="number" min={0} step={1} placeholder="standart" />
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
              className="rounded-full"
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

        </>
      )}

      {(error || documentsError) && (
        <p className="mono-label mt-3 break-words text-danger">{error ?? documentsError}</p>
      )}
    </div>
  );
}
