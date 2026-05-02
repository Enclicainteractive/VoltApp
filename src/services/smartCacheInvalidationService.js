// Smart Cache Invalidation Service for VoltChat
// Intelligently manages cache invalidation based on dependencies and data changes

class SmartCacheInvalidationService {
  constructor() {
    this.cacheStore = new Map() // cache key -> cache entry
    this.dependencyGraph = new Map() // dependency -> Set of dependent cache keys
    this.taggedCaches = new Map() // tag -> Set of cache keys
    this.subscriptions = new Map() // event -> Set of handlers
    this.invalidationQueue = []
    this.isProcessing = false
    
    // Configuration
    this.config = {
      enableSmartInvalidation: true,
      enableDependencyTracking: true,
      enableTagBasedInvalidation: true,
      batchInvalidation: true,
      invalidationDelay: 50, // ms
      maxQueueSize: 1000,
      enableMetrics: true,
      debugMode: false
    }
    
    // Cache entry structure
    this.cacheEntryTemplate = {
      key: '',
      value: null,
      timestamp: 0,
      ttl: 0,
      dependencies: new Set(),
      tags: new Set(),
      accessCount: 0,
      lastAccess: 0,
      size: 0,
      metadata: {}
    }
    
    // Performance metrics
    this.metrics = {
      totalCacheEntries: 0,
      invalidationsTriggered: 0,
      dependencyInvalidations: 0,
      tagInvalidations: 0,
      manualInvalidations: 0,
      batchInvalidations: 0,
      averageInvalidationTime: 0,
      totalInvalidationTime: 0,
      cacheHitRate: 0,
      cacheMissRate: 0,
      totalRequests: 0
    }
    
    // Invalidation strategies
    this.invalidationStrategies = new Map([
      ['immediate', this.immediateInvalidation.bind(this)],
      ['batched', this.batchedInvalidation.bind(this)],
      ['lazy', this.lazyInvalidation.bind(this)],
      ['smart', this.smartInvalidation.bind(this)]
    ])
    
    // Common cache patterns and their invalidation rules
    this.cachePatterns = new Map([
      ['user-profile', {
        dependencies: ['user:*', 'auth:*'],
        tags: ['user-data', 'profile'],
        ttl: 300000, // 5 minutes
        invalidateOn: ['user.update', 'user.delete', 'auth.logout']
      }],
      ['channel-messages', {
        dependencies: ['channel:*', 'message:*'],
        tags: ['messages', 'channel-data'],
        ttl: 60000, // 1 minute
        invalidateOn: ['message.create', 'message.update', 'message.delete', 'channel.update']
      }],
      ['server-data', {
        dependencies: ['server:*', 'user:*'],
        tags: ['server-data', 'user-permissions'],
        ttl: 600000, // 10 minutes
        invalidateOn: ['server.update', 'user.join', 'user.leave', 'permission.change']
      }]
    ])
    
    this.initialize()
  }

  initialize() {
    // Setup event listeners for automatic invalidation
    this.setupEventListeners()
    
    // Setup periodic cleanup
    this.setupPeriodicCleanup()
    
    // Setup dependency change detection
    this.setupDependencyTracking()
    
    // Setup performance monitoring
    this.setupPerformanceMonitoring()
    
    console.log('[SmartCache] Smart cache invalidation service initialized')
  }

  setupEventListeners() {
    // Listen for data change events
    window.addEventListener('dataChange', (event) => {
      this.handleDataChange(event.detail)
    })
    
    // Listen for user actions that might affect cache
    window.addEventListener('userAction', (event) => {
      this.handleUserAction(event.detail)
    })
    
    // Listen for WebSocket messages for real-time invalidation
    window.addEventListener('websocketMessage', (event) => {
      this.handleWebSocketMessage(event.detail)
    })
  }

  setupPeriodicCleanup() {
    // Clean expired entries every 5 minutes
    setInterval(() => {
      this.cleanupExpiredEntries()
    }, 5 * 60 * 1000)
    
    // Analyze cache patterns every 30 minutes
    setInterval(() => {
      this.analyzeCachePatterns()
    }, 30 * 60 * 1000)
  }

  setupDependencyTracking() {
    if (!this.config.enableDependencyTracking) return
    
    // Track resource access patterns
    this.resourceAccessTracker = new ResourceAccessTracker()
    this.resourceAccessTracker.onDependencyDetected((resource, dependency) => {
      this.addDependency(resource, dependency)
    })
  }

