-- Fixes ~20s chat latency traced to match_chunks_per_document (0025), the
-- primary retrieval path called from retrievePerDocumentChunks() in
-- lib/retrieval/search.ts. Root cause: unlike match_chunks (0018/0022),
-- 0025's vector_matches CTE ranks the ENTIRE chunks table with
-- `row_number() over (order by embedding <=> query_embedding)` and NO limit
-- anywhere upstream of it. The chunks_embedding_idx ivfflat index (0001)
-- only accelerates `ORDER BY embedding <=> query LIMIT n` (a bounded KNN
-- scan) -- it cannot accelerate an unbounded ranking window function, so
-- this was a full sequential scan of every ready chunk's embedding plus a
-- full in-memory sort, on every chat request, regardless of corpus size.
-- This migration bounds vector_matches with the same ORDER BY + LIMIT
-- pattern match_chunks has used since 0018, restoring the ivfflat KNN path.
--
-- Trigram side: no change needed here, and match_chunks needs no companion
-- fix either. 0025's trgm_matches CTE looked structurally identical to
-- match_chunks' at first glance (both use the bare `word_similarity(...) >=
-- 0.3` join condition, not the index-assisted `<%` operator -- see 0018's
-- comment for why: Supabase's managed `postgres` role gets "permission
-- denied to set parameter" on `pg_trgm.word_similarity_threshold`, even from
-- within a function it owns, so `<%`'s implicit GUC-driven threshold isn't
-- usable and an explicit comparison is used instead, forgoing the GIN index
-- assist chunks_content_trgm_idx would otherwise give `<%`). That join scan
-- is inherently O(chunks x query_words) either way, index-assist or not --
-- nothing in this migration changes that, and nothing safely can without
-- either the forbidden GUC or a full rewrite of the lexical strategy, which
-- is out of scope here. But 0025's trgm_matches CTE, unlike match_chunks',
-- was missing the `order by trgm_score desc limit n` match_chunks has had
-- since 0018 -- that limit doesn't make the join itself index-assisted, but
-- it caps how many scored rows survive into the `combined` CTE and the
-- per-document window function below, rather than carrying the entire
-- table's worth of scored rows forward. This migration adds that same limit
-- to match_chunks_per_document, bringing it to parity with match_chunks
-- rather than introducing a new strategy. match_chunks itself already has
-- this exact shape since 0018 and is left untouched.
--
-- Per-document guarantee (0025's whole reason for existing) must survive
-- this: every ready document must still get a shot at contributing up to
-- per_document_limit of its own top chunks, regardless of corpus-wide
-- competition from other documents -- a 285-chunk narrow-topic document
-- ("165 IVQ İcbari sığortalar haqqında") was previously crowded out of a
-- fixed corpus-wide top-N by its own sibling chunks and by the corpus's
-- genuinely huge documents (517/181/177/114/99-chunk docs, see 0022/0025's
-- comments). A vector_matches LIMIT reintroduces exactly this failure mode
-- if set too tight -- a document's single best-matching chunk for a given
-- query must land inside the global top-n by vector distance (or inside the
-- trgm pool) to be visible at all, since scored_chunks below is built only
-- from rows that made it into `combined`.
--
-- Candidate pool size (n): scaled to the number of currently-ready
-- documents rather than a fixed guess, so it doesn't need retuning as
-- documents are added (the exact failure mode that made 0022's small/huge
-- document classification fragile, per 0025's own header comment). Formula:
--   n = greatest(per_document_limit * ready_document_count * 5, 800)
-- Reasoning: per_document_limit is 20 (the only caller,
-- PER_DOCUMENT_CANDIDATE_LIMIT in lib/retrieval/search.ts, passes 20).
-- Documented ready-document count is not something this migration can query
-- live (no DB access tool was available when this was written -- reasoned
-- from prior migrations' comments, not measured): 0018 names 5 large
-- documents (517/181/177/114/99 chunks) plus "~17 much smaller (<=40 chunks
-- each)" documents, and 0025 separately documents a 285-chunk document,
-- giving a working estimate of roughly 20-25 ready documents, plausibly
-- more by now. At the low end (20 docs) that's 20 * 20 = 400 "fair share"
-- slots; at the high end estimated (30 docs) it's 600. The x5 safety factor
-- (2000-3000) is deliberately generous given 0018's own live finding that a
-- target chunk can be crowded out of even a 60-150-wide corpus-wide pool by
-- its own document's sibling chunks and a handful of dominant documents --
-- a modest multiplier was demonstrably insufficient for this corpus's
-- vocabulary-overlap pattern. The floor of 800 protects the low-document-
-- count case (e.g. a fresh/small deployment) from an under-sized n. Total
-- corpus size is documented as roughly 350-1000+ chunks as of 0014/0018
-- (explicitly noted there as likely stale), so an n in the 800-3000 range
-- both (a) comfortably exceeds most or all of the corpus at today's
-- documented scale -- meaning this LIMIT will often not bind at all, and
-- the ivfflat KNN scan is simply cheaper than the equivalent unbounded sort
-- it replaces -- and (b) still gives a real, predictable bound (unlike no
-- limit at all) if the corpus grows well past its last documented size.
-- This is a reasoned estimate, not a measurement; if live document/chunk
-- counts turn out to make this too tight, the fix is to raise the
-- multiplier or floor here, not to remove the limit again.
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
