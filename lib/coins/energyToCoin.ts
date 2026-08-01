import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { isMissingRelationError } from '@/lib/supabase/missingRelation';
import { logError } from '@/lib/logging/logError';
import { getEnergyStatus } from '@/lib/coins/games';
import { bakuDayStartUtcIso } from '@/lib/date/baku';

// Energy -> COIN conversion (0096_energy_to_coin.sql) — the ONE owner-sanctioned
// exception to the 0094 invariant. Rate, unit and daily cap are resolved
// server-side from app_settings (fail-open TS defaults) and passed to
// convert_energy_to_coins, which is the sole authority on whether the exchange
// is allowed and is the only place the daily cap is enforced (a row-locked sum
// under the user_energy lock). The conversion path FAILS CLOSED; the status
// read FAILS OPEN so the coin-qazan UI renders even before the user runs 0096.

export const ENERGY_TO_COIN_ENERGY_UNIT_KEY = 'energy_to_coin_energy_unit';
export const DEFAULT_ENERGY_TO_COIN_ENERGY_UNIT = 100;

export const ENERGY_TO_COIN_COIN_RATE_KEY = 'energy_to_coin_coin_rate';
export const DEFAULT_ENERGY_TO_COIN_COIN_RATE = 1.5;

export const ENERGY_TO_COIN_DAILY_CAP_KEY = 'energy_to_coin_daily_cap';
export const DEFAULT_ENERGY_TO_COIN_DAILY_CAP = 100;

// Replicated from lib/coins/games.ts lines 81-98 (NOT exported there). Fail-open:
// any read error or non-finite/<=0 value returns the TS fallback.
async function readNumericSetting(key: string, fallback: number): Promise<number> {
  const { data, error } = await createAdminClient()
    .from('app_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();

  if (error || !data) return fallback;

  const value = typeof data.value === 'number' ? data.value : Number(data.value);
  if (!Number.isFinite(value)) return fallback;
  if (value <= 0) return fallback;
  return value;
}

export interface EnergyToCoinConfig {
  energyUnit: number;
  coinRate: number;
  dailyCap: number;
}

// Read-only, admin-configured conversion parameters for display. Fails OPEN to
// the TS defaults like getEnergyStatus — the authoritative gate is
// convert_energy_to_coins itself.
export async function getEnergyToCoinConfig(): Promise<EnergyToCoinConfig> {
  const [energyUnit, coinRate, dailyCap] = await Promise.all([
    readNumericSetting(ENERGY_TO_COIN_ENERGY_UNIT_KEY, DEFAULT_ENERGY_TO_COIN_ENERGY_UNIT),
    readNumericSetting(ENERGY_TO_COIN_COIN_RATE_KEY, DEFAULT_ENERGY_TO_COIN_COIN_RATE),
    readNumericSetting(ENERGY_TO_COIN_DAILY_CAP_KEY, DEFAULT_ENERGY_TO_COIN_DAILY_CAP),
  ]);
  return { energyUnit, coinRate, dailyCap };
}

export interface EnergyToCoinStatus {
  ok: boolean;
  available: boolean;
  config: EnergyToCoinConfig;
  todayConvertedEnergy: number;
  remainingToday: number;
  energyBalance: number;
  maxEnergy: number;
}

// FAIL-OPEN display read: never throws, never crashes the page. available is
// true only when the energy_to_coin_conversions read actually succeeded — until
// the owner runs 0096, every caller sees { ok: false, available: false }.
export async function getEnergyToCoinStatus(userId: string): Promise<EnergyToCoinStatus> {
  const config = await getEnergyToCoinConfig();

  // getEnergyStatus itself fails open to a full meter ({balance: max, max}),
  // so this only throws on a coding error; guard it anyway so the page can
  // never crash from this read.
  let energyBalance = 0;
  let maxEnergy = 0;
  try {
    const energy = await getEnergyStatus(userId);
    energyBalance = energy.balance;
    maxEnergy = energy.max;
  } catch {
    energyBalance = 0;
    maxEnergy = 0;
  }

  try {
    const { data, error } = await createAdminClient()
      .from('energy_to_coin_conversions')
      .select('energy_amount')
      .eq('user_id', userId)
      .gte('converted_at', bakuDayStartUtcIso());

    if (error) {
      return {
        ok: false,
        available: false,
        config,
        todayConvertedEnergy: 0,
        remainingToday: 0,
        energyBalance,
        maxEnergy,
      };
    }

    const todayConvertedEnergy = (data ?? []).reduce(
      (acc, row) => acc + Number(row.energy_amount),
      0
    );
    return {
      ok: true,
      available: true,
      config,
      todayConvertedEnergy,
      remainingToday: Math.max(0, config.dailyCap - todayConvertedEnergy),
      energyBalance,
      maxEnergy,
    };
  } catch {
    return {
      ok: false,
      available: false,
      config,
      todayConvertedEnergy: 0,
      remainingToday: 0,
      energyBalance,
      maxEnergy,
    };
  }
}

export type EnergyToCoinError = 'insufficient_energy' | 'daily_cap_reached' | 'invalid_amount' | 'unavailable' | 'error';

export type EnergyToCoinResult =
  | { ok: true; coinBalance: number; energy: number; coinsCredited: number }
  | { ok: false; error: EnergyToCoinError };

// FAIL-CLOSED. The client may only supply an energy amount; unit/rate/cap are
// resolved server-side from app_settings and passed to convert_energy_to_coins,
// which is the sole authority on whether the exchange is allowed.
export async function convertEnergyToCoins(userId: string, amount: number): Promise<EnergyToCoinResult> {
  const config = await getEnergyToCoinConfig();

  if (!Number.isInteger(amount) || amount <= 0) {
    return { ok: false, error: 'invalid_amount' };
  }

  const { data, error } = await createAdminClient().rpc('convert_energy_to_coins', {
    p_user_id: userId,
    p_energy_amount: amount,
    p_unit: config.energyUnit,
    p_rate: config.coinRate,
    p_daily_cap: config.dailyCap,
  });

  if (error) {
    const message = error.message ?? '';
    if (message.includes('insufficient_energy')) return { ok: false, error: 'insufficient_energy' };
    if (message.includes('daily_cap_reached')) return { ok: false, error: 'daily_cap_reached' };
    if (message.includes('invalid_amount')) return { ok: false, error: 'invalid_amount' };
    if (isMissingRelationError(error)) return { ok: false, error: 'unavailable' };
    void logError('coins.energyToCoin.convert', error, { userId });
    console.error('[coins] convert_energy_to_coins RPC failed:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return { ok: false, error: 'error' };
  }

  if (typeof data !== 'object' || data === null) return { ok: false, error: 'error' };
  const result = data as { balance?: number; energy?: number; coins_credited?: number };

  return {
    ok: true,
    coinBalance: Number(result.balance ?? 0),
    energy: Number(result.energy ?? 0),
    coinsCredited: Number(result.coins_credited ?? 0),
  };
}
