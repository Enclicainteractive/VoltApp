/**
 * MiniGolf Physics Engine — Full 3D with Gravity, Hills, Air Time & Ramps
 *
 * Coordinate system:
 *   X = left/right
 *   Y = up/down (height above ground)
 *   Z = forward/back
 *
 * The ball has a full 3D position {x, y, z} and velocity {x, y, z}.
 * Gravity pulls the ball down (negative Y). When the ball is on the ground
 * (y <= terrain height at x,z), normal force and friction apply.
 * When airborne, only gravity acts (plus any wind/slope forces).
 */

import {
  DEFAULT_BALL_RADIUS,
  DEFAULT_CUP_RADIUS,
  MINIGOLF_POWERUP_DEFS,
  MINIGOLF_POWERUP_TYPES,
  SURFACE_PRESETS
} from './constants'

// ─── Simulation constants ────────────────────────────────────────────────────
const DEFAULT_DT = 1 / 120          // 120 Hz simulation for smoother arcs
const MAX_SIMULATION_STEPS = 1200   // 10 seconds max at 120 Hz
const STOP_SPEED = 0.055            // m/s — ball considered stopped below this
const CUP_CAPTURE_SPEED = 1.4       // m/s — max speed to sink into cup
const GRAVITY = 9.81                // m/s²
const GROUND_Y = 0                  // default ground plane
const BOUNCE_DAMPING = 0.58         // energy kept on ground bounce
const AIRBORNE_DRAG = 0.9998        // very slight air resistance
const RAMP_LAUNCH_ANGLE = 0.52      // ~30° default ramp launch angle (radians)

// ─── Helpers ─────────────────────────────────────────────────────────────────
const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

const distance2d = (a, b) =>
  Math.hypot((a?.x || 0) - (b?.x || 0), (a?.z || 0) - (b?.z || 0))

const distance3d = (a, b) =>
  Math.hypot((a?.x || 0) - (b?.x || 0), (a?.y || 0) - (b?.y || 0), (a?.z || 0) - (b?.z || 0))

const normalize2d = (vector) => {
  const length = Math.hypot(vector.x, vector.z)
  if (!length) return { x: 0, z: 0 }
  return { x: vector.x / length, z: vector.z / length }
}

const pointInBox = (point, box) => {
  const halfX = (box?.size?.x || 0) / 2
  const halfZ = (box?.size?.z || 0) / 2
  return (
    point.x >= box.position.x - halfX &&
    point.x <= box.position.x + halfX &&
    point.z >= box.position.z - halfZ &&
    point.z <= box.position.z + halfZ
  )
}

const clonePowerup = (powerup) => {
  if (!powerup?.type) return null
  const def = MINIGOLF_POWERUP_DEFS[powerup.type]
  return {
    ...(def || { id: powerup.type, label: powerup.type, description: '' }),
    ...powerup
  }
}

const getSpawnPointAlongPath = (path, ratio = 0.55) => {
  if (!Array.isArray(path) || !path.length) return { x: 0, z: 0 }
  return path[Math.max(0, Math.min(path.length - 1, Math.floor(path.length * ratio)))] || path[path.length - 1]
}

// ─── Terrain height sampling ──────────────────────────────────────────────────
/**
 * Sample the terrain height at a given (x, z) position.
 * Courses can define elevation zones as surfaces with an `elevation` field.
 * Ramps define a linear height gradient between two points.
 * Returns the Y height the ball should be resting on at that position.
 */
