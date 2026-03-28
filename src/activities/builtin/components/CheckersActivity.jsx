import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const BOARD_SIZE = 8
const RED = 'red'
const BLACK = 'black'
const STORAGE_KEY = 'checkers'

const makeInitialBoard = () => {
  const board = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null))

  for (let y = 0; y < 3; y += 1) {
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      if ((x + y) % 2 === 1) board[y][x] = BLACK
    }
  }

  for (let y = 5; y < BOARD_SIZE; y += 1) {
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      if ((x + y) % 2 === 1) board[y][x] = RED
    }
  }

  return board
}

const createInitialState = () => ({
  board: makeInitialBoard(),
  turn: RED,
  redPlayer: null,
  blackPlayer: null,
  spectators: [],
  winner: null,
  status: 'waiting',
  forcedPiece: null,
  lastMove: null,
  moveCount: 0
})

const cloneBoard = (board) => board.map((row) => [...row])
const inBounds = (x, y) => x >= 0 && y >= 0 && x < BOARD_SIZE && y < BOARD_SIZE
const isDarkSquare = (x, y) => (x + y) % 2 === 1
const pieceColor = (piece) => (piece ? (piece.startsWith(RED) ? RED : BLACK) : null)
const isKing = (piece) => piece === `${RED}-king` || piece === `${BLACK}-king`
const makeKing = (color) => `${color}-king`
const otherColor = (color) => (color === RED ? BLACK : RED)
const samePos = (a, b) => a && b && a.x === b.x && a.y === b.y

const sanitizePlayer = (player) => {
  if (!player || typeof player !== 'object' || !player.id) return null
  return {
    id: String(player.id),
    username: String(player.username || 'Player')
  }
}

const sanitizeSpectators = (spectators, redPlayer, blackPlayer) => {
  if (!Array.isArray(spectators)) return []

  const seen = new Set()
  return spectators
    .map(sanitizePlayer)
    .filter(Boolean)
    .filter((player) => player.id !== redPlayer?.id && player.id !== blackPlayer?.id)
    .filter((player) => {
      if (seen.has(player.id)) return false
      seen.add(player.id)
      return true
    })
}

const sanitizeBoard = (board) => {
  if (!Array.isArray(board) || board.length !== BOARD_SIZE) return null

  const nextBoard = board.map((row) => {
    if (!Array.isArray(row) || row.length !== BOARD_SIZE) return null
    return row.map((cell) => {
      if (cell == null) return null
      if (
        cell === RED ||
        cell === BLACK ||
        cell === `${RED}-king` ||
        cell === `${BLACK}-king`
      ) {
        return cell
      }
      return null
    })
  })

  return nextBoard.some((row) => !row) ? null : nextBoard
}

const sanitizeCoord = (coord) => {
  if (!coord || typeof coord !== 'object') return null
  const x = Number(coord.x)
  const y = Number(coord.y)
  return inBounds(x, y) ? { x, y } : null
}

const sanitizeState = (rawState) => {
  const base = createInitialState()
  const incoming = rawState && typeof rawState === 'object' ? rawState : {}
  const redPlayer = sanitizePlayer(incoming.redPlayer)
  const blackPlayer = sanitizePlayer(incoming.blackPlayer)

  return {
    board: sanitizeBoard(incoming.board) || base.board,
    turn: incoming.turn === BLACK ? BLACK : RED,
    redPlayer,
    blackPlayer,
    spectators: sanitizeSpectators(incoming.spectators, redPlayer, blackPlayer),
    winner: incoming.winner === RED || incoming.winner === BLACK ? incoming.winner : null,
    status: typeof incoming.status === 'string' ? incoming.status : base.status,
    forcedPiece: sanitizeCoord(incoming.forcedPiece),
    lastMove:
      incoming.lastMove &&
      typeof incoming.lastMove === 'object' &&
      sanitizeCoord(incoming.lastMove.from) &&
      sanitizeCoord(incoming.lastMove.to)
        ? {
            from: sanitizeCoord(incoming.lastMove.from),
            to: sanitizeCoord(incoming.lastMove.to),
            capture: Boolean(incoming.lastMove.capture),
            promotion: Boolean(incoming.lastMove.promotion)
          }
        : null,
    moveCount: Number.isFinite(incoming.moveCount) ? Number(incoming.moveCount) : 0
  }
}

