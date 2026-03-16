const MAIN_SERVERS_KEY = 'voltchat_main_servers'
const CURRENT_SERVER_KEY = 'voltchat_current_server'
const CONFIG_VERSION = 4

const getProxyTokenUrl = (apiUrl) => (apiUrl ? `${apiUrl}/api/auth/proxy/token` : null)
const getProxyRevokeUrl = (apiUrl) => (apiUrl ? `${apiUrl}/api/auth/proxy/revoke` : null)
const DISCOVERY_TIMEOUT_MS = 6500

const isLocalHost = (host) => (
  typeof host === 'string'
  && (
    host.startsWith('localhost')
    || host.startsWith('127.')
    || host.startsWith('192.168.')
    || host.startsWith('10.')
  )
)

const normalizeBaseUrl = (value) => {
  if (!value) return null
  try {
    const parsed = new URL(String(value))
    return `${parsed.protocol}//${parsed.host}`
  } catch {
    return null
  }
}

const normalizeHost = (value) => {
  if (!value) return null
  const trimmed = String(value).trim()
  if (!trimmed) return null
  try {
    return new URL(trimmed.includes('://') ? trimmed : `${isLocalHost(trimmed) ? 'http' : 'https'}://${trimmed}`).host.toLowerCase()
  } catch {
    return trimmed
      .replace(/^https?:\/\//i, '')
      .replace(/^voltchat:\/\//i, '')
      .replace(/\/.*$/, '')
      .toLowerCase()
  }
}

const hostToBaseUrl = (host) => {
  if (!host) return null
  if (/^https?:\/\//i.test(host)) return normalizeBaseUrl(host)
  return `${isLocalHost(host) ? 'http' : 'https'}://${host}`
}

const sanitizeId = (value, fallback = 'volt-mainnet') => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized || fallback
}

const isVoltMainnetDiscovery = (value) => {
  if (!value || typeof value !== 'object') return false
  const softwareName = typeof value.software === 'string'
    ? value.software
    : value.software?.name
  return value.instanceType === 'voltchat-mainnet' || softwareName === 'voltchat'
}

const normalizeStoredServerRecord = (server) => {
  if (!server) return null
  const normalized = buildServerRecord(server, server)
  normalized.discovery = server.discovery || normalized.discovery || null
  normalized.isDiscovered = server.isDiscovered ?? normalized.isDiscovered ?? false
  return normalized
}

const buildServerRecord = (candidate, discovery = {}) => {
  const endpoints = discovery.endpoints || {}
  const baseApiUrl = normalizeBaseUrl(
    endpoints.api || discovery.apiUrl || candidate.apiUrl || hostToBaseUrl(candidate.host)
  )
  const host = normalizeHost(discovery.host || candidate.host || baseApiUrl)
  const imageApiUrl = normalizeBaseUrl(
    endpoints.images || discovery.imageServerUrl || candidate.imageApiUrl || baseApiUrl
  ) || baseApiUrl
  const socketUrl = normalizeBaseUrl(
    endpoints.socket || discovery.socketUrl || candidate.socketUrl || baseApiUrl
  ) || baseApiUrl
  const auth = discovery.auth || {}
  const oauth = auth.oauth || {}
  const local = auth.local || {}
  const name = discovery.name || candidate.name || host || 'Volt Mainnet'
  const id = sanitizeId(candidate.id || discovery.id || host || name, 'volt-mainnet')

  return {
    version: CONFIG_VERSION,
    id,
    name,
    host,
    apiUrl: baseApiUrl,
    imageApiUrl,
    authUrl: oauth.enabled ? (oauth.authUrl || candidate.authUrl || '') : (candidate.authUrl || ''),
    tokenUrl: getProxyTokenUrl(baseApiUrl),
    revokeUrl: getProxyRevokeUrl(baseApiUrl),
    socketUrl,
    clientId: oauth.enabled ? (oauth.clientId || candidate.clientId || '') : (candidate.clientId || ''),
    website: discovery.website || candidate.website || baseApiUrl,
    icon: candidate.icon || null,
    description: discovery.description || candidate.description || '',
    mode: discovery.mode || candidate.mode || null,
    software: (typeof discovery.software === 'string' ? discovery.software : discovery.software?.name) || candidate.software || null,
    federationEnabled: discovery.federationEnabled ?? discovery.capabilities?.federation ?? candidate.federationEnabled ?? false,
    discoveryVersion: discovery.discoveryVersion || discovery.protocolVersion || candidate.discoveryVersion || null,
    verified: discovery.verification?.valid ?? candidate.verified ?? false,
    isDiscovered: candidate.isDiscovered ?? Boolean(discovery.host || discovery.apiUrl || Object.keys(endpoints).length > 0),
    discovery: candidate.discovery || (Object.keys(discovery).length > 0 ? {
      source: discovery.endpoints?.discovery || null,
      protocol: discovery.protocol || discovery.software?.protocol || null,
      protocolVersion: discovery.protocolVersion || discovery.discoveryVersion || null,
      validMainnet: discovery.validMainnet ?? discovery.mainnet ?? discovery.verification?.valid ?? false,
      checkedAt: discovery.verification?.checkedAt || null
    } : null),
    authMode: {
      oauthEnabled: oauth.enabled ?? Boolean(candidate.clientId && candidate.authUrl),
      localAuthEnabled: local.enabled ?? !candidate.clientId,
      canRegister: local.canRegister ?? false
    }
  }
}

const parseServerInput = (input) => {
  const raw = String(input || '').trim()
  if (!raw) return null

  const candidates = []
  const pushCandidate = (value) => {
    const baseUrl = normalizeBaseUrl(value)
    if (!baseUrl || candidates.some((entry) => entry.baseUrl === baseUrl)) return
    candidates.push({ baseUrl, host: normalizeHost(baseUrl) })
  }

  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw)
      pushCandidate(parsed.origin)
      if (/^volt\.gg$/i.test(parsed.host) && /^\/inv\//.test(parsed.pathname)) {
        const inviteCode = parsed.pathname.split('/').filter(Boolean).pop()
        if (inviteCode) {
          return { raw, inviteCode, candidates }
        }
      }
      return { raw, candidates }
    } catch {
      return null
    }
  }

  const host = normalizeHost(raw)
  const baseUrl = hostToBaseUrl(host)
  if (!baseUrl) return null
  pushCandidate(baseUrl)
  return { raw, candidates, host }
}

