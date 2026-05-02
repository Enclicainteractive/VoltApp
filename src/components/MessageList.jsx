import React, { useEffect, useRef, useState, useCallback, useLayoutEffect, useMemo } from 'react'
import { formatDistance } from 'date-fns'
import { PencilIcon, TrashIcon, ArrowUturnLeftIcon, FaceSmileIcon, XMarkIcon, CheckIcon, ClipboardDocumentIcon, LinkIcon, MapPinIcon, ArrowDownIcon, ArrowPathIcon, ChatBubbleLeftRightIcon, FlagIcon, Square2StackIcon, XCircleIcon } from '@heroicons/react/24/outline'
import { useSocket } from '../contexts/SocketContext'
import { useTranslation } from '../hooks/useTranslation'
import Avatar from './Avatar'
import MarkdownMessage from './MarkdownMessage'
import FileAttachment from './FileAttachment'
import ContextMenu from './ContextMenu'
import ReactionEmojiPicker from './ReactionEmojiPicker'
import BotUIMessage from './BotUIMessage'
import GuildTagBadge from './GuildTagBadge'
import { deserializeReactionEmoji, serializeReactionEmoji } from '../utils/reactionEmoji'
import '../assets/styles/MessageList.css'

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥']
const ATTACHMENT_PLACEHOLDER_TYPES = new Set(['image', 'video', 'audio', 'file', 'attachment'])
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

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
const prefersReducedMotion = () => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia(REDUCED_MOTION_QUERY).matches
}

