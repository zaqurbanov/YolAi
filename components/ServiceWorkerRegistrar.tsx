'use client';

import { useEffect } from 'react';

/**
 * Registers /sw.js on app load.
 *
 * This used to happen only inside PushNotificationOptIn, i.e. exclusively for
 * users who opted into push notifications — so for everyone else there was no
 * service worker at all. Chrome's install-prompt heuristic requires a
 * registered service worker (with a fetch handler present), so without this
 * `beforeinstallprompt` never fired and InstallAppButton could only ever show
 * its manual-instructions modal instead of triggering a real install.
 *
 * Registration is idempotent: PushNotificationOptIn still calls
 * getRegistration()/register() on its own path and will simply find this one
 * already active.
 */
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    // Deliberately not awaited/reported: a failed registration must never
    // surface to the user or block rendering — the only consequence is that
    // the install prompt stays unavailable, which the install button already
    // degrades gracefully for.
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('[pwa] service worker registration failed:', err);
    });
  }, []);

  return null;
}