export const sampleTerrainHeight = (hole, point) => {
  const surfaces = Array.isArray(hole?.surfaces) ? hole.surfaces : []
  let maxElevation = GROUND_Y

  for (let i = surfaces.length - 1; i >= 0; i--) {
    const surface = surfaces[i]
    if (!pointInBox(point, surface)) continue

    if (surface.elevation != null) {
      // Flat elevated platform
      maxElevation = Math.max(maxElevation, Number(surface.elevation))
    } else if (surface.elevationStart != null && surface.elevationEnd != null) {
      // Ramp: linear interpolation along Z (or X) axis
      const halfX = (surface.size?.x || 0) / 2
      const halfZ = (surface.size?.z || 0) / 2
      const axis = surface.rampAxis || 'z'
      if (axis === 'z') {
        const t = clamp((point.z - (surface.position.z - halfZ)) / (halfZ * 2), 0, 1)
        maxElevation = Math.max(maxElevation, surface.elevationStart + (surface.elevationEnd - surface.elevationStart) * t)
      } else {
        const t = clamp((point.x - (surface.position.x - halfX)) / (halfX * 2), 0, 1)
        maxElevation = Math.max(maxElevation, surface.elevationStart + (surface.elevationEnd - surface.elevationStart) * t)
      }
    }
  }

  // Check ramp obstacles
  for (const obstacle of hole?.obstacles || []) {
    if (obstacle.type !== 'ramp') continue
    if (!pointInBox(point, obstacle)) continue
    const halfZ = (obstacle.size?.z || 0) / 2
    const halfX = (obstacle.size?.x || 0) / 2
    const axis = obstacle.rampAxis || 'z'
    if (axis === 'z') {
      const t = clamp((point.z - (obstacle.position.z - halfZ)) / (halfZ * 2), 0, 1)
      const h = (obstacle.elevationStart || 0) + ((obstacle.elevationEnd || 0) - (obstacle.elevationStart || 0)) * t
      maxElevation = Math.max(maxElevation, h)
    } else {
      const t = clamp((point.x - (obstacle.position.x - halfX)) / (halfX * 2), 0, 1)
      const h = (obstacle.elevationStart || 0) + ((obstacle.elevationEnd || 0) - (obstacle.elevationStart || 0)) * t
      maxElevation = Math.max(maxElevation, h)
    }
  }

  return maxElevation
}

/**
 * Sample the slope force at a given position.
 * Returns {x, z} acceleration components from terrain slope.
 * Hills generate slope forces that push the ball downhill.
 */
export const sampleTerrainSlope = (hole, point) => {
  const surfaces = Array.isArray(hole?.surfaces) ? hole.surfaces : []
  let slopeX = 0
  let slopeZ = 0

  for (let i = surfaces.length - 1; i >= 0; i--) {
    const surface = surfaces[i]
    if (!pointInBox(point, surface)) continue

    // Explicit slope override
    if (surface.slope) {
      slopeX += Number(surface.slope.x || 0)
      slopeZ += Number(surface.slope.z || 0)
    }

    // Ramp generates automatic slope force
    if (surface.elevationStart != null && surface.elevationEnd != null) {
      const rise = (surface.elevationEnd - surface.elevationStart)
      const run = surface.rampAxis === 'x' ? (surface.size?.x || 1) : (surface.size?.z || 1)
      const slopeAngle = Math.atan2(rise, run)
      const slopeForce = Math.sin(slopeAngle) * GRAVITY * 0.5
      if (surface.rampAxis === 'x') {
        slopeX += rise > 0 ? -slopeForce : slopeForce
      } else {
        slopeZ += rise > 0 ? -slopeForce : slopeForce
      }
    }
  }

  // Default hole slope
  const defaultSlope = hole?.defaultSlope || { x: 0, z: 0 }
  return {
    x: slopeX + Number(defaultSlope.x || 0),
    z: slopeZ + Number(defaultSlope.z || 0)
  }
}

// ─── Surface sampling ─────────────────────────────────────────────────────────
export const sampleSurface = (hole, point) => {
  const surfaces = Array.isArray(hole?.surfaces) ? hole.surfaces : []
  for (let index = surfaces.length - 1; index >= 0; index -= 1) {
    const surface = surfaces[index]
    if (surface.shape === 'box' && pointInBox(point, surface)) {
      return {
        ...surface,
        physics: {
          ...SURFACE_PRESETS.fairway,
          ...(SURFACE_PRESETS[surface.type] || null),
          friction: Number(surface.friction || SURFACE_PRESETS[surface.type]?.friction || SURFACE_PRESETS.fairway.friction),
          bounce: Number(surface.bounce || SURFACE_PRESETS[surface.type]?.bounce || SURFACE_PRESETS.fairway.bounce),
          boost: Number(surface.boost || 1),
          drag: Number(surface.drag || SURFACE_PRESETS[surface.type]?.drag || 1),
          trapThreshold: Number(surface.trapThreshold || SURFACE_PRESETS[surface.type]?.trapThreshold || 0)
        }
      }
    }
  }
  return {
    type: 'fairway',
    physics: { ...SURFACE_PRESETS.fairway, boost: 1 }
  }
}

export const samplePowerup = (hole, point, collectedIds = []) => {
  const collected = new Set(collectedIds || [])
  for (const powerup of hole?.powerups || []) {
    if (collected.has(powerup.id)) continue
    if (distance2d(point, powerup.position || powerup) <= (powerup.radius || 0.9)) {
      return clonePowerup(powerup)
    }
  }
  return null
}

export const sampleHazard = (hole, point) => {
  for (const hazard of [...(hole?.hazards || []), ...(hole?.dynamicHazards || [])]) {
    if (hazard?.movement) continue
    if (hazard.shape === 'box' && pointInBox(point, hazard)) {
      return hazard
    }
  }
  return null
}

