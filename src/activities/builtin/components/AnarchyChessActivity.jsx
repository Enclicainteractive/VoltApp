import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react'

/**
 * Anarchy Chess - 4 Player Real-Time Chess
 * ─────────────────────────────────────────
 * Plus-shaped board with corners as OOB.
 * No turns! All players move simultaneously.
 * 0.5s cooldown per player after each move.
 * Players start on their respective arms of the plus.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const PLAYER_COLORS = ['w', 'r', 'b', 'g'] // white, red, blue, green

// Player colors for UI - each player starts on an arm
const PLAYER_UI_COLORS = {
  w: { primary: '#f5f5f5', secondary: '#e0e0e0', dark: '#9e9e9e', name: 'White', position: 'bottom' },
  r: { primary: '#ef4444', secondary: '#dc2626', dark: '#991b1b', name: 'Red', position: 'right' },
  b: { primary: '#3b82f6', secondary: '#2563eb', dark: '#1e40af', name: 'Blue', position: 'top' },
  g: { primary: '#22c55e', secondary: '#16a34a', dark: '#166534', name: 'Green', position: 'left' },
}

const COOLDOWN_MS = 500

// Piece helpers
const pieceColor = p => p ? p[0] : null
const pieceType = p => p ? p[1] : null

const inBounds = (x, y) => x >= 0 && y >= 0 && x < BOARD_SIZE && y < BOARD_SIZE

// ═══════════════════════════════════════════════════════════════════════════════
// BOARD GEOMETRY - Plus-shaped 14x14 board
// ═══════════════════════════════════════════════════════════════════════════════

const BOARD_SIZE = 14

// Plus-shaped board: corners are OOB
// Top arm: rows 0-3, cols 4-9
// Bottom arm: rows 10-13, cols 4-9  
// Left arm: rows 4-9, cols 0-3
// Right arm: rows 4-9, cols 10-13
// Center: rows 4-9, cols 4-9

const isOOB = (x, y) => {
  if (!inBounds(x, y)) return true
  // Four corners are out of bounds
  if (x < 4 && y < 4) return true    // Top-left corner
  if (x > 9 && y < 4) return true    // Top-right corner
  if (x < 4 && y > 9) return true    // Bottom-left corner
  if (x > 9 && y > 9) return true    // Bottom-right corner
  return false
}

// Player start zones (where they place pieces initially)
const PLAYER_START_ZONE = {
  w: (x, y) => y >= 10 && y <= 13 && x >= 4 && x <= 9,  // Bottom arm
  r: (x, y) => x >= 10 && x <= 13 && y >= 4 && y <= 9,  // Right arm
  b: (x, y) => y >= 0 && y <= 3 && x >= 4 && x <= 9,    // Top arm
  g: (x, y) => x >= 0 && x <= 3 && y >= 4 && y <= 9,    // Left arm
}

// Direction each player moves (forward)
const PLAYER_FORWARD = {
  w: { dx: 0, dy: -1 },  // White moves up
  r: { dx: -1, dy: 0 },  // Red moves left
  b: { dx: 0, dy: 1 },   // Blue moves down
  g: { dx: 1, dy: 0 },   // Green moves right
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUDIO ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

let _audioCtx = null
const getAudioCtx = () => {
  if (!_audioCtx) {
    try { _audioCtx = new (window.AudioContext || window.webkitAudioContext)() } catch {}
  }
  return _audioCtx
}

const playTone = (freq, duration, type = 'sine', volume = 0.3) => {
  const ctx = getAudioCtx()
  if (!ctx) return
  try {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = type
    osc.frequency.setValueAtTime(freq, ctx.currentTime)
    gain.gain.setValueAtTime(0.001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(volume, ctx.currentTime + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + duration + 0.05)
  } catch {}
}

const SFX = {
  move: () => playTone(440, 0.08, 'sine', 0.2),
  capture: () => playTone(220, 0.15, 'sawtooth', 0.25),
  invalid: () => playTone(150, 0.1, 'square', 0.2),
  select: () => playTone(600, 0.05, 'sine', 0.15),
  check: () => { playTone(880, 0.15, 'square', 0.3); playTone(660, 0.15, 'square', 0.25, 0.18) },
  checkmate: () => { playTone(440, 0.3, 'sawtooth', 0.4); playTone(330, 0.3, 'sawtooth', 0.35, 0.35) },
  gameStart: () => [523, 659, 784, 1047].forEach((f, i) => playTone(f, 0.2, 'sine', 0.3)),
  cooldown: () => playTone(200, 0.05, 'square', 0.1),
}

// ═══════════════════════════════════════════════════════════════════════════════
// BOARD SETUP - Players start on arms, NOT corners
// ═══════════════════════════════════════════════════════════════════════════════

const makeInitialBoard = () => {
  const board = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null))
  
  // White pieces - Bottom arm (rows 11-13, cols 4-9)
  // Back row (row 13): R N B Q K B N R
  board[13][4] = 'wr'; board[13][5] = 'wn'; board[13][6] = 'wb'; board[13][7] = 'wq'
  board[13][8] = 'wk'; board[13][9] = 'wb'  // Note: king at col 8, extra bishop at 9
  // Knight and rook on right side
  board[13][10] = null // OOB anyway
  // Fix: proper setup
  board[13][4] = 'wr'; board[13][5] = 'wn'; board[13][6] = 'wb'; board[13][7] = 'wk'
  board[13][8] = 'wq'; board[13][9] = 'wr'
  // Pawns on row 11
  for (let x = 4; x <= 9; x++) board[11][x] = 'wp'
  
  // Red pieces - Right arm (cols 11-13, rows 4-9)
  // Back column (col 11): pieces face left
  board[4][11] = 'rr'; board[5][11] = 'rn'; board[6][11] = 'rb'; board[7][11] = 'rk'
  board[8][11] = 'rq'; board[9][11] = 'rr'
  // Pawns on col 10
  for (let y = 4; y <= 9; y++) board[y][10] = 'rp'
  
  // Blue pieces - Top arm (rows 0-3, cols 4-9)
  // Back row (row 0): pieces face down
  board[0][4] = 'br'; board[0][5] = 'bn'; board[0][6] = 'bb'; board[0][7] = 'bq'
  board[0][8] = 'bk'; board[0][9] = 'br'
  // Pawns on row 2
  for (let x = 4; x <= 9; x++) board[2][x] = 'bp'
  
  // Green pieces - Left arm (cols 0-3, rows 4-9)
  // Back column (col 2): pieces face right
  board[4][2] = 'gr'; board[5][2] = 'gn'; board[6][2] = 'gb'; board[7][2] = 'gk'
  board[8][2] = 'gq'; board[9][2] = 'gr'
  // Pawns on col 3
  for (let y = 4; y <= 9; y++) board[y][3] = 'gp'
  
  return board
}

// ═══════════════════════════════════════════════════════════════════════════════
// MOVE VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

const pathClear2D = (board, fx, fy, tx, ty) => {
  const sx = Math.sign(tx - fx), sy = Math.sign(ty - fy)
  let x = fx + sx, y = fy + sy
  while (x !== tx || y !== ty) {
    if (isOOB(x, y)) return false
    if (board[y]?.[x]) return false
    x += sx; y += sy
  }
  return true
}

const isLegalMove = (board, fromX, fromY, toX, toY) => {
  if (isOOB(fromX, fromY) || isOOB(toX, toY)) return false
  if (fromX === toX && fromY === toY) return false
  
  const piece = board[fromY]?.[fromX]
  if (!piece) return false
  
  const pColor = pieceColor(piece)
  const pType = pieceType(piece)
  
  const dest = board[toY]?.[toX]
  if (dest && pieceColor(dest) === pColor) return false
  
  const dx = toX - fromX, dy = toY - fromY
  const ax = Math.abs(dx), ay = Math.abs(dy)
  
  switch (pType) {
    case 'p': {
      // Pawn direction depends on player
      const fwd = PLAYER_FORWARD[pColor]
      // Check if moving forward
      const isForward = dx === fwd.dx && dy === fwd.dy
      const isDoubleForward = dx === 0 && dy === 2 * fwd.dy && dx === 0
      const isDiagonal = ax === 1 && ay === 1 && 
        ((fwd.dx !== 0 && Math.sign(dx) === fwd.dx && dy === 0) || 
         (fwd.dy !== 0 && Math.sign(dy) === fwd.dy && dx === 0))
      
      // Single forward
      if (isForward && !dest) return true
      
      // Double forward from starting position
      const startRow = pColor === 'w' ? 11 : pColor === 'b' ? 2 : fromY
      const startCol = pColor === 'r' ? 10 : pColor === 'g' ? 3 : fromX
      
      if (isDoubleForward && !dest) {
        if ((pColor === 'w' || pColor === 'b') && fromY === startRow) {
          const midY = fromY + fwd.dy
          if (!board[midY]?.[fromX]) return true
        }
        if ((pColor === 'r' || pColor === 'g') && fromX === startCol) {
          const midX = fromX + fwd.dx
          if (!board[fromY]?.[midX]) return true
        }
      }
      
      // Diagonal capture
      if (isDiagonal && dest) return true
      
      return false
    }
    case 'n': {
      // Knight: L-shape
      return (ax === 2 && ay === 1) || (ax === 1 && ay === 2)
    }
    case 'b': {
      // Bishop: diagonal
      if (ax !== ay) return false
      return pathClear2D(board, fromX, fromY, toX, toY)
    }
    case 'r': {
      // Rook: straight
      if (dx !== 0 && dy !== 0) return false
      return pathClear2D(board, fromX, fromY, toX, toY)
    }
    case 'q': {
      // Queen: straight + diagonal
      if (dx !== 0 && dy !== 0 && ax !== ay) return false
      return pathClear2D(board, fromX, fromY, toX, toY)
    }
    case 'k': {
      // King: one square any direction
      return ax <= 1 && ay <= 1 && (ax + ay > 0)
    }
    default:
      return false
  }
}

const getLegalMoves = (board, fromX, fromY) => {
  const moves = []
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      if (isLegalMove(board, fromX, fromY, x, y)) {
        moves.push({ x, y })
      }
    }
  }
  return moves
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHECK DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

const findKing = (board, color) => {
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      if (isOOB(x, y)) continue
      const p = board[y][x]
      if (p && pieceColor(p) === color && pieceType(p) === 'k') {
        return { x, y }
      }
    }
  }
  return null
}

const isSquareAttacked = (board, tx, ty, attackerColor) => {
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      if (isOOB(x, y)) continue
      const p = board[y][x]
      if (!p || pieceColor(p) !== attackerColor) continue
      if (isLegalMove(board, x, y, tx, ty)) return true
    }
  }
  return false
}

const isInCheck = (board, color, allColors) => {
  const king = findKing(board, color)
  if (!king) return false
  
  for (const c of allColors) {
    if (c === color) continue
    if (isSquareAttacked(board, king.x, king.y, c)) return true
  }
  return false
}

const hasAnyLegalMove = (board, color) => {
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      if (isOOB(x, y)) continue
      const p = board[y][x]
      if (!p || pieceColor(p) !== color) continue
      const moves = getLegalMoves(board, x, y)
      if (moves.length > 0) return true
    }
  }
  return false
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

const makeInitialState = () => ({
  phase: 'lobby',
  board: makeInitialBoard(),
  players: {},
  playerOrder: [...PLAYER_COLORS],
  cooldowns: {},
  // selectedCell is per-player, NOT synced - stored in local component state
  moveHistory: [],
  eliminatedPlayers: [],
  message: 'Waiting for players to join...',
  winner: null,
  winReason: null,
  lastMove: null,
})

const deepClone = obj => JSON.parse(JSON.stringify(obj))

// ═══════════════════════════════════════════════════════════════════════════════
// CANVAS RENDERING - Plus-shaped board
// ═══════════════════════════════════════════════════════════════════════════════

const CELL_SIZE = 40
const PADDING = 50
const CANVAS_SIZE = BOARD_SIZE * CELL_SIZE + PADDING * 2

const PIECE_SYMBOLS = {
  wk: '♔', wq: '♕', wr: '♖', wb: '♗', wn: '♘', wp: '♙',
  rk: '♚', rq: '♛', rr: '♜', rb: '♝', rn: '♞', rp: '♟',
  bk: '♚', bq: '♛', br: '♜', bb: '♝', bn: '♞', bp: '♟',
  gk: '♚', gq: '♛', gr: '♜', gb: '♝', gn: '♞', gp: '♟',
}

const PIECE_TEXT_COLORS = {
  w: '#1a1a1a',
  r: '#ffffff',
  b: '#ffffff',
  g: '#ffffff',
}

const renderBoard = (ctx, state, selectedCell, validMoves) => {
  const { board, playerOrder, cooldowns, eliminatedPlayers } = state
  
  // Background
  ctx.fillStyle = '#1a1a2e'
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)
  
  // Draw cells
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      const px = PADDING + x * CELL_SIZE
      const py = PADDING + y * CELL_SIZE
      
      if (isOOB(x, y)) {
        // OOB corner - dark background
        ctx.fillStyle = '#0d0d1a'
        ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE)
        continue
      }
      
      // Checkerboard pattern
      const isLight = (x + y) % 2 === 0
      let fillColor = isLight ? '#e8d4b8' : '#b58863'
      
      // Tint player home zones
      for (const color of playerOrder) {
        if (PLAYER_START_ZONE[color](x, y)) {
          const tint = PLAYER_UI_COLORS[color]
          ctx.fillStyle = fillColor
          ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE)
          ctx.fillStyle = `${tint.primary}25`
          ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE)
          ctx.strokeStyle = `${tint.primary}40`
          ctx.lineWidth = 1
          ctx.strokeRect(px, py, CELL_SIZE, CELL_SIZE)
          continue
        }
      }
      
      ctx.fillStyle = fillColor
      ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE)
      
      // Cell border
      ctx.strokeStyle = '#555'
      ctx.lineWidth = 0.5
      ctx.strokeRect(px, py, CELL_SIZE, CELL_SIZE)
    }
  }
  
  // Draw valid move indicators
  if (validMoves) {
    for (const move of validMoves) {
      const px = PADDING + move.x * CELL_SIZE + CELL_SIZE / 2
      const py = PADDING + move.y * CELL_SIZE + CELL_SIZE / 2
      const hasCapture = board[move.y][move.x]
      
      ctx.beginPath()
      if (hasCapture) {
        ctx.arc(px, py, CELL_SIZE / 2 - 3, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(255, 80, 80, 0.9)'
        ctx.lineWidth = 3
        ctx.stroke()
      } else {
        ctx.arc(px, py, 8, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)'
        ctx.fill()
      }
    }
  }
  
  // Highlight selected cell
  if (selectedCell) {
    const px = PADDING + selectedCell.x * CELL_SIZE
    const py = PADDING + selectedCell.y * CELL_SIZE
    ctx.strokeStyle = '#ffd700'
    ctx.lineWidth = 3
    ctx.strokeRect(px + 2, py + 2, CELL_SIZE - 4, CELL_SIZE - 4)
  }
  
  // Draw pieces
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      if (isOOB(x, y)) continue
      const piece = board[y][x]
      if (!piece) continue
      
      const px = PADDING + x * CELL_SIZE + CELL_SIZE / 2
      const py = PADDING + y * CELL_SIZE + CELL_SIZE / 2
      const pColor = pieceColor(piece)
      const uiColor = PLAYER_UI_COLORS[pColor]
      
      // Piece circle
      ctx.beginPath()
      ctx.arc(px, py, CELL_SIZE / 2 - 5, 0, Math.PI * 2)
      ctx.fillStyle = uiColor.primary
      ctx.fill()
      ctx.strokeStyle = uiColor.dark
      ctx.lineWidth = 2
      ctx.stroke()
      
      // Piece symbol
      const symbol = PIECE_SYMBOLS[piece] || '?'
      ctx.fillStyle = PIECE_TEXT_COLORS[pColor] || '#000'
      ctx.font = 'bold 18px serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(symbol, px, py + 1)
    }
  }
  
  // Draw last move highlight
  if (state.lastMove) {
    const { from, to } = state.lastMove
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.6)'
    ctx.lineWidth = 3
    
    const fx = PADDING + from.x * CELL_SIZE
    const fy = PADDING + from.y * CELL_SIZE
    ctx.strokeRect(fx + 1, fy + 1, CELL_SIZE - 2, CELL_SIZE - 2)
    
    const tx = PADDING + to.x * CELL_SIZE
    const ty = PADDING + to.y * CELL_SIZE
    ctx.strokeRect(tx + 1, ty + 1, CELL_SIZE - 2, CELL_SIZE - 2)
    
    // Draw line between from and to
    ctx.beginPath()
    ctx.moveTo(fx + CELL_SIZE / 2, fy + CELL_SIZE / 2)
    ctx.lineTo(tx + CELL_SIZE / 2, ty + CELL_SIZE / 2)
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.3)'
    ctx.lineWidth = 2
    ctx.stroke()
  }
  
  // Draw player indicators and cooldowns
  const now = Date.now()
  ctx.font = 'bold 12px monospace'
  
  // White indicator (bottom)
  drawPlayerIndicator(ctx, 'w', 20, CANVAS_SIZE - 30, now, cooldowns, eliminatedPlayers)
  // Red indicator (right)
  drawPlayerIndicator(ctx, 'r', CANVAS_SIZE - 100, CANVAS_SIZE - 30, now, cooldowns, eliminatedPlayers)
  // Blue indicator (top)  
  drawPlayerIndicator(ctx, 'b', 20, 20, now, cooldowns, eliminatedPlayers)
  // Green indicator (left)
  drawPlayerIndicator(ctx, 'g', CANVAS_SIZE - 100, 20, now, cooldowns, eliminatedPlayers)
}

const drawPlayerIndicator = (ctx, color, x, y, now, cooldowns, eliminatedPlayers) => {
  const ui = PLAYER_UI_COLORS[color]
  const cooldownEnd = cooldowns[color] || 0
  const remaining = Math.max(0, cooldownEnd - now)
  const eliminated = eliminatedPlayers.includes(color)
  
  // Player color circle
  ctx.beginPath()
  ctx.arc(x, y, 8, 0, Math.PI * 2)
  ctx.fillStyle = eliminated ? '#444' : ui.primary
  ctx.fill()
  ctx.strokeStyle = ui.dark
  ctx.lineWidth = 2
  ctx.stroke()
  
  // Player name and status
  ctx.fillStyle = eliminated ? '#666' : '#fff'
  ctx.textAlign = 'left'
  let text = ui.name
  if (eliminated) text += ' X'
  else if (remaining > 0) text += ` ${(remaining / 1000).toFixed(1)}s`
  ctx.fillText(text, x + 14, y + 4)
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

const AnarchyChessActivity = ({ sdk, currentUser }) => {
  const [gs, setGs] = useState(() => makeInitialState())
  const gsRef = useRef(gs)
  const canvasRef = useRef(null)
  // selectedCell is LOCAL per-player state, NOT synced to server
  const [selectedCell, setSelectedCell] = useState(null)
  
  const userId = currentUser?.id || 'guest'
  const username = currentUser?.username || 'Player'
  
  // Determine player color
  const myColor = useMemo(() => {
    const found = Object.entries(gs.players).find(([_, p]) => p.id === userId)
    return found ? found[0] : null
  }, [gs.players, userId])
  
  useEffect(() => { gsRef.current = gs }, [gs])
  
  const push = useCallback(next => {
    const s = typeof next === 'function' ? next(gsRef.current) : next
    gsRef.current = s
    setGs(s)
    sdk?.updateState?.({ anarchyChess: s }, { serverRelay: true })
  }, [sdk])
  
  useEffect(() => {
    if (!sdk) return
    const off = sdk.subscribeServerState(st => {
      const d = st?.anarchyChess
      if (d && typeof d === 'object') {
        gsRef.current = d
        setGs(d)
      }
    })
    return () => { try { off?.() } catch {} }
  }, [sdk])
  
  // Canvas rendering - uses LOCAL selectedCell state (per-player)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const validMoves = selectedCell ? getLegalMoves(gs.board, selectedCell.x, selectedCell.y) : null
    renderBoard(ctx, gs, selectedCell, validMoves)
  }, [gs, selectedCell])
  
  const handleJoin = useCallback((color) => {
    if (!sdk || !gs.playerOrder.includes(color) || gs.players[color]) return
    SFX.select()
    push(prev => ({
      ...prev,
      players: { ...prev.players, [color]: { id: userId, username } },
      message: `${username} joined as ${PLAYER_UI_COLORS[color].name}`
    }))
  }, [sdk, userId, username, gs.playerOrder, gs.players, push])
  
  const handleLeave = useCallback(() => {
    if (!myColor) return
    SFX.invalid()
    push(prev => {
      const newPlayers = { ...prev.players }
      delete newPlayers[myColor]
      return { ...prev, players: newPlayers, message: `${username} left` }
    })
  }, [myColor, username, push])
  
  const handleStart = useCallback(() => {
    if (Object.keys(gs.players).length < 2) return
    SFX.gameStart()
    push(prev => ({ ...prev, phase: 'playing', message: 'Game started! No turns - move anytime (0.5s cooldown)' }))
  }, [gs.players, push])
  
  const handleCanvasClick = useCallback((e) => {
    if (gs.phase !== 'playing' || !myColor) return
    
    const canvas = canvasRef.current
    if (!canvas) return
    
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    
    const clickX = (e.clientX - rect.left) * scaleX
    const clickY = (e.clientY - rect.top) * scaleY
    
    const boardX = Math.floor((clickX - PADDING) / CELL_SIZE)
    const boardY = Math.floor((clickY - PADDING) / CELL_SIZE)
    
    if (isOOB(boardX, boardY)) return
    
    const now = Date.now()
    const cooldownEnd = gs.cooldowns[myColor] || 0
    
    if (now < cooldownEnd) {
      SFX.cooldown()
      return
    }
    
    const clickedPiece = gs.board[boardY][boardX]
    
    // Use LOCAL selectedCell state (per-player, not synced)
    if (selectedCell) {
      const { x: fromX, y: fromY } = selectedCell
      
      if (fromX === boardX && fromY === boardY) {
        setSelectedCell(null)  // Local state only
        return
      }
      
      if (clickedPiece && pieceColor(clickedPiece) === myColor) {
        SFX.select()
        setSelectedCell({ x: boardX, y: boardY })  // Local state only
        return
      }
      
      if (isLegalMove(gs.board, fromX, fromY, boardX, boardY)) {
        const piece = gs.board[fromY][fromX]
        const captured = gs.board[boardY][boardX]
        
        const newBoard = deepClone(gs.board)
        newBoard[boardY][boardX] = piece
        newBoard[fromY][fromX] = null
        
        // Check own king safety
        if (isInCheck(newBoard, myColor, gs.playerOrder)) {
          SFX.invalid()
          setSelectedCell(null)  // Local state only
          return
        }
        
        // Check eliminated players (king captured)
        const newEliminated = [...gs.eliminatedPlayers]
        for (const color of gs.playerOrder) {
          if (color === myColor || newEliminated.includes(color)) continue
          if (!findKing(newBoard, color)) {
            newEliminated.push(color)
          }
        }
        
        if (captured) SFX.capture()
        else SFX.move()
        
        const newCooldowns = { ...gs.cooldowns, [myColor]: now + COOLDOWN_MS }
        
        const remainingPlayers = gs.playerOrder.filter(c => !newEliminated.includes(c))
        let winner = null, winReason = null, phase = 'playing', message = ''
        
        if (remainingPlayers.length === 1) {
          winner = remainingPlayers[0]
          winReason = 'last_standing'
          phase = 'ended'
          message = `${PLAYER_UI_COLORS[winner].name} wins!`
          SFX.checkmate()
        }
        
        // Clear local selection after move
        setSelectedCell(null)
        
        // Only sync board, cooldowns, lastMove, etc. to server (not selection)
        push(prev => ({
          ...prev,
          board: newBoard,
          cooldowns: newCooldowns,
          lastMove: { from: { x: fromX, y: fromY }, to: { x: boardX, y: boardY } },
          eliminatedPlayers: newEliminated,
          winner, winReason, phase, message,
          moveHistory: [...prev.moveHistory, { from: { x: fromX, y: fromY }, to: { x: boardX, y: boardY }, player: myColor, piece, captured }]
        }))
      } else {
        SFX.invalid()
        setSelectedCell(null)  // Local state only
      }
    } else {
      if (clickedPiece && pieceColor(clickedPiece) === myColor) {
        SFX.select()
        setSelectedCell({ x: boardX, y: boardY })  // Local state only
      }
    }
  }, [gs, myColor, selectedCell, push])
  
  if (!sdk) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: '#1a1a2e', color: '#fff' }}>
        <span>Loading Anarchy Chess...</span>
      </div>
    )
  }
  
  const playerCount = Object.keys(gs.players).length
  const isPlaying = gs.phase === 'playing'
  
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', background: '#0f0f23', color: '#e2e8f0', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, color: '#f59e0b' }}>Anarchy Chess</h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#94a3b8' }}>Plus board - corners are OOB. No turns! 0.5s cooldown</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {gs.playerOrder.map(color => {
            const ui = PLAYER_UI_COLORS[color]
            const player = gs.players[color]
            const isMe = player?.id === userId
            const inCd = gs.cooldowns[color] && Date.now() < gs.cooldowns[color]
            const eliminated = gs.eliminatedPlayers.includes(color)
            
            return (
              <button
                key={color}
                onClick={() => !player && handleJoin(color)}
                disabled={!!player || isPlaying}
                style={{
                  padding: '6px 12px', borderRadius: 6,
                  border: `2px solid ${ui.primary}`,
                  background: player ? ui.primary : 'transparent',
                  color: player ? '#000' : ui.primary,
                  cursor: player ? 'default' : 'pointer',
                  opacity: eliminated ? 0.4 : 1,
                  fontSize: 12, fontWeight: isMe ? 'bold' : 'normal',
                  position: 'relative',
                }}
              >
                {player ? `${ui.name}${isMe ? ' (You)' : ''}` : `Join ${ui.name}`}
                {inCd && <span style={{ position: 'absolute', top: -4, right: -4, width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }} />}
              </button>
            )
          })}
        </div>
      </div>
      
      {gs.message && (
        <div style={{ padding: '8px 16px', background: gs.winner ? '#065f46' : '#1e293b', textAlign: 'center', fontSize: 14 }}>
          {gs.message}
        </div>
      )}
      
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <canvas
          ref={canvasRef}
          width={CANVAS_SIZE}
          height={CANVAS_SIZE}
          onClick={handleCanvasClick}
          style={{
            maxWidth: '100%', maxHeight: '100%', borderRadius: 8,
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
            cursor: gs.phase === 'playing' && myColor ? 'pointer' : 'default',
          }}
        />
      </div>
      
      <div style={{ padding: '12px 16px', borderTop: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 12, color: '#64748b' }}>
          {isPlaying ? (myColor ? `You are ${PLAYER_UI_COLORS[myColor].name}` : 'Spectating') : `Waiting (${playerCount}/4)`}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {myColor && (
            <button onClick={handleLeave} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #64748b', background: 'transparent', color: '#94a3b8', cursor: 'pointer' }}>
              Leave
            </button>
          )}
          {!isPlaying && playerCount >= 2 && (
            <button onClick={handleStart} style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: '#22c55e', color: '#fff', cursor: 'pointer', fontWeight: 'bold' }}>
              Start
            </button>
          )}
          {gs.winner && (
            <button onClick={() => { setSelectedCell(null); push(makeInitialState()) }} style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: '#3b82f6', color: '#fff', cursor: 'pointer' }}>
              New Game
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default AnarchyChessActivity
