-- Emergency revert of 0034. Live testing after applying 0034 showed chat
-- requests now failing outright with Postgres error 57014 ("canceling
-- statement due to statement timeout") -- worse than the ~7-17s the
-- unindexed word_similarity() scan cost before, which was slow but always
-- completed. The `<%` operator + transaction-local
-- pg_trgm.word_similarity_threshold GUC change in 0034 produced a query plan
-- that hits Supabase's statement_timeout entirely for at least some
-- real-world free-text queries, rather than the intended speedup.
--
-- Root cause of the regression is not yet diagnosed (no live EXPLAIN ANALYZE
-- was available when 0034 was written or reverted here, per 0031/0033's
-- documented access-path constraint -- PostgREST/RPC only, no raw Postgres
-- connection). Suspects for a follow-up investigation, not yet confirmed:
-- (a) the planner may not choose a Nested-Loop-with-Bitmap-Index-Scan plan
-- driven by the small query_words side against chunks_content_trgm_idx as
-- intended, instead falling back to a full/expensive scan while ALSO paying
-- GIN index overhead on top; (b) common short Azerbaijani words may have
-- large trigram posting lists in the GIN index, making an index probe no
-- cheaper than a sequential scan for those specific words; (c) stale table
-- statistics (no ANALYZE run after 0034/0014's index changes) may be
-- misleading the planner's cost estimates. Do not re-attempt the `<%`
-- operator fix without first getting a real EXPLAIN (ANALYZE, BUFFERS) plan
-- for a representative failing query -- guessing produced this regression.
--
-- This migration restores match_chunks_per_document and match_chunks to
-- their exact pre-0034 bodies (0030's version and 0022/0027's version,
-- respectively): unindexed `word_similarity(qw.word, lower(c.content)) >=
-- 0.3` join condition, no set_config call. Slow (confirmed ~7-17s
-- previously) but known to complete rather than time out. Both functions
-- keep their existing signatures, so create-or-replace is safe without a
-- preceding drop.

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
        max(word_similarity(qw.word, lower(c.content))) as trgm_score
      from chunks c
      join documents d on d.id = c.document_id
      join query_words qw on word_similarity(qw.word, lower(c.content)) >= 0.3
      where query_text is not null
        and btrim(query_text) <> ''
        and d.status = 'ready'
      group by c.id
    ) scored
    order by trgm_score desc
    limit (select n from candidate_pool)
  ),
  combined as (
    select
      coalesce(v.id, t.id) as id,
      v.vector_rank,
      t.trgm_rank,
      coalesce(1.0 / (60 + v.vector_rank), 0) + coalesce(1.0 / (60 + t.trgm_rank), 0) as combined_score
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
        max(word_similarity(qw.word, lower(c.content))) as trgm_score
      from chunks c
      join documents d on d.id = c.document_id
      join query_words qw on word_similarity(qw.word, lower(c.content)) >= 0.3
      where query_text is not null
        and btrim(query_text) <> ''
        and d.status = 'ready'
        and (filter_document_id is null or d.id = filter_document_id)
        and (filter_document_ids is null or d.id = any(filter_document_ids))
      group by c.id
    ) scored
    order by trgm_score desc
    limit (select n from candidate_pool)
  ),
  combined as (
    select
      coalesce(v.id, t.id) as id,
      v.vector_rank,
      t.trgm_rank,
      coalesce(1.0 / (60 + v.vector_rank), 0) + coalesce(1.0 / (60 + t.trgm_rank), 0) as combined_score
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
