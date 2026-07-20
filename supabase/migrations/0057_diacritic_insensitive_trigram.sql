-- Follow-up to 0056. Live testing after 0056 (real user query, no diacritics:
-- "elilliyi olan sexlerin yerinde masin saxlayib") showed the trigram-weight
-- boost alone wasn't enough: this chunk's trgm_rank was only 228 even with
-- the boost, and testing weight multipliers up to 10x only marginally
-- improved things (rank 198) with clearly diminishing returns -- confirming
-- the weight formula was the wrong lever for THIS failure mode.
--
-- Root cause: pg_trgm's word_similarity() is character-n-gram based (see
-- 0014's header comment for the mechanism). Swapping an Azerbaijani-specific
-- letter for its nearest ASCII look-alike (ə→e, ş→s, ç→c, ğ→g, ö→o, ü→u,
-- ı→i -- a very common real typing pattern on non-AZ keyboards/autocorrect)
-- breaks n-gram continuity at every substituted position, so a
-- diacritic-dropped query word only *fuzzily* resembles the diacritic-correct
-- stored content instead of matching strongly. 0014 already rejected `unaccent`
-- (the standard Postgres extension) for content NORMALIZATION because
-- ə/ı/ş/ç/ğ/ö/ü are genuinely distinct Azerbaijani letters, not accented Latin
-- variants -- folding them permanently would conflate different real words.
-- This migration takes a narrower, safer approach: only the TRIGRAM
-- COMPARISON (word_similarity calls) operates on a transliterated view of
-- both sides via a new az_unaccent() helper -- `content`/article_label/etc.
-- themselves, and the vector embedding, are completely untouched. This
-- doesn't conflate different real words either: it only makes a
-- diacritic-dropped typo *match* its diacritic-correct source more strongly,
-- which is the intended fix for exactly this real-world typing pattern.
--
-- No index changes: match_chunks/match_chunks_per_document's trigram join
-- already runs unindexed (`word_similarity(...) >= 0.3`, restored in 0035
-- after 0034's indexed `<%` attempt caused statement timeouts -- see 0035's
-- header for the unresolved regression). Wrapping both sides in az_unaccent()
-- doesn't make an already-unindexed scan any slower in kind, only in the
-- (already-paid) per-row function-call cost.

create or replace function az_unaccent(text)
returns text
language sql
immutable
parallel safe
as $$
  select translate($1, 'əışçğöü', 'eiscgou')
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
