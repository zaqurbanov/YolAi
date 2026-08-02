'use client';

import { useCallback, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import AnimatedNumber from '@/components/AnimatedNumber';
import { ArrowLeftIcon, CoinIcon, EnergyIcon } from '@/components/icons';
import { purchaseEnergyAction } from '@/app/coin-qazan/actions';
import { isEnergyPresetDisabled, formatCoin } from '@/components/coins/EnergyConverterCard';
import type { GameMeta } from '@/lib/coins/gameCatalog';
import type { EnergyPurchaseConfig } from '@/lib/coins/games';
import TicTacToeGame from './TicTacToeGame';
import SignSpeedGame from './SignSpeedGame';
import ExamSimulatorGame from './ExamSimulatorGame';
import NisanTapmacasiGame from './NisanTapmacasiGame';

interface GamePageShellProps {
  meta: GameMeta;
  initialBalance: number;
  initialEnergy: number;
  maxEnergy: number;
  initialTodayCount: number;
  winReward: number;
  /** Coin→energy exchange rate/caps (getEnergyPurchaseConfig, app_settings-backed). */
  energyPurchaseConfig: EnergyPurchaseConfig;
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
  energyPurchaseConfig,
}: GamePageShellProps) {
  const [balance, setBalance] = useState(initialBalance);
  const [energy, setEnergy] = useState(initialEnergy);
  const [todayCount, setTodayCount] = useState(initialTodayCount);
  const [xoUnavailable, setXoUnavailable] = useState(false);
  const [converterOpen, setConverterOpen] = useState(false);
  const [buyMessage, setBuyMessage] = useState<string | null>(null);
  const [isBuyPending, startBuyTransition] = useTransition();
  const buyMessageTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    window.dispatchEvent(
      new CustomEvent('energy-balance-update', { detail: { balance: nextEnergy } }),
    );
  }, []);

  const handleXoSettled = useCallback(
    (nextBalance: number, nextEnergy: number) => {
      handleSettled(nextBalance, nextEnergy);
      setTodayCount((count) => count + 1);
    },
    [handleSettled],
  );

  // Compact coin→energy converter — same server action + coin-balance-update
  // contract as handleSettled, with the multiplier chosen by the tapped preset.
  const handleBuyEnergy = useCallback((m: number) => {
    startBuyTransition(async () => {
      const result = await purchaseEnergyAction(m);
      if (result.status === 'success' && result.coinBalance != null && result.energy != null) {
        setBalance(result.coinBalance);
        setEnergy(result.energy);
        window.dispatchEvent(
          new CustomEvent('coin-balance-update', { detail: { balance: result.coinBalance } }),
        );
        window.dispatchEvent(
          new CustomEvent('energy-balance-update', { detail: { balance: result.energy } }),
        );
      }
      setBuyMessage(result.message);
      if (buyMessageTimeout.current) clearTimeout(buyMessageTimeout.current);
      buyMessageTimeout.current = setTimeout(() => setBuyMessage(null), 4000);
    });
  }, []);

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
          <button
            type="button"
            onClick={() => setConverterOpen((o) => !o)}
            aria-expanded={converterOpen}
            className="flex items-center gap-1.5 rounded-full bg-primary/10 px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.1em] text-primary transition hover:bg-primary/15"
          >
            <EnergyIcon width={14} height={14} />
            Enerji al
          </button>
        </div>

        {converterOpen && (
          <div className="mx-auto mt-3 flex w-full max-w-xl flex-col items-center gap-2.5 rounded-2xl border border-border/40 bg-surface px-4 py-3.5">
            {energy >= energyPurchaseConfig.maxBalance ? (
              <p className="text-legal-citation text-on-surface-variant">Maksimum enerjiyə çatmısan</p>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {Array.from(
                    { length: Math.max(1, Math.floor(energyPurchaseConfig.maxMultiplier)) },
                    (_, i) => i + 1,
                  ).map((m) => {
                    const disabled = isEnergyPresetDisabled(m, {
                      energy,
                      maxEnergy,
                      maxBalance: energyPurchaseConfig.maxBalance,
                      balance,
                      coinCost: energyPurchaseConfig.coinCost,
                      energyAmount: energyPurchaseConfig.energyAmount,
                    });
                    return (
                      <button
                        key={m}
                        type="button"
                        disabled={disabled || isBuyPending}
                        onClick={() => handleBuyEnergy(m)}
                        className="rounded-full border border-border/40 bg-surface-secondary px-3.5 py-1.5 text-[13px] font-bold tabular-nums text-on-surface transition hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {m}×
                      </button>
                    );
                  })}
                </div>
                <p className="text-legal-citation text-on-surface-variant">
                  {formatCoin(energyPurchaseConfig.coinCost)} coin →{' '}
                  {formatCoin(energyPurchaseConfig.energyAmount)} enerji
                </p>
              </>
            )}
            {buyMessage && (
              <p className="text-legal-citation text-on-surface-variant">{buyMessage}</p>
            )}
          </div>
        )}

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
            {meta.slug === 'nisan-tapmacasi' && (
              <NisanTapmacasiGame energy={energy} onSettled={handleSettled} />
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
