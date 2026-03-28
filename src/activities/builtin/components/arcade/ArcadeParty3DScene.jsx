import React, { useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

const DEFAULT_THEME = {
  floor: '#081420',
  glow: '#38bdf8',
  accent: '#f97316',
  accent2: '#f472b6',
  tile: '#102033',
  tileAlt: '#17263a',
  safe: '#22c55e',
  danger: '#ef4444',
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const labelTextureCache = new Map()

const makeLabelTexture = (label, {
  fg = '#f8fafc',
  bg = 'rgba(15,23,42,0.85)',
  font = 'bold 86px system-ui, sans-serif',
} = {}) => {
  const key = `${label}|${fg}|${bg}|${font}`
  if (labelTextureCache.has(key)) return labelTextureCache.get(key)
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = bg
  ctx.beginPath()
  ctx.roundRect(18, 18, 220, 220, 34)
  ctx.fill()
  ctx.fillStyle = fg
  ctx.font = font
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(label), 128, 128)
  const texture = new THREE.CanvasTexture(canvas)
  texture.anisotropy = 4
  labelTextureCache.set(key, texture)
  return texture
}

const LabelPlane = ({ label, color = '#f8fafc', bg = 'rgba(15,23,42,0.85)', position = [0, 0, 0], scale = [0.58, 0.58, 0.58], rotation = [-Math.PI / 2, 0, 0] }) => {
  const texture = useMemo(() => makeLabelTexture(label, { fg: color, bg }), [label, color, bg])
  return (
    <mesh position={position} rotation={rotation} scale={scale}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={texture} transparent toneMapped={false} />
    </mesh>
  )
}

const FloatingRig = ({ target = [0, 0, 0], radius = 12, height = 8 }) => {
  const { camera } = useThree()
  useFrame((state) => {
    const t = state.clock.elapsedTime * 0.12
    camera.position.lerp(
      new THREE.Vector3(
        target[0] + Math.cos(t) * radius,
        target[1] + height + Math.sin(t * 1.7) * 1.3,
        target[2] + Math.sin(t) * radius
      ),
      0.04
    )
    camera.lookAt(target[0], target[1], target[2])
  })
  return null
}

const SceneShell = ({ theme, children, target, radius, height }) => (
  <>
    <color attach="background" args={[theme.floor]} />
    <fog attach="fog" args={[theme.floor, 12, 34]} />
    <ambientLight intensity={0.7} color="#e2e8f0" />
    <directionalLight position={[10, 14, 8]} intensity={1.2} color={theme.glow} />
    <directionalLight position={[-10, 8, -8]} intensity={0.55} color={theme.accent2} />
    <pointLight position={[0, 6, 0]} intensity={0.5} color={theme.accent} />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.7, 0]} receiveShadow>
      <circleGeometry args={[18, 48]} />
      <meshStandardMaterial color="#071018" roughness={0.95} metalness={0.04} />
    </mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.69, 0]}>
      <ringGeometry args={[11, 12.3, 64]} />
      <meshBasicMaterial color={theme.glow} transparent opacity={0.2} />
    </mesh>
    <FloatingRig target={target} radius={radius} height={height} />
    {children}
  </>
)

const CellPedestal = ({ position, color, onPointerDown, children, hoverable = true }) => {
  const ref = useRef(null)
  const [hovered, setHovered] = useState(false)
  useFrame((state) => {
    if (!ref.current) return
    ref.current.position.y = position[1] + (hovered ? 0.06 : 0) + Math.sin(state.clock.elapsedTime * 1.6 + position[0] * 0.5 + position[2] * 0.5) * 0.02
  })
  return (
    <group
      ref={ref}
      position={position}
      onPointerOver={() => hoverable && setHovered(true)}
      onPointerOut={() => setHovered(false)}
      onPointerDown={onPointerDown}
    >
      <mesh castShadow receiveShadow>
        <boxGeometry args={[0.92, 0.18, 0.92]} />
        <meshStandardMaterial color={hovered ? '#1d4ed8' : color} roughness={0.72} metalness={0.12} />
      </mesh>
      {children}
    </group>
  )
}

