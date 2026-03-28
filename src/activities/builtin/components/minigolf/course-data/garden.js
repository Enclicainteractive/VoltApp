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

const rampObstacle = (id, x, z, width, depth, elevStart, elevEnd, axis = 'z', extra = {}) => ({
  id,
  type: 'ramp',
  shape: 'box',
  position: { x, z },
  size: { x: width, z: depth },
  elevationStart: elevStart,
  elevationEnd: elevEnd,
  rampAxis: axis,
  launchAngle: extra.launchAngle || 0.42,
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

export const gardenCourse = {
  id: 'garden',
  name: 'Lumen Garden',
  palette: {
    backgroundTop: '#163338',
    backgroundBottom: '#07161b',
    fairway: '#72dca6',
    rough: '#315f52',
    wall: '#ddffd9',
    hazard: '#4dd7ff',
    accent: '#d9ff70'
  },
  environment: 'garden',
  description: 'Bioluminescent hedges, glowing canals, rolling hills, and launch ramps woven through a midnight garden.',
  holes: [
    {
      id: 'garden-1',
      name: 'Glowroot Lane',
      par: 3,
      bounds: { minX: -18, maxX: 18, minZ: -11, maxZ: 11 },
      tee: { x: -14, z: -1 },
      cup: { x: 14, z: 1, radius: DEFAULT_CUP_RADIUS },
      surfaces: [
        boxSurface('gdn1-main', 'fairway', -1, -1, 30, 6),
        // Gentle hill in the middle — ball slows going up, speeds up coming down
        boxSurface('gdn1-hill-up', 'fairway', 0, 0, 6, 5, {
          elevationStart: 0, elevationEnd: 1.2, rampAxis: 'x'
        }),
        boxSurface('gdn1-hill-down', 'fairway', 6, 0, 6, 5, {
          elevationStart: 1.2, elevationEnd: 0, rampAxis: 'x'
        }),
        boxSurface('gdn1-boost', 'boost', 7, 0.5, 5, 3, { boost: 1.18 }),
        boxSurface('gdn1-top', 'rough', 0, -7.5, 28, 3.5),
        boxSurface('gdn1-bottom', 'rough', 0, 7.5, 28, 3.5)
      ],
      obstacles: [
        boxObstacle('gdn1-hedge-a', -4, 3, 1.2, 4.8, { variant: 'rail' }),
        boxObstacle('gdn1-hedge-b', 3, -3, 1.2, 4.8, { variant: 'rail' }),
        boxObstacle('gdn1-bloom', 10, 0, 1.15, 1.15, { variant: 'bumper-post', height: 1.5 })
      ],
      hazards: [
        boxHazard('gdn1-water-top', 'water', 7, -8.4, 10, 2.4),
        boxHazard('gdn1-water-bottom', 'water', 7, 8.4, 10, 2.4)
      ],
      movingHazards: [],
      scenery: [{ type: 'aurora', x: -12, z: -9 }, { type: 'billboard', x: 11, z: 9 }]
    },
    {
      id: 'garden-2',
      name: 'Petal Cutback',
      par: 4,
      bounds: { minX: -18, maxX: 18, minZ: -11, maxZ: 11 },
      tee: { x: -15, z: 6 },
      cup: { x: 15, z: -6, radius: DEFAULT_CUP_RADIUS },
      surfaces: [
        boxSurface('gdn2-entry', 'fairway', -10, 6, 10, 4),
        boxSurface('gdn2-corner', 'fairway', -1, 1, 7, 4),
        boxSurface('gdn2-middle', 'rough', 4, -2.5, 10, 4.5),
        boxSurface('gdn2-finish', 'fairway', 11, -6, 10, 4),
        boxSurface('gdn2-boost', 'boost', 4, 4.5, 4, 3, { boost: 1.24 }),
        // Elevated platform in the middle — ball must roll up onto it
        boxSurface('gdn2-platform', 'fairway', 4, -2.5, 4, 4, { elevation: 1.5 }),
        // Ramp up to the platform
        boxSurface('gdn2-ramp-up', 'fairway', 1.5, -2.5, 3, 4, {
          elevationStart: 0, elevationEnd: 1.5, rampAxis: 'x'
        }),
        // Ramp down off the platform
        boxSurface('gdn2-ramp-down', 'fairway', 6.5, -2.5, 3, 4, {
          elevationStart: 1.5, elevationEnd: 0, rampAxis: 'x'
        })
      ],
      obstacles: [
        boxObstacle('gdn2-wall-a', -5, 2.5, 1.2, 5),
        boxObstacle('gdn2-wall-b', 2, -1.5, 1.2, 5),
        boxObstacle('gdn2-post-a', 9, -1, 1.1, 1.1, { variant: 'bumper-post', height: 1.45 })
      ],
      hazards: [
        boxHazard('gdn2-stream-a', 'water', -3, -8.4, 9, 2.4),
        boxHazard('gdn2-stream-b', 'water', 9, 8.4, 9, 2.4)
      ],
      movingHazards: [
        movingHazard('gdn2-firefly', 'bumper', 6, 1, 2, 2, { axis: 'z', amplitude: 4.5, speed: 0.95 })
      ],
      scenery: [{ type: 'ice-spire', x: 0, z: -10 }, { type: 'aurora', x: -14, z: 9 }]
    },
    {
      id: 'garden-3',
      name: 'Vineglass Arc',
      par: 4,
      bounds: { minX: -19, maxX: 19, minZ: -12, maxZ: 12 },
      tee: { x: -16, z: -7 },
      cup: { x: 16, z: 7, radius: DEFAULT_CUP_RADIUS },
      surfaces: [
        boxSurface('gdn3-start', 'fairway', -12, -7, 8, 4.5),
        // Slope that curves the ball toward the corner
        boxSurface('gdn3-slope', 'fairway', -4, -2.5, 8, 4, {
          slope: { x: 0.2, z: 0.16 }
        }),
        boxSurface('gdn3-mid', 'rough', 4, 2, 10, 5),
        boxSurface('gdn3-boost', 'boost', 11, 6, 5, 3, { boost: 1.26 }),
        boxSurface('gdn3-finish', 'fairway', 15, 7, 5, 4),
        // Launch ramp — sends ball airborne over the rough section
        rampObstacle('gdn3-launch-ramp', -6, -7, 4, 3, 0, 2.2, 'x', { launchAngle: 0.5 }),
        // Landing pad on the other side
        boxSurface('gdn3-landing', 'fairway', 2, -7, 5, 4, { elevation: 0 })
      ],
      obstacles: [
        boxObstacle('gdn3-arch-a', -8, -2, 1.2, 5.5, { variant: 'rail' }),
        boxObstacle('gdn3-arch-b', 0, 4.5, 1.2, 5.5),
        boxObstacle('gdn3-bloom-a', 8, 1, 1.1, 1.1, { variant: 'bumper-post', height: 1.45 }),
        boxObstacle('gdn3-bloom-b', 11, -1.5, 1.1, 1.1, { variant: 'bumper-post', height: 1.45 })
      ],
      hazards: [
        boxHazard('gdn3-pond-a', 'water', -2, -9.2, 10, 2.4),
        boxHazard('gdn3-pond-b', 'water', 10, -9.2, 8, 2.4),
        boxHazard('gdn3-pond-c', 'water', 5, 10, 12, 2.4)
      ],
      movingHazards: [],
      scenery: [{ type: 'billboard', x: -1, z: -10 }, { type: 'aurora', x: 14, z: 10 }]
    },
    {
      id: 'garden-4',
      name: 'Moonpetal Court',
      par: 5,
      bounds: { minX: -20, maxX: 20, minZ: -12, maxZ: 12 },
      tee: { x: -17, z: 0 },
      cup: { x: 17, z: 0, radius: DEFAULT_CUP_RADIUS },
      surfaces: [
        boxSurface('gdn4-entry', 'fairway', -13, 0, 8, 6),
        boxSurface('gdn4-left', 'fairway', -4, -5, 9, 4),
        boxSurface('gdn4-right', 'fairway', -4, 5, 9, 4),
        boxSurface('gdn4-center', 'rough', 2, 0, 8, 4),
        boxSurface('gdn4-ice', 'ice', 9, 0, 8, 4),
        boxSurface('gdn4-finish', 'fairway', 15, 0, 7, 5),
        // Rolling hills on the left path
        boxSurface('gdn4-hill-left-up', 'fairway', -6, -5, 4, 4, {
          elevationStart: 0, elevationEnd: 1.8, rampAxis: 'x'
        }),
        boxSurface('gdn4-hill-left-peak', 'fairway', -4, -5, 2, 4, { elevation: 1.8 }),
        boxSurface('gdn4-hill-left-down', 'fairway', -2, -5, 4, 4, {
          elevationStart: 1.8, elevationEnd: 0, rampAxis: 'x'
        }),
        // Big launch ramp on the right path — sends ball flying over the center hazard
        rampObstacle('gdn4-big-ramp', -4, 5, 5, 4, 0, 2.8, 'x', { launchAngle: 0.55 }),
        // Elevated landing zone after the ramp
        boxSurface('gdn4-landing', 'fairway', 2, 5, 4, 4, { elevation: 0 })
      ],
      obstacles: [
        boxObstacle('gdn4-divider-a', -8, 0, 1.2, 5.5),
        boxObstacle('gdn4-divider-b', -1, 0, 1.2, 5.5),
        boxObstacle('gdn4-guardian-left', 11, -3.5, 1.1, 4.8, { variant: 'rail' }),
        boxObstacle('gdn4-guardian-right', 11, 3.5, 1.1, 4.8, { variant: 'rail' })
      ],
      hazards: [
        boxHazard('gdn4-stream-top', 'water', 2.5, -8.8, 12, 2.4),
        boxHazard('gdn4-stream-bottom', 'water', 2.5, 8.8, 12, 2.4),
        boxHazard('gdn4-core', 'water', 6.5, 0, 4, 3)
      ],
      movingHazards: [
        movingHazard('gdn4-pollen-a', 'bumper', 5, -1.5, 2.1, 2.1, { axis: 'z', amplitude: 4.2, speed: 1.1 }),
        movingHazard('gdn4-pollen-b', 'bumper', 5, 1.5, 2.1, 2.1, { axis: 'z', amplitude: 4.2, speed: 1.1, phase: Math.PI })
      ],
      scenery: [{ type: 'aurora', x: -14, z: -10 }, { type: 'billboard', x: 0, z: 10 }, { type: 'iceberg', x: 16, z: -10 }]
    }
  ]
}
