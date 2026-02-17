const ALGORITHM = 'AES-GCM'
const KEY_LENGTH = 256

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

const base64ToPem = (base64, type) => {
  const formatted = base64.match(/.{1,64}/g).join('\n')
  return `-----BEGIN ${type}-----\n${formatted}\n-----END ${type}-----`
}

const pemToBase64 = (pem) => {
  return pem
    .replace(/-----BEGIN [A-Z ]+-----/, '')
    .replace(/-----END [A-Z ]+-----/, '')
    .replace(/\s/g, '')
}

export const generateKeyPair = async () => {
  const keyPair = await window.crypto.subtle.generateKey(
    {
      name: 'ECDH',
      namedCurve: 'P-256'
    },
    true,
    ['deriveBits', 'deriveKey']
  )

  const publicKeyBuffer = await window.crypto.subtle.exportKey('spki', keyPair.publicKey)
  const privateKeyBuffer = await window.crypto.subtle.exportKey('pkcs8', keyPair.privateKey)

  return {
    publicKey: arrayBufferToBase64(publicKeyBuffer),
    privateKey: arrayBufferToBase64(privateKeyBuffer)
  }
}

export const importPublicKey = async (publicKeyBase64) => {
  const publicKeyBuffer = base64ToArrayBuffer(publicKeyBase64)
  return window.crypto.subtle.importKey(
    'spki',
    publicKeyBuffer,
    {
      name: 'ECDH',
      namedCurve: 'P-256'
    },
    true,
    []
  )
}

export const importPrivateKey = async (privateKeyBase64) => {
  const privateKeyBuffer = base64ToArrayBuffer(privateKeyBase64)
  return window.crypto.subtle.importKey(
    'pkcs8',
    privateKeyBuffer,
    {
      name: 'ECDH',
      namedCurve: 'P-256'
    },
    true,
    ['deriveBits', 'deriveKey']
  )
}

export const deriveSharedSecret = async (privateKey, peerPublicKey) => {
  const sharedBits = await window.crypto.subtle.deriveBits(
    {
      name: 'ECDH',
      public: peerPublicKey
    },
    privateKey,
    256
  )

  return window.crypto.subtle.importKey(
    'raw',
    sharedBits,
    {
      name: 'HKDF'
    },
    false,
    ['deriveKey']
  )
}

export const deriveSymmetricKey = async (sharedKey, salt) => {
  return window.crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      salt: salt || new Uint8Array(0),
      info: new TextEncoder().encode('e2e-encryption'),
      hash: 'SHA-256'
    },
    sharedKey,
    {
      name: ALGORITHM,
      length: KEY_LENGTH
    },
    false,
    ['encrypt', 'decrypt']
  )
}

export const generateSymmetricKey = async () => {
  return window.crypto.subtle.generateKey(
    {
      name: ALGORITHM,
      length: KEY_LENGTH
    },
    true,
    ['encrypt', 'decrypt']
  )
}

export const exportSymmetricKey = async (key) => {
  const exported = await window.crypto.subtle.exportKey('raw', key)
  return arrayBufferToBase64(exported)
}

export const importSymmetricKey = async (keyBase64) => {
  const keyBuffer = base64ToArrayBuffer(keyBase64)
  return window.crypto.subtle.importKey(
    'raw',
    keyBuffer,
    {
      name: ALGORITHM,
      length: KEY_LENGTH
    },
    true,
    ['encrypt', 'decrypt']
  )
}

export const encryptWithSymmetricKey = async (plaintext, key) => {
  const iv = window.crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(JSON.stringify(plaintext))

  const encrypted = await window.crypto.subtle.encrypt(
    {
      name: ALGORITHM,
      iv: iv
    },
    key,
    encoded
  )

  return {
    iv: arrayBufferToBase64(iv),
    encrypted: arrayBufferToBase64(encrypted)
  }
}

export const decryptWithSymmetricKey = async (encryptedData, key) => {
  const iv = base64ToArrayBuffer(encryptedData.iv)
  const encrypted = base64ToArrayBuffer(encryptedData.encrypted)

  const decrypted = await window.crypto.subtle.decrypt(
    {
      name: ALGORITHM,
      iv: iv
    },
    key,
    encrypted
  )

  const decoded = new TextDecoder().decode(decrypted)
  return JSON.parse(decoded)
}

export const encryptKeyForUser = async (symmetricKeyBase64, recipientPublicKeyBase64) => {
  const recipientPublicKey = await importPublicKey(recipientPublicKeyBase64)
  const ephemeralKeyPair = await window.crypto.subtle.generateKey(
    {
      name: 'ECDH',
      namedCurve: 'P-256'
    },
    true,
    ['deriveBits']
  )

  const sharedBits = await window.crypto.subtle.deriveBits(
    {
      name: 'ECDH',
      public: recipientPublicKey
    },
    ephemeralKeyPair.privateKey,
    256
  )

  const salt = window.crypto.getRandomValues(new Uint8Array(16))
  const derivedKey = await window.crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      salt: salt,
      info: new TextEncoder().encode('e2e-key-encryption'),
      hash: 'SHA-256'
    },
    await window.crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, []),
    {
      name: ALGORITHM,
      length: KEY_LENGTH
    },
    false,
    ['encrypt']
  )

  const symmetricKeyBuffer = base64ToArrayBuffer(symmetricKeyBase64)
  const iv = window.crypto.getRandomValues(new Uint8Array(12))
  
  const encryptedSymmetricKey = await window.crypto.subtle.encrypt(
    {
      name: ALGORITHM,
      iv: iv
    },
    derivedKey,
    symmetricKeyBuffer
  )

  const ephemeralPublicKeyBuffer = await window.crypto.subtle.exportKey('spki', ephemeralKeyPair.publicKey)

  return {
    ephemeralPublicKey: arrayBufferToBase64(ephemeralPublicKeyBuffer),
    iv: arrayBufferToBase64(iv),
    encrypted: arrayBufferToBase64(encryptedSymmetricKey)
  }
}

