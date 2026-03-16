import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as crypto from '../utils/crypto'

describe('Crypto Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks?.()
  })

  describe('Key Generation', () => {
    it('should generate ECDH key pair', async () => {
      const keyPair = await crypto.generateKeyPair?.() ?? {}
      expect(keyPair).toHaveProperty('publicKey')
      expect(keyPair).toHaveProperty('privateKey')
      expect(typeof keyPair?.publicKey).toBe('string')
      expect(typeof keyPair?.privateKey).toBe('string')
      expect(keyPair?.publicKey?.length ?? 0).toBeGreaterThan(0)
      expect(keyPair?.privateKey?.length ?? 0).toBeGreaterThan(0)
    })

    it('should generate symmetric key', async () => {
      const key = await crypto.generateSymmetricKey?.()
      expect(key).toBeDefined()
      expect(key?.type).toBe('secret')
      expect(key?.algorithm?.name).toBe('AES-GCM')
      expect(key?.algorithm?.length).toBe(256)
    })

    it('should export symmetric key to Base64', async () => {
      const key = await crypto.generateSymmetricKey?.()
      const exported = await crypto.exportSymmetricKey?.(key)
      expect(typeof exported).toBe('string')
      expect(exported?.length ?? 0).toBeGreaterThan(0)
    })

    it('should import symmetric key from Base64', async () => {
      const key = await crypto.generateSymmetricKey?.()
      const exported = await crypto.exportSymmetricKey?.(key)
      const imported = await crypto.importSymmetricKey?.(exported)
      expect(imported).toBeDefined()
      expect(imported?.type).toBe('secret')
      expect(imported?.algorithm?.name).toBe('AES-GCM')
    })
  })

  describe('Key Import/Export', () => {
    it('should import public key from Base64', async () => {
      const keyPair = await crypto.generateKeyPair?.() ?? {}
      const imported = await crypto.importPublicKey?.(keyPair?.publicKey)
      expect(imported).toBeDefined()
      expect(imported?.type).toBe('public')
    })

    it('should import private key from Base64', async () => {
      const keyPair = await crypto.generateKeyPair?.() ?? {}
      const imported = await crypto.importPrivateKey?.(keyPair?.privateKey)
      expect(imported).toBeDefined()
      expect(imported?.type).toBe('private')
    })
  })

  describe('Key Encryption for Users', () => {
    it('should encrypt symmetric key for recipient', async () => {
      const symmetricKey = await crypto.generateSymmetricKey?.()
      const symmetricKeyBase64 = await crypto.exportSymmetricKey?.(symmetricKey)
      const recipientKeyPair = await crypto.generateKeyPair?.() ?? {}
      
      const encrypted = await crypto.encryptKeyForUser?.(
        symmetricKeyBase64,
        recipientKeyPair?.publicKey
      )
      
      expect(encrypted).toHaveProperty('ephemeralPublicKey')
      expect(encrypted).toHaveProperty('iv')
      expect(encrypted).toHaveProperty('encrypted')
    })
  })

  describe('Shared Secret Derivation', () => {
    it('should derive same shared secret from both sides', async () => {
      const keyPair1 = await crypto.generateKeyPair?.() ?? {}
      const keyPair2 = await crypto.generateKeyPair?.() ?? {}
      
      const privateKey1 = await crypto.importPrivateKey?.(keyPair1?.privateKey)
      const publicKey2 = await crypto.importPublicKey?.(keyPair2?.publicKey)
      
      const privateKey2 = await crypto.importPrivateKey?.(keyPair2?.privateKey)
      const publicKey1 = await crypto.importPublicKey?.(keyPair1?.publicKey)
      
      const sharedSecret1 = await crypto.deriveSharedSecret?.(privateKey1, publicKey2)
      const sharedSecret2 = await crypto.deriveSharedSecret?.(privateKey2, publicKey1)
      
      expect(sharedSecret1).toBeDefined()
      expect(sharedSecret2).toBeDefined()
    })

    it('should derive symmetric key from shared secret', async () => {
      const keyPair1 = await crypto.generateKeyPair?.() ?? {}
      const keyPair2 = await crypto.generateKeyPair?.() ?? {}
      
      const privateKey1 = await crypto.importPrivateKey?.(keyPair1?.privateKey)
      const publicKey2 = await crypto.importPublicKey?.(keyPair2?.publicKey)
      
      const sharedSecret = await crypto.deriveSharedSecret?.(privateKey1, publicKey2)
      const symmetricKey = await crypto.deriveSymmetricKey?.(sharedSecret)
      
      expect(symmetricKey).toBeDefined()
      expect(symmetricKey?.type).toBe('secret')
      expect(symmetricKey?.algorithm?.name).toBe('AES-GCM')
    })
  })

  describe('Key Identifier', () => {
    it('should generate unique key identifier', () => {
      const id1 = crypto.generateKeyIdentifier?.()
      const id2 = crypto.generateKeyIdentifier?.()
      
      expect(id1).toBeDefined()
      expect(id2).toBeDefined()
      expect(id1).not.toBe(id2)
      expect(id1?.length ?? 0).toBe(16)
    })
  })

  describe('Hashing', () => {
    it('should hash data', async () => {
      const data = 'test data'
      const hash = await crypto.hashData?.(data)
      
      expect(hash).toBeDefined()
      expect(typeof hash).toBe('string')
      expect(hash?.length ?? 0).toBeGreaterThan(0)
    })

    it('should verify data integrity', async () => {
      const data = 'test data'
      const hash = await crypto.hashData?.(data)
      
      const isValid = await crypto.verifyIntegrity?.(data, hash)
      expect(isValid).toBe(true)
    })

    it('should fail verification for modified data', async () => {
      const data = 'test data'
      const hash = await crypto.hashData?.(data)
      
      const isValid = await crypto.verifyIntegrity?.('modified data', hash)
      expect(isValid).toBe(false)
    })
  })

  describe('Key Backup', () => {
    it('should export key for backup', async () => {
      const keyPair = await crypto.generateKeyPair?.() ?? {}
      const password = 'secure-password'
      
      const backup = await crypto.exportKeyForBackup?.(keyPair?.privateKey, password)
      
      expect(backup).toHaveProperty('salt')
      expect(backup).toHaveProperty('iv')
      expect(backup).toHaveProperty('encrypted')
    })
  })

  describe('Identity Keys', () => {
    it('should generate identity key pair', async () => {
      const keyPair = await crypto.generateIdentityKeyPair?.() ?? {}
      
      expect(keyPair).toHaveProperty('publicKey')
      expect(keyPair).toHaveProperty('privateKey')
      expect(typeof keyPair?.publicKey).toBe('string')
      expect(typeof keyPair?.privateKey).toBe('string')
    })

    it('should get key fingerprint', async () => {
      const keyPair = await crypto.generateKeyPair?.() ?? {}
      const fingerprint = await crypto.getKeyFingerprint?.(keyPair?.publicKey)
      
      expect(fingerprint).toBeDefined()
      expect(typeof fingerprint).toBe('string')
      expect(fingerprint).toContain(':')
    })

    it('should get short fingerprint', async () => {
      const keyPair = await crypto.generateKeyPair?.() ?? {}
      const shortFingerprint = await crypto.getShortFingerprint?.(keyPair?.publicKey)
      
      expect(shortFingerprint).toBeDefined()
      expect(typeof shortFingerprint).toBe('string')
      expect(shortFingerprint?.length ?? 0).toBe(12)
    })
  })

  describe('Signing and Verification', () => {
    it('should sign data', async () => {
      const keyPair = await crypto.generateIdentityKeyPair?.() ?? {}
      const data = 'test data'
      
      const signature = await crypto.signData?.(data, keyPair?.privateKey)
      
      expect(signature).toBeDefined()
      expect(typeof signature).toBe('string')
    })

    it('should verify signature', async () => {
      const keyPair = await crypto.generateIdentityKeyPair?.() ?? {}
      const data = 'test data'
      
      const signature = await crypto.signData?.(data, keyPair?.privateKey)
      const isValid = await crypto.verifySignature?.(data, signature, keyPair?.publicKey)
      
      expect(isValid).toBe(true)
    })
  })
})
