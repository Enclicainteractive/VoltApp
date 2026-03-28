/**
 * voltcraft-worker.js  –  VoltCraft Web Worker v3
 *
 * Key improvements over v2:
 *  • Generates merged geometry buffers (vertices + colors) per chunk
 *    using face culling – only exposed faces are included.
 *  • Returns Float32Array buffers (transferable) instead of block lists.
 *  • One mesh per chunk instead of one InstancedMesh per block type.
 *  • Dramatically reduces draw calls and main-thread work.
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
const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const smoothstep = (edge0, edge1, value) => {
  const t = clamp((value - edge0) / Math.max(edge1 - edge0, 1e-6), 0, 1)
  return t * t * (3 - 2 * t)
}

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

function ridge(x, z, octaves = 4) {
  let v = 0, amp = 1, freq = 1, max = 0
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(noise(x * freq, z * freq))
    v += n * n * amp
    max += amp
    amp *= 0.55
    freq *= 2.05
  }
  return max > 0 ? v / max : 0
}

function caveNoise(x, y, z) {
  const n1 = noise(x * 0.052 + y * 0.041, z * 0.052 - y * 0.037)
  const n2 = noise(x * 0.085 - y * 0.024 + 200, z * 0.085 + y * 0.029 + 200)
  const n3 = noise(x * 0.028 + z * 0.013, y * 0.09 + 400)
  return n1 * 0.5 + n2 * 0.35 + n3 * 0.15
}

function getClimate(x, z) {
  const temp = noise(x * 0.0024, z * 0.0024)
  const moisture = noise(x * 0.0026 + 100, z * 0.0026 + 100)
  const weirdness = ridge(x * 0.0016 + 300, z * 0.0016 - 300, 3)
  const coldness = Math.max(0, Math.min(1, (-temp + 0.15) / 1.15))
  const aridity = Math.max(0, Math.min(1, (temp - moisture + 0.22) / 1.35))
  const lushness = Math.max(0, Math.min(1, (moisture + 0.28) / 1.2))
  const mountainness = Math.max(0, Math.min(1, (weirdness - 0.34) / 0.56))
  return { temp, moisture, weirdness, coldness, aridity, lushness, mountainness }
}

function getTerrainHeight(x, z) {
  const climate = getClimate(x, z)
  const warpX = fbm(x * 0.11 - 240, z * 0.11 + 180, 3) * 16
  const warpZ = fbm(x * 0.11 + 320, z * 0.11 - 260, 3) * 16
  const nx = x + warpX
  const nz = z + warpZ
  const continental = fbm(nx * 0.22, nz * 0.22, 4)
  const hills = fbm(nx * 0.95, nz * 0.95, 5)
  const ridges = ridge(nx * 0.42, nz * 0.42, 4)
  const valleys = Math.abs(noise(nx * 0.0045 - 500, nz * 0.0045 + 500))
  const erosion = fbm(x * 0.38 + 1200, z * 0.38 - 1200, 3)
  const basin = fbm(nx * 0.12 + 860, nz * 0.12 - 860, 3)
  const river = Math.abs(noise(nx * 0.0036 + 1400, nz * 0.0036 - 1400))
  const riverCut = smoothstep(0.0, 0.18 + climate.lushness * 0.07, river)
  const plateau = smoothstep(0.52, 0.82, ridge(nx * 0.18 - 910, nz * 0.18 + 910, 3))

  let height = 18
  height += continental * 18
  height += hills * (8 + climate.lushness * 3 + climate.mountainness * 4)
  height += ridges * (6 + climate.mountainness * 18 + climate.coldness * 4)
  height -= valleys * (4.5 + climate.aridity * 2.5)
  height -= riverCut * (5.5 + climate.lushness * 3.2)
  height -= smoothstep(0.55, 0.9, basin) * (2.5 + climate.aridity * 1.6)
  height += plateau * (2 + climate.mountainness * 7)
  height -= Math.max(0, erosion) * (2.5 + climate.aridity * 1.5)
  height += climate.mountainness * 10
  height += climate.coldness * 3
  height -= climate.aridity * 2.2

  return Math.max(6, Math.min(92, Math.floor(height)))
}

function getBiome(x, z) {
  const climate = getClimate(x, z)
  if (climate.mountainness > 0.76 && climate.coldness > 0.35) return 'alpine'
  if (climate.mountainness > 0.62) return 'mountains'
  if (climate.aridity > 0.72) return climate.mountainness > 0.3 ? 'badlands' : 'desert'
  if (climate.coldness > 0.62) return 'tundra'
  if (climate.lushness > 0.62 && climate.temp > -0.08) return 'lush'
  if (climate.lushness > 0.4) return 'forest'
  return 'plains'
}

function isCaveCarved(x, y, z, terrainHeight, biome) {
  if (y <= 1 || y >= terrainHeight - 3) return false

  const depth = (terrainHeight - y) / Math.max(terrainHeight, 1)
  const cave = caveNoise(x, y, z)
  const chamber = Math.abs(noise(x * 0.018 + 900, z * 0.018 - 900)) > 0.72
  const shaft = Math.abs(noise(x * 0.014 + 700, z * 0.014 - 700)) > 0.84
  let threshold = 0.66 - Math.min(0.2, depth * 0.18)

  if (biome === 'alpine' || biome === 'mountains') threshold -= 0.03
  if (chamber && y < terrainHeight - 10) threshold -= 0.06
  if (shaft && y > WATER_LEVEL + 6) threshold -= 0.04

  return cave > threshold
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
  tuff:124, calcite:125, dripstone:126, pointed_dripstone:127,
  copper_ore:128, copper_block:129, copper_wire:130, copper_wire_on:131,
  copper_power_source:132, copper_power_source_on:133
}

const BLOCK_NAME_BY_ID = []
for (const [name, id] of Object.entries(BLOCK)) BLOCK_NAME_BY_ID[id] = name

// ─── Block colors (RGB 0-1) ───────────────────────────────────────────────────
// Stored as [r, g, b] floats
const BLOCK_RGB = {
  [BLOCK.grass]:     [0.365, 0.549, 0.180],
  [BLOCK.dirt]:      [0.545, 0.353, 0.169],
  [BLOCK.stone]:     [0.478, 0.478, 0.478],
  [BLOCK.cobblestone]:[0.420, 0.420, 0.420],
  [BLOCK.sand]:      [0.910, 0.831, 0.659],
  [BLOCK.gravel]:    [0.620, 0.553, 0.478],
  [BLOCK.oak_log]:   [0.424, 0.290, 0.102],
  [BLOCK.oak_planks]:[0.627, 0.510, 0.290],
  [BLOCK.leaves]:    [0.184, 0.478, 0.173],
  [BLOCK.water]:     [0.231, 0.510, 0.965],
  [BLOCK.water_source]:[0.169, 0.384, 0.839],
  [BLOCK.bedrock]:   [0.102, 0.102, 0.102],
  [BLOCK.coal_ore]:  [0.239, 0.239, 0.239],
  [BLOCK.iron_ore]:  [0.541, 0.435, 0.306],
  [BLOCK.gold_ore]:  [0.788, 0.635, 0.153],
  [BLOCK.diamond_ore]:[0.306, 0.800, 0.639],
  [BLOCK.obsidian]:  [0.102, 0.102, 0.180],
  [BLOCK.torch]:     [1.000, 0.420, 0.208],
  [BLOCK.glass]:     [0.784, 0.902, 1.000],
  [BLOCK.brick]:     [0.725, 0.306, 0.282],
  [BLOCK.tnt]:       [0.878, 0.192, 0.192],
  [BLOCK.wool]:      [0.961, 0.961, 0.961],
  [BLOCK.wool_red]:  [0.937, 0.267, 0.267],
  [BLOCK.wool_blue]: [0.231, 0.510, 0.965],
  [BLOCK.wool_green]:[0.133, 0.773, 0.369],
  [BLOCK.crafting_table]:[0.545, 0.412, 0.078],
  [BLOCK.furnace]:   [0.290, 0.290, 0.290],
  [BLOCK.chest]:     [0.784, 0.643, 0.290],
  [BLOCK.snow]:      [0.941, 0.957, 1.000],
  [BLOCK.ice]:       [0.659, 0.847, 0.941],
  [BLOCK.cactus]:    [0.239, 0.478, 0.165],
  [BLOCK.sandstone]: [0.831, 0.706, 0.514],
  [BLOCK.mossy_cobblestone]:[0.353, 0.478, 0.290],
  [BLOCK.bookshelf]: [0.545, 0.412, 0.078],
  [BLOCK.sponge]:    [0.831, 0.769, 0.290],
  [BLOCK.lapis_ore]: [0.165, 0.290, 0.541],
  [BLOCK.emerald_ore]:[0.165, 0.541, 0.290],
  [BLOCK.redstone_ore]:[0.541, 0.102, 0.102],
  [BLOCK.glowstone]: [0.941, 0.753, 0.251],
  [BLOCK.netherrack]:[0.416, 0.102, 0.102],
  [BLOCK.soul_sand]: [0.290, 0.227, 0.165],
  [BLOCK.pumpkin]:   [0.831, 0.455, 0.039],
  [BLOCK.melon]:     [0.353, 0.604, 0.165],
  [BLOCK.hay_bale]:  [0.784, 0.627, 0.125],
  [BLOCK.clay]:      [0.541, 0.604, 0.667],
  [BLOCK.gravel_path]:[0.604, 0.541, 0.416],
  [BLOCK.lava]:      [0.878, 0.314, 0.063],
  [BLOCK.lava_source]:[0.878, 0.314, 0.063],
  [BLOCK.wool_yellow]:[0.941, 0.753, 0.251],
  [BLOCK.wool_orange]:[0.878, 0.439, 0.125],
  [BLOCK.wool_purple]:[0.478, 0.165, 0.541],
  [BLOCK.wool_cyan]: [0.165, 0.541, 0.541],
  [BLOCK.wool_magenta]:[0.753, 0.165, 0.541],
  [BLOCK.wool_pink]: [0.941, 0.541, 0.667],
  [BLOCK.wool_lime]: [0.416, 0.816, 0.125],
  [BLOCK.wool_gray]: [0.416, 0.416, 0.416],
  [BLOCK.wool_light_gray]:[0.604, 0.604, 0.604],
  [BLOCK.wool_brown]:[0.416, 0.227, 0.102],
  [BLOCK.wool_black]:[0.102, 0.102, 0.102],
  [BLOCK.concrete_white]:[0.878, 0.878, 0.878],
  [BLOCK.concrete_red]:[0.753, 0.125, 0.125],
  [BLOCK.concrete_blue]:[0.125, 0.251, 0.753],
  [BLOCK.concrete_green]:[0.125, 0.502, 0.125],
  [BLOCK.concrete_yellow]:[0.753, 0.627, 0.125],
  [BLOCK.concrete_orange]:[0.753, 0.376, 0.125],
  [BLOCK.concrete_purple]:[0.376, 0.125, 0.565],
  [BLOCK.terracotta]:[0.627, 0.314, 0.188],
  [BLOCK.terracotta_red]:[0.565, 0.125, 0.125],
  [BLOCK.terracotta_blue]:[0.125, 0.251, 0.376],
  [BLOCK.terracotta_yellow]:[0.627, 0.502, 0.125],
  [BLOCK.quartz]:    [0.941, 0.925, 0.910],
  [BLOCK.quartz_pillar]:[0.910, 0.894, 0.878],
  [BLOCK.prismarine]:[0.165, 0.541, 0.478],
  [BLOCK.sea_lantern]:[0.627, 0.847, 0.816],
  [BLOCK.end_stone]: [0.847, 0.831, 0.627],
  [BLOCK.purpur]:    [0.541, 0.290, 0.541],
  [BLOCK.nether_brick]:[0.165, 0.063, 0.063],
  [BLOCK.red_sandstone]:[0.753, 0.314, 0.125],
  [BLOCK.andesite]:  [0.541, 0.541, 0.541],
  [BLOCK.diorite]:   [0.753, 0.753, 0.753],
  [BLOCK.granite]:   [0.627, 0.376, 0.251],
  [BLOCK.polished_andesite]:[0.565, 0.565, 0.565],
  [BLOCK.polished_diorite]:[0.784, 0.784, 0.784],
  [BLOCK.polished_granite]:[0.659, 0.408, 0.282],
  [BLOCK.smooth_stone]:[0.502, 0.502, 0.502],
  [BLOCK.cut_sandstone]:[0.816, 0.722, 0.431],
  [BLOCK.chiseled_sandstone]:[0.784, 0.690, 0.376],
  [BLOCK.chiseled_stone_bricks]:[0.439, 0.439, 0.439],
  [BLOCK.stone_bricks]:[0.471, 0.471, 0.471],
  [BLOCK.cracked_stone_bricks]:[0.416, 0.416, 0.416],
  [BLOCK.mossy_stone_bricks]:[0.353, 0.478, 0.353],
  [BLOCK.infested_stone]:[0.478, 0.478, 0.416],
  [BLOCK.mycelium]:  [0.478, 0.353, 0.478],
  [BLOCK.podzol]:    [0.416, 0.290, 0.165],
  [BLOCK.coarse_dirt]:[0.478, 0.314, 0.188],
  [BLOCK.rooted_dirt]:[0.478, 0.314, 0.188],
  [BLOCK.mud]:       [0.353, 0.290, 0.227],
  [BLOCK.packed_mud]:[0.416, 0.314, 0.251],
  [BLOCK.mud_bricks]:[0.478, 0.353, 0.251],
  [BLOCK.deepslate]: [0.290, 0.290, 0.353],
  [BLOCK.cobbled_deepslate]:[0.314, 0.376, 0.376],
  [BLOCK.polished_deepslate]:[0.282, 0.282, 0.345],
  [BLOCK.deepslate_bricks]:[0.282, 0.282, 0.345],
  [BLOCK.deepslate_tiles]:[0.251, 0.251, 0.314],
  [BLOCK.reinforced_deepslate]:[0.220, 0.220, 0.282],
  [BLOCK.tuff]:      [0.416, 0.416, 0.353],
  [BLOCK.calcite]:   [0.847, 0.847, 0.816],
  [BLOCK.dripstone]: [0.541, 0.478, 0.416],
  [BLOCK.pointed_dripstone]:[0.541, 0.478, 0.416],
  [BLOCK.copper_ore]:[0.722, 0.494, 0.318],
  [BLOCK.copper_block]:[0.722, 0.494, 0.318],
  [BLOCK.copper_wire]:[0.659, 0.427, 0.231],
  [BLOCK.copper_wire_on]:[1.000, 0.702, 0.314],
  [BLOCK.copper_power_source]:[0.427, 0.690, 0.427],
  [BLOCK.copper_power_source_on]:[0.651, 0.914, 0.525],
}

// Default color for unknown blocks
const DEFAULT_RGB = [1.0, 0.0, 1.0]

function getBlockRGB(id) {
  return BLOCK_RGB[id] || DEFAULT_RGB
}

// ─── Transparency / emissive ──────────────────────────────────────────────────
const TRANSPARENT_BLOCK = new Uint8Array(256)
TRANSPARENT_BLOCK[BLOCK.air] = 1
TRANSPARENT_BLOCK[BLOCK.water] = 1
TRANSPARENT_BLOCK[BLOCK.water_source] = 1
TRANSPARENT_BLOCK[BLOCK.leaves] = 1
TRANSPARENT_BLOCK[BLOCK.glass] = 1
TRANSPARENT_BLOCK[BLOCK.lava] = 1
TRANSPARENT_BLOCK[BLOCK.lava_source] = 1

function isTransparent(id) {
  return TRANSPARENT_BLOCK[id] === 1
}

function isPassableForSpawn(id) {
  return id === BLOCK.air
    || id === BLOCK.water
    || id === BLOCK.water_source
    || id === BLOCK.lava
    || id === BLOCK.lava_source
    || id === BLOCK.leaves
    || id === BLOCK.glass
    || id === BLOCK.flower_red
    || id === BLOCK.flower_yellow
    || id === BLOCK.mushroom
    || id === BLOCK.tall_grass
    || id === BLOCK.dead_bush
}

// ─── World state ──────────────────────────────────────────────────────────────
let worldChanges = {}
const POWER_RADIUS = 12
const ELECTRICAL_NEIGHBORS = [
  [1, 0, 0], [-1, 0, 0],
  [0, 1, 0], [0, -1, 0],
  [0, 0, 1], [0, 0, -1],
]

function isWireId(id) {
  return id === BLOCK.copper_wire || id === BLOCK.copper_wire_on
}

function isPowerSourceId(id) {
  return id === BLOCK.copper_power_source || id === BLOCK.copper_power_source_on
}

function normalizeBlockName(name) {
  if (name === 'power_source') return 'copper_power_source'
  if (name === 'copper_power_source' || name === 'copper_power_source_on') return name
  if (name === 'copper_wire' || name === 'copper_wire_on') return name
  return name
}

function canonicalElectricalName(name) {
  name = normalizeBlockName(name)
  if (name === 'copper_wire_on') return 'copper_wire'
  if (name === 'copper_power_source_on') return 'copper_power_source'
  return name
}

function parseWorldKey(key) {
  const [x, y, z] = key.split(',').map(Number)
  return { x, y, z }
}

function setBlockName(x, y, z, blockName) {
  worldChanges[`${x},${y},${z}`] = normalizeBlockName(blockName)
}

function getBlockName(x, y, z) {
  const key = `${x},${y},${z}`
  if (key in worldChanges) {
    const value = worldChanges[key]
    if (value === null || value === '__void') return 'air'
    return normalizeBlockName(value)
  }
  return BLOCK_NAME_BY_ID[getBaseBlock(x, y, z)] || 'air'
}

function normalizeWorldChanges(changes = {}) {
  const next = {}
  for (const [key, value] of Object.entries(changes)) {
    next[key] = value === null || value === '__void' ? value : normalizeBlockName(value)
  }
  return next
}

function getElectricalBlockState(x, y, z) {
  const id = getBlock(x, y, z)
  return {
    id,
    name: BLOCK_NAME_BY_ID[id] || 'air',
    isWire: isWireId(id),
    isSource: isPowerSourceId(id),
    powered: id === BLOCK.copper_wire_on || id === BLOCK.copper_power_source_on,
  }
}

function recomputeElectricalRegion(originX, originY, originZ, radius = POWER_RADIUS) {
  const minX = originX - radius
  const maxX = originX + radius
  const minY = Math.max(0, originY - radius)
  const maxY = originY + radius
  const minZ = originZ - radius
  const maxZ = originZ + radius

  const wires = new Map()
  const sources = []
  const changedKeys = new Set()

  for (const [key, rawValue] of Object.entries(worldChanges)) {
    if (rawValue === null || rawValue === '__void') continue
    const value = canonicalElectricalName(rawValue)
    if (value !== 'copper_wire' && value !== 'copper_power_source') continue
    const { x, y, z } = parseWorldKey(key)
    if (x < minX || x > maxX || y < minY || y > maxY || z < minZ || z > maxZ) continue
    if (value === 'copper_wire') {
      wires.set(key, { x, y, z })
    } else {
      sources.push({ x, y, z, key })
    }
  }

  const poweredWires = new Set()
  const queue = [...sources]
  const visited = new Set(sources.map(source => source.key))

  while (queue.length > 0) {
    const current = queue.shift()
    for (const [dx, dy, dz] of ELECTRICAL_NEIGHBORS) {
      const nx = current.x + dx
      const ny = current.y + dy
      const nz = current.z + dz
      const nKey = `${nx},${ny},${nz}`
      if (visited.has(nKey)) continue
      const wire = wires.get(nKey)
      if (!wire) continue
      visited.add(nKey)
      poweredWires.add(nKey)
      queue.push(wire)
    }
  }

  for (const source of sources) {
    const currentName = getBlockName(source.x, source.y, source.z)
    if (currentName !== 'copper_power_source_on') {
      setBlockName(source.x, source.y, source.z, 'copper_power_source_on')
      changedKeys.add(source.key)
    }
  }

  for (const [key, wire] of wires.entries()) {
    const nextName = poweredWires.has(key) ? 'copper_wire_on' : 'copper_wire'
    if (getBlockName(wire.x, wire.y, wire.z) !== nextName) {
      setBlockName(wire.x, wire.y, wire.z, nextName)
      changedKeys.add(key)
    }
  }

  return [...changedKeys]
}

function recomputeAllElectrical() {
  const changedKeys = new Set()
  const electricalCoords = []

  for (const [key, rawValue] of Object.entries(worldChanges)) {
    if (rawValue === null || rawValue === '__void') continue
    const value = canonicalElectricalName(rawValue)
    if (value !== 'copper_wire' && value !== 'copper_power_source') continue
    const coord = parseWorldKey(key)
    electricalCoords.push(coord)
  }

  electricalCoords.forEach(({ x, y, z }) => {
    recomputeElectricalRegion(x, y, z).forEach((key) => changedKeys.add(key))
  })

  return [...changedKeys]
}

function getBaseBlock(x, y, z) {
  if (y < 0) return BLOCK.bedrock
  const th = getTerrainHeight(x, z)
  const biome = getBiome(x, z)
  const beach = th <= WATER_LEVEL + 2
  const forestCluster = fbm(x * 0.12 + 80, z * 0.12 - 80, 3)
  const groveMask = ridge(x * 0.055 - 430, z * 0.055 + 430, 3)
  const treeBias = biome === 'forest'
    ? 0.14
    : biome === 'lush'
      ? 0.1
      : biome === 'plains'
        ? -0.03
        : -0.08

  if (y > th) {
    if (y <= WATER_LEVEL) return beach ? BLOCK.water : BLOCK.air
    const treeNoise = noise(x * 0.3 + 7, z * 0.3 + 7) + forestCluster * 0.32 + groveMask * 0.18 + treeBias
    const floraNoise = noise(x * 0.22 - 140, z * 0.22 + 140)
    if (y === th + 1 && treeNoise > (biome === 'forest' ? 0.3 : 0.5) && !beach && biome !== 'desert' && biome !== 'badlands') {
      if (noise(x * 1.1, z * 1.1) > 0.3) return BLOCK.oak_log
    }
    if (y >= th + 2 && y <= th + (biome === 'forest' ? 5 : 4) && treeNoise > (biome === 'forest' ? 0.3 : 0.5) && !beach && biome !== 'desert' && biome !== 'badlands') {
      if (noise(x * 0.8 + y, z * 0.8 + y) > -0.2) return BLOCK.leaves
    }
    if (y === th + 1 && (biome === 'desert' || biome === 'badlands') && noise(x * 0.5, z * 0.5) > 0.6) return BLOCK.cactus
    if (y === th + 1 && biome === 'plains' && floraNoise > 0.74) return BLOCK.flower_yellow
    if (y === th + 1 && biome === 'lush' && floraNoise > 0.58) return BLOCK.mushroom
    if (y === th + 1 && biome === 'forest' && floraNoise > 0.62) return BLOCK.tall_grass
    if (y === th + 1 && biome === 'badlands' && floraNoise > 0.72) return BLOCK.dead_bush
    return BLOCK.air
  }

  if (y === 0) return BLOCK.bedrock
  if (isCaveCarved(x, y, z, th, biome)) {
    return y < 3 ? BLOCK.lava_source : BLOCK.air
  }
  if (y < th - 8) {
    const on = noise(x * 0.4 + 50, y * 0.4 + 50 + z * 0.4)
    if (y < 4 && on > 0.7) return BLOCK.diamond_ore
    if (y < 8 && on > 0.65) return BLOCK.gold_ore
    if (on > 0.6) return BLOCK.iron_ore
    if (on > 0.55) return BLOCK.coal_ore
    if (y < 18 && noise(x * 0.55 + 420, y * 0.55 + z * 0.55) > 0.68) return BLOCK.copper_ore
    if (y < 3 && noise(x * 0.6, y * 0.6 + z * 0.6) > 0.72) return BLOCK.lapis_ore
    if (y < 6 && noise(x * 0.7 + 200, y * 0.7 + z * 0.7) > 0.74) return BLOCK.redstone_ore
    if (y < 10 && noise(x * 0.5 + 300, y * 0.5 + z * 0.5) > 0.76) return BLOCK.emerald_ore
    if (y < 18 && noise(x * 0.05 + 600, z * 0.05 - 600) > 0.42) return BLOCK.deepslate
    return y < 24 ? BLOCK.deepslate : BLOCK.stone
  }
  if (y < th - 4) {
    const strat = noise(x * 0.03 + y * 0.04 + 800, z * 0.03 - y * 0.04 - 800)
    if (y < 26 && strat > 0.38) return BLOCK.tuff
    if (y < 22 && strat < -0.42) return BLOCK.calcite
    if (y < 24) return BLOCK.deepslate
    return BLOCK.stone
  }
  if (y < th) {
    if (beach || biome === 'desert') return BLOCK.sand
    if (biome === 'badlands') return y < th - 1 ? BLOCK.red_sandstone : BLOCK.terracotta
    if (biome === 'tundra') return BLOCK.gravel
    if (biome === 'forest') return noise(x * 0.08, z * 0.08) > 0.25 ? BLOCK.podzol : BLOCK.dirt
    if (biome === 'lush') return noise(x * 0.09 + 50, z * 0.09 - 50) > 0.3 ? BLOCK.rooted_dirt : BLOCK.dirt
    return BLOCK.dirt
  }
  if (beach || biome === 'desert') return BLOCK.sand
  if (biome === 'badlands') return noise(x * 0.06 + 25, z * 0.06 - 25) > 0.1 ? BLOCK.terracotta_red : BLOCK.terracotta
  if (biome === 'tundra') return BLOCK.snow
  if (biome === 'alpine') return y > 34 ? BLOCK.snow : BLOCK.stone
  if (biome === 'mountains') return y > 28 ? BLOCK.snow : BLOCK.stone
  if (biome === 'forest') return noise(x * 0.09, z * 0.09) > 0.45 ? BLOCK.podzol : BLOCK.grass
  if (biome === 'lush') return noise(x * 0.07 - 90, z * 0.07 + 90) > 0.38 ? BLOCK.mycelium : BLOCK.grass
  return BLOCK.grass
}

function getBlock(x, y, z) {
  const key = `${x},${y},${z}`
  if (key in worldChanges) {
    const v = worldChanges[key]
    if (v === null || v === '__void') return BLOCK.air
    return BLOCK[normalizeBlockName(v)] ?? BLOCK.air
  }
  return getBaseBlock(x, y, z)
}

// ─── Face normals and AO shading ──────────────────────────────────────────────
// Face order: +X, -X, +Y, -Y, +Z, -Z
const FACE_NORMALS = [
  [1,0,0], [-1,0,0], [0,1,0], [0,-1,0], [0,0,1], [0,0,-1]
]
// Brightness multiplier per face for simple directional shading
const FACE_BRIGHTNESS = [0.8, 0.7, 1.0, 0.5, 0.75, 0.75]

// Quad vertices for each face (local offsets from block origin)
// Each face = 4 vertices, each vertex = [x, y, z]
const FACE_VERTS = [
  // +X face
  [[1,0,0],[1,1,0],[1,1,1],[1,0,1]],
  // -X face
  [[0,0,1],[0,1,1],[0,1,0],[0,0,0]],
  // +Y face
  [[0,1,0],[0,1,1],[1,1,1],[1,1,0]],
  // -Y face
  [[0,0,1],[0,0,0],[1,0,0],[1,0,1]],
  // +Z face
  [[1,0,1],[1,1,1],[0,1,1],[0,0,1]],
  // -Z face
  [[0,0,0],[0,1,0],[1,1,0],[1,0,0]],
]

// Neighbor offsets for each face
const FACE_NEIGHBORS = [
  [1,0,0], [-1,0,0], [0,1,0], [0,-1,0], [0,0,1], [0,0,-1]
]

const PADDED_SIZE = CHUNK_SIZE + 2

function buildChunkField(cx, cz, yMin, yMax) {
  const sx = cx * CHUNK_SIZE
  const sz = cz * CHUNK_SIZE
  const paddedHeight = yMax - yMin + 3
  const xStride = paddedHeight * PADDED_SIZE
  const yStride = PADDED_SIZE
  const blocks = new Uint16Array(PADDED_SIZE * PADDED_SIZE * paddedHeight)

  let ptr = 0
  for (let lx = -1; lx <= CHUNK_SIZE; lx++) {
    const wx = sx + lx
    for (let y = yMin - 1; y <= yMax + 1; y++) {
      for (let lz = -1; lz <= CHUNK_SIZE; lz++) {
        blocks[ptr++] = getBlock(wx, y, sz + lz)
      }
    }
  }

  return { blocks, sx, sz, yMin, yMax, paddedHeight, xStride, yStride }
}

/**
 * Build a merged geometry buffer for a single chunk.
 * Returns { positions: Float32Array, colors: Float32Array, indices: Uint32Array }
 * All transferable.
 */