export const sampleMovingHazardPosition = (hazard, timeSeconds = 0) => {
  if (!hazard?.movement) return hazard?.position || { x: 0, z: 0 }
  const amplitude = Number(hazard.movement.amplitude || 0)
  const speed = Number(hazard.movement.speed || 1)
  const phase = Number(hazard.movement.phase || 0)
  const offset = Math.sin(timeSeconds * speed + phase) * amplitude
  if (hazard.movement.axis === 'z') {
    return { x: hazard.position.x, z: hazard.position.z + offset }
  }
  return { x: hazard.position.x + offset, z: hazard.position.z }
}

// ─── Ball-to-ball collision ───────────────────────────────────────────────────
/**
 * Resolve elastic collision between the moving ball and any stationary
 * "other" balls on the course.  Other balls are treated as dynamic obstacles:
 * the moving ball bounces off them AND the struck ball is pushed away.
 *
 * Returns:
 *   { position, velocity, pushedBalls: [{ id, position, velocity }] }
 *
 * `otherBalls` is an array of { id, position: {x,y,z} } objects.
 * Pushed balls are returned so the caller can update their positions in the
 * simulation path (they will coast to a stop via friction on the next frame).
 */
const collideBallWithBalls = (position, velocity, otherBalls, radius, restitution = 0.88) => {
  let pos = { ...position }
  let vel = { ...velocity }
  const pushedBalls = []

  for (const other of (otherBalls || [])) {
    const op = other.position
    if (!op) continue

    const dx = pos.x - op.x
    const dz = pos.z - op.z
    const dist = Math.hypot(dx, dz)
    const minDist = radius * 2  // both balls have same radius

    if (dist < minDist && dist > 0.001) {
      // Normalised collision axis
      const nx = dx / dist
      const nz = dz / dist

      // Separate balls so they don't overlap
      const overlap = minDist - dist
      pos.x += nx * overlap * 0.5
      pos.z += nz * overlap * 0.5
      const otherNewX = op.x - nx * overlap * 0.5
      const otherNewZ = op.z - nz * overlap * 0.5

      // 1D elastic collision along the collision normal
      // (equal mass balls: velocities exchange along normal)
      const relVelN = vel.x * nx + vel.z * nz  // relative velocity along normal
      if (relVelN < 0) {
        // Balls are approaching — exchange velocity component along normal
        const impulse = relVelN * restitution
        vel.x -= impulse * nx
        vel.z -= impulse * nz
        // Struck ball gets the impulse (starts from rest)
        pushedBalls.push({
          id: other.id,
          position: { x: otherNewX, y: op.y || 0, z: otherNewZ },
          velocity: { x: impulse * nx, y: 0, z: impulse * nz }
        })
      }
    }
  }

  return { position: pos, velocity: vel, pushedBalls }
}

// ─── Collision helpers ────────────────────────────────────────────────────────
const collideWithBounds = (hole, position, velocity, radius) => {
  const bounds = hole?.bounds || { minX: -18, maxX: 18, minZ: -12, maxZ: 12 }
  const nextPosition = { ...position }
  const nextVelocity = { ...velocity }
  let collided = false

  if (nextPosition.x < bounds.minX + radius) {
    nextPosition.x = bounds.minX + radius
    nextVelocity.x = Math.abs(nextVelocity.x)
    collided = true
  }
  if (nextPosition.x > bounds.maxX - radius) {
    nextPosition.x = bounds.maxX - radius
    nextVelocity.x = -Math.abs(nextVelocity.x)
    collided = true
  }
  if (nextPosition.z < bounds.minZ + radius) {
    nextPosition.z = bounds.minZ + radius
    nextVelocity.z = Math.abs(nextVelocity.z)
    collided = true
  }
  if (nextPosition.z > bounds.maxZ - radius) {
    nextPosition.z = bounds.maxZ - radius
    nextVelocity.z = -Math.abs(nextVelocity.z)
    collided = true
  }

  return { position: nextPosition, velocity: nextVelocity, collided }
}

