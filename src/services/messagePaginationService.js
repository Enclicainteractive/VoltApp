// Memory-Efficient Message Pagination Service for VoltChat
// Manages large message datasets with intelligent memory management

class MessagePaginationService {
  constructor(apiService) {
    this.apiService = apiService
    this.channels = new Map() // channelId -> ChannelPagination
    this.config = {
      maxMessagesInMemory: 500,
      pageSize: 50,
      virtualWindowSize: 200,
      preloadThreshold: 0.8,
      unloadThreshold: 1000,
      cacheTimeout: 10 * 60 * 1000 // 10 minutes
    }
    
    // Performance tracking
    this.metrics = {
      messagesLoaded: 0,
      messagesUnloaded: 0,
      cacheHits: 0,
      apiRequests: 0,
      memoryUsage: 0
    }
    
    this.setupMemoryManagement()
  }

  setupMemoryManagement() {
    // Monitor memory usage periodically
    setInterval(() => {
      this.performMemoryCleanup()
      this.updateMemoryMetrics()
    }, 30000) // Every 30 seconds
    
    // Listen for low memory warnings
    if ('memory' in performance) {
      setInterval(() => {
        this.checkMemoryPressure()
      }, 5000)
    }
  }

  // Get or create channel pagination instance
  getChannelPagination(channelId) {
    if (!this.channels.has(channelId)) {
      this.channels.set(channelId, new ChannelPagination(channelId, this.apiService, this.config))
    }
    return this.channels.get(channelId)
  }

  // Load messages for a channel
  async loadMessages(channelId, options = {}) {
    const pagination = this.getChannelPagination(channelId)
    this.metrics.apiRequests++
    
    try {
      const result = await pagination.loadMessages(options)
      this.metrics.messagesLoaded += result.messages.length
      return result
    } catch (error) {
      console.error(`[MessagePagination] Failed to load messages for channel ${channelId}:`, error)
      throw error
    }
  }

  // Get messages in viewport range
  getVisibleMessages(channelId, startIndex, endIndex) {
    const pagination = this.getChannelPagination(channelId)
    return pagination.getMessagesInRange(startIndex, endIndex)
  }

  // Preload messages ahead of current position
  async preloadMessages(channelId, currentIndex, direction = 'down') {
    const pagination = this.getChannelPagination(channelId)
    await pagination.preloadMessages(currentIndex, direction)
  }

  // Add new message (real-time)
  addMessage(channelId, message) {
    const pagination = this.getChannelPagination(channelId)
    pagination.addMessage(message)
  }

  // Update existing message
  updateMessage(channelId, messageId, updates) {
    const pagination = this.getChannelPagination(channelId)
    pagination.updateMessage(messageId, updates)
  }

  // Remove message
  removeMessage(channelId, messageId) {
    const pagination = this.getChannelPagination(channelId)
    pagination.removeMessage(messageId)
  }

  // Memory management
  performMemoryCleanup() {
    for (const [channelId, pagination] of this.channels.entries()) {
      const unloadedCount = pagination.performCleanup()
      this.metrics.messagesUnloaded += unloadedCount
      
      // Remove unused channel instances
      if (pagination.isUnused()) {
        this.channels.delete(channelId)
      }
    }
  }

  checkMemoryPressure() {
    if ('memory' in performance) {
      const memInfo = performance.memory
      const usedPercent = memInfo.usedJSHeapSize / memInfo.jsHeapSizeLimit
      
      if (usedPercent > 0.8) { // 80% memory usage
        console.warn('[MessagePagination] High memory usage detected, performing aggressive cleanup')
        this.performAggressiveCleanup()
      }
    }
  }

  performAggressiveCleanup() {
    // Reduce max messages in memory
    const originalMax = this.config.maxMessagesInMemory
    this.config.maxMessagesInMemory = Math.max(100, originalMax * 0.5)
    
    this.performMemoryCleanup()
    
    // Restore original limit after cleanup
    setTimeout(() => {
      this.config.maxMessagesInMemory = originalMax
    }, 60000) // 1 minute
  }

  updateMemoryMetrics() {
    let totalMessages = 0
    let totalMemoryUsage = 0
    
    for (const pagination of this.channels.values()) {
      totalMessages += pagination.getLoadedMessageCount()
      totalMemoryUsage += pagination.estimateMemoryUsage()
    }
    
    this.metrics.memoryUsage = totalMemoryUsage
  }

  // Get service metrics
  getMetrics() {
    return {
      ...this.metrics,
      channelCount: this.channels.size,
      totalMessages: Array.from(this.channels.values())
        .reduce((sum, p) => sum + p.getLoadedMessageCount(), 0)
    }
  }

  // Clear all cached data
  clearCache() {
    this.channels.clear()
    this.metrics.messagesUnloaded += this.metrics.messagesLoaded
    this.metrics.messagesLoaded = 0
  }
}