  setupPerformanceMonitoring() {
    if (!this.config.enableMetrics) return
    
    // Track cache performance
    setInterval(() => {
      this.updatePerformanceMetrics()
    }, 60000) // Every minute
  }

  // Main cache operations
  set(key, value, options = {}) {
    const {
      ttl = 300000, // 5 minutes default
      dependencies = [],
      tags = [],
      metadata = {},
      strategy = 'smart'
    } = options
    
    const entry = {
      ...this.cacheEntryTemplate,
      key,
      value,
      timestamp: Date.now(),
      ttl,
      dependencies: new Set(dependencies),
      tags: new Set(tags),
      metadata: { ...metadata },
      size: this.estimateSize(value)
    }
    
    // Store cache entry
    this.cacheStore.set(key, entry)
    
    // Update dependency graph
    this.updateDependencyGraph(key, dependencies)
    
    // Update tag mappings
    this.updateTagMappings(key, tags)
    
    // Apply cache pattern if recognized
    this.applyCachePattern(key, entry)
    
    this.metrics.totalCacheEntries++
    
    if (this.config.debugMode) {
      console.log(`[SmartCache] Set cache: ${key}`, {
        dependencies,
        tags,
        ttl,
        size: entry.size
      })
    }
  }

  get(key, options = {}) {
    const { updateAccess = true } = options
    
    const entry = this.cacheStore.get(key)
    
    if (!entry) {
      this.metrics.totalRequests++
      return null
    }
    
    // Check if expired
    if (this.isExpired(entry)) {
      this.invalidate(key)
      this.metrics.totalRequests++
      return null
    }
    
    // Update access tracking
    if (updateAccess) {
      entry.accessCount++
      entry.lastAccess = Date.now()
    }
    
    this.metrics.totalRequests++
    return entry.value
  }

  // Invalidation methods
  invalidate(key, options = {}) {
    const {
      strategy = 'smart',
      cascade = true,
      reason = 'manual',
      batch = this.config.batchInvalidation
    } = options
    
    if (batch) {
      this.queueInvalidation(key, options)
    } else {
      this.performInvalidation(key, options)
    }
  }

  queueInvalidation(key, options) {
    if (this.invalidationQueue.length >= this.config.maxQueueSize) {
      console.warn('[SmartCache] Invalidation queue full, processing immediately')
      this.processInvalidationQueue()
    }
    
    this.invalidationQueue.push({ key, options, timestamp: Date.now() })
    
    if (!this.isProcessing) {
      setTimeout(() => {
        this.processInvalidationQueue()
      }, this.config.invalidationDelay)
    }
  }

  async processInvalidationQueue() {
    if (this.isProcessing || this.invalidationQueue.length === 0) return
    
    this.isProcessing = true
    const startTime = performance.now()
    
    try {
      // Group invalidations by type for efficiency
      const groupedInvalidations = this.groupInvalidations(this.invalidationQueue)
      
      // Process each group
      for (const [type, invalidations] of groupedInvalidations) {
        await this.processBatchInvalidation(type, invalidations)
      }
      
      const processingTime = performance.now() - startTime
      this.updateInvalidationMetrics(this.invalidationQueue.length, processingTime)
      
      this.invalidationQueue = []
      
    } catch (error) {
      console.error('[SmartCache] Error processing invalidation queue:', error)
    } finally {
      this.isProcessing = false
    }
  }

  groupInvalidations(queue) {
    const groups = new Map()
    
    for (const item of queue) {
      const type = this.determineInvalidationType(item.key, item.options)
      
      if (!groups.has(type)) {
        groups.set(type, [])
      }
      
      groups.get(type).push(item)
    }
    
    return groups
  }

  determineInvalidationType(key, options) {
    if (options.reason === 'dependency') return 'dependency'
    if (options.reason === 'tag') return 'tag'
    if (options.reason === 'ttl') return 'ttl'
    return 'manual'
  }

  async processBatchInvalidation(type, invalidations) {
    const strategy = this.invalidationStrategies.get(type) || this.smartInvalidation
    
    for (const invalidation of invalidations) {
      await strategy(invalidation.key, invalidation.options)
    }
    
    this.metrics.batchInvalidations++
  }