function buildChunkGeometry(cx, cz) {
  // Determine Y range for this chunk
  let yMin = 0, yMax = 0
  const sx = cx * CHUNK_SIZE
  const sz = cz * CHUNK_SIZE
  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const th = getTerrainHeight(sx + lx, sz + lz)
      if (th + 5 > yMax) yMax = th + 5
    }
  }
  yMax = Math.min(yMax, 96)
  const field = buildChunkField(cx, cz, yMin, yMax)
  const { blocks, paddedHeight, xStride, yStride } = field
  let containsElectrical = false
  let containsPoweredElectrical = false

  let visibleFaces = 0
  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    const fieldX = lx + 1
    for (let y = yMin; y <= yMax; y++) {
      const fieldY = y - yMin + 1
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const fieldZ = lz + 1
        const centerIndex = fieldX * xStride + fieldY * yStride + fieldZ
        const id = blocks[centerIndex]
        if (id === BLOCK.air) continue
        if (isWireId(id) || isPowerSourceId(id)) {
          containsElectrical = true
          if (id === BLOCK.copper_wire_on || id === BLOCK.copper_power_source_on) {
            containsPoweredElectrical = true
          }
        }

        if (isTransparent(blocks[centerIndex + xStride])) visibleFaces += 1
        if (isTransparent(blocks[centerIndex - xStride])) visibleFaces += 1
        if (isTransparent(blocks[centerIndex + yStride])) visibleFaces += 1
        if (isTransparent(blocks[centerIndex - yStride])) visibleFaces += 1
        if (isTransparent(blocks[centerIndex + 1])) visibleFaces += 1
        if (isTransparent(blocks[centerIndex - 1])) visibleFaces += 1
      }
    }
  }

  const positions = new Float32Array(visibleFaces * 12)
  const colors = new Float32Array(visibleFaces * 12)
  const indices = new Uint32Array(visibleFaces * 6)

  let vertCount = 0
  let faceCursor = 0

  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    const wx = sx + lx
    const fieldX = lx + 1
    for (let y = yMin; y <= yMax; y++) {
      const fieldY = y - yMin + 1
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const wz = sz + lz
        const fieldZ = lz + 1
        const centerIndex = fieldX * xStride + fieldY * yStride + fieldZ
        const id = blocks[centerIndex]
        if (id === BLOCK.air) continue

        const rgb = getBlockRGB(id)

        for (let f = 0; f < 6; f++) {
          const [nx, ny, nz] = FACE_NEIGHBORS[f]
          const neighborIndex = centerIndex + nx * xStride + ny * yStride + nz
          if (!isTransparent(blocks[neighborIndex])) continue

          const brightness = FACE_BRIGHTNESS[f]
          const r = rgb[0] * brightness
          const g = rgb[1] * brightness
          const b = rgb[2] * brightness
          const verts = FACE_VERTS[f]

          const posOffset = faceCursor * 12
          const colorOffset = posOffset
          const indexOffset = faceCursor * 6
          const baseIdx = vertCount

          for (let v = 0; v < 4; v++) {
            const vertexOffset = posOffset + v * 3
            positions[vertexOffset] = wx + verts[v][0]
            positions[vertexOffset + 1] = y + verts[v][1]
            positions[vertexOffset + 2] = wz + verts[v][2]
            colors[vertexOffset] = r
            colors[vertexOffset + 1] = g
            colors[vertexOffset + 2] = b
          }

          indices[indexOffset] = baseIdx
          indices[indexOffset + 1] = baseIdx + 1
          indices[indexOffset + 2] = baseIdx + 2
          indices[indexOffset + 3] = baseIdx
          indices[indexOffset + 4] = baseIdx + 2
          indices[indexOffset + 5] = baseIdx + 3

          vertCount += 4
          faceCursor += 1
        }
      }
    }
  }

  return {
    positions,
    colors,
    indices,
    cx, cz,
    vertCount,
    faceCount: faceCursor * 2,
    bounds: {
      min: [sx, yMin, sz],
      max: [sx + CHUNK_SIZE, yMax + 1, sz + CHUNK_SIZE],
    },
    containsElectrical,
    containsPoweredElectrical,
  }
}

