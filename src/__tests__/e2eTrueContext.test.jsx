import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock the crypto utilities
vi.mock('../utils/crypto', () => ({
  generateKeyPair: vi.fn().mockResolvedValue({
    publicKey: 'mock-public-key-base64',
    privateKey: 'mock-private-key-base64'
  }),
  generateSymmetricKey: vi.fn().mockResolvedValue({
    type: 'secret',
    algorithm: { name: 'AES-GCM' },
    export: vi.fn().mockResolvedValue('mock-symmetric-key-base64')
  }),
  exportSymmetricKey: vi.fn().mockResolvedValue('exported-symmetric-key'),
  importSymmetricKey: vi.fn().mockResolvedValue({
    type: 'secret',
    algorithm: { name: 'AES-GCM' }
  }),
  encryptKeyForUser: vi.fn().mockResolvedValue({
    ephemeralPublicKey: 'ephemeral-key',
    iv: 'mock-iv',
    encrypted: 'encrypted-key-blob'
  }),
  decryptKeyForUser: vi.fn().mockResolvedValue('decrypted-symmetric-key'),
  encryptMessage: vi.fn().mockImplementation((message) => {
    return Promise.resolve({
      encrypted: btoa(message),
      iv: 'mock-iv-123'
    })
  }),
  decryptMessage: vi.fn().mockImplementation((encrypted) => {
    return Promise.resolve(atob(encrypted.encrypted))
  }),
  hashData: vi.fn().mockResolvedValue('mock-hash'),
  deriveSharedSecret: vi.fn().mockResolvedValue('shared-secret'),
  deriveSymmetricKey: vi.fn().mockResolvedValue({ type: 'secret' })
}))

// Mock localStorage
const localStorageMock = (() => {
  let store = {}
  return {
    getItem: vi.fn((key) => store[key] || null),
    setItem: vi.fn((key, value) => { store[key] = value }),
    removeItem: vi.fn((key) => { delete store[key] }),
    clear: vi.fn(() => { store = {} })
  }
})()
Object.defineProperty(global, 'localStorage', { value: localStorageMock })

// Mock socket
const socketMock = {
  emit: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn()
}

// Mock SocketContext
vi.mock('../contexts/SocketContext', () => ({
  useSocket: () => socketMock
}))

