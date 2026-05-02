// Avatar Lazy Loading Service for VoltChat
// Efficiently manages avatar loading with intelligent caching and optimization

class AvatarLazyLoadingService {
  constructor() {
    this.avatarCache = new Map() // userId -> cached avatar data
    this.loadingPromises = new Map() // userId -> loading promise
    this.intersectionObserver = null
    this.avatarQueue = new Map() // priority -> Set of avatar requests
    this.isProcessing = false
    
    // Configuration
    this.config = {
      enableLazyLoading: true,
      enablePreloading: true,
      enableCaching: true,
      intersectionThreshold: 0.1,
      rootMargin: '50px',
      maxCacheSize: 500,
      cacheTTL: 30 * 60 * 1000, // 30 minutes
      preloadDistance: 100, // pixels
      batchSize: 5,
      retryAttempts: 3,
      retryDelay: 1000,
      enableOptimization: true
    }
    
    // Avatar size configurations
    this.avatarSizes = {
      tiny: { width: 16, height: 16, quality: 70 },
      small: { width: 24, height: 24, quality: 75 },
      medium: { width: 40, height: 40, quality: 80 },
      large: { width: 64, height: 64, quality: 85 },
      xlarge: { width: 128, height: 128, quality: 90 }
    }
    
    // Priority levels for loading
    this.priorities = {
      critical: 0,   // Currently visible avatars
      high: 1,       // About to be visible
      medium: 2,     // Nearby avatars
      low: 3,        // Far away avatars
      preload: 4     // Predictive preload
    }
    
    // Performance tracking
    this.metrics = {
      avatarsLoaded: 0,
      cacheHits: 0,
      cacheMisses: 0,
      preloadHits: 0,
      totalLoadTime: 0,
      averageLoadTime: 0,
      bytesTransferred: 0,
      optimizationsSaved: 0
    }
    
    // Default avatar fallbacks
    this.defaultAvatars = new Map()
    this.placeholders = new Map()
    
    this.initialize()
  }

  async initialize() {
    // Setup intersection observer
    this.setupIntersectionObserver()
    
    // Generate default avatars and placeholders
    await this.generateDefaultAvatars()
    
    // Setup preloading strategies
    this.setupPreloadingStrategies()
    
    // Setup cache management
    this.setupCacheManagement()
    
    // Setup performance monitoring
    this.setupPerformanceMonitoring()
    
    console.log('[AvatarLazyLoading] Avatar lazy loading service initialized')
  }

