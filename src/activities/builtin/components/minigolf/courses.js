import { COURSE_ORDER, DEFAULT_CUP_RADIUS, SURFACE_PRESETS } from './constants'
import { canyonCourse } from './course-data/canyon'
import { neonCourse } from './course-data/neon'
import { orbitalCourse } from './course-data/orbital'
import { ruinsCourse } from './course-data/ruins'
import { gardenCourse } from './course-data/garden'
import { dunesCourse } from './course-data/dunes'

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
      }
    ]
  },
  canyonCourse,
  neonCourse,
  ruinsCourse,
  orbitalCourse,
  gardenCourse,
  dunesCourse
].map((course) => ({
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