const PieceCylinder = ({ color, position = [0, 0.2, 0], king = false }) => (
  <group position={position}>
    <mesh castShadow>
      <cylinderGeometry args={[0.26, 0.3, king ? 0.26 : 0.18, 24]} />
      <meshStandardMaterial color={color} roughness={0.45} metalness={0.3} emissive={color} emissiveIntensity={0.16} />
    </mesh>
    {king ? (
      <mesh position={[0, 0.2, 0]} castShadow>
        <torusGeometry args={[0.18, 0.05, 10, 20]} />
        <meshStandardMaterial color="#fde68a" metalness={0.35} roughness={0.28} emissive="#fbbf24" emissiveIntensity={0.35} />
      </mesh>
    ) : null}
  </group>
)

const DiscPiece = ({ color, position = [0, 0.18, 0] }) => (
  <mesh position={position} castShadow>
    <sphereGeometry args={[0.28, 24, 24]} />
    <meshStandardMaterial color={color} roughness={0.3} metalness={0.22} emissive={color} emissiveIntensity={0.14} />
  </mesh>
)

const renderCountPips = (count) => (
  Array.from({ length: count }).map((_, index) => {
    const angle = (index / Math.max(count, 1)) * Math.PI * 2
    return (
      <mesh key={`pip-${index}`} position={[Math.cos(angle) * 0.18, 0.14, Math.sin(angle) * 0.18]} castShadow>
        <sphereGeometry args={[0.055, 10, 10]} />
        <meshStandardMaterial color="#e2e8f0" emissive="#93c5fd" emissiveIntensity={0.35} />
      </mesh>
    )
  })
)

const CheckersScene = ({ state, onCellClick, theme, selected }) => {
  const board = state.payload.board || []
  return (
    <Canvas camera={{ position: [0, 8, 8], fov: 42 }} shadows dpr={[1, 1.5]}>
      <SceneShell theme={theme} target={[0, 0, 0]} radius={10} height={7.2}>
        <group position={[-3.5, 0, -3.5]}>
          {board.flatMap((row, y) => row.map((cell, x) => {
            const isDark = (x + y) % 2 === 1
            const isSelected = selected?.x === x && selected?.y === y
            return (
              <CellPedestal key={`chk-${x}-${y}`} position={[x, 0, y]} color={isDark ? '#13283f' : '#244460'} onPointerDown={() => onCellClick(x, y)}>
                {isSelected ? <mesh position={[0, 0.14, 0]}><torusGeometry args={[0.34, 0.045, 10, 24]} /><meshBasicMaterial color="#fbbf24" /></mesh> : null}
                {cell ? <PieceCylinder color={cell.toLowerCase() === 'r' ? theme.accent2 : theme.glow} king={cell === 'R' || cell === 'B'} /> : null}
              </CellPedestal>
            )
          }))}
        </group>
      </SceneShell>
    </Canvas>
  )
}

const ReversiScene = ({ state, onCellClick, theme, size = 8, large = false }) => {
  const board = state.payload.board || []
  const offset = (size - 1) / 2
  return (
    <Canvas camera={{ position: [0, large ? 12 : 8, large ? 10 : 7.8], fov: large ? 46 : 40 }} dpr={[1, 1.5]}>
      <SceneShell theme={theme} target={[0, 0, 0]} radius={size > 10 ? 12 : 10} height={large ? 9 : 7}>
        <group position={[-offset, 0, -offset]}>
          {board.flatMap((row, y) => row.map((cell, x) => (
            <CellPedestal key={`rev-${x}-${y}`} position={[x * (large ? 0.56 : 1), 0, y * (large ? 0.56 : 1)]} color={theme.tile} onPointerDown={() => onCellClick(x, y)}>
              {cell ? <DiscPiece color={cell === 'd' || cell === 'x' ? theme.glow : '#fde68a'} /> : null}
            </CellPedestal>
          )))}
        </group>
      </SceneShell>
    </Canvas>
  )
}

