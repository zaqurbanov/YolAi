// Minimal push-only service worker for YOL. Deliberately NOT a caching
// service worker — no fetch listener, no caches.open/caches.match anywhere.
// This is a live streaming/auth chat app; an offline-caching layer is out
// of scope on purpose (see backend CLAUDE.md notes on scope discipline).

self.addEventListener('install', () => {
  self.skipWaiting();
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
