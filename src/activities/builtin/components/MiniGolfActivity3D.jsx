/**
 * MiniGolfActivity3D.jsx  –  3D scene + HTML HUD (VoltCraft pattern)
 *
 * UI architecture (mirrors VoltCraft exactly):
 *  • Canvas contains ONLY Three.js scene objects – zero HTML elements inside
 *  • HUD is a separate React component rendered as a sibling to <Canvas>
 *  • HUD uses createPortal(hud, containerRef.current) to overlay the canvas
 *  • containerRef is attached to the outer wrapper <div>
 *
 * Improvements:
 *  • Slower, smoother ball playback (PLAYBACK_SPEED = 2.5)
 *  • Smooth per-frame ball position lerp between known positions
 *  • Nametags above each ball using drei <Text>
 *  • Camera auto-follows active player's ball when turn changes
 *  • Left-click drag = aim direction + power; right/middle = orbit camera
 *  • Ball scale matches DEFAULT_BALL_RADIUS (0.34 units)
 *  • Color picker in lobby + holdable left-click to aim before game starts
 *  • Proper course proportions (ground matches bounds)
 */
import React, {
  useCallback, useEffect, useMemo, useRef, useState, Suspense
} from 'react'
import { createPortal } from 'react-dom'
import { Canvas, useFrame } from '@react-three/fiber'
import { Line, OrbitControls, PerspectiveCamera, Text } from '@react-three/drei'
import * as THREE from 'three'

import { getMiniGolfCourse, getMiniGolfHole, listMiniGolfCourseSummaries } from './minigolf/courses'
import {
  createInitialMiniGolfState,
  applyMiniGolfEvent,
  getMiniGolfLeaderboard,
  buildMiniGolfEventId,
  rememberMiniGolfEvent,
  resolveMiniGolfCourseId
} from './minigolf/state'
import { MINIGOLF_PHASES, MINIGOLF_EVENT_TYPES, PLAYER_COLORS, BALL_COLOR_OPTIONS } from './minigolf/constants'
import { DEFAULT_BALL_RADIUS } from './minigolf/constants'
import { buildAimLinePoints, getSurfaceColor, getHazardColor, toVector3 } from './minigolf/scene-utils'
import { sampleMovingHazardPosition, simulateShot } from './minigolf/physics'
import { createMiniGolfPhysicsWorld } from './minigolf/cannonPhysics'

// ─── WebGL Error Boundary ─────────────────────────────────────────────────────
class WebGLErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', height: '100%', background: '#0d1117',
          color: '#f9fafb', fontFamily: 'monospace', gap: 12, padding: 24
        }}>
          <div style={{ fontSize: 32 }}>⛳</div>
          <div style={{ fontSize: 18, fontWeight: 'bold' }}>MiniGolf 3D</div>
          <div style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', maxWidth: 320 }}>
            WebGL is not available in this browser or the context was lost.
            Try refreshing or using a different browser.
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{ padding: '8px 20px', background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
          >
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// ─── Shared geometry pool ─────────────────────────────────────────────────────
const BOX_GEO      = new THREE.BoxGeometry(1, 1, 1)
const SPHERE_GEO   = new THREE.SphereGeometry(1, 24, 24)
const RING_GEO     = new THREE.RingGeometry(0.28, 0.5, 28)
const CYLINDER_GEO = new THREE.CylinderGeometry(0.06, 0.06, 3.2, 12)
const TORUS_GEO    = new THREE.TorusGeometry(0.74, 0.1, 12, 32)

// Ball radius in world units (matches physics collision)
const BALL_R = DEFAULT_BALL_RADIUS  // 0.34 – physics collision radius

// Visual render radius – slightly smaller than physics radius so the ball
// looks proportionate on a ~40-unit wide course (real golf ball ≈ 1.1% of course width)
// 0.22 / 40 ≈ 1.1% which matches real minigolf proportions
const BALL_VISUAL_R = 0.22

// ─── Ball texture cache ───────────────────────────────────────────────────────
const ballTextureCache = new Map()
const getBallTexture = (accentColor = '#ffffff') => {
  if (ballTextureCache.has(accentColor)) return ballTextureCache.get(accentColor)
  const canvas = document.createElement('canvas')
  canvas.width = 128; canvas.height = 128
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fcfdff'; ctx.fillRect(0, 0, 128, 128)
  ctx.fillStyle = accentColor; ctx.fillRect(0, 46, 128, 36)
  ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 4
  ctx.beginPath(); ctx.moveTo(0, 46); ctx.lineTo(128, 46)
  ctx.moveTo(0, 82); ctx.lineTo(128, 82); ctx.stroke()
  const tex = new THREE.CanvasTexture(canvas)
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.generateMipmaps = true
  ballTextureCache.set(accentColor, tex)
  return tex
}

// ─── Moving hazards ───────────────────────────────────────────────────────────
const MovingHazards = React.memo(({ hazards = [], palette }) => {
  const refs = useRef([])
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    refs.current.forEach((mesh, i) => {
      if (!mesh || !hazards[i]) return
      const pos = sampleMovingHazardPosition(hazards[i], t)
      mesh.position.set(pos.x, 0.85, pos.z)
      mesh.rotation.y += 0.02
    })
  })
  const mat = useMemo(() => new THREE.MeshStandardMaterial({
    color: palette?.accent || '#ff8b5c',
    emissive: palette?.accent || '#ff8b5c',
    emissiveIntensity: 0.35,
    roughness: 0.4, metalness: 0.3
  }), [palette?.accent])

  return hazards.map((h, i) => (
    <mesh
      key={h.id}
      ref={el => { refs.current[i] = el }}
      position={[h.position.x, 0.85, h.position.z]}
      castShadow
      geometry={BOX_GEO}
      material={mat}
      scale={[h.size.x, 1.1, h.size.z]}
    />
  ))
})

// ─── Obstacle mesh ────────────────────────────────────────────────────────────
const ObstacleMesh = React.memo(({ obstacle, palette }) => {
  const w = Number(obstacle?.size?.x || 1)
  const d = Number(obstacle?.size?.z || 1)
  const h = Number(obstacle?.height || 1.4)
  const wallMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: palette?.wall || '#e2edf9', roughness: 0.52, metalness: 0.18
  }), [palette?.wall])
  const accentMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: palette?.accent || '#ff8b5c',
    emissive: palette?.accent || '#ff8b5c',
    emissiveIntensity: 0.1
  }), [palette?.accent])

  if (obstacle?.variant === 'bumper-post') {
    return (
      <group position={[obstacle.position.x, h * 0.5, obstacle.position.z]}>
        <mesh castShadow receiveShadow>
          <cylinderGeometry args={[0.55, 0.72, h, 20]} />
          <primitive object={accentMat} attach="material" />
        </mesh>
        <mesh position={[0, h * 0.34, 0]}>
          <primitive object={TORUS_GEO} attach="geometry" />
          <meshStandardMaterial color="#fff7ed" />
        </mesh>
      </group>
    )
  }

  return (
    <group position={[obstacle.position.x, h * 0.5, obstacle.position.z]}>
      <mesh castShadow receiveShadow scale={[w, h, d]}>
        <primitive object={BOX_GEO} attach="geometry" />
        <primitive object={wallMat} attach="material" />
      </mesh>
      <mesh position={[0, h * 0.46, 0]} castShadow scale={[w * 1.04, 0.14, d * 1.04]}>
        <primitive object={BOX_GEO} attach="geometry" />
        <primitive object={accentMat} attach="material" />
      </mesh>
    </group>
  )
})

// ─── Hazard pads ──────────────────────────────────────────────────────────────
const HazardPads = React.memo(({ hazards = [], palette }) => {
  return hazards.map(h => {
    const color = getHazardColor(h.type, palette)
    return (
      <group key={h.id} position={[h.position.x, 0.04, h.position.z]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[h.size.x, h.size.z]} />
          <meshBasicMaterial color={color} transparent opacity={h.type === 'void' ? 0.88 : 0.64} />
        </mesh>
      </group>
    )
  })
})

// ─── Surfaces ─────────────────────────────────────────────────────────────────
const SurfaceLayer = React.memo(({ surfaces = [], palette }) => {
  return surfaces.map(s => (
    <group key={s.id} position={toVector3(s.position, 0.02)}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[s.size.x, s.size.z]} />
        <meshStandardMaterial
          color={getSurfaceColor(s.type, palette)}
          roughness={s.type === 'ice' ? 0.16 : 0.82}
          metalness={s.type === 'ice' ? 0.18 : 0.05}
        />
      </mesh>
    </group>
  ))
})

// ─── Cup ──────────────────────────────────────────────────────────────────────
const Cup = React.memo(({ cup, palette }) => {
  const accentMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: palette?.accent || '#ff8b5c',
    emissive: palette?.accent || '#ff8b5c',
    emissiveIntensity: 0.25
  }), [palette?.accent])

  return (
    <group position={[cup.x, 0.05, cup.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <primitive object={RING_GEO} attach="geometry" />
        <primitive object={accentMat} attach="material" />
      </mesh>
      {/* Flag pole */}
      <mesh position={[0, 1.65, 0]}>
        <primitive object={CYLINDER_GEO} attach="geometry" />
        <meshStandardMaterial color="#f4f4f5" />
      </mesh>
      {/* Flag */}
      <mesh position={[0.54, 2.2, 0]}>
        <boxGeometry args={[1, 0.5, 0.05]} />
        <primitive object={accentMat} attach="material" />
      </mesh>
    </group>
  )
})

