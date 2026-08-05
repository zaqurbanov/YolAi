import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { isMissingRelationError } from '@/lib/supabase/missingRelation';
import { logError } from '@/lib/logging/logError';
import { getEffectiveEnergyGrant, getActiveGaragePerk } from '@/lib/garage/perks';

// XO (tic-tac-toe) — NO-WAGER reward model (0067_xo_energy_rewards.sql). The old
// betting games (rps, coinflip) were removed. Playing costs 1 ENERGY; winning
// credits a small, daily-capped ENERGY reward (coins until
// 0094_two_currency_economy.sql — see that file's INVARIANT header).
// SERVER-AUTHORITATIVE: the client submits only its own board moves; the server
// re-simulates the game against a DETERMINISTIC AI, derives the outcome, and
// settles energy + reward. Fail-CLOSED on the play path; fail-OPEN on the
// read-only energy/difficulty display.

// ---------------------------------------------------------------------------
// Config — app_settings with TS-side defaults (house convention, no seed rows).
// ---------------------------------------------------------------------------
// The once-per-Baku-day energy top-up. Since 0094 this is ADDITIVE — earned
// energy accumulates instead of being wiped at the day boundary — so it is a
// daily INCOME, not a ceiling. getEnergyStatus still reports it as `max` for
// the meter's scale, which is why a balance can now exceed `max`.
const GAME_DAILY_ENERGY_KEY = 'game_daily_energy';
const DEFAULT_GAME_DAILY_ENERGY = 10;

const GAME_ENERGY_COST_KEY = 'game_energy_cost';
const DEFAULT_GAME_ENERGY_COST = 1;

const TICTACTOE_WIN_REWARD_KEY = 'tictactoe_win_reward';
const DEFAULT_TICTACTOE_WIN_REWARD = 2;

const TICTACTOE_DAILY_WIN_CAP_KEY = 'tictactoe_daily_win_cap';
const DEFAULT_TICTACTOE_DAILY_WIN_CAP = 3;

// "Buy energy with coins" — a coin SINK (0072_energy_purchase.sql), not a new
// extraction path. See purchaseEnergy() below for the exchange itself.
const ENERGY_PURCHASE_COIN_COST_KEY = 'energy_purchase_coin_cost';
const DEFAULT_ENERGY_PURCHASE_COIN_COST = 5;

const ENERGY_PURCHASE_ENERGY_AMOUNT_KEY = 'energy_purchase_energy_amount';
const DEFAULT_ENERGY_PURCHASE_ENERGY_AMOUNT = 10;

const ENERGY_PURCHASE_MAX_BALANCE_KEY = 'energy_purchase_max_balance';
const DEFAULT_ENERGY_PURCHASE_MAX_BALANCE = 50;

const ENERGY_PURCHASE_MAX_MULTIPLIER_KEY = 'energy_purchase_max_multiplier';
const DEFAULT_ENERGY_PURCHASE_MAX_MULTIPLIER = 5;

export {
  GAME_DAILY_ENERGY_KEY,
  DEFAULT_GAME_DAILY_ENERGY,
  GAME_ENERGY_COST_KEY,
  DEFAULT_GAME_ENERGY_COST,
  TICTACTOE_WIN_REWARD_KEY,
  DEFAULT_TICTACTOE_WIN_REWARD,
  TICTACTOE_DAILY_WIN_CAP_KEY,
  DEFAULT_TICTACTOE_DAILY_WIN_CAP,
  ENERGY_PURCHASE_COIN_COST_KEY,
  DEFAULT_ENERGY_PURCHASE_COIN_COST,
  ENERGY_PURCHASE_ENERGY_AMOUNT_KEY,
  DEFAULT_ENERGY_PURCHASE_ENERGY_AMOUNT,
  ENERGY_PURCHASE_MAX_BALANCE_KEY,
  DEFAULT_ENERGY_PURCHASE_MAX_BALANCE,
  ENERGY_PURCHASE_MAX_MULTIPLIER_KEY,
  DEFAULT_ENERGY_PURCHASE_MAX_MULTIPLIER,
};

export type GameOutcome = 'win' | 'draw' | 'loss';

// "easy" = the beatable AI used for the user's FIRST game each day; "hard" = the
// unbeatable optimal AI for every game after. BOTH are deterministic so the
// server can re-simulate and verify the submitted game (a random AI would make
// the re-simulation diverge from what the user actually played).
export type Difficulty = 'easy' | 'hard';

