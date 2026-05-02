/**
 * ConnectFourActivity.jsx — complete rewrite
 *
 * Key design decisions:
 *  - Server state (sdk.subscribeServerState) is the SINGLE source of truth.
 *    The board, turn, players, and winner are all read from server state.
 *  - Moves are sent via sdk.emitEvent with serverRelay:true.
 *    The server-side handler applies the move to server state and broadcasts
 *    the updated state to all clients.
 *  - NO optimistic local updates — we wait for the server echo.
 *    This prevents double-apply desyncs.
 *  - Duplicate event deduplication via seenEventsRef (same pattern as TicTacToe).
 *  - Hover preview is purely local (no sync needed).
 */

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import GameCanvasShell from './shared/GameCanvasShell'

// ── Constants ─────────────────────────────────────────────────────────────────

const ROWS = 6
const COLS = 7
const RED    = 'red'
const YELLOW = 'yellow'

// ── Pure game logic ───────────────────────────────────────────────────────────

const makeBoard = () => Array.from({ length: ROWS }, () => Array(COLS).fill(null))

const sanitizeBoard = (board) => {
  if (!Array.isArray(board) || board.length !== ROWS) return makeBoard()
  return board.map(row => {
    if (!Array.isArray(row) || row.length !== COLS) return Array(COLS).fill(null)
    return row.map(cell => (cell === RED || cell === YELLOW ? cell : null))
  })
}

const sanitizePlayer = (p) => {
  if (!p || typeof p !== 'object' || !p.id) return null
  return { id: String(p.id), username: String(p.username || 'Player'), avatar: p.avatar || null }
}

/** Drop a piece into a column. Returns { board, row } or null if column full. */
const dropPiece = (board, col, color) => {
  if (col < 0 || col >= COLS) return null
  const next = board.map(r => [...r])
  for (let row = ROWS - 1; row >= 0; row--) {
    if (!next[row][col]) {
      next[row][col] = color
      return { board: next, row }
    }
  }
  return null // column full
}

/** Returns { winner, cells } or null. */
const checkWin = (board) => {
  const dirs = [
    [0, 1], [1, 0], [1, 1], [1, -1]
  ]
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const piece = board[r]?.[c]
      if (!piece) continue
      for (const [dr, dc] of dirs) {
        const cells = [[r, c]]
        for (let k = 1; k < 4; k++) {
          const nr = r + dr * k
          const nc = c + dc * k
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || board[nr][nc] !== piece) break
          cells.push([nr, nc])
        }
        if (cells.length === 4) return { winner: piece, cells }
      }
    }
  }
  return null
}

const isBoardFull = (board) => board.every(row => row.every(Boolean))

const canDrop = (board, col) =>
  col >= 0 && col < COLS && board[0]?.[col] == null

/** Find the row a piece would land in for a given column (for preview). */
const previewRow = (board, col) => {
  for (let r = ROWS - 1; r >= 0; r--) {
    if (!board[r]?.[col]) return r
  }
  return -1
}

// ── Base state ────────────────────────────────────────────────────────────────

const BASE_STATE = {
  board:        makeBoard(),
  turn:         RED,
  winner:       null,
  winCells:     null,
  isDraw:       false,
  redPlayer:    null,
  yellowPlayer: null,
  status:       'waiting', // 'waiting' | 'playing' | 'finished'
  moveCount:    0,
}

// ── Event dedup helpers ───────────────────────────────────────────────────────

const buildEventId = (evt) => {
  const p = evt?.payload || {}
  if (p.actionId) return String(p.actionId)
  return `${evt?.eventType}:${evt?.ts || Date.now()}:${p.playerId || ''}:${p.col ?? ''}`
}

const rememberEvent = (ref, id) => {
  if (!id || ref.current.has(id)) return false
  ref.current.add(id)
  if (ref.current.size > 400) {
    ref.current.delete(ref.current.values().next().value)
  }
  return true
}

// ── Sound ─────────────────────────────────────────────────────────────────────

