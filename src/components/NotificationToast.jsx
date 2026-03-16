import React from 'react'
import { useNavigate } from 'react-router-dom'
import { XMarkIcon, AtSymbolIcon, BellIcon, ChatBubbleLeftRightIcon, ClockIcon, SignalIcon, UserPlusIcon, UsersIcon } from '@heroicons/react/24/outline'
import { useSocket } from '../contexts/SocketContext'
import '../assets/styles/NotificationToast.css'

const NotificationToast = () => {
  const { notifications, removeNotification } = useSocket()
  const navigate = useNavigate()

  if (notifications.length === 0) return null

  const openNotification = (notification) => {
    removeNotification(notification.id)

    if (!notification?.deeplink) return

    navigate(notification.deeplink)
  }

  const getIcon = (type, notificationType) => {
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
    if (notificationType === 'system') return 'system'
    if (notificationType === 'dm') return 'dm'
    if (notificationType === 'friend-request') return 'friend-request'
    if (type === 'everyone') return 'everyone'
    if (type === 'here') return 'here'
    return notificationType === 'mention' ? 'user' : 'default'
  }

  const getMetaLabel = (notification) => {
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

  return (
    <div className="notification-container">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className={`notification-toast ${getTypeClass(renderNotificationText(notification.title).includes('@everyone') ? 'everyone' : renderNotificationText(notification.title).includes('@here') ? 'here' : 'user', notification.type)}`}
          onClick={() => openNotification(notification)}
        >
          <div className="notification-icon">
            {getIcon(
              renderNotificationText(notification.title).includes('@everyone') ? 'everyone' : renderNotificationText(notification.title).includes('@here') ? 'here' : 'user',
              notification.type
            )}
          </div>
          <div className="notification-content">
            <div className="notification-topline">
              <span className="notification-label">{getMetaLabel(notification)}</span>
              <span className="notification-time">
                <ClockIcon width={12} height={12} />
                {formatTime(notification.timestamp)}
              </span>
            </div>
            <div className="notification-title">{renderNotificationText(notification.title, 'VoltChat')}</div>
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
      ))}
    </div>
  )
}

export default NotificationToast
