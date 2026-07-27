import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { isMissingRelationError } from '@/lib/supabase/missingRelation';

// Virtual Qaraj (0083_virtual_garage.sql), Phase 1 — car ownership + display
// only. car_tiers is a small fixed catalog (5 rows), publicly readable via RLS
// (car_tiers_select_all), so this could use the user-scoped client — the
// admin client is used anyway for consistency with lib/garage/garage.ts,
// which needs it for user_garage.

export interface CarTier {
  id: string;
  tierOrder: number;
  name: string;
  emoji: string;
  coinPrice: number;
}

// Read-only display path — fails OPEN to [] on any error (missing relation
// during the manual-migration window, or otherwise), per CLAUDE.md's
// fail-open/fail-closed split. Never throws.
export async function getCarTiers(): Promise<CarTier[]> {
  const { data, error } = await createAdminClient()
    .from('car_tiers')
    .select('id, tier_order, name, emoji, coin_price')
    .order('tier_order', { ascending: true });

  if (error) {
    if (!isMissingRelationError(error)) {
      console.error('[garage] getCarTiers failed:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
    }
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    tierOrder: row.tier_order,
    name: row.name,
    emoji: row.emoji,
    coinPrice: Number(row.coin_price),
  }));
}
