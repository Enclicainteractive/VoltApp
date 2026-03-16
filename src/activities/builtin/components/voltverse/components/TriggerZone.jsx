import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore } from '../stores/voltverseStore'

const TriggerZone = ({ data }) => {
  const meshRef = useRef()
  const [active, setActive] = useState(false)
  const cooldownRef = useRef(0)
  
  const position = data.position || [0, 0, 0]
  const scale = data.scale || [2, 2, 2]
  const triggerType = data.type || 'proximity'
  const actions = data.actions || []
  
  const { players, localPlayerId, sdk, setRoomData } = useStore()

  useFrame((state, delta) => {
    if (cooldownRef.current > 0) {
      cooldownRef.current -= delta
      return
    }

    const localPlayer = players.get(localPlayerId)
    if (!localPlayer) return

    const playerPos = new THREE.Vector3(...(localPlayer.position || [0, 0, 0]))
    const triggerPos = new THREE.Vector3(...position)
    const distance = playerPos.distanceTo(triggerPos)
    const triggerRadius = Math.max(...scale) / 2

    if (distance < triggerRadius) {
      if (!active) {
        setActive(true)
        triggerActions()
      }
    } else {
      setActive(false)
    }

    if (meshRef.current) {
      const pulse = Math.sin(state.clock.elapsedTime * 3) * 0.1 + 1
      meshRef.current.scale.set(
        scale[0] * pulse,
        scale[1] * pulse,
        scale[2] * pulse
      )
    }
  })

  const triggerActions = () => {
    cooldownRef.current = data.cooldown || 1

    actions.forEach(action => {
      switch (action.type) {
        case 'teleport':
          if (action.target) {
            useStore.getState().updatePlayer(localPlayerId, {
              position: action.target.position || [0, 0, 0]
            })
          }
          break
        case 'sound':
          if (action.sound) {
            sdk?.emitEvent({ type: 'sound:play', sound: action.sound })
          }
          break
        case 'message':
          if (action.message) {
            sdk?.emitEvent({ type: 'notification', message: action.message })
          }
          break
        case 'animation':
          if (action.animation) {
            useStore.getState().updatePlayer(localPlayerId, {
              animation: action.animation
            })
          }
          break
        case 'world':
          if (action.worldId) {
            setRoomData((prev) => ({
              ...prev,
              currentWorld: action.worldId
            }))
          }
          break
        default:
          break
      }
    })
  }

  return (
    <group position={position}>
      <mesh ref={meshRef}>
        <boxGeometry args={scale} />
        <meshBasicMaterial 
          color={active ? '#10b981' : '#6366f1'} 
          transparent 
          opacity={0.2}
          wireframe
        />
      </mesh>
      
      <mesh>
        <boxGeometry args={scale} />
        <meshBasicMaterial 
          color={active ? '#10b981' : '#6366f1'} 
          transparent 
          opacity={0.1}
        />
      </mesh>

      {data.label && (
        <group position={[0, scale[1] / 2 + 0.3, 0]}>
          <mesh>
            <planeGeometry args={[data.label.length * 0.15, 0.2]} />
            <meshBasicMaterial color="#000" transparent opacity={0.7} />
          </mesh>
        </group>
      )}

      <pointLight
        color={active ? '#10b981' : '#6366f1'}
        intensity={active ? 2 : 0.5}
        distance={5}
      />
    </group>
  )
}

export default TriggerZone
