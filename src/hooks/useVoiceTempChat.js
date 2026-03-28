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
  const hasRequestedHistoryRef = useRef(false)
  const prevParticipantsLengthRef = useRef(participants.length)

  const getMessageId = useCallback(() => {
    return `${Date.now()}-${++messageIdRef.current}`
  }, [])

  const requestHistory = useCallback(() => {
    if (!socket || !channelId) return
    console.log('[VoiceTempChat] Requesting chat history for channel:', channelId)
    socket.emit('voice:temp-chat:request-history', { channelId })
  }, [socket, channelId])

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

    console.log('[VoiceTempChat] Sending message to channel:', channelId, message)
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
      hasRequestedHistoryRef.current = false // reset flag when history received
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

    console.log('[VoiceTempChat] Joining temp chat for channel:', channelId)
    socket.emit('voice:temp-chat:join', { channelId })
    
    // Request history after joining (server may send automatically, but we request to be sure)
    if (!hasRequestedHistoryRef.current) {
      hasRequestedHistoryRef.current = true
      // Small delay to allow server to process join
      setTimeout(() => {
        requestHistory()
      }, 500)
    }

    return () => {
      socket.off('voice:temp-chat:message', handleTempChatMessage)
      socket.off('voice:temp-chat:history', handleTempChatHistory)
      socket.off('voice:temp-chat:clear', handleTempChatClear)
      console.log('[VoiceTempChat] Leaving temp chat for channel:', channelId)
      socket.emit('voice:temp-chat:leave', { channelId })
    }
  }, [socket, isConnected, channelId, isVisible, notificationsEnabled, user, requestHistory])

  useEffect(() => {
    const currentLength = participants.length
    const previousLength = prevParticipantsLengthRef.current
    prevParticipantsLengthRef.current = currentLength

    // Clear messages when alone (no one else to chat with)
    if (currentLength <= 1 && messages.length > 0) {
      setMessages([])
      setUnreadCount(0)
      return
    }

    // If participants increased (someone joined) and we have no messages, request history
    if (currentLength > previousLength && messages.length === 0 && !hasRequestedHistoryRef.current) {
      hasRequestedHistoryRef.current = true
      requestHistory()
    }
  }, [participants.length, messages.length, requestHistory])

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
