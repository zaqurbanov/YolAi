'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import MobileBottomTabBar from '@/components/home/MobileBottomTabBar';
import AnimatedNumber from '@/components/AnimatedNumber';
import { ArrowLeftIcon, CoinIcon, EnergyIcon } from '@/components/icons';
import type { GameMeta } from '@/lib/coins/gameCatalog';
import TicTacToeGame from './TicTacToeGame';
import SignSpeedGame from './SignSpeedGame';
import ExamSimulatorGame from './ExamSimulatorGame';

interface GamePageShellProps {
  meta: GameMeta;
  initialBalance: number;
  initialEnergy: number;
  maxEnergy: number;
  initialTodayCount: number;
  winReward: number;
}

/**
 * A whole page per game, replacing the three-tab strip that used to sit inside
 * a card on /coin-qazan. Layout follows the Stitch "X-O Oyunu" screen
 * (project 9832560642768971810, screen ac5f05a7099946098b0ee424639467dc):
 * centred title + tagline, a meter row, then the board on a large rounded
 * panel with soft blurred orbs behind it.
 *
 * The game components themselves are mounted unchanged — they own the server
 * actions that settle a round and move coins/energy, and this shell only holds
 * the shared meters and re-renders them from each settle response, exactly as
 * GamesSection did.
 */
export default function GamePageShell({
  meta,
  initialBalance,
  initialEnergy,
  maxEnergy,
  initialTodayCount,
  winReward,
}: GamePageShellProps) {
  const [balance, setBalance] = useState(initialBalance);
  const [energy, setEnergy] = useState(initialEnergy);
  const [todayCount, setTodayCount] = useState(initialTodayCount);
  const [xoUnavailable, setXoUnavailable] = useState(false);

  // Same ramp GamesSection used: every third game of the day is easy, the rest
  // are hard. Kept identical so moving the game to its own page doesn't
  // silently change its difficulty curve.
  const difficulty: 'easy' | 'hard' = todayCount % 3 === 0 ? 'easy' : 'hard';

  // Every authoritative number comes from a settle response; nothing here
  // derives an outcome or mutates a balance on its own.
  const handleSettled = useCallback((nextBalance: number, nextEnergy: number) => {
    setBalance(nextBalance);
    setEnergy(nextEnergy);
    window.dispatchEvent(
      new CustomEvent('coin-balance-update', { detail: { balance: nextBalance } }),
    );
  }, []);

  const handleXoSettled = useCallback(
    (nextBalance: number, nextEnergy: number) => {
      handleSettled(nextBalance, nextEnergy);
      setTodayCount((count) => count + 1);
    },
    [handleSettled],
  );

  return (
    // Bottom clearance sits on the INNER container, not the outer one. The
    // outer div is `min-h-full` with a `flex-1` child, so its padding-bottom
    // could be absorbed by the flex stretch and the last control (XO's
    // "Yenidən oyna") ended up underneath the fixed tab bar. Padding the
    // content box itself always reserves the space. env(safe-area-inset-bottom)
    // covers the iPhone home indicator, which sits below the 64px bar.
    <div className="editorial flex min-h-full flex-col">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-5 pt-8 pb-[calc(7rem+env(safe-area-inset-bottom))] md:py-12 md:pb-12">
        <Link
          href="/coin-qazan"
          className="mb-6 inline-flex w-fit items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-primary transition hover:gap-2.5"
        >
          <ArrowLeftIcon width={13} height={13} />
          Coin Qazan
        </Link>

        <header className="text-center">
          <span aria-hidden className="text-[44px] leading-none">
            {meta.emoji}
          </span>
          <h1 className="mt-3 text-[30px] font-bold leading-tight tracking-tight text-navy md:text-[40px]">
            {meta.title}
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-[16px] leading-relaxed text-on-surface-variant">
            {meta.tagline}
          </p>
        </header>

        {/* Meter row — the shared energy pool and the live coin balance.
            Energy ACCUMULATES across days since 0094 (grant_daily_energy adds
            rather than resets), so `energy` can exceed `maxEnergy`, which is
            only the daily top-up size. The true balance is always shown; the
            "/max" denominator is dropped once it has been passed, because
            "14/10" reads as broken. */}
        <div className="mx-auto mt-8 flex flex-wrap items-center justify-center gap-3">
          <span className="flex items-center gap-2 rounded-full border border-border/40 bg-surface px-4 py-2.5 text-caution-orange">
            <EnergyIcon width={15} height={15} />
            <span className="text-[15px] font-bold tabular-nums text-on-surface">
              {energy > maxEnergy ? energy : `${energy}/${maxEnergy}`}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant">
              enerji
            </span>
          </span>
          <span className="flex items-center gap-2 rounded-full border border-border/40 bg-surface px-4 py-2.5">
            <CoinIcon width={15} height={15} className="text-primary" />
            <AnimatedNumber
              value={balance}
              className="text-[15px] font-bold tabular-nums text-on-surface"
            />
            <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant">
              coin
            </span>
          </span>
          <span className="rounded-full bg-primary/10 px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.1em] text-primary">
            {meta.cost}
          </span>
          {meta.slug === 'xo' && winReward > 0 && (
            <span className="flex items-center gap-1.5 rounded-full bg-go-green/12 px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.1em] text-go-green">
              <EnergyIcon width={12} height={12} />
              Qələbə +{winReward} enerji
            </span>
          )}
        </div>

        {/* Board panel. The orbs are the export's "editorial feel" decoration —
            purely presentational, behind the board, pointer-events-none. */}
        <div className="relative mx-auto mt-10 w-full max-w-md flex-1">
          <div
            aria-hidden
            className="pointer-events-none absolute -left-6 -top-6 size-28 rounded-full bg-primary/15 blur-2xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-8 -right-8 size-36 rounded-full bg-sage/40 blur-3xl"
          />
          <div className="game-panel relative rounded-[2rem] border border-border/30 bg-surface p-5 shadow-sm md:p-6">
            {meta.slug === 'xo' &&
              (xoUnavailable ? (
                <p className="py-10 text-center text-body-md text-on-surface-variant">
                  Oyun hazırda əlçatan deyil. Bir az sonra yenidən cəhd edin.
                </p>
              ) : (
                <TicTacToeGame
                  energy={energy}
                  difficulty={difficulty}
                  onSettled={handleXoSettled}
                  onUnavailable={() => setXoUnavailable(true)}
                />
              ))}
            {meta.slug === 'nisan-sureti' && (
              <SignSpeedGame energy={energy} onSettled={handleSettled} />
            )}
            {meta.slug === 'imtahan' && (
              <ExamSimulatorGame energy={energy} onSettled={handleSettled} />
            )}
          </div>
        </div>
      </div>

      <MobileBottomTabBar />
    </div>
  );
}
