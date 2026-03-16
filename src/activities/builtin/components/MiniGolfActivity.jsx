import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import MiniGolfScene from './minigolf/MiniGolfScene'
import MiniGolfHud from './minigolf/MiniGolfHud'
import './minigolf/MiniGolfHud.css'
import { getMiniGolfCourse, getMiniGolfHole, listMiniGolfCourseSummaries, getMiniGolfCourseOrder, getNextCourseId } from './minigolf/courses'
import { buildShotVector, simulateShot } from './minigolf/physics'
import { BALL_COLOR_OPTIONS, MINIGOLF_EVENT_TYPES, MINIGOLF_PHASES, PLAYER_COLORS } from './minigolf/constants'
import { applyMiniGolfEvent, buildMiniGolfEventId, createInitialMiniGolfState, getMiniGolfLeaderboard, rememberMiniGolfEvent, resolveMiniGolfCourseId } from './minigolf/state'
import { useMiniGolfSound } from './MiniGolfSoundManager.jsx'
import { loadProgression, saveProgression, isCourseUnlocked, getCourseStars, getUnlockRequirement } from './minigolf/progression'

const actionId = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
const BALL_COLOR_STORAGE_KEY = 'volt_minigolf_ball_color'

const decoratePlayers = (players = [], state) => players.map((player, index) => ({
  ...player,
  color: player.color || PLAYER_COLORS[index % PLAYER_COLORS.length],
  position: state.playerStates[player.id]?.position || { x: 0, z: 0 }
}))

