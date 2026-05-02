import React, { useEffect, useState } from 'react'

const RECONNECT_SHOW_DELAY_MS = 3000
const OVERLAY_FADE_MS = 220

const overlayStyles = `
.volt-loading-screen {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: grid;
  place-items: center;
  padding: max(24px, env(safe-area-inset-top, 0px)) 24px max(24px, env(safe-area-inset-bottom, 0px));
  background:
    radial-gradient(circle at top, color-mix(in srgb, var(--volt-primary, #6e7cff) 18%, transparent), transparent 56%),
    color-mix(in srgb, var(--bg-primary, #121317) 92%, #000 8%);
  color: var(--text-primary, #fff);
}

.volt-loading-panel {
  width: min(92vw, 360px);
  border-radius: 18px;
  border: 1px solid color-mix(in srgb, var(--volt-border, #2a2d35) 85%, #fff 15%);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--volt-primary, #6e7cff) 10%, transparent), transparent 52%),
    color-mix(in srgb, var(--volt-bg-secondary, #171922) 90%, #000 10%);
  box-shadow: 0 24px 56px rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(14px) saturate(120%);
  padding: 26px 24px 22px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  text-align: center;
}

.volt-loading-message {
  margin: 0;
  font-size: 0.95rem;
  line-height: 1.5;
  letter-spacing: 0.01em;
  color: color-mix(in srgb, var(--text-secondary, #b3b8c7) 92%, #fff 8%);
}

.volt-logo-wrap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  filter: drop-shadow(0 0 18px rgba(251, 191, 36, 0.35));
}

.volt-logo-wrap.breathe {
  animation: volt-logo-breathe 1400ms ease-in-out infinite;
}

.volt-logo-wrap.pulse {
  animation: volt-logo-pulse 1100ms ease-in-out infinite;
}

.volt-reconnect-overlay {
  position: fixed;
  inset: 0;
  z-index: 9998;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: max(20px, env(safe-area-inset-top, 0px)) 20px max(20px, env(safe-area-inset-bottom, 0px));
  pointer-events: none;
  opacity: 0;
  background: rgba(10, 10, 12, 0.62);
  backdrop-filter: blur(6px) saturate(120%);
  transition: opacity ${OVERLAY_FADE_MS}ms ease;
}

.volt-reconnect-overlay.visible {
  opacity: 1;
}

.volt-reconnect-panel {
  border: 1px solid color-mix(in srgb, var(--volt-border, #2a2d35) 78%, #fff 22%);
  border-radius: 999px;
  background: color-mix(in srgb, var(--volt-bg-secondary, #171922) 86%, #000 14%);
  width: 88px;
  height: 88px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.volt-reconnect-message {
  margin: 0;
  font-size: 0.84rem;
  color: color-mix(in srgb, var(--text-secondary, #b3b8c7) 90%, #fff 10%);
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

@keyframes volt-logo-breathe {
  0%, 100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(0.95);
    opacity: 0.78;
  }
}

@keyframes volt-logo-pulse {
  0%, 100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(0.9);
    opacity: 0.66;
  }
}

@media (max-width: 640px) {
  .volt-loading-panel {
    width: min(94vw, 340px);
    padding: 22px 20px 18px;
    border-radius: 16px;
  }

  .volt-loading-message {
    font-size: 0.9rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .volt-logo-wrap,
  .volt-reconnect-overlay {
    animation: none !important;
    transition: none !important;
  }
}
`

const VoltageLogo = ({ size = 80 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 120 120"
    xmlns="http://www.w3.org/2000/svg"
    style={{ display: 'block' }}
  >
    <circle cx="60" cy="60" r="60" fill="#352f4a" />
    <path d="M 60 25 L 45 60 L 57 60 L 48 95 L 78 55 L 66 55 L 75 25 Z" fill="var(--volt-warning)" />
  </svg>
)

const ReconnectingOverlay = ({ visible }) => {
  const [show, setShow] = useState(false)
  const [fadeIn, setFadeIn] = useState(false)

  useEffect(() => {
    let showTimer
    let hideTimer

    if (!visible) {
      setFadeIn(false)
      hideTimer = setTimeout(() => setShow(false), OVERLAY_FADE_MS)
      return () => clearTimeout(hideTimer)
    }

    showTimer = setTimeout(() => {
      setShow(true)
      requestAnimationFrame(() => setFadeIn(true))
    }, RECONNECT_SHOW_DELAY_MS)

    return () => {
      clearTimeout(showTimer)
      clearTimeout(hideTimer)
    }
  }, [visible])

  if (!show) return null

  return (
    <>
      <style>{overlayStyles}</style>
      <div
        className={`volt-reconnect-overlay ${fadeIn ? 'visible' : ''}`}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <div className="volt-reconnect-panel" aria-hidden="true">
          <div className="volt-logo-wrap pulse">
            <VoltageLogo size={56} />
          </div>
        </div>
        <p className="volt-reconnect-message">Reconnecting...</p>
      </div>
    </>
  )
}

const LoadingScreen = ({ message = 'Loading...' }) => {
  return (
    <>
      <style>{overlayStyles}</style>
      <div className="volt-loading-screen" role="status" aria-live="polite" aria-atomic="true">
        <div className="volt-loading-panel">
          <div className="volt-logo-wrap breathe" aria-hidden="true">
            <VoltageLogo size={80} />
          </div>
          <p className="volt-loading-message">{message}</p>
        </div>
      </div>
    </>
  )
}

export { LoadingScreen, ReconnectingOverlay, VoltageLogo }
export default LoadingScreen
