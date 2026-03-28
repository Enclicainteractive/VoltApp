import React, { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  XMarkIcon, AtSymbolIcon, BellIcon, ChatBubbleLeftRightIcon,
  ClockIcon, SignalIcon, UserPlusIcon, UsersIcon,
  PhoneIcon, PhoneXMarkIcon, MicrophoneIcon, SpeakerXMarkIcon
} from '@heroicons/react/24/outline'
import { useSocket } from '../contexts/SocketContext'
import { useCall } from '../contexts/CallContext'
import '../assets/styles/NotificationToast.css'

const AUTO_DISMISS_MS = 6000

const NotificationToast = () => {
  const { notifications, removeNotification } = useSocket()
  const { activeCall, callStatus, callDuration, endCall, toggleMute, toggleDeafen, isMuted, isDeafened, formatDuration } = useCall?.() ?? {}
  const navigate = useNavigate()
  const timersRef = useRef({})

  // Auto-dismiss non-call notifications
  useEffect(() => {
    notifications.forEach((n) => {
      if (n.type === 'call') return // call toasts are persistent
      if (timersRef.current[n.id]) return
      timersRef.current[n.id] = setTimeout(() => {
        removeNotification(n.id)
        delete timersRef.current[n.id]
      }, AUTO_DISMISS_MS)
    })
    // Clean up timers for removed notifications
    Object.keys(timersRef.current).forEach((id) => {
      if (!notifications.find((n) => n.id === id)) {
        clearTimeout(timersRef.current[id])
        delete timersRef.current[id]
      }
    })
  }, [notifications, removeNotification])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      Object.values(timersRef.current).forEach(clearTimeout)
    }
  }, [])

  if (notifications.length === 0 && !activeCall) return null

  const openNotification = (notification) => {
    removeNotification(notification.id)
    if (!notification?.deeplink) return
    navigate(notification.deeplink)
  }

  const getIcon = (type, notificationType) => {
    if (notificationType === 'call') return <PhoneIcon width={18} height={18} />
    if (notificationType === 'mention') {
      if (type === 'everyone') return <UsersIcon width={18} height={18} />
      if (type === 'here') return <SignalIcon width={18} height={18} />
      return <AtSymbolIcon width={18} height={18} />
    }
    if (notificationType === 'dm') return <ChatBubbleLeftRightIcon width={18} height={18} />
    if (notificationType === 'friend-request') return <UserPlusIcon width={18} height={18} />
    if (notificationType === 'system') return <BellIcon width={18} height={18} />
    return <BellIcon width={18} height={18} />
  }

  const getTypeClass = (type, notificationType) => {
    if (notificationType === 'call') return 'call'
    if (notificationType === 'system') return 'system'
    if (notificationType === 'dm') return 'dm'
    if (notificationType === 'friend-request') return 'friend-request'
    if (type === 'everyone') return 'everyone'
    if (type === 'here') return 'here'
    return notificationType === 'mention' ? 'user' : 'default'
  }

  const getMetaLabel = (notification) => {
    if (notification.type === 'call') return 'Active Call'
    if (notification.type === 'system') return 'System update'
    if (notification.type === 'dm') return 'Direct message'
    if (notification.type === 'friend-request') return 'Friend request'
    if (notification.type === 'mention') return 'Mention'
    return 'Notification'
  }

  const formatTime = (timestamp) => {
    const date = timestamp instanceof Date ? timestamp : new Date(timestamp || Date.now())
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const renderNotificationText = (value, fallback = '') => {
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
    if (value && typeof value === 'object') {
      if (typeof value.content === 'string') return value.content
      if (typeof value.message === 'string') return value.message
      if (typeof value.body === 'string') return value.body
      if (typeof value.title === 'string') return value.title
    }
    return fallback
  }

  // Active call banner (shown at top of notification stack when in a call)
  const renderActiveCallBanner = () => {
    if (!activeCall || callStatus !== 'active') return null
    return (
      <div className="notification-toast call-active-banner">
        <div className="notification-icon call-icon">
          <PhoneIcon width={18} height={18} />
        </div>
        <div className="notification-content">
          <div className="notification-topline">
            <span className="notification-label">Active Call</span>
            <span className="notification-time call-duration">
              {formatDuration ? formatDuration(callDuration || 0) : '0:00'}
            </span>
          </div>
          <div className="notification-title">
            {activeCall.recipientName || activeCall.channelName || 'Voice Call'}
          </div>
        </div>
        <div className="call-banner-actions">
          <button
            className={`call-banner-btn ${isMuted ? 'active danger' : ''}`}
            onClick={(e) => { e.stopPropagation(); toggleMute?.() }}
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            <MicrophoneIcon width={14} height={14} />
          </button>
          <button
            className={`call-banner-btn ${isDeafened ? 'active danger' : ''}`}
            onClick={(e) => { e.stopPropagation(); toggleDeafen?.() }}
            title={isDeafened ? 'Undeafen' : 'Deafen'}
          >
            <SpeakerXMarkIcon width={14} height={14} />
          </button>
          <button
            className="call-banner-btn end-call"
            onClick={(e) => { e.stopPropagation(); endCall?.() }}
            title="End Call"
          >
            <PhoneXMarkIcon width={14} height={14} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="notification-container">
      {renderActiveCallBanner()}
      {notifications.map((notification) => {
        const titleText = renderNotificationText(notification.title)
        const mentionType = titleText.includes('@everyone') ? 'everyone' : titleText.includes('@here') ? 'here' : 'user'
        const typeClass = getTypeClass(mentionType, notification.type)

        return (
          <div
            key={notification.id}
            className={`notification-toast ${typeClass}`}
            onClick={() => openNotification(notification)}
          >
            <div className="notification-icon">
              {getIcon(mentionType, notification.type)}
            </div>
            <div className="notification-content">
              <div className="notification-topline">
                <span className="notification-label">{getMetaLabel(notification)}</span>
                <span className="notification-time">
                  <ClockIcon width={12} height={12} />
                  {formatTime(notification.timestamp)}
                </span>
              </div>
              <div className="notification-title">{titleText || 'VoltChat'}</div>
              <div className="notification-message">{renderNotificationText(notification.message)}</div>
            </div>
            <button
              className="notification-close"
              onClick={(e) => {
                e.stopPropagation()
                removeNotification(notification.id)
              }}
            >
              <XMarkIcon width={14} height={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}

export default NotificationToast
