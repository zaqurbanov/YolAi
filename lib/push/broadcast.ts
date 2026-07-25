import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendPushToSubscription, type PushPayload } from '@/lib/push/webpush';

export interface BroadcastResult {
  sent: number;
  cleaned: number;
  failed: number;
  skipped: number;
}

export interface BroadcastOptions {
  // false: send to every stored subscription (admin manual test button).
  // true: skip users who already claimed today's daily quiz (cron nudge) —
  // don't nag people who already answered, and cut fan-out volume.
  onlyUnclaimed: boolean;
  payload: PushPayload;
}

// Single fan-out implementation shared by the admin manual send
// (app/admin/users/pushActions.ts) and the daily cron
// (app/api/cron/daily-reminder/route.ts). No auth check lives here on
// purpose — each caller owns its own gate (requireAdmin vs CRON_SECRET);
// this reads via the service-role client because push_subscriptions has no
// admin-read RLS policy (0050_push_subscriptions.sql).
export async function broadcastDailyReminder(options: BroadcastOptions): Promise<BroadcastResult> {
  const admin = createAdminClient();

  const { data: subscriptions, error } = await admin
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth');

  if (error) {
    console.error('[broadcastDailyReminder] failed to load subscriptions', error);
    throw new Error('Abunəliklər yüklənə bilmədi');
  }

  // Users who already did today's quiz — current_date (UTC) to match how
  // claim_daily_quiz_reward writes claim_date. Subscriptions with a null
  // user_id can't be matched, so they're always sent to.
  let claimedUserIds = new Set<string>();
  if (options.onlyUnclaimed) {
    const { data: claims, error: claimsError } = await admin
      .from('daily_quiz_claims')
      .select('user_id')
      .eq('claim_date', new Date().toISOString().slice(0, 10));

    if (claimsError) {
      console.error('[broadcastDailyReminder] failed to load today\'s claims', claimsError);
      throw new Error('Bugünkü cavablar yüklənə bilmədi');
    }

    claimedUserIds = new Set((claims ?? []).map((c) => c.user_id));
  }

  let sent = 0;
  let cleaned = 0;
  let failed = 0;
  let skipped = 0;

  const results = await Promise.allSettled(
    (subscriptions ?? []).map(async (row) => {
      if (options.onlyUnclaimed && row.user_id && claimedUserIds.has(row.user_id)) {
        skipped += 1;
        return;
      }

      const result = await sendPushToSubscription(
        { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
        options.payload
      );

      if (result.ok) {
        sent += 1;
        return;
      }

      if (result.expired) {
        const { error: deleteError } = await admin.from('push_subscriptions').delete().eq('id', row.id);
        if (deleteError) console.error('[broadcastDailyReminder] failed to clean up expired subscription', deleteError);
        cleaned += 1;
        return;
      }

      console.error('[broadcastDailyReminder] send failed', row.id, result.error);
      failed += 1;
    })
  );

  // allSettled already stops one bad subscription from aborting the batch;
  // this surfaces truly unexpected throws (bugs, not web-push send failures,
  // which are caught inside the mapped callback) as failed rather than
  // losing the count silently.
  for (const result of results) {
    if (result.status === 'rejected') {
      console.error('[broadcastDailyReminder] unexpected rejection', result.reason);
      failed += 1;
    }
  }

  return { sent, cleaned, failed, skipped };
}
