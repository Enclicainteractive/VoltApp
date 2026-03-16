import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore } from '../stores/voltverseStore'
import ModelAsset from './ModelAsset'

const defaultAvatars = {
  human: {
    head: { color: '#f5d0c5', scale: [0.25, 0.3, 0.25] },
    body: { color: '#4a5568', scale: [0.4, 0.5, 0.25] },
    arms: { color: '#4a5568', scale: [0.1, 0.4, 0.1] },
    legs: { color: '#2d3748', scale: [0.12, 0.5, 0.12] }
  }
}

const normalizeProceduralAvatar = (avatarData, playerColor) => {
  const procedural = avatarData?.procedural || avatarData || {}
  return {
    head: procedural.head ? { color: procedural.head.color || playerColor, scale: [0.25, 0.3, 0.25].map((value) => value * (procedural.head.scale || 1)) } : null,
    body: procedural.body ? { color: procedural.body.color || playerColor, scale: [0.4, 0.5, 0.25].map((value) => value * (procedural.body.scale || 1)) } : null,
    arms: procedural.arms ? { color: procedural.arms.color || playerColor, scale: [0.1, 0.4, 0.1].map((value) => value * (procedural.arms.scale || 1)) } : null,
    legs: procedural.legs ? { color: procedural.legs.color || '#2d3748', scale: [0.12, 0.5, 0.12].map((value) => value * (procedural.legs.scale || 1)) } : null
  }
}

const ProceduralAvatar = ({ avatar, playerColor, settings }) => (
  <>
    {avatar.head && (
      <mesh position={[0, 1.4, 0]} castShadow={settings.shadowQuality !== 'off'}>
        <sphereGeometry args={[avatar.head.scale[0], 16, 16]} />
        <meshStandardMaterial color={avatar.head.color || playerColor} />
      </mesh>
    )}
    {avatar.body && (
      <mesh position={[0, 0.9, 0]} castShadow={settings.shadowQuality !== 'off'}>
        <boxGeometry args={[avatar.body.scale[0], avatar.body.scale[1], avatar.body.scale[2]]} />
        <meshStandardMaterial color={avatar.body.color || playerColor} />
      </mesh>
    )}
    {avatar.arms && (
      <>
        <mesh position={[-0.35, 0.9, 0]} castShadow={settings.shadowQuality !== 'off'}>
          <boxGeometry args={[avatar.arms.scale[0], avatar.arms.scale[1], avatar.arms.scale[2]]} />
          <meshStandardMaterial color={avatar.arms.color || playerColor} />
        </mesh>
        <mesh position={[0.35, 0.9, 0]} castShadow={settings.shadowQuality !== 'off'}>
          <boxGeometry args={[avatar.arms.scale[0], avatar.arms.scale[1], avatar.arms.scale[2]]} />
          <meshStandardMaterial color={avatar.arms.color || playerColor} />
        </mesh>
      </>
    )}
    {avatar.legs && (
      <>
        <mesh position={[-0.12, 0.25, 0]} castShadow={settings.shadowQuality !== 'off'}>
          <boxGeometry args={[avatar.legs.scale[0], avatar.legs.scale[1], avatar.legs.scale[2]]} />
          <meshStandardMaterial color={avatar.legs.color || '#2d3748'} />
        </mesh>
        <mesh position={[0.12, 0.25, 0]} castShadow={settings.shadowQuality !== 'off'}>
          <boxGeometry args={[avatar.legs.scale[0], avatar.legs.scale[1], avatar.legs.scale[2]]} />
          <meshStandardMaterial color={avatar.legs.color || '#2d3748'} />
        </mesh>
      </>
    )}
  </>
)

const Avatar = ({ player, isLocal, avatarData }) => {
  const meshRef = useRef()
  const groupRef = useRef()

  const position = player.position || [0, 0, 0]
  const rotation = player.rotation || [0, 0, 0]
  const animation = player.animation || 'idle'
  const playerColor = player.color || '#6366f1'

  const { settings } = useStore()
  const avatarMode = avatarData?.mode || (avatarData?.model?.src ? 'model' : 'procedural')
  const proceduralAvatar = useMemo(
    () => normalizeProceduralAvatar(avatarData || defaultAvatars.human, playerColor),
    [avatarData, playerColor]
  )
  const modelAsset = avatarData?.model?.embeddedData
    ? { format: avatarData.model.format, source: { uri: avatarData.model.embeddedData } }
    : avatarData?.model?.src
      ? { format: avatarData.model.format, source: { uri: avatarData.model.src } }
      : null
  const modelScale = Number(avatarData?.model?.scale ?? 1)
  const positionOffset = avatarData?.model?.positionOffset || [0, 0, 0]
  const rotationOffset = avatarData?.model?.rotationOffset || [0, 0, 0]
  const nameTagOffset = avatarMode === 'model' ? 2.2 : proceduralAvatar.head ? proceduralAvatar.head.scale[1] + 1.4 : 1.9

  useFrame((state) => {
    if (!groupRef.current) return

    groupRef.current.position.set(...position)
    groupRef.current.rotation.set(...rotation)

    if (animation === 'idle' && meshRef.current) {
      meshRef.current.scale.y = 1 + Math.sin(state.clock.elapsedTime * 2) * 0.02
    }

    if (animation === 'walk' && meshRef.current) {
      meshRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 8) * 0.1
    }
  })

  return (
    <group ref={groupRef} position={position}>
      <group ref={meshRef}>
        {avatarMode === 'model' && modelAsset ? (
          <group
            scale={[modelScale, modelScale, modelScale]}
            position={positionOffset}
            rotation={rotationOffset}
          >
            <ModelAsset asset={modelAsset} />
          </group>
        ) : (
          <ProceduralAvatar avatar={proceduralAvatar} playerColor={playerColor} settings={settings} />
        )}
      </group>

      <group position={[0, nameTagOffset, 0]}>
        <mesh>
          <planeGeometry args={[1, 0.25]} />
          <meshBasicMaterial transparent opacity={0.8} color="#000" />
        </mesh>
        <mesh position={[0, 0, 0.01]}>
          <planeGeometry args={[0.95, 0.2]} />
          <meshBasicMaterial transparent opacity={0}>
            <canvasTexture
              attach="map"
              image={createNameTagCanvas(player.name || 'Player')}
            />
          </meshBasicMaterial>
        </mesh>
      </group>

      {isLocal && (
        <mesh position={[0, 0.1, 0]}>
          <ringGeometry args={[0.3, 0.35, 32]} />
          <meshBasicMaterial color={playerColor} transparent opacity={0.5} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  )
}

const createNameTagCanvas = (name) => {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 64
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = 'rgba(0, 0, 0, 0)'
  ctx.fillRect(0, 0, 256, 64)

  ctx.font = 'bold 32px sans-serif'
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(name, 128, 32)

  return canvas
}

export default Avatar
