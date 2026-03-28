/**
 * Simple 5D Chess Canvas Renderer - Reliable and performant
 */

import React, { useRef, useEffect, useCallback } from 'react'

// Constants
const CELL_SIZE = 48
const BOARD_SIZE = CELL_SIZE * 8
const BOARD_GAP = 50
const TIMELINE_GAP = 70
const LABEL_HEIGHT = 30
const MARGIN_LEFT = 120
const MARGIN_TOP = 80

// SVG piece URLs (Wikimedia Commons)
const PIECE_URLS = {
  wk: 'https://upload.wikimedia.org/wikipedia/commons/4/42/Chess_klt45.svg',
  wq: 'https://upload.wikimedia.org/wikipedia/commons/1/15/Chess_qlt45.svg',
  wr: 'https://upload.wikimedia.org/wikipedia/commons/7/72/Chess_rlt45.svg',
  wb: 'https://upload.wikimedia.org/wikipedia/commons/b/b1/Chess_blt45.svg',
  wn: 'https://upload.wikimedia.org/wikipedia/commons/7/70/Chess_nlt45.svg',
  wp: 'https://upload.wikimedia.org/wikipedia/commons/4/45/Chess_plt45.svg',
  bk: 'https://upload.wikimedia.org/wikipedia/commons/f/f0/Chess_kdt45.svg',
  bq: 'https://upload.wikimedia.org/wikipedia/commons/4/47/Chess_qdt45.svg',
  br: 'https://upload.wikimedia.org/wikipedia/commons/f/ff/Chess_rdt45.svg',
  bb: 'https://upload.wikimedia.org/wikipedia/commons/9/98/Chess_bdt45.svg',
  bn: 'https://upload.wikimedia.org/wikipedia/commons/e/e0/Chess_ndt45.svg',
  bp: 'https://upload.wikimedia.org/wikipedia/commons/c/c7/Chess_pdt45.svg',
}

// Unicode fallback symbols
const PIECE_SYMBOLS = {
  wk: '♔', wq: '♕', wr: '♖', wb: '♗', wn: '♘', wp: '♙',
  bk: '♚', bq: '♛', br: '♜', bb: '♝', bn: '♞', bp: '♟'
}

// Image cache
const imageCache = new Map()
const loadPieceImage = (piece) => {
  if (imageCache.has(piece)) return imageCache.get(piece)
  
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.src = PIECE_URLS[piece]
  img.onload = () => img._loaded = true
  img.onerror = () => img._error = true
  imageCache.set(piece, img)
  return img
}

// Preload all piece images
const preloadAllPieces = () => {
  Object.keys(PIECE_URLS).forEach(loadPieceImage)
}

// Animation state
let timeTravelAnimation = null
let newBoardAnimations = [] // Array of { timelineIndex, startTime, duration }

/**
 * Start a time travel animation
 */
export const startTimeTravelAnimation = (fromPos, toPos, piece, duration = 800) => {
  timeTravelAnimation = {
    from: fromPos,
    to: toPos,
    piece,
    startTime: Date.now(),
    duration,
    active: true
  }
}

/**
 * Start a new board entrance animation
 */
export const startNewBoardAnimation = (timelineIndex, duration = 600) => {
  // Remove any existing animation for this timeline
  newBoardAnimations = newBoardAnimations.filter(a => a.timelineIndex !== timelineIndex)
  newBoardAnimations.push({
    timelineIndex,
    startTime: Date.now(),
    duration
  })
}

/**
 * Get the entrance animation progress for a timeline (0 to 1)
 */
const getBoardEntranceProgress = (timelineIndex) => {
  const anim = newBoardAnimations.find(a => a.timelineIndex === timelineIndex)
  if (!anim) return 1 // No animation, fully visible
  
  const elapsed = Date.now() - anim.startTime
  const progress = Math.min(1, elapsed / anim.duration)
  
  // Remove completed animations
  if (progress >= 1) {
    newBoardAnimations = newBoardAnimations.filter(a => a.timelineIndex !== timelineIndex)
  }
  
  return progress
}

