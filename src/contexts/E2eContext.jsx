import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useAppStore } from '../store/useAppStore'
import { apiService } from '../services/apiService'
import * as crypto from '../utils/crypto'

const E2eContext = createContext(null)

export const useE2e = () => {
  const context = useContext(E2eContext)
  if (!context) {
    throw new Error('useE2e must be used within an E2eProvider')
  }
  return context
}

export const E2eProvider = ({ children }) => {
  const { user, currentServer } = useAppStore()
  
  const [serverEncryptionStatus, setServerEncryptionStatus] = useState({})
  const [dmEncryptionStatus, setDmEncryptionStatus] = useState({})
  const [userKeys, setUserKeys] = useState(null)
  const [serverKeys, setServerKeys] = useState({})
  const [dmKeys, setDmKeys] = useState({})
  const [decryptedSymmetricKeys, setDecryptedSymmetricKeys] = useState({})
  const [decryptedDmKeys, setDecryptedDmKeys] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const loadUserKeys = useCallback(async () => {
    if (!user?.id) return
    
    try {
      const stored = localStorage.getItem(`e2e_keys_${user.id}`)
      if (stored) {
        const keys = JSON.parse(stored)
        setUserKeys(keys)
        return keys
      }
      
      const response = await apiService.getUserKeys()
      
      const newKeys = await crypto.generateKeyPair()
      const keys = {
        publicKey: newKeys.publicKey,
        privateKey: newKeys.privateKey,
        keyId: response?.keyId
      }
      
      localStorage.setItem(`e2e_keys_${user.id}`, JSON.stringify(keys))
      setUserKeys(keys)
      return keys
    } catch (err) {
      console.error('[E2E] Error loading user keys:', err)
      return null
    }
  }, [user?.id])

  const getServerEncryptionStatus = useCallback(async (serverId) => {
    try {
      const response = await apiService.getE2eStatus(serverId)
      setServerEncryptionStatus(prev => ({
        ...prev,
        [serverId]: response?.data
      }))
      return response?.data
    } catch (err) {
      console.error('[E2E] Error getting server status:', err)
      return { enabled: false }
    }
  }, [])

  const joinServerEncryption = useCallback(async (serverId) => {
    if (!user?.id) return
    
    setLoading(true)
    setError(null)
    
    try {
      const keys = await loadUserKeys()
      if (!keys?.privateKey) {
        setError('No private key found')
        setLoading(false)
        return false
      }

      const serverKeysData = await apiService.getUserKeysForServer(serverId)
      
      if (!serverKeysData?.encryptedKey) {
        setError('Could not get server encryption keys')
        setLoading(false)
        return false
      }
      
      const symmetricKeyBase64 = await crypto.decryptKeyForUser(
        serverKeysData.encryptedKey,
        keys.privateKey
      )
      
      await apiService.joinE2eServer(serverId, {
        encryptedKey: symmetricKeyBase64
      })
      
      const symmetricKey = await crypto.importSymmetricKey(symmetricKeyBase64)
      
      setDecryptedSymmetricKeys(prev => ({
        ...prev,
        [serverId]: symmetricKey
      }))
      
      setServerKeys(prev => ({
        ...prev,
        [serverId]: {
          keyId: serverKeysData?.keyId,
          symmetricKey: symmetricKeyBase64
        }
      }))
      
      setLoading(false)
      return true
    } catch (err) {
      console.error('[E2E] Error joining server encryption:', err)
      setError(err.message)
      setLoading(false)
      return false
    }
  }, [user?.id, loadUserKeys])

  const leaveServerEncryption = useCallback(async (serverId) => {
    try {
      await apiService.leaveE2eServer(serverId)
      
      setDecryptedSymmetricKeys(prev => {
        const next = { ...prev }
        delete next[serverId]
        return next
      })
      
      setServerKeys(prev => {
        const next = { ...prev }
        delete next[serverId]
        return next
      })
      
      return true
    } catch (err) {
      console.error('[E2E] Error leaving server encryption:', err)
      return false
    }
  }, [])

  const isEncryptionEnabled = useCallback((serverId) => {
    return serverEncryptionStatus[serverId]?.enabled || false
  }, [serverEncryptionStatus])

  const hasDecryptedKey = useCallback((serverId) => {
    return !!decryptedSymmetricKeys[serverId]
  }, [decryptedSymmetricKeys])

  const encryptMessage = useCallback(async (content, serverId) => {
    const symmetricKey = decryptedSymmetricKeys[serverId]
    if (!symmetricKey) {
      throw new Error('No encryption key available')
    }
    
    return crypto.encryptMessage(content, symmetricKey)
  }, [decryptedSymmetricKeys])

  const decryptMessage = useCallback(async (encryptedData, serverId) => {
    const symmetricKey = decryptedSymmetricKeys[serverId]
    if (!symmetricKey) {
      throw new Error('No decryption key available')
    }
    
    return crypto.decryptMessage(encryptedData, symmetricKey)
  }, [decryptedSymmetricKeys])

  const encryptMessageForServer = useCallback(async (content, serverId) => {
    if (!isEncryptionEnabled(serverId) || !hasDecryptedKey(serverId)) {
      return { encrypted: false, content }
    }
    
    try {
      const encrypted = await encryptMessage(content, serverId)
      return {
        encrypted: true,
        content: encrypted.encrypted,
        iv: encrypted.iv
      }
    } catch (err) {
      console.error('[E2E] Error encrypting message:', err)
      return { encrypted: false, content }
    }
  }, [isEncryptionEnabled, hasDecryptedKey, encryptMessage])

  const decryptMessageFromServer = useCallback(async (message, serverId) => {
    if (!message.encrypted || !hasDecryptedKey(serverId)) {
      return message.content
    }
    
    try {
      const decrypted = await decryptMessage(
        { iv: message.iv, encrypted: message.content },
        serverId
      )
      return decrypted
    } catch (err) {
      console.error('[E2E] Error decrypting message:', err)
      return '[Encrypted message - could not decrypt]'
    }
  }, [hasDecryptedKey, decryptMessage])

  const enableServerEncryption = useCallback(async (serverId) => {
    try {
      await apiService.enableE2e(serverId)
      await getServerEncryptionStatus(serverId)
      return true
    } catch (err) {
      console.error('[E2E] Error enabling encryption:', err)
      return false
    }
  }, [getServerEncryptionStatus])

  const disableServerEncryption = useCallback(async (serverId) => {
    try {
      await apiService.disableE2e(serverId)
      await getServerEncryptionStatus(serverId)
      return true
    } catch (err) {
      console.error('[E2E] Error disabling encryption:', err)
      return false
    }
  }, [getServerEncryptionStatus])

  const rotateServerKeys = useCallback(async (serverId) => {
    try {
      await apiService.rotateE2eKeys(serverId)
      await getServerEncryptionStatus(serverId)
      return true
    } catch (err) {
      console.error('[E2E] Error rotating keys:', err)
      return false
    }
  }, [getServerEncryptionStatus, leaveServerEncryption])

  const exportKeysForBackup = useCallback(async (password) => {
    if (!userKeys?.privateKey) {
      throw new Error('No keys to backup')
    }
    
    return crypto.exportKeyForBackup(userKeys.privateKey, password)
  }, [userKeys])

  const importKeysFromBackup = useCallback(async (backup, password) => {
    try {
      const privateKey = await crypto.importKeyFromBackup(backup, password)
      
      const keys = {
        ...userKeys,
        privateKey
      }
      
      localStorage.setItem(`e2e_keys_${user.id}`, JSON.stringify(keys))
      setUserKeys(keys)
      
      return true
    } catch (err) {
      console.error('[E2E] Error importing keys:', err)
      return false
    }
  }, [userKeys, user?.id])

  const getDmEncryptionStatus = useCallback(async (conversationId) => {
    try {
      const response = await apiService.getDmE2eStatus(conversationId)
      setDmEncryptionStatus(prev => ({
        ...prev,
        [conversationId]: response?.data
      }))
      return response?.data
    } catch (err) {
      console.error('[E2E] Error getting DM status:', err)
      return { enabled: false }
    }
  }, [])

  const joinDmEncryption = useCallback(async (conversationId) => {
    if (!user?.id) return
    
    setLoading(true)
    setError(null)
    
    try {
      const keys = await loadUserKeys()
      if (!keys?.privateKey) {
        setError('No private key found')
        setLoading(false)
        return false
      }

      const response = await apiService.joinDmE2e(conversationId, {
        encryptedKey: null
      })
      
      const dmKeysData = await apiService.getDmE2eKeys(conversationId)
      
      if (dmKeysData?.data?.encryptedKey) {
        const symmetricKeyBase64 = await crypto.decryptKeyForUser(
          dmKeysData.data.encryptedKey,
          keys.privateKey
        )
        
        const symmetricKey = await crypto.importSymmetricKey(symmetricKeyBase64)
        
        setDecryptedDmKeys(prev => ({
          ...prev,
          [conversationId]: symmetricKey
        }))
        
        setDmKeys(prev => ({
          ...prev,
          [conversationId]: {
            keyId: dmKeysData?.data?.keyId,
            symmetricKey: symmetricKeyBase64
          }
        }))
      }
      
      setLoading(false)
      return true
    } catch (err) {
      console.error('[E2E] Error joining DM encryption:', err)
      setError(err.message)
      setLoading(false)
      return false
    }
  }, [user?.id, loadUserKeys])

  const leaveDmEncryption = useCallback(async (conversationId) => {
    try {
      setDecryptedDmKeys(prev => {
        const next = { ...prev }
        delete next[conversationId]
        return next
      })
      
      setDmKeys(prev => {
        const next = { ...prev }
        delete next[conversationId]
        return next
      })
      
      return true
    } catch (err) {
      console.error('[E2E] Error leaving DM encryption:', err)
      return false
    }
  }, [])

  const isDmEncryptionEnabled = useCallback((conversationId) => {
    return dmEncryptionStatus[conversationId]?.enabled || false
  }, [dmEncryptionStatus])

  const hasDmDecryptedKey = useCallback((conversationId) => {
    return !!decryptedDmKeys[conversationId]
  }, [decryptedDmKeys])

  const encryptMessageForDm = useCallback(async (content, conversationId) => {
    if (!isDmEncryptionEnabled(conversationId) || !hasDmDecryptedKey(conversationId)) {
      return { encrypted: false, content }
    }
    
    try {
      const symmetricKey = decryptedDmKeys[conversationId]
      const encrypted = await crypto.encryptMessage(content, symmetricKey)
      return {
        encrypted: true,
        content: encrypted.encrypted,
        iv: encrypted.iv
      }
    } catch (err) {
      console.error('[E2E] Error encrypting DM message:', err)
      return { encrypted: false, content }
    }
  }, [isDmEncryptionEnabled, hasDmDecryptedKey, decryptedDmKeys])

  const decryptDmMessage = useCallback(async (encryptedData, conversationId) => {
    if (!hasDmDecryptedKey(conversationId)) {
      throw new Error('No decryption key available')
    }
    
    const symmetricKey = decryptedDmKeys[conversationId]
    return crypto.decryptMessage(encryptedData, symmetricKey)
  }, [hasDmDecryptedKey, decryptedDmKeys])

  const decryptMessageFromDm = useCallback(async (message, conversationId) => {
    if (!message.encrypted || !hasDmDecryptedKey(conversationId)) {
      return message.content
    }
    
    try {
      const decrypted = await decryptDmMessage(
        { iv: message.iv, encrypted: message.content },
        conversationId
      )
      return decrypted
    } catch (err) {
      console.error('[E2E] Error decrypting DM message:', err)
      return '[Encrypted message - could not decrypt]'
    }
  }, [hasDmDecryptedKey, decryptDmMessage])

  const enableDmEncryption = useCallback(async (conversationId) => {
    try {
      await apiService.enableDmE2e(conversationId)
      await getDmEncryptionStatus(conversationId)
      return true
    } catch (err) {
      console.error('[E2E] Error enabling DM encryption:', err)
      return false
    }
  }, [getDmEncryptionStatus])

  const disableDmEncryption = useCallback(async (conversationId) => {
    try {
      await apiService.disableDmE2e(conversationId)
      await leaveDmEncryption(conversationId)
      await getDmEncryptionStatus(conversationId)
      return true
    } catch (err) {
      console.error('[E2E] Error disabling DM encryption:', err)
      return false
    }
  }, [getDmEncryptionStatus, leaveDmEncryption])

  useEffect(() => {
    if (user?.id) {
      loadUserKeys()
    }
  }, [user?.id, loadUserKeys])

  useEffect(() => {
    if (currentServer?.id) {
      getServerEncryptionStatus(currentServer.id)
    }
  }, [currentServer?.id, getServerEncryptionStatus])

  const value = {
    userKeys,
    serverEncryptionStatus,
    dmEncryptionStatus,
    serverKeys,
    dmKeys,
    decryptedSymmetricKeys,
    decryptedDmKeys,
    loading,
    error,
    loadUserKeys,
    getServerEncryptionStatus,
    getDmEncryptionStatus,
    joinServerEncryption,
    leaveServerEncryption,
    joinDmEncryption,
    leaveDmEncryption,
    isEncryptionEnabled,
    hasDecryptedKey,
    isDmEncryptionEnabled,
    hasDmDecryptedKey,
    encryptMessage,
    decryptMessage,
    encryptMessageForServer,
    decryptMessageFromServer,
    encryptMessageForDm,
    decryptDmMessage,
    decryptMessageFromDm,
    enableServerEncryption,
    disableServerEncryption,
    enableDmEncryption,
    disableDmEncryption,
    rotateServerKeys,
    exportKeysForBackup,
    importKeysFromBackup
  }

  return (
    <E2eContext.Provider value={value}>
      {children}
    </E2eContext.Provider>
  )
}
