-- Adds rolling conversation-memory fields so long conversations don't have
-- to pass their full raw message history to the model on every request.
alter table conversations
  add column context_summary jsonb not null default '{}'::jsonb,
  add column summary_message_count int not null default 0;

-- RLS on conversations previously only allowed select/insert; the route now
-- updates context_summary/summary_message_count for the owning user, so an
-- update policy is required or the write silently matches zero rows.
create policy "conversations_update_own" on conversations
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
