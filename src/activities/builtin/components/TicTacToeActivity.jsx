import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { ArrowPathIcon, TrophyIcon, HandRaisedIcon } from '@heroicons/react/24/solid'

const EMPTY = null
const X = 'X'
const O = 'O'

const lines = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6]
]

const baseState = {
  cells: Array(9).fill(null),
  turn: X,
  winner: null,
  isDraw: false,
  xPlayer: null,
  oPlayer: null,
  spectators: [],
  winningLine: null,
  status: 'waiting',
  disconnected: null
}

const isValidSymbol = (symbol) => symbol === X || symbol === O
const isValidIdx = (idx) => Number.isInteger(idx) && idx >= 0 && idx < 9
const sanitizePlayer = (player) => {
  if (!player || typeof player !== 'object' || !player.id) return null
  return {
    id: String(player.id),
    username: String(player.username || 'Player')
  }
}

const checkWinner = (cells) => {
  for (const [a, b, c] of lines) {
    if (cells[a] && cells[a] === cells[b] && cells[a] === cells[c]) {
      return {
        winner: cells[a],
        winningLine: [a, b, c]
      }
    }
  }
  return { winner: null, winningLine: null }
}

const deriveStatus = (cells) => {
  const { winner, winningLine } = checkWinner(cells)
  const isDraw = !winner && cells.every(Boolean)
  return {
    winner,
    winningLine,
    isDraw,
    status: winner || isDraw ? 'finished' : 'playing'
  }
}

const sanitizeBoard = (incomingCells) => {
  if (!Array.isArray(incomingCells) || incomingCells.length !== 9) return null
  return incomingCells.map((c) => (c === X || c === O ? c : null))
}

const buildEventId = (evt) => {
  const payload = evt?.payload || {}
  if (payload?.actionId) return String(payload.actionId)
  return `${evt?.eventType || 'evt'}:${evt?.ts || Date.now()}:${payload?.playerId || 'unknown'}:${payload?.idx ?? ''}`
}

const rememberEvent = (setRef, eventId) => {
  if (!eventId) return false
  if (setRef.current.has(eventId)) return false
  setRef.current.add(eventId)
  if (setRef.current.size > 250) {
    const first = setRef.current.values().next().value
    setRef.current.delete(first)
  }
  return true
}

const applyMove = (prev, idx, symbol) => {
  if (!isValidIdx(idx) || !isValidSymbol(symbol)) return prev
  if (prev.winner || prev.isDraw) return prev
  if (prev.turn !== symbol) return prev
  if (prev.cells[idx]) return prev

  const cells = [...prev.cells]
  cells[idx] = symbol
  const derived = deriveStatus(cells)

  return {
    ...prev,
    cells,
    turn: symbol === X ? O : X,
    ...derived
  }
}

// ─── Sound Manager (Web Audio API) ───────────────────────────────────────────

const createTTTSoundManager = () => {
  let ctx = null
  let master = null
  let muted = false

  const init = () => {
    if (ctx) return
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)()
      master = ctx.createGain()
      master.gain.value = 0.2
      master.connect(ctx.destination)
    } catch (e) {
      // Audio not available
    }
  }

  const tone = (freq, dur, type = 'sine', vol = 0.3) => {
    if (!ctx || muted) return
    try {
      if (ctx.state === 'suspended') ctx.resume()
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = type
      osc.frequency.setValueAtTime(freq, ctx.currentTime)
      g.gain.setValueAtTime(vol, ctx.currentTime)
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur)
      osc.connect(g)
      g.connect(master)
      osc.start()
      osc.stop(ctx.currentTime + dur)
    } catch (e) {}
  }

  return {
    init,
    ensureInit: () => { if (!ctx) init() },
    toggleMute: () => { muted = !muted; return muted },
    isMuted: () => muted,

    playMove: () => {
      tone(600, 0.08, 'sine', 0.25)
    },
    playInvalidMove: () => {
      tone(200, 0.15, 'square', 0.15)
    },
    playWin: () => {
      tone(523, 0.12, 'sine', 0.3)
      setTimeout(() => tone(659, 0.12, 'sine', 0.3), 100)
      setTimeout(() => tone(784, 0.18, 'sine', 0.35), 200)
      setTimeout(() => tone(1047, 0.25, 'sine', 0.3), 320)
    },
    playLose: () => {
      tone(400, 0.15, 'sine', 0.25)
      setTimeout(() => tone(350, 0.15, 'sine', 0.2), 120)
      setTimeout(() => tone(300, 0.25, 'sine', 0.15), 240)
    },
    playDraw: () => {
      tone(440, 0.15, 'triangle', 0.2)
      setTimeout(() => tone(440, 0.2, 'triangle', 0.15), 150)
    },
    playJoin: () => {
      tone(440, 0.08, 'sine', 0.2)
      setTimeout(() => tone(554, 0.1, 'sine', 0.25), 60)
    },
    playLeave: () => {
      tone(554, 0.08, 'sine', 0.2)
      setTimeout(() => tone(440, 0.1, 'sine', 0.15), 60)
    },
    playReset: () => {
      tone(500, 0.06, 'triangle', 0.2)
      setTimeout(() => tone(600, 0.06, 'triangle', 0.2), 60)
      setTimeout(() => tone(700, 0.08, 'triangle', 0.2), 120)
    }
  }
}

