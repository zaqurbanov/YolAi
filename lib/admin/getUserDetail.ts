import 'server-only';
import { createClient } from '@/lib/supabase/server';

/**
 * Return shapes (for the frontend consuming this module):
 *
 * interface AdminUserProfile {
 *   id: string;
 *   email: string | null;
 *   role: string;
 *   created_at: string;
 *   full_name: string | null;
 *   avatar_url: string | null;
 * }
 *
 * interface AdminUserCitedDocument {
 *   document_id: string;
 *   title: string;
 *   count: number;
 * }
 *
 * interface AdminUserStats {
 *   totalConversations: number;
 *   totalUserMessages: number;
 *   totalAssistantMessages: number;
 *   firstActivityAt: string | null; // earliest message.created_at across all their conversations
 *   lastActivityAt: string | null;  // latest message.created_at across all their conversations
 *   topCitedDocuments: AdminUserCitedDocument[]; // best-effort, top 5 by citation count
 * }
 *
 * interface AdminUserDetail {
 *   profile: AdminUserProfile;
 *   stats: AdminUserStats;
 * }
 *
 * getAdminUserDetail(userId) resolves to `AdminUserDetail | null` (null when
 * no profile row matches userId).
 *
 * interface AdminUserMessage {
 *   id: string;
 *   role: 'user' | 'assistant';
 *   content: string;
 *   citations: unknown; // jsonb, shape from lib/rag/buildPrompt.ts buildCitations()
 *   created_at: string;
 * }
 *
 * interface AdminUserConversation {
 *   id: string;
 *   title: string | null;
 *   created_at: string;
 *   messages: AdminUserMessage[]; // ordered oldest-first (chronological)
 * }
 *
 * interface AdminUserConversationsPage {
 *   conversations: AdminUserConversation[]; // ordered newest-first
 *   total: number;
 *   hasMore: boolean;
 * }
 *
 * getAdminUserConversations(userId, { limit = 10, offset = 0 }) resolves to
 * `AdminUserConversationsPage`.
 */

export interface AdminUserProfile {
  id: string;
  email: string | null;
  role: string;
  created_at: string;
  full_name: string | null;
  avatar_url: string | null;
}

export interface AdminUserCitedDocument {
  document_id: string;
  title: string;
  count: number;
}

export interface AdminUserStats {
  totalConversations: number;
  totalUserMessages: number;
  totalAssistantMessages: number;
  firstActivityAt: string | null;
  lastActivityAt: string | null;
  topCitedDocuments: AdminUserCitedDocument[];
}

export interface AdminUserDetail {
  profile: AdminUserProfile;
  stats: AdminUserStats;
}

export interface AdminUserMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: unknown;
  created_at: string;
}

export interface AdminUserConversation {
  id: string;
  title: string | null;
  created_at: string;
  messages: AdminUserMessage[];
}

export interface AdminUserConversationsPage {
  conversations: AdminUserConversation[];
  total: number;
  hasMore: boolean;
}

interface CitationEntry {
  document_id?: string;
  title?: string;
}

