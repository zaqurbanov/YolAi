-- 0080_sign_images.sql — road-sign catalog images, extracted automatically
-- from catalog PDFs (e.g. public/nisanlar.pdf, ingested as a document like
-- any other) by lib/ingestion/extractSignImages.ts. This is additive
-- metadata: nothing in the chat/retrieval path reads this table yet.
--
-- One row per (document, code, position) — a single sign code can have more
-- than one associated image (a "Lövhə" column showing a second example), so
-- `position` is an ordinal within the code (0 = primary) rather than a
-- single image per code. `kind` distinguishes the main sign catalog from the
-- road-marking catalog section, which reuses ~23 codes from the sign
-- section (1.1-1.24, 2.1-2.7) — see extractSignImages.ts for how that
-- section is detected (a monotonicity break in code numbering, not a
-- hardcoded page number).
--
-- `visual_description` is deliberately left null here — a later phase will
-- backfill it via an LLM vision call, out of scope for this migration and
-- for the extraction path (which must stay LLM-free to keep ingestion fast
-- and within the serverless timeout).
create table if not exists sign_images (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  kind text not null check (kind in ('sign', 'marking')),
  document_id uuid not null references documents(id) on delete cascade,
  page int not null,
  position int not null,
  storage_path text not null,
  width int not null,
  height int not null,
  visual_description text null,
  created_at timestamptz not null default now(),
  unique (document_id, code, position)
);

alter table sign_images enable row level security;

-- Public catalog content, same posture as documents/chunks (0002): readable
-- by everyone, writes only ever happen through the service-role client in
-- ingestion (lib/ingestion/ingestDocument.ts) and the admin re-extraction
-- server action (app/admin/documents/actions.ts), both already gated by
-- requireAdmin()/the ingestion pipeline before they run. No write policy is
-- added for anon/authenticated — that's what makes it service-role-only.
drop policy if exists "sign_images_select_all" on sign_images;
create policy "sign_images_select_all"
  on sign_images for select
  to public
  using (true);

-- Public storage bucket for the extracted PNGs, same idiom as 0048's
-- public-assets bucket: public read via Storage's own object-serving
-- endpoint (bypasses RLS entirely for GET), service-role-only writes.
insert into storage.buckets (id, name, public)
values ('sign-images', 'sign-images', true)
on conflict (id) do nothing;

-- Belt-and-suspenders SELECT policy on storage.objects for this bucket,
-- mirroring 0048_public_assets_bucket.sql's reasoning: not strictly required
-- for the public URL to resolve while bucket.public = true, but keeps anon
-- reads working even if that flag is ever toggled off by mistake, and keeps
-- any future non-service-role listing/reading of this bucket from silently
-- 403ing later.
drop policy if exists "sign_images_bucket_select_public" on storage.objects;
create policy "sign_images_bucket_select_public"
  on storage.objects for select
  to public
  using (bucket_id = 'sign-images');
