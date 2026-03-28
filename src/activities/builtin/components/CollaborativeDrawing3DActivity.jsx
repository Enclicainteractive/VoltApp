import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { shouldIgnoreActivityHotkey } from './shared/hotkeys'

const TOOL_DRAW = 'draw'
const TOOL_BOX = 'box'
const TOOL_SPHERE = 'sphere'
const TOOL_COLUMN = 'column'
const TOOL_ERASE = 'erase'
const CURSOR_EVENT = 'drawing3d:cursor'
const REMOTE_CURSOR_TTL = 4000
const DRAW_SAMPLE_EPSILON = 0.12
const WORLD_RADIUS = 18
const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

const makeId = (prefix = 'd3') => `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`
const sanitizePlayer = (player) => ({
  id: String(player?.id || 'guest'),
  username: String(player?.username || 'Guest'),
  color: String(player?.color || '#38bdf8'),
})

const normalizePoint = (point) => ({
  x: clamp(Number(point?.x) || 0, -WORLD_RADIUS, WORLD_RADIUS),
  y: clamp(Number(point?.y) || 0, 0, 10),
  z: clamp(Number(point?.z) || 0, -WORLD_RADIUS, WORLD_RADIUS),
})

const normalizeStroke = (stroke) => {
  if (!stroke || !Array.isArray(stroke.points) || stroke.points.length < 2) return null
  return {
    id: String(stroke.id || makeId('stroke')),
    type: 'stroke',
    color: String(stroke.color || '#38bdf8'),
    width: clamp(Number(stroke.width) || 0.18, 0.05, 0.7),
    userId: String(stroke.userId || 'guest'),
    username: String(stroke.username || 'Guest'),
    points: stroke.points.map(normalizePoint),
    createdAt: Number(stroke.createdAt) || Date.now(),
  }
}

const normalizeProp = (prop) => {
  if (!prop || !['box', 'sphere', 'column'].includes(prop.kind)) return null
  return {
    id: String(prop.id || makeId('prop')),
    kind: prop.kind,
    color: String(prop.color || '#f97316'),
    userId: String(prop.userId || 'guest'),
    username: String(prop.username || 'Guest'),
    size: clamp(Number(prop.size) || 1.2, 0.4, 4),
    position: normalizePoint(prop.position),
    createdAt: Number(prop.createdAt) || Date.now(),
  }
}

const normalizeWorld = (value) => ({
  revision: Number(value?.revision) || 0,
  strokes: Array.isArray(value?.strokes) ? value.strokes.map(normalizeStroke).filter(Boolean) : [],
  props: Array.isArray(value?.props) ? value.props.map(normalizeProp).filter(Boolean) : [],
})

const LabelTexture = (() => {
  const cache = new Map()
  return (text, fg = '#f8fafc', bg = 'rgba(15,23,42,0.85)') => {
    const key = `${text}|${fg}|${bg}`
    if (cache.has(key)) return cache.get(key)
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 128
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, 256, 128)
    ctx.fillStyle = bg
    ctx.beginPath()
    ctx.roundRect(12, 12, 232, 104, 22)
    ctx.fill()
    ctx.fillStyle = fg
    ctx.font = 'bold 46px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(text), 128, 64)
    const texture = new THREE.CanvasTexture(canvas)
    cache.set(key, texture)
    return texture
  }
})()

const StrokeRibbon = ({ stroke, onErase, eraseMode }) => {
  const geometry = useMemo(() => {
    if (stroke.points.length < 2) return null
    const curve = new THREE.CatmullRomCurve3(
      stroke.points.map((point) => new THREE.Vector3(point.x, point.y, point.z)),
      false,
      'centripetal'
    )
    return new THREE.TubeGeometry(curve, Math.max(stroke.points.length * 3, 18), stroke.width, 10, false)
  }, [stroke])

  useEffect(() => () => geometry?.dispose(), [geometry])
  if (!geometry) return null
  return (
    <mesh geometry={geometry} onPointerDown={() => eraseMode && onErase?.(stroke.id)}>
      <meshStandardMaterial color={stroke.color} emissive={stroke.color} emissiveIntensity={0.28} roughness={0.34} metalness={0.12} />
    </mesh>
  )
}