const collideWithBoxes = (position, velocity, colliders, radius, restitution = 0.84) => {
  let currentPosition = { ...position }
  let currentVelocity = { ...velocity }
  let collided = false

  for (const collider of colliders) {
    // Skip ramps — they're terrain, not walls
    if (collider.type === 'ramp') continue

    const halfX = (collider?.size?.x || 0) / 2 + radius
    const halfZ = (collider?.size?.z || 0) / 2 + radius
    const deltaX = currentPosition.x - collider.position.x
    const deltaZ = currentPosition.z - collider.position.z

    if (Math.abs(deltaX) <= halfX && Math.abs(deltaZ) <= halfZ) {
      // Only collide if ball is at the right height (not flying over)
      const colliderTop = Number(collider.elevation || 0) + Number(collider.height || 1.5)
      const ballY = currentPosition.y || 0
      if (ballY > colliderTop + radius) continue // ball is flying over this obstacle

      collided = true
      const overlapX = halfX - Math.abs(deltaX)
      const overlapZ = halfZ - Math.abs(deltaZ)
      if (overlapX < overlapZ) {
        currentPosition.x += deltaX >= 0 ? overlapX : -overlapX
        currentVelocity.x = -currentVelocity.x * restitution
      } else {
        currentPosition.z += deltaZ >= 0 ? overlapZ : -overlapZ
        currentVelocity.z = -currentVelocity.z * restitution
      }
    }
  }

  return { position: currentPosition, velocity: currentVelocity, collided }
}

// ─── Ramp launch detection ────────────────────────────────────────────────────
/**
 * Check if the ball is at the edge of a ramp and should be launched into the air.
 * Returns the launch Y velocity if launching, or 0 if not.
 */
const checkRampLaunch = (hole, position, velocity) => {
  for (const obstacle of [...(hole?.obstacles || []), ...(hole?.surfaces || [])]) {
    if (obstacle.type !== 'ramp' && obstacle.elevationEnd == null) continue
    if (!pointInBox(position, obstacle)) continue

    const elevEnd = Number(obstacle.elevationEnd || 0)
    const elevStart = Number(obstacle.elevationStart || 0)
    const rise = elevEnd - elevStart

    // Only launch off the high end of a ramp
    if (rise <= 0.3) continue

    const halfZ = (obstacle.size?.z || 0) / 2
    const halfX = (obstacle.size?.x || 0) / 2
    const axis = obstacle.rampAxis || 'z'

    let atHighEnd = false
    if (axis === 'z') {
      const highZ = obstacle.position.z + (rise > 0 ? halfZ : -halfZ)
      atHighEnd = Math.abs(position.z - highZ) < 0.6
    } else {
      const highX = obstacle.position.x + (rise > 0 ? halfX : -halfX)
      atHighEnd = Math.abs(position.x - highX) < 0.6
    }

    if (atHighEnd) {
      const speed2d = Math.hypot(velocity.x, velocity.z)
      const launchAngle = obstacle.launchAngle || RAMP_LAUNCH_ANGLE
      // Launch velocity proportional to horizontal speed
      return speed2d * Math.tan(launchAngle)
    }
  }
  return 0
}

// ─── Spawn helpers ────────────────────────────────────────────────────────────
const buildSpawnedObstacle = (effect, point) => {
  if (!effect?.spawnObstacleType) return null
  if (effect.spawnObstacleType === 'bumper-post') {
    return {
      id: `bumper-${Date.now().toString(36)}-${Math.round(point.x * 10)}-${Math.round(point.z * 10)}`,
      type: 'wall',
      shape: 'box',
      variant: 'bumper-post',
      position: { x: point.x, z: point.z },
      size: { x: 1.15, z: 1.15 },
      height: 1.45
    }
  }
  return {
    id: `${effect.spawnObstacleType}-${Date.now().toString(36)}-${Math.round(point.x * 10)}-${Math.round(point.z * 10)}`,
    type: 'wall',
    shape: 'box',
    variant: effect.spawnObstacleType,
    position: { x: point.x, z: point.z },
    size: effect.spawnObstacleType === 'spike-strip' ? { x: 2.2, z: 0.65 } : effect.spawnObstacleType === 'pulse-wall' ? { x: 1.2, z: 4.6 } : { x: 1.8, z: 0.9 },
    height: effect.spawnObstacleType === 'pulse-wall' ? 1.7 : 1.1
  }
}

const buildSpawnedHazard = (effect, point) => {
  if (!effect?.spawnHazardType) return null
  const movement = effect.spawnHazardMovement === 'orbit'
    ? { axis: 'x', amplitude: 2.8, speed: 1.7, phase: (point.x + point.z) * 0.2 }
    : effect.spawnHazardMovement
      ? { axis: 'z', amplitude: effect.spawnHazardMovement === 'afterimage' ? 2.2 : 3.6, speed: effect.spawnHazardMovement === 'echo' ? 1.55 : 1.25, phase: (point.x - point.z) * 0.15 }
      : null
  return {
    id: `${effect.spawnHazardType}-${Date.now().toString(36)}-${Math.round(point.x * 10)}-${Math.round(point.z * 10)}`,
    type: effect.spawnHazardType,
    shape: 'box',
    position: { x: point.x, z: point.z },
    size: effect.spawnHazardType === 'black-hole' ? { x: 2.6, z: 2.6 } : effect.spawnHazardType === 'mine' ? { x: 1.2, z: 1.2 } : { x: 1.8, z: 1.8 },
    movement
  }
}

