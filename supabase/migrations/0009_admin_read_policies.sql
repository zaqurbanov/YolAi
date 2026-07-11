-- Admin-only SELECT policies so admin pages (Users, Statistics) can query
-- profiles/conversations/messages site-wide via the normal user-scoped
-- client (lib/supabase/server.ts createClient()), instead of reaching for
-- the service-role client. Mirrors chat_request_logs_select_admin from
-- 0007_chat_request_logs.sql. documents/chunks already have
-- ..._select_authenticated policies covering admins, so no change needed
-- there.

create policy "profiles_select_admin" on profiles
  for select using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "conversations_select_admin" on conversations
  for select using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

create policy "messages_select_admin" on messages
  for select using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );
