// Background Sync Service for VoltChat
// Handles offline actions with intelligent sync when connection is restored

class BackgroundSyncService {
  constructor(apiService) {
    this.apiService = apiService
    this.syncQueue = new Map() // actionId -> syncAction
    this.isOnline = navigator.onLine
    this.isSyncing = false
    this.syncWorker = null
    
    // Configuration
    this.config = {
      maxQueueSize: 1000,
      retryAttempts: 5,
      retryDelay: 1000,
      batchSize: 10,
      syncInterval: 30000, // 30 seconds
      priorityLevels: {
        critical: 0,
        high: 1,
        medium: 2,
        low: 3
      }
    }
    
    // Performance tracking
    this.metrics = {
      actionsQueued: 0,
      actionsSynced: 0,
      actionsFailed: 0,
      totalSyncTime: 0,
      averageSyncTime: 0,
      queueSize: 0
    }
    
    // Sync strategies by action type
    this.syncStrategies = new Map([
      ['message_send', { priority: 'high', merge: false, retry: true }],
      ['message_edit', { priority: 'medium', merge: true, retry: true }],
      ['message_delete', { priority: 'medium', merge: true, retry: true }],
      ['typing_indicator', { priority: 'low', merge: false, retry: false }],
      ['presence_update', { priority: 'low', merge: true, retry: false }],
      ['file_upload', { priority: 'high', merge: false, retry: true }],
      ['channel_join', { priority: 'medium', merge: true, retry: true }],
      ['user_settings', { priority: 'medium', merge: true, retry: true }],
      ['reaction_add', { priority: 'medium', merge: true, retry: true }]
    ])
    
    this.initialize()
  }

  async initialize() {
    // Setup connection monitoring
    this.setupConnectionMonitoring()
    
    // Initialize service worker for background sync
    await this.initializeServiceWorker()
    
    // Load persisted queue
    await this.loadPersistedQueue()
    
    // Setup periodic sync
    this.startPeriodicSync()
    
    // Setup page visibility handling
    this.setupVisibilityHandling()
    
    console.log('[BackgroundSync] Background sync service initialized')
  }

  setupConnectionMonitoring() {
    // Listen for connection changes
    window.addEventListener('online', () => {
      console.log('[BackgroundSync] Connection restored')
      this.isOnline = true
      this.triggerSync()
    })
    
    window.addEventListener('offline', () => {
      console.log('[BackgroundSync] Connection lost')
      this.isOnline = false
    })
    
    // More sophisticated connection detection
    this.setupAdvancedConnectionDetection()
  }

  setupAdvancedConnectionDetection() {
    // Use fetch to detect actual connectivity
    setInterval(async () => {
      try {
        const response = await fetch('/api/health', {
          method: 'HEAD',
          cache: 'no-cache',
          signal: AbortSignal.timeout(3000)
        })
        
        const wasOnline = this.isOnline
        this.isOnline = response.ok
        
        // Trigger sync if connection was restored
        if (!wasOnline && this.isOnline) {
          this.triggerSync()
        }
      } catch (error) {
        this.isOnline = false
      }
    }, 10000) // Check every 10 seconds
  }

