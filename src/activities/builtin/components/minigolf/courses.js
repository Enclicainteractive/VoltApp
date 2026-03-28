import { COURSE_ORDER, DEFAULT_CUP_RADIUS, MINIGOLF_POWERUP_ROTATION, SURFACE_PRESETS } from './constants'
import { canyonCourse } from './course-data/canyon'
import { neonCourse } from './course-data/neon'
import { orbitalCourse } from './course-data/orbital'
import { ruinsCourse } from './course-data/ruins'
import { gardenCourse } from './course-data/garden'
import { dunesCourse } from './course-data/dunes'
import { gooLagoonCourse } from './course-data/goo-lagoon'

const boxSurface = (id, type, x, z, width, depth, extra = {}) => ({
  id,
  type,
  shape: 'box',
  position: { x, z },
  size: { x: width, z: depth },
  ...extra
})

const boxObstacle = (id, x, z, width, depth, extra = {}) => ({
  id,
  type: 'wall',
  shape: 'box',
  position: { x, z },
  size: { x: width, z: depth },
  height: extra.height || 1.4,
  ...extra
})

const boxHazard = (id, type, x, z, width, depth, extra = {}) => ({
  id,
  type,
  shape: 'box',
  position: { x, z },
  size: { x: width, z: depth },
  ...extra
})

const movingHazard = (id, type, baseX, baseZ, sizeX, sizeZ, movement) => ({
  id,
  type,
  shape: 'box',
  position: { x: baseX, z: baseZ },
  size: { x: sizeX, z: sizeZ },
  movement
})

const baseTheme = {
  skyline: {
    id: 'skyline',
    name: 'Skyline Circuit',
    palette: {
      backgroundTop: '#1f355c',
      backgroundBottom: '#091223',
      fairway: '#67bb6b',
      rough: '#2d6a43',
      wall: '#e2edf9',
      hazard: '#4dd7ff',
      accent: '#ff8b5c'
    },
    environment: 'city',
    description: 'Elevated rooftop holes with rails, fans, and split lines.'
  },
  forge: {
    id: 'forge',
    name: 'Forge Run',
    palette: {
      backgroundTop: '#35150d',
      backgroundBottom: '#110806',
      fairway: '#6a7b3f',
      rough: '#3d4721',
      wall: '#63584d',
      hazard: '#ff6b2d',
      accent: '#ffd56f'
    },
    environment: 'industrial',
    description: 'Tighter lanes, lava resets, and moving hammers.'
  },
  glacier: {
    id: 'glacier',
    name: 'Glacier Drift',
    palette: {
      backgroundTop: '#9fd2ff',
      backgroundBottom: '#eaf6ff',
      fairway: '#c8f0ff',
      rough: '#7fc0de',
      wall: '#eff6ff',
      hazard: '#63b2ff',
      accent: '#224968'
    },
    environment: 'snow',
    description: 'Long sight lines, ice slips, and precision rebounds.'
  }
}

const cloneHole = (hole) => JSON.parse(JSON.stringify(hole))

const shiftEntity = (entity, dx = 0, dz = 0) => ({
  ...entity,
  position: entity?.position ? { ...entity.position, x: entity.position.x + dx, z: entity.position.z + dz } : entity?.position,
})

