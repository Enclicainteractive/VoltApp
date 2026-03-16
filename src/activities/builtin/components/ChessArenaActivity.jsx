import React, { useEffect, useState, useCallback, useRef } from 'react'
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'

const EMPTY = null
const WHITE = 'w'
const BLACK = 'b'
const PIECE_TYPES = {
  wp: 'p', wr: 'r', wn: 'n', wb: 'b', wq: 'q', wk: 'k',
  bp: 'p', br: 'r', bn: 'n', bb: 'b', bq: 'q', bk: 'k'
}

const initialBoard = () => [
  ['br', 'bn', 'bb', 'bq', 'bk', 'bb', 'bn', 'br'],
  ['bp', 'bp', 'bp', 'bp', 'bp', 'bp', 'bp', 'bp'],
  [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY],
  [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY],
  [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY],
  [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY],
  ['wp', 'wp', 'wp', 'wp', 'wp', 'wp', 'wp', 'wp'],
  ['wr', 'wn', 'wb', 'wq', 'wk', 'wb', 'wn', 'wr']
]

const initialCastling = {
  whiteKingside: true,
  whiteQueenside: true,
  blackKingside: true,
  blackQueenside: true
}

const PieceSVG = ({ type, color, size = 40 }) => {
  const isWhite = color === 'w'
  const fill = isWhite ? '#ffffff' : '#333333'
  const stroke = isWhite ? '#222222' : '#000000'
  const accent = isWhite ? '#cccccc' : '#111111'

  const pieces = {
    // ---- Pawn (classic Staunton) ----
    p: (
      <svg viewBox="0 0 45 45" width={size} height={size}>
        <path
          d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03C15.41 27.09 11 31.58 11 39h23c0-7.42-4.41-11.91-7.41-12.97C28.06 24.84 29 23.03 29 21c0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z"
          fill={fill} stroke={stroke} strokeWidth="1.5" strokeLinecap="round"
        />
        {isWhite && <path d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03C15.41 27.09 11 31.58 11 39h23c0-7.42-4.41-11.91-7.41-12.97C28.06 24.84 29 23.03 29 21c0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z" fill="none" stroke={stroke} strokeWidth="1.5" />}
      </svg>
    ),
    // ---- Rook (castle tower with crenellations) ----
    r: (
      <svg viewBox="0 0 45 45" width={size} height={size}>
        <g fill={fill} stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 39h27v-3H9v3z" />
          <path d="M12 36v-4h21v4H12z" />
          <path d="M11 14V9h4v2h5V9h5v2h5V9h4v5" />
          <path d="M34 14l-3 3H14l-3-3" />
          <path d="M15 17v7h15v-7" />
          <path d="M14 24l-2 8h21l-2-8" />
          {isWhite ? (
            <>
              <path d="M14 17.5h17" fill="none" stroke={stroke} strokeWidth="1" />
              <path d="M14 24.5h17" fill="none" stroke={stroke} strokeWidth="1" />
              <path d="M11.5 32.5h22" fill="none" stroke={stroke} strokeWidth="1" />
            </>
          ) : (
            <>
              <path d="M11 14h23" fill="none" stroke={accent} strokeWidth="1" strokeLinejoin="miter" />
              <path d="M14 17.5h17" fill="none" stroke={accent} strokeWidth="1" />
              <path d="M14 24.5h17" fill="none" stroke={accent} strokeWidth="1" />
            </>
          )}
        </g>
      </svg>
    ),
    // ---- Knight (horse head profile) ----
    n: (
      <svg viewBox="0 0 45 45" width={size} height={size}>
        <g fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path
            d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21"
            fill={fill}
          />
          <path
            d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3"
            fill={fill}
          />
          <path d="M9.5 25.5a.5.5 0 1 1-1 0 .5.5 0 1 1 1 0z" fill={stroke} stroke={stroke} />
          <path d="M14.933 15.75a.5 1.5 30 1 1-.866-.5.5 1.5 30 1 1 .866.5z" fill={stroke} stroke={stroke} />
          {!isWhite && (
            <path d="M24.55 10.4l-.45 1.45.5.15c3.15 1 5.65 2.49 7.9 6.75S35.75 29.06 35.25 39l-.05.5h2.25l.05-.5c.5-10.06-.88-16.85-3.25-21.34-2.37-4.49-5.79-6.64-9.19-7.16l-.51-.1z" fill={stroke} stroke="none" />
          )}
        </g>
      </svg>
    ),
    // ---- Bishop (mitre with slit) ----
    b: (
      <svg viewBox="0 0 45 45" width={size} height={size}>
        <g fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <g fill={fill} stroke={stroke} strokeLinecap="butt">
            <path d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.354.49-2.323.47-3-.5 1.354-1.94 3-2 3-2z" />
            <path d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z" />
            <path d="M25 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0z" />
          </g>
          <path d="M17.5 26h10M15 30h15" stroke={stroke} strokeLinejoin="miter" />
          <path d="M22.5 15.5v5M20 18h5" stroke={stroke} fill="none" strokeLinejoin="miter" />
          {!isWhite && (
            <>
              <path d="M17.5 26h10M15 30h15" stroke={accent} />
              <path d="M22.5 15.5v5M20 18h5" stroke={accent} />
            </>
          )}
        </g>
      </svg>
    ),
    // ---- Queen (crown with ball tips) ----
    q: (
      <svg viewBox="0 0 45 45" width={size} height={size}>
        <g fill={fill} stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          {isWhite ? (
            <>
              <path d="M8 12a2 2 0 1 1-4 0 2 2 0 1 1 4 0z" />
              <path d="M24.5 7.5a2 2 0 1 1-4 0 2 2 0 1 1 4 0z" />
              <path d="M41 12a2 2 0 1 1-4 0 2 2 0 1 1 4 0z" />
              <path d="M16 8.5a2 2 0 1 1-4 0 2 2 0 1 1 4 0z" />
              <path d="M33 9a2 2 0 1 1-4 0 2 2 0 1 1 4 0z" />
              <path d="M9 26c8.5-1.5 21-1.5 27 0l2-12-7 11V11l-5.5 13.5-3-15-3 15L14 11v14.5L7 14l2 12z" fill={fill} />
              <path d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z" fill={fill} />
              <path d="M11.5 30c3.5-1 18.5-1 22 0" fill="none" />
              <path d="M12 33.5c6-1 15-1 21 0" fill="none" />
            </>
          ) : (
            <>
              <circle cx="6" cy="12" r="2.75" />
              <circle cx="14" cy="9" r="2.75" />
              <circle cx="22.5" cy="8" r="2.75" />
              <circle cx="31" cy="9" r="2.75" />
              <circle cx="39" cy="12" r="2.75" />
              <path d="M9 26c8.5-1.5 21-1.5 27 0l2.5-12.5L31 25l-.3-14.1-5.2 13.6-3-14.5-3 14.5-5.2-13.6L14 25 6.5 13.5 9 26z" strokeLinecap="butt" />
              <path d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z" strokeLinecap="butt" />
              <path d="M11 38.5a35 35 1 0 0 23 0" fill="none" stroke={accent} strokeLinecap="butt" />
              <path d="M11 29a35 35 1 0 1 23 0" fill="none" stroke={accent} strokeLinecap="butt" />
              <path d="M12.5 31.5h20" fill="none" stroke={accent} strokeLinecap="butt" />
              <path d="M11.5 34.5a35 35 1 0 0 22 0" fill="none" stroke={accent} strokeLinecap="butt" />
              <path d="M10.5 37.5a35 35 1 0 0 24 0" fill="none" stroke={accent} strokeLinecap="butt" />
            </>
          )}
        </g>
      </svg>
    ),
    // ---- King (cross on top, wide body) ----
    k: (
      <svg viewBox="0 0 45 45" width={size} height={size}>
        <g fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          {isWhite ? (
            <>
              <path d="M22.5 11.63V6M20 8h5" stroke={stroke} strokeLinejoin="miter" />
              <path d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5" fill={fill} stroke={stroke} strokeLinecap="butt" strokeLinejoin="miter" />
              <path d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-3.5-7.5-13-10.5-16-4-3 6 5 10 5 10V37z" fill={fill} />
              <path d="M11.5 30c5.5-3 15.5-3 21 0" fill="none" />
              <path d="M11.5 33.5c5.5-3 15.5-3 21 0" fill="none" />
              <path d="M11.5 37c5.5-3 15.5-3 21 0" fill="none" />
            </>
          ) : (
            <>
              <path d="M22.5 11.63V6" stroke={stroke} strokeLinejoin="miter" />
              <path d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5" fill={fill} stroke={stroke} strokeLinecap="butt" strokeLinejoin="miter" />
              <path d="M20 8h5" stroke={stroke} strokeLinejoin="miter" />
              <path d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-3.5-7.5-13-10.5-16-4-3 6 5 10 5 10V37z" fill={fill} />
              <path d="M20 8h5" stroke={stroke} strokeLinejoin="miter" />
              <path d="M11.5 30c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0" stroke={accent} />
            </>
          )}
        </g>
      </svg>
    )
  }
  return pieces[type] || null
}

const PIECE_NAMES = {
  wp: 'White Pawn', wr: 'White Rook', wn: 'White Knight',
  wb: 'White Bishop', wq: 'White Queen', wk: 'White King',
  bp: 'Black Pawn', br: 'Black Rook', bn: 'Black Knight',
  bb: 'Black Bishop', bq: 'Black Queen', bk: 'Black King'
}

const baseState = {
  board: initialBoard(),
  turn: WHITE,
  selected: null,
  moveLog: [],
  status: 'waiting',
  winner: null,
  inCheck: null,
  castling: { ...initialCastling },
  enPassant: null,
  promotion: null,
  whitePlayer: null,
  blackPlayer: null,
  spectators: [],
  moveCount: 0
}

const inBounds = (x, y) => x >= 0 && y >= 0 && x < 8 && y < 8
const pieceColor = (p) => (p ? p[0] : null)
const pieceType = (p) => (p ? p[1] : null)
const isValidColor = (c) => c === WHITE || c === BLACK
const capturedPiecesForColor = (capturedPieces, color) => {
  if (color === WHITE) return capturedPieces.white || []
  if (color === BLACK) return capturedPieces.black || []
  return []
}
const sanitizePlayer = (player) => {
  if (!player || typeof player !== 'object' || !player.id) return null
  return { id: String(player.id), username: String(player.username || 'Player') }
}

const FILE_NAMES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
const PIECE_SYMBOLS = { p: '', r: 'R', n: 'N', b: 'B', q: 'Q', k: 'K' }

const toAlgebraic = (piece, from, to, captured, promotion, moveLog) => {
  const type = pieceType(piece)
  const color = pieceColor(piece)
  const isCapture = Boolean(captured) || (type === 'p' && Math.abs(to.x - from.x) === 1 && !captured)
  
  let notation = ''
  
  if (type === 'k' && Math.abs(to.x - from.x) === 2) {
    return to.x > from.x ? 'O-O' : 'O-O-O'
  }
  
  if (type !== 'p') {
    notation += PIECE_SYMBOLS[type]
  }
  
  const disambiguations = moveLog.filter((_, i) => i % 2 === (color === WHITE ? 0 : 1))
    .map(m => m?.piece).filter(p => p && pieceType(p) === type && pieceColor(p) === color)
  
  if (type === 'p' && isCapture) {
    notation += FILE_NAMES[from.x]
  }
  
  if (isCapture || type === 'p') {
    notation += FILE_NAMES[to.x] + (8 - to.y)
  } else {
    const sameFile = disambiguations.some(m => m && pieceType(m) === type && pieceColor(m) === color && m[0] === from.x.toString())
    const sameRank = disambiguations.some(m => m && pieceType(m) === type && pieceColor(m) === color && m[1] === from.y.toString())
    if (sameFile || sameRank) {
      if (!sameFile) notation += FILE_NAMES[from.x]
      if (!sameRank) notation += (8 - from.y)
    }
    notation += FILE_NAMES[to.x] + (8 - to.y)
  }
  
  if (promotion) {
    notation += '=' + PIECE_SYMBOLS[promotion.toLowerCase()].toUpperCase()
  }
  
  return notation
}

const sanitizeBoard = (board) => {
  if (!Array.isArray(board) || board.length !== 8) return null
  const safe = board.map((row) => {
    if (!Array.isArray(row) || row.length !== 8) return null
    return row.map((cell) => {
      if (cell == null) return null
      if (typeof cell !== 'string') return null
      const col = cell[0]
      const type = cell[1]
      if ((col === WHITE || col === BLACK) && 'prnbqk'.includes(type)) return cell
      return null
    })
  })
  return safe.some((r) => !r) ? null : safe
}

const deriveStatus = (status, whitePlayer, blackPlayer, winner) => {
  if (status === 'check' || status === 'checkmate' || status === 'stalemate') return status
  if (winner === WHITE || winner === BLACK) return 'checkmate'
  return whitePlayer && blackPlayer ? 'playing' : 'waiting'
}

const pathClear = (board, fx, fy, tx, ty) => {
  const dx = Math.sign(tx - fx)
  const dy = Math.sign(ty - fy)
  let x = fx + dx
  let y = fy + dy
  while (x !== tx || y !== ty) {
    if (board[y] && board[y][x]) return false
    x += dx
    y += dy
  }
  return true
}

const isSquareAttacked = (board, x, y, byColor) => {
  for (let sy = 0; sy < 8; sy++) {
    for (let sx = 0; sx < 8; sx++) {
      const piece = board[sy]?.[sx]
      if (piece && pieceColor(piece) === byColor) {
        const type = pieceType(piece)
        const dx = x - sx
        const dy = y - sy
        const adx = Math.abs(dx)
        const ady = Math.abs(dy)
        
        if (type === 'p') {
          const dir = byColor === WHITE ? -1 : 1
          if (adx === 1 && dy === dir) return true
        } else if (type === 'n') {
          if ((adx === 1 && ady === 2) || (adx === 2 && ady === 1)) return true
        } else if (type === 'b') {
          if (adx === ady && adx > 0 && pathClear(board, sx, sy, x, y)) return true
        } else if (type === 'r') {
          if ((dx === 0 || dy === 0) && (adx + ady > 0) && pathClear(board, sx, sy, x, y)) return true
        } else if (type === 'q') {
          if (((dx === 0 || dy === 0) || adx === ady) && (adx + ady > 0) && pathClear(board, sx, sy, x, y)) return true
        } else if (type === 'k') {
          if (adx <= 1 && ady <= 1 && (adx + ady > 0)) return true
        }
      }
    }
  }
  return false
}

const canCastle = (board, color, side, castling, inCheck) => {
  const row = color === WHITE ? 7 : 0
  const rook = `${color}r`
  const opponent = color === WHITE ? BLACK : WHITE
  
  if (inCheck) return false
  
  if (side === 'kingside') {
    const castleKey = color === WHITE ? 'whiteKingside' : 'blackKingside'
    if (!castling[castleKey]) return false
    if (board[row][5] || board[row][6]) return false
    if (board[row][7] !== rook) return false
    if (isSquareAttacked(board, 5, row, opponent)) return false
    if (isSquareAttacked(board, 6, row, opponent)) return false
    return true
  } else {
    const castleKey = color === WHITE ? 'whiteQueenside' : 'blackQueenside'
    if (!castling[castleKey]) return false
    if (board[row][1] || board[row][2] || board[row][3]) return false
    if (board[row][0] !== rook) return false
    if (isSquareAttacked(board, 2, row, opponent)) return false
    if (isSquareAttacked(board, 3, row, opponent)) return false
    return true
  }
}

const canEnPassant = (board, fx, fy, tx, ty, turn, enPassant) => {
  if (!enPassant) return false
  const dir = turn === WHITE ? -1 : 1
  if (tx === enPassant.x && fy === enPassant.y && ty === fy + dir) {
    return true
  }
  return false
}

const makeMove = (board, fx, fy, tx, ty, promotion = null) => {
  const newBoard = board.map((row) => [...row])
  const piece = newBoard[fy][fx]
  const type = pieceType(piece)
  const color = pieceColor(piece)
  
  const targetWasEmpty = !board[ty][tx]
  
  newBoard[ty][tx] = promotion ? `${color}${promotion}` : piece
  newBoard[fy][fx] = null
  
  if (type === 'k' && Math.abs(tx - fx) === 2) {
    if (tx > fx) {
      newBoard[fy][5] = newBoard[fy][7]
      newBoard[fy][7] = null
    } else {
      newBoard[fy][3] = newBoard[fy][0]
      newBoard[fy][0] = null
    }
  }
  
  if (type === 'p' && Math.abs(tx - fx) === 1 && targetWasEmpty) {
    newBoard[fy][tx] = null
  }
  
  return newBoard
}

const isLegalMove = (board, fx, fy, tx, ty, turn, castling = initialCastling, enPassantTarget = null) => {
  if (!inBounds(fx, fy) || !inBounds(tx, ty)) return false
  const from = board[fy]?.[fx]
  const to = board[ty]?.[tx]
  if (!from) return false
  if (pieceColor(from) !== turn) return false
  if (to && pieceColor(to) === turn) return false

  const dx = tx - fx
  const dy = ty - fy
  const adx = Math.abs(dx)
  const ady = Math.abs(dy)
  const type = pieceType(from)

  if (type === 'p') {
    const dir = turn === WHITE ? -1 : 1
    const startRow = turn === WHITE ? 6 : 1
    if (dx === 0 && !to) {
      if (dy === dir && inBounds(tx, ty)) return true
      if (fy === startRow && dy === 2 * dir && !board[fy + dir]?.[fx] && !to) return true
    }
    if (Math.abs(dx) === 1 && dy === dir && to) return true
    if (Math.abs(dx) === 1 && dy === dir && !to && enPassantTarget && tx === enPassantTarget.x && fy === enPassantTarget.y) return true
    return false
  }
  if (type === 'n') return (adx === 1 && ady === 2) || (adx === 2 && ady === 1)
  if (type === 'b') return adx === ady && pathClear(board, fx, fy, tx, ty)
  if (type === 'r') return (dx === 0 || dy === 0) && pathClear(board, fx, fy, tx, ty)
  if (type === 'q') return (dx === 0 || dy === 0 || adx === ady) && pathClear(board, fx, fy, tx, ty)
  if (type === 'k') {
    if (adx <= 1 && ady <= 1) return true
    if (!isInCheck(board, turn)) {
      if (dx === 2 && dy === 0) return canCastle(board, turn, 'kingside', castling, false)
      if (dx === -2 && dy === 0) return canCastle(board, turn, 'queenside', castling, false)
    }
    return false
  }
  return false
}

const findKing = (board, color) => {
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      if (board[y]?.[x] === `${color}k`) return { x, y }
    }
  }
  return null
}