const WorldProp = ({ prop, eraseMode, onErase }) => {
  const common = {
    position: [prop.position.x, prop.position.y + prop.size * 0.5, prop.position.z],
    onPointerDown: () => eraseMode && onErase?.(prop.id),
    castShadow: true,
  }
  if (prop.kind === 'box') {
    return (
      <mesh {...common}>
        <boxGeometry args={[prop.size, prop.size, prop.size]} />
        <meshStandardMaterial color={prop.color} emissive={prop.color} emissiveIntensity={0.12} />
      </mesh>
    )
  }
  if (prop.kind === 'column') {
    return (
      <mesh {...common}>
        <cylinderGeometry args={[prop.size * 0.36, prop.size * 0.44, prop.size * 1.8, 24]} />
        <meshStandardMaterial color={prop.color} emissive={prop.color} emissiveIntensity={0.12} />
      </mesh>
    )
  }
  return (
    <mesh {...common}>
      <sphereGeometry args={[prop.size * 0.5, 24, 24]} />
      <meshStandardMaterial color={prop.color} emissive={prop.color} emissiveIntensity={0.16} />
    </mesh>
  )
}

const RemoteCursor = ({ cursor }) => {
  const texture = useMemo(() => LabelTexture(cursor.username.slice(0, 12)), [cursor.username])
  return (
    <group position={[cursor.position.x, cursor.position.y, cursor.position.z]}>
      <mesh castShadow>
        <sphereGeometry args={[0.18, 18, 18]} />
        <meshStandardMaterial color={cursor.color} emissive={cursor.color} emissiveIntensity={0.35} />
      </mesh>
      <mesh position={[0, 0.42, 0]}>
        <planeGeometry args={[1.1, 0.55]} />
        <meshBasicMaterial map={texture} transparent toneMapped={false} />
      </mesh>
    </group>
  )
}

const AnimatedAtmosphere = () => {
  const stars = useMemo(() => Array.from({ length: 120 }, (_, index) => ({
    x: Math.sin(index * 19.4) * 24,
    y: 6 + (index % 12) * 0.55,
    z: Math.cos(index * 11.8) * 24,
    scale: 0.03 + (index % 4) * 0.01,
  })), [])
  const groupRef = useRef(null)
  useFrame((state) => {
    if (groupRef.current) groupRef.current.rotation.y = state.clock.elapsedTime * 0.03
  })
  return (
    <group ref={groupRef}>
      {stars.map((star, index) => (
        <mesh key={`star-${index}`} position={[star.x, star.y, star.z]}>
          <sphereGeometry args={[star.scale, 8, 8]} />
          <meshBasicMaterial color="#dbeafe" />
        </mesh>
      ))}
    </group>
  )
}

const OrbitRig = ({ controlState }) => {
  const { camera } = useThree()
  useFrame(() => {
    const theta = controlState.current.theta
    const phi = controlState.current.phi
    const radius = controlState.current.radius
    camera.position.set(
      Math.cos(theta) * Math.cos(phi) * radius,
      Math.sin(phi) * radius,
      Math.sin(theta) * Math.cos(phi) * radius
    )
    camera.lookAt(0, 0.9, 0)
  })
  return null
}

