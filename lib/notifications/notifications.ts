import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { logError } from '@/lib/logging/logError';
import { bakuDayStartUtcIso } from '@/lib/date/baku';
import { getDailyQuestStatus } from '@/lib/coins/dailyQuests';

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
    void logError('notifications.unreadCount', error, { userId });
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
    void logError('notifications.recentList', error, { userId });
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
    void logError('notifications.markRead', error, { userId, details: { notificationId } });
    console.error('[notifications] markNotificationRead failed:', error);
    return { ok: false };
  }

  return { ok: true };
}

const DAILY_QUEST_REMINDER_MESSAGE = 'Bugünkü Gündəlik Missiyalarını unutma! 🎯';
const DAILY_QUEST_REMINDER_LINK = '/coin-qazan';

// Fires once per Baku day per user, called from the nav-state fetch (once per
// session, deduped client-side). Application-level dedup via select-then-insert
// rather than a unique constraint — a rare race could double-insert, but that's
// only a cosmetic duplicate notification, not a reward, so it's an accepted risk.
// CONTRACT: never throws — must not be able to break the nav-state response.
export async function ensureDailyQuestReminderNotification(userId: string): Promise<void> {
  try {
    const status = await getDailyQuestStatus(userId);
    if (status.ok && status.chestClaimed) return;

    const { data: existing, error: selectError } = await createAdminClient()
      .from('notifications')
      .select('id')
      .eq('user_id', userId)
      .eq('message', DAILY_QUEST_REMINDER_MESSAGE)
      .gte('created_at', bakuDayStartUtcIso())
      .limit(1)
      .maybeSingle();

    if (selectError) {
      void logError('notifications.dailyQuestReminder', selectError, { userId });
      return;
    }
    if (existing) return;

    const { error: insertError } = await createAdminClient().from('notifications').insert({
      user_id: userId,
      message: DAILY_QUEST_REMINDER_MESSAGE,
      link: DAILY_QUEST_REMINDER_LINK,
    });

    if (insertError) {
      void logError('notifications.dailyQuestReminder', insertError, { userId });
    }
  } catch (error) {
    void logError('notifications.dailyQuestReminder', error, { userId });
  }
}

export interface BroadcastNotificationResult {
  sent: number;
  failed: number;
}

// Admin-only bulk in-app notification — every user gets the SAME message,
// no push permission/subscription required (unlike lib/push/broadcast.ts).
// Batched inserts (BATCH_SIZE) to avoid one giant statement against a large
// user base; failures per batch are logged and counted, never abort the
// whole broadcast.
export async function broadcastNotificationToAllUsers(
  message: string,
  link: string | null = null
): Promise<BroadcastNotificationResult> {
  const admin = createAdminClient();

  const { data: profiles, error: profilesError } = await admin.from('profiles').select('id');
  if (profilesError) {
    void logError('notifications.broadcastAll.loadUsers', profilesError);
    console.error('[notifications] broadcastNotificationToAllUsers failed to load users:', profilesError);
    return { sent: 0, failed: 0 };
  }

  const userIds = (profiles ?? []).map((p) => p.id);
  const BATCH_SIZE = 500;
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
    const batch = userIds.slice(i, i + BATCH_SIZE);
    const rows = batch.map((userId) => ({ user_id: userId, message, link }));
    const { error } = await admin.from('notifications').insert(rows);
    if (error) {
      void logError('notifications.broadcastAll.insert', error, { details: { batchSize: batch.length } });
      console.error('[notifications] broadcastNotificationToAllUsers batch insert failed:', error);
      failed += batch.length;
    } else {
      sent += batch.length;
    }
  }

  return { sent, failed };
}
