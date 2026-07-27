'use client';

import { useEffect, useState } from 'react';
import { Chip, Button, TextField, Input, Skeleton } from '@heroui/react';
import { Spinner } from '@/components/Spinner';

interface VipPlatePriceSettings {
  vipPlatePrice: number;
  source: 'table' | 'default';
}

// Copied structure from DailyChestRewardControl.tsx, retargeted to
// ?type=vip-plate-price / vipPlatePrice — a coin PRICE, not a 1-1000 reward,
// so the bound here is 1-100000 to match what PATCH actually enforces
// server-side (MAX_ALLOWED in app/api/admin/chat-meta/route.ts).
export default function VipPlatePriceControl() {
  const [settings, setSettings] = useState<VipPlatePriceSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [inputValue, setInputValue] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetch('/api/admin/chat-meta?type=vip-plate-price');
      if (res.ok && !cancelled) {
        const data: VipPlatePriceSettings = await res.json();
        setSettings(data);
        setInputValue(String(data.vipPlatePrice));
      }
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(vipPlatePrice: number | null) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/chat-meta?type=vip-plate-price', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vipPlatePrice }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? 'Ayarı yeniləmək uğursuz oldu');
        return;
      }
      setSettings(data);
      setInputValue(String(data.vipPlatePrice));
    } finally {
      setPending(false);
    }
  }

  function handleSave() {
    const trimmed = inputValue.trim();
    if (trimmed === '') {
      setError('Qiymət 1-100000 arasında tam ədəd olmalıdır');
      return;
    }
    const value = Number(trimmed);
    if (!Number.isInteger(value) || value <= 0 || value > 100000) {
      setError('Qiymət 1-100000 arasında tam ədəd olmalıdır');
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
        <div className="mono-label text-on-surface-variant uppercase">VIP nömrə qiyməti</div>
        {loading ? (
          <Skeleton className="h-6 w-32 mt-2 rounded-full" />
        ) : (
          <div className="mt-1 flex items-center gap-2">
            <span className="text-xl font-semibold text-on-surface">{settings?.vipPlatePrice}</span>
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
            aria-label="VIP nömrə qiyməti"
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
