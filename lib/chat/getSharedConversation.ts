import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

export interface SharedConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: unknown;
  created_at: string;
}

export interface SharedConversation {
  id: string;
  title: string | null;
  created_at: string;
  messages: SharedConversationMessage[];
}

/**
 * Public, unauthenticated read path for a shared conversation. Uses the
 * service-role client (bypasses RLS by design — there is no anonymous RLS
 * policy on conversations/messages), but is safe because the lookup is
 * always an exact share_token equality match and the returned shape omits
 * user_id/email or any other user-identifying field.
 */
export async function getSharedConversation(
  token: string,
): Promise<SharedConversation | null> {
  if (!token) return null;

  const admin = createAdminClient();

  const { data: conversation, error: conversationError } = await admin
    .from('conversations')
    .select('id, title, created_at')
    .eq('share_token', token)
    .maybeSingle();

  if (conversationError || !conversation) return null;

  const { data: messages, error: messagesError } = await admin
    .from('messages')
    .select('id, role, content, citations, created_at')
    .eq('conversation_id', conversation.id)
    .order('created_at', { ascending: true });

  if (messagesError) return null;

  return {
    id: conversation.id,
    title: conversation.title,
    created_at: conversation.created_at,
    messages: messages ?? [],
  };
}
