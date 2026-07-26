'use server';

// Client-side error reporting → error_logs (0073_error_logs.sql).
//
// WHY a server action and not a route handler: the Vercel Hobby function budget
// is already exceeded (see CLAUDE.md "Deployment"), and server actions cost no
// additional function. Lives in app/actions/ rather than a route-specific
// actions.ts because every client surface (chat, games, account) reports here.
//
// This is an OPEN WRITE PATH — a server action is a plain POST endpoint any
// authenticated user can call directly with arbitrary arguments. So: auth is
// required (anonymous callers write nothing), context/message/details are
// truncated server-side, and there is a per-user rate limit. Per CLAUDE.md's
// "assume accounts are free" posture the limit fails CLOSED (if the counting
// query fails we refuse to write), while the write itself fails SILENTLY —
// reporting an error must never surface a second error to the user.

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logError } from '@/lib/logging/logError';

const MAX_CONTEXT = 120;
const MAX_MESSAGE = 2000;
const MAX_DETAIL_KEYS = 24;
const MAX_DETAIL_STRING = 1000;
const MAX_DETAILS_JSON = 8000;

// A few reports per minute is plenty for genuine bursts (one failed request can
// legitimately fire an onError plus a status report); past that it is either a
// loop or abuse.
const RATE_LIMIT_PER_MINUTE = 12;

export interface ReportClientErrorInput {
  context: string;
  message: string;
  details?: Record<string, unknown>;
}

function clampString(value: unknown, max: number): string {
  const s = typeof value === 'string' ? value : String(value ?? '');
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

// Shrink an untrusted details object to something safe to store: bounded key
// count, bounded string length, primitives kept as-is, anything else stringified.
function sanitizeDetails(details: unknown): Record<string, unknown> | null {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return null;

  const out: Record<string, unknown> = {};
  let dropped = 0;
  for (const [key, value] of Object.entries(details as Record<string, unknown>)) {
    if (Object.keys(out).length >= MAX_DETAIL_KEYS) {
      dropped += 1;
      continue;
    }
    const safeKey = clampString(key, 64);
    if (value === null || typeof value === 'number' || typeof value === 'boolean') {
      out[safeKey] = value;
    } else if (typeof value === 'string') {
      out[safeKey] = clampString(value, MAX_DETAIL_STRING);
    } else if (typeof value === 'undefined') {
      continue;
    } else {
      try {
        out[safeKey] = clampString(JSON.stringify(value), MAX_DETAIL_STRING);
      } catch {
        out[safeKey] = clampString(String(value), MAX_DETAIL_STRING);
      }
    }
  }
  if (dropped > 0) out.__droppedKeys = dropped;

  // Final byte-size backstop in case many keys each sit just under the cap.
  try {
    const json = JSON.stringify(out);
    if (json.length > MAX_DETAILS_JSON) {
      return { truncated: true, preview: json.slice(0, MAX_DETAILS_JSON) };
    }
  } catch {
    return { truncated: true };
  }

  return out;
}

export async function reportClientError(
  input: ReportClientErrorInput
): Promise<{ ok: boolean }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false };

    const context = clampString(input?.context, MAX_CONTEXT).trim() || 'unknown';
    const message = clampString(input?.message, MAX_MESSAGE).trim() || 'Client error';
    const details = sanitizeDetails(input?.details);

    const admin = createAdminClient();
    const since = new Date(Date.now() - 60_000).toISOString();
    const { count, error: countError } = await admin
      .from('error_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .like('context', 'client.%')
      .gte('created_at', since);

    // Fail closed: no verified headroom, no write. Also covers "table missing"
    // (pre-0073), where the write would be a no-op anyway.
    if (countError) return { ok: false };
    if ((count ?? 0) >= RATE_LIMIT_PER_MINUTE) return { ok: false };

    // Lifted out of `details` into its own column so a client report can be
    // cross-referenced with chat_request_logs.request_id like server rows are.
    const requestId =
      details && typeof details.requestId === 'string' ? clampString(details.requestId, 100) : null;

    // `client.` prefix so server- vs client-origin is obvious in the dashboard.
    const prefixed = context.startsWith('client.') ? context : `client.${context}`;
    await logError(prefixed, message, {
      userId: user.id,
      requestId,
      details: details ?? undefined,
    });

    return { ok: true };
  } catch {
    // Never let error reporting raise its own error at the caller.
    return { ok: false };
  }
}
