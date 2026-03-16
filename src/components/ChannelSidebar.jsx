import React, { useState, useEffect } from 'react'
import { ChevronDown, ChevronRight, Settings2, Plus, Pencil, Trash, Cog, Folder, UserPlus, Lock, Mic, Volume2, Hash, Megaphone, MessageSquare, Image, Video } from 'lucide-react'
import { ClipboardDocumentIcon, LockClosedIcon, MicrophoneIcon } from '@heroicons/react/24/outline'
import { useAuth } from '../contexts/AuthContext'
import { useSocket } from '../contexts/SocketContext'
import { useE2e } from '../contexts/E2eContext'
import { soundService } from '../services/soundService'
import { apiService } from '../services/apiService'
import { useAppStore } from '../store/useAppStore'
import { useTranslation } from '../hooks/useTranslation'
import CreateChannelModal from './modals/CreateChannelModal'
import CreateCategoryModal from './modals/CreateCategoryModal'
import ChannelSettingsModal from './modals/ChannelSettingsModal'
import CategorySettingsModal from './modals/CategorySettingsModal'
import ContextMenu from './ContextMenu'
import StatusSelector from './StatusSelector'
import Avatar from './Avatar'
import '../assets/styles/ChannelSidebar.css'

const ChannelSidebar = ({ 
  className = '',
  server, 
  channels, 
  categories: categoriesProp, 
  currentChannelId, 
  selectedVoiceChannelId, 
  onChannelChange, 
  onCreateChannel, 
  onOpenServerSettings, 
  onOpenSettings, 
  onVoicePreview, 
  activeVoiceChannel, 
  voiceParticipantsByChannel = {}, 
  onDeleteChannel, 
  onRefreshChannels, 
  onInvite, 
  leavingVoiceChannelId, 
  onLeaveVoice, 
  onReturnToVoice, 
  isMuted = false, 
  isDeafened = false, 
  onToggleMute, 
  onToggleDeafen,
  unreadChannelIds = []
}) => {
  const { user } = useAuth()
  const { socket, connected, serverUpdates } = useSocket()
  const { isEncryptionEnabled, getServerEncryptionStatus } = useE2e()
  const { setCategories: setStoreCategories, selfPresence, setSelfPresence } = useAppStore()
  const { t } = useTranslation()
  
  // Check if server encryption is enabled
  const encryptionEnabled = server?.id ? isEncryptionEnabled(server.id) : false
  
  // Check encryption status when server changes
  useEffect(() => {
    if (server?.id) {
      console.log('[ChannelSidebar] Checking encryption status for server:', server.id)
      getServerEncryptionStatus(server.id)
    }
  }, [server?.id, getServerEncryptionStatus])
  
  // Combine categories from props with real-time updates
  const categories = React.useMemo(() => {
    const baseCategories = categoriesProp || []
    const serverUpdate = serverUpdates[server?.id]
    if (Array.isArray(serverUpdate?.categories)) {
      return [...serverUpdate.categories].sort((a, b) => (a.position || 0) - (b.position || 0))
    }
    return baseCategories
  }, [categoriesProp, serverUpdates, server?.id])
  
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showCreateCategoryModal, setShowCreateCategoryModal] = useState(false)
  const [showChannelSettings, setShowChannelSettings] = useState(null)
  const [showCategorySettings, setShowCategorySettings] = useState(null)
  const [expandedCategories, setExpandedCategories] = useState({})
  const [showServerMenu, setShowServerMenu] = useState(false)
  const [contextMenu, setContextMenu] = useState(null)
  const [sidebarParticipants, setSidebarParticipants] = useState({})
  const [draggedChannel, setDraggedChannel] = useState(null)
  const [dragOverCategory, setDragOverCategory] = useState(null)

  // Fetch categories when server changes (only if not provided via props)
  useEffect(() => {
    if (!server?.id) return
    
    // Skip fetching if categories are provided via props (even if empty array)
    if (categoriesProp !== undefined) {
      const initialExpanded = {}
      categoriesProp.forEach(cat => {
        initialExpanded[cat.id] = true
      })
      initialExpanded['uncategorized'] = true
      setExpandedCategories(initialExpanded)
      return
    }
    
    const fetchCategories = async () => {
      try {
        const response = await apiService.getCategories(server.id)
        setStoreCategories(response.data || [])
        
        // Initialize expanded state for all categories
        const initialExpanded = {}
        response.data?.forEach(cat => {
          initialExpanded[cat.id] = true
        })
        initialExpanded['uncategorized'] = true
        setExpandedCategories(initialExpanded)
      } catch (err) {
        console.error('Failed to fetch categories:', err)
        setStoreCategories([])
      }
    }
    
    fetchCategories()
  }, [server?.id, categoriesProp])

  // Voice channel participants handling
  useEffect(() => {
    if (!socket || !connected) return

    const voiceChannels = channels.filter(c => c.type === 'voice')
    voiceChannels.forEach(ch => {
      socket.emit('voice:get-participants', { channelId: ch.id })
    })

    const handleParticipants = (data) => {
      setSidebarParticipants(prev => ({
        ...prev,
        [data.channelId]: data.participants || []
      }))
    }

    const handleUserJoined = (userInfo) => {
      const cid = userInfo.channelId
      if (!cid) return
      setSidebarParticipants(prev => {
        const list = prev[cid] || []
        if (list.find(p => p.id === userInfo.id)) return prev
        return { ...prev, [cid]: [...list, userInfo] }
      })
    }

    const handleUserLeft = (data) => {
      const userId = data?.userId || data?.id
      const cid = data?.channelId
      if (!userId || !cid) return
      setSidebarParticipants(prev => {
        const list = prev[cid] || []
        return { ...prev, [cid]: list.filter(p => p.id !== userId) }
      })
    }

    const handleUserUpdated = (data) => {
      const cid = data?.channelId
      if (!cid) return
      setSidebarParticipants(prev => {
        const list = prev[cid] || []
        return { ...prev, [cid]: list.map(p => p.id === data.userId ? { ...p, ...data } : p) }
      })
    }

    socket.on('voice:participants', handleParticipants)
    socket.on('voice:user-joined', handleUserJoined)
    socket.on('voice:user-left', handleUserLeft)
    socket.on('voice:user-updated', handleUserUpdated)

    return () => {
      socket.off('voice:participants', handleParticipants)
      socket.off('voice:user-joined', handleUserJoined)
      socket.off('voice:user-left', handleUserLeft)
      socket.off('voice:user-updated', handleUserUpdated)
    }
  }, [socket, connected, channels])

  useEffect(() => {
    if (!leavingVoiceChannelId || !socket || !connected) return
    setSidebarParticipants(prev => ({ ...prev, [leavingVoiceChannelId]: [] }))
    const refetch = () => {
      socket.emit('voice:get-participants', { channelId: leavingVoiceChannelId })
    }
    const timer = setTimeout(refetch, 600)
    return () => clearTimeout(timer)
  }, [leavingVoiceChannelId, socket, connected])

  useEffect(() => {
    if (!user) return
    setSelfPresence({
      status: user.status || 'online',
      customStatus: user.customStatus || ''
    })
  }, [setSelfPresence, user])

  const getMergedParticipants = (channelId) => {
    if (activeVoiceChannel?.id === channelId && voiceParticipantsByChannel[channelId]) {
      return voiceParticipantsByChannel[channelId]
    }
    return sidebarParticipants[channelId] || []
  }

  const getMemberRoles = (memberId) => {
    const member = server?.members?.find(m => m.id === memberId)
    if (!member) return []
    if (Array.isArray(member.roles)) return member.roles
    return member.role ? [member.role] : []
  }

  const hasPermission = (permission) => {
    if (server?.ownerId === user?.id) return true
    const roleIds = getMemberRoles(user?.id)
    const roles = (server?.roles || []).filter(r => roleIds.includes(r.id))
    const permSet = new Set(['view_channels', 'send_messages', 'connect', 'speak', 'use_voice_activity'])
    roles.forEach(r => r.permissions?.forEach(p => permSet.add(p)))
    return permSet.has('admin') || permSet.has(permission)
  }

  const isAdmin = hasPermission('manage_channels')
  const accent = server?.themeColor || 'var(--volt-primary)'
  const banner = server?.bannerUrl
  const bannerPosition = server?.bannerPosition || 'cover'
  const backgroundUrl = server?.backgroundUrl

  const handleToggleMute = () => {
    const newMuted = !isMuted
    onToggleMute?.()
    socket?.emit('voice:mute', { muted: newMuted })
    if (newMuted) {
      soundService.mute()
    } else {
      soundService.unmute()
    }
  }

  const handleToggleDeafen = () => {
    const newDeafened = !isDeafened
    onToggleDeafen?.()
    socket?.emit('voice:deafen', { deafened: newDeafened })
    if (newDeafened) {
      soundService.deafen()
    } else {
      soundService.undeafen()
    }
  }

  const toggleCategory = (categoryId) => {
    setExpandedCategories(prev => ({ ...prev, [categoryId]: !prev[categoryId] }))
  }

  const handleChannelClick = (channel, isVoice) => {
    if (isVoice) {
      onVoicePreview?.(channel)
      onChannelChange(channel.id, true)
    } else {
      onChannelChange(channel.id, false)
    }
  }

  const handleChannelDoubleClick = (channel, isVoice) => {
    if (isVoice) {
      soundService.prime()
      onChannelChange(channel.id, true)
      onVoicePreview?.(channel, true)
    }
  }

  const handleJoinVoice = (channel, e) => {
    e?.stopPropagation()
    soundService.prime()
    onChannelChange(channel.id, true)
    onVoicePreview?.(channel, true)
  }

  const handleChannelContextMenu = (e, channel) => {
    e.preventDefault()
    e.stopPropagation()
    
    const items = [
      {
        icon: <Pencil size={16} />,
        label: 'Edit Channel',
        onClick: () => setShowChannelSettings(channel),
        disabled: !isAdmin
      },
      {
        icon: <ClipboardDocumentIcon size={16} />,
        label: 'Copy Channel ID',
        onClick: async () => {
          try {
            await navigator.clipboard.writeText(channel.id)
            console.log('[ChannelSidebar] Copied channel ID:', channel.id)
          } catch (err) {
            console.error('[ChannelSidebar] Failed to copy channel ID:', err)
            const textArea = document.createElement('textarea')
            textArea.value = channel.id
            document.body.appendChild(textArea)
            textArea.select()
            document.execCommand('copy')
            document.body.removeChild(textArea)
          }
        }
      },
      { type: 'separator' },
      {
        icon: <Trash size={16} />,
        label: 'Delete Channel',
        onClick: () => {
          if (confirm(`Delete #${channel.name}?`)) {
            onDeleteChannel?.(channel)
          }
        },
        danger: true,
        disabled: !isAdmin
      },
      {
        label: 'Refresh Channels',
        onClick: () => onRefreshChannels?.()
      }
    ]
    
    // Force close any existing menu first, then open new one
    setContextMenu(null)
    requestAnimationFrame(() => {
      setContextMenu({ x: e.clientX, y: e.clientY, items })
    })
  }

  const handleCategoryContextMenu = (e, category) => {
    e.preventDefault()
    e.stopPropagation()
    
    const isUncategorized = category.id === 'uncategorized'
    
    const items = [
      {
        icon: <Pencil size={16} />,
        label: 'Edit Category',
        onClick: () => setShowCategorySettings(category),
        disabled: !isAdmin || isUncategorized
      },
      {
        icon: <Plus size={16} />,
        label: 'Create Channel',
        onClick: () => setShowCreateModal(true),
        disabled: !isAdmin
      },
      { type: 'separator' },
      {
        icon: <Trash size={16} />,
        label: 'Delete Category',
        onClick: () => {
          if (confirm(`Delete category "${category.name}"? Channels will be moved to "No Category".`)) {
            handleDeleteCategory(category.id)
          }
        },
        danger: true,
        disabled: !isAdmin || isUncategorized
      }
    ]
    
    // Force close any existing menu first, then open new one
    setContextMenu(null)
    requestAnimationFrame(() => {
      setContextMenu({ x: e.clientX, y: e.clientY, items })
    })
  }

  const handleDeleteCategory = async (categoryId) => {
    try {
      await apiService.deleteCategory(categoryId)
      setCategories(categories.filter(c => c.id !== categoryId))
    } catch (err) {
      console.error('Failed to delete category:', err)
    }
  }

  // Group channels by category
  const channelsByCategory = () => {
    const grouped = {}
    
    // Initialize with all categories
    categories.forEach(cat => {
      grouped[cat.id] = { category: cat, channels: [] }
    })
    
    // Add uncategorized group
    grouped['uncategorized'] = { category: { id: 'uncategorized', name: 'No Category' }, channels: [] }
    
    // Sort channels into groups
    channels.forEach(channel => {
      // categoryId can be null, undefined, or a category ID
      const catId = channel.categoryId != null ? channel.categoryId : 'uncategorized'
      if (grouped[catId]) {
        grouped[catId].channels.push(channel)
      } else {
        // Category doesn't exist anymore, put in uncategorized
        grouped['uncategorized'].channels.push(channel)
      }
    })
    
    // Sort categories by position
    const sortedCategoryIds = [...categories]
      .sort((a, b) => (a.position || 0) - (b.position || 0))
      .map(c => c.id)
    
    // Only add uncategorized if there are channels in it and no category with that id exists
    const uncategorizedChannels = grouped['uncategorized']?.channels || []
    if (uncategorizedChannels.length > 0 && !sortedCategoryIds.includes('uncategorized')) {
      sortedCategoryIds.push('uncategorized')
    }
    
    return { grouped, order: sortedCategoryIds }
  }

  const { grouped: groupedChannels, order: categoryOrder } = channelsByCategory()

  const getChannelIcon = (channel) => {
    const type = channel.type
    switch (type) {
      case 'voice':
        return <Volume2 size={20} />
      case 'video':
        return <Video size={20} />
      case 'announcement':
        return <Megaphone size={20} />
      case 'forum':
        return <MessageSquare size={20} />
      case 'media':
        return <Image size={20} />
      default:
        return <Hash size={20} />
    }
  }

  // Render channel item
  const renderChannel = (channel) => {
    const isVoice = channel.type === 'voice'
    const isVideo = channel.type === 'video'
    const hasUnread = unreadChannelIds.includes(channel.id)
    
    if (isVoice || isVideo) {
      const participants = getMergedParticipants(channel.id)
      const isConnected = activeVoiceChannel?.id === channel.id
      const isSelected = selectedVoiceChannelId === channel.id
      
      return (
        <div key={channel.id} className="voice-channel-group">
          <button
            className={`channel-item voice ${isConnected ? 'connected' : ''} ${isSelected ? 'selected' : ''} ${hasUnread ? 'unread' : ''}`}
            onClick={() => handleChannelClick(channel, true)}
            onDoubleClick={() => handleChannelDoubleClick(channel, true)}
            onContextMenu={(e) => handleChannelContextMenu(e, channel)}
            draggable={isAdmin}
            onDragStart={() => setDraggedChannel(channel)}
            onDragEnd={() => {
              setDraggedChannel(null)
              setDragOverCategory(null)
            }}
          >
            {getChannelIcon(channel)}
            <span className="channel-name">{channel.name}</span>
            {encryptionEnabled && <LockClosedIcon size={12} className="channel-e2ee-lock" title={t('serverSettings.encryptionEnabled', 'Encrypted')} />}
            {isConnected && (
              <span className="voice-connected-badge" title={t('chat.voiceConnected', 'Voice Connected')}>{t('chat.connected', 'Connected')}</span>
            )}
            {!isConnected && participants.length > 0 && (
              <span className="voice-count-badge">{participants.length}</span>
            )}
            {isAdmin && (
              <span 
                className="channel-settings-btn"
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); setShowChannelSettings(channel) }}
              >
<Cog size={14} />
              </span>
            )}
          </button>
          {participants.length > 0 && (
            <div className={`voice-participant-list${selectedVoiceChannelId === channel.id ? ' expanded' : ''}`}>
              {participants.map(p => (
                <div key={p.id} className="voice-participant-row">
                  <div className="voice-participant-avatar-wrap">
                    <Avatar src={p.avatar} fallback={p.username} size={20} userId={p.id} />
                    {(p.muted) && (
                      <span className="voice-participant-muted-dot" title={t('chat.muted', 'Muted')}>
                        <MicrophoneIcon size={8} />
                      </span>
                    )}
                  </div>
                  <span className={`voice-participant-name ${p.muted ? 'muted' : ''}`}>
                    {p.username}
                    {p.id === user?.id ? ` (${t('common.you', 'You')})` : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )
    }
    
    return (
      <button
        key={channel.id}
        className={`channel-item ${currentChannelId === channel.id ? 'active' : ''} ${hasUnread ? 'unread' : ''}`}
        onClick={() => handleChannelClick(channel, false)}
        onContextMenu={(e) => handleChannelContextMenu(e, channel)}
        draggable={isAdmin}
        onDragStart={() => setDraggedChannel(channel)}
        onDragEnd={() => {
          setDraggedChannel(null)
          setDragOverCategory(null)
        }}
      >
        {getChannelIcon(channel)}
        <span className="channel-name">{channel.name}</span>
        {channel.private && <LockClosedIcon size={14} className="channel-lock" />}
        {encryptionEnabled && <LockClosedIcon size={12} className="channel-e2ee-lock" title={t('serverSettings.encryptionEnabled', 'Encrypted')} />}
        {isAdmin && (
          <span 
            className="channel-settings-btn"
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); setShowChannelSettings(channel) }}
          >
            <Cog size={14} />
          </span>
        )}
      </button>
    )
  }

  // Handle drag and drop for channels
  const handleDragOver = (e, categoryId) => {
    e.preventDefault()
    setDragOverCategory(categoryId)
  }

  const handleDrop = async (e, targetCategoryId) => {
    e.preventDefault()
    setDragOverCategory(null)
    
    if (!draggedChannel) return
    
    const actualCategoryId = targetCategoryId === 'uncategorized' ? null : targetCategoryId
    
    if (draggedChannel.categoryId !== actualCategoryId) {
      try {
        await apiService.updateChannel(draggedChannel.id, { categoryId: actualCategoryId })
        onRefreshChannels?.()
      } catch (err) {
        console.error('Failed to move channel:', err)
      }
    }
  }

  return (
    <>
      <div className={`channel-sidebar ${className}`.trim()} style={backgroundUrl ? { backgroundImage: `url(${backgroundUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}}>
        <div 
          className="server-header" 
          style={{ 
            background: banner 
              ? `linear-gradient(120deg, ${accent}44, ${accent}22), url(${banner}) center/${bannerPosition}`
              : `linear-gradient(120deg, ${accent}22, transparent)`
          }} 
          onClick={() => setShowServerMenu(!showServerMenu)}
        >
          <h2 className="server-name">{server?.name || t('servers.title', 'Server')}</h2>
          <button className="server-menu-btn" title={t('serverSettings.serverSettings', 'Server Settings')}>
            <ChevronDown size={20} style={{ transform: showServerMenu ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
          </button>
        </div>
        
        {showServerMenu && (
          <div className="server-dropdown" onClick={e => e.stopPropagation()}>
            <button onClick={() => { onOpenServerSettings?.(); setShowServerMenu(false) }}>
              <Cog size={16} /> {t('serverSettings.serverSettings', 'Server Settings')}
            </button>
            <button onClick={() => { setShowCreateModal(true); setShowServerMenu(false) }}>
              <Plus size={16} /> {t('channel.createChannel', 'Create Channel')}
            </button>
            <button onClick={() => { setShowCreateCategoryModal(true); setShowServerMenu(false) }}>
              <Folder size={16} /> {t('channel.createCategory', 'Create Category')}
            </button>
            <button onClick={() => { onInvite?.(); setShowServerMenu(false) }}>
              <UserPlus size={16} /> {t('serverSettings.invitePeople', 'Invite People')}
            </button>
          </div>
        )}

        <div className="channel-list">
          {categoryOrder.map(categoryId => {
            const group = groupedChannels[categoryId]
            if (!group) return null
            
            const { category, channels: catChannels } = group
            const isExpanded = expandedCategories[categoryId] !== false
            const isDragOver = dragOverCategory === categoryId
            
            if (catChannels.length === 0 && categoryId !== 'uncategorized') {
              return (
                <div 
                  key={categoryId} 
                  className={`channel-category empty ${isDragOver ? 'drag-over' : ''}`}
                  onDragOver={(e) => handleDragOver(e, categoryId)}
                  onDrop={(e) => handleDrop(e, categoryId)}
                  onContextMenu={(e) => handleCategoryContextMenu(e, category)}
                >
                  <div 
                    className="category-header"
                    onClick={() => toggleCategory(categoryId)}
                    role="button"
                    tabIndex={0}
                  >
<ChevronDown
                      size={12} 
                      style={{ transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}
                    />
                    <span>{category.name.toUpperCase()}</span>
                    {isAdmin && (
                      <button 
                        className="category-add-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          setShowCreateModal(true)
                        }}
                        title={t('channel.createChannel', 'Create Channel')}
                      >
<Plus size={16} />
                      </button>
                    )}
                  </div>
                </div>
              )
            }
            
            return (
              <div 
                key={categoryId} 
                className={`channel-category ${isDragOver ? 'drag-over' : ''}`}
                onDragOver={(e) => handleDragOver(e, categoryId)}
                onDrop={(e) => handleDrop(e, categoryId)}
                onContextMenu={(e) => handleCategoryContextMenu(e, category)}
              >
                <div 
                  className="category-header"
                  onClick={() => toggleCategory(categoryId)}
                  role="button"
                  tabIndex={0}
                >
                  <ChevronDown 
                    size={12} 
                    style={{ transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}
                  />
                  <span>{category.name.toUpperCase()}</span>
                  {isAdmin && (
                    <button 
                      className="category-add-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        setShowCreateModal(true)
                      }}
                      title={t('channel.createChannel', 'Create Channel')}
                    >
                      <Plus size={16} />
                    </button>
                  )}
                </div>
                
                {isExpanded && (
                  <div className="channel-items">
                    {catChannels.length > 0 ? (
                      catChannels.map(channel => renderChannel(channel))
                    ) : (
                      <div className="no-channels">{t('chat.noChannels', 'No channels')}</div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Voice Channel Panel */}
        {activeVoiceChannel && (
          <div className="voice-panel">
            <div className="voice-panel-header">
              <div className="voice-panel-info">
                <div className="voice-panel-details">
                  <div className="voice-panel-channel">{activeVoiceChannel.name}</div>
                  <div className="voice-panel-count">
                    {(voiceParticipantsByChannel[activeVoiceChannel.id] || []).length} {t('chat.connected', 'connected')}
                  </div>
                </div>
              </div>
              <div className="voice-panel-actions">
                <button 
                  className="voice-panel-btn return"
                  onClick={() => onReturnToVoice?.()}
                  title={t('misc.returnToVoice', 'Return to voice')}
                >
                  {t('common.return', 'Return')}
                </button>
                <button 
                  className="voice-panel-btn leave"
                  onClick={() => onLeaveVoice?.()}
                  title={t('misc.leaveVoice', 'Leave voice')}
                >
                  {t('common.leave', 'Leave')}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="user-panel">
          <div className="user-panel-main">
            <div className="user-avatar-wrapper">
              <Avatar
                src={user?.avatar}
                alt={user?.username}
                fallback={user?.username || user?.email}
                size={36}
                className="user-avatar"
              />
              <span
                className="user-status-dot"
                style={{
                  backgroundColor: selfPresence.status === 'online' ? 'var(--volt-success)' :
                    selfPresence.status === 'idle' ? 'var(--volt-warning)' :
                    selfPresence.status === 'dnd' ? 'var(--volt-danger)' : '#6b7280'
                }}
              />
            </div>
            <div className="user-details">
              <div className="user-name">{user?.username || user?.email || t('common.user', 'User')}</div>
              <div className="user-details-row">
                <StatusSelector
                  currentStatus={selfPresence.status}
                  customStatus={selfPresence.customStatus}
                  onStatusChange={setSelfPresence}
                />
              </div>
            </div>
          </div>
          <div className="user-controls">
            <button
              className={`control-btn ${isMuted ? 'active-danger' : ''}`}
              title={isMuted ? t('chat.unmute', 'Unmute') : t('chat.mute', 'Mute')}
              onClick={handleToggleMute}
            >
              {isMuted ? <MicrophoneIcon size={16} /> : <MicrophoneIcon size={16} />}
            </button>
            <button
              className={`control-btn ${isDeafened ? 'active-danger' : ''}`}
              title={isDeafened ? t('chat.undeafen', 'Undeafen') : t('chat.deafen', 'Deafen')}
              onClick={handleToggleDeafen}
            >
              <Volume2 size={16} />
            </button>
            <button className="control-btn" title={t('misc.userSettings', 'User Settings')} onClick={() => onOpenSettings?.()}>
              <Cog size={16} />
            </button>
          </div>
        </div>
      </div>

      {showCreateModal && (
        <CreateChannelModal
          serverId={server?.id}
          categories={categories}
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false)
            onCreateChannel()
          }}
        />
      )}

      {showCreateCategoryModal && (
        <CreateCategoryModal
          serverId={server?.id}
          onClose={() => setShowCreateCategoryModal(false)}
          onSuccess={() => {
            setShowCreateCategoryModal(false)
            onRefreshChannels?.()
          }}
        />
      )}

      {showChannelSettings && (
        <ChannelSettingsModal
          channel={showChannelSettings}
          server={server}
          onClose={() => setShowChannelSettings(null)}
          onUpdate={() => {
            setShowChannelSettings(null)
            onCreateChannel()
          }}
          onDelete={() => {
            setShowChannelSettings(null)
            onCreateChannel()
          }}
        />
      )}

      {showCategorySettings && (
        <CategorySettingsModal
          category={showCategorySettings}
          onClose={() => setShowCategorySettings(null)}
          onUpdate={() => {
            setShowCategorySettings(null)
            onRefreshChannels?.()
          }}
          onDelete={() => {
            setShowCategorySettings(null)
            onRefreshChannels?.()
          }}
        />
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  )
}

export default ChannelSidebar
