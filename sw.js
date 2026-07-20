/* Record Conecta — Service Worker (PWA)
   Cacheia a "casca" do app para abrir rápido/offline.
   Os dados (Supabase, Google, fontes) sempre vão pela rede. */
const CACHE = 'record-conecta-v13';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './favicon-32.png',
  './logo-symbol.png',
  './logo-symbol-light.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Só tratamos arquivos do próprio app. Supabase/Google/CDN vão direto pela rede.
  if (url.origin !== location.origin) return;
  if (req.mode === 'navigate') {
    // Sempre busca o HTML mais recente (sem cache); se cair, abre a versão salva.
    e.respondWith(fetch(req, { cache: 'no-store' }).catch(() => caches.match('./index.html')));
    return;
  }
  e.respondWith(caches.match(req).then((r) => r || fetch(req)));
});

// ---- Notificações push ----
self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (_) { data = { body: e.data ? e.data.text() : '' }; }
  const title = data.title || 'Record Conecta';
  const options = {
    body: data.body || '',
    icon: './icon-192.png',
    badge: './icon-192.png',
    tag: data.tag || 'evento',
    renotify: true,
    vibrate: [80, 40, 80],
    data: { url: data.url || './' },
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) { if ('focus' in c) return c.focus(); }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});
