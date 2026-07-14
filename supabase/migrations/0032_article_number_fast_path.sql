-- Article-number fast path for retrieval (performance phase 3, step 2).
--
-- Root cause confirmed empirically (no live EXPLAIN available -- migration
-- 0031's debug_explain_match_chunks_per_document was never applied to the
-- live DB, and this environment has no raw Postgres connection, only
-- PostgREST/RPC via supabase-js -- see 0031's own comment for why). Instead,
-- a differential test called the real match_chunks_per_document RPC with
-- query_text set vs null (null structurally skips the entire trgm_matches
-- CTE, per its own `where query_text is not null` guard) across two
-- representative queries ("Maddə 65 nə deyir", "sürücülük vəsiqəsi"), 3
-- repeats each, against the live project. Trigram enabled added ~1.3-2.2s on
-- top of a ~0.3-0.5s baseline (4-6x), confirming trgm_matches' unindexed
-- word_similarity join (see 0014/0018/0030's comments on why it can't use
-- the indexed `<%` operator) as the dominant cost, not the vector CTE,
-- lower(c.content) recomputation, connection overhead, or the per-document
-- window function.
--
-- Fast path rationale: many real queries reference a specific "Maddə N"
-- (article number). Trigram scores per-word via word_similarity with a
-- length>=3 filter (see match_chunks_per_document's query_words CTE) and a
-- 0.3 threshold -- short numeric tokens like "65" (2 chars) are filtered out
-- entirely before scoring even happens, so trigram contributes nothing for
-- the number itself; only "Maddə" and any surrounding free text get scored.
-- An exact/prefix lookup against chunks.article_label is both faster (a
-- ~1600-row string-prefix filter, not an O(chunks x query_words)
-- word_similarity join) AND more accurate for this query shape -- not a
-- speed/accuracy tradeoff.
--
-- article_label format audited live (`select distinct article_label from
-- chunks`): NOT a bare number -- chunkText.ts's normalizeArticleLabel writes
-- the full marker line, e.g. "Maddə 65. <title text that follows on the same
-- line>", and amendment/inserted articles use a dash suffix, e.g.
-- "Maddə 34-1. <title>". Also present: non-Maddə structural labels ("Fəsil",
-- "Bölmə" segment headers) and ~9.5% nulls (documents/segments with no
-- Maddə/Fəsil/Bölmə marker at all, see chunkText.ts's
-- splitTopLevelDottedClauses comment). None of that is a bare number, so
-- this fast path MUST use a prefix match (`article_label LIKE 'Maddə 65.%'`)
-- anchored on the literal "Maddə <N>." (or "Maddə <N>-<M>.") form
-- normalizeArticleLabel always produces, not an exact-equality match.
--
-- Deliberately does NOT match sub-numbered articles when the user's query
-- has no dash of its own -- "Maddə 65" only matches "Maddə 65.", never
-- "Maddə 65-1." -- since those are distinct amendment articles a query
-- would name explicitly if intended. This is a judgment call, documented
-- here rather than silently assumed.
--
-- No bare-numeric-code fast path (e.g. bare "338.2" with no "Maddə" word)
-- was added: audited the last 500 rows of chat_request_logs.query and found
-- zero real queries in either shape ("Maddə N" or bare numeric code) in that
-- sample. The "Maddə N" path is implemented anyway per explicit task scope;
-- the bare-numeric-code path is skipped since there's no evidence it's a
-- real query shape in this app -- add it later if usage data shows
-- otherwise, rather than guessing now.
create index if not exists chunks_article_label_pattern_idx
  on chunks (article_label text_pattern_ops);

-- Returns the same row shape as match_chunks_per_document/match_chunks so
-- route.ts can merge this source into the same candidate pool and sort by
-- combined_score. vector_rank/trgm_rank are null (this path does neither
-- ranking strategy); combined_score is a fixed 1.0 (above the max possible
-- reciprocal-rank-fusion score from the other two sources, which is
-- 2/(60+1) =~ 0.033) so an exact article-number match always sorts to the
-- top of the merged pool and is never truncated away by
-- rerank.ts's MAX_RERANK_CANDIDATES cap before the LLM reranker (which still
-- has final say on relevance) ever sees it -- this is a supplement to hybrid
-- search, not a bypass of the rerank/grounding pipeline.
--
-- similarity is still computed (via query_embedding) purely to rank
-- multiple chunks *within* the same matched article (e.g. a long article
-- split by chunkText.ts's splitDottedSubclauses/splitWithOverlap into
-- several chunks) -- not used for inclusion/exclusion, only tie-break
-- ordering, so a caller that can't or doesn't want to pass a real embedding
-- can safely pass a zero vector and still get correct (unordered-within-
-- article) results.
--
-- max_chunks_per_document caps how many chunks of the SAME matched article,
-- within the SAME document, are returned -- distinct from
-- match_chunks_per_document's per_document_limit (which caps chunks per
-- document across the whole corpus-wide/trigram pool). Defaults small (5):
-- a single article, even split across several chunks, rarely needs more
-- than a handful to fully cover its content, unlike the broader per-document
-- guarantee's much larger budget.
create or replace function match_chunks_by_article(
  query_embedding vector(384),
  article_label_prefixes text[],
  max_chunks_per_document int default 5
)
returns table (
  id uuid,
  content text,
  page_number int,
  article_label text,
  document_id uuid,
  document_title text,
  similarity float,
  vector_rank int,
  trgm_rank int,
  combined_score float
)
language sql stable
as $$
  with matched as (
    select
      c.id,
      c.content,
      c.page_number,
      c.article_label,
      d.id as document_id,
      d.title as document_title,
      1 - (c.embedding <=> query_embedding) as similarity,
      row_number() over (
        partition by d.id
        order by c.embedding <=> query_embedding
      )::int as doc_article_rank
    from chunks c
    join documents d on d.id = c.document_id
    where d.status = 'ready'
      and array_length(article_label_prefixes, 1) > 0
      and exists (
        select 1
        from unnest(article_label_prefixes) as p(prefix)
        where c.article_label like p.prefix
      )
  )
  select
    id,
    content,
    page_number,
    article_label,
    document_id,
    document_title,
    similarity,
    null::int as vector_rank,
    null::int as trgm_rank,
    1.0::float as combined_score
  from matched
  where doc_article_rank <= max_chunks_per_document
  order by similarity desc;
$$;
