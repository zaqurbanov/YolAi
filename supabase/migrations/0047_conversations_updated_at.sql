-- Adds updated_at to conversations, used to order the multi-chat sidebar
-- list by recent activity (created_at alone is wrong once a conversation
-- can receive new messages long after it was created).
alter table conversations
  add column if not exists updated_at timestamptz not null default now();
