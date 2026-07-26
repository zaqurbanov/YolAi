import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth/requireAdmin';

// Read side of error_logs (0073_error_logs.sql) for the admin logs dashboard.
//
// Reads with the SERVICE-ROLE client even though error_logs has an admin-only
// SELECT policy, because the emails shown next to each row are not always
// reachable under RLS: profiles.email is filled by the signup trigger but can
// be null for older/OAuth rows, and the fallback (auth.users) is only readable
// through the admin API. So authorization is asserted explicitly here via
// requireAdmin() instead of being delegated to RLS — a caller's own
// requireAdmin()/proxy.ts check is never taken as sufficient.
//
// Fail-soft on a missing table: migrations are applied by hand, so 0073 may not
// be live yet. That case returns `tableMissing: true` rather than throwing, and
// the dashboard renders a "run the migration" hint.

export interface ErrorLogEntry {
  id: string;
  context: string;
  message: string;
  details: Record<string, unknown> | null;
  userId: string | null;
  userEmail: string | null;
  requestId: string | null;
  createdAt: string;
}

export interface ErrorLogsResult {
  rows: ErrorLogEntry[];
  contexts: string[];
  tableMissing: boolean;
}

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
// Distinct contexts for the filter dropdown are derived from a wider slice than
// the displayed rows, so filtering to an older context is still possible after
// newer errors push it out of the first page.
const CONTEXT_SCAN_LIMIT = 2000;

// PostgREST reports an unknown relation as 42P01 (undefined_table); PGRST205 is
// the schema-cache variant of the same thing.
function isMissingTable(error: { code?: string | null; message?: string | null } | null): boolean {
  if (!error) return false;
  if (error.code === '42P01' || error.code === 'PGRST205') return true;
  return /error_logs/.test(error.message ?? '') && /does not exist|find the table/i.test(error.message ?? '');
}

const EMPTY: ErrorLogsResult = { rows: [], contexts: [], tableMissing: true };

export async function getErrorLogs(
  opts: { limit?: number; context?: string } = {}
): Promise<ErrorLogsResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { rows: [], contexts: [], tableMissing: false };

  const limit = Math.min(MAX_LIMIT, Math.max(1, opts.limit ?? DEFAULT_LIMIT));
  const admin = createAdminClient();

  let query = admin
    .from('error_logs')
    .select('id, context, message, details, user_id, request_id, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (opts.context) query = query.eq('context', opts.context);

  const [{ data, error }, { data: contextData, error: contextError }] = await Promise.all([
    query,
    admin
      .from('error_logs')
      .select('context')
      .order('created_at', { ascending: false })
      .limit(CONTEXT_SCAN_LIMIT),
  ]);

  if (error) {
    if (isMissingTable(error)) return EMPTY;
    return { rows: [], contexts: [], tableMissing: false };
  }

  const raw = (data ?? []) as Array<{
    id: string;
    context: string;
    message: string;
    details: Record<string, unknown> | null;
    user_id: string | null;
    request_id: string | null;
    created_at: string;
  }>;

  const contexts = contextError
    ? [...new Set(raw.map((r) => r.context))].sort()
    : [...new Set(((contextData ?? []) as Array<{ context: string }>).map((r) => r.context))].sort();

  const emails = await resolveEmails(raw.map((r) => r.user_id));

  return {
    rows: raw.map((r) => ({
      id: r.id,
      context: r.context,
      message: r.message,
      details: r.details,
      userId: r.user_id,
      userEmail: r.user_id ? emails.get(r.user_id) ?? null : null,
      requestId: r.request_id,
      createdAt: r.created_at,
    })),
    contexts,
    tableMissing: false,
  };
}

// One batched profiles read for the whole page, then a per-user admin-API
// lookup only for the ids profiles couldn't answer (email is nullable there).
async function resolveEmails(userIds: Array<string | null>): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter((id): id is string => !!id))];
  const out = new Map<string, string>();
  if (ids.length === 0) return out;

  const admin = createAdminClient();
  const { data } = await admin.from('profiles').select('id, email').in('id', ids);
  for (const row of (data ?? []) as Array<{ id: string; email: string | null }>) {
    if (row.email) out.set(row.id, row.email);
  }

  const unresolved = ids.filter((id) => !out.has(id));
  if (unresolved.length === 0) return out;

  await Promise.all(
    unresolved.map(async (id) => {
      try {
        const { data: authUser } = await admin.auth.admin.getUserById(id);
        if (authUser?.user?.email) out.set(id, authUser.user.email);
      } catch {
        // Best-effort: the row still renders with the uuid.
      }
    })
  );

  return out;
}
