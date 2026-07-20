import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { embedText } from '@/lib/embeddings/embed';
import { embedTextGemini } from '@/lib/embeddings/gemini';
import { getActiveEmbeddingModel, type EmbeddingModel } from '@/lib/embeddings/activeModel';

/**
 * A query vector tagged with the model that produced it. The tag is not
 * decoration: different embedding models occupy incompatible vector spaces,
 * so a vector is only meaningful against the matching set of RPCs/column
 * (`embedding` vs `embedding_gemini`). Carrying the model alongside the
 * vector makes it impossible to pass a pre-computed embedding to the wrong
 * RPC, and means a caller and the retrieval functions can't disagree if the
 * admin flips the toggle mid-request.
 */
export interface QueryEmbedding {
  model: EmbeddingModel;
  vector: number[];
}

/**
 * The single place that turns query text into a vector using whichever
 * provider is currently active. Exported so app/api/chat/route.ts — which
 * embeds its distinct query texts once up front and passes them down — does
 * not have to duplicate the provider branch.
 */
export async function embedQueryWithActiveModel(text: string): Promise<QueryEmbedding> {
  const model = await getActiveEmbeddingModel();
  const vector = model === 'gemini' ? await embedTextGemini(text) : await embedText(text);
  return { model, vector };
}

async function resolveQueryEmbedding(
  text: string,
  precomputed: QueryEmbedding | undefined,
): Promise<{ embedding: QueryEmbedding; embedMs: number }> {
  if (precomputed) return { embedding: precomputed, embedMs: 0 };
  const startedAt = performance.now();
  const embedding = await embedQueryWithActiveModel(text);
  return { embedding, embedMs: performance.now() - startedAt };
}

// The gemini RPCs (0058) are exact mirrors of the live local ones, differing
// only in which column they read and the vector dimension — so the call sites
// below differ only by name, never by argument shape.
function rpcName(base: string, model: EmbeddingModel): string {
  return model === 'gemini' ? `${base}_gemini` : base;
}

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
  /**
   * Pre-computed embedding for `embedQuery`, to avoid re-embedding identical
   * text across the several retrieval calls route.ts fires per request (the
   * rewritten query is passed to the primary, per-document and article
   * searches — embedding it once per call meant computing the exact same
   * vector up to 3 times). When provided, `embedQuery` is ignored for
   * embedding purposes and `embedMs` is reported as 0 (the cost is attributed
   * to whoever computed it).
   */
  precomputedEmbedding?: QueryEmbedding;
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
  precomputedEmbedding?: QueryEmbedding,
): Promise<RetrievePerDocumentChunksResult> {
  const { embedding, embedMs } = await resolveQueryEmbedding(embedQuery, precomputedEmbedding);

  const supabase = createAdminClient();

  const dbSearchStart = performance.now();
  const { data, error } = await supabase.rpc(rpcName('match_chunks_per_document', embedding.model), {
    query_embedding: embedding.vector,
    query_text: ftsQuery ?? null,
    per_document_limit: PER_DOCUMENT_CANDIDATE_LIMIT,
  });
  const dbSearchMs = performance.now() - dbSearchStart;

  if (error) throw error;
  return { chunks: data ?? [], embedMs, dbSearchMs };
}

/**
 * Article-number fast path (0032) -- see match_chunks_by_article's migration
 * comment for the full rationale (trigram scores per-word with a length>=3
 * filter, so short numeric tokens like article numbers get nothing out of
 * it; an exact/prefix lookup against chunks.article_label is faster and more
 * accurate for this query shape). `articlePrefixes` should come from
 * articleLabelPrefixes(extractArticleReferences(<raw user query>)) --
 * callers must not derive prefixes from the rewritten query (see that
 * module's comment on why). Purely additive: merged into, never replacing,
 * the primary hybrid search results -- see route.ts.
 */
export async function retrieveChunksByArticle(
  embedQuery: string,
  articleLabelPrefixesParam: string[],
  precomputedEmbedding?: QueryEmbedding,
): Promise<RetrievePerDocumentChunksResult> {
  const { embedding, embedMs } = await resolveQueryEmbedding(embedQuery, precomputedEmbedding);

  const supabase = createAdminClient();

  const dbSearchStart = performance.now();
  const { data, error } = await supabase.rpc(rpcName('match_chunks_by_article', embedding.model), {
    query_embedding: embedding.vector,
    article_label_prefixes: articleLabelPrefixesParam,
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
  precomputedEmbedding,
}: RetrieveRelevantChunksParams): Promise<RetrieveRelevantChunksResult> {
  const { embedding, embedMs } = await resolveQueryEmbedding(embedQuery, precomputedEmbedding);

  const supabase = createAdminClient();

  const dbSearchStart = performance.now();
  const { data, error } = await supabase.rpc(rpcName('match_chunks', embedding.model), {
    query_embedding: embedding.vector,
    match_count: matchCount,
    filter_document_id: documentId ?? null,
    query_text: ftsQuery ?? null,
  });
  const dbSearchMs = performance.now() - dbSearchStart;

  if (error) throw error;
  return { chunks: data ?? [], embedMs, dbSearchMs };
}
