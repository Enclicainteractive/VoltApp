import React from 'react'
import { X, AtSign, Users, Radio } from 'lucide-react'
import { useSocket } from '../contexts/SocketContext'
import '../assets/styles/NotificationToast.css'

const NotificationToast = () => {
  const { notifications, removeNotification } = useSocket()

  if (notifications.length === 0) return null

  const getIcon = (type, notificationType) => {
    if (notificationType === 'mention') {
      if (type === 'everyone') return <Users size={18} />
      if (type === 'here') return <Radio size={18} />
      return <AtSign size={18} />
    }
    return null
  }

  const getTypeClass = (type) => {
    if (type === 'everyone') return 'everyone'
    if (type === 'here') return 'here'
    return 'user'
  }

  return (
    <div className="notification-container">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className={`notification-toast ${getTypeClass(notification.title?.includes('@everyone') ? 'everyone' : notification.title?.includes('@here') ? 'here' : 'user')}`}
          onClick={() => removeNotification(notification.id)}
        >
          <div className="notification-icon">
            {getIcon(
              notification.title?.includes('@everyone') ? 'everyone' : notification.title?.includes('@here') ? 'here' : 'user',
              notification.type
            )}
          </div>
          <div className="notification-content">
            <div className="notification-title">{notification.title}</div>
            <div className="notification-message">{notification.message}</div>
          </div>
          <button 
            className="notification-close"
            onClick={(e) => {
              e.stopPropagation()
              removeNotification(notification.id)
            }}
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}

export default NotificationToast
