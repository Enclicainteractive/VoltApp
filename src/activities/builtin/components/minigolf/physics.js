import { DEFAULT_BALL_RADIUS, DEFAULT_CUP_RADIUS, SURFACE_PRESETS } from './constants'

const DEFAULT_DT = 1 / 90
const MAX_SIMULATION_STEPS = 900
const STOP_SPEED = 0.065
const CUP_CAPTURE_SPEED = 1.35

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

const distance2d = (a, b) => Math.hypot((a?.x || 0) - (b?.x || 0), (a?.z || 0) - (b?.z || 0))

const normalize = (vector) => {
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

const findCheckpoint = (point, checkpoints = []) => {
  for (const checkpoint of checkpoints) {
    if (distance2d(point, checkpoint.position || checkpoint) <= (checkpoint.radius || 1.2)) {
      return checkpoint.position || checkpoint
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
          boost: Number(surface.boost || 1)
        }
      }
    }
  }
  return {
    type: 'fairway',
    physics: { ...SURFACE_PRESETS.fairway, boost: 1 }
  }
}

export const sampleHazard = (hole, point) => {
  for (const hazard of hole?.hazards || []) {
    if (hazard.shape === 'box' && pointInBox(point, hazard)) {
      return hazard
    }
  }
  return null
}

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
    const halfX = (collider?.size?.x || 0) / 2 + radius
    const halfZ = (collider?.size?.z || 0) / 2 + radius
    const deltaX = currentPosition.x - collider.position.x
    const deltaZ = currentPosition.z - collider.position.z

    if (Math.abs(deltaX) <= halfX && Math.abs(deltaZ) <= halfZ) {
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

export const buildShotVector = ({ angle = 0, power = 0.5, powerScale = 16 }) => {
  const normalizedPower = clamp(Number(power) || 0, 0, 1)
  return {
    x: Math.cos(angle) * normalizedPower * powerScale,
    z: Math.sin(angle) * normalizedPower * powerScale
  }
}

export const simulateShot = ({
  hole,
  start,
  shot,
  lastCheckpoint = null,
  ballRadius = DEFAULT_BALL_RADIUS,
  maxSteps = MAX_SIMULATION_STEPS
}) => {
  const startPosition = { x: Number(start?.x || 0), z: Number(start?.z || 0) }
  const checkpoint = lastCheckpoint || hole?.tee || startPosition
  const initialVelocity = shot?.velocity
    ? { x: Number(shot.velocity.x || 0), z: Number(shot.velocity.z || 0) }
    : buildShotVector(shot || {})

  let position = { ...startPosition }
  let velocity = { ...initialVelocity }
  let activeCheckpoint = checkpoint
  let time = 0
  let totalDistance = 0
  let lastSurfaceType = 'fairway'
  let collisionCount = 0
  const path = [{ x: position.x, z: position.z, t: 0 }]

  for (let step = 0; step < maxSteps; step += 1) {
    const surface = sampleSurface(hole, position)
    const slope = surface?.slope || surface?.physics?.slope || hole?.defaultSlope || { x: 0, z: 0 }
    lastSurfaceType = surface.type || 'fairway'

    velocity.x += Number(slope?.x || 0) * DEFAULT_DT
    velocity.z += Number(slope?.z || 0) * DEFAULT_DT

    const nextPosition = {
      x: position.x + velocity.x * DEFAULT_DT,
      z: position.z + velocity.z * DEFAULT_DT
    }

    let nextVelocity = { ...velocity }

    const boundsCollision = collideWithBounds(hole, nextPosition, nextVelocity, ballRadius)
    let candidatePosition = boundsCollision.position
    nextVelocity = boundsCollision.velocity

    const obstacleCollision = collideWithBoxes(candidatePosition, nextVelocity, hole?.obstacles || [], ballRadius, surface.physics.bounce)
    candidatePosition = obstacleCollision.position
    nextVelocity = obstacleCollision.velocity

    const movingColliders = (hole?.movingHazards || []).map((hazard) => ({
      ...hazard,
      position: sampleMovingHazardPosition(hazard, time)
    }))
    const movingCollision = collideWithBoxes(candidatePosition, nextVelocity, movingColliders, ballRadius, 0.96)
    candidatePosition = movingCollision.position
    nextVelocity = movingCollision.velocity

    if (boundsCollision.collided || obstacleCollision.collided || movingCollision.collided) {
      collisionCount += 1
    }

    const hazard = sampleHazard(hole, candidatePosition)
    if (hazard) {
      return {
        path: [...path, { x: candidatePosition.x, z: candidatePosition.z, t: time + DEFAULT_DT }],
        finalPosition: { ...activeCheckpoint },
        finalVelocity: { x: 0, z: 0 },
        settled: true,
        inHole: false,
        totalDistance,
        resultType: hazard.type === 'lava' ? 'lava-reset' : 'hazard-reset',
        surfaceType: lastSurfaceType,
        collisionCount,
        checkpoint: { ...activeCheckpoint }
      }
    }

    const newCheckpoint = findCheckpoint(candidatePosition, hole?.checkpoints || [])
    if (newCheckpoint) {
      activeCheckpoint = { ...newCheckpoint }
    }

    const cup = hole?.cup || { x: 0, z: 0, radius: DEFAULT_CUP_RADIUS }
    if (distance2d(candidatePosition, cup) <= (cup.radius || DEFAULT_CUP_RADIUS) && Math.hypot(nextVelocity.x, nextVelocity.z) <= CUP_CAPTURE_SPEED) {
      path.push({ x: cup.x, z: cup.z, t: time + DEFAULT_DT })
      return {
        path,
        finalPosition: { x: cup.x, z: cup.z },
        finalVelocity: { x: 0, z: 0 },
        settled: true,
        inHole: true,
        totalDistance,
        resultType: 'cup',
        surfaceType: lastSurfaceType,
        collisionCount,
        checkpoint: { ...activeCheckpoint }
      }
    }

    const distanceStep = Math.hypot(candidatePosition.x - position.x, candidatePosition.z - position.z)
    totalDistance += distanceStep

    const friction = clamp(surface.physics.friction * surface.physics.boost, 0.72, 0.9995)
    nextVelocity.x *= friction
    nextVelocity.z *= friction
    position = candidatePosition
    velocity = nextVelocity
    time += DEFAULT_DT

    if (step % 3 === 0) {
      path.push({ x: position.x, z: position.z, t: time })
    }

    if (Math.hypot(velocity.x, velocity.z) <= STOP_SPEED) {
      break
    }
  }

  return {
    path,
    finalPosition: { ...position },
    finalVelocity: { x: 0, z: 0 },
    settled: true,
    inHole: false,
    totalDistance,
    resultType: 'settled',
    surfaceType: lastSurfaceType,
    collisionCount,
    checkpoint: { ...activeCheckpoint }
  }
}
