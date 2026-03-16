import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import * as THREE from 'three'

// ============================================
// CONSTANTS - Performance tuned
// ============================================
const CHUNK_SIZE = 16
const VIEW_RADIUS_CHUNKS = 2 // Reduced from 3 for performance
const MIN_WORLD_HEIGHT = -64
const MAX_WORLD_HEIGHT = 64 // Reduced from 128 for performance
const WATER_LEVEL = 32
const PLAYER_REACH = 5.0
const PLAYER_SYNC_INTERVAL_MS = 250
const SAVE_DEBOUNCE_MS = 500
const POSITION_SAMPLE_MS = 200
const WORLD_SEED = Math.floor(Math.random() * 100000)
const MAX_STAT = 20

// Simplified inventory - array format
const STARTING_INVENTORY = [
  { slot: 0, id: 'dirt', count: 64 },
  { slot: 1, id: 'cobblestone', count: 64 },
  { slot: 2, id: 'stone', count: 32 },
  { slot: 3, id: 'wooden_pickaxe', count: 1 },
]

const STATUS_LIMIT = 80
const SURVIVAL_SPEED = 5.0
const CREATIVE_SPEED = 15.0
const SPRINT_MULTIPLIER = 1.7
const JUMP_VELOCITY = 6.5
const GRAVITY = 18
const PLAYER_RADIUS = 0.3
const PLAYER_HEIGHT = 1.6

// ============================================
// UTILITIES
// ============================================
const clamp = (v, min, max) => Math.min(max, Math.max(min, v))
const makeKey = (x, y, z) => `${x},${y},${z}`
const makeChunkKey = (cx, cz) => `${cx},${cz}`

// ============================================
// PERLIN NOISE - Optimized
// ============================================
const PERLIN_SIZE = 256
let perlin = null
const p = new Uint8Array(512)

const initPerlin = (seed = WORLD_SEED) => {
  const perm = new Uint8Array(256)
  for (let i = 0; i < 256; i++) perm[i] = i
  
  // Fisher-Yates shuffle
  let s = seed
  for (let i = 255; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    const j = s % (i + 1)
    ;[perm[i], perm[j]] = [perm[j], perm[i]]
  }
  
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255]
}

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10)
const lerp = (a, b, t) => a + t * (b - a)
const grad = (hash, x, y) => {
  const h = hash & 3
  const u = h < 2 ? x : y
  const v = h < 2 ? y : x
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v)
}

const noise2D = (x, y) => {
  if (!perlin) initPerlin()
  
  const X = Math.floor(x) & 255
  const Y = Math.floor(y) & 255
  const xf = x - Math.floor(x)
  const yf = y - Math.floor(y)
  
  const u = fade(xf)
  const v = fade(yf)
  
  const aa = p[p[X] + Y]
  const ab = p[p[X] + Y + 1]
  const ba = p[p[X + 1] + Y]
  const bb = p[p[X + 1] + Y + 1]
  
  return lerp(
    lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u),
    lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u),
    v
  )
}

// Simple terrain height - optimized
const getTerrainHeight = (x, z) => {
  const scale = 0.012
  const n1 = noise2D(x * scale, z * scale) * 40
  const n2 = noise2D(x * scale * 3, z * scale * 3) * 12
  const n3 = noise2D(x * scale * 8, z * scale * 8) * 3
  
  return Math.floor(20 + n1 + n2 + n3)
}

