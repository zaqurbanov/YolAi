'use client';

import { useCallback, useState } from 'react';
import { CoinIcon } from '@/components/icons';
import RpsGame from './RpsGame';
import CoinFlipGame from './CoinFlipGame';
import TicTacToeGame from './TicTacToeGame';

export interface GameMultipliers {
  rps: number;
  coinflip: number;
  tictactoe: number;
}

interface GamesSectionProps {
  initialBalance: number;
  bet: number;
  dailyCap: number;
  multipliers: GameMultipliers;
}

// The three mini-games share one live balance and two section-wide states —
// daily_cap_reached (all games locked for today) and unavailable (0066 not
// applied yet, feature degrades to an empty state). Both are surfaced from the
// server-action responses, never inferred client-side, so this orchestrator
// owns them and hands each child a single settle callback + the derived
// `locked` flag. Per-game reveal/animation lives in the children.
export default function GamesSection({ initialBalance, bet, dailyCap, multipliers }: GamesSectionProps) {
  const [balance, setBalance] = useState(initialBalance);
  const [capMessage, setCapMessage] = useState<string | null>(null);
  const [unavailableMessage, setUnavailableMessage] = useState<string | null>(null);

  // Single settle point for every game. The shown balance is ALWAYS the
  // server's returned `balance`; this never derives win/loss or mutates the
  // balance itself. Broadcasts the same 'coin-balance-update' event the quiz /
  // ad-watch cards use so the navbar CoinBadge stays live without a refresh.
  const handleSettled = useCallback(
    (status: string, message: string, newBalance?: number) => {
      if (typeof newBalance === 'number') {
        setBalance(newBalance);
        window.dispatchEvent(new CustomEvent('coin-balance-update', { detail: { balance: newBalance } }));
      }
      if (status === 'daily_cap_reached') setCapMessage(message);
      if (status === 'unavailable') setUnavailableMessage(message);
    },
    []
  );

  const locked = capMessage != null;

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant/30 pb-4">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <CoinIcon />
        </div>
        <div>
          <h2 className="text-headline-md text-[18px]">Oyunlar</h2>
          <p className="text-legal-citation text-on-surface-variant">Hər oyun {bet} coin · gündə {dailyCap} oyun</p>
        </div>
      </div>
      <span className="flex items-center gap-1.5 rounded-full bg-safety-yellow/15 px-3 py-1 text-safety-yellow">
        <CoinIcon width={16} height={16} />
        <span className="text-body-md font-semibold tabular-nums">{balance}</span>
      </span>
    </div>
  );

  if (unavailableMessage) {
    return (
      <div className="glass-card rounded-2xl p-6 space-y-4 lg:col-span-2">
        {header}
        <p className="text-body-md text-on-surface-variant">{unavailableMessage}</p>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-2xl p-6 space-y-4 lg:col-span-2">
      {header}

      {capMessage && (
        <div className="rounded-xl border border-caution-orange/30 bg-caution-orange/10 px-4 py-3">
          <p className="text-body-md text-caution-orange">{capMessage}</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <RpsGame
          balance={balance}
          bet={bet}
          multiplier={multipliers.rps}
          locked={locked}
          onSettled={handleSettled}
        />
        <CoinFlipGame
          balance={balance}
          bet={bet}
          multiplier={multipliers.coinflip}
          locked={locked}
          onSettled={handleSettled}
        />
        <TicTacToeGame
          balance={balance}
          bet={bet}
          multiplier={multipliers.tictactoe}
          locked={locked}
          onSettled={handleSettled}
        />
      </div>
    </div>
  );
}

// Shared child contract.
export interface GameChildProps {
  balance: number;
  bet: number;
  multiplier: number;
  locked: boolean;
  onSettled: (status: string, message: string, balance?: number) => void;
}

// Small helpers reused by the game children.
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Shared shell so the three games read as one family: title, a result/outcome
// strip, and the disabled-reason messaging all live in one place.
export function outcomeToneClass(outcome: 'win' | 'draw' | 'loss' | undefined): string {
  if (outcome === 'win') return 'text-go-green';
  if (outcome === 'loss') return 'text-error';
  return 'text-on-surface-variant';
}