// Channel-specific pagination management
class ChannelPagination {
  constructor(channelId, apiService, config) {
    this.channelId = channelId
    this.apiService = apiService
    this.config = config
    
    // Message storage
    this.messages = new Map() // messageId -> message
    this.messageOrder = [] // ordered array of message IDs
    this.loadedRanges = [] // { start, end, timestamp }
    
    // Pagination state
    this.hasMoreBefore = true
    this.hasMoreAfter = false
    this.isLoading = false
    this.lastAccessTime = Date.now()
    
    // Virtual scrolling state
    this.virtualWindow = { start: 0, end: 0 }
    this.totalEstimatedCount = 0
  }

  async loadMessages(options = {}) {
    const {
      before = null,
      after = null,
      around = null,
      limit = this.config.pageSize,
      priority = 'normal'
    } = options
    
    if (this.isLoading) {
      return { messages: [], hasMore: { before: this.hasMoreBefore, after: this.hasMoreAfter } }
    }
    
    this.isLoading = true
    this.lastAccessTime = Date.now()
    
    try {
      // Check cache first
      const cachedResult = this.checkCache(options)
      if (cachedResult) {
        return cachedResult
      }
      
      // Build API parameters
      const params = { limit }
      if (before) params.before = before
      if (after) params.after = after
      if (around) params.around = around
      
      // Make API request
      const response = await this.apiService.get(
        `/api/channels/${this.channelId}/messages`,
        { params }
      )
      
      const { messages, has_more_before, has_more_after, total_count } = response
      
      // Update pagination state
      this.hasMoreBefore = has_more_before
      this.hasMoreAfter = has_more_after
      this.totalEstimatedCount = total_count || this.totalEstimatedCount
      
      // Process and store messages
      const processedMessages = this.processMessages(messages, options)
      this.updateLoadedRanges(options, messages.length)
      
      // Memory management
      this.performMemoryOptimization()
      
      return {
        messages: processedMessages,
        hasMore: {
          before: this.hasMoreBefore,
          after: this.hasMoreAfter
        },
        totalCount: this.totalEstimatedCount
      }
      
    } catch (error) {
      throw error
    } finally {
      this.isLoading = false
    }
  }

  processMessages(messages, options) {
    const processedMessages = []
    
    messages.forEach((message, index) => {
      // Optimize message data
      const optimizedMessage = this.optimizeMessage(message)
      
      // Store in memory
      this.messages.set(message.id, optimizedMessage)
      
      // Update message order
      this.updateMessageOrder(message.id, options)
      
      processedMessages.push(optimizedMessage)
    })
    
    return processedMessages
  }

  optimizeMessage(message) {
    // Remove unnecessary fields to save memory
    const optimized = {
      id: message.id,
      content: message.content,
      author: {
        id: message.author.id,
        username: message.author.username,
        avatar: message.author.avatar
      },
      timestamp: message.timestamp,
      edited_timestamp: message.edited_timestamp,
      attachments: message.attachments?.map(att => ({
        id: att.id,
        url: att.url,
        filename: att.filename,
        size: att.size,
        content_type: att.content_type
      })) || [],
      reactions: message.reactions || [],
      reply_to: message.reply_to,
      type: message.type || 'default'
    }
    
    // Add memory footprint estimate
    optimized._memorySize = this.estimateMessageMemorySize(optimized)
    
    return optimized
  }

  updateMessageOrder(messageId, options) {
    const existingIndex = this.messageOrder.indexOf(messageId)
    
    if (existingIndex !== -1) {
      // Message already exists, don't duplicate
      return
    }
    
    // Insert in chronological order
    if (options.before) {
      // Loading older messages - prepend
      this.messageOrder.unshift(messageId)
    } else if (options.after) {
      // Loading newer messages - append
      this.messageOrder.push(messageId)
    } else {
      // Default insertion - maintain chronological order
      const message = this.messages.get(messageId)
      const insertIndex = this.findInsertIndex(message.timestamp)
      this.messageOrder.splice(insertIndex, 0, messageId)
    }
  }

  findInsertIndex(timestamp) {
    // Binary search for correct insertion position
    let left = 0
    let right = this.messageOrder.length
    
    while (left < right) {
      const mid = Math.floor((left + right) / 2)
      const midMessage = this.messages.get(this.messageOrder[mid])
      
      if (midMessage && midMessage.timestamp < timestamp) {
        left = mid + 1
      } else {
        right = mid
      }
    }
    
    return left
  }

  getMessagesInRange(startIndex, endIndex) {
    const rangeMessageIds = this.messageOrder.slice(startIndex, endIndex + 1)
    const messages = rangeMessageIds
      .map(id => this.messages.get(id))
      .filter(Boolean)
    
    this.virtualWindow = { start: startIndex, end: endIndex }
    this.lastAccessTime = Date.now()
    
    return messages
  }

