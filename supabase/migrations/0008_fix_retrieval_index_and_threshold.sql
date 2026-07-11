-- Fixes two retrieval bugs found in production:
--
-- 1. chunks_embedding_idx used ivfflat with lists = 100 against a ~350-row
--    corpus. Recommended tuning is lists ~ sqrt(rows) (~19 here), but at this
--    scale (~350 rows) an approximate index buys nothing and actively hurts
--    recall: each of the 100 partitions holds ~3.5 vectors, and the default
--    ivfflat.probes = 1 only scans one partition per query, so short/
--    off-cluster queries (e.g. "Salam, sürət həddi nə qədərdir?") were
--    matching against a near-empty partition and returning 0-1 rows, often
--    the wrong chunk. A sequential scan over 350 vectors is exactly correct
--    and still fast enough for the request-time hot path at this volume, so
--    the ivfflat index is dropped outright rather than retuned. Revisit
--    (e.g. hnsw, which has no lists footgun and better recall/build-time
--    tradeoffs than ivfflat) once the corpus grows into the thousands of
--    chunks and a sequential scan is no longer cheap.
drop index if exists chunks_embedding_idx;

-- 2. 0003 changed match_chunks's signature (added filter_document_id) via
--    `create or replace function`, which does NOT replace a function with a
--    different parameter list — it creates a second overload. Both the
--    2-param (0001) and 3-param (0003) versions have existed in the DB since
--    0003 was applied. This is currently masked because
--    lib/retrieval/search.ts always calls with all 3 args, but it's schema
--    drift and a landmine for any future 2-arg caller ("could not choose the
--    best candidate function" due to ambiguous defaults). Drop the orphaned
--    2-param overload before recreating the 3-param version below.
drop function if exists match_chunks(vector(384), int);

-- 3. No minimum-similarity floor existed, so a single weak match (similarity
--    as low as 0.33 in the reproduced bug) was passed into the prompt and
--    confidently cited instead of triggering the model's built-in
--    "couldn't find it" fallback (SYSTEM_PROMPT in lib/rag/buildPrompt.ts).
--    0.4 is chosen as the floor: low enough that legitimate paraphrased/
--    off-topic-phrasing matches over this multilingual MiniLM model still
--    clear it (control test in the debugger's report showed correctly
--    matched chunks scoring far above this), but high enough to exclude the
--    kind of off-cluster noise match (0.33) that produced the wrong-chunk
--    answer. With the ivfflat index gone, this now filters on a similarity
--    computed from an exact, full-corpus nearest-neighbor scan, so it's not
--    compensating for index-induced randomness anymore, just filtering
--    genuinely weak semantic matches. Recreated as a create-or-replace of
--    the 3-param (0003) signature so it replaces cleanly in place.
create or replace function match_chunks(
  query_embedding vector(384),
  match_count int default 6,
  filter_document_id uuid default null
)
returns table (
  id uuid,
  content text,
  page_number int,
  article_label text,
  document_id uuid,
  document_title text,
  similarity float
)
language sql stable
as $$
  select
    c.id,
    c.content,
    c.page_number,
    c.article_label,
    d.id as document_id,
    d.title as document_title,
    1 - (c.embedding <=> query_embedding) as similarity
  from chunks c
  join documents d on d.id = c.document_id
  where d.status = 'ready'
    and (filter_document_id is null or d.id = filter_document_id)
    and 1 - (c.embedding <=> query_embedding) >= 0.4
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
