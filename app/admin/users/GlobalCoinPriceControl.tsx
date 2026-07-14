'use client';

import { useEffect, useState } from 'react';
import { Chip, Button, TextField, Input, Skeleton } from '@heroui/react';
import { Spinner } from '@/components/Spinner';

interface CoinPriceSettings {
  price: number;
  source: 'table' | 'default';
}

export default function GlobalCoinPriceControl() {
  const [settings, setSettings] = useState<CoinPriceSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [inputValue, setInputValue] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetch('/api/admin/chat-meta?type=coin-price');
      if (res.ok && !cancelled) {
        const data: CoinPriceSettings = await res.json();
        setSettings(data);
        setInputValue(String(data.price));
      }
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(price: number | null) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/chat-meta?type=coin-price', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ price }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? 'Ayarı yeniləmək uğursuz oldu');
        return;
      }
      setSettings(data);
      setInputValue(String(data.price));
    } finally {
      setPending(false);
    }
  }

  function handleSave() {
    const trimmed = inputValue.trim();
    if (trimmed === '') {
      setError('Qiymət müsbət ədəd olmalıdır');
      return;
    }
    const value = Number(trimmed);
    if (!Number.isFinite(value) || value <= 0 || value > 10000) {
      setError('Qiymət 0-10000 arasında müsbət ədəd olmalıdır');
      return;
    }
    void save(value);
  }

  function handleReset() {
    void save(null);
  }

  return (
    <div className="glass-card rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-4 sm:justify-between">
      <div>
        <div className="mono-label text-on-surface-variant uppercase">Mesaj başına coin qiyməti (qlobal)</div>
        {loading ? (
          <Skeleton className="h-6 w-32 mt-2 rounded-full" />
        ) : (
          <div className="mt-1 flex items-center gap-2">
            <span className="text-xl font-semibold text-on-surface">{settings?.price}</span>
            <Chip size="sm" variant="soft" color={settings?.source === 'table' ? 'accent' : 'default'} className="mono-label">
              {settings?.source === 'table' ? 'admin təyin edib' : 'standart'}
            </Chip>
          </div>
        )}
      </div>

      {!loading && (
        <div className="flex items-center gap-2 flex-wrap">
          <TextField type="number" value={inputValue} onChange={setInputValue} className="w-32" aria-label="Qlobal coin qiyməti">
            <Input min={0.01} max={10000} step={0.01} />
          </TextField>
          <Button variant="outline" size="sm" isPending={pending} onPress={handleSave}>
            {({ isPending }) => (
              <>
                {isPending ? <Spinner size="sm" tone="current" /> : null}
                Yadda saxla
              </>
            )}
          </Button>
          {settings?.source === 'table' && (
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
