import { useState, useEffect, useCallback, useRef } from 'react'

const MESSAGE_BATCH_SIZE = 50
const PRELOAD_THRESHOLD = 10 // Load more when 10 messages from end

export const useLazyMessageLoading = (channelId, apiService) => {
  const [messages, setMessages] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [error, setError] = useState(null)
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  
  const loadedRanges = useRef(new Set())
  const messageCache = useRef(new Map())
  const abortControllerRef = useRef(null)

  // Reset state when channel changes
  useEffect(() => {
    if (channelId) {
      setMessages([])
      setIsLoading(false)
      setHasMore(true)
      setError(null)
      setIsInitialLoad(true)
      loadedRanges.current.clear()
      
      // Cancel any pending request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [channelId])

  // Create cache key for message range
  const createRangeKey = useCallback((before, limit) => {
    return `${channelId}:${before || 'latest'}:${limit}`
  }, [channelId])

  // Load messages with caching and deduplication
  const loadMessages = useCallback(async (options = {}) => {
    if (!channelId || isLoading) return []

    const { 
      before = null, 
      limit = MESSAGE_BATCH_SIZE,
      replace = false,
      force = false 
    } = options

    const rangeKey = createRangeKey(before, limit)
    
    // Check if we already have this range loaded
    if (!force && loadedRanges.current.has(rangeKey)) {
      return []
    }

    // Check cache first
    if (!force && messageCache.current.has(rangeKey)) {
      const cachedMessages = messageCache.current.get(rangeKey)
      if (replace) {
        setMessages(cachedMessages)
      } else {
        setMessages(prev => [...prev, ...cachedMessages])
      }
      return cachedMessages
    }

    setIsLoading(true)
    setError(null)

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    abortControllerRef.current = new AbortController()

    try {
      const response = await apiService.getMessages(channelId, {
        before,
        limit,
        signal: abortControllerRef.current.signal
      })

      if (response.success && Array.isArray(response.messages)) {
        const newMessages = response.messages

        // Cache the results
        messageCache.current.set(rangeKey, newMessages)
        loadedRanges.current.add(rangeKey)

        // Update state
        if (replace) {
          setMessages(newMessages)
        } else {
          setMessages(prev => {
            // Deduplicate messages
            const existingIds = new Set(prev.map(msg => msg.id))
            const uniqueNewMessages = newMessages.filter(msg => !existingIds.has(msg.id))
            return [...prev, ...uniqueNewMessages]
          })
        }

        // Check if we have more messages to load
        setHasMore(newMessages.length === limit)
        setIsInitialLoad(false)

        return newMessages
      } else {
        setError(response.error || 'Failed to load messages')
        setHasMore(false)
        return []
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Failed to load messages:', err)
        setError(err.message || 'Failed to load messages')
        setHasMore(false)
      }
      return []
    } finally {
      setIsLoading(false)
    }
  }, [channelId, isLoading, createRangeKey, apiService])

  // Initial load
  useEffect(() => {
    if (channelId && isInitialLoad) {
      loadMessages({ replace: true })
    }
  }, [channelId, isInitialLoad, loadMessages])

  // Load more messages (for infinite scroll)
  const loadMore = useCallback(() => {
    if (!hasMore || isLoading || messages.length === 0) return

    const oldestMessage = messages[messages.length - 1]
    loadMessages({ 
      before: oldestMessage.id,
      limit: MESSAGE_BATCH_SIZE 
    })
  }, [hasMore, isLoading, messages, loadMessages])

  // Load newer messages (for real-time updates)
  const loadNewer = useCallback(() => {
    if (isLoading || messages.length === 0) return

    const newestMessage = messages[0]
    loadMessages({ 
      after: newestMessage.id,
      limit: MESSAGE_BATCH_SIZE 
    })
  }, [isLoading, messages, loadMessages])

  // Preload messages when approaching end
  const checkPreload = useCallback((scrollPosition, totalMessages) => {
    if (hasMore && !isLoading && totalMessages > 0) {
      const distanceFromEnd = totalMessages - scrollPosition
      if (distanceFromEnd <= PRELOAD_THRESHOLD) {
        loadMore()
      }
    }
  }, [hasMore, isLoading, loadMore])

  // Add new message (for real-time updates)
  const addMessage = useCallback((message) => {
    setMessages(prev => {
      // Check if message already exists
      const exists = prev.some(msg => msg.id === message.id)
      if (exists) return prev
      
      // Add to beginning (newest first)
      return [message, ...prev]
    })
  }, [])

  // Update existing message
  const updateMessage = useCallback((messageId, updates) => {
    setMessages(prev => 
      prev.map(msg => 
        msg.id === messageId ? { ...msg, ...updates } : msg
      )
    )
  }, [])

  // Remove message
  const removeMessage = useCallback((messageId) => {
    setMessages(prev => prev.filter(msg => msg.id !== messageId))
  }, [])

  // Clear cache for channel
  const clearCache = useCallback(() => {
    const keysToDelete = Array.from(messageCache.current.keys())
      .filter(key => key.startsWith(`${channelId}:`))
    
    keysToDelete.forEach(key => {
      messageCache.current.delete(key)
      loadedRanges.current.delete(key)
    })
  }, [channelId])

  // Refresh messages (force reload)
  const refresh = useCallback(() => {
    clearCache()
    setMessages([])
    setIsInitialLoad(true)
    setHasMore(true)
    setError(null)
  }, [clearCache])

  return {
    messages,
    isLoading,
    hasMore,
    error,
    isInitialLoad,
    loadMore,
    loadNewer,
    addMessage,
    updateMessage,
    removeMessage,
    refresh,
    checkPreload
  }
}