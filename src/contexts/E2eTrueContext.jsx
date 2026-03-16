import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from './AuthContext'
import { useSocket } from './SocketContext'
import { apiService } from '../services/apiService'
import * as crypto from '../utils/crypto'

const E2eTrueContext = createContext(null)
const ENCRYPTION_STATUS_TTL = 5 * 60 * 1000
const SENDER_KEY_REQUEST_TTL = 30 * 1000

export const useE2eTrue = () => {
  const context = useContext(E2eTrueContext)
  if (!context) throw new Error('useE2eTrue must be within E2eTrueProvider')
  return context
}

const getDeviceId = () => {
  let deviceId = localStorage.getItem('volt_device_id')
  if (!deviceId) {
    deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    localStorage.setItem('volt_device_id', deviceId)
  }
  return deviceId
}

export const E2eTrueProvider = ({ children }) => {
  const { user } = useAuth()
  const { socket, connected } = useSocket()
  const [deviceId] = useState(getDeviceId)
  const [identityKeys, setIdentityKeys] = useState(null)
  const [groupEpochs, setGroupEpochs] = useState({})
  const [senderKeys, setSenderKeys] = useState({})
  const [sharedServerKeys, setSharedServerKeys] = useState({})
  const [pendingMessages, setPendingMessages] = useState([])
  const [keySyncTick, setKeySyncTick] = useState(0)
  const [registered, setRegistered] = useState(false)
  const [loading, setLoading] = useState(false)
  const keysRef = useRef(null)
  const encryptionStatusCacheRef = useRef(new Map())
  const encryptionStatusInFlightRef = useRef(new Map())
  const senderKeyRequestInFlightRef = useRef(new Map())
  const senderKeyRequestedAtRef = useRef(new Map())

  const storeSenderKeyMaterial = useCallback(async (groupId, epoch, rawSenderKey, importedKey = null) => {
    const cacheKey = `${groupId}:${epoch}`
    const key = importedKey || await crypto.importSymmetricKey(rawSenderKey)
    setSenderKeys(prev => ({ ...prev, [cacheKey]: key }))
    localStorage.setItem(`e2e_true_sender_${user?.id}_${cacheKey}`, rawSenderKey)
    setKeySyncTick(prev => prev + 1)
    return key
  }, [user?.id])

  const loadOrGenerateIdentityKeys = useCallback(async () => {
    if (!user?.id) return null

    const stored = localStorage.getItem(`e2e_true_keys_${user.id}_${deviceId}`)
    if (stored) {
      const keys = JSON.parse(stored)
      setIdentityKeys(keys)
      keysRef.current = keys
      return keys
    }

    const keyPair = await crypto.generateKeyPair()
    const signedPreKey = await crypto.generateKeyPair()

    const keys = {
      identityPublicKey: keyPair.publicKey,
      identityPrivateKey: keyPair.privateKey,
      signedPreKey: signedPreKey.publicKey,
      signedPreKeyPrivate: signedPreKey.privateKey,
      signedPreKeySignature: await crypto.hashData(signedPreKey.publicKey + keyPair.publicKey),
      createdAt: new Date().toISOString()
    }

    localStorage.setItem(`e2e_true_keys_${user.id}_${deviceId}`, JSON.stringify(keys))
    setIdentityKeys(keys)
    keysRef.current = keys
    return keys
  }, [user?.id, deviceId])

  const registerDevice = useCallback(async () => {
    if (!user?.id || registered) return

    const keys = await loadOrGenerateIdentityKeys()
    if (!keys) return

    try {
      await apiService.uploadDeviceKeys({
        deviceId,
        identityPublicKey: keys.identityPublicKey,
        signedPreKey: keys.signedPreKey,
        signedPreKeySignature: keys.signedPreKeySignature,
        oneTimePreKeys: []
      })
      setRegistered(true)

      if (socket && connected) {
        socket.emit('e2e-true:register-device', {
          deviceId,
          identityPublicKey: keys.identityPublicKey,
          signedPreKey: keys.signedPreKey,
          signedPreKeySignature: keys.signedPreKeySignature
        })
      }
    } catch (err) {
      console.error('[E2E-True] Failed to register device:', err)
    }
  }, [user?.id, deviceId, registered, socket, connected, loadOrGenerateIdentityKeys])

  const initGroupEncryption = useCallback(async (groupId) => {
    if (!user?.id) return null

    try {
      const res = await apiService.initGroupE2ee(groupId, deviceId)
      const epoch = res.data
      setGroupEpochs(prev => ({ ...prev, [groupId]: epoch }))

      const symmetricKey = await crypto.generateSymmetricKey()
      const exported = await crypto.exportSymmetricKey(symmetricKey)

      await storeSenderKeyMaterial(groupId, epoch.epoch, exported, symmetricKey)

      return { epoch, symmetricKey }
    } catch (err) {
      console.error('[E2E-True] Failed to init group:', err)
      return null
    }
  }, [user?.id, deviceId, storeSenderKeyMaterial])

  const getGroupEpoch = useCallback(async (groupId) => {
    if (groupEpochs[groupId]) return groupEpochs[groupId]

    try {
      const res = await apiService.getGroupEpoch(groupId)
      if (res.data?.epoch) {
        setGroupEpochs(prev => ({ ...prev, [groupId]: res.data }))
        return res.data
      }
      return null
    } catch {
      return null
    }
  }, [groupEpochs])

  const distributeSenderKeys = useCallback(async (groupId, epoch) => {
    if (!user?.id) return

    const cacheKey = `${groupId}:${epoch}`
    const stored = localStorage.getItem(`e2e_true_sender_${user.id}_${cacheKey}`)
    if (!stored) return

    try {
      const members = await apiService.getGroupMembers(groupId)
      const memberList = members.data || []

      const keys = []
      for (const memberId of memberList) {
        if (memberId === user.id) continue

        const devices = await apiService.getUserDevices(memberId)
        for (const device of (devices.data || [])) {
          const bundle = await apiService.getDeviceKeys(memberId, device.deviceId)
          if (!bundle.data?.identityPublicKey) continue

          const encrypted = await crypto.encryptKeyForUser(stored, bundle.data.identityPublicKey)
          keys.push({
            toUserId: memberId,
            toDeviceId: device.deviceId,
            encryptedKeyBlob: JSON.stringify(encrypted)
          })
        }
      }

      if (keys.length > 0) {
        await apiService.distributeSenderKeys(groupId, {
          epoch,
          fromDeviceId: deviceId,
          keys
        })
      }
    } catch (err) {
      console.error('[E2E-True] Failed to distribute keys:', err)
    }
  }, [user?.id, deviceId])

  // CRITICAL: Server-agnostic encryption - server NEVER has access to symmetric keys
  // All key distribution is done via Sender Keys (peer-to-peer encryption)
  const getGroupKey = useCallback(async (groupId, epoch) => {
    // First try to get our own sender key for this group/epoch
    const cacheKey = `${groupId}:${epoch}`
    const stored = localStorage.getItem(`e2e_true_sender_${user?.id}_${cacheKey}`)
    
    if (stored) {
      const key = await crypto.importSymmetricKey(stored)
      setSenderKeys(prev => ({ ...prev, [cacheKey]: key }))
      setKeySyncTick(prev => prev + 1)
      return key
    }
    
    // Try legacy shared key (for backwards compatibility only - should be phased out)
    const legacyStored = localStorage.getItem(`e2e_true_shared_${groupId}_${epoch}`)
    if (legacyStored) {
      const key = await crypto.importSymmetricKey(legacyStored)
      setSharedServerKeys(prev => ({ ...prev, [groupId]: key }))
      return key
    }
    
    return null
  }, [user?.id])

  // Generate a NEW unique sender key for this user/group - NEVER shared with server
  const generateSenderKey = useCallback(async (groupId, epoch) => {
    const symmetricKey = await crypto.generateSymmetricKey()
    const exported = await crypto.exportSymmetricKey(symmetricKey)
    await storeSenderKeyMaterial(groupId, epoch, exported, symmetricKey)
    return symmetricKey
  }, [storeSenderKeyMaterial])

  const getSharedServerKey = useCallback(async (groupId) => {
    if (!groupId || !user?.id) return null
    const epochData = await getGroupEpoch(groupId)
    if (!epochData?.epoch) return null
    return getGroupKey(groupId, epochData.epoch)
  }, [user?.id, getGroupEpoch, getGroupKey])

  // Check if encryption is enabled for a server
  const isEncryptionEnabled = useCallback(async (serverId) => {
    if (!serverId) return false
    const cached = encryptionStatusCacheRef.current.get(serverId)
    if (cached && (Date.now() - cached.fetchedAt) < ENCRYPTION_STATUS_TTL) {
      return cached.enabled
    }

    const inFlight = encryptionStatusInFlightRef.current.get(serverId)
    if (inFlight) {
      return inFlight
    }

    try {
      const request = apiService.getE2eStatus(serverId)
        .then((res) => {
          const enabled = res?.data?.enabled || false
          encryptionStatusCacheRef.current.set(serverId, { enabled, fetchedAt: Date.now() })
          return enabled
        })
        .catch(() => {
          const fallback = cached?.enabled || false
          encryptionStatusCacheRef.current.set(serverId, { enabled: fallback, fetchedAt: Date.now() })
          return fallback
        })
        .finally(() => {
          encryptionStatusInFlightRef.current.delete(serverId)
        })

      encryptionStatusInFlightRef.current.set(serverId, request)
      return await request
    } catch {
      return false
    }
  }, [])

  // CRITICAL: Server-agnostic encryption - uses sender keys only
  const encryptMessage = useCallback(async (content, groupId) => {
    // Check if encryption is actually enabled on the server
    const enabled = await isEncryptionEnabled(groupId)
    if (!enabled) {
      console.log('[E2E-True] Encryption not enabled for server:', groupId)
      return { encrypted: false, content }
    }

    const epochData = await getGroupEpoch(groupId)
    if (!epochData?.epoch) return { encrypted: false, content }

    // CRITICAL: Get sender key - server NEVER has access to this key
    let key = await getGroupKey(groupId, epochData.epoch)

    // If no sender key exists, generate one locally (server never sees it)
    if (!key) {
      console.log('[E2E-True] No sender key found, generating new one')
      key = await generateSenderKey(groupId, epochData.epoch)
      // Distribute to other members (server only relays encrypted keys)
      await distributeSenderKeys(groupId, epochData.epoch)
    }

    if (!key) return { encrypted: false, content }

    try {
      const encrypted = await crypto.encryptMessage(content, key)
      return {
        encrypted: true,
        content: encrypted.encrypted,
        iv: encrypted.iv,
        epoch: epochData.epoch,
        // CRITICAL: Flag to indicate this uses sender key encryption (server cannot decrypt)
        senderKeyBased: true
      }
    } catch (err) {
      console.error('[E2E-True] Encrypt failed:', err)
      return { encrypted: false, content }
    }
  }, [getGroupEpoch, getGroupKey, generateSenderKey, distributeSenderKeys, isEncryptionEnabled])

  // CRITICAL: Request sender keys from existing members when joining/rejoining
  // Server only relays the request - never sees the actual keys
  const requestSenderKeys = useCallback(async (groupId) => {
    if (!user?.id) return
    const lastRequestedAt = senderKeyRequestedAtRef.current.get(groupId) || 0
    if (Date.now() - lastRequestedAt < SENDER_KEY_REQUEST_TTL) {
      return senderKeyRequestInFlightRef.current.get(groupId) || null
    }

    const existing = senderKeyRequestInFlightRef.current.get(groupId)
    if (existing) {
      return existing
    }

    try {
      const request = apiService.requestSenderKeys(groupId, deviceId)
        .then(() => {
          senderKeyRequestedAtRef.current.set(groupId, Date.now())
          console.log('[E2E-True] Requested sender keys for group:', groupId)
        })
        .catch((err) => {
          console.error('[E2E-True] Failed to request sender keys:', err)
        })
        .finally(() => {
          senderKeyRequestInFlightRef.current.delete(groupId)
        })

      senderKeyRequestInFlightRef.current.set(groupId, request)
      await request
    } catch (err) {
      console.error('[E2E-True] Failed to request sender keys:', err)
    }
  }, [user?.id, deviceId])

  // CRITICAL: Server-agnostic decryption - uses sender keys only
  const decryptMessage = useCallback(async (message, groupId, memberStatus) => {
    const hasCipherPayload = !!(message?.iv && typeof message?.content === 'string')
    if ((!message?.encrypted && !hasCipherPayload) || !message?.epoch) return message?.content
    
    // Check if user is still a member - former members should not be able to decrypt
    // If memberStatus is provided and indicates user is not a current member, block decryption
    if (memberStatus === 'left' || memberStatus === 'kicked' || memberStatus === 'banned') {
      console.log('[E2E-True] User has left the server - blocking decryption of encrypted messages')
      return '[Encrypted message - no longer accessible]'
    }

    // CRITICAL: Get sender key - server NEVER has access to this key
    let key = senderKeys[`${groupId}:${message.epoch}`]
    
    if (!key) {
      key = await getGroupKey(groupId, message.epoch)
    }

    if (!key) {
      // Request sender keys from existing members via server relay
      requestSenderKeys(groupId)
      return '[Encrypted - requesting sender key...]'
    }

    try {
      return await crypto.decryptMessage({ iv: message.iv, encrypted: message.content }, key)
    } catch {
      return '[Encrypted - could not decrypt]'
    }
  }, [senderKeys, getGroupKey, requestSenderKeys])

  const fetchQueuedUpdates = useCallback(async () => {
    if (!user?.id) return

    try {
      const keyRes = await apiService.getQueuedKeyUpdates(deviceId)
      const updates = Array.isArray(keyRes?.data) ? keyRes.data : []

      for (const update of updates.sort((a, b) => a.epoch - b.epoch)) {
        try {
          const keys = keysRef.current
          if (!keys?.identityPrivateKey) continue

          const blob = JSON.parse(update.encryptedKeyBlob)
          const decrypted = await crypto.decryptKeyForUser(blob, keys.identityPrivateKey)
          await storeSenderKeyMaterial(update.groupId, update.epoch, decrypted)
        } catch (err) {
          console.error('[E2E-True] Failed to process key update:', err)
        }
      }

      // Retry pending messages
      if (updates.length > 0) {
        setPendingMessages(prev => {
          const remaining = []
          for (const msg of prev) {
            const cacheKey = `${msg.groupId}:${msg.epoch}`
            if (senderKeys[cacheKey]) {
              // Will be decrypted on next render
            } else {
              remaining.push(msg)
            }
          }
          return remaining
        })
      }
    } catch (err) {
      console.error('[E2E-True] Failed to fetch queued updates:', err)
    }
  }, [user?.id, deviceId, senderKeys, storeSenderKeyMaterial])

  const advanceEpoch = useCallback(async (groupId, reason) => {
    try {
      const res = await apiService.advanceEpoch(groupId, reason)
      const newEpoch = res.data?.epoch

      const symmetricKey = await crypto.generateSymmetricKey()
      const exported = await crypto.exportSymmetricKey(symmetricKey)
      await storeSenderKeyMaterial(groupId, newEpoch, exported, symmetricKey)

      setGroupEpochs(prev => ({
        ...prev,
        [groupId]: { ...prev[groupId], epoch: newEpoch }
      }))

      await distributeSenderKeys(groupId, newEpoch)
      return newEpoch
    } catch (err) {
      console.error('[E2E-True] Failed to advance epoch:', err)
      return null
    }
  }, [distributeSenderKeys, storeSenderKeyMaterial])

  const computeSafetyNumber = useCallback(async (theirPublicKey) => {
    if (!identityKeys?.identityPublicKey) return null
    try {
      const res = await apiService.computeSafetyNumber(identityKeys.identityPublicKey, theirPublicKey)
      return res.data?.safetyNumber || null
    } catch {
      return null
    }
  }, [identityKeys])

  // Register device on mount
  useEffect(() => {
    if (user?.id && !registered) {
      registerDevice()
    }
  }, [user?.id, registered, registerDevice])

  // Fetch queued updates on connect
  useEffect(() => {
    if (socket && connected && registered) {
      fetchQueuedUpdates()
    }
  }, [socket, connected, registered, fetchQueuedUpdates])

  // Listen for E2E-True socket events
  useEffect(() => {
    if (!socket || !connected) return

    const handleSenderKeyAvailable = async (data) => {
      try {
        const res = await apiService.getSenderKeys(data.groupId, data.epoch, deviceId)
        const keys = res.data || []

        for (const sk of keys) {
          const blob = JSON.parse(sk.encryptedKeyBlob)
          const currentKeys = keysRef.current
          if (!currentKeys?.identityPrivateKey) continue

          const decrypted = await crypto.decryptKeyForUser(blob, currentKeys.identityPrivateKey)
          await storeSenderKeyMaterial(data.groupId, data.epoch, decrypted)
        }
      } catch (err) {
        console.error('[E2E-True] Failed to process sender key:', err)
      }
    }

    const handleEpochAdvanced = (data) => {
      setGroupEpochs(prev => ({
        ...prev,
        [data.groupId]: { ...prev[data.groupId], epoch: data.epoch }
      }))
    }

    const handleQueuedUpdates = async (data) => {
      const { keyUpdates } = data
      for (const update of (keyUpdates || [])) {
        try {
          const keys = keysRef.current
          if (!keys?.identityPrivateKey) continue

          const blob = JSON.parse(update.encryptedKeyBlob)
          const decrypted = await crypto.decryptKeyForUser(blob, keys.identityPrivateKey)
          await storeSenderKeyMaterial(update.groupId, update.epoch, decrypted)
        } catch (err) {
          console.error('[E2E-True] Failed to process queued update:', err)
        }
      }
    }

    socket.on('e2e-true:sender-key-available', handleSenderKeyAvailable)
    socket.on('e2e-true:epoch-advanced', handleEpochAdvanced)
    socket.on('e2e-true:queued-updates', handleQueuedUpdates)

    // Handle requests from new/rejoining members who need sender keys
    // Existing members should respond by sending their encrypted sender key
    const handleSenderKeyRequest = async (data) => {
      const { groupId, requestingUserId, requestingDeviceId } = data
      
      // Don't respond to our own requests
      if (requestingUserId === user?.id) return
      
      console.log('[E2E-True] Received sender key request from:', requestingUserId, 'for group:', groupId)
      
      try {
        // Collect all locally available sender keys for this group, not only
        // the latest epoch. This allows new members to decrypt historical
        // messages spanning older epochs.
        const senderPrefix = `e2e_true_sender_${user?.id}_${groupId}:`
        const epochsToShare = []

        for (let i = 0; i < localStorage.length; i++) {
          const keyName = localStorage.key(i)
          if (!keyName || !keyName.startsWith(senderPrefix)) continue
          const epochStr = keyName.slice(senderPrefix.length)
          const epoch = Number.parseInt(epochStr, 10)
          if (Number.isNaN(epoch)) continue
          const senderKey = localStorage.getItem(keyName)
          if (!senderKey) continue
          epochsToShare.push({ epoch, senderKey })
        }

        if (epochsToShare.length === 0) {
          console.log('[E2E-True] No sender key to share for group:', groupId)
          return
        }
        
        // Get the requesting user's device keys
        const devices = await apiService.getUserDevices(requestingUserId)
        const targetDevice = (devices.data || []).find(d => d.deviceId === requestingDeviceId) || (devices.data || [])[0]
        
        if (!targetDevice?.deviceId) {
          console.log('[E2E-True] Target device not found for:', requestingUserId)
          return
        }
        
        const bundle = await apiService.getDeviceKeys(requestingUserId, targetDevice.deviceId)
        if (!bundle.data?.identityPublicKey) {
          console.log('[E2E-True] No device bundle found for:', requestingUserId)
          return
        }
        
        // Encrypt all known epoch keys for the requesting user's device.
        const keys = []
        for (const entry of epochsToShare) {
          const encrypted = await crypto.encryptKeyForUser(entry.senderKey, bundle.data.identityPublicKey)
          keys.push({
            toUserId: requestingUserId,
            toDeviceId: targetDevice.deviceId,
            encryptedKeyBlob: JSON.stringify(encrypted),
            epoch: entry.epoch
          })
        }

        // Server API expects epoch on top-level; send one request per epoch.
        const byEpoch = new Map()
        for (const k of keys) {
          const list = byEpoch.get(k.epoch) || []
          list.push({
            toUserId: k.toUserId,
            toDeviceId: k.toDeviceId,
            encryptedKeyBlob: k.encryptedKeyBlob
          })
          byEpoch.set(k.epoch, list)
        }

        // Send encrypted sender keys via server relay only.
        for (const [epoch, epochKeys] of byEpoch.entries()) {
          await apiService.distributeSenderKeys(groupId, {
            epoch,
            fromDeviceId: deviceId,
            keys: epochKeys
          })
        }

        // Also include current epoch if we have it but it was not yet persisted.
        const epochData = await getGroupEpoch(groupId)
        if (epochData?.epoch && !byEpoch.has(epochData.epoch)) {
          const cacheKey = `${groupId}:${epochData.epoch}`
          const currentStored = localStorage.getItem(`e2e_true_sender_${user?.id}_${cacheKey}`)
          if (currentStored) {
            const encrypted = await crypto.encryptKeyForUser(currentStored, bundle.data.identityPublicKey)
            await apiService.distributeSenderKeys(groupId, {
              epoch: epochData.epoch,
              fromDeviceId: deviceId,
              keys: [{
                toUserId: requestingUserId,
                toDeviceId: targetDevice.deviceId,
                encryptedKeyBlob: JSON.stringify(encrypted)
              }]
            })
          }
        }

        // Legacy behavior for single-key send is intentionally replaced by
        // multi-epoch sharing above.
        console.log('[E2E-True] Sent sender keys to:', requestingUserId, 'epochs:', Array.from(byEpoch.keys()))
      } catch (err) {
        console.error('[E2E-True] Failed to respond to sender key request:', err)
      }
    }
    
    socket.on('e2e-true:sender-key-request', handleSenderKeyRequest)

    return () => {
      socket.off('e2e-true:sender-key-available', handleSenderKeyAvailable)
      socket.off('e2e-true:epoch-advanced', handleEpochAdvanced)
      socket.off('e2e-true:queued-updates', handleQueuedUpdates)
      socket.off('e2e-true:sender-key-request', handleSenderKeyRequest)
    }
  }, [socket, connected, user?.id, deviceId, getGroupEpoch, storeSenderKeyMaterial])

  const value = {
    deviceId,
    identityKeys,
    registered,
    loading,
    groupEpochs,
    initGroupEncryption,
    getGroupEpoch,
    // CRITICAL: New server-agnostic functions - server NEVER has access to keys
    getGroupKey,
    getSharedServerKey,
    generateSenderKey,
    requestSenderKeys,
    distributeSenderKeys,
    encryptMessage,
    decryptMessage,
    advanceEpoch,
    fetchQueuedUpdates,
    keySyncTick,
    computeSafetyNumber,
    isEncryptionEnabled
  }

  return (
    <E2eTrueContext.Provider value={value}>
      {children}
    </E2eTrueContext.Provider>
  )
}
