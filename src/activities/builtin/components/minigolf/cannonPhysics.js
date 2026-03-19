/**
 * cannonPhysics.js  –  Cannon-es physics world for MiniGolf live simulation
 *
 * Architecture:
 *  • One cannon-es World per shot (created fresh, stepped per frame)
 *  • Ball = sphere body, obstacles/bounds = box bodies, ground = plane
 *  • Runs in the main thread inside useFrame (no worker needed – cannon-es is fast)
 *  • Authoritative result still comes from simulateShot (existing custom physics)
 *    for multiplayer sync; cannon-es is purely visual
 *
 * Usage:
 *   const physWorld = createMiniGolfPhysicsWorld(hole)
 *   physWorld.setBallPosition(start)
 *   physWorld.shootBall(angle, power)
 *   // each frame:
 *   physWorld.step(delta)
 *   const pos = physWorld.getBallPosition()
 *   const settled = physWorld.isSettled()
 *   physWorld.dispose()
 */
import * as CANNON from 'cannon-es'
import { DEFAULT_BALL_RADIUS, SURFACE_PRESETS } from './constants'
import { sampleMovingHazardPosition } from './physics'

// Power scale – matches existing simulateShot buildShotVector
const POWER_SCALE = 16

// Gravity – minigolf is top-down so we use a small downward gravity
// just enough to keep the ball on the ground plane
const GRAVITY = -9.82

// Friction / restitution defaults
const DEFAULT_FRICTION    = 0.4
const DEFAULT_RESTITUTION = 0.3

// Stop threshold
const STOP_SPEED = 0.08

/**
 * Build a cannon-es physics world for a single minigolf hole.
 * Returns a controller object with step/shoot/getPosition/dispose methods.
 */
