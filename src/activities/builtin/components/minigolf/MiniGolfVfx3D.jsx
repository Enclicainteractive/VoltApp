import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Line } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const TRAIL_HISTORY = 36
const IMPACT_PARTICLE_COUNT = 14
const CUP_PARTICLE_COUNT = 22

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const lerp = (from, to, alpha) => from + (to - from) * alpha

const colorToThree = (value, fallback = '#ffffff') => {
  try {
    return new THREE.Color(value || fallback)
  } catch {
    return new THREE.Color(fallback)
  }
}

const buildTrailGradient = (baseColor) => {
  const color = colorToThree(baseColor, '#ffffff')
  const bright = color.clone().lerp(new THREE.Color('#ffffff'), 0.45)
  return [bright.getStyle(), color.getStyle()]
}

function useStablePosition(point, fallbackY = 0.22) {
  return useMemo(() => new THREE.Vector3(point?.x || 0, fallbackY, point?.z || 0), [point?.x, point?.z, fallbackY])
}

const BallTrail = React.memo(function BallTrail({
  anchor,
  visible = true,
  color = '#ffffff',
  active = false,
  height = 0.24,
  resetKey = 'default'
}) {
  const pointsRef = useRef([])
  const [trailPoints, setTrailPoints] = useState([])

  useEffect(() => {
    pointsRef.current = []
    setTrailPoints([])
  }, [resetKey])

  useFrame((_, delta) => {
    if (!anchor) return

    const nowPoint = new THREE.Vector3(anchor.x, height, anchor.z)
    const history = pointsRef.current
    const last = history[0]
    if (last && last.distanceToSquared(nowPoint) > 36) {
      history.length = 0
      setTrailPoints([])
    }
    const nextLast = history[0]
    const moved = !nextLast || nextLast.distanceToSquared(nowPoint) > 0.0025

    if (visible && moved) {
      history.unshift(nowPoint)
      if (history.length > TRAIL_HISTORY) history.length = TRAIL_HISTORY
      setTrailPoints(history.map((point, index) => {
        const fade = 1 - index / Math.max(1, history.length - 1)
        return new THREE.Vector3(point.x, point.y + fade * 0.08, point.z)
      }))
      return
    }

    if (!visible && history.length) {
      history.splice(Math.max(0, history.length - Math.ceil(delta * 90 * 3)))
      if (!history.length) {
        setTrailPoints([])
        return
      }
      setTrailPoints(history.map((point, index) => {
        const fade = 1 - index / Math.max(1, history.length - 1)
        return new THREE.Vector3(point.x, point.y + fade * 0.05, point.z)
      }))
    }
  })

  if (trailPoints.length < 2) return null
  const [startColor, endColor] = buildTrailGradient(color)

  return (
    <>
      <Line
        points={trailPoints}
        color={startColor}
        transparent
        opacity={active ? 0.78 : 0.48}
        lineWidth={active ? 4.2 : 2.4}
      />
      <Line
        points={trailPoints.slice(0, Math.max(2, Math.floor(trailPoints.length * 0.45)))}
        color={endColor}
        transparent
        opacity={active ? 0.94 : 0.72}
        lineWidth={active ? 1.9 : 1.3}
      />
    </>
  )
})

const BallWake = React.memo(function BallWake({
  anchor,
  color = '#ffffff',
  visible = true,
  scale = 1
}) {
  const ringRef = useRef()
  const haloRef = useRef()

  useFrame(({ clock }, delta) => {
    if (!ringRef.current || !haloRef.current || !anchor) return
    ringRef.current.position.set(anchor.x, 0.04, anchor.z)
    haloRef.current.position.set(anchor.x, 0.03, anchor.z)
    const pulse = 1 + Math.sin(clock.getElapsedTime() * 8) * 0.1
    ringRef.current.scale.setScalar(lerp(ringRef.current.scale.x, scale * pulse, Math.min(1, delta * 8)))
    haloRef.current.scale.setScalar(lerp(haloRef.current.scale.x, scale * 1.35, Math.min(1, delta * 6)))
  })

  if (!visible || !anchor) return null

  return (
    <>
      <mesh ref={haloRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.6, 1.1, 36]} />
        <meshBasicMaterial color={color} transparent opacity={0.16} depthWrite={false} />
      </mesh>
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.78, 0.98, 36]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.52} depthWrite={false} />
      </mesh>
    </>
  )
})

const ParticleBurst = React.memo(function ParticleBurst({
  origin,
  seed = 'burst',
  color = '#ffffff',
  count = IMPACT_PARTICLE_COUNT,
  duration = 0.72,
  spread = 1.2,
  lift = 0.9,
  size = 0.07
}) {
  const startedAt = useRef(performance.now())
  const particles = useMemo(() => {
    const hashSeed = `${seed}:${origin?.x || 0}:${origin?.z || 0}:${count}`
    return Array.from({ length: count }, (_, index) => {
      const mix = ((hashSeed.length * 13) + (index * 17)) % 360
      const angle = (mix / 360) * Math.PI * 2
      const radius = 0.35 + ((index * 29) % 100) / 100 * spread
      const rise = 0.2 + ((index * 11) % 100) / 100 * lift
      return {
        angle,
        radius,
        rise,
        scale: 0.8 + ((index * 7) % 10) / 10
      }
    })
  }, [count, lift, origin?.x, origin?.z, seed, spread])

  const elapsed = (performance.now() - startedAt.current) / 1000
  if (!origin || elapsed > duration) return null
  const progress = clamp(elapsed / duration, 0, 1)
  const opacity = 1 - progress

  return (
    <group position={[origin.x, 0.16, origin.z]}>
      {particles.map((particle, index) => {
        const x = Math.cos(particle.angle) * particle.radius * progress
        const z = Math.sin(particle.angle) * particle.radius * progress
        const y = particle.rise * progress - progress * progress * 0.28
        return (
          <mesh key={`${seed}-${index}`} position={[x, y, z]} scale={size * particle.scale}>
            <sphereGeometry args={[1, 10, 10]} />
            <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
          </mesh>
        )
      })}
    </group>
  )
})

