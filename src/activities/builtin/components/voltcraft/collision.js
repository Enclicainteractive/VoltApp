/**
 * collision.js  –  VoltCraft client-side voxel collision
 *
 * Replicates the worker's terrain generation on the main thread so we can
 * do synchronous AABB collision without any async round-trips.
 *
 * Also maintains a local block-change cache (worldChanges) that is kept in
 * sync with the worker via the VoltCraftActivity component.
 *
 * Usage:
 *   import { initCollision, setCollisionChanges, isSolid, isWater,
 *            resolveAABB, raycastVoxel } from './voltcraft/collision'
 *
 *   initCollision(seed)
 *   setCollisionChanges(changes)   // call whenever worldChanges updates
 *
 *   // In useFrame:
 *   const result = resolveAABB(pos, vel, dt, playerW, playerH)
 *   // result = { pos, vel, onGround, inWater }
 */

// ─── Perlin noise (mirrors worker exactly) ────────────────────────────────────
const _p = new Uint8Array(512)
let _seed = 42

export function initCollision(seed) {
  _seed = (seed >>> 0)
  const perm = new Uint8Array(256)
  for (let i = 0; i < 256; i++) perm[i] = i
  let r = _seed
  for (let i = 255; i > 0; i--) {
    r = (Math.imul(r, 1664525) + 1013904223) & 0xffffffff
    const j = ((r >>> 0) % (i + 1))
    const t = perm[i]; perm[i] = perm[j]; perm[j] = t
  }
  for (let i = 0; i < 512; i++) _p[i] = perm[i & 255]
  _worldChanges = {}
}

const _fade = t => t * t * t * (t * (t * 6 - 15) + 10)
const _lerp = (a, b, t) => a + t * (b - a)
const _grad = (h, x, y) => {
  const u = h < 2 ? x : y, v = h < 2 ? y : x
  return ((h & 1) ? -u : u) + ((h & 2) ? -v : v)
}

function _noise(x, y) {
  const X = Math.floor(x) & 255, Y = Math.floor(y) & 255
  const xf = x - Math.floor(x), yf = y - Math.floor(y)
  const u = _fade(xf), v = _fade(yf)
  return _lerp(
    _lerp(_grad(_p[_p[X] + Y], xf, yf), _grad(_p[_p[X + 1] + Y], xf - 1, yf), u),
    _lerp(_grad(_p[_p[X] + Y + 1], xf, yf - 1), _grad(_p[_p[X + 1] + Y + 1], xf - 1, yf - 1), u),
    v
  )
}

function _fbm(x, z, octaves = 5) {
  let v = 0, amp = 1, freq = 1, max = 0
  for (let i = 0; i < octaves; i++) {
    v += _noise(x * freq * 0.008, z * freq * 0.008) * amp
    max += amp; amp *= 0.5; freq *= 2.1
  }
  return v / max
}

function _climate(x, z) {
  const temp = _noise(x * 0.0024, z * 0.0024)
  const moisture = _noise(x * 0.0026 + 100, z * 0.0026 + 100)
  const weirdness = _ridge(x * 0.0016 + 300, z * 0.0016 - 300, 3)
  const coldness = Math.max(0, Math.min(1, (-temp + 0.15) / 1.15))
  const aridity = Math.max(0, Math.min(1, (temp - moisture + 0.22) / 1.35))
  const lushness = Math.max(0, Math.min(1, (moisture + 0.28) / 1.2))
  const mountainness = Math.max(0, Math.min(1, (weirdness - 0.34) / 0.56))
  return { temp, moisture, weirdness, coldness, aridity, lushness, mountainness }
}

function _terrainHeight(x, z) {
  const climate = _climate(x, z)
  const continental = _fbm(x * 0.22, z * 0.22, 4)
  const hills = _fbm(x * 0.95, z * 0.95, 5)
  const ridges = _ridge(x * 0.42, z * 0.42, 4)
  const valleys = Math.abs(_noise(x * 0.0045 - 500, z * 0.0045 + 500))
  const erosion = _fbm(x * 0.38 + 1200, z * 0.38 - 1200, 3)

  let height = 18
  height += continental * 18
  height += hills * (8 + climate.lushness * 3 + climate.mountainness * 4)
  height += ridges * (6 + climate.mountainness * 18 + climate.coldness * 4)
  height -= valleys * (4.5 + climate.aridity * 2.5)
  height -= Math.max(0, erosion) * (2.5 + climate.aridity * 1.5)
  height += climate.mountainness * 10
  height += climate.coldness * 3
  height -= climate.aridity * 2.2

  return Math.max(6, Math.min(92, Math.floor(height)))
}

