import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react'

const MAX_READY_ENTRIES = 256
const READY_TIMEOUT_MS = 60000
const SYNC_INTERVAL_MS = 10000
const DISCONNECT_GRACE_MS = 5000

// ─── Inline SVG Icons ────────────────────────────────────────────────────────

const CheckCircleIcon = ({ size = 16, className = '' }) => (
  <svg
    width={size} height={size} viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
    className={className} aria-hidden="true"
  >
    <circle cx="12" cy="12" r="10" />
    <path d="M9 12l2 2 4-4" />
  </svg>
)

const CircleIcon = ({ size = 16, className = '' }) => (
  <svg
    width={size} height={size} viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
    className={className} aria-hidden="true"
  >
    <circle cx="12" cy="12" r="10" />
  </svg>
)

const ClockIcon = ({ size = 24, className = '' }) => (
  <svg
    width={size} height={size} viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
    className={className} aria-hidden="true"
  >
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
)

const UserIcon = ({ size = 16, className = '' }) => (
  <svg
    width={size} height={size} viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
    className={className} aria-hidden="true"
  >
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
)

const ShieldCheckIcon = ({ size = 20, className = '' }) => (
  <svg
    width={size} height={size} viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
    className={className} aria-hidden="true"
  >
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
)

const DisconnectIcon = ({ size = 16, className = '' }) => (
  <svg
    width={size} height={size} viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
    className={className} aria-hidden="true"
  >
    <path d="M18.36 5.64a9 9 0 0 1 0 12.73" />
    <path d="M5.64 18.36a9 9 0 0 1 0-12.73" />
    <line x1="2" y1="2" x2="22" y2="22" />
  </svg>
)

// ─── Sound Manager ───────────────────────────────────────────────────────────

const createReadyCheckSoundManager = () => {
  let audioContext = null
  let masterGain = null
  let inited = false
  let muted = false

  const initAudio = () => {
    if (inited) return
    inited = true
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)()
      masterGain = audioContext.createGain()
      masterGain.connect(audioContext.destination)
      masterGain.gain.value = 0.2
    } catch (e) {
      console.warn('[ReadyCheck] Audio not available:', e)
    }
  }

  const playTone = (frequency, duration, type = 'sine', volume = 0.25) => {
    if (!audioContext || muted) return
    try {
      if (audioContext.state === 'suspended') audioContext.resume()
      const osc = audioContext.createOscillator()
      const gain = audioContext.createGain()
      osc.type = type
      osc.frequency.setValueAtTime(frequency, audioContext.currentTime)
      gain.gain.setValueAtTime(volume, audioContext.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration)
      osc.connect(gain)
      gain.connect(masterGain)
      osc.start()
      osc.stop(audioContext.currentTime + duration)
    } catch (e) { /* ignore audio errors */ }
  }

  return {
    init: initAudio,
    readyUp: () => {
      playTone(660, 0.12, 'sine', 0.25)
      setTimeout(() => playTone(880, 0.15, 'sine', 0.2), 80)
    },
    unready: () => {
      playTone(440, 0.15, 'sine', 0.15)
      setTimeout(() => playTone(330, 0.12, 'sine', 0.12), 80)
    },
    allReady: () => {
      playTone(523, 0.1, 'sine', 0.3)
      setTimeout(() => playTone(659, 0.1, 'sine', 0.3), 100)
      setTimeout(() => playTone(784, 0.15, 'sine', 0.3), 200)
      setTimeout(() => playTone(1047, 0.25, 'triangle', 0.25), 300)
    },
    playerJoin: () => {
      playTone(520, 0.08, 'sine', 0.12)
    },
    playerDisconnect: () => {
      playTone(300, 0.2, 'sawtooth', 0.08)
    },
    setMuted: (v) => { muted = v },
    destroy: () => {
      if (audioContext) {
        try { audioContext.close() } catch (e) { /* ignore */ }
        audioContext = null
        masterGain = null
        inited = false
      }
    },
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const sanitizeUserId = (value) => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, 128)
}

// ─── Component ───────────────────────────────────────────────────────────────

