const CACHE = 'malapronta-v3';
const ASSETS = ['/', '/index.html', '/extrato-ano.js', '/ui-business-rules.js'];
const ENHANCEMENTS = ['<script src="/extrato-ano.js"></script>', '<script src="/ui-business-rules.js"></script>'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))
  ));
  self.clients.claim();
});

async function enhanceHtml(response) {
  if (!response || !response.headers.get('content-type')?.includes('text/html')) return response;
  let html = await response.text();
  for (const script of ENHANCEMENTS) {
    const src = script.match(/src="([^"]+)"/)[1];
    if (!html.includes(src)) html = html.replace(/<\/body>/i, `${script}</body>`);
  }
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  return new Response(html, { status: response.status, statusText: response.statusText, headers });
}

// Network-first: keep the current app fresh and inject additive UI behavior;
// when offline, use the cached app and inject the same enhancements.
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const isAppPage = request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('/index.html');

  event.respondWith(
    fetch(request).then(response => {
      const clone = response.clone();
      caches.open(CACHE).then(cache => cache.put(request, clone));
      return isAppPage ? enhanceHtml(response) : response;
    }).catch(async () => {
      const cached = await caches.match(request);
      return isAppPage ? enhanceHtml(cached) : cached;
    })
  );
});
