import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { MessageSquare, Lock, Menu, ChevronLeft, Users, Maximize2, Minimize2, PhoneCall, Search, X, Settings, Hash } from 'lucide-react'
import ServerSidebar from '../components/ServerSidebar'
import ChannelSidebar from '../components/ChannelSidebar'
import ChatArea from '../components/ChatArea'
import MemberSidebar from '../components/MemberSidebar'
import FriendsPage from '../components/FriendsPage'
import Discovery from '../components/Discovery'
import HomeEventsHub from '../components/HomeEventsHub'
import DMList from '../components/DMList'
import SystemMessagePanel from '../components/SystemMessagePanel'
import DMChat from '../components/DMChat'
import VoiceChannel from '../components/VoiceChannel'
import VoiceChannelPreview from '../components/VoiceChannelPreview'
import SettingsModal from '../components/modals/SettingsModal'
import ServerSettingsModal from '../components/modals/ServerSettingsModal'
import ProfileModal from '../components/modals/ProfileModal'
import CreateServerModal from '../components/modals/CreateServerModal'
import JoinServerModal from '../components/modals/JoinServerModal'
import AgeVerificationModal from '../components/modals/AgeVerificationModal'
import AdminPanel from '../components/AdminPanel'
import NotificationToast from '../components/NotificationToast'
import VoiceInfoModal from '../components/VoiceInfoModal'
import MobileNav from '../components/MobileNav'
import Avatar from '../components/Avatar'
import { EncryptionFallback } from '../components/EncryptionFallback'
import AnnouncementChannel from '../components/channels/AnnouncementChannel'
import ForumChannel from '../components/channels/ForumChannel'
import MediaChannel from '../components/channels/MediaChannel'
import { useSocket } from '../contexts/SocketContext'
import { useAuth } from '../contexts/AuthContext'
import { useE2e } from '../contexts/E2eContext'
import { useE2eTrue } from '../contexts/E2eTrueContext'
import { useTranslation } from '../hooks/useTranslation'
import { apiService } from '../services/apiService'
import {
  buildClientSignature,
  runSafetyScan
} from '../services/localSafetyService'
import { useAppStore } from '../store/useAppStore'
import { soundService } from '../services/soundService'
import { settingsService } from '../services/settingsService'
import '../assets/styles/ChatPage.css'



const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768)
  
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])
  
  return isMobile
}

const buildEmptyChannelDiagnostic = (response, channelId) => {
  const headerValue = response?.headers?.['x-volt-diagnostics']
  if (headerValue !== 'empty-channel') return null

  return {
    code: 'EMPTY_CHANNEL',
    title: 'No stored messages found',
    message: 'This server reported that the channel request succeeded but no stored messages were returned for this channel.',
    fixes: [
      'Send a new test message in this channel and refresh.',
      'If older messages should exist, verify the server is reading the same message database or JSON store they were written to.'
    ],
    diagnostics: {
      channelId
    }
  }
}

const buildChannelErrorDiagnostic = (error, channelId) => {
  const payload = error?.response?.data || {}
  const diagnostics = payload?.diagnostics || {}
  const fixes = Array.isArray(payload?.fixes) ? payload.fixes : []
  const status = error?.response?.status
  const code = payload?.code || (status ? `HTTP_${status}` : 'MESSAGE_LOAD_FAILED')

  return {
    code,
    title: payload?.error || 'Failed to load messages',
    message: payload?.message || 'Volt could not load this channel history.',
    fixes,
    diagnostics: {
      channelId,
      ...diagnostics
    }
  }
}

