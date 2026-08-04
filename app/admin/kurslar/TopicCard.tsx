'use client';

import { useState } from 'react';
import { Button, Chip, TextArea, TextField } from '@heroui/react';
import { Spinner } from '@/components/Spinner';
import type { LessonCourseRow, LessonTopicRow, MoveTopicResult } from '@/lib/lessons/courses';
import type { GenState } from './CourseTopicsPanel';
import { deleteTopicAction, moveTopicAction, updateTopicAction } from './actions';
import TopicSplitPanel from './TopicSplitPanel';

interface TopicCardProps {
  topic: LessonTopicRow;
  index: number;
  gen: GenState | undefined;
  /** True while a batch run is in flight — per-topic mutations are held back. */
  isRunLocked: boolean;
  /** Other courses over the SAME document — the only legal move targets. */
  moveTargets: LessonCourseRow[];
  onGenerateContent: () => void;
  onGenerateQuestions: () => void;
  onPublish: () => void;
  /** Receives the course's full refreshed topic list after a split. */
  onSplit: (topics: LessonTopicRow[]) => void;
  onMoved: (result: MoveTopicResult) => void;
  onChanged: () => void;
  onError: (message: string) => void;
}

export default function TopicCard({
  topic,
  index,
  gen,
  isRunLocked,
  moveTargets,
  onGenerateContent,
  onGenerateQuestions,
  onPublish,
  onSplit,
  onMoved,
  onChanged,
  onError,
}: TopicCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [movingTo, setMovingTo] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  const isGenerating = gen?.status === 'running';
  const isQueued = gen?.status === 'queued';
  const hasContent = topic.content !== null && topic.content.trim() !== '';
  const isPublished = topic.status === 'published';
  const canPublish = !isPublished && hasContent && topic.questionCount > 0;
  const contentRunning = gen?.content?.status === 'running';
  const questionsRunning = gen?.questions?.status === 'running';
  // A published topic is live material a learner may be mid-way through; the
  // backend refuses to split one, so the button is not offered at all.
  const canSplit = !isPublished && topic.sourceCitations.length > 1;
  // The backend refuses to move a published topic (a learner may be mid-way
  // through it) and one that already carries progress rows. The first is known
  // here and disables the control outright; the second is only knowable
  // server-side, so its error text is surfaced verbatim instead.
  const canMove = !isPublished && moveTargets.length > 0;

  async function handleDelete() {
    if (!window.confirm(`"${topic.title}" mövzusu silinsin?`)) return;
    try {
      const result = await deleteTopicAction(topic.id);
      if (!result.ok) {
        onError(result.error);
        return;
      }
      onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Xəta baş verdi');
    }
  }

  async function handleMove(target: LessonCourseRow) {
    if (!window.confirm(`"${topic.title}" mövzusu «${target.title}» kursuna köçürülsün?`)) return;
    setMovingTo(target.id);
    try {
      const result = await moveTopicAction(topic.id, target.id);
      if (!result.ok) {
        onError(result.error);
        return;
      }
      setMoveOpen(false);
      onMoved(result.data);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Xəta baş verdi');
    } finally {
      setMovingTo(null);
    }
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
              {contentRunning ? 'material yaradılır…' : questionsRunning ? 'suallar yaradılır…' : 'yaradılır…'}
            </span>
          )}
          {isQueued && <span className="mono-label text-on-surface-variant">növbədə</span>}

          {/* Content and questions are separate backend calls and a topic can
              legitimately have one without the other, so they get separate
              buttons rather than one "material" button doing both. */}
          {!isGenerating && !isQueued && (
            <>
              <Button variant="outline" size="sm" isDisabled={isRunLocked} onPress={onGenerateContent}>
                {hasContent ? 'Materialı yenidən yarat' : 'Dərs materialı yarat'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                isDisabled={isRunLocked}
                onPress={onGenerateQuestions}
              >
                {topic.questionCount > 0 ? 'Sualları yenilə' : 'Suallar yarat'}
              </Button>
              {canSplit && (
                <Button
                  variant="ghost"
                  size="sm"
                  isDisabled={isRunLocked}
                  onPress={() => setSplitOpen((v) => !v)}
                >
                  {splitOpen ? 'Bölgünü bağla' : 'Hissələrə böl'}
                </Button>
              )}
              {moveTargets.length > 0 && (
                // The title sits on a wrapper: a disabled button gets no
                // pointer events of its own, so the tooltip has to come from
                // an element that still does.
                <span
                  title={
                    isPublished
                      ? 'Dərc edilmiş mövzu köçürülə bilməz — əvvəlcə onu layihəyə qaytarın'
                      : undefined
                  }
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    isDisabled={isRunLocked || !canMove || movingTo !== null}
                    onPress={() => setMoveOpen((v) => !v)}
                  >
                    {isPublished
                      ? 'Köçürülmür (dərc edilib)'
                      : moveOpen
                        ? 'Köçürməni bağla'
                        : 'Başqa kursa köçür'}
                  </Button>
                </span>
              )}
            </>
          )}

          <Button variant="ghost" size="sm" onPress={() => setExpanded((v) => !v)}>
            {expanded ? 'Gizlət' : 'Bax / redaktə et'}
          </Button>
        </div>
      </div>

      {/* Per-STEP outcome, kept visible after the run. The provider's real error
          text (model id + message) is rendered verbatim — collapsing it into
          "Xəta" is what made these failures invisible in the first place. */}
      {gen?.content?.status === 'error' && (
        <p className="mono-label mt-2 pl-8 break-words text-danger">
          Dərs materialı uğursuz oldu: {gen.content.message ?? 'naməlum xəta'}
        </p>
      )}

      {gen?.questions?.status === 'error' && (
        <p className="mono-label mt-2 pl-8 break-words text-danger">
          Suallar uğursuz oldu: {gen.questions.message ?? 'naməlum xəta'}
        </p>
      )}

      {gen?.status === 'idle' && gen.message && (
        <p className="mono-label mt-2 pl-8 text-on-surface-variant">{gen.message}</p>
      )}

      {gen?.status === 'done' && (
        <p className="mono-label mt-2 pl-8 text-go-green">
          {gen.content?.status === 'done' ? 'Material hazırdır' : null}
          {gen.content?.status === 'done' && gen.questions?.status === 'done' ? ' · ' : null}
          {gen.questions?.status === 'done' ? `${gen.questionsCreated ?? 0} sual yaradıldı` : null}
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

      {/* A list of target buttons rather than a Select: the same pattern the
          document picker uses, and it keeps the keyboard path a plain tab-and-
          enter with no popover state to manage. */}
      {moveOpen && canMove && (
        <div className="mt-3 rounded-xl border border-outline-variant/40 p-3">
          <div className="mono-label mb-2 uppercase text-on-surface-variant">
            Hədəf kurs (eyni sənəd)
          </div>
          <div className="space-y-1.5">
            {moveTargets.map((target) => (
              <Button
                key={target.id}
                variant="outline"
                size="sm"
                className="w-full justify-start"
                isPending={movingTo === target.id}
                isDisabled={movingTo !== null}
                onPress={() => void handleMove(target)}
              >
                {({ isPending }) => (
                  <>
                    {isPending ? <Spinner size="sm" tone="current" /> : null}
                    {target.title}
                  </>
                )}
              </Button>
            ))}
          </div>
          <p className="mono-label mt-2 text-on-surface-variant">
            Mövzu hədəf kursun sonuna əlavə olunur. İrəliləyiş qeydi olan və ya dərc edilmiş mövzu
            köçürülmür.
          </p>
        </div>
      )}

      {splitOpen && canSplit && (
        <TopicSplitPanel
          topic={topic}
          onCancel={() => setSplitOpen(false)}
          onSplit={(refreshed) => {
            setSplitOpen(false);
            onSplit(refreshed);
          }}
        />
      )}

      {expanded && (
        <TopicEditor
          // REMOUNTS WHENEVER THE SERVER'S COPY CHANGES. The title/content
          // fields are uncontrolled-from-the-server: they seed local state
          // once. Before this, that state was seeded in TopicCard itself, so a
          // card mounted while the topic was still empty kept showing an EMPTY
          // textarea after generation finished and refreshed the row — the
          // chips said "material var" while the editor said "Material hələ
          // yaradılmayıb". Keying on the server values is React's own answer to
          // "reset state when a prop changes"; it can't fight the user's typing
          // because the key is derived from the prop, not from local state.
          key={`${topic.id}:${topic.title}:${topic.content ?? ''}`}
          topic={topic}
          isRunLocked={isRunLocked}
          canPublish={canPublish}
          isPublished={isPublished}
          publishing={publishing}
          onPublish={() => void handlePublish()}
          onDelete={() => void handleDelete()}
          onChanged={onChanged}
          onError={onError}
        />
      )}
    </div>
  );
}

interface TopicEditorProps {
  topic: LessonTopicRow;
  isRunLocked: boolean;
  canPublish: boolean;
  isPublished: boolean;
  publishing: boolean;
  onPublish: () => void;
  onDelete: () => void;
  onChanged: () => void;
  onError: (message: string) => void;
}

function TopicEditor({
  topic,
  isRunLocked,
  canPublish,
  isPublished,
  publishing,
  onPublish,
  onDelete,
  onChanged,
  onError,
}: TopicEditorProps) {
  const [title, setTitle] = useState(topic.title);
  const [content, setContent] = useState(topic.content ?? '');
  const [saving, setSaving] = useState(false);

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
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Xəta baş verdi');
    } finally {
      setSaving(false);
    }
  }

  return (
        <div className="mt-3 space-y-3 border-t border-outline-variant/40 pt-3">
          <TextField value={title} onChange={setTitle} aria-label="Mövzu adı">
            <TextArea rows={1} />
          </TextField>

          <TextField value={content} onChange={setContent} aria-label="Mövzu materialı">
            <TextArea
              rows={12}
              placeholder="Material hələ yaradılmayıb. «Dərs materialı yarat» düyməsini işlədin və ya əl ilə yazın."
            />
          </TextField>
          <p className="mono-label text-on-surface-variant">
            Format: sadələşdirilmiş Markdown — ## / ### başlıqlar, «- » siyahılar, **qalın», «&gt; »
            sitat, adi abzaslar. Cədvəl, HTML və kod bloku dəstəklənmir.
          </p>

          {topic.sourceCitations.length > 0 && (
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-on-surface-variant mb-1.5">İstinadlar</div>
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
                  className="rounded-full"
                  isPending={publishing}
                  isDisabled={publishing || isRunLocked}
                  onPress={onPublish}
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
              onPress={onDelete}
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
  );
}
