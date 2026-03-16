import { create } from 'zustand'

const defaultMaterial = {
  type: 'standard',
  preset: 'standard',
  color: '#6366f1',
  emissive: '#000000',
  emissiveIntensity: 0,
  roughness: 0.5,
  metalness: 0.1,
  opacity: 1,
  transparent: false,
  wireframe: false,
  shaderId: null,
  vertexShader: '',
  fragmentShader: '',
  uniforms: {}
}

const defaultEnvironment = {
  skybox: {
    preset: 'sunset-gradient',
    tint: '#ffffff',
    intensity: 1,
    rotation: 0,
    showStars: true
  },
  fog: {
    enabled: true,
    color: '#1a1a2e',
    near: 10,
    far: 100
  },
  ambientLight: {
    color: '#404060',
    intensity: 0.4
  },
  directionalLight: {
    color: '#ffd4a3',
    intensity: 1,
    position: [10, 20, 10]
  },
  floor: {
    color: '#2d2d44',
    size: [100, 100],
    grid: true,
    gridColor: '#4a4a6a',
    materialPreset: 'matte'
  }
}

const defaultAssets = {
  textures: [],
  models: [],
  audio: [],
  materials: []
}

const createDefaultWorldData = () => ({
  version: '2.0',
  name: 'New World',
  author: '',
  description: '',
  environment: { ...defaultEnvironment },
  objects: [],
  spawnPoints: [],
  portals: [],
  triggers: [],
  shaders: [],
  scripts: [],
  assets: { ...defaultAssets },
  metadata: {
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: [],
    category: 'social'
  }
})

const createDefaultAvatarData = () => ({
  schemaVersion: 2,
  name: 'New Avatar',
  mode: 'procedural',
  fallbackPreset: 'human',
  procedural: {
    head: { type: 'sphere', color: '#f5d0c5', scale: 1 },
    body: { type: 'box', color: '#4a5568', scale: 1 },
    arms: { type: 'box', color: '#4a5568', scale: 1 },
    legs: { type: 'box', color: '#2d3748', scale: 1 },
    eyes: { color: '#000000', scale: 1 },
    hair: { color: '#8b4513', style: 'short', scale: 1 },
    skin: { color: '#f5d0c5', scale: 1 }
  },
  model: {
    assetId: null,
    format: null,
    src: null,
    embeddedData: null,
    scale: 1,
    positionOffset: [0, 0, 0],
    rotationOffset: [0, 0, 0]
  },
  rig: {},
  animations: {},
  materials: {},
  accessories: []
})

const clone = (value) => JSON.parse(JSON.stringify(value))

const mergeVec3 = (value, fallback) => {
  const next = Array.isArray(value) ? value : fallback
  return [Number(next[0] ?? fallback[0]), Number(next[1] ?? fallback[1]), Number(next[2] ?? fallback[2])]
}

const normalizeMaterial = (source = {}) => {
  const nested = typeof source.material === 'object' && source.material ? source.material : {}
  return {
    ...defaultMaterial,
    ...nested,
    type: nested.type || source.materialType || (source.material === true ? 'shader' : source.material) || defaultMaterial.type,
    preset: nested.preset || source.materialPreset || defaultMaterial.preset,
    color: nested.color || source.color || defaultMaterial.color,
    emissive: nested.emissive || source.emissive || defaultMaterial.emissive,
    emissiveIntensity: nested.emissiveIntensity ?? source.emissiveIntensity ?? defaultMaterial.emissiveIntensity,
    roughness: nested.roughness ?? source.roughness ?? defaultMaterial.roughness,
    metalness: nested.metalness ?? source.metalness ?? defaultMaterial.metalness,
    opacity: nested.opacity ?? source.opacity ?? defaultMaterial.opacity,
    transparent: nested.transparent ?? source.transparent ?? defaultMaterial.transparent,
    wireframe: nested.wireframe ?? source.wireframe ?? defaultMaterial.wireframe,
    shaderId: nested.shaderId || source.shaderId || null,
    vertexShader: nested.vertexShader || source.vertexShader || '',
    fragmentShader: nested.fragmentShader || source.fragmentShader || '',
    uniforms: nested.uniforms || source.uniforms || {}
  }
}