  async initializeServiceWorker() {
    if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
      try {
        const registration = await navigator.serviceWorker.ready
        
        // Setup message channel with service worker
        navigator.serviceWorker.addEventListener('message', (event) => {
          if (event.data.type === 'BACKGROUND_SYNC_COMPLETE') {
            this.handleServiceWorkerSync(event.data)
          }
        })
        
        this.serviceWorkerRegistration = registration
        console.log('[BackgroundSync] Service worker ready for background sync')
      } catch (error) {
        console.warn('[BackgroundSync] Service worker not available:', error)
      }
    }
  }

  // Queue action for background sync
  queueAction(actionType, actionData, options = {}) {
    const actionId = this.generateActionId()
    const strategy = this.syncStrategies.get(actionType) || {
      priority: 'medium',
      merge: false,
      retry: true
    }
    
    const syncAction = {
      id: actionId,
      type: actionType,
      data: actionData,
      timestamp: Date.now(),
      priority: options.priority || strategy.priority,
      retryCount: 0,
      maxRetries: strategy.retry ? this.config.retryAttempts : 1,
      merge: strategy.merge,
      status: 'pending',
      originalOptions: options
    }
    
    // Handle merging for similar actions
    if (strategy.merge) {
      this.handleActionMerging(syncAction)
    } else {
      this.syncQueue.set(actionId, syncAction)
    }
    
    this.metrics.actionsQueued++
    this.metrics.queueSize = this.syncQueue.size
    
    // Persist queue
    this.persistQueue()
    
    // Attempt immediate sync if online
    if (this.isOnline) {
      this.triggerSync()
    }
    
    // Register service worker sync if available
    this.registerServiceWorkerSync(actionType)
    
    return actionId
  }

  handleActionMerging(newAction) {
    // Find existing actions of the same type that can be merged
    const existingActions = Array.from(this.syncQueue.values())
      .filter(action => 
        action.type === newAction.type &&
        action.status === 'pending' &&
        this.canMergeActions(action, newAction)
      )
    
    if (existingActions.length > 0) {
      // Merge with the most recent action
      const targetAction = existingActions[existingActions.length - 1]
      targetAction.data = this.mergeActionData(targetAction.data, newAction.data)
      targetAction.timestamp = newAction.timestamp
      
      console.log(`[BackgroundSync] Merged action ${newAction.type}`)
    } else {
      this.syncQueue.set(newAction.id, newAction)
    }
  }

  canMergeActions(action1, action2) {
    // Define merging rules for different action types
    switch (action1.type) {
      case 'message_edit':
        return action1.data.messageId === action2.data.messageId
      case 'presence_update':
        return action1.data.userId === action2.data.userId
      case 'user_settings':
        return action1.data.category === action2.data.category
      case 'reaction_add':
        return (
          action1.data.messageId === action2.data.messageId &&
          action1.data.userId === action2.data.userId
        )
      default:
        return false
    }
  }

  mergeActionData(existingData, newData) {
    // Merge strategies for different data types
    if (typeof newData === 'object' && newData !== null) {
      return { ...existingData, ...newData }
    }
    return newData
  }

  // Trigger sync process
  async triggerSync() {
    if (this.isSyncing || !this.isOnline || this.syncQueue.size === 0) {
      return
    }
    
    this.isSyncing = true
    const startTime = performance.now()
    
    try {
      await this.processSyncQueue()
      
      const syncTime = performance.now() - startTime
      this.updateSyncMetrics(syncTime)
      
    } catch (error) {
      console.error('[BackgroundSync] Sync process failed:', error)
    } finally {
      this.isSyncing = false
    }
  }

  async processSyncQueue() {
    // Sort actions by priority and timestamp
    const sortedActions = Array.from(this.syncQueue.values())
      .filter(action => action.status === 'pending')
      .sort((a, b) => {
        const priorityDiff = this.config.priorityLevels[a.priority] - this.config.priorityLevels[b.priority]
        if (priorityDiff !== 0) return priorityDiff
        return a.timestamp - b.timestamp
      })
    
    // Process in batches
    for (let i = 0; i < sortedActions.length; i += this.config.batchSize) {
      const batch = sortedActions.slice(i, i + this.config.batchSize)
      
      await Promise.allSettled(
        batch.map(action => this.syncAction(action))
      )
      
      // Small delay between batches to prevent overwhelming
      if (i + this.config.batchSize < sortedActions.length) {
        await this.delay(100)
      }
    }
  }

  async syncAction(action) {
    try {
      action.status = 'syncing'
      
      // Execute the action based on its type
      const result = await this.executeAction(action)
      
      // Mark as completed
      action.status = 'completed'
      action.completedAt = Date.now()
      action.result = result
      
      // Remove from queue after successful sync
      this.syncQueue.delete(action.id)
      this.metrics.actionsSynced++
      
      // Notify listeners
      this.notifyActionCompleted(action)
      
      console.log(`[BackgroundSync] Synced action: ${action.type}`)
      
    } catch (error) {
      action.retryCount++
      
      if (action.retryCount >= action.maxRetries) {
        // Max retries reached
        action.status = 'failed'
        action.error = error.message
        this.metrics.actionsFailed++
        
        // Move to failed actions for manual retry
        this.handleFailedAction(action)
        
        console.error(`[BackgroundSync] Action failed permanently: ${action.type}`, error)
      } else {
        // Retry later
        action.status = 'pending'
        action.nextRetry = Date.now() + (this.config.retryDelay * Math.pow(2, action.retryCount))
        
        console.warn(`[BackgroundSync] Action failed, will retry: ${action.type} (attempt ${action.retryCount})`)
      }
    }
    
    this.metrics.queueSize = this.syncQueue.size
    this.persistQueue()
  }

  async executeAction(action) {
    switch (action.type) {
      case 'message_send':
        return await this.apiService.post('/api/messages', action.data)
      
      case 'message_edit':
        return await this.apiService.put(`/api/messages/${action.data.messageId}`, {
          content: action.data.content
        })
      
      case 'message_delete':
        return await this.apiService.delete(`/api/messages/${action.data.messageId}`)
      
      case 'file_upload':
        return await this.apiService.post('/api/files/upload', action.data.formData)
      
      case 'channel_join':
        return await this.apiService.post(`/api/channels/${action.data.channelId}/join`)
      
      case 'user_settings':
        return await this.apiService.put('/api/user/settings', action.data.settings)
      
      case 'reaction_add':
        return await this.apiService.post(`/api/messages/${action.data.messageId}/reactions`, {
          emoji: action.data.emoji
        })
      
      case 'presence_update':
        return await this.apiService.put('/api/user/presence', {
          status: action.data.status
        })
      
      default:
        throw new Error(`Unknown action type: ${action.type}`)
    }
  }

  handleFailedAction(action) {
    // Store failed action for potential manual retry
    const failedActions = this.getFailedActions()
    failedActions.push(action)
    
    localStorage.setItem('voltchat_failed_actions', JSON.stringify(failedActions.slice(-50))) // Keep last 50
    
    // Notify user of critical failed actions
    if (action.priority === 'critical') {
      this.notifyActionFailed(action)
    }
  }

  // Service Worker integration
  async registerServiceWorkerSync(actionType) {
    if (this.serviceWorkerRegistration) {
      try {
        await this.serviceWorkerRegistration.sync.register(`voltchat-sync-${actionType}`)
      } catch (error) {
        console.warn('[BackgroundSync] Could not register service worker sync:', error)
      }
    }
  }

  handleServiceWorkerSync(data) {
    // Handle sync completion from service worker
    const { actionId, success, result } = data
    
    if (this.syncQueue.has(actionId)) {
      const action = this.syncQueue.get(actionId)
      
      if (success) {
        action.status = 'completed'
        action.result = result
        this.syncQueue.delete(actionId)
        this.metrics.actionsSynced++
      } else {
        action.retryCount++
        action.status = action.retryCount >= action.maxRetries ? 'failed' : 'pending'
      }
      
      this.persistQueue()
    }
  }

  // Persistence
  async persistQueue() {
    try {
      const queueData = Array.from(this.syncQueue.entries())
      localStorage.setItem('voltchat_sync_queue', JSON.stringify(queueData))
    } catch (error) {
      console.warn('[BackgroundSync] Failed to persist queue:', error)
    }
  }

  async loadPersistedQueue() {
    try {
      const queueData = localStorage.getItem('voltchat_sync_queue')
      if (queueData) {
        const entries = JSON.parse(queueData)
        this.syncQueue = new Map(entries)
        this.metrics.queueSize = this.syncQueue.size
        
        console.log(`[BackgroundSync] Loaded ${this.syncQueue.size} actions from persistence`)
      }
    } catch (error) {
      console.warn('[BackgroundSync] Failed to load persisted queue:', error)
    }
  }

  // Periodic sync
  startPeriodicSync() {
    setInterval(() => {
      if (this.isOnline && this.syncQueue.size > 0) {
        this.triggerSync()
      }
    }, this.config.syncInterval)
  }

  // Page visibility handling
  setupVisibilityHandling() {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.isOnline && this.syncQueue.size > 0) {
        // Page became visible - trigger sync
        this.triggerSync()
      }
    })
    
    // Sync before page unload
    window.addEventListener('beforeunload', () => {
      if (this.syncQueue.size > 0) {
        this.persistQueue()
      }
    })
  }

  // Utility methods
  generateActionId() {
    return `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  updateSyncMetrics(syncTime) {
    this.metrics.totalSyncTime += syncTime
    const syncCount = this.metrics.actionsSynced
    this.metrics.averageSyncTime = this.metrics.totalSyncTime / Math.max(syncCount, 1)
  }

  // Notification methods
  notifyActionCompleted(action) {
    window.dispatchEvent(new CustomEvent('backgroundSyncCompleted', {
      detail: { action }
    }))
  }

  notifyActionFailed(action) {
    window.dispatchEvent(new CustomEvent('backgroundSyncFailed', {
      detail: { action }
    }))
  }

  // Public API
  getQueueStatus() {
    const pending = Array.from(this.syncQueue.values()).filter(a => a.status === 'pending').length
    const syncing = Array.from(this.syncQueue.values()).filter(a => a.status === 'syncing').length
    const failed = Array.from(this.syncQueue.values()).filter(a => a.status === 'failed').length
    
    return { pending, syncing, failed, total: this.syncQueue.size }
  }

  getFailedActions() {
    try {
      const failed = localStorage.getItem('voltchat_failed_actions')
      return failed ? JSON.parse(failed) : []
    } catch {
      return []
    }
  }

  async retryFailedAction(actionId) {
    const failedActions = this.getFailedActions()
    const action = failedActions.find(a => a.id === actionId)
    
    if (action) {
      action.retryCount = 0
      action.status = 'pending'
      delete action.error
      
      this.syncQueue.set(actionId, action)
      
      // Remove from failed list
      const updatedFailed = failedActions.filter(a => a.id !== actionId)
      localStorage.setItem('voltchat_failed_actions', JSON.stringify(updatedFailed))
      
      // Trigger sync
      if (this.isOnline) {
        this.triggerSync()
      }
    }
  }

  async retryAllFailedActions() {
    const failedActions = this.getFailedActions()
    
    for (const action of failedActions) {
      await this.retryFailedAction(action.id)
    }
  }

  clearCompletedActions() {
    // Remove completed actions older than 1 hour
    const oneHourAgo = Date.now() - 60 * 60 * 1000
    
    for (const [id, action] of this.syncQueue.entries()) {
      if (action.status === 'completed' && action.completedAt < oneHourAgo) {
        this.syncQueue.delete(id)
      }
    }
    
    this.persistQueue()
  }

  getMetrics() {
    return {
      ...this.metrics,
      queueStatus: this.getQueueStatus(),
      isOnline: this.isOnline,
      isSyncing: this.isSyncing,
      failedActionsCount: this.getFailedActions().length
    }
  }

  // Cleanup
  destroy() {
    this.persistQueue()
    this.syncQueue.clear()
  }
}

export default BackgroundSyncService