const getDirections = (piece) => {
  if (isKing(piece)) {
    return [
      { dx: -1, dy: -1 },
      { dx: 1, dy: -1 },
      { dx: -1, dy: 1 },
      { dx: 1, dy: 1 }
    ]
  }

  return pieceColor(piece) === RED
    ? [
        { dx: -1, dy: -1 },
        { dx: 1, dy: -1 }
      ]
    : [
        { dx: -1, dy: 1 },
        { dx: 1, dy: 1 }
      ]
}

const getPieceMoves = (board, x, y) => {
  const piece = board[y]?.[x]
  if (!piece) return []

  const color = pieceColor(piece)
  const moves = []

  for (const { dx, dy } of getDirections(piece)) {
    const nx = x + dx
    const ny = y + dy

    if (inBounds(nx, ny) && isDarkSquare(nx, ny) && !board[ny][nx]) {
      moves.push({
        from: { x, y },
        to: { x: nx, y: ny },
        capture: null
      })
    }

    const cx = x + dx * 2
    const cy = y + dy * 2
    const jumped = inBounds(nx, ny) ? board[ny][nx] : null
    if (
      inBounds(cx, cy) &&
      isDarkSquare(cx, cy) &&
      !board[cy][cx] &&
      jumped &&
      pieceColor(jumped) === otherColor(color)
    ) {
      moves.push({
        from: { x, y },
        to: { x: cx, y: cy },
        capture: { x: nx, y: ny }
      })
    }
  }

  return moves
}

const getAllMoves = (board, color) => {
  const moves = []
  for (let y = 0; y < BOARD_SIZE; y += 1) {
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      if (pieceColor(board[y][x]) === color) {
        moves.push(...getPieceMoves(board, x, y))
      }
    }
  }
  return moves
}

const getCaptureMoves = (board, color) => getAllMoves(board, color).filter((move) => move.capture)

const countPieces = (board, color) => {
  let total = 0
  for (let y = 0; y < BOARD_SIZE; y += 1) {
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      if (pieceColor(board[y][x]) === color) total += 1
    }
  }
  return total
}

const deriveStatus = (state) => {
  if (state.winner) return 'finished'
  if (!state.redPlayer || !state.blackPlayer) return 'waiting'
  return 'playing'
}

const getSeatForUser = (state, userId) => {
  if (!userId) return null
  if (state.redPlayer?.id === userId) return RED
  if (state.blackPlayer?.id === userId) return BLACK
  return null
}

const upsertSpectator = (spectators, player) => {
  const safePlayer = sanitizePlayer(player)
  if (!safePlayer) return spectators
  const next = spectators.filter((spectator) => spectator.id !== safePlayer.id)
  next.push(safePlayer)
  return next
}

const removeSpectator = (spectators, playerId) => spectators.filter((spectator) => spectator.id !== playerId)

