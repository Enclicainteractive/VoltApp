/**
 * VoltVerseCreator.jsx  –  Full VoltVerse World & Avatar Editor
 *
 * Features:
 *  • 40+ material presets (PBR, glass, emissive, toon, hologram, neon, etc.)
 *  • Custom 3D model import (GLB/GLTF/OBJ/FBX) – embedded in .voltroom
 *  • Custom texture import (PNG/JPG/WEBP) – embedded as base64 in .voltroom
 *  • Environment editor: skybox, fog, lighting, floor
 *  • Chunked .voltroom file sharing – compressed, split into 48KB chunks,
 *    broadcast to all peers, reassembled on receive
 *  • Undo/redo, snap-to-grid, transform gizmos
 *  • Collaborative editing via SDK
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, TransformControls, Text } from '@react-three/drei'
import { MOUSE } from 'three'
import * as THREE from 'three'
import LZString from 'lz-string'
import useVoltVerseCreatorStore from './store'
import ModelAsset from '../voltverse/components/ModelAsset'
import {
  embedModel, embedTexture, embedAudio,
  saveRoomToFile, loadRoomFromFile,
  broadcastRoomChunked, receiveRoomChunked,
  calculateRoomFileSize, LOADING_PHASES
} from '../voltverse/utils/roomFile'
import { DEFAULT_SKYBOXES } from '../voltverse/utils/shaders'
import './styles.css'

// ─── 40+ Material presets ─────────────────────────────────────────────────────
export const MATERIAL_PRESETS = [
  // PBR Standard
  { id: 'standard',       label: 'Standard',        group: 'PBR' },
  { id: 'matte',          label: 'Matte',            group: 'PBR' },
  { id: 'chrome',         label: 'Chrome',           group: 'PBR' },
  { id: 'brushed-metal',  label: 'Brushed Metal',    group: 'PBR' },
  { id: 'gold',           label: 'Gold',             group: 'PBR' },
  { id: 'copper',         label: 'Copper',           group: 'PBR' },
  { id: 'iron',           label: 'Iron',             group: 'PBR' },
  { id: 'rust',           label: 'Rust',             group: 'PBR' },
  // Transparent / Glass
  { id: 'glass',          label: 'Glass',            group: 'Glass' },
  { id: 'frosted-glass',  label: 'Frosted Glass',    group: 'Glass' },
  { id: 'tinted-glass',   label: 'Tinted Glass',     group: 'Glass' },
  { id: 'crystal',        label: 'Crystal',          group: 'Glass' },
  // Emissive / Glow
  { id: 'emissive',       label: 'Emissive',         group: 'Glow' },
  { id: 'neon',           label: 'Neon',             group: 'Glow' },
  { id: 'lava',           label: 'Lava',             group: 'Glow' },
  { id: 'plasma',         label: 'Plasma',           group: 'Glow' },
  { id: 'fire',           label: 'Fire',             group: 'Glow' },
  // Stylized
  { id: 'toon',           label: 'Toon',             group: 'Stylized' },
  { id: 'cel',            label: 'Cel Shaded',       group: 'Stylized' },
  { id: 'flat',           label: 'Flat',             group: 'Stylized' },
  { id: 'wireframe',      label: 'Wireframe',        group: 'Stylized' },
  { id: 'hologram',       label: 'Hologram',         group: 'Stylized' },
  // Natural
  { id: 'stone',          label: 'Stone',            group: 'Natural' },
  { id: 'wood',           label: 'Wood',             group: 'Natural' },
  { id: 'concrete',       label: 'Concrete',         group: 'Natural' },
  { id: 'dirt',           label: 'Dirt',             group: 'Natural' },
  { id: 'sand',           label: 'Sand',             group: 'Natural' },
  { id: 'grass',          label: 'Grass',            group: 'Natural' },
  { id: 'snow',           label: 'Snow',             group: 'Natural' },
  { id: 'ice',            label: 'Ice',              group: 'Natural' },
  { id: 'water',          label: 'Water',            group: 'Natural' },
  // Sci-Fi
  { id: 'energy',         label: 'Energy',           group: 'Sci-Fi' },
  { id: 'circuit',        label: 'Circuit',          group: 'Sci-Fi' },
  { id: 'forcefield',     label: 'Force Field',      group: 'Sci-Fi' },
  { id: 'dark-matter',    label: 'Dark Matter',      group: 'Sci-Fi' },
  { id: 'portal-mat',     label: 'Portal',           group: 'Sci-Fi' },
  // Fabric
  { id: 'fabric',         label: 'Fabric',           group: 'Fabric' },
  { id: 'leather',        label: 'Leather',          group: 'Fabric' },
  { id: 'velvet',         label: 'Velvet',           group: 'Fabric' },
  // Special
  { id: 'mirror',         label: 'Mirror',           group: 'Special' },
  { id: 'invisible',      label: 'Invisible',        group: 'Special' },
  { id: 'xray',           label: 'X-Ray',            group: 'Special' },
]

const MATERIAL_GROUPS = [...new Set(MATERIAL_PRESETS.map(m => m.group))]

const BUILTIN_SHADERS = ['none', 'hologram', 'neon', 'water', 'fire', 'ice', 'plasma', 'toon', 'wireframe']

const SKYBOXES = Object.keys(DEFAULT_SKYBOXES)

const PRIMITIVES = [
  { type: 'cube',        label: 'Cube' },
  { type: 'sphere',      label: 'Sphere' },
  { type: 'cylinder',    label: 'Cylinder' },
  { type: 'cone',        label: 'Cone' },
  { type: 'torus',       label: 'Torus' },
  { type: 'plane',       label: 'Plane' },
  { type: 'capsule',     label: 'Capsule' },
  { type: 'icosahedron', label: 'Crystal' },
]

const MODEL_FILE_PATTERN = /\.(glb|gltf|obj|fbx)$/i
const TEXTURE_FILE_PATTERN = /\.(png|jpg|jpeg|webp|bmp|tga)$/i
const AUDIO_FILE_PATTERN = /\.(mp3|ogg|wav|m4a)$/i

const isEditableTarget = (t) => {
  const tag = t?.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || t?.isContentEditable
}

const findSelectedEntity = (worldData, id) => {
  if (!id) return null
  const obj = worldData.objects.find(e => e.id === id)
  if (obj) return { kind: 'object', data: obj }
  const sp = worldData.spawnPoints.find(e => e.id === id)
  if (sp) return { kind: 'spawn', data: sp }
  const po = worldData.portals.find(e => e.id === id)
  if (po) return { kind: 'portal', data: po }
  const tr = worldData.triggers.find(e => e.id === id)
  if (tr) return { kind: 'trigger', data: tr }
  return null
}

// ─── Material renderer (for 3D preview) ──────────────────────────────────────
function PreviewMaterial({ preset, color, roughness, metalness, opacity, emissive, emissiveIntensity, textureData }) {
  const col = color || '#6366f1'
  const r = roughness ?? 0.5
  const m = metalness ?? 0.1
  const em = emissive || '#000000'
  const ei = emissiveIntensity ?? 0

  const tex = useMemo(() => {
    if (!textureData) return null
    const t = new THREE.TextureLoader().load(textureData)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    return t
  }, [textureData])

  switch (preset) {
    case 'chrome':        return <meshStandardMaterial color={col} roughness={0.05} metalness={1} map={tex} />
    case 'brushed-metal': return <meshStandardMaterial color={col} roughness={0.35} metalness={0.9} map={tex} />
    case 'gold':          return <meshStandardMaterial color="#ffd700" roughness={0.15} metalness={1} />
    case 'copper':        return <meshStandardMaterial color="#b87333" roughness={0.25} metalness={0.9} />
    case 'iron':          return <meshStandardMaterial color="#8a8a8a" roughness={0.6} metalness={0.8} />
    case 'rust':          return <meshStandardMaterial color="#8b3a2a" roughness={0.9} metalness={0.3} />
    case 'matte':         return <meshStandardMaterial color={col} roughness={0.95} metalness={0} map={tex} />
    case 'glass':         return <meshPhysicalMaterial color={col} roughness={0} metalness={0} transmission={0.95} transparent opacity={0.2} />
    case 'frosted-glass': return <meshPhysicalMaterial color={col} roughness={0.4} metalness={0} transmission={0.7} transparent opacity={0.5} />
    case 'tinted-glass':  return <meshPhysicalMaterial color={col} roughness={0.05} metalness={0} transmission={0.8} transparent opacity={0.4} />
    case 'crystal':       return <meshPhysicalMaterial color={col} roughness={0} metalness={0.1} transmission={0.9} transparent opacity={0.3} />
    case 'emissive':      return <meshStandardMaterial color={col} emissive={col} emissiveIntensity={1.2} roughness={0.3} metalness={0} />
    case 'neon':          return <meshStandardMaterial color={col} emissive={col} emissiveIntensity={2.5} roughness={0.1} metalness={0} />
    case 'lava':          return <meshStandardMaterial color="#ff4500" emissive="#ff2200" emissiveIntensity={1.5} roughness={0.8} metalness={0} />
    case 'plasma':        return <meshStandardMaterial color="#a855f7" emissive="#7c3aed" emissiveIntensity={2} roughness={0.1} metalness={0} />
    case 'fire':          return <meshStandardMaterial color="#ff6b00" emissive="#ff3300" emissiveIntensity={1.8} roughness={0.5} metalness={0} />
    case 'toon':          return <meshToonMaterial color={col} />
    case 'cel':           return <meshToonMaterial color={col} />
    case 'flat':          return <meshBasicMaterial color={col} map={tex} />
    case 'wireframe':     return <meshBasicMaterial color={col} wireframe />
    case 'hologram':      return <meshStandardMaterial color={col} emissive={col} emissiveIntensity={0.8} transparent opacity={0.7} roughness={0.1} metalness={0.5} />
    case 'stone':         return <meshStandardMaterial color={col || '#7a7a7a'} roughness={0.9} metalness={0} map={tex} />
    case 'wood':          return <meshStandardMaterial color={col || '#8b5e3c'} roughness={0.8} metalness={0} map={tex} />
    case 'concrete':      return <meshStandardMaterial color={col || '#9ca3af'} roughness={0.95} metalness={0} map={tex} />
    case 'dirt':          return <meshStandardMaterial color={col || '#8b6914'} roughness={1} metalness={0} map={tex} />
    case 'sand':          return <meshStandardMaterial color={col || '#d4b483'} roughness={0.95} metalness={0} map={tex} />
    case 'grass':         return <meshStandardMaterial color={col || '#4a7c59'} roughness={0.9} metalness={0} map={tex} />
    case 'snow':          return <meshStandardMaterial color="#f0f4ff" roughness={0.7} metalness={0} />
    case 'ice':           return <meshPhysicalMaterial color="#a8d8f0" roughness={0.05} metalness={0.1} transmission={0.6} transparent opacity={0.8} />
    case 'water':         return <meshPhysicalMaterial color="#3b82f6" roughness={0.1} metalness={0} transmission={0.8} transparent opacity={0.7} />
    case 'energy':        return <meshStandardMaterial color={col} emissive={col} emissiveIntensity={3} transparent opacity={0.8} roughness={0} metalness={0.8} />
    case 'circuit':       return <meshStandardMaterial color={col || '#1a3a1a'} emissive={col || '#00ff00'} emissiveIntensity={0.3} roughness={0.4} metalness={0.6} />
    case 'forcefield':    return <meshStandardMaterial color={col} emissive={col} emissiveIntensity={1} transparent opacity={0.4} roughness={0} metalness={0} />
    case 'dark-matter':   return <meshStandardMaterial color="#0a0a0a" emissive="#4a0080" emissiveIntensity={0.5} transparent opacity={0.9} roughness={0.1} metalness={0.9} />
    case 'portal-mat':    return <meshStandardMaterial color={col} emissive={col} emissiveIntensity={2} transparent opacity={0.85} roughness={0} metalness={0.3} />
    case 'fabric':        return <meshStandardMaterial color={col} roughness={0.95} metalness={0} map={tex} />
    case 'leather':       return <meshStandardMaterial color={col || '#5c3317'} roughness={0.7} metalness={0.05} map={tex} />
    case 'velvet':        return <meshStandardMaterial color={col} roughness={1} metalness={0} />
    case 'mirror':        return <meshStandardMaterial color="#ffffff" roughness={0} metalness={1} />
    case 'invisible':     return <meshBasicMaterial transparent opacity={0} />
    case 'xray':          return <meshStandardMaterial color={col} emissive={col} emissiveIntensity={0.5} transparent opacity={0.3} wireframe />
    default:              return <meshStandardMaterial color={col} roughness={r} metalness={m} emissive={em} emissiveIntensity={ei} map={tex} />
  }
}

// ─── Primitive geometry ───────────────────────────────────────────────────────
function PrimitiveGeometry({ type }) {
  switch (type) {
    case 'sphere':      return <sphereGeometry args={[0.5, 32, 32]} />
    case 'cylinder':    return <cylinderGeometry args={[0.5, 0.5, 1, 32]} />
    case 'cone':        return <coneGeometry args={[0.5, 1, 32]} />
    case 'torus':       return <torusGeometry args={[0.4, 0.18, 16, 48]} />
    case 'plane':       return <planeGeometry args={[1, 1]} />
    case 'capsule':     return <capsuleGeometry args={[0.3, 0.6, 8, 16]} />
    case 'icosahedron': return <icosahedronGeometry args={[0.55, 1]} />
    default:            return <boxGeometry args={[1, 1, 1]} />
  }
}

// ─── Scene object ─────────────────────────────────────────────────────────────
const SceneObject = React.memo(({ data, assets, isSelected, onSelect }) => {
  const modelAsset = assets?.models?.find(a => a.id === (data.assetRef || data.model?.assetRef))
  const modelSrc = modelAsset?.src || modelAsset?.data || data.modelUrl || null
  const mat = data.material || {}
  const texAsset = assets?.textures?.find(t => t.id === mat.textureId)
  const texData = texAsset?.data || mat.textureData || null

  return (
    <group position={data.position} rotation={data.rotation} scale={data.scale}>
      <group onClick={e => { e.stopPropagation(); onSelect() }} castShadow receiveShadow>
        {data.type === 'model' && modelSrc ? (
          <ModelAsset asset={modelAsset || { src: modelSrc, format: data.modelFormat }} src={modelSrc} />
        ) : (
          <mesh castShadow receiveShadow>
            <PrimitiveGeometry type={data.type} />
            <PreviewMaterial
              preset={mat.preset}
              color={mat.color}
              roughness={mat.roughness}
              metalness={mat.metalness}
              opacity={mat.opacity}
              emissive={mat.emissive}
              emissiveIntensity={mat.emissiveIntensity}
              textureData={texData}
            />
          </mesh>
        )}
      </group>
      {isSelected && (
        <mesh>
          <boxGeometry args={[
            (isFinite(data.scale?.[0]) ? data.scale[0] : 1) + 0.12,
            (isFinite(data.scale?.[1]) ? data.scale[1] : 1) + 0.12,
            (isFinite(data.scale?.[2]) ? data.scale[2] : 1) + 0.12
          ]} />
          <meshBasicMaterial color="#6366f1" wireframe transparent opacity={0.8} />
        </mesh>
      )}
    </group>
  )
})

const Marker = ({ data, color, isSelected, onSelect }) => (
  <group
    position={data.position}
    rotation={data.rotation || [0, 0, 0]}
    scale={data.scale || [1, 1, 1]}
    onClick={e => { e.stopPropagation(); onSelect() }}
  >
    <mesh>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial color={color} wireframe transparent opacity={isSelected ? 0.85 : 0.45} />
    </mesh>
    <Text position={[0, 0.9, 0]} fontSize={0.18} color="#ffffff">{data.name || data.id}</Text>
  </group>
)

// ─── Transform gizmo ─────────────────────────────────────────────────────────
const SceneTransformGizmo = ({ selectedEntity, isPlaying, activeTool, transformMode, snapToGrid, gridSize, orbitRef }) => {
  const groupRef = useRef(null)
  const transformRef = useRef(null)
  const draggingRef = useRef(false)

  useEffect(() => {
    const controls = transformRef.current
    const orbit = orbitRef.current
    if (!controls || !orbit) return
    const onDrag = e => { orbit.enabled = !e.value }
    controls.addEventListener('dragging-changed', onDrag)
    return () => controls.removeEventListener('dragging-changed', onDrag)
  }, [orbitRef])

  useEffect(() => {
    if (!groupRef.current || !selectedEntity?.data) return
    groupRef.current.position.set(...(selectedEntity.data.position || [0, 0, 0]))
    groupRef.current.rotation.set(...(selectedEntity.data.rotation || [0, 0, 0]))
    groupRef.current.scale.set(...(selectedEntity.data.scale || [1, 1, 1]))
  }, [selectedEntity])

  useEffect(() => {
    const controls = transformRef.current
    if (!controls) return
    const onObjectChange = () => {
      if (!groupRef.current || !selectedEntity?.data) return
      useVoltVerseCreatorStore.getState().setEntityTransformLive(selectedEntity.kind, selectedEntity.data.id, {
        position: groupRef.current.position.toArray(),
        rotation: [groupRef.current.rotation.x, groupRef.current.rotation.y, groupRef.current.rotation.z],
        scale: groupRef.current.scale.toArray()
      })
    }
    const onDragChange = e => {
      if (e.value && !draggingRef.current) useVoltVerseCreatorStore.getState().pushUndo()
      draggingRef.current = e.value
    }
    controls.addEventListener('objectChange', onObjectChange)
    controls.addEventListener('dragging-changed', onDragChange)
    return () => {
      controls.removeEventListener('objectChange', onObjectChange)
      controls.removeEventListener('dragging-changed', onDragChange)
    }
  }, [selectedEntity])

  if (!selectedEntity || isPlaying || activeTool === 'select') return null
  return (
    <TransformControls ref={transformRef} mode={transformMode}>
      <group ref={groupRef} />
    </TransformControls>
  )
}

// ─── Creator scene ────────────────────────────────────────────────────────────
const CreatorScene = ({ worldData, selectedEntity, isPlaying, showGrid, gridSize, snapToGrid, tools, onSelect }) => {
  const orbitRef = useRef(null)
  const env = worldData.environment
  const floorSize = env.floor?.size?.[0] || 100

  return (
    <>
      <color attach="background" args={[env.skybox?.tint || '#0f172a']} />
      {env.fog?.enabled !== false && (
        <fog attach="fog" args={[env.fog?.color || '#1a1a2e', env.fog?.near || 10, env.fog?.far || 100]} />
      )}
      <ambientLight color={env.ambientLight?.color || '#404060'} intensity={env.ambientLight?.intensity ?? 0.4} />
      <directionalLight
        color={env.directionalLight?.color || '#ffd4a3'}
        intensity={env.directionalLight?.intensity ?? 1}
        position={env.directionalLight?.position || [10, 20, 10]}
        castShadow={false}
      />
      <mesh>
        <sphereGeometry args={[500, 16, 16]} />
        <meshBasicMaterial color={env.skybox?.tint || '#0a0a15'} side={THREE.BackSide} />
      </mesh>
      {showGrid && env.floor?.grid !== false && (
        <gridHelper args={[floorSize, Math.max(10, Math.floor(floorSize / Math.max(gridSize, 1))), env.floor?.gridColor || '#4a4a6a', '#2a2a4a']} position={[0, 0.01, 0]} />
      )}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[floorSize, floorSize]} />
        <meshStandardMaterial color={env.floor?.color || '#2d2d44'} roughness={0.8} metalness={0.1} />
      </mesh>
      {worldData.objects.map(obj => (
        <SceneObject
          key={obj.id}
          data={obj}
          assets={worldData.assets}
          isSelected={selectedEntity?.data?.id === obj.id}
          onSelect={() => onSelect(obj.id)}
        />
      ))}
      {worldData.spawnPoints.map(sp => (
        <Marker key={sp.id} data={sp} color="#10b981" isSelected={selectedEntity?.data?.id === sp.id} onSelect={() => onSelect(sp.id)} />
      ))}
      {worldData.portals.map(po => (
        <Marker key={po.id} data={po} color={po.color || '#22d3ee'} isSelected={selectedEntity?.data?.id === po.id} onSelect={() => onSelect(po.id)} />
      ))}
      {worldData.triggers.map(tr => (
        <Marker key={tr.id} data={tr} color="#f59e0b" isSelected={selectedEntity?.data?.id === tr.id} onSelect={() => onSelect(tr.id)} />
      ))}
      <SceneTransformGizmo
        selectedEntity={selectedEntity}
        isPlaying={isPlaying}
        activeTool={tools.active}
        transformMode={tools.transformMode}
        snapToGrid={snapToGrid}
        gridSize={gridSize}
        orbitRef={orbitRef}
      />
      <OrbitControls ref={orbitRef} makeDefault enableDamping={false} mouseButtons={{ LEFT: MOUSE.PAN, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.ROTATE }} />
    </>
  )
}

// ─── Panels ───────────────────────────────────────────────────────────────────
const S = {
  panel: { display: 'flex', flexDirection: 'column', gap: 0, height: '100%', overflowY: 'auto', color: '#f9fafb', fontSize: 13 },
  section: { padding: '10px 12px', borderBottom: '1px solid #1f2937' },
  sectionTitle: { fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  row: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 },
  label: { fontSize: 11, color: '#9ca3af', width: 80, flexShrink: 0 },
  input: { flex: 1, background: '#1f2937', border: '1px solid #374151', borderRadius: 4, color: '#f9fafb', padding: '3px 6px', fontSize: 12 },
  select: { flex: 1, background: '#1f2937', border: '1px solid #374151', borderRadius: 4, color: '#f9fafb', padding: '3px 6px', fontSize: 12 },
  btn: { padding: '4px 10px', background: '#1f2937', border: '1px solid #374151', borderRadius: 4, color: '#e5e7eb', fontSize: 11, cursor: 'pointer' },
  btnPrimary: { padding: '4px 10px', background: '#4f46e5', border: 'none', borderRadius: 4, color: '#fff', fontSize: 11, cursor: 'pointer' },
  btnDanger: { padding: '4px 10px', background: '#7f1d1d', border: 'none', borderRadius: 4, color: '#fff', fontSize: 11, cursor: 'pointer' },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 },
  grid3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 },
  objectItem: (selected) => ({
    display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px',
    background: selected ? '#312e81' : 'transparent',
    border: `1px solid ${selected ? '#6366f1' : 'transparent'}`,
    borderRadius: 4, cursor: 'pointer', marginBottom: 2
  }),
  swatch: (color) => ({ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }),
  assetThumb: { width: 40, height: 40, objectFit: 'cover', borderRadius: 4, border: '1px solid #374151' },
}

const VectorInput = ({ label, value, onChange, step = 0.1 }) => (
  <div style={S.row}>
    <span style={S.label}>{label}</span>
    {['X', 'Y', 'Z'].map((axis, i) => (
      <div key={axis} style={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
        <span style={{ fontSize: 10, color: '#6b7280', width: 10 }}>{axis}</span>
        <input
          type="number"
          step={step}
          value={(value?.[i] ?? 0).toFixed(3)}
          onChange={e => { const n = [...(value || [0, 0, 0])]; n[i] = parseFloat(e.target.value) || 0; onChange(n) }}
          style={{ ...S.input, width: 0 }}
        />
      </div>
    ))}
  </div>
)

// Objects panel
const ObjectsPanel = ({ worldData, selectedId, onSelect, onAddObject, onAddSpawnPoint, onAddPortal, onAddTrigger }) => {
  const allItems = [
    ...worldData.objects.map(o => ({ ...o, _kind: 'object', _color: o.material?.color || '#6366f1' })),
    ...worldData.spawnPoints.map(s => ({ ...s, _kind: 'spawn', _color: '#10b981' })),
    ...worldData.portals.map(p => ({ ...p, _kind: 'portal', _color: p.color || '#22d3ee' })),
    ...worldData.triggers.map(t => ({ ...t, _kind: 'trigger', _color: '#f59e0b' })),
  ]

  return (
    <div style={S.panel}>
      <div style={S.section}>
        <div style={S.sectionTitle}>Primitives</div>
        <div style={S.grid2}>
          {PRIMITIVES.map(({ type, label }) => (
            <button key={type} style={S.btn} onClick={() => onAddObject({ type, name: label })}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {worldData.assets?.models?.length > 0 && (
        <div style={S.section}>
          <div style={S.sectionTitle}>Imported Models ({worldData.assets.models.length})</div>
          {worldData.assets.models.map(model => (
            <button
              key={model.id}
              style={{ ...S.btn, width: '100%', textAlign: 'left', marginBottom: 3 }}
              onClick={() => onAddObject({ type: 'model', name: model.name.replace(/\.[^.]+$/, ''), assetRef: model.id, model: { assetRef: model.id } })}
            >
              📦 {model.name}
            </button>
          ))}
        </div>
      )}
      <div style={S.section}>
        <div style={S.sectionTitle}>World Elements</div>
        <div style={S.grid3}>
          <button style={S.btn} onClick={() => onAddSpawnPoint({})}>📍 Spawn</button>
          <button style={S.btn} onClick={() => onAddPortal({})}>🌀 Portal</button>
          <button style={S.btn} onClick={() => onAddTrigger({ actions: [{ type: 'message', message: 'Triggered' }] })}>⚡ Trigger</button>
        </div>
      </div>
      <div style={S.section}>
        <div style={S.sectionTitle}>Scene ({allItems.length})</div>
        {allItems.map(item => (
          <div key={item.id} style={S.objectItem(item.id === selectedId)} onClick={() => onSelect(item.id)}>
            <div style={S.swatch(item._color)} />
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.name || item.type || item.id}
            </span>
            <span style={{ fontSize: 10, color: '#6b7280' }}>{item._kind}</span>
          </div>
        ))}
        {allItems.length === 0 && <div style={{ color: '#4b5563', fontSize: 12, padding: '8px 0' }}>No objects yet. Add some above.</div>}
      </div>
    </div>
  )
}

// Assets panel
const AssetsPanel = ({ worldData, onAddModelAsset, onAddTextureAsset, onRemoveAsset }) => {
  const modelInputRef = useRef(null)
  const textureInputRef = useRef(null)

  return (
    <div style={S.panel}>
      <div style={S.section}>
        <div style={S.sectionTitle}>3D Models</div>
        <button style={S.btnPrimary} onClick={() => modelInputRef.current?.click()}>
          + Import Model (GLB/GLTF/OBJ/FBX)
        </button>
        <input ref={modelInputRef} type="file" accept=".glb,.gltf,.obj,.fbx" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) onAddModelAsset(f); e.target.value = '' }} />
        <div style={{ marginTop: 8 }}>
          {(worldData.assets?.models || []).map(m => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', borderBottom: '1px solid #1f2937' }}>
              <span style={{ fontSize: 18 }}>📦</span>
              <span style={{ flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
              <span style={{ fontSize: 10, color: '#6b7280' }}>{m.size ? `${(m.size / 1024).toFixed(0)}KB` : ''}</span>
              <button style={S.btnDanger} onClick={() => onRemoveAsset('model', m.id)}>✕</button>
            </div>
          ))}
          {!(worldData.assets?.models?.length) && <div style={{ color: '#4b5563', fontSize: 12, paddingTop: 6 }}>No models imported.</div>}
        </div>
      </div>
      <div style={S.section}>
        <div style={S.sectionTitle}>Textures</div>
        <button style={S.btnPrimary} onClick={() => textureInputRef.current?.click()}>
          + Import Texture (PNG/JPG/WEBP)
        </button>
        <input ref={textureInputRef} type="file" accept=".png,.jpg,.jpeg,.webp,.bmp" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) onAddTextureAsset(f); e.target.value = '' }} />
        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {(worldData.assets?.textures || []).map(t => (
            <div key={t.id} style={{ position: 'relative' }}>
              <img src={t.data} alt={t.name} style={S.assetThumb} title={t.name} />
              <button
                onClick={() => onRemoveAsset('texture', t.id)}
                style={{ position: 'absolute', top: -4, right: -4, width: 16, height: 16, background: '#7f1d1d', border: 'none', borderRadius: '50%', color: '#fff', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >✕</button>
            </div>
          ))}
          {!(worldData.assets?.textures?.length) && <div style={{ color: '#4b5563', fontSize: 12 }}>No textures imported.</div>}
        </div>
      </div>
    </div>
  )
}

// Environment panel
const EnvironmentPanel = ({ environment, showGrid, onUpdateEnvironment }) => (
  <div style={S.panel}>
    <div style={S.section}>
      <div style={S.sectionTitle}>Skybox</div>
      <div style={S.row}>
        <span style={S.label}>Preset</span>
        <select style={S.select} value={environment.skybox?.preset || 'sunset-gradient'}
          onChange={e => onUpdateEnvironment({ skybox: { ...environment.skybox, preset: e.target.value } })}>
          {SKYBOXES.map(id => <option key={id} value={id}>{id}</option>)}
        </select>
      </div>
      <div style={S.row}>
        <span style={S.label}>Tint</span>
        <input type="color" value={environment.skybox?.tint || '#ffffff'}
          onChange={e => onUpdateEnvironment({ skybox: { ...environment.skybox, tint: e.target.value } })} />
      </div>
    </div>
    <div style={S.section}>
      <div style={S.sectionTitle}>Fog</div>
      <div style={S.row}>
        <span style={S.label}>Enabled</span>
        <input type="checkbox" checked={environment.fog?.enabled !== false}
          onChange={e => onUpdateEnvironment({ fog: { ...environment.fog, enabled: e.target.checked } })} />
      </div>
      <div style={S.row}>
        <span style={S.label}>Color</span>
        <input type="color" value={environment.fog?.color || '#1a1a2e'}
          onChange={e => onUpdateEnvironment({ fog: { ...environment.fog, color: e.target.value } })} />
      </div>
      <div style={S.row}>
        <span style={S.label}>Near {environment.fog?.near || 10}</span>
        <input type="range" min="0" max="200" value={environment.fog?.near || 10}
          onChange={e => onUpdateEnvironment({ fog: { ...environment.fog, near: +e.target.value } })} style={{ flex: 1 }} />
      </div>
      <div style={S.row}>
        <span style={S.label}>Far {environment.fog?.far || 100}</span>
        <input type="range" min="10" max="1000" value={environment.fog?.far || 100}
          onChange={e => onUpdateEnvironment({ fog: { ...environment.fog, far: +e.target.value } })} style={{ flex: 1 }} />
      </div>
    </div>
    <div style={S.section}>
      <div style={S.sectionTitle}>Ambient Light</div>
      <div style={S.row}>
        <span style={S.label}>Color</span>
        <input type="color" value={environment.ambientLight?.color || '#404060'}
          onChange={e => onUpdateEnvironment({ ambientLight: { ...environment.ambientLight, color: e.target.value } })} />
      </div>
      <div style={S.row}>
        <span style={S.label}>Intensity {(environment.ambientLight?.intensity ?? 0.4).toFixed(2)}</span>
        <input type="range" min="0" max="3" step="0.05" value={environment.ambientLight?.intensity ?? 0.4}
          onChange={e => onUpdateEnvironment({ ambientLight: { ...environment.ambientLight, intensity: +e.target.value } })} style={{ flex: 1 }} />
      </div>
    </div>
    <div style={S.section}>
      <div style={S.sectionTitle}>Directional Light</div>
      <div style={S.row}>
        <span style={S.label}>Color</span>
        <input type="color" value={environment.directionalLight?.color || '#ffd4a3'}
          onChange={e => onUpdateEnvironment({ directionalLight: { ...environment.directionalLight, color: e.target.value } })} />
      </div>
      <div style={S.row}>
        <span style={S.label}>Intensity {(environment.directionalLight?.intensity ?? 1).toFixed(2)}</span>
        <input type="range" min="0" max="5" step="0.05" value={environment.directionalLight?.intensity ?? 1}
          onChange={e => onUpdateEnvironment({ directionalLight: { ...environment.directionalLight, intensity: +e.target.value } })} style={{ flex: 1 }} />
      </div>
    </div>
    <div style={S.section}>
      <div style={S.sectionTitle}>Floor</div>
      <div style={S.row}>
        <span style={S.label}>Color</span>
        <input type="color" value={environment.floor?.color || '#2d2d44'}
          onChange={e => onUpdateEnvironment({ floor: { ...environment.floor, color: e.target.value } })} />
      </div>
      <div style={S.row}>
        <span style={S.label}>Size {environment.floor?.size?.[0] || 100}</span>
        <input type="range" min="20" max="1000" step="10" value={environment.floor?.size?.[0] || 100}
          onChange={e => onUpdateEnvironment({ floor: { ...environment.floor, size: [+e.target.value, +e.target.value] } })} style={{ flex: 1 }} />
      </div>
      <div style={S.row}>
        <span style={S.label}>Grid</span>
        <input type="checkbox" checked={environment.floor?.grid !== false}
          onChange={e => onUpdateEnvironment({ floor: { ...environment.floor, grid: e.target.checked } })} />
        <span style={S.label}>Grid Color</span>
        <input type="color" value={environment.floor?.gridColor || '#4a4a6a'}
          onChange={e => onUpdateEnvironment({ floor: { ...environment.floor, gridColor: e.target.value } })} />
      </div>
    </div>
  </div>
)

// Properties panel
const PropertiesPanel = ({ entity, worldData, onUpdateObject, onUpdateSpawn, onUpdatePortal, onUpdateTrigger, onRemoveEntity }) => {
  const [matGroup, setMatGroup] = useState('PBR')

  if (!entity) {
    return (
      <div style={S.panel}>
        <div style={S.section}>
          <div style={S.sectionTitle}>Properties</div>
          <div style={{ color: '#4b5563', fontSize: 12 }}>Select an object to edit its properties.</div>
        </div>
      </div>
    )
  }

  const obj = entity.data
  const update = (updates) => {
    if (entity.kind === 'object') onUpdateObject(obj.id, updates)
    else if (entity.kind === 'spawn') onUpdateSpawn(obj.id, updates)
    else if (entity.kind === 'portal') onUpdatePortal(obj.id, updates)
    else if (entity.kind === 'trigger') onUpdateTrigger(obj.id, updates)
  }

  const textures = worldData.assets?.textures || []

  return (
    <div style={S.panel}>
      <div style={S.section}>
        <div style={S.sectionTitle}>{entity.kind.toUpperCase()}: {obj.name || obj.type || obj.id}</div>
        <div style={S.row}>
          <span style={S.label}>Name</span>
          <input style={S.input} value={obj.name || ''} onChange={e => update({ name: e.target.value })} />
        </div>
      </div>
      <div style={S.section}>
        <VectorInput label="Position" value={obj.position} onChange={pos => update({ position: pos })} />
        {entity.kind !== 'trigger' && <VectorInput label="Rotation" value={obj.rotation} onChange={rot => update({ rotation: rot })} step={0.01} />}
        {entity.kind !== 'spawn' && <VectorInput label="Scale" value={obj.scale} onChange={sc => update({ scale: sc })} />}
      </div>
      {entity.kind === 'object' && (
        <div style={S.section}>
          <div style={S.sectionTitle}>Material</div>
          {/* Material group tabs */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 8 }}>
            {MATERIAL_GROUPS.map(g => (
              <button key={g} style={{ ...S.btn, background: matGroup === g ? '#4f46e5' : '#1f2937', color: matGroup === g ? '#fff' : '#9ca3af', padding: '2px 7px' }}
                onClick={() => setMatGroup(g)}>{g}</button>
            ))}
          </div>
          {/* Material preset grid */}
          <div style={S.grid2}>
            {MATERIAL_PRESETS.filter(m => m.group === matGroup).map(m => (
              <button key={m.id}
                style={{ ...S.btn, background: obj.material?.preset === m.id ? '#312e81' : '#1f2937', border: `1px solid ${obj.material?.preset === m.id ? '#6366f1' : '#374151'}`, fontSize: 11 }}
                onClick={() => update({ material: { ...obj.material, preset: m.id } })}
              >{m.label}</button>
            ))}
          </div>
          <div style={{ height: 8 }} />
          <div style={S.row}>
            <span style={S.label}>Color</span>
            <input type="color" value={obj.material?.color || '#6366f1'}
              onChange={e => update({ material: { ...obj.material, color: e.target.value } })} />
          </div>
          <div style={S.row}>
            <span style={S.label}>Emissive</span>
            <input type="color" value={obj.material?.emissive || '#000000'}
              onChange={e => update({ material: { ...obj.material, emissive: e.target.value } })} />
            <input type="range" min="0" max="5" step="0.1" value={obj.material?.emissiveIntensity ?? 0}
              onChange={e => update({ material: { ...obj.material, emissiveIntensity: +e.target.value } })} style={{ flex: 1 }} />
          </div>
          <div style={S.row}>
            <span style={S.label}>Roughness {(obj.material?.roughness ?? 0.5).toFixed(2)}</span>
            <input type="range" min="0" max="1" step="0.01" value={obj.material?.roughness ?? 0.5}
              onChange={e => update({ material: { ...obj.material, roughness: +e.target.value } })} style={{ flex: 1 }} />
          </div>
          <div style={S.row}>
            <span style={S.label}>Metalness {(obj.material?.metalness ?? 0.1).toFixed(2)}</span>
            <input type="range" min="0" max="1" step="0.01" value={obj.material?.metalness ?? 0.1}
              onChange={e => update({ material: { ...obj.material, metalness: +e.target.value } })} style={{ flex: 1 }} />
          </div>
          <div style={S.row}>
            <span style={S.label}>Opacity {(obj.material?.opacity ?? 1).toFixed(2)}</span>
            <input type="range" min="0" max="1" step="0.01" value={obj.material?.opacity ?? 1}
              onChange={e => update({ material: { ...obj.material, opacity: +e.target.value, transparent: +e.target.value < 1 } })} style={{ flex: 1 }} />
          </div>
          <div style={S.row}>
            <span style={S.label}>Shader</span>
            <select style={S.select} value={obj.material?.shaderId || 'none'}
              onChange={e => update({ material: { ...obj.material, shaderId: e.target.value === 'none' ? null : e.target.value } })}>
              {BUILTIN_SHADERS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          {textures.length > 0 && (
            <div style={S.row}>
              <span style={S.label}>Texture</span>
              <select style={S.select} value={obj.material?.textureId || ''}
                onChange={e => update({ material: { ...obj.material, textureId: e.target.value || null } })}>
                <option value="">None</option>
                {textures.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}
          <div style={S.row}>
            <span style={S.label}>Wireframe</span>
            <input type="checkbox" checked={obj.material?.wireframe || false}
              onChange={e => update({ material: { ...obj.material, wireframe: e.target.checked } })} />
          </div>
        </div>
      )}
      {entity.kind === 'object' && (
        <div style={S.section}>
          <div style={S.sectionTitle}>Animation</div>
          <div style={S.row}>
            <span style={S.label}>Rotate</span>
            <input type="range" min="0" max="5" step="0.1" value={obj.animation?.rotate ?? 0}
              onChange={e => update({ animation: { ...obj.animation, rotate: +e.target.value } })} style={{ flex: 1 }} />
            <span style={{ fontSize: 10, color: '#6b7280', width: 24 }}>{(obj.animation?.rotate ?? 0).toFixed(1)}</span>
          </div>
          <div style={S.row}>
            <span style={S.label}>Float</span>
            <input type="range" min="0" max="2" step="0.05" value={obj.animation?.float ?? 0}
              onChange={e => update({ animation: { ...obj.animation, float: +e.target.value } })} style={{ flex: 1 }} />
            <span style={{ fontSize: 10, color: '#6b7280', width: 24 }}>{(obj.animation?.float ?? 0).toFixed(2)}</span>
          </div>
        </div>
      )}
      {entity.kind === 'object' && (
        <div style={S.section}>
          <div style={S.sectionTitle}>Point Light</div>
          <div style={S.row}>
            <span style={S.label}>Enabled</span>
            <input type="checkbox" checked={!!obj.light}
              onChange={e => update({ light: e.target.checked ? { color: '#ffffff', intensity: 1, distance: 10 } : null })} />
          </div>
          {obj.light && <>
            <div style={S.row}>
              <span style={S.label}>Color</span>
              <input type="color" value={obj.light.color || '#ffffff'}
                onChange={e => update({ light: { ...obj.light, color: e.target.value } })} />
            </div>
            <div style={S.row}>
              <span style={S.label}>Intensity {(obj.light.intensity ?? 1).toFixed(1)}</span>
              <input type="range" min="0" max="10" step="0.1" value={obj.light.intensity ?? 1}
                onChange={e => update({ light: { ...obj.light, intensity: +e.target.value } })} style={{ flex: 1 }} />
            </div>
            <div style={S.row}>
              <span style={S.label}>Distance {obj.light.distance ?? 10}</span>
              <input type="range" min="1" max="100" value={obj.light.distance ?? 10}
                onChange={e => update({ light: { ...obj.light, distance: +e.target.value } })} style={{ flex: 1 }} />
            </div>
          </>}
        </div>
      )}
      <div style={S.section}>
        <button style={S.btnDanger} onClick={() => onRemoveEntity(obj.id)}>🗑 Delete</button>
      </div>
    </div>
  )
}

