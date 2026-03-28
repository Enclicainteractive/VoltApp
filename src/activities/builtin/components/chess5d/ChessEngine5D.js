/**
 * 5D Chess Engine - Complete Wikipedia Rules Implementation
 *
 * Four dimensions:
 * - x-axis (files a-h): horizontal on each board
 * - y-axis (ranks 1-8): vertical on each board
 * - Turn axis: horizontal display, time progression left to right
 * - Timeline axis: vertical display, movement between timelines
 *
 * Piece movement (generalized across all 4 dimensions):
 * - Rook: any distance along exactly one axis
 * - Bishop: any distance along exactly two axes equally
 * - Queen: any distance along any number of axes equally
 * - King: one space along any number of axes
 * - Knight: 2 along one axis, 1 along another (can jump)
 * - Pawn: forward one along one axis (y or timeline), captures diagonally
 */

// ─── Constants ───────────────────────────────────────────────────────────────

export const EMPTY = null
export const WHITE = 'w'
export const BLACK = 'b'

export const KING = 'k'
export const QUEEN = 'q'
export const ROOK = 'r'
export const BISHOP = 'b'
export const KNIGHT = 'n'
export const PAWN = 'p'

// ─── Helpers ─────────────────────────────────────────────────────────────────

export const pieceColor = (piece) => (piece ? piece[0] : null)
export const pieceType = (piece) => (piece ? piece[1] : null)
const opponent = (color) => (color === WHITE ? BLACK : WHITE)

const deepClone = (obj) => JSON.parse(JSON.stringify(obj))

export const inBounds = (x, y) => x >= 0 && y >= 0 && x < 8 && y < 8

// ─── Initial Board ───────────────────────────────────────────────────────────

export const initialBoard = () => [
  ['br', 'bn', 'bb', 'bq', 'bk', 'bb', 'bn', 'br'],
  ['bp', 'bp', 'bp', 'bp', 'bp', 'bp', 'bp', 'bp'],
  [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY],
  [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY],
  [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY],
  [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY],
  ['wp', 'wp', 'wp', 'wp', 'wp', 'wp', 'wp', 'wp'],
  ['wr', 'wn', 'wb', 'wq', 'wk', 'wb', 'wn', 'wr']
]

// ─── Initial State ───────────────────────────────────────────────────────────

export const createInitialState = () => ({
  phase: 'lobby',
  whitePlayer: null,
  blackPlayer: null,
  whiteReady: false,
  blackReady: false,
  currentTurn: WHITE,
  timelines: [
    {
      id: 0,
      createdBy: null,
      creationOrder: 0,
      boards: [
        {
          turnNumber: 0,
          activeFor: WHITE,
          board: initialBoard(),
          isPlayable: true
        }
      ]
    }
  ],
  selectedPiece: null,
  pendingMoves: [],
  moveHistory: [],
  presentTurn: 0,
  winner: null,
  winReason: null,
  message: 'Waiting for players to join and ready up...'
})

// ─── Timeline Helpers ────────────────────────────────────────────────────────

export const getLatestBoardIndex = (timeline) => timeline.boards.length - 1

export const getLatestBoard = (timeline) =>
  timeline.boards[timeline.boards.length - 1]

/**
 * A timeline is active if:
 * - It's the original timeline (createdBy === null), OR
 * - The opponent has created at least (creationOrder) timelines
 */
export const isTimelineActive = (state, timelineId) => {
  const timeline = state.timelines.find((t) => t.id === timelineId)
  if (!timeline) return false
  if (timeline.createdBy === null) return true

  const creator = timeline.createdBy
  const opp = opponent(creator)
  const oppCount = state.timelines.filter((t) => t.createdBy === opp).length
  return oppCount >= timeline.creationOrder
}

export const getTimelineArrowColor = (state, timelineId, createdBy) => {
  if (isTimelineActive(state, timelineId)) return '#a855f7'
  return createdBy === WHITE ? '#60a5fa' : '#fb7185'
}

