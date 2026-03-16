import { generateKeyPair, importPublicKey, importPrivateKey, encryptMessage, decryptMessage, generateSymmetricKey, exportSymmetricKey, importSymmetricKey } from '../utils/crypto.js'
import { openDB } from 'idb'

const DB_NAME = 'VoltBotKeys'
const DB_VERSION = 1
const KEYS_STORE = 'botKeys'
const SESSIONS_STORE = 'sessions'

let db = null

async function getDB() {
  if (!db) {
    db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(KEYS_STORE)) {
          db.createObjectStore(KEYS_STORE, { keyPath: 'botId' })
        }
        if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
          const store = db.createObjectStore(SESSIONS_STORE, { keyPath: 'sessionId' })
          store.createIndex('botId', 'botId', { unique: false })
        }
      }
    })
  }
  return db
}

class BotE2EEAdapter {
  constructor() {
    this.botKeys = new Map()
    this.sessionKeys = new Map()
    this.initialized = false
    this.currentBotId = null
  }

  async initialize() {
    if (this.initialized) {
      return true
    }

    await getDB()
    await this.loadAllBotKeys()
    this.initialized = true
    
    console.log('[BotE2EE] Adapter initialized')
    return true
  }

  async registerBot(botId, botToken) {
    await this.initialize()
    
    const keyPair = await generateKeyPair()
    
    const botData = {
      botId,
      botToken,
      publicKey: keyPair.publicKey,
      privateKey: keyPair.privateKey,
      createdAt: Date.now(),
      lastUsed: Date.now()
    }

    const database = await getDB()
    await database.put(KEYS_STORE, botData)
    
    this.botKeys.set(botId, botData)
    
    // Set as current bot if none is set
    if (!this.currentBotId) {
      this.currentBotId = botId
    }
    
    console.log(`[BotE2EE] Registered bot ${botId}`)
    return {
      botId,
      publicKey: keyPair.publicKey
    }
  }

  async loadBotKey(botId) {
    const database = await getDB()
    const botData = await database.get(KEYS_STORE, botId)
    
    if (botData) {
      this.botKeys.set(botId, botData)
      return botData
    }
    
    return null
  }

  async loadAllBotKeys() {
    const database = await getDB()
    const allBots = await database.getAll(KEYS_STORE)
    
    for (const botData of allBots) {
      this.botKeys.set(botData.botId, botData)
    }
    
    console.log(`[BotE2EE] Loaded ${allBots.length} bot keys`)
  }

  async getBotPublicKey(botId) {
    let botData = this.botKeys.get(botId)
    
    if (!botData) {
      botData = await this.loadBotKey(botId)
    }
    
    return botData?.publicKey || null
  }

  async encryptMessageForBot(message, recipientBotId) {
    await this.initialize()
    
    const recipientPublicKey = await this.getBotPublicKey(recipientBotId)
    
    if (!recipientPublicKey) {
      throw new Error(`Recipient bot ${recipientBotId} not found or not registered`)
    }

    const sessionKey = await this.getOrCreateSessionKey(recipientBotId)
    const encrypted = await encryptMessage(message, sessionKey)
    
    const encryptedKeyPackage = await this.encryptSessionKeyForBot(
      sessionKey,
      recipientPublicKey
    )

    return {
      encrypted,
      encryptedKeyPackage,
      senderBotId: this.getCurrentBotId(),
      timestamp: Date.now()
    }
  }

  async decryptMessageFromBot(encryptedMessagePackage) {
    await this.initialize()
    
    const { encrypted, encryptedKeyPackage, senderBotId } = encryptedMessagePackage
    
    const sessionKey = await this.decryptSessionKeyFromBot(encryptedKeyPackage, senderBotId)
    const decrypted = await decryptMessage(encrypted, sessionKey)
    
    await this.updateLastUsed(senderBotId)
    
    return decrypted
  }

