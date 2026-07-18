-- New PUBLIC storage bucket for site-wide public assets (currently: the
-- admin-configurable home hero background image). The existing 'documents'
-- bucket (0001) is deliberately private and read via signed URLs / the
-- service-role client only — wrong fit here because the hero image must
-- render via next/image on the public, unauthenticated home page with no
-- signed-URL round trip.
insert into storage.buckets (id, name, public)
values ('public-assets', 'public-assets', true)
on conflict (id) do nothing;

-- Writes to this bucket only ever happen through createAdminClient()
-- (service-role, bypasses RLS) in app/api/admin/chat-meta/route.ts, gated by
-- requireAdmin() before any storage call — so no INSERT/UPDATE/DELETE policy
-- is added for anon/authenticated roles, mirroring the 'documents' bucket's
-- posture of "service role only" for writes.
--
-- Reads are different: bucket.public = true makes Storage's object-serving
-- endpoint (GET /storage/v1/object/public/...) skip auth entirely regardless
-- of storage.objects RLS, so no SELECT policy is strictly required for the
-- public URL returned by getPublicUrl() to work. This policy is added anyway
-- for defense-in-depth / consistency, so anon reads on this bucket keep
-- working even if the bucket's public flag is ever toggled off by mistake,
-- and so any future admin tooling that lists/reads objects via a
-- non-service-role client (e.g. anon key) for this bucket doesn't silently
-- 403 later.
create policy "public_assets_select_public"
  on storage.objects for select
  to public
  using (bucket_id = 'public-assets');
