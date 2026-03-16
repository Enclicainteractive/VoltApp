const ALGORITHM = 'AES-GCM'
const KEY_LENGTH = 256

// Enhanced KDF iterations for better security (PBKDF2)
const PBKDF2_ITERATIONS = 600000

const arrayBufferToBase64 = (buffer) => {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

const base64ToArrayBuffer = (base64) => {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

// Password strength calculation (zxcvbn-style without external dependency)
export const calculatePasswordStrength = (password) => {
  if (!password) return { score: 0, label: 'None', color: '#666', suggestions: [] }
  
  let score = 0
  const suggestions = []
  
  // Length checks
  if (password.length >= 8) score += 1
  if (password.length >= 12) score += 1
  if (password.length >= 16) score += 1
  
  // Character variety checks
  if (/[a-z]/.test(password)) score += 1
  if (/[A-Z]/.test(password)) score += 1
  if (/[0-9]/.test(password)) score += 1
  if (/[^a-zA-Z0-9]/.test(password)) score += 2
  
  // Common pattern penalties
  if (/^(password|123456|qwerty|admin)/i.test(password)) {
    score = Math.max(0, score - 3)
    suggestions.push('Avoid common passwords')
  }
  if (/(.)\1{2,}/.test(password)) {
    score = Math.max(0, score - 1)
    suggestions.push('Avoid repeated characters')
  }
  
  // Sequential character penalties
  if (/(?:abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz|012|123|234|345|456|567|678|789)/i.test(password)) {
    score = Math.max(0, score - 1)
    suggestions.push('Avoid sequential characters')
  }
  
  // Normalize score to 0-4
  score = Math.min(4, Math.max(0, score - 1))
  
  const labels = ['Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong']
  const colors = ['var(--volt-danger)', '#f97316', '#eab308', 'var(--volt-success)', 'var(--volt-success)']
  
  if (password.length < 8) {
    suggestions.push('Use at least 8 characters')
  }
  if (!/[A-Z]/.test(password)) {
    suggestions.push('Add uppercase letters')
  }
  if (!/[0-9]/.test(password)) {
    suggestions.push('Add numbers')
  }
  if (!/[^a-zA-Z0-9]/.test(password)) {
    suggestions.push('Add special characters (!@#$%^&*)')
  }
  
  return {
    score,
    label: labels[score],
    color: colors[score],
    suggestions: suggestions.slice(0, 3)
  }
}

export const hashPassword = async (password) => {
  const msgBuffer = textEncoder.encode(password)
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)
  return arrayBufferToBase64(hashBuffer)
}

// Enhanced key derivation with higher iterations
export const deriveKeyFromPassword = async (password, salt) => {
  const passwordBuffer = textEncoder.encode(password)
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    'PBKDF2',
    false,
    ['deriveKey']
  )
  
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt || crypto.getRandomValues(new Uint8Array(16)),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  )
}

// Password-based encryption with proper KDF parameters stored
export const encryptWithPassword = async (data, password) => {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKeyFromPassword(password, salt)
  
  const dataBuffer = textEncoder.encode(JSON.stringify(data))
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    dataBuffer
  )
  
  return {
    encrypted: arrayBufferToBase64(encryptedBuffer),
    iv: arrayBufferToBase64(iv),
    salt: arrayBufferToBase64(salt),
    iterations: PBKDF2_ITERATIONS,
    algorithm: ALGORITHM
  }
}

export const decryptWithPassword = async (encryptedData, password) => {
  const salt = base64ToArrayBuffer(encryptedData.salt)
  const iv = base64ToArrayBuffer(encryptedData.iv)
  const encrypted = base64ToArrayBuffer(encryptedData.encrypted)
  
  const key = await deriveKeyFromPassword(password, salt)
  
  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    key,
    encrypted
  )
  
  return JSON.parse(textDecoder.decode(decryptedBuffer))
}