const applyMoveToState = (state, move) => {
  const board = cloneBoard(state.board)
  const piece = board[move.from.y][move.from.x]
  if (!piece) return null

  board[move.from.y][move.from.x] = null
  if (move.capture) board[move.capture.y][move.capture.x] = null

  let movedPiece = piece
  let promotion = false
  if (!isKing(piece)) {
    if (pieceColor(piece) === RED && move.to.y === 0) {
      movedPiece = makeKing(RED)
      promotion = true
    } else if (pieceColor(piece) === BLACK && move.to.y === BOARD_SIZE - 1) {
      movedPiece = makeKing(BLACK)
      promotion = true
    }
  }

  board[move.to.y][move.to.x] = movedPiece

  const samePieceCaptures = move.capture
    ? getPieceMoves(board, move.to.x, move.to.y).filter((candidate) => candidate.capture)
    : []

  const nextTurn = samePieceCaptures.length > 0 ? state.turn : otherColor(state.turn)
  const opponent = otherColor(state.turn)

  const nextState = {
    ...state,
    board,
    turn: nextTurn,
    forcedPiece: samePieceCaptures.length > 0 ? { x: move.to.x, y: move.to.y } : null,
    lastMove: {
      from: move.from,
      to: move.to,
      capture: Boolean(move.capture),
      promotion
    },
    moveCount: state.moveCount + 1,
    winner: null
  }

  if (countPieces(board, opponent) === 0) {
    nextState.winner = state.turn
    nextState.forcedPiece = null
  } else if (samePieceCaptures.length === 0) {
    const opponentMoves = getAllMoves(board, opponent)
    if (opponentMoves.length === 0) nextState.winner = state.turn
  }

  nextState.status = deriveStatus(nextState)
  return nextState
}

const styles = {
  shell: {
    minHeight: '100%',
    padding: 20,
    color: '#ecf3ff',
    background:
      'radial-gradient(circle at top, rgba(91, 33, 182, 0.14), transparent 28%), linear-gradient(180deg, #0f172a 0%, #111827 100%)',
    boxSizing: 'border-box'
  },
  layout: {
    maxWidth: 1200,
    margin: '0 auto',
    display: 'grid',
    gridTemplateColumns: 'minmax(280px, 360px) minmax(0, 1fr)',
    gap: 20
  },
  panel: {
    background: 'rgba(15, 23, 42, 0.82)',
    border: '1px solid rgba(148, 163, 184, 0.18)',
    borderRadius: 24,
    padding: 18,
    backdropFilter: 'blur(10px)',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.28)'
  },
  title: { margin: 0, fontSize: 30, letterSpacing: '-0.04em' },
  kicker: {
    margin: '0 0 8px',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.16em',
    color: '#fca5a5',
    fontWeight: 700
  },
  muted: { color: '#94a3b8', fontSize: 13, lineHeight: 1.45 },
  boardWrap: {
    ...{
      background: 'rgba(15, 23, 42, 0.82)',
      border: '1px solid rgba(148, 163, 184, 0.18)',
      borderRadius: 24,
      padding: 18,
      boxShadow: '0 20px 60px rgba(0, 0, 0, 0.28)'
    }
  },
  board: {
    width: '100%',
    aspectRatio: '1 / 1',
    display: 'grid',
    gridTemplateColumns: 'repeat(8, 1fr)',
    borderRadius: 20,
    overflow: 'hidden',
    border: '1px solid rgba(255, 255, 255, 0.08)'
  },
  row: { display: 'grid', gap: 12, marginTop: 12 },
  seat: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: 12,
    borderRadius: 16,
    border: '1px solid rgba(148, 163, 184, 0.18)',
    background: 'rgba(30, 41, 59, 0.72)'
  },
  button: {
    border: 0,
    borderRadius: 12,
    padding: '10px 14px',
    font: 'inherit',
    fontWeight: 700,
    cursor: 'pointer',
    color: '#f8fafc',
    background: 'linear-gradient(135deg, #dc2626, #f97316)'
  },
  secondaryButton: {
    border: '1px solid rgba(148, 163, 184, 0.24)',
    borderRadius: 12,
    padding: '10px 14px',
    font: 'inherit',
    fontWeight: 700,
    cursor: 'pointer',
    color: '#e2e8f0',
    background: 'rgba(30, 41, 59, 0.88)'
  },
  statGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 12,
    marginTop: 12
  },
  stat: {
    padding: 12,
    borderRadius: 16,
    background: 'rgba(30, 41, 59, 0.72)',
    border: '1px solid rgba(148, 163, 184, 0.14)'
  }
}

