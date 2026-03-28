const SCALE = 3
const SECRET_ROOM_SIZE = 6
const PROCEDURAL_BASE_SIZE = 28
const PROCEDURAL_ROOM_COUNT = 10
const PROCEDURAL_ID = 'rift-procedural'

const createPickups = (entries) => entries.map(([id, type, x, y]) => ({ id, type, x, y }))

const createMap = ({ id, name, subtitle, texturePackId, palette, grid, spawnPoints, pickups, doors, secretAreas }) => ({
  id,
  name,
  subtitle,
  texturePackId,
  palette,
  grid,
  spawnPoints,
  pickups,
  doors,
  secretAreas
})

const toScaledPoint = (point) => ({
  ...point,
  x: point.x * SCALE,
  y: point.y * SCALE
})

const createMutableGrid = (rows) => rows.map((row) => row.split(''))
const makeRng = (seed) => {
  let value = (seed >>> 0) || 1
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0
    return value / 4294967296
  }
}

const addPillars = (grid) => {
  for (let y = 2; y < grid.length - 2; y += 1) {
    for (let x = 2; x < grid[0].length - 2; x += 1) {
      if (grid[y][x] !== '.') continue
      const isOpenRoom = (
        grid[y][x - 1] === '.'
        && grid[y][x + 1] === '.'
        && grid[y - 1][x] === '.'
        && grid[y + 1][x] === '.'
      )
      if (!isOpenRoom) continue
      if ((x + y) % 11 === 0 || (x * y) % 17 === 0) {
        grid[y][x] = '#'
      }
    }
  }
}

const addSecretRooms = (grid, mapId) => {
  const placements = [
    { name: 'north-west', doorX: 4, doorY: 8, roomLeft: 1, roomTop: 1, openX: 4, openY: 7 },
    { name: 'south-east', doorX: grid[0].length - 5, doorY: grid.length - 9, roomLeft: grid[0].length - 1 - SECRET_ROOM_SIZE, roomTop: grid.length - 1 - SECRET_ROOM_SIZE, openX: grid[0].length - 5, openY: grid.length - 8 }
  ]

  const doors = []
  const secretAreas = []
  placements.forEach((placement, index) => {
    const left = Math.max(1, placement.roomLeft)
    const top = Math.max(1, placement.roomTop)
    for (let y = top; y < top + SECRET_ROOM_SIZE; y += 1) {
      for (let x = left; x < left + SECRET_ROOM_SIZE; x += 1) {
        const isEdge = x === left || y === top || x === left + SECRET_ROOM_SIZE - 1 || y === top + SECRET_ROOM_SIZE - 1
        grid[y][x] = isEdge ? '#' : '.'
      }
    }
    grid[placement.openY][placement.openX] = '.'
    grid[placement.doorY][placement.doorX] = 'D'
    doors.push({
      id: `${mapId}-door-${index + 1}`,
      x: placement.doorX + 0.5,
      y: placement.doorY + 0.5,
      open: false
    })
    secretAreas.push({
      id: `${mapId}-secret-${index + 1}`,
      name: placement.name,
      x: left + 1,
      y: top + 1,
      width: SECRET_ROOM_SIZE - 2,
      height: SECRET_ROOM_SIZE - 2
    })
  })
  return { doors, secretAreas }
}

const expandGrid = (grid, mapId) => {
  const expanded = []
  for (const row of grid) {
    const scaledRow = row.split('').flatMap((tile) => Array(SCALE).fill(tile)).join('')
    for (let i = 0; i < SCALE; i += 1) expanded.push(scaledRow)
  }
  const mutable = createMutableGrid(expanded)
  addPillars(mutable)
  const { doors, secretAreas } = addSecretRooms(mutable, mapId)
  return {
    grid: mutable.map((row) => row.join('')),
    doors,
    secretAreas
  }
}

const duplicatePickups = (pickups, mapId) => {
  const scaled = pickups.map((pickup) => ({
    ...pickup,
    id: `${pickup.id}-scaled`,
    x: pickup.x * SCALE,
    y: pickup.y * SCALE
  }))
  const extras = pickups.map((pickup, index) => ({
    id: `${mapId}-bonus-${index + 1}`,
    type: pickup.type,
    x: pickup.x * SCALE + (index % 2 === 0 ? 2 : -2),
    y: pickup.y * SCALE + (index % 3 === 0 ? -2 : 2)
  }))
  return [...scaled, ...extras]
}