const fetchJsonWithTimeout = async (url) => {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal
    })
    if (!response.ok) {
      throw new Error(`Discovery failed with ${response.status}`)
    }
    return await response.json()
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function discoverMainServer(input) {
  const parsed = parseServerInput(input)
  if (!parsed || !parsed.candidates?.length) {
    throw new Error('Enter a valid Volt server host or URL')
  }

  let lastError = null
  for (const candidate of parsed.candidates) {
    try {
      let discovery = null
      try {
        discovery = await fetchJsonWithTimeout(`${candidate.baseUrl}/.well-known/voltchat`)
      } catch {
        try {
          discovery = await fetchJsonWithTimeout(`${candidate.baseUrl}/api/federation/discover`)
        } catch {
          discovery = await fetchJsonWithTimeout(`${candidate.baseUrl}/api/federation/info`)
        }
      }

      const validVoltInstance = isVoltMainnetDiscovery(discovery)
        || Boolean(discovery?.apiUrl && discovery?.host)

      if (!validVoltInstance) {
        throw new Error('This server did not identify itself as a VoltChat mainnet')
      }

      let authConfig = null
      try {
        authConfig = await fetchJsonWithTimeout(`${candidate.baseUrl}/api/auth/config`)
      } catch {
        authConfig = null
      }

      return buildServerRecord({ host: candidate.host, apiUrl: candidate.baseUrl }, {
        ...discovery,
        auth: {
          ...(discovery?.auth || {}),
          local: {
            ...(discovery?.auth?.local || {}),
            enabled: discovery?.auth?.local?.enabled ?? authConfig?.localAuthEnabled,
            canRegister: discovery?.auth?.local?.canRegister ?? authConfig?.canRegister ?? authConfig?.allowRegistration
          },
          oauth: {
            ...(discovery?.auth?.oauth || {}),
            enabled: discovery?.auth?.oauth?.enabled ?? authConfig?.oauthEnabled,
            clientId: discovery?.auth?.oauth?.clientId || authConfig?.clientId || null,
            authUrl: discovery?.auth?.oauth?.authUrl || authConfig?.authUrl || null,
            tokenUrl: discovery?.auth?.oauth?.tokenUrl || authConfig?.tokenUrl || null,
            revokeUrl: discovery?.auth?.oauth?.revokeUrl || authConfig?.revokeUrl || null
          }
        }
      })
    } catch (error) {
      lastError = error
    }
  }

  throw lastError || new Error('Unable to discover a valid VoltChat mainnet')
}

