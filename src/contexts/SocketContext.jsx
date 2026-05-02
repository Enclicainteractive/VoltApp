import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { io } from 'socket.io-client'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { useAppStore } from '../store/useAppStore'
import { soundService } from '../services/soundService'
import { getStoredServer } from '../services/serverConfig'
import { apiService } from '../services/apiService'
import { settingsService } from '../services/settingsService'
import {
  getAuthTokenCandidates,
  markLocalTokenAccepted
} from '../services/authToken'

const SocketContext = createContext(null)
const VALID_PRESENCE_STATUSES = new Set(['online', 'idle', 'dnd', 'invisible', 'offline'])
const PRESENCE_STATUS_ALIASES = {
  active: 'online',
  available: 'online',
  away: 'idle',
  busy: 'dnd',
  do_not_disturb: 'dnd',
  'do-not-disturb': 'dnd'
}
const TRANSIENT_DISCONNECT_GRACE_MS = 6000
const SELF_PRESENCE_STALE_TOLERANCE_MS = 2000

const normalizePresenceStatus = (status, fallback = null) => {
  if (typeof status !== 'string') return fallback
  const normalized = status.trim().toLowerCase().replace(/\s+/g, '_')
  const canonical = PRESENCE_STATUS_ALIASES[normalized] || normalized
  return VALID_PRESENCE_STATUSES.has(canonical) ? canonical : fallback
}

const normalizePresenceTimestampMs = (value) => {
  if (value == null) return null
  if (value instanceof Date) {
    const dateValue = value.getTime()
    return Number.isFinite(dateValue) ? dateValue : null
  }

  let numeric = null
  if (typeof value === 'number') {
    numeric = value
  } else if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    const numericValue = Number(trimmed)
    if (Number.isFinite(numericValue)) {
      numeric = numericValue
    } else {
      const parsedDate = Date.parse(trimmed)
      return Number.isFinite(parsedDate) ? parsedDate : null
    }
  } else {
    return null
  }

  if (!Number.isFinite(numeric) || numeric <= 0) return null
  if (numeric >= 1e12) return numeric
  if (numeric >= 1e9) return numeric * 1000
  return null
}

