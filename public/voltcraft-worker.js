/**
 * voltcraft-worker.js  –  VoltCraft Web Worker v2
 * Runs entirely off the main thread.
 * Handles: terrain gen, chunk culling, raycasting, world persistence helpers.
 */
'use strict'

const CHUNK_SIZE = 16
const WATER_LEVEL = 12

// ─── Perlin noise ─────────────────────────────────────────────────────────────
const p = new Uint8Array(512)
let seed = 42

function initPerlin(s) {
  seed = s >>> 0
  const perm = new Uint8Array(256)
  for (let i = 0; i < 256; i++) perm[i] = i
  let r = seed
  for (let i = 255; i > 0; i--) {
    r = Math.imul(r, 1664525) + 1013904223 & 0xffffffff
    const j = (r >>> 0) % (i + 1)
    const t = perm[i]; perm[i] = perm[j]; perm[j] = t
  }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255]
}

const fade = t => t * t * t * (t * (t * 6 - 15) + 10)
const lerp = (a, b, t) => a + t * (b - a)
const grad = (h, x, y) => { const u = h < 2 ? x : y, v = h < 2 ? y : x; return ((h & 1) ? -u : u) + ((h & 2) ? -v : v) }

function noise(x, y) {
  const X = Math.floor(x) & 255, Y = Math.floor(y) & 255
  const xf = x - Math.floor(x), yf = y - Math.floor(y)
  const u = fade(xf), v = fade(yf)
  return lerp(
    lerp(grad(p[p[X] + Y], xf, yf), grad(p[p[X + 1] + Y], xf - 1, yf), u),
    lerp(grad(p[p[X] + Y + 1], xf, yf - 1), grad(p[p[X + 1] + Y + 1], xf - 1, yf - 1), u),
    v
  )
}

function fbm(x, z, octaves = 5) {
  let v = 0, amp = 1, freq = 1, max = 0
  for (let i = 0; i < octaves; i++) {
    v += noise(x * freq * 0.008, z * freq * 0.008) * amp
    max += amp; amp *= 0.5; freq *= 2.1
  }
  return v / max
}

function getTerrainHeight(x, z) {
  const h = fbm(x, z)
  return Math.floor(8 + h * 28)
}

function getBiome(x, z) {
  const t = noise(x * 0.003, z * 0.003)
  const m = noise(x * 0.003 + 100, z * 0.003 + 100)
  if (t > 0.3) return 'desert'
  if (m > 0.25) return 'mountains'
  if (t < -0.2) return 'tundra'
  return 'plains'
}

// ─── Block IDs ────────────────────────────────────────────────────────────────
const BLOCK = {
  air:0, grass:1, dirt:2, stone:3, cobblestone:4, sand:5, gravel:6,
  oak_log:7, oak_planks:8, leaves:9, water:10, bedrock:11,
  coal_ore:12, iron_ore:13, gold_ore:14, diamond_ore:15, obsidian:16,
  torch:17, glass:18, brick:19, tnt:20, wool:21, wool_red:22,
  wool_blue:23, wool_green:24, crafting_table:25, furnace:26, chest:27,
  snow:28, ice:29, cactus:30, sandstone:31, mossy_cobblestone:32,
  bookshelf:33, sponge:34, lapis_ore:35, emerald_ore:36, redstone_ore:37,
  glowstone:38, netherrack:39, soul_sand:40, pumpkin:41, melon:42,
  hay_bale:43, clay:44, gravel_path:45, oak_slab:46, stone_slab:47,
  oak_stairs:48, stone_stairs:49, fence:50, fence_gate:51, door:52,
  trapdoor:53, ladder:54, sign:55, flower_red:56, flower_yellow:57,
  mushroom:58, tall_grass:59, dead_bush:60, sapling:61, wheat:62,
  farmland:63, water_source:64, lava:65, lava_source:66,
  wool_yellow:67, wool_orange:68, wool_purple:69, wool_cyan:70,
  wool_magenta:71, wool_pink:72, wool_lime:73, wool_gray:74,
  wool_light_gray:75, wool_brown:76, wool_black:77,
  concrete_white:78, concrete_red:79, concrete_blue:80, concrete_green:81,
  concrete_yellow:82, concrete_orange:83, concrete_purple:84,
  terracotta:85, terracotta_red:86, terracotta_blue:87, terracotta_yellow:88,
  quartz:89, quartz_pillar:90, prismarine:91, sea_lantern:92,
  end_stone:93, purpur:94, nether_brick:95, red_sandstone:96,
  andesite:97, diorite:98, granite:99, polished_andesite:100,
  polished_diorite:101, polished_granite:102, smooth_stone:103,
  cut_sandstone:104, chiseled_sandstone:105, chiseled_stone_bricks:106,
  stone_bricks:107, cracked_stone_bricks:108, mossy_stone_bricks:109,
  infested_stone:110, mycelium:111, podzol:112, coarse_dirt:113,
  rooted_dirt:114, mud:115, packed_mud:116, mud_bricks:117,
  deepslate:118, cobbled_deepslate:119, polished_deepslate:120,
  deepslate_bricks:121, deepslate_tiles:122, reinforced_deepslate:123,
  tuff:124, calcite:125, dripstone:126, pointed_dripstone:127
}
const BLOCK_NAMES = Object.fromEntries(Object.entries(BLOCK).map(([k,v])=>[v,k]))
const SOLID = new Set(Object.values(BLOCK).filter(id => id !== BLOCK.air && id !== BLOCK.water && id !== BLOCK.water_source && id !== BLOCK.lava && id !== BLOCK.lava_source))