const DrawingScene = ({
  world,
  currentStroke,
  color,
  tool,
  size,
  remoteCursors,
  onFloorPointerDown,
  onFloorPointerMove,
  onFloorPointerUp,
  onEraseStroke,
  onEraseProp,
}) => {
  const orbitRef = useRef({ theta: Math.PI / 4, phi: 0.72, radius: 18 })
  const dragRef = useRef(null)
  const handlePointerMissed = useCallback((event) => {
    if (event.button !== 2) return
    dragRef.current = { x: event.clientX, y: event.clientY }
  }, [])
  useEffect(() => {
    const move = (event) => {
      if (!dragRef.current) return
      const dx = event.clientX - dragRef.current.x
      const dy = event.clientY - dragRef.current.y
      dragRef.current = { x: event.clientX, y: event.clientY }
      orbitRef.current.theta -= dx * 0.008
      orbitRef.current.phi = clamp(orbitRef.current.phi - dy * 0.006, 0.24, 1.22)
    }
    const up = () => { dragRef.current = null }
    const wheel = (event) => {
      orbitRef.current.radius = clamp(orbitRef.current.radius + event.deltaY * 0.01, 8, 28)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('wheel', wheel, { passive: true })
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('wheel', wheel)
    }
  }, [])

  return (
    <Canvas
      shadows
      camera={{ position: [12, 12, 12], fov: 46 }}
      dpr={[1, 1.7]}
      onPointerMissed={handlePointerMissed}
    >
      <color attach="background" args={['#07121c']} />
      <fog attach="fog" args={['#07121c', 10, 42]} />
      <OrbitRig controlState={orbitRef} />
      <ambientLight intensity={0.72} color="#dbeafe" />
      <directionalLight position={[12, 16, 6]} intensity={1.3} color="#7dd3fc" castShadow />
      <directionalLight position={[-10, 10, -8]} intensity={0.7} color="#f472b6" />
      <pointLight position={[0, 6, 0]} intensity={0.5} color="#f59e0b" />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <circleGeometry args={[WORLD_RADIUS + 4, 64]} />
        <meshStandardMaterial color="#08131f" roughness={0.94} />
      </mesh>
      <gridHelper args={[WORLD_RADIUS * 2, 24, '#38bdf8', '#12314f']} position={[0, 0.001, 0]} />
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        onPointerDown={(event) => onFloorPointerDown(event.point)}
        onPointerMove={(event) => onFloorPointerMove(event.point)}
        onPointerUp={() => onFloorPointerUp()}
        onContextMenu={(event) => event.nativeEvent.preventDefault()}
      >
        <planeGeometry args={[WORLD_RADIUS * 2, WORLD_RADIUS * 2]} />
        <meshStandardMaterial color="#0b1a28" transparent opacity={tool === TOOL_DRAW ? 0.1 : 0.18} />
      </mesh>

      {world.strokes.map((stroke) => (
        <StrokeRibbon key={stroke.id} stroke={stroke} eraseMode={tool === TOOL_ERASE} onErase={onEraseStroke} />
      ))}
      {currentStroke ? <StrokeRibbon stroke={currentStroke} /> : null}
      {world.props.map((prop) => (
        <WorldProp key={prop.id} prop={prop} eraseMode={tool === TOOL_ERASE} onErase={onEraseProp} />
      ))}
      {remoteCursors.map((cursor) => (
        <RemoteCursor key={cursor.userId} cursor={cursor} />
      ))}

      {tool !== TOOL_DRAW && tool !== TOOL_ERASE ? (
        <mesh position={[0, size * 0.5, 0]}>
          {tool === TOOL_BOX ? <boxGeometry args={[size, size, size]} /> : null}
          {tool === TOOL_SPHERE ? <sphereGeometry args={[size * 0.5, 24, 24]} /> : null}
          {tool === TOOL_COLUMN ? <cylinderGeometry args={[size * 0.36, size * 0.44, size * 1.8, 24]} /> : null}
          <meshStandardMaterial color={color} transparent opacity={0.16} emissive={color} emissiveIntensity={0.24} />
        </mesh>
      ) : null}

      <AnimatedAtmosphere />
    </Canvas>
  )
}