// Generate a suggested strong password
export const generateStrongPassword = (length = 20) => {
  const lowercase = 'abcdefghijklmnopqrstuvwxyz'
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const numbers = '0123456789'
  const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?'
  
  const allChars = lowercase + uppercase + numbers + symbols
  let password = ''
  
  // Ensure at least one of each type
  password += lowercase[Math.floor(Math.random() * lowercase.length)]
  password += uppercase[Math.floor(Math.random() * uppercase.length)]
  password += numbers[Math.floor(Math.random() * numbers.length)]
  password += symbols[Math.floor(Math.random() * symbols.length)]
  
  // Fill the rest randomly
  for (let i = password.length; i < length; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)]
  }
  
  // Shuffle the password
  return password.split('').sort(() => Math.random() - 0.5).join('')
}

// ECDH key exchange functions (also used for secure key transfer)
const importPublicKey = async (publicKeyBase64) => {
  const publicKeyBuffer = base64ToArrayBuffer(publicKeyBase64)
  return crypto.subtle.importKey(
    'spki',
    publicKeyBuffer,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    []
  )
}

const importPrivateKey = async (privateKeyBase64) => {
  const privateKeyBuffer = base64ToArrayBuffer(privateKeyBase64)
  return crypto.subtle.importKey(
    'pkcs8',
    privateKeyBuffer,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  )
}

// Encrypt a key for a specific user using ECDH
export const encryptKeyForUser = async (symmetricKeyBase64, recipientPublicKeyBase64) => {
  const recipientPublicKey = await importPublicKey(recipientPublicKeyBase64)
  const ephemeralKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  )

  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: recipientPublicKey },
    ephemeralKeyPair.privateKey,
    256
  )

  const salt = crypto.getRandomValues(new Uint8Array(16))
  const derivedKey = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      salt: salt,
      info: textEncoder.encode('voltchat-key-encryption'),
      hash: 'SHA-256'
    },
    await crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, []),
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt']
  )

  const symmetricKeyBuffer = base64ToArrayBuffer(symmetricKeyBase64)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  
  const encryptedSymmetricKey = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv: iv },
    derivedKey,
    symmetricKeyBuffer
  )

  const ephemeralPublicKeyBuffer = await crypto.subtle.exportKey('spki', ephemeralKeyPair.publicKey)

  return {
    ephemeralPublicKey: arrayBufferToBase64(ephemeralPublicKeyBuffer),
    iv: arrayBufferToBase64(iv),
    salt: arrayBufferToBase64(salt),
    encrypted: arrayBufferToBase64(encryptedSymmetricKey)
  }
}

// Decrypt a key that was encrypted for this user
export const decryptKeyForUser = async (encryptedKeyPackage, privateKeyBase64) => {
  const privateKey = await importPrivateKey(privateKeyBase64)
  
  const ephemeralPublicKey = await importPublicKey(encryptedKeyPackage.ephemeralPublicKey)
  
  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: ephemeralPublicKey },
    privateKey,
    256
  )

  const salt = base64ToArrayBuffer(encryptedKeyPackage.salt)
  const derivedKey = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      salt: salt,
      info: textEncoder.encode('voltchat-key-encryption'),
      hash: 'SHA-256'
    },
    await crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, []),
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['decrypt']
  )

  const iv = base64ToArrayBuffer(encryptedKeyPackage.iv)
  const encrypted = base64ToArrayBuffer(encryptedKeyPackage.encrypted)

  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv: iv },
    derivedKey,
    encrypted
  )

  return arrayBufferToBase64(decrypted)
}

export const generateSymmetricKey = async () => {
  return crypto.subtle.generateKey(
    { name: ALGORITHM, length: KEY_LENGTH },
    true,
    ['encrypt', 'decrypt']
  )
}

export const exportSymmetricKey = async (key) => {
  const exported = await crypto.subtle.exportKey('raw', key)
  return arrayBufferToBase64(exported)
}

export const importSymmetricKey = async (keyBase64) => {
  const keyBuffer = base64ToArrayBuffer(keyBase64)
  return crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: ALGORITHM, length: KEY_LENGTH },
    true,
    ['encrypt', 'decrypt']
  )
}

export const encryptData = async (data, key) => {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const dataBuffer = textEncoder.encode(JSON.stringify(data))
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    dataBuffer
  )
  
  return {
    encrypted: arrayBufferToBase64(encryptedBuffer),
    iv: arrayBufferToBase64(iv)
  }
}

