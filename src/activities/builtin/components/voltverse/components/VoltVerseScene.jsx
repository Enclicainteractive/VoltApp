import { useRef, useMemo, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore } from '../stores/voltverseStore'
import Avatar from './Avatar'
import WorldObject from './WorldObject'
import TeleportPoint from './TeleportPoint'
import Portal from './Portal'
import TriggerZone from './TriggerZone'
import { resolveSkyboxConfig } from '../utils/shaders'

const defaultEnvironment = {
  name: 'Default World',
  skybox: 'city',
  fog: { color: '#1a1a2e', near: 10, far: 100 },
  gravity: -9.81,
  timeOfDay: 'evening',
  ambientLight: { color: '#404060', intensity: 0.4 },
  directionalLight: { 
    color: '#ffd4a3', 
    intensity: 1, 
    position: [10, 20, 10],
    castShadow: true,
    shadowMapSize: [2048, 2048]
  },
  spawnPoints: [
    { id: 'spawn-1', position: [0, 0, 5], rotation: [0, 0, 0], name: 'Main Spawn' }
  ],
  floor: {
    type: 'plane',
    size: [100, 100],
    material: { color: '#2d2d44', roughness: 0.8, metalness: 0.2 },
    grid: true
  },
  objects: [],
  portals: [],
  triggers: []
}

const VoltVerseScene = ({ mode }) => {
  const { camera } = useThree()
  
  const { 
    roomData, 
    players, 
    avatars, 
    localPlayerId,
    worldState,
    editorMode,
    settings,
    setSelectedObject
  } = useStore()

  const envConfig = roomData?.environment || defaultEnvironment

  useEffect(() => {
    if (mode === 'vr') {
      camera.position.set(0, 1.6, 5)
    }
  }, [mode, camera])

  useEffect(() => {
    const handleKeyDown = (e) => {
      const targetTag = e.target?.tagName
      if (targetTag === 'INPUT' || targetTag === 'TEXTAREA' || e.target?.isContentEditable) return

      const isMod = e.ctrlKey || e.metaKey
      const store = useStore.getState()

      if (e.key === 'Escape') {
        e.preventDefault()
        store.setEditorMode('none')
        store.setSelectedObject(null)
      } else if (isMod && e.code === 'KeyG') {
        e.preventDefault()
        store.setEditorMode(store.editorMode === 'level' ? 'none' : 'level')
      } else if (isMod && e.code === 'KeyE') {
        e.preventDefault()
        store.setEditorMode(store.editorMode === 'avatar' ? 'none' : 'avatar')
      } else if (isMod && e.shiftKey && e.code === 'KeyS') {
        e.preventDefault()
        store.setEditorMode(store.editorMode === 'shader' ? 'none' : 'shader')
      } else if (isMod && e.code === 'KeyZ') {
        e.preventDefault()
        if (e.shiftKey) store.redo()
        else store.undo()
      } else if (e.code === 'Delete' || e.code === 'Backspace') {
        if (store.editorMode === 'level' && store.selectedObject?.entityType === 'object') {
          e.preventDefault()
          store.removeWorldObject(store.selectedObject.id)
        }
      } else if (isMod && e.code === 'KeyD') {
        if (store.editorMode === 'level' && store.selectedObject?.entityType === 'object') {
          e.preventDefault()
          store.duplicateWorldObject(store.selectedObject.id)
        }
      } else if (e.code === 'KeyW' && store.editorMode === 'level') {
        store.setTransformTool('move')
      } else if (e.code === 'KeyR' && store.editorMode === 'level') {
        store.setTransformTool('rotate')
      } else if (e.code === 'KeyT' && store.editorMode === 'level') {
        store.setTransformTool('scale')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [setSelectedObject])

  const floorMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: envConfig.floor?.material?.color || '#2d2d44',
      roughness: envConfig.floor?.material?.roughness || 0.8,
      metalness: envConfig.floor?.material?.metalness || 0.2
    })
  }, [envConfig.floor])

  return (
    <>
      <ambientLight 
        color={envConfig.ambientLight?.color || '#404060'} 
        intensity={envConfig.ambientLight?.intensity || 0.4} 
      />
      <directionalLight
        color={envConfig.directionalLight?.color || '#ffd4a3'}
        intensity={envConfig.directionalLight?.intensity || 1}
        position={envConfig.directionalLight?.position || [10, 20, 10]}
        castShadow={settings.shadowQuality !== 'off'}
        shadow-mapSize-width={settings.shadowQuality === 'high' ? 2048 : 1024}
        shadow-mapSize-height={settings.shadowQuality === 'high' ? 2048 : 1024}
        shadow-camera-far={50}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
      />
      
      {envConfig.fog && (
        <fog 
          attach="fog" 
          color={envConfig.fog.color} 
          near={envConfig.fog.near} 
          far={envConfig.fog.far} 
        />
      )}

      <SkyBox environment={envConfig} />
      
      {envConfig.floor?.grid !== false && <GridHelper size={100} divisions={100} />}
      
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.01, 0]}
        receiveShadow={settings.shadowQuality !== 'off'}
      >
        <planeGeometry args={envConfig.floor?.size || [100, 100]} />
        <primitive object={floorMaterial} attach="material" />
      </mesh>

      {(worldState?.objects || envConfig.objects || []).map((obj) => (
        <WorldObject 
          key={obj.id} 
          data={obj} 
          isEditor={editorMode === 'level'}
        />
      ))}

      {(worldState?.spawnPoints || envConfig.spawnPoints || []).map((spawn) => (
        <TeleportPoint key={spawn.id} data={spawn} />
      ))}

      {(worldState?.portals || envConfig.portals || []).map((portal) => (
        <Portal key={portal.id} data={portal} />
      ))}

      {(worldState?.triggers || envConfig.triggers || []).map((trigger) => (
        <TriggerZone key={trigger.id} data={trigger} />
      ))}

      {Array.from(players.values()).map((player) => (
        <Avatar
          key={player.id}
          player={player}
          isLocal={player.id === localPlayerId}
          avatarData={avatars.get(player.id)}
        />
      ))}

      <Sparkles count={100} scale={20} size={2} speed={0.3} opacity={0.5} color="#ffd700" />

      {mode === 'desktop' && <DesktopControls editorMode={editorMode} />}
      {mode === 'vr' && <VRControls />}
    </>
  )
}

