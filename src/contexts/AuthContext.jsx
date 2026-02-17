import React, { createContext, useContext, useState, useEffect } from 'react'
import { authService } from '../services/authService'
import { apiService } from '../services/apiService'

const AuthContext = createContext(null)

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [token, setToken] = useState(localStorage.getItem('access_token'))

  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem('access_token')
      const storedUser = localStorage.getItem('user_data')
      
      if (storedToken && storedUser) {
        try {
          const userData = JSON.parse(storedUser)
          setUser(userData)
          setToken(storedToken)
          console.log('[Auth] Restored session for:', userData.username)
        } catch (error) {
          console.error('Failed to restore session:', error)
          localStorage.removeItem('access_token')
          localStorage.removeItem('user_data')
          setToken(null)
        }
      }

      if (storedToken) {
        try {
          const refreshed = await apiService.getCurrentUser()
          if (refreshed?.data) {
            setUser(refreshed.data)
            localStorage.setItem('user_data', JSON.stringify(refreshed.data))
          }
        } catch (err) {
          console.warn('[Auth] Failed to refresh user profile', err)
        }
      }

      setLoading(false)
    }
    initAuth()
  }, [])

  const refreshUser = async () => {
    const accessToken = localStorage.getItem('access_token')
    if (!accessToken) return null
    try {
      const response = await apiService.getCurrentUser()
      if (response?.data) {
        setUser(response.data)
        localStorage.setItem('user_data', JSON.stringify(response.data))
        return response.data
      }
    } catch (error) {
      console.warn('[Auth] Failed to refresh user profile', error)
    }
    return null
  }

  const login = () => {
    authService.startOAuthFlow()
  }

  const handleCallback = async (code, codeVerifier) => {
    try {
      const tokenData = await authService.exchangeCodeForToken(code, codeVerifier)
      
      localStorage.setItem('access_token', tokenData.access_token)
      if (tokenData.refresh_token) {
        localStorage.setItem('refresh_token', tokenData.refresh_token)
      }
      setToken(tokenData.access_token)
      
      const userData = await authService.getUserInfo(tokenData)
      localStorage.setItem('user_data', JSON.stringify(userData))
      setUser(userData)
      
      console.log('[Auth] Login successful:', userData.username)
      return userData
    } catch (error) {
      console.error('OAuth callback error:', error)
      throw error
    }
  }

  const logout = async () => {
    try {
      if (token) {
        await authService.revokeToken(token)
      }
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      localStorage.removeItem('user_data')
      sessionStorage.removeItem('pkce_verifier')
      setUser(null)
      setToken(null)
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
