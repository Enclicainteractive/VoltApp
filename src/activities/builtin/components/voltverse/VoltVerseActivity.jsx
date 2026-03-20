/**
 * VoltVerseActivity.jsx  –  3D Social Platform
 *
 * Architecture (aligned with VoltCraft UI engine):
 *  • Canvas WITHOUT vr/ar props → avoids t.xr.getEnvironmentBlendMode crash
 *  • HUD rendered OUTSIDE the Canvas via React createPortal → no R3F conflicts
 *  • WebGLErrorBoundary wraps Canvas for graceful error recovery
 *  • gl options match VoltCraft: antialias:false, powerPreference:'high-performance'
 *  • shadows:false on Canvas (shadow config handled per-light inside scene)
 */
import React, { useEffect, useMemo, useState, useCallback, useRef, Suspense } from 'react'
import { createPortal } from 'react-dom'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import LZString from 'lz-string'
import { useStore } from './stores/voltverseStore'
import VoltVerseScene from './components/VoltVerseScene'
import VoltVerseLoading from './components/VoltVerseLoading'
import { initializeNetworking, cleanupNetworking, broadcastAvatarUpdate, broadcastWorldState } from './utils/networking'
import { loadRoomFromFile, createDefaultRoom, saveRoomToFile, receiveRoomChunked, requestRoomFromHost, LOADING_PHASES } from './utils/roomFile'
import { setupAudioSystem } from './utils/audioSystem'
import './voltverse.css'

// ─── Compression helpers ──────────────────────────────────────────────────────
const compressVoltversePayload = (payload) =>
  LZString.compressToEncodedURIComponent(JSON.stringify(payload))

const decompressVoltversePayload = (payload) => {
  const json = LZString.decompressFromEncodedURIComponent(payload)
  return json ? JSON.parse(json) : null
}

// ─── WebGL Error Boundary (same pattern as VoltCraft) ────────────────────────
class WebGLErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { err: null } }
  static getDerivedStateFromError(e) { return { err: e } }
  render() {
    if (this.state.err) return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100%', background: '#1a1a2e',
        color: '#fff', gap: 12, padding: 24, fontFamily: 'monospace'
      }}>
        <div style={{ fontSize: 28 }}>⚡</div>
        <div style={{ fontSize: 18, fontWeight: 'bold' }}>VoltVerse – WebGL Error</div>
        <div style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', maxWidth: 320 }}>
          {this.state.err?.message || 'WebGL context could not be created.'}
        </div>
        <button
          onClick={() => this.setState({ err: null })}
          style={{ padding: '8px 20px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
        >
          Retry
        </button>
      </div>
    )
    return this.props.children
  }
}