const normalizeModelConfig = (source = {}) => ({
  assetRef: source.assetRef || source.model?.assetRef || source.assetId || null,
  animationClip: source.model?.animationClip || '',
  autoplay: source.model?.autoplay ?? true,
  loop: source.model?.loop ?? true,
  positionOffset: mergeVec3(source.model?.positionOffset, [0, 0, 0]),
  rotationOffset: mergeVec3(source.model?.rotationOffset, [0, 0, 0]),
  scaleMultiplier: Number(source.model?.scaleMultiplier ?? 1)
})

const normalizeWorldObject = (object = {}, index = 0) => ({
  id: object.id || `obj_${Date.now()}_${index}`,
  type: object.type || (object.assetRef || object.modelUrl || object.embeddedModel ? 'model' : 'cube'),
  name: object.name || object.label || `Object ${index + 1}`,
  position: mergeVec3(object.position, [0, 0.5, 0]),
  rotation: mergeVec3(object.rotation, [0, 0, 0]),
  scale: mergeVec3(object.scale, [1, 1, 1]),
  material: normalizeMaterial(object),
  light: object.light || null,
  animation: object.animation || null,
  collider: object.collider || { type: 'box', size: [1, 1, 1] },
  castShadow: object.castShadow ?? true,
  receiveShadow: object.receiveShadow ?? true,
  assetRef: object.assetRef || null,
  model: normalizeModelConfig(object),
  metadata: object.metadata || {}
})

const normalizeWorldData = (data = {}) => {
  const defaults = createDefaultWorldData()
  const environment = data.environment || {}
  const floor = environment.floor || {}
  const fog = environment.fog || {}
  const ambientLight = environment.ambientLight || {}
  const directionalLight = environment.directionalLight || {}
  const skybox = environment.skybox || {}

  return {
    ...defaults,
    ...data,
    environment: {
      ...defaultEnvironment,
      ...environment,
      skybox: {
        ...defaultEnvironment.skybox,
        ...skybox,
        tint: skybox.tint || environment.skyColor || defaultEnvironment.skybox.tint
      },
      fog: {
        ...defaultEnvironment.fog,
        ...fog,
        color: fog.color || environment.fogColor || defaultEnvironment.fog.color,
        near: fog.near ?? environment.fogNear ?? defaultEnvironment.fog.near,
        far: fog.far ?? environment.fogFar ?? defaultEnvironment.fog.far
      },
      ambientLight: {
        ...defaultEnvironment.ambientLight,
        ...ambientLight,
        color: ambientLight.color || environment.ambientLightColor || environment.ambientLight || defaultEnvironment.ambientLight.color,
        intensity: ambientLight.intensity ?? environment.ambientIntensity ?? defaultEnvironment.ambientLight.intensity
      },
      directionalLight: {
        ...defaultEnvironment.directionalLight,
        ...directionalLight,
        color: directionalLight.color || environment.directionalLightColor || environment.directionalLight || defaultEnvironment.directionalLight.color,
        intensity: directionalLight.intensity ?? environment.directionalIntensity ?? defaultEnvironment.directionalLight.intensity,
        position: mergeVec3(directionalLight.position || environment.directionalPosition, defaultEnvironment.directionalLight.position)
      },
      floor: {
        ...defaultEnvironment.floor,
        ...floor,
        color: floor.color || environment.floorColor || defaultEnvironment.floor.color,
        size: mergeVec3(
          Array.isArray(floor.size) ? floor.size : [environment.floorSize || defaultEnvironment.floor.size[0], 0, environment.floorSize || defaultEnvironment.floor.size[1]],
          [defaultEnvironment.floor.size[0], 0, defaultEnvironment.floor.size[1]]
        ).filter((_, index) => index !== 1),
        grid: floor.grid ?? environment.gridEnabled ?? defaultEnvironment.floor.grid,
        gridColor: floor.gridColor || environment.gridColor || defaultEnvironment.floor.gridColor
      }
    },
    objects: Array.isArray(data.objects) ? data.objects.map((object, index) => normalizeWorldObject(object, index)) : [],
    spawnPoints: Array.isArray(data.spawnPoints) ? data.spawnPoints.map((point, index) => ({
      id: point.id || `spawn_${Date.now()}_${index}`,
      name: point.name || `Spawn ${index + 1}`,
      position: mergeVec3(point.position, [0, 0, 0]),
      rotation: mergeVec3(point.rotation, [0, 0, 0])
    })) : [],
    portals: Array.isArray(data.portals) ? data.portals.map((portal, index) => ({
      id: portal.id || `portal_${Date.now()}_${index}`,
      name: portal.name || portal.label || `Portal ${index + 1}`,
      position: mergeVec3(portal.position, [0, 1.5, -2]),
      rotation: mergeVec3(portal.rotation, [0, 0, 0]),
      scale: mergeVec3(portal.scale, [2, 3, 0.1]),
      color: portal.color || '#00ffff',
      destination: portal.destination || null
    })) : [],
    triggers: Array.isArray(data.triggers) ? data.triggers.map((trigger, index) => ({
      id: trigger.id || `trigger_${Date.now()}_${index}`,
      name: trigger.name || trigger.label || `Trigger ${index + 1}`,
      position: mergeVec3(trigger.position, [0, 1, 0]),
      rotation: mergeVec3(trigger.rotation, [0, 0, 0]),
      scale: mergeVec3(trigger.scale, [2, 2, 2]),
      type: trigger.type || trigger.triggerType || 'proximity',
      actions: Array.isArray(trigger.actions) ? trigger.actions : [],
      cooldown: Number(trigger.cooldown ?? 1)
    })) : [],
    shaders: Array.isArray(data.shaders) ? data.shaders : [],
    scripts: Array.isArray(data.scripts) ? data.scripts : [],
    assets: {
      ...defaultAssets,
      ...(data.assets || {}),
      textures: Array.isArray(data.assets?.textures) ? data.assets.textures : [],
      models: Array.isArray(data.assets?.models) ? data.assets.models : [],
      audio: Array.isArray(data.assets?.audio) ? data.assets.audio : [],
      materials: Array.isArray(data.assets?.materials) ? data.assets.materials : []
    }
  }
}