export function createMiniGolfPhysicsWorld(hole) {
  if (!hole) return null

  const world = new CANNON.World({
    gravity: new CANNON.Vec3(0, GRAVITY, 0),
  })
  world.broadphase = new CANNON.SAPBroadphase(world)
  world.allowSleep = true

  // ── Materials ──────────────────────────────────────────────────────────────
  const ballMat    = new CANNON.Material('ball')
  const groundMat  = new CANNON.Material('ground')
  const wallMat    = new CANNON.Material('wall')

  const ballGround = new CANNON.ContactMaterial(ballMat, groundMat, {
    friction: DEFAULT_FRICTION,
    restitution: DEFAULT_RESTITUTION,
  })
  const ballWall = new CANNON.ContactMaterial(ballMat, wallMat, {
    friction: 0.1,
    restitution: 0.6,
  })
  world.addContactMaterial(ballGround)
  world.addContactMaterial(ballWall)

  // ── Ground plane ───────────────────────────────────────────────────────────
  const groundBody = new CANNON.Body({
    mass: 0,
    material: groundMat,
    shape: new CANNON.Plane(),
  })
  groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0)
  world.addBody(groundBody)

  // ── Bounds walls ──────────────────────────────────────────────────────────
  const bounds = hole.bounds || { minX: -18, maxX: 18, minZ: -12, maxZ: 12 }
  const wallH = 2.0
  const wallThick = 0.5

  const addWall = (cx, cy, cz, sx, sy, sz) => {
    const body = new CANNON.Body({
      mass: 0,
      material: wallMat,
      shape: new CANNON.Box(new CANNON.Vec3(sx / 2, sy / 2, sz / 2)),
    })
    body.position.set(cx, cy, cz)
    world.addBody(body)
    return body
  }

  const bW = bounds.maxX - bounds.minX
  const bD = bounds.maxZ - bounds.minZ
  const bCX = (bounds.maxX + bounds.minX) / 2
  const bCZ = (bounds.maxZ + bounds.minZ) / 2

  // North / South / East / West walls
  addWall(bCX, wallH / 2, bounds.minZ - wallThick / 2, bW + wallThick * 2, wallH, wallThick)
  addWall(bCX, wallH / 2, bounds.maxZ + wallThick / 2, bW + wallThick * 2, wallH, wallThick)
  addWall(bounds.minX - wallThick / 2, wallH / 2, bCZ, wallThick, wallH, bD)
  addWall(bounds.maxX + wallThick / 2, wallH / 2, bCZ, wallThick, wallH, bD)

  // ── Obstacles ──────────────────────────────────────────────────────────────
  const obstacleWalls = []
  for (const obs of hole.obstacles || []) {
    const w = obs.size?.x || 1
    const d = obs.size?.z || 1
    const h = obs.height || 1.4
    const body = new CANNON.Body({
      mass: 0,
      material: wallMat,
      shape: new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)),
    })
    body.position.set(obs.position.x, h / 2, obs.position.z)
    world.addBody(body)
    obstacleWalls.push(body)
  }

  // ── Surface friction patches ───────────────────────────────────────────────
  // We approximate surface friction by adjusting the ball's linear damping
  // based on which surface it's on (checked each step).
  const surfaces = hole.surfaces || []

  // ── Ball body ──────────────────────────────────────────────────────────────
  const ballBody = new CANNON.Body({
    mass: 0.046,  // golf ball mass in kg
    material: ballMat,
    shape: new CANNON.Sphere(DEFAULT_BALL_RADIUS),
    linearDamping: 0.35,
    angularDamping: 0.4,
    allowSleep: true,
    sleepSpeedLimit: STOP_SPEED,
    sleepTimeLimit: 0.5,
  })
  ballBody.position.set(0, DEFAULT_BALL_RADIUS, 0)
  world.addBody(ballBody)

  // ── State ──────────────────────────────────────────────────────────────────
  let _settled = false
  let _inHole  = false
  let _hazardReset = false
  let _resetPosition = null
  let _elapsedTime = 0

  // ── Helpers ────────────────────────────────────────────────────────────────
  const pointInBox = (px, pz, box) => {
    const hx = (box.size?.x || 0) / 2
    const hz = (box.size?.z || 0) / 2
    return (
      px >= box.position.x - hx && px <= box.position.x + hx &&
      pz >= box.position.z - hz && pz <= box.position.z + hz
    )
  }

  const getSurfaceFriction = (px, pz) => {
    for (let i = surfaces.length - 1; i >= 0; i--) {
      const s = surfaces[i]
      if (s.shape === 'box' && pointInBox(px, pz, s)) {
        const preset = SURFACE_PRESETS[s.type] || SURFACE_PRESETS.fairway
        // Map friction (0.88–0.994) to cannon linearDamping (0.1–0.8)
        const f = preset.friction
        return { damping: 1.0 - f, restitution: 1.0 - preset.bounce }
      }
    }
    return { damping: 0.35, restitution: 0.7 }
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  return {
    setBallPosition(pos) {
      ballBody.position.set(pos.x, DEFAULT_BALL_RADIUS + 0.01, pos.z)
      ballBody.velocity.set(0, 0, 0)
      ballBody.angularVelocity.set(0, 0, 0)
      ballBody.wakeUp()
      _settled = false
      _inHole = false
      _hazardReset = false
      _resetPosition = { x: pos.x, z: pos.z }
      _elapsedTime = 0
    },

    shootBall(angle, power) {
      const vx = Math.cos(angle) * power * POWER_SCALE
      const vz = Math.sin(angle) * power * POWER_SCALE
      ballBody.velocity.set(vx, 0, vz)
      ballBody.angularVelocity.set(0, 0, 0)
      ballBody.wakeUp()
      _settled = false
      _inHole = false
      _hazardReset = false
    },

    step(delta) {
      if (_settled) return

      _elapsedTime += delta

      // Clamp delta to avoid spiral of death
      const dt = Math.min(delta, 1 / 30)

      // Update surface friction based on ball position
      const bx = ballBody.position.x
      const bz = ballBody.position.z
      const surf = getSurfaceFriction(bx, bz)
      ballBody.linearDamping  = surf.damping
      ballBody.angularDamping = surf.damping * 0.8

      // Apply slope forces from surfaces
      for (let i = surfaces.length - 1; i >= 0; i--) {
        const s = surfaces[i]
        if (s.shape === 'box' && pointInBox(bx, bz, s) && s.slope) {
          ballBody.applyForce(
            new CANNON.Vec3(
              (s.slope.x || 0) * ballBody.mass * 9.82,
              0,
              (s.slope.z || 0) * ballBody.mass * 9.82
            ),
            ballBody.position
          )
        }
      }

      // Moving hazard collisions (update their positions)
      for (let i = 0; i < (hole.movingHazards || []).length; i++) {
        const h = hole.movingHazards[i]
        const pos = sampleMovingHazardPosition(h, _elapsedTime)
        if (obstacleWalls[hole.obstacles.length + i]) {
          obstacleWalls[hole.obstacles.length + i].position.set(pos.x, (h.size?.y || 1.1) / 2, pos.z)
        }
      }

      world.step(1 / 60, dt, 3)

      // Keep ball on ground (y clamp)
      if (ballBody.position.y < DEFAULT_BALL_RADIUS * 0.5) {
        ballBody.position.y = DEFAULT_BALL_RADIUS
        if (ballBody.velocity.y < 0) ballBody.velocity.y = 0
      }

      // Check cup
      const cup = hole.cup || { x: 0, z: 0, radius: 0.5 }
      const distToCup = Math.hypot(bx - cup.x, bz - cup.z)
      const speed = Math.hypot(ballBody.velocity.x, ballBody.velocity.z)
      if (distToCup <= (cup.radius || 0.5) && speed < 2.5) {
        ballBody.position.set(cup.x, DEFAULT_BALL_RADIUS, cup.z)
        ballBody.velocity.set(0, 0, 0)
        ballBody.angularVelocity.set(0, 0, 0)
        _settled = true
        _inHole = true
        return
      }

      // Check hazards
      for (const haz of hole.hazards || []) {
        if (haz.shape === 'box' && pointInBox(bx, bz, haz)) {
          _settled = true
          _hazardReset = true
          return
        }
      }

      // Check out of bounds
      if (bx < bounds.minX - 1 || bx > bounds.maxX + 1 || bz < bounds.minZ - 1 || bz > bounds.maxZ + 1) {
        _settled = true
        _hazardReset = true
        return
      }

      // Check sleep / settled
      if (ballBody.sleepState === CANNON.Body.SLEEPING || speed < STOP_SPEED) {
        _settled = true
      }

      // Safety timeout
      if (_elapsedTime > 12) {
        _settled = true
      }
    },

    getBallPosition() {
      return {
        x: ballBody.position.x,
        y: ballBody.position.y,
        z: ballBody.position.z,
      }
    },

    getBallVelocity() {
      return {
        x: ballBody.velocity.x,
        y: ballBody.velocity.y,
        z: ballBody.velocity.z,
      }
    },

    isSettled() { return _settled },
    isInHole()  { return _inHole },
    isHazard()  { return _hazardReset },
    getResetPosition() { return _resetPosition },

    dispose() {
      // cannon-es doesn't need explicit disposal but clear refs
      world.bodies.length = 0
    },
  }
}
