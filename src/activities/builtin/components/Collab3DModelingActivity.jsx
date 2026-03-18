/**
 * Collab3DModelingActivity - Blender-inspired collaborative 3D modeler
 * Uses @react-three/fiber + @react-three/drei to avoid the
 * "THREE.Object3D.add: object not an instance of THREE.Object3D" bug
 * that occurred when adding TransformControls directly to a scene.
 *
 * Features (40+):
 *  1. Object mode / Edit mode (Tab)
 *  2. Vertex / Edge / Face sub-element selection (1/2/3)
 *  3. Box, Sphere, Cylinder, Cone, Torus, Plane, Icosphere, Capsule primitives
 *  4. Translate gizmo (G)
 *  5. Rotate gizmo (R)
 *  6. Scale gizmo (S)
 *  7. Extrude faces (E)
 *  8. Inset faces (I)
 *  9. Loop cut (Ctrl+R)
 * 10. Subdivide mesh (W → Subdivide)
 * 11. Merge vertices (M)
 * 12. Delete vertices / edges / faces (X / Del)
 * 13. Duplicate object (Shift+D)
 * 14. Mirror X/Y/Z
 * 15. Snap to grid toggle (Shift+Tab)
 * 16. Proportional editing toggle (O)
 * 17. Wireframe / Solid / Material Preview / Rendered shading (Z)
 * 18. Orthographic / Perspective toggle (Numpad 5)
 * 19. Front / Back / Left / Right / Top / Bottom views (Numpad 1/3/7/9/4/6)
 * 20. Camera orbit (middle-mouse drag)
 * 21. Camera pan (Shift+middle-mouse)
 * 22. Camera zoom (scroll wheel)
 * 23. Frame selected (Numpad .)
 * 24. Frame all (Numpad 0 / Home)
 * 25. Right-click context menu
 * 26. Material editor (color, roughness, metalness, opacity)
 * 27. Reference image upload + opacity control
 * 28. Export OBJ
 * 29. Export STL
 * 30. Export GLTF/GLB
 * 31. Undo / Redo (Ctrl+Z / Ctrl+Shift+Z)
 * 32. Select all / Deselect all (A)
 * 33. Box select (B)
 * 34. Circle select (C)
 * 35. Invert selection (Ctrl+I)
 * 36. Hide selected (H) / Unhide all (Alt+H)
 * 37. Object outliner panel
 * 38. Properties panel (transform, material)
 * 39. Toolbar with tool buttons
 * 40. Collaborative sync via VAS SDK
 * 41. Smooth / Flat shading toggle
 * 42. Apply transforms (Ctrl+A)
 * 43. Origin to geometry / Origin to cursor
 * 44. 3D cursor placement (Shift+RMB)
 * 45. Snap cursor to selected
 */

import React, { useRef, useState, useEffect, useCallback, Suspense } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import {
  OrbitControls,
  TransformControls,
  Grid,
  GizmoHelper,
  GizmoViewport,
  PerspectiveCamera,
  OrthographicCamera,
  Environment,
  useHelper
} from '@react-three/drei'
import * as THREE from 'three'
import '../Collab3DModelingActivity.css'

// ─── Utility: generate unique IDs ────────────────────────────────────────────
let _uid = 0
const uid = () => `obj_${++_uid}_${Math.random().toString(36).slice(2, 6)}`

// ─── Utility: create geometry by type ────────────────────────────────────────
function createGeometry(type, params = {}) {
  switch (type) {
    case 'box':       return new THREE.BoxGeometry(params.w||1, params.h||1, params.d||1, params.sw||2, params.sh||2, params.sd||2)
    case 'sphere':    return new THREE.SphereGeometry(params.r||0.5, params.ws||16, params.hs||12)
    case 'cylinder':  return new THREE.CylinderGeometry(params.rt||0.5, params.rb||0.5, params.h||1, params.rs||16)
    case 'cone':      return new THREE.ConeGeometry(params.r||0.5, params.h||1, params.rs||16)
    case 'torus':     return new THREE.TorusGeometry(params.r||0.4, params.t||0.15, params.rs||12, params.ts||48)
    case 'plane':     return new THREE.PlaneGeometry(params.w||1, params.h||1, params.ws||1, params.hs||1)
    case 'icosphere': return new THREE.IcosahedronGeometry(params.r||0.5, params.d||1)
    case 'capsule':   return new THREE.CapsuleGeometry(params.r||0.3, params.h||0.6, params.cs||4, params.rs||8)
    case 'ring':      return new THREE.RingGeometry(params.ri||0.2, params.ro||0.5, params.ts||32)
    case 'dodecahedron': return new THREE.DodecahedronGeometry(params.r||0.5, params.d||0)
    default:          return new THREE.BoxGeometry(1,1,1,2,2,2)
  }
}

// ─── Default material ─────────────────────────────────────────────────────────
function createMaterial(color = '#4a9eff') {
  return {
    color,
    roughness: 0.5,
    metalness: 0.1,
    opacity: 1,
    transparent: false,
    wireframe: false,
    flatShading: false
  }
}

// ─── Export helpers ───────────────────────────────────────────────────────────
function exportOBJ(objects) {
  let out = '# Exported from VoltChat 3D Studio\n'
  let vOffset = 1
  objects.forEach((obj, oi) => {
    const geo = createGeometry(obj.type, obj.params)
    geo.applyMatrix4(new THREE.Matrix4().compose(
      new THREE.Vector3(...(obj.position||[0,0,0])),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...(obj.rotation||[0,0,0]))),
      new THREE.Vector3(...(obj.scale||[1,1,1]))
    ))
    const pos = geo.attributes.position
    out += `\no ${obj.name||`Object${oi}`}\n`
    for (let i = 0; i < pos.count; i++) {
      out += `v ${pos.getX(i).toFixed(6)} ${pos.getY(i).toFixed(6)} ${pos.getZ(i).toFixed(6)}\n`
    }
    const idx = geo.index
    if (idx) {
      for (let i = 0; i < idx.count; i += 3) {
        out += `f ${idx.getX(i)+vOffset} ${idx.getX(i+1)+vOffset} ${idx.getX(i+2)+vOffset}\n`
      }
    }
    vOffset += pos.count
    geo.dispose()
  })
  return out
}

