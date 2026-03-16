import { useRef, useState, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore } from '../stores/voltverseStore'
import { createShaderMaterial, resolveMaterialConfig, resolveShaderConfig } from '../utils/shaders'
import ModelAsset from './ModelAsset'

const PrimitiveGeometry = ({ type }) => {
  switch (type) {
    case 'sphere':
      return <sphereGeometry args={[0.5, 32, 32]} />
    case 'cylinder':
      return <cylinderGeometry args={[0.5, 0.5, 1, 32]} />
    case 'plane':
      return <planeGeometry args={[1, 1]} />
    case 'cone':
      return <coneGeometry args={[0.5, 1, 32]} />
    case 'torus':
      return <torusGeometry args={[0.5, 0.2, 16, 32]} />
    case 'capsule':
      return <capsuleGeometry args={[0.35, 0.8, 8, 16]} />
    default:
      return <boxGeometry args={[1, 1, 1]} />
  }
}

const createRuntimeMaterial = (materialConfig, shaderConfig) => {
  if (shaderConfig) {
    return createShaderMaterial({
      ...shaderConfig,
      color: materialConfig.color,
      uniforms: {
        ...(shaderConfig.uniforms || {}),
        color: { value: new THREE.Color(materialConfig.color || '#6366f1') }
      }
    })
  }

  if (materialConfig.type === 'physical' || materialConfig.preset === 'glass') {
    return new THREE.MeshPhysicalMaterial({
      color: materialConfig.color,
      roughness: materialConfig.roughness,
      metalness: materialConfig.metalness,
      transparent: materialConfig.transparent,
      opacity: materialConfig.opacity,
      emissive: materialConfig.emissive,
      emissiveIntensity: materialConfig.emissiveIntensity,
      transmission: materialConfig.transmission ?? 0,
      thickness: materialConfig.thickness ?? 0
    })
  }

  if (materialConfig.type === 'basic') {
    return new THREE.MeshBasicMaterial({
      color: materialConfig.color,
      transparent: materialConfig.transparent,
      opacity: materialConfig.opacity,
      wireframe: materialConfig.wireframe
    })
  }

  return new THREE.MeshStandardMaterial({
    color: materialConfig.color,
    roughness: materialConfig.roughness,
    metalness: materialConfig.metalness,
    transparent: materialConfig.transparent,
    opacity: materialConfig.opacity,
    wireframe: materialConfig.wireframe,
    emissive: materialConfig.emissive,
    emissiveIntensity: materialConfig.emissiveIntensity
  })
}

const WorldObject = ({ data, isEditor }) => {
  const meshRef = useRef()
  const [hovered, setHovered] = useState(false)
  const { selectedObject, setSelectedObject, settings, roomData } = useStore()
  const isSelected = selectedObject?.id === data.id
  const isModel = data.type === 'model' || data.assetRef || data.model?.assetRef

  const position = data.position || [0, 0, 0]
  const rotation = data.rotation || [0, 0, 0]
  const scale = data.scale || [1, 1, 1]
  const assetRef = data.assetRef || data.model?.assetRef || null
  const modelAsset = roomData?.assets?.models?.find((asset) => asset.id === assetRef) || null

  const materialConfig = useMemo(() => resolveMaterialConfig(data.material || data), [data])
  const shaderConfig = useMemo(() => resolveShaderConfig(materialConfig, roomData?.shaders || []), [materialConfig, roomData?.shaders])
  const material = useMemo(() => createRuntimeMaterial(materialConfig, shaderConfig), [materialConfig, shaderConfig])

  useFrame((state) => {
    if (!meshRef.current) return

    if (material.uniforms?.time) {
      material.uniforms.time.value = state.clock.elapsedTime
    }

    if (data.animation) {
      if (data.animation.rotate) {
        meshRef.current.rotation.y += data.animation.rotate * 0.01
      }
      if (data.animation.bounce) {
        meshRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * data.animation.bounce) * 0.5
      }
      if (data.animation.float) {
        meshRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime) * data.animation.float
      }
    }
  })

  const handleClick = (event) => {
    if (!isEditor) return
    event.stopPropagation()
    setSelectedObject({ ...data, entityType: 'object' })
  }

  return (
    <group position={position} rotation={rotation} scale={scale}>
      <group
        ref={meshRef}
        onClick={handleClick}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        {isModel ? (
          <ModelAsset asset={modelAsset} src={modelAsset?.source?.uri || modelAsset?.src || data.modelUrl} />
        ) : (
          <mesh
            material={material}
            castShadow={settings.shadowQuality !== 'off'}
            receiveShadow={settings.shadowQuality !== 'off'}
          >
            <PrimitiveGeometry type={data.type} />
          </mesh>
        )}
      </group>

      {(hovered || isSelected) && !isModel && (
        <mesh>
          <boxGeometry args={[
            (scale[0] || 1) + 0.1,
            (scale[1] || 1) + 0.1,
            (scale[2] || 1) + 0.1
          ]} />
          <meshBasicMaterial
            color={isSelected ? '#ec4899' : '#6366f1'}
            wireframe
            transparent
            opacity={0.5}
          />
        </mesh>
      )}

      {data.light && (
        <pointLight
          color={data.light.color || '#fff'}
          intensity={data.light.intensity || 1}
          distance={data.light.distance || 10}
          decay={data.light.decay || 2}
        />
      )}
    </group>
  )
}

export default WorldObject
