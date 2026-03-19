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
import {
  MINIGOLF_PHASES,
  MINIGOLF_EVENT_TYPES,
  PLAYER_COLORS,
  BALL_COLOR_OPTIONS,
  MINIGOLF_POWERUP_DEFS
} from './minigolf/constants'
import { DEFAULT_BALL_RADIUS } from './minigolf/constants'
import { buildAimLinePoints, getSurfaceColor, getHazardColor, getAutoLiftY, toVector3 } from './minigolf/scene-utils'
import { sampleMovingHazardPosition, simulateShot } from './minigolf/physics'
import {
  buildMiniGolfCameraFrame,
  cloneMiniGolfCameraOffset,
  getMiniGolfCameraInteractionPause,
  getMiniGolfCameraTargetVector,
  shouldResetMiniGolfCamera
} from './minigolf/camera'
import {
  MiniGolfBallVfx,
  MiniGolfCupCelebration,
  MiniGolfShotImpactBursts
} from './minigolf/MiniGolfVfx3D'
import {
  MiniGolfBackdrop,
  MiniGolfSceneryObjects,
  MiniGolfSurfaceAccent
} from './minigolf/EnvironmentArt'
import { useMiniGolfSound } from './MiniGolfSoundManager.jsx'

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
const CONE_GEO     = new THREE.ConeGeometry(1, 2.6, 7)
const SMALL_SPHERE_GEO = new THREE.SphereGeometry(1, 12, 12)

// Ball radius in world units (matches physics collision)
const BALL_R = DEFAULT_BALL_RADIUS  // 0.34 – physics collision radius

// Visual render radius – slightly smaller than physics radius so the ball
// looks proportionate on a ~40-unit wide course (real golf ball ≈ 1.1% of course width)
// 0.22 / 40 ≈ 1.1% which matches real minigolf proportions
const BALL_VISUAL_R = 0.22

// ─── Ball texture cache ───────────────────────────────────────────────────────
const ballTextureCache = new Map()
const surfaceTextureCache = new Map()
const createStripedTexture = (baseColor, accentColor, scale = 128) => {
  const key = `${baseColor}-${accentColor}-${scale}`
  if (surfaceTextureCache.has(key)) return surfaceTextureCache.get(key)
  const canvas = document.createElement('canvas')
  canvas.width = scale
  canvas.height = scale
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = baseColor
  ctx.fillRect(0, 0, scale, scale)
  for (let i = 0; i < 16; i += 1) {
    const y = (i / 16) * scale
    ctx.fillStyle = i % 2 === 0 ? `${accentColor}88` : `${accentColor}44`
    ctx.fillRect(0, y, scale, scale / 18)
  }
  for (let i = 0; i < 90; i += 1) {
    ctx.fillStyle = 'rgba(255,255,255,0.08)'
    ctx.beginPath()
    ctx.arc(Math.random() * scale, Math.random() * scale, 1 + Math.random() * 2, 0, Math.PI * 2)
    ctx.fill()
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(2.5, 2.5)
  surfaceTextureCache.set(key, texture)
  return texture
}

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

const buildSurfaceTexture = (surfaceType, palette) => {
  if (surfaceType === 'ice') return createStripedTexture('#dff5ff', '#8fd4ff')
  if (surfaceType === 'sand') return createStripedTexture('#ccb37b', '#edd7a2')
  if (surfaceType === 'boost') return createStripedTexture('#2f836a', '#86f6d2')
  if (surfaceType === 'sticky') return createStripedTexture('#4b3458', '#a855f7')
  if (surfaceType === 'rough') return createStripedTexture(palette?.rough || '#2d6a43', '#0f3f22')
  return createStripedTexture(palette?.fairway || '#67bb6b', '#b3ef9c')
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
  const wallTexture = useMemo(() => createStripedTexture(palette?.wall || '#e2edf9', palette?.accent || '#ff8b5c'), [palette?.wall, palette?.accent])
  const wallMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: palette?.wall || '#e2edf9', map: wallTexture, roughness: 0.52, metalness: 0.18
  }), [palette?.wall, wallTexture])
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

  if (obstacle?.variant === 'powerup-barricade') {
    return (
      <group position={[obstacle.position.x, h * 0.5 + 0.04, obstacle.position.z]}>
        <mesh castShadow receiveShadow scale={[w, h, d]}>
          <primitive object={BOX_GEO} attach="geometry" />
          <meshStandardMaterial color="#f97316" emissive="#fb923c" emissiveIntensity={0.24} roughness={0.46} metalness={0.34} />
        </mesh>
        <mesh position={[0, h * 0.2, 0]} castShadow>
          <cylinderGeometry args={[0.14, 0.14, h * 1.2, 10]} />
          <meshStandardMaterial color="#fed7aa" />
        </mesh>
      </group>
    )
  }

  return (
    <group position={[obstacle.position.x, h * 0.5 + 0.02, obstacle.position.z]}>
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
  const refs = useRef([])
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    refs.current.forEach((node, index) => {
      const hazard = hazards[index]
      if (!node || !hazard) return
      if (hazard.type === 'black-hole') {
        node.rotation.y += 0.05
        node.position.y = getAutoLiftY(index, 0.04) + Math.sin(t * 4 + index) * 0.015
      } else if (hazard.type === 'ghost') {
        node.position.y = getAutoLiftY(index, 0.04) + Math.sin(t * 3 + index) * 0.05
      }
    })
  })
  return hazards.map((h, index) => {
    const color = getHazardColor(h.type, palette)
    return (
      <group key={h.id} ref={(node) => { refs.current[index] = node }} position={[h.position.x, getAutoLiftY(index, 0.04), h.position.z]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[h.size.x, h.size.z]} />
          <meshBasicMaterial color={color} transparent opacity={h.type === 'void' ? 0.88 : 0.64} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-4} depthWrite={false} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
          <ringGeometry args={[Math.max(h.size.x, h.size.z) * 0.28, Math.max(h.size.x, h.size.z) * 0.46, 30]} />
          <meshBasicMaterial color={h.type === 'black-hole' ? '#d8b4fe' : palette.accent} transparent opacity={0.3} polygonOffset polygonOffsetFactor={-3} polygonOffsetUnits={-5} depthWrite={false} />
        </mesh>
        {h.type === 'black-hole' && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
            <torusGeometry args={[Math.max(h.size.x, h.size.z) * 0.22, 0.11, 16, 40]} />
            <meshStandardMaterial color="#7c3aed" emissive="#7c3aed" emissiveIntensity={0.45} />
          </mesh>
        )}
      </group>
    )
  })
})

