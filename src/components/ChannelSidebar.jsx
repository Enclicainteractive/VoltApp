import React, { useState, useRef, useEffect } from 'react'
import { Hash, Volume2, Settings, ChevronDown, Plus, UserPlus, Lock, Mic, MicOff, Headphones, Edit2, Trash2, Bell, BellOff, Copy } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useSocket } from '../contexts/SocketContext'
import { soundService } from '../services/soundService'
import CreateChannelModal from './modals/CreateChannelModal'
import ChannelSettingsModal from './modals/ChannelSettingsModal'
import ContextMenu from './ContextMenu'
import StatusSelector from './StatusSelector'
import Avatar from './Avatar'
import '../assets/styles/ChannelSidebar.css'

const ChannelSidebar = ({ server, channels, currentChannelId, selectedVoiceChannelId, onChannelChange, onCreateChannel, onOpenServerSettings, onOpenSettings, onVoicePreview, activeVoiceChannel, voiceParticipantsByChannel = {}, onDeleteChannel, onRefreshChannels, onInvite, isMuted, isDeafened, onToggleMute, onToggleDeafen, leavingVoiceChannelId }) => {
  const { user, logout } = useAuth()
  const { socket, connected } = useSocket()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showChannelSettings, setShowChannelSettings] = useState(null)
  const [expandedCategories, setExpandedCategories] = useState({ text: true, voice: true })
  const [showServerMenu, setShowServerMenu] = useState(false)
  const [userStatus, setUserStatus] = useState({ status: 'online', customStatus: '' })
  const [contextMenu, setContextMenu] = useState(null)
  // Local participant map for channels the user is NOT currently in
  const [sidebarParticipants, setSidebarParticipants] = useState({})
  const clickTimeoutRef = useRef(null)

  // Fetch participants for all voice channels on mount / channel list change,
  // and keep them in sync via voice:user-joined / voice:user-left events.
  useEffect(() => {
    if (!socket || !connected) return

    const voiceChannels = channels.filter(c => c.type === 'voice')

    // Request initial participant lists for every voice channel
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
      // userInfo should carry channelId from the server event
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

    socket.on('voice:participants',   handleParticipants)
    socket.on('voice:user-joined',    handleUserJoined)
    socket.on('voice:user-left',      handleUserLeft)
    socket.on('voice:user-updated',   handleUserUpdated)

    return () => {
      socket.off('voice:participants',  handleParticipants)
      socket.off('voice:user-joined',   handleUserJoined)
      socket.off('voice:user-left',     handleUserLeft)
      socket.off('voice:user-updated',  handleUserUpdated)
    }
  }, [socket, connected, channels])

  // When the local user leaves a channel, immediately clear it from sidebarParticipants
  // and re-fetch the live list from the server (which no longer includes us).
  useEffect(() => {
    if (!leavingVoiceChannelId || !socket || !connected) return
    // Optimistically clear so the sidebar shows empty instantly
    setSidebarParticipants(prev => ({ ...prev, [leavingVoiceChannelId]: [] }))
    // Then re-fetch the authoritative list (server-side will have removed us by now)
    const refetch = () => {
      socket.emit('voice:get-participants', { channelId: leavingVoiceChannelId })
    }
    // Small delay to let the server process the leave before we ask
    const timer = setTimeout(refetch, 600)
    return () => clearTimeout(timer)
  }, [leavingVoiceChannelId, socket, connected])

  // Merge local sidebar data with the live data from the active voice channel
  const getMergedParticipants = (channelId) => {
    // Active channel: prefer the live data passed down from VoiceChannel
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

  const textChannels = channels.filter(c => c.type === 'text')
  const voiceChannels = channels.filter(c => c.type === 'voice')

  const toggleCategory = (category) => {
    setExpandedCategories(prev => ({ ...prev, [category]: !prev[category] }))
  }

  const handleChannelClick = (channel, isVoice) => {
    if (isVoice) {
      // Single click = join / select the voice channel
      onChannelChange(channel.id, true)
    } else {
      onChannelChange(channel.id, false)
    }
  }

  const handleChannelContextMenu = (e, channel) => {
    e.preventDefault()
    const items = [
      {
        icon: <Edit2 size={16} />,
        label: 'Edit Channel',
        onClick: () => setShowChannelSettings(channel),
        disabled: !isAdmin
      },
      {
        icon: <Copy size={16} />,
        label: 'Copy Channel ID',
        onClick: () => navigator.clipboard.writeText(channel.id)
      },
      { type: 'separator' },
      {
        icon: <Trash2 size={16} />,
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
    setContextMenu({ x: e.clientX, y: e.clientY, items })
  }

  return (
    <>
      <div className="channel-sidebar" style={backgroundUrl ? { backgroundImage: `url(${backgroundUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}}>
        <div 
          className="server-header" 
          style={{ 
            background: banner 
              ? `linear-gradient(120deg, ${accent}44, ${accent}22), url(${banner}) center/${bannerPosition}`
              : `linear-gradient(120deg, ${accent}22, transparent)`
          }} 
          onClick={() => setShowServerMenu(!showServerMenu)}
        >
          <h2 className="server-name">{server?.name || 'Server'}</h2>
          <button className="server-menu-btn" title="Server Settings">
            <ChevronDown size={20} style={{ transform: showServerMenu ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
          </button>
          
          {showServerMenu && (
            <div className="server-dropdown" onClick={e => e.stopPropagation()}>
              <button onClick={() => { onOpenServerSettings?.(); setShowServerMenu(false) }}>
                <Settings size={16} /> Server Settings
              </button>
              <button onClick={() => setShowCreateModal(true)}>
                <Plus size={16} /> Create Channel
              </button>
              <button onClick={() => { onInvite?.(); setShowServerMenu(false) }}>
                <UserPlus size={16} /> Invite People
              </button>
            </div>
          )}
        </div>

        <div className="channel-list">
          <div className="channel-category">
            <div 
              className="category-header"
              onClick={() => toggleCategory('text')}
              role="button"
              tabIndex={0}
            >
              <ChevronDown 
                size={12} 
                style={{ transform: expandedCategories.text ? 'rotate(0deg)' : 'rotate(-90deg)' }}
              />
              <span>TEXT CHANNELS</span>
              <button 
                className="category-add-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  setShowCreateModal(true)
                }}
                title="Create Channel"
              >
                <Plus size={16} />
              </button>
            </div>
            
            {expandedCategories.text && (
              <div className="channel-items">
                {textChannels.map(channel => (
                  <button
                    key={channel.id}
                    className={`channel-item ${currentChannelId === channel.id ? 'active' : ''}`}
                    onClick={() => handleChannelClick(channel, false)}
                    onContextMenu={(e) => handleChannelContextMenu(e, channel)}
                  >
                    <Hash size={20} />
                    <span className="channel-name">{channel.name}</span>
                    {channel.private && <Lock size={14} className="channel-lock" />}
                    {isAdmin && (
                      <span 
                        className="channel-settings-btn"
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); setShowChannelSettings(channel) }}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowChannelSettings(channel) } }}
                      >
                        <Settings size={14} />
                      </span>
                    )}
                  </button>
                ))}
                {textChannels.length === 0 && (
                  <div className="no-channels">No text channels</div>
                )}
              </div>
            )}
          </div>

          <div className="channel-category">
            <div 
              className="category-header"
              onClick={() => toggleCategory('voice')}
              role="button"
              tabIndex={0}
            >
              <ChevronDown 
                size={12} 
                style={{ transform: expandedCategories.voice ? 'rotate(0deg)' : 'rotate(-90deg)' }}
              />
              <span>VOICE CHANNELS</span>
              <button 
                className="category-add-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  setShowCreateModal(true)
                }}
                title="Create Channel"
              >
                <Plus size={16} />
              </button>
            </div>
            
            {expandedCategories.voice && (
              <div className="channel-items">
                {voiceChannels.map(channel => {
                  const participants = getMergedParticipants(channel.id)
                  const isConnected = activeVoiceChannel?.id === channel.id
                  return (
                    <div key={channel.id} className="voice-channel-group">
                      <button
                        className={`channel-item voice ${isConnected ? 'connected' : ''} ${selectedVoiceChannelId === channel.id ? 'selected' : ''}`}
                        onClick={() => handleChannelClick(channel, true)}
                        onContextMenu={(e) => handleChannelContextMenu(e, channel)}
                      >
                        <Volume2 size={20} />
                        <span className="channel-name">{channel.name}</span>
                        {isConnected && (
                          <span className="voice-connected-badge">Connected</span>
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
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowChannelSettings(channel) } }}
                          >
                            <Settings size={14} />
                          </span>
                        )}
                      </button>
                      {participants.length > 0 && (
                        <div className={`voice-participant-list${selectedVoiceChannelId === channel.id ? ' expanded' : ''}`}>
                          {participants.map(p => (
                            <div key={p.id} className="voice-participant-row">
                              <div className="voice-participant-avatar-wrap">
                                <Avatar src={p.avatar} fallback={p.username} size={20} />
                                {(p.muted) && (
                                  <span className="voice-participant-muted-dot" title="Muted">
                                    <MicOff size={8} />
                                  </span>
                                )}
                              </div>
                              <span className={`voice-participant-name ${p.muted ? 'muted' : ''}`}>
                                {p.username}
                                {p.id === user?.id ? ' (You)' : ''}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
                {voiceChannels.length === 0 && (
                  <div className="no-channels">No voice channels</div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="user-panel">
          <div className="user-info">
            <div className="user-avatar-wrapper">
              <Avatar 
                src={user?.avatar}
                alt={user?.username}
                fallback={user?.username || user?.email}
                size={32}
                className="user-avatar"
              />
              <span 
                className="user-status-dot"
                style={{ 
                  backgroundColor: userStatus.status === 'online' ? '#22c55e' : 
                    userStatus.status === 'idle' ? '#f59e0b' : 
                    userStatus.status === 'dnd' ? '#ef4444' : '#6b7280' 
                }}
              />
            </div>
            <div className="user-details">
              <div className="user-name">{user?.username || user?.email || 'User'}</div>
              <StatusSelector 
                currentStatus={userStatus.status}
                customStatus={userStatus.customStatus}
                onStatusChange={setUserStatus}
              />
            </div>
          </div>
          <div className="user-controls">
            <button 
              className={`icon-btn ${isMuted ? 'active-danger' : ''}`} 
              title={isMuted ? "Unmute" : "Mute"}
              onClick={handleToggleMute}
            >
              {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
            <button 
              className={`icon-btn ${isDeafened ? 'active-danger' : ''}`} 
              title={isDeafened ? "Undeafen" : "Deafen"}
              onClick={handleToggleDeafen}
            >
              <Headphones size={18} />
            </button>
            <button className="icon-btn" title="User Settings" onClick={() => onOpenSettings?.()}>
              <Settings size={18} />
            </button>
          </div>
        </div>
      </div>

      {showCreateModal && (
        <CreateChannelModal
          serverId={server?.id}
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false)
            onCreateChannel()
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