const SkyBox = ({ environment }) => {
  const skybox = useMemo(() => resolveSkyboxConfig(environment?.skybox || environment?.skyboxPreset || environment?.skyboxTint), [environment])
  const stars = useMemo(() => Array.from({ length: skybox.stars === false ? 0 : 180 }).map((_, i) => {
    const theta = ((i * 53) % 360) * (Math.PI / 180)
    const phi = (((i * 97) % 180) + 1) * (Math.PI / 180)
    const radius = 400
    return [
      radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.cos(phi),
      radius * Math.sin(phi) * Math.sin(theta)
    ]
  }), [skybox.stars])

  return (
    <>
      <mesh>
        <sphereGeometry args={[500, 32, 32]} />
        <meshBasicMaterial color={skybox.backgroundBottom || '#0a0a15'} side={THREE.BackSide} />
      </mesh>

      <mesh position={[0, 160, -120]} rotation={[Math.PI / 3, 0, 0]}>
        <planeGeometry args={[900, 480]} />
        <meshBasicMaterial color={skybox.backgroundTop || skybox.backgroundBottom || '#111827'} side={THREE.DoubleSide} transparent opacity={0.92} />
      </mesh>

      {stars.map((position, i) => (
          <mesh
            key={i}
            position={position}
          >
            <sphereGeometry args={[1, 8, 8]} />
            <meshBasicMaterial color={skybox.accent || '#ffffff'} transparent opacity={0.35 + ((i % 7) * 0.08)} />
          </mesh>
      ))}
    </>
  )
}