function _biome(x, z) {
  const climate = _climate(x, z)
  if (climate.mountainness > 0.76 && climate.coldness > 0.35) return 'alpine'
  if (climate.mountainness > 0.62) return 'mountains'
  if (climate.aridity > 0.72) return climate.mountainness > 0.3 ? 'badlands' : 'desert'
  if (climate.coldness > 0.62) return 'tundra'
  if (climate.lushness > 0.62 && climate.temp > -0.08) return 'lush'
  if (climate.lushness > 0.4) return 'forest'
  return 'plains'
}

function _caveNoise(x, y, z) {
  const n1 = _noise(x * 0.052 + y * 0.041, z * 0.052 - y * 0.037)
  const n2 = _noise(x * 0.085 - y * 0.024 + 200, z * 0.085 + y * 0.029 + 200)
  const n3 = _noise(x * 0.028 + z * 0.013, y * 0.09 + 400)
  return n1 * 0.5 + n2 * 0.35 + n3 * 0.15
}

function _ridge(x, z, octaves = 4) {
  let v = 0, amp = 1, freq = 1, max = 0
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(_noise(x * freq, z * freq))
    v += n * n * amp
    max += amp
    amp *= 0.55
    freq *= 2.05
  }
  return max > 0 ? v / max : 0
}

function _isCave(x, y, z, terrainHeight, biome) {
  if (y <= 1 || y >= terrainHeight - 3) return false

  const depth = (terrainHeight - y) / Math.max(terrainHeight, 1)
  const cave = _caveNoise(x, y, z)
  const chamber = Math.abs(_noise(x * 0.018 + 900, z * 0.018 - 900)) > 0.72
  const shaft = Math.abs(_noise(x * 0.014 + 700, z * 0.014 - 700)) > 0.84
  let threshold = 0.66 - Math.min(0.2, depth * 0.18)

  if (biome === 'alpine' || biome === 'mountains') threshold -= 0.03
  if (chamber && y < terrainHeight - 10) threshold -= 0.06
  if (shaft && y > 18) threshold -= 0.04

  return cave > threshold
}

// ─── Block IDs (subset needed for collision) ──────────────────────────────────
const AIR = 0
const WATER = 10
const WATER_SOURCE = 64
const LAVA = 65
const LAVA_SOURCE = 66
const LEAVES = 9
const GLASS = 18
const FLOWER_RED = 56
const FLOWER_YELLOW = 57
const MUSHROOM = 58
const TALL_GRASS = 59
const DEAD_BUSH = 60
const COPPER_WIRE = 130
const COPPER_WIRE_ON = 131

// Passable block IDs (player can walk through)
const PASSABLE = new Set([
  AIR, WATER, WATER_SOURCE, LAVA, LAVA_SOURCE, LEAVES, GLASS,
  FLOWER_RED, FLOWER_YELLOW, MUSHROOM, TALL_GRASS, DEAD_BUSH,
  COPPER_WIRE, COPPER_WIRE_ON,
])
// Water block IDs
const WATER_IDS = new Set([WATER, WATER_SOURCE])

const BLOCK_NAMES = {
  air:0, grass:1, dirt:2, stone:3, cobblestone:4, sand:5, gravel:6,
  oak_log:7, oak_planks:8, leaves:9, water:10, bedrock:11,
  coal_ore:12, iron_ore:13, gold_ore:14, diamond_ore:15, obsidian:16,
  torch:17, glass:18, brick:19, tnt:20, wool:21, wool_red:22,
  wool_blue:23, wool_green:24, crafting_table:25, furnace:26, chest:27,
  snow:28, ice:29, cactus:30, sandstone:31, mossy_cobblestone:32,
  flower_yellow:57, mushroom:58, tall_grass:59, dead_bush:60,
  water_source:64, lava:65, lava_source:66,
  red_sandstone:96, mycelium:111, podzol:112, rooted_dirt:114,
  deepslate:118, tuff:124, calcite:125, dripstone:126, pointed_dripstone:127,
  copper_ore:128, copper_block:129, copper_wire:130, copper_wire_on:131,
  copper_power_source:132, copper_power_source_on:133,
}
const BLOCK_ID_TO_NAME = Object.fromEntries(Object.entries(BLOCK_NAMES).map(([name, id]) => [id, name]))

