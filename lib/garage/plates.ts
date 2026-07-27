import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { isMissingRelationError } from '@/lib/supabase/missingRelation';
import { logError } from '@/lib/logging/logError';
import { generateRandomPlateNumber, normalizePlateNumber } from '@/lib/garage/plateFormat';

// Virtual Qaraj Mərhələ 3 — VIP Nömrə Bazarı (VIP license plate market).
// INDEPENDENT of car_tiers/user_garage (Phase 1) and lib/garage/perks.ts
// (Phase 2) — a plate needs no car. See 0084_vip_plate_market.sql.

// The ONE new app_settings tunable for this phase — coins to buy ONE custom
// plate. House convention: no seed row, TS-side default, readNumericSetting.
export const VIP_PLATE_PRICE_KEY = 'vip_plate_price';
export const DEFAULT_VIP_PLATE_PRICE = 2000;

// Mirrors lib/garage/perks.ts's readNumericSetting exactly (min > 0 fallback
// posture, same as lib/coins/signSpeed.ts).
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

const MAX_FREE_PLATE_ATTEMPTS = 5;

export interface UserPlate {
  plateNumber: string;
  isCustom: boolean;
}

// Read-only display path — fails OPEN to null on any query error, same
// posture as getActiveGaragePerk/getWeeklyLeaderboard. null also means "no
// plate assigned yet" (the normal case before ensureFreePlate runs once).
export async function getUserPlate(userId: string): Promise<UserPlate | null> {
  try {
    const { data, error } = await createAdminClient()
      .from('license_plates')
      .select('plate_number, is_custom')
      .eq('owner_id', userId)
      .maybeSingle();

    if (error || !data) return null;

    return { plateNumber: data.plate_number, isCustom: data.is_custom };
  } catch {
    return null;
  }
}

// Lazily assigns a free plate the first time a user is seen. Idempotent: if
// the user already has a plate (free or custom), returns it unchanged.
// Retries with a freshly generated plate on collision, up to
// MAX_FREE_PLATE_ATTEMPTS — collisions should be essentially impossible given
// the plate space (100 * ~33^2 * 1000 ≈ 330M combinations), so exhausting
// retries throws rather than silently returning an empty string.
export async function ensureFreePlate(userId: string): Promise<string> {
  const existing = await getUserPlate(userId);
  if (existing) return existing.plateNumber;

  for (let attempt = 0; attempt < MAX_FREE_PLATE_ATTEMPTS; attempt++) {
    const candidate = generateRandomPlateNumber();

    const { data, error } = await createAdminClient().rpc('claim_free_plate', {
      p_user_id: userId,
      p_plate_number: candidate,
    });

    if (!error) {
      const result = data as { plateNumber?: string } | null;
      if (result && typeof result.plateNumber === 'string') {
        return result.plateNumber;
      }
      break;
    }

    const message = error.message ?? '';
    if (message.includes('plate_taken')) continue;

    void logError('garage.plates.ensureFree', error, { userId });
    throw new Error('Pulsuz nömrə təyin etmək uğursuz oldu');
  }

  throw new Error('Pulsuz nömrə təyin etmək uğursuz oldu: cəhdlər tükəndi');
}

// Read-only display path for the price shown on PlateMarketCard before a
// purchase attempt — mirrors purchaseCustomPlate's own price lookup so the
// UI and the server charge exactly the same number (this never accepts a
// client-supplied price).
export async function getVipPlatePrice(): Promise<number> {
  return readNumericSetting(VIP_PLATE_PRICE_KEY, DEFAULT_VIP_PLATE_PRICE);
}

export type PurchaseCustomPlateError =
  | 'invalid_format'
  | 'plate_taken'
  | 'already_have_custom_plate'
  | 'insufficient_coins'
  | 'unavailable'
  | 'error';

export type PurchaseResult =
  | { ok: true; balance: number; plateNumber: string }
  | { ok: false; error: PurchaseCustomPlateError };

// Mirrors lib/coins/leaderboard.ts's getCarEmojisByUserId exactly — same
// admin-client query style, same isMissingRelationError fail-open behavior,
// same "pre-migration state expected" comment convention. Consumed by
// getWeeklyLeaderboard to attach a plate number/isCustom flag per entry,
// same second-query-after-the-RPC pattern as carEmoji.
export async function getPlatesByUserId(
  userIds: string[]
): Promise<Map<string, { plateNumber: string; isCustom: boolean }>> {
  const plateByUserId = new Map<string, { plateNumber: string; isCustom: boolean }>();
  if (userIds.length === 0) return plateByUserId;

  const { data, error } = await createAdminClient()
    .from('license_plates')
    .select('owner_id, plate_number, is_custom')
    .in('owner_id', userIds);

  if (error) {
    // Pre-migration state (0084 not yet applied) is expected and not worth
    // logging on every load, same treatment as the RPC's own missing-relation case.
    if (isMissingRelationError(error)) return plateByUserId;
    void logError('garage.plates.byUserId', error, { details: { userIds } });
    console.error('[garage/plates] license_plates query failed:', error);
    return plateByUserId;
  }

  for (const row of (data ?? []) as { owner_id: string; plate_number: string; is_custom: boolean }[]) {
    plateByUserId.set(row.owner_id, { plateNumber: row.plate_number, isCustom: row.is_custom });
  }

  return plateByUserId;
}

// Coin-debit path (not a coin grant) — fails CLOSED on any error, mirrors
// purchaseCarTier's / submitSignSpeedRound's error-mapping style exactly.
export async function purchaseCustomPlate(userId: string, plateNumber: string): Promise<PurchaseResult> {
  const normalized = normalizePlateNumber(plateNumber);
  if (!normalized) {
    return { ok: false, error: 'invalid_format' };
  }

  const price = await readNumericSetting(VIP_PLATE_PRICE_KEY, DEFAULT_VIP_PLATE_PRICE);

  const { data, error } = await createAdminClient().rpc('purchase_custom_plate', {
    p_user_id: userId,
    p_plate_number: normalized,
    p_price: price,
  });

  if (error) {
    const message = error.message ?? '';
    if (message.includes('plate_taken')) return { ok: false, error: 'plate_taken' };
    if (message.includes('already_have_custom_plate')) return { ok: false, error: 'already_have_custom_plate' };
    if (message.includes('insufficient_coins')) return { ok: false, error: 'insufficient_coins' };
    if (isMissingRelationError(error)) return { ok: false, error: 'unavailable' };
    void logError('garage.plates.purchase', error, { userId });
    console.error('[garage] purchase_custom_plate RPC failed:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return { ok: false, error: 'error' };
  }

  if (typeof data !== 'object' || data === null) return { ok: false, error: 'error' };
  const result = data as { balance?: number; plateNumber?: string };
  if (typeof result.plateNumber !== 'string') return { ok: false, error: 'error' };

  return {
    ok: true,
    balance: Number(result.balance ?? 0),
    plateNumber: result.plateNumber,
  };
}
