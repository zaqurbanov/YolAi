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
