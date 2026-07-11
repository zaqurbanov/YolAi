import crypto from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { apiError, serverError, unauthorized } from '@/lib/api/errors';
import { getLatestConversationId } from '@/lib/chat/getLatestConversationId';

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return unauthorized();

  const conversationId = await getLatestConversationId(supabase, user.id);
  if (!conversationId) {
    return apiError(404, 'Paylaşılacaq söhbət yoxdur', { code: 'no_conversation' });
  }

  const { data: existing, error: fetchError } = await supabase
    .from('conversations')
    .select('share_token')
    .eq('id', conversationId)
    .maybeSingle();

  if (fetchError) return serverError(fetchError, 'Söhbəti paylaşmaq uğursuz oldu');

  let token = existing?.share_token ?? null;

  if (!token) {
    token = crypto.randomBytes(24).toString('base64url');

    // RLS conversations_update_own (0004) scopes this to auth.uid() = user_id,
    // so this can only ever touch the caller's own conversation.
    const { error: updateError } = await supabase
      .from('conversations')
      .update({ share_token: token })
      .eq('id', conversationId)
      .eq('user_id', user.id);

    if (updateError) return serverError(updateError, 'Söhbəti paylaşmaq uğursuz oldu');
  }

  return Response.json({ url: `/share/${token}` });
}
