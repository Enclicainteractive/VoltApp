import { useRef, useState, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore } from '../stores/voltverseStore'

const Portal = ({ data }) => {
  const meshRef = useRef()
  const [hovered, setHovered] = useState(false)
  
  const position = data.position || [0, 0, 0]
  const rotation = data.rotation || [0, 0, 0]
  const scale = data.scale || [2, 3, 0.1]
  const destination = data.destination || null
  const portalColor = data.color || '#00ffff'
  
  const { setRoomData, roomData, setLocalPlayerPosition } = useStore()

  const portalMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        color: { value: new THREE.Color(portalColor) },
        hover: { value: 0 }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform vec3 color;
        uniform float hover;
        varying vec2 vUv;
        
        void main() {
          vec2 center = vec2(0.5);
          float dist = distance(vUv, center);
          
          float wave = sin(dist * 20.0 - time * 3.0) * 0.5 + 0.5;
          float ring = smoothstep(0.4, 0.5, dist) - smoothstep(0.5, 0.55, dist);
          
          vec3 finalColor = color * (0.5 + wave * 0.5);
          float alpha = (1.0 - smoothstep(0.45, 0.5, dist)) * (0.7 + hover * 0.3);
          alpha += ring * 0.5;
          
          gl_FragColor = vec4(finalColor, alpha);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide
    })
  }, [portalColor])

  useFrame((state) => {
    if (meshRef.current && meshRef.current.material.uniforms) {
      meshRef.current.material.uniforms.time.value = state.clock.elapsedTime
      meshRef.current.material.uniforms.hover.value = THREE.MathUtils.lerp(
        meshRef.current.material.uniforms.hover.value,
        hovered ? 1 : 0,
        0.1
      )
    }
  })

  const handleClick = (e) => {
    e.stopPropagation()
    if (destination) {
      const newRoomData = {
        ...roomData,
        lastSpawnPoint: destination.spawnPoint || 'spawn-1',
        currentWorld: destination.worldId || roomData.currentWorld
      }
      setRoomData(newRoomData)
      setLocalPlayerPosition(destination.position || [0, 1.6, 5])
    }
  }

  return (
    <group position={position} rotation={rotation} scale={scale}>
      <mesh
        ref={meshRef}
        onClick={handleClick}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <planeGeometry args={[2, 3, 32, 32]} />
        <primitive object={portalMaterial} attach="material" />
      </mesh>

      <mesh position={[0, 0, -0.05]}>
        <boxGeometry args={[2.1, 3.1, 0.1]} />
        <meshStandardMaterial color="#2d3748" metalness={0.8} roughness={0.2} />
      </mesh>

      <mesh position={[-1.1, 0, 0]}>
        <boxGeometry args={[0.1, 3.1, 0.1]} />
        <meshStandardMaterial color={portalColor} emissive={portalColor} emissiveIntensity={0.5} />
      </mesh>
      <mesh position={[1.1, 0, 0]}>
        <boxGeometry args={[0.1, 3.1, 0.1]} />
        <meshStandardMaterial color={portalColor} emissive={portalColor} emissiveIntensity={0.5} />
      </mesh>
      <mesh position={[0, 1.6, 0]}>
        <boxGeometry args={[2.1, 0.1, 0.1]} />
        <meshStandardMaterial color={portalColor} emissive={portalColor} emissiveIntensity={0.5} />
      </mesh>
      <mesh position={[0, -1.6, 0]}>
        <boxGeometry args={[2.1, 0.1, 0.1]} />
        <meshStandardMaterial color={portalColor} emissive={portalColor} emissiveIntensity={0.5} />
      </mesh>

      <pointLight color={portalColor} intensity={hovered ? 2 : 1} distance={5} />
    </group>
  )
}

export default Portal
