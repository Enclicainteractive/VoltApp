import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { keySyncService } from '../services/keySyncService'

describe('Key Sync Service - IndexedDB Storage', () => {
  const testUserId = 'test-user-123'
  const testServerId = 'test-server-456'
  const testPassword = 'test-password-123'
  const testSymmetricKey = 'dGVzdC1zeW1tZXRyaWMta2V5LWJhc2U2NA=='

  beforeEach(async () => {
    await keySyncService.initialize(testUserId)
  })

  afterEach(async () => {
    await keySyncService.clearUserKeys(testUserId)
  })

  describe('Initialization', () => {
    it('should initialize IndexedDB for user', async () => {
      const result = await keySyncService.initialize(testUserId)
      expect(result).toBe(true)
    })

    it('should reinitialize without error', async () => {
      await expect(keySyncService.initialize(testUserId)).resolves.toBe(true)
    })
  })

  describe('Server Key Storage', () => {
    it('should store server key encrypted with password', async () => {
      const result = await keySyncService.storeServerKey(
        testUserId,
        testServerId,
        testSymmetricKey,
        testPassword
      )
      
      expect(result).toBe(true)
    })

    it('should retrieve stored server key', async () => {
      await keySyncService.storeServerKey(
        testUserId,
        testServerId,
        testSymmetricKey,
        testPassword
      )
      
      const retrievedKey = await keySyncService.retrieveServerKey(
        testUserId,
        testServerId,
        testPassword
      )
      
      expect(retrievedKey).toBe(testSymmetricKey)
    })

    it('should return null for non-existent server key', async () => {
      const retrievedKey = await keySyncService.retrieveServerKey(
        testUserId,
        'non-existent-server',
        testPassword
      )
      
      expect(retrievedKey).toBeNull()
    })

    it('should return null with wrong password', async () => {
      await keySyncService.storeServerKey(
        testUserId,
        testServerId,
        testSymmetricKey,
        testPassword
      )
      
      const retrievedKey = await keySyncService.retrieveServerKey(
        testUserId,
        testServerId,
        'wrong-password'
      )
      
      expect(retrievedKey).toBeNull()
    })

    it('should update existing server key', async () => {
      const newKey = 'bmV3LXN5bW1ldHJpYy1rZXk='
      
      await keySyncService.storeServerKey(
        testUserId,
        testServerId,
        testSymmetricKey,
        testPassword
      )
      
      await keySyncService.storeServerKey(
        testUserId,
        testServerId,
        newKey,
        testPassword
      )
      
      const retrievedKey = await keySyncService.retrieveServerKey(
        testUserId,
        testServerId,
        testPassword
      )
      
      expect(retrievedKey).toBe(newKey)
    })

    it('should store multiple server keys', async () => {
      const server1 = 'server-1'
      const server2 = 'server-2'
      const key1 = 'a2V5LTE='
      const key2 = 'a2V5LTI='
      
      await keySyncService.storeServerKey(testUserId, server1, key1, testPassword)
      await keySyncService.storeServerKey(testUserId, server2, key2, testPassword)
      
      const retrievedKey1 = await keySyncService.retrieveServerKey(testUserId, server1, testPassword)
      const retrievedKey2 = await keySyncService.retrieveServerKey(testUserId, server2, testPassword)
      
      expect(retrievedKey1).toBe(key1)
      expect(retrievedKey2).toBe(key2)
    })
  })

  describe('Bulk Key Operations', () => {
    it('should retrieve all server keys', async () => {
      const server1 = 'server-1'
      const server2 = 'server-2'
      const key1 = 'a2V5LTE='
      const key2 = 'a2V5LTI='
      
      await keySyncService.storeServerKey(testUserId, server1, key1, testPassword)
      await keySyncService.storeServerKey(testUserId, server2, key2, testPassword)
      
      const allKeys = await keySyncService.getAllServerKeys(testUserId, testPassword)
      
      expect(allKeys).toHaveProperty(server1, key1)
      expect(allKeys).toHaveProperty(server2, key2)
    })

    it('should return empty object when no keys stored', async () => {
      const allKeys = await keySyncService.getAllServerKeys(testUserId, testPassword)
      expect(allKeys).toEqual({})
    })
  })

  describe('Key Deletion', () => {
    it('should clear all keys for user', async () => {
      const server1 = 'server-1'
      const server2 = 'server-2'
      
      await keySyncService.storeServerKey(testUserId, server1, 'key1', testPassword)
      await keySyncService.storeServerKey(testUserId, server2, 'key2', testPassword)
      
      await keySyncService.clearUserKeys(testUserId)
      
      const allKeys = await keySyncService.getAllServerKeys(testUserId, testPassword)
      expect(allKeys).toEqual({})
    })
  })

  describe('Multi-User Isolation', () => {
    it('should isolate keys between different users', async () => {
      const user1 = 'user-1'
      const user2 = 'user-2'
      const serverId = 'shared-server'
      const key1 = 'a2V5LTE='
      const key2 = 'a2V5LTI='
      
      await keySyncService.initialize(user1)
      await keySyncService.initialize(user2)
      
      await keySyncService.storeServerKey(user1, serverId, key1, testPassword)
      await keySyncService.storeServerKey(user2, serverId, key2, testPassword)
      
      const retrievedKey1 = await keySyncService.retrieveServerKey(user1, serverId, testPassword)
      const retrievedKey2 = await keySyncService.retrieveServerKey(user2, serverId, testPassword)
      
      expect(retrievedKey1).toBe(key1)
      expect(retrievedKey2).toBe(key2)
      expect(retrievedKey1).not.toBe(retrievedKey2)
    })
  })

  describe('Key Existence Check', () => {
    it('should return true when key exists', async () => {
      await keySyncService.storeServerKey(
        testUserId,
        testServerId,
        testSymmetricKey,
        testPassword
      )
      
      const hasKey = await keySyncService.hasKey(testUserId, testServerId)
      expect(hasKey).toBe(true)
    })

    it('should return false when key does not exist', async () => {
      const hasKey = await keySyncService.hasKey(testUserId, 'non-existent-server')
      expect(hasKey).toBe(false)
    })
  })

  describe('Backup and Restore', () => {
    it('should export backup data', async () => {
      await keySyncService.storeServerKey(
        testUserId,
        testServerId,
        testSymmetricKey,
        testPassword
      )
      
      const backup = await keySyncService.exportBackup(testUserId, testPassword)
      
      expect(backup).toHaveProperty('version', 1)
      expect(backup).toHaveProperty('userId', testUserId)
      expect(backup).toHaveProperty('salt')
      expect(backup).toHaveProperty('keys')
      expect(backup).toHaveProperty('exportedAt')
    })

    it('should import backup data', async () => {
      await keySyncService.storeServerKey(
        testUserId,
        testServerId,
        testSymmetricKey,
        testPassword
      )
      
      const backup = await keySyncService.exportBackup(testUserId, testPassword)
      
      await keySyncService.clearUserKeys(testUserId)
      
      await keySyncService.importBackup(backup, testPassword)
      
      const retrievedKey = await keySyncService.retrieveServerKey(
        testUserId,
        testServerId,
        testPassword
      )
      
      expect(retrievedKey).toBe(testSymmetricKey)
    })
  })

  describe('Private Key Storage', () => {
    it('should store and retrieve private key', async () => {
      const privateKey = 'dGVzdC1wcml2YXRlLWtleQ=='
      
      await keySyncService.storePrivateKey(
        testUserId,
        testServerId,
        privateKey,
        testPassword
      )
      
      const retrievedKey = await keySyncService.retrievePrivateKey(
        testUserId,
        testServerId,
        testPassword
      )
      
      expect(retrievedKey).toBe(privateKey)
    })

    it('should return null for non-existent private key', async () => {
      const retrievedKey = await keySyncService.retrievePrivateKey(
        testUserId,
        testServerId,
        testPassword
      )
      
      expect(retrievedKey).toBeNull()
    })

    it('should return null with wrong password for private key', async () => {
      const privateKey = 'dGVzdC1wcml2YXRlLWtleQ=='
      
      await keySyncService.storePrivateKey(
        testUserId,
        testServerId,
        privateKey,
        testPassword
      )
      
      const retrievedKey = await keySyncService.retrievePrivateKey(
        testUserId,
        testServerId,
        'wrong-password'
      )
      
      expect(retrievedKey).toBeNull()
    })
  })
})