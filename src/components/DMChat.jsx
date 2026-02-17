import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Phone, Video, Pin, Search, MoreVertical, Smile, Plus, Send, Edit2, Trash2, Reply, X, FileText, MessageSquare } from 'lucide-react'
import { useSocket } from '../contexts/SocketContext'
import { useAuth } from '../contexts/AuthContext'
import { apiService } from '../services/apiService'
import Avatar from './Avatar'
import EmojiPicker from './EmojiPicker'
import ChatInput from './ChatInput'
import FileAttachment from './FileAttachment'
import { soundService } from '../services/soundService'
import '../assets/styles/DMChat.css'
import '../assets/styles/ChatInput.css'

const DMChat = ({ conversation, onClose, onShowProfile }) => {
  const { socket, connected } = useSocket()
  const { user } = useAuth()
  const [messages, setMessages] = useState([])
  const [inputValue, setInputValue] = useState('')
  const [loading, setLoading] = useState(true)
  const [typingUsers, setTypingUsers] = useState(new Set())
  const [editingMessage, setEditingMessage] = useState(null)
  const [editContent, setEditContent] = useState('')
  const [replyingTo, setReplyingTo] = useState(null)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showContextMenu, setShowContextMenu] = useState(null)
  const [attachments, setAttachments] = useState([])
  const [isDragging, setIsDragging] = useState(false)
  const messagesEndRef = useRef(null)
  const typingTimeoutRef = useRef(null)
  const inputRef = useRef(null)
  const dmChatRef = useRef(null)
  const fileInputRef = useRef(null)
  const isSendingRef = useRef(false)

  useEffect(() => {
    if (conversation?.id) {
      loadMessages()
      socket?.emit('dm:join', conversation.id)
    }
    
    return () => {
      if (conversation?.id) {
        socket?.emit('dm:leave', conversation.id)
      }
    }
  }, [conversation?.id])

  useEffect(() => {
    if (!socket || !connected) return

    const handleNewMessage = (message) => {
      if (message.conversationId === conversation?.id) {
        setMessages(prev => [...prev, message])
        scrollToBottom()
      }
    }

    const handleTyping = (data) => {
      if (data.conversationId === conversation?.id && data.userId !== user?.id) {
        setTypingUsers(prev => new Set([...prev, data.username]))
        setTimeout(() => {
          setTypingUsers(prev => {
            const newSet = new Set(prev)
            newSet.delete(data.username)
            return newSet
          })
        }, 3000)
      }
    }

    const handleMessageEdited = (message) => {
      if (message.conversationId === conversation?.id) {
        setMessages(prev => prev.map(m => m.id === message.id ? message : m))
      }
    }

    const handleMessageDeleted = ({ messageId }) => {
      setMessages(prev => prev.filter(m => m.id !== messageId))
    }

    socket.on('dm:new', handleNewMessage)
    socket.on('dm:typing', handleTyping)
    socket.on('dm:edited', handleMessageEdited)
    socket.on('dm:deleted', handleMessageDeleted)

    return () => {
      socket.off('dm:new', handleNewMessage)
      socket.off('dm:typing', handleTyping)
      socket.off('dm:edited', handleMessageEdited)
      socket.off('dm:deleted', handleMessageDeleted)
    }
  }, [socket, connected, conversation?.id, user])

  const loadMessages = async () => {
    setLoading(true)
    try {
      const res = await apiService.getDMMessages(conversation.id)
      setMessages(res.data)
      setTimeout(scrollToBottom, 100)
    } catch (err) {
      console.error('Failed to load DM messages:', err)
    }
    setLoading(false)
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const handleSendMessage = async (e) => {
    if (e && e.preventDefault) {
      e.preventDefault()
    }
    // Prevent double sends
    if (isSendingRef.current) return
    if (!inputValue.trim() && attachments.length === 0) return

    isSendingRef.current = true

    const messageData = {
      conversationId: conversation.id,
      content: inputValue.trim(),
      recipientId: conversation.recipient?.id || conversation.recipientId,
      replyTo: replyingTo?.id,
      attachments: attachments.length > 0 ? attachments : undefined
    }

    socket?.emit('dm:send', messageData)
    setInputValue('')
    setReplyingTo(null)
    setAttachments([])
    
    // Reset sending flag after a short delay
    setTimeout(() => {
      isSendingRef.current = false
    }, 500)
  }

  const processFiles = async (files) => {
    if (files.length === 0) return
    
    const fileArray = Array.from(files)
    const validFiles = fileArray.filter(file => {
      if (!file.type && !file.name.match(/\.(jpg|jpeg|png|gif|webp|mp4|webm|mp3|wav|pdf|doc|docx|txt)$/i)) {
        console.warn('Invalid file type:', file)
        return false
      }
      return true
    })
    
    if (validFiles.length === 0) return

    try {
      const res = await apiService.uploadFiles(validFiles)
      setAttachments(prev => [...prev, ...res.data.attachments])
      soundService.success()
    } catch (err) {
      console.error('Upload failed:', err)
    }
  }

  const handlePaste = useCallback(async (e) => {
    const items = e.clipboardData?.items
    if (!items) return
    
    const files = []
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.kind === 'file') {
        const file = item.getAsFile()
        if (file) files.push(file)
      }
    }
    
    if (files.length > 0) {
      e.preventDefault()
      await processFiles(files)
    }
  }, [])

  const handleFileSelect = async (e) => {
    const files = e.target.files
    await processFiles(files)
    e.target.value = ''
  }

  const handlePlusClick = () => {
    fileInputRef.current?.click()
  }

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setIsDragging(false)
    }
  }, [])

  const handleDrop = useCallback(async (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    
    const files = e.dataTransfer?.files
    if (files && files.length > 0) {
      await processFiles(files)
    }
  }, [])

  useEffect(() => {
    const input = inputRef.current
    if (input) {
      input.addEventListener('paste', handlePaste)
      return () => input.removeEventListener('paste', handlePaste)
    }
  }, [handlePaste])

  const removeAttachment = (index) => {
    setAttachments(prev => prev.filter((_, i) => i !== index))
  }

  const handleInputChange = (e) => {
    setInputValue(e.target.value)
    
    clearTimeout(typingTimeoutRef.current)
    socket?.emit('dm:typing', { conversationId: conversation.id })
    
    typingTimeoutRef.current = setTimeout(() => {}, 2000)
  }

  const handleEditMessage = async (messageId) => {
    if (!editContent.trim()) return
    try {
      await apiService.editDMMessage(conversation.id, messageId, editContent)
      setMessages(prev => prev.map(m => 
        m.id === messageId ? { ...m, content: editContent, edited: true } : m
      ))
      setEditingMessage(null)
      setEditContent('')
    } catch (err) {
      console.error('Failed to edit message:', err)
    }
  }

  const handleDeleteMessage = async (messageId) => {
    if (!confirm('Delete this message?')) return
    try {
      await apiService.deleteDMMessage(conversation.id, messageId)
      setMessages(prev => prev.filter(m => m.id !== messageId))
    } catch (err) {
      console.error('Failed to delete message:', err)
    }
  }

  const handleEmojiSelect = (emoji) => {
    setInputValue(prev => prev + emoji)
    setShowEmojiPicker(false)
  }

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now - date
    
    if (diff < 60000) return 'Just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    return date.toLocaleDateString()
  }

  const recipient = conversation?.recipient

  return (
    <div 
      className={`dm-chat ${isDragging ? 'dragging' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="drop-overlay">
          <div className="drop-message">
            <FileText size={48} />
            <span>Drop files to upload</span>
          </div>
        </div>
      )}
      <div className="dm-chat-header">
        <Avatar 
          src={recipient?.avatar}
          fallback={recipient?.username}
          size={32}
        />
        <div className="dm-recipient-info">
          <span className="dm-recipient-name">{recipient?.displayName || recipient?.customUsername || recipient?.username}</span>
          <span className={`dm-recipient-status ${recipient?.status || 'offline'}`}>
            {recipient?.status || 'Offline'}
          </span>
        </div>
        <div className="dm-header-actions">
          <button className="icon-btn" title="Voice Call">
            <Phone size={20} />
          </button>
          <button className="icon-btn" title="Video Call">
            <Video size={20} />
          </button>
          <button className="icon-btn" title="Search">
            <Search size={20} />
          </button>
        </div>
      </div>

      <div className="dm-messages">
        {loading ? (
          <div className="dm-loading">Loading messages...</div>
        ) : messages.length === 0 ? (
          <div className="dm-empty">
            <MessageSquare size={48} className="dm-empty-icon" />
            <Avatar 
              src={recipient?.avatar}
              fallback={recipient?.username}
              size={80}
            />
            <h3>Start of your conversation with {recipient?.username}</h3>
            <p>No messages yet. Say hi!</p>
          </div>
        ) : (
          messages.map((message, index) => {
            const isOwn = message.userId === user?.id
            const prevMessage = messages[index - 1]
            const showHeader = !prevMessage || 
              prevMessage.userId !== message.userId ||
              new Date(message.timestamp) - new Date(prevMessage.timestamp) > 300000

            return (
              <div 
                key={message.id}
                className={`dm-message ${isOwn ? 'own' : ''} ${showHeader ? '' : 'grouped'}`}
                onContextMenu={(e) => {
                  e.preventDefault()
                  if (isOwn) setShowContextMenu(message.id)
                }}
              >
                {message.replyTo && (
                  <div className="dm-message-reply">
                    <Reply size={14} />
                    <span>Replying to a message</span>
                  </div>
                )}
                
                {showHeader && (
                  <div className="dm-message-header">
                    <Avatar 
                      src={message.avatar}
                      fallback={message.username}
                      size={36}
                      onClick={() => onShowProfile?.(message.userId)}
                    />
                    <span className="dm-message-author" onClick={() => onShowProfile?.(message.userId)}>{message.username}</span>
                    <span className="dm-message-time">{formatTimestamp(message.timestamp)}</span>
                  </div>
                )}
                
                <div className="dm-message-content-wrapper">
                  {editingMessage === message.id ? (
                    <div className="dm-message-edit">
                      <input
                        type="text"
                        className="input"
                        value={editContent}
                        onChange={e => setEditContent(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleEditMessage(message.id)
                          if (e.key === 'Escape') setEditingMessage(null)
                        }}
                        autoFocus
                      />
                      <div className="edit-actions">
                        <button className="btn btn-sm" onClick={() => setEditingMessage(null)}>Cancel</button>
                        <button className="btn btn-sm btn-primary" onClick={() => handleEditMessage(message.id)}>Save</button>
                      </div>
                    </div>
                  ) : (
                    <div className="dm-message-content">
                      {message.attachments && message.attachments.length > 0 && (
                        <div className="message-attachments">
                          {message.attachments.map((attachment, i) => (
                            <FileAttachment key={i} attachment={attachment} />
                          ))}
                        </div>
                      )}
                      {message.content}
                      {message.edited && <span className="edited-indicator">(edited)</span>}
                    </div>
                  )}
                  
                  {isOwn && !editingMessage && (
                    <div className="dm-message-actions">
                      <button onClick={() => setReplyingTo(message)} title="Reply">
                        <Reply size={14} />
                      </button>
                      <button onClick={() => { setEditingMessage(message.id); setEditContent(message.content) }} title="Edit">
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => handleDeleteMessage(message.id)} title="Delete">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {typingUsers.size > 0 && (
        <div className="dm-typing-indicator">
          <span className="typing-dots"><span></span><span></span><span></span></span>
          {Array.from(typingUsers).join(', ')} {typingUsers.size === 1 ? 'is' : 'are'} typing...
        </div>
      )}

      {replyingTo && (
        <div className="dm-reply-preview">
          <Reply size={16} />
          <span>Replying to <strong>{replyingTo.username}</strong></span>
          <button onClick={() => setReplyingTo(null)}><X size={16} /></button>
        </div>
      )}

      <div className="dm-input-container">
        {attachments.length > 0 && (
          <div className="attachment-preview-bar">
            {attachments.map((file, index) => (
              <div key={index} className="attachment-preview-item">
                <FileText size={16} />
                <span className="attachment-name">{file.name}</span>
                <button 
                  type="button" 
                  className="attachment-remove"
                  onClick={() => removeAttachment(index)}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          style={{ display: 'none' }}
          multiple
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt"
        />
        <ChatInput
          value={inputValue}
          onChange={setInputValue}
          placeholder={`Message @${recipient?.username || 'user'}`}
          onSubmit={handleSendMessage}
          onAttachClick={() => fileInputRef.current?.click()}
          onEmojiClick={() => setShowEmojiPicker(!showEmojiPicker)}
        />
        
        {showEmojiPicker && (
          <EmojiPicker onSelect={handleEmojiSelect} onClose={() => setShowEmojiPicker(false)} />
        )}
      </div>
    </div>
  )
}

export default DMChat
