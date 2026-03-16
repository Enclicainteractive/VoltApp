import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import Avatar from './Avatar'
import { BellIcon, BellSlashIcon, XMarkIcon } from '@heroicons/react/24/outline'
import './VoiceChannelTempChat.css'

const VoiceChannelTempChat = ({
  messages,
  onSendMessage,
  isVisible,
  onToggleVisibility,
  notificationsEnabled,
  onToggleNotifications,
  unreadCount,
  onMarkAsRead,
  participants
}) => {
  const { user } = useAuth()
  const [inputValue, setInputValue] = useState('')
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    if (isVisible) {
      scrollToBottom()
      onMarkAsRead()
    }
  }, [messages, isVisible, scrollToBottom, onMarkAsRead])

  const handleSend = useCallback(() => {
    if (inputValue.trim()) {
      onSendMessage(inputValue)
      setInputValue('')
      inputRef.current?.focus()
    }
  }, [inputValue, onSendMessage])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const formatTime = (timestamp) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const getSenderInfo = (message) => {
    const participant = participants.find(p => p.userId === message.senderId)
    return {
      username: message.senderName || participant?.username || 'Unknown',
      avatar: message.senderAvatar || participant?.avatar || null,
      profile: message.senderProfile || participant?.profile || null
    }
  }

  if (!isVisible) {
    return null
  }

  return (
    <div className={`voice-temp-chat ${isVisible ? 'visible' : ''}`}>
      <div className="voice-temp-chat-header">
        <span className="voice-temp-chat-title">Voice Chat</span>
        <div className="voice-temp-chat-actions">
          <button
            className={`voice-temp-chat-notify ${notificationsEnabled ? 'active' : ''}`}
            onClick={onToggleNotifications}
            title={notificationsEnabled ? 'Disable notifications' : 'Enable notifications'}
          >
            {notificationsEnabled ? <BellIcon size={16} /> : <BellSlashIcon size={16} />}
          </button>
          <button
            className="voice-temp-chat-close"
            onClick={onToggleVisibility}
            title="Close chat"
          >
            <XMarkIcon size={16} />
          </button>
        </div>
      </div>

      <div className="voice-temp-chat-messages" onClick={onMarkAsRead}>
        {messages.length === 0 ? (
          <div className="voice-temp-chat-empty">
            <p>No messages yet</p>
            <p className="voice-temp-chat-empty-hint">Start the conversation!</p>
          </div>
        ) : (
          messages.map((message) => {
            const sender = getSenderInfo(message)
            const isOwnMessage = message.senderId === user?.id
            
            return (
              <div
                key={message.id}
                className={`voice-temp-chat-message ${isOwnMessage ? 'own' : ''}`}
              >
                <Avatar
                  user={{
                    id: message.senderId,
                    username: sender.username,
                    avatar: sender.avatar,
                    profile: sender.profile
                  }}
                  size={32}
                  showStatus={false}
                />
                <div className="voice-temp-chat-message-content">
                  <div className="voice-temp-chat-message-header">
                    <span className="voice-temp-chat-username">
                      {sender.username}
                    </span>
                    <span className="voice-temp-chat-time">
                      {formatTime(message.timestamp)}
                    </span>
                  </div>
                  <div className="voice-temp-chat-message-text">
                    {message.content}
                  </div>
                </div>
              </div>
            )
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="voice-temp-chat-input-container">
        <input
          ref={inputRef}
          type="text"
          className="voice-temp-chat-input"
          placeholder="Message voice chat..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          className="voice-temp-chat-send"
          onClick={handleSend}
          disabled={!inputValue.trim()}
        >
          ➤
        </button>
      </div>
    </div>
  )
}

export default VoiceChannelTempChat
