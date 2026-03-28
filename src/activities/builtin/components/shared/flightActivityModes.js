const CANONICAL_FLIGHT_MODES = {
  'builtin:sky-raid': {
    id: 'builtin:sky-raid',
    title: 'Sky Raid',
    subtitle: 'Large-scale dogfight across stacked islands, tower corridors, and aggressive repair lines.',
    objective: 'combat',
    worldRadius: 290,
    maxHeight: 118,
    fogFar: 540,
    sky: ['#02141f', '#0d3953'],
    accent: '#38bdf8',
    terrainSeed: 11,
    groundColor: '#14532d',
    starCount: 1600,
    islandCount: 24,
    towerCount: 18,
    cloudCount: 20,
    pickupCount: 16,
    spawnRadiusFactor: 0.26,
    cameraDistance: 21,
    cameraHeight: 7.2,
    cameraLerp: 0.075,
    fov: 64,
    scoreTarget: 12,
    legacyIds: [
      'builtin:orbital-strike',
      'builtin:glacier-gunners',
      'builtin:island-patrol',
      'builtin:desert-ace',
      'builtin:neon-drone-arena'
    ]
  },
  'builtin:sky-derby-3d': {
    id: 'builtin:sky-derby-3d',
    title: 'Sky Derby 3D',
    subtitle: 'Checkpoint racing through a giant cloud circuit with boost lines, vertical arcs, and wider speed lanes.',
    objective: 'race',
    worldRadius: 320,
    maxHeight: 132,
    fogFar: 610,
    sky: ['#071426', '#1d4ed8'],
    accent: '#facc15',
    terrainSeed: 23,
    groundColor: '#0f766e',
    starCount: 800,
    checkpointCount: 10,
    islandCount: 14,
    towerCount: 20,
    cloudCount: 40,
    pickupCount: 8,
    spawnRadiusFactor: 0.15,
    cameraDistance: 17,
    cameraHeight: 5.6,
    cameraLerp: 0.09,
    fov: 68,
    lapTarget: 4,
    legacyIds: [
      'builtin:asteroid-run-3d',
      'builtin:canyon-wing',
      'builtin:cloud-circuit',
      'builtin:volcano-rush',
      'builtin:storm-chasers-3d'
    ]
  }
}

export const FLIGHT_ACTIVITY_MODE_ALIASES = Object.freeze(
  Object.entries(CANONICAL_FLIGHT_MODES).reduce((accumulator, [canonicalId, mode]) => {
    accumulator[canonicalId] = canonicalId
    ;(mode.legacyIds || []).forEach((legacyId) => {
      accumulator[legacyId] = canonicalId
    })
    return accumulator
  }, {})
)

export const FLIGHT_ACTIVITY_MODES = Object.freeze(
  Object.fromEntries(
    Object.entries(CANONICAL_FLIGHT_MODES).map(([modeId, mode]) => [modeId, Object.freeze({ ...mode, legacyIds: [...(mode.legacyIds || [])] })])
  )
)

export const FLIGHT_ACTIVITY_PRIMARY_IDS = Object.freeze(Object.keys(FLIGHT_ACTIVITY_MODES))

export const normalizeFlightActivityModeId = (activityId) => {
  if (typeof activityId !== 'string') return 'builtin:sky-raid'
  const normalized = activityId.trim()
  if (!normalized) return 'builtin:sky-raid'
  return FLIGHT_ACTIVITY_MODE_ALIASES[normalized] || 'builtin:sky-raid'
}

export const getFlightActivityMode = (activityId) => {
  const modeId = normalizeFlightActivityModeId(activityId)
  return FLIGHT_ACTIVITY_MODES[modeId]
}

export const isPrimaryFlightActivityId = (activityId) => FLIGHT_ACTIVITY_PRIMARY_IDS.includes(activityId)

export const isLegacyFlightActivityId = (activityId) => {
  const modeId = normalizeFlightActivityModeId(activityId)
  return Boolean(activityId) && modeId !== activityId
}