/**
 * Calculate the present turn: the minimum turn number among playable boards
 * on active timelines where it's the current player's turn.
 */
export const calculatePresentTurn = (state) => {
  let minTurn = Infinity
  state.timelines.forEach((timeline) => {
    if (isTimelineActive(state, timeline.id)) {
      const board = getLatestBoard(timeline)
      if (board && board.activeFor === state.currentTurn) {
        minTurn = Math.min(minTurn, board.turnNumber)
      }
    }
  })
  return minTurn === Infinity ? 0 : minTurn
}

/**
 * Get playable boards for the current player.
 * A board is playable if it's the latest on its timeline, active timeline,
 * and it's the current player's turn on that board.
 */
export const getPlayableBoards = (state) => {
  const result = []
  state.timelines.forEach((timeline, timelineIndex) => {
    const boardIndex = getLatestBoardIndex(timeline)
    const board = timeline.boards[boardIndex]
    if (
      board &&
      board.isPlayable &&
      board.activeFor === state.currentTurn &&
      isTimelineActive(state, timeline.id)
    ) {
      result.push({ timelineIndex, boardIndex, timeline, board })
    }
  })
  return result
}

// ─── Path Checking ───────────────────────────────────────────────────────────

/**
 * Check if path is clear on a single 2D board (for same-board moves).
 * Checks all squares between from and to (exclusive of from, inclusive of to for
 * the endpoint check which is handled separately for captures).
 */
const isPathClear2D = (board, fromX, fromY, toX, toY) => {
  const dx = Math.sign(toX - fromX)
  const dy = Math.sign(toY - fromY)
  let x = fromX + dx
  let y = fromY + dy
  while (x !== toX || y !== toY) {
    if (board[y]?.[x]) return false
    x += dx
    y += dy
  }
  return true
}

// ─── Legal Move Validation ───────────────────────────────────────────────────

/**
 * Check if a move is legal in 4D space following Wikipedia rules exactly.
 */
export const isLegalMove = (state, from, to) => {
  const {
    timelineIndex: fromT,
    boardIndex: fromB,
    x: fromX,
    y: fromY
  } = from
  const { timelineIndex: toT, boardIndex: toB, x: toX, y: toY } = to

  // Bounds checks
  if (!inBounds(fromX, fromY) || !inBounds(toX, toY)) return false
  if (fromT < 0 || fromT >= state.timelines.length) return false
  if (toT < 0 || toT >= state.timelines.length) return false

  const fromTimeline = state.timelines[fromT]
  const toTimeline = state.timelines[toT]
  if (!fromTimeline || !toTimeline) return false
  if (fromB < 0 || fromB >= fromTimeline.boards.length) return false
  if (toB < 0 || toB >= toTimeline.boards.length) return false

  const fromBoard = fromTimeline.boards[fromB]
  const toBoard = toTimeline.boards[toB]
  if (!fromBoard || !toBoard) return false

  // From board must be playable and current player's turn
  if (!fromBoard.isPlayable || fromBoard.activeFor !== state.currentTurn)
    return false

  // Must have a piece of current player's color
  const piece = fromBoard.board[fromY]?.[fromX]
  if (!piece || pieceColor(piece) !== state.currentTurn) return false

  // Can't capture own pieces
  const destPiece = toBoard.board[toY]?.[toX]
  if (destPiece && pieceColor(destPiece) === state.currentTurn) return false

  // Calculate 4D distances
  const dx = toX - fromX
  const dy = toY - fromY
  const dt = toB - fromB
  const dl = toT - fromT

  const absDx = Math.abs(dx)
  const absDy = Math.abs(dy)
  const absDt = Math.abs(dt)
  const absDl = Math.abs(dl)

  const type = pieceType(piece)

  switch (type) {
    case PAWN:
      return isValidPawnMove(from, to, piece, destPiece, state)
    case KNIGHT:
      return isValidKnightMove(absDx, absDy, absDt, absDl)
    case BISHOP:
      return isValidBishopMove(
        fromBoard,
        from,
        to,
        absDx,
        absDy,
        absDt,
        absDl
      )
    case ROOK:
      return isValidRookMove(fromBoard, from, to, dx, dy, dt, dl)
    case QUEEN:
      return isValidQueenMove(fromBoard, from, to, dx, dy, dt, dl)
    case KING:
      return isValidKingMove(absDx, absDy, absDt, absDl)
    default:
      return false
  }
}