// `allowZero` exists because 0 means two different things depending on the key:
// for a PRICE key it is a real configuration (free play, set from the admin
// panel) and must survive the read; for a reward/cap/grant key it is a
// "couldn't read a usable value" signal and must fall back to the TS default.
// Same split as getGlobalDailyCoinGrant() in lib/chat/coins.ts.
async function readNumericSetting(
  key: string,
  fallback: number,
  options?: { allowZero?: boolean }
): Promise<number> {
  const { data, error } = await createAdminClient()
    .from('app_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();

  if (error || !data) return fallback;

  const value = typeof data.value === 'number' ? data.value : Number(data.value);
  if (!Number.isFinite(value)) return fallback;
  if (options?.allowZero ? value < 0 : value <= 0) return fallback;
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
  const base = await readNumericSetting(GAME_DAILY_ENERGY_KEY, DEFAULT_GAME_DAILY_ENERGY);
  // The meter's scale must use the SAME perk-adjusted grant that is actually
  // credited, otherwise a Prius owner reads 15/10 on a fresh day.
  const max = Math.round(await getEffectiveEnergyGrant(userId, base));
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

// The GLOBAL daily energy floor, with no user and no side effects — unlike
// getEnergyStatus above, which grants and needs a userId. For display on pages
// that describe the free tier to someone who may not be signed in (/qiymetler).
// Garage perks are per-user and deliberately not included here.
export async function getGlobalDailyEnergyGrant(): Promise<number> {
  return Math.round(await readNumericSetting(GAME_DAILY_ENERGY_KEY, DEFAULT_GAME_DAILY_ENERGY));
}

// The XO round price in ENERGY (for display). allowZero: an admin-configured
// 0 means free play and must be reported as 0, not silently as the default.
// The authoritative charge is settle_tictactoe's conditional decrement.
export async function getGameEnergyCost(): Promise<number> {
  return readNumericSetting(GAME_ENERGY_COST_KEY, DEFAULT_GAME_ENERGY_COST, { allowZero: true });
}

// The current XO win reward in ENERGY (for display). Resolves the admin
// override, fails open to the TS default. The authoritative amount used to
// credit is resolved again inside playTicTacToe and re-checked by the RPC.
export async function getTicTacToeWinReward(): Promise<number> {
  return readNumericSetting(TICTACTOE_WIN_REWARD_KEY, DEFAULT_TICTACTOE_WIN_REWARD);
}

// How many tic-tac-toe games the user has already played today (UTC). Drives the
// "every 3rd game is easy" rule on the client. Fails OPEN to 0 (→ easy);
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
      /** ENERGY paid for a win (since 0094). */
      reward: number;
      /** New ENERGY balance, after the play cost AND any win reward. */
      energy: number;
      /** Coin balance — unchanged by a game, returned for the shared meter. */
      balance: number;
    }
  | { ok: false; error: TicTacToeSettleError | 'invalid_moves' };

export async function playTicTacToe(userId: string, userMoves: number[]): Promise<TicTacToeResult> {
  // Difficulty is decided SERVER-SIDE from today's play count: EVERY 3RD game of
  // the day is easy (1st, 4th, 7th, ...), the rest hard. The client computes the
  // same from the count it was given, so its local game matches this re-simulation.
  const todayCount = await getTicTacToeTodayCount(userId);
  const difficulty: Difficulty = todayCount % 3 === 0 ? 'easy' : 'hard';

  const sim = simulateTicTacToe(userMoves, difficulty);
  if (!sim.ok) return { ok: false, error: 'invalid_moves' };

  const [energyMax, energyCost, winReward, winCap, garagePerk] = await Promise.all([
    readNumericSetting(GAME_DAILY_ENERGY_KEY, DEFAULT_GAME_DAILY_ENERGY),
    readNumericSetting(GAME_ENERGY_COST_KEY, DEFAULT_GAME_ENERGY_COST, { allowZero: true }),
    readNumericSetting(TICTACTOE_WIN_REWARD_KEY, DEFAULT_TICTACTOE_WIN_REWARD),
    readNumericSetting(TICTACTOE_DAILY_WIN_CAP_KEY, DEFAULT_TICTACTOE_DAILY_WIN_CAP),
    getActiveGaragePerk(userId),
  ]);

  // Energy grant amount goes through getEffectiveEnergyGrant (the ONLY place
  // that computes it) so it stays in sync with getEnergyStatus above and the
  // sign speed / exam call sites — reusing garagePerk.energyBonus here would
  // duplicate that logic and risk drifting from it.
  const effectiveEnergyMax = await getEffectiveEnergyGrant(userId, energyMax);
  // Lada 2107 perk: +xoBonusPct% on the win reward (not cumulative with any
  // other tier's perk — see lib/garage/perks.ts).
  const effectiveWinReward = Math.round(winReward * (1 + garagePerk.xoBonusPct / 100) * 100) / 100;

  const { data, error } = await createAdminClient().rpc('settle_tictactoe', {
    p_user_id: userId,
    p_outcome: sim.outcome,
    p_win_reward: effectiveWinReward,
    p_daily_energy_grant: Math.round(effectiveEnergyMax),
    p_energy_cost: Math.round(energyCost),
    p_daily_win_reward_cap: Math.round(winCap),
  });

  if (error) {
    const message = error.message ?? '';
    if (message.includes('no_energy')) return { ok: false, error: 'no_energy' };
    if (isMissingRelationError(error)) return { ok: false, error: 'unavailable' };
    void logError('coins.games.settleTicTacToe', error, { userId });
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

// ---------------------------------------------------------------------------
// Buy energy with coins (0072_energy_purchase.sql) — a coin SINK
// ---------------------------------------------------------------------------
export interface EnergyPurchaseConfig {
  coinCost: number;
  energyAmount: number;
  maxBalance: number;
  maxMultiplier: number;
}

// Read-only, admin-configured exchange rate for display. Fails OPEN to the TS
// defaults like getEnergyStatus/getTicTacToeWinReward — the authoritative gate
// is purchase_energy itself.
export async function getEnergyPurchaseConfig(): Promise<EnergyPurchaseConfig> {
  const [coinCost, energyAmount, maxBalance, maxMultiplier] = await Promise.all([
    readNumericSetting(ENERGY_PURCHASE_COIN_COST_KEY, DEFAULT_ENERGY_PURCHASE_COIN_COST),
    readNumericSetting(ENERGY_PURCHASE_ENERGY_AMOUNT_KEY, DEFAULT_ENERGY_PURCHASE_ENERGY_AMOUNT),
    readNumericSetting(ENERGY_PURCHASE_MAX_BALANCE_KEY, DEFAULT_ENERGY_PURCHASE_MAX_BALANCE),
    readNumericSetting(ENERGY_PURCHASE_MAX_MULTIPLIER_KEY, DEFAULT_ENERGY_PURCHASE_MAX_MULTIPLIER),
  ]);
  return { coinCost, energyAmount, maxBalance, maxMultiplier };
}

export type EnergyPurchaseError = 'insufficient_coins' | 'energy_cap_reached' | 'unavailable' | 'error';

export type EnergyPurchaseResult =
  | { ok: true; coinBalance: number; energy: number }
  | { ok: false; error: EnergyPurchaseError };

// The client may only supply a MULTIPLIER (never an amount or rate). It is
// clamped server-side below; every base amount is still resolved server-side
// from app_settings (fail-open TS defaults) and passed to purchase_energy,
// which is the sole authority on whether the exchange is allowed.
function clampMultiplier(raw: number, maxMultiplier: number): number {
  if (!Number.isFinite(raw)) return 1;
  return Math.min(Math.max(1, Math.floor(raw)), Math.max(1, Math.floor(maxMultiplier)));
}

export async function purchaseEnergy(
  userId: string,
  multiplier = 1
): Promise<EnergyPurchaseResult> {
  const [dailyEnergyGrant, baseCoinCost, baseEnergyAmount, maxBalance, maxMultiplier] =
    await Promise.all([
      readNumericSetting(GAME_DAILY_ENERGY_KEY, DEFAULT_GAME_DAILY_ENERGY),
      readNumericSetting(ENERGY_PURCHASE_COIN_COST_KEY, DEFAULT_ENERGY_PURCHASE_COIN_COST),
      readNumericSetting(ENERGY_PURCHASE_ENERGY_AMOUNT_KEY, DEFAULT_ENERGY_PURCHASE_ENERGY_AMOUNT),
      readNumericSetting(ENERGY_PURCHASE_MAX_BALANCE_KEY, DEFAULT_ENERGY_PURCHASE_MAX_BALANCE),
      readNumericSetting(ENERGY_PURCHASE_MAX_MULTIPLIER_KEY, DEFAULT_ENERGY_PURCHASE_MAX_MULTIPLIER),
    ]);

  const m = clampMultiplier(multiplier, maxMultiplier);
  const coinCost = Math.round(baseCoinCost * m * 100) / 100;
  const energyAmount = Math.round(baseEnergyAmount * m);

  const { data, error } = await createAdminClient().rpc('purchase_energy', {
    p_user_id: userId,
    p_coin_cost: coinCost,
    p_energy_amount: energyAmount,
    p_daily_energy_grant: Math.round(dailyEnergyGrant),
    p_max_energy: Math.round(maxBalance),
  });

  if (error) {
    const message = error.message ?? '';
    if (message.includes('insufficient_coins')) return { ok: false, error: 'insufficient_coins' };
    if (message.includes('energy_cap_reached')) return { ok: false, error: 'energy_cap_reached' };
    if (isMissingRelationError(error)) return { ok: false, error: 'unavailable' };
    void logError('coins.games.purchaseEnergy', error, { userId });
    console.error('[coins] purchase_energy RPC failed:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return { ok: false, error: 'error' };
  }

  if (typeof data !== 'object' || data === null) return { ok: false, error: 'error' };
  const result = data as { coinBalance?: number; energy?: number };

  return {
    ok: true,
    coinBalance: Number(result.coinBalance ?? 0),
    energy: Number(result.energy ?? 0),
  };
}
