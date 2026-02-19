import React, { useState, useEffect } from 'react'
import { Crown, Shield, User, MessageSquare, UserPlus, UserMinus, Ban, Volume2, VolumeX } from 'lucide-react'
import { useSocket } from '../contexts/SocketContext'
import { useAuth } from '../contexts/AuthContext'
import { apiService } from '../services/apiService'
import { getStoredServer } from '../services/serverConfig'
import { preloadHostMetadata, getImageBaseForHostSync } from '../services/hostMetadataService'
import ContextMenu from './ContextMenu'
import Avatar from './Avatar'
import '../assets/styles/MemberSidebar.css'

const MemberSidebar = ({ members, onMemberClick, server, onStartDM, onKick, onBan, onAddFriend, visible = true }) => {
  const { socket, connected } = useSocket()
  const { user: currentUser } = useAuth()

  // Seed the overlay map from the initial members prop so statuses are correct
  // on first render before any socket events arrive.
  const [memberStatuses, setMemberStatuses] = useState(() => {
    const seed = {}
    for (const m of (members || [])) {
      if (m.id) seed[m.id] = { status: m.status || 'offline', customStatus: m.customStatus || null }
    }
    return seed
  })
  const [extraBotMembers, setExtraBotMembers] = useState([])
  const [contextMenu, setContextMenu] = useState(null)
  
  const currentServer = getStoredServer()
  const apiUrl = currentServer?.apiUrl || ''
  const imageApiUrl = currentServer?.imageApiUrl || apiUrl

  const getMemberRoles = (member) => {
    if (!member) return []
    if (Array.isArray(member.roles)) return member.roles
    return member.role ? [member.role] : []
  }

  const resolveRole = (roleId) => (server?.roles || []).find(r => r.id === roleId)

  const getPrimaryRole = (member) => {
    const roles = getMemberRoles(member)
    const resolved = roles.map(resolveRole).filter(Boolean)
    if (!resolved.length) return null
    return resolved.sort((a, b) => (a.position ?? 0) - (b.position ?? 0))[0]
  }

  const hasPermission = (permission) => {
    if (server?.ownerId === currentUser?.id) return true
    const currentMember = server?.members?.find(m => m.id === currentUser?.id)
    const roleIds = getMemberRoles(currentMember)
    const roles = roleIds.map(resolveRole).filter(Boolean)
    const permSet = new Set(['view_channels', 'send_messages', 'connect', 'speak', 'use_voice_activity'])
    roles.forEach(r => r.permissions?.forEach(p => permSet.add(p)))
    return permSet.has('admin') || permSet.has(permission)
  }

  const isAdmin = hasPermission('ban_members')
  const isModerator = hasPermission('kick_members')

  // Re-seed the status overlay whenever the members list itself changes
  // (e.g. when the user navigates to a different server).
  useEffect(() => {
    setMemberStatuses(prev => {
      const next = { ...prev }
      for (const m of (members || [])) {
        if (m.id && !next[m.id]) {
          next[m.id] = { status: m.status || 'offline', customStatus: m.customStatus || null }
        }
      }
      return next
    })
    // Warm the host metadata cache for any federated members
    const hosts = (members || []).filter(m => !m.isBot && m.host).map(m => m.host)
    if (hosts.length > 0) preloadHostMetadata(hosts)
  }, [members])

  useEffect(() => {
    if (!socket || !connected) return

    // Realtime status changes (online/idle/dnd/offline + customStatus)
    const handleStatusUpdate = ({ userId, status, customStatus }) => {
      setMemberStatuses(prev => ({
        ...prev,
        [userId]: {
          // Preserve existing customStatus if the event doesn't include it
          ...(prev[userId] || {}),
          status,
          ...(customStatus !== undefined ? { customStatus } : {})
        }
      }))
    }

    // Server emits member:offline when a user's socket disconnects
    const handleMemberOffline = ({ userId }) => {
      if (!userId) return
      setMemberStatuses(prev => ({
        ...prev,
        [userId]: { ...(prev[userId] || {}), status: 'offline' }
      }))
    }

    const handleBotAdded = ({ serverId, bot }) => {
      if (serverId !== server?.id) return
      setExtraBotMembers(prev => {
        if (prev.some(b => b.id === bot.id)) return prev
        return [...prev, {
          id: bot.id,
          username: bot.name,
          avatar: bot.avatar || null,
          status: bot.status || 'offline',
          roles: [],
          role: null,
          isBot: true
        }]
      })
    }

    const handleBotRemoved = ({ serverId, botId }) => {
      if (serverId !== server?.id) return
      setExtraBotMembers(prev => prev.filter(b => b.id !== botId))
    }

    socket.on('user:status', handleStatusUpdate)
    socket.on('member:offline', handleMemberOffline)
    socket.on('bot:added', handleBotAdded)
    socket.on('bot:removed', handleBotRemoved)

    return () => {
      socket.off('user:status', handleStatusUpdate)
      socket.off('member:offline', handleMemberOffline)
      socket.off('bot:added', handleBotAdded)
      socket.off('bot:removed', handleBotRemoved)
    }
  }, [socket, connected, server?.id])

  const getMemberStatus = (member) => {
    return memberStatuses[member.id]?.status || member.status || 'offline'
  }

  const getMemberCustomStatus = (member) => {
    const live = memberStatuses[member.id]
    if (live && live.customStatus !== undefined) return live.customStatus || null
    return member.customStatus || null
  }

  const handleMemberContextMenu = (e, member) => {
    e.preventDefault()
    const isOwner = member.id === server?.ownerId
    const isSelf = member.id === currentUser?.id
    const primaryRole = getPrimaryRole(member)
    
    const items = [
      {
        icon: <User size={16} />,
        label: 'Profile',
        onClick: () => onMemberClick?.(member.id)
      },
      {
        icon: <MessageSquare size={16} />,
        label: 'Message',
        onClick: () => onStartDM?.(member.id),
        disabled: isSelf
      },
      { type: 'separator' },
      {
        icon: <UserPlus size={16} />,
        label: 'Add Friend',
        onClick: () => onAddFriend?.(member.id),
        disabled: isSelf
      },
      ...(!isSelf ? [
        {
          icon: <Ban size={16} />,
          label: 'Block User',
          onClick: () => {
            if (confirm('Block this user? They will be removed from servers and cannot interact with you.')) {
              apiService.blockUser(member.id).then(() => {
                onKick?.(member.id)
              }).catch(err => console.error('Failed to block user:', err))
            }
          },
          danger: true
        }
      ] : []),
      { type: 'separator' },
      ...(isModerator && !isSelf && !isOwner ? [
        {
          icon: <VolumeX size={16} />,
          label: 'Mute',
          onClick: () => {},
          disabled: true
        },
        {
          icon: <UserMinus size={16} />,
          label: 'Kick',
          onClick: () => onKick?.(member.id),
          danger: true
        }
      ] : []),
      ...(isAdmin && !isSelf && !isOwner ? [
        {
          icon: <Ban size={16} />,
          label: 'Ban',
          onClick: () => onBan?.(member.id),
          danger: true
        }
      ] : [])
    ]
    
    setContextMenu({ x: e.clientX, y: e.clientY, items })
  }
  const getRoleIcon = (member) => {
    if (member.id === server?.ownerId) {
      return <Crown size={14} className="role-icon owner" />
    }
    const primary = getPrimaryRole(member)
    if (!primary) return null
    return <Shield size={14} className="role-icon" style={{ color: primary.color }} />
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'online':
        return 'online'
      case 'idle':
        return 'idle'
      case 'dnd':
        return 'dnd'
      default:
        return 'offline'
    }
  }

  // Merge bots added dynamically (via socket) that aren't already in the members list
  const allMembers = [
    ...members,
    ...extraBotMembers.filter(b => !members.some(m => m.id === b.id))
  ]

  const onlineMembers = allMembers.filter(m => {
    const status = getMemberStatus(m)
    return status === 'online' || status === 'idle' || status === 'dnd'
  })
  const offlineMembers = allMembers.filter(m => {
    const status = getMemberStatus(m)
    return status === 'offline' || status === 'invisible'
  })

  if (!visible) return null

  return (
    <div className="member-sidebar">
      <div className="member-list">
        {onlineMembers.length > 0 && (
          <div className="member-section">
            <div className="section-header">
              ONLINE — {onlineMembers.length}
            </div>
            {onlineMembers.map(member => {
              const customStatus = getMemberCustomStatus(member)
              const status = getMemberStatus(member)
              return (
                <div 
                  key={member.id} 
                  className="member-item"
                  onClick={() => onMemberClick?.(member.id)}
                  onContextMenu={(e) => handleMemberContextMenu(e, member)}
                >
                  <div className="member-avatar">
                    <Avatar 
                      src={member.avatar || `${getImageBaseForHostSync(member.host) || imageApiUrl}/api/images/users/${member.id}/profile`}
                      alt={member.username}
                      fallback={member.username}
                      size={32}
                      className="avatar-img"
                    />
                    <div className={`status-badge ${getStatusColor(status)}`}></div>
                  </div>
                  <div className="member-info">
                    <div className="member-name">
                      {!member.isBot && getRoleIcon(member)}
                      <span>{member.username}</span>
                      {member.isBot && <span className="member-bot-badge">Bot</span>}
                    </div>
                    {!member.isBot && member.host && (
                      <div className="member-federated-id">
                        @{member.username}:{member.host}
                      </div>
                    )}
                    {customStatus && (
                      <div className={`member-status-text ${getStatusColor(status)}`}>
                        {customStatus}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {offlineMembers.length > 0 && (
          <div className="member-section">
            <div className="section-header">
              OFFLINE — {offlineMembers.length}
            </div>
            {offlineMembers.map(member => {
              const customStatus = getMemberCustomStatus(member)
              const status = getMemberStatus(member)
              return (
                <div 
                  key={member.id} 
                  className="member-item offline"
                  onClick={() => onMemberClick?.(member.id)}
                  onContextMenu={(e) => handleMemberContextMenu(e, member)}
                >
                  <div className="member-avatar">
                    <Avatar 
                      src={member.avatar || `${getImageBaseForHostSync(member.host) || imageApiUrl}/api/images/users/${member.id}/profile`}
                      alt={member.username}
                      fallback={member.username}
                      size={32}
                      className="avatar-img"
                    />
                    <div className={`status-badge ${getStatusColor(status)}`}></div>
                  </div>
                  <div className="member-info">
                    <div className="member-name">
                      {!member.isBot && getRoleIcon(member)}
                      <span>{member.username}</span>
                      {member.isBot && <span className="member-bot-badge">Bot</span>}
                    </div>
                    {!member.isBot && member.host && (
                      <div className="member-federated-id">
                        @{member.username}:{member.host}
                      </div>
                    )}
                    {customStatus && (
                      <div className={`member-status-text ${getStatusColor(status)}`}>
                        {customStatus}
                      </div>
                    )}
                  </div>
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
    </div>
  )
}

export default MemberSidebar
