import React, { useState, useEffect, useCallback, useRef } from 'react'
import { UsersIcon, PlusIcon, XMarkIcon, MagnifyingGlassIcon, ClipboardDocumentIcon, BellIcon, BellSlashIcon, ArrowPathIcon, WifiIcon } from '@heroicons/react/24/outline'
import { Lock, Shield, ShieldOff, Key } from 'lucide-react'
import { useTranslation } from '../hooks/useTranslation'
import { useNavigate, useLocation } from 'react-router-dom'
import { apiService } from '../services/apiService'
import { useSocket } from '../contexts/SocketContext'
import { useE2e } from '../contexts/E2eContext'
import { soundService } from '../services/soundService'
import lazyLoadingService from '../services/lazyLoadingService'
import Avatar from './Avatar'
import ContextMenu from './ContextMenu'
import GuildTagBadge from './GuildTagBadge'
import E2eeEnableModal from './E2eeEnableModal'
import E2eeKeyPromptModal from './E2eeKeyPromptModal'
import { useResetScrollOnChange } from '../hooks/useResetScrollOnChange'
import '../assets/styles/DMList.css'
import '../assets/styles/SystemMessagePanel.css'

const OFFLINE_GRACE_MS = 2400
const PRESENCE_STATUSES = new Set(['online', 'idle', 'dnd', 'invisible', 'offline'])
const PRESENCE_STATUS_ALIASES = new Map([
  ['active', 'online'],
  ['available', 'online'],
  ['away', 'idle'],
  ['busy', 'dnd'],
  ['do_not_disturb', 'dnd'],
  ['do-not-disturb', 'dnd'],
  ['donotdisturb', 'dnd']
])

const isNumericTimestampString = (value) => {
  let hasDigit = false
  let hasDecimalPoint = false

  for (let i = 0; i < value.length; i += 1) {
    const char = value[i]
    if (char >= '0' && char <= '9') {
      hasDigit = true
      continue
    }

    if (char === '.' && !hasDecimalPoint) {
      hasDecimalPoint = true
      continue
    }

    return false
  }

  return hasDigit
}

const normalizePresenceUserId = (value) => {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }
  if (typeof value === 'object') {
    return normalizePresenceUserId(
      value.id ??
      value.userId ??
      value.user_id ??
      value.memberId ??
      value.member_id ??
      value.user?.id ??
      value.user?.userId ??
      value.user?.user_id
    )
  }
  return null
}

const extractPresenceUserId = (payload = {}) => normalizePresenceUserId(
  payload.userId ??
  payload.user_id ??
  payload.memberId ??
  payload.member_id ??
  payload.recipientId ??
  payload.recipient_id ??
  payload.targetUserId ??
  payload.target_user_id ??
  payload.user?.id ??
  payload.user?.userId ??
  payload.user?.user_id ??
  payload.member?.id ??
  payload.member?.userId ??
  payload.member?.user_id ??
  payload.member?.user?.id ??
  payload.member?.user?.userId ??
  payload.presence?.userId ??
  payload.presence?.user_id ??
  payload.data?.userId ??
  payload.data?.user_id ??
  payload.data?.memberId ??
  payload.data?.member_id ??
  payload.data?.user?.id
)

const parsePresenceTimestamp = (value) => {
  if (value === null || value === undefined) return null

  if (value instanceof Date) {
    const ms = value.getTime()
    return Number.isFinite(ms) ? ms : null
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 1e12 ? Math.round(value * 1000) : Math.round(value)
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null

    if (isNumericTimestampString(trimmed)) {
      const asNumber = Number(trimmed)
      if (!Number.isFinite(asNumber)) return null
      return asNumber < 1e12 ? Math.round(asNumber * 1000) : Math.round(asNumber)
    }

    const parsed = Date.parse(trimmed)
    return Number.isNaN(parsed) ? null : parsed
  }

  return null
}

