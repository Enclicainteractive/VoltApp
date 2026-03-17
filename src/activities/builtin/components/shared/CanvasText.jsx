/**
 * CanvasText.jsx
 * Drop-in replacement for @react-three/drei Text that NEVER suspends.
 * Uses canvas textures – no font loading, no network requests, no suspension.
 */
import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

const _cache = new Map()

function makeTextTexture(text, fontSize, color, fontWeight, outlineColor, outlineWidth) {
  const key = `${text}|${fontSize}|${color}|${fontWeight}|${outlineColor}|${outlineWidth}`
  if (_cache.has(key)) return _cache.get(key)

  const pad = 6
  const ow = outlineWidth > 0 ? outlineWidth : 0
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  const font = `${fontWeight} ${fontSize}px sans-serif`
  ctx.font = font

  const lines = String(text).split('\n')
  let maxW = 4
  for (const line of lines) maxW = Math.max(maxW, ctx.measureText(line).width)
  const lineH = fontSize * 1.3
  const w = Math.ceil(maxW + pad * 2 + ow * 2)
  const h = Math.ceil(lines.length * lineH + pad * 2 + ow * 2)

  canvas.width = w
  canvas.height = h
  ctx.font = font
  ctx.clearRect(0, 0, w, h)

  for (let i = 0; i < lines.length; i++) {
    const x = pad + ow
    const y = pad + ow + (i + 0.82) * lineH
    if (ow > 0) {
      ctx.strokeStyle = outlineColor || '#000'
      ctx.lineWidth = ow * 2
      ctx.lineJoin = 'round'
      ctx.strokeText(lines[i], x, y)
    }
    ctx.fillStyle = color
    ctx.fillText(lines[i], x, y)
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearFilter
  const result = { tex, w, h }
  _cache.set(key, result)
  return result
}

export function CanvasText({
  children,
  position = [0, 0, 0],
  fontSize = 0.2,
  color = '#ffffff',
  anchorX = 'center',
  anchorY = 'middle',
  outlineWidth = 0,
  outlineColor = '#000000',
  fontWeight = 'normal',
}) {
  const text = String(children ?? '')
  const pxSize = Math.max(8, Math.round(fontSize * 100))

  const { tex, w, h } = useMemo(
    () => makeTextTexture(text, pxSize, color, fontWeight, outlineColor, Math.round(outlineWidth * 100)),
    [text, pxSize, color, fontWeight, outlineColor, outlineWidth]
  )

  const mat = useMemo(() => new THREE.MeshBasicMaterial({
    map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  }), [tex])

  const worldW = (w / pxSize) * fontSize
  const worldH = (h / pxSize) * fontSize
  const ox = anchorX === 'left' ? worldW / 2 : anchorX === 'right' ? -worldW / 2 : 0
  const oy = anchorY === 'bottom' ? worldH / 2 : anchorY === 'top' ? -worldH / 2 : 0

  const groupRef = useRef()
  const { camera } = useThree()

  useFrame(() => {
    if (groupRef.current) groupRef.current.quaternion.copy(camera.quaternion)
  })

  return (
    <group ref={groupRef} position={position}>
      <mesh position={[ox, oy, 0]}>
        <planeGeometry args={[worldW, worldH]} />
        <primitive object={mat} attach="material" />
      </mesh>
    </group>
  )
}

export default CanvasText
