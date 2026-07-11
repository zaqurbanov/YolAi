import 'server-only';
import { NextResponse } from 'next/server';

export interface ApiErrorBody {
  error: string;
  code?: string;
}

interface ApiErrorOptions {
  code?: string;
  cause?: unknown;
}

/**
 * Logs full error detail server-side only, tagged for grep-ability.
 * Never include this detail in a client-facing response.
 */
export function logApiError(context: string, cause: unknown) {
  console.error(`[api-error] ${context}`, cause);
}

export function apiError(status: number, message: string, opts: ApiErrorOptions = {}) {
  if (opts.cause !== undefined) {
    logApiError(`status=${status}${opts.code ? ` code=${opts.code}` : ''}`, opts.cause);
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

export function serverError(cause: unknown, message = 'Server xətası baş verdi') {
  return apiError(500, message, { code: 'server_error', cause });
}
