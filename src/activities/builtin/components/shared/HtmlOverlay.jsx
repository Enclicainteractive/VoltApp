/**
 * HtmlOverlay.jsx  –  HTML UI overlay for 3D activities
 *
 * Renders HTML UI on top of the Three.js canvas using React.createPortal
 * into document.body. This completely bypasses the R3F reconciler (which
 * only understands Three.js objects, not HTML elements).
 *
 * Why NOT @react-three/drei <Html fullscreen>:
 *  - drei's Html component positions itself relative to the 3D scene,
 *    causing the overlay to move/scale with the camera.
 *  - It still runs inside the R3F reconciler context, causing "Text is not
 *    allowed in the R3F tree" and "Button/Div is not part of THREE namespace"
 *    errors when React tries to reconcile HTML elements as Three.js objects.
 *
 * This implementation portals directly to document.body, so:
 *  - HTML elements are rendered by the normal React DOM reconciler
 *  - The overlay stays fixed over the canvas regardless of camera movement
 *  - No R3F namespace errors
 */
import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// ─── Overlay container ────────────────────────────────────────────────────────
// A single fixed overlay div that covers the entire viewport.
// All HtmlOverlay instances portal into this.
let _overlayRoot = null
function getOverlayRoot() {
  if (_overlayRoot) return _overlayRoot
  _overlayRoot = document.createElement('div')
  _overlayRoot.id = 'html-overlay-root'
  _overlayRoot.style.cssText = [
    'position:fixed',
    'inset:0',
    'pointer-events:none',
    'z-index:200',
    'overflow:hidden',
  ].join(';')
  document.body.appendChild(_overlayRoot)
  return _overlayRoot
}

/**
 * HtmlOverlay – portals children into a fixed full-screen div over the canvas.
 * Safe to use inside an R3F <Canvas> tree – the portal escapes the R3F reconciler.
 */
export function HtmlOverlay({ children, style = {} }) {
  const root = getOverlayRoot()
  return createPortal(
    <div style={{
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none',
      overflow: 'hidden',
      fontFamily: 'system-ui,-apple-system,sans-serif',
      ...style,
    }}>
      {children}
    </div>,
    root
  )
}

// ─── Helper: position panel by anchor ────────────────────────────────────────
function getAnchorStyle(anchor, x, y, w, h) {
  switch (anchor) {
    case 'top-right':    return { top: y, right: x }
    case 'top-center':   return { top: y, left: '50%', transform: `translateX(calc(-50% + ${x}px))` }
    case 'bottom-left':  return { bottom: y, left: x }
    case 'bottom-right': return { bottom: y, right: x }
    case 'bottom-center':return { bottom: y, left: '50%', transform: `translateX(calc(-50% + ${x}px))` }
    case 'center':       return { top: '50%', left: '50%', transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))` }
    default:             return { top: y, left: x }  // top-left
  }
}

// ─── Panel ────────────────────────────────────────────────────────────────────
export function HtmlPanel({
  x = 0, y = 0, w = 200, h = 'auto',
  anchor = 'top-left',
  color = '#0d1117',
  opacity = 0.95,
  borderColor = '#1f2937',
  style = {},
  children,
}) {
  const anchorStyle = getAnchorStyle(anchor, x, y, w, h)
  return (
    <div style={{
      position: 'absolute',
      width: w,
      minHeight: typeof h === 'number' ? h : undefined,
      backgroundColor: color,
      opacity,
      border: `1px solid ${borderColor}`,
      borderRadius: 8,
      padding: 12,
      color: '#f9fafb',
      pointerEvents: 'auto',
      boxSizing: 'border-box',
      ...anchorStyle,
      ...style,
    }}>
      {children}
    </div>
  )
}

// ─── Text ─────────────────────────────────────────────────────────────────────
export function HtmlText({
  x = 0, y = 0,
  text = '',
  fontSize = 14,
  color = '#ffffff',
  fontWeight = 'normal',
  align = 'left',
  maxWidth,
  style = {},
}) {
  return (
    <div style={{
      position: 'absolute',
      left: x,
      top: y,
      fontSize,
      color,
      fontWeight,
      textAlign: align,
      maxWidth,
      lineHeight: 1.4,
      ...style,
    }}>
      {text}
    </div>
  )
}

// ─── Button ───────────────────────────────────────────────────────────────────
export function HtmlButton({
  x = 0, y = 0, w = 120, h = 32,
  label = 'Button',
  color = '#3b82f6',
  hoverColor = '#2563eb',
  textColor = '#ffffff',
  fontSize = 13,
  onClick,
  disabled = false,
  anchor = 'top-left',
}) {
  const [hovered, setHovered] = useState(false)
  const anchorStyle = getAnchorStyle(anchor, x, y, w, h)

  return (
    <button
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      disabled={disabled}
      style={{
        position: 'absolute',
        width: w,
        height: h,
        backgroundColor: hovered ? hoverColor : color,
        color: textColor,
        border: 'none',
        borderRadius: 4,
        fontSize,
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'background-color 0.15s ease',
        fontFamily: 'system-ui,-apple-system,sans-serif',
        pointerEvents: 'auto',
        ...anchorStyle,
      }}
    >
      {label}
    </button>
  )
}

// ─── Progress bar ─────────────────────────────────────────────────────────────
export function HtmlBar({
  x = 0, y = 0, w = 150, h = 10,
  value = 1,
  color = '#4ade80',
  bgColor = '#1f2937',
}) {
  const fillWidth = Math.max(0, Math.min(100, value * 100))
  return (
    <div style={{
      position: 'absolute',
      left: x, top: y,
      width: w, height: h,
      backgroundColor: bgColor,
      borderRadius: 2,
      overflow: 'hidden',
    }}>
      <div style={{
        width: `${fillWidth}%`,
        height: '100%',
        backgroundColor: color,
        transition: 'width 0.1s ease',
      }} />
    </div>
  )
}

// ─── Divider ──────────────────────────────────────────────────────────────────
export function HtmlDivider({ x = 0, y = 0, w = 200, color = '#374151' }) {
  return (
    <div style={{
      position: 'absolute',
      left: x, top: y,
      width: w, height: 1,
      backgroundColor: color,
    }} />
  )
}

// ─── Color swatch ─────────────────────────────────────────────────────────────
export function HtmlColorSwatch({
  x = 0, y = 0, size = 20,
  color = '#fff',
  selected = false,
  onClick,
  anchor = 'top-left',
}) {
  const [hovered, setHovered] = useState(false)
  const anchorStyle = getAnchorStyle(anchor, x, y, size, size)

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'absolute',
        width: size, height: size,
        backgroundColor: color,
        border: `2px solid ${selected ? '#ffffff' : hovered ? '#aaaaaa' : '#444444'}`,
        borderRadius: 4,
        cursor: 'pointer',
        boxSizing: 'border-box',
        pointerEvents: 'auto',
        ...anchorStyle,
      }}
    />
  )
}
