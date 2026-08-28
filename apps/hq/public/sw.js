/* PlumbTrack HQ service worker — offline-first groundwork (Phase 4).
 * Static asset caching for the app shell + a Background Sync listener that
 * nudges open clients to drain their IndexedDB SyncQueue on reconnect. */

const CACHE = "plumbtrack-hq-v1"
const PRECACHE = ["/"]

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  )
})

self.addEventListener("activate", event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url)
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return

  // Aggressive cache-first for immutable build output; network-first for the
  // document so new deploys surface.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(event.request).then(
        cached =>
          cached ??
          fetch(event.request).then(response => {
            const copy = response.clone()
            void caches.open(CACHE).then(cache => cache.put(event.request, copy))
            return response
          })
      )
    )
    return
  }

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const copy = response.clone()
          void caches.open(CACHE).then(cache => cache.put("/", copy))
          return response
        })
        .catch(() => caches.match("/"))
    )
  }
})

async function notifyDrain() {
  const clients = await self.clients.matchAll({ includeUncontrolled: true, type: "window" })
  for (const client of clients) client.postMessage({ type: "drain-sync" })
}

self.addEventListener("sync", event => {
  if (event.tag === "plumbtrack-hq-sync") {
    event.waitUntil(notifyDrain())
  }
})

self.addEventListener("message", event => {
  if (event.data && event.data.type === "skip-waiting") self.skipWaiting()
})
