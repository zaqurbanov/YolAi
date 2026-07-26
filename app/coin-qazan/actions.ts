'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { claimAdWatchReward, issueAdViewToken } from '@/lib/coins/adWatch';
import { playTicTacToe, purchaseEnergy } from '@/lib/coins/games';
import { spinWheel } from '@/lib/coins/wheel';
import { startSignSpeedRound, submitSignSpeedRound, type SignSpeedQuestion } from '@/lib/coins/signSpeed';
import { claimDailyChest } from '@/lib/coins/dailyQuests';

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

export type GamePlayStatus = 'success' | 'no_energy' | 'invalid_input' | 'unavailable' | 'error';

// Win credits a reward, draw/loss nothing — no wager, so a loss costs no coins
// (only the 1 energy the play already spent).
function outcomeMessage(outcome: 'win' | 'draw' | 'loss', reward: number): string {
  if (outcome === 'win') return reward > 0 ? `Qazandın! +${reward} coin 🎉` : 'Qazandın! 🎉';
  if (outcome === 'draw') return 'Heç-heçə.';
  return 'Uduzdun. Növbəti dəfə uğurlar!';
}

export interface TicTacToeMoveStepState {
  player: 'user' | 'ai';
  cell: number;
}

export interface TicTacToePlayState {
  status: GamePlayStatus;
  message: string;
  outcome?: 'win' | 'draw' | 'loss';
  difficulty?: 'easy' | 'hard';
  // The user's moves echoed back, the AI's replies in order, and the full
  // interleaved sequence + final board so the frontend can REPLAY the server's
  // authoritative game. The frontend must NOT score from these — the outcome
  // above is the server's, computed by re-simulation.
  userMoves?: number[];
  aiMoves?: number[];
  sequence?: TicTacToeMoveStepState[];
  board?: ('X' | 'O' | null)[];
  reward?: number;
  energy?: number;
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
      return { status: 'invalid_input', message: 'Yanlış gedişlər. Yenidən cəhd et' };
    }
    if (result.error === 'no_energy') {
      return { status: 'no_energy', message: 'Enerjin bitib. Sabah yenilənəcək' };
    }
    if (result.error === 'unavailable') {
      return { status: 'unavailable', message: 'Oyun hazırda əlçatan deyil' };
    }
    return { status: 'error', message: 'Xəta baş verdi. Bir az sonra yenidən cəhd edin' };
  }

  revalidatePath('/coin-qazan');
  return {
    status: 'success',
    message: outcomeMessage(result.outcome, result.reward),
    outcome: result.outcome,
    difficulty: result.difficulty,
    userMoves,
    aiMoves: result.aiMoves,
    sequence: result.sequence,
    board: result.board,
    reward: result.reward,
    energy: result.energy,
    balance: result.balance,
  };
}

// ---------------------------------------------------------------------------
// Buy energy with coins (0072_energy_purchase.sql, lib/coins/games.ts) — a
// coin SINK, not a new extraction path. No arguments: the exchange rate is
// resolved entirely server-side in purchaseEnergy().
// ---------------------------------------------------------------------------
export interface PurchaseEnergyState {
  status: 'success' | 'insufficient_coins' | 'energy_cap_reached' | 'unavailable' | 'error';
  message: string;
  coinBalance?: number;
  energy?: number;
}

export async function purchaseEnergyAction(): Promise<PurchaseEnergyState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: 'error', message: 'Giriş tələb olunur' };
  }

  const result = await purchaseEnergy(user.id);
  if (!result.ok) {
    if (result.error === 'insufficient_coins') {
      return { status: 'insufficient_coins', message: 'Kifayət qədər coin yoxdur' };
    }
    if (result.error === 'energy_cap_reached') {
      return { status: 'energy_cap_reached', message: 'Maksimum enerjiyə çatmısan' };
    }
    if (result.error === 'unavailable') {
      return { status: 'unavailable', message: 'Bu funksiya hazırda əlçatan deyil' };
    }
    return { status: 'error', message: 'Xəta baş verdi. Bir az sonra yenidən cəhd edin' };
  }

  revalidatePath('/coin-qazan');
  return {
    status: 'success',
    message: 'Enerji alındı!',
    coinBalance: result.coinBalance,
    energy: result.energy,
  };
}

// ---------------------------------------------------------------------------
// Çarx — daily free prize wheel (0068_wheel_of_fortune.sql, lib/coins/wheel.ts)
// ---------------------------------------------------------------------------
export interface WheelSpinState {
  status: 'success' | 'already_spun' | 'unavailable' | 'error';
  message: string;
  // The winning segment index (so the client animates the wheel to it) and the
  // prize — both SERVER-decided; the action takes no input at all.
  prizeIndex?: number;
  prize?: number;
  balance?: number;
}

export async function spinWheelAction(): Promise<WheelSpinState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: 'error', message: 'Giriş tələb olunur' };
  }

  const result = await spinWheel(user.id);
  if (!result.ok) {
    if (result.error === 'already_spun') {
      return { status: 'already_spun', message: 'Bugünkü fırlatmanı istifadə etmisən. Sabah yenidən!' };
    }
    if (result.error === 'unavailable') {
      return { status: 'unavailable', message: 'Çarx hazırda əlçatan deyil' };
    }
    return { status: 'error', message: 'Xəta baş verdi. Bir az sonra yenidən cəhd edin' };
  }

  revalidatePath('/coin-qazan');
  return {
    status: 'success',
    message: `+${result.prize} coin! 🎉`,
    prizeIndex: result.prizeIndex,
    prize: result.prize,
    balance: result.balance,
  };
}

