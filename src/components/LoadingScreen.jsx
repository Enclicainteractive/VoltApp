import React, { useState, useEffect } from 'react'
import { Zap } from 'lucide-react'

const VoltageLogo = ({ size = 80 }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 120 120" 
    xmlns="http://www.w3.org/2000/svg"
    style={{ display: 'block' }}
  >
    <circle cx="60" cy="60" r="60" fill="#352f4a"/>
    <path d="M 60 25 L 45 60 L 57 60 L 48 95 L 78 55 L 66 55 L 75 25 Z" fill="var(--volt-warning)"/>
  </svg>
)

// Debounce delay before showing the reconnect overlay.
// Brief socket hiccups (< 2s) won't show the overlay at all.
const RECONNECT_SHOW_DELAY_MS = 2000

const ReconnectingOverlay = ({ visible }) => {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!visible) {
      // Hide immediately when reconnected
      setShow(false)
      return
    }
    // Only show overlay after a sustained disconnect
    const timer = setTimeout(() => setShow(true), RECONNECT_SHOW_DELAY_MS)
    return () => clearTimeout(timer)
  }, [visible])

  if (!show) return null

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(26, 26, 26, 0.85)',
      backdropFilter: 'blur(4px)',
      zIndex: 9998,
      pointerEvents: 'none'
    }}>
      <div style={{
        animation: 'reconnectPulse 1.2s ease-in-out infinite'
      }}>
        <VoltageLogo size={60} />
      </div>
      <p style={{
        marginTop: '16px',
        fontSize: '14px',
        color: 'var(--text-secondary, #a0a0a0)',
        letterSpacing: '0.5px'
      }}>
        Reconnecting...
      </p>
      <style>{`
        @keyframes reconnectPulse {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.5;
            transform: scale(0.9);
          }
        }
      `}</style>
    </div>
  )
}

const LoadingScreen = ({ message = 'Loading...' }) => {
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'var(--bg-primary, #1a1a1a)',
      color: 'var(--text-primary, #ffffff)',
      zIndex: 9999
    }}>
      <div style={{
        animation: 'loadingBolt 1.5s ease-in-out infinite'
      }}>
        <VoltageLogo size={80} />
      </div>
      <p style={{
        marginTop: '20px',
        fontSize: '16px',
        color: 'var(--text-secondary, #a0a0a0)'
      }}>
        {message}
      </p>
      <style>{`
        @keyframes loadingBolt {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
            filter: drop-shadow(0 0 20px rgba(251, 191, 36, 0.5));
          }
          50% {
            opacity: 0.7;
            transform: scale(0.95);
            filter: drop-shadow(0 0 10px rgba(251, 191, 36, 0.3));
          }
        }
      `}</style>
    </div>
  )
}

export { LoadingScreen, ReconnectingOverlay, VoltageLogo }
export default LoadingScreen
