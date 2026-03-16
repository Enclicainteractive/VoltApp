import React, { useState, useEffect, useCallback } from 'react'
import { UsersIcon, PlusIcon, XMarkIcon, MagnifyingGlassIcon, ClipboardDocumentIcon, BellIcon, BellSlashIcon, ArrowPathIcon, WifiIcon } from '@heroicons/react/24/outline'
import { Lock, Shield, ShieldOff, Key } from 'lucide-react'
import { useTranslation } from '../hooks/useTranslation'
import { useNavigate, useLocation } from 'react-router-dom'
import { apiService } from '../services/apiService'
import { useSocket } from '../contexts/SocketContext'
import { useE2e } from '../contexts/E2eContext'
import { soundService } from '../services/soundService'
import Avatar from './Avatar'
import ContextMenu from './ContextMenu'
import E2eeEnableModal from './E2eeEnableModal'
import E2eeKeyPromptModal from './E2eeKeyPromptModal'
import '../assets/styles/DMList.css'
import '../assets/styles/SystemMessagePanel.css'

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
      setConversations(res.data)
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

    const handleStatusUpdate = ({ userId, status, customStatus }) => {
      markRealtimeUpdate()
      setConversations(prev => prev.map(conv => {
        if (conv.recipient?.id === userId) {
          return {
            ...conv,
            recipient: { ...conv.recipient, status, customStatus }
          }
        }
        return conv
      }))
    }

    const handleDMNotification = () => {
      soundService.dmReceived()
      markRealtimeUpdate()
      loadConversations()
    }

    socket.on('user:status', handleStatusUpdate)
    socket.on('dm:notification', handleDMNotification)
    socket.on('dm:new', handleDMNotification)

    return () => {
      socket.off('user:status', handleStatusUpdate)
      socket.off('dm:notification', handleDMNotification)
      socket.off('dm:new', handleDMNotification)
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
    onSelectConversation?.(conv)
  }

  const getStatusColor = (status) => {
    switch (status) {
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

      <div className="dm-items">
        <button 
          className={`dm-item nav-item ${location.pathname === '/chat/friends' ? 'active' : ''}`}
          onClick={() => navigate('/chat/friends')}
        >
          <UsersIcon size={24} />
          <span>{t('friends.title')}</span>
        </button>

        <button
          className={`dm-item nav-item sysmsg-sidebar-entry`}
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
          <button className="dm-add-btn" onClick={() => setShowNewDM(!showNewDM)} title={t('dm.newMessage')}>
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
              <div className="dm-loading">{t('common.loading')}</div>
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
