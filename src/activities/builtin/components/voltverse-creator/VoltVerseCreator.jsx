import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, TransformControls, Text } from '@react-three/drei'
import {
  BoltIcon,
  CubeIcon,
  GlobeAltIcon,
  MapPinIcon
} from '@heroicons/react/24/outline'
import { MOUSE } from 'three'
import LZString from 'lz-string'
import useVoltVerseCreatorStore from './store'
import ModelAsset from '../voltverse/components/ModelAsset'
import { embedModel } from '../voltverse/utils/roomFile'
import { DEFAULT_SKYBOXES } from '../voltverse/utils/shaders'
import './styles.css'

const MODEL_FILE_PATTERN = /\.(glb|gltf|obj|fbx)$/i

const PRIMITIVES = [
  ['cube', 'Cube', CubeIcon],
  ['sphere', 'Sphere', GlobeAltIcon],
  ['cylinder', 'Cylinder', CubeIcon],
  ['cone', 'Cone', BoltIcon],
  ['torus', 'Torus', GlobeAltIcon],
  ['plane', 'Plane', CubeIcon],
  ['capsule', 'Capsule', MapPinIcon],
  ['icosahedron', 'Crystal', BoltIcon]
]

const SKYBOXES = Object.keys(DEFAULT_SKYBOXES).map((id) => [id, id])

const MATERIAL_PRESETS = ['standard', 'matte', 'chrome', 'glass', 'emissive', 'toon']
const BUILTIN_SHADERS = ['none', 'hologram', 'neon', 'water', 'fire', 'ice', 'plasma', 'toon']

const isEditableTarget = (target) => {
  const tag = target?.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable
}

const compressState = (payload) => LZString.compressToEncodedURIComponent(JSON.stringify(payload))

const decompressState = (payload) => {
  const json = LZString.decompressFromEncodedURIComponent(payload)
  return json ? JSON.parse(json) : null
}

const findSelectedEntity = (worldData, selectedObjectId) => {
  if (!selectedObjectId) return null
  const object = worldData.objects.find((entry) => entry.id === selectedObjectId)
  if (object) return { kind: 'object', data: object }
  const spawn = worldData.spawnPoints.find((entry) => entry.id === selectedObjectId)
  if (spawn) return { kind: 'spawn', data: spawn }
  const portal = worldData.portals.find((entry) => entry.id === selectedObjectId)
  if (portal) return { kind: 'portal', data: portal }
  const trigger = worldData.triggers.find((entry) => entry.id === selectedObjectId)
  if (trigger) return { kind: 'trigger', data: trigger }
  return null
}

