import React, { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const STAR_COUNT = 34
const DUNE_COUNT = 7
const CITY_TOWER_COUNT = 10

const createStripeTexture = (baseColor, accentColor) => {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = baseColor
  ctx.fillRect(0, 0, 256, 256)

  for (let y = 0; y < 256; y += 24) {
    ctx.fillStyle = y % 48 === 0 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.03)'
    ctx.fillRect(0, y, 256, 10)
  }

  for (let i = 0; i < 12; i += 1) {
    ctx.strokeStyle = i % 2 === 0 ? `${accentColor}66` : 'rgba(255,255,255,0.08)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(-20, 18 + i * 20)
    ctx.lineTo(276, 2 + i * 20)
    ctx.stroke()
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(1.6, 1.6)
  texture.needsUpdate = true
  return texture
}

const createGlowTexture = (accentColor) => {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  const gradient = ctx.createRadialGradient(128, 128, 18, 128, 128, 120)
  gradient.addColorStop(0, `${accentColor}ee`)
  gradient.addColorStop(0.35, `${accentColor}88`)
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 256, 256)

  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  return texture
}

const hashCode = (value) => {
  const text = String(value || 'seed')
  let hash = 0
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(index)
    hash |= 0
  }
  return Math.abs(hash)
}

const seededValue = (seed, offset) => {
  const raw = Math.sin(seed * 12.9898 + offset * 78.233) * 43758.5453
  return raw - Math.floor(raw)
}

const buildBackdropDescriptors = (hole, environment) => {
  const bounds = hole?.bounds || { minX: -18, maxX: 18, minZ: -12, maxZ: 12 }
  const centerX = (bounds.minX + bounds.maxX) / 2
  const centerZ = (bounds.minZ + bounds.maxZ) / 2
  const radiusX = (bounds.maxX - bounds.minX) * 0.72 + 10
  const radiusZ = (bounds.maxZ - bounds.minZ) * 0.72 + 10
  const seed = hashCode(`${hole?.id || 'hole'}:${environment || 'generic'}`)

  return Array.from({ length: 12 }, (_, index) => {
    const angle = (index / 12) * Math.PI * 2
    const offset = index + 1
    return {
      key: `${hole?.id || 'hole'}-backdrop-${index}`,
      x: centerX + Math.cos(angle) * (radiusX + seededValue(seed, offset) * 5),
      z: centerZ + Math.sin(angle) * (radiusZ + seededValue(seed, offset + 12) * 5),
      scale: 0.8 + seededValue(seed, offset + 24) * 1.8,
      rotateY: angle + seededValue(seed, offset + 36) * 0.3,
      variant: environment === 'space' ? 'satellite' : environment === 'desert' ? 'mesa' : environment === 'snow' ? 'ice' : 'tower'
    }
  })
}

const BackdropRing = React.memo(({ radius = 36, color = '#7cf7ff', opacity = 0.16, y = 7.5 }) => (
  <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]}>
    <ringGeometry args={[radius, radius + 0.8, 72]} />
    <meshBasicMaterial color={color} transparent opacity={opacity} side={THREE.DoubleSide} />
  </mesh>
))

