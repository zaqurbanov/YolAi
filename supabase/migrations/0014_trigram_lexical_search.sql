-- Replaces the tsvector/FTS lexical path added in 0011 with pg_trgm
-- (character-trigram) similarity, to fix a proven-dead retrieval signal for
-- Azerbaijani text and a severe pure-vector ranking failure.
--
-- Root cause #1 (FTS is dead weight for AZ): 0011's `fts` column uses
-- to_tsvector('simple', content) -- 'simple' only lowercases/tokenizes, no
-- stemming (that choice was deliberate, see 0011's comment on why 'turkish'
-- config is unsafe to borrow for Azerbaijani). But Azerbaijani is heavily
-- agglutinative -- a query token like "alkoqol" and a document token like
-- "alkoqoldan" are different whole-word lexemes under 'simple', so
-- to_tsquery/websearch_to_tsquery never matches them. Verified live against
-- production: querying variants of a question whose answer chunk literally
-- contains "alkoqoldan istifadə olunması" returned fts_rank: null in all
-- three phrasings tried, and fts_rank has been null across every observed
-- production query since 0011 shipped. The FTS half of the RRF sum has been
-- contributing zero signal in practice, not a marginal one -- so it is
-- removed outright here rather than kept alongside trigram "for coverage".
-- Keeping a code path that is proven to always evaluate to the same no-op
-- is worse than removing it: it costs an index-assisted GIN scan + ts_rank
-- computation on every request for nothing, and it misleads future readers
-- into thinking keyword matching is happening when it isn't.
--
-- Root cause #2 (pure vector can rank the correct chunk near-worst-case):
-- query "ickili halda masin surmeyin cezasi var?" (drunk-driving fine,
-- typed without diacritics -- a common real input pattern, not an edge
-- case) should retrieve Maddə 333.1 (400 manat fine + 6-12 month licence
-- restriction). Pure cosine similarity ranked it 103rd of 108 chunks in
-- that document (similarity 0.418, barely above the 0.4 floor from 0008).
-- match_count depth can't rescue this -- the document only has 108 chunks,
-- so 103rd is nearly the entire corpus away from the top. This is exactly
-- the shared-boilerplate-dominates-the-embedding failure mode 0011 already
-- fixed once for a different query; it needs an independent lexical signal
-- again here, and FTS can't provide one (root cause #1).
--
-- Why pg_trgm and not just a better FTS config: trigram similarity is
-- character-n-gram based, not whole-word based, so suffix variation is a
-- *partial* mismatch instead of a total one. Hand-computed example:
--   "alkoqol"    -> padded "  alkoqol "  -> 8 trigrams
--   "alkoqoldan" -> padded "  alkoqoldan " -> 11 trigrams
--   shared: "  a"," al","alk","lko","koq","oqo","qol" = 7
--   similarity = 7 / (8 + 11 - 7) = 7/12 ~= 0.583
-- That's a strong match for a clean suffix variant with no other spelling
-- differences. Real queries typically also drop diacritics (as in the
-- production example above: "ickili" for "içkili", "cezasi" for "cəzası"),
-- which costs additional trigram mismatches on top of suffixing, so
-- real-world scores land lower than this best case -- accounted for in the
-- threshold choice below. unaccent is still rejected for the same reason
-- 0011 rejected it: ə/ı/ş/ç/ğ/ö/ü are distinct Azerbaijani letters, not
-- accented Latin variants, so folding them would conflate different words
-- rather than normalize spelling.
--
-- word_similarity(), not similarity(): similarity() is a Jaccard ratio over
-- BOTH full strings' trigram sets, which is the wrong tool when one side
-- (a chunk's `content`) is a full paragraph -- the denominator explodes
-- with the chunk's own trigrams and drowns out any real match. word_
-- similarity(word, content) instead finds the best-matching word-bounded
-- extent inside `content` and scores against just that extent, which is
-- the intended asymmetric "does this short query token appear (or nearly
-- appear) somewhere in this long text" comparison.

-- 1. Extension.
create extension if not exists pg_trgm;

-- 2. GIN trigram index on lower(content). Expression index (not a plain
--    generated column like 0011's `fts`) because word_similarity/`<%`
--    comparisons need consistent casing on both sides and we don't want a
--    stored, generated column duplicating `content`'s bytes on top of the
--    index itself. GIN, not GiST: GiST is required for KNN-ordered nearest-
--    neighbor scans (`<->`/`<<->` operators), which this migration doesn't
--    use; GIN supports the `%`/`<%`/`%>` threshold operators used below and
--    generally has faster lookups / slower builds than GiST, which fits a
--    write-light (ingestion-time only), read-heavy (every chat request)
--    workload.
create index if not exists chunks_content_trgm_idx
  on chunks using gin (lower(content) gin_trgm_ops);

-- 3. Drop the 0011 FTS column/index -- proven dead per the header comment,
--    see reasoning above for why it's removed rather than kept dormant.
--    Dropping the column also drops chunks_fts_idx (an index directly on
--    the column is dropped automatically), but it's dropped explicitly
--    first for clarity/auditability.
drop index if exists chunks_fts_idx;
alter table chunks drop column if exists fts;

-- 4. match_chunks: drop the exact 0011 4-param signature before recreating
--    -- create-or-replace with a different return-table shape (fts_rank ->
--    trgm_rank below) does NOT reliably replace in place and risks the
--    overload landmine documented in 0008/0011. Drop explicitly first.
drop function if exists match_chunks(vector(384), int, uuid, text);

-- RRF combination, same shape as 0011: 1/(k + rank) per pool, summed,
-- k = 60. query_text is still the parameter name (matches lib/retrieval/
-- search.ts's `ftsQuery` -> RPC `query_text` wiring, which is left
-- unchanged) but it now drives trigram matching, not tsvector FTS.
--
-- Trigram pool construction: cross join the query's whitespace-split words
-- (lowercased, length >= 3 to skip noise tokens like "və", "ki", "bir")
-- against candidate chunks, using `word <% lower(content)` to filter (GIN-
-- index-assisted -- this is the documented pg_trgm usage pattern: indexed
-- expression on the right of `<%`, threshold-checked constant/value on the
-- left) and word_similarity() to score, taking the max per chunk across
-- query words (a chunk should rank on its single best keyword match, not
-- be penalized for the query's other words not appearing in it).
--
-- Threshold: `<%`'s default GUC (pg_trgm.word_similarity_threshold) is 0.6,
-- which the hand-computed 0.583 example above would already fail, before
-- even accounting for the diacritic-dropping that real queries add on top.
-- Lowered to 0.3 here via the function's SET clause -- deliberately the
-- same 0.3 default pg_trgm ships for plain similarity()/`%`, not a custom
-- number, because that's the library's own calibration for "genuine partial
-- match, not noise" and nothing about this corpus suggests AZ legal text
-- needs a different calibration. Combined with the length >= 3 filter on
-- query words (a 3-letter word needs real multi-trigram overlap to clear
-- 0.3, not one stray shared trigram), this should admit suffix/diacritic
-- variants without opening the door to unrelated short-word noise.
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
set pg_trgm.word_similarity_threshold = 0.3
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
