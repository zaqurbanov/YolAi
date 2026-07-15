import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

// Generic per-user notifications feed. Reads/writes always go through the
// service-role client (bypassing RLS is fine — every call here is already
// scoped to a specific, server-verified userId), same pattern as
// lib/coins/transfers.ts' getTransferHistory.

export interface NotificationRow {
  id: string;
  message: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}

interface NotificationsSelectRow {
  id: string;
  message: string;
  link: string | null;
  read: boolean;
  created_at: string;
}

export async function getUnreadCount(userId: string): Promise<number> {
  const { count, error } = await createAdminClient()
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('read', false);

  if (error) {
    console.error('[notifications] getUnreadCount failed:', error);
    return 0;
  }

  return count ?? 0;
}

export async function getRecentNotifications(
  userId: string,
  limit = 10
): Promise<NotificationRow[]> {
  const { data, error } = await createAdminClient()
    .from('notifications')
    .select('id, message, link, read, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)
    .returns<NotificationsSelectRow[]>();

  if (error || !data) {
    console.error('[notifications] getRecentNotifications failed:', error);
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    message: row.message,
    link: row.link,
    read: row.read,
    createdAt: row.created_at,
  }));
}

// Scoped by both id AND user_id in the WHERE clause — defense in depth
// against a crafted form post targeting another user's notification id,
// even though the service-role client already bypasses RLS here.
export async function markNotificationRead(
  notificationId: string,
  userId: string
): Promise<{ ok: boolean }> {
  const { error } = await createAdminClient()
    .from('notifications')
    .update({ read: true })
    .eq('id', notificationId)
    .eq('user_id', userId);

  if (error) {
    console.error('[notifications] markNotificationRead failed:', error);
    return { ok: false };
  }

  return { ok: true };
}