/**
 * Check if running in a desktop app environment
 */
export function isDesktopApp() {
  if (typeof window === 'undefined') return false;
  return window.__IS_DESKTOP_APP__ === true ||
         window.__TAURI__ !== undefined ||
         window.tauri !== undefined ||
         window.electron !== undefined;
}

/**
 * Detect the platform/WebView engine
 * Returns 'webkit' for Linux (WebKitGTK) or 'chromium' for Windows (WebView2)
 */
export function getWebViewEngine() {
  if (typeof window === 'undefined') return 'unknown';
  if (window.electron !== undefined) return 'electron';
  
  // Check user agent for WebKitGTK indicators
  const ua = navigator.userAgent;
  
  // WebKitGTK on Linux doesn't have "Chrome" in user agent
  // WebView2 on Windows has "Chrome" in user agent
  if (ua.includes('Linux') && !ua.includes('Chrome')) {
    return 'webkit';
  }
  
  // WebView2 on Windows
  if (ua.includes('Windows') || ua.includes('Chrome')) {
    return 'chromium';
  }
  
  // Default to chromium for unknown platforms
  return 'chromium';
}

/**
 * Get the desktop redirect URI.
 * We always use tauri:// so Electron and Tauri deep-link behavior is identical.
 */
export function getDesktopRedirectUri() {
  return 'tauri://localhost/callback';
}

/**
 * Get the desktop server config - uses production servers
 * The desktop app connects to the same production servers as the web version
 * OAuth callback uses tauri://localhost/callback in all desktop runtimes
 * so the deep-link flow is shared between Tauri and Electron.
 */
export function getDesktopServerConfig() {
  if (isDesktopApp()) {
    // Get the appropriate redirect URI based on platform
    const redirectUri = getDesktopRedirectUri();
    const engine = getWebViewEngine();
    
    console.log(`[ServerConfig] Desktop platform: ${engine}, redirect URI: ${redirectUri}`);
    
      return {
      version: CONFIG_VERSION,
      id: 'enclica-desktop',
      name: 'Enclica',
      host: 'enclicainteractive.com',
      apiUrl: 'https://volt.voltagechat.app',
      imageApiUrl: 'https://api.enclicainteractive.com',
      authUrl: 'https://enclicainteractive.com/oauth/authorize',
      tokenUrl: getProxyTokenUrl('https://volt.voltagechat.app'),
      revokeUrl: getProxyRevokeUrl('https://volt.voltagechat.app'),
      socketUrl: 'https://volt.voltagechat.app',
      clientId: 'app_54f92e4d526840789998b4cca492aea1',
      website: 'https://enclicainteractive.com',
      icon: null,
      isDesktop: true,
      // Platform-specific redirect URI
      redirectUri: redirectUri
    };
  }
  return null;
}

