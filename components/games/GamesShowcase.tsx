'use client';

import { useState } from 'react';
import Link from 'next/link';
import AnimatedNumber from '@/components/AnimatedNumber';
import { ArrowRightIcon, CoinIcon, EnergyIcon } from '@/components/icons';
import { GAME_SLUGS, GAMES } from '@/lib/coins/gameCatalog';
import FeatureRail from '@/components/home/FeatureRail';

interface GamesShowcaseProps {
  initialBalance: number;
  initialEnergy: number;
  maxEnergy: number;
}

const TONE_CLASSES: Record<string, { spine: string; chip: string }> = {
  'regulatory-blue': { spine: 'bg-regulatory-blue', chip: 'bg-regulatory-blue/12 text-regulatory-blue' },
  'go-green': { spine: 'bg-go-green', chip: 'bg-go-green/12 text-go-green' },
  'safety-yellow': { spine: 'bg-safety-yellow', chip: 'bg-safety-yellow/12 text-safety-yellow' },
  'caution-orange': { spine: 'bg-caution-orange', chip: 'bg-caution-orange/12 text-caution-orange' },
};

/**
 * Replaces GamesSection's tab strip. The three games used to share one card and
 * one set of tabs, which meant the board rendered in whatever height was left
 * inside that card — cramped, and only one game visible at a time.
 *
 * Now this is a full-height showcase of three entry cards, and each opens its
 * own page at /coin-qazan/<slug>. The energy meter stays here as the shared
 * overview readout; the coin→energy purchase now lives in the dedicated
 * EnergyConverterCard on /coin-qazan and the compact converter on each game page.
 */
export default function GamesShowcase({
  initialBalance,
  initialEnergy,
  maxEnergy,
}: GamesShowcaseProps) {
  const [balance, setBalance] = useState(initialBalance);
  const [energy, setEnergy] = useState(initialEnergy);

  return (
    <div className="flex min-h-0 flex-col md:min-h-[80svh]">
      {/* The tall min-height is a desktop terminal affordance. On mobile the
          showcase sits at the top of the /coin-qazan page with the wheel right
          below it — forcing 80svh here left a huge empty gap above the Çarx
          card, so mobile takes natural height instead. */}
      {/* Shared meters. Energy accumulates across days since 0094, so it can
          exceed maxEnergy (the daily top-up size) — show the true balance and
          drop the "/max" denominator once it no longer bounds it. */}
      <div className="flex flex-col gap-2 rounded-2xl border border-border/40 bg-surface p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full bg-caution-orange/15 px-3 py-1 text-caution-orange">
            <EnergyIcon width={16} height={16} />
            <span className="text-body-md font-semibold tabular-nums">
              {energy > maxEnergy ? energy : `${energy}/${maxEnergy}`}
            </span>
          </span>
          <span className="flex items-center gap-1.5 rounded-full bg-safety-yellow/15 px-3 py-1 text-safety-yellow">
            <CoinIcon width={16} height={16} />
            <AnimatedNumber value={balance} className="text-body-md font-semibold tabular-nums" />
          </span>
        </div>
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
