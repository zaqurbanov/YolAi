-- Links each chat_request_logs row to the assistant message it timed, so the
-- admin-only "pipeline timing" inspector can look up timings for a specific
-- chat bubble (app/api/admin/chat-request-logs/[messageId]/route.ts) instead
-- of only being queryable by request_id/conversation_id.
alter table chat_request_logs
  add column message_id uuid references messages(id) on delete set null;

create index chat_request_logs_message_id_idx
  on chat_request_logs (message_id);