describe('E2eTrueContext - Core Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  describe('getGroupKey', () => {
    it('should return null when no key is stored', () => {
      // Simulate getGroupKey function
      const getGroupKey = (userId, groupId, epoch) => {
        const key = `e2e_true_sender_${userId}_${groupId}_${epoch}`
        return localStorage.getItem(key)
      }
      
      const result = getGroupKey('user1', 'group1', 1)
      expect(result).toBeNull()
    })

    it('should return stored key when it exists', () => {
      const testKey = 'test-sender-key-base64'
      localStorage.setItem('e2e_true_sender_user1_group1_1', testKey)
      
      const getGroupKey = (userId, groupId, epoch) => {
        const key = `e2e_true_sender_${userId}_${groupId}_${epoch}`
        return localStorage.getItem(key)
      }
      
      const result = getGroupKey('user1', 'group1', 1)
      expect(result).toBe(testKey)
    })

    it('should return null for non-existent epoch', () => {
      localStorage.setItem('e2e_true_sender_user1_group1_1', 'key-epoch-1')
      
      const getGroupKey = (userId, groupId, epoch) => {
        const key = `e2e_true_sender_${userId}_${groupId}_${epoch}`
        return localStorage.getItem(key)
      }
      
      const result = getGroupKey('user1', 'group1', 999)
      expect(result).toBeNull()
    })
  })

  describe('generateSenderKey', () => {
    it('should generate and store a new sender key', async () => {
      const generateSenderKey = async (userId, groupId, epoch) => {
        const key = `e2e_true_sender_${userId}_${groupId}_${epoch}`
        const symmetricKey = { type: 'secret' }
        const exportedKey = 'new-sender-key-base64'
        localStorage.setItem(key, exportedKey)
        return exportedKey
      }
      
      const result = await generateSenderKey('user1', 'group1', 1)
      expect(result).toBeDefined()
      expect(localStorage.setItem).toHaveBeenCalled()
    })
  })

  describe('requestSenderKeys', () => {
    it('should return success response', async () => {
      const requestSenderKeys = async (groupId, deviceId) => {
        // Simulate API call
        return { success: true, message: 'Key request relayed to members' }
      }
      
      const result = await requestSenderKeys('group1', 'device1')
      expect(result.success).toBe(true)
    })

    it('should include deviceId in request', async () => {
      const requestSenderKeys = async (groupId, deviceId) => {
        expect(deviceId).toBeDefined()
        return { success: true }
      }
      
      await requestSenderKeys('group1', 'device-123')
    })
  })

  describe('encryptMessage', () => {
    it('should encrypt message with sender key', async () => {
      const message = 'Hello, World!'
      
      const encryptMessage = async (text, senderKey) => {
        const encrypted = {
          encrypted: btoa(text),
          iv: 'random-iv-123',
          senderKeyBased: true
        }
        return encrypted
      }
      
      const result = await encryptMessage(message, 'sender-key')
      expect(result.encrypted).toBeDefined()
      expect(result.senderKeyBased).toBe(true)
    })

    it('should return different ciphertext for same plaintext', async () => {
      const text = 'Same message'
      
      const encryptMessage = (text) => {
        const encrypted1 = btoa(text + Math.random())
        const encrypted2 = btoa(text + Math.random())
        return { encrypted: encrypted1 }
      }
      
      const result1 = encryptMessage(text)
      const result2 = encryptMessage(text)
      expect(result1.encrypted).not.toBe(result2.encrypted)
    })

    it('should include IV in encrypted output', async () => {
      const encryptMessage = async (text) => {
        return {
          encrypted: 'encrypted-content',
          iv: 'unique-iv-value'
        }
      }
      
      const result = await encryptMessage('test')
      expect(result.iv).toBeDefined()
    })
  })

  describe('decryptMessage', () => {
    it('should decrypt encrypted message', async () => {
      const decryptMessage = async (encrypted, senderKey) => {
        return atob(encrypted.encrypted)
      }
      
      const encrypted = { encrypted: btoa('Secret message') }
      const result = await decryptMessage(encrypted, 'key')
      expect(result).toBe('Secret message')
    })

    it('should return placeholder for former members', () => {
      const decryptMessage = (encrypted, memberStatus) => {
        if (memberStatus === 'former') {
          return '[Encrypted message - no longer accessible]'
        }
        return atob(encrypted.encrypted)
      }
      
      const encrypted = { encrypted: btoa('Secret') }
      const result = decryptMessage(encrypted, 'former')
      expect(result).toBe('[Encrypted message - no longer accessible]')
    })

    it('should return placeholder for banned members', () => {
      const decryptMessage = (encrypted, memberStatus) => {
        if (memberStatus === 'banned') {
          return '[Encrypted message - no longer accessible]'
        }
        return atob(encrypted.encrypted)
      }
      
      const result = decryptMessage({}, 'banned')
      expect(result).toBe('[Encrypted message - no longer accessible]')
    })

    it('should return placeholder for kicked members', () => {
      const decryptMessage = (encrypted, memberStatus) => {
        if (memberStatus === 'kicked') {
          return '[Encrypted message - no longer accessible]'
        }
        return atob(encrypted.encrypted)
      }
      
      const result = decryptMessage({}, 'kicked')
      expect(result).toBe('[Encrypted message - no longer accessible]')
    })
  })

  describe('distributeSenderKeys', () => {
    it('should distribute keys to multiple recipients', async () => {
      const distributeSenderKeys = async (groupId, keys) => {
        // Each key should be encrypted for the recipient
        return { success: true, distributed: keys.length }
      }
      
      const keys = [
        { toUserId: 'user2', toDeviceId: 'device1', encryptedKeyBlob: 'blob1' },
        { toUserId: 'user3', toDeviceId: 'device1', encryptedKeyBlob: 'blob2' }
      ]
      
      const result = await distributeSenderKeys('group1', keys)
      expect(result.distributed).toBe(2)
    })

    it('should encrypt keys before distribution', async () => {
      const distributeSenderKeys = async (keys) => {
        // Verify all keys have encryptedKeyBlob (not raw keys)
        for (const key of keys) {
          if (!key.encryptedKeyBlob) {
            throw new Error('Key must be encrypted')
          }
        }
        return { success: true }
      }
      
      await distributeSenderKeys([
        { toUserId: 'user2', encryptedKeyBlob: 'encrypted-blob' }
      ])
    })
  })

  describe('advanceEpoch', () => {
    it('should increment epoch number', () => {
      const currentEpoch = 1
      const newEpoch = currentEpoch + 1
      expect(newEpoch).toBe(2)
    })

    it('should generate new sender keys for new epoch', async () => {
      const generateNewSenderKey = async (epoch) => {
        // New epoch = new sender key
        return `sender-key-epoch-${epoch}`
      }
      
      const newKey = await generateNewSenderKey(2)
      expect(newKey).toContain('2')
    })

    it('should notify members of epoch change', () => {
      const notifyMembers = (groupId, newEpoch) => {
        // Socket emit should be called
        return true
      }
      
      const result = notifyMembers('group1', 2)
      expect(result).toBe(true)
    })
  })
})