  async encryptMessageForUser(message, userPublicKey) {
    await this.initialize()
    
    const sessionKey = await generateSymmetricKey()
    const encrypted = await encryptMessage(message, sessionKey)
    
    const encryptedKeyPackage = await this.encryptSessionKeyForUser(
      sessionKey,
      userPublicKey
    )

    return {
      encrypted,
      encryptedKeyPackage,
      timestamp: Date.now()
    }
  }

  async decryptMessageFromUser(encryptedMessagePackage, botId) {
    await this.initialize()
    
    const botData = this.botKeys.get(botId)
    
    if (!botData) {
      throw new Error(`Bot ${botId} not found`)
    }

    const { encrypted, encryptedKeyPackage } = encryptedMessagePackage
    
    const sessionKey = await this.decryptSessionKeyForUser(encryptedKeyPackage, botData.privateKey)
    const decrypted = await decryptMessage(encrypted, sessionKey)
    
    await this.updateLastUsed(botId)
    
    return decrypted
  }

  async getOrCreateSessionKey(participantId) {
    let sessionKey = this.sessionKeys.get(participantId)
    
    if (!sessionKey) {
      sessionKey = await generateSymmetricKey()
      this.sessionKeys.set(participantId, sessionKey)
      
      await this.saveSessionKey(participantId, sessionKey)
    }
    
    return sessionKey
  }

  async saveSessionKey(participantId, sessionKey) {
    const database = await getDB()
    const exportedKey = await exportSymmetricKey(sessionKey)
    
    const sessionData = {
      sessionId: `session_${participantId}_${Date.now()}`,
      participantId,
      exportedKey,
      createdAt: Date.now(),
      lastUsed: Date.now()
    }
    
    await database.put(SESSIONS_STORE, sessionData)
  }

  async loadSessionKey(participantId) {
    const database = await getDB()
    const tx = database.transaction(SESSIONS_STORE, 'readonly')
    const index = tx.store.index('botId')
    
    let cursor = await index.openCursor(IDBKeyRange.only(participantId))
    let latestSession = null
    
    while (cursor) {
      const session = cursor.value
      if (!latestSession || session.lastUsed > latestSession.lastUsed) {
        latestSession = session
      }
      cursor = await cursor.continue()
    }
    
    if (latestSession) {
      const sessionKey = await importSymmetricKey(latestSession.exportedKey)
      this.sessionKeys.set(participantId, sessionKey)
      return sessionKey
    }
    
    return null
  }

  async encryptSessionKeyForBot(sessionKey, recipientPublicKey) {
    const exportedKey = await exportSymmetricKey(sessionKey)
    const publicKey = await importPublicKey(recipientPublicKey)
    
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const encoded = new TextEncoder().encode(exportedKey)
    
    const encrypted = await crypto.subtle.encrypt(
      {
        name: 'ECDH',
        public: publicKey
      },
      await this.getEphemeralKeyPair(),
      encoded
    )

    return {
      iv: Array.from(iv),
      encrypted: Array.from(new Uint8Array(encrypted))
    }
  }

