import { useEffect, useRef, useCallback } from 'react'
import { useE2e } from '../contexts/E2eContext'
import { useAppStore } from '../store/useAppStore'
import { useAuth } from '../contexts/AuthContext'

// Shorten delay for testing
const isTestEnvironment = import.meta.env.MODE === 'test'
const RETRY_DELAY = isTestEnvironment ? 50 : 2000

export const useAutoJoinEncryption = () => {
  const { currentServer } = useAppStore()
  const { user } = useAuth()
  const { 
    isEncryptionEnabled, 
    hasDecryptedKey, 
    joinServerEncryption,
    autoEnrollServerEncryption,
    getServerEncryptionStatus
  } = useE2e()
  
  const processingServers = useRef(new Set())
  const retryAttempts = useRef(new Map())
  const timeoutIds = useRef(new Map())
  const MAX_RETRIES = 3

  useEffect(() => {
    const serverId = currentServer?.id
    if (!serverId || !user?.id) return

    const encryptionEnabled = isEncryptionEnabled(serverId)
    const hasKey = hasDecryptedKey(serverId)

    console.log('[useAutoJoinEncryption] Checking server:', {
      serverId,
      encryptionEnabled,
      hasKey,
      processing: processingServers.current.has(serverId)
    })

    if (!encryptionEnabled) {
      retryAttempts.current.delete(serverId)
      return
    }

    if (hasKey) {
      retryAttempts.current.delete(serverId)
      return
    }

    if (processingServers.current.has(serverId)) {
      return
    }

    const attempts = retryAttempts.current.get(serverId) || 0
    if (attempts >= MAX_RETRIES) {
      console.error('[useAutoJoinEncryption] Max retries reached for server:', serverId)
      retryAttempts.current.delete(serverId)
      return
    }

    const joinEncryption = async () => {
      processingServers.current.add(serverId)
      
      try {
        console.log('[useAutoJoinEncryption] Attempting to join encryption for server:', serverId)
        
        const success = await joinServerEncryption(serverId)
        
        if (success) {
          console.log('[useAutoJoinEncryption] Successfully joined encryption for server:', serverId)
          retryAttempts.current.delete(serverId)
        } else {
          throw new Error('joinServerEncryption returned false')
        }
      } catch (err) {
        console.error('[useAutoJoinEncryption] Failed to join encryption:', err)
        
        const newAttempts = (retryAttempts.current.get(serverId) || 0) + 1
        retryAttempts.current.set(serverId, newAttempts)
        
        if (newAttempts < MAX_RETRIES) {
          console.log(`[useAutoJoinEncryption] Retrying in ${RETRY_DELAY}ms (attempt ${newAttempts}/${MAX_RETRIES})`)
          const timeoutId = setTimeout(() => {
            processingServers.current.delete(serverId)
            timeoutIds.current.delete(serverId)
            joinEncryption()
          }, RETRY_DELAY)
          timeoutIds.current.set(serverId, timeoutId)
        }
      } finally {
        processingServers.current.delete(serverId)
      }
    }

    joinEncryption()

    return () => {
      const timeoutId = timeoutIds.current.get(serverId)
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutIds.current.delete(serverId)
      }
    }
  }, [currentServer?.id, isEncryptionEnabled, hasDecryptedKey, joinServerEncryption, autoEnrollServerEncryption, getServerEncryptionStatus, user])

  const isProcessing = useCallback((serverId) => processingServers.current.has(serverId), [])
  const getRetryCount = useCallback((serverId) => retryAttempts.current.get(serverId) || 0, [])

  return {
    isProcessing,
    getRetryCount
  }
}