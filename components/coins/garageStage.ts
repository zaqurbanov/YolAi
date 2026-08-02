import type { ActiveGaragePerk } from '@/lib/garage/perks';

// Shared between GarageCard (the full showroom on /coin-qazan/qaraj) and
// GaragePreviewCard (the compact carousel on /coin-qazan). Extracted so the
// tier spine palette and the perk-line wording can never drift between the
// two — a perk rewrite must land in both cards at once.

// Spine colour per tier position. Uses the traffic-accent tokens the app
// already defines, so the ladder reads as a progression and each card is
// distinguishable at a glance. Cycles if more tiers are ever added.
// One light per tier position, used both as the stage wash (--stage-tone) and
// as the card's accent. Progresses cool -> warm so the ladder is legible at a
// glance rather than every tier looking alike.
export const STAGE_TONES = [
  'color-mix(in oklab, var(--outline) 22%, transparent)',
  'color-mix(in oklab, var(--regulatory-blue) 22%, transparent)',
  'color-mix(in oklab, var(--go-green) 22%, transparent)',
  'color-mix(in oklab, var(--safety-yellow) 26%, transparent)',
  'color-mix(in oklab, var(--caution-orange) 26%, transparent)',
  'color-mix(in oklab, var(--accent) 24%, transparent)',
];

export function perkLine(perk: ActiveGaragePerk): string | null {
  // The XO win reward became ENERGY in 0094, so this percentage bonus applies
  // to energy now — not coins.
  if (perk.xoBonusPct > 0) return `🎁 Aktiv perk: XO-da +${perk.xoBonusPct}% enerji`;
  if (perk.energyBonus > 0) return `🎁 Aktiv perk: +${perk.energyBonus} gündəlik enerji`;
  if (perk.chatDailyBonus > 0) return `🎁 Aktiv perk: +${perk.chatDailyBonus} gündəlik pulsuz sual`;
  return null;
}
