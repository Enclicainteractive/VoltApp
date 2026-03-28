import { useCallback, useEffect, useRef } from 'react'
import { useCanvasRenderer, screenToCanvas, drawBoard, drawPiece, drawHighlight, drawText, drawCard, drawGrid } from '../shared/ArcadeCanvasRenderer'

/**
 * ArcadeCanvas2D - Canvas renderer for all 2D arcade games
 * Replaces DOM-based rendering with performant canvas rendering
 */

export const ArcadeCanvas2D = ({ engine, state, selected, onAction, disabled }) => {
  const renderCallback = useCallback((ctx, width, height) => {
    switch (engine) {
      case 'checkers':
        renderCheckersCanvas(ctx, width, height, state, selected)
        break
      case 'reversi':
        renderReversiCanvas(ctx, width, height, state)
        break
      case 'gomoku':
        renderGomokuCanvas(ctx, width, height, state)
        break
      case 'dots-and-boxes':
        renderDotsCanvas(ctx, width, height, state)
        break
      case 'memory-match':
        renderMemoryCanvas(ctx, width, height, state)
        break
      case 'minesweeper-party':
        renderMinesweeperCanvas(ctx, width, height, state)
        break
      case 'party-2048':
        render2048Canvas(ctx, width, height, state)
        break
      case 'mancala':
        renderMancalaCanvas(ctx, width, height, state)
        break
      default:
        drawText(ctx, `${engine} - Canvas Rendering`, width / 2, height / 2, 24)
    }
  }, [engine, state, selected])

  const { canvasRef, zoom, panX, panY, resetView, handlers } = useCanvasRenderer(
    renderCallback,
    [state.version, selected]
  )

  const handleCanvasClick = useCallback((e) => {
    if (disabled || !onAction) return
    
    const canvas = canvasRef.current
    if (!canvas) return

    const { x, y } = screenToCanvas(e.clientX, e.clientY, canvas, zoom, panX, panY)
    
    switch (engine) {
      case 'checkers':
        handleCheckersClick(x, y, canvas.width, canvas.height, onAction)
        break
      case 'reversi':
        handleReversiClick(x, y, canvas.width, canvas.height, onAction)
        break
      case 'gomoku':
        handleGomokuClick(x, y, canvas.width, canvas.height, onAction)
        break
      case 'dots-and-boxes':
        handleDotsClick(x, y, canvas.width, canvas.height, onAction)
        break
      case 'memory-match':
        handleMemoryClick(x, y, canvas.width, canvas.height, onAction)
        break
      case 'minesweeper-party':
        handleMinesweeperClick(x, y, canvas.width, canvas.height, onAction, e.button === 2)
        break
      default:
        break
    }
  }, [engine, disabled, onAction, canvasRef, zoom, panX, panY])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas
        ref={canvasRef}
        {...handlers}
        onClick={handleCanvasClick}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          cursor: disabled ? 'not-allowed' : 'pointer'
        }}
      />
      <div style={{
        position: 'absolute',
        top: 10,
        right: 10,
        display: 'flex',
        gap: 8,
        zIndex: 10
      }}>
        <button
          onClick={resetView}
          style={{
            padding: '8px 12px',
            background: 'rgba(15, 23, 42, 0.9)',
            border: '1px solid rgba(148, 163, 184, 0.3)',
            borderRadius: 8,
            color: '#fff',
            fontSize: 12,
            cursor: 'pointer'
          }}
        >
          Reset View
        </button>
        <div style={{
          padding: '8px 12px',
          background: 'rgba(15, 23, 42, 0.9)',
          border: '1px solid rgba(148, 163, 184, 0.3)',
          borderRadius: 8,
          color: '#94a3b8',
          fontSize: 12
        }}>
          Zoom: {Math.round(zoom * 100)}%
        </div>
      </div>
    </div>
  )
}

// Checkers rendering
const renderCheckersCanvas = (ctx, width, height, state, selected) => {
  const cellSize = Math.min(width, height) / 10
  const boardSize = cellSize * 8
  const offsetX = (width - boardSize) / 2
  const offsetY = (height - boardSize) / 2

  drawBoard(ctx, offsetX, offsetY, 8, cellSize)

  state.payload.board?.forEach((row, y) => {
    row.forEach((cell, x) => {
      if (!cell) return
      const cx = offsetX + x * cellSize + cellSize / 2
      const cy = offsetY + y * cellSize + cellSize / 2
      const color = cell.toLowerCase() === 'r' ? '#fb7185' : '#22d3ee'
      const isKing = cell === 'R' || cell === 'B'
      drawPiece(ctx, cx, cy, cellSize * 0.35, color, isKing ? '♔' : null)
    })
  })

  if (selected) {
    drawHighlight(ctx, offsetX + selected.x * cellSize, offsetY + selected.y * cellSize, cellSize, '#fbbf24')
  }
}

