-- Fixes a recall gap found via a live repro: query "qırmızı işıqda keçməyin
-- cəriməsi nədi?" never surfaced the correct chunk (İnzibati Xətalar
-- Məcəlləsi, Maddə 327.2, 80 manat fine). Root cause: match_chunks (0014)
-- caps BOTH the vector-similarity candidate list and the trigram candidate
-- list to candidate_pool.n = greatest(match_count * 4, 40) = 60 (at the
-- current default matchCount = 15 passed from
-- lib/retrieval/search.ts) BEFORE combined-score (RRF) ranking happens. The
-- correct chunk ranked 112th by vector similarity and 89th by trigram score
-- for this query, so it never entered either candidate pool -- no amount of
-- raising the final match_count param can rescue a chunk excluded upstream
-- of ranking.
--
-- This is a genuine cross-document vocabulary gap: the offence-code
-- document's legalistic phrasing shares almost no vocabulary with either
-- the colloquial query or the Road Traffic Rules document's Maddə 59
-- (which defines what a red light *means*, ranks top, and has no fine
-- amount) -- a common query pattern for this app, since the traffic rules
-- and the offence code are separate documents with non-overlapping
-- vocabulary for "what is this rule" vs. "what is the penalty for breaking
-- it". lib/rag/rewriteQuery.ts's REWRITE_PROMPT was extended alongside this
-- migration to push penalty-style queries toward offence-code vocabulary at
-- the embedding stage, but widening the candidate pool here is a
-- complementary, corpus-scale-appropriate safety margin: the corpus is
-- still small (~350-1000 rows per 0008/0014's own sizing notes), so a wider
-- sequential/GIN candidate scan is cheap, and doubling the floor gives
-- cross-document matches meaningfully more room to enter the pool before
-- RRF ranking. Revisit this constant (or move to a smarter per-document
-- diversity-aware retrieval strategy) if/when the corpus grows enough that
-- widening the pool becomes a real cost.
--
-- Also drops the function-level `set pg_trgm.word_similarity_threshold = 0.3`
-- clause 0014 relied on: Supabase's managed `postgres` role doesn't have
-- permission to set that GUC ("permission denied to set parameter"), even
-- though it owns the function. The `<%` operator (which reads that GUC
-- implicitly) is replaced below with an explicit `word_similarity(...) >= 0.3`
-- comparison -- same 0.3 threshold, no GUC involved. This forgoes the GIN
-- index assist `<%` got from chunks_content_trgm_idx, but the query-words x
-- chunks cross product it's replaced with is cheap at this corpus's current
-- size (~350-1000 chunks, single-digit query words).
create or replace function match_chunks(
  query_embedding vector(384),
  match_count int default 6,
  filter_document_id uuid default null,
  query_text text default null
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
