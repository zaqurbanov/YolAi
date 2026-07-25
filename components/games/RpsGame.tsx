'use client';

import { useState, useTransition } from 'react';
import { playRpsAction, type RpsPlayState } from '@/app/coin-qazan/actions';
import type { RpsChoice } from '@/lib/coins/games';
import { prefersReducedMotion, outcomeToneClass, type GameChildProps } from './GamesSection';

const CHOICES: { id: RpsChoice; emoji: string; label: string }[] = [
  { id: 'rock', emoji: '✊', label: 'Daş' },
  { id: 'paper', emoji: '✋', label: 'Kağız' },
  { id: 'scissors', emoji: '✌️', label: 'Qayçı' },
];

const EMOJI: Record<RpsChoice, string> = { rock: '✊', paper: '✋', scissors: '✌️' };

export default function RpsGame({ balance, bet, multiplier, locked, onSettled }: GameChildProps) {
  const [result, setResult] = useState<RpsPlayState | null>(null);
  const [playingChoice, setPlayingChoice] = useState<RpsChoice | null>(null);
  const [isPending, startTransition] = useTransition();

  const insufficient = balance < bet;
  const disabled = locked || insufficient || isPending;
  const disabledReason = locked
    ? 'Bugünkü oyun limitinə çatmısınız'
    : insufficient
      ? 'Kifayət qədər coininiz yoxdur'
      : null;

  function play(choice: RpsChoice) {
    if (disabled) return;
    setResult(null);
    setPlayingChoice(choice);
    startTransition(async () => {
      const state = await playRpsAction(choice);
      onSettled(state.status, state.message, state.balance);
      if (state.status === 'success') {
        // Brief reveal beat so the ❓ placeholder is seen before the server's
        // choice lands — skipped under reduced motion.
        if (!prefersReducedMotion()) await new Promise((r) => setTimeout(r, 450));
        setResult(state);
      } else {
        setResult(state);
      }
      setPlayingChoice(null);
    });
  }

  const showReveal = result?.status === 'success' && result.serverChoice;

  return (
    <div className="flex flex-col rounded-xl border border-outline-variant/30 bg-surface-container-low/40 p-4">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-body-lg font-semibold text-on-surface">Daş-Kağız-Qayçı</h3>
        <span className="text-legal-citation text-on-surface-variant">Qazanc {Math.round(bet * multiplier)}</span>
      </div>

      {/* Arena: user choice vs server choice */}
      <div className="my-3 flex items-center justify-center gap-4 text-3xl">
        <span aria-hidden className="w-10 text-center">
          {playingChoice ? EMOJI[playingChoice] : showReveal ? EMOJI[result.userChoice!] : '—'}
        </span>
        <span className="text-legal-citation text-on-surface-variant">VS</span>
        <span aria-hidden className="w-10 text-center">
          {isPending ? (
            <span className="game-thinking motion-reduce:animate-none inline-block">❓</span>
          ) : showReveal ? (
            <span key={result.serverChoice} className="game-reveal motion-reduce:animate-none inline-block">
              {EMOJI[result.serverChoice!]}
            </span>
          ) : (
            '—'
          )}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {CHOICES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => play(c.id)}
            disabled={disabled}
            aria-label={c.label}
            className="flex flex-col items-center gap-1 rounded-lg border border-outline-variant/40 bg-surface-container/40 py-2.5 text-2xl transition hover:border-primary/60 hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span aria-hidden>{c.emoji}</span>
            <span className="text-legal-citation text-on-surface-variant">{c.label}</span>
          </button>
        ))}
      </div>

      <p className={`mt-3 min-h-[1.25rem] text-center text-body-md ${outcomeToneClass(result?.outcome ?? undefined)}`}>
        {result?.message ?? (disabledReason ?? 'Seçimini et')}
      </p>
    </div>
  );
}
