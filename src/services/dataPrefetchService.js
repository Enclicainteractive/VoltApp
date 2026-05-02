// Client-side Data Prefetching Service for VoltChat
// Intelligently preloads data based on user behavior patterns

class DataPrefetchService {
  constructor(apiService) {
    this.apiService = apiService
    this.prefetchCache = new Map()
    this.userBehaviorData = new Map()
    this.prefetchQueue = []
    this.isProcessing = false
    this.maxCacheSize = 100
    this.maxCacheAge = 10 * 60 * 1000 // 10 minutes
    
    // Prediction models
    this.navigationPatterns = new Map()
    this.interactionHistory = []
    this.prefetchStrategies = new Map()
    
    // Performance tracking
    this.metrics = {
      prefetched: 0,
      cacheHits: 0,
      cacheMisses: 0,
      predictionAccuracy: 0,
      bytesPreloaded: 0,
      timeSaved: 0
    }
    
    // Prefetch configurations
    this.config = {
      maxConcurrentPrefetch: 3,
      prefetchDelay: 100,
      priorityWeights: {
        high: 0.9,
        medium: 0.6,
        low: 0.3
      },
      predictionThreshold: 0.7
    }
    
    this.initialize()
  }

  initialize() {
    this.loadUserBehaviorData()
    this.setupBehaviorTracking()
    this.startCleanupInterval()
    console.log('[Prefetch] Data prefetching service initialized')
  }

  loadUserBehaviorData() {
    try {
      const stored = localStorage.getItem('voltchat_user_behavior')
      if (stored) {
        const data = JSON.parse(stored)
        this.navigationPatterns = new Map(data.navigationPatterns || [])
        this.interactionHistory = data.interactionHistory || []
      }
    } catch (error) {
      console.warn('[Prefetch] Failed to load user behavior data:', error)
    }
  }

  saveUserBehaviorData() {
    try {
      const data = {
        navigationPatterns: Array.from(this.navigationPatterns.entries()),
        interactionHistory: this.interactionHistory.slice(-1000) // Keep last 1000 interactions
      }
      localStorage.setItem('voltchat_user_behavior', JSON.stringify(data))
    } catch (error) {
      console.warn('[Prefetch] Failed to save user behavior data:', error)
    }
  }

  setupBehaviorTracking() {
    // Track page navigation
    this.trackNavigation()
    
    // Track user interactions
    this.trackInteractions()
    
    // Track hover events for predictive prefetching
    this.trackHoverEvents()
    
    // Track scroll patterns
    this.trackScrollPatterns()
  }

  trackNavigation() {
    let previousPath = window.location.pathname
    
    const trackPathChange = () => {
      const currentPath = window.location.pathname
      if (currentPath !== previousPath) {
        this.recordNavigation(previousPath, currentPath)
        this.prefetchForPath(currentPath)
        previousPath = currentPath
      }
    }
    
    // Listen to history changes
    window.addEventListener('popstate', trackPathChange)
    
    // Override pushState and replaceState
    const originalPushState = history.pushState
    const originalReplaceState = history.replaceState
    
    history.pushState = function(...args) {
      originalPushState.apply(history, args)
      setTimeout(trackPathChange, 0)
    }
    
    history.replaceState = function(...args) {
      originalReplaceState.apply(history, args)
      setTimeout(trackPathChange, 0)
    }
  }

  trackInteractions() {
    const trackInteraction = (event) => {
      const interaction = {
        type: event.type,
        target: this.getElementIdentifier(event.target),
        timestamp: Date.now(),
        path: window.location.pathname
      }
      
      this.recordInteraction(interaction)
    }
    
    // Track clicks
    document.addEventListener('click', trackInteraction, true)
    
    // Track focus events
    document.addEventListener('focusin', trackInteraction, true)
    
    // Track form submissions
    document.addEventListener('submit', trackInteraction, true)
  }

  trackHoverEvents() {
    let hoverTimer = null
    
    document.addEventListener('mouseover', (event) => {
      const link = event.target.closest('a, [data-prefetch]')
      if (!link) return
      
      clearTimeout(hoverTimer)
      hoverTimer = setTimeout(() => {
        this.prefetchOnHover(link)
      }, 150) // Delay to avoid excessive prefetching
    })
    
    document.addEventListener('mouseout', () => {
      clearTimeout(hoverTimer)
    })
  }