export const MiniGolfBackdrop = React.memo(({ course, hole, palette = {} }) => {
  const environment = course?.environment || 'generic'
  const descriptors = useMemo(() => buildBackdropDescriptors(hole, environment), [environment, hole])
  const starRefs = useRef([])
  const descriptorRefs = useRef([])

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    starRefs.current.forEach((mesh, index) => {
      if (!mesh) return
      mesh.position.y = 11 + Math.sin(t * 0.45 + index) * 0.6
      mesh.material.opacity = 0.25 + (Math.sin(t * 1.1 + index * 0.7) + 1) * 0.1
    })
    descriptorRefs.current.forEach((group, index) => {
      if (!group) return
      group.rotation.y += 0.0016 + index * 0.00003
      group.position.y = Math.sin(t * 0.35 + index * 0.4) * 0.25
    })
  })

  const starColor = palette.accent || '#7cf7ff'
  const lowerColor = palette.backgroundBottom || '#091223'
  const upperColor = palette.backgroundTop || '#1f355c'

  return (
    <group>
      <mesh position={[0, 28, -40]}>
        <planeGeometry args={[160, 70]} />
        <meshBasicMaterial color={upperColor} transparent opacity={0.22} />
      </mesh>
      <mesh position={[0, 14, -38]}>
        <planeGeometry args={[180, 42]} />
        <meshBasicMaterial color={lowerColor} transparent opacity={0.36} />
      </mesh>

      {environment === 'space' && (
        <>
          <BackdropRing radius={31} color={palette.hazard || '#7b61ff'} opacity={0.12} y={9.5} />
          <BackdropRing radius={38} color={palette.accent || '#7cf7ff'} opacity={0.08} y={12.5} />
          {Array.from({ length: STAR_COUNT }, (_, index) => {
            const angle = (index / STAR_COUNT) * Math.PI * 2
            const radius = 30 + (index % 5) * 4.5
            return (
              <mesh
                key={`star-${index}`}
                ref={(node) => { starRefs.current[index] = node }}
                position={[Math.cos(angle) * radius, 11, Math.sin(angle) * radius]}
              >
                <sphereGeometry args={[0.12 + (index % 3) * 0.04, 8, 8]} />
                <meshBasicMaterial color={starColor} transparent opacity={0.33} />
              </mesh>
            )
          })}
        </>
      )}

      {environment === 'desert' && Array.from({ length: DUNE_COUNT }, (_, index) => (
        <mesh
          key={`dune-${index}`}
          position={[-34 + index * 11, 0.55 + index * 0.04, index % 2 === 0 ? -19 : 19]}
          rotation={[-Math.PI / 2, 0, (index % 2 === 0 ? 1 : -1) * 0.16]}
        >
          <circleGeometry args={[5.5 + (index % 3), 28]} />
          <meshStandardMaterial color={palette.fairway || '#d8a35f'} transparent opacity={0.2} />
        </mesh>
      ))}

      {environment === 'city' && Array.from({ length: CITY_TOWER_COUNT }, (_, index) => (
        <group key={`skyline-${index}`} position={[-34 + index * 7.5, 0, index % 2 === 0 ? -22 : 22]}>
          <mesh position={[0, 5.5 + (index % 4), 0]}>
            <boxGeometry args={[2.1, 11 + (index % 4) * 2.3, 2.1]} />
            <meshStandardMaterial color="#10213f" emissive={palette.accent || '#ff8b5c'} emissiveIntensity={0.08} />
          </mesh>
        </group>
      ))}

      {descriptors.map((descriptor, index) => (
        <group
          key={descriptor.key}
          ref={(node) => { descriptorRefs.current[index] = node }}
          position={[descriptor.x, 0, descriptor.z]}
          rotation={[0, descriptor.rotateY, 0]}
          scale={[descriptor.scale, descriptor.scale, descriptor.scale]}
        >
          {descriptor.variant === 'satellite' && (
            <>
              <mesh position={[0, 4, 0]}>
                <sphereGeometry args={[0.75, 16, 16]} />
                <meshStandardMaterial color="#dbeafe" emissive={palette.accent || '#7cf7ff'} emissiveIntensity={0.1} />
              </mesh>
              <mesh position={[0, 4, 0]}>
                <boxGeometry args={[3.2, 0.08, 1.2]} />
                <meshStandardMaterial color={palette.accent || '#7cf7ff'} emissive={palette.accent || '#7cf7ff'} emissiveIntensity={0.18} />
              </mesh>
            </>
          )}
          {descriptor.variant === 'mesa' && (
            <mesh position={[0, 2.2, 0]}>
              <cylinderGeometry args={[2.6, 3.4, 4.4, 7]} />
              <meshStandardMaterial color={palette.wall || '#f3d6b3'} roughness={0.88} />
            </mesh>
          )}
          {descriptor.variant === 'ice' && (
            <mesh position={[0, 2.7, 0]}>
              <coneGeometry args={[2, 5.2, 6]} />
              <meshStandardMaterial color="#dff6ff" roughness={0.18} metalness={0.08} emissive="#baf2ff" emissiveIntensity={0.08} />
            </mesh>
          )}
          {descriptor.variant === 'tower' && (
            <mesh position={[0, 3.4, 0]}>
              <boxGeometry args={[1.7, 6.8, 1.7]} />
              <meshStandardMaterial color={palette.wall || '#cbd5e1'} roughness={0.48} metalness={0.18} />
            </mesh>
          )}
        </group>
      ))}
    </group>
  )
})

export const MiniGolfSurfaceAccent = React.memo(({ course, hole, palette = {} }) => {
  const environment = course?.environment || 'generic'
  const bounds = hole?.bounds || { minX: -18, maxX: 18, minZ: -12, maxZ: 12 }
  const width = bounds.maxX - bounds.minX + 10
  const depth = bounds.maxZ - bounds.minZ + 10
  const centerX = (bounds.minX + bounds.maxX) / 2
  const centerZ = (bounds.minZ + bounds.maxZ) / 2
  const stripeTexture = useMemo(
    () => createStripeTexture(palette.rough || '#204432', palette.accent || '#7cf7ff'),
    [palette.accent, palette.rough]
  )
  const glowTexture = useMemo(() => createGlowTexture(palette.accent || '#7cf7ff'), [palette.accent])

  return (
    <group>
      <mesh position={[centerX, 0.012, centerZ]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial
          map={stripeTexture}
          color={palette.rough || '#2d6a43'}
          roughness={environment === 'snow' ? 0.42 : 0.9}
          metalness={environment === 'space' ? 0.12 : 0.02}
          transparent
          opacity={0.4}
        />
      </mesh>
      <mesh position={[centerX, 0.024, centerZ]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width * 0.82, depth * 0.82]} />
        <meshBasicMaterial map={glowTexture} transparent opacity={environment === 'space' ? 0.22 : 0.1} />
      </mesh>
    </group>
  )
})

export const MiniGolfSceneryObjects = React.memo(({ scenery = [], palette = {}, environment = 'generic' }) => {
  const holoTexture = useMemo(() => createStripeTexture('#0f172a', palette.accent || '#7cf7ff'), [palette.accent])

  return scenery.map((item, index) => {
    const key = `${item.type}-${index}`
    const position = [item.x || 0, 0, item.z || 0]

    if (item.type === 'tower' || item.type === 'smokestack') {
      return (
        <group key={key} position={position}>
          <mesh position={[0, 3.1, 0]} castShadow>
            <boxGeometry args={[1.9, 6.2, 1.9]} />
            <meshStandardMaterial color={palette.wall || '#cbd5e1'} roughness={0.5} metalness={0.22} />
          </mesh>
          <mesh position={[0, 6.55, 0]} castShadow>
            <cylinderGeometry args={[0.85, 1.05, 1.1, 18]} />
            <meshStandardMaterial color={palette.accent || '#7cf7ff'} emissive={palette.accent || '#7cf7ff'} emissiveIntensity={0.12} />
          </mesh>
          <mesh position={[0, 7.3, 0]}>
            <sphereGeometry args={[0.46, 12, 12]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.16} />
          </mesh>
        </group>
      )
    }

    if (item.type === 'billboard' || item.type === 'aurora') {
      return (
        <group key={key} position={position}>
          <mesh position={[0, 2.7, 0]} castShadow>
            <boxGeometry args={[4.8, 2.8, 0.22]} />
            <meshStandardMaterial
              color={palette.accent || '#7cf7ff'}
              emissive={palette.accent || '#7cf7ff'}
              emissiveIntensity={item.type === 'aurora' ? 0.22 : 0.14}
              map={holoTexture}
            />
          </mesh>
          <mesh position={[0, 0.95, 0]}>
            <boxGeometry args={[0.24, 1.9, 0.24]} />
            <meshStandardMaterial color="#cbd5e1" />
          </mesh>
          {item.type === 'aurora' && (
            <mesh position={[0, 3.1, -0.12]}>
              <planeGeometry args={[5.6, 3.1]} />
              <meshBasicMaterial color={palette.hazard || '#7b61ff'} transparent opacity={0.16} side={THREE.DoubleSide} />
            </mesh>
          )}
        </group>
      )
    }

    if (item.type === 'iceberg' || item.type === 'ice-spire') {
      return (
        <group key={key} position={position}>
          <mesh position={[0, 1.9, 0]} castShadow>
            <coneGeometry args={[1.65, 4.1, 6]} />
            <meshStandardMaterial color="#ddf6ff" roughness={0.18} metalness={0.08} emissive="#9ee7ff" emissiveIntensity={0.08} />
          </mesh>
          <mesh position={[0, 0.14, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[1.55, 20]} />
            <meshBasicMaterial color="#9ee7ff" transparent opacity={0.16} />
          </mesh>
        </group>
      )
    }

    if (item.type === 'anvil' || item.type === 'forge') {
      return (
        <group key={key} position={position}>
          <mesh position={[0, 0.82, 0]} castShadow>
            <boxGeometry args={[2.6, 1.22, 1.8]} />
            <meshStandardMaterial color="#4b5563" roughness={0.62} metalness={0.24} />
          </mesh>
          <mesh position={[0, 1.56, 0]} castShadow>
            <boxGeometry args={[1.2, 0.34, 2.2]} />
            <meshStandardMaterial color={palette.accent || '#7cf7ff'} emissive={palette.accent || '#7cf7ff'} emissiveIntensity={0.14} />
          </mesh>
          {item.type === 'forge' && (
            <mesh position={[0, 1.05, 0]}>
              <sphereGeometry args={[0.38, 12, 12]} />
              <meshBasicMaterial color="#ffd166" transparent opacity={0.32} />
            </mesh>
          )}
        </group>
      )
    }

    if (environment === 'space') {
      return (
        <group key={key} position={position}>
          <mesh position={[0, 1.4, 0]}>
            <octahedronGeometry args={[1.2, 0]} />
            <meshStandardMaterial color="#dbeafe" emissive={palette.accent || '#7cf7ff'} emissiveIntensity={0.08} />
          </mesh>
        </group>
      )
    }

    return null
  })
})