// ─── VoltVerse HUD – rendered OUTSIDE Canvas via React portal ─────────────────
const VoltVerseHUD = ({
  connected, players, localPlayerId, voiceChatActive,
  editorMode, chatMessages, chatInput, setChatInput,
  onSendChat, onMicToggle, onFileLoad, onExportRoom,
  onUndo, onRedo, onSetEditorMode, onAddObject,
  containerRef, fileInputRef,
}) => {
  if (!containerRef.current) return null

  const localPlayer = players.get(localPlayerId)

  const hud = (
    <div style={{
      position: 'absolute', inset: 0, pointerEvents: 'none',
      zIndex: 10, overflow: 'hidden',
      fontFamily: 'system-ui,-apple-system,sans-serif'
    }}>
      {/* ── Top bar ── */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px',
        background: 'rgba(13,17,23,0.88)',
        borderBottom: '1px solid #1f2937',
        pointerEvents: 'auto'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 16, fontWeight: 'bold', color: '#8b5cf6' }}>⚡ VoltVerse</span>
          <span style={{
            fontSize: 11, padding: '2px 8px', borderRadius: 10,
            background: connected ? '#14532d' : '#7f1d1d',
            color: connected ? '#4ade80' : '#f87171'
          }}>
            {connected ? `${players.size} Online` : 'Connecting...'}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={onMicToggle}
            style={{
              padding: '4px 10px', background: voiceChatActive ? '#1d4ed8' : '#1f2937',
              color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer'
            }}
          >
            {voiceChatActive ? '🎤 Muted' : '🎤 Mic'}
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{ padding: '4px 10px', background: '#1f2937', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
          >
            📂 Load
          </button>
          <button
            onClick={onExportRoom}
            style={{ padding: '4px 10px', background: '#1f2937', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
          >
            💾 Save
          </button>
          <button
            onClick={onUndo}
            style={{ padding: '4px 10px', background: '#1f2937', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
          >
            ↩ Undo
          </button>
          <button
            onClick={onRedo}
            style={{ padding: '4px 10px', background: '#1f2937', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
          >
            ↪ Redo
          </button>
        </div>

        <div style={{
          fontSize: 11, padding: '3px 10px', borderRadius: 4,
          background: editorMode !== 'none' ? '#312e81' : '#1f2937',
          color: editorMode !== 'none' ? '#a5b4fc' : '#6b7280'
        }}>
          {editorMode === 'none' ? 'PLAY MODE' : `${editorMode.toUpperCase()} MODE`}
        </div>
      </div>

      {/* ── Left toolbar (editor mode buttons) ── */}
      <div style={{
        position: 'absolute', top: 52, left: 12,
        display: 'flex', flexDirection: 'column', gap: 6,
        pointerEvents: 'auto'
      }}>
        {[
          { mode: 'level', label: '🏗', title: 'Level Editor (Ctrl+G)' },
          { mode: 'avatar', label: '👤', title: 'Avatar Editor (Ctrl+E)' },
          { mode: 'shader', label: '✨', title: 'Shader Editor' },
        ].map(({ mode, label, title }) => (
          <button
            key={mode}
            onClick={() => onSetEditorMode(editorMode === mode ? 'none' : mode)}
            title={title}
            style={{
              width: 38, height: 38,
              background: editorMode === mode ? '#4f46e5' : 'rgba(13,17,23,0.88)',
              border: `1px solid ${editorMode === mode ? '#6366f1' : '#1f2937'}`,
              borderRadius: 6, color: '#fff', fontSize: 18, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Level editor object palette ── */}
      {editorMode === 'level' && (
        <div style={{
          position: 'absolute', top: 52, left: 60,
          width: 180,
          background: 'rgba(13,17,23,0.92)',
          border: '1px solid #1f2937',
          borderRadius: 8, padding: 10,
          pointerEvents: 'auto', color: '#f9fafb'
        }}>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>Add Object</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
            {['cube', 'sphere', 'cylinder', 'cone', 'portal', 'trigger', 'spawn'].map(type => (
              <button
                key={type}
                onClick={() => onAddObject(type)}
                style={{
                  padding: '5px 4px', background: '#1f2937', color: '#e5e7eb',
                  border: '1px solid #374151', borderRadius: 4, fontSize: 11,
                  cursor: 'pointer', textAlign: 'center'
                }}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>
          <div style={{ marginTop: 8, fontSize: 10, color: '#4b5563', lineHeight: 1.5 }}>
            W move · R rotate · T scale<br />
            Del delete · Ctrl+D duplicate
          </div>
        </div>
      )}

      {/* ── Player list (right side) ── */}
      <div style={{
        position: 'absolute', top: 52, right: 12,
        width: 180,
        background: 'rgba(13,17,23,0.88)',
        border: '1px solid #1f2937',
        borderRadius: 8, padding: 10,
        pointerEvents: 'auto', color: '#f9fafb'
      }}>
        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>
          Players ({players.size})
        </div>
        {Array.from(players.values()).map(player => (
          <div key={player.id} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '4px 0',
            borderBottom: '1px solid #1f2937'
          }}>
            <div style={{
              width: 10, height: 10, borderRadius: '50%',
              background: player.color || '#6366f1', flexShrink: 0
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: player.id === localPlayerId ? 'bold' : 'normal', truncate: true, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {player.name || 'Unknown'}{player.id === localPlayerId ? ' (You)' : ''}
              </div>
              {localPlayer?.position && player.id === localPlayerId && (
                <div style={{ fontSize: 10, color: '#6b7280' }}>
                  {localPlayer.position.map(v => Math.round(v)).join(', ')}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── Chat panel (bottom-left) ── */}
      <div style={{
        position: 'absolute', bottom: 12, left: 12,
        width: 280,
        background: 'rgba(13,17,23,0.88)',
        border: '1px solid #1f2937',
        borderRadius: 8, overflow: 'hidden',
        pointerEvents: 'auto'
      }}>
        <div style={{
          maxHeight: 120, overflowY: 'auto',
          padding: '6px 10px',
          display: 'flex', flexDirection: 'column', gap: 3
        }}>
          {chatMessages.slice(-20).map(msg => (
            <div key={msg.id} style={{ fontSize: 12, color: '#e5e7eb' }}>
              <span style={{ color: '#8b5cf6', fontWeight: 'bold' }}>{msg.sender}: </span>
              <span>{msg.content}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', borderTop: '1px solid #1f2937' }}>
          <input
            type="text"
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onSendChat()}
            placeholder="Chat..."
            style={{
              flex: 1, padding: '6px 10px', background: 'transparent',
              border: 'none', color: '#f9fafb', fontSize: 12, outline: 'none'
            }}
          />
          <button
            onClick={onSendChat}
            style={{
              padding: '6px 12px', background: '#4f46e5', color: '#fff',
              border: 'none', fontSize: 12, cursor: 'pointer'
            }}
          >
            ➤
          </button>
        </div>
      </div>

      {/* ── Controls hint (bottom-center) ── */}
      <div style={{
        position: 'absolute', bottom: 12, left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(13,17,23,0.75)',
        border: '1px solid #1f2937',
        borderRadius: 6, padding: '4px 14px',
        fontSize: 11, color: '#6b7280',
        whiteSpace: 'nowrap', pointerEvents: 'none'
      }}>
        Click scene to look · WASD move · Ctrl+G level editor · Ctrl+E avatar editor
      </div>
    </div>
  )

  return createPortal(hud, containerRef.current)
}

// ─── Main component ───────────────────────────────────────────────────────────
const VoltVerseActivity = ({ sdk, session, currentUser, activityDefinition }) => {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [chatInput, setChatInput] = useState('')
  const containerRef = useRef(null)
  const fileInputRef = useRef(null)

  const {
    setSDK,
    setCurrentUser,
    setRoomData,
    setConnected,
    setPlayers,
    addPlayer,
    setLocalPlayerId,
    updateLoadingProgress,
    loadingState,
    loadingProgress,
    connected,
    players,
    localPlayerId,
    voiceChatActive,
    editorMode,
    chatMessages,
    setVoiceChatActive,
    setEditorMode,
    addWorldObject,
    addSpawnPoint,
    addPortal,
    addTrigger,
    undo,
    redo,
    addChatMessage,
  } = useStore()

  const worldState = useStore((state) => state.worldState)
  const localAvatar = useStore((state) => state.localAvatar)

  // ── Init ──────────────────────────────────────────────────────────────────
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
        setTimeout(() => setIsLoading(false), 800)
      } catch (err) {
        console.error('[VoltVerse] Init error:', err)
        updateLoadingProgress(LOADING_PHASES.ERROR, 0)
        setError(err.message)
        setIsLoading(false)
      }
    }

    init()
    return () => { cleanupNetworking() }
  }, [sdk, session, currentUser, setSDK, setCurrentUser, setRoomData, setConnected, setPlayers, addPlayer, setLocalPlayerId, updateLoadingProgress])

  // ── Multiplayer sync ──────────────────────────────────────────────────────
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
            avatars: Array.from(useStore.getState().avatars.entries()),
            players: Array.from(useStore.getState().players.entries())
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
        if (Array.isArray(decoded.players)) useStore.getState().setPlayers(new Map(decoded.players))
        queueMicrotask(() => { syncGuard.current = false })
        return
      }

      if (eventType === 'voltverse:join') {
        const remoteUser = payload.user || {}
        const remoteId = remoteUser.id || userId || payload.userId
        if (!remoteId || remoteId === localUserId) return
        useStore.getState().addPlayer({
          id: remoteId,
          name: remoteUser.name || remoteUser.username || 'Explorer',
          status: 'Exploring',
          avatar: remoteUser.avatar || null,
          color: '#6366f1',
          position: remoteUser.position || [0, 1.6, 5],
          rotation: remoteUser.rotation || [0, 0, 0]
        })
        return
      }

      if (eventType === 'voltverse:leave') {
        const remoteId = payload.userId || userId
        if (!remoteId || remoteId === localUserId) return
        useStore.getState().removePlayer(remoteId)
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
      (ws) => {
        if (syncGuard.current) return
        sdk.emitEvent('voltverse:world-state', {
          snapshot: compressVoltversePayload({ format: 'snapshot', compression: 'lz-string', worldState: ws })
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
          snapshot: compressVoltversePayload({ format: 'snapshot', compression: 'lz-string', avatarData })
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

  // ── Chunked room receiver – auto-loads .voltroom broadcast from creator ──
  useEffect(() => {
    if (!sdk?.on) return
    const offReceive = receiveRoomChunked(
      sdk,
      (roomData) => {
        // A creator has broadcast a new world – load it for all players
        setRoomData(roomData)
        addChatMessage({
          id: Date.now(),
          sender: '⚡ VoltVerse',
          content: `World "${roomData.name || 'New World'}" loaded from session.`,
          timestamp: new Date().toISOString()
        })
      },
      (msg) => {
        // Show receive progress in chat
        addChatMessage({
          id: `recv_${Date.now()}`,
          sender: '📡',
          content: msg,
          timestamp: new Date().toISOString()
        })
      }
    )
    // Request room from host on join
    const localId = session?.id || currentUser?.id || 'local'
    requestRoomFromHost(sdk, localId)
    return offReceive
  }, [sdk, session, currentUser, setRoomData, addChatMessage])

  // ── World broadcast (debounced) ───────────────────────────────────────────
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

  // ── Room file load / export ───────────────────────────────────────────────
  const handleRoomFileLoad = useCallback(async (file) => {
    updateLoadingProgress(LOADING_PHASES.LOADING, 0)
    setIsLoading(true)
    try {
      const roomData = await loadRoomFromFile(file, (phase, progress) => {
        updateLoadingProgress(phase, progress)
      })
      setRoomData(roomData)
      sdk?.emitEvent?.({ type: 'room:loaded', room: roomData.name })
      setIsLoading(false)
    } catch (err) {
      console.error('[VoltVerse] Room load error:', err)
      sdk?.emitEvent?.({ type: 'error', message: 'Failed to load room file' })
      setIsLoading(false)
    }
  }, [sdk, setRoomData, updateLoadingProgress])

  const handleExportRoom = useCallback(async () => {
    const roomData = useStore.getState().roomData
    if (!roomData) return
    saveRoomToFile(roomData)
  }, [])

  const handleFileSelect = useCallback((e) => {
    const file = e.target.files?.[0]
    if (file) handleRoomFileLoad(file)
  }, [handleRoomFileLoad])

  // ── Chat ──────────────────────────────────────────────────────────────────
  const handleSendChat = useCallback(() => {
    if (!chatInput.trim()) return
    addChatMessage({ id: Date.now(), sender: 'You', content: chatInput, timestamp: new Date().toISOString() })
    setChatInput('')
  }, [chatInput, addChatMessage])

  // ── Add object ────────────────────────────────────────────────────────────
  const handleAddObject = useCallback((type) => {
    if (type === 'spawn') { addSpawnPoint({ position: [0, 0, -2] }); return }
    if (type === 'portal') { addPortal({}); return }
    if (type === 'trigger') { addTrigger({ actions: [{ type: 'message', message: 'Trigger activated' }] }); return }
    addWorldObject({ type, label: type.charAt(0).toUpperCase() + type.slice(1) })
  }, [addPortal, addSpawnPoint, addTrigger, addWorldObject])

  // ── Loading screen ────────────────────────────────────────────────────────
  if (isLoading || loadingState === LOADING_PHASES.CONSTRUCTING) {
    return <VoltVerseLoading />
  }

  if (error) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100%', background: '#1a1a2e',
        color: '#fff', gap: 12, padding: 24, fontFamily: 'monospace'
      }}>
        <div style={{ fontSize: 28 }}>⚡</div>
        <div style={{ fontSize: 18, fontWeight: 'bold' }}>VoltVerse Error</div>
        <div style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', maxWidth: 320 }}>{error}</div>
        <button
          onClick={() => window.location.reload()}
          style={{ padding: '8px 20px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', background: '#1a1a2e', position: 'relative' }}
    >
      {/* ── 3D Canvas (NO vr/ar props → avoids getEnvironmentBlendMode crash) ── */}
      <WebGLErrorBoundary>
        <Canvas
          shadows={false}
          gl={{
            antialias: false,
            powerPreference: 'high-performance',
            failIfMajorPerformanceCaveat: false
          }}
          camera={{ fov: 75, near: 0.1, far: 1000, position: [0, 1.6, 5] }}
          dpr={1}
          frameloop="always"
          style={{ position: 'absolute', inset: 0 }}
          onCreated={({ gl }) => {
            gl.setClearColor('#1a1a2e')
          }}
        >
          <Suspense fallback={null}>
            <VoltVerseScene mode="desktop" />
          </Suspense>
        </Canvas>
      </WebGLErrorBoundary>

      {/* ── HUD is a regular React portal OUTSIDE the Canvas (VoltCraft pattern) ── */}
      <VoltVerseHUD
        connected={connected}
        players={players}
        localPlayerId={localPlayerId}
        voiceChatActive={voiceChatActive}
        editorMode={editorMode}
        chatMessages={chatMessages}
        chatInput={chatInput}
        setChatInput={setChatInput}
        onSendChat={handleSendChat}
        onMicToggle={() => setVoiceChatActive(!voiceChatActive)}
        onFileLoad={handleRoomFileLoad}
        onExportRoom={handleExportRoom}
        onUndo={undo}
        onRedo={redo}
        onSetEditorMode={setEditorMode}
        onAddObject={handleAddObject}
        containerRef={containerRef}
        fileInputRef={fileInputRef}
      />

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".voltroom,.json"
        style={{ display: 'none' }}
        onChange={handleFileSelect}
      />
    </div>
  )
}

export default VoltVerseActivity
