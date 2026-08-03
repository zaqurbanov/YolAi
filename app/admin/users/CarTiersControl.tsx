'use client';

import { useEffect, useState } from 'react';
import { Button, TextField, Input, Skeleton } from '@heroui/react';
import { Spinner } from '@/components/Spinner';

interface CarTier {
  id: string;
  tierOrder: number;
  name: string;
  emoji: string;
  coinPrice: number;
}

interface RowState {
  inputValue: string;
  pending: boolean;
  error: string | null;
}

// Modeled on DailyChestRewardControl's fetch-on-mount/edit/save pattern, but
// for a multi-row catalog (car_tiers) instead of a single value — each row
// saves independently, so pending/error state is keyed per tier id rather
// than a single shared flag. Name/emoji are fixed catalog data, read-only
// here; only coinPrice is admin-editable.
export default function CarTiersControl() {
  const [tiers, setTiers] = useState<CarTier[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Record<string, RowState>>({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetch('/api/admin/chat-meta?type=car-tiers');
      if (res.ok && !cancelled) {
        const data: { tiers: CarTier[] } = await res.json();
        setTiers(data.tiers);
        setRows(
          Object.fromEntries(
            data.tiers.map((t) => [t.id, { inputValue: String(t.coinPrice), pending: false, error: null }])
          )
        );
      }
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  function setRowInput(tierId: string, value: string) {
    setRows((prev) => ({ ...prev, [tierId]: { ...prev[tierId], inputValue: value } }));
  }

  async function handleSave(tierId: string) {
    const row = rows[tierId];
    const trimmed = row.inputValue.trim();
    const value = Number(trimmed);
    if (trimmed === '' || !Number.isInteger(value) || value <= 0) {
      setRows((prev) => ({ ...prev, [tierId]: { ...prev[tierId], error: 'Qiymət müsbət tam ədəd olmalıdır' } }));
      return;
    }

    setRows((prev) => ({ ...prev, [tierId]: { ...prev[tierId], pending: true, error: null } }));
    try {
      const res = await fetch('/api/admin/chat-meta?type=car-tiers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tierId, coinPrice: value }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setRows((prev) => ({
          ...prev,
          [tierId]: { ...prev[tierId], pending: false, error: data?.error ?? 'Yeniləmək uğursuz oldu' },
        }));
        return;
      }
      const updated: CarTier = data.tier;
      setTiers((prev) => prev?.map((t) => (t.id === tierId ? updated : t)) ?? prev);
      setRows((prev) => ({
        ...prev,
        [tierId]: { inputValue: String(updated.coinPrice), pending: false, error: null },
      }));
    } catch {
      setRows((prev) => ({
        ...prev,
        [tierId]: { ...prev[tierId], pending: false, error: 'Yeniləmək uğursuz oldu' },
      }));
    }
  }

  return (
    <div className="rounded-3xl border border-border/40 bg-surface p-6 shadow-sm space-y-3 lg:col-span-2">
      <div className="text-[12px] font-bold uppercase tracking-[0.1em] text-navy">Virtual Qaraj — avtomobil qiymətləri</div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-10 w-full rounded-xl" />
        </div>
      ) : (
        <ul className="space-y-2 [&>li]:min-w-0">
          {tiers?.map((tier) => {
            const row = rows[tier.id];
            return (
              <li
                key={tier.id}
                className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 sm:justify-between rounded-2xl border border-border/40 bg-surface-tertiary/40 px-3 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span aria-hidden className="text-xl leading-none">
                    {tier.emoji}
                  </span>
                  <span className="truncate text-[14px] font-medium text-navy">{tier.name}</span>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <TextField
                    type="number"
                    value={row?.inputValue ?? ''}
                    onChange={(v) => setRowInput(tier.id, v)}
                    className="w-28"
                    aria-label={`${tier.name} qiyməti`}
                  >
                    <Input min={1} />
                  </TextField>
                  <Button
                    variant="outline"
                    size="sm"
                    isPending={row?.pending}
                    onPress={() => handleSave(tier.id)}
                    className="rounded-full"
                  >
                    {({ isPending }) => (
                      <>
                        {isPending ? <Spinner size="sm" tone="current" /> : null}
                        Yadda saxla
                      </>
                    )}
                  </Button>
                  {row?.error && <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-danger">{row.error}</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
