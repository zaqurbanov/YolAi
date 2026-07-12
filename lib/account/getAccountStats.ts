import 'server-only';
import { createClient } from '@/lib/supabase/server';

export interface AccountStats {
  conversations: number;
  messages: number;
}

function count(result: { count: number | null; error: unknown }): number {
  if (result.error) throw result.error;
  return result.count ?? 0;
}

// Caller (app/account/page.tsx) already redirects unauthenticated users
// before reaching this point, so a missing user here is an invariant
// violation, not a normal "logged out" state — throw rather than soft-fail.
export async function getAccountStats(): Promise<AccountStats> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error('getAccountStats called without an authenticated user');

  const conversationsTotal = await supabase
    .from('conversations')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id);

  const { data: conversationRows, error: conversationIdsError } = await supabase
    .from('conversations')
    .select('id')
    .eq('user_id', user.id);

  if (conversationIdsError) throw conversationIdsError;

  const conversationIds = (conversationRows ?? []).map((row) => row.id);

  if (conversationIds.length === 0) {
    return { conversations: count(conversationsTotal), messages: 0 };
  }

  // RLS (messages_select_own, 0002_rls_policies.sql) already scopes this to
  // the caller's own messages, but head:true count queries don't behave
  // identically to row-returning selects under RLS — keep the explicit
  // conversation_id filter so the count is correct regardless.
  const messagesTotal = await supabase
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .in('conversation_id', conversationIds);

  return {
    conversations: count(conversationsTotal),
    messages: count(messagesTotal),
  };
}