const createSounds = () => {
  let ctx = null
  let muted = false

  const init = () => {
    if (ctx) return
    try { ctx = new (window.AudioContext || window.webkitAudioContext)() } catch {}
  }

  const tone = (freq, dur, type = 'sine', vol = 0.25) => {
    if (!ctx || muted) return
    try {
      if (ctx.state === 'suspended') ctx.resume()
      const osc = ctx.createOscillator()
      const g   = ctx.createGain()
      osc.type = type
      osc.frequency.value = freq
      g.gain.setValueAtTime(vol, ctx.currentTime)
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur)
      osc.connect(g)
      g.connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + dur)
    } catch {}
  }

  return {
    init,
    toggleMute: () => { muted = !muted; return muted },
    isMuted: () => muted,
    drop:  () => { tone(300, 0.06); setTimeout(() => tone(200, 0.08), 60) },
    win:   () => {
      tone(523, 0.1); setTimeout(() => tone(659, 0.1), 100)
      setTimeout(() => tone(784, 0.15), 200); setTimeout(() => tone(1047, 0.2), 320)
    },
    draw:  () => { tone(440, 0.15, 'triangle'); setTimeout(() => tone(440, 0.2, 'triangle'), 150) },
    join:  () => { tone(440, 0.07); setTimeout(() => tone(554, 0.09), 60) },
    reset: () => { tone(500, 0.06, 'triangle'); setTimeout(() => tone(700, 0.08, 'triangle'), 100) },
  }
}

// ── Styles ────────────────────────────────────────────────────────────────────

