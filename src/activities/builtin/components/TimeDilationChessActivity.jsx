import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react'
import Chess5DCanvas, { startTimeTravelAnimation, startNewBoardAnimation } from './chess5d/Chess5DCanvas'

/**
 * 5D Chess with Multiverse Time Travel
 * ─────────────────────────────────────
 * Full multiplayer — two human players, no AI.
 * Wikipedia rules exactly. Wikimedia Commons SVG pieces.
 *
 * Features:
 * - Black & White color scheme (no blue/red confusion)
 * - Animated piece placement, move trails, time travel flash
 * - Check warnings on ALL affected boards across all timelines
 * - Web Audio API sound effects (move, capture, time travel, check, checkmate)
 * - Present line, timeline arrows, playable board highlights
 * - Undo (snapshot-based), Submit, Leave, New Game
 * - Canvas-based rendering for high performance with many boards
 * - Virtualized rendering - only visible boards are drawn
 * - Zoom based on mouse position
 * - Stalemate risk warnings for both players
 * - King capture ends game immediately
 * - Proper timeline merging when time traveling to same branch point
 */

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const WHITE = 'w'
const BLACK = 'b'

const pieceColor = p => p ? p[0] : null
const pieceType  = p => p ? p[1] : null
const opp        = c => c === WHITE ? BLACK : WHITE
const inBounds   = (x, y) => x >= 0 && y >= 0 && x < 8 && y < 8

// Convert coordinates to algebraic notation
const fileToLetter = f => String.fromCharCode(97 + f) // a-h
const rankToNum = r => String(8 - r) // 1-8
const coordToAlgebraic = (x, y) => fileToLetter(x) + rankToNum(y)

// Generate algebraic notation for a move
const getMoveNotation = (move, state) => {
  const piece = move.piece
  if (!piece) return '?'
  
  const type = pieceType(piece)
  const pieceSymbol = { k: 'K', q: 'Q', r: 'R', b: 'B', n: 'N', p: '' }[type] || ''
  const from = coordToAlgebraic(move.from.x, move.from.y)
  const to = coordToAlgebraic(move.to.x, move.to.y)
  
  let notation = ''
  
  if (type === 'p' && move.isCapture) {
    notation = fileToLetter(move.from.x) + 'x' + to
  } else if (type === 'p') {
    notation = to
  } else if (move.isCapture) {
    notation = pieceSymbol + 'x' + to
  } else {
    notation = pieceSymbol + to
  }
  
  // Add timeline info for time travel
  if (move.from.timelineIndex !== move.to.timelineIndex) {
    notation += ` (T${move.to.timelineIndex})`
  }
  
  // Add promotion
  if (type === 'p' && (move.to.y === 0 || move.to.y === 7)) {
    notation += '=Q'
  }
  
  return notation
}

// Optimized deep clone - use structuredClone when available, fallback to JSON
const deepClone = typeof structuredClone === 'function'
  ? obj => structuredClone(obj)
  : obj => JSON.parse(JSON.stringify(obj))

// Wikimedia Commons SVG chess pieces (Cburnett set, transparent background)
const PIECE_IMGS = {
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
  bn: 'https://upload.wikimedia.org/wikipedia/commons/e/ef/Chess_ndt45.svg',
  bp: 'https://upload.wikimedia.org/wikipedia/commons/c/c7/Chess_pdt45.svg',
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

const playTone = (freq, duration, type = 'sine', volume = 0.3, delay = 0) => {
  const ctx = getAudioCtx()
  if (!ctx) return
  try {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = type
    osc.frequency.setValueAtTime(freq, ctx.currentTime + delay)
    gain.gain.setValueAtTime(0.001, ctx.currentTime + delay)
    gain.gain.exponentialRampToValueAtTime(volume, ctx.currentTime + delay + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration)
    osc.start(ctx.currentTime + delay)
    osc.stop(ctx.currentTime + delay + duration + 0.05)
  } catch {}
}

const playNoise = (duration, volume = 0.2, delay = 0) => {
  const ctx = getAudioCtx()
  if (!ctx) return
  try {
    const bufSize = ctx.sampleRate * duration
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / bufSize * 8)
    const src = ctx.createBufferSource()
    const gain = ctx.createGain()
    const filter = ctx.createBiquadFilter()
    src.buffer = buf
    filter.type = 'bandpass'
    filter.frequency.value = 800
    src.connect(filter)
    filter.connect(gain)
    gain.connect(ctx.destination)
    gain.gain.setValueAtTime(volume, ctx.currentTime + delay)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration)
    src.start(ctx.currentTime + delay)
  } catch {}
}

const SFX = {
  move: () => {
    playTone(440, 0.08, 'sine', 0.25)
    playTone(660, 0.06, 'sine', 0.15, 0.05)
  },
  capture: () => {
    playNoise(0.15, 0.4)
    playTone(220, 0.2, 'sawtooth', 0.2, 0.05)
  },
  timeTravel: () => {
    // Whoosh + shimmer
    for (let i = 0; i < 6; i++) {
      playTone(200 + i * 150, 0.3, 'sine', 0.15, i * 0.06)
    }
    playNoise(0.4, 0.3, 0.1)
  },
  check: () => {
    playTone(880, 0.15, 'square', 0.3)
    playTone(660, 0.15, 'square', 0.25, 0.18)
    playTone(880, 0.15, 'square', 0.3, 0.36)
  },
  checkmate: () => {
    playTone(440, 0.3, 'sawtooth', 0.4)
    playTone(330, 0.3, 'sawtooth', 0.35, 0.35)
    playTone(220, 0.6, 'sawtooth', 0.3, 0.7)
  },
  select: () => {
    playTone(600, 0.05, 'sine', 0.15)
  },
  invalid: () => {
    playTone(150, 0.1, 'square', 0.2)
  },
  gameStart: () => {
    [523, 659, 784, 1047].forEach((f, i) => playTone(f, 0.2, 'sine', 0.3, i * 0.12))
  },
  submit: () => {
    playTone(523, 0.1, 'sine', 0.25)
    playTone(784, 0.15, 'sine', 0.3, 0.12)
  },
  undo: () => {
    playTone(400, 0.08, 'sine', 0.2)
    playTone(300, 0.1, 'sine', 0.15, 0.1)
  },
}

// ═══════════════════════════════════════════════════════════════════════════════
// INITIAL STATE
// ═══════════════════════════════════════════════════════════════════════════════

const makeInitialBoard = () => [
  ['br','bn','bb','bq','bk','bb','bn','br'],
  ['bp','bp','bp','bp','bp','bp','bp','bp'],
  [null,null,null,null,null,null,null,null],
  [null,null,null,null,null,null,null,null],
  [null,null,null,null,null,null,null,null],
  [null,null,null,null,null,null,null,null],
  ['wp','wp','wp','wp','wp','wp','wp','wp'],
  ['wr','wn','wb','wq','wk','wb','wn','wr']
]

const makeInitialState = () => ({
  phase: 'lobby',
  whitePlayer: null,
  blackPlayer: null,
  whiteReady: false,
  blackReady: false,
  currentTurn: WHITE,
  timelines: [{
    id: 0,
    createdBy: null,
    creationOrder: 0,
    boards: [{
      turnNumber: 0,
      activeFor: WHITE,
      board: makeInitialBoard(),
      isPlayable: true
    }]
  }],
  selectedPiece: null,
  pendingMoves: [],
  moveHistory: [],
  winner: null,
  winReason: null,
  message: 'Waiting for players to join and ready up...',
  // Animation events (transient, not persisted long)
  lastMove: null,       // { from, to, isTimeTravel, isCapture } for animation
  inCheckBoards: [],    // [{ timelineIndex, boardIndex }] boards where current player is in check
  stalemateRisk: { white: false, black: false }, // Stalemate risk warnings
})

// ═══════════════════════════════════════════════════════════════════════════════
// TIMELINE HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

const getLatestBoard    = tl => tl.boards[tl.boards.length - 1]
const getLatestBoardIdx = tl => tl.boards.length - 1

const isTimelineActive = (state, timelineId) => {
  const tl = state.timelines.find(t => t.id === timelineId)
  if (!tl) return false
  if (tl.createdBy === null) return true
  
  // Simplified active check - avoid recursion
  // Count all timelines created by each player (not just active ones)
  const playerTimelines = state.timelines.filter(t => t.createdBy === tl.createdBy).length
  const opponentTimelines = state.timelines.filter(t => t.createdBy === opp(tl.createdBy)).length
  
  // A player's timelines are active if they have at most one more than opponent
  return playerTimelines <= opponentTimelines + 1
}

const getTimelineActiveMap = (state) => {
  const map = {}
  for (const tl of state.timelines) {
    map[tl.id] = isTimelineActive(state, tl.id)
  }
  return map
}

const tlArrowColor = (state, tl, activeMap) => {
  if (activeMap?.[tl.id] ?? isTimelineActive(state, tl.id)) return '#a855f7'
  return tl.createdBy === WHITE ? '#d4d4d4' : '#525252'
}

const calcPresentTurn = (state, activeMap) => {
  let min = Infinity
  state.timelines.forEach(tl => {
    if (!(activeMap?.[tl.id] ?? isTimelineActive(state, tl.id))) return
    const b = getLatestBoard(tl)
    if (b && b.isPlayable && b.activeFor === state.currentTurn) min = Math.min(min, b.turnNumber)
  })
  return min === Infinity ? 0 : min
}

const getPlayableBoards = (state, activeMap) =>
  state.timelines.flatMap((tl, ti) => {
    const bi = getLatestBoardIdx(tl)
    const b = tl.boards[bi]
    if (b && b.isPlayable && b.activeFor === state.currentTurn && (activeMap?.[tl.id] ?? isTimelineActive(state, tl.id))) {
      return [{ timelineIndex: ti, boardIndex: bi, board: b }]
    }
    return []
  })

const isTimeTravelMove = (from, to) =>
  to.timelineIndex !== from.timelineIndex || to.boardIndex < from.boardIndex

// ═══════════════════════════════════════════════════════════════════════════════
// PATH CHECKING
// ═══════════════════════════════════════════════════════════════════════════════

const pathClear2D = (board, fx, fy, tx, ty) => {
  const sx = Math.sign(tx - fx), sy = Math.sign(ty - fy)
  let x = fx + sx, y = fy + sy
  while (x !== tx || y !== ty) {
    if (board[y]?.[x]) return false
    x += sx; y += sy
  }
  return true
}

const pathClear4D = (state, from, to, dx, dy, dt, dl) => {
  if (dt === 0 && dl === 0) {
    const fromBoard = state.timelines[from.timelineIndex].boards[from.boardIndex]
    return pathClear2D(fromBoard.board, from.x, from.y, to.x, to.y)
  }
  const steps = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dt), Math.abs(dl))
  if (steps <= 1) return true
  const sx = dx === 0 ? 0 : Math.sign(dx)
  const sy = dy === 0 ? 0 : Math.sign(dy)
  const st = dt === 0 ? 0 : Math.sign(dt)
  const sl = dl === 0 ? 0 : Math.sign(dl)
  for (let i = 1; i < steps; i++) {
    const cx = from.x + sx * i, cy = from.y + sy * i
    const ct = from.boardIndex + st * i, cl = from.timelineIndex + sl * i
    if (!inBounds(cx, cy)) return false
    if (cl < 0 || cl >= state.timelines.length) return false
    const tl = state.timelines[cl]
    if (!tl || ct < 0 || ct >= tl.boards.length) return false
    const board = tl.boards[ct]
    if (!board || board.board[cy]?.[cx]) return false
  }
  return true
}

// ═══════════════════════════════════════════════════════════════════════════════
// MOVE VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