const handleCheckersClick = (x, y, width, height, onAction) => {
  const cellSize = Math.min(width, height) / 10
  const boardSize = cellSize * 8
  const offsetX = (width - boardSize) / 2
  const offsetY = (height - boardSize) / 2

  const col = Math.floor((x - offsetX) / cellSize)
  const row = Math.floor((y - offsetY) / cellSize)

  if (col >= 0 && col < 8 && row >= 0 && row < 8) {
    onAction({ x: col, y: row })
  }
}

// Reversi rendering
const renderReversiCanvas = (ctx, width, height, state) => {
  const cellSize = Math.min(width, height) / 10
  const boardSize = cellSize * 8
  const offsetX = (width - boardSize) / 2
  const offsetY = (height - boardSize) / 2

  drawBoard(ctx, offsetX, offsetY, 8, cellSize, '#16a34a', '#15803d')

  state.payload.board?.forEach((row, y) => {
    row.forEach((cell, x) => {
      if (!cell) return
      const cx = offsetX + x * cellSize + cellSize / 2
      const cy = offsetY + y * cellSize + cellSize / 2
      const color = cell === 'd' ? '#1e293b' : '#fbbf24'
      drawPiece(ctx, cx, cy, cellSize * 0.4, color)
    })
  })
}

const handleReversiClick = (x, y, width, height, onAction) => {
  const cellSize = Math.min(width, height) / 10
  const boardSize = cellSize * 8
  const offsetX = (width - boardSize) / 2
  const offsetY = (height - boardSize) / 2

  const col = Math.floor((x - offsetX) / cellSize)
  const row = Math.floor((y - offsetY) / cellSize)

  if (col >= 0 && col < 8 && row >= 0 && row < 8) {
    onAction({ x: col, y: row })
  }
}

// Gomoku rendering
const renderGomokuCanvas = (ctx, width, height, state) => {
  const cellSize = Math.min(width, height) / 17
  const boardSize = cellSize * 15
  const offsetX = (width - boardSize) / 2
  const offsetY = (height - boardSize) / 2

  // Draw grid
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)'
  ctx.lineWidth = 1
  for (let i = 0; i < 15; i++) {
    ctx.beginPath()
    ctx.moveTo(offsetX + cellSize / 2, offsetY + i * cellSize + cellSize / 2)
    ctx.lineTo(offsetX + boardSize - cellSize / 2, offsetY + i * cellSize + cellSize / 2)
    ctx.stroke()

    ctx.beginPath()
    ctx.moveTo(offsetX + i * cellSize + cellSize / 2, offsetY + cellSize / 2)
    ctx.lineTo(offsetX + i * cellSize + cellSize / 2, offsetY + boardSize - cellSize / 2)
    ctx.stroke()
  }

  state.payload.board?.forEach((row, y) => {
    row.forEach((cell, x) => {
      if (!cell) return
      const cx = offsetX + x * cellSize + cellSize / 2
      const cy = offsetY + y * cellSize + cellSize / 2
      const color = cell === 'x' ? '#1e293b' : '#f8fafc'
      drawPiece(ctx, cx, cy, cellSize * 0.4, color)
    })
  })
}

const handleGomokuClick = (x, y, width, height, onAction) => {
  const cellSize = Math.min(width, height) / 17
  const boardSize = cellSize * 15
  const offsetX = (width - boardSize) / 2
  const offsetY = (height - boardSize) / 2

  const col = Math.round((x - offsetX - cellSize / 2) / cellSize)
  const row = Math.round((y - offsetY - cellSize / 2) / cellSize)

  if (col >= 0 && col < 15 && row >= 0 && row < 15) {
    onAction({ x: col, y: row })
  }
}

