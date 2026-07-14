-- Performance phase 4 (final step): replaces the unindexed
-- word_similarity(...) >= 0.3 trgm join condition in match_chunks_per_document
-- (0025, perf-patched by 0030) and match_chunks (0014/0018/0022) with the
-- indexed `<%` operator, now that 0033's live test confirmed
-- set_config('pg_trgm.word_similarity_threshold', '0.3', true) (SQL-level
-- `SET LOCAL`, is_local = true) succeeds against Supabase's managed
-- `postgres` role where a plain session-level SET / a function-level SET
-- clause did not (see 0014/0018/0030's comments for that original failure).
-- `<%` reads pg_trgm.word_similarity_threshold from the GUC implicitly, so
-- setting it transaction-locally at the top of each function body, before
-- the trgm CTE runs, makes `<%` usable and lets chunks_content_trgm_idx (the
-- GIN trigram index from 0014) actually accelerate the join via a bitmap
-- index scan, instead of the full unindexed comparison every ready chunk was
-- getting scored against on every request. set_config(..., true) is
-- transaction-scoped by definition, so it does not leak session-wide and
-- needs no cleanup/reset afterward.
--
-- Both functions are `language sql stable` (not plpgsql), so `perform` isn't
-- available -- `select set_config(...)` as the first statement in the SQL
-- function body has the same effect: it executes for its side effect and its
-- result is discarded because it isn't the body's last statement, which is
-- standard behavior for multi-statement SQL-language functions.
--
-- Ranking/scoring semantics are unchanged in both functions: the `<%` swap
-- only changes what rows survive the join filter (index-assisted, same 0.3
-- threshold as before) -- `max(word_similarity(...))` is still computed per
-- chunk afterward for trgm_score/trgm_rank exactly as before, so recall and
-- ranking behavior should not regress, only the filtering mechanism's cost.
--
-- match_chunks_by_article (0032) needs no change: confirmed by inspection --
-- it's a separate article_label prefix-match path (`c.article_label like
-- p.prefix`) with no trigram/word_similarity involvement anywhere in it.
--
-- Also drops 0033's test_trgm_guc_local() -- a throwaway diagnostic function,
-- per its own header comment, not referenced by any application code path.

drop function if exists test_trgm_guc_local();

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
        c.id,
        max(word_similarity(qw.word, lower(c.content))) as trgm_score
      from chunks c
      join documents d on d.id = c.document_id
      join query_words qw on qw.word <% lower(c.content)
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
        c.id,
        max(word_similarity(qw.word, lower(c.content))) as trgm_score
      from chunks c
      join documents d on d.id = c.document_id
      join query_words qw on qw.word <% lower(c.content)
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
