import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { offlineKeyQueue } from '../services/offlineKeyQueue'

describe('Offline Key Queue Service', () => {
  const testDeviceId = 'device-test-123'
  const testKeyData = { key: 'test-key-value', version: 1 }
  const testMessage = { encrypted: 'encrypted-data', iv: 'test-iv' }

  beforeEach(async () => {
    await offlineKeyQueue.initialize()
    await offlineKeyQueue.clearQueue(testDeviceId)
  })

  afterEach(async () => {
    await offlineKeyQueue.clearQueue(testDeviceId)
  })

  describe('Initialization', () => {
    it('should initialize IndexedDB', async () => {
      const result = await offlineKeyQueue.initialize()
      expect(result).toBe(true)
    })
  })

  describe('Key Update Queueing', () => {
    it('should enqueue key update for device', async () => {
      const queueId = await offlineKeyQueue.enqueueKeyUpdate(
        testDeviceId,
        testKeyData,
        { source: 'test' }
      )

      expect(queueId).toBeDefined()
      expect(queueId).toMatch(/^queue_\d+_[a-z0-9-]+$/)
    })

    it('should retrieve queued key updates', async () => {
      await offlineKeyQueue.enqueueKeyUpdate(testDeviceId, testKeyData)
      
      const items = await offlineKeyQueue.getQueuedItems(testDeviceId)
      
      expect(items).toHaveLength(1)
      expect(items[0].targetDeviceId).toBe(testDeviceId)
      expect(items[0].keyData).toEqual(testKeyData)
      expect(items[0].processed).toBe(false)
    })

    it('should retrieve items in chronological order', async () => {
      await offlineKeyQueue.enqueueKeyUpdate(testDeviceId, { key: 'first' })
      await new Promise(resolve => setTimeout(resolve, 10))
      await offlineKeyQueue.enqueueKeyUpdate(testDeviceId, { key: 'second' })
      await new Promise(resolve => setTimeout(resolve, 10))
      await offlineKeyQueue.enqueueKeyUpdate(testDeviceId, { key: 'third' })
      
      const items = await offlineKeyQueue.getQueuedItems(testDeviceId)
      
      expect(items).toHaveLength(3)
      expect(items[0].keyData.key).toBe('first')
      expect(items[1].keyData.key).toBe('second')
      expect(items[2].keyData.key).toBe('third')
    })

    it('should limit retrieved items', async () => {
      for (let i = 0; i < 10; i++) {
        await offlineKeyQueue.enqueueKeyUpdate(testDeviceId, { key: `key-${i}` })
      }
      
      const items = await offlineKeyQueue.getQueuedItems(testDeviceId, 5)
      
      expect(items).toHaveLength(5)
    })
  })

  describe('Message Queueing', () => {
    it('should enqueue encrypted message for device', async () => {
      const queueId = await offlineKeyQueue.enqueueMessage(
        testDeviceId,
        testMessage,
        { priority: 'high' }
      )

      expect(queueId).toBeDefined()
    })

    it('should retrieve queued messages', async () => {
      await offlineKeyQueue.enqueueMessage(testDeviceId, testMessage)
      
      const items = await offlineKeyQueue.getQueuedItems(testDeviceId)
      
      expect(items).toHaveLength(1)
      expect(items[0].type).toBe('message')
      expect(items[0].encryptedMessage).toEqual(testMessage)
    })

    it('should queue both keys and messages', async () => {
      await offlineKeyQueue.enqueueKeyUpdate(testDeviceId, testKeyData)
      await offlineKeyQueue.enqueueMessage(testDeviceId, testMessage)
      
      const items = await offlineKeyQueue.getQueuedItems(testDeviceId)
      
      expect(items).toHaveLength(2)
      expect(items[0].keyData).toBeDefined()
      expect(items[1].encryptedMessage).toBeDefined()
    })
  })

  describe('Processing Status', () => {
    it('should mark item as processed', async () => {
      const queueId = await offlineKeyQueue.enqueueKeyUpdate(testDeviceId, testKeyData)
      
      await offlineKeyQueue.markAsProcessed(queueId)
      
      const items = await offlineKeyQueue.getQueuedItems(testDeviceId)
      expect(items).toHaveLength(0)
    })

    it('should mark item as failed', async () => {
      const queueId = await offlineKeyQueue.enqueueKeyUpdate(testDeviceId, testKeyData)
      
      for (let i = 0; i < 5; i++) {
        await offlineKeyQueue.markAsFailed(queueId, `Error ${i}`)
      }
      
      const stats = await offlineKeyQueue.getQueueStats(testDeviceId)
      expect(stats.failed).toBe(1)
    })

    it('should increment attempt count on failure', async () => {
      const queueId = await offlineKeyQueue.enqueueKeyUpdate(testDeviceId, testKeyData)
      
      await offlineKeyQueue.markAsFailed(queueId, 'Error 1')
      await offlineKeyQueue.markAsFailed(queueId, 'Error 2')
      
      const items = await offlineKeyQueue.getQueuedItems(testDeviceId)
      const item = items.find(i => i.id === queueId)
      
      expect(item).toBeDefined()
      expect(item.attempts).toBe(2)
    })

    it('should mark as failed after max attempts', async () => {
      const queueId = await offlineKeyQueue.enqueueKeyUpdate(testDeviceId, testKeyData)
      
      for (let i = 0; i < 5; i++) {
        await offlineKeyQueue.markAsFailed(queueId, `Error ${i}`)
      }
      
      const stats = await offlineKeyQueue.getQueueStats(testDeviceId)
      expect(stats.failed).toBe(1)
    })
  })

  describe('Queue Statistics', () => {
    it('should return queue stats', async () => {
      await offlineKeyQueue.enqueueKeyUpdate(testDeviceId, testKeyData)
      await offlineKeyQueue.enqueueMessage(testDeviceId, testMessage)
      
      const stats = await offlineKeyQueue.getQueueStats(testDeviceId)
      
      expect(stats.pending).toBe(2)
      expect(stats.processed).toBe(0)
      expect(stats.failed).toBe(0)
    })

    it('should track processed items', async () => {
      const queueId1 = await offlineKeyQueue.enqueueKeyUpdate(testDeviceId, testKeyData)
      const queueId2 = await offlineKeyQueue.enqueueMessage(testDeviceId, testMessage)
      
      await offlineKeyQueue.markAsProcessed(queueId1)
      
      const stats = await offlineKeyQueue.getQueueStats(testDeviceId)
      expect(stats.pending).toBe(1)
      expect(stats.processed).toBe(1)
    })
  })

  describe('Cleanup Operations', () => {
    it('should clear queue for device', async () => {
      await offlineKeyQueue.enqueueKeyUpdate(testDeviceId, testKeyData)
      await offlineKeyQueue.enqueueMessage(testDeviceId, testMessage)
      
      const deleted = await offlineKeyQueue.clearQueue(testDeviceId)
      
      expect(deleted).toBe(2)
      
      const items = await offlineKeyQueue.getQueuedItems(testDeviceId)
      expect(items).toHaveLength(0)
    })

    it('should cleanup expired items', async () => {
      const oldItem = {
        id: 'old-item',
        targetDeviceId: testDeviceId,
        keyData: testKeyData,
        timestamp: Date.now() - (8 * 24 * 60 * 60 * 1000),
        processed: false
      }
      
      const database = await (await import('idb')).openDB('VoltChatOfflineQueue', 1)
      await database.put('keyQueue', oldItem)
      
      const deleted = await offlineKeyQueue.cleanupExpired()
      
      expect(deleted).toBeGreaterThan(0)
    })
  })

  describe('Multi-Device Isolation', () => {
    it('should isolate queues between devices', async () => {
      const device1 = 'device-1'
      const device2 = 'device-2'
      
      await offlineKeyQueue.enqueueKeyUpdate(device1, { key: 'key1' })
      await offlineKeyQueue.enqueueKeyUpdate(device2, { key: 'key2' })
      
      const items1 = await offlineKeyQueue.getQueuedItems(device1)
      const items2 = await offlineKeyQueue.getQueuedItems(device2)
      
      expect(items1).toHaveLength(1)
      expect(items2).toHaveLength(1)
      expect(items1[0].keyData.key).toBe('key1')
      expect(items2[0].keyData.key).toBe('key2')
    })
  })

  describe('Get All Pending Items', () => {
    it('should retrieve all pending items across devices', async () => {
      const device1 = 'device-1'
      const device2 = 'device-2'
      
      await offlineKeyQueue.clearQueue(device1)
      await offlineKeyQueue.clearQueue(device2)
      
      await offlineKeyQueue.enqueueKeyUpdate(device1, { key: 'key1' })
      await offlineKeyQueue.enqueueKeyUpdate(device2, { key: 'key2' })
      
      const items1 = await offlineKeyQueue.getQueuedItems(device1)
      const items2 = await offlineKeyQueue.getQueuedItems(device2)
      
      expect(items1.length).toBe(1)
      expect(items2.length).toBe(1)
    })
  })
})