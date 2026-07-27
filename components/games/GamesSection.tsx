'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Tabs } from '@heroui/react';
import { CoinIcon } from '@/components/icons';
import AnimatedNumber from '@/components/AnimatedNumber';
import { purchaseEnergyAction } from '@/app/coin-qazan/actions';
import TicTacToeGame from './TicTacToeGame';
import SignSpeedGame from './SignSpeedGame';
import ExamSimulatorGame from './ExamSimulatorGame';

interface GamesSectionProps {
  initialBalance: number;
  initialEnergy: number;
  maxEnergy: number;
  initialTodayCount: number;
  winReward: number;
  energyPurchaseCoinCost: number;
  energyPurchaseEnergyAmount: number;
}

type ActiveGame = 'xo' | 'sign-speed' | 'exam';

// The games section owns the live coin balance + shared energy meter (XO and
// Nişan Sürəti draw from ONE daily energy pool, per lib/coins/games.ts's
// GAME_DAILY_ENERGY_KEY reuse) and the running "how many XO games today" count
// that decides XO's difficulty ramp (sign speed has no difficulty ramp, so it
// doesn't need that count). Every authoritative value comes from a server
// action response via onSettled/handleXoSettled — this never derives an
// outcome or mutates coins/energy itself. Both games render under ONE header
// so the shared energy number can never be shown as two different values.
export default function GamesSection({
  initialBalance,
  initialEnergy,
  maxEnergy,
  initialTodayCount,
  winReward,
  energyPurchaseCoinCost,
  energyPurchaseEnergyAmount,
}: GamesSectionProps) {
  const [balance, setBalance] = useState(initialBalance);
  const [energy, setEnergy] = useState(initialEnergy);
  const [todayCount, setTodayCount] = useState(initialTodayCount);
  const [xoUnavailable, setXoUnavailable] = useState(false);
  const [activeGame, setActiveGame] = useState<ActiveGame>('xo');
  const [purchasing, setPurchasing] = useState(false);
  const [purchaseMessage, setPurchaseMessage] = useState<string | null>(null);
  const purchaseMessageTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The FIRST XO game of the day (no plays recorded yet) is easy; every game
  // after is hard. Kept in sync with the server, which recomputes the same
  // from the DB play count at settle time. Sign speed has no such ramp.
  const difficulty: 'easy' | 'hard' = todayCount === 0 ? 'easy' : 'hard';

  const handleSettled = useCallback((newBalance: number, newEnergy: number) => {
    setBalance(newBalance);
    setEnergy(newEnergy);
    // Keep the navbar CoinBadge and the wheel card's balance live without a
    // refresh (same event the quiz / ad-watch / wheel paths emit).
    window.dispatchEvent(new CustomEvent('coin-balance-update', { detail: { balance: newBalance } }));
  }, []);

  const handleXoSettled = useCallback(
    (newBalance: number, newEnergy: number) => {
      setTodayCount((c) => c + 1);
      handleSettled(newBalance, newEnergy);
    },
    [handleSettled]
  );

  const handleXoUnavailable = useCallback(() => setXoUnavailable(true), []);

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

  useEffect(() => {
    return () => {
      if (purchaseMessageTimeout.current) clearTimeout(purchaseMessageTimeout.current);
    };
  }, []);

  const showPurchaseMessage = useCallback((message: string) => {
    setPurchaseMessage(message);
    if (purchaseMessageTimeout.current) clearTimeout(purchaseMessageTimeout.current);
    purchaseMessageTimeout.current = setTimeout(() => setPurchaseMessage(null), 3000);
  }, []);

  // The cap/insufficient-coins cases are decided server-side (maxEnergy above
  // is the daily play cap, not the purchase cap — they're different numbers),
  // so this never predicts eligibility client-side; it just shows the button
  // and surfaces whatever the server decided.
  const handleBuyEnergy = useCallback(async () => {
    setPurchasing(true);
    try {
      const result = await purchaseEnergyAction();
      if (result.status === 'success') {
        handleSettled(result.coinBalance!, result.energy!);
      } else {
        showPurchaseMessage(result.message);
      }
    } finally {
      setPurchasing(false);
    }
  }, [handleSettled, showPurchaseMessage]);

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant/30 pb-4">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <span aria-hidden className="text-lg">🎮</span>
        </div>
        <div>
          <h2 className="text-headline-md text-[18px]">Oyunlar</h2>
          <p className="text-legal-citation text-on-surface-variant">
            XO, Nişan Sürəti, Sınaq İmtahanı · bir enerji hovuzu
          </p>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1.5">
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
          <button
            type="button"
            onClick={handleBuyEnergy}
            disabled={purchasing}
            className="flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-primary transition-opacity hover:bg-primary/25 disabled:opacity-50"
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
    </div>
  );

  return (
    <div className="glass-card rounded-2xl p-6 space-y-4 lg:col-span-2">
      {header}

      <Tabs
        variant="secondary"
        selectedKey={activeGame}
        onSelectionChange={(key) => setActiveGame(key as ActiveGame)}
        aria-label="Oyun seçimi"
      >
        <Tabs.ListContainer>
          <Tabs.List aria-label="Oyun seçimi">
            <Tabs.Tab id="xo">
              XO Oyunu
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="sign-speed">
              Nişan Sürəti
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="exam">
              Sınaq İmtahanı
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>

        <Tabs.Panel id="xo" className="pt-4">
          {xoUnavailable ? (
            <p className="text-body-md text-on-surface-variant">Oyun hazırda əlçatan deyil.</p>
          ) : (
            <div className="mx-auto w-full max-w-sm space-y-2">
              <p className="text-center text-legal-citation text-on-surface-variant">
                Kompüterə qarşı oyna · udanda +{winReward} coin
              </p>
              <TicTacToeGame
                energy={energy}
                difficulty={difficulty}
                onSettled={handleXoSettled}
                onUnavailable={handleXoUnavailable}
              />
            </div>
          )}
        </Tabs.Panel>

        <Tabs.Panel id="sign-speed" className="pt-4">
          <div className="mx-auto w-full max-w-sm">
            <SignSpeedGame energy={energy} onSettled={handleSettled} />
          </div>
        </Tabs.Panel>

        <Tabs.Panel id="exam" className="pt-4">
          <div className="mx-auto w-full max-w-sm">
            <ExamSimulatorGame balance={balance} energy={energy} onBalanceChange={handleSettled} />
          </div>
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}