// ─── Chunk geometry cache ─────────────────────────────────────────────────────
const geomCache = new Map()

function getChunkGeometry(cx, cz) {
  const key = `${cx},${cz}`
  if (geomCache.has(key)) return geomCache.get(key)
  const geom = buildChunkGeometry(cx, cz)
  geomCache.set(key, geom)
  return geom
}

function getSurfaceAnchor(x, z) {
  const th = getTerrainHeight(x, z)
  const biome = getBiome(x, z)
  const scanTop = Math.min(96, th + 8)
  for (let y = scanTop; y >= 0; y--) {
    const block = getBlock(x, y, z)
    if (isPassableForSpawn(block)) continue
    const above1 = getBlock(x, y + 1, z)
    const above2 = getBlock(x, y + 2, z)
    if (isPassableForSpawn(above1) && isPassableForSpawn(above2)) {
      return {
        x,
        z,
        groundY: y,
        terrainHeight: th,
        block,
        blockName: BLOCK_NAME_BY_ID[block] || 'air',
        biome,
        submerged: above1 === BLOCK.water || above1 === BLOCK.water_source,
      }
    }
  }
  return {
    x,
    z,
    groundY: th,
    terrainHeight: th,
    block: getBlock(x, th, z),
    blockName: BLOCK_NAME_BY_ID[getBlock(x, th, z)] || 'air',
    biome,
    submerged: false,
  }
}

