import { getMiniGolfCourse, getMiniGolfHole } from './courses'
import { BALL_COLOR_OPTIONS, COURSE_ORDER, MAX_PLAYERS, MINIGOLF_EVENT_TYPES, MINIGOLF_PHASES, PLAYER_COLORS } from './constants'

const clone = (value) => JSON.parse(JSON.stringify(value))

export const sanitizeMiniGolfPlayer = (player) => {
  const id = player?.id || player?.playerId
  if (!player || typeof player !== 'object' || !id) return null
  const preferredColor = typeof player.color === 'string' && BALL_COLOR_OPTIONS.includes(player.color)
    ? player.color
    : null
  return {
    id: String(id),
    username: String(player.username || 'Player'),
    avatar: player.avatar || null,
    color: preferredColor
  }
}

export const buildMiniGolfEventId = (evt) => {
  const payload = evt?.payload || {}
  if (payload.actionId) return String(payload.actionId)
  return `${evt?.eventType || 'evt'}:${payload.playerId || 'anon'}:${evt?.ts || 0}`
}

export const rememberMiniGolfEvent = (ref, eventId, max = 300) => {
  if (!eventId || !ref?.current) return false
  if (ref.current.has(eventId)) return false
  ref.current.add(eventId)
  if (ref.current.size > max) {
    const first = ref.current.values().next().value
    ref.current.delete(first)
  }
  return true
}

const emptyRoundState = (tee) => ({
  position: { ...tee },
  strokesThisHole: 0,
  finishedHole: false,
  lastCheckpoint: { ...tee },
  lastResultType: null
})

const createScorecard = () => ({
  totalStrokes: 0,
  relativeToPar: 0,
  holes: {}
})

const ensureScorecard = (scorecards, playerId) => {
  if (!scorecards[playerId]) scorecards[playerId] = createScorecard()
  return scorecards[playerId]
}

const ensurePlayerColor = (players, playerId) => {
  const index = players.findIndex((player) => player.id === playerId)
  const player = index >= 0 ? players[index] : null
  return player?.color || PLAYER_COLORS[index % PLAYER_COLORS.length]
}

const getPlayingPlayerIds = (state) => state.players.map((player) => player.id)

const getHoleStartState = (courseId, holeIndex, players) => {
  const hole = getMiniGolfHole(courseId, holeIndex)
  return Object.fromEntries(players.map((player) => [player.id, emptyRoundState(hole.tee)]))
}

const getNextTurn = (state, fromPlayerId = null) => {
  const order = state.order || []
  if (!order.length) return null
  const unfinished = order.filter((playerId) => !state.playerStates[playerId]?.finishedHole)
  if (!unfinished.length) return null
  if (!fromPlayerId) return unfinished[0]
  const currentIndex = unfinished.indexOf(fromPlayerId)
  if (currentIndex === -1 || currentIndex === unfinished.length - 1) return unfinished[0]
  return unfinished[currentIndex + 1]
}

export const resolveMiniGolfCourseId = (state, preferredCourseId = null) => {
  if (preferredCourseId && COURSE_ORDER.includes(preferredCourseId)) return preferredCourseId
  const votes = Object.values(state.votes || {})
  if (!votes.length) return COURSE_ORDER[0]
  const counts = votes.reduce((acc, courseId) => {
    if (!COURSE_ORDER.includes(courseId)) return acc
    acc[courseId] = (acc[courseId] || 0) + 1
    return acc
  }, {})
  if (!Object.keys(counts).length) return COURSE_ORDER[0]
  return Object.entries(counts).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1]
    return COURSE_ORDER.indexOf(a[0]) - COURSE_ORDER.indexOf(b[0])
  })[0]?.[0] || COURSE_ORDER[0]
}

const markActionApplied = (state, actionId) => {
  if (!actionId) return state
  const nextApplied = [...(state.appliedActionIds || []), actionId].slice(-400)
  return { ...state, appliedActionIds: nextApplied }
}

const isActionApplied = (state, actionId) => !!(actionId && state.appliedActionIds?.includes(actionId))

const computeWinnerId = (state) => {
  return [...state.players]
    .sort((a, b) => {
      const scoreA = state.scorecards[a.id]?.relativeToPar ?? Infinity
      const scoreB = state.scorecards[b.id]?.relativeToPar ?? Infinity
      if (scoreA !== scoreB) return scoreA - scoreB
      return (state.scorecards[a.id]?.totalStrokes || Infinity) - (state.scorecards[b.id]?.totalStrokes || Infinity)
    })[0]?.id || null
}

