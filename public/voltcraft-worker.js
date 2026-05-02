// VoltCraft Web Worker - Handles physics, world generation, and game logic
// This keeps the main thread free for rendering and UI

class Vec3 {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x
    this.y = y
    this.z = z
  }
  
  clone() {
    return new Vec3(this.x, this.y, this.z)
  }
  
  add(v) {
    this.x += v.x
    this.y += v.y
    this.z += v.z
    return this
  }
  
  sub(v) {
    this.x -= v.x
    this.y -= v.y
    this.z -= v.z
    return this
  }
  
  multiply(scalar) {
    this.x *= scalar
    this.y *= scalar
    this.z *= scalar
    return this
  }
  
  length() {
    return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z)
  }
  
  normalize() {
    const len = this.length()
    if (len > 0) {
      this.x /= len
      this.y /= len
      this.z /= len
    }
    return this
  }
  
  distanceTo(v) {
    const dx = this.x - v.x
    const dy = this.y - v.y
    const dz = this.z - v.z
    return Math.sqrt(dx * dx + dy * dy + dz * dz)
  }
}

// Optimized World Generator for worker thread
class WorldGenerator {
  constructor(seed = Math.random()) {
    this.seed = seed
    this.chunks = new Map()
    this.chunkSize = 16
    this.maxHeight = 64  // Reduced for performance
    this.seaLevel = 32
  }

  // Simple noise function
  noise(x, z, scale = 0.02) {
    const n = Math.sin(x * scale) * Math.cos(z * scale) + 
              Math.sin(x * scale * 2) * Math.cos(z * scale * 2) * 0.3
    return (n + 1.3) / 2.6
  }

  generateChunk(chunkX, chunkZ) {
    const chunk = {
      x: chunkX,
      z: chunkZ,
      blocks: new Map(),
      dirty: true
    }

    // Simplified generation for performance
    for (let x = 0; x < this.chunkSize; x += 2) {  // Skip every other block
      for (let z = 0; z < this.chunkSize; z += 2) {
        const worldX = chunkX * this.chunkSize + x
        const worldZ = chunkZ * this.chunkSize + z
        
        const heightNoise = this.noise(worldX, worldZ)
        const height = Math.floor(this.seaLevel + heightNoise * 15)
        
        // Generate basic terrain
        for (let y = 0; y <= Math.min(height, this.maxHeight - 1); y += 2) {  // Skip levels
          let blockType = 0
          
          if (y === 0) {
            blockType = 7 // Bedrock
          } else if (y < height - 2) {
            blockType = 1 // Stone
          } else if (y < height) {
            blockType = 3 // Dirt
          } else if (y === height && height > this.seaLevel) {
            blockType = 2 // Grass
          }
          
          if (blockType > 0) {
            chunk.blocks.set(`${x},${y},${z}`, blockType)
          }
        }
      }
    }

    this.chunks.set(`${chunkX},${chunkZ}`, chunk)
    return chunk
  }

  getBlock(x, y, z) {
    const chunkX = Math.floor(x / this.chunkSize)
    const chunkZ = Math.floor(z / this.chunkSize)
    const chunkKey = `${chunkX},${chunkZ}`
    
    let chunk = this.chunks.get(chunkKey)
    if (!chunk) {
      chunk = this.generateChunk(chunkX, chunkZ)
    }

    const localX = x - (chunkX * this.chunkSize)
    const localZ = z - (chunkZ * this.chunkSize)
    
    return chunk.blocks.get(`${localX},${y},${localZ}`) || 0
  }

  setBlock(x, y, z, blockType) {
    const chunkX = Math.floor(x / this.chunkSize)
    const chunkZ = Math.floor(z / this.chunkSize)
    const chunkKey = `${chunkX},${chunkZ}`
    
    let chunk = this.chunks.get(chunkKey)
    if (!chunk) {
      chunk = this.generateChunk(chunkX, chunkZ)
    }

    const localX = x - (chunkX * this.chunkSize)
    const localZ = z - (chunkZ * this.chunkSize)
    
    if (blockType === 0) {
      chunk.blocks.delete(`${localX},${y},${localZ}`)
    } else {
      chunk.blocks.set(`${localX},${y},${localZ}`, blockType)
    }
    
    chunk.dirty = true
    return true
  }

