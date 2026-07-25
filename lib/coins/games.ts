import 'server-only';
import { randomInt } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { isMissingRelationError } from '@/lib/supabase/missingRelation';

// Coin mini-games (0066_coin_mini_games.sql): Daş-Kağız-Qayçı (rps), Sikkə
// atma (coinflip), XO (tictactoe). SERVER-AUTHORITATIVE — the client tells us
// only its own inputs (its throw, its guess, its ordered board moves); the
// server generates every random value with crypto RNG, derives the outcome,
// computes the payout, and hands all of that to settle_coin_game. The client
// NEVER tells us whether it won or how much. Fail-CLOSED like the rest of the
// coin surface: any error settles nothing.

// ---------------------------------------------------------------------------
// Config — resolved from app_settings with TS-side defaults (house convention,
// mirrors lib/coins/quiz.ts / adWatch.ts). No seed rows; these are the truth
// until an admin overrides them.
// ---------------------------------------------------------------------------
const GAME_BET_AMOUNT_KEY = 'game_bet_amount';
const DEFAULT_GAME_BET_AMOUNT = 1;

const RPS_WIN_MULTIPLIER_KEY = 'rps_win_multiplier';
const DEFAULT_RPS_WIN_MULTIPLIER = 1.8;

const COINFLIP_WIN_MULTIPLIER_KEY = 'coinflip_win_multiplier';
const DEFAULT_COINFLIP_WIN_MULTIPLIER = 1.9;

const TICTACTOE_WIN_MULTIPLIER_KEY = 'tictactoe_win_multiplier';
const DEFAULT_TICTACTOE_WIN_MULTIPLIER = 5;

const GAME_DAILY_PLAY_CAP_KEY = 'game_daily_play_cap';
const DEFAULT_GAME_DAILY_PLAY_CAP = 30;

export {
  GAME_BET_AMOUNT_KEY,
  DEFAULT_GAME_BET_AMOUNT,
  RPS_WIN_MULTIPLIER_KEY,
  DEFAULT_RPS_WIN_MULTIPLIER,
  COINFLIP_WIN_MULTIPLIER_KEY,
  DEFAULT_COINFLIP_WIN_MULTIPLIER,
  TICTACTOE_WIN_MULTIPLIER_KEY,
  DEFAULT_TICTACTOE_WIN_MULTIPLIER,
  GAME_DAILY_PLAY_CAP_KEY,
  DEFAULT_GAME_DAILY_PLAY_CAP,
};

export type GameId = 'rps' | 'tictactoe' | 'coinflip';
export type GameOutcome = 'win' | 'draw' | 'loss';
export type RpsChoice = 'rock' | 'paper' | 'scissors';
export type CoinSide = 'heads' | 'tails';

export const RPS_CHOICES: readonly RpsChoice[] = ['rock', 'paper', 'scissors'];
export const COIN_SIDES: readonly CoinSide[] = ['heads', 'tails'];

// Fail-OPEN to the default (display/config read), same shape as
// getQuizRewardAmount / readNumericSetting elsewhere. A positive number.
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

interface GameConfig {
  betAmount: number;
  dailyCap: number;
  multipliers: Record<GameId, number>;
}

// Resolves everything a play needs in one place, so both the payout the server
// computes AND the ceiling the RPC recomputes come from the same trusted
// multipliers (passed to settle_coin_game as p_multipliers).
async function getGameConfig(): Promise<GameConfig> {
  const [betAmount, dailyCap, rps, coinflip, tictactoe] = await Promise.all([
    readNumericSetting(GAME_BET_AMOUNT_KEY, DEFAULT_GAME_BET_AMOUNT),
    readNumericSetting(GAME_DAILY_PLAY_CAP_KEY, DEFAULT_GAME_DAILY_PLAY_CAP),
    readNumericSetting(RPS_WIN_MULTIPLIER_KEY, DEFAULT_RPS_WIN_MULTIPLIER),
    readNumericSetting(COINFLIP_WIN_MULTIPLIER_KEY, DEFAULT_COINFLIP_WIN_MULTIPLIER),
    readNumericSetting(TICTACTOE_WIN_MULTIPLIER_KEY, DEFAULT_TICTACTOE_WIN_MULTIPLIER),
  ]);

  return {
    betAmount,
    dailyCap: Math.round(dailyCap),
    multipliers: { rps, coinflip, tictactoe },
  };
}