function invalidateExplosion(x, y, z, radius) {
  const minCx = Math.floor((x - radius - 1) / CHUNK_SIZE)
  const maxCx = Math.floor((x + radius + 1) / CHUNK_SIZE)
  const minCz = Math.floor((z - radius - 1) / CHUNK_SIZE)
  const maxCz = Math.floor((z + radius + 1) / CHUNK_SIZE)
  for (let cx = minCx; cx <= maxCx; cx++) {
    for (let cz = minCz; cz <= maxCz; cz++) {
      geomCache.delete(`${cx},${cz}`)
    }
  }
}

function invalidateNear(x, z) {
  const cx = Math.floor(x / CHUNK_SIZE)
  const cz = Math.floor(z / CHUNK_SIZE)
  geomCache.delete(`${cx},${cz}`)

  const localX = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE
  const localZ = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE

  if (localX === 0) geomCache.delete(`${cx - 1},${cz}`)
  if (localX === CHUNK_SIZE - 1) geomCache.delete(`${cx + 1},${cz}`)
  if (localZ === 0) geomCache.delete(`${cx},${cz - 1}`)
  if (localZ === CHUNK_SIZE - 1) geomCache.delete(`${cx},${cz + 1}`)
}

function intBound(origin, dir) {
  if (dir === 0) return Infinity
  if (dir > 0) return (Math.floor(origin + 1) - origin) / dir
  return (origin - Math.floor(origin)) / -dir
}