// Dots & Boxes rendering
const renderDotsCanvas = (ctx, width, height, state) => {
  const cellSize = Math.min(width, height) / 8
  const gridSize = cellSize * 6
  const offsetX = (width - gridSize) / 2
  const offsetY = (height - gridSize) / 2

  // Draw dots
  for (let y = 0; y < 6; y++) {
    for (let x = 0; x < 6; x++) {
      ctx.fillStyle = '#f8fafc'
      ctx.beginPath()
      ctx.arc(offsetX + x * cellSize, offsetY + y * cellSize, 5, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // Draw horizontal lines
  state.payload.hLines?.forEach((row, y) => {
    row.forEach((owner, x) => {
      if (!owner) return
      ctx.strokeStyle = owner === state.players[0]?.id ? '#22d3ee' : '#fb7185'
      ctx.lineWidth = 6
      ctx.beginPath()
      ctx.moveTo(offsetX + x * cellSize, offsetY + y * cellSize)
      ctx.lineTo(offsetX + (x + 1) * cellSize, offsetY + y * cellSize)
      ctx.stroke()
    })
  })

  // Draw vertical lines
  state.payload.vLines?.forEach((row, y) => {
    row.forEach((owner, x) => {
      if (!owner) return
      ctx.strokeStyle = owner === state.players[0]?.id ? '#22d3ee' : '#fb7185'
      ctx.lineWidth = 6
      ctx.beginPath()
      ctx.moveTo(offsetX + x * cellSize, offsetY + y * cellSize)
      ctx.lineTo(offsetX + x * cellSize, offsetY + (y + 1) * cellSize)
      ctx.stroke()
    })
  })

  // Draw box owners
  state.payload.owners?.forEach((row, y) => {
    row.forEach((owner, x) => {
      if (!owner) return
      const cx = offsetX + x * cellSize + cellSize / 2
      const cy = offsetY + y * cellSize + cellSize / 2
      ctx.fillStyle = owner === state.players[0]?.id ? 'rgba(34, 211, 238, 0.3)' : 'rgba(251, 113, 133, 0.3)'
      ctx.fillRect(cx - cellSize / 3, cy - cellSize / 3, cellSize * 0.66, cellSize * 0.66)
    })
  })
}

const handleDotsClick = (x, y, width, height, onAction) => {
  const cellSize = Math.min(width, height) / 8
  const gridSize = cellSize * 6
  const offsetX = (width - gridSize) / 2
  const offsetY = (height - gridSize) / 2

  const relX = x - offsetX
  const relY = y - offsetY

  // Check horizontal lines
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 5; col++) {
      const lineY = row * cellSize
      const lineX1 = col * cellSize
      const lineX2 = (col + 1) * cellSize
      if (Math.abs(relY - lineY) < 10 && relX >= lineX1 && relX <= lineX2) {
        onAction({ orientation: 'h', x: col, y: row })
        return
      }
    }
  }

  // Check vertical lines
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 6; col++) {
      const lineX = col * cellSize
      const lineY1 = row * cellSize
      const lineY2 = (row + 1) * cellSize
      if (Math.abs(relX - lineX) < 10 && relY >= lineY1 && relY <= lineY2) {
        onAction({ orientation: 'v', x: col, y: row })
        return
      }
    }
  }
}

// Memory Match rendering
const renderMemoryCanvas = (ctx, width, height, state) => {
  const cardWidth = 80
  const cardHeight = 100
  const gap = 12
  const cols = 4
  const rows = 4
  const gridWidth = cols * cardWidth + (cols - 1) * gap
  const gridHeight = rows * cardHeight + (rows - 1) * gap
  const offsetX = (width - gridWidth) / 2
  const offsetY = (height - gridHeight) / 2

  state.payload.cards?.forEach((card, index) => {
    const col = index % cols
    const row = Math.floor(index / cols)
    const x = offsetX + col * (cardWidth + gap)
    const y = offsetY + row * (cardHeight + gap)
    
    drawCard(ctx, x, y, cardWidth, cardHeight, card.value, card.revealed, card.matched)
  })
}

const handleMemoryClick = (x, y, width, height, onAction) => {
  const cardWidth = 80
  const cardHeight = 100
  const gap = 12
  const cols = 4
  const rows = 4
  const gridWidth = cols * cardWidth + (cols - 1) * gap
  const gridHeight = rows * cardHeight + (rows - 1) * gap
  const offsetX = (width - gridWidth) / 2
  const offsetY = (height - gridHeight) / 2

  for (let index = 0; index < 16; index++) {
    const col = index % cols
    const row = Math.floor(index / cols)
    const cardX = offsetX + col * (cardWidth + gap)
    const cardY = offsetY + row * (cardHeight + gap)
    
    if (x >= cardX && x <= cardX + cardWidth && y >= cardY && y <= cardY + cardHeight) {
      onAction({ index })
      return
    }
  }
}

