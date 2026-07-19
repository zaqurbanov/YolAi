import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

// Phase 2 of the coin roadmap (docs/coin-roadmap.md): a "top spenders"
// leaderboard. Uses the service-role client for the same reason
// lib/content/getRegisteredDriverCount.ts does — RLS (0009) only lets
// admins read other users' profiles/user_coins rows, but a coarse,
// non-PII cross-user read is needed here and that's an accepted precedent,
// not a new exception.
//
// Return contract consumed by the frontend leaderboard UI:
//   { rank: number, label: string, score: number }[]
// - rank: 1-based position, computed from the exact (unrounded)
//   total_spent ordering — always accurate even though `score` is rounded.
// - label: the user's full display name (profiles.full_name) when set,
//   otherwise a title-cased version of the email local-part (e.g.
//   "john.doe" -> "John Doe") when no display name was ever set. Never the
//   full email (no @domain).
// - score: total_spent ROUNDED to the nearest 5 (not the raw figure).
//   Rationale: total_spent is otherwise a fairly precise proxy for how much
//   a specific person has used the app / how many coins they've bought or
//   earned — showing the exact number lets other users infer usage
//   patterns (e.g. "this person asks ~47 questions/day") with more
//   precision than a leaderboard needs. Rounding to the nearest 5 keeps the
//   number meaningful/comparable while blurring the exact figure. Rank
//   order is still computed from the unrounded value, so ties/ordering are
//   never distorted by the rounding.
export interface LeaderboardEntry {
  rank: number;
  label: string;
  score: number;
}

function roundToNearest(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function labelFor(fullName: string | null, email: string | null): string {
  const name = fullName?.trim();
  if (name) return name;

  const local = email?.trim()?.split('@')[0];
  if (local) {
    return local
      .split(/[._-]+/)
      .filter(Boolean)
      .map((part) => part[0]?.toUpperCase() + part.slice(1))
      .join(' ');
  }

  return '';
}

interface UserCoinsRow {
  user_id: string;
  total_spent: number;
}

interface ProfileRow {
  id: string;
  full_name: string | null;
  email: string | null;
}

export async function getTopSpenders(limit = 10): Promise<LeaderboardEntry[]> {
  const admin = createAdminClient();

  // Over-fetch a bit past `limit` since some rows will be dropped by the
  // "no display name at all" defensive filter below, and we want to still
  // be able to fill out the requested count where possible.
  const { data: coinsRows, error: coinsError } = await admin
    .from('user_coins')
    .select('user_id, total_spent')
    .gt('total_spent', 0)
    .order('total_spent', { ascending: false })
    .limit(limit * 3)
    .returns<UserCoinsRow[]>();

  if (coinsError || !coinsRows || coinsRows.length === 0) {
    if (coinsError) console.error('[leaderboard] getTopSpenders read failed:', coinsError);
    return [];
  }

  const userIds = coinsRows.map((row) => row.user_id);

  const { data: profiles, error: profilesError } = await admin
    .from('profiles')
    .select('id, full_name, email')
    .in('id', userIds)
    .returns<ProfileRow[]>();

  if (profilesError) {
    console.error('[leaderboard] getTopSpenders profile read failed:', profilesError);
    return [];
  }

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  const entries: LeaderboardEntry[] = [];
  let rank = 0;

  for (const row of coinsRows) {
    const profile = profileById.get(row.user_id);
    const label = labelFor(profile?.full_name ?? null, profile?.email ?? null);
    if (!label) continue;

    rank += 1;
    entries.push({
      rank,
      label,
      score: roundToNearest(row.total_spent, 5),
    });

    if (entries.length >= limit) break;
  }

  return entries;
}
