// React hook for memory-efficient message pagination
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import MessagePaginationService from '../services/messagePaginationService'

export const useMessagePagination = (channelId, apiService, options = {}) => {
  const [state, setState] = useState({
    messages: [],
    loading: false,
    error: null,
    hasMoreBefore: true,
    hasMoreAfter: false,
    totalCount: 0
  })
  
  const paginationServiceRef = useRef(null)
  const currentChannelRef = useRef(channelId)
  const optionsRef = useRef(options)
  optionsRef.current = options
  
  // Initialize pagination service
  useEffect(() => {
    if (!paginationServiceRef.current && apiService) {
      paginationServiceRef.current = new MessagePaginationService(apiService)
    }
  }, [apiService])
  
  // Load initial messages when channel changes
  useEffect(() => {
    if (channelId !== currentChannelRef.current) {
      currentChannelRef.current = channelId
      loadInitialMessages()
    }
  }, [channelId])
  
  const loadInitialMessages = useCallback(async () => {
    if (!paginationServiceRef.current || !channelId) return
    
    setState(prev => ({ ...prev, loading: true, error: null }))
    
    try {
      const result = await paginationServiceRef.current.loadMessages(channelId, {
        limit: optionsRef.current.initialLimit || 50
      })
      
      setState(prev => ({
        ...prev,
        messages: result.messages,
        hasMoreBefore: result.hasMore.before,
        hasMoreAfter: result.hasMore.after,
        totalCount: result.totalCount,
        loading: false
      }))
    } catch (error) {
      setState(prev => ({
        ...prev,
        error,
        loading: false
      }))
    }
  }, [channelId])
  
  const loadMoreMessages = useCallback(async (direction = 'before', customLimit) => {
    if (!paginationServiceRef.current || !channelId || state.loading) return
    
    const currentMessages = state.messages
    if (currentMessages.length === 0) return
    
    const options = {
      limit: customLimit || optionsRef.current.pageSize || 50
    }
    
    if (direction === 'before') {
      if (!state.hasMoreBefore) return
      options.before = currentMessages[0]?.id
    } else {
      if (!state.hasMoreAfter) return
      options.after = currentMessages[currentMessages.length - 1]?.id
    }
    
    setState(prev => ({ ...prev, loading: true }))
    
    try {
      const result = await paginationServiceRef.current.loadMessages(channelId, options)
      
      setState(prev => {
        const newMessages = direction === 'before' 
          ? [...result.messages, ...prev.messages]
          : [...prev.messages, ...result.messages]
        
        return {
          ...prev,
          messages: newMessages,
          hasMoreBefore: result.hasMore.before,
          hasMoreAfter: result.hasMore.after,
          totalCount: result.totalCount,
          loading: false
        }
      })
    } catch (error) {
      setState(prev => ({
        ...prev,
        error,
        loading: false
      }))
    }
  }, [channelId, state.loading, state.hasMoreBefore, state.hasMoreAfter, state.messages])
  
  const loadMessagesAround = useCallback(async (messageId, contextSize = 25) => {
    if (!paginationServiceRef.current || !channelId) return
    
    setState(prev => ({ ...prev, loading: true, error: null }))
    
    try {
      const result = await paginationServiceRef.current.loadMessages(channelId, {
        around: messageId,
        limit: contextSize * 2
      })
      
      setState(prev => ({
        ...prev,
        messages: result.messages,
        hasMoreBefore: result.hasMore.before,
        hasMoreAfter: result.hasMore.after,
        totalCount: result.totalCount,
        loading: false
      }))
    } catch (error) {
      setState(prev => ({
        ...prev,
        error,
        loading: false
      }))
    }
  }, [channelId])
  
  const addMessage = useCallback((message) => {
    if (!paginationServiceRef.current || !channelId) return
    
    paginationServiceRef.current.addMessage(channelId, message)
    
    setState(prev => {
      // Check if message already exists
      const existingIndex = prev.messages.findIndex(m => m.id === message.id)
      if (existingIndex !== -1) return prev
      
      // Insert message in correct chronological position
      const newMessages = [...prev.messages]
      const insertIndex = findInsertIndex(newMessages, message.timestamp)
      newMessages.splice(insertIndex, 0, message)
      
      return {
        ...prev,
        messages: newMessages,
        totalCount: prev.totalCount + 1
      }
    })
  }, [channelId])
  
  const updateMessage = useCallback((messageId, updates) => {
    if (!paginationServiceRef.current || !channelId) return
    
    paginationServiceRef.current.updateMessage(channelId, messageId, updates)
    
    setState(prev => ({
      ...prev,
      messages: prev.messages.map(message => 
        message.id === messageId ? { ...message, ...updates } : message
      )
    }))
  }, [channelId])
  
  const removeMessage = useCallback((messageId) => {
    if (!paginationServiceRef.current || !channelId) return
    
    paginationServiceRef.current.removeMessage(channelId, messageId)
    
    setState(prev => ({
      ...prev,
      messages: prev.messages.filter(message => message.id !== messageId),
      totalCount: Math.max(0, prev.totalCount - 1)
    }))
  }, [channelId])
  
  const getVisibleMessages = useCallback((startIndex, endIndex) => {
    if (!paginationServiceRef.current || !channelId) return []
    
    return paginationServiceRef.current.getVisibleMessages(channelId, startIndex, endIndex)
  }, [channelId])
  
  const preloadMessages = useCallback(async (currentIndex, direction) => {
    if (!paginationServiceRef.current || !channelId) return
    
    await paginationServiceRef.current.preloadMessages(channelId, currentIndex, direction)
  }, [channelId])
  
  const reset = useCallback(() => {
    setState({
      messages: [],
      loading: false,
      error: null,
      hasMoreBefore: true,
      hasMoreAfter: false,
      totalCount: 0
    })
  }, [])
  
  const findInsertIndex = (messages, timestamp) => {
    let left = 0
    let right = messages.length
    
    while (left < right) {
      const mid = Math.floor((left + right) / 2)
      const midTimestamp = new Date(messages[mid].timestamp).getTime()
      const targetTimestamp = new Date(timestamp).getTime()
      
      if (midTimestamp < targetTimestamp) {
        left = mid + 1
      } else {
        right = mid
      }
    }
    
    return left
  }
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (paginationServiceRef.current) {
        // Service cleanup is handled by the service itself
      }
    }
  }, [])
  
  return {
    ...state,
    loadMore: loadMoreMessages,
    loadAround: loadMessagesAround,
    addMessage,
    updateMessage,
    removeMessage,
    getVisibleMessages,
    preloadMessages,
    reset,
    refresh: loadInitialMessages
  }
}

