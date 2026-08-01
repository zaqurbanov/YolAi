import { CoinIcon, EnergyIcon, CheckIcon, GiftIcon } from '@/components/icons';
import type { DailyGrantStatus } from '@/lib/coins/dailyGrant';

interface DailyGrantCardProps {
  status: DailyGrantStatus;
}

/**
 * "Günlük hədiyyə" — INFORMATIONAL ONLY. The grant is automatic since
 * 0094_two_currency_economy.sql: each Baku day both balances are topped up TO
 * the configured floor (never added to, never reduced), on the first
 * server-side read. There is no claim action and no client state left here.
 *
 * Styling deliberately stays on `glass-card`, matching every other shared
 * coin-page card (DailyQuizCard, AdWatchCard, DailyQuestCard) — those are
 * mounted unchanged across all three design trees (mobile Editorial, desktop,
 * 3D) and each tree scopes their chrome from the outside. Restyling this one
 * in isolation would make it the odd card out in whichever tree it wasn't
 * tested in.
 *
 * `status.applied` is effectively always true by the time a user sees this:
 * the grant is applied on the read that renders the page. It is kept because
 * it reads false when the migration hasn't been applied yet, which is exactly
 * when you want to notice.
 *
 * The two currencies are shown as two separate chips, never summed — they are
 * not interchangeable, and energy can never be converted back into coins.
 */
export default function DailyGrantCard({ status }: DailyGrantCardProps) {
  return (
    <div className="glass-card space-y-4 rounded-2xl p-6">
      <div className="flex items-center gap-3 border-b border-outline-variant/30 pb-4">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <GiftIcon />
        </div>
        <div>
          <h2 className="text-headline-md text-[18px]">Günlük hədiyyə</h2>
          <p className="text-legal-citation text-on-surface-variant">Hər gün avtomatik</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-legal-citation inline-flex items-center gap-1.5 rounded-full bg-safety-yellow/15 px-3 py-1.5 text-safety-yellow">
          <CoinIcon width={14} height={14} />
          {status.coins} coin
        </span>
        <span className="text-legal-citation inline-flex items-center gap-1.5 rounded-full bg-caution-orange/15 px-3 py-1.5 text-caution-orange">
          <EnergyIcon width={14} height={14} />
          {status.energy} enerji
        </span>
      </div>

      <p className="text-body-md text-on-surface-variant">
        Hər gün balansın avtomatik olaraq bu həddə qaldırılır. Balansın bu həddən çoxdursa, heç nə
        əlavə olunmur və mövcud balansın azalmır.
      </p>

      {status.applied && (
        <div className="flex items-center gap-2 rounded-xl border border-outline-variant/30 bg-go-green/5 px-4 py-3 text-body-md text-go-green">
          <CheckIcon width={16} height={16} />
          Bugünkü hədiyyə tətbiq olunub
        </div>
      )}
    </div>
  );
}