const DotsScene = ({ state, onEdgeClick, theme }) => {
  const { hLines, vLines, owners } = state.payload
  return (
    <Canvas camera={{ position: [0, 8, 7], fov: 42 }} dpr={[1, 1.5]}>
      <SceneShell theme={theme} target={[0, 0.4, 0]} radius={9} height={6.8}>
        <group position={[-2.5, 0, -2.5]}>
          {Array.from({ length: 6 }).flatMap((_, y) => Array.from({ length: 6 }).map((__, x) => (
            <mesh key={`dot-${x}-${y}`} position={[x, 0.05, y]} castShadow>
              <sphereGeometry args={[0.08, 16, 16]} />
              <meshStandardMaterial color="#f8fafc" emissive="#93c5fd" emissiveIntensity={0.35} />
            </mesh>
          )))}
          {hLines.flatMap((row, y) => row.map((owner, x) => (
            <mesh key={`h-${x}-${y}`} position={[x + 0.5, 0.04, y]} onPointerDown={() => onEdgeClick('h', x, y)}>
              <boxGeometry args={[0.72, 0.08, 0.14]} />
              <meshStandardMaterial color={owner ? (state.players[0]?.id === owner ? theme.glow : theme.accent2) : '#31465c'} emissive={owner ? (state.players[0]?.id === owner ? theme.glow : theme.accent2) : '#000000'} emissiveIntensity={owner ? 0.45 : 0} />
            </mesh>
          )))}
          {vLines.flatMap((row, y) => row.map((owner, x) => (
            <mesh key={`v-${x}-${y}`} position={[x, 0.04, y + 0.5]} onPointerDown={() => onEdgeClick('v', x, y)}>
              <boxGeometry args={[0.14, 0.08, 0.72]} />
              <meshStandardMaterial color={owner ? (state.players[0]?.id === owner ? theme.glow : theme.accent2) : '#31465c'} emissive={owner ? (state.players[0]?.id === owner ? theme.glow : theme.accent2) : '#000000'} emissiveIntensity={owner ? 0.45 : 0} />
            </mesh>
          )))}
          {owners.flatMap((row, y) => row.map((owner, x) => owner ? (
            <group key={`owner-${x}-${y}`} position={[x + 0.5, 0.09, y + 0.5]}>
              <mesh>
                <boxGeometry args={[0.6, 0.05, 0.6]} />
                <meshStandardMaterial color={state.players[0]?.id === owner ? theme.glow : theme.accent2} emissiveIntensity={0.26} emissive={state.players[0]?.id === owner ? theme.glow : theme.accent2} />
              </mesh>
              <LabelPlane label={String((state.players.find((player) => player.id === owner)?.username || 'P')[0]).toUpperCase()} bg="rgba(15,23,42,0.2)" position={[0, 0.06, 0]} scale={[0.32, 0.32, 0.32]} />
            </group>
          ) : null))}
        </group>
      </SceneShell>
    </Canvas>
  )
}

const MemoryScene = ({ state, onCardClick, theme }) => (
  <Canvas camera={{ position: [0, 7.4, 7.2], fov: 42 }} dpr={[1, 1.5]}>
    <SceneShell theme={theme} target={[0, 0.2, 0]} radius={9} height={6.7}>
      <group position={[-1.5, 0, -1.5]}>
        {state.payload.cards.map((card, index) => {
          const x = index % 4
          const y = Math.floor(index / 4)
          const flipped = card.revealed || card.matched
          return (
            <group key={card.id} position={[x * 1.05, 0, y * 1.22]} onPointerDown={() => onCardClick(index)}>
              <mesh castShadow rotation={[0, 0, flipped ? 0 : Math.PI]}>
                <boxGeometry args={[0.8, 0.12, 1.06]} />
                <meshStandardMaterial color={card.matched ? '#fbbf24' : flipped ? theme.glow : theme.tile} emissive={flipped ? theme.glow : '#000000'} emissiveIntensity={card.matched ? 0.35 : flipped ? 0.18 : 0} />
              </mesh>
              <LabelPlane label={flipped ? card.value : '✦'} position={[0, 0.07, 0]} bg={flipped ? 'rgba(12,18,28,0.2)' : 'rgba(15,23,42,0.7)'} scale={[0.5, 0.5, 0.5]} />
            </group>
          )
        })}
      </group>
    </SceneShell>
  </Canvas>
)

