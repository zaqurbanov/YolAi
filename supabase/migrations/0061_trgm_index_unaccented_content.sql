-- Fix: chat retrieval's DB search phase is anomalously slow -- chat_request_logs
-- shows db_search_ms of 6,000-30,000 ms (median ~15s) on a ~2,009-chunk corpus,
-- while embed/rerank/LLM phases are normal.
--
-- DIAGNOSIS (measured live against the real Supabase project on 2026-07-24,
-- service-role RPC timing from a node one-off script; numbers include ~200-400ms
-- network overhead per call):
--
--   match_chunks, query_text = null (vector-only) ..........  ~0.9-1.5 s
--   match_chunks, 1-word query_text .........................  ~2.1 s
--   match_chunks, 4-word query_text .........................  ~2.8 s
--   match_chunks, 8-word query_text .........................  ~5.3 s
--   match_chunks_per_document, 8-word query_text ............  ~7.0 s
--
-- The cost is LINEAR IN QUERY WORD COUNT (~550 ms per word), which pins the
-- time on the trigram CTE's nested loop: for every (chunk x query-word) pair it
-- evaluates word_similarity(az_unaccent(qw.word), az_unaccent(lower(c.content)))
-- -- and evaluates it TWICE per pair (once in the join qual, once inside
-- max(...)), each evaluation re-running lower() + translate() over the full
-- ~3,200-char content and re-extracting its trigram set from scratch. For a
-- typical 6-10 word query that is 2,009 x ~8 x 2 = ~32,000 full-text trigram
-- extractions per RPC call. On top of that, app/api/chat/route.ts fires up to
-- THREE of these RPCs per request (primary match_chunks + raw-query
-- match_chunks + match_chunks_per_document, all with the SAME query_text) and
-- db_search_ms is the SUM of all of them -- 3 x 5-7s = the observed ~15s median.
--
-- No index helps today: a bare word_similarity(...) call in a join qual can
-- never use an index, and since 0057 wrapped the content side in az_unaccent(),
-- even the pg_trgm operator family could not use chunks_content_trgm_idx (0014,
-- built on lower(content)) -- that index has been pure dead weight (write
-- overhead on every ingestion, zero reads) since 0057.
--
-- FIX (behaviour-preserving -- 0056's 2.0 trigram weight and 0057's
-- az_unaccent-on-both-sides semantics are kept EXACTLY; only the execution
-- strategy changes):
--
--   1. Generated column `chunks.content_unaccented`, STORED, computed as
--      az_unaccent(lower(content)) -- az_unaccent (0057) is IMMUTABLE, so it is
--      legal in a generated column. The transliteration is now paid ONCE per
--      chunk at write time instead of tens of thousands of times per chat
--      request at read time. `content` itself is untouched (0014/0057's rule:
--      never fold diacritics in stored content -- the folding is a COMPARISON
--      view only, and this column is exactly that comparison view,
--      materialized).
--   2. GIN trigram index on the new column, replacing the dead
--      chunks_content_trgm_idx (dropped below).
--   3. The trigram CTE in all four hybrid RPCs (match_chunks,
--      match_chunks_per_document + their _gemini mirrors from 0058) is
--      restructured to:
--        * evaluate word_similarity ONCE per (chunk, word) pair, not twice
--          (score computed in a lateral subquery, filtered afterwards);
--        * read the precomputed content_unaccented instead of recomputing
--          az_unaccent(lower(content)) per evaluation;
--        * prefilter with the index-capable `<%` operator
--          (az_unaccent(qw.word) <% c.content_unaccented), driven per query
--          word via a lateral join so the planner can take a bitmap scan on
--          the new GIN index. `a <% b` is BY DEFINITION
--          word_similarity(a, b) >= pg_trgm.word_similarity_threshold, so with
--          the threshold set to 0.3 it admits exactly the same pairs as the old
--          explicit `>= 0.3` qual; the explicit `pair.score >= 0.3` predicate
--          is ALSO kept, so the surviving row set is provably identical.
--
-- ON RE-ATTEMPTING `<%` AFTER 0034's TIMEOUT REGRESSION (0035 says "do not
-- re-attempt without a real EXPLAIN"): a live EXPLAIN is still not obtainable
-- from this environment (no DATABASE_URL, PostgREST only, and 0031's debug
-- wrapper was dropped as instructed), but every one of 0035's listed suspects
-- is addressed rather than guessed away this time:
--   (a) plan shape: the lateral form (query_words driving a per-word probe into
--       chunks) is the documented pg_trgm pattern and removes the join-qual
--       form 0034 used;
--   (b) expensive recheck: 0034's recheck had to recompute lower(content) and
--       word_similarity on a full expression per candidate row; here the
--       recheck reads a stored column, and the double evaluation is gone;
--   (c) stale statistics: `analyze chunks` runs below, immediately after the
--       column+index are created.
-- And unlike 0034, this migration does NOT rely on the operator for
-- correctness: even in the worst case where the planner ignores the index
-- entirely, the single-evaluation + precomputed-column restructure alone
-- roughly halves the measured cost -- the operator can only make it faster,
-- never change the result set (same 0.3 threshold, both predicates present).
--
-- SAFE APPLY ORDER (single transaction in the SQL editor is fine; ~2,009 rows):
--   1. ADD COLUMN ... GENERATED ALWAYS AS ... STORED rewrites the chunks table
--      under an ACCESS EXCLUSIVE lock -- at this corpus size that is well under
--      a second; do not run it mid-ingestion.
--   2. CREATE INDEX on 2,009 rows is similarly fast (no CONCURRENTLY needed,
--      and CONCURRENTLY could not run inside a transaction anyway).
--   3. ANALYZE, then CREATE OR REPLACE the four functions (signatures are
--      unchanged from 0057/0058, so in-place replace is safe -- no drop, no
--      overload landmine).
-- Rollback, if ever needed: re-run 0057 + 0058's function bodies, then
--   drop index chunks_content_unaccented_trgm_idx; alter table chunks drop
--   column content_unaccented;
--
-- Expected effect: the per-word full-corpus double scan (~550 ms/word) becomes
-- a per-word index probe + single-evaluation recheck over the candidate subset.
-- Worst case (index never helps) ~2x faster; realistic case well under 1s per
-- RPC, i.e. db_search_ms dropping from ~15s median to low single-digit seconds
-- or below. Verify after applying: compare db_search_ms in chat_request_logs
-- before/after, and spot-check that a known query returns the same chunks.