  performInvalidation(key, options = {}) {
    const startTime = performance.now()
    
    try {
      const entry = this.cacheStore.get(key)
      if (!entry) return false
      
      // Remove from cache store
      this.cacheStore.delete(key)
      
      // Clean up dependency graph
      this.cleanupDependencies(key, entry.dependencies)
      
      // Clean up tag mappings
      this.cleanupTags(key, entry.tags)
      
      // Cascade invalidation if enabled
      if (options.cascade !== false) {
        this.cascadeInvalidation(key, options)
      }
      
      // Emit invalidation event
      this.emitInvalidationEvent(key, options.reason || 'manual', entry)
      
      const invalidationTime = performance.now() - startTime
      this.updateInvalidationMetrics(1, invalidationTime)
      
      if (this.config.debugMode) {
        console.log(`[SmartCache] Invalidated: ${key}`, options)
      }
      
      return true
      
    } catch (error) {
      console.error(`[SmartCache] Error invalidating ${key}:`, error)
      return false
    }
  }

  // Invalidation strategies
  immediateInvalidation(key, options) {
    return this.performInvalidation(key, options)
  }

  batchedInvalidation(key, options) {
    this.queueInvalidation(key, options)
  }

  lazyInvalidation(key, options) {
    // Mark as invalid but don't remove until next access
    const entry = this.cacheStore.get(key)
    if (entry) {
      entry.metadata.invalid = true
      entry.metadata.invalidatedAt = Date.now()
    }
  }

  smartInvalidation(key, options) {
    const entry = this.cacheStore.get(key)
    if (!entry) return
    
    // Choose strategy based on entry characteristics
    if (entry.accessCount > 100 && entry.size > 1024) {
      // High-value cache - use lazy invalidation
      return this.lazyInvalidation(key, options)
    } else if (this.invalidationQueue.length > 10) {
      // High invalidation load - batch it
      return this.batchedInvalidation(key, options)
    } else {
      // Default to immediate
      return this.immediateInvalidation(key, options)
    }
  }

  // Dependency-based invalidation
  invalidateByDependency(dependency, options = {}) {
    const dependentKeys = this.dependencyGraph.get(dependency) || new Set()
    
    for (const key of dependentKeys) {
      this.invalidate(key, {
        ...options,
        reason: 'dependency',
        cascade: false // Prevent infinite recursion
      })
    }
    
    this.metrics.dependencyInvalidations++
  }

  invalidateByTag(tag, options = {}) {
    const taggedKeys = this.taggedCaches.get(tag) || new Set()
    
    for (const key of taggedKeys) {
      this.invalidate(key, {
        ...options,
        reason: 'tag',
        cascade: false
      })
    }
    
    this.metrics.tagInvalidations++
  }

  invalidateByPattern(pattern, options = {}) {
    const regex = new RegExp(pattern)
    const matchingKeys = []
    
    for (const key of this.cacheStore.keys()) {
      if (regex.test(key)) {
        matchingKeys.push(key)
      }
    }
    
    for (const key of matchingKeys) {
      this.invalidate(key, options)
    }
    
    return matchingKeys.length
  }

  cascadeInvalidation(key, options) {
    // Find and invalidate dependent caches
    const dependents = this.findDependents(key)
    
    for (const dependent of dependents) {
      this.invalidate(dependent, {
        ...options,
        reason: 'cascade',
        cascade: false // Prevent infinite recursion
      })
    }
  }

  findDependents(key) {
    const dependents = new Set()
    
    // Check direct dependencies
    for (const [dependency, keys] of this.dependencyGraph) {
      if (dependency === key || this.matchesDependencyPattern(key, dependency)) {
        for (const dependentKey of keys) {
          dependents.add(dependentKey)
        }
      }
    }
    
    return dependents
  }

  matchesDependencyPattern(key, pattern) {
    // Handle wildcard patterns like "user:*"
    if (pattern.includes('*')) {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'))
      return regex.test(key)
    }
    
    return key === pattern
  }

  // Event handlers
  handleDataChange(event) {
    const { type, id, operation } = event
    
    // Invalidate based on data change
    const dependency = `${type}:${id}`
    this.invalidateByDependency(dependency, { reason: 'data-change' })
    
    // Check cache patterns
    this.checkCachePatternsForEvent(`${type}.${operation}`, event)
  }

