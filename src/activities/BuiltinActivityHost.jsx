import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { XMarkIcon, ArrowsPointingInIcon } from '@heroicons/react/24/outline'
import { useAuth } from '../contexts/AuthContext'
import { createVoltActivitySDK } from '../sdk/activities-sdk'
import { playActivityCueOTF, warmupActivityAudio } from './sound/otfSoundEngine'
import { resolveBuiltinActivityComponent, normalizeBuiltinActivityId } from './builtin/components'
import { getBuiltinActivityDefinition } from './builtin/definitions'
import './builtin/builtin-activities.css'
import './builtin/bytebeat-styles.css'

class ActivityErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('[BuiltinActivityHost] Error caught by boundary:', error, errorInfo)
    this.props.onError?.(error)
  }

  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false, error: null })
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="builtin-activity-error">
          <p>Something went wrong in this activity.</p>
          <button onClick={() => this.setState({ hasError: false, error: null })}>
            Try Again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

const MAX_ERRORS = 10
const WARN_COOLDOWN_MS = 2000

const BuiltinActivityHost = ({ session, socket, contextType, contextId, onClose, embedded = false }) => {
  const { user } = useAuth()
  const [securityWarning, setSecurityWarning] = useState('')
  const [componentError, setComponentError] = useState(null)
  const [isReconnecting, setIsReconnecting] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const errorCountRef = useRef(0)
  const warningHistoryRef = useRef(new Map())
  const modalRef = useRef(null)

  const safeSessionId = typeof session?.id === 'string' ? session.id : ''
  const rawActivityId = typeof session?.activityId === 'string' ? session.activityId : ''
  const normalizedActivityId = normalizeBuiltinActivityId(rawActivityId) || rawActivityId || 'unknown'
  const activityDefinition = getBuiltinActivityDefinition(rawActivityId)

  const reportWarning = useCallback((key, message, cooldown = WARN_COOLDOWN_MS) => {
    const now = Date.now()
    const lastTs = warningHistoryRef.current.get(key) || 0
    if (now - lastTs < cooldown) return
    warningHistoryRef.current.set(key, now)

    if (message && message !== securityWarning) {
      setSecurityWarning(message)
    }
  }, [securityWarning])

  const isValidSession = useMemo(() => {
    return !!(socket && safeSessionId)
  }, [socket, safeSessionId])

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
      return
    }

    const target = modalRef.current || document.querySelector('.builtin-activity-modal') || document.querySelector('.voice-main-activity')
    if (target?.requestFullscreen) {
      target.requestFullscreen().catch(() => {})
    }
  }, [])

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)

    const handleActivityFullscreen = (e) => {
      if (e?.detail?.sessionId && e.detail.sessionId === safeSessionId) {
        toggleFullscreen()
      }
    }
    window.addEventListener('activity:fullscreen', handleActivityFullscreen)

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      window.removeEventListener('activity:fullscreen', handleActivityFullscreen)
    }
  }, [safeSessionId, toggleFullscreen])

  const handleClose = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
    }
    onClose?.()
  }, [onClose])

  useEffect(() => {
    setSecurityWarning('')
    setComponentError(null)
    setIsReconnecting(false)
    errorCountRef.current = 0
    warningHistoryRef.current.clear()
  }, [safeSessionId, rawActivityId])

  const sdk = useMemo(() => {
    if (!isValidSession) return null

    try {
      const sdkInstance = createVoltActivitySDK({
        socket,
        contextType,
        contextId,
        sessionId: safeSessionId,
        p2p: {
          enabled: session?.p2p?.enabled !== false
        },
        sound: {
          enabled: session?.sound?.enabled !== false,
          volume: Number(session?.sound?.volume ?? 0.82)
        },
        security: {
          enabled: true,
          strict: false,
          maxInboundBytes: 96 * 1024,
          maxEventBytes: 32 * 1024
        }
      })

      return {
        ...sdkInstance,
        emitEvent: (...args) => {
          try {
            return sdkInstance.emitEvent(...args)
          } catch (err) {
            errorCountRef.current++
            reportWarning('emit-event', 'Activity event emission failed')
            console.warn('[BuiltinActivityHost] emitEvent error:', err)
            return false
          }
        },
        updateState: (...args) => {
          try {
            return sdkInstance.updateState(...args)
          } catch (err) {
            errorCountRef.current++
            reportWarning('update-state', 'Activity state update failed')
            console.warn('[BuiltinActivityHost] updateState error:', err)
            return false
          }
        }
      }
    } catch (err) {
      console.error('[BuiltinActivityHost] SDK creation failed:', err)
      setComponentError(err?.message || 'Failed to initialize activity')
      return null
    }
  }, [isValidSession, socket, contextType, contextId, safeSessionId, session?.p2p?.enabled, session?.sound?.enabled, session?.sound?.volume, reportWarning])

  const handleComponentError = useCallback((error) => {
    errorCountRef.current++

    if (errorCountRef.current >= MAX_ERRORS) {
      setIsReconnecting(true)
      reportWarning('too-many-errors', 'Too many errors. Please restart the activity.', 500)
      return
    }

    const message = error?.message || 'An error occurred'
    setComponentError((prev) => (prev === message ? prev : message))
  }, [reportWarning])

  const handleRetry = useCallback(() => {
    errorCountRef.current = 0
    warningHistoryRef.current.clear()
    setComponentError(null)
    setIsReconnecting(false)
    setSecurityWarning('')
  }, [])

  useEffect(() => {
    if (!sdk) return

    try {
      warmupActivityAudio()
    } catch (err) {
      console.warn('[BuiltinActivityHost] Audio warmup failed:', err)
    }

    try {
      sdk.connectSession()
    } catch (err) {
      console.error('[BuiltinActivityHost] connectSession failed:', err)
      setComponentError('Failed to connect to activity session')
      return
    }

    const offEvent = sdk.on('event', (evt) => {
      try {
        if (evt?.cue) {
          playActivityCueOTF(evt.cue, session?.sound?.volume ?? 0.82)
        }
      } catch (err) {
        reportWarning('event-cue', 'Activity audio cue failed')
        console.warn('[BuiltinActivityHost] Event cue error:', err)
      }
    })

    const offState = sdk.subscribeServerState((state) => {
      try {
        const cue = state?.__event?.cue
        if (cue) playActivityCueOTF(cue, session?.sound?.volume ?? 0.82)
      } catch (err) {
        reportWarning('state-cue', 'Activity state cue failed')
        console.warn('[BuiltinActivityHost] State cue error:', err)
      }
    })

    const offSecurity = sdk.on('security:flag', (flag = {}) => {
      errorCountRef.current++
      reportWarning(`security:${String(flag?.type || 'generic')}`, String(flag.reason || 'Suspicious activity payload blocked'))
    })

    const offError = sdk.on('error', (evt = {}) => {
      errorCountRef.current++
      reportWarning(`runtime:${String(evt?.type || 'generic')}`, String(evt.message || 'Activity runtime error handled safely'))
    })

    return () => {
      try { offEvent?.() } catch {}
      try { offState?.() } catch {}
      try { offSecurity?.() } catch {}
      try { offError?.() } catch {}
      try { sdk.disconnectSession() } catch {}
      try { sdk.destroy() } catch {}
    }
  }, [sdk, session?.sound?.volume, reportWarning])

  const Component = useMemo(() => resolveBuiltinActivityComponent(rawActivityId), [rawActivityId])
  const isSafeToRender = errorCountRef.current < MAX_ERRORS && !isReconnecting

  const warningNode = (securityWarning || componentError)
    ? (
      <div className={`builtin-activity-warning ${componentError ? 'error' : ''}`}>
        {securityWarning || componentError}
        {componentError && (
          <button className="retry-btn" onClick={handleRetry}>
            Retry
          </button>
        )}
      </div>
    )
    : null

  const invalidSessionNode = !isValidSession
    ? <div className="builtin-activity-empty">Unable to start activity: invalid session context.</div>
    : null

  const missingComponentNode = (isValidSession && !Component)
    ? <div className="builtin-activity-empty">No built-in renderer found for {normalizedActivityId}.</div>
    : null

  const exhaustedNode = (isValidSession && !isSafeToRender)
    ? <div className="builtin-activity-empty">Activity encountered too many errors. Please close and restart.</div>
    : null

  const renderBody = () => {
    if (invalidSessionNode) return invalidSessionNode
    if (!sdk) {
      return (
        <div className="builtin-activity-loading">
          <div className="loading-spinner" />
          <p>Initializing activity...</p>
        </div>
      )
    }
    if (missingComponentNode) return missingComponentNode
    if (exhaustedNode) return exhaustedNode

    if (typeof Component !== 'function') {
      return <div className="builtin-activity-empty">Invalid activity component for {normalizedActivityId}.</div>
    }

    return (
      <ActivityErrorBoundary onError={handleComponentError} resetKey={`${safeSessionId}:${normalizedActivityId}:${componentError || ''}`}>
        <Component sdk={sdk} session={session} currentUser={user} activityDefinition={activityDefinition} />
      </ActivityErrorBoundary>
    )
  }

  if (embedded) {
    return (
      <div className="builtin-activity-embedded" data-activity={normalizedActivityId || 'unknown'}>
        {warningNode}
        {renderBody()}
      </div>
    )
  }

  return (
    <div className="builtin-activity-overlay" onClick={handleClose}>
      <div
        className="builtin-activity-modal"
        onClick={(e) => e.stopPropagation()}
        data-activity={normalizedActivityId || 'unknown'}
        ref={modalRef}
      >
        <div className="builtin-activity-header">
          <div>
            <strong>{session?.activityName || activityDefinition?.name || 'Built-in Activity'}</strong>
            <small>Session: {safeSessionId || 'unknown'}</small>
          </div>
          <div className="builtin-activity-header-actions">
            <button
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              className="fullscreen-toggle-btn"
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              <ArrowsPointingInIcon width={16} height={16} />
            </button>
            <button onClick={handleClose} aria-label="Close activity" className="close-activity-btn">
              <XMarkIcon width={16} height={16} />
            </button>
          </div>
        </div>

        {warningNode}
        {renderBody()}
      </div>
    </div>
  )
}

export default BuiltinActivityHost