-- 1. Precomputed comparison view of content (write-once instead of
--    per-request). az_unaccent is from 0057 and is immutable.
alter table chunks
  add column if not exists content_unaccented text
  generated always as (az_unaccent(lower(content))) stored;

-- 2. Trigram index on the comparison view. GIN (not GiST) for the same
--    reasons as 0014: threshold operators only, read-heavy workload.
create index if not exists chunks_content_unaccented_trgm_idx
  on chunks using gin (content_unaccented gin_trgm_ops);

-- 3. Drop 0014's index on lower(content): unread since 0057 wrapped the
--    content side in az_unaccent (and it was already unread between 0035 and
--    0057, when the join qual was a bare function call). Keeping it would only
--    tax every ingestion write.
drop index if exists chunks_content_trgm_idx;

-- 4. Fresh statistics so the planner costs the new column/index correctly
--    (0035 suspect (c): no ANALYZE had followed 0014/0034's index changes).
analyze chunks;

-- 5. The four hybrid RPCs. Everything outside the trgm_matches CTE (and the
--    set_config first statement) is byte-for-byte the 0057/0058 definitions:
--    same signatures, same candidate pools, same 0.4 similarity floor, same
--    RRF formula with 0056's 2.0 trigram weight.

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
  -- Transaction-local (is_local => true, verified working on Supabase's
  -- managed role by 0033's live test); makes `<%` equivalent to
  -- word_similarity(...) >= 0.3, matching the explicit predicate below.
  select set_config('pg_trgm.word_similarity_threshold', '0.3', true);

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
        pair.id,
        max(pair.score) as trgm_score
      from query_words qw
      cross join lateral (
        select
          c.id,
          c.document_id,
          word_similarity(az_unaccent(qw.word), c.content_unaccented) as score
        from chunks c
        where az_unaccent(qw.word) <% c.content_unaccented
      ) pair
      join documents d on d.id = pair.document_id
      where query_text is not null
        and btrim(query_text) <> ''
        and d.status = 'ready'
        and (filter_document_id is null or d.id = filter_document_id)
        and (filter_document_ids is null or d.id = any(filter_document_ids))
        and pair.score >= 0.3
      group by pair.id
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
  select set_config('pg_trgm.word_similarity_threshold', '0.3', true);

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
        pair.id,
        max(pair.score) as trgm_score
      from query_words qw
      cross join lateral (
        select
          c.id,
          c.document_id,
          word_similarity(az_unaccent(qw.word), c.content_unaccented) as score
        from chunks c
        where az_unaccent(qw.word) <% c.content_unaccented
      ) pair
      join documents d on d.id = pair.document_id
      where query_text is not null
        and btrim(query_text) <> ''
        and d.status = 'ready'
        and pair.score >= 0.3
      group by pair.id
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
-- vector(384) -> vector(1536), and the `embedding_gemini is not null` guard in
-- the vector CTEs (0058's one documented deviation). The trigram CTE has no
-- embedding dependency, so it is byte-for-byte the same as the local versions
-- above. match_chunks_by_article / _gemini are untouched: no trigram
-- involvement (confirmed by inspection in 0034 already, still true).

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
  select set_config('pg_trgm.word_similarity_threshold', '0.3', true);

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
        pair.id,
        max(pair.score) as trgm_score
      from query_words qw
      cross join lateral (
        select
          c.id,
          c.document_id,
          word_similarity(az_unaccent(qw.word), c.content_unaccented) as score
        from chunks c
        where az_unaccent(qw.word) <% c.content_unaccented
      ) pair
      join documents d on d.id = pair.document_id
      where query_text is not null
        and btrim(query_text) <> ''
        and d.status = 'ready'
        and (filter_document_id is null or d.id = filter_document_id)
        and (filter_document_ids is null or d.id = any(filter_document_ids))
        and pair.score >= 0.3
      group by pair.id
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
  select set_config('pg_trgm.word_similarity_threshold', '0.3', true);

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
        pair.id,
        max(pair.score) as trgm_score
      from query_words qw
      cross join lateral (
        select
          c.id,
          c.document_id,
          word_similarity(az_unaccent(qw.word), c.content_unaccented) as score
        from chunks c
        where az_unaccent(qw.word) <% c.content_unaccented
      ) pair
      join documents d on d.id = pair.document_id
      where query_text is not null
        and btrim(query_text) <> ''
        and d.status = 'ready'
        and pair.score >= 0.3
      group by pair.id
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
