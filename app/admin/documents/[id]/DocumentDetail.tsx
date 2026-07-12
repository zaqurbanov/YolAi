'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, Chip, Button, Skeleton, EmptyState } from '@heroui/react';
import { Spinner } from '@/components/Spinner';

interface DocumentMeta {
  id: string;
  title: string;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  page_count: number | null;
  error_message: string | null;
  created_at: string;
}

interface ChunkStats {
  total: number;
  minLength: number;
  maxLength: number;
  avgLength: number;
  markerBased: number;
  fallback: number;
}

interface ChunkRow {
  id: string;
  content: string;
  page_number: number | null;
  article_label: string | null;
  chunk_index: number;
}

const STATUS_COLOR: Record<DocumentMeta['status'], 'default' | 'success' | 'danger' | 'warning'> = {
  pending: 'default',
  processing: 'warning',
  ready: 'success',
  failed: 'danger',
};

const PAGE_SIZE = 25;
const EMBEDDING_MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';

const dateFormatter = new Intl.DateTimeFormat('az-AZ', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function ContentPreview({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = content.length > 320;
  return (
    <div>
      <p className={expanded ? 'whitespace-pre-wrap' : 'whitespace-pre-wrap line-clamp-4'}>
        {content}
      </p>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mono-label text-primary hover:underline mt-1"
        >
          {expanded ? 'Gizlət' : 'Daha çox göstər'}
        </button>
      )}
    </div>
  );
}