const VoltVerseCreator = ({ sdk, currentUser }) => {
  const [activeTab, setActiveTab] = useState('objects')
  const [collaborationEnabled, setCollaborationEnabled] = useState(false)
  const [collaborators, setCollaborators] = useState([])
  const fileInputRef = useRef(null)
  const syncGuardRef = useRef(false)
  const worldDataRef = useRef(null)
  const avatarDataRef = useRef(null)
  const store = useVoltVerseCreatorStore()

  const {
    mode,
    worldData,
    avatarData,
    selectedObjectId,
    isPlaying,
    showGrid,
    snapToGrid,
    gridSize,
    tools,
    setMode,
    addObject,
    addSpawnPoint,
    addPortal,
    addTrigger,
    setSelectedObjectId,
    exportWorld,
    importWorld,
    exportAvatar,
    importAvatar,
    clearWorld,
    setIsPlaying,
    setTools,
    undo,
    redo,
    removeEntity,
    updateObject,
    updateSpawnPoint,
    updatePortal,
    updateTrigger,
    updateEnvironment,
    updateAvatarData,
    addModelAsset
  } = store

  const selectedEntity = useMemo(() => findSelectedEntity(worldData, selectedObjectId), [worldData, selectedObjectId])

  useEffect(() => { worldDataRef.current = worldData }, [worldData])
  useEffect(() => { avatarDataRef.current = avatarData }, [avatarData])

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (isEditableTarget(event.target)) return
      const isMod = event.ctrlKey || event.metaKey
      const state = useVoltVerseCreatorStore.getState()

      if (event.code === 'Space') {
        event.preventDefault()
        state.setIsPlaying(!state.isPlaying)
      } else if (isMod && event.code === 'KeyZ') {
        event.preventDefault()
        if (event.shiftKey) state.redo()
        else state.undo()
      } else if ((event.code === 'Delete' || event.code === 'Backspace') && state.selectedObjectId) {
        event.preventDefault()
        state.removeEntity(state.selectedObjectId)
      } else if (event.code === 'Digit1') {
        state.setTools({ active: 'select', transformMode: 'translate' })
      } else if (event.code === 'Digit2') {
        state.setTools({ active: 'move', transformMode: 'translate' })
      } else if (event.code === 'Digit3') {
        state.setTools({ active: 'rotate', transformMode: 'rotate' })
      } else if (event.code === 'Digit4') {
        state.setTools({ active: 'scale', transformMode: 'scale' })
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    if (!sdk?.on || !sdk?.emitEvent || !collaborationEnabled) return undefined
    const localUserId = currentUser?.id || sdk.sessionId || sdk.peerId || 'creator-local'

    sdk.emitEvent('voltverse-creator:join', {
      userId: localUserId,
      mode,
      username: currentUser?.username || currentUser?.displayName || 'Creator'
    }, { serverRelay: true })
    sdk.emitEvent('voltverse-creator:sync-request', { userId: localUserId }, { serverRelay: true })

    const offEvent = sdk.on('event', (evt = {}) => {
      const { eventType, payload = {}, userId } = evt
      if (!eventType || userId === localUserId) return

      if (eventType === 'voltverse-creator:join') {
        setCollaborators((prev) => {
          const next = prev.filter((entry) => entry.id !== payload.userId)
          return [...next, { id: payload.userId, username: payload.username || 'Creator', mode: payload.mode, selectedObjectId: null }]
        })
        return
      }

      if (eventType === 'voltverse-creator:leave') {
        setCollaborators((prev) => prev.filter((entry) => entry.id !== payload.userId))
        return
      }

      if (eventType === 'voltverse-creator:selection') {
        setCollaborators((prev) => prev.map((entry) => (
          entry.id === payload.userId ? { ...entry, selectedObjectId: payload.selectedObjectId || null } : entry
        )))
        return
      }

      if (eventType === 'voltverse-creator:sync-request') {
        sdk.emitEvent('voltverse-creator:sync-response', {
          targetUserId: payload.userId || null,
          snapshot: compressState({ worldData: worldDataRef.current, avatarData: avatarDataRef.current })
        }, { serverRelay: true })
        return
      }

      if (eventType === 'voltverse-creator:sync-response' || eventType === 'voltverse-creator:snapshot') {
        if (payload.targetUserId && payload.targetUserId !== localUserId) return
        const decoded = decompressState(payload.snapshot || '')
        if (!decoded) return
        syncGuardRef.current = true
        useVoltVerseCreatorStore.getState().setWorldData(decoded.worldData || useVoltVerseCreatorStore.getState().worldData)
        useVoltVerseCreatorStore.getState().setAvatarData(decoded.avatarData || useVoltVerseCreatorStore.getState().avatarData)
        queueMicrotask(() => { syncGuardRef.current = false })
      }
    })

    return () => {
      offEvent?.()
      sdk.emitEvent('voltverse-creator:leave', { userId: localUserId }, { serverRelay: true })
    }
  }, [sdk, mode, currentUser?.displayName, currentUser?.id, currentUser?.username, collaborationEnabled])

  useEffect(() => {
    if (!sdk?.emitEvent || syncGuardRef.current || !collaborationEnabled) return
    sdk.emitEvent('voltverse-creator:snapshot', {
      snapshot: compressState({ worldData, avatarData })
    }, { serverRelay: true })
  }, [sdk, worldData, avatarData, collaborationEnabled])

  useEffect(() => {
    if (!sdk?.emitEvent || !collaborationEnabled) return
    sdk.emitEvent('voltverse-creator:selection', {
      userId: currentUser?.id || sdk.sessionId || sdk.peerId || 'creator-local',
      selectedObjectId
    }, { serverRelay: true })
  }, [sdk, collaborationEnabled, currentUser?.id, selectedObjectId])

  const handleExport = useCallback(() => {
    const data = mode === 'world' ? exportWorld() : exportAvatar()
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = mode === 'world' ? `${worldData.name}.voltworld` : `${avatarData.name}.voltavatar`
    anchor.click()
    URL.revokeObjectURL(url)
  }, [avatarData.name, exportAvatar, exportWorld, mode, worldData.name])

  const handleImport = useCallback((event) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (MODEL_FILE_PATTERN.test(file.name)) {
      embedModel(file).then((embedded) => {
        if (mode === 'avatar') {
          updateAvatarData('model', {
            assetId: `avatar_${Date.now()}`,
            format: file.name.split('.').pop()?.toLowerCase() || 'glb',
            src: embedded.data,
            embeddedData: embedded.data
          })
        } else {
          const assetId = `model_${Date.now()}`
          addModelAsset({ id: assetId, name: file.name, src: embedded.data, mimeType: embedded.mimeType, modelUrl: embedded.data })
          addObject({
            type: 'model',
            name: file.name.replace(/\.[^.]+$/, ''),
            assetRef: assetId,
            modelUrl: embedded.data,
            modelFormat: file.name.split('.').pop()?.toLowerCase() || 'glb',
            model: { assetRef: assetId, scaleMultiplier: 1, positionOffset: [0, 0, 0], rotationOffset: [0, 0, 0] }
          })
        }
      }).catch(() => {
        sdk?.emitEvent?.({ type: 'error', message: 'Failed to import 3D model' })
      })
      event.target.value = ''
      return
    }

    const reader = new FileReader()
    reader.onload = (loadEvent) => {
      const text = String(loadEvent.target?.result || '')
      let parsed
      try {
        parsed = JSON.parse(text)
      } catch {
        sdk?.emitEvent?.({ type: 'error', message: 'Invalid VoltVerse file' })
        return
      }

      const looksLikeAvatar = file.name.endsWith('.voltavatar') || !!parsed.procedural || !!parsed.model
      const success = looksLikeAvatar ? importAvatar(text) : importWorld(text)
      if (!success) sdk?.emitEvent?.({ type: 'error', message: 'Failed to import file' })
      event.target.value = ''
    }
    reader.readAsText(file)
  }, [addModelAsset, addObject, importAvatar, importWorld, mode, sdk, updateAvatarData])

  return (
    <div className="vv-creator">
      <div className="vv-creator-header">
        <div className="vv-creator-title">
          <h1>VoltVerse Creator</h1>
          <span className="vv-creator-mode">{mode === 'world' ? 'World Editor' : 'Avatar Editor'}</span>
        </div>
        <div className="vv-creator-toolbar">
          <button className={`vv-btn ${mode === 'world' ? 'active' : ''}`} onClick={() => setMode('world')}>World</button>
          <button className={`vv-btn ${mode === 'avatar' ? 'active' : ''}`} onClick={() => setMode('avatar')}>Avatar</button>
          <div className="vv-divider" />
          <button className="vv-btn" onClick={() => setIsPlaying(!isPlaying)}>{isPlaying ? 'Stop Preview' : 'Play Preview'}</button>
          <button className="vv-btn" onClick={undo}>Undo</button>
          <button className="vv-btn" onClick={redo}>Redo</button>
          <div className="vv-divider" />
          <button className="vv-btn" onClick={() => fileInputRef.current?.click()}>Import</button>
          <button className="vv-btn" onClick={handleExport}>Export</button>
          <button className={`vv-btn ${collaborationEnabled ? 'active' : ''}`} onClick={() => setCollaborationEnabled((value) => !value)}>
            {collaborationEnabled ? 'Collab On' : 'Collab Off'}
          </button>
          {mode === 'world' ? <button className="vv-btn danger" onClick={clearWorld}>Clear</button> : null}
        </div>
      </div>

      <div className="vv-creator-main">
        <div className="vv-creator-sidebar">
          <div className="vv-sidebar-tabs">
            <button className={`vv-tab ${activeTab === 'objects' ? 'active' : ''}`} onClick={() => setActiveTab('objects')}>Objects</button>
            <button className={`vv-tab ${activeTab === 'environment' ? 'active' : ''}`} onClick={() => setActiveTab('environment')}>Environment</button>
            <button className={`vv-tab ${activeTab === 'properties' ? 'active' : ''}`} onClick={() => setActiveTab('properties')}>Properties</button>
          </div>
          <div className="vv-sidebar-content">
            {activeTab === 'objects' && mode === 'world' ? <ObjectsPanel worldData={worldData} selectedId={selectedObjectId} onSelect={setSelectedObjectId} onAddObject={addObject} onAddSpawnPoint={addSpawnPoint} onAddPortal={addPortal} onAddTrigger={addTrigger} collaborators={collaborators} /> : null}
            {activeTab === 'objects' && mode === 'avatar' ? <AvatarPanel avatarData={avatarData} onUpdateAvatar={updateAvatarData} /> : null}
            {activeTab === 'environment' && mode === 'world' ? <EnvironmentPanel environment={worldData.environment} showGrid={showGrid} onUpdateEnvironment={updateEnvironment} /> : null}
            {activeTab === 'properties' ? <PropertiesPanel entity={selectedEntity} mode={mode} avatarData={avatarData} onUpdateObject={updateObject} onUpdateSpawn={updateSpawnPoint} onUpdatePortal={updatePortal} onUpdateTrigger={updateTrigger} onRemoveEntity={removeEntity} /> : null}
            {activeTab === 'environment' && mode === 'avatar' ? <CollabPanel enabled={collaborationEnabled} collaborators={collaborators} /> : null}
          </div>
        </div>

        <div className="vv-creator-canvas">
          <Canvas camera={{ position: [10, 10, 10], fov: 50 }} shadows onPointerMissed={() => setSelectedObjectId(null)}>
            <CreatorScene worldData={worldData} avatarData={avatarData} mode={mode} selectedEntity={selectedEntity} isPlaying={isPlaying} showGrid={showGrid} gridSize={gridSize} snapToGrid={snapToGrid} tools={tools} onSelect={setSelectedObjectId} />
          </Canvas>
          {!isPlaying && mode === 'world' ? (
            <div className="vv-creator-tool-palette">
              <ToolButton active={tools.active === 'select'} onClick={() => setTools({ active: 'select', transformMode: 'translate' })} icon="1" title="Select" />
              <ToolButton active={tools.active === 'move'} onClick={() => setTools({ active: 'move', transformMode: 'translate' })} icon="2" title="Move" />
              <ToolButton active={tools.active === 'rotate'} onClick={() => setTools({ active: 'rotate', transformMode: 'rotate' })} icon="3" title="Rotate" />
              <ToolButton active={tools.active === 'scale'} onClick={() => setTools({ active: 'scale', transformMode: 'scale' })} icon="4" title="Scale" />
            </div>
          ) : null}
        </div>
      </div>

      <input ref={fileInputRef} type="file" accept=".voltworld,.voltavatar,.json,.glb,.gltf,.obj,.fbx" style={{ display: 'none' }} onChange={handleImport} />
    </div>
  )
}