const buildVariantHole = (course, hole, variantIndex) => {
  const cloned = cloneHole(hole)
  const suffix = `variant-${variantIndex + 1}`
  const offset = variantIndex === 0 ? { x: 0.8, z: 1.6 } : variantIndex === 1 ? { x: -1.2, z: -1.8 } : { x: 1.4, z: -1.2 }
  const pickType = (offsetSeed) => MINIGOLF_POWERUP_ROTATION[(Math.abs(course.id.length * 11 + hole.id.length * 7 + variantIndex * 13 + offsetSeed) % MINIGOLF_POWERUP_ROTATION.length)]
  cloned.id = `${cloned.id}-${suffix}`
  cloned.name = `${cloned.name} ${variantIndex === 0 ? 'After Dark' : variantIndex === 1 ? 'Collapse' : 'Chaos'}`
  cloned.par = Math.min(7, cloned.par + (variantIndex === 2 ? 1 : 0))
  cloned.surfaces = (cloned.surfaces || []).map((surface, index) => ({
    ...surface,
    id: `${surface.id}-${suffix}`,
    position: {
      x: surface.position.x + (index % 2 === 0 ? offset.x : -offset.x * 0.45),
      z: surface.position.z + (index % 2 === 0 ? offset.z * 0.25 : offset.z),
    },
  }))
  cloned.obstacles = [
    ...(cloned.obstacles || []).map((obstacle, index) => ({
      ...obstacle,
      id: `${obstacle.id}-${suffix}`,
      position: {
        x: obstacle.position.x + (index % 2 === 0 ? offset.x : -offset.x * 0.4),
        z: obstacle.position.z + (index % 2 === 0 ? -offset.z * 0.3 : offset.z),
      }
    })),
    boxObstacle(`${cloned.id}-chaos-wall`, cloned.cup.x - 2.6, cloned.cup.z + (variantIndex - 1) * 1.8, 1.2, 4.4, {
      variant: variantIndex === 1 ? 'rail' : 'powerup-barricade',
      height: 1.6
    })
  ]
  cloned.hazards = [
    ...(cloned.hazards || []).map((hazard) => ({ ...hazard, id: `${hazard.id}-${suffix}` })),
    boxHazard(`${cloned.id}-blackhole`, 'black-hole', cloned.cup.x - 5 + variantIndex * 1.4, cloned.cup.z + (variantIndex === 1 ? 3.2 : -3.2), 2.6, 2.6),
  ]
  cloned.movingHazards = [
    ...(cloned.movingHazards || []).map((hazard) => ({ ...hazard, id: `${hazard.id}-${suffix}` })),
    movingHazard(`${cloned.id}-ghost-sweeper`, 'ghost', cloned.cup.x - 1.5, cloned.cup.z, 1.6, 1.6, { axis: variantIndex % 2 === 0 ? 'z' : 'x', amplitude: 3.8, speed: 1.1 + variantIndex * 0.12, phase: variantIndex })
  ]
  cloned.powerups = [
    ...(cloned.powerups || []),
    {
      id: `${cloned.id}-pickup-barricade`,
      type: pickType(1),
      position: { x: cloned.tee.x + 5.5, z: cloned.tee.z + (variantIndex === 1 ? 2.8 : -2.8) },
      radius: 0.9,
    },
    {
      id: `${cloned.id}-pickup-ghost`,
      type: pickType(2),
      position: { x: (cloned.tee.x + cloned.cup.x) / 2, z: (cloned.tee.z + cloned.cup.z) / 2 + (variantIndex === 2 ? 3 : -3) },
      radius: 0.9,
    },
    {
      id: `${cloned.id}-pickup-chaos-a`,
      type: pickType(3),
      position: { x: cloned.cup.x - 6.2, z: cloned.cup.z + 1.6 },
      radius: 0.9,
    },
    {
      id: `${cloned.id}-pickup-chaos-b`,
      type: pickType(4),
      position: { x: cloned.tee.x + 10.5, z: cloned.tee.z },
      radius: 0.9,
    }
  ]
  cloned.scenery = [
    ...(cloned.scenery || []),
    { type: course.environment === 'snow' ? 'ice-spire' : course.environment === 'industrial' ? 'smokestack' : 'tower', x: cloned.cup.x - 6, z: cloned.cup.z + 6 },
    { type: course.environment === 'goo' ? 'billboard' : 'aurora', x: cloned.tee.x + 6, z: cloned.tee.z - 6 }
  ]
  return cloned
}

const expandCourseLayouts = (course) => ({
  ...course,
  holes: [
    ...course.holes,
    ...course.holes.slice(0, 3).map((hole, index) => buildVariantHole(course, hole, index))
  ]
})