export const getMiniGolfLeaderboard = (state) => {
  return [...(state.players || [])].map((player) => {
    const scorecard = state.scorecards[player.id] || createScorecard()
    return {
      ...player,
      color: ensurePlayerColor(state.players, player.id),
      totalStrokes: scorecard.totalStrokes,
      relativeToPar: scorecard.relativeToPar,
      strokesThisHole: state.playerStates[player.id]?.strokesThisHole || 0,
      finishedHole: !!state.playerStates[player.id]?.finishedHole
    }
  }).sort((a, b) => {
    if (a.relativeToPar !== b.relativeToPar) return a.relativeToPar - b.relativeToPar
    return a.totalStrokes - b.totalStrokes
  })
}

export const createInitialMiniGolfState = () => ({
  version: 2,
  phase: MINIGOLF_PHASES.LOBBY,
  players: [],
  spectators: [],
  readyMap: {},
  votes: {},
  courseId: COURSE_ORDER[0],
  holeIndex: 0,
  order: [],
  currentTurnPlayerId: null,
  playerStates: {},
  scorecards: {},
  winnerId: null,
  lastShot: null,
  holeSequenceStartedAt: null,
  appliedActionIds: []
})

export const applyMiniGolfEvent = (state, evt) => {
  const payload = evt?.payload || {}
  const actionId = payload.actionId || null
  if (isActionApplied(state, actionId)) return state

  if (evt?.eventType === MINIGOLF_EVENT_TYPES.JOIN) {
    const player = sanitizeMiniGolfPlayer(payload)
    if (!player) return state
    const existing = state.players.find((entry) => entry.id === player.id)
    if (existing) {
      const nextPlayers = state.players.map((entry) => (entry.id === player.id ? { ...entry, ...player } : entry))
      return markActionApplied({ ...state, players: nextPlayers }, actionId)
    }
    if (state.phase !== MINIGOLF_PHASES.LOBBY || state.players.length >= MAX_PLAYERS) {
      const nextSpectators = [...state.spectators.filter((entry) => entry.id !== player.id), player]
      return markActionApplied({ ...state, spectators: nextSpectators }, actionId)
    }
    const nextPlayers = [...state.players, player]
    const nextState = {
      ...state,
      players: nextPlayers,
      order: nextPlayers.map((entry) => entry.id),
      readyMap: { ...state.readyMap, [player.id]: false },
      scorecards: { ...state.scorecards, [player.id]: createScorecard() }
    }
    return markActionApplied(nextState, actionId)
  }

  if (evt?.eventType === MINIGOLF_EVENT_TYPES.LEAVE) {
    const playerId = String(payload.playerId || '')
    if (!playerId) return state
    const nextPlayers = state.players.filter((player) => player.id !== playerId)
    const nextSpectators = state.spectators.filter((player) => player.id !== playerId)
    const nextReady = { ...state.readyMap }
    const nextVotes = { ...state.votes }
    const nextPlayerStates = { ...state.playerStates }
    delete nextReady[playerId]
    delete nextVotes[playerId]
    delete nextPlayerStates[playerId]
    const nextState = {
      ...state,
      players: nextPlayers,
      spectators: nextSpectators,
      readyMap: nextReady,
      votes: nextVotes,
      order: nextPlayers.map((player) => player.id),
      playerStates: nextPlayerStates,
      currentTurnPlayerId: state.currentTurnPlayerId === playerId ? getNextTurn({ ...state, playerStates: nextPlayerStates, order: nextPlayers.map((player) => player.id) }) : state.currentTurnPlayerId
    }
    return markActionApplied(nextState, actionId)
  }

  if (evt?.eventType === MINIGOLF_EVENT_TYPES.READY) {
    const playerId = String(payload.playerId || '')
    if (!playerId || !state.players.some((player) => player.id === playerId)) return state
    const nextState = {
      ...state,
      readyMap: { ...state.readyMap, [playerId]: payload.ready !== false }
    }
    return markActionApplied(nextState, actionId)
  }

  if (evt?.eventType === MINIGOLF_EVENT_TYPES.VOTE) {
    const playerId = String(payload.playerId || '')
    const courseId = String(payload.courseId || '')
    if (
      !playerId ||
      !courseId ||
      state.phase !== MINIGOLF_PHASES.LOBBY ||
      !COURSE_ORDER.includes(courseId) ||
      !state.players.some((player) => player.id === playerId)
    ) return state
    const nextState = {
      ...state,
      votes: { ...state.votes, [playerId]: courseId }
    }
    return markActionApplied(nextState, actionId)
  }

  if (evt?.eventType === MINIGOLF_EVENT_TYPES.START) {
    const courseId = resolveMiniGolfCourseId(state, payload.courseId)
    const nextPlayerStates = getHoleStartState(courseId, 0, state.players)
    const nextScorecards = clone(state.scorecards)
    for (const player of state.players) ensureScorecard(nextScorecards, player.id)
    const nextState = {
      ...state,
      phase: MINIGOLF_PHASES.PLAYING,
      courseId,
      holeIndex: 0,
      order: state.players.map((player) => player.id),
      currentTurnPlayerId: state.players[0]?.id || null,
      playerStates: nextPlayerStates,
      scorecards: nextScorecards,
      winnerId: null,
      lastShot: null,
      holeSequenceStartedAt: Date.now()
    }
    return markActionApplied(nextState, actionId)
  }

  if (evt?.eventType === MINIGOLF_EVENT_TYPES.SHOT) {
    const playerId = String(payload.playerId || '')
    const result = payload.result
    if (!playerId || !result || state.phase !== MINIGOLF_PHASES.PLAYING) return state
    if (!state.playerStates[playerId] || state.currentTurnPlayerId !== playerId) return state

    const nextState = {
      ...state,
      playerStates: { ...state.playerStates },
      scorecards: clone(state.scorecards),
      lastShot: { playerId, shot: payload.shot || null, result }
    }
    const playerRound = {
      ...nextState.playerStates[playerId],
      position: { ...result.finalPosition },
      strokesThisHole: (nextState.playerStates[playerId]?.strokesThisHole || 0) + 1,
      lastCheckpoint: result.checkpoint ? { ...result.checkpoint } : nextState.playerStates[playerId].lastCheckpoint,
      lastResultType: result.resultType || null
    }
    if (result.inHole) playerRound.finishedHole = true
    nextState.playerStates[playerId] = playerRound

    const scorecard = ensureScorecard(nextState.scorecards, playerId)
    const holeId = getMiniGolfHole(nextState.courseId, nextState.holeIndex).id
    scorecard.totalStrokes += 1
    scorecard.holes[holeId] = playerRound.strokesThisHole
    scorecard.relativeToPar = Object.entries(scorecard.holes).reduce((sum, [id, strokes]) => {
      const course = getMiniGolfCourse(nextState.courseId)
      const hole = course.holes.find((entry) => entry.id === id) || course.holes[0]
      return sum + (strokes - hole.par)
    }, 0)

    const everyoneFinished = getPlayingPlayerIds(nextState).every((id) => nextState.playerStates[id]?.finishedHole)
    if (everyoneFinished) {
      const course = getMiniGolfCourse(nextState.courseId)
      const isLastHole = nextState.holeIndex >= course.holes.length - 1
      if (isLastHole) {
        nextState.phase = MINIGOLF_PHASES.FINISHED
        nextState.currentTurnPlayerId = null
        nextState.winnerId = computeWinnerId(nextState)
      } else {
        nextState.phase = MINIGOLF_PHASES.HOLE_SUMMARY
        nextState.currentTurnPlayerId = null
      }
      return markActionApplied(nextState, actionId)
    }

    nextState.currentTurnPlayerId = getNextTurn(nextState, playerId)
    return markActionApplied(nextState, actionId)
  }

  if (evt?.eventType === MINIGOLF_EVENT_TYPES.ADVANCE_HOLE) {
    const nextHoleIndex = state.holeIndex + 1
    const course = getMiniGolfCourse(state.courseId)
    if (nextHoleIndex >= course.holes.length) return markActionApplied(state, actionId)
    const nextPlayerStates = getHoleStartState(state.courseId, nextHoleIndex, state.players)
    const nextState = {
      ...state,
      phase: MINIGOLF_PHASES.PLAYING,
      holeIndex: nextHoleIndex,
      playerStates: nextPlayerStates,
      currentTurnPlayerId: state.players[0]?.id || null,
      lastShot: null,
      holeSequenceStartedAt: Date.now()
    }
    return markActionApplied(nextState, actionId)
  }

  if (evt?.eventType === MINIGOLF_EVENT_TYPES.REMATCH) {
    const nextPlayers = [...state.players]
    return markActionApplied({
      ...createInitialMiniGolfState(),
      players: nextPlayers,
      order: nextPlayers.map((player) => player.id),
      readyMap: Object.fromEntries(nextPlayers.map((player) => [player.id, false])),
      scorecards: Object.fromEntries(nextPlayers.map((player) => [player.id, createScorecard()]))
    }, actionId)
  }

  return state
}