function raycastVoxel(origin, direction, maxDist) {
  const len = Math.sqrt(direction.x ** 2 + direction.y ** 2 + direction.z ** 2)
  if (!Number.isFinite(len) || len === 0) return null

  const dx = direction.x / len
  const dy = direction.y / len
  const dz = direction.z / len

  let x = Math.floor(origin.x)
  let y = Math.floor(origin.y)
  let z = Math.floor(origin.z)

  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0
  const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0
  const stepZ = dz > 0 ? 1 : dz < 0 ? -1 : 0

  let tMaxX = intBound(origin.x, dx)
  let tMaxY = intBound(origin.y, dy)
  let tMaxZ = intBound(origin.z, dz)
  const tDeltaX = stepX === 0 ? Infinity : Math.abs(1 / dx)
  const tDeltaY = stepY === 0 ? Infinity : Math.abs(1 / dy)
  const tDeltaZ = stepZ === 0 ? Infinity : Math.abs(1 / dz)

  let faceX = x
  let faceY = y
  let faceZ = z
  let traveled = 0

  while (traveled <= maxDist) {
    const bid = getBlock(x, y, z)
    if (bid !== BLOCK.air && bid !== BLOCK.water && bid !== BLOCK.water_source) {
      return {
        x, y, z, blockId: bid, name: BLOCK_NAME_BY_ID[bid], faceX, faceY, faceZ,
        powered: bid === BLOCK.copper_wire_on || bid === BLOCK.copper_power_source_on,
      }
    }

    faceX = x
    faceY = y
    faceZ = z

    if (tMaxX < tMaxY) {
      if (tMaxX < tMaxZ) {
        x += stepX
        traveled = tMaxX
        tMaxX += tDeltaX
      } else {
        z += stepZ
        traveled = tMaxZ
        tMaxZ += tDeltaZ
      }
    } else if (tMaxY < tMaxZ) {
      y += stepY
      traveled = tMaxY
      tMaxY += tDeltaY
    } else {
      z += stepZ
      traveled = tMaxZ
      tMaxZ += tDeltaZ
    }
  }

  return null
}