const CheckerPiece = ({ piece, selected }) => {
  const color = pieceColor(piece)
  const king = isKing(piece)
  const gradient =
    color === RED
      ? 'radial-gradient(circle at 30% 30%, #fca5a5, #dc2626 58%, #7f1d1d 100%)'
      : 'radial-gradient(circle at 30% 30%, #e5e7eb, #475569 54%, #0f172a 100%)'

  return (
    <div
      style={{
        width: '72%',
        height: '72%',
        borderRadius: '50%',
        background: gradient,
        border: '2px solid rgba(255,255,255,0.24)',
        boxShadow: selected
          ? '0 0 0 4px rgba(250, 204, 21, 0.45), inset 0 4px 10px rgba(255,255,255,0.24)'
          : 'inset 0 4px 10px rgba(255,255,255,0.18), 0 8px 18px rgba(0,0,0,0.28)',
        display: 'grid',
        placeItems: 'center',
        transform: selected ? 'scale(1.05)' : 'scale(1)'
      }}
    >
      {king ? (
        <div
          style={{
            width: '56%',
            height: '56%',
            borderRadius: '50%',
            border: '2px solid rgba(255,255,255,0.82)',
            color: '#fde68a',
            display: 'grid',
            placeItems: 'center',
            fontSize: 14,
            fontWeight: 800,
            background: 'rgba(255,255,255,0.08)'
          }}
        >
          K
        </div>
      ) : null}
    </div>
  )
}