  getChunksInRange(centerX, centerZ, range = 2) {  // Reduced range
    const chunks = []
    const centerChunkX = Math.floor(centerX / this.chunkSize)
    const centerChunkZ = Math.floor(centerZ / this.chunkSize)
    
    for (let x = centerChunkX - range; x <= centerChunkX + range; x++) {
      for (let z = centerChunkZ - range; z <= centerChunkZ + range; z++) {
        const chunkKey = `${x},${z}`
        let chunk = this.chunks.get(chunkKey)
        if (!chunk) {
          chunk = this.generateChunk(x, z)
        }
        chunks.push(chunk)
      }
    }
    
    return chunks
  }
}

// Optimized Physics Engine
class PhysicsEngine {
  constructor() {
    this.gravity = 9.81
    this.friction = 0.8
    this.airResistance = 0.98
    this.entities = new Map()
  }

  addEntity(id, data) {
    this.entities.set(id, {
      id,
      position: new Vec3(data.position.x, data.position.y, data.position.z),
      velocity: new Vec3(data.velocity.x, data.velocity.y, data.velocity.z),
      size: new Vec3(data.size.x, data.size.y, data.size.z),
      onGround: false
    })
  }

  updateEntity(id, dt, world) {
    const entity = this.entities.get(id)
    if (!entity) return

    // Apply gravity
    entity.velocity.y -= this.gravity * dt
    
    // Apply velocity with smaller timestep for stability
    const steps = Math.ceil(dt / 0.016) // 60fps steps
    const stepDt = dt / steps
    
    for (let i = 0; i < steps; i++) {
      const newPosition = entity.position.clone().add(entity.velocity.clone().multiply(stepDt))
      
      // Simple collision detection (optimized)
      const blockAtFeet = world.getBlock(
        Math.floor(newPosition.x), 
        Math.floor(newPosition.y - 0.1), 
        Math.floor(newPosition.z)
      )
      
      if (blockAtFeet === 0) {
        entity.position = newPosition
        entity.onGround = false
      } else {
        entity.velocity.y = 0
        entity.onGround = true
        entity.position.y = Math.floor(newPosition.y) + 1
      }
    }

    // Apply friction
    if (entity.onGround) {
      entity.velocity.x *= this.friction
      entity.velocity.z *= this.friction
    } else {
      entity.velocity.x *= this.airResistance
      entity.velocity.z *= this.airResistance
    }
  }

  getEntityData(id) {
    const entity = this.entities.get(id)
    if (!entity) return null
    
    return {
      position: { x: entity.position.x, y: entity.position.y, z: entity.position.z },
      velocity: { x: entity.velocity.x, y: entity.velocity.y, z: entity.velocity.z },
      onGround: entity.onGround
    }
  }
}

// Worker state
let world = null
let physics = null
let players = new Map()
let gameState = {
  time: 0,
  dayTime: 1000
}

// Initialize systems
function initialize(data) {
  world = new WorldGenerator(data.seed)
  physics = new PhysicsEngine()
  
  postMessage({
    type: 'initialized',
    success: true
  })
}

// Add player
function addPlayer(data) {
  const playerData = {
    id: data.id,
    username: data.username,
    position: data.position,
    velocity: { x: 0, y: 0, z: 0 },
    size: { x: 0.8, y: 1.8, z: 0.8 },
    inventory: new Array(36).fill(null),
    selectedSlot: 0
  }
  
  players.set(data.id, playerData)
  physics.addEntity(data.id, playerData)
  
  postMessage({
    type: 'playerAdded',
    player: playerData
  })
}