// ─── World changes cache ──────────────────────────────────────────────────────
let _worldChanges = {}

export function setCollisionChanges(changes) {
  _worldChanges = changes || {}
}

// ─── Block query ──────────────────────────────────────────────────────────────
function _baseBlock(x, y, z) {
  if (y < 0) return 11  // bedrock
  const th = _terrainHeight(x, z)
  const biome = _biome(x, z)
  const beach = th <= 14
  const cave = y < th && _isCave(x, y, z, th, biome)

  if (cave) {
    return y < 3 ? LAVA_SOURCE : AIR
  }

  if (y > th) {
    if (y <= 12) return WATER
    const treeNoise = _noise(x * 0.3 + 7, z * 0.3 + 7)
    const floraNoise = _noise(x * 0.22 - 140, z * 0.22 + 140)
    if (y === th + 1 && treeNoise > (biome === 'forest' ? 0.35 : 0.55) && !beach && biome !== 'desert' && biome !== 'badlands') {
      if (_noise(x * 1.1, z * 1.1) > 0.3) return 7
    }
    if (y >= th + 2 && y <= th + (biome === 'forest' ? 5 : 4) && treeNoise > (biome === 'forest' ? 0.35 : 0.55) && !beach && biome !== 'desert' && biome !== 'badlands') {
      if (_noise(x * 0.8 + y, z * 0.8 + y) > -0.2) return LEAVES
    }
    if (y === th + 1 && (biome === 'desert' || biome === 'badlands') && _noise(x * 0.5, z * 0.5) > 0.6) return 30
    if (y === th + 1 && biome === 'plains' && floraNoise > 0.74) return 57
    if (y === th + 1 && biome === 'lush' && floraNoise > 0.58) return 58
    if (y === th + 1 && biome === 'forest' && floraNoise > 0.62) return 59
    if (y === th + 1 && biome === 'badlands' && floraNoise > 0.72) return 60
    return AIR
  }

  if (y === 0) return 11
  if (y < th - 8) {
    const oreNoise = _noise(x * 0.4 + 50, y * 0.4 + 50 + z * 0.4)
    if (y < 4 && oreNoise > 0.7) return 15
    if (y < 8 && oreNoise > 0.65) return 14
    if (oreNoise > 0.6) return 13
    if (oreNoise > 0.55) return 12
    if (y < 18 && _noise(x * 0.55 + 420, y * 0.55 + z * 0.55) > 0.68) return 128
    if (y < 3 && _noise(x * 0.6, y * 0.6 + z * 0.6) > 0.72) return 35
    if (y < 6 && _noise(x * 0.7 + 200, y * 0.7 + z * 0.7) > 0.74) return 37
    if (y < 10 && _noise(x * 0.5 + 300, y * 0.5 + z * 0.5) > 0.76) return 36
    if (y < 18 && _noise(x * 0.05 + 600, z * 0.05 - 600) > 0.42) return 118
    return y < 24 ? 118 : 3
  }
  if (y < th - 4) {
    const strat = _noise(x * 0.03 + y * 0.04 + 800, z * 0.03 - y * 0.04 - 800)
    if (y < 26 && strat > 0.38) return 124
    if (y < 22 && strat < -0.42) return 125
    if (y < 24) return 118
    return 3
  }
  if (y < th) {
    if (beach || biome === 'desert') return 5
    if (biome === 'badlands') return y < th - 1 ? 96 : 85
    if (biome === 'tundra') return 6
    if (biome === 'forest') return _noise(x * 0.08, z * 0.08) > 0.25 ? 112 : 2
    if (biome === 'lush') return _noise(x * 0.09 + 50, z * 0.09 - 50) > 0.3 ? 114 : 2
    return 2
  }
  if (beach || biome === 'desert') return 5
  if (biome === 'tundra') return 28
  if (biome === 'badlands') return _noise(x * 0.06 + 25, z * 0.06 - 25) > 0.1 ? 86 : 85
  if (biome === 'alpine') return y > 34 ? 28 : 3
  if (biome === 'mountains') return y > 28 ? 28 : 3
  if (biome === 'forest') return _noise(x * 0.09, z * 0.09) > 0.45 ? 112 : 1
  if (biome === 'lush') return _noise(x * 0.07 - 90, z * 0.07 + 90) > 0.38 ? 111 : 1
  return 1
}

