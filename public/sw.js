// Minimal push service worker for YOL. Still deliberately NOT a caching
// service worker — no caches.open/caches.match anywhere. This is a live
// streaming/auth chat app; an offline-caching layer remains out of scope on
// purpose (see backend CLAUDE.md notes on scope discipline).

self.addEventListener('install', () => {
  self.skipWaiting();
});

// Presence-only fetch listener. It intentionally never calls
// event.respondWith(), so every request falls straight through to the network
// exactly as it would without a service worker — no interception, no caching,
// no performance cost from proxying.
//
// It exists solely because Chrome's install-prompt heuristic still requires a
// fetch handler to be present before firing `beforeinstallprompt`, which is
// what lets components/InstallAppButton.tsx trigger a real install instead of
// falling back to its manual-instructions modal. (Chrome dropped the fetch
// requirement for *menu* installation in 108/112, but not for the prompt.)
//
// If a genuine offline experience is ever wanted, this is the hook to build
// it on — replace the empty body with a real caching strategy rather than
// adding a second listener.
self.addEventListener('fetch', () => {
  // Intentionally empty — see above.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = { title: 'YOL', body: '' };

  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = { title: 'YOL', body: event.data.text() };
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || 'YOL', {
      body: payload.body || '',
      icon: '/logo.png',
      badge: '/logo.png',
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('/');
    })
  );
});
