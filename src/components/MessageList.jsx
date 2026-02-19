import React, { useEffect, useRef, useState, useCallback } from 'react'
import { formatDistance } from 'date-fns'
import { Edit2, Trash2, Reply, Smile, MoreHorizontal, X, Check, Copy, Link, Share, Pin, ArrowDown, Loader2, MessageSquare } from 'lucide-react'
import { useSocket } from '../contexts/SocketContext'
import Avatar from './Avatar'
import EmojiPicker from './EmojiPicker'
import MarkdownMessage from './MarkdownMessage'
import FileAttachment from './FileAttachment'
import ContextMenu from './ContextMenu'
import '../assets/styles/MessageList.css'

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥']

const MessageList = ({ messages, currentUserId, channelId, onReply, onLoadMore, onPinMessage, onUnpinMessage, highlightMessageId, onSaveScrollPosition, scrollPosition, onShowProfile, members }) => {
  const { socket } = useSocket()
  const messagesEndRef = useRef(null)
  const messagesStartRef = useRef(null)
  const containerRef = useRef(null)
  const topSentinelRef = useRef(null)
  const [editingMessage, setEditingMessage] = useState(null)
  const [editContent, setEditContent] = useState('')
  const [showEmojiPicker, setShowEmojiPicker] = useState(null)
  const [hoveredMessage, setHoveredMessage] = useState(null)
  const [contextMenu, setContextMenu] = useState(null)
  const [isNearTop, setIsNearTop] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMoreMessages, setHasMoreMessages] = useState(true)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [initialLoad, setInitialLoad] = useState(true)
  const prevMessageCountRef = useRef(0)
  const scrollPositionRef = useRef(0)
  const isAtBottomRef = useRef(true)

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (showEmojiPicker && !e.target.closest('.message-emoji-picker') && !e.target.closest('.reaction-btn')) {
        setShowEmojiPicker(null)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [showEmojiPicker])

  // Auto-scroll when new messages arrive
  useEffect(() => {
    if (messages.length > prevMessageCountRef.current) {
      const container = containerRef.current
      if (container && isAtBottomRef.current) {
        scrollToBottom()
      }
    }
    prevMessageCountRef.current = messages.length
  }, [messages])

  // Track if user is at bottom
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    
    const checkAtBottom = () => {
      const { scrollTop, scrollHeight, clientHeight } = container
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight
      isAtBottomRef.current = distanceFromBottom < 100
      setIsAtBottom(distanceFromBottom < 100)
    }
    
    checkAtBottom()
    container.addEventListener('scroll', checkAtBottom, { passive: true })
    return () => container.removeEventListener('scroll', checkAtBottom)
  }, [])

  useEffect(() => {
    if (initialLoad && messages.length > 0) {
      if (scrollPosition > 0) {
        // Restore scroll position for this channel
        setTimeout(() => {
          if (containerRef.current) {
            containerRef.current.scrollTop = scrollPosition
          }
        }, 50)
      } else {
        scrollToBottom()
      }
      setInitialLoad(false)
    }
  }, [messages, initialLoad, scrollPosition])

  // Save scroll position when scrolling
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let scrollTimeout
    const handleScroll = () => {
      if (scrollTimeout) clearTimeout(scrollTimeout)
      scrollTimeout = setTimeout(() => {
        if (onSaveScrollPosition) {
          onSaveScrollPosition(container.scrollTop)
        }
      }, 200)
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      container.removeEventListener('scroll', handleScroll)
      if (scrollTimeout) clearTimeout(scrollTimeout)
    }
  }, [onSaveScrollPosition])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' })
  }

  const scrollToMessage = useCallback((messageId) => {
    const element = document.getElementById(`message-${messageId}`)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      element.classList.add('highlighted')
      setTimeout(() => element.classList.remove('highlighted'), 2000)
    }
  }, [])

  const loadMoreMessages = useCallback(async () => {
    if (isLoadingMore || !onLoadMore || !hasMoreMessages) return false
    
    if (containerRef.current) {
      scrollPositionRef.current = containerRef.current.scrollTop
    }
    
    setIsLoadingMore(true)
    const oldestMessage = messages[0]
    
    try {
      const hasMore = await onLoadMore(oldestMessage?.timestamp)
      setHasMoreMessages(hasMore !== false)
      return hasMore !== false
    } catch (err) {
      console.error('Failed to load more messages:', err)
      return false
    } finally {
      setTimeout(() => {
        if (containerRef.current && scrollPositionRef.current > 0) {
          containerRef.current.scrollTop = scrollPositionRef.current + 100
        }
      }, 100)
      setIsLoadingMore(false)
    }
  }, [isLoadingMore, onLoadMore, hasMoreMessages, messages])

  useEffect(() => {
    if (highlightMessageId) {
      scrollToMessage(highlightMessageId)
    }
  }, [highlightMessageId, scrollToMessage])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleScroll = () => {
      if (isLoadingMore) return
      
      const { scrollTop } = container
      
      if (scrollTop < 50 && hasMoreMessages && onLoadMore && !isLoadingMore) {
        loadMoreMessages()
      }
      
      const { scrollHeight, clientHeight } = container
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight
      setIsAtBottom(distanceFromBottom < 100)
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => container.removeEventListener('scroll', handleScroll)
  }, [isLoadingMore, hasMoreMessages, onLoadMore, loadMoreMessages])

  const shouldGroupMessage = (current, previous) => {
    if (!previous) return false
    const timeDiff = new Date(current.timestamp) - new Date(previous.timestamp)
    return (
      current.userId === previous.userId &&
      timeDiff < 5 * 60 * 1000
    )
  }

  const handleEditMessage = (messageId) => {
    if (!editContent.trim()) return
    socket?.emit('message:edit', {
      messageId,
      channelId,
      content: editContent.trim()
    })
    setEditingMessage(null)
    setEditContent('')
  }

  const handleDeleteMessage = (messageId) => {
    if (!confirm('Delete this message?')) return
    socket?.emit('message:delete', { messageId, channelId })
  }

  const handleAddReaction = (messageId, emoji) => {
    socket?.emit('reaction:add', { messageId, emoji, channelId })
    setShowEmojiPicker(null)
  }

  const handleRemoveReaction = (messageId, emoji) => {
    socket?.emit('reaction:remove', { messageId, emoji, channelId })
  }

  const renderReactions = (message) => {
    if (!message.reactions || Object.keys(message.reactions).length === 0) return null

    return (
      <div className="message-reactions">
        {Object.entries(message.reactions).map(([emoji, users]) => {
          const hasReacted = users.includes(currentUserId)
          return (
            <button
              key={emoji}
              className={`reaction-badge ${hasReacted ? 'active' : ''}`}
              onClick={() => hasReacted 
                ? handleRemoveReaction(message.id, emoji) 
                : handleAddReaction(message.id, emoji)
              }
            >
              <span className="reaction-emoji">{emoji}</span>
              <span className="reaction-count">{users.length}</span>
            </button>
          )
        })}
      </div>
    )
  }

  const renderEmbeds = (embeds) => {
    if (!embeds || embeds.length === 0) return null
    return (
      <div className="message-embeds">
        {embeds.map((embed, i) => {
          const borderColor = embed.color || 'var(--volt-primary)'
          return (
            <div key={i} className="message-embed" style={{ borderLeftColor: borderColor }}>
              {embed.author && (
                <div className="embed-author">
                  {embed.author.iconUrl && <img src={embed.author.iconUrl} alt="" className="embed-author-icon" />}
                  {embed.author.url
                    ? <a href={embed.author.url} target="_blank" rel="noopener noreferrer">{embed.author.name}</a>
                    : <span>{embed.author.name}</span>}
                </div>
              )}
              {embed.title && (
                embed.url
                  ? <a href={embed.url} target="_blank" rel="noopener noreferrer" className="embed-title">{embed.title}</a>
                  : <div className="embed-title">{embed.title}</div>
              )}
              {embed.description && <div className="embed-description">{embed.description}</div>}
              {embed.fields && embed.fields.length > 0 && (
                <div className="embed-fields">
                  {embed.fields.map((field, fi) => (
                    <div key={fi} className={`embed-field${field.inline ? ' embed-field-inline' : ''}`}>
                      <div className="embed-field-name">{field.name}</div>
                      <div className="embed-field-value">{field.value}</div>
                    </div>
                  ))}
                </div>
              )}
              {embed.image && <img src={embed.image.url} alt="" className="embed-image" />}
              {embed.thumbnail && <img src={embed.thumbnail.url} alt="" className="embed-thumbnail" />}
              {(embed.footer || embed.timestamp) && (
                <div className="embed-footer">
                  {embed.footer?.iconUrl && <img src={embed.footer.iconUrl} alt="" className="embed-footer-icon" />}
                  {embed.footer?.text && <span>{embed.footer.text}</span>}
                  {embed.footer?.text && embed.timestamp && <span className="embed-footer-sep">•</span>}
                  {embed.timestamp && <span>{new Date(embed.timestamp).toLocaleString()}</span>}
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  const handleMentionClick = useCallback((userId, username, host) => {
    if (userId) {
      onShowProfile?.(userId)
    } else if (username) {
      // Try to find by username in members list as fallback
      const member = members?.find(m => m.username?.toLowerCase() === username.toLowerCase())
      if (member?.id) {
        onShowProfile?.(member.id)
      }
    }
  }, [onShowProfile, members])

  const renderMessageContent = (content, mentions) => {
    if (!content) return null
    return (
      <MarkdownMessage
        content={content}
        currentUserId={currentUserId}
        mentions={mentions}
        members={members}
        onMentionClick={handleMentionClick}
      />
    )
  }

  const handleContextMenu = (e, message) => {
    e.preventDefault()
    const isOwn = message.userId === currentUserId
    const isPinned = message.pinned
    
    const items = [
      {
        label: 'Copy Message',
        icon: <Copy size={14} />,
        onClick: () => {
          navigator.clipboard.writeText(message.content)
        }
      },
      {
        label: 'Copy Message Link',
        icon: <Link size={14} />,
        onClick: () => {
          const url = `${window.location.origin}/chat/${channelId}?message=${message.id}`
          navigator.clipboard.writeText(url)
        }
      },
      { type: 'separator' },
      ...(onReply ? [{
        label: 'Reply',
        icon: <Reply size={14} />,
        onClick: () => onReply(message)
      }] : []),
      {
        label: isPinned ? 'Unpin Message' : 'Pin Message',
        icon: <Pin size={14} />,
        onClick: () => {
          if (isPinned && onUnpinMessage) {
            onUnpinMessage(message.id)
          } else if (onPinMessage) {
            onPinMessage(message.id)
          }
        }
      },
      {
        label: 'Add Reaction',
        icon: <Smile size={14} />,
        onClick: () => setShowEmojiPicker(message.id)
      },
      { type: 'separator' },
      ...(isOwn ? [
        {
          label: 'Edit',
          icon: <Edit2 size={14} />,
          onClick: () => {
            setEditingMessage(message.id)
            setEditContent(message.content)
          }
        },
        {
          label: 'Delete',
          icon: <Trash2 size={14} />,
          danger: true,
          onClick: () => handleDeleteMessage(message.id)
        },
        { type: 'separator' }
      ] : [])
    ]
    
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      items,
      message
    })
  }

  return (
    <div className="message-list" ref={containerRef}>
      <div ref={topSentinelRef} className="scroll-sentinel" />
      {!isAtBottom && messages.length > 0 && (
        <button className="return-to-latest" onClick={scrollToBottom}>
          <ArrowDown size={16} />
          Return to Latest
        </button>
      )}
      {isLoadingMore && (
        <div className="loading-more-messages">
          <Loader2 size={20} className="spinning" />
        </div>
      )}
      <div className="messages-container" ref={messagesStartRef}>
        {messages.length === 0 ? (
          <div className="no-messages">
            <MessageSquare size={48} className="no-messages-icon" />
            <h3>No messages yet</h3>
            <p>Be the first to start the conversation!</p>
          </div>
        ) : (
          messages.map((message, index) => {
            const previousMessage = index > 0 ? messages[index - 1] : null
            const grouped = shouldGroupMessage(message, previousMessage)
            const isOwn = message.userId === currentUserId
            const isHovered = hoveredMessage === message.id

            return (
              <div
                key={message.id}
                id={`message-${message.id}`}
                className={`message ${grouped ? 'grouped' : ''} ${isOwn ? 'own' : ''}`}
                onMouseEnter={() => setHoveredMessage(message.id)}
                onMouseLeave={() => setHoveredMessage(null)}
                onContextMenu={(e) => handleContextMenu(e, message)}
              >
                {message.replyTo && (
                  <div className="message-reply-ref">
                    <Reply size={12} />
                    <span>Replying to {message.replyTo.username}</span>
                  </div>
                )}

                {!grouped && (
                  <div className="message-header">
                    <Avatar 
                      src={message.avatar}
                      alt={message.username}
                      fallback={message.username}
                      size={40}
                      className="message-avatar"
                      onClick={() => onShowProfile?.(message.userId)}
                    />
                    <span className="message-author" onClick={() => onShowProfile?.(message.userId)}>{message.username}</span>
                    {message.bot && (
                      <span className="bot-badge">BOT</span>
                    )}
                    {message.encrypted && (
                      <span className="encrypted-badge" title="End-to-end encrypted">E2EE</span>
                    )}
                    <span className="message-timestamp">
                      {formatDistance(new Date(message.timestamp), new Date(), { addSuffix: true })}
                    </span>
                  </div>
                )}

                {editingMessage === message.id ? (
                  <div className="message-edit-container">
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
                  <div className="message-content">
                    {renderMessageContent(message.content, message.mentions)}
                    {message.edited && <span className="edited-tag">(edited)</span>}
                  </div>
                )}

                {message.attachments && message.attachments.length > 0 && (
                  <div className="message-attachments">
                    {message.attachments.map((attachment, i) => (
                      <FileAttachment key={i} attachment={attachment} />
                    ))}
                  </div>
                )}

                {renderEmbeds(message.embeds)}

                {renderReactions(message)}

                {isHovered && !editingMessage && (
                  <div className="message-actions">
                    {QUICK_REACTIONS.map(emoji => (
                      <button
                        key={emoji}
                        className="action-btn reaction-quick"
                        onClick={() => handleAddReaction(message.id, emoji)}
                        title={`React with ${emoji}`}
                      >
                        {emoji}
                      </button>
                    ))}
                    <button
                      className="action-btn"
                      onClick={() => setShowEmojiPicker(message.id)}
                      title="Add Reaction"
                    >
                      <Smile size={16} />
                    </button>
                    {onReply && (
                      <button
                        className="action-btn"
                        onClick={() => onReply(message)}
                        title="Reply"
                      >
                        <Reply size={16} />
                      </button>
                    )}
                    {isOwn && (
                      <>
                        <button
                          className="action-btn"
                          onClick={() => { setEditingMessage(message.id); setEditContent(message.content) }}
                          title="Edit"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          className="action-btn delete"
                          onClick={() => handleDeleteMessage(message.id)}
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                  </div>
                )}

                {showEmojiPicker === message.id && (
                  <div className="message-emoji-picker">
                    <EmojiPicker
                      onSelect={(emoji) => handleAddReaction(message.id, emoji)}
                      onClose={() => setShowEmojiPicker(null)}
                    />
                  </div>
                )}
              </div>
            )
          })
        )}
        <div ref={messagesEndRef} />
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

export default MessageList
