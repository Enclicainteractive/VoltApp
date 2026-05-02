import React, { useEffect, useRef, useState } from 'react'
import { ArrowPathIcon, ChatBubbleLeftRightIcon, CheckIcon, ClipboardDocumentIcon, NoSymbolIcon, UserMinusIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { useTranslation } from '../hooks/useTranslation'
import { apiService } from '../services/apiService'
import { useSocket } from '../contexts/SocketContext'
import lazyLoadingService from '../services/lazyLoadingService'
import Avatar from './Avatar'
import ContextMenu from './ContextMenu'
import { useResetScrollOnChange } from '../hooks/useResetScrollOnChange'
import '../assets/styles/FriendsPage.css'

const VALID_STATUSES = new Set(['online', 'idle', 'dnd', 'invisible', 'offline'])

const normalizePresenceAlias = (status) => {
  switch (status) {
    case 'active':
    case 'available':
      return 'online'
    case 'away':
      return 'idle'
    case 'busy':
    case 'do_not_disturb':
      return 'dnd'
    default:
      return status
  }
}

const normalizePresenceStatus = (status, fallback = null) => {
  if (typeof status !== 'string') return fallback
  const raw = status.trim().toLowerCase()
  if (!raw) return fallback
  const normalized = normalizePresenceAlias(raw)
  return VALID_STATUSES.has(normalized) ? normalized : fallback
}

const normalizePresenceUserId = (value) => {
  if (value === null || value === undefined) return null
  const normalized = String(value).trim()
  return normalized.length ? normalized : null
}

const readPresenceUserId = (payload = {}) => normalizePresenceUserId(
  payload.userId || payload.memberId || payload.user?.id || payload.id
)

const readPresenceEventTime = (payload, fallback = Date.now()) => {
  const raw = payload?.presenceUpdatedAt
    ?? payload?.statusUpdatedAt
    ?? payload?.updatedAt
    ?? payload?.timestamp
    ?? payload?.at
    ?? payload?.lastSeenAt
    ?? payload?.disconnectedAt
    ?? payload?.connectedAt

  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  const parsed = typeof raw === 'string' ? new Date(raw).getTime() : NaN
  return Number.isFinite(parsed) ? parsed : fallback
}

const normalizeFriendRecord = (friend) => {
  if (!friend || typeof friend !== 'object') return friend
  return {
    ...friend,
    status: normalizePresenceStatus(friend.status, 'offline'),
    presenceUpdatedAt: readPresenceEventTime(friend, 0)
  }
}

const FriendsPage = ({ onStartDM }) => {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState('online')
  const [friends, setFriends] = useState([])
  const [requests, setRequests] = useState({ incoming: [], outgoing: [] })
  const [blocked, setBlocked] = useState([])
  const [friendsLoading, setFriendsLoading] = useState(true)
  const [requestsLoading, setRequestsLoading] = useState(true)
  const [blockedLoading, setBlockedLoading] = useState(true)
  const [friendsError, setFriendsError] = useState('')
  const [requestsError, setRequestsError] = useState('')
  const [blockedError, setBlockedError] = useState('')
  const [addUsername, setAddUsername] = useState('')
  const [addError, setAddError] = useState('')
  const [addSuccess, setAddSuccess] = useState('')
  const [addLoading, setAddLoading] = useState(false)
  const [contextMenu, setContextMenu] = useState(null)
  const reconnectResyncAtRef = useRef(0)
  const pendingOfflineTimersRef = useRef(new Map())
  const latestPresenceEventAtRef = useRef(new Map())
  const { socket, connected } = useSocket()
  const contentRef = useResetScrollOnChange([activeTab])

  useEffect(() => {
    loadFriends()
    loadRequests()
    loadBlocked()
    lazyLoadingService.preloadComponents(['DMList', 'DMChat'], { idle: true })
  }, [])

  useEffect(() => {
    if (!socket || !connected) return

    const timers = pendingOfflineTimersRef.current

    const clearPendingOffline = (userId) => {
      const timeoutId = timers.get(userId)
      if (timeoutId) {
        clearTimeout(timeoutId)
        timers.delete(userId)
      }
    }

    const markEventIfFresh = (userId, payload) => {
      const eventAt = readPresenceEventTime(payload)
      const lastEventAt = latestPresenceEventAtRef.current.get(userId) || 0
      if (eventAt < lastEventAt) return null
      latestPresenceEventAtRef.current.set(userId, eventAt)
      return eventAt
    }

    const applyFriendPresence = (userId, status, customStatus, hasCustomStatus = false, eventAt = Date.now()) => {
      const normalizedUserId = normalizePresenceUserId(userId)
      if (!normalizedUserId) return

      setFriends((prev) => {
        let changed = false
        const next = prev.map((friend) => {
          if (normalizePresenceUserId(friend.id) !== normalizedUserId) return friend

          const currentEventAt = Number(friend.presenceUpdatedAt) || 0
          if (currentEventAt > eventAt) return friend

          const patch = {}

          if (status && status !== friend.status) {
            patch.status = status
          }

          if (hasCustomStatus) {
            const normalizedCustom = customStatus ?? null
            if (friend.customStatus !== normalizedCustom) {
              patch.customStatus = normalizedCustom
            }
          }

          if (currentEventAt !== eventAt) {
            patch.presenceUpdatedAt = eventAt
          }

          if (Object.keys(patch).length === 0) return friend
          changed = true
          return { ...friend, ...patch }
        })

        return changed ? next : prev
      })
    }

    const handleStatusUpdate = (payload = {}) => {
      const userId = readPresenceUserId(payload)
      if (!userId) return

      const nextStatus = normalizePresenceStatus(payload.status)
      const hasCustomStatus = payload.customStatus !== undefined
      if (!nextStatus && !hasCustomStatus) return

      const eventAt = markEventIfFresh(userId, payload)
      if (!eventAt) return

      clearPendingOffline(userId)
      applyFriendPresence(userId, nextStatus, payload.customStatus, hasCustomStatus, eventAt)
    }

    const handleMemberOnline = (payload = {}) => {
      const userId = readPresenceUserId(payload)
      if (!userId) return

      const nextStatus = normalizePresenceStatus(payload.status, 'online')
      const hasCustomStatus = payload.customStatus !== undefined
      const eventAt = markEventIfFresh(userId, payload)
      if (!eventAt) return

      clearPendingOffline(userId)
      applyFriendPresence(userId, nextStatus, payload.customStatus, hasCustomStatus, eventAt)
    }

    const handleMemberOffline = (payload = {}) => {
      const userId = readPresenceUserId(payload)
      if (!userId) return

      const eventAt = markEventIfFresh(userId, payload)
      if (!eventAt) return

      clearPendingOffline(userId)
      const timeoutId = setTimeout(() => {
        const activeTimeout = timers.get(userId)
        if (activeTimeout !== timeoutId) return
        timers.delete(userId)

        const latestEventAt = latestPresenceEventAtRef.current.get(userId) || 0
        if (latestEventAt > eventAt) return

        applyFriendPresence(userId, 'offline', undefined, false, eventAt)
      }, 2200)

      timers.set(userId, timeoutId)
    }

    socket.on('user:status', handleStatusUpdate)
    socket.on('member:online', handleMemberOnline)
    socket.on('member:offline', handleMemberOffline)

    return () => {
      socket.off('user:status', handleStatusUpdate)
      socket.off('member:online', handleMemberOnline)
      socket.off('member:offline', handleMemberOffline)

      for (const timeoutId of timers.values()) {
        clearTimeout(timeoutId)
      }
      timers.clear()
    }
  }, [socket, connected])

  const loadFriends = async () => {
    setFriendsLoading(true)
    setFriendsError('')
    try {
      const response = await apiService.getFriends()
      const nextFriends = Array.isArray(response.data) ? response.data.map(normalizeFriendRecord) : []
      setFriends(nextFriends)

      for (const friend of nextFriends) {
        const friendId = normalizePresenceUserId(friend?.id)
        if (!friendId) continue
        const eventAt = Number(friend.presenceUpdatedAt) || 0
        if (!eventAt) continue
        const currentLatest = latestPresenceEventAtRef.current.get(friendId) || 0
        if (eventAt > currentLatest) {
          latestPresenceEventAtRef.current.set(friendId, eventAt)
        }
      }
    } catch (error) {
      console.error('Failed to load friends:', error)
      setFriends([])
      setFriendsError(t('friends.loadFailed', 'Failed to load friends.'))
    } finally {
      setFriendsLoading(false)
    }
  }

  const loadRequests = async () => {
    setRequestsLoading(true)
    setRequestsError('')
    try {
      const response = await apiService.getFriendRequests()
      setRequests(response.data || { incoming: [], outgoing: [] })
    } catch (error) {
      console.error('Failed to load friend requests:', error)
      setRequests({ incoming: [], outgoing: [] })
      setRequestsError(t('friends.requestsLoadFailed', 'Failed to load friend requests.'))
    } finally {
      setRequestsLoading(false)
    }
  }

  const loadBlocked = async () => {
    setBlockedLoading(true)
    setBlockedError('')
    try {
      const response = await apiService.getBlockedUsers()
      setBlocked(response.data || [])
    } catch (error) {
      console.error('Failed to load blocked users:', error)
      setBlocked([])
      setBlockedError(t('friends.blockedLoadFailed', 'Failed to load blocked users.'))
    } finally {
      setBlockedLoading(false)
    }
  }

  useEffect(() => {
    if (!connected) return
    const now = Date.now()
    if (now - reconnectResyncAtRef.current < 2500) return
    reconnectResyncAtRef.current = now

    loadFriends()
    loadRequests()
    loadBlocked()
  }, [connected])

  const handleUnblock = async (userId) => {
    try {
      await apiService.unblockUser(userId)
      setBlocked((prev) => prev.filter((u) => u.id !== userId))
    } catch (error) {
      console.error('Failed to unblock user:', error)
    }
  }

  const handleSendRequest = async (e) => {
    e.preventDefault()
    setAddError('')
    setAddSuccess('')

    if (!addUsername.trim()) {
      setAddError(t('friends.enterUsername', 'Please enter a username'))
      return
    }

    setAddLoading(true)
    try {
      await apiService.sendFriendRequest(addUsername.trim())
      setAddSuccess(t('friends.requestSentTo', 'Friend request sent to {{username}}!', { username: addUsername }))
      setAddUsername('')
      loadRequests()
    } catch (error) {
      setAddError(error.response?.data?.error || t('friends.sendRequestFailed', 'Failed to send friend request'))
    } finally {
      setAddLoading(false)
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
    if (!confirm(t('friends.removeConfirm', 'Are you sure you want to remove this friend?'))) return
    try {
      await apiService.removeFriend(friendId)
      loadFriends()
    } catch (error) {
      console.error('Failed to remove friend:', error)
    }
  }

  const handleBlockFriend = async (friendId) => {
    if (!confirm(t('friends.blockConfirmLong', 'Are you sure you want to block this user? They will be removed from your friends and blocked.'))) return
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
      lazyLoadingService.preloadComponents(['DMChat', 'ChatInput'], { idle: false })
      const response = await apiService.createDirectMessage(friendId)
      if (onStartDM) {
        onStartDM(response.data)
      }
    } catch (error) {
      console.error('Failed to start DM:', error)
    }
  }

  const onlineFriends = (friends || []).filter((f) => f.status === 'online' || f.status === 'idle' || f.status === 'dnd')
  const pendingCount = (requests.incoming?.length || 0) + (requests.outgoing?.length || 0)
  const displayedFriends = activeTab === 'online' ? onlineFriends : (friends || [])

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
            type="button"
            className={`tab ${activeTab === 'online' ? 'active' : ''}`}
            onMouseEnter={() => lazyLoadingService.preloadComponents(['DMChat'], { idle: true })}
            onFocus={() => lazyLoadingService.preloadComponents(['DMChat'], { idle: true })}
            onClick={() => setActiveTab('online')}
            aria-pressed={activeTab === 'online'}
          >
            {t('friends.online')}
          </button>
          <button
            type="button"
            className={`tab ${activeTab === 'all' ? 'active' : ''}`}
            onMouseEnter={() => lazyLoadingService.preloadComponents(['DMChat'], { idle: true })}
            onFocus={() => lazyLoadingService.preloadComponents(['DMChat'], { idle: true })}
            onClick={() => setActiveTab('all')}
            aria-pressed={activeTab === 'all'}
          >
            {t('friends.all')}
          </button>
          <button
            type="button"
            className={`tab ${activeTab === 'pending' ? 'active' : ''}`}
            onClick={() => setActiveTab('pending')}
            aria-pressed={activeTab === 'pending'}
          >
            {t('friends.pending')} {pendingCount > 0 && <span className="badge">{pendingCount}</span>}
          </button>
          <button
            type="button"
            className={`tab add-friend-tab ${activeTab === 'add' ? 'active' : ''}`}
            onClick={() => setActiveTab('add')}
            aria-pressed={activeTab === 'add'}
          >
            {t('friends.addFriend')}
          </button>
          <button
            type="button"
            className={`tab ${activeTab === 'blocked' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('blocked')
              if (!blockedLoading) {
                loadBlocked()
              }
            }}
            aria-pressed={activeTab === 'blocked'}
          >
            {t('friends.blocked')} {blocked.length > 0 && <span className="badge">{blocked.length}</span>}
          </button>
        </div>
      </div>

      <div ref={contentRef} className="friends-content">
        {activeTab === 'add' && (
          <div className="add-friend-section friends-pane">
            <h3>{t('friends.addFriend')}</h3>
            <p>{t('friends.addFriendsHint')}</p>
            <form className="add-friend-form" onSubmit={handleSendRequest}>
              <div className="add-friend-input-wrapper">
                <input
                  type="text"
                  className="input"
                  placeholder={t('friends.enterUsername') || 'Enter a username'}
                  value={addUsername}
                  onChange={(e) => setAddUsername(e.target.value)}
                />
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={!addUsername.trim() || addLoading}
                  aria-busy={addLoading}
                >
                  {addLoading ? t('common.sending', 'Sending...') : t('friends.sendRequest')}
                </button>
              </div>
              {addError && <p className="error-text" role="alert" aria-live="polite">{addError}</p>}
              {addSuccess && <p className="success-text" role="status" aria-live="polite">{addSuccess}</p>}
            </form>
          </div>
        )}

        {activeTab === 'pending' && (
          <div className="pending-section friends-pane">
            {requestsLoading ? (
              <div className="loading-inline" role="status" aria-live="polite">{t('common.loading', 'Loading...')}</div>
            ) : requestsError ? (
              <div className="empty-state-inline">
                <p className="error-text">{requestsError}</p>
                <button type="button" className="btn btn-secondary" onClick={loadRequests}>
                  <ArrowPathIcon size={16} />
                  {t('common.retry', 'Retry')}
                </button>
              </div>
            ) : (
              <>
                {requests.incoming?.length > 0 && (
                  <>
                    <h4 className="section-title">{t('friends.incomingRequests').toUpperCase()} — {requests.incoming?.length || 0}</h4>
                    <div className="friends-list">
                      {(requests.incoming || []).map((request) => (
                        <div
                          key={request.id}
                          className="friend-item"
                          onContextMenu={(e) => {
                            e.preventDefault()
                            const items = [
                              {
                                icon: <CheckIcon size={16} />,
                                label: t('friends.accept'),
                                onClick: () => handleAcceptRequest(request.id)
                              },
                              {
                                icon: <XMarkIcon size={16} />,
                                label: t('friends.decline'),
                                onClick: () => handleRejectRequest(request.id),
                                danger: true
                              },
                              { type: 'separator' },
                              {
                                icon: <ClipboardDocumentIcon size={16} />,
                                label: t('account.userId'),
                                onClick: () => navigator?.clipboard?.writeText(request.from)
                              }
                            ]
                            setContextMenu({ x: e.clientX, y: e.clientY, items })
                          }}
                        >
                          <Avatar
                            src={request.fromAvatar || request.fromImageUrl || null}
                            fallback={request.fromUsername || '?'}
                            size={40}
                            userId={request.from}
                          />
                          <div className="friend-info">
                            <span className="friend-name">{request.fromUsername}</span>
                            <span className="friend-status">{t('friends.friendRequest')}</span>
                          </div>
                          <div className="friend-actions">
                            <button
                              type="button"
                              className="icon-btn accept"
                              onClick={() => handleAcceptRequest(request.id)}
                              title={t('friends.accept')}
                            >
                              <CheckIcon size={20} />
                            </button>
                            <button
                              type="button"
                              className="icon-btn reject"
                              onClick={() => handleRejectRequest(request.id)}
                              title={t('friends.decline')}
                            >
                              <XMarkIcon size={20} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {requests.outgoing?.length > 0 && (
                  <>
                    <h4 className="section-title">{t('friends.outgoingRequests').toUpperCase()} — {requests.outgoing?.length || 0}</h4>
                    <div className="friends-list">
                      {(requests.outgoing || []).map((request) => (
                        <div
                          key={request.id}
                          className="friend-item"
                          onContextMenu={(e) => {
                            e.preventDefault()
                            const items = [
                              {
                                icon: <XMarkIcon size={16} />,
                                label: t('friends.cancel'),
                                onClick: () => handleCancelRequest(request.id),
                                danger: true
                              },
                              { type: 'separator' },
                              {
                                icon: <ClipboardDocumentIcon size={16} />,
                                label: t('account.userId'),
                                onClick: () => navigator?.clipboard?.writeText(request.to)
                              }
                            ]
                            setContextMenu({ x: e.clientX, y: e.clientY, items })
                          }}
                        >
                          <Avatar
                            src={request.toAvatar || request.toImageUrl || null}
                            fallback={request.toUsername || '?'}
                            size={40}
                            userId={request.to}
                          />
                          <div className="friend-info">
                            <span className="friend-name">{request.toUsername || t('common.user', 'User')}</span>
                            <span className="friend-status">{t('friends.yourRequest')}</span>
                          </div>
                          <div className="friend-actions">
                            <button
                              type="button"
                              className="icon-btn reject"
                              onClick={() => handleCancelRequest(request.id)}
                              title={t('friends.cancel')}
                            >
                              <XMarkIcon size={20} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {!requests.incoming?.length && !requests.outgoing?.length && (
                  <div className="empty-state-inline">
                    <p>{t('friends.noPending', 'No pending friend requests')}</p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === 'blocked' && (
          <div className="blocked-section friends-pane">
            <h3>{t('friends.blocked')}</h3>
            <p>{t('friends.blockedHint') || 'Blocked users cannot message you or see your online status.'}</p>

            {blockedLoading ? (
              <div className="loading-inline" role="status" aria-live="polite">{t('common.loading', 'Loading...')}</div>
            ) : blockedError ? (
              <div className="empty-state-inline">
                <p className="error-text">{blockedError}</p>
                <button type="button" className="btn btn-secondary" onClick={loadBlocked}>
                  <ArrowPathIcon size={16} />
                  {t('common.retry', 'Retry')}
                </button>
              </div>
            ) : blocked.length === 0 ? (
              <div className="empty-state-inline">
                <p>{t('friends.noBlocked') || "You haven't blocked anyone"}</p>
              </div>
            ) : (
              <div className="friends-list">
                {blocked.map((user) => (
                  <div
                    key={user.id}
                    className="friend-item"
                    onContextMenu={(e) => {
                      e.preventDefault()
                      const items = [
                        {
                          icon: <XMarkIcon size={16} />,
                          label: t('friends.unblock'),
                          onClick: () => handleUnblock(user.id)
                        },
                        { type: 'separator' },
                        {
                          icon: <ClipboardDocumentIcon size={16} />,
                          label: t('account.userId'),
                          onClick: () => navigator?.clipboard?.writeText(user.id)
                        }
                      ]
                      setContextMenu({ x: e.clientX, y: e.clientY, items })
                    }}
                  >
                    <Avatar
                      src={user.avatar}
                      fallback={user.username}
                      size={32}
                      userId={user.id}
                    />
                    <div className="friend-info">
                      <span className="friend-name">{user.username}</span>
                      <span className="friend-status">{t('friends.blocked')}</span>
                    </div>
                    <div className="friend-actions">
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => handleUnblock(user.id)}
                        title={t('friends.unblock', 'Unblock')}
                      >
                        <XMarkIcon size={20} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {(activeTab === 'online' || activeTab === 'all') && (
          <div className="friends-section friends-pane">
            <h4 className="section-title">
              {activeTab === 'online' ? t('friends.online').toUpperCase() : t('friends.all').toUpperCase()} — {displayedFriends.length}
            </h4>

            {friendsLoading ? (
              <div className="loading-inline" role="status" aria-live="polite">{t('common.loading', 'Loading...')}</div>
            ) : friendsError ? (
              <div className="empty-state-inline">
                <p className="error-text">{friendsError}</p>
                <button type="button" className="btn btn-secondary" onClick={loadFriends}>
                  <ArrowPathIcon size={16} />
                  {t('common.retry', 'Retry')}
                </button>
              </div>
            ) : displayedFriends.length === 0 ? (
              <div className="empty-state-inline">
                <p>{activeTab === 'online' ? t('friends.noFriendsOnlineNow', 'No friends are online right now') : t('friends.noFriendsYetAdd', 'You have no friends yet. Add some!')}</p>
                {activeTab === 'all' && (
                  <button type="button" className="btn btn-primary" onClick={() => setActiveTab('add')}>
                    {t('friends.addFriend')}
                  </button>
                )}
              </div>
            ) : (
              <div className="friends-list">
                {displayedFriends.map((friend) => (
                  <div
                    key={friend.id}
                    className="friend-item"
                    onContextMenu={(e) => {
                      e.preventDefault()
                      const items = [
                        {
                          icon: <ChatBubbleLeftRightIcon size={16} />,
                          label: t('member.message', 'Message'),
                          shortcut: 'M',
                          onClick: () => handleMessageFriend(friend.id)
                        },
                        {
                          icon: <NoSymbolIcon size={16} />,
                          label: t('friends.block', 'Block'),
                          onClick: () => handleBlockFriend(friend.id),
                          danger: true
                        },
                        {
                          icon: <UserMinusIcon size={16} />,
                          label: t('friends.unfriend', 'Remove Friend'),
                          onClick: () => handleRemoveFriend(friend.id),
                          danger: true
                        },
                        { type: 'separator' },
                        {
                          icon: <ClipboardDocumentIcon size={16} />,
                          label: t('account.userId', 'Copy User ID'),
                          onClick: () => navigator?.clipboard?.writeText(friend.id)
                        }
                      ]
                      setContextMenu({ x: e.clientX, y: e.clientY, items })
                    }}
                  >
                    <div className="friend-avatar-wrapper">
                      <Avatar
                        src={friend.avatar}
                        fallback={friend.username}
                        size={40}
                        userId={friend.id}
                      />
                      <div
                        className="status-dot"
                        style={{ backgroundColor: getStatusColor(friend.status) }}
                      />
                    </div>
                    <div className="friend-info">
                      <span className="friend-name">{friend.displayName || friend.username}</span>
                      <span className="friend-status">
                        {friend.customStatus || t(`status.${friend.status || 'offline'}`, t('status.offline', 'Offline'))}
                      </span>
                    </div>
                    <div className="friend-actions">
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => handleMessageFriend(friend.id)}
                        title={t('member.message', 'Message')}
                      >
                        <ChatBubbleLeftRightIcon size={20} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn danger"
                        onClick={() => handleBlockFriend(friend.id)}
                        title={t('friends.block', 'Block User')}
                      >
                        <NoSymbolIcon size={20} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn danger"
                        onClick={() => handleRemoveFriend(friend.id)}
                        title={t('friends.unfriend', 'Remove Friend')}
                      >
                        <UserMinusIcon size={20} />
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
