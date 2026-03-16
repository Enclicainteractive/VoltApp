import { openDB } from 'idb'

const DB_NAME = 'VoltChatKeys'
const DB_VERSION = 1
const STORE_NAME = 'keys'

const ALGORITHM = 'AES-GCM'
const KEY_LENGTH = 256
const SALT_LENGTH = 16
const IV_LENGTH = 12
const PBKDF2_ITERATIONS = 100000

let db = null

async function getDB() {
  if (!db) {
    db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        }
      }
    })
  }
  return db
}

async function deriveKey(password, salt) {
  const encoder = new TextEncoder()
  const passwordBuffer = encoder.encode(password)

  const baseKey = await crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    'PBKDF2',
    false,
    ['deriveKey']
  )

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    baseKey,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  )
}

async function encryptData(data, key) {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const encoder = new TextEncoder()
  
  const prefix = 'VOLTCHAT:'
  const dataWithPrefix = prefix + data
  const dataBuffer = encoder.encode(dataWithPrefix)

  const encrypted = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    dataBuffer
  )

  return {
    iv: Array.from(iv),
    data: Array.from(new Uint8Array(encrypted))
  }
}

async function decryptData(encryptedData, key) {
  const iv = new Uint8Array(encryptedData.iv)
  const data = new Uint8Array(encryptedData.data)

  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    key,
    data
  )

  const decoder = new TextDecoder()
  const decryptedText = decoder.decode(decrypted)
  
  const prefix = 'VOLTCHAT:'
  if (!decryptedText.startsWith(prefix)) {
    throw new Error('Invalid decryption - wrong password or corrupted data')
  }
  
  return decryptedText.slice(prefix.length)
}

export const keySyncService = {
  async initialize(userId) {
    const database = await getDB()
    const existing = await database.get(STORE_NAME, `user_${userId}`)
    
    if (!existing) {
      const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
      await database.put(STORE_NAME, {
        id: `user_${userId}`,
        userId,
        salt: Array.from(salt),
        keys: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
    }
    
    return true
  },

  async storePrivateKey(userId, serverId, privateKey, password) {
    const database = await getDB()
    const userData = await database.get(STORE_NAME, `user_${userId}`)
    
    if (!userData) {
      throw new Error('User not initialized')
    }

    const salt = new Uint8Array(userData.salt)
    const key = await deriveKey(password, salt)
    
    const encrypted = await encryptData(privateKey, key)
    
    userData.keys[serverId] = {
      encryptedPrivateKey: encrypted,
      updatedAt: new Date().toISOString()
    }
    userData.updatedAt = new Date().toISOString()
    
    await database.put(STORE_NAME, userData)
    return true
  },

  async retrievePrivateKey(userId, serverId, password) {
    const database = await getDB()
    const userData = await database.get(STORE_NAME, `user_${userId}`)
    
    if (!userData || !userData.keys[serverId]) {
      return null
    }

    const salt = new Uint8Array(userData.salt)
    const key = await deriveKey(password, salt)
    
    try {
      const decrypted = await decryptData(userData.keys[serverId].encryptedPrivateKey, key)
      return decrypted
    } catch (err) {
      console.error('[KeySync] Failed to decrypt private key:', err)
      return null
    }
  },

  async storeServerKey(userId, serverId, symmetricKey, password) {
    const database = await getDB()
    const userData = await database.get(STORE_NAME, `user_${userId}`)
    
    if (!userData) {
      throw new Error('User not initialized')
    }

    const salt = new Uint8Array(userData.salt)
    const key = await deriveKey(password, salt)
    
    const encrypted = await encryptData(symmetricKey, key)
    
    userData.keys[serverId] = {
      encryptedPrivateKey: userData.keys[serverId]?.encryptedPrivateKey,
      encryptedSymmetricKey: encrypted,
      updatedAt: new Date().toISOString()
    }
    userData.updatedAt = new Date().toISOString()
    
    await database.put(STORE_NAME, userData)
    return true
  },

  async retrieveServerKey(userId, serverId, password) {
    const database = await getDB()
    const userData = await database.get(STORE_NAME, `user_${userId}`)
    
    if (!userData || !userData.keys[serverId]?.encryptedSymmetricKey) {
      return null
    }

    const salt = new Uint8Array(userData.salt)
    const key = await deriveKey(password, salt)
    
    try {
      const decrypted = await decryptData(userData.keys[serverId].encryptedSymmetricKey, key)
      return decrypted
    } catch (err) {
      console.error('[KeySync] Failed to decrypt server key:', err)
      return null
    }
  },

  async getAllServerKeys(userId, password) {
    const database = await getDB()
    const userData = await database.get(STORE_NAME, `user_${userId}`)
    
    if (!userData) {
      return {}
    }

    const salt = new Uint8Array(userData.salt)
    const key = await deriveKey(password, salt)
    
    const result = {}
    
    for (const [serverId, keyData] of Object.entries(userData.keys)) {
      if (keyData.encryptedSymmetricKey) {
        try {
          const decrypted = await decryptData(keyData.encryptedSymmetricKey, key)
          result[serverId] = decrypted
        } catch (err) {
          console.error(`[KeySync] Failed to decrypt key for ${serverId}:`, err)
        }
      }
    }
    
    return result
  },

  async exportBackup(userId, password) {
    const database = await getDB()
    const userData = await database.get(STORE_NAME, `user_${userId}`)
    
    if (!userData) {
      throw new Error('User not initialized')
    }

    return {
      version: 1,
      userId,
      salt: userData.salt,
      keys: userData.keys,
      exportedAt: new Date().toISOString()
    }
  },

  async importBackup(backupData, password) {
    const database = await getDB()
    
    const userData = {
      id: `user_${backupData.userId}`,
      userId: backupData.userId,
      salt: backupData.salt,
      keys: backupData.keys,
      createdAt: backupData.exportedAt,
      updatedAt: new Date().toISOString()
    }
    
    await database.put(STORE_NAME, userData)
    return true
  },

  async clearUserKeys(userId) {
    const database = await getDB()
    await database.delete(STORE_NAME, `user_${userId}`)
    return true
  },

  async hasKey(userId, serverId) {
    const database = await getDB()
    const userData = await database.get(STORE_NAME, `user_${userId}`)
    return userData?.keys?.[serverId] != null
  }
}