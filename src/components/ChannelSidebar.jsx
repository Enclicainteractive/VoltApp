import React, { useState, useEffect, useRef, useCallback } from 'react'
import { ChevronDown, Plus, Pencil, Trash, Cog, Folder, UserPlus, Lock, Mic, Volume2, Hash, Megaphone, MessageSquare, Image, Video } from 'lucide-react'
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
import lazyLoadingService from '../services/lazyLoadingService'
import { useResetScrollOnChange } from '../hooks/useResetScrollOnChange'
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
  const normalizedChannels = React.useMemo(() => (Array.isArray(channels) ? channels : []), [channels])
  
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
  const serverMenuRef = useRef(null)
  const serverDropdownRef = useRef(null)
  const channelListRef = useResetScrollOnChange([server?.id, currentChannelId, selectedVoiceChannelId])

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
  }, [server?.id, categoriesProp, setStoreCategories])

  // Voice channel participants handling
  useEffect(() => {
    if (!socket || !connected) return

    const voiceChannels = normalizedChannels.filter(c => c.type === 'voice')
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
      if (!userId) return
      const cid = data?.channelId
      setSidebarParticipants(prev => {
        if (cid) {
          // Fast path: channelId provided
          const list = prev[cid] || []
          return { ...prev, [cid]: list.filter(p => p.id !== userId) }
        }
        // Slow path: no channelId — remove user from every channel they appear in
        const next = { ...prev }
        let changed = false
        Object.keys(next).forEach(channelId => {
          const list = next[channelId]
          if (list.some(p => p.id === userId)) {
            next[channelId] = list.filter(p => p.id !== userId)
            changed = true
          }
        })
        return changed ? next : prev
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
  }, [socket, connected, normalizedChannels])

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

  useEffect(() => {
    setShowServerMenu(false)
    setContextMenu(null)
  }, [server?.id])

  useEffect(() => {
    if (!showServerMenu) return

    const handlePointerDown = (event) => {
      if (!serverMenuRef.current?.contains(event.target)) {
        setShowServerMenu(false)
      }
    }

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setShowServerMenu(false)
        serverMenuRef.current?.querySelector('.server-header')?.focus()
      }
    }

    document.addEventListener('mousedown', handlePointerDown, true)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown, true)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [showServerMenu])

  // Focus first menu item when server dropdown opens
  useEffect(() => {
    if (!showServerMenu) return
    requestAnimationFrame(() => {
      const firstItem = serverDropdownRef.current?.querySelector('button:not([disabled])')
      firstItem?.focus()
    })
  }, [showServerMenu])

  const openContextMenu = useCallback((x, y, items) => {
    setShowServerMenu(false)
    setContextMenu(null)
    requestAnimationFrame(() => {
      setContextMenu({ x, y, items })
    })
  }, [])

  const openContextMenuForElement = useCallback((target, items) => {
    const rect = target?.getBoundingClientRect?.()
    if (!rect) return
    openContextMenu(rect.left + rect.width / 2, rect.top + Math.min(rect.height - 6, 28), items)
  }, [openContextMenu])

  const toggleServerMenu = useCallback((event) => {
    event?.preventDefault?.()
    event?.stopPropagation?.()
    setContextMenu(null)
    setShowServerMenu((prev) => !prev)
  }, [])

  const handleServerHeaderKeyDown = useCallback((event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      toggleServerMenu(event)
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setContextMenu(null)
      setShowServerMenu(true)
    }
  }, [toggleServerMenu])

  const handleMenuHotkey = useCallback((event, openMenu) => {
    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
      event.preventDefault()
      openMenu()
    }
  }, [])

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

  const prefetchChannelTarget = useCallback((targetType) => {
    lazyLoadingService.preloadRouteChunks(['route:chat'], { idle: true })
    if (targetType === 'voice') {
      lazyLoadingService.preloadComponents(['VoiceChannel', 'VoiceChannelPreview'], { idle: true })
      return
    }
    if (targetType === 'settings') {
      lazyLoadingService.preloadRouteChunks(['route:settings-modal'], { idle: true })
      lazyLoadingService.preloadComponents(['SettingsModal'], { idle: true })
      return
    }
    if (targetType === 'invite') {
      lazyLoadingService.preloadRouteChunks(['route:invite'], { idle: true })
      return
    }
    lazyLoadingService.preloadComponents(['ChatArea', 'MessageList', 'MemberSidebar'], { idle: true })
  }, [])

  const handleChannelClick = (channel, isVoice) => {
    prefetchChannelTarget(isVoice ? 'voice' : 'text')
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
    e?.preventDefault?.()
    e?.stopPropagation()
    prefetchChannelTarget('voice')
    soundService.prime()
    onChannelChange(channel.id, true)
    onVoicePreview?.(channel, true)
  }

  const buildChannelContextMenuItems = (channel) => [
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
          } catch (err) {
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

  const handleChannelContextMenu = (e, channel) => {
    e.preventDefault()
    e.stopPropagation()
    openContextMenu(e.clientX, e.clientY, buildChannelContextMenuItems(channel))
  }

  const handleChannelContextMenuHotkey = (event, channel) => {
    handleMenuHotkey(event, () => {
      openContextMenuForElement(event.currentTarget, buildChannelContextMenuItems(channel))
    })
  }

  const buildCategoryContextMenuItems = (category) => {
    const isUncategorized = category.id === 'uncategorized'
    return [
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
  }

  const handleCategoryContextMenu = (e, category) => {
    e.preventDefault()
    e.stopPropagation()
    openContextMenu(e.clientX, e.clientY, buildCategoryContextMenuItems(category))
  }

  const handleDeleteCategory = async (categoryId) => {
    try {
      await apiService.deleteCategory(categoryId)
      setStoreCategories(categories.filter((category) => category.id !== categoryId))
      onRefreshChannels?.()
    } catch (err) {
      console.error('Failed to delete category:', err)
    }
  }

  const handleCategoryHeaderKeyDown = (event, categoryId, category, isExpanded) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      toggleCategory(categoryId)
      return
    }

    if (event.key === 'ArrowRight' && !isExpanded) {
      event.preventDefault()
      setExpandedCategories((prev) => ({ ...prev, [categoryId]: true }))
      return
    }

    if (event.key === 'ArrowLeft' && isExpanded) {
      event.preventDefault()
      setExpandedCategories((prev) => ({ ...prev, [categoryId]: false }))
      return
    }

    handleMenuHotkey(event, () => {
      openContextMenuForElement(event.currentTarget, buildCategoryContextMenuItems(category))
    })
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

    // Deduplicate channels by id before grouping to prevent React duplicate key warnings
    const seenChannelIds = new Set()
    const uniqueChannels = normalizedChannels.filter(ch => {
      if (seenChannelIds.has(ch.id)) return false
      seenChannelIds.add(ch.id)
      return true
    })

    // Sort channels into groups
    uniqueChannels.forEach(channel => {
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
  const isChannelListLoading = Boolean(server?.id) && !Array.isArray(channels)
  const showChannelListEmptyState = !isChannelListLoading && categoryOrder.length === 0

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
      const participantCount = participants.length
      
      return (
        <div key={channel.id} className="voice-channel-group">
          <button
            type="button"
            className={`channel-item voice ${isConnected ? 'connected' : ''} ${isSelected ? 'selected' : ''} ${hasUnread ? 'unread' : ''}`}
            onClick={() => handleChannelClick(channel, true)}
            onDoubleClick={() => handleChannelDoubleClick(channel, true)}
            onContextMenu={(e) => handleChannelContextMenu(e, channel)}
            onKeyDown={(event) => handleChannelContextMenuHotkey(event, channel)}
            draggable={isAdmin}
            onDragStart={() => setDraggedChannel(channel)}
            onDragEnd={() => {
              setDraggedChannel(null)
              setDragOverCategory(null)
            }}
            title={channel.name}
            aria-label={`${channel.name}${participantCount > 0 ? ` (${participantCount} connected)` : ''}${hasUnread ? ' (unread)' : ''}`}
            aria-current={isSelected ? 'page' : undefined}
          >
            {getChannelIcon(channel)}
            {hasUnread && <span className="channel-unread-indicator" aria-hidden="true" />}
            <span className="channel-name">{channel.name}</span>
            {encryptionEnabled && <LockClosedIcon size={12} className="channel-e2ee-lock" title={t('serverSettings.encryptionEnabled', 'Encrypted')} />}
            {isConnected && (
              <span className="voice-connected-badge" title={t('chat.voiceConnected', 'Voice Connected')}>{t('chat.connected', 'Connected')}</span>
            )}
            {!isConnected && participantCount > 0 && (
              <span className="voice-count-badge" title={t('chat.connected', 'Connected')}>{participantCount}</span>
            )}
            {!isConnected && (
              <span
                className="voice-quick-join-btn"
                role="button"
                tabIndex={0}
                onClick={(e) => handleJoinVoice(channel, e)}
                onMouseDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    handleJoinVoice(channel, e)
                  }
                }}
                title={t('misc.joinVoice', 'Join voice')}
              >
                <Mic size={12} />
                <span>{t('common.join', 'Join')}</span>
              </span>
            )}
            {isAdmin && (
              <span 
                className="channel-settings-btn"
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); setShowChannelSettings(channel) }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    e.stopPropagation()
                    setShowChannelSettings(channel)
                  }
                }}
                title={t('common.settings', 'Settings')}
                aria-label={`${t('common.settings', 'Settings')} ${channel.name}`}
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
        type="button"
        key={channel.id}
        className={`channel-item ${currentChannelId === channel.id ? 'active' : ''} ${hasUnread ? 'unread' : ''}`}
        onClick={() => handleChannelClick(channel, false)}
        onContextMenu={(e) => handleChannelContextMenu(e, channel)}
        onKeyDown={(event) => handleChannelContextMenuHotkey(event, channel)}
        draggable={isAdmin}
        onDragStart={() => setDraggedChannel(channel)}
        onDragEnd={() => {
          setDraggedChannel(null)
          setDragOverCategory(null)
        }}
        title={channel.name}
        aria-label={`${channel.name}${channel.private ? ' (private)' : ''}${hasUnread ? ' (unread)' : ''}`}
        aria-current={currentChannelId === channel.id ? 'page' : undefined}
      >
        {getChannelIcon(channel)}
        {hasUnread && <span className="channel-unread-indicator" aria-hidden="true" />}
        <span className="channel-name">{channel.name}</span>
        {channel.private && <LockClosedIcon size={14} className="channel-lock" />}
        {encryptionEnabled && <LockClosedIcon size={12} className="channel-e2ee-lock" title={t('serverSettings.encryptionEnabled', 'Encrypted')} />}
        {isAdmin && (
          <span 
            className="channel-settings-btn"
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); setShowChannelSettings(channel) }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                e.stopPropagation()
                setShowChannelSettings(channel)
              }
            }}
            title={t('common.settings', 'Settings')}
            aria-label={`${t('common.settings', 'Settings')} ${channel.name}`}
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
      } finally {
        setDraggedChannel(null)
      }
      return
    }
    setDraggedChannel(null)
  }

  const renderLoadingState = () => (
    <div className="channel-list-state loading" role="status" aria-live="polite" aria-label={t('chat.loadingChannels', 'Loading channels')}>
      <p className="channel-list-state-title">{t('chat.loadingChannels', 'Loading channels')}</p>
      <div className="channel-list-skeleton" aria-hidden="true">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={`channel-skeleton-${index}`} className={`channel-skeleton-row${index % 3 === 0 ? ' short' : ''}`}>
            <span className="channel-skeleton-icon" />
            <span className="channel-skeleton-line" />
          </div>
        ))}
      </div>
    </div>
  )

  const renderEmptyState = () => (
    <div className="channel-list-state empty" role="status" aria-live="polite">
      <p className="channel-list-state-title">{t('chat.noChannels', 'No channels')}</p>
      <p className="channel-list-state-copy">
        {isAdmin
          ? t('channel.noChannelsHint', 'Create your first channel from the server menu or the button below.')
          : t('channel.noChannelsAvailable', 'No channels are available yet.')}
      </p>
      {isAdmin && (
        <button
          type="button"
          className="channel-empty-action"
          onClick={() => setShowCreateModal(true)}
        >
          <Plus size={14} />
          <span>{t('channel.createChannel', 'Create Channel')}</span>
        </button>
      )}
    </div>
  )

  return (
    <>
      <div className={`channel-sidebar ${className}`.trim()} style={backgroundUrl ? { backgroundImage: `url(${backgroundUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}}>
      <div ref={serverMenuRef} className="server-menu-wrapper">
          <div
            className="server-header"
            style={{
              background: banner
                ? `linear-gradient(120deg, ${accent}44, ${accent}22), url(${banner}) center/${bannerPosition}`
                : `linear-gradient(120deg, ${accent}22, transparent)`
            }}
            role="button"
            tabIndex={0}
            onClick={toggleServerMenu}
            onMouseEnter={() => prefetchChannelTarget('settings')}
            onFocus={() => prefetchChannelTarget('settings')}
            onKeyDown={handleServerHeaderKeyDown}
            aria-haspopup="true"
            aria-expanded={showServerMenu}
            aria-controls="channel-sidebar-server-menu"
            aria-label={t('serverSettings.serverSettings', 'Server Settings')}
          >
            <div className="server-name-wrap">
              <h2 className="server-name">{server?.name || t('servers.title', 'Server')}</h2>
              {encryptionEnabled && <Lock size={13} className="server-encrypted-lock" title={t('serverSettings.encryptionEnabled', 'Encrypted')} />}
            </div>
            <span className="server-menu-btn" aria-hidden="true">
              <ChevronDown size={20} style={{ transform: showServerMenu ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
            </span>
          </div>

          {showServerMenu && (
            <div
              id="channel-sidebar-server-menu"
              className="server-dropdown"
              role="menu"
              ref={serverDropdownRef}
              tabIndex={-1}
              aria-label={t('serverSettings.serverMenu', 'Server menu')}
              onClick={e => e.stopPropagation()}
              onKeyDown={(e) => {
                const menu = serverDropdownRef.current
                if (!menu) return
                const items = Array.from(menu.querySelectorAll('button:not([disabled])'))
                const idx = items.indexOf(document.activeElement)
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  const next = idx < items.length - 1 ? idx + 1 : 0
                  items[next]?.focus()
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  const prev = idx > 0 ? idx - 1 : items.length - 1
                  items[prev]?.focus()
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  setShowServerMenu(false)
                  serverMenuRef.current?.querySelector('.server-header')?.focus()
                } else if (e.key === 'Tab') {
                  if (idx === items.length - 1 && !e.shiftKey) {
                    e.preventDefault()
                    items[0]?.focus()
                  } else if (idx === 0 && e.shiftKey) {
                    e.preventDefault()
                    items[items.length - 1]?.focus()
                  }
                }
              }}
            >
              <button type="button" role="menuitem" tabIndex={0} onClick={() => { onOpenServerSettings?.(); setShowServerMenu(false) }}>
                <Cog size={16} /> {t('serverSettings.serverSettings', 'Server Settings')}
              </button>
              <button type="button" role="menuitem" tabIndex={0} onClick={() => { setShowCreateModal(true); setShowServerMenu(false) }}>
                <Plus size={16} /> {t('channel.createChannel', 'Create Channel')}
              </button>
              <button type="button" role="menuitem" tabIndex={0} onClick={() => { setShowCreateCategoryModal(true); setShowServerMenu(false) }}>
                <Folder size={16} /> {t('channel.createCategory', 'Create Category')}
              </button>
              <button
                type="button"
                role="menuitem"
                tabIndex={0}
                onMouseEnter={() => prefetchChannelTarget('invite')}
                onFocus={() => prefetchChannelTarget('invite')}
                onClick={() => { onInvite?.(); setShowServerMenu(false) }}
              >
                <UserPlus size={16} /> {t('serverSettings.invitePeople', 'Invite People')}
              </button>
            </div>
          )}
        </div>

        <div ref={channelListRef} className={`channel-list${isChannelListLoading ? ' is-loading' : ''}`}>
          {isChannelListLoading
            ? renderLoadingState()
            : showChannelListEmptyState
              ? renderEmptyState()
              : categoryOrder.map(categoryId => {
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
                    onKeyDown={(event) => handleCategoryHeaderKeyDown(event, categoryId, category, isExpanded)}
                    role="button"
                    tabIndex={0}
                    aria-expanded={isExpanded}
                    aria-label={`${category.name} (${catChannels.length})`}
                    title={category.name}
                  >
                    <ChevronDown
                      size={12} 
                      style={{ transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}
                    />
                    <span className="category-title">{category.name.toUpperCase()}</span>
                    <span className="category-count">{catChannels.length}</span>
                    {isAdmin && (
                      <button 
                        type="button"
                        className="category-add-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          setShowCreateModal(true)
                        }}
                        title={t('channel.createChannel', 'Create Channel')}
                        aria-label={`${t('channel.createChannel', 'Create Channel')} ${category.name}`}
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
                  onKeyDown={(event) => handleCategoryHeaderKeyDown(event, categoryId, category, isExpanded)}
                  role="button"
                  tabIndex={0}
                  aria-expanded={isExpanded}
                  aria-label={`${category.name} (${catChannels.length})`}
                  title={category.name}
                >
                  <ChevronDown 
                    size={12} 
                    style={{ transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}
                  />
                  <span className="category-title">{category.name.toUpperCase()}</span>
                  <span className="category-count">{catChannels.length}</span>
                  {isAdmin && (
                    <button 
                      type="button"
                      className="category-add-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        setShowCreateModal(true)
                      }}
                      title={t('channel.createChannel', 'Create Channel')}
                      aria-label={`${t('channel.createChannel', 'Create Channel')} ${category.name}`}
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
                  type="button"
                  className="voice-panel-btn return"
                  onClick={() => onReturnToVoice?.()}
                  title={t('misc.returnToVoice', 'Return to voice')}
                >
                  {t('common.return', 'Return')}
                </button>
                <button 
                  type="button"
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
              type="button"
              className={`control-btn ${isMuted ? 'active-danger' : ''}`}
              onMouseEnter={() => prefetchChannelTarget('voice')}
              onFocus={() => prefetchChannelTarget('voice')}
              title={isMuted ? t('chat.unmute', 'Unmute') : t('chat.mute', 'Mute')}
              onClick={handleToggleMute}
            >
              {isMuted ? <MicrophoneIcon size={16} /> : <MicrophoneIcon size={16} />}
            </button>
            <button
              type="button"
              className={`control-btn ${isDeafened ? 'active-danger' : ''}`}
              onMouseEnter={() => prefetchChannelTarget('voice')}
              onFocus={() => prefetchChannelTarget('voice')}
              title={isDeafened ? t('chat.undeafen', 'Undeafen') : t('chat.deafen', 'Deafen')}
              onClick={handleToggleDeafen}
            >
              <Volume2 size={16} />
            </button>
            <button
              type="button"
              className="control-btn"
              title={t('misc.userSettings', 'User Settings')}
              onMouseEnter={() => prefetchChannelTarget('settings')}
              onFocus={() => prefetchChannelTarget('settings')}
              onClick={() => onOpenSettings?.()}
            >
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