function explodeTNT(x, y, z, radius = 3) {
  const removedBlocks = []
  const triggeredTnt = []
  const radiusSq = radius * radius

  worldChanges[`${x},${y},${z}`] = null
  removedBlocks.push({ x, y, z })

  for (let bx = x - radius; bx <= x + radius; bx++) {
    for (let by = y - radius; by <= y + radius; by++) {
      for (let bz = z - radius; bz <= z + radius; bz++) {
        const dx = bx - x
        const dy = by - y
        const dz = bz - z
        if ((dx * dx) + (dy * dy) + (dz * dz) > radiusSq) continue
        if (bx === x && by === y && bz === z) continue

        const bid = getBlock(bx, by, bz)
        if (bid === BLOCK.air || bid === BLOCK.water || bid === BLOCK.water_source || bid === BLOCK.lava || bid === BLOCK.lava_source) continue
        if (bid === BLOCK.bedrock) continue
        if (bid === BLOCK.tnt) {
          triggeredTnt.push({ x: bx, y: by, z: bz })
          continue
        }

        worldChanges[`${bx},${by},${bz}`] = null
        removedBlocks.push({ x: bx, y: by, z: bz })
      }
    }
  }

  invalidateExplosion(x, y, z, radius)
  return { changes: worldChanges, removedBlocks, triggeredTnt, radius }
}

