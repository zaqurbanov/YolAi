'use client';

import { useEffect, useRef, useState } from 'react';
import { Button, Chip, Label, Slider } from '@heroui/react';
import { Spinner } from '@/components/Spinner';
import type { LessonTopicRow } from '@/lib/lessons/courses';
import type { TopicSplitAdvice, TopicSplitPart } from '@/lib/lessons/splitTopic';
import { previewTopicSplitAction, splitTopicAction, suggestTopicSplitAction } from './actions';

interface TopicSplitPanelProps {
  topic: LessonTopicRow;
  onCancel: () => void;
  /** Receives the course's FULL refreshed topic list returned by the split. */
  onSplit: (topics: LessonTopicRow[]) => void;
}

const PREVIEW_DEBOUNCE_MS = 350;

// Split flow, three states in one panel: advice → preview at the chosen count →
// destructive confirm.
//
// The advice `reason` is rendered as prose ONLY. It has been observed live to
// disagree with the boundaries the same call returned (the model narrates one
// grouping while the seams are recomputed deterministically), so `parts[]` is
// the single source of truth for everything the UI derives — counts, titles,
// char counts, previews.
export default function TopicSplitPanel({ topic, onCancel, onSplit }: TopicSplitPanelProps) {
  const [advice, setAdvice] = useState<TopicSplitAdvice | null>(null);
  const [partCount, setPartCount] = useState(2);
  // Stored WITH the count it was computed for, so "is this preview current?"
  // is derivable rather than a second piece of state that can fall out of sync.
  const [preview, setPreview] = useState<{ count: number; parts: TopicSplitPart[] } | null>(null);
  const [loadingAdvice, setLoadingAdvice] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [splitting, setSplitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Monotonic request id: a slow preview that resolves after a newer one must
  // not overwrite the newer result.
  const previewSeq = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const result = await suggestTopicSplitAction(topic.id);
        if (cancelled) return;
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setAdvice(result.data);
        setPartCount(result.data.recommendedParts);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Xəta baş verdi');
      } finally {
        if (!cancelled) setLoadingAdvice(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [topic.id]);

  // At the advised count the advice's own parts are reused rather than
  // re-fetched — they carry the model's per-part titles, which the
  // deterministic preview does not. Derived, not stored, so the two sources
  // can't drift.
  const atAdvisedCount = advice !== null && partCount === advice.recommendedParts;
  const previewing = advice !== null && !atAdvisedCount && preview?.count !== partCount;
  // The previous parts stay on screen while a new preview is in flight — the
  // list is the tallest thing in the panel and blanking it on every drag tick
  // would make the whole card jump.
  const parts = atAdvisedCount && advice ? advice.parts : (preview?.parts ?? advice?.parts ?? []);

  // Re-preview on every other count. previewTopicSplitAction runs no LLM call
  // and writes nothing, but it is still a round trip per drag tick without the
  // debounce.
  useEffect(() => {
    if (!advice || partCount === advice.recommendedParts) return;

    const seq = previewSeq.current + 1;
    previewSeq.current = seq;

    const timer = setTimeout(async () => {
      try {
        const result = await previewTopicSplitAction(topic.id, partCount);
        if (previewSeq.current !== seq) return;
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setError(null);
        setPreview({ count: partCount, parts: result.data });
      } catch (e) {
        if (previewSeq.current !== seq) return;
        setError(e instanceof Error ? e.message : 'Xəta baş verdi');
      }
    }, PREVIEW_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [advice, partCount, topic.id]);

  async function handleSplit() {
    setError(null);
    setSplitting(true);
    try {
      const result = await splitTopicAction(topic.id, partCount);
      if (!result.ok) {
        setError(result.error);
        setConfirming(false);
        return;
      }
      onSplit(result.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Xəta baş verdi');
      setConfirming(false);
    } finally {
      setSplitting(false);
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-primary/40 bg-primary/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="mono-label text-on-surface-variant uppercase">Mövzunu hissələrə böl</div>
        <Button variant="ghost" size="sm" isDisabled={splitting} onPress={onCancel}>
          Bağla
        </Button>
      </div>

      {loadingAdvice ? (
        <div className="mt-3 flex items-center gap-2 text-sm text-on-surface-variant">
          <Spinner size="sm" tone="current" />
          Bölgü təklifi hazırlanır…
        </div>
      ) : advice ? (
        <>
          <p className="mt-2 text-label-sm text-on-surface-variant">
            Tövsiyə: <span className="text-on-surface">{advice.recommendedParts} hissə</span> ·
            maksimum {advice.maxParts} hissə (mənbə mətni {advice.maxParts} parçadan ibarətdir).
          </p>
          <p className="mt-1 text-label-sm text-on-surface-variant italic">{advice.reason}</p>

          {advice.maxParts > 2 ? (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Slider
                className="min-w-56 flex-1"
                value={partCount}
                minValue={2}
                maxValue={advice.maxParts}
                step={1}
                isDisabled={splitting}
                onChange={(v) => setPartCount(Array.isArray(v) ? v[0] : v)}
              >
                <Label className="mono-label">Hissə sayı</Label>
                <Slider.Output />
                <Slider.Track>
                  <Slider.Fill />
                  <Slider.Thumb />
                </Slider.Track>
              </Slider>
              {previewing && (
                <span className="mono-label flex items-center gap-1.5 text-on-surface-variant">
                  <Spinner size="sm" tone="current" />
                  yenilənir…
                </span>
              )}
            </div>
          ) : (
            <p className="mono-label mt-3 text-on-surface-variant">
              Bu mövzu yalnız 2 hissəyə bölünə bilər.
            </p>
          )}

          <div className="mt-3 space-y-2">
            {parts.map((part) => (
              <div
                key={part.partIndex}
                className="rounded-lg border border-outline-variant/40 bg-surface/40 p-2.5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mono-label text-on-surface-variant">{part.partIndex + 1}.</span>
                  <span className="min-w-0 flex-1 text-sm font-medium text-on-surface">
                    {part.title}
                  </span>
                  <Chip size="sm" variant="soft" color="default" className="mono-label shrink-0">
                    {part.charCount} simvol
                  </Chip>
                  <Chip size="sm" variant="soft" color="default" className="mono-label shrink-0">
                    {part.chunkIds.length} parça
                  </Chip>
                </div>
                <p className="mt-1 text-label-sm text-on-surface-variant">{part.preview}</p>
              </div>
            ))}
          </div>

          {error && <p className="mono-label mt-3 text-danger">{error}</p>}

          {confirming ? (
            <div className="mt-3 rounded-xl border border-danger/40 bg-danger/10 p-3">
              <p className="text-sm font-medium text-danger">
                Bu əməliyyat geri qaytarıla bilməz.
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-label-sm text-on-surface-variant">
                <li>Bu mövzunun yaradılmış dərs materialı silinir.</li>
                <li>Bu mövzunun qaralama sualları silinir.</li>
                <li>
                  {partCount} hissənin hər biri materialı olmayan qaralama kimi yaradılır — material
                  və suallar yenidən yaradılmalıdır.
                </li>
              </ul>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  isPending={splitting}
                  isDisabled={splitting}
                  onPress={() => void handleSplit()}
                >
                  {({ isPending }) => (
                    <>
                      {isPending ? <Spinner size="sm" tone="current" /> : null}
                      Bəli, {partCount} hissəyə böl
                    </>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  isDisabled={splitting}
                  onPress={() => setConfirming(false)}
                >
                  İmtina
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-3">
              <Button
                variant="primary"
                size="sm"
                isDisabled={previewing || parts.length < 2}
                onPress={() => setConfirming(true)}
              >
                {partCount} hissəyə böl
              </Button>
            </div>
          )}
        </>
      ) : (
        <p className="mono-label mt-3 text-danger">{error ?? 'Bölgü təklifi alınmadı'}</p>
      )}
    </div>
  );
}
