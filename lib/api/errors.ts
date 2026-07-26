import 'server-only';
import { NextResponse } from 'next/server';
import { logError } from '@/lib/logging/logError';

export interface ApiErrorBody {
  error: string;
  code?: string;
}

interface ApiErrorOptions {
  code?: string;
  cause?: unknown;
  // Dot-separated log key (`<area>.<module>.<operation>`) for error_logs. Falls
  // back to a generic `api.*` bucket when a call site doesn't name itself.
  context?: string;
  userId?: string | null;
}

/**
 * Logs full error detail server-side only, tagged for grep-ability, and
 * persists it to error_logs so it survives past the console.
 * Never include this detail in a client-facing response.
 */
export function logApiError(
  context: string,
  cause: unknown,
  meta: { userId?: string | null; requestId?: string | null; details?: Record<string, unknown> } = {}
) {
  console.error(`[api-error] ${context}`, cause);
  // Not awaited: these call sites are sync and return a Response immediately.
  // logError never throws or rejects (see its contract).
  void logError(context, cause, meta);
}

export function apiError(status: number, message: string, opts: ApiErrorOptions = {}) {
  if (opts.cause !== undefined) {
    logApiError(opts.context ?? `api.status${status}${opts.code ? `.${opts.code}` : ''}`, opts.cause, {
      userId: opts.userId,
      details: { status, code: opts.code ?? null, clientMessage: message },
    });
  }
  const body: ApiErrorBody = { error: message };
  if (opts.code) body.code = opts.code;
  return NextResponse.json(body, { status });
}

export function unauthorized(message = 'Giriş tələb olunur') {
  return apiError(401, message, { code: 'unauthorized' });
}

export function forbidden(message = 'İcazə yoxdur') {
  return apiError(403, message, { code: 'forbidden' });
}

export function notFound(message = 'Tapılmadı') {
  return apiError(404, message, { code: 'not_found' });
}

export function serverError(
  cause: unknown,
  message = 'Server xətası baş verdi',
  context?: string
) {
  return apiError(500, message, { code: 'server_error', cause, context });
}
