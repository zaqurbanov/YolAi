'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { claimAdWatchReward, issueAdViewToken } from '@/lib/coins/adWatch';
import {
  playCoinFlip,
  playRps,
  playTicTacToe,
  COIN_SIDES,
  RPS_CHOICES,
  type CoinSide,
  type RpsChoice,
  type SettleError,
} from '@/lib/coins/games';

export interface AdWatchClaimState {
  status: 'success' | 'daily_limit_reached' | 'invalid_token' | 'too_early' | 'error';
  message: string;
  reward?: number;
  balance?: number;
}

export interface AdViewStartState {
  status: 'success' | 'error';
  nonce?: string;
  message?: string;
}

// Starts an ad view and hands back a single-use, server-issued nonce that
// claimAdWatchRewardAction must present. The elapsed-time check is a
// comparison of the token's server-recorded issued_at against the server's
// clock at claim time, so the client cannot shorten the ad by lying about
// how long it waited — the only thing it can do with this value is present
// it back, once, after enough real time has passed.
export async function startAdViewAction(): Promise<AdViewStartState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: 'error', message: 'Giriş tələb olunur' };
  }

  const nonce = await issueAdViewToken(user.id);
  if (!nonce) {
    return { status: 'error', message: 'Xəta baş verdi. Bir az sonra yenidən cəhd edin' };
  }

  return { status: 'success', nonce };
}

// Mirrors app/oyrenme/actions.ts's submitLessonAnswerAction: session lookup
// via the normal RLS-respecting client, then delegate the actual claim to
// the lib function (which uses the admin client internally and is the sole
// place the daily cap is enforced, via the RPC's row-locked count).
export async function claimAdWatchRewardAction(nonce: string): Promise<AdWatchClaimState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: 'error', message: 'Giriş tələb olunur' };
  }

  const result = await claimAdWatchReward(user.id, typeof nonce === 'string' ? nonce : '');

  if (!result.ok) {
    if (result.error === 'daily_limit_reached') {
      return { status: 'daily_limit_reached', message: 'Bugünkü reklam limitinə çatmısınız' };
    }
    if (result.error === 'too_early') {
      return { status: 'too_early', message: 'Reklam hələ bitməyib. Bir az gözləyin' };
    }
    if (result.error === 'invalid_token') {
      return { status: 'invalid_token', message: 'Reklam sessiyası etibarsızdır. Yenidən başlayın' };
    }
    return { status: 'error', message: 'Xəta baş verdi. Bir az sonra yenidən cəhd edin' };
  }

  revalidatePath('/coin-qazan');
  return {
    status: 'success',
    message: `Reklam izlədiniz! ${result.reward} coin qazandınız`,
    reward: result.reward,
    balance: result.balance,
  };
}

// ---------------------------------------------------------------------------
// Coin mini-games (0066_coin_mini_games.sql, lib/coins/games.ts)
// ---------------------------------------------------------------------------
// The three games share one status enum and one input posture: EVERY input is
// hostile. The user only supplies its own move(s); the server generates the
// RNG, re-simulates XO, derives the outcome, and computes the payout — this
// layer never accepts a client-supplied outcome, payout, or bet amount, and
// each action re-validates its input against the allowed values before
// delegating. All game paths fail closed (no reward on any error).

export type GamePlayStatus =
  | 'success'
  | 'daily_cap_reached'
  | 'insufficient_balance'
  | 'invalid_input'
  | 'unavailable'
  | 'error';

// Shared mapping of the lib SettleError codes to a user-facing status +
// Azerbaijani message. 'invalid_moves' (XO only) is folded into invalid_input
// by its own action before this is reached.
function settleErrorToStatus(error: SettleError): { status: GamePlayStatus; message: string } {
  switch (error) {
    case 'daily_cap_reached':
      return { status: 'daily_cap_reached', message: 'Bugünkü oyun limitinə çatmısınız' };
    case 'insufficient_balance':
      return { status: 'insufficient_balance', message: 'Kifayət qədər coininiz yoxdur' };
    case 'unavailable':
      return { status: 'unavailable', message: 'Oyunlar hazırda əlçatan deyil' };
    default:
      return { status: 'error', message: 'Xəta baş verdi. Bir az sonra yenidən cəhd edin' };
  }
}

