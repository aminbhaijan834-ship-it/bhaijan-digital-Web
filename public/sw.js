const V = 'bd-v1', SHELL = ['./', 'style.css', 'app.js', 'config.js', 'i18n.js', 'logo.svg', 'icon-192.png', 'icon-512.png', 'manifest.json', 'offline.html'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== V).map(x => caches.delete(x)))).then(() => clients.claim())));
// Network-first for the app shell (always fresh when online, works offline); API + remote images are never cached here (the app keeps its own data cache).
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.pathname.startsWith('/api/') || u.origin !== location.origin) return;
  e.respondWith(fetch(r).then(res => { if (res.ok) { const c = res.clone(); caches.open(V).then(x => x.put(r, c)); } return res; })
    .catch(() => caches.match(r).then(m => m || (r.mode === 'navigate' ? caches.match('offline.html') : Response.error()))));
});
