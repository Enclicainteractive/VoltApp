import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from './AuthContext'
import { useSocket } from './SocketContext'
import { apiService } from '../services/apiService'
import * as crypto from '../utils/crypto'

const E2eTrueContext = createContext(null)

export const useE2eTrue = () => {
  const context = useContext(E2eTrueContext)
  if (!context) throw new Error('useE2eTrue must be used within E2eTrueProvider')
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
  const [pendingMessages, setPendingMessages] = useState([])
  const [registered, setRegistered] = useState(false)
  const [loading, setLoading] = useState(false)
  const keysRef = useRef(null)

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

      const cacheKey = `${groupId}:${epoch.epoch}`
      setSenderKeys(prev => ({ ...prev, [cacheKey]: symmetricKey }))
      localStorage.setItem(`e2e_true_sender_${user.id}_${cacheKey}`, exported)

      return { epoch, symmetricKey }
    } catch (err) {
      console.error('[E2E-True] Failed to init group:', err)
      return null
    }
  }, [user?.id, deviceId])

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

  const encryptMessage = useCallback(async (content, groupId) => {
    const epochData = await getGroupEpoch(groupId)
    if (!epochData?.epoch) return { encrypted: false, content }

    const cacheKey = `${groupId}:${epochData.epoch}`
    let key = senderKeys[cacheKey]

    if (!key) {
      const stored = localStorage.getItem(`e2e_true_sender_${user?.id}_${cacheKey}`)
      if (stored) {
        key = await crypto.importSymmetricKey(stored)
        setSenderKeys(prev => ({ ...prev, [cacheKey]: key }))
      }
    }

    if (!key) return { encrypted: false, content }

    try {
      const encrypted = await crypto.encryptMessage(content, key)
      return {
        encrypted: true,
        content: encrypted.encrypted,
        iv: encrypted.iv,
        epoch: epochData.epoch
      }
    } catch (err) {
      console.error('[E2E-True] Encrypt failed:', err)
      return { encrypted: false, content }
    }
  }, [getGroupEpoch, senderKeys, user?.id])

  const decryptMessage = useCallback(async (message, groupId) => {
    if (!message.encrypted || !message.epoch) return message.content

    const cacheKey = `${groupId}:${message.epoch}`
    let key = senderKeys[cacheKey]

    if (!key) {
      const stored = localStorage.getItem(`e2e_true_sender_${user?.id}_${cacheKey}`)
      if (stored) {
        key = await crypto.importSymmetricKey(stored)
        setSenderKeys(prev => ({ ...prev, [cacheKey]: key }))
      }
    }

    if (!key) {
      setPendingMessages(prev => [...prev, { ...message, groupId }])
      return '[Encrypted - awaiting key update]'
    }

    try {
      return await crypto.decryptMessage({ iv: message.iv, encrypted: message.content }, key)
    } catch {
      return '[Encrypted - could not decrypt]'
    }
  }, [senderKeys, user?.id])

  const fetchQueuedUpdates = useCallback(async () => {
    if (!user?.id) return

    try {
      const keyRes = await apiService.getQueuedKeyUpdates(deviceId)
      const updates = keyRes.data || []

      for (const update of updates.sort((a, b) => a.epoch - b.epoch)) {
        try {
          const keys = keysRef.current
          if (!keys?.identityPrivateKey) continue

          const blob = JSON.parse(update.encryptedKeyBlob)
          const decrypted = await crypto.decryptKeyForUser(blob, keys.identityPrivateKey)

          const cacheKey = `${update.groupId}:${update.epoch}`
          const imported = await crypto.importSymmetricKey(decrypted)
          setSenderKeys(prev => ({ ...prev, [cacheKey]: imported }))
          localStorage.setItem(`e2e_true_sender_${user.id}_${cacheKey}`, decrypted)
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
  }, [user?.id, deviceId, senderKeys])

  const advanceEpoch = useCallback(async (groupId, reason) => {
    try {
      const res = await apiService.advanceEpoch(groupId, reason)
      const newEpoch = res.data?.epoch

      const symmetricKey = await crypto.generateSymmetricKey()
      const exported = await crypto.exportSymmetricKey(symmetricKey)
      const cacheKey = `${groupId}:${newEpoch}`

      setSenderKeys(prev => ({ ...prev, [cacheKey]: symmetricKey }))
      localStorage.setItem(`e2e_true_sender_${user?.id}_${cacheKey}`, exported)

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
  }, [user?.id, distributeSenderKeys])

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
          const cacheKey = `${data.groupId}:${data.epoch}`
          const imported = await crypto.importSymmetricKey(decrypted)
          setSenderKeys(prev => ({ ...prev, [cacheKey]: imported }))
          localStorage.setItem(`e2e_true_sender_${user?.id}_${cacheKey}`, decrypted)
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
          const cacheKey = `${update.groupId}:${update.epoch}`
          const imported = await crypto.importSymmetricKey(decrypted)
          setSenderKeys(prev => ({ ...prev, [cacheKey]: imported }))
          localStorage.setItem(`e2e_true_sender_${user?.id}_${cacheKey}`, decrypted)
        } catch (err) {
          console.error('[E2E-True] Failed to process queued update:', err)
        }
      }
    }

    socket.on('e2e-true:sender-key-available', handleSenderKeyAvailable)
    socket.on('e2e-true:epoch-advanced', handleEpochAdvanced)
    socket.on('e2e-true:queued-updates', handleQueuedUpdates)

    return () => {
      socket.off('e2e-true:sender-key-available', handleSenderKeyAvailable)
      socket.off('e2e-true:epoch-advanced', handleEpochAdvanced)
      socket.off('e2e-true:queued-updates', handleQueuedUpdates)
    }
  }, [socket, connected, user?.id, deviceId])

  const value = {
    deviceId,
    identityKeys,
    registered,
    loading,
    groupEpochs,
    initGroupEncryption,
    getGroupEpoch,
    distributeSenderKeys,
    encryptMessage,
    decryptMessage,
    advanceEpoch,
    fetchQueuedUpdates,
    computeSafetyNumber
  }

  return (
    <E2eTrueContext.Provider value={value}>
      {children}
    </E2eTrueContext.Provider>
  )
}