export const MINIGOLF_COURSES = [
  {
    ...baseTheme.skyline,
    holes: [
      {
        id: 'skyline-1',
        name: 'Rooftop Ribbon',
        par: 3,
        bounds: { minX: -18, maxX: 18, minZ: -11, maxZ: 11 },
        tee: { x: -14, z: 0 },
        cup: { x: 14, z: 0, radius: DEFAULT_CUP_RADIUS },
        surfaces: [
          boxSurface('s1-main', 'fairway', 0, 0, 34, 8),
          boxSurface('s1-left', 'rough', 0, -7.5, 32, 4),
          boxSurface('s1-right', 'rough', 0, 7.5, 32, 4),
          boxSurface('s1-slope', 'fairway', 2, 0, 8, 8, { slope: { x: 0.18, z: 0 } })
        ],
        obstacles: [
          boxObstacle('s1-wall-a', -2, -3, 1.2, 4, { variant: 'rail' }),
          boxObstacle('s1-wall-b', -2, 3, 1.2, 4, { variant: 'rail' }),
          boxObstacle('s1-wall-c', 6, 0, 1.4, 5, { variant: 'wall', height: 1.8 }),
          boxObstacle('s1-post', 11, 0, 1.1, 1.1, { variant: 'bumper-post', height: 1.5 })
        ],
        hazards: [
          boxHazard('s1-water-top', 'water', 8, -8.5, 12, 2.5),
          boxHazard('s1-water-bottom', 'water', 8, 8.5, 12, 2.5)
        ],
        movingHazards: [],
        scenery: [{ type: 'tower', x: -12, z: -9 }, { type: 'tower', x: 12, z: 9 }, { type: 'billboard', x: 2, z: -10 }]
      },
      {
        id: 'skyline-2',
        name: 'Split Decision',
        par: 4,
        bounds: { minX: -18, maxX: 18, minZ: -11, maxZ: 11 },
        tee: { x: -15, z: -6 },
        cup: { x: 15, z: 6, radius: DEFAULT_CUP_RADIUS },
        surfaces: [
          boxSurface('s2-left-lane', 'fairway', -2, -5.5, 26, 5),
          boxSurface('s2-right-lane', 'fairway', 3, 5.5, 24, 5),
          boxSurface('s2-middle-rough', 'rough', 0, 0, 34, 5),
          boxSurface('s2-boost', 'boost', 0, -5.5, 4, 3, { boost: 1.24 })
        ],
        obstacles: [
          boxObstacle('s2-blocker-a', -1, -0.5, 3, 2, { variant: 'wall', height: 1.8 }),
          boxObstacle('s2-blocker-b', 4, 0.5, 3, 2, { variant: 'wall', height: 1.8 }),
          boxObstacle('s2-guard', 10, 6, 1.2, 4.5, { variant: 'rail' }),
          boxObstacle('s2-post-a', 9, -5.5, 1.1, 1.1, { variant: 'bumper-post', height: 1.45 }),
          boxObstacle('s2-post-b', 12, 2.5, 1.1, 1.1, { variant: 'bumper-post', height: 1.45 })
        ],
        hazards: [
          boxHazard('s2-drop', 'void', 13, -7.5, 8, 3),
          boxHazard('s2-drop-2', 'void', -8, 7.5, 8, 3)
        ],
        movingHazards: [
          movingHazard('s2-fan', 'bumper', 7, -0.5, 1.8, 1.8, { axis: 'z', amplitude: 5, speed: 0.9 })
        ],
        scenery: [{ type: 'billboard', x: 0, z: -9 }, { type: 'tower', x: -14, z: 9 }]
      },
      {
        id: 'skyline-3',
        name: 'Skybridge Finale',
        par: 5,
        bounds: { minX: -19, maxX: 19, minZ: -12, maxZ: 12 },
        tee: { x: -16, z: 8 },
        cup: { x: 16, z: -8, radius: DEFAULT_CUP_RADIUS },
        surfaces: [
          boxSurface('s3-ramp-entry', 'fairway', -10, 7.5, 12, 5, { slope: { x: 0.26, z: -0.08 } }),
          boxSurface('s3-bridge', 'fairway', -1, 2, 10, 3),
          boxSurface('s3-center', 'rough', 4, -2, 12, 7),
          boxSurface('s3-ice-pocket', 'ice', 10, -6.5, 6, 4),
          boxSurface('s3-finish', 'fairway', 14, -8, 8, 5)
        ],
        obstacles: [
          boxObstacle('s3-post-a', -6, 3, 1.2, 5, { variant: 'rail' }),
          boxObstacle('s3-post-b', 2, 4, 1.2, 5, { variant: 'wall', height: 1.9 }),
          boxObstacle('s3-post-c', 7, -4, 1.2, 6, { variant: 'wall', height: 1.9 }),
          boxObstacle('s3-bumper', 12, -1.5, 1.2, 1.2, { variant: 'bumper-post', height: 1.5 })
        ],
        hazards: [
          boxHazard('s3-gap-a', 'void', -3, 7.5, 5, 4),
          boxHazard('s3-gap-b', 'void', 5, 7.5, 5, 4),
          boxHazard('s3-water', 'water', 9, 1, 6, 3)
        ],
        movingHazards: [
          movingHazard('s3-spinner', 'bumper', 10, -1, 2.4, 2.4, { axis: 'x', amplitude: 3.8, speed: 1.15 })
        ],
        scenery: [{ type: 'tower', x: -15, z: 10 }, { type: 'tower', x: 15, z: -10 }, { type: 'billboard', x: -1, z: -10 }]
      },
      {
        id: 'skyline-4',
        name: 'Transit Switch',
        par: 4,
        bounds: { minX: -19, maxX: 19, minZ: -12, maxZ: 12 },
        tee: { x: -16, z: -7 },
        cup: { x: 16, z: 7, radius: DEFAULT_CUP_RADIUS },
        surfaces: [
          boxSurface('s4-entry', 'fairway', -11, -7, 10, 4),
          boxSurface('s4-middle-a', 'fairway', -2, -2.5, 8, 4),
          boxSurface('s4-middle-b', 'fairway', 6, 2.5, 10, 4, { slope: { x: 0.18, z: 0.16 } }),
          boxSurface('s4-finish', 'fairway', 14, 7, 7, 4),
          boxSurface('s4-recovery', 'rough', 0, 8.5, 28, 3)
        ],
        obstacles: [
          boxObstacle('s4-rail-a', -7, -3.8, 1.2, 5.2, { variant: 'rail' }),
          boxObstacle('s4-rail-b', 1, 1.4, 1.2, 5.6, { variant: 'wall', height: 1.8 }),
          boxObstacle('s4-rail-c', 10, 4.5, 1.2, 5.2, { variant: 'rail' }),
          boxObstacle('s4-post-a', 5, -4.6, 1.1, 1.1, { variant: 'bumper-post', height: 1.5 })
        ],
        hazards: [
          boxHazard('s4-gap-top', 'void', -1, -9, 12, 2.4),
          boxHazard('s4-gap-bottom', 'water', 9, 9, 10, 2.4)
        ],
        movingHazards: [
          movingHazard('s4-sweeper', 'bumper', 7, 0.4, 2, 2, { axis: 'z', amplitude: 4.2, speed: 1.05 })
        ],
        scenery: [{ type: 'billboard', x: -12, z: 10 }, { type: 'tower', x: 15, z: -10 }]
      },
      {
        id: 'skyline-5',
        name: 'Penthouse Loop',
        par: 5,
        bounds: { minX: -20, maxX: 20, minZ: -12, maxZ: 12 },
        tee: { x: -17, z: 0 },
        cup: { x: 17, z: 0, radius: DEFAULT_CUP_RADIUS },
        surfaces: [
          boxSurface('s5-entry', 'fairway', -13, 0, 8, 6),
          boxSurface('s5-upper', 'fairway', -4, 5.5, 10, 4),
          boxSurface('s5-lower', 'fairway', -4, -5.5, 10, 4),
          boxSurface('s5-center', 'ice', 6, 0, 10, 4),
          boxSurface('s5-boost', 'boost', 13, 0, 5, 3, { boost: 1.25 }),
          boxSurface('s5-finish', 'fairway', 17, 0, 4, 5)
        ],
        obstacles: [
          boxObstacle('s5-gate-a', -9, 0, 1.2, 6),
          boxObstacle('s5-mid-a', 0, 3, 1.2, 5.4),
          boxObstacle('s5-mid-b', 0, -3, 1.2, 5.4),
          boxObstacle('s5-post-a', 9, 4.2, 1.15, 1.15, { variant: 'bumper-post', height: 1.5 }),
          boxObstacle('s5-post-b', 9, -4.2, 1.15, 1.15, { variant: 'bumper-post', height: 1.5 })
        ],
        hazards: [
          boxHazard('s5-void-a', 'void', 4, 9, 12, 2.4),
          boxHazard('s5-void-b', 'void', 4, -9, 12, 2.4),
          boxHazard('s5-water-mid', 'water', 12, 6.8, 8, 2.4)
        ],
        movingHazards: [
          movingHazard('s5-orb-a', 'bumper', 6, 0, 2.2, 2.2, { axis: 'z', amplitude: 5, speed: 1 }),
          movingHazard('s5-orb-b', 'bumper', 12, 0, 2.2, 2.2, { axis: 'x', amplitude: 3.4, speed: 1.2, phase: Math.PI / 2 })
        ],
        scenery: [{ type: 'tower', x: -16, z: -10 }, { type: 'billboard', x: 0, z: 10 }, { type: 'tower', x: 16, z: 10 }]
      }
    ]
  },
  {
    ...baseTheme.forge,
    holes: [
      {
        id: 'forge-1',
        name: 'Slag Chute',
        par: 3,
        bounds: { minX: -18, maxX: 18, minZ: -11, maxZ: 11 },
        tee: { x: -14, z: 0 },
        cup: { x: 14, z: 0, radius: DEFAULT_CUP_RADIUS },
        surfaces: [
          boxSurface('f1-lane', 'fairway', 0, 0, 34, 6),
          boxSurface('f1-sand', 'sand', 2, -4, 8, 3),
          boxSurface('f1-sand-2', 'sand', 6, 4, 8, 3),
          boxSurface('f1-rough', 'rough', 0, 8, 34, 4)
        ],
        obstacles: [
          boxObstacle('f1-wall-a', -3, 3, 1.2, 4),
          boxObstacle('f1-wall-b', 3, -3, 1.2, 4),
          boxObstacle('f1-wall-c', 9, 0, 1.6, 5)
        ],
        hazards: [
          boxHazard('f1-lava-a', 'lava', -1, -8.5, 12, 2.5),
          boxHazard('f1-lava-b', 'lava', 7, 8.5, 12, 2.5)
        ],
        movingHazards: [],
        scenery: [{ type: 'smokestack', x: -12, z: -9 }, { type: 'forge', x: 10, z: 9 }]
      },
      {
        id: 'forge-2',
        name: 'Hammer Lane',
        par: 4,
        bounds: { minX: -18, maxX: 18, minZ: -11, maxZ: 11 },
        tee: { x: -15, z: -7 },
        cup: { x: 15, z: 7, radius: DEFAULT_CUP_RADIUS },
        surfaces: [
          boxSurface('f2-lane-a', 'fairway', -7, -5.5, 14, 5),
          boxSurface('f2-corner', 'fairway', 0, 0, 6, 6),
          boxSurface('f2-lane-b', 'fairway', 8, 5.5, 14, 5),
          boxSurface('f2-sticky', 'sticky', 1, -2.5, 6, 3)
        ],
        obstacles: [
          boxObstacle('f2-block-a', -1, -5, 1.2, 5),
          boxObstacle('f2-block-b', 5, 1.5, 1.2, 5),
          boxObstacle('f2-block-c', 12, 3.5, 1.2, 5)
        ],
        hazards: [
          boxHazard('f2-lava', 'lava', 8, -8.5, 10, 2.5),
          boxHazard('f2-lava-2', 'lava', -8, 8.5, 10, 2.5)
        ],
        movingHazards: [
          movingHazard('f2-hammer-a', 'bumper', -4, -1, 2.2, 2.2, { axis: 'z', amplitude: 5.5, speed: 1.2 }),
          movingHazard('f2-hammer-b', 'bumper', 7, 1, 2.2, 2.2, { axis: 'z', amplitude: 5.5, speed: 1.35, phase: Math.PI / 2 })
        ],
        scenery: [{ type: 'anvil', x: 0, z: -9 }, { type: 'smokestack', x: 13, z: 9 }]
      },
      {
        id: 'forge-3',
        name: 'Foundry Crown',
        par: 5,
        bounds: { minX: -19, maxX: 19, minZ: -12, maxZ: 12 },
        tee: { x: -16, z: 0 },
        cup: { x: 15, z: 0, radius: DEFAULT_CUP_RADIUS },
        surfaces: [
          boxSurface('f3-entry', 'fairway', -10, 0, 10, 8),
          boxSurface('f3-mid', 'fairway', 0, 0, 9, 5, { slope: { x: 0.2, z: 0 } }),
          boxSurface('f3-ice-run', 'ice', 7, 0, 8, 5),
          boxSurface('f3-finish', 'fairway', 14, 0, 6, 7)
        ],
        obstacles: [
          boxObstacle('f3-guard-left', -3, -4, 1.2, 6),
          boxObstacle('f3-guard-right', -3, 4, 1.2, 6),
          boxObstacle('f3-finisher', 10, 4, 1.2, 5),
          boxObstacle('f3-finisher-2', 10, -4, 1.2, 5)
        ],
        hazards: [
          boxHazard('f3-central-lava', 'lava', 4, 0, 5, 3),
          boxHazard('f3-top-lava', 'lava', 12, -9, 10, 2.5),
          boxHazard('f3-bottom-lava', 'lava', 12, 9, 10, 2.5)
        ],
        movingHazards: [
          movingHazard('f3-crown', 'bumper', 7, 0, 2.5, 2.5, { axis: 'z', amplitude: 4, speed: 0.8 })
        ],
        scenery: [{ type: 'forge', x: 0, z: -10 }, { type: 'smokestack', x: -15, z: 10 }]
      },
      {
        id: 'forge-4',
        name: 'Boiler Bypass',
        par: 4,
        bounds: { minX: -19, maxX: 19, minZ: -12, maxZ: 12 },
        tee: { x: -16, z: 7 },
        cup: { x: 16, z: -7, radius: DEFAULT_CUP_RADIUS },
        surfaces: [
          boxSurface('f4-entry', 'fairway', -11, 7, 10, 4),
          boxSurface('f4-corner-a', 'fairway', -3, 2, 8, 4),
          boxSurface('f4-corner-b', 'sticky', 4, -2.5, 7, 4),
          boxSurface('f4-exit', 'fairway', 12, -7, 10, 4),
          boxSurface('f4-sprint', 'boost', 8, -4.8, 4, 3, { boost: 1.22 })
        ],
        obstacles: [
          boxObstacle('f4-wall-a', -7, 4.2, 1.2, 5.2),
          boxObstacle('f4-wall-b', 0, -0.5, 1.2, 5.6),
          boxObstacle('f4-wall-c', 9, -3.6, 1.2, 5.2),
          boxObstacle('f4-post', 13, -5.4, 1.2, 1.2, { variant: 'bumper-post', height: 1.45 })
        ],
        hazards: [
          boxHazard('f4-lava-top', 'lava', -1, 9, 12, 2.4),
          boxHazard('f4-lava-bottom', 'lava', 6, -9, 12, 2.4)
        ],
        movingHazards: [
          movingHazard('f4-sweeper-a', 'bumper', 4, 2, 2.1, 2.1, { axis: 'x', amplitude: 3.8, speed: 1.15 })
        ],
        scenery: [{ type: 'anvil', x: -14, z: -10 }, { type: 'smokestack', x: 15, z: 10 }]
      },
      {
        id: 'forge-5',
        name: 'Molten Gauntlet',
        par: 5,
        bounds: { minX: -20, maxX: 20, minZ: -12, maxZ: 12 },
        tee: { x: -17, z: 0 },
        cup: { x: 17, z: 0, radius: DEFAULT_CUP_RADIUS },
        surfaces: [
          boxSurface('f5-entry', 'fairway', -13, 0, 8, 6),
          boxSurface('f5-sand-a', 'sand', -5, -4.5, 6, 3),
          boxSurface('f5-sand-b', 'sand', -5, 4.5, 6, 3),
          boxSurface('f5-mid', 'fairway', 1, 0, 8, 4),
          boxSurface('f5-ice', 'ice', 9, 0, 8, 4),
          boxSurface('f5-finish', 'fairway', 16, 0, 6, 5)
        ],
        obstacles: [
          boxObstacle('f5-gate-left', -9, -3.2, 1.2, 4.8),
          boxObstacle('f5-gate-right', -9, 3.2, 1.2, 4.8),
          boxObstacle('f5-core-a', 3, -3.5, 1.2, 5.4),
          boxObstacle('f5-core-b', 3, 3.5, 1.2, 5.4),
          boxObstacle('f5-post-a', 11, -4.2, 1.15, 1.15, { variant: 'bumper-post', height: 1.5 }),
          boxObstacle('f5-post-b', 11, 4.2, 1.15, 1.15, { variant: 'bumper-post', height: 1.5 })
        ],
        hazards: [
          boxHazard('f5-lava-center', 'lava', 7, 0, 5, 3),
          boxHazard('f5-lava-top', 'lava', 12, -9, 10, 2.4),
          boxHazard('f5-lava-bottom', 'lava', 12, 9, 10, 2.4)
        ],
        movingHazards: [
          movingHazard('f5-hammer-a', 'bumper', 7, -1.8, 2.2, 2.2, { axis: 'z', amplitude: 3.4, speed: 1.1 }),
          movingHazard('f5-hammer-b', 'bumper', 7, 1.8, 2.2, 2.2, { axis: 'z', amplitude: 3.4, speed: 1.1, phase: Math.PI })
        ],
        scenery: [{ type: 'forge', x: -15, z: 10 }, { type: 'smokestack', x: 0, z: -10 }, { type: 'anvil', x: 16, z: 10 }]
      }
    ]
  },
  {
    ...baseTheme.glacier,
    holes: [
      {
        id: 'glacier-1',
        name: 'Blue Slip',
        par: 3,
        bounds: { minX: -18, maxX: 18, minZ: -11, maxZ: 11 },
        tee: { x: -14, z: -2 },
        cup: { x: 14, z: 2, radius: DEFAULT_CUP_RADIUS },
        surfaces: [
          boxSurface('g1-main', 'ice', 0, 0, 34, 7),
          boxSurface('g1-recovery-a', 'fairway', -8, 7.5, 8, 3),
          boxSurface('g1-recovery-b', 'fairway', 8, -7.5, 8, 3),
          boxSurface('g1-finish', 'fairway', 13, 2, 7, 4)
        ],
        obstacles: [
          boxObstacle('g1-baffle-a', -2, 3, 1.2, 4),
          boxObstacle('g1-baffle-b', 5, -3, 1.2, 4)
        ],
        hazards: [
          boxHazard('g1-water-a', 'water', -1, -8.5, 12, 2.5),
          boxHazard('g1-water-b', 'water', 8, 8.5, 12, 2.5)
        ],
        movingHazards: [],
        scenery: [{ type: 'iceberg', x: -13, z: 9 }, { type: 'ice-spire', x: 12, z: -10 }]
      },
      {
        id: 'glacier-2',
        name: 'Crevasse Ladder',
        par: 4,
        bounds: { minX: -18, maxX: 18, minZ: -11, maxZ: 11 },
        tee: { x: -15, z: 6 },
        cup: { x: 15, z: -6, radius: DEFAULT_CUP_RADIUS },
        surfaces: [
          boxSurface('g2-entry', 'fairway', -9, 6, 10, 4),
          boxSurface('g2-middle', 'ice', 0, 0, 10, 3),
          boxSurface('g2-exit', 'fairway', 9, -6, 10, 4),
          boxSurface('g2-cutback', 'rough', 0, 7.5, 14, 3)
        ],
        obstacles: [
          boxObstacle('g2-post-a', -4, 3, 1.2, 5),
          boxObstacle('g2-post-b', 0, -3, 1.2, 5),
          boxObstacle('g2-post-c', 6, 1, 1.2, 5)
        ],
        hazards: [
          boxHazard('g2-crevasse-a', 'water', -5, -6.5, 8, 3),
          boxHazard('g2-crevasse-b', 'water', 4, 6.5, 8, 3)
        ],
        movingHazards: [
          movingHazard('g2-sweeper', 'bumper', 7, -1, 2, 2, { axis: 'x', amplitude: 4.5, speed: 0.95 })
        ],
        scenery: [{ type: 'aurora', x: 0, z: -10 }, { type: 'ice-spire', x: -15, z: 10 }]
      },
      {
        id: 'glacier-3',
        name: 'Aurora Drop',
        par: 5,
        bounds: { minX: -19, maxX: 19, minZ: -12, maxZ: 12 },
        tee: { x: -16, z: -8 },
        cup: { x: 16, z: 8, radius: DEFAULT_CUP_RADIUS },
        surfaces: [
          boxSurface('g3-entry', 'fairway', -12, -8, 8, 5),
          boxSurface('g3-lift', 'fairway', -4, -3, 8, 4, { slope: { x: 0.2, z: 0.2 } }),
          boxSurface('g3-slide', 'ice', 5, 2, 10, 4),
          boxSurface('g3-boost', 'boost', 12, 5.5, 4, 3, { boost: 1.28 }),
          boxSurface('g3-finish', 'fairway', 15, 8, 6, 4)
        ],
        obstacles: [
          boxObstacle('g3-wall-a', -8, -2, 1.2, 6),
          boxObstacle('g3-wall-b', 1, 5.5, 1.2, 6),
          boxObstacle('g3-wall-c', 8, -4, 1.2, 5)
        ],
        hazards: [
          boxHazard('g3-water-a', 'water', -1, -8.5, 10, 2.5),
          boxHazard('g3-water-b', 'water', 10, -8.5, 8, 2.5),
          boxHazard('g3-water-c', 'water', 5, 10, 12, 2.5)
        ],
        movingHazards: [
          movingHazard('g3-orb-a', 'bumper', 6, 0, 2.1, 2.1, { axis: 'z', amplitude: 4.8, speed: 1.1 }),
          movingHazard('g3-orb-b', 'bumper', 11, 2, 2.1, 2.1, { axis: 'x', amplitude: 3.5, speed: 1.25, phase: Math.PI / 3 })
        ],
        scenery: [{ type: 'ice-spire', x: 14, z: -10 }, { type: 'aurora', x: -2, z: 10 }]
      },
      {
        id: 'glacier-4',
        name: 'Mirror Shelf',
        par: 4,
        bounds: { minX: -19, maxX: 19, minZ: -12, maxZ: 12 },
        tee: { x: -16, z: 7 },
        cup: { x: 16, z: -7, radius: DEFAULT_CUP_RADIUS },
        surfaces: [
          boxSurface('g4-entry', 'fairway', -11, 7, 10, 4),
          boxSurface('g4-slide-a', 'ice', -3, 3, 8, 4),
          boxSurface('g4-slide-b', 'ice', 5, -2.5, 10, 4),
          boxSurface('g4-finish', 'fairway', 14, -7, 8, 4),
          boxSurface('g4-recovery', 'rough', 2, 9, 24, 3)
        ],
        obstacles: [
          boxObstacle('g4-wall-a', -7, 4, 1.2, 5.2),
          boxObstacle('g4-wall-b', 1, -0.5, 1.2, 5.4),
          boxObstacle('g4-wall-c', 10, -4.5, 1.2, 5.2)
        ],
        hazards: [
          boxHazard('g4-rift-top', 'water', -1, 9, 12, 2.4),
          boxHazard('g4-rift-bottom', 'water', 8, -9, 12, 2.4)
        ],
        movingHazards: [
          movingHazard('g4-drift', 'bumper', 7, 0, 2, 2, { axis: 'x', amplitude: 4.2, speed: 0.9 })
        ],
        scenery: [{ type: 'aurora', x: 0, z: -10 }, { type: 'iceberg', x: -15, z: 10 }]
      },
      {
        id: 'glacier-5',
        name: 'Polar Crown',
        par: 5,
        bounds: { minX: -20, maxX: 20, minZ: -12, maxZ: 12 },
        tee: { x: -17, z: 0 },
        cup: { x: 17, z: 0, radius: DEFAULT_CUP_RADIUS },
        surfaces: [
          boxSurface('g5-entry', 'fairway', -13, 0, 8, 6),
          boxSurface('g5-upper', 'fairway', -4, 5.2, 9, 4),
          boxSurface('g5-lower', 'fairway', -4, -5.2, 9, 4),
          boxSurface('g5-core', 'ice', 6, 0, 10, 4),
          boxSurface('g5-boost', 'boost', 13, 0, 5, 3, { boost: 1.26 }),
          boxSurface('g5-finish', 'fairway', 17, 0, 4, 5)
        ],
        obstacles: [
          boxObstacle('g5-gate-a', -9, 0, 1.2, 6),
          boxObstacle('g5-core-a', 1, 3.2, 1.2, 5.4),
          boxObstacle('g5-core-b', 1, -3.2, 1.2, 5.4),
          boxObstacle('g5-post-a', 10, 4, 1.15, 1.15, { variant: 'bumper-post', height: 1.45 }),
          boxObstacle('g5-post-b', 10, -4, 1.15, 1.15, { variant: 'bumper-post', height: 1.45 })
        ],
        hazards: [
          boxHazard('g5-water-top', 'water', 4, 9, 12, 2.4),
          boxHazard('g5-water-bottom', 'water', 4, -9, 12, 2.4),
          boxHazard('g5-crevasse', 'water', 12, 6.5, 8, 2.4)
        ],
        movingHazards: [
          movingHazard('g5-orb-a', 'bumper', 6, 0, 2.1, 2.1, { axis: 'z', amplitude: 4.8, speed: 1 }),
          movingHazard('g5-orb-b', 'bumper', 12, 0, 2.1, 2.1, { axis: 'x', amplitude: 3.2, speed: 1.15, phase: Math.PI / 2 })
        ],
        scenery: [{ type: 'ice-spire', x: -16, z: -10 }, { type: 'aurora', x: 0, z: 10 }, { type: 'iceberg', x: 16, z: 10 }]
      }
    ]
  },
  gooLagoonCourse,
  canyonCourse,
  neonCourse,
  ruinsCourse,
  orbitalCourse,
  gardenCourse,
  dunesCourse
].map(expandCourseLayouts).map((course) => ({
  ...course,
  holeCount: course.holes.length,
  parTotal: course.holes.reduce((sum, hole) => sum + hole.par, 0)
}))

