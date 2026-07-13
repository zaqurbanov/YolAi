import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { embedText } from '@/lib/embeddings/embed';

export interface RetrievedChunk {
  id: string;
  content: string;
  page_number: number | null;
  article_label: string | null;
  document_id: string;
  document_title: string;
  similarity: number;
  vector_rank: number | null;
  trgm_rank: number | null;
  combined_score: number;
}

export interface RetrieveRelevantChunksResult {
  chunks: RetrievedChunk[];
  embedMs: number;
  dbSearchMs: number;
}

export interface RetrieveRelevantChunksParams {
  /** Query text to embed for vector search — typically the rewritten/expanded query. */
  embedQuery: string;
  /**
   * Raw text used for lexical (trigram similarity, see 0014) keyword
   * matching. The rewritten query can drift or hallucinate (see
   * rewriteQuery.ts), so the user's original wording is a more reliable
   * source of literal keywords. Named ftsQuery for historical reasons (0011
   * used tsvector FTS here; 0014 replaced it with pg_trgm because FTS never
   * matched Azerbaijani suffix variation) -- kept as-is since it maps 1:1 to
   * the match_chunks RPC's `query_text` param and callers depend on this
   * name. Optional: pass undefined/empty to fall back to vector-only
   * ranking.
   */
  ftsQuery?: string;
  documentId?: string;
  matchCount?: number;
}

// Narrow, single-purpose intent check for "which documents must a driver
// carry / what can police request when stopping me" — NOT a general
// per-query document router. Bug repro: "polis məni saxlayanda hansı
// sənədləri istəyə bilər?" was answered from "727 IQ Polis haqqında" Maddə
// 17 (police ID-check powers) instead of "Yol hərəkəti qaydaları" Maddə 37
// (documents a driver must carry) — diagnostics showed the correct chunk
// simply doesn't surface in top-15 vector search because Maddə 37 was one
// large diluted chunk (see chunkText.ts's splitPlainEnumeratedList fix for
// the root cause). This is a supplementary, additive retrieval boost so the
// correct chunk is guaranteed to be considered even before/regardless of the
// chunking fix landing — it never removes chunks another query would
// otherwise get (e.g. a genuinely Police-Law-scoped question like "polis
// hansı hallarda sənədlərimi yoxlaya bilər?" doesn't match this pattern at
// all, and even if it did, merging only adds candidates).
const DRIVER_DOCUMENTS_INTENT_PATTERN =
  /(sənəd|vəsiqə|şəhadətnamə)\w*.{0,40}(saxla|gəzdir|daşı)\w*|(\bpolis\b|əməkdaş).{0,60}(sənəd|vəsiqə|şəhadətnamə)\w*.{0,40}(istə|tələb)|(sənəd|vəsiqə|şəhadətnamə)\w*.{0,60}(\bpolis\b|əməkdaş).{0,40}(istə|tələb)/i;

export function matchesDriverDocumentsIntent(text: string): boolean {
  return DRIVER_DOCUMENTS_INTENT_PATTERN.test(text);
}

/** Case-insensitive exact title lookup — used by the driver-documents intent
 * boost to find "Yol hərəkəti qaydaları"'s current id rather than hardcoding
 * a UUID that can differ across environments/reseeds. */
export async function findDocumentIdByTitle(title: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('documents')
    .select('id')
    .ilike('title', title)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

export async function retrieveRelevantChunks({
  embedQuery,
  ftsQuery,
  documentId,
  matchCount = 15,
}: RetrieveRelevantChunksParams): Promise<RetrieveRelevantChunksResult> {
  const embedStart = performance.now();
  const embedding = await embedText(embedQuery);
  const embedMs = performance.now() - embedStart;

  const supabase = createAdminClient();

  const dbSearchStart = performance.now();
  const { data, error } = await supabase.rpc('match_chunks', {
    query_embedding: embedding,
    match_count: matchCount,
    filter_document_id: documentId ?? null,
    query_text: ftsQuery ?? null,
  });
  const dbSearchMs = performance.now() - dbSearchStart;

  if (error) throw error;
  return { chunks: data ?? [], embedMs, dbSearchMs };
}