  trackScrollPatterns() {
    let scrollTimeout = null
    
    document.addEventListener('scroll', () => {
      clearTimeout(scrollTimeout)
      scrollTimeout = setTimeout(() => {
        this.prefetchOnScroll()
      }, 200)
    }, { passive: true })
  }

  recordNavigation(fromPath, toPath) {
    const pattern = `${fromPath}->${toPath}`
    const current = this.navigationPatterns.get(pattern) || { count: 0, lastUsed: 0 }
    
    this.navigationPatterns.set(pattern, {
      count: current.count + 1,
      lastUsed: Date.now()
    })
    
    this.saveUserBehaviorData()
  }

  recordInteraction(interaction) {
    this.interactionHistory.push(interaction)
    
    // Keep only recent interactions
    if (this.interactionHistory.length > 1000) {
      this.interactionHistory = this.interactionHistory.slice(-1000)
    }
  }

  getElementIdentifier(element) {
    if (element.id) return `#${element.id}`
    if (element.className) return `.${element.className.split(' ')[0]}`
    if (element.tagName) return element.tagName.toLowerCase()
    return 'unknown'
  }

  // Main prefetch method
  async prefetchData(endpoint, options = {}) {
    const cacheKey = this.generateCacheKey(endpoint, options)
    
    // Check if already cached
    if (this.prefetchCache.has(cacheKey)) {
      const cached = this.prefetchCache.get(cacheKey)
      if (Date.now() - cached.timestamp < this.maxCacheAge) {
        this.metrics.cacheHits++
        return cached.data
      } else {
        this.prefetchCache.delete(cacheKey)
      }
    }
    
    // Add to prefetch queue
    return this.queuePrefetch({
      endpoint,
      options,
      cacheKey,
      priority: options.priority || 'medium',
      timestamp: Date.now()
    })
  }

  queuePrefetch(prefetchItem) {
    return new Promise((resolve, reject) => {
      prefetchItem.resolve = resolve
      prefetchItem.reject = reject
      
      // Insert based on priority
      const priorityValue = this.config.priorityWeights[prefetchItem.priority] || 0.5
      const insertIndex = this.prefetchQueue.findIndex(
        item => (this.config.priorityWeights[item.priority] || 0.5) < priorityValue
      )
      
      if (insertIndex === -1) {
        this.prefetchQueue.push(prefetchItem)
      } else {
        this.prefetchQueue.splice(insertIndex, 0, prefetchItem)
      }
      
      this.processPrefetchQueue()
    })
  }

  async processPrefetchQueue() {
    if (this.isProcessing || this.prefetchQueue.length === 0) {
      return
    }
    
    this.isProcessing = true
    
    const concurrentTasks = []
    
    while (
      this.prefetchQueue.length > 0 && 
      concurrentTasks.length < this.config.maxConcurrentPrefetch
    ) {
      const item = this.prefetchQueue.shift()
      concurrentTasks.push(this.executePrefetch(item))
    }
    
    if (concurrentTasks.length > 0) {
      await Promise.allSettled(concurrentTasks)
    }
    
    this.isProcessing = false
    
    // Continue processing if more items in queue
    if (this.prefetchQueue.length > 0) {
      setTimeout(() => this.processPrefetchQueue(), this.config.prefetchDelay)
    }
  }

  async executePrefetch(item) {
    const startTime = performance.now()
    
    try {
      const data = await this.apiService.get(item.endpoint, item.options)
      
      // Cache the result
      this.prefetchCache.set(item.cacheKey, {
        data,
        timestamp: Date.now(),
        endpoint: item.endpoint,
        size: this.estimateDataSize(data)
      })
      
      // Update metrics
      const loadTime = performance.now() - startTime
      this.updateMetrics(data, loadTime)
      
      // Manage cache size
      this.manageCacheSize()
      
      item.resolve(data)
      
      console.log(`[Prefetch] Successfully prefetched: ${item.endpoint} (${loadTime.toFixed(2)}ms)`)
      
    } catch (error) {
      console.warn(`[Prefetch] Failed to prefetch: ${item.endpoint}`, error)
      item.reject(error)
    }
  }

  // Prefetch strategies based on context
  async prefetchForPath(path) {
    const predictions = this.predictNextActions(path)
    
    for (const prediction of predictions) {
      if (prediction.confidence > this.config.predictionThreshold) {
        await this.prefetchData(prediction.endpoint, {
          priority: this.confidenceToPriority(prediction.confidence)
        })
      }
    }
  }

