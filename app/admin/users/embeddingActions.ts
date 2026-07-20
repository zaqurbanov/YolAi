'use server';

import { requireAdmin } from '@/lib/auth/requireAdmin';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  ACTIVE_EMBEDDING_MODEL_SETTING_KEY,
  DEFAULT_EMBEDDING_MODEL,
  getActiveEmbeddingModel,
  invalidateActiveEmbeddingModelCache,
  type EmbeddingModel,
} from '@/lib/embeddings/activeModel';

export interface EmbeddingStatus {
  activeModel: EmbeddingModel;
  totalChunks: number;
  geminiChunks: number;
  /** True only when geminiChunks === totalChunks and totalChunks > 0 — the
   * one condition under which switching to 'gemini' is permitted. */
  geminiReady: boolean;
  error?: string;
}

export interface SetEmbeddingModelResult {
  ok: boolean;
  activeModel: EmbeddingModel;
  error?: string;
}

async function readCoverage(): Promise<{ total: number; gemini: number } | null> {
  const admin = createAdminClient();

  const [{ count: total, error: totalError }, { count: gemini, error: geminiError }] = await Promise.all([
    admin.from('chunks').select('id', { count: 'exact', head: true }),
    admin.from('chunks').select('id', { count: 'exact', head: true }).not('embedding_gemini', 'is', null),
  ]);

  // Before 0058 is applied the embedding_gemini column doesn't exist and the
  // second query errors — treated as "no coverage", which keeps the toggle
  // safely locked to local rather than throwing in the admin UI. Verified
  // against the live DB: with `head: true` PostgREST returns a 400 with an
  // EMPTY body, so the PostgrestError's `message` is '' — the error object
  // itself is still truthy (which is what the guard relies on), but don't
  // trust the message here, hence the explicit hint below.
  if (totalError || geminiError) {
    console.error(
      '[embeddingActions] coverage read failed (most likely 0058_gemini_embeddings.sql has not been applied yet — column chunks.embedding_gemini missing)',
      totalError ?? geminiError,
    );
    return null;
  }

  return { total: total ?? 0, gemini: gemini ?? 0 };
}

export async function getEmbeddingStatus(): Promise<EmbeddingStatus> {
  const check = await requireAdmin();
  if (!check.ok) {
    return {
      activeModel: DEFAULT_EMBEDDING_MODEL,
      totalChunks: 0,
      geminiChunks: 0,
      geminiReady: false,
      error: check.message,
    };
  }

  const activeModel = await getActiveEmbeddingModel();
  const coverage = await readCoverage();

  if (!coverage) {
    return {
      activeModel,
      totalChunks: 0,
      geminiChunks: 0,
      geminiReady: false,
      error: 'Gemini əhatə dairəsi oxuna bilmədi (0058 miqrasiyası tətbiq olunubmu?)',
    };
  }

  return {
    activeModel,
    totalChunks: coverage.total,
    geminiChunks: coverage.gemini,
    geminiReady: coverage.total > 0 && coverage.gemini === coverage.total,
  };
}

/**
 * Switches the active embedding provider.
 *
 * The coverage guard below is the REAL guard, not a UI convenience: the
 * frontend also gates the control, but a client can call a server action
 * directly. Switching to 'gemini' with incomplete coverage would put query
 * vectors in one space and most chunk vectors in another — silently
 * destroying retrieval quality (and therefore grounding/citations) rather
 * than failing loudly. This project has already hit exactly that failure mode
 * once from a half-finished re-embed; this refuses to reproduce it
 * deliberately.
 *
 * Switching BACK to 'local' is always allowed and needs no guard — the local
 * `embedding` column is fully populated for every chunk by definition.
 */
export async function setActiveEmbeddingModel(model: EmbeddingModel): Promise<SetEmbeddingModelResult> {
  const check = await requireAdmin();
  if (!check.ok) return { ok: false, activeModel: DEFAULT_EMBEDDING_MODEL, error: check.message };

  if (model !== 'local' && model !== 'gemini') {
    return { ok: false, activeModel: await getActiveEmbeddingModel(), error: 'Yanlış model dəyəri' };
  }

  if (model === 'gemini') {
    const coverage = await readCoverage();
    if (!coverage) {
      return {
        ok: false,
        activeModel: await getActiveEmbeddingModel(),
        error: 'Gemini əhatə dairəsi oxuna bilmədi — keçid təhlükəsiz deyil',
      };
    }
    if (coverage.total === 0 || coverage.gemini !== coverage.total) {
      return {
        ok: false,
        activeModel: await getActiveEmbeddingModel(),
        error: `Gemini embedding-ləri natamamdır (${coverage.gemini} / ${coverage.total} chunk). Keçidə icazə verilmir — əvvəlcə scripts/backfill-gemini-embeddings.mjs skriptini tam işə salın.`,
      };
    }
  }

  const { error } = await createAdminClient()
    .from('app_settings')
    .upsert({ key: ACTIVE_EMBEDDING_MODEL_SETTING_KEY, value: model, updated_at: new Date().toISOString() });

  if (error) {
    console.error('[embeddingActions] failed to write active embedding model', error);
    return { ok: false, activeModel: await getActiveEmbeddingModel(), error: 'Ayar yadda saxlanıla bilmədi' };
  }

  invalidateActiveEmbeddingModelCache();
  return { ok: true, activeModel: model };
}
