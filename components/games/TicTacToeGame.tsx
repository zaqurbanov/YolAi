'use client';

import { useState, useTransition } from 'react';
import { playTicTacToeAction, type TicTacToePlayState } from '@/app/coin-qazan/actions';
import { prefersReducedMotion, outcomeToneClass, type GameChildProps } from './GamesSection';

// Local mirror of the server's optimal AI (lib/coins/games.ts): user is X and
// moves first, AI is O, minimax with a first-empty-cell (0..8) tie-break, so
// the local board matches the server's re-simulation move-for-move. This is a
// UX responsiveness mirror ONLY — the shown outcome/payout/balance is ALWAYS
// the server's returned value, and if the server board ever differs we adopt
// the server's board. The client never scores the game.
type Cell = 'X' | 'O' | null;

const WIN_LINES: readonly [number, number, number][] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

function winnerOf(board: Cell[]): 'X' | 'O' | null {
  for (const [a, b, c] of WIN_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a] as 'X' | 'O';
  }
  return null;
}

function isFull(board: Cell[]): boolean {
  return board.every((c) => c !== null);
}

function minimax(board: Cell[], turn: 'X' | 'O', depth: number): number {
  const w = winnerOf(board);
  if (w === 'O') return 10 - depth;
  if (w === 'X') return depth - 10;
  if (isFull(board)) return 0;

  if (turn === 'O') {
    let best = -Infinity;
    for (let i = 0; i < 9; i++) {
      if (board[i] !== null) continue;
      board[i] = 'O';
      best = Math.max(best, minimax(board, 'X', depth + 1));
      board[i] = null;
    }
    return best;
  }
  let best = Infinity;
  for (let i = 0; i < 9; i++) {
    if (board[i] !== null) continue;
    board[i] = 'X';
    best = Math.min(best, minimax(board, 'O', depth + 1));
    board[i] = null;
  }
  return best;
}

function bestAiMove(board: Cell[]): number {
  let bestScore = -Infinity;
  let bestMove = -1;
  for (let i = 0; i < 9; i++) {
    if (board[i] !== null) continue;
    board[i] = 'O';
    const score = minimax(board, 'X', 1);
    board[i] = null;
    if (score > bestScore) {
      bestScore = score;
      bestMove = i;
    }
  }
  return bestMove;
}

const EMPTY: Cell[] = Array(9).fill(null);

type Phase = 'idle' | 'thinking' | 'submitting' | 'done';

export default function TicTacToeGame({ balance, bet, multiplier, locked, onSettled }: GameChildProps) {
  const [board, setBoard] = useState<Cell[]>(EMPTY);
  const [userMoves, setUserMoves] = useState<number[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<TicTacToePlayState | null>(null);
  const [, startTransition] = useTransition();

  const insufficient = balance < bet;
  const blocked = locked || insufficient;
  const disabledReason = locked
    ? 'Bugünkü oyun limitinə çatmısınız'
    : insufficient
      ? 'Kifayət qədər coininiz yoxdur'
      : null;

  const canTap = phase === 'idle' && !blocked && result == null;

  function submit(moves: number[], localBoard: Cell[]) {
    setPhase('submitting');
    startTransition(async () => {
      const state = await playTicTacToeAction(moves);
      onSettled(state.status, state.message, state.balance);
      // Adopt the server's authoritative board when it returns one; otherwise
      // keep the local terminal board.
      if (state.status === 'success' && Array.isArray(state.board)) {
        setBoard(state.board as Cell[]);
      } else {
        setBoard(localBoard);
      }
      setResult(state);
      setPhase('done');
    });
  }

  function handleTap(i: number) {
    if (!canTap || board[i] !== null) return;
    const afterUser = board.slice();
    afterUser[i] = 'X';
    const moves = [...userMoves, i];
    setBoard(afterUser);
    setUserMoves(moves);

    if (winnerOf(afterUser) === 'X' || isFull(afterUser)) {
      submit(moves, afterUser);
      return;
    }

    setPhase('thinking');
    const delay = prefersReducedMotion() ? 0 : 350;
    window.setTimeout(() => {
      const aiMove = bestAiMove(afterUser);
      const afterAi = afterUser.slice();
      if (aiMove >= 0) afterAi[aiMove] = 'O';
      setBoard(afterAi);
      if (winnerOf(afterAi) === 'O' || isFull(afterAi)) {
        submit(moves, afterAi);
      } else {
        setPhase('idle');
      }
    }, delay);
  }

  function reset() {
    setBoard(EMPTY);
    setUserMoves([]);
    setResult(null);
    setPhase('idle');
  }

  const status =
    phase === 'thinking' || phase === 'submitting'
      ? 'Rəqib düşünür...'
      : result?.message ?? (disabledReason ?? 'Sən X-sən, ilk gedişi et');

  return (
    <div className="flex flex-col rounded-xl border border-outline-variant/30 bg-surface-container-low/40 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-body-lg font-semibold text-on-surface">XO (Xaç-Sıfır)</h3>
        <span className="text-legal-citation text-on-surface-variant">Qazanc {Math.round(bet * multiplier)}</span>
      </div>

      <div className="mx-auto grid grid-cols-3 gap-1.5">
        {board.map((cell, i) => (
          <button
            key={i}
            type="button"
            onClick={() => handleTap(i)}
            disabled={!canTap || cell !== null}
            aria-label={`Xana ${i + 1}${cell ? `: ${cell}` : ''}`}
            className="flex size-12 items-center justify-center rounded-lg border border-outline-variant/40 bg-surface-container/40 text-2xl font-bold transition enabled:hover:border-primary/60 enabled:hover:bg-primary/10 disabled:cursor-default"
          >
            {cell && (
              <span
                className={`game-mark-in motion-reduce:animate-none ${cell === 'X' ? 'text-primary' : 'text-caution-orange'}`}
              >
                {cell}
              </span>
            )}
          </button>
        ))}
      </div>

      <p className={`mt-3 min-h-[1.25rem] text-center text-body-md ${outcomeToneClass(result?.outcome ?? undefined)}`}>
        {status}
      </p>

      {phase === 'done' && (
        <button
          type="button"
          onClick={reset}
          disabled={blocked}
          className="mt-2 rounded-lg border border-primary/40 bg-primary/10 py-2 text-body-md font-medium text-primary transition hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Yenidən oyna
        </button>
      )}
    </div>
  );
}
