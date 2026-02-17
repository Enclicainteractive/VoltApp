import React, { useState, useEffect } from 'react'
import { UserPlus, MessageSquare, Check, X, MoreVertical, UserMinus, Ban, Copy } from 'lucide-react'
import { apiService } from '../services/apiService'
import { getStoredServer } from '../services/serverConfig'
import { useSocket } from '../contexts/SocketContext'
import Avatar from './Avatar'
import ContextMenu from './ContextMenu'
import '../assets/styles/FriendsPage.css'

const FriendsPage = ({ onStartDM }) => {
  const [activeTab, setActiveTab] = useState('online')
  const [friends, setFriends] = useState([])
  const [requests, setRequests] = useState({ incoming: [], outgoing: [] })
  const [blocked, setBlocked] = useState([])
  const [loading, setLoading] = useState(true)
  const [addUsername, setAddUsername] = useState('')
  const [addError, setAddError] = useState('')
  const [addSuccess, setAddSuccess] = useState('')
  const [contextMenu, setContextMenu] = useState(null)
  const { socket, connected } = useSocket()
  
  const server = getStoredServer()
  const apiUrl = server?.apiUrl || ''
  const imageApiUrl = server?.imageApiUrl || apiUrl

  useEffect(() => {
    loadFriends()
    loadRequests()
    loadBlocked()
  }, [])

  useEffect(() => {
    if (!socket || !connected) return

    const handleStatusUpdate = ({ userId, status, customStatus }) => {
      setFriends(prev => prev.map(friend => {
        if (friend.id === userId) {
          return { ...friend, status, customStatus }
        }
        return friend
      }))
    }

    socket.on('user:status', handleStatusUpdate)

    return () => {
      socket.off('user:status', handleStatusUpdate)
    }
  }, [socket, connected])

  const loadFriends = async () => {
    try {
      const response = await apiService.getFriends()
      setFriends(Array.isArray(response.data) ? response.data : [])
    } catch (error) {
      console.error('Failed to load friends:', error)
      setFriends([])
    } finally {
      setLoading(false)
    }
  }

  const loadRequests = async () => {
    try {
      const response = await apiService.getFriendRequests()
      setRequests(response.data || { incoming: [], outgoing: [] })
    } catch (error) {
      console.error('Failed to load friend requests:', error)
      setRequests({ incoming: [], outgoing: [] })
    }
  }

  const loadBlocked = async () => {
    try {
      const response = await apiService.getBlockedUsers()
      setBlocked(response.data || [])
    } catch (error) {
      console.error('Failed to load blocked users:', error)
      setBlocked([])
    }
  }

  const handleUnblock = async (userId) => {
    try {
      await apiService.unblockUser(userId)
      setBlocked(prev => prev.filter(u => u.id !== userId))
    } catch (error) {
      console.error('Failed to unblock user:', error)
    }
  }

  const handleSendRequest = async (e) => {
    e.preventDefault()
    setAddError('')
    setAddSuccess('')
    
    if (!addUsername.trim()) {
      setAddError('Please enter a username')
      return
    }

    try {
      await apiService.sendFriendRequest(addUsername.trim())
      setAddSuccess(`Friend request sent to ${addUsername}!`)
      setAddUsername('')
      loadRequests()
    } catch (error) {
      setAddError(error.response?.data?.error || 'Failed to send friend request')
    }
  }

  const handleAcceptRequest = async (requestId) => {
    try {
      await apiService.acceptFriendRequest(requestId)
      loadFriends()
      loadRequests()
    } catch (error) {
      console.error('Failed to accept request:', error)
    }
  }

  const handleRejectRequest = async (requestId) => {
    try {
      await apiService.rejectFriendRequest(requestId)
      loadRequests()
    } catch (error) {
      console.error('Failed to reject request:', error)
    }
  }

  const handleCancelRequest = async (requestId) => {
    try {
      await apiService.cancelFriendRequest(requestId)
      loadRequests()
    } catch (error) {
      console.error('Failed to cancel request:', error)
    }
  }

  const handleRemoveFriend = async (friendId) => {
    if (!confirm('Are you sure you want to remove this friend?')) return
    try {
      await apiService.removeFriend(friendId)
      loadFriends()
    } catch (error) {
      console.error('Failed to remove friend:', error)
    }
  }

  const handleBlockFriend = async (friendId) => {
    if (!confirm('Are you sure you want to block this user? They will be removed from your friends and blocked.')) return
    try {
      await apiService.blockUser(friendId)
      await apiService.removeFriend(friendId)
      loadFriends()
      loadBlocked()
    } catch (error) {
      console.error('Failed to block user:', error)
    }
  }

  const handleMessageFriend = async (friendId) => {
    try {
      const response = await apiService.createDirectMessage(friendId)
      if (onStartDM) {
        onStartDM(response.data)
      }
    } catch (error) {
      console.error('Failed to start DM:', error)
    }
  }

  const onlineFriends = (friends || []).filter(f => f.status === 'online' || f.status === 'idle' || f.status === 'dnd')
  const pendingCount = (requests.incoming?.length || 0) + (requests.outgoing?.length || 0)

  const getStatusColor = (status) => {
    switch (status) {
      case 'online': return 'var(--volt-success)'
      case 'idle': return 'var(--volt-warning)'
      case 'dnd': return 'var(--volt-danger)'
      default: return 'var(--volt-text-muted)'
    }
  }

  return (
    <div className="friends-page">
      <div className="friends-header">
        <div className="friends-tabs">
          <button 
            className={`tab ${activeTab === 'online' ? 'active' : ''}`}
            onClick={() => setActiveTab('online')}
          >
            Online
          </button>
          <button 
            className={`tab ${activeTab === 'all' ? 'active' : ''}`}
            onClick={() => setActiveTab('all')}
          >
            All
          </button>
          <button 
            className={`tab ${activeTab === 'pending' ? 'active' : ''}`}
            onClick={() => setActiveTab('pending')}
          >
            Pending {pendingCount > 0 && <span className="badge">{pendingCount}</span>}
          </button>
          <button 
            className={`tab add-friend-tab ${activeTab === 'add' ? 'active' : ''}`}
            onClick={() => setActiveTab('add')}
          >
            Add Friend
          </button>
          <button 
            className={`tab ${activeTab === 'blocked' ? 'active' : ''}`}
            onClick={() => { setActiveTab('blocked'); loadBlocked(); }}
          >
            Blocked {blocked.length > 0 && <span className="badge">{blocked.length}</span>}
          </button>
        </div>
      </div>

      <div className="friends-content">
        {activeTab === 'add' && (
          <div className="add-friend-section">
            <h3>Add Friend</h3>
            <p>You can add friends with their VoltChat username.</p>
            <form className="add-friend-form" onSubmit={handleSendRequest}>
              <div className="add-friend-input-wrapper">
                <input
                  type="text"
                  className="input"
                  placeholder="Enter a username"
                  value={addUsername}
                  onChange={(e) => setAddUsername(e.target.value)}
                />
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={!addUsername.trim()}
                >
                  Send Friend Request
                </button>
              </div>
              {addError && <p className="error-text">{addError}</p>}
              {addSuccess && <p className="success-text">{addSuccess}</p>}
            </form>
          </div>
        )}

        {activeTab === 'pending' && (
          <div className="pending-section">
            {requests.incoming?.length > 0 && (
              <>
                <h4 className="section-title">INCOMING — {requests.incoming?.length || 0}</h4>
                <div className="friends-list">
                  {(requests.incoming || []).map(request => (
                    <div 
                      key={request.id} 
                      className="friend-item"
                      onContextMenu={(e) => {
                        e.preventDefault()
                        const items = [
                          {
                            icon: <Check size={16} />,
                            label: 'Accept',
                            onClick: () => handleAcceptRequest(request.id)
                          },
                          {
                            icon: <X size={16} />,
                            label: 'Reject',
                            onClick: () => handleRejectRequest(request.id),
                            danger: true
                          },
                          { type: 'separator' },
                          {
                            icon: <Copy size={16} />,
                            label: 'Copy User ID',
                            onClick: () => navigator.clipboard.writeText(request.from)
                          },
                        ]
                        setContextMenu({ x: e.clientX, y: e.clientY, items })
                      }}
                    >
                      <Avatar 
                        src={`${imageApiUrl}/api/images/users/${request.from}/profile`}
                        fallback={request.fromUsername}
                        size={40}
                      />
                      <div className="friend-info">
                        <span className="friend-name">{request.fromUsername}</span>
                        <span className="friend-status">Incoming Friend Request</span>
                      </div>
                      <div className="friend-actions">
                        <button 
                          className="icon-btn accept"
                          onClick={() => handleAcceptRequest(request.id)}
                          title="Accept"
                        >
                          <Check size={20} />
                        </button>
                        <button 
                          className="icon-btn reject"
                          onClick={() => handleRejectRequest(request.id)}
                          title="Reject"
                        >
                          <X size={20} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {requests.outgoing?.length > 0 && (
              <>
                <h4 className="section-title">OUTGOING — {requests.outgoing?.length || 0}</h4>
                <div className="friends-list">
                  {(requests.outgoing || []).map(request => (
                    <div 
                      key={request.id} 
                      className="friend-item"
                      onContextMenu={(e) => {
                        e.preventDefault()
                        const items = [
                          {
                            icon: <X size={16} />,
                            label: 'Cancel Request',
                            onClick: () => handleCancelRequest(request.id),
                            danger: true
                          },
                          { type: 'separator' },
                          {
                            icon: <Copy size={16} />,
                            label: 'Copy User ID',
                            onClick: () => navigator.clipboard.writeText(request.to)
                          },
                        ]
                        setContextMenu({ x: e.clientX, y: e.clientY, items })
                      }}
                    >
                      <Avatar 
                        src={`${imageApiUrl}/api/images/users/${request.to}/profile`}
                        fallback={request.toUsername || '?'}
                        size={40}
                      />
                      <div className="friend-info">
                        <span className="friend-name">{request.toUsername || 'User'}</span>
                        <span className="friend-status">Outgoing Friend Request</span>
                      </div>
                      <div className="friend-actions">
                        <button 
                          className="icon-btn reject"
                          onClick={() => handleCancelRequest(request.id)}
                          title="Cancel"
                        >
                          <X size={20} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {(!requests.incoming?.length) && (!requests.outgoing?.length) && (
              <div className="empty-state-inline">
                <p>No pending friend requests</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'blocked' && (
          <div className="blocked-section">
            <h3>Blocked Users</h3>
            <p>Blocked users cannot message you or see your online status.</p>
            
            {blocked.length === 0 ? (
              <div className="empty-state-inline">
                <p>You haven't blocked anyone</p>
              </div>
            ) : (
              <div className="friends-list">
                {blocked.map(user => (
                  <div 
                    key={user.id} 
                    className="friend-item"
                    onContextMenu={(e) => {
                      e.preventDefault()
                      const items = [
                        {
                          icon: <X size={16} />,
                          label: 'Unblock',
                          onClick: () => handleUnblock(user.id)
                        },
                        { type: 'separator' },
                        {
                          icon: <Copy size={16} />,
                          label: 'Copy User ID',
                          onClick: () => navigator.clipboard.writeText(user.id)
                        },
                      ]
                      setContextMenu({ x: e.clientX, y: e.clientY, items })
                    }}
                  >
                    <Avatar 
                      src={user.avatar || `${imageApiUrl}/api/images/users/${user.id}/profile`}
                      fallback={user.username}
                      size={40}
                    />
                    <div className="friend-info">
                      <span className="friend-name">{user.username}</span>
                      <span className="friend-status">Blocked</span>
                    </div>
                    <div className="friend-actions">
                      <button 
                        className="icon-btn"
                        onClick={() => handleUnblock(user.id)}
                        title="Unblock"
                      >
                        <X size={20} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {(activeTab === 'online' || activeTab === 'all') && (
          <div className="friends-section">
            <h4 className="section-title">
              {activeTab === 'online' ? 'ONLINE' : 'ALL FRIENDS'} — {activeTab === 'online' ? onlineFriends.length : (friends || []).length}
            </h4>
            
            {loading ? (
              <div className="loading-inline">Loading...</div>
            ) : (activeTab === 'online' ? onlineFriends : (friends || [])).length === 0 ? (
              <div className="empty-state-inline">
                <p>{activeTab === 'online' ? 'No friends are online right now' : 'You have no friends yet. Add some!'}</p>
              </div>
            ) : (
              <div className="friends-list">
                {(activeTab === 'online' ? onlineFriends : (friends || [])).map(friend => (
                  <div 
                    key={friend.id} 
                    className="friend-item"
                    onContextMenu={(e) => {
                      e.preventDefault()
                      const items = [
                        {
                          icon: <MessageSquare size={16} />,
                          label: 'Message',
                          shortcut: 'M',
                          onClick: () => handleMessageFriend(friend.id)
                        },
                        {
                          icon: <Ban size={16} />,
                          label: 'Block',
                          onClick: () => handleBlockFriend(friend.id),
                          danger: true
                        },
                        {
                          icon: <UserMinus size={16} />,
                          label: 'Remove Friend',
                          onClick: () => handleUnfriend(friend.id),
                          danger: true
                        },
                        { type: 'separator' },
                        {
                          icon: <Copy size={16} />,
                          label: 'Copy User ID',
                          onClick: () => navigator.clipboard.writeText(friend.id)
                        },
                      ]
                      setContextMenu({ x: e.clientX, y: e.clientY, items })
                    }}
                  >
                    <div className="friend-avatar-wrapper">
                      <Avatar 
                        src={friend.avatar}
                        fallback={friend.username}
                        size={40}
                      />
                      <div 
                        className="status-dot" 
                        style={{ backgroundColor: getStatusColor(friend.status) }}
                      />
                    </div>
                    <div className="friend-info">
                      <span className="friend-name">{friend.displayName || friend.username}</span>
                      <span className="friend-status">
                        {friend.customStatus || friend.status || 'Offline'}
                      </span>
                    </div>
                    <div className="friend-actions">
                      <button 
                        className="icon-btn"
                        onClick={() => handleMessageFriend(friend.id)}
                        title="Message"
                      >
                        <MessageSquare size={20} />
                      </button>
                      <button 
                        className="icon-btn danger"
                        onClick={() => handleBlockFriend(friend.id)}
                        title="Block User"
                      >
                        <Ban size={20} />
                      </button>
                      <button 
                        className="icon-btn danger"
                        onClick={() => handleRemoveFriend(friend.id)}
                        title="Remove Friend"
                      >
                        <UserMinus size={20} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
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

export default FriendsPage