const SceneryObjects = React.memo(({ scenery = [], palette = {} }) => {
  return scenery.map((item, index) => {
    const key = `${item.type || 'prop'}-${index}`
    const base = [item.x || 0, 0, item.z || 0]

    if (item.type === 'tower' || item.type === 'smokestack') {
      return (
        <group key={key} position={base}>
          <mesh position={[0, 3, 0]} castShadow>
            <boxGeometry args={[1.9, 6, 1.9]} />
            <meshStandardMaterial color={palette.wall || '#cbd5e1'} metalness={0.35} roughness={0.55} />
          </mesh>
          <mesh position={[0, 6.4, 0]} castShadow>
            <cylinderGeometry args={[1.05, 1.2, 0.95, 18]} />
            <meshStandardMaterial color={palette.accent || '#ff8b5c'} emissive={palette.accent || '#ff8b5c'} emissiveIntensity={0.16} />
          </mesh>
        </group>
      )
    }

    if (item.type === 'billboard' || item.type === 'aurora') {
      return (
        <group key={key} position={base}>
          <mesh position={[0, 2.45, 0]} castShadow>
            <boxGeometry args={[4.4, 2.4, 0.18]} />
            <meshStandardMaterial color={palette.accent || '#ff8b5c'} emissive={palette.accent || '#ff8b5c'} emissiveIntensity={0.18} roughness={0.32} />
          </mesh>
          <mesh position={[0, 0.9, 0]}>
            <boxGeometry args={[0.18, 1.8, 0.18]} />
            <meshStandardMaterial color="#d8dee9" />
          </mesh>
        </group>
      )
    }

    if (item.type === 'iceberg' || item.type === 'ice-spire') {
      return (
        <group key={key} position={base}>
          <mesh position={[0, 1.6, 0]} castShadow scale={[1, 1 + (index % 3) * 0.16, 1]}>
            <primitive object={CONE_GEO} attach="geometry" />
            <meshStandardMaterial color="#e0f2fe" roughness={0.16} metalness={0.08} />
          </mesh>
        </group>
      )
    }

    if (item.type === 'anvil' || item.type === 'forge') {
      return (
        <group key={key} position={base}>
          <mesh position={[0, 0.9, 0]} castShadow>
            <boxGeometry args={[2.5, 1.2, 1.7]} />
            <meshStandardMaterial color="#52525b" roughness={0.62} metalness={0.28} />
          </mesh>
          <mesh position={[0, 1.52, 0]} castShadow>
            <boxGeometry args={[1.18, 0.34, 2.2]} />
            <meshStandardMaterial color={palette.accent || '#ff8b5c'} emissive={palette.accent || '#ff8b5c'} emissiveIntensity={0.14} />
          </mesh>
        </group>
      )
    }

    return (
      <mesh key={key} position={[base[0], 0.9, base[2]]} castShadow>
        <primitive object={SMALL_SPHERE_GEO} attach="geometry" />
        <meshStandardMaterial color={palette.wall || '#cbd5e1'} roughness={0.58} metalness={0.16} />
      </mesh>
    )
  })
})

const AmbientBackdrop = React.memo(({ course, hole, palette = {} }) => {
  const stars = useMemo(() => Array.from({ length: 34 }, (_, index) => ({
    id: index,
    x: (Math.sin(index * 2.3) * 0.5 + 0.5) * ((hole?.bounds?.maxX || 20) - (hole?.bounds?.minX || -20)) + (hole?.bounds?.minX || -20),
    y: 6 + (index % 7) * 1.4,
    z: (Math.cos(index * 3.1) * 0.5 + 0.5) * ((hole?.bounds?.maxZ || 12) - (hole?.bounds?.minZ || -12)) + (hole?.bounds?.minZ || -12),
    scale: 0.12 + (index % 4) * 0.05
  })), [hole])
  const skyColor = palette.backgroundTop || '#1f355c'
  const horizonColor = palette.backgroundBottom || '#091223'

  return (
    <group>
      <mesh position={[0, 18, 0]}>
        <sphereGeometry args={[68, 24, 24, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshBasicMaterial color={skyColor} side={THREE.BackSide} fog={false} />
      </mesh>
      <mesh position={[0, -1.8, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[26, 40, 48]} />
        <meshBasicMaterial color={horizonColor} transparent opacity={0.18} />
      </mesh>
      {course?.environment === 'city' || course?.environment === 'space' || course?.environment === 'snow'
        ? stars.map((star) => (
          <mesh key={star.id} position={[star.x, star.y, star.z]}>
            <primitive object={SMALL_SPHERE_GEO} attach="geometry" />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.65} />
          </mesh>
        ))
        : null}
    </group>
  )
})

// ─── Surfaces ─────────────────────────────────────────────────────────────────
const SurfaceLayer = React.memo(({ surfaces = [], palette }) => {
  return surfaces.map((s, index) => {
    const texture = buildSurfaceTexture(s.type, palette)
    return (
      <group key={s.id} position={toVector3(s.position, getAutoLiftY(index, 0.02))}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[s.size.x, s.size.z]} />
          <meshStandardMaterial
            map={texture}
            color={getSurfaceColor(s.type, palette)}
            roughness={s.type === 'ice' ? 0.16 : 0.82}
            metalness={s.type === 'ice' ? 0.18 : 0.05}
            polygonOffset
            polygonOffsetFactor={-1}
            polygonOffsetUnits={-2}
          />
        </mesh>
      </group>
    )
  })
})

const PowerupPickups = React.memo(({ powerups = [] }) => {
  const refs = useRef([])

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    refs.current.forEach((mesh, index) => {
      if (!mesh) return
      mesh.position.y = 0.65 + Math.sin(t * 2.2 + index) * 0.14
      mesh.rotation.y += 0.025
      mesh.rotation.x = Math.sin(t * 1.4 + index) * 0.18
    })
  })

  return powerups.map((powerup, index) => {
    const color = powerup?.color || '#ffffff'
    return (
      <group
        key={powerup.id}
        ref={(node) => { refs.current[index] = node }}
        position={[powerup.position.x, 0.65, powerup.position.z]}
      >
        {powerup.type === 'barricade'
          ? (
            <mesh castShadow>
              <boxGeometry args={[0.64, 0.5, 0.32]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.28} roughness={0.26} metalness={0.54} />
            </mesh>
            )
          : powerup.type === 'ghost-ball'
            ? (
              <mesh castShadow>
                <sphereGeometry args={[0.34, 18, 18]} />
                <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.36} transparent opacity={0.82} roughness={0.2} metalness={0.4} />
              </mesh>
              )
            : (
              <mesh castShadow>
                <octahedronGeometry args={[0.4, 0]} />
                <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.32} roughness={0.26} metalness={0.54} />
              </mesh>
              )}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.57, 0]}>
          <ringGeometry args={[0.36, 0.58, 28]} />
          <meshBasicMaterial color={color} transparent opacity={0.65} polygonOffset polygonOffsetFactor={-4} polygonOffsetUnits={-6} depthWrite={false} />
        </mesh>
      </group>
    )
  })
})

