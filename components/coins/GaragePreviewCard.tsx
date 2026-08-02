'use client';

import Link from 'next/link';
import type { CSSProperties } from 'react';
import { useSnapRail } from '@/components/home/SnapRail';
import { STAGE_TONES, perkLine } from '@/components/coins/garageStage';
import { CoinIcon, CheckIcon, LockIcon, FineIcon } from '@/components/icons';
import type { CarTier } from '@/lib/garage/carTiers';
import type { UserGarageEntry } from '@/lib/garage/garage';
import type { ActiveGaragePerk } from '@/lib/garage/perks';

interface GaragePreviewCardProps {
  tiers: CarTier[];
  garage: UserGarageEntry;
  coinBalance: number;
  perk: ActiveGaragePerk;
}

// Compact replacement for the full GarageCard on /coin-qazan: one carousel
// slide per tier (lock icons on unowned cars), pure display + a link to the
// full showroom at /coin-qazan/qaraj — deliberately NO purchase buttons or
// server actions here, so the card stays a teaser and buying lives in one
// place. The same element is mounted by the mobile shell, the desktop grid and
// the 3D tree (the page passes it to all three unchanged), so it must render
// fine at a ~375px phone width AND inside a half-width desktop grid cell —
// the slide width is capped with max-w-[320px] so the rail never overflows
// either container. useSnapRail (home/SnapRail.tsx) owns the rail: spread
// railProps onto the scroll container (it already binds ref + pointer/scroll
// handlers, so no extra ref/onScroll here), and let active/goTo feed the dots.
export default function GaragePreviewCard({ tiers, garage, coinBalance, perk }: GaragePreviewCardProps) {
  const { active, railProps, goTo } = useSnapRail<HTMLDivElement>(tiers.length);

  if (tiers.length === 0) return null;

  // Perk is a server-computed snapshot for garage.tierId at page load. This
  // card has no purchase path (unlike GarageCard), so there's no same-session
  // state to go stale — but the fined/perk precedence must match GarageCard:
  // a fine suppresses the perk line server-side too, and showing that as
  // silence reads like a bug, so the fine gets its own explicit line.
  const activePerkLine = perkLine(perk);

  return (
    <div className="glass-card rounded-2xl p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 border-b border-outline-variant/30 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <span aria-hidden className="text-lg">🚗</span>
          </div>
          <h2 className="text-headline-md text-[18px]">Virtual Qaraj</h2>
        </div>
        <Link
          href="/coin-qazan/qaraj"
          className="shrink-0 text-[11px] font-bold uppercase tracking-[0.1em] text-primary transition hover:opacity-70"
        >
          Bütün qaraja bax
        </Link>
      </div>

      {/* Product-shot rail — same car-stage/car-glyph/car-locked language as
          GarageCard's hero, one slide per tier. The rail bleeds to the card's
          edges (-mx-6/px-6) like FeatureRail; overflow-y-hidden is load-bearing
          so PullToRefresh's findScrollParent doesn't mistake this rail for the
          page scroller (same rationale as FeatureRail). */}
      <div
        {...railProps}
        className="no-scrollbar -mx-6 flex snap-x snap-mandatory gap-4 overflow-x-auto overflow-y-hidden px-6 pb-2 touch-pan-y select-none"
      >
        {tiers.map((tier, index) => {
          const owned = tier.id === garage.tierId;
          const affordable = coinBalance >= tier.coinPrice;
          const stageTone = STAGE_TONES[index % STAGE_TONES.length];

          return (
            <div key={tier.id} className="w-[78vw] max-w-[320px] shrink-0 snap-start">
              <div
                className={
                  'car-stage relative overflow-hidden rounded-[1.5rem] border ' +
                  (owned ? 'border-border/40' : 'car-locked border-border/40')
                }
                style={{ '--stage-tone': stageTone } as CSSProperties}
              >
                <div className="relative z-10 flex flex-col items-center px-6 pt-7 pb-6 text-center">
                  <span aria-hidden className="car-glyph text-[64px]">
                    {tier.emoji}
                  </span>

                  <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.14em] text-on-surface-variant">
                    Dərəcə {index + 1}
                  </p>
                  <h3 className="mt-1 text-[20px] font-bold tracking-tight text-on-surface">
                    {tier.name}
                  </h3>

                  {owned ? (
                    <div className="mt-3 space-y-2">
                      <p className="inline-flex items-center gap-1.5 rounded-full bg-go-green/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-go-green">
                        <CheckIcon width={12} height={12} strokeWidth={3} />
                        Sənindir
                      </p>
                      {garage.isFined ? (
                        <p className="inline-flex items-center gap-1.5 rounded-full bg-danger/12 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-danger">
                          <FineIcon width={12} height={12} />
                          Cəriməli — perk dayandırılıb
                        </p>
                      ) : (
                        activePerkLine && (
                          <p className="rounded-full bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary">
                            {activePerkLine}
                          </p>
                        )
                      )}
                    </div>
                  ) : (
                    // Price pill dims when unaffordable — same affordability
                    // signal GarageCard's rows use, minus the buy button.
                    <p
                      className={`mt-3 inline-flex items-center gap-1.5 rounded-full bg-surface-tertiary px-3 py-1 text-[12px] font-bold tabular-nums text-on-surface-variant ${
                        affordable ? '' : 'opacity-70'
                      }`}
                    >
                      {tier.coinPrice}
                      <CoinIcon width={13} height={13} className="text-primary" />
                    </p>
                  )}
                </div>

                {owned ? (
                  <span className="absolute top-3 right-3 flex size-7 items-center justify-center rounded-full bg-go-green text-white">
                    <CheckIcon width={14} height={14} strokeWidth={3} />
                  </span>
                ) : (
                  <span className="absolute top-3 right-3 flex size-7 items-center justify-center rounded-full bg-surface-tertiary text-on-surface-variant">
                    <LockIcon width={13} height={13} />
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Counter + dot row — the carousel affordance (peek + snap is on the
          rail itself, this is the explicit "how many remain" signal). */}
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-bold uppercase tracking-[0.1em] text-on-surface-variant tabular-nums">
          {String(active + 1).padStart(2, '0')} / {String(tiers.length).padStart(2, '0')}
        </span>
        <div className="flex items-center gap-1.5">
          {tiers.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`${i + 1}-ci dərəcəyə keç`}
              aria-current={i === active ? 'true' : undefined}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === active ? 'w-6 bg-primary' : 'w-1.5 bg-on-surface-variant/25'
              }`}
            />
          ))}
        </div>
      </div>

      {/* The ONLY way into the full showroom — purchases live on
          /coin-qazan/qaraj, this card is display + link only. */}
      <Link
        href="/coin-qazan/qaraj"
        className="flex w-full items-center justify-center rounded-full bg-primary px-6 py-3 text-[11px] font-bold uppercase tracking-[0.1em] text-on-primary transition hover:opacity-90 active:scale-[0.98]"
      >
        Qarajı aç
      </Link>
    </div>
  );
}
