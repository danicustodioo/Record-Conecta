/* Record Conecta — Service Worker (PWA)
   Cacheia a "casca" do app para abrir rápido/offline.
   Os dados (Supabase, Google, fontes) sempre vão pela rede. */
const CACHE = 'record-conecta-v2';
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
    // Rede primeiro; se cair, abre a versão em cache.
    e.respondWith(fetch(req).catch(() => caches.match('./index.html')));
    return;
  }
  e.respondWith(caches.match(req).then((r) => r || fetch(req)));
});