const isInCheck = (board, color) => {
  const king = findKing(board, color)
  if (!king) return false
  const opponent = color === WHITE ? BLACK : WHITE
  return isSquareAttacked(board, king.x, king.y, opponent)
}

const wouldBeInCheck = (board, fx, fy, tx, ty, color) => {
  const testBoard = makeMove(board, fx, fy, tx, ty)
  return isInCheck(testBoard, color)
}

const getLegalMoves = (board, fx, fy, turn, castling = initialCastling, enPassantTarget = null) => {
  const moves = []
  const piece = board[fy]?.[fx]
  if (!piece || pieceColor(piece) !== turn) return moves
  const inCheck = isInCheck(board, turn)

  for (let ty = 0; ty < 8; ty++) {
    for (let tx = 0; tx < 8; tx++) {
      if (isLegalMove(board, fx, fy, tx, ty, turn, castling, enPassantTarget) && !wouldBeInCheck(board, fx, fy, tx, ty, turn)) {
        moves.push({ x: tx, y: ty })
      }
    }
  }
  return moves
}

const hasAnyLegalMove = (board, turn, castling = initialCastling, enPassantTarget = null) => {
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const piece = board[y]?.[x]
      if (piece && pieceColor(piece) === turn) {
        if (getLegalMoves(board, x, y, turn, castling, enPassantTarget).length > 0) return true
      }
    }
  }
  return false
}

