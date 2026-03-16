import { describe, expect, it } from 'vitest'
import { MINIGOLF_EVENT_TYPES, MINIGOLF_PHASES } from './constants'
import { applyMiniGolfEvent, createInitialMiniGolfState, getMiniGolfLeaderboard } from './state'

const join = (state, playerId, username) => applyMiniGolfEvent(state, {
  eventType: MINIGOLF_EVENT_TYPES.JOIN,
  payload: { playerId, username, actionId: `join-${playerId}` }
})

describe('minigolf state reducer', () => {
  it('joins players and tracks readiness', () => {
    let state = createInitialMiniGolfState()
    state = join(state, 'a', 'Alpha')
    state = join(state, 'b', 'Bravo')
    state = applyMiniGolfEvent(state, {
      eventType: MINIGOLF_EVENT_TYPES.READY,
      payload: { playerId: 'a', ready: true, actionId: 'ready-a' }
    })

    expect(state.players).toHaveLength(2)
    expect(state.readyMap.a).toBe(true)
    expect(state.order).toEqual(['a', 'b'])
  })

  it('preserves player color from join payload', () => {
    let state = createInitialMiniGolfState()
    state = applyMiniGolfEvent(state, {
      eventType: MINIGOLF_EVENT_TYPES.JOIN,
      payload: { playerId: 'a', username: 'Alpha', color: '#ffffff', actionId: 'join-colored' }
    })

    expect(state.players[0].color).toBe('#ffffff')
  })

  it('starts a round from lobby votes', () => {
    let state = createInitialMiniGolfState()
    state = join(state, 'a', 'Alpha')
    state = join(state, 'b', 'Bravo')
    state = applyMiniGolfEvent(state, {
      eventType: MINIGOLF_EVENT_TYPES.VOTE,
      payload: { playerId: 'a', courseId: 'forge', actionId: 'vote-a' }
    })
    state = applyMiniGolfEvent(state, {
      eventType: MINIGOLF_EVENT_TYPES.START,
      payload: { actionId: 'start' }
    })

    expect(state.phase).toBe(MINIGOLF_PHASES.PLAYING)
    expect(state.courseId).toBe('forge')
    expect(state.currentTurnPlayerId).toBe('a')
    expect(state.playerStates.a.position.x).toBeTypeOf('number')
  })

  it('breaks tied course votes by course order', () => {
    let state = createInitialMiniGolfState()
    state = join(state, 'a', 'Alpha')
    state = join(state, 'b', 'Bravo')
    state = join(state, 'c', 'Charlie')
    state = join(state, 'd', 'Delta')
    state = applyMiniGolfEvent(state, {
      eventType: MINIGOLF_EVENT_TYPES.VOTE,
      payload: { playerId: 'a', courseId: 'forge', actionId: 'vote-a' }
    })
    state = applyMiniGolfEvent(state, {
      eventType: MINIGOLF_EVENT_TYPES.VOTE,
      payload: { playerId: 'b', courseId: 'glacier', actionId: 'vote-b' }
    })
    state = applyMiniGolfEvent(state, {
      eventType: MINIGOLF_EVENT_TYPES.VOTE,
      payload: { playerId: 'c', courseId: 'forge', actionId: 'vote-c' }
    })
    state = applyMiniGolfEvent(state, {
      eventType: MINIGOLF_EVENT_TYPES.VOTE,
      payload: { playerId: 'd', courseId: 'glacier', actionId: 'vote-d' }
    })
    state = applyMiniGolfEvent(state, {
      eventType: MINIGOLF_EVENT_TYPES.START,
      payload: { actionId: 'start-tie' }
    })

    expect(state.courseId).toBe('forge')
  })

  it('uses explicit start payload over votes', () => {
    let state = createInitialMiniGolfState()
    state = join(state, 'a', 'Alpha')
    state = join(state, 'b', 'Bravo')
    state = applyMiniGolfEvent(state, {
      eventType: MINIGOLF_EVENT_TYPES.VOTE,
      payload: { playerId: 'a', courseId: 'forge', actionId: 'vote-override-a' }
    })
    state = applyMiniGolfEvent(state, {
      eventType: MINIGOLF_EVENT_TYPES.VOTE,
      payload: { playerId: 'b', courseId: 'forge', actionId: 'vote-override-b' }
    })
    state = applyMiniGolfEvent(state, {
      eventType: MINIGOLF_EVENT_TYPES.START,
      payload: { courseId: 'neon', actionId: 'start-override' }
    })

    expect(state.courseId).toBe('neon')
  })

  it('breaks vote ties using course order', () => {
    let state = createInitialMiniGolfState()
    state = join(state, 'a', 'Alpha')
    state = join(state, 'b', 'Bravo')
    state = join(state, 'c', 'Charlie')
    state = join(state, 'd', 'Delta')
    state = applyMiniGolfEvent(state, {
      eventType: MINIGOLF_EVENT_TYPES.VOTE,
      payload: { playerId: 'a', courseId: 'forge', actionId: 'vote-a' }
    })
    state = applyMiniGolfEvent(state, {
      eventType: MINIGOLF_EVENT_TYPES.VOTE,
      payload: { playerId: 'b', courseId: 'forge', actionId: 'vote-b' }
    })
    state = applyMiniGolfEvent(state, {
      eventType: MINIGOLF_EVENT_TYPES.VOTE,
      payload: { playerId: 'c', courseId: 'glacier', actionId: 'vote-c' }
    })
    state = applyMiniGolfEvent(state, {
      eventType: MINIGOLF_EVENT_TYPES.VOTE,
      payload: { playerId: 'd', courseId: 'glacier', actionId: 'vote-d' }
    })
    state = applyMiniGolfEvent(state, {
      eventType: MINIGOLF_EVENT_TYPES.START,
      payload: { actionId: 'start-tie' }
    })

    expect(state.courseId).toBe('forge')
  })

  it('lets an explicit start payload override votes', () => {
    let state = createInitialMiniGolfState()
    state = join(state, 'a', 'Alpha')
    state = join(state, 'b', 'Bravo')
    state = applyMiniGolfEvent(state, {
      eventType: MINIGOLF_EVENT_TYPES.VOTE,
      payload: { playerId: 'a', courseId: 'forge', actionId: 'vote-a' }
    })
    state = applyMiniGolfEvent(state, {
      eventType: MINIGOLF_EVENT_TYPES.VOTE,
      payload: { playerId: 'b', courseId: 'forge', actionId: 'vote-b' }
    })
    state = applyMiniGolfEvent(state, {
      eventType: MINIGOLF_EVENT_TYPES.START,
      payload: { courseId: 'glacier', actionId: 'start-override' }
    })

    expect(state.courseId).toBe('glacier')
  })

  it('removes readiness and votes when a player leaves', () => {
    let state = createInitialMiniGolfState()
    state = join(state, 'a', 'Alpha')
    state = join(state, 'b', 'Bravo')
    state = applyMiniGolfEvent(state, {
      eventType: MINIGOLF_EVENT_TYPES.READY,
      payload: { playerId: 'b', ready: true, actionId: 'ready-b' }
    })
    state = applyMiniGolfEvent(state, {
      eventType: MINIGOLF_EVENT_TYPES.VOTE,
      payload: { playerId: 'b', courseId: 'forge', actionId: 'vote-b' }
    })
    state = applyMiniGolfEvent(state, {
      eventType: MINIGOLF_EVENT_TYPES.LEAVE,
      payload: { playerId: 'b', actionId: 'leave-b' }
    })

    expect(state.players.map((player) => player.id)).toEqual(['a'])
    expect(state.readyMap.b).toBeUndefined()
    expect(state.votes.b).toBeUndefined()
    expect(state.playerStates.b).toBeUndefined()
  })

  it('moves late joiners to spectators after the round starts', () => {
    let state = createInitialMiniGolfState()
    state = join(state, 'a', 'Alpha')
    state = applyMiniGolfEvent(state, {
      eventType: MINIGOLF_EVENT_TYPES.START,
      payload: { courseId: 'skyline', actionId: 'start' }
    })
    state = applyMiniGolfEvent(state, {
      eventType: MINIGOLF_EVENT_TYPES.JOIN,
      payload: { playerId: 'b', username: 'Bravo', actionId: 'join-b' }
    })

    expect(state.players.map((player) => player.id)).toEqual(['a'])
    expect(state.spectators.map((player) => player.id)).toEqual(['b'])
  })

  it('resets the round but preserves the roster on rematch', () => {
    let state = createInitialMiniGolfState()
    state = join(state, 'a', 'Alpha')
    state = join(state, 'b', 'Bravo')
    state = applyMiniGolfEvent(state, {
      eventType: MINIGOLF_EVENT_TYPES.START,
      payload: { courseId: 'skyline', actionId: 'start' }
    })
    state.phase = MINIGOLF_PHASES.FINISHED
    state.winnerId = 'a'
    state.readyMap = { a: true, b: true }
    state.votes = { a: 'forge', b: 'forge' }
    state.playerStates = { a: { strokesThisHole: 3 }, b: { strokesThisHole: 4 } }
    state = applyMiniGolfEvent(state, {
      eventType: MINIGOLF_EVENT_TYPES.REMATCH,
      payload: { actionId: 'rematch' }
    })

    expect(state.phase).toBe(MINIGOLF_PHASES.LOBBY)
    expect(state.players.map((player) => player.id)).toEqual(['a', 'b'])
    expect(state.votes).toEqual({})
    expect(state.readyMap).toEqual({ a: false, b: false })
    expect(state.playerStates).toEqual({})
    expect(state.winnerId).toBeNull()
  })

  it('advances turn order and finishes a hole', () => {
    let state = createInitialMiniGolfState()
    state = join(state, 'a', 'Alpha')
    state = join(state, 'b', 'Bravo')
    state = applyMiniGolfEvent(state, {
      eventType: MINIGOLF_EVENT_TYPES.START,
      payload: { courseId: 'skyline', actionId: 'start' }
    })
    state = applyMiniGolfEvent(state, {
      eventType: MINIGOLF_EVENT_TYPES.SHOT,
      payload: {
        playerId: 'a',
        actionId: 'shot-a',
        result: {
          finalPosition: { x: 14, z: 0 },
          checkpoint: { x: -14, z: 0 },
          inHole: true,
          resultType: 'cup'
        }
      }
    })

    expect(state.currentTurnPlayerId).toBe('b')
    state = applyMiniGolfEvent(state, {
      eventType: MINIGOLF_EVENT_TYPES.SHOT,
      payload: {
        playerId: 'b',
        actionId: 'shot-b',
        result: {
          finalPosition: { x: 14, z: 0 },
          checkpoint: { x: -14, z: 0 },
          inHole: true,
          resultType: 'cup'
        }
      }
    })

    expect(state.phase).toBe(MINIGOLF_PHASES.HOLE_SUMMARY)
    expect(state.currentTurnPlayerId).toBe(null)
  })

  it('builds a sorted leaderboard by score', () => {
    let state = createInitialMiniGolfState()
    state = join(state, 'a', 'Alpha')
    state = join(state, 'b', 'Bravo')
    state.scorecards = {
      a: { totalStrokes: 6, relativeToPar: -1, holes: {} },
      b: { totalStrokes: 7, relativeToPar: 1, holes: {} }
    }
    state.playerStates = {
      a: { strokesThisHole: 2, finishedHole: true },
      b: { strokesThisHole: 4, finishedHole: false }
    }

    const leaderboard = getMiniGolfLeaderboard(state)
    expect(leaderboard[0].id).toBe('a')
    expect(leaderboard[1].id).toBe('b')
  })

  it('removes readiness and votes when a player leaves', () => {
    let state = createInitialMiniGolfState()
    state = join(state, 'a', 'Alpha')
    state = join(state, 'b', 'Bravo')
    state = applyMiniGolfEvent(state, {
      eventType: MINIGOLF_EVENT_TYPES.READY,
      payload: { playerId: 'b', ready: true, actionId: 'ready-b' }
    })
    state = applyMiniGolfEvent(state, {
      eventType: MINIGOLF_EVENT_TYPES.VOTE,
      payload: { playerId: 'b', courseId: 'forge', actionId: 'vote-b-leave' }
    })
    state = applyMiniGolfEvent(state, {
      eventType: MINIGOLF_EVENT_TYPES.LEAVE,
      payload: { playerId: 'b', actionId: 'leave-b' }
    })

    expect(state.players.map((player) => player.id)).toEqual(['a'])
    expect(state.readyMap.b).toBeUndefined()
    expect(state.votes.b).toBeUndefined()
  })
})
