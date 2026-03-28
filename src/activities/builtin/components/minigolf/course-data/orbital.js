import { DEFAULT_CUP_RADIUS } from '../constants'

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

export const orbitalCourse = {
  id: 'orbital',
  name: 'Orbital Loop',
  palette: {
    backgroundTop: '#1b2454',
    backgroundBottom: '#050816',
    fairway: '#8fd4ff',
    rough: '#2a3b73',
    wall: '#d7e6ff',
    hazard: '#7b61ff',
    accent: '#7cf7ff'
  },
  environment: 'space',
  description: 'Vacuum catwalks, frozen transfer decks, and low-gravity lanes hanging over open space.',
  holes: [
    {
      id: 'orbital-1',
      name: 'Docking Span',
      par: 3,
      bounds: { minX: -18, maxX: 18, minZ: -11, maxZ: 11 },
      tee: { x: -15, z: 0 },
      cup: { x: 14, z: 0, radius: DEFAULT_CUP_RADIUS },
      surfaces: [
        boxSurface('o1-entry', 'fairway', -10, 0, 10, 6),
        boxSurface('o1-boost', 'boost', -2, 0, 5, 4, { boost: 1.22 }),
        boxSurface('o1-middle', 'fairway', 4, 0, 8, 4),
        boxSurface('o1-finish', 'ice', 12, 0, 5, 5)
      ],
      obstacles: [
        boxObstacle('o1-rail-top', -4, -3.2, 1.1, 3.2, { variant: 'rail', height: 1.5 }),
        boxObstacle('o1-rail-bottom', -4, 3.2, 1.1, 3.2, { variant: 'rail', height: 1.5 }),
        boxObstacle('o1-bulkhead', 7, 0, 1.2, 4.6, { variant: 'wall', height: 1.8 }),
        boxObstacle('o1-post', 10.5, 2.2, 1.1, 1.1, { variant: 'bumper-post', height: 1.45 })
      ],
      hazards: [
        boxHazard('o1-void-top', 'void', 4, -7.8, 19, 3),
        boxHazard('o1-void-bottom', 'void', 4, 7.8, 19, 3)
      ],
      movingHazards: [],
      scenery: [
        { type: 'tower', x: -14, z: -9 },
        { type: 'aurora', x: 0, z: 9 },
        { type: 'billboard', x: 12, z: -9 }
      ]
    },
    {
      id: 'orbital-2',
      name: 'Solar Slipway',
      par: 4,
      bounds: { minX: -18, maxX: 18, minZ: -11, maxZ: 11 },
      tee: { x: -15, z: -6 },
      cup: { x: 15, z: 6, radius: DEFAULT_CUP_RADIUS },
      surfaces: [
        boxSurface('o2-lane-a', 'fairway', -9, -6, 10, 4),
        boxSurface('o2-transfer', 'ice', -1, -1.5, 7, 3),
        boxSurface('o2-lane-b', 'fairway', 8, 4.5, 12, 4),
        boxSurface('o2-finish', 'boost', 14, 6, 4, 3, { boost: 1.18 }),
        boxSurface('o2-recovery', 'rough', 0, 7.5, 10, 3)
      ],
      obstacles: [
        boxObstacle('o2-wall-a', -5, -2.5, 1.2, 5, { variant: 'wall', height: 1.8 }),
        boxObstacle('o2-wall-b', 2.5, 2.2, 1.2, 5.4, { variant: 'wall', height: 1.8 }),
        boxObstacle('o2-guard', 11, 6, 1.2, 4.5, { variant: 'rail', height: 1.5 })
      ],
      hazards: [
        boxHazard('o2-void-left', 'void', 1, -8, 9, 2.8),
        boxHazard('o2-void-right', 'void', -6, 8.2, 8, 2.8)
      ],
      movingHazards: [
        movingHazard('o2-satellite-a', 'bumper', 6, -0.5, 2, 2, { axis: 'z', amplitude: 5.1, speed: 1.05 }),
        movingHazard('o2-satellite-b', 'bumper', 10, 1.8, 1.8, 1.8, { axis: 'x', amplitude: 3.5, speed: 1.28, phase: Math.PI / 2 })
      ],
      scenery: [
        { type: 'tower', x: -14, z: 9 },
        { type: 'ice-spire', x: 13, z: -9 },
        { type: 'aurora', x: 2, z: -10 }
      ]
    },
    {
      id: 'orbital-3',
      name: 'Cryo Ring',
      par: 4,
      bounds: { minX: -19, maxX: 19, minZ: -12, maxZ: 12 },
      tee: { x: -16, z: 7 },
      cup: { x: 16, z: -7, radius: DEFAULT_CUP_RADIUS },
      surfaces: [
        boxSurface('o3-entry', 'fairway', -12, 7, 8, 5),
        boxSurface('o3-drop', 'fairway', -5, 3, 6, 4, { slope: { x: 0.18, z: -0.16 } }),
        boxSurface('o3-ring', 'ice', 3, -1, 11, 4),
        boxSurface('o3-pocket', 'rough', 9, -6, 7, 5),
        boxSurface('o3-finish', 'fairway', 15, -7, 5, 4)
      ],
      obstacles: [
        boxObstacle('o3-barrier-a', -8, 3.5, 1.2, 5.4, { variant: 'rail', height: 1.5 }),
        boxObstacle('o3-barrier-b', 0, 3.5, 1.2, 5.4, { variant: 'wall', height: 1.9 }),
        boxObstacle('o3-barrier-c', 8, -1.5, 1.2, 5.8, { variant: 'wall', height: 1.9 }),
        boxObstacle('o3-post', 12, -4, 1.1, 1.1, { variant: 'bumper-post', height: 1.45 })
      ],
      hazards: [
        boxHazard('o3-void-a', 'void', -3, 7.8, 4.5, 3.2),
        boxHazard('o3-void-b', 'void', 5, 7.8, 4.5, 3.2),
        boxHazard('o3-void-c', 'void', 7, -10, 10, 2.8)
      ],
      movingHazards: [
        movingHazard('o3-orbiter', 'bumper', 6.5, -1.5, 2.3, 2.3, { axis: 'z', amplitude: 4.2, speed: 0.92 })
      ],
      scenery: [
        { type: 'billboard', x: -2, z: -10 },
        { type: 'iceberg', x: 14, z: 10 },
        { type: 'tower', x: -16, z: 10 }
      ]
    },
    {
      id: 'orbital-4',
      name: 'Event Horizon',
      par: 5,
      bounds: { minX: -20, maxX: 20, minZ: -12, maxZ: 12 },
      tee: { x: -17, z: 0 },
      cup: { x: 17, z: 0, radius: DEFAULT_CUP_RADIUS },
      surfaces: [
        boxSurface('o4-launch', 'boost', -14, 0, 6, 5, { boost: 1.28 }),
        boxSurface('o4-platform-a', 'fairway', -7, -4, 8, 4),
        boxSurface('o4-platform-b', 'fairway', -1, 4, 8, 4),
        boxSurface('o4-transfer', 'ice', 6, 0, 10, 3),
        boxSurface('o4-finish', 'fairway', 15, 0, 8, 5)
      ],
      obstacles: [
        boxObstacle('o4-rail-a', -9, -0.5, 1.2, 5.5, { variant: 'rail', height: 1.5 }),
        boxObstacle('o4-rail-b', -3, 0.5, 1.2, 5.5, { variant: 'rail', height: 1.5 }),
        boxObstacle('o4-gate-left', 10, -3.2, 1.2, 4.8, { variant: 'wall', height: 1.8 }),
        boxObstacle('o4-gate-right', 10, 3.2, 1.2, 4.8, { variant: 'wall', height: 1.8 })
      ],
      hazards: [
        boxHazard('o4-core-void', 'void', 0, 0, 10, 5),
        boxHazard('o4-outer-void-top', 'void', 6, -8.8, 15, 2.8),
        boxHazard('o4-outer-void-bottom', 'void', 6, 8.8, 15, 2.8)
      ],
      movingHazards: [
        movingHazard('o4-core-sweeper-a', 'bumper', 2.5, -2, 2.1, 2.1, { axis: 'x', amplitude: 4.5, speed: 1.1 }),
        movingHazard('o4-core-sweeper-b', 'bumper', 2.5, 2, 2.1, 2.1, { axis: 'x', amplitude: 4.5, speed: 1.1, phase: Math.PI }),
        movingHazard('o4-finish-orb', 'bumper', 13, 0, 2, 2, { axis: 'z', amplitude: 3.2, speed: 1.35, phase: Math.PI / 3 })
      ],
      scenery: [
        { type: 'aurora', x: -12, z: -10 },
        { type: 'billboard', x: 0, z: 10 },
        { type: 'tower', x: 17, z: -10 }
      ]
    },
    {
      id: 'orbital-5',
      name: 'Debris Carousel',
      par: 4,
      bounds: { minX: -20, maxX: 20, minZ: -12, maxZ: 12 },
      tee: { x: -17, z: -7 },
      cup: { x: 17, z: 7, radius: DEFAULT_CUP_RADIUS },
      surfaces: [
        boxSurface('o5-entry', 'fairway', -13, -7, 8, 4),
        boxSurface('o5-ramp', 'fairway', -5, -3, 8, 4, { slope: { x: 0.2, z: 0.12 } }),
        boxSurface('o5-center', 'ice', 4, 1, 10, 4),
        boxSurface('o5-upper', 'fairway', 11, 5.5, 10, 4),
        boxSurface('o5-finish', 'boost', 16, 7, 4, 3, { boost: 1.2 }),
        boxSurface('o5-recovery', 'rough', 1, -9, 20, 3)
      ],
      obstacles: [
        boxObstacle('o5-rail-a', -9, -3.8, 1.2, 5.2, { variant: 'rail', height: 1.5 }),
        boxObstacle('o5-rail-b', -1, 0.5, 1.2, 5.6, { variant: 'wall', height: 1.85 }),
        boxObstacle('o5-rail-c', 8, 4.2, 1.2, 5.4, { variant: 'rail', height: 1.5 }),
        boxObstacle('o5-post-a', 6, -3.8, 1.15, 1.15, { variant: 'bumper-post', height: 1.5 }),
        boxObstacle('o5-post-b', 13, 2.4, 1.15, 1.15, { variant: 'bumper-post', height: 1.5 })
      ],
      hazards: [
        boxHazard('o5-void-top', 'void', -1, 9, 13, 2.5),
        boxHazard('o5-void-bottom', 'void', 8, -9, 14, 2.5)
      ],
      movingHazards: [
        movingHazard('o5-drift-a', 'bumper', 2, -1, 2, 2, { axis: 'z', amplitude: 4.4, speed: 1.05 }),
        movingHazard('o5-drift-b', 'bumper', 10, 2.5, 2, 2, { axis: 'x', amplitude: 3.8, speed: 1.18, phase: Math.PI / 2 })
      ],
      scenery: [
        { type: 'tower', x: -16, z: 10 },
        { type: 'billboard', x: -2, z: -10 },
        { type: 'iceberg', x: 16, z: -10 }
      ]
    },
    {
      id: 'orbital-6',
      name: 'Transfer Prism',
      par: 4,
      bounds: { minX: -20, maxX: 20, minZ: -12, maxZ: 12 },
      tee: { x: -17, z: 7 },
      cup: { x: 17, z: -7, radius: DEFAULT_CUP_RADIUS },
      surfaces: [
        boxSurface('o6-entry', 'fairway', -13, 7, 8, 4),
        boxSurface('o6-corner-a', 'fairway', -5, 2.5, 8, 4),
        boxSurface('o6-middle', 'boost', 2, -1, 7, 3, { boost: 1.24 }),
        boxSurface('o6-slide', 'ice', 9, -4.5, 10, 4),
        boxSurface('o6-finish', 'fairway', 16, -7, 6, 4),
        boxSurface('o6-safe', 'rough', 0, 9, 18, 3)
      ],
      obstacles: [
        boxObstacle('o6-wall-a', -8, 4, 1.2, 5.2, { variant: 'wall', height: 1.8 }),
        boxObstacle('o6-wall-b', 0, 0, 1.2, 6, { variant: 'wall', height: 1.9 }),
        boxObstacle('o6-wall-c', 9, -3.2, 1.2, 5.2, { variant: 'rail', height: 1.5 }),
        boxObstacle('o6-post-a', 5, 3.4, 1.1, 1.1, { variant: 'bumper-post', height: 1.45 })
      ],
      hazards: [
        boxHazard('o6-gap-a', 'void', -2, -9, 12, 2.5),
        boxHazard('o6-gap-b', 'void', 10, 9, 11, 2.5),
        boxHazard('o6-gap-c', 'void', 13, -0.5, 5, 3)
      ],
      movingHazards: [
        movingHazard('o6-prism-a', 'bumper', 5, 0, 2.1, 2.1, { axis: 'z', amplitude: 4.6, speed: 1.08 }),
        movingHazard('o6-prism-b', 'bumper', 12, -1.5, 2.1, 2.1, { axis: 'x', amplitude: 2.8, speed: 1.24, phase: Math.PI / 3 })
      ],
      scenery: [
        { type: 'aurora', x: -14, z: -10 },
        { type: 'tower', x: 0, z: 10 },
        { type: 'ice-spire', x: 15, z: 10 }
      ]
    },
    {
      id: 'orbital-7',
      name: 'Lagrange Crown',
      par: 5,
      bounds: { minX: -21, maxX: 21, minZ: -12, maxZ: 12 },
      tee: { x: -18, z: 0 },
      cup: { x: 18, z: 0, radius: DEFAULT_CUP_RADIUS },
      surfaces: [
        boxSurface('o7-entry', 'fairway', -14, 0, 8, 6),
        boxSurface('o7-upper', 'fairway', -5, 5, 9, 4),
        boxSurface('o7-lower', 'fairway', -5, -5, 9, 4),
        boxSurface('o7-core', 'ice', 5, 0, 10, 4),
        boxSurface('o7-launch', 'boost', 13, 0, 5, 3, { boost: 1.28 }),
        boxSurface('o7-finish', 'fairway', 18, 0, 4, 5)
      ],
      obstacles: [
        boxObstacle('o7-gate-a', -10, 0, 1.2, 6),
        boxObstacle('o7-core-a', -1, 3.2, 1.2, 5.4, { variant: 'wall', height: 1.9 }),
        boxObstacle('o7-core-b', -1, -3.2, 1.2, 5.4, { variant: 'wall', height: 1.9 }),
        boxObstacle('o7-post-a', 9, 4, 1.15, 1.15, { variant: 'bumper-post', height: 1.5 }),
        boxObstacle('o7-post-b', 9, -4, 1.15, 1.15, { variant: 'bumper-post', height: 1.5 }),
        boxObstacle('o7-post-c', 14, 0, 1.15, 1.15, { variant: 'bumper-post', height: 1.5 })
      ],
      hazards: [
        boxHazard('o7-void-top', 'void', 3, 9, 13, 2.5),
        boxHazard('o7-void-bottom', 'void', 3, -9, 13, 2.5),
        boxHazard('o7-core-gap', 'void', 6, 0, 4, 3)
      ],
      movingHazards: [
        movingHazard('o7-orbit-a', 'bumper', 5, 0, 2.2, 2.2, { axis: 'z', amplitude: 4.8, speed: 1 }),
        movingHazard('o7-orbit-b', 'bumper', 12, 0, 2.2, 2.2, { axis: 'x', amplitude: 3.4, speed: 1.2, phase: Math.PI / 2 })
      ],
      scenery: [
        { type: 'tower', x: -17, z: -10 },
        { type: 'billboard', x: 0, z: 10 },
        { type: 'aurora', x: 17, z: -10 }
      ]
    }
  ]
}
