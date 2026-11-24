const CACHE = 'malapronta-v2';
const ASSETS = ['/', '/index.html', '/extrato-ano.js'];

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

function injectExtratoEnhancement(response) {
  if (!response || !response.headers.get('content-type')?.includes('text/html')) return response;
  return response.text().then(html => {
    if (!html.includes('/extrato-ano.js')) {
      html = html.replace(/<\/body>/i, '<script src="/extrato-ano.js"></script></body>');
    }
    const headers = new Headers(response.headers);
    headers.delete('content-length');
    return new Response(html, { status: response.status, statusText: response.statusText, headers });
  });
}

// Network-first: serve current HTML with the optional Club statement enhancement,
// falling back to the cached app and applying the same injection while offline.
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const isAppPage = request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('/index.html');

  event.respondWith(
    fetch(request).then(response => {
      const clone = response.clone();
      caches.open(CACHE).then(cache => cache.put(request, clone));
      return isAppPage ? injectExtratoEnhancement(response) : response;
    }).catch(async () => {
      const cached = await caches.match(request);
      return isAppPage ? injectExtratoEnhancement(cached) : cached;
    })
  );
});
