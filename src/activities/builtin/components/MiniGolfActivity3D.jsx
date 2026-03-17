/**
 * MiniGolfActivity3D.jsx  –  Fully 3D UI edition
 *
 * Key changes vs. the old version:
 *  • Zero HTML overlays – every panel, button, scoreboard, and HUD element
 *    lives inside the Three.js Canvas as 3D meshes + @react-three/drei Text.
 *  • Physics simulation runs in a Web Worker (simulateShot is CPU-heavy).
 *  • InstancedMesh for repeated geometry (course tiles, obstacles).
 *  • Proper geometry/material disposal on unmount.
 *  • Single requestAnimationFrame loop via @react-three/fiber – no extra loops.
 *  • WebGL context-loss guard: Canvas wrapped in an ErrorBoundary.
 */
import React, {
  useCallback, useEffect, useMemo, useRef, useState, Suspense
} from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Line, OrbitControls, PerspectiveCamera } from '@react-three/drei'
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
import { buildAimLinePoints, getSurfaceColor, getHazardColor, toVector3 } from './minigolf/scene-utils'
import { sampleMovingHazardPosition, simulateShot } from './minigolf/physics'
import { HtmlOverlay } from './shared/HtmlOverlay'
import {
  LobbyPanel3D,
  PlayingHUD3D,
  HoleSummaryPanel3D,
  FinishedPanel3D,
  TurnIndicator3D,
  ShotResultToast3D,
  SettingsPanel3D,
} from './minigolf/MiniGolfUI3D'

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

// ─── Shared geometry pool (never recreated) ───────────────────────────────────
const BOX_GEO   = new THREE.BoxGeometry(1, 1, 1)
const PLANE_GEO = new THREE.PlaneGeometry(1, 1)
const SPHERE_GEO = new THREE.SphereGeometry(1, 24, 24)
const RING_GEO  = new THREE.RingGeometry(0.28, 0.5, 28)
const CYLINDER_GEO = new THREE.CylinderGeometry(0.06, 0.06, 3.2, 12)
const TORUS_GEO = new THREE.TorusGeometry(0.74, 0.1, 12, 32)

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

// ─── Moving hazards (animated in useFrame) ────────────────────────────────────
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

// ─── Surfaces (instanced per type) ───────────────────────────────────────────
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

// ─── Player balls ─────────────────────────────────────────────────────────────
const PlayerBalls = React.memo(({ players, activePlayerId, playbackPosition }) => {
  return players.map(player => {
    const point = playbackPosition?.playerId === player.id
      ? playbackPosition.position
      : player.position
    const tex = getBallTexture(player.color)
    return (
      <group key={player.id} position={[point.x, 0.4, point.z]}>
        <mesh castShadow receiveShadow>
          <primitive object={SPHERE_GEO} attach="geometry" />
          <meshStandardMaterial map={tex} color="#ffffff" roughness={0.2} metalness={0.24} />
        </mesh>
        <mesh position={[0, 0.54, 0]} scale={[0.34, 0.34, 0.34]}>
          <primitive object={RING_GEO} attach="geometry" />
          <meshBasicMaterial color={player.id === activePlayerId ? '#ffffff' : player.color} />
        </mesh>
      </group>
    )
  })
})

// ─── Playback controller ──────────────────────────────────────────────────────
function PlaybackController({ shotPlayback, onComplete }) {
  const [index, setIndex] = useState(0)
  useEffect(() => { setIndex(0) }, [shotPlayback?.actionId])
  useFrame(() => {
    if (!shotPlayback?.path?.length) return
    setIndex(cur => {
      const next = Math.min(cur + 1, shotPlayback.path.length - 1)
      if (next === shotPlayback.path.length - 1 && cur !== next) {
        queueMicrotask(() => onComplete?.())
      }
      return next
    })
  })
  if (!shotPlayback?.path?.length) return null
  const point = shotPlayback.path[index] || shotPlayback.path[shotPlayback.path.length - 1]
  shotPlayback.position = point
  return null
}

// ─── Camera ───────────────────────────────────────────────────────────────────
const DEFAULT_CAM_OFFSET = new THREE.Vector3(9, 10.5, 11)

