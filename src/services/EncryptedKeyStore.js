const DB_NAME = 'VoltChatKeyStore'
const DB_VERSION = 1
const STORE_NAME = 'encryptedKeys'

class EncryptedKeyStore {
  constructor() {
    this.db = null
    this.initPromise = null
  }

  async init() {
    if (this.initPromise) {
      return this.initPromise
    }

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = () => {
        console.error('[EncryptedKeyStore] Failed to open database:', request.error)
        reject(request.error)
      }

      request.onsuccess = () => {
        this.db = request.result
        console.log('[EncryptedKeyStore] Database opened successfully')
        resolve(this.db)
      }

      request.onupgradeneeded = (event) => {
        const db = event.target.result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'keyId' })
          store.createIndex('serverId', 'serverId', { unique: false })
          store.createIndex('createdAt', 'createdAt', { unique: false })
          console.log('[EncryptedKeyStore] Created object store:', STORE_NAME)
        }
      }
    })

    return this.initPromise
  }

  async storeKey(keyId, keyData, serverId, metadata = {}) {
    await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)

      const record = {
        keyId,
        encryptedKey: keyData,
        serverId,
        createdAt: Date.now(),
        ...metadata
      }

      const request = store.put(record)

      request.onsuccess = () => {
        console.log('[EncryptedKeyStore] Stored key:', keyId)
        resolve(true)
      }

      request.onerror = () => {
        console.error('[EncryptedKeyStore] Failed to store key:', request.error)
        reject(request.error)
      }
    })
  }

  async retrieveKey(keyId) {
    await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.get(keyId)

      request.onsuccess = () => {
        const result = request.result
        if (result) {
          console.log('[EncryptedKeyStore] Retrieved key:', keyId)
          resolve(result.encryptedKey)
        } else {
          console.log('[EncryptedKeyStore] Key not found:', keyId)
          resolve(null)
        }
      }

      request.onerror = () => {
        console.error('[EncryptedKeyStore] Failed to retrieve key:', request.error)
        reject(request.error)
      }
    })
  }

  async retrieveAllKeysForServer(serverId) {
    await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const index = store.index('serverId')
      const request = index.getAll(serverId)

      request.onsuccess = () => {
        const results = request.result || []
        console.log('[EncryptedKeyStore] Retrieved', results.length, 'keys for server:', serverId)
        resolve(results.map(r => ({ keyId: r.keyId, encryptedKey: r.encryptedKey, metadata: r })))
      }

      request.onerror = () => {
        console.error('[EncryptedKeyStore] Failed to retrieve keys for server:', request.error)
        reject(request.error)
      }
    })
  }

  async deleteKey(keyId) {
    await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.delete(keyId)

      request.onsuccess = () => {
        console.log('[EncryptedKeyStore] Deleted key:', keyId)
        resolve(true)
      }

      request.onerror = () => {
        console.error('[EncryptedKeyStore] Failed to delete key:', request.error)
        reject(request.error)
      }
    })
  }

  async deleteAllKeysForServer(serverId) {
    await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const index = store.index('serverId')
      const request = index.openCursor(IDBKeyRange.only(serverId))

      let deletedCount = 0

      request.onsuccess = (event) => {
        const cursor = event.target.result
        if (cursor) {
          cursor.delete()
          deletedCount++
          cursor.continue()
        } else {
          console.log('[EncryptedKeyStore] Deleted', deletedCount, 'keys for server:', serverId)
          resolve(deletedCount)
        }
      }

      request.onerror = () => {
        console.error('[EncryptedKeyStore] Failed to delete keys for server:', request.error)
        reject(request.error)
      }
    })
  }

  async clearAll() {
    await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.clear()

      request.onsuccess = () => {
        console.log('[EncryptedKeyStore] Cleared all keys')
        resolve(true)
      }

      request.onerror = () => {
        console.error('[EncryptedKeyStore] Failed to clear keys:', request.error)
        reject(request.error)
      }
    })
  }

  async getAllKeyIds() {
    await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.getAllKeys()

      request.onsuccess = () => {
        const results = request.result || []
        console.log('[EncryptedKeyStore] Retrieved', results.length, 'key IDs')
        resolve(results)
      }

      request.onerror = () => {
        console.error('[EncryptedKeyStore] Failed to retrieve key IDs:', request.error)
        reject(request.error)
      }
    })
  }
}

export const encryptedKeyStore = new EncryptedKeyStore()