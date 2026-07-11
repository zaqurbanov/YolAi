import { createClient } from '@/lib/supabase/server';
import { apiError, serverError, unauthorized } from '@/lib/api/errors';
import { getLatestConversationId } from '@/lib/chat/getLatestConversationId';

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return unauthorized();

  const conversationId = await getLatestConversationId(supabase, user.id);
  if (!conversationId) {
    return Response.json({ messages: [] });
  }

  const { data: messages, error } = await supabase
    .from('messages')
    .select('id, role, content, citations, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) return serverError(error, 'Söhbət tarixçəsini yükləmək uğursuz oldu');

  return Response.json({ messages: messages ?? [] });
}

export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return unauthorized();

  const conversationId = await getLatestConversationId(supabase, user.id);
  if (!conversationId) {
    return Response.json({ deleted: false });
  }

  // RLS (conversations_delete_own, 0005) is the real enforcement layer here;
  // the .eq('user_id', ...) below is defense-in-depth, not a substitute for it.
  const { error, count } = await supabase
    .from('conversations')
    .delete({ count: 'exact' })
    .eq('id', conversationId)
    .eq('user_id', user.id);

  if (error) return serverError(error, 'Söhbəti silmək uğursuz oldu');
  if (!count) {
    return apiError(403, 'Söhbəti silmək mümkün olmadı', { code: 'forbidden' });
  }

  return Response.json({ deleted: true });
}
