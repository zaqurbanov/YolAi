import 'server-only';
import webpush from 'web-push';

// Single place allowed to call webpush.setVapidDetails() — same discipline
// as lib/llm/index.ts owning all provider branching. Configured lazily (not
// at module top-level unconditionally) so a missing env var only breaks
// push sends, not every server-side import of this file's types elsewhere.
let configured = false;

function ensureConfigured(): void {
  if (configured) return;

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;

  if (!publicKey || !privateKey || !subject) {
    throw new Error('VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT must be set to send push notifications');
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

export interface PushSubscriptionKeys {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface PushPayload {
  title: string;
  body: string;
}

export type SendPushResult =
  | { ok: true }
  | { ok: false; expired: true }
  | { ok: false; expired: false; error: unknown };

// Returns a discriminated result instead of throwing/deleting rows itself —
// callers (e.g. sendPushReminderToAll) own the Supabase row lifecycle and
// decide what "expired" means for their loop (delete + count as cleaned up).
// 404/410 are the statusCodes web-push's docs call out as "subscription no
// longer valid, delete it" (https://github.com/web-push-libs/web-push).
export async function sendPushToSubscription(
  subscription: PushSubscriptionKeys,
  payload: PushPayload
): Promise<SendPushResult> {
  ensureConfigured();

  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    return { ok: true };
  } catch (error) {
    const statusCode = (error as { statusCode?: number } | null)?.statusCode;
    if (statusCode === 404 || statusCode === 410) {
      return { ok: false, expired: true };
    }
    return { ok: false, expired: false, error };
  }
}
