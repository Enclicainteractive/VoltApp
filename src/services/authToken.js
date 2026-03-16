import { getStoredAccessToken, getStoredOauthToken } from './authSession'

const AUTH_TOKEN_SOURCE_KEY = 'voltchat_auth_token_source'

export const AUTH_TOKEN_SOURCES = {
  LOCAL: 'local',
  OAUTH: 'oauth'
}

export function getStoredTokens() {
  const localToken = getStoredAccessToken()
  const oauthToken = getStoredOauthToken()
  return { localToken, oauthToken }
}

export function getPreferredAuthToken() {
  const { localToken } = getStoredTokens()
  return localToken
}

export function getAuthTokenCandidates() {
  const { localToken } = getStoredTokens()
  if (!localToken) return []
  return [{ source: AUTH_TOKEN_SOURCES.LOCAL, token: localToken }]
}

export function setPreferredTokenSource(source) {
  if (!source) return
  localStorage.setItem(AUTH_TOKEN_SOURCE_KEY, source)
}

export function markLocalTokenRejected() {
  // Do not automatically switch app auth to upstream OAuth tokens.
  setPreferredTokenSource(AUTH_TOKEN_SOURCES.LOCAL)
}

export function markOAuthTokenRejected() {
  const { localToken } = getStoredTokens()
  if (localToken) {
    setPreferredTokenSource(AUTH_TOKEN_SOURCES.LOCAL)
  }
}

export function markLocalTokenAccepted() {
  const { localToken } = getStoredTokens()
  if (localToken) {
    setPreferredTokenSource(AUTH_TOKEN_SOURCES.LOCAL)
  }
}

export function clearAuthTokenState() {
  localStorage.removeItem(AUTH_TOKEN_SOURCE_KEY)
}