const isLegalMove = (state, from, to) => {
  const { timelineIndex: ft, boardIndex: fb, x: fx, y: fy } = from
  const { timelineIndex: tt, boardIndex: tb, x: tx, y: ty } = to
  if (!inBounds(fx, fy) || !inBounds(tx, ty)) return false
  if (ft < 0 || ft >= state.timelines.length || tt < 0 || tt >= state.timelines.length) return false
  const fromTL = state.timelines[ft], toTL = state.timelines[tt]
  if (!fromTL || !toTL) return false
  if (fb < 0 || fb >= fromTL.boards.length || tb < 0 || tb >= toTL.boards.length) return false
  const fromBoard = fromTL.boards[fb], toBoard = toTL.boards[tb]
  if (!fromBoard || !toBoard) return false
  if (!fromBoard.isPlayable || fromBoard.activeFor !== state.currentTurn) return false
  const piece = fromBoard.board[fy]?.[fx]
  if (!piece || pieceColor(piece) !== state.currentTurn) return false
  const dest = toBoard.board[ty]?.[tx]
  if (dest && pieceColor(dest) === state.currentTurn) return false
  if (ft === tt && fb === tb && fx === tx && fy === ty) return false
  
  // Check if this is a time travel move (creates new timeline)
  const isTimeTravel = ft !== tt || tb > fb
  
  // TIMELINE CAP: Check if player can create a new timeline
  if (isTimeTravel && !canCreateTimeline(state, state.currentTurn)) {
    return false // Player already has too many timelines
  }
  
  const dx = tx - fx, dy = ty - fy, dt = tb - fb, dl = tt - ft
  const ax = Math.abs(dx), ay = Math.abs(dy), at = Math.abs(dt), al = Math.abs(dl)
  const type = pieceType(piece)
  
  let valid = false
  switch (type) {
    case 'p': valid = validPawn(state, from, to, piece, dest, dx, dy, dt, dl, ax, ay, at, al); break
    case 'n': valid = validKnight(ax, ay, at, al); break
    case 'b': valid = validBishop(state, from, to, dx, dy, dt, dl, ax, ay, at, al); break
    case 'r': valid = validRook(state, from, to, dx, dy, dt, dl); break
    case 'q': valid = validQueen(state, from, to, dx, dy, dt, dl); break
    case 'k': valid = validKing(ax, ay, at, al); break
    default: valid = false
  }
  
  if (!valid) return false
  
  // DRAW PREVENTION: Don't allow moves that would cause a draw (unless it wins the game)
  if (wouldCauseDraw(state, from, to)) {
    return false
  }
  
  return true
}

const validPawn = (state, from, to, piece, dest, dx, dy, dt, dl, ax, ay, at, al) => {
  const color = pieceColor(piece)
  const fwd = color === WHITE ? -1 : 1
  const { timelineIndex: ft, boardIndex: fb, x: fx, y: fy } = from
  const board = state.timelines[ft].boards[fb].board
  if (dt === 0 && dl === 0) {
    if (dx === 0 && dy === fwd && !dest) return true
    const startRank = color === WHITE ? 6 : 1
    if (dx === 0 && dy === 2 * fwd && fy === startRank && !dest && !board[fy + fwd]?.[fx]) return true
    if (ax === 1 && dy === fwd && dest) return true
    return false
  }
  if (dx === 0 && dy === 0) {
    if (dt === 0 && dl === fwd && !dest) return true
    if (at === 1 && dl === fwd && dest) return true
    return false
  }
  return false
}

const validKnight = (ax, ay, at, al) => {
  const dims = [ax, ay, at, al].filter(d => d > 0).sort((a, b) => b - a)
  return dims.length === 2 && dims[0] === 2 && dims[1] === 1
}

const validBishop = (state, from, to, dx, dy, dt, dl, ax, ay, at, al) => {
  const dims = [ax, ay, at, al].filter(d => d > 0)
  if (dims.length !== 2 || dims[0] !== dims[1]) return false
  return pathClear4D(state, from, to, dx, dy, dt, dl)
}

const validRook = (state, from, to, dx, dy, dt, dl) => {
  const nonZero = [Math.abs(dx), Math.abs(dy), Math.abs(dt), Math.abs(dl)].filter(d => d > 0)
  if (nonZero.length !== 1) return false
  return pathClear4D(state, from, to, dx, dy, dt, dl)
}

const validQueen = (state, from, to, dx, dy, dt, dl) => {
  const dims = [Math.abs(dx), Math.abs(dy), Math.abs(dt), Math.abs(dl)].filter(d => d > 0)
  if (dims.length === 0 || !dims.every(d => d === dims[0])) return false
  return pathClear4D(state, from, to, dx, dy, dt, dl)
}

const validKing = (ax, ay, at, al) =>
  ax <= 1 && ay <= 1 && at <= 1 && al <= 1 && ax + ay + at + al > 0

// ═══════════════════════════════════════════════════════════════════════════════
// CHECK DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

const findKings = (state, color) => {
  const kings = []
  state.timelines.forEach((tl, ti) => {
    tl.boards.forEach((b, bi) => {
      b.board.forEach((row, y) => row.forEach((p, x) => {
        if (p && pieceColor(p) === color && pieceType(p) === 'k') {
          kings.push({ timelineIndex: ti, boardIndex: bi, x, y })
        }
      }))
    })
  })
  return kings
}

const isSquareAttacked = (state, tt, tb, tx, ty, attackerColor) => {
  for (let tl = 0; tl < state.timelines.length; tl++) {
    const timeline = state.timelines[tl]
    if (!isTimelineActive(state, timeline.id)) continue
    const bi = getLatestBoardIdx(timeline)
    const b = timeline.boards[bi]
    if (!b || !b.isPlayable || b.activeFor !== attackerColor) continue
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const p = b.board[y]?.[x]
        if (!p || pieceColor(p) !== attackerColor) continue
        const testState = { ...state, currentTurn: attackerColor }
        if (isLegalMove(testState,
          { timelineIndex: tl, boardIndex: bi, x, y },
          { timelineIndex: tt, boardIndex: tb, x: tx, y: ty }
        )) return true
      }
    }
  }
  return false
}

const isInCheck = (state, color) => {
  const kings = findKings(state, color)
  return kings.some(k => isSquareAttacked(state, k.timelineIndex, k.boardIndex, k.x, k.y, opp(color)))
}

/**
 * Find all boards where the given color's king is in check.
 * Returns array of { timelineIndex, boardIndex } for visual highlighting.
 */
const findCheckBoards = (state, color) => {
  const kings = findKings(state, color)
  const checked = []
  kings.forEach(k => {
    if (isSquareAttacked(state, k.timelineIndex, k.boardIndex, k.x, k.y, opp(color))) {
      checked.push({ timelineIndex: k.timelineIndex, boardIndex: k.boardIndex })
    }
  })
  return checked
}

/**
 * Find temporal check lines - attacks from one timeline to a king in another timeline.
 * Returns array of { from: {x, y, ti, bi}, to: {x, y, ti, bi} }
 */
const findTemporalCheckLines = (state, color) => {
  const lines = []
  const kings = findKings(state, color)
  const attackerColor = opp(color)
  
  kings.forEach(king => {
    // Find all attackers that could attack this king
    for (let tl = 0; tl < state.timelines.length; tl++) {
      const timeline = state.timelines[tl]
      if (!isTimelineActive(state, timeline.id)) continue
      const bi = getLatestBoardIdx(timeline)
      const b = timeline.boards[bi]
      if (!b || !b.isPlayable || b.activeFor !== attackerColor) continue
      
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          const p = b.board[y]?.[x]
          if (!p || pieceColor(p) !== attackerColor) continue
          
          const testState = { ...state, currentTurn: attackerColor }
          if (isLegalMove(testState,
            { timelineIndex: tl, boardIndex: bi, x, y },
            { timelineIndex: king.timelineIndex, boardIndex: king.boardIndex, x: king.x, y: king.y }
          )) {
            // This is a temporal check if attacker is on different timeline/board than king
            const isTemporal = tl !== king.timelineIndex || bi !== king.boardIndex
            if (isTemporal) {
              lines.push({
                from: { x, y, ti: tl, bi },
                to: { x: king.x, y: king.y, ti: king.timelineIndex, bi: king.boardIndex }
              })
            }
          }
        }
      }
    }
  })
  
  return lines
}

const hasLegalMoves = state => {
  const pbs = getPlayableBoards(state)
  for (const pb of pbs) {
    for (let fy = 0; fy < 8; fy++) {
      for (let fx = 0; fx < 8; fx++) {
        const p = pb.board.board[fy]?.[fx]
        if (!p || pieceColor(p) !== state.currentTurn) continue
        for (let tl = 0; tl < state.timelines.length; tl++) {
          for (let bi = 0; bi < state.timelines[tl].boards.length; bi++) {
            for (let ty = 0; ty < 8; ty++) {
              for (let tx = 0; tx < 8; tx++) {
                if (isLegalMove(state,
                  { timelineIndex: pb.timelineIndex, boardIndex: pb.boardIndex, x: fx, y: fy },
                  { timelineIndex: tl, boardIndex: bi, x: tx, y: ty }
                )) return true
              }
            }
          }
        }
      }
    }
  }
  return false
}

const checkEndgame = state => {
  const color = state.currentTurn
  
  // Check if any king was captured (game over immediately)
  let whiteKingExists = false
  let blackKingExists = false
  state.timelines.forEach(tl => {
    tl.boards.forEach(b => {
      b.board.forEach(row => row.forEach(p => {
        if (p && pieceType(p) === 'k') {
          if (pieceColor(p) === WHITE) whiteKingExists = true
          else blackKingExists = true
        }
      }))
    })
  })
  
  if (!whiteKingExists) {
    state.phase = 'ended'
    state.winner = BLACK
    state.winReason = 'king_captured'
    state.message = 'Black wins — White king captured!'
    state.inCheckBoards = []
    return
  }
  if (!blackKingExists) {
    state.phase = 'ended'
    state.winner = WHITE
    state.winReason = 'king_captured'
    state.message = 'White wins — Black king captured!'
    state.inCheckBoards = []
    return
  }
  
  const inCheck = isInCheck(state, color)
  const hasMoves = hasLegalMoves(state)
  
  if (!hasMoves) {
    state.phase = 'ended'
    if (inCheck) {
      state.winner = opp(color)
      state.winReason = 'checkmate'
      state.message = `Checkmate! ${opp(color) === WHITE ? 'White' : 'Black'} wins!`
    } else {
      state.winner = null
      state.winReason = 'stalemate'
      state.message = 'Stalemate — draw!'
    }
  } else if (inCheck) {
    state.message = `${color === WHITE ? 'White' : 'Black'} is in check!`
    state.inCheckBoards = findCheckBoards(state, color)
  } else {
    state.inCheckBoards = []
  }
  
  // Check stalemate risk for both players
  state.stalemateRisk = checkStalemateRisk(state)
}

// Check if either player is at risk of stalemate
const checkStalemateRisk = (state) => {
  const risk = { white: false, black: false }
  
  // Check current player's move count
  const pbs = getPlayableBoards(state)
  let moveCount = 0
  for (const pb of pbs) {
    for (let fy = 0; fy < 8; fy++) {
      for (let fx = 0; fx < 8; fx++) {
        const p = pb.board.board[fy]?.[fx]
        if (!p || pieceColor(p) !== state.currentTurn) continue
        // Quick check - just count pieces that could potentially move
        moveCount++
        if (moveCount > 3) break
      }
      if (moveCount > 3) break
    }
    if (moveCount > 3) break
  }
  
  // If very few pieces could move, flag stalemate risk
  const currentColor = state.currentTurn
  const opponentColor = opp(currentColor)
  
  // Count pieces for each player
  let whitePieceCount = 0
  let blackPieceCount = 0
  state.timelines.forEach(tl => {
    const latestBoard = getLatestBoard(tl)
    if (latestBoard) {
      latestBoard.board.forEach(row => row.forEach(p => {
        if (p) {
          if (pieceColor(p) === WHITE) whitePieceCount++
          else blackPieceCount++
        }
      }))
    }
  })
  
  // Risk if few pieces remain
  if (whitePieceCount <= 3) risk.white = true
  if (blackPieceCount <= 3) risk.black = true
  
  return risk
}

