-- Adds optional document scoping to match_chunks so retrieval can be limited
-- to a single document instead of always searching globally.
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
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