const CheckersActivity = ({ sdk, currentUser, activityDefinition }) => {
  const [gameState, setGameState] = useState(() => createInitialState())
  const [selected, setSelected] = useState(null)
  const [error, setError] = useState('')

  const stateRef = useRef(gameState)
  stateRef.current = gameState

  useEffect(() => {
    if (!sdk?.subscribeServerState) return undefined

    const offState = sdk.subscribeServerState((serverState) => {
      const nextState = sanitizeState(serverState?.[STORAGE_KEY])
      stateRef.current = nextState
      setGameState(nextState)
    })

    return () => offState?.()
  }, [sdk])

  const pushState = useCallback(
    (nextState, cue = 'game_update') => {
      const sanitized = sanitizeState(nextState)
      stateRef.current = sanitized
      setGameState(sanitized)
      sdk.updateState({ [STORAGE_KEY]: sanitized }, { serverRelay: true, cue })
    },
    [sdk]
  )

  useEffect(() => {
    if (!sdk?.updateState) return
    if (stateRef.current?.board?.length) return
    pushState(createInitialState(), 'game_start')
  }, [sdk, pushState])

  useEffect(() => {
    if (!currentUser?.id || !sdk?.updateState) return

    const current = stateRef.current
    const userId = String(currentUser.id)
    const alreadyKnown =
      current.redPlayer?.id === userId ||
      current.blackPlayer?.id === userId ||
      current.spectators.some((spectator) => spectator.id === userId)

    if (alreadyKnown) return

    const nextState = {
      ...current,
      spectators: upsertSpectator(current.spectators, currentUser)
    }
    nextState.status = deriveStatus(nextState)
    pushState(nextState, 'player_join')
  }, [currentUser, sdk, pushState])

  const mySeat = useMemo(() => getSeatForUser(gameState, currentUser?.id ? String(currentUser.id) : null), [gameState, currentUser?.id])
  const isSpectator = !mySeat
  const captureMovesForTurn = useMemo(() => getCaptureMoves(gameState.board, gameState.turn), [gameState.board, gameState.turn])

  const setIssue = useCallback((message) => {
    setError(message)
    window.clearTimeout(setIssue.timeoutId)
    setIssue.timeoutId = window.setTimeout(() => setError(''), 2200)
  }, [])
  setIssue.timeoutId = setIssue.timeoutId || null

  const joinSeat = useCallback(
    (color) => {
      if (!currentUser?.id) return

      const current = stateRef.current
      const userId = String(currentUser.id)
      const targetKey = color === RED ? 'redPlayer' : 'blackPlayer'
      const otherKey = color === RED ? 'blackPlayer' : 'redPlayer'

      if (current[targetKey] && current[targetKey].id !== userId) {
        setIssue('That seat is already taken.')
        return
      }

      const nextState = {
        ...current,
        [targetKey]: sanitizePlayer(currentUser),
        [otherKey]: current[otherKey],
        spectators: removeSpectator(current.spectators, userId)
      }

      if (mySeat && mySeat !== color) {
        const previousKey = mySeat === RED ? 'redPlayer' : 'blackPlayer'
        nextState[previousKey] = null
      }

      nextState.status = deriveStatus(nextState)
      pushState(nextState, 'player_join')
      setSelected(null)
    },
    [currentUser, mySeat, pushState, setIssue]
  )

  const leaveSeat = useCallback(() => {
    if (!currentUser?.id || !mySeat) return

    const current = stateRef.current
    const userId = String(currentUser.id)
    const key = mySeat === RED ? 'redPlayer' : 'blackPlayer'
    const nextState = {
      ...current,
      [key]: null,
      spectators: upsertSpectator(current.spectators, currentUser),
      status: 'waiting',
      winner: null,
      forcedPiece: null
    }

    pushState(nextState, 'player_leave')
    setSelected(null)
  }, [currentUser, mySeat, pushState])

  const resetGame = useCallback(() => {
    const current = stateRef.current
    const nextState = {
      ...createInitialState(),
      redPlayer: current.redPlayer,
      blackPlayer: current.blackPlayer,
      spectators: current.spectators
    }
    nextState.status = deriveStatus(nextState)
    pushState(nextState, 'round_start')
    setSelected(null)
  }, [pushState])

  const attemptMove = useCallback(
    (from, to) => {
      const current = stateRef.current
      const seat = getSeatForUser(current, currentUser?.id ? String(currentUser.id) : null)
      if (!seat) {
        setIssue('Spectators cannot move pieces.')
        return
      }
      if (current.winner) {
        setIssue('Reset the board to start a new round.')
        return
      }
      if (current.status !== 'playing') {
        setIssue('Both seats must be filled before play starts.')
        return
      }
      if (current.turn !== seat) {
        setIssue('It is not your turn.')
        return
      }
      if (current.forcedPiece && !samePos(current.forcedPiece, from)) {
        setIssue('You must continue the capture chain with the highlighted piece.')
        return
      }

      const piece = current.board[from.y]?.[from.x]
      if (!piece || pieceColor(piece) !== seat) {
        setIssue('Select one of your own pieces.')
        return
      }

      const legalMoves = getPieceMoves(current.board, from.x, from.y)
      const mustCapture = getCaptureMoves(current.board, seat)
      const move = legalMoves.find((candidate) => candidate.to.x === to.x && candidate.to.y === to.y)

      if (!move) {
        setIssue('That move is not legal.')
        return
      }
      if (mustCapture.length > 0 && !move.capture) {
        setIssue('A capture is available. You must take it.')
        return
      }

      const nextState = applyMoveToState(current, move)
      if (!nextState) {
        setIssue('Move failed.')
        return
      }

      pushState(nextState, move.capture ? 'piece_capture' : 'piece_move')
      if (nextState.forcedPiece && nextState.turn === seat) {
        setSelected(nextState.forcedPiece)
      } else {
        setSelected(null)
      }
    },
    [currentUser?.id, pushState, setIssue]
  )

  const legalMovesForSelected = useMemo(() => {
    if (!selected) return []
    const current = stateRef.current
    const seat = getSeatForUser(current, currentUser?.id ? String(currentUser.id) : null)
    if (!seat || current.turn !== seat) return []
    const allCaptures = getCaptureMoves(current.board, seat)
    return getPieceMoves(current.board, selected.x, selected.y).filter((move) => {
      if (!current.forcedPiece || samePos(current.forcedPiece, selected)) {
        return allCaptures.length === 0 || Boolean(move.capture)
      }
      return false
    })
  }, [selected, currentUser?.id, gameState.board, gameState.turn, gameState.forcedPiece])

  const onSquareClick = useCallback(
    (x, y) => {
      const current = stateRef.current
      const seat = getSeatForUser(current, currentUser?.id ? String(currentUser.id) : null)
      const piece = current.board[y]?.[x]

      if (selected) {
        const targetMove = legalMovesForSelected.find((move) => move.to.x === x && move.to.y === y)
        if (targetMove) {
          attemptMove(selected, { x, y })
          return
        }
      }

      if (!seat) {
        setSelected(null)
        return
      }

      if (piece && pieceColor(piece) === seat) {
        if (current.turn !== seat) {
          setIssue('Wait for your turn.')
          return
        }
        if (current.forcedPiece && !samePos(current.forcedPiece, { x, y })) {
          setIssue('You must keep moving the forced piece.')
          return
        }
        setSelected({ x, y })
        return
      }

      setSelected(null)
    },
    [attemptMove, currentUser?.id, legalMovesForSelected, selected, setIssue]
  )

  const statusText = useMemo(() => {
    if (gameState.winner) {
      return `${gameState.winner === RED ? 'Red' : 'Black'} wins`
    }
    if (gameState.status === 'waiting') return 'Waiting for two players'
    if (gameState.forcedPiece) return `${gameState.turn === RED ? 'Red' : 'Black'} must continue capturing`
    return `${gameState.turn === RED ? 'Red' : 'Black'} to move`
  }, [gameState])

  const spectatorNames = gameState.spectators.map((spectator) => spectator.username).join(', ')

  return (
    <div style={styles.shell}>
      <div style={styles.layout}>
        <aside style={styles.panel}>
          <p style={styles.kicker}>{activityDefinition?.name || 'Checkers'}</p>
          <h2 style={styles.title}>Multiplayer Checkers</h2>
          <p style={styles.muted}>
            Shared server state drives the board. Two players can take seats, everyone else watches as a spectator.
          </p>

          <div style={styles.row}>
            <div style={styles.seat}>
              <div>
                <strong style={{ display: 'block', marginBottom: 4, color: '#fecaca' }}>Red</strong>
                <span style={styles.muted}>{gameState.redPlayer?.username || 'Open seat'}</span>
              </div>
              {mySeat === RED ? (
                <button type="button" style={styles.secondaryButton} onClick={leaveSeat}>Leave</button>
              ) : (
                <button type="button" style={styles.button} onClick={() => joinSeat(RED)} disabled={Boolean(gameState.redPlayer && gameState.redPlayer.id !== currentUser?.id)}>
                  Join
                </button>
              )}
            </div>

            <div style={styles.seat}>
              <div>
                <strong style={{ display: 'block', marginBottom: 4, color: '#e2e8f0' }}>Black</strong>
                <span style={styles.muted}>{gameState.blackPlayer?.username || 'Open seat'}</span>
              </div>
              {mySeat === BLACK ? (
                <button type="button" style={styles.secondaryButton} onClick={leaveSeat}>Leave</button>
              ) : (
                <button type="button" style={styles.button} onClick={() => joinSeat(BLACK)} disabled={Boolean(gameState.blackPlayer && gameState.blackPlayer.id !== currentUser?.id)}>
                  Join
                </button>
              )}
            </div>
          </div>

          <div style={styles.statGrid}>
            <div style={styles.stat}>
              <div style={styles.muted}>Status</div>
              <div style={{ marginTop: 4, fontWeight: 800 }}>{statusText}</div>
            </div>
            <div style={styles.stat}>
              <div style={styles.muted}>You</div>
              <div style={{ marginTop: 4, fontWeight: 800 }}>
                {mySeat ? (mySeat === RED ? 'Playing Red' : 'Playing Black') : 'Spectating'}
              </div>
            </div>
            <div style={styles.stat}>
              <div style={styles.muted}>Moves</div>
              <div style={{ marginTop: 4, fontWeight: 800 }}>{gameState.moveCount}</div>
            </div>
            <div style={styles.stat}>
              <div style={styles.muted}>Spectators</div>
              <div style={{ marginTop: 4, fontWeight: 800 }}>{gameState.spectators.length}</div>
            </div>
          </div>

          <div style={{ ...styles.stat, marginTop: 12 }}>
            <div style={styles.muted}>Rules</div>
            <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.5 }}>
              Pieces move diagonally on dark squares. Captures are mandatory. Kings move and capture both directions.
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
            <button type="button" style={styles.secondaryButton} onClick={resetGame}>Reset</button>
          </div>

          <div style={{ ...styles.stat, marginTop: 12 }}>
            <div style={styles.muted}>Spectators</div>
            <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.5 }}>
              {spectatorNames || 'No spectators yet'}
            </div>
          </div>

          {error ? (
            <div style={{ marginTop: 12, borderRadius: 14, padding: '12px 14px', background: 'rgba(127, 29, 29, 0.32)', border: '1px solid rgba(248, 113, 113, 0.26)', color: '#fecaca', fontSize: 13 }}>
              {error}
            </div>
          ) : null}

          {isSpectator ? (
            <p style={{ ...styles.muted, marginTop: 12 }}>
              You are spectating. Join a seat to play.
            </p>
          ) : null}
        </aside>

        <section style={styles.boardWrap}>
          <div style={styles.board}>
            {gameState.board.flatMap((row, y) =>
              row.map((piece, x) => {
                const isSelected = selected?.x === x && selected?.y === y
                const isForced = gameState.forcedPiece?.x === x && gameState.forcedPiece?.y === y
                const isLastFrom = gameState.lastMove?.from?.x === x && gameState.lastMove?.from?.y === y
                const isLastTo = gameState.lastMove?.to?.x === x && gameState.lastMove?.to?.y === y
                const moveHint = legalMovesForSelected.find((move) => move.to.x === x && move.to.y === y)

                return (
                  <button
                    key={`${x}:${y}`}
                    type="button"
                    onClick={() => onSquareClick(x, y)}
                    style={{
                      position: 'relative',
                      display: 'grid',
                      placeItems: 'center',
                      border: 0,
                      padding: 0,
                      cursor: 'pointer',
                      background: isDarkSquare(x, y) ? '#7c3f1d' : '#f4d7b6',
                      boxShadow: isLastTo
                        ? 'inset 0 0 0 3px rgba(74, 222, 128, 0.7)'
                        : isLastFrom
                          ? 'inset 0 0 0 3px rgba(248, 113, 113, 0.6)'
                          : isSelected
                            ? 'inset 0 0 0 4px rgba(250, 204, 21, 0.9)'
                            : isForced
                              ? 'inset 0 0 0 4px rgba(56, 189, 248, 0.9)'
                              : 'none'
                    }}
                    aria-label={`Square ${x + 1},${y + 1}`}
                  >
                    {moveHint ? (
                      <div
                        style={{
                          position: 'absolute',
                          width: moveHint.capture ? '44%' : '22%',
                          height: moveHint.capture ? '44%' : '22%',
                          borderRadius: '50%',
                          background: moveHint.capture ? 'rgba(248, 113, 113, 0.7)' : 'rgba(15, 23, 42, 0.26)',
                          border: moveHint.capture ? '2px solid rgba(255,255,255,0.45)' : 'none'
                        }}
                      />
                    ) : null}
                    {piece ? <CheckerPiece piece={piece} selected={isSelected} /> : null}
                  </button>
                )
              })
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

export default CheckersActivity
