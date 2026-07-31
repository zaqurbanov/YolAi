import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { isMissingRelationError } from '@/lib/supabase/missingRelation';
import { bakuTodayDate } from '@/lib/date/baku';
import { GAME_DAILY_ENERGY_KEY, DEFAULT_GAME_DAILY_ENERGY } from '@/lib/coins/games';
import { getEffectiveEnergyGrant } from '@/lib/garage/perks';
import { logError } from '@/lib/logging/logError';

// "Günlük hədiyyə" — the daily grant (0094_two_currency_economy.sql): a few
// COINS plus the day's ENERGY top-up, claimable once per Baku day.
//
// This is a COIN-granting path, so it is fail-CLOSED throughout and every
// amount is resolved here, server-side, from app_settings — claimDailyGrant()
// takes no amount, no eligibility flag and no date from the caller. The
// once-per-day guarantee is the unique(user_id, grant_date) index inside
// claim_daily_grant, not this file: a repeated or concurrent claim loses the
// insert race and gets 'already_claimed' before any coins move.
//
// The ENERGY half is delegated to grant_daily_energy inside the RPC (the same
// lazy once-per-Baku-day top-up the energy meter already triggers), so opening
// the games page before claiming cannot yield the energy twice. The returned
// energyGranted is the ACTUAL delta, which is 0 in exactly that case.

const DAILY_GRANT_COINS_KEY = 'daily_grant_coins';
const DEFAULT_DAILY_GRANT_COINS = 3;

export { DAILY_GRANT_COINS_KEY, DEFAULT_DAILY_GRANT_COINS };

// Mirrors getAdWatchRewardAmount/getQuizRewardAmount byte-for-byte.
export async function getDailyGrantCoins(): Promise<number> {
  const { data, error } = await createAdminClient()
    .from('app_settings')
    .select('value')
    .eq('key', DAILY_GRANT_COINS_KEY)
    .maybeSingle();

  if (error || !data) return DEFAULT_DAILY_GRANT_COINS;

  const value = typeof data.value === 'number' ? data.value : Number(data.value);
  if (!Number.isFinite(value) || value < 0) return DEFAULT_DAILY_GRANT_COINS;
  return value;
}

export interface DailyGrantStatus {
  /** Coins this claim would pay. */
  coins: number;
  /** Energy the daily top-up would add, if it hasn't already fired today. */
  energy: number;
  claimed: boolean;
}

// Read-only status for the claim card. FAILS OPEN on the amounts (TS defaults)
// but fails CLOSED on `claimed`: if we can't tell whether today's grant was
// already taken, report it as taken so the UI never invites a claim that will
// be rejected. The real gate is the RPC either way.
export async function getDailyGrantStatus(userId: string): Promise<DailyGrantStatus> {
  const [coins, baseEnergy] = await Promise.all([
    getDailyGrantCoins(),
    readDailyEnergyGrant(userId),
  ]);

  try {
    const { data, error } = await createAdminClient()
      .from('daily_grant_claims')
      .select('id')
      .eq('user_id', userId)
      .eq('grant_date', bakuTodayDate())
      .maybeSingle();

    if (error) {
      if (isMissingRelationError(error)) return { coins, energy: baseEnergy, claimed: true };
      void logError('coins.dailyGrant.status', error, { userId });
      console.error('[coins] getDailyGrantStatus read failed:', error);
      return { coins, energy: baseEnergy, claimed: true };
    }

    return { coins, energy: baseEnergy, claimed: Boolean(data) };
  } catch {
    return { coins, energy: baseEnergy, claimed: true };
  }
}

// The daily energy top-up amount, including the Prius garage perk bonus —
// resolved through getEffectiveEnergyGrant so it stays identical to the value
// every other call site (games, sign speed, exam) passes to grant_daily_energy.
async function readDailyEnergyGrant(userId: string): Promise<number> {
  const { data, error } = await createAdminClient()
    .from('app_settings')
    .select('value')
    .eq('key', GAME_DAILY_ENERGY_KEY)
    .maybeSingle();

  let base = DEFAULT_GAME_DAILY_ENERGY;
  if (!error && data) {
    const value = typeof data.value === 'number' ? data.value : Number(data.value);
    if (Number.isFinite(value) && value > 0) base = value;
  }

  return Math.round(await getEffectiveEnergyGrant(userId, base));
}

export type DailyGrantClaimError = 'already_claimed' | 'unavailable' | 'error';

export type DailyGrantClaimResult =
  | {
      ok: true;
      /** Coins credited by this claim. */
      coins: number;
      /** Energy actually added (0 if today's top-up had already fired). */
      energyGranted: number;
      /** New coin balance. */
      balance: number;
      /** New energy balance. */
      energy: number;
    }
  | { ok: false; error: DailyGrantClaimError };

export async function claimDailyGrant(userId: string): Promise<DailyGrantClaimResult> {
  const [coins, energyGrant] = await Promise.all([
    getDailyGrantCoins(),
    readDailyEnergyGrant(userId),
  ]);

  const { data, error } = await createAdminClient().rpc('claim_daily_grant', {
    p_user_id: userId,
    p_coins: coins,
    p_daily_energy_grant: energyGrant,
  });

  if (error) {
    const message = error.message ?? '';
    if (message.includes('already_claimed')) return { ok: false, error: 'already_claimed' };
    if (isMissingRelationError(error)) return { ok: false, error: 'unavailable' };
    void logError('coins.dailyGrant.claim', error, { userId });
    console.error('[coins] claim_daily_grant RPC failed:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return { ok: false, error: 'error' };
  }

  if (typeof data !== 'object' || data === null) return { ok: false, error: 'error' };
  const result = data as {
    coins?: number;
    energyGranted?: number;
    balance?: number;
    energy?: number;
  };

  return {
    ok: true,
    coins: Number(result.coins ?? coins),
    energyGranted: Number(result.energyGranted ?? 0),
    balance: Number(result.balance ?? 0),
    energy: Number(result.energy ?? 0),
  };
}