// ─── Message handler ──────────────────────────────────────────────────────────
self.onmessage = function(e) {
  const { type, id } = e.data
  try {
    switch (type) {
      case 'init': {
        initPerlin(e.data.seed ?? 42)
        worldChanges = {}
        geomCache.clear()
        self.postMessage({ type: 'init:done', id, seed: e.data.seed })
        break
      }

      case 'getChunkGeometry': {
        // Returns geometry for a single chunk (transferable buffers)
        const { cx, cz } = e.data
        const geom = getChunkGeometry(cx, cz)
        // Transfer the buffers to avoid copying
        self.postMessage(
          { type: 'chunkGeometry', id, cx, cz,
            positions: geom.positions,
            colors: geom.colors,
            indices: geom.indices,
            vertCount: geom.vertCount,
            faceCount: geom.faceCount,
            bounds: geom.bounds,
            containsElectrical: geom.containsElectrical,
            containsPoweredElectrical: geom.containsPoweredElectrical,
          },
          [geom.positions.buffer, geom.colors.buffer, geom.indices.buffer]
        )
        // Remove from cache since buffers are now transferred (neutered)
        geomCache.delete(`${cx},${cz}`)
        break
      }

      case 'setWorldChanges': {
        worldChanges = normalizeWorldChanges(e.data.changes ?? {})
        const electricalChanges = recomputeAllElectrical()
        geomCache.clear()
        self.postMessage({ type: 'setWorldChanges:done', id, changes: worldChanges, electricalChanges })
        break
      }

      case 'breakBlock': {
        const { x, y, z } = e.data
        worldChanges[`${x},${y},${z}`] = null
        const electricalChanges = recomputeElectricalRegion(x, y, z)
        invalidateNear(x, z)
        electricalChanges.forEach((key) => {
          const { x: ex, z: ez } = parseWorldKey(key)
          invalidateNear(ex, ez)
        })
        self.postMessage({ type: 'breakBlock:done', id, changes: worldChanges, electricalChanges })
        break
      }

      case 'placeBlock': {
        const { x, y, z, blockName } = e.data
        worldChanges[`${x},${y},${z}`] = normalizeBlockName(blockName)
        const electricalChanges = recomputeElectricalRegion(x, y, z)
        invalidateNear(x, z)
        electricalChanges.forEach((key) => {
          const { x: ex, z: ez } = parseWorldKey(key)
          invalidateNear(ex, ez)
        })
        self.postMessage({ type: 'placeBlock:done', id, changes: worldChanges, electricalChanges })
        break
      }

      case 'explodeTNT': {
        const { x, y, z, radius = 3 } = e.data
        const result = explodeTNT(x, y, z, radius)
        self.postMessage({ type: 'explodeTNT:done', id, ...result })
        break
      }

      case 'getTerrainHeight': {
        self.postMessage({ type: 'terrainHeight', id, height: getTerrainHeight(e.data.x, e.data.z) })
        break
      }

      case 'getSurfaceAnchor': {
        const { x, z } = e.data
        self.postMessage({ type: 'surfaceAnchor', id, ...getSurfaceAnchor(x, z) })
        break
      }

      case 'raycast': {
        const { origin, direction, maxDist = 6 } = e.data
        const hit = raycastVoxel(origin, direction, maxDist)
        self.postMessage({ type: 'raycast:result', id, hit })
        break
      }

      case 'getPowerState': {
        const { x, y, z } = e.data
        self.postMessage({ type: 'powerState', id, state: getElectricalBlockState(x, y, z) })
        break
      }

      default:
        self.postMessage({ type: 'error', id, message: `Unknown: ${type}` })
    }
  } catch(err) {
    self.postMessage({ type: 'error', id, message: err.message })
  }
}
