import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  RocketLaunchIcon,
  XMarkIcon,
  ShieldCheckIcon,
  ShieldExclamationIcon
} from '@heroicons/react/24/outline'
import { apiService } from '../services/apiService'
import { CLIENT_BUILTIN_ACTIVITIES, CLIENT_BUILTIN_BY_ID } from '../activities/builtin/definitions'
import { resolveActivityIconComponent } from '../activities/builtin/activityIconResolver'
import BuiltinActivityHost from '../activities/BuiltinActivityHost'
import { createVoltActivityGuard, createVoltUIVAS } from '../sdk/activities-sdk'
import { createVoiceSecurityGuard } from '../components/VoiceChannelUIVAS'
import { useAppStore } from '../store/useAppStore'
import './modals/Modal.css'
import '../assets/styles/ActivitiesPanel.css'

// Activities to filter out from server catalog (no real implementation)
const REDUNDANT_ACTIVITY_IDS = [
  'watch-together',
  'chess-in-the-park',
  'gartic-phone',
  'jam-live',
  'music-jam-live',
  'whiteboard-live'
]

const ActivitiesPanel = ({ socket, contextType, contextId, participantsCount = 0, buttonClassName = 'voice-control-btn' }) => {
  const { addActivity, removeActivity, setActiveActivities } = useAppStore()
  const ui = useMemo(() => createVoltUIVAS({ 
    defaultTab: 'discover',
    enableAnimations: true,
    animationDuration: 300
  }), [])
  const [uiState, setUiState] = useState(() => ui.getState())
  const [catalog, setCatalog] = useState([])
  const [sessions, setSessions] = useState([])
  const [activeBuiltinSession, setActiveBuiltinSession] = useState(null)
  const [pendingAction, setPendingAction] = useState(null)
  const pendingActionTimerRef = React.useRef(null)
  const [sessionOptions, setSessionOptions] = useState({
    p2pEnabled: true,
    p2pPreferred: true,
    soundEnabled: true,
    soundVolume: 0.8
  })
  // Defensive state for voice/call context safety
  const [voiceCallSafe, setVoiceCallSafe] = useState(true)
  const [degradedMode, setDegradedMode] = useState(false)
  const open = !!uiState.open
  const activeTab = uiState.activeTab || 'discover'
  const busy = !!uiState.busy
  const error = uiState.error || ''

  const clearPendingAction = useCallback(() => {
    if (pendingActionTimerRef.current) {
      clearTimeout(pendingActionTimerRef.current)
      pendingActionTimerRef.current = null
    }
    setPendingAction(null)
    setBusy(false)
  }, [setBusy])

  const guard = useMemo(() => createVoltActivityGuard({
    enabled: true,
    strict: false,
    maxInboundBytes: 96 * 1024,
    onFlag: (flag) => {
      ui.flagSecurity(flag)
      // Check if we should degrade due to security issues
      if (flag.severity === 'high') {
        setDegradedMode(true)
      }
    }
  }), [ui])

  // Voice-specific security guard for voice/call contexts
  const voiceGuard = useMemo(() => createVoiceSecurityGuard({
    maxVoicePacketsPerSecond: 60,
    maxVoicePacketSize: 96 * 1024,
    onFlag: (flag) => {
      ui.flagSecurity(flag)
      if (flag.severity === 'high') {
        setDegradedMode(true)
        ui.setVoiceContextSafe(false)
      }
    }
  }), [ui])

  // Combined security inspection for voice packets
  const inspectVoicePacket = useCallback((packet) => {
    // First run voice-specific inspection
    const voiceResult = voiceGuard.inspectVoicePacket(packet)
    if (!voiceResult.safe) {
      return voiceResult
    }
    // Then run general inspection
    return guard.inspectInboundPacket(packet)
  }, [voiceGuard, guard])

  const canUse = !!socket && !!contextId
  const contextLabel = contextType === 'call' ? 'call' : 'voice'

  // Monitor UIVAS voice/call context safety
  useEffect(() => {
    const checkSafety = () => {
      const state = ui.getState()
      const isVoiceSafe = state.voiceContextSafe !== false
      const isCallSafe = state.callContextSafe !== false
      const contextSafe = contextType === 'call' ? isCallSafe : isVoiceSafe
      
      if (!contextSafe && voiceCallSafe) {
        console.warn('[ActivitiesPanel] Voice/call context became unsafe, enabling degraded mode')
        setVoiceCallSafe(false)
        setDegradedMode(true)
      } else if (contextSafe && !voiceCallSafe) {
        setVoiceCallSafe(true)
      }
    }
    
    const off = ui.subscribe(checkSafety)
    return off
  }, [ui, contextType, voiceCallSafe])

  useEffect(() => {
    const off = ui.subscribe((next) => setUiState(next))
    return () => {
      off?.()
      ui.destroy()
    }
  }, [ui])

  const setOpen = useCallback((next) => {
    const current = ui.getState().open
    const value = typeof next === 'function' ? !!next(current) : !!next
    ui.setOpen(value)
  }, [ui])

  const setActiveTab = useCallback((tab) => ui.setTab(tab), [ui])
  const setBusy = useCallback((value) => ui.setBusy(value), [ui])
  const setError = useCallback((value) => ui.setError(value), [ui])

  const sessionsForContext = useMemo(
    () => sessions.filter(s => s?.id && s.contextType === contextType && s.contextId === contextId),
    [sessions, contextType, contextId]
  )
  const pendingLaunchId = pendingAction?.type === 'launch' ? pendingAction.id : null

  const mergedCatalog = useMemo(() => {
    // Filter out redundant server activities that don't have real implementations
    const filteredCatalog = catalog.filter(item => {
      if (!item || typeof item !== 'object') return false
      if (!item.id || typeof item.id !== 'string') return false
      const key = item.id?.replace('builtin:', '')?.replace('app:', '')
      return !REDUNDANT_ACTIVITY_IDS.includes(key)
    })
    const known = new Set(filteredCatalog.map(item => item.id).filter(Boolean))
    const extra = CLIENT_BUILTIN_ACTIVITIES.filter(item => item?.id && !known.has(item.id))
    return [...filteredCatalog, ...extra]
  }, [catalog])

  const catalogById = useMemo(
    () => Object.fromEntries(mergedCatalog.map(item => [item.id, item])),
    [mergedCatalog]
  )

  useEffect(() => {
    if (!open) return undefined

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKeyDown = (evt) => {
      if (evt.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, setOpen])

  // Sync sessions with store
  useEffect(() => {
    if (sessionsForContext.length > 0) {
      const activities = sessionsForContext.map(session => ({
        id: session.id,
        sessionId: session.id,
        activityId: session.activityId,
        activityName: session.activityName,
        contextType: session.contextType,
        contextId: session.contextId,
        participantCount: session.participantCount
      }))
      setActiveActivities(activities)
    } else {
      setActiveActivities([])
    }
  }, [sessionsForContext, setActiveActivities])

  useEffect(() => {
    if (!socket || !open || !contextId) return

    const onCatalog = (data = {}) => {
      const incoming = Array.isArray(data.items) ? data.items : []
      const safeItems = incoming.filter((item) => guard.inspectCatalogItem(item).safe)
      setCatalog(safeItems)
    }
    const onSessions = (data = {}) => {
      if (data.contextType !== contextType || data.contextId !== contextId) return
      const incoming = Array.isArray(data.sessions) ? data.sessions : []
      const safeSessions = incoming.filter((item) => guard.inspectInboundPacket(item).safe)
      setSessions(safeSessions)
      if (pendingLaunchId) {
        const launchedSession = safeSessions.find((session) => session?.activityId === pendingLaunchId)
        if (launchedSession && String(launchedSession.activityId || '').startsWith('builtin:')) {
          setActiveBuiltinSession(launchedSession)
        }
      }
      clearPendingAction()
    }
    const onSessionCreated = (data = {}) => {
      const createdSession = data.session || data
      if (createdSession.contextType !== contextType || createdSession.contextId !== contextId) return
      if (createdSession && String(createdSession.activityId || '').startsWith('builtin:')) {
        setActiveBuiltinSession(createdSession)
      }
      clearPendingAction()
      socket.emit('activity:get-sessions', { contextType, contextId })
    }
    const onSessionUpdated = (data = {}) => {
      if (data.contextType !== contextType || data.contextId !== contextId) return
      clearPendingAction()
      socket.emit('activity:get-sessions', { contextType, contextId })
    }
    const onSessionEnded = (data = {}) => {
      if (data.contextType !== contextType || data.contextId !== contextId) return
      clearPendingAction()
      socket.emit('activity:get-sessions', { contextType, contextId })
    }
    const onError = (payload = {}) => {
      clearPendingAction()
      setError(payload.error || 'Activities error')
    }
    const onDisconnect = () => {
      setError('Realtime connection lost. Activities are temporarily unavailable.')
      setSessions([])
      clearPendingAction()
    }
    const onConnect = () => {
      setError('')
      clearPendingAction()
      socket.emit('activity:list-catalog')
      socket.emit('activity:get-sessions', { contextType, contextId })
    }

    socket.on('activity:catalog', onCatalog)
    socket.on('activity:sessions', onSessions)
    socket.on('activity:session-created', onSessionCreated)
    socket.on('activity:session-updated', onSessionUpdated)
    socket.on('activity:session-ended', onSessionEnded)
    socket.on('activity:error', onError)
    socket.on('disconnect', onDisconnect)
    socket.on('connect', onConnect)

    socket.emit('activity:list-catalog')
    socket.emit('activity:get-sessions', { contextType, contextId })

    return () => {
      socket.off('activity:catalog', onCatalog)
      socket.off('activity:sessions', onSessions)
      socket.off('activity:session-created', onSessionCreated)
      socket.off('activity:session-updated', onSessionUpdated)
      socket.off('activity:session-ended', onSessionEnded)
      socket.off('activity:error', onError)
      socket.off('disconnect', onDisconnect)
      socket.off('connect', onConnect)
    }
  }, [socket, open, contextType, contextId, guard, setError, clearPendingAction, pendingLaunchId])

  useEffect(() => {
    if (!canUse && open) {
      setOpen(false)
    }
  }, [canUse, open, setOpen])

  useEffect(() => {
    if (!socket || !activeBuiltinSession?.id) return

    const onSessionEnded = (payload = {}) => {
      if (payload.sessionId === activeBuiltinSession.id) {
        setActiveBuiltinSession(null)
      }
    }

    socket.on('activity:session-ended', onSessionEnded)
    return () => socket.off('activity:session-ended', onSessionEnded)
  }, [socket, activeBuiltinSession?.id])

  useEffect(() => {
    if (!activeBuiltinSession?.id) return
    const refreshedSession = sessionsForContext.find((session) => session.id === activeBuiltinSession.id)
    if (refreshedSession) {
      setActiveBuiltinSession(refreshedSession)
    }
  }, [activeBuiltinSession?.id, sessionsForContext])

  useEffect(() => {
    if (!open) return
    apiService.getActivitiesCatalog().then(res => {
      const incoming = Array.isArray(res?.data?.items) ? res.data.items : []
      setCatalog(incoming.filter((item) => guard.inspectCatalogItem(item).safe))
    }).catch((err) => {
      if (err?.response?.status !== 404) {
        setError('Failed to load activities catalog')
      }
    })
  }, [open, guard, setError])

  const launchActivity = (activityId) => {
    if (!socket || !canUse || !activityId || typeof activityId !== 'string') return
    setError('')
    setBusy(true)
    setPendingAction({ type: 'launch', id: activityId })
    if (pendingActionTimerRef.current) clearTimeout(pendingActionTimerRef.current)
    pendingActionTimerRef.current = setTimeout(() => {
      setBusy(false)
      setPendingAction(null)
      setError('Activity start is taking longer than expected. Check your connection and try again.')
    }, 8000)
    socket.emit('activity:create-session', {
      contextType,
      contextId,
      activityId,
      activityDefinition: CLIENT_BUILTIN_BY_ID[activityId] || null,
      p2p: {
        enabled: sessionOptions.p2pEnabled,
        preferred: sessionOptions.p2pPreferred
      },
      sound: {
        enabled: sessionOptions.soundEnabled,
        volume: sessionOptions.soundVolume
      }
    })
    socket.emit('activity:get-sessions', { contextType, contextId })
    setActiveTab('sessions')
  }

  const joinSession = (sessionId) => {
    if (!socket || !sessionId || typeof sessionId !== 'string') return
    setError('')
    setBusy(true)
    setPendingAction({ type: 'join', id: sessionId })
    if (pendingActionTimerRef.current) clearTimeout(pendingActionTimerRef.current)
    pendingActionTimerRef.current = setTimeout(() => {
      setBusy(false)
      setPendingAction(null)
      setError('Joining the activity is taking longer than expected. Check your voice connection and try again.')
    }, 8000)
    const existingSession = sessionsForContext.find((session) => session.id === sessionId)
    if (existingSession && String(existingSession.activityId || '').startsWith('builtin:')) {
      setActiveBuiltinSession(existingSession)
    }
    socket.emit('activity:join-session', { sessionId })
    socket.emit('activity:get-sessions', { contextType, contextId })
  }

  const leaveSession = (sessionId) => {
    if (!socket || !sessionId || typeof sessionId !== 'string') return
    socket.emit('activity:leave-session', { sessionId })
    socket.emit('activity:get-sessions', { contextType, contextId })
  }

  useEffect(() => () => {
    if (pendingActionTimerRef.current) {
      clearTimeout(pendingActionTimerRef.current)
      pendingActionTimerRef.current = null
    }
  }, [])

  return (
    <div className="activities-launcher">
      <button
        className={`${buttonClassName} activities-btn ${open ? 'active' : ''}`}
        title="Activities"
        disabled={!canUse}
        onClick={() => setOpen(v => !v)}
      >
        <RocketLaunchIcon width={28} height={28} />
      </button>

      {open && (
        <div className="modal-overlay activities-modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal-content activities-modal" role="dialog" aria-modal="true" aria-label="Activities" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header activities-panel-header">
              <div>
                <h2>Activities</h2>
                <small>{contextLabel} • {participantsCount} participants</small>
              </div>
              <button className="modal-close activities-icon-btn" onClick={() => setOpen(false)} aria-label="Close activities">
                <XMarkIcon width={18} height={18} />
              </button>
            </div>

            <div className="activities-tabs">
              <button className={activeTab === 'discover' ? 'active' : ''} onClick={() => setActiveTab('discover')}>Discover</button>
              <button className={activeTab === 'sessions' ? 'active' : ''} onClick={() => setActiveTab('sessions')}>Live</button>
            </div>

            {error && <div className="activities-error">{error}</div>}
            {pendingAction && (
              <div className="activities-pending">
                {pendingAction.type === 'launch' ? 'Starting activity…' : 'Joining activity…'}
              </div>
            )}
            {degradedMode && (
              <div className="activities-error activities-degraded">
                <ShieldExclamationIcon width={16} height={16} />
                Running in degraded mode due to security issues. Some features may be limited.
              </div>
            )}
            {Array.isArray(uiState.securityFlags) && uiState.securityFlags.length > 0 && (
              <div className="activities-security">
                <div className="activities-security-head">
                  <strong><ShieldCheckIcon width={14} height={14} /> Security Guard</strong>
                  <button type="button" className="muted" onClick={() => ui.clearSecurityFlags()}>Clear</button>
                </div>
                <div className="activities-security-msg">
                  Blocked {uiState.securityFlags.length} suspicious payload{uiState.securityFlags.length === 1 ? '' : 's'} in this session.
                </div>
                <div className="activities-security-status">
                  <span className={`status-indicator ${voiceCallSafe ? 'safe' : 'unsafe'}`}>
                    <SpeakerWaveIcon width={12} height={12} />
                    {contextLabel}: {voiceCallSafe ? 'Safe' : 'Unsafe'}
                  </span>
                  <span className="status-indicator">
                    {contextType === 'call' ? 'Call' : 'Voice'} context: {voiceCallSafe ? 'OK' : 'Degraded'}
                  </span>
                </div>
              </div>
            )}

            {activeTab === 'discover' && (
              <div className="activities-list">
                <div className="activities-launch-options">
                  <label><input type="checkbox" checked={sessionOptions.p2pEnabled} onChange={e => setSessionOptions(prev => ({ ...prev, p2pEnabled: e.target.checked }))} /> P2P enabled</label>
                  <label><input type="checkbox" checked={sessionOptions.p2pPreferred} onChange={e => setSessionOptions(prev => ({ ...prev, p2pPreferred: e.target.checked }))} /> P2P preferred</label>
                  <label><input type="checkbox" checked={sessionOptions.soundEnabled} onChange={e => setSessionOptions(prev => ({ ...prev, soundEnabled: e.target.checked }))} /> Sound cues</label>
                </div>
                {mergedCatalog.filter(item => item?.id).map(item => (
                  <div key={item.id} className="activities-item">
                    <div className="activities-main">
                      <span className="activities-icon" aria-hidden>
                        {item.iconUrl ? (
                          <img src={item.iconUrl} alt="" className="activities-icon-image" />
                        ) : (
                          React.createElement(resolveActivityIconComponent(item), { className: 'activity-card-icon' })
                        )}
                      </span>
                      <div>
                        <div className="activities-title">{item.name || item.id}</div>
                        <div className="activities-subtitle">{item.description || 'No description'}</div>
                      </div>
                    </div>
                    <button disabled={busy} onClick={() => launchActivity(item.id)}>
                      {pendingAction?.type === 'launch' && pendingAction?.id === item.id ? 'Starting…' : 'Start'}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'sessions' && (
              <div className="activities-list">
                {sessionsForContext.length === 0 && <div className="activities-empty">No live activities in this {contextLabel}.</div>}
                {sessionsForContext.map(session => (
                  <div key={session.id} className="activities-item">
                    <div className="activities-main">
                      <span className="activities-icon" aria-hidden>
                        {React.createElement(resolveActivityIconComponent(catalogById[session.activityId] || session), { className: 'activity-card-icon' })}
                      </span>
                      <div>
                        <div className="activities-title">{session.activityName || session.activityId || 'Activity Session'}</div>
                        <div className="activities-subtitle">{session.participantCount || 0} joined</div>
                        <div className="activities-session-meta">
                          <span className="activities-badge">Live</span>
                          {session?.p2p?.enabled && <span className="activities-badge muted">P2P</span>}
                          {String(session.activityId || '').startsWith('builtin:') && <span className="activities-badge muted">Built-in</span>}
                        </div>
                      </div>
                    </div>
                    <div className="activities-actions">
                      <button disabled={busy} onClick={() => joinSession(session.id)}>
                        {pendingAction?.type === 'join' && pendingAction?.id === session.id ? 'Joining…' : 'Join'}
                      </button>
                      {String(session.activityId || '').startsWith('builtin:') && (
                        <button onClick={() => setActiveBuiltinSession(session)}>Open</button>
                      )}
                      <button className="muted" onClick={() => leaveSession(session.id)}>Leave</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeBuiltinSession && (
        <BuiltinActivityHost
          session={activeBuiltinSession}
          socket={socket}
          contextType={contextType}
          contextId={contextId}
          onClose={() => setActiveBuiltinSession(null)}
        />
      )}
    </div>
  )
}

export default ActivitiesPanel