// Hook for virtual scrolling with message pagination
export const useVirtualMessagePagination = (channelId, apiService, containerRef, options = {}) => {
  const pagination = useMessagePagination(channelId, apiService, options)
  const [virtualState, setVirtualState] = useState({
    startIndex: 0,
    endIndex: 0,
    scrollTop: 0,
    isScrolling: false
  })
  
  const scrollTimeoutRef = useRef(null)
  const itemHeightCache = useRef(new Map())
  const averageItemHeight = useRef(80)
  
  // Configuration
  const config = useMemo(() => ({
    itemHeight: options.itemHeight || 80,
    overscan: options.overscan || 5,
    preloadThreshold: options.preloadThreshold || 10,
    ...options
  }), [options])
  
  // Calculate visible range based on scroll position
  const calculateVisibleRange = useCallback((scrollTop, containerHeight) => {
    const startIndex = Math.max(0, Math.floor(scrollTop / config.itemHeight) - config.overscan)
    const endIndex = Math.min(
      pagination.messages.length - 1,
      Math.ceil((scrollTop + containerHeight) / config.itemHeight) + config.overscan
    )
    
    return { startIndex, endIndex }
  }, [config.itemHeight, config.overscan, pagination.messages.length])
  
  // Handle scroll events
  const handleScroll = useCallback((event) => {
    const container = event.target
    const scrollTop = container.scrollTop
    const containerHeight = container.clientHeight
    const { startIndex, endIndex } = calculateVisibleRange(scrollTop, containerHeight)
    
    setVirtualState(prev => ({
      ...prev,
      startIndex,
      endIndex,
      scrollTop,
      isScrolling: true
    }))
    
    // Check if we need to load more messages
    if (endIndex >= pagination.messages.length - config.preloadThreshold && pagination.hasMoreAfter) {
      pagination.loadMore('after')
    }
    
    if (startIndex <= config.preloadThreshold && pagination.hasMoreBefore) {
      pagination.loadMore('before')
    }
    
    // Preload messages proactively
    const direction = scrollTop > (virtualState.scrollTop || 0) ? 'down' : 'up'
    pagination.preloadMessages(startIndex, direction)
    
    // Clear scrolling state after a delay
    clearTimeout(scrollTimeoutRef.current)
    scrollTimeoutRef.current = setTimeout(() => {
      setVirtualState(prev => ({ ...prev, isScrolling: false }))
    }, 150)
  }, [calculateVisibleRange, config.preloadThreshold, pagination, virtualState.scrollTop])
  
  // Attach scroll listener
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    
    container.addEventListener('scroll', handleScroll, { passive: true })
    
    // Initial calculation
    const containerHeight = container.clientHeight
    const { startIndex, endIndex } = calculateVisibleRange(0, containerHeight)
    setVirtualState(prev => ({ ...prev, startIndex, endIndex }))
    
    return () => {
      container.removeEventListener('scroll', handleScroll)
    }
  }, [handleScroll, calculateVisibleRange])
  
  // Get visible messages for rendering
  const visibleMessages = useMemo(() => {
    return pagination.messages.slice(virtualState.startIndex, virtualState.endIndex + 1)
  }, [pagination.messages, virtualState.startIndex, virtualState.endIndex])
  
  // Calculate total height for virtual scrolling
  const totalHeight = useMemo(() => {
    return pagination.messages.length * config.itemHeight
  }, [pagination.messages.length, config.itemHeight])
  
  // Calculate offset for visible items
  const offsetY = useMemo(() => {
    return virtualState.startIndex * config.itemHeight
  }, [virtualState.startIndex, config.itemHeight])
  
  return {
    ...pagination,
    visibleMessages,
    totalHeight,
    offsetY,
    startIndex: virtualState.startIndex,
    endIndex: virtualState.endIndex,
    isScrolling: virtualState.isScrolling,
    scrollToMessage: (messageId) => {
      const messageIndex = pagination.messages.findIndex(m => m.id === messageId)
      if (messageIndex !== -1 && containerRef.current) {
        const scrollTop = messageIndex * config.itemHeight
        containerRef.current.scrollTop = scrollTop
      }
    }
  }
}

