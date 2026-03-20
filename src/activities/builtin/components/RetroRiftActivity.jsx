import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { shouldIgnoreActivityHotkey } from './shared/hotkeys'
import { getRetroRiftTexturePack } from './shared/retroShooterAssets'
import { createRetroShooterAudio } from './shared/retroShooterAudio'
import { getRetroRiftMap, RETRO_RIFT_MAPS } from './shared/retroShooterMaps'
import GameCanvasShell from './shared/GameCanvasShell'

const FOV = Math.PI / 3
const VIEW_DEPTH = 32
const MOVE_SPEED = 2.8
const TURN_SPEED = 1.35
const PLAYER_SYNC_MS = 90
const BOT_SYNC_MS = 180
const RESPAWN_MS = 2600
const COUNTDOWN_MS = 3200
const DEFAULT_FRAG_TARGET = 12
const DEFAULT_PICKUP_RESPAWN_MS = 9000
const DEFAULT_TIME_LIMIT_MS = 8 * 60 * 1000
const FOOTSTEP_MS = 220
const DOOR_INTERACT_RANGE = 1.35
const DOOR_INTERACT_COOLDOWN_MS = 260
const BOT_COUNT = 2
const RESPAWN_GRACE_MS = 2200
const SAFE_SPAWN_DISTANCE = 5.4
const FINISH_RESET_MS = 4800
const MIN_RANDOM_PICKUPS = 18
const TEAM_COLORS = ['#23d3ee', '#fb7185', '#fbbf24', '#34d399', '#c084fc', '#fb923c', '#93c5fd', '#f472b6']
const BOT_NAMES = ['Scrapjaw', 'Hexbite', 'Latch', 'Rivet', 'Crowbar', 'Shiver', 'Ashline', 'Vandal']
const FRAG_TARGET_OPTIONS = [10, 12, 15, 20, 30]
const TIME_LIMIT_OPTIONS = [
  { label: 'No Limit', value: 0 },
  { label: '5 Min', value: 5 * 60 * 1000 },
  { label: '8 Min', value: 8 * 60 * 1000 },
  { label: '12 Min', value: 12 * 60 * 1000 },
  { label: '15 Min', value: 15 * 60 * 1000 }
]
const PICKUP_RESPAWN_OPTIONS = [
  { label: 'Fast', value: 5000 },
  { label: 'Classic', value: 9000 },
  { label: 'Slow', value: 14000 }
]

const LOADOUTS = [
  { id: 'repeater', name: 'Repeater', damage: 20, cooldown: 260, ammoUse: 1, range: 10.5, spread: 0.03, color: '#23d3ee' },
  { id: 'slugger', name: 'Slugger', damage: 38, cooldown: 500, ammoUse: 1, range: 12.5, spread: 0.012, color: '#f97316' },
  { id: 'arc', name: 'Arc Blaster', damage: 14, cooldown: 170, ammoUse: 1, range: 9.6, spread: 0.05, color: '#c084fc' }
]

const PICKUP_CONFIG = {
  health: { amount: 30, color: '#22c55e', label: 'Med Gel' },
  ammo: { amount: 8, color: '#fbbf24', label: 'Charge Pack' },
  armor: { amount: 24, color: '#60a5fa', label: 'Plate Shards' }
}

const DEFAULT_MATCH_CONFIG = {
  mapId: RETRO_RIFT_MAPS[0].id,
  mapSeed: 1,
  fragTarget: DEFAULT_FRAG_TARGET,
  timeLimitMs: DEFAULT_TIME_LIMIT_MS,
  pickupRespawnMs: DEFAULT_PICKUP_RESPAWN_MS,
  healthEnabled: true,
  ammoEnabled: true,
  armorEnabled: true
}

const sanitizeMatchConfig = (value = {}) => {
  const mapId = RETRO_RIFT_MAPS.some((map) => map.id === value.mapId) ? value.mapId : DEFAULT_MATCH_CONFIG.mapId
  const mapSeed = Number.isFinite(Number(value.mapSeed)) ? Math.max(1, Math.floor(Number(value.mapSeed))) : DEFAULT_MATCH_CONFIG.mapSeed
  const fragTarget = FRAG_TARGET_OPTIONS.includes(Number(value.fragTarget)) ? Number(value.fragTarget) : DEFAULT_MATCH_CONFIG.fragTarget
  const timeLimitMs = TIME_LIMIT_OPTIONS.some((entry) => entry.value === Number(value.timeLimitMs))
    ? Number(value.timeLimitMs)
    : DEFAULT_MATCH_CONFIG.timeLimitMs
  const pickupRespawnMs = PICKUP_RESPAWN_OPTIONS.some((entry) => entry.value === Number(value.pickupRespawnMs))
    ? Number(value.pickupRespawnMs)
    : DEFAULT_MATCH_CONFIG.pickupRespawnMs
  return {
    mapId,
    mapSeed,
    fragTarget,
    timeLimitMs,
    pickupRespawnMs,
    healthEnabled: value.healthEnabled !== false,
    ammoEnabled: value.ammoEnabled !== false,
    armorEnabled: value.armorEnabled !== false
  }
}

const filterPickupsForConfig = (pickups, config) => pickups.filter((pickup) => {
  if (pickup.type === 'health') return config.healthEnabled
  if (pickup.type === 'ammo') return config.ammoEnabled
  if (pickup.type === 'armor') return config.armorEnabled
  return true
})

const shuffle = (items) => {
  const next = [...items]
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    const value = next[index]
    next[index] = next[swapIndex]
    next[swapIndex] = value
  }
  return next
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const normalizeAngle = (angle) => {
  let next = angle
  while (next < -Math.PI) next += Math.PI * 2
  while (next > Math.PI) next -= Math.PI * 2
  return next
}

const toFeedId = () => `feed-${Math.random().toString(36).slice(2, 9)}-${Date.now().toString(36)}`
const doorCellMatches = (door, cellX, cellY) => Math.floor(door.x) === cellX && Math.floor(door.y) === cellY
const getDoorAtCell = (doors, cellX, cellY) => doors.find((door) => doorCellMatches(door, cellX, cellY)) || null

const createDoorState = () => []
const hydrateDoors = () => []

const getTile = (mapConfig, doors, x, y) => {
  const cellX = Math.floor(x)
  const cellY = Math.floor(y)
  const row = mapConfig.grid[cellY]
  if (!row) return { type: '#', solid: true, cellX, cellY }
  const type = row[cellX]
  if (type == null) return { type: '#', solid: true, cellX, cellY }
  if (type === 'D') {
    return { type: '.', solid: false, door: null, cellX, cellY }
  }
  return { type, solid: type === '#', cellX, cellY }
}

const isWall = (mapConfig, doors, x, y) => getTile(mapConfig, doors, x, y).solid

const hasLineOfSight = (mapConfig, doors, x0, y0, x1, y1) => {
  const dx = x1 - x0
  const dy = y1 - y0
  const distance = Math.hypot(dx, dy)
  const steps = Math.max(2, Math.ceil(distance * 18))
  for (let index = 1; index < steps; index += 1) {
    const t = index / steps
    if (isWall(mapConfig, doors, x0 + dx * t, y0 + dy * t)) return false
  }
  return true
}

const castRay = (mapConfig, doors, originX, originY, angle, maxDepth = VIEW_DEPTH) => {
  const dirX = Math.cos(angle) || 0.000001
  const dirY = Math.sin(angle) || 0.000001
  let mapX = Math.floor(originX)
  let mapY = Math.floor(originY)
  const deltaDistX = Math.abs(1 / dirX)
  const deltaDistY = Math.abs(1 / dirY)
  const stepX = dirX < 0 ? -1 : 1
  const stepY = dirY < 0 ? -1 : 1
  let sideDistX = dirX < 0 ? (originX - mapX) * deltaDistX : (mapX + 1 - originX) * deltaDistX
  let sideDistY = dirY < 0 ? (originY - mapY) * deltaDistY : (mapY + 1 - originY) * deltaDistY
  let depth = 0
  let tile = { type: '.', solid: false, cellX: mapX, cellY: mapY }
  for (let steps = 0; steps < 256 && depth < maxDepth; steps += 1) {
    if (sideDistX < sideDistY) {
      mapX += stepX
      depth = sideDistX
      sideDistX += deltaDistX
    } else {
      mapY += stepY
      depth = sideDistY
      sideDistY += deltaDistY
    }
    tile = getTile(mapConfig, doors, mapX + 0.5, mapY + 0.5)
    if (tile.solid) {
      return {
        depth,
        hitX: originX + dirX * depth,
        hitY: originY + dirY * depth,
        tile
      }
    }
  }
  return {
    depth: maxDepth,
    hitX: originX + dirX * maxDepth,
    hitY: originY + dirY * maxDepth,
    tile: { type: '.', solid: false }
  }
}

const findOpenSpawn = (mapConfig, takenPlayers = [], preferredIndex = 0, minDistance = SAFE_SPAWN_DISTANCE) => {
  const points = mapConfig.spawnPoints || []
  const isSpawnUsable = (point) => {
    if (!point) return false
    if (isWall(mapConfig, [], point.x, point.y)) return false
    const insideSecret = (mapConfig.secretAreas || []).some((area) => (
      point.x >= area.x - 0.4
      && point.x <= area.x + area.width + 0.4
      && point.y >= area.y - 0.4
      && point.y <= area.y + area.height + 0.4
    ))
    if (insideSecret) return false
    const openNeighbors = [
      [1.1, 0],
      [-1.1, 0],
      [0, 1.1],
      [0, -1.1]
    ].filter(([dx, dy]) => !isWall(mapConfig, [], point.x + dx, point.y + dy)).length
    return openNeighbors >= 2
  }
  for (let offset = 0; offset < points.length; offset += 1) {
    const point = points[(preferredIndex + offset) % points.length]
    if (!isSpawnUsable(point)) continue
    const occupied = takenPlayers.some((player) => (
      Date.now() < player.respawnAt
        ? false
        : Math.hypot(player.x - point.x, player.y - point.y) < minDistance
    ))
    if (!occupied) return point
  }
  for (let offset = 0; offset < points.length; offset += 1) {
    const point = points[(preferredIndex + offset) % points.length]
    if (!isSpawnUsable(point)) continue
    const occupied = takenPlayers.some((player) => (
      Date.now() < player.respawnAt
        ? false
        : Math.hypot(player.x - point.x, player.y - point.y) < 3.4
    ))
    if (!occupied) return point
  }
  for (let y = 1.5; y < mapConfig.grid.length - 1.5; y += 1) {
    for (let x = 1.5; x < mapConfig.grid[0].length - 1.5; x += 1) {
      const point = { x, y, angle: 0 }
      if (!isSpawnUsable(point)) continue
      const occupied = takenPlayers.some((player) => (
        Date.now() < player.respawnAt
          ? false
          : Math.hypot(player.x - point.x, player.y - point.y) < 3.4
      ))
      if (!occupied) return point
    }
  }
  return points[preferredIndex % points.length] || { x: 1.5, y: 1.5, angle: 0 }
}

const createPlayer = (mapConfig, id, username, color, loadoutId, preferredIndex = 0, takenPlayers = [], extra = {}) => {
  const spawn = findOpenSpawn(mapConfig, takenPlayers, preferredIndex)
  return {
    id,
    username,
    color,
    loadoutId,
    x: spawn.x,
    y: spawn.y,
    angle: spawn.angle,
    hp: 100,
    armor: 0,
    ammo: 28,
    frags: 0,
    deaths: 0,
    ready: false,
    respawnAt: 0,
    flashUntil: 0,
    isBot: false,
    ...extra
  }
}

