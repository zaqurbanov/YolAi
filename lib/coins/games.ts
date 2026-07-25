import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { isMissingRelationError } from '@/lib/supabase/missingRelation';

// XO (tic-tac-toe) — NO-WAGER reward model (0067_xo_energy_rewards.sql). The old
// betting games (rps, coinflip) were removed. Playing costs 1 ENERGY (a daily
// allowance, never coins); winning credits a small, daily-capped coin reward.
// SERVER-AUTHORITATIVE: the client submits only its own board moves; the server
// re-simulates the game against a DETERMINISTIC AI, derives the outcome, and
// settles energy + reward. Fail-CLOSED on the play path; fail-OPEN on the
// read-only energy/difficulty display.

// ---------------------------------------------------------------------------
// Config — app_settings with TS-side defaults (house convention, no seed rows).
// ---------------------------------------------------------------------------
const GAME_DAILY_ENERGY_KEY = 'game_daily_energy';
const DEFAULT_GAME_DAILY_ENERGY = 10;

const GAME_ENERGY_COST_KEY = 'game_energy_cost';
const DEFAULT_GAME_ENERGY_COST = 1;

const TICTACTOE_WIN_REWARD_KEY = 'tictactoe_win_reward';
const DEFAULT_TICTACTOE_WIN_REWARD = 2;

const TICTACTOE_DAILY_WIN_CAP_KEY = 'tictactoe_daily_win_cap';
const DEFAULT_TICTACTOE_DAILY_WIN_CAP = 3;

export {
  GAME_DAILY_ENERGY_KEY,
  DEFAULT_GAME_DAILY_ENERGY,
  GAME_ENERGY_COST_KEY,
  DEFAULT_GAME_ENERGY_COST,
  TICTACTOE_WIN_REWARD_KEY,
  DEFAULT_TICTACTOE_WIN_REWARD,
  TICTACTOE_DAILY_WIN_CAP_KEY,
  DEFAULT_TICTACTOE_DAILY_WIN_CAP,
};

export type GameOutcome = 'win' | 'draw' | 'loss';

// "easy" = the beatable AI used for the user's FIRST game each day; "hard" = the
// unbeatable optimal AI for every game after. BOTH are deterministic so the
// server can re-simulate and verify the submitted game (a random AI would make
// the re-simulation diverge from what the user actually played).
export type Difficulty = 'easy' | 'hard';