const ObjectsPanel = ({ worldData, selectedId, onSelect, onAddObject, onAddSpawnPoint, onAddPortal, onAddTrigger }) => {
  const sceneItems = [
    ...worldData.objects.map((item) => ({ ...item, label: item.name || item.type, swatch: item.material?.color || '#6366f1' })),
    ...worldData.spawnPoints.map((item) => ({ ...item, label: item.name, swatch: '#10b981' })),
    ...worldData.portals.map((item) => ({ ...item, label: item.name, swatch: item.color || '#22d3ee' })),
    ...worldData.triggers.map((item) => ({ ...item, label: item.name, swatch: '#f59e0b' }))
  ]

  return (
    <div className="vv-panel">
      <div className="vv-panel-section">
        <h3>Primitives</h3>
        <div className="vv-object-grid">
          {PRIMITIVES.map(([type, label, Icon]) => <button key={type} className="vv-object-btn" onClick={() => onAddObject({ type, name: label })}><span className="vv-object-icon"><Icon width={20} height={20} /></span><span>{label}</span></button>)}
        </div>
      </div>
      {worldData.assets?.models?.length ? (
        <div className="vv-panel-section">
          <h3>Imported Models</h3>
          <div className="vv-object-list">
            {worldData.assets.models.map((model) => <button key={model.id} className="vv-object-item" onClick={() => onAddObject({ type: 'model', name: model.name.replace(/\.[^.]+$/, ''), assetRef: model.id, model: { assetRef: model.id } })}><span className="vv-object-color" style={{ background: '#38bdf8' }} /><span className="vv-object-name">{model.name}</span><span className="vv-object-type">model</span></button>)}
          </div>
        </div>
      ) : null}
      <div className="vv-panel-section">
        <h3>World Elements</h3>
        <div className="vv-object-grid">
          <button className="vv-object-btn" onClick={() => onAddSpawnPoint({})}><span className="vv-object-icon"><MapPinIcon width={20} height={20} /></span><span>Spawn Point</span></button>
          <button className="vv-object-btn" onClick={() => onAddPortal({})}><span className="vv-object-icon"><GlobeAltIcon width={20} height={20} /></span><span>Portal</span></button>
          <button className="vv-object-btn" onClick={() => onAddTrigger({ actions: [{ type: 'message', message: 'Triggered' }] })}><span className="vv-object-icon"><BoltIcon width={20} height={20} /></span><span>Trigger</span></button>
        </div>
      </div>
      <div className="vv-panel-section">
        <h3>Scene Items ({sceneItems.length})</h3>
        <div className="vv-object-list">
          {sceneItems.map((item) => <button key={item.id} className={`vv-object-item ${item.id === selectedId ? 'selected' : ''}`} onClick={() => onSelect(item.id)}><span className="vv-object-color" style={{ background: item.swatch }} /><span className="vv-object-name">{item.label}</span><span className="vv-object-type">{item.type || item.id.split('_')[0]}</span></button>)}
        </div>
      </div>
    </div>
  )
}

