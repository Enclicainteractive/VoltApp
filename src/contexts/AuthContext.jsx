import React, { createContext, useContext, useState, useEffect } from 'react'
import { authService } from '../services/authService'
import { apiService } from '../services/apiService'
import { useAppStore } from '../store/useAppStore'
import { clearAuthTokenState } from '../services/authToken'
import {
  clearSessionStorage,
  getStoredAccessToken,
  getStoredOauthToken,
  getStoredRefreshToken,
  getStoredUserData,
  setSessionValue,
  setStoredUserData
} from '../services/authSession'

const AuthContext = createContext(null)
const REFRESH_SKEW_MS = 5 * 60 * 1000

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

const getTokenExpiryMs = (token) => {
  const claims = decodeJwtPayload(token)
  const exp = Number(claims?.exp || 0)
  if (!Number.isFinite(exp) || exp <= 0) return null
  return exp * 1000
}

const normalizeUserProfile = (userData) => {
  if (!userData || typeof userData !== 'object') return userData

  const birthDate =
    userData.birthDate ||
    userData.birthday ||
    userData.birth_date ||
    userData.dateOfBirth ||
    userData.dob ||
    userData.profile?.birthDate ||
    userData.profile?.birthday ||
    userData.profile?.birth_date ||
    userData.profile?.dateOfBirth ||
    userData.profile?.dob ||
    null

  return {
    ...userData,
    birthDate
  }
}

