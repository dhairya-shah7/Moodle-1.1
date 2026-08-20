const CACHE_NAME = 'moodle-dashboard-v3-clean'
const ASSETS = [
  '/',
  '/index.html',
  '/favicon.svg'
]

// Install: pre-cache critical app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS).catch(() => {})
    }).then(() => self.skipWaiting())
  )
})

// Activate: claim clients immediately & clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    }).then(() => self.clients.claim())
  )
})

// Fetch strategy:
// 1. Navigation / Document requests: Network-first, fallback to cached index.html if firewall/offline blocks connection
// 2. Static JS/CSS assets: Cache-first with network background update
self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)

  // Ignore non-GET requests or browser extension requests
  if (req.method !== 'GET' || !url.protocol.startsWith('http')) return

  // NEVER intercept API proxy requests, Moodle requests, or wstoken calls
  if (url.pathname.includes('/proxy') || url.pathname.includes('api') || url.search.includes('wstoken')) return

  // For HTML navigation requests: Network first, fallback to cached index.html if offline
  if (req.mode === 'navigate' || req.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone()
            caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {})
          }
          return response
        })
        .catch(async () => {
          try {
            const cache = await caches.open(CACHE_NAME)
            const cached = await cache.match('/index.html') || await cache.match('/')
            return cached || new Response('<!DOCTYPE html><html><head><title>Moodle 1.1</title></head><body><div id="root"></div></body></html>', { headers: { 'Content-Type': 'text/html' } })
          } catch (e) {
            return new Response('<!DOCTYPE html><html><head><title>Moodle 1.1</title></head><body><div id="root"></div></body></html>', { headers: { 'Content-Type': 'text/html' } })
          }
        })
    )
    return
  }

  // For static JS/CSS/asset files: Cache first, fallback to network
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) {
        fetch(req).then((res) => {
          if (res && res.status === 200) {
            caches.open(CACHE_NAME).then((c) => c.put(req, res))
          }
        }).catch(() => {})
        return cached
      }
      return fetch(req).then((res) => {
        if (res && res.status === 200 && (url.pathname.includes('/assets/') || url.origin !== location.origin)) {
          const copy = res.clone()
          caches.open(CACHE_NAME).then((c) => c.put(req, copy))
        }
        return res
      }).catch(() => fetch(req))
    }).catch(() => fetch(req))
  )
})

// Push notifications handler
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {}
  event.waitUntil(
    self.registration.showNotification(data.title || 'Moodle 1.1', {
      body: data.body || 'New update available!',
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      tag: 'moodle-notif'
    })
  )
})
