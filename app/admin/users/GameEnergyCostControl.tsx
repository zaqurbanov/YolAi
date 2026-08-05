'use client';

import { useEffect, useState } from 'react';
import { Button, Input, Skeleton, TextField } from '@heroui/react';
import { Spinner } from '@/components/Spinner';

type Source = 'table' | 'default';

interface Settings {
  gameEnergyCost: {
    value: number;
    source: Source;
  };
}

const ENDPOINT = '/api/admin/chat-meta?type=energy-tuning';

export default function GameEnergyCostControl() {
  const [setting, setSetting] = useState<Settings['gameEnergyCost'] | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function applySettings(data: Settings) {
    setSetting(data.gameEnergyCost);
    setInput(String(data.gameEnergyCost.value));
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetch(ENDPOINT);
      if (res.ok && !cancelled) {
        const data: { settings: Settings } = await res.json();
        applySettings(data.settings);
      }
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(value: number | null) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(ENDPOINT, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameEnergyCost: value }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? 'Ayarı yeniləmək uğursuz oldu');
        return;
      }
      applySettings(data.settings);
    } finally {
      setPending(false);
    }
  }

  function handleSave() {
    const value = Number(input.trim());
    if (input.trim() === '' || !Number.isFinite(value) || value < 0 || value > 1000) {
      setError('0-1000 arasında ədəd olmalıdır');
      return;
    }
    void save(value);
  }

  return (
    <div className="rounded-3xl border border-border/40 bg-surface p-6 shadow-sm">
      <div className="text-[12px] font-bold uppercase tracking-[0.1em] text-navy">Oyun enerjisi</div>
      <p className="mt-1 text-[13px] text-on-surface-variant">
        Hər oyun raunduna başlamaq üçün xərclənən enerji. 0 yazsan, oyunlar pulsuz olar.
      </p>

      {loading ? (
        <Skeleton className="mt-4 h-10 w-full rounded-xl" />
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <TextField
            type="number"
            value={input}
            onChange={setInput}
            className="w-28"
            aria-label="Oyun raundu üçün enerji xərci"
          >
            <Input min={0} max={1000} step={0.01} />
          </TextField>
          <Button variant="outline" size="sm" isPending={pending} onPress={handleSave} className="rounded-full">
            {({ isPending }) => (
              <>
                {isPending ? <Spinner size="sm" tone="current" /> : null}
                Yadda saxla
              </>
            )}
          </Button>
          {setting?.source === 'table' && (
            <Button variant="outline" size="sm" isDisabled={pending} onPress={() => void save(null)} className="rounded-full">
              Standarta qaytar
            </Button>
          )}
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] ${
              setting?.source === 'table' ? 'bg-primary/10 text-primary' : 'bg-surface-tertiary text-navy'
            }`}
          >
            {setting?.source === 'table' ? 'admin təyin edib' : 'standart'}
          </span>
        </div>
      )}

      {error && <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.08em] text-danger">{error}</p>}
    </div>
  );
}
