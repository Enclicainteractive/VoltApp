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

export const canyonCourse = {
  id: 'canyon',
  name: 'Sunscar Canyon',
  palette: {
    backgroundTop: '#f7a24b',
    backgroundBottom: '#4a2214',
    fairway: '#d8a35f',
    rough: '#8b5a38',
    wall: '#f3d6b3',
    hazard: '#63d6ff',
    accent: '#ffd36f'
  },
  environment: 'desert',
  description: 'Wind-cut mesas, sandstone rails, and dry-run boosts through a blazing canyon.',
  holes: [
    {
      id: 'canyon-1',
      name: 'Dustline Dash',
      par: 3,
      bounds: { minX: -18, maxX: 18, minZ: -11, maxZ: 11 },
      tee: { x: -15, z: -1 },
      cup: { x: 15, z: 1, radius: 0.5 },
      surfaces: [
        boxSurface('c1-main', 'fairway', -2, -1, 20, 5),
        boxSurface('c1-boost', 'boost', 5, 0, 6, 3, { boost: 1.22 }),
        boxSurface('c1-finish', 'fairway', 12, 1, 10, 5),
        boxSurface('c1-rough-top', 'rough', 1, -7, 30, 4),
        boxSurface('c1-rough-bottom', 'rough', 1, 7, 30, 4)
      ],
      obstacles: [
        boxObstacle('c1-rail-a', -6, 3, 1.2, 4.5, { variant: 'rail' }),
        boxObstacle('c1-rail-b', 0, -3, 1.2, 4.5, { variant: 'rail' }),
        boxObstacle('c1-boulder', 8, 2.2, 1.4, 1.4, { variant: 'bumper-post', height: 1.55 })
      ],
      hazards: [
        boxHazard('c1-oasis-top', 'water', 8, -8.3, 10, 2.6),
        boxHazard('c1-oasis-bottom', 'water', 9, 8.3, 10, 2.6)
      ],
      movingHazards: [],
      scenery: [
        { type: 'tower', x: -14, z: 9 },
        { type: 'tower', x: 14, z: -9 },
        { type: 'billboard', x: 2, z: -9 }
      ]
    },
    {
      id: 'canyon-2',
      name: 'Switchback Shelf',
      par: 4,
      bounds: { minX: -18, maxX: 18, minZ: -11, maxZ: 11 },
      tee: { x: -16, z: 7 },
      cup: { x: 15, z: -6, radius: 0.5 },
      surfaces: [
        boxSurface('c2-entry', 'fairway', -10, 7, 10, 4),
        boxSurface('c2-sand', 'sand', -3, 3, 8, 4),
        boxSurface('c2-corner', 'fairway', 2, 0, 7, 4),
        boxSurface('c2-lower', 'fairway', 9, -5, 14, 4),
        boxSurface('c2-recovery', 'rough', -1, -7.5, 18, 3)
      ],
      obstacles: [
        boxObstacle('c2-wall-a', -6, 4, 1.2, 5.6),
        boxObstacle('c2-wall-b', 0, -2.2, 1.2, 5.6),
        boxObstacle('c2-wall-c', 8, 1.8, 1.2, 5.2),
        boxObstacle('c2-post', 12, -3.5, 1.2, 1.2, { variant: 'bumper-post', height: 1.5 })
      ],
      hazards: [
        boxHazard('c2-ravine-top', 'void', 3, 8.4, 12, 2.4),
        boxHazard('c2-ravine-bottom', 'void', -5, -8.5, 10, 2.5)
      ],
      movingHazards: [
        movingHazard('c2-sweeper', 'bumper', 5, -1, 2, 2, { axis: 'z', amplitude: 4.2, speed: 0.9 })
      ],
      scenery: [
        { type: 'anvil', x: -13, z: -9 },
        { type: 'forge', x: 13, z: 9 }
      ]
    },
    {
      id: 'canyon-3',
      name: 'Mesa Runway',
      par: 4,
      bounds: { minX: -19, maxX: 19, minZ: -12, maxZ: 12 },
      tee: { x: -16, z: -7 },
      cup: { x: 16, z: 7, radius: 0.5 },
      surfaces: [
        boxSurface('c3-start', 'fairway', -12, -7, 8, 4),
        boxSurface('c3-ramp', 'fairway', -4, -3, 8, 4, { slope: { x: 0.22, z: 0.16 } }),
        boxSurface('c3-plateau', 'rough', 4, 2, 12, 5),
        boxSurface('c3-speedway', 'boost', 12, 6, 8, 3, { boost: 1.28 }),
        boxSurface('c3-finish', 'fairway', 16, 7, 5, 4)
      ],
      obstacles: [
        boxObstacle('c3-guard-a', -8, -2, 1.2, 5.5, { variant: 'rail' }),
        boxObstacle('c3-guard-b', 1, 5, 1.2, 5.5),
        boxObstacle('c3-guard-c', 8, -1, 1.2, 5.5),
        boxObstacle('c3-boulder-a', 6, 4.5, 1.2, 1.2, { variant: 'bumper-post', height: 1.45 }),
        boxObstacle('c3-boulder-b', 11, 2, 1.2, 1.2, { variant: 'bumper-post', height: 1.45 })
      ],
      hazards: [
        boxHazard('c3-canyon-cut-a', 'void', -1, -9, 8, 2.4),
        boxHazard('c3-canyon-cut-b', 'water', 7, -9, 8, 2.4),
        boxHazard('c3-canyon-cut-c', 'void', 10, 10, 10, 2.4)
      ],
      movingHazards: [],
      scenery: [
        { type: 'tower', x: -15, z: 10 },
        { type: 'billboard', x: 0, z: -10 },
        { type: 'tower', x: 14, z: -10 }
      ]
    },
    {
      id: 'canyon-4',
      name: 'Sunscar Crown',
      par: 5,
      bounds: { minX: -20, maxX: 20, minZ: -12, maxZ: 12 },
      tee: { x: -17, z: 0 },
      cup: { x: 17, z: 0, radius: 0.5 },
      surfaces: [
        boxSurface('c4-entry', 'fairway', -12, 0, 10, 6),
        boxSurface('c4-sand-a', 'sand', -3, -4.5, 8, 3.5),
        boxSurface('c4-sand-b', 'sand', -3, 4.5, 8, 3.5),
        boxSurface('c4-mid', 'fairway', 2, 0, 8, 4, { slope: { x: 0.2, z: 0 } }),
        boxSurface('c4-boost', 'boost', 9, 0, 6, 3, { boost: 1.3 }),
        boxSurface('c4-finish', 'fairway', 15, 0, 8, 5),
        boxSurface('c4-recovery', 'rough', 5, 8.3, 20, 3)
      ],
      obstacles: [
        boxObstacle('c4-gate-left', -6, -2.8, 1.2, 4.8),
        boxObstacle('c4-gate-right', -6, 2.8, 1.2, 4.8),
        boxObstacle('c4-mid-block', 4, 0, 1.5, 5.5),
        boxObstacle('c4-post-a', 11, -3.5, 1.15, 1.15, { variant: 'bumper-post', height: 1.55 }),
        boxObstacle('c4-post-b', 11, 3.5, 1.15, 1.15, { variant: 'bumper-post', height: 1.55 })
      ],
      hazards: [
        boxHazard('c4-river-top', 'water', 3, -9, 10, 2.5),
        boxHazard('c4-river-bottom', 'water', 3, 9, 10, 2.5),
        boxHazard('c4-chasm', 'void', 13, 8.8, 10, 2.4)
      ],
      movingHazards: [
        movingHazard('c4-hammer-a', 'bumper', 7, -2, 2.2, 2.2, { axis: 'z', amplitude: 3.8, speed: 1.05 }),
        movingHazard('c4-hammer-b', 'bumper', 7, 2, 2.2, 2.2, { axis: 'z', amplitude: 3.8, speed: 1.05, phase: Math.PI })
      ],
      scenery: [
        { type: 'forge', x: -14, z: -10 },
        { type: 'anvil', x: 0, z: 10 },
        { type: 'tower', x: 16, z: -10 }
      ]
    }
  ]
}