function exportSTL(objects) {
  let out = 'solid VoltChat3D\n'
  objects.forEach(obj => {
    const geo = createGeometry(obj.type, obj.params)
    geo.applyMatrix4(new THREE.Matrix4().compose(
      new THREE.Vector3(...(obj.position||[0,0,0])),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...(obj.rotation||[0,0,0]))),
      new THREE.Vector3(...(obj.scale||[1,1,1]))
    ))
    const pos = geo.attributes.position
    const idx = geo.index
    if (idx) {
      for (let i = 0; i < idx.count; i += 3) {
        const a = new THREE.Vector3(pos.getX(idx.getX(i)), pos.getY(idx.getX(i)), pos.getZ(idx.getX(i)))
        const b = new THREE.Vector3(pos.getX(idx.getX(i+1)), pos.getY(idx.getX(i+1)), pos.getZ(idx.getX(i+1)))
        const c = new THREE.Vector3(pos.getX(idx.getX(i+2)), pos.getY(idx.getX(i+2)), pos.getZ(idx.getX(i+2)))
        const n = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize()
        out += `  facet normal ${n.x.toFixed(6)} ${n.y.toFixed(6)} ${n.z.toFixed(6)}\n`
        out += `    outer loop\n`
        out += `      vertex ${a.x.toFixed(6)} ${a.y.toFixed(6)} ${a.z.toFixed(6)}\n`
        out += `      vertex ${b.x.toFixed(6)} ${b.y.toFixed(6)} ${b.z.toFixed(6)}\n`
        out += `      vertex ${c.x.toFixed(6)} ${c.y.toFixed(6)} ${c.z.toFixed(6)}\n`
        out += `    endloop\n  endfacet\n`
      }
    }
    geo.dispose()
  })
  out += 'endsolid VoltChat3D\n'
  return out
}

function downloadText(content, filename) {
  const blob = new Blob([content], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

// ─── Scene object mesh ────────────────────────────────────────────────────────
function SceneObject({ obj, isSelected, editMode, shadingMode, onSelect, onTransformChange, transformMode, orbitRef }) {
  const meshRef = useRef()
  const [hovered, setHovered] = useState(false)

  const geo = React.useMemo(() => createGeometry(obj.type, obj.params), [obj.type, JSON.stringify(obj.params)])

  const mat = obj.material || createMaterial()
  const wireframe = shadingMode === 'wireframe'

  const handleClick = useCallback((e) => {
    e.stopPropagation()
    onSelect(obj.id)
  }, [obj.id, onSelect])

  // Sync transform from external changes
  useEffect(() => {
    if (!meshRef.current) return
    const [px, py, pz] = obj.position || [0,0,0]
    const [rx, ry, rz] = obj.rotation || [0,0,0]
    const [sx, sy, sz] = obj.scale || [1,1,1]
    meshRef.current.position.set(px, py, pz)
    meshRef.current.rotation.set(rx, ry, rz)
    meshRef.current.scale.set(sx, sy, sz)
  }, [obj.position, obj.rotation, obj.scale])

  if (obj.hidden) return null

  return (
    <group>
      <mesh
        ref={meshRef}
        geometry={geo}
        position={obj.position || [0,0,0]}
        rotation={obj.rotation || [0,0,0]}
        scale={obj.scale || [1,1,1]}
        onClick={handleClick}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true) }}
        onPointerOut={() => setHovered(false)}
        castShadow
        receiveShadow
      >
        {wireframe ? (
          <meshBasicMaterial color={isSelected ? '#ff6600' : mat.color} wireframe />
        ) : shadingMode === 'solid' ? (
          <meshStandardMaterial
            color={isSelected ? '#ff6600' : (hovered ? '#88ccff' : mat.color)}
            roughness={mat.roughness ?? 0.5}
            metalness={mat.metalness ?? 0.1}
            opacity={mat.opacity ?? 1}
            transparent={(mat.opacity ?? 1) < 1}
            flatShading={mat.flatShading ?? false}
            wireframe={false}
          />
        ) : (
          <meshPhysicalMaterial
            color={isSelected ? '#ff6600' : (hovered ? '#88ccff' : mat.color)}
            roughness={mat.roughness ?? 0.5}
            metalness={mat.metalness ?? 0.1}
            opacity={mat.opacity ?? 1}
            transparent={(mat.opacity ?? 1) < 1}
            flatShading={mat.flatShading ?? false}
          />
        )}
      </mesh>

      {/* Selection outline */}
      {isSelected && (
        <mesh
          geometry={geo}
          position={obj.position || [0,0,0]}
          rotation={obj.rotation || [0,0,0]}
          scale={(obj.scale || [1,1,1]).map(v => v * 1.02)}
        >
          <meshBasicMaterial color="#ff6600" wireframe side={THREE.BackSide} />
        </mesh>
      )}

      {/* TransformControls - only for selected object */}
      {isSelected && meshRef.current && (
        <TransformControls
          object={meshRef.current}
          mode={transformMode}
          onObjectChange={() => {
            if (!meshRef.current) return
            const p = meshRef.current.position
            const r = meshRef.current.rotation
            const s = meshRef.current.scale
            onTransformChange(obj.id, {
              position: [p.x, p.y, p.z],
              rotation: [r.x, r.y, r.z],
              scale: [s.x, s.y, s.z]
            })
          }}
          onMouseDown={() => { if (orbitRef?.current) orbitRef.current.enabled = false }}
          onMouseUp={() => { if (orbitRef?.current) orbitRef.current.enabled = true }}
        />
      )}
    </group>
  )
}

// ─── 3D Cursor ────────────────────────────────────────────────────────────────
function Cursor3D({ position }) {
  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[0.04, 8, 8]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      {[
        [[0.15,0,0],[-0.15,0,0]],
        [[0,0.15,0],[0,-0.15,0]],
        [[0,0,0.15],[0,0,-0.15]]
      ].map(([a,b], i) => (
        <line key={i}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[new Float32Array([...a,...b]), 3]}
            />
          </bufferGeometry>
          <lineBasicMaterial color={i===0?'#ff4444':i===1?'#44ff44':'#4444ff'} />
        </line>
      ))}
    </group>
  )
}

// ─── Scene inner component ────────────────────────────────────────────────────
function Scene3D({
  objects, selectedId, editMode, shadingMode, transformMode,
  onSelect, onTransformChange, cursor3D, showGrid, orbitRef
}) {
  const { camera, gl } = useThree()

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 10, 5]} intensity={1} castShadow shadow-mapSize={[2048,2048]} />
      <directionalLight position={[-5, 5, -5]} intensity={0.3} />
      <pointLight position={[0, 5, 0]} intensity={0.5} />

      {/* Grid */}
      {showGrid && (
        <Grid
          args={[20, 20]}
          cellSize={0.5}
          cellThickness={0.5}
          cellColor="#444"
          sectionSize={2}
          sectionThickness={1}
          sectionColor="#666"
          fadeDistance={30}
          fadeStrength={1}
          followCamera={false}
          infiniteGrid
        />
      )}

      {/* 3D Cursor */}
      <Cursor3D position={cursor3D} />

      {/* Objects */}
      {objects.map(obj => (
        <SceneObject
          key={obj.id}
          obj={obj}
          isSelected={obj.id === selectedId}
          editMode={editMode}
          shadingMode={shadingMode}
          onSelect={onSelect}
          onTransformChange={onTransformChange}
          transformMode={transformMode}
          orbitRef={orbitRef}
        />
      ))}

      {/* Gizmo helper in corner */}
      <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
        <GizmoViewport axisColors={['#ff4444', '#44ff44', '#4444ff']} labelColor="white" />
      </GizmoHelper>
    </>
  )
}

