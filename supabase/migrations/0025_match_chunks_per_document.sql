-- Root cause (2026-07-14 bug report, two insurance-document questions
-- returning no relevant chunk): the small-document boost added in 0022
-- (see its comment, and getSmallDocumentIds() in lib/retrieval/search.ts)
-- classifies documents by an absolute chunk-count cutoff
-- (SMALL_DOCUMENT_CHUNK_THRESHOLD = 100) into "small" (gets a scoped
-- supplementary search so it only competes against other small documents)
-- vs "huge" (assumed to already win corpus-wide ranking on its own merits).
-- "165 IVQ İcbari sığortalar haqqında" was reprocessed the same day and grew
-- to 285 chunks -- above the cutoff, so it lost the boost -- but it is nowhere
-- near as broadly-relevant-to-everything as the corpus's actually-huge
-- documents (517/181/177/114-chunk docs mentioned in 0022's comment): it is
-- a single narrow topic (insurance) split into many fine-grained articles,
-- so a specific-enough query's ideal chunk can still rank outside even a
-- widened (match_count=60-150) *corpus-wide* top-N, crowded out largely by
-- OTHER CHUNKS OF THE SAME DOCUMENT (confirmed live: 35-55 of 60 corpus-wide
-- candidates for these queries already belonged to this one document, yet
-- the single best-matching chunk within it still didn't make the cut).
--
-- A fixed chunk-count cutoff is inherently fragile here: any document,
-- regardless of absolute size, can be crowded out of a fixed-width
-- corpus-wide top-N -- by other documents OR by its own sibling chunks -- and
-- the exact cutoff value requires retuning every time a document is
-- uploaded or reprocessed and happens to cross it (already happened once
-- today). This replaces the small/huge classification with an
-- unconditional per-document guarantee: every ready document contributes up
-- to its own top `per_document_limit` chunks to the retrieval pool,
-- independent of how many chunks any other document has, ranked by the
-- *same* vector+trigram combined_score formula match_chunks uses (not a
-- document-local, rank-only score) -- callers in route.ts merge this
-- source's results with match_chunks' and sort the merged pool by
-- combined_score before rerank.ts's candidate cap (see MAX_RERANK_CANDIDATES
-- there), which only produces a meaningful ordering if every source's score
-- is on the same scale.
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
  with vector_matches as (
    select
      c.id,
      row_number() over (order by c.embedding <=> query_embedding)::int as vector_rank
    from chunks c
    join documents d on d.id = c.document_id
    where d.status = 'ready'
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