// ============================================
// BLOCK DEFINITIONS - Streamlined
// ============================================
const BLOCKS = {
  air: null,
  grass: { id: 1, label: 'Grass', hardness: 0.5, tool: false },
  dirt: { id: 2, label: 'Dirt', hardness: 0.5 },
  stone: { id: 3, label: 'Stone', hardness: 1.5 },
  cobblestone: { id: 4, label: 'Cobblestone', hardness: 1.5 },
  sand: { id: 5, label: 'Sand', hardness: 0.4, gravity: true },
  gravel: { id: 6, label: 'Gravel', hardness: 0.4, gravity: true },
  oak_log: { id: 7, label: 'Oak Log', hardness: 1.5 },
  oak_planks: { id: 8, label: 'Oak Planks', hardness: 1.0 },
  leaves: { id: 9, label: 'Leaves', hardness: 0.2, transparent: true },
  water: { id: 10, label: 'Water', fluid: true, transparent: true },
  bedrock: { id: 11, label: 'Bedrock', hardness: -1 },
  coal_ore: { id: 12, label: 'Coal Ore', hardness: 2.0 },
  iron_ore: { id: 13, label: 'Iron Ore', hardness: 2.5 },
  gold_ore: { id: 14, label: 'Gold Ore', hardness: 3.0 },
  diamond_ore: { id: 15, label: 'Diamond Ore', hardness: 4.0 },
  obsidian: { id: 16, label: 'Obsidian', hardness: 50 },
  torch: { id: 17, label: 'Torch', hardness: 0.5, light: 14, small: true },
  glass: { id: 18, label: 'Glass', hardness: 0.3, transparent: true },
  brick: { id: 19, label: 'Brick', hardness: 2.0 },
  tnt: { id: 20, label: 'TNT', hardness: 0.5, explosive: true },
  wool: { id: 21, label: 'Wool', hardness: 0.8 },
  wool_red: { id: 22, label: 'Red Wool', hardness: 0.8 },
  wool_blue: { id: 23, label: 'Blue Wool', hardness: 0.8 },
  wool_green: { id: 24, label: 'Green Wool', hardness: 0.8 },
  crafting_table: { id: 25, label: 'Crafting Table', hardness: 1.5 },
  furnace: { id: 26, label: 'Furnace', hardness: 2.0 },
  chest: { id: 27, label: 'Chest', hardness: 1.5 },
}

const BLOCK_IDS = Object.entries(BLOCKS).reduce((acc, [name, data]) => {
  if (data) acc[data.id] = { name, ...data }
  return acc
}, {})

// ============================================
// CHUNK MANAGER - Core optimization
// ============================================
class ChunkManager {
  constructor() {
    this.chunks = new Map()
    this.dirtyChunks = new Set()
    this.worldChanges = {}
  }

  getChunkKey(cx, cz) {
    return makeChunkKey(cx, cz)
  }

  // Get block from chunk or world changes
  getBlock(x, y, z) {
    const key = makeKey(x, y, z)
    if (key in this.worldChanges) {
      const override = this.worldChanges[key]
      if (override === '__void' || override === null) return 0
      return BLOCKS[override]?.id || 0
    }
    return this.getBaseBlock(x, y, z)
  }

  // Generate base block at position
  getBaseBlock(x, y, z) {
    if (y < MIN_WORLD_HEIGHT) return BLOCKS.bedrock.id
    if (y > MAX_WORLD_HEIGHT) return 0

    const terrainY = getTerrainHeight(x, z)
    
    // Bedrock at bottom
    if (y === MIN_WORLD_HEIGHT) return BLOCKS.bedrock.id
    
    // Water
    if (y <= WATER_LEVEL && y < terrainY) return BLOCKS.water.id
    
    // Below terrain
    if (y < terrainY - 4) return BLOCKS.stone.id
    if (y < terrainY) return BLOCKS.dirt.id
    
    // Surface
    if (y === terrainY) return BLOCKS.grass.id
    
    return 0
  }

  // Check if block is exposed (for rendering)
  isExposed(x, y, z) {
    const neighbors = [
      [1, 0, 0], [-1, 0, 0],
      [0, 1, 0], [0, -1, 0],
      [0, 0, 1], [0, 0, -1]
    ]
    for (const [dx, dy, dz] of neighbors) {
      if (this.getBlock(x + dx, y + dy, z + dz) === 0) return true
    }
    return false
  }

  // Generate visible blocks for a chunk
  generateChunkBlocks(cx, cz) {
    const blocks = []
    const startX = cx * CHUNK_SIZE
    const startZ = cz * CHUNK_SIZE
    
    // Only check surface + a few blocks below
    for (let x = startX; x < startX + CHUNK_SIZE; x++) {
      for (let z = startZ; z < startZ + CHUNK_SIZE; z++) {
        const surfaceY = getTerrainHeight(x, z)
        
        // Check from surface down a bit, and water
        for (let y = Math.max(MIN_WORLD_HEIGHT, surfaceY - 2); y <= surfaceY + 1; y++) {
          const blockId = this.getBlock(x, y, z)
          if (blockId === 0) continue
          
          const blockDef = BLOCK_IDS[blockId]
          if (!blockDef) continue
          
          // Skip fully transparent blocks (except water/lights)
          if (blockDef.transparent && !blockDef.light && !blockDef.fluid) continue
          
          // Only render if exposed
          if (this.isExposed(x, y, z)) {
            blocks.push({ x, y, z, blockId, name: blockDef.name })
          }
        }
        
        // Render water surface
        for (let y = surfaceY + 1; y <= WATER_LEVEL; y++) {
          if (this.getBlock(x, y, z) === BLOCKS.water.id) {
            if (this.isExposed(x, y, z)) {
              blocks.push({ x, y, z, blockId: BLOCKS.water.id, name: 'water' })
            }
          }
        }
      }
    }
    
    return blocks
  }