const buildLargeMap = ({ id, name, subtitle, texturePackId, palette, grid, spawnPoints, pickups }) => {
  const { grid: expandedGrid, doors, secretAreas } = expandGrid(grid, id)
  return createMap({
    id,
    name,
    subtitle: `${subtitle} Doors hide side caches and the footprint is expanded for longer duels.`,
    texturePackId,
    palette,
    grid: expandedGrid,
    spawnPoints: spawnPoints.map(toScaledPoint),
    pickups: duplicatePickups(pickups, id),
    doors,
    secretAreas
  })
}

const carveRoom = (grid, left, top, width, height) => {
  for (let y = top; y < top + height; y += 1) {
    for (let x = left; x < left + width; x += 1) {
      if (y <= 0 || y >= grid.length - 1 || x <= 0 || x >= grid[0].length - 1) continue
      grid[y][x] = '.'
    }
  }
}

const carveCorridor = (grid, from, to, rng) => {
  let x = from.x
  let y = from.y
  const horizontalFirst = rng() > 0.5
  const carveStep = (nextX, nextY) => {
    x = nextX
    y = nextY
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const cellX = x + dx
        const cellY = y + dy
        if (cellY <= 0 || cellY >= grid.length - 1 || cellX <= 0 || cellX >= grid[0].length - 1) continue
        grid[cellY][cellX] = '.'
      }
    }
  }
  const moveHorizontal = () => {
    while (x !== to.x) carveStep(x + Math.sign(to.x - x), y)
  }
  const moveVertical = () => {
    while (y !== to.y) carveStep(x, y + Math.sign(to.y - y))
  }
  if (horizontalFirst) {
    moveHorizontal()
    moveVertical()
  } else {
    moveVertical()
    moveHorizontal()
  }
}

const createProceduralBaseMap = (seed = 1) => {
  const rng = makeRng(seed)
  const grid = Array.from({ length: PROCEDURAL_BASE_SIZE }, () => Array(PROCEDURAL_BASE_SIZE).fill('#'))
  const rooms = []
  for (let index = 0; index < PROCEDURAL_ROOM_COUNT; index += 1) {
    const width = 4 + Math.floor(rng() * 5)
    const height = 4 + Math.floor(rng() * 5)
    const left = 1 + Math.floor(rng() * (PROCEDURAL_BASE_SIZE - width - 2))
    const top = 1 + Math.floor(rng() * (PROCEDURAL_BASE_SIZE - height - 2))
    carveRoom(grid, left, top, width, height)
    rooms.push({
      left,
      top,
      width,
      height,
      center: {
        x: Math.floor(left + width / 2),
        y: Math.floor(top + height / 2)
      }
    })
  }
  rooms.sort((a, b) => a.center.x - b.center.x)
  for (let index = 1; index < rooms.length; index += 1) {
    carveCorridor(grid, rooms[index - 1].center, rooms[index].center, rng)
  }
  for (let index = 0; index < rooms.length; index += 1) {
    const anchor = rooms[index]
    const other = rooms[Math.floor(rng() * rooms.length)]
    if (anchor !== other) carveCorridor(grid, anchor.center, other.center, rng)
  }

  const spawnPoints = rooms.slice(0, 6).map((room, index) => ({
    x: room.center.x + 0.5,
    y: room.center.y + 0.5,
    angle: (index / 6) * Math.PI * 2
  }))
  const pickupTypes = ['health', 'ammo', 'armor']
  const pickups = rooms.flatMap((room, index) => {
    const offsets = [
      { x: 0, y: 0 },
      { x: room.width > 5 ? 1 : -1, y: 0 }
    ]
    return offsets.map((offset, offsetIndex) => ([
      `proc-${index + 1}-${offsetIndex + 1}`,
      pickupTypes[(index + offsetIndex) % pickupTypes.length],
      room.center.x + 0.5 + offset.x,
      room.center.y + 0.5 + offset.y
    ]))
  })

  return {
    id: PROCEDURAL_ID,
    name: `Shifting Sector ${String(seed).slice(-3)}`,
    subtitle: 'Shared seeded labyrinth with long routes and no dead-end spawn cages.',
    texturePackId: 'archive-stacks',
    palette: { ceiling: '#101522', floor: '#1a1f2a', wall: '#475569', wallAccent: '#94a3b8', trim: '#fbbf24', fog: '#04070d' },
    grid: grid.map((row) => row.join('')),
    spawnPoints,
    pickups: createPickups(pickups)
  }
}

