'use server';

import { createClient } from '@/lib/supabase/server';
import { claimPushNotificationReward } from '@/lib/coins/pushNotifications';
import { isAllowedPushEndpoint } from '@/lib/push/endpointValidation';
import { sendPushToSubscription } from '@/lib/push/webpush';

// Mirrors the browser's PushSubscriptionJSON shape (subscription.toJSON())
// so the frontend can pass what pushManager.subscribe() already returns
// without any reshaping.
export interface PushSubscriptionPayload {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface PushActionResult {
  error?: string;
  success?: boolean;
  reward?: number;
  balance?: number;
}

export async function subscribeToPush(subscription: PushSubscriptionPayload): Promise<PushActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: 'Giriş tələb olunur' };

  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    return { error: 'Yanlış abunəlik məlumatı' };
  }

  // Reject anything that isn't a real push-service URL outright — a
  // fabricated endpoint can't receive notifications, so there is nothing to
  // save and nothing to reward.
  if (!isAllowedPushEndpoint(subscription.endpoint)) {
    return { error: 'Yanlış abunəlik məlumatı' };
  }

  // upsert on (user_id, endpoint) so re-subscribing (e.g. after browser
  // key rotation) refreshes keys/created_at instead of erroring on the
  // unique constraint or leaving stale duplicate rows.
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      {
        user_id: user.id,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
      { onConflict: 'user_id,endpoint' }
    );

  if (error) return { error: error.message };

  // PROOF OF DELIVERY BEFORE PAYMENT. The allowlist above rules out an
  // obviously-fake host, but only an accepted push from the real service
  // proves this specific endpoint+keys triple actually works. Nothing below
  // can undo the upsert above: subscribing must succeed end-to-end (the user
  // still gets reminders) even when the reward is declined — we just don't
  // pay for an endpoint we couldn't verify.
  //
  // sendPushToSubscription THROWS if the VAPID env vars are missing, which
  // is a server misconfiguration, not a user error — catching it here keeps
  // a missing key from breaking subscribing entirely. Fail-closed on the
  // coin side (no reward), fail-open on the subscription side.
  let verified = false;
  try {
    const sendResult = await sendPushToSubscription(
      { endpoint: subscription.endpoint, keys: subscription.keys },
      { title: 'YOL', body: 'Bildirişlər aktivləşdirildi' }
    );
    verified = sendResult.ok;
    if (!sendResult.ok) {
      console.error('[push] verification push rejected, reward declined:', sendResult);
    }
  } catch (err) {
    console.error('[push] verification push could not be sent (VAPID misconfigured?):', err);
  }

  if (!verified) return { success: true };

  // One-time-ever reward, regardless of how many times this user has
  // enabled/disabled/re-enabled push before — grant_push_notification_reward's
  // unique(user_id) guard is what actually enforces "only the first time",
  // this call is a no-op (silently ignored) on every subsequent activation.
  const claim = await claimPushNotificationReward(user.id);
  if (claim.ok) {
    return { success: true, reward: claim.reward, balance: claim.balance };
  }

  return { success: true };
}

export async function unsubscribeFromPush(endpoint: string): Promise<PushActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: 'Giriş tələb olunur' };

  if (!endpoint) return { error: 'Yanlış endpoint' };

  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('user_id', user.id)
    .eq('endpoint', endpoint);

  if (error) return { error: error.message };

  return { success: true };
}
