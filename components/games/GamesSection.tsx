'use client';

import { useCallback, useEffect, useState } from 'react';
import { CoinIcon } from '@/components/icons';
import AnimatedNumber from '@/components/AnimatedNumber';
import TicTacToeGame from './TicTacToeGame';

interface GamesSectionProps {
  initialBalance: number;
  initialEnergy: number;
  maxEnergy: number;
  initialTodayCount: number;
  winReward: number;
}

// The games section owns the live coin balance + energy meter and the running
// "how many XO games today" count that decides difficulty (first game of the
// day is easy). Every authoritative value comes from the server-action response
// via onSettled — this never derives an outcome or mutates coins/energy itself.
export default function GamesSection({
  initialBalance,
  initialEnergy,
  maxEnergy,
  initialTodayCount,
  winReward,
}: GamesSectionProps) {
  const [balance, setBalance] = useState(initialBalance);
  const [energy, setEnergy] = useState(initialEnergy);
  const [todayCount, setTodayCount] = useState(initialTodayCount);
  const [unavailable, setUnavailable] = useState(false);

  // The FIRST game of the day (no plays recorded yet) is easy; every game after
  // is hard. Kept in sync with the server, which recomputes the same from the DB
  // play count at settle time.
  const difficulty: 'easy' | 'hard' = todayCount === 0 ? 'easy' : 'hard';

  const handleSettled = useCallback((newBalance: number, newEnergy: number) => {
    setBalance(newBalance);
    setEnergy(newEnergy);
    setTodayCount((c) => c + 1);
    // Keep the navbar CoinBadge live without a refresh (same event the quiz /
    // ad-watch cards emit).
    window.dispatchEvent(new CustomEvent('coin-balance-update', { detail: { balance: newBalance } }));
  }, []);

  const handleUnavailable = useCallback(() => setUnavailable(true), []);

  // Keep the header balance in sync when another card on this page (e.g. the
  // wheel) credits coins and broadcasts the shared balance event.
  useEffect(() => {
    const onBalance = (e: Event) => {
      const detail = (e as CustomEvent<{ balance?: number }>).detail;
      if (typeof detail?.balance === 'number') setBalance(detail.balance);
    };
    window.addEventListener('coin-balance-update', onBalance);
    return () => window.removeEventListener('coin-balance-update', onBalance);
  }, []);

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant/30 pb-4">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <span aria-hidden className="text-lg">🎮</span>
        </div>
        <div>
          <h2 className="text-headline-md text-[18px]">XO Oyunu</h2>
          <p className="text-legal-citation text-on-surface-variant">
            Kompüterə qarşı oyna · udanda +{winReward} coin
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
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
      </div>
    </div>
  );

  if (unavailable) {
    return (
      <div className="glass-card rounded-2xl p-6 space-y-4 lg:col-span-2">
        {header}
        <p className="text-body-md text-on-surface-variant">Oyun hazırda əlçatan deyil.</p>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-2xl p-6 space-y-4 lg:col-span-2">
      {header}
      <div className="mx-auto w-full max-w-sm">
        <TicTacToeGame
          energy={energy}
          difficulty={difficulty}
          onSettled={handleSettled}
          onUnavailable={handleUnavailable}
        />
      </div>
    </div>
  );
}
