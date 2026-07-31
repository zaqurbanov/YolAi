'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { claimAdWatchReward, issueAdViewToken } from '@/lib/coins/adWatch';
import { playTicTacToe, purchaseEnergy } from '@/lib/coins/games';
import { spinWheel } from '@/lib/coins/wheel';
import { startSignSpeedRound, submitSignSpeedRound, type SignSpeedQuestion } from '@/lib/coins/signSpeed';
import { claimDailyChest } from '@/lib/coins/dailyQuests';
import { claimDailyGrant } from '@/lib/coins/dailyGrant';
import { startExamSession, submitExamSession } from '@/lib/exam/examSession';
import { generateExamShareLink } from '@/lib/exam/examShare';
import type { ExamQuestion } from '@/lib/exam/examPool';
import { purchaseCarTier } from '@/lib/garage/garage';
import { purchaseCustomPlate } from '@/lib/garage/plates';
import {
  getFineStatus,
  drawRedemptionExam,
  submitRedemptionExam,
  type RedemptionQuestion,
  type RedemptionAnswerInput,
} from '@/lib/garage/fines';

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

// Win credits an ENERGY reward, draw/loss nothing — no wager, so a loss costs
// only the 1 energy the play already spent.
function outcomeMessage(outcome: 'win' | 'draw' | 'loss', reward: number): string {
  if (outcome === 'win') return reward > 0 ? `Qazandın! +${reward} enerji 🎉` : 'Qazandın! 🎉';
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
  /** ENERGY won (since 0094). */
  prize?: number;
  balance?: number;
  /** New ENERGY balance. */
  energy?: number;
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
    message: `+${result.prize} enerji! 🎉`,
    prizeIndex: result.prizeIndex,
    prize: result.prize,
    balance: result.balance,
    energy: result.energy,
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
  correctFlags?: boolean[];
  correctIndices?: number[];
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
    message: `${result.correctCount}/10 doğru! +${result.reward} enerji`,
    correctCount: result.correctCount,
    correctFlags: result.correctFlags,
    correctIndices: result.correctIndices,
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
  /** ENERGY paid by the chest (since 0094). */
  reward?: number;
  balance?: number;
  /** New ENERGY balance. */
  energy?: number;
}

// ---------------------------------------------------------------------------
// Sınaq İmtahanı — real exam simulator (0082_exam_simulator.sql,
// lib/exam/examSession.ts). A 15-minute, 10-question, all-topics-mixed timed
// mock exam. Entry costs ENERGY only (the coin path was removed in 0094) —
// pure SINK, no reward on completion (unlike the mini-games above). Result can
// be shared via a link.
// ---------------------------------------------------------------------------

export interface StartExamState {
  status: 'success' | 'no_energy' | 'pool_too_small' | 'unavailable' | 'error';
  message: string;
  sessionId?: string;
  questions?: ExamQuestion[];
  balance?: number;
  energy?: number;
}

// Takes NO payment method since 0094: the exam is energy-funded, full stop.
export async function startExamSessionAction(): Promise<StartExamState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: 'error', message: 'Giriş tələb olunur' };
  }

  const result = await startExamSession(user.id);
  if (!result.ok) {
    if (result.error === 'no_energy') {
      return { status: 'no_energy', message: 'Enerjin bitib. Sabah yenilənəcək' };
    }
    if (result.error === 'pool_too_small') {
      return { status: 'pool_too_small', message: 'İmtahan hazırda əlçatan deyil' };
    }
    if (result.error === 'unavailable') {
      return { status: 'unavailable', message: 'İmtahan hazırda əlçatan deyil' };
    }
    return { status: 'error', message: 'Xəta baş verdi. Bir az sonra yenidən cəhd edin' };
  }

  // Both exam entry points share this action, so both are revalidated.
  revalidatePath('/coin-qazan');
  revalidatePath('/imtahan');
  return {
    status: 'success',
    message: 'İmtahan başladı',
    sessionId: result.sessionId,
    questions: result.questions,
    balance: result.balance,
    energy: result.energy,
  };
}