export const decryptKeyForUser = async (encryptedKeyPackage, privateKeyBase64) => {
  const privateKey = await importPrivateKey(privateKeyBase64)
  
  const ephemeralPublicKey = await importPublicKey(encryptedKeyPackage.ephemeralPublicKey)
  
  const sharedBits = await window.crypto.subtle.deriveBits(
    {
      name: 'ECDH',
      public: ephemeralPublicKey
    },
    privateKey,
    256
  )

  const salt = window.crypto.getRandomValues(new Uint8Array(16))
  const derivedKey = await window.crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      salt: salt,
      info: new TextEncoder().encode('e2e-key-encryption'),
      hash: 'SHA-256'
    },
    await window.crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, []),
    {
      name: ALGORITHM,
      length: KEY_LENGTH
    },
    false,
    ['decrypt']
  )

  const iv = base64ToArrayBuffer(encryptedKeyPackage.iv)
  const encrypted = base64ToArrayBuffer(encryptedKeyPackage.encrypted)

  const decrypted = await window.crypto.subtle.decrypt(
    {
      name: ALGORITHM,
      iv: iv
    },
    derivedKey,
    encrypted
  )

  return arrayBufferToBase64(decrypted)
}

export const encryptMessage = async (message, symmetricKey) => {
  const content = typeof message === 'string' ? message : JSON.stringify(message)
  const iv = window.crypto.getRandomValues(new Uint8Array(12))
  
  const encoded = new TextEncoder().encode(content)
  
  const encrypted = await window.crypto.subtle.encrypt(
    {
      name: ALGORITHM,
      iv: iv
    },
    symmetricKey,
    encoded
  )

  return {
    iv: arrayBufferToBase64(iv),
    encrypted: arrayBufferToBase64(encrypted)
  }
}

export const decryptMessage = async (encryptedPackage, symmetricKey) => {
  const iv = base64ToArrayBuffer(encryptedPackage.iv)
  const encrypted = base64ToArrayBuffer(encryptedPackage.encrypted)

  const decrypted = await window.crypto.subtle.decrypt(
    {
      name: ALGORITHM,
      iv: iv
    },
    symmetricKey,
    encrypted
  )

  const decoded = new TextDecoder().decode(decrypted)
  return decoded
}

export const generateKeyIdentifier = () => {
  const bytes = window.crypto.getRandomValues(new Uint8Array(8))
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

export const hashData = async (data) => {
  const encoded = new TextEncoder().encode(typeof data === 'string' ? data : JSON.stringify(data))
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', encoded)
  return arrayBufferToBase64(hashBuffer)
}

export const verifyIntegrity = async (data, hash) => {
  const computedHash = await hashData(data)
  return computedHash === hash
}

export const exportKeyForBackup = async (privateKeyBase64, password) => {
  const passwordBuffer = new TextEncoder().encode(password)
  const salt = window.crypto.getRandomValues(new Uint8Array(16))
  
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    'PBKDF2',
    false,
    ['deriveKey']
  )

  const derivedKey = await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    {
      name: ALGORITHM,
      length: KEY_LENGTH
    },
    false,
    ['encrypt']
  )

  const privateKeyBuffer = base64ToArrayBuffer(privateKeyBase64)
  const iv = window.crypto.getRandomValues(new Uint8Array(12))
  
  const encrypted = await window.crypto.subtle.encrypt(
    {
      name: ALGORITHM,
      iv: iv
    },
    derivedKey,
    privateKeyBuffer
  )

  return {
    salt: arrayBufferToBase64(salt),
    iv: arrayBufferToBase64(iv),
    encrypted: arrayBufferToBase64(encrypted)
  }
}

export const importKeyFromBackup = async (backup, password) => {
  const passwordBuffer = new TextEncoder().encode(password)
  const salt = base64ToArrayBuffer(backup.salt)
  
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    'PBKDF2',
    false,
    ['deriveKey']
  )

  const derivedKey = await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    {
      name: ALGORITHM,
      length: KEY_LENGTH
    },
    false,
    ['decrypt']
  )

  const iv = base64ToArrayBuffer(backup.iv)
  const encrypted = base64ToArrayBuffer(backup.encrypted)

  const decrypted = await window.crypto.subtle.decrypt(
    {
      name: ALGORITHM,
      iv: iv
    },
    derivedKey,
    encrypted
  )

  return arrayBufferToBase64(decrypted)
}