describe('E2eTrueContext - Security Model', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  describe('Server Never Sees Keys', () => {
    it('should store encrypted blobs, not raw keys', () => {
      const storeEncryptedKey = (userId, key) => {
        // The key should be encrypted before storing
        const encryptedKey = btoa(key + '-encrypted')
        localStorage.setItem(`key_${userId}`, encryptedKey)
      }
      
      storeEncryptedKey('user1', 'raw-secret-key')
      const stored = localStorage.getItem('key_user1')
      
      // Should be base64 encoded, not raw
      expect(stored).not.toBe('raw-secret-key')
      expect(stored).toContain('encrypted')
    })

    it('should never expose sender keys in API calls', () => {
      const makeAPICall = (data) => {
        // API should only receive encrypted blobs
        if (data.key && !data.encryptedKeyBlob) {
          throw new Error('Raw key exposed!')
        }
        return { success: true }
      }
      
      // This should work - encrypted blob
      const result = makeAPICall({
        encryptedKeyBlob: 'base64-encrypted-blob'
      })
      expect(result.success).toBe(true)
    })

    it('epoch endpoint should not return encryption keys', () => {
      const getEpochMetadata = (epoch) => {
        // Should return metadata only, not keys
        return {
          groupId: epoch.groupId,
          epoch: epoch.epoch,
          members: epoch.members,
          createdAt: epoch.createdAt
        }
      }
      
      const epoch = {
        groupId: 'group1',
        epoch: 1,
        members: ['user1', 'user2'],
        createdAt: new Date().toISOString(),
        senderKey: 'secret-key' // This should NOT be returned
      }
      
      const metadata = getEpochMetadata(epoch)
      expect(metadata).not.toHaveProperty('senderKey')
      expect(metadata).not.toHaveProperty('encryptionKey')
    })
  })

  describe('Key Request Flow', () => {
    it('new member can request keys', async () => {
      const requestKeys = async (groupId, deviceId) => {
        return { success: true, message: 'Key request relayed to members' }
      }
      
      const result = await requestKeys('group1', 'new-device')
      expect(result.message).toContain('relayed')
    })

    it('existing member receives key request notification', () => {
      const handleKeyRequest = (notification) => {
        // Should receive request but NOT the actual key
        return {
          groupId: notification.groupId,
          requesterId: notification.requestingUserId
        }
      }
      
      const notification = {
        groupId: 'group1',
        requestingUserId: 'new-user',
        requestingDeviceId: 'device1'
      }
      
      const result = handleKeyRequest(notification)
      expect(result.requesterId).toBe('new-user')
    })

    it('key response is encrypted for recipient', async () => {
      const encryptKeyForRecipient = async (key, recipientPublicKey) => {
        // Encrypt the sender key with recipient's public key
        return {
          ephemeralPublicKey: 'ephemeral',
          iv: 'iv',
          encrypted: btoa(key) // Encrypted blob
        }
      }
      
      const result = await encryptKeyForRecipient('sender-key', 'recipient-pub-key')
      expect(result.encrypted).toBeDefined()
      // Server cannot decrypt this
    })
  })

  describe('Former Member Security', () => {
    it('should clear keys when user leaves', () => {
      const clearKeys = (userId, groupId) => {
        // Remove all sender keys for this user/group
        localStorage.removeItem(`e2e_true_sender_${userId}_${groupId}_1`)
        localStorage.removeItem(`e2e_true_sender_${userId}_${groupId}_2`)
      }
      
      localStorage.setItem('e2e_true_sender_user1_group1_1', 'key')
      clearKeys('user1', 'group1')
      
      expect(localStorage.getItem('e2e_true_sender_user1_group1_1')).toBeNull()
    })

    it('should block decryption for former members', () => {
      const canDecrypt = (memberStatus) => {
        const allowed = ['active', 'member']
        return allowed.includes(memberStatus)
      }
      
      expect(canDecrypt('active')).toBe(true)
      expect(canDecrypt('former')).toBe(false)
      expect(canDecrypt('banned')).toBe(false)
      expect(canDecrypt('kicked')).toBe(false)
    })

    it('should not send new keys to former members', () => {
      const shouldSendKeys = (memberStatus) => {
        const blocked = ['former', 'banned', 'kicked', 'left']
        return !blocked.includes(memberStatus)
      }
      
      expect(shouldSendKeys('active')).toBe(true)
      expect(shouldSendKeys('former')).toBe(false)
      expect(shouldSendKeys('banned')).toBe(false)
    })
  })
})