const createBotPlayer = (mapConfig, index, takenPlayers = []) => createPlayer(
  mapConfig,
  `bot-${index + 1}`,
  BOT_NAMES[index % BOT_NAMES.length],
  TEAM_COLORS[(index + 3) % TEAM_COLORS.length],
  LOADOUTS[index % LOADOUTS.length].id,
  index,
  takenPlayers,
  { isBot: true, ready: true }
)

const normalizePlayer = (mapConfig, payload = {}, players = []) => {
  const id = String(payload.playerId || payload.id || `pilot-${players.length}`)
  const base = payload.isBot
    ? createBotPlayer(mapConfig, players.filter((player) => player.isBot).length, players)
    : createPlayer(
      mapConfig,
      id,
      String(payload.username || 'Rifter'),
      String(payload.color || TEAM_COLORS[players.length % TEAM_COLORS.length]),
      String(payload.loadoutId || LOADOUTS[0].id),
      players.length,
      players
    )
  return {
    ...base,
    ...payload,
    id,
    x: Number(payload.x ?? base.x),
    y: Number(payload.y ?? base.y),
    angle: Number(payload.angle ?? base.angle),
    hp: Number(payload.hp ?? base.hp),
    armor: Number(payload.armor ?? base.armor),
    ammo: Number(payload.ammo ?? base.ammo),
    frags: Number(payload.frags ?? base.frags),
    deaths: Number(payload.deaths ?? base.deaths),
    ready: payload.isBot ? true : !!payload.ready,
    respawnAt: Number(payload.respawnAt || 0),
    flashUntil: Number(payload.flashUntil || base.flashUntil || 0),
    loadoutId: String(payload.loadoutId || base.loadoutId),
    isBot: !!payload.isBot
  }
}

const ensureBotPopulation = (mapConfig, players) => {
  const humans = players.filter((player) => !player.isBot)
  const bots = players.filter((player) => player.isBot).slice(0, BOT_COUNT)
  const nextBots = [...bots]
  while (nextBots.length < BOT_COUNT) {
    nextBots.push(createBotPlayer(mapConfig, nextBots.length, [...humans, ...nextBots]))
  }
  return [...humans, ...nextBots]
}

const tryMove = (mapConfig, doors, x, y, deltaX, deltaY) => {
  let nextX = x + deltaX
  let nextY = y + deltaY
  if (isWall(mapConfig, doors, nextX, y)) nextX = x
  if (isWall(mapConfig, doors, nextX, nextY)) nextY = y
  return [nextX, nextY]
}

const buildRandomizedPickupState = (mapConfig, config) => {
  const filtered = filterPickupsForConfig(mapConfig.pickups, config)
  const targetCount = Math.max(filtered.length, MIN_RANDOM_PICKUPS)
  const candidateTypes = filtered.length ? filtered.map((pickup) => pickup.type) : ['health', 'ammo', 'armor']
  const openCells = []
  for (let y = 2.5; y < mapConfig.grid.length - 2.5; y += 2) {
    for (let x = 2.5; x < mapConfig.grid[0].length - 2.5; x += 2) {
      if (isWall(mapConfig, [], x, y)) continue
      const insideSecret = (mapConfig.secretAreas || []).some((area) => (
        x >= area.x - 0.5
        && x <= area.x + area.width + 0.5
        && y >= area.y - 0.5
        && y <= area.y + area.height + 0.5
      ))
      if (insideSecret) continue
      const nearSpawn = (mapConfig.spawnPoints || []).some((point) => Math.hypot(point.x - x, point.y - y) < 2.8)
      if (nearSpawn) continue
      const openNeighbors = [
        [0.9, 0],
        [-0.9, 0],
        [0, 0.9],
        [0, -0.9]
      ].filter(([dx, dy]) => !isWall(mapConfig, [], x + dx, y + dy)).length
      if (openNeighbors < 2) continue
      openCells.push({ x, y })
    }
  }
  const selectedCells = []
  for (const point of shuffle(openCells)) {
    if (selectedCells.some((entry) => Math.hypot(entry.x - point.x, entry.y - point.y) < 3.2)) continue
    selectedCells.push(point)
    if (selectedCells.length >= targetCount) break
  }
  return selectedCells.map((point, index) => ({
    id: `${mapConfig.id}-rnd-${index + 1}`,
    type: candidateTypes[index % candidateTypes.length],
    x: point.x + (Math.random() - 0.5) * 0.35,
    y: point.y + (Math.random() - 0.5) * 0.35,
    active: true,
    respawnAt: 0
  }))
}

const rerollPickupState = (mapConfig, config, currentPickups, pickupIds) => {
  const rerollIds = new Set(pickupIds)
  if (!rerollIds.size) return currentPickups
  const templates = buildRandomizedPickupState(mapConfig, config)
  let templateIndex = 0
  return currentPickups.map((pickup) => {
    if (!rerollIds.has(pickup.id)) return pickup
    const nextTemplate = templates[templateIndex % Math.max(1, templates.length)]
    templateIndex += 1
    return {
      ...pickup,
      type: nextTemplate?.type || pickup.type,
      x: nextTemplate?.x ?? pickup.x,
      y: nextTemplate?.y ?? pickup.y,
      active: true,
      respawnAt: 0
    }
  })
}

