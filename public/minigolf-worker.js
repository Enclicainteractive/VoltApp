// MiniGolf Web Worker - Handles physics calculations and game logic
// This keeps the main thread free for rendering and UI

class Vec3 {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x
    this.y = y
    this.z = z
  }
  
  clone() {
    return new Vec3(this.x, this.y, this.z)
  }
  
  add(v) {
    this.x += v.x
    this.y += v.y
    this.z += v.z
    return this
  }
  
  multiply(scalar) {
    this.x *= scalar
    this.y *= scalar
    this.z *= scalar
    return this
  }
  
  length() {
    return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z)
  }
  
  distanceTo(v) {
    const dx = this.x - v.x
    const dy = this.y - v.y
    const dz = this.z - v.z
    return Math.sqrt(dx * dx + dy * dy + dz * dz)
  }
  
  normalize() {
    const len = this.length()
    if (len > 0) {
      this.x /= len
      this.y /= len
      this.z /= len
    }
    return this
  }
}

// Physics constants
const PHYSICS = {
  GRAVITY: 9.81,
  BALL_RADIUS: 0.02,
  CUP_RADIUS: 0.05,
  FRICTION_GRASS: 0.985,
  FRICTION_SAND: 0.92,
  FRICTION_ICE: 0.998,
  FRICTION_METAL: 0.95,
  BOUNCE_DAMPING: 0.7,
  WATER_DAMPING: 0.3,
  MIN_VELOCITY: 0.008,
  MAX_VELOCITY: 20,
  TIME_STEP: 1/60  // Optimized for worker
}

// Course definitions
const COURSES = {
  1: {
    name: "Garden Valley",
    par: 3,
    tee: { x: -8, y: 0, z: 0 },
    hole: { x: 8, y: 0, z: 0 },
    surfaces: [
      { 
        bounds: { x1: -10, z1: -2, x2: 10, z2: 2 },
        type: 'grass',
        height: 0
      }
    ],
    obstacles: [
      { type: 'ramp', x: 0, y: 0, z: 0, width: 2, height: 0.5, depth: 1 },
      { type: 'sand_trap', x: 4, y: 0, z: 0, radius: 1 }
    ],
    environment: 'outdoor'
  },
  2: {
    name: "Neon Circuit",
    par: 4,
    tee: { x: -12, y: 0, z: 0 },
    hole: { x: 12, y: 0, z: 0 },
    surfaces: [
      {
        bounds: { x1: -14, z1: -3, x2: 14, z2: 3 },
        type: 'metal',
        height: 0
      }
    ],
    obstacles: [
      { type: 'windmill', x: -4, y: 0, z: 0, blades: 4, speed: 2 },
      { type: 'moving_platform', x: 4, y: 0, z: 0, width: 2, depth: 0.5, speed: 1 }
    ],
    environment: 'cyberpunk'
  },
  3: {
    name: "Volcanic Valley",
    par: 5,
    tee: { x: -10, y: 0, z: -8 },
    hole: { x: 10, y: 0, z: 8 },
    surfaces: [
      {
        bounds: { x1: -12, z1: -10, x2: 12, z2: 10 },
        type: 'grass',
        height: 0
      }
    ],
    obstacles: [
      { type: 'lava', x: 0, y: 0, z: 0, width: 6, height: 0.1, depth: 3 },
      { type: 'rock_bridge', x: 0, y: 0.1, z: 0, width: 1, depth: 3 }
    ],
    environment: 'volcanic'
  }
}

// Game state
let gameState = {
  phase: 'lobby', // lobby, playing, hole_complete, game_complete
  currentCourse: 1,
  players: new Map(),
  balls: new Map(),
  currentTurn: null,
  turnOrder: [],
  votes: new Map(), // For course voting
  courseVotes: new Map(),
  lobbySettings: {
    maxPlayers: 4,
    courseSelection: 'vote', // vote, sequence, random
    allowSpectators: true
  }
}

let currentCourse = null
let obstacles = []
let powerups = []

// Initialize course
function setCourse(courseId) {
  currentCourse = COURSES[courseId]
  obstacles = currentCourse?.obstacles || []
  gameState.currentCourse = courseId
}

