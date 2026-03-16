import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useSocket } from '../contexts/SocketContext'

const MAX_MESSAGES = 100

export const useVoiceTempChat = (participants, isConnected, channelId) => {
  const { user } = useAuth()
  const { socket } = useSocket()
  const [messages, setMessages] = useState([])
  const [isVisible, setIsVisible] = useState(true)
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)
  const [unreadCount, setUnreadCount] = useState(0)
  
  const messageIdRef = useRef(0)

  const getMessageId = useCallback(() => {
    return `${Date.now()}-${++messageIdRef.current}`
  }, [])

  const sendMessage = useCallback((content) => {
    if (!content?.trim() || !user || !socket) return

    const message = {
      id: getMessageId(),
      content: content.trim(),
      senderId: user.id,
      senderName: user.username,
      senderAvatar: user.avatar,
      senderProfile: user.profile || null,
      timestamp: Date.now()
    }

    setMessages(prev => {
      const updated = [...prev, message]
      if (updated.length > MAX_MESSAGES) {
        return updated.slice(-MAX_MESSAGES)
      }
      return updated
    })

    socket.emit('voice:temp-chat:message', {
      channelId,
      message
    })
  }, [user, socket, channelId, getMessageId])

  useEffect(() => {
    if (!socket || !isConnected) return

    const handleTempChatMessage = ({ message }) => {
      setMessages(prev => {
        if (prev.some(m => m.id === message.id)) return prev
        const updated = [...prev, message]
        if (updated.length > MAX_MESSAGES) {
          return updated.slice(-MAX_MESSAGES)
        }
        return updated
      })
      
      if (!isVisible && notificationsEnabled && message.senderId !== user?.id) {
        setUnreadCount(prev => prev + 1)
      }
    }

    const handleTempChatHistory = ({ messages: history }) => {
      if (!Array.isArray(history)) return
      setMessages(prev => {
        const existingIds = new Set(prev.map(m => m.id))
        const newMessages = history.filter(m => !existingIds.has(m.id))
        const updated = [...prev, ...newMessages]
          .sort((a, b) => a.timestamp - b.timestamp)
          .slice(-MAX_MESSAGES)
        return updated
      })
    }

    const handleTempChatClear = () => {
      setMessages([])
      setUnreadCount(0)
    }

    socket.on('voice:temp-chat:message', handleTempChatMessage)
    socket.on('voice:temp-chat:history', handleTempChatHistory)
    socket.on('voice:temp-chat:clear', handleTempChatClear)

    socket.emit('voice:temp-chat:join', { channelId })

    return () => {
      socket.off('voice:temp-chat:message', handleTempChatMessage)
      socket.off('voice:temp-chat:history', handleTempChatHistory)
      socket.off('voice:temp-chat:clear', handleTempChatClear)
      socket.emit('voice:temp-chat:leave', { channelId })
    }
  }, [socket, isConnected, channelId, isVisible, notificationsEnabled, user])

  useEffect(() => {
    if (participants.length <= 1 && messages.length > 0) {
      setMessages([])
      setUnreadCount(0)
    }
  }, [participants.length])

  const clearMessages = useCallback(() => {
    setMessages([])
    setUnreadCount(0)
  }, [])

  const toggleVisibility = useCallback(() => {
    setIsVisible(prev => {
      if (!prev) {
        setUnreadCount(0)
      }
      return !prev
    })
  }, [])

  const markAsRead = useCallback(() => {
    setUnreadCount(0)
  }, [])

  return {
    messages,
    sendMessage,
    isVisible,
    setIsVisible,
    toggleVisibility,
    notificationsEnabled,
    setNotificationsEnabled,
    unreadCount,
    markAsRead,
    clearMessages,
    participants
  }
}

export default useVoiceTempChat
