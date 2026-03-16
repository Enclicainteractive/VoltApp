import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import { useStore } from '../stores/voltverseStore'

const TeleportPoint = ({ data }) => {
  const ringRef = useRef()
  const [hovered, setHovered] = useState(false)
  
  const position = data.position || [0, 0, 0]
  const rotation = data.rotation || [0, 0, 0]
  const name = data.name || 'Spawn'
  
  const { mode, setRoomData, setLocalPlayerPosition } = useStore()

  useFrame((state) => {
    if (ringRef.current) {
      ringRef.current.rotation.y += 0.02
      const scale = 1 + Math.sin(state.clock.elapsedTime * 2) * 0.1
      ringRef.current.scale.set(scale, scale, scale)
    }
  })

  const handleClick = (e) => {
    e.stopPropagation()
    if (mode === 'desktop') {
      setRoomData((current) => ({ ...current, lastSpawnPoint: data.id }))
      setLocalPlayerPosition([position[0], 1.6, position[2]])
    }
  }

  return (
    <group 
      position={position} 
      rotation={rotation}
      onClick={handleClick}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.3, 0.5, 32]} />
        <meshStandardMaterial 
          color={hovered ? '#10b981' : '#6366f1'} 
          emissive={hovered ? '#10b981' : '#6366f1'}
          emissiveIntensity={0.5}
          transparent
          opacity={0.8}
        />
      </mesh>
      
      <mesh ref={ringRef} position={[0, 0.5, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.3, 0.05, 16, 32]} />
        <meshStandardMaterial 
          color={hovered ? '#10b981' : '#8b5cf6'}
          emissive={hovered ? '#10b981' : '#8b5cf6'}
          emissiveIntensity={0.3}
        />
      </mesh>

      <Text
        position={[0, 1.2, 0]}
        fontSize={0.2}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.02}
        outlineColor="#000000"
      >
        {name}
      </Text>

      <pointLight
        color={hovered ? '#10b981' : '#6366f1'}
        intensity={0.5}
        distance={3}
      />
    </group>
  )
}

export default TeleportPoint