export interface SubmitExamState {
  status:
    | 'success'
    | 'session_not_found'
    | 'already_used'
    | 'session_expired'
    | 'invalid_answers'
    | 'unavailable'
    | 'error';
  message: string;
  score?: number;
  total?: number;
}

export async function submitExamSessionAction(
  sessionId: string,
  answers: number[]
): Promise<SubmitExamState> {
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

  const result = await submitExamSession(user.id, sessionId, answers);
  if (!result.ok) {
    if (result.error === 'session_not_found') {
      return { status: 'session_not_found', message: 'Sessiya tapılmadı' };
    }
    if (result.error === 'already_used') {
      return { status: 'already_used', message: 'Bu imtahan artıq təqdim edilib' };
    }
    if (result.error === 'session_expired') {
      return { status: 'session_expired', message: 'Vaxt bitib. Yenidən başlayın' };
    }
    if (result.error === 'invalid_answers') {
      return { status: 'invalid_answers', message: 'Yanlış cavablar' };
    }
    if (result.error === 'unavailable') {
      return { status: 'unavailable', message: 'İmtahan hazırda əlçatan deyil' };
    }
    return { status: 'error', message: 'Xəta baş verdi. Bir az sonra yenidən cəhd edin' };
  }

  revalidatePath('/coin-qazan');
  return {
    status: 'success',
    message: `${result.score}/${result.total} doğru`,
    score: result.score,
    total: result.total,
  };
}

export interface GenerateExamShareLinkState {
  status: 'success' | 'error';
  message?: string;
  url?: string;
}

export async function generateExamShareLinkAction(sessionId: string): Promise<GenerateExamShareLinkState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: 'error', message: 'Giriş tələb olunur' };
  }

  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    return { status: 'error', message: 'Yanlış sessiya' };
  }

  const token = await generateExamShareLink(user.id, sessionId);
  if (!token) {
    return { status: 'error', message: 'Paylaşım linki yaradıla bilmədi' };
  }

  return { status: 'success', url: `/share/${token}` };
}

// ---------------------------------------------------------------------------
// Virtual Qaraj — car ownership + display, Phase 1 ONLY (0083_virtual_garage.sql,
// lib/garage/garage.ts). Pure coin SINK: the RPC reads the real price from
// car_tiers server-side, this action never accepts a client-supplied price.
// No perks/plates/fines/tuning/inspection here — that's later phases.
// ---------------------------------------------------------------------------
export interface PurchaseCarTierState {
  status: 'success' | 'insufficient_coins' | 'tier_not_found' | 'unavailable' | 'error';
  message: string;
  balance?: number;
  tierId?: string;
  tierName?: string;
}

export async function purchaseCarTierAction(tierId: string): Promise<PurchaseCarTierState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: 'error', message: 'Giriş tələb olunur' };
  }

  if (typeof tierId !== 'string' || tierId.length === 0) {
    return { status: 'error', message: 'Yanlış avtomobil' };
  }

  const result = await purchaseCarTier(user.id, tierId);
  if (!result.ok) {
    if (result.error === 'insufficient_coins') {
      return { status: 'insufficient_coins', message: 'Kifayət qədər coin yoxdur' };
    }
    if (result.error === 'tier_not_found') {
      return { status: 'tier_not_found', message: 'Avtomobil tapılmadı' };
    }
    if (result.error === 'unavailable') {
      return { status: 'unavailable', message: 'Qaraj hazırda əlçatan deyil' };
    }
    return { status: 'error', message: 'Xəta baş verdi. Bir az sonra yenidən cəhd edin' };
  }

  revalidatePath('/coin-qazan');
  return {
    status: 'success',
    message: `${result.tierName} alındı!`,
    balance: result.balance,
    tierId: result.tierId,
    tierName: result.tierName,
  };
}

