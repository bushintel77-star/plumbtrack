const OUTBOX_SYNC_TAG = "plumbtrack-outbox";

// Cache version — bump after a deploy that changes the app shell so stale
// HTML/asset entries are purged on the next activation.
const CACHE_VERSION = "v1";
const SHELL_CACHE = `plumbtrack-shell-${CACHE_VERSION}`;
const ASSET_CACHE = `plumbtrack-assets-${CACHE_VERSION}`;
const DATA_CACHE = `plumbtrack-data-${CACHE_VERSION}`;
const NAV_CACHE_LIMIT = 3; // SPA shell — never keep more than a few navigations
const DATA_CACHE_LIMIT = 20; // vault/quote JSON — generous headroom, pruned when full

// Same-origin, content-hashed static assets that are safe to serve from cache
// first (their filenames change when content changes).
const STATIC_PATTERNS = [
  /^\/_next\/static\//,
  /^\/icon-\d+(-maskable)?\.png$/,
  /^\/apple-touch-icon\.png$/,
  /^\/favicon\.png$/,
  /^\/manifest\.webmanifest$/,
];

// Data-download endpoints the app uses at boot for the document vault and
// quote lists. These live on the (cross-origin) API, so they're matched by
// pathname rather than origin. Served network-first with a cached fallback so
// the last-good vault/quote data opens offline too — not just the shell.
const DATA_PATTERNS = [
  /^\/api\/documents(\/|\?|$)/,
  /^\/api\/quotes(\/|\?|$)/,
];

/**
 * Network-first with cached fallback for a data GET. Refreshes the cache when
 * the network answers, falls back to the last cached body when it doesn't —
 * the field-carried copy of the vault/quotes stays readable offline.
 */
function networkFirst(request, cache) {
  return fetch(request)
    .then((response) => {
      if (response.ok && response.status === 200) {
        const copy = response.clone();
        cache
          .put(request, copy)
          .then(() => pruneDataCache(cache))
          .catch(() => undefined);
      }
      return response;
    })
    .catch(() => cache.match(request));
}

function pruneDataCache(cache) {
  return cache.keys().then(async (keys) => {
    // Drop urlencoded-/page-specific entries beyond the limit, keeping newest.
    const ordered = keys.sort((a, b) => (b.url > a.url ? 1 : -1));
    for (const stale of ordered.slice(DATA_CACHE_LIMIT)) await cache.delete(stale);
  });
}

self.addEventListener("install", (event) => {
  // Warm the shell so the app is available offline from the first install,
  // even before the user has visited once with connectivity.
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.add("/"))
      .catch(() => undefined),
  );
  self.skipWaiting();
});

// Allow the page to background-precache the data-download URLs (document vault
// + quote lists). The page knows the env-tuned API origin and the org header;
// posting the exact URLs + headers lets the SW warm them without hardcoding
// localhost:8080 or the tenant id in the SW (a bare cross-origin fetch without
// the org header is rejected 400 by the tenant plugin).
self.addEventListener("message", (event) => {
  const data = event.data ?? {};
  if (data.type !== "PLUMBTRACK_PRECACHE") return;
  const urls = Array.isArray(data.urls) ? data.urls : [];
  const headers = typeof data.headers === "object" && data.headers ? data.headers : {};
  if (urls.length === 0) return;
  event.waitUntil(
    caches.open(DATA_CACHE).then(async (cache) => {
      await Promise.all(
        urls.map((url) =>
          fetch(url, { headers })
            .then((response) => {
              if (response.ok && response.status === 200) cache.put(url, response);
            })
            .catch(() => undefined),
        ),
      );
      await pruneDataCache(cache);
    }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      // Purge entries from previous cache versions.
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("plumbtrack-") && !key.endsWith(CACHE_VERSION))
            .map((key) => caches.delete(key)),
        ),
      ),
    ]),
  );
});

self.addEventListener("sync", (event) => {
  if (event.tag !== OUTBOX_SYNC_TAG) return;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      clients.forEach((client) => client.postMessage({ type: "PLUMBTRACK_SYNC_REQUEST" }));
    }),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  if (request.cache === "only-if-cached" && request.mode !== "same-origin") return;

  const url = new URL(request.url);

  // ── Navigations: network-first, cached-shell fallback ────────────────────
  // Fresh HTML when online (and the copy is cached for next time); the cached
  // shell is served when offline so the PWA still boots. The app itself is
  // local-first, so once the shell is up, all data keeps working.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && url.origin === self.location.origin) {
            const copy = response.clone();
            event.waitUntil(
              caches
                .open(SHELL_CACHE)
                .then(async (cache) => {
                  await cache.put(request, copy);
                  const keys = await cache.keys();
                  const navKeys = keys.filter((key) => key.mode === "navigate");
                  for (const stale of navKeys.slice(0, Math.max(0, navKeys.length - NAV_CACHE_LIMIT))) {
                    await cache.delete(stale);
                  }
                })
                .catch(() => undefined),
            );
          }
          return response;
        })
        .catch(() =>
          caches.open(SHELL_CACHE).then((cache) =>
            cache.match(request).then((cached) => cached || cache.match("/")),
          ),
        ),
    );
    return;
  }

  // ── Data endpoints (document vault / quotes): network-first + fallback ───
  // Refreshed whenever the app reads them online; served from cache when the
  // API is unreachable so the vault stays readable offline, not just the shell.
  if (DATA_PATTERNS.some((pattern) => pattern.test(url.pathname))) {
    event.respondWith(
      caches.open(DATA_CACHE).then(async (cache) => networkFirst(request, cache)).catch(() => fetch(request)),
    );
    return;
  }

  // ── Same-origin static assets: cache-first, fill on miss ─────────────────
  if (url.origin === self.location.origin && STATIC_PATTERNS.some((pattern) => pattern.test(url.pathname))) {
    event.respondWith(
      caches.open(ASSET_CACHE).then((cache) =>
        cache.match(request).then((cached) => {
          const network = fetch(request).then((response) => {
            if (response.ok) {
              cache.put(request, response.clone()).catch(() => undefined);
            }
            return response;
          });
          return cached || network;
        }),
      ),
    );
    return;
  }

  // ── Everything else ──────────────────────────────────────────────────────
  // API calls (same- or cross-origin) pass straight through — the outbox owns
  // write sync and never serves stale data from a cache.
});