const normalizeAvatarData = (data = {}) => {
  const defaults = createDefaultAvatarData()
  const proceduralSource = data.procedural || {
    head: data.head,
    body: data.body,
    arms: data.arms,
    legs: data.legs,
    eyes: data.eyes,
    hair: data.hair,
    skin: data.skin
  }

  return {
    ...defaults,
    ...data,
    procedural: {
      ...defaults.procedural,
      ...proceduralSource,
      head: { ...defaults.procedural.head, ...(proceduralSource.head || {}) },
      body: { ...defaults.procedural.body, ...(proceduralSource.body || {}) },
      arms: { ...defaults.procedural.arms, ...(proceduralSource.arms || {}) },
      legs: { ...defaults.procedural.legs, ...(proceduralSource.legs || {}) },
      eyes: { ...defaults.procedural.eyes, ...(proceduralSource.eyes || {}) },
      hair: { ...defaults.procedural.hair, ...(proceduralSource.hair || {}) },
      skin: { ...defaults.procedural.skin, ...(proceduralSource.skin || {}) }
    },
    model: {
      ...defaults.model,
      ...(data.model || {})
    },
    rig: { ...defaults.rig, ...(data.rig || {}) },
    animations: { ...defaults.animations, ...(data.animations || {}) },
    materials: { ...defaults.materials, ...(data.materials || {}) },
    accessories: Array.isArray(data.accessories) ? data.accessories : defaults.accessories
  }
}

const withHistory = (state, patch) => ({
  ...patch,
  undoStack: [...state.undoStack.slice(-49), {
    worldData: clone(state.worldData),
    avatarData: clone(state.avatarData),
    selectedObjectId: state.selectedObjectId
  }],
  redoStack: []
})

const updateEntityList = (items, id, recipe) => items.map((item) => (item.id === id ? recipe(item) : item))

