'use client';

import { useEffect, useState } from 'react';
import { Chip, Button, TextField, Input, Skeleton } from '@heroui/react';
import { Spinner } from '@/components/Spinner';

interface DailyChestRewardSettings {
  dailyChestReward: number;
  source: 'table' | 'default';
}

export default function DailyChestRewardControl() {
  const [settings, setSettings] = useState<DailyChestRewardSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [inputValue, setInputValue] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetch('/api/admin/chat-meta?type=daily-chest-reward');
      if (res.ok && !cancelled) {
        const data: DailyChestRewardSettings = await res.json();
        setSettings(data);
        setInputValue(String(data.dailyChestReward));
      }
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(dailyChestReward: number | null) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/chat-meta?type=daily-chest-reward', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dailyChestReward }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? 'Ayarı yeniləmək uğursuz oldu');
        return;
      }
      setSettings(data);
      setInputValue(String(data.dailyChestReward));
    } finally {
      setPending(false);
    }
  }

  function handleSave() {
    const trimmed = inputValue.trim();
    if (trimmed === '') {
      setError('Mükafat 1-1000 arasında tam ədəd olmalıdır');
      return;
    }
    const value = Number(trimmed);
    if (!Number.isInteger(value) || value <= 0 || value > 1000) {
      setError('Mükafat 1-1000 arasında tam ədəd olmalıdır');
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
        <div className="mono-label text-on-surface-variant uppercase">Sandıq mükafatı — enerji (gündəlik missiyalar)</div>
        {loading ? (
          <Skeleton className="h-6 w-32 mt-2 rounded-full" />
        ) : (
          <div className="mt-1 flex items-center gap-2">
            <span className="text-xl font-semibold text-on-surface">{settings?.dailyChestReward}</span>
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
            aria-label="Sandıq mükafatı"
          >
            <Input min={1} max={1000} />
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
