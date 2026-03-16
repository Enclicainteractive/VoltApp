import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { TrophyIcon } from '@heroicons/react/24/outline'

const styles = `
  @keyframes dropIn {
    0% { transform: translateY(-500px); opacity: 0; }
    60% { transform: translateY(10px); opacity: 1; }
    80% { transform: translateY(-5px); }
    100% { transform: translateY(0); }
  }
  @keyframes bounceIn {
    0% { transform: scale(0.3); opacity: 0; }
    50% { transform: scale(1.1); }
    70% { transform: scale(0.9); }
    100% { transform: scale(1); opacity: 1; }
  }
  @keyframes glowPulse {
    0%, 100% { box-shadow: 0 0 20px currentColor, inset 0 -3px 6px rgba(0,0,0,0.3); }
    50% { box-shadow: 0 0 40px currentColor, 0 0 60px currentColor, inset 0 -3px 6px rgba(0,0,0,0.3); }
  }
  @keyframes columnGlow {
    0%, 100% { background: rgba(255,255,255,0.1); }
    50% { background: rgba(255,255,255,0.2); }
  }
  @keyframes winLine {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.7; transform: scale(1.05); }
  }
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-10px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes slideIn {
    from { opacity: 0; transform: translateX(-20px); }
    to { opacity: 1; transform: translateX(0); }
  }
  .c4-activity {
    --c4-red: #dc2626;
    --c4-red-light: #fca5a5;
    --c4-red-dark: #991b1b;
    --c4-yellow: #eab308;
    --c4-yellow-light: #fde68a;
    --c4-yellow-dark: #a16207;
    --c4-board: #1e40af;
    --c4-board-light: #1d4ed8;
    --c4-slot: #0f172a;
    --c4-slot-shadow: #020617;
  }
  .c4-players-bar {
    display: flex;
    justify-content: space-between;
    align-items: stretch;
    gap: 20px;
    margin-bottom: 20px;
  }
  .c4-player-slot {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    background: linear-gradient(135deg, rgba(30,41,59,0.9), rgba(15,23,42,0.9));
    border-radius: 12px;
    border: 2px solid transparent;
    transition: all 0.3s ease;
  }
  .c4-player-slot.active-turn {
    border-color: currentColor;
    animation: columnGlow 1.5s ease-in-out infinite;
  }
  .c4-player-slot.active-turn:first-child {
    color: var(--c4-red);
  }
  .c4-player-slot.active-turn:last-child {
    color: var(--c4-yellow);
  }
  .c4-player-slot.is-me {
    background: linear-gradient(135deg, rgba(30,41,59,0.95), rgba(15,23,42,0.95));
  }
  .c4-player-slot.is-me:first-child {
    border-color: var(--c4-red);
    box-shadow: 0 0 20px rgba(220,38,38,0.3);
  }
  .c4-player-slot.is-me:last-child {
    border-color: var(--c4-yellow);
    box-shadow: 0 0 20px rgba(234,179,8,0.3);
  }
  .c4-piece-container {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .c4-piece {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    transition: transform 0.3s ease;
  }
  .c4-piece.red {
    background: radial-gradient(circle at 30% 30%, var(--c4-red-light), var(--c4-red), var(--c4-red-dark));
    box-shadow: inset 0 -3px 6px rgba(0,0,0,0.3), 0 2px 8px rgba(220,38,38,0.4);
  }
  .c4-piece.yellow {
    background: radial-gradient(circle at 30% 30%, var(--c4-yellow-light), var(--c4-yellow), var(--c4-yellow-dark));
    box-shadow: inset 0 -3px 6px rgba(0,0,0,0.3), 0 2px 8px rgba(234,179,8,0.4);
  }
  .c4-player-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    flex: 1;
  }
  .c4-player-name {
    font-weight: 600;
    font-size: 14px;
    color: #f1f5f9;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .c4-player-status {
    font-size: 12px;
    color: #94a3b8;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .c4-turn-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: inline-block;
    animation: bounceIn 0.5s ease;
  }
  .c4-red-dot {
    background: var(--c4-red);
    box-shadow: 0 0 8px var(--c4-red);
  }
  .c4-yellow-dot {
    background: var(--c4-yellow);
    box-shadow: 0 0 8px var(--c4-yellow);
  }
  .c4-status {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 8px 20px;
    background: linear-gradient(135deg, rgba(30,41,59,0.8), rgba(15,23,42,0.8));
    border-radius: 12px;
    min-width: 180px;
  }
  .c4-winner {
    display: flex;
    align-items: center;
    gap: 6px;
    animation: bounceIn 0.5s ease;
  }
  .c4-draw {
    display: flex;
    align-items: center;
    gap: 6px;
    animation: bounceIn 0.5s ease;
  }
  .c4-waiting, .c4-turn-indicator span {
    display: flex;
    align-items: center;
    gap: 6px;
    color: #94a3b8;
    font-size: 13px;
  }
  .my-turn-text {
    color: #22c55e !important;
    font-weight: 600;
    animation: pulse 1s ease-in-out infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
  }
  .c4-join-btn {
    padding: 8px 16px;
    border-radius: 8px;
    border: none;
    font-weight: 600;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s ease;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .c4-join-btn.red {
    background: linear-gradient(135deg, var(--c4-red), var(--c4-red-dark));
    color: white;
  }
  .c4-join-btn.yellow {
    background: linear-gradient(135deg, var(--c4-yellow), var(--c4-yellow-dark));
    color: #0f172a;
  }
  .c4-join-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  }
  .c4-join-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .c4-leave-btn {
    padding: 8px 12px;
    border-radius: 8px;
    border: 1px solid #475569;
    background: transparent;
    color: #94a3b8;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  .c4-leave-btn:hover {
    background: rgba(239,68,68,0.2);
    border-color: #ef4444;
    color: #ef4444;
  }
  .c4-game-board {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
  }
  .c4-board-wrapper {
    position: relative;
    padding: 12px;
    background: linear-gradient(180deg, var(--c4-board-light), var(--c4-board));
    border-radius: 16px;
    box-shadow: 
      0 10px 40px rgba(0,0,0,0.4),
      inset 0 2px 4px rgba(255,255,255,0.1),
      inset 0 -2px 4px rgba(0,0,0,0.2);
  }
  .c4-column-indicators {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 8px;
    margin-bottom: 8px;
  }
  .c4-indicator {
    width: 48px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  .c4-indicator.active:hover {
    transform: scale(1.1);
  }
  .c4-disc-preview {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    animation: dropIn 0.4s ease-out;
  }
  .c4-board {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 8px;
    padding: 8px;
    background: var(--c4-slot);
    border-radius: 8px;
    box-shadow: inset 0 4px 12px var(--c4-slot-shadow);
  }
  .c4-cell {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: transparent;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
    position: relative;
  }
  .c4-cell:hover {
    background: rgba(255,255,255,0.05);
  }
  .c4-disc {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    transition: all 0.3s ease;
  }
  .c4-disc-preview {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    animation: dropIn 0.4s ease-out;
    box-shadow: inset 0 -3px 6px rgba(0,0,0,0.3);
  }
  .c4-disc-preview.red {
    background: radial-gradient(circle at 30% 30%, var(--c4-red-light), var(--c4-red), var(--c4-red-dark));
  }
  .c4-disc-preview.yellow {
    background: radial-gradient(circle at 30% 30%, var(--c4-yellow-light), var(--c4-yellow), var(--c4-yellow-dark));
  }
  .c4-disc.red {
    background: radial-gradient(circle at 30% 30%, var(--c4-red-light), var(--c4-red), var(--c4-red-dark));
    box-shadow: inset 0 -3px 6px rgba(0,0,0,0.3), 0 2px 8px rgba(220,38,38,0.4);
  }
  .c4-disc.yellow {
    background: radial-gradient(circle at 30% 30%, var(--c4-yellow-light), var(--c4-yellow), var(--c4-yellow-dark));
    box-shadow: inset 0 -3px 6px rgba(0,0,0,0.3), 0 2px 8px rgba(234,179,8,0.4);
  }
  .c4-disc.dropping {
    animation: dropIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .c4-disc.preview {
    opacity: 0.5;
    animation: pulse 1s ease-in-out infinite;
  }
  .c4-disc.preview.red {
    background: radial-gradient(circle at 30% 30%, var(--c4-red-light), var(--c4-red), var(--c4-red-dark));
    box-shadow: inset 0 -3px 6px rgba(0,0,0,0.3);
  }
  .c4-disc.preview.yellow {
    background: radial-gradient(circle at 30% 30%, var(--c4-yellow-light), var(--c4-yellow), var(--c4-yellow-dark));
    box-shadow: inset 0 -3px 6px rgba(0,0,0,0.3);
  }
  .c4-cell.winning .c4-disc {
    animation: glowPulse 1s ease-in-out infinite;
  }
  .c4-cell.winning[data-color="red"] .c4-disc {
    box-shadow: 0 0 25px var(--c4-red), 0 0 50px rgba(220,38,38,0.5), inset 0 -3px 6px rgba(0,0,0,0.3);
  }
  .c4-cell.winning[data-color="yellow"] .c4-disc {
    box-shadow: 0 0 25px var(--c4-yellow), 0 0 50px rgba(234,179,8,0.5), inset 0 -3px 6px rgba(0,0,0,0.3);
  }
  .c4-cell.last-drop .c4-disc {
    animation: bounceIn 0.4s ease;
  }
  .c4-controls {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    width: 100%;
    max-width: 400px;
  }
  .c4-reset-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 24px;
    background: linear-gradient(135deg, #475569, #334155);
    color: #f1f5f9;
    border: none;
    border-radius: 10px;
    font-weight: 600;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  .c4-reset-btn:hover:not(:disabled) {
    background: linear-gradient(135deg, #64748b, #475569);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  }
  .c4-reset-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .c4-turn-indicator {
    text-align: center;
    font-size: 14px;
    color: #94a3b8;
  }
  .c4-move-counter {
    font-size: 12px;
    color: #64748b;
    padding: 4px 12px;
    background: rgba(30,41,59,0.5);
    border-radius: 20px;
  }
  .c4-join-toast {
    animation: slideIn 0.3s ease;
  }
  .c4-color-indicator {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    display: inline-block;
    margin-right: 6px;
    vertical-align: middle;
    box-shadow: 0 0 8px currentColor;
  }
  .c4-color-indicator.red {
    background: var(--c4-red);
    color: var(--c4-red);
  }
  .c4-color-indicator.yellow {
    background: var(--c4-yellow);
    color: var(--c4-yellow);
  }
`

const RefreshIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
    <path d="M21 3v5h-5"/>
    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
    <path d="M8 16H3v5"/>
  </svg>
)

const H = 6
const W = 7
const RED = 'red'
const YELLOW = 'yellow'

const makeBoard = () => Array.from({ length: H }, () => Array(W).fill(null))

const baseState = {
  board: makeBoard(),
  turn: RED,
  winner: null,
  isDraw: false,
  redPlayer: null,
  yellowPlayer: null,
  winningCells: null,
  status: 'waiting',
  moveCount: 0
}

const sanitizePlayer = (player) => {
  if (!player || typeof player !== 'object' || !player.id) return null
  return { id: String(player.id), username: String(player.username || 'Player'), avatar: player.avatar || null }
}

const sanitizeBoard = (board) => {
  if (!Array.isArray(board) || board.length !== H) return makeBoard()
  const safe = board.map((row) => {
    if (!Array.isArray(row) || row.length !== W) return Array(W).fill(null)
    return row.map((cell) => (cell === RED || cell === YELLOW ? cell : null))
  })
  return safe.some((row) => !row) ? makeBoard() : safe
}

const getWin = (board) => {
  const directions = [
    [[0, 1], [0, 2], [0, 3]],   // Horizontal
    [[1, 0], [2, 0], [3, 0]],   // Vertical
    [[1, 1], [2, 2], [3, 3]],   // Diagonal down-right
    [[1, -1], [2, -2], [3, -3]] // Diagonal up-right
  ]
  
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const piece = board[y]?.[x]
      if (!piece) continue
      
      for (const direction of directions) {
        const cells = [[x, y]]
        let valid = true
        
        for (const [dx, dy] of direction) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || nx >= W || ny < 0 || ny >= H || board[ny]?.[nx] !== piece) {
            valid = false
            break
          }
          cells.push([nx, ny])
        }
        
        if (valid) {
          return { winner: piece, cells }
        }
      }
    }
  }
  return null
}

