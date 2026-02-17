import React, { useState, useRef } from 'react'
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

const ChannelSidebar = ({ server, channels, currentChannelId, onChannelChange, onCreateChannel, onOpenServerSettings, onOpenSettings, onVoicePreview, activeVoiceChannel, onDeleteChannel, onRefreshChannels, onInvite, isMuted, isDeafened, onToggleMute, onToggleDeafen }) => {
  const { user, logout } = useAuth()
  const { socket } = useSocket()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showChannelSettings, setShowChannelSettings] = useState(null)
  const [expandedCategories, setExpandedCategories] = useState({ text: true, voice: true })
  const [showServerMenu, setShowServerMenu] = useState(false)
  const [userStatus, setUserStatus] = useState({ status: 'online', customStatus: '' })
  const [contextMenu, setContextMenu] = useState(null)
  const clickTimeoutRef = useRef(null)

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
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current)
        clickTimeoutRef.current = null
        onChannelChange(channel.id, true)
      } else {
        clickTimeoutRef.current = setTimeout(() => {
          clickTimeoutRef.current = null
          onVoicePreview?.(channel)
        }, 250)
      }
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
                {voiceChannels.map(channel => (
                  <button
                    key={channel.id}
                    className={`channel-item voice ${activeVoiceChannel?.id === channel.id ? 'connected' : ''}`}
                    onClick={() => handleChannelClick(channel, true)}
                    onContextMenu={(e) => handleChannelContextMenu(e, channel)}
                  >
                    <Volume2 size={20} />
                    <span className="channel-name">{channel.name}</span>
                    {activeVoiceChannel?.id === channel.id && (
                      <span className="voice-connected-badge">Connected</span>
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
                ))}
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
