/**
 * ScreenUI.jsx  –  Unity-style Screen Space Overlay UI for Three.js
 *
 * How it works:
 *  • A second OrthographicCamera renders AFTER the main scene (autoClear:false)
 *  • UI elements are positioned in pixel coordinates (0,0 = top-left)
 *  • The camera maps pixels 1:1 so a 200px wide panel is exactly 200 units wide
 *  • renderOrder=999 ensures UI always draws on top
 *  • No billboarding needed – elements are always screen-aligned
 *
 * Mouse/pointer handling:
 *  • We use a manual Raycaster with the ortho camera for hit-testing
 *  • This is because R3F's built-in events use the main perspective camera,
 *    which gives wrong coordinates for our screen-space UI
 *  • We track the pointer from the main canvas and raycast against UI meshes
 *
 * Performance notes:
 *  • _texCache and _matCache are module-level Maps – created once, reused forever
 *  • ScreenButton hover uses imperative material swap (no re-render)
 *  • ScreenUI scene/camera created once, camera updated imperatively on resize
 *  • All geometry uses the shared PLANE_GEO singleton
 *  • Single raycaster instance, reused every frame
 */
import { useRef, useMemo, useEffect, createContext, useContext, useCallback } from 'react'
import { useFrame, useThree, createPortal } from '@react-three/fiber'
import * as THREE from 'three'

// ─── Context ──────────────────────────────────────────────────────────────────
// Holds the UI scene + ortho camera so children can portal into it
const ScreenUIContext = createContext({ scene: null, camera: null, size: null })

// ─── Texture cache (module-level, never GC'd during session) ─────────────────
const _texCache = new Map()
function makeTextTex(text, fontSize, color, fontWeight, bg, maxW) {
  const key = `${text}|${fontSize}|${color}|${fontWeight}|${bg}|${maxW}`
  if (_texCache.has(key)) return _texCache.get(key)
  const pad = 4
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  const font = `${fontWeight || 'normal'} ${fontSize}px sans-serif`
  ctx.font = font
  const lines = String(text).split('\n')
  let mw = 4
  for (const l of lines) mw = Math.max(mw, ctx.measureText(l).width)
  const lh = fontSize * 1.3
  const w = Math.min(Math.ceil(mw + pad * 2), maxW || 1024)
  const h = Math.ceil(lines.length * lh + pad * 2)
  canvas.width = w; canvas.height = h
  ctx.font = font
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h) }
  else ctx.clearRect(0, 0, w, h)
  for (let i = 0; i < lines.length; i++) {
    ctx.fillStyle = color || '#fff'
    ctx.fillText(lines[i], pad, pad + (i + 0.82) * lh)
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearFilter
  const result = { tex, w, h }
  _texCache.set(key, result)
  return result
}

// ─── Material cache (module-level) ───────────────────────────────────────────
const _matCache = new Map()
function getColorMat(color, opacity = 1) {
  const key = `${color}|${opacity}`
  if (_matCache.has(key)) return _matCache.get(key)
  const m = new THREE.MeshBasicMaterial({
    color, transparent: opacity < 1,
    opacity, depthTest: false, depthWrite: false, side: THREE.DoubleSide
  })
  _matCache.set(key, m)
  return m
}

// ─── Text material cache (keyed by texture object) ────────────────────────────
const _textMatCache = new Map()
function getTextMat(tex) {
  if (_textMatCache.has(tex)) return _textMatCache.get(tex)
  const m = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide
  })
  _textMatCache.set(tex, m)
  return m
}

// ─── Shared geometry ──────────────────────────────────────────────────────────
const PLANE_GEO = new THREE.PlaneGeometry(1, 1)

// ─── Coordinate helpers ───────────────────────────────────────────────────────
// Convert anchor + pixel offset → ortho world position (origin = screen center)
function panelWorldPos(anchor, x, y, w, h, sw, sh) {
  switch (anchor) {
    case 'top-left':      return [(-sw/2) + x + w/2,   (sh/2) - y - h/2]
    case 'top-right':     return [(sw/2)  - x - w/2,   (sh/2) - y - h/2]
    case 'top-center':    return [x,                    (sh/2) - y - h/2]
    case 'bottom-left':   return [(-sw/2) + x + w/2,  -(sh/2) + y + h/2]
    case 'bottom-right':  return [(sw/2)  - x - w/2,  -(sh/2) + y + h/2]
    case 'bottom-center': return [x,                   -(sh/2) + y + h/2]
    case 'center':        return [x,                   -y]
    default:              return [(-sw/2) + x + w/2,   (sh/2) - y - h/2]
  }
}

// ─── Raycaster for UI hit-testing ─────────────────────────────────────────────
const _raycaster = new THREE.Raycaster()
const _pointer = new THREE.Vector2()