// Player management
function addPlayer(data) {
  const player = {
    id: data.id,
    username: data.username,
    color: data.color || 0xFFFFFF,
    isReady: false,
    score: 0,
    shots: 0,
    isSpectator: false,
    joinedAt: Date.now()
  }
  
  gameState.players.set(data.id, player)
  
  // Add ball if in playing state
  if (gameState.phase === 'playing' && currentCourse) {
    addBall(data.id, currentCourse.tee, player.color)
  }
  
  postMessage({
    type: 'playerAdded',
    player: player,
    gameState: getGameStateForClient()
  })
  
  broadcastPlayerList()
}

function removePlayer(playerId) {
  gameState.players.delete(playerId)
  gameState.balls.delete(playerId)
  gameState.votes.delete(playerId)
  
  // Remove from turn order
  const turnIndex = gameState.turnOrder.indexOf(playerId)
  if (turnIndex !== -1) {
    gameState.turnOrder.splice(turnIndex, 1)
  }
  
  // Update current turn if needed
  if (gameState.currentTurn === playerId && gameState.turnOrder.length > 0) {
    const nextIndex = turnIndex % gameState.turnOrder.length
    gameState.currentTurn = gameState.turnOrder[nextIndex]
  }
  
  postMessage({
    type: 'playerRemoved',
    playerId: playerId,
    gameState: getGameStateForClient()
  })
  
  broadcastPlayerList()
}

function setPlayerReady(data) {
  const player = gameState.players.get(data.playerId)
  if (player) {
    player.isReady = data.ready
    broadcastPlayerList()
    
    // Check if all players are ready to start
    if (gameState.phase === 'lobby') {
      checkStartConditions()
    }
  }
}

function setPlayerColor(data) {
  const player = gameState.players.get(data.playerId)
  if (player) {
    player.color = data.color
    
    // Update ball color if exists
    const ball = gameState.balls.get(data.playerId)
    if (ball) {
      ball.color = data.color
    }
    
    postMessage({
      type: 'playerColorChanged',
      playerId: data.playerId,
      color: data.color
    })
    
    broadcastPlayerList()
  }
}

// Ball management
function addBall(id, position, color) {
  gameState.balls.set(id, {
    id,
    position: new Vec3(position.x, position.y, position.z),
    velocity: new Vec3(0, 0, 0),
    color,
    onGround: true,
    inCup: false,
    lastCollision: 0,
    powerups: {}
  })
}

