import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

const normalizeMaterial = (material = {}, source = {}) => ({
  type: material.type || source.materialType || (material.shader ? 'shader' : 'standard'),
  preset: material.preset || source.materialPreset || 'standard',
  color: material.color || source.color || '#6366f1',
  emissive: material.emissive || source.emissive || '#000000',
  emissiveIntensity: material.emissiveIntensity ?? source.emissiveIntensity ?? 0,
  roughness: material.roughness ?? source.roughness ?? 0.5,
  metalness: material.metalness ?? source.metalness ?? 0.1,
  opacity: material.opacity ?? source.opacity ?? 1,
  transparent: material.transparent ?? source.transparent ?? false,
  wireframe: material.wireframe ?? source.wireframe ?? false,
  shaderId: material.shaderId || source.shaderId || null,
  vertexShader: material.vertexShader || source.vertexShader || '',
  fragmentShader: material.fragmentShader || source.fragmentShader || '',
  uniforms: material.uniforms || source.uniforms || {}
})

const normalizeWorldObject = (obj = {}) => ({
  ...obj,
  type: obj.type || (obj.assetRef || obj.model?.assetRef ? 'model' : 'cube'),
  label: obj.label || obj.name || obj.type || 'Object',
  position: Array.isArray(obj.position) ? obj.position : [0, 0.5, 0],
  rotation: Array.isArray(obj.rotation) ? obj.rotation : [0, 0, 0],
  scale: Array.isArray(obj.scale) ? obj.scale : [1, 1, 1],
  material: normalizeMaterial(obj.material || {}, obj),
  model: {
    assetRef: obj.model?.assetRef || obj.assetRef || null,
    animationClip: obj.model?.animationClip || '',
    autoplay: obj.model?.autoplay ?? true,
    loop: obj.model?.loop ?? true,
    positionOffset: Array.isArray(obj.model?.positionOffset) ? obj.model.positionOffset : [0, 0, 0],
    rotationOffset: Array.isArray(obj.model?.rotationOffset) ? obj.model.rotationOffset : [0, 0, 0],
    scaleMultiplier: obj.model?.scaleMultiplier ?? 1
  }
})

const normalizeAvatarData = (avatar = {}) => ({
  schemaVersion: avatar.schemaVersion || 2,
  mode: avatar.mode || (avatar.model?.src || avatar.model?.embeddedData ? 'model' : 'procedural'),
  fallbackPreset: avatar.fallbackPreset || avatar.preset || 'human',
  procedural: avatar.procedural || {
    head: avatar.head,
    body: avatar.body,
    arms: avatar.arms,
    legs: avatar.legs,
    eyes: avatar.eyes,
    hair: avatar.hair,
    skin: avatar.skin
  },
  model: {
    assetId: avatar.model?.assetId || null,
    format: avatar.model?.format || null,
    src: avatar.model?.src || null,
    embeddedData: avatar.model?.embeddedData || null,
    scale: avatar.model?.scale ?? 1,
    positionOffset: avatar.model?.positionOffset || [0, 0, 0],
    rotationOffset: avatar.model?.rotationOffset || [0, 0, 0]
  },
  materials: avatar.materials || {},
  animations: avatar.animations || {}
})

const createWorldStateFromRoom = (roomData) => ({
  objects: (roomData?.objects || []).map((obj) => normalizeWorldObject(obj)),
  spawnPoints: roomData?.spawnPoints || roomData?.environment?.spawnPoints || [],
  portals: roomData?.portals || [],
  triggers: roomData?.triggers || []
})

const syncRoomWithWorldState = (roomData, worldState) => {
  if (!roomData) return roomData
  return {
    ...roomData,
    objects: worldState.objects,
    spawnPoints: worldState.spawnPoints,
    portals: worldState.portals,
    triggers: worldState.triggers
  }
}

const createEditorFlags = (mode) => ({
  editorMode: mode,
  levelEditorOpen: mode === 'level',
  avatarEditorOpen: mode === 'avatar',
  shaderEditorOpen: mode === 'shader'
})

const takeSnapshot = (state) => ({
  worldState: JSON.parse(JSON.stringify(state.worldState)),
  roomData: state.roomData ? JSON.parse(JSON.stringify(state.roomData)) : state.roomData,
  selectedObject: state.selectedObject ? JSON.parse(JSON.stringify(state.selectedObject)) : null
})

const withWorldSnapshot = (state, recipe) => {
  const snapshot = takeSnapshot(state)
  const result = recipe(state)
  return {
    ...result,
    undoStack: [...state.undoStack.slice(-49), snapshot],
    redoStack: []
  }
}

