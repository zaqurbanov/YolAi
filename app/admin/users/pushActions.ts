'use server';

import { requireAdmin } from '@/lib/auth/requireAdmin';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendPushToSubscription } from '@/lib/push/webpush';

export interface SendPushReminderResult {
  error?: string;
  sent?: number;
  cleaned?: number;
  failed?: number;
}

const REMINDER_PAYLOAD = { title: 'YOL', body: 'Bugünkü sualını cavablandırmısan?' };

// Fan-out send to every stored subscription across all users — reads via
// the service-role client since push_subscriptions has no admin-read RLS
// policy (0050_push_subscriptions.sql), legitimate here only because
// requireAdmin() has already gated this action.
export async function sendPushReminderToAll(): Promise<SendPushReminderResult> {
  const check = await requireAdmin();
  if (!check.ok) return { error: check.message };

  const admin = createAdminClient();
  const { data: subscriptions, error } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth');

  if (error) {
    console.error('[sendPushReminderToAll] failed to load subscriptions', error);
    return { error: 'Abunəliklər yüklənə bilmədi' };
  }

  let sent = 0;
  let cleaned = 0;
  let failed = 0;

  const results = await Promise.allSettled(
    (subscriptions ?? []).map(async (row) => {
      const result = await sendPushToSubscription(
        { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
        REMINDER_PAYLOAD
      );

      if (result.ok) {
        sent += 1;
        return;
      }

      if (result.expired) {
        const { error: deleteError } = await admin.from('push_subscriptions').delete().eq('id', row.id);
        if (deleteError) console.error('[sendPushReminderToAll] failed to clean up expired subscription', deleteError);
        cleaned += 1;
        return;
      }

      console.error('[sendPushReminderToAll] send failed', row.id, result.error);
      failed += 1;
    })
  );

  // One bad subscription must never abort the loop — allSettled already
  // guarantees that; this just surfaces truly unexpected throws (bugs, not
  // web-push send failures, which are already caught inside the mapped
  // callback above) as failed too, instead of losing the count silently.
  for (const result of results) {
    if (result.status === 'rejected') {
      console.error('[sendPushReminderToAll] unexpected rejection', result.reason);
      failed += 1;
    }
  }

  return { sent, cleaned, failed };
}