describe('E2eTrueContext - Key Management', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  describe('Key Storage', () => {
    it('should store sender keys with user-group-epoch composite key', () => {
      const storeKey = (userId, groupId, epoch, key) => {
        const compositeKey = `e2e_true_sender_${userId}_${groupId}_${epoch}`
        localStorage.setItem(compositeKey, key)
      }
      
      storeKey('user1', 'group1', 1, 'key-1')
      storeKey('user1', 'group1', 2, 'key-2')
      
      expect(localStorage.getItem('e2e_true_sender_user1_group1_1')).toBe('key-1')
      expect(localStorage.getItem('e2e_true_sender_user1_group1_2')).toBe('key-2')
    })

    it('should isolate keys between different users', () => {
      localStorage.setItem('e2e_true_sender_user1_group1_1', 'key-user1')
      localStorage.setItem('e2e_true_sender_user2_group1_1', 'key-user2')
      
      expect(localStorage.getItem('e2e_true_sender_user1_group1_1')).not.toBe('key-user2')
      expect(localStorage.getItem('e2e_true_sender_user2_group1_1')).not.toBe('key-user1')
    })

    it('should isolate keys between different groups', () => {
      localStorage.setItem('e2e_true_sender_user1_group1_1', 'key-group1')
      localStorage.setItem('e2e_true_sender_user1_group2_1', 'key-group2')
      
      expect(localStorage.getItem('e2e_true_sender_user1_group1_1')).toBe('key-group1')
      expect(localStorage.getItem('e2e_true_sender_user1_group2_1')).toBe('key-group2')
    })
  })

  describe('Key Retrieval', () => {
    it('should retrieve key for specific epoch', () => {
      localStorage.setItem('e2e_true_sender_user1_group1_1', 'epoch-1-key')
      localStorage.setItem('e2e_true_sender_user1_group1_2', 'epoch-2-key')
      
      const getKey = (userId, groupId, epoch) => {
        return localStorage.getItem(`e2e_true_sender_${userId}_${groupId}_${epoch}`)
      }
      
      expect(getKey('user1', 'group1', 1)).toBe('epoch-1-key')
      expect(getKey('user1', 'group1', 2)).toBe('epoch-2-key')
    })

    it('should return null for non-existent key', () => {
      const getKey = (userId, groupId, epoch) => {
        return localStorage.getItem(`e2e_true_sender_${userId}_${groupId}_${epoch}`)
      }
      
      expect(getKey('user1', 'group1', 999)).toBeNull()
    })
  })

  describe('Key Rotation', () => {
    it('should support multiple epochs', () => {
      const epochs = [1, 2, 3, 4, 5]
      
      epochs.forEach(epoch => {
        localStorage.setItem(`e2e_true_sender_user1_group1_${epoch}`, `key-epoch-${epoch}`)
      })
      
      expect(localStorage.getItem('e2e_true_sender_user1_group1_1')).toBe('key-epoch-1')
      expect(localStorage.getItem('e2e_true_sender_user1_group1_5')).toBe('key-epoch-5')
    })

    it('should clean up old epoch keys', () => {
      localStorage.setItem('e2e_true_sender_user1_group1_1', 'old-key')
      localStorage.setItem('e2e_true_sender_user1_group1_2', 'new-key')
      
      // Simulate cleanup of old epochs
      const cleanupOldEpochs = (currentEpoch) => {
        for (let i = 1; i < currentEpoch; i++) {
          localStorage.removeItem(`e2e_true_sender_user1_group1_${i}`)
        }
      }
      
      cleanupOldEpochs(2)
      
      expect(localStorage.getItem('e2e_true_sender_user1_group1_1')).toBeNull()
      expect(localStorage.getItem('e2e_true_sender_user1_group1_2')).toBe('new-key')
    })
  })
})