// Move player
function movePlayer(data) {
  const player = players.get(data.playerId)
  if (!player) return
  
  const entity = physics.entities.get(data.playerId)
  if (!entity) return
  
  const moveSpeed = data.flying ? 10 : 5
  const forward = { x: 0, z: -1 }
  const right = { x: 1, z: 0 }
  
  // Apply rotation (simplified)
  const cos = Math.cos(data.rotation.y)
  const sin = Math.sin(data.rotation.y)
  
  switch(data.direction) {
    case 'forward':
      entity.velocity.x += (forward.x * cos - forward.z * sin) * moveSpeed * data.deltaTime
      entity.velocity.z += (forward.x * sin + forward.z * cos) * moveSpeed * data.deltaTime
      break
    case 'backward':
      entity.velocity.x -= (forward.x * cos - forward.z * sin) * moveSpeed * data.deltaTime
      entity.velocity.z -= (forward.x * sin + forward.z * cos) * moveSpeed * data.deltaTime
      break
    case 'left':
      entity.velocity.x -= (right.x * cos - right.z * sin) * moveSpeed * data.deltaTime
      entity.velocity.z -= (right.x * sin + right.z * cos) * moveSpeed * data.deltaTime
      break
    case 'right':
      entity.velocity.x += (right.x * cos - right.z * sin) * moveSpeed * data.deltaTime
      entity.velocity.z += (right.x * sin + right.z * cos) * moveSpeed * data.deltaTime
      break
    case 'jump':
      if (entity.onGround || data.flying) {
        entity.velocity.y = data.flying ? moveSpeed : 8
        entity.onGround = false
      }
      break
    case 'crouch':
      if (data.flying) {
        entity.velocity.y = -moveSpeed
      }
      break
  }
}

// Update game state
function update(data) {
  const deltaTime = Math.min(data.deltaTime, 0.033) // Cap at 30fps
  
  gameState.time += deltaTime
  gameState.dayTime = (gameState.dayTime + deltaTime * 50) % 2400
  
  // Update physics for all players
  players.forEach((player, id) => {
    physics.updateEntity(id, deltaTime, world)
  })
  
  // Get chunks around all players
  const activeChunks = new Set()
  players.forEach((player) => {
    const entity = physics.entities.get(player.id)
    if (entity) {
      const chunks = world.getChunksInRange(entity.position.x, entity.position.z, 1)
      chunks.forEach(chunk => {
        if (chunk.dirty) {
          activeChunks.add(`${chunk.x},${chunk.z}`)
          chunk.dirty = false
        }
      })
    }
  })
  
  // Send update to main thread
  const playerStates = {}
  players.forEach((player, id) => {
    const entityData = physics.getEntityData(id)
    if (entityData) {
      playerStates[id] = {
        ...player,
        ...entityData
      }
    }
  })
  
  postMessage({
    type: 'update',
    gameState,
    players: playerStates,
    dirtyChunks: Array.from(activeChunks)
  })
}

// Place/break blocks
function blockAction(data) {
  const success = world.setBlock(data.x, data.y, data.z, data.blockType)
  
  postMessage({
    type: 'blockActionResult',
    success,
    x: data.x,
    y: data.y,
    z: data.z,
    blockType: data.blockType,
    action: data.action
  })
}

// Get chunk data for rendering
function getChunkData(data) {
  const chunks = world.getChunksInRange(data.centerX, data.centerZ, data.range)
  
  const chunkData = chunks.map(chunk => ({
    x: chunk.x,
    z: chunk.z,
    blocks: Array.from(chunk.blocks.entries()).map(([key, value]) => ({
      key,
      blockType: value
    }))
  }))
  
  postMessage({
    type: 'chunkData',
    chunks: chunkData,
    requestId: data.requestId
  })
}

// Message handler
self.onmessage = function(e) {
  const { type, data } = e.data
  
  try {
    switch (type) {
      case 'initialize':
        initialize(data)
        break
      case 'addPlayer':
        addPlayer(data)
        break
      case 'movePlayer':
        movePlayer(data)
        break
      case 'update':
        update(data)
        break
      case 'blockAction':
        blockAction(data)
        break
      case 'getChunkData':
        getChunkData(data)
        break
      default:
        console.warn('Unknown message type:', type)
    }
  } catch (error) {
    postMessage({
      type: 'error',
      error: error.message,
      stack: error.stack
    })
  }
}