// Payout for a settled play, computed the SAME way the RPC recomputes its
// ceiling (0066): loss -> 0, draw -> bet (push), win -> round(bet*multiplier).
function payoutFor(outcome: GameOutcome, bet: number, multiplier: number): number {
  if (outcome === 'loss') return 0;
  if (outcome === 'draw') return bet;
  return Math.round(bet * multiplier);
}

// ---------------------------------------------------------------------------
// settle wrapper
// ---------------------------------------------------------------------------
export type SettleError =
  | 'daily_cap_reached'
  | 'insufficient_balance'
  | 'unavailable'
  | 'error';

type SettleResult = { ok: true; balance: number } | { ok: false; error: SettleError };

// Delegates the atomic debit/credit/audit to settle_coin_game. The RPC is the
// authority: it revalidates the bet and RE-DERIVES the payout ceiling, so a
// bug here can never over-credit. isMissingRelationError -> 'unavailable' so
// the feature degrades to a disabled/empty state until 0066 is applied by hand.
async function settleGame(
  userId: string,
  game: GameId,
  outcome: GameOutcome,
  payout: number,
  config: GameConfig
): Promise<SettleResult> {
  const { data, error } = await createAdminClient().rpc('settle_coin_game', {
    p_user_id: userId,
    p_game: game,
    p_bet: config.betAmount,
    p_outcome: outcome,
    p_payout: payout,
    p_bet_amount: config.betAmount,
    p_multipliers: config.multipliers,
    p_daily_cap: config.dailyCap,
  });

  if (error) {
    const message = error.message ?? '';
    if (message.includes('daily_cap_reached')) return { ok: false, error: 'daily_cap_reached' };
    if (message.includes('insufficient_balance')) return { ok: false, error: 'insufficient_balance' };
    if (isMissingRelationError(error)) return { ok: false, error: 'unavailable' };
    console.error('[coins] settle_coin_game RPC failed:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return { ok: false, error: 'error' };
  }

  if (typeof data !== 'number') return { ok: false, error: 'error' };
  return { ok: true, balance: data };
}

// ---------------------------------------------------------------------------
// Daş-Kağız-Qayçı (rock-paper-scissors)
// ---------------------------------------------------------------------------
export type RpsResult =
  | {
      ok: true;
      outcome: GameOutcome;
      userChoice: RpsChoice;
      serverChoice: RpsChoice;
      bet: number;
      payout: number;
      balance: number;
    }
  | { ok: false; error: SettleError };

// rock beats scissors, scissors beats paper, paper beats rock.
const RPS_BEATS: Record<RpsChoice, RpsChoice> = {
  rock: 'scissors',
  scissors: 'paper',
  paper: 'rock',
};

function rpsOutcome(user: RpsChoice, server: RpsChoice): GameOutcome {
  if (user === server) return 'draw';
  return RPS_BEATS[user] === server ? 'win' : 'loss';
}

export async function playRps(userId: string, userChoice: RpsChoice): Promise<RpsResult> {
  const config = await getGameConfig();

  // Server's throw — crypto RNG, never derived from the user's input.
  const serverChoice = RPS_CHOICES[randomInt(0, RPS_CHOICES.length)];
  const outcome = rpsOutcome(userChoice, serverChoice);
  const payout = payoutFor(outcome, config.betAmount, config.multipliers.rps);

  const settled = await settleGame(userId, 'rps', outcome, payout, config);
  if (!settled.ok) return { ok: false, error: settled.error };

  return {
    ok: true,
    outcome,
    userChoice,
    serverChoice,
    bet: config.betAmount,
    payout,
    balance: settled.balance,
  };
}

// ---------------------------------------------------------------------------
// Sikkə atma (coin flip) — no draw; the coin is heads or tails.
// ---------------------------------------------------------------------------
export type CoinFlipResult =
  | {
      ok: true;
      outcome: Exclude<GameOutcome, 'draw'>;
      userPick: CoinSide;
      result: CoinSide;
      bet: number;
      payout: number;
      balance: number;
    }
  | { ok: false; error: SettleError };

export async function playCoinFlip(userId: string, userPick: CoinSide): Promise<CoinFlipResult> {
  const config = await getGameConfig();

  const result = COIN_SIDES[randomInt(0, COIN_SIDES.length)];
  const outcome: Exclude<GameOutcome, 'draw'> = userPick === result ? 'win' : 'loss';
  const payout = payoutFor(outcome, config.betAmount, config.multipliers.coinflip);

  const settled = await settleGame(userId, 'coinflip', outcome, payout, config);
  if (!settled.ok) return { ok: false, error: settled.error };

  return {
    ok: true,
    outcome,
    userPick,
    result,
    bet: config.betAmount,
    payout,
    balance: settled.balance,
  };
}

// ---------------------------------------------------------------------------
// XO (tic-tac-toe) vs an unbeatable minimax AI — SERVER RE-SIMULATION
// ---------------------------------------------------------------------------
// The client submits only the ordered sequence of the USER's cell moves. The
// server replays the game from an empty board: the user is X and moves first,
// and after each legal user move the server plays the DETERMINISTIC optimal O
// response (minimax). Every user move is validated (in range, cell empty, it is
// the user's turn); a fabricated or illegal sequence is rejected outright and
// nothing settles. The client's claimed outcome plays no part — the outcome is
// whatever the re-simulation produces. Because O is optimal it can never lose,
// so real outcomes are draw or user-loss; a user win is honoured if it ever
// genuinely occurs (it cannot against correct play, but the code pays it).

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

// Minimax score from O's perspective. O maximises, X minimises. Depth is folded
// in so O prefers a faster win and a slower loss, and — combined with the
// fixed 0..8 iteration order below — makes O's chosen move fully deterministic
// and reproducible, which is what lets the server's play be verifiable.
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

// O's optimal move on `board`. Fixed tie-break: iterate 0..8 and keep the FIRST
// cell achieving the best score, so the server's response to any position is
// deterministic. Returns -1 only if the board is full (never happens on O's
// turn during a live game).
function bestAiMove(board: Board): number {
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

export interface TicTacToeMoveStep {
  player: 'user' | 'ai';
  cell: number;
}

export type TicTacToeResult =
  | {
      ok: true;
      outcome: GameOutcome;
      userMoves: number[];
      aiMoves: number[];
      sequence: TicTacToeMoveStep[];
      board: Cell[];
      bet: number;
      payout: number;
      balance: number;
    }
  | { ok: false; error: SettleError | 'invalid_moves' };

// Re-simulates the game. Returns the terminal outcome + the AI's moves, or
// 'invalid_moves' if any user move is illegal or the submitted sequence does
// not end in a terminal position (win/loss/draw). Nothing is settled for an
// invalid sequence.
function simulateTicTacToe(userMoves: number[]):
  | {
      ok: true;
      outcome: GameOutcome;
      aiMoves: number[];
      sequence: TicTacToeMoveStep[];
      board: Board;
    }
  | { ok: false } {
  const board: Board = Array(9).fill(null);
  const aiMoves: number[] = [];
  const sequence: TicTacToeMoveStep[] = [];

  for (const move of userMoves) {
    // A terminal position must not receive further user moves — if the game was
    // already decided, the submitted sequence is fabricated.
    if (winnerOf(board) !== null || isFull(board)) return { ok: false };

    // User move must be an in-range index into an empty cell.
    if (!Number.isInteger(move) || move < 0 || move > 8 || board[move] !== null) {
      return { ok: false };
    }

    board[move] = 'X';
    sequence.push({ player: 'user', cell: move });

    if (winnerOf(board) === 'X') {
      return { ok: true, outcome: 'win', aiMoves, sequence, board };
    }
    if (isFull(board)) {
      return { ok: true, outcome: 'draw', aiMoves, sequence, board };
    }

    // Optimal AI reply.
    const aiMove = bestAiMove(board);
    if (aiMove < 0) return { ok: false };
    board[aiMove] = 'O';
    aiMoves.push(aiMove);
    sequence.push({ player: 'ai', cell: aiMove });

    if (winnerOf(board) === 'O') {
      return { ok: true, outcome: 'loss', aiMoves, sequence, board };
    }
    if (isFull(board)) {
      return { ok: true, outcome: 'draw', aiMoves, sequence, board };
    }
  }

  // Consumed every submitted user move but the game is still in progress — an
  // incomplete submission, treated as invalid (we only settle terminal games).
  return { ok: false };
}

export async function playTicTacToe(
  userId: string,
  userMoves: number[]
): Promise<TicTacToeResult> {
  const sim = simulateTicTacToe(userMoves);
  if (!sim.ok) return { ok: false, error: 'invalid_moves' };

  const config = await getGameConfig();
  const payout = payoutFor(sim.outcome, config.betAmount, config.multipliers.tictactoe);

  const settled = await settleGame(userId, 'tictactoe', sim.outcome, payout, config);
  if (!settled.ok) return { ok: false, error: settled.error };

  return {
    ok: true,
    outcome: sim.outcome,
    userMoves,
    aiMoves: sim.aiMoves,
    sequence: sim.sequence,
    board: sim.board,
    bet: config.betAmount,
    payout,
    balance: settled.balance,
  };
}