const migrateServerConfig = (stored) => {
  if (!stored) return null
  
  try {
    const parsed = typeof stored === 'string' ? JSON.parse(stored) : stored
    
    if (parsed.version && parsed.version >= CONFIG_VERSION) {
      let needsMigration = false
      
      if (parsed.apiUrl === 'https://api.enclicainteractive.com') {
        parsed.apiUrl = 'https://volt.voltagechat.app'
        needsMigration = true
      }
      
      if (!parsed.imageApiUrl) {
        parsed.imageApiUrl = 'https://api.enclicainteractive.com'
        needsMigration = true
      }
      
      if (!needsMigration) {
        return parsed
      }
    }
    
    if (parsed.authUrl && parsed.authUrl.includes('testing.enclicainteractive.com')) {
      parsed.authUrl = 'https://enclicainteractive.com/oauth/authorize'
      parsed.tokenUrl = getProxyTokenUrl(parsed.apiUrl || 'https://volt.voltagechat.app')
      parsed.revokeUrl = getProxyRevokeUrl(parsed.apiUrl || 'https://volt.voltagechat.app')
    }
    
    if (parsed.apiUrl === 'https://api.enclicainteractive.com') {
      parsed.apiUrl = 'https://volt.voltagechat.app'
    }
    
    if (!parsed.imageApiUrl) {
      parsed.imageApiUrl = 'https://api.enclicainteractive.com'
    }
    
    const legacyTokenUrls = new Set([
      'https://api.enclicainteractive.com/api/oauth/token',
      parsed.apiUrl ? `${parsed.apiUrl}/api/oauth/token` : null
    ].filter(Boolean))
    const legacyRevokeUrls = new Set([
      'https://api.enclicainteractive.com/api/oauth/revoke',
      parsed.apiUrl ? `${parsed.apiUrl}/api/oauth/revoke` : null
    ].filter(Boolean))

    if (!parsed.tokenUrl || legacyTokenUrls.has(parsed.tokenUrl)) {
      parsed.tokenUrl = getProxyTokenUrl(parsed.apiUrl)
    }
    if (!parsed.revokeUrl || legacyRevokeUrls.has(parsed.revokeUrl)) {
      parsed.revokeUrl = getProxyRevokeUrl(parsed.apiUrl)
    }
    
    parsed.version = CONFIG_VERSION
    
    return parsed
  } catch {
    return null
  }
}

export const DEFAULT_MAIN_SERVERS = [
  {
    version: CONFIG_VERSION,
    id: 'enclica',
    name: 'Enclica',
    host: 'enclicainteractive.com',
    apiUrl: 'https://volt.voltagechat.app',
    imageApiUrl: 'https://api.enclicainteractive.com',
    authUrl: 'https://enclicainteractive.com/oauth/authorize',
    tokenUrl: getProxyTokenUrl('https://volt.voltagechat.app'),
    revokeUrl: getProxyRevokeUrl('https://volt.voltagechat.app'),
    socketUrl: 'https://volt.voltagechat.app',
    clientId: 'app_54f92e4d526840789998b4cca492aea1',
    website: 'https://enclicainteractive.com',
    icon: null
  }
]

export function getMainServers() {
  try {
    const stored = localStorage.getItem(MAIN_SERVERS_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed)) {
        const normalized = parsed.map(normalizeStoredServerRecord).filter(Boolean)
        saveMainServers(normalized)
        return normalized
      }
    }
  } catch (e) {
    console.error('Error loading main servers:', e)
  }
  const defaults = DEFAULT_MAIN_SERVERS.map(normalizeStoredServerRecord)
  saveMainServers(defaults)
  return defaults
}

export function saveMainServers(servers) {
  localStorage.setItem(MAIN_SERVERS_KEY, JSON.stringify((servers || []).map(normalizeStoredServerRecord).filter(Boolean)))
}

export function addMainServer(server) {
  const servers = getMainServers()
  const nextServer = normalizeStoredServerRecord(server)
  const exists = servers.some(s => s.id === nextServer.id || normalizeHost(s.host) === normalizeHost(nextServer.host))
  if (exists) {
    throw new Error('Server already exists')
  }
  servers.push(nextServer)
  saveMainServers(servers)
  return servers
}

