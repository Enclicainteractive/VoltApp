import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { shouldIgnoreActivityHotkey } from './shared/hotkeys'
import { getRetroRiftTexturePack } from './shared/retroShooterAssets'
import { createRetroShooterAudio } from './shared/retroShooterAudio'
import { getRetroRiftMap, RETRO_RIFT_MAPS } from './shared/retroShooterMaps'

const FOV = Math.PI / 3
const VIEW_DEPTH = 20
const MOVE_SPEED = 2.8
const TURN_SPEED = 2.2
const PLAYER_SYNC_MS = 90
const RESPAWN_MS = 2600
const COUNTDOWN_MS = 3200
const DEFAULT_FRAG_TARGET = 12
const DEFAULT_PICKUP_RESPAWN_MS = 9000
const DEFAULT_TIME_LIMIT_MS = 8 * 60 * 1000
const TEAM_COLORS = ['#23d3ee', '#fb7185', '#fbbf24', '#34d399', '#c084fc', '#fb923c', '#93c5fd', '#f472b6']
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
  fragTarget: DEFAULT_FRAG_TARGET,
  timeLimitMs: DEFAULT_TIME_LIMIT_MS,
  pickupRespawnMs: DEFAULT_PICKUP_RESPAWN_MS,
  healthEnabled: true,
  ammoEnabled: true,
  armorEnabled: true
}

