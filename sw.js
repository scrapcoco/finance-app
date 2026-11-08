// Кэширует только оболочку приложения. Данные всегда берутся с сервера.
const CACHE = 'finance-v72';
const SHELL = ['./', 'index.html', 'css/app.css', 'js/config.js', 'js/pocketbase.umd.js',
  'js/main.js', 'js/router.js', 'js/ui.js', 'js/core/pb.js', 'js/core/util.js', 'js/core/icons.js', 'js/core/state.js', 'js/core/data.js', 'js/core/tasks.js', 'js/screens/tasks.js', 'js/screens/assistant.js', 'js/screens/login.js', 'js/screens/home.js', 'js/screens/form.js', 'js/screens/calendar.js', 'js/screens/history.js', 'js/screens/overview.js', 'js/screens/projects.js', 'js/screens/trading.js', 'js/screens/records.js', 'js/screens/debts.js', 'js/screens/settings.js', 'js/screens/push.js', 'js/screens/ingest.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/apple-touch-icon.png', 'img/bg-glass-1080.jpg', 'img/bg-glass-1920.jpg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Сначала сеть (чтобы обновления приходили сразу). Если сеть молчит дольше 3 с или ответила ошибкой —
  // берём из кэша. В кэш кладём только удачные ответы, чтобы туда не попала страница ошибки.
  const net = fetch(e.request).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return res;
  });
  e.waitUntil(net.catch(() => {}));
  e.respondWith((async () => {
    const cached = await caches.match(e.request);
    if (!cached) {
      return net.catch(() => (e.request.mode === 'navigate' ? caches.match('index.html') : Response.error()));
    }
    const slow = new Promise((r) => setTimeout(() => r(null), 3000));
    try {
      const res = await Promise.race([net, slow]);
      return res && res.ok ? res : cached;
    } catch (err) {
      return cached;
    }
  })());
});

// Push-напоминания
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Финансы', {
    body: d.body || '',
    tag: d.tag,
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    data: { url: d.url || './#/calendar' }
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './#/calendar', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) {
      if ('focus' in c) return c.focus().then((w) => (w && w.navigate ? w.navigate(url).catch(() => w) : w));
    }
    return self.clients.openWindow(url);
  }));
});
