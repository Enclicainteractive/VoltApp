/**
 * roomFile.js  –  VoltVerse .voltroom file format + chunked transfer system
 *
 * File format: single LZ-String compressed JSON blob (.voltroom)
 * Transfer: split into ~48KB chunks, broadcast via SDK, reassemble on receive
 * Compression: LZString URI-component encoding (very compact for JSON+base64)
 */
import LZString from 'lz-string'
import { v4 as uuidv4 } from 'uuid'

export const ROOM_FILE_VERSION = '2.0'

// ─── Loading phases ───────────────────────────────────────────────────────────
export const LOADING_PHASES = {
  IDLE: 'idle',
  LOADING: 'loading',
  DECOMPRESSING: 'decompressing',
  PARSING: 'parsing',
  LOADING_TEXTURES: 'loading_textures',
  LOADING_MODELS: 'loading_models',
  LOADING_SHADERS: 'loading_shaders',
  CONSTRUCTING: 'constructing',
  CONNECTING: 'connecting',
  READY: 'ready',
  ERROR: 'error'
}

// ─── Chunked transfer constants ───────────────────────────────────────────────
const CHUNK_SIZE = 48 * 1024   // 48 KB per chunk (safe for most relay payloads)
const CHUNK_EVENT = 'voltverse:room-chunk'
const CHUNK_DONE_EVENT = 'voltverse:room-chunk-done'
const CHUNK_REQUEST_EVENT = 'voltverse:room-chunk-request'

// ─── Default room ─────────────────────────────────────────────────────────────
export const createDefaultRoom = () => ({
  version: ROOM_FILE_VERSION,
  name: 'New World',
  author: 'VoltVerse',
  description: 'A new VoltVerse world',
  environment: {
    name: 'Default World',
    skybox: { preset: 'sunset-gradient', tint: '#ffffff', intensity: 1, showStars: true },
    fog: { enabled: true, color: '#1a1a2e', near: 10, far: 100 },
    gravity: -9.81,
    timeOfDay: 'evening',
    ambientLight: { color: '#404060', intensity: 0.4 },
    directionalLight: {
      color: '#ffd4a3',
      intensity: 1,
      position: [10, 20, 10],
      castShadow: false
    },
    floor: {
      type: 'plane',
      size: [100, 100],
      color: '#2d2d44',
      material: { color: '#2d2d44', roughness: 0.8, metalness: 0.2 },
      grid: true,
      gridColor: '#4a4a6a'
    }
  },
  spawnPoints: [
    { id: 'spawn-1', position: [0, 0, 5], rotation: [0, 0, 0], name: 'Main Spawn' }
  ],
  objects: [],
  portals: [],
  triggers: [],
  scripts: [],
  shaders: [],
  assets: {
    textures: [],
    models: [],
    audio: [],
    materials: []
  },
  metadata: {
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: [],
    category: 'social',
    capacity: 32
  }
})

// ─── Compress / decompress ────────────────────────────────────────────────────
export const compressRoom = (roomData) => {
  const json = JSON.stringify({
    ...roomData,
    metadata: { ...roomData.metadata, updatedAt: new Date().toISOString() }
  })
  return LZString.compressToEncodedURIComponent(json)
}

export const decompressRoom = (compressed) => {
  const json = LZString.decompressFromEncodedURIComponent(compressed)
  if (!json) throw new Error('Failed to decompress room data')
  return JSON.parse(json)
}

// ─── Split compressed string into chunks ─────────────────────────────────────
export const splitIntoChunks = (compressed, chunkSize = CHUNK_SIZE) => {
  const transferId = uuidv4()
  const chunks = []
  for (let i = 0; i < compressed.length; i += chunkSize) {
    chunks.push(compressed.slice(i, i + chunkSize))
  }
  return { transferId, chunks, total: chunks.length }
}

// ─── Broadcast room to all peers via SDK (chunked) ───────────────────────────
export const broadcastRoomChunked = async (sdk, roomData, onProgress) => {
  if (!sdk?.emitEvent) return

  const compressed = compressRoom(roomData)
  const { transferId, chunks, total } = splitIntoChunks(compressed)

  onProgress?.('Sending world...', 0)

  for (let i = 0; i < chunks.length; i++) {
    sdk.emitEvent(CHUNK_EVENT, {
      transferId,
      index: i,
      total,
      data: chunks[i],
      name: roomData.name || 'World',
      version: roomData.version || ROOM_FILE_VERSION
    }, { serverRelay: true })

    onProgress?.(`Sending world... ${Math.round(((i + 1) / total) * 100)}%`, (i + 1) / total)

    // Yield to avoid blocking the event loop on large worlds
    if (i % 4 === 3) await new Promise(r => setTimeout(r, 0))
  }

  sdk.emitEvent(CHUNK_DONE_EVENT, { transferId, total, name: roomData.name }, { serverRelay: true })
  onProgress?.('World sent!', 1)
}

