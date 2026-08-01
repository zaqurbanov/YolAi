'use client';

import { useEffect, useState } from 'react';
import { Chip, Button, Skeleton, TextField, Input, ToggleButton, ToggleButtonGroup } from '@heroui/react';
import { Spinner } from '@/components/Spinner';
import type { MarathonRewardType, WeeklyMarathonSlot } from '@/lib/coins/weeklyMarathon';

interface WeeklyMarathonRow {
  type: MarathonRewardType;
  amount: string;
}

const ENDPOINT = '/api/admin/chat-meta?type=weekly-marathon';
// Streak-day labels, not weekdays: index 0 = streak day 1 (the first Baku day
// the user opens the chest), .. index 6 = streak day 7 (COINS). Per-user; a
// missed day resets to day 1, a completed day-7 cycle restarts at day 1.
const DAY_LABELS = ['Gün 1', 'Gün 2', 'Gün 3', 'Gün 4', 'Gün 5', 'Gün 6', 'Gün 7'];

// All 7 streak-day rewards are edited together and saved in ONE request (like
// WheelPrizesControl) — the server requires exactly 7 valid entries, so a
// partial save could never be accepted. The amount stays a string while
// editing (number inputs produce '' mid-edit) and is parsed+validated on save.
export default function WeeklyMarathonControl() {
  const [rows, setRows] = useState<WeeklyMarathonRow[] | null>(null);
  const [source, setSource] = useState<'table' | 'default'>('default');
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetch(ENDPOINT);
      if (res.ok && !cancelled) {
        const data: { schedule: WeeklyMarathonSlot[]; source: 'table' | 'default' } = await res.json();
        setRows(data.schedule.map((s) => ({ type: s.type, amount: String(s.amount) })));
        setSource(data.source);
      }
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  function updateAmount(index: number, v: string) {
    setRows((prev) => {
      if (!prev) return prev;
      const next = prev.slice();
      next[index] = { ...next[index], amount: v };
      return next;
    });
  }

  function updateType(index: number, type: MarathonRewardType) {
    setRows((prev) => {
      if (!prev) return prev;
      const next = prev.slice();
      next[index] = { ...next[index], type };
      return next;
    });
  }

  async function handleSave() {
    if (!rows) return;
    setError(null);

    const parsed: WeeklyMarathonSlot[] = [];
    for (const row of rows) {
      if (row.type !== 'energy' && row.type !== 'coins') {
        setError('Hər günün tipi Enerji və ya Coin olmalıdır');
        return;
      }
      const trimmed = row.amount.trim();
      const amount = Number(trimmed);
      if (trimmed === '' || !Number.isInteger(amount) || amount < 1 || amount > 1000) {
        setError('Hər mükafat 1-1000 arasında tam ədəd olmalıdır');
        return;
      }
      parsed.push({ type: row.type, amount });
    }

    setPending(true);
    try {
      const res = await fetch(ENDPOINT, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule: parsed }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? 'Ayarı yeniləmək uğursuz oldu');
        return;
      }
      const saved: WeeklyMarathonSlot[] = data.schedule;
      setRows(saved.map((s) => ({ type: s.type, amount: String(s.amount) })));
      setSource(data.source === 'table' ? 'table' : 'default');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="glass-card rounded-2xl p-4 lg:col-span-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="mono-label text-on-surface-variant uppercase">Həftəlik marafon — sandıq hədiyyələri</div>
        {!loading && (
          <Chip
            size="sm"
            variant="soft"
            color={source === 'table' ? 'accent' : 'default'}
            className="mono-label"
          >
            {source === 'table' ? 'admin təyin edib' : 'standart'}
          </Chip>
        )}
      </div>
      <p className="mt-1 text-label-sm text-on-surface-variant">
        Gün 1 = istifadəçinin sandığı açdığı İLK gündür (hər istifadəçi üçün fərdi), gün 7 COIN verir. Gün 1-6 ENERJİ
        verir. Bir gün buraxılarsa, marafon gün 1-ə qayıdır. Hər mükafat 1-1000 arasında tam ədəd olmalıdır.
      </p>

      {loading || !rows ? (
        <div className="mt-4 space-y-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {rows.map((row, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <span className="text-label-sm w-36 shrink-0 text-on-surface">{DAY_LABELS[i]}</span>
              <ToggleButtonGroup
                size="sm"
                disallowEmptySelection
                selectedKeys={[row.type]}
                onSelectionChange={(keys) => {
                  const key = [...keys][0];
                  if (key === 'energy' || key === 'coins') updateType(i, key);
                }}
                aria-label={`${DAY_LABELS[i]} — mükafat tipi`}
              >
                <ToggleButton id="energy">Enerji</ToggleButton>
                <ToggleButton id="coins">
                  <ToggleButtonGroup.Separator />
                  Coin
                </ToggleButton>
              </ToggleButtonGroup>
              <TextField
                type="number"
                value={row.amount}
                onChange={(v) => updateAmount(i, v)}
                className="w-24"
                aria-label={`${DAY_LABELS[i]} — mükafat miqdarı`}
              >
                <Input min={1} max={1000} step={1} />
              </TextField>
            </div>
          ))}

          {error && <p className="mono-label text-danger">{error}</p>}

          <Button
            variant="outline"
            size="sm"
            isPending={pending}
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
