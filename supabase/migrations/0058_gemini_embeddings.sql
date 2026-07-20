-- Second, toggleable embedding provider (Google Gemini
-- `gemini-embedding-001`, outputDimensionality=1536) alongside the existing
-- in-process local model (Xenova/multilingual-e5-small, 384-dim).
--
-- WHY A SEPARATE COLUMN AND SEPARATE FUNCTIONS, not a reuse of `embedding`:
-- different embedding models produce mutually INCOMPATIBLE vector spaces. A
-- Gemini query vector cannot be meaningfully compared against an e5-small
-- chunk vector even if the dimensions happened to match -- cosine distance
-- between them is noise. Keeping BOTH columns populated for every chunk means
-- switching providers is an instant app_settings flip, not a 15-minute
-- corpus-wide re-embed during which retrieval is broken (queries in one
-- vector space, chunks in another -- a failure mode this project has already
-- hit once).
--
-- WHY 1536 AND NOT 3072: gemini-embedding-001 can emit up to 3072 dims, but
-- pgvector's hnsw/ivfflat indexes cap at 2000 dims -- a 3072-dim column could
-- never be indexed if this corpus later needs it. 1536 is the largest
-- Matryoshka truncation that stays indexable, with negligible quality loss.
--
-- Nullable by design: existing rows start null and are filled by
-- scripts/backfill-gemini-embeddings.mjs. The admin toggle
-- (app/admin/users/embeddingActions.ts) REFUSES to switch to 'gemini' while
-- coverage is below 100%, so a partially-backfilled corpus can never be
-- selected.
alter table chunks add column if not exists embedding_gemini vector(1536);

-- NO VECTOR INDEX IS CREATED HERE, AND THAT IS DELIBERATE -- it mirrors the
-- live state of the `embedding` column, which has no vector index either.
-- 0001 created `chunks_embedding_idx` (ivfflat, lists=100) and 0008 DROPPED
-- it outright rather than retuning it, because at this corpus size an
-- approximate index actively hurt recall (near-empty partitions +
-- ivfflat.probes=1 returned 0-1 wrong rows for short queries) while a
-- sequential scan was already fast enough. Note that 0030's header comment
-- still speaks of "restoring the ivfflat KNN path" -- that comment is stale;
-- no index has existed since 0008. Adding an hnsw index to embedding_gemini
-- ALONE would also make the two providers behave differently in kind
-- (approximate vs exact nearest-neighbour), so a provider toggle would change
-- recall for reasons unrelated to the embedding model -- exactly the sort of
-- confound that makes an A/B comparison useless.
--
-- Revisit when the corpus grows well past its current ~2009 chunks, and when
-- you do, index BOTH columns together in one migration:
--   create index chunks_embedding_hnsw_idx on chunks
--     using hnsw (embedding vector_cosine_ops);
--   create index chunks_embedding_gemini_hnsw_idx on chunks
--     using hnsw (embedding_gemini vector_cosine_ops);
-- Note that the 1536-dim column is ~4x the bytes per row of the 384-dim one,
-- so it reaches "sequential scan is too expensive" sooner than `embedding`
-- does.

-- The three functions below are exact mirrors of the CURRENT LIVE versions --
-- match_chunks/match_chunks_per_document as last replaced by 0057, and
-- match_chunks_by_article as created by 0032 -- with ONLY two changes:
--   * `c.embedding`      -> `c.embedding_gemini`
--   * `vector(384)`      -> `vector(1536)`
-- Everything else is byte-for-byte identical, specifically including the two
-- fixes applied in 0056 and 0057, which MUST NOT regress here:
--   (a) 0056: the RRF trigram term is weighted 2.0, not 1.0 --
--       `coalesce(1.0/(60+v.vector_rank),0) + coalesce(2.0/(60+t.trgm_rank),0)`
--   (b) 0057: BOTH sides of every word_similarity() call are wrapped in
--       az_unaccent(), for diacritic-insensitive trigram matching.
-- az_unaccent() already exists (created in 0057) and is deliberately NOT
-- recreated here.
--
-- One intentional, documented deviation from a pure mirror: the vector-
-- ranking CTEs below add `and c.embedding_gemini is not null`. A null
-- embedding yields a null distance, which sorts last but still occupies a
-- slot in the bounded candidate pool -- pure noise. match_chunks_by_article
-- does NOT get this filter, because its inclusion criterion is the article
-- label (the embedding is only a within-article tie-break, per 0032's
-- comment) and filtering there would silently drop legitimate article hits.

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
        max(word_similarity(az_unaccent(qw.word), az_unaccent(lower(c.content)))) as trgm_score
      from chunks c
      join documents d on d.id = c.document_id
      join query_words qw on word_similarity(az_unaccent(qw.word), az_unaccent(lower(c.content))) >= 0.3
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
        max(word_similarity(az_unaccent(qw.word), az_unaccent(lower(c.content)))) as trgm_score
      from chunks c
      join documents d on d.id = c.document_id
      join query_words qw on word_similarity(az_unaccent(qw.word), az_unaccent(lower(c.content))) >= 0.3
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

create or replace function match_chunks_by_article_gemini(
  query_embedding vector(1536),
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
      1 - (c.embedding_gemini <=> query_embedding) as similarity,
      row_number() over (
        partition by d.id
        order by c.embedding_gemini <=> query_embedding
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

-- New admin-configurable setting, same app_settings key-value convention as
-- chat_message_price/daily_quiz_reward/ad_watch_reward -- no seed row
-- inserted; lib/embeddings/activeModel.ts hardcodes the TS-side default when
-- no row exists yet, and fails open to it on any read error.
--   active_embedding_model  -- jsonb string, 'local' | 'gemini', default
--                              'local'. 'local' is the current live behaviour
--                              and must remain a strict no-op until an admin
--                              explicitly flips this, which they can only do
--                              once embedding_gemini coverage reaches 100%
--                              (enforced server-side in
--                              app/admin/users/embeddingActions.ts).
-- app_settings already has RLS enabled with no policies (0024), i.e. it is
-- service-role-only -- this key needs no new policy.