const GridHelper = ({ size, divisions }) => {
  const gridRef = useRef()
  
  return (
    <gridHelper 
      ref={gridRef}
      args={[size, divisions, '#4a4a6a', '#2a2a4a']} 
      position={[0, 0.01, 0]}
    />
  )
}

const Sparkles = ({ count, scale, size, speed, opacity, color }) => {
  const pointsRef = useRef()
  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * scale
      pos[i * 3 + 1] = Math.random() * scale * 0.5
      pos[i * 3 + 2] = (Math.random() - 0.5) * scale
    }
    return pos
  }, [count, scale])

  useFrame((state) => {
    if (pointsRef.current) {
      pointsRef.current.rotation.y = state.clock.elapsedTime * speed
    }
  })

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={size}
        color={color}
        transparent
        opacity={opacity}
        sizeAttenuation
      />
    </points>
  )
}

const DesktopControls = ({ editorMode }) => {
  const { camera, gl } = useThree()
  const isLocked = useRef(false)
  const moveState = useRef({ forward: false, backward: false, left: false, right: false })
  const euler = useRef(new THREE.Euler(0, 0, 0, 'YXZ'))
  const lastSentPosition = useRef(new THREE.Vector3())
  
  useEffect(() => {
    const onKeyDown = (e) => {
      const targetTag = e.target?.tagName
      if (targetTag === 'INPUT' || targetTag === 'TEXTAREA' || e.target?.isContentEditable) return
      if (useStore.getState().editorMode !== 'none') return
      switch (e.code) {
        case 'KeyW': case 'ArrowUp': moveState.current.forward = true; break
        case 'KeyS': case 'ArrowDown': moveState.current.backward = true; break
        case 'KeyA': case 'ArrowLeft': moveState.current.left = true; break
        case 'KeyD': case 'ArrowRight': moveState.current.right = true; break
      }
    }
    
    const onKeyUp = (e) => {
      switch (e.code) {
        case 'KeyW': case 'ArrowUp': moveState.current.forward = false; break
        case 'KeyS': case 'ArrowDown': moveState.current.backward = false; break
        case 'KeyA': case 'ArrowLeft': moveState.current.left = false; break
        case 'KeyD': case 'ArrowRight': moveState.current.right = false; break
      }
    }
    
    const onClick = () => {
      if (useStore.getState().editorMode !== 'none') return
      gl.domElement.requestPointerLock?.()
    }
    
    const onMouseMove = (e) => {
      if (document.pointerLockElement !== gl.domElement) return
      
      euler.current.setFromQuaternion(camera.quaternion)
      euler.current.y -= e.movementX * 0.002
      euler.current.x -= e.movementY * 0.002
      euler.current.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, euler.current.x))
      camera.quaternion.setFromEuler(euler.current)
    }
    
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    gl.domElement.addEventListener('click', onClick)
    document.addEventListener('mousemove', onMouseMove)
    
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      gl.domElement.removeEventListener('click', onClick)
      document.removeEventListener('mousemove', onMouseMove)
    }
  }, [camera, gl, editorMode])

  useFrame((state, delta) => {
    if (editorMode !== 'none') return
    const speed = 5
    const direction = new THREE.Vector3()
    
    if (moveState.current.forward) direction.z -= 1
    if (moveState.current.backward) direction.z += 1
    if (moveState.current.left) direction.x -= 1
    if (moveState.current.right) direction.x += 1
    
    direction.normalize()
    direction.applyQuaternion(camera.quaternion)
    direction.y = 0
    direction.normalize()
    
    camera.position.addScaledVector(direction, speed * delta)
    camera.position.y = 1.6

    if (lastSentPosition.current.distanceToSquared(camera.position) > 0.0001) {
      lastSentPosition.current.copy(camera.position)
      useStore.getState().setLocalPlayerPosition([
        camera.position.x,
        camera.position.y,
        camera.position.z
      ])
    }
  })

  return null
}

const VRControls = () => {
  return null
}

export default VoltVerseScene
