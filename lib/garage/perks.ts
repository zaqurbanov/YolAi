import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { getUserGarage } from '@/lib/garage/garage';

// Virtual Qaraj Phase 2 (Mərhələ 2) — per-tier perks. NOT cumulative: only the
// currently-owned tier's perk is active (see lib/garage/carTiers.ts for the
// tier_order catalog). Config keys, TS-side defaults, house convention (no
// seed rows, app_settings, readNumericSetting(key, fallback) pattern) — same
// as lib/coins/games.ts/lib/coins/signSpeed.ts/lib/exam/examSession.ts.

const GARAGE_XO_BONUS_PCT_KEY = 'garage_xo_bonus_pct';
const DEFAULT_GARAGE_XO_BONUS_PCT = 10;

const GARAGE_ENERGY_BONUS_KEY = 'garage_energy_bonus';
const DEFAULT_GARAGE_ENERGY_BONUS = 5;

const GARAGE_CHAT_BONUS_KEY = 'garage_chat_daily_bonus';
const DEFAULT_GARAGE_CHAT_BONUS = 5;

export {
  GARAGE_XO_BONUS_PCT_KEY,
  DEFAULT_GARAGE_XO_BONUS_PCT,
  GARAGE_ENERGY_BONUS_KEY,
  DEFAULT_GARAGE_ENERGY_BONUS,
  GARAGE_CHAT_BONUS_KEY,
  DEFAULT_GARAGE_CHAT_BONUS,
};

const LADA_TIER_ORDER = 1;
const PRIUS_TIER_ORDER = 2;
const GCLASS_TIER_ORDER = 4;

// Unlike the readNumericSetting copies in lib/coins/games.ts et al., this
// allows 0 as a valid configured value (not just as a fallback trigger) —
// GARAGE_PERK_FIELDS deliberately permits min: 0 so an admin can disable a
// perk without deleting its app_settings row.
async function readNumericSetting(key: string, fallback: number): Promise<number> {
  const { data, error } = await createAdminClient()
    .from('app_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();

  if (error || !data) return fallback;

  const value = typeof data.value === 'number' ? data.value : Number(data.value);
  if (!Number.isFinite(value) || value < 0) return fallback;
  return value;
}

export interface ActiveGaragePerk {
  tierOrder: number;
  xoBonusPct: number;
  energyBonus: number;
  chatDailyBonus: number;
  /** Virtual Qaraj Mərhələ 4 — true when the owned car is CƏRİMƏLİ. The UI
   *  still gets tierOrder so it knows WHICH car is fined; the three bonus
   *  fields below are always forced to 0 in this state (see below). */
  isFined: boolean;
}

const NO_PERK: ActiveGaragePerk = {
  tierOrder: 0,
  xoBonusPct: 0,
  energyBonus: 0,
  chatDailyBonus: 0,
  isFined: false,
};

// Perks are NOT cumulative — only the currently-owned tier's perk is active.
// Fails OPEN to NO_PERK on any error: this must never block or alter a
// reward/energy/limit call site just because the perk lookup hiccupped.
//
// Virtual Qaraj Mərhələ 4: while the owned car is CƏRİMƏLİ
// (garage.isFined), the perk is computed normally below and then forced to
// zero right before returning — this is SERVER-SIDE TRUTH suppression, and
// every consumer of this function (getEffectiveEnergyGrant, lib/chat/coins.ts,
// lib/coins/games.ts) goes through here, so a fine silently disables the perk
// everywhere without touching any of those call sites.
export async function getActiveGaragePerk(userId: string): Promise<ActiveGaragePerk> {
  try {
    const garage = await getUserGarage(userId);

    const [xoBonusPct, energyBonus, chatDailyBonus] = await Promise.all([
      readNumericSetting(GARAGE_XO_BONUS_PCT_KEY, DEFAULT_GARAGE_XO_BONUS_PCT),
      readNumericSetting(GARAGE_ENERGY_BONUS_KEY, DEFAULT_GARAGE_ENERGY_BONUS),
      readNumericSetting(GARAGE_CHAT_BONUS_KEY, DEFAULT_GARAGE_CHAT_BONUS),
    ]);

    let perk: ActiveGaragePerk;
    if (garage.tierOrder === LADA_TIER_ORDER) {
      perk = { tierOrder: garage.tierOrder, xoBonusPct, energyBonus: 0, chatDailyBonus: 0, isFined: garage.isFined };
    } else if (garage.tierOrder === PRIUS_TIER_ORDER) {
      perk = { tierOrder: garage.tierOrder, xoBonusPct: 0, energyBonus, chatDailyBonus: 0, isFined: garage.isFined };
    } else if (garage.tierOrder === GCLASS_TIER_ORDER) {
      perk = { tierOrder: garage.tierOrder, xoBonusPct: 0, energyBonus: 0, chatDailyBonus, isFined: garage.isFined };
    } else {
      // BMW (tierOrder=3, status tier only) and Piyada (0) — no perk this phase.
      perk = { ...NO_PERK, tierOrder: garage.tierOrder, isFined: garage.isFined };
    }

    if (garage.isFined) {
      return { ...perk, xoBonusPct: 0, energyBonus: 0, chatDailyBonus: 0, isFined: true };
    }
    return perk;
  } catch {
    return NO_PERK;
  }
}

// The ONLY place that computes the final daily energy grant amount — used at
// all three call sites that share the single user_energy pool (XO, sign
// speed, exam), so the Prius perk can never apply inconsistently depending on
// which game the user opens first each day.
export async function getEffectiveEnergyGrant(userId: string, baseGrant: number): Promise<number> {
  const perk = await getActiveGaragePerk(userId);
  return baseGrant + perk.energyBonus;
}