const findCheckpoint = (point, checkpoints = []) => {
  for (const checkpoint of checkpoints) {
    if (distance2d(point, checkpoint.position || checkpoint) <= (checkpoint.radius || 1.2)) {
      return checkpoint.position || checkpoint
    }
  }
  return null
}

// ─── Shot vector builder ──────────────────────────────────────────────────────
export const buildShotVector = ({ angle = 0, power = 0.5, powerScale = 16, loftAngle = 0 }) => {
  const normalizedPower = clamp(Number(power) || 0, 0, 1)
  const horizontalSpeed = Math.cos(Number(loftAngle) || 0) * normalizedPower * powerScale
  const verticalSpeed = Math.sin(Number(loftAngle) || 0) * normalizedPower * powerScale
  return {
    x: Math.cos(angle) * horizontalSpeed,
    y: verticalSpeed,
    z: Math.sin(angle) * horizontalSpeed
  }
}

// Export collideBallWithBalls so the activity can use it for real-time
// obstacle-push updates when a ball is struck by a moving hazard or obstacle.
export { collideBallWithBalls }

// ─── Main simulation ──────────────────────────────────────────────────────────
/**
 * Simulate a golf shot with full 3D physics.
 *
 * New fields in the result path points: { x, y, z, t, airborne }
 * New result fields: maxHeight, wasAirborne, airTime, pushedBalls
 *
 * `otherBalls` — array of { id, position: {x,y,z} } for other players' balls
 *   on the same hole. When the shot ball hits one, it pushes it away and the
 *   pushed ball's final resting position is returned in `pushedBalls`.
 */