const CollaborativeDrawing3DActivity = ({ sdk, currentUser }) => {
  const me = useMemo(() => sanitizePlayer(currentUser), [currentUser])
  const [world, setWorld] = useState(() => normalizeWorld())
  const [tool, setTool] = useState(TOOL_DRAW)
  const [color, setColor] = useState(me.color || '#38bdf8')
  const [size, setSize] = useState(1.2)
  const [status, setStatus] = useState('Drag on the floor to draw in 3D.')
  const [remoteCursors, setRemoteCursors] = useState({})
  const drawingRef = useRef(false)
  const draftStrokeRef = useRef(null)
  const cursorEmitAtRef = useRef(0)
  const worldRef = useRef(world)

  useEffect(() => { worldRef.current = world }, [world])

  useEffect(() => {
    if (!sdk) return undefined
    const offState = sdk.subscribeServerState?.((state) => {
      const incoming = normalizeWorld(state?.drawing3d || state?.drawing3D || state?.collaborativeDrawing3d)
      setWorld(incoming)
    })
    const offEvent = sdk.on?.('event', (event) => {
      if (event.eventType !== CURSOR_EVENT) return
      const payload = event.payload || {}
      if (payload.userId === me.id) return
      setRemoteCursors((prev) => ({
        ...prev,
        [payload.userId]: {
          userId: payload.userId,
          username: payload.username || 'Guest',
          color: payload.color || '#38bdf8',
          position: normalizePoint(payload.position),
          seenAt: Date.now(),
        },
      }))
    })
    return () => {
      try { offState?.() } catch {}
      try { offEvent?.() } catch {}
    }
  }, [me.id, sdk])

  useEffect(() => {
    const interval = setInterval(() => {
      setRemoteCursors((prev) => {
        const next = {}
        Object.values(prev).forEach((cursor) => {
          if (Date.now() - cursor.seenAt < REMOTE_CURSOR_TTL) next[cursor.userId] = cursor
        })
        return next
      })
    }, 500)
    return () => clearInterval(interval)
  }, [])

  const pushWorld = useCallback((nextWorld, cue = 'selection_change') => {
    setWorld(nextWorld)
    sdk?.updateState?.({ drawing3d: nextWorld }, { serverRelay: true, cue })
  }, [sdk])

  const emitCursor = useCallback((position) => {
    const now = Date.now()
    if (now - cursorEmitAtRef.current < 60) return
    cursorEmitAtRef.current = now
    sdk?.emitEvent?.(CURSOR_EVENT, {
      userId: me.id,
      username: me.username,
      color,
      position,
    }, { serverRelay: true })
  }, [color, me.id, me.username, sdk])

  const commitDraftStroke = useCallback(() => {
    const draft = draftStrokeRef.current
    drawingRef.current = false
    draftStrokeRef.current = null
    if (!draft || draft.points.length < 2) return
    const nextWorld = {
      ...worldRef.current,
      revision: worldRef.current.revision + 1,
      strokes: [...worldRef.current.strokes, draft],
    }
    pushWorld(nextWorld, 'move_valid')
    setStatus(`Stroke added by ${me.username}.`)
  }, [me.username, pushWorld])

  const handleFloorPointerDown = useCallback((point) => {
    const normalized = normalizePoint(point)
    emitCursor(normalized)
    if (tool === TOOL_DRAW) {
      drawingRef.current = true
      draftStrokeRef.current = {
        id: makeId('stroke'),
        type: 'stroke',
        color,
        width: clamp(size * 0.12, 0.05, 0.6),
        userId: me.id,
        username: me.username,
        points: [{ ...normalized, y: clamp(normalized.y + 0.06, 0.06, 9.5) }],
        createdAt: Date.now(),
      }
      return
    }
    if ([TOOL_BOX, TOOL_SPHERE, TOOL_COLUMN].includes(tool)) {
      const prop = {
        id: makeId('prop'),
        kind: tool === TOOL_BOX ? 'box' : tool === TOOL_SPHERE ? 'sphere' : 'column',
        color,
        size,
        userId: me.id,
        username: me.username,
        position: { ...normalized, y: 0 },
        createdAt: Date.now(),
      }
      const nextWorld = {
        ...worldRef.current,
        revision: worldRef.current.revision + 1,
        props: [...worldRef.current.props, prop],
      }
      pushWorld(nextWorld, 'move_valid')
      setStatus(`${prop.kind} placed.`)
    }
  }, [color, emitCursor, me.id, me.username, pushWorld, size, tool])

  const handleFloorPointerMove = useCallback((point) => {
    const normalized = normalizePoint(point)
    emitCursor(normalized)
    if (!drawingRef.current || !draftStrokeRef.current) return
    const points = draftStrokeRef.current.points
    const last = points[points.length - 1]
    const dx = normalized.x - last.x
    const dy = normalized.y - last.y
    const dz = normalized.z - last.z
    if (Math.sqrt(dx * dx + dy * dy + dz * dz) < DRAW_SAMPLE_EPSILON) return
    draftStrokeRef.current = {
      ...draftStrokeRef.current,
      points: [...points, { ...normalized, y: clamp(normalized.y + 0.06, 0.06, 9.5) }],
    }
  }, [emitCursor])

  const handleEraseStroke = useCallback((strokeId) => {
    if (tool !== TOOL_ERASE) return
    const nextWorld = {
      ...worldRef.current,
      revision: worldRef.current.revision + 1,
      strokes: worldRef.current.strokes.filter((stroke) => stroke.id !== strokeId),
    }
    pushWorld(nextWorld, 'move_valid')
    setStatus('Stroke erased.')
  }, [pushWorld, tool])

  const handleEraseProp = useCallback((propId) => {
    if (tool !== TOOL_ERASE) return
    const nextWorld = {
      ...worldRef.current,
      revision: worldRef.current.revision + 1,
      props: worldRef.current.props.filter((prop) => prop.id !== propId),
    }
    pushWorld(nextWorld, 'move_valid')
    setStatus('Prop erased.')
  }, [pushWorld, tool])

  useEffect(() => {
    const handlePointerUp = () => commitDraftStroke()
    window.addEventListener('pointerup', handlePointerUp)
    return () => window.removeEventListener('pointerup', handlePointerUp)
  }, [commitDraftStroke])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (shouldIgnoreActivityHotkey(event)) return
      if (event.code === 'Digit1') setTool(TOOL_DRAW)
      if (event.code === 'Digit2') setTool(TOOL_BOX)
      if (event.code === 'Digit3') setTool(TOOL_SPHERE)
      if (event.code === 'Digit4') setTool(TOOL_COLUMN)
      if (event.code === 'Digit5') setTool(TOOL_ERASE)
      if (event.key === '[') setSize((value) => clamp(value - 0.1, 0.4, 4))
      if (event.key === ']') setSize((value) => clamp(value + 0.1, 0.4, 4))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const draftStroke = draftStrokeRef.current
  const remoteCursorList = Object.values(remoteCursors)
  const palette = ['#38bdf8', '#f97316', '#22c55e', '#f472b6', '#fbbf24', '#a78bfa', '#f8fafc']

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'grid',
      gridTemplateColumns: '320px minmax(0, 1fr)',
      gap: 16,
      padding: 16,
      background: 'radial-gradient(circle at top left, rgba(56,189,248,0.14), transparent 28%), linear-gradient(180deg, #07121c, #091726 58%, #08111b)',
      color: '#e5eef8',
      boxSizing: 'border-box',
    }}>
      <aside style={{
        display: 'grid',
        alignContent: 'start',
        gap: 14,
        padding: 16,
        borderRadius: 24,
        border: '1px solid rgba(148,163,184,0.16)',
        background: 'rgba(8,16,28,0.86)',
        boxShadow: '0 20px 50px rgba(0,0,0,0.28)',
      }}>
        <div>
          <div style={{ fontSize: 11, color: '#7dd3fc', letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 800 }}>Creative 3D Activity</div>
          <h2 style={{ margin: '8px 0 0', fontSize: 30, lineHeight: 0.98 }}>World Sketch 3D</h2>
          <p style={{ margin: '10px 0 0', color: '#94a3b8', fontSize: 12, lineHeight: 1.55 }}>
            Draw ribbon strokes in space, place primitives, erase objects, and build a shared scene together.
          </p>
        </div>

        <div style={{ padding: 14, borderRadius: 18, background: 'rgba(15,23,42,0.62)', border: '1px solid rgba(148,163,184,0.12)' }}>
          <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 8 }}>Tools</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 8 }}>
            {[
              [TOOL_DRAW, 'Draw', '1'],
              [TOOL_BOX, 'Box', '2'],
              [TOOL_SPHERE, 'Sphere', '3'],
              [TOOL_COLUMN, 'Column', '4'],
              [TOOL_ERASE, 'Erase', '5'],
            ].map(([id, label, keybind]) => (
              <button
                key={id}
                onClick={() => setTool(id)}
                style={{
                  padding: '10px 12px',
                  borderRadius: 12,
                  border: '1px solid rgba(148,163,184,0.14)',
                  background: tool === id ? 'linear-gradient(135deg,#0891b2,#22d3ee)' : 'rgba(15,23,42,0.78)',
                  color: '#f8fafc',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {label} <span style={{ opacity: 0.7 }}>{keybind}</span>
              </button>
            ))}
          </div>
        </div>

        <div style={{ padding: 14, borderRadius: 18, background: 'rgba(15,23,42,0.62)', border: '1px solid rgba(148,163,184,0.12)' }}>
          <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 8 }}>Palette</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {palette.map((swatch) => (
              <button
                key={swatch}
                onClick={() => setColor(swatch)}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 999,
                  border: color === swatch ? '2px solid #f8fafc' : '2px solid rgba(255,255,255,0.16)',
                  background: swatch,
                  cursor: 'pointer',
                }}
              />
            ))}
          </div>
        </div>

        <div style={{ padding: 14, borderRadius: 18, background: 'rgba(15,23,42,0.62)', border: '1px solid rgba(148,163,184,0.12)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 8 }}>
            <strong>{tool === TOOL_DRAW ? 'Ribbon Width' : 'Prop Size'}</strong>
            <span>{size.toFixed(1)}</span>
          </div>
          <input type="range" min="0.4" max="4" step="0.1" value={size} onChange={(event) => setSize(Number(event.target.value))} style={{ width: '100%' }} />
          <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 6 }}>[ / ] also adjusts size</div>
        </div>

        <div style={{ padding: 14, borderRadius: 18, background: 'rgba(15,23,42,0.62)', border: '1px solid rgba(148,163,184,0.12)' }}>
          <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 8 }}>Scene Stats</div>
          <div style={{ display: 'grid', gap: 6, fontSize: 12, color: '#cbd5e1' }}>
            <div>Strokes: {world.strokes.length}</div>
            <div>Props: {world.props.length}</div>
            <div>Guests: {remoteCursorList.length + 1}</div>
            <div>Revision: {world.revision}</div>
          </div>
        </div>

        <div style={{ padding: 14, borderRadius: 18, background: 'rgba(15,23,42,0.62)', border: '1px solid rgba(148,163,184,0.12)' }}>
          <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 8 }}>Controls</div>
          <div style={{ display: 'grid', gap: 5, fontSize: 11, color: '#cbd5e1', lineHeight: 1.45 }}>
            <div>Left drag on floor: draw</div>
            <div>Right drag: orbit camera</div>
            <div>Mouse wheel: zoom</div>
            <div>Click object in erase mode: remove it</div>
          </div>
        </div>

        <button
          onClick={() => {
            const nextWorld = { revision: world.revision + 1, strokes: [], props: [] }
            pushWorld(nextWorld, 'round_start')
            setStatus('Scene cleared.')
          }}
          style={{
            padding: '12px 14px',
            borderRadius: 14,
            border: '1px solid rgba(248,113,113,0.22)',
            background: 'linear-gradient(135deg,#7f1d1d,#ef4444)',
            color: '#fff',
            fontWeight: 800,
            cursor: 'pointer',
          }}
        >
          Clear World
        </button>
      </aside>

      <section style={{
        minWidth: 0,
        display: 'grid',
        gridTemplateRows: 'auto minmax(0,1fr)',
        gap: 14,
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          padding: '14px 16px',
          borderRadius: 22,
          border: '1px solid rgba(148,163,184,0.16)',
          background: 'rgba(8,16,28,0.86)',
          boxShadow: '0 20px 50px rgba(0,0,0,0.22)',
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800 }}>Shared 3D Scene</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{status}</div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ padding: '7px 10px', borderRadius: 999, background: 'rgba(15,23,42,0.74)', border: '1px solid rgba(148,163,184,0.14)', fontSize: 11 }}>Tool: {tool}</span>
            <span style={{ padding: '7px 10px', borderRadius: 999, background: 'rgba(15,23,42,0.74)', border: '1px solid rgba(148,163,184,0.14)', fontSize: 11 }}>Color</span>
          </div>
        </div>

        <div style={{
          minHeight: 0,
          borderRadius: 26,
          overflow: 'hidden',
          border: '1px solid rgba(148,163,184,0.16)',
          boxShadow: '0 28px 70px rgba(0,0,0,0.26)',
          background: '#07121c',
        }}>
          <DrawingScene
            world={world}
            currentStroke={draftStroke}
            color={color}
            tool={tool}
            size={size}
            remoteCursors={remoteCursorList}
            onFloorPointerDown={handleFloorPointerDown}
            onFloorPointerMove={handleFloorPointerMove}
            onFloorPointerUp={commitDraftStroke}
            onEraseStroke={handleEraseStroke}
            onEraseProp={handleEraseProp}
          />
        </div>
      </section>
    </div>
  )
}

export default CollaborativeDrawing3DActivity