const MinesScene = ({ state, onCellClick, theme, mineMode }) => (
  <Canvas camera={{ position: [0, 11.2, 10.6], fov: 42 }} dpr={[1, 1.5]}>
    <SceneShell theme={theme} target={[0, 0.2, 0]} radius={12} height={9.2}>
      <group position={[-4.5, 0, -4.5]}>
        {state.payload.cells.flatMap((row, y) => row.map((cell, x) => {
          const label = cell.flagged ? '⚑' : cell.revealed ? (cell.mine ? '✹' : cell.count || '') : ''
          return (
            <CellPedestal
              key={`mine-${x}-${y}`}
              position={[x, 0, y]}
              color={cell.revealed ? '#223246' : theme.tile}
              onPointerDown={(event) => {
                const mode = event.button === 2 ? 'flag' : mineMode
                onCellClick(mode, x, y)
              }}
            >
              {cell.revealed && cell.mine ? (
                <mesh position={[0, 0.2, 0]} castShadow>
                  <icosahedronGeometry args={[0.24, 0]} />
                  <meshStandardMaterial color={theme.danger} emissive={theme.danger} emissiveIntensity={0.4} />
                </mesh>
              ) : null}
              {cell.revealed && !cell.mine && cell.count > 0 ? <group position={[0, 0.16, 0]}>{renderCountPips(cell.count)}</group> : null}
              {label ? <LabelPlane label={label} position={[0, 0.08, 0]} scale={[0.42, 0.42, 0.42]} bg="rgba(15,23,42,0.15)" /> : null}
            </CellPedestal>
          )
        }))}
      </group>
    </SceneShell>
  </Canvas>
)

const Game2048Scene = ({ state, theme }) => (
  <Canvas camera={{ position: [0, 8.6, 8.1], fov: 42 }} dpr={[1, 1.5]}>
    <SceneShell theme={theme} target={[0, 0.2, 0]} radius={10} height={7.5}>
      <group position={[-1.5, 0, -1.5]}>
        {state.payload.board.flatMap((row, y) => row.map((value, x) => {
          const glow = clamp((value || 0) / 2048, 0, 1)
          return (
            <group key={`2048-${x}-${y}`} position={[x * 1.1, 0, y * 1.1]}>
              <mesh castShadow>
                <boxGeometry args={[0.92, 0.16 + glow * 0.9, 0.92]} />
                <meshStandardMaterial color={value ? '#f59e0b' : theme.tile} emissive={value ? '#fbbf24' : '#000000'} emissiveIntensity={value ? 0.12 + glow * 0.35 : 0} />
              </mesh>
              <LabelPlane label={value || ''} position={[0, 0.12 + glow * 0.46, 0]} scale={[0.42, 0.42, 0.42]} bg={value ? 'rgba(120,53,15,0.35)' : 'rgba(15,23,42,0.25)'} />
            </group>
          )
        }))}
      </group>
    </SceneShell>
  </Canvas>
)

