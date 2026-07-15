import { formatAzDateTime } from '@/lib/format/date';
import { formatCoinBalance } from '@/lib/format/coins';
import type { TransferRow } from '@/lib/coins/transfers';

interface TransferHistoryListProps {
  sent: TransferRow[];
  received: TransferRow[];
}

type CombinedRow = TransferRow & { direction: 'sent' | 'received' };

// Server-rendered (no client fetch) — getTransferHistory is read directly in
// app/account/page.tsx, same pattern as getCoinBalanceStatus already used
// there. Combines sent+received into one chronological list with a
// sent/received indicator, per the task brief's "two lists or a combined
// chronological list" choice.
export default function TransferHistoryList({ sent, received }: TransferHistoryListProps) {
  const combined: CombinedRow[] = [
    ...sent.map((row) => ({ ...row, direction: 'sent' as const })),
    ...received.map((row) => ({ ...row, direction: 'received' as const })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div className="glass-card rounded-2xl p-6 space-y-4">
      <h2 className="mono-label uppercase text-on-surface-variant">Köçürmə tarixçəsi</h2>

      {combined.length === 0 ? (
        <p className="text-sm text-on-surface-variant">Hələ heç bir coin köçürməsi yoxdur.</p>
      ) : (
        <ul className="space-y-2">
          {combined.map((row) => (
            <li
              key={row.id}
              className="flex items-center justify-between gap-4 rounded-xl border border-outline-variant/40 px-4 py-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`mono-label rounded-full px-2 py-0.5 text-[10px] uppercase ${
                      row.direction === 'sent'
                        ? 'bg-error-container/30 text-error'
                        : 'bg-secondary-container/40 text-secondary'
                    }`}
                  >
                    {row.direction === 'sent' ? 'Göndərilib' : 'Alınıb'}
                  </span>
                  <span className="truncate text-sm text-on-surface">{row.counterpartyLabel}</span>
                </div>
                <p className="mt-1 text-xs text-on-surface-variant">{formatAzDateTime(row.createdAt)}</p>
              </div>
              <div
                className={`mono-label shrink-0 text-sm font-semibold ${
                  row.direction === 'sent' ? 'text-error' : 'text-on-surface'
                }`}
              >
                {row.direction === 'sent' ? '-' : '+'}
                {formatCoinBalance(row.amount)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