  predictNextActions(currentPath) {
    const predictions = []
    
    // Analyze navigation patterns
    const pathPredictions = this.analyzeNavigationPatterns(currentPath)
    predictions.push(...pathPredictions)
    
    // Analyze interaction patterns
    const interactionPredictions = this.analyzeInteractionPatterns(currentPath)
    predictions.push(...interactionPredictions)
    
    // Add context-specific predictions
    const contextPredictions = this.getContextualPredictions(currentPath)
    predictions.push(...contextPredictions)
    
    return predictions.sort((a, b) => b.confidence - a.confidence)
  }

  analyzeNavigationPatterns(currentPath) {
    const predictions = []
    
    for (const [pattern, data] of this.navigationPatterns.entries()) {
      const [fromPath, toPath] = pattern.split('->')
      
      if (fromPath === currentPath) {
        const confidence = Math.min(data.count / 10, 0.9) // Max 90% confidence
        predictions.push({
          endpoint: this.pathToEndpoint(toPath),
          confidence,
          reason: 'navigation_pattern'
        })
      }
    }
    
    return predictions
  }

  analyzeInteractionPatterns(currentPath) {
    const predictions = []
    const recentInteractions = this.interactionHistory
      .filter(i => i.path === currentPath && Date.now() - i.timestamp < 5 * 60 * 1000)
    
    // Group by interaction target
    const targetCounts = {}
    recentInteractions.forEach(interaction => {
      targetCounts[interaction.target] = (targetCounts[interaction.target] || 0) + 1
    })
    
    // Generate predictions based on common interaction patterns
    for (const [target, count] of Object.entries(targetCounts)) {
      const endpoint = this.targetToEndpoint(target, currentPath)
      if (endpoint) {
        predictions.push({
          endpoint,
          confidence: Math.min(count / 5, 0.8),
          reason: 'interaction_pattern'
        })
      }
    }
    
    return predictions
  }

  getContextualPredictions(currentPath) {
    const predictions = []
    
    // Chat page predictions
    if (currentPath.includes('/chat/')) {
      const channelId = currentPath.split('/').pop()
      
      predictions.push(
        {
          endpoint: `/api/channels/${channelId}/members`,
          confidence: 0.8,
          reason: 'contextual_chat'
        },
        {
          endpoint: `/api/channels/${channelId}/messages?limit=50&offset=50`,
          confidence: 0.6,
          reason: 'contextual_chat_history'
        }
      )
    }
    
    // Server page predictions
    if (currentPath.includes('/servers/')) {
      const serverId = currentPath.split('/')[2]
      
      predictions.push(
        {
          endpoint: `/api/servers/${serverId}/channels`,
          confidence: 0.9,
          reason: 'contextual_server'
        },
        {
          endpoint: `/api/servers/${serverId}/members`,
          confidence: 0.7,
          reason: 'contextual_server'
        }
      )
    }
    
    // Settings page predictions
    if (currentPath.includes('/settings')) {
      predictions.push(
        {
          endpoint: '/api/user/preferences',
          confidence: 0.9,
          reason: 'contextual_settings'
        },
        {
          endpoint: '/api/user/sessions',
          confidence: 0.6,
          reason: 'contextual_settings'
        }
      )
    }
    
    return predictions
  }

  pathToEndpoint(path) {
    const pathMappings = {
      '/': '/api/servers',
      '/servers': '/api/servers',
      '/settings': '/api/user/preferences',
      '/profile': '/api/user/profile'
    }
    
    return pathMappings[path] || null
  }

  targetToEndpoint(target, currentPath) {
    // Map UI elements to API endpoints
    const targetMappings = {
      '.channel-item': (path) => {
        const serverId = path.split('/')[2]
        return serverId ? `/api/servers/${serverId}/channels` : null
      },
      '.user-avatar': '/api/user/profile',
      '.message-item': (path) => {
        const channelId = path.split('/').pop()
        return channelId ? `/api/channels/${channelId}/messages` : null
      }
    }
    
    const mapping = targetMappings[target]
    return typeof mapping === 'function' ? mapping(currentPath) : mapping
  }

  confidenceToPriority(confidence) {
    if (confidence >= 0.8) return 'high'
    if (confidence >= 0.5) return 'medium'
    return 'low'
  }