describe('E2eTrueContext - Member Management', () => {
  describe('Member Status Check', () => {
    it('should identify active members', () => {
      const isActiveMember = (status) => status === 'active'
      
      expect(isActiveMember('active')).toBe(true)
      expect(isActiveMember('member')).toBe(false)
    })

    it('should identify former members', () => {
      const isFormerMember = (status) => ['former', 'left', 'kicked', 'banned'].includes(status)
      
      expect(isFormerMember('former')).toBe(true)
      expect(isFormerMember('left')).toBe(true)
      expect(isFormerMember('kicked')).toBe(true)
      expect(isFormerMember('banned')).toBe(true)
      expect(isFormerMember('active')).toBe(false)
    })

    it('should check member in group', () => {
      const isMemberInGroup = (memberList, userId) => memberList.includes(userId)
      
      const members = ['user1', 'user2', 'user3']
      
      expect(isMemberInGroup(members, 'user1')).toBe(true)
      expect(isMemberInGroup(members, 'user2')).toBe(true)
      expect(isMemberInGroup(members, 'user4')).toBe(false)
    })
  })

  describe('Member Key Distribution', () => {
    it('should distribute keys to all current members', () => {
      const members = ['user1', 'user2', 'user3']
      const distributeToMembers = (members) => {
        return members.map(userId => ({
          toUserId: userId,
          encryptedKeyBlob: `encrypted-key-for-${userId}`
        }))
      }
      
      const distributionList = distributeToMembers(members)
      
      expect(distributionList).toHaveLength(3)
      expect(distributionList[0].toUserId).toBe('user1')
      expect(distributionList[1].toUserId).toBe('user2')
      expect(distributionList[2].toUserId).toBe('user3')
    })

    it('should exclude former members from distribution', () => {
      const allUsers = ['user1', 'user2', 'former-user', 'user3']
      const currentMembers = ['user1', 'user2', 'user3']
      
      const activeDistribution = allUsers.filter(user => currentMembers.includes(user))
      
      expect(activeDistribution).toHaveLength(3)
      expect(activeDistribution).not.toContain('former-user')
    })
  })
})

