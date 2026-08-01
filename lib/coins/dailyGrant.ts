import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { isMissingRelationError } from '@/lib/supabase/missingRelation';
import { bakuTodayDate } from '@/lib/date/baku';
import { GAME_DAILY_ENERGY_KEY, DEFAULT_GAME_DAILY_ENERGY } from '@/lib/coins/games';
import { getEffectiveEnergyGrant, getActiveGaragePerk } from '@/lib/garage/perks';
import { getGlobalDailyCoinGrant } from '@/lib/chat/coins';
import { logError } from '@/lib/logging/logError';

// "Gündəlik hədiyyə" — the AUTOMATIC daily grant (0094_two_currency_economy.sql).
//
// It is a FLOOR, not an increment, for BOTH currencies: once per Baku day the
// balance is raised to the admin-configured amount if it is below it, and left
// alone (never reduced) if it is at or above it. There is no claim button and
// no user-initiated action — applyDailyGrant() runs on the first server-side
// read of the user's balances each day.
//
// The once-per-day guarantee is the unique(user_id, grant_date) index inside
// apply_daily_grant, NOT this file and NOT `balance < floor`: spending the
// balance back down the same day does not re-trigger the top-up.
//
// This is a COIN-granting path, so it is fail-CLOSED (on any error we simply
// do not grant) and every amount is resolved here, server-side, from
// app_settings — the RPC never sees a client-supplied number.
//
// NOTE the import of getGlobalDailyCoinGrant from lib/chat/coins.ts, which in
// turn imports applyDailyGrant from here. Only hoisted function declarations
// cross that boundary in either direction, never module-level constants, so
// the cycle is inert at load time.

// The coin floor, composed exactly as lib/chat/coins.ts composes it for the
// affordability check — same number in both places, or a user could be topped
// up to one figure and told their limit is another.
async function resolveCoinFloor(userId: string): Promise<number> {
  const [base, perk] = await Promise.all([
    getGlobalDailyCoinGrant(),
    getActiveGaragePerk(userId),
  ]);
  return base + perk.chatDailyBonus;
}

// The daily energy floor, including the Prius garage perk — resolved through
// getEffectiveEnergyGrant so it stays identical to the value every other call
// site (games, sign speed, exam) passes to grant_daily_energy.
async function resolveEnergyFloor(userId: string): Promise<number> {
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

export interface DailyGrantResult {
  /** Coins ACTUALLY added by this call (0 when already at/above the floor). */
  coinsGranted: number;
  /** Energy ACTUALLY added by this call (0 when already at/above the floor). */
  energyGranted: number;
  /** Coin balance after the top-up. */
  balance: number;
  /** Energy balance after the top-up. */
  energy: number;
}

// Applies today's top-up. Idempotent and cheap on the repeat path (one failed
// insert plus two reads), safe to call from any read path, and NEVER throws —
// callers treat a null as "nothing was granted" and carry on with whatever
// balance is actually in the table.
export async function applyDailyGrant(userId: string): Promise<DailyGrantResult | null> {
  try {
    const [coinFloor, energyFloor] = await Promise.all([
      resolveCoinFloor(userId),
      resolveEnergyFloor(userId),
    ]);

    const { data, error } = await createAdminClient().rpc('apply_daily_grant', {
      p_user_id: userId,
      p_coin_floor: coinFloor,
      p_energy_floor: energyFloor,
    });

    if (error) {
      if (!isMissingRelationError(error)) {
        void logError('coins.dailyGrant.apply', error, { userId });
        console.error('[coins] apply_daily_grant RPC failed:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        });
      }
      return null;
    }

    if (typeof data !== 'object' || data === null) return null;
    const result = data as Partial<Record<keyof DailyGrantResult, number>>;

    return {
      coinsGranted: Number(result.coinsGranted ?? 0),
      energyGranted: Number(result.energyGranted ?? 0),
      balance: Number(result.balance ?? 0),
      energy: Number(result.energy ?? 0),
    };
  } catch {
    return null;
  }
}

export interface DailyGrantStatus {
  /** The COIN floor the balance is raised to each Baku day. */
  coins: number;
  /** The ENERGY floor the balance is raised to each Baku day. */
  energy: number;
  /** True once today's automatic top-up has run. */
  applied: boolean;
}

// Read-only, informational — nothing here grants. Fails OPEN on the floors
// (TS defaults) and reports `applied: true` when the ledger can't be read, so
// the card never advertises a top-up that has in fact already happened.
export async function getDailyGrantStatus(userId: string): Promise<DailyGrantStatus> {
  const [coins, energy] = await Promise.all([
    resolveCoinFloor(userId),
    resolveEnergyFloor(userId),
  ]);

  try {
    const { data, error } = await createAdminClient()
      .from('daily_grant_claims')
      .select('id')
      .eq('user_id', userId)
      .eq('grant_date', bakuTodayDate())
      .maybeSingle();

    if (error) {
      if (!isMissingRelationError(error)) {
        void logError('coins.dailyGrant.status', error, { userId });
        console.error('[coins] getDailyGrantStatus read failed:', error);
      }
      return { coins, energy, applied: true };
    }

    return { coins, energy, applied: Boolean(data) };
  } catch {
    return { coins, energy, applied: true };
  }
}