// ═══════════════════════════════════════════════════════════════════════════════
// TIMELINE CAP ENFORCEMENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check if a player can create a new timeline.
 * Rule: A player can only have at most one more active timeline than their opponent.
 */
const canCreateTimeline = (state, playerColor) => {
  const playerTimelineCount = state.timelines.filter(t => t.createdBy === playerColor).length
  const opponentTimelineCount = state.timelines.filter(t => t.createdBy === opp(playerColor)).length
  
  // Can only create if player has <= opponent timelines
  // (after creation, player will have +1 which is allowed)
  return playerTimelineCount <= opponentTimelineCount
}

/**
 * Get timeline count advantage for a player
 */
const getTimelineAdvantage = (state, playerColor) => {
  const playerTimelines = state.timelines.filter(t => t.createdBy === playerColor).length
  const opponentTimelines = state.timelines.filter(t => t.createdBy === opp(playerColor)).length
  return playerTimelines - opponentTimelines
}

// ═══════════════════════════════════════════════════════════════════════════════
// DRAW PREVENTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check if making this move would cause a draw/stalemate.
 * In 5D Chess, we prevent moves that would lead to dead positions
 * (unless the move wins the game by capturing a king).
 */
const wouldCauseDraw = (state, from, to) => {
  const destPiece = state.timelines[to.timelineIndex]?.boards[to.boardIndex]?.board[to.y]?.[to.x]
  
  // If this move captures a king, it wins the game - always allow
  if (destPiece && pieceType(destPiece) === 'k') return false
  
  // Check current material state
  const currentWhiteInsufficient = isInsufficientMaterial(state, WHITE)
  const currentBlackInsufficient = isInsufficientMaterial(state, BLACK)
  
  // If both already have insufficient material, the game is already a draw
  // Don't block moves in this case
  
  // Check if this move would reduce the opponent to insufficient material
  // while we still have enough - this is fine (we're winning)
  const piece = state.timelines[from.timelineIndex]?.boards[from.boardIndex]?.board[from.y]?.[from.x]
  
  // Count material after the move (approximate)
  const movingColor = pieceColor(piece)
  const opponentColor = opp(movingColor)
  
  // If opponent already has insufficient material and we're not delivering checkmate,
  // this could lead to a draw - but we allow it since 5D chess has multiple boards
  
  // The key insight: In 5D Chess, draws are very rare because you can always
  // create new timelines or attack from other dimensions. We only prevent
  // truly dead positions where both players have only kings.
  const whiteKingOnly = isKingOnly(state, WHITE)
  const blackKingOnly = isKingOnly(state, BLACK)
  
  // Only prevent if BOTH sides would have only kings after this move
  // and this move doesn't capture the opponent's king
  if (whiteKingOnly && blackKingOnly) {
    return true // Would cause King vs King draw
  }
  
  return false
}

/**
 * Check if a player has only a king (no other pieces)
 */
const isKingOnly = (state, color) => {
  let hasOtherPieces = false
  
  state.timelines.forEach(tl => {
    const latestBoard = getLatestBoard(tl)
    if (latestBoard) {
      latestBoard.board.forEach(row => {
        row.forEach(p => {
          if (p && pieceColor(p) === color && pieceType(p) !== 'k') {
            hasOtherPieces = true
          }
        })
      })
    }
  })
  
  return !hasOtherPieces
}

/**
 * Count pieces for a color across all timelines
 */
const countPiecesByColor = (state, color) => {
  let count = 0
  state.timelines.forEach(tl => {
    tl.boards.forEach(b => {
      b.board.forEach(row => {
        row.forEach(p => {
          if (p && pieceColor(p) === color) count++
        })
      })
    })
  })
  return count
}

/**
 * Check if a player has insufficient material for checkmate
 */
const isInsufficientMaterial = (state, color) => {
  const pieces = { k: 0, q: 0, r: 0, b: 0, n: 0, p: 0 }
  
  state.timelines.forEach(tl => {
    const latestBoard = getLatestBoard(tl)
    if (latestBoard) {
      latestBoard.board.forEach(row => {
        row.forEach(p => {
          if (p && pieceColor(p) === color) {
            pieces[pieceType(p)]++
          }
        })
      })
    }
  })
  
  // King alone
  if (pieces.k === 1 && pieces.q === 0 && pieces.r === 0 && pieces.b === 0 && pieces.n === 0 && pieces.p === 0) {
    return true
  }
  
  // King + Bishop (can't checkmate)
  if (pieces.k === 1 && pieces.b === 1 && pieces.q === 0 && pieces.r === 0 && pieces.n === 0 && pieces.p === 0) {
    return true
  }
  
  // King + Knight (can't checkmate)
  if (pieces.k === 1 && pieces.n === 1 && pieces.q === 0 && pieces.r === 0 && pieces.b === 0 && pieces.p === 0) {
    return true
  }
  
  return false
}

// ═══════════════════════════════════════════════════════════════════════════════
// MOVE APPLICATION
// ═══════════════════════════════════════════════════════════════════════════════

const promote = (piece, y) => {
  if (pieceType(piece) !== 'p') return piece
  const promoRank = pieceColor(piece) === WHITE ? 0 : 7
  return y === promoRank ? pieceColor(piece) + 'q' : piece
}

const applyMove = (state, from, to) => {
  if (!isLegalMove(state, from, to)) return null
  const ns = deepClone(state)
  const { timelineIndex: ft, boardIndex: fb, x: fx, y: fy } = from
  const { timelineIndex: tt, boardIndex: tb, x: tx, y: ty } = to
  const piece = ns.timelines[ft].boards[fb].board[fy][fx]
  const destPiece = ns.timelines[tt].boards[tb].board[ty]?.[tx]
  const isTT = isTimeTravelMove(from, to)
  const isCapture = !!destPiece
  const snapshot = deepClone(ns.timelines)

  if (isTT) {
    applyTimeTravelMove(ns, from, to, piece)
  } else {
    applyNormalMove(ns, from, to, piece)
  }

  ns.pendingMoves.push({ from, to, piece, snapshot })
  ns.selectedPiece = null
  ns.lastMove = { from, to, isTimeTravel: isTT, isCapture }
  ns.message = `${ns.pendingMoves.length} move(s) pending — submit to end turn`
  return ns
}

const applyNormalMove = (state, from, to, piece) => {
  const { timelineIndex: ft, boardIndex: fb, x: fx, y: fy } = from
  const { x: tx, y: ty } = to
  const tl = state.timelines[ft]
  const cur = tl.boards[fb]
  const nb = cur.board.map(r => [...r])
  nb[fy][fx] = null
  nb[ty][tx] = promote(piece, ty)
  cur.isPlayable = false
  tl.boards.push({
    turnNumber: cur.turnNumber + 0.5,
    activeFor: opp(state.currentTurn),
    board: nb,
    isPlayable: true
  })
}

const applyTimeTravelMove = (state, from, to, piece) => {
  const { timelineIndex: ft, boardIndex: fb, x: fx, y: fy } = from
  const { timelineIndex: tt, boardIndex: tb, x: tx, y: ty } = to
  const creator = state.currentTurn
  
  const srcTL = state.timelines[tt]
  const destBoard = srcTL.boards[tb]
  
  // Check if there's an existing timeline that branches from this exact point
  // that we can merge into (same source timeline and board index)
  const existingMergeableTl = state.timelines.find((tl, idx) => {
    if (idx === tt) return false // Can't merge into source timeline
    if (tl.createdBy !== creator) return false // Must be created by same player
    
    // Check if this timeline was created from the same source board
    // by comparing the board state at the branching point
    if (tl.boards.length > tb) {
      const mergeBoard = tl.boards[tb]
      const srcBoard = srcTL.boards[tb]
      
      // Check if boards are identical up to this point (excluding the new move)
      let boardsMatch = true
      for (let y = 0; y < 8 && boardsMatch; y++) {
        for (let x = 0; x < 8 && boardsMatch; x++) {
          const mergePiece = mergeBoard.board[y]?.[x]
          const srcPiece = srcBoard.board[y]?.[x]
          if (mergePiece !== srcPiece) {
            boardsMatch = false
          }
        }
      }
      
      // Also check that the new move location is available
      if (boardsMatch && !mergeBoard.board[ty]?.[tx]) {
        return true
      }
    }
    return false
  })
  
  if (existingMergeableTl) {
    // Merge into existing timeline
    const newBoard = {
      turnNumber: destBoard.turnNumber + 0.5,
      activeFor: opp(state.currentTurn),
      board: existingMergeableTl.boards[tb].board.map(r => [...r]),
      isPlayable: true
    }
    newBoard.board[ty][tx] = promote(piece, ty)
    
    // Remove any boards after the merge point and add the new board
    existingMergeableTl.boards = existingMergeableTl.boards.slice(0, tb + 1)
    existingMergeableTl.boards.push(newBoard)
    
    // Mark all boards in the merged timeline after tb as non-playable
    for (let i = 0; i < existingMergeableTl.boards.length - 1; i++) {
      existingMergeableTl.boards[i].isPlayable = false
    }
  } else {
    // Create new timeline
    const newId = state.timelines.length
    const creationOrder = state.timelines.filter(t => t.createdBy === creator).length
    const newBoards = srcTL.boards.slice(0, tb + 1).map(b => ({
      turnNumber: b.turnNumber, activeFor: b.activeFor,
      board: b.board.map(r => [...r]), isPlayable: false
    }))
    newBoards[tb].board[ty][tx] = promote(piece, ty)
    newBoards.push({
      turnNumber: destBoard.turnNumber + 0.5,
      activeFor: opp(state.currentTurn),
      board: newBoards[tb].board.map(r => [...r]),
      isPlayable: true
    })
    state.timelines.push({ id: newId, createdBy: creator, creationOrder, boards: newBoards })
  }
  
  state.timelines[ft].boards[fb].board[fy][fx] = null
  state.timelines[ft].boards[fb].isPlayable = false
}

const submitMoves = state => {
  if (state.pendingMoves.length === 0) return null
  const ns = deepClone(state)
  ns.currentTurn = opp(state.currentTurn)
  ns.moveHistory = [...ns.moveHistory, ...ns.pendingMoves.map(m => ({ from: m.from, to: m.to, piece: m.piece }))]
  ns.pendingMoves = []
  ns.selectedPiece = null
  ns.message = `${ns.currentTurn === WHITE ? 'White' : 'Black'}'s turn`
  checkEndgame(ns)
  return ns
}

const undoLastMove = state => {
  if (state.pendingMoves.length === 0) return null
  const ns = deepClone(state)
  const lastMove = ns.pendingMoves[ns.pendingMoves.length - 1]
  ns.timelines = deepClone(lastMove.snapshot)
  ns.pendingMoves = ns.pendingMoves.slice(0, -1)
  ns.selectedPiece = null
  ns.lastMove = null
  ns.message = ns.pendingMoves.length > 0 ? `${ns.pendingMoves.length} move(s) pending` : 'Move undone.'
  return ns
}

const getLegalMovesForPiece = (state, from) => {
  const moves = []
  for (let tl = 0; tl < state.timelines.length; tl++) {
    for (let bi = 0; bi < state.timelines[tl].boards.length; bi++) {
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          const to = { timelineIndex: tl, boardIndex: bi, x, y }
          if (isLegalMove(state, from, to)) moves.push(to)
        }
      }
    }
  }
  return moves
}

// CPU AI for single player mode
// Piece-square tables for positional evaluation
const PAWN_TABLE = [
  [0,  0,  0,  0,  0,  0,  0,  0],
  [50, 50, 50, 50, 50, 50, 50, 50],
  [10, 10, 20, 30, 30, 20, 10, 10],
  [5,  5, 10, 25, 25, 10,  5,  5],
  [0,  0,  0, 20, 20,  0,  0,  0],
  [5, -5,-10,  0,  0,-10, -5,  5],
  [5, 10, 10,-20,-20, 10, 10,  5],
  [0,  0,  0,  0,  0,  0,  0,  0]
]

