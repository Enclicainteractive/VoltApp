import React, { useState, useEffect, useRef, useCallback, forwardRef } from 'react'
import { Phone, Video, Search, Smile, Edit2, Trash2, Reply, X, FileText, MessageSquare, Check, ArrowDown, Copy, AtSign } from 'lucide-react'
import { formatDistance } from 'date-fns'
import { useSocket } from '../contexts/SocketContext'
import { useAuth } from '../contexts/AuthContext'
import { apiService } from '../services/apiService'
import { soundService } from '../services/soundService'
import Avatar from './Avatar'
import EmojiPicker from './EmojiPicker'
import ChatInput from './ChatInput'
import FileAttachment from './FileAttachment'
import MarkdownMessage from './MarkdownMessage'
import '../assets/styles/DMChat.css'
import '../assets/styles/ChatInput.css'

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥']

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
  const [showMessageEmojiPicker, setShowMessageEmojiPicker] = useState(null)
  const [attachments, setAttachments] = useState([])
  const [isDragging, setIsDragging] = useState(false)
  const [hoveredMessage, setHoveredMessage] = useState(null)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [hasMore, setHasMore] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [sendError, setSendError] = useState('')

  const messagesEndRef = useRef(null)
  const messagesContainerRef = useRef(null)
  const typingTimeoutRef = useRef(null)
  const isTypingRef = useRef(false)
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)
  const isSendingRef = useRef(false)
  const isAtBottomRef = useRef(true)
  const prevMessageCountRef = useRef(0)

  const recipient = conversation?.recipient

  // ─── Load messages ────────────────────────────────────────────────────────

  const loadMessages = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiService.getDMMessages(conversation.id)
      const msgs = res.data || []
      setMessages(msgs)
      setHasMore(msgs.length >= 50)
      prevMessageCountRef.current = msgs.length
      setTimeout(() => scrollToBottom(false), 50)
    } catch (err) {
      console.error('[DMChat] Failed to load messages:', err)
    }
    setLoading(false)
  }, [conversation?.id])

  useEffect(() => {
    if (conversation?.id) {
      setMessages([])
      setHasMore(true)
      loadMessages()
      socket?.emit('dm:join', conversation.id)
    }
    return () => {
      if (conversation?.id) socket?.emit('dm:leave', conversation.id)
    }
  }, [conversation?.id])

  const loadMoreMessages = useCallback(async () => {
    if (!hasMore || isLoadingMore || messages.length === 0) return
    setIsLoadingMore(true)
    try {
      const oldest = messages[0]
      const res = await apiService.getDMMessages(conversation.id, { before: oldest.timestamp, limit: 50 })
      const older = res.data || []
      if (older.length === 0) { setHasMore(false); return }
      // Preserve scroll position
      const container = messagesContainerRef.current
      const prevScrollHeight = container?.scrollHeight || 0
      setMessages(prev => [...older, ...prev])
      setHasMore(older.length >= 50)
      requestAnimationFrame(() => {
        if (container) {
          container.scrollTop = container.scrollHeight - prevScrollHeight
        }
      })
    } catch (err) {
      console.error('[DMChat] Failed to load more messages:', err)
    }
    setIsLoadingMore(false)
  }, [conversation?.id, messages, hasMore, isLoadingMore])

  // ─── Socket events ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!socket || !connected) return

    const handleNewMessage = (message) => {
      if (message.conversationId !== conversation?.id) return
      setMessages(prev => [...prev, message])
      if (message.userId !== user?.id) {
        soundService.messageReceived()
      }
      if (isAtBottomRef.current) {
        setTimeout(() => scrollToBottom(true), 20)
      }
    }

    const handleTyping = (data) => {
      if (data.conversationId !== conversation?.id || data.userId === user?.id) return
      setTypingUsers(prev => new Set([...prev, data.username]))
      setTimeout(() => {
        setTypingUsers(prev => { const s = new Set(prev); s.delete(data.username); return s })
      }, 3000)
    }

    const handleEdited = (message) => {
      if (message.conversationId !== conversation?.id) return
      setMessages(prev => prev.map(m => m.id === message.id ? { ...m, ...message } : m))
    }

    const handleDeleted = ({ messageId }) => {
      setMessages(prev => prev.filter(m => m.id !== messageId))
    }

    socket.on('dm:new', handleNewMessage)
    socket.on('dm:typing', handleTyping)
    socket.on('dm:edited', handleEdited)
    socket.on('dm:deleted', handleDeleted)

    return () => {
      socket.off('dm:new', handleNewMessage)
      socket.off('dm:typing', handleTyping)
      socket.off('dm:edited', handleEdited)
      socket.off('dm:deleted', handleDeleted)
    }
  }, [socket, connected, conversation?.id, user])

  // ─── Scroll tracking ──────────────────────────────────────────────────────

  const scrollToBottom = (smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' })
  }

  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current
    if (!container) return
    const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 80
    isAtBottomRef.current = atBottom
    setIsAtBottom(atBottom)
    // Load more when near top
    if (container.scrollTop < 60 && hasMore && !isLoadingMore) {
      loadMoreMessages()
    }
  }, [hasMore, isLoadingMore, loadMoreMessages])

  // ─── Send message ─────────────────────────────────────────────────────────

  const handleSendMessage = useCallback(async () => {
    if (isSendingRef.current) return
    if (!inputValue.trim() && attachments.length === 0) return
    if (!socket) return

    isSendingRef.current = true
    setSendError('')

    const messageData = {
      conversationId: conversation.id,
      content: inputValue.trim(),
      recipientId: recipient?.id || conversation.recipientId,
      replyTo: replyingTo?.id,
      attachments: attachments.length > 0 ? attachments : undefined
    }

    socket.emit('dm:send', messageData)
    soundService.messageSent()
    setInputValue('')
    setReplyingTo(null)
    setAttachments([])
    isTypingRef.current = false

    setTimeout(() => { isSendingRef.current = false }, 500)
  }, [socket, inputValue, attachments, conversation, recipient, replyingTo])

  // ─── Input change (plain string from ChatInput) ───────────────────────────

  const handleInputChange = useCallback((value) => {
    setInputValue(value)
    if (!isTypingRef.current && value.length > 0) {
      isTypingRef.current = true
      socket?.emit('dm:typing', { conversationId: conversation.id })
    }
    clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => { isTypingRef.current = false }, 2000)
  }, [socket, conversation?.id])

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }, [handleSendMessage])

  // ─── File upload ──────────────────────────────────────────────────────────

  const processFiles = useCallback(async (files) => {
    if (!files || files.length === 0) return
    const validFiles = Array.from(files).filter(f =>
      f.type || f.name.match(/\.(jpg|jpeg|png|gif|webp|svg|mp4|webm|mp3|wav|ogg|pdf|doc|docx|txt|zip|rar)$/i)
    )
    if (validFiles.length === 0) return
    try {
      const res = await apiService.uploadFiles(validFiles)
      setAttachments(prev => [...prev, ...res.data.attachments])
      soundService.success()
    } catch (err) {
      console.error('[DMChat] Upload failed:', err)
      setSendError('Failed to upload file(s)')
    }
  }, [])

  const handlePaste = useCallback(async (e) => {
    const items = e.clipboardData?.items
    if (!items) return
    const files = []
    for (const item of items) {
      if (item.kind === 'file') { const f = item.getAsFile(); if (f) files.push(f) }
    }
    if (files.length > 0) { e.preventDefault(); await processFiles(files) }
  }, [processFiles])

  // Attach paste to the inner contentEditable via the forwarded ref
  useEffect(() => {
    const editor = inputRef.current?.getEditor?.()
    if (editor) {
      editor.addEventListener('paste', handlePaste)
      return () => editor.removeEventListener('paste', handlePaste)
    }
  }, [handlePaste])

  const handleDragOver = useCallback((e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true) }, [])
  const handleDragLeave = useCallback((e) => {
    e.preventDefault(); e.stopPropagation()
    if (!e.currentTarget.contains(e.relatedTarget)) setIsDragging(false)
  }, [])
  const handleDrop = useCallback(async (e) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false)
    const files = e.dataTransfer?.files
    if (files?.length > 0) await processFiles(files)
  }, [processFiles])

  // ─── Emoji ────────────────────────────────────────────────────────────────

  const handleEmojiSelect = (emoji) => {
    if (typeof emoji === 'string') setInputValue(prev => prev + emoji)
    setShowEmojiPicker(false)
    requestAnimationFrame(() => inputRef.current?.focus?.())
  }

  // ─── Reactions ────────────────────────────────────────────────────────────

  const handleAddReaction = useCallback(async (messageId, emoji) => {
    const msg = messages.find(m => m.id === messageId)
    if (!msg) return
    const reactions = msg.reactions || {}
    const users = reactions[emoji] || []
    const alreadyReacted = users.includes(user?.id)
    socket?.emit(alreadyReacted ? 'dm:reaction:remove' : 'dm:reaction:add', {
      messageId,
      conversationId: conversation.id,
      emoji
    })
    // Optimistic update
    setMessages(prev => prev.map(m => {
      if (m.id !== messageId) return m
      const r = { ...(m.reactions || {}) }
      if (alreadyReacted) {
        r[emoji] = (r[emoji] || []).filter(id => id !== user?.id)
        if (r[emoji].length === 0) delete r[emoji]
      } else {
        r[emoji] = [...(r[emoji] || []), user?.id]
      }
      return { ...m, reactions: r }
    }))
    setShowMessageEmojiPicker(null)
  }, [messages, conversation?.id, socket, user?.id])

  const renderReactions = (message) => {
    const reactions = message.reactions || {}
    if (Object.keys(reactions).length === 0) return null
    return (
      <div className="dm-reactions">
        {Object.entries(reactions).map(([emoji, users]) => {
          if (!users?.length) return null
          const reacted = users.includes(user?.id)
          return (
            <button
              key={emoji}
              className={`dm-reaction-btn ${reacted ? 'active' : ''}`}
              onClick={() => handleAddReaction(message.id, emoji)}
              title={`${users.length} reaction${users.length !== 1 ? 's' : ''}`}
            >
              {emoji} <span>{users.length}</span>
            </button>
          )
        })}
      </div>
    )
  }

  // ─── Edit ─────────────────────────────────────────────────────────────────

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
      console.error('[DMChat] Failed to edit message:', err)
    }
  }

  const handleDeleteMessage = async (messageId) => {
    if (!confirm('Delete this message?')) return
    try {
      await apiService.deleteDMMessage(conversation.id, messageId)
      setMessages(prev => prev.filter(m => m.id !== messageId))
    } catch (err) {
      console.error('[DMChat] Failed to delete message:', err)
    }
  }

  // ─── Render message content (markdown + mentions) ─────────────────────────

  const renderMessageContent = (content, mentions) => {
    if (!content) return null
    return (
      <MarkdownMessage
        content={content}
        currentUserId={user?.id}
        mentions={mentions}
      />
    )
  }

  // ─── JSX ──────────────────────────────────────────────────────────────────

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

      {/* Header */}
      <div className="dm-chat-header">
        <Avatar src={recipient?.avatar} fallback={recipient?.username} size={32} />
        <div className="dm-recipient-info">
          <span className="dm-recipient-name">
            {recipient?.displayName || recipient?.customUsername || recipient?.username}
          </span>
          <span className={`dm-recipient-status ${recipient?.status || 'offline'}`}>
            {recipient?.status || 'Offline'}
          </span>
        </div>
        <div className="dm-header-actions">
          <button className="icon-btn" title="Voice Call"><Phone size={20} /></button>
          <button className="icon-btn" title="Video Call"><Video size={20} /></button>
          <button className="icon-btn" title="Search"><Search size={20} /></button>
        </div>
      </div>

      {/* Messages */}
      <div
        className="dm-messages"
        ref={messagesContainerRef}
        onScroll={handleScroll}
      >
        {isLoadingMore && (
          <div className="dm-loading-more">Loading earlier messages...</div>
        )}

        {loading ? (
          <div className="dm-loading">Loading messages...</div>
        ) : messages.length === 0 ? (
          <div className="dm-empty">
            <MessageSquare size={48} className="dm-empty-icon" />
            <Avatar src={recipient?.avatar} fallback={recipient?.username} size={80} />
            <h3>Start of your conversation with {recipient?.username}</h3>
            <p>No messages yet. Say hi!</p>
          </div>
        ) : (
          messages.map((message, index) => {
            const isOwn = message.userId === user?.id
            const prev = messages[index - 1]
            const grouped = prev &&
              prev.userId === message.userId &&
              new Date(message.timestamp) - new Date(prev.timestamp) < 300000
            const isHovered = hoveredMessage === message.id

            return (
              <div
                key={message.id}
                className={`dm-message ${isOwn ? 'own' : ''} ${grouped ? 'grouped' : ''}`}
                onMouseEnter={() => setHoveredMessage(message.id)}
                onMouseLeave={() => setHoveredMessage(null)}
              >
                {/* Reply reference */}
                {message.replyTo && (
                  <div className="dm-message-reply">
                    <Reply size={12} />
                    <span>Replying to a message</span>
                  </div>
                )}

                {/* Header row */}
                {!grouped && (
                  <div className="dm-message-header">
                    <Avatar
                      src={message.avatar}
                      fallback={message.username}
                      size={36}
                      onClick={() => onShowProfile?.(message.userId)}
                    />
                    <span
                      className="dm-message-author"
                      onClick={() => onShowProfile?.(message.userId)}
                    >
                      {message.username}
                    </span>
                    <span className="dm-message-time">
                      {formatDistance(new Date(message.timestamp), new Date(), { addSuffix: true })}
                    </span>
                  </div>
                )}

                {/* Content */}
                <div className="dm-message-content-wrapper">
                  {editingMessage === message.id ? (
                    <div className="dm-message-edit">
                      <input
                        type="text"
                        className="message-edit-input"
                        value={editContent}
                        onChange={e => setEditContent(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleEditMessage(message.id)
                          if (e.key === 'Escape') setEditingMessage(null)
                        }}
                        autoFocus
                      />
                      <div className="message-edit-actions">
                        <button className="edit-cancel" onClick={() => setEditingMessage(null)}>
                          <X size={14} /> Cancel
                        </button>
                        <button className="edit-save" onClick={() => handleEditMessage(message.id)}>
                          <Check size={14} /> Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="dm-message-body">
                      <div className="dm-message-content">
                        {renderMessageContent(message.content, message.mentions)}
                        {message.edited && <span className="edited-indicator">(edited)</span>}
                      </div>

                      {/* Attachments rendered below content, same as server chat */}
                      {message.attachments?.length > 0 && (
                        <div className="message-attachments">
                          {message.attachments.map((att, i) => (
                            <FileAttachment key={i} attachment={att} />
                          ))}
                        </div>
                      )}

                      {/* Reactions */}
                      {renderReactions(message)}
                    </div>
                  )}

                  {/* Hover action toolbar — shown for all messages */}
                  {isHovered && !editingMessage && (
                    <div className="dm-message-actions">
                      {QUICK_REACTIONS.map(emoji => (
                        <button
                          key={emoji}
                          className="dm-action-btn reaction-quick"
                          onClick={() => handleAddReaction(message.id, emoji)}
                          title={`React with ${emoji}`}
                        >
                          {emoji}
                        </button>
                      ))}
                      <button
                        className="dm-action-btn"
                        onClick={() => setShowMessageEmojiPicker(showMessageEmojiPicker === message.id ? null : message.id)}
                        title="Add Reaction"
                      >
                        <Smile size={15} />
                      </button>
                      <button
                        className="dm-action-btn"
                        onClick={() => setReplyingTo(message)}
                        title="Reply"
                      >
                        <Reply size={15} />
                      </button>
                      <button
                        className="dm-action-btn"
                        onClick={() => navigator.clipboard.writeText(message.content)}
                        title="Copy"
                      >
                        <Copy size={15} />
                      </button>
                      {isOwn && (
                        <button
                          className="dm-action-btn"
                          onClick={() => { setEditingMessage(message.id); setEditContent(message.content) }}
                          title="Edit"
                        >
                          <Edit2 size={15} />
                        </button>
                      )}
                      {isOwn && (
                        <button
                          className="dm-action-btn danger"
                          onClick={() => handleDeleteMessage(message.id)}
                          title="Delete"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  )}

                  {/* Per-message emoji picker */}
                  {showMessageEmojiPicker === message.id && (
                    <div className="dm-message-emoji-picker">
                      <EmojiPicker
                        onSelect={(emoji) => { handleAddReaction(message.id, emoji); setShowMessageEmojiPicker(null) }}
                        onClose={() => setShowMessageEmojiPicker(null)}
                      />
                    </div>
                  )}
                </div>
              </div>
            )
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Scroll-to-bottom button */}
      {!isAtBottom && (
        <button className="dm-scroll-to-bottom" onClick={() => scrollToBottom(true)} title="Jump to latest">
          <ArrowDown size={18} />
        </button>
      )}

      {/* Typing indicator */}
      {typingUsers.size > 0 && (
        <div className="dm-typing-indicator">
          <span className="typing-dots"><span /><span /><span /></span>
          {Array.from(typingUsers).join(', ')} {typingUsers.size === 1 ? 'is' : 'are'} typing...
        </div>
      )}

      {/* Send error */}
      {sendError && (
        <div className="age-warning-banner">{sendError}</div>
      )}

      {/* Reply preview */}
      {replyingTo && (
        <div className="dm-reply-preview">
          <Reply size={16} />
          <span>Replying to <strong>{replyingTo.username}</strong>: {replyingTo.content?.slice(0, 60)}{replyingTo.content?.length > 60 ? '…' : ''}</span>
          <button onClick={() => setReplyingTo(null)}><X size={16} /></button>
        </div>
      )}

      {/* Input area */}
      <div className="dm-input-container">
        {/* Attachment preview */}
        {attachments.length > 0 && (
          <div className="attachment-preview-bar">
            {attachments.map((file, i) => (
              <div key={i} className="attachment-preview-item">
                <FileText size={16} />
                <span className="attachment-name">{file.name}</span>
                <button type="button" className="attachment-remove" onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))}>
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        <input
          type="file"
          ref={fileInputRef}
          onChange={async (e) => { await processFiles(e.target.files); e.target.value = '' }}
          style={{ display: 'none' }}
          multiple
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.zip,.rar,.svg"
        />

        <div className="dm-input-wrapper">
          <ChatInput
            ref={inputRef}
            value={inputValue}
            onChange={handleInputChange}
            placeholder={`Message @${recipient?.username || 'user'}`}
            onSubmit={handleSendMessage}
            onKeyDown={handleKeyDown}
            onAttachClick={() => fileInputRef.current?.click()}
            onEmojiClick={() => setShowEmojiPicker(p => !p)}
          />

          {showEmojiPicker && (
            <div className="emoji-picker-popover">
              <EmojiPicker
                onSelect={handleEmojiSelect}
                onClose={() => setShowEmojiPicker(false)}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default DMChat
