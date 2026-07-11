-- RLS on conversations/messages previously only allowed select/insert (plus
-- update on conversations from 0004). The new chat-history DELETE endpoint
-- lets a user clear their own conversation thread, so a delete policy is
-- required or the delete would silently match zero rows under RLS.
create policy "conversations_delete_own" on conversations
  for delete using (auth.uid() = user_id);

create policy "messages_delete_own" on messages
  for delete using (
    exists (
      select 1 from conversations c
      where c.id = messages.conversation_id and c.user_id = auth.uid()
    )
  );
