import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { logError } from '@/lib/logging/logError';

// GLOBAL daily circuit breaker for LLM-backed chat requests
// (supabase/migrations/0093_global_llm_circuit_breaker.sql).
//
// Every other limiter in this app is keyed by user_id, and accounts are free
// and unlimited (email confirmation is disabled pending custom SMTP), so a
// scripted attacker can mint N accounts and get N x the per-user daily
// allowance billed to this project's provider keys. This module is the outer
// bound that does not care how many accounts exist.
//
// Structure deliberately mirrors lib/chat/rateLimit.ts: a settings read with an
// env/TS default fallback, plus one RPC call per chat request.

const ENV_DEFAULT_DAILY_LLM_MESSAGE_CAP = Number(process.env.DAILY_LLM_MESSAGE_CAP ?? 2000);

// Exported so app/api/admin/chat-meta/route.ts (?type=llm-circuit-breaker) can
// read/write the same app_settings row without duplicating the key or default.
export const DAILY_LLM_MESSAGE_CAP_KEY = 'daily_llm_message_cap';
export const DEFAULT_DAILY_LLM_MESSAGE_CAP = ENV_DEFAULT_DAILY_LLM_MESSAGE_CAP;

interface ConsumeResult {
  usage_count: number;
  allowed: boolean;
}

// Same shape and same fail-open bias as rateLimit.ts's equivalent: an unset key
// or a failed read means "use the code default", never "block everything".
export async function getDailyLlmMessageCap(): Promise<number> {
  const { data, error } = await createAdminClient()
    .from('app_settings')
    .select('value')
    .eq('key', DAILY_LLM_MESSAGE_CAP_KEY)
    .maybeSingle();

  if (error || !data) return DEFAULT_DAILY_LLM_MESSAGE_CAP;

  const value = typeof data.value === 'number' ? data.value : Number(data.value);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_DAILY_LLM_MESSAGE_CAP;
  return value;
}

export interface GlobalLlmBudgetResult {
  allowed: boolean;
  // Requests served today AFTER this one was counted, or null when the counter
  // could not be read (fail-open branch) — callers must treat null as "unknown".
  used: number | null;
  cap: number;
}

/**
 * Atomically counts this request against the global daily budget and reports
 * whether it may proceed. Must be called BEFORE any embedding call, retrieval,
 * vision call or chat completion — a tripped breaker has to cost nothing.
 *
 * FAIL-OPEN, deliberately. CLAUDE.md's rule is "coin-granting paths fail
 * closed, read-only display paths fail open", and this is neither: it is a
 * spend guard, which argues for fail-closed. It still fails OPEN, for three
 * reasons that together outweigh that:
 *   1. The downside of failing open is BOUNDED and already priced in. The
 *      per-user rate limiter and the coin economy still gate every non-admin
 *      request, so an outage of this one RPC does not remove all limits — it
 *      removes only the outermost one, and only for as long as the DB is
 *      unhealthy. The downside of failing closed is chat being dead for every
 *      user, which is unbounded in duration and immediately visible.
 *   2. Migrations here are applied BY HAND, so there is a real window where
 *      this RPC does not exist yet in the live database. Fail-closed would mean
 *      deploying this feature takes the entire chat product offline until
 *      someone runs 0093 in the SQL editor.
 *   3. The failure is not silent: every fail-open is written to error_logs and
 *      surfaces in the admin logs dashboard, same as the trip itself.
 * Worth revisiting (to fail closed) only once there is also a provider-side
 * spend alarm, so a simultaneous DB outage + abuse spike is caught elsewhere.
 */
export async function consumeGlobalLlmBudget(userId: string): Promise<GlobalLlmBudgetResult> {
  const cap = await getDailyLlmMessageCap();

  const { data, error } = await createAdminClient()
    .rpc('consume_llm_budget', { p_cap: cap })
    .single<ConsumeResult>();

  if (error) {
    // Covers the not-yet-migrated case too (PGRST202 "could not find the
    // function") — an RPC-missing error must land here, not 500 the route.
    void logError('chat.globalLimit.consume', error, { userId, details: { cap } });
    console.error('[chat] global LLM budget check failed:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return { allowed: true, used: null, cap };
  }

  if (typeof data?.usage_count !== 'number' || typeof data?.allowed !== 'boolean') {
    void logError('chat.globalLimit.unexpectedShape', 'consume_llm_budget returned an unexpected row', {
      userId,
      details: { data },
    });
    return { allowed: true, used: null, cap };
  }

  return { allowed: data.allowed, used: data.usage_count, cap };
}

/**
 * Read-only usage for the admin panel. Calls the separate non-incrementing RPC
 * so a dashboard refresh can never consume budget. Returns null usage when the
 * counter cannot be read (including pre-migration), so the UI can render
 * "unknown" instead of a wrong zero.
 */
export async function readGlobalLlmUsageToday(): Promise<{ used: number | null; cap: number }> {
  const cap = await getDailyLlmMessageCap();

  const { data, error } = await createAdminClient().rpc('llm_budget_usage_today');

  if (error) {
    void logError('chat.globalLimit.read', error, { details: { cap } });
    return { used: null, cap };
  }

  const used = typeof data === 'number' ? data : Number(data);
  return { used: Number.isFinite(used) ? used : null, cap };
}
