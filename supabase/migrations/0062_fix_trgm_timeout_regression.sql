-- EMERGENCY FIX for 0061's regression. Apply immediately -- /api/chat is
-- currently returning 500 (Postgres 57014 "canceling statement due to
-- statement timeout") on every message with a text query.
--
-- WHAT 0061 GOT WRONG (post-mortem, measured live 2026-07-24 with the
-- service-role client immediately after the user applied 0061):
--
--   match_chunks, query_text = null ............  ~0.4 s   (fine)
--   match_chunks, 1-word query .................  8.6 s -> 57014 TIMEOUT
--   match_chunks, 2/4/8-word query .............  8.3-9.3 s -> 57014 TIMEOUT
--   match_chunks_per_document, 8-word query ....  6.0 s   (completed, barely)
--
-- Compare pre-0061 (same corpus, same day): 1 word ~2.1s, 8 words ~5.3s.
-- 0061's `az_unaccent(qw.word) <% c.content_unaccented` lateral prefilter --
-- the bet that the GIN trigram index would prune the scan -- made the 1-WORD
-- case FOUR TIMES SLOWER, which is exactly 0034's `<%` timeout regression
-- repeated (0035 warned "do not re-attempt without a real EXPLAIN"; 0061
-- argued its restructure addressed 0035's suspects, and that argument was
-- WRONG). Without a live EXPLAIN the precise plan is still unproven, but the
-- word-count-independent ~8-9s wall strongly matches 0035 suspect (b): short
-- Azerbaijani query words share their trigrams with most of the corpus, so at
-- threshold 0.3 the GIN bitmap admits nearly every row and the lossy recheck
-- re-runs word_similarity on ~all 2,009 rows anyway -- all the old work PLUS
-- index probe/bitmap overhead, now above the ~8s statement_timeout that
-- applies to PostgREST roles (service_role included). 0061's fallback claim
-- ("worst case the planner ignores the index") was the specific error: the
-- planner does NOT ignore an index that looks selective to it; it uses it and
-- loses.
--
-- WHAT THIS MIGRATION DOES: restores the proven indexless sequential form for
-- the trigram CTE in all four hybrid RPCs, with two strictly-safe savings kept
-- from 0061's analysis (neither involves any operator or index, so the
-- executor has no pathological plan available -- this is the same plan class
-- as 0057, which always completed):
--
--   1. Read the precomputed `content_unaccented` generated column instead of
--      recomputing az_unaccent(lower(content)) per evaluation. The column is
--      confirmed live as created and fully populated by 0061 (generated STORED
--      columns are backfilled atomically at ADD COLUMN; spot-verified via
--      PostgREST). Values are BY DEFINITION identical to the 0057 expression.
--   2. Evaluate word_similarity ONCE per (chunk, word) pair instead of twice:
--      0057's `join ... on word_similarity(...) >= 0.3` + `max(word_similarity
--      (...))` evaluated the same expression in both the join qual and the
--      aggregate. Replaced with a plain cross join + `group by c.id having
--      max(word_similarity(...)) >= 0.3`. Equivalence proof: 0057 kept chunks
--      having at least one word with similarity >= 0.3, scored by the max over
--      qualifying words -- which equals the max over ALL words whenever any
--      word qualifies. The having-form keeps chunks whose max over all words
--      is >= 0.3 (the same set) scored by that same max (the same score).
--      Identical rows, identical trgm_score, identical ranks. The aggregate
--      expression appears once, so word_similarity runs once per pair.
--
-- Ranking semantics are otherwise byte-for-byte 0057/0058: 0056's 2.0 trigram
-- RRF weight, az_unaccent on both comparison sides, 0.3 threshold, 0.4
-- similarity floor, candidate pools, signatures -- all unchanged. No
-- set_config, no `<%`, anywhere.
--
-- The generated column stays (it is the whole savings #1). The GIN index
-- chunks_content_unaccented_trgm_idx from 0061 also stays: it is never read
-- by these definitions, costs only ingestion-time writes, and keeping it
-- preserves the option of a future, EXPLAIN-verified indexed attempt. If you
-- prefer to reclaim it now:  drop index chunks_content_unaccented_trgm_idx;
--
-- Expected timing vs 0057's known-working baseline (~550 ms per query word,
-- double-eval on a computed expression): roughly half -- comfortably under
-- the statement timeout that 0057 itself was already brushing against.
--
-- LESSON RECORDED for any future rewrite of these functions: two live
-- attempts (0034, 0061) have now shown that pg_trgm's `<%` GIN path is
-- SLOWER than the sequential scan on this corpus/wordload. Do not try it a
-- third time without a real EXPLAIN (ANALYZE, BUFFERS) from the Supabase SQL
-- editor showing the actual plan. The remaining honest speedup levers are
-- app-side: the chat route fires up to three of these RPCs per request with
-- the same query_text and sums them into db_search_ms -- consolidating the
-- shared trigram ranking into one call is a ~3x lever that needs no planner
-- gamble.

create or replace function match_chunks(
  query_embedding vector(384),
  match_count int default 6,
  filter_document_id uuid default null,
  query_text text default null,
  filter_document_ids uuid[] default null
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
  with candidate_pool as (
    select greatest(match_count * 6, 80) as n
  ),
  vector_matches as (
    select
      c.id,
      row_number() over (order by c.embedding <=> query_embedding)::int as vector_rank
    from chunks c
    join documents d on d.id = c.document_id
    where d.status = 'ready'
      and (filter_document_id is null or d.id = filter_document_id)
      and (filter_document_ids is null or d.id = any(filter_document_ids))
    order by c.embedding <=> query_embedding
    limit (select n from candidate_pool)
  ),
  query_words as (
    select word
    from unnest(string_to_array(lower(btrim(coalesce(query_text, ''))), ' ')) as word
    where length(word) >= 3
  ),
  trgm_matches as (
    select
      id,
      row_number() over (order by trgm_score desc)::int as trgm_rank
    from (
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
        and (filter_document_ids is null or d.id = any(filter_document_ids))
      group by c.id
      having max(word_similarity(az_unaccent(qw.word), c.content_unaccented)) >= 0.3
    ) scored
    order by trgm_score desc
    limit (select n from candidate_pool)
  ),
  combined as (
    select
      coalesce(v.id, t.id) as id,
      v.vector_rank,
      t.trgm_rank,
      coalesce(1.0 / (60 + v.vector_rank), 0) + coalesce(2.0 / (60 + t.trgm_rank), 0) as combined_score
    from vector_matches v
    full outer join trgm_matches t on t.id = v.id
  )
  select
    c.id,
    c.content,
    c.page_number,
    c.article_label,
    d.id as document_id,
    d.title as document_title,
    1 - (c.embedding <=> query_embedding) as similarity,
    combined.vector_rank,
    combined.trgm_rank,
    combined.combined_score
  from combined
  join chunks c on c.id = combined.id
  join documents d on d.id = c.document_id
  where combined.trgm_rank is not null
     or (1 - (c.embedding <=> query_embedding)) >= 0.4
  order by combined.combined_score desc
  limit match_count;
$$;

create or replace function match_chunks_per_document(
  query_embedding vector(384),
  query_text text default null,
  per_document_limit int default 20
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
  with candidate_pool as (
    select greatest(
      per_document_limit * (select count(*) from documents where status = 'ready') * 5,
      800
    ) as n
  ),
  vector_matches as (
    select
      c.id,
      row_number() over (order by c.dist)::int as vector_rank
    from (
      select
        c.id,
        c.embedding <=> query_embedding as dist
      from chunks c
      join documents d on d.id = c.document_id
      where d.status = 'ready'
      order by c.embedding <=> query_embedding
      limit (select n from candidate_pool)
    ) c
  ),
  query_words as (
    select word
    from unnest(string_to_array(lower(btrim(coalesce(query_text, ''))), ' ')) as word
    where length(word) >= 3
  ),
  trgm_matches as (
    select
      id,
      row_number() over (order by trgm_score desc)::int as trgm_rank
    from (
      select
        c.id,
        max(word_similarity(az_unaccent(qw.word), c.content_unaccented)) as trgm_score
      from chunks c
      join documents d on d.id = c.document_id
      cross join query_words qw
      where query_text is not null
        and btrim(query_text) <> ''
        and d.status = 'ready'
      group by c.id
      having max(word_similarity(az_unaccent(qw.word), c.content_unaccented)) >= 0.3
    ) scored
    order by trgm_score desc
    limit (select n from candidate_pool)
  ),
  combined as (
    select
      coalesce(v.id, t.id) as id,
      v.vector_rank,
      t.trgm_rank,
      coalesce(1.0 / (60 + v.vector_rank), 0) + coalesce(2.0 / (60 + t.trgm_rank), 0) as combined_score
    from vector_matches v
    full outer join trgm_matches t on t.id = v.id
  ),
  scored_chunks as (
    select
      c.id,
      c.content,
      c.page_number,
      c.article_label,
      d.id as document_id,
      d.title as document_title,
      1 - (c.embedding <=> query_embedding) as similarity,
      combined.vector_rank,
      combined.trgm_rank,
      combined.combined_score,
      row_number() over (partition by d.id order by combined.combined_score desc)::int as doc_rank
    from combined
    join chunks c on c.id = combined.id
    join documents d on d.id = c.document_id
    where combined.trgm_rank is not null
       or (1 - (c.embedding <=> query_embedding)) >= 0.4
  )
  select id, content, page_number, article_label, document_id, document_title, similarity, vector_rank, trgm_rank, combined_score
  from scored_chunks
  where doc_rank <= per_document_limit
  order by combined_score desc;
$$;

-- _gemini mirrors (0058): identical except `embedding` -> `embedding_gemini`,
-- vector(384) -> vector(1536), plus the `embedding_gemini is not null` guard
-- in the vector CTEs (0058's one documented deviation). The trigram CTE is
-- byte-for-byte the same as the local versions above.
-- match_chunks_by_article / _gemini are untouched (no trigram involvement).

create or replace function match_chunks_gemini(
  query_embedding vector(1536),
  match_count int default 6,
  filter_document_id uuid default null,
  query_text text default null,
  filter_document_ids uuid[] default null
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
  with candidate_pool as (
    select greatest(match_count * 6, 80) as n
  ),
  vector_matches as (
    select
      c.id,
      row_number() over (order by c.embedding_gemini <=> query_embedding)::int as vector_rank
    from chunks c
    join documents d on d.id = c.document_id
    where d.status = 'ready'
      and c.embedding_gemini is not null
      and (filter_document_id is null or d.id = filter_document_id)
      and (filter_document_ids is null or d.id = any(filter_document_ids))
    order by c.embedding_gemini <=> query_embedding
    limit (select n from candidate_pool)
  ),
  query_words as (
    select word
    from unnest(string_to_array(lower(btrim(coalesce(query_text, ''))), ' ')) as word
    where length(word) >= 3
  ),
  trgm_matches as (
    select
      id,
      row_number() over (order by trgm_score desc)::int as trgm_rank
    from (
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
        and (filter_document_ids is null or d.id = any(filter_document_ids))
      group by c.id
      having max(word_similarity(az_unaccent(qw.word), c.content_unaccented)) >= 0.3
    ) scored
    order by trgm_score desc
    limit (select n from candidate_pool)
  ),
  combined as (
    select
      coalesce(v.id, t.id) as id,
      v.vector_rank,
      t.trgm_rank,
      coalesce(1.0 / (60 + v.vector_rank), 0) + coalesce(2.0 / (60 + t.trgm_rank), 0) as combined_score
    from vector_matches v
    full outer join trgm_matches t on t.id = v.id
  )
  select
    c.id,
    c.content,
    c.page_number,
    c.article_label,
    d.id as document_id,
    d.title as document_title,
    1 - (c.embedding_gemini <=> query_embedding) as similarity,
    combined.vector_rank,
    combined.trgm_rank,
    combined.combined_score
  from combined
  join chunks c on c.id = combined.id
  join documents d on d.id = c.document_id
  where combined.trgm_rank is not null
     or (1 - (c.embedding_gemini <=> query_embedding)) >= 0.4
  order by combined.combined_score desc
  limit match_count;
$$;

create or replace function match_chunks_per_document_gemini(
  query_embedding vector(1536),
  query_text text default null,
  per_document_limit int default 20
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
  with candidate_pool as (
    select greatest(
      per_document_limit * (select count(*) from documents where status = 'ready') * 5,
      800
    ) as n
  ),
  vector_matches as (
    select
      c.id,
      row_number() over (order by c.dist)::int as vector_rank
    from (
      select
        c.id,
        c.embedding_gemini <=> query_embedding as dist
      from chunks c
      join documents d on d.id = c.document_id
      where d.status = 'ready'
        and c.embedding_gemini is not null
      order by c.embedding_gemini <=> query_embedding
      limit (select n from candidate_pool)
    ) c
  ),
  query_words as (
    select word
    from unnest(string_to_array(lower(btrim(coalesce(query_text, ''))), ' ')) as word
    where length(word) >= 3
  ),
  trgm_matches as (
    select
      id,
      row_number() over (order by trgm_score desc)::int as trgm_rank
    from (
      select
        c.id,
        max(word_similarity(az_unaccent(qw.word), c.content_unaccented)) as trgm_score
      from chunks c
      join documents d on d.id = c.document_id
      cross join query_words qw
      where query_text is not null
        and btrim(query_text) <> ''
        and d.status = 'ready'
      group by c.id
      having max(word_similarity(az_unaccent(qw.word), c.content_unaccented)) >= 0.3
    ) scored
    order by trgm_score desc
    limit (select n from candidate_pool)
  ),
  combined as (
    select
      coalesce(v.id, t.id) as id,
      v.vector_rank,
      t.trgm_rank,
      coalesce(1.0 / (60 + v.vector_rank), 0) + coalesce(2.0 / (60 + t.trgm_rank), 0) as combined_score
    from vector_matches v
    full outer join trgm_matches t on t.id = v.id
  ),
  scored_chunks as (
    select
      c.id,
      c.content,
      c.page_number,
      c.article_label,
      d.id as document_id,
      d.title as document_title,
      1 - (c.embedding_gemini <=> query_embedding) as similarity,
      combined.vector_rank,
      combined.trgm_rank,
      combined.combined_score,
      row_number() over (partition by d.id order by combined.combined_score desc)::int as doc_rank
    from combined
    join chunks c on c.id = combined.id
    join documents d on d.id = c.document_id
    where combined.trgm_rank is not null
       or (1 - (c.embedding_gemini <=> query_embedding)) >= 0.4
  )
  select id, content, page_number, article_label, document_id, document_title, similarity, vector_rank, trgm_rank, combined_score
  from scored_chunks
  where doc_rank <= per_document_limit
  order by combined_score desc;
$$;