const MancalaScene = ({ state, onPitClick, theme }) => {
  const pits = state.payload.pits || []
  return (
    <Canvas camera={{ position: [0, 8.2, 7.6], fov: 40 }} dpr={[1, 1.5]}>
      <SceneShell theme={theme} target={[0, 0.2, 0]} radius={10} height={7.1}>
        <group>
          <mesh position={[-4.4, 0, 0]} onPointerDown={() => {}}>
            <cylinderGeometry args={[0.74, 0.9, 0.28, 32]} />
            <meshStandardMaterial color="#17263a" roughness={0.72} />
          </mesh>
          <LabelPlane label={pits[13] || 0} position={[-4.4, 0.18, 0]} scale={[0.5, 0.5, 0.5]} />
          <mesh position={[4.4, 0, 0]}>
            <cylinderGeometry args={[0.74, 0.9, 0.28, 32]} />
            <meshStandardMaterial color="#17263a" roughness={0.72} />
          </mesh>
          <LabelPlane label={pits[6] || 0} position={[4.4, 0.18, 0]} scale={[0.5, 0.5, 0.5]} />
          {[12, 11, 10, 9, 8, 7].map((pit, index) => (
            <group key={`top-${pit}`} position={[-2.9 + index * 1.16, 0, -1.05]} onPointerDown={() => onPitClick(pit)}>
              <mesh castShadow>
                <cylinderGeometry args={[0.44, 0.52, 0.18, 28]} />
                <meshStandardMaterial color={theme.tileAlt} roughness={0.64} />
              </mesh>
              <LabelPlane label={pits[pit] || 0} position={[0, 0.12, 0]} scale={[0.34, 0.34, 0.34]} />
            </group>
          ))}
          {[0, 1, 2, 3, 4, 5].map((pit, index) => (
            <group key={`bot-${pit}`} position={[-2.9 + index * 1.16, 0, 1.05]} onPointerDown={() => onPitClick(pit)}>
              <mesh castShadow>
                <cylinderGeometry args={[0.44, 0.52, 0.18, 28]} />
                <meshStandardMaterial color={theme.tileAlt} roughness={0.64} />
              </mesh>
              <LabelPlane label={pits[pit] || 0} position={[0, 0.12, 0]} scale={[0.34, 0.34, 0.34]} />
            </group>
          ))}
        </group>
      </SceneShell>
    </Canvas>
  )
}

const SkyDerbyScene = ({ state, onMove, theme }) => {
  const road = state.payload.road || []
  return (
    <div className="arcade-three-stack">
      <Canvas camera={{ position: [0, 6.4, 8.8], fov: 46 }} dpr={[1, 1.5]}>
        <SceneShell theme={theme} target={[0, 0.4, 0]} radius={9} height={6.8}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
            <planeGeometry args={[6.5, 12]} />
            <meshStandardMaterial color="#0b1d31" roughness={0.82} />
          </mesh>
          {[-1.06, 1.06].map((x) => (
            <mesh key={`lane-${x}`} position={[x, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[0.08, 12]} />
              <meshBasicMaterial color="white" transparent opacity={0.18} />
            </mesh>
          ))}
          {road.map((row, index) => (
            <mesh key={row.id} position={[-2.1 + row.lane * 2.1, 0.22, -4.8 + index * 1.36]} castShadow>
              <boxGeometry args={[1.6, 0.26, 0.5]} />
              <meshStandardMaterial color={theme.accent} emissive={theme.accent} emissiveIntensity={0.28} />
            </mesh>
          ))}
          {state.players.map((player, index) => {
            const pos = state.payload.positions?.[player.id] || { lane: 1, score: 0 }
            return (
              <group key={player.id} position={[-2.1 + pos.lane * 2.1, 0.36, 4.3 - index * 0.75]}>
                <mesh castShadow>
                  <boxGeometry args={[1.1, 0.25, 1.55]} />
                  <meshStandardMaterial color={index === 0 ? theme.glow : theme.accent2} emissive={index === 0 ? theme.glow : theme.accent2} emissiveIntensity={0.22} />
                </mesh>
                <LabelPlane label={player.username.slice(0, 1).toUpperCase()} position={[0, 0.18, 0]} scale={[0.36, 0.36, 0.36]} />
              </group>
            )
          })}
        </SceneShell>
      </Canvas>
      <div className="arcade-three-toolbar">
        {[0, 1, 2].map((lane) => (
          <button key={`lane-${lane}`} className="arcade-btn secondary" onClick={() => onMove(lane, 1)}>Lane {lane + 1}</button>
        ))}
        {[0, 1, 2].map((lane) => (
          <button key={`boost-${lane}`} className="arcade-btn pink" onClick={() => onMove(lane, 2)}>Boost {lane + 1}</button>
        ))}
      </div>
    </div>
  )
}

const TowerScene = ({ state, onStack, theme }) => (
  <Canvas camera={{ position: [0, 9.2, 10.4], fov: 44 }} dpr={[1, 1.5]}>
    <SceneShell theme={theme} target={[0, 0.6, 0]} radius={10} height={7.8}>
      <group position={[-1.5, 0, -1.5]}>
        {state.payload.heights.flatMap((row, y) => row.map((height, x) => {
          const owner = state.payload.owners[y][x]
          const color = owner === state.players[0]?.id ? theme.glow : owner ? theme.accent2 : theme.tile
          return (
            <group key={`stack-${x}-${y}`} position={[x * 1.2, 0, y * 1.2]} onPointerDown={() => onStack(x, y)}>
              <mesh position={[0, 0, 0]} castShadow>
                <cylinderGeometry args={[0.46, 0.54, 0.12, 28]} />
                <meshStandardMaterial color="#102033" />
              </mesh>
              {Array.from({ length: height }).map((_, index) => (
                <mesh key={`cube-${index}`} position={[0, 0.18 + index * 0.34, 0]} castShadow>
                  <boxGeometry args={[0.72, 0.28, 0.72]} />
                  <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.08 + index * 0.03} />
                </mesh>
              ))}
              {height ? <LabelPlane label={height} position={[0, 0.24 + height * 0.34, 0]} scale={[0.34, 0.34, 0.34]} /> : null}
            </group>
          )
        }))}
      </group>
    </SceneShell>
  </Canvas>
)

