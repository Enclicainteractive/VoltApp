import React, { useState, useEffect, useRef } from 'react'
import { X, MessageSquare, UserPlus, UserMinus, Ban, MoreVertical, Github, Twitter, Youtube, Twitch, Globe, Edit2, Check, Gamepad2, Music, Camera, XCircle, Shield, Copy } from 'lucide-react'
import { apiService } from '../../services/apiService'
import { useAuth } from '../../contexts/AuthContext'
import { useSocket } from '../../contexts/SocketContext'
import { getStoredServer } from '../../services/serverConfig'
import Avatar from '../Avatar'
import MarkdownMessage from '../MarkdownMessage'
import ContextMenu from '../ContextMenu'
import { useBanner } from '../../hooks/useAvatar'
import './Modal.css'
import './UserProfileModal.css'

const SOCIAL_PLATFORMS = [
  { key: 'github', label: 'GitHub', icon: Github, prefix: 'https://github.com/' },
  { key: 'twitter', label: 'Twitter / X', icon: Twitter, prefix: 'https://x.com/' },
  { key: 'youtube', label: 'YouTube', icon: Youtube, prefix: 'https://youtube.com/@' },
  { key: 'twitch', label: 'Twitch', icon: Twitch, prefix: 'https://twitch.tv/' },
  { key: 'steam', label: 'Steam', icon: Gamepad2, prefix: 'https://steamcommunity.com/id/' },
  { key: 'spotify', label: 'Spotify', icon: Music, prefix: 'https://open.spotify.com/user/' },
  { key: 'website', label: 'Website', icon: Globe, prefix: '' },
]

