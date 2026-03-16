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

export const ruinsCourse = {
  id: 'ruins',
  name: 'Sunken Ruins',
  palette: {
    backgroundTop: '#2e4f3a',
    backgroundBottom: '#10241a',
    fairway: '#7cbf6b',
    rough: '#426b3f',
    wall: '#b8ad89',
    hazard: '#35c2c1',
    accent: '#f5d37b'
  },
  environment: 'jungle',
  description: 'Temple lanes, mossy ramps, and flooded relic chambers buried under the canopy.',
  holes: [
    {
      id: 'ruins-1',
      name: 'Moss Gate',
      par: 3,
      bounds: { minX: -18, maxX: 18, minZ: -11, maxZ: 11 },
      tee: { x: -14, z: 0 },
      cup: { x: 14, z: 0, radius: DEFAULT_CUP_RADIUS },
      surfaces: [
        boxSurface('r1-entry', 'fairway', -9, 0, 10, 6),
        boxSurface('r1-ramp', 'fairway', -1.5, 0, 8, 6, { slope: { x: 0.22, z: 0 } }),
        boxSurface('r1-court', 'fairway', 8, 0, 12, 7),
        boxSurface('r1-overgrowth', 'rough', 1, 7.5, 18, 3.5),
        boxSurface('r1-overgrowth-2', 'rough', 1, -7.5, 18, 3.5)
      ],
      obstacles: [
        boxObstacle('r1-pillar-a', -4, -3, 1.3, 4.2, { variant: 'wall', height: 1.8 }),
        boxObstacle('r1-pillar-b', -4, 3, 1.3, 4.2, { variant: 'wall', height: 1.8 }),
        boxObstacle('r1-arch-left', 5, -2.8, 1.1, 3.5, { variant: 'rail', height: 1.5 }),
        boxObstacle('r1-arch-right', 5, 2.8, 1.1, 3.5, { variant: 'rail', height: 1.5 }),
        boxObstacle('r1-capstone', 10.5, 0, 1.3, 4.6, { variant: 'bumper-post', height: 1.55 })
      ],
      hazards: [
        boxHazard('r1-pool-top', 'water', 7.5, -8.3, 11, 2.4),
        boxHazard('r1-pool-bottom', 'water', 7.5, 8.3, 11, 2.4)
      ],
      movingHazards: [],
      scenery: [
        { type: 'tower', x: -12, z: -9 },
        { type: 'tower', x: 12, z: 9 },
        { type: 'ice-spire', x: 1, z: -10 }
      ]
    },
    {
      id: 'ruins-2',
      name: 'Canopy Spillway',
      par: 4,
      bounds: { minX: -18, maxX: 18, minZ: -11, maxZ: 11 },
      tee: { x: -15, z: -6 },
      cup: { x: 15, z: 6, radius: DEFAULT_CUP_RADIUS },
      surfaces: [
        boxSurface('r2-lane-a', 'fairway', -8, -6, 12, 4.5),
        boxSurface('r2-cut', 'sticky', -1.5, -1.5, 7, 4.5),
        boxSurface('r2-ramp', 'fairway', 4.5, 2.5, 10, 4.2, { slope: { x: 0.18, z: 0.14 } }),
        boxSurface('r2-finish', 'fairway', 12, 6, 8, 4.5),
        boxSurface('r2-jungle', 'rough', -1, 7.5, 28, 3.2)
      ],
      obstacles: [
        boxObstacle('r2-ruin-a', -4.5, -2.2, 1.2, 4.4, { variant: 'wall', height: 1.8 }),
        boxObstacle('r2-ruin-b', 1.5, 1.5, 1.2, 4.8, { variant: 'wall', height: 1.85 }),
        boxObstacle('r2-ruin-c', 8, 4, 1.2, 4.6, { variant: 'rail', height: 1.55 }),
        boxObstacle('r2-obelisk', 11.5, -3.5, 1.15, 1.15, { variant: 'bumper-post', height: 1.6 })
      ],
      hazards: [
        boxHazard('r2-lagoon-a', 'water', -7, 8.1, 8, 2.5),
        boxHazard('r2-lagoon-b', 'water', 8, -8.1, 9, 2.5)
      ],
      movingHazards: [
        movingHazard('r2-guardian', 'bumper', 6, -0.5, 2, 2, { axis: 'z', amplitude: 4.4, speed: 1.05 })
      ],
      scenery: [
        { type: 'aurora', x: 0, z: -10 },
        { type: 'tower', x: 14, z: 9 }
      ]
    },
    {
      id: 'ruins-3',
      name: 'Idol Switchback',
      par: 4,
      bounds: { minX: -19, maxX: 19, minZ: -12, maxZ: 12 },
      tee: { x: -16, z: 8 },
      cup: { x: 16, z: -7, radius: DEFAULT_CUP_RADIUS },
      surfaces: [
        boxSurface('r3-start', 'fairway', -12, 8, 8, 5),
        boxSurface('r3-drop', 'fairway', -4.5, 4.5, 9, 4.2, { slope: { x: 0.22, z: -0.18 } }),
        boxSurface('r3-mid', 'sticky', 3.5, 0.5, 9, 5),
        boxSurface('r3-slide', 'fairway', 10.5, -4, 8, 4.4, { slope: { x: 0.14, z: -0.16 } }),
        boxSurface('r3-finish', 'fairway', 15, -7, 6, 4)
      ],
      obstacles: [
        boxObstacle('r3-wall-a', -8.5, 3.5, 1.2, 5.6, { variant: 'rail', height: 1.5 }),
        boxObstacle('r3-wall-b', -0.5, -1.5, 1.2, 5.6, { variant: 'wall', height: 1.9 }),
        boxObstacle('r3-wall-c', 8.5, -6.2, 1.2, 5.2, { variant: 'wall', height: 1.85 }),
        boxObstacle('r3-idol', 5.5, 5.2, 1.2, 1.2, { variant: 'bumper-post', height: 1.5 })
      ],
      hazards: [
        boxHazard('r3-basin-a', 'water', -2, 8.8, 6, 2.6),
        boxHazard('r3-basin-b', 'water', 6.5, 8.8, 6, 2.6),
        boxHazard('r3-basin-c', 'water', 6, -9.2, 12, 2.6)
      ],
      movingHazards: [],
      scenery: [
        { type: 'forge', x: -2, z: -10 },
        { type: 'tower', x: 15, z: -10 }
      ]
    },
    {
      id: 'ruins-4',
      name: 'Temple Heart',
      par: 5,
      bounds: { minX: -19, maxX: 19, minZ: -12, maxZ: 12 },
      tee: { x: -16, z: 0 },
      cup: { x: 15, z: 0, radius: DEFAULT_CUP_RADIUS },
      surfaces: [
        boxSurface('r4-entry', 'fairway', -12, 0, 8, 6),
        boxSurface('r4-left-step', 'fairway', -4, -4.5, 8, 4, { slope: { x: 0.16, z: 0.1 } }),
        boxSurface('r4-right-step', 'fairway', -4, 4.5, 8, 4, { slope: { x: 0.16, z: -0.1 } }),
        boxSurface('r4-center', 'sticky', 4.5, 0, 8, 5.5),
        boxSurface('r4-bridge', 'fairway', 10, 0, 8, 3.2),
        boxSurface('r4-finish', 'fairway', 15, 0, 6, 5)
      ],
      obstacles: [
        boxObstacle('r4-guard-a', -8.5, 0, 1.2, 6.2, { variant: 'wall', height: 1.85 }),
        boxObstacle('r4-guard-b', 0.5, -4.8, 1.2, 4.6, { variant: 'rail', height: 1.55 }),
        boxObstacle('r4-guard-c', 0.5, 4.8, 1.2, 4.6, { variant: 'rail', height: 1.55 }),
        boxObstacle('r4-altar-a', 8.2, -2.3, 1.15, 1.15, { variant: 'bumper-post', height: 1.55 }),
        boxObstacle('r4-altar-b', 8.2, 2.3, 1.15, 1.15, { variant: 'bumper-post', height: 1.55 })
      ],
      hazards: [
        boxHazard('r4-moat-a', 'water', -1.5, -9, 10, 2.4),
        boxHazard('r4-moat-b', 'water', -1.5, 9, 10, 2.4),
        boxHazard('r4-moat-center', 'water', 8.5, 0, 3.4, 4.8)
      ],
      movingHazards: [
        movingHazard('r4-heart-sentinel', 'bumper', 4.5, 0, 2.2, 2.2, { axis: 'z', amplitude: 4.1, speed: 1.2 })
      ],
      scenery: [
        { type: 'tower', x: -15, z: 10 },
        { type: 'tower', x: 15, z: -10 },
        { type: 'billboard', x: 0, z: 10 }
      ]
    }
  ]
}
