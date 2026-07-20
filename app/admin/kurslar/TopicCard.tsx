'use client';

import { useState } from 'react';
import { Button, Chip, TextArea, TextField } from '@heroui/react';
import { Spinner } from '@/components/Spinner';
import type { LessonTopicRow } from '@/lib/lessons/courses';
import type { GenState } from './CourseTopicsPanel';
import { deleteTopicAction, updateTopicAction } from './actions';

interface TopicCardProps {
  topic: LessonTopicRow;
  index: number;
  gen: GenState | undefined;
  /** True while a batch run is in flight — per-topic mutations are held back. */
  isRunLocked: boolean;
  onGenerate: () => void;
  onPublish: () => void;
  onChanged: () => void;
  onError: (message: string) => void;
}

export default function TopicCard({
  topic,
  index,
  gen,
  isRunLocked,
  onGenerate,
  onPublish,
  onChanged,
  onError,
}: TopicCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [content, setContent] = useState(topic.content ?? '');
  const [title, setTitle] = useState(topic.title);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const isGenerating = gen?.status === 'running';
  const isQueued = gen?.status === 'queued';
  const hasContent = topic.content !== null && topic.content.trim() !== '';
  const isPublished = topic.status === 'published';
  const canPublish = !isPublished && hasContent && topic.questionCount > 0;

  async function handleSave() {
    setSaving(true);
    try {
      const result = await updateTopicAction(topic.id, {
        title: title.trim() || topic.title,
        content: content.trim() || null,
      });
      if (!result.ok) {
        onError(result.error);
        return;
      }
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`"${topic.title}" mövzusu silinsin?`)) return;
    const result = await deleteTopicAction(topic.id);
    if (!result.ok) {
      onError(result.error);
      return;
    }
    onChanged();
  }

  async function handlePublish() {
    setPublishing(true);
    try {
      onPublish();
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div
      className={`rounded-xl border p-3 transition ${
        isGenerating ? 'border-primary/60 bg-primary/5' : 'border-outline-variant/40'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <span className="mono-label mt-0.5 w-6 shrink-0 text-on-surface-variant">{index + 1}.</span>
          <div className="min-w-0">
            <div className="font-medium text-on-surface">{topic.title}</div>

            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Chip
                size="sm"
                variant="soft"
                color={isPublished ? 'success' : 'default'}
                className="mono-label"
              >
                {isPublished ? 'dərc edilib' : 'layihə'}
              </Chip>

              <Chip
                size="sm"
                variant="soft"
                color={hasContent ? 'accent' : 'default'}
                className="mono-label"
              >
                {hasContent ? 'material var' : 'material yoxdur'}
              </Chip>

              <Chip
                size="sm"
                variant="soft"
                color={topic.questionCount > 0 ? 'accent' : 'default'}
                className="mono-label"
              >
                {topic.publishedQuestionCount}/{topic.questionCount} sual
              </Chip>

              {topic.sourceCitations.length > 0 && (
                <Chip size="sm" variant="soft" color="default" className="mono-label">
                  {topic.sourceCitations.length} istinad
                </Chip>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {isGenerating && (
            <span className="mono-label flex items-center gap-1.5 text-primary">
              <Spinner size="sm" tone="current" />
              yaradılır…
            </span>
          )}
          {isQueued && <span className="mono-label text-on-surface-variant">növbədə</span>}

          {!isGenerating && !isQueued && (
            <Button
              variant="outline"
              size="sm"
              isDisabled={isRunLocked}
              onPress={onGenerate}
            >
              {hasContent ? 'Yenidən yarat' : 'Material yarat'}
            </Button>
          )}

          <Button variant="ghost" size="sm" onPress={() => setExpanded((v) => !v)}>
            {expanded ? 'Gizlət' : 'Bax / redaktə et'}
          </Button>
        </div>
      </div>

      {/* Generation outcome, surfaced per topic and kept visible after the run. */}
      {gen?.status === 'error' && (
        <p className="mono-label mt-2 pl-8 text-danger">
          Uğursuz oldu: {gen.message ?? 'naməlum xəta'}
        </p>
      )}

      {gen?.status === 'done' && (
        <p className="mono-label mt-2 pl-8 text-go-green">
          Hazırdır — {gen.questionsCreated ?? 0} sual yaradıldı
        </p>
      )}

      {/* belowPoolMinimum is a real quality problem (pool under 15 questions
          means a 10-question draw barely varies between attempts), so it is
          shown as a persistent warning rather than folded into the counts. */}
      {gen?.belowPoolMinimum && (
        <p className="mono-label mt-1 pl-8 text-caution-orange">
          Diqqət: sual bankı 15-dən azdır. Testin təsadüfiliyi zəif olacaq — yenidən yaratmağı
          düşünün.
        </p>
      )}

      {gen?.missingChunkCount ? (
        <p className="mono-label mt-1 pl-8 text-caution-orange">
          {gen.missingChunkCount} mənbə hissəsi tapılmadı — material natamam ola bilər.
        </p>
      ) : null}

      {expanded && (
        <div className="mt-3 space-y-3 border-t border-outline-variant/40 pt-3">
          <TextField value={title} onChange={setTitle} aria-label="Mövzu adı">
            <TextArea rows={1} />
          </TextField>

          <TextField value={content} onChange={setContent} aria-label="Mövzu materialı">
            <TextArea
              rows={12}
              placeholder="Material hələ yaradılmayıb. «Material yarat» düyməsini işlədin və ya əl ilə yazın."
            />
          </TextField>

          {topic.sourceCitations.length > 0 && (
            <div>
              <div className="mono-label mb-1.5 text-on-surface-variant uppercase">İstinadlar</div>
              <div className="flex flex-wrap gap-1.5">
                {topic.sourceCitations.map((c, i) => (
                  <Chip
                    key={`${c.chunk_id}-${i}`}
                    size="sm"
                    variant="soft"
                    color="default"
                    className="mono-label"
                  >
                    {c.article_label ?? 'mənbə'}
                    {c.page_number !== null ? ` · s.${c.page_number}` : ''}
                  </Chip>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                isPending={saving}
                isDisabled={saving || isRunLocked}
                onPress={() => void handleSave()}
              >
                {({ isPending }) => (
                  <>
                    {isPending ? <Spinner size="sm" tone="current" /> : null}
                    Yadda saxla
                  </>
                )}
              </Button>

              {canPublish && (
                <Button
                  variant="primary"
                  size="sm"
                  isPending={publishing}
                  isDisabled={publishing || isRunLocked}
                  onPress={() => void handlePublish()}
                >
                  {({ isPending }) => (
                    <>
                      {isPending ? <Spinner size="sm" tone="current" /> : null}
                      Sualları və mövzunu dərc et
                    </>
                  )}
                </Button>
              )}
            </div>

            <Button
              variant="ghost"
              size="sm"
              isDisabled={isRunLocked}
              onPress={() => void handleDelete()}
            >
              Mövzunu sil
            </Button>
          </div>

          {!canPublish && !isPublished && (
            <p className="mono-label text-on-surface-variant">
              Dərc etmək üçün mövzunun materialı və ən azı bir sualı olmalıdır.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
