'use client';

import { useState, useTransition, type CSSProperties } from 'react';
import { Button } from '@heroui/react';
import { Spinner } from '@/components/Spinner';
import { purchaseCarTierAction } from '@/app/coin-qazan/actions';
import { CoinIcon, CheckIcon, LockIcon, FineIcon } from '@/components/icons';
import RedemptionExamModal from '@/components/coins/RedemptionExamModal';
import { STAGE_TONES, perkLine } from '@/components/coins/garageStage';
import type { CarTier } from '@/lib/garage/carTiers';
import type { UserGarageEntry } from '@/lib/garage/garage';
import type { ActiveGaragePerk } from '@/lib/garage/perks';

interface GarageCardProps {
  tiers: CarTier[];
  garage: UserGarageEntry;
  coinBalance: number;
  perk: ActiveGaragePerk;
}

// Virtual Qaraj, Phase 1 — pure display + purchase, no perks/plates/fines.
// Any affordable tier is directly purchasable (no forced tier order): the
// list below never disables a tier because a lower one isn't owned, only
// because the user can't afford it yet. Mirrors DailyQuestCard's
// useTransition + coin-balance-update event pattern for the live balance.
export default function GarageCard({ tiers, garage, coinBalance, perk }: GarageCardProps) {
  const [currentGarage, setCurrentGarage] = useState(garage);
  const [balance, setBalance] = useState(coinBalance);
  const [pendingTierId, setPendingTierId] = useState<string | null>(null);
  const [errorByTier, setErrorByTier] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  function handlePurchase(tierId: string) {
    setErrorByTier((prev) => ({ ...prev, [tierId]: '' }));
    setPendingTierId(tierId);
    startTransition(async () => {
      const result = await purchaseCarTierAction(tierId);
      if (result.status === 'success' && result.tierId && result.tierName) {
        const newTierId = result.tierId;
        const newTierName = result.tierName;
        const tier = tiers.find((t) => t.id === newTierId);
        setCurrentGarage((prev) => ({
          tierId: newTierId,
          tierName: newTierName,
          tierEmoji: tier?.emoji ?? '',
          tierOrder: tier?.tierOrder ?? 0,
          // A tier purchase never clears an existing fine server-side
          // (purchase_car_tier's upsert only touches tier_id/purchased_at,
          // see 0089_car_fines.sql) — the optimistic update preserves
          // whatever fine state was already loaded rather than assuming false.
          isFined: prev.isFined,
        }));
        if (result.balance != null) {
          setBalance(result.balance);
          window.dispatchEvent(new CustomEvent('coin-balance-update', { detail: { balance: result.balance } }));
        }
      } else {
        setErrorByTier((prev) => ({ ...prev, [tierId]: result.message }));
      }
      setPendingTierId(null);
    });
  }

  if (tiers.length === 0) return null;

  // perk is a server-computed snapshot for garage.tierId at page load — only
  // show it while currentGarage still matches that tier, so a same-session
  // purchase can't display a stale/wrong perk before the next page load.
  // The server already zeroes every bonus while fined (perkLine would return
  // null on its own), but showing that as silence reads like a bug — an
  // explicit "perk dayandırılıb" line is clearer than an empty space.
  const activePerkLine = currentGarage.tierId === garage.tierId ? perkLine(perk) : null;

  const ownedIndex = tiers.findIndex((t) => t.id === currentGarage.tierId);
  const ownedTone = STAGE_TONES[(ownedIndex >= 0 ? ownedIndex : 0) % STAGE_TONES.length];

  return (
    <div className="glass-card rounded-2xl p-6 space-y-4">
      <div className="flex items-center gap-3 border-b border-outline-variant/30 pb-4">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <span aria-hidden className="text-lg">🚗</span>
        </div>
        <h2 className="text-headline-md text-[18px]">Virtual Qaraj</h2>
      </div>

      {/* Owned car as a product shot. The glyph sits on a lit pedestal with a
          cast shadow and a tier-coloured wash — the only treatment that makes
          an emoji read as a vehicle rather than as text. */}
      <div
        className={
          'car-stage relative overflow-hidden rounded-[1.5rem] border ' +
          (currentGarage.isFined ? 'border-danger/40' : 'border-border/40')
        }
        style={{ '--stage-tone': ownedTone } as CSSProperties}
      >
        <div className="relative z-10 flex flex-col items-center px-6 pt-8 pb-6 text-center">
          <span aria-hidden className="car-glyph text-[76px]">
            {currentGarage.tierEmoji}
          </span>

          <p className="mt-6 text-[10px] font-bold uppercase tracking-[0.14em] text-on-surface-variant">
            Sənin avtomobilin
          </p>
          <h3 className="mt-1 text-[24px] font-bold tracking-tight text-on-surface">
            {currentGarage.tierName}
          </h3>

          {ownedIndex >= 0 && (
            <div className="mt-4 flex items-center gap-1.5" aria-label={`Dərəcə ${ownedIndex + 1} / ${tiers.length}`}>
              {tiers.map((_, i) => (
                <span
                  key={i}
                  aria-hidden
                  className={`h-1.5 rounded-full transition-all ${
                    i <= ownedIndex ? 'w-7 bg-primary' : 'w-1.5 bg-on-surface-variant/25'
                  }`}
                />
              ))}
            </div>
          )}

          {currentGarage.isFined ? (
            <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-danger/12 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-danger">
              <FineIcon width={13} height={13} />
              Cəriməli — perk dayandırılıb
            </p>
          ) : (
            activePerkLine && (
              <p className="mt-4 rounded-full bg-primary/10 px-3 py-1.5 text-[12px] font-medium text-primary">
                {activePerkLine}
              </p>
            )
          )}
        </div>
      </div>

      {currentGarage.isFined && (
        <RedemptionExamModal
          onCleared={() => setCurrentGarage((prev) => ({ ...prev, isFined: false }))}
        />
      )}

      {/* Tier cards in the plate-market treatment from the Stitch "Coin Qazan
          (Editorial)" screen: a coloured spine, the name at display weight with
          wide tracking, a dashed rule, then tier label and price. The tiers
          used to be flat one-line rows, which is what made the section read as
          a list of settings rather than a showroom.

          The spine colour advances with the tier index, so the ladder is
          legible at a glance instead of every row looking identical. */}
      <ul className="space-y-3">
        {tiers.map((tier, index) => {
          const owned = tier.id === currentGarage.tierId;
          const affordable = balance >= tier.coinPrice;
          const rowPending = isPending && pendingTierId === tier.id;
          const rowError = errorByTier[tier.id];
          const stageTone = STAGE_TONES[index % STAGE_TONES.length];

          return (
            <li
              key={tier.id}
              className={
                'editorial-shadow overflow-hidden rounded-2xl border bg-surface transition ' +
                (owned
                  ? 'border-go-green/40'
                  : affordable
                    ? 'border-border/40'
                    : 'border-border/25 opacity-60')
              }
            >
              {/* Each tier gets a miniature of the hero's stage, so browsing
                  the ladder feels like walking a showroom rather than reading
                  a price list. Unowned cars are desaturated by .car-locked —
                  "behind glass", not merely dimmed. */}
              <div
                className={`car-stage flex items-center gap-4 px-5 py-4 ${owned ? '' : 'car-locked'}`}
                style={{ '--stage-tone': stageTone } as CSSProperties}
              >
                <span
                  aria-hidden
                  className="car-glyph relative z-10 w-[76px] shrink-0 text-center text-[42px]"
                >
                  {tier.emoji}
                </span>
                <div className="relative z-10 min-w-0 flex-1">
                  <p className="truncate text-[17px] font-bold tracking-tight text-on-surface">
                    {tier.name}
                  </p>
                  <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant">
                    Dərəcə {index + 1}
                  </p>
                </div>
                {owned && (
                  <span className="relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full bg-go-green text-white">
                    <CheckIcon width={14} height={14} strokeWidth={3} />
                  </span>
                )}
                {!owned && !affordable && (
                  <span className="relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-tertiary text-on-surface-variant">
                    <LockIcon width={13} height={13} />
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-dashed border-border/50 px-5 py-3.5">
                {owned ? (
                  <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-go-green">
                    <CheckIcon width={13} height={13} />
                    Sənindir
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-[15px] font-bold tabular-nums text-on-surface">
                    {tier.coinPrice}
                    <CoinIcon width={14} height={14} className="text-primary" />
                  </span>
                )}

                {!owned && (
                  <Button
                    variant={affordable ? 'primary' : 'outline'}
                    size="sm"
                    isDisabled={!affordable}
                    isPending={rowPending}
                    onPress={() => handlePurchase(tier.id)}
                    className="rounded-full"
                  >
                    {({ isPending: pending }) => (
                      <>
                        {pending ? (
                          <Spinner size="sm" tone="current" />
                        ) : affordable ? null : (
                          <LockIcon width={12} height={12} />
                        )}
                        Al
                      </>
                    )}
                  </Button>
                )}
              </div>

              {rowError && (
                <p className="border-t border-danger/20 bg-danger/5 px-5 py-2 text-[12px] text-danger">
                  {rowError}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
