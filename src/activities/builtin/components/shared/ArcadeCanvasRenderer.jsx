import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * ArcadeCanvasRenderer - Unified 2D canvas renderer for arcade games
 * Provides zoom, pan, and rendering utilities for all 2D board games
 */

export const useCanvasRenderer = (renderCallback, dependencies = []) => {
  const canvasRef = useRef(null)
  const [zoom, setZoom] = useState(1)
  const [panX, setPanX] = useState(0)
  const [panY, setPanY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    const width = canvas.clientWidth || 800
    const height = canvas.clientHeight || 600

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }

    // Clear canvas
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = '#0a0e1a'
    ctx.fillRect(0, 0, width, height)

    // Apply transformations
    ctx.save()
    ctx.translate(width / 2 + panX, height / 2 + panY)
    ctx.scale(zoom, zoom)
    ctx.translate(-width / 2, -height / 2)

    // Call custom render function
    if (renderCallback) {
      renderCallback(ctx, width, height, zoom, panX, panY)
    }

    ctx.restore()
  }, [renderCallback, zoom, panX, panY, ...dependencies])

  // Zoom handler
  const handleWheel = useCallback((e) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setZoom((prev) => Math.max(0.5, Math.min(3, prev * delta)))
  }, [])

  // Pan handlers
  const handleMouseDown = useCallback((e) => {
    if (e.button === 1 || e.button === 2 || e.shiftKey) {
      e.preventDefault()
      setIsDragging(true)
      setDragStart({ x: e.clientX - panX, y: e.clientY - panY })
    }
  }, [panX, panY])

  const handleMouseMove = useCallback((e) => {
    if (isDragging) {
      setPanX(e.clientX - dragStart.x)
      setPanY(e.clientY - dragStart.y)
    }
  }, [isDragging, dragStart])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  const resetView = useCallback(() => {
    setZoom(1)
    setPanX(0)
    setPanY(0)
  }, [])

  return {
    canvasRef,
    zoom,
    panX,
    panY,
    resetView,
    handlers: {
      onWheel: handleWheel,
      onMouseDown: handleMouseDown,
      onMouseMove: handleMouseMove,
      onMouseUp: handleMouseUp,
      onContextMenu: (e) => e.preventDefault()
    }
  }
}

// Utility: Convert screen coordinates to canvas coordinates
export const screenToCanvas = (screenX, screenY, canvas, zoom, panX, panY) => {
  if (!canvas) return { x: 0, y: 0 }
  const rect = canvas.getBoundingClientRect()
  const width = canvas.width
  const height = canvas.height
  
  const canvasX = screenX - rect.left
  const canvasY = screenY - rect.top
  
  // Reverse transformations
  const centerX = width / 2
  const centerY = height / 2
  
  const x = ((canvasX - centerX - panX) / zoom) + centerX
  const y = ((canvasY - centerY - panY) / zoom) + centerY
  
  return { x, y }
}

// Drawing utilities
export const drawBoard = (ctx, x, y, size, cellSize, lightColor = '#f0d9b5', darkColor = '#b58863') => {
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const isLight = (row + col) % 2 === 0
      ctx.fillStyle = isLight ? lightColor : darkColor
      ctx.fillRect(x + col * cellSize, y + row * cellSize, cellSize, cellSize)
    }
  }
}

export const drawPiece = (ctx, x, y, radius, color, symbol = null) => {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fill()
  
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'
  ctx.lineWidth = 2
  ctx.stroke()
  
  if (symbol) {
    ctx.fillStyle = '#fff'
    ctx.font = `bold ${radius * 1.2}px Arial`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(symbol, x, y)
  }
}

export const drawHighlight = (ctx, x, y, size, color = '#ffff00', lineWidth = 4) => {
  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth
  ctx.strokeRect(x, y, size, size)
}

export const drawText = (ctx, text, x, y, fontSize = 16, color = '#fff', align = 'center') => {
  ctx.fillStyle = color
  ctx.font = `${fontSize}px Arial`
  ctx.textAlign = align
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x, y)
}

export const drawCard = (ctx, x, y, width, height, content, revealed = false, matched = false) => {
  if (revealed || matched) {
    ctx.fillStyle = matched ? 'rgba(251, 191, 36, 0.3)' : 'rgba(34, 211, 238, 0.3)'
  } else {
    ctx.fillStyle = 'rgba(17, 24, 39, 0.9)'
  }
  
  ctx.fillRect(x, y, width, height)
  ctx.strokeStyle = 'rgba(255,255,255,0.1)'
  ctx.lineWidth = 2
  ctx.strokeRect(x, y, width, height)
  
  if (revealed || matched) {
    ctx.fillStyle = '#fff'
    ctx.font = `${height * 0.5}px Arial`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(content, x + width / 2, y + height / 2)
  } else {
    ctx.fillStyle = '#94a3b8'
    ctx.font = `${height * 0.4}px Arial`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('✦', x + width / 2, y + height / 2)
  }
}

export const drawGrid = (ctx, x, y, cols, rows, cellSize, lineColor = 'rgba(148, 163, 184, 0.3)') => {
  ctx.strokeStyle = lineColor
  ctx.lineWidth = 1
  
  for (let i = 0; i <= cols; i++) {
    ctx.beginPath()
    ctx.moveTo(x + i * cellSize, y)
    ctx.lineTo(x + i * cellSize, y + rows * cellSize)
    ctx.stroke()
  }
  
  for (let i = 0; i <= rows; i++) {
    ctx.beginPath()
    ctx.moveTo(x, y + i * cellSize)
    ctx.lineTo(x + cols * cellSize, y + i * cellSize)
    ctx.stroke()
  }
}
