'use client';

import { useEffect, useState } from 'react';
import { Button, Skeleton, TextField, Input } from '@heroui/react';
import { Spinner } from '@/components/Spinner';

interface WheelPrize {
  value: number;
  weight: number;
}

const ENDPOINT = '/api/admin/chat-meta?type=wheel-prizes';
const SLOT_COUNT = 10;

// All 10 segments are edited together and saved in ONE request (not
// per-row, unlike GameRewardsControl) — the server requires exactly 10
// entries whose weights sum to 100, so a partial save could never be valid
// on its own.
export default function WheelPrizesControl() {
  const [rows, setRows] = useState<{ value: string; weight: string }[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetch(ENDPOINT);
      if (res.ok && !cancelled) {
        const data: { prizes: WheelPrize[] } = await res.json();
        setRows(data.prizes.map((p) => ({ value: String(p.value), weight: String(p.weight) })));
      }
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const weightSum = (rows ?? []).reduce((sum, r) => sum + (Number(r.weight) || 0), 0);
  const sumOk = Math.abs(weightSum - 100) < 0.01;

  function updateRow(index: number, field: 'value' | 'weight', v: string) {
    setRows((prev) => {
      if (!prev) return prev;
      const next = prev.slice();
      next[index] = { ...next[index], [field]: v };
      return next;
    });
  }

  async function handleSave() {
    if (!rows) return;
    setError(null);

    const parsed: WheelPrize[] = [];
    for (const row of rows) {
      const value = Number(row.value);
      const weight = Number(row.weight);
      if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(weight) || weight <= 0) {
        setError('Hər sətirdə coin dəyəri və faiz müsbət ədəd olmalıdır');
        return;
      }
      parsed.push({ value, weight });
    }
    if (!sumOk) {
      setError(`Faizlərin cəmi 100 olmalıdır, hazırda ${weightSum}%`);
      return;
    }

    setPending(true);
    try {
      const res = await fetch(ENDPOINT, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prizes: parsed }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? 'Ayarı yeniləmək uğursuz oldu');
        return;
      }
      const saved: WheelPrize[] = data.prizes;
      setRows(saved.map((p) => ({ value: String(p.value), weight: String(p.weight) })));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="glass-card rounded-2xl p-4 lg:col-span-2">
      <div className="flex items-center justify-between">
        <div className="mono-label text-on-surface-variant uppercase">Çarx — slotlar</div>
        <span className={`mono-label ${sumOk ? 'text-go-green' : 'text-danger'}`}>
          Cəmi: {loading ? '—' : `${Math.round(weightSum * 100) / 100}%`}
        </span>
      </div>
      <p className="mt-1 text-label-sm text-on-surface-variant">
        10 slot — hər birinin öz coin dəyəri və qazanma faizi. Faizlərin cəmi dəqiq 100% olmalıdır.
      </p>

      {loading || !rows ? (
        <div className="mt-4 space-y-2">
          {Array.from({ length: SLOT_COUNT }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {rows.map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="mono-label w-6 shrink-0 text-on-surface-variant">#{i + 1}</span>
              <TextField
                type="number"
                value={row.value}
                onChange={(v) => updateRow(i, 'value', v)}
                className="w-24"
                aria-label={`Slot ${i + 1} coin dəyəri`}
              >
                <Input min={0.01} step={0.01} />
              </TextField>
              <span className="text-label-sm text-on-surface-variant">coin</span>
              <TextField
                type="number"
                value={row.weight}
                onChange={(v) => updateRow(i, 'weight', v)}
                className="w-24"
                aria-label={`Slot ${i + 1} faizi`}
              >
                <Input min={0.01} max={100} step={0.01} />
              </TextField>
              <span className="text-label-sm text-on-surface-variant">%</span>
            </div>
          ))}

          {error && <p className="mono-label text-danger">{error}</p>}

          <Button
            variant="outline"
            size="sm"
            isPending={pending}
            isDisabled={!sumOk}
            onPress={() => void handleSave()}
            className="mt-2"
          >
            {({ isPending: p }) => (
              <>
                {p ? <Spinner size="sm" tone="current" /> : null}
                Yadda saxla
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