// Hook for infinite scrolling without virtualization
export const useInfiniteMessageScroll = (channelId, apiService, options = {}) => {
  const pagination = useMessagePagination(channelId, apiService, options)
  const [scrollState, setScrollState] = useState({
    isNearTop: false,
    isNearBottom: false,
    lastScrollTop: 0
  })
  
  const observer = useRef(null)
  const topSentinel = useRef(null)
  const bottomSentinel = useRef(null)
  
  // Setup intersection observers for infinite scroll
  useEffect(() => {
    if (!topSentinel.current || !bottomSentinel.current) return
    
    observer.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.target === topSentinel.current && entry.isIntersecting) {
            if (pagination.hasMoreBefore && !pagination.loading) {
              pagination.loadMore('before')
            }
            setScrollState(prev => ({ ...prev, isNearTop: true }))
          } else if (entry.target === bottomSentinel.current && entry.isIntersecting) {
            if (pagination.hasMoreAfter && !pagination.loading) {
              pagination.loadMore('after')
            }
            setScrollState(prev => ({ ...prev, isNearBottom: true }))
          }
        })
      },
      { rootMargin: '100px' }
    )
    
    observer.current.observe(topSentinel.current)
    observer.current.observe(bottomSentinel.current)
    
    return () => {
      if (observer.current) {
        observer.current.disconnect()
      }
    }
  }, [pagination.hasMoreBefore, pagination.hasMoreAfter, pagination.loading])
  
  return {
    ...pagination,
    topSentinel,
    bottomSentinel,
    isNearTop: scrollState.isNearTop,
    isNearBottom: scrollState.isNearBottom
  }
}

export default useMessagePagination