// Physics update
function updateBall(id, deltaTime) {
  const ball = gameState.balls.get(id)
  if (!ball || ball.inCup) return

  const dt = Math.min(deltaTime, PHYSICS.TIME_STEP)

  // Apply gravity
  if (!ball.onGround) {
    ball.velocity.y -= PHYSICS.GRAVITY * dt
  }

  // Apply velocity
  ball.position.add(ball.velocity.clone().multiply(dt))

  // Ground collision
  if (ball.position.y <= PHYSICS.BALL_RADIUS) {
    ball.position.y = PHYSICS.BALL_RADIUS
    if (ball.velocity.y < 0) {
      ball.velocity.y *= -PHYSICS.BOUNCE_DAMPING
      if (Math.abs(ball.velocity.y) < 0.1) {
        ball.velocity.y = 0
        ball.onGround = true
      }
    }
  } else {
    ball.onGround = false
  }

  // Apply friction
  if (ball.onGround && currentCourse) {
    const surface = getSurfaceAt(ball.position.x, ball.position.z)
    const friction = getSurfaceFriction(surface)
    ball.velocity.x *= friction
    ball.velocity.z *= friction
  } else {
    ball.velocity.x *= 0.998
    ball.velocity.z *= 0.998
  }

  // Wall collisions
  if (currentCourse) {
    currentCourse.surfaces?.forEach(surface => {
      const bounds = surface.bounds
      if (ball.position.x <= bounds.x1 + PHYSICS.BALL_RADIUS) {
        ball.position.x = bounds.x1 + PHYSICS.BALL_RADIUS
        ball.velocity.x *= -PHYSICS.BOUNCE_DAMPING
      }
      if (ball.position.x >= bounds.x2 - PHYSICS.BALL_RADIUS) {
        ball.position.x = bounds.x2 - PHYSICS.BALL_RADIUS
        ball.velocity.x *= -PHYSICS.BOUNCE_DAMPING
      }
      if (ball.position.z <= bounds.z1 + PHYSICS.BALL_RADIUS) {
        ball.position.z = bounds.z1 + PHYSICS.BALL_RADIUS
        ball.velocity.z *= -PHYSICS.BOUNCE_DAMPING
      }
      if (ball.position.z >= bounds.z2 - PHYSICS.BALL_RADIUS) {
        ball.position.z = bounds.z2 - PHYSICS.BALL_RADIUS
        ball.velocity.z *= -PHYSICS.BOUNCE_DAMPING
      }
    })
  }

  // Check for hole
  if (currentCourse && ball.onGround) {
    const holeDistance = ball.position.distanceTo(
      new Vec3(currentCourse.hole.x, 0, currentCourse.hole.z)
    )
    
    if (holeDistance <= PHYSICS.CUP_RADIUS && ball.velocity.length() < 2) {
      ball.inCup = true
      ball.velocity = new Vec3(0, 0, 0)
      ball.position = new Vec3(currentCourse.hole.x, -PHYSICS.BALL_RADIUS, currentCourse.hole.z)
      
      // Player completed hole
      const player = gameState.players.get(id)
      if (player) {
        player.score += player.shots
        postMessage({
          type: 'holeCompleted',
          playerId: id,
          shots: player.shots,
          par: currentCourse.par
        })
      }
    }
  }

  // Stop if moving too slowly
  if (ball.velocity.length() < PHYSICS.MIN_VELOCITY) {
    ball.velocity = new Vec3(0, 0, 0)
  }
}

function getSurfaceAt(x, z) {
  if (!currentCourse) return 'grass'
  
  for (const surface of currentCourse.surfaces || []) {
    const bounds = surface.bounds
    if (x >= bounds.x1 && x <= bounds.x2 && z >= bounds.z1 && z <= bounds.z2) {
      return surface.type
    }
  }
  return 'grass'
}

function getSurfaceFriction(surfaceType) {
  switch (surfaceType) {
    case 'ice': return PHYSICS.FRICTION_ICE
    case 'sand': return PHYSICS.FRICTION_SAND
    case 'metal': return PHYSICS.FRICTION_METAL
    default: return PHYSICS.FRICTION_GRASS
  }
}

// Game flow
function startGame() {
  gameState.phase = 'playing'
  gameState.turnOrder = Array.from(gameState.players.keys()).filter(id => 
    !gameState.players.get(id).isSpectator
  )
  gameState.currentTurn = gameState.turnOrder[0]
  
  // Initialize balls
  if (currentCourse) {
    gameState.players.forEach((player, id) => {
      if (!player.isSpectator) {
        addBall(id, currentCourse.tee, player.color)
        player.shots = 0
      }
    })
  }
  
  postMessage({
    type: 'gameStarted',
    gameState: getGameStateForClient()
  })
}

function checkStartConditions() {
  const activePlayers = Array.from(gameState.players.values()).filter(p => !p.isSpectator)
  const readyPlayers = activePlayers.filter(p => p.isReady)
  
  if (activePlayers.length >= 1 && readyPlayers.length === activePlayers.length) {
    // All players ready, determine course
    let courseId = gameState.currentCourse
    
    if (gameState.lobbySettings.courseSelection === 'vote') {
      // Count votes
      const voteCounts = new Map()
      gameState.courseVotes.forEach(vote => {
        voteCounts.set(vote, (voteCounts.get(vote) || 0) + 1)
      })
      
      // Find most voted course
      let maxVotes = 0
      voteCounts.forEach((count, course) => {
        if (count > maxVotes) {
          maxVotes = count
          courseId = course
        }
      })
    }
    
    setCourse(courseId)
    startGame()
  }
}