// ---------------------------------------------------------------------------
// Nişan Sürəti — sign speed quiz (0071_sign_speed_game.sql, lib/coins/signSpeed.ts)
// ---------------------------------------------------------------------------
// Server picks the 10-question set + correct answers at round-start and
// spends the round's 1 energy atomically with that pick (see the migration's
// top comment for why energy is spent at start, not at settle). The client
// only ever receives { sessionId, questions: [{ code, options }] } — never
// which option is correct — and submits its 10 answers once at the end.

export interface StartSignSpeedState {
  status: 'success' | 'no_energy' | 'pool_too_small' | 'unavailable' | 'error';
  message: string;
  sessionId?: string;
  questions?: SignSpeedQuestion[];
}

export async function startSignSpeedRoundAction(): Promise<StartSignSpeedState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: 'error', message: 'Giriş tələb olunur' };
  }

  const result = await startSignSpeedRound(user.id);
  if (!result.ok) {
    if (result.error === 'no_energy') {
      return { status: 'no_energy', message: 'Enerjin bitib. Sabah yenilənəcək' };
    }
    if (result.error === 'pool_too_small') {
      return { status: 'pool_too_small', message: 'Oyun hazırda əlçatan deyil' };
    }
    if (result.error === 'unavailable') {
      return { status: 'unavailable', message: 'Oyun hazırda əlçatan deyil' };
    }
    return { status: 'error', message: 'Xəta baş verdi. Bir az sonra yenidən cəhd edin' };
  }

  return {
    status: 'success',
    message: 'Uğurla başladı',
    sessionId: result.sessionId,
    questions: result.questions,
  };
}

export interface SubmitSignSpeedState {
  status:
    | 'success'
    | 'session_not_found'
    | 'already_used'
    | 'session_expired'
    | 'invalid_answers'
    | 'unavailable'
    | 'error';
  message: string;
  correctCount?: number;
  reward?: number;
  energy?: number;
  balance?: number;
}

export async function submitSignSpeedRoundAction(
  sessionId: string,
  answers: number[]
): Promise<SubmitSignSpeedState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: 'error', message: 'Giriş tələb olunur' };
  }

  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    return { status: 'invalid_answers', message: 'Yanlış sessiya' };
  }

  if (
    !Array.isArray(answers) ||
    answers.length !== 10 ||
    !answers.every((a) => Number.isInteger(a) && a >= 0 && a <= 3)
  ) {
    return { status: 'invalid_answers', message: 'Yanlış cavablar' };
  }

  const result = await submitSignSpeedRound(user.id, sessionId, answers);
  if (!result.ok) {
    if (result.error === 'session_not_found') {
      return { status: 'session_not_found', message: 'Sessiya tapılmadı' };
    }
    if (result.error === 'already_used') {
      return { status: 'already_used', message: 'Bu tur artıq təqdim edilib' };
    }
    if (result.error === 'session_expired') {
      return { status: 'session_expired', message: 'Vaxt bitib. Yenidən başlayın' };
    }
    if (result.error === 'invalid_answers') {
      return { status: 'invalid_answers', message: 'Yanlış cavablar' };
    }
    if (result.error === 'unavailable') {
      return { status: 'unavailable', message: 'Oyun hazırda əlçatan deyil' };
    }
    return { status: 'error', message: 'Xəta baş verdi. Bir az sonra yenidən cəhd edin' };
  }

  revalidatePath('/coin-qazan');
  return {
    status: 'success',
    message: `${result.correctCount}/10 doğru! +${result.reward} coin`,
    correctCount: result.correctCount,
    reward: result.reward,
    energy: result.energy,
    balance: result.balance,
  };
}

// ---------------------------------------------------------------------------
// Gündəlik Missiyalar + Günün Sandığı — daily quests + daily chest
// (0081_daily_quests.sql, lib/coins/dailyQuests.ts). No input: which quests
// are complete and the reward amount are both resolved entirely server-side.
// ---------------------------------------------------------------------------
export interface DailyChestClaimState {
  status: 'success' | 'already_claimed' | 'quests_incomplete' | 'unavailable' | 'error';
  message: string;
  reward?: number;
  balance?: number;
}

export async function claimDailyChestAction(): Promise<DailyChestClaimState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: 'error', message: 'Giriş tələb olunur' };
  }

  const result = await claimDailyChest(user.id);
  if (!result.ok) {
    if (result.error === 'already_claimed') {
      return { status: 'already_claimed', message: 'Bugünkü sandığı artıq açmısan' };
    }
    if (result.error === 'quests_incomplete') {
      return { status: 'quests_incomplete', message: 'Bütün missiyaları tamamlamalısan' };
    }
    if (result.error === 'unavailable') {
      return { status: 'unavailable', message: 'Sandıq hazırda əlçatan deyil' };
    }
    return { status: 'error', message: 'Xəta baş verdi. Bir az sonra yenidən cəhd edin' };
  }

  revalidatePath('/coin-qazan');
  return {
    status: 'success',
    message: `Sandıq açıldı! +${result.reward} coin`,
    reward: result.reward,
    balance: result.balance,
  };
}
