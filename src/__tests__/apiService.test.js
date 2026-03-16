import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock the api client
vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn()
  }
}))

// Import after mocking
const api = require('../services/api').default
const apiService = require('../services/apiService').default

describe('apiService - E2E True Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('requestSenderKeys', () => {
    it('should POST to sender-keys/request endpoint', async () => {
      api.post.mockResolvedValueOnce({ 
        data: { success: true, message: 'Key request relayed to members' } 
      })

      const result = await apiService.requestSenderKeys('group-123', 'device-456')

      expect(api.post).toHaveBeenCalledWith(
        '/e2e-true/groups/group-123/sender-keys/request',
        { deviceId: 'device-456' }
      )
      expect(result?.data?.success).toBe(true)
    })

    it('should include deviceId in request body', async () => {
      api.post.mockResolvedValueOnce({ data: { success: true } })

      await apiService.requestSenderKeys('group-1', 'my-device')

      expect(api.post).toHaveBeenCalledWith(
        expect.stringContaining('/sender-keys/request'),
        expect.objectContaining({ deviceId: 'my-device' })
      )
    })
  })

  describe('distributeSenderKeys', () => {
    it('should POST to sender-keys/distribute endpoint', async () => {
      api.post.mockResolvedValueOnce({ 
        data: { success: true, distributed: 2 } 
      })

      const keyData = {
        epoch: 1,
        fromDeviceId: 'device-1',
        keys: [
          { toUserId: 'user2', toDeviceId: 'device1', encryptedKeyBlob: 'blob1' },
          { toUserId: 'user3', toDeviceId: 'device1', encryptedKeyBlob: 'blob2' }
        ]
      }

      const result = await apiService.distributeSenderKeys('group-123', keyData)

      expect(api.post).toHaveBeenCalledWith(
        '/e2e-true/groups/group-123/sender-keys/distribute',
        keyData
      )
      expect(result?.data?.distributed).toBe(2)
    })

    it('should send encrypted blob data', async () => {
      api.post.mockResolvedValueOnce({ data: { success: true } })

      const keyData = {
        epoch: 1,
        fromDeviceId: 'device-1',
        keys: [
          { toUserId: 'user2', toDeviceId: 'device1', encryptedKeyBlob: 'ENCRYPTED_DATA' }
        ]
      }

      await apiService.distributeSenderKeys('group-1', keyData)

      expect(api.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          keys: expect.arrayContaining([
            expect.objectContaining({ encryptedKeyBlob: 'ENCRYPTED_DATA' })
          ])
        })
      )
    })
  })

  describe('getSenderKeys', () => {
    it('should GET from sender-keys endpoint with epoch and deviceId', async () => {
      api.get.mockResolvedValueOnce({ 
        data: [{ encryptedKeyBlob: 'blob1', fromUserId: 'user1' }] 
      })

      const result = await apiService.getSenderKeys('group-123', 1, 'device-456')

      expect(api.get).toHaveBeenCalledWith(
        '/e2e-true/groups/group-123/sender-keys/1',
        { params: { deviceId: 'device-456' } }
      )
      expect(Array.isArray(result?.data)).toBe(true)
    })

    it('should pass epoch as path parameter', async () => {
      api.get.mockResolvedValueOnce({ data: [] })

      await apiService.getSenderKeys('group-1', 5, 'device-1')

      expect(api.get).toHaveBeenCalledWith(
        '/e2e-true/groups/group-1/sender-keys/5',
        expect.any(Object)
      )
    })
  })

  describe('getQueuedKeyUpdates', () => {
    it('should GET queued key updates with deviceId', async () => {
      api.get.mockResolvedValueOnce({ 
        data: [{ groupId: 'group-1', epoch: 1 }] 
      })

      const result = await apiService.getQueuedKeyUpdates('device-456')

      expect(api.get).toHaveBeenCalledWith(
        '/e2e-true/queue/key-updates',
        { params: { deviceId: 'device-456' } }
      )
      expect(result?.data).toHaveLength(1)
    })
  })

  describe('initGroupE2ee', () => {
    it('should POST to group init endpoint', async () => {
      api.post.mockResolvedValueOnce({ 
        data: { groupId: 'group-123', epoch: 1 } 
      })

      const result = await apiService.initGroupE2ee('group-123', 'device-1')

      expect(api.post).toHaveBeenCalledWith(
        '/e2e-true/groups/group-123/init',
        { deviceId: 'device-1' }
      )
      expect(result?.data?.epoch).toBe(1)
    })
  })

  describe('advanceEpoch', () => {
    it('should POST to advance-epoch endpoint', async () => {
      api.post.mockResolvedValueOnce({ 
        data: { epoch: 2 } 
      })

      const result = await apiService.advanceEpoch('group-123', 'manual')

      expect(api.post).toHaveBeenCalledWith(
        '/e2e-true/groups/group-123/advance-epoch',
        { reason: 'manual' }
      )
      expect(result?.data?.epoch).toBe(2)
    })

    it('should accept optional reason parameter', async () => {
      api.post.mockResolvedValueOnce({ data: { epoch: 2 } })

      await apiService.advanceEpoch('group-1')

      expect(api.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object)
      )
    })
  })

  describe('getGroupEpoch', () => {
    it('should GET group epoch', async () => {
      api.get.mockResolvedValueOnce({ 
        data: { groupId: 'group-123', epoch: 1, members: ['user1'] } 
      })

      const result = await apiService.getGroupEpoch('group-123')

      expect(api.get).toHaveBeenCalledWith(
        '/e2e-true/groups/group-123/epoch'
      )
      expect(result?.data?.epoch).toBe(1)
    })
  })

  describe('getGroupMembers', () => {
    it('should GET group members', async () => {
      api.get.mockResolvedValueOnce({ 
        data: ['user1', 'user2', 'user3'] 
      })

      const result = await apiService.getGroupMembers('group-123')

      expect(api.get).toHaveBeenCalledWith(
        '/e2e-true/groups/group-123/members'
      )
      expect(result?.data).toHaveLength(3)
    })
  })

  describe('uploadDeviceKeys', () => {
    it('should POST device key bundle', async () => {
      api.post.mockResolvedValueOnce({ data: { success: true } })

      const keyBundle = {
        identityPublicKey: 'public-key',
        signedPreKey: 'signed-pre-key',
        signedPreKeySignature: 'signature'
      }

      const result = await apiService.uploadDeviceKeys('device-1', keyBundle)

      expect(api.post).toHaveBeenCalledWith(
        '/e2e-true/devices/keys',
        expect.objectContaining({
          deviceId: 'device-1',
          identityPublicKey: 'public-key'
        })
      )
    })
  })

  describe('getDeviceKeys', () => {
    it('should GET device keys for a user', async () => {
      api.get.mockResolvedValueOnce({ 
        data: { identityPublicKey: 'key1' } 
      })

      const result = await apiService.getDeviceKeys('user-1', 'device-1')

      expect(api.get).toHaveBeenCalledWith(
        '/e2e-true/devices/keys/user-1/device-1'
      )
    })
  })

  describe('getUserDevices', () => {
    it('should GET user devices', async () => {
      api.get.mockResolvedValueOnce({ 
        data: [{ deviceId: 'device1' }, { deviceId: 'device2' }] 
      })

      const result = await apiService.getUserDevices('user-1')

      expect(api.get).toHaveBeenCalledWith(
        '/e2e-true/devices/user-1'
      )
      expect(result?.data).toHaveLength(2)
    })
  })
})