// ─── Single player ball with nametag + smooth lerp ────────────────────────────
// smoothPosRef: { x, z } – updated each frame by PlaybackController or lerp
const PlayerBall = React.memo(({ player, isActive, targetPosition, isPlayback, playbackRef }) => {
  const groupRef = useRef()
  const smoothPos = useRef({ x: targetPosition?.x || 0, z: targetPosition?.z || 0 })
  const tex = useMemo(() => getBallTexture(player.color || '#ffffff'), [player.color])

  useFrame((_, delta) => {
    if (!groupRef.current) return
    const livePlaybackTarget = isPlayback && playbackRef?.current?.playerId === player.id
      ? playbackRef.current.position
      : null
    const target = livePlaybackTarget || targetPosition || { x: 0, z: 0 }
    // Smooth lerp – faster during playback, slower for idle repositioning
    const lerpSpeed = isPlayback ? 18 : 6
    smoothPos.current.x += (target.x - smoothPos.current.x) * Math.min(1, lerpSpeed * delta)
    smoothPos.current.z += (target.z - smoothPos.current.z) * Math.min(1, lerpSpeed * delta)
    // Y position = visual radius so ball sits on the ground
    groupRef.current.position.set(smoothPos.current.x, BALL_VISUAL_R, smoothPos.current.z)
  })

  return (
    <group ref={groupRef} position={[targetPosition?.x || 0, BALL_VISUAL_R, targetPosition?.z || 0]}>
      {/* Ball – rendered at BALL_VISUAL_R, physics uses BALL_R */}
      <mesh castShadow receiveShadow scale={[BALL_VISUAL_R, BALL_VISUAL_R, BALL_VISUAL_R]}>
        <primitive object={SPHERE_GEO} attach="geometry" />
        <meshStandardMaterial map={tex} color="#ffffff" roughness={0.2} metalness={0.24} />
      </mesh>
      {/* Active ring – sits just below ball on ground */}
      <mesh position={[0, -BALL_VISUAL_R + 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[BALL_VISUAL_R * 2.2, BALL_VISUAL_R * 2.2, 1]}>
        <primitive object={RING_GEO} attach="geometry" />
        <meshBasicMaterial color={isActive ? '#ffffff' : player.color || '#888888'} transparent opacity={isActive ? 0.9 : 0.4} />
      </mesh>
      {/* Nametag above ball */}
      <Suspense fallback={null}>
        <Text
          position={[0, BALL_VISUAL_R + 0.45, 0]}
          fontSize={0.24}
          color={player.color || '#ffffff'}
          anchorX="center"
          anchorY="bottom"
          outlineWidth={0.04}
          outlineColor="#000000"
          renderOrder={10}
          depthOffset={-1}
        >
          {player.username || 'Player'}
        </Text>
      </Suspense>
    </group>
  )
})

// ─── All player balls ─────────────────────────────────────────────────────────
const PlayerBalls = React.memo(({ players, activePlayerId, playbackRef }) => {
  return players.map(player => {
    // During playback, the active player's ball follows the playback path
    const isPlaybackPlayer = playbackRef?.current?.playerId === player.id
    return (
      <PlayerBall
        key={player.id}
        player={player}
        isActive={player.id === activePlayerId}
        targetPosition={player.position}
        isPlayback={isPlaybackPlayer}
        playbackRef={playbackRef}
      />
    )
  })
})

// ─── Sound engine ─────────────────────────────────────────────────────────────
let _audioCtx = null
function getAudioCtx() {
  if (!_audioCtx) {
    try { _audioCtx = new (window.AudioContext || window.webkitAudioContext)() } catch {}
  }
  return _audioCtx
}
function playTone({ freq = 440, type = 'sine', duration = 0.18, gain = 0.22 }) {
  const ctx = getAudioCtx()
  if (!ctx) return
  try {
    const osc = ctx.createOscillator()
    const gainNode = ctx.createGain()
    osc.connect(gainNode); gainNode.connect(ctx.destination)
    osc.type = type
    osc.frequency.setValueAtTime(freq, ctx.currentTime)
    gainNode.gain.setValueAtTime(gain, ctx.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + duration)
  } catch {}
}
export function playHitSound(power = 0.5) {
  const freq = 180 + power * 220
  playTone({ freq, type: 'triangle', duration: 0.12, gain: 0.3 + power * 0.2 })
  playTone({ freq: freq * 1.5, type: 'sawtooth', duration: 0.06, gain: 0.15 })
}
export function playRollSound() {
  playTone({ freq: 320, type: 'sine', duration: 0.08, gain: 0.06 })
}
export function playHoleSound() {
  [523, 659, 784, 1047].forEach((freq, i) =>
    setTimeout(() => playTone({ freq, type: 'sine', duration: 0.3, gain: 0.25 }), i * 80))
}
export function playWallSound() {
  playTone({ freq: 260, type: 'square', duration: 0.07, gain: 0.12 })
}
export function playHazardSound() {
  playTone({ freq: 150, type: 'sawtooth', duration: 0.25, gain: 0.2 })
}

// ─── Cannon-es live physics controller ───────────────────────────────────────
// Runs cannon-es each frame for realistic ball movement.
// The authoritative result (from simulateShot) is used for multiplayer sync;
// cannon-es is purely visual – when the authoritative result arrives we snap
// the ball to the correct final position.
function CannonPhysicsController({ hole, startPos, angle, power, playbackRef, onComplete, authoritativeFinalPos }) {
  const physWorldRef = useRef(null)
  const completedRef = useRef(false)
  const lastRollSoundRef = useRef(0)
  const authSnapRef = useRef(authoritativeFinalPos)

  // Update snap target when authoritative result arrives
  useEffect(() => {
    authSnapRef.current = authoritativeFinalPos
  }, [authoritativeFinalPos])

  // Create physics world and shoot ball
  useEffect(() => {
    // Guard: don't create physics world if hole or startPos is missing
    if (!hole || !startPos || !hole.cup || !hole.bounds) return
    completedRef.current = false

    let world = null
    try {
      world = createMiniGolfPhysicsWorld(hole)
    } catch (err) {
      console.warn('[MiniGolf] Physics world creation failed:', err)
      return
    }
    if (!world) return
    physWorldRef.current = world

    world.setBallPosition(startPos)
    world.shootBall(angle, power)

    return () => {
      try { world.dispose() } catch {}
      physWorldRef.current = null
    }
  }, [hole, startPos, angle, power])

  useFrame((_, delta) => {
    const world = physWorldRef.current
    if (!world || completedRef.current) return

    world.step(delta)

    const pos = world.getBallPosition()
    if (playbackRef) {
      playbackRef.current = {
        ...playbackRef.current,
        position: { x: pos.x, z: pos.z },
      }
    }

    // Roll sound
    const vel = world.getBallVelocity()
    const speed = Math.hypot(vel.x, vel.z)
    const now = performance.now()
    if (speed > 0.3 && now - lastRollSoundRef.current > 100) {
      lastRollSoundRef.current = now
      playRollSound()
    }

    if (world.isSettled() && !completedRef.current) {
      completedRef.current = true

      // If authoritative final position is known, snap to it
      const snap = authSnapRef.current
      if (snap && playbackRef) {
        playbackRef.current = {
          ...playbackRef.current,
          position: { x: snap.x, z: snap.z },
        }
      }

      queueMicrotask(() => onComplete?.())
    }
  })

  return null
}

// ─── Camera – follows active player, right/middle click to orbit ──────────────
const DEFAULT_CAM_OFFSET = new THREE.Vector3(0, 12, 14)

function SceneCamera({ followTarget, playbackRef, orbitControlsRef }) {
  const camRef = useRef()
  const offsetRef = useRef(DEFAULT_CAM_OFFSET.clone())
  const desiredRef = useRef(new THREE.Vector3())
  const nextPosRef = useRef(new THREE.Vector3())
  const prevTargetRef = useRef(null)

  useFrame(() => {
    const liveTarget = playbackRef?.current?.position || followTarget
    if (!camRef.current || !orbitControlsRef?.current || !liveTarget) return
    const ctrl = orbitControlsRef.current

    // When target changes (turn change), snap offset from current camera position
    const targetKey = `${liveTarget.x?.toFixed(1)},${liveTarget.z?.toFixed(1)}`
    if (prevTargetRef.current !== targetKey) {
      prevTargetRef.current = targetKey
      offsetRef.current.copy(camRef.current.position).sub(ctrl.target)
    }

    desiredRef.current.set(liveTarget.x, 0.1, liveTarget.z)
    ctrl.target.lerp(desiredRef.current, 0.08)
    nextPosRef.current.copy(ctrl.target).add(offsetRef.current)
    camRef.current.position.lerp(nextPosRef.current, 0.08)
    ctrl.update()
  })

  return (
    <>
      <PerspectiveCamera ref={camRef} makeDefault position={[0, 12, 14]} fov={44} near={0.1} far={200} />
      <OrbitControls
        ref={orbitControlsRef}
        enablePan={false}
        minDistance={6}
        maxDistance={30}
        maxPolarAngle={Math.PI / 2.1}
        // Left button = disabled (used for aiming), right + middle = orbit
        mouseButtons={{
          LEFT: null,
          MIDDLE: THREE.MOUSE.ROTATE,
          RIGHT: THREE.MOUSE.ROTATE,
        }}
      />
    </>
  )
}

// ─── Main 3D world scene (THREE.js objects ONLY – no HTML) ───────────────────
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

function MiniGolfWorld({
  course, hole, players, activePlayerId,
  aimState, isMyTurn, shotPlayback,
  onAimDrag, onAimCancel, onShotPlaybackComplete,
}) {
  const palette = course?.palette || {}
  const activePlayer = players.find(p => p.id === activePlayerId) || players[0]
  const dragRef = useRef({ active: false, angle: 0, power: 0.25 })
  const orbitControlsRef = useRef()

  // playbackRef holds current live physics position (mutable, no re-render)
  const playbackRef = useRef(null)
  const [isPlayingBack, setIsPlayingBack] = useState(false)
  const [physicsKey, setPhysicsKey] = useState(0)

  useEffect(() => {
    if (!shotPlayback) {
      playbackRef.current = null
      setIsPlayingBack(false)
      return
    }
    playbackRef.current = {
      actionId: shotPlayback.actionId,
      playerId: shotPlayback.playerId,
      finalPosition: shotPlayback.finalPosition,
      position: shotPlayback.startPos || { x: 0, z: 0 },
    }
    setIsPlayingBack(true)
    setPhysicsKey(k => k + 1)
  }, [shotPlayback?.actionId])

  useEffect(() => {
    const onUp = () => {
      if (!dragRef.current.active) return
      dragRef.current.active = false
      onAimDrag?.({ angle: dragRef.current.angle, power: dragRef.current.power }, { commit: true })
    }
    const onBlur = () => { if (dragRef.current.active) { dragRef.current.active = false; onAimCancel?.() } }
    window.addEventListener('pointerup', onUp)
    window.addEventListener('blur', onBlur)
    return () => { window.removeEventListener('pointerup', onUp); window.removeEventListener('blur', onBlur) }
  }, [onAimCancel, onAimDrag])

  const aimLine = useMemo(() => {
    if (!isMyTurn || !aimState?.active || !activePlayer?.position) return null
    return buildAimLinePoints(activePlayer.position, aimState.angle, aimState.power)
  }, [isMyTurn, aimState, activePlayer])

  // Camera follows active player's ball (or playback position)
  const cameraTarget = activePlayer?.position || hole?.tee || { x: 0, z: 0 }

  // Ground size matches course bounds
  const groundW = hole ? (hole.bounds?.maxX - hole.bounds?.minX + 8) || 50 : 50
  const groundD = hole ? (hole.bounds?.maxZ - hole.bounds?.minZ + 8) || 32 : 32
  const groundCX = hole ? ((hole.bounds?.maxX + hole.bounds?.minX) / 2) || 0 : 0
  const groundCZ = hole ? ((hole.bounds?.maxZ + hole.bounds?.minZ) / 2) || 0 : 0

  return (
    <>
      <color attach="background" args={[palette.backgroundBottom || '#091223']} />
      <fog attach="fog" args={[palette.backgroundBottom || '#091223', 28, 70]} />
      <ambientLight intensity={1.1} />
      <directionalLight
        position={[6, 12, 8]} intensity={2.2} castShadow
        shadow-mapSize-width={1024} shadow-mapSize-height={1024}
        shadow-camera-left={-25} shadow-camera-right={25}
        shadow-camera-top={20} shadow-camera-bottom={-20}
      />
      <hemisphereLight args={[palette.backgroundTop || '#1f355c', '#102514', 0.65]} />

      <SceneCamera followTarget={cameraTarget} playbackRef={playbackRef} orbitControlsRef={orbitControlsRef} />

      {/* Ground – sized to course bounds */}
      <mesh
        position={[groundCX, 0, groundCZ]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[groundW, groundD]} />
        <meshStandardMaterial color={palette.rough || '#2d6a43'} roughness={0.98} />
      </mesh>

      {hole && <>
        <SurfaceLayer surfaces={hole.surfaces} palette={palette} />
        {hole.obstacles.map(obs => (
          <ObstacleMesh key={obs.id} obstacle={obs} palette={palette} />
        ))}
        <HazardPads hazards={hole.hazards} palette={palette} />
        <MovingHazards hazards={hole.movingHazards} palette={palette} />
        <Cup cup={hole.cup} palette={palette} />
      </>}

      <PlayerBalls
        players={players}
        activePlayerId={activePlayerId}
        playbackRef={playbackRef}
      />

      {/* Invisible aim plane – left-click drag to aim */}
      {hole && isMyTurn && !shotPlayback && (
        <mesh
          position={[0, 0.1, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          onPointerDown={e => {
            if (e.button !== 0 || !activePlayer?.position) return
            e.stopPropagation()
            const dx = activePlayer.position.x - e.point.x
            const dz = activePlayer.position.z - e.point.z
            const dist = Math.hypot(dx, dz)
            const aim = { angle: Math.atan2(dz, dx), power: clamp(dist / 8.0, 0.05, 1) }
            dragRef.current = { active: true, ...aim }
            onAimDrag?.(aim)
          }}
          onPointerMove={e => {
            if (!dragRef.current.active || !activePlayer?.position) return
            e.stopPropagation()
            const dx = activePlayer.position.x - e.point.x
            const dz = activePlayer.position.z - e.point.z
            const dist = Math.hypot(dx, dz)
            const aim = { angle: Math.atan2(dz, dx), power: clamp(dist / 8.0, 0.05, 1) }
            dragRef.current = { ...dragRef.current, ...aim }
            onAimDrag?.(aim)
          }}
          onPointerUp={e => {
            if (e.button !== 0 || !dragRef.current.active) return
            e.stopPropagation()
            dragRef.current.active = false
            onAimDrag?.({ angle: dragRef.current.angle, power: dragRef.current.power }, { commit: true })
          }}
        >
          <planeGeometry args={[80, 60]} />
          <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Aim line – green→yellow→red */}
      {aimLine && (() => {
        const p = aimState?.power || 0
        const r = p < 0.5 ? Math.round(p * 2 * 255) : 255
        const g = p < 0.5 ? 255 : Math.round((1 - (p - 0.5) * 2) * 255)
        return (
          <Line points={aimLine} color={`rgb(${r},${g},0)`} lineWidth={3.5} transparent opacity={0.92} />
        )
      })()}

      {/* Power ring around active ball */}
      {isMyTurn && !shotPlayback && activePlayer?.position && aimState?.active && (() => {
        const p = aimState?.power || 0
        const r = p < 0.5 ? Math.round(p * 2 * 255) : 255
        const g = p < 0.5 ? 255 : Math.round((1 - (p - 0.5) * 2) * 255)
        const scale = BALL_VISUAL_R * (2.0 + p * 3.5)
        return (
          <mesh
            position={[activePlayer.position.x, 0.06, activePlayer.position.z]}
            rotation={[-Math.PI / 2, 0, 0]}
            scale={[scale, scale, 1]}
          >
            <ringGeometry args={[0.8, 1.0, 32]} />
            <meshBasicMaterial color={`rgb(${r},${g},0)`} transparent opacity={0.7} />
          </mesh>
        )
      })()}

      {isPlayingBack && shotPlayback && hole && hole.cup && hole.bounds && (
        <CannonPhysicsController
          key={physicsKey}
          hole={hole}
          startPos={shotPlayback.startPos || activePlayer?.position || hole?.tee}
          angle={shotPlayback.angle || 0}
          power={shotPlayback.power || 0.25}
          playbackRef={playbackRef}
          authoritativeFinalPos={shotPlayback.finalPosition}
          onComplete={() => { setIsPlayingBack(false); onShotPlaybackComplete?.() }}
        />
      )}
    </>
  )
}

// ─── Physics async helper ─────────────────────────────────────────────────────
const runPhysicsAsync = (args) =>
  new Promise(resolve => {
    const { port1, port2 } = new MessageChannel()
    port2.onmessage = () => resolve(simulateShot(args))
    port1.postMessage(null)
  })

// ─── Power bar color helper ───────────────────────────────────────────────────
function powerColor(p) {
  const r = p < 0.5 ? Math.round(p * 2 * 255) : 255
  const g = p < 0.5 ? 200 : Math.round((1 - (p - 0.5) * 2) * 200)
  return `rgb(${r},${g},0)`
}

// ─── MiniGolf HUD – rendered via createPortal into containerRef ───────────────
function MiniGolfHUD({
  containerRef,
  phase,
  // Lobby
  courses, players, readyMap, votes, selectedCourseId, leadingCourseId,
  currentUserId, canStart, onVoteCourse, onToggleReady, onStartGame,
  myColor, onChangeColor,
  // Playing
  currentTurnPlayer, holeIndex, par, strokeCount,
  aimAngle, power, isAiming, isAnimating, isMyTurn,
  onSetPower, onShoot, onAimLeft, onAimRight,
  onOpenSettings,
  lastShotResult,
  // Settings
  showSettings, settings, onChangeSetting, onCloseSettings,
  // Hole summary
  leaderboard, onAdvanceHole, isLastHole,
  // Finished
  winner, onRematch,
}) {
  if (!containerRef.current) return null

  const pct = Math.round(power * 100)
  const barColor = powerColor(power)
  const readyCount = players.filter(p => readyMap[p.id]).length
  const isReady = readyMap[currentUserId]

  const hud = (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10, overflow: 'hidden', fontFamily: 'system-ui,-apple-system,sans-serif' }}>

      {/* ── LOBBY ── */}
      {phase === MINIGOLF_PHASES.LOBBY && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'auto' }}>
          <div style={{ width: Math.min(window.innerWidth - 40, 600), maxHeight: Math.min(window.innerHeight - 40, 560), background: 'rgba(13,17,23,0.97)', border: '1px solid #1f2937', borderRadius: 10, padding: 20, overflow: 'auto', color: '#f9fafb' }}>
            <div style={{ fontSize: 22, color: '#38bdf8', fontWeight: 'bold', marginBottom: 4 }}>⛳ MiniGolf – Lobby</div>
            <div style={{ height: 1, background: '#1f2937', margin: '8px 0 12px' }} />

            <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 12 }}>
              Players: {players.length} &nbsp;·&nbsp; Ready: {readyCount}/{players.length} &nbsp;·&nbsp;
              Leading vote: {courses.find(c => c.id === leadingCourseId)?.name || 'No votes yet'}
            </div>

            <div style={{ display: 'flex', gap: 16 }}>
              {/* Course list */}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, color: '#d1d5db', fontWeight: 'bold', marginBottom: 8 }}>Vote for Course</div>
                {courses.slice(0, 6).map(course => {
                  const isVoted = votes[currentUserId] === course.id
                  const isLeading = course.id === leadingCourseId
                  const isSelected = course.id === selectedCourseId
                  return (
                    <button key={course.id} onClick={() => onVoteCourse(course.id)} style={{
                      display: 'block', width: '100%', padding: '7px 12px', marginBottom: 6,
                      background: isSelected ? '#1e3a5f' : isLeading ? '#14532d' : '#1f2937',
                      color: isVoted ? '#4ade80' : isLeading ? '#fbbf24' : '#e5e7eb',
                      border: 'none', borderRadius: 4, fontSize: 13, cursor: 'pointer', textAlign: 'left',
                    }}>
                      {course.name}{isVoted ? '  ✓' : isLeading ? '  ★' : ''}
                    </button>
                  )
                })}
              </div>

              {/* Player list */}
              <div style={{ width: 180 }}>
                <div style={{ fontSize: 14, color: '#d1d5db', fontWeight: 'bold', marginBottom: 8 }}>Players</div>
                {players.slice(0, 8).map(p => (
                  <div key={p.id} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '5px 8px', marginBottom: 5, borderRadius: 4,
                    background: readyMap[p.id] ? '#14532d' : '#1f2937',
                    fontSize: 12, color: readyMap[p.id] ? '#4ade80' : '#e5e7eb',
                  }}>
                    <div style={{ width: 12, height: 12, borderRadius: '50%', background: p.color || '#888', flexShrink: 0 }} />
                    {readyMap[p.id] ? '✓ ' : ''}{p.username || 'Player'}
                  </div>
                ))}
              </div>
            </div>

            {/* Ball color picker */}
            <div style={{ marginTop: 14, padding: '10px 12px', background: '#111827', borderRadius: 6 }}>
              <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 8 }}>Your Ball Color</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {BALL_COLOR_OPTIONS.map(opt => (
                  <div
                    key={opt}
                    onClick={() => onChangeColor(opt)}
                    title={opt}
                    style={{
                      width: 28, height: 28, borderRadius: 4, background: opt, cursor: 'pointer',
                      border: myColor === opt ? '3px solid #ffffff' : '2px solid #374151',
                      boxSizing: 'border-box',
                      transform: myColor === opt ? 'scale(1.2)' : 'scale(1)',
                      transition: 'transform 0.1s, border 0.1s',
                    }}
                  />
                ))}
              </div>
            </div>

            <div style={{ height: 1, background: '#1f2937', margin: '12px 0' }} />

            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <button onClick={onToggleReady} style={{
                padding: '8px 20px', background: isReady ? '#14532d' : '#1d4ed8',
                color: '#fff', border: 'none', borderRadius: 4, fontSize: 14, cursor: 'pointer', fontWeight: 600,
              }}>
                {isReady ? '✓ Ready!' : 'Mark Ready'}
              </button>
              {canStart && (
                <button onClick={onStartGame} style={{
                  padding: '8px 20px', background: '#7c3aed',
                  color: '#fff', border: 'none', borderRadius: 4, fontSize: 14, cursor: 'pointer', fontWeight: 600,
                }}>
                  ▶ Start Game
                </button>
              )}
              <div style={{ marginLeft: 'auto', fontSize: 11, color: '#6b7280' }}>
                Right-click or middle-click to rotate camera
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── PLAYING HUD ── */}
      {phase === MINIGOLF_PHASES.PLAYING && (
        <>
          {/* Top-left: hole info */}
          <div style={{ position: 'absolute', top: 12, left: 12, width: 200, background: 'rgba(13,17,23,0.88)', border: '1px solid #1f2937', borderRadius: 8, padding: '10px 12px', color: '#f9fafb', pointerEvents: 'auto' }}>
            <div style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 4 }}>Hole {holeIndex + 1}</div>
            <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 2 }}>Par {par}</div>
            <div style={{ fontSize: 13, color: strokeCount <= par ? '#4ade80' : '#f87171' }}>Strokes: {strokeCount}</div>
          </div>

          {/* Top-right: scoreboard */}
          <div style={{ position: 'absolute', top: 12, right: 12, width: 190, background: 'rgba(13,17,23,0.88)', border: '1px solid #1f2937', borderRadius: 8, padding: '10px 12px', color: '#f9fafb', pointerEvents: 'auto' }}>
            <div style={{ fontSize: 14, fontWeight: 'bold', marginBottom: 6 }}>Scores</div>
            <div style={{ height: 1, background: '#1f2937', marginBottom: 6 }} />
            {players.slice(0, 6).map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: p.id === currentTurnPlayer?.id ? '#38bdf8' : '#e5e7eb', marginBottom: 4 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.color || '#888', flexShrink: 0 }} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.id === currentTurnPlayer?.id ? '▶ ' : ''}{p.username || 'P'}
                </span>
                <span style={{ fontWeight: 'bold' }}>{p.totalStrokes ?? 0}</span>
              </div>
            ))}
          </div>

          {/* Top-center: turn indicator */}
          {currentTurnPlayer && (
            <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', background: 'rgba(13,17,23,0.88)', border: '1px solid #374151', borderRadius: 8, padding: '6px 16px', color: '#38bdf8', whiteSpace: 'nowrap', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: currentTurnPlayer.color || '#888' }} />
              {currentTurnPlayer.username || 'Player'}'s turn &nbsp;·&nbsp; Hole {holeIndex + 1} &nbsp;·&nbsp; Par {par}
            </div>
          )}

          {/* Shot result toast */}
          {lastShotResult && (() => {
            const resultStr = lastShotResult?.type || lastShotResult
            const isGood = ['hole_in_one', 'birdie', 'eagle', 'cup', 'hole'].includes(resultStr)
            const toastColor = isGood ? '#4ade80' : resultStr === 'out_of_bounds' ? '#f87171' : '#fbbf24'
            const label = lastShotResult?.label || resultStr?.replace(/_/g, ' ') || ''
            return (
              <div style={{ position: 'absolute', top: 60, left: '50%', transform: 'translateX(-50%)', background: 'rgba(13,17,23,0.95)', border: `1px solid ${toastColor}`, borderRadius: 8, padding: '8px 20px', color: toastColor, fontSize: 16, fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                {label}
              </div>
            )
          })()}

          {/* Bottom: aim controls – only shown when it's my turn */}
          {isMyTurn && !isAnimating && (
            <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', width: Math.min(window.innerWidth - 24, 440), background: 'rgba(13,17,23,0.94)', border: '1px solid #1f2937', borderRadius: 8, padding: '10px 14px', color: '#f9fafb', pointerEvents: 'auto' }}>
              <div style={{ fontSize: 14, color: '#38bdf8', fontWeight: 'bold', marginBottom: 4 }}>
                {isAiming ? '🎯 Aiming…' : '⛳ Your Turn – hold left-click to aim'}
              </div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8 }}>
                Direction: {Math.round(((aimAngle * 180) / Math.PI + 360) % 360)}° &nbsp;·&nbsp; Right/middle-click to rotate camera
              </div>

              {/* Power bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: '#9ca3af', width: 44 }}>Power:</span>
                <div style={{ flex: 1, height: 12, background: '#1f2937', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: barColor, transition: 'width 0.05s' }} />
                </div>
                <span style={{ fontSize: 12, color: barColor, fontWeight: 'bold', width: 36, textAlign: 'right' }}>{pct}%</span>
              </div>

              {/* Power quick-set */}
              <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                {[25, 50, 75, 100].map(pv => (
                  <button key={pv} onClick={() => onSetPower?.(pv / 100)} style={{
                    flex: 1, padding: '4px 0', background: Math.abs(pct - pv) < 6 ? '#1d4ed8' : '#374151',
                    color: '#e5e7eb', border: 'none', borderRadius: 3, fontSize: 11, cursor: 'pointer',
                  }}>{pv}%</button>
                ))}
              </div>

              {/* Aim + shoot buttons */}
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <button onClick={() => { onAimLeft?.(); onAimLeft?.(); onAimLeft?.() }} style={{ padding: '5px 8px', background: '#374151', color: '#e5e7eb', border: 'none', borderRadius: 3, fontSize: 12, cursor: 'pointer' }}>◀◀</button>
                <button onClick={onAimLeft} style={{ padding: '5px 8px', background: '#374151', color: '#e5e7eb', border: 'none', borderRadius: 3, fontSize: 12, cursor: 'pointer' }}>◀</button>
                <button onClick={onAimRight} style={{ padding: '5px 8px', background: '#374151', color: '#e5e7eb', border: 'none', borderRadius: 3, fontSize: 12, cursor: 'pointer' }}>▶</button>
                <button onClick={() => { onAimRight?.(); onAimRight?.(); onAimRight?.() }} style={{ padding: '5px 8px', background: '#374151', color: '#e5e7eb', border: 'none', borderRadius: 3, fontSize: 12, cursor: 'pointer' }}>▶▶</button>
                <button onClick={onShoot} style={{ flex: 1, padding: '6px 0', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 3, fontSize: 14, fontWeight: 'bold', cursor: 'pointer' }}>🏌️ Shoot!</button>
                <button onClick={onOpenSettings} style={{ padding: '5px 10px', background: '#374151', color: '#e5e7eb', border: 'none', borderRadius: 3, fontSize: 13, cursor: 'pointer' }}>⚙</button>
              </div>
            </div>
          )}

          {/* Waiting indicator when it's not my turn */}
          {!isMyTurn && !isAnimating && currentTurnPlayer && (
            <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', background: 'rgba(13,17,23,0.88)', border: '1px solid #374151', borderRadius: 8, padding: '8px 20px', color: '#9ca3af', fontSize: 13 }}>
              Waiting for {currentTurnPlayer.username || 'Player'}…
            </div>
          )}

          {/* Animating indicator */}
          {isAnimating && (
            <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', background: 'rgba(13,17,23,0.88)', border: '1px solid #374151', borderRadius: 8, padding: '8px 20px', color: '#fbbf24', fontSize: 13 }}>
              ⛳ Ball rolling…
            </div>
          )}

          {/* Settings panel */}
          {showSettings && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', pointerEvents: 'auto' }}>
              <div style={{ width: 380, background: '#0d1117', border: '1px solid #1f2937', borderRadius: 10, padding: 20, color: '#f9fafb' }}>
                <div style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 10 }}>⚙ Settings</div>
                <div style={{ height: 1, background: '#1f2937', marginBottom: 12 }} />

                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 8 }}>Your Ball Color</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {BALL_COLOR_OPTIONS.map(opt => (
                      <div key={opt} onClick={() => onChangeSetting('ballColor', opt)} style={{
                        width: 26, height: 26, borderRadius: 4, background: opt, cursor: 'pointer',
                        border: settings?.ballColor === opt ? '3px solid #fff' : '2px solid #444',
                        boxSizing: 'border-box',
                        transform: settings?.ballColor === opt ? 'scale(1.2)' : 'scale(1)',
                        transition: 'transform 0.1s',
                      }} />
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <span style={{ fontSize: 13, color: '#9ca3af', width: 100 }}>Ball Trail</span>
                  <button onClick={() => onChangeSetting('trail', !settings?.trail)} style={{ padding: '4px 14px', background: settings?.trail ? '#14532d' : '#374151', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                    {settings?.trail ? 'On' : 'Off'}
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <span style={{ fontSize: 13, color: '#9ca3af', width: 100 }}>Camera</span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {['follow', 'overhead', 'free'].map(mode => (
                      <button key={mode} onClick={() => onChangeSetting('cameraMode', mode)} style={{
                        padding: '4px 10px', background: settings?.cameraMode === mode ? '#1d4ed8' : '#374151',
                        color: '#fff', border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer',
                      }}>{mode.charAt(0).toUpperCase() + mode.slice(1)}</button>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <span style={{ fontSize: 13, color: '#9ca3af', width: 100 }}>Sensitivity</span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[0.5, 1.0, 1.5, 2.0].map(val => (
                      <button key={val} onClick={() => onChangeSetting('powerSensitivity', val)} style={{
                        padding: '4px 8px', background: settings?.powerSensitivity === val ? '#7c3aed' : '#374151',
                        color: '#fff', border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer',
                      }}>{val}x</button>
                    ))}
                  </div>
                </div>

                <div style={{ height: 1, background: '#1f2937', marginBottom: 12 }} />
                <button onClick={onCloseSettings} style={{ padding: '6px 20px', background: '#374151', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>✕ Close</button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── HOLE SUMMARY ── */}
      {phase === MINIGOLF_PHASES.HOLE_SUMMARY && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'auto' }}>
          <div style={{ width: Math.min(window.innerWidth - 40, 440), background: 'rgba(13,17,23,0.97)', border: '1px solid #1f2937', borderRadius: 10, padding: 20, color: '#f9fafb' }}>
            <div style={{ fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginBottom: 8 }}>Hole {holeIndex + 1} Complete!</div>
            <div style={{ height: 1, background: '#1f2937', marginBottom: 12 }} />
            <div style={{ fontSize: 14, color: '#9ca3af', marginBottom: 8 }}>Leaderboard</div>
            {leaderboard.map((entry, i) => (
              <div key={entry.playerId} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', marginBottom: 6,
                background: i === 0 ? '#78350f' : '#1f2937', borderRadius: 4,
                fontSize: 13, color: i === 0 ? '#fbbf24' : '#e5e7eb',
              }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: entry.color || '#888', flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{i + 1}. {entry.username || 'Player'}</span>
                <span>{entry.strokes} stroke{entry.strokes !== 1 ? 's' : ''} (total: {entry.totalStrokes})</span>
              </div>
            ))}
            <div style={{ marginTop: 16, textAlign: 'center' }}>
              <button onClick={onAdvanceHole} style={{ padding: '8px 24px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 4, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                {isLastHole ? '🏆 See Final Results' : '▶ Next Hole'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── FINISHED ── */}
      {phase === MINIGOLF_PHASES.FINISHED && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'auto' }}>
          <div style={{ width: Math.min(window.innerWidth - 40, 460), background: 'rgba(13,17,23,0.97)', border: '1px solid #1f2937', borderRadius: 10, padding: 20, color: '#f9fafb' }}>
            <div style={{ fontSize: 24, color: '#fbbf24', fontWeight: 'bold', textAlign: 'center', marginBottom: 4 }}>🏆 Game Over!</div>
            {winner && (
              <div style={{ fontSize: 16, color: '#4ade80', textAlign: 'center', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: winner.color || '#888' }} />
                Winner: {winner.username || 'Player'}
              </div>
            )}
            <div style={{ height: 1, background: '#1f2937', marginBottom: 12 }} />
            <div style={{ fontSize: 14, color: '#9ca3af', marginBottom: 8 }}>Final Scores</div>
            {leaderboard.map((entry, i) => (
              <div key={entry.playerId} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', marginBottom: 6,
                background: i === 0 ? '#78350f' : '#1f2937', borderRadius: 4,
                fontSize: 13, color: i === 0 ? '#fbbf24' : '#e5e7eb',
              }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: entry.color || '#888', flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{i + 1}. {entry.username || 'Player'}</span>
                <span>{entry.totalStrokes} total strokes</span>
              </div>
            ))}
            <div style={{ marginTop: 16, textAlign: 'center' }}>
              <button onClick={onRematch} style={{ padding: '8px 24px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 4, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                🔄 Play Again
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )

  return createPortal(hud, containerRef.current)
}

// ─── Main activity component ──────────────────────────────────────────────────
const MiniGolfActivity3D = ({ sdk, currentUser }) => {
  const userId   = currentUser?.id       || `guest-${Math.random().toString(36).slice(2)}`
  const username = currentUser?.username || 'Player'

  const containerRef = useRef(null)  // DOM node for HUD portal (VoltCraft pattern)

  const [gameState, setGameState]       = useState(createInitialMiniGolfState)
  const [aimState, setAimState]         = useState({ active: false, angle: 0, power: 0.25 })
  const [shotPlayback, setShotPlayback] = useState(null)
  const [lastShotResult, setLastShotResult] = useState(null)
  const [selectedCourseId, setSelectedCourseId] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [myColor, setMyColor]           = useState(BALL_COLOR_OPTIONS[0])
  const [settings, setSettings]         = useState({
    ballColor: BALL_COLOR_OPTIONS[0],
    trail: true,
    particles: true,
    cameraMode: 'follow',
    powerSensitivity: 1.0,
  })

  const seenEventsRef  = useRef(new Set())
  const pendingShotRef = useRef(null)

  // ── Derived state ────────────────────────────────────────────────────────────
  const phase          = gameState.phase
  const courseId       = gameState.courseId
  const holeIndex      = gameState.holeIndex
  const course         = useMemo(() => getMiniGolfCourse(courseId), [courseId])
  const hole           = useMemo(() => getMiniGolfHole(courseId, holeIndex), [courseId, holeIndex])
  const holeCount      = course?.holes?.length || 1
  const leaderboard    = useMemo(() => getMiniGolfLeaderboard(gameState), [gameState])
  const currentTurnPlayer = gameState.players.find(p => p.id === gameState.currentTurnPlayerId) || null
  const isMyTurn       = gameState.currentTurnPlayerId === userId && phase === MINIGOLF_PHASES.PLAYING
  const winner         = gameState.players.find(p => p.id === gameState.winnerId) || null
  const leadingCourseId = useMemo(() => resolveMiniGolfCourseId(gameState), [gameState])
  const canStart       = gameState.players.length >= 1 && Object.values(gameState.readyMap).some(Boolean)

  const courseSummaries = useMemo(() => listMiniGolfCourseSummaries().map(c => ({
    ...c, unlocked: true
  })), [])

  const playersWithPositions = useMemo(() =>
    gameState.players.map((p, i) => ({
      ...p,
      color: p.color || PLAYER_COLORS[i % PLAYER_COLORS.length],
      position: gameState.playerStates[p.id]?.position || hole?.tee || { x: 0, z: 0 },
      totalStrokes: gameState.scorecards[p.id]?.totalStrokes ?? 0,
    })),
    [gameState.players, gameState.playerStates, gameState.scorecards, hole]
  )

  // ── SDK event handling ───────────────────────────────────────────────────────
  const dispatchEvent = useCallback((evt) => {
    const id = buildMiniGolfEventId(evt)
    if (!rememberMiniGolfEvent(seenEventsRef, id)) return
    setGameState(prev => applyMiniGolfEvent(prev, evt))
  }, [])

  useEffect(() => {
    if (!sdk) return
    const off = sdk.on?.('event', (evt) => {
      if (!evt?.eventType?.startsWith('minigolf:')) return
      dispatchEvent(evt)
      if (evt.eventType === MINIGOLF_EVENT_TYPES.SHOT) {
        const { playerId, shot, result } = evt.payload || {}
        if (!result || playerId === userId) return  // own shots handled in handleAimDrag
        // For other players' shots, start cannon-es simulation from their position
        const playerState = gameState.playerStates[playerId]
        const startPos = playerState?.position || hole?.tee || { x: 0, z: 0 }
        setShotPlayback({
          actionId: evt.payload.actionId,
          playerId,
          startPos,
          angle: shot?.angle || 0,
          power: shot?.power || 0.5,
          finalPosition: result.finalPosition,
        })
        if (result.resultType) {
          setLastShotResult(result.resultType)
          setTimeout(() => setLastShotResult(null), 3000)
        }
      }
    })
    return () => off?.()
  }, [sdk, dispatchEvent, userId, gameState.playerStates, hole])

  // ── Join on mount ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!sdk) return
    const actionId = `join-${userId}-${Date.now()}`
    const evt = {
      eventType: MINIGOLF_EVENT_TYPES.JOIN,
      payload: { actionId, playerId: userId, username, color: myColor },
      ts: Date.now()
    }
    dispatchEvent(evt)
    sdk.emitEvent?.(MINIGOLF_EVENT_TYPES.JOIN, evt.payload, { serverRelay: true })
    return () => {
      sdk.emitEvent?.(MINIGOLF_EVENT_TYPES.LEAVE, { actionId: `leave-${userId}-${Date.now()}`, playerId: userId }, { serverRelay: true })
    }
  }, [sdk, userId, username])

  // ── Actions ──────────────────────────────────────────────────────────────────
  const handleVoteCourse = useCallback((cId) => {
    setSelectedCourseId(cId)
    const evt = { eventType: MINIGOLF_EVENT_TYPES.VOTE, payload: { actionId: `vote-${userId}-${Date.now()}`, playerId: userId, courseId: cId }, ts: Date.now() }
    dispatchEvent(evt)
    sdk?.emitEvent?.(MINIGOLF_EVENT_TYPES.VOTE, evt.payload, { serverRelay: true })
  }, [sdk, userId, dispatchEvent])

  const handleToggleReady = useCallback(() => {
    const ready = !gameState.readyMap[userId]
    const evt = { eventType: MINIGOLF_EVENT_TYPES.READY, payload: { actionId: `ready-${userId}-${Date.now()}`, playerId: userId, ready }, ts: Date.now() }
    dispatchEvent(evt)
    sdk?.emitEvent?.(MINIGOLF_EVENT_TYPES.READY, evt.payload, { serverRelay: true })
  }, [sdk, userId, gameState.readyMap, dispatchEvent])

  const handleStartGame = useCallback(() => {
    const evt = { eventType: MINIGOLF_EVENT_TYPES.START, payload: { actionId: `start-${Date.now()}`, courseId: leadingCourseId }, ts: Date.now() }
    dispatchEvent(evt)
    sdk?.emitEvent?.(MINIGOLF_EVENT_TYPES.START, evt.payload, { serverRelay: true })
  }, [sdk, leadingCourseId, dispatchEvent])

  const handleChangeColor = useCallback((color) => {
    setMyColor(color)
    setSettings(prev => ({ ...prev, ballColor: color }))
    const evt = { eventType: MINIGOLF_EVENT_TYPES.COLOR_CHANGE, payload: { actionId: `color-${userId}-${Date.now()}`, playerId: userId, color }, ts: Date.now() }
    dispatchEvent(evt)
    sdk?.emitEvent?.(MINIGOLF_EVENT_TYPES.COLOR_CHANGE, evt.payload, { serverRelay: true })
  }, [sdk, userId, dispatchEvent])

  const handleAimDrag = useCallback((aim, opts) => {
    setAimState({ active: !opts?.commit, ...aim })
    if (opts?.commit && aim.power >= 0.08) {
      playHitSound(aim.power)
      pendingShotRef.current = aim
      const myState = gameState.playerStates[userId]
      const start = myState?.position || hole?.tee || { x: 0, z: 0 }
      const lastCheckpoint = myState?.lastCheckpoint || hole?.tee

      // Start cannon-es visual simulation immediately (before authoritative result)
      setShotPlayback({
        actionId: `shot-${userId}-${Date.now()}-pending`,
        playerId: userId,
        startPos: { ...start },
        angle: aim.angle,
        power: aim.power,
        finalPosition: null,  // will be filled in when authoritative result arrives
      })

      runPhysicsAsync({ hole, start, shot: aim, lastCheckpoint }).then(result => {
        if (result.resultType === 'cup') playHoleSound()
        else if (result.resultType === 'hazard-reset' || result.resultType === 'lava-reset') playHazardSound()
        else if (result.collisionCount > 0) playWallSound()
        const actionId = `shot-${userId}-${Date.now()}`
        // Update shotPlayback with authoritative final position
        setShotPlayback(prev => prev ? { ...prev, actionId, finalPosition: result.finalPosition } : null)
        const evt = {
          eventType: MINIGOLF_EVENT_TYPES.SHOT,
          payload: { actionId, playerId: userId, shot: aim, result },
          ts: Date.now()
        }
        dispatchEvent(evt)
        sdk?.emitEvent?.(MINIGOLF_EVENT_TYPES.SHOT, evt.payload, { serverRelay: true })
      })
    }
  }, [sdk, userId, gameState.playerStates, hole, dispatchEvent])

  const handleAimCancel   = useCallback(() => setAimState({ active: false, angle: 0, power: 0.25 }), [])
  const handleShotPlaybackComplete = useCallback(() => setShotPlayback(null), [])

  const handleAdvanceHole = useCallback(() => {
    const evt = { eventType: MINIGOLF_EVENT_TYPES.ADVANCE_HOLE, payload: { actionId: `advance-${Date.now()}` }, ts: Date.now() }
    dispatchEvent(evt)
    sdk?.emitEvent?.(MINIGOLF_EVENT_TYPES.ADVANCE_HOLE, evt.payload, { serverRelay: true })
  }, [sdk, dispatchEvent])

  const handleRematch = useCallback(() => {
    const evt = { eventType: MINIGOLF_EVENT_TYPES.REMATCH, payload: { actionId: `rematch-${Date.now()}` }, ts: Date.now() }
    dispatchEvent(evt)
    sdk?.emitEvent?.(MINIGOLF_EVENT_TYPES.REMATCH, evt.payload, { serverRelay: true })
  }, [sdk, dispatchEvent])

  const handleAimLeft  = useCallback(() => setAimState(prev => ({ ...prev, active: true, angle: (prev.angle || 0) - 0.1 })), [])
  const handleAimRight = useCallback(() => setAimState(prev => ({ ...prev, active: true, angle: (prev.angle || 0) + 0.1 })), [])

  const handleShoot = useCallback(() => {
    if (!isMyTurn) return
    handleAimDrag({ angle: aimState.angle, power: aimState.power }, { commit: true })
  }, [isMyTurn, aimState, handleAimDrag])

  const handleChangeSetting = useCallback((key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }))
    // If ball color changed in settings, also broadcast it
    if (key === 'ballColor') {
      handleChangeColor(value)
    }
  }, [handleChangeColor])

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', background: '#0d1117', position: 'relative' }}
      onContextMenu={e => e.preventDefault()}
    >
      <WebGLErrorBoundary>
        <Canvas
          shadows
          gl={{ antialias: true, powerPreference: 'high-performance', failIfMajorPerformanceCaveat: false }}
          dpr={[1, Math.min(window.devicePixelRatio, 2)]}
          frameloop="always"
          style={{ position: 'absolute', inset: 0 }}
        >
          <Suspense fallback={null}>
            <MiniGolfWorld
              course={course}
              hole={hole}
              players={playersWithPositions}
              activePlayerId={gameState.currentTurnPlayerId}
              aimState={aimState}
              isMyTurn={isMyTurn}
              shotPlayback={shotPlayback}
              onAimDrag={handleAimDrag}
              onAimCancel={handleAimCancel}
              onShotPlaybackComplete={handleShotPlaybackComplete}
            />
          </Suspense>
        </Canvas>
      </WebGLErrorBoundary>

      {/* HUD is a regular React portal OUTSIDE the Canvas – mirrors VoltCraft exactly */}
      <MiniGolfHUD
        containerRef={containerRef}
        phase={phase}
        courses={courseSummaries}
        players={playersWithPositions}
        readyMap={gameState.readyMap}
        votes={gameState.votes}
        selectedCourseId={selectedCourseId || courseId}
        leadingCourseId={leadingCourseId}
        currentUserId={userId}
        canStart={canStart}
        onVoteCourse={handleVoteCourse}
        onToggleReady={handleToggleReady}
        onStartGame={handleStartGame}
        myColor={myColor}
        onChangeColor={handleChangeColor}
        currentTurnPlayer={currentTurnPlayer}
        holeIndex={holeIndex}
        par={hole?.par || 3}
        strokeCount={gameState.playerStates[userId]?.strokesThisHole ?? 0}
        aimAngle={aimState?.angle || 0}
        power={aimState?.power || 0.25}
        isAiming={aimState?.active || false}
        isAnimating={!!shotPlayback}
        isMyTurn={isMyTurn}
        onSetPower={(p) => handleAimDrag({ ...aimState, power: p })}
        onShoot={handleShoot}
        onAimLeft={handleAimLeft}
        onAimRight={handleAimRight}
        onOpenSettings={() => setShowSettings(true)}
        lastShotResult={lastShotResult}
        showSettings={showSettings}
        settings={settings}
        onChangeSetting={handleChangeSetting}
        onCloseSettings={() => setShowSettings(false)}
        leaderboard={leaderboard}
        onAdvanceHole={handleAdvanceHole}
        isLastHole={holeIndex >= holeCount - 1}
        winner={winner}
        onRematch={handleRematch}
      />
    </div>
  )
}

export default MiniGolfActivity3D
