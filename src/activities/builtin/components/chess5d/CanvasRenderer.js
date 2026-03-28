/**
 * Canvas-based board renderer for 5D Chess with Multiverse Time Travel
 * Proper 5D Chess implementation with SVG pieces, animations, and correct spacing
 */

// Board layout constants - properly spaced like official 5D Chess
const CELL_SIZE = 48
const BOARD_SIZE = CELL_SIZE * 8
const BOARD_GAP_X = 40 // Gap between boards horizontally (time axis)
const TIMELINE_GAP_Y = 60 // Gap between timelines vertically
const LABEL_HEIGHT = 28
const MARGIN_LEFT = 100
const MARGIN_TOP = 80

// SVG Piece images (Wikimedia Commons Cburnett set)
const PIECE_SVGS = {
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

// Cache for loaded piece images
const imageCache = new Map()
const loadImage = (src) => {
  if (imageCache.has(src)) return imageCache.get(src)
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.src = src
  imageCache.set(src, img)
  return img
}

// Colors - matching official 5D Chess aesthetic
const COLORS = {
  // Board colors
  lightSquare: '#f0d9b5',
  darkSquare: '#b58863',
  
  // Highlight colors
  selectedSquare: 'rgba(255, 255, 100, 0.6)',
  validMove: 'rgba(168, 85, 247, 0.5)',
  validCapture: 'rgba(239, 68, 68, 0.5)',
  timeTravelMove: 'rgba(34, 197, 94, 0.5)', // Green for time travel
  
  // Last move colors
  lastMoveFrom: '#cdd16f',
  lastMoveTo: '#cdd16f',
  
  // Check colors
  inCheck: 'rgba(239, 68, 68, 0.4)',
  inCheckBorder: '#ef4444',
  
  // Present highlight
  presentBoard: 'rgba(168, 85, 247, 0.12)',
  presentBorder: '#a855f7',
  
  // Board borders
  whiteTurnOutline: '#e5e5e5',
  blackTurnOutline: '#525252',
  inactiveOutline: '#3a3a3a',
  historyOutline: '#2a2a2a',
  
  // Text colors
  whiteText: '#f5f5f5',
  blackText: '#a0a0a0',
  inactiveText: '#555555',
  
  // Timeline arrow colors
  activeTimeline: '#a855f7',
  inactiveTimelineWhite: '#60a5fa',
  inactiveTimelineBlack: '#fb7185',
  
  // Time travel path colors
  timeTravelPath: '#22c55e',
  timeTravelGlow: 'rgba(34, 197, 94, 0.6)',
}

// Animation state
let animationFrame = 0
let timeTravelAnimations = []
let timelineBranchAnimations = []

/**
 * Preload all piece images
 */
export const preloadPieceImages = () => {
  Object.values(PIECE_SVGS).forEach(src => loadImage(src))
}

/**
 * Add a time travel animation
 */
export const addTimeTravelAnimation = (fromPos, toPos, duration = 800) => {
  timeTravelAnimations.push({
    from: fromPos,
    to: toPos,
    startTime: Date.now(),
    duration
  })
}

/**
 * Add a timeline branch animation
 */
export const addTimelineBranchAnimation = (y, duration = 600) => {
  timelineBranchAnimations.push({
    y,
    startTime: Date.now(),
    duration
  })
}

/**
 * Render a single chess board to canvas with proper 5D Chess styling
 */
export const renderBoard = (
  ctx,
  board,
  x,
  y,
  {
    isSelected = false,
    selectedCell = null,
    validMoves = [],
    lastMove = null,
    isInCheck = false,
    inCheckKingPos = null,
    isPlayable = false,
    isPresent = false,
    isHistory = false,
    isActive = true,
    activeFor = 'w',
    turnNumber = 0,
    timelineId = 0,
    boardIndex = 0,
    temporalCheckLine = null // Line from attacker to king across timelines
  } = {}
) => {
  ctx.save()
  
  // Board background
  ctx.fillStyle = isPlayable ? '#1a1a1a' : '#111111'
  ctx.fillRect(x, y + LABEL_HEIGHT, BOARD_SIZE, BOARD_SIZE)
  
  // Present highlight - subtle purple tint
  if (isPresent) {
    ctx.fillStyle = COLORS.presentBoard
    ctx.fillRect(x, y + LABEL_HEIGHT, BOARD_SIZE, BOARD_SIZE)
  }
  
  // Draw squares with proper chess colors
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const isLight = (row + col) % 2 === 0
      const squareX = x + col * CELL_SIZE
      const squareY = y + LABEL_HEIGHT + row * CELL_SIZE
      
      // Base square color
      ctx.fillStyle = isLight ? COLORS.lightSquare : COLORS.darkSquare
      
      // Last move highlight (yellow-ish like official)
      if (lastMove) {
        if (lastMove.from.x === col && lastMove.from.y === row) {
          ctx.fillStyle = COLORS.lastMoveFrom
        }
        if (lastMove.to.x === col && lastMove.to.y === row) {
          ctx.fillStyle = COLORS.lastMoveTo
        }
      }
      
      // Selected square highlight
      if (selectedCell && selectedCell.x === col && selectedCell.y === row) {
        ctx.fillStyle = COLORS.selectedSquare
      }
      
      // In check highlight on king square
      if (isInCheck && inCheckKingPos && inCheckKingPos.x === col && inCheckKingPos.y === row) {
        ctx.fillStyle = COLORS.inCheck
      }
      
      ctx.fillRect(squareX, squareY, CELL_SIZE, CELL_SIZE)
    }
  }
  
  // Draw pieces using SVG images
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row]?.[col]
      if (piece && PIECE_SVGS[piece]) {
        const img = loadImage(PIECE_SVGS[piece])
        const squareX = x + col * CELL_SIZE
        const squareY = y + LABEL_HEIGHT + row * CELL_SIZE
        
        // Draw piece with shadow for depth
        ctx.save()
        ctx.shadowColor = 'rgba(0, 0, 0, 0.4)'
        ctx.shadowBlur = 3
        ctx.shadowOffsetX = 1
        ctx.shadowOffsetY = 2
        
        if (img.complete && img.naturalWidth > 0) {
          ctx.drawImage(img, squareX + 2, squareY + 2, CELL_SIZE - 4, CELL_SIZE - 4)
        } else {
          // Fallback to Unicode if image not loaded
          ctx.font = `${CELL_SIZE - 8}px serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillStyle = piece[0] === 'w' ? '#ffffff' : '#000000'
          const symbols = {
            wk: '♔', wq: '♕', wr: '♖', wb: '♗', wn: '♘', wp: '♙',
            bk: '♚', bq: '♛', br: '♜', bb: '♝', bn: '♞', bp: '♟'
          }
          ctx.fillText(symbols[piece] || '?', squareX + CELL_SIZE / 2, squareY + CELL_SIZE / 2)
        }
        ctx.restore()
      }
    }
  }
  
  // Draw valid move indicators
  validMoves.forEach(move => {
    const moveX = x + move.x * CELL_SIZE + CELL_SIZE / 2
    const moveY = y + LABEL_HEIGHT + move.y * CELL_SIZE + CELL_SIZE / 2
    const isCapture = board[move.y]?.[move.x]
    const isTimeTravel = move.isTimeTravel || false
    
    ctx.save()
    
    if (isTimeTravel) {
      // Time travel move: green ring with glow
      ctx.shadowColor = COLORS.timeTravelGlow
      ctx.shadowBlur = 8
      ctx.beginPath()
      ctx.arc(moveX, moveY, CELL_SIZE / 2 - 6, 0, Math.PI * 2)
      ctx.strokeStyle = COLORS.timeTravelMove
      ctx.lineWidth = 3
      ctx.stroke()
    } else if (isCapture) {
      // Capture: red ring
      ctx.beginPath()
      ctx.arc(moveX, moveY, CELL_SIZE / 2 - 4, 0, Math.PI * 2)
      ctx.strokeStyle = COLORS.validCapture
      ctx.lineWidth = 3
      ctx.stroke()
    } else {
      // Normal move: purple dot
      ctx.beginPath()
      ctx.arc(moveX, moveY, CELL_SIZE / 5, 0, Math.PI * 2)
      ctx.fillStyle = COLORS.validMove
      ctx.fill()
    }
    
    ctx.restore()
  })
  
  // Draw board border with proper styling
  ctx.save()
  
  // Check border (red if in check)
  if (isInCheck) {
    ctx.strokeStyle = COLORS.inCheckBorder
    ctx.lineWidth = 4
    ctx.shadowColor = 'rgba(239, 68, 68, 0.6)'
    ctx.shadowBlur = 12
    ctx.strokeRect(x, y + LABEL_HEIGHT, BOARD_SIZE, BOARD_SIZE)
    ctx.shadowBlur = 0
  }
  
  // Main border
  let borderColor = COLORS.historyOutline
  let borderWidth = 1
  
  if (isPlayable) {
    borderColor = activeFor === 'w' ? COLORS.whiteTurnOutline : COLORS.blackTurnOutline
    borderWidth = 3
  } else if (isPresent) {
    borderColor = COLORS.presentBorder
    borderWidth = 2
  }
  
  ctx.strokeStyle = borderColor
  ctx.lineWidth = borderWidth
  ctx.strokeRect(x, y + LABEL_HEIGHT, BOARD_SIZE, BOARD_SIZE)
  
  ctx.restore()
  
  // Draw board label (top)
  ctx.save()
  ctx.font = '11px monospace'
  ctx.fillStyle = isActive 
    ? (activeFor === 'w' ? COLORS.whiteText : COLORS.blackText)
    : COLORS.inactiveText
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText(`T${timelineId}·${turnNumber.toFixed(1)}`, x, y + 4)
  
  // Playable indicator (who's turn)
  if (isPlayable) {
    ctx.font = 'bold 10px monospace'
    ctx.fillStyle = activeFor === 'w' ? '#ffffff' : '#888888'
    ctx.fillText(activeFor === 'w' ? '● White' : '● Black', x + 80, y + 4)
  }
  
  ctx.restore()
}

/**
 * Render timeline arrow/connection with proper styling
 */
export const renderTimelineArrow = (
  ctx,
  x,
  y1,
  y2,
  {
    color = '#a855f7',
    isActive = true,
    timelineId = 0
  } = {}
) => {
  ctx.save()
  
  const arrowColor = isActive ? color : (color === '#a855f7' ? '#555555' : color)
  
  // Dashed line
  ctx.strokeStyle = arrowColor
  ctx.lineWidth = 2
  ctx.setLineDash([8, 4])
  ctx.globalAlpha = isActive ? 0.9 : 0.4
  
  ctx.beginPath()
  ctx.moveTo(x, y1)
  ctx.lineTo(x, y2)
  ctx.stroke()
  
  // Arrow head pointing to child timeline
  ctx.setLineDash([])
  ctx.beginPath()
  ctx.moveTo(x - 8, y1 + 10)
  ctx.lineTo(x, y1)
  ctx.lineTo(x + 8, y1 + 10)
  ctx.strokeStyle = arrowColor
  ctx.lineWidth = 2
  ctx.stroke()
  
  // Timeline label
  ctx.font = 'bold 11px monospace'
  ctx.fillStyle = arrowColor
  ctx.textAlign = 'center'
  ctx.fillText(`T${timelineId}`, x, (y1 + y2) / 2)
  
  ctx.restore()
}

/**
 * Render present line with proper styling and animation
 */
export const renderPresentLine = (
  ctx,
  x,
  y,
  height,
  { animationOffset = 0 } = {}
) => {
  ctx.save()
  
  // Glow effect
  const gradient = ctx.createLinearGradient(x, y, x, y + height)
  gradient.addColorStop(0, 'rgba(168, 85, 247, 0.95)')
  gradient.addColorStop(0.5, 'rgba(168, 85, 247, 0.7)')
  gradient.addColorStop(1, 'rgba(168, 85, 247, 0.4)')
  
  // Animated glow pulse
  const pulseOffset = Math.sin(animationOffset * 0.05) * 2
  
  ctx.fillStyle = gradient
  ctx.fillRect(x - 3 - pulseOffset, y, 6 + pulseOffset * 2, height)
  
  // Core line
  ctx.fillStyle = '#a855f7'
  ctx.fillRect(x - 1, y, 2, height)
  
  // "PRESENT" label at top (rotated)
  ctx.save()
  ctx.translate(x - 16, y + 30)
  ctx.rotate(-Math.PI / 2)
  ctx.font = 'bold 10px sans-serif'
  ctx.fillStyle = '#a855f7'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('PRESENT', 0, 0)
  ctx.restore()
  
  ctx.restore()
}

/**
 * Render time travel path/arrow between boards
 */
export const renderTimeTravelPath = (
  ctx,
  fromX,
  fromY,
  toX,
  toY,
  {
    color = '#22c55e',
    isAnimating = false,
    progress = 1
  } = {}
) => {
  ctx.save()
  
  // Glowing path
  ctx.strokeStyle = color
  ctx.lineWidth = 3
  ctx.shadowColor = color
  ctx.shadowBlur = 10
  ctx.setLineDash([6, 3])
  
  ctx.beginPath()
  ctx.moveTo(fromX, fromY)
  
  // Curved path for visual appeal
  const midX = (fromX + toX) / 2
  const midY = (fromY + toY) / 2 - 30
  ctx.quadraticCurveTo(midX, midY, toX, toY)
  ctx.stroke()
  
  // Animated particle along path
  if (isAnimating && progress < 1) {
    const t = progress
    const px = (1 - t) * (1 - t) * fromX + 2 * (1 - t) * t * midX + t * t * toX
    const py = (1 - t) * (1 - t) * fromY + 2 * (1 - t) * t * midY + t * t * toY
    
    ctx.beginPath()
    ctx.arc(px, py, 6, 0, Math.PI * 2)
    ctx.fillStyle = '#ffffff'
    ctx.shadowBlur = 15
    ctx.fill()
  }
  
  // Arrow head
  ctx.setLineDash([])
  const angle = Math.atan2(toY - fromY, toX - fromX)
  ctx.beginPath()
  ctx.moveTo(toX, toY)
  ctx.lineTo(toX - 10 * Math.cos(angle - 0.3), toY - 10 * Math.sin(angle - 0.3))
  ctx.moveTo(toX, toY)
  ctx.lineTo(toX - 10 * Math.cos(angle + 0.3), toY - 10 * Math.sin(angle + 0.3))
  ctx.stroke()
  
  ctx.restore()
}

/**
 * Render temporal check line (from attacker to king across timelines)
 */
export const renderTemporalCheckLine = (
  ctx,
  attackerPos,
  kingPos,
  attackerBoardPos,
  kingBoardPos
) => {
  ctx.save()
  
  ctx.strokeStyle = '#ef4444'
  ctx.lineWidth = 2
  ctx.setLineDash([4, 4])
  ctx.shadowColor = 'rgba(239, 68, 68, 0.6)'
  ctx.shadowBlur = 8
  
  const startX = attackerBoardPos.x + attackerPos.x * CELL_SIZE + CELL_SIZE / 2
  const startY = attackerBoardPos.y + attackerPos.y * CELL_SIZE + CELL_SIZE / 2
  const endX = kingBoardPos.x + kingPos.x * CELL_SIZE + CELL_SIZE / 2
  const endY = kingBoardPos.y + kingPos.y * CELL_SIZE + CELL_SIZE / 2
  
  ctx.beginPath()
  ctx.moveTo(startX, startY)
  ctx.lineTo(endX, endY)
  ctx.stroke()
  
  ctx.restore()
}

/**
 * Render timeline branch animation
 */
export const renderTimelineBranchAnimation = (
  ctx,
  x,
  startY,
  endY,
  progress
) => {
  ctx.save()
  
  const currentY = startY + (endY - startY) * progress
  
  // Expanding line
  ctx.strokeStyle = `rgba(168, 85, 247, ${progress})`
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(x, startY)
  ctx.lineTo(x, currentY)
  ctx.stroke()
  
  // Particle effect at the end
  ctx.beginPath()
  ctx.arc(x, currentY, 8 * progress, 0, Math.PI * 2)
  ctx.fillStyle = `rgba(168, 85, 247, ${1 - progress})`
  ctx.fill()
  
  ctx.restore()
}

/**
 * Calculate the position of a board in the multiverse
 */
export const getBoardPosition = (
  timelineIndex,
  boardIndex,
  turnNumber,
  options = {}
) => {
  const {
    marginX = MARGIN_LEFT,
    marginY = MARGIN_TOP,
    boardGap = BOARD_GAP_X,
    timelineGap = TIMELINE_GAP_Y
  } = options
  
  // X position is based on turn number (time axis)
  const x = marginX + turnNumber * (BOARD_SIZE + boardGap)
  
  // Y position is based on timeline index (parallel universes axis)
  const y = marginY + timelineIndex * (BOARD_SIZE + timelineGap + LABEL_HEIGHT)
  
  return { x, y }
}

/**
 * Get board center position for arrow drawing
 */
export const getBoardCenter = (x, y) => ({
  x: x + BOARD_SIZE / 2,
  y: y + LABEL_HEIGHT + BOARD_SIZE / 2
})

export {
  CELL_SIZE,
  BOARD_SIZE,
  BOARD_GAP_X,
  TIMELINE_GAP_Y,
  LABEL_HEIGHT,
  MARGIN_LEFT,
  MARGIN_TOP,
  COLORS,
  PIECE_SVGS
}