function shootBall(data) {
  const ball = gameState.balls.get(data.playerId)
  if (!ball || ball.velocity.length() > 0.1) return

  if (gameState.currentTurn !== data.playerId) return

  const maxPower = 10
  const actualPower = Math.min(data.power, maxPower)
  
  ball.velocity = data.direction.clone().multiply(actualPower)
  ball.onGround = false
  
  // Increment shot count
  const player = gameState.players.get(data.playerId)
  if (player) {
    player.shots++
  }
  
  postMessage({
    type: 'ballShot',
    playerId: data.playerId,
    power: actualPower,
    direction: data.direction
  })
  
  // Check if turn should advance
  setTimeout(() => {
    if (ball.velocity.length() < 0.1) {
      nextTurn()
    }
  }, 3000) // Wait for ball to stop
}

function nextTurn() {
  if (gameState.turnOrder.length === 0) return
  
  const currentIndex = gameState.turnOrder.indexOf(gameState.currentTurn)
  const nextIndex = (currentIndex + 1) % gameState.turnOrder.length
  gameState.currentTurn = gameState.turnOrder[nextIndex]
  
  postMessage({
    type: 'turnChanged',
    currentTurn: gameState.currentTurn,
    gameState: getGameStateForClient()
  })
}

function voteForCourse(data) {
  gameState.courseVotes.set(data.playerId, data.courseId)
  
  postMessage({
    type: 'courseVoted',
    playerId: data.playerId,
    courseId: data.courseId,
    votes: Object.fromEntries(gameState.courseVotes)
  })
}

function resetBall(data) {
  const ball = gameState.balls.get(data.playerId)
  if (ball && currentCourse) {
    ball.position = new Vec3(currentCourse.tee.x, PHYSICS.BALL_RADIUS, currentCourse.tee.z)
    ball.velocity = new Vec3(0, 0, 0)
    ball.onGround = true
    ball.inCup = false
  }
}

// Utility functions
function broadcastPlayerList() {
  postMessage({
    type: 'playerListUpdate',
    players: Object.fromEntries(gameState.players),
    gameState: getGameStateForClient()
  })
}

function getGameStateForClient() {
  return {
    phase: gameState.phase,
    currentCourse: gameState.currentCourse,
    currentTurn: gameState.currentTurn,
    players: Object.fromEntries(gameState.players),
    lobbySettings: gameState.lobbySettings
  }
}

// Update game
function update(data) {
  const deltaTime = Math.min(data.deltaTime, 0.033) // Cap at 30fps
  
  // Update physics for all balls
  gameState.balls.forEach((ball, id) => {
    updateBall(id, deltaTime)
  })
  
  // Send update to main thread
  const ballStates = {}
  gameState.balls.forEach((ball, id) => {
    ballStates[id] = {
      position: { x: ball.position.x, y: ball.position.y, z: ball.position.z },
      velocity: { x: ball.velocity.x, y: ball.velocity.y, z: ball.velocity.z },
      color: ball.color,
      onGround: ball.onGround,
      inCup: ball.inCup
    }
  })
  
  postMessage({
    type: 'physicsUpdate',
    balls: ballStates,
    gameState: getGameStateForClient()
  })
}

// Initialize
setCourse(1)

// Message handler
self.onmessage = function(e) {
  const { type, data } = e.data
  
  try {
    switch (type) {
      case 'addPlayer':
        addPlayer(data)
        break
      case 'removePlayer':
        removePlayer(data.playerId)
        break
      case 'setPlayerReady':
        setPlayerReady(data)
        break
      case 'setPlayerColor':
        setPlayerColor(data)
        break
      case 'shootBall':
        shootBall(data)
        break
      case 'resetBall':
        resetBall(data)
        break
      case 'voteForCourse':
        voteForCourse(data)
        break
      case 'update':
        update(data)
        break
      case 'setCourse':
        setCourse(data.courseId)
        break
      default:
        console.warn('Unknown message type:', type)
    }
  } catch (error) {
    postMessage({
      type: 'error',
      error: error.message,
      stack: error.stack
    })
  }
}