-- Admin-editable "busy indicator" status sentences shown on the chat page
-- while a request is in flight (app/chat/page.tsx BusyIndicator /
-- busyPhraseFor). Previously these were hardcoded arrays; this table lets
-- admins edit the copy without a deploy. Frontend falls back to the
-- hardcoded constants only if a fetch returns an empty set, so this table
-- must always be seeded (see inserts below).

create table chat_busy_phrases (
  id uuid primary key default gen_random_uuid(),
  stage text not null check (stage in ('analyzing', 'rewriting', 'searching', 'finalizing', 'streaming')),
  phrase text not null,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index chat_busy_phrases_stage_order_idx on chat_busy_phrases (stage, display_order);

alter table chat_busy_phrases enable row level security;

-- Readable by any authenticated user — this only affects UI copy shown to
-- every /chat user, not sensitive data. Mirrors documents_select_authenticated
-- / chunks_select_authenticated from 0002_rls_policies.sql.
create policy "chat_busy_phrases_select_authenticated" on chat_busy_phrases
  for select using (auth.role() = 'authenticated');

-- Writes are admin-only, mirroring the exists(...) profiles.role = 'admin'
-- pattern from 0009_admin_read_policies.sql. Application code also goes
-- through requireAdmin() + the service-role client for writes (see
-- app/api/admin/chat-meta/route.ts), so these policies are a defense-in-depth
-- backstop, not the only gate.
create policy "chat_busy_phrases_insert_admin" on chat_busy_phrases
  for insert with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

create policy "chat_busy_phrases_update_admin" on chat_busy_phrases
  for update using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

create policy "chat_busy_phrases_delete_admin" on chat_busy_phrases
  for delete using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- Seed with the sentences currently hardcoded in app/chat/page.tsx so a
-- fresh migration run already has working defaults.
insert into chat_busy_phrases (stage, phrase, display_order) values
  ('analyzing', 'Sual analiz edilir...', 0),
  ('rewriting', 'Sual daha dəqiq axtarış üçün tərtib olunur...', 0),
  ('searching', 'Sənəd bazasında axtarış aparılır...', 0),
  ('searching', 'Müvafiq maddələr sənədlərdən axtarılır...', 1),
  ('searching', 'Nəticələr uyğunluğa görə sıralanır...', 2),
  ('finalizing', 'Ən uyğun maddələr seçilir...', 0),
  ('streaming', 'Cavab yazılır...', 0);

-- ---------------------------------------------------------------------
-- MANUAL STEP REQUIRED: this repo has no migration runner. Run this file
-- in the Supabase Studio SQL editor against the project database, after
-- 0045_transfer_coins_notification.sql has already been applied.
-- ---------------------------------------------------------------------