// ---------------------------------------------------------------------------
// VIP Nömrə Bazarı — VIP license plate market, Virtual Qaraj Mərhələ 3
// (0084_vip_plate_market.sql, lib/garage/plates.ts). INDEPENDENT of Phase 1/2
// — a plate needs no car. Pure coin SINK: the real price is resolved
// server-side in purchaseCustomPlate, this action never accepts a
// client-supplied price. No action for ensureFreePlate — called directly from
// the /coin-qazan server component.
// ---------------------------------------------------------------------------
export interface PurchaseCustomPlateState {
  status:
    | 'success'
    | 'invalid_format'
    | 'plate_taken'
    | 'already_have_custom_plate'
    | 'insufficient_coins'
    | 'unavailable'
    | 'error';
  message: string;
  balance?: number;
  plateNumber?: string;
}

export async function purchaseCustomPlateAction(plateNumber: string): Promise<PurchaseCustomPlateState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: 'error', message: 'Giriş tələb olunur' };
  }

  if (typeof plateNumber !== 'string' || plateNumber.trim().length === 0) {
    return { status: 'invalid_format', message: 'Yanlış nömrə formatı' };
  }

  const result = await purchaseCustomPlate(user.id, plateNumber);
  if (!result.ok) {
    if (result.error === 'invalid_format') {
      return { status: 'invalid_format', message: 'Yanlış nömrə formatı (məs. 10-AA-001)' };
    }
    if (result.error === 'plate_taken') {
      return { status: 'plate_taken', message: 'Bu nömrə artıq alınıb' };
    }
    if (result.error === 'already_have_custom_plate') {
      return { status: 'already_have_custom_plate', message: 'Artıq VIP nömrən var' };
    }
    if (result.error === 'insufficient_coins') {
      return { status: 'insufficient_coins', message: 'Kifayət qədər coin yoxdur' };
    }
    if (result.error === 'unavailable') {
      return { status: 'unavailable', message: 'Nömrə bazarı hazırda əlçatan deyil' };
    }
    return { status: 'error', message: 'Xəta baş verdi. Bir az sonra yenidən cəhd edin' };
  }

  revalidatePath('/coin-qazan');
  return {
    status: 'success',
    message: `${result.plateNumber} alındı!`,
    balance: result.balance,
    plateNumber: result.plateNumber,
  };
}

// ---------------------------------------------------------------------------
// Cərimə İmtahanı — redemption exam, Virtual Qaraj Mərhələ 4
// (0089_car_fines.sql, lib/garage/fines.ts). Clears a CƏRİMƏLİ car's fine on
// a passing score. Pure status symbol: no coin grant/cost anywhere in this
// feature. The daily draw rate limit is enforced inside drawRedemptionExam
// via try_record_redemption_attempt, not here.
// ---------------------------------------------------------------------------
export interface StartRedemptionExamState {
  status: 'success' | 'unauthenticated' | 'not_fined' | 'rate_limited' | 'no_questions' | 'error';
  message: string;
  token?: string;
  questions?: RedemptionQuestion[];
}

export async function startRedemptionExamAction(): Promise<StartRedemptionExamState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: 'unauthenticated', message: 'Giriş tələb olunur' };
  }

  const fineStatus = await getFineStatus(user.id);
  if (!fineStatus.isFined) {
    return { status: 'not_fined', message: 'Maşınınız cərimələnməyib' };
  }

  const draw = await drawRedemptionExam(user.id);
  if (!draw.ok) {
    if (draw.error === 'rate_limited') {
      return { status: 'rate_limited', message: 'Bugünkü cəhd limitinə çatmısınız. Sabah yenidən cəhd edin' };
    }
    if (draw.error === 'no_questions') {
      return { status: 'no_questions', message: 'Bərpa imtahanı hazırda əlçatan deyil' };
    }
    return { status: 'error', message: 'Xəta baş verdi. Bir az sonra yenidən cəhd edin' };
  }

  return {
    status: 'success',
    message: 'Bərpa imtahanı hazırdır',
    token: draw.token,
    questions: draw.questions,
  };
}

export interface SubmitRedemptionExamInput {
  token: string;
  answers: RedemptionAnswerInput[];
}

export interface SubmitRedemptionExamState {
  status:
    | 'success'
    | 'unauthenticated'
    | 'invalid_token'
    | 'expired_token'
    | 'invalid_answers'
    | 'error';
  message: string;
  score?: number;
  total?: number;
  cleared?: boolean;
}

