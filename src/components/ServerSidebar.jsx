import React, { useState } from 'react'
import { Plus, Zap, Users, Settings, LogIn, MoreHorizontal, Copy, Shield, LogOut, Compass } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import CreateServerModal from './modals/CreateServerModal'
import JoinServerModal from './modals/JoinServerModal'
import ContextMenu from './ContextMenu'
import { apiService } from '../services/apiService'
import { getStoredServer } from '../services/serverConfig'
import '../assets/styles/ServerSidebar.css'

const ServerSidebar = ({ servers, currentServerId, onServerChange, onCreateServer, onOpenSettings, onOpenCreate, onOpenJoin, onOpenServerSettings, onLeaveServer, onOpenAdmin, isAdmin, friendRequestCount = 0, dmNotifications = [], serverUnreadCounts = {} }) => {
  const { user } = useAuth()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showJoinModal, setShowJoinModal] = useState(false)
  const [contextMenu, setContextMenu] = useState(null)

  const server = getStoredServer()
  const imageApiUrl = server?.imageApiUrl || server?.apiUrl || ''

  const totalNotifications = friendRequestCount + dmNotifications.length

  const handleLeaveServer = async (server) => {
    if (window.confirm(`Are you sure you want to leave ${server.name}?`)) {
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
        alert(err.response?.data?.error || 'Failed to leave server')
      }
    }
  }

  return (
    <>
      <div className="server-sidebar">
        <div className="server-list">
          <button 
            className="server-icon home-icon"
            onClick={() => onServerChange('home')}
            title="Home"
          >
            <Zap size={28} />
          </button>

          <button 
            className={`server-icon friends-icon ${currentServerId === 'friends' ? 'active' : ''}`}
            onClick={() => onServerChange('friends')}
            title="Friends"
          >
            <Users size={28} />
            {totalNotifications > 0 && (
              <div className="friends-notification-badge">
                {dmNotifications.length > 0 ? (
                  dmNotifications.slice(0, 3).map((dm, idx) => (
                    <img 
                      key={dm.id || idx}
                      src={dm.recipient?.avatar || `${imageApiUrl}/api/images/users/${dm.recipient?.id}/profile`}
                      alt=""
                      className="notification-avatar"
                      style={{ zIndex: 3 - idx }}
                    />
                  ))
                ) : (
                  <span>{friendRequestCount}</span>
                )}
              </div>
            )}
          </button>

          <button 
            className={`server-icon discovery-icon ${currentServerId === 'discovery' ? 'active' : ''}`}
            onClick={() => onServerChange('discovery')}
            title="Server Discovery"
          >
            <Compass size={28} />
          </button>

          {isAdmin && (
            <button 
              className="server-icon admin-icon"
              onClick={onOpenAdmin}
              title="Admin Panel"
            >
              <Shield size={28} />
            </button>
          )}
          
          <div className="server-divider"></div>
          
          {servers.map(server => {
            const unreadCount = serverUnreadCounts[server.id] || 0
            return (
            <button
              key={server.id}
              className={`server-icon ${currentServerId === server.id ? 'active' : ''}`}
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
                  { icon: <Plus size={16} />, label: 'Create Server', onClick: () => onOpenCreate ? onOpenCreate() : setShowCreateModal(true) },
                  { icon: <LogIn size={16} />, label: 'Join Server', onClick: () => onOpenJoin ? onOpenJoin() : setShowJoinModal(true) },
                ]
              })
            }}
            title="Create Server"
          >
            <Plus size={24} />
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
                  { icon: <Plus size={16} />, label: 'Create Server', onClick: () => onOpenCreate ? onOpenCreate() : setShowCreateModal(true) },
                  { icon: <LogIn size={16} />, label: 'Join Server', onClick: () => onOpenJoin ? onOpenJoin() : setShowJoinModal(true) },
                ]
              })
            }}
            title="Join Server"
          >
            <LogIn size={22} />
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
                  { icon: <Settings size={16} />, label: 'User Settings', onClick: onOpenSettings },
                  { icon: <LogIn size={16} />, label: 'Join Server', onClick: () => onOpenJoin ? onOpenJoin() : setShowJoinModal(true) },
                ]
              })
            }}
            title="Settings"
          >
            <Settings size={24} />
          </button>
        </div>
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={[
            { label: contextMenu.server.name, type: 'header' },
            {
              label: 'Open',
              onClick: () => onServerChange(contextMenu.server.id)
            },
            {
              label: 'Server Settings',
              icon: <Shield size={14} />,
              onClick: () => {
                onServerChange(contextMenu.server.id)
                onOpenServerSettings?.()
              },
              disabled: contextMenu.server.ownerId !== user?.id
            },
            {
              label: 'Copy Server ID',
              icon: <Copy size={14} />,
              onClick: () => navigator.clipboard.writeText(contextMenu.server.id)
            },
            { type: 'separator' },
            {
              label: 'Leave Server',
              icon: <LogOut size={14} />,
              onClick: () => handleLeaveServer(contextMenu.server),
              danger: true,
              disabled: contextMenu.server.ownerId === user?.id
            },
            { type: 'separator' },
            {
              label: 'Close',
              icon: <MoreHorizontal size={14} />,
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
