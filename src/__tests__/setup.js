import { expect, afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom'
import 'fake-indexeddb/auto'

const encryptionStore = new Map()

Object.defineProperty(global, 'crypto', {
  value: {
    subtle: {
      generateKey: vi.fn(async (algorithm, extractable, keyUsages) => {
        if (algorithm.name === 'ECDH') {
          const keyId = crypto.randomUUID()
          return {
            algorithm: { name: 'ECDH', namedCurve: 'P-256' },
            extractable,
            type: 'public',
            usages: keyUsages,
            publicKey: { type: 'public', extractable: true, _id: keyId + '_pub' },
            privateKey: { type: 'private', extractable: false, _id: keyId + '_priv' }
          }
        }
        if (algorithm.name === 'AES-GCM') {
          const keyId = crypto.randomUUID()
          return {
            algorithm: { name: 'AES-GCM', length: 256 },
            extractable,
            type: 'secret',
            usages: keyUsages,
            _id: keyId
          }
        }
        if (algorithm.name === 'HKDF') {
          const keyId = crypto.randomUUID()
          return {
            algorithm: { name: 'HKDF', hash: 'SHA-256' },
            extractable,
            type: 'secret',
            usages: keyUsages,
            _id: keyId
          }
        }
        if (algorithm.name === 'ECDSA') {
          const keyId = crypto.randomUUID()
          return {
            algorithm: { name: 'ECDSA', namedCurve: 'P-256' },
            extractable,
            type: 'public',
            usages: keyUsages,
            publicKey: { type: 'public', extractable: true, _id: keyId + '_pub' },
            privateKey: { type: 'private', extractable: false, _id: keyId + '_priv' }
          }
        }
        if (algorithm === 'PBKDF2') {
          console.log('[MOCK] PBKDF2 branch hit, keyData type:', typeof keyData, 'isArrayBuffer:', keyData instanceof ArrayBuffer)
          let hash = 0
          if (keyData && keyData.length) {
            for (let i = 0; i < Math.min(keyData.length, 64); i++) {
              const byte = keyData[i] || 0
              hash = ((hash << 5) - hash) + byte
              hash |= 0
            }
          }
          const id = `pbkdf2_${hash}`
          console.log('[MOCK] PBKDF2 returning id:', id)
          return {
            algorithm: { name: 'PBKDF2' },
            extractable,
            type: 'secret',
            usages: keyUsages,
            _id: id
          }
        }
        console.log('[MOCK] PBKDF2 NOT matched, falling through, algorithm:', algorithm)
      }),
      exportKey: vi.fn(async (format, key) => {
        if (format === 'jwk') {
          return {
            kty: 'EC',
            crv: 'P-256',
            x: 'mock_x_value',
            y: 'mock_y_value',
            key_ops: key.usages,
            ext: key.extractable
          }
        }
        if (format === 'raw') {
          const buffer = new Uint8Array(32)
          crypto.getRandomValues(buffer)
          return buffer
        }
        if (format === 'spki' || format === 'pkcs8') {
          const buffer = new Uint8Array(91)
          crypto.getRandomValues(buffer)
          return buffer
        }
        throw new Error('Unsupported format')
      }),
      importKey: vi.fn(async (format, keyData, algorithm, extractable, keyUsages) => {
        if (format === 'raw' && algorithm === 'HKDF') {
          return {
            algorithm: { name: 'HKDF' },
            extractable: false,
            type: 'secret',
            usages: [],
            _id: crypto.randomUUID()
          }
        }
        if (algorithm === 'PBKDF2') {
          let hash = 0
          if (keyData && keyData.length) {
            for (let i = 0; i < Math.min(keyData.length, 64); i++) {
              const byte = keyData[i] || 0
              hash = ((hash << 5) - hash) + byte
              hash |= 0
            }
          }
          return {
            algorithm: { name: 'PBKDF2' },
            extractable,
            type: 'secret',
            usages: keyUsages,
            _id: `pbkdf2_${hash}`
          }
        }
        if (format === 'spki') {
          return {
            algorithm: { name: 'ECDH', namedCurve: 'P-256' },
            extractable: true,
            type: 'public',
            usages: [],
            _id: crypto.randomUUID() + '_pub'
          }
        }
        if (format === 'pkcs8') {
          return {
            algorithm: { name: 'ECDH', namedCurve: 'P-256' },
            extractable: true,
            type: 'private',
            usages: keyUsages,
            _id: crypto.randomUUID() + '_priv'
          }
        }
        if (format === 'raw' && algorithm.name === 'AES-GCM') {
          const keyId = crypto.randomUUID()
          encryptionStore.set(keyId, new Uint8Array(keyData))
          return {
            algorithm: { name: 'AES-GCM', length: 256 },
            extractable: true,
            type: 'secret',
            usages: keyUsages,
            _id: keyId
          }
        }
        if (format === 'pkcs8' && algorithm.name === 'ECDSA') {
          return {
            algorithm: { name: 'ECDSA', namedCurve: 'P-256' },
            extractable: false,
            type: 'private',
            usages: keyUsages,
            _id: crypto.randomUUID() + '_priv'
          }
        }
        if (format === 'spki' && algorithm.name === 'ECDSA') {
          return {
            algorithm: { name: 'ECDSA', namedCurve: 'P-256' },
            extractable: false,
            type: 'public',
            usages: keyUsages,
            _id: crypto.randomUUID() + '_pub'
          }
        }
        return {
          algorithm,
          extractable,
          type: format === 'jwk' ? 'private' : 'secret',
          usages: keyUsages,
          _id: crypto.randomUUID()
        }
      }),
      deriveKey: vi.fn(async (algorithm, baseKey, derivedKeyAlgorithm, extractable, keyUsages) => {
        const baseKeyId = baseKey?._id || 'unknown'
        return {
          algorithm: derivedKeyAlgorithm,
          extractable,
          type: 'secret',
          usages: keyUsages,
          _id: `derived_${baseKeyId}`
        }
      }),
      deriveBits: vi.fn(async (algorithm, baseKey, length) => {
        const bits = new Uint8Array(length / 8)
        crypto.getRandomValues(bits)
        return bits
      }),
      encrypt: vi.fn(async (algorithm, key, data) => {
        const iv = algorithm.iv || new Uint8Array(12)
        const ivKey = Array.from(iv).join(',')
        const dataKey = `${key._id}_${ivKey}`
        encryptionStore.set(dataKey, new Uint8Array(data))
        
        if (algorithm.name === 'ECDH') {
          // For ECDH encryption, just return data with prefix
          const result = new Uint8Array(data.length + 4)
          new DataView(result.buffer).setUint32(0, 0x1234)
          result.set(data, 4)
          return result
        }
        
        // For AES-GCM encryption, just return the data with a simple transformation
        // This allows the decrypt to easily retrieve the original data
        const encrypted = new Uint8Array(data.length + 16)
        encrypted.set(data, 0)
        // Add some dummy auth tag
        encrypted.fill(0x00, data.length, encrypted.length)
        return encrypted
      }),
      decrypt: vi.fn(async (algorithm, key, data) => {
        const iv = algorithm.iv || new Uint8Array(12)
        const ivKey = Array.from(iv).join(',')
        const dataKey = `${key._id}_${ivKey}`
        const originalData = encryptionStore.get(dataKey)
        
        if (algorithm.name === 'ECDH') {
          // For ECDH decryption, strip prefix
          return data.slice(4)
        } else if (algorithm.name === 'AES-GCM') {
          // For AES-GCM decryption, return original data if stored
          if (originalData) {
            return originalData
          }
          // If no stored data, just return data without the dummy tag
          return data.slice(0, -16)
        }
        
        throw new Error('Unsupported algorithm')
      }),
      sign: vi.fn(async (algorithm, key, data) => {
        const signature = new Uint8Array(64)
        crypto.getRandomValues(signature)
        return signature
      }),
      verify: vi.fn(async (algorithm, key, signature, data) => {
        return true
      }),
      digest: vi.fn(async (algorithm, data) => {
        const hash = new Uint8Array(32)
        for (let i = 0; i < Math.min(data.length, 32); i++) {
          hash[i] = data[i]
        }
        return hash
      })
    },
    getRandomValues: vi.fn((array) => {
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256)
      }
      return array
    }),
    randomUUID: vi.fn(() => 'mock-uuid-' + Math.random().toString(36).substr(2, 9))
  },
  writable: true,
  configurable: true
})

afterEach(() => {
  cleanup()
  encryptionStore.clear()
})