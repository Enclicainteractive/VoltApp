import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { voiceEncryptionService } from '../services/voiceEncryption'

describe('Voice Encryption Service', () => {
  const testChannelId = 'voice-channel-123'
  const testParticipants = ['user-1', 'user-2', 'user-3']

  beforeEach(() => {
    voiceEncryptionService.activeSessions.clear()
    voiceEncryptionService.sessionKeys.clear()
  })

  afterEach(async () => {
    await voiceEncryptionService.cleanupInactiveSessions(0)
  })

  describe('Session Management', () => {
    it('should create a new voice session', async () => {
      const session = await voiceEncryptionService.createSession(
        testChannelId,
        testParticipants
      )

      expect(session).toBeDefined()
      expect(session.sessionId).toMatch(/^voice_\d+_\d+$/)
      expect(session.channelId).toBe(testChannelId)
      expect(session.participants.size).toBe(testParticipants.length)
      expect(session.sessionKey).toBeDefined()
    })

    it('should retrieve existing session', async () => {
      const createdSession = await voiceEncryptionService.createSession(
        testChannelId,
        testParticipants
      )
      
      const retrievedSession = await voiceEncryptionService.getSession(testChannelId)
      
      expect(retrievedSession).toBeDefined()
      expect(retrievedSession.sessionId).toBe(createdSession.sessionId)
    })

    it('should retrieve session key', async () => {
      await voiceEncryptionService.createSession(testChannelId, testParticipants)
      
      const sessionKey = await voiceEncryptionService.getSessionKey(testChannelId)
      
      expect(sessionKey).toBeDefined()
    })

    it('should return null for non-existent session', async () => {
      const session = await voiceEncryptionService.getSession('non-existent')
      expect(session).toBeUndefined()
    })

    it('should end a session', async () => {
      await voiceEncryptionService.createSession(testChannelId, testParticipants)
      
      const ended = await voiceEncryptionService.endSession(testChannelId)
      
      expect(ended).toBe(true)
      
      const session = await voiceEncryptionService.getSession(testChannelId)
      expect(session).toBeUndefined()
    })

    it('should return false when ending non-existent session', async () => {
      const ended = await voiceEncryptionService.endSession('non-existent')
      expect(ended).toBe(false)
    })
  })

  describe('Audio Encryption', () => {
    it('should encrypt audio chunk', async () => {
      await voiceEncryptionService.createSession(testChannelId, testParticipants)
      
      const audioBuffer = new Uint8Array([1, 2, 3, 4, 5])
      const encrypted = await voiceEncryptionService.encryptAudioChunk(
        audioBuffer,
        testChannelId
      )

      expect(encrypted).toBeDefined()
      expect(encrypted.iv).toBeDefined()
      expect(encrypted.data).toBeDefined()
      expect(encrypted.data).not.toEqual(Array.from(audioBuffer))
      expect(encrypted.timestamp).toBeDefined()
    })

    it('should decrypt audio chunk', async () => {
      await voiceEncryptionService.createSession(testChannelId, testParticipants)
      
      const originalBuffer = new Uint8Array([1, 2, 3, 4, 5])
      const encrypted = await voiceEncryptionService.encryptAudioChunk(
        originalBuffer,
        testChannelId
      )
      
      const decrypted = await voiceEncryptionService.decryptAudioChunk(
        encrypted,
        testChannelId
      )

      expect(decrypted).toEqual(originalBuffer)
    })

    it('should encrypt and decrypt larger audio chunks', async () => {
      await voiceEncryptionService.createSession(testChannelId, testParticipants)
      
      const originalBuffer = new Uint8Array(1000)
      crypto.getRandomValues(originalBuffer)
      
      const encrypted = await voiceEncryptionService.encryptAudioChunk(
        originalBuffer,
        testChannelId
      )
      
      const decrypted = await voiceEncryptionService.decryptAudioChunk(
        encrypted,
        testChannelId
      )

      expect(decrypted).toEqual(originalBuffer)
    })

    it('should throw error when encrypting without session', async () => {
      const audioBuffer = new Uint8Array([1, 2, 3])
      
      await expect(
        voiceEncryptionService.encryptAudioChunk(audioBuffer, testChannelId)
      ).rejects.toThrow('No active session')
    })

    it('should throw error when decrypting without session', async () => {
      const encryptedChunk = {
        iv: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
        data: [1, 2, 3, 4, 5]
      }
      
      await expect(
        voiceEncryptionService.decryptAudioChunk(encryptedChunk, testChannelId)
      ).rejects.toThrow('No active session')
    })

    it('should produce different ciphertext for same plaintext', async () => {
      await voiceEncryptionService.createSession(testChannelId, testParticipants)
      
      const audioBuffer = new Uint8Array([1, 2, 3, 4, 5])
      
      const encrypted1 = await voiceEncryptionService.encryptAudioChunk(
        audioBuffer,
        testChannelId
      )
      const encrypted2 = await voiceEncryptionService.encryptAudioChunk(
        audioBuffer,
        testChannelId
      )

      expect(encrypted1.iv).not.toEqual(encrypted2.iv)
      expect(encrypted1.data).not.toEqual(encrypted2.data)
    })
  })

  describe('Participant Management', () => {
    it('should add participant to session', async () => {
      await voiceEncryptionService.createSession(testChannelId, ['user-1'])
      
      await voiceEncryptionService.addParticipantToSession(testChannelId, 'user-2')
      
      const sessionInfo = await voiceEncryptionService.getSessionInfo(testChannelId)
      expect(sessionInfo.participants).toContain('user-2')
    })

    it('should remove participant from session', async () => {
      await voiceEncryptionService.createSession(testChannelId, testParticipants)
      
      await voiceEncryptionService.removeParticipantFromSession(testChannelId, 'user-2')
      
      const sessionInfo = await voiceEncryptionService.getSessionInfo(testChannelId)
      expect(sessionInfo.participants).not.toContain('user-2')
    })

    it('should update session activity on operations', async () => {
      const session = await voiceEncryptionService.createSession(testChannelId, testParticipants)
      const initialActivity = session.lastActivity
      
      await new Promise(resolve => setTimeout(resolve, 10))
      await voiceEncryptionService.addParticipantToSession(testChannelId, 'user-4')
      
      const sessionInfo = await voiceEncryptionService.getSessionInfo(testChannelId)
      expect(sessionInfo.lastActivity).toBeGreaterThan(initialActivity)
    })
  })

  describe('Session Information', () => {
    it('should return session info', async () => {
      await voiceEncryptionService.createSession(testChannelId, testParticipants)
      
      const info = await voiceEncryptionService.getSessionInfo(testChannelId)
      
      expect(info).toBeDefined()
      expect(info.channelId).toBe(testChannelId)
      expect(info.participants).toEqual(testParticipants)
      expect(info.createdAt).toBeDefined()
      expect(info.lastActivity).toBeDefined()
      expect(info.isActive).toBe(true)
    })

    it('should return null for non-existent session info', async () => {
      const info = await voiceEncryptionService.getSessionInfo('non-existent')
      expect(info).toBeNull()
    })

    it('should mark inactive sessions', async () => {
      await voiceEncryptionService.createSession(testChannelId, testParticipants)
      
      const session = Array.from(voiceEncryptionService.activeSessions.values())[0]
      session.lastActivity = Date.now() - 400000
      
      const info = await voiceEncryptionService.getSessionInfo(testChannelId)
      expect(info.isActive).toBe(false)
    })

    it('should return all active sessions', async () => {
      await voiceEncryptionService.createSession('channel-1', ['user-1'])
      await voiceEncryptionService.createSession('channel-2', ['user-2'])
      
      const allSessions = await voiceEncryptionService.getAllActiveSessions()
      
      expect(allSessions).toHaveLength(2)
    })
  })

  describe('Session Cleanup', () => {
    it('should cleanup inactive sessions', async () => {
      await voiceEncryptionService.createSession('channel-1', ['user-1'])
      await voiceEncryptionService.createSession('channel-2', ['user-2'])
      
      const session1 = Array.from(voiceEncryptionService.activeSessions.values())[0]
      session1.lastActivity = Date.now() - 400000
      
      const cleaned = await voiceEncryptionService.cleanupInactiveSessions(300000)
      
      expect(cleaned).toBe(1)
      expect(voiceEncryptionService.activeSessions.size).toBe(1)
    })

    it('should not cleanup active sessions', async () => {
      await voiceEncryptionService.createSession('channel-1', ['user-1'])
      
      const cleaned = await voiceEncryptionService.cleanupInactiveSessions(300000)
      
      expect(cleaned).toBe(0)
      expect(voiceEncryptionService.activeSessions.size).toBe(1)
    })
  })

  describe('Multiple Sessions', () => {
    it('should handle multiple concurrent sessions', async () => {
      const channel1 = 'channel-1'
      const channel2 = 'channel-2'
      
      await voiceEncryptionService.createSession(channel1, ['user-1'])
      await voiceEncryptionService.createSession(channel2, ['user-2'])
      
      const audio1 = new Uint8Array([1, 2, 3])
      const audio2 = new Uint8Array([4, 5, 6])
      
      const encrypted1 = await voiceEncryptionService.encryptAudioChunk(audio1, channel1)
      const encrypted2 = await voiceEncryptionService.encryptAudioChunk(audio2, channel2)
      
      const decrypted1 = await voiceEncryptionService.decryptAudioChunk(encrypted1, channel1)
      const decrypted2 = await voiceEncryptionService.decryptAudioChunk(encrypted2, channel2)
      
      expect(decrypted1).toEqual(audio1)
      expect(decrypted2).toEqual(audio2)
    })
  })
})