// ─── Receive chunked room from peers ─────────────────────────────────────────
// Returns a cleanup function. Call onComplete(roomData) when fully received.
export const receiveRoomChunked = (sdk, onComplete, onProgress) => {
  if (!sdk?.on) return () => {}

  const transfers = new Map() // transferId → { chunks: [], total, received }

  const offChunk = sdk.on('event', (evt = {}) => {
    const { eventType, payload = {} } = evt
    if (!eventType) return

    if (eventType === CHUNK_EVENT) {
      const { transferId, index, total, data } = payload
      if (!transferId || index == null || !data) return

      if (!transfers.has(transferId)) {
        transfers.set(transferId, { chunks: new Array(total), total, received: 0 })
      }
      const transfer = transfers.get(transferId)
      if (!transfer.chunks[index]) {
        transfer.chunks[index] = data
        transfer.received++
        onProgress?.(`Receiving world... ${Math.round((transfer.received / total) * 100)}%`, transfer.received / total)
      }
    }

    if (eventType === CHUNK_DONE_EVENT) {
      const { transferId, total } = payload
      const transfer = transfers.get(transferId)
      if (!transfer) return

      if (transfer.received === total) {
        try {
          const compressed = transfer.chunks.join('')
          const roomData = decompressRoom(compressed)
          transfers.delete(transferId)
          onComplete(roomData)
        } catch (err) {
          console.error('[VoltVerse] Failed to reassemble room:', err)
        }
      }
    }
  })

  return offChunk
}

// ─── Request room from host ───────────────────────────────────────────────────
export const requestRoomFromHost = (sdk, userId) => {
  sdk?.emitEvent?.(CHUNK_REQUEST_EVENT, { userId }, { serverRelay: true })
}

// ─── Handle room requests (host side) ────────────────────────────────────────
export const handleRoomRequests = (sdk, getRoomData) => {
  if (!sdk?.on) return () => {}
  return sdk.on('event', (evt = {}) => {
    if (evt.eventType === CHUNK_REQUEST_EVENT) {
      const roomData = getRoomData()
      if (roomData) broadcastRoomChunked(sdk, roomData)
    }
  })
}

// ─── Load room from local file ────────────────────────────────────────────────
export const loadRoomFromFile = async (file, onProgress) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = async (e) => {
      try {
        const content = e.target.result
        let roomData

        onProgress?.(LOADING_PHASES.DECOMPRESSING, 10)
        await delay(50)

        if (file.name.endsWith('.voltroom')) {
          const decompressed = LZString.decompressFromEncodedURIComponent(content)
          if (!decompressed) throw new Error('Failed to decompress .voltroom file')
          onProgress?.(LOADING_PHASES.DECOMPRESSING, 30)
          roomData = JSON.parse(decompressed)
        } else {
          roomData = JSON.parse(content)
        }

        onProgress?.(LOADING_PHASES.PARSING, 40)
        await delay(100)

        if (!validateRoomData(roomData)) {
          throw new Error('Invalid room file format')
        }

        if (roomData.assets) {
          const totalAssets = (
            (roomData.assets.textures?.length || 0) +
            (roomData.assets.models?.length || 0) +
            (roomData.assets.audio?.length || 0)
          )
          let loadedCount = 0

          onProgress?.(LOADING_PHASES.LOADING_TEXTURES, 50)
          for (const _texture of roomData.assets.textures || []) {
            loadedCount++
            onProgress?.(LOADING_PHASES.LOADING_TEXTURES, 50 + (loadedCount / Math.max(totalAssets, 1)) * 20)
            await delay(20)
          }

          onProgress?.(LOADING_PHASES.LOADING_MODELS, 70)
          for (const _model of roomData.assets.models || []) {
            loadedCount++
            onProgress?.(LOADING_PHASES.LOADING_MODELS, 50 + (loadedCount / Math.max(totalAssets, 1)) * 30)
            await delay(30)
          }
        }

        onProgress?.(LOADING_PHASES.CONSTRUCTING, 95)
        await delay(200)

        resolve(roomData)
      } catch (err) {
        reject(new Error(`Failed to parse room file: ${err.message}`))
      }
    }

    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsText(file)
  })
}

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms))

// ─── Save room to local .voltroom file ────────────────────────────────────────
export const saveRoomToFile = (roomData, filename = null) => {
  const compressed = compressRoom(roomData)
  const blob = new Blob([compressed], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename || `${roomData.name || 'world'}.voltroom`
  a.click()
  URL.revokeObjectURL(url)
  return a.download
}

// ─── Validation ───────────────────────────────────────────────────────────────
export const validateRoomData = (data) => {
  if (!data || typeof data !== 'object') return false
  if (!data.environment) return false
  return true
}

// ─── Asset embedding helpers ──────────────────────────────────────────────────
export const embedTexture = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = (e) => resolve({
    id: uuidv4(),
    name: file.name,
    type: 'texture',
    data: e.target.result,
    mimeType: file.type,
    size: file.size
  })
  reader.onerror = reject
  reader.readAsDataURL(file)
})

export const embedModel = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = (e) => resolve({
    id: uuidv4(),
    name: file.name,
    type: 'model',
    data: e.target.result,
    mimeType: file.type,
    size: file.size
  })
  reader.onerror = reject
  reader.readAsDataURL(file)
})

export const embedAudio = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = (e) => resolve({
    id: uuidv4(),
    name: file.name,
    type: 'audio',
    data: e.target.result,
    mimeType: file.type,
    size: file.size
  })
  reader.onerror = reject
  reader.readAsDataURL(file)
})

// ─── Misc helpers ─────────────────────────────────────────────────────────────
export const calculateRoomFileSize = (roomData) => {
  const compressed = compressRoom(roomData)
  const bytes = compressed.length
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export const createWorldObject = (type, options = {}) => ({
  id: uuidv4(),
  type,
  position: options.position || [0, 0, 0],
  rotation: options.rotation || [0, 0, 0],
  scale: options.scale || [1, 1, 1],
  material: options.material || { color: '#6366f1', roughness: 0.5, metalness: 0.1 },
  label: options.label || null,
  animation: options.animation || null,
  light: options.light || null,
  modelUrl: options.modelUrl || null,
  textureUrl: options.textureUrl || null,
  physics: options.physics || null,
  collider: options.collider || { type: 'box', size: [1, 1, 1] }
})
