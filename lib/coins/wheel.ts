import 'server-only';
import { randomInt } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { isMissingRelationError } from '@/lib/supabase/missingRelation';
import { bakuTodayDate } from '@/lib/date/baku';
import { logError } from '@/lib/logging/logError';

// ÇARX — daily free prize wheel (0068_wheel_of_fortune.sql). One free spin per
// Baku day; the SERVER picks the winning segment with crypto RNG and credits its
// value. The client only triggers the spin and animates to the returned
// index — it never chooses the prize. Read path fails OPEN (display), spin path
// fails CLOSED (no credit on error).
//
// CURRENCY: prizes are ENERGY since 0094_two_currency_economy.sql. The
// wheel_prizes app_settings key and its segment values are unchanged.

const WHEEL_PRIZES_KEY = 'wheel_prizes';

export interface WheelPrize {
  value: number;
  weight: number;
}

// Each segment carries an energy value and an admin-configured weight (percentage
// odds, all ten weights sum to 100). The server draws a weighted-random segment
// with crypto RNG. Modest EV (~3 energy), on par with the daily quiz.
const DEFAULT_WHEEL_PRIZES: WheelPrize[] = [
  { value: 1, weight: 25 },
  { value: 1, weight: 20 },
  { value: 2, weight: 15 },
  { value: 2, weight: 12 },
  { value: 3, weight: 10 },
  { value: 3, weight: 8 },
  { value: 5, weight: 5 },
  { value: 5, weight: 3 },
  { value: 10, weight: 1.5 },
  { value: 20, weight: 0.5 },
];

export { WHEEL_PRIZES_KEY, DEFAULT_WHEEL_PRIZES };

// Reads + validates the configured prize segments, failing OPEN to the default.
// Accepts the legacy number[] shape (pre-weighting) and converts it to uniform
// weights for backward compatibility — no migration needed.
export async function getWheelPrizes(): Promise<WheelPrize[]> {
  try {
    const { data, error } = await createAdminClient()
      .from('app_settings')
      .select('value')
      .eq('key', WHEEL_PRIZES_KEY)
      .maybeSingle();

    if (error || !data || !Array.isArray(data.value) || data.value.length === 0) {
      return DEFAULT_WHEEL_PRIZES;
    }

    const raw = data.value as unknown[];
    const isLegacyNumberArray = raw.every((v) => typeof v === 'number' || typeof v === 'string');

    if (isLegacyNumberArray) {
      const values = raw
        .map((v) => (typeof v === 'number' ? v : Number(v)))
        .filter((v) => Number.isFinite(v) && v > 0);
      if (values.length === 0) return DEFAULT_WHEEL_PRIZES;
      const weight = 100 / values.length;
      return values.map((value) => ({ value, weight }));
    }

    const prizes = raw
      .map((v) => {
        if (typeof v !== 'object' || v === null) return null;
        const value = Number((v as Record<string, unknown>).value);
        const weight = Number((v as Record<string, unknown>).weight);
        if (!Number.isFinite(value) || value <= 0) return null;
        if (!Number.isFinite(weight) || weight <= 0) return null;
        return { value, weight };
      })
      .filter((v): v is WheelPrize => v !== null);

    return prizes.length > 0 ? prizes : DEFAULT_WHEEL_PRIZES;
  } catch {
    return DEFAULT_WHEEL_PRIZES;
  }
}

export type WheelAvailability = 'available' | 'spun' | 'unavailable';

export interface WheelStatus {
  prizes: WheelPrize[];
  status: WheelAvailability;
}

// For the games page: the segment values to render + whether today's free spin
// is still available. Missing table (migration not applied) → 'unavailable' so
// the UI disables the wheel instead of offering a spin that can't settle.
export async function getWheelStatus(userId: string): Promise<WheelStatus> {
  const prizes = await getWheelPrizes();

  try {
    const today = bakuTodayDate();
    const { data, error } = await createAdminClient()
      .from('wheel_spins')
      .select('id')
      .eq('user_id', userId)
      .eq('spin_date', today)
      .maybeSingle();

    if (error) {
      if (isMissingRelationError(error)) return { prizes, status: 'unavailable' };
      void logError('coins.wheel.status', error, { userId });
      console.error('[coins] getWheelStatus read failed:', error);
      return { prizes, status: 'unavailable' };
    }

    return { prizes, status: data ? 'spun' : 'available' };
  } catch {
    return { prizes, status: 'unavailable' };
  }
}

// Weighted-random index draw using crypto-secure RNG (never Math.random()).
// Weights are scaled to integers (2-decimal precision) so randomInt's integer
// range can represent fractional percentages like 12.5.
function pickWeightedIndex(prizes: WheelPrize[]): number {
  const scaled = prizes.map((p) => Math.round(p.weight * 100));
  const total = scaled.reduce((sum, w) => sum + w, 0);
  const r = randomInt(0, total);
  let cumulative = 0;
  for (let i = 0; i < scaled.length; i++) {
    cumulative += scaled[i];
    if (r < cumulative) return i;
  }
  return scaled.length - 1;
}

export type SpinResult =
  | {
      ok: true;
      prizeIndex: number;
      /** ENERGY won. */
      prize: number;
      /** Coin balance — unchanged by a spin, returned for the shared meter. */
      balance: number;
      /** New ENERGY balance. */
      energy: number;
    }
  | { ok: false; error: 'already_spun' | 'unavailable' | 'error' };

// Performs the spin: SERVER-side weighted RNG picks the segment, the RPC credits
// it (bounded by the max segment) and enforces one-per-day. Returns the winning
// index so the client can animate the wheel to it.
export async function spinWheel(userId: string): Promise<SpinResult> {
  const prizes = await getWheelPrizes();
  const prizeIndex = pickWeightedIndex(prizes);
  const prize = prizes[prizeIndex].value;
  const maxPrize = Math.max(...prizes.map((p) => p.value));

  const { data, error } = await createAdminClient().rpc('claim_wheel_spin', {
    p_user_id: userId,
    p_prize: prize,
    p_max_prize: maxPrize,
  });

  if (error) {
    const message = error.message ?? '';
    if (message.includes('already_spun')) return { ok: false, error: 'already_spun' };
    if (isMissingRelationError(error)) return { ok: false, error: 'unavailable' };
    void logError('coins.wheel.spin', error, { userId });
    console.error('[coins] claim_wheel_spin RPC failed:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return { ok: false, error: 'error' };
  }

  if (typeof data !== 'object' || data === null) return { ok: false, error: 'error' };
  const result = data as { balance?: number; energy?: number };

  return {
    ok: true,
    prizeIndex,
    prize,
    balance: Number(result.balance ?? 0),
    energy: Number(result.energy ?? 0),
  };
}