const buildEventId = (evt) => {
  const payload = evt?.payload || {}
  if (payload?.actionId) return String(payload.actionId)
  return `${evt?.eventType || 'evt'}:${evt?.ts || Date.now()}:${payload?.playerId || 'unknown'}:${payload?.from?.x ?? ''}:${payload?.to?.x ?? ''}`
}

const rememberEvent = (setRef, eventId) => {
  if (!eventId) return false
  if (setRef.current.has(eventId)) return false
  setRef.current.add(eventId)
  if (setRef.current.size > 400) {
    const first = setRef.current.values().next().value
    setRef.current.delete(first)
  }
  return true
}

const getCapturedSquare = (board, movingPiece, from, to) => {
  const targetPiece = board[to.y]?.[to.x] || null
  if (targetPiece) return { x: to.x, y: to.y, piece: targetPiece }
  if (pieceType(movingPiece) === 'p' && Math.abs(to.x - from.x) === 1) {
    const epPiece = board[from.y]?.[to.x] || null
    if (epPiece) return { x: to.x, y: from.y, piece: epPiece }
  }
  return null
}

const buildMoveFx = (board, movingPiece, from, to, promotion, status, winner) => {
  const captured = getCapturedSquare(board, movingPiece, from, to)
  const moveType = promotion
    ? 'promotion'
    : pieceType(movingPiece) === 'k' && Math.abs(to.x - from.x) === 2
      ? 'castle'
      : captured
        ? 'capture'
        : 'move'

  const displayPiece = promotion ? `${pieceColor(movingPiece)}${promotion}` : movingPiece

  return {
    piece: displayPiece,
    from,
    to,
    moveType,
    captured,
    status,
    winner: winner === WHITE || winner === BLACK ? winner : null
  }
}

