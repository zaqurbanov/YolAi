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

// Was: a chunk-count threshold (SMALL_DOCUMENT_CHUNK_THRESHOLD = 100)
// classifying documents as "small" (gets a supplementary search scoped to
// just the small-document group, per match_chunks' filter_document_ids
// param, 0022) vs "huge" (assumed to already win corpus-wide ranking on its
// own merits) — itself replacing an even earlier generation of hand-coded,
// per-query regex "intent" checks (matchesDriverDocumentsIntent,
// matchesTechnicalInspectionIntent, matchesPedestrianCrossingIntent) that
// each guessed, from query wording, which one specific document a question
// was "about."
//
// Root cause that killed the threshold approach (2026-07-14 bug report,
// two insurance-document questions): "165 IVQ İcbari sığortalar haqqında"
// was reprocessed and grew to 285 chunks, crossing the 100-chunk cutoff and
// losing the boost — but it isn't one of the corpus's actually-huge,
// broadly-relevant documents (517/181/177/114-chunk docs, see match_chunks_
// per_document's migration comment for the full list); it's a single narrow
// topic split into many fine-grained articles, so its own best-matching
// chunk for a specific query can be crowded out of a corpus-wide top-N
// largely by OTHER CHUNKS OF THE SAME DOCUMENT. Any fixed chunk-count cutoff
// has this failure mode for some document size, and needs retuning every
// time a document happens to cross it.
//
// Fix: match_chunks_per_document (0025) guarantees every ready document —
// regardless of its chunk count — contributes up to its own top N chunks
// (ranked within that document alone, via a partition-by-document window
// function, using the same vector+trigram combined_score formula match_chunks
// uses — not a document-local rank-only score, which would sort incomparably
// against match_chunks' results once merged in route.ts) to the retrieval
// pool. This has zero query-content-specific code and needs no
// per-document-size tuning as documents are uploaded or reprocessed.
// lib/rag/rerank.ts still has the final say on what's actually relevant from
// the merged pool. Confirmed live against the 2026-07-14 bug report's two
// queries: the target chunk ranks 12th-15th within its own 285-chunk
// document — comfortably inside this limit.
const PER_DOCUMENT_CANDIDATE_LIMIT = 20;

export interface RetrievePerDocumentChunksResult {
  chunks: RetrievedChunk[];
  embedMs: number;
  dbSearchMs: number;
}

/** Up to PER_DOCUMENT_CANDIDATE_LIMIT chunks per ready document, guaranteeing
 * every document a foothold in the retrieval pool regardless of corpus-wide
 * competition — see PER_DOCUMENT_CANDIDATE_LIMIT's doc comment above for why
 * this replaces the old chunk-count threshold. `ftsQuery` mirrors
 * retrieveRelevantChunks' param of the same purpose — pass the raw user
 * query, not the rewritten one (see that param's doc comment). */
export async function retrievePerDocumentChunks(
  embedQuery: string,
  ftsQuery?: string,
): Promise<RetrievePerDocumentChunksResult> {
  const embedStart = performance.now();
  const embedding = await embedText(embedQuery);
  const embedMs = performance.now() - embedStart;

  const supabase = createAdminClient();

  const dbSearchStart = performance.now();
  const { data, error } = await supabase.rpc('match_chunks_per_document', {
    query_embedding: embedding,
    query_text: ftsQuery ?? null,
    per_document_limit: PER_DOCUMENT_CANDIDATE_LIMIT,
  });
  const dbSearchMs = performance.now() - dbSearchStart;

  if (error) throw error;
  return { chunks: data ?? [], embedMs, dbSearchMs };
}

export async function retrieveRelevantChunks({
  embedQuery,
  ftsQuery,
  documentId,
  matchCount = 60,
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
