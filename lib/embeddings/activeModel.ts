import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

export type EmbeddingModel = 'local' | 'gemini';

// Exported so app/admin/users/embeddingActions.ts reads/writes the same
// app_settings row without duplicating the key — same convention as
// COIN_PRICE_SETTING_KEY in lib/chat/coins.ts.
export const ACTIVE_EMBEDDING_MODEL_SETTING_KEY = 'active_embedding_model';

// Hardcoded TS-side default; no seed row exists in 0058, matching this repo's
// app_settings convention. 'local' is the current live behaviour, so with no
// row present this whole feature is a strict no-op.
export const DEFAULT_EMBEDDING_MODEL: EmbeddingModel = 'local';

// This sits on the retrieval hot path (every chat message triggers several
// retrieval calls), so a fresh DB round-trip per call would be pure added
// latency for a value that changes maybe once ever. A few seconds is short
// enough that an admin flipping the toggle sees it take effect essentially
// immediately, and long enough to collapse all reads within one request.
const CACHE_TTL_MS = 5000;

let cached: { value: EmbeddingModel; expiresAt: number } | null = null;

/**
 * Reads the admin-selected embedding provider, falling back to
 * DEFAULT_EMBEDDING_MODEL when no row exists, the value is unrecognised, or
 * the query errors — same fail-open bias as getGlobalMessagePrice in
 * lib/chat/coins.ts. Retrieval must never break because a settings read
 * hiccupped; degrading to the local model (which is always fully populated)
 * is strictly safer than throwing.
 */
export async function getActiveEmbeddingModel(): Promise<EmbeddingModel> {
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  let value: EmbeddingModel = DEFAULT_EMBEDDING_MODEL;
  try {
    const { data, error } = await createAdminClient()
      .from('app_settings')
      .select('value')
      .eq('key', ACTIVE_EMBEDDING_MODEL_SETTING_KEY)
      .maybeSingle();

    if (!error && data && (data.value === 'local' || data.value === 'gemini')) {
      value = data.value;
    }
  } catch (err) {
    console.error('[embeddings] active model read failed, falling back to local:', err);
  }

  cached = { value, expiresAt: Date.now() + CACHE_TTL_MS };
  return value;
}

// Lets the admin toggle take effect immediately in the writing process
// instead of waiting out the TTL.
export function invalidateActiveEmbeddingModelCache() {
  cached = null;
}
