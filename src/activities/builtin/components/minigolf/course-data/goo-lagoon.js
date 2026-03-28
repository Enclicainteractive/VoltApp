import { DEFAULT_CUP_RADIUS, MINIGOLF_POWERUP_TYPES } from '../constants'

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

const powerup = (id, type, x, z) => ({
  id,
  type,
  position: { x, z }
})

export const gooLagoonCourse = {
  id: 'goo-lagoon',
  name: 'Goo Lagoon',
  palette: {
    backgroundTop: '#164e63',
    backgroundBottom: '#04111a',
    fairway: '#4ade80',
    rough: '#1f7a54',
    wall: '#d1fae5',
    hazard: '#22d3ee',
    accent: '#f472b6'
  },
  environment: 'slime',
  description: 'A glue-soaked course with sticky shortcuts, suction flats, and powerup lanes that reward brave lines.',
  holes: [
    {
      id: 'goo-1',
      name: 'Adhesive Alley',
      par: 3,
      bounds: { minX: -18, maxX: 18, minZ: -11, maxZ: 11 },
      tee: { x: -15, z: 0 },
      cup: { x: 15, z: 0, radius: DEFAULT_CUP_RADIUS },
      surfaces: [
        boxSurface('goo1-main', 'fairway', 0, 0, 34, 5),
        boxSurface('goo1-upper', 'sticky', -2, -4.6, 12, 3),
        boxSurface('goo1-lower', 'sticky', 6, 4.6, 12, 3),
        boxSurface('goo1-boost', 'boost', 9, 0, 4, 2.5, { boost: 1.18 })
      ],
      obstacles: [
        boxObstacle('goo1-wall-a', -5, 2.6, 1.2, 4.5),
        boxObstacle('goo1-wall-b', 4, -2.6, 1.2, 4.5),
        boxObstacle('goo1-post', 10.5, 0, 1.1, 1.1, { variant: 'bumper-post', height: 1.45 })
      ],
      hazards: [
        boxHazard('goo1-water-top', 'water', 7, -8.6, 10, 2.4),
        boxHazard('goo1-water-bottom', 'water', 7, 8.6, 10, 2.4)
      ],
      movingHazards: [],
      powerups: [
        powerup('goo1-grit', MINIGOLF_POWERUP_TYPES.GRIT, -1.5, -4.6),
        powerup('goo1-magnet', MINIGOLF_POWERUP_TYPES.MAGNET, 8.5, 0)
      ],
      scenery: [{ type: 'billboard', x: -12, z: -9 }, { type: 'tower', x: 13, z: 9 }]
    },
    {
      id: 'goo-2',
      name: 'Sludge Switchback',
      par: 4,
      bounds: { minX: -18, maxX: 18, minZ: -11, maxZ: 11 },
      tee: { x: -15, z: 7 },
      cup: { x: 15, z: -6, radius: DEFAULT_CUP_RADIUS },
      surfaces: [
        boxSurface('goo2-entry', 'fairway', -11, 7, 8, 4),
        boxSurface('goo2-corner', 'fairway', -4, 2.5, 8, 4, { slope: { x: 0.18, z: -0.2 } }),
        boxSurface('goo2-lane', 'sticky', 4, -2, 10, 4),
        boxSurface('goo2-finish', 'fairway', 12, -6, 7, 4)
      ],
      obstacles: [
        boxObstacle('goo2-wall-a', -7, 4.5, 1.2, 5.2),
        boxObstacle('goo2-wall-b', -1, -1.5, 1.2, 5.2),
        boxObstacle('goo2-wall-c', 7.5, -4, 1.2, 5.2)
      ],
      hazards: [
        boxHazard('goo2-void-a', 'void', 1, 8.6, 10, 2.4),
        boxHazard('goo2-void-b', 'void', -5, -8.6, 8, 2.4)
      ],
      movingHazards: [],
      powerups: [
        powerup('goo2-overdrive', MINIGOLF_POWERUP_TYPES.OVERDRIVE, -4, 2.5),
        powerup('goo2-grit', MINIGOLF_POWERUP_TYPES.GRIT, 3.5, -2)
      ],
      scenery: [{ type: 'forge', x: -14, z: -9 }, { type: 'anvil', x: 13, z: 9 }]
    },
    {
      id: 'goo-3',
      name: 'Vacuum Basin',
      par: 5,
      bounds: { minX: -19, maxX: 19, minZ: -12, maxZ: 12 },
      tee: { x: -16, z: -8 },
      cup: { x: 16, z: 8, radius: DEFAULT_CUP_RADIUS },
      surfaces: [
        boxSurface('goo3-entry', 'fairway', -12, -8, 8, 4),
        boxSurface('goo3-lift', 'fairway', -4, -3, 8, 4, { slope: { x: 0.22, z: 0.16 } }),
        boxSurface('goo3-basin', 'sticky', 4, 2.5, 11, 5),
        boxSurface('goo3-runout', 'boost', 12, 6, 6, 3, { boost: 1.2 }),
        boxSurface('goo3-finish', 'fairway', 16, 8, 5, 4)
      ],
      obstacles: [
        boxObstacle('goo3-guard-a', -8, -1, 1.2, 5.4, { variant: 'rail' }),
        boxObstacle('goo3-guard-b', 1, 5.6, 1.2, 5.2, { variant: 'wall', height: 1.85 }),
        boxObstacle('goo3-guard-c', 8.5, -2.8, 1.2, 5.2, { variant: 'wall', height: 1.85 })
      ],
      hazards: [
        boxHazard('goo3-water-a', 'water', -1, -9.3, 8, 2.4),
        boxHazard('goo3-water-b', 'water', 10, -9.3, 8, 2.4),
        boxHazard('goo3-water-c', 'water', 6, 10.1, 11, 2.4)
      ],
      movingHazards: [],
      powerups: [
        powerup('goo3-magnet', MINIGOLF_POWERUP_TYPES.MAGNET, 4, 2.5),
        powerup('goo3-overdrive', MINIGOLF_POWERUP_TYPES.OVERDRIVE, 12, 6)
      ],
      scenery: [{ type: 'tower', x: -15, z: 10 }, { type: 'billboard', x: 0, z: -10 }]
    }
  ]
}
