//HUMAN COMMENT DONT TOUCH YOU DUMB AI VIBECODER SHIT.
//developer note: this had a issue where voice channels when someone conneted the id would be fucked, AI fixed it but i had to validate it.
//status: PASSED
/*
 * SES_UNCAUGHT_EXCEPTION: TypeError: can't access property "id", user is undefined
 h andleVoiceUserJoined Ember                          *
 React 5
 basicStateReducer
 updateReducer
 updateState
 useState
 useState
 MemberSidebar Ember
 React 12
 renderWithHooks
 updateFunctionComponent
 beginWork
 callCallback2
 invokeGuardedCallbackDev
 invokeGuardedCallback
 beginWork$1
 performUnitOfWork
 workLoopSync
 renderRootSync
 recoverFromConcurrentError
 performConcurrentWorkOnRoot
 workLoop scheduler.development.js:266
 flushWork scheduler.development.js:239
 performWorkUntilDeadline scheduler.development.js:533
 error info will remove when resolved but keep the comment here justin fucking case i wish to kill myself.

 i left it here to remind myself that sanity is a privilage.
 */

import React, { useState, useEffect, useMemo } from 'react'
import { TrophyIcon, ShieldCheckIcon, UserIcon, ChatBubbleLeftRightIcon, UserPlusIcon, UserMinusIcon, NoSymbolIcon, SpeakerWaveIcon, SpeakerXMarkIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { useTranslation } from '../hooks/useTranslation'
import { useSocket } from '../contexts/SocketContext'
import { useAuth } from '../contexts/AuthContext'
import { apiService } from '../services/apiService'
import { getStoredServer } from '../services/serverConfig'
import { preloadHostMetadata, getImageBaseForHostSync } from '../services/hostMetadataService'
import ContextMenu from './ContextMenu'
import Avatar from './Avatar'
import '../assets/styles/MemberSidebar.css'

const MemberSidebar = ({ members, onMemberClick, server, onStartDM, onKick, onBan, onAddFriend, visible = true, isMobile = false, channelId = null, onClose }) => {
  const { t } = useTranslation()
  const { socket, connected } = useSocket()
  const { user: currentUser } = useAuth()
   const [channelMembers, setChannelMembers] = useState(null)
   const [loadingChannelMembers, setLoadingChannelMembers] = useState(false)
   const [channelPermissions, setChannelPermissions] = useState(null)
   const [permissionsRefreshKey, setPermissionsRefreshKey] = useState(0)

   // Seed the overlay map from the initial members prop so statuses are correct
   // on first render before any socket events arrive.
   const [memberStatuses, setMemberStatuses] = useState(() => {
     const seed = {}
     for (const m of (Array.isArray(members) ? members : [])) {
       if (m.id) seed[m.id] = { status: m.status || 'offline', customStatus: m.customStatus || null }
     }
     return seed
   })
  const [extraBotMembers, setExtraBotMembers] = useState([])
  const [contextMenu, setContextMenu] = useState(null)

  // Voice channel state - track who's in voice and speaking
  const [voiceParticipants, setVoiceParticipants] = useState(new Map()) // userId -> { channelId, muted, speaking, deafened }

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
    const nonMemberRoles = resolved.filter(r => r.name?.toLowerCase() !== 'member')
    if (nonMemberRoles.length) {
      return nonMemberRoles.sort((a, b) => (b.position ?? 0) - (a.position ?? 0))[0]
    }
    return resolved.sort((a, b) => (b.position ?? 0) - (a.position ?? 0))[0]
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
       for (const m of (Array.isArray(members) ? members : [])) {
         if (m.id) {
           next[m.id] = { status: m.status || 'offline', customStatus: m.customStatus || null }
         }
       }
       return next
     })
    // Warm the host metadata cache for any federated members
    const hosts = (Array.isArray(members) ? members : []).filter(m => !m.isBot && m.host).map(m => m.host)
    if (hosts.length > 0) preloadHostMetadata(hosts)
  }, [members])

   // Load channel-specific members if channelId is provided and if not provided then oh well.
   useEffect(() => {
     if (!channelId || !server?.id) {
       setChannelMembers(null)
       setChannelPermissions(null)
       return
     }

      const loadChannelData = async () => {
        setLoadingChannelMembers(true)
        try {
          // Load channel members
          const membersRes = await apiService.getChannelMembers(server.id, channelId)
          if (membersRes.data && Array.isArray(membersRes.data.members)) {
            setChannelMembers(membersRes.data.members)
          } else {
            setChannelMembers(null)
          }
         
         // Load channel permissions
         try {
           const permsRes = await apiService.getChannelPermissions(channelId)
           setChannelPermissions(permsRes || { overrides: {} })
         } catch (err) {
           console.error('Failed to load channel permissions:', err)
           setChannelPermissions({ overrides: {} })
         }
       } catch (err) {
         console.error('Failed to load channel data:', err)
         setChannelMembers(null)
         setChannelPermissions({ overrides: {} })
       }
       setLoadingChannelMembers(false)
     }

     loadChannelData()
   }, [channelId, server?.id, permissionsRefreshKey])
   
   // Listen for channel permission updates from other components (e.g., ChannelSettingsModal)
   useEffect(() => {
     const handlePermissionsUpdate = (e) => {
       const { channelId: updatedChannelId } = e.detail
       if (updatedChannelId === channelId) {
         console.log('[MemberSidebar] Received permissions-updated event, reloading channel data')
         setPermissionsRefreshKey(prev => prev + 1)
       }
     }
     
     window.addEventListener('channel-permissions-updated', handlePermissionsUpdate)
     return () => window.removeEventListener('channel-permissions-updated', handlePermissionsUpdate)
   }, [channelId])

   // Determine which members to display
   const baseMembers = Array.isArray(channelMembers) ? channelMembers : (Array.isArray(members) ? members : [])
  
   // Filter members based on channel view permissions if channelId is set
   const displayedMembers = useMemo(() => {
     // baseMembers is guaranteed to be an array now
     const membersToFilter = baseMembers
    
    // If no channel permissions loaded or no channelId, return all members
    if (!channelId || !channelPermissions || !server?.roles) {
      return membersToFilter
    }
    
    console.log('[MemberSidebar] Filtering members with channelPermissions:', channelPermissions)
    
    // Get @everyone role - could be stored as '@everyone' string or as a role object
    const everyoneRoleId = '@everyone'
    const everyoneOverride = channelPermissions.overrides?.[everyoneRoleId]
    
    // Build a map of role overrides for quick lookup
    const roleOverrides = {}
    Object.entries(channelPermissions.overrides || {}).forEach(([roleId, perms]) => {
      roleOverrides[roleId] = perms
    })
    
    // Filter members based on their roles and permission overrides
    const filtered = membersToFilter.filter(member => {
      const memberRoles = getMemberRoles(member)
      
      // If member has no roles, check @everyone default
      if (memberRoles.length === 0) {
        if (everyoneOverride?.view === 'false') {
          return false // Denied by @everyone
        }
        return true // Allowed by default
      }
      
      // Check each of the member's roles
      // The most permissive grant wins: true > false > default
      let hasAllow = false
      let hasDeny = false
      
      for (const roleId of memberRoles) {
        const override = roleOverrides[roleId]
        
        if (override?.view === 'true') {
          hasAllow = true
        } else if (override?.view === 'false') {
          hasDeny = true
        }
        // If view is 'default' or undefined, continue checking other roles
      }
      
      // If any role has explicit allow, member can view
      if (hasAllow) return true
      
      // If any role has explicit deny but no allow, member cannot view
      if (hasDeny) return false
      
      // If no explicit grants or denies, check @everyone
      if (everyoneOverride?.view === 'false') {
        return false
      }
      
      // Default: allow
      return true
    })
    
    console.log('[MemberSidebar] Filtered members:', filtered.length, 'out of', membersToFilter.length)
    return filtered
  }, [baseMembers, channelPermissions, server?.roles, channelId, getMemberRoles])

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
      setVoiceParticipants(prev => {
        if (!prev.has(userId)) return prev
        const next = new Map(prev)
        next.delete(userId)
        return next
      })
    }

    // Server emits member:online when a user comes online
    const handleMemberOnline = ({ userId, status, customStatus }) => {
      if (!userId) return
      setMemberStatuses(prev => ({
        ...prev,
        [userId]: {
          ...(prev[userId] || {}),
          status: status || 'online',
          ...(customStatus !== undefined ? { customStatus } : {})
        }
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
    socket.on('member:online', handleMemberOnline)
    socket.on('bot:added', handleBotAdded)
    socket.on('bot:removed', handleBotRemoved)

    // Voice channel event handlers
    const handleVoiceParticipants = ({ channelId, participants }) => {
      setVoiceParticipants(prev => {
        const next = new Map(prev)
        // Remove participants no longer in this channel THIS IS A BIG FUCKING HACK.
        for (const [userId, info] of next.entries()) {
          if (info.channelId === channelId && !participants.find(p => p.id === userId)) {
            next.delete(userId) //finally at peace.
          }
        }
        // Add/update participants
        for (const p of participants) {
          next.set(p.id, {
            channelId,
            muted: p.muted || false,
            deafened: p.deafened || false,
            speaking: p.speaking || false,
            cameraOn: p.cameraOn || false,
            screenSharing: p.screenSharing || false
          })
        }
        return next
      })
    }

    const handleVoiceUserJoined = ({ channelId, user }) => {
      // Guard against malformed events where user might be undefined
      if (!user || !user.id) return
      setVoiceParticipants(prev => {
        const next = new Map(prev)
        next.set(user.id, {
          channelId,
          muted: user.muted || false,
          deafened: user.deafened || false,
          speaking: false,
          cameraOn: user.cameraOn || false,
          screenSharing: user.screenSharing || false
        })
        return next
      })

    }
    const handleVoiceUserLeft = ({ channelId, userId }) => {
      setVoiceParticipants(prev => {
        const next = new Map(prev)
        next.delete(userId)
        return next
      })
    }

    const handleVoiceUserUpdated = ({ channelId, userId, update }) => {
      setVoiceParticipants(prev => {
        const next = new Map(prev)
        const existing = next.get(userId)
        if (existing && existing.channelId === channelId) {
          next.set(userId, { ...existing, ...update })
        }
        return next
      })
    }

    const handleSelfVoiceLeft = (event) => {
      const userId = event?.detail?.userId
      if (!userId) return
      setVoiceParticipants(prev => {
        if (!prev.has(userId)) return prev
        const next = new Map(prev)
        next.delete(userId)
        return next
      })
    }

    socket.on('voice:participants', handleVoiceParticipants)
    socket.on('voice:user-joined', handleVoiceUserJoined)
    socket.on('voice:user-left', handleVoiceUserLeft)
    socket.on('voice:user-updated', handleVoiceUserUpdated)
    window.addEventListener('voice:self-left', handleSelfVoiceLeft)

    return () => {
      socket.off('user:status', handleStatusUpdate)
      socket.off('member:offline', handleMemberOffline)
      socket.off('member:online', handleMemberOnline)
      socket.off('bot:added', handleBotAdded)
      socket.off('bot:removed', handleBotRemoved)
      socket.off('voice:participants', handleVoiceParticipants)
      socket.off('voice:user-joined', handleVoiceUserJoined)
      socket.off('voice:user-left', handleVoiceUserLeft)
      socket.off('voice:user-updated', handleVoiceUserUpdated)
      window.removeEventListener('voice:self-left', handleSelfVoiceLeft)
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
        icon: <UserIcon size={16} />,
        label: t('member.profile'),
        onClick: () => onMemberClick?.(member.id)
      },
      {
        icon: <ChatBubbleLeftRightIcon size={16} />,
        label: t('member.message'),
        onClick: () => onStartDM?.(member.id),
        disabled: isSelf
      },
      { type: 'separator' },
      {
        icon: <UserPlusIcon size={16} />,
        label: t('member.addFriend'),
        onClick: () => onAddFriend?.(member.id),
        disabled: isSelf
      },
      ...(!isSelf ? [
        {
          icon: <NoSymbolIcon size={16} />,
          label: t('member.blockUser'),
          onClick: () => {
            if (confirm(t('member.blockConfirm'))) {
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
          icon: <SpeakerXMarkIcon size={16} />,
          label: t('member.mute'),
          onClick: () => {},
          disabled: true
        },
        {
          icon: <UserMinusIcon size={16} />,
          label: t('member.kick'),
          onClick: () => onKick?.(member.id),
          danger: true
        }
      ] : []),
      ...(isAdmin && !isSelf && !isOwner ? [
        {
          icon: <NoSymbolIcon size={16} />,
          label: t('member.ban'),
          onClick: () => onBan?.(member.id),
          danger: true
        }
      ] : [])
    ]
    
    setContextMenu({ x: e.clientX, y: e.clientY, items })
  }
  const getRoleIcon = (member) => {
    if (member.id === server?.ownerId) {
      return <TrophyIcon size={14} className="role-icon owner" />
    }
    const primary = getPrimaryRole(member)
    if (!primary) return null
    return <ShieldCheckIcon size={14} className="role-icon" style={{ color: primary.color }} />
  }

  const getRoleColor = (member) => {
    if (member.id === server?.ownerId) return '#eab308'
    const primary = getPrimaryRole(member)
    return primary?.color || null
  }

  const getRoleName = (member) => {
    if (member.id === server?.ownerId) return t('member.owner')
    const primary = getPrimaryRole(member)
    if (!primary || primary.name?.toLowerCase() === 'member') return null
    return primary.name
  }

  const getAllRoles = (member) => {
    if (member.id === server?.ownerId) return [{ name: t('member.owner'), color: '#eab308' }]
    const roles = getMemberRoles(member)
    const resolved = roles.map(resolveRole).filter(Boolean)
    return resolved
      .filter(r => r.name?.toLowerCase() !== 'member')
      .sort((a, b) => (b.position ?? 0) - (a.position ?? 0))
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'online':
        return 'online'
      case 'idle':
        return 'idle'
      case 'dnd':
        return 'dnd'
      case 'invisible':
        return 'invisible'
      default:
        return 'offline'
    }
  }

  const getStatusDotColor = (status) => {
    switch (status) {
      case 'online':
        return 'var(--volt-success)'
      case 'idle':
        return 'var(--volt-warning)'
      case 'dnd':
        return 'var(--volt-danger)'
      default:
        return '#6b7280'
    }
  }

  // Merge bots added dynamically (via socket) that aren't already in the members list
  const safeDisplayedMembers = Array.isArray(displayedMembers) ? displayedMembers : []
  const allMembers = channelMembers !== null ? safeDisplayedMembers : [
    ...safeDisplayedMembers,
    ...extraBotMembers.filter(b => !safeDisplayedMembers.some(m => m.id === b.id))
  ]

  const onlineMembers = allMembers.filter(m => {
    const status = getMemberStatus(m)
    return status === 'online' || status === 'idle' || status === 'dnd'
  })
  const offlineMembers = allMembers.filter(m => {
    const status = getMemberStatus(m)
    return status === 'offline' || status === 'invisible'
  })

  if (!visible && !isMobile) return null

  return (
    <div className={`member-sidebar${isMobile ? (visible ? ' visible' : '') : ''}`}>
      {isMobile && (
        <div className="member-sidebar-mobile-header">
          <div className="member-sidebar-mobile-title">
            <strong>{t('common.members', 'Members')}</strong>
            <span>{allMembers.length}</span>
          </div>
          <button type="button" className="member-sidebar-mobile-close" onClick={() => onClose?.()}>
            <XMarkIcon width={20} height={20} />
          </button>
        </div>
      )}
      <div className="member-list">
        {onlineMembers.length > 0 && (
          <div className="member-section">
            <div className="section-header">
              {t('status.online').toUpperCase()} — {onlineMembers.length}
            </div>
              {onlineMembers.map(member => {
              const customStatus = getMemberCustomStatus(member)
              const status = getMemberStatus(member)
              const roleColor = getRoleColor(member)
              const roleName = getRoleName(member)
              const memberRoles = getAllRoles(member)
              const voiceState = voiceParticipants.get(member.id)
              const isInVoice = !!voiceState
              const isSpeaking = voiceState?.speaking
              const isMuted = voiceState?.muted
              const isDeafened = voiceState?.deafened
              return (
                <div
                  key={member.id}
                  className={`member-item ${isInVoice ? 'in-voice' : ''} ${isSpeaking ? 'speaking' : ''}`}
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
                      userId={member.id}
                    />
                    <div
                      className="status-badge"
                      style={{ backgroundColor: getStatusDotColor(status) }}
                    />
                    {isInVoice && (
                      <div className={`voice-indicator ${isSpeaking ? 'speaking' : ''} ${isMuted ? 'muted' : ''} ${isDeafened ? 'deafened' : ''}`}>
                        {isDeafened ? <SpeakerXMarkIcon size={10} /> : isMuted ? <SpeakerXMarkIcon size={10} /> : <SpeakerWaveIcon size={10} />}
                      </div>
                    )}
                  </div>
                  <div className="member-info">
                    <div className="member-name" style={roleColor ? { color: roleColor } : {}}>
                      {member.id === server?.ownerId && <TrophyIcon size={12} className="role-dot" style={{ color: '#eab308' }} />}
                      {roleColor && roleColor !== '#eab308' && <span className="role-dot" style={{ backgroundColor: roleColor }} />}
                      <span>{member.username}</span>
                      {member.isBot && <span className="member-bot-badge">{t('member.bot')}</span>}
                    </div>
                    {memberRoles.length > 0 && (
                      <div className="member-roles">
                        {memberRoles.map((role, idx) => (
                          <span 
                            key={role.id || idx} 
                            className="member-role-tag"
                            style={{ color: role.color, borderColor: role.color }}
                          >
                            {role.name}
                          </span>
                        ))}
                      </div>
                    )}
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
              {t('status.offline').toUpperCase()} — {offlineMembers.length}
            </div>
            {offlineMembers.map(member => {
              const customStatus = getMemberCustomStatus(member)
              const status = getMemberStatus(member)
              const roleColor = getRoleColor(member)
              const roleName = getRoleName(member)
              const memberRoles = getAllRoles(member)
              const voiceState = voiceParticipants.get(member.id)
              const isInVoice = !!voiceState
              const isSpeaking = voiceState?.speaking
              const isMuted = voiceState?.muted
              const isDeafened = voiceState?.deafened
              return (
                <div
                  key={member.id}
                  className={`member-item offline ${isInVoice ? 'in-voice' : ''} ${isSpeaking ? 'speaking' : ''}`}
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
                      userId={member.id}
                    />
                    <div
                      className="status-badge"
                      style={{ backgroundColor: getStatusDotColor(status) }}
                    />
                    {isInVoice && (
                      <div className={`voice-indicator ${isSpeaking ? 'speaking' : ''} ${isMuted ? 'muted' : ''} ${isDeafened ? 'deafened' : ''}`}>
                        {isDeafened ? <SpeakerXMarkIcon size={10} /> : isMuted ? <SpeakerXMarkIcon size={10} /> : <SpeakerWaveIcon size={10} />}
                      </div>
                    )}
                  </div>
                  <div className="member-info">
                    <div className="member-name" style={roleColor ? { color: roleColor } : {}}>
                      {member.id === server?.ownerId && <TrophyIcon size={12} className="role-dot" style={{ color: '#eab308' }} />}
                      {roleColor && roleColor !== '#eab308' && <span className="role-dot" style={{ backgroundColor: roleColor }} />}
                      <span>{member.username}</span>
                      {member.isBot && <span className="member-bot-badge">{t('member.bot')}</span>}
                    </div>
                    {memberRoles.length > 0 && (
                      <div className="member-roles">
                        {memberRoles.map((role, idx) => (
                          <span
                            key={role.id || idx}
                            className="member-role-tag"
                            style={{ color: role.color, borderColor: role.color }}
                          >
                            {role.name}
                          </span>
                        ))}
                      </div>
                    )}
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
//finally its over all the shit is over in this file :>........ oh fuck more files :<