// Minesweeper rendering
const renderMinesweeperCanvas = (ctx, width, height, state) => {
  const cellSize = Math.min(width, height) / 12
  const gridSize = cellSize * 10
  const offsetX = (width - gridSize) / 2
  const offsetY = (height - gridSize) / 2

  state.payload.cells?.forEach((row, y) => {
    row.forEach((cell, x) => {
      const cx = offsetX + x * cellSize
      const cy = offsetY + y * cellSize

      if (cell.revealed) {
        ctx.fillStyle = cell.mine ? 'rgba(239, 68, 68, 0.5)' : 'rgba(148, 163, 184, 0.2)'
      } else {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.8)'
      }
      
      ctx.fillRect(cx, cy, cellSize - 2, cellSize - 2)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'
      ctx.strokeRect(cx, cy, cellSize - 2, cellSize - 2)

      if (cell.revealed && cell.mine) {
        drawText(ctx, '💣', cx + cellSize / 2, cy + cellSize / 2, cellSize * 0.5)
      } else if (cell.revealed && cell.count > 0) {
        drawText(ctx, String(cell.count), cx + cellSize / 2, cy + cellSize / 2, cellSize * 0.4)
      } else if (cell.flagged) {
        drawText(ctx, '🚩', cx + cellSize / 2, cy + cellSize / 2, cellSize * 0.5)
      }
    })
  })
}

const handleMinesweeperClick = (x, y, width, height, onAction, isRightClick) => {
  const cellSize = Math.min(width, height) / 12
  const gridSize = cellSize * 10
  const offsetX = (width - gridSize) / 2
  const offsetY = (height - gridSize) / 2

  const col = Math.floor((x - offsetX) / cellSize)
  const row = Math.floor((y - offsetY) / cellSize)

  if (col >= 0 && col < 10 && row >= 0 && row < 10) {
    onAction({ mode: isRightClick ? 'flag' : 'reveal', x: col, y: row })
  }
}

// 2048 rendering
const render2048Canvas = (ctx, width, height, state) => {
  const cellSize = Math.min(width, height) / 6
  const gridSize = cellSize * 4
  const offsetX = (width - gridSize) / 2
  const offsetY = (height - gridSize) / 2

  state.payload.board?.forEach((row, y) => {
    row.forEach((value, x) => {
      const cx = offsetX + x * cellSize + 4
      const cy = offsetY + y * cellSize + 4
      
      const alpha = value ? Math.min(0.2 + value / 4096, 0.9) : 0.1
      ctx.fillStyle = value ? `rgba(251, 191, 36, ${alpha})` : 'rgba(15, 23, 42, 0.8)'
      ctx.fillRect(cx, cy, cellSize - 8, cellSize - 8)
      
      if (value) {
        drawText(ctx, String(value), cx + cellSize / 2 - 4, cy + cellSize / 2 - 4, cellSize * 0.3, '#fff')
      }
    })
  })
}

// Mancala rendering
const renderMancalaCanvas = (ctx, width, height, state) => {
  const pitSize = 60
  const storeWidth = 90
  const storeHeight = 140
  const gap = 12
  const boardWidth = storeWidth * 2 + pitSize * 6 + gap * 7
  const offsetX = (width - boardWidth) / 2
  const offsetY = (height - storeHeight) / 2

  const pits = state.payload.pits || []

  // Draw stores
  ctx.fillStyle = 'rgba(15, 23, 42, 0.9)'
  ctx.fillRect(offsetX, offsetY, storeWidth, storeHeight)
  ctx.fillRect(offsetX + boardWidth - storeWidth, offsetY, storeWidth, storeHeight)
  drawText(ctx, String(pits[13] || 0), offsetX + storeWidth / 2, offsetY + storeHeight / 2, 24)
  drawText(ctx, String(pits[6] || 0), offsetX + boardWidth - storeWidth / 2, offsetY + storeHeight / 2, 24)

  // Draw pits
  for (let i = 0; i < 6; i++) {
    const x1 = offsetX + storeWidth + gap + i * (pitSize + gap)
    const y1 = offsetY + 10
    const y2 = offsetY + storeHeight - pitSize - 10

    ctx.fillStyle = 'rgba(15, 23, 42, 0.8)'
    ctx.beginPath()
    ctx.arc(x1 + pitSize / 2, y1 + pitSize / 2, pitSize / 2, 0, Math.PI * 2)
    ctx.fill()
    drawText(ctx, String(pits[12 - i] || 0), x1 + pitSize / 2, y1 + pitSize / 2, 18)

    ctx.beginPath()
    ctx.arc(x1 + pitSize / 2, y2 + pitSize / 2, pitSize / 2, 0, Math.PI * 2)
    ctx.fill()
    drawText(ctx, String(pits[i] || 0), x1 + pitSize / 2, y2 + pitSize / 2, 18)
  }
}

export default ArcadeCanvas2D