const themeForMode = (meta) => ({
  ...DEFAULT_THEME,
  ...(meta?.theme || {}),
})

const engineForMode = (meta) => meta?.engine || meta?.id || 'checkers'

const ArcadeParty3DScene = ({ meta, state, selected, onAction, disabled = false }) => {
  const [mineMode, setMineMode] = useState('reveal')
  const theme = themeForMode(meta)
  const engine = engineForMode(meta)

  if (engine === 'checkers') {
    return <CheckersScene state={state} selected={selected} theme={theme} onCellClick={(x, y) => !disabled && onAction({ x, y })} />
  }
  if (engine === 'reversi') {
    return <ReversiScene state={state} theme={theme} onCellClick={(x, y) => !disabled && onAction({ x, y })} />
  }
  if (engine === 'gomoku') {
    return <ReversiScene state={state} theme={theme} large size={15} onCellClick={(x, y) => !disabled && onAction({ x, y })} />
  }
  if (engine === 'dots-and-boxes') {
    return <DotsScene state={state} theme={theme} onEdgeClick={(orientation, x, y) => !disabled && onAction({ orientation, x, y })} />
  }
  if (engine === 'memory-match') {
    return <MemoryScene state={state} theme={theme} onCardClick={(index) => !disabled && onAction({ index })} />
  }
  if (engine === 'minesweeper-party') {
    return (
      <div className="arcade-three-stack">
        <MinesScene state={state} theme={theme} mineMode={mineMode} onCellClick={(mode, x, y) => !disabled && onAction({ mode, x, y })} />
        <div className="arcade-three-toolbar">
          <button className={`arcade-btn${mineMode === 'reveal' ? '' : ' secondary'}`} onClick={() => setMineMode('reveal')}>Reveal</button>
          <button className={`arcade-btn${mineMode === 'flag' ? ' pink' : ' secondary'}`} onClick={() => setMineMode('flag')}>Flag</button>
        </div>
      </div>
    )
  }
  if (engine === 'party-2048') {
    return (
      <div className="arcade-three-stack">
        <Game2048Scene state={state} theme={theme} />
        <div className="arcade-three-toolbar">
          {['up', 'left', 'right', 'down'].map((direction) => (
            <button key={direction} className="arcade-btn secondary" onClick={() => !disabled && onAction({ direction })}>{direction}</button>
          ))}
        </div>
      </div>
    )
  }
  if (engine === 'mancala') {
    return <MancalaScene state={state} theme={theme} onPitClick={(index) => !disabled && onAction({ index })} />
  }
  if (engine === 'sky-derby-3d') {
    return <SkyDerbyScene state={state} theme={theme} onMove={(lane, speed) => !disabled && onAction({ lane, speed })} />
  }
  if (engine === 'tower-stack-3d') {
    return <TowerScene state={state} theme={theme} onStack={(x, y) => !disabled && onAction({ x, y })} />
  }
  return null
}

export default ArcadeParty3DScene
