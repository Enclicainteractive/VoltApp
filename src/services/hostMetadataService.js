/**
 * hostMetadataService
 *
 * Fetches and caches federation metadata from remote VoltChat hosts.
 * When a user from a different server (host) is encountered, this service
 * retrieves that server's /api/federation/info to learn its correct
 * apiUrl, imageServerUrl, cdnUrl, etc. so assets (avatars, banners) and
 * API calls are routed to the right place.
 *
 * If the requested host matches the current server, local config is returned
 * immediately without any network request.
 */

import { getStoredServer } from './serverConfig'

// In-memory cache: host -> metadata object
const memCache = new Map()

// SessionStorage key prefix
const SS_PREFIX = 'volt_hostmeta_'

// How long to trust a cached entry (ms) — 10 minutes
const CACHE_TTL = 10 * 60 * 1000

// Hosts currently being fetched — prevent duplicate in-flight requests
const inFlight = new Map()

/**
 * Derive a likely base URL from a host string.
 * e.g. "volt.example.com" -> "https://volt.example.com"
 *      "localhost:5000"    -> "http://localhost:5000"
 */
function hostToBaseUrl(host) {
  if (!host) return null
  if (host.startsWith('http://') || host.startsWith('https://')) return host
  const isLocal = host.startsWith('localhost') || host.startsWith('127.') || host.startsWith('192.168.')
  return `${isLocal ? 'http' : 'https'}://${host}`
}

/**
 * Read a cached entry from sessionStorage.
 * Returns null if missing or expired.
 */
function readSessionCache(host) {
  try {
    const raw = sessionStorage.getItem(SS_PREFIX + host)
    if (!raw) return null
    const entry = JSON.parse(raw)
    if (Date.now() - entry.fetchedAt > CACHE_TTL) {
      sessionStorage.removeItem(SS_PREFIX + host)
      return null
    }
    return entry.data
  } catch {
    return null
  }
}

/**
 * Write an entry to sessionStorage.
 */
function writeSessionCache(host, data) {
  try {
    sessionStorage.setItem(SS_PREFIX + host, JSON.stringify({ fetchedAt: Date.now(), data }))
  } catch { /* ignore quota errors */ }
}

/**
 * Build a metadata object from the current server's local config.
 * Used when the requested host is the same as the connected server.
 */
function localMetadata(server) {
  return {
    host: server.host,
    name: server.name || null,
    apiUrl: server.apiUrl,
    imageServerUrl: server.imageApiUrl || server.apiUrl,
    cdnEnabled: false,
    cdnUrl: null,
    federationEnabled: false,
    local: true
  }
}

/**
 * Fetch /api/federation/info from a remote host and normalise the response.
 * @param {string} baseUrl  e.g. "https://other.example.com"
 * @returns {Promise<object|null>}
 */
async function fetchFederationInfo(baseUrl) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 6000)
  try {
    const res = await fetch(`${baseUrl}/api/federation/info`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal
    })
    clearTimeout(timeout)
    if (!res.ok) return null
    const json = await res.json()
    return {
      host: json.host,
      name: json.name || null,
      apiUrl: json.apiUrl || baseUrl,
      imageServerUrl: json.imageServerUrl || json.apiUrl || baseUrl,
      cdnEnabled: json.cdnEnabled || false,
      cdnUrl: json.cdnUrl || null,
      federationEnabled: json.federationEnabled || false,
      features: json.features || {},
      version: json.version || null,
      local: false
    }
  } catch {
    clearTimeout(timeout)
    return null
  }
}

/**
 * Get the metadata for a given host.
 *
 * @param {string} host  e.g. "volt.example.com" or "localhost:5000"
 * @returns {Promise<object>} Metadata object with at minimum:
 *   { host, apiUrl, imageServerUrl, cdnEnabled, cdnUrl, local }
 *   Returns a safe fallback (using the current server's imageServerUrl) on any error.
 */
export async function getHostMetadata(host) {
  if (!host) return null

  const currentServer = getStoredServer()
  const currentHost = currentServer?.host

  // Same host as current server — return local config immediately, no fetch
  if (host === currentHost) {
    return localMetadata(currentServer)
  }

  // Check in-memory cache first
  if (memCache.has(host)) {
    return memCache.get(host)
  }

  // Check sessionStorage cache
  const cached = readSessionCache(host)
  if (cached) {
    memCache.set(host, cached)
    return cached
  }

  // De-duplicate in-flight requests for the same host
  if (inFlight.has(host)) {
    return inFlight.get(host)
  }

  const baseUrl = hostToBaseUrl(host)
  if (!baseUrl) return fallback(currentServer)

  const promise = fetchFederationInfo(baseUrl).then(data => {
    inFlight.delete(host)
    if (!data) {
      // Fetch failed — create a best-effort fallback using host-derived base URL
      const fb = {
        host,
        apiUrl: baseUrl,
        imageServerUrl: baseUrl,
        cdnEnabled: false,
        cdnUrl: null,
        federationEnabled: false,
        local: false,
        error: true
      }
      memCache.set(host, fb)
      writeSessionCache(host, fb)
      return fb
    }
    memCache.set(host, data)
    writeSessionCache(host, data)
    return data
  })

  inFlight.set(host, promise)
  return promise
}

/**
 * Get the image base URL for a given host.
 * Returns the CDN URL if the remote host has one enabled, otherwise imageServerUrl.
 *
 * @param {string} host
 * @returns {Promise<string>}
 */
export async function getImageBaseForHost(host) {
  const meta = await getHostMetadata(host)
  if (!meta) {
    const s = getStoredServer()
    return s?.imageApiUrl || s?.apiUrl || ''
  }
  return meta.cdnEnabled && meta.cdnUrl ? meta.cdnUrl : meta.imageServerUrl
}

/**
 * Synchronous version — returns cached value or falls back to current server's imageApiUrl.
 * Use this when you need a value synchronously and are fine with a potential fallback.
 *
 * @param {string} host
 * @returns {string}
 */
export function getImageBaseForHostSync(host) {
  if (!host) {
    const s = getStoredServer()
    return s?.imageApiUrl || s?.apiUrl || ''
  }
  const currentServer = getStoredServer()
  if (host === currentServer?.host) {
    return currentServer?.imageApiUrl || currentServer?.apiUrl || ''
  }
  const cached = memCache.get(host) || readSessionCache(host)
  if (cached) {
    return cached.cdnEnabled && cached.cdnUrl ? cached.cdnUrl : cached.imageServerUrl
  }
  // Not cached yet — kick off async fetch for next render, return base fallback
  getHostMetadata(host) // fire and forget
  const base = hostToBaseUrl(host)
  return base || currentServer?.imageApiUrl || currentServer?.apiUrl || ''
}

/**
 * Invalidate the cache for a host (e.g. after a config change).
 * @param {string} host
 */
export function invalidateHostMetadata(host) {
  memCache.delete(host)
  try { sessionStorage.removeItem(SS_PREFIX + host) } catch { /* ignore */ }
}

/**
 * Preload metadata for an array of hosts in parallel.
 * Call this when a member list loads to warm the cache before renders.
 * @param {string[]} hosts
 */
export function preloadHostMetadata(hosts) {
  const currentServer = getStoredServer()
  const unique = [...new Set(hosts.filter(h => h && h !== currentServer?.host))]
  for (const host of unique) {
    if (!memCache.has(host) && !inFlight.has(host)) {
      getHostMetadata(host) // fire and forget — populates cache
    }
  }
}
