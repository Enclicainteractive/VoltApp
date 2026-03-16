import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useAppStore } from '../store/useAppStore'
import { useAuth } from './AuthContext'
import { apiService } from '../services/apiService'
import * as crypto from '../utils/crypto'
import { encryptedKeyStore } from '../services/EncryptedKeyStore'
import { keySyncService } from '../services/keySyncService'

const E2eContext = createContext(null)

export const useE2e = () => {
  const context = useContext(E2eContext)
  if (!context) {
    throw new Error('useE2e must be used within an E2eProvider')
  }
  return context
}

export const E2eProvider = ({ children }) => {
  const { user: authUser } = useAuth()
  const { currentServer, servers } = useAppStore()
  const user = authUser

  const userRef = useRef(user)
  userRef.current = user

  const [serverEncryptionStatus, setServerEncryptionStatus] = useState({})
  const [dmEncryptionStatus, setDmEncryptionStatus] = useState({})
  const [userKeys, setUserKeys] = useState(null)
  const [serverKeys, setServerKeys] = useState({})
  const [dmKeys, setDmKeys] = useState({})
  const [decryptedSymmetricKeys, setDecryptedSymmetricKeys] = useState({})
  const [decryptedDmKeys, setDecryptedDmKeys] = useState({})
  const [previousServerKeys, setPreviousServerKeys] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [deviceId, setDeviceId] = useState(null)
  const serverEncryptionStatusRef = useRef(serverEncryptionStatus)

  const processingServersRef = useRef(new Set())
  const statusFetchInFlightRef = useRef(new Map())
  const statusFetchedAtRef = useRef(new Map())
  const joinPromisesRef = useRef(new Map())
  const retryAttemptsRef = useRef(new Map())
  const timeoutIdsRef = useRef(new Map())
  const syncIntervalRef = useRef(null)
  const MAX_RETRIES = 3
  const RETRY_DELAY = 2000
  const SYNC_INTERVAL = 5 * 60 * 1000
  const STATUS_CACHE_TTL = 5 * 60 * 1000

  useEffect(() => {
    serverEncryptionStatusRef.current = serverEncryptionStatus
  }, [serverEncryptionStatus])

  const waitForUser = async (maxAttempts = 30, delay = 100) => {
    console.log('[E2E] waitForUser: starting, current user:', userRef.current?.id)
    let attempts = 0
    while (!userRef.current?.id && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, delay))
      attempts++
    }
    console.log('[E2E] waitForUser: done after', attempts, 'attempts, user:', userRef.current?.id)
    return userRef.current?.id
  }

  const fetchServerEncryptionStatus = useCallback(async (serverId, { force = false } = {}) => {
    if (!serverId) return { enabled: false }

    const cachedStatus = serverEncryptionStatusRef.current[serverId]
    const fetchedAt = statusFetchedAtRef.current.get(serverId) || 0
    const isFresh = Date.now() - fetchedAt < STATUS_CACHE_TTL
    if (!force && cachedStatus && isFresh) {
      return cachedStatus
    }

    const existingRequest = statusFetchInFlightRef.current.get(serverId)
    if (existingRequest) {
      return existingRequest
    }

    const request = apiService.getE2eStatus(serverId)
      .then((response) => {
        const nextStatus = response?.data || { enabled: false }
        statusFetchedAtRef.current.set(serverId, Date.now())
        setServerEncryptionStatus(prev => ({
          ...prev,
          [serverId]: nextStatus
        }))
        return nextStatus
      })
      .catch((err) => {
        console.error('[E2E] Error getting server status:', err)
        const fallback = cachedStatus || { enabled: false }
        statusFetchedAtRef.current.set(serverId, Date.now())
        setServerEncryptionStatus(prev => ({
          ...prev,
          [serverId]: fallback
        }))
        return fallback
      })
      .finally(() => {
        statusFetchInFlightRef.current.delete(serverId)
      })

    statusFetchInFlightRef.current.set(serverId, request)
    return request
  }, [STATUS_CACHE_TTL])

  const getServerEncryptionStatus = useCallback(async (serverId) => {
    return fetchServerEncryptionStatus(serverId)
  }, [fetchServerEncryptionStatus])

  // Load only the active server's encryption status.
  useEffect(() => {
    if (user?.id && currentServer?.id) {
      fetchServerEncryptionStatus(currentServer.id)
    }
  }, [user?.id, currentServer?.id, fetchServerEncryptionStatus])

  const loadUserKeys = useCallback(async () => {
    const hasUser = await waitForUser()
    if (!hasUser) return

    try {
      const stored = localStorage.getItem(`e2e_keys_${userRef.current.id}`)
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

      localStorage.setItem(`e2e_keys_${userRef.current.id}`, JSON.stringify(keys))
      setUserKeys(keys)
      return keys
    } catch (err) {
      console.error('[E2E] Error loading user keys:', err)
      return null
    }
  }, [])

  const syncKeysToIndexedDB = useCallback(async (password) => {
    const hasUser = await waitForUser()
    if (!hasUser || !userKeys?.privateKey) {
      console.warn('[E2E] Cannot sync keys - missing user or keys')
      return false
    }

    try {
      await keySyncService.initialize(userRef.current.id)

      for (const [serverId, keyData] of Object.entries(serverKeys)) {
        if (keyData?.symmetricKey) {
          await keySyncService.storeServerKey(userRef.current.id, serverId, keyData.symmetricKey, password)
        }
      }

      console.log('[E2E] Keys synced to IndexedDB')
      return true
    } catch (err) {
      console.error('[E2E] Error syncing keys to IndexedDB:', err)
      return false
    }
  }, [userKeys, serverKeys])

  const loadKeysFromIndexedDB = useCallback(async (password) => {
    const hasUser = await waitForUser()
    if (!hasUser) {
      console.warn('[E2E] Cannot load keys - missing user')
      return false
    }

    try {
      await keySyncService.initialize(userRef.current.id)
      const serverKeysData = await keySyncService.getAllServerKeys(userRef.current.id, password)

      for (const [serverId, symmetricKeyBase64] of Object.entries(serverKeysData)) {
        const symmetricKey = await crypto.importSymmetricKey(symmetricKeyBase64)
        setDecryptedSymmetricKeys(prev => ({
          ...prev,
          [serverId]: symmetricKey
        }))
        setServerKeys(prev => ({
          ...prev,
          [serverId]: {
            keyId: null,
            symmetricKey: symmetricKeyBase64
          }
        }))
      }

      console.log('[E2E] Keys loaded from IndexedDB')
      return true
    } catch (err) {
      console.error('[E2E] Error loading keys from IndexedDB:', err)
      return false
    }
  }, [])

  const autoEnrollServerEncryption = useCallback(async (serverId) => {
    const hasUser = await waitForUser()
    if (!hasUser) return
    
    setLoading(true)
    setError(null)
    
    try {
      const status = await apiService.getServerE2eAutoEnrollStatus(serverId)
      if (!status?.data?.enabled) {
        setLoading(false)
        return { enabled: false }
      }
      
      if (status?.data?.enrolled) {
        const keyData = await apiService.getServerAutoKey(serverId)
        if (keyData?.data?.symmetricKey) {
          const symmetricKey = await crypto.importSymmetricKey(keyData.data.symmetricKey)
          setDecryptedSymmetricKeys(prev => ({
            ...prev,
            [serverId]: symmetricKey
          }))
          setServerKeys(prev => ({
            ...prev,
            [serverId]: {
              keyId: keyData.data.keyId,
              symmetricKey: keyData.data.symmetricKey
            }
          }))
          setLoading(false)
          return { enrolled: true, enabled: true }
        }
      }
      
      const keys = await loadUserKeys()
      if (!keys?.privateKey) {
        setError('No private key found')
        setLoading(false)
        return false
      }

      const serverKeysData = await apiService.getUserKeysForServer(serverId)
      
      if (!serverKeysData?.encryptedKey) {
        const autoKeyData = await apiService.getServerAutoKey(serverId)
        if (autoKeyData?.data?.symmetricKey) {
          const symmetricKey = await crypto.importSymmetricKey(autoKeyData.data.symmetricKey)
          setDecryptedSymmetricKeys(prev => ({
            ...prev,
            [serverId]: symmetricKey
          }))
          setServerKeys(prev => ({
            ...prev,
            [serverId]: {
              keyId: autoKeyData.data.keyId,
              symmetricKey: autoKeyData.data.symmetricKey
            }
          }))
          setLoading(false)
          return { enrolled: true, enabled: true }
        }
        setError('Could not get server encryption keys')
        setLoading(false)
        return false
      }
      
      const symmetricKeyBase64 = await crypto.decryptKeyForUser(
        serverKeysData.encryptedKey,
        keys.privateKey
      )
      
      await apiService.autoEnrollServerE2e(serverId, {
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
      return { enrolled: true, enabled: true }
    } catch (err) {
      console.error('[E2E] Error auto-enrolling server encryption:', err)
      setError(err.message)
      setLoading(false)
      return false
    }
  }, [loadUserKeys])

  const joinServerEncryption = useCallback(async (serverId) => {
    const hasUser = await waitForUser()
    if (!hasUser) {
      console.warn('[E2E] joinServerEncryption: No user id after waiting')
      return false
    }

    if (decryptedSymmetricKeys[serverId]) {
      return true
    }

    const existingJoin = joinPromisesRef.current.get(serverId)
    if (existingJoin) {
      return existingJoin
    }

    console.log('[E2E] joinServerEncryption called for server:', serverId)
    const joinPromise = (async () => {
      setLoading(true)
      setError(null)

      try {
      console.log('[E2E] Loading user keys...')
      let keys = await loadUserKeys()
      
      if (!keys?.privateKey) {
        console.log('[E2E] No keys in storage, generating new key pair...')
        keys = await loadUserKeys()
      }
      
      if (!keys?.privateKey) {
        console.error('[E2E] No private key found after retry')
        setError('No private key found')
        return false
      }

      console.log('[E2E] Getting user keys for server...')
      const serverKeysData = await apiService.getUserKeysForServer(serverId)
      console.log('[E2E] Server keys data:', serverKeysData)

      const encryptedKey = serverKeysData?.encryptedKey || serverKeysData?.currentKey?.encryptedKey

      if (!encryptedKey) {
        console.log('[E2E] No encrypted key found, trying auto-enrollment key...')
        const autoKeyData = await apiService.getServerAutoKey(serverId)
        if (autoKeyData?.data?.symmetricKey) {
          const symmetricKey = await crypto.importSymmetricKey(autoKeyData.data.symmetricKey)
          setDecryptedSymmetricKeys(prev => ({
            ...prev,
            [serverId]: symmetricKey
          }))
          setServerKeys(prev => ({
            ...prev,
            [serverId]: {
              keyId: autoKeyData.data.keyId,
              symmetricKey: autoKeyData.data.symmetricKey
            }
          }))
          statusFetchedAtRef.current.set(serverId, Date.now())
          setServerEncryptionStatus(prev => ({
            ...prev,
            [serverId]: {
              ...(prev[serverId] || {}),
              enabled: true
            }
          }))
          console.log('[E2E] Successfully joined encryption using auto-enrollment key for server:', serverId)
          return true
        }
        console.error('[E2E] Could not get server encryption keys')
        setError('Could not get server encryption keys')
        return false
      }

      console.log('[E2E] Decrypting key...')
      const symmetricKeyBase64 = await crypto.decryptKeyForUser(
        encryptedKey,
        keys.privateKey
      )

      console.log('[E2E] Joining E2E server...')
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

      statusFetchedAtRef.current.set(serverId, Date.now())
      setServerEncryptionStatus(prev => ({
        ...prev,
        [serverId]: {
          ...(prev[serverId] || {}),
          enabled: true
        }
      }))

      console.log('[E2E] Successfully joined encryption for server:', serverId)
      return true
    } catch (err) {
      console.error('[E2E] Error joining server encryption:', err)
      setError(err.message)
      return false
    } finally {
      setLoading(false)
      joinPromisesRef.current.delete(serverId)
    }
    })()

    joinPromisesRef.current.set(serverId, joinPromise)
    return joinPromise
  }, [decryptedSymmetricKeys, loadUserKeys])

  const fetchServerKeyOnJoin = useCallback(async (serverId) => {
    const hasUser = await waitForUser()
    if (!hasUser) {
      console.warn('[E2E] Cannot fetch server key - no user')
      return false
    }

    try {
      const joinInfo = await apiService.getServerJoinInfo(serverId)
      console.log('[E2E] Server join info:', joinInfo?.data)

      if (!joinInfo?.data?.enabled) {
        console.log('[E2E] Server encryption not enabled')
        return false
      }

      if (joinInfo.data.hasKey && joinInfo.data.encryptedKey) {
        const keys = await loadUserKeys()
        if (!keys?.privateKey) {
          console.error('[E2E] No private key found')
          return false
        }

        const symmetricKeyBase64 = await crypto.decryptKeyForUser(
          joinInfo.data.encryptedKey,
          keys.privateKey
        )

        const symmetricKey = await crypto.importSymmetricKey(symmetricKeyBase64)

        setDecryptedSymmetricKeys(prev => ({
          ...prev,
          [serverId]: symmetricKey
        }))

        setServerKeys(prev => ({
          ...prev,
          [serverId]: {
            keyId: joinInfo.data.keyId,
            symmetricKey: symmetricKeyBase64
          }
        }))

        console.log('[E2E] Successfully fetched and decrypted server key for:', serverId)
        return true
      } else if (joinInfo.data.requiresEnrollment) {
        console.log('[E2E] Server requires enrollment, calling joinServerEncryption')
        return await joinServerEncryption(serverId)
      }

      return false
    } catch (err) {
      console.error('[E2E] Error fetching server key on join:', err)
      return false
    }
  }, [loadUserKeys, joinServerEncryption])

  const leaveServerEncryption = useCallback(async (serverId) => {
    try {
      await apiService.leaveE2eServer(serverId)
      
      // Clear all keys associated with this server - member is leaving so they should not be able to decrypt future messages
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
      
      // Clear previous server keys as well to prevent decryption with old keys
      setPreviousServerKeys(prev => {
        const next = { ...prev }
        delete next[serverId]
        return next
      })
      
      // Remove server keys from localStorage to ensure no recovery
      const userId = userRef.current?.id
      if (userId) {
        localStorage.removeItem(`e2e_keys_${userId}`)
        localStorage.removeItem(`e2e_true_sender_${userId}_${serverId}`)
        localStorage.removeItem(`e2e_true_shared_${serverId}_`)
        // Clear any epoch-based keys
        Object.keys(localStorage).forEach(key => {
          if (key.includes(`e2e_true_${serverId}`) || key.includes(`e2e_true_sender_${userId}_${serverId}`)) {
            localStorage.removeItem(key)
          }
        })
      }
      
      // Update server encryption status
      setServerEncryptionStatus(prev => ({
        ...prev,
        [serverId]: { enabled: false }
      }))
      
      console.log('[E2E] Successfully left server encryption - all keys invalidated for server:', serverId)
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

  const getCurrentSymmetricKey = useCallback(async (serverId) => {
    if (!serverId) {
      throw new Error('Server ID is required')
    }

    if (decryptedSymmetricKeys[serverId]) {
      console.log('[E2E] Using cached symmetric key for server:', serverId)
      return decryptedSymmetricKeys[serverId]
    }

    console.log('[E2E] No cached key, retrieving from store for server:', serverId)

    try {
      const keys = await loadUserKeys()
      if (!keys?.privateKey) {
        throw new Error('No user keys available')
      }

      const serverKeysData = await apiService.getUserKeysForServer(serverId)
      
      if (!serverKeysData?.encryptedKey) {
        console.log('[E2E] No server key found, generating new one for server:', serverId)
        const newKey = await crypto.generateSymmetricKey()
        const newKeyBase64 = await crypto.exportSymmetricKey(newKey)
        
        setDecryptedSymmetricKeys(prev => ({
          ...prev,
          [serverId]: newKey
        }))
        
        return newKey
      }

      const symmetricKeyBase64 = await crypto.decryptKeyForUser(
        serverKeysData.encryptedKey,
        keys.privateKey
      )

      const symmetricKey = await crypto.importSymmetricKey(symmetricKeyBase64)
      
      setDecryptedSymmetricKeys(prev => ({
        ...prev,
        [serverId]: symmetricKey
      }))

      console.log('[E2E] Successfully retrieved and cached symmetric key for server:', serverId)
      return symmetricKey
    } catch (err) {
      console.error('[E2E] Error getting symmetric key for server:', serverId, err)
      throw err
    }
  }, [decryptedSymmetricKeys, loadUserKeys])

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

    try {
      return await crypto.decryptMessage(encryptedData, symmetricKey)
    } catch (err) {
      const previousKeyData = previousServerKeys[serverId]
      if (previousKeyData?.key) {
        console.log('[E2E] Trying previous key for server:', serverId)
        try {
          return await crypto.decryptMessage(encryptedData, previousKeyData.key)
        } catch (prevErr) {
          console.error('[E2E] Previous key also failed:', prevErr)
        }
      }
      throw err
    }
  }, [decryptedSymmetricKeys, previousServerKeys])

  const cleanupOldKeys = useCallback((maxAgeHours = 24) => {
    const now = Date.now()
    const maxAge = maxAgeHours * 60 * 60 * 1000

    setPreviousServerKeys(prev => {
      const cleaned = {}
      for (const [serverId, keyData] of Object.entries(prev)) {
        if (keyData.rotatedAt) {
          const rotatedTime = new Date(keyData.rotatedAt).getTime()
          if (now - rotatedTime < maxAge) {
            cleaned[serverId] = keyData
          }
        }
      }
      return cleaned
    })
  }, [])

  const getDeviceId = useCallback(() => {
    let id = localStorage.getItem('e2e_device_id')
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem('e2e_device_id', id)
    }
    return id
  }, [])

  const exportAllKeysForBackup = useCallback(async (password) => {
    const hasUser = await waitForUser()
    if (!hasUser) {
      throw new Error('Not authenticated')
    }

    const backupData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      userId: userRef.current.id,
      identityKeys: null,
      serverKeys: {},
      dmKeys: {}
    }

    if (userKeys?.privateKey) {
      const exportedIdentity = await crypto.exportKeyForBackup(userKeys.privateKey, password)
      backupData.identityKeys = {
        publicKey: userKeys.publicKey,
        keyId: userKeys.keyId,
        encryptedPrivateKey: exportedIdentity
      }
    }

    for (const [serverId, keys] of Object.entries(serverKeys)) {
      if (keys?.symmetricKey) {
        const exportedServerKey = await crypto.exportKeyForBackup(keys.symmetricKey, password)
        backupData.serverKeys[serverId] = {
          keyId: keys.keyId,
          encryptedSymmetricKey: exportedServerKey
        }
      }
    }

    const dmStorageKeys = Object.keys(localStorage).filter(k => k.startsWith('dm_e2e_'))
    for (const storageKey of dmStorageKeys) {
      try {
        const dmData = JSON.parse(localStorage.getItem(storageKey))
        if (dmData?.key) {
          const conversationId = storageKey.replace('dm_e2e_', '')
          const exportedDmKey = await crypto.exportKeyForBackup(dmData.key, password)
          backupData.dmKeys[conversationId] = {
            encryptedKey: exportedDmKey,
            mode: dmData.mode,
            createdAt: dmData.createdAt
          }
        }
      } catch (e) {
        console.warn('[E2E] Failed to backup DM key for', storageKey, e)
      }
    }

    return backupData
  }, [userKeys, serverKeys])

  const syncKeysToServer = useCallback(async (password) => {
    const hasUser = await waitForUser()
    if (!hasUser || !userKeys?.privateKey) {
      console.warn('[E2E] Cannot sync keys - missing user or keys')
      return false
    }

    try {
      const currentDeviceId = getDeviceId()
      setDeviceId(currentDeviceId)

      const backupData = await exportAllKeysForBackup(password)
      const encryptedBackup = JSON.stringify(backupData)

      await apiService.syncKeyBackup(encryptedBackup, currentDeviceId, new Date().toISOString())

      console.log('[E2E] Keys synced to server for device:', currentDeviceId)
      return true
    } catch (err) {
      console.error('[E2E] Error syncing keys to server:', err)
      return false
    }
  }, [userKeys, getDeviceId, exportAllKeysForBackup])

  const importAllKeysFromBackup = useCallback(async (backupData, password) => {
    const hasUser = await waitForUser()
    if (!hasUser) {
      throw new Error('Not authenticated')
    }

    if (backupData.version !== 1) {
      throw new Error('Unsupported backup version')
    }

    try {
      if (backupData.identityKeys?.encryptedPrivateKey) {
        const privateKey = await crypto.importKeyFromBackup(
          backupData.identityKeys.encryptedPrivateKey,
          password
        )
        const keys = {
          publicKey: backupData.identityKeys.publicKey,
          privateKey: privateKey,
          keyId: backupData.identityKeys.keyId
        }
        localStorage.setItem(`e2e_keys_${userRef.current.id}`, JSON.stringify(keys))
        setUserKeys(keys)
      }

      for (const [serverId, serverKeyData] of Object.entries(backupData.serverKeys)) {
        if (serverKeyData?.encryptedSymmetricKey) {
          const symmetricKey = await crypto.importKeyFromBackup(
            serverKeyData.encryptedSymmetricKey,
            password
          )
          const symmetricKeyObj = await crypto.importSymmetricKey(symmetricKey)
          
          setServerKeys(prev => ({
            ...prev,
            [serverId]: {
              keyId: serverKeyData.keyId,
              symmetricKey: symmetricKey
            }
          }))
          setDecryptedSymmetricKeys(prev => ({
            ...prev,
            [serverId]: symmetricKeyObj
          }))
        }
      }

      for (const [conversationId, dmKeyData] of Object.entries(backupData.dmKeys)) {
        if (dmKeyData?.encryptedKey) {
          const key = await crypto.importKeyFromBackup(dmKeyData.encryptedKey, password)
          const symmetricKeyObj = await crypto.importSymmetricKey(key)
          
          localStorage.setItem(`dm_e2e_${conversationId}`, JSON.stringify({
            key: key,
            mode: dmKeyData.mode,
            createdAt: dmKeyData.createdAt,
            savedLocally: true
          }))
          
          setDmKeys(prev => ({
            ...prev,
            [conversationId]: key
          }))
          setDecryptedDmKeys(prev => ({
            ...prev,
            [conversationId]: symmetricKeyObj
          }))
        }
      }

      return { success: true }
    } catch (err) {
      console.error('[E2E] Error importing keys from backup:', err)
      return { success: false, error: err.message }
    }
  }, [])

  const fetchMissingKeys = useCallback(async (password) => {
    const hasUser = await waitForUser()
    if (!hasUser) {
      console.warn('[E2E] Cannot fetch keys - missing user')
      return false
    }

    try {
      const currentDeviceId = getDeviceId()
      const backupsResponse = await apiService.getKeyBackups()
      const backups = backupsResponse?.data?.backups || []

      const otherDeviceBackups = backups.filter(b => b.deviceId !== currentDeviceId)

      if (otherDeviceBackups.length === 0) {
        console.log('[E2E] No other device backups found')
        return false
      }

      const latestBackup = otherDeviceBackups.sort((a, b) => 
        new Date(b.timestamp) - new Date(a.timestamp)
      )[0]

      console.log('[E2E] Fetching backup from device:', latestBackup.deviceId)

      const backupResponse = await apiService.getKeyBackup(latestBackup.deviceId)
      const encryptedBackup = backupResponse?.data?.encryptedBackup

      if (!encryptedBackup) {
        console.error('[E2E] No encrypted backup data found')
        return false
      }

      const backupData = JSON.parse(encryptedBackup)
      const result = await importAllKeysFromBackup(backupData, password)

      if (result.success) {
        console.log('[E2E] Successfully imported keys from backup')
        return true
      } else {
        console.error('[E2E] Failed to import keys from backup:', result.error)
        return false
      }
    } catch (err) {
      console.error('[E2E] Error fetching missing keys:', err)
      return false
    }
  }, [getDeviceId, importAllKeysFromBackup])

  const startBackgroundSync = useCallback((password) => {
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current)
    }

    const sync = async () => {
      console.log('[E2E] Running background key sync...')
      await syncKeysToServer(password)
    }

    sync()
    syncIntervalRef.current = setInterval(sync, SYNC_INTERVAL)

    console.log('[E2E] Background sync started (interval:', SYNC_INTERVAL / 1000, 'seconds)')
  }, [syncKeysToServer, SYNC_INTERVAL])

  const stopBackgroundSync = useCallback(() => {
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current)
      syncIntervalRef.current = null
      console.log('[E2E] Background sync stopped')
    }
  }, [])

  const encryptMessageForServer = useCallback(async (content, serverId) => {
    if (!hasDecryptedKey(serverId)) {
      return { encrypted: false, content }
    }

    try {
      const encrypted = await encryptMessage(content, serverId)
      const keyVersion = serverKeys[serverId]?.keyVersion || null
      return {
        encrypted: true,
        content: encrypted.encrypted,
        iv: encrypted.iv,
        keyVersion
      }
    } catch (err) {
      console.error('[E2E] Error encrypting message:', err)
      return { encrypted: false, content, error: 'encryption_failed' }
    }
  }, [hasDecryptedKey, encryptMessage, serverKeys])

  const decryptMessageFromServer = useCallback(async (message, serverId, memberStatus) => {
    const encryptedFlag = message?.encrypted === true
    const hasCipherPayload = !!(message?.iv && message?.content)
    const shouldDecrypt = encryptedFlag || hasCipherPayload

    // If message doesn't look encrypted, return content as-is
    if (!shouldDecrypt) {
      return message?.content
    }
    
    // Check if user is still a member - former members should not be able to decrypt
    // If memberStatus is provided and indicates user is not a current member, block decryption
    if (memberStatus === 'left' || memberStatus === 'kicked' || memberStatus === 'banned') {
      console.log('[E2E] User has left the server - blocking decryption of encrypted messages')
      return '[Encrypted message - no longer accessible]'
    }
    
    // If encryption is disabled on server and payload does not explicitly
    // indicate encrypted content, treat as plaintext.
    const encryptionEnabled = isEncryptionEnabled(serverId)
    if (!encryptionEnabled && !encryptedFlag) {
      console.log('[E2E is disabled, treating] Server encryption as unencrypted message')
      return message.content
    }

    // If no decryption key is currently cached, try lazy-loading it.
    if (!hasDecryptedKey(serverId)) {
      try {
        await getCurrentSymmetricKey(serverId)
      } catch (err) {
        console.log('[E2E] No decryption key available for server:', serverId)
        return '[Encrypted message - key not available]'
      }
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
  }, [isEncryptionEnabled, hasDecryptedKey, decryptMessage, getCurrentSymmetricKey])

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
      const result = await apiService.rotateE2eKeys(serverId)
      await getServerEncryptionStatus(serverId)

      const newKeyVersion = result?.data?.keyVersion || Date.now().toString()

      const keys = await loadUserKeys()
      if (!keys?.privateKey) {
        throw new Error('No private key found')
      }

      const serverKeysData = await apiService.getUserKeysForServer(serverId)

      if (!serverKeysData?.encryptedKey) {
        throw new Error('Could not get new server encryption keys')
      }

      const symmetricKeyBase64 = await crypto.decryptKeyForUser(
        serverKeysData.encryptedKey,
        keys.privateKey
      )

      const symmetricKey = await crypto.importSymmetricKey(symmetricKeyBase64)

      const currentKey = decryptedSymmetricKeys[serverId]
      const currentKeyData = serverKeys[serverId]

      if (currentKey && currentKeyData) {
        setPreviousServerKeys(prev => ({
          ...prev,
          [serverId]: {
            key: currentKey,
            symmetricKey: currentKeyData.symmetricKey,
            keyId: currentKeyData.keyId,
            keyVersion: currentKeyData.keyVersion,
            rotatedAt: new Date().toISOString()
          }
        }))
      }

      setDecryptedSymmetricKeys(prev => ({
        ...prev,
        [serverId]: symmetricKey
      }))

      setServerKeys(prev => ({
        ...prev,
        [serverId]: {
          keyId: serverKeysData?.keyId,
          symmetricKey: symmetricKeyBase64,
          keyVersion: newKeyVersion
        }
      }))

      return { success: true, keyVersion: newKeyVersion }
    } catch (err) {
      console.error('[E2E] Error rotating keys:', err)
      return { success: false, error: err.message }
    }
  }, [getServerEncryptionStatus, leaveServerEncryption, loadUserKeys, decryptedSymmetricKeys, serverKeys])

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
      
      localStorage.setItem(`e2e_keys_${userRef.current.id}`, JSON.stringify(keys))
      setUserKeys(keys)
      
      return true
    } catch (err) {
      console.error('[E2E] Error importing keys:', err)
      return false
    }
  }, [userKeys])

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
    const hasUser = await waitForUser()
    if (!hasUser) return
    
    setLoading(true)
    setError(null)
    
    try {
      const keys = await loadUserKeys()
      if (!keys?.privateKey) {
        setError('No private key found')
        setLoading(false)
        return false
      }

      const dmKeysData = await apiService.getDmUserKeys(conversationId)

      if (!dmKeysData?.data?.dmEncryptionEnabled) {
        setDmEncryptionStatus(prev => ({
          ...prev,
          [conversationId]: {
            ...(prev[conversationId] || {}),
            enabled: false
          }
        }))
        setLoading(false)
        return false
      }

      if (!dmKeysData?.data?.encryptedKey) {
        setError('No encrypted DM key available')
        setLoading(false)
        return false
      }

      await apiService.joinDmE2e(conversationId, {
        encryptedKey: dmKeysData.data.encryptedKey
      })
      
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

      setDmEncryptionStatus(prev => ({
        ...prev,
        [conversationId]: {
          ...(prev[conversationId] || {}),
          enabled: true
        }
      }))
      
      setLoading(false)
      return true
    } catch (err) {
      console.error('[E2E] Error joining DM encryption:', err)
      setError(err.message)
      setLoading(false)
      return false
    }
  }, [loadUserKeys])

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

  const getDmEncryptionFullStatus = useCallback(async (conversationId) => {
    try {
      const response = await apiService.getDmEncryptionStatus(conversationId)
      setDmEncryptionStatus(prev => ({
        ...prev,
        [conversationId]: response?.data
      }))
      return response?.data
    } catch (err) {
      console.error('[E2E] Error getting DM full status:', err)
      return { enabled: false }
    }
  }, [])

  const requestDmEncryption = useCallback(async (conversationId, mode) => {
    try {
      await apiService.requestDmEncryption(conversationId, mode)
      return true
    } catch (err) {
      console.error('[E2E] Error requesting DM encryption:', err)
      return false
    }
  }, [])

  const respondToDmEncryptionRequest = useCallback(async (conversationId, accepted, encryptedKey) => {
    try {
      await apiService.respondToDmEncryptionRequest(conversationId, accepted, encryptedKey)
      return true
    } catch (err) {
      console.error('[E2E] Error responding to DM encryption request:', err)
      return false
    }
  }, [])

  const confirmDmEncryption = useCallback(async (conversationId, encryptedKey) => {
    try {
      const result = await apiService.confirmDmEncryption(conversationId, encryptedKey)
      if (result?.data?.allConfirmed) {
        const dmKeysData = await apiService.getDmE2eKeys(conversationId)
        if (dmKeysData?.data?.encryptedKey) {
          const keys = await loadUserKeys()
          const symmetricKeyBase64 = await crypto.decryptKeyForUser(
            dmKeysData.data.encryptedKey,
            keys.privateKey
          )
          const symmetricKey = await crypto.importSymmetricKey(symmetricKeyBase64)
          setDecryptedDmKeys(prev => ({
            ...prev,
            [conversationId]: symmetricKey
          }))
        }
      }
      return result?.data
    } catch (err) {
      console.error('[E2E] Error confirming DM encryption:', err)
      return false
    }
  }, [loadUserKeys])

  const declineDmEncryption = useCallback(async (conversationId) => {
    try {
      await apiService.declineDmEncryption(conversationId)
      return true
    } catch (err) {
      console.error('[E2E] Error declining DM encryption:', err)
      return false
    }
  }, [])

  const encryptDmPreviousMessages = useCallback(async (conversationId) => {
    try {
      await apiService.encryptDmPreviousMessages(conversationId)
      return true
    } catch (err) {
      console.error('[E2E] Error encrypting previous messages:', err)
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
      const keyVersion = dmKeys[conversationId]?.keyVersion || null
      return {
        encrypted: true,
        content: encrypted.encrypted,
        iv: encrypted.iv,
        keyVersion
      }
    } catch (err) {
      console.error('[E2E] Error encrypting DM message:', err)
      return { encrypted: false, content, error: 'encryption_failed' }
    }
  }, [isDmEncryptionEnabled, hasDmDecryptedKey, decryptedDmKeys, dmKeys])

  const decryptDmMessage = useCallback(async (encryptedData, conversationId) => {
    if (!hasDmDecryptedKey(conversationId)) {
      throw new Error('No decryption key available')
    }
    
    const symmetricKey = decryptedDmKeys[conversationId]
    return crypto.decryptMessage(encryptedData, symmetricKey)
  }, [hasDmDecryptedKey, decryptedDmKeys])

  const decryptMessageFromDm = useCallback(async (message, conversationId) => {
    const encryptedFlag = message?.encrypted === true
    const hasCipherPayload = !!(message?.iv && typeof message?.content === 'string')
    if ((!encryptedFlag && !hasCipherPayload) || !hasDmDecryptedKey(conversationId)) {
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
      const id = getDeviceId()
      setDeviceId(id)
    }
  }, [user?.id, loadUserKeys, getDeviceId])

  useEffect(() => {
    const serverId = currentServer?.id
    if (!serverId || !userRef.current?.id) return
    const timeoutMap = timeoutIdsRef.current

    const encryptionEnabled = isEncryptionEnabled(serverId)
    const hasKey = hasDecryptedKey(serverId)

    console.log('[useAutoJoinEncryption] Checking server:', {
      serverId,
      encryptionEnabled,
      hasKey,
      processing: processingServersRef.current.has(serverId)
    })

    if (!encryptionEnabled) {
      retryAttemptsRef.current.delete(serverId)
      return
    }

    if (hasKey) {
      retryAttemptsRef.current.delete(serverId)
      return
    }

    if (processingServersRef.current.has(serverId)) {
      return
    }

    const attempts = retryAttemptsRef.current.get(serverId) || 0
    
    // For first attempt on a server, try to fetch missing keys from other devices
    if (attempts === 0 && userKeys) {
      console.log('[useAutoJoinEncryption] First attempt - trying to fetch missing keys from server')
      fetchMissingKeys('').then(fetched => {
        if (fetched) {
          console.log('[useAutoJoinEncryption] Successfully fetched missing keys from server')
          // Check again if we now have the key
          if (hasDecryptedKey(serverId)) {
            retryAttemptsRef.current.delete(serverId)
            return
          }
        }
      }).catch(err => {
        console.warn('[useAutoJoinEncryption] Failed to fetch missing keys:', err)
      })
    }
    
    if (attempts >= MAX_RETRIES) {
      console.error('[useAutoJoinEncryption] Max retries reached for server:', serverId)
      retryAttemptsRef.current.delete(serverId)
      return
    }

    const joinEncryption = async () => {
      processingServersRef.current.add(serverId)

      try {
        console.log('[useAutoJoinEncryption] Attempting to join encryption for server:', serverId)

        const success = await joinServerEncryption(serverId)

        if (success) {
          console.log('[useAutoJoinEncryption] Successfully joined encryption for server:', serverId)
          retryAttemptsRef.current.delete(serverId)
        } else {
          throw new Error('joinServerEncryption returned false')
        }
      } catch (err) {
        console.error('[useAutoJoinEncryption] Failed to join encryption:', err)

        const newAttempts = (retryAttemptsRef.current.get(serverId) || 0) + 1
        retryAttemptsRef.current.set(serverId, newAttempts)

        if (newAttempts < MAX_RETRIES) {
          console.log(`[useAutoJoinEncryption] Retrying in ${RETRY_DELAY}ms (attempt ${newAttempts}/${MAX_RETRIES})`)
          const timeoutId = setTimeout(() => {
            processingServersRef.current.delete(serverId)
            timeoutMap.delete(serverId)
            joinEncryption()
          }, RETRY_DELAY)
          timeoutMap.set(serverId, timeoutId)
        }
      } finally {
        processingServersRef.current.delete(serverId)
      }
    }

    joinEncryption()

    return () => {
      const timeoutId = timeoutMap.get(serverId)
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutMap.delete(serverId)
      }
    }
  }, [currentServer?.id, isEncryptionEnabled, hasDecryptedKey, joinServerEncryption, fetchMissingKeys, userKeys])

