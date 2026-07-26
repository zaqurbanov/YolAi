import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

// Fail-SAFE server error logger → error_logs (0073_error_logs.sql). Persists a
// caught error so it can be investigated from the admin logs dashboard instead
// of only existing as a console line on an unwatched dev server.
//
// CONTRACT: this NEVER throws. Logging an error must not turn a handled failure
// into an unhandled one, and the table may not exist yet (migrations are applied
// by hand) — either way this swallows its own problems and returns. Call it
// alongside the existing `console.error(...)`, not instead of it (the console
// line is still useful in local dev).

interface LogErrorMeta {
  userId?: string | null;
  requestId?: string | null;
  // Any structured extras worth keeping (stack, code, http status, the
  // offending image's mediaType/size, etc.). Kept small.
  details?: Record<string, unknown>;
}

// Coerce an unknown thrown value into a message + structured details.
function describe(error: unknown): { message: string; details: Record<string, unknown> } {
  if (error instanceof Error) {
    return {
      message: error.message || error.name || 'Error',
      details: {
        name: error.name,
        stack: error.stack,
        // Some libraries attach a `code`/`status`/`cause` — capture if present.
        ...(typeof (error as { code?: unknown }).code !== 'undefined'
          ? { code: (error as { code?: unknown }).code }
          : {}),
        ...(typeof (error as { status?: unknown }).status !== 'undefined'
          ? { status: (error as { status?: unknown }).status }
          : {}),
      },
    };
  }
  if (typeof error === 'string') return { message: error, details: {} };
  try {
    return { message: 'Non-Error thrown', details: { value: JSON.parse(JSON.stringify(error)) } };
  } catch {
    return { message: 'Non-Error thrown', details: { value: String(error) } };
  }
}

export async function logError(context: string, error: unknown, meta: LogErrorMeta = {}): Promise<void> {
  try {
    const { message, details } = describe(error);
    const merged = meta.details ? { ...details, ...meta.details } : details;

    await createAdminClient()
      .from('error_logs')
      .insert({
        context: context.slice(0, 200),
        message: message.slice(0, 2000),
        details: merged,
        user_id: meta.userId ?? null,
        request_id: meta.requestId ?? null,
      });
  } catch {
    // Deliberately silent — see contract above. The original console.error at
    // the call site is the local-dev fallback.
  }
}