  setupIntersectionObserver() {
    if (!('IntersectionObserver' in window)) {
      console.warn('[AvatarLazyLoading] IntersectionObserver not supported, falling back to immediate loading')
      this.config.enableLazyLoading = false
      return
    }
    
    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        this.handleIntersection(entries)
      },
      {
        threshold: this.config.intersectionThreshold,
        rootMargin: this.config.rootMargin
      }
    )
  }

  handleIntersection(entries) {
    const criticalAvatars = []
    const highPriorityAvatars = []
    
    entries.forEach(entry => {
      const element = entry.target
      const userId = element.dataset.userId
      const size = element.dataset.avatarSize || 'medium'
      
      if (entry.isIntersecting) {
        // Avatar is visible
        criticalAvatars.push({ userId, size, element })
        
        // Preload nearby avatars
        this.preloadNearbyAvatars(element)
      } else {
        // Avatar is near viewport
        const ratio = entry.intersectionRatio
        if (ratio > 0.05) { // Close to viewport
          highPriorityAvatars.push({ userId, size, element })
        }
      }
    })
    
    // Process critical avatars immediately
    if (criticalAvatars.length > 0) {
      this.queueAvatarLoads(criticalAvatars, 'critical')
    }
    
    // Queue high priority avatars
    if (highPriorityAvatars.length > 0) {
      this.queueAvatarLoads(highPriorityAvatars, 'high')
    }
  }

  async generateDefaultAvatars() {
    // Generate default avatar patterns for fallbacks
    const patterns = [
      { background: '#3B82F6', color: '#FFFFFF' },
      { background: '#10B981', color: '#FFFFFF' },
      { background: '#F59E0B', color: '#FFFFFF' },
      { background: '#EF4444', color: '#FFFFFF' },
      { background: '#8B5CF6', color: '#FFFFFF' },
      { background: '#06B6D4', color: '#FFFFFF' }
    ]
    
    for (const [index, pattern] of patterns.entries()) {
      const avatar = await this.generateDefaultAvatar(pattern, 'medium')
      this.defaultAvatars.set(index, avatar)
    }
    
    // Generate loading placeholders
    for (const [size, config] of Object.entries(this.avatarSizes)) {
      const placeholder = await this.generatePlaceholder(config)
      this.placeholders.set(size, placeholder)
    }
  }

  async generateDefaultAvatar(pattern, size) {
    const config = this.avatarSizes[size]
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    
    canvas.width = config.width
    canvas.height = config.height
    
    // Draw background
    ctx.fillStyle = pattern.background
    ctx.fillRect(0, 0, config.width, config.height)
    
    // Draw circle
    ctx.beginPath()
    ctx.arc(config.width / 2, config.height / 2, config.width / 2, 0, 2 * Math.PI)
    ctx.fillStyle = pattern.background
    ctx.fill()
    
    return canvas.toDataURL('image/webp', config.quality / 100)
  }

  async generatePlaceholder(config) {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    
    canvas.width = config.width
    canvas.height = config.height
    
    // Animated gradient placeholder
    const gradient = ctx.createLinearGradient(0, 0, config.width, 0)
    gradient.addColorStop(0, '#f0f0f0')
    gradient.addColorStop(0.5, '#e0e0e0')
    gradient.addColorStop(1, '#f0f0f0')
    
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, config.width, config.height)
    
    return canvas.toDataURL('image/webp', 0.8)
  }

  // Main avatar loading method
  async loadAvatar(userId, size = 'medium', options = {}) {
    const {
      priority = 'medium',
      skipCache = false,
      placeholder = true,
      optimization = this.config.enableOptimization
    } = options
    
    const startTime = performance.now()
    
    try {
      // Check cache first
      if (!skipCache) {
        const cached = this.getCachedAvatar(userId, size)
        if (cached) {
          this.metrics.cacheHits++
          return cached
        }
      }
      
      this.metrics.cacheMisses++
      
      // Check if already loading
      const loadingKey = `${userId}-${size}`
      if (this.loadingPromises.has(loadingKey)) {
        return this.loadingPromises.get(loadingKey)
      }
      
      // Start loading
      const loadPromise = this.fetchAvatar(userId, size, optimization)
      this.loadingPromises.set(loadingKey, loadPromise)
      
      try {
        const avatar = await loadPromise
        
        // Cache the result
        this.cacheAvatar(userId, size, avatar)
        
        // Update metrics
        const loadTime = performance.now() - startTime
        this.updateMetrics(avatar, loadTime)
        
        return avatar
      } finally {
        this.loadingPromises.delete(loadingKey)
      }
      
    } catch (error) {
      console.warn(`[AvatarLazyLoading] Failed to load avatar for user ${userId}:`, error)
      
      // Return fallback avatar
      return this.getFallbackAvatar(userId, size)
    }
  }

  async fetchAvatar(userId, size, optimization = true) {
    const sizeConfig = this.avatarSizes[size]
    let url = `/api/users/${userId}/avatar`
    
    if (optimization) {
      // Add optimization parameters
      const params = new URLSearchParams({
        width: sizeConfig.width.toString(),
        height: sizeConfig.height.toString(),
        quality: sizeConfig.quality.toString(),
        format: 'webp'
      })
      url += `?${params.toString()}`
    }
    
    const response = await fetch(url, {
      cache: 'force-cache'
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    
    const blob = await response.blob()
    const dataUrl = await this.blobToDataUrl(blob)
    
    this.metrics.bytesTransferred += blob.size
    
    return {
      dataUrl,
      size: blob.size,
      format: blob.type,
      userId,
      avatarSize: size,
      timestamp: Date.now()
    }
  }

  blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  }

  // Cache management
  getCachedAvatar(userId, size) {
    const cacheKey = `${userId}-${size}`
    const cached = this.avatarCache.get(cacheKey)
    
    if (!cached) return null
    
    // Check if cache is still valid
    const now = Date.now()
    if (now - cached.timestamp > this.config.cacheTTL) {
      this.avatarCache.delete(cacheKey)
      return null
    }
    
    return cached
  }

  cacheAvatar(userId, size, avatar) {
    const cacheKey = `${userId}-${size}`
    
    // Manage cache size
    if (this.avatarCache.size >= this.config.maxCacheSize) {
      this.evictLRUCacheEntries()
    }
    
    avatar.lastAccessed = Date.now()
    this.avatarCache.set(cacheKey, avatar)
  }

  evictLRUCacheEntries() {
    // Remove least recently used entries
    const entries = Array.from(this.avatarCache.entries())
    entries.sort(([, a], [, b]) => (a.lastAccessed || 0) - (b.lastAccessed || 0))
    
    const toRemove = Math.ceil(this.config.maxCacheSize * 0.2) // Remove 20%
    for (let i = 0; i < toRemove; i++) {
      this.avatarCache.delete(entries[i][0])
    }
  }

  getFallbackAvatar(userId, size) {
    // Generate deterministic fallback based on userId
    const hash = this.hashUserId(userId)
    const patternIndex = hash % this.defaultAvatars.size
    
    return {
      dataUrl: this.defaultAvatars.get(patternIndex),
      size: 0,
      format: 'image/webp',
      userId,
      avatarSize: size,
      timestamp: Date.now(),
      fallback: true
    }
  }

  hashUserId(userId) {
    let hash = 0
    for (let i = 0; i < userId.length; i++) {
      hash = ((hash << 5) - hash + userId.charCodeAt(i)) & 0xffffffff
    }
    return Math.abs(hash)
  }

  // Queue-based loading system
  queueAvatarLoads(avatars, priority) {
    if (!this.avatarQueue.has(priority)) {
      this.avatarQueue.set(priority, new Set())
    }
    
    const queue = this.avatarQueue.get(priority)
    avatars.forEach(avatar => queue.add(avatar))
    
    if (!this.isProcessing) {
      this.processAvatarQueue()
    }
  }

  async processAvatarQueue() {
    if (this.isProcessing) return
    
    this.isProcessing = true
    
    try {
      // Process queues in priority order
      const sortedPriorities = Array.from(this.avatarQueue.keys())
        .sort((a, b) => this.priorities[a] - this.priorities[b])
      
      for (const priority of sortedPriorities) {
        const queue = this.avatarQueue.get(priority)
        
        while (queue.size > 0) {
          // Process batch
          const batch = Array.from(queue).slice(0, this.config.batchSize)
          queue.clear()
          
          const loadPromises = batch.map(avatar => 
            this.loadAndUpdateElement(avatar)
          )
          
          await Promise.allSettled(loadPromises)
          
          // Small delay to prevent blocking
          await this.delay(10)
        }
        
        this.avatarQueue.delete(priority)
      }
    } finally {
      this.isProcessing = false
    }
  }

  async loadAndUpdateElement(avatarRequest) {
    const { userId, size, element } = avatarRequest
    
    try {
      // Show placeholder first
      this.setElementPlaceholder(element, size)
      
      // Load avatar
      const avatar = await this.loadAvatar(userId, size, { priority: 'critical' })
      
      // Update element
      this.updateAvatarElement(element, avatar)
      
      // Unobserve since it's now loaded
      this.intersectionObserver?.unobserve(element)
      
    } catch (error) {
      console.warn(`[AvatarLazyLoading] Failed to load avatar for element:`, error)
      this.setElementError(element)
    }
  }

  setElementPlaceholder(element, size) {
    const placeholder = this.placeholders.get(size)
    if (placeholder) {
      element.src = placeholder
      element.classList.add('avatar-loading')
    }
  }

  updateAvatarElement(element, avatar) {
    element.src = avatar.dataUrl
    element.classList.remove('avatar-loading')
    element.classList.add('avatar-loaded')
    
    if (avatar.fallback) {
      element.classList.add('avatar-fallback')
    }
  }

  setElementError(element) {
    element.classList.remove('avatar-loading')
    element.classList.add('avatar-error')
    
    // Set fallback
    const userId = element.dataset.userId
    const size = element.dataset.avatarSize || 'medium'
    const fallback = this.getFallbackAvatar(userId, size)
    element.src = fallback.dataUrl
  }

  // Preloading strategies
  setupPreloadingStrategies() {
    if (!this.config.enablePreloading) return
    
    // Preload when hovering over user mentions
    this.setupHoverPreloading()
    
    // Preload based on scroll direction
    this.setupScrollPreloading()
    
    // Preload frequently seen users
    this.setupFrequencyBasedPreloading()
  }

  setupHoverPreloading() {
    document.addEventListener('mouseover', (event) => {
      const userMention = event.target.closest('[data-user-id]')
      if (userMention) {
        const userId = userMention.dataset.userId
        if (userId) {
          this.preloadUserAvatar(userId, 'preload')
        }
      }
    })
  }

  setupScrollPreloading() {
    let lastScrollY = window.scrollY
    
    document.addEventListener('scroll', () => {
      const currentScrollY = window.scrollY
      const scrollDirection = currentScrollY > lastScrollY ? 'down' : 'up'
      
      this.preloadAvatarsInDirection(scrollDirection)
      
      lastScrollY = currentScrollY
    }, { passive: true })
  }

  setupFrequencyBasedPreloading() {
    // Track user appearance frequency
    this.userFrequency = new Map()
    
    setInterval(() => {
      this.preloadFrequentUsers()
    }, 30000) // Every 30 seconds
  }

  preloadNearbyAvatars(element) {
    const rect = element.getBoundingClientRect()
    const nearbyElements = this.findNearbyAvatars(rect, this.config.preloadDistance)
    
    nearbyElements.forEach(nearbyElement => {
      const userId = nearbyElement.dataset.userId
      const size = nearbyElement.dataset.avatarSize || 'medium'
      
      if (userId) {
        this.queueAvatarLoads([{ userId, size, element: nearbyElement }], 'medium')
      }
    })
  }

  findNearbyAvatars(rect, distance) {
    const avatarElements = document.querySelectorAll('[data-user-id]:not(.avatar-loaded)')
    const nearby = []
    
    avatarElements.forEach(element => {
      const elementRect = element.getBoundingClientRect()
      const elementDistance = Math.min(
        Math.abs(rect.top - elementRect.bottom),
        Math.abs(rect.bottom - elementRect.top)
      )
      
      if (elementDistance <= distance) {
        nearby.push(element)
      }
    })
    
    return nearby
  }

  preloadUserAvatar(userId, priority = 'medium') {
    const sizes = ['medium'] // Start with most common size
    
    sizes.forEach(size => {
      this.loadAvatar(userId, size, { priority })
        .then(() => {
          this.metrics.preloadHits++
        })
        .catch(() => {
          // Silent fail for preloading
        })
    })
  }

  preloadAvatarsInDirection(direction) {
    const viewport = window.innerHeight
    const scrollY = window.scrollY
    
    let targetArea
    if (direction === 'down') {
      targetArea = {
        top: scrollY + viewport,
        bottom: scrollY + viewport + 300 // 300px ahead
      }
    } else {
      targetArea = {
        top: scrollY - 300, // 300px behind
        bottom: scrollY
      }
    }
    
    const avatarsInArea = this.findAvatarsInArea(targetArea)
    this.queueAvatarLoads(avatarsInArea, 'low')
  }

  findAvatarsInArea(area) {
    const avatarElements = document.querySelectorAll('[data-user-id]:not(.avatar-loaded)')
    const inArea = []
    
    avatarElements.forEach(element => {
      const rect = element.getBoundingClientRect()
      const elementTop = rect.top + window.scrollY
      
      if (elementTop >= area.top && elementTop <= area.bottom) {
        inArea.push({
          userId: element.dataset.userId,
          size: element.dataset.avatarSize || 'medium',
          element
        })
      }
    })
    
    return inArea
  }

  preloadFrequentUsers() {
    // Get most frequently seen users
    const frequent = Array.from(this.userFrequency.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10) // Top 10
      .map(([userId]) => userId)
    
    frequent.forEach(userId => {
      this.preloadUserAvatar(userId, 'low')
    })
  }

  // Public API for components
  observeAvatar(element) {
    if (this.intersectionObserver && element.dataset.userId) {
      this.intersectionObserver.observe(element)
      
      // Track user frequency
      const userId = element.dataset.userId
      this.userFrequency.set(userId, (this.userFrequency.get(userId) || 0) + 1)
    }
  }

  unobserveAvatar(element) {
    if (this.intersectionObserver) {
      this.intersectionObserver.unobserve(element)
    }
  }

  preloadAvatarsForUsers(userIds, size = 'medium') {
    const avatars = userIds.map(userId => ({ userId, size }))
    this.queueAvatarLoads(avatars, 'medium')
  }

  // Utility methods
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  updateMetrics(avatar, loadTime) {
    this.metrics.avatarsLoaded++
    this.metrics.totalLoadTime += loadTime
    this.metrics.averageLoadTime = this.metrics.totalLoadTime / this.metrics.avatarsLoaded
    
    if (avatar.size < 1000) { // Less than 1KB, likely optimized
      this.metrics.optimizationsSaved++
    }
  }

  setupPerformanceMonitoring() {
    // Monitor avatar loading performance
    setInterval(() => {
      this.logPerformanceMetrics()
    }, 60000) // Every minute
  }

  setupCacheManagement() {
    // Cleanup cache periodically
    setInterval(() => {
      this.cleanupExpiredCache()
    }, 5 * 60 * 1000) // Every 5 minutes
  }

  cleanupExpiredCache() {
    const now = Date.now()
    let removedCount = 0
    
    for (const [key, avatar] of this.avatarCache.entries()) {
      if (now - avatar.timestamp > this.config.cacheTTL) {
        this.avatarCache.delete(key)
        removedCount++
      }
    }
    
    if (removedCount > 0) {
      console.log(`[AvatarLazyLoading] Cleaned up ${removedCount} expired cache entries`)
    }
  }

  logPerformanceMetrics() {
    if (this.metrics.avatarsLoaded > 0) {
      console.log('[AvatarLazyLoading] Performance metrics:', {
        loaded: this.metrics.avatarsLoaded,
        cacheHitRate: ((this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses)) * 100).toFixed(1) + '%',
        averageLoadTime: this.metrics.averageLoadTime.toFixed(2) + 'ms',
        bytesTransferred: (this.metrics.bytesTransferred / 1024).toFixed(1) + 'KB',
        cacheSize: this.avatarCache.size
      })
    }
  }

  // Public API
  getMetrics() {
    const hitRate = this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses) * 100
    
    return {
      ...this.metrics,
      cacheHitRate: hitRate.toFixed(1),
      cacheSize: this.avatarCache.size,
      queueSize: Array.from(this.avatarQueue.values()).reduce((sum, queue) => sum + queue.size, 0)
    }
  }

  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig }
  }

  clearCache() {
    this.avatarCache.clear()
    this.userFrequency.clear()
  }

  // Cleanup
  destroy() {
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect()
    }
    
    this.avatarCache.clear()
    this.loadingPromises.clear()
    this.avatarQueue.clear()
  }
}

export default AvatarLazyLoadingService