const ChessArenaActivity = ({ sdk, currentUser }) => {
  const [gameState, setGameState] = useState(baseState)
  const [myColor, setMyColor] = useState(null)
  const [legalMoves, setLegalMoves] = useState([])
  const [pendingPromotion, setPendingPromotion] = useState(null)
  const [lastMove, setLastMove] = useState(null)
  const [moveFx, setMoveFx] = useState(null)
  const [capturedPieces, setCapturedPieces] = useState({ white: [], black: [] })

  const seenEventsRef = useRef(new Set())
  const moveFxTimeoutRef = useRef(null)

  const triggerMoveFx = useCallback((fx) => {
    if (!fx?.from || !fx?.to || !fx?.piece) return
    setLastMove({ from: fx.from, to: fx.to, moveType: fx.moveType })
    setMoveFx(fx)
    if (moveFxTimeoutRef.current) clearTimeout(moveFxTimeoutRef.current)
    moveFxTimeoutRef.current = setTimeout(() => {
      setMoveFx(null)
    }, 560)
    
    if (fx.captured) {
      const capturedColor = pieceColor(fx.captured.piece)
      if (!isValidColor(capturedColor)) return
      setCapturedPieces(prev => ({
        ...prev,
        [capturedColor === WHITE ? 'white' : 'black']:
          [...capturedPiecesForColor(prev, capturedColor), fx.captured.piece]
      }))
    }
  }, [])

  useEffect(() => {
    if (!sdk) return

    const offState = sdk.subscribeServerState((st) => {
      const chess = st?.chess
      if (!chess || typeof chess !== 'object') return

      setGameState((prev) => {
        const board = sanitizeBoard(chess.board) || prev.board
        const turn = isValidColor(chess.turn) ? chess.turn : prev.turn
        const whitePlayer = sanitizePlayer(chess.whitePlayer) || prev.whitePlayer
        const blackPlayer = sanitizePlayer(chess.blackPlayer) || prev.blackPlayer
        const winner = chess.winner === WHITE || chess.winner === BLACK ? chess.winner : prev.winner

        return {
          ...prev,
          ...chess,
          board,
          turn,
          whitePlayer,
          blackPlayer,
          winner,
          status: deriveStatus(chess.status, whitePlayer, blackPlayer, winner),
          moveLog: Array.isArray(chess.moveLog) ? chess.moveLog.slice(0, 20).map((m) => String(m)) : prev.moveLog,
          moveCount: Number.isInteger(chess.moveCount) && chess.moveCount >= 0 ? chess.moveCount : prev.moveCount
        }
      })

      if (chess.whitePlayer?.id === currentUser?.id) setMyColor(WHITE)
      else if (chess.blackPlayer?.id === currentUser?.id) setMyColor(BLACK)
      else setMyColor(null)

      setLegalMoves([])
    })

    const offEvent = sdk.on('event', (evt) => {
      if (!evt?.eventType) return
      const eventId = buildEventId(evt)
      if (!rememberEvent(seenEventsRef, eventId)) return

      const payload = evt.payload || {}

      if (evt.eventType === 'chess:move') {
        const from = payload.from
        const to = payload.to
        const promotion = payload.promotion
        if (!from || !to || !inBounds(from.x, from.y) || !inBounds(to.x, to.y)) return

        setGameState((prev) => {
          const movingPiece = prev.board[from.y]?.[from.x]
          if (!movingPiece) return prev
          
          const testBoard = promotion 
            ? makeMove(prev.board, from.x, from.y, to.x, to.y, promotion)
            : makeMove(prev.board, from.x, from.y, to.x, to.y)
            
          if (!isLegalMove(prev.board, from.x, from.y, to.x, to.y, prev.turn, prev.castling, prev.enPassant)) return prev
          if (wouldBeInCheck(prev.board, from.x, from.y, to.x, to.y, prev.turn)) return prev

          const nextBoard = promotion 
            ? makeMove(prev.board, from.x, from.y, to.x, to.y, promotion)
            : makeMove(prev.board, from.x, from.y, to.x, to.y)
          const nextTurn = prev.turn === WHITE ? BLACK : WHITE
          
          let moveNotation = toAlgebraic(movingPiece, from, to, getCapturedSquare(prev.board, movingPiece, from, to), promotion, prev.moveLog)

          let newCastling = { ...prev.castling }
          if (pieceType(movingPiece) === 'k') {
            if (prev.turn === WHITE) {
              newCastling.whiteKingside = false
              newCastling.whiteQueenside = false
            } else {
              newCastling.blackKingside = false
              newCastling.blackQueenside = false
            }
          }
          if (pieceType(movingPiece) === 'r') {
            if (prev.turn === WHITE) {
              if (from.x === 0 && from.y === 7) newCastling.whiteQueenside = false
              if (from.x === 7 && from.y === 7) newCastling.whiteKingside = false
            } else {
              if (from.x === 0 && from.y === 0) newCastling.blackQueenside = false
              if (from.x === 7 && from.y === 0) newCastling.blackKingside = false
            }
          }

          let newEnPassant = null
          if (pieceType(movingPiece) === 'p' && Math.abs(to.y - from.y) === 2) {
            newEnPassant = { x: to.x, y: (from.y + to.y) / 2 }
          }

          let status = 'playing'
          let winner = null
          const opponentInCheck = isInCheck(nextBoard, nextTurn)
          const opponentHasMoves = hasAnyLegalMove(nextBoard, nextTurn, newCastling, newEnPassant)
          let inCheckPos = null
          
          if (opponentInCheck) {
            inCheckPos = findKing(nextBoard, nextTurn)
          }

          if (opponentInCheck && !opponentHasMoves) {
            status = 'checkmate'
            winner = prev.turn
          } else if (!opponentHasMoves) {
            status = 'stalemate'
          } else if (opponentInCheck) {
            status = 'check'
          }

          triggerMoveFx(buildMoveFx(prev.board, movingPiece, from, to, promotion, status, winner))

          return {
            ...prev,
            board: nextBoard,
            turn: nextTurn,
            selected: null,
            moveLog: [moveNotation, ...prev.moveLog].slice(0, 20),
            status,
            winner,
            inCheck: inCheckPos,
            castling: newCastling,
            enPassant: newEnPassant,
            moveCount: prev.moveCount + 1
          }
        })

        setLegalMoves([])
        return
      }

      if (evt.eventType === 'chess:join') {
        const color = payload.color
        if (!isValidColor(color) || !payload.playerId) return

        const player = { id: String(payload.playerId), username: String(payload.username || 'Player') }
        setGameState((prev) => {
          const key = color === WHITE ? 'whitePlayer' : 'blackPlayer'
          const otherKey = color === WHITE ? 'blackPlayer' : 'whitePlayer'
          const current = prev[key]
          if (current && current.id !== player.id) return prev
          
          const otherPlayer = prev[otherKey]
          const hasBothPlayers = (color === WHITE ? player : prev.whitePlayer) && (color === BLACK ? player : prev.blackPlayer)
          
          let newTurn = prev.turn
          if (hasBothPlayers && prev.status === 'waiting') {
            newTurn = WHITE
          }
          
          return { 
            ...prev, 
            [key]: player, 
            turn: newTurn,
            status: hasBothPlayers ? 'playing' : 'waiting' 
          }
        })

        if (player.id === currentUser?.id) setMyColor(color)
        return
      }

      if (evt.eventType === 'chess:leave') {
        const color = payload.color
        if (!isValidColor(color) || !payload.playerId) return
        const playerId = String(payload.playerId)

        setGameState((prev) => {
          const key = color === WHITE ? 'whitePlayer' : 'blackPlayer'
          const current = prev[key]
          if (!current || current.id !== playerId) return prev
          const nextWhite = color === WHITE ? null : prev.whitePlayer
          const nextBlack = color === BLACK ? null : prev.blackPlayer
          return {
            ...prev,
            [key]: null,
            status: deriveStatus('waiting', nextWhite, nextBlack, null),
            winner: null
          }
        })

        setGameState((prev) => {
          if (playerId !== currentUser?.id) return prev
          return {
            ...prev,
            selected: null
          }
        })

        if (playerId === currentUser?.id) setMyColor(null)
        return
      }

      if (evt.eventType === 'chess:reset') {
        setGameState((prev) => ({
          ...baseState,
          whitePlayer: prev.whitePlayer,
          blackPlayer: prev.blackPlayer,
          status: prev.whitePlayer && prev.blackPlayer ? 'playing' : 'waiting'
        }))
        setLastMove(null)
        setMoveFx(null)
        setLegalMoves([])
        setCapturedPieces({ white: [], black: [] })
        return
      }

      if (evt.eventType === 'chess:gameover') {
        const winner = payload.winner
        const reason = payload.reason
        if (reason !== 'checkmate' && reason !== 'stalemate') return
        setGameState((prev) => ({
          ...prev,
          status: reason,
          winner: winner === WHITE || winner === BLACK ? winner : null
        }))
      }
    })

    return () => {
      offState?.()
      offEvent?.()
      if (moveFxTimeoutRef.current) clearTimeout(moveFxTimeoutRef.current)
    }
  }, [sdk, currentUser?.id, currentUser?.username, triggerMoveFx])

  const handleCellClick = useCallback((x, y) => {
    if (!inBounds(x, y)) return

    const piece = gameState.board[y][x]
    if (piece && pieceColor(piece) === gameState.turn && pieceColor(piece) === myColor) {
      const moves = getLegalMoves(gameState.board, x, y, gameState.turn, gameState.castling, gameState.enPassant)
      setGameState((prev) => ({ ...prev, selected: { x, y } }))
      setLegalMoves(moves)
      return
    }

    if (gameState.selected && legalMoves.some((m) => m.x === x && m.y === y)) {
      const from = gameState.selected
      const movingPiece = gameState.board[from.y][from.x]
      if (!movingPiece) {
        setGameState((prev) => ({ ...prev, selected: null }))
        setLegalMoves([])
        return
      }

      if (!isLegalMove(gameState.board, from.x, from.y, x, y, gameState.turn, gameState.castling, gameState.enPassant)) {
        setGameState((prev) => ({ ...prev, selected: null }))
        setLegalMoves([])
        return
      }

      if (wouldBeInCheck(gameState.board, from.x, from.y, x, y, gameState.turn)) {
        setGameState((prev) => ({ ...prev, selected: null }))
        setLegalMoves([])
        return
      }

      const isPromotion = pieceType(movingPiece) === 'p' && (y === 0 || y === 7)
      
      if (isPromotion) {
        setPendingPromotion({ from: { x: from.x, y: from.y }, to: { x, y }, piece: movingPiece })
        setGameState((prev) => ({ ...prev, selected: null }))
        setLegalMoves([])
        return
      }

      const nextBoard = makeMove(gameState.board, from.x, from.y, x, y)
      const nextTurn = gameState.turn === WHITE ? BLACK : WHITE
      const moveNotation = toAlgebraic(movingPiece, from, { x, y }, getCapturedSquare(gameState.board, movingPiece, from, { x, y }), null, gameState.moveLog)

      let newCastling = { ...gameState.castling }
      if (pieceType(movingPiece) === 'k') {
        if (gameState.turn === WHITE) {
          newCastling.whiteKingside = false
          newCastling.whiteQueenside = false
        } else {
          newCastling.blackKingside = false
          newCastling.blackQueenside = false
        }
      }
      if (pieceType(movingPiece) === 'r') {
        if (from.x === 0 && from.y === (gameState.turn === WHITE ? 7 : 0)) {
          if (gameState.turn === WHITE) newCastling.whiteQueenside = false
          else newCastling.blackQueenside = false
        }
        if (from.x === 7 && from.y === (gameState.turn === WHITE ? 7 : 0)) {
          if (gameState.turn === WHITE) newCastling.whiteKingside = false
          else newCastling.blackKingside = false
        }
      }

      let newEnPassant = null
      if (pieceType(movingPiece) === 'p' && Math.abs(y - from.y) === 2) {
        newEnPassant = { x: x, y: (from.y + y) / 2 }
      }

      let status = 'playing'
      let winner = null
      const opponentInCheck = isInCheck(nextBoard, nextTurn)
      const opponentHasMoves = hasAnyLegalMove(nextBoard, nextTurn, newCastling, newEnPassant)
      let inCheckPos = null
      
      if (opponentInCheck) {
        inCheckPos = findKing(nextBoard, nextTurn)
      }

      if (opponentInCheck && !opponentHasMoves) {
        status = 'checkmate'
        winner = gameState.turn
      } else if (!opponentHasMoves) {
        status = 'stalemate'
      } else if (opponentInCheck) {
        status = 'check'
      }

      const actionId = `chess_move_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      rememberEvent(seenEventsRef, actionId)
      triggerMoveFx(buildMoveFx(gameState.board, movingPiece, from, { x, y }, null, status, winner))

      setGameState((prev) => ({
        ...prev,
        board: nextBoard,
        turn: nextTurn,
        selected: null,
        moveLog: [moveNotation, ...prev.moveLog].slice(0, 20),
        status,
        winner,
        inCheck: inCheckPos,
        castling: newCastling,
        enPassant: newEnPassant,
        moveCount: prev.moveCount + 1
      }))
      setLegalMoves([])

      sdk.emitEvent('chess:move', {
        from,
        to: { x, y },
        piece: movingPiece,
        playerId: currentUser?.id,
        actionId
      }, { serverRelay: true, cue: 'score_update' })

      if (status === 'checkmate') {
        sdk.emitEvent('chess:gameover', {
          winner: gameState.turn,
          reason: 'checkmate',
          actionId: `${actionId}:gameover`
        }, { serverRelay: true, cue: 'round_end' })
      } else if (status === 'stalemate') {
        sdk.emitEvent('chess:gameover', {
          winner: null,
          reason: 'stalemate',
          actionId: `${actionId}:gameover`
        }, { serverRelay: true })
      }

      return
    }

    setGameState((prev) => ({ ...prev, selected: null }))
    setLegalMoves([])
  }, [gameState, legalMoves, myColor, sdk, currentUser?.id, triggerMoveFx])

  const handlePromotion = useCallback((promotion) => {
    if (!pendingPromotion || !promotion) return
    
    const { from, to, piece } = pendingPromotion
    const color = pieceColor(piece)
    const promotedPiece = `${color}${promotion}`
    
    const newBoard = gameState.board.map((row) => [...row])
    newBoard[to.y][to.x] = promotedPiece
    newBoard[from.y][from.x] = null
    
    if (pieceType(piece) === 'p' && Math.abs(to.x - from.x) === 1 && !newBoard[to.y][to.x]) {
      const captureRow = from.y
      newBoard[captureRow][to.x] = null
    }
    
    if (pieceType(piece) === 'k' && Math.abs(to.x - from.x) === 2) {
      const row = from.y
      if (to.x > from.x) {
        newBoard[row][5] = newBoard[row][7]
        newBoard[row][7] = null
      } else {
        newBoard[row][3] = newBoard[row][0]
        newBoard[row][0] = null
      }
    }
    
    const nextTurn = color === WHITE ? BLACK : WHITE
    const moveNotation = toAlgebraic(piece, from, to, null, promotion, gameState.moveLog)
    
    let newCastling = { ...gameState.castling }
    if (pieceType(piece) === 'k') {
      if (color === WHITE) {
        newCastling.whiteKingside = false
        newCastling.whiteQueenside = false
      } else {
        newCastling.blackKingside = false
        newCastling.blackQueenside = false
      }
    }
    
    let newEnPassant = null
    
    let status = 'playing'
    let winner = null
    const opponentInCheck = isInCheck(newBoard, nextTurn)
    const opponentHasMoves = hasAnyLegalMove(newBoard, nextTurn, newCastling, newEnPassant)
    let inCheckPos = null
    
    if (opponentInCheck) {
      inCheckPos = findKing(newBoard, nextTurn)
    }
    
    if (opponentInCheck && !opponentHasMoves) {
      status = 'checkmate'
      winner = color
    } else if (!opponentHasMoves) {
      status = 'stalemate'
    } else if (opponentInCheck) {
      status = 'check'
    }
    
    const actionId = `chess_promote_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    rememberEvent(seenEventsRef, actionId)
    triggerMoveFx(buildMoveFx(gameState.board, piece, from, to, promotion, status, winner))
    
    setGameState((prev) => ({
      ...prev,
      board: newBoard,
      turn: nextTurn,
      selected: null,
      moveLog: [moveNotation, ...prev.moveLog].slice(0, 20),
      status,
      winner,
      inCheck: inCheckPos,
      castling: newCastling,
      enPassant: newEnPassant,
      promotion: null,
      moveCount: prev.moveCount + 1
    }))
    setLegalMoves([])
    setPendingPromotion(null)
    
    sdk.emitEvent('chess:move', {
      from,
      to,
      piece: piece,
      promotion: promotion,
      playerId: currentUser?.id,
      actionId
    }, { serverRelay: true, cue: 'score_update' })
    
    if (status === 'checkmate') {
      sdk.emitEvent('chess:gameover', {
        winner: color,
        reason: 'checkmate',
        actionId: `${actionId}:gameover`
      }, { serverRelay: true, cue: 'round_end' })
    }
  }, [pendingPromotion, gameState, sdk, currentUser?.id, triggerMoveFx])

  if (!sdk) {
    return <div className="builtin-activity-loading"><div className="loading-spinner" /><p>Loading chess...</p></div>
  }

  const joinGame = (color) => {
    if (!isValidColor(color) || !currentUser?.id) return
    if (color === WHITE && gameState.whitePlayer && gameState.whitePlayer.id !== currentUser.id) return
    if (color === BLACK && gameState.blackPlayer && gameState.blackPlayer.id !== currentUser.id) return

    const actionId = `chess_join_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    rememberEvent(seenEventsRef, actionId)

    const player = {
      id: String(currentUser.id),
      username: String(currentUser.username || 'Player')
    }

    setGameState((prev) => {
      const nextWhite = color === WHITE ? player : prev.whitePlayer
      const nextBlack = color === BLACK ? player : prev.blackPlayer
      return {
        ...prev,
        whitePlayer: nextWhite,
        blackPlayer: nextBlack,
        status: deriveStatus(prev.status, nextWhite, nextBlack, prev.winner),
        selected: null
      }
    })

    sdk.emitEvent('chess:join', {
      playerId: currentUser.id,
      username: currentUser.username || 'Player',
      color,
      actionId
    }, { serverRelay: true, cue: 'player_join' })

    setMyColor(color)
  }

  const leaveGame = () => {
    if (!myColor || !currentUser?.id) return

    const actionId = `chess_leave_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    rememberEvent(seenEventsRef, actionId)

    setGameState((prev) => {
      const nextWhite = myColor === WHITE ? null : prev.whitePlayer
      const nextBlack = myColor === BLACK ? null : prev.blackPlayer
      return {
        ...prev,
        whitePlayer: nextWhite,
        blackPlayer: nextBlack,
        status: deriveStatus('waiting', nextWhite, nextBlack, null),
        selected: null,
        winner: null,
        inCheck: null
      }
    })

    sdk.emitEvent('chess:leave', {
      playerId: currentUser.id,
      color: myColor,
      actionId
    }, { serverRelay: true, cue: 'player_leave' })

    setMyColor(null)
  }

  const resetGame = () => {
    const actionId = `chess_reset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    rememberEvent(seenEventsRef, actionId)

    sdk.emitEvent('chess:reset', { actionId }, { serverRelay: true, cue: 'round_start' })

    setGameState((prev) => ({
      ...baseState,
      whitePlayer: prev.whitePlayer,
      blackPlayer: prev.blackPlayer,
      status: prev.whitePlayer && prev.blackPlayer ? 'playing' : 'waiting'
    }))
    setLastMove(null)
    setMoveFx(null)
    setLegalMoves([])
    setPendingPromotion(null)
    setCapturedPieces({ white: [], black: [] })
  }

  const isMyTurn = myColor === gameState.turn
  const canJoinWhite = (!gameState.whitePlayer || gameState.whitePlayer.id === currentUser?.id) && myColor !== BLACK
  const canJoinBlack = (!gameState.blackPlayer || gameState.blackPlayer.id === currentUser?.id) && myColor !== WHITE
  const isPlaying = myColor === WHITE || myColor === BLACK

  return (
    <div className="builtin-activity-body chess-arena">
      <div className="chess-players-bar">
        <div className={`player-slot ${gameState.turn === WHITE ? 'active-turn' : ''} ${myColor === WHITE ? 'is-me' : ''}`}>
          <div className="player-color white"><PieceSVG type="k" color="w" size={28} /></div>
          <div className="player-info">
            <span className="player-name">{gameState.whitePlayer?.username || 'Waiting...'}</span>
            <span className={`player-status ${gameState.turn === WHITE && gameState.status === 'check' ? 'in-check' : ''}`}>
              {gameState.whitePlayer 
                ? (gameState.turn === WHITE 
                  ? (gameState.status === 'check' || gameState.status === 'checkmate' ? <span className="chess-check-warning"><ExclamationTriangleIcon width={14} height={14} /> CHECK!</span> : 'Your Turn') 
                  : (gameState.status === 'check' || gameState.status === 'checkmate' ? 'In Danger!' : 'Waiting'))
                : 'Open'}
            </span>
          </div>
          {canJoinWhite && <button className="join-btn" onClick={() => joinGame(WHITE)}>Join</button>}
          {myColor === WHITE && <button className="leave-btn" onClick={leaveGame}>Leave</button>}
        </div>

        <div className="game-status">
          {gameState.status === 'waiting' && <span>Waiting for players...</span>}
          {gameState.status === 'playing' && <span className="status-playing">Game in progress</span>}
          {gameState.status === 'check' && (
            <span className="check-warning">
              <ExclamationTriangleIcon width={16} height={16} />
              CHECK!
            </span>
          )}
          {gameState.status === 'checkmate' && (
            <span className="game-over checkmate">
              <PieceSVG type="q" color={gameState.winner || 'w'} size={18} /> CHECKMATE! {gameState.winner === WHITE ? 'White' : 'Black'} wins!
            </span>
          )}
          {gameState.status === 'stalemate' && <span className="game-over stalemate">Stalemate! Draw!</span>}
        </div>

        <div className={`player-slot ${gameState.turn === BLACK ? 'active-turn' : ''} ${myColor === BLACK ? 'is-me' : ''}`}>
          <div className="player-color black"><PieceSVG type="k" color="b" size={28} /></div>
          <div className="player-info">
            <span className="player-name">{gameState.blackPlayer?.username || 'Waiting...'}</span>
            <span className={`player-status ${gameState.turn === BLACK && gameState.status === 'check' ? 'in-check' : ''}`}>
              {gameState.blackPlayer 
                ? (gameState.turn === BLACK 
                  ? (gameState.status === 'check' || gameState.status === 'checkmate' ? <span className="chess-check-warning"><ExclamationTriangleIcon width={14} height={14} /> CHECK!</span> : 'Your Turn') 
                  : (gameState.status === 'check' || gameState.status === 'checkmate' ? 'In Danger!' : 'Waiting'))
                : 'Open'}
            </span>
          </div>
          {canJoinBlack && <button className="join-btn" onClick={() => joinGame(BLACK)}>Join</button>}
          {myColor === BLACK && <button className="leave-btn" onClick={leaveGame}>Leave</button>}
        </div>
      </div>

        <div className="chess-game-area">
        <div className="chess-board-container">
          <div className={`chess-board-wrapper ${myColor === BLACK ? 'black-perspective' : 'white-perspective'} ${moveFx ? `fx-${moveFx.moveType}` : ''}`}>
            <div className="chess-board">
              {gameState.board.flatMap((row, y) => row.map((cell, x) => {
                const dark = (x + y) % 2 === 1
                const selected = gameState.selected?.x === x && gameState.selected?.y === y
                const isLegal = legalMoves.some((m) => m.x === x && m.y === y)
                const isMine = cell && pieceColor(cell) === myColor
                const isInCheck = gameState.inCheck?.x === x && gameState.inCheck?.y === y && gameState.status !== 'checkmate'
                const isLastMoveFrom = lastMove?.from?.x === x && lastMove?.from?.y === y
                const isLastMoveTo = lastMove?.to?.x === x && lastMove?.to?.y === y
                const hasCapture = isLegal && Boolean(cell)

                return (
                  <button
                    key={`${x}_${y}`}
                    className={`chess-cell ${dark ? 'black' : 'white'} ${selected ? 'selected' : ''} ${isLegal ? 'valid-move' : ''} ${hasCapture ? 'has-capture' : ''} ${isMine ? 'my-piece' : ''} ${isInCheck ? 'in-check' : ''} ${isLastMoveFrom || isLastMoveTo ? 'last-move' : ''} ${isLastMoveTo ? 'last-move-target' : ''}`}
                    onClick={() => handleCellClick(x, y)}
                  >
                    {cell && <PieceSVG type={PIECE_TYPES[cell]} color={pieceColor(cell)} />}
                    {isLegal && !cell && <span className="move-indicator" />}
                    {isLegal && cell && <span className="capture-indicator" />}
                  </button>
                )
              }))}
            </div>
            {moveFx && (
              <div className="chess-board-effects" aria-hidden="true">
                <div
                  className={`chess-animated-piece move-type-${moveFx.moveType}`}
                  style={{
                    left: `${moveFx.from.x * 12.5}%`,
                    top: `${moveFx.from.y * 12.5}%`,
                    '--delta-x': moveFx.to.x - moveFx.from.x,
                    '--delta-y': moveFx.to.y - moveFx.from.y
                  }}
                >
                  <PieceSVG type={PIECE_TYPES[moveFx.piece]} color={pieceColor(moveFx.piece)} size={48} />
                </div>
                {moveFx.captured && (
                  <div
                    className="chess-capture-burst"
                    style={{
                      left: `${moveFx.captured.x * 12.5}%`,
                      top: `${moveFx.captured.y * 12.5}%`
                    }}
                  />
                )}
                {(moveFx.moveType === 'castle' || moveFx.moveType === 'promotion') && (
                  <div
                    className={`chess-special-flare ${moveFx.moveType}`}
                    style={{
                      left: `${moveFx.to.x * 12.5}%`,
                      top: `${moveFx.to.y * 12.5}%`
                    }}
                  />
                )}
              </div>
            )}
          </div>

          <div className={`board-coordinates files ${myColor === BLACK ? 'reversed' : ''}`}>
            {myColor === BLACK
              ? ['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a'].map((f) => <span key={f}>{f}</span>)
              : ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((f) => <span key={f}>{f}</span>)
            }
          </div>
          <div className={`board-coordinates ranks ${myColor === BLACK ? 'reversed' : ''}`}>
            {['8', '7', '6', '5', '4', '3', '2', '1'].map((r) => <span key={r}>{r}</span>)}
          </div>
        </div>

        {pendingPromotion && (
          <div className="promotion-dialog">
            <div className="promotion-overlay" />
            <div className="promotion-content">
              <h4>Promote your pawn!</h4>
              <div className="promotion-options">
                {['q', 'r', 'b', 'n'].map((p) => {
                  const color = pieceColor(pendingPromotion.piece)
                  const pieceCode = `${color}${p}`
                  return (
                    <button
                      key={p}
                      className="promotion-piece"
                      onClick={() => handlePromotion(p)}
                    >
                      <PieceSVG type={p} color={pieceColor(pendingPromotion.piece)} size={50} />
                      <span className="promotion-label">
                        {p === 'q' ? 'Queen' : p === 'r' ? 'Rook' : p === 'b' ? 'Bishop' : 'Knight'}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        <div className="chess-side-panel">
          <div className="chess-panel-section captured-pieces">
            <h4>Captured</h4>
            <div className="captured-row">
              <div className="captured-by-white">
                {capturedPieces.black.map((piece, i) => (
                  <span key={i} className="captured-piece white"><PieceSVG type={PIECE_TYPES[piece]} color="w" size={20} /></span>
                ))}
              </div>
            </div>
            <div className="captured-row">
              <div className="captured-by-black">
                {capturedPieces.white.map((piece, i) => (
                  <span key={i} className="captured-piece black"><PieceSVG type={PIECE_TYPES[piece]} color="b" size={20} /></span>
                ))}
              </div>
            </div>
          </div>

          <div className="chess-panel-section">
            <h4>Moves</h4>
            <div className="move-log">
              {gameState.moveLog.length === 0 ? (
                <p className="empty-log">No moves yet</p>
              ) : (
                (() => {
                  const moves = [...gameState.moveLog].reverse()
                  const rows = []
                  for (let i = 0; i < moves.length; i += 2) {
                    rows.push(
                      <div key={i} className="move-entry">
                        <span className="move-number">{Math.floor(i / 2) + 1}.</span>
                        <span className="move-text white-move">{moves[i]}</span>
                        {moves[i + 1] && <span className="move-text black-move">{moves[i + 1]}</span>}
                      </div>
                    )
                  }
                  return rows
                })()
              )}
            </div>
          </div>

          <div className="chess-panel-section">
            <h4>Controls</h4>
            <div className="game-controls">
              <button onClick={resetGame} className="reset-btn">New Game</button>
              {isPlaying && (
                <div className={`turn-indicator ${isMyTurn ? 'my-turn' : 'opp-turn'}`}>
                  <div className="turn-indicator-piece">
                    <PieceSVG type={gameState.turn === WHITE ? 'k' : 'k'} color={gameState.turn} size={24} />
                  </div>
                  {isMyTurn ? <span className="your-turn">Your Turn!</span> : <span className="waiting">Opponent's Turn</span>}
                </div>
              )}
            </div>
          </div>

          <div className="chess-panel-section legend">
            <h4>Legend</h4>
            <div className="legend-item"><span className="legend-dot selected" /> Selected piece</div>
            <div className="legend-item"><span className="legend-dot legal" /> Legal move</div>
            <div className="legend-item"><span className="legend-dot capture" /> Capture available</div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ChessArenaActivity