async function readNumericSetting(key: string, fallback: number): Promise<number> {
  const { data, error } = await createAdminClient()
    .from('app_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();

  if (error || !data) return fallback;

  const value = typeof data.value === 'number' ? data.value : Number(data.value);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return value;
}

// ---------------------------------------------------------------------------
// Energy + difficulty reads (display) — FAIL OPEN
// ---------------------------------------------------------------------------
export interface EnergyStatus {
  balance: number;
  max: number;
}

// Grants the daily energy (lazily, server-side) and returns the current balance
// + the daily max. Fails OPEN to a full meter so the games UI still renders if
// the read hiccups — the authoritative gate is settle_tictactoe (which raises
// 'no_energy' / 'unavailable'), not this display value.
export async function getEnergyStatus(userId: string): Promise<EnergyStatus> {
  const max = Math.round(await readNumericSetting(GAME_DAILY_ENERGY_KEY, DEFAULT_GAME_DAILY_ENERGY));
  try {
    const { data, error } = await createAdminClient().rpc('grant_daily_energy', {
      p_user_id: userId,
      p_daily_grant: max,
    });
    if (error || typeof data !== 'number') return { balance: max, max };
    return { balance: data, max };
  } catch {
    return { balance: max, max };
  }
}

// The current XO win reward (for display). Resolves the admin override, fails
// open to the TS default. The authoritative amount used to credit is resolved
// again inside playTicTacToe and re-checked by the RPC.
export async function getTicTacToeWinReward(): Promise<number> {
  return readNumericSetting(TICTACTOE_WIN_REWARD_KEY, DEFAULT_TICTACTOE_WIN_REWARD);
}

// How many tic-tac-toe games the user has already played today (UTC). Drives the
// "first game of the day is easy" rule on the client. Fails OPEN to 0 (→ easy);
// this is display-only, the server independently recomputes difficulty at settle.
export async function getTicTacToeTodayCount(userId: string): Promise<number> {
  try {
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const { count, error } = await createAdminClient()
      .from('coin_game_plays')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('game', 'tictactoe')
      .gte('created_at', dayStart.toISOString());
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// XO board logic + the two deterministic AIs
// ---------------------------------------------------------------------------
type Cell = 'X' | 'O' | null;
type Board = Cell[];

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

function winnerOf(board: Board): 'X' | 'O' | null {
  for (const [a, b, c] of WIN_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a] as 'X' | 'O';
    }
  }
  return null;
}

function isFull(board: Board): boolean {
  return board.every((c) => c !== null);
}

// Minimax from O's perspective (O maximises, X minimises). Depth-folded so O
// prefers a faster win / slower loss; combined with the fixed 0..8 iteration
// order it makes O's move fully deterministic and reproducible.
function minimax(board: Board, turn: 'X' | 'O', depth: number): number {
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

// HARD: O's optimal move (unbeatable). Fixed 0..8 first-best tie-break.
function hardAiMove(board: Board): number {
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

// EASY: play the first empty cell (0..8). Deterministic and deliberately weak —
// it never blocks or plans, so the user can win easily. The client mirrors this
// EXACT logic so the game it shows matches the server's re-simulation.
function easyAiMove(board: Board): number {
  for (let i = 0; i < 9; i++) {
    if (board[i] === null) return i;
  }
  return -1;
}

function aiMove(board: Board, difficulty: Difficulty): number {
  return difficulty === 'easy' ? easyAiMove(board) : hardAiMove(board);
}

export interface TicTacToeMoveStep {
  player: 'user' | 'ai';
  cell: number;
}

// Re-simulates the game from the user's submitted X-move sequence against the
// AI at `difficulty`. Returns the terminal outcome, or a failure if any move is
// illegal or the sequence does not end in a terminal position.
function simulateTicTacToe(
  userMoves: number[],
  difficulty: Difficulty
):
  | { ok: true; outcome: GameOutcome; aiMoves: number[]; sequence: TicTacToeMoveStep[]; board: Board }
  | { ok: false } {
  const board: Board = Array(9).fill(null);
  const aiMoves: number[] = [];
  const sequence: TicTacToeMoveStep[] = [];

  for (const move of userMoves) {
    if (winnerOf(board) !== null || isFull(board)) return { ok: false };
    if (!Number.isInteger(move) || move < 0 || move > 8 || board[move] !== null) {
      return { ok: false };
    }

    board[move] = 'X';
    sequence.push({ player: 'user', cell: move });

    if (winnerOf(board) === 'X') return { ok: true, outcome: 'win', aiMoves, sequence, board };
    if (isFull(board)) return { ok: true, outcome: 'draw', aiMoves, sequence, board };

    const ai = aiMove(board, difficulty);
    if (ai < 0) return { ok: false };
    board[ai] = 'O';
    aiMoves.push(ai);
    sequence.push({ player: 'ai', cell: ai });

    if (winnerOf(board) === 'O') return { ok: true, outcome: 'loss', aiMoves, sequence, board };
    if (isFull(board)) return { ok: true, outcome: 'draw', aiMoves, sequence, board };
  }

  // Consumed every user move but the game is still in progress — incomplete.
  return { ok: false };
}

// ---------------------------------------------------------------------------
// Play + settle
// ---------------------------------------------------------------------------
export type TicTacToeSettleError = 'no_energy' | 'unavailable' | 'error';

export type TicTacToeResult =
  | {
      ok: true;
      outcome: GameOutcome;
      difficulty: Difficulty;
      aiMoves: number[];
      sequence: TicTacToeMoveStep[];
      board: Cell[];
      reward: number;
      energy: number;
      balance: number;
    }
  | { ok: false; error: TicTacToeSettleError | 'invalid_moves' };

export async function playTicTacToe(userId: string, userMoves: number[]): Promise<TicTacToeResult> {
  // Difficulty is decided SERVER-SIDE from today's play count: the FIRST game of
  // the day is easy, the rest hard. The client computes the same from the count
  // it was given, so its local game matches this re-simulation.
  const todayCount = await getTicTacToeTodayCount(userId);
  const difficulty: Difficulty = todayCount === 0 ? 'easy' : 'hard';

  const sim = simulateTicTacToe(userMoves, difficulty);
  if (!sim.ok) return { ok: false, error: 'invalid_moves' };

  const [energyMax, energyCost, winReward, winCap] = await Promise.all([
    readNumericSetting(GAME_DAILY_ENERGY_KEY, DEFAULT_GAME_DAILY_ENERGY),
    readNumericSetting(GAME_ENERGY_COST_KEY, DEFAULT_GAME_ENERGY_COST),
    readNumericSetting(TICTACTOE_WIN_REWARD_KEY, DEFAULT_TICTACTOE_WIN_REWARD),
    readNumericSetting(TICTACTOE_DAILY_WIN_CAP_KEY, DEFAULT_TICTACTOE_DAILY_WIN_CAP),
  ]);

  const { data, error } = await createAdminClient().rpc('settle_tictactoe', {
    p_user_id: userId,
    p_outcome: sim.outcome,
    p_win_reward: winReward,
    p_daily_energy_grant: Math.round(energyMax),
    p_energy_cost: Math.round(energyCost),
    p_daily_win_reward_cap: Math.round(winCap),
  });

  if (error) {
    const message = error.message ?? '';
    if (message.includes('no_energy')) return { ok: false, error: 'no_energy' };
    if (isMissingRelationError(error)) return { ok: false, error: 'unavailable' };
    console.error('[coins] settle_tictactoe RPC failed:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return { ok: false, error: 'error' };
  }

  if (typeof data !== 'object' || data === null) return { ok: false, error: 'error' };
  const result = data as { balance?: number; energy?: number; reward?: number };

  return {
    ok: true,
    outcome: sim.outcome,
    difficulty,
    aiMoves: sim.aiMoves,
    sequence: sim.sequence,
    board: sim.board,
    reward: Number(result.reward ?? 0),
    energy: Number(result.energy ?? 0),
    balance: Number(result.balance ?? 0),
  };
}
