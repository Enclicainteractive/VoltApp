import LZString from 'lz-string'
import { v4 as uuidv4 } from 'uuid'

export const ROOM_FILE_VERSION = '1.0'

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

export const createDefaultRoom = () => ({
  version: ROOM_FILE_VERSION,
  name: 'New World',
  author: 'VoltVerse',
  description: 'A new VoltVerse world',
  environment: {
    name: 'Default World',
    skybox: 'city',
    fog: { color: '#1a1a2e', near: 10, far: 100 },
    gravity: -9.81,
    timeOfDay: 'evening',
    ambientLight: { color: '#404060', intensity: 0.4 },
    directionalLight: { 
      color: '#ffd4a3', 
      intensity: 1, 
      position: [10, 20, 10],
      castShadow: true
    },
    floor: {
      type: 'plane',
      size: [100, 100],
      material: { color: '#2d2d44', roughness: 0.8, metalness: 0.2 },
      grid: true
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

export const loadRoomFromFile = async (file, onProgress) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    
    reader.onload = async (e) => {
      try {
        const content = e.target.result
        
        let roomData
        
        onProgress?.(LOADING_PHASES.DECOMPRESSING, 10)
        await delay(100)
        
        if (file.name.endsWith('.voltroom')) {
          const decompressed = LZString.decompressFromEncodedURIComponent(content)
          onProgress?.(LOADING_PHASES.DECOMPRESSING, 30)
          await delay(100)
          roomData = JSON.parse(decompressed)
        } else {
          roomData = JSON.parse(content)
        }
        
        onProgress?.(LOADING_PHASES.PARSING, 40)
        await delay(200)
        
        if (!validateRoomData(roomData)) {
          throw new Error('Invalid room file format')
        }
        
        if (roomData.assets) {
          onProgress?.(LOADING_PHASES.LOADING_TEXTURES, 50)
          
          const totalAssets = (
            (roomData.assets.textures?.length || 0) +
            (roomData.assets.models?.length || 0) +
            (roomData.assets.audio?.length || 0)
          )
          
          let loadedCount = 0
          
          for (const texture of roomData.assets.textures || []) {
            loadedCount++
            onProgress?.(
              LOADING_PHASES.LOADING_TEXTURES,
              50 + (loadedCount / totalAssets) * 30
            )
            await delay(50)
          }
          
          onProgress?.(LOADING_PHASES.LOADING_MODELS, 80)
          
          for (const model of roomData.assets.models || []) {
            loadedCount++
            onProgress?.(
              LOADING_PHASES.LOADING_MODELS,
              50 + (loadedCount / totalAssets) * 30
            )
            await delay(100)
          }
        }
        
        onProgress?.(LOADING_PHASES.CONSTRUCTING, 95)
        await delay(300)
        
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

export const saveRoomToFile = (roomData, filename = null) => {
  const data = {
    ...roomData,
    metadata: {
      ...roomData.metadata,
      updatedAt: new Date().toISOString()
    }
  }
  
  const json = JSON.stringify(data, null, 2)
  const compressed = LZString.compressToEncodedURIComponent(json)
  
  const blob = new Blob([compressed], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  
  const a = document.createElement('a')
  a.href = url
  a.download = filename || `${data.name || 'world'}.voltroom`
  a.click()
  
  URL.revokeObjectURL(url)
  
  return a.download
}

export const validateRoomData = (data) => {
  if (!data) return false
  if (!data.version) return false
  if (!data.environment) return false
  return true
}

export const createWorldObject = (type, options = {}) => ({
  id: uuidv4(),
  type,
  position: options.position || [0, 0, 0],
  rotation: options.rotation || [0, 0, 0],
  scale: options.scale || [1, 1, 1],
  material: options.material || {
    color: '#6366f1',
    roughness: 0.5,
    metalness: 0.1
  },
  label: options.label || null,
  animation: options.animation || null,
  light: options.light || null,
  modelUrl: options.modelUrl || null,
  textureUrl: options.textureUrl || null,
  embeddedTexture: options.embeddedTexture || null,
  embeddedModel: options.embeddedModel || null,
  physics: options.physics || null,
  script: options.script || null,
  collider: options.collider || { type: 'box', size: [1, 1, 1] }
})

export const createPortal = (options = {}) => ({
  id: uuidv4(),
  type: 'portal',
  position: options.position || [0, 0, 0],
  rotation: options.rotation || [0, 0, 0],
  scale: options.scale || [2, 3, 0.1],
  color: options.color || '#00ffff',
  destination: options.destination || null,
  label: options.label || 'Portal'
})

export const createTrigger = (options = {}) => ({
  id: uuidv4(),
  type: 'trigger',
  position: options.position || [0, 0, 0],
  scale: options.scale || [2, 2, 2],
  triggerType: options.triggerType || 'proximity',
  actions: options.actions || [],
  cooldown: options.cooldown || 1,
  label: options.label || 'Trigger'
})

export const createSpawnPoint = (options = {}) => ({
  id: uuidv4(),
  type: 'spawn',
  position: options.position || [0, 0, 0],
  rotation: options.rotation || [0, 0, 0],
  name: options.name || 'Spawn Point'
})

export const createScript = (options = {}) => ({
  id: uuidv4(),
  name: options.name || 'New Script',
  language: options.language || 'javascript',
  code: options.code || '',
  targetObject: options.targetObject || null,
  triggers: options.triggers || []
})

export const createShader = (options = {}) => ({
  id: uuidv4(),
  name: options.name || 'Custom Shader',
  vertexShader: options.vertexShader || '',
  fragmentShader: options.fragmentShader || '',
  uniforms: options.uniforms || {},
  targetObject: options.targetObject || null,
  enabled: options.enabled ?? true
})

export const embedTexture = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      resolve({
        id: uuidv4(),
        name: file.name,
        type: 'texture',
        data: e.target.result,
        mimeType: file.type
      })
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export const embedModel = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      resolve({
        id: uuidv4(),
        name: file.name,
        type: 'model',
        data: e.target.result,
        mimeType: file.type
      })
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export const embedAudio = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      resolve({
        id: uuidv4(),
        name: file.name,
        type: 'audio',
        data: e.target.result,
        mimeType: file.type
      })
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export const exportRoomAsJSON = (roomData) => {
  return JSON.stringify(roomData, null, 2)
}

export const exportRoomAsVoltRoom = (roomData) => {
  const json = JSON.stringify(roomData)
  return LZString.compressToEncodedURIComponent(json)
}

export const mergeRoomData = (base, override) => {
  return {
    ...base,
    ...override,
    environment: {
      ...base.environment,
      ...override.environment
    },
    objects: [
      ...base.objects,
      ...(override.objects || [])
    ],
    portals: [
      ...base.portals,
      ...(override.portals || [])
    ],
    triggers: [
      ...base.triggers,
      ...(override.triggers || [])
    ],
    assets: {
      textures: [
        ...(base.assets?.textures || []),
        ...(override.assets?.textures || [])
      ],
      models: [
        ...(base.assets?.models || []),
        ...(override.assets?.models || [])
      ],
      audio: [
        ...(base.assets?.audio || []),
        ...(override.assets?.audio || [])
      ]
    }
  }
}

export const calculateRoomFileSize = (roomData) => {
  const json = JSON.stringify(roomData)
  const bytes = new Blob([json]).size
  
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