const ReadyCheckActivity = ({ sdk, currentUser }) => {
  const [ready, setReady] = useState({})
  const [disconnected, setDisconnected] = useState({})
  const lastUpdateRef = useRef({})
  const timeoutRefs = useRef({})
  const disconnectTimerRefs = useRef({})
  const syncIntervalRef = useRef(null)
  const soundRef = useRef(null)
  const prevAllReadyRef = useRef(false)
  const currentUserId = sanitizeUserId(currentUser?.id)

  // Initialize sound manager
  useEffect(() => {
    const sm = createReadyCheckSoundManager()
    soundRef.current = sm
    return () => {
      sm.destroy()
      soundRef.current = null
    }
  }, [])

  // Initialize sound on first user interaction
  const initSound = useCallback(() => {
    soundRef.current?.init()
  }, [])

  const clearUserTimeout = useCallback((userId) => {
    if (timeoutRefs.current[userId]) {
      clearTimeout(timeoutRefs.current[userId])
      delete timeoutRefs.current[userId]
    }
  }, [])

  const clearAllTimeouts = useCallback(() => {
    Object.keys(timeoutRefs.current).forEach((userId) => {
      clearTimeout(timeoutRefs.current[userId])
    })
    timeoutRefs.current = {}
    Object.keys(disconnectTimerRefs.current).forEach((userId) => {
      clearTimeout(disconnectTimerRefs.current[userId])
    })
    disconnectTimerRefs.current = {}
  }, [])

  const setUserTimeout = useCallback((userId) => {
    clearUserTimeout(userId)
    timeoutRefs.current[userId] = setTimeout(() => {
      setReady((prev) => {
        if (prev[userId] !== undefined) {
          const next = { ...prev }
          delete next[userId]
          return next
        }
        return prev
      })
      delete lastUpdateRef.current[userId]
      delete timeoutRefs.current[userId]
    }, READY_TIMEOUT_MS)
  }, [clearUserTimeout])

  // Handle player disconnect: mark as disconnected, then remove after grace period
  const handlePlayerDisconnect = useCallback((userId) => {
    if (!userId) return
    // Clear any existing disconnect timer
    if (disconnectTimerRefs.current[userId]) {
      clearTimeout(disconnectTimerRefs.current[userId])
    }
    setDisconnected((prev) => ({ ...prev, [userId]: true }))
    soundRef.current?.playerDisconnect()

    disconnectTimerRefs.current[userId] = setTimeout(() => {
      setReady((prev) => {
        if (prev[userId] !== undefined) {
          const next = { ...prev }
          delete next[userId]
          return next
        }
        return prev
      })
      setDisconnected((prev) => {
        const next = { ...prev }
        delete next[userId]
        return next
      })
      delete lastUpdateRef.current[userId]
      clearUserTimeout(userId)
      delete disconnectTimerRefs.current[userId]
    }, DISCONNECT_GRACE_MS)
  }, [clearUserTimeout])

  // Handle player reconnect: clear disconnect state
  const handlePlayerReconnect = useCallback((userId) => {
    if (!userId) return
    if (disconnectTimerRefs.current[userId]) {
      clearTimeout(disconnectTimerRefs.current[userId])
      delete disconnectTimerRefs.current[userId]
    }
    setDisconnected((prev) => {
      if (!prev[userId]) return prev
      const next = { ...prev }
      delete next[userId]
      return next
    })
  }, [])

  // Subscribe to events and server state
  useEffect(() => {
    if (!sdk) return

    const handleReadyEvent = (evt) => {
      if (!evt?.eventType) return

      // Handle ready state changes
      if (evt.eventType === 'ready:set') {
        const userId = sanitizeUserId(evt?.payload?.userId || evt?.fromPeerId)
        if (!userId) return

        const isReady = !!evt?.payload?.ready

        // If user sends a ready event, they are not disconnected
        handlePlayerReconnect(userId)

        setReady((prev) => {
          if (prev[userId] === isReady) return prev
          const next = { ...prev, [userId]: isReady }
          const keys = Object.keys(next)
          if (keys.length > MAX_READY_ENTRIES) {
            // Evict the oldest entry using the ref (no stale closure)
            const timestamps = lastUpdateRef.current
            const oldestKey = keys.reduce((a, b) =>
              (timestamps[a] || 0) < (timestamps[b] || 0) ? a : b
            )
            delete next[oldestKey]
            delete lastUpdateRef.current[oldestKey]
          }
          return next
        })

        lastUpdateRef.current[userId] = Date.now()

        if (isReady) {
          setUserTimeout(userId)
          if (userId !== currentUserId) {
            soundRef.current?.readyUp()
          }
        } else {
          clearUserTimeout(userId)
          if (userId !== currentUserId) {
            soundRef.current?.unready()
          }
        }
      }

      // Handle sync requests from late joiners
      if (evt.eventType === 'ready:sync' && currentUserId) {
        setReady((prev) => {
          if (prev[currentUserId] !== undefined) {
            // Re-broadcast our state so the new joiner gets it
            sdk.emitEvent('ready:set', {
              userId: currentUserId,
              ready: prev[currentUserId],
            }, { cue: 'ready_check' })
          }
          return prev
        })
      }

      // Handle player disconnect events from the SDK
      if (evt.eventType === 'peer:left' || evt.eventType === 'peer:disconnected') {
        const userId = sanitizeUserId(evt?.payload?.userId || evt?.payload?.peerId || evt?.fromPeerId)
        if (userId) {
          handlePlayerDisconnect(userId)
        }
      }
    }

    const off = sdk.on('event', handleReadyEvent)

    // Subscribe to server state for late joiners
    let offState = null
    if (typeof sdk.subscribeServerState === 'function') {
      offState = sdk.subscribeServerState((state) => {
        if (state?.readyCheck && typeof state.readyCheck === 'object') {
          setReady((prev) => {
            const incoming = state.readyCheck
            // Merge: prefer newer data
            const merged = { ...prev }
            let changed = false
            for (const [uid, val] of Object.entries(incoming)) {
              const sanitized = sanitizeUserId(uid)
              if (!sanitized) continue
              const isReady = !!val
              if (merged[sanitized] !== isReady) {
                merged[sanitized] = isReady
                changed = true
              }
            }
            return changed ? merged : prev
          })
        }
      })
    }

    // Request current state from other peers
    sdk.emitEvent('ready:sync', {}, { cue: 'ready_check' })

    return () => {
      off?.()
      offState?.()
      clearAllTimeouts()
    }
  }, [sdk, currentUserId, clearUserTimeout, clearAllTimeouts, setUserTimeout, handlePlayerDisconnect, handlePlayerReconnect])

  // Periodic sync to keep state fresh
  useEffect(() => {
    if (!sdk) return

    syncIntervalRef.current = setInterval(() => {
      sdk.emitEvent('ready:sync', {}, { cue: 'ready_check' })
    }, SYNC_INTERVAL_MS)

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current)
        syncIntervalRef.current = null
      }
    }
  }, [sdk])

  // Detect all-ready and play celebration sound
  useEffect(() => {
    const entries = Object.entries(ready)
    const total = entries.length
    const readyCount = entries.filter(([, val]) => val).length
    const allReady = total > 1 && readyCount === total

    if (allReady && !prevAllReadyRef.current) {
      soundRef.current?.allReady()
    }
    prevAllReadyRef.current = allReady
  }, [ready])

  // Push ready state to server for late joiners
  useEffect(() => {
    if (!sdk || typeof sdk.updateState !== 'function') return
    sdk.updateState({ readyCheck: ready })
  }, [sdk, ready])

  const toggle = useCallback(() => {
    const userId = currentUserId
    if (!userId || !sdk) return
    initSound()

    setReady((prev) => {
      const next = !prev[userId]
      const updated = { ...prev, [userId]: next }
      lastUpdateRef.current[userId] = Date.now()

      if (next) {
        setUserTimeout(userId)
        soundRef.current?.readyUp()
      } else {
        clearUserTimeout(userId)
        soundRef.current?.unready()
      }

      sdk.emitEvent('ready:set', { userId, ready: next }, { cue: 'ready_check' })
      return updated
    })
  }, [currentUserId, sdk, initSound, setUserTimeout, clearUserTimeout])

  const entries = Object.entries(ready)
  const readyCount = entries.filter(([, val]) => val).length
  const notReadyCount = entries.length - readyCount
  const totalCount = entries.length
  const progressPct = totalCount > 0 ? Math.round((readyCount / totalCount) * 100) : 0
  const allReady = totalCount > 1 && readyCount === totalCount

  // Sort: current user first, then ready users, then not-ready
  const sortedEntries = useMemo(() => {
    return [...entries].sort(([idA, valA], [idB, valB]) => {
      if (idA === currentUserId) return -1
      if (idB === currentUserId) return 1
      if (valA && !valB) return -1
      if (!valA && valB) return 1
      return 0
    })
  }, [entries, currentUserId])

  const isCurrentUserReady = ready[currentUserId] === true

  return (
    <div className="builtin-activity-body rc-root" onClick={initSound}>
      {/* Header with progress */}
      <div className="rc-header">
        <div className="rc-title-row">
          <ShieldCheckIcon size={22} className="rc-title-icon" />
          <span className="rc-title">Ready Check</span>
        </div>
        <div className="rc-stats-row">
          <span className="rc-stat rc-stat--ready">
            <CheckCircleIcon size={14} /> {readyCount}
          </span>
          <span className="rc-stat-divider">/</span>
          <span className="rc-stat rc-stat--total">{totalCount}</span>
          <span className="rc-stat rc-stat--not-ready">
            <CircleIcon size={14} /> {notReadyCount} waiting
          </span>
        </div>
        {totalCount > 0 && (
          <div className="rc-progress-track">
            <div
              className={`rc-progress-fill ${allReady ? 'rc-progress-fill--complete' : ''}`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        )}
      </div>

      {/* Ready toggle button */}
      <button
        onClick={toggle}
        className={`rc-toggle ${isCurrentUserReady ? 'rc-toggle--ready' : ''}`}
        disabled={!currentUserId || !sdk}
      >
        {isCurrentUserReady ? (
          <>
            <CheckCircleIcon size={20} className="rc-toggle-icon" />
            <span>Ready!</span>
            <span className="rc-toggle-sub">Click to unready</span>
          </>
        ) : (
          <>
            <CircleIcon size={20} className="rc-toggle-icon" />
            <span>Set Ready</span>
          </>
        )}
      </button>

      {/* All ready banner */}
      {allReady && (
        <div className="rc-all-ready-banner">
          <ShieldCheckIcon size={18} />
          <span>Everyone is ready!</span>
        </div>
      )}

      {/* Player list */}
      <div className="rc-list">
        {sortedEntries.length === 0 ? (
          <div className="rc-empty">
            <ClockIcon size={28} className="rc-empty-icon" />
            <span>Waiting for players...</span>
            <span className="rc-empty-hint">Players will appear here when they join</span>
          </div>
        ) : (
          sortedEntries.map(([id, val]) => {
            const isDisconnected = !!disconnected[id]
            const isCurrent = id === currentUserId
            return (
              <div
                key={id}
                className={[
                  'rc-entry',
                  val ? 'rc-entry--ready' : 'rc-entry--not-ready',
                  isCurrent ? 'rc-entry--current' : '',
                  isDisconnected ? 'rc-entry--disconnected' : '',
                ].filter(Boolean).join(' ')}
              >
                <div className="rc-entry-avatar">
                  {isDisconnected ? (
                    <DisconnectIcon size={16} />
                  ) : (
                    <UserIcon size={16} />
                  )}
                </div>
                <span className="rc-entry-name">
                  {id}
                  {isCurrent && <span className="rc-entry-you">(you)</span>}
                </span>
                <span className="rc-entry-status">
                  {isDisconnected ? (
                    <>
                      <DisconnectIcon size={14} />
                      <span>Disconnected</span>
                    </>
                  ) : val ? (
                    <>
                      <CheckCircleIcon size={14} />
                      <span>Ready</span>
                    </>
                  ) : (
                    <>
                      <ClockIcon size={14} />
                      <span>Waiting</span>
                    </>
                  )}
                </span>
              </div>
            )
          })
        )}
      </div>

      <style>{`
        .rc-root {
          padding: 16px;
          gap: 12px;
          max-width: 480px;
          margin: 0 auto;
          width: 100%;
        }

        /* ── Header ── */
        .rc-header {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding-bottom: 12px;
          border-bottom: 1px solid var(--volt-border, #374151);
        }

        .rc-title-row {
          display: flex;
          align-items: center;
          gap: 8px;
          justify-content: center;
        }

        .rc-title-icon {
          color: var(--volt-primary, #6366f1);
        }

        .rc-title {
          font-size: 16px;
          font-weight: 600;
          color: var(--volt-text-primary, #f3f4f6);
        }

        .rc-stats-row {
          display: flex;
          align-items: center;
          gap: 8px;
          justify-content: center;
          font-size: 13px;
        }

        .rc-stat {
          display: flex;
          align-items: center;
          gap: 4px;
          font-weight: 500;
        }

        .rc-stat--ready {
          color: #22c55e;
        }

        .rc-stat--total {
          color: var(--volt-text-secondary, #9ca3af);
          font-weight: 600;
          font-size: 14px;
        }

        .rc-stat--not-ready {
          color: #f59e0b;
        }

        .rc-stat-divider {
          color: var(--volt-text-muted, #6b7280);
        }

        /* ── Progress bar ── */
        .rc-progress-track {
          height: 4px;
          border-radius: 2px;
          background: var(--volt-bg-tertiary, #1f2937);
          overflow: hidden;
          margin-top: 4px;
        }

        .rc-progress-fill {
          height: 100%;
          background: #22c55e;
          border-radius: 2px;
          transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          min-width: 0;
        }

        .rc-progress-fill--complete {
          background: linear-gradient(90deg, #22c55e, #4ade80);
          box-shadow: 0 0 8px rgba(34, 197, 94, 0.4);
        }

        /* ── Toggle button ── */
        .rc-toggle {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 14px 24px;
          font-size: 15px;
          font-weight: 600;
          border: 2px solid var(--volt-border, #374151);
          border-radius: 10px;
          background: var(--volt-bg-tertiary, #1f2937);
          color: var(--volt-text-primary, #d1d5db);
          cursor: pointer;
          transition: all 0.2s ease;
          position: relative;
          overflow: hidden;
        }

        .rc-toggle:hover:not(:disabled) {
          background: var(--volt-hover, #374151);
          border-color: var(--volt-text-muted, #6b7280);
        }

        .rc-toggle:active:not(:disabled) {
          transform: scale(0.98);
        }

        .rc-toggle:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .rc-toggle--ready {
          background: #166534;
          border-color: #22c55e;
          color: #bbf7d0;
        }

        .rc-toggle--ready:hover:not(:disabled) {
          background: #15803d;
          border-color: #4ade80;
        }

        .rc-toggle-icon {
          flex-shrink: 0;
        }

        .rc-toggle-sub {
          font-size: 11px;
          font-weight: 400;
          opacity: 0.7;
          margin-left: 4px;
        }

        /* ── All ready banner ── */
        .rc-all-ready-banner {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 10px 16px;
          border-radius: 8px;
          background: rgba(34, 197, 94, 0.15);
          border: 1px solid rgba(34, 197, 94, 0.35);
          color: #4ade80;
          font-size: 14px;
          font-weight: 600;
          animation: rc-banner-in 0.3s ease;
        }

        @keyframes rc-banner-in {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* ── Player list ── */
        .rc-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
          max-height: 320px;
          overflow-y: auto;
          padding-right: 2px;
        }

        .rc-list::-webkit-scrollbar {
          width: 4px;
        }

        .rc-list::-webkit-scrollbar-thumb {
          background: var(--volt-border, #374151);
          border-radius: 2px;
        }

        .rc-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          padding: 32px 16px;
          color: var(--volt-text-muted, #6b7280);
        }

        .rc-empty-icon {
          opacity: 0.5;
        }

        .rc-empty-hint {
          font-size: 12px;
          opacity: 0.7;
        }

        /* ── Entry row ── */
        .rc-entry {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          border-radius: 8px;
          background: var(--volt-bg-tertiary, #1f2937);
          border: 1px solid var(--volt-border, #374151);
          transition: all 0.2s ease;
          animation: rc-entry-in 0.25s ease;
        }

        @keyframes rc-entry-in {
          from { opacity: 0; transform: translateX(-8px); }
          to   { opacity: 1; transform: translateX(0); }
        }

        .rc-entry--ready {
          border-color: rgba(34, 197, 94, 0.4);
          background: rgba(34, 197, 94, 0.08);
        }

        .rc-entry--not-ready {
          border-color: var(--volt-border, #374151);
        }

        .rc-entry--current {
          box-shadow: inset 3px 0 0 var(--volt-primary, #6366f1);
        }

        .rc-entry--disconnected {
          opacity: 0.55;
          border-color: rgba(239, 68, 68, 0.35);
          background: rgba(239, 68, 68, 0.06);
          border-style: dashed;
        }

        .rc-entry-avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          background: var(--volt-bg-secondary, #111827);
          color: var(--volt-text-muted, #9ca3af);
        }

        .rc-entry--ready .rc-entry-avatar {
          background: rgba(34, 197, 94, 0.15);
          color: #22c55e;
        }

        .rc-entry--disconnected .rc-entry-avatar {
          background: rgba(239, 68, 68, 0.12);
          color: #ef4444;
        }

        .rc-entry-name {
          flex: 1;
          font-weight: 500;
          font-size: 14px;
          color: var(--volt-text-primary, #e5e7eb);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          min-width: 0;
        }

        .rc-entry-you {
          font-size: 11px;
          font-weight: 400;
          color: var(--volt-primary, #6366f1);
          margin-left: 6px;
        }

        .rc-entry-status {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
          flex-shrink: 0;
          font-weight: 500;
        }

        .rc-entry--ready .rc-entry-status {
          color: #22c55e;
        }

        .rc-entry--not-ready .rc-entry-status {
          color: #f59e0b;
        }

        .rc-entry--disconnected .rc-entry-status {
          color: #ef4444;
        }
      `}</style>
    </div>
  )
}

export default ReadyCheckActivity
