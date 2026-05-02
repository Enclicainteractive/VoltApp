import React, { useState, useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useSocket } from '../contexts/SocketContext'
import lazyLoadingService from '../services/lazyLoadingService'
import { LoadingScreen } from './LoadingScreen'

// How long (ms) we wait for the socket to connect before showing the
// recoverable error screen instead of spinning forever (Deadlock C fix).
const SOCKET_WAIT_MS = 10000

const ConnectionRecoveryScreen = ({ reconnecting, onReload, onLogout }) => (
  <div
    style={{
      position: 'fixed',
      inset: 0,
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      background: 'color-mix(in srgb, var(--bg-primary, #121317) 92%, #000 8%)',
      color: 'var(--text-primary, #f3f4f8)'
    }}
  >
    <div
      style={{
        width: 'min(92vw, 420px)',
        borderRadius: '18px',
        border: '1px solid color-mix(in srgb, var(--volt-border, #2a2d35) 82%, #fff 18%)',
        background: 'color-mix(in srgb, var(--volt-bg-secondary, #171922) 90%, #000 10%)',
        boxShadow: '0 20px 48px rgba(0, 0, 0, 0.45)',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px'
      }}
    >
      <h2 style={{ margin: 0, fontSize: '1.05rem', lineHeight: 1.35 }}>Connection issue</h2>
      <p style={{ margin: 0, color: 'var(--text-secondary, #b3b8c7)', lineHeight: 1.5 }}>
        {reconnecting
          ? 'Still trying to reconnect to chat and voice.'
          : 'Unable to connect to the server right now.'}
      </p>
      <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
        <button
          type="button"
          onClick={onReload}
          className="btn btn-primary"
        >
          Reload
        </button>
        <button
          type="button"
          onClick={onLogout}
          className="btn btn-ghost"
        >
          Sign out
        </button>
      </div>
    </div>
  </div>
)

const ProtectedRoute = ({ children }) => {
  const location = useLocation()
  const { isAuthenticated, loading, logout } = useAuth()
  const { connected, reconnecting } = useSocket()
  const [socketTimedOut, setSocketTimedOut] = useState(false)
  const [hasConnectedOnce, setHasConnectedOnce] = useState(false)

  useEffect(() => {
    if (!connected) return
    setHasConnectedOnce(true)
    setSocketTimedOut(false)
    lazyLoadingService.preloadComponents(['ChatArea', 'MessageList', 'ChannelSidebar', 'ServerSidebar'], { idle: true })
  }, [connected])

  // Reset the timeout whenever the authenticated+disconnected window opens or
  // closes so re-connections clear the error state correctly.
  useEffect(() => {
    if (!isAuthenticated || connected) {
      setSocketTimedOut(false)
      return
    }

    // Authenticated but not yet connected — start the countdown.
    const timerId = setTimeout(() => {
      if (!connected) {
        console.warn('[ProtectedRoute] Socket not connected after 10s — showing recovery UI')
        setSocketTimedOut(true)
      }
    }, SOCKET_WAIT_MS)

    return () => clearTimeout(timerId)
  }, [isAuthenticated, connected])

  if (loading) {
    return <LoadingScreen message="Loading your session..." />
  }

  if (!isAuthenticated) {
    lazyLoadingService.preloadRouteChunks(['route:login'], { idle: false })
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}${location.hash}` }}
      />
    )
  }

  if (connected) {
    return children
  }

  // Preserve the active chat UI while reconnecting after at least one healthy
  // connection to avoid full-screen route flashes on transient socket blips.
  if (reconnecting && hasConnectedOnce && !socketTimedOut) {
    return children
  }

  if (socketTimedOut) {
    return (
      <ConnectionRecoveryScreen
        reconnecting={reconnecting}
        onReload={() => window.location.reload()}
        onLogout={() => void logout()}
      />
    )
  }

  return (
    <LoadingScreen
      message={hasConnectedOnce ? 'Reconnecting to chat and voice...' : 'Connecting to VoltChat...'}
    />
  )
}

export default ProtectedRoute
