'use client';

import { useEffect, useState, useTransition } from 'react';
import { Chip, Button, Skeleton } from '@heroui/react';
import { Spinner } from '@/components/Spinner';
import { getEmbeddingStatus, setActiveEmbeddingModel, type EmbeddingStatus } from './embeddingActions';

type EmbeddingModel = EmbeddingStatus['activeModel'];

const MODEL_LABELS: Record<EmbeddingModel, string> = {
  local: 'Lokal model',
  gemini: 'Gemini',
};

export default function EmbeddingModelControl() {
  const [status, setStatus] = useState<EmbeddingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const data = await getEmbeddingStatus();
      if (!cancelled) {
        setStatus(data);
        setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  function handleSelect(model: EmbeddingModel) {
    setActionError(null);
    startTransition(async () => {
      const result = await setActiveEmbeddingModel(model);
      // activeModel is authoritative on both success and rejection — render from
      // it rather than from the optimistic click target.
      setStatus((prev) => (prev ? { ...prev, activeModel: result.activeModel } : prev));
      if (!result.ok) setActionError(result.error ?? 'Model dəyişdirilə bilmədi');
    });
  }

  const activeModel = status?.activeModel ?? 'local';
  const geminiReady = status?.geminiReady ?? false;

  return (
    <div className="glass-card rounded-2xl p-4 flex flex-col sm:flex-row sm:items-start gap-4 sm:justify-between">
      <div>
        <div className="mono-label text-on-surface-variant uppercase">Embedding modeli (qlobal)</div>
        {loading ? (
          <Skeleton className="h-6 w-32 mt-2 rounded-full" />
        ) : (
          <>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-xl font-semibold text-on-surface">{MODEL_LABELS[activeModel]}</span>
              <Chip size="sm" variant="soft" color={activeModel === 'gemini' ? 'accent' : 'default'} className="mono-label">
                {activeModel === 'gemini' ? 'admin təyin edib' : 'standart'}
              </Chip>
            </div>
            <div className="mt-1 mono-label text-on-surface-variant">
              Gemini əhatəsi: {status?.geminiChunks ?? 0} / {status?.totalChunks ?? 0} chunk
            </div>
            {status?.error && <div className="mt-1 mono-label text-on-surface-variant">{status.error}</div>}
          </>
        )}
      </div>

      {!loading && (
        <div className="flex flex-col items-start sm:items-end gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant={activeModel === 'local' ? 'primary' : 'outline'}
              size="sm"
              isPending={pending}
              onPress={() => handleSelect('local')}
            >
              {({ isPending }) => (
                <>
                  {isPending ? <Spinner size="sm" tone="current" /> : null}
                  Lokal model
                </>
              )}
            </Button>
            <Button
              variant={activeModel === 'gemini' ? 'primary' : 'outline'}
              size="sm"
              isPending={pending}
              isDisabled={!geminiReady}
              onPress={() => handleSelect('gemini')}
            >
              {({ isPending }) => (
                <>
                  {isPending ? <Spinner size="sm" tone="current" /> : null}
                  Gemini
                </>
              )}
            </Button>
          </div>
          {!geminiReady && (
            <span className="mono-label text-on-surface-variant sm:text-right max-w-xs">
              Gemini hələ hazır deyil — bütün chunk-lar üçün Gemini embedding-ləri yoxdur. Əvvəlcə backfill skriptini tam
              işə salın.
            </span>
          )}
          {actionError && <span className="mono-label text-danger sm:text-right max-w-xs">{actionError}</span>}
        </div>
      )}
    </div>
  );
}