const CSS = `
.c4 {
  --red:    #dc2626;
  --red-l:  #fca5a5;
  --red-d:  #991b1b;
  --yel:    #eab308;
  --yel-l:  #fde68a;
  --yel-d:  #a16207;
  --board:  #1e40af;
  --slot:   #0f172a;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 16px;
  user-select: none;
  font-family: inherit;
}

/* ── Players bar ── */
.c4-bar {
  display: flex;
  align-items: stretch;
  gap: 12px;
  width: 100%;
  max-width: 520px;
}
.c4-slot {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: rgba(30,41,59,0.85);
  border-radius: 12px;
  border: 2px solid transparent;
  transition: border-color 0.25s, box-shadow 0.25s;
  min-width: 0;
}
.c4-slot.active { border-color: var(--slot-color); box-shadow: 0 0 16px color-mix(in srgb, var(--slot-color) 35%, transparent); }
.c4-slot.red-slot  { --slot-color: var(--red); }
.c4-slot.yel-slot  { --slot-color: var(--yel); }
.c4-disc-sm {
  width: 36px; height: 36px; border-radius: 50%; flex-shrink: 0;
}
.c4-disc-sm.red    { background: radial-gradient(circle at 30% 30%, var(--red-l), var(--red), var(--red-d)); box-shadow: inset 0 -2px 4px rgba(0,0,0,.3); }
.c4-disc-sm.yellow { background: radial-gradient(circle at 30% 30%, var(--yel-l), var(--yel), var(--yel-d)); box-shadow: inset 0 -2px 4px rgba(0,0,0,.3); }
.c4-pname { font-size: 13px; font-weight: 600; color: #f1f5f9; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.c4-psub  { font-size: 11px; color: #94a3b8; }
.c4-join-btn {
  margin-left: auto; flex-shrink: 0;
  padding: 6px 12px; border-radius: 8px; border: none;
  font-size: 11px; font-weight: 700; letter-spacing: .04em; cursor: pointer;
  transition: transform .15s, box-shadow .15s;
}
.c4-join-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 10px rgba(0,0,0,.3); }
.c4-join-btn:disabled { opacity: .45; cursor: not-allowed; }
.c4-join-btn.red    { background: linear-gradient(135deg, var(--red), var(--red-d)); color: #fff; }
.c4-join-btn.yellow { background: linear-gradient(135deg, var(--yel), var(--yel-d)); color: #0f172a; }
.c4-leave-btn {
  margin-left: auto; flex-shrink: 0;
  padding: 5px 10px; border-radius: 8px; border: 1px solid #475569;
  background: transparent; color: #94a3b8; font-size: 11px; cursor: pointer;
  transition: background .15s, color .15s, border-color .15s;
}
.c4-leave-btn:hover { background: rgba(239,68,68,.15); border-color: #ef4444; color: #ef4444; }

/* ── Status pill ── */
.c4-status {
  display: flex; align-items: center; justify-content: center;
  padding: 8px 14px; background: rgba(15,23,42,.7); border-radius: 10px;
  font-size: 13px; font-weight: 600; white-space: nowrap; flex-shrink: 0;
}
.c4-status.win-red    { color: var(--red); }
.c4-status.win-yellow { color: var(--yel); }
.c4-status.draw       { color: #a78bfa; }
.c4-status.my-turn    { color: #22c55e; animation: c4pulse 1s ease-in-out infinite; }
.c4-status.waiting    { color: #64748b; }
@keyframes c4pulse { 0%,100%{opacity:1} 50%{opacity:.65} }

/* ── Board ── */
.c4-board-wrap {
  padding: 10px;
  background: linear-gradient(180deg, #1d4ed8, var(--board));
  border-radius: 14px;
  box-shadow: 0 12px 40px rgba(0,0,0,.45), inset 0 2px 4px rgba(255,255,255,.1);
}
.c4-col-hints {
  display: grid; grid-template-columns: repeat(7, 48px); gap: 8px;
  margin-bottom: 6px;
}
.c4-col-hint {
  height: 28px; display: flex; align-items: center; justify-content: center;
  cursor: pointer; border: none; background: transparent; padding: 0;
}
.c4-col-hint:disabled { cursor: not-allowed; }
.c4-hint-disc {
  width: 36px; height: 36px; border-radius: 50%; opacity: .55;
  animation: c4drop .35s cubic-bezier(.34,1.56,.64,1);
}
.c4-hint-disc.red    { background: radial-gradient(circle at 30% 30%, var(--red-l), var(--red), var(--red-d)); }
.c4-hint-disc.yellow { background: radial-gradient(circle at 30% 30%, var(--yel-l), var(--yel), var(--yel-d)); }
@keyframes c4drop { from{transform:translateY(-40px);opacity:0} to{transform:translateY(0);opacity:.55} }

.c4-grid {
  display: grid; grid-template-columns: repeat(7, 48px);
  grid-template-rows: repeat(6, 48px); gap: 8px;
  background: var(--slot); border-radius: 8px; padding: 8px;
  box-shadow: inset 0 4px 12px rgba(0,0,0,.6);
}
.c4-cell {
  width: 48px; height: 48px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  cursor: default; position: relative; transition: background .15s;
}
.c4-cell.clickable { cursor: pointer; }
.c4-cell.clickable:hover { background: rgba(255,255,255,.06); }
.c4-disc {
  width: 40px; height: 40px; border-radius: 50%;
  box-shadow: inset 0 -3px 6px rgba(0,0,0,.3);
}
.c4-disc.red    { background: radial-gradient(circle at 30% 30%, var(--red-l), var(--red), var(--red-d)); box-shadow: inset 0 -3px 6px rgba(0,0,0,.3), 0 2px 8px rgba(220,38,38,.4); }
.c4-disc.yellow { background: radial-gradient(circle at 30% 30%, var(--yel-l), var(--yel), var(--yel-d)); box-shadow: inset 0 -3px 6px rgba(0,0,0,.3), 0 2px 8px rgba(234,179,8,.4); }
.c4-disc.dropping { animation: c4fall .45s cubic-bezier(.34,1.56,.64,1); }
@keyframes c4fall { from{transform:translateY(-300px);opacity:.3} to{transform:translateY(0);opacity:1} }
.c4-cell.winning .c4-disc {
  animation: c4glow 1s ease-in-out infinite;
}
.c4-cell.winning .c4-disc.red    { box-shadow: 0 0 20px var(--red), 0 0 40px rgba(220,38,38,.5), inset 0 -3px 6px rgba(0,0,0,.3); }
.c4-cell.winning .c4-disc.yellow { box-shadow: 0 0 20px var(--yel), 0 0 40px rgba(234,179,8,.5), inset 0 -3px 6px rgba(0,0,0,.3); }
@keyframes c4glow { 0%,100%{filter:brightness(1)} 50%{filter:brightness(1.35)} }

/* ── Controls ── */
.c4-controls {
  display: flex; flex-direction: column; align-items: center; gap: 10px;
}
.c4-new-btn {
  display: flex; align-items: center; gap: 8px;
  padding: 9px 22px; border-radius: 10px; border: none;
  background: linear-gradient(135deg, #475569, #334155);
  color: #f1f5f9; font-size: 13px; font-weight: 600; cursor: pointer;
  transition: transform .15s, box-shadow .15s, background .15s;
}
.c4-new-btn:hover:not(:disabled) { background: linear-gradient(135deg, #64748b, #475569); transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,.3); }
.c4-new-btn:disabled { opacity: .45; cursor: not-allowed; }
.c4-hint-text { font-size: 12px; color: #64748b; }
.c4-hint-text.active { color: #22c55e; font-weight: 600; }
.c4-moves { font-size: 11px; color: #475569; padding: 3px 10px; background: rgba(30,41,59,.5); border-radius: 20px; }

/* ── Pending overlay ── */
.c4-pending {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,.35); border-radius: 50%;
}
.c4-pending-dot {
  width: 8px; height: 8px; border-radius: 50%; background: #fff;
  animation: c4blink .6s ease-in-out infinite;
}
@keyframes c4blink { 0%,100%{opacity:1} 50%{opacity:.2} }
`