const CupCelebration = React.memo(function CupCelebration({
  cup,
  triggerKey,
  accentColor = '#38bdf8'
}) {
  const [bursts, setBursts] = useState([])
  const confettiRef = useRef([])

  useEffect(() => {
    if (!triggerKey || !cup) return
    setBursts([{ id: triggerKey, origin: { x: cup.x, z: cup.z } }])
  }, [cup, triggerKey])

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    confettiRef.current.forEach((node, index) => {
      if (!node || !cup) return
      const orbit = (index / Math.max(1, CUP_PARTICLE_COUNT)) * Math.PI * 2 + t * 0.8
      const radius = 0.9 + Math.sin(t * 1.7 + index) * 0.18
      node.position.set(
        cup.x + Math.cos(orbit) * radius,
        1.6 + Math.sin(t * 2.4 + index) * 0.34,
        cup.z + Math.sin(orbit) * radius
      )
      node.rotation.x += 0.04
      node.rotation.y += 0.05
    })
  })

  if (!cup || !triggerKey) return null

  return (
    <>
      <group>
        {Array.from({ length: CUP_PARTICLE_COUNT }, (_, index) => (
          <mesh
            key={`cup-confetti-${triggerKey}-${index}`}
            ref={(node) => { confettiRef.current[index] = node }}
            position={[cup.x, 1.2, cup.z]}
            scale={[0.18, 0.09, 0.18]}
          >
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial
              color={index % 2 === 0 ? accentColor : '#ffffff'}
              transparent
              opacity={0.88}
              depthWrite={false}
            />
          </mesh>
        ))}
      </group>
      {bursts.map((burst) => (
        <ParticleBurst
          key={burst.id}
          origin={burst.origin}
          seed={`cup-${burst.id}`}
          color={accentColor}
          count={22}
          duration={1.2}
          spread={1.9}
          lift={1.6}
          size={0.09}
        />
      ))}
    </>
  )
})

export const MiniGolfBallVfx = React.memo(function MiniGolfBallVfx({
  player,
  position,
  isActive = false,
  isMoving = false,
  trailEnabled = true,
  particlesEnabled = true,
  ballVisualRadius = 0.22,
  resetKey = 'default'
}) {
  const stablePosition = useStablePosition(position, ballVisualRadius)
  const [bursts, setBursts] = useState([])
  const lastMovingRef = useRef(false)

  useEffect(() => {
    if (!particlesEnabled) return
    if (!lastMovingRef.current && isMoving && position) {
      setBursts((current) => [
        ...current.slice(-3),
        {
          id: `${player?.id || 'ball'}-start-${performance.now()}`,
          origin: { x: position.x, z: position.z }
        }
      ])
    }
    lastMovingRef.current = !!isMoving
  }, [isMoving, particlesEnabled, player?.id, position])

  return (
    <>
      <BallTrail
        anchor={stablePosition}
        visible={trailEnabled && isMoving}
        color={player?.color || '#ffffff'}
        active={isActive}
        height={ballVisualRadius * 1.02}
        resetKey={resetKey}
      />
      <BallWake
        anchor={stablePosition}
        visible={isMoving}
        color={player?.color || '#ffffff'}
        scale={isActive ? 1.05 : 0.88}
      />
      {particlesEnabled && bursts.map((burst) => (
        <ParticleBurst
          key={burst.id}
          origin={burst.origin}
          seed={burst.id}
          color={player?.color || '#ffffff'}
        />
      ))}
    </>
  )
})

export const MiniGolfCupCelebration = React.memo(function MiniGolfCupCelebration({
  cup,
  resultType,
  triggerKey,
  accentColor = '#38bdf8'
}) {
  if (resultType !== 'cup') return null
  return <CupCelebration cup={cup} triggerKey={triggerKey} accentColor={accentColor} />
})

export const MiniGolfShotImpactBursts = React.memo(function MiniGolfShotImpactBursts({
  shotPlayback,
  color = '#ffffff',
  particlesEnabled = true
}) {
  const [bursts, setBursts] = useState([])

  useEffect(() => {
    if (!particlesEnabled || !shotPlayback?.path?.length) return
    const path = shotPlayback.path
    const points = []
    for (let index = 2; index < path.length - 1; index += 1) {
      const prev = path[index - 1]
      const current = path[index]
      const next = path[index + 1]
      const before = new THREE.Vector2(current.x - prev.x, current.z - prev.z)
      const after = new THREE.Vector2(next.x - current.x, next.z - current.z)
      if (before.lengthSq() < 0.0004 || after.lengthSq() < 0.0004) continue
      const turn = Math.abs(before.normalize().dot(after.normalize()))
      if (turn < 0.72) {
        points.push({
          id: `${shotPlayback.actionId}-impact-${index}`,
          origin: { x: current.x, z: current.z }
        })
      }
      if (points.length >= 3) break
    }
    setBursts(points)
  }, [particlesEnabled, shotPlayback?.actionId, shotPlayback?.path])

  if (!particlesEnabled) return null

  return (
    <>
      {bursts.map((burst) => (
        <ParticleBurst
          key={burst.id}
          origin={burst.origin}
          seed={burst.id}
          color={color}
          count={10}
          duration={0.56}
          spread={0.85}
          lift={0.65}
          size={0.06}
        />
      ))}
    </>
  )
})