// ─── World state ──────────────────────────────────────────────────────────────
let worldChanges = {}
const chunkCache = new Map()

function getBaseBlock(x, y, z) {
  if (y < 0) return BLOCK.bedrock
  const th = getTerrainHeight(x, z)
  const biome = getBiome(x, z)

  if (y > th) {
    if (y <= WATER_LEVEL) return BLOCK.water
    // Trees
    const treeNoise = noise(x * 0.3 + 7, z * 0.3 + 7)
    if (y === th + 1 && treeNoise > 0.55 && biome !== 'desert') {
      if (noise(x * 1.1, z * 1.1) > 0.3) return BLOCK.oak_log
    }
    if (y >= th + 2 && y <= th + 4 && treeNoise > 0.55 && biome !== 'desert') {
      const d = Math.abs(x % 1) + Math.abs(z % 1)
      if (noise(x * 0.8 + y, z * 0.8 + y) > -0.2) return BLOCK.leaves
    }
    if (y === th + 1 && biome === 'desert' && noise(x * 0.5, z * 0.5) > 0.6) return BLOCK.cactus
    return BLOCK.air
  }

  if (y === 0) return BLOCK.bedrock
  if (y < th - 8) {
    // Ores
    const on = noise(x * 0.4 + 50, y * 0.4 + 50 + z * 0.4)
    if (y < 4 && on > 0.7) return BLOCK.diamond_ore
    if (y < 8 && on > 0.65) return BLOCK.gold_ore
    if (on > 0.6) return BLOCK.iron_ore
    if (on > 0.55) return BLOCK.coal_ore
    if (y < 3 && noise(x * 0.6, y * 0.6 + z * 0.6) > 0.72) return BLOCK.lapis_ore
    if (y < 6 && noise(x * 0.7 + 200, y * 0.7 + z * 0.7) > 0.74) return BLOCK.redstone_ore
    if (y < 10 && noise(x * 0.5 + 300, y * 0.5 + z * 0.5) > 0.76) return BLOCK.emerald_ore
    return BLOCK.stone
  }
  if (y < th - 2) return BLOCK.stone
  if (y < th) {
    if (biome === 'desert') return BLOCK.sand
    if (biome === 'tundra') return BLOCK.gravel
    return BLOCK.dirt
  }
  // Surface
  if (biome === 'desert') return BLOCK.sand
  if (biome === 'tundra') return BLOCK.snow
  if (biome === 'mountains') return y > 20 ? BLOCK.snow : BLOCK.stone
  return BLOCK.grass
}

function getBlock(x, y, z) {
  const key = `${x},${y},${z}`
  if (key in worldChanges) {
    const v = worldChanges[key]
    if (v === null || v === '__void') return BLOCK.air
    return BLOCK[v] ?? BLOCK.air
  }
  return getBaseBlock(x, y, z)
}

function isTransparent(id) {
  return id === BLOCK.air || id === BLOCK.water || id === BLOCK.water_source ||
    id === BLOCK.leaves || id === BLOCK.glass || id === BLOCK.lava || id === BLOCK.lava_source
}

function isExposed(x, y, z) {
  return isTransparent(getBlock(x+1,y,z)) || isTransparent(getBlock(x-1,y,z)) ||
    isTransparent(getBlock(x,y+1,z)) || isTransparent(getBlock(x,y-1,z)) ||
    isTransparent(getBlock(x,y,z+1)) || isTransparent(getBlock(x,y,z-1))
}