const ChatPage = () => {
  const navigate = useNavigate()
  // With the /chat/* wildcard route, useParams returns { '*': 'serverId/channelId' }.
  // We parse the wildcard manually so the component is never unmounted on navigation.
  const rawParams = useParams()
  const pathSegments = (rawParams['*'] || '').split('/').filter(Boolean)
  const serverId = pathSegments[0] || undefined
  const channelId = pathSegments[1] || undefined
  const { socket, connected, serverUpdates, primeServerUpdate } = useSocket()
  const { user, refreshUser, isAuthenticated } = useAuth()
  const { setGlobalEmojis, addGlobalEmoji, removeGlobalEmoji } = useAppStore()
  const { t } = useTranslation()
  const { 
    decryptMessageFromServer, 
    isEncryptionEnabled, 
    hasDecryptedKey,
    getServerEncryptionStatus,
    joinServerEncryption,
    serverEncryptionStatus
  } = useE2e()
  const e2eTrue = useE2eTrue()
  const isMobile = useIsMobile()


  
  const [servers, setServers] = useState([])
  const [currentServer, setCurrentServer] = useState(null)
  const [channels, setChannels] = useState([])
  const [members, setMembers] = useState([])
  const [presenceByServer, setPresenceByServer] = useState({})
  const [channelMessages, setChannelMessages] = useState({})
  const [channelDiagnostics, setChannelDiagnostics] = useState({})
  const channelMessagesRef = useRef(channelMessages)
  channelMessagesRef.current = channelMessages
  const pendingChannelSendTimersRef = useRef(new Map())
  const encryptionEnsureInFlightRef = useRef(new Map())
  const serverLoadInFlightRef = useRef(new Map())
  const lastPresenceRefreshRef = useRef(new Map())
  const lastLoadedServerIdRef = useRef(null)
  const retryDecryptRef = useRef(null)
  const loadMessagesRef = useRef(null)
  const prevChannelIdRef = useRef(channelId)
  const [channelScrollPositions, setChannelScrollPositions] = useState({})
  const [loading, setLoading] = useState(true)
  const [channelLoading, setChannelLoading] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [settingsInitialTab, setSettingsInitialTab] = useState('account')
  const [showServerSettings, setShowServerSettings] = useState(false)
  const [serverSettingsTab, setServerSettingsTab] = useState('overview')
  const [showUserProfile, setShowUserProfile] = useState(null)
  const [showCreateServer, setShowCreateServer] = useState(false)
  const [showJoinServer, setShowJoinServer] = useState(false)
  const [viewMode, setViewMode] = useState('server')
  const [activeVoiceChannel, setActiveVoiceChannel] = useState(null)
  const [voicePreviewChannel, setVoicePreviewChannel] = useState(null)
  const [voiceViewMode, setVoiceViewMode] = useState('full')
  const [voiceFloating, setVoiceFloating] = useState(false)
  const [selectedVoiceChannelId, setSelectedVoiceChannelId] = useState(null)
  const [voiceParticipantsByChannel, setVoiceParticipantsByChannel] = useState({})
  const [leavingVoiceChannelId, setLeavingVoiceChannelId] = useState(null)
  const isJoiningVoiceRef = useRef(false)
  const [isMuted, setIsMuted] = useState(() => {
    const s = settingsService.getSettings()
    return s.rememberVoiceState ? !!s.voiceMuted : false
  })
  const [isDeafened, setIsDeafened] = useState(() => {
    const s = settingsService.getSettings()
    return s.rememberVoiceState ? !!s.voiceDeafened : false
  })
  const [showVoiceInfo, setShowVoiceInfo] = useState(false)
  const [voiceJoinKey, setVoiceJoinKey] = useState(0)
  const [selectedDM, setSelectedDM] = useState(null)
  const [themeStyles, setThemeStyles] = useState({})
  const [pendingAgeChannel, setPendingAgeChannel] = useState(null)
  const [ageGateNotice, setAgeGateNotice] = useState('')
  const [blockedAgeChannels, setBlockedAgeChannels] = useState(new Set())
  const [showMembers, setShowMembers] = useState(true)
  const [showAdminPanel, setShowAdminPanel] = useState(false)
  const [contentCollapsed, setContentCollapsed] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isModerator, setIsModerator] = useState(false)
  const [friendRequestCount, setFriendRequestCount] = useState(0)
  const [dmNotifications, setDmNotifications] = useState([])
  const [serverUnreadCounts, setServerUnreadCounts] = useState({})
  const [unreadChannelsByServer, setUnreadChannelsByServer] = useState({})
  const [upcomingEvents, setUpcomingEvents] = useState([])
  const notificationsCooldownUntilRef = useRef(0)
  const notificationsInFlightRef = useRef(false)
  const notificationsQueuedRef = useRef(false)
  const notificationsRetryTimerRef = useRef(null)
  const notificationsThrottleTimerRef = useRef(null)
  const notificationsLastLoadedAtRef = useRef(0)
  const PRESENCE_REFRESH_TTL = 30000
  
  const [mobileTab, setMobileTab] = useState('home')
  const [showChannelDrawer, setShowChannelDrawer] = useState(false)
  const [showMobileServerSelector, setShowMobileServerSelector] = useState(false)
  const [mobileServerSearch, setMobileServerSearch] = useState('')
  const [mobileBack, setMobileBack] = useState(null)

  // Helper to ensure encryption keys are loaded before decryption
  const ensureEncryptionKeys = useCallback(async (srvId) => {
    if (!srvId) return false

    const inFlight = encryptionEnsureInFlightRef.current.get(srvId)
    if (inFlight) {
      return inFlight
    }

    const request = (async () => {
      const enabled = isEncryptionEnabled(srvId)
      const hasKey = hasDecryptedKey(srvId)

      let hasTrueKey = false
      if (e2eTrue) {
        try {
          const trueKey = await e2eTrue.getSharedServerKey(srvId)
          hasTrueKey = !!trueKey
        } catch (e) {
          console.warn('[ensureEncryptionKeys] Error getting True E2EE key:', e)
        }
      }

      if (enabled && (hasKey || hasTrueKey)) {
        return true
      }

      if (enabled && !hasKey && !hasTrueKey) {
        try {
          const joined = await joinServerEncryption(srvId)
          if (joined) return true
        } catch (e) {
          console.warn('[ensureEncryptionKeys] joinServerEncryption error:', e)
        }
      }

      return hasDecryptedKey(srvId)
    })().finally(() => {
      encryptionEnsureInFlightRef.current.delete(srvId)
    })

    encryptionEnsureInFlightRef.current.set(srvId, request)
    return request
  }, [isEncryptionEnabled, hasDecryptedKey, e2eTrue, joinServerEncryption])
  const [isVideoOn, setIsVideoOn] = useState(false)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [voiceExpanded, setVoiceExpanded] = useState(false)
  const [categories, setCategories] = useState([])
  const [serverEmojis, setServerEmojis] = useState([])
  const [encryptionError, setEncryptionError] = useState(null)
  const [isRetryingEncryption, setIsRetryingEncryption] = useState(false)

  const totalServerUnread = useMemo(
    () => Object.values(serverUnreadCounts || {}).reduce((sum, count) => sum + (Number(count) || 0), 0),
    [serverUnreadCounts]
  )
  const totalUnreadIndicators = useMemo(
    () => friendRequestCount + (Array.isArray(dmNotifications) ? dmNotifications.length : 0) + totalServerUnread,
    [friendRequestCount, dmNotifications, totalServerUnread]
  )
  const mobileRecentServers = useMemo(() => servers.slice(0, 6), [servers])
  const serverEventsMeta = useMemo(() => {
    const now = new Date()
    const todayKey = now.toISOString().slice(0, 10)
    const meta = {}

    ;(Array.isArray(upcomingEvents) ? upcomingEvents : []).forEach((event) => {
      if (!event?.serverId || !event?.startAt) return
      const start = new Date(event.startAt)
      if (Number.isNaN(start.getTime())) return
      const startKey = start.toISOString().slice(0, 10)
      const current = meta[event.serverId] || { count: 0, hasToday: false, nextStartAt: null }
      current.count += 1
      current.hasToday = current.hasToday || startKey === todayKey
      if (!current.nextStartAt || start < new Date(current.nextStartAt)) {
        current.nextStartAt = start.toISOString()
      }
      meta[event.serverId] = current
    })

    return meta
  }, [upcomingEvents])
  const safeChannels = useMemo(() => {
    if (Array.isArray(channels)) return channels
    if (channels && typeof channels === 'object') return Object.values(channels)
    return []
  }, [channels])

  const currentChannel = useMemo(() => {
    return channelId ? safeChannels.find(c => c.id === channelId) : null
  }, [channelId, safeChannels])

  const isAnnouncementChannel = currentChannel?.type === 'announcement'
  const isForumChannel = currentChannel?.type === 'forum'
  const isMediaChannel = currentChannel?.type === 'media'

  // Update document title when server or channel changes
  useEffect(() => {
    const currentChannelEffect = channelId ? safeChannels.find(c => c.id === channelId) : null
    
    let title = 'VoltChat'
    
    if (viewMode === 'dms' && selectedDM) {
      const dmName = selectedDM.recipient?.displayName || selectedDM.recipient?.username || selectedDM.groupName || 'Direct Messages'
      title = `VoltChat - ${dmName}`
    } else if (viewMode === 'friends') {
      title = 'VoltChat - Friends'
    } else if (viewMode === 'discovery') {
      title = 'VoltChat - Discovery'
    } else if (viewMode === 'home') {
      title = 'VoltChat - Home'
    } else if (currentServer?.name) {
      title = `VoltChat - ${currentServer.name}`
      if (currentChannelEffect?.name) {
        title = `VoltChat - ${currentServer.name} - #${currentChannelEffect.name}`
      }
    }
    
    document.title = totalUnreadIndicators > 0 ? `(${totalUnreadIndicators}) ${title}` : title
  }, [currentServer, channelId, safeChannels, viewMode, selectedDM, totalUnreadIndicators])

  useEffect(() => {
    const timers = pendingChannelSendTimersRef.current
    return () => {
      for (const timer of timers.values()) {
        clearTimeout(timer)
      }
      timers.clear()
    }
  }, [])

  const clearPendingChannelSendTimeout = useCallback((clientNonce) => {
    if (!clientNonce) return
    const timer = pendingChannelSendTimersRef.current.get(clientNonce)
    if (timer) {
      clearTimeout(timer)
      pendingChannelSendTimersRef.current.delete(clientNonce)
    }
  }, [])

  const isLikelySameOutgoingMessage = useCallback((local, remote) => {
    if (!local || !remote) return false
    if (local.userId !== remote.userId) return false
    if ((local.content || '') !== (remote.content || '')) return false
    const localAttachments = Array.isArray(local.attachments) ? local.attachments.length : 0
    const remoteAttachments = Array.isArray(remote.attachments) ? remote.attachments.length : 0
    if (localAttachments !== remoteAttachments) return false

    const localTime = new Date(local.timestamp || 0).getTime()
    const remoteTime = new Date(remote.timestamp || 0).getTime()
    if (!Number.isFinite(localTime) || !Number.isFinite(remoteTime)) return false

    return Math.abs(remoteTime - localTime) < 30000
  }, [])

  const markChannelMessageFailed = useCallback((channelIdForMessage, clientNonce, errorText = 'Failed to send') => {
    if (!channelIdForMessage || !clientNonce) return
    clearPendingChannelSendTimeout(clientNonce)
    setChannelMessages(prev => {
      const current = prev[channelIdForMessage] || []
      let changed = false
      const updated = current.map(msg => {
        if (msg?.clientNonce === clientNonce && msg?._sendStatus === 'sending') {
          changed = true
          return { ...msg, _sendStatus: 'failed', _sendError: errorText }
        }
        return msg
      })
      if (!changed) return prev
      return { ...prev, [channelIdForMessage]: updated }
    })
  }, [clearPendingChannelSendTimeout])

  const handleOptimisticChannelMessage = useCallback((message) => {
    if (!message?.channelId) return
    setChannelMessages(prev => ({
      ...prev,
      [message.channelId]: [...(prev[message.channelId] || []), message]
    }))

    if (message.clientNonce) {
      clearPendingChannelSendTimeout(message.clientNonce)
      const timer = setTimeout(() => {
        markChannelMessageFailed(message.channelId, message.clientNonce, 'Message failed to send (timeout)')
      }, 12000)
      pendingChannelSendTimersRef.current.set(message.clientNonce, timer)
    }
  }, [clearPendingChannelSendTimeout, markChannelMessageFailed])

  const handleChannelSendFailed = useCallback((clientNonce, errorText) => {
    if (!clientNonce || !channelId) return
    markChannelMessageFailed(channelId, clientNonce, errorText || 'Failed to send')
  }, [channelId, markChannelMessageFailed])

  const handleChannelMessageAck = useCallback((channelIdForMessage, clientNonce, messageId) => {
    if (!channelIdForMessage || !clientNonce) return
    clearPendingChannelSendTimeout(clientNonce)
    setChannelMessages(prev => {
      const current = prev[channelIdForMessage] || []
      let changed = false
      const next = current.map(msg => {
        if (msg?.clientNonce !== clientNonce) return msg
        changed = true
        return {
          ...msg,
          id: messageId || msg.id,
          _sendStatus: 'sent',
          _sendError: null
        }
      })
      return changed ? { ...prev, [channelIdForMessage]: next } : prev
    })
  }, [clearPendingChannelSendTimeout])

  const markChannelUnread = useCallback((serverIdForChannel, targetChannelId) => {
    if (!serverIdForChannel || !targetChannelId) return
    setUnreadChannelsByServer(prev => {
      const current = prev[serverIdForChannel] || []
      if (current.includes(targetChannelId)) return prev
      return {
        ...prev,
        [serverIdForChannel]: [...current, targetChannelId]
      }
    })
  }, [])

  const clearChannelUnread = useCallback((serverIdForChannel, targetChannelId) => {
    if (!serverIdForChannel || !targetChannelId) return
    setUnreadChannelsByServer(prev => {
      const current = prev[serverIdForChannel] || []
      if (!current.includes(targetChannelId)) return prev
      return {
        ...prev,
        [serverIdForChannel]: current.filter(id => id !== targetChannelId)
      }
    })
  }, [])

  const loadNotifications = useCallback(async () => {
    const now = Date.now()
    const timeSinceLastLoad = now - notificationsLastLoadedAtRef.current
    if (timeSinceLastLoad < 2500) {
      notificationsQueuedRef.current = true
      if (!notificationsThrottleTimerRef.current) {
        notificationsThrottleTimerRef.current = setTimeout(() => {
          notificationsThrottleTimerRef.current = null
          if (notificationsQueuedRef.current) {
            notificationsQueuedRef.current = false
            loadNotifications()
          }
        }, 2500 - timeSinceLastLoad)
      }
      return
    }
    if (notificationsInFlightRef.current) {
      notificationsQueuedRef.current = true
      return
    }
    if (notificationsCooldownUntilRef.current > now) {
      notificationsQueuedRef.current = true
      if (!notificationsRetryTimerRef.current) {
        const delay = Math.max(100, notificationsCooldownUntilRef.current - now)
        notificationsRetryTimerRef.current = setTimeout(() => {
          notificationsRetryTimerRef.current = null
          if (notificationsQueuedRef.current) {
            notificationsQueuedRef.current = false
            loadNotifications()
          }
        }, delay)
      }
      return
    }

    notificationsInFlightRef.current = true
    try {
      const [friendRes, dmRes, unreadRes] = await Promise.all([
        apiService.getFriendRequests(),
        apiService.getDirectMessages(),
        apiService.getUnreadCounts().catch(() => ({ data: {} }))
      ])
      notificationsLastLoadedAtRef.current = Date.now()
      const incomingRequests = friendRes.data?.incoming || []
      setFriendRequestCount(incomingRequests.length)
      
      const dms = dmRes.data || []
      const unreadDMs = dms.filter(dm => dm.unreadCount > 0)
      setDmNotifications(unreadDMs)
      
      if (unreadRes.data) {
        const serverMutes = settingsService.getSettings()?.serverMutes || {}
        const counts = {}
        for (const [serverId, data] of Object.entries(unreadRes.data)) {
          if (!serverMutes[serverId]) {
            counts[serverId] = data.unread || 0
          }
        }
        setServerUnreadCounts(counts)
      }
    } catch (err) {
      if (err?.response?.status === 429) {
        const retryAfterSeconds = Number(err?.response?.headers?.['retry-after'])
        const cooldownMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? retryAfterSeconds * 1000 : 12000
        notificationsCooldownUntilRef.current = Date.now() + cooldownMs
        notificationsQueuedRef.current = true
        if (!notificationsRetryTimerRef.current) {
          notificationsRetryTimerRef.current = setTimeout(() => {
            notificationsRetryTimerRef.current = null
            if (notificationsQueuedRef.current) {
              notificationsQueuedRef.current = false
              loadNotifications()
            }
          }, cooldownMs)
        }
      }
      console.error('Failed to load notifications:', err)
    } finally {
      notificationsInFlightRef.current = false
      if (notificationsQueuedRef.current && notificationsCooldownUntilRef.current <= Date.now()) {
        notificationsQueuedRef.current = false
        loadNotifications()
      }
    }
  }, [])

  const buildPresenceMap = useCallback((onlineRows = []) => {
    const map = {}
    for (const row of (onlineRows || [])) {
      if (!row?.userId) continue
      map[row.userId] = {
        status: row.status || 'online',
        customStatus: row.customStatus ?? null
      }
    }
    return map
  }, [])

  const refreshPresenceForServer = useCallback(async (sid, { force = false } = {}) => {
    if (!sid) return null

    const lastLoadedAt = lastPresenceRefreshRef.current.get(sid) || 0
    if (!force && Date.now() - lastLoadedAt < PRESENCE_REFRESH_TTL) {
      return presenceByServer[sid] || null
    }

    try {
      const res = await apiService.getOnlineMembers(sid)
      const freshPresence = buildPresenceMap(res.data || [])
      lastPresenceRefreshRef.current.set(sid, Date.now())
      setPresenceByServer(prev => ({
        ...prev,
        [sid]: freshPresence
      }))
      return freshPresence
    } catch {
      return presenceByServer[sid] || null
    }
  }, [buildPresenceMap, presenceByServer, PRESENCE_REFRESH_TTL])

  const applyPresenceToMembers = useCallback((memberList = [], serverPresence = {}) => {
    return (memberList || []).map(member => {
      const live = serverPresence?.[member.id]
      if (!live) return { ...member, status: 'offline' }
      return {
        ...member,
        status: live.status || 'online',
        customStatus: live.customStatus ?? member.customStatus ?? null
      }
    })
  }, [])

  useEffect(() => {
    if (isAuthenticated) {
      loadNotifications()
    }
  }, [isAuthenticated, loadNotifications])

  useEffect(() => () => {
    if (notificationsThrottleTimerRef.current) {
      clearTimeout(notificationsThrottleTimerRef.current)
      notificationsThrottleTimerRef.current = null
    }
    if (notificationsRetryTimerRef.current) {
      clearTimeout(notificationsRetryTimerRef.current)
      notificationsRetryTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!socket || !connected) return
    
    const handleNewFriendRequest = () => {
      loadNotifications()
    }
    
    const handleDMNotification = () => {
      loadNotifications()
    }

    const handleDMMessage = () => {
      loadNotifications()
    }

    const handleConversationState = () => {
      loadNotifications()
    }
    
    socket.on('friend:request', handleNewFriendRequest)
    socket.on('dm:notification', handleDMNotification)
    socket.on('dm:new', handleDMMessage)
    socket.on('dm:edited', handleConversationState)
    socket.on('dm:deleted', handleDMMessage)
    socket.on('dm:created', handleConversationState)
    socket.on('friend:accepted', handleConversationState)
    socket.on('friend:removed', handleConversationState)
    
    return () => {
      socket.off('friend:request', handleNewFriendRequest)
      socket.off('dm:notification', handleDMNotification)
      socket.off('dm:new', handleDMMessage)
      socket.off('dm:edited', handleConversationState)
      socket.off('dm:deleted', handleDMMessage)
      socket.off('dm:created', handleConversationState)
      socket.off('friend:accepted', handleConversationState)
      socket.off('friend:removed', handleConversationState)
    }
  }, [socket, connected, loadNotifications])

  useEffect(() => {
    const sid = currentServer?.id
    if (!sid) return

    let cancelled = false
    const refreshCurrentPresence = async () => {
      const freshPresence = await refreshPresenceForServer(sid)
      if (cancelled || !freshPresence) return
    }

    refreshCurrentPresence()
    const handleVisible = () => {
      if (document.visibilityState === 'visible') {
        refreshCurrentPresence()
      }
    }
    document.addEventListener('visibilitychange', handleVisible)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', handleVisible)
    }
  }, [currentServer?.id, refreshPresenceForServer])

  useEffect(() => {
    if (serverId === 'friends') {
      setViewMode('friends')
    } else if (serverId === 'dms') {
      setViewMode('dms')
    } else if (serverId === 'discovery') {
      setViewMode('discovery')
    } else if (serverId === 'home' || serverId === undefined || serverId === null || serverId === 'null') {
      setViewMode('home')
    } else {
      setViewMode('server')
    }
  }, [serverId])

  const ageVerified = useMemo(() => {
    const verification = user?.ageVerification
    if (!verification?.verified) return false
    if (verification?.category !== 'adult') return false
    // 18+ verifications never expire; only non-adult ones can expire
    if (verification.expiresAt && new Date(verification.expiresAt) < new Date()) return false
    return true
  }, [user])

  // Get messages for current channel
  const messages = channelMessages[channelId] || []
  const activeChannelDiagnostic = channelDiagnostics[channelId] || null
  const currentScrollPosition = channelScrollPositions[channelId] || 0

  const loadUpcomingEvents = useCallback(async () => {
    try {
      const res = await apiService.getUpcomingEvents(24)
      setUpcomingEvents(Array.isArray(res.data) ? res.data : [])
    } catch (err) {
      console.error('Failed to load upcoming events:', err)
      setUpcomingEvents([])
    }
  }, [])

  useEffect(() => {
    console.log('[ChatPage] Initial load')
    loadServers()
    loadUpcomingEvents()
    checkAdminStatus()
  }, [])

  useEffect(() => {
    useAppStore.getState().setServers(servers)
  }, [servers])

  useEffect(() => {
    if (!socket) return undefined

    const refreshUpcomingEvents = () => loadUpcomingEvents()
    socket.on('server:event-created', refreshUpcomingEvents)
    socket.on('server:event-updated', refreshUpcomingEvents)
    socket.on('server:event-deleted', refreshUpcomingEvents)
    return () => {
      socket.off('server:event-created', refreshUpcomingEvents)
      socket.off('server:event-updated', refreshUpcomingEvents)
      socket.off('server:event-deleted', refreshUpcomingEvents)
    }
  }, [socket, loadUpcomingEvents])

  const checkAdminStatus = async () => {
    try {
      const res = await apiService.getMyAdminRole()
      setIsAdmin(res.data.isAdmin)
      setIsModerator(res.data.isModerator)
    } catch (err) {
      console.error('Failed to check admin status:', err)
    }
  }

  useEffect(() => {
    console.log('[ChatPage] ServerId changed to:', serverId)
    const safeServerId = serverId
    
    if (safeServerId === 'friends') {
      setViewMode('friends')
    } else if (safeServerId === 'dms') {
      setViewMode('dms')
    } else if (safeServerId === 'discovery') {
      setViewMode('discovery')
    } else if (safeServerId && safeServerId !== 'null' && safeServerId !== 'undefined') {
      setViewMode('server')
      if (lastLoadedServerIdRef.current !== safeServerId) {
        lastLoadedServerIdRef.current = safeServerId
        loadServerData(safeServerId)
      }
    } else {
      lastLoadedServerIdRef.current = null
      if (servers.length > 0) {
        setViewMode('server')
      } else {
        setViewMode('home')
      }
    }
  }, [serverId, servers.length])

  useEffect(() => {
    if (viewMode === 'dms' || viewMode === 'friends' || viewMode === 'discovery' || viewMode === 'system') {
      if (activeVoiceChannel && !voiceFloating) {
        setVoiceFloating(true)
      }
    } else if (viewMode === 'server') {
      if (activeVoiceChannel && voiceFloating) {
        setVoiceFloating(false)
        // Don't change voiceViewMode here - let the render logic determine it
        // based on selectedVoiceChannelId (mini for text channel, full for voice channel)
        setContentCollapsed(false)
      }
    }
  }, [viewMode, activeVoiceChannel])

  const retryDecryptChannelMessages = useCallback(async (cId) => {
    const messages = channelMessagesRef.current[cId]
    if (!messages || messages.length === 0) return
    
    const currentServerId = serverId
    if (!currentServerId || !serverEncryptionStatus[currentServerId]?.enabled) return
    
    // Ensure encryption keys are available
    await ensureEncryptionKeys(currentServerId)
    
    const decryptMessage = async (message) => {
      if (message._decrypted) return message
      
      let processedMessage = { ...message }
      
      // Try True E2EE decryption first (has epoch field)
      if ((message.encrypted || message.iv) && message.epoch && e2eTrue) {
        try {
          const decrypted = await e2eTrue.decryptMessage(message, currentServerId)
          if (decrypted && !decrypted.includes('Encrypted') && !decrypted.includes('awaiting')) {
            processedMessage.content = decrypted
            processedMessage._decrypted = true
            console.log('[ChatPage] Successfully decrypted True E2EE message')
          } else {
            console.warn('[ChatPage] True E2EE decryption returned placeholder text:', decrypted)
          }
        } catch (err) {
          console.error('[ChatPage] True E2EE decryption error:', err)
        }
      }
      
      // Try legacy E2EE decryption if True E2EE didn't work
      if (!processedMessage._decrypted && hasDecryptedKey(currentServerId)) {
        try {
          let encryptedData
          try {
            encryptedData = JSON.parse(message.content)
          } catch {
            encryptedData = null
          }
          
          if (encryptedData && encryptedData._encrypted) {
            const decryptedContent = await decryptMessageFromServer({
              iv: encryptedData.iv,
              content: encryptedData.content
            }, currentServerId)
            processedMessage.content = decryptedContent
            processedMessage._decrypted = true
            console.log('[ChatPage] Successfully decrypted legacy E2EE message')
          } else if (message.iv && message.content) {
            const decryptedContent = await decryptMessageFromServer({
              iv: message.iv,
              content: message.content
            }, currentServerId)
            processedMessage.content = decryptedContent
            processedMessage._decrypted = true
            console.log('[ChatPage] Successfully decrypted legacy E2EE message (raw format)')
          }
        } catch (err) {
          console.error('[ChatPage] Legacy E2EE decryption error:', err)
        }
      }
      
      // If still not decrypted, log for debugging
      if (!processedMessage._decrypted && (message.encrypted || message.iv)) {
        console.warn('[ChatPage] Message still encrypted after all attempts:', {
          messageId: message.id,
          hasEpoch: !!message.epoch,
          hasIv: !!message.iv,
          contentLength: message.content?.length || 0
        })
      }
      
      return processedMessage
    }
    
    const decryptedMessages = await Promise.all(messages.map(msg => decryptMessage(msg)))
    
    setChannelMessages(prev => {
      const currentMessages = prev[cId]
      if (!currentMessages) return prev
      
      const hasChanges = decryptedMessages.some((msg, idx) => msg._decrypted !== currentMessages[idx]?._decrypted)
      if (!hasChanges) return prev
      
      const decryptedCount = decryptedMessages.filter(m => m._decrypted).length
      console.log('[ChatPage] Retrying decryption for', decryptedCount, 'messages')
      
      return {
        ...prev,
        [cId]: decryptedMessages
      }
    })
  }, [serverId, serverEncryptionStatus, ensureEncryptionKeys, e2eTrue, hasDecryptedKey, decryptMessageFromServer, setChannelMessages])

  useEffect(() => {
    retryDecryptRef.current = retryDecryptChannelMessages
  }, [retryDecryptChannelMessages])

  useEffect(() => {
    if (!channelId || channelId === 'null') return
    if (!e2eTrue?.keySyncTick) return
    retryDecryptRef.current?.(channelId)
  }, [channelId, e2eTrue?.keySyncTick])

  useEffect(() => {
    if (prevChannelIdRef.current === channelId) return
    prevChannelIdRef.current = channelId
    
    console.log('[ChatPage] ChannelId changed to:', channelId)
    
    if (channelId && channelId !== 'null') {
      const target = channels.find(c => c.id === channelId)
      if (target?.nsfw && !ageVerified && user !== null) {
        if (user?.ageVerification?.category === 'child') {
          setAgeGateNotice(t('chatPage.ageBlockedNotice', 'This channel is 18+. Your account is marked under 18, so access is blocked.'))
          setPendingAgeChannel(target)
          return
        }
        setAgeGateNotice('')
        setPendingAgeChannel(target)
        return
      }
      if (blockedAgeChannels.has(channelId)) {
        setAgeGateNotice(t('chatPage.ageRestrictedNotice', 'This channel is age-restricted. Please complete age verification to view messages.'))
        setPendingAgeChannel(target)
        return
      }
      setPendingAgeChannel(null)
      setAgeGateNotice('')
      soundService.channelSwitch()
      
      if (channelMessages[channelId] && channelMessages[channelId].length > 0) {
        console.log('[ChatPage] Restoring cached messages for channel:', channelId)
        retryDecryptRef.current?.(channelId)
      } else {
        console.log('[ChatPage] Calling loadMessages for channel:', channelId, 'ref:', !!loadMessagesRef.current)
        loadMessagesRef.current?.(channelId)
      }
    } else {
      setAgeGateNotice('')
      setPendingAgeChannel(null)
    }
  }, [channelId, channels, ageVerified, blockedAgeChannels, user, t])

  useEffect(() => {
    if (!serverId || !channelId || serverId === 'null' || channelId === 'null') return
    clearChannelUnread(serverId, channelId)
  }, [serverId, channelId, clearChannelUnread])

  // Save current channel state before switching
  const saveCurrentChannelState = useCallback((scrollTop) => {
    if (channelId) {
      setChannelMessages(prev => ({
        ...prev,
        [channelId]: messages
      }))
      setChannelScrollPositions(prev => ({
        ...prev,
        [channelId]: scrollTop
      }))
    }
  }, [channelId, messages])

  useEffect(() => {
    if (!socket || !connected) return

    const handleNewMessage = async (message) => {
      console.log('[Socket] New message received:', message)
      
      // Ensure encryption keys are available before decryption
      if (serverId && (message.encrypted || message.iv || message.epoch)) {
        await ensureEncryptionKeys(serverId)
      }
      
      let processedMessage = { ...message }
      if (processedMessage.userId === user?.id && user?.avatar && !processedMessage.avatar) {
        processedMessage.avatar = user.avatar
      }
      
      // Try True E2EE decryption first (has epoch field)
      if ((message.encrypted || message.iv) && message.epoch && serverId && e2eTrue) {
        try {
          const decrypted = await e2eTrue.decryptMessage(message, serverId)
          if (decrypted && !decrypted.includes('Encrypted') && !decrypted.includes('awaiting')) {
            processedMessage.content = decrypted
            processedMessage._decrypted = true
          } else {
            processedMessage.content = message.content
          }
        } catch (err) {
          console.error('[ChatPage] True E2EE decryption error:', err)
          processedMessage.content = message.content
        }
      } else if ((message.encrypted || message.iv) && serverId) {
        // Try legacy E2EE decryption - attempt even if conditions aren't met
        try {
          let encryptedData
          try {
            encryptedData = JSON.parse(message.content)
          } catch {
            // Content is not JSON, might be already decrypted or different format
            encryptedData = null
          }
          
          if (encryptedData && encryptedData._encrypted) {
            const decryptedContent = await decryptMessageFromServer({
              iv: encryptedData.iv,
              content: encryptedData.content
            }, serverId)
            processedMessage.content = decryptedContent
            processedMessage._decrypted = true
          } else if (encryptedData === null) {
            // Try to decrypt as raw encrypted content
            try {
              const decryptedContent = await decryptMessageFromServer({
                iv: message.iv,
                content: message.content
              }, serverId)
              processedMessage.content = decryptedContent
              processedMessage._decrypted = true
            } catch (err) {
              console.warn('[ChatPage] Could not decrypt message - no key or invalid format')
              processedMessage.content = message.content
            }
          } else {
            processedMessage.content = message.content
          }
        } catch (err) {
          console.error('[ChatPage] Legacy decryption error:', err)
          processedMessage.content = '[Encrypted message - could not decrypt]'
        }
      }

      // Receiver-side local safety recheck for channel messages.
      try {
        const selfAgeRaw = Number(user?.ageVerification?.age ?? user?.ageVerification?.estimatedAge)
        const selfAge = Number.isFinite(selfAgeRaw) ? selfAgeRaw : null
        const recipientContext = {
          isMinor: !!(user?.ageVerification?.verified && (user?.ageVerification?.category === 'child' || (selfAge !== null && selfAge < 18))),
          isUnder16: !!(user?.ageVerification?.verified && (selfAge !== null ? selfAge < 16 : user?.ageVerification?.category === 'child'))
        }
        const { flags, safety } = await runSafetyScan({
          text: processedMessage.content || '',
          attachments: processedMessage.attachments || [],
          recipient: recipientContext,
          allowBlockingModels: false
        })
        if (safety.shouldBlock) {
          if (safety.shouldReport) {
            const reportPayload = {
              contextType: 'channel',
              reportType: 'threat',
              accusedUserId: processedMessage.userId || null,
              targetUserId: user?.id || null,
              channelId: processedMessage.channelId || channelId,
              contentFlags: flags,
              targetAgeContext: recipientContext
            }
            const signature = await buildClientSignature(reportPayload)
            await apiService.submitSafetyReport({
              ...reportPayload,
              clientSignature: signature
            }).catch(() => {})
          }
          return
        }
      } catch (err) {
        console.error('[ChatPage] Receiver-side safety check failed:', err)
      }
      
      if (processedMessage.channelId) {
        const targetChannelId = processedMessage.channelId
        setChannelMessages(prev => {
          const current = prev[targetChannelId] || []
          const messageNonce = processedMessage.clientNonce || null
          if (messageNonce) {
            const pendingIdx = current.findIndex(m =>
              m?.clientNonce === messageNonce && (m?._sendStatus === 'sending' || m?._sendStatus === 'failed')
            )
            if (pendingIdx >= 0) {
              const next = [...current]
              next[pendingIdx] = {
                ...next[pendingIdx],
                ...processedMessage,
                avatar: processedMessage.avatar || next[pendingIdx]?.avatar || null,
                replyTo: processedMessage.replyTo || next[pendingIdx]?.replyTo || null,
                _sendStatus: 'sent',
                _sendError: null
              }
              return { ...prev, [targetChannelId]: next }
            }
          }
          const fallbackPendingIdx = current.findIndex(m =>
            (m?._sendStatus === 'sending' || m?._sendStatus === 'failed') &&
            isLikelySameOutgoingMessage(m, processedMessage)
          )
          if (fallbackPendingIdx >= 0) {
            const next = [...current]
            const fallbackNonce = next[fallbackPendingIdx]?.clientNonce || null
            next[fallbackPendingIdx] = {
              ...next[fallbackPendingIdx],
              ...processedMessage,
              avatar: processedMessage.avatar || next[fallbackPendingIdx]?.avatar || null,
              replyTo: processedMessage.replyTo || next[fallbackPendingIdx]?.replyTo || null,
              clientNonce: processedMessage.clientNonce || fallbackNonce,
              _sendStatus: 'sent',
              _sendError: null
            }
            if (fallbackNonce) clearPendingChannelSendTimeout(fallbackNonce)
            return { ...prev, [targetChannelId]: next }
          }
          if (current.some(m => m.id === processedMessage.id)) return prev
          return {
            ...prev,
            [targetChannelId]: [...current, { ...processedMessage, _sendStatus: 'sent' }]
          }
        })
        clearPendingChannelSendTimeout(processedMessage.clientNonce)
        // Play sound for messages from others
        if (processedMessage.channelId === channelId && processedMessage.userId !== user?.id) {
          soundService.messageReceived()
        }
        if (processedMessage.userId !== user?.id && processedMessage.channelId !== channelId) {
          markChannelUnread(serverId, processedMessage.channelId)
        }
      }
    }

    const handleMessageEdited = async (message) => {
      console.log('[Socket] Message edited:', message)
      if (message.channelId === channelId) {
        let processedMessage = { ...message }

        if ((message.encrypted || message.iv) && serverId) {
          try {
            const encryptedData = JSON.parse(message.content)
            if (encryptedData._encrypted) {
              const decryptedContent = await decryptMessageFromServer({
                iv: encryptedData.iv,
                content: encryptedData.content
              }, serverId)
              processedMessage.content = decryptedContent
              processedMessage._decrypted = true
            }
          } catch (err) {
            console.error('[ChatPage] Decryption error for edited message:', err)
            processedMessage.content = message.content
          }
        }

        setChannelMessages(prev => ({
          ...prev,
          [channelId]: (prev[channelId] || []).map(m => m.id === message.id ? processedMessage : m)
        }))
      }
    }

    const handleMessageDeleted = ({ messageId, channelId: cId, message }) => {
      console.log('[Socket] Message deleted:', messageId)
      if (cId === channelId) {
        setChannelMessages(prev => ({
          ...prev,
          [channelId]: (prev[channelId] || []).map(m =>
            m.id === messageId
              ? {
                  ...m,
                  ...message,
                  deleted: true,
                  content: '',
                  attachments: [],
                  embeds: []
                }
              : m
          )
        }))
      }
    }

    // Handle bulk message deletion
    const handleBulkMessagesDeleted = ({ channelId: cId, messageIds, deletedBy }) => {
      console.log('[Socket] Bulk messages deleted:', messageIds)
      if (cId === channelId) {
        setChannelMessages(prev => ({
          ...prev,
          [channelId]: (prev[channelId] || []).map(m =>
            messageIds.includes(m.id)
              ? {
                  ...m,
                  deleted: true,
                  content: '',
                  attachments: [],
                  embeds: [],
                  deletedAt: new Date().toISOString(),
                  deletedBy
                }
              : m
          )
        }))
      }
    }

    const handleReactionUpdated = ({ messageId, reactions }) => {
      setChannelMessages(prev => ({
        ...prev,
        [channelId]: (prev[channelId] || []).map(m => 
          m.id === messageId ? { ...m, reactions } : m
        )
      }))
    }

    const handleCanvasPixelUpdate = ({ messageId, channelId: cId, pixels }) => {
      console.log('[Socket] Canvas pixel update:', messageId, pixels)
      if (cId === channelId) {
        setChannelMessages(prev => ({
          ...prev,
          [channelId]: (prev[channelId] || []).map(m => {
            if (m.id !== messageId) return m
            const ui = m.ui || {}
            const canvas = ui.canvas || {}
            return {
              ...m,
              ui: {
                ...ui,
                canvas: {
                  ...canvas,
                  pixels: pixels || [],
                  update: true
                }
              }
            }
          })
        }))
      }
    }

    const handleCanvasUpdate = ({ messageId, channelId: cId, canvas }) => {
      console.log('[Socket] Canvas update:', messageId, canvas)
      if (cId === channelId) {
        setChannelMessages(prev => ({
          ...prev,
          [channelId]: (prev[channelId] || []).map(m => {
            if (m.id !== messageId) return m
            const ui = m.ui || {}
            return {
              ...m,
              ui: {
                ...ui,
                canvas: {
                  ...(ui.canvas || {}),
                  ...canvas,
                  update: true
                }
              }
            }
          })
        }))
      }
    }

    const handleCanvasClear = ({ messageId, channelId: cId, canvas }) => {
      console.log('[Socket] Canvas clear:', messageId)
      if (cId === channelId) {
        setChannelMessages(prev => ({
          ...prev,
          [channelId]: (prev[channelId] || []).map(m => {
            if (m.id !== messageId) return m
            const ui = m.ui || {}
            return {
              ...m,
              ui: {
                ...ui,
                canvas: {
                  ...(ui.canvas || {}),
                  ...canvas,
                  pixels: [],
                  update: true
                }
              }
            }
          })
        }))
      }
    }

    const handleCanvasBulkPixelUpdate = ({ messageId, channelId: cId, bulkPixels }) => {
      console.log('[Socket] Canvas bulk pixel update:', messageId, bulkPixels)
      if (cId === channelId) {
        setChannelMessages(prev => ({
          ...prev,
          [channelId]: (prev[channelId] || []).map(m => {
            if (m.id !== messageId) return m
            const ui = m.ui || {}
            return {
              ...m,
              ui: {
                ...ui,
                canvas: {
                  ...(ui.canvas || {}),
                  bulkPixels: bulkPixels,
                  update: true
                }
              }
            }
          })
        }))
      }
    }

    socket.on('message:new', handleNewMessage)
    socket.on('message:edited', handleMessageEdited)
    socket.on('message:deleted', handleMessageDeleted)
    socket.on('messages:bulk-deleted', handleBulkMessagesDeleted)
    socket.on('reaction:updated', handleReactionUpdated)
    socket.on('ui:canvasPixelUpdate', handleCanvasPixelUpdate)
    socket.on('ui:canvasUpdate', handleCanvasUpdate)
    socket.on('ui:canvasClear', handleCanvasClear)
    socket.on('ui:canvasBulkPixelUpdate', handleCanvasBulkPixelUpdate)

    return () => {
      socket.off('message:new', handleNewMessage)
      socket.off('message:edited', handleMessageEdited)
      socket.off('message:deleted', handleMessageDeleted)
      socket.off('messages:bulk-deleted', handleBulkMessagesDeleted)
      socket.off('reaction:updated', handleReactionUpdated)
      socket.off('ui:canvasPixelUpdate', handleCanvasPixelUpdate)
      socket.off('ui:canvasUpdate', handleCanvasUpdate)
      socket.off('ui:canvasClear', handleCanvasClear)
      socket.off('ui:canvasBulkPixelUpdate', handleCanvasBulkPixelUpdate)
    }
  }, [socket, connected, channelId, serverId, isEncryptionEnabled, hasDecryptedKey, decryptMessageFromServer, e2eTrue, user, clearPendingChannelSendTimeout, isLikelySameOutgoingMessage, markChannelUnread])

  useEffect(() => {
    if (socket && connected && serverId && serverId !== 'null') {
      socket.emit('server:join', serverId)
    }
  }, [socket, connected, serverId])

  // Keep the members list in sync with realtime presence events so that
  // the MemberSidebar's ONLINE / OFFLINE sections update without a page
  // reload.  We patch status + customStatus directly on the member objects
  // so the sidebar's initial-seed logic also gets fresh data.
  useEffect(() => {
    if (!socket || !connected) return

    const handleUserStatus = ({ userId, status, customStatus }) => {
      setPresenceByServer(prev => {
        const sid = currentServer?.id
        if (!sid) return prev
        const serverPresence = prev[sid] || {}
        return {
          ...prev,
          [sid]: {
            ...serverPresence,
            [userId]: {
              status: status || 'online',
              customStatus: customStatus ?? serverPresence[userId]?.customStatus ?? null
            }
          }
        }
      })
      setMembers(prev => prev.map(m =>
        m.id === userId
          ? {
              ...m,
              status,
              ...(customStatus !== undefined ? { customStatus } : {})
            }
          : m
      ))
    }

    const handleMemberOffline = ({ userId }) => {
      if (!userId) return
      setPresenceByServer(prev => {
        const sid = currentServer?.id
        if (!sid) return prev
        const serverPresence = prev[sid] || {}
        return {
          ...prev,
          [sid]: {
            ...serverPresence,
            [userId]: {
              ...(serverPresence[userId] || {}),
              status: 'offline'
            }
          }
        }
      })
      setMembers(prev => prev.map(m =>
        m.id === userId ? { ...m, status: 'offline' } : m
      ))
    }

    const handleMemberOnline = ({ userId, status, customStatus }) => {
      if (!userId) return
      setPresenceByServer(prev => {
        const sid = currentServer?.id
        if (!sid) return prev
        const serverPresence = prev[sid] || {}
        return {
          ...prev,
          [sid]: {
            ...serverPresence,
            [userId]: {
              status: status || 'online',
              customStatus: customStatus ?? serverPresence[userId]?.customStatus ?? null
            }
          }
        }
      })
      setMembers(prev => prev.map(m =>
        m.id === userId ? { ...m, status: status || 'online', ...(customStatus !== undefined ? { customStatus } : {}) } : m
      ))
    }

    socket.on('user:status',   handleUserStatus)
    socket.on('member:offline', handleMemberOffline)
    socket.on('member:online', handleMemberOnline)

    return () => {
      socket.off('user:status',   handleUserStatus)
      socket.off('member:offline', handleMemberOffline)
      socket.off('member:online', handleMemberOnline)
    }
  }, [socket, connected, currentServer?.id])

  // Load global emojis on mount and listen for emoji updates
  useEffect(() => {
    if (!socket || !connected) return

    const loadGlobalEmojis = async () => {
      try {
        const res = await apiService.getGlobalEmojis()
        setGlobalEmojis(res.data || [])
        console.log('[Emoji] Loaded global emojis:', res.data?.length || 0)
      } catch (err) {
        console.error('[Emoji] Failed to load global emojis:', err)
      }
    }
    loadGlobalEmojis()

    const handleEmojiCreated = (emoji) => {
      console.log('[Emoji] Global emoji created:', emoji.name)
      addGlobalEmoji(emoji)
    }

    const handleEmojiDeleted = ({ emojiId, serverId }) => {
      console.log('[Emoji] Global emoji deleted:', emojiId)
      removeGlobalEmoji(emojiId, serverId)
    }

    socket.on('emoji:created', handleEmojiCreated)
    socket.on('emoji:deleted', handleEmojiDeleted)

    return () => {
      socket.off('emoji:created', handleEmojiCreated)
      socket.off('emoji:deleted', handleEmojiDeleted)
    }
  }, [socket, connected, setGlobalEmojis, addGlobalEmoji, removeGlobalEmoji])

  const loadServers = async () => {
    try {
      console.log('[API] Loading servers...')
      const response = await apiService.getServers()
      console.log('[API] Servers loaded:', response.data)
      
      setServers(response.data)
      response.data.forEach(server => primeServerUpdate(server))
      // Also sync with global store so other components see the update
      const { setServers: setGlobalServers } = useAppStore.getState()
      setGlobalServers(response.data)
      setLoading(false)
      
      if (response.data.length > 0 && (!serverId || serverId === 'null')) {
        const firstServer = response.data[0]
        console.log('[Navigation] Auto-selecting first server:', firstServer.id)
        navigate(`/chat/${firstServer.id}`, { replace: true })
      } else if (response.data.length === 0) {
        console.log('[Info] No servers found')
      }
    } catch (error) {
      console.error('[API] Failed to load servers:', error)
      setLoading(false)
    }
  }

  const handleLeaveServer = (serverId) => {
    setServers(prev => prev.filter(s => s.id !== serverId))
    if (currentServer?.id === serverId) {
      navigate('/chat', { replace: true })
    }
  }

  const handleDMClick = (conversationId, recipient) => {
    console.log('[DM] Opening DM conversation:', conversationId, recipient)
    // Set the selected DM and navigate to DMs
    const conv = { id: conversationId, recipient }
    setSelectedDM(conv)
    setViewMode('dms')
    navigate('/chat/dms')
  }

  const loadServerData = async (id) => {
    if (!id) return

    const inFlight = serverLoadInFlightRef.current.get(id)
    if (inFlight) {
      return inFlight
    }

    const request = (async () => {
      try {
        console.log('[API] Loading full server data for:', id)

        const [serverRes, channelsRes, categoriesRes] = await Promise.all([
          apiService.getServer(id),
          apiService.getChannels(id),
          apiService.getCategories(id).catch(() => ({ data: [] }))
        ])

        console.log('[API] Server:', serverRes.data.name)
        console.log('[API] Channels:', channelsRes.data.length)
        console.log('[API] Categories:', (categoriesRes.data || []).length)

        setCurrentServer(serverRes.data)
        setChannels(channelsRes.data)
        setCategories(categoriesRes.data || [])

        const resolvedServerId = serverRes.data.id
        const effectivePresence = presenceByServer[resolvedServerId] || {}
        const membersWithStatus = applyPresenceToMembers(serverRes.data.members || [], effectivePresence)
        setMembers(membersWithStatus)
        primeServerUpdate({
          ...serverRes.data,
          channels: channelsRes.data,
          categories: categoriesRes.data || [],
          members: membersWithStatus
        })

        const defaultChannel = serverRes.data.defaultChannelId
          ? channelsRes.data.find(c => c.id === serverRes.data.defaultChannelId)
          : null
        const firstChannel = channelsRes.data[0]
        const targetChannel = defaultChannel || firstChannel

        if (targetChannel && (!channelId || channelId === 'null')) {
          console.log('[Navigation] Auto-selecting channel:', targetChannel.name, '(default:', !!defaultChannel, ')')
          navigate(`/chat/${id}/${targetChannel.id}`, { replace: true })
        }
      } catch (error) {
        console.error('[API] Failed to load server data:', error)
      } finally {
        serverLoadInFlightRef.current.delete(id)
      }
    })()

    serverLoadInFlightRef.current.set(id, request)
    return request
  }

  useEffect(() => {
    const sid = currentServer?.id
    if (!sid || !members?.length) return
    const serverPresence = presenceByServer[sid]
    if (!serverPresence) return
    setMembers(prev => applyPresenceToMembers(prev, serverPresence))
  }, [currentServer?.id, presenceByServer, applyPresenceToMembers])

  const loadMessages = async (cId) => {
    console.log('[ChatPage] loadMessages called with channelId:', cId)
    if (!cId || cId === 'null') return
    
    const loadingChannelId = cId
    
    const target = channels.find(c => c.id === cId)
    if (target?.nsfw && !ageVerified) {
      console.log('[API] Skipping message load - age verification required for NSFW channel')
      return
    }
    
    if (blockedAgeChannels.has(cId)) {
      console.log('[API] Skipping message load - channel is blocked')
      return
    }
    
    setChannelLoading(true)
    setChannelDiagnostics(prev => ({
      ...prev,
      [cId]: null
    }))
    
    // First, ensure encryption keys are loaded before fetching messages
    // This ensures keys are ready when we try to decrypt
    const currentServerId = serverId
    if (currentServerId && serverEncryptionStatus[currentServerId]?.enabled) {
      console.log('[ChatPage] Pre-loading encryption keys for server:', currentServerId)
      await ensureEncryptionKeys(currentServerId)
      console.log('[ChatPage] Encryption keys pre-loaded, proceeding with message fetch')
    }
    
    try {
      console.log('[API] Loading messages for channel:', cId)
      const response = await apiService.getMessages(cId)
      console.log('[API] Loaded', response.data.length, 'messages')
      const emptyDiagnostic = buildEmptyChannelDiagnostic(response, cId)
      
      // Decrypt messages if needed - keys should now be available
      const decryptMessage = async (message) => {
        let processedMessage = { ...message }

        // Try True E2EE decryption first (has epoch field)
        if ((message.encrypted || message.iv) && message.epoch && serverId && e2eTrue) {
          try {
            const decrypted = await e2eTrue.decryptMessage(message, serverId)
            if (decrypted && !decrypted.includes('Encrypted') && !decrypted.includes('awaiting')) {
              processedMessage.content = decrypted
              processedMessage._decrypted = true
              console.log('[ChatPage] Successfully decrypted True E2EE message')
            } else {
              console.warn('[ChatPage] True E2EE decryption returned placeholder text:', decrypted)
              processedMessage.content = message.content
            }
          } catch (err) {
            console.error('[ChatPage] True E2EE decryption error:', err)
            processedMessage.content = message.content
          }
        } else if ((message.encrypted || message.iv) && serverId) {
          try {
            let encryptedData
            try {
              encryptedData = JSON.parse(message.content)
            } catch {
              encryptedData = null
            }

            if (encryptedData && encryptedData._encrypted) {
              const decryptedContent = await decryptMessageFromServer({
                iv: encryptedData.iv,
                content: encryptedData.content
              }, serverId)
              processedMessage.content = decryptedContent
              processedMessage._decrypted = true
              console.log('[ChatPage] Successfully decrypted legacy E2EE message')
            } else if (encryptedData === null) {
              try {
                const decryptedContent = await decryptMessageFromServer({
                  iv: message.iv,
                  content: message.content
                }, serverId)
                processedMessage.content = decryptedContent
                processedMessage._decrypted = true
                console.log('[ChatPage] Successfully decrypted legacy E2EE message (raw format)')
              } catch (err) {
                console.warn('[ChatPage] Could not decrypt message - no key or invalid format:', err.message)
                processedMessage.content = message.content
              }
            } else {
              processedMessage.content = message.content
            }
          } catch (err) {
            console.error('[ChatPage] Legacy decryption error:', err)
            processedMessage.content = message.content
          }
        }

        return processedMessage
      }
      
      const decryptedMessages = await Promise.all(
        response.data.map(msg => decryptMessage(msg))
      )
      
      // Always set messages for the channel (even if channel changed, user can navigate back)
      setChannelMessages(prev => {
        console.log('[ChatPage] Setting messages for channel:', cId, 'count:', decryptedMessages.length)
        const existing = prev[cId] || []
        const unsentLocal = existing.filter(msg =>
          msg?._sendStatus === 'sending' || msg?._sendStatus === 'failed'
        ).filter(local =>
          !decryptedMessages.some(remote =>
            (remote?.id && remote.id === local.id) ||
            (remote?.clientNonce && local?.clientNonce && remote.clientNonce === local.clientNonce) ||
            isLikelySameOutgoingMessage(local, remote)
          )
        )
        return {
          ...prev,
          [cId]: [...decryptedMessages, ...unsentLocal]
        }
      })
      setChannelDiagnostics(prev => ({
        ...prev,
        [cId]: decryptedMessages.length === 0 ? emptyDiagnostic : null
      }))
    } catch (error) {
      console.error('[API] Failed to load messages:', error)
      const failureDiagnostic = buildChannelErrorDiagnostic(error, cId)
      setChannelDiagnostics(prev => ({
        ...prev,
        [cId]: failureDiagnostic
      }))
      if (error?.response?.status === 451) {
        const blocked = channels.find(c => c.id === cId)
        setPendingAgeChannel(blocked || { id: cId })
        setAgeGateNotice(t('chatPage.ageRestrictedNotice', 'This channel is age-restricted. Please complete age verification to view messages.'))
        setBlockedAgeChannels(prev => new Set(prev).add(cId))
      }
      if (loadingChannelId === channelId) {
        setChannelMessages(prev => ({
          ...prev,
          [cId]: []
        }))
      }
    } finally {
      setChannelLoading(false)
    }
  }

  useEffect(() => {
    loadMessagesRef.current = loadMessages
  }, [loadMessages])

  const handleServerChange = (id) => {
    console.log('[User Action] Server change requested:', id)
    if (!id || id === 'home') {
      navigate('/chat')
      setViewMode('home')
    } else if (id === 'friends') {
      navigate('/chat/friends')
      setViewMode('friends')
    } else if (id === 'dms') {
      navigate('/chat/dms')
      setViewMode('dms')
    } else if (id === 'discovery') {
      navigate('/chat/discovery')
      setViewMode('discovery')
    } else {
      navigate(`/chat/${id}`)
      setViewMode('server')
    }
  }

  const handleChannelChange = (id, isVoice = false) => {
    console.log('[User Action] Channel change requested:', id, 'isVoice:', isVoice)
    if (serverId) {
      const targetChannel = channels.find(c => c.id === id)
      if (!isVoice && targetChannel?.nsfw && !ageVerified) {
        if (user?.ageVerification?.category === 'child') {
          setAgeGateNotice(t('chatPage.ageBlockedNotice', 'This channel is 18+. Your account is marked under 18, so access is blocked.'))
          setPendingAgeChannel(targetChannel)
          return
        }
        setAgeGateNotice('')
        setPendingAgeChannel(targetChannel)
        return
      }
      if (!isVoice && blockedAgeChannels.has(id)) {
        setAgeGateNotice(t('chatPage.ageRestrictedNotice', 'This channel is age-restricted. Please complete age verification to view messages.'))
        setPendingAgeChannel(targetChannel)
        return
      }
      setAgeGateNotice('')
      setPendingAgeChannel(null)
      if (isVoice) {
        const voiceChannel = channels.find(c => c.id === id)
        // Always select voice channel in main view
        setSelectedVoiceChannelId(id)
        // Join if not already in a call in this channel
        if (!activeVoiceChannel || activeVoiceChannel.id !== id) {
          setActiveVoiceChannel(voiceChannel)
          setVoicePreviewChannel(null)
          setVoiceViewMode('full')
          setVoiceJoinKey(k => k + 1)
        }
      } else {
        // When clicking a text channel, clear the voice channel selection
        // so the text channel renders. The voice call stays alive via
        // activeVoiceChannel and shows as a mini bar.
        setSelectedVoiceChannelId(null)
        
        // Minimize voice to mini view when switching to text channels
        setVoiceViewMode('mini')
        
        // Focus the chat input if available
        setTimeout(() => {
          const chatInput = document.querySelector('.chat-input [contenteditable], .chat-input textarea, .chat-input input')
          if (chatInput) {
            chatInput.focus()
          }
        }, 100)
        
        navigate(`/chat/${serverId}/${id}`)
      }
    }
  }

  const handleReturnToVoice = () => {
    if (activeVoiceChannel) {
      setSelectedVoiceChannelId(activeVoiceChannel.id)
    }
  }

  const handleAgeVerificationSuccess = async (verification) => {
    const updated = await refreshUser?.()
    const verdict = verification?.category || updated?.ageVerification?.category
    const nextChannel = pendingAgeChannel
    setPendingAgeChannel(null)
    if (verdict === 'adult') {
      setAgeGateNotice('')
      setBlockedAgeChannels(new Set())
      if (nextChannel?.id) {
        navigate(`/chat/${serverId}/${nextChannel.id}`)
        loadMessages(nextChannel.id)
      }
    } else {
      setAgeGateNotice(t('chatPage.ageBlockedNotice', 'This channel is 18+. Your account is marked under 18, so access is blocked.'))
      if (nextChannel?.id) {
        setBlockedAgeChannels(prev => new Set(prev).add(nextChannel.id))
      }
    }
  }

  const handleVoicePreview = (channel) => {
    setVoicePreviewChannel(channel)
  }

  const handleJoinFromPreview = () => {
    // Prevent double-clicks
    if (isJoiningVoiceRef.current || !voicePreviewChannel) return
    
    isJoiningVoiceRef.current = true
    setActiveVoiceChannel(voicePreviewChannel)
    setVoicePreviewChannel(null)
    setVoiceViewMode('full')
    setVoiceJoinKey(k => k + 1)
    
    // Reset after a short delay to allow next join
    setTimeout(() => {
      isJoiningVoiceRef.current = false
    }, 1000)
  }

  const toggleVoiceViewMode = () => {
    // When in mini mode and user clicks maximize, set selectedVoiceChannelId
    // to show the full voice view. When in full mode and user clicks minimize,
    // clear selectedVoiceChannelId to show the mini bar.
    if (selectedVoiceChannelId) {
      setSelectedVoiceChannelId(null)
    } else if (activeVoiceChannel) {
      setSelectedVoiceChannelId(activeVoiceChannel.id)
    }
  }

  const handleLeaveVoice = () => {
    const leftChannelId = activeVoiceChannel?.id
    setActiveVoiceChannel(null)
    setIsMuted(false)
    setIsDeafened(false)
    setSelectedVoiceChannelId(null)
    setContentCollapsed(false)
    setVoiceFloating(false)
    // Reset joining lock so user can rejoin immediately without page refresh
    isJoiningVoiceRef.current = false
    if (leftChannelId) {
      // Clear from the live map immediately
      setVoiceParticipantsByChannel(prev => {
        const next = { ...prev }
        delete next[leftChannelId]
        return next
      })
      // Tell ChannelSidebar to clear + re-fetch that channel's participants
      setLeavingVoiceChannelId(leftChannelId)
      // Reset after sidebar has had time to refetch
      setTimeout(() => setLeavingVoiceChannelId(null), 2000)
    }
  }

  const handleVoiceParticipantsChange = (channelId, participants) => {
    if (!channelId) return
    setVoiceParticipantsByChannel(prev => ({ ...prev, [channelId]: participants }))
  }

  const handleChannelDeleted = async (channel) => {
    try {
      await apiService.deleteChannel(channel.id)
      setChannels(prev => prev.filter(c => c.id !== channel.id))
      if (channel.id === channelId) {
        setMessages([])
        const next = channels.find(c => c.id !== channel.id)
        if (next) navigate(`/chat/${serverId}/${next.id}`)
        else navigate(`/chat/${serverId}`)
      }
    } catch (err) {
      console.error('Failed to delete channel:', err)
    }
  }

  const handleMemberKick = async (memberId) => {
    try {
      await apiService.kickMember(serverId, memberId)
      setMembers(prev => prev.filter(m => m.id !== memberId))
    } catch (err) {
      console.error('Failed to kick member:', err)
    }
  }

  const handleMemberBan = async (memberId) => {
    try {
      await apiService.banMember(serverId, memberId)
      setMembers(prev => prev.filter(m => m.id !== memberId))
    } catch (err) {
      console.error('Failed to ban member:', err)
    }
  }

  const handleAddFriend = async (userId) => {
    try {
      await apiService.sendFriendRequestById(userId)
    } catch (err) {
      console.error('Failed to send friend request:', err)
    }
  }

  const handleStartDM = async (userId) => {
    try {
      const res = await apiService.createDirectMessage(userId)
      setSelectedDM(res.data)
      setViewMode('dms')
      navigate('/chat/dms')
    } catch (err) {
      console.error('Failed to start DM:', err)
    }
  }

  const openSystemInbox = useCallback(() => {
    setViewMode('system')
    navigate('/chat/dms')
  }, [navigate])

  const openDMList = useCallback(() => {
    setSelectedDM(null)
    setViewMode('dms')
    navigate('/chat/dms')
  }, [navigate])

  const openDMConversation = useCallback((conv) => {
    setSelectedDM(conv)
    setViewMode('dms')
    navigate('/chat/dms')
  }, [navigate])

  useEffect(() => {
    if (currentServer) {
      const accent = currentServer.themeColor || 'var(--volt-primary)'
      const banner = currentServer.bannerUrl || ''
      const background = currentServer.backgroundUrl || ''
      const bannerPos = currentServer.bannerPosition || 'cover'
      setThemeStyles({
        '--server-accent': accent,
        '--server-banner': banner ? `url(${banner})` : 'none',
        '--server-background': background ? `url(${background})` : 'none',
        '--server-banner-position': bannerPos
      })
      document.documentElement.style.setProperty('--server-accent', accent)
      if (banner) {
        document.documentElement.style.setProperty('--server-banner', `url(${banner})`)
      } else {
        document.documentElement.style.setProperty('--server-banner', 'none')
      }
      if (background) {
        document.documentElement.style.setProperty('--server-background', `url(${background})`)
      } else {
        document.documentElement.style.setProperty('--server-background', 'none')
      }
    } else {
      setThemeStyles({})
      document.documentElement.style.setProperty('--server-accent', 'var(--volt-primary)')
      document.documentElement.style.setProperty('--server-banner', 'none')
      document.documentElement.style.setProperty('--server-background', 'none')
    }
  }, [currentServer])

  useEffect(() => {
    const updates = Object.values(serverUpdates || {}).filter(update => update?.id)
    if (updates.length === 0) return

    setServers(prev => {
      const nextById = new Map((prev || []).map(server => [server.id, server]))
      updates.forEach((updated) => {
        if (updated.__removed) {
          nextById.delete(updated.id)
          return
        }
        if (!nextById.has(updated.id)) return
        const existing = nextById.get(updated.id) || {}
        nextById.set(updated.id, {
          ...existing,
          ...updated,
          channels: updated.channels ?? existing.channels,
          categories: updated.categories ?? existing.categories,
          roles: updated.roles ?? existing.roles,
          members: updated.members ?? existing.members
        })
      })
      return Array.from(nextById.values())
    })

    if (!currentServer?.id) return

    const updated = serverUpdates[currentServer.id]
    if (!updated) return

    if (updated.__removed) {
      setCurrentServer(null)
      setChannels([])
      setCategories([])
      setMembers([])
      navigate('/chat', { replace: true })
      return
    }

    setCurrentServer(prev => ({
      ...(prev || {}),
      ...updated,
      channels: updated.channels ?? prev?.channels,
      categories: updated.categories ?? prev?.categories,
      roles: updated.roles ?? prev?.roles,
      members: updated.members ?? prev?.members
    }))

    if (updated.channels) {
      const sortedChannels = [...updated.channels].sort((a, b) => (a.position || 0) - (b.position || 0))
      setChannels(sortedChannels)

      if (channelId && !sortedChannels.some(channel => channel.id === channelId)) {
        const fallbackChannel = sortedChannels.find(channel => channel.id === updated.defaultChannelId) || sortedChannels[0] || null
        if (fallbackChannel) {
          navigate(`/chat/${currentServer.id}/${fallbackChannel.id}`, { replace: true })
        } else {
          navigate(`/chat/${currentServer.id}`, { replace: true })
        }
      }
    }

    if (updated.categories) {
      const sortedCategories = [...updated.categories].sort((a, b) => (a.position || 0) - (b.position || 0))
      setCategories(sortedCategories)
    }

    if (updated.members) {
      setMembers(applyPresenceToMembers(updated.members, presenceByServer[currentServer.id] || {}))
      return
    }

    if (updated.roles) {
      const validRoleIds = new Set(updated.roles.map(role => role.id))
      setMembers(prev => prev.map(member => {
        const nextRoles = (Array.isArray(member.roles) ? member.roles : (member.role ? [member.role] : []))
          .filter(roleId => validRoleIds.has(roleId))
        return {
          ...member,
          roles: nextRoles,
          role: nextRoles[0] || null
        }
      }))
    }
  }, [serverUpdates, currentServer?.id, channelId, navigate, applyPresenceToMembers, presenceByServer])

  // Ensure encryption keys are available when current server changes
  useEffect(() => {
    if (user?.id && currentServer?.id) {
      console.log('[ChatPage] Ensuring encryption keys for server:', currentServer.id)
      ensureEncryptionKeys(currentServer.id)
    }
  }, [currentServer?.id, user?.id, ensureEncryptionKeys])

  useEffect(() => {
    if (!isMobile) {
      setShowChannelDrawer(false)
      setShowMobileServerSelector(false)
      return
    }
    if (viewMode !== 'server') {
      setShowChannelDrawer(false)
      setShowMembers(false)
    }
  }, [isMobile, viewMode])

  // Auto-focus chat input when typing - but not when in full voice with activity
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't intercept if already typing in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
        return
      }
      
      // Don't intercept if in full voice mode with activity (they need those keys)
      const isInFullVoiceWithActivity = selectedVoiceChannelId && activeVoiceChannel && voiceViewMode === 'full'
      
      // Don't intercept modifier keys alone
      if (e.key === 'Control' || e.key === 'Alt' || e.key === 'Shift' || e.key === 'Meta' || e.key === 'CapsLock') {
        return
      }
      
      // Don't intercept if showing modals/dialogs
      if (document.querySelector('.modal-overlay') || document.querySelector('[role="dialog"]')) {
        return
      }
      
      // Only auto-focus for printable characters
      if (e.key.length === 1 || e.key === 'Enter') {
        const chatInput = document.querySelector('.chat-input [contenteditable], .chat-input input, .chat-input textarea')
        if (chatInput && !isInFullVoiceWithActivity) {
          chatInput.focus()
        }
      }
    }
    
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [selectedVoiceChannelId, activeVoiceChannel, voiceViewMode])

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>{t('chatPage.loading', 'Loading VoltChat...')}</p>
      </div>
    )
  }

  const handleMobileTabChange = (tab) => {
    setMobileTab(tab)
    setShowChannelDrawer(false)
    if (tab !== 'servers') {
      setShowMobileServerSelector(false)
      setMobileServerSearch('')
    }
    if (tab === 'home') {
      handleServerChange('home')
    } else if (tab === 'servers') {
      setShowMobileServerSelector(true)
    } else if (tab === 'dms') {
      openDMList()
    } else if (tab === 'friends') {
      handleServerChange('friends')
    } else if (tab === 'discovery') {
      handleServerChange('discovery')
    }
  }

  const getCurrentMobileTab = () => {
    if (showMobileServerSelector) return 'servers'
    if (serverId === 'friends' || viewMode === 'friends') return 'friends'
    if (serverId === 'dms' || viewMode === 'dms' || viewMode === 'system') return 'dms'
    if (serverId === 'discovery' || viewMode === 'discovery') return 'discovery'
    if (serverId && serverId !== 'home' && serverId !== 'null') return 'servers'
    return 'home'
  }

  return (
    <div className="chat-page" style={themeStyles}>
      {!isMobile && (
        <ServerSidebar 
          servers={servers} 
          currentServerId={serverId}
          onServerChange={handleServerChange}
          onCreateServer={loadServers}
          onOpenSettings={() => setShowSettings(true)}
          onOpenCreate={() => setShowCreateServer(true)}
          onOpenJoin={() => setShowJoinServer(true)}
          onOpenServerSettings={() => { setServerSettingsTab('overview'); setShowServerSettings(true) }}
          onLeaveServer={handleLeaveServer}
          onOpenAdmin={() => setShowAdminPanel(true)}
          isAdmin={isAdmin}
          friendRequestCount={friendRequestCount}
          dmNotifications={dmNotifications}
          serverUnreadCounts={serverUnreadCounts}
          serverEventsMeta={serverEventsMeta}
          onDMClick={handleDMClick}
        />
      )}

      {isMobile && (
        <MobileNav
          currentTab={getCurrentMobileTab()}
          onTabChange={handleMobileTabChange}
          onCreateServer={() => setShowCreateServer(true)}
          onJoinServer={() => setShowJoinServer(true)}
          onOpenSettings={() => setShowSettings(true)}
          friendRequestCount={friendRequestCount}
          dmNotifications={dmNotifications.length}
          serverUnreadCounts={serverUnreadCounts}
          servers={servers}
          onDMClick={handleDMClick}
          hasActiveVoice={!!activeVoiceChannel && !selectedVoiceChannelId}
          onReturnToVoice={handleReturnToVoice}
        />
      )}
      
      {isMobile && showMobileServerSelector ? (
        <div className="mobile-mode-shell mobile-server-selector-shell">
          <div className="mobile-pane-header mobile-server-selector-header">
            <div className="mobile-header-btn" />
            <div className="mobile-header-title">
              <span className="mobile-server-name">{t('servers.title', 'Servers')}</span>
              <span className="mobile-channel-name">{servers.length} {t('servers.joined', 'joined')}</span>
            </div>
            <button
              className="mobile-header-btn"
              onClick={() => {
                setShowMobileServerSelector(false)
                setMobileServerSearch('')
              }}
              aria-label={t('common.close', 'Close')}
            >
              <X size={20} />
            </button>
          </div>

          <div className="mobile-server-selector-controls">
            <label className="mobile-server-search">
              <Search size={16} />
              <input
                type="text"
                value={mobileServerSearch}
                onChange={(e) => setMobileServerSearch(e.target.value)}
                placeholder={t('servers.search', 'Search servers')}
              />
            </label>
            <div className="mobile-server-selector-actions">
              <button className="btn btn-secondary" onClick={() => setShowJoinServer(true)}>
                {t('app.joinServer', 'Join Server')}
              </button>
              <button className="btn btn-primary" onClick={() => setShowCreateServer(true)}>
                {t('app.createServer', 'Create Server')}
              </button>
            </div>
          </div>

          <div className="mobile-server-selector-list">
            {servers
              .filter(s => !mobileServerSearch.trim() || s.name?.toLowerCase().includes(mobileServerSearch.trim().toLowerCase()))
              .map((server) => {
                const unread = serverUnreadCounts[server.id] || 0
                const isActive = currentServer?.id === server.id || serverId === server.id
                return (
                  <button
                    key={server.id}
                    className={`mobile-server-selector-item ${isActive ? 'active' : ''}`}
                    onClick={() => {
                      setShowMobileServerSelector(false)
                      setMobileServerSearch('')
                      handleServerChange(server.id)
                    }}
                  >
                    <Avatar
                      src={server.icon}
                      fallback={server.name}
                      size={40}
                      userId={server.id}
                    />
                    <span className="mobile-server-selector-name">{server.name}</span>
                    {unread > 0 && (
                      <span className="mobile-server-selector-badge">{unread > 99 ? '99+' : unread}</span>
                    )}
                  </button>
                )
              })}
            {servers.filter(s => !mobileServerSearch.trim() || s.name?.toLowerCase().includes(mobileServerSearch.trim().toLowerCase())).length === 0 && (
              <div className="mobile-server-selector-empty">
                {t('servers.none', 'No servers found')}
              </div>
            )}
          </div>
        </div>
      ) : viewMode === 'friends' ? (
        isMobile ? (
          <div className="mobile-mode-shell">
            <FriendsPage key="friends-mobile" onStartDM={(conv) => {
              openDMConversation(conv)
            }} />
          </div>
        ) : (
          <>
            <DMList type="friends"
              onSelectConversation={(conv) => { setSelectedDM(conv); setViewMode('dms') }}
              onClose={() => {}}
              onOpenSystemInbox={openSystemInbox}
            />
            <FriendsPage key="friends-desktop" onStartDM={(conv) => {
              openDMConversation(conv)
            }} />
          </>
        )
      ) : viewMode === 'system' ? (
        isMobile ? (
          <div className="mobile-mode-shell">
            <div className="mobile-pane-header">
              <div className="mobile-header-btn" />
              <div className="mobile-header-title">
                <span className="mobile-server-name">{t('system.systemInbox', 'System Inbox')}</span>
              </div>
              <button className="mobile-header-btn" onClick={openDMList}>
                <ChevronLeft size={20} />
              </button>
            </div>
            <SystemMessagePanel key="system-mobile" onClose={openDMList} />
          </div>
        ) : (
          <>
            <DMList
              type="dms"
              onSelectConversation={(conv) => { setSelectedDM(conv); setViewMode('dms') }}
              selectedConversation={null}
              onClose={(convId) => {}}
              onOpenSystemInbox={openSystemInbox}
            />
            <SystemMessagePanel key="system-desktop" onClose={openDMList} />
          </>
        )
      ) : viewMode === 'dms' ? (
        isMobile ? (
          <div className="mobile-mode-shell">
            {selectedDM ? (
              <>
                <div className="mobile-pane-header">
                  <button className="mobile-header-btn" onClick={openDMList}>
                    <ChevronLeft size={20} />
                  </button>
                  <div className="mobile-header-title">
                    <span className="mobile-server-name">
                      {selectedDM?.recipient?.displayName || selectedDM?.recipient?.username || t('dm.title', 'Direct Messages')}
                    </span>
                    {selectedDM?.recipient?.status && (
                      <span className="mobile-channel-name">{selectedDM.recipient.status}</span>
                    )}
                  </div>
                  <button className="mobile-header-btn" onClick={openSystemInbox}>
                    <MessageSquare size={18} />
                  </button>
                </div>
                <DMChat key={`dm-mobile-${selectedDM.id}`} conversation={selectedDM} onShowProfile={(userId) => setShowUserProfile(userId)} />
              </>
            ) : (
              <DMList
                key="dm-list-mobile"
                type="dms"
                onSelectConversation={openDMConversation}
                selectedConversation={selectedDM}
                onClose={(convId) => {
                  if (selectedDM?.id === convId) setSelectedDM(null)
                }}
                onOpenSystemInbox={openSystemInbox}
              />
            )}
          </div>
        ) : (
          <>
            <DMList 
              key="dm-list-desktop"
              type="dms" 
              onSelectConversation={setSelectedDM}
              selectedConversation={selectedDM}
              onClose={(convId) => {
                if (selectedDM?.id === convId) setSelectedDM(null)
              }}
              onOpenSystemInbox={openSystemInbox}
            />
            {selectedDM ? (
              <DMChat key={`dm-desktop-${selectedDM.id}`} conversation={selectedDM} onShowProfile={(userId) => setShowUserProfile(userId)} />
            ) : (
              <div className="empty-state">
                <MessageSquare size={48} className="empty-state-icon" />
                <h2>{t('dm.selectDm')}</h2>
                <p>{t('dm.chooseConversation')}</p>
              </div>
            )}
          </>
        )
      ) : viewMode === 'discovery' ? (
        <>
          <Discovery key="discovery-view"
            onJoinServer={(serverId) => {
              loadServers()
            }}
          />
        </>
      ) : viewMode === 'home' ? (
        <>
          {isMobile ? (
            <div className="mobile-mode-shell mobile-home-shell">
              <div className="mobile-home-hub">
                <section className="mobile-home-hero">
                  <span className="mobile-home-eyebrow">{t('app.welcome', 'Welcome to VoltChat')}</span>
                  <h2>{user?.displayName || user?.username || 'VoltChat'}</h2>
                  <p>{t('app.createOrJoin')}</p>
                  <div className="mobile-home-actions">
                    <button className="btn btn-primary" onClick={() => setShowCreateServer(true)}>
                      {t('app.createServer', 'Create Server')}
                    </button>
                    <button className="btn btn-secondary" onClick={() => setShowJoinServer(true)}>
                      {t('app.joinServer', 'Join Server')}
                    </button>
                  </div>
                </section>

                <section className="mobile-home-stats">
                  <button className="mobile-home-stat-card" onClick={() => setShowMobileServerSelector(true)}>
                    <strong>{servers.length}</strong>
                    <span>{t('servers.title', 'Servers')}</span>
                    <small>{totalServerUnread > 0 ? `${totalServerUnread} unread` : 'All caught up'}</small>
                  </button>
                  <button className="mobile-home-stat-card" onClick={openDMList}>
                    <strong>{dmNotifications.length}</strong>
                    <span>{t('mobileNav.messages', 'Messages')}</span>
                    <small>{friendRequestCount > 0 ? `${friendRequestCount} requests` : 'Open inbox'}</small>
                  </button>
                </section>

                <section className="mobile-home-shortcuts">
                  <button className="mobile-home-shortcut" onClick={() => setShowMobileServerSelector(true)}>
                    <Hash size={18} />
                    <div>
                      <strong>{t('mobileNav.servers', 'Servers')}</strong>
                      <span>{t('servers.search', 'Browse and switch')}</span>
                    </div>
                  </button>
                  <button className="mobile-home-shortcut" onClick={openDMList}>
                    <MessageSquare size={18} />
                    <div>
                      <strong>{t('mobileNav.messages', 'Messages')}</strong>
                      <span>{t('dm.chooseConversation', 'Open conversations')}</span>
                    </div>
                  </button>
                  <button className="mobile-home-shortcut" onClick={() => handleServerChange('friends')}>
                    <Users size={18} />
                    <div>
                      <strong>{t('mobileNav.friends', 'Friends')}</strong>
                      <span>{friendRequestCount > 0 ? `${friendRequestCount} pending requests` : 'Manage your people'}</span>
                    </div>
                  </button>
                  <button className="mobile-home-shortcut" onClick={() => handleServerChange('discovery')}>
                    <Search size={18} />
                    <div>
                      <strong>{t('mobileNav.discover', 'Discover')}</strong>
                      <span>{t('discovery.title', 'Find communities')}</span>
                    </div>
                  </button>
                  {activeVoiceChannel && (
                    <button className="mobile-home-shortcut accent" onClick={handleReturnToVoice}>
                      <PhoneCall size={18} />
                      <div>
                        <strong>{t('voicePreview.returnToVoice', 'Return to voice')}</strong>
                        <span>{activeVoiceChannel.name || t('voice.channel', 'Voice channel')}</span>
                      </div>
                    </button>
                  )}
                </section>

                {mobileRecentServers.length > 0 && (
                  <section className="mobile-home-recent">
                    <div className="mobile-home-section-head">
                      <h3>{t('servers.title', 'Servers')}</h3>
                      <button type="button" onClick={() => setShowMobileServerSelector(true)}>
                        {t('common.viewAll', 'View all')}
                      </button>
                    </div>
                    <div className="mobile-home-server-list">
                      {mobileRecentServers.map((server) => {
                        const unread = serverUnreadCounts[server.id] || 0
                        return (
                          <button
                            key={server.id}
                            className="mobile-home-server-item"
                            onClick={() => handleServerChange(server.id)}
                          >
                            <Avatar src={server.icon} fallback={server.name} size={42} userId={server.id} />
                            <div className="mobile-home-server-copy">
                              <strong>{server.name}</strong>
                              <span>{unread > 0 ? `${unread} unread` : 'Open server'}</span>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </section>
                )}

                <HomeEventsHub events={upcomingEvents} onOpenServer={handleServerChange} />
              </div>
            </div>
          ) : (
            <div className="empty-state full hero simple-home">
              <div className="simple-welcome">
                <h2>{t('app.welcome')}</h2>
                <p>{t('app.createOrJoin')}</p>
                <div className="simple-actions">
                  <button className="btn btn-primary btn-lg" onClick={() => setShowCreateServer(true)}>
                    {t('app.createServer', 'Create Server')}
                  </button>
                  <button className="btn btn-secondary btn-lg" onClick={() => setShowJoinServer(true)}>
                    {t('app.joinServer', 'Join Server')}
                  </button>
                </div>
                <HomeEventsHub events={upcomingEvents} onOpenServer={handleServerChange} />
              </div>
            </div>
          )}
        </>
      ) : serverId && serverId !== 'null' && currentServer ? (
        <>
          {isMobile && (
            <div className="mobile-header-shell">
              <div className="mobile-header">
                <button className="mobile-header-btn" onClick={() => setShowChannelDrawer(true)}>
                  <Menu size={20} />
                </button>
                <div className="mobile-header-title">
                  <span className="mobile-server-name">{currentServer.name}</span>
                  {channelId && (
                    <span className="mobile-channel-name">
                      {channels.find(c => c.id === channelId)?.name}
                    </span>
                  )}
                </div>
                <button className="mobile-header-btn" onClick={() => setShowMembers(prev => !prev)}>
                  <Users size={20} />
                </button>
                {activeVoiceChannel && !selectedVoiceChannelId && (
                  <button
                    className="mobile-header-btn"
                    onClick={handleReturnToVoice}
                    title={t('voicePreview.returnToVoice', 'Return to voice')}
                  >
                    <PhoneCall size={18} />
                  </button>
                )}
              </div>
              <div className="mobile-utility-strip">
                <button className="mobile-utility-chip active" onClick={() => setShowChannelDrawer(true)}>
                  <Menu size={16} />
                  <span>{t('chat.channels', 'Channels')}</span>
                </button>
                <button className={`mobile-utility-chip ${showMembers ? 'active' : ''}`} onClick={() => setShowMembers(prev => !prev)}>
                  <Users size={16} />
                  <span>{members.length} {t('common.members', 'Members')}</span>
                </button>
                <button className="mobile-utility-chip" onClick={() => { setServerSettingsTab('overview'); setShowServerSettings(true) }}>
                  <Lock size={16} />
                  <span>{t('server.settings', 'Server')}</span>
                </button>
                <button className="mobile-utility-chip" onClick={() => { setServerSettingsTab('invites'); setShowServerSettings(true) }}>
                  <MessageSquare size={16} />
                  <span>{t('common.invite', 'Invite')}</span>
                </button>
                <button className="mobile-utility-chip" onClick={() => setShowSettings(true)}>
                  <Settings size={16} />
                  <span>{t('nav.settings', 'Settings')}</span>
                </button>
              </div>
            </div>
          )}
          
          {isMobile && showChannelDrawer && (
            <>
              <div 
                className="channel-sidebar-overlay visible" 
                onClick={() => setShowChannelDrawer(false)}
              />
              <div className="mobile-channel-drawer">
                <div className="mobile-channel-drawer-header">
                  <button className="mobile-header-btn" onClick={() => setShowChannelDrawer(false)}>
                    <ChevronLeft size={20} />
                  </button>
                  <div className="mobile-header-title">
                    <span className="mobile-server-name">{currentServer.name}</span>
                    <span className="mobile-channel-name">{channels.length} {t('chat.channels', 'Channels')}</span>
                  </div>
                  <button
                    className="mobile-header-btn"
                    onClick={() => {
                      setServerSettingsTab('overview')
                      setShowServerSettings(true)
                      setShowChannelDrawer(false)
                    }}
                  >
                    <Settings size={18} />
                  </button>
                </div>
                <div className="mobile-channel-drawer-body">
                <ChannelSidebar 
                  className="open"
                  server={currentServer}
                  channels={channels}
                  categories={categories}
                  currentChannelId={channelId}
                  unreadChannelIds={unreadChannelsByServer[currentServer?.id] || []}
                  selectedVoiceChannelId={selectedVoiceChannelId}
                  onChannelChange={(id, isVoice) => {
                    handleChannelChange(id, isVoice)
                    setShowChannelDrawer(false)
                  }}
                  onCreateChannel={() => loadServerData(serverId)}
                  onOpenServerSettings={() => { setServerSettingsTab('overview'); setShowServerSettings(true); setShowChannelDrawer(false) }}
                  onOpenSettings={() => { setShowSettings(true); setShowChannelDrawer(false) }}
                  onVoicePreview={handleVoicePreview}
                  activeVoiceChannel={activeVoiceChannel}
                  voiceParticipantsByChannel={voiceParticipantsByChannel}
                  leavingVoiceChannelId={leavingVoiceChannelId}
                  onDeleteChannel={handleChannelDeleted}
                  onRefreshChannels={() => loadServerData(serverId)}
                  onInvite={() => { setServerSettingsTab('invites'); setShowServerSettings(true); setShowChannelDrawer(false) }}
                  onReturnToVoice={() => { handleReturnToVoice(); setShowChannelDrawer(false) }}
                  onLeaveVoice={() => { handleLeaveVoice(); setShowChannelDrawer(false) }}
                  isMuted={isMuted}
                  isDeafened={isDeafened}
                  onToggleMute={() => setIsMuted(!isMuted)}
                  onToggleDeafen={() => { setIsDeafened(!isDeafened); if (!isDeafened) setIsMuted(true) }}
                />
                </div>
              </div>
            </>
          )}

          {!isMobile && (
            <ChannelSidebar 
              server={currentServer}
              channels={channels}
              categories={categories}
              currentChannelId={channelId}
              unreadChannelIds={unreadChannelsByServer[currentServer?.id] || []}
              selectedVoiceChannelId={selectedVoiceChannelId}
              onChannelChange={handleChannelChange}
              onCreateChannel={() => loadServerData(serverId)}
              onOpenServerSettings={() => { setServerSettingsTab('overview'); setShowServerSettings(true) }}
              onOpenSettings={() => setShowSettings(true)}
              onVoicePreview={handleVoicePreview}
              activeVoiceChannel={activeVoiceChannel}
              voiceParticipantsByChannel={voiceParticipantsByChannel}
              leavingVoiceChannelId={leavingVoiceChannelId}
              onDeleteChannel={handleChannelDeleted}
              onRefreshChannels={() => loadServerData(serverId)}
              onInvite={() => { setServerSettingsTab('invites'); setShowServerSettings(true) }}
              onReturnToVoice={handleReturnToVoice}
              onLeaveVoice={handleLeaveVoice}
              isMuted={isMuted}
              isDeafened={isDeafened}
              onToggleMute={() => setIsMuted(!isMuted)}
              onToggleDeafen={() => { setIsDeafened(!isDeafened); if (!isDeafened) setIsMuted(true) }}
            />
          )}
          {/* When voice channel is selected as main view, show placeholder or ChatArea behind the mini bar */}
          {channelId && channelId !== 'null' ? (
            <>
              {ageGateNotice ? (
                <div className="empty-state">
                  <Lock size={48} className="empty-state-icon" />
                  <h2>{t('chatPage.ageRestrictedTitle', 'Age restricted')}</h2>
                  <p>{ageGateNotice}</p>
                  {pendingAgeChannel && (
                    <button className="btn btn-primary" onClick={() => setPendingAgeChannel(pendingAgeChannel)}>
                      {t('chatPage.retryVerification', 'Retry verification')}
                    </button>
                  )}
                </div>
              ) : pendingAgeChannel?.id === channelId ? (
                <div className="empty-state">
                  <Lock size={48} className="empty-state-icon" />
                  <h2>{t('chatPage.ageVerificationRequiredTitle', 'Age verification required')}</h2>
                  <p>{t('chatPage.ageVerificationRequiredBody', 'This channel is age-restricted. Complete verification to continue.')}</p>
                  <button className="btn btn-primary" onClick={() => setPendingAgeChannel(pendingAgeChannel)}>
                    {t('chatPage.startVerification', 'Start verification')}
                  </button>
                </div>
) : (
                <>
                  {!contentCollapsed && (
                  isAnnouncementChannel ? (
                    <AnnouncementChannel
                      key={`channel-${channelId}`}
                      channelId={channelId}
                      serverId={serverId}
                      channel={currentChannel}
                      isAdmin={isAdmin}
                    />
                  ) : isForumChannel ? (
                    <ForumChannel
                      key={`channel-${channelId}`}
                      channelId={channelId}
                      serverId={serverId}
                      channel={currentChannel}
                    />
                  ) : isMediaChannel ? (
                    <MediaChannel
                      key={`channel-${channelId}`}
                      channelId={channelId}
                      serverId={serverId}
                      channel={currentChannel}
                    />
                  ) : (
                  <ChatArea
                    key={`channel-${channelId}`}
                    channelId={channelId}
                    serverId={serverId}
                    channels={channels}
                    messages={messages}
                    channelDiagnostic={activeChannelDiagnostic}
                    initialMembers={members}
                    initialServer={currentServer}
                    isAdmin={isAdmin}
                    isLoading={channelLoading}
                    onMessageSent={handleOptimisticChannelMessage}
                    onMessageFailed={handleChannelSendFailed}
                    onMessageAck={handleChannelMessageAck}
                    onLoadMoreMessages={async (beforeTimestamp) => {
                      if (!beforeTimestamp) {
                        // Initial load - call loadMessages directly
                        await loadMessages(channelId)
                        return true
                      }
                      // Load older messages
                      try {
                        const response = await apiService.getMessages(channelId, { limit: 50, before: beforeTimestamp })
                        if (response.data && response.data.length > 0) {
                          const decryptedOlder = await Promise.all(response.data.map(async (message) => {
                            let processedMessage = { ...message }

                            if ((message.encrypted || message.iv) && message.epoch && serverId && e2eTrue) {
                              try {
                                const decrypted = await e2eTrue.decryptMessage(message, serverId)
                                if (decrypted && !decrypted.includes('Encrypted') && !decrypted.includes('awaiting')) {
                                  processedMessage.content = decrypted
                                  processedMessage._decrypted = true
                                }
                              } catch (err) {
                                console.warn('[ChatPage] Could not decrypt older True E2EE message:', err?.message || err)
                              }
                            } else if ((message.encrypted || message.iv) && serverId) {
                              try {
                                let encryptedData = null
                                try {
                                  encryptedData = JSON.parse(message.content)
                                } catch {
                                  encryptedData = null
                                }

                                if (encryptedData && encryptedData._encrypted) {
                                  const decryptedContent = await decryptMessageFromServer({
                                    encrypted: true,
                                    iv: encryptedData.iv,
                                    content: encryptedData.content
                                  }, serverId)
                                  processedMessage.content = decryptedContent
                                  processedMessage._decrypted = true
                                } else if (message.iv && message.content) {
                                  const decryptedContent = await decryptMessageFromServer({
                                    encrypted: true,
                                    iv: message.iv,
                                    content: message.content
                                  }, serverId)
                                  processedMessage.content = decryptedContent
                                  processedMessage._decrypted = true
                                }
                              } catch (err) {
                                console.warn('[ChatPage] Could not decrypt older legacy E2EE message:', err?.message || err)
                              }
                            }

                            return processedMessage
                          }))

                          setChannelMessages(prev => {
                            const currentMessages = prev[channelId] || []
                            const existingIds = new Set(currentMessages.map(m => m.id))
                            const newMessages = decryptedOlder.filter(m => !existingIds.has(m.id))
                            return {
                              ...prev,
                              [channelId]: [...newMessages, ...currentMessages]
                            }
                          })
                          // Return true = there may be more; false = reached the beginning
                          return response.data.length >= 50
                        }
                        // Server returned 0 messages — we've reached the beginning
                        return false
                      } catch (error) {
                        console.error('Failed to load older messages:', error)
                        return false
                      }
                    }}
                    onSaveScrollPosition={saveCurrentChannelState}
                    scrollPosition={currentScrollPosition}
                    onShowProfile={(userId) => setShowUserProfile(userId)}
                    onAgeGateTriggered={() => {
                      const target = channels.find(c => c.id === channelId)
                      if (target?.nsfw && !ageVerified) {
                        if (user?.ageVerification?.category === 'child') {
                          setAgeGateNotice(t('chatPage.ageBlockedNotice', 'This channel is 18+. Your account is marked under 18, so access is blocked.'))
                          setPendingAgeChannel(null)
                          return
                        }
                        setPendingAgeChannel(target)
                      }
                    }}
                    onToggleMembers={() => setShowMembers(prev => !prev)}
                  />
                    ))}
                    {encryptionError && (
                    <EncryptionFallback
                      status={encryptionError}
                      onRetry={async () => {
                        setIsRetryingEncryption(true)
                        try {
                          await getServerEncryptionStatus(serverId)
                          setEncryptionError(null)
                        } catch (err) {
                          console.error('[ChatPage] Retry failed:', err)
                        } finally {
                          setIsRetryingEncryption(false)
                        }
                      }}
                      isRetrying={isRetryingEncryption}
                      showDetails={true}
                    />
                  )}
                  {!contentCollapsed && !isMobile && (
                    <MemberSidebar 
                      members={members} 
                      server={currentServer}
                      visible={showMembers}
                      onMemberClick={(userId) => setShowUserProfile(userId)}
                      onStartDM={handleStartDM}
                      onKick={handleMemberKick}
                      onBan={handleMemberBan}
                      onAddFriend={handleAddFriend}
                    />
                  )}
                  {isMobile && showMembers && (
                    <>
                      <div className="member-sidebar-overlay" onClick={() => setShowMembers(false)} />
                      <MemberSidebar 
                        members={members} 
                        server={currentServer}
                        visible={showMembers}
                        isMobile
                        onClose={() => setShowMembers(false)}
                        onMemberClick={(userId) => setShowUserProfile(userId)}
                        onStartDM={handleStartDM}
                        onKick={handleMemberKick}
                        onBan={handleMemberBan}
                        onAddFriend={handleAddFriend}
                      />
                    </>
                  )}
                </>
              )}
            </>
          ) : (
            <div className="empty-state simple">
              <p>{t('chatPage.noVisibleChannels', 'no channels are visible for you :(')}</p>
            </div>
          )}
          {voicePreviewChannel && !activeVoiceChannel && (
            <div className="voice-preview-overlay" onClick={() => setVoicePreviewChannel(null)}>
              <VoiceChannelPreview
                channel={voicePreviewChannel}
                onJoin={handleJoinFromPreview}
                onClose={() => setVoicePreviewChannel(null)}
              />
            </div>
          )}
        </>
      ) : (
        <div className="empty-state full hero simple-home">
          <div className="simple-welcome">
            <h2>{t('app.welcome')}</h2>
            <p>{t('app.createOrJoin')}</p>
            <div className="simple-actions">
              <button className="btn btn-primary btn-lg" onClick={() => setShowCreateServer(true)}>
                {t('app.createServer', 'Create Server')}
              </button>
              <button className="btn btn-secondary btn-lg" onClick={() => setShowJoinServer(true)}>
                {t('app.joinServer', 'Join Server')}
              </button>
            </div>
            <HomeEventsHub events={upcomingEvents} onOpenServer={handleServerChange} />
          </div>
        </div>
      )}

      {/* Unified Voice panel - SINGLE persistent render that adapts to view mode
          This prevents WebRTC reconnection when switching between views.
          viewMode is 'full' when selectedVoiceChannelId is set, otherwise 'mini' */}
      {activeVoiceChannel && (
        <div className={`voice-container ${selectedVoiceChannelId ? 'full' : (voiceFloating ? 'mini' : (viewMode === 'server' ? 'mini' : voiceViewMode))}`}>
          <div className="voice-container-header">
            <span>{activeVoiceChannel.name}</span>
            <div className="voice-view-controls">
              <button onClick={toggleVoiceViewMode} title={selectedVoiceChannelId ? t('chatPage.minimizeVoice', 'Minimize') : t('chatPage.maximizeVoice', 'Maximize')}>
                {selectedVoiceChannelId ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
            </div>
          </div>
          <VoiceChannel
            key={activeVoiceChannel.id}
            channel={activeVoiceChannel}
            joinKey={voiceJoinKey}
            onLeave={() => {
              handleLeaveVoice()
              setVoiceExpanded(false)
            }}
            viewMode={selectedVoiceChannelId ? 'full' : (voiceFloating ? 'mini' : (viewMode === 'server' ? 'mini' : voiceViewMode))}
            isMuted={isMuted}
            isDeafened={isDeafened}
            onMuteChange={setIsMuted}
            onDeafenChange={setIsDeafened}
            onOpenSettings={() => { setSettingsInitialTab('voice'); setShowSettings(true) }}
            onParticipantsChange={handleVoiceParticipantsChange}
            onShowConnectionInfo={() => setShowVoiceInfo(true)}
          />
        </div>
      )}

      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} initialTab={settingsInitialTab} />
      )}

      {showServerSettings && currentServer && (
        <ServerSettingsModal 
          server={currentServer}
          initialTab={serverSettingsTab}
          onClose={() => { setShowServerSettings(false); setServerSettingsTab('overview') }}
          onUpdate={(updated) => {
            setCurrentServer(updated)
            setMembers(updated.members || [])
          }}
          onDelete={() => {
            setCurrentServer(null)
            loadServers()
            navigate('/chat')
          }}
        />
      )}

      {showUserProfile && (
        <ProfileModal 
          userId={showUserProfile}
          server={currentServer}
          members={members}
          onClose={() => setShowUserProfile(null)}
          onStartDM={(conv) => {
            setSelectedDM(conv)
            setViewMode('dms')
            navigate('/chat/dms')
            setShowUserProfile(null)
          }}
        />
      )}

      {showCreateServer && (
        <CreateServerModal
          onClose={() => setShowCreateServer(false)}
          onSuccess={() => {
            setShowCreateServer(false)
            loadServers()
          }}
        />
      )}

      {showJoinServer && (
        <JoinServerModal
          onClose={() => setShowJoinServer(false)}
          onSuccess={() => {
            setShowJoinServer(false)
            loadServers()
          }}
        />
      )}

      {pendingAgeChannel && (
        <AgeVerificationModal
          channelName={pendingAgeChannel.name}
          onClose={() => setPendingAgeChannel(null)}
          onVerified={handleAgeVerificationSuccess}
        />
      )}

      {showAdminPanel && (
        <AdminPanel onClose={() => setShowAdminPanel(false)} />
      )}

      {/* Notification Toast Container */}
      <NotificationToast />

      {/* Voice connection info modal */}
      {showVoiceInfo && activeVoiceChannel && (
        <VoiceInfoModal
          channel={activeVoiceChannel}
          onClose={() => setShowVoiceInfo(false)}
        />
      )}
    </div>
  )
}

export default ChatPage
