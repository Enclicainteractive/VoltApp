import { useEffect, useCallback, useRef } from 'react'
import { useE2e } from '../contexts/E2eContext'
import { apiService } from '../services/apiService'

export const useKeyRotationListener = (serverId) => {
  const { 
    getCurrentSymmetricKey, 
    rotateServerKeys,
    serverKeys,
    decryptedSymmetricKeys
  } = useE2e()
  
  const currentKeyVersionRef = useRef(serverKeys[serverId]?.keyVersion)
  const isRotatingRef = useRef(false)

  const handleKeyRotation = useCallback(async () => {
    if (isRotatingRef.current) return
    
    isRotatingRef.current = true
    
    try {
      console.log('[KeyRotation] Starting key rotation for server:', serverId)
      
      const result = await rotateServerKeys(serverId)
      
      if (result?.success) {
        console.log('[KeyRotation] Key rotation completed, new version:', result.keyVersion)
        currentKeyVersionRef.current = result.keyVersion
      } else {
        console.error('[KeyRotation] Key rotation failed:', result.error)
      }
    } catch (err) {
      console.error('[KeyRotation] Error during key rotation:', err)
    } finally {
      isRotatingRef.current = false
    }
  }, [serverId, rotateServerKeys])

  const reEncryptOldMessages = useCallback(async (oldKeyVersion, newKeyVersion) => {
    try {
      console.log('[KeyRotation] Re-encrypting messages from version', oldKeyVersion, 'to', newKeyVersion)
      
      const oldKey = decryptedSymmetricKeys[serverId]
      const newKey = await getCurrentSymmetricKey(serverId)
      
      if (!oldKey || !newKey) {
        throw new Error('Keys not available for re-encryption')
      }
      
      const response = await apiService.getServerMessages(serverId, { 
        keyVersion: oldKeyVersion,
        limit: 1000
      })
      
      const messages = response?.data?.messages || []
      
      if (messages.length === 0) {
        console.log('[KeyRotation] No messages to re-encrypt')
        return { success: true, reEncrypted: 0 }
      }
      
      const worker = new Worker('/src/workers/encryptionWorker.js', { type: 'module' })
      
      return new Promise((resolve, reject) => {
        worker.postMessage({
          type: 'RE_ENCRYPT_MESSAGES',
          data: {
            messages,
            oldKey,
            newKey,
            taskId: `reencrypt-${serverId}-${Date.now()}`
          }
        })
        
        worker.onmessage = (e) => {
          const { type, results, progress, total } = e.data
          
          if (type === 'PROGRESS') {
            console.log(`[KeyRotation] Re-encryption progress: ${progress}/${total}`)
          } else if (type === 'COMPLETE') {
            const successful = results.filter(r => r.success && !r.skipped)
            console.log(`[KeyRotation] Re-encryption complete: ${successful.length}/${total} messages`)
            worker.terminate()
            resolve({ success: true, reEncrypted: successful.length, results })
          } else if (type === 'ERROR') {
            console.error('[KeyRotation] Worker error:', e.data.error)
            worker.terminate()
            reject(new Error(e.data.error))
          }
        }
        
        worker.onerror = (err) => {
          console.error('[KeyRotation] Worker error:', err)
          worker.terminate()
          reject(err)
        }
      })
    } catch (err) {
      console.error('[KeyRotation] Error re-encrypting messages:', err)
      return { success: false, error: err.message }
    }
  }, [serverId, getCurrentSymmetricKey, decryptedSymmetricKeys])

  useEffect(() => {
    if (!serverId) return
    
    const checkForRotation = async () => {
      try {
        const status = await apiService.getE2eStatus(serverId)
        const latestKeyVersion = status?.data?.keyVersion
        
        if (latestKeyVersion && latestKeyVersion !== currentKeyVersionRef.current) {
          console.log('[KeyRotation] Key version changed:', currentKeyVersionRef.current, '->', latestKeyVersion)
          
          const oldVersion = currentKeyVersionRef.current
          await handleKeyRotation()
          
          if (oldVersion) {
            await reEncryptOldMessages(oldVersion, latestKeyVersion)
          }
        }
      } catch (err) {
        console.error('[KeyRotation] Error checking for rotation:', err)
      }
    }
    
    const interval = setInterval(checkForRotation, 30000)
    
    checkForRotation()
    
    return () => clearInterval(interval)
  }, [serverId, handleKeyRotation, reEncryptOldMessages])

  return {
    isRotating: isRotatingRef.current,
    currentKeyVersion: currentKeyVersionRef.current,
    triggerRotation: handleKeyRotation,
    reEncryptOldMessages
  }
}