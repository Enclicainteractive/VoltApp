import { generateSymmetricKey, exportSymmetricKey, importSymmetricKey, encryptMessage, decryptMessage } from '../utils/crypto.js'

const ALGORITHM = 'AES-GCM'
const KEY_LENGTH = 256
const IV_LENGTH = 12
const CHUNK_SIZE = 960

class VoiceEncryptionService {
  constructor() {
    this.activeSessions = new Map()
    this.sessionKeys = new Map()
  }

  async createSession(channelId, participants = []) {
    const sessionId = `voice_${channelId}_${Date.now()}`
    const sessionKey = await generateSymmetricKey()
    const exportedKey = await exportSymmetricKey(sessionKey)

    const session = {
      sessionId,
      channelId,
      sessionKey,
      exportedKey,
      participants: new Set(participants),
      createdAt: Date.now(),
      lastActivity: Date.now()
    }

    this.activeSessions.set(sessionId, session)
    this.sessionKeys.set(channelId, sessionKey)

    console.log(`[VoiceCrypto] Created session ${sessionId} for channel ${channelId}`)
    return session
  }

  async getSession(channelId) {
    return this.sessionKeys.get(channelId)
  }

  async getSessionKey(channelId) {
    return this.sessionKeys.get(channelId)
  }

  async encryptAudioChunk(audioBuffer, channelId) {
    const sessionKey = this.sessionKeys.get(channelId)
    
    if (!sessionKey) {
      throw new Error(`No active session for channel ${channelId}`)
    }

    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
    
    const encrypted = await crypto.subtle.encrypt(
      {
        name: ALGORITHM,
        iv: iv
      },
      sessionKey,
      audioBuffer
    )

    const result = {
      iv: Array.from(iv),
      data: Array.from(new Uint8Array(encrypted)),
      timestamp: Date.now()
    }

    this.updateSessionActivity(channelId)
    return result
  }

  async decryptAudioChunk(encryptedChunk, channelId) {
    const sessionKey = this.sessionKeys.get(channelId)
    
    if (!sessionKey) {
      throw new Error(`No active session for channel ${channelId}`)
    }

    const iv = new Uint8Array(encryptedChunk.iv)
    const data = new Uint8Array(encryptedChunk.data)

    const decrypted = await crypto.subtle.decrypt(
      {
        name: ALGORITHM,
        iv: iv
      },
      sessionKey,
      data
    )

    this.updateSessionActivity(channelId)
    return new Uint8Array(decrypted)
  }

  async encryptSessionKeyForParticipant(sessionKey, participantPublicKey) {
    const exportedKey = await exportSymmetricKey(sessionKey)
    
    const encrypted = await crypto.subtle.encrypt(
      {
        name: 'RSA-OAEP'
      },
      await this.importPublicKey(participantPublicKey),
      new TextEncoder().encode(exportedKey)
    )

    return {
      encryptedKey: Array.from(new Uint8Array(encrypted)),
      algorithm: 'RSA-OAEP'
    }
  }

  async decryptSessionKey(encryptedKeyPackage, privateKey) {
    const encryptedKey = new Uint8Array(encryptedKeyPackage.encryptedKey)
    
    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'RSA-OAEP'
      },
      await this.importPrivateKey(privateKey),
      encryptedKey
    )

    const keyBase64 = new TextDecoder().decode(decrypted)
    return await importSymmetricKey(keyBase64)
  }

  async importPublicKey(publicKeyBase64) {
    const binaryString = atob(publicKeyBase64)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }
    
    return await crypto.subtle.importKey(
      'spki',
      bytes.buffer,
      {
        name: 'RSA-OAEP',
        hash: 'SHA-256'
      },
      true,
      ['encrypt']
    )
  }

  async importPrivateKey(privateKeyBase64) {
    const binaryString = atob(privateKeyBase64)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }
    
    return await crypto.subtle.importKey(
      'pkcs8',
      bytes.buffer,
      {
        name: 'RSA-OAEP',
        hash: 'SHA-256'
      },
      true,
      ['decrypt']
    )
  }

  async addParticipantToSession(channelId, participantId) {
    const session = Array.from(this.activeSessions.values()).find(s => s.channelId === channelId)
    
    if (session) {
      session.participants.add(participantId)
      session.lastActivity = Date.now()
      console.log(`[VoiceCrypto] Added participant ${participantId} to channel ${channelId}`)
    }
  }

  async removeParticipantFromSession(channelId, participantId) {
    const session = Array.from(this.activeSessions.values()).find(s => s.channelId === channelId)
    
    if (session) {
      session.participants.delete(participantId)
      session.lastActivity = Date.now()
      console.log(`[VoiceCrypto] Removed participant ${participantId} from channel ${channelId}`)
    }
  }

  updateSessionActivity(channelId) {
    const session = Array.from(this.activeSessions.values()).find(s => s.channelId === channelId)
    if (session) {
      session.lastActivity = Date.now()
    }
  }

  async endSession(channelId) {
    const session = Array.from(this.activeSessions.values()).find(s => s.channelId === channelId)
    
    if (session) {
      this.activeSessions.delete(session.sessionId)
      this.sessionKeys.delete(channelId)
      console.log(`[VoiceCrypto] Ended session ${session.sessionId} for channel ${channelId}`)
      return true
    }
    
    return false
  }

  async getSessionInfo(channelId) {
    const session = Array.from(this.activeSessions.values()).find(s => s.channelId === channelId)
    
    if (session) {
      return {
        sessionId: session.sessionId,
        channelId: session.channelId,
        participants: Array.from(session.participants),
        createdAt: session.createdAt,
        lastActivity: session.lastActivity,
        isActive: Date.now() - session.lastActivity < 300000
      }
    }
    
    return null
  }

  async getAllActiveSessions() {
    const sessions = []
    
    for (const session of this.activeSessions.values()) {
      sessions.push({
        sessionId: session.sessionId,
        channelId: session.channelId,
        participants: Array.from(session.participants),
        createdAt: session.createdAt,
        lastActivity: session.lastActivity,
        isActive: Date.now() - session.lastActivity < 300000
      })
    }
    
    return sessions
  }

  async cleanupInactiveSessions(maxAge = 300000) {
    const now = Date.now()
    const toRemove = []
    
    for (const [sessionId, session] of this.activeSessions.entries()) {
      if (now - session.lastActivity > maxAge) {
        toRemove.push(sessionId)
      }
    }
    
    for (const sessionId of toRemove) {
      const session = this.activeSessions.get(sessionId)
      this.activeSessions.delete(sessionId)
      this.sessionKeys.delete(session.channelId)
      console.log(`[VoiceCrypto] Cleaned up inactive session ${sessionId}`)
    }
    
    return toRemove.length
  }
}

export const voiceEncryptionService = new VoiceEncryptionService()