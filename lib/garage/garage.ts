import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { isMissingRelationError } from '@/lib/supabase/missingRelation';
import { logError } from '@/lib/logging/logError';

// Virtual Qaraj (0083_virtual_garage.sql), Phase 1 — car ownership + display
// only. See lib/garage/carTiers.ts for the catalog read.

export interface UserGarageEntry {
  tierId: string;
  tierName: string;
  tierEmoji: string;
  tierOrder: number;
}

const PIYADA_FALLBACK: UserGarageEntry = {
  tierId: '',
  tierName: 'Piyada',
  tierEmoji: '🚶',
  tierOrder: 0,
};

// Read-only display path — never throws. A user with no user_garage row
// (never purchased anything) fails OPEN to the tier_order = 0 (Piyada) tier
// rather than rendering as carless. Also falls back to the hardcoded
// PIYADA_FALLBACK constant if car_tiers itself is unreadable (missing
// relation during the manual-migration window), so the UI never breaks.
export async function getUserGarage(userId: string): Promise<UserGarageEntry> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('user_garage')
    .select('tier_id, car_tiers(name, emoji, tier_order)')
    .eq('user_id', userId)
    .maybeSingle();

  if (error && !isMissingRelationError(error)) {
    console.error('[garage] getUserGarage failed:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
  }

  if (data) {
    const tier = Array.isArray(data.car_tiers) ? data.car_tiers[0] : data.car_tiers;
    if (tier) {
      return {
        tierId: data.tier_id,
        tierName: tier.name,
        tierEmoji: tier.emoji,
        tierOrder: tier.tier_order,
      };
    }
  }

  const { data: piyada, error: piyadaError } = await admin
    .from('car_tiers')
    .select('id, name, emoji, tier_order')
    .eq('tier_order', 0)
    .maybeSingle();

  if (piyadaError || !piyada) return PIYADA_FALLBACK;

  return {
    tierId: piyada.id,
    tierName: piyada.name,
    tierEmoji: piyada.emoji,
    tierOrder: piyada.tier_order,
  };
}

export type PurchaseCarTierError = 'insufficient_coins' | 'tier_not_found' | 'unavailable' | 'error';

export type PurchaseCarTierResult =
  | { ok: true; balance: number; tierId: string; tierName: string }
  | { ok: false; error: PurchaseCarTierError };

// Coin-debit path (not a coin grant) — fails CLOSED on any error, mirrors
// submitSignSpeedRound's error-mapping style exactly (lib/coins/signSpeed.ts).
export async function purchaseCarTier(userId: string, tierId: string): Promise<PurchaseCarTierResult> {
  const { data, error } = await createAdminClient().rpc('purchase_car_tier', {
    p_user_id: userId,
    p_tier_id: tierId,
  });

  if (error) {
    const message = error.message ?? '';
    if (message.includes('insufficient_coins')) return { ok: false, error: 'insufficient_coins' };
    if (message.includes('tier_not_found')) return { ok: false, error: 'tier_not_found' };
    if (isMissingRelationError(error)) return { ok: false, error: 'unavailable' };
    void logError('garage.purchaseCarTier', error, { userId });
    console.error('[garage] purchase_car_tier RPC failed:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return { ok: false, error: 'error' };
  }

  if (typeof data !== 'object' || data === null) return { ok: false, error: 'error' };
  const result = data as { balance?: number; tierId?: string; tierName?: string };
  if (typeof result.tierId !== 'string' || typeof result.tierName !== 'string') {
    return { ok: false, error: 'error' };
  }

  return {
    ok: true,
    balance: Number(result.balance ?? 0),
    tierId: result.tierId,
    tierName: result.tierName,
  };
}
