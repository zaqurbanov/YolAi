-- Adds an optional `filter_document_ids uuid[]` parameter to match_chunks,
-- appended after the existing `query_text` param with a default of null so
-- this is a pure additive change to the existing 0018 signature (CREATE OR
-- REPLACE is safe here without a DROP first, unlike 0008/0011/0014's
-- overload-landmine cases, because those changed an existing parameter's
-- position/type -- this only appends a new defaulted trailing parameter).
--
-- Why this is needed: the retrieve-then-rerank pipeline (replacing the old
-- per-query regex "intent boosts") widened the primary corpus-wide search to
-- match_count=60, but diagnostics against three real bug reports (technical
-- inspection ownership/payment/paper-ticket questions) showed the correct
-- chunk still doesn't surface even at that width -- because the corpus has
-- a few huge documents (517 IQ Yol hərəkəti haqqında: 517 chunks; Yol
-- hərəkəti qaydaları: 181; 727 IQ Polis haqqında: 177; Sürücülük
-- vəsiqələrinin verilməsi: 114; 778 IQ Avtomobil yolları haqqında: 99) that
-- dominate corpus-wide ranking for almost any query, crowding out chunks
-- from the ~17 much smaller (<=40 chunks each), topically-narrow regulation
-- documents (e.g. "texniki baxışının keçirilməsi qaydaları haqqında", 40
-- chunks) regardless of the query's actual topic.
--
-- Rather than re-adding per-query regex hacks that guess *which* small
-- document is relevant (the exact pattern being removed), the app now always
-- issues one additional supplementary search scoped to the set of "small"
-- documents as a group (see lib/retrieval/search.ts's getSmallDocumentIds()),
-- so those documents only compete against each other, not against the giant
-- ones -- letting the reranker (lib/rag/rerank.ts) decide relevance
-- afterward, with zero query-content-specific code.
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