const AvatarPanel = ({ avatarData, onUpdateAvatar }) => {
  const parts = ['head', 'body', 'arms', 'legs', 'eyes', 'hair', 'skin']
  const procedural = avatarData.procedural || {}

  return (
    <div className="vv-panel">
      <div className="vv-panel-section">
        <h3>Procedural Parts</h3>
        {parts.map((part) => (
          <div key={part} className="vv-part-control">
            <label>{part}</label>
            <div className="vv-part-inputs">
              <input type="color" value={procedural[part]?.color || '#ffffff'} onChange={(event) => onUpdateAvatar(part, { color: event.target.value })} />
              <input type="range" min="0.5" max="2" step="0.1" value={procedural[part]?.scale || 1} onChange={(event) => onUpdateAvatar(part, { scale: Number(event.target.value) })} />
            </div>
          </div>
        ))}
      </div>
      {avatarData.model?.src ? <div className="vv-panel-section"><h3>Imported Avatar Model</h3><p className="vv-empty-message">{avatarData.model.format?.toUpperCase() || 'MODEL'} attached.</p></div> : null}
    </div>
  )
}

const EnvironmentPanel = ({ environment, showGrid, onUpdateEnvironment }) => (
  <div className="vv-panel">
    <div className="vv-panel-section">
      <h3>Sky</h3>
      <div className="vv-form-group">
        <label>Skybox</label>
        <select value={environment.skybox?.preset || 'sunset-gradient'} onChange={(event) => onUpdateEnvironment({ skybox: { preset: event.target.value } })}>
          {SKYBOXES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
      </div>
      <div className="vv-form-group">
        <label>Tint</label>
        <input type="color" value={environment.skybox?.tint || '#ffffff'} onChange={(event) => onUpdateEnvironment({ skybox: { tint: event.target.value } })} />
      </div>
    </div>
    <div className="vv-panel-section">
      <h3>Fog</h3>
      <div className="vv-form-group">
        <label>Color</label>
        <input type="color" value={environment.fog?.color || '#1a1a2e'} onChange={(event) => onUpdateEnvironment({ fog: { color: event.target.value } })} />
      </div>
      <div className="vv-form-group">
        <label>Near: {environment.fog?.near || 10}</label>
        <input type="range" min="0" max="100" value={environment.fog?.near || 10} onChange={(event) => onUpdateEnvironment({ fog: { near: Number(event.target.value) } })} />
      </div>
      <div className="vv-form-group">
        <label>Far: {environment.fog?.far || 100}</label>
        <input type="range" min="10" max="500" value={environment.fog?.far || 100} onChange={(event) => onUpdateEnvironment({ fog: { far: Number(event.target.value) } })} />
      </div>
    </div>
    <div className="vv-panel-section">
      <h3>Floor</h3>
      <div className="vv-form-group">
        <label>Color</label>
        <input type="color" value={environment.floor?.color || '#2d2d44'} onChange={(event) => onUpdateEnvironment({ floor: { color: event.target.value } })} />
      </div>
      <div className="vv-form-group">
        <label>Size: {environment.floor?.size?.[0] || 100}</label>
        <input type="range" min="20" max="500" step="10" value={environment.floor?.size?.[0] || 100} onChange={(event) => onUpdateEnvironment({ floor: { size: [Number(event.target.value), Number(event.target.value)] } })} />
      </div>
      <div className="vv-form-group checkbox">
        <label>
          <input type="checkbox" checked={showGrid} onChange={(event) => onUpdateEnvironment({ floor: { grid: event.target.checked } })} />
          Show Grid
        </label>
      </div>
    </div>
  </div>
)

const PropertiesPanel = ({ entity, mode, avatarData, onUpdateObject, onUpdateSpawn, onUpdatePortal, onUpdateTrigger, onRemoveEntity }) => {
  if (mode === 'avatar' || !entity) {
    return <div className="vv-panel"><div className="vv-panel-section"><h3>Properties</h3><p className="vv-empty-message">{mode === 'avatar' ? `Avatar: ${avatarData.name}` : 'Select an item to edit its properties'}</p></div></div>
  }

  const object = entity.data
  const updateCurrent = (updates) => {
    if (entity.kind === 'object') onUpdateObject(object.id, updates)
    if (entity.kind === 'spawn') onUpdateSpawn(object.id, updates)
    if (entity.kind === 'portal') onUpdatePortal(object.id, updates)
    if (entity.kind === 'trigger') onUpdateTrigger(object.id, updates)
  }

  return (
    <div className="vv-panel">
      <div className="vv-panel-section">
        <h3>{object.name || object.type || object.id}</h3>
        <div className="vv-form-group">
          <label>Name</label>
          <input type="text" value={object.name || object.type || ''} onChange={(event) => updateCurrent({ name: event.target.value })} />
        </div>
      </div>
      <VectorPanel title="Position" value={object.position || [0, 0, 0]} onChange={(position) => updateCurrent({ position })} />
      {entity.kind !== 'trigger' ? <VectorPanel title="Rotation" value={object.rotation || [0, 0, 0]} onChange={(rotation) => updateCurrent({ rotation })} /> : null}
      {entity.kind !== 'spawn' ? <VectorPanel title="Scale" value={object.scale || [1, 1, 1]} onChange={(scale) => updateCurrent({ scale })} /> : null}
      {entity.kind === 'object' ? (
        <div className="vv-panel-section">
          <h4>Material</h4>
          <div className="vv-form-group">
            <label>Preset</label>
            <select value={object.material?.preset || 'standard'} onChange={(event) => updateCurrent({ material: { preset: event.target.value } })}>
              {MATERIAL_PRESETS.map((preset) => <option key={preset} value={preset}>{preset}</option>)}
            </select>
          </div>
          <div className="vv-form-group">
            <label>Shader</label>
            <select value={object.material?.shaderId || 'none'} onChange={(event) => updateCurrent({ material: { shaderId: event.target.value === 'none' ? null : event.target.value } })}>
              {BUILTIN_SHADERS.map((shader) => <option key={shader} value={shader}>{shader}</option>)}
            </select>
          </div>
        </div>
      ) : null}
      <div className="vv-panel-section">
        <button className="vv-btn danger" onClick={() => onRemoveEntity(object.id)}>Delete</button>
      </div>
    </div>
  )
}

const VectorPanel = ({ title, value, onChange }) => (
  <div className="vv-panel-section">
    <h4>{title}</h4>
    <div className="vv-vector-inputs">
      {['X', 'Y', 'Z'].map((axis, index) => <div key={axis} className="vv-vector-input"><label>{axis}</label><input type="number" step="0.1" value={value[index] ?? 0} onChange={(event) => { const next = [...value]; next[index] = Number(event.target.value); onChange(next) }} /></div>)}
    </div>
  </div>
)

const CreatorScene = ({ worldData, avatarData, mode, selectedEntity, isPlaying, showGrid, gridSize, snapToGrid, tools, onSelect }) => {
  const orbitRef = useRef(null)
  const floorSize = worldData.environment.floor?.size?.[0] || 100

  return (
    <>
      <color attach="background" args={[worldData.environment.skybox?.tint || '#0f172a']} />
      <fog attach="fog" args={[worldData.environment.fog?.color || '#1a1a2e', worldData.environment.fog?.near || 10, worldData.environment.fog?.far || 100]} />
      <ambientLight color={worldData.environment.ambientLight?.color || '#404060'} intensity={worldData.environment.ambientLight?.intensity || 0.4} />
      <directionalLight color={worldData.environment.directionalLight?.color || '#ffd4a3'} intensity={worldData.environment.directionalLight?.intensity || 1} position={worldData.environment.directionalLight?.position || [10, 20, 10]} castShadow />
      {mode === 'world' ? (
        <>
          <SkyDome tint={worldData.environment.skybox?.tint || '#8ec5ff'} />
          {showGrid && worldData.environment.floor?.grid !== false ? <gridHelper args={[floorSize, Math.max(10, floorSize / Math.max(gridSize, 1)), worldData.environment.floor?.gridColor || '#4a4a6a', '#2a2a4a']} position={[0, 0.01, 0]} /> : null}
          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={worldData.environment.floor?.size || [100, 100]} />
            <meshStandardMaterial color={worldData.environment.floor?.color || '#2d2d44'} />
          </mesh>
          {worldData.objects.map((object) => <SceneObject key={object.id} data={object} assets={worldData.assets} isSelected={selectedEntity?.data?.id === object.id} onSelect={() => onSelect(object.id)} />)}
          {worldData.spawnPoints.map((spawn) => <Marker key={spawn.id} data={spawn} color="#10b981" isSelected={selectedEntity?.data?.id === spawn.id} onSelect={() => onSelect(spawn.id)} />)}
          {worldData.portals.map((portal) => <Marker key={portal.id} data={portal} color={portal.color || '#22d3ee'} isSelected={selectedEntity?.data?.id === portal.id} onSelect={() => onSelect(portal.id)} />)}
          {worldData.triggers.map((trigger) => <Marker key={trigger.id} data={trigger} color="#f59e0b" isSelected={selectedEntity?.data?.id === trigger.id} onSelect={() => onSelect(trigger.id)} />)}
          <SceneTransformGizmo selectedEntity={selectedEntity} isPlaying={isPlaying} activeTool={tools.active} transformMode={tools.transformMode} snapToGrid={snapToGrid} gridSize={gridSize} orbitRef={orbitRef} />
        </>
      ) : (
        <AvatarPreview avatarData={avatarData} />
      )}
      <OrbitControls ref={orbitRef} makeDefault enableDamping={false} mouseButtons={{ LEFT: MOUSE.PAN, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.ROTATE }} />
    </>
  )
}

const SkyDome = ({ tint }) => (
  <mesh>
    <sphereGeometry args={[160, 32, 32]} />
    <meshBasicMaterial color={tint} side={1} transparent opacity={0.92} />
  </mesh>
)

const SceneTransformGizmo = ({ selectedEntity, isPlaying, activeTool, transformMode, snapToGrid, gridSize, orbitRef }) => {
  const groupRef = useRef(null)
  const transformRef = useRef(null)
  const draggingRef = useRef(false)

  useEffect(() => {
    const controls = transformRef.current
    const orbit = orbitRef.current
    if (!controls || !orbit) return undefined
    const handleDraggingChanged = (event) => {
      orbit.enabled = !event.value
    }
    controls.addEventListener('dragging-changed', handleDraggingChanged)
    return () => controls.removeEventListener('dragging-changed', handleDraggingChanged)
  }, [orbitRef])

  useEffect(() => {
    if (!groupRef.current || !selectedEntity?.data) return
    groupRef.current.position.set(...(selectedEntity.data.position || [0, 0, 0]))
    groupRef.current.rotation.set(...(selectedEntity.data.rotation || [0, 0, 0]))
    groupRef.current.scale.set(...(selectedEntity.data.scale || [1, 1, 1]))
  }, [selectedEntity])

  const commitTransform = useCallback(() => {
    if (!groupRef.current || !selectedEntity?.data) return
    const position = groupRef.current.position.toArray().map((value) => snapToGrid ? Math.round(value / gridSize) * gridSize : value)
    const rotation = [groupRef.current.rotation.x, groupRef.current.rotation.y, groupRef.current.rotation.z]
    const scale = groupRef.current.scale.toArray()
    useVoltVerseCreatorStore.getState().setEntityTransformLive(selectedEntity.kind, selectedEntity.data.id, {
      position,
      rotation,
      scale
    })
  }, [gridSize, selectedEntity, snapToGrid])

  useEffect(() => {
    const controls = transformRef.current
    if (!controls) return undefined

    const handleObjectChange = () => {
      if (!groupRef.current || !selectedEntity?.data) return
      useVoltVerseCreatorStore.getState().setEntityTransformLive(selectedEntity.kind, selectedEntity.data.id, {
        position: groupRef.current.position.toArray(),
        rotation: [groupRef.current.rotation.x, groupRef.current.rotation.y, groupRef.current.rotation.z],
        scale: groupRef.current.scale.toArray()
      })
    }

    const handleDragChange = (event) => {
      if (event.value && !draggingRef.current) {
        useVoltVerseCreatorStore.getState().pushUndo()
      }
      draggingRef.current = event.value
    }

    controls.addEventListener('objectChange', handleObjectChange)
    controls.addEventListener('dragging-changed', handleDragChange)
    return () => {
      controls.removeEventListener('objectChange', handleObjectChange)
      controls.removeEventListener('dragging-changed', handleDragChange)
    }
  }, [selectedEntity])

  if (!selectedEntity || isPlaying || activeTool === 'select') return null

  return <TransformControls ref={transformRef} mode={transformMode} onMouseUp={commitTransform}><group ref={groupRef} /></TransformControls>
}

const SceneObject = ({ data, assets, isSelected, onSelect }) => {
  const modelAsset = assets?.models?.find((asset) => asset.id === (data.assetRef || data.model?.assetRef))
  const modelSrc = modelAsset?.src || modelAsset?.modelUrl || data.modelUrl || null

  return (
    <group position={data.position} rotation={data.rotation} scale={data.scale}>
      <mesh onClick={(event) => { event.stopPropagation(); onSelect() }} castShadow receiveShadow>
        {data.type === 'model' && modelSrc ? (
          <ModelAsset asset={modelAsset || { src: modelSrc, format: data.modelFormat }} src={modelSrc} />
        ) : (
          <>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color={data.material?.color || '#6366f1'} />
          </>
        )}
      </mesh>
      {isSelected ? <mesh><boxGeometry args={[(data.scale?.[0] || 1) + 0.1, (data.scale?.[1] || 1) + 0.1, (data.scale?.[2] || 1) + 0.1]} /><meshBasicMaterial color="#6366f1" wireframe transparent opacity={0.8} /></mesh> : null}
    </group>
  )
}

const Marker = ({ data, color, isSelected, onSelect }) => (
  <group position={data.position} rotation={data.rotation || [0, 0, 0]} scale={data.scale || [1, 1, 1]} onClick={(event) => { event.stopPropagation(); onSelect() }}>
    <mesh>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial color={color} wireframe transparent opacity={isSelected ? 0.85 : 0.45} />
    </mesh>
    <Text position={[0, 0.9, 0]} fontSize={0.18} color="#ffffff">{data.name || data.id}</Text>
  </group>
)

const AvatarPreview = ({ avatarData }) => {
  const procedural = avatarData.procedural || {}

  return (
    <group position={[0, 0, 0]}>
      {avatarData.model?.src ? (
        <>
          <Text position={[0, 2.9, 0]} fontSize={0.2} color="#93c5fd">{avatarData.name || 'Imported Avatar'}</Text>
          <group
            scale={[avatarData.model.scale || 1, avatarData.model.scale || 1, avatarData.model.scale || 1]}
            position={avatarData.model.positionOffset || [0, 0, 0]}
            rotation={avatarData.model.rotationOffset || [0, 0, 0]}
          >
            <ModelAsset asset={{ src: avatarData.model.src, format: avatarData.model.format }} src={avatarData.model.src} />
          </group>
        </>
      ) : (
        <>
          <mesh position={[0, 2.1, 0]} scale={procedural.head?.scale || 1}>
            <sphereGeometry args={[0.45, 32, 32]} />
            <meshStandardMaterial color={procedural.head?.color || '#f5d0c5'} />
          </mesh>
          <mesh position={[0, 1.15, 0]} scale={[0.9, 1.3 * (procedural.body?.scale || 1), 0.5]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color={procedural.body?.color || '#4a5568'} />
          </mesh>
        </>
      )}
      <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[4, 48]} />
        <meshStandardMaterial color="#111827" />
      </mesh>
    </group>
  )
}

const CollabPanel = ({ enabled, collaborators }) => (
  <div className="vv-panel">
    <div className="vv-panel-section">
      <h3>Collaboration</h3>
      <p className="vv-empty-message">{enabled ? 'Shared editing is enabled for this session.' : 'Enable Collab On in the toolbar to let others co-edit this world.'}</p>
    </div>
    <div className="vv-panel-section">
      <h3>Peers ({collaborators.length})</h3>
      <div className="vv-object-list">
        {collaborators.length === 0 ? <p className="vv-empty-message">No collaborators connected.</p> : collaborators.map((entry) => (
          <div key={entry.id} className="vv-object-item">
            <span className="vv-object-name">{entry.username}</span>
            <span className="vv-object-type">{entry.selectedObjectId ? `Editing ${entry.selectedObjectId}` : 'Browsing'}</span>
          </div>
        ))}
      </div>
    </div>
  </div>
)

const ToolButton = ({ active, onClick, icon, title }) => <button className={`vv-tool-btn ${active ? 'active' : ''}`} onClick={onClick} title={title}>{icon}</button>

export default VoltVerseCreator
