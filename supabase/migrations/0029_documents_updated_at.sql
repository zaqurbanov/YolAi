-- documents.status can get stuck at 'processing' forever if the process is
-- killed mid-ingestion (SIGKILL/crash/dev-server-restart) — that path never
-- reaches ingestDocument.ts's catch block, so status never becomes 'failed'.
-- There was previously no way to tell "processing since when", so a document
-- stuck for that reason was indistinguishable from one that started
-- processing 30 seconds ago. This adds updated_at plus a trigger that bumps
-- it on every update to documents (not relying on ingestDocument.ts's three
-- separate .update() calls to each remember to set it), so admin routes can
-- compute staleness at read time.
alter table documents
  add column updated_at timestamptz not null default now();

create or replace function update_documents_updated_at() returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger documents_set_updated_at
  before update on documents
  for each row execute function update_documents_updated_at();