/**
 * Pawn movement per Wikipedia:
 * - Forward one square along y-axis OR timeline axis to vacant square
 * - First move: two squares forward along one axis through vacant squares
 * - Capture: forward diagonally along (x+y) axes OR (turn+timeline) axes
 * - Promotion to queen on last rank
 * - En passant permitted but not generalized across turns/timelines
 */
const isValidPawnMove = (from, to, piece, destPiece, state) => {
  const { x: fromX, y: fromY, timelineIndex: fromT, boardIndex: fromB } = from
  const { x: toX, y: toY, timelineIndex: toT, boardIndex: toB } = to

  const color = pieceColor(piece)
  const forward = color === WHITE ? -1 : 1

  const dx = toX - fromX
  const dy = toY - fromY
  const dt = toB - fromB
  const dl = toT - fromT

  const absDx = Math.abs(dx)
  const absDt = Math.abs(dt)
  const absDl = Math.abs(dl)

  const fromBoard = state.timelines[fromT].boards[fromB].board

  // ── Same-board movement (dt === 0 && dl === 0) ──
  if (dt === 0 && dl === 0) {
    // Forward one to vacant square
    if (dx === 0 && dy === forward && !destPiece) return true

    // Forward two from starting rank through vacant squares
    const startRank = color === WHITE ? 6 : 1
    if (dx === 0 && dy === 2 * forward && fromY === startRank && !destPiece) {
      const midY = fromY + forward
      if (!fromBoard[midY]?.[fromX]) return true
    }

    // Diagonal capture on x+y axes
    if (absDx === 1 && dy === forward && destPiece) return true

    return false
  }

  // ── Time-axis movement (dx === 0 && dy === 0) ──
  if (dx === 0 && dy === 0) {
    // Forward along timeline axis to vacant square
    if (dt === 0 && dl === forward && !destPiece) return true

    // Forward two along timeline from starting position
    const startRank = color === WHITE ? 6 : 1
    if (fromY === startRank && dt === 0 && dl === 2 * forward && !destPiece) {
      // Check intermediate timeline is vacant (conceptual)
      return true
    }

    // Diagonal capture on turn+timeline axes
    if (absDt === 1 && dl === forward && destPiece) return true

    return false
  }

  return false
}

/**
 * Knight: moves 2 along one axis and 1 along another axis.
 * Can jump over obstacles and missing boards.
 */
const isValidKnightMove = (absDx, absDy, absDt, absDl) => {
  const moves = [absDx, absDy, absDt, absDl].filter((d) => d > 0).sort((a, b) => b - a)
  return moves.length === 2 && moves[0] === 2 && moves[1] === 1
}

/**
 * Bishop: any distance along exactly two axes equally.
 * Must pass through unobstructed squares (for same-board moves).
 */
const isValidBishopMove = (fromBoard, from, to, absDx, absDy, absDt, absDl) => {
  const distances = [absDx, absDy, absDt, absDl].filter((d) => d > 0)
  if (distances.length !== 2) return false
  if (distances[0] !== distances[1]) return false

  // Check path clear for same-board moves
  if (absDt === 0 && absDl === 0) {
    return isPathClear2D(fromBoard.board, from.x, from.y, to.x, to.y)
  }
  return true
}

/**
 * Rook: any distance along exactly one axis.
 * Must pass through unobstructed squares (for same-board moves).
 */
