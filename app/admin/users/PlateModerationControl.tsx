'use client';

import { useEffect, useState } from 'react';
import { Button, Skeleton } from '@heroui/react';
import { Spinner } from '@/components/Spinner';
import { formatAzDate } from '@/lib/format/date';

interface ModeratedPlate {
  plateNumber: string;
  ownerId: string | null;
  ownerEmail: string | null;
  pricePaid: number;
  claimedAt: string;
}

interface RowState {
  pending: boolean;
  error: string | null;
}

// List-with-delete-action variant of CarTiersControl.tsx's per-row
// pending/error pattern — action here removes the row from local state
// rather than saving it in place, since DELETE /plate-moderation frees the
// plate rather than editing it.
export default function PlateModerationControl() {
  const [plates, setPlates] = useState<ModeratedPlate[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Record<string, RowState>>({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetch('/api/admin/chat-meta?type=plate-moderation');
      if (res.ok && !cancelled) {
        const data: { plates: ModeratedPlate[] } = await res.json();
        setPlates(data.plates);
        setRows(Object.fromEntries(data.plates.map((p) => [p.plateNumber, { pending: false, error: null }])));
      }
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleRelease(plateNumber: string) {
    setRows((prev) => ({ ...prev, [plateNumber]: { pending: true, error: null } }));
    try {
      const res = await fetch('/api/admin/chat-meta?type=plate-moderation', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plateNumber }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setRows((prev) => ({
          ...prev,
          [plateNumber]: { pending: false, error: data?.error ?? 'Sərbəst buraxmaq uğursuz oldu' },
        }));
        return;
      }
      setPlates((prev) => prev?.filter((p) => p.plateNumber !== plateNumber) ?? prev);
      setRows((prev) => {
        const next = { ...prev };
        delete next[plateNumber];
        return next;
      });
    } catch {
      setRows((prev) => ({
        ...prev,
        [plateNumber]: { pending: false, error: 'Sərbəst buraxmaq uğursuz oldu' },
      }));
    }
  }

  return (
    <div className="rounded-3xl border border-border/40 bg-surface p-6 shadow-sm space-y-3 lg:col-span-2">
      <div>
        <div className="text-[12px] font-bold uppercase tracking-[0.1em] text-navy">VIP nömrələrin moderasiyası</div>
        <p className="mt-1 text-[13px] text-on-surface-variant">
          Sərbəst buraxmaq coin geri qaytarmır — bu yalnız moderasiya alətidir.
        </p>
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-10 w-full rounded-xl" />
        </div>
      ) : plates && plates.length === 0 ? (
        <p className="text-[14px] text-on-surface-variant">Hələ VIP nömrə alınmayıb</p>
      ) : (
        <ul className="space-y-2 [&>li]:min-w-0">
          {plates?.map((plate) => {
            const row = rows[plate.plateNumber];
            return (
              <li
                key={plate.plateNumber}
                className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 sm:justify-between rounded-2xl border border-border/40 bg-surface-tertiary/40 px-3 py-2"
              >
                <div className="min-w-0">
                  <span className="text-[12px] font-bold text-navy">{plate.plateNumber}</span>
                  <p className="truncate text-[13px] text-on-surface-variant">
                    {plate.ownerEmail ?? '—'} · {plate.pricePaid} coin · {formatAzDate(plate.claimedAt)}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap shrink-0">
                  <Button
                    variant="danger"
                    size="sm"
                    isPending={row?.pending}
                    onPress={() => handleRelease(plate.plateNumber)}
                    className="rounded-full"
                  >
                    {({ isPending }) => (
                      <>
                        {isPending ? <Spinner size="sm" tone="current" /> : null}
                        Sərbəst burax
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
