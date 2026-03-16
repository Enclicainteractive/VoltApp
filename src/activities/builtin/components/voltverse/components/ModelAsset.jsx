import { useEffect, useMemo } from 'react'
import { useLoader } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js'

const inferFormat = (asset, src) => {
  const explicit = asset?.format || asset?.mimeType
  if (explicit?.includes?.('obj') || explicit === 'obj') return 'obj'
  if (explicit?.includes?.('gltf') || explicit === 'gltf' || explicit === 'glb') return 'gltf'
  const value = String(src || asset?.name || '').toLowerCase()
  if (value.endsWith('.obj') || value.includes('model/obj')) return 'obj'
  return 'gltf'
}

const resolveAssetSrc = (asset, src) => (
  src ||
  asset?.source?.uri ||
  asset?.src ||
  asset?.uri ||
  asset?.embeddedData ||
  asset?.data ||
  null
)

const GltfModel = ({ src, onLoaded }) => {
  const gltf = useGLTF(src)
  const scene = useMemo(() => clone(gltf.scene), [gltf.scene])

  useEffect(() => {
    onLoaded?.(scene)
  }, [onLoaded, scene])

  return <primitive object={scene} />
}

const ObjModel = ({ src, onLoaded }) => {
  const object = useLoader(OBJLoader, src)
  const scene = useMemo(() => object.clone(true), [object])

  useEffect(() => {
    onLoaded?.(scene)
  }, [onLoaded, scene])

  return <primitive object={scene} />
}

const ModelAsset = ({ asset, src, onLoaded }) => {
  const resolvedSrc = resolveAssetSrc(asset, src)
  const format = inferFormat(asset, resolvedSrc)

  if (!resolvedSrc) return null
  if (format === 'obj') return <ObjModel src={resolvedSrc} onLoaded={onLoaded} />
  return <GltfModel src={resolvedSrc} onLoaded={onLoaded} />
}

export default ModelAsset
