import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Line, OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { CanvasTexture, Color, DoubleSide, MOUSE, Vector3 } from 'three'
import { getMiniGolfCourse } from './courses'
import { buildAimLinePoints, getEntityPosition, getHazardColor, getSurfaceColor, toVector3 } from './scene-utils'
import { sampleMovingHazardPosition } from './physics'

const DEFAULT_CAMERA_OFFSET = new Vector3(9, 10.5, 11)
const ballTextureCache = new Map()
const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

const getBallTexture = (accentColor = '#ffffff') => {
  if (ballTextureCache.has(accentColor)) return ballTextureCache.get(accentColor)

  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fcfdff'
  ctx.fillRect(0, 0, 256, 256)
  ctx.fillStyle = accentColor
  ctx.fillRect(0, 92, 256, 72)
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'
  ctx.lineWidth = 8
  ctx.beginPath()
  ctx.moveTo(0, 92)
  ctx.lineTo(256, 92)
  ctx.moveTo(0, 164)
  ctx.lineTo(256, 164)
  ctx.stroke()

  for (let y = 10; y < 246; y += 16) {
    for (let x = 10; x < 246; x += 16) {
      const offset = ((y / 16) % 2) * 8
      ctx.fillStyle = 'rgba(148, 163, 184, 0.16)'
      ctx.beginPath()
      ctx.arc(x + offset, y, 2.5, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  const texture = new CanvasTexture(canvas)
  texture.needsUpdate = true
  ballTextureCache.set(accentColor, texture)
  return texture
}

const SceneCamera = ({ initialTargetKey, initialTarget, followTarget }) => {
  const cameraRef = useRef(null)
  const controlsRef = useRef(null)
  const offsetRef = useRef(DEFAULT_CAMERA_OFFSET.clone())
  const desiredTargetRef = useRef(new Vector3())
  const nextCameraPositionRef = useRef(new Vector3())
  const followVectorRef = useRef(new Vector3())

  useEffect(() => {
    if (!cameraRef.current || !controlsRef.current || !initialTarget) return
    cameraRef.current.position.copy(DEFAULT_CAMERA_OFFSET).add(new Vector3(initialTarget.x, 0, initialTarget.z))
    controlsRef.current.target.set(initialTarget.x, 0.1, initialTarget.z)
    offsetRef.current.copy(cameraRef.current.position).sub(controlsRef.current.target)
    controlsRef.current.update()
  }, [initialTargetKey, initialTarget])

  useFrame(() => {
    const camera = cameraRef.current
    const controls = controlsRef.current
    if (!camera || !controls) return

    offsetRef.current.copy(camera.position).sub(controls.target)

    if (!followTarget) return
    desiredTargetRef.current.set(followTarget.x, 0.1, followTarget.z)
    controls.target.lerp(desiredTargetRef.current, 0.12)
    nextCameraPositionRef.current.copy(controls.target).add(offsetRef.current)
    camera.position.lerp(nextCameraPositionRef.current, 0.12)
    controls.update()
    followVectorRef.current.copy(camera.position).sub(controls.target)
    if (followVectorRef.current.lengthSq() > 0.0001) {
      offsetRef.current.copy(followVectorRef.current)
    }
  })

  return (
    <>
      <PerspectiveCamera ref={cameraRef} makeDefault position={[8, 10, 10]} fov={44} />
      <OrbitControls
        ref={controlsRef}
        enablePan={false}
        minDistance={9}
        maxDistance={24}
        maxPolarAngle={Math.PI / 2.08}
        mouseButtons={{
          LEFT: null,
          MIDDLE: MOUSE.DOLLY,
          RIGHT: MOUSE.ROTATE
        }}
      />
    </>
  )
}

const MovingHazards = ({ hazards = [], palette }) => {
  const groupRef = useRef([])

  useFrame(({ clock }) => {
    const elapsed = clock.getElapsedTime()
    groupRef.current.forEach((mesh, index) => {
      const hazard = hazards[index]
      if (!mesh || !hazard) return
      const point = sampleMovingHazardPosition(hazard, elapsed)
      mesh.position.set(point.x, 0.85, point.z)
      mesh.rotation.y += 0.025
    })
  })

  return hazards.map((hazard, index) => (
    <mesh
      key={hazard.id}
      ref={(node) => { groupRef.current[index] = node }}
      position={getEntityPosition(hazard)}
      castShadow
    >
      <boxGeometry args={[hazard.size.x, 1.1, hazard.size.z]} />
      <meshStandardMaterial color={getHazardColor('bumper', palette)} emissive={getHazardColor('bumper', palette)} emissiveIntensity={0.35} />
    </mesh>
  ))
}

const ObstacleMesh = ({ obstacle, palette }) => {
  const width = Number(obstacle?.size?.x || 1)
  const depth = Number(obstacle?.size?.z || 1)
  const height = Number(obstacle?.height || 1.4)
  const variant = obstacle?.variant || 'wall'

  if (variant === 'bumper-post') {
    return (
      <group position={[obstacle.position.x, height * 0.5, obstacle.position.z]}>
        <mesh castShadow receiveShadow>
          <cylinderGeometry args={[0.55, 0.72, height, 24]} />
          <meshStandardMaterial color={palette.accent} emissive={palette.accent} emissiveIntensity={0.14} roughness={0.3} metalness={0.4} />
        </mesh>
        <mesh position={[0, height * 0.34, 0]}>
          <torusGeometry args={[0.74, 0.1, 16, 32]} />
          <meshStandardMaterial color="#fff7ed" />
        </mesh>
      </group>
    )
  }

  return (
    <group position={[obstacle.position.x, height * 0.5, obstacle.position.z]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial color={palette.wall} roughness={0.52} metalness={0.18} />
      </mesh>
      <mesh position={[0, height * 0.46, 0]} castShadow>
        <boxGeometry args={[width * 1.04, 0.14, depth * 1.04]} />
        <meshStandardMaterial color={palette.accent} emissive={palette.accent} emissiveIntensity={0.1} />
      </mesh>
    </group>
  )
}

const HazardPads = ({ hazards = [], palette }) => hazards.map((hazard) => (
  <group key={hazard.id} position={[hazard.position.x, 0.04, hazard.position.z]}>
    <mesh rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[hazard.size.x, hazard.size.z]} />
      <meshBasicMaterial color={getHazardColor(hazard.type, palette)} transparent opacity={hazard.type === 'void' ? 0.88 : 0.64} />
    </mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
      <ringGeometry args={[Math.max(hazard.size.x, hazard.size.z) * 0.28, Math.max(hazard.size.x, hazard.size.z) * 0.46, 30]} />
      <meshBasicMaterial color={palette.accent} transparent opacity={0.18} />
    </mesh>
  </group>
))

const SceneryObjects = ({ scenery = [], palette }) => scenery.map((item, index) => {
  const key = `${item.type}-${index}`
  const position = [item.x || 0, 0, item.z || 0]

  if (item.type === 'tower' || item.type === 'smokestack') {
    return (
      <group key={key} position={position}>
        <mesh position={[0, 2.9, 0]} castShadow>
          <boxGeometry args={[1.8, 5.8, 1.8]} />
          <meshStandardMaterial color="#cbd5e1" roughness={0.56} metalness={0.32} />
        </mesh>
        <mesh position={[0, 6.1, 0]} castShadow>
          <cylinderGeometry args={[0.92, 1.08, 0.9, 18]} />
          <meshStandardMaterial color={palette.accent} />
        </mesh>
      </group>
    )
  }

  if (item.type === 'billboard' || item.type === 'aurora') {
    return (
      <group key={key} position={position}>
        <mesh position={[0, 2.5, 0]} castShadow>
          <boxGeometry args={[4.4, 2.5, 0.2]} />
          <meshStandardMaterial color={palette.accent} emissive={palette.accent} emissiveIntensity={0.16} />
        </mesh>
        <mesh position={[0, 0.95, 0]}>
          <boxGeometry args={[0.2, 1.9, 0.2]} />
          <meshStandardMaterial color="#cbd5e1" />
        </mesh>
      </group>
    )
  }

  if (item.type === 'iceberg' || item.type === 'ice-spire') {
    return (
      <group key={key} position={position}>
        <mesh position={[0, 1.6, 0]} castShadow>
          <coneGeometry args={[1.6, 3.6, 6]} />
          <meshStandardMaterial color="#dbeafe" roughness={0.18} metalness={0.1} />
        </mesh>
      </group>
    )
  }

  if (item.type === 'anvil' || item.type === 'forge') {
    return (
      <group key={key} position={position}>
        <mesh position={[0, 0.82, 0]} castShadow>
          <boxGeometry args={[2.5, 1.2, 1.7]} />
          <meshStandardMaterial color="#4b5563" roughness={0.62} metalness={0.24} />
        </mesh>
        <mesh position={[0, 1.56, 0]} castShadow>
          <boxGeometry args={[1.12, 0.32, 2.1]} />
          <meshStandardMaterial color={palette.accent} emissive={palette.accent} emissiveIntensity={0.12} />
        </mesh>
      </group>
    )
  }

  return null
})

const PlayerBalls = ({ players, activePlayerId, playbackPosition }) => {
  return players.map((player) => {
    const point = playbackPosition?.playerId === player.id ? playbackPosition.position : player.position
    const ballTexture = getBallTexture(player.color)
    return (
      <group key={player.id} position={[point.x, 0.4, point.z]}>
        <mesh castShadow receiveShadow>
          <sphereGeometry args={[0.34, 30, 30]} />
          <meshStandardMaterial map={ballTexture} color="#ffffff" roughness={0.2} metalness={0.24} />
        </mesh>
        <mesh position={[0, 0.54, 0]}>
          <ringGeometry args={[0.4, 0.48, 30]} />
          <meshBasicMaterial color={player.id === activePlayerId ? '#ffffff' : player.color} />
        </mesh>
      </group>
    )
  })
}

const PlaybackController = ({ shotPlayback, onComplete }) => {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    setIndex(0)
  }, [shotPlayback?.actionId])

  useFrame(() => {
    if (!shotPlayback?.path?.length) return
    setIndex((current) => {
      const next = Math.min(current + 1, shotPlayback.path.length - 1)
      if (next === shotPlayback.path.length - 1 && current !== next) {
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

const MiniGolfWorld = ({
  course,
  hole,
  players,
  activePlayerId,
  aimState,
  isMyTurn,
  shotPlayback,
  onAimDrag,
  onAimCancel,
  onShotPlaybackComplete
}) => {
  const palette = course.palette
  const activePlayer = players.find((player) => player.id === activePlayerId) || players[0]
  const playbackState = shotPlayback ? { playerId: shotPlayback.playerId, position: shotPlayback.path?.[0] || shotPlayback.finalPosition } : null

  const [renderPlayback, setRenderPlayback] = useState(playbackState)
  const dragStateRef = useRef({ active: false, angle: 0, power: 0.25 })

  useEffect(() => {
    if (!shotPlayback) {
      setRenderPlayback(null)
      return
    }
    setRenderPlayback({
      actionId: shotPlayback.actionId,
      playerId: shotPlayback.playerId,
      path: shotPlayback.path || [],
      finalPosition: shotPlayback.finalPosition,
      position: shotPlayback.path?.[0] || shotPlayback.finalPosition
    })
  }, [shotPlayback])

  useEffect(() => {
    const handlePointerUp = () => {
      if (!dragStateRef.current.active) return
      dragStateRef.current.active = false
      onAimDrag?.({ angle: dragStateRef.current.angle, power: dragStateRef.current.power }, { commit: true })
    }

    const handleBlur = () => {
      if (!dragStateRef.current.active) return
      dragStateRef.current.active = false
      onAimCancel?.()
    }

    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('blur', handleBlur)
    return () => {
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('blur', handleBlur)
    }
  }, [onAimCancel, onAimDrag])

  const aimLine = useMemo(() => {
    if (!isMyTurn || !aimState?.active || !activePlayer?.position) return null
    return buildAimLinePoints(activePlayer.position, aimState.angle, aimState.power)
  }, [isMyTurn, aimState, activePlayer])

  const cameraTarget = renderPlayback?.position || activePlayer?.position || hole.tee

  return (
    <>
      <color attach="background" args={[new Color(palette.backgroundBottom)]} />
      <fog attach="fog" args={[palette.backgroundBottom, 20, 52]} />
      <ambientLight intensity={1.1} />
      <directionalLight
        position={[6, 12, 8]}
        intensity={2.2}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <hemisphereLight args={[palette.backgroundTop, '#102514', 0.65]} />
      <SceneCamera initialTargetKey={`${course.id}:${hole.id}`} initialTarget={hole.tee} followTarget={cameraTarget} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[46, 30]} />
        <meshStandardMaterial color={palette.rough} roughness={0.98} />
      </mesh>

      {hole.surfaces.map((surface) => (
        <group key={surface.id} position={toVector3(surface.position, 0.02)}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[surface.size.x, surface.size.z]} />
            <meshStandardMaterial color={getSurfaceColor(surface.type, palette)} roughness={surface.type === 'ice' ? 0.16 : 0.82} metalness={surface.type === 'ice' ? 0.18 : 0.05} />
          </mesh>
          <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[Math.max(surface.size.x, surface.size.z) * 0.3, Math.max(surface.size.x, surface.size.z) * 0.5, 32]} />
            <meshBasicMaterial color={palette.accent} transparent opacity={surface.type === 'fairway' ? 0.05 : 0.11} />
          </mesh>
        </group>
      ))}

      {hole.obstacles.map((obstacle) => (
        <ObstacleMesh key={obstacle.id} obstacle={obstacle} palette={palette} />
      ))}

      <HazardPads hazards={hole.hazards} palette={palette} />

      <MovingHazards hazards={hole.movingHazards} palette={palette} />
      <SceneryObjects scenery={hole.scenery} palette={palette} />

      <group position={[hole.cup.x, 0.05, hole.cup.z]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.28, hole.cup.radius || 0.5, 28]} />
          <meshBasicMaterial color={palette.accent} />
        </mesh>
        <mesh position={[0, 1.65, 0]}>
          <boxGeometry args={[0.06, 3.2, 0.06]} />
          <meshStandardMaterial color="#f4f4f5" />
        </mesh>
        <mesh position={[0.54, 2.2, 0]}>
          <boxGeometry args={[1, 0.5, 0.05]} />
          <meshStandardMaterial color={palette.accent} emissive={palette.accent} emissiveIntensity={0.25} />
        </mesh>
      </group>

      <PlayerBalls players={players} activePlayerId={activePlayerId} playbackPosition={renderPlayback} />

      {isMyTurn && !shotPlayback ? (
        <mesh
          position={[0, 3.1, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          onPointerDown={(event) => {
            if (!activePlayer?.position) return
            event.stopPropagation()
            const dx = activePlayer.position.x - event.point.x
            const dz = activePlayer.position.z - event.point.z
            const nextAim = {
              angle: Math.atan2(dz, dx),
              power: clamp(Math.hypot(dx, dz) / 7.5, 0.08, 1)
            }
            dragStateRef.current = { active: true, ...nextAim }
            onAimDrag?.(nextAim)
          }}
          onPointerMove={(event) => {
            if (!dragStateRef.current.active || !activePlayer?.position) return
            event.stopPropagation()
            const dx = activePlayer.position.x - event.point.x
            const dz = activePlayer.position.z - event.point.z
            const nextAim = {
              angle: Math.atan2(dz, dx),
              power: clamp(Math.hypot(dx, dz) / 7.5, 0.08, 1)
            }
            dragStateRef.current = { active: true, ...nextAim }
            onAimDrag?.(nextAim)
          }}
          onPointerUp={(event) => {
            if (!dragStateRef.current.active) return
            event.stopPropagation()
            dragStateRef.current.active = false
            onAimDrag?.({ angle: dragStateRef.current.angle, power: dragStateRef.current.power }, { commit: true })
          }}
        >
          <planeGeometry args={[58, 40]} />
          <meshBasicMaterial transparent opacity={0} side={DoubleSide} />
        </mesh>
      ) : null}

      {aimLine ? <Line points={aimLine} color="#ffffff" lineWidth={2.1} transparent opacity={0.8} /> : null}

      {renderPlayback ? (
        <PlaybackController
          shotPlayback={renderPlayback}
          onComplete={() => {
            setRenderPlayback(null)
            onShotPlaybackComplete?.()
          }}
        />
      ) : null}
    </>
  )
}

const MiniGolfScene = (props) => {
  const { courseId, holeIndex } = props
  const course = getMiniGolfCourse(courseId)
  const hole = course.holes[holeIndex] || course.holes[0]

  return (
    <div className="mgx-scene" onContextMenu={(event) => event.preventDefault()}>
      <Canvas shadows gl={{ antialias: true }}>
        <MiniGolfWorld {...props} course={course} hole={hole} />
      </Canvas>
    </div>
  )
}

export default MiniGolfScene
