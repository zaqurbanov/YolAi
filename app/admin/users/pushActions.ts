'use server';

import { requireAdmin } from '@/lib/auth/requireAdmin';
import { broadcastDailyReminder } from '@/lib/push/broadcast';
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
