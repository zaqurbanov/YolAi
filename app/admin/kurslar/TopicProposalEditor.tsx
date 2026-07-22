'use client';

import { useState } from 'react';
import { Button, Chip, Input, TextField } from '@heroui/react';
import { Spinner } from '@/components/Spinner';
import type { TopicProposal } from '@/lib/lessons/proposeTopics';
import type { LessonTopicRow } from '@/lib/lessons/courses';
import { createTopicsAction } from './actions';

interface TopicProposalEditorProps {
  courseId: string;
  proposal: TopicProposal;
  onCancel: () => void;
  onCreated: (topics: LessonTopicRow[]) => void;
}

interface DraftProposal {
  /** Stable across reorder/delete so React keys don't collide with orderIndex. */
  key: string;
  title: string;
  articleLabels: string[];
  chunkIds: string[];
  charCount: number;
  preview: string;
}

// The proposal is read-only and side-effect-free server-side, so this whole
// editing step is local state — nothing is persisted until "Mövzuları yarat".
// orderIndex is assigned from array position at submit time rather than being
// carried on each item, so reorder/delete can't leave gaps or duplicates.
export default function TopicProposalEditor({
  courseId,
  proposal,
  onCancel,
  onCreated,
}: TopicProposalEditorProps) {
  const [drafts, setDrafts] = useState<DraftProposal[]>(() =>
    proposal.topics.map((t) => ({
      key: `${t.orderIndex}-${t.chunkIds[0] ?? t.orderIndex}`,
      title: t.title,
      articleLabels: t.articleLabels,
      chunkIds: t.chunkIds,
      charCount: t.charCount,
      preview: t.preview,
    }))
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= drafts.length) return;
    setDrafts((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function remove(index: number) {
    setDrafts((prev) => prev.filter((_, i) => i !== index));
  }

  function retitle(index: number, title: string) {
    setDrafts((prev) => prev.map((d, i) => (i === index ? { ...d, title } : d)));
  }

  async function handleCreate() {
    setError(null);

    if (drafts.length === 0) {
      setError('Ən azı bir mövzu qalmalıdır');
      return;
    }
    if (drafts.some((d) => !d.title.trim())) {
      setError('Bütün mövzuların adı olmalıdır');
      return;
    }

    setPending(true);
    try {
      const result = await createTopicsAction(
        drafts.map((d, i) => ({
          courseId,
          title: d.title.trim(),
          orderIndex: i,
          chunkIds: d.chunkIds,
        }))
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onCreated(result.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Xəta baş verdi');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="mono-label flex flex-wrap items-center gap-2 text-on-surface-variant uppercase">
            Təklif edilən mövzular
            <Chip
              size="sm"
              variant="soft"
              color={proposal.source === 'ai' ? 'accent' : 'default'}
              className="mono-label"
            >
              {proposal.source === 'ai' ? 'AI qruplaşdırması' : 'mexaniki bölgü'}
            </Chip>
          </div>
          <p className="mt-1 text-label-sm text-on-surface-variant">
            {proposal.documentTitle} — {drafts.length} mövzu. Adları dəyişin, sırasını düzəldin və ya
            lazımsızları silin. Yaradılana qədər heç nə yadda saxlanmır.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" isDisabled={pending} onPress={onCancel}>
            İmtina
          </Button>
          <Button
            variant="primary"
            size="sm"
            isPending={pending}
            isDisabled={pending}
            onPress={() => void handleCreate()}
          >
            {({ isPending }) => (
              <>
                {isPending ? <Spinner size="sm" tone="current" /> : null}
                {drafts.length} mövzu yarat
              </>
            )}
          </Button>
        </div>
      </div>

      {/* "AI failed, this is the mechanical split" is information the admin
          must not miss — the mechanical grouping is usually coarser, and the
          warning carries the provider's own error text. It can be set even
          when source === 'ai' (a partial batch failure). */}
      {proposal.warning && (
        <div className="mt-3 rounded-xl border border-caution-orange/40 bg-caution-orange/10 px-3 py-2">
          <p className="mono-label text-caution-orange uppercase">Diqqət</p>
          <p className="mt-1 break-words text-sm text-on-surface">{proposal.warning}</p>
        </div>
      )}

      {error && <p className="mono-label mt-3 text-danger">{error}</p>}

      <div className="mt-4 space-y-3">
        {drafts.map((draft, index) => (
          <div key={draft.key} className="rounded-xl border border-outline-variant/40 p-3">
            <div className="flex items-start gap-2">
              <span className="mono-label mt-2.5 w-6 shrink-0 text-on-surface-variant">
                {index + 1}.
              </span>

              <TextField
                value={draft.title}
                onChange={(v) => retitle(index, v)}
                className="min-w-0 flex-1"
                aria-label={`Mövzu ${index + 1} adı`}
              >
                <Input />
              </TextField>

              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Yuxarı"
                  isDisabled={index === 0}
                  onPress={() => move(index, -1)}
                >
                  ↑
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Aşağı"
                  isDisabled={index === drafts.length - 1}
                  onPress={() => move(index, 1)}
                >
                  ↓
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Sil"
                  onPress={() => remove(index)}
                >
                  ✕
                </Button>
              </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-8">
              <Chip size="sm" variant="soft" color="default" className="mono-label">
                {draft.charCount} simvol
              </Chip>
              {draft.articleLabels.slice(0, 6).map((label) => (
                <Chip key={label} size="sm" variant="soft" color="accent" className="mono-label">
                  {label}
                </Chip>
              ))}
              {draft.articleLabels.length > 6 && (
                <span className="mono-label text-on-surface-variant">
                  +{draft.articleLabels.length - 6}
                </span>
              )}
            </div>

            <p className="mt-2 pl-8 text-label-sm text-on-surface-variant">{draft.preview}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
