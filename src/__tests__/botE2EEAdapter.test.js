import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { botE2EEAdapter } from '../services/botE2EEAdapter'

describe('Bot E2EE Adapter', () => {
  const testBotId = 'bot-test-123'
  const testBotToken = 'test-bot-token'
  const testPassword = 'test-password-123'

  beforeEach(async () => {
    await botE2EEAdapter.initialize?.()
    await botE2EEAdapter.unregisterBot?.(testBotId)
    // Clear all bot keys (direct access to map for test purposes)
    botE2EEAdapter.botKeys = new Map?.() ?? {}
    // Reset currentBotId
    botE2EEAdapter.currentBotId = null
  })

  afterEach(async () => {
    try {
      await botE2EEAdapter.unregisterBot?.(testBotId)
      // Clear all bot keys (direct access to map for test purposes)
      botE2EEAdapter.botKeys = new Map?.() ?? {}
      // Reset currentBotId
      botE2EEAdapter.currentBotId = null
    } catch (e) {
      // Ignore cleanup errors
    }
  })

  describe('Bot Registration', () => {
    it('should register a new bot', async () => {
      const result = await botE2EEAdapter.registerBot(testBotId, testBotToken)

      expect(result).toBeDefined()
      expect(result?.botId).toBe(testBotId)
      expect(result?.publicKey).toBeDefined()
      expect(result?.publicKey).toMatch(/^[A-Za-z0-9+/=]+$/)
    })

    it('should generate unique public keys for different bots', async () => {
      const bot1 = await botE2EEAdapter.registerBot('bot-1', 'token-1')
      const bot2 = await botE2EEAdapter.registerBot('bot-2', 'token-2')

      expect(bot1?.publicKey).not.toBe(bot2?.publicKey)
    })

    it('should retrieve bot public key', async () => {
      await botE2EEAdapter.registerBot(testBotId, testBotToken)

      const publicKey = await botE2EEAdapter.getBotPublicKey(testBotId)

      expect(publicKey).toBeDefined()
      expect(publicKey).toMatch(/^[A-Za-z0-9+/=]+$/)
    })

    it('should return null for non-existent bot', async () => {
      const publicKey = await botE2EEAdapter.getBotPublicKey('non-existent')
      expect(publicKey).toBeNull()
    })

    it('should get bot info', async () => {
      await botE2EEAdapter.registerBot(testBotId, testBotToken)

      const info = await botE2EEAdapter.getBotInfo(testBotId)

      expect(info).toBeDefined()
      expect(info?.botId).toBe(testBotId)
      expect(info?.publicKey).toBeDefined()
      expect(info?.createdAt).toBeDefined()
      expect(info?.lastUsed).toBeDefined()
    })

    it('should list all registered bots', async () => {
      await botE2EEAdapter.registerBot('bot-1', 'token-1')
      await botE2EEAdapter.registerBot('bot-2', 'token-2')

      const bots = await botE2EEAdapter.getAllRegisteredBots()

      expect(bots?.length ?? 0).toBeGreaterThanOrEqual(2)
      expect(bots?.some?.(b => b?.botId === 'bot-1')).toBe(true)
      expect(bots?.some?.(b => b?.botId === 'bot-2')).toBe(true)
    })

    it('should unregister a bot', async () => {
      await botE2EEAdapter.registerBot(testBotId, testBotToken)

      const unregistered = await botE2EEAdapter.unregisterBot(testBotId)

      expect(unregistered).toBe(true)

      const publicKey = await botE2EEAdapter.getBotPublicKey(testBotId)
      expect(publicKey).toBeNull()
    })
  })

  describe('Bot-to-Bot Encryption', () => {
    it('should encrypt message for bot', async () => {
      await botE2EEAdapter.registerBot('sender-bot', 'sender-token')
      await botE2EEAdapter.registerBot('recipient-bot', 'recipient-token')
      // Set as current bot
      botE2EEAdapter.setCurrentBotId('sender-bot')

      const message = 'Secret bot message'
      const encrypted = await botE2EEAdapter.encryptMessageForBot(
        message,
        'recipient-bot'
      )

      expect(encrypted).toBeDefined()
      expect(encrypted?.encrypted).toBeDefined()
      expect(encrypted?.encryptedKeyPackage).toBeDefined()
      expect(encrypted?.senderBotId).toBe('sender-bot')
      expect(encrypted?.timestamp).toBeDefined()
    })

    it('should decrypt message from bot', async () => {
      await botE2EEAdapter.registerBot('sender-bot', 'sender-token')
      await botE2EEAdapter.registerBot('recipient-bot', 'recipient-token')
      // Set as current bot
      botE2EEAdapter.setCurrentBotId('sender-bot')

      const originalMessage = 'Secret bot message'
      const encrypted = await botE2EEAdapter.encryptMessageForBot(
        originalMessage,
        'recipient-bot'
      )

      const decrypted = await botE2EEAdapter.decryptMessageFromBot(encrypted)

      expect(decrypted).toBe(originalMessage)
    })

    it('should encrypt and decrypt JSON messages', async () => {
      await botE2EEAdapter.registerBot('sender-bot', 'sender-token')
      await botE2EEAdapter.registerBot('recipient-bot', 'recipient-token')
      // Set as current bot
      botE2EEAdapter.setCurrentBotId('sender-bot')

      const originalMessage = { text: 'Hello', data: [1, 2, 3] }
      const encrypted = await botE2EEAdapter.encryptMessageForBot(
        JSON.stringify(originalMessage),
        'recipient-bot'
      )

      const decrypted = await botE2EEAdapter.decryptMessageFromBot(encrypted)

      let parsedDecrypted
      try {
        parsedDecrypted = JSON.parse(decrypted)
      } catch (e) {
        parsedDecrypted = decrypted
      }
      expect(parsedDecrypted).toEqual(originalMessage)
    })

    it('should throw error when encrypting for non-existent bot', async () => {
      await botE2EEAdapter.registerBot('sender-bot', 'sender-token')

      await expect(
        botE2EEAdapter.encryptMessageForBot('message', 'non-existent')
      ).rejects.toThrow('not found or not registered')
    })

    it('should throw error when decrypting from non-existent bot', async () => {
      await botE2EEAdapter.registerBot('recipient-bot', 'recipient-token')

      const encryptedPackage = {
        encrypted: { iv: 'test', encrypted: 'test' },
        encryptedKeyPackage: { iv: [], encrypted: [] },
        senderBotId: 'non-existent'
      }

      await expect(
        botE2EEAdapter.decryptMessageFromBot(encryptedPackage)
      ).rejects.toThrow('not found')
    })

    it('should produce different ciphertext for same message', async () => {
      await botE2EEAdapter.registerBot('sender-bot', 'sender-token')
      await botE2EEAdapter.registerBot('recipient-bot', 'recipient-token')

      const message = 'Test message'
      const encrypted1 = await botE2EEAdapter.encryptMessageForBot(message, 'recipient-bot')
      const encrypted2 = await botE2EEAdapter.encryptMessageForBot(message, 'recipient-bot')

      expect(encrypted1?.encrypted?.encrypted).not.toBe(encrypted2?.encrypted?.encrypted)
    })
  })

  describe('Bot-to-User Encryption', () => {
    it('should encrypt message for user', async () => {
      await botE2EEAdapter.registerBot(testBotId, testBotToken)

      const { generateKeyPair } = await import('../utils/crypto')
      const userKeyPair = await generateKeyPair?.() ?? {}

      const message = 'Message from bot to user'
      const encrypted = await botE2EEAdapter.encryptMessageForUser(
        message,
        userKeyPair?.publicKey
      )

      expect(encrypted).toBeDefined()
      expect(encrypted?.encrypted).toBeDefined()
      expect(encrypted?.encryptedKeyPackage).toBeDefined()
      expect(encrypted?.timestamp).toBeDefined()
    })

    it('should decrypt message from user', async () => {
      await botE2EEAdapter.registerBot(testBotId, testBotToken)

      const { generateKeyPair, encryptMessage, generateSymmetricKey, exportSymmetricKey } = await import('../utils/crypto')
      const userKeyPair = await generateKeyPair?.() ?? {}

      const originalMessage = 'Message from user to bot'
      const sessionKey = await generateSymmetricKey?.()
      const encrypted = await encryptMessage?.(originalMessage, sessionKey) ?? {}
      const exportedKey = await exportSymmetricKey?.(sessionKey)

      const encryptedKeyPackage = await botE2EEAdapter.encryptSessionKeyForUser(
        sessionKey,
        userKeyPair?.publicKey
      )

      const encryptedPackage = {
        encrypted,
        encryptedKeyPackage
      }

      const decrypted = await botE2EEAdapter.decryptMessageFromUser(
        encryptedPackage,
        testBotId
      )

      expect(decrypted).toBe(originalMessage)
    })
  })

  describe('Key Backup and Restore', () => {
    it('should export bot keys with password', async () => {
      await botE2EEAdapter.registerBot(testBotId, testBotToken)

      const backup = await botE2EEAdapter.exportBotKeys(testBotId, testPassword)

      expect(backup).toBeDefined()
      expect(backup?.version).toBe(1)
      expect(backup?.botId).toBe(testBotId)
      expect(backup?.salt).toBeDefined()
      expect(backup?.iv).toBeDefined()
      expect(backup?.encrypted).toBeDefined()
      expect(backup?.exportedAt).toBeDefined()
    })

    it('should import bot keys with password', async () => {
      await botE2EEAdapter.registerBot(testBotId, testBotToken)
      const originalPublicKey = await botE2EEAdapter.getBotPublicKey(testBotId)

      const backup = await botE2EEAdapter.exportBotKeys(testBotId, testPassword)
      await botE2EEAdapter.unregisterBot(testBotId)

      await botE2EEAdapter.importBotKeys(backup, testPassword)

      const restoredPublicKey = await botE2EEAdapter.getBotPublicKey(testBotId)
      expect(restoredPublicKey).toBe(originalPublicKey)
    })

    it('should fail to import with wrong password', async () => {
      await botE2EEAdapter.registerBot(testBotId, testBotToken)

      const backup = await botE2EEAdapter.exportBotKeys(testBotId, testPassword)
      await botE2EEAdapter.unregisterBot(testBotId)

      await expect(
        botE2EEAdapter.importBotKeys(backup, 'wrong-password')
      ).rejects.toThrow()
    })

    it('should throw error when exporting non-existent bot', async () => {
      await expect(
        botE2EEAdapter.exportBotKeys('non-existent', testPassword)
      ).rejects.toThrow('not found')
    })
  })

  describe('Session Key Management', () => {
    it('should create and reuse session keys', async () => {
      await botE2EEAdapter.registerBot('bot-1', 'token-1')
      await botE2EEAdapter.registerBot('bot-2', 'token-2')

      const message1 = 'Message 1'
      const encrypted1 = await botE2EEAdapter.encryptMessageForBot(message1, 'bot-2')

      const message2 = 'Message 2'
      const encrypted2 = await botE2EEAdapter.encryptMessageForBot(message2, 'bot-2')

      const decrypted1 = await botE2EEAdapter.decryptMessageFromBot(encrypted1)
      const decrypted2 = await botE2EEAdapter.decryptMessageFromBot(encrypted2)

      expect(decrypted1).toBe(message1)
      expect(decrypted2).toBe(message2)
    })
  })

  describe('Last Used Tracking', () => {
    it('should update last used timestamp on decrypt', async () => {
      await botE2EEAdapter.registerBot('sender-bot', 'sender-token')
      await botE2EEAdapter.registerBot('recipient-bot', 'recipient-token')

      const infoBefore = await botE2EEAdapter.getBotInfo('recipient-bot')
      const lastUsedBefore = infoBefore?.lastUsed

      await new Promise(resolve => setTimeout(resolve, 10))

      const encrypted = await botE2EEAdapter.encryptMessageForBot('test', 'recipient-bot')
      await botE2EEAdapter.decryptMessageFromBot(encrypted)

      const infoAfter = await botE2EEAdapter.getBotInfo('recipient-bot')
      expect(infoAfter?.lastUsed).toBeGreaterThan(lastUsedBefore ?? 0)
    })
  })

  describe('Multi-Bot Isolation', () => {
    it('should isolate messages between different bot pairs', async () => {
      await botE2EEAdapter.registerBot('bot-1', 'token-1')
      await botE2EEAdapter.registerBot('bot-2', 'token-2')
      await botE2EEAdapter.registerBot('bot-3', 'token-3')

      const message1to2 = 'From bot 1 to 2'
      const message1to3 = 'From bot 1 to 3'

      const encrypted1to2 = await botE2EEAdapter.encryptMessageForBot(message1to2, 'bot-2')
      const encrypted1to3 = await botE2EEAdapter.encryptMessageForBot(message1to3, 'bot-3')

      const decrypted1to2 = await botE2EEAdapter.decryptMessageFromBot(encrypted1to2)
      const decrypted1to3 = await botE2EEAdapter.decryptMessageFromBot(encrypted1to3)

      expect(decrypted1to2).toBe(message1to2)
      expect(decrypted1to3).toBe(message1to3)
    })
  })
})
