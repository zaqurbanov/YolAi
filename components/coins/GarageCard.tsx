'use client';

import { useState, useTransition } from 'react';
import { Button, Chip } from '@heroui/react';
import { Spinner } from '@/components/Spinner';
import { purchaseCarTierAction } from '@/app/coin-qazan/actions';
import { CoinIcon, CheckIcon, LockIcon, FineIcon } from '@/components/icons';
import RedemptionExamModal from '@/components/coins/RedemptionExamModal';
import type { CarTier } from '@/lib/garage/carTiers';
import type { UserGarageEntry } from '@/lib/garage/garage';
import type { ActiveGaragePerk } from '@/lib/garage/perks';

interface GarageCardProps {
  tiers: CarTier[];
  garage: UserGarageEntry;
  coinBalance: number;
  perk: ActiveGaragePerk;
}

function perkLine(perk: ActiveGaragePerk): string | null {
  if (perk.xoBonusPct > 0) return `🎁 Aktiv perk: XO-da +${perk.xoBonusPct}% coin`;
  if (perk.energyBonus > 0) return `🎁 Aktiv perk: +${perk.energyBonus} gündəlik enerji`;
  if (perk.chatDailyBonus > 0) return `🎁 Aktiv perk: +${perk.chatDailyBonus} gündəlik pulsuz sual`;
  return null;
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

  return (
    <div className="glass-card rounded-2xl p-6 space-y-4">
      <div className="flex items-center gap-3 border-b border-outline-variant/30 pb-4">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <span aria-hidden className="text-lg">🚗</span>
        </div>
        <h2 className="text-headline-md text-[18px]">Virtual Qaraj</h2>
      </div>

      <div className="flex items-center gap-4 rounded-xl border border-outline-variant/30 bg-surface-container-high/40 p-4">
        <span aria-hidden className="text-4xl leading-none">
          {currentGarage.tierEmoji}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-legal-citation text-on-surface-variant">Sənin avtomobilin</p>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-headline-md text-[16px] text-on-surface">{currentGarage.tierName}</p>
            {currentGarage.isFined && (
              <Chip size="sm" variant="soft" color="danger" className="gap-1 uppercase tracking-wide">
                <FineIcon width={12} height={12} />
                Cəriməli
              </Chip>
            )}
          </div>
          {currentGarage.isFined ? (
            <p className="text-legal-citation text-danger">Cərimə aktivdir, perk dayandırılıb</p>
          ) : (
            activePerkLine && <p className="text-legal-citation text-on-surface-variant">{activePerkLine}</p>
          )}
        </div>
      </div>

      {currentGarage.isFined && (
        <RedemptionExamModal
          onCleared={() => setCurrentGarage((prev) => ({ ...prev, isFined: false }))}
        />
      )}

      <ul className="space-y-2">
        {tiers.map((tier) => {
          const owned = tier.id === currentGarage.tierId;
          const affordable = balance >= tier.coinPrice;
          const rowPending = isPending && pendingTierId === tier.id;
          const rowError = errorByTier[tier.id];

          return (
            <li
              key={tier.id}
              className={
                'flex items-center gap-3 rounded-xl border px-3 py-2.5 ' +
                (owned
                  ? 'border-go-green/40 bg-go-green/5'
                  : affordable
                    ? 'border-outline-variant/30'
                    : 'border-outline-variant/20 opacity-60')
              }
            >
              <span aria-hidden className="text-2xl leading-none">
                {tier.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-body-md font-medium text-on-surface">{tier.name}</p>
                {rowError && <p className="text-legal-citation text-danger">{rowError}</p>}
              </div>

              {owned ? (
                <Chip size="sm" variant="soft" color="success" className="gap-1">
                  <CheckIcon width={12} height={12} />
                  sənindir
                </Chip>
              ) : (
                <div className="flex shrink-0 items-center gap-2">
                  <span className="flex items-center gap-1 text-body-md text-on-surface-variant tabular-nums">
                    <CoinIcon width={14} height={14} />
                    {tier.coinPrice}
                  </span>
                  <Button
                    variant={affordable ? 'primary' : 'outline'}
                    size="sm"
                    isDisabled={!affordable}
                    isPending={rowPending}
                    onPress={() => handlePurchase(tier.id)}
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
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