  async preloadMessages(currentIndex, direction) {
    const threshold = this.config.preloadThreshold
    const windowSize = this.config.virtualWindowSize
    
    let shouldPreload = false
    
    if (direction === 'up' && currentIndex < windowSize * threshold && this.hasMoreBefore) {
      shouldPreload = true
    } else if (direction === 'down') {
      const remainingMessages = this.messageOrder.length - currentIndex
      if (remainingMessages < windowSize * threshold && this.hasMoreAfter) {
        shouldPreload = true
      }
    }
    
    if (shouldPreload && !this.isLoading) {
      const options = direction === 'up' 
        ? { before: this.messageOrder[0], limit: this.config.pageSize }
        : { after: this.messageOrder[this.messageOrder.length - 1], limit: this.config.pageSize }
      
      await this.loadMessages(options)
    }
  }

  addMessage(message) {
    const optimized = this.optimizeMessage(message)
    this.messages.set(message.id, optimized)
    
    // Insert at correct position
    const insertIndex = this.findInsertIndex(message.timestamp)
    this.messageOrder.splice(insertIndex, 0, message.id)
    
    this.lastAccessTime = Date.now()
    
    // Trigger memory optimization if needed
    if (this.messages.size > this.config.maxMessagesInMemory) {
      this.performMemoryOptimization()
    }
  }

  updateMessage(messageId, updates) {
    const existingMessage = this.messages.get(messageId)
    if (existingMessage) {
      const updatedMessage = { ...existingMessage, ...updates }
      updatedMessage._memorySize = this.estimateMessageMemorySize(updatedMessage)
      this.messages.set(messageId, updatedMessage)
      this.lastAccessTime = Date.now()
    }
  }

  removeMessage(messageId) {
    this.messages.delete(messageId)
    const orderIndex = this.messageOrder.indexOf(messageId)
    if (orderIndex !== -1) {
      this.messageOrder.splice(orderIndex, 1)
    }
    this.lastAccessTime = Date.now()
  }

  performMemoryOptimization() {
    if (this.messages.size <= this.config.maxMessagesInMemory) {
      return 0
    }
    
    const currentWindow = this.virtualWindow
    const keepAroundWindow = Math.floor(this.config.virtualWindowSize / 2)
    
    // Calculate safe removal range
    const safeStart = Math.max(0, currentWindow.start - keepAroundWindow)
    const safeEnd = Math.min(this.messageOrder.length, currentWindow.end + keepAroundWindow)
    
    let removedCount = 0
    
    // Remove messages outside safe range
    for (let i = this.messageOrder.length - 1; i >= 0; i--) {
      if (this.messages.size <= this.config.maxMessagesInMemory) break
      
      if (i < safeStart || i > safeEnd) {
        const messageId = this.messageOrder[i]
        this.messages.delete(messageId)
        removedCount++
      }
    }
    
    return removedCount
  }

  performCleanup() {
    const now = Date.now()
    const isStale = (now - this.lastAccessTime) > this.config.cacheTimeout
    
    if (isStale) {
      // Clear old messages more aggressively
      const keepCount = Math.floor(this.config.maxMessagesInMemory * 0.3)
      const toRemove = this.messageOrder.length - keepCount
      
      if (toRemove > 0) {
        // Keep messages around current window
        const currentWindow = this.virtualWindow
        const keepStart = Math.max(0, currentWindow.start - Math.floor(keepCount / 2))
        const keepEnd = Math.min(this.messageOrder.length, keepStart + keepCount)
        
        const idsToKeep = new Set(this.messageOrder.slice(keepStart, keepEnd))
        
        let removedCount = 0
        for (const [messageId] of this.messages) {
          if (!idsToKeep.has(messageId)) {
            this.messages.delete(messageId)
            removedCount++
          }
        }
        
        // Update message order
        this.messageOrder = this.messageOrder.filter(id => idsToKeep.has(id))
        
        return removedCount
      }
    }
    
    return 0
  }

  checkCache(options) {
    // Simple cache check for exact matches
    // In a production system, this would be more sophisticated
    return null
  }

  updateLoadedRanges(options, messageCount) {
    const now = Date.now()
    
    // Clean old ranges
    this.loadedRanges = this.loadedRanges.filter(
      range => (now - range.timestamp) < this.config.cacheTimeout
    )
    
    // Add new range
    this.loadedRanges.push({
      options: { ...options },
      messageCount,
      timestamp: now
    })
  }

  estimateMessageMemorySize(message) {
    // Rough estimation of message memory footprint
    let size = 0
    size += (message.content?.length || 0) * 2 // Unicode characters
    size += 200 // Base object overhead
    size += (message.attachments?.length || 0) * 100 // Attachment metadata
    size += (message.reactions?.length || 0) * 50 // Reactions
    
    return size
  }

  getLoadedMessageCount() {
    return this.messages.size
  }

  estimateMemoryUsage() {
    return Array.from(this.messages.values())
      .reduce((total, msg) => total + (msg._memorySize || 0), 0)
  }

  isUnused() {
    const now = Date.now()
    const unusedThreshold = this.config.cacheTimeout * 2
    
    return (now - this.lastAccessTime) > unusedThreshold && this.messages.size === 0
  }
}

export default MessagePaginationService