export default function DocumentDetail({ id }: { id: string }) {
  const [document, setDocument] = useState<DocumentMeta | null>(null);
  const [chunkStats, setChunkStats] = useState<ChunkStats | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [chunks, setChunks] = useState<ChunkRow[]>([]);
  const [chunksTotal, setChunksTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingChunks, setLoadingChunks] = useState(true);

  const loadMeta = useCallback(async () => {
    setLoadingMeta(true);
    const res = await fetch(`/api/admin/documents/${id}`);
    if (res.status === 404) {
      setNotFound(true);
      setLoadingMeta(false);
      return;
    }
    if (res.ok) {
      const data = await res.json();
      setDocument(data.document);
      setChunkStats(data.chunkStats);
    }
    setLoadingMeta(false);
  }, [id]);

  const loadChunks = useCallback(
    async (targetPage: number) => {
      setLoadingChunks(true);
      const res = await fetch(
        `/api/admin/documents/${id}?chunks=1&page=${targetPage}&pageSize=${PAGE_SIZE}`
      );
      if (res.ok) {
        const data = await res.json();
        setChunks(data.chunks);
        setChunksTotal(data.total);
        setPage(data.page);
      }
      setLoadingChunks(false);
    },
    [id]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time fetch on mount
    void loadMeta();
    void loadChunks(1);
  }, [loadMeta, loadChunks]);

  const totalPages = Math.max(1, Math.ceil(chunksTotal / PAGE_SIZE));

  if (notFound) {
    return (
      <div className="pt-6 space-y-6">
        <Link href="/admin/documents" className="mono-label text-on-surface-variant hover:text-primary">
          ← Geri
        </Link>
        <div className="glass-panel rounded-2xl">
          <EmptyState className="flex flex-col items-center justify-center gap-2 py-16 text-sm text-on-surface-variant">
            Sənəd tapılmadı
          </EmptyState>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-6 space-y-8">
      <div>
        <Link href="/admin/documents" className="mono-label text-on-surface-variant hover:text-primary">
          ← Geri
        </Link>
      </div>

      {loadingMeta || !document ? (
        <div className="glass-card rounded-2xl p-6 space-y-3">
          <Skeleton className="h-7 w-64 rounded-full" />
          <Skeleton className="h-4 w-40 rounded-full" />
        </div>
      ) : (
        <div className="glass-card rounded-2xl p-6 space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold">{document.title}</h1>
            <Chip size="sm" color={STATUS_COLOR[document.status]}>
              {document.status}
            </Chip>
          </div>
          <div className="flex flex-wrap gap-6 mono-label text-on-surface-variant">
            <span>Səhifə: {document.page_count ?? '—'}</span>
            <span>Yaradılma tarixi: {dateFormatter.format(new Date(document.created_at))}</span>
          </div>
          {document.error_message && (
            <div className="rounded-xl bg-error-container/40 px-4 py-2 text-sm text-error">
              {document.error_message}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="glass-card">
          <Card.Content className="space-y-4">
            <h2 className="text-lg font-semibold">Bölünmə strategiyası</h2>
            {!chunkStats ? (
              <Skeleton className="h-24 w-full rounded-xl" />
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="glass-panel rounded-xl px-3 py-2">
                    <div className="mono-label text-on-surface-variant uppercase">Cəmi</div>
                    <div className="mt-1 text-xl font-semibold text-on-surface">{chunkStats.total}</div>
                  </div>
                  <div className="glass-panel rounded-xl px-3 py-2">
                    <div className="mono-label text-on-surface-variant uppercase">Min uzunluq</div>
                    <div className="mt-1 text-xl font-semibold text-on-surface">{chunkStats.minLength}</div>
                  </div>
                  <div className="glass-panel rounded-xl px-3 py-2">
                    <div className="mono-label text-on-surface-variant uppercase">Maks uzunluq</div>
                    <div className="mt-1 text-xl font-semibold text-on-surface">{chunkStats.maxLength}</div>
                  </div>
                  <div className="glass-panel rounded-xl px-3 py-2">
                    <div className="mono-label text-on-surface-variant uppercase">Orta uzunluq</div>
                    <div className="mt-1 text-xl font-semibold text-on-surface">{chunkStats.avgLength}</div>
                  </div>
                </div>
                <div className="space-y-2">
                  {(
                    [
                      { label: 'Maddə əsaslı (marker)', value: chunkStats.markerBased },
                      { label: 'Fallback (ölçü əsaslı)', value: chunkStats.fallback },
                    ] as const
                  ).map((row) => {
                    const widthPct = chunkStats.total
                      ? Math.max(2, (row.value / chunkStats.total) * 100)
                      : 0;
                    return (
                      <div key={row.label} className="flex items-center gap-3">
                        <span className="mono-label text-on-surface-variant w-44 shrink-0">
                          {row.label}
                        </span>
                        <div className="flex-1 h-5 rounded-full bg-surface-container-high overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary glow-primary"
                            style={{ width: `${widthPct}%` }}
                          />
                        </div>
                        <span className="mono-label text-on-surface w-10 shrink-0 text-right">
                          {row.value}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </Card.Content>
        </Card>

        <Card className="glass-card">
          <Card.Content className="space-y-2">
            <h2 className="text-lg font-semibold">Embedding modeli</h2>
            <p className="text-sm text-on-surface-variant">
              Embedding modeli: <span className="text-on-surface">{EMBEDDING_MODEL}</span> (384 ölçülü,
              lokal)
            </p>
            <p className="mono-label text-on-surface-variant">
              Bütün sənədlər üçün eyni model tətbiq olunur, xarici API çağırışı olmadan server üzərində
              lokal işləyir.
            </p>
          </Card.Content>
        </Card>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">Chunk-lar</h2>

        {loadingChunks && chunks.length === 0 ? (
          <div className="glass-panel rounded-2xl p-4 space-y-3">
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
          </div>
        ) : chunks.length === 0 ? (
          <div className="glass-panel rounded-2xl">
            <EmptyState className="flex flex-col items-center justify-center gap-2 py-16 text-sm text-on-surface-variant">
              Chunk yoxdur
            </EmptyState>
          </div>
        ) : (
          <div className="glass-panel rounded-2xl divide-y divide-outline-variant/30">
            {chunks.map((chunk) => (
              <div key={chunk.id} className="p-4 space-y-2">
                <div className="flex flex-wrap items-center gap-3 mono-label text-on-surface-variant">
                  <span>#{chunk.chunk_index}</span>
                  <span>Səhifə: {chunk.page_number ?? '—'}</span>
                  <span>Maddə: {chunk.article_label ?? '—'}</span>
                </div>
                <div className="text-sm text-on-surface">
                  <ContentPreview content={chunk.content} />
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between mt-4">
          <span className="mono-label text-on-surface-variant">
            {chunksTotal} chunk-dan {(page - 1) * PAGE_SIZE + 1}–
            {Math.min(page * PAGE_SIZE, chunksTotal)}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              isDisabled={page <= 1 || loadingChunks}
              onPress={() => loadChunks(page - 1)}
            >
              {loadingChunks && page > 1 ? <Spinner size="sm" tone="current" /> : null}
              Əvvəlki
            </Button>
            <span className="mono-label text-on-surface-variant">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              isDisabled={page >= totalPages || loadingChunks}
              onPress={() => loadChunks(page + 1)}
            >
              {loadingChunks && page < totalPages ? <Spinner size="sm" tone="current" /> : null}
              Növbəti
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
