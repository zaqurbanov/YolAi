'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import AnimatedNumber from '@/components/AnimatedNumber';
import { ArrowRightIcon, CoinIcon } from '@/components/icons';
import { purchaseEnergyAction } from '@/app/coin-qazan/actions';
import { GAME_SLUGS, GAMES } from '@/lib/coins/gameCatalog';
import FeatureRail from '@/components/home/FeatureRail';

interface GamesShowcaseProps {
  initialBalance: number;
  initialEnergy: number;
  maxEnergy: number;
  energyPurchaseCoinCost: number;
  energyPurchaseEnergyAmount: number;
}

const TONE_CLASSES: Record<string, { spine: string; chip: string }> = {
  'regulatory-blue': { spine: 'bg-regulatory-blue', chip: 'bg-regulatory-blue/12 text-regulatory-blue' },
  'go-green': { spine: 'bg-go-green', chip: 'bg-go-green/12 text-go-green' },
  'safety-yellow': { spine: 'bg-safety-yellow', chip: 'bg-safety-yellow/12 text-safety-yellow' },
};

/**
 * Replaces GamesSection's tab strip. The three games used to share one card and
 * one set of tabs, which meant the board rendered in whatever height was left
 * inside that card — cramped, and only one game visible at a time.
 *
 * Now this is a full-height showcase of three entry cards, and each opens its
 * own page at /coin-qazan/<slug>. The energy meter and the coin→energy purchase
 * stay here, because they are shared across all three and belong with the
 * overview rather than inside any one game.
 */
export default function GamesShowcase({
  initialBalance,
  initialEnergy,
  maxEnergy,
  energyPurchaseCoinCost,
  energyPurchaseEnergyAmount,
}: GamesShowcaseProps) {
  const [balance, setBalance] = useState(initialBalance);
  const [energy, setEnergy] = useState(initialEnergy);
  const [purchasing, setPurchasing] = useState(false);
  const [purchaseMessage, setPurchaseMessage] = useState<string | null>(null);
  const messageTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function handleBuyEnergy() {
    if (purchasing) return;
    setPurchasing(true);
    try {
      const result = await purchaseEnergyAction();
      if (result.status === 'success' && result.coinBalance != null && result.energy != null) {
        setBalance(result.coinBalance);
        setEnergy(result.energy);
        window.dispatchEvent(
          new CustomEvent('coin-balance-update', { detail: { balance: result.coinBalance } }),
        );
      }
      setPurchaseMessage(result.message);
      if (messageTimeout.current) clearTimeout(messageTimeout.current);
      messageTimeout.current = setTimeout(() => setPurchaseMessage(null), 4000);
    } finally {
      setPurchasing(false);
    }
  }

  return (
    <div className="flex min-h-[80svh] flex-col">
      {/* Shared meters. Same two-line layout the old header ended up with, so
          the convert button never overflows a narrow screen. */}
      <div className="flex flex-col gap-2 rounded-2xl border border-border/40 bg-surface p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full bg-caution-orange/15 px-3 py-1 text-caution-orange">
            <span aria-hidden>⚡</span>
            <span className="text-body-md font-semibold tabular-nums">
              {energy}/{maxEnergy}
            </span>
          </span>
          <span className="flex items-center gap-1.5 rounded-full bg-safety-yellow/15 px-3 py-1 text-safety-yellow">
            <CoinIcon width={16} height={16} />
            <AnimatedNumber value={balance} className="text-body-md font-semibold tabular-nums" />
          </span>
          <button
            type="button"
            onClick={handleBuyEnergy}
            disabled={purchasing}
            aria-label={`${energyPurchaseCoinCost} coin ver, ${energyPurchaseEnergyAmount} enerji al`}
            className="flex w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-primary/15 px-3 py-1.5 text-primary transition-opacity hover:bg-primary/25 disabled:opacity-50 sm:ml-auto sm:w-auto"
          >
            <span className="text-body-md font-semibold tabular-nums">{energyPurchaseCoinCost}</span>
            <CoinIcon width={14} height={14} />
            <span aria-hidden>→</span>
            <span aria-hidden>⚡</span>
            <span className="text-body-md font-semibold tabular-nums">
              +{energyPurchaseEnergyAmount}
            </span>
          </button>
        </div>
        {purchaseMessage && (
          <p className="text-legal-citation text-on-surface-variant">{purchaseMessage}</p>
        )}
      </div>

      <div className="mt-4 flex-1">
        <FeatureRail desktopClassName="md:grid-cols-3">
        {GAME_SLUGS.map((slug) => {
          const game = GAMES[slug];
          const tone = TONE_CLASSES[game.tone] ?? TONE_CLASSES['regulatory-blue'];
          return (
            <Link
              key={slug}
              href={`/coin-qazan/${slug}`}
              className="editorial-shadow group flex h-full flex-col overflow-hidden rounded-[1.5rem] border border-border/40 bg-surface transition hover:-translate-y-0.5 active:scale-[0.99]"
            >
              <div className="flex flex-1 items-start gap-4 p-6">
                <span aria-hidden className={`h-14 w-1.5 shrink-0 rounded-full ${tone.spine}`} />
                <div className="min-w-0 flex-1">
                  <span aria-hidden className="text-[32px] leading-none">
                    {game.emoji}
                  </span>
                  <h3 className="mt-2 text-[19px] font-bold tracking-tight text-on-surface">
                    {game.title}
                  </h3>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-on-surface-variant">
                    {game.description}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-dashed border-border/50 px-6 py-3.5">
                <span
                  className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ${tone.chip}`}
                >
                  {game.cost}
                </span>
                <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-primary transition-all group-hover:gap-2.5">
                  Oyna
                  <ArrowRightIcon width={13} height={13} />
                </span>
              </div>
            </Link>
          );
        })}
        </FeatureRail>
      </div>
    </div>
  );
}
