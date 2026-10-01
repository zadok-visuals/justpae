// Listens to global system notifications from your push server
self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const payload = event.data.json();

    const options = {
      body: payload.body || 'You have received a new secure support transmission.',
      icon: '/lovable-uploads/80df4e70-bf98-4b0e-886b-d1aa2e95b2ac.png',
      badge: '/favicon.ico',
      vibrate: [100, 50, 100],
      data: {
        url: payload.url || '/chat' // Fallback to direct app workspace link routing
      }
    };

    event.waitUntil(
      self.registration.showNotification(payload.title || 'Support Update', options)
    );
  } catch (e) {
    // String fallback if payload arrives unformatted
    const textPayload = event.data.text();
    event.waitUntil(
      self.registration.showNotification('justpae Update', {
        body: textPayload,
        icon: '/lovable-uploads/80df4e70-bf98-4b0e-886b-d1aa2e95b2ac.png'
      })
    );
  }
});

// Deep links directly to the chat room container when a user taps the banner notification
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // If a browser instance is already open, focus it and redirect
      for (let client of windowClients) {
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise, open a fresh dedicated standalone panel window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
