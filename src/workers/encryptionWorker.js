let crypto = null

self.importScripts('/src/utils/crypto.js')

self.onmessage = async (e) => {
  const { type, data } = e.data

  try {
    switch (type) {
      case 'RE_ENCRYPT_MESSAGES':
        await handleReEncryptMessages(data)
        break
      case 'ENCRYPT_BATCH':
        await handleEncryptBatch(data)
        break
      case 'DECRYPT_BATCH':
        await handleDecryptBatch(data)
        break
      default:
        throw new Error(`Unknown worker message type: ${type}`)
    }
  } catch (err) {
    self.postMessage({
      type: 'ERROR',
      error: err.message,
      taskId: data?.taskId
    })
  }
}

async function handleReEncryptMessages({ messages, oldKey, newKey, taskId }) {
  const results = []
  const batchSize = 50
  const total = messages.length

  for (let i = 0; i < messages.length; i += batchSize) {
    const batch = messages.slice(i, i + batchSize)
    const batchResults = await Promise.all(
      batch.map(async (message) => {
        try {
          if (!message.encrypted || !message.content) {
            return { id: message.id, success: true, skipped: true }
          }

          const decrypted = await crypto.decryptMessage(
            { encrypted: message.content, iv: message.iv },
            oldKey
          )

          const reEncrypted = await crypto.encryptMessage(decrypted, newKey)

          return {
            id: message.id,
            success: true,
            content: reEncrypted.encrypted,
            iv: reEncrypted.iv
          }
        } catch (err) {
          console.error(`[Worker] Failed to re-encrypt message ${message.id}:`, err)
          return { id: message.id, success: false, error: err.message }
        }
      })
    )

    results.push(...batchResults)

    self.postMessage({
      type: 'PROGRESS',
      taskId,
      progress: Math.min(i + batchSize, total),
      total,
      batchResults
    })
  }

  self.postMessage({
    type: 'COMPLETE',
    taskId,
    results
  })
}

async function handleEncryptBatch({ messages, key, taskId }) {
  const results = []
  const batchSize = 50
  const total = messages.length

  for (let i = 0; i < messages.length; i += batchSize) {
    const batch = messages.slice(i, i + batchSize)
    const batchResults = await Promise.all(
      batch.map(async (message) => {
        try {
          const encrypted = await crypto.encryptMessage(message.content, key)
          return {
            id: message.id,
            success: true,
            content: encrypted.encrypted,
            iv: encrypted.iv
          }
        } catch (err) {
          console.error(`[Worker] Failed to encrypt message ${message.id}:`, err)
          return { id: message.id, success: false, error: err.message }
        }
      })
    )

    results.push(...batchResults)

    self.postMessage({
      type: 'PROGRESS',
      taskId,
      progress: Math.min(i + batchSize, total),
      total,
      batchResults
    })
  }

  self.postMessage({
    type: 'COMPLETE',
    taskId,
    results
  })
}

async function handleDecryptBatch({ messages, key, taskId }) {
  const results = []
  const batchSize = 50
  const total = messages.length

  for (let i = 0; i < messages.length; i += batchSize) {
    const batch = messages.slice(i, i + batchSize)
    const batchResults = await Promise.all(
      batch.map(async (message) => {
        try {
          const decrypted = await crypto.decryptMessage(
            { encrypted: message.content, iv: message.iv },
            key
          )
          return {
            id: message.id,
            success: true,
            content: decrypted
          }
        } catch (err) {
          console.error(`[Worker] Failed to decrypt message ${message.id}:`, err)
          return { id: message.id, success: false, error: err.message }
        }
      })
    )

    results.push(...batchResults)

    self.postMessage({
      type: 'PROGRESS',
      taskId,
      progress: Math.min(i + batchSize, total),
      total,
      batchResults
    })
  }

  self.postMessage({
    type: 'COMPLETE',
    taskId,
    results
  })
}