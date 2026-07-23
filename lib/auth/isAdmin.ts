import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { isMissingRelationError } from '@/lib/supabase/missingRelation';

// Role predicate for an ALREADY-AUTHENTICATED user id, used by the lessons
// access layer (lib/coins/lessonUnlock.ts, lib/quiz/lessons.ts) where the
// caller holds a userId rather than a request session.
//
// lib/auth/requireAdmin.ts is the session-based equivalent for route handlers
// and server components; it checks the same rule (profiles.role === 'admin').
// This is the ONE definition of "is admin by id" — do not re-derive it inline.
//
// Uses the service-role client so it is independent of the caller's RLS
// context (the same pattern as canAccessCourse/hasUnlockedCourse). Reads only
// the single `role` column of the caller's own profile — leaks nothing.
//
// FAILS CLOSED: any error, a missing profile, or the pre-migration state
// returns false. On the authorization path (canAccessCourse) that denies
// access; on the display paths (getCourses/getCourseTopics) it renders the
// normal locked UI, which is the safe direction — never a leak.
export async function isUserAdmin(userId: string): Promise<boolean> {
  if (typeof userId !== 'string' || userId.trim() === '') return false;

  const { data, error } = await createAdminClient()
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle<{ role: string | null }>();

  if (error) {
    if (!isMissingRelationError(error)) {
      console.error('[auth/isAdmin] role read failed:', error);
    }
    return false;
  }

  return data?.role === 'admin';
}
