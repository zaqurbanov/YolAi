import type { PostgrestError } from '@supabase/supabase-js';

// Migrations in this repo are applied BY HAND in the Supabase SQL editor —
// there is no migration runner (see CLAUDE.md). So there is always a window,
// potentially a long one, where deployed code references a table that does not
// exist yet. For the lessons feature that window is the whole of Phase 1: the
// courses tables land in 0060_lesson_courses.sql, which the owner runs when
// they choose.
//
// The previous iteration of this feature is exactly why this exists: /oyrenme
// returned a 500 for every user because getLessons() queried
// user_unlocked_categories from a migration that was never applied. A read
// layer for a not-yet-migrated table must render an EMPTY STATE, not crash the
// page.
//
// Two distinct error shapes mean "this relation does not exist", and both have
// to be matched because which one surfaces depends on PostgREST's schema cache:
//   * PGRST205 — PostgREST knows its schema cache has no such table and
//     rejects the request before it ever reaches Postgres. This is the usual
//     one, and its message reads "Could not find the table 'public.x' in the
//     schema cache".
//   * 42P01 — Postgres' own undefined_table SQLSTATE, surfaced when the
//     request does reach the database (e.g. a stale-but-populated schema cache,
//     or a table referenced from inside a function body).
// PGRST202 is the function-level equivalent ("Could not find the function"),
// needed for the RPC paths.
//
// Deliberately does NOT match on the table name: a caller already knows which
// query it just ran, and matching names would mean parsing an error string
// that PostgREST is free to reword.
const MISSING_RELATION_CODES = new Set(['42P01', 'PGRST205', 'PGRST202']);

export function isMissingRelationError(error: PostgrestError | null | undefined): boolean {
  if (!error) return false;
  if (MISSING_RELATION_CODES.has(error.code)) return true;

  // Fallback for client versions that surface a schema-cache miss without a
  // usable `code`. Narrow enough not to swallow unrelated failures: a real
  // permission or constraint error never mentions the schema cache.
  const message = `${error.message ?? ''} ${error.details ?? ''}`.toLowerCase();
  return message.includes('schema cache') || message.includes('does not exist');
}