const getPresenceEventInfo = (payload = {}) => {
  const candidates = [
    payload.updatedAt,
    payload.updated_at,
    payload.timestamp,
    payload.at,
    payload.lastSeenAt,
    payload.last_seen_at,
    payload.occurredAt,
    payload.eventTime,
    payload.time,
    payload.meta?.timestamp,
    payload.meta?.updatedAt,
    payload.presence?.updatedAt,
    payload.presence?.timestamp,
    payload.data?.updatedAt,
    payload.data?.updated_at,
    payload.data?.timestamp,
    payload.data?.at
  ]

  for (const candidate of candidates) {
    const parsed = parsePresenceTimestamp(candidate)
    if (parsed !== null) {
      return { eventAt: parsed, hasTimestamp: true }
    }
  }

  return { eventAt: Date.now(), hasTimestamp: false }
}

const extractPresenceStatus = (payload = {}) => (
  payload.status ??
  payload.presence?.status ??
  payload.user?.status ??
  payload.data?.status
)

const extractCustomStatus = (payload = {}) => {
  if (payload.customStatus !== undefined) return { hasCustomStatus: true, customStatus: payload.customStatus }
  if (payload.custom_status !== undefined) return { hasCustomStatus: true, customStatus: payload.custom_status }
  if (payload.user?.customStatus !== undefined) return { hasCustomStatus: true, customStatus: payload.user.customStatus }
  if (payload.user?.custom_status !== undefined) return { hasCustomStatus: true, customStatus: payload.user.custom_status }
  if (payload.data?.customStatus !== undefined) return { hasCustomStatus: true, customStatus: payload.data.customStatus }
  if (payload.data?.custom_status !== undefined) return { hasCustomStatus: true, customStatus: payload.data.custom_status }
  return { hasCustomStatus: false, customStatus: null }
}

const normalizePresenceStatus = (status, fallback = null) => {
  if (typeof status !== 'string') return fallback
  const normalized = status.trim().toLowerCase()
  const aliasResolved = PRESENCE_STATUS_ALIASES.get(normalized) || normalized
  return PRESENCE_STATUSES.has(aliasResolved) ? aliasResolved : fallback
}

const normalizeConversationPresence = (items) => {
  if (!Array.isArray(items)) return []

  return items.map(conv => {
    const recipient = conv?.recipient
    if (!recipient) return conv

    const normalizedStatus = normalizePresenceStatus(recipient.status, recipient.status)
    if (normalizedStatus === recipient.status) return conv

    return {
      ...conv,
      recipient: {
        ...recipient,
        status: normalizedStatus
      }
    }
  })
}