export async function submitRedemptionExamAction(
  input: SubmitRedemptionExamInput
): Promise<SubmitRedemptionExamState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: 'unauthenticated', message: 'Giriş tələb olunur' };
  }

  const token = input?.token;
  const answers = Array.isArray(input?.answers) ? input.answers : [];

  const wellFormed =
    typeof token === 'string' &&
    token.length > 0 &&
    answers.length === 3 &&
    answers.every(
      (a) =>
        a &&
        typeof a.questionId === 'string' &&
        a.questionId.trim() !== '' &&
        Number.isInteger(a.selectedIndex) &&
        a.selectedIndex >= -1 &&
        a.selectedIndex <= 3
    ) &&
    new Set(answers.map((a) => a.questionId)).size === answers.length;

  if (!wellFormed) {
    return { status: 'invalid_answers', message: 'Cavablar düzgün göndərilmədi' };
  }

  const result = await submitRedemptionExam(user.id, token, answers);
  if (!result.ok) {
    if (result.error === 'invalid_token') {
      return { status: 'invalid_token', message: 'İmtahan doğrulanmadı. Yenidən başlayın' };
    }
    if (result.error === 'expired_token') {
      return { status: 'expired_token', message: 'İmtahanın vaxtı bitdi. Yenidən başlayın' };
    }
    if (result.error === 'invalid_answers') {
      return { status: 'invalid_answers', message: 'Cavablar düzgün göndərilmədi' };
    }
    return { status: 'error', message: 'Xəta baş verdi. Bir az sonra yenidən cəhd edin' };
  }

  if (result.cleared) {
    revalidatePath('/coin-qazan');
  }

  return {
    status: 'success',
    message: result.cleared
      ? 'Təbriklər, cərimə silindi!'
      : `${result.score}/${result.total} doğru. Bu dəfə alınmadı`,
    score: result.score,
    total: result.total,
    cleared: result.cleared,
  };
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
    message: `Sandıq açıldı! +${result.reward} enerji`,
    reward: result.reward,
    balance: result.balance,
    energy: result.energy,
  };
}

// ---------------------------------------------------------------------------
// Günlük hədiyyə — the daily grant (0094_two_currency_economy.sql,
// lib/coins/dailyGrant.ts). A COIN-granting path: takes no input at all, the
// amounts come from app_settings server-side, and the once-per-Baku-day
// guarantee is a unique-index violation inside claim_daily_grant, so repeated
// or concurrent POSTs cannot pay twice.
// ---------------------------------------------------------------------------
export interface DailyGrantClaimState {
  status: 'success' | 'already_claimed' | 'unavailable' | 'error';
  message: string;
  /** Coins credited. */
  coins?: number;
  /** Energy actually added (0 if today's top-up had already fired). */
  energyGranted?: number;
  /** New coin balance. */
  balance?: number;
  /** New energy balance. */
  energy?: number;
}

export async function claimDailyGrantAction(): Promise<DailyGrantClaimState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: 'error', message: 'Giriş tələb olunur' };
  }

  const result = await claimDailyGrant(user.id);
  if (!result.ok) {
    if (result.error === 'already_claimed') {
      return { status: 'already_claimed', message: 'Bugünkü hədiyyəni artıq almısan' };
    }
    if (result.error === 'unavailable') {
      return { status: 'unavailable', message: 'Bu funksiya hazırda əlçatan deyil' };
    }
    return { status: 'error', message: 'Xəta baş verdi. Bir az sonra yenidən cəhd edin' };
  }

  revalidatePath('/coin-qazan');
  revalidatePath('/account');

  const parts = [`+${result.coins} coin`];
  if (result.energyGranted > 0) parts.push(`+${result.energyGranted} enerji`);

  return {
    status: 'success',
    message: `Günlük hədiyyə alındı! ${parts.join(', ')}`,
    coins: result.coins,
    energyGranted: result.energyGranted,
    balance: result.balance,
    energy: result.energy,
  };
}