  // Event-based prefetching
  async prefetchOnHover(element) {
    const href = element.href || element.dataset.prefetch
    if (!href) return
    
    const endpoint = this.urlToEndpoint(href)
    if (endpoint) {
      await this.prefetchData(endpoint, { priority: 'medium' })
    }
  }

  async prefetchOnScroll() {
    const scrollPosition = window.scrollY + window.innerHeight
    const documentHeight = document.documentElement.scrollHeight
    const scrollPercentage = scrollPosition / documentHeight
    
    // Prefetch more content when user scrolls past 70%
    if (scrollPercentage > 0.7) {
      const currentPath = window.location.pathname
      
      if (currentPath.includes('/chat/')) {
        const channelId = currentPath.split('/').pop()
        await this.prefetchData(
          `/api/channels/${channelId}/messages?limit=50&offset=${this.getMessageOffset()}`,
          { priority: 'low' }
        )
      }
    }
  }

  urlToEndpoint(url) {
    try {
      const urlObj = new URL(url, window.location.origin)
      const path = urlObj.pathname
      
      // Convert frontend routes to API endpoints
      if (path.startsWith('/chat/')) {
        const channelId = path.split('/')[2]
        return `/api/channels/${channelId}/messages`
      }
      
      if (path.startsWith('/servers/')) {
        const serverId = path.split('/')[2]
        return `/api/servers/${serverId}/channels`
      }
      
      return this.pathToEndpoint(path)
    } catch {
      return null
    }
  }

  getMessageOffset() {
    // Calculate current message offset based on loaded messages
    const messageElements = document.querySelectorAll('.message-item')
    return messageElements.length
  }

  // Cache management
  generateCacheKey(endpoint, options) {
    const optionsStr = JSON.stringify(options || {})
    return `${endpoint}:${btoa(optionsStr)}`
  }

  manageCacheSize() {
    if (this.prefetchCache.size <= this.maxCacheSize) return
    
    // Remove oldest entries
    const entries = Array.from(this.prefetchCache.entries())
    entries.sort(([, a], [, b]) => a.timestamp - b.timestamp)
    
    const toRemove = entries.slice(0, entries.length - this.maxCacheSize)
    toRemove.forEach(([key]) => this.prefetchCache.delete(key))
  }

  startCleanupInterval() {
    setInterval(() => {
      this.cleanupExpiredCache()
      this.saveUserBehaviorData()
    }, 5 * 60 * 1000) // Every 5 minutes
  }

  cleanupExpiredCache() {
    const now = Date.now()
    
    for (const [key, value] of this.prefetchCache.entries()) {
      if (now - value.timestamp > this.maxCacheAge) {
        this.prefetchCache.delete(key)
      }
    }
  }

  // Public API methods
  getCachedData(endpoint, options = {}) {
    const cacheKey = this.generateCacheKey(endpoint, options)
    const cached = this.prefetchCache.get(cacheKey)
    
    if (cached && Date.now() - cached.timestamp < this.maxCacheAge) {
      this.metrics.cacheHits++
      return cached.data
    }
    
    this.metrics.cacheMisses++
    return null
  }

  invalidateCache(pattern) {
    for (const [key, value] of this.prefetchCache.entries()) {
      if (value.endpoint.includes(pattern)) {
        this.prefetchCache.delete(key)
      }
    }
  }

  warmupCache(endpoints) {
    endpoints.forEach(endpoint => {
      this.prefetchData(endpoint, { priority: 'low' })
    })
  }

  updateMetrics(data, loadTime) {
    this.metrics.prefetched++
    this.metrics.bytesPreloaded += this.estimateDataSize(data)
    this.metrics.timeSaved += Math.max(0, 200 - loadTime) // Assume 200ms saved on average
  }

  estimateDataSize(data) {
    try {
      return new Blob([JSON.stringify(data)]).size
    } catch {
      return 1024 // Fallback estimate
    }
  }

  getMetrics() {
    const hitRate = this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses) || 0
    
    return {
      ...this.metrics,
      cacheHitRate: hitRate,
      cacheSize: this.prefetchCache.size,
      queueLength: this.prefetchQueue.length,
      navigationPatterns: this.navigationPatterns.size,
      behaviorDataSize: this.interactionHistory.length
    }
  }

  // Cleanup
  destroy() {
    this.prefetchCache.clear()
    this.prefetchQueue = []
    this.saveUserBehaviorData()
  }
}

export default DataPrefetchService