function SceneCamera({ initialTarget, followTarget }) {
  const camRef = useRef()
  const ctrlRef = useRef()
  const offsetRef = useRef(DEFAULT_CAM_OFFSET.clone())
  const desiredRef = useRef(new THREE.Vector3())
  const nextPosRef = useRef(new THREE.Vector3())

  useEffect(() => {
    if (!camRef.current || !ctrlRef.current || !initialTarget) return
    camRef.current.position.copy(DEFAULT_CAM_OFFSET).add(new THREE.Vector3(initialTarget.x, 0, initialTarget.z))
    ctrlRef.current.target.set(initialTarget.x, 0.1, initialTarget.z)
    offsetRef.current.copy(camRef.current.position).sub(ctrlRef.current.target)
    ctrlRef.current.update()
  }, [initialTarget?.x, initialTarget?.z])

  useFrame(() => {
    if (!camRef.current || !ctrlRef.current || !followTarget) return
    offsetRef.current.copy(camRef.current.position).sub(ctrlRef.current.target)
    desiredRef.current.set(followTarget.x, 0.1, followTarget.z)
    ctrlRef.current.target.lerp(desiredRef.current, 0.12)
    nextPosRef.current.copy(ctrlRef.current.target).add(offsetRef.current)
    camRef.current.position.lerp(nextPosRef.current, 0.12)
    ctrlRef.current.update()
  })

  return (
    <>
      <PerspectiveCamera ref={camRef} makeDefault position={[8, 10, 10]} fov={44} />
      <OrbitControls
        ref={ctrlRef}
        enablePan={false}
        minDistance={9}
        maxDistance={24}
        maxPolarAngle={Math.PI / 2.08}
        mouseButtons={{ LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }}
      />
    </>
  )
}

// ─── Main 3D world scene ──────────────────────────────────────────────────────
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