// Assumes the caller has already run requireAdmin() — this is a plain
// data-fetcher, no auth check here. Relies on the profiles_select_admin /
// conversations_select_admin / messages_select_admin RLS policies
// (0009_admin_read_policies.sql, 0010_fix_profiles_admin_recursion.sql) to
// see rows beyond the caller's own.
export async function getAdminUserDetail(userId: string): Promise<AdminUserDetail | null> {
  const supabase = await createClient();

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, email, role, created_at, full_name, avatar_url')
    .eq('id', userId)
    .maybeSingle();

  if (profileError) throw profileError;
  if (!profile) return null;

  const { data: conversationRows, error: conversationsError } = await supabase
    .from('conversations')
    .select('id')
    .eq('user_id', userId);

  if (conversationsError) throw conversationsError;

  const conversationIds = (conversationRows ?? []).map((c) => c.id);
  const totalConversations = conversationIds.length;

  if (conversationIds.length === 0) {
    return {
      profile,
      stats: {
        totalConversations: 0,
        totalUserMessages: 0,
        totalAssistantMessages: 0,
        firstActivityAt: null,
        lastActivityAt: null,
        topCitedDocuments: [],
      },
    };
  }

  // Pulling role/created_at/citations for every message this user has is bounded
  // by their own activity, not overall table size — fine for stats aggregation,
  // unlike getAdminUserConversations below which paginates for display.
  const { data: allMessages, error: messagesError } = await supabase
    .from('messages')
    .select('role, created_at, citations')
    .in('conversation_id', conversationIds)
    .order('created_at', { ascending: true });

  if (messagesError) throw messagesError;

  const messages = allMessages ?? [];
  const totalUserMessages = messages.filter((m) => m.role === 'user').length;
  const totalAssistantMessages = messages.filter((m) => m.role === 'assistant').length;
  const firstActivityAt = messages.length > 0 ? messages[0].created_at : null;
  const lastActivityAt = messages.length > 0 ? messages[messages.length - 1].created_at : null;

  const citationCounts = new Map<string, { title: string; count: number }>();
  for (const message of messages) {
    if (message.role !== 'assistant' || !Array.isArray(message.citations)) continue;
    for (const raw of message.citations as CitationEntry[]) {
      if (!raw?.document_id) continue;
      const existing = citationCounts.get(raw.document_id);
      if (existing) {
        existing.count += 1;
      } else {
        citationCounts.set(raw.document_id, { title: raw.title ?? 'Naməlum sənəd', count: 1 });
      }
    }
  }

  const topCitedDocuments: AdminUserCitedDocument[] = Array.from(citationCounts.entries())
    .map(([document_id, { title, count }]) => ({ document_id, title, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    profile,
    stats: {
      totalConversations,
      totalUserMessages,
      totalAssistantMessages,
      firstActivityAt,
      lastActivityAt,
      topCitedDocuments,
    },
  };
}

const DEFAULT_CONVERSATIONS_LIMIT = 10;

// Assumes the caller has already run requireAdmin() — see note above.
// Conversations are paginated (default 10/page, newest-first); each
// conversation's messages are fetched separately and ordered oldest-first
// (chronological) so a conversation thread reads top-to-bottom.
export async function getAdminUserConversations(
  userId: string,
  { limit = DEFAULT_CONVERSATIONS_LIMIT, offset = 0 }: { limit?: number; offset?: number } = {},
): Promise<AdminUserConversationsPage> {
  const supabase = await createClient();

  const { data: conversationRows, error: conversationsError, count } = await supabase
    .from('conversations')
    .select('id, title, created_at', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (conversationsError) throw conversationsError;

  const conversations = conversationRows ?? [];
  const total = count ?? 0;

  if (conversations.length === 0) {
    return { conversations: [], total, hasMore: false };
  }

  const conversationIds = conversations.map((c) => c.id);

  const { data: messageRows, error: messagesError } = await supabase
    .from('messages')
    .select('id, conversation_id, role, content, citations, created_at')
    .in('conversation_id', conversationIds)
    .order('created_at', { ascending: true });

  if (messagesError) throw messagesError;

  const messagesByConversation = new Map<string, AdminUserMessage[]>();
  for (const row of messageRows ?? []) {
    const list = messagesByConversation.get(row.conversation_id) ?? [];
    list.push({
      id: row.id,
      role: row.role,
      content: row.content,
      citations: row.citations,
      created_at: row.created_at,
    });
    messagesByConversation.set(row.conversation_id, list);
  }

  return {
    conversations: conversations.map((c) => ({
      id: c.id,
      title: c.title,
      created_at: c.created_at,
      messages: messagesByConversation.get(c.id) ?? [],
    })),
    total,
    hasMore: offset + conversations.length < total,
  };
}
