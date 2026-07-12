// Service worker to support device push alerts
self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {}
  event.waitUntil(
    self.registration.showNotification(data.title || 'GLS Moodle', {
      body: data.body || 'New update available!',
      icon: '/logo192.png',
      badge: '/logo192.png'
    })
  )
})
