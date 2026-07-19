'use client';

import { useEffect, useState } from 'react';
import { Button, toast } from '@heroui/react';
import { BellIcon } from '@/components/icons';
import { Spinner } from '@/components/Spinner';
import { subscribeToPush, unsubscribeFromPush } from '@/app/account/pushActions';

// Standard VAPID applicationServerKey conversion — pushManager.subscribe()
// requires a Uint8Array, but the env var is stored as the usual base64url
// string. No existing helper for this in the repo (per task scope), kept
// local since this is the only call site.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

type Status = 'checking' | 'unsupported' | 'subscribed' | 'unsubscribed';

export default function PushNotificationOptIn() {
  const [status, setStatus] = useState<Status>('checking');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        if (!cancelled) setStatus('unsupported');
        return;
      }
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        const subscription = await registration?.pushManager.getSubscription();
        if (!cancelled) setStatus(subscription ? 'subscribed' : 'unsubscribed');
      } catch {
        if (!cancelled) setStatus('unsubscribed');
      }
    }

    void check();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubscribe() {
    setPending(true);
    try {
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) {
        toast.danger('Bildiriş konfiqurasiyası tapılmadı');
        return;
      }

      let registration = await navigator.serviceWorker.getRegistration();
      if (!registration) {
        registration = await navigator.serviceWorker.register('/sw.js');
      }
      await navigator.serviceWorker.ready;

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        toast.danger('Bildiriş icazəsi verilmədi');
        return;
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
      });

      const result = await subscribeToPush(subscription.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } });
      if (result.error) {
        toast.danger(result.error);
        return;
      }

      setStatus('subscribed');
      if (result.reward && result.balance != null) {
        toast.success(`Bildirişlər aktivləşdirildi — +${result.reward} coin qazandınız`);
        // Live-updates the navbar CoinBadge without a page refresh — same
        // contract app/chat/ChatClient.tsx uses after each message's coin
        // spend (see components/CoinBadge.tsx's window listener).
        window.dispatchEvent(new CustomEvent('coin-balance-update', { detail: { balance: result.balance } }));
      } else {
        toast.success('Bildirişlər aktivləşdirildi');
      }
    } catch {
      toast.danger('Bildirişləri aktivləşdirmək uğursuz oldu');
    } finally {
      setPending(false);
    }
  }

  async function handleUnsubscribe() {
    setPending(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();

      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();
        const result = await unsubscribeFromPush(endpoint);
        if (result.error) {
          toast.danger(result.error);
          return;
        }
      }

      setStatus('unsubscribed');
      toast.success('Bildirişlər deaktiv edildi');
    } catch {
      toast.danger('Bildirişləri deaktiv etmək uğursuz oldu');
    } finally {
      setPending(false);
    }
  }

  if (status === 'unsupported') {
    return null;
  }

  return (
    <div className="glass-card rounded-2xl p-6 space-y-3">
      <div className="flex items-center gap-3 border-b border-outline-variant/30 pb-4">
        <div className="flex size-10 items-center justify-center rounded-xl bg-safety-yellow/15 text-safety-yellow">
          <BellIcon />
        </div>
        <h2 className="text-headline-md text-[18px]">Push Bildirişlər</h2>
      </div>

      <div className="flex flex-col gap-3 py-1 sm:flex-row sm:items-center sm:justify-between">
        <span className="flex flex-col text-left">
          <span className="text-body-md font-semibold text-on-surface">
            {status === 'subscribed' ? 'Bildirişlər aktivdir' : 'Bildirişlər deaktivdir'}
          </span>
          <span className="text-label-sm text-on-surface-variant">
            Yeni qaydalar və xatırlatmalar barədə push bildiriş alın
          </span>
        </span>

        {status === 'checking' ? (
          <Spinner size="sm" />
        ) : status === 'subscribed' ? (
          <Button variant="outline" size="sm" isPending={pending} onPress={handleUnsubscribe}>
            {({ isPending }) => (
              <>
                {isPending ? <Spinner size="sm" tone="current" /> : null}
                Deaktiv et
              </>
            )}
          </Button>
        ) : (
          <Button variant="primary" size="sm" isPending={pending} onPress={handleSubscribe}>
            {({ isPending }) => (
              <>
                {isPending ? <Spinner size="sm" tone="current" /> : null}
                Bildirişləri aktivləşdir
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