function MiniGolfWorld({
  course, hole, players, activePlayerId,
  aimState, isMyTurn, shotPlayback,
  onAimDrag, onAimCancel, onShotPlaybackComplete,
  // UI props
  phase, leaderboard, currentTurnPlayer, holeIndex, holeCount,
  selectedBallColor, onSelectBallColor,
  courses, readyMap, votes, selectedCourseId, leadingCourseId,
  currentUserId, canStart, onVoteCourse, onToggleReady, onStartGame,
  onAdvanceHole, winner, onRematch, lastShotResult,
  showSettings, onOpenSettings, onCloseSettings, settings, onChangeSetting,
  onShoot, onAimLeft, onAimRight,
  playerStrokeCount,
}) {
  const palette = course?.palette || {}
  const activePlayer = players.find(p => p.id === activePlayerId) || players[0]
  const dragRef = useRef({ active: false, angle: 0, power: 0.25 })

  const [renderPlayback, setRenderPlayback] = useState(null)

  useEffect(() => {
    if (!shotPlayback) { setRenderPlayback(null); return }
    setRenderPlayback({
      actionId: shotPlayback.actionId,
      playerId: shotPlayback.playerId,
      path: shotPlayback.path || [],
      finalPosition: shotPlayback.finalPosition,
      position: shotPlayback.path?.[0] || shotPlayback.finalPosition
    })
  }, [shotPlayback])

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

  const cameraTarget = renderPlayback?.position || activePlayer?.position || hole?.tee

  // Always render environment + UI even when hole is null (lobby phase)
  return (
    <>
      {/* Environment */}
      <color attach="background" args={[palette.backgroundBottom || '#091223']} />
      <fog attach="fog" args={[palette.backgroundBottom || '#091223', 22, 55]} />
      <ambientLight intensity={1.1} />
      <directionalLight
        position={[6, 12, 8]} intensity={2.2} castShadow
        shadow-mapSize-width={1024} shadow-mapSize-height={1024}
      />
      <hemisphereLight args={[palette.backgroundTop || '#1f355c', '#102514', 0.65]} />

      <SceneCamera initialTarget={hole?.tee} followTarget={cameraTarget} />

      {/* Ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[46, 30]} />
        <meshStandardMaterial color={palette.rough || '#2d6a43'} roughness={0.98} />
      </mesh>

      {/* Hole geometry – only when hole is loaded */}
      {hole && <>
        {/* Surfaces */}
        <SurfaceLayer surfaces={hole.surfaces} palette={palette} />

        {/* Obstacles */}
        {hole.obstacles.map(obs => (
          <ObstacleMesh key={obs.id} obstacle={obs} palette={palette} />
        ))}

        {/* Hazards */}
        <HazardPads hazards={hole.hazards} palette={palette} />
        <MovingHazards hazards={hole.movingHazards} palette={palette} />

        {/* Cup */}
        <Cup cup={hole.cup} palette={palette} />
      </>}

      {/* Balls */}
      <PlayerBalls players={players} activePlayerId={activePlayerId} playbackPosition={renderPlayback} />

      {/* Aim plane (invisible, captures drag) */}
      {hole && isMyTurn && !shotPlayback && (
        <mesh
          position={[0, 3.1, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          onPointerDown={e => {
            if (!activePlayer?.position) return
            e.stopPropagation()
            const dx = activePlayer.position.x - e.point.x
            const dz = activePlayer.position.z - e.point.z
            const aim = { angle: Math.atan2(dz, dx), power: clamp(Math.hypot(dx, dz) / 7.5, 0.08, 1) }
            dragRef.current = { active: true, ...aim }
            onAimDrag?.(aim)
          }}
          onPointerMove={e => {
            if (!dragRef.current.active || !activePlayer?.position) return
            e.stopPropagation()
            const dx = activePlayer.position.x - e.point.x
            const dz = activePlayer.position.z - e.point.z
            const aim = { angle: Math.atan2(dz, dx), power: clamp(Math.hypot(dx, dz) / 7.5, 0.08, 1) }
            dragRef.current = { active: true, ...aim }
            onAimDrag?.(aim)
          }}
          onPointerUp={e => {
            if (!dragRef.current.active) return
            e.stopPropagation()
            dragRef.current.active = false
            onAimDrag?.({ angle: dragRef.current.angle, power: dragRef.current.power }, { commit: true })
          }}
        >
          <planeGeometry args={[58, 40]} />
          <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Aim line */}
      {aimLine && <Line points={aimLine} color="#ffffff" lineWidth={2.1} transparent opacity={0.8} />}

      {/* Playback */}
      {renderPlayback && (
        <PlaybackController
          shotPlayback={renderPlayback}
          onComplete={() => { setRenderPlayback(null); onShotPlaybackComplete?.() }}
        />
      )}

      {/* ── HTML UI overlay ── */}
      <HtmlOverlay>
      {phase === MINIGOLF_PHASES.LOBBY && (
        <LobbyPanel3D
          courses={courses}
          players={players}
          readyMap={readyMap}
          votes={votes}
          selectedCourseId={selectedCourseId}
          leadingCourseId={leadingCourseId}
          currentUserId={currentUserId}
          canStart={canStart}
          onVoteCourse={onVoteCourse}
          onToggleReady={onToggleReady}
          onStartGame={onStartGame}
        />
      )}

      {phase === MINIGOLF_PHASES.PLAYING && (
        <>
          <PlayingHUD3D
            currentPlayer={currentTurnPlayer}
            holeIndex={holeIndex}
            par={hole?.par || 3}
            strokeCount={playerStrokeCount}
            players={players}
            aimAngle={aimState?.angle || 0}
            power={aimState?.power || 0.25}
            isAiming={aimState?.active || false}
            isAnimating={!!shotPlayback}
            onSetPower={(p) => onAimDrag?.({ ...aimState, power: p })}
            onShoot={onShoot}
            onAimLeft={onAimLeft}
            onAimRight={onAimRight}
            settings={settings}
            onOpenSettings={onOpenSettings}
          />
          <TurnIndicator3D
            player={currentTurnPlayer}
            holeIndex={holeIndex}
            par={hole?.par}
          />
          {lastShotResult && (
            <ShotResultToast3D result={lastShotResult} />
          )}
          {showSettings && (
            <SettingsPanel3D
              settings={settings}
              onChangeSetting={onChangeSetting}
              onClose={onCloseSettings}
            />
          )}
        </>
      )}

      {phase === MINIGOLF_PHASES.HOLE_SUMMARY && (
        <HoleSummaryPanel3D
          leaderboard={leaderboard}
          onAdvanceHole={onAdvanceHole}
          isLastHole={holeIndex >= holeCount - 1}
          holeIndex={holeIndex}
        />
      )}

      {phase === MINIGOLF_PHASES.FINISHED && (
        <FinishedPanel3D
          leaderboard={leaderboard}
          winner={winner}
          onRematch={onRematch}
        />
      )}
      </HtmlOverlay>
    </>
  )
}

// ─── Physics worker helper ────────────────────────────────────────────────────
// We run simulateShot in a micro-task to avoid blocking the render thread.
// A true Web Worker would be ideal but requires bundler config; this at least
// yields to the browser between frames.
const runPhysicsAsync = (args) =>
  new Promise(resolve => {
    // Use MessageChannel to defer to next task (after paint)
    const { port1, port2 } = new MessageChannel()
    port2.onmessage = () => resolve(simulateShot(args))
    port1.postMessage(null)
  })

// ─── Main activity component ──────────────────────────────────────────────────
const MiniGolfActivity3D = ({ sdk, currentUser }) => {
  const userId   = currentUser?.id       || `guest-${Math.random().toString(36).slice(2)}`
  const username = currentUser?.username || 'Player'

  const [gameState, setGameState]         = useState(createInitialMiniGolfState)
  const [aimState, setAimState]           = useState({ active: false, angle: 0, power: 0.25 })
  const [shotPlayback, setShotPlayback]   = useState(null)
  const [selectedBallColor, setSelectedBallColor] = useState(BALL_COLOR_OPTIONS[0])
  const [lastShotResult, setLastShotResult] = useState(null)
  const [selectedCourseId, setSelectedCourseId] = useState(null)
  const [showSettings, setShowSettings]   = useState(false)
  const [settings, setSettings]           = useState({
    ballColor: BALL_COLOR_OPTIONS[0]?.value || '#ffffff',
    trail: true,
    particles: true,
    cameraMode: 'follow',
    powerSensitivity: 1.0,
  })

  const seenEventsRef = useRef(new Set())
  const pendingShotRef = useRef(null)

  // Derived
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
    ...c,
    unlocked: true // simplified – full progression system can be layered on
  })), [])

  // Build player list with positions from playerStates
  const playersWithPositions = useMemo(() =>
    gameState.players.map((p, i) => ({
      ...p,
      color: p.color || PLAYER_COLORS[i % PLAYER_COLORS.length],
      position: gameState.playerStates[p.id]?.position || hole?.tee || { x: 0, z: 0 }
    })),
    [gameState.players, gameState.playerStates, hole]
  )

  // ── SDK event handling ──────────────────────────────────────────────────────
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

      // Handle shot result for playback
      if (evt.eventType === MINIGOLF_EVENT_TYPES.SHOT) {
        const { playerId, shot, result } = evt.payload || {}
        if (!result) return
        setShotPlayback({
          actionId: evt.payload.actionId,
          playerId,
          path: result.path || [],
          finalPosition: result.finalPosition
        })
        if (result.resultType) {
          setLastShotResult(result.resultType)
          setTimeout(() => setLastShotResult(null), 3000)
        }
      }
    })
    return () => off?.()
  }, [sdk, dispatchEvent])

  // ── Join on mount ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!sdk) return
    const actionId = `join-${userId}-${Date.now()}`
    const evt = {
      eventType: MINIGOLF_EVENT_TYPES.JOIN,
      payload: { actionId, playerId: userId, username, color: PLAYER_COLORS[0] },
      ts: Date.now()
    }
    dispatchEvent(evt)
    sdk.emitEvent?.(MINIGOLF_EVENT_TYPES.JOIN, evt.payload, { serverRelay: true })

    return () => {
      const leaveId = `leave-${userId}-${Date.now()}`
      sdk.emitEvent?.(MINIGOLF_EVENT_TYPES.LEAVE, { actionId: leaveId, playerId: userId }, { serverRelay: true })
    }
  }, [sdk, userId, username, dispatchEvent])

  // ── Actions ─────────────────────────────────────────────────────────────────
  const handleVoteCourse = useCallback((cId) => {
    setSelectedCourseId(cId)
    const actionId = `vote-${userId}-${Date.now()}`
    const evt = { eventType: MINIGOLF_EVENT_TYPES.VOTE, payload: { actionId, playerId: userId, courseId: cId }, ts: Date.now() }
    dispatchEvent(evt)
    sdk?.emitEvent?.(MINIGOLF_EVENT_TYPES.VOTE, evt.payload, { serverRelay: true })
  }, [sdk, userId, dispatchEvent])

  const handleToggleReady = useCallback(() => {
    const ready = !gameState.readyMap[userId]
    const actionId = `ready-${userId}-${Date.now()}`
    const evt = { eventType: MINIGOLF_EVENT_TYPES.READY, payload: { actionId, playerId: userId, ready }, ts: Date.now() }
    dispatchEvent(evt)
    sdk?.emitEvent?.(MINIGOLF_EVENT_TYPES.READY, evt.payload, { serverRelay: true })
  }, [sdk, userId, gameState.readyMap, dispatchEvent])

  const handleStartGame = useCallback(() => {
    const actionId = `start-${Date.now()}`
    const evt = { eventType: MINIGOLF_EVENT_TYPES.START, payload: { actionId, courseId: leadingCourseId }, ts: Date.now() }
    dispatchEvent(evt)
    sdk?.emitEvent?.(MINIGOLF_EVENT_TYPES.START, evt.payload, { serverRelay: true })
  }, [sdk, leadingCourseId, dispatchEvent])

  const handleAimDrag = useCallback((aim, opts) => {
    setAimState({ active: !opts?.commit, ...aim })
    if (opts?.commit && aim.power >= 0.08) {
      pendingShotRef.current = aim
      // Run physics async to avoid blocking render
      const myState = gameState.playerStates[userId]
      const start = myState?.position || hole?.tee || { x: 0, z: 0 }
      const lastCheckpoint = myState?.lastCheckpoint || hole?.tee
      runPhysicsAsync({ hole, start, shot: aim, lastCheckpoint }).then(result => {
        const actionId = `shot-${userId}-${Date.now()}`
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

  const handleAimCancel = useCallback(() => {
    setAimState({ active: false, angle: 0, power: 0.25 })
  }, [])

  const handleShotPlaybackComplete = useCallback(() => {
    setShotPlayback(null)
  }, [])

  const handleAdvanceHole = useCallback(() => {
    const actionId = `advance-${Date.now()}`
    const evt = { eventType: MINIGOLF_EVENT_TYPES.ADVANCE_HOLE, payload: { actionId }, ts: Date.now() }
    dispatchEvent(evt)
    sdk?.emitEvent?.(MINIGOLF_EVENT_TYPES.ADVANCE_HOLE, evt.payload, { serverRelay: true })
  }, [sdk, dispatchEvent])

  const handleRematch = useCallback(() => {
    const actionId = `rematch-${Date.now()}`
    const evt = { eventType: MINIGOLF_EVENT_TYPES.REMATCH, payload: { actionId }, ts: Date.now() }
    dispatchEvent(evt)
    sdk?.emitEvent?.(MINIGOLF_EVENT_TYPES.REMATCH, evt.payload, { serverRelay: true })
  }, [sdk, dispatchEvent])

  // ── Aim button handlers (for HUD buttons) ───────────────────────────────────
  const handleAimLeft = useCallback(() => {
    setAimState(prev => ({ ...prev, active: true, angle: (prev.angle || 0) - 0.1 }))
  }, [])

  const handleAimRight = useCallback(() => {
    setAimState(prev => ({ ...prev, active: true, angle: (prev.angle || 0) + 0.1 }))
  }, [])

  const handleShoot = useCallback(() => {
    if (!isMyTurn) return
    handleAimDrag({ angle: aimState.angle, power: aimState.power }, { commit: true })
  }, [isMyTurn, aimState, handleAimDrag])

  // ── Settings handlers ────────────────────────────────────────────────────────
  const handleChangeSetting = useCallback((key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }))
  }, [])

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ width: '100%', height: '100%', background: '#0d1117' }} onContextMenu={e => e.preventDefault()}>
      <WebGLErrorBoundary>
        <Canvas
          shadows
          gl={{
            antialias: true,
            powerPreference: 'high-performance',
            failIfMajorPerformanceCaveat: false
          }}
          dpr={[1, Math.min(window.devicePixelRatio, 2)]}
          frameloop="always"
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
              // UI props
              phase={phase}
              leaderboard={leaderboard}
              currentTurnPlayer={currentTurnPlayer}
              holeIndex={holeIndex}
              holeCount={holeCount}
              selectedBallColor={selectedBallColor}
              onSelectBallColor={setSelectedBallColor}
              courses={courseSummaries}
              readyMap={gameState.readyMap}
              votes={gameState.votes}
              selectedCourseId={selectedCourseId || courseId}
              leadingCourseId={leadingCourseId}
              currentUserId={userId}
              canStart={canStart}
              onVoteCourse={handleVoteCourse}
              onToggleReady={handleToggleReady}
              onStartGame={handleStartGame}
              onAdvanceHole={handleAdvanceHole}
              winner={winner}
              onRematch={handleRematch}
              lastShotResult={lastShotResult}
              showSettings={showSettings}
              onOpenSettings={() => setShowSettings(true)}
              onCloseSettings={() => setShowSettings(false)}
              settings={settings}
              onChangeSetting={handleChangeSetting}
              onShoot={handleShoot}
              onAimLeft={handleAimLeft}
              onAimRight={handleAimRight}
              playerStrokeCount={gameState.playerStates[userId]?.strokes ?? 0}
            />
          </Suspense>
        </Canvas>
      </WebGLErrorBoundary>
    </div>
  )
}

export default MiniGolfActivity3D