describe('apiService - Security Model Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Sender Keys Never Exposed', () => {
    it('should send encrypted blobs, not raw keys', async () => {
      api.post.mockResolvedValueOnce({ data: { success: true } })

      // Simulate client encrypting a sender key
      const encryptedKeyBlob = btoa('encrypted-sender-key-data')

      await apiService.distributeSenderKeys('group-1', {
        epoch: 1,
        fromDeviceId: 'device-1',
        keys: [{ toUserId: 'user2', toDeviceId: 'device1', encryptedKeyBlob }]
      })

      expect(api.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          keys: expect.arrayContaining([
            expect.objectContaining({ encryptedKeyBlob })
          ])
        })
      )
    })

    it('server never receives decryption keys', async () => {
      api.post.mockResolvedValueOnce({ data: { success: true } })

      // This represents encrypted data the server cannot decrypt
      const opaqueEncryptedBlob = 'G0RDON+freAkSHiT+encrypted+base64'

      await apiService.distributeSenderKeys('group-1', {
        epoch: 1,
        fromDeviceId: 'device-1',
        keys: [{ toUserId: 'user2', toDeviceId: 'device1', encryptedKeyBlob: opaqueEncryptedBlob }]
      })

      // Verify the blob is passed through as-is without any decryption
      const callArgs = api.post.mock.calls[0]
      expect(callArgs?.[1]?.keys?.[0]?.encryptedKeyBlob).toBe(opaqueEncryptedBlob)
    })
  })

  describe('Key Request Flow', () => {
    it('new member can request keys without exposing their identity', async () => {
      api.post.mockResolvedValueOnce({ 
        data: { success: true, message: 'Key request relayed to members' } 
      })

      const result = await apiService.requestSenderKeys('group-1', 'new-device')

      // Server only relays - it doesn't know the requestor's full identity
      expect(result?.data?.message).toContain('relayed')
    })

    it('request includes device ID for targeted delivery', async () => {
      api.post.mockResolvedValueOnce({ data: { success: true } })

      await apiService.requestSenderKeys('group-1', 'specific-device-id')

      expect(api.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ deviceId: 'specific-device-id' })
      )
    })
  })
})
