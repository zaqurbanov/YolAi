import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

const ENV_DEFAULT_MAX_PER_WINDOW = Number(process.env.CHAT_RATE_LIMIT_MAX_PER_DAY ?? 20);
// Exported so app/api/chat/quota/route.ts can replicate the window-expiry
// check when reading current usage without calling the incrementing RPC.
export const WINDOW_SECONDS = Number(process.env.CHAT_RATE_LIMIT_WINDOW_SECONDS ?? 86400);
const MIN_SPACING_SECONDS = Number(process.env.CHAT_RATE_LIMIT_MIN_SPACING_SECONDS ?? 4);

// Exported so app/api/admin/settings/rate-limit/route.ts can read/write the
// same app_settings row without duplicating the key or the env fallback.
export const GLOBAL_DEFAULT_SETTING_KEY = 'chat_rate_limit_max_per_day';
export { ENV_DEFAULT_MAX_PER_WINDOW };

interface RateLimitCheckResult {
  allowed: boolean;
  reason: string | null;
  retry_after_seconds: number | null;
  window_count: number;
}

// Reads the admin-configurable global default from app_settings (0024),
// falling back to the env var default when no row exists or the query
// errors — same fail-open bias as checkChatRateLimit below: infra hiccups
// must never block chat. No memoization — a per-request read is consistent
// with the rest of this app's scale, but worth revisiting if this table is
// ever read on a much hotter path than "once per chat request".
async function getGlobalDefaultMaxPerWindow(): Promise<number> {
  const { data, error } = await createAdminClient()
    .from('app_settings')
    .select('value')
    .eq('key', GLOBAL_DEFAULT_SETTING_KEY)
    .maybeSingle();

  if (error || !data) return ENV_DEFAULT_MAX_PER_WINDOW;

  const value = typeof data.value === 'number' ? data.value : Number(data.value);
  if (!Number.isFinite(value) || value <= 0) return ENV_DEFAULT_MAX_PER_WINDOW;
  return value;
}

// Single source of truth for the "what max applies to this user" precedence
// (per-user custom_max_per_day override -> admin-configured global default ->
// env default), so checkChatRateLimit and the read-only quota status below
// never drift apart on this logic.
async function resolveEffectiveMaxPerDay(customMaxPerDay?: number | null): Promise<number> {
  return customMaxPerDay ?? (await getGlobalDefaultMaxPerWindow());
}

export async function checkChatRateLimit(
  userId: string,
  customMaxPerDay?: number | null,
): Promise<{ allowed: boolean; message: string | null; used: number | null; max: number }> {
  const effectiveMax = await resolveEffectiveMaxPerDay(customMaxPerDay);
  const { data, error } = await createAdminClient()
    .rpc('check_chat_rate_limit', {
      p_user_id: userId,
      p_max_per_window: effectiveMax,
      p_window_seconds: WINDOW_SECONDS,
      p_min_spacing_seconds: MIN_SPACING_SECONDS,
    })
    .single<RateLimitCheckResult>();

  if (error) {
    console.error('[chat] rate limit check failed:', error);
    // fail open — infra hiccup shouldn't block chat; used is unknown, so
    // callers must treat a null `used` as "don't show quota metadata".
    return { allowed: true, message: null, used: null, max: effectiveMax };
  }
  if (typeof data.window_count !== 'number') {
    // Legacy/malformed RPC row (e.g. a live DB still running the pre-0028
    // 3-out-column version of check_chat_rate_limit) — window_count comes
    // back undefined, not null, so it must be caught explicitly here rather
    // than relying on callers' `used !== null` checks downstream.
    console.error('[chat] rate limit check returned unexpected shape (missing window_count):', data);
    return { allowed: true, message: null, used: null, max: effectiveMax };
  }
  if (data.allowed) return { allowed: true, message: null, used: data.window_count, max: effectiveMax };
  if (data.reason === 'spacing') {
    return {
      allowed: false,
      message: 'Çox tez-tez mesaj göndərirsiniz. Zəhmət olmasa bir neçə saniyə gözləyib yenidən cəhd edin.',
      used: data.window_count,
      max: effectiveMax,
    };
  }
  return {
    allowed: false,
    message: `Gündəlik mesaj limitinizə çatmısınız (${effectiveMax} mesaj/gün). Zəhmət olmasa bir azdan yenidən cəhd edin.`,
    used: data.window_count,
    max: effectiveMax,
  };
}

// Read-only, non-incrementing usage check for surfaces that need to show
// remaining quota without sending a message (account page, chat page on
// mount). Deliberately bypasses check_chat_rate_limit (which inserts/locks/
// increments) and reads chat_rate_limits directly via the service-role
// client — this table has no authenticated/anon RLS policies by design, so
// this is the only legitimate read path. Reapplies the same "window expired
// -> treat count as 0" rule the SQL function uses internally, kept here as
// the single place that logic lives in TypeScript.
export async function getChatQuotaStatus(
  userId: string,
  customMaxPerDay?: number | null,
): Promise<{ used: number; max: number }> {
  const effectiveMax = await resolveEffectiveMaxPerDay(customMaxPerDay);
  const { data, error } = await createAdminClient()
    .from('chat_rate_limits')
    .select('window_start, window_count')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[chat] quota status read failed:', error);
    return { used: 0, max: effectiveMax }; // fail open, consistent with checkChatRateLimit
  }
  if (!data) return { used: 0, max: effectiveMax };

  const windowStart = new Date(data.window_start).getTime();
  const windowExpired = (Date.now() - windowStart) / 1000 >= WINDOW_SECONDS;
  return { used: windowExpired ? 0 : data.window_count, max: effectiveMax };
}