// ── Component ─────────────────────────────────────────────────────────────────

const ConnectFourActivity = ({ sdk, currentUser }) => {
  const [gs, setGs]           = useState(BASE_STATE)
  const [myColor, setMyColor] = useState(null)
  const [hoverCol, setHoverCol] = useState(null)
  const [lastDrop, setLastDrop] = useState(null)   // { row, col } for drop animation
  const [pending, setPending]   = useState(false)  // waiting for server echo

  const seenRef  = useRef(new Set())
  const stateRef = useRef(BASE_STATE)
  const soundRef = useRef(null)

  // Create sound manager once
  const sound = useMemo(() => {
    const s = createSounds()
    soundRef.current = s
    return s
  }, [])

  useEffect(() => {
    stateRef.current = gs
  }, [gs])

  const pushState = useCallback((nextState, cue = 'game_update') => {
    stateRef.current = nextState
    setGs(nextState)
    sdk?.updateState?.({ c4: nextState }, { serverRelay: true, cue })
  }, [sdk])

  // Init audio on first interaction
  useEffect(() => {
    const h = () => { sound.init(); document.removeEventListener('click', h) }
    document.addEventListener('click', h, { once: true })
    return () => document.removeEventListener('click', h)
  }, [sound])

  // ── Subscribe to server state + events ──────────────────────────────────────

  useEffect(() => {
    if (!sdk) return

    // ── Server state is the authoritative source ──
    const offState = sdk.subscribeServerState((st) => {
      const c4 = st?.c4
      if (!c4 || typeof c4 !== 'object') return

      const board       = sanitizeBoard(c4.board)
      const redPlayer   = sanitizePlayer(c4.redPlayer)
      const yellowPlayer = sanitizePlayer(c4.yellowPlayer)
      const winResult   = checkWin(board)
      const isDraw      = !winResult && isBoardFull(board)
      const hasBoth     = !!(redPlayer && yellowPlayer)

      const turn = (c4.turn === RED || c4.turn === YELLOW) ? c4.turn : RED

      const nextState = {
        board,
        turn,
        winner:       winResult?.winner   || null,
        winCells:     winResult?.cells    || null,
        isDraw,
        redPlayer,
        yellowPlayer,
        status:       winResult || isDraw ? 'finished' : hasBoth ? 'playing' : 'waiting',
        moveCount:    Number.isInteger(c4.moveCount) ? Math.max(0, c4.moveCount) : 0,
      }
      stateRef.current = nextState
      setGs(nextState)

      // Sync my color from server state
      if (currentUser?.id) {
        if (redPlayer?.id    === currentUser.id) setMyColor(RED)
        else if (yellowPlayer?.id === currentUser.id) setMyColor(YELLOW)
        // Don't clear myColor here — let leave event handle it
      }

      // Clear pending once server echoes back
      setPending(false)
    })

    // ── Events for animations / sounds ──
    // We do NOT apply game logic from events — server state handles that.
    // Events are only used for: drop animation trigger, sounds, join/leave feedback.
    const offEvent = sdk.on('event', (evt) => {
      if (!evt?.eventType) return
      const eid = buildEventId(evt)
      if (!rememberEvent(seenRef, eid)) return

      const p = evt.payload || {}

      if (evt.eventType === 'c4:move') {
        const col = Number(p.col)
        const color = p.color
        if (col < 0 || col >= COLS || (color !== RED && color !== YELLOW)) return
        // Trigger drop animation — we need to know which row the piece landed in.
        // We can compute it from the CURRENT board state (before server state updates).
        setGs(prev => {
          const row = previewRow(prev.board, col)
          if (row >= 0) setLastDrop({ row, col, color, ts: Date.now() })
          return prev // don't change state — server state will update it
        })
        soundRef.current?.drop()
        setPending(false)
        return
      }

      if (evt.eventType === 'c4:join') {
        soundRef.current?.join()
        if (p.playerId === currentUser?.id) {
          setMyColor(p.color)
        }
        return
      }

      if (evt.eventType === 'c4:leave') {
        if (p.playerId === currentUser?.id) {
          setMyColor(null)
        }
        return
      }

      if (evt.eventType === 'c4:reset') {
        setLastDrop(null)
        setPending(false)
        soundRef.current?.reset()
        return
      }
    })

    return () => {
      offState?.()
      offEvent?.()
    }
  }, [sdk, currentUser?.id])

  // Play win/draw sounds when game ends
  const prevWinnerRef = useRef(null)
  const prevDrawRef   = useRef(false)
  useEffect(() => {
    if (gs.winner && gs.winner !== prevWinnerRef.current) {
      soundRef.current?.win()
    }
    if (gs.isDraw && !prevDrawRef.current) {
      soundRef.current?.draw()
    }
    prevWinnerRef.current = gs.winner
    prevDrawRef.current   = gs.isDraw
  }, [gs.winner, gs.isDraw])

  // ── Actions ─────────────────────────────────────────────────────────────────

  const playCol = useCallback((col) => {
    if (!sdk || !myColor || pending) return
    if (col < 0 || col >= COLS) return
    if (gs.winner || gs.isDraw) return
    if (gs.turn !== myColor) return
    if (!canDrop(gs.board, col)) return

    try { sound.init() } catch {}

    const actionId = `c4m_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    rememberEvent(seenRef, actionId)

    setPending(true)
    setHoverCol(null)
    try {
      const dropped = dropPiece(stateRef.current.board, col, myColor)
      if (dropped) {
        const winResult = checkWin(dropped.board)
        const isDraw = !winResult && isBoardFull(dropped.board)
        pushState({
          ...stateRef.current,
          board: dropped.board,
          turn: myColor === RED ? YELLOW : RED,
          winner: winResult?.winner || null,
          winCells: winResult?.cells || null,
          isDraw,
          status: winResult || isDraw ? 'finished' : stateRef.current.redPlayer && stateRef.current.yellowPlayer ? 'playing' : 'waiting',
          moveCount: (stateRef.current.moveCount || 0) + 1,
        }, 'move_valid')
        setLastDrop({ row: dropped.row, col, color: myColor, ts: Date.now() })
      }
    } catch (err) {
      console.error('ConnectFour: error applying local drop', err)
      setPending(false)
      return
    }

    try {
      sdk.emitEvent('c4:move', {
        col,
        color: myColor,
        playerId: currentUser?.id,
        actionId,
      }, { serverRelay: true, cue: 'piece_drop' })
    } catch (err) {
      console.error('ConnectFour: error emitting move event', err)
      setPending(false)
    }
  }, [sdk, myColor, pending, gs.board, gs.winner, gs.isDraw, gs.turn, currentUser?.id, sound, pushState])

  const joinGame = useCallback((color) => {
    if (!sdk || !currentUser?.id) return
    if (color === RED    && gs.redPlayer    && gs.redPlayer.id    !== currentUser.id) return
    if (color === YELLOW && gs.yellowPlayer && gs.yellowPlayer.id !== currentUser.id) return

    sound.init()

    const actionId = `c4j_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    rememberEvent(seenRef, actionId)
    const player = {
      id: String(currentUser.id),
      username: String(currentUser.username || 'Player'),
      avatar: currentUser.avatar || null,
    }
    pushState({
      ...stateRef.current,
      redPlayer: color === RED ? player : stateRef.current.redPlayer,
      yellowPlayer: color === YELLOW ? player : stateRef.current.yellowPlayer,
      status: (color === RED ? player : stateRef.current.redPlayer) && (color === YELLOW ? player : stateRef.current.yellowPlayer) ? 'playing' : 'waiting',
    }, 'player_join')

    sdk.emitEvent('c4:join', {
      playerId: currentUser.id,
      username: currentUser.username || 'Player',
      avatar:   currentUser.avatar   || null,
      color,
      actionId,
    }, { serverRelay: true, cue: 'player_join' })

    setMyColor(color)
  }, [sdk, currentUser, gs.redPlayer, gs.yellowPlayer, sound, pushState])

  const leaveGame = useCallback(() => {
    if (!sdk || !myColor || !currentUser?.id) return

    const actionId = `c4l_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    rememberEvent(seenRef, actionId)
    pushState({
      ...stateRef.current,
      redPlayer: myColor === RED ? null : stateRef.current.redPlayer,
      yellowPlayer: myColor === YELLOW ? null : stateRef.current.yellowPlayer,
      status: 'waiting',
      winner: null,
      winCells: null,
      isDraw: false,
    }, 'player_leave')

    sdk.emitEvent('c4:leave', {
      playerId: currentUser.id,
      color: myColor,
      actionId,
    }, { serverRelay: true, cue: 'player_leave' })

    setMyColor(null)
  }, [sdk, myColor, currentUser?.id, pushState])

  const resetGame = useCallback(() => {
    if (!sdk) return

    const actionId = `c4r_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    rememberEvent(seenRef, actionId)
    pushState({
      ...BASE_STATE,
      redPlayer: stateRef.current.redPlayer,
      yellowPlayer: stateRef.current.yellowPlayer,
      status: stateRef.current.redPlayer && stateRef.current.yellowPlayer ? 'playing' : 'waiting',
    }, 'game_reset')

    sdk.emitEvent('c4:reset', { actionId }, { serverRelay: true, cue: 'game_reset' })
  }, [sdk, pushState])

  // ── Derived ──────────────────────────────────────────────────────────────────

  const isMyTurn   = myColor === gs.turn && gs.status === 'playing'
  const gameOver   = !!(gs.winner || gs.isDraw)
  const canJoinRed    = !gs.redPlayer    || gs.redPlayer.id    === currentUser?.id
  const canJoinYellow = !gs.yellowPlayer || gs.yellowPlayer.id === currentUser?.id

  // Status pill content
  let statusClass = 'waiting'
  let statusText  = 'Waiting for players…'
  if (gameOver) {
    if (gs.winner) {
      statusClass = gs.winner === RED ? 'win-red' : 'win-yellow'
      statusText  = `${gs.winner === RED ? 'Red' : 'Yellow'} wins! 🏆`
    } else {
      statusClass = 'draw'
      statusText  = "It's a draw!"
    }
  } else if (gs.status === 'playing') {
    if (isMyTurn) {
      statusClass = 'my-turn'
      statusText  = 'Your turn!'
    } else {
      statusClass = ''
      statusText  = `${gs.turn === RED ? 'Red' : 'Yellow'}'s turn`
    }
  }

  if (!sdk) {
    return (
      <div className="builtin-activity-loading">
        <div className="loading-spinner" />
        <p>Loading Connect Four…</p>
      </div>
    )
  }

  return (
    <GameCanvasShell
      title="Connect Four"
      subtitle="Shared Drop Grid"
      status="Interactive canvas shell with the original board logic and synth drop cues intact."
      skin="sport"
      musicProfile="sport"
      contentStyle={{ paddingTop: 96, paddingBottom: 24 }}
    >
      <div className="builtin-activity-body c4" style={{ width: '100%', maxWidth: 720 }}>
        <style>{CSS}</style>

        {/* ── Players bar ── */}
        <div className="c4-bar">
          {/* Red slot */}
          <div className={`c4-slot red-slot${gs.turn === RED && !gameOver ? ' active' : ''}`}>
            <div className="c4-disc-sm red" />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="c4-pname">
                {gs.redPlayer?.username || 'Open'}
                {gs.redPlayer?.id === currentUser?.id && ' (You)'}
              </div>
              <div className="c4-psub">Red</div>
            </div>
            {!myColor && canJoinRed && !gs.redPlayer && (
              <button className="c4-join-btn red" onClick={() => joinGame(RED)}>Join</button>
            )}
            {myColor === RED && (
              <button className="c4-leave-btn" onClick={leaveGame}>Leave</button>
            )}
          </div>

          {/* Status pill */}
          <div className={`c4-status ${statusClass}`}>{statusText}</div>

          {/* Yellow slot */}
          <div className={`c4-slot yel-slot${gs.turn === YELLOW && !gameOver ? ' active' : ''}`}>
            <div className="c4-disc-sm yellow" />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="c4-pname">
                {gs.yellowPlayer?.username || 'Open'}
                {gs.yellowPlayer?.id === currentUser?.id && ' (You)'}
              </div>
              <div className="c4-psub">Yellow</div>
            </div>
            {!myColor && canJoinYellow && !gs.yellowPlayer && (
              <button className="c4-join-btn yellow" onClick={() => joinGame(YELLOW)}>Join</button>
            )}
            {myColor === YELLOW && (
              <button className="c4-leave-btn" onClick={leaveGame}>Leave</button>
            )}
          </div>
        </div>

        {/* ── Board ── */}
        <div className="c4-board-wrap">
          {/* Column hover hints */}
          <div className="c4-col-hints">
            {Array.from({ length: COLS }, (_, col) => {
              const active = isMyTurn && !gameOver && canDrop(gs.board, col) && !pending
              return (
                <button
                  key={col}
                  className="c4-col-hint"
                  disabled={!active}
                  onClick={() => playCol(col)}
                  onMouseEnter={() => active && setHoverCol(col)}
                  onMouseLeave={() => setHoverCol(null)}
                >
                  {hoverCol === col && active && (
                    <div className={`c4-hint-disc ${myColor}`} />
                  )}
                </button>
              )
            })}
          </div>

          {/* Grid */}
          <div className="c4-grid">
            {gs.board.map((row, r) =>
              row.map((cell, c) => {
                const isWin = gs.winCells?.some(([wr, wc]) => wr === r && wc === c)
                const isDrop = lastDrop && lastDrop.row === r && lastDrop.col === c
                const clickable = isMyTurn && !gameOver && !cell && canDrop(gs.board, c) && !pending

                return (
                  <div
                    key={`${r}_${c}`}
                    className={`c4-cell${clickable ? ' clickable' : ''}${isWin ? ' winning' : ''}`}
                    onClick={() => clickable && playCol(c)}
                    onMouseEnter={() => clickable && setHoverCol(c)}
                    onMouseLeave={() => setHoverCol(null)}
                  >
                    {cell && (
                      <div className={`c4-disc ${cell}${isDrop ? ' dropping' : ''}`} />
                    )}
                    {pending && cell == null && hoverCol === c && isMyTurn && (
                      <div className="c4-pending">
                        <div className="c4-pending-dot" />
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* ── Controls ── */}
        <div className="c4-controls">
          <button
            className="c4-new-btn"
            onClick={resetGame}
            disabled={!gs.redPlayer && !gs.yellowPlayer}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="15" height="15">
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
              <path d="M21 3v5h-5"/>
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
              <path d="M8 16H3v5"/>
            </svg>
            New Game
          </button>

          <div className={`c4-hint-text${isMyTurn && !gameOver ? ' active' : ''}`}>
            {myColor
              ? isMyTurn && !gameOver
                ? 'Click a column to drop your disc'
                : gameOver
                  ? 'Game over — start a new game!'
                  : 'Waiting for opponent…'
              : 'Choose a color to join!'}
          </div>

          <div className="c4-moves">Moves: {gs.moveCount}</div>
        </div>
      </div>
    </GameCanvasShell>
  )
}

export default ConnectFourActivity