// ─── ScreenUI root ────────────────────────────────────────────────────────────
export function ScreenUI({ children }) {
  const { gl, size, camera } = useThree()

  // Scene and camera created ONCE
  const uiScene  = useMemo(() => new THREE.Scene(), [])
  const uiCamera = useMemo(() => new THREE.OrthographicCamera(
    -size.width / 2, size.width / 2,
    size.height / 2, -size.height / 2,
    -100, 100
  ), []) // eslint-disable-line react-hooks/exhaustive-deps

  // Track which meshes have which callbacks (built from portal children)
  const hitTestMeshesRef = useRef(new Map())
  const hoveredMeshRef = useRef(null)

  // Expose register/unregister functions to children via context
  const registerMesh = useCallback((mesh, callbacks) => {
    hitTestMeshesRef.current.set(mesh.uuid, { mesh, callbacks })
    return () => hitTestMeshesRef.current.delete(mesh.uuid)
  }, [])

  // Update camera imperatively on resize (no re-render triggered)
  useEffect(() => {
    uiCamera.left   = -size.width / 2
    uiCamera.right  =  size.width / 2
    uiCamera.top    =  size.height / 2
    uiCamera.bottom = -size.height / 2
    uiCamera.updateProjectionMatrix()
  }, [size.width, size.height, uiCamera])

  // Handle pointer events - raycast against UI scene using ortho camera
  useEffect(() => {
    const canvas = gl.domElement
    
    const handlePointerMove = (e) => {
      // Convert to normalized device coordinates (-1 to +1)
      const rect = canvas.getBoundingClientRect()
      _pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      _pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
      
      // Raycast against UI scene with ortho camera
      _raycaster.setFromCamera(_pointer, uiCamera)
      
      // Get all meshes that have callbacks
      const meshes = Array.from(hitTestMeshesRef.current.values())
        .filter(m => m.callbacks.onPointerOver || m.callbacks.onPointerOut)
        .map(m => m.mesh)
      
      const intersects = _raycaster.intersectObjects(meshes, false)
      
      if (intersects.length > 0) {
        const hitMesh = intersects[0].object
        const entry = hitTestMeshesRef.current.get(hitMesh.uuid)
        
        if (hoveredMeshRef.current !== hitMesh && entry?.callbacks?.onPointerOver) {
          // Unhover previous
          if (hoveredMeshRef.current) {
            const prevEntry = hitTestMeshesRef.current.get(hoveredMeshRef.current.uuid)
            prevEntry?.callbacks?.onPointerOut?.()
          }
          // Hover new
          entry.callbacks.onPointerOver()
          hoveredMeshRef.current = hitMesh
        }
      } else if (hoveredMeshRef.current) {
        // Unhover previous
        const prevEntry = hitTestMeshesRef.current.get(hoveredMeshRef.current.uuid)
        prevEntry?.callbacks?.onPointerOut?.()
        hoveredMeshRef.current = null
      }
    }
    
    const handlePointerDown = (e) => {
      const rect = canvas.getBoundingClientRect()
      _pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      _pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
      
      _raycaster.setFromCamera(_pointer, uiCamera)
      
      const meshes = Array.from(hitTestMeshesRef.current.values())
        .filter(m => m.callbacks.onClick)
        .map(m => m.mesh)
      
      const intersects = _raycaster.intersectObjects(meshes, false)
      
      if (intersects.length > 0) {
        const hitMesh = intersects[0].object
        const entry = hitTestMeshesRef.current.get(hitMesh.uuid)
        entry?.callbacks?.onClick?.()
      }
    }

    canvas.addEventListener('pointermove', handlePointerMove)
    canvas.addEventListener('pointerdown', handlePointerDown)
    
    return () => {
      canvas.removeEventListener('pointermove', handlePointerMove)
      canvas.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [gl, uiCamera])

  // Render UI scene after main scene every frame
  useFrame(() => {
    gl.autoClear = false
    gl.clearDepth()
    gl.render(uiScene, uiCamera)
    gl.autoClear = true
  }, 999)

  // Pass everything via context
  const ctx = useMemo(() => ({ 
    scene: uiScene, 
    camera: uiCamera, 
    size,
    registerMesh
  }), [uiScene, uiCamera, size, registerMesh])

  return (
    <ScreenUIContext.Provider value={ctx}>
      {/* Don't pass camera to createPortal - we handle events manually */}
      {createPortal(children, uiScene)}
    </ScreenUIContext.Provider>
  )
}

// ─── ScreenPanel ──────────────────────────────────────────────────────────────
export function ScreenPanel({
  x = 0, y = 0, w = 200, h = 100,
  anchor = 'top-left',
  color = '#0d1117', opacity = 0.92,
  borderColor, borderWidth = 2,
  children,
}) {
  const { size } = useContext(ScreenUIContext)
  const sw = size?.width ?? 800, sh = size?.height ?? 600
  const [wx, wy] = panelWorldPos(anchor, x, y, w, h, sw, sh)

  const mat       = useMemo(() => getColorMat(color, opacity), [color, opacity])
  const borderMat = useMemo(() => borderColor ? getColorMat(borderColor, 0.9) : null, [borderColor])

  return (
    <group position={[wx, wy, 0]}>
      {borderMat && (
        <mesh renderOrder={998} scale={[w + borderWidth * 2, h + borderWidth * 2, 1]}>
          <primitive object={PLANE_GEO} attach="geometry" />
          <primitive object={borderMat} attach="material" />
        </mesh>
      )}
      <mesh renderOrder={999} scale={[w, h, 1]}>
        <primitive object={PLANE_GEO} attach="geometry" />
        <primitive object={mat} attach="material" />
      </mesh>
      {/* Children positioned relative to panel top-left corner */}
      <group position={[-w / 2, h / 2, 0.1]}>
        {children}
      </group>
    </group>
  )
}

// ─── ScreenText ───────────────────────────────────────────────────────────────
export function ScreenText({
  x = 0, y = 0,
  text = '',
  fontSize = 14,
  color = '#ffffff',
  fontWeight = 'normal',
  align = 'left',
  maxWidth,
}) {
  const str = String(text)
  const { tex, w, h } = useMemo(
    () => makeTextTex(str, fontSize, color, fontWeight, null, maxWidth),
    [str, fontSize, color, fontWeight, maxWidth]
  )
  const mat = useMemo(() => getTextMat(tex), [tex])
  const ox = align === 'center' ? -w / 2 : align === 'right' ? -w : 0

  return (
    <mesh
      renderOrder={1000}
      position={[x + ox + w / 2, -(y + h / 2), 0.2]}
      scale={[w, h, 1]}
    >
      <primitive object={PLANE_GEO} attach="geometry" />
      <primitive object={mat} attach="material" />
    </mesh>
  )
}

// ─── ScreenBar ────────────────────────────────────────────────────────────────
export function ScreenBar({
  x = 0, y = 0, w = 150, h = 10,
  value = 1,
  color = '#4ade80',
  bgColor = '#1f2937',
}) {
  const bgMat   = useMemo(() => getColorMat(bgColor, 0.9), [bgColor])
  const fillMat = useMemo(() => getColorMat(color, 1), [color])
  const fillW   = Math.max(1, value * w)

  return (
    <group position={[x + w / 2, -(y + h / 2), 0.2]}>
      <mesh renderOrder={1000} scale={[w, h, 1]}>
        <primitive object={PLANE_GEO} attach="geometry" />
        <primitive object={bgMat} attach="material" />
      </mesh>
      <mesh renderOrder={1001} position={[-(w - fillW) / 2, 0, 0.01]} scale={[fillW, h, 1]}>
        <primitive object={PLANE_GEO} attach="geometry" />
        <primitive object={fillMat} attach="material" />
      </mesh>
    </group>
  )
}

// ─── InteractiveMesh ────────────────────────────────────────────────────────────
// Helper component that registers its mesh for raycasting and handles events
function InteractiveMesh({ children, onClick, onPointerOver, onPointerOut }) {
  const meshRef = useRef()
  const { registerMesh } = useContext(ScreenUIContext)
  const normalMatRef = useRef()
  const hoverMatRef = useRef()

  useEffect(() => {
    if (!meshRef.current) return
    const mesh = meshRef.current
    
    // Get materials from children (assume first child is the background mesh)
    const childMesh = mesh.children[0]
    if (childMesh && childMesh.material) {
      normalMatRef.current = childMesh.material
    }
    
    const unregister = registerMesh(mesh, {
      onClick,
      onPointerOver: () => {
        if (onPointerOver) onPointerOver()
        if (hoverMatRef.current && normalMatRef.current) {
          childMesh.material = hoverMatRef.current
        }
        document.body.style.cursor = 'pointer'
      },
      onPointerOut: () => {
        if (onPointerOut) onPointerOut()
        if (normalMatRef.current) {
          childMesh.material = normalMatRef.current
        }
        document.body.style.cursor = 'auto'
      }
    })
    
    return unregister
  }, [registerMesh, onClick, onPointerOver, onPointerOut])

  // Create hover material when we have the normal material
  const createHoverMat = useCallback((normalMat, hoverColor) => {
    if (!normalMat) return null
    return normalMat.clone()
  }, [])

  return (
    <group ref={meshRef}>
      {children}
    </group>
  )
}

// ─── ScreenButton ─────────────────────────────────────────────────────────────
export function ScreenButton({
  x = 0, y = 0, w = 120, h = 32,
  label = 'Button',
  color = '#3b82f6',
  hoverColor = '#2563eb',
  textColor = '#ffffff',
  fontSize = 13,
  onClick,
  disabled = false,
}) {
  const { registerMesh } = useContext(ScreenUIContext)
  const groupRef = useRef()
  
  const normalMat = useMemo(() => getColorMat(color, disabled ? 0.5 : 0.95), [color, disabled])
  const hoverMat = useMemo(() => getColorMat(hoverColor, disabled ? 0.5 : 0.95), [hoverColor, disabled])

  const { tex, w: tw, h: th } = useMemo(
    () => makeTextTex(label, fontSize, textColor, '600'),
    [label, fontSize, textColor]
  )
  const textMat = useMemo(() => getTextMat(tex), [tex])

  // Register for raycasting
  useEffect(() => {
    if (!groupRef.current) return
    
    const mesh = groupRef.current
    const unregister = registerMesh(mesh, {
      onClick: disabled ? undefined : onClick,
      onPointerOver: () => {
        if (disabled) return
        const bgMesh = mesh.children[0]
        if (bgMesh) bgMesh.material = hoverMat
        document.body.style.cursor = 'pointer'
      },
      onPointerOut: () => {
        const bgMesh = mesh.children[0]
        if (bgMesh) bgMesh.material = normalMat
        document.body.style.cursor = 'auto'
      }
    })
    
    return unregister
  }, [registerMesh, onClick, disabled, normalMat, hoverMat])

  return (
    <group ref={groupRef} position={[x + w / 2, -(y + h / 2), 0.2]}>
      <mesh renderOrder={1000} scale={[w, h, 1]}>
        <primitive object={PLANE_GEO} attach="geometry" />
        <primitive object={normalMat} attach="material" />
      </mesh>
      <mesh renderOrder={1001} position={[0, 0, 0.1]} scale={[tw, th, 1]}>
        <primitive object={PLANE_GEO} attach="geometry" />
        <primitive object={textMat} attach="material" />
      </mesh>
    </group>
  )
}

// ─── ScreenColorSwatch ────────────────────────────────────────────────────────
export function ScreenColorSwatch({ x = 0, y = 0, size = 20, color = '#fff', selected = false, onClick }) {
  const { registerMesh } = useContext(ScreenUIContext)
  const groupRef = useRef()
  
  const mat    = useMemo(() => getColorMat(color, 1), [color])
  const selMat = useMemo(() => getColorMat('#ffffff', 1), [])
  const hovMat = useMemo(() => getColorMat('#aaaaaa', 1), [])
  const defMat = useMemo(() => getColorMat('#444444', 1), [])

  // Register for raycasting
  useEffect(() => {
    if (!groupRef.current) return
    
    const mesh = groupRef.current
    const borderMesh = mesh.children[0]
    
    const unregister = registerMesh(mesh, {
      onClick,
      onPointerOver: () => {
        if (borderMesh) borderMesh.material = hovMat
        document.body.style.cursor = 'pointer'
      },
      onPointerOut: () => {
        if (borderMesh) borderMesh.material = selected ? selMat : defMat
        document.body.style.cursor = 'auto'
      }
    })
    
    return unregister
  }, [registerMesh, onClick, selected, selMat, defMat, hovMat])

  // Update border color when selection changes
  useEffect(() => {
    if (!groupRef.current) return
    const borderMesh = groupRef.current.children[0]
    if (borderMesh) {
      borderMesh.material = selected ? selMat : defMat
    }
  }, [selected, selMat, defMat])

  return (
    <group ref={groupRef} position={[x + size / 2, -(y + size / 2), 0.2]}>
      <mesh renderOrder={999} scale={[size + 4, size + 4, 1]}>
        <primitive object={PLANE_GEO} attach="geometry" />
        <primitive object={selected ? selMat : defMat} attach="material" />
      </mesh>
      <mesh renderOrder={1000} scale={[size, size, 1]}>
        <primitive object={PLANE_GEO} attach="geometry" />
        <primitive object={mat} attach="material" />
      </mesh>
    </group>
  )
}

// ─── ScreenDivider ────────────────────────────────────────────────────────────
export function ScreenDivider({ x = 0, y = 0, w = 200, color = '#374151' }) {
  const mat = useMemo(() => getColorMat(color, 0.7), [color])
  return (
    <mesh renderOrder={1000} position={[x + w / 2, -(y + 1), 0.2]} scale={[w, 2, 1]}>
      <primitive object={PLANE_GEO} attach="geometry" />
      <primitive object={mat} attach="material" />
    </mesh>
  )
}

export default ScreenUI
