import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as crypto from '../utils/crypto'

describe('E2E Encryption - Multi-Device Key Sync', () => {
  let userKeyPair
  let serverSymmetricKey
  let password

  beforeEach(async () => {
    userKeyPair = await crypto.generateKeyPair()
    serverSymmetricKey = await crypto.generateSymmetricKey()
    password = 'test-password-123'
  })

  describe('Key Backup and Restore', () => {
    it('should export and import user private key with password', async () => {
      const exportedKey = await crypto.exportKeyForBackup(userKeyPair.privateKey, password)
      
      expect(exportedKey).toHaveProperty('salt')
      expect(exportedKey).toHaveProperty('iv')
      expect(exportedKey).toHaveProperty('encrypted')
      
      const importedKey = await crypto.importKeyFromBackup(exportedKey, password)
      expect(importedKey).toBe(userKeyPair.privateKey)
    })

    it('should fail to import with wrong password', async () => {
      const exportedKey = await crypto.exportKeyForBackup(userKeyPair.privateKey, password)
      
      await expect(
        crypto.importKeyFromBackup(exportedKey, 'wrong-password')
      ).rejects.toThrow()
    })

    it('should export and import server symmetric key', async () => {
      const exportedKey = await crypto.exportSymmetricKey(serverSymmetricKey)
      const importedKey = await crypto.importSymmetricKey(exportedKey)
      
      const testMessage = 'Hello, World!'
      const encrypted = await crypto.encryptMessage(testMessage, serverSymmetricKey)
      const decrypted = await crypto.decryptMessage(encrypted, importedKey)
      
      expect(decrypted).toBe(testMessage)
    })
  })

  describe('Key Encryption for Users', () => {
    it('should encrypt server key for user and decrypt it back', async () => {
      const serverKeyBase64 = await crypto.exportSymmetricKey(serverSymmetricKey)
      const encryptedPackage = await crypto.encryptKeyForUser(
        serverKeyBase64,
        userKeyPair.publicKey
      )
      
      expect(encryptedPackage).toHaveProperty('ephemeralPublicKey')
      expect(encryptedPackage).toHaveProperty('iv')
      expect(encryptedPackage).toHaveProperty('encrypted')
      
      const decryptedKeyBase64 = await crypto.decryptKeyForUser(
        encryptedPackage,
        userKeyPair.privateKey
      )
      
      expect(decryptedKeyBase64).toBe(serverKeyBase64)
    })

    it('should fail to decrypt with wrong private key', async () => {
      const wrongKeyPair = await crypto.generateKeyPair()
      const serverKeyBase64 = await crypto.exportSymmetricKey(serverSymmetricKey)
      const encryptedPackage = await crypto.encryptKeyForUser(
        serverKeyBase64,
        userKeyPair.publicKey
      )
      
      await expect(
        crypto.decryptKeyForUser(encryptedPackage, wrongKeyPair.privateKey)
      ).rejects.toThrow()
    })
  })

  describe('Message Encryption and Decryption', () => {
    it('should encrypt and decrypt messages with server key', async () => {
      const message = 'Secret message content'
      const encrypted = await crypto.encryptMessage(message, serverSymmetricKey)
      
      expect(encrypted).toHaveProperty('iv')
      expect(encrypted).toHaveProperty('encrypted')
      expect(encrypted.encrypted).not.toBe(message)
      
      const decrypted = await crypto.decryptMessage(encrypted, serverSymmetricKey)
      expect(decrypted).toBe(message)
    })

    it('should encrypt and decrypt JSON messages', async () => {
      const message = { text: 'Hello', timestamp: Date.now() }
      const encrypted = await crypto.encryptMessage(message, serverSymmetricKey)
      const decrypted = await crypto.decryptMessage(encrypted, serverSymmetricKey)
      
      expect(JSON.parse(decrypted)).toEqual(message)
    })

    it('should fail to decrypt with wrong key', async () => {
      const wrongKey = await crypto.generateSymmetricKey()
      const message = 'Secret message'
      const encrypted = await crypto.encryptMessage(message, serverSymmetricKey)
      
      await expect(
        crypto.decryptMessage(encrypted, wrongKey)
      ).rejects.toThrow()
    })
  })

  describe('Key Rotation Support', () => {
    it('should maintain decryption with previous key after rotation', async () => {
      const oldKey = await crypto.generateSymmetricKey()
      const newKey = await crypto.generateSymmetricKey()
      
      const message = 'Message encrypted with old key'
      const encrypted = await crypto.encryptMessage(message, oldKey)
      
      const decryptedWithOldKey = await crypto.decryptMessage(encrypted, oldKey)
      expect(decryptedWithOldKey).toBe(message)
      
      await expect(
        crypto.decryptMessage(encrypted, newKey)
      ).rejects.toThrow()
    })

    it('should encrypt new messages with rotated key', async () => {
      const oldKey = await crypto.generateSymmetricKey()
      const newKey = await crypto.generateSymmetricKey()
      
      const oldMessage = 'Old message'
      const newMessage = 'New message'
      
      const oldEncrypted = await crypto.encryptMessage(oldMessage, oldKey)
      const newEncrypted = await crypto.encryptMessage(newMessage, newKey)
      
      const decryptedOld = await crypto.decryptMessage(oldEncrypted, oldKey)
      const decryptedNew = await crypto.decryptMessage(newEncrypted, newKey)
      
      expect(decryptedOld).toBe(oldMessage)
      expect(decryptedNew).toBe(newMessage)
    })
  })

  describe('Newcomer Key Fetch', () => {
    it('should allow newcomer to decrypt after receiving encrypted key', async () => {
      const newcomerKeyPair = await crypto.generateKeyPair()
      const serverKeyBase64 = await crypto.exportSymmetricKey(serverSymmetricKey)
      
      const encryptedPackage = await crypto.encryptKeyForUser(
        serverKeyBase64,
        newcomerKeyPair.publicKey
      )
      
      const decryptedKeyBase64 = await crypto.decryptKeyForUser(
        encryptedPackage,
        newcomerKeyPair.privateKey
      )
      
      const importedKey = await crypto.importSymmetricKey(decryptedKeyBase64)
      
      const existingMessage = 'Existing encrypted message'
      const encryptedMessage = await crypto.encryptMessage(existingMessage, serverSymmetricKey)
      
      const decryptedByNewcomer = await crypto.decryptMessage(encryptedMessage, importedKey)
      expect(decryptedByNewcomer).toBe(existingMessage)
    })
  })

  describe('Device Identification', () => {
    it('should generate unique device IDs', () => {
      const id1 = crypto.randomUUID()
      const id2 = crypto.randomUUID()
      
      expect(id1).toBeDefined()
      expect(id2).toBeDefined()
      expect(id1).not.toBe(id2)
      expect(id1).toMatch(/^[0-9a-f-]+$/i)
    })
  })

  describe('Key Fingerprints', () => {
    it('should generate consistent fingerprints for same key', async () => {
      const fingerprint1 = await crypto.getKeyFingerprint(userKeyPair.publicKey)
      const fingerprint2 = await crypto.getKeyFingerprint(userKeyPair.publicKey)
      
      expect(fingerprint1).toBe(fingerprint2)
      expect(fingerprint1).toMatch(/^[0-9A-F:]+$/)
    })

    it('should generate different fingerprints for different keys', async () => {
      const anotherKeyPair = await crypto.generateKeyPair()
      const fingerprint1 = await crypto.getKeyFingerprint(userKeyPair.publicKey)
      const fingerprint2 = await crypto.getKeyFingerprint(anotherKeyPair.publicKey)
      
      expect(fingerprint1).not.toBe(fingerprint2)
    })

    it('should generate short fingerprints', async () => {
      const shortFingerprint = await crypto.getShortFingerprint(userKeyPair.publicKey)
      
      expect(shortFingerprint).toBeDefined()
      expect(shortFingerprint.length).toBe(12)
      expect(shortFingerprint).toMatch(/^[0-9A-F]+$/)
    })
  })

  describe('Message Signing and Verification', () => {
    it('should sign and verify messages', async () => {
      const identityKeyPair = await crypto.generateIdentityKeyPair()
      const message = 'Important message'
      
      const signature = await crypto.signData(message, identityKeyPair.privateKey)
      expect(signature).toBeDefined()
      
      const isValid = await crypto.verifySignature(
        message,
        signature,
        identityKeyPair.publicKey
      )
      expect(isValid).toBe(true)
    })

    it('should fail verification with wrong signature', async () => {
      const identityKeyPair = await crypto.generateIdentityKeyPair()
      const message = 'Important message'
      
      const signature = await crypto.signData(message, identityKeyPair.privateKey)
      
      const isValid = await crypto.verifySignature(
        'Different message',
        signature,
        identityKeyPair.publicKey
      )
      expect(isValid).toBe(false)
    })

    it('should fail verification with wrong public key', async () => {
      const identityKeyPair = await crypto.generateIdentityKeyPair()
      const wrongKeyPair = await crypto.generateIdentityKeyPair()
      const message = 'Important message'
      
      const signature = await crypto.signData(message, identityKeyPair.privateKey)
      
      const isValid = await crypto.verifySignature(
        message,
        signature,
        wrongKeyPair.publicKey
      )
      expect(isValid).toBe(false)
    })
  })

  describe('Data Integrity', () => {
    it('should hash data consistently', async () => {
      const data = 'Test data'
      const hash1 = await crypto.hashData(data)
      const hash2 = await crypto.hashData(data)
      
      expect(hash1).toBe(hash2)
    })

    it('should verify data integrity', async () => {
      const data = 'Test data'
      const hash = await crypto.hashData(data)
      
      const isValid = await crypto.verifyIntegrity(data, hash)
      expect(isValid).toBe(true)
    })

    it('should fail integrity check for modified data', async () => {
      const data = 'Test data'
      const hash = await crypto.hashData(data)
      
      const isValid = await crypto.verifyIntegrity('Modified data', hash)
      expect(isValid).toBe(false)
    })
  })
})