const UserProfileModal = ({ userId, server, members, onClose, onStartDM }) => {
  const { user: currentUser } = useAuth()
  const { socket } = useSocket()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showMenu, setShowMenu] = useState(false)
  const [editingSocials, setEditingSocials] = useState(false)
  const [socialDraft, setSocialDraft] = useState({})
  const [editingBanner, setEditingBanner] = useState(false)
  const [bannerPreview, setBannerPreview] = useState(null)
  const [contextMenu, setContextMenu] = useState(null)
  const fileInputRef = useRef(null)
  
  const currentServer = getStoredServer()
  const apiUrl = currentServer?.apiUrl || ''
  const imageApiUrl = currentServer?.imageApiUrl || apiUrl
  const bannerUrl = profile?.banner || `${imageApiUrl}/api/images/users/${userId}/banner`
  const { bannerSrc, loading: bannerLoading } = useBanner(editingBanner ? bannerPreview : bannerUrl)

  useEffect(() => {
    loadProfile()
  }, [userId])

  useEffect(() => {
    if (!socket) return
    const handleStatus = ({ userId: uid, status }) => {
      if (uid === userId) setProfile(p => p ? { ...p, status } : p)
    }
    socket.on('user:status', handleStatus)
    return () => socket.off('user:status', handleStatus)
  }, [socket, userId])

  const loadProfile = async () => {
    try {
      const res = await apiService.getUserProfile(userId)
      setProfile(res.data)
      
      if (userId !== currentUser?.id) {
        const [mutualFriendsRes, mutualServersRes] = await Promise.all([
          apiService.getMutualFriends(userId).catch(() => ({ data: [] })),
          apiService.getMutualServers(userId).catch(() => ({ data: [] }))
        ])
        setMutualFriends(mutualFriendsRes.data || [])
        setMutualServers(mutualServersRes.data || [])
      }
    } catch (err) {
      console.error('Failed to load profile:', err)
    }
    setLoading(false)
  }

  const [mutualFriends, setMutualFriends] = useState([])
  const [mutualServers, setMutualServers] = useState([])

  const handleSendMessage = async () => {
    try {
      const res = await apiService.createDirectMessage(userId)
      onStartDM?.(res.data)
      onClose()
    } catch (err) {
      console.error('Failed to start DM:', err)
    }
  }

  const handleAddFriend = async () => {
    try {
      await apiService.sendFriendRequestById(userId)
      setProfile(p => ({ ...p, friendRequestSent: true }))
    } catch (err) {
      console.error('Failed to send friend request:', err)
    }
  }

  const handleRemoveFriend = async () => {
    try {
      await apiService.removeFriend(userId)
      setProfile(p => ({ ...p, isFriend: false }))
    } catch (err) {
      console.error('Failed to remove friend:', err)
    }
  }

  const handleBlock = async () => {
    if (!confirm('Are you sure you want to block this user?')) return
    try {
      await apiService.blockUser(userId)
      setProfile(p => ({ ...p, isBlocked: true, isFriend: false }))
    } catch (err) {
      console.error('Failed to block user:', err)
    }
  }

  const handleUnblock = async () => {
    try {
      await apiService.unblockUser(userId)
      setProfile(p => ({ ...p, isBlocked: false }))
    } catch (err) {
      console.error('Failed to unblock user:', err)
    }
  }

  const handleCancelFriendRequest = async () => {
    try {
      await apiService.cancelFriendRequestByUserId(userId)
      setProfile(p => ({ ...p, friendRequestSent: false }))
    } catch (err) {
      console.error('Failed to cancel friend request:', err)
    }
  }

  const handleBannerUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file')
      return
    }
    
    if (file.size > 5 * 1024 * 1024) {
      alert('Image must be less than 5MB')
      return
    }
    
    const reader = new FileReader()
    reader.onload = async (event) => {
      const base64 = event.target.result
      setBannerPreview(base64)
      setEditingBanner(true)
    }
    reader.readAsDataURL(file)
  }

  const handleSaveBanner = async () => {
    try {
      await apiService.updateProfile({ banner: bannerPreview })
      setProfile(p => ({ ...p, banner: bannerPreview }))
      setEditingBanner(false)
      setBannerPreview(null)
    } catch (err) {
      console.error('Failed to save banner:', err)
    }
  }

  const handleRemoveBanner = async () => {
    try {
      await apiService.updateProfile({ banner: null })
      setProfile(p => ({ ...p, banner: null }))
      setEditingBanner(false)
      setBannerPreview(null)
    } catch (err) {
      console.error('Failed to remove banner:', err)
    }
  }

  const handleCancelBannerEdit = () => {
    setEditingBanner(false)
    setBannerPreview(null)
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'online': return 'var(--volt-success)'
      case 'idle': return 'var(--volt-warning)'
      case 'dnd': return 'var(--volt-danger)'
      case 'invisible': return 'var(--volt-text-muted)'
      default: return 'var(--volt-text-muted)'
    }
  }

  const getStatusText = (status) => {
    switch (status) {
      case 'online': return 'Online'
      case 'idle': return 'Idle'
      case 'dnd': return 'Do Not Disturb'
      case 'invisible': return 'Offline'
      default: return 'Offline'
    }
  }

  const isOwnProfile = currentUser?.id === userId

  if (loading) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content user-profile-modal" onClick={e => e.stopPropagation()}>
          <div className="loading-state">Loading...</div>
        </div>
      </div>
    )
  }

  const handleContextMenu = (e) => {
    e.preventDefault()
    const isSelf = userId === currentUser?.id
    
    const items = [
      {
        icon: <MessageSquare size={16} />,
        label: 'Send Message',
        shortcut: 'M',
        onClick: handleSendMessage,
        disabled: isSelf
      },
      ...(!isSelf ? [
        {
          icon: <UserPlus size={16} />,
          label: profile?.friendRequestSent ? 'Friend Request Sent' : 'Add Friend',
          shortcut: 'F',
          onClick: handleAddFriend,
          disabled: profile?.friendRequestSent || profile?.isFriend
        },
        profile?.isFriend ? {
          icon: <UserMinus size={16} />,
          label: 'Remove Friend',
          onClick: handleRemoveFriend,
          danger: true
        } : null,
        profile?.isBlocked ? {
          icon: <Ban size={16} />,
          label: 'Unblock User',
          onClick: handleUnblock
        } : {
          icon: <Ban size={16} />,
          label: 'Block User',
          onClick: handleBlock,
          danger: true
        },
      ] : []).filter(Boolean),
      { type: 'separator' },
      {
        icon: <Copy size={16} />,
        label: 'Copy User ID',
        shortcut: 'C',
        onClick: () => {
          navigator.clipboard.writeText(userId)
          setContextMenu(null)
        }
      },
    ]
    
    setContextMenu({ x: e.clientX, y: e.clientY, items })
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div 
        className="modal-content user-profile-modal" 
        onClick={e => e.stopPropagation()}
        onContextMenu={handleContextMenu}
      >
        <button className="modal-close" onClick={onClose}>
          <X size={24} />
        </button>

        <div 
          className="profile-banner"
          style={{ 
            backgroundImage: (editingBanner && bannerPreview) || bannerSrc
              ? `url(${editingBanner ? bannerPreview : bannerSrc})` 
              : undefined,
            backgroundColor: !editingBanner && !bannerSrc ? 'var(--volt-primary)' : undefined
          }}
        >
          {isOwnProfile && !editingBanner && (
            <button 
              className="banner-edit-btn" 
              onClick={() => fileInputRef.current?.click()}
              title="Change banner"
            >
              <Camera size={16} />
            </button>
          )}
          {isOwnProfile && editingBanner && (
            <div className="banner-edit-actions">
              <button className="banner-save-btn" onClick={handleSaveBanner}>
                <Check size={14} /> Save
              </button>
              {profile?.banner && (
                <button className="banner-remove-btn" onClick={handleRemoveBanner}>
                  <XCircle size={14} /> Remove
                </button>
              )}
              <button className="banner-cancel-btn" onClick={handleCancelBannerEdit}>
                Cancel
              </button>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleBannerUpload}
            style={{ display: 'none' }}
          />
        </div>

        <div className="profile-header">
          <div className="profile-avatar-container">
            <Avatar
              src={profile?.avatar || `${imageApiUrl}/api/images/users/${userId}/profile`}
              fallback={profile?.username}
              size={100}
              className="profile-avatar"
            />
            <div 
              className="profile-status-indicator"
              style={{ backgroundColor: getStatusColor(profile?.status) }}
            />
          </div>

          <div className="profile-info">
            <h2 className="profile-display-name">{profile?.displayName || profile?.customUsername || profile?.username}</h2>
            <p className="profile-username">@{profile?.customUsername || profile?.username}</p>
            {profile?.customUsername && (
              <p className="profile-original-username">Account: @{profile?.username}</p>
            )}
            {profile?.customStatus && (
              <p className="profile-custom-status">{profile.customStatus}</p>
            )}
            {server && members && (() => {
              const member = members.find(m => m.id === userId)
              const memberRoles = member?.roles || (member?.role ? [member.role] : [])
              if (memberRoles.length > 0) {
                return (
                  <div className="profile-roles">
                    {memberRoles.map(rid => {
                      const role = (server.roles || []).find(r => r.id === rid)
                      return role ? (
                        <span key={rid} className="profile-role-badge" style={{ backgroundColor: role.color + '22', color: role.color, borderColor: role.color }}>
                          <Shield size={12} />
                          {role.name}
                        </span>
                      ) : null
                    })}
                  </div>
                )
              }
              return null
            })()}
          </div>

          {!isOwnProfile && (
            <div className="profile-actions">
              <button className="btn btn-primary" onClick={handleSendMessage}>
                <MessageSquare size={18} />
                Message
              </button>
              
              {!profile?.isFriend && !profile?.friendRequestSent && !profile?.isBlocked && (
                <button className="btn btn-secondary" onClick={handleAddFriend}>
                  <UserPlus size={18} />
                  Add Friend
                </button>
              )}
              
              {profile?.friendRequestSent && (
                <button className="btn btn-secondary" onClick={handleCancelFriendRequest}>
                  <XCircle size={18} />
                  Cancel Request
                </button>
              )}
              
              {profile?.isFriend && (
                <button className="btn btn-secondary" onClick={handleRemoveFriend}>
                  <UserMinus size={18} />
                  Remove Friend
                </button>
              )}

              <div className="profile-menu-container">
                <button 
                  className="btn btn-secondary icon-only"
                  onClick={() => setShowMenu(!showMenu)}
                >
                  <MoreVertical size={18} />
                </button>
                {showMenu && (
                  <div className="profile-menu">
                    {profile?.isBlocked ? (
                      <button onClick={handleUnblock}>Unblock User</button>
                    ) : (
                      <button className="danger" onClick={handleBlock}>
                        <Ban size={16} />
                        Block User
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="profile-body">
          <div className="profile-section">
            <h4>About Me</h4>
            {profile?.bio ? (
              <div className="profile-bio">
                <MarkdownMessage content={profile.bio} />
              </div>
            ) : (
              <p className="no-bio">No bio set</p>
            )}
          </div>

          <div className="profile-section">
            <h4>Status</h4>
            <div className="profile-status-display">
              <span 
                className="status-dot"
                style={{ backgroundColor: getStatusColor(profile?.status) }}
              />
              <span>{getStatusText(profile?.status)}</span>
            </div>
          </div>

          {mutualServers.length > 0 && (
            <div className="profile-section">
              <h4>Mutual Servers ({mutualServers.length})</h4>
              <div className="mutual-servers-grid expanded">
                {mutualServers.map(srv => (
                  <div key={srv.id} className="mutual-server-item" title={srv.name}>
                    {srv.icon ? (
                      <img src={srv.icon} alt={srv.name} />
                    ) : (
                      <div className="mutual-server-acronym">
                        {srv.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <span className="mutual-server-name">{srv.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {mutualFriends.length > 0 && (
            <div className="profile-section">
              <h4>Mutual Friends ({mutualFriends.length})</h4>
              <div className="mutual-friends-grid expanded">
                {mutualFriends.map(friend => (
                  <div key={friend.id} className="mutual-friend-item" title={friend.displayName || friend.username}>
                    <Avatar
                      src={friend.avatar ? `${imageApiUrl}/api/images/users/${friend.id}/profile` : null}
                      fallback={friend.displayName || friend.username}
                      size={36}
                    />
                    <span className="mutual-friend-name">{friend.displayName || friend.username}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="profile-section">
            <h4>
              Connections
              {isOwnProfile && !editingSocials && (
                <button className="section-edit-btn" onClick={() => { setEditingSocials(true); setSocialDraft(profile?.socialLinks || {}) }}>
                  <Edit2 size={12} />
                </button>
              )}
            </h4>
            {editingSocials ? (
              <div className="social-links-edit">
                {SOCIAL_PLATFORMS.map(p => (
                  <div key={p.key} className="social-edit-row">
                    <p.icon size={16} />
                    <input
                      type="text"
                      placeholder={p.label}
                      value={socialDraft[p.key] || ''}
                      onChange={e => setSocialDraft(prev => ({ ...prev, [p.key]: e.target.value }))}
                    />
                  </div>
                ))}
                <div className="social-edit-actions">
                  <button className="btn btn-secondary btn-sm" onClick={() => setEditingSocials(false)}>Cancel</button>
                  <button className="btn btn-primary btn-sm" onClick={async () => {
                    const cleaned = {}
                    Object.entries(socialDraft).forEach(([k, v]) => { if (v.trim()) cleaned[k] = v.trim() })
                    try {
                      await apiService.updateProfile({ socialLinks: cleaned })
                      setProfile(p => ({ ...p, socialLinks: cleaned }))
                      setEditingSocials(false)
                    } catch (err) { console.error('Failed to save socials:', err) }
                  }}>
                    <Check size={12} /> Save
                  </button>
                </div>
              </div>
            ) : (
              <div className="social-links">
                {profile?.socialLinks && Object.keys(profile.socialLinks).length > 0 ? (
                  SOCIAL_PLATFORMS.filter(p => profile.socialLinks[p.key]).map(p => {
                    const value = profile.socialLinks[p.key]
                    const url = value.startsWith('http') ? value : (p.prefix + value)
                    return (
                      <a key={p.key} href={url} target="_blank" rel="noopener noreferrer" className="social-link" title={p.label}>
                        <p.icon size={16} />
                        <span>{value.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</span>
                      </a>
                    )
                  })
                ) : (
                  <p className="no-socials">No connections added</p>
                )}
              </div>
            )}
          </div>

          {profile?.createdAt && (
            <div className="profile-section">
              <h4>Member Since</h4>
              <p>{new Date(profile.createdAt).toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}</p>
            </div>
          )}
        </div>
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

export default UserProfileModal
