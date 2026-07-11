-- Adds keyword (full-text) search alongside vector similarity, combined via
-- Reciprocal Rank Fusion (RRF), to fix a retrieval-quality bug found in
-- production:
--
-- Query "İşıq cihazlarından və səs siqnallarından istifadə qaydalarını
-- pozmağa görə" should retrieve Maddə 329.3 of the Administrative Offences
-- Code (inzibati-xeta), which is the exact provision. Pure cosine similarity
-- ranked it 35th/40 (similarity 0.652) because that source document is full
-- of repetitive boilerplate ("...-a görə ... manat məbləğində cərimə
-- edilir") shared across dozens of unrelated articles. That shared
-- boilerplate dominates the embedding, drowning out the topically
-- distinctive terms ("işıq cihazları", "səs siqnalları") that a lexical
-- search would latch onto immediately. Raising match_count (6 -> 15, see
-- 0008) did not help because the problem isn't recall depth, it's that
-- semantic similarity itself is a poor signal for this document's
-- phrasing pattern. Hybrid search fixes this by giving keyword-exact
-- matches an independent path to the top of the ranking.
--
-- FTS config choice: 'simple', not a language-specific config. Postgres
-- ships no Azerbaijani config, and 'turkish' is NOT a safe substitute --
-- Azerbaijani and Turkish stemming/suffix rules diverge enough that
-- borrowing Turkish stemming risks incorrect lexeme reduction on legal
-- terminology where precision matters more than recall. 'simple' only
-- lowercases and tokenizes (no stemming), which is the honest choice here:
-- it won't silently mangle Azerbaijani word forms, at the cost of not
-- matching across inflections (e.g. "cihazı" vs "cihazlarından" are
-- different lexemes under 'simple'). Given legal text repeats key nouns
-- close to verbatim across related articles, this tradeoff is acceptable.
-- unaccent was considered and rejected: Azerbaijani letters like ə, ı, ş,
-- ç, ğ, ö, ü are distinct phonemes/letters, not accented variants of
-- Latin base letters -- folding them would conflate meaningfully different
-- words (e.g. ə -> e) rather than normalizing spelling variants, which is
-- the opposite of what we want in a legal-precision context.

-- 1. Generated (stored) tsvector column: computed automatically from
--    `content` on insert/update by Postgres itself, so ingestDocument.ts
--    needs zero changes and existing rows are backfilled the moment this
--    ALTER runs (generated columns compute over all existing rows when
--    added, not just future inserts).
alter table chunks
  add column if not exists fts tsvector generated always as (to_tsvector('simple', content)) stored;

create index if not exists chunks_fts_idx on chunks using gin (fts);

-- 2. match_chunks: append query_text as a 4th parameter via drop + recreate
--    (not bare create-or-replace) to avoid the exact overload landmine
--    documented and fixed in 0008 -- create-or-replace with a different
--    parameter list creates a second overload instead of replacing the
--    existing one. Drop the 3-param (0008) signature explicitly first.
drop function if exists match_chunks(vector(384), int, uuid);

-- RRF combines two independently ranked candidate pools (vector nearest-
-- neighbor, FTS relevance) into one score: 1/(k + rank_in_pool) per pool,
-- summed, k = 60 (the standard RRF constant -- large enough to keep the
-- score curve smooth/not dominated by rank-1 alone, small enough that
-- top-ranked items still separate clearly from the tail).
--
-- Floor decision: the existing 0.4 vector-similarity floor (0008) is kept,
-- but ONLY applied to candidates that have no FTS match at all. A chunk
-- that matches the query's keywords (fts_rank is not null) is allowed to
-- surface regardless of its vector similarity -- that's precisely the
-- failure mode this migration exists to fix: Maddə 329.3 has strong
-- keyword overlap but only 0.652 similarity, and would already have
-- cleared 0.4 anyway, but the general fix must not require the floor to
-- coincidentally already be cleared. A pure-vector weak match with zero
-- keyword support still has to clear 0.4, preserving the noise-filtering
-- 0008 was written for. When query_text is null/empty (fts_matches pool is
-- then empty for every row), this collapses back to exactly the 0008
-- behavior: floor-filtered, ordered by vector distance -- so existing
-- callers that don't pass query_text are unaffected.
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
  fts_rank int,
  combined_score float
)
language sql stable
as $$
  with candidate_pool as (
    select greatest(match_count * 4, 40) as n
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
  fts_matches as (
    select
      c.id,
      row_number() over (
        order by ts_rank(c.fts, websearch_to_tsquery('simple', query_text)) desc
      )::int as fts_rank
    from chunks c
    join documents d on d.id = c.document_id
    where query_text is not null
      and btrim(query_text) <> ''
      and d.status = 'ready'
      and (filter_document_id is null or d.id = filter_document_id)
      and c.fts @@ websearch_to_tsquery('simple', query_text)
    order by ts_rank(c.fts, websearch_to_tsquery('simple', query_text)) desc
    limit (select n from candidate_pool)
  ),
  combined as (
    select
      coalesce(v.id, f.id) as id,
      v.vector_rank,
      f.fts_rank,
      coalesce(1.0 / (60 + v.vector_rank), 0) + coalesce(1.0 / (60 + f.fts_rank), 0) as combined_score
    from vector_matches v
    full outer join fts_matches f on f.id = v.id
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
    combined.fts_rank,
    combined.combined_score
  from combined
  join chunks c on c.id = combined.id
  join documents d on d.id = c.document_id
  where combined.fts_rank is not null
     or (1 - (c.embedding <=> query_embedding)) >= 0.4
  order by combined.combined_score desc
  limit match_count;
$$;