const getLoadout = (loadoutId) => LOADOUTS.find((loadout) => loadout.id === loadoutId) || LOADOUTS[0]
const formatClock = (ms) => {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

const createPickupState = (mapConfig, config) => buildRandomizedPickupState(mapConfig, config)

const applyPickupEffect = (player, pickupType) => {
  const next = { ...player }
  if (pickupType === 'health') next.hp = clamp(next.hp + PICKUP_CONFIG.health.amount, 0, 100)
  if (pickupType === 'ammo') next.ammo += PICKUP_CONFIG.ammo.amount
  if (pickupType === 'armor') next.armor = clamp(next.armor + PICKUP_CONFIG.armor.amount, 0, 100)
  return next
}

const applyShot = ({ shooter, target, matchConfig, now, shooterName }) => {
  const loadout = getLoadout(shooter.loadoutId)
  const targetArmor = Math.max(0, target.armor - Math.ceil(loadout.damage * 0.45))
  const armorAbsorb = target.armor - targetArmor
  const nextHp = Math.max(0, target.hp - Math.max(0, loadout.damage - armorAbsorb))
  const nextDeaths = nextHp <= 0 ? target.deaths + 1 : target.deaths
  const nextFrags = shooter.frags + (nextHp <= 0 ? 1 : 0)
  const winnerId = nextFrags >= matchConfig.fragTarget ? shooter.id : null
  return {
    shooter: { ...shooter, frags: nextFrags, ammo: shooter.ammo - loadout.ammoUse },
    target: { ...target, hp: nextHp, armor: targetArmor, deaths: nextDeaths, respawnAt: nextHp <= 0 ? now + RESPAWN_MS : target.respawnAt, flashUntil: nextHp <= 0 ? 0 : target.flashUntil },
    winnerId,
    feedText: nextHp <= 0 ? `${shooterName} folded ${target.username}` : `${shooterName} tagged ${target.username}`
  }
}

const findNearestDoor = (doors, player) => doors
  .map((door) => {
    const dx = door.x - player.x
    const dy = door.y - player.y
    const distance = Math.hypot(dx, dy)
    const angleDelta = Math.abs(normalizeAngle(Math.atan2(dy, dx) - player.angle))
    return { door, distance, angleDelta }
  })
  .filter((entry) => entry.distance <= DOOR_INTERACT_RANGE * 1.45 && entry.angleDelta <= 1.35)
  .sort((a, b) => a.distance - b.distance)[0]?.door || null

const findBlockedDoor = (mapConfig, doors, player, deltaX, deltaY) => {
  if (Math.hypot(deltaX, deltaY) < 0.01) return null
  const probeX = player.x + deltaX * 2.2
  const probeY = player.y + deltaY * 2.2
  const tile = getTile(mapConfig, doors, probeX, probeY)
  if (tile.door && !tile.door.open) return tile.door
  return findNearestDoor(doors, { ...player, x: probeX, y: probeY })
}

const isInsideSecretArea = (mapConfig, player) => (mapConfig.secretAreas || []).some((area) => (
  player.x >= area.x
  && player.x <= area.x + area.width
  && player.y >= area.y
  && player.y <= area.y + area.height
))

const renderFloorAndCeiling = ({ ctx, width, height, palette, player }) => {
  const halfHeight = height / 2
  ctx.fillStyle = palette.ceiling
  ctx.fillRect(0, 0, width, halfHeight)
  ctx.fillStyle = palette.floor
  ctx.fillRect(0, halfHeight, width, halfHeight)

  for (let band = 0; band < 24; band += 1) {
    const ceilingY = (band / 24) * halfHeight
    const floorY = halfHeight + (band / 24) * halfHeight
    const opacity = 0.05 + band * 0.008
    ctx.fillStyle = `rgba(255,255,255,${opacity})`
    const ceilingOffset = Math.sin(player.angle * 2 + band * 0.6) * 18
    ctx.fillRect(ceilingOffset - 40, ceilingY, width + 80, 2)
    ctx.fillStyle = `rgba(0,0,0,${0.08 + band * 0.01})`
    const floorOffset = Math.cos(player.angle * 1.4 + band * 0.45) * 22
    ctx.fillRect(floorOffset - 40, floorY, width + 80, 2)
  }
}

const renderMapOverlay = ({ ctx, width, height, mapConfig, players, doors, localPlayer }) => {
  const padding = 26
  const maxWidth = Math.min(width * 0.78, 460)
  const maxHeight = Math.min(height * 0.78, 460)
  const scale = Math.min(maxWidth / mapConfig.grid[0].length, maxHeight / mapConfig.grid.length)
  const mapWidth = mapConfig.grid[0].length * scale
  const mapHeight = mapConfig.grid.length * scale
  const originX = (width - mapWidth) / 2
  const originY = (height - mapHeight) / 2

  ctx.fillStyle = 'rgba(2,8,16,0.88)'
  ctx.fillRect(originX - padding, originY - padding, mapWidth + padding * 2, mapHeight + padding * 2)
  ctx.strokeStyle = 'rgba(35,211,238,0.55)'
  ctx.lineWidth = 2
  ctx.strokeRect(originX - padding, originY - padding, mapWidth + padding * 2, mapHeight + padding * 2)

  for (let y = 0; y < mapConfig.grid.length; y += 1) {
    for (let x = 0; x < mapConfig.grid[y].length; x += 1) {
      const tile = mapConfig.grid[y][x]
      let fill = 'rgba(22,30,41,0.85)'
      if (tile === '#') fill = 'rgba(148,163,184,0.65)'
      if (tile === 'D') fill = 'rgba(22,30,41,0.85)'
      ctx.fillStyle = fill
      ctx.fillRect(originX + x * scale, originY + y * scale, scale, scale)
    }
  }

  players.forEach((player) => {
    if (Date.now() < player.respawnAt) return
    ctx.fillStyle = player.id === localPlayer.id ? '#f8fafc' : player.color
    ctx.beginPath()
    ctx.arc(originX + player.x * scale, originY + player.y * scale, Math.max(2, scale * 0.25), 0, Math.PI * 2)
    ctx.fill()
  })

  ctx.strokeStyle = '#f8fafc'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(originX + localPlayer.x * scale, originY + localPlayer.y * scale)
  ctx.lineTo(
    originX + (localPlayer.x + Math.cos(localPlayer.angle) * 1.8) * scale,
    originY + (localPlayer.y + Math.sin(localPlayer.angle) * 1.8) * scale
  )
  ctx.stroke()

  ctx.fillStyle = '#f8fafc'
  ctx.font = 'bold 14px monospace'
  ctx.textAlign = 'left'
  ctx.fillText('TACTICAL MAP', originX - padding + 12, originY - padding + 18)
}

function renderScene({ ctx, width, height, mapConfig, player, players, pickups, doors, muzzleUntil, showMap, showDoorHint, inSecretArea, damageIndicatorUntil, damageIndicatorAngle, deathAnimationUntil }) {
  const { palette } = mapConfig
  const time = Date.now() * 0.001
  const flicker = 0.88 + Math.sin(time * 12 + player.x * 0.6 + player.y * 0.45) * 0.05 + Math.sin(time * 22) * 0.03
  const deathPhase = deathAnimationUntil ? clamp((deathAnimationUntil - Date.now()) / 1200, 0, 1) : 0
  renderFloorAndCeiling({ ctx, width, height, palette, player })

  const rayCount = Math.min(360, width)
  const depthBuffer = new Array(rayCount).fill(VIEW_DEPTH)
  const columnWidth = width / rayCount

  for (let column = 0; column < rayCount; column += 1) {
    const rayAngle = normalizeAngle(player.angle - FOV / 2 + (column / rayCount) * FOV)
    const hit = castRay(mapConfig, doors, player.x, player.y, rayAngle)
    const correctedDepth = hit.depth * Math.cos(rayAngle - player.angle)
    depthBuffer[column] = correctedDepth
    const wallHeight = Math.min(height, (height / Math.max(correctedDepth, 0.18)) * 0.92)
    const shade = clamp(1 - correctedDepth / VIEW_DEPTH, 0.15, 1)
    const wallTop = (height - wallHeight) / 2
    const isVerticalEdge = Math.abs(hit.hitX - Math.round(hit.hitX)) < 0.08
    ctx.fillStyle = isVerticalEdge ? palette.wallAccent : palette.wall
    ctx.globalAlpha = clamp((0.28 + shade * 0.72) * flicker, 0.18, 1)
    ctx.fillRect(column * columnWidth, wallTop, columnWidth + 1, wallHeight)
    ctx.globalAlpha = Math.min(0.18 + shade * 0.1, 0.26)
    ctx.fillStyle = palette.trim
    ctx.fillRect(column * columnWidth, wallTop + wallHeight * 0.16, columnWidth + 1, Math.max(2, wallHeight * 0.08))
    if (column % 18 === 0) {
      ctx.globalAlpha = 0.04 + shade * 0.04
      ctx.fillStyle = '#f8fafc'
      ctx.fillRect(column * columnWidth, wallTop, 1, wallHeight)
    }
    ctx.globalAlpha = 1
  }

  const sprites = [
    ...players
      .filter((entry) => entry.id !== player.id && Date.now() >= entry.respawnAt)
      .map((entry) => ({
        kind: 'player',
        x: entry.x,
        y: entry.y,
        color: entry.isBot ? '#f87171' : entry.color,
        label: entry.isBot ? `${entry.username} BOT` : entry.username
      })),
    ...pickups
      .filter((pickup) => pickup.active)
      .map((pickup) => ({ kind: 'pickup', x: pickup.x, y: pickup.y, color: PICKUP_CONFIG[pickup.type]?.color || '#fff', label: PICKUP_CONFIG[pickup.type]?.label || pickup.type }))
  ]
  const nearestEnemy = players
    .filter((entry) => entry.id !== player.id && Date.now() >= entry.respawnAt)
    .map((entry) => ({
      entry,
      distance: Math.hypot(entry.x - player.x, entry.y - player.y),
      angle: Math.atan2(entry.y - player.y, entry.x - player.x)
    }))
    .sort((a, b) => a.distance - b.distance)[0] || null
  const nearestPickup = pickups
    .filter((pickup) => pickup.active)
    .map((pickup) => ({
      pickup,
      distance: Math.hypot(pickup.x - player.x, pickup.y - player.y),
      angle: Math.atan2(pickup.y - player.y, pickup.x - player.x)
    }))
    .sort((a, b) => a.distance - b.distance)[0] || null

  sprites
    .map((sprite) => {
      const dx = sprite.x - player.x
      const dy = sprite.y - player.y
      const distance = Math.hypot(dx, dy)
      const angleTo = normalizeAngle(Math.atan2(dy, dx) - player.angle)
      return { ...sprite, distance, angleTo }
    })
    .filter((sprite) => Math.abs(sprite.angleTo) < FOV * 0.62 && sprite.distance > 0.25)
    .sort((a, b) => b.distance - a.distance)
    .forEach((sprite) => {
      const screenX = (0.5 + sprite.angleTo / FOV) * width
      const size = Math.min(height * 0.75, (height / sprite.distance) * (sprite.kind === 'player' ? 0.8 : 0.5))
      const left = screenX - size / 2
      const bob = sprite.kind === 'pickup' ? Math.sin(time * 4 + sprite.x * 0.2 + sprite.y * 0.2) * 8 : 0
      const top = height / 2 - size * 0.5 + bob
      const rayIndex = clamp(Math.floor((screenX / width) * depthBuffer.length), 0, depthBuffer.length - 1)
      if (depthBuffer[rayIndex] < sprite.distance) return
      ctx.fillStyle = sprite.color
      ctx.fillRect(left, top, size, size)
      ctx.fillStyle = '#020617'
      ctx.fillRect(left + size * 0.2, top + size * 0.16, size * 0.6, size * 0.18)
      ctx.fillStyle = '#f8fafc'
      ctx.font = 'bold 12px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(sprite.label, screenX, top - 6)
    })

  ctx.strokeStyle = 'rgba(255,255,255,0.95)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(width / 2 - 12, height / 2)
  ctx.lineTo(width / 2 + 12, height / 2)
  ctx.moveTo(width / 2, height / 2 - 12)
  ctx.lineTo(width / 2, height / 2 + 12)
  ctx.stroke()

  const drawTracker = (entry, color, label, row) => {
    if (!entry) return
    const relative = normalizeAngle(entry.angle - player.angle)
    const anchorX = width / 2 + clamp(relative / (Math.PI / 2), -1, 1) * width * 0.32
    const anchorY = 34 + row * 24
    ctx.fillStyle = 'rgba(2,8,16,0.84)'
    ctx.fillRect(anchorX - 76, anchorY - 10, 152, 20)
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.strokeRect(anchorX - 76, anchorY - 10, 152, 20)
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(anchorX - 64, anchorY)
    ctx.lineTo(anchorX - 52, anchorY - 6)
    ctx.lineTo(anchorX - 52, anchorY + 6)
    ctx.closePath()
    ctx.fill()
    ctx.font = 'bold 11px monospace'
    ctx.textAlign = 'left'
    ctx.fillStyle = '#f8fafc'
    ctx.fillText(`${label} ${Math.round(entry.distance)}m`, anchorX - 46, anchorY + 4)
  }

  drawTracker(nearestEnemy, '#f87171', nearestEnemy?.entry?.isBot ? 'BOT' : 'HOSTILE', 0)
  drawTracker(nearestPickup, nearestPickup?.pickup?.type === 'health' ? '#22c55e' : nearestPickup?.pickup?.type === 'ammo' ? '#fbbf24' : '#60a5fa', nearestPickup ? PICKUP_CONFIG[nearestPickup.pickup.type]?.label || 'PICKUP' : 'PICKUP', 1)

  if (Date.now() < muzzleUntil) {
    ctx.fillStyle = 'rgba(255,214,10,0.32)'
    ctx.fillRect(width * 0.42, height * 0.6, width * 0.16, height * 0.18)
    ctx.fillStyle = 'rgba(255,250,190,0.2)'
    ctx.beginPath()
    ctx.arc(width / 2, height / 2, width * 0.18, 0, Math.PI * 2)
    ctx.fill()
  }

  for (let index = 0; index < 28; index += 1) {
    const sparkX = (index * 137.2 + time * 40) % width
    const sparkY = ((index * 83.4) + time * (16 + index)) % height
    ctx.fillStyle = `rgba(255,255,255,${0.015 + ((index % 5) * 0.008)})`
    ctx.fillRect(sparkX, sparkY, 2, 2)
  }

  if (showDoorHint) {
    ctx.fillStyle = 'rgba(251,146,60,0.12)'
    ctx.fillRect(width * 0.38, height * 0.42, width * 0.24, height * 0.16)
    ctx.strokeStyle = 'rgba(251,146,60,0.55)'
    ctx.lineWidth = 2
    ctx.strokeRect(width * 0.44, height * 0.42, width * 0.12, height * 0.16)
    ctx.fillStyle = 'rgba(255,237,213,0.78)'
    ctx.font = 'bold 12px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('DOOR SEAM', width / 2, height * 0.39)
  }

  if (inSecretArea) {
    ctx.fillStyle = 'rgba(125,211,252,0.06)'
    ctx.fillRect(0, 0, width, height)
    ctx.fillStyle = 'rgba(255,255,255,0.04)'
    ctx.fillRect(0, height * 0.2 + Math.sin(time * 1.7) * 10, width, 2)
  }

  if (showMap) {
    renderMapOverlay({ ctx, width, height, mapConfig, players, doors, localPlayer: player })
  }

  if (player.flashUntil && Date.now() < player.flashUntil) {
    const pulse = 0.08 + ((Math.sin(time * 12) + 1) * 0.5) * 0.12
    ctx.fillStyle = `rgba(125,211,252,${pulse})`
    ctx.fillRect(0, 0, width, height)
  }

  if (damageIndicatorUntil > Date.now()) {
    const alpha = clamp((damageIndicatorUntil - Date.now()) / 550, 0, 1) * 0.75
    const indicatorAngle = damageIndicatorAngle - player.angle
    const cx = width / 2 + Math.cos(indicatorAngle) * width * 0.18
    const cy = height / 2 + Math.sin(indicatorAngle) * height * 0.18
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(indicatorAngle)
    ctx.fillStyle = `rgba(248,113,113,${alpha})`
    ctx.beginPath()
    ctx.moveTo(0, -18)
    ctx.lineTo(12, 14)
    ctx.lineTo(-12, 14)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }

  ctx.fillStyle = `rgba(0,0,0,${0.08 + (1 - flicker) * 0.45})`
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = 'rgba(255,255,255,0.035)'
  for (let y = 0; y < height; y += 4) ctx.fillRect(0, y, width, 1)

  if (deathPhase > 0) {
    const fade = 1 - deathPhase
    ctx.fillStyle = `rgba(127,29,29,${0.2 + fade * 0.45})`
    ctx.fillRect(0, 0, width, height)
    ctx.strokeStyle = `rgba(248,113,113,${0.25 + fade * 0.35})`
    ctx.lineWidth = 12
    ctx.strokeRect(0, 0, width, height)
  }

  ctx.fillStyle = palette.trim
  ctx.fillRect(0, height - 4, width, 4)
}

const RetroRiftActivity = ({ sdk, currentUser, session }) => {
  const canvasRef = useRef(null)
  const keysRef = useRef(new Set())
  const lastSyncRef = useRef(0)
  const lastBotSyncRef = useRef(0)
  const lastShotRef = useRef(0)
  const lastFootstepRef = useRef(0)
  const lastDoorUseRef = useRef(0)
  const muzzleUntilRef = useRef(0)
  const audioRef = useRef(null)
  const playersRef = useRef([])
  const pickupsRef = useRef([])
  const doorsRef = useRef([])
  const phaseRef = useRef('lobby')
  const statusRef = useRef('Load in, pick a rig, and mark ready.')
  const countdownEndsAtRef = useRef(0)
  const winnerIdRef = useRef(null)
  const selectedLoadoutRef = useRef(LOADOUTS[0].id)
  const matchConfigRef = useRef(DEFAULT_MATCH_CONFIG)
  const matchEndsAtRef = useRef(0)
  const mapConfigRef = useRef(getRetroRiftMap(DEFAULT_MATCH_CONFIG.mapId, DEFAULT_MATCH_CONFIG.mapSeed))
  const pendingPickupClaimsRef = useRef(new Set())
  const guestIdRef = useRef(currentUser?.id || `guest-${Math.random().toString(36).slice(2, 9)}`)
  const botBrainRef = useRef({})
  const damageIndicatorUntilRef = useRef(0)
  const damageIndicatorAngleRef = useRef(0)
  const deathAnimationUntilRef = useRef(0)

  if (!audioRef.current) audioRef.current = createRetroShooterAudio()

  const userId = currentUser?.id || guestIdRef.current
  const username = currentUser?.username || currentUser?.displayName || 'Rifter'
  const hostId = session?.hostId || session?.ownerId || session?.createdBy || userId
  const isHost = hostId === userId
  const playerColor = useMemo(() => TEAM_COLORS[Math.abs(userId.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0)) % TEAM_COLORS.length], [userId])

  const [selectedLoadout, setSelectedLoadout] = useState(LOADOUTS[0].id)
  const [matchConfig, setMatchConfig] = useState(DEFAULT_MATCH_CONFIG)
  const activeMap = useMemo(() => getRetroRiftMap(matchConfig.mapId, matchConfig.mapSeed), [matchConfig.mapId, matchConfig.mapSeed])
  const activeTexturePack = useMemo(() => getRetroRiftTexturePack(activeMap.texturePackId), [activeMap.texturePackId])
  const [players, setPlayers] = useState(() => {
    const basePlayers = [createPlayer(activeMap, userId, username, playerColor, LOADOUTS[0].id)]
    return isHost ? ensureBotPopulation(activeMap, basePlayers) : basePlayers
  })
  const [pickups, setPickups] = useState(() => createPickupState(activeMap, DEFAULT_MATCH_CONFIG))
  const [doors, setDoors] = useState(() => createDoorState(activeMap))
  const [phase, setPhase] = useState('lobby')
  const [status, setStatus] = useState('Load in, pick a rig, and mark ready.')
  const [countdownEndsAt, setCountdownEndsAt] = useState(0)
  const [matchEndsAt, setMatchEndsAt] = useState(0)
  const [winnerId, setWinnerId] = useState(null)
  const [feed, setFeed] = useState([])
  const [countdownNow, setCountdownNow] = useState(Date.now())
  const [matchClockNow, setMatchClockNow] = useState(Date.now())
  const [showMap, setShowMap] = useState(false)

  const sendEvent = useCallback((eventType, payload = {}) => {
    sdk?.emitEvent?.(eventType, payload, { serverRelay: true })
  }, [sdk])

  const me = players.find((player) => player.id === userId) || players[0]
  const leaderboard = [...players].sort((a, b) => {
    if (b.frags !== a.frags) return b.frags - a.frags
    return a.deaths - b.deaths
  })
  const humanPlayers = players.filter((player) => !player.isBot)
  const allReady = humanPlayers.length >= 1 && humanPlayers.some((player) => player.ready)
  const countdown = phase === 'countdown' ? Math.max(0, Math.ceil((countdownEndsAt - countdownNow) / 1000)) : 0
  const matchTimeRemaining = phase === 'live' && matchEndsAt > 0 ? Math.max(0, matchEndsAt - matchClockNow) : 0
  const respawnRemaining = me?.respawnAt ? Math.max(0, me.respawnAt - Date.now()) : 0
  const isDead = phase === 'live' && respawnRemaining > 0
  const spawnShieldRemaining = me?.flashUntil ? Math.max(0, me.flashUntil - Date.now()) : 0

  const appendFeed = useCallback((text) => {
    setFeed((current) => [{ id: toFeedId(), text, createdAt: Date.now() }, ...current].slice(0, 6))
  }, [])

  const updatePlayer = useCallback((playerId, updater) => {
    setPlayers((current) => current.map((player) => {
      if (player.id !== playerId) return player
      return typeof updater === 'function' ? updater(player) : { ...player, ...updater }
    }))
  }, [])

  const sendSnapshot = useCallback((targetId = null) => {
    sendEvent('retrorift:snapshot', {
      targetId,
      phase: phaseRef.current,
      status: statusRef.current,
      winnerId: winnerIdRef.current,
      countdownEndsAt: countdownEndsAtRef.current,
      matchEndsAt: matchEndsAtRef.current,
      config: matchConfigRef.current,
      players: playersRef.current,
      pickups: pickupsRef.current,
      doors: doorsRef.current
    })
  }, [sendEvent])

  useEffect(() => () => {
    audioRef.current?.dispose?.()
  }, [])

  useEffect(() => {
    playersRef.current = players
  }, [players])

  useEffect(() => {
    pickupsRef.current = pickups
  }, [pickups])

  useEffect(() => {
    doorsRef.current = doors
  }, [doors])

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  useEffect(() => {
    statusRef.current = status
  }, [status])

  useEffect(() => {
    countdownEndsAtRef.current = countdownEndsAt
  }, [countdownEndsAt])

  useEffect(() => {
    winnerIdRef.current = winnerId
  }, [winnerId])

  useEffect(() => {
    selectedLoadoutRef.current = selectedLoadout
  }, [selectedLoadout])

  useEffect(() => {
    matchConfigRef.current = matchConfig
    mapConfigRef.current = activeMap
  }, [activeMap, matchConfig])

  useEffect(() => {
    matchEndsAtRef.current = matchEndsAt
  }, [matchEndsAt])

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return undefined
    let frameId = 0
    const draw = () => {
      const canvas = canvasRef.current
      if (!canvas) return
      const currentPlayers = playersRef.current
      const currentPlayer = currentPlayers.find((player) => player.id === userId) || currentPlayers[0]
      if (!currentPlayer) {
        frameId = window.requestAnimationFrame(draw)
        return
      }
      const width = canvas.clientWidth || 960
      const height = canvas.clientHeight || 540
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }
      renderScene({
        ctx,
        width,
        height,
        mapConfig: mapConfigRef.current,
        player: currentPlayer,
        players: currentPlayers,
        pickups: pickupsRef.current,
        doors: doorsRef.current,
        muzzleUntil: muzzleUntilRef.current,
        showMap,
        showDoorHint: false,
        inSecretArea: isInsideSecretArea(mapConfigRef.current, currentPlayer),
        damageIndicatorUntil: damageIndicatorUntilRef.current,
        damageIndicatorAngle: damageIndicatorAngleRef.current,
        deathAnimationUntil: deathAnimationUntilRef.current
      })
      frameId = window.requestAnimationFrame(draw)
    }
    frameId = window.requestAnimationFrame(draw)
    return () => window.cancelAnimationFrame(frameId)
  }, [showMap, userId])

  useEffect(() => {
    if (!isHost) return
    setPlayers((current) => ensureBotPopulation(mapConfigRef.current, current))
  }, [activeMap, isHost])

  useEffect(() => {
    const handleEvent = (event) => {
      const type = String(event?.eventType || '')
      const payload = event?.payload || {}
      if (!type.startsWith('retrorift:')) return
      if (payload.targetId && payload.targetId !== userId) return

      switch (type) {
        case 'retrorift:join': {
          setPlayers((current) => {
            const existing = current.find((player) => player.id === payload.playerId)
            if (existing) return current
            const nextPlayers = [...current, normalizePlayer(mapConfigRef.current, payload, current)]
            return isHost ? ensureBotPopulation(mapConfigRef.current, nextPlayers) : nextPlayers
          })
          if (isHost) sendSnapshot(payload.playerId)
          break
        }
        case 'retrorift:leave':
          setPlayers((current) => current.filter((player) => player.id !== payload.playerId))
          break
        case 'retrorift:snapshot': {
          const nextConfig = sanitizeMatchConfig(payload.config || matchConfigRef.current)
          const snapshotMap = getRetroRiftMap(nextConfig.mapId, nextConfig.mapSeed)
          setMatchConfig(nextConfig)
          if (Array.isArray(payload.players)) {
            setPlayers(payload.players.map((player, index, arr) => normalizePlayer(snapshotMap, player, arr.slice(0, index))))
          }
          if (Array.isArray(payload.pickups)) setPickups(payload.pickups)
          if (Array.isArray(payload.doors)) setDoors(hydrateDoors(snapshotMap, payload.doors))
          setPhase(String(payload.phase || 'lobby'))
          setStatus(String(payload.status || statusRef.current))
          setWinnerId(payload.winnerId || null)
          setCountdownEndsAt(Number(payload.countdownEndsAt || 0))
          setMatchEndsAt(Number(payload.matchEndsAt || 0))
          break
        }
        case 'retrorift:state':
          setPlayers((current) => current.map((player) => (
            player.id === payload.playerId ? { ...player, ...payload } : player
          )))
          break
        case 'retrorift:ready':
          updatePlayer(payload.playerId, (player) => ({ ...player, ready: !!payload.ready }))
          break
        case 'retrorift:loadout':
          updatePlayer(payload.playerId, (player) => ({ ...player, loadoutId: payload.loadoutId || player.loadoutId, ready: false }))
          break
        case 'retrorift:phase': {
          const nextConfig = sanitizeMatchConfig(payload.config || matchConfigRef.current)
          const phaseMap = getRetroRiftMap(nextConfig.mapId, nextConfig.mapSeed)
          setMatchConfig(nextConfig)
          setPhase(String(payload.phase || phaseRef.current))
          if (payload.status) setStatus(String(payload.status))
          if (payload.winnerId !== undefined) setWinnerId(payload.winnerId || null)
          if (Object.prototype.hasOwnProperty.call(payload, 'countdownEndsAt')) setCountdownEndsAt(Number(payload.countdownEndsAt || 0))
          if (Object.prototype.hasOwnProperty.call(payload, 'matchEndsAt')) setMatchEndsAt(Number(payload.matchEndsAt || 0))
          if (Array.isArray(payload.players)) setPlayers(payload.players.map((player, index, arr) => normalizePlayer(phaseMap, player, arr.slice(0, index))))
          if (Array.isArray(payload.pickups)) setPickups(payload.pickups)
          if (Array.isArray(payload.doors)) setDoors(hydrateDoors(phaseMap, payload.doors))
          break
        }
        case 'retrorift:config': {
          const nextConfig = sanitizeMatchConfig(payload.config)
          const nextMap = getRetroRiftMap(nextConfig.mapId, nextConfig.mapSeed)
          setMatchConfig(nextConfig)
          if (Array.isArray(payload.players)) setPlayers(payload.players.map((player, index, arr) => normalizePlayer(nextMap, player, arr.slice(0, index))))
          if (Array.isArray(payload.pickups)) setPickups(payload.pickups)
          if (Array.isArray(payload.doors)) setDoors(hydrateDoors(nextMap, payload.doors))
          if (payload.status) setStatus(String(payload.status))
          break
        }
        case 'retrorift:pickup': {
          const claimedPickup = pickupsRef.current.find((pickup) => pickup.id === payload.pickupId)
          if (!claimedPickup?.active) {
            pendingPickupClaimsRef.current.delete(payload.pickupId)
            break
          }
          const nextPickups = pickupsRef.current.map((pickup) => (
            pickup.id === payload.pickupId ? { ...pickup, active: false, respawnAt: Number(payload.respawnAt || Date.now() + DEFAULT_PICKUP_RESPAWN_MS) } : pickup
          ))
          setPickups(nextPickups)
          updatePlayer(payload.playerId, (player) => applyPickupEffect(player, payload.pickupType))
          pendingPickupClaimsRef.current.delete(payload.pickupId)
          if (payload.playerId === userId) audioRef.current.pickup()
          break
        }
        case 'retrorift:pickup-respawn': {
          if (Array.isArray(payload.pickups)) {
            setPickups(payload.pickups)
            payload.pickups.forEach((pickup) => pendingPickupClaimsRef.current.delete(pickup.id))
            break
          }
          const pickupIds = new Set(Array.isArray(payload.pickupIds) ? payload.pickupIds : [])
          if (!pickupIds.size) break
          setPickups((current) => current.map((pickup) => (
            pickupIds.has(pickup.id) ? { ...pickup, active: true, respawnAt: 0 } : pickup
          )))
          pickupIds.forEach((pickupId) => pendingPickupClaimsRef.current.delete(pickupId))
          break
        }
        case 'retrorift:damage':
          if (payload.targetId === userId) {
            const attacker = playersRef.current.find((entry) => entry.id === payload.playerId)
            const meNow = playersRef.current.find((entry) => entry.id === userId)
            if (attacker && meNow) {
              damageIndicatorAngleRef.current = Math.atan2(attacker.y - meNow.y, attacker.x - meNow.x)
              damageIndicatorUntilRef.current = Date.now() + 550
            }
            if (Number(payload.hp ?? 0) <= 0) deathAnimationUntilRef.current = Date.now() + 1200
          }
          updatePlayer(payload.targetId, (player) => ({
            ...player,
            hp: Number(payload.hp ?? player.hp),
            armor: Number(payload.armor ?? player.armor),
            deaths: Number(payload.deaths ?? player.deaths),
            respawnAt: Number(payload.respawnAt || player.respawnAt),
            flashUntil: Number(payload.flashUntil ?? player.flashUntil ?? 0),
            x: payload.x ?? player.x,
            y: payload.y ?? player.y,
            angle: payload.angle ?? player.angle
          }))
          updatePlayer(payload.playerId, (player) => ({
            ...player,
            frags: Number(payload.frags ?? player.frags),
            ammo: Number(payload.ammo ?? player.ammo)
          }))
          if (payload.feedText) appendFeed(payload.feedText)
          audioRef.current.hit()
          if (payload.winnerId) {
            setWinnerId(payload.winnerId)
            setPhase('finished')
            setStatus(payload.winText || 'Match complete.')
          }
          break
        case 'retrorift:respawn':
          updatePlayer(payload.playerId, (player) => ({
            ...player,
            x: Number(payload.x ?? player.x),
            y: Number(payload.y ?? player.y),
            angle: Number(payload.angle ?? player.angle),
            hp: 100,
            armor: 0,
            ammo: Math.max(player.ammo, 16),
            respawnAt: 0,
            flashUntil: Date.now() + RESPAWN_GRACE_MS
          }))
          if (payload.playerId === userId) audioRef.current.respawn()
          break
        case 'retrorift:door':
          setDoors((current) => current.map((door) => (door.id === payload.doorId ? { ...door, open: !!payload.open } : door)))
          audioRef.current.door?.(!!payload.open)
          break
        default:
          break
      }
    }

    const off = sdk.on?.('event', handleEvent)
    sendEvent('retrorift:join', {
      playerId: userId,
      username,
      color: playerColor,
      loadoutId: selectedLoadoutRef.current,
      ready: false
    })
    return () => {
      sendEvent('retrorift:leave', { playerId: userId })
      off?.()
    }
  }, [appendFeed, isHost, playerColor, sdk, sendEvent, sendSnapshot, updatePlayer, userId, username])

  useEffect(() => {
    const handleDown = (event) => {
      if (shouldIgnoreActivityHotkey(event)) return
      if (event.key === 'Tab') {
        event.preventDefault()
        setShowMap(true)
      }
      keysRef.current.add(event.key.toLowerCase())
    }
    const handleUp = (event) => {
      if (event.key === 'Tab') {
        event.preventDefault()
        setShowMap(false)
      }
      keysRef.current.delete(event.key.toLowerCase())
    }
    window.addEventListener('keydown', handleDown)
    window.addEventListener('keyup', handleUp)
    return () => {
      window.removeEventListener('keydown', handleDown)
      window.removeEventListener('keyup', handleUp)
    }
  }, [])

  useEffect(() => {
    if (phase !== 'countdown') return undefined
    let lastSecond = null
    let liveSent = false
    setCountdownNow(Date.now())
    const interval = window.setInterval(() => {
      const now = Date.now()
      const remaining = Math.ceil((countdownEndsAt - now) / 1000)
      setCountdownNow(now)
      if (remaining > 0 && remaining !== lastSecond) {
        lastSecond = remaining
        audioRef.current.countdown(remaining)
      }
      if (now >= countdownEndsAt && isHost && !liveSent) {
        liveSent = true
        const liveStatus = `${mapConfigRef.current.name} is live. First to ${matchConfigRef.current.fragTarget} frags takes the rift.`
        sendEvent('retrorift:phase', {
          phase: 'live',
          status: liveStatus,
          config: matchConfigRef.current,
          matchEndsAt: matchEndsAtRef.current,
          doors: doorsRef.current
        })
        setPhase('live')
        setStatus(liveStatus)
        window.clearInterval(interval)
      }
    }, 120)
    return () => window.clearInterval(interval)
  }, [countdownEndsAt, isHost, phase, sendEvent])

  useEffect(() => {
    if (phase !== 'live') return undefined
    setMatchClockNow(Date.now())
    const interval = window.setInterval(() => {
      const now = Date.now()
      setMatchClockNow(now)
      if (!isHost || !matchEndsAtRef.current || now < matchEndsAtRef.current) return
      const sorted = [...playersRef.current].sort((a, b) => {
        if (b.frags !== a.frags) return b.frags - a.frags
        return a.deaths - b.deaths
      })
      const winningPlayer = sorted[0] || null
      sendEvent('retrorift:phase', {
        phase: 'finished',
        winnerId: winningPlayer?.id || null,
        status: winningPlayer ? `${winningPlayer.username} led the board at the horn.` : 'Time expired.',
        matchEndsAt: 0,
        config: matchConfigRef.current,
        doors: doorsRef.current
      })
      setPhase('finished')
      setWinnerId(winningPlayer?.id || null)
      setStatus(winningPlayer ? `${winningPlayer.username} led the board at the horn.` : 'Time expired.')
    }, 250)
    return () => window.clearInterval(interval)
  }, [isHost, phase, sendEvent])

  useEffect(() => {
    if (!isHost) return undefined
    const interval = window.setInterval(() => {
      const now = Date.now()
      const respawnIds = pickupsRef.current
        .filter((pickup) => !pickup.active && pickup.respawnAt && now >= pickup.respawnAt)
        .map((pickup) => pickup.id)
      if (!respawnIds.length) return
      const nextPickups = rerollPickupState(mapConfigRef.current, matchConfigRef.current, pickupsRef.current, respawnIds)
      setPickups(nextPickups)
      sendEvent('retrorift:pickup-respawn', { pickupIds: respawnIds, pickups: nextPickups })
    }, 150)
    return () => window.clearInterval(interval)
  }, [isHost, sendEvent])

  useEffect(() => {
    if (phase !== 'live') return undefined
    const interval = window.setInterval(() => {
      const now = Date.now()
      updatePlayer(userId, (player) => {
        if (!player || (player.respawnAt && now < player.respawnAt)) return player
        let angle = player.angle
        if (keysRef.current.has('arrowleft')) angle -= TURN_SPEED * 0.05
        if (keysRef.current.has('arrowright')) angle += TURN_SPEED * 0.05
        angle = normalizeAngle(angle)

        let moveX = 0
        let moveY = 0
        const speed = (keysRef.current.has('shift') ? MOVE_SPEED * 1.2 : MOVE_SPEED) * 0.05
        if (keysRef.current.has('w')) {
          moveX += Math.cos(angle) * speed
          moveY += Math.sin(angle) * speed
        }
        if (keysRef.current.has('s')) {
          moveX -= Math.cos(angle) * speed * 0.7
          moveY -= Math.sin(angle) * speed * 0.7
        }
        if (keysRef.current.has('a')) {
          moveX += Math.cos(angle - Math.PI / 2) * speed * 0.8
          moveY += Math.sin(angle - Math.PI / 2) * speed * 0.8
        }
        if (keysRef.current.has('d')) {
          moveX += Math.cos(angle + Math.PI / 2) * speed * 0.8
          moveY += Math.sin(angle + Math.PI / 2) * speed * 0.8
        }

        const [x, y] = tryMove(mapConfigRef.current, doorsRef.current, player.x, player.y, moveX, moveY)
        const movedDistance = Math.hypot(x - player.x, y - player.y)
        if (movedDistance > 0.02 && now - lastFootstepRef.current > FOOTSTEP_MS) {
          lastFootstepRef.current = now
          audioRef.current.footstep?.()
        }

        const nextPlayer = { ...player, x, y, angle }

        for (const pickup of pickupsRef.current) {
          if (!pickup.active || pendingPickupClaimsRef.current.has(pickup.id)) continue
          if (Math.hypot(nextPlayer.x - pickup.x, nextPlayer.y - pickup.y) <= 0.48) {
            pendingPickupClaimsRef.current.add(pickup.id)
            const nextPickups = pickupsRef.current.map((entry) => (
              entry.id === pickup.id ? { ...entry, active: false, respawnAt: Date.now() + matchConfigRef.current.pickupRespawnMs } : entry
            ))
            setPickups(nextPickups)
            sendEvent('retrorift:pickup', {
              playerId: userId,
              pickupId: pickup.id,
              pickupType: pickup.type,
              respawnAt: Date.now() + matchConfigRef.current.pickupRespawnMs
            })
          }
        }

        const loadout = getLoadout(nextPlayer.loadoutId)
        if (keysRef.current.has(' ') && now > lastShotRef.current + loadout.cooldown && nextPlayer.ammo >= loadout.ammoUse) {
          lastShotRef.current = now
          muzzleUntilRef.current = now + 90
          audioRef.current.shoot()
          const target = playersRef.current
            .filter((entry) => entry.id !== userId && now >= entry.respawnAt)
            .map((entry) => {
              const dx = entry.x - nextPlayer.x
              const dy = entry.y - nextPlayer.y
              const distance = Math.hypot(dx, dy)
              const angleDelta = Math.abs(normalizeAngle(Math.atan2(dy, dx) - nextPlayer.angle))
              return { entry, distance, angleDelta }
            })
            .filter((entry) => now >= (entry.entry.flashUntil || 0))
            .filter((entry) => entry.distance <= loadout.range && entry.angleDelta <= loadout.spread + 0.08 && hasLineOfSight(mapConfigRef.current, doorsRef.current, nextPlayer.x, nextPlayer.y, entry.entry.x, entry.entry.y))
            .sort((a, b) => a.distance - b.distance)[0]

          if (target) {
            const outcome = applyShot({ shooter: nextPlayer, target: target.entry, matchConfig: matchConfigRef.current, now, shooterName: username })
            let respawnPayload = {}
            if (outcome.target.hp <= 0) {
              const spawn = findOpenSpawn(mapConfigRef.current, playersRef.current.filter((entry) => entry.id !== target.entry.id), target.entry.deaths + 1, SAFE_SPAWN_DISTANCE)
              respawnPayload = { x: spawn.x, y: spawn.y, angle: spawn.angle, respawnAt: Date.now() + RESPAWN_MS }
            }
            sendEvent('retrorift:damage', {
              playerId: userId,
              targetId: target.entry.id,
              frags: outcome.shooter.frags,
              ammo: outcome.shooter.ammo,
              hp: outcome.target.hp,
              armor: outcome.target.armor,
              deaths: outcome.target.deaths,
              ...respawnPayload,
              flashUntil: outcome.target.flashUntil,
              winnerId: outcome.winnerId,
              winText: outcome.winnerId ? `${username} sealed the rift.` : null,
              feedText: outcome.feedText
            })
            return outcome.shooter
          }

          return { ...nextPlayer, ammo: nextPlayer.ammo - loadout.ammoUse }
        }

        if (now - lastSyncRef.current > PLAYER_SYNC_MS) {
          lastSyncRef.current = now
          sendEvent('retrorift:state', {
            playerId: userId,
            x: nextPlayer.x,
            y: nextPlayer.y,
            angle: nextPlayer.angle,
            hp: nextPlayer.hp,
            armor: nextPlayer.armor,
            ammo: nextPlayer.ammo,
            frags: nextPlayer.frags,
            deaths: nextPlayer.deaths,
            ready: nextPlayer.ready,
            loadoutId: nextPlayer.loadoutId,
            respawnAt: nextPlayer.respawnAt
          })
        }

        return nextPlayer
      })

      setPlayers((current) => current.map((player, index, arr) => {
        if (player.id !== userId || !player.respawnAt || now < player.respawnAt) return player
        const spawn = findOpenSpawn(mapConfigRef.current, arr.filter((entry) => entry.id !== player.id), index, SAFE_SPAWN_DISTANCE)
        sendEvent('retrorift:respawn', { playerId: player.id, x: spawn.x, y: spawn.y, angle: spawn.angle })
        return { ...player, x: spawn.x, y: spawn.y, angle: spawn.angle, hp: 100, armor: 0, ammo: Math.max(player.ammo, 16), respawnAt: 0, flashUntil: now + RESPAWN_GRACE_MS }
      }))
    }, 16)
    return () => window.clearInterval(interval)
  }, [phase, sendEvent, updatePlayer, userId, username])

  useEffect(() => {
    if (!isHost || phase !== 'live') return undefined
    const interval = window.setInterval(() => {
      const now = Date.now()
      const nextPlayers = playersRef.current.map((player) => ({ ...player }))
      const nextPickups = pickupsRef.current.map((pickup) => ({ ...pickup }))
      let changed = false

      nextPlayers.forEach((bot) => {
        if (!bot.isBot) return
        const brain = botBrainRef.current[bot.id] || { lastShotAt: 0, retargetAt: 0, targetId: null, strafeDir: Math.random() > 0.5 ? 1 : -1 }
        botBrainRef.current[bot.id] = brain

        if (bot.respawnAt && now >= bot.respawnAt) {
          const spawn = findOpenSpawn(mapConfigRef.current, nextPlayers.filter((entry) => entry.id !== bot.id), bot.deaths + 1, SAFE_SPAWN_DISTANCE)
          Object.assign(bot, { x: spawn.x, y: spawn.y, angle: spawn.angle, hp: 100, armor: 0, ammo: Math.max(bot.ammo, 16), respawnAt: 0, flashUntil: now + RESPAWN_GRACE_MS })
          sendEvent('retrorift:respawn', { playerId: bot.id, x: spawn.x, y: spawn.y, angle: spawn.angle })
          changed = true
          return
        }
        if (bot.respawnAt && now < bot.respawnAt) return

        const loadout = getLoadout(bot.loadoutId)
        const enemies = nextPlayers
          .filter((entry) => entry.id !== bot.id && now >= entry.respawnAt && now >= (entry.flashUntil || 0))
          .map((entry) => {
            const dx = entry.x - bot.x
            const dy = entry.y - bot.y
            return {
              entry,
              distance: Math.hypot(dx, dy),
              angleTo: Math.atan2(dy, dx)
            }
          })
          .sort((a, b) => a.distance - b.distance)
        if (now >= brain.retargetAt || !enemies.some((entry) => entry.entry.id === brain.targetId)) {
          const weighted = enemies.filter((entry) => entry.distance < 14)
          brain.targetId = (weighted[Math.floor(Math.random() * Math.max(1, Math.min(2, weighted.length)))] || enemies[0])?.entry.id || null
          brain.retargetAt = now + 2600 + Math.random() * 2200
          if (Math.random() > 0.62) brain.strafeDir *= -1
        }
        const target = enemies.find((entry) => entry.entry.id === brain.targetId) || enemies[0]
        if (!target) return

        const angleDelta = normalizeAngle(target.angleTo - bot.angle)
        bot.angle = normalizeAngle(bot.angle + clamp(angleDelta, -0.08, 0.08))
        const canSeeTarget = hasLineOfSight(mapConfigRef.current, doorsRef.current, bot.x, bot.y, target.entry.x, target.entry.y)
        const wantsToAdvance = target.distance > loadout.range * 0.62 || !canSeeTarget
        if (wantsToAdvance) {
          const advance = 0.05 + Math.random() * 0.03
          const strafeAngle = bot.angle + brain.strafeDir * Math.PI / 2
          const [nextX, nextY] = tryMove(
            mapConfigRef.current,
            doorsRef.current,
            bot.x,
            bot.y,
            Math.cos(bot.angle) * advance + Math.cos(strafeAngle) * 0.025,
            Math.sin(bot.angle) * advance + Math.sin(strafeAngle) * 0.025
          )
          if (Math.hypot(nextX - bot.x, nextY - bot.y) < 0.01) {
            bot.angle = normalizeAngle(bot.angle + (0.35 * brain.strafeDir))
            brain.strafeDir *= -1
          } else {
            bot.x = nextX
            bot.y = nextY
          }
          changed = true
        }

        for (const pickup of nextPickups) {
          if (!pickup.active) continue
          if (Math.hypot(bot.x - pickup.x, bot.y - pickup.y) <= 0.52) {
            pickup.active = false
            pickup.respawnAt = now + matchConfigRef.current.pickupRespawnMs
            Object.assign(bot, applyPickupEffect(bot, pickup.type))
            sendEvent('retrorift:pickup', {
              playerId: bot.id,
              pickupId: pickup.id,
              pickupType: pickup.type,
              respawnAt: pickup.respawnAt
            })
            changed = true
          }
        }

        const shootAngleDelta = Math.abs(normalizeAngle(target.angleTo - bot.angle))
        if (
          canSeeTarget
          && target.distance <= loadout.range * 0.88
          && shootAngleDelta <= loadout.spread + 0.03
          && bot.ammo >= loadout.ammoUse
          && now > brain.lastShotAt + loadout.cooldown + 520 + Math.random() * 260
          && Math.random() > 0.38
        ) {
          brain.lastShotAt = now
          const targetIndex = nextPlayers.findIndex((entry) => entry.id === target.entry.id)
          const outcome = applyShot({ shooter: bot, target: nextPlayers[targetIndex], matchConfig: matchConfigRef.current, now, shooterName: bot.username })
          nextPlayers[targetIndex] = outcome.target
          Object.assign(bot, outcome.shooter)
          let respawnPayload = {}
          if (outcome.target.hp <= 0) {
            const spawn = findOpenSpawn(mapConfigRef.current, nextPlayers.filter((entry) => entry.id !== outcome.target.id), outcome.target.deaths + 1, SAFE_SPAWN_DISTANCE)
            respawnPayload = { x: spawn.x, y: spawn.y, angle: spawn.angle, respawnAt: now + RESPAWN_MS, flashUntil: 0 }
            nextPlayers[targetIndex] = { ...nextPlayers[targetIndex], ...respawnPayload }
          }
          sendEvent('retrorift:damage', {
            playerId: bot.id,
            targetId: outcome.target.id,
            frags: outcome.shooter.frags,
            ammo: outcome.shooter.ammo,
            hp: outcome.target.hp,
            armor: outcome.target.armor,
            deaths: outcome.target.deaths,
            ...respawnPayload,
            flashUntil: outcome.target.flashUntil,
            winnerId: outcome.winnerId,
            winText: outcome.winnerId ? `${bot.username} sealed the rift.` : null,
            feedText: outcome.feedText
          })
          if (outcome.winnerId) {
            sendEvent('retrorift:phase', {
              phase: 'finished',
              winnerId: outcome.winnerId,
              status: `${bot.username} sealed the rift.`,
              config: matchConfigRef.current,
              doors: doorsRef.current
            })
            setPhase('finished')
            setWinnerId(outcome.winnerId)
            setStatus(`${bot.username} sealed the rift.`)
          }
          changed = true
        }
      })

      if (changed) {
        setPlayers(nextPlayers)
        setPickups(nextPickups)
      }

      if (now - lastBotSyncRef.current > BOT_SYNC_MS) {
        lastBotSyncRef.current = now
        nextPlayers.filter((player) => player.isBot).forEach((bot) => {
          sendEvent('retrorift:state', {
            playerId: bot.id,
            x: bot.x,
            y: bot.y,
            angle: bot.angle,
            hp: bot.hp,
            armor: bot.armor,
            ammo: bot.ammo,
            frags: bot.frags,
            deaths: bot.deaths,
            ready: true,
            loadoutId: bot.loadoutId,
            respawnAt: bot.respawnAt,
            flashUntil: bot.flashUntil,
            isBot: true
          })
        })
      }
    }, 80)
    return () => window.clearInterval(interval)
  }, [isHost, phase, sendEvent])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const trackName = phase === 'lobby' || phase === 'finished'
      ? 'lobby'
      : phase === 'live' || phase === 'countdown'
        ? 'combat'
        : 'lobby'
    audio.startMusic(trackName)
    return () => audio.stopMusic()
  }, [phase])

  useEffect(() => {
    audioRef.current?.setSecretMode?.(phase === 'live' && !!me && isInsideSecretArea(activeMap, me))
  }, [activeMap, me, phase])

  useEffect(() => {
    if (phase === 'finished' && winnerId === userId) {
      audioRef.current.win()
      audioRef.current.startMusic('victory')
    }
  }, [phase, userId, winnerId])

  const handleLoadoutSelect = useCallback((loadoutId) => {
    setSelectedLoadout(loadoutId)
    updatePlayer(userId, (player) => ({ ...player, loadoutId, ready: false }))
    sendEvent('retrorift:loadout', { playerId: userId, loadoutId })
    sendEvent('retrorift:ready', { playerId: userId, ready: false })
  }, [sendEvent, updatePlayer, userId])

  const handleReadyToggle = useCallback(() => {
    const nextReady = !me?.ready
    updatePlayer(userId, (player) => ({ ...player, ready: nextReady }))
    sendEvent('retrorift:ready', { playerId: userId, ready: nextReady })
    audioRef.current.ready()
  }, [me?.ready, sendEvent, updatePlayer, userId])

  const applyLobbyConfig = useCallback((patch) => {
    if (!isHost || phase === 'live') return
    const nextConfig = sanitizeMatchConfig({ ...matchConfigRef.current, ...patch })
    const nextMap = getRetroRiftMap(nextConfig.mapId, nextConfig.mapSeed)
    const seededPlayers = ensureBotPopulation(nextMap, playersRef.current.filter((player) => !player.isBot))
    const nextPlayers = seededPlayers.map((player, index, arr) => {
      const spawn = findOpenSpawn(nextMap, arr.filter((entry) => entry.id !== player.id), index, SAFE_SPAWN_DISTANCE)
      return { ...player, x: spawn.x, y: spawn.y, angle: spawn.angle, ready: player.isBot ? true : false, respawnAt: 0 }
    })
    const nextPickups = createPickupState(nextMap, nextConfig)
    const nextDoors = createDoorState(nextMap)
    setMatchConfig(nextConfig)
    setPlayers(nextPlayers)
    setPickups(nextPickups)
    setDoors(nextDoors)
    setStatus(`Load in on ${nextMap.name}, tune match rules, and mark ready.`)
    sendEvent('retrorift:config', {
      config: nextConfig,
      players: nextPlayers,
      pickups: nextPickups,
      doors: nextDoors,
      status: `Load in on ${nextMap.name}, tune match rules, and mark ready.`
    })
  }, [isHost, phase, sendEvent])

  const handleLaunch = useCallback(() => {
    if (!isHost || !allReady) return
    const launchMap = getRetroRiftMap(matchConfigRef.current.mapId, matchConfigRef.current.mapSeed)
    const launchPlayers = ensureBotPopulation(launchMap, playersRef.current.filter((player) => !player.isBot))
    const playersForStart = launchPlayers.map((player, index, arr) => {
      const spawn = findOpenSpawn(launchMap, arr.filter((entry) => entry.id !== player.id), index, SAFE_SPAWN_DISTANCE)
      return {
        ...player,
        x: spawn.x,
        y: spawn.y,
        angle: spawn.angle,
        hp: 100,
        armor: 0,
        ammo: 28,
        frags: 0,
        deaths: 0,
        ready: player.isBot ? true : player.ready,
        respawnAt: 0
      }
    })
    const freshPickups = createPickupState(launchMap, matchConfigRef.current)
    const nextDoors = createDoorState(launchMap)
    const nextMatchEndsAt = matchConfigRef.current.timeLimitMs > 0 ? Date.now() + matchConfigRef.current.timeLimitMs + COUNTDOWN_MS : 0
    const nextCountdownEndsAt = Date.now() + COUNTDOWN_MS
    sendEvent('retrorift:phase', {
      phase: 'countdown',
      status: `Seal your visor. ${launchMap.name} breaches in three.`,
      countdownEndsAt: nextCountdownEndsAt,
      matchEndsAt: nextMatchEndsAt,
      config: matchConfigRef.current,
      players: playersForStart.map((player) => ({ ...player, ready: player.isBot ? true : false })),
      pickups: freshPickups,
      doors: nextDoors,
      winnerId: null
    })
    setPlayers(playersForStart)
    setPickups(freshPickups)
    setDoors(nextDoors)
    setWinnerId(null)
    setCountdownEndsAt(nextCountdownEndsAt)
    setMatchEndsAt(nextMatchEndsAt)
    setPhase('countdown')
    setStatus(`Seal your visor. ${launchMap.name} breaches in three.`)
  }, [allReady, isHost, sendEvent])

  const handleReset = useCallback(() => {
    if (!isHost) return
    const nextConfig = matchConfigRef.current.mapId === 'rift-procedural'
      ? sanitizeMatchConfig({ ...matchConfigRef.current, mapSeed: Date.now() })
      : matchConfigRef.current
    const resetMap = getRetroRiftMap(nextConfig.mapId, nextConfig.mapSeed)
    const basePlayers = ensureBotPopulation(resetMap, playersRef.current.filter((player) => !player.isBot))
    const resetPlayers = basePlayers.map((player, index, arr) => {
      const spawn = findOpenSpawn(resetMap, arr.filter((entry) => entry.id !== player.id), index, SAFE_SPAWN_DISTANCE)
      return { ...player, x: spawn.x, y: spawn.y, angle: spawn.angle, hp: 100, armor: 0, ammo: 28, frags: 0, deaths: 0, ready: player.isBot, respawnAt: 0 }
    })
    const freshPickups = createPickupState(resetMap, nextConfig)
    const nextDoors = createDoorState(resetMap)
    setMatchConfig(nextConfig)
    sendEvent('retrorift:phase', {
      phase: 'lobby',
      status: `Load in on ${resetMap.name}, tune match rules, and mark ready.`,
      players: resetPlayers,
      pickups: freshPickups,
      doors: nextDoors,
      winnerId: null,
      countdownEndsAt: 0,
      matchEndsAt: 0,
      config: nextConfig
    })
    setPlayers(resetPlayers)
    setPickups(freshPickups)
    setDoors(nextDoors)
    setWinnerId(null)
    setCountdownEndsAt(0)
    setMatchEndsAt(0)
    setStatus(`Load in on ${resetMap.name}, tune match rules, and mark ready.`)
  }, [isHost, sendEvent])

  useEffect(() => {
    if (!isHost || phase !== 'finished') return undefined
    const timeout = window.setTimeout(() => {
      handleReset()
    }, FINISH_RESET_MS)
    return () => window.clearTimeout(timeout)
  }, [handleReset, isHost, phase])

  return (
    <GameCanvasShell
      title="Retro Rift '93"
      subtitle={activeMap.name}
      status={status}
      skin="arcade"
      musicEnabled={false}
      header={false}
      layout="stretch"
      contentStyle={{ color: '#f8fafc', fontFamily: 'monospace' }}
    >
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', imageRendering: 'pixelated' }} />

      <div style={{ position: 'absolute', top: 14, left: 14, width: 260, borderRadius: 18, border: '1px solid rgba(35,211,238,0.22)', background: 'rgba(7,10,18,0.76)', backdropFilter: 'blur(10px)', padding: 14 }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.18em', color: '#23d3ee' }}>Retro Rift '93</div>
        <div style={{ fontSize: 24, fontWeight: 900, lineHeight: 0.95, marginTop: 6 }}>{activeMap.name}</div>
        <div style={{ marginTop: 8, fontSize: 12, color: '#a3adc2', lineHeight: 1.55 }}>{activeMap.subtitle}</div>
        <div style={{ marginTop: 10, padding: '9px 10px', borderRadius: 12, background: 'rgba(20,28,38,0.74)', color: '#f8fafc', fontSize: 12 }}>{status}</div>
        <div style={{ marginTop: 10, fontSize: 11, color: '#cbd5e1', lineHeight: 1.55 }}>
          Secret routes are permanently open now. No door interaction needed.
        </div>
      </div>

      <div style={{ position: 'absolute', top: 14, right: 14, width: 260, borderRadius: 18, border: '1px solid rgba(148,163,184,0.18)', background: 'rgba(7,10,18,0.76)', backdropFilter: 'blur(10px)', padding: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#23d3ee' }}>Frag Board</div>
        <div style={{ marginTop: 8, display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 11, color: '#a3adc2' }}>
          <span>Map {matchConfig.mapId === 'rift-procedural' ? `Random #${String(matchConfig.mapSeed).slice(-4)}` : `${RETRO_RIFT_MAPS.findIndex((entry) => entry.id === activeMap.id) + 1}/${RETRO_RIFT_MAPS.length}`}</span>
          <span>Clock {matchEndsAt > 0 ? formatClock(matchTimeRemaining) : '∞'}</span>
        </div>
        <div style={{ marginTop: 10, display: 'grid', gap: 8, maxHeight: 280, overflow: 'auto' }}>
          {leaderboard.map((player, index) => (
            <div key={player.id} style={{ display: 'grid', gridTemplateColumns: '16px 1fr auto', gap: 10, alignItems: 'center', padding: '8px 10px', borderRadius: 12, background: 'rgba(20,28,38,0.74)' }}>
              <div style={{ width: 16, height: 16, borderRadius: 999, background: player.isBot ? '#f87171' : player.color }} />
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>
                {index + 1}. {player.username}{player.isBot ? ' [BOT]' : player.id === userId ? ' (you)' : ''}
              </div>
              <div style={{ fontSize: 12, fontWeight: 800, color: player.isBot ? '#fca5a5' : player.ready ? '#4ade80' : '#f87171' }}>
                {phase === 'live' ? `${player.frags}/${matchConfig.fragTarget}` : player.isBot ? 'Bot' : player.ready ? 'Ready' : 'Idle'}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', borderRadius: 999, border: '1px solid rgba(148,163,184,0.18)', background: 'rgba(2,8,16,0.82)', padding: '10px 16px', display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', fontSize: 12 }}>
        <span>Loadout: {getLoadout(me?.loadoutId).name}</span>
        <span>HP: {Math.max(0, Math.round(me?.hp || 0))}</span>
        <span>Armor: {Math.max(0, Math.round(me?.armor || 0))}</span>
        <span>Ammo: {Math.max(0, Math.round(me?.ammo || 0))}</span>
        <span>K/D: {me?.frags || 0}/{me?.deaths || 0}</span>
        {spawnShieldRemaining > 0 ? <span style={{ color: '#7dd3fc' }}>Shield: {Math.ceil(spawnShieldRemaining / 1000)}</span> : null}
      </div>

      {(phase === 'lobby' || phase === 'finished') && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(4,6,12,0.64)', display: 'grid', placeItems: 'center', padding: 24 }}>
          <div style={{ width: 'min(980px, 92vw)', borderRadius: 28, background: 'rgba(7,10,18,0.94)', border: '1px solid rgba(35,211,238,0.28)', padding: 24, display: 'grid', gridTemplateColumns: '1.15fr 0.85fr', gap: 22 }}>
            <div>
              <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.18em', color: '#23d3ee' }}>Loadout + Arena Setup</div>
              <div style={{ fontSize: 34, fontWeight: 900, lineHeight: 0.95, marginTop: 6 }}>{phase === 'finished' ? 'Run It Again' : "Retro Rift '93"}</div>
              <div style={{ marginTop: 10, fontSize: 14, color: '#a3adc2', lineHeight: 1.6 }}>
                Bigger arenas, proper ceilings, open secret side routes, footsteps, bot raiders, and a hold-to-view tactical map.
              </div>
              {winnerId ? (
                <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 14, background: 'rgba(20,28,38,0.74)' }}>
                  Winner: {players.find((player) => player.id === winnerId)?.username || 'Unknown Raider'}
                </div>
              ) : null}
              <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
                {RETRO_RIFT_MAPS.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    disabled={!isHost || phase === 'live'}
                    onClick={() => applyLobbyConfig({ mapId: entry.id })}
                    style={{
                      borderRadius: 16,
                      border: matchConfig.mapId === entry.id ? `1px solid ${entry.palette.trim}` : '1px solid rgba(148,163,184,0.14)',
                      background: matchConfig.mapId === entry.id ? `${entry.palette.trim}14` : 'rgba(20,28,38,0.78)',
                      color: '#f8fafc',
                      padding: 12,
                      textAlign: 'left',
                      cursor: !isHost || phase === 'live' ? 'not-allowed' : 'pointer',
                      opacity: !isHost || phase === 'live' ? 0.65 : 1
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 800 }}>{entry.name}</div>
                    <div style={{ marginTop: 6, fontSize: 11, color: '#a3adc2', lineHeight: 1.45 }}>
                      {entry.id === 'rift-procedural' && matchConfig.mapId === entry.id ? `${entry.subtitle} Seed ${matchConfig.mapSeed}.` : entry.subtitle}
                    </div>
                  </button>
                ))}
              </div>
              {matchConfig.mapId === 'rift-procedural' ? (
                <div style={{ marginTop: 10 }}>
                  <button
                    type="button"
                    disabled={!isHost || phase === 'live'}
                    onClick={() => applyLobbyConfig({ mapSeed: Date.now() })}
                    style={{ borderRadius: 999, border: '1px solid rgba(251,191,36,0.35)', background: 'rgba(251,191,36,0.14)', color: '#f8fafc', padding: '8px 14px', fontSize: 11, cursor: !isHost || phase === 'live' ? 'not-allowed' : 'pointer', opacity: !isHost || phase === 'live' ? 0.6 : 1 }}
                  >
                    Reroll Random Layout
                  </button>
                </div>
              ) : null}
              <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
                {LOADOUTS.map((loadout) => (
                  <button
                    key={loadout.id}
                    type="button"
                    onClick={() => handleLoadoutSelect(loadout.id)}
                    style={{
                      borderRadius: 18,
                      border: selectedLoadout === loadout.id ? `1px solid ${loadout.color}` : '1px solid rgba(148,163,184,0.16)',
                      background: selectedLoadout === loadout.id ? `${loadout.color}18` : 'rgba(20,28,38,0.78)',
                      color: '#f8fafc',
                      padding: 14,
                      textAlign: 'left',
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{ fontWeight: 800 }}>{loadout.name}</div>
                    <div style={{ marginTop: 6, fontSize: 12, color: '#a3adc2', lineHeight: 1.5 }}>
                      DMG {loadout.damage} • RNG {loadout.range.toFixed(1)} • RPM {Math.round(60000 / loadout.cooldown)}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gap: 14 }}>
              <div style={{ padding: 16, borderRadius: 18, background: 'rgba(20,28,38,0.78)' }}>
                <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#a3adc2' }}>Match Rules</div>
                <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.65, color: '#f8fafc' }}>
                  <div>Frag target: {matchConfig.fragTarget}</div>
                  <div>Time limit: {matchConfig.timeLimitMs ? formatClock(matchConfig.timeLimitMs) : 'Unlimited'}</div>
                  <div>Pickup cycle: {formatClock(matchConfig.pickupRespawnMs)}</div>
                  <div>Bots: {BOT_COUNT} host-driven raiders</div>
                </div>
                <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {FRAG_TARGET_OPTIONS.map((value) => (
                      <button key={value} type="button" disabled={!isHost || phase === 'live'} onClick={() => applyLobbyConfig({ fragTarget: value })} style={{ borderRadius: 999, border: matchConfig.fragTarget === value ? '1px solid #23d3ee' : '1px solid rgba(148,163,184,0.14)', background: matchConfig.fragTarget === value ? 'rgba(35,211,238,0.16)' : 'rgba(15,23,42,0.88)', color: '#f8fafc', padding: '8px 10px', fontSize: 11, cursor: !isHost || phase === 'live' ? 'not-allowed' : 'pointer', opacity: !isHost || phase === 'live' ? 0.6 : 1 }}>
                        {value} Frags
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {TIME_LIMIT_OPTIONS.map((entry) => (
                      <button key={entry.value} type="button" disabled={!isHost || phase === 'live'} onClick={() => applyLobbyConfig({ timeLimitMs: entry.value })} style={{ borderRadius: 999, border: matchConfig.timeLimitMs === entry.value ? '1px solid #fbbf24' : '1px solid rgba(148,163,184,0.14)', background: matchConfig.timeLimitMs === entry.value ? 'rgba(251,191,36,0.16)' : 'rgba(15,23,42,0.88)', color: '#f8fafc', padding: '8px 10px', fontSize: 11, cursor: !isHost || phase === 'live' ? 'not-allowed' : 'pointer', opacity: !isHost || phase === 'live' ? 0.6 : 1 }}>
                        {entry.label}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {PICKUP_RESPAWN_OPTIONS.map((entry) => (
                      <button key={entry.value} type="button" disabled={!isHost || phase === 'live'} onClick={() => applyLobbyConfig({ pickupRespawnMs: entry.value })} style={{ borderRadius: 999, border: matchConfig.pickupRespawnMs === entry.value ? '1px solid #4ade80' : '1px solid rgba(148,163,184,0.14)', background: matchConfig.pickupRespawnMs === entry.value ? 'rgba(74,222,128,0.16)' : 'rgba(15,23,42,0.88)', color: '#f8fafc', padding: '8px 10px', fontSize: 11, cursor: !isHost || phase === 'live' ? 'not-allowed' : 'pointer', opacity: !isHost || phase === 'live' ? 0.6 : 1 }}>
                        {entry.label} Respawn
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {[
                      ['healthEnabled', 'Health'],
                      ['ammoEnabled', 'Ammo'],
                      ['armorEnabled', 'Armor']
                    ].map(([key, label]) => (
                      <button key={key} type="button" disabled={!isHost || phase === 'live'} onClick={() => applyLobbyConfig({ [key]: !matchConfig[key] })} style={{ borderRadius: 999, border: matchConfig[key] ? '1px solid #c084fc' : '1px solid rgba(148,163,184,0.14)', background: matchConfig[key] ? 'rgba(192,132,252,0.16)' : 'rgba(15,23,42,0.88)', color: '#f8fafc', padding: '8px 10px', fontSize: 11, cursor: !isHost || phase === 'live' ? 'not-allowed' : 'pointer', opacity: !isHost || phase === 'live' ? 0.6 : 1 }}>
                        {label} {matchConfig[key] ? 'On' : 'Off'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div style={{ padding: 16, borderRadius: 18, background: 'rgba(20,28,38,0.78)' }}>
                <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#a3adc2' }}>Asset Pack</div>
                <div style={{ marginTop: 10, fontSize: 12, lineHeight: 1.6, color: '#e2e8f0' }}>
                  <div>{activeTexturePack.name}</div>
                  <div style={{ color: '#a3adc2', marginTop: 6 }}>{activeTexturePack.summary}</div>
                  <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                    {activeTexturePack.sources.map((source) => (
                      <div key={source.url}>{source.label} • {source.license}</div>
                    ))}
                  </div>
                </div>
              </div>
              <div style={{ padding: 16, borderRadius: 18, background: 'rgba(20,28,38,0.78)' }}>
                <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#a3adc2' }}>Recent Feed</div>
                <div style={{ marginTop: 10, display: 'grid', gap: 8, fontSize: 12, color: '#e2e8f0', maxHeight: 120, overflow: 'auto' }}>
                  {feed.length ? feed.map((entry) => <div key={entry.id}>{entry.text}</div>) : <div>No frags yet.</div>}
                </div>
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                <button type="button" onClick={handleReadyToggle} style={{ borderRadius: 14, border: me?.ready ? '1px solid #22c55e' : '1px solid rgba(148,163,184,0.16)', background: me?.ready ? 'linear-gradient(135deg, #15803d, #22c55e)' : 'rgba(20,28,38,0.88)', color: 'white', fontWeight: 800, padding: '14px 16px', cursor: 'pointer' }}>
                  {me?.ready ? 'Ready Confirmed' : 'Mark Ready'}
                </button>
                {isHost ? (
                  <button type="button" disabled={!allReady} onClick={handleLaunch} style={{ borderRadius: 14, border: '1px solid transparent', background: allReady ? 'linear-gradient(135deg, #23d3ee, #fbbf24)' : 'rgba(30,41,59,0.78)', color: allReady ? '#020617' : '#94a3b8', fontWeight: 900, padding: '14px 16px', cursor: allReady ? 'pointer' : 'not-allowed' }}>
                    Launch {activeMap.name}
                  </button>
                ) : null}
                {isHost && phase === 'finished' ? (
                  <button type="button" onClick={handleReset} style={{ borderRadius: 14, border: '1px solid rgba(148,163,184,0.16)', background: 'rgba(20,28,38,0.88)', color: '#f8fafc', fontWeight: 800, padding: '12px 16px', cursor: 'pointer' }}>
                    Back To Lobby
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}

      {phase === 'countdown' && (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
          <div style={{ textAlign: 'center', color: '#f8fafc', textShadow: '0 12px 36px rgba(0,0,0,0.45)' }}>
            <div style={{ fontSize: 18, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#23d3ee' }}>Rift Breach</div>
            <div style={{ fontSize: 92, fontWeight: 900, lineHeight: 0.9 }}>{countdown || 'GO'}</div>
            <div style={{ marginTop: 10, fontSize: 14, letterSpacing: '0.08em' }}>{activeMap.name}</div>
          </div>
        </div>
      )}

      {isDead && (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'radial-gradient(circle at center, rgba(127,29,29,0.16), rgba(2,6,23,0.9))', pointerEvents: 'none' }}>
          <div style={{ textAlign: 'center', padding: '26px 32px', borderRadius: 24, border: '1px solid rgba(248,113,113,0.36)', background: 'rgba(15,23,42,0.72)', boxShadow: '0 24px 80px rgba(0,0,0,0.45)', transform: `scale(${1 + Math.sin(Date.now() * 0.012) * 0.025}) translateY(${Math.sin(Date.now() * 0.01) * 6}px)` }}>
            <div style={{ fontSize: 12, letterSpacing: '0.32em', textTransform: 'uppercase', color: '#fca5a5' }}>System Failure</div>
            <div style={{ marginTop: 10, fontSize: 64, lineHeight: 0.9, fontWeight: 900, color: '#f8fafc' }}>FLATLINED</div>
            <div style={{ marginTop: 12, fontSize: 14, color: '#cbd5e1' }}>Reprinting raider chassis. Hold steady.</div>
            <div style={{ marginTop: 18, fontSize: 72, fontWeight: 900, color: '#f87171' }}>{Math.max(1, Math.ceil(respawnRemaining / 1000))}</div>
            <div style={{ marginTop: 8, fontSize: 12, color: '#fca5a5', letterSpacing: '0.18em', textTransform: 'uppercase' }}>Respawn Inbound</div>
          </div>
        </div>
      )}
    </GameCanvasShell>
  )
}

export default RetroRiftActivity
