/*
 * Caches what the application has already fetched, so a second visit starts
 * offline and Android offers to install it to the home screen.
 *
 * Two different strategies for two different kinds of file:
 *
 * - Everything under /assets/ — the built JS, CSS, and the multi-megabyte
 *   Postgres WebAssembly bundle — is cache-first. Vite names each of these
 *   with a content hash, so a real change always gets a new URL; a stale
 *   cache entry for one of these is not a risk the way it is for anything
 *   whose name stays fixed.
 * - Everything else is network-first: the page itself (index.html, requested
 *   on navigation), and the small unhashed files under public/ — the icons,
 *   the wordmark, the manifest — whose filenames never change between
 *   builds. A changed icon under the same old URL is exactly the case
 *   cache-first cannot detect: it would keep serving the old bytes forever,
 *   the same failure index.html would have had. Network-first still falls
 *   back to the cache when there is no connection, which is what makes the
 *   app open at all offline.
 */
const CACHE = 'trigo-v3-1788602081527';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name))),
      )
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      // Awaited deliberately: a service worker can be torn down the moment
      // nothing is left chained into respondWith's promise, and an
      // unawaited cache.put races that teardown — it looks like it works
      // in a quick manual check and then silently never persists.
      const cache = await caches.open(CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const isHashedBuildAsset = url.pathname.includes('/assets/');
  event.respondWith(isHashedBuildAsset ? cacheFirst(request) : networkFirst(request));
});