const getPresenceEventTimestampMs = (payload) => {
  if (!payload || typeof payload !== 'object') return null
  const candidates = [
    payload.updatedAt,
    payload.timestamp,
    payload.ts,
    payload.lastSeenAt,
    payload.lastActiveAt,
    payload.emittedAt
  ]
  for (const candidate of candidates) {
    const timestampMs = normalizePresenceTimestampMs(candidate)
    if (timestampMs !== null) return timestampMs
  }
  return null
}

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null)
  const [connected, setConnected] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)
  const [automodTestingMode, setAutomodTestingMode] = useState({})
  const [notifications, setNotifications] = useState([])
  const [serverUpdates, setServerUpdates] = useState({})
  const [systemUnreadCount, setSystemUnreadCount] = useState(0)
  const { isAuthenticated, user } = useAuth()
  const setSelfPresence = useAppStore(state => state.setSelfPresence)
  const navigate = useNavigate()
  const socketRef = useRef(null)
  const serverUrlRef = useRef(null)
  const authTokenRef = useRef(null)
  const recentNotificationKeysRef = useRef(new Set())
  const intentionalDisconnectRef = useRef(false)
  const connectionStateRef = useRef({ connected: false, reconnecting: false })
  const transientDisconnectTimerRef = useRef(null)
  const disconnectStartedAtRef = useRef(null)
  const lastSelfPresenceEventTsRef = useRef(0)
  const selfPresenceRef = useRef({
    status: normalizePresenceStatus(user?.status, 'online'),
    customStatus: typeof user?.customStatus === 'string' ? user.customStatus : ''
  })
  
  // Performance optimization: debounced connection attempts
  const connectionRetryTimeoutRef = useRef(null)
  const maxRetryAttempts = useRef(0)
  const retryDelays = [1000, 2000, 5000, 10000, 15000] // Progressive delays
  const heartbeatIntervalRef = useRef(null)
  const lastHeartbeatRef = useRef(Date.now())
  
  // Optimized connection handling with exponential backoff
  const createOptimizedSocket = useCallback((serverUrl, authToken) => {
    if (socketRef.current) {
      socketRef.current.disconnect()
      socketRef.current = null
    }
    
    const socket = io(serverUrl, {
      auth: { token: authToken },
      timeout: 5000,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      maxReconnectionAttempts: 5,
      transports: ['websocket', 'polling'], // Prefer websocket
      upgrade: true,
      forceNew: true
    })
    
    // Heartbeat mechanism for connection health
    const startHeartbeat = () => {
      heartbeatIntervalRef.current = setInterval(() => {
        if (socket.connected) {
          socket.emit('ping', Date.now())
          lastHeartbeatRef.current = Date.now()
        } else if (Date.now() - lastHeartbeatRef.current > 30000) {
          // Force reconnection if no heartbeat for 30s
          socket.disconnect()
          socket.connect()
        }
      }, 15000) // Every 15 seconds
    }
    
    const stopHeartbeat = () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current)
        heartbeatIntervalRef.current = null
      }
    }
    
    return { socket, startHeartbeat, stopHeartbeat }
  }, [])

  const isServerMuted = useCallback((serverId) => {
    if (!serverId) return false
    const settings = settingsService.getSettings()
    return Boolean(settings?.serverMutes?.[serverId])
  }, [])

  const updateConnectionState = useCallback((patch, reason) => {
    const previous = connectionStateRef.current
    const next = {
      connected: typeof patch?.connected === 'boolean' ? patch.connected : previous.connected,
      reconnecting: typeof patch?.reconnecting === 'boolean' ? patch.reconnecting : previous.reconnecting
    }

    if (next.connected === previous.connected && next.reconnecting === previous.reconnecting) {
      return
    }

    connectionStateRef.current = next
    setConnected(next.connected)
    setReconnecting(next.reconnecting)
    console.log('[Socket] Connection state transition', { reason, from: previous, to: next })
  }, [])

  const clearTransientDisconnectTimer = useCallback(() => {
    if (transientDisconnectTimerRef.current !== null) {
      clearTimeout(transientDisconnectTimerRef.current)
      transientDisconnectTimerRef.current = null
    }
  }, [])

  const scheduleConnectedDrop = useCallback((reason) => {
    clearTransientDisconnectTimer()
    transientDisconnectTimerRef.current = setTimeout(() => {
      transientDisconnectTimerRef.current = null
      updateConnectionState({ connected: false }, `disconnect-grace-expired:${reason}`)
    }, TRANSIENT_DISCONNECT_GRACE_MS)
  }, [clearTransientDisconnectTimer, updateConnectionState])

  // Use refs for user-derived values so they don't cause socket reconnection
  const userRef = useRef(user)
  useEffect(() => {
    const normalizedStatus = normalizePresenceStatus(user?.status, null)
    userRef.current = user && normalizedStatus ? { ...user, status: normalizedStatus } : user
    if (!user) return

    const hasCustomStatus = typeof user.customStatus === 'string'

    if (!normalizedStatus && !hasCustomStatus) return

    selfPresenceRef.current = {
      status: normalizedStatus || selfPresenceRef.current.status,
      customStatus: hasCustomStatus ? user.customStatus : selfPresenceRef.current.customStatus
    }
  }, [user])

  const notificationsBlockedByPresence = useCallback(() => {
    const status = userRef.current?.status
    return status === 'dnd' || status === 'invisible'
  }, [])

  const isSelfAuthoredNotification = useCallback((notification) => {
    const currentUserId = userRef.current?.id
    if (!currentUserId) return false

    return [
      notification?.senderId,
      notification?.authorId,
      notification?.userId,
      notification?.fromUserId,
      notification?.actorId
    ].some((id) => id === currentUserId)
  }, [])

  const isMeaningfulNotification = useCallback((notification) => {
    const title = String(notification?.title || '').trim().toLowerCase()
    const message = String(notification?.message || '').trim().toLowerCase()
    const combined = `${title} ${message}`.trim()
    if (!combined) return false

    return ![
      'no updates found',
      'already up to date',
      'you are up to date',
      'up to date'
    ].some((phrase) => combined.includes(phrase))
  }, [])

  const shouldSurfaceNotification = useCallback((notification) => {
    if (notificationsBlockedByPresence()) return false
    if (isSelfAuthoredNotification(notification)) return false
    if (!isMeaningfulNotification(notification)) return false

    const settings = settingsService.getSettings()
    const desktopNotificationsEnabled = settings?.notifications !== false
    const pushNotificationsEnabled = settings?.pushNotifications === true

    if (!desktopNotificationsEnabled && !pushNotificationsEnabled) return false

    if (notification?.type === 'mention') {
      if (settings?.messageNotifications === false) return false
      if (settings?.mentionNotifications === false) return false
      if (isServerMuted(notification?.serverId)) return false
    }

    if ((notification?.type === 'system' || notification?.type === 'dm') && settings?.messageNotifications === false) {
      return false
    }

    if (notification?.type === 'friend-request' && settings?.friendRequests === false) {
      return false
    }

    return true
  }, [isMeaningfulNotification, isSelfAuthoredNotification, isServerMuted, notificationsBlockedByPresence])

  const showNativeNotification = useCallback(async (notification) => {
    if (!shouldSurfaceNotification(notification)) return

    const deeplink = notification.channelId
      ? `/chat/${notification.serverId || ''}?channel=${notification.channelId}`
      : notification.deeplink

    if (typeof window.__DESKTOP_PUSH_NOTIFY__ === 'function') {
      try {
        await window.__DESKTOP_PUSH_NOTIFY__({
          title: notification.title || 'VoltChat',
          body: notification.message || '',
          deeplink,
          silent: notification.silent
        })
        return
      } catch {}
    }

    if (window.__IS_DESKTOP_APP__ && window.electron?.showNotification) {
      try {
        await window.electron.showNotification({
          title: notification.title || 'VoltChat',
          body: notification.message || '',
          deeplink,
          silent: notification.silent
        })
        return
      } catch {}
    }

    if (typeof window.Notification !== 'undefined' && window.Notification.permission === 'granted') {
      try {
        const nativeNotification = new window.Notification(notification.title || 'VoltChat', {
          body: notification.message || '',
          silent: Boolean(notification.silent)
        })
        if (deeplink) {
          nativeNotification.onclick = () => {
            window.focus()
            if (typeof window.__HANDLE_DEEP_LINK__ === 'function') {
              window.__HANDLE_DEEP_LINK__(deeplink)
            } else {
              navigate?.(deeplink) || window.location.assign(deeplink)
            }
            nativeNotification.close()
          }
        }
      } catch {}
    }
  }, [shouldSurfaceNotification, navigate])

  // Fetch initial system unread count on auth
  useEffect(() => {
    if (!isAuthenticated) { setSystemUnreadCount(0); return }
    apiService.getSystemUnreadCount()
      .then(res => setSystemUnreadCount(res.data?.count || 0))
      .catch(() => {})
  }, [isAuthenticated])

  const handleServerUpdate = useCallback((updatedServer) => {
    if (!updatedServer?.id) return
    setServerUpdates(prev => {
      const existing = prev[updatedServer.id] || {}
      return {
        ...prev,
        [updatedServer.id]: {
          ...existing,
          ...updatedServer,
          channels: updatedServer.channels ?? existing.channels,
          categories: updatedServer.categories ?? existing.categories,
          roles: updatedServer.roles ?? existing.roles,
          members: updatedServer.members ?? existing.members
        }
      }
    })
  }, [])

  const handleServerRemoved = useCallback(({ serverId }) => {
    if (!serverId) return
    setServerUpdates(prev => ({
      ...prev,
      [serverId]: {
        ...(prev[serverId] || {}),
        id: serverId,
        __removed: true
      }
    }))
  }, [])

  const handleChannelCreate = useCallback((channel) => {
    if (!channel?.serverId || !channel?.id) return
    setServerUpdates(prev => {
      const server = prev[channel.serverId] || { id: channel.serverId }
      const existingChannels = Array.isArray(server.channels) ? server.channels : []
      const nextChannels = existingChannels.some(item => item.id === channel.id)
        ? existingChannels.map(item => item.id === channel.id ? { ...item, ...channel } : item)
        : [...existingChannels, channel]
      return {
        ...prev,
        [channel.serverId]: {
          ...server,
          channels: nextChannels
        }
      }
    })
  }, [])

  const handleChannelUpdate = useCallback((channel) => {
    if (!channel?.serverId || !channel?.id) return
    setServerUpdates(prev => {
      const server = prev[channel.serverId] || { id: channel.serverId }
      const existingChannels = Array.isArray(server.channels) ? server.channels : []
      const nextChannels = existingChannels.some(item => item.id === channel.id)
        ? existingChannels.map(item => item.id === channel.id ? { ...item, ...channel } : item)
        : [...existingChannels, channel]
      return {
        ...prev,
        [channel.serverId]: {
          ...server,
          channels: nextChannels
        }
      }
    })
  }, [])

  const handleChannelDelete = useCallback(({ channelId, serverId }) => {
    if (!serverId || !channelId) return
    setServerUpdates(prev => {
      const server = prev[serverId]
      if (server) {
        return {
          ...prev,
          [serverId]: {
            ...server,
            channels: server.channels?.filter(c => c.id !== channelId) || [],
            defaultChannelId: server.defaultChannelId === channelId ? null : server.defaultChannelId
          }
        }
      }
      return prev
    })
  }, [])

  const handleChannelOrderUpdate = useCallback((channels) => {
    setServerUpdates(prev => {
      const firstChannel = channels[0]
      if (firstChannel?.serverId) {
        const server = prev[firstChannel.serverId] || { id: firstChannel.serverId }
        return {
          ...prev,
          [firstChannel.serverId]: {
            ...server,
            channels
          }
        }
      }
      return prev
    })
  }, [])

  const handleCategoryCreate = useCallback((category) => {
    if (!category?.serverId || !category?.id) return
    setServerUpdates(prev => {
      const server = prev[category.serverId] || { id: category.serverId }
      const existingCategories = Array.isArray(server.categories) ? server.categories : []
      const nextCategories = existingCategories.some(item => item.id === category.id)
        ? existingCategories.map(item => item.id === category.id ? { ...item, ...category } : item)
        : [...existingCategories, category]
      return {
        ...prev,
        [category.serverId]: {
          ...server,
          categories: nextCategories
        }
      }
    })
  }, [])

  const handleCategoryUpdate = useCallback((category) => {
    if (!category?.serverId || !category?.id) return
    setServerUpdates(prev => {
      const server = prev[category.serverId] || { id: category.serverId }
      const existingCategories = Array.isArray(server.categories) ? server.categories : []
      const nextCategories = existingCategories.some(item => item.id === category.id)
        ? existingCategories.map(item => item.id === category.id ? { ...item, ...category } : item)
        : [...existingCategories, category]
      return {
        ...prev,
        [category.serverId]: {
          ...server,
          categories: nextCategories
        }
      }
    })
  }, [])

  const handleCategoryDelete = useCallback(({ categoryId, serverId }) => {
    if (!serverId || !categoryId) return
    setServerUpdates(prev => {
      const server = prev[serverId]
      if (server) {
        return {
          ...prev,
          [serverId]: {
            ...server,
            categories: server.categories?.filter(c => c.id !== categoryId) || [],
            channels: server.channels?.map((channel) => (
              channel.categoryId === categoryId
                ? { ...channel, categoryId: null }
                : channel
            )) || []
          }
        }
      }
      return prev
    })
  }, [])

  const handleCategoryOrderUpdate = useCallback((categories) => {
    const firstCategory = categories[0]
    if (firstCategory?.serverId) {
      setServerUpdates(prev => {
        const server = prev[firstCategory.serverId] || { id: firstCategory.serverId }
        return {
          ...prev,
          [firstCategory.serverId]: {
            ...server,
            categories
          }
        }
      })
    }
  }, [])

  const handleRoleCreate = useCallback((role) => {
    if (!role?.serverId || !role?.id) return
    setServerUpdates(prev => {
      const server = prev[role.serverId] || { id: role.serverId }
      const existingRoles = Array.isArray(server.roles) ? server.roles : []
      const nextRoles = existingRoles.some(item => item.id === role.id)
        ? existingRoles.map(item => item.id === role.id ? { ...item, ...role } : item)
        : [...existingRoles, role]
      return {
        ...prev,
        [role.serverId]: {
          ...server,
          roles: nextRoles
        }
      }
    })
  }, [])

  const handleRoleUpdate = useCallback((role) => {
    if (!role?.serverId || !role?.id) return
    setServerUpdates(prev => {
      const server = prev[role.serverId] || { id: role.serverId }
      const existingRoles = Array.isArray(server.roles) ? server.roles : []
      const nextRoles = existingRoles.some(item => item.id === role.id)
        ? existingRoles.map(item => item.id === role.id ? { ...item, ...role } : item)
        : [...existingRoles, role]
      return {
        ...prev,
        [role.serverId]: {
          ...server,
          roles: nextRoles
        }
      }
    })
  }, [])

  const handleRoleDelete = useCallback(({ roleId, serverId }) => {
    if (!serverId || !roleId) return
    setServerUpdates(prev => {
      const server = prev[serverId]
      if (server) {
        return {
          ...prev,
          [serverId]: {
            ...server,
            roles: server.roles?.filter(r => r.id !== roleId) || [],
            members: server.members?.map((member) => {
              const roleIds = Array.isArray(member.roles)
                ? member.roles.filter((id) => id !== roleId)
                : member.role && member.role !== roleId
                  ? [member.role]
                  : []
              return {
                ...member,
                roles: roleIds,
                role: roleIds[0] || null
              }
            }) || []
          }
        }
      }
      return prev
    })
  }, [])

  const handleMemberUpdate = useCallback((payload) => {
    const serverId = payload?.serverId
    const member = payload?.member || payload
    if (!serverId || !member?.id) return
    setServerUpdates(prev => {
      const server = prev[serverId] || { id: serverId }
      const existingMembers = Array.isArray(server.members) ? server.members : []
      const nextMembers = existingMembers.some(item => item.id === member.id)
        ? existingMembers.map(item => item.id === member.id ? { ...item, ...member } : item)
        : [...existingMembers, member]
      return {
        ...prev,
        [serverId]: {
          ...server,
          members: nextMembers
        }
      }
    })
  }, [])

  const handleMemberRemove = useCallback((payload) => {
    const serverId = payload?.serverId
    const memberId = payload?.memberId || payload?.userId || payload?.id
    if (!serverId || !memberId) return
    setServerUpdates(prev => {
      const server = prev[serverId]
      if (!server) return prev
      return {
        ...prev,
        [serverId]: {
          ...server,
          members: (server.members || []).filter(member => member.id !== memberId)
        }
      }
    })
  }, [])

  const rememberNotificationKey = useCallback((key) => {
    if (!key) return true
    const bucket = recentNotificationKeysRef.current
    if (bucket.has(key)) return false
    bucket.add(key)
    if (bucket.size > 200) {
      const oldest = bucket.values().next().value
      bucket.delete(oldest)
    }
    setTimeout(() => {
      bucket.delete(key)
    }, 15000)
    return true
  }, [])

  const primeServerUpdate = useCallback((serverLike) => {
    handleServerUpdate(serverLike)
  }, [handleServerUpdate])

  const normalizeNotificationText = useCallback((value, fallback = '') => {
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
    if (value && typeof value === 'object') {
      if (typeof value.content === 'string') return value.content
      if (typeof value.message === 'string') return value.message
      if (typeof value.body === 'string') return value.body
      if (typeof value.title === 'string') return value.title
    }
    return fallback
  }, [])

  const addNotification = useCallback((notification) => {
    if (!shouldSurfaceNotification(notification)) return

    const id = Date.now() + Math.random()
    const newNotification = {
      ...notification,
      title: normalizeNotificationText(notification?.title, 'VoltChat'),
      message: normalizeNotificationText(notification?.message ?? notification?.content ?? notification?.body, ''),
      id,
      timestamp: new Date()
    }
    setNotifications(prev => [newNotification, ...prev].slice(0, 50)) // Keep last 50

    // Only show native desktop notification when app is not focused
    // This prevents double notifications (toast + native)
    if (document.visibilityState !== 'visible') {
      showNativeNotification(newNotification)
    }
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id))
    }, 5000)
  }, [normalizeNotificationText, showNativeNotification, shouldSurfaceNotification])

  const removeNotification = useCallback((id) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
  }, [])

  // Use refs to store callback implementations to prevent socket reconnection on every render
  const handleServerUpdateRef = useRef(handleServerUpdate)
  const handleServerRemovedRef = useRef(handleServerRemoved)
  const handleChannelCreateRef = useRef(handleChannelCreate)
  const handleChannelUpdateRef = useRef(handleChannelUpdate)
  const handleChannelDeleteRef = useRef(handleChannelDelete)
  const handleChannelOrderUpdateRef = useRef(handleChannelOrderUpdate)
  const handleCategoryCreateRef = useRef(handleCategoryCreate)
  const handleCategoryUpdateRef = useRef(handleCategoryUpdate)
  const handleCategoryDeleteRef = useRef(handleCategoryDelete)
  const handleCategoryOrderUpdateRef = useRef(handleCategoryOrderUpdate)
  const handleRoleCreateRef = useRef(handleRoleCreate)
  const handleRoleUpdateRef = useRef(handleRoleUpdate)
  const handleRoleDeleteRef = useRef(handleRoleDelete)
  const handleMemberUpdateRef = useRef(handleMemberUpdate)
  const handleMemberRemoveRef = useRef(handleMemberRemove)
  const isServerMutedRef = useRef(isServerMuted)
  const rememberNotificationKeyRef = useRef(rememberNotificationKey)
  const addNotificationRef = useRef(addNotification)

  // Keep refs updated with latest implementations
  useEffect(() => { handleServerUpdateRef.current = handleServerUpdate }, [handleServerUpdate])
  useEffect(() => { handleServerRemovedRef.current = handleServerRemoved }, [handleServerRemoved])
  useEffect(() => { handleChannelCreateRef.current = handleChannelCreate }, [handleChannelCreate])
  useEffect(() => { handleChannelUpdateRef.current = handleChannelUpdate }, [handleChannelUpdate])
  useEffect(() => { handleChannelDeleteRef.current = handleChannelDelete }, [handleChannelDelete])
  useEffect(() => { handleChannelOrderUpdateRef.current = handleChannelOrderUpdate }, [handleChannelOrderUpdate])
  useEffect(() => { handleCategoryCreateRef.current = handleCategoryCreate }, [handleCategoryCreate])
  useEffect(() => { handleCategoryUpdateRef.current = handleCategoryUpdate }, [handleCategoryUpdate])
  useEffect(() => { handleCategoryDeleteRef.current = handleCategoryDelete }, [handleCategoryDelete])
  useEffect(() => { handleCategoryOrderUpdateRef.current = handleCategoryOrderUpdate }, [handleCategoryOrderUpdate])
  useEffect(() => { handleRoleCreateRef.current = handleRoleCreate }, [handleRoleCreate])
  useEffect(() => { handleRoleUpdateRef.current = handleRoleUpdate }, [handleRoleUpdate])
  useEffect(() => { handleRoleDeleteRef.current = handleRoleDelete }, [handleRoleDelete])
  useEffect(() => { handleMemberUpdateRef.current = handleMemberUpdate }, [handleMemberUpdate])
  useEffect(() => { handleMemberRemoveRef.current = handleMemberRemove }, [handleMemberRemove])
  useEffect(() => { isServerMutedRef.current = isServerMuted }, [isServerMuted])
  useEffect(() => { rememberNotificationKeyRef.current = rememberNotificationKey }, [rememberNotificationKey])
  useEffect(() => { addNotificationRef.current = addNotification }, [addNotification])

  // Socket connection logic - only reconnects when auth/server URL actually changes
  useEffect(() => {
    const tokenCandidates = getAuthTokenCandidates()
    const currentAuthToken = tokenCandidates[0]?.token || null
    
    // Handle logout case
    if (!isAuthenticated || tokenCandidates.length === 0) {
      if (socketRef.current) {
        intentionalDisconnectRef.current = true
        socketRef.current.disconnect()
        socketRef.current = null
        setSocket(null)
      }
      disconnectStartedAtRef.current = null
      clearTransientDisconnectTimer()
      updateConnectionState({ connected: false, reconnecting: false }, 'auth-not-authenticated')
      serverUrlRef.current = null
      authTokenRef.current = null
      return
    }

    const server = getStoredServer()
    const socketUrl = server?.socketUrl || 'https://volt.voltagechat.app'

    // Early return if socket already exists and is connected to the correct URL with correct token
    // This prevents unnecessary disconnection when switching between servers in the same instance
    if (
      socketRef.current &&
      socketRef.current.connected &&
      serverUrlRef.current === socketUrl &&
      authTokenRef.current === currentAuthToken
    ) {
      // Socket is already properly connected - just update refs in case they changed
      serverUrlRef.current = socketUrl
      authTokenRef.current = currentAuthToken
      return
    }

    // Only disconnect if URL or token actually changed (not on initial load)
    if (
      socketRef.current &&
      (serverUrlRef.current !== socketUrl || authTokenRef.current !== currentAuthToken)
    ) {
      console.log('[Socket] Server or auth changed, reconnecting...', { 
        oldUrl: serverUrlRef.current, 
        newUrl: socketUrl,
        oldToken: authTokenRef.current ? '***' : null,
        newToken: currentAuthToken ? '***' : null
      })
      intentionalDisconnectRef.current = true
      socketRef.current.disconnect()
      socketRef.current = null
    }

    // Update refs before connecting
    serverUrlRef.current = socketUrl
    authTokenRef.current = currentAuthToken
    
    console.log('[Socket] Connecting to:', socketUrl)
    
    const newSocket = io(socketUrl, {
      auth: { token: currentAuthToken },
      transports: ['websocket', 'polling'], // ✅ Prefer WebSocket first!
      upgrade: true,
      rememberUpgrade: true,
      // Bounded reconnection: 15 attempts prevents infinite spin on bad token.
      reconnection: true,
      reconnectionAttempts: 15,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      randomizationFactor: 0.5,
      timeout: 20000, // Reduced from 30s for faster failure detection
      // More reliable ping/pong settings to prevent false disconnects
      pingTimeout: 120000, // 2 minutes - increased from 60s
      pingInterval: 30000,  // 30 seconds - increased from 25s
      // Reuse existing connection if possible (helps with session persistence)
      autoConnect: true,
      forceNew: false
    })

    // One-shot 30s stale timer: started on the first connect_error.
    // If the socket is still not connected after 30s, stop showing the
    // reconnecting spinner so ProtectedRoute can fall through to its
    // recoverable error UI (Deadlock C).
    let staleTimerStarted = false
    let staleTimerId = null

    newSocket.on('connect', () => {
      console.log('[Socket] Connected, id:', newSocket.id)
      intentionalDisconnectRef.current = false
      disconnectStartedAtRef.current = null
      clearTransientDisconnectTimer()
      updateConnectionState({ connected: true, reconnecting: false }, 'socket-connect')

      // Cancel the stale timer — we connected successfully.
      if (staleTimerId !== null) {
        clearTimeout(staleTimerId)
        staleTimerId = null
        staleTimerStarted = false
      }

      // Re-authenticate with fresh token on reconnect
      const freshTokens = getAuthTokenCandidates()
      const nextToken = freshTokens[0]?.token || null
      if (nextToken && nextToken !== authTokenRef.current) {
        authTokenRef.current = nextToken
        newSocket.auth = { token: nextToken }
      }
      markLocalTokenAccepted()
    })

    newSocket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected, reason:', reason)

      if (reason === 'io client disconnect' && intentionalDisconnectRef.current) {
        disconnectStartedAtRef.current = null
        clearTransientDisconnectTimer()
        updateConnectionState({ connected: false, reconnecting: false }, `disconnect:${reason}`)
        return
      }

      disconnectStartedAtRef.current = Date.now()
      // Keep connected=true briefly while Socket.IO is reconnecting to avoid
      // false "offline" states on short network blips.
      updateConnectionState({ reconnecting: true }, `disconnect:${reason}`)
      scheduleConnectedDrop(reason)

      if (reason === 'io server disconnect') {
        console.log('[Socket] Server disconnected namespace, reconnecting socket manually')
        try {
          newSocket.connect()
        } catch (error) {
          console.error('[Socket] Failed to restart socket after server disconnect:', error)
        }
      }
    })

    newSocket.io.on('reconnect', (attemptNumber) => {
      console.log('[Socket] Reconnected after', attemptNumber, 'attempts')
      disconnectStartedAtRef.current = null
      clearTransientDisconnectTimer()
      updateConnectionState({ connected: true, reconnecting: false }, `reconnect:${attemptNumber}`)
    })

    newSocket.io.on('reconnect_attempt', (attemptNumber) => {
      console.log('[Socket] Reconnection attempt', attemptNumber)
      updateConnectionState({ reconnecting: true }, `reconnect-attempt:${attemptNumber}`)
    })

    newSocket.io.on('reconnect_error', (error) => {
      console.error('[Socket] Reconnection error:', error)
    })

    newSocket.io.on('reconnect_failed', () => {
      console.error('[Socket] Reconnection failed after all attempts')
      disconnectStartedAtRef.current = null
      clearTransientDisconnectTimer()
      updateConnectionState({ connected: false, reconnecting: false }, 'reconnect-failed')
    })

    newSocket.on('connect_error', (error) => {
      console.error('[Socket] Connection error:', error.message)
      if (error.message?.includes('Authentication') || error.message?.includes('Unauthorized') || error.message?.includes('jwt')) {
        const freshTokens = getAuthTokenCandidates()
        const nextToken = freshTokens[0]?.token || null
        if (nextToken) {
          newSocket.auth = { token: nextToken }
          authTokenRef.current = nextToken
        }
      }
      updateConnectionState({ reconnecting: true }, 'connect-error')
      if (connectionStateRef.current.connected) {
        scheduleConnectedDrop(`connect-error:${error?.message || 'unknown'}`)
      }

      // Start the one-shot 30s stale timer on the very first connect_error.
      if (!staleTimerStarted) {
        staleTimerStarted = true
        staleTimerId = setTimeout(() => {
          if (!newSocket.connected) {
            console.warn('[Socket] Could not connect within 30s — marking as stale')
            updateConnectionState({ reconnecting: false }, 'connect-stale-timeout')
          }
          staleTimerId = null
        }, 30000)
      }
    })

    newSocket.on('connected', (data) => {
      console.log('[Socket] Server acknowledged connection:', data)
    })

    // Enhanced heartbeat handling
    newSocket.on('ws:ping', () => {
      newSocket.emit('ws:pong')
      lastHeartbeatRef.current = Date.now()
    })

    // Respond to ping with pong and update heartbeat
    newSocket.on('ping', () => {
      newSocket.emit('pong')
      lastHeartbeatRef.current = Date.now()
    })

    // Additional heartbeat to prevent timeout issues
    const heartbeatInterval = setInterval(() => {
      if (newSocket.connected) {
        newSocket.emit('heartbeat', { 
          timestamp: Date.now(),
          clientTime: Date.now() 
        })
        lastHeartbeatRef.current = Date.now()
      }
    }, 45000) // Every 45 seconds

    // Cleanup heartbeat on disconnect
    newSocket.on('disconnect', () => {
      clearInterval(heartbeatInterval)
    })

    newSocket.on('notification:mention', (data) => {
      console.log('[Socket] Mention notification:', data)
      if (isServerMutedRef.current(data.serverId)) {
        return
      }

      addNotificationRef.current({
        type: 'mention',
        title: data.type === 'everyone' ? '@everyone mentioned you' :
               data.type === 'here'     ? '@here notification' :
               `${data.senderName} mentioned you`,
        message: data.content,
        senderId: data.senderId,
        authorId: data.senderId,
        serverId: data.serverId,
        channelId: data.channelId,
        messageId: data.messageId,
        senderName: data.senderName
      })

      const settings = settingsService.getSettings()
      if (settings?.sounds === false || settings?.messageNotifications === false) {
        return
      }

      if (data.type === 'user') {
        soundService.dmMention()
      } else {
        soundService.mention()
      }
    })

    newSocket.on('dm:notification', (data) => {
      const settings = settingsService.getSettings()
      if ((settings?.notifications === false && settings?.pushNotifications !== true) || settings?.messageNotifications === false) return

      const dedupeKey = data?.messageId || data?.clientNonce || `dm:${data?.conversationId || ''}:${data?.senderId || data?.senderName || ''}:${data?.timestamp || ''}`
      if (!rememberNotificationKeyRef.current(dedupeKey)) return

      addNotificationRef.current({
        type: 'dm',
        title: data?.senderName || data?.title || 'New direct message',
        message: data?.content || data?.message || 'Open VoltChat to reply.',
        deeplink: data?.conversationId ? `/chat/dms/${data.conversationId}` : '/chat/dms',
        conversationId: data?.conversationId || null,
        senderName: data?.senderName || null,
        senderId: data?.senderId || data?.userId || null,
        authorId: data?.authorId || data?.senderId || data?.userId || null
      })

      if (settings?.sounds !== false) {
        soundService.dmReceived?.()
      }
    })

    newSocket.on('dm:new', (data) => {
      const settings = settingsService.getSettings()
      if ((settings?.notifications === false && settings?.pushNotifications !== true) || settings?.messageNotifications === false) return

      const dedupeKey = data?.id || data?.messageId || data?.clientNonce || `dm:new:${data?.conversationId || ''}:${data?.senderId || data?.authorId || ''}:${data?.createdAt || data?.timestamp || ''}`
      if (!rememberNotificationKeyRef.current(dedupeKey)) return

      addNotificationRef.current({
        type: 'dm',
        title: data?.senderName || data?.author?.username || data?.username || 'New direct message',
        message: data?.content || data?.message || 'Open VoltChat to reply.',
        deeplink: data?.conversationId ? `/chat/dms/${data.conversationId}` : '/chat/dms',
        conversationId: data?.conversationId || null,
        senderName: data?.senderName || data?.author?.username || data?.username || null,
        senderId: data?.senderId || data?.authorId || data?.author?.id || data?.userId || null,
        authorId: data?.authorId || data?.author?.id || data?.senderId || data?.userId || null
      })

      if (settings?.sounds !== false) {
        soundService.dmReceived?.()
      }
    })

    newSocket.on('friend:request', (data) => {
      const settings = settingsService.getSettings()
      if ((settings?.notifications === false && settings?.pushNotifications !== true) || settings?.friendRequests === false) return

      const senderName = data?.senderName || data?.username || data?.fromUser?.username || data?.user?.username || 'Someone'
      const dedupeKey = data?.requestId || data?.id || `friend:${data?.fromUserId || data?.userId || senderName}:${data?.createdAt || ''}`
      if (!rememberNotificationKeyRef.current(dedupeKey)) return

      addNotificationRef.current({
        type: 'friend-request',
        title: 'Friend request',
        message: `${senderName} sent you a friend request`,
        senderName,
        fromUserId: data?.fromUserId || data?.userId || data?.senderId || null,
        deeplink: '/chat/friends'
      })

      if (settings?.sounds !== false) {
        soundService.notification?.()
      }
    })

    const applySelfPresenceEvent = (eventName, payload, fallbackStatus = null) => {
      if (!payload || typeof payload !== 'object') {
        console.warn(`[Socket] Ignoring malformed ${eventName} payload`, payload)
        return
      }

      const currentUserId = userRef.current?.id
      const eventUserId = payload.userId || payload.memberId || payload.id
      if (!eventUserId) {
        console.warn(`[Socket] Ignoring ${eventName} event without user id`, payload)
        return
      }
      if (!currentUserId || eventUserId !== currentUserId) return

      const nextStatus = normalizePresenceStatus(payload.status, fallbackStatus)
      if (!nextStatus) {
        console.warn(`[Socket] Ignoring ${eventName} event with invalid status`, payload)
        return
      }

      const eventTimestampMs = getPresenceEventTimestampMs(payload)
      if (eventTimestampMs !== null) {
        const lastTimestampMs = lastSelfPresenceEventTsRef.current
        if (
          lastTimestampMs > 0 &&
          eventTimestampMs + SELF_PRESENCE_STALE_TOLERANCE_MS < lastTimestampMs
        ) {
          console.log('[Socket] Ignoring stale self presence event', {
            event: eventName,
            eventTimestampMs,
            lastTimestampMs
          })
          return
        }
      }

      if (nextStatus === 'offline') {
        const state = connectionStateRef.current
        const isActiveReconnect =
          state.connected ||
          state.reconnecting ||
          newSocket.connected ||
          newSocket.active
        const disconnectStartedAt = disconnectStartedAtRef.current
        const withinTransientWindow =
          typeof disconnectStartedAt === 'number' &&
          Date.now() - disconnectStartedAt < TRANSIENT_DISCONNECT_GRACE_MS

        if (isActiveReconnect || withinTransientWindow) {
          console.log('[Socket] Ignoring transient self offline presence event', {
            event: eventName,
            connected: state.connected,
            reconnecting: state.reconnecting,
            socketConnected: newSocket.connected,
            socketActive: newSocket.active,
            withinTransientWindow
          })
          return
        }
      }

      const nextCustomStatus = typeof payload.customStatus === 'string'
        ? payload.customStatus
        : selfPresenceRef.current.customStatus

      const previous = selfPresenceRef.current
      if (previous.status === nextStatus && previous.customStatus === nextCustomStatus) return

      const nextPresence = {
        status: nextStatus,
        customStatus: nextCustomStatus
      }

      selfPresenceRef.current = nextPresence
      if (userRef.current && userRef.current.id === currentUserId) {
        userRef.current = {
          ...userRef.current,
          ...nextPresence
        }
      }
      if (eventTimestampMs !== null) {
        lastSelfPresenceEventTsRef.current = Math.max(lastSelfPresenceEventTsRef.current, eventTimestampMs)
      } else if (lastSelfPresenceEventTsRef.current <= 0) {
        lastSelfPresenceEventTsRef.current = Date.now()
      }
      setSelfPresence(nextPresence)
      console.log('[Socket] Self presence transition', { event: eventName, from: previous, to: nextPresence })
    }

    newSocket.on('user:status', (payload) => applySelfPresenceEvent('user:status', payload))
    newSocket.on('member:online', (payload) => applySelfPresenceEvent('member:online', payload, 'online'))
    newSocket.on('member:offline', (payload) => {
      if (!payload || typeof payload !== 'object') {
        console.warn('[Socket] Ignoring malformed member:offline payload', payload)
        return
      }

      const currentUserId = userRef.current?.id
      const eventUserId = payload.userId || payload.memberId || payload.id
      if (!eventUserId) {
        console.warn('[Socket] Ignoring member:offline event without user id', payload)
        return
      }
      if (!currentUserId || eventUserId !== currentUserId) return

      applySelfPresenceEvent('member:offline', { ...payload, status: 'offline' }, 'offline')
    })

    newSocket.on('server:updated', (...args) => handleServerUpdateRef.current(...args))
    newSocket.on('server:joined', (payload) => {
      const joinedServer = payload?.server || payload
      const serverId = joinedServer?.id || payload?.serverId
      if (!serverId) return
      handleServerUpdateRef.current({
        ...joinedServer,
        id: serverId,
        __addToList: true
      })
    })
    newSocket.on('server:deleted', (...args) => handleServerRemovedRef.current(...args))
    newSocket.on('server:left', (...args) => handleServerRemovedRef.current(...args))
    newSocket.on('channel:created', (...args) => handleChannelCreateRef.current(...args))
    newSocket.on('channel:updated', (...args) => handleChannelUpdateRef.current(...args))
    newSocket.on('channel:deleted', (...args) => handleChannelDeleteRef.current(...args))
    newSocket.on('channel:order-updated', (...args) => handleChannelOrderUpdateRef.current(...args))
    newSocket.on('category:created', (...args) => handleCategoryCreateRef.current(...args))
    newSocket.on('category:updated', (...args) => handleCategoryUpdateRef.current(...args))
    newSocket.on('category:deleted', (...args) => handleCategoryDeleteRef.current(...args))
    newSocket.on('category:order-updated', (...args) => handleCategoryOrderUpdateRef.current(...args))
    newSocket.on('role:created', (...args) => handleRoleCreateRef.current(...args))
    newSocket.on('role:updated', (...args) => handleRoleUpdateRef.current(...args))
    newSocket.on('role:deleted', (...args) => handleRoleDeleteRef.current(...args))
    newSocket.on('member:updated', (...args) => handleMemberUpdateRef.current(...args))
    newSocket.on('member:roles-updated', (...args) => handleMemberUpdateRef.current(...args))
    newSocket.on('member:joined', (...args) => handleMemberUpdateRef.current(...args))
    newSocket.on('member:removed', (...args) => handleMemberRemoveRef.current(...args))
    newSocket.on('member:kicked', (...args) => handleMemberRemoveRef.current(...args))
    newSocket.on('member:banned', (...args) => handleMemberRemoveRef.current(...args))

    // Timeout notification - show a toast/alert to the timed-out user
    newSocket.on('member:timeout', (data) => {
      const { serverId, memberId, timeoutUntil, reason } = data
      // Only act if this event is for the current user
      const currentUserId = newSocket.auth?.userId || newSocket.user?.id
      if (memberId && currentUserId && memberId !== currentUserId) return
      if (timeoutUntil) {
        const until = new Date(timeoutUntil)
        const remaining = Math.ceil((until - Date.now()) / 1000 / 60)
        const msg = reason
          ? `You have been timed out for ${remaining} minute(s). Reason: ${reason}`
          : `You have been timed out for ${remaining} minute(s).`
        // Dispatch a custom event so any component can show a notification
        window.dispatchEvent(new CustomEvent('user:timed-out', { detail: { serverId, timeoutUntil, reason, message: msg } }))
        console.warn('[Socket] You have been timed out:', msg)
      } else {
        window.dispatchEvent(new CustomEvent('user:timed-out', { detail: { serverId, timeoutUntil: null, reason: null, message: 'Your timeout has been removed.' } }))
      }
    })

    // Force voice disconnect - server/admin kicked user from voice channel
    newSocket.on('voice:force-disconnect', (data) => {
      console.warn('[Socket] Force-disconnected from voice by moderator')
      // Dispatch event so VoiceChannel/VoiceContext can leave the channel
      window.dispatchEvent(new CustomEvent('voice:force-disconnect', { detail: data }))
    })

    newSocket.on('bot:added', (data) => {
      console.log('[Socket] Bot added to server:', data)
    })

    newSocket.on('bot:removed', (data) => {
      console.log('[Socket] Bot removed from server:', data)
    })

    newSocket.on('e2e:epoch-advanced', (data) => {
      console.log('[Socket] E2EE epoch advanced:', data)
    })

    newSocket.on('e2e:member-added', (data) => {
      console.log('[Socket] E2EE member added:', data)
    })

    newSocket.on('e2e:member-removed', (data) => {
      console.log('[Socket] E2EE member removed:', data)
    })

    newSocket.on('automod:testing-mode', (data) => {
      console.log('[Socket] AutoMod testing mode changed:', data)
      setAutomodTestingMode(prev => ({ ...prev, [data.serverId]: data.testingMode }))
    })

    newSocket.on('system:message', (data) => {
      console.log('[Socket] System message received:', data?.title)
      setSystemUnreadCount(prev => prev + 1)
      addNotificationRef.current({
        type: 'system',
        category: data.category,
        title: data.title,
        message: data.body?.slice(0, 120),
        severity: data.severity || 'info',
        icon: data.icon,
        messageId: data.id
      })
      soundService.dmReceived?.()
    })

    socketRef.current = newSocket
    setSocket(newSocket)

    return () => {
      // Cancel the stale timer if the effect is re-running (e.g. auth changed).
      if (staleTimerId !== null) {
        clearTimeout(staleTimerId)
        staleTimerId = null
      }
      clearTransientDisconnectTimer()
      if (socketRef.current === newSocket) {
        console.log('[Socket] Cleaning up socket connection')
        socketRef.current = null
        intentionalDisconnectRef.current = true
        disconnectStartedAtRef.current = null
        newSocket.disconnect()
        setSocket(current => current === newSocket ? null : current)
      }
    }
  }, [isAuthenticated, clearTransientDisconnectTimer, scheduleConnectedDrop, setSelfPresence, updateConnectionState])

  const value = {
    socket,
    connected,
    reconnecting,
    automodTestingMode,
    notifications,
    removeNotification,
    serverUpdates,
    primeServerUpdate,
    clearServerUpdate: (serverId) => setServerUpdates(prev => {
      const newUpdates = { ...prev }
      delete newUpdates[serverId]
      return newUpdates
    }),
    systemUnreadCount,
    setSystemUnreadCount
  }

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>
}

export const useSocket = () => {
  const context = useContext(SocketContext)
  if (!context) {
    throw new Error('useSocket must be used within SocketProvider')
  }
  return context
}
