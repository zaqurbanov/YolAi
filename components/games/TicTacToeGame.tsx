'use client';

import { useCallback, useMemo, useState } from 'react';
import { Button } from '@heroui/react';
import { useResetCountdown } from '@/components/useResetCountdown';
import { playTicTacToeAction } from '@/app/coin-qazan/actions';

// The board opponent is a DETERMINISTIC computer algorithm, mirrored EXACTLY
// from lib/coins/games.ts so the local game the user plays matches the server's
// re-simulation (which is the authority on the outcome + reward). "easy" (first
// empty cell) is used for every 3rd game of the day (1st, 4th, 7th...); "hard"
// (unbeatable minimax) for every other game.

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

function winningLine(board: Cell[]): [number, number, number] | null {
  for (const line of WIN_LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return line;
  }
  return null;
}

function winnerOf(board: Cell[]): 'X' | 'O' | null {
  const line = winningLine(board);
  return line ? (board[line[0]] as 'X' | 'O') : null;
}

function isFull(board: Cell[]): boolean {
  return board.every((c) => c !== null);
}

function minimax(board: Cell[], turn: 'X' | 'O', depth: number): number {
  const winner = winnerOf(board);
  if (winner === 'O') return 10 - depth;
  if (winner === 'X') return depth - 10;
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

function hardAiMove(board: Cell[]): number {
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

function easyAiMove(board: Cell[]): number {
  for (let i = 0; i < 9; i++) if (board[i] === null) return i;
  return -1;
}

function aiMove(board: Cell[], difficulty: 'easy' | 'hard'): number {
  return difficulty === 'easy' ? easyAiMove(board) : hardAiMove(board);
}

interface TicTacToeGameProps {
  energy: number;
  difficulty: 'easy' | 'hard';
  onSettled: (balance: number, energy: number) => void;
  onUnavailable: () => void;
}

type Outcome = 'win' | 'draw' | 'loss';

const EMPTY: Cell[] = Array(9).fill(null);

export default function TicTacToeGame({
  energy,
  difficulty,
  onSettled,
  onUnavailable,
}: TicTacToeGameProps) {
  const [board, setBoard] = useState<Cell[]>(EMPTY);
  const [userMoves, setUserMoves] = useState<number[]>([]);
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [reward, setReward] = useState(0);
  const [note, setNote] = useState<string | null>(null);

  const noEnergy = energy < 1;
  const gameOver = outcome !== null;
  const winLine = useMemo(() => winningLine(board), [board]);
  // Energy resets at the next Baku 00:00 (grant_daily_energy keys off that date).
  const countdown = useResetCountdown(noEnergy);

  const submit = useCallback(
    async (moves: number[]) => {
      setPending(true);
      setNote(null);
      const res = await playTicTacToeAction(moves);
      setPending(false);

      if (res.status === 'success' && res.outcome) {
        setOutcome(res.outcome);
        setReward(res.reward ?? 0);
        if (typeof res.balance === 'number' && typeof res.energy === 'number') {
          onSettled(res.balance, res.energy);
        }
        return;
      }
      if (res.status === 'unavailable') {
        onUnavailable();
        return;
      }
      // no_energy / invalid_input / error — surface the message and reset the
      // board so the user can start over (the play was not settled).
      setNote(res.message);
      setBoard(EMPTY);
      setUserMoves([]);
    },
    [onSettled, onUnavailable]
  );

  const handleCell = useCallback(
    (i: number) => {
      if (pending || gameOver || noEnergy || board[i] !== null) return;

      const next = board.slice();
      next[i] = 'X';
      const moves = [...userMoves, i];
      setUserMoves(moves);

      if (winnerOf(next) === 'X' || isFull(next)) {
        setBoard(next);
        void submit(moves);
        return;
      }

      const ai = aiMove(next, difficulty);
      if (ai >= 0) next[ai] = 'O';

      setBoard(next);

      if (winnerOf(next) === 'O' || isFull(next)) {
        void submit(moves);
      }
    },
    [board, userMoves, pending, gameOver, noEnergy, difficulty, submit]
  );

  const reset = useCallback(() => {
    setBoard(EMPTY);
    setUserMoves([]);
    setOutcome(null);
    setReward(0);
    setNote(null);
  }, []);

  const statusLine = (() => {
    if (noEnergy && !gameOver) return 'Enerjin bitib';
    if (outcome === 'win') return reward > 0 ? `Qazandın! +${reward} coin 🎉` : 'Qazandın! 🎉';
    if (outcome === 'draw') return 'Heç-heçə 🤝';
    if (outcome === 'loss') return 'Uduzdun. Növbəti dəfə!';
    if (difficulty === 'easy') return 'Bu turda udmaq asandır 🎯';
    return 'Sənin növbən (X)';
  })();

  const statusTone =
    outcome === 'win'
      ? 'text-go-green'
      : outcome === 'loss'
        ? 'text-error'
        : difficulty === 'easy' && !gameOver && !noEnergy
          ? 'text-go-green'
          : 'text-on-surface-variant';

  const boardDisabled = pending || gameOver || noEnergy;

  return (
    <div className="flex flex-col items-center gap-4">
      <p className={`text-body-md font-medium ${statusTone}`} aria-live="polite">
        {statusLine}
      </p>

      <div
        className={`grid grid-cols-3 gap-2 transition-opacity ${boardDisabled && !gameOver ? 'opacity-60' : ''}`}
      >
        {board.map((cell, i) => {
          const inWin = winLine?.includes(i);
          return (
            <button
              key={i}
              type="button"
              onClick={() => handleCell(i)}
              disabled={boardDisabled || cell !== null}
              aria-label={`Xana ${i + 1}${cell ? `: ${cell}` : ''}`}
              className={`flex size-20 items-center justify-center rounded-xl border text-3xl font-bold transition
                ${inWin ? 'border-go-green/60 bg-go-green/15' : 'border-outline-variant/40 bg-surface-tertiary/40'}
                ${cell === null && !boardDisabled ? 'hover:border-primary/50 hover:bg-primary/5' : ''}
                ${cell === 'X' ? 'text-primary' : cell === 'O' ? 'text-caution-orange' : 'text-on-surface-variant'}`}
            >
              <span className={cell ? 'xo-mark-in motion-reduce:animate-none' : ''}>{cell ?? ''}</span>
            </button>
          );
        })}
      </div>

      {note && <p className="text-label-sm text-caution-orange">{note}</p>}

      {noEnergy ? (
        <div className="flex flex-col items-center gap-1">
          <p className="text-label-sm text-on-surface-variant">Enerji yenilənməsinə qalıb:</p>
          <p className="text-body-md font-semibold tabular-nums text-caution-orange">
            {countdown ?? '—'}
          </p>
        </div>
      ) : (
        gameOver && (
          <Button
            variant="primary"
            size="sm"
            isDisabled={pending}
            onPress={reset}
            className="glow-primary"
          >
            Yenidən oyna (1 ⚡)
          </Button>
        )
      )}
    </div>
  );
}