  async decryptSessionKeyFromBot(encryptedKeyPackage, senderBotId) {
    const botData = this.botKeys.get(senderBotId)
    
    if (!botData) {
      throw new Error(`Bot ${senderBotId} not found`)
    }

    const iv = new Uint8Array(encryptedKeyPackage.iv)
    const encrypted = new Uint8Array(encryptedKeyPackage.encrypted)
    
    const privateKey = await importPrivateKey(botData.privateKey)
    
    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'ECDH',
        iv: iv
      },
      privateKey,
      encrypted
    )

    const keyBase64 = new TextDecoder().decode(decrypted)
    return await importSymmetricKey(keyBase64)
  }

  async encryptSessionKeyForUser(sessionKey, userPublicKey) {
    const exportedKey = await exportSymmetricKey(sessionKey)
    const publicKey = await importPublicKey(userPublicKey)
    
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const encoded = new TextEncoder().encode(exportedKey)
    
    const encrypted = await crypto.subtle.encrypt(
      {
        name: 'ECDH',
        public: publicKey
      },
      await this.getEphemeralKeyPair(),
      encoded
    )

    return {
      iv: Array.from(iv),
      encrypted: Array.from(new Uint8Array(encrypted))
    }
  }

  async decryptSessionKeyForUser(encryptedKeyPackage, botPrivateKey) {
    const iv = new Uint8Array(encryptedKeyPackage.iv)
    const encrypted = new Uint8Array(encryptedKeyPackage.encrypted)
    
    const privateKey = await importPrivateKey(botPrivateKey)
    
    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'ECDH',
        iv: iv
      },
      privateKey,
      encrypted
    )

    const keyBase64 = new TextDecoder().decode(decrypted)
    return await importSymmetricKey(keyBase64)
  }

  async getEphemeralKeyPair() {
    return await crypto.subtle.generateKey(
      {
        name: 'ECDH',
        namedCurve: 'P-256'
      },
      true,
      ['deriveBits', 'deriveKey']
    )
  }

  async updateLastUsed(botId) {
    const botData = this.botKeys.get(botId)
    if (botData) {
      botData.lastUsed = Date.now() + 1000 // Ensure it's always greater
      
      const database = await getDB()
      await database.put(KEYS_STORE, botData)
    }
  }

  getCurrentBotId() {
    return this.currentBotId
  }
  
  setCurrentBotId(botId) {
    if (this.botKeys.has(botId)) {
      this.currentBotId = botId
    } else {
      throw new Error(`Bot ${botId} not registered`)
    }
  }

  async getBotInfo(botId) {
    const botData = this.botKeys.get(botId)
    
    if (!botData) {
      await this.loadBotKey(botId)
    }
    
    const data = this.botKeys.get(botId)
    
    if (data) {
      return {
        botId: data.botId,
        publicKey: data.publicKey,
        createdAt: data.createdAt,
        lastUsed: data.lastUsed
      }
    }
    
    return null
  }

  async getAllRegisteredBots() {
    const bots = []
    
    for (const [botId, botData] of this.botKeys.entries()) {
      bots.push({
        botId,
        publicKey: botData.publicKey,
        createdAt: botData.createdAt,
        lastUsed: botData.lastUsed
      })
    }
    
    return bots
  }

  async unregisterBot(botId) {
    await this.initialize()
    
    const database = await getDB()
    await database.delete(KEYS_STORE, botId)
    
    this.botKeys.delete(botId)
    
    // Clean up session keys for this bot
    const sessionKeysToRemove = []
    for (const [sessionId, session] of this.sessionKeys.entries()) {
      if (sessionId.startsWith(`bot_${botId}_`)) {
        sessionKeysToRemove.push(sessionId)
      }
    }
    
    for (const sessionId of sessionKeysToRemove) {
      this.sessionKeys.delete(sessionId)
    }
    
    // If we're unregistering the current bot, reset currentBotId
    if (this.currentBotId === botId) {
      this.currentBotId = null
    }
    
    console.log(`[BotE2EE] Unregistered bot ${botId}`)
    return true
  }

  async exportBotKeys(botId, password) {
    const botData = this.botKeys.get(botId)
    
    if (!botData) {
      throw new Error(`Bot ${botId} not found`)
    }

    const salt = crypto.getRandomValues(new Uint8Array(16))
    const passwordBuffer = new TextEncoder().encode(password)
    
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      passwordBuffer,
      'PBKDF2',
      false,
      ['deriveKey']
    )

    const derivedKey = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      {
        name: 'AES-GCM',
        length: 256
      },
      false,
      ['encrypt']
    )

    const iv = crypto.getRandomValues(new Uint8Array(12))
    const encoded = new TextEncoder().encode(JSON.stringify({
      botId: botData.botId,
      publicKey: botData.publicKey,
      privateKey: botData.privateKey
    }))
    
    const encrypted = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      derivedKey,
      encoded
    )

    return {
      version: 1,
      botId,
      salt: Array.from(salt),
      iv: Array.from(iv),
      encrypted: Array.from(new Uint8Array(encrypted)),
      exportedAt: Date.now()
    }
  }

  async importBotKeys(backup, password) {
    const salt = new Uint8Array(backup.salt)
    const iv = new Uint8Array(backup.iv)
    const encrypted = new Uint8Array(backup.encrypted)
    
    const passwordBuffer = new TextEncoder().encode(password)
    
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      passwordBuffer,
      'PBKDF2',
      false,
      ['deriveKey']
    )

    const derivedKey = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      {
        name: 'AES-GCM',
        length: 256
      },
      false,
      ['decrypt']
    )

    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      derivedKey,
      encrypted
    )

    const decoded = new TextDecoder().decode(decrypted)
    const botData = JSON.parse(decoded)
    
    await this.registerBot(botData.botId, '')
    
    const database = await getDB()
    const existingBot = await database.get(KEYS_STORE, botData.botId)
    existingBot.publicKey = botData.publicKey
    existingBot.privateKey = botData.privateKey
    await database.put(KEYS_STORE, existingBot)
    
    this.botKeys.set(botData.botId, existingBot)
    
    console.log(`[BotE2EE] Imported keys for bot ${botData.botId}`)
    return true
  }

  // Server E2EE - use the server's shared symmetric key
  serverKeys = new Map()

  async setServerKey(serverId, symmetricKeyBase64) {
    try {
      const key = await importSymmetricKey(symmetricKeyBase64)
      this.serverKeys.set(serverId, { key, keyBase64: symmetricKeyBase64 })
      console.log(`[BotE2EE] Set server key for ${serverId}`)
      return true
    } catch (err) {
      console.error('[BotE2EE] Failed to set server key:', err)
      return false
    }
  }

  async getServerKey(serverId) {
    const serverKeyData = this.serverKeys.get(serverId)
    if (serverKeyData) return serverKeyData

    // Try to fetch from API
    try {
      const { apiService } = await import('../services/apiService')
      const res = await apiService.getServerAutoKey(serverId)
      if (res?.data?.symmetricKey) {
        await this.setServerKey(serverId, res.data.symmetricKey)
        return this.serverKeys.get(serverId)
      }
    } catch (err) {
      console.error('[BotE2EE] Failed to fetch server key:', err)
    }
    return null
  }

  async isServerEncryptionEnabled(serverId) {
    try {
      const { apiService } = await import('../services/apiService')
      const res = await apiService.getE2eStatus(serverId)
      return res?.data?.enabled || false
    } catch (err) {
      console.error('[BotE2EE] Failed to check server encryption status:', err)
      return false
    }
  }

  async decryptServerMessage(encryptedData, serverId) {
    // First check if encryption is enabled on the server
    const isEnabled = await this.isServerEncryptionEnabled(serverId)
    if (!isEnabled) {
      // If encryption is not enabled, return the content as-is (assuming it's not actually encrypted)
      console.log('[BotE2EE] Server encryption not enabled, treating message as unencrypted')
      if (typeof encryptedData === 'string') {
        return encryptedData
      }
      return encryptedData?.content || JSON.stringify(encryptedData)
    }

    const serverKeyData = await this.getServerKey(serverId)
    if (!serverKeyData) {
      throw new Error('No server key available')
    }

    try {
      return await decryptMessage(encryptedData, serverKeyData.key)
    } catch (err) {
      console.error('[BotE2EE] Failed to decrypt server message:', err)
      throw err
    }
  }

  async encryptServerMessage(message, serverId) {
    // First check if encryption is enabled on the server
    const isEnabled = await this.isServerEncryptionEnabled(serverId)
    if (!isEnabled) {
      console.log('[BotE2EE] Server encryption not enabled, sending unencrypted message')
      return { encrypted: false, content: message }
    }

    const serverKeyData = await this.getServerKey(serverId)
    if (!serverKeyData) {
      throw new Error('No server key available')
    }

    try {
      return await encryptMessage(message, serverKeyData.key)
    } catch (err) {
      console.error('[BotE2EE] Failed to encrypt server message:', err)
      throw err
    }
  }
}

export const botE2EEAdapter = new BotE2EEAdapter()