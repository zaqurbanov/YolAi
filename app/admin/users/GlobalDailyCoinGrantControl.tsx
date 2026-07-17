'use client';

import { useEffect, useState } from 'react';
import { Chip, Button, TextField, Input, Skeleton } from '@heroui/react';
import { Spinner } from '@/components/Spinner';

interface DailyCoinGrantSettings {
  dailyCoinGrant: number;
  source: 'table' | 'default';
}

export default function GlobalDailyCoinGrantControl() {
  const [settings, setSettings] = useState<DailyCoinGrantSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [inputValue, setInputValue] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetch('/api/admin/chat-meta?type=daily-coin-grant');
      if (res.ok && !cancelled) {
        const data: DailyCoinGrantSettings = await res.json();
        setSettings(data);
        setInputValue(String(data.dailyCoinGrant));
      }
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(dailyCoinGrant: number | null) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/chat-meta?type=daily-coin-grant', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dailyCoinGrant }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? 'Ayarı yeniləmək uğursuz oldu');
        return;
      }
      setSettings(data);
      setInputValue(String(data.dailyCoinGrant));
    } finally {
      setPending(false);
    }
  }

  function handleSave() {
    const trimmed = inputValue.trim();
    if (trimmed === '') {
      setError('Limit müsbət tam ədəd olmalıdır');
      return;
    }
    const value = Number(trimmed);
    if (!Number.isInteger(value) || value <= 0) {
      setError('Limit müsbət tam ədəd olmalıdır');
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
        <div className="mono-label text-on-surface-variant uppercase">Gündəlik veriləcək coin (qlobal)</div>
        {loading ? (
          <Skeleton className="h-6 w-32 mt-2 rounded-full" />
        ) : (
          <div className="mt-1 flex items-center gap-2">
            <span className="text-xl font-semibold text-on-surface">{settings?.dailyCoinGrant}</span>
            <Chip size="sm" variant="soft" color={settings?.source === 'table' ? 'accent' : 'default'} className="mono-label">
              {settings?.source === 'table' ? 'admin təyin edib' : 'standart'}
            </Chip>
          </div>
        )}
      </div>

      {!loading && (
        <div className="flex items-center gap-2 flex-wrap">
          <TextField
            type="number"
            value={inputValue}
            onChange={setInputValue}
            className="w-32"
            aria-label="Qlobal gündəlik veriləcək coin"
          >
            <Input min={1} max={100000} />
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
