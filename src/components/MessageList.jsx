import React, { useEffect, useRef, useState, useCallback, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { formatDistance } from 'date-fns'
import { PencilIcon, TrashIcon, ArrowUturnLeftIcon, FaceSmileIcon, EllipsisHorizontalIcon, XMarkIcon, CheckIcon, ClipboardDocumentIcon, LinkIcon, ShareIcon, MapPinIcon, ArrowDownIcon, ArrowPathIcon, ChatBubbleLeftRightIcon, FlagIcon, Square2StackIcon, XCircleIcon } from '@heroicons/react/24/outline'
import { useSocket } from '../contexts/SocketContext'
import { useTranslation } from '../hooks/useTranslation'
import Avatar from './Avatar'
import MarkdownMessage from './MarkdownMessage'
import FileAttachment from './FileAttachment'
import ContextMenu from './ContextMenu'
import ReactionEmojiPicker from './ReactionEmojiPicker'
import BotUIMessage from './BotUIMessage'
import { deserializeReactionEmoji, serializeReactionEmoji } from '../utils/reactionEmoji'
import '../assets/styles/MessageList.css'

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥']
const ATTACHMENT_PLACEHOLDER_TYPES = new Set(['image', 'video', 'audio', 'file', 'attachment'])

const isAttachmentOnlyPlaceholder = (content = '') => {
  const trimmed = String(content || '').trim()
  if (!trimmed || !trimmed.startsWith('[') || !trimmed.endsWith(']')) return false

  const chunks = trimmed
    .split(']')
    .map((chunk) => chunk.trim())
    .filter(Boolean)

  if (chunks.length === 0) return false

  return chunks.every((chunk) => {
    if (!chunk.startsWith('[')) return false
    const inner = chunk.slice(1).trim().replaceAll('\t', ' ')
    const normalized = inner.split(' ').filter(Boolean)
    if (normalized.length < 1 || normalized.length > 2) return false
    if (!ATTACHMENT_PLACEHOLDER_TYPES.has(normalized[0].toLowerCase())) return false
    if (normalized.length === 1) return true
    const suffix = normalized[1]
    return suffix.startsWith('#') && suffix.length > 1 && suffix.slice(1).split('').every((char) => char >= '0' && char <= '9')
  })
}

const asArray = (value) => (Array.isArray(value) ? value : [])

const MessageList = ({ messages, emptyState = null, currentUserId, channelId, onReply, onLoadMore, onPinMessage, onUnpinMessage, onReportMessage, highlightMessageId, onSaveScrollPosition, scrollPosition, onShowProfile, members, serverEmojis, replyingTo, onCancelReply, serverId, isAdmin, server, isLoading }) => {
  const { t } = useTranslation()
  const { socket } = useSocket()
  const messagesEndRef = useRef(null)
  const messagesStartRef = useRef(null)
  const containerRef = useRef(null)
  const topSentinelRef = useRef(null)
  const [editingMessage, setEditingMessage] = useState(null)
  const [editContent, setEditContent] = useState('')
  const [showEmojiPicker, setShowEmojiPicker] = useState(null)
  const [emojiPickerAnchor, setEmojiPickerAnchor] = useState(null)
  const [hoveredMessage, setHoveredMessage] = useState(null)
  const [contextMenu, setContextMenu] = useState(null)
  const [isNearTop, setIsNearTop] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMoreMessages, setHasMoreMessages] = useState(true)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [initialLoad, setInitialLoad] = useState(true)
  const [selectedMessages, setSelectedMessages] = useState(new Set())
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const prevMessageCountRef = useRef(0)
  const scrollPositionRef = useRef(0)
  const isAtBottomRef = useRef(true)
  const restoredChannelRef = useRef(null)
  const safeMessages = asArray(messages)

  // Check if user can manage messages (admin or has permission)
  const isServerOwner = server?.ownerId === currentUserId
  const canManageMessages = isAdmin || isServerOwner

  // Toggle selection mode
  const toggleSelectionMode = () => {
    setIsSelectionMode(prev => !prev)
    if (isSelectionMode) {
      setSelectedMessages(new Set())
    }
  }

  // Toggle message selection
  const toggleMessageSelection = (messageId) => {
    setSelectedMessages(prev => {
      const next = new Set(prev)
      if (next.has(messageId)) {
        next.delete(messageId)
      } else {
        next.add(messageId)
      }
      return next
    })
  }

  // Select all visible messages
  const selectAllMessages = () => {
    const allIds = safeMessages.filter(m => !m.deleted).map(m => m.id)
    setSelectedMessages(new Set(allIds))
  }

  // Clear selection
  const clearSelection = () => {
    setSelectedMessages(new Set())
    setIsSelectionMode(false)
  }

  // Handle bulk delete
  const handleBulkDelete = async () => {
    if (selectedMessages.size === 0) return
    if (!confirm(t('chat.bulkDeleteConfirm', `Delete ${selectedMessages.size} messages?`))) return

    const messageIds = Array.from(selectedMessages)
    socket?.emit('messages:bulk-delete', { channelId, messageIds })
    clearSelection()
  }

  // Auto-scroll when new messages arrive
  useEffect(() => {
    if (safeMessages.length > prevMessageCountRef.current) {
      const container = containerRef.current
      if (container && isAtBottomRef.current) {
        scrollToBottom()
      }
    }
    prevMessageCountRef.current = safeMessages.length
  }, [safeMessages])

  useEffect(() => {
    setInitialLoad(true)
    setHasMoreMessages(true)
    restoredChannelRef.current = null
    prevMessageCountRef.current = 0
  }, [channelId])

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

  useLayoutEffect(() => {
    if (!initialLoad || safeMessages.length === 0 || !containerRef.current) return
    if (restoredChannelRef.current === channelId) return

    const container = containerRef.current
    if (scrollPosition > 0) {
      container.scrollTop = scrollPosition
    } else {
      container.scrollTop = container.scrollHeight
    }
    restoredChannelRef.current = channelId
    setInitialLoad(false)
  }, [channelId, initialLoad, safeMessages.length, scrollPosition])

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
    
    const container = containerRef.current
    if (!container) return false

    // Snapshot scroll geometry BEFORE any state changes
    const previousScrollHeight = container.scrollHeight
    const previousScrollTop = container.scrollTop

    // Mark as loading immediately so the scroll handler won't re-enter
    setIsLoadingMore(true)
    isLoadingMoreRef.current = true

    const oldestMessage = safeMessages[0]
    let hasMore = false
    
    try {
      const result = await onLoadMore(oldestMessage?.timestamp)
      // Treat undefined/null as "no more" so we stop polling
      hasMore = result === true
      setHasMoreMessages(hasMore)
      return hasMore
    } catch (err) {
      console.error('Failed to load more messages:', err)
      setHasMoreMessages(false)
      return false
    } finally {
      // Restore scroll position BEFORE clearing the loading flag so the
      // scroll handler cannot fire again while we're still near the top.
      requestAnimationFrame(() => {
        const nextContainer = containerRef.current
        if (nextContainer) {
          const heightDiff = nextContainer.scrollHeight - previousScrollHeight
          if (heightDiff > 0) {
            nextContainer.scrollTop = previousScrollTop + heightDiff
          }
        }
        // Only clear the loading flag after the scroll is restored
        setIsLoadingMore(false)
        isLoadingMoreRef.current = false
      })
    }
  }, [isLoadingMore, onLoadMore, hasMoreMessages, safeMessages])

  const scrollTimeoutRef = useRef(null)
  const isLoadingMoreRef = useRef(false)

  useEffect(() => {
    isLoadingMoreRef.current = isLoadingMore
  }, [isLoadingMore])

  useEffect(() => {
    if (highlightMessageId) {
      scrollToMessage(highlightMessageId)
    }
  }, [highlightMessageId, scrollToMessage])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleScroll = () => {
      if (scrollTimeoutRef.current) {
        cancelAnimationFrame(scrollTimeoutRef.current)
      }
      
      scrollTimeoutRef.current = requestAnimationFrame(() => {
        if (isLoadingMoreRef.current) return
        
        const { scrollTop, scrollHeight, clientHeight } = container
        const distanceFromBottom = scrollHeight - scrollTop - clientHeight
        
        setIsAtBottom(distanceFromBottom < 100)
        
        if (scrollTop < 150 && hasMoreMessages && onLoadMore && !isLoadingMoreRef.current) {
          loadMoreMessages()
        }
      })
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      container.removeEventListener('scroll', handleScroll)
      if (scrollTimeoutRef.current) {
        cancelAnimationFrame(scrollTimeoutRef.current)
      }
    }
  }, [hasMoreMessages, onLoadMore, loadMoreMessages])

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

  const handleDeleteMessage = (messageId, e) => {
    // Skip confirmation if shift key is held down
    const skipConfirm = e?.shiftKey
    if (!skipConfirm && !confirm(t('chat.deleteConfirm', 'Delete this message?'))) return
    socket?.emit('message:delete', { messageId, channelId })
  }

  const handleAddReaction = (messageId, emoji) => {
    socket?.emit('reaction:add', { messageId, emoji, channelId })
    setShowEmojiPicker(null)
    setEmojiPickerAnchor(null)
  }

  const handleRemoveReaction = (messageId, emoji) => {
    socket?.emit('reaction:remove', { messageId, emoji, channelId })
  }

  // Helper to render an emoji (unicode or custom)
  const renderEmoji = (emoji, className = '') => {
    // Check if it's a custom emoji object
    if (emoji && typeof emoji === 'object' && emoji.type === 'custom') {
      return (
        <img 
          src={emoji.url} 
          alt={emoji.name} 
          className={`reaction-custom-emoji ${className}`}
          title={emoji.name}
        />
      )
    }
    // Unicode emoji
    return <span className={className}>{emoji}</span>
  }

  const renderReactions = (message) => {
    if (!message.reactions || Object.keys(message.reactions).length === 0) return null

    return (
      <div className="message-reactions">
        {Object.entries(message.reactions).map(([emojiKey, users]) => {
          const emoji = deserializeReactionEmoji(emojiKey)
          const reactionUsers = asArray(users)
          const hasReacted = reactionUsers.includes(currentUserId)
          return (
            <button
              key={emojiKey}
              className={`reaction-badge ${hasReacted ? 'active' : ''}`}
              onClick={() => hasReacted 
                ? handleRemoveReaction(message.id, serializeReactionEmoji(emoji)) 
                : handleAddReaction(message.id, serializeReactionEmoji(emoji))
              }
            >
              {renderEmoji(emoji, 'reaction-emoji')}
              <span className="reaction-count">{reactionUsers.length}</span>
            </button>
          )
        })}
      </div>
    )
  }

  const renderEmbeds = (embeds) => {
    const safeEmbeds = asArray(embeds)
    if (safeEmbeds.length === 0) return null
    return (
      <div className="message-embeds">
        {safeEmbeds.map((embed, i) => {
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
              {embed.description && (
                <div className="embed-description">
                  <MarkdownMessage content={embed.description} currentUserId={currentUserId} members={members} />
                </div>
              )}
              {embed.fields && embed.fields.length > 0 && (
                <div className="embed-fields">
                  {embed.fields.map((field, fi) => (
                    <div key={fi} className={`embed-field${field.inline ? ' embed-field-inline' : ''}`}>
                      <div className="embed-field-name">
                        <MarkdownMessage content={field.name} currentUserId={currentUserId} members={members} />
                      </div>
                      <div className="embed-field-value">
                        <MarkdownMessage content={field.value} currentUserId={currentUserId} members={members} />
                      </div>
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

  const renderMessageContent = (content, mentions, attachments = []) => {
    const safeAttachments = asArray(attachments)
    if (!content) return null
    if (safeAttachments.length > 0 && isAttachmentOnlyPlaceholder(content)) {
      return null
    }
    return (
      <MarkdownMessage
        content={content}
        currentUserId={currentUserId}
        mentions={mentions}
        members={members}
        onMentionClick={handleMentionClick}
        serverEmojis={serverEmojis}
      />
    )
  }

  const handleContextMenu = (e, message) => {
    e.preventDefault()
    const clickX = e.clientX
    const clickY = e.clientY
    const isOwn = message.userId === currentUserId
    const isPinned = message.pinned
    const isServerOwner = server?.ownerId === currentUserId
    const canManageMessages = isAdmin || isServerOwner

    const items = [
      {
        label: 'Copy Message',
        icon: <ClipboardDocumentIcon size={14} />,
        onClick: () => {
          navigator.clipboard.writeText(message.content)
        }
      },
      {
        label: 'Copy Message Link',
        icon: <LinkIcon size={14} />,
        onClick: () => {
          const url = `${window.location.origin}/chat/${channelId}?message=${message.id}`
          navigator.clipboard.writeText(url)
        }
      },
      { type: 'separator' },
      ...(onReply ? [{
        label: 'Reply',
        icon: <ArrowUturnLeftIcon size={14} />,
        onClick: () => onReply(message)
      }] : []),
      {
        label: isPinned ? 'Unpin Message' : 'Pin Message',
        icon: <MapPinIcon size={14} />,
        onClick: () => {
          if (isPinned && onUnpinMessage) {
            onUnpinMessage(message.id)
          } else if (onPinMessage) {
            onPinMessage(message.id)
          }
        }
      },
      {
        label: t('chat.addReaction', 'Add Reaction'),
        icon: <FaceSmileIcon size={14} />,
        onClick: () => {
          // Create a virtual rect from click position for the emoji picker
          setEmojiPickerAnchor({
            left: clickX,
            top: clickY,
            bottom: clickY,
            right: clickX,
            width: 0,
            height: 0
          })
          setShowEmojiPicker(message.id)
        }
      },
      { type: 'separator' },
      ...(isOwn ? [
        {
          label: t('common.edit', 'Edit'),
          icon: <PencilIcon size={14} />,
          onClick: () => {
            setEditingMessage(message.id)
            setEditContent(message.content)
          }
        },
        {
          label: t('common.delete', 'Delete'),
          icon: <TrashIcon size={14} />,
          danger: true,
          onClick: (e) => handleDeleteMessage(message.id, e)
        },
        { type: 'separator' }
      ] : []),
      ...(!isOwn && canManageMessages ? [
        {
          label: t('common.delete', 'Delete'),
          icon: <TrashIcon size={14} />,
          danger: true,
          onClick: (e) => handleDeleteMessage(message.id, e)
        },
        { type: 'separator' }
      ] : []),
      ...(!isOwn && onReportMessage ? [
        {
          label: 'Report Message',
          icon: <FlagIcon size={14} />,
          onClick: () => onReportMessage(message)
        }
      ] : [])
    ]
    
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      items,
      message
    })
  }

  const openEmojiPicker = (e, messageId) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setEmojiPickerAnchor(rect)
    setShowEmojiPicker(messageId)
  }

  // Render selection toolbar
  const selectionToolbar = isSelectionMode ? (
    <div className="selection-toolbar">
      <div className="selection-toolbar-left">
        <button className="selection-btn" onClick={clearSelection} title="Cancel">
          <XCircleIcon size={18} />
        </button>
        <span className="selection-count">{selectedMessages.size} selected</span>
      </div>
      <div className="selection-toolbar-actions">
        <button className="selection-btn" onClick={selectAllMessages} title="Select All">
          <Square2StackIcon size={18} />
        </button>
        {canManageMessages && selectedMessages.size > 0 && (
          <button className="selection-btn danger" onClick={handleBulkDelete} title="Delete Selected">
            <TrashIcon size={18} />
          </button>
        )}
      </div>
    </div>
  ) : canManageMessages ? (
    <div className="selection-mode-toggle">
      <button className="selection-mode-btn" onClick={toggleSelectionMode} title="Select Messages">
        <Square2StackIcon size={16} />
        <span>Select</span>
      </button>
    </div>
  ) : null

  // Render return-to-latest button via portal to avoid overflow clipping
  const returnToLatestButton = (!isAtBottom && safeMessages.length > 0) ? (
    <button className="return-to-latest" onClick={scrollToBottom}>
      <ArrowDownIcon size={16} />
      Return to Latest
    </button>
  ) : null

  return (
    <div className="message-list" ref={containerRef}>
      {selectionToolbar}
      <div ref={topSentinelRef} className="scroll-sentinel" />
      {returnToLatestButton && createPortal(returnToLatestButton, document.body)}
      {isLoadingMore && (
        <div className="loading-more-messages">
          <ArrowPathIcon size={20} className="spinning" />
        </div>
      )}
      <div className="messages-container" ref={messagesStartRef}>
        {safeMessages.length === 0 ? (
          isLoading ? (
            <div className="no-messages loading-state">
              <div className="loading-spinner"></div>
              <h3>Loading messages...</h3>
              <p>Please wait while we load the conversation.</p>
            </div>
          ) : (
            <div className="no-messages">
              <ChatBubbleLeftRightIcon size={48} className="no-messages-icon" />
              <h3>{emptyState?.title || 'No messages yet'}</h3>
              <p>{emptyState?.message || 'Be the first to start the conversation!'}</p>
              {emptyState?.code ? (
                <div className="no-messages-diagnostic-code">
                  {t('chat.debugCode', 'Diagnostic code')}: {emptyState.code}
                </div>
              ) : null}
              {Array.isArray(emptyState?.fixes) && emptyState.fixes.length > 0 ? (
                <div className="no-messages-diagnostics">
                  <h4>{t('chat.suggestedFixes', 'Suggested fixes')}</h4>
                  <ul>
                    {emptyState.fixes.map((fix, index) => (
                      <li key={`${emptyState.code || 'fix'}-${index}`}>{fix}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {emptyState?.diagnostics ? (
                <div className="no-messages-meta">
                  {emptyState.diagnostics.channelName ? (
                    <span>{t('chat.channelLabel', 'Channel')}: {emptyState.diagnostics.channelName}</span>
                  ) : null}
                  {emptyState.diagnostics.serverName ? (
                    <span>{t('chat.serverLabel', 'Server')}: {emptyState.diagnostics.serverName}</span>
                  ) : null}
                  {emptyState.diagnostics.userIsMember === false ? (
                    <span>{t('chat.membershipMissing', 'Authenticated user is not a member of this server.')}</span>
                  ) : null}
                </div>
              ) : null}
            </div>
          )
        ) : (
          safeMessages.map((message, index) => {
            const previousMessage = index > 0 ? safeMessages[index - 1] : null
            const grouped = shouldGroupMessage(message, previousMessage)
            const isOwn = message.userId === currentUserId
            const isHovered = hoveredMessage === message.id
            const sendStatus = isOwn ? (message._sendStatus || 'sent') : 'sent'
            const isDeleted = Boolean(message.deleted)
            
            const messageMentions = message.mentions
            const isMentioned = messageMentions?.users?.includes(currentUserId) || 
              messageMentions?.usernames?.some(u => u.toLowerCase() === currentUserId?.toLowerCase()) ||
              message.content?.toLowerCase().includes('@everyone') ||
              message.content?.toLowerCase().includes('@here')

            return (
              <div
                key={message.id}
                id={`message-${message.id}`}
                className={`message ${grouped ? 'grouped' : ''} ${isOwn ? 'own' : ''} ${sendStatus === 'sending' ? 'sending' : ''} ${sendStatus === 'failed' ? 'failed' : ''} ${isMentioned ? 'mentioned' : ''}`}
                onMouseEnter={() => setHoveredMessage(message.id)}
                onMouseLeave={() => setHoveredMessage(null)}
                onContextMenu={(e) => handleContextMenu(e, message)}
              >
                {message.replyTo && (
                  <div 
                    className={`message-reply-ref ${message.replyTo.deleted ? 'deleted' : ''}`}
                    onClick={() => !message.replyTo.deleted && scrollToMessage(message.replyTo.id)}
                  >
                    <ArrowUturnLeftIcon size={12} />
                    {message.replyTo.deleted ? (
                      <span className="reply-deleted">Original message was deleted</span>
                    ) : (
                      <>
                        <span className="reply-author">{message.replyTo.username}</span>
                        <span className="reply-content">{message.replyTo.content?.slice(0, 80)}{message.replyTo.content?.length > 80 ? '...' : ''}</span>
                      </>
                    )}
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
                      userId={message.userId}
                    />
                    <span className="message-author" onClick={() => onShowProfile?.(message.userId)}>{message.username}</span>
                    {Boolean(message.bot) && (
                      <span className="bot-badge">BOT</span>
                    )}
                    {(message.encrypted || message.iv) && (
                      <span className="encrypted-badge" title="End-to-end encrypted">E2EE</span>
                    )}
                    {!(message.encrypted || message.iv) && (
                      <span className="unencrypted-badge" title="Not end-to-end encrypted">PLAIN</span>
                    )}
                    <span className="message-timestamp">
                      {formatDistance(new Date(message.timestamp), new Date(), { addSuffix: true })}
                    </span>
                    {isOwn && sendStatus === 'sending' && (
                      <span className="message-send-state sending">Sending...</span>
                    )}
                    {isOwn && sendStatus === 'failed' && (
                      <span className="message-send-state failed">Failed to send</span>
                    )}
                  </div>
                )}

                {editingMessage === message.id && !isDeleted ? (
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
                        <XMarkIcon size={14} /> Cancel
                      </button>
                      <button className="edit-save" onClick={() => handleEditMessage(message.id)}>
                        <CheckIcon size={14} /> Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="message-content">
                    {isDeleted ? (
                      <span className="message-deleted-copy">{t('chat.messageDeleted', 'This message has been deleted')}</span>
                    ) : (
                      <>
                        {renderMessageContent(message.content, message.mentions, message.attachments)}
                        {Boolean(message.edited) && <span className="edited-tag">(edited)</span>}
                      </>
                    )}
                    {isOwn && grouped && sendStatus === 'sending' && (
                      <span className="message-send-state-inline sending">Sending...</span>
                    )}
                    {isOwn && grouped && sendStatus === 'failed' && (
                      <span className="message-send-state-inline failed">Failed to send</span>
                    )}
                  </div>
                )}

                {!isDeleted && message.attachments && message.attachments.length > 0 && (
                  <div className="message-attachments">
                    {message.attachments.map((attachment, i) => (
                      <FileAttachment key={i} attachment={attachment} />
                    ))}
                  </div>
                )}

                {!isDeleted && renderEmbeds(message.embeds)}

                {!isDeleted && message.ui && (
                  <BotUIMessage
                    ui={message.ui}
                    messageId={message.id}
                    channelId={channelId}
                  />
                )}

                {!isDeleted && renderReactions(message)}

                {isHovered && !editingMessage && !isDeleted && (
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
                      onClick={(e) => openEmojiPicker(e, message.id)}
                      title="Add Reaction"
                    >
                      <FaceSmileIcon size={16} />
                    </button>
                    {onReply && (
                      <button
                        className="action-btn"
                        onClick={() => onReply(message)}
                        title="Reply"
                      >
                        <ArrowUturnLeftIcon size={16} />
                      </button>
                    )}
                    {isOwn && (
                      <>
                        <button
                          className="action-btn"
                          onClick={() => { setEditingMessage(message.id); setEditContent(message.content) }}
                          title="Edit"
                        >
                          <PencilIcon size={16} />
                        </button>
                        <button
                          className="action-btn delete"
                          onClick={(e) => handleDeleteMessage(message.id, e)}
                          title="Delete"
                        >
                          <TrashIcon size={16} />
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
        <div ref={messagesEndRef} />
      </div>
      
      {/* Portal-based emoji picker */}
      <ReactionEmojiPicker
        isOpen={!!showEmojiPicker}
        anchorRect={emojiPickerAnchor}
        onSelect={(emoji) => {
          if (showEmojiPicker) {
            handleAddReaction(showEmojiPicker, serializeReactionEmoji(emoji))
          }
        }}
        onClose={() => {
          setShowEmojiPicker(null)
          setEmojiPickerAnchor(null)
        }}
        serverEmojis={serverEmojis}
      />
      
      {/* Portal-based context menu */}
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