const dropPiece = (board, col, piece) => {
  if (col < 0 || col >= W) return null
  const next = board.map((row) => [...row])
  for (let y = H - 1; y >= 0; y--) {
    if (!next[y][col]) {
      next[y][col] = piece
      return { board: next, row: y }
    }
  }
  return null
}

const canDropInColumn = (board, col) => {
  if (col < 0 || col >= W) return false
  return board[0]?.[col] == null
}

const buildEventId = (evt) => {
  const payload = evt?.payload || {}
  if (payload?.actionId) return String(payload.actionId)
  return `${evt?.eventType || 'evt'}:${evt?.ts || Date.now()}:${payload?.playerId || 'unknown'}:${payload?.col ?? ''}`
}

const rememberEvent = (setRef, eventId) => {
  if (!eventId) return false
  if (setRef.current.has(eventId)) return false
  setRef.current.add(eventId)
  if (setRef.current.size > 300) {
    const first = setRef.current.values().next().value
    setRef.current.delete(first)
  }
  return true
}

const ConnectFourActivity = ({ sdk, currentUser }) => {
  const [gameState, setGameState] = useState(baseState)

  const renderStyles = useMemo(() => (
    <style>{styles}</style>
  ), [])
  const [myColor, setMyColor] = useState(null)
  const [hoverCol, setHoverCol] = useState(null)
  const [lastMove, setLastMove] = useState(null)
  const [joinFeedback, setJoinFeedback] = useState(null)

  const seenEventsRef = useRef(new Set())
  const joinedRef = useRef(false)
  const pendingMoveRef = useRef(false)

  // Calculate column previews
  const columnPreviews = useMemo(() => {
    const previews = {}
    for (let col = 0; col < W; col++) {
      for (let row = H - 1; row >= 0; row--) {
        if (!gameState.board[row]?.[col]) {
          previews[col] = row
          break
        }
      }
    }
    return previews
  }, [gameState.board])

  // Sync state from server
  useEffect(() => {
    if (!sdk) return

    const offState = sdk.subscribeServerState((st) => {
      const c4 = st?.c4
      if (!c4 || typeof c4 !== 'object') return

      setGameState((prev) => {
        const board = sanitizeBoard(c4.board)
        const win = getWin(board)
        const isDraw = !win && board.every((row) => row.every(Boolean))

        const redPlayer = sanitizePlayer(c4.redPlayer)
        const yellowPlayer = sanitizePlayer(c4.yellowPlayer)
        const hasBothPlayers = redPlayer && yellowPlayer
        
        let newTurn = prev.turn
        if (c4.turn === RED || c4.turn === YELLOW) {
          newTurn = c4.turn
        } else if (hasBothPlayers && prev.status === 'waiting') {
          newTurn = RED
        }

        const next = {
          ...prev,
          board,
          turn: newTurn,
          redPlayer,
          yellowPlayer,
          winner: win?.winner || null,
          winningCells: win?.cells || null,
          isDraw,
          status: win || isDraw ? 'finished' : (hasBothPlayers ? 'playing' : 'waiting'),
          moveCount: Number.isInteger(c4.moveCount) ? Math.max(0, c4.moveCount) : prev.moveCount
        }
        return next
      })

      // Update my color
      if (c4.redPlayer?.id === currentUser?.id) setMyColor(RED)
      else if (c4.yellowPlayer?.id === currentUser?.id) setMyColor(YELLOW)
    })

    const offEvent = sdk.on('event', (evt) => {
      if (!evt?.eventType) return
      const eventId = buildEventId(evt)
      if (!rememberEvent(seenEventsRef, eventId)) return

      const payload = evt.payload || {}

      // Handle move events
      if (evt.eventType === 'c4:move') {
        const col = Number(payload.col)
        const color = payload.color
        if (col < 0 || col >= W || (color !== RED && color !== YELLOW)) return
        pendingMoveRef.current = false

        setGameState((prev) => {
          if (prev.winner || prev.isDraw || prev.turn !== color) return prev
          const result = dropPiece(prev.board, col, color)
          if (!result) return prev

          const win = getWin(result.board)
          const isDraw = !win && result.board.every((row) => row.every(Boolean))

          // Set last move for animation
          setLastMove({ col, row: result.row, color })

          return {
            ...prev,
            board: result.board,
            turn: color === RED ? YELLOW : RED,
            winner: win?.winner || null,
            winningCells: win?.cells || null,
            isDraw,
            status: win || isDraw ? 'finished' : 'playing',
            moveCount: prev.moveCount + 1
          }
        })
        return
      }

      // Handle join events
      if (evt.eventType === 'c4:join') {
        const color = payload.color
        if ((color !== RED && color !== YELLOW) || !payload.playerId) return

        const player = { 
          id: String(payload.playerId), 
          username: String(payload.username || 'Player'),
          avatar: payload.avatar || null 
        }
        
        setGameState((prev) => {
          const key = color === RED ? 'redPlayer' : 'yellowPlayer'
          const otherKey = color === RED ? 'yellowPlayer' : 'redPlayer'
          const current = prev[key]
          
          // Only allow joining if slot is empty or it's the same player
          if (current && current.id !== player.id) return prev
          
          const otherPlayer = prev[otherKey]
          const hasBothPlayers = (color === RED ? player : prev.redPlayer) && (color === YELLOW ? player : prev.yellowPlayer)
          
          return {
            ...prev,
            [key]: player,
            status: hasBothPlayers ? 'playing' : 'waiting'
          }
        })
        
        // Show join feedback
        if (player.id === currentUser?.id) {
          setJoinFeedback({ color, message: `You joined ${color === RED ? 'Red' : 'Yellow'}!` })
          setTimeout(() => setJoinFeedback(null), 2000)
        }
        return
      }

      // Handle leave events
      if (evt.eventType === 'c4:leave') {
        const color = payload.color
        if ((color !== RED && color !== YELLOW) || !payload.playerId) return
        const playerId = String(payload.playerId)

        setGameState((prev) => {
          const key = color === RED ? 'redPlayer' : 'yellowPlayer'
          const slot = prev[key]
          if (!slot || slot.id !== playerId) return prev
          
          return { 
            ...prev, 
            [key]: null, 
            status: 'waiting',
            winner: null,
            isDraw: false,
            winningCells: null
          }
        })
        
        if (playerId === currentUser?.id) {
          setMyColor(null)
          setJoinFeedback(null)
        }
        return
      }

      // Handle reset events
      if (evt.eventType === 'c4:reset') {
        setGameState((prev) => ({
          ...baseState,
          redPlayer: prev.redPlayer,
          yellowPlayer: prev.yellowPlayer,
          status: prev.redPlayer && prev.yellowPlayer ? 'playing' : 'waiting'
        }))
        setLastMove(null)
        return
      }
    })

    // Join the game automatically on mount
    if (!joinedRef.current && currentUser?.id && sdk) {
      joinedRef.current = true
    }

    return () => {
      offState?.()
      offEvent?.()
    }
  }, [sdk, currentUser?.id])

  const playCol = useCallback((col) => {
    if (!sdk) return
    if (!myColor) return
    if (col < 0 || col >= W) return
    if (gameState.winner || gameState.isDraw) return
    if (gameState.turn !== myColor) return
    if (!canDropInColumn(gameState.board, col)) return

    const actionId = `c4_move_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    rememberEvent(seenEventsRef, actionId)

    // Apply move optimistically so the UI updates immediately
    setGameState((prev) => {
      if (prev.winner || prev.isDraw || prev.turn !== myColor) return prev
      const result = dropPiece(prev.board, col, myColor)
      if (!result) return prev

      const win = getWin(result.board)
      const isDraw = !win && result.board.every((row) => row.every(Boolean))

      setLastMove({ col, row: result.row, color: myColor })

      return {
        ...prev,
        board: result.board,
        turn: myColor === RED ? YELLOW : RED,
        winner: win?.winner || null,
        winningCells: win?.cells || null,
        isDraw,
        status: win || isDraw ? 'finished' : 'playing',
        moveCount: prev.moveCount + 1
      }
    })

    sdk.emitEvent('c4:move', {
      col,
      color: myColor,
      playerId: currentUser?.id,
      actionId
    }, { serverRelay: true, cue: 'piece_drop' })
  }, [sdk, myColor, gameState.board, gameState.winner, gameState.isDraw, gameState.turn, currentUser?.id])

  const joinGame = useCallback((color) => {
    if (!sdk || !currentUser?.id) return
    
    // Check if slot is available
    if (color === RED && gameState.redPlayer && gameState.redPlayer.id !== currentUser.id) return
    if (color === YELLOW && gameState.yellowPlayer && gameState.yellowPlayer.id !== currentUser.id) return

    const actionId = `c4_join_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

    sdk.emitEvent('c4:join', {
      playerId: currentUser.id,
      username: currentUser.username || 'Player',
      avatar: currentUser.avatar || null,
      color,
      actionId
    }, { serverRelay: true, cue: 'player_join' })
  }, [sdk, currentUser, gameState.redPlayer, gameState.yellowPlayer])

  const leaveGame = useCallback(() => {
    if (!sdk || !myColor || !currentUser?.id) return

    const actionId = `c4_leave_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

    sdk.emitEvent('c4:leave', {
      playerId: currentUser.id,
      color: myColor,
      actionId
    }, { serverRelay: true, cue: 'player_leave' })
  }, [sdk, myColor, currentUser?.id])

  const resetGame = useCallback(() => {
    if (!sdk) return

    const actionId = `c4_reset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

    sdk.emitEvent('c4:reset', { actionId }, { serverRelay: true, cue: 'game_reset' })
  }, [sdk])

  // Derived values
  const isMyTurn = myColor === gameState.turn
  const isPlaying = myColor === RED || myColor === YELLOW
  const canJoinRed = !gameState.redPlayer || gameState.redPlayer.id === currentUser?.id
  const canJoinYellow = !gameState.yellowPlayer || gameState.yellowPlayer.id === currentUser?.id
  const gameOver = gameState.winner || gameState.isDraw

  if (!sdk) {
    return (
      <div className="builtin-activity-loading">
        <div className="loading-spinner" />
        <p>Loading Connect Four...</p>
      </div>
    )
  }

  return (
    <div className="builtin-activity-body c4-activity">
      {renderStyles}
      {/* Join Feedback Toast */}
      {joinFeedback && (
        <div className="c4-join-toast" style={{
          position: 'absolute',
          top: '10px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: joinFeedback.color === RED ? '#dc2626' : '#eab308',
          color: joinFeedback.color === RED ? 'white' : 'black',
          padding: '10px 20px',
          borderRadius: '8px',
          fontWeight: 'bold',
          zIndex: 100,
          animation: 'fadeIn 0.3s ease'
        }}>
          {joinFeedback.message}
        </div>
      )}

      {/* Players Bar */}
      <div className="c4-players-bar">
        {/* Red Player */}
        <div className={`c4-player-slot ${gameState.turn === RED ? 'active-turn' : ''} ${myColor === RED ? 'is-me' : ''}`}>
          <div className="c4-piece-container">
            <div className="c4-piece red" />
          </div>
          <div className="c4-player-info">
            <span className="c4-player-name">
              <span className="c4-color-indicator red" aria-hidden="true" />
              {gameState.redPlayer?.username || 'Waiting...'}
              {gameState.redPlayer?.id === currentUser?.id && ' (You)'}
            </span>
            <span className="c4-player-status">
              {gameState.redPlayer ? (
                gameState.turn === RED ? (
                  <><span className="c4-turn-dot red-dot" aria-hidden="true" /> Your Turn!</>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12" aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    Waiting
                  </>
                )
              ) : (
                <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12" aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }}><circle cx="12" cy="12" r="10"/></svg>
                  Open
                </>
              )}
            </span>
          </div>
          {canJoinRed && !myColor && (
            <button 
              className="c4-join-btn red" 
              onClick={() => joinGame(RED)}
              disabled={!!gameState.redPlayer}
            >
              {gameState.redPlayer ? 'Taken' : 'Join Red'}
            </button>
          )}
          {myColor === RED && (
            <button className="c4-leave-btn" onClick={leaveGame}>
              Leave
            </button>
          )}
        </div>

        {/* Game Status */}
        <div className="c4-status">
          {gameOver ? (
            gameState.winner ? (
              <span className="c4-winner" style={{ 
                color: gameState.winner === RED ? '#ef4444' : '#eab308',
                fontWeight: 'bold',
                fontSize: '16px'
              }}>
                <TrophyIcon width="18" height="18" aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
                {gameState.winner === RED ? 'Red' : 'Yellow'} Wins!
              </span>
            ) : (
              <span className="c4-draw" style={{ 
                color: '#8b5cf6', 
                fontWeight: 'bold',
                fontSize: '16px'
              }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18" aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                Draw!
              </span>
            )
          ) : gameState.status === 'waiting' ? (
            <span className="c4-waiting">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14" aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              Waiting for players...
            </span>
          ) : (
            <span className={isMyTurn ? 'my-turn-text' : ''}>
              {isMyTurn ? 'Your Turn!' : (
                <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14" aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  {gameState.turn === RED ? 'Red' : 'Yellow'}'s Turn
                </>
              )}
            </span>
          )}
        </div>

        {/* Yellow Player */}
        <div className={`c4-player-slot ${gameState.turn === YELLOW ? 'active-turn' : ''} ${myColor === YELLOW ? 'is-me' : ''}`}>
          <div className="c4-piece-container">
            <div className="c4-piece yellow" />
          </div>
          <div className="c4-player-info">
            <span className="c4-player-name">
              <span className="c4-color-indicator yellow" aria-hidden="true" />
              {gameState.yellowPlayer?.username || 'Waiting...'}
              {gameState.yellowPlayer?.id === currentUser?.id && ' (You)'}
            </span>
            <span className="c4-player-status">
              {gameState.yellowPlayer ? (
                gameState.turn === YELLOW ? (
                  <><span className="c4-turn-dot yellow-dot" aria-hidden="true" /> Your Turn!</>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12" aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    Waiting
                  </>
                )
              ) : (
                <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12" aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }}><circle cx="12" cy="12" r="10"/></svg>
                  Open
                </>
              )}
            </span>
          </div>
          {canJoinYellow && !myColor && (
            <button 
              className="c4-join-btn yellow" 
              onClick={() => joinGame(YELLOW)}
              disabled={!!gameState.yellowPlayer}
            >
              {gameState.yellowPlayer ? 'Taken' : 'Join Yellow'}
            </button>
          )}
          {myColor === YELLOW && (
            <button className="c4-leave-btn" onClick={leaveGame}>
              Leave
            </button>
          )}
        </div>
      </div>

      {/* Game Board */}
      <div className="c4-game-board">
        <div className="c4-board-wrapper">
          {/* Column Indicators */}
          <div className="c4-column-indicators">
            {Array(W).fill(null).map((_, col) => {
              const canDrop = canDropInColumn(gameState.board, col) && isMyTurn && !gameOver
              const previewRow = columnPreviews[col]
              
              return (
                <button
                  key={col}
                  className={`c4-indicator ${canDrop ? 'active' : ''}`}
                  onClick={() => playCol(col)}
                  onMouseEnter={() => setHoverCol(col)}
                  onMouseLeave={() => setHoverCol(null)}
                  disabled={!canDrop}
                  style={{
                    opacity: (hoverCol === col && canDrop) ? 1 : (hoverCol === col ? 0.3 : 0),
                    cursor: canDrop ? 'pointer' : 'not-allowed'
                  }}
                >
                  {hoverCol === col && previewRow !== undefined && canDrop && (
                    <div 
                      className={`c4-disc-preview ${myColor}`}
                    />
                  )}
                </button>
              )
            })}
          </div>

          {/* Board Grid */}
          <div className="c4-board">
            {gameState.board.map((row, y) => (
              row.map((cell, x) => {
                const isWinning = gameState.winningCells?.some(([wx, wy]) => wx === x && wy === y)
                const isLastMove = lastMove?.col === x && lastMove?.row === y
                const isPreview = hoverCol === x && columnPreviews[x] === y && isMyTurn && !cell && !gameOver
                const showPreview = isPreview && canDropInColumn(gameState.board, x)

                return (
                  <div
                    key={`${x}_${y}`}
                    className={`c4-cell ${cell || ''} ${isWinning ? 'winning' : ''} ${isLastMove ? 'last-drop' : ''}`}
                    data-color={cell}
                    onClick={() => playCol(x)}
                    onMouseEnter={() => setHoverCol(x)}
                    onMouseLeave={() => setHoverCol(null)}
                    style={{
                      cursor: isMyTurn && !gameOver && cell == null ? 'pointer' : 'default'
                    }}
                  >
                    {cell && (
                      <div 
                        className={`c4-disc ${cell} ${isLastMove ? 'dropping' : ''}`}
                      />
                    )}
                    {showPreview && (
                      <div 
                        className={`c4-disc preview ${myColor}`}
                      />
                    )}
                  </div>
                )
              })
            ))}
          </div>
        </div>

        {/* Controls */}
        <div className="c4-controls">
          <button 
            onClick={resetGame} 
            className="c4-reset-btn"
            disabled={!gameState.redPlayer && !gameState.yellowPlayer}
          >
            <RefreshIcon /> New Game
          </button>
          
          <div className="c4-turn-indicator">
            {isPlaying ? (
              isMyTurn ? (
                <span style={{ color: '#22c55e', fontWeight: 'bold' }}>
                  Your turn! Click a column to drop your disc
                </span>
              ) : (
                <span style={{ opacity: 0.7 }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14" aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  Waiting for {gameState.turn === RED ? 'Red' : 'Yellow'}...
                </span>
              )
            ) : (
              <span>Choose a color to join the game!</span>
            )}
          </div>
          
          <div className="c4-move-counter">
            Moves: {gameState.moveCount}
          </div>
        </div>
      </div>
    </div>
  )
}

export default ConnectFourActivity
