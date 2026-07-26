'use server';

import { requireAdmin } from '@/lib/auth/requireAdmin';
import { broadcastDailyReminder } from '@/lib/push/broadcast';
import { broadcastNotificationToAllUsers } from '@/lib/notifications/notifications';
import { logError } from '@/lib/logging/logError';

export interface SendPushReminderResult {
  error?: string;
  sent?: number;
  cleaned?: number;
  failed?: number;
}

const REMINDER_PAYLOAD = { title: 'YOL', body: 'Bugünkü sualını cavablandırmısan?' };

// Admin manual button: send to EVERYONE (onlyUnclaimed: false) — an admin
// testing this wants it to actually fire regardless of quiz status. The
// filtered target is used only by the daily cron (app/api/cron/daily-reminder).
// Reads across all users' subscriptions via the service-role client inside
// broadcastDailyReminder, legitimate here only because requireAdmin() has
// already gated this action.
export async function sendPushReminderToAll(): Promise<SendPushReminderResult> {
  const check = await requireAdmin();
  if (!check.ok) return { error: check.message };

  try {
    const { sent, cleaned, failed } = await broadcastDailyReminder({
      onlyUnclaimed: false,
      payload: REMINDER_PAYLOAD,
    });
    return { sent, cleaned, failed };
  } catch (err) {
    void logError('actions.admin.push.broadcast', err);
    console.error('[sendPushReminderToAll] broadcast failed', err);
    return { error: 'Bildirişlər göndərilə bilmədi' };
  }
}

export interface SendBroadcastNotificationResult {
  error?: string;
  sent?: number;
  failed?: number;
}

const MAX_MESSAGE_LENGTH = 500;

export async function sendBroadcastNotification(message: string): Promise<SendBroadcastNotificationResult> {
  const check = await requireAdmin();
  if (!check.ok) return { error: check.message };

  const trimmed = message?.trim() ?? '';
  if (!trimmed) return { error: 'Mesaj boş ola bilməz' };
  if (trimmed.length > MAX_MESSAGE_LENGTH) return { error: `Mesaj ${MAX_MESSAGE_LENGTH} simvoldan uzun ola bilməz` };

  try {
    const { sent, failed } = await broadcastNotificationToAllUsers(trimmed);
    return { sent, failed };
  } catch (err) {
    void logError('actions.admin.notifications.broadcast', err);
    console.error('[sendBroadcastNotification] broadcast failed', err);
    return { error: 'Bildirişlər göndərilə bilmədi' };
  }
}