// Memoize the MessageList component for better performance
const MessageList = React.memo(({ messages, emptyState = null, currentUserId, channelId, onReply, onLoadMore, onPinMessage, onUnpinMessage, onReportMessage, highlightMessageId, onSaveScrollPosition, scrollPosition, onShowProfile, members, serverEmojis, replyingTo, onCancelReply, serverId, isAdmin, server, isLoading, pinningMessageId }) => {
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
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMoreMessages, setHasMoreMessages] = useState(true)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [initialLoad, setInitialLoad] = useState(true)
  const [selectedMessages, setSelectedMessages] = useState(new Set())
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [scrollBtnLeaving, setScrollBtnLeaving] = useState(false)
  const prevMessageCountRef = useRef(0)
  const messageEdgeRef = useRef({ oldest: null, newest: null })
  const isAtBottomRef = useRef(true)
  const wasAtBottomRef = useRef(true)
  const restoredChannelRef = useRef(null)
  
  // Memoize expensive computations
  const safeMessages = useMemo(() => asArray(messages), [messages])
  const currentMentionAliases = useMemo(() => {
    const me = asArray(members).find((member) => member?.id === currentUserId || member?.userId === currentUserId)
    if (!me) return new Set()
    const aliases = new Set()
    const appendAlias = (value) => {
      if (typeof value !== 'string') return
      const trimmed = value.trim().toLowerCase()
      if (trimmed) aliases.add(trimmed)
    }
    appendAlias(me.username)
    appendAlias(me.displayName)
    appendAlias(me.nickname)
    appendAlias(me.globalName)
    appendAlias(me?.user?.username)
    return aliases
  }, [members, currentUserId])

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

  // Track unread count when not at bottom
  useEffect(() => {
    const nextCount = safeMessages.length
    const prevCount = prevMessageCountRef.current
    const oldest = safeMessages[0]?.id || safeMessages[0]?.timestamp || null
    const newest = safeMessages[nextCount - 1]?.id || safeMessages[nextCount - 1]?.timestamp || null
    const prevEdges = messageEdgeRef.current

    if (nextCount > prevCount && prevCount > 0) {
      const newCount = nextCount - prevCount
      const prependedOnly = prevEdges.oldest && oldest !== prevEdges.oldest && newest === prevEdges.newest
      const appendedAtBottom = prevEdges.newest && newest !== prevEdges.newest
      if (appendedAtBottom && !prependedOnly) {
        if (!isAtBottomRef.current) {
          setUnreadCount(prev => prev + newCount)
        } else if (containerRef.current) {
          containerRef.current.scrollTo({
            top: containerRef.current.scrollHeight,
            behavior: prefersReducedMotion() ? 'auto' : 'smooth'
          })
          setUnreadCount(0)
          setScrollBtnLeaving(false)
        }
      }
    }

    prevMessageCountRef.current = nextCount
    messageEdgeRef.current = { oldest, newest }
  }, [safeMessages])

  useEffect(() => {
    setInitialLoad(true)
    setHasMoreMessages(true)
    restoredChannelRef.current = null
    prevMessageCountRef.current = 0
    messageEdgeRef.current = { oldest: null, newest: null }
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

  const scrollToBottom = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    // Smooth scroll to bottom
    container.scrollTo({
      top: container.scrollHeight,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth'
    })
    setUnreadCount(0)
    setScrollBtnLeaving(false)
  }, [])

  const scrollToMessage = useCallback((messageId) => {
    const element = document.getElementById(`message-${messageId}`)
    if (element) {
      element.scrollIntoView({
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        block: 'center'
      })
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
    const containerTop = container.getBoundingClientRect().top
    const anchorElement = Array.from(container.querySelectorAll('.message[id]')).find((node) => {
      const rect = node.getBoundingClientRect()
      return rect.bottom >= containerTop + 2
    })
    const anchorMessageId = anchorElement?.id || null
    const anchorOffset = anchorElement
      ? anchorElement.getBoundingClientRect().top - containerTop
      : 0

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
        requestAnimationFrame(() => {
          const nextContainer = containerRef.current
          if (nextContainer) {
            let restoredWithAnchor = false
            if (anchorMessageId) {
              const nextAnchor = document.getElementById(anchorMessageId)
              if (nextAnchor && nextContainer.contains(nextAnchor)) {
                const nextContainerTop = nextContainer.getBoundingClientRect().top
                const nextAnchorOffset = nextAnchor.getBoundingClientRect().top - nextContainerTop
                nextContainer.scrollTop += nextAnchorOffset - anchorOffset
                restoredWithAnchor = true
              }
            }

            if (!restoredWithAnchor) {
              const heightDiff = nextContainer.scrollHeight - previousScrollHeight
              if (heightDiff > 0) {
                nextContainer.scrollTop = previousScrollTop + heightDiff
              }
            }
          }
          // Only clear the loading flag after the scroll is restored
          setIsLoadingMore(false)
          isLoadingMoreRef.current = false
        })
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
    const nextContent = editContent.trim()
    if (!nextContent) return
    const currentMessage = safeMessages.find((message) => message.id === messageId)
    if (currentMessage && String(currentMessage.content || '').trim() === nextContent) {
      setEditingMessage(null)
      setEditContent('')
      return
    }
    socket?.emit('message:edit', {
      messageId,
      channelId,
      content: nextContent
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

  const handleToggleReaction = useCallback((messageId, emojiKey, currentReactions) => {
    const users = asArray(currentReactions?.[emojiKey])
    const hasReacted = users.includes(currentUserId)
    socket?.emit(hasReacted ? 'reaction:remove' : 'reaction:add', { messageId, emoji: emojiKey, channelId })
    setShowEmojiPicker(null)
    setEmojiPickerAnchor(null)
  }, [socket, channelId, currentUserId])

  const handleAddReaction = useCallback((messageId, emoji) => {
    const emojiKey = serializeReactionEmoji(emoji)
    socket?.emit('reaction:add', { messageId, emoji: emojiKey, channelId })
    setShowEmojiPicker(null)
    setEmojiPickerAnchor(null)
  }, [socket, channelId])

  const handleRemoveReaction = useCallback((messageId, emoji) => {
    const emojiKey = serializeReactionEmoji(emoji)
    socket?.emit('reaction:remove', { messageId, emoji: emojiKey, channelId })
  }, [socket, channelId])

  // Helper to render an emoji (unicode or custom)
  const renderEmoji = (emoji, className = '') => {
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
          // Build tooltip: show up to 10 usernames
          const tooltipNames = reactionUsers.slice(0, 10).join(', ') + (reactionUsers.length > 10 ? ` and ${reactionUsers.length - 10} more` : '')
          return (
            <button
              key={emojiKey}
              type="button"
              className={`reaction-badge ${hasReacted ? 'active' : ''}`}
              onClick={() => handleToggleReaction(message.id, emojiKey, message.reactions)}
              title={tooltipNames || `${reactionUsers.length} reaction${reactionUsers.length !== 1 ? 's' : ''}`}
            >
              {renderEmoji(emoji, 'reaction-emoji')}
              <span className="reaction-count">{reactionUsers.length}</span>
            </button>
          )
        })}
        {/* Add reaction button next to existing reactions (Discord-style) */}
        <button
          type="button"
          className="reaction-badge reaction-add-btn"
          onClick={(e) => openEmojiPicker(e, message.id)}
          title="Add Reaction"
          aria-label="Add reaction"
        >
          <FaceSmileIcon size={14} />
        </button>
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
            <div key={embed.url || embed.title || i} className="message-embed" style={{ borderLeftColor: borderColor }}>
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

    const items = [
      {
        label: 'Copy Message',
        icon: <ClipboardDocumentIcon size={14} />,
        onClick: () => {
          navigator.clipboard.writeText(String(message.content || '')).catch(() => {})
        }
      },
      {
        label: 'Copy Message Link',
        icon: <LinkIcon size={14} />,
        onClick: () => {
          const url = `${window.location.origin}/chat/${channelId}?message=${message.id}`
          navigator.clipboard.writeText(url).catch(() => {})
        }
      },
      { type: 'separator' },
      ...(onReply ? [{
        label: 'Reply',
        icon: <ArrowUturnLeftIcon size={14} />,
        onClick: () => onReply(message)
      }] : []),
      ...(canManageMessages ? [{
        label: isPinned ? 'Unpin Message' : 'Pin Message',
        icon: <MapPinIcon size={14} />,
        onClick: () => {
          if (isPinned && onUnpinMessage) {
            onUnpinMessage(message.id)
          } else if (onPinMessage) {
            onPinMessage(message.id)
          }
        }
      }] : []),
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
        <button type="button" className="selection-btn" onClick={clearSelection} title="Cancel">
          <XCircleIcon size={18} />
        </button>
        <span className="selection-count">{selectedMessages.size} selected</span>
      </div>
      <div className="selection-toolbar-actions">
        <button type="button" className="selection-btn" onClick={selectAllMessages} title="Select All">
          <Square2StackIcon size={18} />
        </button>
        {canManageMessages && selectedMessages.size > 0 && (
          <button type="button" className="selection-btn danger" onClick={handleBulkDelete} title="Delete Selected">
            <TrashIcon size={18} />
          </button>
        )}
      </div>
    </div>
  ) : canManageMessages ? (
    <div className="selection-mode-toggle">
      <button type="button" className="selection-mode-btn" onClick={toggleSelectionMode} title="Select Messages">
        <Square2StackIcon size={16} />
        <span>Select</span>
      </button>
    </div>
  ) : null

  // Animate out when reaching bottom
  useEffect(() => {
    const justReachedBottom = isAtBottom && !wasAtBottomRef.current
    wasAtBottomRef.current = isAtBottom
    if (!justReachedBottom) return
    if (unreadCount > 0) setUnreadCount(0)
    setScrollBtnLeaving(true)
    const timeoutId = setTimeout(() => setScrollBtnLeaving(false), 280)
    return () => clearTimeout(timeoutId)
  }, [isAtBottom, unreadCount])

  // Render return-to-latest within the message pane so it stays scoped to chat-area-main
  const showScrollBtn = !isAtBottom && safeMessages.length > 0
  const returnToLatestButton = (showScrollBtn || scrollBtnLeaving) ? (
    <button
      type="button"
      className={`return-to-latest${scrollBtnLeaving ? ' leaving' : ''}`}
      onClick={scrollToBottom}
      aria-label="Scroll to latest messages"
    >
      <span className="rtl-icon">
        <ArrowDownIcon width={16} height={16} />
      </span>
      <span className="rtl-text">Jump to Latest</span>
      {unreadCount > 0 && (
        <span className="rtl-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
      )}
    </button>
  ) : null

  return (
    <div className="message-list-shell">
      <div className="message-list" ref={containerRef}>
        {selectionToolbar}
        <div ref={topSentinelRef} className="scroll-sentinel" />
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
            const nextMessage = index < safeMessages.length - 1 ? safeMessages[index + 1] : null
            const endsCluster = !nextMessage || !shouldGroupMessage(nextMessage, message)
            const isOwn = message.userId === currentUserId
            const isHovered = hoveredMessage === message.id
            const sendStatus = isOwn ? (message._sendStatus || 'sent') : 'sent'
            const isDeleted = Boolean(message.deleted)
            const isPinning = pinningMessageId === message.id
            
            const messageMentions = message.mentions
            const mentionedUsernames = asArray(messageMentions?.usernames)
            const isMentionedByName = currentMentionAliases.size > 0 &&
              mentionedUsernames.some((username) => typeof username === 'string' && currentMentionAliases.has(username.toLowerCase()))
            const isMentioned = messageMentions?.users?.includes(currentUserId) || 
              isMentionedByName ||
              message.content?.toLowerCase().includes('@everyone') ||
              message.content?.toLowerCase().includes('@here')
            const timestampDate = new Date(message.timestamp)
            const hasValidTimestamp = !Number.isNaN(timestampDate.getTime())
            const relativeTimestamp = hasValidTimestamp
              ? formatDistance(timestampDate, new Date(), { addSuffix: true })
              : t('chat.unknownTime', 'Unknown time')
            const absoluteTimestamp = hasValidTimestamp ? timestampDate.toLocaleString() : ''

            return (
              <div
                key={message.id}
                id={`message-${message.id}`}
                className={`message ${grouped ? 'grouped' : 'cluster-start'} ${endsCluster ? 'cluster-end' : ''} ${!grouped && endsCluster ? 'cluster-solo' : ''} ${isOwn ? 'own' : ''} ${sendStatus === 'sending' ? 'sending' : ''} ${sendStatus === 'failed' ? 'failed' : ''} ${isMentioned ? 'mentioned' : ''}`}
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
                    <span className="message-author" onClick={() => onShowProfile?.(message.userId)}>
                      {message.displayName || message.username}
                      {message.guildTag && (
                        <GuildTagBadge
                          tag={message.guildTag}
                          serverId={message.guildTagServerId}
                          isPrivate={message.guildTagPrivate}
                        />
                      )}
                    </span>
                    {Boolean(message.bot) && (
                      <span className="bot-badge">BOT</span>
                    )}
                    {(message.encrypted || message.iv) && (
                      <span className="encrypted-badge" title="End-to-end encrypted">E2EE</span>
                    )}
                    {!(message.encrypted || message.iv) && (
                      <span className="unencrypted-badge" title="Not end-to-end encrypted">PLAIN</span>
                    )}
                    <time className="message-timestamp" dateTime={hasValidTimestamp ? timestampDate.toISOString() : undefined} title={absoluteTimestamp}>
                      {relativeTimestamp}
                    </time>
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
                      <button type="button" className="edit-cancel" onClick={() => setEditingMessage(null)}>
                        <XMarkIcon size={14} /> Cancel
                      </button>
                      <button type="button" className="edit-save" onClick={() => handleEditMessage(message.id)}>
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
                      <FileAttachment key={attachment.id || attachment.url || i} attachment={attachment} />
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

                {isPinning && (
                  <div className="pin-loading">
                    <ArrowPathIcon size={14} className="spinning" />
                    <span>Pinning...</span>
                  </div>
                )}

                {message.pinned && !isPinning && (
                  <div className="pinned-indicator">
                    <MapPinIcon size={14} />
                    <span>Pinned</span>
                  </div>
                )}

                {isHovered && !editingMessage && !isDeleted && (
                  <div className="message-actions">
                    {QUICK_REACTIONS.map(emoji => (
                      <button
                        key={emoji}
                        type="button"
                        className="action-btn reaction-quick"
                        onClick={() => handleAddReaction(message.id, emoji)}
                        title={`React with ${emoji}`}
                      >
                        {emoji}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="action-btn"
                      onClick={(e) => openEmojiPicker(e, message.id)}
                      title="Add Reaction"
                      aria-label="Add reaction"
                    >
                      <FaceSmileIcon size={16} />
                    </button>
                    {onReply && (
                      <button
                        type="button"
                        className="action-btn"
                        onClick={() => onReply(message)}
                        title="Reply"
                        aria-label="Reply to message"
                      >
                        <ArrowUturnLeftIcon size={16} />
                      </button>
                    )}
                    {isOwn && (
                      <>
                        <button
                          type="button"
                          className="action-btn"
                          onClick={() => { setEditingMessage(message.id); setEditContent(message.content) }}
                          title="Edit"
                          aria-label="Edit message"
                        >
                          <PencilIcon size={16} />
                        </button>
                        <button
                          type="button"
                          className="action-btn delete"
                          onClick={(e) => handleDeleteMessage(message.id, e)}
                          title="Delete"
                          aria-label="Delete message"
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
              handleAddReaction(showEmojiPicker, emoji)
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
      {returnToLatestButton}
    </div>
  )
})

MessageList.displayName = 'MessageList'

export default MessageList