export function getBlock(x, y, z) {
  const key = `${x},${y},${z}`
  if (key in _worldChanges) {
    const v = _worldChanges[key]
    if (v === null || v === '__void') return AIR
    if (v === 'power_source') return BLOCK_NAMES.copper_power_source
    return BLOCK_NAMES[v] ?? AIR
  }
  return _baseBlock(x, y, z)
}

export function isSolid(x, y, z) {
  return !PASSABLE.has(getBlock(x, y, z))
}

export function isWaterBlock(x, y, z) {
  return WATER_IDS.has(getBlock(x, y, z))
}

function isRaycastOpaque(blockId) {
  return blockId !== AIR && blockId !== WATER && blockId !== WATER_SOURCE
}

// ─── AABB collision resolution ────────────────────────────────────────────────
// Player AABB: width × height, centered on pos.x/pos.z, bottom at pos.y - height
//
// Algorithm: separate-axis sweep
//   1. Move X, resolve X collisions
//   2. Move Y, resolve Y collisions (gravity / ground)
//   3. Move Z, resolve Z collisions
//
// This is the standard Minecraft-style collision approach.

const PLAYER_W = 0.6   // half-width = 0.3 each side
const PLAYER_H = 1.62  // full height
const GROUND_EPSILON = 0.05

/**
 * Resolve player movement against voxel world.
 * @param {number[]} pos  [x, y, z] – camera eye position (feet = y - PLAYER_H)
 * @param {number[]} vel  [vx, vy, vz]
 * @param {number}   dt   delta time in seconds
 * @returns {{ pos, vel, onGround, inWater, headInWater }}
 */
export function resolveAABB(pos, vel, dt) {
  const hw = PLAYER_W / 2  // half-width = 0.3
  const h  = PLAYER_H

  // Eye position → feet position
  let fx = pos[0]
  let fy = pos[1] - h   // feet Y
  let fz = pos[2]

  let vx = vel[0], vy = vel[1], vz = vel[2]

  // ── Step X ──────────────────────────────────────────────────────────────────
  const newFX = fx + vx * dt
  if (!_collidesAABB(newFX, fy, fz, hw, h)) {
    fx = newFX
  } else {
    vx = 0
  }

  // ── Step Y ──────────────────────────────────────────────────────────────────
  const newFY = fy + vy * dt
  let onGround = false
  if (!_collidesAABB(fx, newFY, fz, hw, h)) {
    fy = newFY
  } else {
    if (vy < 0) {
      // Snap to top of block below
      fy = Math.floor(fy) + (vy < 0 ? 0 : 1)
      // More precise: find the highest solid block top below feet
      fy = _snapToGround(fx, fy, fz, hw)
      onGround = true
    }
    vy = 0
  }

  // ── Step Z ──────────────────────────────────────────────────────────────────
  const newFZ = fz + vz * dt
  if (!_collidesAABB(fx, fy, newFZ, hw, h)) {
    fz = newFZ
  } else {
    vz = 0
  }

  // ── Water / lava detection ───────────────────────────────────────────────────
  // Check if feet or mid-body are in water
  const feetBY  = Math.floor(fy + 0.1)
  const midBY   = Math.floor(fy + h * 0.5)
  const headBY  = Math.floor(fy + h - 0.1)
  const bx = Math.floor(fx)
  const bz = Math.floor(fz)
  const inWater     = isWaterBlock(bx, feetBY, bz) || isWaterBlock(bx, midBY, bz)
  const headInWater = isWaterBlock(bx, headBY, bz)
  if (!onGround && vy <= 0) {
    onGround = _hasGroundSupport(fx, fy, fz, hw, h)
  }

  return {
    pos: [fx, fy + h, fz],  // back to eye position
    vel: [vx, vy, vz],
    onGround,
    inWater,
    headInWater,
  }
}

