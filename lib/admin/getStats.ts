import 'server-only';
import { createClient } from '@/lib/supabase/server';

export interface AdminStats {
  documents: {
    total: number;
    byStatus: {
      pending: number;
      processing: number;
      ready: number;
      failed: number;
    };
  };
  chunks: { total: number };
  users: { total: number };
  conversations: { total: number };
  messages: { total: number; last7Days: number };
}

const DOCUMENT_STATUSES = ['pending', 'processing', 'ready', 'failed'] as const;

function count(result: { count: number | null; error: unknown }): number {
  if (result.error) throw result.error;
  return result.count ?? 0;
}

// Assumes the caller has already run requireAdmin() — this is a plain
// data-fetcher, no auth check here. Relies on the *_select_admin RLS
// policies (0009_admin_read_policies.sql) for conversations/messages/profiles,
// and the existing *_select_authenticated policies for documents/chunks.
export async function getAdminStats(): Promise<AdminStats> {
  const supabase = await createClient();

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [
    documentsTotal,
    ...documentsByStatus
  ] = await Promise.all([
    supabase.from('documents').select('*', { count: 'exact', head: true }),
    ...DOCUMENT_STATUSES.map((status) =>
      supabase.from('documents').select('*', { count: 'exact', head: true }).eq('status', status)
    ),
  ]);

  const [chunksTotal, usersTotal, conversationsTotal, messagesTotal, messagesLast7Days] =
    await Promise.all([
      supabase.from('chunks').select('*', { count: 'exact', head: true }),
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('conversations').select('*', { count: 'exact', head: true }),
      supabase.from('messages').select('*', { count: 'exact', head: true }),
      supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', sevenDaysAgo),
    ]);

  return {
    documents: {
      total: count(documentsTotal),
      byStatus: {
        pending: count(documentsByStatus[0]),
        processing: count(documentsByStatus[1]),
        ready: count(documentsByStatus[2]),
        failed: count(documentsByStatus[3]),
      },
    },
    chunks: { total: count(chunksTotal) },
    users: { total: count(usersTotal) },
    conversations: { total: count(conversationsTotal) },
    messages: {
      total: count(messagesTotal),
      last7Days: count(messagesLast7Days),
    },
  };
}
