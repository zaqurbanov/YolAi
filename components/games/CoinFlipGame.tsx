'use client';

import { useState, useTransition } from 'react';
import { playCoinFlipAction, type CoinFlipPlayState } from '@/app/coin-qazan/actions';
import type { CoinSide } from '@/lib/coins/games';
import { prefersReducedMotion, outcomeToneClass, type GameChildProps } from './GamesSection';

const SIDES: { id: CoinSide; label: string }[] = [
  { id: 'heads', label: 'Herb' },
  { id: 'tails', label: 'Yazı' },
];

const SIDE_LABEL: Record<CoinSide, string> = { heads: 'Herb', tails: 'Yazı' };
const SIDE_FACE: Record<CoinSide, string> = { heads: '🦅', tails: '✍️' };

export default function CoinFlipGame({ balance, bet, multiplier, locked, onSettled }: GameChildProps) {
  const [result, setResult] = useState<CoinFlipPlayState | null>(null);
  const [flipping, setFlipping] = useState(false);
  const [pick, setPick] = useState<CoinSide | null>(null);
  const [isPending, startTransition] = useTransition();

  const insufficient = balance < bet;
  const disabled = locked || insufficient || isPending;
  const disabledReason = locked
    ? 'Bugünkü oyun limitinə çatmısınız'
    : insufficient
      ? 'Kifayət qədər coininiz yoxdur'
      : null;

  function play(side: CoinSide) {
    if (disabled) return;
    setResult(null);
    setPick(side);
    setFlipping(true);
    startTransition(async () => {
      const state = await playCoinFlipAction(side);
      onSettled(state.status, state.message, state.balance);
      if (state.status === 'success' && !prefersReducedMotion()) {
        await new Promise((r) => setTimeout(r, 900));
      }
      setFlipping(false);
      setResult(state);
    });
  }

  const landed = result?.status === 'success' ? result.result : null;

  return (
    <div className="flex flex-col rounded-xl border border-outline-variant/30 bg-surface-container-low/40 p-4">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-body-lg font-semibold text-on-surface">Sikkə atma</h3>
        <span className="text-legal-citation text-on-surface-variant">Qazanc {Math.round(bet * multiplier)}</span>
      </div>

      <div className="my-3 flex h-16 items-center justify-center text-4xl">
        {flipping ? (
          <span aria-hidden className="game-coin-spin motion-reduce:animate-none inline-block">🪙</span>
        ) : landed ? (
          <span key={landed} aria-hidden className="game-reveal motion-reduce:animate-none inline-block">
            {SIDE_FACE[landed]}
          </span>
        ) : (
          <span aria-hidden className="opacity-40">🪙</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {SIDES.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => play(s.id)}
            disabled={disabled}
            className={`rounded-lg border py-2.5 text-body-md font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
              pick === s.id
                ? 'border-primary/60 bg-primary/15 text-primary'
                : 'border-outline-variant/40 bg-surface-container/40 text-on-surface hover:border-primary/60 hover:bg-primary/10'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <p className={`mt-3 min-h-[1.25rem] text-center text-body-md ${outcomeToneClass(result?.outcome ?? undefined)}`}>
        {landed
          ? `${SIDE_LABEL[landed]} — ${result!.message}`
          : (result?.message ?? disabledReason ?? 'Herb, yoxsa yazı?')}
      </p>
    </div>
  );
}