const sanitizeMatchConfig = (value = {}) => {
  const mapId = RETRO_RIFT_MAPS.some((map) => map.id === value.mapId) ? value.mapId : DEFAULT_MATCH_CONFIG.mapId
  const fragTarget = FRAG_TARGET_OPTIONS.includes(Number(value.fragTarget)) ? Number(value.fragTarget) : DEFAULT_MATCH_CONFIG.fragTarget
  const timeLimitMs = TIME_LIMIT_OPTIONS.some((entry) => entry.value === Number(value.timeLimitMs))
    ? Number(value.timeLimitMs)
    : DEFAULT_MATCH_CONFIG.timeLimitMs
  const pickupRespawnMs = PICKUP_RESPAWN_OPTIONS.some((entry) => entry.value === Number(value.pickupRespawnMs))
    ? Number(value.pickupRespawnMs)
    : DEFAULT_MATCH_CONFIG.pickupRespawnMs
  return {
    mapId,
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

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const normalizeAngle = (angle) => {
  let next = angle
  while (next < -Math.PI) next += Math.PI * 2
  while (next > Math.PI) next -= Math.PI * 2
  return next
}

const toFeedId = () => `feed-${Math.random().toString(36).slice(2, 9)}-${Date.now().toString(36)}`

const isWall = (grid, x, y) => {
  const cellX = Math.floor(x)
  const cellY = Math.floor(y)
  const row = grid[cellY]
  if (!row) return true
  const tile = row[cellX]
  return tile === '#' || tile == null
}

const hasLineOfSight = (grid, x0, y0, x1, y1) => {
  const dx = x1 - x0
  const dy = y1 - y0
  const distance = Math.hypot(dx, dy)
  const steps = Math.max(2, Math.ceil(distance * 18))
  for (let index = 1; index < steps; index += 1) {
    const t = index / steps
    if (isWall(grid, x0 + dx * t, y0 + dy * t)) return false
  }
  return true
}

const castRay = (grid, originX, originY, angle, maxDepth = VIEW_DEPTH) => {
  const sin = Math.sin(angle)
  const cos = Math.cos(angle)
  let depth = 0
  while (depth < maxDepth) {
    depth += 0.02
    const sampleX = originX + cos * depth
    const sampleY = originY + sin * depth
    if (isWall(grid, sampleX, sampleY)) {
      return { depth, hitX: sampleX, hitY: sampleY }
    }
  }
  return { depth: maxDepth, hitX: originX + cos * maxDepth, hitY: originY + sin * maxDepth }
}

const findOpenSpawn = (mapConfig, takenPlayers = [], preferredIndex = 0) => {
  const points = mapConfig.spawnPoints || []
  for (let offset = 0; offset < points.length; offset += 1) {
    const point = points[(preferredIndex + offset) % points.length]
    const occupied = takenPlayers.some((player) => Math.hypot(player.x - point.x, player.y - point.y) < 1.1)
    if (!occupied) return point
  }
  return points[preferredIndex % points.length] || { x: 1.5, y: 1.5, angle: 0 }
}

const createPlayer = (mapConfig, id, username, color, loadoutId, preferredIndex = 0, takenPlayers = []) => {
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
    flashUntil: 0
  }
}

const normalizePlayer = (mapConfig, payload = {}, players = []) => {
  const id = String(payload.playerId || payload.id || `pilot-${players.length}`)
  const base = createPlayer(
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
    ready: !!payload.ready,
    respawnAt: Number(payload.respawnAt || 0),
    flashUntil: Number(payload.flashUntil || 0),
    loadoutId: String(payload.loadoutId || base.loadoutId)
  }
}

const tryMove = (grid, x, y, deltaX, deltaY) => {
  let nextX = x + deltaX
  let nextY = y + deltaY
  if (isWall(grid, nextX, y)) nextX = x
  if (isWall(grid, nextX, nextY)) nextY = y
  return [nextX, nextY]
}

const getLoadout = (loadoutId) => LOADOUTS.find((loadout) => loadout.id === loadoutId) || LOADOUTS[0]
const formatClock = (ms) => {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function renderScene({ ctx, width, height, mapConfig, player, players, pickups, muzzleUntil }) {
  const { grid, palette } = mapConfig
  ctx.fillStyle = palette.ceiling
  ctx.fillRect(0, 0, width, height / 2)
  ctx.fillStyle = palette.floor
  ctx.fillRect(0, height / 2, width, height / 2)

  const rayCount = Math.min(320, width)
  const depthBuffer = new Array(rayCount).fill(VIEW_DEPTH)
  const columnWidth = width / rayCount

  for (let column = 0; column < rayCount; column += 1) {
    const rayAngle = normalizeAngle(player.angle - FOV / 2 + (column / rayCount) * FOV)
    const hit = castRay(grid, player.x, player.y, rayAngle)
    const correctedDepth = hit.depth * Math.cos(rayAngle - player.angle)
    depthBuffer[column] = correctedDepth
    const wallHeight = Math.min(height, (height / Math.max(correctedDepth, 0.18)) * 0.92)
    const shade = clamp(1 - correctedDepth / VIEW_DEPTH, 0.18, 1)
    const wallTop = (height - wallHeight) / 2
    const isVerticalEdge = Math.abs(hit.hitX - Math.round(hit.hitX)) < 0.08
    ctx.fillStyle = isVerticalEdge ? palette.wallAccent : palette.wall
    ctx.globalAlpha = 0.28 + shade * 0.72
    ctx.fillRect(column * columnWidth, wallTop, columnWidth + 1, wallHeight)
    ctx.globalAlpha = Math.min(0.22 + shade * 0.12, 0.3)
    ctx.fillStyle = palette.trim
    ctx.fillRect(column * columnWidth, wallTop + wallHeight * 0.16, columnWidth + 1, Math.max(2, wallHeight * 0.08))
    ctx.globalAlpha = 1
  }

  const sprites = [
    ...players
      .filter((entry) => entry.id !== player.id && Date.now() >= entry.respawnAt)
      .map((entry) => ({ kind: 'player', x: entry.x, y: entry.y, color: entry.color, label: entry.username, hp: entry.hp })),
    ...pickups
      .filter((pickup) => pickup.active)
      .map((pickup) => ({ kind: 'pickup', x: pickup.x, y: pickup.y, color: PICKUP_CONFIG[pickup.type]?.color || '#fff', label: PICKUP_CONFIG[pickup.type]?.label || pickup.type }))
  ]

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
      const top = height / 2 - size * 0.5
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

  if (Date.now() < muzzleUntil) {
    ctx.fillStyle = 'rgba(255,214,10,0.32)'
    ctx.fillRect(width * 0.42, height * 0.6, width * 0.16, height * 0.18)
  }

  ctx.fillStyle = palette.trim
  ctx.fillRect(0, height - 4, width, 4)
}

const RetroRiftActivity = ({ sdk, currentUser, session }) => {
  const canvasRef = useRef(null)
  const keysRef = useRef(new Set())
  const lastSyncRef = useRef(0)
  const lastShotRef = useRef(0)
  const muzzleUntilRef = useRef(0)
  const audioRef = useRef(null)
  const playersRef = useRef([])
  const pickupsRef = useRef([])
  const phaseRef = useRef('lobby')
  const statusRef = useRef('Load in, pick a rig, and mark ready.')
  const countdownEndsAtRef = useRef(0)
  const winnerIdRef = useRef(null)
  const selectedLoadoutRef = useRef(LOADOUTS[0].id)
  const matchConfigRef = useRef(DEFAULT_MATCH_CONFIG)
  const matchEndsAtRef = useRef(0)
  const mapConfigRef = useRef(getRetroRiftMap(DEFAULT_MATCH_CONFIG.mapId))
  const pendingPickupClaimsRef = useRef(new Set())
  const countdownStartedRef = useRef(false)
  const guestIdRef = useRef(currentUser?.id || `guest-${Math.random().toString(36).slice(2, 9)}`)

  if (!audioRef.current) audioRef.current = createRetroShooterAudio()

  const userId = currentUser?.id || guestIdRef.current
  const username = currentUser?.username || currentUser?.displayName || 'Rifter'
  const hostId = session?.hostId || session?.ownerId || session?.createdBy || userId
  const isHost = hostId === userId
  const playerColor = useMemo(() => TEAM_COLORS[Math.abs(userId.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0)) % TEAM_COLORS.length], [userId])

  const [selectedLoadout, setSelectedLoadout] = useState(LOADOUTS[0].id)
  const [matchConfig, setMatchConfig] = useState(DEFAULT_MATCH_CONFIG)
  const activeMap = useMemo(() => getRetroRiftMap(matchConfig.mapId), [matchConfig.mapId])
  const activeTexturePack = useMemo(() => getRetroRiftTexturePack(activeMap.texturePackId), [activeMap.texturePackId])
  const [players, setPlayers] = useState(() => [createPlayer(activeMap, userId, username, playerColor, selectedLoadout)])
  const [pickups, setPickups] = useState(() => filterPickupsForConfig(activeMap.pickups, DEFAULT_MATCH_CONFIG).map((pickup) => ({ ...pickup, active: true, respawnAt: 0 })))
  const [phase, setPhase] = useState('lobby')
  const [status, setStatus] = useState('Load in, pick a rig, and mark ready.')
  const [countdownEndsAt, setCountdownEndsAt] = useState(0)
  const [matchEndsAt, setMatchEndsAt] = useState(0)
  const [winnerId, setWinnerId] = useState(null)
  const [feed, setFeed] = useState([])
  const [countdownNow, setCountdownNow] = useState(Date.now())
  const [matchClockNow, setMatchClockNow] = useState(Date.now())

  const sendEvent = useCallback((eventType, payload = {}) => {
    sdk?.emitEvent?.(eventType, payload, { serverRelay: true })
  }, [sdk])

  const me = players.find((player) => player.id === userId) || players[0]
  const leaderboard = [...players].sort((a, b) => {
    if (b.frags !== a.frags) return b.frags - a.frags
    return a.deaths - b.deaths
  })
  // Launch is allowed when the host is ready. Requiring ALL players to be ready
  // blocks the game if any stale/disconnected player never marks ready.
  const allReady = players.length >= 1 && players.some((player) => player.ready)
  const countdown = phase === 'countdown' ? Math.max(0, Math.ceil((countdownEndsAt - countdownNow) / 1000)) : 0
  const matchTimeRemaining = phase === 'live' && matchEndsAt > 0 ? Math.max(0, matchEndsAt - matchClockNow) : 0

  const appendFeed = useCallback((text) => {
    setFeed((current) => [{ id: toFeedId(), text, createdAt: Date.now() }, ...current].slice(0, 5))
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
      pickups: pickupsRef.current
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
    phaseRef.current = phase
    if (phase !== 'countdown') countdownStartedRef.current = false
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
        muzzleUntil: muzzleUntilRef.current
      })
      frameId = window.requestAnimationFrame(draw)
    }

    frameId = window.requestAnimationFrame(draw)
    return () => window.cancelAnimationFrame(frameId)
  }, [userId])

  useEffect(() => {
    const handleEvent = (event) => {
      const type = String(event?.type || '')
      const payload = event?.payload || {}
      if (!type.startsWith('retrorift:')) return
      if (payload.targetId && payload.targetId !== userId) return

      switch (type) {
        case 'retrorift:join': {
          setPlayers((current) => {
            const existing = current.find((player) => player.id === payload.playerId)
            if (existing) return current
            return [...current, normalizePlayer(mapConfigRef.current, payload, current)]
          })
          if (isHost) sendSnapshot(payload.playerId)
          break
        }
        case 'retrorift:leave':
          setPlayers((current) => current.filter((player) => player.id !== payload.playerId))
          break
        case 'retrorift:snapshot':
          if (payload.config) setMatchConfig(sanitizeMatchConfig(payload.config))
          if (Array.isArray(payload.players)) {
            const snapshotMap = getRetroRiftMap(payload.config?.mapId || matchConfigRef.current.mapId)
            setPlayers(payload.players.map((player, index, arr) => normalizePlayer(snapshotMap, player, arr.slice(0, index))))
          }
          if (Array.isArray(payload.pickups)) {
            pickupsRef.current = payload.pickups
            setPickups(payload.pickups)
          }
          setPhase(String(payload.phase || 'lobby'))
          setStatus(String(payload.status || statusRef.current))
          setWinnerId(payload.winnerId || null)
          setCountdownEndsAt(Number(payload.countdownEndsAt || 0))
          setMatchEndsAt(Number(payload.matchEndsAt || 0))
          break
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
        case 'retrorift:phase':
          if (payload.config) setMatchConfig(sanitizeMatchConfig(payload.config))
          setPhase(String(payload.phase || phaseRef.current))
          if (payload.status) setStatus(String(payload.status))
          if (payload.winnerId !== undefined) setWinnerId(payload.winnerId || null)
          if (Object.prototype.hasOwnProperty.call(payload, 'countdownEndsAt')) {
            setCountdownEndsAt(Number(payload.countdownEndsAt || 0))
          }
          if (Object.prototype.hasOwnProperty.call(payload, 'matchEndsAt')) {
            setMatchEndsAt(Number(payload.matchEndsAt || 0))
          }
          if (Array.isArray(payload.players)) {
            const phaseMap = getRetroRiftMap(payload.config?.mapId || matchConfigRef.current.mapId)
            setPlayers(payload.players.map((player, index, arr) => normalizePlayer(phaseMap, player, arr.slice(0, index))))
          }
          if (Array.isArray(payload.pickups)) {
            pickupsRef.current = payload.pickups
            setPickups(payload.pickups)
          }
          break
        case 'retrorift:config': {
          const nextConfig = sanitizeMatchConfig(payload.config)
          const nextMap = getRetroRiftMap(nextConfig.mapId)
          setMatchConfig(nextConfig)
          if (Array.isArray(payload.players)) {
            setPlayers(payload.players.map((player, index, arr) => normalizePlayer(nextMap, player, arr.slice(0, index))))
          }
          if (Array.isArray(payload.pickups)) {
            pickupsRef.current = payload.pickups
            setPickups(payload.pickups)
          }
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
            pickup.id === payload.pickupId
              ? { ...pickup, active: false, respawnAt: Number(payload.respawnAt || Date.now() + PICKUP_RESPAWN_MS) }
              : pickup
          ))
          pickupsRef.current = nextPickups
          setPickups(nextPickups)
          updatePlayer(payload.playerId, (player) => {
            const next = { ...player }
            if (payload.pickupType === 'health') next.hp = clamp(next.hp + PICKUP_CONFIG.health.amount, 0, 100)
            if (payload.pickupType === 'ammo') next.ammo = next.ammo + PICKUP_CONFIG.ammo.amount
            if (payload.pickupType === 'armor') next.armor = clamp(next.armor + PICKUP_CONFIG.armor.amount, 0, 100)
            return next
          })
          pendingPickupClaimsRef.current.delete(payload.pickupId)
          if (payload.playerId === userId) audioRef.current.pickup()
          break
        }
        case 'retrorift:pickup-respawn': {
          const pickupIds = new Set(Array.isArray(payload.pickupIds) ? payload.pickupIds : [])
          if (!pickupIds.size) break
          const nextPickups = pickupsRef.current.map((pickup) => (
            pickupIds.has(pickup.id) ? { ...pickup, active: true, respawnAt: 0 } : pickup
          ))
          pickupsRef.current = nextPickups
          setPickups(nextPickups)
          pickupIds.forEach((pickupId) => pendingPickupClaimsRef.current.delete(pickupId))
          break
        }
        case 'retrorift:damage': {
          updatePlayer(payload.targetId, (player) => ({
            ...player,
            hp: Number(payload.hp ?? player.hp),
            armor: Number(payload.armor ?? player.armor),
            deaths: Number(payload.deaths ?? player.deaths),
            respawnAt: Number(payload.respawnAt || player.respawnAt),
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
        }
        case 'retrorift:respawn':
          updatePlayer(payload.playerId, (player) => ({
            ...player,
            x: Number(payload.x ?? player.x),
            y: Number(payload.y ?? player.y),
            angle: Number(payload.angle ?? player.angle),
            hp: 100,
            armor: 0,
            ammo: Math.max(player.ammo, 16),
            respawnAt: 0
          }))
          if (payload.playerId === userId) audioRef.current.respawn()
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
      keysRef.current.add(event.key.toLowerCase())
    }
    const handleUp = (event) => {
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
          matchEndsAt: matchEndsAtRef.current
        })
        // Apply locally immediately – solo play won't echo the event back
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
        config: matchConfigRef.current
      })
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
      const respawnSet = new Set(respawnIds)
      const nextPickups = pickupsRef.current.map((pickup) => (
        respawnSet.has(pickup.id) ? { ...pickup, active: true, respawnAt: 0 } : pickup
      ))
      pickupsRef.current = nextPickups
      setPickups(nextPickups)
      sendEvent('retrorift:pickup-respawn', { pickupIds: respawnIds })
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

        const [x, y] = tryMove(mapConfigRef.current.grid, player.x, player.y, moveX, moveY)
        const nextPlayer = { ...player, x, y, angle }

        for (const pickup of pickupsRef.current) {
          if (!pickup.active) continue
          if (pendingPickupClaimsRef.current.has(pickup.id)) continue
          if (Math.hypot(nextPlayer.x - pickup.x, nextPlayer.y - pickup.y) <= 0.48) {
            pendingPickupClaimsRef.current.add(pickup.id)
            const nextPickups = pickupsRef.current.map((entry) => (
              entry.id === pickup.id
                ? { ...entry, active: false, respawnAt: Date.now() + matchConfigRef.current.pickupRespawnMs }
                : entry
            ))
            pickupsRef.current = nextPickups
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
            .filter((entry) => entry.distance <= loadout.range && entry.angleDelta <= loadout.spread + 0.08 && hasLineOfSight(mapConfigRef.current.grid, nextPlayer.x, nextPlayer.y, entry.entry.x, entry.entry.y))
            .sort((a, b) => a.distance - b.distance)[0]

          if (target) {
            const targetArmor = Math.max(0, target.entry.armor - Math.ceil(loadout.damage * 0.45))
            const armorAbsorb = target.entry.armor - targetArmor
            const nextHp = Math.max(0, target.entry.hp - Math.max(0, loadout.damage - armorAbsorb))
            const nextDeaths = nextHp <= 0 ? target.entry.deaths + 1 : target.entry.deaths
            const nextFrags = nextPlayer.frags + (nextHp <= 0 ? 1 : 0)
            const winner = nextFrags >= matchConfigRef.current.fragTarget ? userId : null
            let respawnPayload = {}
            if (nextHp <= 0) {
              const spawn = findOpenSpawn(mapConfigRef.current, playersRef.current.filter((entry) => entry.id !== target.entry.id), target.entry.deaths + 1)
              respawnPayload = { x: spawn.x, y: spawn.y, angle: spawn.angle, respawnAt: Date.now() + RESPAWN_MS }
            }
            sendEvent('retrorift:damage', {
              playerId: userId,
              targetId: target.entry.id,
              frags: nextFrags,
              ammo: nextPlayer.ammo - loadout.ammoUse,
              hp: nextHp,
              armor: targetArmor,
              deaths: nextDeaths,
              ...respawnPayload,
              winnerId: winner,
              winText: winner ? `${username} sealed the rift.` : null,
              feedText: nextHp <= 0 ? `${username} folded ${target.entry.username}` : `${username} tagged ${target.entry.username}`
            })
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
        const spawn = findOpenSpawn(mapConfigRef.current, arr.filter((entry) => entry.id !== player.id), index)
        sendEvent('retrorift:respawn', { playerId: player.id, x: spawn.x, y: spawn.y, angle: spawn.angle })
        return { ...player, x: spawn.x, y: spawn.y, angle: spawn.angle, hp: 100, armor: 0, ammo: Math.max(player.ammo, 16), respawnAt: 0 }
      }))
    }, 16)
    return () => window.clearInterval(interval)
  }, [phase, sendEvent, updatePlayer, userId, username])

  // ── OPL3 background music – track changes with phase ─────────────────────────
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
    if (phase === 'finished' && winnerId === userId) {
      audioRef.current.win()
      // Switch to victory track
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
    const nextMap = getRetroRiftMap(nextConfig.mapId)
    const nextPlayers = playersRef.current.map((player, index, arr) => {
      const spawn = findOpenSpawn(nextMap, arr.filter((entry) => entry.id !== player.id), index)
      return {
        ...player,
        x: spawn.x,
        y: spawn.y,
        angle: spawn.angle,
        ready: false,
        respawnAt: 0
      }
    })
    const nextPickups = filterPickupsForConfig(nextMap.pickups, nextConfig).map((pickup) => ({ ...pickup, active: true, respawnAt: 0 }))
    setMatchConfig(nextConfig)
    setPlayers(nextPlayers)
    setPickups(nextPickups)
    setStatus(`Load in on ${nextMap.name}, tune match rules, and mark ready.`)
    sendEvent('retrorift:config', {
      config: nextConfig,
      players: nextPlayers,
      pickups: nextPickups,
      status: `Load in on ${nextMap.name}, tune match rules, and mark ready.`
    })
  }, [isHost, phase, sendEvent])

  const handleLaunch = useCallback(() => {
    if (!isHost || !allReady) return
    const launchMap = getRetroRiftMap(matchConfigRef.current.mapId)
    const playersForStart = players.map((player, index, arr) => {
      const spawn = findOpenSpawn(launchMap, arr.filter((entry) => entry.id !== player.id), index)
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
        // Keep ready: true so allReady stays true until phase actually changes.
        // The phase event handler will reset ready state when countdown begins.
        ready: player.ready,
        respawnAt: 0
      }
    })
    const freshPickups = filterPickupsForConfig(launchMap.pickups, matchConfigRef.current).map((pickup) => ({ ...pickup, active: true, respawnAt: 0 }))
    const nextMatchEndsAt = matchConfigRef.current.timeLimitMs > 0 ? Date.now() + matchConfigRef.current.timeLimitMs + COUNTDOWN_MS : 0
    const countdownEndsAt = Date.now() + COUNTDOWN_MS
    // Send the authoritative phase event – the handler will apply it for all clients
    sendEvent('retrorift:phase', {
      phase: 'countdown',
      status: `Seal your visor. ${launchMap.name} breaches in three.`,
      countdownEndsAt,
      matchEndsAt: nextMatchEndsAt,
      config: matchConfigRef.current,
      // Send players with ready: false in the event so remote clients reset correctly
      players: playersForStart.map(p => ({ ...p, ready: false })),
      pickups: freshPickups,
      winnerId: null
    })
    // Apply locally – keep ready:true so allReady stays true until phase changes
    setPlayers(playersForStart)
    setPickups(freshPickups)
    setWinnerId(null)
    setCountdownEndsAt(countdownEndsAt)
    setMatchEndsAt(nextMatchEndsAt)
    setPhase('countdown')
    setStatus(`Seal your visor. ${launchMap.name} breaches in three.`)
  }, [allReady, isHost, players, sendEvent])

  const handleReset = useCallback(() => {
    if (!isHost) return
    const resetMap = getRetroRiftMap(matchConfigRef.current.mapId)
    const resetPlayers = players.map((player, index, arr) => {
      const spawn = findOpenSpawn(resetMap, arr.filter((entry) => entry.id !== player.id), index)
      return { ...player, x: spawn.x, y: spawn.y, angle: spawn.angle, hp: 100, armor: 0, ammo: 28, frags: 0, deaths: 0, ready: false, respawnAt: 0 }
    })
    const freshPickups = filterPickupsForConfig(resetMap.pickups, matchConfigRef.current).map((pickup) => ({ ...pickup, active: true, respawnAt: 0 }))
    sendEvent('retrorift:phase', {
      phase: 'lobby',
      status: `Load in on ${resetMap.name}, tune match rules, and mark ready.`,
      players: resetPlayers,
      pickups: freshPickups,
      winnerId: null,
      countdownEndsAt: 0,
      matchEndsAt: 0,
      config: matchConfigRef.current
    })
    setPlayers(resetPlayers)
    setPickups(freshPickups)
    setWinnerId(null)
    setCountdownEndsAt(0)
    setMatchEndsAt(0)
    setStatus(`Load in on ${resetMap.name}, tune match rules, and mark ready.`)
  }, [isHost, players, sendEvent])

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', background: activeMap.palette.fog, color: '#f8fafc', fontFamily: 'monospace' }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', imageRendering: 'pixelated' }} />

      <div style={{ position: 'absolute', top: 16, left: 16, width: 320, borderRadius: 18, border: '1px solid rgba(35,211,238,0.24)', background: 'rgba(7,10,18,0.82)', backdropFilter: 'blur(10px)', padding: 16 }}>
        <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#23d3ee' }}>Retro Rift '93</div>
        <div style={{ fontSize: 30, fontWeight: 900, lineHeight: 0.95, marginTop: 6 }}>{activeMap.name}</div>
        <div style={{ fontSize: 13, color: '#a3adc2', lineHeight: 1.55, marginTop: 10 }}>
          {activeMap.subtitle}
        </div>
        <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 12, background: 'rgba(20,28,38,0.78)', color: '#f8fafc', fontSize: 12 }}>{status}</div>
        <div style={{ marginTop: 12, fontSize: 12, color: '#cbd5e1', lineHeight: 1.6 }}>
          <div>`W/S` move, `A/D` strafe, `Arrow Left/Right` turn, `Space` fire, `Shift` surge.</div>
          <div>{RETRO_RIFT_MAPS.length} arenas loaded. First raider to {matchConfig.fragTarget} frags seals the breach.</div>
          <div>Texture pack: {activeTexturePack.name} • CC0-ready source manifest attached.</div>
        </div>
      </div>

      <div style={{ position: 'absolute', top: 16, right: 16, width: 280, borderRadius: 18, border: '1px solid rgba(148,163,184,0.18)', background: 'rgba(7,10,18,0.82)', backdropFilter: 'blur(10px)', padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#23d3ee' }}>Frag Board</div>
        <div style={{ marginTop: 8, display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 11, color: '#a3adc2' }}>
          <span>Map {RETRO_RIFT_MAPS.findIndex((entry) => entry.id === activeMap.id) + 1}/12</span>
          <span>Clock {matchEndsAt > 0 ? formatClock(matchTimeRemaining) : '∞'}</span>
        </div>
        <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
          {leaderboard.map((player, index) => (
            <div key={player.id} style={{ display: 'grid', gridTemplateColumns: '16px 1fr auto', gap: 10, alignItems: 'center', padding: '8px 10px', borderRadius: 12, background: 'rgba(20,28,38,0.74)' }}>
              <div style={{ width: 16, height: 16, borderRadius: 999, background: player.color }} />
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>
                {index + 1}. {player.username}{player.id === userId ? ' (you)' : ''}
              </div>
              <div style={{ fontSize: 12, fontWeight: 800, color: player.ready ? '#4ade80' : '#f87171' }}>
                {phase === 'live' ? `${player.frags}/${matchConfig.fragTarget}` : player.ready ? 'Ready' : 'Idle'}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ position: 'absolute', bottom: 18, left: '50%', transform: 'translateX(-50%)', borderRadius: 999, border: '1px solid rgba(148,163,184,0.18)', background: 'rgba(2,8,16,0.88)', padding: '12px 18px', display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
        <span>Loadout: {getLoadout(me?.loadoutId).name}</span>
        <span>HP: {Math.max(0, Math.round(me?.hp || 0))}</span>
        <span>Armor: {Math.max(0, Math.round(me?.armor || 0))}</span>
        <span>Ammo: {Math.max(0, Math.round(me?.ammo || 0))}</span>
        <span>K/D: {me?.frags || 0}/{me?.deaths || 0}</span>
      </div>

      {(phase === 'lobby' || phase === 'finished') && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(4,6,12,0.64)', display: 'grid', placeItems: 'center', padding: 24 }}>
          <div style={{ width: 'min(980px, 92vw)', borderRadius: 28, background: 'rgba(7,10,18,0.94)', border: '1px solid rgba(35,211,238,0.28)', padding: 24, display: 'grid', gridTemplateColumns: '1.15fr 0.85fr', gap: 22 }}>
            <div>
              <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.18em', color: '#23d3ee' }}>Loadout + Arena Setup</div>
              <div style={{ fontSize: 34, fontWeight: 900, lineHeight: 0.95, marginTop: 6 }}>{phase === 'finished' ? 'Run It Again' : "Retro Rift '93"}</div>
              <div style={{ marginTop: 10, fontSize: 14, color: '#a3adc2', lineHeight: 1.6 }}>
                Twelve original arenas, host-controlled match rules, and a texture pipeline organized around CC0/public-domain-safe sources.
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
                    <div style={{ marginTop: 6, fontSize: 11, color: '#a3adc2', lineHeight: 1.45 }}>{entry.subtitle}</div>
                  </button>
                ))}
              </div>
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
                  <div>Spawns: {matchConfig.healthEnabled ? 'Health ' : ''}{matchConfig.ammoEnabled ? 'Ammo ' : ''}{matchConfig.armorEnabled ? 'Armor' : ''}</div>
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
    </div>
  )
}

export default RetroRiftActivity