export function removeMainServer(serverId) {
  const servers = getMainServers()
  const filtered = servers.filter(s => s.id !== serverId)
  saveMainServers(filtered)
  
  const current = getStoredServer()
  if (current?.id === serverId) {
    const newCurrent = filtered[0] || null
    storeServer(newCurrent)
  }
  return filtered
}

export function updateMainServer(serverId, updates) {
  const servers = getMainServers()
  const index = servers.findIndex(s => s.id === serverId)
  if (index === -1) {
    throw new Error('Server not found')
  }
  servers[index] = normalizeStoredServerRecord({ ...servers[index], ...updates })
  saveMainServers(servers)
  
  const current = getStoredServer()
  if (current?.id === serverId) {
    storeServer(servers[index])
  }
  return servers
}

export function storeServer(server) {
  if (server) {
    localStorage.setItem(CURRENT_SERVER_KEY, JSON.stringify(normalizeStoredServerRecord(server)))
  } else {
    localStorage.removeItem(CURRENT_SERVER_KEY)
  }
}

export function getStoredServer() {
  // If running in desktop app, return the desktop server config (same as web version)
  if (isDesktopApp()) {
    const desktopConfig = getDesktopServerConfig()
    if (desktopConfig) {
      console.log('[ServerConfig] Using desktop config: production servers (same as web)')
      return desktopConfig
    }
  }
  
  try {
    const stored = localStorage.getItem(CURRENT_SERVER_KEY)
    if (stored) {
      const migrated = migrateServerConfig(stored)
      if (migrated) {
        const normalized = normalizeStoredServerRecord(migrated)
        storeServer(normalized)
        return normalized
      }
      const normalized = normalizeStoredServerRecord(JSON.parse(stored))
      storeServer(normalized)
      return normalized
    }
  } catch (e) {
    console.error('Error loading current server:', e)
  }
  const servers = getMainServers()
  return servers[0] || null
}

export function getServerById(serverId) {
  const servers = getMainServers()
  return servers.find(s => s.id === serverId) || null
}

export function getServerByHost(host) {
  const servers = getMainServers()
  const normalized = normalizeHost(host)
  return servers.find(s => normalizeHost(s.host) === normalized) || null
}

export function parseUsername(input) {
  if (input.includes('@')) {
    const [username, host] = input.split('@')
    return { username, host }
  }
  const server = getStoredServer()
  return { username: input, host: server?.host }
}

export function formatUsername(username, host) {
  const server = getStoredServer()
  if (host && host !== server?.host) {
    return `${username}@${host}`
  }
  return username
}

export async function testServerConnection(server) {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)
    
    const response = await fetch(`${server.apiUrl}/api/health`, {
      method: 'GET',
      signal: controller.signal
    })
    clearTimeout(timeoutId)
    
    return response.ok
  } catch (e) {
    console.error('Server connection test failed:', e)
    return false
  }
}

export function clearAllServerData() {
  localStorage.removeItem(MAIN_SERVERS_KEY)
  localStorage.removeItem(CURRENT_SERVER_KEY)
}

/**
 * Rewrite URLs for desktop app compatibility
 * Converts tauri://localhost URLs to the actual server URL
 */
export function rewriteUrlForDesktop(url) {
  if (typeof url !== 'string') return url
  
  // Only rewrite in desktop app
  if (!isDesktopApp()) return url
  
  const imageApiBase = 'https://volt.voltagechat.app'
  
  // Handle tauri://localhost/api/... URLs
  if (url.startsWith('tauri://localhost/api/')) {
    return url.replace('tauri://localhost', imageApiBase)
  }
  
  // Handle tauri://localhost/upload/... URLs
  if (url.startsWith('tauri://localhost/upload/')) {
    return url.replace('tauri://localhost', imageApiBase + '/api')
  }

  // Keep voltchat:// compatibility by treating it exactly like tauri://
  if (url.startsWith('voltchat://localhost/api/')) {
    return url.replace('voltchat://localhost', imageApiBase)
  }
  if (url.startsWith('voltchat://localhost/upload/')) {
    return url.replace('voltchat://localhost', imageApiBase + '/api')
  }
  
  return url
}