const useVoltVerseStore = create(
  subscribeWithSelector((set, get) => ({
    sdk: null,
    currentUser: null,
    localPlayerId: null,
    connected: false,
    loadingState: 'idle',
    loadingProgress: 0,
    loadingPhase: '',
    mode: 'desktop',
    roomData: null,
    players: new Map(),
    avatars: new Map(),
    localAvatar: null,
    loadedAssets: new Map(),
    worldState: {
      objects: [],
      spawnPoints: [],
      portals: [],
      triggers: []
    },
    editorMode: 'none',
    transformTool: 'move',
    selectedObject: null,
    clipboard: null,
    undoStack: [],
    redoStack: [],
    chatMessages: [],
    voiceChatActive: false,
    avatarEditorOpen: false,
    levelEditorOpen: false,
    shaderEditorOpen: false,
    settings: {
      graphics: 'high',
      vrScale: 1,
      micEnabled: true,
      audioInputDevice: null,
      audioOutputDevice: null,
      spatialAudio: true,
      haptics: true,
      locomotion: 'smooth',
      renderDistance: 100,
      shadowQuality: 'high',
      antiAliasing: true,
      bloom: true
    },
    setSDK: (sdk) => set({ sdk }),
    setCurrentUser: (user) => set({ currentUser: user }),
    setLocalPlayerId: (id) => set({ localPlayerId: id }),
    setConnected: (connected) => set({ connected }),
    setMode: (mode) => set({ mode }),
    setLoadingState: (state) => set({ loadingState: state }),
    setLoadingProgress: (progress) => set({ loadingProgress: progress }),
    setLoadingPhase: (phase) => set({ loadingPhase: phase }),
    updateLoadingProgress: (phase, progress) => set({
      loadingPhase: phase,
      loadingProgress: progress
    }),
    setRoomData: (dataOrUpdater) => set((state) => {
      const nextRoomData = typeof dataOrUpdater === 'function' ? dataOrUpdater(state.roomData) : dataOrUpdater
      return {
        roomData: nextRoomData,
        worldState: createWorldStateFromRoom(nextRoomData)
      }
    }),
    setPlayers: (players) => set({ players }),
    addPlayer: (player) => set((state) => {
      const newPlayers = new Map(state.players)
      newPlayers.set(player.id, player)
      return { players: newPlayers }
    }),
    removePlayer: (playerId) => set((state) => {
      const newPlayers = new Map(state.players)
      newPlayers.delete(playerId)
      return { players: newPlayers }
    }),
    updatePlayer: (playerId, updates) => set((state) => {
      const newPlayers = new Map(state.players)
      const player = newPlayers.get(playerId)
      if (player) {
        newPlayers.set(playerId, { ...player, ...updates })
      }
      return { players: newPlayers }
    }),
    setLocalPlayerPosition: (position) => set((state) => {
      if (!state.localPlayerId) return {}
      const newPlayers = new Map(state.players)
      const currentPlayer = newPlayers.get(state.localPlayerId)
      if (!currentPlayer) return {}
      newPlayers.set(state.localPlayerId, { ...currentPlayer, position })
      return { players: newPlayers }
    }),
    setAvatars: (avatars) => set({
      avatars: new Map(Array.from(avatars.entries()).map(([playerId, avatar]) => [playerId, normalizeAvatarData(avatar)]))
    }),
    setLocalAvatar: (avatar) => set({ localAvatar: normalizeAvatarData(avatar) }),
    updateAvatar: (playerId, updates) => set((state) => {
      const newAvatars = new Map(state.avatars)
      const avatar = newAvatars.get(playerId) || {}
      newAvatars.set(playerId, normalizeAvatarData({
        ...avatar,
        ...updates,
        procedural: updates.procedural ? { ...(avatar.procedural || {}), ...updates.procedural } : avatar.procedural,
        model: updates.model ? { ...(avatar.model || {}), ...updates.model } : avatar.model
      }))
      return { avatars: newAvatars }
    }),
    addLoadedAsset: (id, asset) => set((state) => {
      const newAssets = new Map(state.loadedAssets)
      newAssets.set(id, asset)
      return { loadedAssets: newAssets }
    }),
    setWorldState: (worldState) => set((state) => ({
      worldState: {
        ...worldState,
        objects: (worldState.objects || []).map((obj) => normalizeWorldObject(obj))
      },
      roomData: syncRoomWithWorldState(state.roomData, {
        ...worldState,
        objects: (worldState.objects || []).map((obj) => normalizeWorldObject(obj))
      })
    })),
    addWorldObject: (obj) => set((state) => withWorldSnapshot(state, (current) => {
      const object = normalizeWorldObject({
        id: obj.id || `obj_${Date.now()}`,
        ...obj
      })
      const worldState = {
        ...current.worldState,
        objects: [...current.worldState.objects, object]
      }
      return {
        worldState,
        roomData: syncRoomWithWorldState(current.roomData, worldState),
        selectedObject: object
      }
    })),
    updateWorldObject: (id, updates) => set((state) => withWorldSnapshot(state, (current) => {
      let selectedObject = current.selectedObject
      const worldState = {
        ...current.worldState,
        objects: current.worldState.objects.map((o) => {
          if (o.id !== id) return o
          const nextObject = normalizeWorldObject({
            ...o,
            ...updates,
            material: updates.material ? { ...o.material, ...updates.material } : o.material,
            model: updates.model ? { ...o.model, ...updates.model } : o.model
          })
          if (selectedObject?.id === id) selectedObject = nextObject
          return nextObject
        })
      }
      return {
        worldState,
        roomData: syncRoomWithWorldState(current.roomData, worldState),
        selectedObject
      }
    })),
    removeWorldObject: (id) => set((state) => withWorldSnapshot(state, (current) => {
      const worldState = {
        ...current.worldState,
        objects: current.worldState.objects.filter((o) => o.id !== id)
      }
      return {
        worldState,
        roomData: syncRoomWithWorldState(current.roomData, worldState),
        selectedObject: current.selectedObject?.id === id ? null : current.selectedObject
      }
    })),
    duplicateWorldObject: (id) => set((state) => withWorldSnapshot(state, (current) => {
      const source = current.worldState.objects.find((obj) => obj.id === id)
      if (!source) return {}
      const duplicate = normalizeWorldObject({
        ...source,
        id: `obj_${Date.now()}`,
        label: `${source.label || source.type} Copy`,
        position: [
          (source.position?.[0] || 0) + 1,
          source.position?.[1] || 0,
          source.position?.[2] || 0
        ]
      })
      const worldState = {
        ...current.worldState,
        objects: [...current.worldState.objects, duplicate]
      }
      return {
        worldState,
        roomData: syncRoomWithWorldState(current.roomData, worldState),
        selectedObject: duplicate
      }
    })),
    addSpawnPoint: (point) => set((state) => withWorldSnapshot(state, (current) => {
      const spawn = {
        id: point.id || `spawn_${Date.now()}`,
        name: point.name || 'Spawn',
        position: point.position || [0, 0, 0],
        rotation: point.rotation || [0, 0, 0]
      }
      const worldState = {
        ...current.worldState,
        spawnPoints: [...current.worldState.spawnPoints, spawn]
      }
      return {
        worldState,
        roomData: syncRoomWithWorldState(current.roomData, worldState),
        selectedObject: { ...spawn, entityType: 'spawn' }
      }
    })),
    addPortal: (portal) => set((state) => withWorldSnapshot(state, (current) => {
      const nextPortal = {
        id: portal.id || `portal_${Date.now()}`,
        label: portal.label || 'Portal',
        position: portal.position || [0, 1.5, -4],
        rotation: portal.rotation || [0, 0, 0],
        scale: portal.scale || [2, 3, 0.1],
        color: portal.color || '#00ffff',
        destination: portal.destination || null
      }
      const worldState = {
        ...current.worldState,
        portals: [...current.worldState.portals, nextPortal]
      }
      return {
        worldState,
        roomData: syncRoomWithWorldState(current.roomData, worldState),
        selectedObject: { ...nextPortal, entityType: 'portal' }
      }
    })),
    addTrigger: (trigger) => set((state) => withWorldSnapshot(state, (current) => {
      const nextTrigger = {
        id: trigger.id || `trigger_${Date.now()}`,
        label: trigger.label || 'Trigger',
        position: trigger.position || [0, 1, -2],
        scale: trigger.scale || [2, 2, 2],
        type: trigger.type || 'proximity',
        cooldown: trigger.cooldown || 1,
        actions: trigger.actions || []
      }
      const worldState = {
        ...current.worldState,
        triggers: [...current.worldState.triggers, nextTrigger]
      }
      return {
        worldState,
        roomData: syncRoomWithWorldState(current.roomData, worldState),
        selectedObject: { ...nextTrigger, entityType: 'trigger' }
      }
    })),
    setEditorMode: (mode) => set(createEditorFlags(mode)),
    setTransformTool: (transformTool) => set({ transformTool }),
    setSelectedObject: (obj) => set({ selectedObject: obj }),
    setClipboard: (obj) => set({ clipboard: obj }),
    pushUndo: () => set((state) => ({
      undoStack: [...state.undoStack.slice(-49), takeSnapshot(state)],
      redoStack: []
    })),
    undo: () => set((state) => {
      if (state.undoStack.length === 0) return state
      const snapshot = state.undoStack[state.undoStack.length - 1]
      return {
        worldState: snapshot.worldState,
        roomData: snapshot.roomData,
        selectedObject: snapshot.selectedObject,
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, takeSnapshot(state)]
      }
    }),
    redo: () => set((state) => {
      if (state.redoStack.length === 0) return state
      const snapshot = state.redoStack[state.redoStack.length - 1]
      return {
        worldState: snapshot.worldState,
        roomData: snapshot.roomData,
        selectedObject: snapshot.selectedObject,
        redoStack: state.redoStack.slice(0, -1),
        undoStack: [...state.undoStack, takeSnapshot(state)]
      }
    }),
    addChatMessage: (msg) => set((state) => ({
      chatMessages: [...state.chatMessages.slice(-99), msg]
    })),
    setVoiceChatActive: (active) => set({ voiceChatActive: active }),
    setAvatarEditorOpen: (open) => set(createEditorFlags(open ? 'avatar' : 'none')),
    setLevelEditorOpen: (open) => set(createEditorFlags(open ? 'level' : 'none')),
    setShaderEditorOpen: (open) => set(createEditorFlags(open ? 'shader' : 'none')),
    updateSettings: (settings) => set((state) => ({
      settings: { ...state.settings, ...settings }
    }))
  }))
)

export const useStore = useVoltVerseStore

export default useVoltVerseStore
