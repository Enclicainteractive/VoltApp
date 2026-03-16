import { getStoredServer } from './serverConfig'

const SESSION_FIELDS = ['access_token', 'oauth_access_token', 'refresh_token', 'user_data']

const normalizeHost = (value) => {
  if (!value) return null
  try {
    return new URL(String(value).includes('://') ? String(value) : `https://${String(value)}`).host.toLowerCase()
  } catch {
    return String(value)
      .replace(/^https?:\/\//i, '')
      .replace(/\/.*$/, '')
      .toLowerCase()
  }
}

const getSessionScope = (server = getStoredServer()) => {
  const raw = server?.id || server?.host || server?.apiUrl || 'default'
  return String(raw)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '_')
}

const getScopedKey = (field, server = getStoredServer()) => `voltchat_session:${getSessionScope(server)}:${field}`

const decodeJwtPayload = (token) => {
  if (!token || typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length < 2) return null
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const json = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))
    return JSON.parse(json)
  } catch {
    return null
  }
}

const canMigrateLegacyValue = (server = getStoredServer()) => {
  const currentHost = normalizeHost(server?.host || server?.apiUrl)
  if (!currentHost) return false

  try {
    const rawUser = localStorage.getItem('user_data')
    if (rawUser) {
      const parsed = JSON.parse(rawUser)
      const legacyUserHost = normalizeHost(parsed?.host)
      if (legacyUserHost && legacyUserHost === currentHost) return true
    }
  } catch {
    // Ignore malformed legacy user data.
  }

  const tokenClaims = decodeJwtPayload(localStorage.getItem('access_token'))
  const legacyTokenHost = normalizeHost(tokenClaims?.host)
  return !!legacyTokenHost && legacyTokenHost === currentHost
}

export function getSessionValue(field, server = getStoredServer()) {
  const scoped = localStorage.getItem(getScopedKey(field, server))
  if (scoped !== null) return scoped

  if (!SESSION_FIELDS.includes(field) || !canMigrateLegacyValue(server)) {
    return null
  }

  const legacy = localStorage.getItem(field)
  if (legacy === null) return null
  localStorage.setItem(getScopedKey(field, server), legacy)
  return legacy
}

export function setSessionValue(field, value, server = getStoredServer()) {
  const scopedKey = getScopedKey(field, server)
  if (value === null || value === undefined || value === '') {
    localStorage.removeItem(scopedKey)
    localStorage.removeItem(field)
    return
  }
  localStorage.setItem(scopedKey, value)
  localStorage.removeItem(field)
}

export function removeSessionValue(field, server = getStoredServer()) {
  localStorage.removeItem(getScopedKey(field, server))
  localStorage.removeItem(field)
}

export function clearSessionStorage(server = getStoredServer()) {
  SESSION_FIELDS.forEach((field) => {
    localStorage.removeItem(getScopedKey(field, server))
    localStorage.removeItem(field)
  })
}

export function getStoredAccessToken(server = getStoredServer()) {
  return getSessionValue('access_token', server) || ''
}

export function getStoredOauthToken(server = getStoredServer()) {
  return getSessionValue('oauth_access_token', server) || ''
}

export function getStoredRefreshToken(server = getStoredServer()) {
  return getSessionValue('refresh_token', server) || ''
}

export function getStoredUserData(server = getStoredServer()) {
  const raw = getSessionValue('user_data', server)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function setStoredUserData(user, server = getStoredServer()) {
  if (!user) {
    removeSessionValue('user_data', server)
    return
  }
  setSessionValue('user_data', JSON.stringify(user), server)
}

export function updateStoredUserData(updater, server = getStoredServer()) {
  const current = getStoredUserData(server)
  if (!current) return null
  const next = typeof updater === 'function' ? updater(current) : updater
  if (!next) {
    removeSessionValue('user_data', server)
    return null
  }
  setStoredUserData(next, server)
  return next
}
