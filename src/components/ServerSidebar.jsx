import React, { useState } from 'react'
import { PlusIcon, UsersIcon, CogIcon, ArrowRightOnRectangleIcon, EllipsisHorizontalIcon, ClipboardDocumentIcon, ShieldCheckIcon, GlobeAmericasIcon, BellIcon, BellSlashIcon, FlagIcon, CalendarDaysIcon } from '@heroicons/react/24/outline'
import { useTranslation } from '../hooks/useTranslation'
import { useAuth } from '../contexts/AuthContext'
import CreateServerModal from './modals/CreateServerModal'
import JoinServerModal from './modals/JoinServerModal'
import ContextMenu from './ContextMenu'
import { apiService } from '../services/apiService'
import { getStoredServer } from '../services/serverConfig'
import { settingsService } from '../services/settingsService'
import { VoltageLogo } from './LoadingScreen'
import Avatar from './Avatar'
import '../assets/styles/ServerSidebar.css'

const ServerSidebar = ({ servers, currentServerId, onServerChange, onCreateServer, onOpenSettings, onOpenCreate, onOpenJoin, onOpenServerSettings, onLeaveServer, onOpenAdmin, isAdmin, friendRequestCount = 0, dmNotifications = [], serverUnreadCounts = {}, serverEventsMeta = {}, onDMClick }) => {
  const { user } = useAuth()
  const { t } = useTranslation()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showJoinModal, setShowJoinModal] = useState(false)
  const [contextMenu, setContextMenu] = useState(null)
  const [mutedServers, setMutedServers] = useState({})

  const server = getStoredServer()
  const showAdminPanel = Boolean(isAdmin || server?.ownerId === user?.id)

  const dmNotificationCount = Array.isArray(dmNotifications) ? dmNotifications.length : Number(dmNotifications) || 0
  const totalNotifications = friendRequestCount + dmNotificationCount
  const pinnedDmNotifications = Array.isArray(dmNotifications) ? dmNotifications.slice(0, 4) : []

  React.useEffect(() => {
    loadMuteStatus()
  }, [])

  const loadMuteStatus = async () => {
    const cachedSettings = settingsService.getSettings()
    if (cachedSettings?.serverMutes && Object.keys(cachedSettings.serverMutes).length > 0) {
      setMutedServers(cachedSettings.serverMutes)
    }
    try {
      const res = await apiService.getNotificationSettings()
      const muted = {}
      ;(res.data?.serverMutes || []).forEach(m => {
        if (m.serverId && (!m.expiresAt || new Date(m.expiresAt) > new Date())) {
          muted[m.serverId] = true
        }
      })
      setMutedServers(muted)
      settingsService.saveSettings({ ...cachedSettings, serverMutes: muted })
    } catch (err) {
      console.error('Failed to load mute status:', err)
    }
  }

  const handleMuteServer = async (server, mute) => {
    try {
      await apiService.muteServer(server.id, mute)
      const newMutedServers = { ...mutedServers, [server.id]: mute }
      setMutedServers(newMutedServers)
      const settings = settingsService.getSettings()
      settingsService.saveSettings({ ...settings, serverMutes: newMutedServers })
      setContextMenu(null)
    } catch (err) {
      console.error('Failed to toggle mute:', err)
    }
  }

  const handleLeaveServer = async (server) => {
    if (window.confirm(t('servers.leaveConfirm').replace('{name}', server.name))) {
      try {
        await apiService.leaveServer(server.id)
        setContextMenu(null)
        if (onLeaveServer) {
          onLeaveServer(server.id)
        } else if (currentServerId === server.id) {
          onServerChange('home')
        }
      } catch (err) {
        console.error('Failed to leave server:', err)
        alert(err.response?.data?.error || t('errors.generic'))
      }
    }
  }

  const handleReportServer = async (targetServer) => {
    if (!targetServer?.id) return
    const reason = window.prompt('Report this server. What happened?')
    if (!reason || reason.trim().length < 3) return

    try {
      await apiService.submitUserSafetyReport({
        contextType: 'server',
        reportType: 'user_report',
        accusedUserId: targetServer.ownerId || null,
        serverId: targetServer.id,
        serverName: targetServer.name,
        reason: reason.trim()
      })
      window.alert('Server report sent. Thank you.')
    } catch (err) {
      console.error('Failed to submit server report:', err)
      window.alert(err?.response?.data?.error || 'Failed to submit report')
    }
  }

  return (
    <>
      <div className="server-sidebar">
        <div className="server-list">
          <button 
            className="server-icon home-icon"
            onClick={() => onServerChange('home')}
            title={t('nav.chat')}
          >
            <VoltageLogo size={28} />
          </button>

          <button 
            className={`server-icon friends-icon ${currentServerId === 'friends' ? 'active' : ''}`}
            onClick={() => onServerChange('friends')}
            title={t('nav.friends')}
          >
            <UsersIcon size={28} />
            {totalNotifications > 0 && (
              <div className="friends-notification-badge">
                <span>{totalNotifications > 99 ? '99+' : totalNotifications}</span>
              </div>
            )}
          </button>

          {pinnedDmNotifications.length > 0 && (
            <div className="server-dm-strip" aria-label={t('dm.title', 'Direct Messages')}>
              {pinnedDmNotifications.map((conversation) => {
                const recipient = conversation.recipient || null
                const unreadCount = Number(conversation.unreadCount) || 0
                const label = recipient?.displayName || recipient?.username || conversation.groupName || conversation.title || t('dm.title', 'Direct Messages')
                const initials = label
                  .split(' ')
                  .map((part) => part[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase()

                const handleOpenDm = () => {
                  if (recipient && onDMClick) {
                    onDMClick(conversation.id, recipient)
                    return
                  }
                  onServerChange?.('dms')
                }

                return (
                  <button
                    key={conversation.id}
                    className={`server-dm-icon ${currentServerId === 'dms' ? 'active' : ''}`}
                    onClick={handleOpenDm}
                    title={label}
                    type="button"
                  >
                    {recipient ? (
                      <Avatar src={recipient.avatar} fallback={label} size={26} userId={recipient.id} />
                    ) : (
                      <span className="server-dm-acronym">{initials || 'DM'}</span>
                    )}
                    {recipient?.status && (
                      <span className={`server-dm-status ${recipient.status}`} />
                    )}
                    {unreadCount > 0 && (
                      <span className="server-dm-badge">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                  </button>
                )
              })}
              {dmNotifications.length > pinnedDmNotifications.length && (
                <button
                  className={`server-dm-more ${currentServerId === 'dms' ? 'active' : ''}`}
                  onClick={() => onServerChange?.('dms')}
                  title={t('dm.title', 'Direct Messages')}
                  type="button"
                >
                  +{dmNotifications.length - pinnedDmNotifications.length}
                </button>
              )}
            </div>
          )}

          <button 
            className={`server-icon discovery-icon ${currentServerId === 'discovery' ? 'active' : ''}`}
            onClick={() => onServerChange('discovery')}
            title={t('discovery.title')}
          >
            <GlobeAmericasIcon size={28} />
          </button>

          {showAdminPanel && (
            <button 
              className="server-icon admin-icon"
              onClick={onOpenAdmin}
              title={t('misc.adminPanel')}
            >
              <ShieldCheckIcon size={28} />
            </button>
          )}
          
          <div className="server-divider"></div>
          
          {servers.map(server => {
            const unreadCount = serverUnreadCounts[server.id] || 0
            const eventMeta = serverEventsMeta?.[server.id] || null
            return (
            <button
              key={server.id}
              className={`server-icon ${currentServerId === server.id ? 'active' : ''} ${eventMeta ? 'has-events' : ''} ${eventMeta?.hasToday ? 'has-events-today' : ''}`}
              onClick={() => onServerChange(server.id)}
              onContextMenu={(e) => {
                e.preventDefault()
                setContextMenu({
                  x: e.clientX,
                  y: e.clientY,
                  server
                })
              }}
              title={server.name}
            >
              {server.icon ? (
                <img src={server.icon} alt={server.name} />
              ) : (
                <span className="server-acronym">
                  {server.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                </span>
              )}
              {unreadCount > 0 && (
                <div className="server-unread-badge">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </div>
              )}
              {eventMeta && (
                <div className={`server-event-badge ${eventMeta.hasToday ? 'today' : 'upcoming'}`} title={eventMeta.hasToday ? 'Event today' : 'Upcoming event'}>
                  <CalendarDaysIcon size={10} />
                </div>
              )}
            </button>
          )})}
          
          <button 
            className="server-icon add-server"
            onClick={() => (onOpenCreate ? onOpenCreate() : setShowCreateModal(true))}
            onContextMenu={(e) => {
              e.preventDefault()
              setContextMenu({
                x: e.clientX,
                y: e.clientY,
                items: [
                  { icon: <PlusIcon size={16} />, label: t('servers.create'), onClick: () => onOpenCreate ? onOpenCreate() : setShowCreateModal(true) },
                  { icon: <ArrowRightOnRectangleIcon size={16} />, label: t('servers.join'), onClick: () => onOpenJoin ? onOpenJoin() : setShowJoinModal(true) },
                ]
              })
            }}
            title={t('servers.create')}
          >
            <PlusIcon size={24} />
          </button>

          <button 
            className="server-icon join-server"
            onClick={() => (onOpenJoin ? onOpenJoin() : setShowJoinModal(true))}
            onContextMenu={(e) => {
              e.preventDefault()
              setContextMenu({
                x: e.clientX,
                y: e.clientY,
                items: [
                  { icon: <PlusIcon size={16} />, label: t('servers.create'), onClick: () => onOpenCreate ? onOpenCreate() : setShowCreateModal(true) },
                  { icon: <ArrowRightOnRectangleIcon size={16} />, label: t('servers.join'), onClick: () => onOpenJoin ? onOpenJoin() : setShowJoinModal(true) },
                ]
              })
            }}
            title={t('servers.join')}
          >
            <ArrowRightOnRectangleIcon size={22} />
          </button>

          <div className="server-spacer"></div>

          <button 
            className="server-icon settings-icon"
            onClick={onOpenSettings}
            onContextMenu={(e) => {
              e.preventDefault()
              setContextMenu({
                x: e.clientX,
                y: e.clientY,
                items: [
                  { icon: <CogIcon size={16} />, label: t('nav.settings'), onClick: onOpenSettings },
                  { icon: <ArrowRightOnRectangleIcon size={16} />, label: t('servers.join'), onClick: () => onOpenJoin ? onOpenJoin() : setShowJoinModal(true) },
                ]
              })
            }}
            title={t('nav.settings')}
          >
            <CogIcon size={24} />
          </button>
        </div>
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={contextMenu.items || [
            { label: contextMenu.server?.name, type: 'header' },
            {
              label: t('common.open'),
              onClick: () => onServerChange(contextMenu.server?.id)
            },
            {
              label: mutedServers[contextMenu.server?.id] ? 'Unmute Notifications' : 'Mute Notifications',
              icon: mutedServers[contextMenu.server?.id] ? <BellIcon size={14} /> : <BellSlashIcon size={14} />,
              onClick: () => handleMuteServer(contextMenu.server, !mutedServers[contextMenu.server?.id])
            },
            {
              label: t('servers.serverSettings'),
              icon: <ShieldCheckIcon size={14} />,
              onClick: () => {
                onServerChange(contextMenu.server?.id)
                onOpenServerSettings?.()
              },
              disabled: contextMenu.server?.ownerId !== user?.id
            },
            {
              label: t('servers.serverId'),
              icon: <ClipboardDocumentIcon size={14} />,
              onClick: () => navigator.clipboard.writeText(contextMenu.server?.id)
            },
            {
              label: 'Report Server',
              icon: <FlagIcon size={14} />,
              onClick: () => handleReportServer(contextMenu.server)
            },
            { type: 'separator' },
            {
              label: t('servers.leaveServer'),
              icon: <ArrowRightOnRectangleIcon size={14} />,
              onClick: () => handleLeaveServer(contextMenu.server),
              danger: true,
              disabled: contextMenu.server?.ownerId === user?.id
            },
            { type: 'separator' },
            {
              label: t('common.close'),
              icon: <EllipsisHorizontalIcon size={14} />,
              onClick: () => {}
            }
          ]}
        />
      )}

      {showCreateModal && (
        <CreateServerModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false)
            onCreateServer()
          }}
        />
      )}

      {showJoinModal && (
        <JoinServerModal
          onClose={() => setShowJoinModal(false)}
          onSuccess={() => {
            setShowJoinModal(false)
            onCreateServer()
          }}
        />
      )}
    </>
  )
}

export default ServerSidebar