const DMList = ({ type, onSelectConversation, selectedConversation, onClose, onOpenSystemInbox }) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { socket, connected, reconnecting, systemUnreadCount } = useSocket()
  const { 
    isDmEncryptionEnabled, 
    getDmEncryptionFullStatus,
    disableDmEncryption 
  } = useE2e()
  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [showNewDM, setShowNewDM] = useState(false)
  const [searchUsers, setSearchUsers] = useState([])
  const [searching, setSearching] = useState(false)
  const [selectedUserIds, setSelectedUserIds] = useState([])
  const [contextMenu, setContextMenu] = useState(null)
  const [mutedDMs, setMutedDMs] = useState({})
  const [e2eeModalConv, setE2eeModalConv] = useState(null)
  const [keyPromptConv, setKeyPromptConv] = useState(null)
  const [dmE2eeStatus, setDmE2eeStatus] = useState({})
  const [lastRealtimeAt, setLastRealtimeAt] = useState(null)
  const [statusNow, setStatusNow] = useState(Date.now())
  const reconnectResyncAtRef = useRef(0)
  const pendingOfflineTimersRef = useRef(new Map())
  const latestPresenceEventAtRef = useRef(new Map())
  const dmItemsRef = useResetScrollOnChange([type, selectedConversation?.id, showNewDM])

  const markRealtimeUpdate = useCallback(() => {
    setLastRealtimeAt(Date.now())
  }, [])

  const formatFreshness = useCallback((timestamp) => {
    if (!timestamp) return t('common.loading', 'Loading')
    const seconds = Math.max(0, Math.floor((statusNow - timestamp) / 1000))
    if (seconds < 5) return t('common.justNow', 'just now')
    if (seconds < 60) return `${seconds}s ago`
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    return `${hours}h ago`
  }, [statusNow, t])

  const loadConversations = useCallback(async (search = '') => {
    try {
      const res = await apiService.getDirectMessages(search)
      setConversations(normalizeConversationPresence(res.data))
      markRealtimeUpdate()
    } catch (err) {
      console.error('Failed to load conversations:', err)
    }
    setLoading(false)
  }, [markRealtimeUpdate])

  useEffect(() => {
    loadConversations()
    loadMuteStatus()
  }, [type, loadConversations])

  useEffect(() => {
    const intervalId = setInterval(() => {
      setStatusNow(Date.now())
    }, 15000)

    return () => clearInterval(intervalId)
  }, [])

  useEffect(() => {
    const timers = pendingOfflineTimersRef.current
    return () => {
      for (const timeoutId of timers.values()) {
        clearTimeout(timeoutId)
      }
      timers.clear()
    }
  }, [])

  const loadMuteStatus = async () => {
    try {
      const res = await apiService.getNotificationSettings()
      const muted = {}
      ;(res.data?.dmMutes || []).forEach(m => {
        if (m.conversationId && (!m.expiresAt || new Date(m.expiresAt) > new Date())) {
          muted[m.conversationId] = true
        }
      })
      setMutedDMs(muted)
    } catch (err) {
      console.error('Failed to load mute status:', err)
    }
  }

  useEffect(() => {
    if (!connected) return
    const now = Date.now()
    if (now - reconnectResyncAtRef.current < 2500) return
    reconnectResyncAtRef.current = now

    loadConversations()
    loadMuteStatus()
  }, [connected])

  useEffect(() => {
    if (!socket || !connected) return

    const handleNewDM = () => {
      markRealtimeUpdate()
      loadConversations()
    }

    socket.on('dm:new', handleNewDM)
    socket.on('dm:created', handleNewDM)
    socket.on('dm:edited', handleNewDM)
    socket.on('dm:deleted', handleNewDM)

    return () => {
      socket.off('dm:new', handleNewDM)
      socket.off('dm:created', handleNewDM)
      socket.off('dm:edited', handleNewDM)
      socket.off('dm:deleted', handleNewDM)
    }
  }, [socket, connected, loadConversations, markRealtimeUpdate])

  useEffect(() => {
    if (!socket || !connected) return
    const timers = pendingOfflineTimersRef.current

    const clearPendingOffline = (userId) => {
      const timeoutId = timers.get(userId)
      if (timeoutId) {
        clearTimeout(timeoutId)
        timers.delete(userId)
      }
    }

    const markEventIfFresh = (userId, payload) => {
      const { eventAt, hasTimestamp } = getPresenceEventInfo(payload)
      const lastEventAt = latestPresenceEventAtRef.current.get(userId) || 0
      if (hasTimestamp && eventAt < lastEventAt) return null
      const monotonicEventAt = hasTimestamp ? eventAt : Math.max(eventAt, lastEventAt + 1)
      latestPresenceEventAtRef.current.set(userId, monotonicEventAt)
      return monotonicEventAt
    }

    const applyStatusToRecipient = (userId, status, customStatus, hasCustomStatus = false) => {
      setConversations(prev => {
        let changed = false
        const next = prev.map(conv => {
          const recipientId = normalizePresenceUserId(conv.recipient?.id)
          if (!recipientId || recipientId !== userId) return conv
          const nextRecipient = { ...conv.recipient }
          let recipientChanged = false

          if (status && nextRecipient.status !== status) {
            nextRecipient.status = status
            recipientChanged = true
          }

          if (hasCustomStatus) {
            const normalizedCustom = customStatus ?? null
            if (nextRecipient.customStatus !== normalizedCustom) {
              nextRecipient.customStatus = normalizedCustom
              recipientChanged = true
            }
          }

          if (!recipientChanged) return conv
          changed = true
          return { ...conv, recipient: nextRecipient }
        })

        return changed ? next : prev
      })
    }

    const handleStatusUpdate = (payload = {}) => {
      const userId = extractPresenceUserId(payload)
      if (!userId) return

      const normalizedStatus = normalizePresenceStatus(extractPresenceStatus(payload))
      const { hasCustomStatus, customStatus } = extractCustomStatus(payload)
      if (!normalizedStatus && !hasCustomStatus) return

      const eventAt = markEventIfFresh(userId, payload)
      if (!eventAt) return

      clearPendingOffline(userId)
      applyStatusToRecipient(userId, normalizedStatus, customStatus, hasCustomStatus)
      markRealtimeUpdate()
    }

    const handleMemberOnline = (payload = {}) => {
      const userId = extractPresenceUserId(payload)
      if (!userId) return

      const normalizedStatus = normalizePresenceStatus(extractPresenceStatus(payload), 'online')
      const { hasCustomStatus, customStatus } = extractCustomStatus(payload)
      const eventAt = markEventIfFresh(userId, payload)
      if (!eventAt) return

      clearPendingOffline(userId)
      applyStatusToRecipient(userId, normalizedStatus, customStatus, hasCustomStatus)
      markRealtimeUpdate()
    }

    const handleMemberOffline = (payload = {}) => {
      const userId = extractPresenceUserId(payload)
      if (!userId) return

      const eventAt = markEventIfFresh(userId, payload)
      if (!eventAt) return

      clearPendingOffline(userId)
      const timeoutId = setTimeout(() => {
        const currentTimeout = timers.get(userId)
        if (currentTimeout !== timeoutId) return
        timers.delete(userId)

        const latestEventAt = latestPresenceEventAtRef.current.get(userId) || 0
        if (latestEventAt > eventAt) return

        applyStatusToRecipient(userId, 'offline')
        markRealtimeUpdate()
      }, OFFLINE_GRACE_MS)

      timers.set(userId, timeoutId)
    }

    const handleDMNotification = () => {
      soundService.dmReceived()
      markRealtimeUpdate()
      loadConversations()
    }

    socket.on('user:status', handleStatusUpdate)
    socket.on('member:online', handleMemberOnline)
    socket.on('member:offline', handleMemberOffline)
    socket.on('dm:notification', handleDMNotification)
    socket.on('dm:new', handleDMNotification)

    return () => {
      socket.off('user:status', handleStatusUpdate)
      socket.off('member:online', handleMemberOnline)
      socket.off('member:offline', handleMemberOffline)
      socket.off('dm:notification', handleDMNotification)
      socket.off('dm:new', handleDMNotification)

      for (const timeoutId of timers.values()) {
        clearTimeout(timeoutId)
      }
      timers.clear()
    }
  }, [socket, connected, loadConversations, markRealtimeUpdate])

  const handleSearchUsers = async (query) => {
    setSearchQuery(query)
    
    // If not in new DM mode, filter existing conversations
    if (!showNewDM) {
      if (query.length >= 2) {
        loadConversations(query)
      } else if (query.length === 0) {
        loadConversations()
      }
      return
    }

    // In new DM mode, search for users to start a conversation with
    if (query.length < 2) {
      setSearchUsers([])
      return
    }

    setSearching(true)
    try {
      const res = await apiService.searchDMUsers(query)
      setSearchUsers(res.data)
      setSelectedUserIds([])
    } catch (err) {
      console.error('Failed to search users:', err)
    }
    setSearching(false)
  }

  const handleStartConversation = async (userId) => {
    try {
      const res = await apiService.createDirectMessage(userId)
      setShowNewDM(false)
      setSearchQuery('')
      setSearchUsers([])
      loadConversations()
      onSelectConversation?.(res.data)
    } catch (err) {
      console.error('Failed to start conversation:', err)
    }
  }

  const toggleSelectedUser = (userId) => {
    setSelectedUserIds(prev => (
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    ))
  }

  const handleCreateSelectedConversation = async () => {
    if (selectedUserIds.length === 0) return
    try {
      let res
      if (selectedUserIds.length === 1) {
        res = await apiService.createDirectMessage(selectedUserIds[0])
      } else {
        const baseName = selectedUserIds
          .map(id => searchUsers.find(u => u.id === id)?.displayName || searchUsers.find(u => u.id === id)?.username)
          .filter(Boolean)
          .slice(0, 3)
          .join(', ')
        res = await apiService.createGroupDirectMessage(selectedUserIds, baseName)
      }
      setShowNewDM(false)
      setSearchQuery('')
      setSearchUsers([])
      setSelectedUserIds([])
      loadConversations()
      onSelectConversation?.(res.data)
    } catch (err) {
      console.error('Failed to start conversation:', err)
    }
  }

  const handleSelectConversation = (conv) => {
    lazyLoadingService.preloadComponents(['DMChat', 'ChatInput', 'FileAttachment'], { idle: true })
    onSelectConversation?.(conv)
  }

  const getStatusColor = (status) => {
    const normalizedStatus = normalizePresenceStatus(status, status)
    switch (normalizedStatus) {
      case 'online': return 'var(--volt-success)'
      case 'idle': return 'var(--volt-warning)'
      case 'dnd': return 'var(--volt-danger)'
      default: return 'var(--volt-text-muted)'
    }
  }

  const filteredConversations = conversations.filter(conv => {
    const q = searchQuery.toLowerCase()
    const title = (conv.title || conv.groupName || '').toLowerCase()
    const recipientMatch =
      (conv.recipient?.username || '').toLowerCase().includes(q) ||
      (conv.recipient?.displayName || '').toLowerCase().includes(q)
    const recipientsMatch = (conv.recipients || []).some(r =>
      (r.username || '').toLowerCase().includes(q) || (r.displayName || '').toLowerCase().includes(q)
    )
    return title.includes(q) || recipientMatch || recipientsMatch
  })

  const syncState = !connected ? 'offline' : reconnecting ? 'reconnecting' : 'live'
  const syncLabel = syncState === 'offline'
    ? t('chat.disconnected', 'Disconnected')
    : syncState === 'reconnecting'
      ? t('chat.reconnecting', 'Reconnecting...')
      : t('chat.connected', 'Connected')
  const syncDetail = loading
    ? t('common.loading', 'Loading')
    : syncState === 'offline'
      ? t('dm.syncOfflineHint', 'Realtime updates paused until the connection returns')
      : syncState === 'reconnecting'
        ? t('dm.syncReconnectingHint', 'Resyncing conversations and unread state')
        : `${t('dm.updated', 'Updated')} ${formatFreshness(lastRealtimeAt)}`

  return (
    <div className="dm-list">
      <div className="dm-header">
        <div className="dm-search">
          <MagnifyingGlassIcon size={16} className="search-icon" />
          <input 
            type="text" 
            placeholder={t('dm.selectDm')}
            className="input"
            value={searchQuery}
            onChange={e => handleSearchUsers(e.target.value)}
          />
        </div>
        <div className={`dm-sync-status ${syncState}`}>
          <div className="dm-sync-pill">
            {syncState === 'reconnecting' ? <ArrowPathIcon size={14} className="spinning" /> : <WifiIcon size={14} />}
            <span>{syncLabel}</span>
          </div>
          <span className="dm-sync-detail">{syncDetail}</span>
        </div>
      </div>

      <div ref={dmItemsRef} className="dm-items">
        <button 
          className={`dm-item nav-item ${location.pathname === '/chat/friends' ? 'active' : ''}`}
          type="button"
          onMouseEnter={() => lazyLoadingService.preloadComponents(['FriendsPage'], { idle: true })}
          onFocus={() => lazyLoadingService.preloadComponents(['FriendsPage'], { idle: true })}
          onClick={() => navigate('/chat/friends')}
        >
          <UsersIcon size={24} />
          <span>{t('friends.title')}</span>
        </button>

        <button
          className={`dm-item nav-item sysmsg-sidebar-entry`}
          type="button"
          onClick={onOpenSystemInbox}
          title={t('system.systemInbox')}
        >
          <div className="sysmsg-sidebar-icon">
            <BellIcon size={18} />
          </div>
          <span>{t('system.systemInbox')}</span>
          {systemUnreadCount > 0 && (
            <span className="sysmsg-sidebar-badge">{systemUnreadCount > 99 ? '99+' : systemUnreadCount}</span>
          )}
        </button>

        <div className="dm-section-header">
          <span>{t('dm.title').toUpperCase()}</span>
          <button className="dm-add-btn" type="button" onClick={() => setShowNewDM(!showNewDM)} title={t('dm.newMessage')}>
            {showNewDM ? <XMarkIcon size={16} /> : <PlusIcon size={16} />}
          </button>
        </div>

        {showNewDM && (
          <div className="new-dm-section">
            <input
              type="text"
              placeholder={t('search.searchPlaceholder')}
              className="input"
              value={searchQuery}
              onChange={e => handleSearchUsers(e.target.value)}
              autoFocus
            />
            {searching && <div className="dm-loading-small">{t('common.search')}</div>}
            {searchUsers.length > 0 && (
              <div className="search-results">
                {searchUsers.map(user => (
                  <button 
                    key={user.id} 
                    className={`search-result-item ${selectedUserIds.includes(user.id) ? 'selected' : ''}`}
                    type="button"
                    onClick={() => toggleSelectedUser(user.id)}
                  >
                    <Avatar
                      src={user.avatar}
                      fallback={user.username}
                      size={32}
                    />
                    <span>{user.displayName || user.username}</span>
                  </button>
                ))}
              </div>
            )}
            {selectedUserIds.length > 0 && (
              <button
                className="dm-create-group-btn"
                type="button"
                onClick={handleCreateSelectedConversation}
              >
                {selectedUserIds.length === 1
                  ? t('dm.newMessage', 'New Message')
                  : `Create Group DM (${selectedUserIds.length})`}
              </button>
            )}
            {searchQuery.length >= 2 && searchUsers.length === 0 && !searching && (
              <div className="no-results">{t('common.noResults')}</div>
            )}
          </div>
        )}

        {loading ? (
              <div className="dm-loading" role="status" aria-live="polite">
                <span className="dm-loading-title">{t('common.loading')}</span>
                <div className="dm-loading-list">
                  {[0, 1, 2, 3].map(index => (
                    <div key={index} className="dm-loading-row">
                      <span className="dm-loading-avatar" />
                      <span className="dm-loading-lines">
                        <span className="dm-loading-line dm-loading-line-primary" />
                        <span className="dm-loading-line dm-loading-line-secondary" />
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="empty-dms">
                {searchQuery ? 'No conversations found' : t('dm.chooseConversation')}
              </div>
            ) : (
              <div className="dm-conversations">
                {filteredConversations.map(conv => {
                    const isGroup = !!conv.isGroup || (conv.recipients?.length > 1)
                    const convTitle = isGroup
                      ? (conv.groupName || conv.title || (conv.recipients || []).map(r => r.displayName || r.username).slice(0, 3).join(', ') || 'Group DM')
                      : (conv.recipient?.displayName || conv.recipient?.username)
                    const convStatus = isGroup
                      ? `${(conv.recipients || []).length} members`
                      : conv.recipient?.customStatus
                    const copyId = isGroup ? conv.id : conv.recipient?.id
                    const unreadCount = Number(conv.unreadCount) || 0
                    return (
                  <div 
                    key={conv.id}
                    className={`dm-conversation ${selectedConversation?.id === conv.id ? 'active' : ''} ${unreadCount > 0 ? 'unread' : ''}`}
                    role="button"
                    tabIndex={0}
                    onMouseEnter={() => lazyLoadingService.preloadComponents(['DMChat', 'ChatInput'], { idle: true })}
                    onFocus={() => lazyLoadingService.preloadComponents(['DMChat', 'ChatInput'], { idle: true })}
                    onClick={() => handleSelectConversation(conv)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        handleSelectConversation(conv)
                      }
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      const isMuted = mutedDMs[conv.id]
                      const e2eeEnabled = isDmEncryptionEnabled(conv.id)
                      const items = [
                        {
                          icon: isMuted ? <BellIcon size={16} /> : <BellSlashIcon size={16} />,
                          label: isMuted ? 'Unmute Notifications' : 'Mute Notifications',
                          onClick: async () => {
                            try {
                              await apiService.muteDm(conv.id, !isMuted)
                              setMutedDMs(prev => ({ ...prev, [conv.id]: !isMuted }))
                            } catch (err) {
                              console.error('Failed to toggle mute:', err)
                            }
                          }
                        },
                        { type: 'separator' },
                        // E2EE Section
                        ...(e2eeEnabled ? [
                          {
                            icon: <Lock size={16} />,
                            label: 'Encryption Enabled',
                            disabled: true,
                            className: 'menu-header'
                          },
                          {
                            icon: <ShieldOff size={16} />,
                            label: 'Disable E2EE',
                            onClick: async () => {
                              try {
                                await disableDmEncryption(conv.id)
                              } catch (err) {
                                console.error('Failed to disable E2EE:', err)
                              }
                            }
                          },
                          {
                            icon: <Key size={16} />,
                            label: 'Enter/Update Key',
                            onClick: () => setKeyPromptConv(conv)
                          }
                        ] : [
                          {
                            icon: <Shield size={16} />,
                            label: 'Enable E2EE',
                            onClick: () => setE2eeModalConv(conv)
                          }
                        ]),
                        { type: 'separator' },
                        {
                          icon: <XMarkIcon size={16} />,
                          label: t('modals.close'),
                          onClick: () => {
                            if (onClose) onClose(conv.id)
                            setConversations(prev => prev.filter(c => c.id !== conv.id))
                          }
                        },
                        { type: 'separator' },
                        {
                          icon: <ClipboardDocumentIcon size={16} />,
                          label: isGroup ? t('common.copy', 'Copy conversation id') : t('account.userId'),
                          onClick: () => copyId && navigator.clipboard.writeText(copyId)
                        },
                      ]
                      setContextMenu({ x: e.clientX, y: e.clientY, items })
                    }}
                  >
                    <div className="dm-avatar-wrapper">
                      <Avatar
                        src={isGroup ? null : conv.recipient?.avatar}
                        fallback={isGroup ? convTitle : conv.recipient?.username}
                        size={32}
                        userId={isGroup ? null : conv.recipient?.id}
                      />
                      {!isGroup && (
                        <span 
                          className="dm-status-dot"
                          style={{ backgroundColor: getStatusColor(conv.recipient?.status) }}
                        />
                      )}
                    </div>
                    <div className="dm-conv-info">
                      <span className="dm-conv-name">
                        {convTitle}
                        {!isGroup && conv.recipient?.guildTag && (
                          <GuildTagBadge
                            tag={conv.recipient.guildTag}
                            serverId={conv.recipient.guildTagServerId}
                            isPrivate={conv.recipient.guildTagPrivate}
                          />
                        )}
                      </span>
                      {convStatus && (
                        <span className="dm-conv-status">{convStatus}</span>
                      )}
                    </div>
                    <div className="dm-conv-meta">
                      {unreadCount > 0 && (
                        <span className="dm-unread-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
                      )}
                      {lastRealtimeAt && unreadCount === 0 && (
                        <span className="dm-updated-badge">{formatFreshness(lastRealtimeAt)}</span>
                      )}
                    </div>
                    <button
                      type="button"
                      className="dm-close-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (onClose) {
                          onClose(conv.id)
                        }
                        setConversations(prev => prev.filter(c => c.id !== conv.id))
                      }}
                    >
                      <XMarkIcon size={14} />
                    </button>
                  </div>
                    )
                })}
              </div>
            )}
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* E2EE Enable Modal */}
      {e2eeModalConv && (
        <E2eeEnableModal
          isOpen={true}
          onClose={() => setE2eeModalConv(null)}
          conversation={e2eeModalConv}
          onEnabled={() => {
            setE2eeModalConv(null)
          }}
        />
      )}

      {/* E2EE Key Prompt Modal */}
      {keyPromptConv && (
        <E2eeKeyPromptModal
          isOpen={true}
          onClose={() => setKeyPromptConv(null)}
          conversation={keyPromptConv}
          onKeyEntered={() => {
            setKeyPromptConv(null)
          }}
        />
      )}
    </div>
  )
}

export default DMList