export const decryptData = async (encrypted, key) => {
  const iv = base64ToArrayBuffer(encrypted.iv)
  const encryptedBuffer = base64ToArrayBuffer(encrypted.encrypted)
  
  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    key,
    encryptedBuffer
  )
  
  return JSON.parse(textDecoder.decode(decryptedBuffer))
}

export const encryptFile = async (file) => {
  const key = await generateSymmetricKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  
  const fileBuffer = await file.arrayBuffer()
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    fileBuffer
  )
  
  const exportedKey = await exportSymmetricKey(key)
  
  return {
    encrypted: arrayBufferToBase64(encryptedBuffer),
    iv: arrayBufferToBase64(iv),
    key: exportedKey,
    originalSize: file.size,
    originalName: file.name,
    mimeType: file.type
  }
}

export const decryptFile = async (encryptedData, keyBase64) => {
  const key = await importSymmetricKey(keyBase64)
  const iv = base64ToArrayBuffer(encryptedData.iv)
  const encryptedBuffer = base64ToArrayBuffer(encryptedData.encrypted)
  
  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    key,
    encryptedBuffer
  )
  
  return new Blob([decryptedBuffer], { type: encryptedData.mimeType })
}

export const exportKeyToFile = (keyData, filename = 'e2e-key') => {
  const blob = new Blob([JSON.stringify(keyData, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}-${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export const importKeyFromFile = () => {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e) => {
      const file = e.target.files[0]
      if (!file) {
        reject(new Error('No file selected'))
        return
      }
      try {
        const text = await file.text()
        const keyData = JSON.parse(text)
        resolve(keyData)
      } catch (err) {
        reject(err)
      }
    }
    input.click()
  })
}

export const compressData = (data) => {
  const jsonString = JSON.stringify(data)
  const encoder = new TextEncoder()
  const dataBuffer = encoder.encode(jsonString)
  
  const compressed = pako.gzip(dataBuffer)
  return arrayBufferToBase64(compressed)
}

export const decompressData = (compressedBase64) => {
  const compressed = base64ToArrayBuffer(compressedBase64)
  const decompressed = pako.ungzip(compressed)
  const decoder = new TextDecoder()
  return JSON.parse(decoder.decode(decompressed))
}

export const encryptAndCompress = async (data, key) => {
  const encrypted = await encryptData(data, key)
  const compressed = compressData(encrypted)
  return compressed
}

export const decompressAndDecrypt = async (compressedData, key) => {
  const decompressed = decompressData(compressedData)
  return await decryptData(decompressed, key)
}

// QR Code utilities for key transfer
import QRCode from 'qrcode'

export const generateQRCode = async (data, options = {}) => {
  const { size = 256, errorCorrectionLevel = 'M' } = options
  
  // Convert data to string if needed
  const dataString = typeof data === 'string' ? data : JSON.stringify(data)
  
  try {
    const dataUrl = await QRCode.toDataURL(dataString, {
      width: size,
      margin: 2,
      errorCorrectionLevel,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    })
    return dataUrl
  } catch (error) {
    console.error('Error generating QR code:', error)
    return null
  }
}

// Parse QR code from image (for future use with camera scanning)
// This is a placeholder - actual implementation would use a library like jsQR
export const parseQRCode = async (imageData) => {
  // Note: This function is not used directly - QR scanning is handled
  // by the qr-scanner library in E2eeKeyPromptModal.jsx
  // This is kept for potential future use with static images
  console.warn('QR code parsing from static image not implemented - use qr-scanner for camera scanning')
  return null
}

// Generate a scannable key package for DM encryption
export const createScannableKeyPackage = async (keyData, metadata = {}) => {
  const packageData = {
    type: 'voltchat-dm-key',
    version: 1,
    key: keyData.key,
    mode: keyData.mode,
    conversationId: keyData.conversationId,
    createdAt: keyData.createdAt || Date.now(),
    metadata
  }
  
  const jsonString = JSON.stringify(packageData)
  
  // Generate QR code for the key
  const qrCodeDataUrl = await generateQRCode(jsonString, { size: 300 })
  
  return {
    ...packageData,
    qrCode: qrCodeDataUrl,
    jsonString,
    // Also provide a shorter version for manual entry
    shortKey: keyData.key?.substring(0, 32) + '...'
  }
}

// Export key with all necessary metadata
export const createKeyExportPackage = async (key, options = {}) => {
  const {
    mode = 'transparent',
    conversationId,
    includeQR = true,
    includeMetadata = true
  } = options
  
  const exportData = {
    type: 'voltchat-e2e-key',
    version: 1,
    createdAt: Date.now(),
    mode,
    conversationId,
    key
  }
  
  let qrCode = null
  if (includeQR && key) {
    qrCode = await generateQRCode(JSON.stringify(exportData), { size: 300 })
  }
  
  return {
    ...exportData,
    qrCode,
    // Compact form for sharing
    compact: btoa(JSON.stringify(exportData))
  }
}

// Import key from various formats
export const parseKeyInput = async (input) => {
  if (!input) return null
  
  try {
    // Try parsing as JSON
    const parsed = JSON.parse(input)
    
    if (parsed.type === 'voltchat-e2e-key' || parsed.type === 'voltchat-dm-key') {
      return parsed
    }
    
    // Handle direct key object
    if (parsed.key) {
      return {
        type: 'voltchat-dm-key',
        version: 1,
        key: parsed.key,
        mode: parsed.mode || 'transparent',
        conversationId: parsed.conversationId,
        createdAt: parsed.createdAt
      }
    }
    
    // Raw key string
    return {
      type: 'voltchat-dm-key',
      version: 1,
      key: input,
      mode: 'transparent'
    }
  } catch {
    // Not JSON - treat as raw key string
    return {
      type: 'voltchat-dm-key',
      version: 1,
      key: input,
      mode: 'transparent'
    }
  }
}

// Verify key integrity
export const verifyKeyIntegrity = async (keyPackage) => {
  if (!keyPackage) return false
  
  const required = ['type', 'version', 'key']
  for (const field of required) {
    if (!keyPackage[field]) return false
  }
  
  if (keyPackage.type !== 'voltchat-e2e-key' && keyPackage.type !== 'voltchat-dm-key') {
    return false
  }
  
  if (keyPackage.version !== 1) {
    console.warn('Unknown key package version:', keyPackage.version)
  }
  
  return true
}

// Encrypt key for secure transfer
export const encryptKeyForTransfer = async (key, recipientPublicKey) => {
  // This uses the existing encryptKeyForUser function
  return encryptKeyForUser(key, recipientPublicKey)
}

// Decrypt key from secure transfer
export const decryptKeyFromTransfer = async (encryptedPackage, privateKey) => {
  // This uses the existing decryptKeyForUser function
  return decryptKeyForUser(encryptedPackage, privateKey)
}

// Local storage encryption using OS-level protection (when available)
// Falls back to password-based encryption
export const encryptForLocalStorage = async (data, options = {}) => {
  const { useBiometric = false, password = null } = options
  
  // In browsers with Web Crypto API, we can use the Web Crypto API's 
  // SubtleCrypto for secure local storage
  // For now, we fall back to password-based encryption
  
  if (password) {
    return encryptWithPassword(data, password)
  }
  
  // Without password, just return the data (not recommended for production)
  console.warn('encryptForLocalStorage called without password - data not encrypted')
  return { encrypted: arrayBufferToBase64(textEncoder.encode(JSON.stringify(data))), iv: '', salt: '' }
}

// Decrypt from local storage
export const decryptFromLocalStorage = async (encryptedData, options = {}) => {
  const { password = null } = options
  
  if (password && encryptedData.salt) {
    return decryptWithPassword(encryptedData, password)
  }
  
  // Try plain JSON parsing
  try {
    const decoded = base64ToArrayBuffer(encryptedData.encrypted)
    const decodedStr = textDecoder.decode(decoded)
    return JSON.parse(decodedStr)
  } catch {
    return null
  }
}
