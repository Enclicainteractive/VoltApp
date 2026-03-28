import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { PerspectiveCamera, Stars } from '@react-three/drei'
import * as THREE from 'three'
import { shouldIgnoreActivityHotkey } from './shared/hotkeys'
import { createFlightActivityAudio } from './shared/flightActivityAudio'
import FlightActivityHud from './shared/flightActivityHud'
import { getFlightActivityMode } from './shared/flightActivityModes'
import GameCanvasShell from './shared/GameCanvasShell'

const PLAYER_SYNC_MS = 90
const RESPAWN_MS = 2600
const PROJECTILE_GRAVITY = 2.8
const PROJECTILE_DRAG = 0.996
const PROJECTILE_LIFETIME_MS = 4200
const PICKUP_RESPAWN_MS = 9000
const COUNTDOWN_MS = 3600
const LAP_TARGET = 3
const SCORE_TARGET = 10
const TEAM_COLORS = ['#38bdf8', '#fb7185', '#facc15', '#34d399', '#c084fc', '#f97316', '#22d3ee', '#f472b6']

const CRAFTS = [
  { id: 'interceptor', name: 'Interceptor', role: 'Chaser', boost: 'Burst', color: '#38bdf8', speed: 96, accel: 0.26, turn: 1.16, climb: 0.96, hp: 92, damage: 22, cooldown: 140, projectileSpeed: 148 },
  { id: 'striker', name: 'Striker', role: 'Bruiser', boost: 'Heavy', color: '#f97316', speed: 82, accel: 0.22, turn: 0.88, climb: 0.82, hp: 132, damage: 34, cooldown: 235, projectileSpeed: 126 },
  { id: 'glider', name: 'Glider', role: 'Slipstream', boost: 'Feather', color: '#a78bfa', speed: 102, accel: 0.19, turn: 1.24, climb: 0.78, hp: 84, damage: 18, cooldown: 132, projectileSpeed: 154 }
]

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const makeId = (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`

const seeded = (seed) => {
  let value = seed * 9301 + 49297
  return () => {
    value = (value * 233280 + 49297) % 233280
    return value / 233280
  }
}

const getCraft = (craftId) => CRAFTS.find((entry) => entry.id === craftId) || CRAFTS[0]
const getForwardVector = (pitch, yaw) => [
  Math.sin(yaw) * Math.cos(pitch),
  Math.sin(pitch),
  Math.cos(yaw) * Math.cos(pitch)
]

const distanceSegmentToPoint = (a, b, p) => {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]]
  const abLenSq = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2
  if (!abLenSq) return Math.hypot(ap[0], ap[1], ap[2])
  const t = clamp((ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / abLenSq, 0, 1)
  const closest = [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t]
  return Math.hypot(p[0] - closest[0], p[1] - closest[1], p[2] - closest[2])
}

const createCheckpoints = (mode) => {
  const rng = seeded(mode.terrainSeed + 400)
  const checkpointCount = Math.max(6, Number(mode.checkpointCount || 7))
  return Array.from({ length: checkpointCount }, (_, index) => {
    const angle = (Math.PI * 2 * index) / checkpointCount
    const radius = mode.worldRadius * (0.52 + rng() * 0.22)
    return {
      id: `checkpoint-${index}`,
      position: [Math.cos(angle) * radius, 28 + rng() * (mode.maxHeight * 0.42), Math.sin(angle) * radius],
      radius: 12 + rng() * 4
    }
  })
}

const createPickups = (mode) => {
  const rng = seeded(mode.terrainSeed + 800)
  const pickupCount = Math.max(0, Number(mode.pickupCount || 0))
  if (!pickupCount) return []
  return Array.from({ length: pickupCount }, (_, index) => {
    const angle = (Math.PI * 2 * index) / pickupCount
    const radius = mode.worldRadius * (0.34 + rng() * 0.42)
    return {
      id: `pickup-${index}`,
      type: mode.objective === 'race' ? 'boost' : (index % 3 === 0 ? 'repair' : 'boost'),
      active: true,
      respawnAt: 0,
      position: [Math.cos(angle) * radius, 18 + rng() * 46, Math.sin(angle) * radius]
    }
  })
}

const createFeatures = (mode) => {
  const rng = seeded(mode.terrainSeed)
  const islands = Array.from({ length: Number(mode.islandCount || 18) }, (_, index) => {
    const angle = rng() * Math.PI * 2
    const radius = mode.worldRadius * (0.18 + rng() * 0.78)
    return {
      id: `island-${index}`,
      position: [Math.cos(angle) * radius, 2 + rng() * 18, Math.sin(angle) * radius],
      scale: [12 + rng() * 24, 4 + rng() * 9, 12 + rng() * 22],
      color: mode.objective === 'race'
        ? (index % 2 ? '#1d4ed8' : '#0f766e')
        : (index % 2 ? '#365314' : '#14532d')
    }
  })

  const towers = Array.from({ length: Number(mode.towerCount || 14) }, (_, index) => {
    const angle = rng() * Math.PI * 2
    const radius = mode.worldRadius * (0.12 + rng() * 0.76)
    return {
      id: `tower-${index}`,
      position: [Math.cos(angle) * radius, 10 + rng() * 26, Math.sin(angle) * radius],
      height: 18 + rng() * 32
    }
  })

  const clouds = Array.from({ length: Number(mode.cloudCount || 28) }, (_, index) => {
    const angle = rng() * Math.PI * 2
    const radius = mode.worldRadius * (0.08 + rng() * 0.86)
    return {
      id: `cloud-${index}`,
      position: [Math.cos(angle) * radius, 42 + rng() * 36, Math.sin(angle) * radius],
      scale: [8 + rng() * 12, 2 + rng() * 4, 6 + rng() * 10]
    }
  })

  return { islands, towers, clouds }
}

const buildSpawn = (mode, index, total, craftId = CRAFTS[0].id) => {
  const angle = (Math.PI * 2 * index) / Math.max(total, 4)
  const radius = mode.worldRadius * Number(mode.spawnRadiusFactor || (mode.objective === 'race' ? 0.14 : 0.2))
  const craft = getCraft(craftId)
  return {
    position: [Math.cos(angle) * radius, 28 + (index % 3) * 6, Math.sin(angle) * radius],
    rotation: [0, angle + Math.PI, 0],
    velocity: [0, 0, 0],
    throttle: 0.52,
    hp: craft.hp,
    boostUntil: 0,
    respawnAt: 0,
    laps: 0,
    checkpointIndex: 0,
    score: 0,
    deaths: 0,
    ready: false
  }
}

const createPlayer = (mode, id, username, color, craftId = CRAFTS[0].id, index = 0, total = 1) => ({
  id,
  username,
  color,
  craftId,
  ...buildSpawn(mode, index, total, craftId)
})

const normalizePlayer = (mode, payload = {}, index = 0, total = 1) => {
  const base = createPlayer(
    mode,
    String(payload.playerId || payload.id || `pilot-${index}`),
    String(payload.username || 'Pilot'),
    String(payload.color || TEAM_COLORS[index % TEAM_COLORS.length]),
    String(payload.craftId || CRAFTS[0].id),
    index,
    total
  )

  return {
    ...base,
    ...payload,
    id: String(payload.playerId || payload.id || base.id),
    position: Array.isArray(payload.position) ? payload.position.map((value) => Number(value || 0)) : base.position,
    rotation: Array.isArray(payload.rotation) ? payload.rotation.map((value) => Number(value || 0)) : base.rotation,
    velocity: Array.isArray(payload.velocity) ? payload.velocity.map((value) => Number(value || 0)) : base.velocity,
    throttle: clamp(Number(payload.throttle ?? base.throttle), 0.18, 1),
    hp: Number(payload.hp ?? base.hp),
    score: Number(payload.score || 0),
    deaths: Number(payload.deaths || 0),
    laps: Number(payload.laps || 0),
    checkpointIndex: Number(payload.checkpointIndex || 0),
    ready: !!payload.ready,
    boostUntil: Number(payload.boostUntil || 0),
    respawnAt: Number(payload.respawnAt || 0),
    craftId: String(payload.craftId || base.craftId)
  }
}

const Aircraft = React.memo(({ player, isLocal }) => {
  const craft = getCraft(player.craftId)
  return (
    <group position={player.position} rotation={player.rotation}>
      <mesh castShadow>
        <coneGeometry args={[0.95, 4.3, 12]} />
        <meshStandardMaterial color={player.color} emissive={player.color} emissiveIntensity={isLocal ? 0.28 : 0.14} metalness={0.36} roughness={0.32} />
      </mesh>
      <mesh position={[0, -0.18, -0.35]} castShadow>
        <boxGeometry args={[6.2, 0.16, 1.1]} />
        <meshStandardMaterial color="#e2e8f0" metalness={0.54} roughness={0.22} />
      </mesh>
      <mesh position={[0, 0.3, 1.7]} castShadow>
        <boxGeometry args={[0.3, 1.2, 1.1]} />
        <meshStandardMaterial color={craft.color} metalness={0.24} roughness={0.34} />
      </mesh>
      <mesh position={[0, 0.08, -1.75]} castShadow>
        <boxGeometry args={[0.55, 0.55, 0.8]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>
      <mesh position={[0, -0.12, 0.3]}>
        <sphereGeometry args={[0.42, 12, 12]} />
        <meshBasicMaterial color={craft.color} transparent opacity={0.42} />
      </mesh>
    </group>
  )
})

const ProjectileMesh = React.memo(({ projectile }) => (
  <group position={projectile.position}>
    <mesh>
      <sphereGeometry args={[0.24, 10, 10]} />
      <meshBasicMaterial color={projectile.color} />
    </mesh>
    <mesh position={[0, 0, -0.8]}>
      <boxGeometry args={[0.16, 0.16, 1.8]} />
      <meshBasicMaterial color={projectile.color} transparent opacity={0.38} />
    </mesh>
  </group>
))

const BurstMesh = React.memo(({ burst }) => {
  const life = clamp((Date.now() - burst.startedAt) / 820, 0, 1)
  return (
    <group position={burst.position}>
      {Array.from({ length: 10 }, (_, index) => {
        const angle = (Math.PI * 2 * index) / 10
        const distance = 0.4 + life * 3.8
        return (
          <mesh key={index} position={[Math.cos(angle) * distance, ((index % 3) - 1) * 0.4, Math.sin(angle) * distance]}>
            <sphereGeometry args={[0.24 * (1 - life * 0.7), 8, 8]} />
            <meshBasicMaterial color={burst.color} transparent opacity={1 - life} />
          </mesh>
        )
      })}
    </group>
  )
})

const PickupMesh = React.memo(({ pickup }) => {
  const color = pickup.type === 'repair' ? '#34d399' : '#facc15'
  return (
    <group position={pickup.position}>
      <mesh>
        <icosahedronGeometry args={[1.1, 0]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.34} metalness={0.25} roughness={0.18} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.4, 0]}>
        <ringGeometry args={[1.2, 1.9, 24]} />
        <meshBasicMaterial color={color} transparent opacity={0.42} />
      </mesh>
    </group>
  )
})

const CheckpointRing = React.memo(({ checkpoint, active }) => (
  <group position={checkpoint.position}>
    <mesh rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[checkpoint.radius, active ? 0.7 : 0.42, 16, 42]} />
      <meshStandardMaterial color={active ? '#facc15' : '#38bdf8'} emissive={active ? '#facc15' : '#38bdf8'} emissiveIntensity={active ? 0.36 : 0.14} transparent opacity={active ? 0.9 : 0.42} />
    </mesh>
  </group>
))

function FlightScene({ mode, players, projectiles, bursts, pickups, localPlayerId, checkpoints, features }) {
  const focusRef = useRef(new THREE.Vector3())
  const camPosRef = useRef(new THREE.Vector3())
  const localPlayer = players.find((player) => player.id === localPlayerId) || players[0]
  const cameraDistance = Number(mode.cameraDistance || 18)
  const cameraHeight = Number(mode.cameraHeight || 6.6)
  const cameraLerp = Number(mode.cameraLerp || 0.08)
  const starCount = Number(mode.starCount || 600)

  useFrame(({ camera }) => {
    if (!localPlayer) return
    const [x, y, z] = localPlayer.position
    const [, yaw] = localPlayer.rotation
    focusRef.current.set(x, y + 1.2, z)
    camPosRef.current.set(
      x - Math.sin(yaw) * cameraDistance,
      y + cameraHeight,
      z - Math.cos(yaw) * cameraDistance
    )
    camera.position.lerp(camPosRef.current, cameraLerp)
    camera.lookAt(focusRef.current)
  })

  const skyMaterial = useMemo(() => new THREE.Color(mode.sky[1]), [mode.sky])

  return (
    <>
      <color attach="background" args={[mode.sky[0]]} />
      <fog attach="fog" args={[mode.sky[1], 80, mode.fogFar]} />
      <ambientLight intensity={0.72} />
      <hemisphereLight args={[mode.sky[1], '#020617', 1.1]} />
      <directionalLight position={[24, 42, 18]} intensity={2.1} castShadow />
      <PerspectiveCamera makeDefault position={[0, 24, 42]} fov={Number(mode.fov || 62)} />
      <Stars radius={mode.worldRadius * 2} depth={80} count={starCount} factor={4} saturation={0} fade />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.6, 0]} receiveShadow>
        <circleGeometry args={[mode.worldRadius, 96]} />
        <meshStandardMaterial color={mode.groundColor || (mode.objective === 'race' ? '#0f766e' : '#14532d')} roughness={0.95} metalness={0.04} />
      </mesh>

      <mesh position={[0, -10, 0]}>
        <sphereGeometry args={[mode.worldRadius * 2.4, 24, 24]} />
        <meshBasicMaterial color={skyMaterial} transparent opacity={0.12} side={THREE.BackSide} />
      </mesh>

      {features.islands.map((island) => (
        <group key={island.id} position={island.position}>
          <mesh castShadow receiveShadow>
            <cylinderGeometry args={[island.scale[0], island.scale[2], island.scale[1], 18]} />
            <meshStandardMaterial color={island.color} roughness={0.92} />
          </mesh>
          <mesh position={[0, island.scale[1] * 0.45 + 1.4, 0]} castShadow>
            <cylinderGeometry args={[island.scale[0] * 0.82, island.scale[0] * 0.95, 2.4, 18]} />
            <meshStandardMaterial color="#4d7c0f" roughness={0.88} />
          </mesh>
        </group>
      ))}

      {features.towers.map((tower) => (
        <mesh key={tower.id} position={tower.position} castShadow receiveShadow>
          <cylinderGeometry args={[2.6, 4.4, tower.height, 12]} />
          <meshStandardMaterial color="#64748b" roughness={0.72} metalness={0.22} />
        </mesh>
      ))}

      {features.clouds.map((cloud) => (
        <group key={cloud.id} position={cloud.position}>
          <mesh>
            <sphereGeometry args={[cloud.scale[0], 12, 12]} />
            <meshBasicMaterial color="#f8fafc" transparent opacity={0.08} />
          </mesh>
          <mesh position={[cloud.scale[0] * 0.55, 0.4, 0]}>
            <sphereGeometry args={[cloud.scale[2], 12, 12]} />
            <meshBasicMaterial color="#f8fafc" transparent opacity={0.08} />
          </mesh>
        </group>
      ))}

      {checkpoints.map((checkpoint) => (
        <CheckpointRing
          key={checkpoint.id}
          checkpoint={checkpoint}
          active={mode.objective === 'race' && localPlayer?.checkpointIndex % checkpoints.length === checkpoints.indexOf(checkpoint)}
        />
      ))}

      {pickups.filter((pickup) => pickup.active).map((pickup) => <PickupMesh key={pickup.id} pickup={pickup} />)}
      {players.filter((player) => Date.now() >= player.respawnAt).map((player) => <Aircraft key={player.id} player={player} isLocal={player.id === localPlayerId} />)}
      {projectiles.map((projectile) => <ProjectileMesh key={projectile.id} projectile={projectile} />)}
      {bursts.map((burst) => <BurstMesh key={burst.id} burst={burst} />)}
    </>
  )
}

const SkyRaiderActivity = ({ sdk, currentUser, session, activityDefinition }) => {
  const mode = useMemo(() => getFlightActivityMode(activityDefinition?.id), [activityDefinition?.id])
  const lapTarget = Number(mode.lapTarget || LAP_TARGET)
  const scoreTarget = Number(mode.scoreTarget || SCORE_TARGET)
  const features = useMemo(() => createFeatures(mode), [mode])
  const checkpoints = useMemo(() => createCheckpoints(mode), [mode])
  const [pickups, setPickups] = useState(() => createPickups(mode))
  const userId = currentUser?.id || `guest-${Math.random().toString(36).slice(2, 9)}`
  const username = currentUser?.username || currentUser?.displayName || 'Pilot'
  const hostId = session?.hostId || session?.ownerId || session?.createdBy || userId
  const isHost = hostId === userId
  const playerColor = useMemo(() => TEAM_COLORS[Math.abs(userId.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0)) % TEAM_COLORS.length], [userId])
  const [selectedCraft, setSelectedCraft] = useState(CRAFTS[0].id)
  const [players, setPlayers] = useState(() => [createPlayer(mode, userId, username, playerColor, CRAFTS[0].id, 0, 1)])
  const [projectiles, setProjectiles] = useState([])
  const [bursts, setBursts] = useState([])
  const [phase, setPhase] = useState('lobby')
  const [status, setStatus] = useState(`Configure your craft for ${mode.title}.`)
  const [countdownEndsAt, setCountdownEndsAt] = useState(0)
  const [winnerId, setWinnerId] = useState(null)
  const keysRef = useRef(new Set())
  const fireCooldownRef = useRef(0)
  const lastSyncRef = useRef(0)
  const playersRef = useRef(players)
  const pickupsRef = useRef(pickups)
  const phaseRef = useRef(phase)
  const audioRef = useRef(createFlightActivityAudio())

  useEffect(() => { playersRef.current = players }, [players])
  useEffect(() => { pickupsRef.current = pickups }, [pickups])
  useEffect(() => { phaseRef.current = phase }, [phase])
  useEffect(() => () => {
    audioRef.current?.dispose?.()
  }, [])

  useEffect(() => {
    setPickups(createPickups(mode))
    setPlayers([createPlayer(mode, userId, username, playerColor, selectedCraft, 0, 1)])
    setProjectiles([])
    setBursts([])
    setPhase('lobby')
    setStatus(`Configure your craft for ${mode.title}.`)
    setCountdownEndsAt(0)
    setWinnerId(null)
  }, [mode, playerColor, selectedCraft, userId, username])

  const sendEvent = useCallback((eventType, payload = {}) => {
    sdk?.emitEvent?.(eventType, payload, { serverRelay: true })
  }, [sdk])

  const updatePlayer = useCallback((playerId, updater) => {
    setPlayers((current) => current.map((player) => {
      if (player.id !== playerId) return player
      return typeof updater === 'function' ? updater(player) : { ...player, ...updater }
    }))
  }, [])

  const mergeRemotePlayer = useCallback((payload) => {
    setPlayers((current) => {
      const nextPlayer = normalizePlayer(mode, payload, current.length, Math.max(current.length, 1))
      const index = current.findIndex((entry) => entry.id === nextPlayer.id)
      if (index >= 0) {
        return current.map((entry) => (entry.id === nextPlayer.id ? { ...entry, ...nextPlayer } : entry))
      }
      return [...current, nextPlayer]
    })
  }, [mode])

  const publishPresence = useCallback((targetId = null) => {
    const me = playersRef.current.find((entry) => entry.id === userId)
    if (!me) return
    sendEvent('skyarena:presence', {
      targetId,
      playerId: me.id,
      username: me.username,
      color: me.color,
      craftId: me.craftId,
      ready: me.ready,
      hp: me.hp,
      score: me.score,
      deaths: me.deaths,
      laps: me.laps,
      checkpointIndex: me.checkpointIndex,
      throttle: me.throttle,
      boostUntil: me.boostUntil,
      respawnAt: me.respawnAt,
      position: me.position,
      rotation: me.rotation,
      velocity: me.velocity
    })
  }, [sendEvent, userId])

  const sendSnapshot = useCallback((targetId) => {
    if (!isHost) return
    sendEvent('skyarena:snapshot', {
      targetId,
      phase: phaseRef.current,
      countdownEndsAt,
      winnerId,
      status,
      pickups: pickupsRef.current,
      players: playersRef.current
    })
  }, [countdownEndsAt, isHost, sendEvent, status, winnerId])

  useEffect(() => {
    if (!sdk) return undefined

    const handleEvent = (evt = {}) => {
      if (!String(evt.eventType || '').startsWith('skyarena:')) return
      const payload = evt.payload || {}

      if (payload.targetId && payload.targetId !== userId) return

      switch (evt.eventType) {
        case 'skyarena:join':
          mergeRemotePlayer(payload)
          publishPresence(payload.playerId)
          sendSnapshot(payload.playerId)
          break
        case 'skyarena:presence':
          if (payload.playerId !== userId) mergeRemotePlayer(payload)
          break
        case 'skyarena:leave':
          setPlayers((current) => current.filter((player) => player.id !== payload.playerId))
          break
        case 'skyarena:snapshot':
          if (Array.isArray(payload.players)) {
            setPlayers(payload.players.map((player, index) => normalizePlayer(mode, player, index, payload.players.length)))
          }
          if (Array.isArray(payload.pickups)) {
            setPickups(payload.pickups)
          }
          setPhase(String(payload.phase || 'lobby'))
          setCountdownEndsAt(Number(payload.countdownEndsAt || 0))
          setWinnerId(payload.winnerId || null)
          if (payload.status) setStatus(String(payload.status))
          break
        case 'skyarena:ready':
          updatePlayer(payload.playerId, (player) => ({ ...player, ready: !!payload.ready }))
          break
        case 'skyarena:craft':
          updatePlayer(payload.playerId, (player) => ({ ...player, craftId: String(payload.craftId || player.craftId), ready: false }))
          break
        case 'skyarena:phase':
          if (Array.isArray(payload.players)) {
            setPlayers(payload.players.map((player, index) => normalizePlayer(mode, player, index, payload.players.length)))
          }
          if (Array.isArray(payload.pickups)) setPickups(payload.pickups)
          setPhase(String(payload.phase || 'lobby'))
          setCountdownEndsAt(Number(payload.countdownEndsAt || 0))
          setWinnerId(payload.winnerId || null)
          if (payload.status) setStatus(String(payload.status))
          break
        case 'skyarena:state':
          if (payload.playerId !== userId) mergeRemotePlayer(payload)
          break
        case 'skyarena:fire':
          setProjectiles((current) => [...current, {
            id: payload.projectileId,
            ownerId: payload.playerId,
            color: payload.color || '#f8fafc',
            damage: Number(payload.damage || 24),
            position: payload.position || [0, 0, 0],
            prevPosition: payload.position || [0, 0, 0],
            velocity: payload.velocity || [0, 0, 0],
            startedAt: Number(payload.startedAt || Date.now())
          }])
          break
        case 'skyarena:impact':
          setBursts((current) => [...current, { id: makeId('burst'), position: payload.position || [0, 0, 0], color: payload.color || '#f97316', startedAt: Date.now() }])
          setPlayers((current) => current.map((player) => {
            if (player.id === payload.targetId) {
              const nextHp = Math.max(0, Number(payload.hp ?? player.hp))
              return {
                ...player,
                hp: nextHp,
                respawnAt: nextHp <= 0 ? Number(payload.respawnAt || Date.now() + RESPAWN_MS) : player.respawnAt,
                deaths: nextHp <= 0 ? Number(payload.deaths ?? (player.deaths + 1)) : player.deaths
              }
            }
            if (player.id === payload.playerId) {
              return { ...player, score: Number(payload.score ?? player.score) }
            }
            return player
          }))
          setStatus(payload.destroyed ? 'Target destroyed.' : 'Hit confirmed.')
          audioRef.current.impact()
          break
        case 'skyarena:pickup':
          setPickups((current) => current.map((pickup) => (
            pickup.id === payload.pickupId ? { ...pickup, active: false, respawnAt: Number(payload.respawnAt || Date.now() + PICKUP_RESPAWN_MS) } : pickup
          )))
          setPlayers((current) => current.map((player) => {
            if (player.id !== payload.playerId) return player
            if (payload.pickupType === 'repair') return { ...player, hp: Math.min(getCraft(player.craftId).hp, player.hp + 32) }
            return { ...player, boostUntil: Date.now() + 5000 }
          }))
          setStatus(payload.pickupType === 'repair' ? 'Repair kit secured.' : 'Boost canister collected.')
          audioRef.current.boost()
          break
        case 'skyarena:respawn':
          updatePlayer(payload.playerId, (player) => ({
            ...player,
            position: payload.position || player.position,
            rotation: payload.rotation || player.rotation,
            velocity: [0, 0, 0],
            hp: getCraft(player.craftId).hp,
            boostUntil: 0,
            respawnAt: 0
          }))
          break
        case 'skyarena:checkpoint':
          updatePlayer(payload.playerId, (player) => ({
            ...player,
            checkpointIndex: Number(payload.checkpointIndex || player.checkpointIndex),
            laps: Number(payload.laps || player.laps)
          }))
          if (payload.playerId === userId) audioRef.current.checkpoint()
          break
        default:
          break
      }
    }

    const off = sdk.on?.('event', handleEvent)
    sendEvent('skyarena:join', {
      playerId: userId,
      username,
      color: playerColor,
      craftId: selectedCraft,
      ready: false
    })
    publishPresence()
    return () => {
      sendEvent('skyarena:leave', { playerId: userId })
      off?.()
    }
  }, [mergeRemotePlayer, mode, playerColor, publishPresence, sdk, selectedCraft, sendEvent, sendSnapshot, updatePlayer, userId, username])

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
    const interval = window.setInterval(() => {
      const remaining = Math.ceil((countdownEndsAt - Date.now()) / 1000)
      if (remaining > 0 && remaining !== lastSecond) {
        lastSecond = remaining
        audioRef.current.countdown(remaining)
      }
      if (Date.now() >= countdownEndsAt) {
        if (isHost) {
          sendEvent('skyarena:phase', {
            phase: 'live',
            status: mode.objective === 'race'
              ? `Race live. Hit every checkpoint and finish ${lapTarget} laps.`
              : `Weapons hot. First pilot to ${scoreTarget} eliminations wins.`
          })
        }
        window.clearInterval(interval)
      }
    }, 120)
    return () => window.clearInterval(interval)
  }, [countdownEndsAt, isHost, lapTarget, mode.objective, phase, scoreTarget, sendEvent])

  useEffect(() => {
    const interval = window.setInterval(() => {
      const now = Date.now()
      setPickups((current) => current.map((pickup) => (
        !pickup.active && pickup.respawnAt && now >= pickup.respawnAt
          ? { ...pickup, active: true, respawnAt: 0 }
          : pickup
      )))

      setBursts((current) => current.filter((burst) => now - burst.startedAt < 860))
      setProjectiles((current) => current
        .map((projectile) => {
          const dt = 0.05
          const nextVelocity = [
            projectile.velocity[0] * PROJECTILE_DRAG,
            (projectile.velocity[1] - PROJECTILE_GRAVITY * dt) * PROJECTILE_DRAG,
            projectile.velocity[2] * PROJECTILE_DRAG
          ]
          return {
            ...projectile,
            prevPosition: projectile.position,
            position: [
              projectile.position[0] + nextVelocity[0] * dt,
              projectile.position[1] + nextVelocity[1] * dt,
              projectile.position[2] + nextVelocity[2] * dt
            ],
            velocity: nextVelocity
          }
        })
        .filter((projectile) => {
          const age = now - projectile.startedAt
          const radial = Math.hypot(projectile.position[0], projectile.position[2])
          return age < PROJECTILE_LIFETIME_MS && projectile.position[1] > 0 && radial < mode.worldRadius * 1.2
        }))
    }, 50)

    return () => window.clearInterval(interval)
  }, [mode.worldRadius])

  useEffect(() => {
    if (phase !== 'live') return undefined
    const interval = window.setInterval(() => {
      const now = Date.now()
      setPlayers((current) => current.map((player, index) => {
        if (player.id !== userId) return player
        if (player.respawnAt && now < player.respawnAt) return player

        const craft = getCraft(player.craftId)
        const pitchInput = keysRef.current.has('arrowup') ? 1 : keysRef.current.has('arrowdown') ? -1 : 0
        const yawInput = keysRef.current.has('a') ? 1 : keysRef.current.has('d') ? -1 : 0
        const throttleInput = keysRef.current.has('w') ? 1 : keysRef.current.has('s') ? -1 : 0
        const boost = player.boostUntil > now ? 1.45 : 1
        const nextThrottle = clamp(player.throttle + throttleInput * craft.accel * 0.014, 0.18, 1)
        const yaw = player.rotation[1] - yawInput * craft.turn * 0.032
        const pitch = clamp(player.rotation[0] + pitchInput * craft.climb * 0.018, -0.72, 0.72)
        const direction = getForwardVector(pitch, yaw)
        const speed = (craft.speed * (0.34 + nextThrottle * 0.66) * boost) / 60
        const nextVelocity = [
          direction[0] * speed,
          direction[1] * speed * 0.68,
          direction[2] * speed
        ]
        let nextPosition = [
          player.position[0] + nextVelocity[0],
          clamp(player.position[1] + nextVelocity[1], 8, mode.maxHeight),
          player.position[2] + nextVelocity[2]
        ]

        const radial = Math.hypot(nextPosition[0], nextPosition[2])
        if (radial > mode.worldRadius) {
          const scale = mode.worldRadius / radial
          nextPosition = [nextPosition[0] * scale, nextPosition[1], nextPosition[2] * scale]
        }

        const nextPlayer = {
          ...player,
          throttle: nextThrottle,
          rotation: [pitch, yaw, 0],
          velocity: nextVelocity,
          position: nextPosition
        }

        const currentCheckpoint = checkpoints[nextPlayer.checkpointIndex % checkpoints.length]
        if (mode.objective === 'race' && currentCheckpoint) {
          const checkpointDistance = Math.hypot(
            nextPlayer.position[0] - currentCheckpoint.position[0],
            nextPlayer.position[1] - currentCheckpoint.position[1],
            nextPlayer.position[2] - currentCheckpoint.position[2]
          )
          if (checkpointDistance <= currentCheckpoint.radius + 3) {
            const nextCheckpointIndex = nextPlayer.checkpointIndex + 1
            const nextLaps = nextCheckpointIndex > 0 && nextCheckpointIndex % checkpoints.length === 0 ? nextPlayer.laps + 1 : nextPlayer.laps
            nextPlayer.checkpointIndex = nextCheckpointIndex
            nextPlayer.laps = nextLaps
            sendEvent('skyarena:checkpoint', { playerId: nextPlayer.id, checkpointIndex: nextCheckpointIndex, laps: nextLaps })
            setStatus(nextLaps >= lapTarget ? 'Final gate cleared.' : `Checkpoint ${((nextCheckpointIndex - 1) % checkpoints.length) + 1}/${checkpoints.length}`)
            if (nextLaps >= lapTarget) {
              sendEvent('skyarena:phase', {
                phase: 'finished',
                winnerId: nextPlayer.id,
                status: `${nextPlayer.username} wins ${mode.title}.`
              })
            }
          }
        }

        for (const pickup of pickupsRef.current) {
          if (!pickup.active) continue
          const distance = Math.hypot(
            nextPlayer.position[0] - pickup.position[0],
            nextPlayer.position[1] - pickup.position[1],
            nextPlayer.position[2] - pickup.position[2]
          )
          if (distance <= 4.8) {
            sendEvent('skyarena:pickup', {
              playerId: nextPlayer.id,
              pickupId: pickup.id,
              pickupType: pickup.type,
              respawnAt: Date.now() + PICKUP_RESPAWN_MS
            })
          }
        }

        if (Date.now() - lastSyncRef.current > PLAYER_SYNC_MS) {
          lastSyncRef.current = Date.now()
          sendEvent('skyarena:state', {
            playerId: nextPlayer.id,
            username: nextPlayer.username,
            color: nextPlayer.color,
            craftId: nextPlayer.craftId,
            ready: nextPlayer.ready,
            hp: nextPlayer.hp,
            score: nextPlayer.score,
            deaths: nextPlayer.deaths,
            laps: nextPlayer.laps,
            checkpointIndex: nextPlayer.checkpointIndex,
            throttle: nextPlayer.throttle,
            boostUntil: nextPlayer.boostUntil,
            respawnAt: nextPlayer.respawnAt,
            position: nextPlayer.position,
            rotation: nextPlayer.rotation,
            velocity: nextPlayer.velocity
          })
        }

        if (keysRef.current.has(' ') && Date.now() > fireCooldownRef.current) {
          fireCooldownRef.current = Date.now() + craft.cooldown
          const directionVec = getForwardVector(nextPlayer.rotation[0], nextPlayer.rotation[1])
          const projectileVelocity = directionVec.map((value, axis) => value * craft.projectileSpeed + nextPlayer.velocity[axis] * 24)
          const projectilePosition = [
            nextPlayer.position[0] + directionVec[0] * 4,
            nextPlayer.position[1] + directionVec[1] * 2,
            nextPlayer.position[2] + directionVec[2] * 4
          ]
          const projectileId = makeId('shot')
          setProjectiles((currentProjectiles) => [...currentProjectiles, {
            id: projectileId,
            ownerId: nextPlayer.id,
            color: nextPlayer.color,
            damage: craft.damage,
            position: projectilePosition,
            prevPosition: projectilePosition,
            velocity: projectileVelocity,
            startedAt: Date.now()
          }])
          sendEvent('skyarena:fire', {
            projectileId,
            playerId: nextPlayer.id,
            color: nextPlayer.color,
            damage: craft.damage,
            position: projectilePosition,
            velocity: projectileVelocity,
            startedAt: Date.now()
          })
          audioRef.current.fire(nextPlayer.craftId)
        }

        return nextPlayer
      }))

      setProjectiles((currentProjectiles) => currentProjectiles.filter((projectile) => {
        if (projectile.ownerId !== userId) return true
        const target = playersRef.current.find((player) => {
          if (player.id === userId || player.respawnAt > now) return false
          return distanceSegmentToPoint(projectile.prevPosition, projectile.position, player.position) <= 3.6
        })
        if (!target) return true

        const updatedTargetHp = Math.max(0, target.hp - projectile.damage)
        const me = playersRef.current.find((entry) => entry.id === userId)
        const updatedScore = (me?.score || 0) + (updatedTargetHp <= 0 ? 1 : 0)
        sendEvent('skyarena:impact', {
          projectileId: projectile.id,
          playerId: userId,
          targetId: target.id,
          score: updatedScore,
          hp: updatedTargetHp,
          deaths: updatedTargetHp <= 0 ? target.deaths + 1 : target.deaths,
          respawnAt: updatedTargetHp <= 0 ? Date.now() + RESPAWN_MS : target.respawnAt,
          destroyed: updatedTargetHp <= 0,
          color: projectile.color,
          position: projectile.position
        })
        if (mode.objective === 'combat' && updatedScore >= scoreTarget) {
          sendEvent('skyarena:phase', {
            phase: 'finished',
            winnerId: userId,
            status: `${username} wins ${mode.title}.`
          })
        }
        return false
      }))

      setPlayers((current) => current.map((player, index) => {
        if (player.id !== userId || !player.respawnAt || now < player.respawnAt) return player
        const spawn = buildSpawn(mode, index, current.length, player.craftId)
        sendEvent('skyarena:respawn', {
          playerId: player.id,
          position: spawn.position,
          rotation: spawn.rotation
        })
        return {
          ...player,
          ...spawn,
          ready: player.ready,
          craftId: player.craftId,
          score: player.score,
          deaths: player.deaths
        }
      }))
    }, 16)

    return () => window.clearInterval(interval)
  }, [checkpoints, lapTarget, mode, phase, scoreTarget, sendEvent, updatePlayer, userId, username])

  useEffect(() => {
    if (phase === 'finished' && winnerId === userId) {
      audioRef.current.victory()
    }
  }, [phase, userId, winnerId])

  const me = players.find((player) => player.id === userId) || players[0]
  const activePlayers = players.filter((player) => player.id)
  const allReady = activePlayers.length >= (mode.objective === 'race' ? 2 : 1) && activePlayers.every((player) => player.ready)
  const leaderboard = [...activePlayers].sort((a, b) => {
    if (mode.objective === 'race') {
      if (b.laps !== a.laps) return b.laps - a.laps
      return b.checkpointIndex - a.checkpointIndex
    }
    if (b.score !== a.score) return b.score - a.score
    return a.deaths - b.deaths
  })

  const handleCraftSelect = useCallback((craftId) => {
    setSelectedCraft(craftId)
    updatePlayer(userId, (player) => {
      const craft = getCraft(craftId)
      return { ...player, craftId, hp: craft.hp, ready: false }
    })
    sendEvent('skyarena:craft', { playerId: userId, craftId })
    sendEvent('skyarena:ready', { playerId: userId, ready: false })
    setStatus(`Selected ${getCraft(craftId).name}.`)
  }, [sendEvent, updatePlayer, userId])

  const handleReadyToggle = useCallback(() => {
    const nextReady = !me?.ready
    updatePlayer(userId, (player) => ({ ...player, ready: nextReady }))
    sendEvent('skyarena:ready', { playerId: userId, ready: nextReady })
    audioRef.current.ready()
  }, [me?.ready, sendEvent, updatePlayer, userId])

  const handleLaunch = useCallback(() => {
    if (!isHost || !allReady) return
    const resetPlayers = playersRef.current.map((player, index, arr) => {
      const spawn = buildSpawn(mode, index, arr.length, player.craftId)
      return {
        ...player,
        ...spawn,
        ready: false,
        score: 0,
        deaths: 0,
        laps: 0,
        checkpointIndex: 0
      }
    })
    const freshPickups = createPickups(mode)
    sendEvent('skyarena:phase', {
      phase: 'countdown',
      countdownEndsAt: Date.now() + COUNTDOWN_MS,
      winnerId: null,
      status: mode.objective === 'race' ? 'Line up for launch.' : 'Squadron launching in three.',
      players: resetPlayers,
      pickups: freshPickups
    })
    setPlayers(resetPlayers)
    setPickups(freshPickups)
    setCountdownEndsAt(Date.now() + COUNTDOWN_MS)
    setWinnerId(null)
    setProjectiles([])
    setBursts([])
  }, [allReady, isHost, mode, sendEvent])

  const handleResetToLobby = useCallback(() => {
    if (!isHost) return
    const lobbyPlayers = playersRef.current.map((player, index, arr) => ({
      ...player,
      ...buildSpawn(mode, index, arr.length, player.craftId),
      ready: false
    }))
    sendEvent('skyarena:phase', {
      phase: 'lobby',
      status: `Configure your craft for ${mode.title}.`,
      players: lobbyPlayers,
      pickups: createPickups(mode),
      winnerId: null
    })
    setPlayers(lobbyPlayers)
    setPickups(createPickups(mode))
    setProjectiles([])
    setBursts([])
    setWinnerId(null)
    setStatus(`Configure your craft for ${mode.title}.`)
  }, [isHost, mode, sendEvent])

  const countdown = phase === 'countdown' ? Math.max(0, Math.ceil((countdownEndsAt - Date.now()) / 1000)) : 0

  return (
    <GameCanvasShell
      title="Sky Raid"
      subtitle={mode.title}
      status={mode.description}
      skin="sport"
      musicEnabled={false}
      header={false}
      layout="stretch"
      contentPointerEvents="none"
      backgroundNode={(
        <Canvas shadows gl={{ antialias: true, powerPreference: 'high-performance' }} style={{ position: 'absolute', inset: 0 }}>
          <FlightScene
            mode={mode}
            players={players}
            projectiles={projectiles}
            bursts={bursts}
            pickups={pickups}
            localPlayerId={userId}
            checkpoints={checkpoints}
            features={features}
          />
        </Canvas>
      )}
    >
      <div style={{ pointerEvents: 'auto' }}>
        <FlightActivityHud
          mode={mode}
          status={status}
          leaderboard={leaderboard}
          userId={userId}
          phase={phase}
          me={me || players[0] || { craftId: selectedCraft, hp: getCraft(selectedCraft).hp, throttle: 0, laps: 0, score: 0, deaths: 0, ready: false }}
          crafts={CRAFTS}
          selectedCraft={selectedCraft}
          onCraftSelect={handleCraftSelect}
          isHost={isHost}
          allReady={allReady}
          onReadyToggle={handleReadyToggle}
          onLaunch={handleLaunch}
          onResetToLobby={handleResetToLobby}
          winnerName={winnerId ? players.find((player) => player.id === winnerId)?.username || 'Unknown Pilot' : null}
          countdown={countdown}
          lapTarget={lapTarget}
          scoreTarget={scoreTarget}
        />
      </div>
    </GameCanvasShell>
  )
}

export default SkyRaiderActivity
