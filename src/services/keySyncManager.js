import { offlineKeyQueue } from './offlineKeyQueue.js'
import { keySyncService } from './keySyncService.js'

const SYNC_INTERVAL = 30000
const MAX_RETRIES = 3
const RETRY_DELAY = 5000

class KeySyncManager {
  constructor() {
    this.isOnline = navigator.onLine
    this.isSyncing = false
    this.syncInterval = null
    this.eventListeners = new Map()
    this.currentUserId = null
    this.currentPassword = null
    this.apiBaseUrl = null
  }

  async initialize(userId, password, apiBaseUrl) {
    this.currentUserId = userId
    this.currentPassword = password
    this.apiBaseUrl = apiBaseUrl
    
    await offlineKeyQueue.initialize()
    await keySyncService.initialize(userId)
    
    this.setupNetworkListeners()
    this.startAutoSync()
    
    console.log('[KeySync] Initialized for user:', userId)
    return true
  }

  setupNetworkListeners() {
    window.addEventListener('online', () => {
      this.isOnline = true
      console.log('[KeySync] Network online, starting sync')
      this.triggerSync()
    })

    window.addEventListener('offline', () => {
      this.isOnline = false
      console.log('[KeySync] Network offline')
    })
  }

  startAutoSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval)
    }
    
    this.syncInterval = setInterval(() => {
      if (this.isOnline && !this.isSyncing) {
        this.triggerSync()
      }
    }, SYNC_INTERVAL)
  }

  stopAutoSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval)
      this.syncInterval = null
    }
  }

  async triggerSync() {
    if (this.isSyncing || !this.isOnline) {
      return
    }

    this.isSyncing = true
    this.emit('syncStarted')

    try {
      await this.syncPendingKeys()
      await this.fetchRemoteKeys()
      this.emit('syncComplete')
    } catch (error) {
      console.error('[KeySync] Sync failed:', error)
      this.emit('syncError', error)
    } finally {
      this.isSyncing = false
    }
  }

  async syncPendingKeys() {
    const pendingItems = await offlineKeyQueue.getAllPendingItems()
    
    if (pendingItems.length === 0) {
      return
    }

    console.log(`[KeySync] Syncing ${pendingItems.length} pending items`)

    for (const item of pendingItems) {
      try {
        await this.syncItem(item)
        await offlineKeyQueue.markAsProcessed(item.id)
      } catch (error) {
        console.error(`[KeySync] Failed to sync item ${item.id}:`, error)
        await offlineKeyQueue.markAsFailed(item.id, error.message)
      }
    }
  }

  async syncItem(item) {
    const response = await fetch(`${this.apiBaseUrl}/api/keys/sync?_=${Date.now()}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Authorization': `Bearer ${this.getAuthToken()}`
      },
      body: JSON.stringify({
        userId: this.currentUserId,
        targetDeviceId: item.targetDeviceId,
        keyData: item.keyData,
        encryptedMessage: item.encryptedMessage,
        type: item.type || 'key',
        timestamp: item.timestamp
      })
    })

    if (!response.ok) {
      throw new Error(`Sync failed: ${response.statusText}`)
    }

    return await response.json()
  }

  async fetchRemoteKeys() {
    const response = await fetch(`${this.apiBaseUrl}/api/keys/fetch?_=${Date.now()}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Authorization': `Bearer ${this.getAuthToken()}`
      },
      body: JSON.stringify({
        userId: this.currentUserId,
        lastSync: await this.getLastSyncTimestamp()
      })
    })

    if (!response.ok) {
      throw new Error(`Fetch failed: ${response.statusText}`)
    }

    const data = await response.json()
    
    if (data.keys && data.keys.length > 0) {
      await this.processRemoteKeys(data.keys)
      await this.updateLastSyncTimestamp(data.timestamp)
    }

    return data
  }

  async processRemoteKeys(keys) {
    for (const keyData of keys) {
      try {
        if (keyData.type === 'serverKey') {
          await keySyncService.storeServerKey(
            this.currentUserId,
            keyData.serverId,
            keyData.encryptedKey,
            this.currentPassword
          )
        } else if (keyData.type === 'privateKey') {
          await keySyncService.storePrivateKey(
            this.currentUserId,
            keyData.serverId,
            keyData.encryptedKey,
            this.currentPassword
          )
        }
        
        this.emit('keyReceived', keyData)
      } catch (error) {
        console.error('[KeySync] Failed to process remote key:', error)
      }
    }
  }

  async queueKeyForDevice(targetDeviceId, keyData, metadata = {}) {
    const queueId = await offlineKeyQueue.enqueueKeyUpdate(
      targetDeviceId,
      keyData,
      metadata
    )
    
    if (this.isOnline) {
      this.triggerSync()
    }
    
    return queueId
  }

  async queueMessageForDevice(targetDeviceId, encryptedMessage, metadata = {}) {
    const queueId = await offlineKeyQueue.enqueueMessage(
      targetDeviceId,
      encryptedMessage,
      metadata
    )
    
    if (this.isOnline) {
      this.triggerSync()
    }
    
    return queueId
  }

  async getLastSyncTimestamp() {
    const timestamp = localStorage.getItem(`voltchat_lastSync_${this.currentUserId}`)
    return timestamp ? parseInt(timestamp, 10) : 0
  }

  async updateLastSyncTimestamp(timestamp) {
    localStorage.setItem(`voltchat_lastSync_${this.currentUserId}`, timestamp.toString())
  }

  getAuthToken() {
    return localStorage.getItem('voltchat_auth_token') || ''
  }

  on(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set())
    }
    this.eventListeners.get(event).add(callback)
  }

  off(event, callback) {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event).delete(callback)
    }
  }

  emit(event, data) {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event).forEach(callback => {
        try {
          callback(data)
        } catch (error) {
          console.error(`[KeySync] Event handler error for ${event}:`, error)
        }
      })
    }
  }

  async getSyncStatus() {
    const stats = await offlineKeyQueue.getQueueStats(this.currentUserId)
    return {
      isOnline: this.isOnline,
      isSyncing: this.isSyncing,
      lastSync: await this.getLastSyncTimestamp(),
      queue: stats
    }
  }

  async destroy() {
    this.stopAutoSync()
    window.removeEventListener('online', this.handleOnline)
    window.removeEventListener('offline', this.handleOffline)
    this.eventListeners.clear()
    this.currentUserId = null
    this.currentPassword = null
  }
}

export const keySyncManager = new KeySyncManager()