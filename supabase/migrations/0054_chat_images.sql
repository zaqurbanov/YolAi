-- New PRIVATE storage bucket for user-uploaded chat photos (e.g. a photo of a
-- traffic sign taken in the chat composer). Mirrors the posture of the
-- 'documents' bucket (0001) exactly: public = false, no anon/authenticated
-- RLS policy on storage.objects for this bucket, so it is only ever written
-- to or read from via createAdminClient() (service-role, bypasses RLS) —
-- writes happen in app/api/chat/route.ts after a message has already been
-- authenticated/authorized through the normal chat request path, and reads
-- happen in app/api/chat/history/route.ts via short-lived signed URLs
-- (createSignedUrl), never via a public object URL. Unlike 'public-assets'
-- (0048), there is no defense-in-depth SELECT policy added here — chat
-- photos are user content, not site assets, and must never be readable
-- without a signed URL scoped to the owning user's own conversation.
insert into storage.buckets (id, name, public)
values ('chat-images', 'chat-images', false)
on conflict (id) do nothing;

-- Nullable: only set on the user's message row when that message included an
-- image attachment; text-only messages (the overwhelming majority) leave this
-- null. content stays not null as before — for an image message, content
-- holds the user's typed caption if any, else a fixed fallback placeholder
-- string set by the application ('[Şəkil göndərildi]'), never the vision
-- model's internal sign-identification output (that string is only ever used
-- as an ephemeral retrieval query, not persisted as what the user "said").
alter table messages add column image_path text;
