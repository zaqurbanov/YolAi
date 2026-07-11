-- Enable RLS on all user-facing tables
alter table profiles enable row level security;
alter table documents enable row level security;
alter table chunks enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table subscription_plans enable row level security;
alter table user_subscriptions enable row level security;

-- profiles: users can read their own row
create policy "profiles_select_own" on profiles
  for select using (auth.uid() = id);

-- documents/chunks: readable by any authenticated user (needed for retrieval),
-- writes only happen via the service-role client in ingestion (bypasses RLS)
create policy "documents_select_authenticated" on documents
  for select using (auth.role() = 'authenticated');

create policy "chunks_select_authenticated" on chunks
  for select using (auth.role() = 'authenticated');

-- conversations: users can manage only their own
create policy "conversations_select_own" on conversations
  for select using (auth.uid() = user_id);

create policy "conversations_insert_own" on conversations
  for insert with check (auth.uid() = user_id);

-- messages: users can manage only messages in their own conversations
create policy "messages_select_own" on messages
  for select using (
    exists (
      select 1 from conversations c
      where c.id = messages.conversation_id and c.user_id = auth.uid()
    )
  );

create policy "messages_insert_own" on messages
  for insert with check (
    exists (
      select 1 from conversations c
      where c.id = messages.conversation_id and c.user_id = auth.uid()
    )
  );

-- subscription_plans: readable by any authenticated user (not written to yet)
create policy "subscription_plans_select_authenticated" on subscription_plans
  for select using (auth.role() = 'authenticated');

-- user_subscriptions: users can read only their own
create policy "user_subscriptions_select_own" on user_subscriptions
  for select using (auth.uid() = user_id);