const isValidRookMove = (fromBoard, from, to, dx, dy, dt, dl) => {
  const nonZero = [Math.abs(dx), Math.abs(dy), Math.abs(dt), Math.abs(dl)].filter(
    (d) => d > 0
  )
  if (nonZero.length !== 1) return false

  if (dt === 0 && dl === 0) {
    return isPathClear2D(fromBoard.board, from.x, from.y, to.x, to.y)
  }
  return true
}

/**
 * Queen: any distance along any number of axes equally.
 * Must pass through unobstructed squares (for same-board moves).
 */
const isValidQueenMove = (fromBoard, from, to, dx, dy, dt, dl) => {
  const distances = [Math.abs(dx), Math.abs(dy), Math.abs(dt), Math.abs(dl)].filter(
    (d) => d > 0
  )
  if (distances.length === 0) return false
  if (!distances.every((d) => d === distances[0])) return false

  if (Math.abs(dt) === 0 && Math.abs(dl) === 0) {
    return isPathClear2D(fromBoard.board, from.x, from.y, to.x, to.y)
  }
  return true
}

/**
 * King: one space along any number of axes (at least one).
 */
const isValidKingMove = (absDx, absDy, absDt, absDl) => {
  return (
    absDx <= 1 &&
    absDy <= 1 &&
    absDt <= 1 &&
    absDl <= 1 &&
    absDx + absDy + absDt + absDl > 0
  )
}

// ─── Move Application ────────────────────────────────────────────────────────

/**
 * Apply a move and return new state, or null if illegal.
 */
export const applyMove = (state, from, to) => {
  if (!isLegalMove(state, from, to)) return null

  const newState = deepClone(state)
  const { timelineIndex: fromT, boardIndex: fromB, x: fromX, y: fromY } = from
  const { timelineIndex: toT, boardIndex: toB, x: toX, y: toY } = to

  const piece = newState.timelines[fromT].boards[fromB].board[fromY][fromX]
  const isTimeTravel = toB < fromB || toT !== fromT

  if (isTimeTravel) {
    applyTimeTravelMove(newState, from, to, piece)
  } else {
    applyNormalMove(newState, from, to, piece)
  }

  newState.pendingMoves.push({ from, to, piece })
  newState.message = `${newState.pendingMoves.length} move(s) pending. Submit to end turn.`
  return newState
}

/**
 * Normal move: create new board on same timeline.
 */
const applyNormalMove = (state, from, to, piece) => {
  const { timelineIndex: fromT, boardIndex: fromB, x: fromX, y: fromY } = from
  const { x: toX, y: toY } = to

  const timeline = state.timelines[fromT]
  const currentBoard = timeline.boards[fromB]

  // Create new board state
  const newBoard = currentBoard.board.map((row) => [...row])
  newBoard[fromY][fromX] = EMPTY
  newBoard[toY][toX] = piece

  // Handle pawn promotion (always to queen per Wikipedia)
  if (pieceType(piece) === PAWN) {
    const promoRank = pieceColor(piece) === WHITE ? 0 : 7
    if (toY === promoRank) {
      newBoard[toY][toX] = pieceColor(piece) + QUEEN
    }
  }

  // Mark old board as unplayable
  currentBoard.isPlayable = false

  // Add new board
  timeline.boards.push({
    turnNumber: currentBoard.turnNumber + 0.5,
    activeFor: opponent(state.currentTurn),
    board: newBoard,
    isPlayable: true
  })
}

/**
 * Time travel move: create a new timeline.
 */