export function raycastVoxel(origin, direction, maxDist = 6) {
  const ox = Number(origin?.x)
  const oy = Number(origin?.y)
  const oz = Number(origin?.z)
  const dx = Number(direction?.x)
  const dy = Number(direction?.y)
  const dz = Number(direction?.z)
  const len = Math.hypot(dx, dy, dz)
  if (!Number.isFinite(ox + oy + oz + dx + dy + dz) || len <= 1e-6) return null

  const nx = dx / len
  const ny = dy / len
  const nz = dz / len

  let x = Math.floor(ox)
  let y = Math.floor(oy)
  let z = Math.floor(oz)

  const stepX = nx > 0 ? 1 : nx < 0 ? -1 : 0
  const stepY = ny > 0 ? 1 : ny < 0 ? -1 : 0
  const stepZ = nz > 0 ? 1 : nz < 0 ? -1 : 0

  const invX = stepX !== 0 ? Math.abs(1 / nx) : Number.POSITIVE_INFINITY
  const invY = stepY !== 0 ? Math.abs(1 / ny) : Number.POSITIVE_INFINITY
  const invZ = stepZ !== 0 ? Math.abs(1 / nz) : Number.POSITIVE_INFINITY

  let tMaxX = stepX > 0 ? (Math.floor(ox) + 1 - ox) * invX : stepX < 0 ? (ox - Math.floor(ox)) * invX : Number.POSITIVE_INFINITY
  let tMaxY = stepY > 0 ? (Math.floor(oy) + 1 - oy) * invY : stepY < 0 ? (oy - Math.floor(oy)) * invY : Number.POSITIVE_INFINITY
  let tMaxZ = stepZ > 0 ? (Math.floor(oz) + 1 - oz) * invZ : stepZ < 0 ? (oz - Math.floor(oz)) * invZ : Number.POSITIVE_INFINITY

  const tDeltaX = invX
  const tDeltaY = invY
  const tDeltaZ = invZ

  let prevX = x
  let prevY = y
  let prevZ = z
  let travelled = 0

  while (travelled <= maxDist) {
    const blockId = getBlock(x, y, z)
    if (isRaycastOpaque(blockId)) {
      return {
        x,
        y,
        z,
        blockId,
        name: BLOCK_ID_TO_NAME[blockId] || 'unknown',
        faceX: prevX,
        faceY: prevY,
        faceZ: prevZ,
      }
    }

    prevX = x
    prevY = y
    prevZ = z

    if (tMaxX <= tMaxY && tMaxX <= tMaxZ) {
      x += stepX
      travelled = tMaxX
      tMaxX += tDeltaX
    } else if (tMaxY <= tMaxZ) {
      y += stepY
      travelled = tMaxY
      tMaxY += tDeltaY
    } else {
      z += stepZ
      travelled = tMaxZ
      tMaxZ += tDeltaZ
    }
  }

  return null
}

function _hasGroundSupport(fx, fy, fz, hw, h) {
  return _collidesAABB(fx, fy - GROUND_EPSILON, fz, hw, h)
}

/**
 * Check if an AABB at (fx, fy, fz) with half-width hw and height h
 * overlaps any solid block.
 * fx/fz = center, fy = bottom of AABB
 */
function _collidesAABB(fx, fy, fz, hw, h) {
  const x0 = Math.floor(fx - hw), x1 = Math.floor(fx + hw)
  const y0 = Math.floor(fy),      y1 = Math.floor(fy + h - 0.001)
  const z0 = Math.floor(fz - hw), z1 = Math.floor(fz + hw)

  for (let bx = x0; bx <= x1; bx++) {
    for (let by = y0; by <= y1; by++) {
      for (let bz = z0; bz <= z1; bz++) {
        if (isSolid(bx, by, bz)) return true
      }
    }
  }
  return false
}

/**
 * Snap feet Y to the top of the highest solid block directly below.
 */
function _snapToGround(fx, fy, fz, hw) {
  const x0 = Math.floor(fx - hw), x1 = Math.floor(fx + hw)
  const z0 = Math.floor(fz - hw), z1 = Math.floor(fz + hw)
  let topY = Math.floor(fy)

  // Search downward from current feet position
  for (let by = Math.floor(fy); by >= Math.floor(fy) - 2; by--) {
    let solid = false
    for (let bx = x0; bx <= x1 && !solid; bx++) {
      for (let bz = z0; bz <= z1 && !solid; bz++) {
        if (isSolid(bx, by, bz)) solid = true
      }
    }
    if (solid) { topY = by + 1; break }
  }
  return topY
}