  // Update world changes and mark affected chunks dirty
  updateChanges(changes) {
    this.worldChanges = changes
    
    // Mark all visible chunks dirty
    // In a full impl, we'd calculate which chunks are affected
    this.dirtyChunks = new Set(this.chunks.keys())
  }

  getOrCreateChunk(cx, cz) {
    const key = this.getChunkKey(cx, cz)
    
    if (!this.chunks.has(key)) {
      const blocks = this.generateChunkBlocks(cx, cz)
      this.chunks.set(key, { cx, cz, blocks, timestamp: Date.now() })
    }
    
    return this.chunks.get(key)
  }

  // Get all visible blocks from visible chunks
  getVisibleBlocks(centerCX, centerCZ) {
    const grouped = {}
    const viewRadius = VIEW_RADIUS_CHUNKS
    
    for (let cx = centerCX - viewRadius; cx <= centerCX + viewRadius; cx++) {
      for (let cz = centerCZ - viewRadius; cz <= centerCZ + viewRadius; cz++) {
        const chunk = this.getOrCreateChunk(cx, cz)
        
        for (const block of chunk.blocks) {
          const name = block.name
          if (!grouped[name]) grouped[name] = []
          grouped[name].push(block)
        }
      }
    }
    
    return grouped
  }

  // Quick block lookup for collision/breaking
  quickGetBlock(x, y, z) {
    return this.getBlock(x, y, z)
  }
}

const chunkManager = new ChunkManager()

// ============================================
// TEXTURE SYSTEM - Optimized
// ============================================
const textureLoader = new THREE.TextureLoader()
const textureCache = new Map()

// Create placeholder texture
const createPlaceholderTexture = () => {
  const canvas = document.createElement('canvas')
  canvas.width = 16
  canvas.height = 16
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ff00ff'
  ctx.fillRect(0, 0, 16, 16)
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, 8, 8)
  ctx.fillRect(8, 8, 8, 8)
  const tex = new THREE.CanvasTexture(canvas)
  tex.magFilter = THREE.NearestFilter
  tex.minFilter = THREE.NearestFilter
  return tex
}

const placeholderTexture = createPlaceholderTexture()

// Simple color-based materials (faster than texture loading)
const createColorMaterial = (color, options = {}) => {
  return new THREE.MeshStandardMaterial({ 
    color, 
    roughness: 0.9,
    metalness: 0.1,
    ...options
  })
}

// Pre-create all materials
const createMaterials = () => {
  const materials = {}
  
  // Block materials by color
  const colors = {
    grass: '#5d8c2e',
    dirt: '#8b5a2b',
    stone: '#7a7a7a',
    cobblestone: '#6b6b6b',
    sand: '#e8d4a8',
    gravel: '#9e8d7a',
    oak_log: '#6c4a1a',
    oak_planks: '#a0824a',
    leaves: '#2f7a2c',
    water: '#3b82f680',
    bedrock: '#1a1a1a',
    coal_ore: '#3d3d3d',
    iron_ore: '#8a6f4e',
    gold_ore: '#c9a227',
    diamond_ore: '#4ecca3',
    obsidian: '#1a1a2e',
    torch: '#ff6b35',
    glass: '#ffffff40',
    brick: '#b94e48',
    tnt: '#e03131',
    wool: '#f5f5f5',
    wool_red: '#ef4444',
    wool_blue: '#3b82f6',
    wool_green: '#22c55e',
    crafting_table: '#8b6914',
    furnace: '#4a4a4a',
    chest: '#8b6914',
  }

  for (const [name, color] of Object.entries(colors)) {
    const isTransparent = name === 'water' || name === 'glass'
    const isEmissive = name === 'torch'
    
    materials[name] = createColorMaterial(color, {
      transparent: isTransparent,
      opacity: isTransparent ? 0.7 : 1,
      emissive: isEmissive ? color : '#000000',
      emissiveIntensity: isEmissive ? 0.5 : 0,
    })
  }
  
  return materials
}