const KNIGHT_TABLE = [
  [-50,-40,-30,-30,-30,-30,-40,-50],
  [-40,-20,  0,  0,  0,  0,-20,-40],
  [-30,  0, 10, 15, 15, 10,  0,-30],
  [-30,  5, 15, 20, 20, 15,  5,-30],
  [-30,  0, 15, 20, 20, 15,  0,-30],
  [-30,  5, 10, 15, 15, 10,  5,-30],
  [-40,-20,  0,  5,  5,  0,-20,-40],
  [-50,-40,-30,-30,-30,-30,-40,-50]
]

const BISHOP_TABLE = [
  [-20,-10,-10,-10,-10,-10,-10,-20],
  [-10,  0,  0,  0,  0,  0,  0,-10],
  [-10,  0,  5, 10, 10,  5,  0,-10],
  [-10,  5,  5, 10, 10,  5,  5,-10],
  [-10,  0, 10, 10, 10, 10,  0,-10],
  [-10, 10, 10, 10, 10, 10, 10,-10],
  [-10,  5,  0,  0,  0,  0,  5,-10],
  [-20,-10,-10,-10,-10,-10,-10,-20]
]

const KING_MIDDLE_TABLE = [
  [-30,-40,-40,-50,-50,-40,-40,-30],
  [-30,-40,-40,-50,-50,-40,-40,-30],
  [-30,-40,-40,-50,-50,-40,-40,-30],
  [-30,-40,-40,-50,-50,-40,-40,-30],
  [-20,-30,-30,-40,-40,-30,-30,-20],
  [-10,-20,-20,-20,-20,-20,-20,-10],
  [20, 20,  0,  0,  0,  0, 20, 20],
  [20, 30, 10,  0,  0, 10, 30, 20]
]

const getPieceSquareValue = (piece, x, y, gamePhase) => {
  const type = pieceType(piece)
  const isWhite = piece[0] === 'w'
  const row = isWhite ? y : 7 - y
  const col = isWhite ? x : 7 - x
  
  switch (type) {
    case 'p': return PAWN_TABLE[row][col]
    case 'n': return KNIGHT_TABLE[row][col]
    case 'b': return BISHOP_TABLE[row][col]
    case 'k': return gamePhase === 'middle' ? KING_MIDDLE_TABLE[row][col] : 0
    default: return 0
  }
}

const evaluatePosition = (state, color) => {
  const pieceValues = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 }
  let score = 0
  let totalPieces = 0
  
  state.timelines.forEach(tl => {
    tl.boards.forEach(bd => {
      bd.board.forEach(row => {
        row.forEach(p => {
          if (p) totalPieces++
        })
      })
    })
  })
  
  const gamePhase = totalPieces > 20 ? 'opening' : totalPieces > 10 ? 'middle' : 'endgame'
  
  state.timelines.forEach(tl => {
    const isActive = isTimelineActive(state, tl.id)
    tl.boards.forEach((bd, bi) => {
      bd.board.forEach((row, y) => {
        row.forEach((p, x) => {
          if (p) {
            let val = pieceValues[pieceType(p)] || 0
            // Add positional value
            val += getPieceSquareValue(p, x, y, gamePhase)
            // Active boards are more important
            if (bi === tl.boards.length - 1 && isActive) val *= 1.2
            
            if (pieceColor(p) === color) score += val
            else score -= val
          }
        })
      })
    })
  })
  
  // Bonus for check
  if (isInCheck(state, opp(color))) score += 500
  
  // Bonus for timeline advantage
  const myTimelines = state.timelines.filter(t => t.createdBy === color).length
  const oppTimelines = state.timelines.filter(t => t.createdBy === opp(color)).length
  score += (myTimelines - oppTimelines) * 100
  
  // Bonus for controlling center files
  state.timelines.forEach(tl => {
    const latestBoard = getLatestBoard(tl)
    if (latestBoard && latestBoard.activeFor === color) {
      for (let y = 3; y <= 4; y++) {
        for (let x = 3; x <= 4; x++) {
          const p = latestBoard.board[y]?.[x]
          if (p && pieceColor(p) === color) score += 20
        }
      }
    }
  })
  
  return score
}

const getCpuMove = (state, difficulty = 'medium') => {
  const cpuColor = BLACK
  const pbs = getPlayableBoards(state, getTimelineActiveMap(state))
  const allMoves = []
  
  for (const pb of pbs) {
    for (let fy = 0; fy < 8; fy++) {
      for (let fx = 0; fx < 8; fx++) {
        const p = pb.board.board[fy]?.[fx]
        if (!p || pieceColor(p) !== cpuColor) continue
        const from = { timelineIndex: pb.timelineIndex, boardIndex: pb.boardIndex, x: fx, y: fy }
        const moves = getLegalMovesForPiece(state, from)
        for (const to of moves) {
          const testState = applyMove(deepClone(state), from, to)
          if (testState) {
            const score = evaluatePosition(testState, cpuColor)
            allMoves.push({ from, to, score, isTimeTravel: isTimeTravelMove(from, to) })
          }
        }
      }
    }
  }
  
  if (allMoves.length === 0) return null
  
  // For hard difficulty, do simple look-ahead (evaluate opponent's best response)
  if (difficulty === 'hard') {
    allMoves.forEach(move => {
      if (move.score > -5000) { // Only for non-losing moves
        const opponentState = applyMove(deepClone(state), move.from, move.to)
        if (opponentState) {
          // Find opponent's best response
          let bestOpponentScore = Infinity
          const oppMoves = getAllLegalMoves(opponentState, opp(cpuColor))
          for (const oppMove of oppMoves.slice(0, 10)) { // Limit for performance
            const afterOppMove = applyMove(deepClone(opponentState), oppMove.from, oppMove.to)
            if (afterOppMove) {
              const score = evaluatePosition(afterOppMove, cpuColor)
              bestOpponentScore = Math.min(bestOpponentScore, score)
            }
          }
          // Penalize moves that allow good opponent responses
          if (bestOpponentScore < Infinity) {
            move.score = move.score * 0.6 + bestOpponentScore * 0.4
          }
        }
      }
    })
  }
  
  // Difficulty affects move selection
  let temperature = 0.5
  if (difficulty === 'easy') temperature = 0.3
  if (difficulty === 'hard') temperature = 0.1
  
  // Sort by score
  allMoves.sort((a, b) => b.score - a.score)
  
  // Add some randomness based on temperature
  if (Math.random() > temperature) {
    // Pick from top few moves
    const topN = difficulty === 'easy' ? 5 : difficulty === 'hard' ? 2 : 3
    return allMoves[Math.floor(Math.random() * Math.min(topN, allMoves.length))]
  }
  
  return allMoves[0]
}

// Helper function to get all legal moves for a color
const getAllLegalMoves = (state, color) => {
  const moves = []
  const pbs = getPlayableBoards(state, getTimelineActiveMap(state))
  
  for (const pb of pbs) {
    if (pb.board.activeFor !== color) continue
    for (let fy = 0; fy < 8; fy++) {
      for (let fx = 0; fx < 8; fx++) {
        const p = pb.board.board[fy]?.[fx]
        if (!p || pieceColor(p) !== color) continue
        const from = { timelineIndex: pb.timelineIndex, boardIndex: pb.boardIndex, x: fx, y: fy }
        const pieceMoves = getLegalMovesForPiece(state, from)
        for (const to of pieceMoves) {
          moves.push({ from, to })
        }
      }
    }
  }
  return moves
}

// ═══════════════════════════════════════════════════════════════════════════════
// SANITIZER
// ═══════════════════════════════════════════════════════════════════════════════

const sanitizePlayer = p => {
  if (!p || typeof p !== 'object') return null
  return { id: String(p.id || ''), username: String(p.username || 'Player') }
}

