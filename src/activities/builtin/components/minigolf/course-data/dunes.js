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

export const dunesCourse = {
  id: 'dunes',
  name: 'Windwake Dunes',
  palette: {
    backgroundTop: '#f1bf72',
    backgroundBottom: '#59331a',
    fairway: '#d9b471',
    rough: '#9a7040',
    wall: '#f7e4c0',
    hazard: '#63cfff',
    accent: '#fff08b'
  },
  environment: 'desert',
  description: 'Long desert corridors, sand traps, shattered rails, and cliffside carries under a hard crosswind.',
  holes: [
    {
      id: 'dunes-1',
      name: 'Crosswind Lane',
      par: 3,
      bounds: { minX: -18, maxX: 18, minZ: -11, maxZ: 11 },
      tee: { x: -15, z: 0 },
      cup: { x: 15, z: 0, radius: DEFAULT_CUP_RADIUS },
      surfaces: [
        boxSurface('du1-main', 'fairway', -1, 0, 32, 5),
        boxSurface('du1-top', 'sand', 2, -4.8, 14, 2.8),
        boxSurface('du1-bottom', 'sand', 2, 4.8, 14, 2.8),
        boxSurface('du1-finish', 'fairway', 12, 0, 8, 4)
      ],
      obstacles: [
        boxObstacle('du1-rail-a', -5, -2.5, 1.1, 4.2, { variant: 'rail' }),
        boxObstacle('du1-rail-b', 3, 2.5, 1.1, 4.2, { variant: 'rail' }),
        boxObstacle('du1-post', 9.5, 0.5, 1.15, 1.15, { variant: 'bumper-post', height: 1.45 })
      ],
      hazards: [
        boxHazard('du1-water-top', 'water', 8, -8.4, 10, 2.4),
        boxHazard('du1-water-bottom', 'water', 8, 8.4, 10, 2.4)
      ],
      movingHazards: [],
      scenery: [{ type: 'tower', x: -14, z: 9 }, { type: 'billboard', x: 2, z: -10 }]
    },
    {
      id: 'dunes-2',
      name: 'Broken Causeway',
      par: 4,
      bounds: { minX: -18, maxX: 18, minZ: -11, maxZ: 11 },
      tee: { x: -15, z: 7 },
      cup: { x: 15, z: -6, radius: DEFAULT_CUP_RADIUS },
      surfaces: [
        boxSurface('du2-entry', 'fairway', -10, 7, 10, 4),
        boxSurface('du2-corner', 'fairway', -2, 2, 8, 4, { slope: { x: 0.18, z: -0.18 } }),
        boxSurface('du2-lower', 'fairway', 8, -5, 14, 4),
        boxSurface('du2-pocket', 'sand', -1, -6.5, 8, 3.2),
        boxSurface('du2-recovery', 'rough', -2, 8.2, 16, 3)
      ],
      obstacles: [
        boxObstacle('du2-wall-a', -6, 4.2, 1.2, 5.4),
        boxObstacle('du2-wall-b', 0, -2, 1.2, 5.4),
        boxObstacle('du2-wall-c', 8.5, 1.5, 1.1, 5.2, { variant: 'rail' }),
        boxObstacle('du2-post', 12.5, -3.5, 1.15, 1.15, { variant: 'bumper-post', height: 1.5 })
      ],
      hazards: [
        boxHazard('du2-void-top', 'void', 2, 8.6, 12, 2.4),
        boxHazard('du2-void-bottom', 'void', -6, -8.6, 10, 2.4)
      ],
      movingHazards: [
        movingHazard('du2-sweeper', 'bumper', 5, -0.5, 2.1, 2.1, { axis: 'z', amplitude: 4, speed: 0.95 })
      ],
      scenery: [{ type: 'forge', x: -13, z: -10 }, { type: 'anvil', x: 13, z: 10 }]
    },
    {
      id: 'dunes-3',
      name: 'Mirage Shelf',
      par: 4,
      bounds: { minX: -19, maxX: 19, minZ: -12, maxZ: 12 },
      tee: { x: -16, z: -8 },
      cup: { x: 16, z: 8, radius: DEFAULT_CUP_RADIUS },
      surfaces: [
        boxSurface('du3-entry', 'fairway', -12, -8, 8, 4.5),
        boxSurface('du3-lift', 'fairway', -4, -3.5, 8, 4, { slope: { x: 0.22, z: 0.2 } }),
        boxSurface('du3-plateau', 'rough', 4, 2, 10, 4.5),
        boxSurface('du3-runout', 'boost', 12, 6, 7, 3, { boost: 1.22 }),
        boxSurface('du3-finish', 'fairway', 16, 8, 5, 4)
      ],
      obstacles: [
        boxObstacle('du3-guard-a', -8.5, -1, 1.1, 5.5, { variant: 'rail' }),
        boxObstacle('du3-guard-b', 1, 5.5, 1.2, 5.2, { variant: 'wall', height: 1.85 }),
        boxObstacle('du3-guard-c', 8.5, -3, 1.2, 5.2, { variant: 'wall', height: 1.85 }),
        boxObstacle('du3-stone', 10.5, 3.2, 1.15, 1.15, { variant: 'bumper-post', height: 1.45 })
      ],
      hazards: [
        boxHazard('du3-cut-a', 'void', -1, -9.4, 8, 2.4),
        boxHazard('du3-cut-b', 'water', 7, -9.4, 8, 2.4),
        boxHazard('du3-cut-c', 'void', 10, 10.2, 10, 2.4)
      ],
      movingHazards: [],
      scenery: [{ type: 'tower', x: -15, z: 10 }, { type: 'billboard', x: 0, z: -10 }, { type: 'tower', x: 15, z: -10 }]
    },
    {
      id: 'dunes-4',
      name: 'Stormglass Finish',
      par: 5,
      bounds: { minX: -20, maxX: 20, minZ: -12, maxZ: 12 },
      tee: { x: -17, z: 0 },
      cup: { x: 17, z: 0, radius: DEFAULT_CUP_RADIUS },
      surfaces: [
        boxSurface('du4-entry', 'fairway', -13, 0, 8, 6),
        boxSurface('du4-upper', 'fairway', -4, 5.5, 10, 4),
        boxSurface('du4-lower', 'fairway', -4, -5.5, 10, 4),
        boxSurface('du4-center', 'sand', 3, 0, 8, 4.5),
        boxSurface('du4-exit', 'fairway', 10, 0, 8, 4),
        boxSurface('du4-finish', 'fairway', 16, 0, 6, 5)
      ],
      obstacles: [
        boxObstacle('du4-divider-a', -8, 0, 1.2, 5.8, { variant: 'wall', height: 1.9 }),
        boxObstacle('du4-divider-b', -1, 0, 1.2, 5.8, { variant: 'wall', height: 1.9 }),
        boxObstacle('du4-gate-left', 11, -3.2, 1.1, 4.8, { variant: 'rail' }),
        boxObstacle('du4-gate-right', 11, 3.2, 1.1, 4.8, { variant: 'rail' })
      ],
      hazards: [
        boxHazard('du4-water-top', 'water', 2, -9, 10, 2.4),
        boxHazard('du4-water-bottom', 'water', 2, 9, 10, 2.4),
        boxHazard('du4-drop', 'void', 12.5, 8.8, 9, 2.4)
      ],
      movingHazards: [
        movingHazard('du4-hammer-a', 'bumper', 6, -2, 2.2, 2.2, { axis: 'z', amplitude: 3.6, speed: 1.05 }),
        movingHazard('du4-hammer-b', 'bumper', 6, 2, 2.2, 2.2, { axis: 'z', amplitude: 3.6, speed: 1.05, phase: Math.PI })
      ],
      scenery: [{ type: 'forge', x: -14, z: -10 }, { type: 'anvil', x: 0, z: 10 }, { type: 'tower', x: 16, z: -10 }]
    }
  ]
}
