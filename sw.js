const CACHE = 'pulse-and-proof-v8';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css', 'css/shell.css', 'vendor/chart.umd.min.js',
  'js/config.js', 'js/icons.js', 'js/sim.js', 'js/nasa.js', 'js/tasks.js', 'js/security.js', 'js/extras.js', 'js/accounts.js', 'js/redteam.js', 'js/app.js',
  'fonts/public-sans-latin-400-normal.woff2', 'fonts/public-sans-latin-500-normal.woff2', 'fonts/public-sans-latin-600-normal.woff2',
  'fonts/public-sans-latin-700-normal.woff2', 'fonts/barlow-condensed-latin-500-normal.woff2', 'fonts/barlow-condensed-latin-600-normal.woff2',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
