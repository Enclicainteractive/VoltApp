import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { FixedSizeList as List, VariableSizeList } from 'react-window'
import { areEqual } from 'react-window'
import './VirtualizedMessageList.css'

const OVERSCAN_COUNT = 5
const DEFAULT_MESSAGE_HEIGHT = 80
const MESSAGE_PADDING = 8

// Message item component with React.memo for optimization
const MessageItem = React.memo(({ index, style, data }) => {
  const { messages, renderMessage, onMessageHeightChange } = data
  const message = messages[index]
  const itemRef = useRef(null)

  // Measure message height after render
  useEffect(() => {
    if (itemRef.current && onMessageHeightChange) {
      const height = itemRef.current.offsetHeight
      onMessageHeightChange(index, height + MESSAGE_PADDING)
    }
  }, [index, onMessageHeightChange, message])

  if (!message) {
    return (
      <div style={style} className="message-item message-item--loading">
        <div className="message-skeleton" />
      </div>
    )
  }

  return (
    <div style={style} className="message-item">
      <div ref={itemRef} className="message-content">
        {renderMessage(message, index)}
      </div>
    </div>
  )
}, areEqual)

MessageItem.displayName = 'MessageItem'

const VirtualizedMessageList = ({
  messages = [],
  renderMessage,
  height = 600,
  width = '100%',
  onScroll = () => {},
  onLoadMore = () => {},
  hasMore = false,
  isLoading = false,
  loadMoreThreshold = 10,
  estimatedMessageHeight = DEFAULT_MESSAGE_HEIGHT,
  className = '',
  autoScrollToBottom = true,
  scrollToBottomOnNewMessage = true
}) => {
  const listRef = useRef(null)
  const heightCacheRef = useRef(new Map())
  const [scrollPosition, setScrollPosition] = useState(0)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [shouldScrollToBottom, setShouldScrollToBottom] = useState(autoScrollToBottom)

  // Track previous message count for auto-scroll behavior
  const prevMessageCountRef = useRef(messages.length)

  // Get cached height for message
  const getItemHeight = useCallback((index) => {
    const cachedHeight = heightCacheRef.current.get(index)
    return cachedHeight || estimatedMessageHeight
  }, [estimatedMessageHeight])

  // Handle message height changes
  const onMessageHeightChange = useCallback((index, height) => {
    const currentHeight = heightCacheRef.current.get(index)
    if (currentHeight !== height) {
      heightCacheRef.current.set(index, height)
      
      // Force list to recalculate sizes
      if (listRef.current) {
        listRef.current.resetAfterIndex(index)
      }
    }
  }, [])

  // Data object for message rendering
  const itemData = useMemo(() => ({
    messages,
    renderMessage,
    onMessageHeightChange
  }), [messages, renderMessage, onMessageHeightChange])

  // Handle scroll events
  const handleScroll = useCallback(({ scrollDirection, scrollOffset, scrollUpdateWasRequested }) => {
    const { scrollHeight, clientHeight } = listRef.current?.querySelector('[data-testid="virtual-list-wrapper"]') || {}
    
    setScrollPosition(scrollOffset)
    
    // Check if we're at the bottom
    const atBottom = scrollHeight - scrollOffset - clientHeight < 10
    setIsAtBottom(atBottom)
    
    // Load more messages when scrolling to top
    if (scrollDirection === 'backward' && scrollOffset < loadMoreThreshold * estimatedMessageHeight && hasMore && !isLoading) {
      onLoadMore()
    }

    // Call external scroll handler
    onScroll({
      scrollDirection,
      scrollOffset,
      isAtBottom: atBottom,
      scrollUpdateWasRequested
    })
  }, [onScroll, onLoadMore, hasMore, isLoading, loadMoreThreshold, estimatedMessageHeight])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    const hasNewMessages = messages.length > prevMessageCountRef.current
    prevMessageCountRef.current = messages.length

    if (hasNewMessages && scrollToBottomOnNewMessage && (isAtBottom || shouldScrollToBottom)) {
      scrollToBottom()
    }
  }, [messages.length, isAtBottom, scrollToBottomOnNewMessage, shouldScrollToBottom])

  // Scroll to bottom function
  const scrollToBottom = useCallback(() => {
    if (listRef.current && messages.length > 0) {
      listRef.current.scrollToItem(messages.length - 1, 'end')
      setShouldScrollToBottom(false)
    }
  }, [messages.length])

  // Scroll to specific message
  const scrollToMessage = useCallback((messageIndex) => {
    if (listRef.current && messageIndex >= 0 && messageIndex < messages.length) {
      listRef.current.scrollToItem(messageIndex, 'center')
    }
  }, [messages.length])

  // Initial scroll to bottom
  useEffect(() => {
    if (autoScrollToBottom && messages.length > 0 && shouldScrollToBottom) {
      setTimeout(scrollToBottom, 100)
    }
  }, [autoScrollToBottom, messages.length, shouldScrollToBottom, scrollToBottom])

  // Clear height cache when messages change significantly
  useEffect(() => {
    if (messages.length === 0) {
      heightCacheRef.current.clear()
    }
  }, [messages.length])

  const listClasses = [
    'virtualized-message-list',
    className,
    isLoading && 'virtualized-message-list--loading'
  ].filter(Boolean).join(' ')

  return (
    <div className={listClasses} style={{ height, width }}>
      {/* Loading indicator for new messages */}
      {isLoading && (
        <div className="virtualized-message-list__loader">
          <div className="loader-spinner" />
          <span>Loading messages...</span>
        </div>
      )}

      {/* Virtual list */}
      <VariableSizeList
        ref={listRef}
        height={height}
        width={width}
        itemCount={messages.length}
        itemSize={getItemHeight}
        itemData={itemData}
        overscanCount={OVERSCAN_COUNT}
        onScroll={handleScroll}
        className="virtualized-message-list__container"
      >
        {MessageItem}
      </VariableSizeList>

      {/* Scroll to bottom button */}
      {!isAtBottom && messages.length > 0 && (
        <button
          className="virtualized-message-list__scroll-to-bottom"
          onClick={scrollToBottom}
          aria-label="Scroll to bottom"
        >
          <span className="scroll-arrow">↓</span>
          Scroll to bottom
        </button>
      )}

      {/* Load more indicator */}
      {hasMore && !isLoading && (
        <div className="virtualized-message-list__load-more">
          <button onClick={onLoadMore} className="load-more-button">
            Load more messages
          </button>
        </div>
      )}
    </div>
  )
}

