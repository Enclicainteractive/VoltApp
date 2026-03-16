export const MINIGOLF_PHASES = {
  LOBBY: 'lobby',
  PLAYING: 'playing',
  HOLE_SUMMARY: 'hole-summary',
  FINISHED: 'finished'
}

export const MINIGOLF_EVENT_TYPES = {
  JOIN: 'minigolf:join',
  LEAVE: 'minigolf:leave',
  READY: 'minigolf:ready',
  VOTE: 'minigolf:vote',
  START: 'minigolf:start',
  SHOT: 'minigolf:shot',
  ADVANCE_HOLE: 'minigolf:advance-hole',
  REMATCH: 'minigolf:rematch'
}

export const PLAYER_COLORS = [
  '#f97316',
  '#22c55e',
  '#06b6d4',
  '#f43f5e',
  '#a855f7',
  '#eab308',
  '#3b82f6',
  '#14b8a6'
]

export const BALL_COLOR_OPTIONS = [
  '#ffffff',
  '#f97316',
  '#22c55e',
  '#06b6d4',
  '#f43f5e',
  '#a855f7',
  '#eab308',
  '#3b82f6',
  '#14b8a6',
  '#fb7185',
  '#34d399',
  '#facc15'
]

export const COURSE_ORDER = ['skyline', 'forge', 'glacier', 'canyon', 'neon', 'ruins', 'orbital', 'garden', 'dunes']

export const SURFACE_PRESETS = {
  fairway: { friction: 0.985, bounce: 0.82, color: '#5cae63' },
  rough: { friction: 0.956, bounce: 0.76, color: '#3f7f49' },
  sand: { friction: 0.9, bounce: 0.52, color: '#c8ad6f' },
  ice: { friction: 0.994, bounce: 0.88, color: '#a8dcff' },
  boost: { friction: 0.99, bounce: 0.94, color: '#78f4d7' },
  sticky: { friction: 0.88, bounce: 0.48, color: '#6b5a7b' }
}

export const DEFAULT_BALL_RADIUS = 0.34
export const DEFAULT_CUP_RADIUS = 0.5
export const MAX_PLAYERS = 8