export const getMiniGolfCourse = (courseId) => MINIGOLF_COURSES.find((course) => course.id === courseId) || MINIGOLF_COURSES[0]

export const getMiniGolfHole = (courseId, holeIndex) => {
  const course = getMiniGolfCourse(courseId)
  return course.holes[Math.max(0, Math.min(course.holes.length - 1, Number(holeIndex) || 0))]
}

export const listMiniGolfCourseSummaries = () => MINIGOLF_COURSES.map((course) => ({
  id: course.id,
  name: course.name,
  description: course.description,
  holeCount: course.holeCount,
  parTotal: course.parTotal,
  environment: course.environment
}))

export const getMiniGolfCourseOrder = () => COURSE_ORDER.slice()

export const getMiniGolfCourseByOrder = (orderIndex) => {
  if (orderIndex < 0 || orderIndex >= COURSE_ORDER.length) return null
  return getMiniGolfCourse(COURSE_ORDER[orderIndex])
}

export const getNextCourseId = (courseId) => {
  const currentIndex = COURSE_ORDER.indexOf(courseId)
  if (currentIndex < 0 || currentIndex >= COURSE_ORDER.length - 1) return null
  return COURSE_ORDER[currentIndex + 1]
}

export const getSurfacePreset = (surfaceType) => SURFACE_PRESETS[surfaceType] || SURFACE_PRESETS.fairway