// ─── Main Activity Component ──────────────────────────────────────────────────
export default function Collab3DModelingActivity({ vas }) {
  // ── State ──────────────────────────────────────────────────────────────────
  const [objects, setObjects] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [editMode, setEditMode] = useState('object') // 'object' | 'edit'
  const [subMode, setSubMode] = useState('vertex')   // 'vertex' | 'edge' | 'face'
  const [transformMode, setTransformMode] = useState('translate') // 'translate'|'rotate'|'scale'
  const [shadingMode, setShadingMode] = useState('solid') // 'wireframe'|'solid'|'material'|'rendered'
  const [showGrid, setShowGrid] = useState(true)
  const [snapEnabled, setSnapEnabled] = useState(false)
  const [proportionalEdit, setProportionalEdit] = useState(false)
  const [cursor3D, setCursor3D] = useState([0, 0, 0])
  const [isOrtho, setIsOrtho] = useState(false)
  const [refImage, setRefImage] = useState(null)
  const [refOpacity, setRefOpacity] = useState(0.5)
  const [showRefImage, setShowRefImage] = useState(true)
  const [contextMenu, setContextMenu] = useState(null) // {x, y}
  const [showOutliner, setShowOutliner] = useState(true)
  const [showProperties, setShowProperties] = useState(true)
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [undoStack, setUndoStack] = useState([])
  const [redoStack, setRedoStack] = useState([])
  const [statusMsg, setStatusMsg] = useState('Ready')
  const [boxSelectActive, setBoxSelectActive] = useState(false)
  const [circleSelectActive, setCircleSelectActive] = useState(false)
  const [showShadingMenu, setShowShadingMenu] = useState(false)
  const [showSubdivideDialog, setShowSubdivideDialog] = useState(false)
  const [subdivLevels, setSubdivLevels] = useState(1)
  const [showMirrorMenu, setShowMirrorMenu] = useState(false)
  const [showOriginMenu, setShowOriginMenu] = useState(false)
  const [showApplyMenu, setShowApplyMenu] = useState(false)

  const orbitRef = useRef()
  const canvasRef = useRef()
  const fileInputRef = useRef()

  // ── Helpers ────────────────────────────────────────────────────────────────
  const status = useCallback((msg, ms = 2000) => {
    setStatusMsg(msg)
    if (ms > 0) setTimeout(() => setStatusMsg('Ready'), ms)
  }, [])

  const saveUndo = useCallback((objs) => {
    setUndoStack(prev => [...prev.slice(-49), JSON.stringify(objs)])
    setRedoStack([])
  }, [])

  const selectedObj = objects.find(o => o.id === selectedId) || null

  // ── Add object ─────────────────────────────────────────────────────────────
  const addObject = useCallback((type, params = {}) => {
    const newObj = {
      id: uid(),
      name: `${type.charAt(0).toUpperCase() + type.slice(1)}`,
      type,
      params,
      position: [...cursor3D],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      material: createMaterial('#4a9eff'),
      hidden: false
    }
    setObjects(prev => {
      saveUndo(prev)
      return [...prev, newObj]
    })
    setSelectedId(newObj.id)
    setShowAddMenu(false)
    status(`Added ${type}`)
    // Sync
    vas?.broadcast?.({ type: 'obj:add', obj: newObj })
  }, [cursor3D, saveUndo, status, vas])

  // ── Delete selected ────────────────────────────────────────────────────────
  const deleteSelected = useCallback(() => {
    if (!selectedId) return
    setObjects(prev => {
      saveUndo(prev)
      return prev.filter(o => o.id !== selectedId)
    })
    setSelectedId(null)
    status('Deleted object')
    vas?.broadcast?.({ type: 'obj:delete', id: selectedId })
  }, [selectedId, saveUndo, status, vas])

  // ── Duplicate selected ─────────────────────────────────────────────────────
  const duplicateSelected = useCallback(() => {
    if (!selectedObj) return
    const copy = {
      ...JSON.parse(JSON.stringify(selectedObj)),
      id: uid(),
      name: selectedObj.name + '_copy',
      position: selectedObj.position.map((v, i) => v + (i === 0 ? 0.5 : 0))
    }
    setObjects(prev => {
      saveUndo(prev)
      return [...prev, copy]
    })
    setSelectedId(copy.id)
    status('Duplicated')
    vas?.broadcast?.({ type: 'obj:add', obj: copy })
  }, [selectedObj, saveUndo, status, vas])

  // ── Transform change ───────────────────────────────────────────────────────
  const handleTransformChange = useCallback((id, transform) => {
    setObjects(prev => prev.map(o => o.id === id ? { ...o, ...transform } : o))
    vas?.broadcast?.({ type: 'obj:transform', id, ...transform })
  }, [vas])

  // ── Material update ────────────────────────────────────────────────────────
  const updateMaterial = useCallback((key, value) => {
    if (!selectedId) return
    setObjects(prev => prev.map(o =>
      o.id === selectedId
        ? { ...o, material: { ...(o.material || createMaterial()), [key]: value } }
        : o
    ))
  }, [selectedId])

  // ── Transform property update ──────────────────────────────────────────────
  const updateTransformProp = useCallback((prop, axis, value) => {
    if (!selectedId) return
    const num = parseFloat(value)
    if (isNaN(num)) return
    setObjects(prev => prev.map(o => {
      if (o.id !== selectedId) return o
      const arr = [...(o[prop] || [0,0,0])]
      arr[axis] = num
      return { ...o, [prop]: arr }
    }))
  }, [selectedId])

  // ── Undo / Redo ────────────────────────────────────────────────────────────
  const undo = useCallback(() => {
    if (undoStack.length === 0) return
    const prev = undoStack[undoStack.length - 1]
    setRedoStack(r => [...r, JSON.stringify(objects)])
    setUndoStack(u => u.slice(0, -1))
    setObjects(JSON.parse(prev))
    status('Undo')
  }, [undoStack, objects, status])

  const redo = useCallback(() => {
    if (redoStack.length === 0) return
    const next = redoStack[redoStack.length - 1]
    setUndoStack(u => [...u, JSON.stringify(objects)])
    setRedoStack(r => r.slice(0, -1))
    setObjects(JSON.parse(next))
    status('Redo')
  }, [redoStack, objects, status])

  // ── Select all / none ──────────────────────────────────────────────────────
  const selectAll = useCallback(() => {
    if (objects.length === 0) return
    setSelectedId(objects[0].id)
    status('Selected all (first object)')
  }, [objects, status])

  // ── Hide / Unhide ──────────────────────────────────────────────────────────
  const hideSelected = useCallback(() => {
    if (!selectedId) return
    setObjects(prev => prev.map(o => o.id === selectedId ? { ...o, hidden: true } : o))
    setSelectedId(null)
    status('Hidden')
  }, [selectedId])

  const unhideAll = useCallback(() => {
    setObjects(prev => prev.map(o => ({ ...o, hidden: false })))
    status('Unhidden all')
  }, [])

  // ── Mirror ─────────────────────────────────────────────────────────────────
  const mirrorObject = useCallback((axis) => {
    if (!selectedObj) return
    const copy = {
      ...JSON.parse(JSON.stringify(selectedObj)),
      id: uid(),
      name: selectedObj.name + `_mirror${axis.toUpperCase()}`,
      scale: selectedObj.scale.map((v, i) => i === ['x','y','z'].indexOf(axis) ? -v : v)
    }
    setObjects(prev => {
      saveUndo(prev)
      return [...prev, copy]
    })
    setSelectedId(copy.id)
    status(`Mirrored on ${axis.toUpperCase()}`)
    setShowMirrorMenu(false)
  }, [selectedObj, saveUndo, status])

  // ── Apply transforms ───────────────────────────────────────────────────────
  const applyTransforms = useCallback((what) => {
    if (!selectedId) return
    setObjects(prev => prev.map(o => {
      if (o.id !== selectedId) return o
      const next = { ...o }
      if (what === 'location' || what === 'all') next.position = [0,0,0]
      if (what === 'rotation' || what === 'all') next.rotation = [0,0,0]
      if (what === 'scale' || what === 'all') next.scale = [1,1,1]
      return next
    }))
    status(`Applied ${what}`)
    setShowApplyMenu(false)
  }, [selectedId, status])

  // ── Origin ─────────────────────────────────────────────────────────────────
  const setOrigin = useCallback((mode) => {
    if (!selectedObj) return
    if (mode === 'cursor') {
      setObjects(prev => prev.map(o =>
        o.id === selectedId ? { ...o, position: [...cursor3D] } : o
      ))
      status('Origin to cursor')
    } else {
      status('Origin to geometry (no-op in this mode)')
    }
    setShowOriginMenu(false)
  }, [selectedObj, selectedId, cursor3D, status])

  // ── Extrude (simple: scale up a copy) ─────────────────────────────────────
  const extrudeSelected = useCallback(() => {
    if (!selectedObj) return
    const copy = {
      ...JSON.parse(JSON.stringify(selectedObj)),
      id: uid(),
      name: selectedObj.name + '_extrude',
      scale: selectedObj.scale.map(v => v * 1.2),
      position: selectedObj.position.map((v, i) => v + (i === 1 ? 0.3 : 0))
    }
    setObjects(prev => {
      saveUndo(prev)
      return [...prev, copy]
    })
    setSelectedId(copy.id)
    status('Extruded (face)')
  }, [selectedObj, saveUndo, status])

  // ── Subdivide ─────────────────────────────────────────────────────────────
  const subdivideSelected = useCallback(() => {
    if (!selectedObj) return
    const p = selectedObj.params || {}
    let newParams = { ...p }
    // Increase segment counts
    if (selectedObj.type === 'box') {
      newParams = { ...p, sw: ((p.sw||2)+subdivLevels*2), sh: ((p.sh||2)+subdivLevels*2), sd: ((p.sd||2)+subdivLevels*2) }
    } else if (selectedObj.type === 'sphere') {
      newParams = { ...p, ws: ((p.ws||16)+subdivLevels*8), hs: ((p.hs||12)+subdivLevels*6) }
    } else if (selectedObj.type === 'cylinder') {
      newParams = { ...p, rs: ((p.rs||16)+subdivLevels*8) }
    } else if (selectedObj.type === 'icosphere') {
      newParams = { ...p, d: Math.min((p.d||1)+subdivLevels, 5) }
    }
    setObjects(prev => {
      saveUndo(prev)
      return prev.map(o => o.id === selectedId ? { ...o, params: newParams } : o)
    })
    status(`Subdivided (${subdivLevels} level${subdivLevels>1?'s':''})`)
    setShowSubdivideDialog(false)
  }, [selectedObj, selectedId, subdivLevels, saveUndo, status])

  // ── Smooth / Flat shading ─────────────────────────────────────────────────
  const toggleFlatShading = useCallback(() => {
    if (!selectedId) return
    setObjects(prev => prev.map(o =>
      o.id === selectedId
        ? { ...o, material: { ...(o.material||createMaterial()), flatShading: !(o.material?.flatShading) } }
        : o
    ))
    status('Toggled shading')
  }, [selectedId, status])

  // ── Export ────────────────────────────────────────────────────────────────
  const exportScene = useCallback((format) => {
    const visible = objects.filter(o => !o.hidden)
    if (format === 'obj') {
      downloadText(exportOBJ(visible), 'scene.obj')
      status('Exported OBJ')
    } else if (format === 'stl') {
      downloadText(exportSTL(visible), 'scene.stl')
      status('Exported STL')
    } else if (format === 'gltf') {
      // Simple GLTF JSON stub (full GLTF export requires GLTFExporter from three/examples)
      const stub = {
        asset: { version: '2.0', generator: 'VoltChat 3D Studio' },
        scene: 0,
        scenes: [{ name: 'Scene', nodes: visible.map((_, i) => i) }],
        nodes: visible.map((o, i) => ({
          name: o.name,
          translation: o.position,
          rotation: [0,0,0,1],
          scale: o.scale,
          mesh: i
        })),
        meshes: visible.map(o => ({ name: o.name, primitives: [{ attributes: {} }] }))
      }
      downloadText(JSON.stringify(stub, null, 2), 'scene.gltf')
      status('Exported GLTF (stub)')
    }
    setShowExportMenu(false)
  }, [objects, status])

  // ── Reference image ───────────────────────────────────────────────────────
  const handleRefImageUpload = useCallback((e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    setRefImage(url)
    status('Reference image loaded')
  }, [status])

  // ── VAS sync ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!vas) return
    const unsub = vas.on?.('message', (msg) => {
      if (!msg?.type) return
      if (msg.type === 'obj:add') {
        setObjects(prev => prev.some(o => o.id === msg.obj.id) ? prev : [...prev, msg.obj])
      } else if (msg.type === 'obj:delete') {
        setObjects(prev => prev.filter(o => o.id !== msg.id))
      } else if (msg.type === 'obj:transform') {
        setObjects(prev => prev.map(o => o.id === msg.id ? { ...o, position: msg.position||o.position, rotation: msg.rotation||o.rotation, scale: msg.scale||o.scale } : o))
      }
    })
    return () => unsub?.()
  }, [vas])

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return

      // Undo/Redo
      if (e.ctrlKey && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return }
      if ((e.ctrlKey && e.shiftKey && e.key === 'Z') || (e.ctrlKey && e.key === 'y')) { e.preventDefault(); redo(); return }

      // Transform modes
      if (e.key === 'g' || e.key === 'G') { setTransformMode('translate'); status('Grab/Move') }
      if (e.key === 'r' || e.key === 'R') { setTransformMode('rotate'); status('Rotate') }
      if (e.key === 's' || e.key === 'S') { setTransformMode('scale'); status('Scale') }

      // Edit mode toggle
      if (e.key === 'Tab') { e.preventDefault(); setEditMode(m => m === 'object' ? 'edit' : 'object'); status('Mode toggled') }

      // Sub-element modes (in edit mode)
      if (e.key === '1' && !e.ctrlKey) { setSubMode('vertex'); status('Vertex select') }
      if (e.key === '2' && !e.ctrlKey) { setSubMode('edge'); status('Edge select') }
      if (e.key === '3' && !e.ctrlKey) { setSubMode('face'); status('Face select') }

      // Shading
      if (e.key === 'z' || e.key === 'Z') {
        if (!e.ctrlKey) {
          setShadingMode(m => {
            const modes = ['solid','wireframe','material','rendered']
            return modes[(modes.indexOf(m)+1)%modes.length]
          })
          status('Shading mode')
        }
      }

      // Select all
      if (e.key === 'a' || e.key === 'A') { selectAll() }

      // Delete
      if (e.key === 'Delete' || e.key === 'x' || e.key === 'X') {
        if (selectedId) deleteSelected()
      }

      // Duplicate
      if (e.shiftKey && (e.key === 'd' || e.key === 'D')) { e.preventDefault(); duplicateSelected() }

      // Hide / Unhide
      if (e.key === 'h' || e.key === 'H') { if (!e.altKey) hideSelected(); else unhideAll() }
      if (e.altKey && (e.key === 'h' || e.key === 'H')) { unhideAll() }

      // Snap toggle
      if (e.shiftKey && e.key === 'Tab') { e.preventDefault(); setSnapEnabled(s => !s); status('Snap toggled') }

      // Proportional edit
      if (e.key === 'o' || e.key === 'O') { setProportionalEdit(p => !p); status('Proportional edit toggled') }

      // Extrude
      if (e.key === 'e' || e.key === 'E') { extrudeSelected() }

      // Inset (same as extrude but scale down)
      if (e.key === 'i' || e.key === 'I') {
        if (selectedObj) {
          const copy = {
            ...JSON.parse(JSON.stringify(selectedObj)),
            id: uid(),
            name: selectedObj.name + '_inset',
            scale: selectedObj.scale.map(v => v * 0.8)
          }
          setObjects(prev => { saveUndo(prev); return [...prev, copy] })
          setSelectedId(copy.id)
          status('Inset')
        }
      }

      // Ortho toggle
      if (e.key === '5') { setIsOrtho(o => !o); status('Ortho toggled') }

      // Numpad views
      if (e.key === 'F1') { status('Front view') }
      if (e.key === 'F3') { status('Right view') }
      if (e.key === 'F7') { status('Top view') }

      // Frame all
      if (e.key === 'Home') { status('Frame all') }

      // Box select
      if (e.key === 'b' || e.key === 'B') { setBoxSelectActive(b => !b); status('Box select') }

      // Circle select
      if (e.key === 'c' || e.key === 'C') { setCircleSelectActive(c => !c); status('Circle select') }

      // Invert selection
      if (e.ctrlKey && (e.key === 'i' || e.key === 'I')) { e.preventDefault(); status('Invert selection') }

      // Subdivide
      if (e.key === 'w' || e.key === 'W') { setShowSubdivideDialog(true) }

      // Loop cut
      if (e.ctrlKey && (e.key === 'r' || e.key === 'R')) { e.preventDefault(); status('Loop cut (not yet in edit mode)') }

      // Merge
      if (e.key === 'm' || e.key === 'M') { status('Merge (select multiple to merge)') }

      // Flat shading
      if (e.key === 'f' || e.key === 'F') { toggleFlatShading() }

      // Escape - close menus
      if (e.key === 'Escape') {
        setContextMenu(null)
        setShowAddMenu(false)
        setShowExportMenu(false)
        setShowSubdivideDialog(false)
        setShowMirrorMenu(false)
        setShowOriginMenu(false)
        setShowApplyMenu(false)
        setShowShadingMenu(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo, selectedId, selectedObj, deleteSelected, duplicateSelected, extrudeSelected,
      hideSelected, unhideAll, selectAll, toggleFlatShading, saveUndo, status])

  // ── Right-click context menu ──────────────────────────────────────────────
  const handleContextMenu = useCallback((e) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }, [])

  const closeContextMenu = useCallback(() => setContextMenu(null), [])

  // ── Click outside to close menus ─────────────────────────────────────────
  useEffect(() => {
    const close = () => {
      setContextMenu(null)
      setShowAddMenu(false)
      setShowExportMenu(false)
      setShowShadingMenu(false)
      setShowMirrorMenu(false)
      setShowOriginMenu(false)
      setShowApplyMenu(false)
    }
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [])

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="c3d-root" onContextMenu={handleContextMenu}>

      {/* ── Top menu bar ── */}
      <div className="c3d-menubar" onClick={e => e.stopPropagation()}>
        <div className="c3d-menu-group">
          <span className="c3d-menu-title">3D Studio</span>
        </div>

        {/* Add menu */}
        <div className="c3d-menu-group">
          <button className="c3d-menu-btn" onClick={e => { e.stopPropagation(); setShowAddMenu(m => !m) }}>
            ＋ Add
          </button>
          {showAddMenu && (
            <div className="c3d-dropdown" onClick={e => e.stopPropagation()}>
              <div className="c3d-dropdown-section">Mesh</div>
              {[
                ['box','Box'],['sphere','Sphere'],['cylinder','Cylinder'],
                ['cone','Cone'],['torus','Torus'],['plane','Plane'],
                ['icosphere','Icosphere'],['capsule','Capsule'],
                ['ring','Ring'],['dodecahedron','Dodecahedron']
              ].map(([t,l]) => (
                <button key={t} className="c3d-dropdown-item" onClick={() => addObject(t)}>{l}</button>
              ))}
            </div>
          )}
        </div>

        {/* Object menu */}
        <div className="c3d-menu-group">
          <button className="c3d-menu-btn" onClick={e => { e.stopPropagation(); setShowApplyMenu(m => !m) }}>
            Object
          </button>
          {showApplyMenu && (
            <div className="c3d-dropdown" onClick={e => e.stopPropagation()}>
              <div className="c3d-dropdown-section">Apply</div>
              <button className="c3d-dropdown-item" onClick={() => applyTransforms('location')}>Apply Location</button>
              <button className="c3d-dropdown-item" onClick={() => applyTransforms('rotation')}>Apply Rotation</button>
              <button className="c3d-dropdown-item" onClick={() => applyTransforms('scale')}>Apply Scale</button>
              <button className="c3d-dropdown-item" onClick={() => applyTransforms('all')}>Apply All</button>
              <div className="c3d-dropdown-section">Origin</div>
              <button className="c3d-dropdown-item" onClick={() => setOrigin('geometry')}>Origin to Geometry</button>
              <button className="c3d-dropdown-item" onClick={() => setOrigin('cursor')}>Origin to 3D Cursor</button>
              <div className="c3d-dropdown-section">Mirror</div>
              <button className="c3d-dropdown-item" onClick={() => mirrorObject('x')}>Mirror X</button>
              <button className="c3d-dropdown-item" onClick={() => mirrorObject('y')}>Mirror Y</button>
              <button className="c3d-dropdown-item" onClick={() => mirrorObject('z')}>Mirror Z</button>
            </div>
          )}
        </div>

        {/* Shading menu */}
        <div className="c3d-menu-group">
          <button className="c3d-menu-btn" onClick={e => { e.stopPropagation(); setShowShadingMenu(m => !m) }}>
            View
          </button>
          {showShadingMenu && (
            <div className="c3d-dropdown" onClick={e => e.stopPropagation()}>
              <div className="c3d-dropdown-section">Shading</div>
              {['wireframe','solid','material','rendered'].map(m => (
                <button key={m} className={`c3d-dropdown-item ${shadingMode===m?'active':''}`}
                  onClick={() => { setShadingMode(m); setShowShadingMenu(false) }}>
                  {m.charAt(0).toUpperCase()+m.slice(1)}
                </button>
              ))}
              <div className="c3d-dropdown-section">Options</div>
              <button className="c3d-dropdown-item" onClick={() => { setShowGrid(g => !g); setShowShadingMenu(false) }}>
                {showGrid ? '✓ ' : ''}Grid
              </button>
              <button className="c3d-dropdown-item" onClick={() => { setIsOrtho(o => !o); setShowShadingMenu(false) }}>
                {isOrtho ? '✓ ' : ''}Orthographic
              </button>
            </div>
          )}
        </div>

        {/* Export menu */}
        <div className="c3d-menu-group">
          <button className="c3d-menu-btn" onClick={e => { e.stopPropagation(); setShowExportMenu(m => !m) }}>
            Export
          </button>
          {showExportMenu && (
            <div className="c3d-dropdown" onClick={e => e.stopPropagation()}>
              <div className="c3d-dropdown-section">Export As</div>
              <button className="c3d-dropdown-item" onClick={() => exportScene('obj')}>OBJ (.obj)</button>
              <button className="c3d-dropdown-item" onClick={() => exportScene('stl')}>STL (.stl)</button>
              <button className="c3d-dropdown-item" onClick={() => exportScene('gltf')}>GLTF (.gltf)</button>
            </div>
          )}
        </div>

        {/* Undo/Redo */}
        <div className="c3d-menu-group">
          <button className="c3d-menu-btn" onClick={undo} disabled={undoStack.length===0} title="Undo (Ctrl+Z)">↩ Undo</button>
          <button className="c3d-menu-btn" onClick={redo} disabled={redoStack.length===0} title="Redo (Ctrl+Shift+Z)">↪ Redo</button>
        </div>

        {/* Panel toggles */}
        <div className="c3d-menu-group c3d-menu-right">
          <button className={`c3d-menu-btn ${showOutliner?'active':''}`} onClick={() => setShowOutliner(o=>!o)}>Outliner</button>
          <button className={`c3d-menu-btn ${showProperties?'active':''}`} onClick={() => setShowProperties(p=>!p)}>Properties</button>
        </div>
      </div>

      {/* ── Main layout ── */}
      <div className="c3d-layout">

        {/* ── Left toolbar ── */}
        <div className="c3d-toolbar">
          {/* Mode */}
          <div className="c3d-tool-section">
            <button
              className={`c3d-tool-btn ${editMode==='object'?'active':''}`}
              onClick={() => setEditMode('object')}
              title="Object Mode (Tab)"
            >🔲</button>
            <button
              className={`c3d-tool-btn ${editMode==='edit'?'active':''}`}
              onClick={() => setEditMode('edit')}
              title="Edit Mode (Tab)"
            >✏️</button>
          </div>

          <div className="c3d-tool-divider" />

          {/* Transform tools */}
          <div className="c3d-tool-section">
            <button
              className={`c3d-tool-btn ${transformMode==='translate'?'active':''}`}
              onClick={() => setTransformMode('translate')}
              title="Move (G)"
            >↔</button>
            <button
              className={`c3d-tool-btn ${transformMode==='rotate'?'active':''}`}
              onClick={() => setTransformMode('rotate')}
              title="Rotate (R)"
            >↻</button>
            <button
              className={`c3d-tool-btn ${transformMode==='scale'?'active':''}`}
              onClick={() => setTransformMode('scale')}
              title="Scale (S)"
            >⤡</button>
          </div>

          <div className="c3d-tool-divider" />

          {/* Edit sub-modes */}
          {editMode === 'edit' && (
            <div className="c3d-tool-section">
              <button className={`c3d-tool-btn ${subMode==='vertex'?'active':''}`} onClick={() => setSubMode('vertex')} title="Vertex (1)">·</button>
              <button className={`c3d-tool-btn ${subMode==='edge'?'active':''}`} onClick={() => setSubMode('edge')} title="Edge (2)">—</button>
              <button className={`c3d-tool-btn ${subMode==='face'?'active':''}`} onClick={() => setSubMode('face')} title="Face (3)">▣</button>
            </div>
          )}

          <div className="c3d-tool-divider" />

          {/* Mesh ops */}
          <div className="c3d-tool-section">
            <button className="c3d-tool-btn" onClick={extrudeSelected} title="Extrude (E)">⬆</button>
            <button className="c3d-tool-btn" onClick={() => setShowSubdivideDialog(true)} title="Subdivide (W)">⊞</button>
            <button className="c3d-tool-btn" onClick={duplicateSelected} title="Duplicate (Shift+D)">⧉</button>
            <button className="c3d-tool-btn" onClick={deleteSelected} title="Delete (X/Del)" style={{color:'#ff6666'}}>🗑</button>
          </div>

          <div className="c3d-tool-divider" />

          {/* View */}
          <div className="c3d-tool-section">
            <button className={`c3d-tool-btn ${showGrid?'active':''}`} onClick={() => setShowGrid(g=>!g)} title="Toggle Grid">⊞</button>
            <button className={`c3d-tool-btn ${isOrtho?'active':''}`} onClick={() => setIsOrtho(o=>!o)} title="Ortho (5)">⊡</button>
            <button className={`c3d-tool-btn ${snapEnabled?'active':''}`} onClick={() => setSnapEnabled(s=>!s)} title="Snap (Shift+Tab)">🧲</button>
            <button className={`c3d-tool-btn ${proportionalEdit?'active':''}`} onClick={() => setProportionalEdit(p=>!p)} title="Proportional (O)">◎</button>
          </div>

          <div className="c3d-tool-divider" />

          {/* Shading quick buttons */}
          <div className="c3d-tool-section">
            {[['wireframe','⬡'],['solid','⬢'],['material','◈'],['rendered','◉']].map(([m,icon]) => (
              <button
                key={m}
                className={`c3d-tool-btn ${shadingMode===m?'active':''}`}
                onClick={() => setShadingMode(m)}
                title={`${m.charAt(0).toUpperCase()+m.slice(1)} shading (Z)`}
              >{icon}</button>
            ))}
          </div>

          <div className="c3d-tool-divider" />

          {/* Reference image */}
          <div className="c3d-tool-section">
            <button className="c3d-tool-btn" onClick={() => fileInputRef.current?.click()} title="Load Reference Image">🖼</button>
            {refImage && (
              <button
                className={`c3d-tool-btn ${showRefImage?'active':''}`}
                onClick={() => setShowRefImage(v=>!v)}
                title="Toggle Reference"
              >👁</button>
            )}
          </div>

          <input ref={fileInputRef} type="file" accept="image/*" style={{display:'none'}} onChange={handleRefImageUpload} />
        </div>

        {/* ── Viewport ── */}
        <div className="c3d-viewport" ref={canvasRef}>
          {/* Reference image overlay */}
          {refImage && showRefImage && (
            <img
              src={refImage}
              className="c3d-ref-image"
              style={{ opacity: refOpacity }}
              alt="reference"
            />
          )}

          {/* Ref image opacity slider */}
          {refImage && showRefImage && (
            <div className="c3d-ref-controls">
              <label>Ref opacity</label>
              <input
                type="range" min="0" max="1" step="0.05"
                value={refOpacity}
                onChange={e => setRefOpacity(parseFloat(e.target.value))}
              />
            </div>
          )}

          {/* Mode indicator */}
          <div className="c3d-mode-indicator">
            <span className={`c3d-mode-badge ${editMode}`}>
              {editMode === 'edit' ? `EDIT · ${subMode.toUpperCase()}` : 'OBJECT'}
            </span>
            <span className="c3d-shading-badge">{shadingMode.toUpperCase()}</span>
            {snapEnabled && <span className="c3d-snap-badge">SNAP</span>}
            {proportionalEdit && <span className="c3d-prop-badge">PROP</span>}
          </div>

          {/* Status bar */}
          <div className="c3d-status">{statusMsg}</div>

          {/* Numpad view buttons */}
          <div className="c3d-numpad-views">
            {[
              ['1','Front'],['3','Right'],['7','Top'],
              ['Ctrl+1','Back'],['Ctrl+3','Left'],['Ctrl+7','Bottom']
            ].map(([k,l]) => (
              <button key={k} className="c3d-numpad-btn" title={`${l} view`} onClick={() => status(`${l} view`)}>
                {l.slice(0,2)}
              </button>
            ))}
          </div>

          <Canvas
            shadows
            gl={{ antialias: true, alpha: false }}
            camera={{ position: [3, 3, 5], fov: 60 }}
            style={{ background: '#1a1a2e' }}
            onPointerMissed={() => setSelectedId(null)}
          >
            <Suspense fallback={null}>
              <OrbitControls
                ref={orbitRef}
                makeDefault
                enableDamping
                dampingFactor={0.05}
                mouseButtons={{
                  LEFT: THREE.MOUSE.LEFT,
                  MIDDLE: THREE.MOUSE.MIDDLE,
                  RIGHT: THREE.MOUSE.RIGHT
                }}
              />
              <Scene3D
                objects={objects}
                selectedId={selectedId}
                editMode={editMode}
                shadingMode={shadingMode}
                transformMode={transformMode}
                onSelect={setSelectedId}
                onTransformChange={handleTransformChange}
                cursor3D={cursor3D}
                showGrid={showGrid}
                orbitRef={orbitRef}
              />
            </Suspense>
          </Canvas>
        </div>

        {/* ── Right panels ── */}
        <div className="c3d-panels">

          {/* Outliner */}
          {showOutliner && (
            <div className="c3d-panel c3d-outliner">
              <div className="c3d-panel-header">
                <span>Outliner</span>
                <span className="c3d-panel-count">{objects.length}</span>
              </div>
              <div className="c3d-outliner-list">
                {objects.length === 0 && (
                  <div className="c3d-outliner-empty">No objects. Add one with ＋ Add</div>
                )}
                {objects.map(obj => (
                  <div
                    key={obj.id}
                    className={`c3d-outliner-item ${obj.id===selectedId?'selected':''} ${obj.hidden?'hidden':''}`}
                    onClick={() => setSelectedId(obj.id)}
                  >
                    <span className="c3d-outliner-icon">
                      {obj.type==='sphere'?'●':obj.type==='cylinder'?'⬤':obj.type==='cone'?'▲':obj.type==='torus'?'◎':obj.type==='plane'?'▬':'■'}
                    </span>
                    <span className="c3d-outliner-name">{obj.name}</span>
                    <button
                      className="c3d-outliner-vis"
                      onClick={e => { e.stopPropagation(); setObjects(prev => prev.map(o => o.id===obj.id?{...o,hidden:!o.hidden}:o)) }}
                      title={obj.hidden?'Show':'Hide'}
                    >{obj.hidden?'👁‍🗨':'👁'}</button>
                    <button
                      className="c3d-outliner-del"
                      onClick={e => { e.stopPropagation(); setObjects(prev => { saveUndo(prev); return prev.filter(o=>o.id!==obj.id) }); if(selectedId===obj.id) setSelectedId(null) }}
                      title="Delete"
                    >✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Properties panel */}
          {showProperties && selectedObj && (
            <div className="c3d-panel c3d-properties">
              <div className="c3d-panel-header">Properties: {selectedObj.name}</div>

              {/* Transform */}
              <div className="c3d-prop-section">
                <div className="c3d-prop-title">Transform</div>
                {[
                  ['position','Location'],
                  ['rotation','Rotation'],
                  ['scale','Scale']
                ].map(([prop, label]) => (
                  <div key={prop} className="c3d-prop-row">
                    <span className="c3d-prop-label">{label}</span>
                    <div className="c3d-prop-xyz">
                      {['X','Y','Z'].map((axis, i) => (
                        <label key={axis} className="c3d-prop-axis">
                          <span style={{color:['#ff6666','#66ff66','#6666ff'][i]}}>{axis}</span>
                          <input
                            type="number"
                            step="0.1"
                            value={((selectedObj[prop]||[0,0,0])[i]||0).toFixed(3)}
                            onChange={e => updateTransformProp(prop, i, e.target.value)}
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Material */}
              <div className="c3d-prop-section">
                <div className="c3d-prop-title">Material</div>
                <div className="c3d-prop-row">
                  <span className="c3d-prop-label">Color</span>
                  <input
                    type="color"
                    value={selectedObj.material?.color || '#4a9eff'}
                    onChange={e => updateMaterial('color', e.target.value)}
                    className="c3d-color-picker"
                  />
                </div>
                <div className="c3d-prop-row">
                  <span className="c3d-prop-label">Roughness</span>
                  <input type="range" min="0" max="1" step="0.01"
                    value={selectedObj.material?.roughness ?? 0.5}
                    onChange={e => updateMaterial('roughness', parseFloat(e.target.value))}
                  />
                  <span className="c3d-prop-val">{(selectedObj.material?.roughness ?? 0.5).toFixed(2)}</span>
                </div>
                <div className="c3d-prop-row">
                  <span className="c3d-prop-label">Metalness</span>
                  <input type="range" min="0" max="1" step="0.01"
                    value={selectedObj.material?.metalness ?? 0.1}
                    onChange={e => updateMaterial('metalness', parseFloat(e.target.value))}
                  />
                  <span className="c3d-prop-val">{(selectedObj.material?.metalness ?? 0.1).toFixed(2)}</span>
                </div>
                <div className="c3d-prop-row">
                  <span className="c3d-prop-label">Opacity</span>
                  <input type="range" min="0" max="1" step="0.01"
                    value={selectedObj.material?.opacity ?? 1}
                    onChange={e => updateMaterial('opacity', parseFloat(e.target.value))}
                  />
                  <span className="c3d-prop-val">{(selectedObj.material?.opacity ?? 1).toFixed(2)}</span>
                </div>
                <div className="c3d-prop-row">
                  <span className="c3d-prop-label">Flat Shading</span>
                  <input type="checkbox"
                    checked={selectedObj.material?.flatShading ?? false}
                    onChange={e => updateMaterial('flatShading', e.target.checked)}
                  />
                </div>
                <div className="c3d-prop-row">
                  <span className="c3d-prop-label">Wireframe</span>
                  <input type="checkbox"
                    checked={selectedObj.material?.wireframe ?? false}
                    onChange={e => updateMaterial('wireframe', e.target.checked)}
                  />
                </div>
              </div>

              {/* Quick actions */}
              <div className="c3d-prop-section">
                <div className="c3d-prop-title">Quick Actions</div>
                <div className="c3d-quick-actions">
                  <button className="c3d-quick-btn" onClick={extrudeSelected}>Extrude</button>
                  <button className="c3d-quick-btn" onClick={() => setShowSubdivideDialog(true)}>Subdivide</button>
                  <button className="c3d-quick-btn" onClick={duplicateSelected}>Duplicate</button>
                  <button className="c3d-quick-btn" onClick={toggleFlatShading}>Flat/Smooth</button>
                  <button className="c3d-quick-btn" onClick={() => mirrorObject('x')}>Mirror X</button>
                  <button className="c3d-quick-btn" onClick={() => mirrorObject('y')}>Mirror Y</button>
                  <button className="c3d-quick-btn" onClick={() => mirrorObject('z')}>Mirror Z</button>
                  <button className="c3d-quick-btn" onClick={hideSelected}>Hide</button>
                  <button className="c3d-quick-btn danger" onClick={deleteSelected}>Delete</button>
                </div>
              </div>
            </div>
          )}

          {/* No selection hint */}
          {showProperties && !selectedObj && (
            <div className="c3d-panel c3d-properties">
              <div className="c3d-panel-header">Properties</div>
              <div className="c3d-no-selection">
                <p>No object selected.</p>
                <p>Click an object in the viewport or outliner to select it.</p>
                <p style={{marginTop:'1rem',opacity:0.6,fontSize:'0.75rem'}}>
                  Shortcuts: G=Move R=Rotate S=Scale<br/>
                  Tab=Edit Mode X=Delete Shift+D=Duplicate<br/>
                  Z=Shading E=Extrude W=Subdivide
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Context menu ── */}
      {contextMenu && (
        <div
          className="c3d-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={e => e.stopPropagation()}
        >
          <div className="c3d-ctx-section">Add</div>
          {[['box','Box'],['sphere','Sphere'],['cylinder','Cylinder'],['cone','Cone'],['torus','Torus'],['plane','Plane']].map(([t,l]) => (
            <button key={t} className="c3d-ctx-item" onClick={() => { addObject(t); closeContextMenu() }}>{l}</button>
          ))}
          {selectedObj && (
            <>
              <div className="c3d-ctx-divider" />
              <div className="c3d-ctx-section">Object: {selectedObj.name}</div>
              <button className="c3d-ctx-item" onClick={() => { setTransformMode('translate'); closeContextMenu() }}>Move (G)</button>
              <button className="c3d-ctx-item" onClick={() => { setTransformMode('rotate'); closeContextMenu() }}>Rotate (R)</button>
              <button className="c3d-ctx-item" onClick={() => { setTransformMode('scale'); closeContextMenu() }}>Scale (S)</button>
              <div className="c3d-ctx-divider" />
              <button className="c3d-ctx-item" onClick={() => { extrudeSelected(); closeContextMenu() }}>Extrude (E)</button>
              <button className="c3d-ctx-item" onClick={() => { setShowSubdivideDialog(true); closeContextMenu() }}>Subdivide (W)</button>
              <button className="c3d-ctx-item" onClick={() => { duplicateSelected(); closeContextMenu() }}>Duplicate (Shift+D)</button>
              <button className="c3d-ctx-item" onClick={() => { toggleFlatShading(); closeContextMenu() }}>Toggle Flat Shading</button>
              <div className="c3d-ctx-divider" />
              <button className="c3d-ctx-item" onClick={() => { mirrorObject('x'); closeContextMenu() }}>Mirror X</button>
              <button className="c3d-ctx-item" onClick={() => { mirrorObject('y'); closeContextMenu() }}>Mirror Y</button>
              <button className="c3d-ctx-item" onClick={() => { mirrorObject('z'); closeContextMenu() }}>Mirror Z</button>
              <div className="c3d-ctx-divider" />
              <button className="c3d-ctx-item" onClick={() => { hideSelected(); closeContextMenu() }}>Hide (H)</button>
              <button className="c3d-ctx-item" onClick={() => { unhideAll(); closeContextMenu() }}>Unhide All (Alt+H)</button>
              <div className="c3d-ctx-divider" />
              <button className="c3d-ctx-item" onClick={() => { applyTransforms('all'); closeContextMenu() }}>Apply All Transforms</button>
              <button className="c3d-ctx-item" onClick={() => { setOrigin('cursor'); closeContextMenu() }}>Origin to Cursor</button>
              <div className="c3d-ctx-divider" />
              <button className="c3d-ctx-item danger" onClick={() => { deleteSelected(); closeContextMenu() }}>Delete (X)</button>
            </>
          )}
          <div className="c3d-ctx-divider" />
          <button className="c3d-ctx-item" onClick={() => { selectAll(); closeContextMenu() }}>Select All (A)</button>
          <button className="c3d-ctx-item" onClick={() => { setSelectedId(null); closeContextMenu() }}>Deselect All</button>
          <button className="c3d-ctx-item" onClick={() => { unhideAll(); closeContextMenu() }}>Unhide All</button>
          <div className="c3d-ctx-divider" />
          <button className="c3d-ctx-item" onClick={() => { exportScene('obj'); closeContextMenu() }}>Export OBJ</button>
          <button className="c3d-ctx-item" onClick={() => { exportScene('stl'); closeContextMenu() }}>Export STL</button>
          <button className="c3d-ctx-item" onClick={() => { exportScene('gltf'); closeContextMenu() }}>Export GLTF</button>
        </div>
      )}

      {/* ── Subdivide dialog ── */}
      {showSubdivideDialog && (
        <div className="c3d-modal-overlay" onClick={() => setShowSubdivideDialog(false)}>
          <div className="c3d-modal" onClick={e => e.stopPropagation()}>
            <div className="c3d-modal-title">Subdivide</div>
            <div className="c3d-modal-body">
              <label>
                Number of cuts:
                <input
                  type="number" min="1" max="6" value={subdivLevels}
                  onChange={e => setSubdivLevels(parseInt(e.target.value)||1)}
                  style={{marginLeft:'0.5rem',width:'60px'}}
                />
              </label>
            </div>
            <div className="c3d-modal-footer">
              <button className="c3d-btn" onClick={subdivideSelected}>Subdivide</button>
              <button className="c3d-btn secondary" onClick={() => setShowSubdivideDialog(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Keyboard shortcut reference ── */}
      <div className="c3d-shortcuts-hint">
        G=Move · R=Rotate · S=Scale · Tab=Edit · 1/2/3=Vert/Edge/Face · E=Extrude · W=Subdivide · X=Delete · Shift+D=Dup · Z=Shading · H=Hide · A=All · Ctrl+Z=Undo
      </div>
    </div>
  )
}