// Success wording shared across games. Win/draw/loss are distinct because a
// draw is a push (bet returned) and a loss took the stake.
function outcomeMessage(outcome: 'win' | 'draw' | 'loss', payout: number): string {
  if (outcome === 'win') return `Qazandınız! ${payout} coin`;
  if (outcome === 'draw') return 'Heç-heçə. Mərciniz geri qaytarıldı';
  return 'Uduzdunuz. Növbəti dəfə uğurlar!';
}

export interface RpsPlayState {
  status: GamePlayStatus;
  message: string;
  outcome?: 'win' | 'draw' | 'loss';
  userChoice?: RpsChoice;
  serverChoice?: RpsChoice;
  bet?: number;
  payout?: number;
  balance?: number;
}

export async function playRpsAction(userChoice: RpsChoice): Promise<RpsPlayState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: 'error', message: 'Giriş tələb olunur' };
  }

  if (!RPS_CHOICES.includes(userChoice)) {
    return { status: 'invalid_input', message: 'Yanlış seçim' };
  }

  const result = await playRps(user.id, userChoice);
  if (!result.ok) return settleErrorToStatus(result.error);

  revalidatePath('/coin-qazan');
  return {
    status: 'success',
    message: outcomeMessage(result.outcome, result.payout),
    outcome: result.outcome,
    userChoice: result.userChoice,
    serverChoice: result.serverChoice,
    bet: result.bet,
    payout: result.payout,
    balance: result.balance,
  };
}

export interface CoinFlipPlayState {
  status: GamePlayStatus;
  message: string;
  outcome?: 'win' | 'loss';
  userPick?: CoinSide;
  result?: CoinSide;
  bet?: number;
  payout?: number;
  balance?: number;
}

export async function playCoinFlipAction(userPick: CoinSide): Promise<CoinFlipPlayState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: 'error', message: 'Giriş tələb olunur' };
  }

  if (!COIN_SIDES.includes(userPick)) {
    return { status: 'invalid_input', message: 'Yanlış seçim' };
  }

  const result = await playCoinFlip(user.id, userPick);
  if (!result.ok) return settleErrorToStatus(result.error);

  revalidatePath('/coin-qazan');
  return {
    status: 'success',
    message: outcomeMessage(result.outcome, result.payout),
    outcome: result.outcome,
    userPick: result.userPick,
    result: result.result,
    bet: result.bet,
    payout: result.payout,
    balance: result.balance,
  };
}

export interface TicTacToeMoveStepState {
  player: 'user' | 'ai';
  cell: number;
}

export interface TicTacToePlayState {
  status: GamePlayStatus;
  message: string;
  outcome?: 'win' | 'draw' | 'loss';
  // The user's moves echoed back, the AI's optimal replies in order, and the
  // full interleaved sequence + final board so the frontend can REPLAY the
  // server's authoritative game. The frontend must NOT score from these — the
  // outcome above is the server's, computed by re-simulation.
  userMoves?: number[];
  aiMoves?: number[];
  sequence?: TicTacToeMoveStepState[];
  board?: ('X' | 'O' | null)[];
  bet?: number;
  payout?: number;
  balance?: number;
}

export async function playTicTacToeAction(userMoves: number[]): Promise<TicTacToePlayState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: 'error', message: 'Giriş tələb olunur' };
  }

  // Shape validation only; legality (empty cell, correct turn, terminal game)
  // is decided by the re-simulation in lib/coins/games.ts, which is the sole
  // authority on the outcome.
  if (
    !Array.isArray(userMoves) ||
    userMoves.length === 0 ||
    userMoves.length > 9 ||
    !userMoves.every((m) => Number.isInteger(m) && m >= 0 && m <= 8)
  ) {
    return { status: 'invalid_input', message: 'Yanlış gedişlər' };
  }

  const result = await playTicTacToe(user.id, userMoves);
  if (!result.ok) {
    if (result.error === 'invalid_moves') {
      return { status: 'invalid_input', message: 'Yanlış gedişlər' };
    }
    return settleErrorToStatus(result.error);
  }

  revalidatePath('/coin-qazan');
  return {
    status: 'success',
    message: outcomeMessage(result.outcome, result.payout),
    outcome: result.outcome,
    userMoves: result.userMoves,
    aiMoves: result.aiMoves,
    sequence: result.sequence,
    board: result.board,
    bet: result.bet,
    payout: result.payout,
    balance: result.balance,
  };
}