function generateChunk(cx, cz) {
  const key = `${cx},${cz}`
  if (chunkCache.has(key)) return chunkCache.get(key)
  const sx = cx * CHUNK_SIZE, sz = cz * CHUNK_SIZE
  const grouped = {}

  for (let x = sx; x < sx + CHUNK_SIZE; x++) {
    for (let z = sz; z < sz + CHUNK_SIZE; z++) {
      const th = getTerrainHeight(x, z)
      const yMin = Math.max(0, th - 10)
      const yMax = th + 6

      for (let y = yMin; y <= yMax; y++) {
        const id = getBlock(x, y, z)
        if (id === BLOCK.air) continue
        if (!isExposed(x, y, z)) continue
        const name = BLOCK_NAMES[id]
        if (!name) continue
        if (!grouped[name]) grouped[name] = []
        grouped[name].push(x, y, z)
      }
    }
  }

  chunkCache.set(key, grouped)
  return grouped
}

function getVisibleBlocks(cx, cz, radius) {
  const merged = {}
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dz = -radius; dz <= radius; dz++) {
      const chunk = generateChunk(cx + dx, cz + dz)
      for (const [name, arr] of Object.entries(chunk)) {
        if (!merged[name]) merged[name] = []
        for (const v of arr) merged[name].push(v)
      }
    }
  }
  return merged
}

function invalidateNear(x, z) {
  const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE)
  for (let dx = -1; dx <= 1; dx++)
    for (let dz = -1; dz <= 1; dz++)
      chunkCache.delete(`${cx+dx},${cz+dz}`)
}

// ─── Message handler ──────────────────────────────────────────────────────────
self.onmessage = function(e) {
  const { type, id } = e.data
  try {
    switch (type) {
      case 'init': {
        initPerlin(e.data.seed ?? 42)
        self.postMessage({ type: 'init:done', id, seed: e.data.seed })
        break
      }
      case 'getVisibleBlocks': {
        initPerlin(seed) // ensure initialized
        const blocks = getVisibleBlocks(e.data.cx, e.data.cz, e.data.radius ?? 3)
        // Convert to plain arrays so they are CLONED (not transferred/neutered)
        // Transferring Int16Array buffers detaches them, leaving empty arrays on main thread
        const result = {}
        for (const [name, arr] of Object.entries(blocks)) {
          result[name] = Array.from(arr)
        }
        self.postMessage({ type: 'visibleBlocks', id, blocks: result })
        break
      }
      case 'setWorldChanges': {
        worldChanges = e.data.changes ?? {}
        chunkCache.clear()
        self.postMessage({ type: 'setWorldChanges:done', id })
        break
      }
      case 'breakBlock': {
        const { x, y, z } = e.data
        worldChanges[`${x},${y},${z}`] = null
        invalidateNear(x, z)
        self.postMessage({ type: 'breakBlock:done', id, changes: worldChanges })
        break
      }
      case 'placeBlock': {
        const { x, y, z, blockName } = e.data
        worldChanges[`${x},${y},${z}`] = blockName
        invalidateNear(x, z)
        self.postMessage({ type: 'placeBlock:done', id, changes: worldChanges })
        break
      }
      case 'getTerrainHeight': {
        self.postMessage({ type: 'terrainHeight', id, height: getTerrainHeight(e.data.x, e.data.z) })
        break
      }
      case 'raycast': {
        const { origin, direction, maxDist = 6 } = e.data
        let x = origin.x, y = origin.y, z = origin.z
        const len = Math.sqrt(direction.x**2 + direction.y**2 + direction.z**2)
        const nx = direction.x/len, ny = direction.y/len, nz = direction.z/len
        let hit = null, prevX = Math.floor(x), prevY = Math.floor(y), prevZ = Math.floor(z)
        for (let i = 0; i < maxDist * 20; i++) {
          x += nx * 0.05; y += ny * 0.05; z += nz * 0.05
          const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z)
          const id = getBlock(bx, by, bz)
          if (id !== BLOCK.air && id !== BLOCK.water && id !== BLOCK.water_source) {
            hit = { x: bx, y: by, z: bz, blockId: id, name: BLOCK_NAMES[id],
              faceX: prevX, faceY: prevY, faceZ: prevZ }
            break
          }
          prevX = bx; prevY = by; prevZ = bz
        }
        self.postMessage({ type: 'raycast:result', id, hit })
        break
      }
      case 'getBlockNames': {
        self.postMessage({ type: 'blockNames', id, names: Object.keys(BLOCK).filter(k => k !== 'air') })
        break
      }
      default:
        self.postMessage({ type: 'error', id, message: `Unknown: ${type}` })
    }
  } catch(err) {
    self.postMessage({ type: 'error', id, message: err.message })
  }
}
