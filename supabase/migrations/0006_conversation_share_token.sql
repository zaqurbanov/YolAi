-- Adds an opt-in, per-conversation share token so a user can generate a
-- public read-only link (app/api/chat/share, app/share/[token]). The token
-- is nullable and generated lazily on first share request, never backfilled.
--
-- Deliberately NOT adding any RLS policy that allows anonymous or
-- cross-user SELECT on conversations/messages. The public share read path
-- goes through the service-role admin client (lib/chat/getSharedConversation.ts)
-- and is gated strictly by exact share_token equality, never by user_id or
-- any listing/filtering query. RLS on conversations/messages continues to
-- restrict all authenticated-client access to auth.uid() = user_id as before.
alter table conversations
  add column share_token text unique;

-- unique already creates an index, but make the intent explicit and
-- resilient to a future change of the unique constraint.
create unique index if not exists conversations_share_token_idx
  on conversations (share_token);
