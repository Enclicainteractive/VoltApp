/**
 * HtmlOverlay.jsx  –  HTML UI overlay for 3D activities
 *
 * Renders HTML UI on top of the Three.js canvas. The UI is positioned
 * absolutely over the canvas and scrolls with the page.
 * 
 * This is more reliable than 3D mesh UI because:
 * - Native HTML event handling (no raycasting issues)
 * - Better accessibility
 * - Easier styling with CSS
 * - Works with any screen size
 */
import React from 'react'

const overlayStyle = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  pointerEvents: 'none',  // Let clicks pass through to canvas by default
  zIndex: 100,
  overflow: 'hidden',
}

const panelBaseStyle = {
  position: 'absolute',
  backgroundColor: 'rgba(13, 17, 23, 0.95)',
  border: '1px solid #1f2937',
  borderRadius: '8px',
  padding: '12px',
  color: '#f9fafb',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  pointerEvents: 'auto',  // Re-enable clicks for UI elements
}

/**
 * Position a panel relative to an anchor point
 */
export function positionPanel(anchor, x, y, width, height, sw, sh) {
  const left = {
    'top-left': x,
    'top-right': sw - x - width,
    'top-center': (sw - width) / 2 + x,
    'bottom-left': x,
    'bottom-right': sw - x - width,
    'bottom-center': (sw - width) / 2 + x,
    'center': (sw - width) / 2 + x,
  }[anchor] || x

  const top = {
    'top-left': y,
    'top-right': y,
    'top-center': y,
    'bottom-left': sh - y - height,
    'bottom-right': sh - y - height,
    'bottom-center': sh - y - height,
    'center': (sh - height) / 2 + y,
  }[anchor] || y

  return { left, top }
}

export function HtmlOverlay({ children, style = {} }) {
  return (
    <div style={{ ...overlayStyle, ...style }}>
      {children}
    </div>
  )
}

export function HtmlPanel({ 
  x = 0, y = 0, w = 200, h = 100, 
  anchor = 'top-left',
  color = '#0d1117', 
  opacity = 0.95,
  borderColor = '#1f2937',
  style = {},
  children 
}) {
  // Get viewport size at render time - this will work with CSS
  const [size, setSize] = React.useState({ width: window.innerWidth, height: window.innerHeight })
  
  React.useEffect(() => {
    const handleResize = () => {
      setSize({ width: window.innerWidth, height: window.innerHeight })
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const { left, top } = positionPanel(anchor, x, y, w, h, size.width, size.height)

  return (
    <div style={{
      ...panelBaseStyle,
      left: `${left}px`,
      top: `${top}px`,
      width: `${w}px`,
      minHeight: `${h}px`,
      backgroundColor: color,
      opacity,
      borderColor,
      ...style,
    }}>
      {children}
    </div>
  )
}

export function HtmlText({ 
  x = 0, y = 0,
  text = '',
  fontSize = 14,
  color = '#ffffff',
  fontWeight = 'normal',
  align = 'left',
  style = {},
}) {
  return (
    <div style={{
      position: 'absolute',
      left: `${x}px`,
      top: `${y}px`,
      fontSize: `${fontSize}px`,
      color,
      fontWeight,
      textAlign: align,
      ...style,
    }}>
      {text}
    </div>
  )
}

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
  const [size, setSize] = React.useState({ width: window.innerWidth, height: window.innerHeight })
  const [hovered, setHovered] = React.useState(false)
  
  React.useEffect(() => {
    const handleResize = () => {
      setSize({ width: window.innerWidth, height: window.innerHeight })
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const { left, top } = positionPanel(anchor, x, y, w, h, size.width, size.height)

  return (
    <button
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      disabled={disabled}
      style={{
        position: 'absolute',
        left: `${left}px`,
        top: `${top}px`,
        width: `${w}px`,
        height: `${h}px`,
        backgroundColor: hovered ? hoverColor : color,
        color: textColor,
        border: 'none',
        borderRadius: '4px',
        fontSize: `${fontSize}px`,
        fontWeight: '600',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'background-color 0.15s ease',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {label}
    </button>
  )
}

export function HtmlBar({
  x = 0, y = 0, w = 150, h = 10,
  value = 1,
  color = '#4ade80',
  bgColor = '#1f2937',
  anchor = 'top-left',
}) {
  const fillWidth = Math.max(0, Math.min(w, value * w))
  
  return (
    <div style={{
      position: 'absolute',
      left: `${x}px`,
      top: `${y}px`,
      width: `${w}px`,
      height: `${h}px`,
      backgroundColor: bgColor,
      borderRadius: '2px',
      overflow: 'hidden',
    }}>
      <div style={{
        width: `${fillWidth}px`,
        height: '100%',
        backgroundColor: color,
        transition: 'width 0.1s ease',
      }} />
    </div>
  )
}

export function HtmlDivider({ x = 0, y = 0, w = 200, color = '#374151' }) {
  return (
    <div style={{
      position: 'absolute',
      left: `${x}px`,
      top: `${y}px`,
      width: `${w}px`,
      height: '1px',
      backgroundColor: color,
    }} />
  )
}

export function HtmlColorSwatch({
  x = 0, y = 0, size = 20,
  color = '#fff',
  selected = false,
  onClick,
  anchor = 'top-left',
}) {
  const [sizeState, setSizeState] = React.useState({ width: window.innerWidth, height: window.innerHeight })
  const [hovered, setHovered] = React.useState(false)
  
  React.useEffect(() => {
    const handleResize = () => {
      setSizeState({ width: window.innerWidth, height: window.innerHeight })
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const { left, top } = positionPanel(anchor, x, y, size, size, sizeState.width, sizeState.height)

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'absolute',
        left: `${left}px`,
        top: `${top}px`,
        width: `${size}px`,
        height: `${size}px`,
        backgroundColor: color,
        border: `2px solid ${selected ? '#ffffff' : hovered ? '#aaaaaa' : '#444444'}`,
        borderRadius: '4px',
        cursor: 'pointer',
        boxSizing: 'border-box',
      }}
    />
  )
}
  
 