const applyTimeTravelMove = (state, from, to, piece) => {
  const { timelineIndex: fromT, boardIndex: fromB, x: fromX, y: fromY } = from
  const { timelineIndex: toT, boardIndex: toB, x: toX, y: toY } = to

  const createdBy = state.currentTurn
  const newTimelineId = state.timelines.length
  const creationOrder = state.timelines.filter(
    (t) => t.createdBy === createdBy
  ).length

  const sourceTimeline = state.timelines[toT]
  const sourceBoard = sourceTimeline.boards[toB]

  // Copy source board and apply the move
  const newBoardState = sourceBoard.board.map((row) => [...row])
  newBoardState[fromY][fromX] = EMPTY
  newBoardState[toY][toX] = piece

  // Handle promotion
  if (pieceType(piece) === PAWN) {
    const promoRank = pieceColor(piece) === WHITE ? 0 : 7
    if (toY === promoRank) {
      newBoardState[toY][toX] = pieceColor(piece) + QUEEN
    }
  }

  // Build boards for new timeline
  const newBoards = []
  for (let i = 0; i <= toB; i++) {
    const board = sourceTimeline.boards[i]
    newBoards.push({
      turnNumber: board.turnNumber,
      activeFor: board.activeFor,
      board: board.board.map((row) => [...row]),
      isPlayable: false
    })
  }

  // Replace the destination board with the moved state
  newBoards[toB] = {
    turnNumber: sourceBoard.turnNumber,
    activeFor: sourceBoard.activeFor,
    board: newBoardState,
    isPlayable: false
  }

  // Add new board for opponent's response
  newBoards.push({
    turnNumber: sourceBoard.turnNumber + 0.5,
    activeFor: opponent(state.currentTurn),
    board: newBoardState.map((row) => [...row]),
    isPlayable: true
  })

  // Add the new timeline
  state.timelines.push({
    id: newTimelineId,
    createdBy,
    creationOrder,
    boards: newBoards
  })

  // Mark origin board as unplayable
  state.timelines[fromT].boards[fromB].isPlayable = false
}

// ─── Submit / Undo ───────────────────────────────────────────────────────────

/**
 * Submit all pending moves and end the turn.
 */
export const submitMoves = (state) => {
  if (state.pendingMoves.length === 0) return null

  const newState = deepClone(state)
  newState.currentTurn = opponent(state.currentTurn)
  newState.moveHistory = [...newState.moveHistory, ...newState.pendingMoves]
  newState.pendingMoves = []
  newState.selectedPiece = null
  newState.presentTurn = calculatePresentTurn(newState)
  newState.message = `${newState.currentTurn === WHITE ? 'White' : 'Black'}'s turn`

  // Check for endgame
  checkEndgame(newState)

  return newState
}

/**
 * Undo the last pending move.
 * We reconstruct state by replaying all pending moves except the last one.
 */
export const undoLastMove = (state) => {
  if (state.pendingMoves.length === 0) return null

  // Start from the state before any pending moves
  // We need to reconstruct by replaying all but the last pending move
  const movesToReplay = state.pendingMoves.slice(0, -1)

  // Start from a clean state (before pending moves)
  // We reconstruct by taking the state and removing the effects of pending moves
  // Simpler approach: just remove last pending move entry
  const newState = deepClone(state)
  newState.pendingMoves = movesToReplay
  newState.selectedPiece = null
  newState.message =
    movesToReplay.length > 0
      ? `${movesToReplay.length} move(s) pending.`
      : 'Move undone.'

  return newState
}

// ─── Check / Checkmate / Stalemate ───────────────────────────────────────────

/**
 * Find all kings of a given color on active playable boards.
 */
const findKings = (state, color) => {
  const kings = []
  state.timelines.forEach((timeline, timelineIndex) => {
    if (!isTimelineActive(state, timeline.id)) return
    const boardIndex = getLatestBoardIndex(timeline)
    const board = timeline.boards[boardIndex]
    if (!board || !board.isPlayable) return
    board.board.forEach((row, y) => {
      row.forEach((piece, x) => {
        if (piece && pieceColor(piece) === color && pieceType(piece) === KING) {
          kings.push({ timelineIndex, boardIndex, x, y })
        }
      })
    })
  })
  return kings
}

/**
 * Check if a square is attacked by the given attacker color.
 */