// Hook for managing virtual list state
export const useVirtualizedMessageList = (initialMessages = []) => {
  const [messages, setMessages] = useState(initialMessages)
  const [isLoading, setIsLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)

  const addMessage = useCallback((message) => {
    setMessages(prev => [...prev, message])
  }, [])

  const addMessages = useCallback((newMessages, prepend = false) => {
    setMessages(prev => 
      prepend ? [...newMessages, ...prev] : [...prev, ...newMessages]
    )
  }, [])

  const updateMessage = useCallback((messageId, updates) => {
    setMessages(prev =>
      prev.map(msg => msg.id === messageId ? { ...msg, ...updates } : msg)
    )
  }, [])

  const removeMessage = useCallback((messageId) => {
    setMessages(prev => prev.filter(msg => msg.id !== messageId))
  }, [])

  const clearMessages = useCallback(() => {
    setMessages([])
  }, [])

  return {
    messages,
    setMessages,
    addMessage,
    addMessages,
    updateMessage,
    removeMessage,
    clearMessages,
    isLoading,
    setIsLoading,
    hasMore,
    setHasMore
  }
}

// Performance optimization hooks
export const useMessageMemoization = (messages) => {
  return useMemo(() => {
    // Group consecutive messages from the same user
    return messages.reduce((acc, message, index) => {
      const prevMessage = messages[index - 1]
      const isGrouped = prevMessage && 
        prevMessage.user_id === message.user_id &&
        (message.timestamp - prevMessage.timestamp) < 300000 // 5 minutes

      acc.push({
        ...message,
        isGrouped,
        isFirstInGroup: !isGrouped,
        isLastInGroup: index === messages.length - 1 || 
          (messages[index + 1] && messages[index + 1].user_id !== message.user_id)
      })

      return acc
    }, [])
  }, [messages])
}

export default VirtualizedMessageList