const useVoltVerseCreatorStore = create((set, get) => ({
  mode: 'world',
  worldData: createDefaultWorldData(),
  avatarData: createDefaultAvatarData(),
  selectedObjectId: null,
  clipboard: null,
  isPlaying: false,
  showGrid: true,
  snapToGrid: true,
  gridSize: 1,
  cameraView: 'perspective',
  tools: {
    active: 'select',
    transformMode: 'translate'
  },
  undoStack: [],
  redoStack: [],
  setMode: (mode) => set({ mode, selectedObjectId: null }),
  setWorldData: (data) => set({ worldData: normalizeWorldData(data), showGrid: normalizeWorldData(data).environment.floor.grid }),
  updateWorldData: (updates) => set((state) => withHistory(state, {
    worldData: normalizeWorldData({ ...state.worldData, ...updates })
  })),
  updateEnvironment: (updates) => set((state) => {
    const nextEnvironment = {
      ...state.worldData.environment,
      ...updates,
      skybox: { ...state.worldData.environment.skybox, ...(updates.skybox || {}) },
      fog: { ...state.worldData.environment.fog, ...(updates.fog || {}) },
      ambientLight: { ...state.worldData.environment.ambientLight, ...(updates.ambientLight || {}) },
      directionalLight: { ...state.worldData.environment.directionalLight, ...(updates.directionalLight || {}) },
      floor: { ...state.worldData.environment.floor, ...(updates.floor || {}) }
    }

    return withHistory(state, {
      worldData: normalizeWorldData({
        ...state.worldData,
        environment: nextEnvironment
      }),
      showGrid: nextEnvironment.floor.grid
    })
  }),
  setAvatarData: (data) => set({ avatarData: normalizeAvatarData(data) }),
  updateAvatarData: (part, updates) => set((state) => {
    if (part === 'model') {
      return withHistory(state, {
        avatarData: normalizeAvatarData({
          ...state.avatarData,
          model: { ...state.avatarData.model, ...updates }
        })
      })
    }

    return withHistory(state, {
      avatarData: normalizeAvatarData({
        ...state.avatarData,
        procedural: {
          ...state.avatarData.procedural,
          [part]: { ...(state.avatarData.procedural[part] || {}), ...updates }
        }
      })
    })
  }),
  setAvatarMode: (mode) => set((state) => withHistory(state, {
    avatarData: normalizeAvatarData({
      ...state.avatarData,
      mode
    })
  })),
  addObject: (object) => set((state) => {
    const newObject = normalizeWorldObject({
      ...object,
      id: `obj_${Date.now()}`,
      name: object.name || object.label || `Object ${state.worldData.objects.length + 1}`
    }, state.worldData.objects.length)

    return withHistory(state, {
      worldData: normalizeWorldData({
        ...state.worldData,
        objects: [...state.worldData.objects, newObject]
      }),
      selectedObjectId: newObject.id
    })
  }),
  updateObject: (id, updates) => set((state) => withHistory(state, {
    worldData: normalizeWorldData({
      ...state.worldData,
      objects: updateEntityList(state.worldData.objects, id, (object) => normalizeWorldObject({
        ...object,
        ...updates,
        material: updates.material ? { ...object.material, ...updates.material } : object.material,
        model: updates.model ? { ...object.model, ...updates.model } : object.model
      }))
    })
  })),
  removeObject: (id) => set((state) => withHistory(state, {
    worldData: normalizeWorldData({
      ...state.worldData,
      objects: state.worldData.objects.filter((object) => object.id !== id)
    }),
    selectedObjectId: state.selectedObjectId === id ? null : state.selectedObjectId
  })),
  duplicateObject: (id) => set((state) => {
    const object = state.worldData.objects.find((entry) => entry.id === id)
    if (!object) return {}
    const duplicate = normalizeWorldObject({
      ...object,
      id: `obj_${Date.now()}`,
      name: `${object.name} (Copy)`,
      position: [(object.position?.[0] || 0) + 1, object.position?.[1] || 0, object.position?.[2] || 0]
    })

    return withHistory(state, {
      worldData: normalizeWorldData({
        ...state.worldData,
        objects: [...state.worldData.objects, duplicate]
      }),
      selectedObjectId: duplicate.id
    })
  }),
  setSelectedObjectId: (id) => set({ selectedObjectId: id }),
  setClipboard: (object) => set({ clipboard: object }),
  addSpawnPoint: (point) => set((state) => {
    const spawn = {
      id: `spawn_${Date.now()}`,
      name: point.name || `Spawn ${state.worldData.spawnPoints.length + 1}`,
      position: mergeVec3(point.position, [0, 0, 0]),
      rotation: mergeVec3(point.rotation, [0, 0, 0])
    }

    return withHistory(state, {
      worldData: normalizeWorldData({
        ...state.worldData,
        spawnPoints: [...state.worldData.spawnPoints, spawn]
      }),
      selectedObjectId: spawn.id
    })
  }),
  updateSpawnPoint: (id, updates) => set((state) => withHistory(state, {
    worldData: normalizeWorldData({
      ...state.worldData,
      spawnPoints: updateEntityList(state.worldData.spawnPoints, id, (spawn) => ({
        ...spawn,
        ...updates
      }))
    })
  })),
  addPortal: (portal) => set((state) => {
    const nextPortal = {
      id: `portal_${Date.now()}`,
      name: portal.name || 'Portal',
      position: mergeVec3(portal.position, [0, 1.5, -2]),
      rotation: mergeVec3(portal.rotation, [0, 0, 0]),
      scale: mergeVec3(portal.scale, [2, 3, 0.1]),
      color: portal.color || '#00ffff',
      destination: portal.destination || null
    }

    return withHistory(state, {
      worldData: normalizeWorldData({
        ...state.worldData,
        portals: [...state.worldData.portals, nextPortal]
      }),
      selectedObjectId: nextPortal.id
    })
  }),
  updatePortal: (id, updates) => set((state) => withHistory(state, {
    worldData: normalizeWorldData({
      ...state.worldData,
      portals: updateEntityList(state.worldData.portals, id, (portal) => ({
        ...portal,
        ...updates
      }))
    })
  })),
  addTrigger: (trigger) => set((state) => {
    const nextTrigger = {
      id: `trigger_${Date.now()}`,
      name: trigger.name || 'Trigger',
      position: mergeVec3(trigger.position, [0, 1, 0]),
      rotation: mergeVec3(trigger.rotation, [0, 0, 0]),
      scale: mergeVec3(trigger.scale, [2, 2, 2]),
      type: trigger.type || 'proximity',
      actions: trigger.actions || [],
      cooldown: trigger.cooldown || 1
    }

    return withHistory(state, {
      worldData: normalizeWorldData({
        ...state.worldData,
        triggers: [...state.worldData.triggers, nextTrigger]
      }),
      selectedObjectId: nextTrigger.id
    })
  }),
  updateTrigger: (id, updates) => set((state) => withHistory(state, {
    worldData: normalizeWorldData({
      ...state.worldData,
      triggers: updateEntityList(state.worldData.triggers, id, (trigger) => ({
        ...trigger,
        ...updates
      }))
    })
  })),
  updateEntityTransform: (kind, id, transform) => set((state) => {
    const updateEntity = (entity) => ({
      ...entity,
      ...(transform.position ? { position: transform.position } : {}),
      ...(transform.rotation ? { rotation: transform.rotation } : {}),
      ...(transform.scale ? { scale: transform.scale } : {})
    })

    if (kind === 'object') {
      return withHistory(state, {
        worldData: normalizeWorldData({
          ...state.worldData,
          objects: updateEntityList(state.worldData.objects, id, updateEntity)
        })
      })
    }
    if (kind === 'spawn') {
      return withHistory(state, {
        worldData: normalizeWorldData({
          ...state.worldData,
          spawnPoints: updateEntityList(state.worldData.spawnPoints, id, updateEntity)
        })
      })
    }
    if (kind === 'portal') {
      return withHistory(state, {
        worldData: normalizeWorldData({
          ...state.worldData,
          portals: updateEntityList(state.worldData.portals, id, updateEntity)
        })
      })
    }
    if (kind === 'trigger') {
      return withHistory(state, {
        worldData: normalizeWorldData({
          ...state.worldData,
          triggers: updateEntityList(state.worldData.triggers, id, updateEntity)
        })
      })
    }
    return {}
  }),
  setEntityTransformLive: (kind, id, transform) => set((state) => {
    const updateEntity = (entity) => ({
      ...entity,
      ...(transform.position ? { position: transform.position } : {}),
      ...(transform.rotation ? { rotation: transform.rotation } : {}),
      ...(transform.scale ? { scale: transform.scale } : {})
    })

    if (kind === 'object') {
      return {
        worldData: normalizeWorldData({
          ...state.worldData,
          objects: updateEntityList(state.worldData.objects, id, updateEntity)
        })
      }
    }
    if (kind === 'spawn') {
      return {
        worldData: normalizeWorldData({
          ...state.worldData,
          spawnPoints: updateEntityList(state.worldData.spawnPoints, id, updateEntity)
        })
      }
    }
    if (kind === 'portal') {
      return {
        worldData: normalizeWorldData({
          ...state.worldData,
          portals: updateEntityList(state.worldData.portals, id, updateEntity)
        })
      }
    }
    if (kind === 'trigger') {
      return {
        worldData: normalizeWorldData({
          ...state.worldData,
          triggers: updateEntityList(state.worldData.triggers, id, updateEntity)
        })
      }
    }
    return {}
  }),
  addModelAsset: (asset) => set((state) => withHistory(state, {
    worldData: normalizeWorldData({
      ...state.worldData,
      assets: {
        ...state.worldData.assets,
        models: [...state.worldData.assets.models, asset]
      }
    })
  })),
  addShaderAsset: (shader) => set((state) => withHistory(state, {
    worldData: normalizeWorldData({
      ...state.worldData,
      shaders: [...state.worldData.shaders, shader]
    })
  })),
  removeEntity: (id) => set((state) => withHistory(state, {
    worldData: normalizeWorldData({
      ...state.worldData,
      objects: state.worldData.objects.filter((object) => object.id !== id),
      spawnPoints: state.worldData.spawnPoints.filter((object) => object.id !== id),
      portals: state.worldData.portals.filter((object) => object.id !== id),
      triggers: state.worldData.triggers.filter((object) => object.id !== id)
    }),
    selectedObjectId: state.selectedObjectId === id ? null : state.selectedObjectId
  })),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setShowGrid: (show) => set({ showGrid: show }),
  setSnapToGrid: (snap) => set({ snapToGrid: snap }),
  setGridSize: (size) => set({ gridSize: size }),
  setCameraView: (view) => set({ cameraView: view }),
  setTools: (tools) => set((state) => ({
    tools: { ...state.tools, ...tools }
  })),
  undo: () => set((state) => {
    if (state.undoStack.length === 0) return {}
    const previous = state.undoStack[state.undoStack.length - 1]
    return {
      worldData: previous.worldData,
      avatarData: previous.avatarData,
      selectedObjectId: previous.selectedObjectId,
      undoStack: state.undoStack.slice(0, -1),
      redoStack: [...state.redoStack, {
        worldData: clone(state.worldData),
        avatarData: clone(state.avatarData),
        selectedObjectId: state.selectedObjectId
      }]
    }
  }),
  redo: () => set((state) => {
    if (state.redoStack.length === 0) return {}
    const next = state.redoStack[state.redoStack.length - 1]
    return {
      worldData: next.worldData,
      avatarData: next.avatarData,
      selectedObjectId: next.selectedObjectId,
      redoStack: state.redoStack.slice(0, -1),
      undoStack: [...state.undoStack, {
        worldData: clone(state.worldData),
        avatarData: clone(state.avatarData),
        selectedObjectId: state.selectedObjectId
      }]
    }
  }),
  pushUndo: () => set((state) => ({
    undoStack: [...state.undoStack.slice(-49), {
      worldData: clone(state.worldData),
      avatarData: clone(state.avatarData),
      selectedObjectId: state.selectedObjectId
    }],
    redoStack: []
  })),
  exportWorld: () => JSON.stringify(get().worldData, null, 2),
  importWorld: (json) => {
    try {
      const data = normalizeWorldData(JSON.parse(json))
      set((state) => withHistory(state, {
        worldData: data,
        selectedObjectId: null,
        showGrid: data.environment.floor.grid
      }))
      return true
    } catch (error) {
      console.error('Failed to import world:', error)
      return false
    }
  },
  exportAvatar: () => JSON.stringify(get().avatarData, null, 2),
  importAvatar: (json) => {
    try {
      const data = normalizeAvatarData(JSON.parse(json))
      set((state) => withHistory(state, {
        avatarData: data
      }))
      return true
    } catch (error) {
      console.error('Failed to import avatar:', error)
      return false
    }
  },
  clearWorld: () => set((state) => withHistory(state, {
    worldData: {
      ...createDefaultWorldData(),
      environment: clone(state.worldData.environment)
    },
    selectedObjectId: null
  }))
}))

export default useVoltVerseCreatorStore
