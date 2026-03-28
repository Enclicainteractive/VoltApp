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
  REMATCH: 'minigolf:rematch',
  COLOR_CHANGE: 'minigolf:color-change',
  SELECT_POWERUP: 'minigolf:select-powerup',
  ACTIVATE_POWERUP: 'minigolf:activate-powerup'
}

export const MINIGOLF_CUTSCENE_TYPES = {
  HOLE_IN_ONE: 'hole-in-one',
  COURSE_COMPLETE: 'course-complete',
  COURSE_UNLOCK: 'course-unlock',
  POWERUP_COLLECTED: 'powerup-collected',
  BLACK_HOLE: 'black-hole',
  LAVA_RESET: 'lava-reset',
  MOVING_HAZARD_HIT: 'moving-hazard-hit',
  PERFECT_PAR: 'perfect-par',
  COMEBACK_VICTORY: 'comeback-victory',
  FIRST_PLACE_TAKEOVER: 'first-place-takeover',
  EAGLE: 'eagle',
  ALBATROSS: 'albatross'
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

export const COURSE_ORDER = ['skyline', 'forge', 'glacier', 'goo-lagoon', 'canyon', 'neon', 'ruins', 'orbital', 'garden', 'dunes']

export const SURFACE_PRESETS = {
  fairway: { friction: 0.985, bounce: 0.82, color: '#5cae63' },
  rough: { friction: 0.956, bounce: 0.76, color: '#3f7f49' },
  sand: { friction: 0.9, bounce: 0.52, color: '#c8ad6f' },
  ice: { friction: 0.994, bounce: 0.88, color: '#a8dcff' },
  boost: { friction: 0.99, bounce: 0.94, color: '#78f4d7' },
  sticky: { friction: 0.79, bounce: 0.34, color: '#6b5a7b', drag: 0.72, trapThreshold: 1.2 }
}

export const MINIGOLF_POWERUP_TYPES = {
  OVERDRIVE: 'overdrive',
  MAGNET: 'magnet',
  GRIT: 'grit',
  BARRICADE: 'barricade',
  GHOST_BALL: 'ghost-ball',
  TURBO: 'turbo',
  ROCKET: 'rocket',
  SLINGSHOT: 'slingshot',
  WIDE_CUP: 'wide-cup',
  LUCKY_BOUNCE: 'lucky-bounce',
  FEATHER: 'feather',
  ANCHOR: 'anchor',
  FROST_COAT: 'frost-coat',
  SPIN_SHIFT: 'spin-shift',
  BANK_SHOT: 'bank-shot',
  MINE_LAYER: 'mine-layer',
  OIL_SLICK: 'oil-slick',
  CHAOS_GATE: 'chaos-gate',
  RICOCHET: 'ricochet',
  PULSE_WALL: 'pulse-wall',
  HONEY_TRAP: 'honey-trap',
  STORM_CELL: 'storm-cell',
  JOLT: 'jolt',
  VORTEX_SEED: 'vortex-seed',
  BUMPER_SEED: 'bumper-seed',
  TUNNEL_DRIFT: 'tunnel-drift',
  MIRROR_EDGE: 'mirror-edge',
  SPIKE_STRIP: 'spike-strip',
  ECHO_BALL: 'echo-ball',
  GLUE_COAT: 'glue-coat',
  AFTERIMAGE: 'afterimage',
  RAIL_RIDER: 'rail-rider',
  LONG_PUTTER: 'long-putter',
  SHORT_GAME: 'short-game',
  ORBITER: 'orbiter',
  PINBALL: 'pinball',
  MIST_WALKER: 'mist-walker',
  CUP_STEALER: 'cup-stealer',
  SAFE_FALL: 'safe-fall'
}

const createPowerupDef = (id, label, description, color, extra = {}) => ({
  id,
  label,
  description,
  color,
  ...extra
})

export const MINIGOLF_POWERUP_DEFS = {
  [MINIGOLF_POWERUP_TYPES.OVERDRIVE]: createPowerupDef(MINIGOLF_POWERUP_TYPES.OVERDRIVE, 'Overdrive', 'Your next shot launches harder and holds speed longer.', '#fb7185', { speedMultiplier: 1.24, frictionScale: 1.012 }),
  [MINIGOLF_POWERUP_TYPES.MAGNET]: createPowerupDef(MINIGOLF_POWERUP_TYPES.MAGNET, 'Cup Magnet', 'Your next shot gets a wider cup catch radius.', '#38bdf8', { cupRadiusBonus: 0.22, cupCaptureSpeedMultiplier: 1.25 }),
  [MINIGOLF_POWERUP_TYPES.GRIT]: createPowerupDef(MINIGOLF_POWERUP_TYPES.GRIT, 'Grip Compound', 'Ignore sticky glue drag on your next shot.', '#facc15', { ignoreSticky: true }),
  [MINIGOLF_POWERUP_TYPES.BARRICADE]: createPowerupDef(MINIGOLF_POWERUP_TYPES.BARRICADE, 'Blockade Kit', 'Drops a chunky barricade after your next shot.', '#fb923c', { spawnObstacleType: 'powerup-barricade' }),
  [MINIGOLF_POWERUP_TYPES.GHOST_BALL]: createPowerupDef(MINIGOLF_POWERUP_TYPES.GHOST_BALL, 'Ghost Ball', 'Spawns a roaming phantom bumper that can backfire later.', '#c084fc', { spawnHazardType: 'ghost', spawnHazardMovement: 'drift' }),
  [MINIGOLF_POWERUP_TYPES.TURBO]: createPowerupDef(MINIGOLF_POWERUP_TYPES.TURBO, 'Turbo Charge', 'More launch speed and a little extra carry.', '#ef4444', { speedMultiplier: 1.33 }),
  [MINIGOLF_POWERUP_TYPES.ROCKET]: createPowerupDef(MINIGOLF_POWERUP_TYPES.ROCKET, 'Rocket Core', 'Maximum send. Hard to control.', '#f97316', { speedMultiplier: 1.45, bounceScale: 1.04 }),
  [MINIGOLF_POWERUP_TYPES.SLINGSHOT]: createPowerupDef(MINIGOLF_POWERUP_TYPES.SLINGSHOT, 'Slingshot', 'Fast off the tee with snappier rebounds.', '#fb7185', { speedMultiplier: 1.18, bounceScale: 1.1 }),
  [MINIGOLF_POWERUP_TYPES.WIDE_CUP]: createPowerupDef(MINIGOLF_POWERUP_TYPES.WIDE_CUP, 'Wide Cup', 'Makes the cup feel forgiving for one putt.', '#60a5fa', { cupRadiusBonus: 0.3 }),
  [MINIGOLF_POWERUP_TYPES.LUCKY_BOUNCE]: createPowerupDef(MINIGOLF_POWERUP_TYPES.LUCKY_BOUNCE, 'Lucky Bounce', 'Rebounds are extra lively.', '#fde68a', { bounceScale: 1.18 }),
  [MINIGOLF_POWERUP_TYPES.FEATHER]: createPowerupDef(MINIGOLF_POWERUP_TYPES.FEATHER, 'Feather Ball', 'Glides longer with softer wall loss.', '#e0f2fe', { frictionScale: 1.016, bounceScale: 0.96 }),
  [MINIGOLF_POWERUP_TYPES.ANCHOR]: createPowerupDef(MINIGOLF_POWERUP_TYPES.ANCHOR, 'Anchor Ball', 'Less speed but more control and less rebound.', '#94a3b8', { speedMultiplier: 0.88, bounceScale: 0.78 }),
  [MINIGOLF_POWERUP_TYPES.FROST_COAT]: createPowerupDef(MINIGOLF_POWERUP_TYPES.FROST_COAT, 'Frost Coat', 'Skates over rough and carries speed.', '#67e8f9', { frictionScale: 1.02 }),
  [MINIGOLF_POWERUP_TYPES.SPIN_SHIFT]: createPowerupDef(MINIGOLF_POWERUP_TYPES.SPIN_SHIFT, 'Spin Shift', 'Applies a slight sideways curl.', '#a78bfa', { curveForce: 0.42 }),
  [MINIGOLF_POWERUP_TYPES.BANK_SHOT]: createPowerupDef(MINIGOLF_POWERUP_TYPES.BANK_SHOT, 'Bank Shot', 'Rewards rails with extra bounce.', '#f59e0b', { bounceScale: 1.22 }),
  [MINIGOLF_POWERUP_TYPES.MINE_LAYER]: createPowerupDef(MINIGOLF_POWERUP_TYPES.MINE_LAYER, 'Mine Layer', 'Drops a nasty static hazard behind your route.', '#f43f5e', { spawnHazardType: 'mine' }),
  [MINIGOLF_POWERUP_TYPES.OIL_SLICK]: createPowerupDef(MINIGOLF_POWERUP_TYPES.OIL_SLICK, 'Oil Slick', 'Leaves a slippery puddle for the field.', '#0f172a', { spawnHazardType: 'oil' }),
  [MINIGOLF_POWERUP_TYPES.CHAOS_GATE]: createPowerupDef(MINIGOLF_POWERUP_TYPES.CHAOS_GATE, 'Chaos Gate', 'Creates a volatile reset gate mid-lane.', '#7c3aed', { spawnHazardType: 'black-hole' }),
  [MINIGOLF_POWERUP_TYPES.RICOCHET]: createPowerupDef(MINIGOLF_POWERUP_TYPES.RICOCHET, 'Ricochet', 'Wall impacts preserve more speed.', '#fbbf24', { wallRestitutionScale: 1.18 }),
  [MINIGOLF_POWERUP_TYPES.PULSE_WALL]: createPowerupDef(MINIGOLF_POWERUP_TYPES.PULSE_WALL, 'Pulse Wall', 'Creates a luminous thin blocker.', '#fb923c', { spawnObstacleType: 'pulse-wall' }),
  [MINIGOLF_POWERUP_TYPES.HONEY_TRAP]: createPowerupDef(MINIGOLF_POWERUP_TYPES.HONEY_TRAP, 'Honey Trap', 'Drops a sticky trap for later players.', '#fbbf24', { spawnHazardType: 'sticky-field' }),
  [MINIGOLF_POWERUP_TYPES.STORM_CELL]: createPowerupDef(MINIGOLF_POWERUP_TYPES.STORM_CELL, 'Storm Cell', 'Adds a drifting electric bumper.', '#38bdf8', { spawnHazardType: 'storm', spawnHazardMovement: 'drift' }),
  [MINIGOLF_POWERUP_TYPES.JOLT]: createPowerupDef(MINIGOLF_POWERUP_TYPES.JOLT, 'Jolt', 'Adds a little acceleration and spin.', '#facc15', { speedMultiplier: 1.08, curveForce: 0.28 }),
  [MINIGOLF_POWERUP_TYPES.VORTEX_SEED]: createPowerupDef(MINIGOLF_POWERUP_TYPES.VORTEX_SEED, 'Vortex Seed', 'Plants a mini vortex hazard behind you.', '#8b5cf6', { spawnHazardType: 'black-hole' }),
  [MINIGOLF_POWERUP_TYPES.BUMPER_SEED]: createPowerupDef(MINIGOLF_POWERUP_TYPES.BUMPER_SEED, 'Bumper Seed', 'Sprouts a round bumper post.', '#fb7185', { spawnObstacleType: 'bumper-post' }),
  [MINIGOLF_POWERUP_TYPES.TUNNEL_DRIFT]: createPowerupDef(MINIGOLF_POWERUP_TYPES.TUNNEL_DRIFT, 'Tunnel Drift', 'Longer carry with lower side loss.', '#22d3ee', { frictionScale: 1.014, curveForce: 0.18 }),
  [MINIGOLF_POWERUP_TYPES.MIRROR_EDGE]: createPowerupDef(MINIGOLF_POWERUP_TYPES.MIRROR_EDGE, 'Mirror Edge', 'Clean rebounds and a slightly wider catch.', '#e5e7eb', { bounceScale: 1.1, cupRadiusBonus: 0.08 }),
  [MINIGOLF_POWERUP_TYPES.SPIKE_STRIP]: createPowerupDef(MINIGOLF_POWERUP_TYPES.SPIKE_STRIP, 'Spike Strip', 'Drops a harsh narrow blocker strip.', '#ef4444', { spawnObstacleType: 'spike-strip' }),
  [MINIGOLF_POWERUP_TYPES.ECHO_BALL]: createPowerupDef(MINIGOLF_POWERUP_TYPES.ECHO_BALL, 'Echo Ball', 'Summons a follower hazard on your line.', '#c084fc', { spawnHazardType: 'ghost', spawnHazardMovement: 'echo' }),
  [MINIGOLF_POWERUP_TYPES.GLUE_COAT]: createPowerupDef(MINIGOLF_POWERUP_TYPES.GLUE_COAT, 'Glue Coat', 'Makes your next shot settle earlier.', '#9333ea', { frictionScale: 0.92 }),
  [MINIGOLF_POWERUP_TYPES.AFTERIMAGE]: createPowerupDef(MINIGOLF_POWERUP_TYPES.AFTERIMAGE, 'Afterimage', 'Leaves a faint phantom drifter.', '#a78bfa', { spawnHazardType: 'ghost', spawnHazardMovement: 'afterimage' }),
  [MINIGOLF_POWERUP_TYPES.RAIL_RIDER]: createPowerupDef(MINIGOLF_POWERUP_TYPES.RAIL_RIDER, 'Rail Rider', 'Improves rebound speed and control on banks.', '#22c55e', { wallRestitutionScale: 1.12, bounceScale: 1.08 }),
  [MINIGOLF_POWERUP_TYPES.LONG_PUTTER]: createPowerupDef(MINIGOLF_POWERUP_TYPES.LONG_PUTTER, 'Long Putter', 'Adds extra carry for big lanes.', '#10b981', { speedMultiplier: 1.2 }),
  [MINIGOLF_POWERUP_TYPES.SHORT_GAME]: createPowerupDef(MINIGOLF_POWERUP_TYPES.SHORT_GAME, 'Short Game', 'Makes delicate putts stick better.', '#34d399', { cupRadiusBonus: 0.14, frictionScale: 0.96 }),
  [MINIGOLF_POWERUP_TYPES.ORBITER]: createPowerupDef(MINIGOLF_POWERUP_TYPES.ORBITER, 'Orbiter', 'Spawn a moving orbital bumper.', '#3b82f6', { spawnHazardType: 'ghost', spawnHazardMovement: 'orbit' }),
  [MINIGOLF_POWERUP_TYPES.PINBALL]: createPowerupDef(MINIGOLF_POWERUP_TYPES.PINBALL, 'Pinball', 'Maximum bounce chaos.', '#f59e0b', { bounceScale: 1.28, wallRestitutionScale: 1.16 }),
  [MINIGOLF_POWERUP_TYPES.MIST_WALKER]: createPowerupDef(MINIGOLF_POWERUP_TYPES.MIST_WALKER, 'Mist Walker', 'Ignores sticky and glides a bit longer.', '#c4b5fd', { ignoreSticky: true, frictionScale: 1.008 }),
  [MINIGOLF_POWERUP_TYPES.CUP_STEALER]: createPowerupDef(MINIGOLF_POWERUP_TYPES.CUP_STEALER, 'Cup Stealer', 'Big magnet, but a little less launch.', '#38bdf8', { cupRadiusBonus: 0.36, speedMultiplier: 0.92 }),
  [MINIGOLF_POWERUP_TYPES.SAFE_FALL]: createPowerupDef(MINIGOLF_POWERUP_TYPES.SAFE_FALL, 'Safe Fall', 'Resets from hazards without extra chaos.', '#86efac', { safeFall: true, ignoreSticky: true }),
}

export const MINIGOLF_POWERUP_ROTATION = Object.keys(MINIGOLF_POWERUP_DEFS)
export const MINIGOLF_POWERUP_INVENTORY_LIMIT = 4

export const DEFAULT_BALL_RADIUS = 0.34
export const DEFAULT_CUP_RADIUS = 0.5
export const MAX_PLAYERS = 8