const MiniGolfActivity = ({ sdk, currentUser }) => {
  const { play } = useMiniGolfSound()
  const [gameState, setGameState] = useState(createInitialMiniGolfState)
  const [selectedCourseId, setSelectedCourseId] = useState(() => getMiniGolfCourseOrder()[0] || 'skyline')
  const [aimState, setAimState] = useState({ active: false, angle: 0, power: 0.55, dragging: false })
  const [shotPlayback, setShotPlayback] = useState(null)
  const [selectedBallColor, setSelectedBallColor] = useState(() => {
    if (typeof window === 'undefined') return BALL_COLOR_OPTIONS[0]
    const stored = window.localStorage.getItem(BALL_COLOR_STORAGE_KEY)
    return BALL_COLOR_OPTIONS.includes(stored) ? stored : BALL_COLOR_OPTIONS[0]
  })
  const [progression, setProgression] = useState(() => loadProgression())
  const seenEventsRef = useRef(new Set())
  const hasBroadcastInitialColorRef = useRef(false)
  const selectedBallColorRef = useRef(selectedBallColor)
  const lastSavedProgressRef = useRef(null)

  const emit = useCallback((eventType, payload, cue) => {
    if (!sdk) return
    sdk.emitEvent(eventType, payload, { serverRelay: true, cue })
  }, [sdk])

  const applyAndPersist = useCallback((evt) => {
    setGameState((prev) => {
      const next = applyMiniGolfEvent(prev, evt)
      if (next !== prev) {
        sdk?.updateState?.({ minigolf: next }, { serverRelay: true })
      }
      return next
    })
  }, [sdk])

  const saveProgressToStorage = useCallback((progress) => {
    if (progress === lastSavedProgressRef.current) return
    lastSavedProgressRef.current = progress
    saveProgression(progress)
  }, [])

  const handleCourseCompletion = useCallback((courseId, scorecards, course) => {
    let newProgress = { ...progression }

    course.holes.forEach((hole) => {
      const bestStrokes = Math.min(...Object.values(scorecards).map(s => s.holes[hole.id] || Infinity).filter(s => s !== Infinity))
      if (bestStrokes === Infinity) return

      const stars = bestStrokes <= hole.par - 1 ? 3 : bestStrokes === hole.par ? 2 : bestStrokes <= hole.par + 2 ? 1 : 0

      const existingStars = newProgress.courseStars[courseId]?.[hole.id] || 0
      if (stars > existingStars) {
        newProgress = {
          ...newProgress,
          courseStars: {
            ...newProgress.courseStars,
            [courseId]: {
              ...(newProgress.courseStars[courseId] || {}),
              [hole.id]: stars
            }
          }
        }
      }

      const prevBest = newProgress.holeBestScores[`${courseId}:${hole.id}`] || Infinity
      if (bestStrokes < prevBest) {
        newProgress.holeBestScores[`${courseId}:${hole.id}`] = bestStrokes
      }
    })

    newProgress.totalStars = Object.values(newProgress.courseStars)
      .flat()
      .reduce((sum, s) => sum + (s || 0), 0)

    const nextCourseId = getNextCourseId(courseId)
    if (nextCourseId && !newProgress.unlockedCourses.includes(nextCourseId)) {
      newProgress.unlockedCourses = [...newProgress.unlockedCourses, nextCourseId]
    }

    setProgression(newProgress)
    saveProgressToStorage(newProgress)
  }, [progression, saveProgressToStorage])

  useEffect(() => {
    selectedBallColorRef.current = selectedBallColor
  }, [selectedBallColor])

  useEffect(() => {
    if (!sdk) return undefined

    const offState = sdk.subscribeServerState((state) => {
      const next = state?.minigolf
      if (!next || typeof next !== 'object') return
      setGameState((prev) => ({ ...prev, ...next }))
    })

    const offEvent = sdk.on('event', (evt) => {
      if (!evt?.eventType?.startsWith('minigolf:')) return
      const eventId = buildMiniGolfEventId(evt)
      if (!rememberMiniGolfEvent(seenEventsRef, eventId)) return
      applyAndPersist(evt)

      if (evt.eventType === MINIGOLF_EVENT_TYPES.SHOT && evt.payload?.result) {
        setShotPlayback({
          actionId: evt.payload.actionId,
          playerId: evt.payload.playerId,
          path: evt.payload.result.path || [],
          finalPosition: evt.payload.result.finalPosition
        })
        play('putt')

        const result = evt.payload.result
        if (result.inHole) {
          setTimeout(() => play('holeComplete'), 300)
        } else if (result.resultType === 'lava-reset' || result.resultType === 'hazard-reset') {
          setTimeout(() => play('hazardReset'), 200)
        } else if (result.collisionCount > 0) {
          setTimeout(() => play('wallHit'), 100)
        }
        if (result.surfaceType === 'sand') {
          setTimeout(() => play('sand'), 80)
        } else if (result.surfaceType === 'ice') {
          setTimeout(() => play('ice'), 80)
        }
      }

      if (evt.eventType === MINIGOLF_EVENT_TYPES.START) play('start')
      if (evt.eventType === MINIGOLF_EVENT_TYPES.JOIN) play('join')
      if (evt.eventType === MINIGOLF_EVENT_TYPES.READY) play('ready')
      if (evt.eventType === MINIGOLF_EVENT_TYPES.VOTE) play('vote')
      if (evt.eventType === MINIGOLF_EVENT_TYPES.ADVANCE_HOLE) play('transition')
    })

    return () => {
      offState?.()
      offEvent?.()
    }
  }, [sdk, applyAndPersist, play])

  useEffect(() => {
    if (gameState.phase === MINIGOLF_PHASES.FINISHED && gameState.courseId && gameState.scorecards) {
      const course = getMiniGolfCourse(gameState.courseId)
      handleCourseCompletion(gameState.courseId, gameState.scorecards, course)
    }
  }, [gameState.phase, gameState.courseId, gameState.scorecards, handleCourseCompletion])

  useEffect(() => {
    if (!sdk || !currentUser?.id) return
    hasBroadcastInitialColorRef.current = false
    const evt = {
      eventType: MINIGOLF_EVENT_TYPES.JOIN,
      payload: {
        playerId: currentUser.id,
        username: currentUser.username || 'Player',
        avatar: currentUser.avatar || null,
        color: selectedBallColorRef.current,
        actionId: actionId('mg_join')
      }
    }
    rememberMiniGolfEvent(seenEventsRef, evt.payload.actionId)
    applyAndPersist(evt)
    sdk.emitEvent(MINIGOLF_EVENT_TYPES.JOIN, evt.payload, { serverRelay: true, cue: 'player_join' })

    return () => {
      const leaveEvt = {
        eventType: MINIGOLF_EVENT_TYPES.LEAVE,
        payload: { playerId: currentUser.id, actionId: actionId('mg_leave') }
      }
      sdk.emitEvent(MINIGOLF_EVENT_TYPES.LEAVE, leaveEvt.payload, { serverRelay: true, cue: 'player_leave' })
    }
  }, [sdk, currentUser?.id, currentUser?.username, currentUser?.avatar, applyAndPersist])

  useEffect(() => {
    if (!sdk || !currentUser?.id) return
    if (!hasBroadcastInitialColorRef.current) {
      hasBroadcastInitialColorRef.current = true
      return
    }
    const payload = {
      playerId: currentUser.id,
      username: currentUser.username || 'Player',
      avatar: currentUser.avatar || null,
      color: selectedBallColor,
      actionId: actionId('mg_color')
    }
    rememberMiniGolfEvent(seenEventsRef, payload.actionId)
    applyAndPersist({ eventType: MINIGOLF_EVENT_TYPES.JOIN, payload })
    emit(MINIGOLF_EVENT_TYPES.JOIN, payload, 'selection_change')
  }, [sdk, currentUser?.id, currentUser?.username, currentUser?.avatar, selectedBallColor, applyAndPersist, emit])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(BALL_COLOR_STORAGE_KEY, selectedBallColor)
  }, [selectedBallColor])

  const courseOrder = useMemo(() => getMiniGolfCourseOrder(), [])
  const coursesWithProgress = useMemo(() => {
    return listMiniGolfCourseSummaries().map((course) => ({
      ...course,
      unlocked: isCourseUnlocked(progression, course.id),
      stars: getCourseStars(progression, course.id),
      maxStars: course.holeCount * 3,
      unlockRequirement: getUnlockRequirement(courseOrder, course.id)
    }))
  }, [progression, courseOrder])

  const courses = coursesWithProgress
  const course = useMemo(() => getMiniGolfCourse(gameState.courseId), [gameState.courseId])
  const hole = useMemo(() => getMiniGolfHole(gameState.courseId, gameState.holeIndex), [gameState.courseId, gameState.holeIndex])
  const decoratedPlayers = useMemo(() => decoratePlayers(gameState.players, gameState), [gameState])
  const leaderboard = useMemo(() => getMiniGolfLeaderboard(gameState), [gameState])
  const currentTurnPlayer = decoratedPlayers.find((player) => player.id === gameState.currentTurnPlayerId) || null
  const winner = decoratedPlayers.find((player) => player.id === gameState.winnerId) || null
  const isMyTurn = currentUser?.id && gameState.currentTurnPlayerId === currentUser.id
  const canStart = decoratedPlayers.length >= 1 && decoratedPlayers.every((player) => gameState.readyMap[player.id])
  const leadingCourseId = useMemo(() => resolveMiniGolfCourseId(gameState), [gameState])
  const leadingCourse = useMemo(
    () => courses.find((entry) => entry.id === leadingCourseId) || courses[0] || null,
    [courses, leadingCourseId]
  )

  useEffect(() => {
    if (gameState.phase !== MINIGOLF_PHASES.LOBBY) return
    const myVote = currentUser?.id ? gameState.votes[currentUser.id] : null
    if (myVote && myVote !== selectedCourseId) {
      setSelectedCourseId(myVote)
      return
    }
    if (!myVote && leadingCourseId && leadingCourseId !== selectedCourseId) {
      setSelectedCourseId(leadingCourseId)
    }
  }, [currentUser?.id, gameState.phase, gameState.votes, leadingCourseId, selectedCourseId])

  const toggleReady = useCallback(() => {
    if (!currentUser?.id) return
    const payload = {
      playerId: currentUser.id,
      ready: !gameState.readyMap[currentUser.id],
      actionId: actionId('mg_ready')
    }
    rememberMiniGolfEvent(seenEventsRef, payload.actionId)
    applyAndPersist({ eventType: MINIGOLF_EVENT_TYPES.READY, payload })
    emit(MINIGOLF_EVENT_TYPES.READY, payload, 'player_ready')
  }, [currentUser?.id, gameState.readyMap, applyAndPersist, emit])

  const voteCourse = useCallback((courseId) => {
    if (!currentUser?.id) return
    if (!isCourseUnlocked(progression, courseId)) return
    setSelectedCourseId(courseId)
    const payload = {
      playerId: currentUser.id,
      courseId,
      actionId: actionId('mg_vote')
    }
    rememberMiniGolfEvent(seenEventsRef, payload.actionId)
    applyAndPersist({ eventType: MINIGOLF_EVENT_TYPES.VOTE, payload })
    emit(MINIGOLF_EVENT_TYPES.VOTE, payload, 'selection_change')
  }, [currentUser?.id, progression, applyAndPersist, emit])

  const startGame = useCallback(() => {
    const payload = { courseId: leadingCourseId || selectedCourseId, actionId: actionId('mg_start') }
    rememberMiniGolfEvent(seenEventsRef, payload.actionId)
    applyAndPersist({ eventType: MINIGOLF_EVENT_TYPES.START, payload })
    emit(MINIGOLF_EVENT_TYPES.START, payload, 'game_start')
  }, [leadingCourseId, selectedCourseId, applyAndPersist, emit])

  const shoot = useCallback((shotOverride = null) => {
    if (!currentUser?.id || !isMyTurn) return
    const playerState = gameState.playerStates[currentUser.id]
    if (!playerState) return
    const nextShot = shotOverride || { angle: aimState.angle, power: aimState.power }
    const velocity = buildShotVector({ angle: nextShot.angle, power: nextShot.power, powerScale: 18 })
    const result = simulateShot({
      hole,
      start: playerState.position,
      shot: { angle: nextShot.angle, power: nextShot.power, velocity },
      lastCheckpoint: playerState.lastCheckpoint
    })
    const payload = {
      playerId: currentUser.id,
      shot: { angle: nextShot.angle, power: nextShot.power, velocity },
      result,
      actionId: actionId('mg_shot')
    }
    setAimState((prev) => ({ ...prev, active: false, dragging: false }))
    rememberMiniGolfEvent(seenEventsRef, payload.actionId)
    applyAndPersist({ eventType: MINIGOLF_EVENT_TYPES.SHOT, payload })
    setShotPlayback({
      actionId: payload.actionId,
      playerId: payload.playerId,
      path: result.path,
      finalPosition: result.finalPosition
    })
    emit(MINIGOLF_EVENT_TYPES.SHOT, payload, 'move_valid')
  }, [currentUser?.id, isMyTurn, gameState.playerStates, aimState.angle, aimState.power, hole, applyAndPersist, emit])

  const handleDragAim = useCallback((nextAim, { commit = false } = {}) => {
    if (!nextAim || !isMyTurn) return
    const angle = Number(nextAim.angle || 0)
    const power = Math.max(0.08, Math.min(1, Number(nextAim.power || 0)))
    if (commit) {
      setAimState({ active: false, angle, power, dragging: false })
      shoot({ angle, power })
      return
    }
    setAimState((prev) => ({
      ...prev,
      active: true,
      dragging: true,
      angle,
      power
    }))
  }, [isMyTurn, shoot])

  const handleDragCancel = useCallback(() => {
    setAimState((prev) => ({ ...prev, active: false, dragging: false }))
  }, [])

  const advanceHole = useCallback(() => {
    const payload = { actionId: actionId('mg_next') }
    rememberMiniGolfEvent(seenEventsRef, payload.actionId)
    applyAndPersist({ eventType: MINIGOLF_EVENT_TYPES.ADVANCE_HOLE, payload })
    emit(MINIGOLF_EVENT_TYPES.ADVANCE_HOLE, payload, 'round_start')
  }, [applyAndPersist, emit])

  const rematch = useCallback(() => {
    const payload = { actionId: actionId('mg_rematch') }
    rememberMiniGolfEvent(seenEventsRef, payload.actionId)
    applyAndPersist({ eventType: MINIGOLF_EVENT_TYPES.REMATCH, payload })
    emit(MINIGOLF_EVENT_TYPES.REMATCH, payload, 'game_reset')
  }, [applyAndPersist, emit])

  if (!sdk) {
    return <div className="builtin-activity-loading"><div className="loading-spinner" /><p>Loading MiniGolf...</p></div>
  }

  return (
    <div className="builtin-activity-body mgx-shell">
      <div className="mgx-stage">
        <MiniGolfScene
          courseId={gameState.courseId}
          holeIndex={gameState.holeIndex}
          players={decoratedPlayers}
          activePlayerId={gameState.currentTurnPlayerId}
          aimState={aimState}
          isMyTurn={!!isMyTurn}
          shotPlayback={shotPlayback}
          onAimDrag={handleDragAim}
          onAimCancel={handleDragCancel}
          onShotPlaybackComplete={() => setShotPlayback(null)}
        />
      </div>
      <div className="mgx-panel">
        <MiniGolfHud
          phase={gameState.phase}
          courses={courses}
          players={decoratedPlayers}
          readyMap={gameState.readyMap}
          votes={gameState.votes}
          selectedCourseId={selectedCourseId}
          leadingCourseId={leadingCourseId}
          leadingCourse={leadingCourse}
          currentUserId={currentUser?.id}
          canStart={canStart}
          onVoteCourse={voteCourse}
          onToggleReady={toggleReady}
          onStartGame={startGame}
          course={course}
          hole={hole}
          holeIndex={gameState.holeIndex}
          holeCount={course.holeCount}
          leaderboard={leaderboard}
          currentTurnPlayer={currentTurnPlayer}
          isMyTurn={!!isMyTurn}
          aimState={aimState}
          selectedBallColor={selectedBallColor}
          onSelectBallColor={setSelectedBallColor}
          onAdvanceHole={advanceHole}
          winner={winner}
          onRematch={rematch}
          progression={progression}
          courseId={gameState.courseId}
        />
        {gameState.phase === MINIGOLF_PHASES.PLAYING ? (
          <div className="mgx-card mgx-tip-card">
            <h4>Drag Shot</h4>
            <p>Click on the course, drag away from your ball to set line and power, then release to shoot.</p>
            <div className="mgx-inline-meta">
              <span>Heading</span>
              <span>{Math.round((aimState.angle * 180) / Math.PI)} deg</span>
            </div>
            <div className="mgx-inline-meta">
              <span>Power</span>
              <span>{Math.round(aimState.power * 100)}%</span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default MiniGolfActivity
