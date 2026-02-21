import React, { useState, useEffect } from 'react'
import { Users, Plus, X, Search, Copy, Trash2, Bell } from 'lucide-react'
import { useTranslation } from '../hooks/useTranslation'
import { useNavigate, useLocation } from 'react-router-dom'
import { apiService } from '../services/apiService'
import { useSocket } from '../contexts/SocketContext'
import { soundService } from '../services/soundService'
import Avatar from './Avatar'
import ContextMenu from './ContextMenu'
import '../assets/styles/DMList.css'
import '../assets/styles/SystemMessagePanel.css'

const DMList = ({ type, onSelectConversation, selectedConversation, onClose, onOpenSystemInbox }) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { socket, connected, systemUnreadCount } = useSocket()
  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [showNewDM, setShowNewDM] = useState(false)
  const [searchUsers, setSearchUsers] = useState([])
  const [searching, setSearching] = useState(false)
  const [selectedUserIds, setSelectedUserIds] = useState([])
  const [contextMenu, setContextMenu] = useState(null)

  useEffect(() => {
    loadConversations()
  }, [type])

  useEffect(() => {
    if (!socket || !connected) return

    const handleNewDM = (data) => {
      loadConversations()
    }

    socket.on('dm:new', handleNewDM)
    socket.on('dm:created', handleNewDM)

    return () => {
      socket.off('dm:new', handleNewDM)
      socket.off('dm:created', handleNewDM)
    }
  }, [socket, connected])

  useEffect(() => {
    if (!socket || !connected) return

    const handleStatusUpdate = ({ userId, status, customStatus }) => {
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

    const handleDMNotification = (data) => {
      soundService.dmReceived()
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
  }, [socket, connected])

  const loadConversations = async (search = '') => {
    try {
      const res = await apiService.getDirectMessages(search)
      setConversations(res.data)
    } catch (err) {
      console.error('Failed to load conversations:', err)
    }
    setLoading(false)
  }

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

  return (
    <div className="dm-list">
      <div className="dm-header">
        <div className="dm-search">
          <Search size={16} className="search-icon" />
          <input 
            type="text" 
            placeholder={t('dm.selectDm')}
            className="input"
            value={searchQuery}
            onChange={e => handleSearchUsers(e.target.value)}
          />
        </div>
      </div>

      <div className="dm-items">
        <button 
          className={`dm-item nav-item ${location.pathname === '/chat/friends' ? 'active' : ''}`}
          onClick={() => navigate('/chat/friends')}
        >
          <Users size={24} />
          <span>{t('friends.title')}</span>
        </button>

        <button
          className={`dm-item nav-item sysmsg-sidebar-entry`}
          onClick={onOpenSystemInbox}
          title={t('system.systemInbox')}
        >
          <div className="sysmsg-sidebar-icon">
            <Bell size={18} />
          </div>
          <span>{t('system.systemInbox')}</span>
          {systemUnreadCount > 0 && (
            <span className="sysmsg-sidebar-badge">{systemUnreadCount > 99 ? '99+' : systemUnreadCount}</span>
          )}
        </button>

        <div className="dm-section-header">
          <span>{t('dm.title').toUpperCase()}</span>
          <button className="dm-add-btn" onClick={() => setShowNewDM(!showNewDM)} title={t('dm.newMessage')}>
            {showNewDM ? <X size={16} /> : <Plus size={16} />}
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
                    return (
                  <button 
                    key={conv.id}
                    className={`dm-conversation ${selectedConversation?.id === conv.id ? 'active' : ''}`}
                    onClick={() => handleSelectConversation(conv)}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      const items = [
                        {
                          icon: <X size={16} />,
                          label: t('modals.close'),
                          onClick: () => {
                            if (onClose) onClose(conv.id)
                            setConversations(prev => prev.filter(c => c.id !== conv.id))
                          }
                        },
                        { type: 'separator' },
                        {
                          icon: <Copy size={16} />,
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
                    <button 
                      className="dm-close-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (onClose) {
                          onClose(conv.id)
                        }
                        setConversations(prev => prev.filter(c => c.id !== conv.id))
                      }}
                    >
                      <X size={14} />
                    </button>
                  </button>
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
    </div>
  )
}

export default DMList
