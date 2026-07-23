-- Consolidate the chat route's three hybrid retrieval RPC round-trips into ONE.
--
-- WHY (history: 0056 -> 0057 -> 0061 -> 0062): after 0062 restored the proven
-- indexless sequential trigram form, each hybrid RPC costs ~3.3s, dominated by
-- the trigram CTE (word_similarity cross join over ~2,009 chunks; the vector
-- top-N side is ~0.4s). app/api/chat/route.ts fires up to THREE of these per
-- question and sums them into chat_request_logs.db_search_ms (~10s total):
--
--   (a) match_chunks               with the REWRITTEN query's embedding
--   (b) match_chunks               with the RAW user query's embedding
--                                  (only when rewrite changed the text)
--   (c) match_chunks_per_document  with the rewritten query's embedding
--
-- The decisive observation: all three calls receive the SAME query_text (the
-- raw user text -- route.ts's ftsQueryForSearch) and, on the (c) path, no
-- document filter (route.ts only runs (c) when the chat is not scoped to one
-- document). So the expensive trigram scored set is computed three times,
-- byte-identically. 0062's closing LESSON already named this consolidation as
-- "the remaining honest speedup lever ... that needs no planner gamble".
--
-- WHAT THIS DOES: match_chunks_combined (+ _gemini mirror, per 0058's
-- convention) computes the trigram scored set ONCE and reuses it for all
-- three variants, while keeping each variant's vector CTE, RRF combination,
-- similarity floor, and limits as VERBATIM copies of the 0062 definitions:
--
--   * trgm_scored / trgm_ranked: one scan, 0062's exact form -- plain cross
--     join + group by + having max(word_similarity(az_unaccent(word),
--     content_unaccented)) >= 0.3. 0056's 2.0 RRF trigram weight and 0057's
--     both-sides az_unaccent semantics are unchanged. NO `<%` operator, NO
--     index bet (0034/0061 both regressed; do not re-attempt without a real
--     EXPLAIN (ANALYZE, BUFFERS) from the Supabase SQL editor).
--   * Equivalence of the sharing: (a) and (b) call match_chunks with the same
--     query_text and the same filter_document_id, so their trgm_matches CTEs
--     are the same relation; (c) runs only when filter_document_id is null,
--     in which case match_chunks' trigram CTE (filters null) equals
--     match_chunks_per_document's (no filters). Per-variant candidate-pool
--     LIMITs are applied AFTER ranking, exactly as before (ranks come from
--     row_number over the same `order by trgm_score desc`, so limiting by
--     rank returns the same rows as `order by ... limit n`, modulo the same
--     score-tie nondeterminism the old functions already had).
--   * primary_vec / raw_vec / per_doc_vec: verbatim copies of the 0062 vector
--     CTEs (raw_vec gated on raw_query_embedding is not null, per_doc_vec on
--     include_per_document -- those quals reference no scan columns, so they
--     gate the branch rather than changing its plan shape). Vector work is
--     cheap; sharing it was deliberately NOT attempted, to keep equivalence
--     trivially auditable.
--   * Output rows carry a `source` discriminator ('primary' | 'raw' |
--     'per_document') so the TS side (retrieveCombinedChunks in
--     lib/retrieval/search.ts) reconstructs the three result sets exactly as
--     the old three calls returned them.
--
-- Deliberate scope cuts:
--   * No filter_document_ids uuid[] param -- route.ts never passes it; the
--     old match_chunks keeps that capability.
--   * match_chunks_by_article is NOT folded in: it has no trigram CTE (that
--     is its whole point, see 0032), costs milliseconds, and only fires on
--     article-number queries.
--   * The old RPCs (match_chunks, match_chunks_per_document, + _gemini) are
--     NOT dropped: other callers may exist, and deployed TS code falls back
--     to them until this migration is applied (missingRelation.ts pattern).
--
-- Expected effect: db_search_ms ~10s -> roughly 3.3s + ~2 x 0.4s extra vector
-- work (the trigram scan is paid once instead of three times; one network
-- round-trip instead of three).
--
-- Grants: none added -- matches the existing retrieval RPCs, which rely on
-- default function EXECUTE and are only called via the service-role client
-- in lib/retrieval/search.ts.

create or replace function match_chunks_combined(
  query_embedding vector(384),
  raw_query_embedding vector(384) default null,
  query_text text default null,
  match_count int default 6,
  filter_document_id uuid default null,
  include_per_document boolean default false,
  per_document_limit int default 20
)
returns table (
  source text,
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
  with primary_pool as (
    select greatest(match_count * 6, 80) as n
  ),
  per_doc_pool as (
    select greatest(
      per_document_limit * (select count(*) from documents where status = 'ready') * 5,
      800
    ) as n
  ),
  query_words as (
    select word
    from unnest(string_to_array(lower(btrim(coalesce(query_text, ''))), ' ')) as word
    where length(word) >= 3
  ),
  -- The ONE shared trigram scan (the expensive part). Verbatim 0062 form.
  trgm_scored as (
    select
      c.id,
      max(word_similarity(az_unaccent(qw.word), c.content_unaccented)) as trgm_score
    from chunks c
    join documents d on d.id = c.document_id
    cross join query_words qw
    where query_text is not null
      and btrim(query_text) <> ''
      and d.status = 'ready'
      and (filter_document_id is null or d.id = filter_document_id)
    group by c.id
    having max(word_similarity(az_unaccent(qw.word), c.content_unaccented)) >= 0.3
  ),
  trgm_ranked as (
    select trgm_scored.id, row_number() over (order by trgm_scored.trgm_score desc)::int as trgm_rank
    from trgm_scored
  ),
  primary_trgm as (
    select tr.id, tr.trgm_rank from trgm_ranked tr
    order by tr.trgm_rank
    limit (select n from primary_pool)
  ),
  per_doc_trgm as (
    select tr.id, tr.trgm_rank from trgm_ranked tr
    order by tr.trgm_rank
    limit (select n from per_doc_pool)
  ),
  primary_vec as (
    select
      c.id,
      row_number() over (order by c.embedding <=> query_embedding)::int as vector_rank
    from chunks c
    join documents d on d.id = c.document_id
    where d.status = 'ready'
      and (filter_document_id is null or d.id = filter_document_id)
    order by c.embedding <=> query_embedding
    limit (select n from primary_pool)
  ),
  raw_vec as (
    select
      c.id,
      row_number() over (order by c.embedding <=> raw_query_embedding)::int as vector_rank
    from chunks c
    join documents d on d.id = c.document_id
    where raw_query_embedding is not null
      and d.status = 'ready'
      and (filter_document_id is null or d.id = filter_document_id)
    order by c.embedding <=> raw_query_embedding
    limit (select n from primary_pool)
  ),
  per_doc_vec as (
    select
      c.id,
      row_number() over (order by c.dist)::int as vector_rank
    from (
      select
        c.id,
        c.embedding <=> query_embedding as dist
      from chunks c
      join documents d on d.id = c.document_id
      where include_per_document
        and d.status = 'ready'
      order by c.embedding <=> query_embedding
      limit (select n from per_doc_pool)
    ) c
  ),
  primary_combined as (
    select
      coalesce(v.id, t.id) as id,
      v.vector_rank,
      t.trgm_rank,
      coalesce(1.0 / (60 + v.vector_rank), 0) + coalesce(2.0 / (60 + t.trgm_rank), 0) as combined_score
    from primary_vec v
    full outer join primary_trgm t on t.id = v.id
  ),
  -- raw variant reuses primary_trgm: the old (b) call passed the same
  -- query_text and the same filter, so its trigram CTE was this same relation.
  raw_combined as (
    select
      coalesce(v.id, t.id) as id,
      v.vector_rank,
      t.trgm_rank,
      coalesce(1.0 / (60 + v.vector_rank), 0) + coalesce(2.0 / (60 + t.trgm_rank), 0) as combined_score
    from raw_vec v
    full outer join primary_trgm t on t.id = v.id
    where raw_query_embedding is not null
  ),
  per_doc_combined as (
    select
      coalesce(v.id, t.id) as id,
      v.vector_rank,
      t.trgm_rank,
      coalesce(1.0 / (60 + v.vector_rank), 0) + coalesce(2.0 / (60 + t.trgm_rank), 0) as combined_score
    from per_doc_vec v
    full outer join per_doc_trgm t on t.id = v.id
    where include_per_document
  ),
  primary_rows as (
    select
      'primary'::text as source,
      c.id, c.content, c.page_number, c.article_label,
      d.id as document_id, d.title as document_title,
      1 - (c.embedding <=> query_embedding) as similarity,
      pc.vector_rank, pc.trgm_rank, pc.combined_score
    from primary_combined pc
    join chunks c on c.id = pc.id
    join documents d on d.id = c.document_id
    where pc.trgm_rank is not null
       or (1 - (c.embedding <=> query_embedding)) >= 0.4
    order by pc.combined_score desc
    limit match_count
  ),
  raw_rows as (
    select
      'raw'::text as source,
      c.id, c.content, c.page_number, c.article_label,
      d.id as document_id, d.title as document_title,
      1 - (c.embedding <=> raw_query_embedding) as similarity,
      rc.vector_rank, rc.trgm_rank, rc.combined_score
    from raw_combined rc
    join chunks c on c.id = rc.id
    join documents d on d.id = c.document_id
    where rc.trgm_rank is not null
       or (1 - (c.embedding <=> raw_query_embedding)) >= 0.4
    order by rc.combined_score desc
    limit match_count
  ),
  per_doc_scored as (
    select
      c.id, c.content, c.page_number, c.article_label,
      d.id as document_id, d.title as document_title,
      1 - (c.embedding <=> query_embedding) as similarity,
      pdc.vector_rank, pdc.trgm_rank, pdc.combined_score,
      row_number() over (partition by d.id order by pdc.combined_score desc)::int as doc_rank
    from per_doc_combined pdc
    join chunks c on c.id = pdc.id
    join documents d on d.id = c.document_id
    where pdc.trgm_rank is not null
       or (1 - (c.embedding <=> query_embedding)) >= 0.4
  ),
  per_doc_rows as (
    select
      'per_document'::text as source,
      s.id, s.content, s.page_number, s.article_label,
      s.document_id, s.document_title, s.similarity,
      s.vector_rank, s.trgm_rank, s.combined_score
    from per_doc_scored s
    where s.doc_rank <= per_document_limit
  )
  -- Postgres only allows bare result-column names in a UNION's ORDER BY, not
  -- expressions — wrap the union in a subquery so the CASE ordering is legal.
  select u.*
  from (
    select * from primary_rows
    union all
    select * from raw_rows
    union all
    select * from per_doc_rows
  ) u
  order by
    case u.source when 'primary' then 0 when 'raw' then 1 else 2 end,
    u.combined_score desc;
$$;

-- _gemini mirror (0058 convention): identical except `embedding` ->
-- `embedding_gemini`, vector(384) -> vector(1536), plus the
-- `embedding_gemini is not null` guard in every vector CTE (0058's one
-- documented deviation). The trigram CTEs are byte-for-byte the local ones.

create or replace function match_chunks_combined_gemini(
  query_embedding vector(1536),
  raw_query_embedding vector(1536) default null,
  query_text text default null,
  match_count int default 6,
  filter_document_id uuid default null,
  include_per_document boolean default false,
  per_document_limit int default 20
)
returns table (
  source text,
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
  with primary_pool as (
    select greatest(match_count * 6, 80) as n
  ),
  per_doc_pool as (
    select greatest(
      per_document_limit * (select count(*) from documents where status = 'ready') * 5,
      800
    ) as n
  ),
  query_words as (
    select word
    from unnest(string_to_array(lower(btrim(coalesce(query_text, ''))), ' ')) as word
    where length(word) >= 3
  ),
  trgm_scored as (
    select
      c.id,
      max(word_similarity(az_unaccent(qw.word), c.content_unaccented)) as trgm_score
    from chunks c
    join documents d on d.id = c.document_id
    cross join query_words qw
    where query_text is not null
      and btrim(query_text) <> ''
      and d.status = 'ready'
      and (filter_document_id is null or d.id = filter_document_id)
    group by c.id
    having max(word_similarity(az_unaccent(qw.word), c.content_unaccented)) >= 0.3
  ),
  trgm_ranked as (
    select trgm_scored.id, row_number() over (order by trgm_scored.trgm_score desc)::int as trgm_rank
    from trgm_scored
  ),
  primary_trgm as (
    select tr.id, tr.trgm_rank from trgm_ranked tr
    order by tr.trgm_rank
    limit (select n from primary_pool)
  ),
  per_doc_trgm as (
    select tr.id, tr.trgm_rank from trgm_ranked tr
    order by tr.trgm_rank
    limit (select n from per_doc_pool)
  ),
  primary_vec as (
    select
      c.id,
      row_number() over (order by c.embedding_gemini <=> query_embedding)::int as vector_rank
    from chunks c
    join documents d on d.id = c.document_id
    where d.status = 'ready'
      and c.embedding_gemini is not null
      and (filter_document_id is null or d.id = filter_document_id)
    order by c.embedding_gemini <=> query_embedding
    limit (select n from primary_pool)
  ),
  raw_vec as (
    select
      c.id,
      row_number() over (order by c.embedding_gemini <=> raw_query_embedding)::int as vector_rank
    from chunks c
    join documents d on d.id = c.document_id
    where raw_query_embedding is not null
      and d.status = 'ready'
      and c.embedding_gemini is not null
      and (filter_document_id is null or d.id = filter_document_id)
    order by c.embedding_gemini <=> raw_query_embedding
    limit (select n from primary_pool)
  ),
  per_doc_vec as (
    select
      c.id,
      row_number() over (order by c.dist)::int as vector_rank
    from (
      select
        c.id,
        c.embedding_gemini <=> query_embedding as dist
      from chunks c
      join documents d on d.id = c.document_id
      where include_per_document
        and d.status = 'ready'
        and c.embedding_gemini is not null
      order by c.embedding_gemini <=> query_embedding
      limit (select n from per_doc_pool)
    ) c
  ),
  primary_combined as (
    select
      coalesce(v.id, t.id) as id,
      v.vector_rank,
      t.trgm_rank,
      coalesce(1.0 / (60 + v.vector_rank), 0) + coalesce(2.0 / (60 + t.trgm_rank), 0) as combined_score
    from primary_vec v
    full outer join primary_trgm t on t.id = v.id
  ),
  raw_combined as (
    select
      coalesce(v.id, t.id) as id,
      v.vector_rank,
      t.trgm_rank,
      coalesce(1.0 / (60 + v.vector_rank), 0) + coalesce(2.0 / (60 + t.trgm_rank), 0) as combined_score
    from raw_vec v
    full outer join primary_trgm t on t.id = v.id
    where raw_query_embedding is not null
  ),
  per_doc_combined as (
    select
      coalesce(v.id, t.id) as id,
      v.vector_rank,
      t.trgm_rank,
      coalesce(1.0 / (60 + v.vector_rank), 0) + coalesce(2.0 / (60 + t.trgm_rank), 0) as combined_score
    from per_doc_vec v
    full outer join per_doc_trgm t on t.id = v.id
    where include_per_document
  ),
  primary_rows as (
    select
      'primary'::text as source,
      c.id, c.content, c.page_number, c.article_label,
      d.id as document_id, d.title as document_title,
      1 - (c.embedding_gemini <=> query_embedding) as similarity,
      pc.vector_rank, pc.trgm_rank, pc.combined_score
    from primary_combined pc
    join chunks c on c.id = pc.id
    join documents d on d.id = c.document_id
    where pc.trgm_rank is not null
       or (1 - (c.embedding_gemini <=> query_embedding)) >= 0.4
    order by pc.combined_score desc
    limit match_count
  ),
  raw_rows as (
    select
      'raw'::text as source,
      c.id, c.content, c.page_number, c.article_label,
      d.id as document_id, d.title as document_title,
      1 - (c.embedding_gemini <=> raw_query_embedding) as similarity,
      rc.vector_rank, rc.trgm_rank, rc.combined_score
    from raw_combined rc
    join chunks c on c.id = rc.id
    join documents d on d.id = c.document_id
    where rc.trgm_rank is not null
       or (1 - (c.embedding_gemini <=> raw_query_embedding)) >= 0.4
    order by rc.combined_score desc
    limit match_count
  ),
  per_doc_scored as (
    select
      c.id, c.content, c.page_number, c.article_label,
      d.id as document_id, d.title as document_title,
      1 - (c.embedding_gemini <=> query_embedding) as similarity,
      pdc.vector_rank, pdc.trgm_rank, pdc.combined_score,
      row_number() over (partition by d.id order by pdc.combined_score desc)::int as doc_rank
    from per_doc_combined pdc
    join chunks c on c.id = pdc.id
    join documents d on d.id = c.document_id
    where pdc.trgm_rank is not null
       or (1 - (c.embedding_gemini <=> query_embedding)) >= 0.4
  ),
  per_doc_rows as (
    select
      'per_document'::text as source,
      s.id, s.content, s.page_number, s.article_label,
      s.document_id, s.document_title, s.similarity,
      s.vector_rank, s.trgm_rank, s.combined_score
    from per_doc_scored s
    where s.doc_rank <= per_document_limit
  )
  -- Postgres only allows bare result-column names in a UNION's ORDER BY, not
  -- expressions — wrap the union in a subquery so the CASE ordering is legal.
  select u.*
  from (
    select * from primary_rows
    union all
    select * from raw_rows
    union all
    select * from per_doc_rows
  ) u
  order by
    case u.source when 'primary' then 0 when 'raw' then 1 else 2 end,
    u.combined_score desc;
$$;
