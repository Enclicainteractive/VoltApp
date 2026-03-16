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

export const neonCourse = {
  id: 'neon',
  name: 'Neon Afterdark',
  palette: {
    backgroundTop: '#2b145e',
    backgroundBottom: '#04050f',
    fairway: '#37f0ff',
    rough: '#12344a',
    wall: '#f4d4ff',
    hazard: '#ff3d81',
    accent: '#ffe66d'
  },
  environment: 'arcade',
  description: 'Late-night arcade lanes with glowing rails, split routes, and roaming bumpers.',
  holes: [
    {
      id: 'neon-1',
      name: 'Insert Coin',
      par: 3,
      bounds: { minX: -18, maxX: 18, minZ: -11, maxZ: 11 },
      tee: { x: -15, z: 0 },
      cup: { x: 15, z: 0, radius: 0.5 },
      surfaces: [
        boxSurface('n1-main', 'fairway', -2, 0, 22, 6),
        boxSurface('n1-kicker', 'boost', 6, 0, 5, 3, { boost: 1.22 }),
        boxSurface('n1-finish', 'fairway', 12, 0, 8, 5),
        boxSurface('n1-upper', 'rough', 0, 7.5, 30, 4),
        boxSurface('n1-lower', 'rough', 0, -7.5, 30, 4)
      ],
      obstacles: [
        boxObstacle('n1-rail-a', -6, -3.5, 1.1, 4.5, { variant: 'rail' }),
        boxObstacle('n1-rail-b', -6, 3.5, 1.1, 4.5, { variant: 'rail' }),
        boxObstacle('n1-gate', 4, 0, 1.3, 3.2, { variant: 'wall', height: 1.9 }),
        boxObstacle('n1-post', 10.5, 1.5, 1.05, 1.05, { variant: 'bumper-post', height: 1.45 })
      ],
      hazards: [
        boxHazard('n1-void-top', 'void', 8, 8.5, 12, 2.6),
        boxHazard('n1-void-bottom', 'void', 8, -8.5, 12, 2.6)
      ],
      movingHazards: [],
      scenery: [{ type: 'billboard', x: -11, z: -9 }, { type: 'billboard', x: 11, z: 9 }]
    },
    {
      id: 'neon-2',
      name: 'Laser Split',
      par: 4,
      bounds: { minX: -18, maxX: 18, minZ: -11, maxZ: 11 },
      tee: { x: -15, z: -6 },
      cup: { x: 15, z: 6, radius: 0.5 },
      surfaces: [
        boxSurface('n2-left-lane', 'fairway', -4, -5.5, 18, 4.5),
        boxSurface('n2-mid-pocket', 'sticky', 2, -1.5, 7, 3.2),
        boxSurface('n2-right-lane', 'fairway', 7, 5.5, 18, 4.5),
        boxSurface('n2-cutback', 'fairway', 2, 0.5, 8, 3.4),
        boxSurface('n2-rescue', 'rough', -3, 7.5, 24, 3)
      ],
      obstacles: [
        boxObstacle('n2-block-a', -2, -1, 2.8, 1.6, { variant: 'wall', height: 1.85 }),
        boxObstacle('n2-block-b', 4.5, 1.5, 2.8, 1.6, { variant: 'wall', height: 1.85 }),
        boxObstacle('n2-guard', 10.5, 5.8, 1.1, 4.6, { variant: 'rail' })
      ],
      hazards: [
        boxHazard('n2-drop-a', 'void', -8, 7.8, 8, 2.6),
        boxHazard('n2-drop-b', 'void', 12, -8, 10, 3)
      ],
      movingHazards: [
        movingHazard('n2-sweeper-a', 'bumper', 1, -4.8, 1.9, 1.9, { axis: 'z', amplitude: 4.8, speed: 1.05 }),
        movingHazard('n2-sweeper-b', 'bumper', 8, 2.5, 1.9, 1.9, { axis: 'x', amplitude: 3.4, speed: 1.3, phase: Math.PI / 3 })
      ],
      scenery: [{ type: 'billboard', x: 0, z: -9 }, { type: 'tower', x: -14, z: 9 }]
    },
    {
      id: 'neon-3',
      name: 'Combo Tunnel',
      par: 4,
      bounds: { minX: -19, maxX: 19, minZ: -12, maxZ: 12 },
      tee: { x: -16, z: 7 },
      cup: { x: 16, z: -7, radius: 0.5 },
      surfaces: [
        boxSurface('n3-entry', 'fairway', -12, 7, 8, 5),
        boxSurface('n3-slope', 'fairway', -5, 3.5, 8, 4.5, { slope: { x: 0.22, z: -0.18 } }),
        boxSurface('n3-ice-run', 'ice', 3, -1, 11, 3.6),
        boxSurface('n3-pocket', 'fairway', 10, -4.5, 8, 4.2),
        boxSurface('n3-finish', 'boost', 15, -7, 5, 3, { boost: 1.18 })
      ],
      obstacles: [
        boxObstacle('n3-wall-a', -8, 2.2, 1.1, 5.4, { variant: 'wall', height: 1.9 }),
        boxObstacle('n3-wall-b', 0.5, 3.5, 1.1, 5, { variant: 'rail' }),
        boxObstacle('n3-wall-c', 7.5, -6.5, 1.2, 5, { variant: 'wall', height: 1.8 }),
        boxObstacle('n3-post', 11.5, -1.5, 1.08, 1.08, { variant: 'bumper-post', height: 1.45 })
      ],
      hazards: [
        boxHazard('n3-holo-a', 'water', -1, -9, 10, 2.5),
        boxHazard('n3-holo-b', 'void', 8.5, 8.8, 11, 2.5)
      ],
      movingHazards: [
        movingHazard('n3-orb', 'bumper', 4, 3.5, 2.2, 2.2, { axis: 'z', amplitude: 5.5, speed: 0.92 })
      ],
      scenery: [{ type: 'billboard', x: -2, z: -10 }, { type: 'billboard', x: 14, z: 9 }]
    },
    {
      id: 'neon-4',
      name: 'Final Credit',
      par: 5,
      bounds: { minX: -20, maxX: 20, minZ: -12, maxZ: 12 },
      tee: { x: -17, z: 0 },
      cup: { x: 17, z: 0, radius: 0.5 },
      surfaces: [
        boxSurface('n4-entry', 'fairway', -13, 0, 8, 6),
        boxSurface('n4-upper', 'fairway', -3, 6.2, 12, 4),
        boxSurface('n4-lower', 'fairway', -3, -6.2, 12, 4),
        boxSurface('n4-center', 'rough', 2, 0, 9, 4),
        boxSurface('n4-exit', 'ice', 10, 0, 8, 4),
        boxSurface('n4-finish', 'fairway', 16, 0, 6, 5)
      ],
      obstacles: [
        boxObstacle('n4-divider-a', -8, 0, 1.2, 5.4, { variant: 'wall', height: 1.9 }),
        boxObstacle('n4-divider-b', -1, 0, 1.2, 5.8, { variant: 'wall', height: 1.9 }),
        boxObstacle('n4-finisher-left', 12, -4.6, 1.1, 4.8, { variant: 'rail' }),
        boxObstacle('n4-finisher-right', 12, 4.6, 1.1, 4.8, { variant: 'rail' })
      ],
      hazards: [
        boxHazard('n4-core-a', 'void', 3.5, 5.9, 7, 2.4),
        boxHazard('n4-core-b', 'void', 3.5, -5.9, 7, 2.4),
        boxHazard('n4-center-water', 'water', 6, 0, 5, 2.8)
      ],
      movingHazards: [
        movingHazard('n4-spinner-a', 'bumper', 6.5, 0, 2.1, 2.1, { axis: 'z', amplitude: 4.6, speed: 1.08 }),
        movingHazard('n4-spinner-b', 'bumper', 13, 0, 2.1, 2.1, { axis: 'x', amplitude: 2.8, speed: 1.4, phase: Math.PI / 2 })
      ],
      scenery: [{ type: 'tower', x: -16, z: -10 }, { type: 'billboard', x: 0, z: 10 }, { type: 'tower', x: 16, z: 10 }]
    }
  ]
}
