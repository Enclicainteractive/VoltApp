import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import GameCanvasShell from './shared/GameCanvasShell'

const TABLE_WIDTH = 960
const TABLE_HEIGHT = 540
const BALL_RADIUS = 14
const POCKET_RADIUS = 25
const CUSHION = 18
const KITCHEN_X = TABLE_WIDTH * 0.26
const CUE_START = { x: TABLE_WIDTH * 0.24, y: TABLE_HEIGHT * 0.5 }
const FOOT_SPOT_X = TABLE_WIDTH * 0.72
const MAX_STEPS = 1800
const FRAME_SAMPLE_EVERY = 3
const BASE_FRICTION = 0.991
const MIN_SPEED = 0.028
const MAX_POWER = 100
const MIN_POWER = 18
const PLAYER_GROUPS = ['solids', 'stripes']
const TABLE_WORLD_SCALE = 48
const TABLE_WORLD_WIDTH = TABLE_WIDTH / TABLE_WORLD_SCALE
const TABLE_WORLD_HEIGHT = TABLE_HEIGHT / TABLE_WORLD_SCALE
const BALL_WORLD_RADIUS = BALL_RADIUS / TABLE_WORLD_SCALE

const BALL_LAYOUT = [
  { number: 1, group: 'solids', color: '#facc15' },
  { number: 2, group: 'solids', color: '#2563eb' },
  { number: 3, group: 'solids', color: '#dc2626' },
  { number: 4, group: 'solids', color: '#7c3aed' },
  { number: 5, group: 'solids', color: '#f97316' },
  { number: 6, group: 'solids', color: '#16a34a' },
  { number: 7, group: 'solids', color: '#7c2d12' },
  { number: 8, group: 'eight', color: '#0f172a' },
  { number: 9, group: 'stripes', color: '#facc15' },
  { number: 10, group: 'stripes', color: '#2563eb' },
  { number: 11, group: 'stripes', color: '#dc2626' },
  { number: 12, group: 'stripes', color: '#7c3aed' },
  { number: 13, group: 'stripes', color: '#f97316' },
  { number: 14, group: 'stripes', color: '#16a34a' },
  { number: 15, group: 'stripes', color: '#7c2d12' },
]

const POCKETS = [
  { x: 0, y: 0, name: 'top-left' },
  { x: TABLE_WIDTH / 2, y: 0, name: 'top-middle' },
  { x: TABLE_WIDTH, y: 0, name: 'top-right' },
  { x: 0, y: TABLE_HEIGHT, name: 'bottom-left' },
  { x: TABLE_WIDTH / 2, y: TABLE_HEIGHT, name: 'bottom-middle' },
  { x: TABLE_WIDTH, y: TABLE_HEIGHT, name: 'bottom-right' },
]

const tableToWorld = (x, y) => ([
  (x - TABLE_WIDTH / 2) / TABLE_WORLD_SCALE,
  0,
  (y - TABLE_HEIGHT / 2) / TABLE_WORLD_SCALE,
])

const createFeltTexture = () => {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
  gradient.addColorStop(0, '#0b6b43')
  gradient.addColorStop(0.55, '#0a814d')
  gradient.addColorStop(1, '#075934')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  for (let i = 0; i < 1800; i += 1) {
    const alpha = 0.02 + Math.random() * 0.045
    ctx.fillStyle = `rgba(255,255,255,${alpha})`
    ctx.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, 1, 1)
  }

  for (let i = 0; i < 120; i += 1) {
    ctx.strokeStyle = `rgba(0,0,0,${0.02 + Math.random() * 0.03})`
    ctx.beginPath()
    ctx.moveTo(0, i * 4.4)
    ctx.lineTo(canvas.width, i * 4.4 + 32)
    ctx.stroke()
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(4.5, 2.6)
  texture.anisotropy = 8
  return texture
}