const value = useMemo(() => ({
    userKeys,
    serverEncryptionStatus,
    dmEncryptionStatus,
    serverKeys,
    dmKeys,
    decryptedSymmetricKeys,
    decryptedDmKeys,
    loading,
    error,
    deviceId,
    loadUserKeys,
    getServerEncryptionStatus,
    getDmEncryptionStatus,
    getDmEncryptionFullStatus,
    joinServerEncryption,
    leaveServerEncryption,
    autoEnrollServerEncryption,
    joinDmEncryption,
    leaveDmEncryption,
    requestDmEncryption,
    respondToDmEncryptionRequest,
    confirmDmEncryption,
    declineDmEncryption,
    encryptDmPreviousMessages,
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
    importKeysFromBackup,
    exportAllKeysForBackup,
    importAllKeysFromBackup,
    getCurrentSymmetricKey,
    syncKeysToIndexedDB,
    loadKeysFromIndexedDB,
    fetchServerKeyOnJoin,
    cleanupOldKeys,
    getDeviceId,
    syncKeysToServer,
    fetchMissingKeys,
    startBackgroundSync,
    stopBackgroundSync
  }), [
    userKeys,
    serverEncryptionStatus,
    dmEncryptionStatus,
    serverKeys,
    dmKeys,
    decryptedSymmetricKeys,
    decryptedDmKeys,
    loading,
    error,
    deviceId,
    loadUserKeys,
    getServerEncryptionStatus,
    getDmEncryptionStatus,
    getDmEncryptionFullStatus,
    joinServerEncryption,
    leaveServerEncryption,
    autoEnrollServerEncryption,
    joinDmEncryption,
    leaveDmEncryption,
    requestDmEncryption,
    respondToDmEncryptionRequest,
    confirmDmEncryption,
    declineDmEncryption,
    encryptDmPreviousMessages,
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
    importKeysFromBackup,
    exportAllKeysForBackup,
    importAllKeysFromBackup,
    getCurrentSymmetricKey,
    syncKeysToIndexedDB,
    loadKeysFromIndexedDB,
    fetchServerKeyOnJoin,
    cleanupOldKeys,
    getDeviceId,
    syncKeysToServer,
    fetchMissingKeys,
    startBackgroundSync,
    stopBackgroundSync
  ])

  return (
    <E2eContext.Provider value={value}>
      {children}
    </E2eContext.Provider>
  )
}
