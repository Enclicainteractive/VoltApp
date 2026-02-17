const MAIN_SERVERS_KEY = 'voltchat_main_servers'
const CURRENT_SERVER_KEY = 'voltchat_current_server'
const CONFIG_VERSION = 3

const migrateServerConfig = (stored) => {
  if (!stored) return null
  
  try {
    const parsed = typeof stored === 'string' ? JSON.parse(stored) : stored
    
    if (parsed.version && parsed.version >= CONFIG_VERSION) {
      let needsMigration = false
      
      if (parsed.apiUrl === 'https://api.enclicainteractive.com') {
        parsed.apiUrl = 'https://voltchatapp.enclicainteractive.com'
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
      parsed.tokenUrl = 'https://api.enclicainteractive.com/api/oauth/token'
      parsed.revokeUrl = 'https://api.enclicainteractive.com/api/oauth/revoke'
    }
    
    if (parsed.apiUrl === 'https://api.enclicainteractive.com') {
      parsed.apiUrl = 'https://voltchatapp.enclicainteractive.com'
    }
    
    if (!parsed.imageApiUrl) {
      parsed.imageApiUrl = 'https://api.enclicainteractive.com'
    }
    
    if (!parsed.tokenUrl) {
      parsed.tokenUrl = parsed.apiUrl ? `${parsed.apiUrl}/api/oauth/token` : null
    }
    if (!parsed.revokeUrl) {
      parsed.revokeUrl = parsed.apiUrl ? `${parsed.apiUrl}/api/oauth/revoke` : null
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
    apiUrl: 'https://voltchatapp.enclicainteractive.com',
    imageApiUrl: 'https://api.enclicainteractive.com',
    authUrl: 'https://enclicainteractive.com/oauth/authorize',
    tokenUrl: 'https://api.enclicainteractive.com/api/oauth/token',
    revokeUrl: 'https://api.enclicainteractive.com/api/oauth/revoke',
    socketUrl: 'https://voltchatapp.enclicainteractive.com',
    clientId: 'app_54f92e4d526840789998b4cca492aea1',
    website: 'https://enclicainteractive.com',
    icon: null
  }
]

export function getMainServers() {
  try {
    const stored = localStorage.getItem(MAIN_SERVERS_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (e) {
    console.error('Error loading main servers:', e)
  }
  saveMainServers(DEFAULT_MAIN_SERVERS)
  return DEFAULT_MAIN_SERVERS
}

export function saveMainServers(servers) {
  localStorage.setItem(MAIN_SERVERS_KEY, JSON.stringify(servers))
}

export function addMainServer(server) {
  const servers = getMainServers()
  const exists = servers.some(s => s.id === server.id || s.host === server.host)
  if (exists) {
    throw new Error('Server already exists')
  }
  servers.push(server)
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
  servers[index] = { ...servers[index], ...updates }
  saveMainServers(servers)
  
  const current = getStoredServer()
  if (current?.id === serverId) {
    storeServer(servers[index])
  }
  return servers
}

export function storeServer(server) {
  if (server) {
    localStorage.setItem(CURRENT_SERVER_KEY, JSON.stringify(server))
  } else {
    localStorage.removeItem(CURRENT_SERVER_KEY)
  }
}

export function getStoredServer() {
  try {
    const stored = localStorage.getItem(CURRENT_SERVER_KEY)
    if (stored) {
      const migrated = migrateServerConfig(stored)
      if (migrated) {
        storeServer(migrated)
        return migrated
      }
      return JSON.parse(stored)
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
  return servers.find(s => s.host === host) || null
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
