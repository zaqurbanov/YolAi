-- Root cause (bug report: "əlilliyi olan şəxslərin yerində maşın saxlayıb
-- parklanma" fine question never surfaced Maddə 346-1.3, despite the chunk
-- existing correctly). Diagnosed live against the real Supabase project and
-- real embedding model (not guessed): match_chunks/match_chunks_per_document
-- combine vector and trigram signals via Reciprocal Rank Fusion, EQUALLY
-- weighted --
--   combined_score = 1/(60 + vector_rank) + 1/(60 + trgm_rank)
-- -- and this specific chunk's vector_rank was 874 (badly ranked corpus-wide;
-- the offences document is ~150 near-identical "Maddə X: violation. Cərimə:
-- Y manat." chunks, genuinely hard for a small multilingual embedding model
-- to discriminate) while its trgm_rank was a much more reasonable 120
-- (literal "əlilliyi olan şəxslər" keyword match). Equal weighting let the
-- bad vector rank drag the combined score down to ~0.0066, landing the chunk
-- at position 218 of a 406-candidate merged pool -- 2 slots inside
-- rerank.ts's MAX_RERANK_CANDIDATES=220 cutoff, i.e. right at the edge,
-- explaining the observed run-to-run flakiness (confirmed live: 3 identical
-- repro attempts gave 3 different wrong outcomes).
--
-- This is the same class of failure 0011/0014 already fought once (see
-- 0014's header comment: "pure vector can rank the correct chunk near-worst-
-- case" -- root cause #2 there). Trigram search was added specifically
-- because it's the more reliable signal for this domain (short, keyword-
-- identifiable Azerbaijani legal clauses); this migration follows that same
-- established reasoning one step further -- equal-weight fusion still lets a
-- bad vector rank veto a good trigram rank, so trigram's contribution is
-- boosted 2x relative to vector's.
--
-- Chosen weight (2.0, not higher) and validated live before applying:
-- rescoring the real merged candidate pool for the failing query at
-- trgmWeight=1.5/2.0/3.0 moved the target chunk from rank 218 (barely
-- surviving) to 197/176/132 respectively -- meaningful, monotonic
-- improvement at every tested weight. 2.0 is a moderate middle ground: firm
-- enough to move this case safely away from the cutoff edge, not so
-- aggressive that a coincidental keyword overlap could easily outrank a
-- genuinely strong vector-only match elsewhere in the corpus. This constant
-- can only ever INCREASE a chunk's score (multiplies a non-negative term),
-- so a chunk with no trigram match at all (trgm_rank null) is completely
-- unaffected -- existing vector-only-driven correct answers cannot regress
-- from this change; the only risk is a noisy trigram match (already gated at
-- word_similarity >= 0.3, per 0014's calibration) being over-promoted, not a
-- previously-correct answer being pushed out.
--
-- Both functions keep their existing signatures (unchanged from 0035) --
-- create-or-replace is safe without a preceding drop.

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