// Colors
const LIGHT_SQUARE = '#f0d9b5'
const DARK_SQUARE = '#b58863'
const SELECTED_COLOR = 'rgba(255, 255, 100, 0.5)'
const VALID_MOVE_COLOR = 'rgba(168, 85, 247, 0.5)'
const VALID_CAPTURE_COLOR = 'rgba(239, 68, 68, 0.5)'
const TIME_TRAVEL_COLOR = 'rgba(34, 197, 94, 0.5)'
const LAST_MOVE_COLOR = '#cdd16f'
const CHECK_COLOR = 'rgba(239, 68, 68, 0.4)'
const PRESENT_COLOR = 'rgba(168, 85, 247, 0.15)'

/**
 * Get board position in the multiverse
 */
const getBoardPos = (timelineIndex, turnNumber) => ({
  x: MARGIN_LEFT + turnNumber * (BOARD_SIZE + BOARD_GAP),
  y: MARGIN_TOP + timelineIndex * (BOARD_SIZE + TIMELINE_GAP + LABEL_HEIGHT)
})

/**
 * Draw a single board with optional entrance animation
 */
const drawBoard = (ctx, board, x, y, options = {}) => {
  const {
    isActive = true,
    isPlayable = false,
    isPresent = false,
    isInCheck = false,
    activeFor = 'w',
    turnNumber = 0,
    timelineId = 0,
    timelineIndex = 0,
    selectedPiece = null,
    validMoves = [],
    lastMove = null,
    entranceProgress = 1 // 0 = just appeared, 1 = fully visible
  } = options

  // Apply entrance animation (scale and fade in)
  if (entranceProgress < 1) {
    ctx.save()
    const scale = 0.8 + entranceProgress * 0.2
    const alpha = entranceProgress
    const centerX = x + BOARD_SIZE / 2
    const centerY = y + LABEL_HEIGHT + BOARD_SIZE / 2
    
    ctx.globalAlpha = alpha
    ctx.translate(centerX, centerY)
    ctx.scale(scale, scale)
    ctx.translate(-centerX, -centerY)
  }

  // Board background
  ctx.fillStyle = isPlayable ? '#1a1a1a' : '#111111'
  ctx.fillRect(x, y + LABEL_HEIGHT, BOARD_SIZE, BOARD_SIZE)

  // Present highlight
  if (isPresent) {
    ctx.fillStyle = PRESENT_COLOR
    ctx.fillRect(x, y + LABEL_HEIGHT, BOARD_SIZE, BOARD_SIZE)
  }

  // Draw squares
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const isLight = (row + col) % 2 === 0
      const squareX = x + col * CELL_SIZE
      const squareY = y + LABEL_HEIGHT + row * CELL_SIZE

      // Base color
      ctx.fillStyle = isLight ? LIGHT_SQUARE : DARK_SQUARE

      // Last move highlight
      if (lastMove) {
        if (lastMove.from.x === col && lastMove.from.y === row) {
          ctx.fillStyle = LAST_MOVE_COLOR
        }
        if (lastMove.to.x === col && lastMove.to.y === row) {
          ctx.fillStyle = LAST_MOVE_COLOR
        }
      }

      // Selected square
      if (selectedPiece && selectedPiece.x === col && selectedPiece.y === row) {
        ctx.fillStyle = SELECTED_COLOR
      }

      // Check highlight on king square
      if (isInCheck && board[row]?.[col]?.[1] === 'k') {
        ctx.fillStyle = CHECK_COLOR
      }

      ctx.fillRect(squareX, squareY, CELL_SIZE, CELL_SIZE)
    }
  }

  // Draw pieces
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row]?.[col]
      if (!piece) continue

      const squareX = x + col * CELL_SIZE
      const squareY = y + LABEL_HEIGHT + row * CELL_SIZE
      const img = loadPieceImage(piece)

      // Draw piece
      ctx.save()
      ctx.shadowColor = 'rgba(0, 0, 0, 0.4)'
      ctx.shadowBlur = 3
      ctx.shadowOffsetX = 1
      ctx.shadowOffsetY = 2

      if (img.complete && img.naturalWidth > 0 && !img._error) {
        ctx.drawImage(img, squareX + 2, squareY + 2, CELL_SIZE - 4, CELL_SIZE - 4)
      } else {
        // Fallback to Unicode
        ctx.shadowBlur = 0
        ctx.font = `${CELL_SIZE - 10}px serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillStyle = piece[0] === 'w' ? '#ffffff' : '#000000'
        ctx.fillText(PIECE_SYMBOLS[piece] || '?', squareX + CELL_SIZE / 2, squareY + CELL_SIZE / 2)
      }
      ctx.restore()
    }
  }

  // Draw valid move indicators
  validMoves.forEach(move => {
    const moveX = x + move.x * CELL_SIZE + CELL_SIZE / 2
    const moveY = y + LABEL_HEIGHT + move.y * CELL_SIZE + CELL_SIZE / 2
    const isCapture = board[move.y]?.[move.x]

    ctx.save()
    if (move.isTimeTravel) {
      ctx.strokeStyle = TIME_TRAVEL_COLOR
      ctx.lineWidth = 3
      ctx.shadowColor = 'rgba(34, 197, 94, 0.6)'
      ctx.shadowBlur = 8
      ctx.beginPath()
      ctx.arc(moveX, moveY, CELL_SIZE / 2 - 6, 0, Math.PI * 2)
      ctx.stroke()
    } else if (isCapture) {
      ctx.strokeStyle = VALID_CAPTURE_COLOR
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(moveX, moveY, CELL_SIZE / 2 - 4, 0, Math.PI * 2)
      ctx.stroke()
    } else {
      ctx.fillStyle = VALID_MOVE_COLOR
      ctx.beginPath()
      ctx.arc(moveX, moveY, CELL_SIZE / 5, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  })

  // Board border
  ctx.save()
  if (isInCheck) {
    ctx.strokeStyle = '#ef4444'
    ctx.lineWidth = 4
    ctx.shadowColor = 'rgba(239, 68, 68, 0.6)'
    ctx.shadowBlur = 12
  } else {
    ctx.strokeStyle = isPlayable 
      ? (activeFor === 'w' ? '#e5e5e5' : '#525252')
      : (isPresent ? '#a855f7' : '#2a2a2a')
    ctx.lineWidth = isPlayable ? 3 : 1
  }
  ctx.strokeRect(x, y + LABEL_HEIGHT, BOARD_SIZE, BOARD_SIZE)
  ctx.restore()

  // Board label
  ctx.save()
  ctx.font = '11px monospace'
  ctx.fillStyle = isActive ? (activeFor === 'w' ? '#e5e5e5' : '#888888') : '#444444'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText(`T${timelineId}·${turnNumber.toFixed(1)}`, x, y + 4)
  
  if (isPlayable) {
    ctx.font = 'bold 10px monospace'
    ctx.fillStyle = activeFor === 'w' ? '#ffffff' : '#888888'
    ctx.fillText(activeFor === 'w' ? '● White' : '● Black', x + 80, y + 4)
  }
  ctx.restore()

  // Restore entrance animation transform
  if (entranceProgress < 1) {
    ctx.restore()
  }
}

/**
 * Draw timeline arrow
 */
const drawTimelineArrow = (ctx, x, y1, y2, color = '#a855f7') => {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.setLineDash([6, 4])
  ctx.beginPath()
  ctx.moveTo(x, y1)
  ctx.lineTo(x, y2)
  ctx.stroke()

  // Arrow head
  ctx.setLineDash([])
  ctx.beginPath()
  ctx.moveTo(x - 6, y2 - 8)
  ctx.lineTo(x, y2)
  ctx.lineTo(x + 6, y2 - 8)
  ctx.stroke()
  ctx.restore()
}

/**
 * Draw present line
 */
const drawPresentLine = (ctx, x, y, height, frame) => {
  ctx.save()
  
  // Glow
  const gradient = ctx.createLinearGradient(x, y, x, y + height)
  gradient.addColorStop(0, 'rgba(168, 85, 247, 0.95)')
  gradient.addColorStop(0.5, 'rgba(168, 85, 247, 0.7)')
  gradient.addColorStop(1, 'rgba(168, 85, 247, 0.4)')
  
  const pulse = Math.sin(frame * 0.05) * 2
  ctx.fillStyle = gradient
  ctx.fillRect(x - 3 - pulse, y, 6 + pulse * 2, height)
  
  ctx.fillStyle = '#a855f7'
  ctx.fillRect(x - 1, y, 2, height)

  // Label
  ctx.save()
  ctx.translate(x - 18, y + 40)
  ctx.rotate(-Math.PI / 2)
  ctx.font = 'bold 10px sans-serif'
  ctx.fillStyle = '#a855f7'
  ctx.textAlign = 'center'
  ctx.fillText('PRESENT', 0, 0)
  ctx.restore()

  ctx.restore()
}

/**
 * Draw temporal check line (attack from one timeline to another)
 */
const drawTemporalCheckLine = (ctx, attackerPos, kingPos, frame) => {
  ctx.save()
  
  const { x: ax, y: ay } = attackerPos
  const { x: kx, y: ky } = kingPos
  
  // Animated dashed line
  const dashOffset = frame * 0.5
  
  // Outer glow
  ctx.strokeStyle = 'rgba(239, 68, 68, 0.3)'
  ctx.lineWidth = 6
  ctx.shadowColor = '#ef4444'
  ctx.shadowBlur = 15
  ctx.setLineDash([10, 5])
  ctx.lineDashOffset = dashOffset
  ctx.beginPath()
  ctx.moveTo(ax, ay)
  ctx.lineTo(kx, ky)
  ctx.stroke()
  
  // Inner line
  ctx.strokeStyle = '#ef4444'
  ctx.lineWidth = 2
  ctx.shadowBlur = 8
  ctx.beginPath()
  ctx.moveTo(ax, ay)
  ctx.lineTo(kx, ky)
  ctx.stroke()
  
  // Arrow at king end
  ctx.setLineDash([])
  ctx.shadowBlur = 0
  const angle = Math.atan2(ky - ay, kx - ax)
  ctx.beginPath()
  ctx.moveTo(kx, ky)
  ctx.lineTo(kx - 12 * Math.cos(angle - 0.4), ky - 12 * Math.sin(angle - 0.4))
  ctx.moveTo(kx, ky)
  ctx.lineTo(kx - 12 * Math.cos(angle + 0.4), ky - 12 * Math.sin(angle + 0.4))
  ctx.stroke()
  
  // Pulsing circle at attacker
  const pulseSize = 4 + Math.sin(frame * 0.1) * 2
  ctx.beginPath()
  ctx.arc(ax, ay, pulseSize, 0, Math.PI * 2)
  ctx.fillStyle = '#ef4444'
  ctx.fill()
  
  ctx.restore()
}

/**
 * Draw time travel animation (wormhole effect)
 */
const drawTimeTravelAnimation = (ctx, anim, frame) => {
  if (!anim || !anim.active) return
  
  const elapsed = Date.now() - anim.startTime
  const progress = Math.min(1, elapsed / anim.duration)
  
  if (progress >= 1) {
    anim.active = false
    return
  }
  
  const fromX = anim.from.x
  const fromY = anim.from.y
  const toX = anim.to.x
  const toY = anim.to.y
  
  // Calculate current position (arc path)
  const midX = (fromX + toX) / 2
  const midY = (fromY + toY) / 2 - 80
  const t = progress
  const currentX = (1-t)*(1-t)*fromX + 2*(1-t)*t*midX + t*t*toX
  const currentY = (1-t)*(1-t)*fromY + 2*(1-t)*t*midY + t*t*toY
  
  // Draw glowing trail
  ctx.save()
  
  // Trail glow
  const gradient = ctx.createRadialGradient(currentX, currentY, 0, currentX, currentY, 40)
  gradient.addColorStop(0, 'rgba(168, 85, 247, 0.8)')
  gradient.addColorStop(0.5, 'rgba(34, 197, 94, 0.4)')
  gradient.addColorStop(1, 'rgba(34, 197, 94, 0)')
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.arc(currentX, currentY, 40, 0, Math.PI * 2)
  ctx.fill()
  
  // Draw wormhole ring
  const ringRadius = 20 + Math.sin(frame * 0.2) * 5
  ctx.strokeStyle = '#a855f7'
  ctx.lineWidth = 3
  ctx.shadowColor = '#a855f7'
  ctx.shadowBlur = 15
  ctx.beginPath()
  ctx.arc(currentX, currentY, ringRadius, 0, Math.PI * 2)
  ctx.stroke()
  
  // Draw the piece in the middle
  if (anim.piece) {
    const img = loadPieceImage(anim.piece)
    if (img.complete && img.naturalWidth > 0 && !img._error) {
      ctx.shadowBlur = 0
      ctx.drawImage(img, currentX - 20, currentY - 20, 40, 40)
    } else {
      ctx.font = '36px serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = anim.piece[0] === 'w' ? '#ffffff' : '#000000'
      ctx.shadowBlur = 0
      ctx.fillText(PIECE_SYMBOLS[anim.piece] || '?', currentX, currentY)
    }
  }
  
  // Draw connecting path
  ctx.strokeStyle = 'rgba(34, 197, 94, 0.6)'
  ctx.lineWidth = 2
  ctx.setLineDash([8, 4])
  ctx.shadowBlur = 0
  ctx.beginPath()
  ctx.moveTo(fromX, fromY)
  ctx.quadraticCurveTo(midX, midY, toX, toY)
  ctx.stroke()
  
  ctx.restore()
}

/**
 * Main Canvas Component
 */
const Chess5DCanvas = React.memo(({
  state,
  zoom = 1,
  pan = { x: 0, y: 0 },
  selectedPiece,
  validMoves = [],
  lastMove,
  checkBoardSet,
  checkLines = [], // Array of { from: {x,y,ti,bi}, to: {x,y,ti,bi} }
  presentTurn = 0,
  timelineActiveMap = {},
  onCellClick,
  width = 800,
  height = 600
}) => {
  const canvasRef = useRef(null)
  const frameRef = useRef(0)
  const animRef = useRef(null)

  // Preload images
  useEffect(() => {
    preloadAllPieces()
  }, [])

  // Main render function
  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    frameRef.current++

    // Clear canvas
    ctx.fillStyle = '#0d0d0d'
    ctx.fillRect(0, 0, width, height)

    // Apply pan and zoom
    ctx.save()
    ctx.translate(pan.x, pan.y)
    ctx.scale(zoom, zoom)

    // Draw timeline arrows
    if (state?.timelines) {
      state.timelines.forEach((tl, ti) => {
        if (tl.createdBy !== null && ti > 0) {
          const parentIdx = state.timelines.findIndex(t => 
            t.createdBy === tl.createdBy && t.creationOrder === tl.creationOrder - 1
          )
          if (parentIdx >= 0) {
            const pos1 = getBoardPos(parentIdx, 0)
            const pos2 = getBoardPos(ti, 0)
            const isActive = timelineActiveMap[tl.id] !== false
            drawTimelineArrow(ctx,
              pos1.x - 60,
              pos1.y + LABEL_HEIGHT + BOARD_SIZE / 2,
              pos2.y + LABEL_HEIGHT + BOARD_SIZE / 2,
              isActive ? '#a855f7' : '#555555'
            )
          }
        }
      })
    }

    // Draw present line
    const presentX = MARGIN_LEFT + presentTurn * (BOARD_SIZE + BOARD_GAP) + BOARD_SIZE / 2
    const totalHeight = Math.max(1, state?.timelines?.length || 1) * (BOARD_SIZE + TIMELINE_GAP + LABEL_HEIGHT) + 100
    drawPresentLine(ctx, presentX, -50, totalHeight, frameRef.current)

    // Draw boards
    if (state?.timelines) {
      state.timelines.forEach((tl, timelineIndex) => {
        const isActive = timelineActiveMap[tl.id] !== false
        
        tl.boards.forEach((board, boardIndex) => {
          const pos = getBoardPos(timelineIndex, board.turnNumber)
          const boardKey = `${timelineIndex},${boardIndex}`
          
          // Get valid moves for this board
          let boardValidMoves = []
          if (selectedPiece && board.isPlayable) {
            boardValidMoves = validMoves
              .filter(m => m.timelineIndex === timelineIndex && m.boardIndex === boardIndex)
              .map(m => ({ ...m, isTimeTravel: m.timelineIndex !== selectedPiece.timelineIndex }))
          }
          
          // Last move
          let boardLastMove = null
          if (lastMove && (
            (lastMove.from.timelineIndex === timelineIndex && lastMove.from.boardIndex === boardIndex) ||
            (lastMove.to.timelineIndex === timelineIndex && lastMove.to.boardIndex === boardIndex)
          )) {
            boardLastMove = lastMove
          }

          // Get entrance animation progress
          const entranceProgress = getBoardEntranceProgress(timelineIndex)
          
          drawBoard(ctx, board.board, pos.x, pos.y, {
            isActive,
            isPlayable: board.isPlayable && isActive,
            isPresent: Math.abs(board.turnNumber - presentTurn) < 0.01 && isActive && board.activeFor === state.currentTurn,
            isInCheck: checkBoardSet?.has(boardKey) ?? false,
            activeFor: board.activeFor,
            turnNumber: board.turnNumber,
            timelineId: tl.id,
            timelineIndex,
            selectedPiece: selectedPiece?.timelineIndex === timelineIndex && selectedPiece?.boardIndex === boardIndex ? selectedPiece : null,
            validMoves: boardValidMoves,
            lastMove: boardLastMove,
            entranceProgress
          })

          // Timeline label (first board only)
          if (boardIndex === 0) {
            ctx.save()
            ctx.font = 'bold 12px monospace'
            ctx.fillStyle = isActive ? '#a855f7' : '#555555'
            ctx.textAlign = 'right'
            ctx.textBaseline = 'middle'

            const labelX = pos.x - 70
            const labelY = pos.y + LABEL_HEIGHT + BOARD_SIZE / 2

            // Arrow
            ctx.beginPath()
            ctx.moveTo(labelX + 10, labelY - 10)
            ctx.lineTo(labelX + 24, labelY)
            ctx.lineTo(labelX + 10, labelY + 10)
            ctx.fill()

            // Label
            ctx.fillText(`T${tl.id}`, labelX, labelY)
            ctx.restore()
          }
        })
      })
    }

    // Draw temporal check lines
    if (checkLines && checkLines.length > 0) {
      checkLines.forEach(line => {
        const fromBoard = state?.timelines?.[line.from.ti]?.boards?.[line.from.bi]
        const toBoard = state?.timelines?.[line.to.ti]?.boards?.[line.to.bi]
        
        if (fromBoard && toBoard) {
          const fromPos = getBoardPos(line.from.ti, fromBoard.turnNumber)
          const toPos = getBoardPos(line.to.ti, toBoard.turnNumber)
          
          drawTemporalCheckLine(ctx,
            { x: fromPos.x + line.from.x * CELL_SIZE + CELL_SIZE / 2, y: fromPos.y + LABEL_HEIGHT + line.from.y * CELL_SIZE + CELL_SIZE / 2 },
            { x: toPos.x + line.to.x * CELL_SIZE + CELL_SIZE / 2, y: toPos.y + LABEL_HEIGHT + line.to.y * CELL_SIZE + CELL_SIZE / 2 },
            frameRef.current
          )
        }
      })
    }

    // Draw time travel animation
    if (timeTravelAnimation && timeTravelAnimation.active) {
      drawTimeTravelAnimation(ctx, timeTravelAnimation, frameRef.current)
    }

    ctx.restore()

    // Continue animation loop
    animRef.current = requestAnimationFrame(render)
  }, [state, zoom, pan, selectedPiece, validMoves, lastMove, checkBoardSet, checkLines, presentTurn, timelineActiveMap, width, height])

  // Start rendering
  useEffect(() => {
    animRef.current = requestAnimationFrame(render)
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
  }, [render])

  // Handle click
  const handleClick = useCallback((e) => {
    const canvas = canvasRef.current
    if (!canvas || !onCellClick || !state?.timelines) return

    const rect = canvas.getBoundingClientRect()
    const clientX = e.clientX - rect.left
    const clientY = e.clientY - rect.top

    const worldX = (clientX - pan.x) / zoom
    const worldY = (clientY - pan.y) / zoom

    for (let ti = 0; ti < state.timelines.length; ti++) {
      for (let bi = 0; bi < state.timelines[ti].boards.length; bi++) {
        const board = state.timelines[ti].boards[bi]
        const pos = getBoardPos(ti, board.turnNumber)
        const boardX = pos.x
        const boardY = pos.y + LABEL_HEIGHT

        if (worldX >= boardX && worldX < boardX + BOARD_SIZE &&
            worldY >= boardY && worldY < boardY + BOARD_SIZE) {
          const cellX = Math.floor((worldX - boardX) / CELL_SIZE)
          const cellY = Math.floor((worldY - boardY) / CELL_SIZE)

          if (cellX >= 0 && cellX < 8 && cellY >= 0 && cellY < 8) {
            onCellClick(ti, bi, cellY, cellX)
            return
          }
        }
      }
    }
  }, [state, zoom, pan, onCellClick])

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      onClick={handleClick}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: width,
        height: height,
        cursor: 'pointer'
      }}
    />
  )
})

Chess5DCanvas.displayName = 'Chess5DCanvas'

export default Chess5DCanvas
