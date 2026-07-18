'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Chip, Button, Skeleton } from '@heroui/react';
import { Spinner } from '@/components/Spinner';

interface BackgroundImageSettings {
  url: string | null;
}

export default function BackgroundImageControl() {
  const [settings, setSettings] = useState<BackgroundImageSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetch('/api/admin/chat-meta?type=background-image');
      if (res.ok && !cancelled) {
        setSettings(await res.json());
      }
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleUpload() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError('Şəkil faylı seçin');
      return;
    }

    setPending(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set('file', file);

      const res = await fetch('/api/admin/chat-meta?type=background-image', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? 'Şəkli yükləmək uğursuz oldu');
        return;
      }
      setSettings(data);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } finally {
      setPending(false);
    }
  }

  async function handleReset() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/chat-meta?type=background-image', { method: 'DELETE' });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? 'Ayarı sıfırlamaq uğursuz oldu');
        return;
      }
      setSettings(data);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="glass-card rounded-2xl p-4 flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="mono-label text-on-surface-variant uppercase">Ana səhifə arxa fon şəkli</div>
          {loading ? (
            <Skeleton className="h-6 w-32 mt-2 rounded-full" />
          ) : (
            <div className="mt-1 flex items-center gap-2">
              <Chip size="sm" variant="soft" color={settings?.url ? 'accent' : 'default'} className="mono-label">
                {settings?.url ? 'admin təyin edib' : 'standart (/bg.png)'}
              </Chip>
            </div>
          )}
        </div>

        {!loading && (
          <div className="relative size-16 shrink-0 overflow-hidden rounded-lg border border-outline-variant/40 bg-surface-container-high">
            <Image
              src={settings?.url ?? '/bg.png'}
              alt="Cari arxa fon"
              fill
              unoptimized={Boolean(settings?.url)}
              className="object-cover"
            />
          </div>
        )}
      </div>

      {!loading && (
        <div className="flex items-center gap-2 flex-wrap">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            aria-label="Yeni arxa fon şəkli"
            className="text-label-sm text-on-surface-variant file:mr-3 file:rounded-lg file:border-0 file:bg-primary/15 file:px-3 file:py-1.5 file:text-label-sm file:text-primary"
          />
          <Button variant="outline" size="sm" isPending={pending} onPress={handleUpload}>
            {({ isPending }) => (
              <>
                {isPending ? <Spinner size="sm" tone="current" /> : null}
                Yüklə
              </>
            )}
          </Button>
          {settings?.url && (
            <Button variant="outline" size="sm" isPending={pending} onPress={handleReset}>
              Standarta qaytar
            </Button>
          )}
          {error && <span className="mono-label text-danger">{error}</span>}
        </div>
      )}
    </div>
  );
}