// ─── Cup ──────────────────────────────────────────────────────────────────────
const Cup = React.memo(({ cup, palette }) => {
  const accentMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: palette?.accent || '#ff8b5c',
    emissive: palette?.accent || '#ff8b5c',
    emissiveIntensity: 0.25
  }), [palette?.accent])

  return (
    <group position={[cup.x, 0.06, cup.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <primitive object={RING_GEO} attach="geometry" />
        <meshStandardMaterial color={palette?.accent || '#ff8b5c'} emissive={palette?.accent || '#ff8b5c'} emissiveIntensity={0.25} polygonOffset polygonOffsetFactor={-4} polygonOffsetUnits={-6} />
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
const PlayerBall = React.memo(({
  player,
  isActive,
  targetPosition,
  isPlayback,
  playbackRef,
  trailEnabled = true,
  particlesEnabled = true,
  trailResetKey = 'default'
}) => {
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
        <meshBasicMaterial color={isActive ? '#ffffff' : player.color || '#888888'} transparent opacity={isActive ? 0.9 : 0.4} polygonOffset polygonOffsetFactor={-5} polygonOffsetUnits={-7} depthWrite={false} />
      </mesh>
      <MiniGolfBallVfx
        player={player}
        position={smoothPos.current}
        isActive={isActive}
        isMoving={isPlayback}
        trailEnabled={trailEnabled}
        particlesEnabled={particlesEnabled}
        ballVisualRadius={BALL_VISUAL_R}
        resetKey={trailResetKey}
      />
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
const PlayerBalls = React.memo(({
  players,
  activePlayerId,
  playbackRef,
  trailEnabled = true,
  particlesEnabled = true,
  trailResetKey = 'default'
}) => {
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
        trailEnabled={trailEnabled}
        particlesEnabled={particlesEnabled}
        trailResetKey={`${trailResetKey}:${player.id}`}
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

// ─── Hole preview overlay (shown for ~3 s before play starts on each hole) ───
function HolePreviewOverlay({ hole, holeIndex, course, onDone }) {
  const [progress, setProgress] = useState(0)
  const DURATION = 3200 // ms

  useEffect(() => {
    setProgress(0)
    const start = performance.now()
    let raf
    const tick = () => {
      const p = Math.min(1, (performance.now() - start) / DURATION)
      setProgress(p)
      if (p < 1) { raf = requestAnimationFrame(tick) } else { onDone?.() }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [hole?.id, onDone])

  if (!hole) return null
  const palette = course?.palette || {}
  const accent = palette.accent || '#38bdf8'
  const bg = palette.backgroundBottom || '#091223'

  // Fade in then fade out
  const opacity = progress < 0.15
    ? progress / 0.15
    : progress > 0.78
      ? 1 - (progress - 0.78) / 0.22
      : 1

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 30,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      background: `${bg}ee`,
      opacity,
      pointerEvents: 'none',
      fontFamily: 'system-ui,-apple-system,sans-serif',
      transition: 'opacity 0.1s',
    }}>
      <div style={{ fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: accent, marginBottom: 10 }}>
        {course?.name || 'Course'}
      </div>
      <div style={{ fontSize: 52, fontWeight: 900, color: '#ffffff', letterSpacing: '-0.04em', lineHeight: 1 }}>
        Hole {holeIndex + 1}
      </div>
      <div style={{ fontSize: 16, color: accent, marginTop: 8, fontWeight: 600 }}>
        Par {hole.par || 3}
      </div>
      {hole.name && (
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginTop: 6 }}>
          {hole.name}
        </div>
      )}

      {/* Mini top-down layout sketch */}
      <div style={{ marginTop: 24, position: 'relative', width: 220, height: 120 }}>
        <svg width="220" height="120" style={{ position: 'absolute', inset: 0 }}>
          {/* Bounds outline */}
          {(() => {
            const b = hole.bounds || { minX: -18, maxX: 18, minZ: -12, maxZ: 12 }
            const scaleX = 200 / Math.max(1, b.maxX - b.minX)
            const scaleZ = 100 / Math.max(1, b.maxZ - b.minZ)
            const toSvg = (x, z) => ({
              sx: 10 + (x - b.minX) * scaleX,
              sy: 10 + (z - b.minZ) * scaleZ,
            })
            const tee = toSvg(hole.tee?.x || 0, hole.tee?.z || 0)
            const cup = toSvg(hole.cup?.x || 0, hole.cup?.z || 0)
            return (
              <>
                <rect x="10" y="10" width="200" height="100" rx="4"
                  fill={`${palette.rough || '#2d6a43'}44`}
                  stroke={`${accent}66`} strokeWidth="1.5" />
                {/* Surfaces */}
                {(hole.surfaces || []).map((s, i) => {
                  const p = toSvg(s.position?.x || 0, s.position?.z || 0)
                  const w = (s.size?.x || 2) * scaleX
                  const h = (s.size?.z || 2) * scaleZ
                  const surfColor = s.type === 'ice' ? '#a8dcff' : s.type === 'sand' ? '#c8ad6f' : s.type === 'boost' ? '#78f4d7' : s.type === 'sticky' ? '#6b5a7b' : `${palette.fairway || '#5cae63'}88`
                  return <rect key={i} x={p.sx - w / 2} y={p.sy - h / 2} width={w} height={h} fill={surfColor} opacity="0.7" rx="2" />
                })}
                {/* Obstacles */}
                {(hole.obstacles || []).map((o, i) => {
                  const p = toSvg(o.position?.x || 0, o.position?.z || 0)
                  const w = Math.max(3, (o.size?.x || 1) * scaleX)
                  const h = Math.max(3, (o.size?.z || 1) * scaleZ)
                  return <rect key={i} x={p.sx - w / 2} y={p.sy - h / 2} width={w} height={h} fill={palette.wall || '#e2edf9'} opacity="0.8" rx="1" />
                })}
                {/* Moving hazards */}
                {(hole.movingHazards || []).map((h2, i) => {
                  const p = toSvg(h2.position?.x || 0, h2.position?.z || 0)
                  return <circle key={i} cx={p.sx} cy={p.sy} r="5" fill={palette.accent || '#ff8b5c'} opacity="0.7" />
                })}
                {/* Tee */}
                <circle cx={tee.sx} cy={tee.sy} r="5" fill="#4ade80" stroke="#fff" strokeWidth="1.5" />
                {/* Cup */}
                <circle cx={cup.sx} cy={cup.sy} r="5" fill={accent} stroke="#fff" strokeWidth="1.5" />
                {/* Line tee→cup */}
                <line x1={tee.sx} y1={tee.sy} x2={cup.sx} y2={cup.sy}
                  stroke={`${accent}55`} strokeWidth="1" strokeDasharray="4 3" />
              </>
            )
          })()}
        </svg>
        <div style={{ position: 'absolute', bottom: -18, left: 0, right: 0, display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>
          <span>● Tee</span><span>● Cup</span>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ marginTop: 36, width: 180, height: 3, background: 'rgba(255,255,255,0.12)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${progress * 100}%`, height: '100%', background: accent, transition: 'width 0.05s linear' }} />
      </div>
    </div>
  )
}

const HoleTransitionCloud = React.memo(function HoleTransitionCloud({ hole, transitionKey, color = '#ffffff' }) {
  const refs = useRef([])
  const startedAtRef = useRef(performance.now())
  const particles = useMemo(() => {
    const bounds = hole?.bounds || { minX: -18, maxX: 18, minZ: -12, maxZ: 12 }
    return Array.from({ length: 40 }, (_, index) => ({
      id: `${transitionKey}-${index}`,
      x: bounds.minX + ((index * 17) % 100) / 100 * (bounds.maxX - bounds.minX),
      z: bounds.minZ + ((index * 29) % 100) / 100 * (bounds.maxZ - bounds.minZ),
      lift: 0.8 + (index % 5) * 0.18,
      drift: -0.7 + (index % 7) * 0.22,
    }))
  }, [hole?.bounds, transitionKey])

  useEffect(() => {
    startedAtRef.current = performance.now()
  }, [transitionKey])

  useFrame(() => {
    const progress = Math.min(1, (performance.now() - startedAtRef.current) / 900)
    refs.current.forEach((node, index) => {
      const particle = particles[index]
      if (!node || !particle) return
      node.position.set(particle.x + particle.drift * progress, 0.2 + particle.lift * progress, particle.z)
      node.scale.setScalar((1 - progress) * 0.5)
    })
  })

  return (
    <group>
      {particles.map((particle, index) => (
        <mesh key={particle.id} ref={(node) => { refs.current[index] = node }} position={[particle.x, 0.2, particle.z]}>
          <primitive object={SMALL_SPHERE_GEO} attach="geometry" />
          <meshBasicMaterial color={color} transparent opacity={0.42} depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
})

const HoleAssembly = React.memo(function HoleAssembly({ holeKey, children }) {
  const groupRef = useRef()
  const progressRef = useRef(0)
  useEffect(() => {
    progressRef.current = 0
  }, [holeKey])
  useFrame((_, delta) => {
    if (!groupRef.current) return
    progressRef.current = Math.min(1, progressRef.current + delta * 1.9)
    const p = progressRef.current
    groupRef.current.position.y = (1 - p) * 2.6
    groupRef.current.scale.setScalar(0.86 + p * 0.14)
  })
  return <group ref={groupRef}>{children}</group>
})

// ─── Path playback controller ────────────────────────────────────────────────
function ShotPlaybackController({ playbackRef, path = [], finalPosition, onComplete }) {
  const lastRollSoundRef = useRef(0)
  const doneRef = useRef(false)
  const startedAtRef = useRef(0)

  useEffect(() => {
    lastRollSoundRef.current = 0
    doneRef.current = false
    startedAtRef.current = performance.now()
  }, [path, finalPosition])

  useFrame(() => {
    if (doneRef.current || !playbackRef?.current) return
    if (!Array.isArray(path) || path.length === 0) {
      playbackRef.current = {
        ...playbackRef.current,
        position: finalPosition || playbackRef.current.position,
      }
      doneRef.current = true
      queueMicrotask(() => onComplete?.())
      return
    }

    const elapsedSeconds = ((performance.now() - startedAtRef.current) / 1000) * 1.85
    let currentIndex = path.findIndex((entry) => Number(entry?.t || 0) >= elapsedSeconds)
    if (currentIndex <= 0) currentIndex = 1
    if (currentIndex < 0) currentIndex = path.length - 1
    const prevPoint = path[Math.max(0, currentIndex - 1)] || path[0]
    const nextPoint = path[Math.min(currentIndex, path.length - 1)] || path[path.length - 1]
    const prevTime = Number(prevPoint?.t || 0)
    const nextTime = Number(nextPoint?.t || prevTime)
    const span = Math.max(0.0001, nextTime - prevTime)
    const mix = clamp((elapsedSeconds - prevTime) / span, 0, 1)
    const point = {
      x: prevPoint.x + (nextPoint.x - prevPoint.x) * mix,
      z: prevPoint.z + (nextPoint.z - prevPoint.z) * mix,
    }
    playbackRef.current = {
      ...playbackRef.current,
      position: point,
    }

    const lookAhead = path[Math.min(currentIndex + 1, path.length - 1)] || nextPoint
    const dx = (lookAhead?.x || point.x) - point.x
    const dz = (lookAhead?.z || point.z) - point.z
    const motion = Math.hypot(dx, dz)
    const now = performance.now()
    if (motion > 0.01 && now - lastRollSoundRef.current > 110) {
      lastRollSoundRef.current = now
      playRollSound()
    }

    if (elapsedSeconds >= Number(path[path.length - 1]?.t || 0)) {
      playbackRef.current = {
        ...playbackRef.current,
        position: finalPosition || point,
      }
      doneRef.current = true
      queueMicrotask(() => onComplete?.())
      return
    }
  })

  return null
}

function SceneCamera({ followTarget, teePosition, cup, holeBounds, playbackRef, orbitControlsRef, cameraMode = 'follow', resetKey }) {
  const camRef = useRef()
  const offsetRef = useRef(cloneMiniGolfCameraOffset(cameraMode))
  const hasBootedRef = useRef(false)
  const isInteractingRef = useRef(false)
  const pauseFollowUntilRef = useRef(0)
  const resetKeyRef = useRef(null)

  useEffect(() => {
    if (!camRef.current || !orbitControlsRef?.current) return
    const ctrl = orbitControlsRef.current
    // On hole change, snap to the tee position so the camera starts at the
    // beginning of the new hole rather than drifting from the old cup.
    const snapTarget = teePosition || followTarget
    if (!snapTarget) return
    const nextTarget = getMiniGolfCameraTargetVector(snapTarget)
    const baseOffset = cloneMiniGolfCameraOffset(cameraMode)
    const shouldReset = shouldResetMiniGolfCamera({
      hasBooted: hasBootedRef.current,
      lastResetKey: resetKeyRef.current,
      nextResetKey: resetKey
    })

    if (shouldReset) {
      hasBootedRef.current = true
      resetKeyRef.current = resetKey
      ctrl.target.copy(nextTarget)
      camRef.current.position.copy(nextTarget).add(baseOffset)
      offsetRef.current.copy(baseOffset)
      ctrl.update()
      pauseFollowUntilRef.current = 0
    }
  }, [cameraMode, followTarget, teePosition, orbitControlsRef, resetKey])

  useEffect(() => {
    const ctrl = orbitControlsRef?.current
    if (!ctrl?.listenToKeyEvents) return undefined
    ctrl.listenToKeyEvents(window)
    return () => ctrl.stopListenToKeyEvents?.()
  }, [orbitControlsRef])

  useFrame(() => {
    const liveTarget = playbackRef?.current?.position || followTarget
    if (!camRef.current || !orbitControlsRef?.current || !liveTarget) return
    const ctrl = orbitControlsRef.current
    const frame = buildMiniGolfCameraFrame({
      cameraMode,
      liveTarget,
      cup,
      holeBounds,
      controlsTarget: ctrl.target,
      cameraPosition: camRef.current.position,
      offset: offsetRef.current,
      isInteracting: isInteractingRef.current,
      pauseFollowUntil: pauseFollowUntilRef.current,
      now: performance.now()
    })
    ctrl.target.copy(frame.nextTarget)
    camRef.current.position.copy(frame.nextCameraPosition)
    offsetRef.current.copy(frame.nextOffset)
    ctrl.update()
  })

  return (
    <>
      <PerspectiveCamera ref={camRef} makeDefault position={[0, 12, 14]} fov={44} near={0.1} far={200} />
      <OrbitControls
        ref={orbitControlsRef}
        enablePan
        enableDamping
        dampingFactor={0.08}
        minDistance={6}
        maxDistance={30}
        maxPolarAngle={Math.PI / 2.1}
        onChange={() => {
          if (!camRef.current || !orbitControlsRef?.current) return
          offsetRef.current.copy(camRef.current.position).sub(orbitControlsRef.current.target)
        }}
        onStart={() => {
          isInteractingRef.current = true
        }}
        onEnd={() => {
          isInteractingRef.current = false
          pauseFollowUntilRef.current = performance.now() + getMiniGolfCameraInteractionPause(cameraMode)
          if (!camRef.current || !orbitControlsRef?.current) return
          offsetRef.current.copy(camRef.current.position).sub(orbitControlsRef.current.target)
        }}
        keys={{
          LEFT: 'ArrowLeft',
          UP: 'ArrowUp',
          RIGHT: 'ArrowRight',
          BOTTOM: 'ArrowDown',
        }}
        keyPanSpeed={18}
        // Left button = disabled (used for aiming), middle = pan, right = orbit
        mouseButtons={{
          LEFT: null,
          MIDDLE: THREE.MOUSE.PAN,
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
  visiblePowerups = [],
  cameraMode = 'follow',
  trailEnabled = true,
  particlesEnabled = true,
  powerSensitivity = 1,
  lastShotResult = null,
  onBlackHoleProximityChange,
}) {
  const palette = course?.palette || {}
  const activePlayer = players.find(p => p.id === activePlayerId) || players[0]
  const dragRef = useRef({ active: false, angle: 0, power: 0.25 })
  const orbitControlsRef = useRef()

  // playbackRef holds current live physics position (mutable, no re-render)
  const playbackRef = useRef(null)
  const [isPlayingBack, setIsPlayingBack] = useState(false)

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
      path: shotPlayback.path || [],
      position: shotPlayback.path?.[0] || shotPlayback.startPos || { x: 0, z: 0 },
    }
    setIsPlayingBack(true)
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

  // Camera follows active player's ball (or playback position)
  const playbackState = playbackRef.current
  const cameraTarget = activePlayer?.position || hole?.tee || { x: 0, z: 0 }
  const liveBallPosition = playbackState && activePlayer && playbackState.playerId === activePlayer.id
    ? playbackState.position
    : activePlayer?.position

  useFrame(() => {
    if (!onBlackHoleProximityChange || !hole || !liveBallPosition) return
    const blackHoles = [...(hole.hazards || []), ...(hole.dynamicHazards || [])].filter((hazard) => hazard.type === 'black-hole')
    if (!blackHoles.length) {
      onBlackHoleProximityChange(0)
      return
    }
    let strongest = 0
    blackHoles.forEach((hazard) => {
      const dx = (liveBallPosition.x || 0) - (hazard.position?.x || 0)
      const dz = (liveBallPosition.z || 0) - (hazard.position?.z || 0)
      const distance = Math.hypot(dx, dz)
      const range = Math.max(hazard.size?.x || 2.6, hazard.size?.z || 2.6) * 4.5
      strongest = Math.max(strongest, Math.max(0, 1 - distance / range))
    })
    onBlackHoleProximityChange(strongest)
  })

  // Ground size matches course bounds
  const groundW = hole ? (hole.bounds?.maxX - hole.bounds?.minX + 8) || 50 : 50
  const groundD = hole ? (hole.bounds?.maxZ - hole.bounds?.minZ + 8) || 32 : 32
  const groundCX = hole ? ((hole.bounds?.maxX + hole.bounds?.minX) / 2) || 0 : 0
  const groundCZ = hole ? ((hole.bounds?.maxZ + hole.bounds?.minZ) / 2) || 0 : 0
  const aimPowerScale = Math.max(0.35, Number(powerSensitivity) || 1)

  return (
    <>
      <color attach="background" args={[palette.backgroundBottom || '#091223']} />
      <fog attach="fog" args={[palette.backgroundBottom || '#091223', 28, 70]} />
      <MiniGolfBackdrop course={course} hole={hole} palette={palette} />
      <ambientLight intensity={1.1} />
      <directionalLight
        position={[6, 12, 8]} intensity={2.2} castShadow
        shadow-mapSize-width={1024} shadow-mapSize-height={1024}
        shadow-camera-left={-25} shadow-camera-right={25}
        shadow-camera-top={20} shadow-camera-bottom={-20}
      />
      <hemisphereLight args={[palette.backgroundTop || '#1f355c', '#102514', 0.65]} />

      <SceneCamera
        followTarget={cameraTarget}
        teePosition={hole?.tee}
        cup={hole?.cup}
        holeBounds={hole?.bounds}
        playbackRef={playbackRef}
        orbitControlsRef={orbitControlsRef}
        cameraMode={cameraMode}
        resetKey={hole?.id}
      />

      {/* Ground – sized to course bounds */}
      <mesh
        position={[groundCX, 0, groundCZ]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[groundW, groundD]} />
        <meshStandardMaterial color={palette.rough || '#2d6a43'} roughness={0.98} />
      </mesh>
      <MiniGolfSurfaceAccent course={course} hole={hole} palette={palette} />
      <HoleTransitionCloud hole={hole} transitionKey={hole?.id} color={palette.accent || '#ffffff'} />

      {hole && <>
        <HoleAssembly holeKey={hole.id}>
          <SurfaceLayer surfaces={hole.surfaces} palette={palette} />
          {[...(hole.obstacles || []), ...(hole.dynamicObstacles || [])].map(obs => (
            <ObstacleMesh key={obs.id} obstacle={obs} palette={palette} />
          ))}
          <HazardPads hazards={[...(hole.hazards || []), ...(hole.dynamicHazards || [])]} palette={palette} />
          <MovingHazards hazards={[...(hole.movingHazards || []), ...((hole.dynamicHazards || []).filter((hazard) => hazard?.movement))]} palette={palette} />
          <PowerupPickups powerups={visiblePowerups} />
          <MiniGolfSceneryObjects scenery={hole.scenery} palette={palette} environment={course?.environment} />
          <Cup cup={hole.cup} palette={palette} />
          <MiniGolfCupCelebration
            cup={hole.cup}
            resultType={lastShotResult?.type}
            triggerKey={shotPlayback?.actionId || lastShotResult?.label || null}
            accentColor={palette.accent || '#38bdf8'}
          />
        </HoleAssembly>
      </>}

      <PlayerBalls
        players={players}
        activePlayerId={activePlayerId}
        playbackRef={playbackRef}
        trailEnabled={trailEnabled}
        particlesEnabled={particlesEnabled}
        trailResetKey={hole?.id || 'hole'}
      />

      <MiniGolfShotImpactBursts
        shotPlayback={shotPlayback}
        color={activePlayer?.color || palette.accent || '#ffffff'}
        particlesEnabled={particlesEnabled}
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
            const aim = { angle: Math.atan2(dz, dx), power: clamp((dist / 8.0) * aimPowerScale, 0.05, 1) }
            dragRef.current = { active: true, ...aim }
            onAimDrag?.(aim)
          }}
          onPointerMove={e => {
            if (!dragRef.current.active || !activePlayer?.position) return
            e.stopPropagation()
            const dx = activePlayer.position.x - e.point.x
            const dz = activePlayer.position.z - e.point.z
            const dist = Math.hypot(dx, dz)
            const aim = { angle: Math.atan2(dz, dx), power: clamp((dist / 8.0) * aimPowerScale, 0.05, 1) }
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

      {isPlayingBack && shotPlayback && (
        <ShotPlaybackController
          playbackRef={playbackRef}
          path={shotPlayback.path || []}
          finalPosition={shotPlayback.finalPosition}
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

const buildShotResultNotice = (result) => {
  const resultType = result?.resultType || 'settled'
  const baseLabel = resultType === 'black-hole'
    ? 'black hole · +20 strokes · replacement ball deployed'
    : result?.surfaceType === 'sticky' && resultType === 'settled'
      ? 'sticky trap'
      : resultType.replace(/-/g, ' ')
  if (result?.awardedPowerup?.label) {
    return { type: resultType, label: `${baseLabel} · picked up ${result.awardedPowerup.label}` }
  }
  if (result?.consumedPowerup?.label) {
    return { type: resultType, label: `${baseLabel} · used ${result.consumedPowerup.label}` }
  }
  if (result?.spawnedObstacles?.length) {
    return { type: resultType, label: `${baseLabel} · blockade deployed` }
  }
  if (result?.spawnedHazards?.length) {
    return { type: resultType, label: `${baseLabel} · ghost loose` }
  }
  return { type: resultType, label: baseLabel }
}

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
  activePowerup,
  powerupInventory,
  availablePowerupCount,
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
      <style>{`
        @keyframes minigolfHudFloat {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-4px); }
        }
        @keyframes minigolfHudPulse {
          0%, 100% { box-shadow: 0 0 0 rgba(56,189,248,0.0); }
          50% { box-shadow: 0 0 28px rgba(56,189,248,0.18); }
        }
        @keyframes minigolfHudSlideIn {
          from { opacity: 0; transform: translate(-50%, 12px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
      `}</style>

      {/* ── LOBBY ── */}
      {phase === MINIGOLF_PHASES.LOBBY && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'auto' }}>
          <div style={{ width: Math.min(window.innerWidth - 40, 600), maxHeight: Math.min(window.innerHeight - 40, 560), background: 'rgba(13,17,23,0.97)', border: '1px solid #1f2937', borderRadius: 10, padding: 20, overflow: 'auto', color: '#f9fafb', animation: 'minigolfHudPulse 3.2s ease-in-out infinite' }}>
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
                {courses.map(course => {
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
                      <div style={{ fontWeight: 600 }}>{course.name}{isVoted ? '  ✓' : isLeading ? '  ★' : ''}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                        {course.holeCount} holes · par {course.parTotal}
                      </div>
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
                Middle-drag pans, right-drag rotates, arrow keys pan
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── PLAYING HUD ── */}
      {phase === MINIGOLF_PHASES.PLAYING && (
        <>
          {/* Top-left: hole info */}
          <div style={{ position: 'absolute', top: 12, left: 12, width: 200, background: 'rgba(13,17,23,0.88)', border: '1px solid #1f2937', borderRadius: 8, padding: '10px 12px', color: '#f9fafb', pointerEvents: 'auto', animation: 'minigolfHudFloat 3.4s ease-in-out infinite' }}>
            <div style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 4 }}>Hole {holeIndex + 1}</div>
            <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 2 }}>Par {par}</div>
            <div style={{ fontSize: 13, color: strokeCount <= par ? '#4ade80' : '#f87171' }}>Strokes: {strokeCount}</div>
            <div style={{ marginTop: 8, fontSize: 11, color: activePowerup ? '#fbbf24' : '#9ca3af', lineHeight: 1.35 }}>
              {activePowerup
                ? `Loaded: ${activePowerup.label}`
                : `${availablePowerupCount || 0} pickups remaining`}
            </div>
            <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
              {Array.from({ length: 4 }, (_, index) => {
                const entry = powerupInventory?.[index] || null
                return (
                  <div key={`slot-${index}`} style={{
                    minHeight: 34,
                    borderRadius: 6,
                    border: `1px solid ${entry?.color || '#374151'}`,
                    background: entry ? `${entry.color}22` : '#111827',
                    color: entry?.color || '#6b7280',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 10,
                    textAlign: 'center',
                    padding: '0 4px',
                  }}>
                    {entry ? entry.label : 'Empty'}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Top-right: scoreboard */}
          <div style={{ position: 'absolute', top: 12, right: 12, width: 190, background: 'rgba(13,17,23,0.88)', border: '1px solid #1f2937', borderRadius: 8, padding: '10px 12px', color: '#f9fafb', pointerEvents: 'auto', animation: 'minigolfHudFloat 3.9s ease-in-out infinite' }}>
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
            <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', background: 'rgba(13,17,23,0.88)', border: '1px solid #374151', borderRadius: 8, padding: '6px 16px', color: '#38bdf8', whiteSpace: 'nowrap', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, animation: 'minigolfHudFloat 2.8s ease-in-out infinite, minigolfHudPulse 2.4s ease-in-out infinite' }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: currentTurnPlayer.color || '#888' }} />
              {currentTurnPlayer.username || 'Player'}'s turn &nbsp;·&nbsp; Hole {holeIndex + 1} &nbsp;·&nbsp; Par {par}
            </div>
          )}

          {/* Shot result toast */}
          {lastShotResult && (() => {
            const resultStr = lastShotResult?.type || lastShotResult
            const isGood = ['hole_in_one', 'birdie', 'eagle', 'cup', 'hole', 'powerup'].includes(resultStr)
            const toastColor = resultStr === 'sticky' ? '#c084fc' : isGood ? '#4ade80' : resultStr === 'out_of_bounds' ? '#f87171' : '#fbbf24'
            const label = lastShotResult?.label || resultStr?.replace(/_/g, ' ') || ''
            return (
              <div style={{ position: 'absolute', top: 60, left: '50%', transform: 'translateX(-50%)', background: 'rgba(13,17,23,0.95)', border: `1px solid ${toastColor}`, borderRadius: 8, padding: '8px 20px', color: toastColor, fontSize: 16, fontWeight: 'bold', whiteSpace: 'nowrap', animation: 'minigolfHudSlideIn 180ms ease-out' }}>
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
                Direction: {Math.round(((aimAngle * 180) / Math.PI + 360) % 360)}° &nbsp;·&nbsp; Middle-drag pans, right-drag rotates
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
                  <span style={{ fontSize: 13, color: '#9ca3af', width: 100 }}>Particles</span>
                  <button onClick={() => onChangeSetting('particles', !settings?.particles)} style={{ padding: '4px 14px', background: settings?.particles ? '#14532d' : '#374151', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                    {settings?.particles ? 'On' : 'Off'}
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <span style={{ fontSize: 13, color: '#9ca3af', width: 100 }}>Music</span>
                  <button onClick={() => onChangeSetting('music', !settings?.music)} style={{ padding: '4px 14px', background: settings?.music ? '#14532d' : '#374151', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                    {settings?.music ? 'On' : 'Off'}
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
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 12, lineHeight: 1.45 }}>
                  `follow` tracks the active ball, `overhead` keeps a tactical top-down view, and `free` stops camera recentering so you can move around without it snapping back.
                </div>
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
              <div key={entry.id} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', marginBottom: 6,
                background: i === 0 ? '#78350f' : '#1f2937', borderRadius: 4,
                fontSize: 13, color: i === 0 ? '#fbbf24' : '#e5e7eb',
              }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: entry.color || '#888', flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{i + 1}. {entry.username || 'Player'}</span>
                <span>{entry.strokesThisHole} stroke{entry.strokesThisHole !== 1 ? 's' : ''} (total: {entry.totalStrokes})</span>
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
              <div key={entry.id} style={{
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
  const guestIdRef = useRef(`guest-${Math.random().toString(36).slice(2)}`)
  const userId   = currentUser?.id || guestIdRef.current
  const username = currentUser?.username || 'Player'
  const initialJoinColorRef = useRef(BALL_COLOR_OPTIONS[0])
  const {
    playEvent,
    startBackgroundMusic,
    stopBackgroundMusic,
    setEnvironment,
    stopEnvironment,
    setMusicMuted,
    setBlackHoleProximity,
    musicMuted,
    initialized: soundReady
  } = useMiniGolfSound()

  const containerRef = useRef(null)  // DOM node for HUD portal (VoltCraft pattern)

  const [gameState, setGameState]       = useState(createInitialMiniGolfState)
  const [aimState, setAimState]         = useState({ active: false, angle: 0, power: 0.25 })
  const [shotPlayback, setShotPlayback] = useState(null)
  const [lastShotResult, setLastShotResult] = useState(null)
  const [selectedCourseId, setSelectedCourseId] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showHolePreview, setShowHolePreview] = useState(false)
  const [myColor, setMyColor]           = useState(BALL_COLOR_OPTIONS[0])
  // Track game clock for physics (so moving hazards are at correct position)
  const gameClockRef = useRef(0)
  useEffect(() => {
    const id = setInterval(() => { gameClockRef.current += 0.1 }, 100)
    return () => clearInterval(id)
  }, [])
  const [settings, setSettings]         = useState({
    ballColor: BALL_COLOR_OPTIONS[0],
    trail: true,
    particles: true,
    music: true,
    cameraMode: 'follow',
    powerSensitivity: 1.0,
  })

  const seenEventsRef  = useRef(new Set())
  const pendingShotRef = useRef(null)
  const persistState = useCallback((nextState, cue = 'minigolf_state') => {
    if (!sdk) return
    sdk.updateState?.({ miniGolf: nextState }, { serverRelay: true, cue })
  }, [sdk])

  // ── Derived state ────────────────────────────────────────────────────────────
  const phase          = gameState.phase
  const courseId       = gameState.courseId
  const holeIndex      = gameState.holeIndex
  const course         = useMemo(() => getMiniGolfCourse(courseId), [courseId])
  const hole           = useMemo(() => {
    const baseHole = getMiniGolfHole(courseId, holeIndex)
    return {
      ...baseHole,
      dynamicObstacles: gameState.dynamicObstacles || [],
      dynamicHazards: gameState.dynamicHazards || []
    }
  }, [courseId, gameState.dynamicHazards, gameState.dynamicObstacles, holeIndex])
  const holeCount      = course?.holes?.length || 1
  const leaderboard    = useMemo(() => getMiniGolfLeaderboard(gameState), [gameState])
  const myPlayerState  = gameState.playerStates?.[userId] || null
  const myPowerupInventory = myPlayerState?.powerupInventory || []
  const myActivePowerup = myPowerupInventory[0] || null
  const currentTurnPlayer = gameState.players.find(p => p.id === gameState.currentTurnPlayerId) || null
  const isMyTurn       = gameState.currentTurnPlayerId === userId && phase === MINIGOLF_PHASES.PLAYING
  const winner         = gameState.players.find(p => p.id === gameState.winnerId) || null
  const leadingCourseId = useMemo(() => resolveMiniGolfCourseId(gameState), [gameState])
  const canStart       = gameState.players.length >= 1 && Object.values(gameState.readyMap).some(Boolean)
  const visiblePowerups = useMemo(
    () => (hole?.powerups || []).filter((powerup) => !gameState.collectedPowerups?.[powerup.id]).map((powerup) => ({
      ...powerup,
      ...(MINIGOLF_POWERUP_DEFS[powerup.type] || null)
    })),
    [hole, gameState.collectedPowerups]
  )

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

  useEffect(() => {
    setMusicMuted(!settings.music)
  }, [setMusicMuted, settings.music])

  useEffect(() => {
    if (!soundReady || !settings.music) return undefined
    const trackName = phase === MINIGOLF_PHASES.LOBBY
      ? 'lobby'
      : phase === MINIGOLF_PHASES.PLAYING
        ? 'playing'
        : phase === MINIGOLF_PHASES.HOLE_SUMMARY
          ? 'summary'
          : 'finished'
    startBackgroundMusic(trackName)
    return () => stopBackgroundMusic()
  }, [phase, settings.music, soundReady, startBackgroundMusic, stopBackgroundMusic])

  useEffect(() => {
    if (!soundReady || !settings.music) return undefined
    const environmentKey = course?.environment === 'industrial'
      ? 'industrial'
      : course?.environment === 'city'
        ? 'city'
        : course?.environment === 'snow'
          ? 'snow'
          : course?.environment === 'goo'
            ? 'water'
            : 'default'
    setEnvironment(environmentKey)
    return () => stopEnvironment()
  }, [course?.environment, settings.music, setEnvironment, soundReady, stopEnvironment])

  // ── SDK event handling ───────────────────────────────────────────────────────
  const dispatchEvent = useCallback((evt) => {
    const id = buildMiniGolfEventId(evt)
    if (!rememberMiniGolfEvent(seenEventsRef, id)) return
    setGameState(prev => applyMiniGolfEvent(prev, evt))
  }, [])

  const applyLocalEvent = useCallback((evt, cue = 'minigolf_event') => {
    const id = buildMiniGolfEventId(evt)
    if (!rememberMiniGolfEvent(seenEventsRef, id)) return
    setGameState((prev) => {
      const next = applyMiniGolfEvent(prev, evt)
      if (next !== prev) persistState(next, cue)
      return next
    })
  }, [persistState])

  useEffect(() => {
    if (!sdk?.subscribeServerState) return undefined
    const off = sdk.subscribeServerState((serverState) => {
      const nextState = serverState?.miniGolf
      if (!nextState || typeof nextState !== 'object' || !Array.isArray(nextState.players) || !nextState.phase) return
      setGameState(nextState)
    })
    return () => {
      try { off?.() } catch {}
    }
  }, [sdk])

  useEffect(() => {
    if (!sdk) return
    const off = sdk.on?.('event', (evt) => {
      if (!evt?.eventType?.startsWith('minigolf:')) return
      dispatchEvent(evt)
      if (evt.eventType === MINIGOLF_EVENT_TYPES.SHOT) {
        const { playerId, shot, result } = evt.payload || {}
        if (!result || playerId === userId) return  // own shots handled in handleAimDrag
        // For other players' shots, use the authoritative playback path
        const playerState = gameState.playerStates[playerId]
        const startPos = playerState?.position || hole?.tee || { x: 0, z: 0 }
        setShotPlayback({
          actionId: evt.payload.actionId,
          playerId,
          startPos,
          angle: shot?.angle || 0,
          power: shot?.power || 0.5,
          path: result.path || [],
          finalPosition: result.finalPosition,
        })
        if (result.resultType) {
          if (result.resultType === 'cup') playEvent('holeComplete')
          else if (['hazard-reset', 'lava-reset', 'black-hole'].includes(result.resultType)) playEvent('hazardReset')
          else if (result.collisionCount > 0) playEvent('wallHit')
          else if (result.surfaceType === 'sticky') playEvent('sticky')
          setLastShotResult(buildShotResultNotice(result))
          setTimeout(() => setLastShotResult(null), 3000)
        }
      }
    })
    return () => off?.()
  }, [sdk, dispatchEvent, userId, gameState.playerStates, hole, playEvent])

  // ── Show hole preview when hole changes during PLAYING phase ─────────────────
  const prevHoleIndexRef = useRef(-1)
  useEffect(() => {
    if (phase !== MINIGOLF_PHASES.PLAYING) return
    if (holeIndex !== prevHoleIndexRef.current) {
      prevHoleIndexRef.current = holeIndex
      setShowHolePreview(true)
    }
  }, [phase, holeIndex])

  // ── Join on mount ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!sdk) return
    const actionId = `join-${userId}-${Date.now()}`
    const evt = {
      eventType: MINIGOLF_EVENT_TYPES.JOIN,
      payload: { actionId, playerId: userId, username, color: initialJoinColorRef.current },
      ts: Date.now()
    }
    applyLocalEvent(evt, 'minigolf_join')
    sdk.emitEvent?.(MINIGOLF_EVENT_TYPES.JOIN, evt.payload, { serverRelay: true })
    return () => {
      sdk.emitEvent?.(MINIGOLF_EVENT_TYPES.LEAVE, { actionId: `leave-${userId}-${Date.now()}`, playerId: userId }, { serverRelay: true })
    }
  }, [applyLocalEvent, sdk, userId, username])

  // ── Actions ──────────────────────────────────────────────────────────────────
  const handleVoteCourse = useCallback((cId) => {
    playEvent('vote')
    setSelectedCourseId(cId)
    const evt = { eventType: MINIGOLF_EVENT_TYPES.VOTE, payload: { actionId: `vote-${userId}-${Date.now()}`, playerId: userId, courseId: cId }, ts: Date.now() }
    applyLocalEvent(evt, 'minigolf_vote')
    sdk?.emitEvent?.(MINIGOLF_EVENT_TYPES.VOTE, evt.payload, { serverRelay: true })
  }, [applyLocalEvent, playEvent, sdk, userId])

  const handleToggleReady = useCallback(() => {
    playEvent('ready')
    const ready = !gameState.readyMap[userId]
    const evt = { eventType: MINIGOLF_EVENT_TYPES.READY, payload: { actionId: `ready-${userId}-${Date.now()}`, playerId: userId, ready }, ts: Date.now() }
    applyLocalEvent(evt, 'minigolf_ready')
    sdk?.emitEvent?.(MINIGOLF_EVENT_TYPES.READY, evt.payload, { serverRelay: true })
  }, [applyLocalEvent, gameState.readyMap, playEvent, sdk, userId])

  const handleStartGame = useCallback(() => {
    playEvent('start')
    const evt = { eventType: MINIGOLF_EVENT_TYPES.START, payload: { actionId: `start-${Date.now()}`, courseId: leadingCourseId }, ts: Date.now() }
    applyLocalEvent(evt, 'minigolf_start')
    sdk?.emitEvent?.(MINIGOLF_EVENT_TYPES.START, evt.payload, { serverRelay: true })
  }, [applyLocalEvent, leadingCourseId, playEvent, sdk])

  const handleChangeColor = useCallback((color) => {
    playEvent('click')
    setMyColor(color)
    setSettings(prev => ({ ...prev, ballColor: color }))
    const evt = { eventType: MINIGOLF_EVENT_TYPES.COLOR_CHANGE, payload: { actionId: `color-${userId}-${Date.now()}`, playerId: userId, color }, ts: Date.now() }
    applyLocalEvent(evt, 'minigolf_color')
    sdk?.emitEvent?.(MINIGOLF_EVENT_TYPES.COLOR_CHANGE, evt.payload, { serverRelay: true })
  }, [applyLocalEvent, playEvent, sdk, userId])

  const handleAimDrag = useCallback((aim, opts) => {
    setAimState({ active: !opts?.commit, ...aim })
    if (opts?.commit && aim.power >= 0.08) {
      playEvent('putt', { intensity: 0.8 + aim.power })
      pendingShotRef.current = aim
      const myState = gameState.playerStates[userId]
      const start = myState?.position || hole?.tee || { x: 0, z: 0 }
      const lastCheckpoint = myState?.lastCheckpoint || hole?.tee
      const activePowerup = myState?.powerupInventory?.[0] || null
      const collectedPowerupIds = Object.entries(gameState.collectedPowerups || {})
        .filter(([, collected]) => !!collected)
        .map(([powerupId]) => powerupId)

      runPhysicsAsync({ hole, start, shot: aim, lastCheckpoint, activePowerup, collectedPowerupIds, gameClockSeconds: gameClockRef.current }).then(result => {
        if (result.resultType === 'cup') playEvent('holeComplete')
        else if (['hazard-reset', 'lava-reset', 'black-hole'].includes(result.resultType)) playEvent('hazardReset')
        else if (result.collisionCount > 0) playEvent('wallHit')
        else if (result.surfaceType === 'sticky') playEvent('sticky')
        else if (result.surfaceType === 'ice') playEvent('ice')
        else if (result.surfaceType === 'sand') playEvent('sand')
        else if (result.surfaceType === 'boost') playEvent('boost')
        if (result.awardedPowerup) playEvent('powerup')
        const actionId = `shot-${userId}-${Date.now()}`
        setShotPlayback({
          actionId,
          playerId: userId,
          startPos: { ...start },
          angle: aim.angle,
          power: aim.power,
          path: result.path || [],
          finalPosition: result.finalPosition,
        })
        const evt = {
          eventType: MINIGOLF_EVENT_TYPES.SHOT,
          payload: { actionId, playerId: userId, shot: aim, result },
          ts: Date.now()
        }
        setLastShotResult(buildShotResultNotice(result))
        setTimeout(() => setLastShotResult(null), 3000)
        applyLocalEvent(evt, 'minigolf_shot')
        sdk?.emitEvent?.(MINIGOLF_EVENT_TYPES.SHOT, evt.payload, { serverRelay: true })
      })
    }
  }, [applyLocalEvent, gameState.collectedPowerups, gameState.playerStates, hole, playEvent, sdk, userId])

  const handleAimCancel   = useCallback(() => setAimState({ active: false, angle: 0, power: 0.25 }), [])
  const handleShotPlaybackComplete = useCallback(() => {
    setShotPlayback((current) => {
      if (current?.playerId && current?.finalPosition) {
        setGameState((prev) => {
          const existing = prev.playerStates?.[current.playerId]
          if (!existing) return prev
          return {
            ...prev,
            playerStates: {
              ...prev.playerStates,
              [current.playerId]: {
                ...existing,
                position: { ...current.finalPosition },
              },
            },
          }
        })
      }
      return null
    })
  }, [])

  const handleAdvanceHole = useCallback(() => {
    playEvent('transition')
    const evt = { eventType: MINIGOLF_EVENT_TYPES.ADVANCE_HOLE, payload: { actionId: `advance-${Date.now()}` }, ts: Date.now() }
    applyLocalEvent(evt, 'minigolf_advance_hole')
    sdk?.emitEvent?.(MINIGOLF_EVENT_TYPES.ADVANCE_HOLE, evt.payload, { serverRelay: true })
  }, [applyLocalEvent, playEvent, sdk])

  const handleRematch = useCallback(() => {
    playEvent('win')
    const evt = { eventType: MINIGOLF_EVENT_TYPES.REMATCH, payload: { actionId: `rematch-${Date.now()}` }, ts: Date.now() }
    applyLocalEvent(evt, 'minigolf_rematch')
    sdk?.emitEvent?.(MINIGOLF_EVENT_TYPES.REMATCH, evt.payload, { serverRelay: true })
  }, [applyLocalEvent, playEvent, sdk])

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
              visiblePowerups={visiblePowerups}
              cameraMode={settings.cameraMode}
              trailEnabled={settings.trail}
              particlesEnabled={settings.particles}
              powerSensitivity={settings.powerSensitivity}
              lastShotResult={lastShotResult}
              onAimDrag={handleAimDrag}
              onAimCancel={handleAimCancel}
              onShotPlaybackComplete={handleShotPlaybackComplete}
              onBlackHoleProximityChange={setBlackHoleProximity}
            />
          </Suspense>
        </Canvas>
      </WebGLErrorBoundary>

      {/* Hole preview overlay – shown for ~3s when a new hole starts */}
      {showHolePreview && phase === MINIGOLF_PHASES.PLAYING && hole && (
        <HolePreviewOverlay
          hole={hole}
          holeIndex={holeIndex}
          course={course}
          onDone={() => setShowHolePreview(false)}
        />
      )}

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
        activePowerup={myActivePowerup}
        powerupInventory={myPowerupInventory}
        availablePowerupCount={visiblePowerups.length}
        onAdvanceHole={handleAdvanceHole}
        isLastHole={holeIndex >= holeCount - 1}
        winner={winner}
        onRematch={handleRematch}
      />
    </div>
  )
}

export default MiniGolfActivity3D