const sharedMaterials = createMaterials()

// ============================================
// REACT COMPONENTS
// ============================================

const InstancedVoxelLayer = React.memo(({ type, blocks }) => {
  const meshRef = useRef(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])

  useLayoutEffect(() => {
    if (!meshRef.current || !blocks?.length) return
    
    blocks.forEach((block, i) => {
      dummy.position.set(block.x + 0.5, block.y + 0.5, block.z + 0.5)
      dummy.scale.set(1, 1, 1)
      dummy.rotation.set(0, 0, 0)
      dummy.updateMatrix()
      meshRef.current.setMatrixAt(i, dummy.matrix)
    })
    
    meshRef.current.instanceMatrix.needsUpdate = true
  }, [blocks, dummy])

  if (!blocks?.length) return null

  const material = sharedMaterials[type] || sharedMaterials.stone

  return (
    <instancedMesh
      ref={meshRef}
      args={[null, null, blocks.length]}
      frustumCulled={true}
      castShadow={type !== 'water'}
      receiveShadow
    >
      <boxGeometry args={[1, 1, 1]} />
      <primitive object={material} attach="material" />
    </instancedMesh>
  )
})

const PlayerMarkers = ({ players, localUserId }) => (
  <>
    {Object.values(players).map((player) => (
      <group key={player.userId} position={player.position}>
        <mesh castShadow>
          <boxGeometry args={[0.5, 1.4, 0.5]} />
          <meshStandardMaterial color={player.userId === localUserId ? '#38bdf8' : '#f472b6'} />
        </mesh>
        <Text
          position={[0, 1.3, 0]}
          fontSize={0.15}
          color="#fff"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.015}
          outlineColor="#000"
        >
          {player.username}
        </Text>
      </group>
    ))}
  </>
)