const mergeUserProfile = (primaryUser, fallbackUser = null) => {
  const normalizedPrimary = normalizeUserProfile(primaryUser)
  const normalizedFallback = normalizeUserProfile(fallbackUser)
  if (!normalizedFallback || typeof normalizedFallback !== 'object') return normalizedPrimary
  if (!normalizedPrimary || typeof normalizedPrimary !== 'object') return normalizedFallback

  return normalizeUserProfile({
    ...normalizedFallback,
    ...normalizedPrimary,
    birthDate: normalizedPrimary.birthDate || normalizedFallback.birthDate || null,
    ageVerification: normalizedPrimary.ageVerification || normalizedFallback.ageVerification || null,
    ageVerificationJurisdiction:
      normalizedPrimary.ageVerificationJurisdiction ||
      normalizedFallback.ageVerificationJurisdiction ||
      normalizedPrimary.ageVerification?.jurisdictionCode ||
      normalizedFallback.ageVerification?.jurisdictionCode ||
      null
  })
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [token, setToken] = useState(getStoredAccessToken())
  const setUserInStore = useAppStore(state => state.setUser)
  const setSelfPresence = useAppStore(state => state.setSelfPresence)

  const clearSession = () => {
    clearSessionStorage()
    clearAuthTokenState()
    sessionStorage.removeItem('pkce_verifier')
    setUser(null)
    setToken(null)
  }

  const applyTokenPayload = async (tokenData, fallbackUser = null) => {
    if (!tokenData?.access_token) throw new Error('No access token returned')
    setSessionValue('access_token', tokenData.access_token)
    const oauthToken = tokenData.upstream_access_token || tokenData.oauth_access_token || ''
    setSessionValue('oauth_access_token', oauthToken || null)
    if (tokenData.refresh_token) setSessionValue('refresh_token', tokenData.refresh_token)
    setToken(tokenData.access_token)

    const tokenUser = tokenData.user || null
    const fetchedUser = tokenUser ? null : await authService.getUserInfo(tokenData)
    const userData = mergeUserProfile(tokenUser || fetchedUser, fallbackUser)
    if (userData) {
      setStoredUserData(userData)
      setUser(userData)
    }
    return userData
  }

  const tryRefreshSession = async () => {
    const refreshToken = getStoredRefreshToken()
    if (!refreshToken) return false
    try {
      const tokenData = await authService.refreshAccessToken(refreshToken)
      await applyTokenPayload(tokenData, user)
      return true
    } catch (err) {
      console.warn('[Auth] Token refresh failed:', err?.message || err)
      return false
    }
  }

  useEffect(() => {
    setUserInStore(user)
    setSelfPresence({
      status: user?.status || 'online',
      customStatus: user?.customStatus || ''
    })
  }, [user, setSelfPresence, setUserInStore])

  useEffect(() => {
      const initAuth = async () => {
      const storedToken = getStoredAccessToken()
      const storedUser = getStoredUserData()
      
      if (storedToken && storedUser) {
        try {
          const claims = decodeJwtPayload(storedToken)
          const claimUserId = claims?.userId || claims?.id || claims?.sub || null
          if (claimUserId && storedUser?.id && claimUserId !== storedUser.id) {
            console.warn('[Auth] Stored token/user mismatch detected, clearing session')
            clearSession()
          } else {
            const userData = normalizeUserProfile(storedUser)
            setUser(userData)
            setToken(storedToken)
            setStoredUserData(userData)
            console.log('[Auth] Restored session for:', userData.username)
          }
        } catch (error) {
          console.error('Failed to restore session:', error)
          clearSession()
        }
      }

      if (storedToken) {
        const expMs = getTokenExpiryMs(storedToken)
        if (expMs && Date.now() >= expMs - REFRESH_SKEW_MS) {
          const refreshed = await tryRefreshSession()
          if (!refreshed) {
            clearSession()
            setLoading(false)
            return
          }
        }
        try {
          const refreshed = await apiService.getCurrentUser()
          if (refreshed?.data) {
            const normalizedUser = normalizeUserProfile(refreshed.data)
            setUser(normalizedUser)
            setStoredUserData(normalizedUser)
          }
        } catch (err) {
          console.warn('[Auth] Failed to refresh user profile', err)
          const status = err?.response?.status
          if (status === 401) {
            const refreshed = await tryRefreshSession()
            if (!refreshed) clearSession()
          }
        }
      }

      setLoading(false)
    }
    initAuth()
  }, [])

  useEffect(() => {
    if (!token) return undefined

    const refreshToken = getStoredRefreshToken()
    if (!refreshToken) return undefined

    const expMs = getTokenExpiryMs(token)
    if (!expMs) return undefined

    const delay = Math.max(5000, expMs - Date.now() - REFRESH_SKEW_MS)
    const timeoutId = window.setTimeout(async () => {
      const refreshed = await tryRefreshSession()
      if (!refreshed) clearSession()
    }, delay)

    return () => window.clearTimeout(timeoutId)
  }, [token])

  const refreshUser = async () => {
    const accessToken = getStoredAccessToken()
    if (!accessToken) return null
    try {
      const response = await apiService.getCurrentUser()
      if (response?.data) {
        const normalizedUser = normalizeUserProfile(response.data)
        setUser(normalizedUser)
        setStoredUserData(normalizedUser)
        return normalizedUser
      }
    } catch (error) {
      console.warn('[Auth] Failed to refresh user profile', error)
      const status = error?.response?.status
      if (status === 401) {
        const refreshed = await tryRefreshSession()
        if (!refreshed) clearSession()
      }
    }
    return null
  }

  const login = () => {
    authService.startOAuthFlow()
  }

  const handleCallback = async (code, codeVerifier) => {
    try {
      const tokenData = await authService.exchangeCodeForToken(code, codeVerifier)
      const userData = await applyTokenPayload(tokenData)
      
      console.log('[Auth] Login successful:', userData.username)
      return userData
    } catch (error) {
      console.error('OAuth callback error:', error)
      throw error
    }
  }

  const logout = async () => {
    try {
      const revokeToken = getStoredOauthToken() || token
      if (revokeToken) {
        await authService.revokeToken(revokeToken)
      }
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      clearSession()
      console.log('[Auth] Logged out')
    }
  }

  const value = {
    user,
    token,
    loading,
    login,
    logout,
    handleCallback,
    refreshUser,
    isAuthenticated: !!user
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