const sanitizeState = incoming => {
  if (!incoming || typeof incoming !== 'object') return makeInitialState()
  const base = makeInitialState()
  return {
    ...base, ...incoming,
    whitePlayer: sanitizePlayer(incoming.whitePlayer),
    blackPlayer: sanitizePlayer(incoming.blackPlayer),
    whiteReady: Boolean(incoming.whiteReady),
    blackReady: Boolean(incoming.blackReady),
    timelines: Array.isArray(incoming.timelines) ? incoming.timelines : base.timelines,
    pendingMoves: Array.isArray(incoming.pendingMoves) ? incoming.pendingMoves : [],
    moveHistory: Array.isArray(incoming.moveHistory) ? incoming.moveHistory : [],
    inCheckBoards: Array.isArray(incoming.inCheckBoards) ? incoming.inCheckBoards : [],
    stalemateRisk: incoming.stalemateRisk || base.stalemateRisk,
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// LAYOUT
// ═══════════════════════════════════════════════════════════════════════════════

const CELL = 46
const BOARD_PX = CELL * 8
const TURN_GAP = 36
const TL_GAP = 48
const LABEL_H = 24
const MARGIN_LEFT = 80
const MARGIN_TOP = 60

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

const TimeDilationChessActivity = ({ sdk, currentUser }) => {
  const [zoom, setZoom] = useState(0.62)
  const [pan, setPan] = useState({ x: 60, y: 40 })
  const [panning, setPanning] = useState(false)
  const panStart = useRef({ x: 0, y: 0, px: 0, py: 0 })
  const viewportRef = useRef(null)
  const [viewportSize, setViewportSize] = useState({ width: 800, height: 600 })
  const [showWarningDetail, setShowWarningDetail] = useState(null)
  const [showNewGameConfirm, setShowNewGameConfirm] = useState(false)
  const [showCheckDetail, setShowCheckDetail] = useState(null)
  const [cpuMode, setCpuMode] = useState(false)
  const [cpuDifficulty, setCpuDifficulty] = useState('medium')
  const cpuModeRef = useRef(false)
  const cpuDifficultyRef = useRef('medium')

  const [gs, setGs] = useState(makeInitialState)
  const gsRef = useRef(makeInitialState())

  // Keep refs in sync with state
  useEffect(() => { cpuModeRef.current = cpuMode }, [cpuMode])
  useEffect(() => { cpuDifficultyRef.current = cpuDifficulty }, [cpuDifficulty])
  
  // Track viewport size for canvas
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    
    const updateSize = () => {
      setViewportSize({
        width: viewport.clientWidth || 800,
        height: viewport.clientHeight || 600
      })
    }
    
    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [])

  const [showTutorial, setShowTutorial] = useState(false)

  // Memoize with proper stable references to prevent infinite recursion
  const timelineActiveMap = useMemo(() => {
    const map = {}
    for (const tl of gs.timelines) {
      map[tl.id] = isTimelineActive(gs, tl.id)
    }
    return map
  }, [gs.timelines, gs.currentTurn, gs.whitePlayer, gs.blackPlayer])
  // Animation state: track recently placed pieces for pop-in animation
  const [animatedCells, setAnimatedCells] = useState(new Set()) // "ti,bi,x,y"
  const [timeTravelFlash, setTimeTravelFlash] = useState(false)
  const [newBoardAnimation, setNewBoardAnimation] = useState(false)
  const [timelineBranchAnimation, setTimelineBranchAnimation] = useState(null)
  const [cpuThinking, setCpuThinking] = useState(false)
  const prevMoveRef = useRef(null)

  // ─── Push state ──────────────────────────────────────────────────────────────
  const push = useCallback(next => {
    const s = sanitizeState(next)
    gsRef.current = s
    setGs(s)
    sdk?.updateState?.({ chess5d: s }, { serverRelay: true })
  }, [sdk])

  const userId   = currentUser?.id       || 'guest'
  const username = currentUser?.username || 'Player'

  const myColor = useMemo(() => {
    if (gs.whitePlayer?.id === userId) return WHITE
    if (gs.blackPlayer?.id === userId) return BLACK
    return null
  }, [gs.whitePlayer, gs.blackPlayer, userId])

  const isMyTurn = myColor === gs.currentTurn && gs.phase === 'playing'

  const validMoves = useMemo(() => {
    if (!gs.selectedPiece || !isMyTurn) return []
    return getLegalMovesForPiece(gs, gs.selectedPiece)
  }, [gs, isMyTurn])

  const presentTurn = useMemo(() => calcPresentTurn(gs, timelineActiveMap), [gs, timelineActiveMap])

  // Check boards set for quick lookup
  const checkBoardSet = useMemo(() => {
    const s = new Set()
    ;(gs.inCheckBoards || []).forEach(b => s.add(`${b.timelineIndex},${b.boardIndex}`))
    return s
  }, [gs.inCheckBoards])

  // Temporal check lines - attacks from one timeline to another
  const temporalCheckLines = useMemo(() => {
    if (gs.phase !== 'playing') return []
    return findTemporalCheckLines(gs, gs.currentTurn)
  }, [gs])

  // Calculate captured pieces
  const capturedPieces = useMemo(() => {
    const initialPieces = new Set(['wp','wp','wp','wp','wp','wp','wp','wp','wr','wn','wb','wq','wk','wb','wn','wr',
                                   'bp','bp','bp','bp','bp','bp','bp','bp','br','bn','bb','bq','bk','bb','bn','br'])
    const currentPieces = new Set()
    gs.timelines.forEach(tl => {
      const latestBoard = getLatestBoard(tl)
      if (latestBoard) {
        latestBoard.board.forEach(row => {
          row.forEach(p => {
            if (p) currentPieces.add(p)
          })
        })
      }
    })
    
    const whiteCaptured = []
    const blackCaptured = []
    
    initialPieces.forEach(piece => {
      if (!currentPieces.has(piece)) {
        if (piece[0] === 'w') whiteCaptured.push(piece)
        else blackCaptured.push(piece)
      }
    })
    
    return { white: whiteCaptured, black: blackCaptured }
  }, [gs.timelines])

  // Get check threats - which pieces are attacking the king
  const checkThreats = useMemo(() => {
    if (!gs.inCheckBoards || gs.inCheckBoards.length === 0) return []
    const threats = []
    gs.inCheckBoards.forEach(check => {
      const tl = gs.timelines[check.timelineIndex]
      const bd = tl?.boards[check.boardIndex]
      if (!bd) return
      // Find the king position
      let kingPos = null
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          const p = bd.board[y]?.[x]
          if (p && pieceColor(p) === gs.currentTurn && pieceType(p) === 'k') {
            kingPos = { x, y }
            break
          }
        }
        if (kingPos) break
      }
      if (!kingPos) return
      // Find attacking pieces
      const attackerColor = opp(gs.currentTurn)
      gs.timelines.forEach((tline, tidx) => {
        const bi = getLatestBoardIdx(tline)
        const board = tline.boards[bi]
        if (!board || !board.isPlayable || board.activeFor !== attackerColor) return
        for (let y = 0; y < 8; y++) {
          for (let x = 0; x < 8; x++) {
            const p = board.board[y]?.[x]
            if (!p || pieceColor(p) !== attackerColor) continue
            const testState = { ...gs, currentTurn: attackerColor }
            if (isLegalMove(testState,
              { timelineIndex: tidx, boardIndex: bi, x, y },
              { timelineIndex: check.timelineIndex, boardIndex: check.boardIndex, x: kingPos.x, y: kingPos.y }
            )) {
              threats.push({ 
                fromTimeline: tidx, 
                fromBoard: bi, 
                fromX: x, 
                fromY: y,
                toTimeline: check.timelineIndex,
                toBoard: check.boardIndex,
                piece: p,
                boardLabel: `T${check.timelineIndex}·${bd.turnNumber.toFixed(1)}`
              })
            }
          }
        }
      })
    })
    return threats
  }, [gs.inCheckBoards, gs.timelines, gs.currentTurn])

  // Stalemate risk
  const stalemateRisk = useMemo(() => gs.stalemateRisk || { white: false, black: false }, [gs.stalemateRisk])

  useEffect(() => { gsRef.current = gs }, [gs])

  // ─── CPU Turn Logic ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!cpuModeRef.current || gs.phase !== 'playing' || gs.winner) return
    
    // Determine if it's CPU's turn
    const isCpuTurn = (myColor === WHITE && gs.currentTurn === BLACK) || 
                      (myColor === BLACK && gs.currentTurn === WHITE)
    if (!isCpuTurn) return
    
    // CPU is opponent, wait a bit then make a move
    setCpuThinking(true)
    const timeout = setTimeout(() => {
      const currentState = gsRef.current
      if (currentState.phase !== 'playing' || currentState.winner) {
        setCpuThinking(false)
        return
      }
      
      // Double check it's still CPU's turn
      const stillCpuTurn = (myColor === WHITE && currentState.currentTurn === BLACK) || 
                          (myColor === BLACK && currentState.currentTurn === WHITE)
      if (!stillCpuTurn) {
        setCpuThinking(false)
        return
      }
      
      // Get CPU move
      const cpuMove = getCpuMove(currentState, cpuDifficultyRef.current)
      if (!cpuMove) {
        setCpuThinking(false)
        return
      }
      
      // Apply the move
      const ns = applyMove(deepClone(currentState), cpuMove.from, cpuMove.to)
      if (ns) {
        if (cpuMove.isTimeTravel) {
          SFX.timeTravel()
        } else {
          SFX.move()
        }
        push(ns)
        
        // Auto-submit after a short delay for CPU
        setTimeout(() => {
          const afterMove = gsRef.current
          if (afterMove.phase === 'playing' && afterMove.pendingMoves.length > 0 && !afterMove.winner) {
            const submitted = submitMoves(afterMove)
            if (submitted) {
              SFX.submit()
              push(submitted)
            }
          }
          setCpuThinking(false)
        }, 800)
      } else {
        setCpuThinking(false)
      }
    }, 1000 + Math.random() * 1000) // Random delay 1-2 seconds
    
    return () => clearTimeout(timeout)
  }, [gs.phase, gs.currentTurn, myColor, push])

  // ─── Animate last move ────────────────────────────────────────────────────────

  useEffect(() => {
    const lm = gs.lastMove
    if (!lm) return
    const prev = prevMoveRef.current
    if (prev && prev.to.timelineIndex === lm.to.timelineIndex &&
        prev.to.boardIndex === lm.to.boardIndex &&
        prev.to.x === lm.to.x && prev.to.y === lm.to.y) return
    prevMoveRef.current = lm

    // Animate destination cell
    const key = `${lm.to.timelineIndex},${lm.to.boardIndex},${lm.to.x},${lm.to.y}`
    setAnimatedCells(prev => new Set([...prev, key]))
    setTimeout(() => setAnimatedCells(prev => { const n = new Set(prev); n.delete(key); return n }), 500)

    // Time travel flash
    if (lm.isTimeTravel) {
      setTimeTravelFlash(true)
      setTimeout(() => setTimeTravelFlash(false), 600)
    }
  }, [gs.lastMove])

  // ─── Auto-reset view to show playable boards ─────────────────────────────────

  useEffect(() => {
    if (gs.phase !== 'playing') return
    const pbs = getPlayableBoards(gs)
    if (pbs.length === 0) return
    
    // Calculate center of playable boards
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    pbs.forEach(pb => {
      const x = MARGIN_LEFT + pb.boardIndex * (BOARD_PX + TURN_GAP) + BOARD_PX / 2
      const y = MARGIN_TOP + pb.timelineIndex * (BOARD_PX + TL_GAP + LABEL_H) + BOARD_PX / 2
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
    })
    
    const viewport = viewportRef.current
    if (!viewport) return
    const vw = viewport.clientWidth
    const vh = viewport.clientHeight
    
    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2
    
    setPan({ x: vw / 2 - centerX * zoom, y: vh / 2 - centerY * zoom })
  }, [gs.phase, gs.timelines.length])



  useEffect(() => {
    if (!sdk) return
    const off = sdk.subscribeServerState(st => {
      const d = st?.chess5d
      if (d) { const s = sanitizeState(d); gsRef.current = s; setGs(s) }
    })
    return () => { try { off?.() } catch {} }
  }, [sdk])

  // ─── Handlers ────────────────────────────────────────────────────────────────

  const handleJoin = useCallback(color => {
    if (!sdk) return
    const cur = gsRef.current
    if (cur.whitePlayer?.id === userId || cur.blackPlayer?.id === userId) return
    if (color === WHITE && cur.whitePlayer && cur.whitePlayer.id !== userId) return
    if (color === BLACK && cur.blackPlayer && cur.blackPlayer.id !== userId) return
    SFX.select()
    
    let newState = {
      ...cur,
      whitePlayer: color === WHITE ? { id: userId, username } : cur.whitePlayer,
      blackPlayer: color === BLACK ? { id: userId, username } : cur.blackPlayer,
      message: `${username} joined as ${color === WHITE ? 'White' : 'Black'}`
    }
    
    // In CPU mode, add CPU as opponent
    if (cpuModeRef.current) {
      if (color === WHITE && !cur.blackPlayer) {
        newState.blackPlayer = { id: 'cpu', username: `CPU (${cpuDifficultyRef.current})` }
        newState.message += ' — CPU opponent joined as Black'
      } else if (color === BLACK && !cur.whitePlayer) {
        newState.whitePlayer = { id: 'cpu', username: `CPU (${cpuDifficultyRef.current})` }
        newState.message += ' — CPU opponent joined as White'
      }
    }
    
    push(newState)
  }, [sdk, userId, username, push])

  const handleLeave = useCallback(() => {
    if (!sdk || !myColor) return
    const cur = gsRef.current
    const wasPlaying = cur.phase === 'playing'
    SFX.invalid()
    push({
      ...cur,
      whitePlayer: myColor === WHITE ? null : cur.whitePlayer,
      blackPlayer: myColor === BLACK ? null : cur.blackPlayer,
      whiteReady: myColor === WHITE ? false : cur.whiteReady,
      blackReady: myColor === BLACK ? false : cur.blackReady,
      phase: wasPlaying ? 'lobby' : cur.phase,
      message: `${username} left the game`
    })
  }, [sdk, myColor, username, push])

  const handleReady = useCallback(() => {
    if (!sdk || !myColor) return
    const cur = gsRef.current
    SFX.select()
    
    // In CPU mode, auto-set CPU as ready
    let whiteReady = myColor === WHITE ? !cur.whiteReady : cur.whiteReady
    let blackReady = myColor === BLACK ? !cur.blackReady : cur.blackReady
    
    if (cpuModeRef.current) {
      // CPU is the opponent
      if (myColor === WHITE) {
        blackReady = true // CPU is black
      } else {
        whiteReady = true // CPU is white
      }
    }
    
    const ns = {
      ...cur,
      whiteReady,
      blackReady
    }
    
    if (ns.whitePlayer && ns.blackPlayer && ns.whiteReady && ns.blackReady && cur.phase === 'lobby') {
      ns.phase = 'playing'
      ns.message = cpuModeRef.current ? `Game started vs CPU (${cpuDifficultyRef.current})! White to move.` : 'Game started! White to move.'
      setShowTutorial(true)
      setTimeout(() => SFX.gameStart(), 100)
    } else {
      const isReady = myColor === WHITE ? ns.whiteReady : ns.blackReady
      ns.message = `${username} is ${isReady ? 'ready' : 'not ready'}`
    }
    push(ns)
  }, [sdk, myColor, username, push])

  const handleReset = useCallback(() => {
    setShowNewGameConfirm(true)
  }, [])

  const confirmReset = useCallback(() => {
    if (!sdk) return
    const cur = gsRef.current
    const ns = makeInitialState()
    ns.whitePlayer = cur.whitePlayer
    ns.blackPlayer = cur.blackPlayer
    ns.phase = 'lobby'
    ns.message = 'Game reset. Ready up to start!'
    SFX.invalid()
    push(ns)
    setShowNewGameConfirm(false)
    // Reset view to default
    setZoom(0.62)
    setPan({ x: 60, y: 40 })
    setNewBoardAnimation(true)
    setTimeout(() => setNewBoardAnimation(false), 800)
  }, [sdk, push])

  const cancelReset = useCallback(() => {
    setShowNewGameConfirm(false)
  }, [])

  const handleSubmit = useCallback(() => {
    if (!sdk || !isMyTurn) return
    const ns = submitMoves(gsRef.current)
    if (ns) {
      SFX.submit()
      if (ns.phase === 'ended') {
        setTimeout(() => SFX.checkmate(), 200)
      } else if ((ns.inCheckBoards || []).length > 0) {
        setTimeout(() => SFX.check(), 100)
      }
      push(ns)
    }
  }, [sdk, isMyTurn, push])

  const handleUndo = useCallback(() => {
    if (!sdk || !isMyTurn) return
    const ns = undoLastMove(gsRef.current)
    if (ns) { SFX.undo(); push(ns) }
  }, [sdk, isMyTurn, push])

  const handleCellClick = useCallback((timelineIndex, boardIndex, row, col) => {
    if (!isMyTurn || gs.phase !== 'playing') return
    const tl = gs.timelines[timelineIndex]
    if (!tl) return
    const bd = tl.boards[boardIndex]
    if (!bd) return
    const piece = bd.board[row]?.[col]

    if (piece && pieceColor(piece) === myColor && bd.isPlayable) {
      SFX.select()
      setGs(prev => ({ ...prev, selectedPiece: { timelineIndex, boardIndex, x: col, y: row } }))
      return
    }

    if (gs.selectedPiece) {
      const destPiece = bd.board[row]?.[col]
      const isTT = isTimeTravelMove(gs.selectedPiece, { timelineIndex, boardIndex, x: col, y: row })
      const ns = applyMove(gs, gs.selectedPiece, { timelineIndex, boardIndex, x: col, y: row })
      if (ns) {
        if (isTT) {
          SFX.timeTravel()
          // Trigger time travel animation
          const fromBoard = gs.timelines[gs.selectedPiece.timelineIndex]?.boards[gs.selectedPiece.boardIndex]
          const toBoard = ns.timelines[timelineIndex]?.boards[boardIndex]
          if (fromBoard && toBoard) {
            const fromTurn = fromBoard.turnNumber
            const toTurn = toBoard.turnNumber
            const fromPos = {
              x: 120 + fromTurn * 98 + gs.selectedPiece.x * 48 + 24,
              y: 80 + gs.selectedPiece.timelineIndex * 118 + 30 + gs.selectedPiece.y * 48 + 24
            }
            const toPos = {
              x: 120 + toTurn * 98 + col * 48 + 24,
              y: 80 + timelineIndex * 118 + 30 + row * 48 + 24
            }
            startTimeTravelAnimation(fromPos, toPos, piece)
            // Trigger board entrance animation for new timeline
            if (isTT && ns.timelines.length > gs.timelines.length) {
              // New timeline was created
              startNewBoardAnimation(ns.timelines.length - 1)
            }
          }
        } else if (destPiece) {
          SFX.capture()
        } else {
          SFX.move()
        }
        push(ns)
      } else {
        SFX.invalid()
        setGs(prev => ({ ...prev, selectedPiece: null }))
      }
    }
  }, [gs, isMyTurn, myColor, push])

  // ─── Pan / Zoom (with mouse position zoom) ───────────────────────────────────

  const onWheel = useCallback(e => {
    e.preventDefault()
    const viewport = viewportRef.current
    if (!viewport) return
    
    const rect = viewport.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    
    // Calculate world coordinates at mouse position before zoom
    const worldX = (mouseX - pan.x) / zoom
    const worldY = (mouseY - pan.y) / zoom
    
    // Apply zoom
    const newZoom = Math.max(0.15, Math.min(3, zoom * (e.deltaY > 0 ? 0.9 : 1.1)))
    
    // Calculate new pan to keep mouse position fixed
    const newPanX = mouseX - worldX * newZoom
    const newPanY = mouseY - worldY * newZoom
    
    setZoom(newZoom)
    setPan({ x: newPanX, y: newPanY })
  }, [zoom, pan])

  const onMouseDown = useCallback(e => {
    if (e.target.closest('[data-cell]')) return
    e.preventDefault()
    setPanning(true)
    panStart.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }
  }, [pan])

  const onMouseMove = useCallback(e => {
    if (!panning) return
    setPan({ x: panStart.current.px + e.clientX - panStart.current.x, y: panStart.current.py + e.clientY - panStart.current.y })
  }, [panning])

  const onMouseUp = useCallback(() => setPanning(false), [])
  
  const resetView = useCallback(() => {
    const pbs = getPlayableBoards(gs)
    if (pbs.length > 0) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
      pbs.forEach(pb => {
        const x = MARGIN_LEFT + pb.boardIndex * (BOARD_PX + TURN_GAP) + BOARD_PX / 2
        const y = MARGIN_TOP + pb.timelineIndex * (BOARD_PX + TL_GAP + LABEL_H) + BOARD_PX / 2
        minX = Math.min(minX, x)
        maxX = Math.max(maxX, x)
        minY = Math.min(minY, y)
        maxY = Math.max(maxY, y)
      })
      const viewport = viewportRef.current
      if (viewport) {
        const vw = viewport.clientWidth
        const vh = viewport.clientHeight
        const centerX = (minX + maxX) / 2
        const centerY = (minY + maxY) / 2
        const newZoom = 0.8
        setZoom(newZoom)
        setPan({ x: vw / 2 - centerX * newZoom, y: vh / 2 - centerY * newZoom })
      }
    } else {
      setZoom(0.62)
      setPan({ x: 60, y: 40 })
    }
  }, [gs])

  // Keyboard shortcuts - placed after all handlers are defined
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't trigger shortcuts when typing in inputs
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return

      switch (e.key.toLowerCase()) {
        case 'f':
          // F to submit moves
          if (isMyTurn && gs.phase === 'playing' && gs.pendingMoves.length > 0) {
            handleSubmit()
          }
          break
        case 'z':
          // Z to undo (with Ctrl)
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            if (isMyTurn && gs.phase === 'playing' && gs.pendingMoves.length > 0) {
              handleUndo()
            }
          }
          break
        case 'escape':
          // Escape to deselect or close tutorial
          if (showTutorial) {
            setShowTutorial(false)
          } else {
            setGs(prev => ({ ...prev, selectedPiece: null }))
          }
          break
        case 'h':
        case '?':
          // H or ? to show tutorial
          setShowTutorial(true)
          break
        case 'r':
          // R to reset view
          resetView()
          break
        case ' ':
          // Space to ready up in lobby
          if (gs.phase === 'lobby' && myColor) {
            handleReady()
          }
          break
        case 's':
          // Ctrl+S to save game
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            if (gs.phase === 'playing') {
              const saveData = JSON.stringify(gs)
              localStorage.setItem('5dchess_save', saveData)
              alert('Game saved!')
            }
          }
          break
        case 'l':
          // Ctrl+L to load game
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            const saved = localStorage.getItem('5dchess_save')
            if (saved) {
              const loaded = JSON.parse(saved)
              setGs(loaded)
              gsRef.current = loaded
              alert('Game loaded!')
            } else {
              alert('No saved game found')
            }
          }
          break
        default:
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isMyTurn, gs.phase, gs.pendingMoves, showTutorial, myColor, handleSubmit, handleUndo, handleReady, resetView])

  const presentLineX = useMemo(() =>
    MARGIN_LEFT + presentTurn * (BOARD_PX + TURN_GAP) + BOARD_PX / 2
  , [presentTurn])

  const validMoveSet = useMemo(() => {
    const set = {}
    validMoves.forEach(m => { set[`${m.timelineIndex},${m.boardIndex},${m.x},${m.y}`] = m })
    return set
  }, [validMoves])

  // Timeline connection lines (SVG)
  const timelineLines = useMemo(() => {
    const lines = []
    gs.timelines.forEach((tl, ti) => {
      if (tl.createdBy !== null && ti > 0) {
        // Find parent timeline
        const parentCreationOrder = tl.creationOrder - 1
        const parentTl = gs.timelines.find(t => 
          t.createdBy === tl.createdBy && t.creationOrder === parentCreationOrder
        )
        if (parentTl) {
          const parentIdx = gs.timelines.indexOf(parentTl)
          const y1 = MARGIN_TOP + parentIdx * (BOARD_PX + TL_GAP + LABEL_H) + BOARD_PX / 2
          const y2 = MARGIN_TOP + ti * (BOARD_PX + TL_GAP + LABEL_H) + BOARD_PX / 2
          const x = MARGIN_LEFT - 40
          lines.push({ x1: x - 20, y1, x2: x, y2, color: tlArrowColor(gs, tl), key: `line-${ti}` })
        }
      }
    })
    return lines
  }, [gs.timelines])

  // Captured pieces timeline indicator
  const capturedTimelineIndicators = useMemo(() => {
    const indicators = []
    gs.moveHistory.forEach((move, i) => {
      if (move.to && move.from) {
        const fromX = MARGIN_LEFT + move.from.boardIndex * (BOARD_PX + TURN_GAP)
        const fromY = MARGIN_TOP + move.from.timelineIndex * (BOARD_PX + TL_GAP + LABEL_H)
        indicators.push({
          x: fromX + move.from.x * CELL + CELL / 2,
          y: fromY + move.from.y * CELL + CELL / 2 + LABEL_H,
          color: pieceColor(move.piece) === WHITE ? '#e5e5e5' : '#525252',
          key: `capture-${i}`
        })
      }
    })
    return indicators
  }, [gs.moveHistory])

  if (!sdk) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: '#1a1a1a', color: '#fff', flexDirection: 'column', gap: 16 }}>
        <div style={{ width: 40, height: 40, border: '3px solid #333', borderTopColor: '#a855f7', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <span>Loading 5D Chess...</span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  const myReady = myColor === WHITE ? gs.whiteReady : myColor === BLACK ? gs.blackReady : false
  const isEnded = gs.phase === 'ended'

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', background: '#111', overflow: 'hidden', color: '#e2e8f0', fontFamily: 'system-ui, sans-serif', userSelect: 'none' }}>

      {/* Time travel flash overlay */}
      {timeTravelFlash && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 1000, pointerEvents: 'none',
          background: 'radial-gradient(ellipse at center, rgba(168,85,247,0.35) 0%, transparent 70%)',
          animation: 'ttFlash 0.6s ease-out forwards',
        }} />
      )}

      {/* New Game Confirmation Dialog */}
      {showNewGameConfirm && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 2000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
          animation: 'fadeIn 0.2s ease-out',
        }}>
          <div style={{
            background: '#1a1a1a', border: '2px solid #ef4444', borderRadius: 12,
            padding: 24, maxWidth: 360, boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            animation: 'dialogPopIn 0.25s cubic-bezier(0.34,1.56,0.64,1)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ 
                width: 40, height: 40, borderRadius: '50%', 
                background: 'rgba(239,68,68,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 24
              }}>
                ⚠️
              </div>
              <div>
                <h3 style={{ margin: 0, color: '#ef4444', fontSize: 18, fontWeight: 'bold' }}>Start New Game?</h3>
                <p style={{ margin: '4px 0 0', color: '#888', fontSize: 12 }}>Current game progress will be lost</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button 
                onClick={cancelReset}
                style={{
                  padding: '10px 20px', borderRadius: 6, border: '1px solid #444',
                  background: 'rgba(255,255,255,0.05)', color: '#aaa', fontSize: 13,
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
              >
                Cancel
              </button>
              <button 
                onClick={confirmReset}
                style={{
                  padding: '10px 20px', borderRadius: 6, border: 'none',
                  background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: '#fff', 
                  fontSize: 13, fontWeight: 'bold', cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(239,68,68,0.4)', transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.02)' }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
              >
                New Game
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Viewport */}
      <div
        ref={viewportRef}
        style={{ flex: 1, position: 'relative', overflow: 'hidden', cursor: panning ? 'grabbing' : 'grab' }}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onContextMenu={e => e.preventDefault()}
      >
        {/* 5D Chess Canvas Renderer */}
        <Chess5DCanvas
          state={gs}
          zoom={zoom}
          pan={pan}
          selectedPiece={gs.selectedPiece}
          validMoves={validMoves}
          lastMove={gs.lastMove}
          checkBoardSet={checkBoardSet}
          checkLines={temporalCheckLines}
          presentTurn={presentTurn}
          timelineActiveMap={timelineActiveMap}
          onCellClick={handleCellClick}
          width={viewportSize.width}
          height={viewportSize.height}
        />
      </div>

      {/* Turn indicator overlay - positioned on top of viewport */}
      <div style={{
        position: 'absolute', top: 10, left: 10,
        padding: '6px 14px',
        background: 'rgba(20,20,20,0.95)',
        border: `2px solid ${gs.currentTurn === WHITE ? '#e5e5e5' : '#525252'}`,
        borderRadius: 6,
        color: gs.currentTurn === WHITE ? '#f5f5f5' : '#aaa',
        fontSize: 13, fontWeight: 'bold', pointerEvents: 'none',
        boxShadow: `0 0 10px rgba(${gs.currentTurn === WHITE ? '229,229,229' : '82,82,82'},0.2)`,
        display: 'flex', flexDirection: 'column', gap: 4,
        zIndex: 100,
      }}>
        <div>
          {gs.currentTurn === WHITE ? '● White' : '● Black'} to Move
          {cpuThinking && (
            <span style={{ marginLeft: 8, color: '#a855f7', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ 
                width: 8, height: 8, borderRadius: '50%', 
                background: '#a855f7', animation: 'checkPulse 0.6s infinite'
              }} />
              CPU Thinking...
            </span>
          )}
          {isEnded && gs.winner && (
            <span style={{ marginLeft: 8, color: '#fbbf24' }}>
              — {gs.winner === WHITE ? 'White' : 'Black'} wins!
            </span>
          )}
          {isEnded && !gs.winner && (
            <span style={{ marginLeft: 8, color: '#94a3b8' }}>— Draw</span>
          )}
        </div>
        {isMyTurn && gs.phase === 'playing' && !cpuThinking && (
          <div style={{ fontSize: 10, color: '#22c55e', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ 
              width: 6, height: 6, borderRadius: '50%', 
              background: gs.pendingMoves.length > 0 ? '#22c55e' : '#fbbf24',
              animation: gs.pendingMoves.length === 0 ? 'checkPulse 1s infinite' : 'none'
            }} />
            {gs.pendingMoves.length > 0 
              ? `${gs.pendingMoves.length} move(s) ready`
              : 'Make moves on all present boards'}
          </div>
          )}
      </div>

      {/* Side panel - game info */}
      <div style={{
        position: 'absolute', top: 10, right: 10,
        display: 'flex', flexDirection: 'column', gap: 8,
        maxWidth: 200, pointerEvents: 'none', zIndex: 100,
      }}>
        {/* Present turn indicator */}
        <div style={{
          padding: '8px 12px', borderRadius: 8,
          background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.4)',
          backdropFilter: 'blur(4px)',
        }}>
          <div style={{ fontSize: 10, color: '#a855f7', fontWeight: 'bold', marginBottom: 4 }}>PRESENT</div>
          <div style={{ fontSize: 14, color: '#e2e8f0', fontFamily: 'monospace' }}>
            Turn {presentTurn.toFixed(1)}
          </div>
          <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>
            {gs.timelines.length} timeline{gs.timelines.length !== 1 ? 's' : ''} • {gs.timelines.reduce((a, t) => a + t.boards.length, 0)} boards
          </div>
        </div>

        {/* Captured pieces */}
        {(capturedPieces.white.length > 0 || capturedPieces.black.length > 0) && (
          <div style={{
            padding: '8px 12px', borderRadius: 8,
            background: 'rgba(0,0,0,0.6)', border: '1px solid #2a2a2a',
            backdropFilter: 'blur(4px)',
          }}>
            <div style={{ fontSize: 10, color: '#888', marginBottom: 4 }}>Captured</div>
            {capturedPieces.white.length > 0 && (
              <div style={{ fontSize: 14, marginBottom: 2 }}>
                <span style={{ color: '#e5e5e5' }}>White: </span>
                {capturedPieces.white.map(p => {
                  const symbols = { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' }
                  return symbols[p[1]] || ''
                }).join(' ')}
              </div>
            )}
            {capturedPieces.black.length > 0 && (
              <div style={{ fontSize: 14 }}>
                <span style={{ color: '#888' }}>Black: </span>
                {capturedPieces.black.map(p => {
                  const symbols = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' }
                  return symbols[p[1]] || ''
                }).join(' ')}
              </div>
            )}
          </div>
        )}

        {/* Move info */}
        {gs.lastMove && (
          <div style={{
            padding: '8px 12px', borderRadius: 8,
            background: 'rgba(0,0,0,0.6)', border: '1px solid #2a2a2a',
            backdropFilter: 'blur(4px)',
          }}>
            <div style={{ fontSize: 10, color: '#888', marginBottom: 4 }}>Last Move</div>
            <div style={{ fontSize: 12, color: '#e2e8f0' }}>
              {gs.lastMove.isTimeTravel ? '⚡ Time Travel' : '→ Normal'}
              {gs.lastMove.isCapture ? ' ✕ Capture' : ''}
            </div>
          </div>
        )}

        {/* Stalemate risk warning */}
        {(stalemateRisk?.white || stalemateRisk?.black) && gs.phase === 'playing' && (
          <div style={{
            padding: '8px 12px', borderRadius: 8,
            background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.4)',
            backdropFilter: 'blur(4px)',
          }}>
            <div style={{ fontSize: 10, color: '#fbbf24', fontWeight: 'bold' }}>⚠ Stalemate Risk</div>
            <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>
              {stalemateRisk.white && stalemateRisk.black 
                ? 'Both players have few pieces'
                : stalemateRisk.white 
                  ? 'White has very few pieces'
                  : 'Black has very few pieces'}
            </div>
          </div>
        )}

        {/* Move History Panel */}
        {gs.moveHistory.length > 0 && (
          <div style={{
            padding: '8px 12px', borderRadius: 8,
            background: 'rgba(0,0,0,0.6)', border: '1px solid #2a2a2a',
            backdropFilter: 'blur(4px)',
            maxHeight: 200, overflowY: 'auto',
          }}>
            <div style={{ fontSize: 10, color: '#888', marginBottom: 6 }}>Move History</div>
            {gs.moveHistory.slice(-10).map((move, i) => {
              const notation = getMoveNotation(move, gs)
              const color = move.piece?.[0] === 'w' ? 'White' : 'Black'
              const isTimeTravel = move.to?.timelineIndex !== move.from?.timelineIndex
              const moveNum = Math.floor((gs.moveHistory.length - 10 + i + 2) / 2) + 1
              const isWhiteMove = move.piece?.[0] === 'w'
              
              return (
                <div key={i} style={{ 
                  fontSize: 11, color: '#e2e8f0', 
                  padding: '2px 0',
                  borderBottom: i < gs.moveHistory.slice(-10).length - 1 ? '1px solid #333' : 'none',
                  display: 'flex', alignItems: 'center', gap: 6,
                  fontFamily: 'monospace',
                }}>
                  <span style={{ color: '#666', fontSize: 9, minWidth: 24 }}>
                    {isWhiteMove ? `${moveNum}.` : `${moveNum}...`}
                  </span>
                  <span style={{ 
                    color: color === 'White' ? '#f5f5f5' : '#a0a0a0',
                    fontWeight: isTimeTravel ? 'bold' : 'normal'
                  }}>
                    {notation}
                  </span>
                  {move.isCapture && <span style={{ color: '#ef4444', fontSize: 9 }}>✕</span>}
                  {isTimeTravel && <span style={{ color: '#a855f7', fontSize: 8 }}>⚡T{move.to?.timelineIndex ?? 0}</span>}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Bottom panel */}
      <div style={{ background: '#0d0d0d', borderTop: '1px solid #2a2a2a', padding: '10px 16px', display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 12, flex: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          <PlayerSlot color={WHITE} player={gs.whitePlayer} ready={gs.whiteReady} userId={userId} onJoin={() => handleJoin(WHITE)} onLeave={handleLeave} />
          <PlayerSlot color={BLACK} player={gs.blackPlayer} ready={gs.blackReady} userId={userId} onJoin={() => handleJoin(BLACK)} onLeave={handleLeave} />
          
          {/* CPU Mode Toggle */}
          {gs.phase === 'lobby' && (
            <div style={{ 
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 12px', borderRadius: 8,
              background: cpuMode ? 'rgba(168,85,247,0.15)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${cpuMode ? 'rgba(168,85,247,0.4)' : '#2a2a2a'}`,
              transition: 'all 0.2s',
            }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: cpuMode ? '#c084fc' : '#888' }}>
                <input 
                  type="checkbox" 
                  checked={cpuMode} 
                  onChange={e => {
                    cpuModeRef.current = e.target.checked
                    setCpuMode(e.target.checked)
                  }}
                  style={{ accentColor: '#a855f7' }}
                />
                <span>CPU Opponent</span>
              </label>
              {cpuMode && (
                <select 
                  value={cpuDifficulty} 
                  onChange={e => {
                    cpuDifficultyRef.current = e.target.value
                    setCpuDifficulty(e.target.value)
                  }}
                  style={{
                    padding: '4px 8px', borderRadius: 4,
                    background: '#1a1a1a', border: '1px solid #444',
                    color: '#c084fc', fontSize: 11, cursor: 'pointer',
                  }}
                >
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              )}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {/* Quick Practice vs CPU button - only show in lobby when not in CPU mode */}
          {gs.phase === 'lobby' && !cpuMode && !gs.whitePlayer && !gs.blackPlayer && (
            <Btn onClick={() => {
              cpuModeRef.current = true
              setCpuMode(true)
              handleJoin(WHITE)
            }} variant="purple" pad="8px 16px">
              🤖 Practice vs CPU
            </Btn>
          )}
          {myColor && gs.phase === 'lobby' && (
            <Btn onClick={handleReady} variant={myReady ? 'success' : 'primary'} pad="8px 16px">
              {myReady ? '✓ Ready' : 'Ready Up'}
            </Btn>
          )}
          {isMyTurn && gs.phase === 'playing' && (
            <>
              <Btn onClick={handleUndo} disabled={gs.pendingMoves.length === 0} variant="warn">
                ↶ Undo
              </Btn>
              <Btn onClick={handleSubmit} disabled={gs.pendingMoves.length === 0} variant="success" pad="8px 16px">
                Submit Moves ✓
              </Btn>
            </>
          )}
          {isEnded && (
            <Btn onClick={handleReset} variant="danger" pad="8px 16px">
              New Game
            </Btn>
          )}
          {/* Help button */}
          <Btn onClick={() => setShowTutorial(true)} variant="purple" pad="8px 12px">
            ? Help
          </Btn>
          {/* Save/Load buttons */}
          {gs.phase === 'playing' && (
            <>
              <Btn onClick={() => {
                const saveData = JSON.stringify(gs)
                localStorage.setItem('5dchess_save', saveData)
                alert('Game saved!')
              }} variant="purple" pad="8px 12px">
                💾 Save
              </Btn>
              <Btn onClick={() => {
                const saved = localStorage.getItem('5dchess_save')
                if (saved) {
                  const loaded = JSON.parse(saved)
                  setGs(loaded)
                  gsRef.current = loaded
                  alert('Game loaded!')
                } else {
                  alert('No saved game found')
                }
              }} variant="purple" pad="8px 12px">
                📂 Load
              </Btn>
            </>
          )}
        </div>
      </div>

      {/* Status bar */}
      <div style={{ padding: '5px 16px', background: '#0a0a0a', borderTop: '1px solid #1a1a1a', color: '#888', fontSize: 11, textAlign: 'center', fontFamily: 'monospace' }}>
        {gs.message}
      </div>

      {/* Help bar */}
      <div style={{ padding: '4px 16px', background: '#080808', color: '#444', fontSize: 10, textAlign: 'center' }}>
        Click piece → select · Click square → move · ● normal · 🟢 time travel · Scroll=zoom · Drag=pan · [F] Submit · [H] Help · [R] Reset · [Space] Ready · [Ctrl+S] Save · [Ctrl+L] Load
      </div>

      {/* Tutorial */}
      {showTutorial && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
          background: '#111', border: '2px solid #a855f7', borderRadius: 12, padding: 20,
          maxWidth: 460, zIndex: 1000, boxShadow: '0 0 40px rgba(168,85,247,0.3)',
          animation: 'fadeInScale 0.25s ease-out',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ color: '#a855f7', margin: 0, fontSize: 16, fontWeight: 'bold' }}>5D Chess — How to Play</h3>
            <button onClick={() => setShowTutorial(false)} style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.5)', borderRadius: 4, color: '#fca5a5', padding: '4px 10px', cursor: 'pointer', fontSize: 11 }}>Close</button>
          </div>
          <div style={{ color: '#ccc', fontSize: 12, lineHeight: 1.7 }}>
            <p style={{ color: '#e5e5e5', fontWeight: 'bold', marginBottom: 4 }}>Board Layout</p>
            <ul style={{ margin: '0 0 10px 0', paddingLeft: 16, fontSize: 11 }}>
              <li>Horizontal = Time axis (turns, left → right)</li>
              <li>Vertical = Timeline axis (multiverse rows)</li>
              <li>Thick outline = Playable board (your turn)</li>
              <li>Purple bar = Present time · ⚠ Red = Check!</li>
            </ul>
            <p style={{ color: '#a855f7', fontWeight: 'bold', marginBottom: 4 }}>Time Travel</p>
            <ul style={{ margin: '0 0 10px 0', paddingLeft: 16, fontSize: 11 }}>
              <li>Move to an <strong>older board</strong> or <strong>different timeline</strong> → creates new timeline</li>
              <li>● Dark dot = normal move · 🟣 Purple = time travel</li>
              <li>Check can come from ANY timeline — past, future, or parallel!</li>
            </ul>
            <p style={{ color: '#22c55e', fontWeight: 'bold', marginBottom: 4 }}>4D Piece Movement</p>
            <ul style={{ margin: '0 0 10px 0', paddingLeft: 16, fontSize: 11 }}>
              <li><strong>Rook</strong> — any distance along exactly 1 of 4 axes</li>
              <li><strong>Bishop</strong> — any distance along exactly 2 axes equally</li>
              <li><strong>Queen</strong> — any distance along any axes equally</li>
              <li><strong>King</strong> — 1 space along any axes</li>
              <li><strong>Knight</strong> — 2+1 pattern across any 2 axes (can jump)</li>
              <li><strong>Pawn</strong> — forward on y-axis or timeline axis</li>
            </ul>
            <p style={{ color: '#fbbf24', fontWeight: 'bold', marginBottom: 4 }}>Turn Flow</p>
            <ul style={{ margin: '0', paddingLeft: 16, fontSize: 11 }}>
              <li>Make moves on all playable boards, then Submit</li>
              <li>Undo fully reverts your last pending move (even time travel)</li>
              <li>You must move until the present line shifts to opponent</li>
            </ul>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes piecePopIn {
          0% { transform: scale(0.3) rotate(-12deg); opacity: 0; }
          50% { transform: scale(1.18) rotate(3deg); opacity: 1; }
          70% { transform: scale(0.95) rotate(-1deg); }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        @keyframes ttFlash {
          0% { opacity: 0; }
          15% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes ttDotPulse {
          0%, 100% { opacity: 0.5; transform: scale(0.85); }
          50% { opacity: 1; transform: scale(1.15); }
        }
        @keyframes checkPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes presentPulse {
          0%, 100% { opacity: 0.7; box-shadow: 0 0 20px rgba(168,85,247,0.4); }
          50% { opacity: 1; box-shadow: 0 0 30px rgba(168,85,247,0.8); }
        }
        @keyframes fadeInScale {
          from { opacity: 0; transform: translate(-50%,-50%) scale(0.9); }
          to { opacity: 1; transform: translate(-50%,-50%) scale(1); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes boardGlow {
          0%, 100% { box-shadow: 0 0 8px rgba(168,85,247,0.3); }
          50% { box-shadow: 0 0 16px rgba(168,85,247,0.6); }
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(-20px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes dialogPopIn {
          0% { opacity: 0; transform: scale(0.8) translateY(10px); }
          60% { transform: scale(1.02) translateY(-2px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes boardSlideIn {
          0% { opacity: 0; transform: translateY(20px) scale(0.95); }
          60% { transform: translateY(-4px) scale(1.01); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes timelineBranch {
          0% { opacity: 0; transform: scaleX(0); }
          60% { opacity: 1; transform: scaleX(1.05); }
          100% { opacity: 1; transform: scaleX(1); }
        }
        @keyframes newBoardPulse {
          0% { box-shadow: 0 0 0 0 rgba(168,85,247,0.7); }
          70% { box-shadow: 0 0 0 20px rgba(168,85,247,0); }
          100% { box-shadow: 0 0 0 0 rgba(168,85,247,0); }
        }
        @keyframes moveHighlight {
          0%, 100% { background-color: rgba(251,191,36,0.3); }
          50% { background-color: rgba(251,191,36,0.5); }
        }
        @keyframes cpuPulse {
          0%, 100% { box-shadow: 0 0 4px rgba(168,85,247,0.4); }
          50% { box-shadow: 0 0 12px rgba(168,85,247,0.8); }
        }
        @keyframes slideInBottom {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pieceSlide {
          0% { transform: translate(var(--from-x), var(--from-y)); }
          100% { transform: translate(0, 0); }
        }
      `}</style>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

const HudBox = ({ children, highlight, danger, warning, clickable, onClick }) => (
  <div 
    onClick={clickable ? onClick : undefined}
    style={{
      padding: '4px 8px',
      background: danger ? 'rgba(239,68,68,0.15)' : warning ? 'rgba(251,191,36,0.15)' : highlight ? 'rgba(251,191,36,0.9)' : 'rgba(15,15,15,0.95)',
      border: `1px solid ${danger ? '#ef4444' : warning ? '#fbbf24' : highlight ? 'rgba(255,255,255,0.2)' : '#2a2a2a'}`,
      borderRadius: 5, fontSize: 11, fontFamily: 'monospace',
      color: danger ? '#ef4444' : warning ? '#fbbf24' : highlight ? '#000' : '#666',
      pointerEvents: clickable ? 'auto' : 'none',
      cursor: clickable ? 'pointer' : 'default',
      fontWeight: (highlight || danger || warning) ? 'bold' : 'normal',
      animation: (danger || warning) ? 'checkPulse 1s ease-in-out infinite' : 'none',
      transition: 'transform 0.1s, box-shadow 0.2s',
    }}
    onMouseEnter={e => { if (clickable) { e.currentTarget.style.transform = 'scale(1.05)'; e.currentTarget.style.boxShadow = '0 0 10px rgba(255,255,255,0.2)' } }}
    onMouseLeave={e => { if (clickable) { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none' } }}
  >
    {children}
  </div>
)

const VARIANT_STYLES = {
  primary: { bg: '#3b82f6', color: '#fff', border: 'none' },
  success: { bg: '#22c55e', color: '#fff', border: 'none' },
  warn:    { bg: 'rgba(251,191,36,0.15)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.4)' },
  danger:  { bg: 'rgba(239,68,68,0.15)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.4)' },
  ghost:   { bg: 'rgba(255,255,255,0.05)', color: '#888', border: '1px solid #2a2a2a' },
  purple:  { bg: 'rgba(168,85,247,0.15)', color: '#c084fc', border: '1px solid rgba(168,85,247,0.4)' },
}

const Btn = ({ children, onClick, disabled, variant = 'ghost', pad }) => {
  const v = VARIANT_STYLES[variant] || VARIANT_STYLES.ghost
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: pad || '6px 12px', border: v.border || 'none', borderRadius: 5,
      background: v.bg, color: v.color, fontSize: 11, fontWeight: 'bold',
      cursor: disabled ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
      opacity: disabled ? 0.5 : 1, transition: 'opacity 0.15s, transform 0.1s',
    }}
    onMouseEnter={e => { if (!disabled) e.currentTarget.style.transform = 'scale(1.04)' }}
    onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
    >
      {children}
    </button>
  )
}

const PlayerSlot = ({ color, player, ready, userId, onJoin, onLeave }) => {
  const isWhite = color === WHITE
  const isCpu = player?.id === 'cpu'
  // Black & White scheme — no blue/red
  const slotBg = player
    ? isCpu 
      ? 'rgba(168,85,247,0.1)'
      : isWhite ? 'rgba(240,240,240,0.06)' : 'rgba(60,60,60,0.15)'
    : 'rgba(255,255,255,0.02)'
  const borderColor = ready
    ? isCpu ? '#a855f7' : '#22c55e'
    : player
      ? isCpu ? 'rgba(168,85,247,0.4)' : isWhite ? '#d4d4d4' : '#525252'
      : '#2a2a2a'
  const avatarBg = isCpu
    ? 'linear-gradient(135deg,#a855f7,#7c3aed)'
    : isWhite
      ? 'linear-gradient(135deg,#e5e5e5,#a3a3a3)'
      : 'linear-gradient(135deg,#404040,#1a1a1a)'
  const isMe = player?.id === userId

  return (
    <div style={{
      padding: 10, borderRadius: 10, minWidth: 175,
      display: 'flex', alignItems: 'center', gap: 10,
      background: slotBg, border: `2px solid ${borderColor}`,
      transition: 'border-color 0.3s, background 0.3s',
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: avatarBg, overflow: 'hidden',
        border: `1px solid ${isCpu ? '#a855f7' : isWhite ? '#ccc' : '#444'}`,
        animation: isCpu ? 'cpuPulse 2s ease-in-out infinite' : 'none',
      }}>
        {isCpu ? (
          <span style={{ fontSize: 18 }}>🤖</span>
        ) : (
          <img
            src={isWhite ? PIECE_IMGS.wk : PIECE_IMGS.bk}
            alt={isWhite ? 'White King' : 'Black King'}
            draggable={false}
            style={{ width: 30, height: 30, display: 'block', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))' }}
          />
        )}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ color: isCpu ? '#c084fc' : isWhite ? '#f5f5f5' : '#aaa', fontWeight: 'bold', fontSize: 13 }}>
          {player?.username || (isWhite ? 'White — Open' : 'Black — Open')}
          {isCpu && <span style={{ marginLeft: 4, fontSize: 9, color: '#a855f7' }}>AI</span>}
        </div>
        <div style={{ color: isCpu ? '#a855f7' : '#555', fontSize: 10 }}>
          {player ? (ready ? '✓ Ready' : 'Not Ready') : 'Empty seat'}
        </div>
      </div>
      {!player && (
        <button onClick={onJoin} style={{
          padding: '5px 10px', border: `1px solid ${isWhite ? '#d4d4d4' : '#525252'}`,
          borderRadius: 5, background: isWhite ? 'rgba(229,229,229,0.1)' : 'rgba(82,82,82,0.2)',
          color: isWhite ? '#e5e5e5' : '#888', fontSize: 11, fontWeight: 'bold', cursor: 'pointer',
        }}>
          Join
        </button>
      )}
      {isMe && (
        <button onClick={onLeave} style={{
          padding: '5px 8px', border: '1px solid rgba(239,68,68,0.4)',
          borderRadius: 5, background: 'rgba(239,68,68,0.1)',
          color: '#fca5a5', fontSize: 10, fontWeight: 'bold', cursor: 'pointer',
        }}>
          Leave
        </button>
      )}
    </div>
  )
}

export default TimeDilationChessActivity