const WorldScene = ({
  players,
  localUserId,
  localPositionRef,
  currentChunkRef,
  setChunkState,
  setPositionSample,
  mode,
  paused,
  setPointerLocked,
  requestResume,
  setPause,
  worldChanges,
  onInteract,
}) => {
  const keysRef = useRef({})
  const yawRef = useRef(-Math.PI / 4)
  const pitchRef = useRef(-0.3)
  const velocityYRef = useRef(0)
  const raycasterRef = useRef(new THREE.Raycaster())
  const centerRef = useRef(new THREE.Vector2(0, 0))
  const sampleTimeRef = useRef(0)
  const hoveredRef = useRef(null)
  
  const { camera, gl, scene } = useThree()

  // Update camera from position
  useEffect(() => {
    camera.position.set(...localPositionRef.current)
    camera.rotation.order = 'YXZ'
  }, [camera])

  // Input handlers
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.target.tagName === 'INPUT') return
      switch (e.code) {
        case 'KeyW': keysRef.current.forward = true; break
        case 'KeyS': keysRef.current.backward = true; break
        case 'KeyA': keysRef.current.left = true; break
        case 'KeyD': keysRef.current.right = true; break
        case 'Space': keysRef.current.jump = true; e.preventDefault(); break
        case 'ShiftLeft': keysRef.current.sprint = true; break
        case 'Escape': setPause(true); document.exitPointerLock?.(); break
      }
    }

    const onKeyUp = (e) => {
      switch (e.code) {
        case 'KeyW': keysRef.current.forward = false; break
        case 'KeyS': keysRef.current.backward = false; break
        case 'KeyA': keysRef.current.left = false; break
        case 'KeyD': keysRef.current.right = false; break
        case 'Space': keysRef.current.jump = false; break
        case 'ShiftLeft': keysRef.current.sprint = false; break
      }
    }

    const onMouseMove = (e) => {
      if (document.pointerLockElement !== gl.domElement || paused) return
      yawRef.current -= e.movementX * 0.002
      pitchRef.current = clamp(pitchRef.current - e.movementY * 0.002, -1.4, 1.4)
    }

    const onMouseDown = (e) => {
      if (paused || document.pointerLockElement !== gl.domElement) {
        requestResume()
        return
      }
      if (hoveredRef.current) {
        onInteract({ 
          block: hoveredRef.current, 
          button: e.button,
          action: e.button === 0 ? 'break' : 'place'
        })
      }
    }

    const onLockChange = () => {
      const locked = document.pointerLockElement === gl.domElement
      setPointerLocked(locked)
      if (!locked && !paused) setPause(true)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    gl.domElement.addEventListener('mousemove', onMouseMove)
    gl.domElement.addEventListener('mousedown', onMouseDown)
    document.addEventListener('pointerlockchange', onLockChange)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      gl.domElement.removeEventListener('mousemove', onMouseMove)
      gl.domElement.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('pointerlockchange', onLockChange)
    }
  }, [gl.domElement, paused, onInteract, requestResume, setPause, setPointerLocked])

  // Main game loop
  useFrame((_, delta) => {
    const pos = localPositionRef.current
    const speed = (mode === 'creative' ? CREATIVE_SPEED : SURVIVAL_SPEED) * 
      (keysRef.current.sprint ? SPRINT_MULTIPLIER : 1)

    // Update camera rotation
    camera.rotation.order = 'YXZ'
    camera.rotation.y = yawRef.current
    camera.rotation.x = pitchRef.current

    if (!paused) {
      let dx = 0, dz = 0
      
      if (keysRef.current.forward) dz -= 1
      if (keysRef.current.backward) dz += 1
      if (keysRef.current.left) dx -= 1
      if (keysRef.current.right) dx += 1

      if (dx !== 0 || dz !== 0) {
        const cos = Math.cos(yawRef.current)
        const sin = Math.sin(yawRef.current)
        
        const moveX = (-dz * sin - dx * cos) * speed * delta
        const moveZ = (-dz * cos + dx * sin) * speed * delta
        
        pos[0] += moveX
        pos[2] += moveZ
      }

      // Vertical movement
      if (mode === 'creative') {
        const vert = (keysRef.current.jump ? 1 : 0) - (keysRef.current.sprint ? 1 : 0)
        pos[1] = clamp(pos[1] + vert * speed * 0.8 * delta, 2, MAX_WORLD_HEIGHT + 10)
        velocityYRef.current = 0
      } else {
        // Simple ground check
        const groundY = getTerrainHeight(Math.round(pos[0]), Math.round(pos[2])) + PLAYER_HEIGHT
        
        if (pos[1] <= groundY + 0.1) {
          pos[1] = groundY
          velocityYRef.current = 0
          if (keysRef.current.jump) {
            velocityYRef.current = JUMP_VELOCITY
          }
        } else {
          velocityYRef.current -= GRAVITY * delta
        }
        
        pos[1] += velocityYRef.current * delta
        
        if (pos[1] < groundY) {
          pos[1] = groundY
          velocityYRef.current = 0
        }
      }
    }

    // Update camera
    camera.position.set(pos[0], pos[1], pos[2])

    // Raycasting for block interaction (throttled)
    raycasterRef.current.setFromCamera(centerRef.current, camera)
    const intersects = raycasterRef.current.intersectObjects(scene.children, true)
    
    const hit = intersects.find(i => i.object?.isInstancedMesh)
    
    if (hit && hit.instanceId !== undefined) {
      const mesh = hit.object
      const blocks = mesh.userData?.voltcraftBlocks
      if (blocks && blocks[hit.instanceId]) {
        hoveredRef.current = blocks[hit.instanceId]
      }
    } else {
      hoveredRef.current = null
    }

    // Position sampling
    const now = performance.now()
    if (now - sampleTimeRef.current >= POSITION_SAMPLE_MS) {
      sampleTimeRef.current = now
      setPositionSample([...pos])
      
      const chunkX = Math.floor(pos[0] / CHUNK_SIZE)
      const chunkZ = Math.floor(pos[2] / CHUNK_SIZE)
      
      if (chunkX !== currentChunkRef.current.x || chunkZ !== currentChunkRef.current.z) {
        currentChunkRef.current = { x: chunkX, z: chunkZ }
        setChunkState({ x: chunkX, z: chunkZ })
      }
    }
  })

  // Get visible blocks
  const blockGroups = useMemo(() => {
    const cx = currentChunkRef.current.x
    const cz = currentChunkRef.current.z
    return chunkManager.getVisibleBlocks(cx, cz)
  }, [currentChunkRef.current.x, currentChunkRef.current.z, worldChanges])

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 20, 8]} intensity={1.0} castShadow />
      <fog attach="fog" args={['#9fd2ff', 20, 60]} />
      
      {Object.entries(blockGroups).map(([type, blocks]) => (
        <InstancedVoxelLayer 
          key={type} 
          type={type} 
          blocks={blocks} 
        />
      ))}

      <PlayerMarkers players={players} localUserId={localUserId} />
    </>
  )
}

