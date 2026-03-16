import React, { useEffect, useMemo, useState, useCallback, useRef, Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import LZString from 'lz-string'
import { useStore } from './stores/voltverseStore'
import VoltVerseScene from './components/VoltVerseScene'
import VoltVerseUI from './components/VoltVerseUI'
import VoltVerseLoading from './components/VoltVerseLoading'
import { initializeNetworking, cleanupNetworking, broadcastAvatarUpdate, broadcastWorldState } from './utils/networking'
import { loadRoomFromFile, createDefaultRoom, saveRoomToFile, LOADING_PHASES } from './utils/roomFile'
import { setupAudioSystem } from './utils/audioSystem'
import './voltverse.css'

const compressVoltversePayload = (payload) => LZString.compressToEncodedURIComponent(JSON.stringify(payload))
const decompressVoltversePayload = (payload) => {
  const json = LZString.decompressFromEncodedURIComponent(payload)
  return json ? JSON.parse(json) : null
}

const VoltVerseActivity = ({ sdk, session, currentUser, activityDefinition }) => {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [mode, setMode] = useState('desktop')
  const containerRef = useRef(null)
  const canvasRef = useRef(null)

  const {
    setSDK,
    setCurrentUser,
    setRoomData,
    setConnected,
    setPlayers,
    addPlayer,
    setLocalPlayerId,
    setMode: setStoreMode,
    updateLoadingProgress,
    loadingState,
    loadingProgress
  } = useStore()

  const worldState = useStore((state) => state.worldState)
  const localAvatar = useStore((state) => state.localAvatar)
  const localPlayerId = useStore((state) => state.localPlayerId)

  useEffect(() => {
    if (!sdk) {
      updateLoadingProgress(LOADING_PHASES.ERROR, 0)
      setError('SDK not initialized')
      setIsLoading(false)
      return
    }

    const init = async () => {
      try {
        updateLoadingProgress(LOADING_PHASES.LOADING, 5)
        
        setSDK(sdk)
        setCurrentUser(currentUser)
        const localId = session?.id || currentUser?.id || 'local'
        setLocalPlayerId(localId)

        updateLoadingProgress(LOADING_PHASES.DECOMPRESSING, 15)
        await initializeNetworking(sdk)
        
        updateLoadingProgress(LOADING_PHASES.CONNECTING, 20)
        setConnected(true)

        let room = session?.roomData || createDefaultRoom()
        
        if (session?.roomFile) {
          updateLoadingProgress(LOADING_PHASES.LOADING, 25)
          
          room = await loadRoomFromFile(session.roomFile, (phase, progress) => {
            updateLoadingProgress(phase, progress)
          })
        }
        
        setRoomData(room)
        addPlayer({
          id: localId,
          name: currentUser?.displayName || currentUser?.username || 'You',
          status: 'Exploring',
          color: '#6366f1',
          position: room.spawnPoints?.[0]?.position || [0, 1.6, 5]
        })
        updateLoadingProgress(LOADING_PHASES.CONSTRUCTING, 95)
        
        await setupAudioSystem(sdk)

        updateLoadingProgress(LOADING_PHASES.READY, 100)
        
        setTimeout(() => {
          setIsLoading(false)
        }, 800)
      } catch (err) {
        console.error('[VoltVerse] Init error:', err)
        updateLoadingProgress(LOADING_PHASES.ERROR, 0)
        setError(err.message)
        setIsLoading(false)
      }
    }

    init()

    return () => {
      cleanupNetworking()
    }
  }, [sdk, session, currentUser, setSDK, setCurrentUser, setRoomData, setConnected, setPlayers, addPlayer, setLocalPlayerId, updateLoadingProgress])

  useEffect(() => {
    if (!sdk?.on || !sdk?.emitEvent || !currentUser?.id) return undefined
    const localUserId = session?.id || currentUser.id
    const syncGuard = { current: false }

    sdk.emitEvent('voltverse:join', {
      user: {
        id: localUserId,
        name: currentUser?.displayName || currentUser?.username || 'You',
        avatar: currentUser?.avatar || null
      }
    }, { serverRelay: true })
    sdk.emitEvent('voltverse:sync-request', { userId: localUserId }, { serverRelay: true })

    const offEvent = sdk.on('event', (evt = {}) => {
      const { eventType, payload = {}, userId } = evt
      if (!eventType || userId === localUserId) return

      if (eventType === 'voltverse:sync-request') {
        sdk.emitEvent('voltverse:sync-response', {
          targetUserId: payload.userId || null,
          snapshot: compressVoltversePayload({
            worldState: useStore.getState().worldState,
            avatars: Array.from(useStore.getState().avatars.entries())
          })
        }, { serverRelay: true })
        return
      }

      if (eventType === 'voltverse:sync-response') {
        if (payload.targetUserId && payload.targetUserId !== localUserId) return
        const decoded = decompressVoltversePayload(payload.snapshot || '')
        if (!decoded) return
        syncGuard.current = true
        if (decoded.worldState) useStore.getState().setWorldState(decoded.worldState)
        if (Array.isArray(decoded.avatars)) useStore.getState().setAvatars(new Map(decoded.avatars))
        queueMicrotask(() => { syncGuard.current = false })
        return
      }

      if (eventType === 'voltverse:world-state') {
        const decoded = decompressVoltversePayload(payload.snapshot || '')
        if (!decoded?.worldState) return
        syncGuard.current = true
        useStore.getState().setWorldState(decoded.worldState)
        queueMicrotask(() => { syncGuard.current = false })
        return
      }

      if (eventType === 'voltverse:avatar-state') {
        const decoded = decompressVoltversePayload(payload.snapshot || '')
        if (!decoded?.avatarData) return
        useStore.getState().updateAvatar(userId || payload.userId, decoded.avatarData)
        return
      }

      if (eventType === 'voltverse:player-state' && payload.position) {
        useStore.getState().updatePlayer(userId || payload.userId, {
          position: payload.position,
          rotation: payload.rotation || [0, 0, 0],
          status: payload.status || 'Exploring'
        })
      }
    })

    const unsubWorld = useStore.subscribe(
      (state) => state.worldState,
      (worldState) => {
        if (syncGuard.current) return
        sdk.emitEvent('voltverse:world-state', {
          snapshot: compressVoltversePayload({
            format: 'snapshot',
            compression: 'lz-string',
            worldState
          })
        }, { serverRelay: true })
      }
    )

    const unsubPlayers = useStore.subscribe(
      (state) => state.players.get(state.localPlayerId),
      (player) => {
        if (!player || syncGuard.current) return
        sdk.emitEvent('voltverse:player-state', {
          userId: localUserId,
          position: player.position,
          rotation: player.rotation || [0, 0, 0],
          status: player.status || 'Exploring'
        }, { serverRelay: true })
      }
    )

    const unsubAvatar = useStore.subscribe(
      (state) => state.localAvatar,
      (avatarData) => {
        if (!avatarData || syncGuard.current) return
        sdk.emitEvent('voltverse:avatar-state', {
          snapshot: compressVoltversePayload({
            format: 'snapshot',
            compression: 'lz-string',
            avatarData
          })
        }, { serverRelay: true })
      }
    )

    return () => {
      offEvent?.()
      unsubWorld?.()
      unsubPlayers?.()
      unsubAvatar?.()
      sdk.emitEvent('voltverse:leave', { userId: localUserId }, { serverRelay: true })
    }
  }, [currentUser, sdk, session])

  useEffect(() => {
    const checkVR = () => {
      if (navigator.xr) {
        navigator.xr.isSessionSupported('immersive-vr').then((supported) => {
          if (supported) {
            setMode('vr')
            setStoreMode('vr')
          }
        }).catch(() => {})
      }
    }

    checkVR()

    const handleVR = () => {
      setMode('vr')
      setStoreMode('vr')
    }

    window.addEventListener('vr:session-start', handleVR)
    return () => window.removeEventListener('vr:session-start', handleVR)
  }, [setStoreMode])

  const worldBroadcastTimeoutRef = useRef(null)

  useEffect(() => {
    if (!sdk || !worldState?.objects) return undefined
    if (worldBroadcastTimeoutRef.current) clearTimeout(worldBroadcastTimeoutRef.current)
    worldBroadcastTimeoutRef.current = setTimeout(() => {
      broadcastWorldState(worldState)
    }, 160)
    return () => {
      if (worldBroadcastTimeoutRef.current) clearTimeout(worldBroadcastTimeoutRef.current)
    }
  }, [sdk, worldState])

  useEffect(() => {
    if (!sdk || !localAvatar || !localPlayerId) return
    broadcastAvatarUpdate({ ...localAvatar, playerId: localPlayerId })
  }, [sdk, localAvatar, localPlayerId])

  const handleRoomFileLoad = useCallback(async (file) => {
    updateLoadingProgress(LOADING_PHASES.LOADING, 0)
    setIsLoading(true)
    
    try {
      const roomData = await loadRoomFromFile(file, (phase, progress) => {
        updateLoadingProgress(phase, progress)
      })
      
      setRoomData(roomData)
      sdk.emitEvent({ type: 'room:loaded', room: roomData.name })
      
      setIsLoading(false)
    } catch (err) {
      console.error('[VoltVerse] Room load error:', err)
      sdk.emitEvent({ type: 'error', message: 'Failed to load room file' })
      setIsLoading(false)
    }
  }, [sdk, setRoomData, updateLoadingProgress])

  const handleExportRoom = useCallback(async () => {
    const roomData = useStore.getState().roomData
    if (!roomData) return
    saveRoomToFile(roomData)
  }, [])

  if (isLoading || loadingState === LOADING_PHASES.CONSTRUCTING) {
    return <VoltVerseLoading />
  }

  if (error) {
    return (
      <div className="voltverse-error">
        <div className="error-content">
          <h2>VoltVerse Error</h2>
          <p>{error}</p>
          <button onClick={() => window.location.reload()}>Retry</button>
        </div>
      </div>
    )
  }

  return (
    <div className="voltverse-container" ref={containerRef}>
      <Canvas
        ref={canvasRef}
        vr
        ar
        shadows
        camera={{ fov: 75, near: 0.1, far: 1000, position: [0, 1.6, 5] }}
        gl={{ 
          antialias: true, 
          alpha: false,
          powerPreference: 'high-performance',
          xr: { referenceSpaceType: 'local-floor' }
        }}
        onCreated={({ gl }) => {
          gl.setClearColor('#1a1a2e')
          gl.shadowMap.enabled = true
          gl.shadowMap.type = 2
        }}
      >
        <Suspense fallback={null}>
          <VoltVerseScene mode={mode} />
        </Suspense>
      </Canvas>
      <VoltVerseUI 
        mode={mode} 
        onRoomFileLoad={handleRoomFileLoad}
        onExportRoom={handleExportRoom}
      />
    </div>
  )
}

export default VoltVerseActivity