// ─── Main VoltVerseCreator component ─────────────────────────────────────────
const VoltVerseCreator = ({ sdk, currentUser }) => {
  const [activeTab, setActiveTab] = useState('objects')
  const [collaborationEnabled, setCollaborationEnabled] = useState(false)
  const [collaborators, setCollaborators] = useState([])
  const [shareStatus, setShareStatus] = useState('')
  const [fileSize, setFileSize] = useState('')
  const importInputRef = useRef(null)
  const syncGuardRef = useRef(false)
  const worldDataRef = useRef(null)
  const collaboratorsRef = useRef([])

  const store = useVoltVerseCreatorStore()
  const {
    worldData, selectedObjectId, isPlaying, showGrid, snapToGrid, gridSize, tools,
    setSelectedObjectId, exportWorld, importWorld, clearWorld, setIsPlaying, setTools,
    undo, redo, removeEntity, updateObject, updateSpawnPoint, updatePortal, updateTrigger,
    updateEnvironment, addObject, addSpawnPoint, addPortal, addTrigger, addModelAsset,
  } = store

  const selectedEntity = useMemo(() => findSelectedEntity(worldData, selectedObjectId), [worldData, selectedObjectId])

  useEffect(() => { worldDataRef.current = worldData }, [worldData])
  useEffect(() => { collaboratorsRef.current = collaborators }, [collaborators])

  // Update file size display
  useEffect(() => {
    try { setFileSize(calculateRoomFileSize(worldData)) } catch {}
  }, [worldData])

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      if (isEditableTarget(e.target)) return
      const isMod = e.ctrlKey || e.metaKey
      const state = useVoltVerseCreatorStore.getState()
      if (e.code === 'Space') { e.preventDefault(); state.setIsPlaying(!state.isPlaying) }
      else if (isMod && e.code === 'KeyZ') { e.preventDefault(); e.shiftKey ? state.redo() : state.undo() }
      else if ((e.code === 'Delete' || e.code === 'Backspace') && state.selectedObjectId) { e.preventDefault(); state.removeEntity(state.selectedObjectId) }
      else if (e.code === 'Digit1') state.setTools({ active: 'select', transformMode: 'translate' })
      else if (e.code === 'Digit2') state.setTools({ active: 'move', transformMode: 'translate' })
      else if (e.code === 'Digit3') state.setTools({ active: 'rotate', transformMode: 'rotate' })
      else if (e.code === 'Digit4') state.setTools({ active: 'scale', transformMode: 'scale' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Collaboration sync
  useEffect(() => {
    if (!sdk?.on || !sdk?.emitEvent || !collaborationEnabled) return
    const localId = currentUser?.id || 'creator-local'

    sdk.emitEvent('voltverse-creator:join', { userId: localId, username: currentUser?.username || 'Creator' }, { serverRelay: true })
    sdk.emitEvent('voltverse-creator:sync-request', { userId: localId }, { serverRelay: true })

    const offEvent = sdk.on('event', (evt = {}) => {
      const { eventType, payload = {}, userId } = evt
      if (!eventType || userId === localId) return

      if (eventType === 'voltverse-creator:join') {
        setCollaborators(prev => [...prev.filter(c => c.id !== payload.userId), { id: payload.userId, username: payload.username || 'Creator' }])
      } else if (eventType === 'voltverse-creator:leave') {
        setCollaborators(prev => prev.filter(c => c.id !== payload.userId))
      } else if (eventType === 'voltverse-creator:sync-request') {
        const snap = LZString.compressToEncodedURIComponent(JSON.stringify({
          worldData: worldDataRef.current,
          collaborators: collaboratorsRef.current
        }))
        sdk.emitEvent('voltverse-creator:sync-response', { targetUserId: payload.userId, snapshot: snap }, { serverRelay: true })
      } else if (eventType === 'voltverse-creator:sync-response') {
        if (payload.targetUserId && payload.targetUserId !== localId) return
        try {
          const decoded = JSON.parse(LZString.decompressFromEncodedURIComponent(payload.snapshot || ''))
          if (Array.isArray(decoded?.collaborators)) {
            setCollaborators(decoded.collaborators)
          }
          if (decoded?.worldData) { syncGuardRef.current = true; useVoltVerseCreatorStore.getState().setWorldData(decoded.worldData); queueMicrotask(() => { syncGuardRef.current = false }) }
        } catch {}
      }
    })

    return () => { offEvent?.(); sdk.emitEvent('voltverse-creator:leave', { userId: localId }, { serverRelay: true }) }
  }, [sdk, currentUser, collaborationEnabled])

  // Broadcast world changes to collaborators (debounced)
  const broadcastTimer = useRef(null)
  useEffect(() => {
    if (!sdk?.emitEvent || syncGuardRef.current || !collaborationEnabled) return
    clearTimeout(broadcastTimer.current)
    broadcastTimer.current = setTimeout(() => {
      const snap = LZString.compressToEncodedURIComponent(JSON.stringify({
        worldData,
        collaborators: collaboratorsRef.current
      }))
      sdk.emitEvent('voltverse-creator:sync-response', { targetUserId: null, snapshot: snap }, { serverRelay: true })
    }, 500)
  }, [sdk, worldData, collaborationEnabled])

  // Add model asset
  const handleAddModelAsset = useCallback(async (file) => {
    try {
      const embedded = await embedModel(file)
      const assetId = embedded.id
      addModelAsset({ id: assetId, name: file.name, src: embedded.data, data: embedded.data, mimeType: embedded.mimeType, size: file.size })
      addObject({
        type: 'model', name: file.name.replace(/\.[^.]+$/, ''),
        assetRef: assetId, modelFormat: file.name.split('.').pop()?.toLowerCase() || 'glb',
        model: { assetRef: assetId, scaleMultiplier: 1, positionOffset: [0, 0, 0], rotationOffset: [0, 0, 0] }
      })
    } catch (err) { console.error('[VoltVerseCreator] Model import failed:', err) }
  }, [addModelAsset, addObject])

  // Add texture asset
  const handleAddTextureAsset = useCallback(async (file) => {
    try {
      const embedded = await embedTexture(file)
      useVoltVerseCreatorStore.getState().updateWorldData({
        assets: {
          ...worldData.assets,
          textures: [...(worldData.assets?.textures || []), { id: embedded.id, name: file.name, data: embedded.data, mimeType: embedded.mimeType, size: file.size }]
        }
      })
    } catch (err) { console.error('[VoltVerseCreator] Texture import failed:', err) }
  }, [worldData.assets])

  // Remove asset
  const handleRemoveAsset = useCallback((type, id) => {
    const key = type === 'model' ? 'models' : 'textures'
    useVoltVerseCreatorStore.getState().updateWorldData({
      assets: { ...worldData.assets, [key]: (worldData.assets?.[key] || []).filter(a => a.id !== id) }
    })
  }, [worldData.assets])

  // Import file
  const handleImport = useCallback(async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    if (MODEL_FILE_PATTERN.test(file.name)) { handleAddModelAsset(file); return }
    if (TEXTURE_FILE_PATTERN.test(file.name)) { handleAddTextureAsset(file); return }

    try {
      const roomData = await loadRoomFromFile(file)
      importWorld(JSON.stringify(roomData))
    } catch (err) {
      console.error('[VoltVerseCreator] Import failed:', err)
    }
  }, [handleAddModelAsset, handleAddTextureAsset, importWorld])

  // Export .voltroom
  const handleExport = useCallback(() => {
    const roomData = JSON.parse(exportWorld())
    saveRoomToFile(roomData, `${worldData.name || 'world'}.voltroom`)
  }, [exportWorld, worldData.name])

  // Share to all peers via chunked broadcast
  const handleShare = useCallback(async () => {
    if (!sdk?.emitEvent) { setShareStatus('No SDK connection'); return }
    setShareStatus('Sharing...')
    try {
      const roomData = JSON.parse(exportWorld())
      await broadcastRoomChunked(sdk, roomData, (msg) => setShareStatus(msg))
      setTimeout(() => setShareStatus(''), 3000)
    } catch (err) {
      setShareStatus(`Error: ${err.message}`)
    }
  }, [sdk, exportWorld])

  const TABS = [
    { id: 'objects', label: '🏗 Objects' },
    { id: 'assets', label: '📦 Assets' },
    { id: 'environment', label: '🌍 Env' },
    { id: 'properties', label: '⚙ Props' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0d1117', color: '#f9fafb', fontFamily: 'system-ui,-apple-system,sans-serif' }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: '#161b22', borderBottom: '1px solid #1f2937', flexShrink: 0 }}>
        <span style={{ fontWeight: 'bold', color: '#8b5cf6', fontSize: 15 }}>⚡ VoltVerse Creator</span>
        <span style={{ fontSize: 11, color: '#6b7280' }}>{worldData.name}</span>
        <span style={{ fontSize: 11, color: '#4b5563' }}>{fileSize}</span>
        <div style={{ flex: 1 }} />
        {/* Tool buttons */}
        {[
          { key: 'select', label: '↖ Select', mode: 'translate' },
          { key: 'move', label: '✥ Move', mode: 'translate' },
          { key: 'rotate', label: '↻ Rotate', mode: 'rotate' },
          { key: 'scale', label: '⤢ Scale', mode: 'scale' },
        ].map(t => (
          <button key={t.key}
            style={{ ...S.btn, background: tools.active === t.key ? '#4f46e5' : '#1f2937', color: tools.active === t.key ? '#fff' : '#9ca3af' }}
            onClick={() => setTools({ active: t.key, transformMode: t.mode })}
          >{t.label}</button>
        ))}
        <div style={{ width: 1, height: 20, background: '#1f2937' }} />
        <button style={S.btn} onClick={undo}>↩</button>
        <button style={S.btn} onClick={redo}>↪</button>
        <button style={{ ...S.btn, background: isPlaying ? '#14532d' : '#1f2937' }} onClick={() => setIsPlaying(!isPlaying)}>
          {isPlaying ? '⏹ Stop' : '▶ Play'}
        </button>
        <div style={{ width: 1, height: 20, background: '#1f2937' }} />
        <button style={S.btn} onClick={() => importInputRef.current?.click()}>📂 Import</button>
        <button style={S.btnPrimary} onClick={handleExport}>💾 Export .voltroom</button>
        <button style={{ ...S.btnPrimary, background: '#059669' }} onClick={handleShare} title="Broadcast world to all players in the session">
          📡 Share to Session
        </button>
        {shareStatus && <span style={{ fontSize: 11, color: '#34d399' }}>{shareStatus}</span>}
        <button style={{ ...S.btn, background: collaborationEnabled ? '#312e81' : '#1f2937' }}
          onClick={() => setCollaborationEnabled(v => !v)}>
          {collaborationEnabled ? `👥 Collab (${collaborators.length})` : '👥 Collab'}
        </button>
        <button style={S.btnDanger} onClick={clearWorld}>🗑 Clear</button>
      </div>

      {/* ── Main layout ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Sidebar */}
        <div style={{ width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid #1f2937', background: '#0d1117' }}>
          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid #1f2937' }}>
            {TABS.map(tab => (
              <button key={tab.id}
                style={{ flex: 1, padding: '7px 4px', background: activeTab === tab.id ? '#161b22' : 'transparent', border: 'none', borderBottom: activeTab === tab.id ? '2px solid #6366f1' : '2px solid transparent', color: activeTab === tab.id ? '#f9fafb' : '#6b7280', fontSize: 11, cursor: 'pointer' }}
                onClick={() => setActiveTab(tab.id)}
              >{tab.label}</button>
            ))}
          </div>
          {/* Tab content */}
          <div style={{ flex: 1, overflow: 'hidden' }}>
            {activeTab === 'objects' && (
              <ObjectsPanel
                worldData={worldData}
                selectedId={selectedObjectId}
                onSelect={setSelectedObjectId}
                onAddObject={addObject}
                onAddSpawnPoint={addSpawnPoint}
                onAddPortal={addPortal}
                onAddTrigger={addTrigger}
              />
            )}
            {activeTab === 'assets' && (
              <AssetsPanel
                worldData={worldData}
                onAddModelAsset={handleAddModelAsset}
                onAddTextureAsset={handleAddTextureAsset}
                onRemoveAsset={handleRemoveAsset}
              />
            )}
            {activeTab === 'environment' && (
              <EnvironmentPanel
                environment={worldData.environment}
                showGrid={showGrid}
                onUpdateEnvironment={updateEnvironment}
              />
            )}
            {activeTab === 'properties' && (
              <PropertiesPanel
                entity={selectedEntity}
                worldData={worldData}
                onUpdateObject={updateObject}
                onUpdateSpawn={updateSpawnPoint}
                onUpdatePortal={updatePortal}
                onUpdateTrigger={updateTrigger}
                onRemoveEntity={removeEntity}
              />
            )}
          </div>
        </div>

        {/* 3D Canvas */}
        <div style={{ flex: 1, position: 'relative' }}>
          <Canvas
            shadows={false}
            gl={{ antialias: false, powerPreference: 'high-performance', failIfMajorPerformanceCaveat: false }}
            camera={{ position: [10, 10, 10], fov: 50 }}
            dpr={1}
            style={{ position: 'absolute', inset: 0 }}
            onPointerMissed={() => setSelectedObjectId(null)}
          >
            <CreatorScene
              worldData={worldData}
              selectedEntity={selectedEntity}
              isPlaying={isPlaying}
              showGrid={showGrid}
              gridSize={gridSize}
              snapToGrid={snapToGrid}
              tools={tools}
              onSelect={setSelectedObjectId}
            />
          </Canvas>

          {/* World name input overlay */}
          <div style={{ position: 'absolute', top: 8, left: 8, display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              value={worldData.name}
              onChange={e => useVoltVerseCreatorStore.getState().updateWorldData({ name: e.target.value })}
              style={{ ...S.input, width: 160, background: 'rgba(13,17,23,0.85)', border: '1px solid #374151' }}
              placeholder="World name..."
            />
          </div>

          {/* Stats overlay */}
          <div style={{ position: 'absolute', bottom: 8, right: 8, background: 'rgba(13,17,23,0.8)', border: '1px solid #1f2937', borderRadius: 6, padding: '4px 10px', fontSize: 11, color: '#6b7280' }}>
            {worldData.objects.length} objects · {worldData.assets?.models?.length || 0} models · {worldData.assets?.textures?.length || 0} textures · {fileSize}
          </div>
        </div>
      </div>

      {/* Hidden import input */}
      <input ref={importInputRef} type="file" accept=".voltroom,.json,.glb,.gltf,.obj,.fbx,.png,.jpg,.jpeg,.webp" style={{ display: 'none' }} onChange={handleImport} />
    </div>
  )
}

export default VoltVerseCreator
