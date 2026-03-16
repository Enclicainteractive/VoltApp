import { openDB } from 'idb'

const DB_NAME = 'VoltChatOfflineQueue'
const DB_VERSION = 1
const QUEUE_STORE = 'keyQueue'
const MAX_QUEUE_SIZE = 1000
const QUEUE_TTL = 7 * 24 * 60 * 60 * 1000

let db = null

async function getDB() {
  if (!db) {
    db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(QUEUE_STORE)) {
          const store = db.createObjectStore(QUEUE_STORE, { keyPath: 'id' })
          store.createIndex('targetDeviceId', 'targetDeviceId', { unique: false })
          store.createIndex('timestamp', 'timestamp', { unique: false })
          store.createIndex('processed', 'processed', { unique: false })
        }
      }
    })
  }
  return db
}

function generateQueueId() {
  return `queue_${Date.now()}_${crypto.randomUUID()}`
}

export const offlineKeyQueue = {
  async initialize() {
    await getDB()
    await this.cleanupExpired()
    return true
  },

  async enqueueKeyUpdate(targetDeviceId, keyData, metadata = {}) {
    const database = await getDB()
    
    const queueSize = await database.count(QUEUE_STORE)
    if (queueSize >= MAX_QUEUE_SIZE) {
      await this.cleanupOldest(Math.floor(MAX_QUEUE_SIZE * 0.1))
    }

    const item = {
      id: generateQueueId(),
      targetDeviceId,
      keyData,
      metadata,
      timestamp: Date.now(),
      processed: false,
      attempts: 0
    }

    await database.put(QUEUE_STORE, item)
    console.log(`[OfflineQueue] Enqueued key update for device ${targetDeviceId}`)
    return item.id
  },

  async enqueueMessage(targetDeviceId, encryptedMessage, metadata = {}) {
    const database = await getDB()
    
    const queueSize = await database.count(QUEUE_STORE)
    if (queueSize >= MAX_QUEUE_SIZE) {
      await this.cleanupOldest(Math.floor(MAX_QUEUE_SIZE * 0.1))
    }

    const item = {
      id: generateQueueId(),
      targetDeviceId,
      type: 'message',
      encryptedMessage,
      metadata,
      timestamp: Date.now(),
      processed: false,
      attempts: 0
    }

    await database.put(QUEUE_STORE, item)
    return item.id
  },

  async getQueuedItems(targetDeviceId, limit = 50) {
    const database = await getDB()
    const tx = database.transaction(QUEUE_STORE, 'readonly')
    const index = tx.store.index('targetDeviceId')
    
    const items = []
    let cursor = await index.openCursor(IDBKeyRange.only(targetDeviceId))
    
    while (cursor && items.length < limit) {
      const item = cursor.value
      if (!item.processed && Date.now() - item.timestamp < QUEUE_TTL) {
        items.push(item)
      }
      cursor = await cursor.continue()
    }
    
    return items.sort((a, b) => a.timestamp - b.timestamp)
  },

  async markAsProcessed(queueItemId) {
    const database = await getDB()
    const item = await database.get(QUEUE_STORE, queueItemId)
    
    if (item) {
      item.processed = true
      item.processedAt = Date.now()
      await database.put(QUEUE_STORE, item)
    }
  },

  async markAsFailed(queueItemId, error) {
    const database = await getDB()
    const item = await database.get(QUEUE_STORE, queueItemId)
    
    if (item) {
      item.attempts = (item.attempts || 0) + 1
      item.lastError = error
      item.lastAttemptAt = Date.now()
      
      if (item.attempts >= 5) {
        item.processed = true
        item.failed = true
      }
      
      await database.put(QUEUE_STORE, item)
    }
  },

  async getQueueStats(targetDeviceId) {
    const database = await getDB()
    const tx = database.transaction(QUEUE_STORE, 'readonly')
    const index = tx.store.index('targetDeviceId')
    
    let pending = 0
    let processed = 0
    let failed = 0
    
    let cursor = await index.openCursor(IDBKeyRange.only(targetDeviceId))
    
    while (cursor) {
      const item = cursor.value
      if (item.failed) {
        failed++
      } else if (item.processed) {
        processed++
      } else {
        pending++
      }
      cursor = await cursor.continue()
    }
    
    return { pending, processed, failed }
  },

  async cleanupExpired() {
    const database = await getDB()
    const tx = database.transaction(QUEUE_STORE, 'readwrite')
    const index = tx.store.index('timestamp')
    
    const cutoffTime = Date.now() - QUEUE_TTL
    let deleted = 0
    
    let cursor = await index.openCursor(IDBKeyRange.upperBound(cutoffTime))
    
    while (cursor) {
      await cursor.delete()
      deleted++
      cursor = await cursor.continue()
    }
    
    if (deleted > 0) {
      console.log(`[OfflineQueue] Cleaned up ${deleted} expired items`)
    }
    
    return deleted
  },

  async cleanupOldest(count) {
    const database = await getDB()
    const tx = database.transaction(QUEUE_STORE, 'readwrite')
    const index = tx.store.index('timestamp')
    
    let deleted = 0
    let cursor = await index.openCursor()
    
    while (cursor && deleted < count) {
      await cursor.delete()
      deleted++
      cursor = await cursor.continue()
    }
    
    console.log(`[OfflineQueue] Cleaned up ${deleted} oldest items`)
    return deleted
  },

  async clearQueue(targetDeviceId) {
    const database = await getDB()
    const tx = database.transaction(QUEUE_STORE, 'readwrite')
    const index = tx.store.index('targetDeviceId')
    
    let deleted = 0
    let cursor = await index.openCursor(IDBKeyRange.only(targetDeviceId))
    
    while (cursor) {
      await cursor.delete()
      deleted++
      cursor = await cursor.continue()
    }
    
    return deleted
  },

  async getAllPendingItems() {
    const database = await getDB()
    const items = await database.getAllFromIndex(QUEUE_STORE, 'processed', false)
    return items.filter(item => Date.now() - item.timestamp < QUEUE_TTL)
  }
}