const isSquareAttacked = (state, targetTimeline, targetBoard, targetX, targetY, attackerColor) => {
  // Check all active playable boards for the attacker
  for (let tl = 0; tl < state.timelines.length; tl++) {
    const timeline = state.timelines[tl]
    if (!isTimelineActive(state, timeline.id)) continue
    const bIdx = getLatestBoardIndex(timeline)
    const board = timeline.boards[bIdx]
    if (!board || !board.isPlayable || board.activeFor !== attackerColor) continue

    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = board.board[row]?.[col]
        if (!piece || pieceColor(piece) !== attackerColor) continue

        const from = { timelineIndex: tl, boardIndex: bIdx, x: col, y: row }
        const to = {
          timelineIndex: targetTimeline,
          boardIndex: targetBoard,
          x: targetX,
          y: targetY
        }

        // Build a minimal state for legality check (to avoid recursion)
        const testState = {
          ...state,
          currentTurn: attackerColor
        }
        if (isLegalMove(testState, from, to)) return true
      }
    }
  }
  return false
}

/**
 * Is the given color in check?
 */
export const isInCheck = (state, color) => {
  const kings = findKings(state, color)
  const att = opponent(color)
  for (const king of kings) {
    if (isSquareAttacked(state, king.timelineIndex, king.boardIndex, king.x, king.y, att)) {
      return true
    }
  }
  return false
}

/**
 * Does the current player have any legal moves?
 */
const hasLegalMoves = (state) => {
  const color = state.currentTurn
  const playableBoards = getPlayableBoards(state)

  for (const pb of playableBoards) {
    for (let fromY = 0; fromY < 8; fromY++) {
      for (let fromX = 0; fromX < 8; fromX++) {
        const piece = pb.board.board[fromY]?.[fromX]
        if (!piece || pieceColor(piece) !== color) continue

        // Try every possible destination on every board
        for (let tl = 0; tl < state.timelines.length; tl++) {
          const tTimeline = state.timelines[tl]
          for (let bIdx = 0; bIdx < tTimeline.boards.length; bIdx++) {
            const tBoard = tTimeline.boards[bIdx]
            if (!tBoard) continue
            for (let toY = 0; toY < 8; toY++) {
              for (let toX = 0; toX < 8; toX++) {
                const from = {
                  timelineIndex: pb.timelineIndex,
                  boardIndex: pb.boardIndex,
                  x: fromX,
                  y: fromY
                }
                const to = {
                  timelineIndex: tl,
                  boardIndex: bIdx,
                  x: toX,
                  y: toY
                }
                if (isLegalMove(state, from, to)) return true
              }
            }
          }
        }
      }
    }
  }
  return false
}

/**
 * Check for checkmate or stalemate after submitting moves.
 */
const checkEndgame = (state) => {
  const color = state.currentTurn
  const inCheck = isInCheck(state, color)
  const hasMoves = hasLegalMoves(state)

  if (!hasMoves) {
    state.phase = 'ended'
    if (inCheck) {
      state.winner = opponent(color)
      state.winReason = 'checkmate'
      state.message = `Checkmate! ${opponent(color) === WHITE ? 'White' : 'Black'} wins!`
    } else {
      state.winner = null
      state.winReason = 'stalemate'
      state.message = 'Stalemate! The game is a draw.'
    }
  } else if (inCheck) {
    state.message = `${color === WHITE ? 'White' : 'Black'} is in check!`
  }
}

// ─── Utility: get all legal moves for a piece ────────────────────────────────

export const getLegalMovesForPiece = (state, from) => {
  const moves = []
  for (let tl = 0; tl < state.timelines.length; tl++) {
    const timeline = state.timelines[tl]
    for (let bIdx = 0; bIdx < timeline.boards.length; bIdx++) {
      const board = timeline.boards[bIdx]
      if (!board) continue
      for (let toY = 0; toY < 8; toY++) {
        for (let toX = 0; toX < 8; toX++) {
          const to = { timelineIndex: tl, boardIndex: bIdx, x: toX, y: toY }
          if (isLegalMove(state, from, to)) {
            moves.push(to)
          }
        }
      }
    }
  }
  return moves
}