  handleUserAction(event) {
    const { action, userId, data } = event
    
    // Invalidate user-specific caches
    this.invalidateByDependency(`user:${userId}`, { reason: 'user-action' })
    
    // Handle specific actions
    if (action === 'logout') {
      this.invalidateByTag('user-data', { reason: 'logout' })
    }
  }

  handleWebSocketMessage(event) {
    const { type, data } = event
    
    // Real-time invalidation based on WebSocket events
    switch (type) {
      case 'message_created':
        this.invalidateByTag('messages', { reason: 'real-time' })
        this.invalidateByDependency(`channel:${data.channel_id}`, { reason: 'real-time' })
        break
      
      case 'user_updated':
        this.invalidateByDependency(`user:${data.user_id}`, { reason: 'real-time' })
        break
      
      case 'channel_updated':
        this.invalidateByDependency(`channel:${data.channel_id}`, { reason: 'real-time' })
        break
    }
  }

  // Cache pattern application
  applyCachePattern(key, entry) {
    for (const [pattern, config] of this.cachePatterns) {
      if (key.includes(pattern) || this.matchesPattern(key, pattern)) {
        // Apply pattern configuration
        entry.ttl = config.ttl
        entry.dependencies = new Set([...entry.dependencies, ...config.dependencies])
        entry.tags = new Set([...entry.tags, ...config.tags])
        
        // Register for automatic invalidation
        for (const event of config.invalidateOn) {
          this.registerEventInvalidation(event, key)
        }
        
        break
      }
    }
  }

  matchesPattern(key, pattern) {
    // Simple pattern matching - can be enhanced
    const regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*'))
    return regex.test(key)
  }

  registerEventInvalidation(event, key) {
    if (!this.subscriptions.has(event)) {
      this.subscriptions.set(event, new Set())
    }
    
    this.subscriptions.get(event).add(key)
  }

  checkCachePatternsForEvent(event, data) {
    const keys = this.subscriptions.get(event) || new Set()
    
    for (const key of keys) {
      this.invalidate(key, { reason: 'pattern-match' })
    }
  }

  // Utility methods
  updateDependencyGraph(key, dependencies) {
    if (!this.config.enableDependencyTracking) return
    
    for (const dependency of dependencies) {
      if (!this.dependencyGraph.has(dependency)) {
        this.dependencyGraph.set(dependency, new Set())
      }
      
      this.dependencyGraph.get(dependency).add(key)
    }
  }

  updateTagMappings(key, tags) {
    if (!this.config.enableTagBasedInvalidation) return
    
    for (const tag of tags) {
      if (!this.taggedCaches.has(tag)) {
        this.taggedCaches.set(tag, new Set())
      }
      
      this.taggedCaches.get(tag).add(key)
    }
  }

  cleanupDependencies(key, dependencies) {
    for (const dependency of dependencies) {
      const dependentKeys = this.dependencyGraph.get(dependency)
      if (dependentKeys) {
        dependentKeys.delete(key)
        if (dependentKeys.size === 0) {
          this.dependencyGraph.delete(dependency)
        }
      }
    }
  }

  cleanupTags(key, tags) {
    for (const tag of tags) {
      const taggedKeys = this.taggedCaches.get(tag)
      if (taggedKeys) {
        taggedKeys.delete(key)
        if (taggedKeys.size === 0) {
          this.taggedCaches.delete(tag)
        }
      }
    }
  }

  isExpired(entry) {
    if (entry.metadata.invalid) return true
    if (entry.ttl <= 0) return false // No expiration
    
    return Date.now() - entry.timestamp > entry.ttl
  }

  estimateSize(value) {
    try {
      return new Blob([JSON.stringify(value)]).size
    } catch {
      return 0
    }
  }

  cleanupExpiredEntries() {
    const expiredKeys = []
    
    for (const [key, entry] of this.cacheStore) {
      if (this.isExpired(entry)) {
        expiredKeys.push(key)
      }
    }
    
    for (const key of expiredKeys) {
      this.invalidate(key, { reason: 'ttl' })
    }
    
    if (expiredKeys.length > 0 && this.config.debugMode) {
      console.log(`[SmartCache] Cleaned up ${expiredKeys.length} expired entries`)
    }
  }