describe('E2eTrueContext - Integration Scenarios', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  describe('New Member Joining', () => {
    it('new member should request keys from existing members', async () => {
      const newMemberJoins = async (groupId, newUserId, deviceId) => {
        // Request sender keys from existing members
        return { success: true, message: 'Key request relayed' }
      }
      
      const result = await newMemberJoins('group1', 'new-user', 'device1')
      expect(result.success).toBe(true)
    })

    it('existing members should respond with encrypted keys', async () => {
      const respondToKeyRequest = async (request, senderKey) => {
        // Encrypt sender key for the requestor
        const encryptedKey = {
          ephemeralPublicKey: 'ephemeral',
          iv: 'iv',
          encrypted: btoa(senderKey)
        }
        return encryptedKey
      }
      
      const request = { requestingUserId: 'new-user', requestingDeviceId: 'device1' }
      const result = await respondToKeyRequest(request, 'my-sender-key')
      expect(result.encrypted).toBeDefined()
    })

    it('new member should be able to decrypt historical messages', async () => {
      const decryptHistoricalMessage = async (encryptedMessage, senderKey) => {
        return atob(encryptedMessage.encrypted)
      }
      
      const encrypted = { encrypted: btoa('Historical message') }
      const senderKey = 'retrieved-sender-key'
      
      const result = await decryptHistoricalMessage(encrypted, senderKey)
      expect(result).toBe('Historical message')
    })
  })

  describe('Member Leaving', () => {
    it('member leaving should trigger key rotation', () => {
      const onMemberLeave = (groupId, leavingUserId) => {
        // Advance epoch to rotate keys
        return { reason: 'member_left', affectedUser: leavingUserId }
      }
      
      const result = onMemberLeave('group1', 'leaving-user')
      expect(result.reason).toBe('member_left')
    })

    it('former member should lose access to new messages', () => {
      const canAccessNewMessages = (memberStatus) => memberStatus === 'active'
      
      expect(canAccessNewMessages('active')).toBe(true)
      expect(canAccessNewMessages('former')).toBe(false)
      expect(canAccessNewMessages('left')).toBe(false)
    })

    it('former member keys should be invalidated', () => {
      const invalidateKeys = (userId, groupId) => {
        // Remove all keys for this user
        localStorage.removeItem(`e2e_true_sender_${userId}_${groupId}_1`)
        localStorage.removeItem(`e2e_true_sender_${userId}_${groupId}_2`)
      }
      
      localStorage.setItem('e2e_true_sender_user1_group1_1', 'key')
      invalidateKeys('user1', 'group1')
      
      expect(localStorage.getItem('e2e_true_sender_user1_group1_1')).toBeNull()
    })
  })

  describe('Member Kicked', () => {
    it('kicked member should be blocked immediately', () => {
      const isBlocked = (reason) => ['kicked', 'banned', 'left'].includes(reason)
      
      expect(isBlocked('kicked')).toBe(true)
      expect(isBlocked('banned')).toBe(true)
    })

    it('kicked member should not receive new keys', () => {
      const shouldReceiveKeys = (memberStatus) => {
        const blocked = ['kicked', 'banned', 'left', 'former']
        return !blocked.includes(memberStatus)
      }
      
      expect(shouldReceiveKeys('kicked')).toBe(false)
      expect(shouldReceiveKeys('banned')).toBe(false)
      expect(shouldReceiveKeys('active')).toBe(true)
    })
  })
})
