import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { isMissingRelationError } from '@/lib/supabase/missingRelation';
import { logError } from '@/lib/logging/logError';

// WEEKLY LEADERBOARD (həftəlik reytinq) read layer — retention feature #3.
//
// READ-ONLY DISPLAY PATH. This reads the weekly_leaderboard RPC (0065) and
// awards nothing; there is no coin-granting path here. The RPC ranks activity
// that already-hardened RPCs recorded (correct daily/lesson quiz answers this
// ISO week) — see 0065_weekly_leaderboard.sql for the exact metric.
//
// SERVICE-ROLE CLIENT ON PURPOSE: the RPC is SECURITY DEFINER and granted to
// service_role ONLY (revoked from authenticated), because ranking has to read
// every user's profile/answer rows across RLS. It exposes only
// {rank, user_id, display_name, points} — no email, no other profile column —
// so this admin-client call cannot leak more than the leaderboard is meant to
// show. Do NOT switch this to the user-scoped client: the grant would reject it.
//
// FAIL OPEN, mirroring lib/quiz/lessons.ts. 0065 is HAND-APPLIED by the owner
// (no migration runner — see CLAUDE.md), so between this code deploying and
// that SQL running the function DOES NOT EXIST. A missing-relation error (or
// any other error) must render an EMPTY BOARD, not crash the page — so every
// failure path returns { top: [], me: null }. This never throws.

export interface LeaderboardEntry {
  rank: number;
  name: string;
  points: number;
  isMe: boolean;
}

export interface WeeklyLeaderboard {
  top: LeaderboardEntry[];
  me: { rank: number; points: number } | null;
}

interface LeaderboardRow {
  rank: number;
  user_id: string;
  display_name: string;
  points: number;
  is_caller: boolean;
}

export async function getWeeklyLeaderboard(userId: string): Promise<WeeklyLeaderboard> {
  const empty: WeeklyLeaderboard = { top: [], me: null };

  const { data, error } = await createAdminClient().rpc('weekly_leaderboard', {
    p_user_id: userId,
  });

  if (error) {
    // Pre-migration state is expected and not worth logging on every load.
    if (isMissingRelationError(error)) return empty;
    void logError('coins.leaderboard.weekly', error, { userId });
    console.error('[coins/leaderboard] weekly_leaderboard rpc failed:', error);
    return empty;
  }

  const rows = (data ?? []) as LeaderboardRow[];

  // The RPC returns the top 10 plus, when the caller ranks outside it, one
  // extra row for the caller (rank > 10). `points` arrives as a JS number
  // (bigint under today's row counts is well within safe-integer range).
  const top: LeaderboardEntry[] = rows
    .filter((r) => r.rank <= 10)
    .map((r) => ({
      rank: r.rank,
      name: r.display_name,
      points: Number(r.points),
      isMe: r.user_id === userId,
    }));

  // The caller's own row is flagged is_caller by the RPC. Present iff the
  // caller has any points this week (top-10 or the appended outside-top row);
  // absent => they have zero points this week => nothing to rank => me = null.
  const meRow = rows.find((r) => r.is_caller);
  const me = meRow ? { rank: meRow.rank, points: Number(meRow.points) } : null;

  return { top, me };
}