const createWoodTexture = () => {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
  gradient.addColorStop(0, '#7c4a22')
  gradient.addColorStop(0.5, '#4a2d17')
  gradient.addColorStop(1, '#2c160c')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  for (let i = 0; i < 64; i += 1) {
    const y = i * 8
    ctx.strokeStyle = `rgba(255,255,255,${0.02 + Math.random() * 0.02})`
    ctx.lineWidth = 1 + Math.random() * 2
    ctx.beginPath()
    ctx.moveTo(0, y + Math.random() * 5)
    ctx.bezierCurveTo(
      canvas.width * 0.25, y + Math.random() * 16,
      canvas.width * 0.75, y - Math.random() * 16,
      canvas.width, y + Math.random() * 8
    )
    ctx.stroke()
  }

  for (let i = 0; i < 18; i += 1) {
    const x = 24 + Math.random() * (canvas.width - 48)
    const y = 24 + Math.random() * (canvas.height - 48)
    ctx.fillStyle = 'rgba(55, 28, 11, 0.22)'
    ctx.beginPath()
    ctx.ellipse(x, y, 18 + Math.random() * 14, 10 + Math.random() * 8, Math.random() * Math.PI, 0, Math.PI * 2)
    ctx.fill()
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(2.8, 2.8)
  texture.anisotropy = 8
  return texture
}

function PoolCameraRig() {
  useFrame(({ camera, clock }) => {
    const t = clock.getElapsedTime()
    camera.position.x = Math.sin(t * 0.12) * 0.55
    camera.position.y = 8.55 + Math.sin(t * 0.08) * 0.08
    camera.position.z = 6.95 + Math.cos(t * 0.11) * 0.18
    camera.lookAt(0, -0.35, 0)
  })
  return null
}

function PoolRoomScene({ balls, activeGroup }) {
  const feltTexture = useMemo(() => createFeltTexture(), [])
  const woodTexture = useMemo(() => createWoodTexture(), [])
  const visibleBalls = useMemo(() => balls.filter((ball) => !ball.pocketed), [balls])

  useEffect(() => {
    return () => {
      feltTexture?.dispose?.()
      woodTexture?.dispose?.()
    }
  }, [feltTexture, woodTexture])

  return (
    <>
      <color attach="background" args={['#061116']} />
      <fog attach="fog" args={['#061116', 12, 34]} />
      <ambientLight intensity={0.9} color="#9dd9ff" />
      <hemisphereLight args={['#8fe9c8', '#091118', 0.85]} />
      <spotLight position={[0, 8.5, 0]} angle={0.42} penumbra={0.65} intensity={22} color="#fff2d2" castShadow />
      <spotLight position={[-4.8, 4.5, 5.5]} angle={0.38} penumbra={0.7} intensity={7} color="#7dd3fc" />
      <spotLight position={[4.8, 4.2, -5.5]} angle={0.38} penumbra={0.7} intensity={6} color="#86efac" />
      <PoolCameraRig />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.86, 0]} receiveShadow>
        <planeGeometry args={[30, 30]} />
        <meshStandardMaterial color="#14212c" roughness={0.98} metalness={0.04} />
      </mesh>

      <mesh position={[0, 3.8, -10]} receiveShadow>
        <boxGeometry args={[24, 10, 0.45]} />
        <meshStandardMaterial color="#13222d" roughness={0.94} metalness={0.06} />
      </mesh>
      <mesh position={[-12, 2.8, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <boxGeometry args={[20, 8, 0.45]} />
        <meshStandardMaterial color="#0e1921" roughness={0.96} metalness={0.04} />
      </mesh>
      <mesh position={[12, 2.8, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <boxGeometry args={[20, 8, 0.45]} />
        <meshStandardMaterial color="#10202a" roughness={0.96} metalness={0.04} />
      </mesh>

      <mesh position={[0, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[TABLE_WORLD_WIDTH + 1.48, 0.72, TABLE_WORLD_HEIGHT + 1.48]} />
        <meshStandardMaterial map={woodTexture} color="#5a3418" roughness={0.72} metalness={0.12} />
      </mesh>

      <mesh position={[0, 0.26, 0]} receiveShadow>
        <boxGeometry args={[TABLE_WORLD_WIDTH + 0.56, 0.26, TABLE_WORLD_HEIGHT + 0.56]} />
        <meshStandardMaterial color="#2f1a0d" roughness={0.8} metalness={0.1} />
      </mesh>

      <mesh position={[0, 0.34, 0]} receiveShadow>
        <boxGeometry args={[TABLE_WORLD_WIDTH, 0.12, TABLE_WORLD_HEIGHT]} />
        <meshStandardMaterial map={feltTexture} color="#0b7f4a" roughness={0.88} metalness={0.05} />
      </mesh>

      {POCKETS.map((pocket) => {
        const [x, , z] = tableToWorld(pocket.x, pocket.y)
        return (
          <group key={pocket.name} position={[x, 0.33, z]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[POCKET_RADIUS / TABLE_WORLD_SCALE, 24]} />
              <meshStandardMaterial color="#020617" roughness={0.62} metalness={0.24} />
            </mesh>
            <mesh position={[0, -0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[POCKET_RADIUS / TABLE_WORLD_SCALE, (POCKET_RADIUS + 8) / TABLE_WORLD_SCALE, 24]} />
              <meshBasicMaterial color="#000000" transparent opacity={0.38} />
            </mesh>
          </group>
        )
      })}

      {visibleBalls.map((ball) => {
        const [x, , z] = tableToWorld(ball.x, ball.y)
        const stripeColor = ball.striped ? new THREE.Color(ball.color) : null
        return (
          <group key={ball.id} position={[x, 0.47, z]}>
            <mesh castShadow receiveShadow>
              <sphereGeometry args={[BALL_WORLD_RADIUS, 32, 32]} />
              <meshStandardMaterial
                color={ball.number === 0 ? '#f8fafc' : ball.color}
                roughness={0.28}
                metalness={0.08}
                emissive={ball.number === 8 ? '#020617' : ball.group === activeGroup ? ball.color : '#000000'}
                emissiveIntensity={ball.number === 8 ? 0.28 : ball.group === activeGroup ? 0.18 : 0}
              />
            </mesh>
            {ball.striped ? (
              <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
                <torusGeometry args={[BALL_WORLD_RADIUS * 0.72, BALL_WORLD_RADIUS * 0.18, 18, 48]} />
                <meshStandardMaterial color={stripeColor || '#ffffff'} roughness={0.35} metalness={0.04} />
              </mesh>
            ) : null}
          </group>
        )
      })}

      <mesh position={[0, 5.8, 0]}>
        <cylinderGeometry args={[0.38, 0.44, 0.42, 24]} />
        <meshStandardMaterial color="#1e293b" metalness={0.55} roughness={0.38} />
      </mesh>
      <mesh position={[0, 5.45, 0]}>
        <cylinderGeometry args={[2.25, 2.55, 0.32, 48]} />
        <meshStandardMaterial color="#fff1c7" emissive="#ffe7a3" emissiveIntensity={0.55} transparent opacity={0.92} />
      </mesh>
    </>
  )
}

const CSS = `
.pool8 {
  --bg0: #081116;
  --bg1: #0c1c22;
  --panel: rgba(6, 20, 28, 0.88);
  --panel-strong: rgba(9, 25, 34, 0.96);
  --line: rgba(148, 163, 184, 0.14);
  --line-strong: rgba(148, 163, 184, 0.26);
  --text: #e2e8f0;
  --muted: #8ea3b6;
  --green: #22c55e;
  --green-soft: rgba(34, 197, 94, 0.16);
  --gold: #fbbf24;
  --danger: #fb7185;
  min-height: 100%;
  display: grid;
  grid-template-columns: 360px minmax(0, 1fr);
  gap: 18px;
  padding: 18px;
  color: var(--text);
  background:
    radial-gradient(circle at top left, rgba(34, 197, 94, 0.16), transparent 30%),
    radial-gradient(circle at bottom right, rgba(56, 189, 248, 0.08), transparent 34%),
    linear-gradient(180deg, var(--bg0), var(--bg1));
  overflow: auto;
  box-sizing: border-box;
}
.pool8 * { box-sizing: border-box; }
.pool8-panel,
.pool8-main {
  border-radius: 26px;
  border: 1px solid var(--line);
  background: var(--panel);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.28);
}
.pool8-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px;
}
.pool8-main {
  min-width: 0;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.pool8-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.pool8-kicker {
  margin-bottom: 6px;
  color: #86efac;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.22em;
  text-transform: uppercase;
}
.pool8-hero h2 {
  margin: 0;
  font-size: 32px;
  line-height: 0.95;
  letter-spacing: -0.04em;
}
.pool8-hero p {
  margin: 8px 0 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.45;
}
.pool8-row {
  display: flex;
  gap: 10px;
  align-items: stretch;
}
.pool8-card {
  padding: 14px;
  border-radius: 18px;
  background: rgba(15, 23, 42, 0.34);
  border: 1px solid var(--line);
}
.pool8-status {
  padding: 14px 15px;
  border-radius: 18px;
  background:
    linear-gradient(135deg, rgba(15, 23, 42, 0.92), rgba(20, 35, 51, 0.76));
  border: 1px solid var(--line-strong);
  line-height: 1.45;
}
.pool8-status strong {
  display: block;
  margin-bottom: 4px;
  color: #f8fafc;
  font-size: 14px;
}
.pool8-seat {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 18px;
  background: rgba(15, 23, 42, 0.48);
  border: 1px solid var(--line);
}
.pool8-seat.active {
  border-color: rgba(34, 197, 94, 0.52);
  box-shadow: inset 0 0 0 1px rgba(34, 197, 94, 0.22), 0 0 0 1px rgba(34, 197, 94, 0.12);
}
.pool8-avatar {
  width: 44px;
  height: 44px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  font-weight: 800;
  color: white;
  background: linear-gradient(135deg, #14532d, #22c55e);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.18);
}
.pool8-seat-meta {
  min-width: 0;
  flex: 1;
}
.pool8-seat-meta strong,
.pool8-seat-meta span {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pool8-seat-meta span {
  margin-top: 3px;
  color: var(--muted);
  font-size: 12px;
}
.pool8-btn {
  border: 1px solid transparent;
  border-radius: 13px;
  padding: 10px 14px;
  font: inherit;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  color: white;
  background: linear-gradient(135deg, #15803d, #22c55e);
  transition: transform 120ms ease, opacity 120ms ease, border-color 120ms ease;
}
.pool8-btn:hover:not(:disabled) { transform: translateY(-1px); }
.pool8-btn:disabled { opacity: 0.46; cursor: not-allowed; }
.pool8-btn.secondary {
  background: rgba(15, 23, 42, 0.84);
  color: #dbeafe;
  border-color: var(--line);
}
.pool8-btn.danger {
  background: linear-gradient(135deg, #be123c, #fb7185);
}
.pool8-grid {
  display: grid;
  gap: 10px;
}
.pool8-grid.two {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.pool8-stat {
  padding: 12px;
  border-radius: 16px;
  background: rgba(15, 23, 42, 0.42);
  border: 1px solid var(--line);
}
.pool8-stat-label {
  color: var(--muted);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
}
.pool8-stat-value {
  margin-top: 4px;
  font-size: 15px;
  font-weight: 800;
}
.pool8-controls {
  padding: 14px;
  border-radius: 20px;
  background: rgba(15, 23, 42, 0.46);
  border: 1px solid var(--line);
  display: grid;
  gap: 12px;
}
.pool8-control-header {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: var(--muted);
}
.pool8-slider {
  width: 100%;
  accent-color: #22c55e;
}
.pool8-powerbar {
  height: 10px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.88);
  overflow: hidden;
  border: 1px solid rgba(255,255,255,0.06);
}
.pool8-powerfill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #38bdf8, #22c55e, #fbbf24, #fb7185);
}
.pool8-actions {
  display: flex;
  gap: 10px;
}
.pool8-actions > * { flex: 1; }
.pool8-main-top {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  align-items: center;
}
.pool8-marquee {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.pool8-led {
  width: 12px;
  height: 12px;
  border-radius: 999px;
  background: #22c55e;
  box-shadow: 0 0 18px rgba(34, 197, 94, 0.55);
}
.pool8-led.animating {
  background: #fbbf24;
  box-shadow: 0 0 18px rgba(251, 191, 36, 0.55);
}
.pool8-led.finished {
  background: #fb7185;
  box-shadow: 0 0 18px rgba(251, 113, 133, 0.55);
}
.pool8-table-wrap {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 28px;
  overflow: hidden;
  background: linear-gradient(180deg, #071217, #09161d);
  border: 1px solid rgba(255,255,255,0.08);
  box-shadow:
    inset 0 0 0 1px rgba(255,255,255,0.1),
    inset 0 0 80px rgba(0,0,0,0.22),
    0 22px 48px rgba(0,0,0,0.24);
  user-select: none;
}
.pool8-table-wrap::after {
  content: '';
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 50% 18%, rgba(255,242,199,0.16), transparent 24%),
    linear-gradient(180deg, rgba(255,255,255,0.03), transparent 26%, transparent 74%, rgba(0,0,0,0.2));
  pointer-events: none;
  z-index: 2;
}
.pool8-table-3d {
  position: absolute;
  inset: 0;
  z-index: 0;
}
.pool8-table-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
}
.pool8-cue-overlay {
  position: absolute;
  inset: 0;
  cursor: crosshair;
  z-index: 3;
}
.pool8-cue-overlay.charging {
  cursor: grabbing;
}
.pool8-shotlog {
  display: grid;
  gap: 8px;
}
.pool8-shot-entry {
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid var(--line);
  background: rgba(15, 23, 42, 0.42);
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-size: 12px;
}
.pool8-shot-entry strong {
  display: block;
  color: #f8fafc;
}
.pool8-shot-entry span {
  color: var(--muted);
}
.pool8-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.pool8-pill {
  padding: 7px 11px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.66);
  border: 1px solid var(--line);
  color: #dbeafe;
  font-size: 12px;
}
.pool8-spectators {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.pool8-spectator {
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.58);
  border: 1px solid var(--line);
  color: var(--muted);
  font-size: 11px;
}
.pool8-footer {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.55;
}
@media (max-width: 980px) {
  .pool8 { grid-template-columns: 1fr; }
  .pool8-panel { order: 2; }
  .pool8-main { order: 1; }
}
`

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

const colorWithAlpha = (hex, alpha) => {
  const safe = String(hex || '#ffffff').replace('#', '')
  const full = safe.length === 3 ? safe.split('').map((ch) => ch + ch).join('') : safe.padEnd(6, 'f')
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const buildRackBalls = () => {
  const spacingX = BALL_RADIUS * 1.86
  const spacingY = BALL_RADIUS * 1.07
  const rackOrder = [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15]
  const rackBalls = []
  let index = 0
  for (let row = 0; row < 5; row += 1) {
    const x = FOOT_SPOT_X + row * spacingX
    const yStart = TABLE_HEIGHT / 2 - row * spacingY
    for (let col = 0; col <= row; col += 1) {
      const template = BALL_LAYOUT.find((ball) => ball.number === rackOrder[index])
      rackBalls.push({
        id: `ball-${template.number}`,
        number: template.number,
        group: template.group,
        color: template.color,
        striped: template.group === 'stripes',
        x,
        y: yStart + col * spacingY * 2,
        vx: 0,
        vy: 0,
        pocketed: false,
      })
      index += 1
    }
  }

  return [
    {
      id: 'cue',
      number: 0,
      group: 'cue',
      color: '#f8fafc',
      striped: false,
      x: CUE_START.x,
      y: CUE_START.y,
      vx: 0,
      vy: 0,
      pocketed: false,
    },
    ...rackBalls,
  ]
}

const createInitialState = () => ({
  version: 1,
  phase: 'waiting',
  players: [],
  spectators: [],
  turnPlayerId: null,
  breakerId: null,
  winnerId: null,
  balls: buildRackBalls(),
  assignments: {},
  turnGroup: null,
  lastShotSummary: 'Seat two players to start the rack.',
  shotClock: 0,
  rackNumber: 1,
  lastShot: null,
})

const sanitizePlayer = (player) => {
  if (!player || typeof player !== 'object' || !player.id) return null
  return {
    id: String(player.id),
    username: String(player.username || 'Player'),
  }
}

const sanitizeBall = (ball) => {
  if (!ball || typeof ball !== 'object') return null
  return {
    id: String(ball.id),
    number: Number(ball.number || 0),
    group: String(ball.group || 'cue'),
    color: String(ball.color || '#ffffff'),
    striped: !!ball.striped,
    x: Number(ball.x || 0),
    y: Number(ball.y || 0),
    vx: Number(ball.vx || 0),
    vy: Number(ball.vy || 0),
    pocketed: !!ball.pocketed,
  }
}

const sanitizeShot = (shot) => {
  if (!shot || typeof shot !== 'object') return null
  return {
    id: String(shot.id || ''),
    shooterId: shot.shooterId ? String(shot.shooterId) : null,
    angleDeg: Number(shot.angleDeg || 0),
    powerPct: Number(shot.powerPct || 0),
    summary: String(shot.summary || ''),
    events: Array.isArray(shot.events) ? shot.events : [],
    frames: Array.isArray(shot.frames) ? shot.frames : [],
  }
}

const sanitizeState = (incoming) => {
  const base = createInitialState()
  if (!incoming || typeof incoming !== 'object') return base
  return {
    ...base,
    version: Number(incoming.version || 1),
    phase: ['waiting', 'aiming', 'animating', 'finished'].includes(incoming.phase) ? incoming.phase : base.phase,
    players: Array.isArray(incoming.players) ? incoming.players.map(sanitizePlayer).filter(Boolean).slice(0, 2) : [],
    spectators: Array.isArray(incoming.spectators) ? incoming.spectators.map(sanitizePlayer).filter(Boolean) : [],
    turnPlayerId: incoming.turnPlayerId ? String(incoming.turnPlayerId) : null,
    breakerId: incoming.breakerId ? String(incoming.breakerId) : null,
    winnerId: incoming.winnerId ? String(incoming.winnerId) : null,
    balls: Array.isArray(incoming.balls) && incoming.balls.length ? incoming.balls.map(sanitizeBall).filter(Boolean) : base.balls,
    assignments: incoming.assignments && typeof incoming.assignments === 'object' ? incoming.assignments : {},
    turnGroup: incoming.turnGroup ? String(incoming.turnGroup) : null,
    lastShotSummary: String(incoming.lastShotSummary || base.lastShotSummary),
    shotClock: Number(incoming.shotClock || 0),
    rackNumber: Number(incoming.rackNumber || 1),
    lastShot: sanitizeShot(incoming.lastShot),
  }
}

const cloneBalls = (balls) => balls.map((ball) => ({ ...ball }))
const findBall = (balls, number) => balls.find((ball) => ball.number === number)
const getPlayerName = (players, playerId) => players.find((player) => player.id === playerId)?.username || 'Player'
const groupRemaining = (balls, group) => balls.some((ball) => ball.group === group && !ball.pocketed)

const captureFrame = (balls) => balls.map((ball) => ({
  id: ball.id,
  x: ball.x,
  y: ball.y,
  pocketed: !!ball.pocketed,
}))

const respotCueBall = (balls) => {
  const cue = findBall(balls, 0)
  if (!cue) return
  cue.pocketed = false
  cue.x = CUE_START.x
  cue.y = CUE_START.y
  cue.vx = 0
  cue.vy = 0
}

const railBounds = {
  minX: BALL_RADIUS + CUSHION,
  maxX: TABLE_WIDTH - BALL_RADIUS - CUSHION,
  minY: BALL_RADIUS + CUSHION,
  maxY: TABLE_HEIGHT - BALL_RADIUS - CUSHION,
}

const computeAim = (cueBall, point) => {
  const dx = point.x - cueBall.x
  const dy = point.y - cueBall.y
  const dist = Math.hypot(dx, dy)
  const angleDeg = Math.atan2(dy, dx) * (180 / Math.PI)
  const powerPct = clamp((dist / 270) * 100, MIN_POWER, MAX_POWER)
  return { angleDeg, powerPct }
}

const describeShot = (state, shooterId, result) => {
  const shooterName = getPlayerName(state.players, shooterId)
  if (result.cueScratch) return `${shooterName} scratched the cue ball.`
  if (result.pocketed.includes(8) && result.winnerId) {
    if (result.winnerId === shooterId) return `${shooterName} closed the rack on the 8-ball.`
    return `${shooterName} dropped the 8-ball early.`
  }
  const legal = result.pocketed.filter((number) => number > 0)
  if (!legal.length) return `${shooterName} came up dry.`
  return `${shooterName} potted ${legal.map((number) => `#${number}`).join(', ')}.`
}

const simulateShot = (balls, angleDeg, powerPct) => {
  const simBalls = cloneBalls(balls)
  const cue = findBall(simBalls, 0)
  if (!cue || cue.pocketed) {
    return {
      balls: simBalls,
      result: { firstContact: null, pocketed: [], cueScratch: false, railAfterContact: false, events: [], frames: [captureFrame(simBalls)] },
    }
  }

  const powerNorm = clamp(powerPct, MIN_POWER, MAX_POWER) / 100
  const angleRad = angleDeg * (Math.PI / 180)
  cue.vx = Math.cos(angleRad) * (15.5 * powerNorm)
  cue.vy = Math.sin(angleRad) * (15.5 * powerNorm)

  const result = {
    firstContact: null,
    pocketed: [],
    cueScratch: false,
    railAfterContact: false,
    frames: [captureFrame(simBalls)],
    events: [{ step: 0, type: 'shot', ball: 0 }],
  }

  for (let step = 0; step < MAX_STEPS; step += 1) {
    let anyMoving = false
    for (const ball of simBalls) {
      if (ball.pocketed) continue
      ball.x += ball.vx
      ball.y += ball.vy
      ball.vx *= BASE_FRICTION
      ball.vy *= BASE_FRICTION
      if (Math.abs(ball.vx) < MIN_SPEED) ball.vx = 0
      if (Math.abs(ball.vy) < MIN_SPEED) ball.vy = 0

      if (ball.x <= railBounds.minX) {
        ball.x = railBounds.minX
        ball.vx *= -0.96
        result.railAfterContact = true
        result.events.push({ step, type: 'rail', ball: ball.number })
      } else if (ball.x >= railBounds.maxX) {
        ball.x = railBounds.maxX
        ball.vx *= -0.96
        result.railAfterContact = true
        result.events.push({ step, type: 'rail', ball: ball.number })
      }
      if (ball.y <= railBounds.minY) {
        ball.y = railBounds.minY
        ball.vy *= -0.96
        result.railAfterContact = true
        result.events.push({ step, type: 'rail', ball: ball.number })
      } else if (ball.y >= railBounds.maxY) {
        ball.y = railBounds.maxY
        ball.vy *= -0.96
        result.railAfterContact = true
        result.events.push({ step, type: 'rail', ball: ball.number })
      }

      if (ball.vx || ball.vy) anyMoving = true
    }

    for (let i = 0; i < simBalls.length; i += 1) {
      const a = simBalls[i]
      if (a.pocketed) continue
      for (let j = i + 1; j < simBalls.length; j += 1) {
        const b = simBalls[j]
        if (b.pocketed) continue
        const dx = b.x - a.x
        const dy = b.y - a.y
        const distance = Math.hypot(dx, dy)
        const minDistance = BALL_RADIUS * 2
        if (!distance || distance >= minDistance) continue

        if (!result.firstContact && (a.number === 0 || b.number === 0)) {
          result.firstContact = a.number === 0 ? b.number : a.number
        }

        const nx = dx / distance
        const ny = dy / distance
        const overlap = minDistance - distance
        a.x -= nx * overlap * 0.5
        a.y -= ny * overlap * 0.5
        b.x += nx * overlap * 0.5
        b.y += ny * overlap * 0.5

        const relVel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny
        if (relVel > 0) continue
        const impulse = -relVel * 0.98
        a.vx += -impulse * nx
        a.vy += -impulse * ny
        b.vx += impulse * nx
        b.vy += impulse * ny
        result.events.push({ step, type: 'collision', a: a.number, b: b.number })
      }
    }

    for (const ball of simBalls) {
      if (ball.pocketed) continue
      const pocket = POCKETS.find((entry) => Math.hypot(ball.x - entry.x, ball.y - entry.y) <= POCKET_RADIUS)
      if (!pocket) continue
      ball.pocketed = true
      ball.vx = 0
      ball.vy = 0
      result.pocketed.push(ball.number)
      result.events.push({ step, type: 'pocket', ball: ball.number, pocket: pocket.name })
      if (ball.number === 0) {
        result.cueScratch = true
        ball.x = CUE_START.x
        ball.y = CUE_START.y
      } else {
        ball.x = -100
        ball.y = -100
      }
    }

    if (step % FRAME_SAMPLE_EVERY === 0) {
      result.frames.push(captureFrame(simBalls))
    }

    if (!anyMoving && step > 10) break
  }

  result.frames.push(captureFrame(simBalls))
  return { balls: simBalls, result }
}

const buildTurnStateAfterShot = (state, shooterId, angleDeg, powerPct) => {
  const next = sanitizeState(state)
  const shooterIndex = next.players.findIndex((player) => player.id === shooterId)
  if (shooterIndex < 0) return next

  const shooter = next.players[shooterIndex]
  const opponent = next.players[(shooterIndex + 1) % 2] || null
  const { balls: resolvedBalls, result } = simulateShot(next.balls, angleDeg, powerPct)
  const pottedNonCue = result.pocketed.filter((number) => number > 0)
  const pottedEight = result.pocketed.includes(8)
  let foul = false
  let keepTurn = false

  if (result.cueScratch) foul = true

  const shooterGroup = next.assignments[shooter.id] || null
  if (shooterGroup && result.firstContact) {
    const firstContactBall = findBall(resolvedBalls, result.firstContact) || findBall(next.balls, result.firstContact)
    const canHitEight = !groupRemaining(resolvedBalls, shooterGroup)
    if (!firstContactBall || (firstContactBall.group !== shooterGroup && !(firstContactBall.number === 8 && canHitEight))) {
      foul = true
    }
  }

  if (!shooterGroup) {
    const firstClaim = pottedNonCue.find((number) => {
      const ball = findBall(resolvedBalls, number) || findBall(next.balls, number)
      return ball && PLAYER_GROUPS.includes(ball.group)
    })
    if (firstClaim) {
      const claimedBall = findBall(resolvedBalls, firstClaim) || findBall(next.balls, firstClaim)
      next.assignments[shooter.id] = claimedBall.group
      if (opponent) {
        next.assignments[opponent.id] = claimedBall.group === 'solids' ? 'stripes' : 'solids'
      }
    }
  }

  const activeGroup = next.assignments[shooter.id] || shooterGroup
  const legalPocket = pottedNonCue.some((number) => {
    const ball = findBall(resolvedBalls, number) || findBall(next.balls, number)
    if (!ball) return false
    if (!activeGroup) return PLAYER_GROUPS.includes(ball.group)
    if (ball.number === 8) return !groupRemaining(resolvedBalls, activeGroup)
    return ball.group === activeGroup
  })

  if (pottedEight) {
    const legalEight = activeGroup && !groupRemaining(resolvedBalls, activeGroup) && !foul
    next.phase = 'finished'
    next.winnerId = legalEight ? shooter.id : opponent?.id || null
  } else {
    keepTurn = legalPocket && !foul
    next.phase = 'animating'
    next.turnPlayerId = keepTurn ? shooter.id : opponent?.id || shooter.id
  }

  next.balls = resolvedBalls.map((ball) => ({ ...ball, vx: 0, vy: 0 }))
  if (foul) respotCueBall(next.balls)
  next.turnGroup = next.assignments[next.turnPlayerId] || null

  const summaryText = describeShot(next, shooter.id, { ...result, winnerId: next.winnerId })
  next.lastShotSummary = summaryText
  next.lastShot = {
    id: `pool8:${Date.now()}:${shooter.id}`,
    shooterId: shooter.id,
    angleDeg,
    powerPct,
    summary: summaryText,
    events: result.events,
    frames: result.frames,
  }
  next.shotClock += 1
  next.version += 1
  if (!next.breakerId) next.breakerId = shooter.id

  return next
}

const buildStateAfterJoin = (state, player) => {
  const next = sanitizeState(state)
  if (next.players.some((entry) => entry.id === player.id) || next.spectators.some((entry) => entry.id === player.id)) return next
  if (next.players.length < 2) {
    next.players = [...next.players, player]
  } else {
    next.spectators = [...next.spectators, player]
  }
  if (next.players.length === 2 && next.phase === 'waiting') {
    next.phase = 'aiming'
    next.turnPlayerId = next.players[0].id
    next.breakerId = next.players[0].id
    next.lastShotSummary = `${next.players[0].username} breaks first.`
  }
  next.version += 1
  return next
}

const buildStateAfterLeave = (state, playerId) => {
  const next = sanitizeState(state)
  next.players = next.players.filter((player) => player.id !== playerId)
  next.spectators = next.spectators.filter((player) => player.id !== playerId)
  delete next.assignments[playerId]

  if (next.players.length < 2) {
    next.phase = 'waiting'
    next.turnPlayerId = next.players[0]?.id || null
    next.breakerId = next.players[0]?.id || null
    next.winnerId = null
    next.turnGroup = null
    next.balls = buildRackBalls()
    next.lastShot = null
    next.lastShotSummary = next.players.length === 1 ? `${next.players[0].username} is waiting for an opponent.` : 'Seat two players to start the rack.'
  } else if (next.turnPlayerId === playerId) {
    next.turnPlayerId = next.players[0].id
  }

  next.version += 1
  return next
}

const PoolTable = ({
  balls,
  cueAngle,
  shotPower,
  isInteractive,
  activeGroup,
  onAimAtPoint,
  onShoot,
  onReleaseShot,
  onNudgePower,
}) => {
  const tableRef = useRef(null)
  const draggingRef = useRef(false)
  const [dragVector, setDragVector] = useState(null)
  const cueBall = findBall(balls, 0)
  const liveAngle = dragVector?.angleDeg ?? cueAngle
  const livePower = dragVector?.powerPct ?? shotPower
  const aimRad = liveAngle * (Math.PI / 180)
  const aimLength = 110 + (livePower / 100) * 180
  const aimTargetX = cueBall ? cueBall.x + Math.cos(aimRad) * aimLength : 0
  const aimTargetY = cueBall ? cueBall.y + Math.sin(aimRad) * aimLength : 0
  const pullback = dragVector ? 54 + (dragVector.powerPct / 100) * 88 : 16
  const cueStartX = cueBall ? cueBall.x - Math.cos(aimRad) * pullback : 0
  const cueStartY = cueBall ? cueBall.y - Math.sin(aimRad) * pullback : 0
  const cueEndX = cueBall ? cueBall.x - Math.cos(aimRad) * (pullback + 164) : 0
  const cueEndY = cueBall ? cueBall.y - Math.sin(aimRad) * (pullback + 164) : 0

  const toWorldPoint = useCallback((event) => {
    const rect = tableRef.current?.getBoundingClientRect()
    if (!rect) return null
    const x = ((event.clientX - rect.left) / rect.width) * TABLE_WIDTH
    const y = ((event.clientY - rect.top) / rect.height) * TABLE_HEIGHT
    return {
      x: clamp(x, railBounds.minX, railBounds.maxX),
      y: clamp(y, railBounds.minY, railBounds.maxY),
    }
  }, [])

  const updateCharge = useCallback((point) => {
    if (!cueBall || !point) return null
    const dx = cueBall.x - point.x
    const dy = cueBall.y - point.y
    const dist = Math.hypot(dx, dy)
    if (dist < 2) return null
    const angleDeg = Math.atan2(dy, dx) * (180 / Math.PI)
    const powerPct = clamp((dist / 240) * 100, MIN_POWER, MAX_POWER)
    const charge = { angleDeg, powerPct, distance: dist }
    setDragVector(charge)
    onAimAtPoint({
      x: cueBall.x + Math.cos(angleDeg * (Math.PI / 180)) * 140,
      y: cueBall.y + Math.sin(angleDeg * (Math.PI / 180)) * 140,
    })
    return charge
  }, [cueBall, onAimAtPoint])

  const handlePointerDown = useCallback((event) => {
    if (!isInteractive || !cueBall) return
    draggingRef.current = true
    const point = toWorldPoint(event)
    if (point) {
      tableRef.current?.setPointerCapture?.(event.pointerId)
      updateCharge(point)
    }
  }, [cueBall, isInteractive, toWorldPoint, updateCharge])

  const handlePointerMove = useCallback((event) => {
    if (!draggingRef.current || !isInteractive || !cueBall) return
    const point = toWorldPoint(event)
    if (point) updateCharge(point)
  }, [cueBall, isInteractive, toWorldPoint, updateCharge])

  const handlePointerUp = useCallback((event) => {
    if (!draggingRef.current || !isInteractive) return
    draggingRef.current = false
    const point = toWorldPoint(event)
    const charge = point ? updateCharge(point) : dragVector
    if (charge?.distance >= 18) {
      onReleaseShot(charge.angleDeg, charge.powerPct)
    }
    setDragVector(null)
  }, [dragVector, isInteractive, onReleaseShot, toWorldPoint, updateCharge])

  useEffect(() => {
    const stopDrag = () => {
      draggingRef.current = false
      setDragVector(null)
    }
    window.addEventListener('pointerup', stopDrag)
    return () => window.removeEventListener('pointerup', stopDrag)
  }, [])

  return (
    <div className="pool8-table-wrap" ref={tableRef}>
      <div className="pool8-table-3d" aria-hidden="true">
        <Canvas
          shadows
          dpr={[1, 1.5]}
          gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
          camera={{ position: [0, 8.55, 6.95], fov: 38, near: 0.1, far: 60 }}
        >
          <PoolRoomScene balls={balls} activeGroup={activeGroup} />
        </Canvas>
      </div>

      <svg className="pool8-table-svg" viewBox={`0 0 ${TABLE_WIDTH} ${TABLE_HEIGHT}`} role="img" aria-label="8 Ball Pool table">
        <defs>
          <linearGradient id="pool8-cue" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.06)" />
            <stop offset="52%" stopColor="rgba(255,245,214,0.88)" />
            <stop offset="100%" stopColor="rgba(141,91,44,0.98)" />
          </linearGradient>
        </defs>

        <rect x="26" y="26" width={TABLE_WIDTH - 52} height={TABLE_HEIGHT - 52} rx="28" fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.08)" strokeWidth="1.6" />
        <line x1={KITCHEN_X} y1="42" x2={KITCHEN_X} y2={TABLE_HEIGHT - 42} stroke="rgba(255,255,255,0.18)" strokeWidth="2" strokeDasharray="10 12" />
        <circle cx={KITCHEN_X} cy={TABLE_HEIGHT / 2} r="65" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="2" />

        {isInteractive && cueBall && !cueBall.pocketed ? (
          <>
            <line
              x1={cueBall.x}
              y1={cueBall.y}
              x2={aimTargetX}
              y2={aimTargetY}
              stroke="rgba(255,255,255,0.56)"
              strokeWidth="2.6"
              strokeDasharray="11 9"
            />
            <line
              x1={cueStartX}
              y1={cueStartY}
              x2={cueEndX}
              y2={cueEndY}
              stroke="url(#pool8-cue)"
              strokeWidth="7"
              strokeLinecap="round"
              opacity="0.85"
            />
            {dragVector ? (
              <circle
                cx={cueBall.x}
                cy={cueBall.y}
                r={BALL_RADIUS + 12 + dragVector.powerPct * 0.08}
                fill="none"
                stroke="rgba(251, 191, 36, 0.35)"
                strokeWidth="3"
                strokeDasharray="12 9"
              />
            ) : null}
            <circle cx={aimTargetX} cy={aimTargetY} r="8" fill="rgba(255,255,255,0.14)" stroke="rgba(255,255,255,0.42)" />
          </>
        ) : null}
      </svg>

      {isInteractive ? (
        <div
          className={`pool8-cue-overlay${dragVector ? ' charging' : ''}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onDoubleClick={onShoot}
          onWheel={(event) => {
            event.preventDefault()
            onNudgePower(event.deltaY > 0 ? -4 : 4)
          }}
        />
      ) : null}
    </div>
  )
}

const createAudioEngine = () => {
  let ctx = null
  let master = null
  let muted = false

  const ensure = () => {
    if (ctx) return ctx
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)()
      master = ctx.createGain()
      master.gain.value = 0.55
      master.connect(ctx.destination)
    } catch {
      ctx = null
    }
    return ctx
  }

  const playVoice = ({ frequency = 440, duration = 0.1, type = 'sine', gain = 0.12, slideTo = null }) => {
    const audioCtx = ensure()
    if (!audioCtx || muted) return
    try {
      if (audioCtx.state === 'suspended') audioCtx.resume()
      const osc = audioCtx.createOscillator()
      const gainNode = audioCtx.createGain()
      osc.type = type
      osc.frequency.setValueAtTime(frequency, audioCtx.currentTime)
      if (slideTo) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), audioCtx.currentTime + duration)
      }
      gainNode.gain.setValueAtTime(gain, audioCtx.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration)
      osc.connect(gainNode)
      gainNode.connect(master)
      osc.start()
      osc.stop(audioCtx.currentTime + duration)
    } catch {}
  }

  return {
    collision: () => playVoice({ frequency: 430, duration: 0.05, type: 'square', gain: 0.06, slideTo: 320 }),
    rail: () => playVoice({ frequency: 250, duration: 0.08, type: 'triangle', gain: 0.07, slideTo: 180 }),
    shot: (powerPct) => {
      const base = 130 + (powerPct / 100) * 180
      playVoice({ frequency: base, duration: 0.09, type: 'triangle', gain: 0.16, slideTo: base * 0.6 })
      setTimeout(() => playVoice({ frequency: base * 0.52, duration: 0.11, type: 'sine', gain: 0.06 }), 35)
    },
    pocket: (isEight) => {
      playVoice({ frequency: isEight ? 920 : 760, duration: 0.09, type: 'sine', gain: 0.12 })
      setTimeout(() => playVoice({ frequency: isEight ? 1120 : 960, duration: 0.12, type: 'triangle', gain: 0.08 }), 50)
    },
    win: () => {
      ;[523, 659, 784, 1047].forEach((frequency, index) => {
        setTimeout(() => playVoice({ frequency, duration: 0.18, type: 'sine', gain: 0.14 }), index * 95)
      })
    },
    toggleMute: () => {
      muted = !muted
      return muted
    },
  }
}

const EightBallPoolActivity = ({ sdk, currentUser }) => {
  const me = useMemo(() => sanitizePlayer(currentUser), [currentUser])
  const [gameState, setGameState] = useState(createInitialState)
  const [displayBalls, setDisplayBalls] = useState(() => createInitialState().balls)
  const [aimAngle, setAimAngle] = useState(-8)
  const [shotPower, setShotPower] = useState(56)
  const [isMuted, setIsMuted] = useState(false)
  const [hudTick, setHudTick] = useState(0)
  const [shotLog, setShotLog] = useState([])
  const audioRef = useRef(null)
  const animationRunRef = useRef({ id: null })
  const pendingStateRef = useRef(createInitialState())
  const localPlaybackIdRef = useRef(null)

  const audio = useMemo(() => createAudioEngine(), [])
  audioRef.current = audio

  useEffect(() => {
    const tick = setInterval(() => setHudTick((count) => count + 1), 500)
    return () => clearInterval(tick)
  }, [])

  useEffect(() => {
    if (!sdk) return undefined
    const offState = sdk.subscribeServerState((state) => {
      const incoming = sanitizeState(state?.pool8 || state?.eightBallPool || createInitialState())
      pendingStateRef.current = incoming
      setGameState(incoming)
    })
    return () => {
      try { offState?.() } catch {}
    }
  }, [sdk])

  const pushState = useCallback((nextState, cue = 'button_click') => {
    if (!sdk) return
    pendingStateRef.current = nextState
    sdk.updateState({ pool8: nextState }, { serverRelay: true, cue })
  }, [sdk])

  useEffect(() => {
    setDisplayBalls(gameState.balls)
  }, [gameState.balls, gameState.phase])

  useEffect(() => {
    if (!gameState.lastShot?.id) return
    setShotLog((entries) => {
      const nextEntry = {
        id: gameState.lastShot.id,
        shooter: getPlayerName(gameState.players, gameState.lastShot.shooterId),
        summary: gameState.lastShot.summary,
        power: Math.round(gameState.lastShot.powerPct || 0),
      }
      return [nextEntry, ...entries.filter((entry) => entry.id !== nextEntry.id)].slice(0, 4)
    })
  }, [gameState.lastShot, gameState.players])

  useEffect(() => {
    if (!gameState.lastShot?.id || !gameState.lastShot.frames?.length) return undefined
    if (animationRunRef.current.id === gameState.lastShot.id) return undefined

    animationRunRef.current.id = gameState.lastShot.id
    localPlaybackIdRef.current = gameState.lastShot.id
    const shot = gameState.lastShot
    const eventsByStep = new Map()
    shot.events.forEach((entry) => {
      const bucket = eventsByStep.get(entry.step) || []
      bucket.push(entry)
      eventsByStep.set(entry.step, bucket)
    })

    let frameIndex = 0
    let raf = 0
    const playFrame = () => {
      const frame = shot.frames[frameIndex]
      if (frame) {
        setDisplayBalls((prevBalls) => prevBalls.map((ball) => {
          const nextBall = frame.find((entry) => entry.id === ball.id)
          return nextBall ? { ...ball, x: nextBall.x, y: nextBall.y, pocketed: !!nextBall.pocketed } : ball
        }))
      }
      const events = eventsByStep.get(frameIndex * FRAME_SAMPLE_EVERY) || []
      events.forEach((entry) => {
        if (entry.type === 'collision') audioRef.current?.collision()
        else if (entry.type === 'rail') audioRef.current?.rail()
        else if (entry.type === 'pocket') audioRef.current?.pocket(entry.ball === 8)
      })

      frameIndex += 1
      if (frameIndex < shot.frames.length) {
        raf = requestAnimationFrame(playFrame)
        return
      }

      if (gameState.winnerId) {
        audioRef.current?.win()
      }

      const hostId = gameState.players[0]?.id || null
      if (sdk && hostId && me?.id === hostId && pendingStateRef.current.lastShot?.id === shot.id) {
        const settled = {
          ...pendingStateRef.current,
          phase: pendingStateRef.current.winnerId ? 'finished' : 'aiming',
          lastShot: null,
          version: (pendingStateRef.current.version || 0) + 1,
        }
        pushState(settled, settled.winnerId ? 'victory' : 'turn_switch')
      }
    }

    raf = requestAnimationFrame(playFrame)
    return () => cancelAnimationFrame(raf)
  }, [gameState.lastShot, gameState.players, gameState.winnerId, me?.id, pushState, sdk])

  const mySeat = gameState.players.find((player) => player.id === me?.id) || null
  const hostId = gameState.players[0]?.id || null
  const isMyTurn = !!mySeat && gameState.turnPlayerId === mySeat.id && gameState.phase === 'aiming'
  const cueBall = findBall(displayBalls, 0)
  const myGroup = mySeat ? gameState.assignments[mySeat.id] || null : null
  const solidsLeft = BALL_LAYOUT.filter((ball) => ball.group === 'solids' && !findBall(gameState.balls, ball.number)?.pocketed).length
  const stripesLeft = BALL_LAYOUT.filter((ball) => ball.group === 'stripes' && !findBall(gameState.balls, ball.number)?.pocketed).length

  const setAimFromPoint = useCallback((point) => {
    const activeCue = findBall(displayBalls, 0)
    if (!activeCue || activeCue.pocketed) return
    const aim = computeAim(activeCue, point)
    setAimAngle(aim.angleDeg)
    setShotPower(aim.powerPct)
  }, [displayBalls])

  const handleJoinSeat = useCallback(() => {
    if (!me) return
    pushState(buildStateAfterJoin(gameState, me), 'player_join')
  }, [gameState, me, pushState])

  const handleLeave = useCallback(() => {
    if (!me) return
    pushState(buildStateAfterLeave(gameState, me.id), 'player_leave')
  }, [gameState, me, pushState])

  const handleShoot = useCallback(() => {
    if (!me || !isMyTurn || !cueBall || cueBall.pocketed) return
    audioRef.current?.shot(shotPower)
    const nextState = buildTurnStateAfterShot(gameState, me.id, aimAngle, shotPower)
    pushState(nextState, 'move_valid')
  }, [aimAngle, cueBall, gameState, isMyTurn, me, pushState, shotPower])

  const handleReleaseShot = useCallback((angleDeg, powerPct) => {
    if (!me || !isMyTurn || !cueBall || cueBall.pocketed) return
    setAimAngle(angleDeg)
    setShotPower(powerPct)
    audioRef.current?.shot(powerPct)
    const nextState = buildTurnStateAfterShot(gameState, me.id, angleDeg, powerPct)
    pushState(nextState, 'move_valid')
  }, [cueBall, gameState, isMyTurn, me, pushState])

  const handleReset = useCallback(() => {
    const next = createInitialState()
    next.players = gameState.players
    next.spectators = gameState.spectators
    next.rackNumber = gameState.rackNumber + 1
    if (next.players.length >= 2) {
      next.phase = 'aiming'
      next.turnPlayerId = next.players[0].id
      next.breakerId = next.players[0].id
      next.lastShotSummary = `${next.players[0].username} breaks rack ${next.rackNumber}.`
    }
    pushState(next, 'round_start')
  }, [gameState.players, gameState.rackNumber, gameState.spectators, pushState])

  const handleToggleMute = useCallback(() => {
    const next = audioRef.current?.toggleMute?.()
    setIsMuted(!!next)
  }, [])

  const liveStatus = gameState.phase === 'finished'
    ? `${getPlayerName(gameState.players, gameState.winnerId)} takes the rack`
    : gameState.phase === 'animating'
      ? `${getPlayerName(gameState.players, gameState.lastShot?.shooterId)} is on the shot`
      : gameState.turnPlayerId
        ? `${getPlayerName(gameState.players, gameState.turnPlayerId)} to play`
        : 'Waiting for players'

  return (
    <GameCanvasShell
      title="8Ball Pool"
      subtitle="Shared Table"
      status="Interactive felt view with synced shot playback, preserved table SFX, and a lighter shell music bed."
      skin="sport"
      musicProfile="sport"
      layout="stretch"
      contentStyle={{ padding: 18 }}
    >
      <div className="pool8">
        <style>{CSS}</style>

        <aside className="pool8-panel">
        <div className="pool8-hero">
          <div>
            <div className="pool8-kicker">Built-In Activity</div>
            <h2>8Ball Pool</h2>
            <p>Deterministic table physics, shared rack state, synced shot playback, and spectator-friendly presentation.</p>
          </div>
          <button className="pool8-btn secondary" onClick={handleToggleMute}>
            {isMuted ? 'Unmute' : 'Mute'}
          </button>
        </div>

        <div className="pool8-status">
          <strong>{liveStatus}</strong>
          <div>{gameState.lastShotSummary}</div>
        </div>

        {['Player 1', 'Player 2'].map((label, index) => {
          const player = gameState.players[index]
          const group = player ? gameState.assignments[player.id] : null
          const active = !!player?.id && player.id === gameState.turnPlayerId && gameState.phase !== 'finished'
          return (
            <div key={label} className={`pool8-seat${active ? ' active' : ''}`}>
              <div className="pool8-avatar">{player?.username?.slice(0, 1)?.toUpperCase() || index + 1}</div>
              <div className="pool8-seat-meta">
                <strong>{player?.username || label}</strong>
                <span>{player ? group ? group : 'Open table' : 'Open seat'}</span>
              </div>
              {!player && me && !mySeat ? <button className="pool8-btn" onClick={handleJoinSeat}>Sit</button> : null}
              {player?.id === me?.id ? <button className="pool8-btn secondary" onClick={handleLeave}>Leave</button> : null}
            </div>
          )
        })}

        <div className="pool8-grid two">
          <div className="pool8-stat">
            <div className="pool8-stat-label">Rack</div>
            <div className="pool8-stat-value">#{gameState.rackNumber}</div>
          </div>
          <div className="pool8-stat">
            <div className="pool8-stat-label">Host</div>
            <div className="pool8-stat-value">{hostId ? getPlayerName(gameState.players, hostId) : 'None'}</div>
          </div>
          <div className="pool8-stat">
            <div className="pool8-stat-label">Solids Left</div>
            <div className="pool8-stat-value">{solidsLeft}</div>
          </div>
          <div className="pool8-stat">
            <div className="pool8-stat-label">Stripes Left</div>
            <div className="pool8-stat-value">{stripesLeft}</div>
          </div>
        </div>

        <div className="pool8-controls">
          <div className="pool8-control-header">
            <span>Cue Angle</span>
            <span>{Math.round(aimAngle)}°</span>
          </div>
          <input className="pool8-slider" type="range" min="-180" max="180" value={aimAngle} onChange={(event) => setAimAngle(Number(event.target.value))} />

          <div className="pool8-control-header">
            <span>Shot Power</span>
            <span>{Math.round(shotPower)}%</span>
          </div>
          <div className="pool8-powerbar">
            <div className="pool8-powerfill" style={{ width: `${shotPower}%` }} />
          </div>
          <input className="pool8-slider" type="range" min={MIN_POWER} max={MAX_POWER} value={shotPower} onChange={(event) => setShotPower(Number(event.target.value))} />

          <div className="pool8-actions">
            <button className="pool8-btn" onClick={handleShoot} disabled={!isMyTurn || gameState.phase !== 'aiming'}>
              Tap Shot
            </button>
            <button className="pool8-btn secondary" onClick={handleReset}>
              New Rack
            </button>
          </div>
        </div>

        <div className="pool8-card">
          <div className="pool8-stat-label">Spectators</div>
          <div className="pool8-spectators" style={{ marginTop: 10 }}>
            {gameState.spectators.length
              ? gameState.spectators.map((player) => <div key={player.id} className="pool8-spectator">{player.username}</div>)
              : <div className="pool8-spectator">No spectators</div>}
          </div>
        </div>

        <div className="pool8-card">
          <div className="pool8-stat-label">Shot Feed</div>
          <div className="pool8-shotlog" style={{ marginTop: 10 }}>
            {shotLog.length ? shotLog.map((entry) => (
              <div key={entry.id} className="pool8-shot-entry">
                <div>
                  <strong>{entry.shooter}</strong>
                  <span>{entry.summary}</span>
                </div>
                <span>{entry.power}%</span>
              </div>
            )) : <div className="pool8-spectator">No shots yet</div>}
          </div>
        </div>

        <div className="pool8-footer">
          Click and drag back from the cue ball, then release to fire. Scroll over the felt to feather power, or use the fallback tap-shot button. The first seated player acts as the rack host and finalizes shot playback for the room.
        </div>
        </aside>

        <section className="pool8-main">
        <div className="pool8-main-top">
          <div className="pool8-marquee">
            <div className={`pool8-led${gameState.phase === 'animating' ? ' animating' : gameState.phase === 'finished' ? ' finished' : ''}`} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 800 }}>{gameState.phase === 'animating' ? 'Physics Playback' : gameState.phase === 'finished' ? 'Rack Finished' : 'Live Table'}</div>
              <div style={{ fontSize: 12, color: '#8ea3b6' }}>{gameState.lastShotSummary}</div>
            </div>
          </div>
          <div style={{ fontSize: 11, color: '#8ea3b6' }}>tick {hudTick}</div>
        </div>

        <PoolTable
          balls={displayBalls}
          cueAngle={aimAngle}
          shotPower={shotPower}
          isInteractive={isMyTurn}
          activeGroup={myGroup}
          onAimAtPoint={setAimFromPoint}
          onShoot={handleShoot}
          onReleaseShot={handleReleaseShot}
          onNudgePower={(delta) => setShotPower((current) => clamp(current + delta, MIN_POWER, MAX_POWER))}
        />

        <div className="pool8-pills">
          <div className="pool8-pill">Players: {gameState.players.length}/2</div>
          <div className="pool8-pill">Phase: {gameState.phase}</div>
          <div className="pool8-pill">Cue Ball: {cueBall?.pocketed ? 'scratched' : 'in play'}</div>
          <div className="pool8-pill">Your Group: {myGroup || 'open table'}</div>
          <div className="pool8-pill">Turn: {gameState.turnPlayerId ? getPlayerName(gameState.players, gameState.turnPlayerId) : 'nobody'}</div>
          <div className="pool8-pill">Winner: {gameState.winnerId ? getPlayerName(gameState.players, gameState.winnerId) : 'none'}</div>
        </div>
        </section>
      </div>
    </GameCanvasShell>
  )
}

export default EightBallPoolActivity