// ============================================
// MAIN COMPONENT
// ============================================
const VoltCraftActivity = ({ sdk, currentUser }) => {
  const userId = currentUser?.id || 'guest'
  const username = currentUser?.username || 'Guest'

  const localPositionRef = useRef([0, 10, 0])
  const currentChunkRef = useRef({ x: 0, z: 0 })
  const saveTimerRef = useRef(null)
  const worldChangesRef = useRef({})

  const [worldChanges, setWorldChanges] = useState({})
  const [players, setPlayers] = useState({})
  const [mode, setMode] = useState('creative')
  const [inventory, setInventory] = useState(STARTING_INVENTORY)
  const [selectedSlot, setSelectedSlot] = useState(0)
  const [statusMessage, setStatusMessage] = useState('VoltCraft loaded!')
  const [health] = useState(MAX_STAT)
  const [currentChunk, setCurrentChunk] = useState({ x: 0, z: 0 })
  const [positionSample, setPositionSample] = useState([0, 10, 0])
  const [paused, setPaused] = useState(true)
  const [pointerLocked, setPointerLocked] = useState(false)

  // Initialize position
  useEffect(() => {
    const x = 0, z = 0
    const y = getTerrainHeight(x, z) + PLAYER_HEIGHT + 0.5
    localPositionRef.current = [x, y, z]
  }, [])

  // Update chunk manager when world changes
  useEffect(() => {
    chunkManager.updateChanges(worldChanges)
  }, [worldChanges])

  // Block interaction handler
  const handleInteract = useCallback(({ block, button, action }) => {
    const { x, y, z } = block
    
    // Distance check
    const dist = Math.sqrt(
      Math.pow(x + 0.5 - localPositionRef.current[0], 2) +
      Math.pow(y + 0.5 - localPositionRef.current[1], 2) +
      Math.pow(z + 0.5 - localPositionRef.current[2], 2)
    )
    
    if (dist > PLAYER_REACH) return

    if (action === 'break') {
      // Remove block
      const newChanges = { ...worldChangesRef.current }
      delete newChanges[makeKey(x, y, z)]
      worldChangesRef.current = newChanges
      setWorldChanges(newChanges)
      setStatusMessage(`Broke ${BLOCKS[block.name]?.label || block.name}`)
    } else if (action === 'place') {
      // Place block
      const item = inventory[selectedSlot]
      if (!item) return
      
      const blockName = item.id.replace('wooden_', '').replace('_pickaxe', '')
      const newChanges = { ...worldChangesRef.current, [makeKey(x, y, z)]: blockName }
      worldChangesRef.current = newChanges
      setWorldChanges(newChanges)
      setStatusMessage(`Placed ${blockName}`)
    }
  }, [inventory, selectedSlot])

  // SDK setup
  useEffect(() => {
    if (!sdk) return

    const offState = sdk.subscribeServerState?.((state) => {
      const changes = state?.voltCraft?.changes
      if (changes) {
        worldChangesRef.current = changes
        setWorldChanges(changes)
      }
    })

    const offEvent = sdk.on?.('event', (evt) => {
      const p = evt.payload || {}
      if (p.userId === userId) return

      if (evt.eventType === 'voltcraft:player') {
        setPlayers(prev => ({
          ...prev,
          [p.userId]: {
            userId: p.userId,
            username: p.username || 'Guest',
            position: p.position || [0, 10, 0]
          }
        }))
      } else if (evt.eventType === 'voltcraft:leave') {
        setPlayers(prev => {
          const next = { ...prev }
          delete next[p.userId]
          return next
        })
      }
    })

    // Announce join
    sdk.emitEvent?.('voltcraft:player', {
      userId,
      username,
      position: localPositionRef.current
    }, { serverRelay: true })

    return () => {
      sdk.emitEvent?.('voltcraft:leave', { userId }, { serverRelay: true })
      offState?.()
      offEvent?.()
    }
  }, [sdk, userId, username])

  // Player sync
  useEffect(() => {
    if (!sdk) return
    
    const interval = setInterval(() => {
      sdk.emitEvent?.('voltcraft:player', {
        userId,
        username,
        position: localPositionRef.current,
        mode
      }, { serverRelay: true })
    }, PLAYER_SYNC_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [sdk, userId, username, mode])

  // Update local player
  useEffect(() => {
    setPlayers(prev => ({
      ...prev,
      [userId]: { userId, username, position: positionSample }
    }))
  }, [userId, username, positionSample])

  const resumeGame = useCallback(() => {
    setPaused(false)
    setTimeout(() => {
      document.querySelector('canvas')?.requestPointerLock()
    }, 10)
  }, [])

  const openPauseMenu = useCallback(() => {
    setPaused(true)
    document.exitPointerLock?.()
  }, [])

  if (!sdk) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: '#1a1a2e', color: '#fff' }}>Loading VoltCraft...</div>
  }

  const hotbarItems = ['dirt', 'cobblestone', 'stone', 'sand', 'grass', 'oak_log', 'oak_planks', 'glass', 'tnt', 'brick']
  const selectedItem = hotbarItems[selectedSlot]

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: '#1a1a2e' }}>
      <Canvas shadows camera={{ fov: 50, near: 0.1, far: 100 }} style={{ background: '#87ceeb' }}>
        <color attach="background" args={['#87ceeb']} />
        <WorldScene
          players={players}
          localUserId={userId}
          localPositionRef={localPositionRef}
          currentChunkRef={currentChunkRef}
          setChunkState={setCurrentChunk}
          setPositionSample={setPositionSample}
          mode={mode}
          paused={paused}
          setPointerLocked={setPointerLocked}
          requestResume={resumeGame}
          setPause={setPaused}
          worldChanges={worldChanges}
          onInteract={handleInteract}
        />
      </Canvas>

      {/* HUD */}
      <div style={{
        position: 'absolute',
        top: 16,
        left: 16,
        color: '#fff',
        fontFamily: 'monospace',
        textShadow: '1px 1px 2px #000',
        pointerEvents: 'none'
      }}>
        <div style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 8 }}>⚡ VoltCraft</div>
        <div>Mode: {mode}</div>
        <div>HP: {health}/{MAX_STAT}</div>
        <div>Chunk: {currentChunk.x}, {currentChunk.z}</div>
        <div>Pos: {positionSample.map(v => Math.round(v)).join(', ')}</div>
        <div style={{ fontSize: 12, opacity: 0.8, marginTop: 8 }}>{statusMessage}</div>
      </div>

      {/* Crosshair */}
      {!paused && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 20,
          height: 20,
          pointerEvents: 'none'
        }}>
          <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 2, background: '#fff', transform: 'translateY(-50%)' }} />
          <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 2, background: '#fff', transform: 'translateX(-50%)' }} />
        </div>
      )}

      {/* Hotbar */}
      <div style={{
        position: 'absolute',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: 4,
        background: '#0008',
        padding: 8,
        borderRadius: 8
      }}>
        {hotbarItems.map((item, i) => (
          <button
            key={item}
            onClick={() => setSelectedSlot(i)}
            style={{
              width: 50,
              height: 50,
              background: selectedSlot === i ? '#fff4' : '#0004',
              border: selectedSlot === i ? '2px solid #fff' : '2px solid #fff4',
              borderRadius: 4,
              color: '#fff',
              fontSize: 10,
              cursor: 'pointer',
              fontFamily: 'monospace'
            }}
          >
            {i + 1}
            <div>{item.replace('_', ' ')}</div>
          </button>
        ))}
      </div>

      {/* Pause menu */}
      {paused && (
        <div style={{
          position: 'absolute',
          inset: 0,
          background: '#0008',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{
            background: '#1a1a2e',
            padding: 32,
            borderRadius: 16,
            color: '#fff',
            fontFamily: 'monospace',
            maxWidth: 400
          }}>
            <h2 style={{ margin: '0 0 16px' }}>VoltCraft</h2>
            <p style={{ opacity: 0.8, marginBottom: 16 }}>
              WASD move • Mouse look<br/>
              Left click break • Right click place<br/>
              Numbers select hotbar • Esc menu
            </p>
            <button
              onClick={resumeGame}
              style={{
                background: '#3b82f6',
                color: '#fff',
                border: 'none',
                padding: '12px 24px',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 16,
                width: '100%'
              }}
            >
              Click to Play
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default VoltCraftActivity
