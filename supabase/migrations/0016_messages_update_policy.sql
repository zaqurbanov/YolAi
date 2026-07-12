-- app/api/chat/route.ts now inserts a placeholder assistant message row
-- *before* streaming starts (so its id is known synchronously and can be
-- delivered via messageMetadata on every streamed chunk, including the
-- earliest ones) and then updates that same row with the final content/
-- citations once generation finishes. RLS on messages previously only
-- allowed select/insert/delete (0002, 0005), so that update would silently
-- match zero rows under RLS without this policy.
create policy "messages_update_own" on messages
  for update using (
    exists (
      select 1 from conversations c
      where c.id = messages.conversation_id and c.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from conversations c
      where c.id = messages.conversation_id and c.user_id = auth.uid()
    )
  );