export const simulateShot = ({
  hole,
  start,
  shot,
  lastCheckpoint = null,
  activePowerup = null,
  collectedPowerupIds = [],
  ballRadius = DEFAULT_BALL_RADIUS,
  maxSteps = MAX_SIMULATION_STEPS,
  gameClockSeconds = 0,
  otherBalls = []   // [{ id, position: {x,y,z} }]
}) => {
  const startPosition = {
    x: Number(start?.x || 0),
    y: Number(start?.y || sampleTerrainHeight(hole, { x: start?.x || 0, z: start?.z || 0 })),
    z: Number(start?.z || 0)
  }
  const checkpoint = lastCheckpoint || hole?.tee || { x: startPosition.x, z: startPosition.z }
  const equippedPowerup = clonePowerup(activePowerup)

  // Build initial velocity (3D)
  let velocity
  if (shot?.velocity) {
    velocity = {
      x: Number(shot.velocity.x || 0),
      y: Number(shot.velocity.y || 0),
      z: Number(shot.velocity.z || 0)
    }
  } else {
    velocity = buildShotVector(shot || {})
  }

  // Apply powerup speed multiplier
  const speedMultiplier = Number(
    equippedPowerup?.speedMultiplier ||
    (equippedPowerup?.type === MINIGOLF_POWERUP_TYPES.OVERDRIVE ? 1.24 : 1)
  )
  if (speedMultiplier !== 1) {
    velocity.x *= speedMultiplier
    velocity.z *= speedMultiplier
    // Don't multiply Y — that would mess up loft
  }

  let position = { ...startPosition }
  let activeCheckpoint = { x: checkpoint.x || 0, z: checkpoint.z || 0 }
  let time = 0
  let totalDistance = 0
  let lastSurfaceType = 'fairway'
  let collisionCount = 0
  let awardedPowerup = null
  let maxHeight = startPosition.y
  let airTime = 0
  let wasAirborne = false
  let isAirborne = startPosition.y > sampleTerrainHeight(hole, startPosition) + 0.05

  const collectedIds = new Set(collectedPowerupIds || [])
  const newlyCollectedPowerupIds = []
  const spawnedObstacles = []
  const spawnedHazards = []
  const path = [{ x: position.x, y: position.y, z: position.z, t: 0, airborne: isAirborne }]

  // Mutable copy of other balls' positions so they move when pushed
  const liveBalls = (otherBalls || []).map(b => ({
    id: b.id,
    position: { x: b.position?.x || 0, y: b.position?.y || 0, z: b.position?.z || 0 },
    velocity: { x: 0, y: 0, z: 0 }
  }))
  // Track which balls were pushed and their final positions
  const pushedBallsMap = {}

  for (let step = 0; step < maxSteps; step += 1) {
    const terrainY = sampleTerrainHeight(hole, position)
    isAirborne = position.y > terrainY + 0.08

    // ── Gravity ──────────────────────────────────────────────────────────────
    if (isAirborne) {
      velocity.y -= GRAVITY * DEFAULT_DT
      // Slight air drag on horizontal
      velocity.x *= AIRBORNE_DRAG
      velocity.z *= AIRBORNE_DRAG
      airTime += DEFAULT_DT
      wasAirborne = true
    } else {
      // On ground — snap Y to terrain
      position.y = terrainY

      // Kill downward velocity on landing (bounce)
      if (velocity.y < -0.1) {
        const surfaceForBounce = sampleSurface(hole, position)
        const bounceCoeff = surfaceForBounce.physics.bounce * BOUNCE_DAMPING *
          Number(equippedPowerup?.bounceScale || 1)
        velocity.y = -velocity.y * bounceCoeff
        // If bounce is tiny, kill it
        if (Math.abs(velocity.y) < 0.15) velocity.y = 0
        collisionCount++
      } else {
        velocity.y = 0
      }

      // ── Surface physics ───────────────────────────────────────────────────
      const sampledSurface = sampleSurface(hole, position)
      const surface = sampledSurface.type === 'sticky' &&
        (equippedPowerup?.type === MINIGOLF_POWERUP_TYPES.GRIT || equippedPowerup?.ignoreSticky)
        ? {
            ...sampledSurface,
            type: 'fairway',
            physics: { ...SURFACE_PRESETS.fairway, boost: sampledSurface.physics?.boost || 1, drag: 1, trapThreshold: 0 }
          }
        : sampledSurface
      lastSurfaceType = surface.type || 'fairway'

      // ── Slope / hill forces ───────────────────────────────────────────────
      const slope = sampleTerrainSlope(hole, position)
      velocity.x += (slope.x + Number(equippedPowerup?.curveForce || 0) * 0.08) * DEFAULT_DT
      velocity.z += slope.z * DEFAULT_DT

      // ── Friction ──────────────────────────────────────────────────────────
      const friction = clamp(
        surface.physics.friction *
        surface.physics.boost *
        (surface.physics.drag || 1) *
        Number(equippedPowerup?.frictionScale || 1),
        0.58, 0.9995
      )
      velocity.x *= friction
      velocity.z *= friction

      if (surface.type === 'sticky') {
        const stickySpeed = Math.hypot(velocity.x, velocity.z)
        if (stickySpeed <= (surface.physics.trapThreshold || 0)) {
          velocity.x *= 0.32
          velocity.z *= 0.32
        }
      }

      // ── Ramp launch check ─────────────────────────────────────────────────
      const launchVY = checkRampLaunch(hole, position, velocity)
      if (launchVY > 0.1) {
        velocity.y = launchVY
        isAirborne = true
      }
    }

    // ── Integrate position ────────────────────────────────────────────────────
    const nextPosition = {
      x: position.x + velocity.x * DEFAULT_DT,
      y: position.y + velocity.y * DEFAULT_DT,
      z: position.z + velocity.z * DEFAULT_DT
    }

    // ── Bounds collision (XZ only) ────────────────────────────────────────────
    const boundsCollision = collideWithBounds(hole, nextPosition, velocity, ballRadius)
    let candidatePosition = boundsCollision.position
    let nextVelocity = boundsCollision.velocity

    // ── Obstacle collision (only when not flying over) ────────────────────────
    const obstacleCollision = collideWithBoxes(
      candidatePosition, nextVelocity,
      [...(hole?.obstacles || []), ...(hole?.dynamicObstacles || [])],
      ballRadius,
      (sampleSurface(hole, candidatePosition).physics.bounce) * Number(equippedPowerup?.wallRestitutionScale || 1)
    )
    candidatePosition = obstacleCollision.position
    nextVelocity = obstacleCollision.velocity

    // ── Moving hazard collision ───────────────────────────────────────────────
    const movingColliders = [
      ...(hole?.movingHazards || []),
      ...((hole?.dynamicHazards || []).filter((h) => h?.movement))
    ].map((hazard) => ({
      ...hazard,
      position: sampleMovingHazardPosition(hazard, gameClockSeconds + time)
    }))
    const movingCollision = collideWithBoxes(candidatePosition, nextVelocity, movingColliders, ballRadius, 0.96)
    candidatePosition = movingCollision.position
    nextVelocity = movingCollision.velocity

    if (boundsCollision.collided || obstacleCollision.collided || movingCollision.collided) {
      collisionCount++
    }

    // ── Ball-to-ball collision (works regardless of whose turn it is) ─────────
    if (liveBalls.length > 0 && !isAirborne) {
      const ballCollision = collideBallWithBalls(candidatePosition, nextVelocity, liveBalls, ballRadius)
      candidatePosition = ballCollision.position
      nextVelocity = ballCollision.velocity
      for (const pushed of ballCollision.pushedBalls) {
        // Update the live position of the struck ball so it can be hit again
        const liveIdx = liveBalls.findIndex(b => b.id === pushed.id)
        if (liveIdx >= 0) {
          liveBalls[liveIdx].position = { ...pushed.position }
          liveBalls[liveIdx].velocity = { ...pushed.velocity }
        }
        // Record the push (last push wins for final position)
        pushedBallsMap[pushed.id] = pushed
        collisionCount++
      }
    }

    // ── Advance pushed balls under friction each step ─────────────────────────
    for (const lb of liveBalls) {
      if (Math.hypot(lb.velocity.x, lb.velocity.z) < STOP_SPEED) continue
      const lbTerrainY = sampleTerrainHeight(hole, lb.position)
      const lbSurface = sampleSurface(hole, lb.position)
      const lbFriction = clamp(lbSurface.physics.friction * (lbSurface.physics.drag || 1), 0.58, 0.9995)
      lb.velocity.x *= lbFriction
      lb.velocity.z *= lbFriction
      lb.position.x += lb.velocity.x * DEFAULT_DT
      lb.position.z += lb.velocity.z * DEFAULT_DT
      lb.position.y = lbTerrainY
      // Update pushedBallsMap with latest position
      if (pushedBallsMap[lb.id]) {
        pushedBallsMap[lb.id].position = { ...lb.position }
      }
    }

    // ── Ground clamp — don't go below terrain ─────────────────────────────────
    const newTerrainY = sampleTerrainHeight(hole, candidatePosition)
    if (candidatePosition.y < newTerrainY) {
      candidatePosition.y = newTerrainY
      if (nextVelocity.y < 0) nextVelocity.y = 0
    }

    // ── Track max height ──────────────────────────────────────────────────────
    if (candidatePosition.y > maxHeight) maxHeight = candidatePosition.y

    // ── Out of bounds / fall off edge ─────────────────────────────────────────
    if (candidatePosition.y < -8) {
      // Ball fell off the course
      return {
        path: [...path, { x: candidatePosition.x, y: candidatePosition.y, z: candidatePosition.z, t: time + DEFAULT_DT, airborne: true }],
        finalPosition: { x: activeCheckpoint.x, y: sampleTerrainHeight(hole, activeCheckpoint), z: activeCheckpoint.z },
        finalVelocity: { x: 0, y: 0, z: 0 },
        settled: true,
        inHole: false,
        totalDistance,
        resultType: 'out-of-bounds',
        surfaceType: lastSurfaceType,
        collisionCount,
        checkpoint: { ...activeCheckpoint },
        extraStrokes: 1,
        awardedPowerup,
        collectedPowerupIds: newlyCollectedPowerupIds,
        spawnedObstacles,
        spawnedHazards,
        consumedPowerup: equippedPowerup,
        maxHeight,
        wasAirborne,
        airTime
      }
    }

    // ── Hazard check ──────────────────────────────────────────────────────────
    const hazard = sampleHazard(hole, candidatePosition)
    if (hazard && !isAirborne) {
      const isBlackHole = hazard.type === 'black-hole'
      return {
        path: [...path, { x: candidatePosition.x, y: candidatePosition.y, z: candidatePosition.z, t: time + DEFAULT_DT, airborne: false }],
        finalPosition: { x: activeCheckpoint.x, y: sampleTerrainHeight(hole, activeCheckpoint), z: activeCheckpoint.z },
        finalVelocity: { x: 0, y: 0, z: 0 },
        settled: true,
        inHole: false,
        totalDistance,
        resultType: isBlackHole ? 'black-hole' : hazard.type === 'lava' ? 'lava-reset' : 'hazard-reset',
        surfaceType: lastSurfaceType,
        collisionCount,
        checkpoint: isBlackHole ? { ...(hole?.tee || activeCheckpoint) } : { ...activeCheckpoint },
        extraStrokes: isBlackHole ? 20 : 0,
        ballDestroyed: isBlackHole,
        awardedPowerup,
        collectedPowerupIds: newlyCollectedPowerupIds,
        spawnedObstacles,
        spawnedHazards,
        consumedPowerup: equippedPowerup,
        maxHeight,
        wasAirborne,
        airTime
      }
    }

    // ── Powerup collection ────────────────────────────────────────────────────
    const touchedPowerup = samplePowerup(hole, candidatePosition, [...collectedIds])
    if (touchedPowerup && !collectedIds.has(touchedPowerup.id)) {
      collectedIds.add(touchedPowerup.id)
      newlyCollectedPowerupIds.push(touchedPowerup.id)
      if (!awardedPowerup) awardedPowerup = touchedPowerup
    }

    // ── Checkpoint ────────────────────────────────────────────────────────────
    const newCheckpoint = findCheckpoint(candidatePosition, hole?.checkpoints || [])
    if (newCheckpoint) {
      activeCheckpoint = { ...newCheckpoint }
    }

    // ── Cup check ─────────────────────────────────────────────────────────────
    const cup = hole?.cup || { x: 0, z: 0, radius: DEFAULT_CUP_RADIUS }
    const cupRadiusBoost = Number(
      equippedPowerup?.cupRadiusBonus ||
      (equippedPowerup?.type === MINIGOLF_POWERUP_TYPES.MAGNET ? 0.22 : 0)
    )
    const cupCaptureSpeed = CUP_CAPTURE_SPEED * Number(
      equippedPowerup?.cupCaptureSpeedMultiplier ||
      (equippedPowerup?.type === MINIGOLF_POWERUP_TYPES.MAGNET ? 1.25 : 1)
    )
    const cupDist = distance2d(candidatePosition, cup)
    const ballSpeed = Math.hypot(nextVelocity.x, nextVelocity.z)
    // Ball must be near ground level to sink (not flying over)
    const cupTerrainY = sampleTerrainHeight(hole, cup)
    const ballNearGround = candidatePosition.y <= cupTerrainY + ballRadius * 2

    if (cupDist <= ((cup.radius || DEFAULT_CUP_RADIUS) + cupRadiusBoost) && ballSpeed <= cupCaptureSpeed && ballNearGround) {
      path.push({ x: cup.x, y: cupTerrainY, z: cup.z, t: time + DEFAULT_DT, airborne: false })
      return {
        path,
        finalPosition: { x: cup.x, y: cupTerrainY, z: cup.z },
        finalVelocity: { x: 0, y: 0, z: 0 },
        settled: true,
        inHole: true,
        totalDistance,
        resultType: 'cup',
        surfaceType: lastSurfaceType,
        collisionCount,
        checkpoint: { ...activeCheckpoint },
        awardedPowerup,
        collectedPowerupIds: newlyCollectedPowerupIds,
        spawnedObstacles,
        spawnedHazards,
        consumedPowerup: equippedPowerup,
        maxHeight,
        wasAirborne,
        airTime
      }
    }

    // ── Distance tracking ─────────────────────────────────────────────────────
    totalDistance += Math.hypot(
      candidatePosition.x - position.x,
      candidatePosition.z - position.z
    )

    position = candidatePosition
    velocity = nextVelocity
    time += DEFAULT_DT

    // Record path point every 3 steps (or every step when airborne for smooth arc)
    if (isAirborne || step % 3 === 0) {
      path.push({ x: position.x, y: position.y, z: position.z, t: time, airborne: isAirborne })
    }

    // ── Stop condition ────────────────────────────────────────────────────────
    const totalSpeed = Math.hypot(velocity.x, velocity.y, velocity.z)
    if (totalSpeed <= STOP_SPEED && !isAirborne) {
      break
    }
  }

  // Spawn powerup effects
  const spawnPoint = getSpawnPointAlongPath(path, 0.55)
  const spawnedObstacle = buildSpawnedObstacle(equippedPowerup, spawnPoint)
  if (spawnedObstacle) spawnedObstacles.push(spawnedObstacle)
  const spawnedHazard = buildSpawnedHazard(equippedPowerup, spawnPoint)
  if (spawnedHazard) spawnedHazards.push(spawnedHazard)

  return {
    path,
    finalPosition: { x: position.x, y: position.y, z: position.z },
    finalVelocity: { x: 0, y: 0, z: 0 },
    settled: true,
    inHole: false,
    totalDistance,
    resultType: 'settled',
    surfaceType: lastSurfaceType,
    collisionCount,
    checkpoint: { ...activeCheckpoint },
    awardedPowerup,
    collectedPowerupIds: newlyCollectedPowerupIds,
    spawnedObstacles,
    spawnedHazards,
    consumedPowerup: equippedPowerup,
    maxHeight,
    wasAirborne,
    airTime,
    // Positions of other players' balls after being pushed by this shot
    pushedBalls: Object.values(pushedBallsMap)
  }
}
