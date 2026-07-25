import 'server-only';
import { randomInt } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { isMissingRelationError } from '@/lib/supabase/missingRelation';

// ÇARX — daily free prize wheel (0068_wheel_of_fortune.sql). One free spin per
// UTC day; the SERVER picks the winning segment with crypto RNG and credits its
// coin value. The client only triggers the spin and animates to the returned
// index — it never chooses the prize. Read path fails OPEN (display), spin path
// fails CLOSED (no credit on error).

const WHEEL_PRIZES_KEY = 'wheel_prizes';
// One value per wheel segment. The server picks a segment UNIFORMLY at random,
// so a value's odds are (how many segments carry it) / (total segments) —
// weighting is expressed by repeating values. Modest EV (~3 coins), on par with
// the daily quiz.
const DEFAULT_WHEEL_PRIZES: number[] = [1, 2, 3, 5, 2, 1, 3, 10];

export { WHEEL_PRIZES_KEY, DEFAULT_WHEEL_PRIZES };

// Reads + validates the configured prize segments, failing OPEN to the default.
// Keeps only positive finite numbers; if nothing valid remains, uses the default.
export async function getWheelPrizes(): Promise<number[]> {
  try {
    const { data, error } = await createAdminClient()
      .from('app_settings')
      .select('value')
      .eq('key', WHEEL_PRIZES_KEY)
      .maybeSingle();

    if (error || !data || !Array.isArray(data.value)) return DEFAULT_WHEEL_PRIZES;

    const prizes = (data.value as unknown[])
      .map((v) => (typeof v === 'number' ? v : Number(v)))
      .filter((v) => Number.isFinite(v) && v >= 0);

    return prizes.length > 0 ? prizes : DEFAULT_WHEEL_PRIZES;
  } catch {
    return DEFAULT_WHEEL_PRIZES;
  }
}

export type WheelAvailability = 'available' | 'spun' | 'unavailable';

export interface WheelStatus {
  prizes: number[];
  status: WheelAvailability;
}

// For the games page: the segment values to render + whether today's free spin
// is still available. Missing table (migration not applied) → 'unavailable' so
// the UI disables the wheel instead of offering a spin that can't settle.
export async function getWheelStatus(userId: string): Promise<WheelStatus> {
  const prizes = await getWheelPrizes();

  try {
    const todayUtc = new Date().toISOString().slice(0, 10);
    const { data, error } = await createAdminClient()
      .from('wheel_spins')
      .select('id')
      .eq('user_id', userId)
      .eq('spin_date', todayUtc)
      .maybeSingle();

    if (error) {
      if (isMissingRelationError(error)) return { prizes, status: 'unavailable' };
      console.error('[coins] getWheelStatus read failed:', error);
      return { prizes, status: 'unavailable' };
    }

    return { prizes, status: data ? 'spun' : 'available' };
  } catch {
    return { prizes, status: 'unavailable' };
  }
}

export type SpinResult =
  | { ok: true; prizeIndex: number; prize: number; balance: number }
  | { ok: false; error: 'already_spun' | 'unavailable' | 'error' };

// Performs the spin: SERVER-side weighted RNG picks the segment, the RPC credits
// it (bounded by the max segment) and enforces one-per-day. Returns the winning
// index so the client can animate the wheel to it.
export async function spinWheel(userId: string): Promise<SpinResult> {
  const prizes = await getWheelPrizes();
  const prizeIndex = randomInt(0, prizes.length);
  const prize = prizes[prizeIndex];
  const maxPrize = Math.max(...prizes);

  const { data, error } = await createAdminClient().rpc('claim_wheel_spin', {
    p_user_id: userId,
    p_prize: prize,
    p_max_prize: maxPrize,
  });

  if (error) {
    const message = error.message ?? '';
    if (message.includes('already_spun')) return { ok: false, error: 'already_spun' };
    if (isMissingRelationError(error)) return { ok: false, error: 'unavailable' };
    console.error('[coins] claim_wheel_spin RPC failed:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return { ok: false, error: 'error' };
  }

  if (typeof data !== 'number') return { ok: false, error: 'error' };
  return { ok: true, prizeIndex, prize, balance: data };
}