const BASE_MAPS = [
  {
    id: 'basalt-vault',
    name: 'Basalt Vault',
    subtitle: 'Tight volcanic loops with brutal center control.',
    texturePackId: 'basalt-industrial',
    palette: { ceiling: '#140c26', floor: '#241c14', wall: '#5f4d3d', wallAccent: '#8d7358', trim: '#23d3ee', fog: '#07060d' },
    grid: [
      '################',
      '#......#.......#',
      '#.####.#.###.#.#',
      '#.#....#...#.#.#',
      '#.#.######.#.#.#',
      '#.#........#.#.#',
      '#.#.###..###.#.#',
      '#...#......#...#',
      '###.#.####.#.###',
      '#...#.#..#.#...#',
      '#.###.#..#.###.#',
      '#.#...#..#...#.#',
      '#.#.###..###.#.#',
      '#.#..........#.#',
      '#......##......#',
      '################'
    ],
    spawnPoints: [
      { x: 1.5, y: 1.5, angle: 0.1 },
      { x: 14.5, y: 1.5, angle: Math.PI * 0.5 },
      { x: 1.5, y: 14.5, angle: -0.4 },
      { x: 14.5, y: 14.5, angle: Math.PI }
    ],
    pickups: createPickups([
      ['bv-h1', 'health', 7.5, 7.5],
      ['bv-h2', 'health', 5.5, 13.5],
      ['bv-a1', 'ammo', 3.5, 7.5],
      ['bv-a2', 'ammo', 11.5, 7.5],
      ['bv-r1', 'armor', 7.5, 3.5],
      ['bv-r2', 'armor', 7.5, 11.5]
    ])
  },
  {
    id: 'oxide-corridor',
    name: 'Oxide Corridor',
    subtitle: 'Long lanes, hinge rooms, and crossfire balconies.',
    texturePackId: 'rust-yard',
    palette: { ceiling: '#10151f', floor: '#271c19', wall: '#7a4936', wallAccent: '#b87355', trim: '#f97316', fog: '#08090d' },
    grid: [
      '################',
      '#......#.......#',
      '#.####.#.#####.#',
      '#.#....#.....#.#',
      '#.#.########.#.#',
      '#.#..........#.#',
      '#.##########.#.#',
      '#......##....#.#',
      '######.##.####.#',
      '#......##......#',
      '#.############.#',
      '#.#..........#.#',
      '#.#.########.#.#',
      '#.#........#.#.#',
      '#...######...#.#',
      '################'
    ],
    spawnPoints: [
      { x: 1.5, y: 1.5, angle: 0 },
      { x: 13.5, y: 1.5, angle: Math.PI * 0.5 },
      { x: 1.5, y: 13.5, angle: -0.25 },
      { x: 12.5, y: 13.5, angle: Math.PI }
    ],
    pickups: createPickups([
      ['oc-h1', 'health', 7.5, 5.5],
      ['oc-h2', 'health', 10.5, 9.5],
      ['oc-a1', 'ammo', 5.5, 9.5],
      ['oc-a2', 'ammo', 12.5, 13.5],
      ['oc-r1', 'armor', 7.5, 1.5],
      ['oc-r2', 'armor', 2.5, 13.5]
    ])
  },
  {
    id: 'neon-drains',
    name: 'Neon Drains',
    subtitle: 'Wet tunnels and clipped flanks under toxic glow.',
    texturePackId: 'neon-sewer',
    palette: { ceiling: '#0a1120', floor: '#11231c', wall: '#24445e', wallAccent: '#45b1c9', trim: '#34d399', fog: '#040a10' },
    grid: [
      '################',
      '#......#...#...#',
      '#.####.#.#.#.#.#',
      '#.#....#.#...#.#',
      '#.#.####.#####.#',
      '#.#.#........#.#',
      '#...#.######.#.#',
      '###.#.#....#.#.#',
      '#...#.#.##.#...#',
      '#.###.#.##.###.#',
      '#.#...#....#.#.#',
      '#.#.########.#.#',
      '#.#..........#.#',
      '#.######.#####.#',
      '#..............#',
      '################'
    ],
    spawnPoints: [
      { x: 1.5, y: 1.5, angle: 0.2 },
      { x: 12.5, y: 1.5, angle: Math.PI * 0.5 },
      { x: 1.5, y: 14.5, angle: -0.2 },
      { x: 13.5, y: 14.5, angle: Math.PI }
    ],
    pickups: createPickups([
      ['nd-h1', 'health', 6.5, 5.5],
      ['nd-h2', 'health', 11.5, 12.5],
      ['nd-a1', 'ammo', 3.5, 8.5],
      ['nd-a2', 'ammo', 13.5, 8.5],
      ['nd-r1', 'armor', 8.5, 3.5],
      ['nd-r2', 'armor', 8.5, 13.5]
    ])
  },
  {
    id: 'cinder-foundry',
    name: 'Cinder Foundry',
    subtitle: 'Hot center forge with punishing wraparound routes.',
    texturePackId: 'forge-cinder',
    palette: { ceiling: '#190d08', floor: '#2a2119', wall: '#5b3a2d', wallAccent: '#d47b3e', trim: '#fbbf24', fog: '#090403' },
    grid: [
      '################',
      '#...#......#...#',
      '#.#.#.####.#.#.#',
      '#.#.#.#..#.#.#.#',
      '#.#...#..#...#.#',
      '#.#####..#####.#',
      '#......##......#',
      '######.##.######',
      '#......##......#',
      '#.#####..#####.#',
      '#.#...#..#...#.#',
      '#.#.#.#..#.#.#.#',
      '#.#.#.####.#.#.#',
      '#...#......#...#',
      '#..............#',
      '################'
    ],
    spawnPoints: [
      { x: 1.5, y: 1.5, angle: 0 },
      { x: 13.5, y: 1.5, angle: Math.PI * 0.5 },
      { x: 1.5, y: 13.5, angle: -0.5 },
      { x: 13.5, y: 13.5, angle: Math.PI }
    ],
    pickups: createPickups([
      ['cf-h1', 'health', 7.5, 6.5],
      ['cf-h2', 'health', 7.5, 8.5],
      ['cf-a1', 'ammo', 4.5, 4.5],
      ['cf-a2', 'ammo', 10.5, 10.5],
      ['cf-r1', 'armor', 4.5, 10.5],
      ['cf-r2', 'armor', 10.5, 4.5]
    ])
  },
  {
    id: 'glass-harbor',
    name: 'Glass Harbor',
    subtitle: 'Broad sightlines with mirrored warehouse cuts.',
    texturePackId: 'harbor-concrete',
    palette: { ceiling: '#0d1823', floor: '#1b2732', wall: '#406173', wallAccent: '#8bb7c9', trim: '#93c5fd', fog: '#071018' },
    grid: [
      '################',
      '#......##......#',
      '#.####.##.####.#',
      '#.#..........#.#',
      '#.#.########.#.#',
      '#.#.#......#.#.#',
      '#...#.####.#...#',
      '###.#.#..#.#.###',
      '###.#.#..#.#.###',
      '#...#.####.#...#',
      '#.#.#......#.#.#',
      '#.#.########.#.#',
      '#.#..........#.#',
      '#.####.##.####.#',
      '#......##......#',
      '################'
    ],
    spawnPoints: [
      { x: 1.5, y: 1.5, angle: 0.25 },
      { x: 12.5, y: 1.5, angle: Math.PI * 0.45 },
      { x: 1.5, y: 14.5, angle: -0.25 },
      { x: 12.5, y: 14.5, angle: Math.PI }
    ],
    pickups: createPickups([
      ['gh-h1', 'health', 7.5, 3.5],
      ['gh-h2', 'health', 7.5, 12.5],
      ['gh-a1', 'ammo', 3.5, 7.5],
      ['gh-a2', 'ammo', 11.5, 7.5],
      ['gh-r1', 'armor', 5.5, 5.5],
      ['gh-r2', 'armor', 9.5, 9.5]
    ])
  },
  {
    id: 'moss-catacomb',
    name: 'Moss Catacomb',
    subtitle: 'Low visibility turns inside a green-stained crypt.',
    texturePackId: 'moss-catacomb',
    palette: { ceiling: '#0b120d', floor: '#1c2419', wall: '#3e4a32', wallAccent: '#8fa673', trim: '#4ade80', fog: '#050805' },
    grid: [
      '################',
      '#......#...#...#',
      '#.####.#.#.#.#.#',
      '#....#...#...#.#',
      '####.#########.#',
      '#....#.......#.#',
      '#.####.#####.#.#',
      '#.#....#...#...#',
      '#.#.####.#.#####',
      '#.#......#.....#',
      '#.###########..#',
      '#......#.......#',
      '#.####.#.#####.#',
      '#.#....#.....#.#',
      '#...########...#',
      '################'
    ],
    spawnPoints: [
      { x: 1.5, y: 1.5, angle: 0.1 },
      { x: 12.5, y: 1.5, angle: 1.2 },
      { x: 1.5, y: 13.5, angle: -0.2 },
      { x: 12.5, y: 13.5, angle: Math.PI }
    ],
    pickups: createPickups([
      ['mc-h1', 'health', 6.5, 5.5],
      ['mc-h2', 'health', 10.5, 11.5],
      ['mc-a1', 'ammo', 4.5, 9.5],
      ['mc-a2', 'ammo', 12.5, 7.5],
      ['mc-r1', 'armor', 8.5, 3.5],
      ['mc-r2', 'armor', 8.5, 13.5]
    ])
  },
  {
    id: 'reactor-spine',
    name: 'Reactor Spine',
    subtitle: 'Linear reactor halls with sharp center pivots.',
    texturePackId: 'reactor-core',
    palette: { ceiling: '#0c1018', floor: '#1d222e', wall: '#4a5367', wallAccent: '#7cd7ff', trim: '#38bdf8', fog: '#06070b' },
    grid: [
      '################',
      '#......#.......#',
      '#.####.#.#####.#',
      '#.#....#.....#.#',
      '#.#.########.#.#',
      '#.#.#......#.#.#',
      '#.#.#.####.#.#.#',
      '#...#.#..#.#...#',
      '###.#.#..#.#.###',
      '#...#.#..#.#...#',
      '#.#.#.####.#.#.#',
      '#.#.#......#.#.#',
      '#.#.########.#.#',
      '#.#..........#.#',
      '#...########...#',
      '################'
    ],
    spawnPoints: [
      { x: 1.5, y: 1.5, angle: 0 },
      { x: 13.5, y: 1.5, angle: 1.57 },
      { x: 1.5, y: 13.5, angle: -0.5 },
      { x: 13.5, y: 13.5, angle: Math.PI }
    ],
    pickups: createPickups([
      ['rs-h1', 'health', 7.5, 7.5],
      ['rs-h2', 'health', 3.5, 13.5],
      ['rs-a1', 'ammo', 3.5, 7.5],
      ['rs-a2', 'ammo', 11.5, 7.5],
      ['rs-r1', 'armor', 7.5, 3.5],
      ['rs-r2', 'armor', 7.5, 11.5]
    ])
  },
  {
    id: 'violet-chasm',
    name: 'Violet Chasm',
    subtitle: 'Curved lanes and dangerous open choke bridges.',
    texturePackId: 'violet-stone',
    palette: { ceiling: '#12091b', floor: '#22172e', wall: '#5c4472', wallAccent: '#c084fc', trim: '#e879f9', fog: '#090510' },
    grid: [
      '################',
      '#......#......##',
      '#.####.#.####..#',
      '#.#....#....#..#',
      '#.#.######.#.###',
      '#.#......#.#...#',
      '#.######.#.###.#',
      '#......#.#.....#',
      '######.#.######.',
      '#......#.#.....#',
      '#.######.#.###.#',
      '#.#......#.#...#',
      '#.#.######.#.###',
      '#.#..........#.#',
      '#...########...#',
      '################'
    ].map((row) => row.slice(0, 16).padEnd(16, '#')),
    spawnPoints: [
      { x: 1.5, y: 1.5, angle: 0.15 },
      { x: 12.5, y: 2.5, angle: Math.PI * 0.6 },
      { x: 1.5, y: 13.5, angle: -0.3 },
      { x: 12.5, y: 13.5, angle: Math.PI }
    ],
    pickups: createPickups([
      ['vc-h1', 'health', 7.5, 5.5],
      ['vc-h2', 'health', 7.5, 9.5],
      ['vc-a1', 'ammo', 3.5, 7.5],
      ['vc-a2', 'ammo', 11.5, 7.5],
      ['vc-r1', 'armor', 5.5, 3.5],
      ['vc-r2', 'armor', 9.5, 11.5]
    ])
  },
  {
    id: 'rust-temple',
    name: 'Rust Temple',
    subtitle: 'Compact shrine combat with layered ring control.',
    texturePackId: 'rust-yard',
    palette: { ceiling: '#150d0b', floor: '#261d17', wall: '#6d4934', wallAccent: '#d09560', trim: '#fb923c', fog: '#0a0605' },
    grid: [
      '################',
      '#......##......#',
      '#.####.##.####.#',
      '#.#..........#.#',
      '#.#.########.#.#',
      '#...#......#...#',
      '###.#.####.#.###',
      '#...#.#..#.#...#',
      '#...#.#..#.#...#',
      '###.#.####.#.###',
      '#...#......#...#',
      '#.#.########.#.#',
      '#.#..........#.#',
      '#.####.##.####.#',
      '#......##......#',
      '################'
    ],
    spawnPoints: [
      { x: 1.5, y: 1.5, angle: 0.1 },
      { x: 13.5, y: 1.5, angle: 1.2 },
      { x: 1.5, y: 13.5, angle: -0.4 },
      { x: 13.5, y: 13.5, angle: Math.PI }
    ],
    pickups: createPickups([
      ['rt-h1', 'health', 7.5, 4.5],
      ['rt-h2', 'health', 7.5, 10.5],
      ['rt-a1', 'ammo', 4.5, 7.5],
      ['rt-a2', 'ammo', 10.5, 7.5],
      ['rt-r1', 'armor', 4.5, 4.5],
      ['rt-r2', 'armor', 10.5, 10.5]
    ])
  },
  {
    id: 'ice-array',
    name: 'Ice Array',
    subtitle: 'Clean frozen corridors and brittle diagonal peeks.',
    texturePackId: 'ice-array',
    palette: { ceiling: '#0a1520', floor: '#1a2636', wall: '#567791', wallAccent: '#d7f3ff', trim: '#67e8f9', fog: '#050b12' },
    grid: [
      '################',
      '#......#......##',
      '#.####.#.####..#',
      '#.#....#....#..#',
      '#.#.######.#.###',
      '#...#....#.#...#',
      '###.#.##.#.###.#',
      '#...#....#.....#',
      '#.######.######.',
      '#.....#....#...#',
      '#.###.#.##.#.###',
      '#...#.#....#...#',
      '###.#.######.#.#',
      '#..#....#....#.#',
      '#..####.#.####.#',
      '################'
    ].map((row) => row.slice(0, 16).padEnd(16, '#')),
    spawnPoints: [
      { x: 1.5, y: 1.5, angle: 0.1 },
      { x: 12.5, y: 1.5, angle: 1.4 },
      { x: 1.5, y: 13.5, angle: -0.1 },
      { x: 12.5, y: 13.5, angle: Math.PI }
    ],
    pickups: createPickups([
      ['ia-h1', 'health', 6.5, 5.5],
      ['ia-h2', 'health', 9.5, 10.5],
      ['ia-a1', 'ammo', 3.5, 8.5],
      ['ia-a2', 'ammo', 12.5, 8.5],
      ['ia-r1', 'armor', 8.5, 3.5],
      ['ia-r2', 'armor', 8.5, 13.5]
    ])
  },
  {
    id: 'signal-breaker',
    name: 'Signal Breaker',
    subtitle: 'Broadcast tower internals with asymmetrical lanes.',
    texturePackId: 'reactor-core',
    palette: { ceiling: '#111319', floor: '#23262e', wall: '#4f5968', wallAccent: '#fde68a', trim: '#facc15', fog: '#06070a' },
    grid: [
      '################',
      '#......#.......#',
      '#.####.#.#####.#',
      '#.#..........#.#',
      '#.#.########.#.#',
      '#...#......#...#',
      '###.#.####.###.#',
      '#...#.#..#.....#',
      '#.###.#..#.###.#',
      '#.....#..#.#...#',
      '#.###.####.#.###',
      '#...#......#...#',
      '#.#.########.#.#',
      '#.#..........#.#',
      '#...########...#',
      '################'
    ],
    spawnPoints: [
      { x: 1.5, y: 1.5, angle: 0.1 },
      { x: 13.5, y: 1.5, angle: 1.2 },
      { x: 1.5, y: 13.5, angle: -0.3 },
      { x: 13.5, y: 13.5, angle: Math.PI }
    ],
    pickups: createPickups([
      ['sb-h1', 'health', 7.5, 4.5],
      ['sb-h2', 'health', 5.5, 11.5],
      ['sb-a1', 'ammo', 3.5, 7.5],
      ['sb-a2', 'ammo', 11.5, 7.5],
      ['sb-r1', 'armor', 8.5, 8.5],
      ['sb-r2', 'armor', 13.5, 5.5]
    ])
  },
  {
    id: 'archive-zero',
    name: 'Archive Zero',
    subtitle: 'Data stacks, sharp corners, and central vault crashes.',
    texturePackId: 'archive-stacks',
    palette: { ceiling: '#0e1220', floor: '#1d2231', wall: '#3f4c63', wallAccent: '#8ab4ff', trim: '#a78bfa', fog: '#05070c' },
    grid: [
      '################',
      '#......#.......#',
      '#.####.#.#####.#',
      '#.#....#.....#.#',
      '#.#.######.#.#.#',
      '#...#....#.#...#',
      '###.#.##.#.###.#',
      '#...#....#.....#',
      '#.######.######.',
      '#.....#....#...#',
      '#.###.#.##.#.###',
      '#...#.#....#...#',
      '###.#.######.#.#',
      '#..#....#....#.#',
      '#..####.#.####.#',
      '################'
    ].map((row) => row.slice(0, 16).padEnd(16, '#')),
    spawnPoints: [
      { x: 1.5, y: 1.5, angle: 0 },
      { x: 13.5, y: 1.5, angle: 1.3 },
      { x: 1.5, y: 13.5, angle: -0.2 },
      { x: 13.5, y: 13.5, angle: Math.PI }
    ],
    pickups: createPickups([
      ['az-h1', 'health', 6.5, 5.5],
      ['az-h2', 'health', 10.5, 10.5],
      ['az-a1', 'ammo', 3.5, 8.5],
      ['az-a2', 'ammo', 12.5, 8.5],
      ['az-r1', 'armor', 8.5, 3.5],
      ['az-r2', 'armor', 8.5, 13.5]
    ])
  }
]

const STATIC_RETRO_RIFT_MAPS = BASE_MAPS.map(buildLargeMap)
const PROCEDURAL_MAP_META = {
  id: PROCEDURAL_ID,
  name: 'Shifting Sector',
  subtitle: 'Shared seeded labyrinth with long routes and no dead-end spawn cages.',
  texturePackId: 'archive-stacks',
  palette: { ceiling: '#101522', floor: '#1a1f2a', wall: '#475569', wallAccent: '#94a3b8', trim: '#fbbf24', fog: '#04070d' },
  grid: [],
  spawnPoints: [],
  pickups: [],
  doors: [],
  secretAreas: []
}

export const RETRO_RIFT_MAPS = [...STATIC_RETRO_RIFT_MAPS, PROCEDURAL_MAP_META]

export const getRetroRiftMap = (mapId, seed = 1) => {
  if (mapId === PROCEDURAL_ID) return buildLargeMap(createProceduralBaseMap(seed))
  return STATIC_RETRO_RIFT_MAPS.find((map) => map.id === mapId) || STATIC_RETRO_RIFT_MAPS[0]
}