// ─── SVG Icons ───────────────────────────────────────────────────────────────

const XIcon = ({ size = 56, className = '' }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    className={`ttt-x-icon ${className}`}
    fill="none"
    stroke="currentColor"
    strokeWidth="3"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-label="X"
  >
    <line x1="6" y1="6" x2="18" y2="18" />
    <line x1="6" y1="18" x2="18" y2="6" />
  </svg>
)

const OIcon = ({ size = 56, className = '' }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    className={`ttt-o-icon ${className}`}
    fill="none"
    stroke="currentColor"
    strokeWidth="3"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-label="O"
  >
    <circle cx="12" cy="12" r="8" />
  </svg>
)

// ─── Disconnect Banner ───────────────────────────────────────────────────────

const DisconnectBanner = ({ player, symbol }) => {
  if (!player) return null
  return (
    <div className="ttt-disconnect-banner" role="alert">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <span>{player.username} ({symbol}) disconnected</span>
    </div>
  )
}

// ─── Component ───────────────────────────────────────────────────────────────

const TicTacToeActivity = ({ sdk, currentUser }) => {
  const [gameState, setGameState] = useState(baseState)
  const [mySymbol, setMySymbol] = useState(null)
  const [lastPlacedIdx, setLastPlacedIdx] = useState(null)

  const seenEventsRef = useRef(new Set())
  const joinedRef = useRef(false)
  const soundRef = useRef(null)
  const prevWinnerRef = useRef(null)
  const prevDrawRef = useRef(false)
  const disconnectTimerRef = useRef(null)

  // Create sound manager once
  const sound = useMemo(() => {
    const mgr = createTTTSoundManager()
    soundRef.current = mgr
    return mgr
  }, [])

  // Initialize audio on first user interaction
  useEffect(() => {
    const handler = () => {
      sound.ensureInit()
      document.removeEventListener('click', handler)
      document.removeEventListener('keydown', handler)
    }
    document.addEventListener('click', handler, { once: true })
    document.addEventListener('keydown', handler, { once: true })
    return () => {
      document.removeEventListener('click', handler)
      document.removeEventListener('keydown', handler)
    }
  }, [sound])

  // Play win/lose/draw sounds when game ends
  useEffect(() => {
    const { winner, isDraw } = gameState
    if (winner && winner !== prevWinnerRef.current) {
      if (mySymbol && winner === mySymbol) {
        sound.playWin()
      } else if (mySymbol) {
        sound.playLose()
      }
    }
    if (isDraw && !prevDrawRef.current && mySymbol) {
      sound.playDraw()
    }
    prevWinnerRef.current = winner
    prevDrawRef.current = isDraw
  }, [gameState.winner, gameState.isDraw, mySymbol, sound])

  useEffect(() => {
    if (!sdk) return

    const offState = sdk.subscribeServerState((st) => {
      const ttt = st?.ttt
      if (!ttt || typeof ttt !== 'object') return

      setGameState((prev) => {
        const board = sanitizeBoard(ttt.cells) || prev.cells
        const derived = deriveStatus(board)

        const next = {
          ...prev,
          ...ttt,
          cells: board,
          turn: isValidSymbol(ttt.turn) ? ttt.turn : prev.turn,
          xPlayer: sanitizePlayer(ttt.xPlayer) || prev.xPlayer,
          oPlayer: sanitizePlayer(ttt.oPlayer) || prev.oPlayer,
          ...derived
        }

        if (!next.xPlayer && !next.oPlayer && !next.winner && !next.isDraw) {
          next.status = 'waiting'
        }

        return next
      })

      const xPlayerId = ttt?.xPlayer?.id
      const oPlayerId = ttt?.oPlayer?.id
      if (xPlayerId === currentUser?.id) setMySymbol(X)
      else if (oPlayerId === currentUser?.id) setMySymbol(O)
      else setMySymbol((prev) => (prev === X || prev === O ? prev : null))
    })

    const offEvent = sdk.on('event', (evt) => {
      if (!evt?.eventType) return
      const eventId = buildEventId(evt)
      if (!rememberEvent(seenEventsRef, eventId)) return

      const payload = evt.payload || {}

      if (evt.eventType === 'ttt:move') {
        const idx = Number(payload.idx)
        const symbol = payload.symbol
        setGameState((prev) => {
          const next = applyMove(prev, idx, symbol)
          if (next !== prev) {
            setLastPlacedIdx(idx)
            soundRef.current?.playMove()
          }
          return next
        })
        return
      }

      if (evt.eventType === 'ttt:join') {
        const symbol = payload.symbol
        if (!isValidSymbol(symbol) || !payload.playerId) return

        const player = {
          id: String(payload.playerId),
          username: String(payload.username || 'Player')
        }

        setGameState((prev) => {
          const key = symbol === X ? 'xPlayer' : 'oPlayer'
          const current = prev[key]
          if (current && current.id !== player.id) return prev
          return {
            ...prev,
            [key]: player,
            disconnected: prev.disconnected === symbol ? null : prev.disconnected,
            status: (symbol === X ? prev.oPlayer : prev.xPlayer) ? 'playing' : 'waiting'
          }
        })

        if (player.id === currentUser?.id) setMySymbol(symbol)
        soundRef.current?.playJoin()
        return
      }

      if (evt.eventType === 'ttt:leave') {
        const symbol = payload.symbol
        if (!isValidSymbol(symbol) || !payload.playerId) return
        const playerId = String(payload.playerId)

        setGameState((prev) => {
          const key = symbol === X ? 'xPlayer' : 'oPlayer'
          const slot = prev[key]
          if (!slot || slot.id !== playerId) return prev
          return {
            ...prev,
            [key]: null,
            status: 'waiting'
          }
        })

        if (playerId === currentUser?.id) setMySymbol(null)
        soundRef.current?.playLeave()
        return
      }

      if (evt.eventType === 'ttt:disconnect') {
        const symbol = payload.symbol
        if (!isValidSymbol(symbol)) return
        setGameState((prev) => ({
          ...prev,
          disconnected: symbol
        }))
        return
      }

      if (evt.eventType === 'ttt:reset') {
        setGameState((prev) => ({
          ...baseState,
          xPlayer: prev.xPlayer,
          oPlayer: prev.oPlayer,
          status: prev.xPlayer && prev.oPlayer ? 'playing' : 'waiting'
        }))
        setLastPlacedIdx(null)
        soundRef.current?.playReset()
      }
    })

    // Handle peer disconnect detection
    const offPresence = sdk.on?.('presence', (evt) => {
      if (!evt || evt.type !== 'leave') return
      const leftId = evt.userId || evt.playerId
      if (!leftId) return

      setGameState((prev) => {
        let disconnectedSymbol = null
        if (prev.xPlayer?.id === leftId) disconnectedSymbol = X
        else if (prev.oPlayer?.id === leftId) disconnectedSymbol = O
        if (!disconnectedSymbol) return prev

        // Only flag disconnect if the game is in progress
        if (prev.status !== 'playing') return prev

        return {
          ...prev,
          disconnected: disconnectedSymbol
        }
      })
    })

    if (!joinedRef.current && currentUser?.id) {
      sdk.emitEvent('ttt:join', {
        playerId: currentUser.id,
        username: currentUser.username || 'Player'
      }, { serverRelay: true })
      joinedRef.current = true
    }

    return () => {
      offState?.()
      offEvent?.()
      offPresence?.()
      if (disconnectTimerRef.current) clearTimeout(disconnectTimerRef.current)
    }
  }, [sdk, currentUser?.id, currentUser?.username])

  const play = useCallback((idx) => {
    if (!isValidIdx(idx)) return
    if (!isValidSymbol(mySymbol)) return
    if (gameState.cells[idx] || gameState.winner || gameState.isDraw || gameState.turn !== mySymbol) return

    sound.ensureInit()

    const actionId = `ttt_move_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    rememberEvent(seenEventsRef, actionId)

    setLastPlacedIdx(idx)
    setGameState((prev) => applyMove(prev, idx, mySymbol))
    sound.playMove()

    sdk.emitEvent('ttt:move', {
      idx,
      symbol: mySymbol,
      playerId: currentUser?.id,
      actionId
    }, {
      serverRelay: true,
      cue: 'score_update'
    })
  }, [gameState.cells, gameState.winner, gameState.isDraw, gameState.turn, mySymbol, sdk, currentUser?.id, sound])

  if (!sdk) {
    return <div className="builtin-activity-loading"><div className="loading-spinner" /><p>Loading Tic Tac Toe...</p></div>
  }

  const joinGame = (symbol) => {
    if (!isValidSymbol(symbol) || !currentUser?.id) return
    if (symbol === X && gameState.xPlayer && gameState.xPlayer.id !== currentUser.id) return
    if (symbol === O && gameState.oPlayer && gameState.oPlayer.id !== currentUser.id) return

    sound.ensureInit()

    const actionId = `ttt_join_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    rememberEvent(seenEventsRef, actionId)

    sdk.emitEvent('ttt:join', {
      playerId: currentUser.id,
      username: currentUser.username || 'Player',
      symbol,
      actionId
    }, { serverRelay: true, cue: 'player_join' })

    setMySymbol(symbol)
    sound.playJoin()
  }

  const leaveGame = () => {
    if (!mySymbol || !currentUser?.id) return

    const actionId = `ttt_leave_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    rememberEvent(seenEventsRef, actionId)

    sdk.emitEvent('ttt:leave', {
      playerId: currentUser.id,
      symbol: mySymbol,
      actionId
    }, { serverRelay: true, cue: 'player_leave' })

    setMySymbol(null)
    sound.playLeave()
  }

  const resetGame = () => {
    sound.ensureInit()

    const actionId = `ttt_reset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    rememberEvent(seenEventsRef, actionId)

    sdk.emitEvent('ttt:reset', { actionId }, { serverRelay: true, cue: 'round_start' })

    setGameState((prev) => ({
      ...baseState,
      xPlayer: prev.xPlayer,
      oPlayer: prev.oPlayer,
      status: prev.xPlayer && prev.oPlayer ? 'playing' : 'waiting'
    }))
    setLastPlacedIdx(null)
    sound.playReset()
  }

  const isMyTurn = mySymbol === gameState.turn
  const canJoinX = !gameState.xPlayer || gameState.xPlayer.id === currentUser?.id
  const canJoinO = !gameState.oPlayer || gameState.oPlayer.id === currentUser?.id
  const isPlaying = mySymbol === X || mySymbol === O
  const gameOver = gameState.winner || gameState.isDraw

  const renderSymbol = (cell) => {
    if (cell === X) return <XIcon />
    if (cell === O) return <OIcon />
    return null
  }

  // Determine disconnected player info
  const disconnectedPlayer = gameState.disconnected === X
    ? gameState.xPlayer
    : gameState.disconnected === O
      ? gameState.oPlayer
      : null

  return (
    <div className={`builtin-activity-body ttt-activity ${gameOver ? 'game-ended' : ''}`}>
      {/* Disconnect Banner */}
      {gameState.disconnected && !gameOver && (
        <DisconnectBanner player={disconnectedPlayer} symbol={gameState.disconnected} />
      )}

      <div className="ttt-players-bar">
        <div className={`ttt-player-slot ${gameState.turn === X && !gameOver ? 'active-turn' : ''} ${mySymbol === X ? 'is-me' : ''}`}>
          <div className="ttt-symbol x">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="6" y1="18" x2="18" y2="6" />
            </svg>
          </div>
          <div className="ttt-player-info">
            <span className="ttt-player-name">{gameState.xPlayer?.username || 'Waiting...'}</span>
            <span className="ttt-player-label">Player X</span>
          </div>
          {canJoinX && mySymbol !== O && <button className="ttt-join-btn" onClick={() => joinGame(X)}>Join</button>}
          {mySymbol === X && <button className="ttt-leave-btn" onClick={leaveGame}>Leave</button>}
        </div>

        <div className="ttt-status">
          {gameState.status === 'waiting' && (
            <div className="ttt-status-content waiting">
              <HandRaisedIcon className="ttt-status-icon" />
              <span>Waiting for players...</span>
            </div>
          )}
          {gameState.status === 'playing' && !gameOver && (
            <div className={`ttt-status-content ${isMyTurn ? 'my-turn' : ''}`}>
              <div className="ttt-turn-indicator-wrapper">
                <span className={isMyTurn ? 'turn-active' : ''}>
                  {isMyTurn ? 'Your Turn!' : `${gameState.turn}'s Turn`}
                </span>
                {isMyTurn && <div className="turn-pulse" />}
              </div>
            </div>
          )}
          {gameState.winner && (
            <div className="ttt-status-content winner">
              <TrophyIcon className="ttt-status-icon" />
              <span className="ttt-winner-text">
                {mySymbol && gameState.winner === mySymbol
                  ? 'You Win!'
                  : `${gameState.winner} Wins!`}
              </span>
            </div>
          )}
          {gameState.isDraw && (
            <div className="ttt-status-content draw">
              <span className="ttt-draw-text">It's a Draw!</span>
            </div>
          )}
        </div>

        <div className={`ttt-player-slot ${gameState.turn === O && !gameOver ? 'active-turn' : ''} ${mySymbol === O ? 'is-me' : ''}`}>
          <div className="ttt-symbol o">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="8" />
            </svg>
          </div>
          <div className="ttt-player-info">
            <span className="ttt-player-name">{gameState.oPlayer?.username || 'Waiting...'}</span>
            <span className="ttt-player-label">Player O</span>
          </div>
          {canJoinO && mySymbol !== X && <button className="ttt-join-btn" onClick={() => joinGame(O)}>Join</button>}
          {mySymbol === O && <button className="ttt-leave-btn" onClick={leaveGame}>Leave</button>}
        </div>
      </div>

      <div className="ttt-game-board">
        <div className="ttt-grid">
          {gameState.cells.map((cell, idx) => {
            const isWinning = gameState.winningLine?.includes(idx)
            const isLastPlaced = lastPlacedIdx === idx && cell
            return (
              <button
                key={idx}
                className={[
                  'ttt-cell',
                  cell ? 'filled' : '',
                  isWinning ? 'winning' : '',
                  !cell && isMyTurn && isPlaying && !gameOver ? 'playable' : '',
                  isLastPlaced ? 'last-placed' : ''
                ].filter(Boolean).join(' ')}
                onClick={() => play(idx)}
                disabled={!!cell || !!gameOver || !isPlaying}
                aria-label={cell ? `Cell ${idx + 1}: ${cell}` : `Cell ${idx + 1}: empty`}
              >
                <span className="ttt-cell-content">{renderSymbol(cell)}</span>
              </button>
            )
          })}
          {gameState.winningLine && (
            <svg className="ttt-winning-line" viewBox="0 0 300 300" aria-hidden="true">
              <line
                x1={(() => {
                  const startIdx = gameState.winningLine[0]
                  const col = startIdx % 3
                  return col * 100 + 50
                })()}
                y1={(() => {
                  const startIdx = gameState.winningLine[0]
                  const row = Math.floor(startIdx / 3)
                  return row * 100 + 50
                })()}
                x2={(() => {
                  const endIdx = gameState.winningLine[2]
                  const col = endIdx % 3
                  return col * 100 + 50
                })()}
                y2={(() => {
                  const endIdx = gameState.winningLine[2]
                  const row = Math.floor(endIdx / 3)
                  return row * 100 + 50
                })()}
                stroke="currentColor"
                strokeWidth="6"
                strokeLinecap="round"
              />
            </svg>
          )}
        </div>

        <div className="ttt-controls">
          {gameOver && (
            <button onClick={resetGame} className="ttt-reset-btn ttt-play-again-btn">
              <ArrowPathIcon className="ttt-reset-icon" />
              Play Again
            </button>
          )}
          {!gameOver && (
            <button onClick={resetGame} className="ttt-reset-btn">
              <ArrowPathIcon className="ttt-reset-icon" />
              New Game
            </button>
          )}
          {isPlaying && !gameOver && (
            <div className={`ttt-turn-indicator ${isMyTurn ? 'my-turn' : ''}`}>
              {isMyTurn ? 'Make your move!' : 'Waiting for opponent...'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default TicTacToeActivity