  analyzeCachePatterns() {
    // Analyze cache access patterns for optimization
    const patterns = new Map()
    
    for (const [key, entry] of this.cacheStore) {
      const pattern = this.extractPattern(key)
      
      if (!patterns.has(pattern)) {
        patterns.set(pattern, { count: 0, totalAccess: 0, totalSize: 0 })
      }
      
      const stats = patterns.get(pattern)
      stats.count++
      stats.totalAccess += entry.accessCount
      stats.totalSize += entry.size
    }
    
    // Log insights
    for (const [pattern, stats] of patterns) {
      if (stats.count > 10) { // Only analyze significant patterns
        console.log(`[SmartCache] Pattern analysis: ${pattern}`, {
          entries: stats.count,
          avgAccess: (stats.totalAccess / stats.count).toFixed(2),
          avgSize: (stats.totalSize / stats.count).toFixed(2)
        })
      }
    }
  }

  extractPattern(key) {
    // Extract pattern from cache key (e.g., "user:123:profile" -> "user:*:profile")
    return key.replace(/:\d+/g, ':*').replace(/[a-f0-9]{8,}/g, '*')
  }

  emitInvalidationEvent(key, reason, entry) {
    window.dispatchEvent(new CustomEvent('cacheInvalidated', {
      detail: { key, reason, entry }
    }))
  }

  updateInvalidationMetrics(count, time) {
    this.metrics.invalidationsTriggered += count
    this.metrics.totalInvalidationTime += time
    this.metrics.averageInvalidationTime = 
      this.metrics.totalInvalidationTime / this.metrics.invalidationsTriggered
  }

  updatePerformanceMetrics() {
    if (this.metrics.totalRequests > 0) {
      const hits = this.metrics.totalRequests - this.metrics.cacheMissRate
      this.metrics.cacheHitRate = (hits / this.metrics.totalRequests * 100).toFixed(2)
    }
  }

  // Public API
  getStats() {
    return {
      cacheSize: this.cacheStore.size,
      dependencyCount: this.dependencyGraph.size,
      tagCount: this.taggedCaches.size,
      queueSize: this.invalidationQueue.length,
      metrics: this.metrics
    }
  }

  getCacheInfo(key) {
    const entry = this.cacheStore.get(key)
    if (!entry) return null
    
    return {
      key: entry.key,
      size: entry.size,
      age: Date.now() - entry.timestamp,
      ttl: entry.ttl,
      accessCount: entry.accessCount,
      lastAccess: entry.lastAccess,
      dependencies: Array.from(entry.dependencies),
      tags: Array.from(entry.tags),
      expired: this.isExpired(entry)
    }
  }

  clear() {
    this.cacheStore.clear()
    this.dependencyGraph.clear()
    this.taggedCaches.clear()
    this.invalidationQueue = []
    this.subscriptions.clear()
  }

  // Configuration
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig }
  }

  addCachePattern(name, pattern) {
    this.cachePatterns.set(name, pattern)
  }
}

// Resource access tracker for automatic dependency detection
class ResourceAccessTracker {
  constructor() {
    this.accessLog = new Map()
    this.dependencyCallbacks = new Set()
  }

  trackAccess(resource, context) {
    const timestamp = Date.now()
    
    if (!this.accessLog.has(resource)) {
      this.accessLog.set(resource, [])
    }
    
    this.accessLog.get(resource).push({ context, timestamp })
    
    // Analyze for dependencies
    this.analyzeDependencies(resource, context)
  }

  analyzeDependencies(resource, context) {
    // Simple heuristic: if resources are accessed within a short timeframe,
    // they might be dependent
    const recentAccess = this.getRecentAccess(context, 1000) // 1 second window
    
    for (const dependency of recentAccess) {
      if (dependency !== resource) {
        this.notifyDependencyDetected(resource, dependency)
      }
    }
  }

  getRecentAccess(context, timeWindow) {
    const now = Date.now()
    const recent = []
    
    for (const [resource, accesses] of this.accessLog) {
      const recentAccesses = accesses.filter(access => 
        access.context === context && 
        now - access.timestamp <= timeWindow
      )
      
      if (recentAccesses.length > 0) {
        recent.push(resource)
      }
    }
    
    return recent
  }

  onDependencyDetected(callback) {
    this.dependencyCallbacks.add(callback)
  }

  notifyDependencyDetected(resource, dependency) {
    for (const callback of this.dependencyCallbacks) {
      callback(resource, dependency)
    }
  }
}

export default SmartCacheInvalidationService