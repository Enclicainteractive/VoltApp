// VoltChat Service Worker - Advanced Offline Support
// Version 1.1.0

const CACHE_VERSION = 'voltchat-v2-v2'
const STATIC_CACHE = `${CACHE_VERSION}-static`
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`
const API_CACHE = `${CACHE_VERSION}-api`
const IMAGE_CACHE = `${CACHE_VERSION}-images`

// Cache durations (in milliseconds)
const CACHE_DURATIONS = {
  static: 7 * 24 * 60 * 60 * 1000, // 7 days
  dynamic: 24 * 60 * 60 * 1000,    // 1 day
  api: 5 * 60 * 1000,              // 5 minutes
  images: 30 * 24 * 60 * 60 * 1000 // 30 days
}

// Resources to cache immediately
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/offline.html'
]

// API endpoints to cache
const CACHEABLE_API_PATTERNS = [
  '/api/users/profile',
  '/api/servers',
  '/api/channels',
  '/api/messages'
]

// Auth/user/migration paths whose responses must NEVER be served from cache.
// Stale auth data is a root cause of the AuthContext deadlock.
const AUTH_BYPASS_PATTERNS = ['/auth/', '/users/', '/migration/']

function isAuthBypassRequest(request) {
  const url = new URL(request.url)
  return AUTH_BYPASS_PATTERNS.some(pattern => url.pathname.includes(pattern))
}

// Install event - cache static assets
self.addEventListener('install', event => {
  console.log('[SW] Installing service worker...')

  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        console.log('[SW] Caching static assets')
        return Promise.allSettled(
          STATIC_ASSETS.map(asset => cache.add(asset))
        )
      })
      .then(() => {
        return self.skipWaiting()
      })
  )
})

// Activate event - delete ALL caches not matching the current CACHE_VERSION,
// then claim clients so the new SW controls the page immediately.
self.addEventListener('activate', event => {
  console.log('[SW] Activating service worker...')

  const currentCaches = new Set([STATIC_CACHE, DYNAMIC_CACHE, API_CACHE, IMAGE_CACHE])

  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (!currentCaches.has(cacheName)) {
              console.log('[SW] Deleting old cache:', cacheName)
              return caches.delete(cacheName)
            }
          })
        )
      })
      .then(() => {
        return self.clients.claim()
      })
  )
})

// Fetch event - network strategies
self.addEventListener('fetch', event => {
  const { request } = event
  const url = new URL(request.url)

  if (request.method !== 'GET' || url.protocol === 'chrome-extension:') {
    return
  }

  if (isNavigationRequest(request)) {
    event.respondWith(networkFirstDocument(request))
  } else if (isBuildAssetRequest(request)) {
    event.respondWith(networkFirstAsset(request))
  } else if (isStaticAsset(request)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE))
  } else if (isApiRequest(request)) {
    event.respondWith(networkFirstWithApiCache(request))
  } else if (isImageRequest(request)) {
    event.respondWith(cacheFirst(request, IMAGE_CACHE))
  } else {
    event.respondWith(staleWhileRevalidate(request))
  }
})

// Message event - handle control messages from the app shell.
self.addEventListener('message', event => {
  const { type } = event.data || {}

  if (type === 'SKIP_WAITING') {
    console.log('[SW] Received SKIP_WAITING — activating immediately')
    self.skipWaiting()
  }

  if (type === 'CLEAR_CACHES') {
    console.log('[SW] Received CLEAR_CACHES — emptying all caches')
    event.waitUntil(
      caches.keys().then(names =>
        Promise.all(names.map(name => caches.delete(name)))
      )
    )
  }
})

// Push event - show a notification from the push payload.
self.addEventListener('push', event => {
  try {
    const data = event.data ? event.data.json() : {}
    const title = data.title || 'VoltChat'
    const options = {
      body: data.body || '',
      icon: data.icon || '/icons/icon-192.png',
      badge: data.badge || '/icons/badge-72.png',
      data: data.data || {}
    }
    event.waitUntil(self.registration.showNotification(title, options))
  } catch (err) {
    console.error('[SW] Push notification failed:', err)
  }
})

// Helper functions
function isStaticAsset(request) {
  const url = new URL(request.url)
  return url.pathname === '/manifest.json' ||
         url.pathname === '/offline.html'
}

function isNavigationRequest(request) {
  return request.mode === 'navigate'
}

function isBuildAssetRequest(request) {
  const url = new URL(request.url)
  return url.pathname.startsWith('/assets/') ||
         url.pathname.startsWith('/chunks/') ||
         request.destination === 'script' ||
         request.destination === 'style' ||
         request.destination === 'font' ||
         request.destination === 'worker'
}

function isApiRequest(request) {
  const url = new URL(request.url)
  return url.pathname.startsWith('/api/')
}

function isImageRequest(request) {
  const url = new URL(request.url)
  return request.destination === 'image' ||
         url.pathname.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i)
}

// Cache strategies
async function cacheFirst(request, cacheName) {
  try {
    const cache = await caches.open(cacheName)
    const cachedResponse = await cache.match(request)

    if (cachedResponse) {
      return cachedResponse
    }

    const networkResponse = await fetch(request)

    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone())
    }

    return networkResponse
  } catch (error) {
    console.error('[SW] Cache first strategy failed:', error)
    return Response.error()
  }
}

// networkFirstDocument: NETWORK-ONLY for navigation requests.
// Stale cached index.html can reference hash-busted JS chunks that no longer
// exist, causing blank-screen failures. Return a minimal offline shell instead
// of a cached page on network failure so the browser shows a clear error.
async function networkFirstDocument(request) {
  try {
    const networkResponse = await fetch(request)
    return networkResponse
  } catch (error) {
    // Do NOT serve a stale cached index.html — it references hash-busted JS.
    // Fall back to the dedicated offline page (plain HTML, no JS chunks).
    const offlineResponse = await caches.match('/offline.html')
    if (offlineResponse) {
      return offlineResponse
    }

    // Last resort: a minimal inline offline shell.
    return new Response(
      '<!DOCTYPE html><html><head><meta charset="utf-8"><title>VoltChat — Offline</title></head>' +
      '<body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#1e1e2e;color:#cdd6f4">' +
      '<div style="text-align:center"><h1>You are offline</h1><p>Please check your connection and reload.</p>' +
      '<button onclick="location.reload()" style="padding:10px 20px;border-radius:6px;border:none;background:#89b4fa;color:#1e1e2e;font-weight:600;cursor:pointer">Reload</button>' +
      '</div></body></html>',
      { status: 200, headers: { 'Content-Type': 'text/html' } }
    )
  }
}

async function networkFirstAsset(request) {
  const cache = await caches.open(DYNAMIC_CACHE)

  try {
    const networkResponse = await fetch(request, { cache: 'no-cache' })

    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone())
    }

    return networkResponse
  } catch (error) {
    const cachedResponse = await cache.match(request)
    if (cachedResponse) {
      return cachedResponse
    }

    console.error('[SW] Asset request failed:', request.url, error)
    return Response.error()
  }
}

// networkFirstWithApiCache: bypass cache entirely for auth/user/migration URLs.
// Serving stale auth responses is a root cause of the AuthContext deadlock.
async function networkFirstWithApiCache(request) {
  // Auth, user, and migration endpoints must always hit the network.
  if (isAuthBypassRequest(request)) {
    return fetch(request)
  }

  try {
    const networkResponse = await fetch(request)

    if (networkResponse.ok) {
      const cache = await caches.open(API_CACHE)
      cache.put(request, networkResponse.clone())
    }

    return networkResponse
  } catch (error) {
    const cache = await caches.open(API_CACHE)
    const cachedResponse = await cache.match(request)

    if (cachedResponse) {
      return cachedResponse
    }

    return new Response(
      JSON.stringify({
        error: 'Offline',
        message: 'This data is not available offline'
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(DYNAMIC_CACHE)
  const cachedResponse = await cache.match(request)

  const networkPromise = fetch(request).then(response => {
    if (response.ok) {
      cache.put(request, response.clone())
    }
    return response
  }).catch(() => null)

  if (cachedResponse) {
    networkPromise.catch(() => {})
    return cachedResponse
  }

  try {
    const networkResponse = await networkPromise
    return networkResponse || Response.error()
  } catch (error) {
    return Response.error()
  }
}

console.log('[SW] Service worker loaded')
