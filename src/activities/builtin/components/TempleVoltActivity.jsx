import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { shouldIgnoreActivityHotkey } from './shared/hotkeys'
import GameCanvasShell from './shared/GameCanvasShell'

const COLS = 80
const ROWS = 30
const CHAR_W = 16
const CHAR_H = 24
const WIDTH = COLS * CHAR_W
const HEIGHT = ROWS * CHAR_H
const FONT_SIZE = 22
const FONT_STACK = '"Perfect DOS VGA 437", "Px437 IBM VGA 8x16", "IBM VGA 8x16", "Courier New", monospace'
const CURSOR_BLINK_MS = 460
const CLOCK_TICK_MS = 180
const WALLPAPER_TICK_STEP = 1
const MAX_TERMINAL_LINES = 500
const MAX_LOG_LINES = 200
const MAX_EDITOR_LINES = 120
const MAX_WINDOWS = 12
const DESKTOP_BG = 1
const MENU_BG = 7
const MENU_FG = 0
const STATUS_BG = 8
const STATUS_FG = 15
const TITLE_ACTIVE_BG = 15
const TITLE_ACTIVE_FG = 1
const TITLE_INACTIVE_BG = 8
const TITLE_INACTIVE_FG = 15

const WINDOW_TERM = 'term'
const WINDOW_FILES = 'files'
const WINDOW_HELP = 'help'
const WINDOW_ABOUT = 'about'
const WINDOW_PALETTE = 'palette'
const WINDOW_EDITOR = 'editor'
const WINDOW_TASKS = 'tasks'
const WINDOW_SYSTEM = 'system'
const WINDOW_SNAKE = 'snake'
const WINDOW_LOG = 'log'
const WINDOW_ART = 'art'
const WINDOW_CLOCK = 'clock'

const BOX = {
  tl: '\u250c',
  tr: '\u2510',
  bl: '\u2514',
  br: '\u2518',
  h: '\u2500',
  v: '\u2502',
  t: '\u252c',
  b: '\u2534',
  l: '\u251c',
  r: '\u2524',
  x: '\u253c',
}

const SHADE = [' ', '\u2591', '\u2592', '\u2593', '\u2588']

const TEMPLE_16 = [
  '#000000',
  '#0000aa',
  '#00aa00',
  '#00aaaa',
  '#aa0000',
  '#aa00aa',
  '#aa5500',
  '#aaaaaa',
  '#555555',
  '#5555ff',
  '#55ff55',
  '#55ffff',
  '#ff5555',
  '#ff55ff',
  '#ffff55',
  '#ffffff',
]

const ALT_16 = [
  '#080808',
  '#1f4fff',
  '#00b86f',
  '#00c2d1',
  '#d44545',
  '#b05cff',
  '#d9922e',
  '#d8d8d8',
  '#666666',
  '#7ea6ff',
  '#6cff9d',
  '#81ecf8',
  '#ff8d8d',
  '#d2a4ff',
  '#ffe58d',
  '#ffffff',
]

const SOLAR_16 = [
  '#120a04',
  '#3249c7',
  '#3d9d5d',
  '#47a5b8',
  '#c74d2b',
  '#8d5bd6',
  '#c78732',
  '#d8c6a8',
  '#5a4f41',
  '#6d87ff',
  '#79db8f',
  '#87d9e2',
  '#ff8863',
  '#bf95ff',
  '#ffe082',
  '#fff4df',
]

const PALETTES = [
  { name: 'TempleVolt Classic', colors: TEMPLE_16 },
  { name: 'Night Bus', colors: ALT_16 },
  { name: 'Sunset Disk', colors: SOLAR_16 },
]

const DIRECTORY_TREE = {
  '/': {
    type: 'dir',
    children: {
      DEMO: {
        type: 'dir',
        children: {
          'README.HC': {
            type: 'file',
            lines: [
              'TempleVolt parody shell.',
              'TempleOS-inspired presentation only.',
              'Not a real emulator or binary-compatible runtime.',
              'Use HELP for available shell commands.',
            ],
          },
          'PALETTE.HC': {
            type: 'file',
            lines: [
              'Color(WHITE, BLUE);',
              'Cls;',
              'Print("TempleVolt palette sampler.");',
            ],
          },
          'SERMON.TXT': {
            type: 'file',
            lines: [
              'Blessed are the pixels, for they blink on schedule.',
              'Blessed are the windows, for they drag in text mode.',
              'Blessed are the users, for they type with focus lock.',
            ],
          },
        },
      },
      DOC: {
        type: 'dir',
        children: {
          'COMMANDS.TXT': {
            type: 'file',
            lines: [
              'HELP',
              'DIR / TREE / CAT / TYPE / OPEN / CLOSE',
              'PALETTE / COLOR fg bg / THEME',
              'FOCUS NEXT / KILL / WINDOWS / VER / REBOOT',
            ],
          },
          'DISCLAIMER.TXT': {
            type: 'file',
            lines: [
              'THIS IS A PARODY ACTIVITY.',
              'IT IS TEMPLEOS-INSPIRED, NOT TEMPLEOS.',
              'NO REAL X86 EMULATION OCCURS HERE.',
            ],
          },
        },
      },
      SYS: {
        type: 'dir',
        children: {
          'AUTOEXEC.HC': {
            type: 'file',
            lines: [
              'Cd("::/Demo");',
              'Load("PARODY");',
              'Print("TempleVolt boot sequence complete.");',
            ],
          },
          'ABOUT.DD': {
            type: 'file',
            lines: [
              'TempleVolt v0.99',
              'Canvas text-mode parody workstation',
              'Windowed shell, file browser, editor, palette lab',
            ],
          },
        },
      },
      ART: {
        type: 'dir',
        children: {
          'FLAG.TXT': {
            type: 'file',
            lines: [
              '################',
              '#..............#',
              '#..TEMPLEVOLT..#',
              '#..............#',
              '################',
            ],
          },
        },
      },
    },
  },
}

const APP_TITLES = {
  [WINDOW_TERM]: 'Command',
  [WINDOW_FILES]: 'Files',
  [WINDOW_HELP]: 'Help',
  [WINDOW_ABOUT]: 'About',
  [WINDOW_PALETTE]: 'Palette',
  [WINDOW_EDITOR]: 'Editor',
  [WINDOW_TASKS]: 'Tasks',
  [WINDOW_SYSTEM]: 'System',
  [WINDOW_SNAKE]: 'Snake',
  [WINDOW_LOG]: 'Log',
  [WINDOW_ART]: 'Art',
  [WINDOW_CLOCK]: 'Clock',
}

const MENU_ITEMS = ['File', 'Window', 'Theme', 'Apps', 'Help']
const MENU_ACTIONS = {
  File: ['NEW', 'OPEN FILES', 'OPEN EDITOR', 'SAVE BUFFER', 'REBOOT'],
  Window: ['NEXT WINDOW', 'MINIMIZE', 'MAXIMIZE', 'CLOSE WINDOW'],
  Theme: ['ROTATE THEME', 'CLASSIC', 'NIGHT BUS', 'SUNSET DISK'],
  Apps: ['TERM', 'FILES', 'EDITOR', 'TASKS', 'SYSTEM', 'LOG', 'SNAKE', 'ART', 'CLOCK'],
  Help: ['HELP', 'ABOUT', 'DISCLAIMER'],
}

const makeId = (prefix = 'tv') => `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`
const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const sortByZ = (windows) => [...windows].sort((a, b) => a.z - b.z)

const sanitizePlayer = (player) => ({
  id: String(player?.id || 'guest'),
  username: String(player?.username || 'Guest'),
})

const createLine = (text, color = 15) => ({
  id: makeId('line'),
  text: String(text),
  color: clamp(Number(color) || 15, 0, 15),
})

const cloneTree = (tree) => JSON.parse(JSON.stringify(tree))

const normalizePoint = (value, fallbackX, fallbackY) => ({
  x: Number.isFinite(value?.x) ? value.x : fallbackX,
  y: Number.isFinite(value?.y) ? value.y : fallbackY,
})

const createSnake = () => ({
  dir: 'RIGHT',
  body: [{ x: 10, y: 5 }, { x: 9, y: 5 }, { x: 8, y: 5 }],
  food: { x: 18, y: 8 },
  score: 0,
  alive: true,
})

const createFileCursor = () => ({
  path: '/DEMO/README.HC',
  selectedIndex: 0,
  scroll: 0,
})

const createEditorState = () => ({
  path: '/DOC/DISCLAIMER.TXT',
  lines: [
    'TempleVolt editor buffer.',
    'It looks serious until you read it.',
    'This is still a parody shell.',
  ],
  cursor: { x: 0, y: 0 },
  scroll: 0,
  dirty: false,
})

const createWindow = (type, x, y, w, h, extra = {}) => ({
  id: makeId(type),
  type,
  x,
  y,
  w,
  h,
  minW: extra.minW || 18,
  minH: extra.minH || 6,
  fg: clamp(Number(extra.fg) || 15, 0, 15),
  bg: clamp(Number(extra.bg) || 1, 0, 15),
  z: Date.now() + Math.random(),
  title: extra.title || APP_TITLES[type] || 'Window',
  shaded: Boolean(extra.shaded),
  minimized: Boolean(extra.minimized),
  maximized: Boolean(extra.maximized),
  closable: extra.closable !== false,
  resizable: extra.resizable !== false,
  meta: extra.meta && typeof extra.meta === 'object' ? extra.meta : {},
})

const createBootLog = () => [
  createLine('TempleVolt v0.99 parody shell booted.', 14),
  createLine('TempleOS-inspired text mode interface engaged.', 11),
  createLine('Not a real emulator. Not hardware accurate. Not serious.', 12),
  createLine('Click to focus. Drag title bars. Press F5 to rotate theme.', 10),
]

const createLogLines = () => [
  createLine('[boot] video mode 80x30 text grid online', 10),
  createLine('[boot] palette table loaded', 11),
  createLine('[boot] cursor lock disabled until canvas focus', 8),
  createLine('[boot] fake shell kernel humming softly', 14),
]

const createDesktopWindows = () => ([
  createWindow(WINDOW_TERM, 2, 2, 44, 17, { minW: 24, minH: 8 }),
  createWindow(WINDOW_PALETTE, 48, 2, 30, 11, { minW: 24, minH: 9 }),
  createWindow(WINDOW_ABOUT, 48, 14, 30, 10, { minW: 22, minH: 8 }),
  createWindow(WINDOW_CLOCK, 58, 25, 20, 4, { closable: false, resizable: false, minW: 18, minH: 4 }),
])

const createDefaultState = () => ({
  paletteIndex: 0,
  wallpaperTick: 0,
  bootCount: 1,
  cwd: '/DEMO',
  fs: cloneTree(DIRECTORY_TREE),
  activeWindowId: null,
  menuFocus: null,
  terminalLines: createBootLog(),
  logLines: createLogLines(),
  windows: createDesktopWindows(),
  snake: createSnake(),
  fileCursor: createFileCursor(),
  editor: createEditorState(),
  commandHistory: [],
  historyIndex: -1,
  pointer: { x: 4, y: 4 },
  focusLock: false,
  updatedAt: Date.now(),
})

const pushLines = (lines, entries, max = MAX_TERMINAL_LINES) => [...lines, ...entries].slice(-max)

const pathSegments = (path) => {
  const raw = String(path || '/')
  return raw.split('/').filter(Boolean)
}

const normalizePath = (path, cwd = '/') => {
  const raw = String(path || '').trim()
  const base = raw.startsWith('/') ? [] : pathSegments(cwd)
  raw.split('/').forEach((segment) => {
    if (!segment || segment === '.') return
    if (segment === '..') base.pop()
    else base.push(segment.toUpperCase())
  })
  return `/${base.join('/')}`.replace(/\/+/g, '/')
}

const getNodeAtPath = (tree, path) => {
  const segments = pathSegments(path)
  let node = tree['/']
  for (const segment of segments) {
    if (!node || node.type !== 'dir') return null
    node = node.children?.[segment]
  }
  return node || null
}

const getParentNodeAtPath = (tree, path) => {
  const segments = pathSegments(path)
  if (!segments.length) return null
  const name = segments.pop()
  const parentPath = `/${segments.join('/')}` || '/'
  const parent = getNodeAtPath(tree, parentPath)
  return parent?.type === 'dir' ? { parent, name, parentPath } : null
}

const listDirectory = (tree, path) => {
  const node = getNodeAtPath(tree, path)
  if (!node || node.type !== 'dir') return []
  return Object.entries(node.children || {}).map(([name, child]) => ({
    name,
    type: child.type,
    path: `${path === '/' ? '' : path}/${name}`,
  }))
}

const readFileLines = (tree, path) => {
  const node = getNodeAtPath(tree, path)
  if (!node || node.type !== 'file') return null
  return Array.isArray(node.lines) ? node.lines.slice() : []
}

const writeFileLines = (tree, path, lines) => {
  const snapshot = cloneTree(tree)
  const parentInfo = getParentNodeAtPath(snapshot, path)
  if (!parentInfo) return null
  parentInfo.parent.children[parentInfo.name] = {
    type: 'file',
    lines: Array.isArray(lines) ? lines.map((line) => String(line)) : [''],
  }
  return snapshot
}

const createDirNode = (tree, path) => {
  const snapshot = cloneTree(tree)
  const parentInfo = getParentNodeAtPath(snapshot, path)
  if (!parentInfo || parentInfo.parent.children[parentInfo.name]) return null
  parentInfo.parent.children[parentInfo.name] = { type: 'dir', children: {} }
  return snapshot
}

const deletePathNode = (tree, path) => {
  const snapshot = cloneTree(tree)
  const parentInfo = getParentNodeAtPath(snapshot, path)
  if (!parentInfo || !parentInfo.parent.children[parentInfo.name]) return null
  delete parentInfo.parent.children[parentInfo.name]
  return snapshot
}

const countTreeNodes = (tree, path = '/') => {
  const node = getNodeAtPath(tree, path)
  if (!node) return { files: 0, dirs: 0 }
  if (node.type === 'file') return { files: 1, dirs: 0 }
  return Object.keys(node.children || {}).reduce((acc, name) => {
    const child = countTreeNodes(tree, `${path === '/' ? '' : path}/${name}`)
    return {
      files: acc.files + child.files,
      dirs: acc.dirs + child.dirs,
    }
  }, { files: 0, dirs: 1 })
}

const treeLines = (tree, path = '/', indent = '') => {
  const node = getNodeAtPath(tree, path)
  if (!node || node.type !== 'dir') return []
  const entries = Object.entries(node.children || {})
  const output = []
  entries.forEach(([name, child], index) => {
    const last = index === entries.length - 1
    output.push(`${indent}${last ? BOX.bl : BOX.l}${BOX.h}${BOX.h} ${name}${child.type === 'dir' ? '/' : ''}`)
    if (child.type === 'dir') {
      output.push(...treeLines(tree, `${path === '/' ? '' : path}/${name}`, `${indent}${last ? '   ' : `${BOX.v}  `}`))
    }
  })
  return output
}

const randomFood = (snake) => ({
  x: (snake.score * 7 + snake.body.length * 5 + 11) % 24,
  y: (snake.score * 11 + snake.body.length * 3 + 5) % 10,
})

const tickSnake = (snake) => {
  if (!snake.alive) return snake
  const head = snake.body[0]
  const next = { ...head }
  if (snake.dir === 'UP') next.y -= 1
  if (snake.dir === 'DOWN') next.y += 1
  if (snake.dir === 'LEFT') next.x -= 1
  if (snake.dir === 'RIGHT') next.x += 1
  if (next.x < 0 || next.y < 0 || next.x >= 24 || next.y >= 10 || snake.body.some((part) => part.x === next.x && part.y === next.y)) {
    return { ...snake, alive: false }
  }
  const ate = next.x === snake.food.x && next.y === snake.food.y
  const body = [next, ...snake.body]
  if (!ate) body.pop()
  return {
    ...snake,
    body,
    food: ate ? randomFood({ ...snake, body, score: snake.score + 1 }) : snake.food,
    score: snake.score + (ate ? 1 : 0),
  }
}

const appFactory = {
  [WINDOW_TERM]: () => createWindow(WINDOW_TERM, 6, 4, 44, 17, { minW: 24, minH: 8 }),
  [WINDOW_FILES]: () => createWindow(WINDOW_FILES, 10, 5, 34, 16, { minW: 24, minH: 8 }),
  [WINDOW_HELP]: () => createWindow(WINDOW_HELP, 12, 7, 40, 14, { minW: 28, minH: 9 }),
  [WINDOW_ABOUT]: () => createWindow(WINDOW_ABOUT, 18, 8, 34, 12, { minW: 22, minH: 8 }),
  [WINDOW_PALETTE]: () => createWindow(WINDOW_PALETTE, 42, 4, 30, 12, { minW: 24, minH: 9 }),
  [WINDOW_EDITOR]: () => createWindow(WINDOW_EDITOR, 8, 4, 56, 18, { minW: 32, minH: 10 }),
  [WINDOW_TASKS]: () => createWindow(WINDOW_TASKS, 22, 8, 30, 12, { minW: 24, minH: 8 }),
  [WINDOW_SYSTEM]: () => createWindow(WINDOW_SYSTEM, 20, 6, 34, 15, { minW: 28, minH: 10 }),
  [WINDOW_SNAKE]: () => createWindow(WINDOW_SNAKE, 16, 6, 32, 16, { minW: 30, minH: 15 }),
  [WINDOW_LOG]: () => createWindow(WINDOW_LOG, 8, 8, 46, 14, { minW: 28, minH: 8 }),
  [WINDOW_ART]: () => createWindow(WINDOW_ART, 14, 5, 48, 18, { minW: 32, minH: 10 }),
  [WINDOW_CLOCK]: () => createWindow(WINDOW_CLOCK, 58, 25, 20, 4, { closable: false, resizable: false, minW: 18, minH: 4 }),
}

const createAppWindow = (type) => (appFactory[type] ? appFactory[type]() : createWindow(type, 10, 5, 30, 10))

const normalizeWindow = (win) => {
  const fallback = createWindow(WINDOW_TERM, 2, 2, 40, 12)
  const width = clamp(Number(win?.w) || fallback.w, 12, COLS - 1)
  const height = clamp(Number(win?.h) || fallback.h, 4, ROWS - 2)
  return {
    ...fallback,
    ...win,
    type: String(win?.type || fallback.type),
    id: String(win?.id || fallback.id),
    x: clamp(Number(win?.x) || fallback.x, 0, COLS - width),
    y: clamp(Number(win?.y) || fallback.y, 1, ROWS - height - 1),
    w: width,
    h: height,
    minW: clamp(Number(win?.minW) || fallback.minW, 12, COLS),
    minH: clamp(Number(win?.minH) || fallback.minH, 4, ROWS),
    fg: clamp(Number(win?.fg) || 15, 0, 15),
    bg: clamp(Number(win?.bg) || 1, 0, 15),
    z: Number(win?.z) || Date.now(),
    title: String(win?.title || APP_TITLES[win?.type] || fallback.title),
    shaded: Boolean(win?.shaded),
    minimized: Boolean(win?.minimized),
    maximized: Boolean(win?.maximized),
    closable: win?.closable !== false,
    resizable: win?.resizable !== false,
    meta: win?.meta && typeof win.meta === 'object' ? win.meta : {},
  }
}

const normalizeState = (value) => {
  const fallback = createDefaultState()
  if (!value || typeof value !== 'object') return fallback
  return {
    paletteIndex: Number.isInteger(value.paletteIndex) ? ((value.paletteIndex % PALETTES.length) + PALETTES.length) % PALETTES.length : fallback.paletteIndex,
    wallpaperTick: Number(value.wallpaperTick) || 0,
    bootCount: Number(value.bootCount) || 1,
    cwd: normalizePath(value.cwd || fallback.cwd),
    fs: value.fs && typeof value.fs === 'object' ? value.fs : fallback.fs,
    activeWindowId: typeof value.activeWindowId === 'string' ? value.activeWindowId : null,
    menuFocus: typeof value.menuFocus === 'string' ? value.menuFocus : null,
    terminalLines: Array.isArray(value.terminalLines) ? value.terminalLines.slice(-MAX_TERMINAL_LINES).map((line) => createLine(line?.text || '', line?.color)) : fallback.terminalLines,
    logLines: Array.isArray(value.logLines) ? value.logLines.slice(-MAX_LOG_LINES).map((line) => createLine(line?.text || '', line?.color)) : fallback.logLines,
    windows: Array.isArray(value.windows) ? value.windows.map(normalizeWindow).slice(-MAX_WINDOWS) : fallback.windows,
    snake: value.snake && typeof value.snake === 'object' ? {
      dir: ['UP', 'DOWN', 'LEFT', 'RIGHT'].includes(value.snake.dir) ? value.snake.dir : 'RIGHT',
      body: Array.isArray(value.snake.body) ? value.snake.body.map((part, index) => normalizePoint(part, 10 - index, 5)).slice(0, 80) : fallback.snake.body,
      food: normalizePoint(value.snake.food, 12, 7),
      score: Number(value.snake.score) || 0,
      alive: value.snake.alive !== false,
    } : fallback.snake,
    fileCursor: value.fileCursor && typeof value.fileCursor === 'object' ? {
      path: normalizePath(value.fileCursor.path || fallback.fileCursor.path, fallback.cwd),
      selectedIndex: clamp(Number(value.fileCursor.selectedIndex) || 0, 0, 999),
      scroll: clamp(Number(value.fileCursor.scroll) || 0, 0, 999),
    } : fallback.fileCursor,
    editor: value.editor && typeof value.editor === 'object' ? {
      path: normalizePath(value.editor.path || fallback.editor.path, fallback.cwd),
      lines: Array.isArray(value.editor.lines) ? value.editor.lines.slice(0, MAX_EDITOR_LINES).map((line) => String(line)) : fallback.editor.lines,
      cursor: normalizePoint(value.editor.cursor, 0, 0),
      scroll: clamp(Number(value.editor.scroll) || 0, 0, 999),
      dirty: Boolean(value.editor.dirty),
    } : fallback.editor,
    commandHistory: Array.isArray(value.commandHistory) ? value.commandHistory.map((entry) => String(entry)).slice(-100) : [],
    historyIndex: Number.isInteger(value.historyIndex) ? value.historyIndex : -1,
    pointer: normalizePoint(value.pointer, 4, 4),
    focusLock: Boolean(value.focusLock),
    updatedAt: Number(value.updatedAt) || Date.now(),
  }
}

const withLog = (state, text, color = 15) => ({
  ...state,
  logLines: pushLines(state.logLines, [createLine(text, color)], MAX_LOG_LINES),
})

const withTerminal = (state, text, color = 15) => ({
  ...state,
  terminalLines: pushLines(state.terminalLines, [createLine(text, color)], MAX_TERMINAL_LINES),
})

const setActiveWindow = (state, id) => ({
  ...state,
  activeWindowId: id,
  windows: state.windows.map((win) => (win.id === id ? { ...win, z: Date.now() + Math.random(), minimized: false } : win)),
})

const focusOrCreateWindow = (state, type) => {
  const existing = state.windows.find((win) => win.type === type)
  if (existing) return setActiveWindow(state, existing.id)
  if (state.windows.length >= MAX_WINDOWS) {
    const oldest = sortByZ(state.windows)[0]
    const remaining = state.windows.filter((win) => win.id !== oldest.id)
    const created = createAppWindow(type)
    return {
      ...state,
      windows: [...remaining, created],
      activeWindowId: created.id,
    }
  }
  const created = createAppWindow(type)
  return {
    ...state,
    windows: [...state.windows, created],
    activeWindowId: created.id,
  }
}

const closeWindow = (state, id) => {
  const target = state.windows.find((win) => win.id === id)
  if (!target || target.closable === false) return state
  const windows = state.windows.filter((win) => win.id !== id)
  const fallback = sortByZ(windows).at(-1)?.id || null
  return {
    ...state,
    windows,
    activeWindowId: state.activeWindowId === id ? fallback : state.activeWindowId,
  }
}

const toggleMinimize = (state, id) => {
  const target = state.windows.find((win) => win.id === id)
  if (!target) return state
  const windows = state.windows.map((win) => (win.id === id ? { ...win, minimized: !win.minimized } : win))
  const activeWindowId = target.id === state.activeWindowId && !target.minimized
    ? sortByZ(windows.filter((win) => !win.minimized)).at(-1)?.id || null
    : state.activeWindowId
  return {
    ...state,
    windows,
    activeWindowId,
  }
}

const toggleShade = (state, id) => ({
  ...state,
  windows: state.windows.map((win) => (win.id === id ? { ...win, shaded: !win.shaded } : win)),
})

const toggleMaximize = (state, id) => ({
  ...state,
  windows: state.windows.map((win) => {
    if (win.id !== id) return win
    if (win.maximized) {
      const saved = win.meta.restore
      if (!saved) return { ...win, maximized: false }
      return {
        ...win,
        x: saved.x,
        y: saved.y,
        w: saved.w,
        h: saved.h,
        maximized: false,
        meta: { ...win.meta, restore: null },
      }
    }
    return {
      ...win,
      x: 0,
      y: 1,
      w: COLS,
      h: ROWS - 2,
      maximized: true,
      meta: { ...win.meta, restore: { x: win.x, y: win.y, w: win.w, h: win.h } },
    }
  }),
})

const cyclePalette = (state) => ({
  ...state,
  paletteIndex: (state.paletteIndex + 1) % PALETTES.length,
})

const cmdHelp = () => [
  'HELP CLS DIR [PATH] TREE [PATH] CAT <FILE> TYPE <FILE>',
  'OPEN <APP|FILE> CLOSE KILL WINDOWS PALETTE THEME COLOR fg bg',
  'FOCUS NEXT VER ABOUT REBOOT APPS PWD CD <PATH> EDIT <FILE>',
  'TASKS SYSTEM LOG SNAKE ART CLOCK DISCLAIMER',
]

const resolveAppAlias = (value) => {
  const upper = String(value || '').trim().toUpperCase()
  if (upper === 'TERM' || upper === 'COMMAND') return WINDOW_TERM
  if (upper === 'FILES' || upper === 'BROWSER') return WINDOW_FILES
  if (upper === 'HELP') return WINDOW_HELP
  if (upper === 'ABOUT') return WINDOW_ABOUT
  if (upper === 'PALETTE' || upper === 'THEME') return WINDOW_PALETTE
  if (upper === 'EDITOR' || upper === 'EDIT') return WINDOW_EDITOR
  if (upper === 'TASKS' || upper === 'TASKMGR') return WINDOW_TASKS
  if (upper === 'SYSTEM' || upper === 'SYSINFO') return WINDOW_SYSTEM
  if (upper === 'SNAKE') return WINDOW_SNAKE
  if (upper === 'LOG') return WINDOW_LOG
  if (upper === 'ART' || upper === 'PAINT') return WINDOW_ART
  if (upper === 'CLOCK') return WINDOW_CLOCK
  return null
}

const makeEditorForPath = (tree, path) => {
  const lines = readFileLines(tree, path)
  return {
    path,
    lines: lines || [''],
    cursor: { x: 0, y: 0 },
    scroll: 0,
    dirty: false,
  }
}

const executeCommand = (input, username, state) => {
  const raw = String(input || '').trim()
  const upper = raw.toUpperCase()
  let next = { ...state }
  let terminalLines = pushLines(state.terminalLines, [createLine(`] ${raw}`, 15)], MAX_TERMINAL_LINES)
  let logLines = state.logLines
  const term = (text, color = 15) => { terminalLines = pushLines(terminalLines, [createLine(text, color)], MAX_TERMINAL_LINES) }
  const log = (text, color = 15) => { logLines = pushLines(logLines, [createLine(text, color)], MAX_LOG_LINES) }
  const activeId = state.activeWindowId || state.windows.find((win) => win.type === WINDOW_TERM)?.id || null

  if (!raw) {
    return { state: { ...next, terminalLines, logLines, updatedAt: Date.now() } }
  }

  next.commandHistory = [...state.commandHistory, raw].slice(-100)
  next.historyIndex = -1

  if (upper === 'HELP') {
    cmdHelp().forEach((line) => term(line, 10))
  } else if (upper === 'CLS' || upper === 'CLEAR') {
    terminalLines = []
  } else if (upper === 'VER') {
    term('TempleVolt v0.99 PARODY BUILD', 14)
    term('Canvas text-mode workstation. TempleOS-inspired, not TempleOS.', 11)
  } else if (upper === 'WHOAMI') {
    term(username.toUpperCase(), 10)
  } else if (upper === 'USERS') {
    term(`ACTIVE USER ${username.toUpperCase()}`, 10)
  } else if (upper === 'DATE' || upper === 'TIME') {
    term(new Date().toString(), 14)
  } else if (upper === 'PWD') {
    term(next.cwd, 15)
  } else if (upper.startsWith('CD ')) {
    const target = normalizePath(raw.slice(3).trim(), next.cwd)
    const node = getNodeAtPath(next.fs, target)
    if (node?.type === 'dir') {
      next.cwd = target
      next.fileCursor = { ...next.fileCursor, path: target, selectedIndex: 0, scroll: 0 }
      term(`CWD -> ${target}`, 10)
      log(`[shell] ${username} cd ${target}`, 8)
    } else {
      term(`DIRECTORY NOT FOUND: ${target}`, 12)
    }
  } else if (upper === 'DIR' || upper === 'LS' || upper.startsWith('DIR ') || upper.startsWith('LS ')) {
    const target = normalizePath(raw.split(/\s+/)[1] || next.cwd, next.cwd)
    const entries = listDirectory(next.fs, target)
    if (!entries.length) term(`EMPTY OR INVALID: ${target}`, 8)
    else {
      term(`DIRECTORY ${target}`, 14)
      entries.forEach((entry) => term(`${entry.type === 'dir' ? '<DIR>' : '     '} ${entry.name}`, entry.type === 'dir' ? 11 : 15))
    }
  } else if (upper === 'TREE' || upper.startsWith('TREE ')) {
    const target = normalizePath(raw.split(/\s+/)[1] || next.cwd, next.cwd)
    term(`TREE ${target}`, 14)
    treeLines(next.fs, target).forEach((line) => term(line, 15))
  } else if (upper.startsWith('CAT ') || upper.startsWith('TYPE ')) {
    const arg = raw.split(/\s+/).slice(1).join(' ')
    const path = normalizePath(arg, next.cwd)
    const lines = readFileLines(next.fs, path)
    if (!lines) term(`FILE NOT FOUND: ${path}`, 12)
    else lines.forEach((line) => term(line, 15))
  } else if (upper.startsWith('NEW ') || upper.startsWith('TOUCH ')) {
    const arg = raw.split(/\s+/).slice(1).join(' ')
    const path = normalizePath(arg, next.cwd)
    const written = writeFileLines(next.fs, path, [''])
    if (!written) term(`CREATE FAILED: ${path}`, 12)
    else {
      next.fs = written
      term(`CREATED FILE ${path}`, 10)
      log(`[fs] created file ${path}`, 10)
    }
  } else if (upper.startsWith('MKDIR ')) {
    const path = normalizePath(raw.slice(6).trim(), next.cwd)
    const written = createDirNode(next.fs, path)
    if (!written) term(`MKDIR FAILED: ${path}`, 12)
    else {
      next.fs = written
      term(`CREATED DIR ${path}`, 10)
      log(`[fs] created dir ${path}`, 10)
    }
  } else if (upper.startsWith('DEL ') || upper.startsWith('RM ')) {
    const path = normalizePath(raw.split(/\s+/).slice(1).join(' '), next.cwd)
    const written = deletePathNode(next.fs, path)
    if (!written) term(`DELETE FAILED: ${path}`, 12)
    else {
      next.fs = written
      term(`DELETED ${path}`, 12)
      log(`[fs] deleted ${path}`, 12)
    }
  } else if (upper === 'CLEARLOG') {
    logLines = []
  } else if (upper === 'WINDOWS') {
    sortByZ(next.windows).forEach((win) => term(`${win.type.toUpperCase()} ${win.w}x${win.h} @ ${win.x},${win.y}${win.shaded ? ' SHADED' : ''}`, 15))
  } else if (upper === 'APPS') {
    term('TERM FILES HELP ABOUT PALETTE EDITOR TASKS SYSTEM SNAKE LOG ART CLOCK', 11)
  } else if (upper === 'ABOUT' || upper === 'DISCLAIMER') {
    readFileLines(next.fs, '/DOC/DISCLAIMER.TXT')?.forEach((line) => term(line, 12))
    next = focusOrCreateWindow(next, WINDOW_ABOUT)
  } else if (upper === 'PALETTE' || upper === 'THEME') {
    next = cyclePalette(next)
    term(`THEME -> ${PALETTES[next.paletteIndex].name.toUpperCase()}`, 14)
    log(`[theme] palette changed to ${PALETTES[next.paletteIndex].name}`, 9)
  } else if (upper.startsWith('COLOR ')) {
    const [, fgRaw, bgRaw] = raw.split(/\s+/)
    const fg = clamp(Number(fgRaw), 0, 15)
    const bg = clamp(Number(bgRaw), 0, 15)
    next.windows = next.windows.map((win) => (win.id === activeId ? { ...win, fg, bg } : win))
    term(`WINDOW COLOR SET FG=${fg} BG=${bg}`, 10)
  } else if (upper === 'FOCUS NEXT') {
    const ordered = sortByZ(next.windows)
    const currentIndex = ordered.findIndex((win) => win.id === next.activeWindowId)
    const target = ordered[(currentIndex + 1 + ordered.length) % ordered.length]
    if (target) next = setActiveWindow(next, target.id)
  } else if (upper === 'CLOSE' || upper === 'KILL') {
    if (!next.activeWindowId) term('NO ACTIVE WINDOW', 12)
    else {
      const closing = next.windows.find((win) => win.id === next.activeWindowId)
      next = closeWindow(next, next.activeWindowId)
      term(`CLOSED ${closing?.type?.toUpperCase() || 'WINDOW'}`, 12)
    }
  } else if (upper === 'TASKS') {
    next = focusOrCreateWindow(next, WINDOW_TASKS)
    term('TASK VIEW OPEN.', 10)
  } else if (upper === 'SYSTEM') {
    next = focusOrCreateWindow(next, WINDOW_SYSTEM)
    term('SYSTEM VIEW OPEN.', 10)
  } else if (upper === 'LOG') {
    next = focusOrCreateWindow(next, WINDOW_LOG)
    term('LOG VIEW OPEN.', 10)
  } else if (upper === 'SNAKE') {
    next = focusOrCreateWindow(next, WINDOW_SNAKE)
    term('SNAKE WINDOW OPEN. USE ARROWS.', 10)
  } else if (upper === 'ART') {
    next = focusOrCreateWindow(next, WINDOW_ART)
    term('ART WINDOW OPEN.', 10)
  } else if (upper === 'CLOCK') {
    next = focusOrCreateWindow(next, WINDOW_CLOCK)
    term('CLOCK WINDOW FOCUSED.', 10)
  } else if (upper === 'REBOOT') {
    next = createDefaultState()
    next.bootCount = state.bootCount + 1
    terminalLines = pushLines(next.terminalLines, [createLine(`${username} requested reboot.`, 14)], MAX_TERMINAL_LINES)
    logLines = pushLines(next.logLines, [createLine('[boot] soft reboot complete', 14)], MAX_LOG_LINES)
  } else if (upper.startsWith('OPEN ')) {
    const arg = raw.slice(5).trim()
    const app = resolveAppAlias(arg)
    if (app) {
      next = focusOrCreateWindow(next, app)
      term(`${app.toUpperCase()} WINDOW OPEN.`, 10)
    } else {
      const path = normalizePath(arg, next.cwd)
      const fileLines = readFileLines(next.fs, path)
      if (fileLines) {
        next.editor = makeEditorForPath(next.fs, path)
        next = focusOrCreateWindow(next, WINDOW_EDITOR)
        term(`OPENED ${path}`, 14)
      } else {
        term(`APP OR FILE NOT FOUND: ${arg}`, 12)
      }
    }
  } else if (upper.startsWith('EDIT ')) {
    const path = normalizePath(raw.slice(5).trim(), next.cwd)
    next.editor = makeEditorForPath(next.fs, path)
    next = focusOrCreateWindow(next, WINDOW_EDITOR)
    term(`EDITOR -> ${path}`, 10)
  } else {
    term(`UNKNOWN COMMAND: ${raw}`, 12)
  }

  return {
    state: {
      ...next,
      terminalLines,
      logLines,
      updatedAt: Date.now(),
    },
  }
}

const createBuffer = () => Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => ({ char: ' ', fg: 15, bg: DESKTOP_BG })))

const setCell = (buffer, x, y, char, fg = 15, bg = DESKTOP_BG) => {
  if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return
  buffer[y][x] = { char, fg, bg }
}

const drawText = (buffer, x, y, text, fg = 15, bg = DESKTOP_BG, maxWidth = Infinity) => {
  const raw = `${text}`
  for (let index = 0; index < raw.length && index < maxWidth; index += 1) {
    const px = x + index
    if (px >= COLS) break
    setCell(buffer, px, y, raw[index], fg, bg)
  }
}

const fillRect = (buffer, x, y, w, h, fg = 15, bg = DESKTOP_BG, char = ' ') => {
  for (let row = y; row < y + h; row += 1) {
    for (let col = x; col < x + w; col += 1) {
      setCell(buffer, col, row, char, fg, bg)
    }
  }
}

const frameRect = (buffer, x, y, w, h, fg = 15, bg = 1) => {
  if (w < 2 || h < 2) return
  setCell(buffer, x, y, BOX.tl, fg, bg)
  setCell(buffer, x + w - 1, y, BOX.tr, fg, bg)
  setCell(buffer, x, y + h - 1, BOX.bl, fg, bg)
  setCell(buffer, x + w - 1, y + h - 1, BOX.br, fg, bg)
  for (let i = 1; i < w - 1; i += 1) {
    setCell(buffer, x + i, y, BOX.h, fg, bg)
    setCell(buffer, x + i, y + h - 1, BOX.h, fg, bg)
  }
  for (let i = 1; i < h - 1; i += 1) {
    setCell(buffer, x, y + i, BOX.v, fg, bg)
    setCell(buffer, x + w - 1, y + i, BOX.v, fg, bg)
  }
}

const drawInset = (buffer, x, y, w, h, fg, bg) => {
  frameRect(buffer, x, y, w, h, fg, bg)
  for (let row = y + 1; row < y + h - 1; row += 1) {
    setCell(buffer, x + 1, row, BOX.v, 7, bg)
    setCell(buffer, x + w - 2, row, BOX.v, 8, bg)
  }
}

const drawButton = (buffer, x, y, label, fg, bg, hot = false) => {
  drawText(buffer, x, y, `[${label}]`, hot ? 14 : fg, bg)
}

const menuItemAt = (x) => {
  let offset = 1
  for (const item of MENU_ITEMS) {
    if (x >= offset && x < offset + item.length) return item
    offset += item.length + 3
  }
  return null
}

const paintDesktop = (buffer, state, runtime) => {
  fillRect(buffer, 0, 0, COLS, ROWS, 15, DESKTOP_BG, ' ')
  for (let row = 1; row < ROWS - 1; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const shade = (col * 3 + row * 5 + state.wallpaperTick) % 41
      if (shade === 0) setCell(buffer, col, row, '.', 9, DESKTOP_BG)
      else if (shade === 11) setCell(buffer, col, row, '*', 14, DESKTOP_BG)
      else if (shade === 23) setCell(buffer, col, row, SHADE[(col + row + state.wallpaperTick) % SHADE.length], 8, DESKTOP_BG)
    }
  }
  drawText(buffer, 1, ROWS - 1, 'TempleVolt parody shell. TempleOS-inspired, not TempleOS.', 14, STATUS_BG, COLS - 2)
  fillRect(buffer, 0, 0, COLS, 1, MENU_FG, MENU_BG, ' ')
  let offset = 1
  MENU_ITEMS.forEach((item) => {
    const active = state.menuFocus === item
    drawText(buffer, offset, 0, item, active ? 15 : MENU_FG, active ? 1 : MENU_BG)
    offset += item.length + 3
  })
  fillRect(buffer, 0, ROWS - 1, COLS, 1, STATUS_FG, STATUS_BG, ' ')
  const minimized = sortByZ(state.windows).filter((win) => win.minimized)
  let taskX = 1
  minimized.forEach((win) => {
    const label = `<${win.title.slice(0, 10)}>`
    drawText(buffer, taskX, ROWS - 1, label, 14, STATUS_BG, label.length)
    taskX += label.length + 1
  })
  if (runtime.statusText) drawText(buffer, COLS - runtime.statusText.length - 1, ROWS - 1, runtime.statusText, 15, STATUS_BG, runtime.statusText.length)
  if (state.menuFocus && MENU_ACTIONS[state.menuFocus]) {
    const menu = state.menuFocus
    const actions = MENU_ACTIONS[menu]
    let menuX = 1
    for (const item of MENU_ITEMS) {
      if (item === menu) break
      menuX += item.length + 3
    }
    const menuW = Math.min(24, Math.max(...actions.map((action) => action.length)) + 4)
    const menuH = actions.length + 2
    fillRect(buffer, menuX - 1, 1, menuW, menuH, 15, 7, ' ')
    frameRect(buffer, menuX - 1, 1, menuW, menuH, 0, 7)
    actions.forEach((action, index) => {
      drawText(buffer, menuX, 2 + index, action.padEnd(menuW - 3, ' '), 0, 7, menuW - 3)
    })
  }
}

const drawWindowChrome = (buffer, win, active) => {
  if (win.minimized) return
  const titleBg = active ? TITLE_ACTIVE_BG : TITLE_INACTIVE_BG
  const titleFg = active ? TITLE_ACTIVE_FG : TITLE_INACTIVE_FG
  const bodyHeight = win.shaded ? 3 : win.h
  fillRect(buffer, win.x, win.y, win.w, bodyHeight, win.fg, win.bg, ' ')
  frameRect(buffer, win.x, win.y, win.w, bodyHeight, win.fg, win.bg)
  fillRect(buffer, win.x + 1, win.y, win.w - 2, 1, titleFg, titleBg, ' ')
  const title = ` ${win.title}${win.maximized ? ' [MAX]' : ''}${win.shaded ? ' [SHADE]' : ''} `
  drawText(buffer, win.x + 2, win.y, title.slice(0, Math.max(0, win.w - 16)), titleFg, titleBg)
  if (win.closable) drawButton(buffer, win.x + win.w - 15, win.y, 'X', titleFg, titleBg, active)
  drawButton(buffer, win.x + win.w - 12, win.y, '_', titleFg, titleBg)
  drawButton(buffer, win.x + win.w - 8, win.y, '^', titleFg, titleBg)
  if (win.resizable) drawButton(buffer, win.x + win.w - 5, win.y, '+', titleFg, titleBg)
  if (!win.shaded && win.resizable) {
    setCell(buffer, win.x + win.w - 1, win.y + win.h - 1, '\u25e2', 15, win.bg)
  }
}

const paintScrollBar = (buffer, x, y, h, total, scroll, view, fg = 15, bg = 1) => {
  if (h < 3) return
  for (let row = 0; row < h; row += 1) setCell(buffer, x, y + row, BOX.v, fg, bg)
  if (total <= view) {
    for (let row = 1; row < h - 1; row += 1) setCell(buffer, x, y + row, '\u2588', 8, bg)
    return
  }
  const thumbSize = clamp(Math.floor((view / total) * (h - 2)), 1, h - 2)
  const thumbRange = Math.max(1, h - 2 - thumbSize)
  const thumbOffset = Math.floor((scroll / Math.max(1, total - view)) * thumbRange)
  for (let row = 1; row < h - 1; row += 1) {
    const inThumb = row - 1 >= thumbOffset && row - 1 < thumbOffset + thumbSize
    setCell(buffer, x, y + row, inThumb ? '\u2588' : '\u2591', inThumb ? fg : 8, bg)
  }
}

const renderTerminal = (buffer, win, state, input, cursorOn, focused) => {
  const contentX = win.x + 1
  const contentY = win.y + 1
  const contentW = win.w - 2
  const contentH = win.h - 2
  const viewHeight = Math.max(1, contentH - 2)
  const lines = state.terminalLines.slice(-viewHeight)
  fillRect(buffer, contentX, contentY, contentW, contentH, 15, win.bg, ' ')
  lines.forEach((line, index) => {
    drawText(buffer, contentX + 1, contentY + index, line.text.padEnd(contentW - 2, ' '), line.color, win.bg, contentW - 2)
  })
  drawText(buffer, contentX + 1, contentY + contentH - 2, `${state.cwd}>`.padEnd(10, ' '), 14, win.bg, 10)
  const promptWidth = Math.max(0, contentW - 12)
  const caret = focused && cursorOn ? '_' : ' '
  const text = `${input}${caret}`
  drawText(buffer, contentX + 11, contentY + contentH - 2, text.slice(-promptWidth).padEnd(promptWidth, ' '), 15, win.bg, promptWidth)
  drawText(buffer, contentX + 1, contentY + contentH - 1, 'ENTER=RUN  ESC=UNLOCK  F5=THEME  TAB=NEXT WINDOW', 8, win.bg, contentW - 2)
}

const renderFiles = (buffer, win, state) => {
  const entries = listDirectory(state.fs, state.fileCursor.path)
  const viewH = win.h - 5
  fillRect(buffer, win.x + 1, win.y + 1, win.w - 2, win.h - 2, 15, win.bg, ' ')
  drawText(buffer, win.x + 2, win.y + 1, `PATH ${state.fileCursor.path}`, 14, win.bg, win.w - 4)
  entries.slice(state.fileCursor.scroll, state.fileCursor.scroll + viewH).forEach((entry, index) => {
    const selected = state.fileCursor.scroll + index === state.fileCursor.selectedIndex
    const fg = selected ? 0 : entry.type === 'dir' ? 11 : 15
    const bg = selected ? 14 : win.bg
    drawText(buffer, win.x + 2, win.y + 3 + index, `${entry.type === 'dir' ? '<DIR>' : '     '} ${entry.name}`.padEnd(win.w - 5, ' '), fg, bg, win.w - 5)
  })
  paintScrollBar(buffer, win.x + win.w - 2, win.y + 2, win.h - 4, entries.length, state.fileCursor.scroll, viewH, 15, win.bg)
  drawText(buffer, win.x + 2, win.y + win.h - 2, 'ENTER=OPEN  BACKSPACE=UP  ARROWS=SELECT', 8, win.bg, win.w - 4)
}

const renderHelp = (buffer, win) => {
  const lines = [
    'TempleVolt command reference',
    '',
    ...cmdHelp(),
    '',
    'Mouse',
    'Drag title bar to move windows.',
    'Drag lower-right handle to resize windows.',
    'Click [X] to close, [^] to shade, [+] to maximize.',
    '',
    'Keyboard',
    'Esc unlocks focus.',
    'F5 cycles theme.',
    'Tab rotates active window.',
  ]
  fillRect(buffer, win.x + 1, win.y + 1, win.w - 2, win.h - 2, 15, win.bg, ' ')
  lines.slice(0, win.h - 3).forEach((line, index) => {
    drawText(buffer, win.x + 2, win.y + 2 + index, line.padEnd(win.w - 4, ' '), index === 0 ? 14 : 15, win.bg, win.w - 4)
  })
}

const renderAbout = (buffer, win, state) => {
  const lines = [
    'TempleVolt',
    'Canvas text-mode parody workstation',
    '',
    'Style goals:',
    '- IBM PC font stack',
    '- 16-color palette switching',
    '- text-mode window chrome',
    '- movable overlapping windows',
    '',
    `Boot Count: ${state.bootCount}`,
    `Palette: ${PALETTES[state.paletteIndex].name}`,
    'Not a real TempleOS emulator.',
  ]
  fillRect(buffer, win.x + 1, win.y + 1, win.w - 2, win.h - 2, 15, win.bg, ' ')
  lines.slice(0, win.h - 3).forEach((line, index) => {
    drawText(buffer, win.x + 2, win.y + 2 + index, line.padEnd(win.w - 4, ' '), index === 0 ? 14 : 15, win.bg, win.w - 4)
  })
}

const renderPalette = (buffer, win, state) => {
  fillRect(buffer, win.x + 1, win.y + 1, win.w - 2, win.h - 2, 15, win.bg, ' ')
  drawText(buffer, win.x + 2, win.y + 2, PALETTES[state.paletteIndex].name, 14, win.bg, win.w - 4)
  for (let index = 0; index < 16; index += 1) {
    const col = index % 4
    const row = Math.floor(index / 4)
    const ox = win.x + 3 + col * 6
    const oy = win.y + 4 + row * 2
    drawText(buffer, ox, oy, ` ${index.toString(16).toUpperCase()} `, 15, index, 3)
    drawText(buffer, ox + 4, oy, index.toString().padStart(2, '0'), 15, win.bg, 2)
  }
  drawText(buffer, win.x + 2, win.y + win.h - 2, 'F5 OR THEME TO ROTATE PALETTE', 8, win.bg, win.w - 4)
}

const renderEditor = (buffer, win, state, cursorOn, active) => {
  const contentW = win.w - 4
  const contentH = win.h - 5
  fillRect(buffer, win.x + 1, win.y + 1, win.w - 2, win.h - 2, 15, win.bg, ' ')
  drawText(buffer, win.x + 2, win.y + 1, `${state.editor.path}${state.editor.dirty ? ' *' : ''}`, 14, win.bg, win.w - 4)
  state.editor.lines.slice(state.editor.scroll, state.editor.scroll + contentH).forEach((line, index) => {
    const lineNumber = `${state.editor.scroll + index + 1}`.padStart(3, ' ')
    drawText(buffer, win.x + 2, win.y + 3 + index, lineNumber, 8, win.bg, 3)
    drawText(buffer, win.x + 6, win.y + 3 + index, line.padEnd(contentW - 4, ' '), 15, win.bg, contentW - 4)
  })
  const cursorRow = state.editor.cursor.y - state.editor.scroll
  if (active && cursorOn && cursorRow >= 0 && cursorRow < contentH) {
    const x = clamp(win.x + 6 + state.editor.cursor.x, win.x + 6, win.x + win.w - 3)
    const y = win.y + 3 + cursorRow
    const line = state.editor.lines[state.editor.cursor.y] || ''
    const ch = line[state.editor.cursor.x] || ' '
    setCell(buffer, x, y, ch, win.bg, 15)
  }
  drawText(buffer, win.x + 2, win.y + win.h - 2, 'TYPE TO EDIT  CTRL+S=SAVE BUFFER  CTRL+L=LOAD FILE', 8, win.bg, win.w - 4)
}

const renderTasks = (buffer, win, state) => {
  fillRect(buffer, win.x + 1, win.y + 1, win.w - 2, win.h - 2, 15, win.bg, ' ')
  drawText(buffer, win.x + 2, win.y + 1, 'TASK LIST', 14, win.bg)
  sortByZ(state.windows).slice(-(win.h - 4)).forEach((task, index) => {
    const active = task.id === state.activeWindowId
    drawText(buffer, win.x + 2, win.y + 3 + index, `${active ? '>' : ' '} ${task.type.toUpperCase().padEnd(10, ' ')} ${task.w}x${task.h}`, active ? 14 : 15, win.bg, win.w - 4)
  })
}

const renderSystem = (buffer, win, state, userCount) => {
  const counts = countTreeNodes(state.fs)
  const lines = [
    'SYSTEM DIAGNOSTICS',
    '',
    `Video Mode: ${COLS}x${ROWS} text cells`,
    `Font: IBM VGA style stack`,
    `Palette Set: ${PALETTES[state.paletteIndex].name}`,
    `Window Count: ${state.windows.length}`,
    `Minimized: ${state.windows.filter((entry) => entry.minimized).length}`,
    `Players Present: ${userCount}`,
    `Focus Lock: ${state.focusLock ? 'ON' : 'OFF'}`,
    `Pointer Cell: ${state.pointer.x},${state.pointer.y}`,
    `Wallpaper Tick: ${state.wallpaperTick}`,
    `Boot Count: ${state.bootCount}`,
    `Files: ${counts.files}  Dirs: ${counts.dirs}`,
  ]
  fillRect(buffer, win.x + 1, win.y + 1, win.w - 2, win.h - 2, 15, win.bg, ' ')
  lines.slice(0, win.h - 3).forEach((line, index) => {
    drawText(buffer, win.x + 2, win.y + 2 + index, line.padEnd(win.w - 4, ' '), index === 0 ? 14 : 15, win.bg, win.w - 4)
  })
}

const renderSnake = (buffer, win, state) => {
  fillRect(buffer, win.x + 1, win.y + 1, win.w - 2, win.h - 2, 15, win.bg, ' ')
  const ox = win.x + 3
  const oy = win.y + 2
  for (let y = 0; y < 10; y += 1) {
    for (let x = 0; x < 24; x += 1) setCell(buffer, ox + x, oy + y, '.', 8, 0)
  }
  setCell(buffer, ox + state.snake.food.x, oy + state.snake.food.y, '@', 12, 0)
  state.snake.body.forEach((part, index) => setCell(buffer, ox + part.x, oy + part.y, index === 0 ? 'O' : 'o', state.snake.alive ? 10 : 12, 0))
  drawText(buffer, win.x + 3, win.y + 13, `SCORE ${state.snake.score}`.padEnd(16, ' '), 14, win.bg, 16)
  drawText(buffer, win.x + 3, win.y + 14, state.snake.alive ? 'ARROWS TO STEER' : 'DEAD. REBOOT OR KEEP LOSING', state.snake.alive ? 8 : 12, win.bg, win.w - 6)
}

const renderLog = (buffer, win, state) => {
  const viewH = win.h - 4
  fillRect(buffer, win.x + 1, win.y + 1, win.w - 2, win.h - 2, 15, win.bg, ' ')
  state.logLines.slice(-viewH).forEach((line, index) => {
    drawText(buffer, win.x + 2, win.y + 2 + index, line.text.padEnd(win.w - 4, ' '), line.color, win.bg, win.w - 4)
  })
}

const renderArt = (buffer, win) => {
  const art = [
    '                .-=========-.',
    '                \'-=======-\'',
    '                _|   .=.   |_',
    '               ((|  {{1}}  |))',
    '                \\|   /|\\   |/',
    '                 \\__ \'_\' __/',
    '                   _`) (`_',
    '                 _/_______\\_',
    '                /___________\\',
    '            TEMPLEVOLT ICONOGRAPHY',
  ]
  fillRect(buffer, win.x + 1, win.y + 1, win.w - 2, win.h - 2, 15, win.bg, ' ')
  art.slice(0, win.h - 4).forEach((line, index) => {
    drawText(buffer, win.x + 2, win.y + 2 + index, line.slice(0, win.w - 4), index === art.length - 1 ? 14 : 15, win.bg, win.w - 4)
  })
}

const renderClock = (buffer, win) => {
  const now = new Date()
  const time = now.toLocaleTimeString('en-GB', { hour12: false })
  fillRect(buffer, win.x + 1, win.y + 1, win.w - 2, win.h - 2, 15, win.bg, ' ')
  drawText(buffer, win.x + 2, win.y + 1, `TIME ${time}`, 14, win.bg, win.w - 4)
}

const renderWindowContent = (buffer, win, state, runtime) => {
  if (win.shaded || win.minimized) return
  if (win.type === WINDOW_TERM) renderTerminal(buffer, win, state, runtime.input, runtime.cursorOn, runtime.activeWindowId === win.id)
  else if (win.type === WINDOW_FILES) renderFiles(buffer, win, state)
  else if (win.type === WINDOW_HELP) renderHelp(buffer, win)
  else if (win.type === WINDOW_ABOUT) renderAbout(buffer, win, state)
  else if (win.type === WINDOW_PALETTE) renderPalette(buffer, win, state)
  else if (win.type === WINDOW_EDITOR) renderEditor(buffer, win, state, runtime.cursorOn, runtime.activeWindowId === win.id)
  else if (win.type === WINDOW_TASKS) renderTasks(buffer, win, state)
  else if (win.type === WINDOW_SYSTEM) renderSystem(buffer, win, state, runtime.userCount)
  else if (win.type === WINDOW_SNAKE) renderSnake(buffer, win, state)
  else if (win.type === WINDOW_LOG) renderLog(buffer, win, state)
  else if (win.type === WINDOW_ART) renderArt(buffer, win)
  else if (win.type === WINDOW_CLOCK) renderClock(buffer, win)
}

const renderScreen = (ctx, palette, state, runtime) => {
  const buffer = createBuffer()
  paintDesktop(buffer, state, runtime)
  sortByZ(state.windows).forEach((win) => {
    drawWindowChrome(buffer, win, runtime.activeWindowId === win.id)
    renderWindowContent(buffer, win, state, runtime)
  })
  if (runtime.focused) drawText(buffer, COLS - 16, 0, '[FOCUS LOCKED]', 14, MENU_BG, 14)
  const pointerCell = state.focusLock ? '\u25a0' : '\u25a1'
  setCell(buffer, clamp(state.pointer.x, 0, COLS - 1), clamp(state.pointer.y, 1, ROWS - 2), pointerCell, 12, 15)
  ctx.textBaseline = 'top'
  ctx.font = `${FONT_SIZE}px ${FONT_STACK}`
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const cell = buffer[row][col]
      const x = col * CHAR_W
      const y = row * CHAR_H
      ctx.fillStyle = palette[cell.bg]
      ctx.fillRect(x, y, CHAR_W, CHAR_H)
      ctx.fillStyle = palette[cell.fg]
      ctx.fillText(cell.char, x, y)
    }
  }
}

const getWindowAt = (state, x, y) => {
  const wins = sortByZ(state.windows).reverse()
  return wins.find((win) => {
    if (win.minimized) return false
    const height = win.shaded ? 3 : win.h
    return x >= win.x && y >= win.y && x < win.x + win.w && y < win.y + height
  }) || null
}

const getChromeHit = (win, x, y) => {
  if (!win) return null
  if (y === win.y) {
    if (x >= win.x + win.w - 15 && x <= win.x + win.w - 13 && win.closable) return 'close'
    if (x >= win.x + win.w - 12 && x <= win.x + win.w - 10) return 'minimize'
    if (x >= win.x + win.w - 8 && x <= win.x + win.w - 6) return 'shade'
    if (x >= win.x + win.w - 5 && x <= win.x + win.w - 3 && win.resizable) return 'maximize'
    return 'title'
  }
  if (!win.shaded && win.resizable && x === win.x + win.w - 1 && y === win.y + win.h - 1) return 'resize'
  return 'body'
}

const moveSelection = (state, delta) => {
  const entries = listDirectory(state.fs, state.fileCursor.path)
  const selectedIndex = clamp(state.fileCursor.selectedIndex + delta, 0, Math.max(0, entries.length - 1))
  const viewH = 11
  let scroll = state.fileCursor.scroll
  if (selectedIndex < scroll) scroll = selectedIndex
  if (selectedIndex >= scroll + viewH) scroll = selectedIndex - viewH + 1
  return {
    ...state,
    fileCursor: {
      ...state.fileCursor,
      selectedIndex,
      scroll,
    },
  }
}

const openSelectedFileEntry = (state) => {
  const entries = listDirectory(state.fs, state.fileCursor.path)
  const entry = entries[state.fileCursor.selectedIndex]
  if (!entry) return withTerminal(state, 'NO FILE SELECTED.', 12)
  if (entry.type === 'dir') {
    return {
      ...state,
      cwd: entry.path,
      fileCursor: { path: entry.path, selectedIndex: 0, scroll: 0 },
      terminalLines: pushLines(state.terminalLines, [createLine(`OPEN DIR ${entry.path}`, 10)], MAX_TERMINAL_LINES),
    }
  }
  return {
    ...focusOrCreateWindow({
      ...state,
      editor: makeEditorForPath(state.fs, entry.path),
    }, WINDOW_EDITOR),
    terminalLines: pushLines(state.terminalLines, [createLine(`OPEN FILE ${entry.path}`, 10)], MAX_TERMINAL_LINES),
  }
}

const navigateFileUp = (state) => {
  const segments = pathSegments(state.fileCursor.path)
  if (!segments.length) return state
  const path = `/${segments.slice(0, -1).join('/')}` || '/'
  return {
    ...state,
    cwd: path,
    fileCursor: {
      path,
      selectedIndex: 0,
      scroll: 0,
    },
  }
}

const cycleActiveWindow = (state) => {
  const ordered = sortByZ(state.windows)
  if (!ordered.length) return state
  const currentIndex = ordered.findIndex((win) => win.id === state.activeWindowId)
  const next = ordered[(currentIndex + 1 + ordered.length) % ordered.length]
  return next ? setActiveWindow(state, next.id) : state
}

const insertEditorChar = (state, char) => {
  if (!state.windows.some((win) => win.id === state.activeWindowId && win.type === WINDOW_EDITOR)) return state
  const lineIndex = clamp(state.editor.cursor.y, 0, state.editor.lines.length - 1)
  const line = state.editor.lines[lineIndex] || ''
  const x = clamp(state.editor.cursor.x, 0, line.length)
  const nextLine = `${line.slice(0, x)}${char}${line.slice(x)}`
  const lines = state.editor.lines.map((value, index) => (index === lineIndex ? nextLine : value))
  return {
    ...state,
    editor: {
      ...state.editor,
      lines,
      cursor: { x: x + 1, y: lineIndex },
      dirty: true,
    },
  }
}

const backspaceEditor = (state) => {
  if (!state.windows.some((win) => win.id === state.activeWindowId && win.type === WINDOW_EDITOR)) return state
  const lineIndex = clamp(state.editor.cursor.y, 0, state.editor.lines.length - 1)
  const line = state.editor.lines[lineIndex] || ''
  if (state.editor.cursor.x > 0) {
    const x = state.editor.cursor.x
    const nextLine = `${line.slice(0, x - 1)}${line.slice(x)}`
    const lines = state.editor.lines.map((value, index) => (index === lineIndex ? nextLine : value))
    return {
      ...state,
      editor: {
        ...state.editor,
        lines,
        cursor: { x: x - 1, y: lineIndex },
        dirty: true,
      },
    }
  }
  if (lineIndex > 0) {
    const prev = state.editor.lines[lineIndex - 1]
    const merged = `${prev}${line}`
    const lines = state.editor.lines.filter((_, index) => index !== lineIndex && index !== lineIndex - 1)
    lines.splice(lineIndex - 1, 0, merged)
    return {
      ...state,
      editor: {
        ...state.editor,
        lines,
        cursor: { x: prev.length, y: lineIndex - 1 },
        dirty: true,
      },
    }
  }
  return state
}

const newlineEditor = (state) => {
  if (!state.windows.some((win) => win.id === state.activeWindowId && win.type === WINDOW_EDITOR)) return state
  const lineIndex = clamp(state.editor.cursor.y, 0, state.editor.lines.length - 1)
  const line = state.editor.lines[lineIndex] || ''
  const x = clamp(state.editor.cursor.x, 0, line.length)
  const before = line.slice(0, x)
  const after = line.slice(x)
  const lines = [...state.editor.lines]
  lines.splice(lineIndex, 1, before, after)
  return {
    ...state,
    editor: {
      ...state.editor,
      lines: lines.slice(0, MAX_EDITOR_LINES),
      cursor: { x: 0, y: lineIndex + 1 },
      dirty: true,
    },
  }
}

const moveEditorCursor = (state, dx, dy) => {
  const y = clamp(state.editor.cursor.y + dy, 0, Math.max(0, state.editor.lines.length - 1))
  const line = state.editor.lines[y] || ''
  const x = clamp(state.editor.cursor.x + dx, 0, line.length)
  let scroll = state.editor.scroll
  const view = 10
  if (y < scroll) scroll = y
  if (y >= scroll + view) scroll = y - view + 1
  return {
    ...state,
    editor: {
      ...state.editor,
      cursor: { x, y },
      scroll,
    },
  }
}

const applyMenuAction = (state, action) => {
  let next = { ...state, menuFocus: null }
  if (action === 'NEW') {
    const path = normalizePath(`NEWFILE${Date.now().toString(36).slice(-3)}.TXT`, state.cwd)
    const fs = writeFileLines(next.fs, path, [''])
    if (fs) {
      next.fs = fs
      next.editor = makeEditorForPath(fs, path)
      next = focusOrCreateWindow(next, WINDOW_EDITOR)
    }
    return next
  }
  if (action === 'OPEN FILES') return focusOrCreateWindow(next, WINDOW_FILES)
  if (action === 'OPEN EDITOR') return focusOrCreateWindow(next, WINDOW_EDITOR)
  if (action === 'SAVE BUFFER') {
    const fs = writeFileLines(next.fs, next.editor.path, next.editor.lines)
    if (fs) next = withLog({ ...next, fs, editor: { ...next.editor, dirty: false } }, `[editor] saved buffer ${next.editor.path}`, 10)
    return next
  }
  if (action === 'REBOOT') return { ...createDefaultState(), bootCount: state.bootCount + 1 }
  if (action === 'NEXT WINDOW') return cycleActiveWindow(next)
  if (action === 'MINIMIZE' && next.activeWindowId) return toggleMinimize(next, next.activeWindowId)
  if (action === 'MAXIMIZE' && next.activeWindowId) return toggleMaximize(next, next.activeWindowId)
  if (action === 'CLOSE WINDOW' && next.activeWindowId) return closeWindow(next, next.activeWindowId)
  if (action === 'ROTATE THEME') return cyclePalette(next)
  if (action === 'CLASSIC') return { ...next, paletteIndex: 0 }
  if (action === 'NIGHT BUS') return { ...next, paletteIndex: 1 }
  if (action === 'SUNSET DISK') return { ...next, paletteIndex: 2 }
  if (action === 'HELP') return focusOrCreateWindow(next, WINDOW_HELP)
  if (action === 'ABOUT' || action === 'DISCLAIMER') return focusOrCreateWindow(next, WINDOW_ABOUT)
  const app = resolveAppAlias(action)
  return app ? focusOrCreateWindow(next, app) : next
}

const TempleVoltActivity = ({ sdk, currentUser, participants }) => {
  const me = useMemo(() => sanitizePlayer(currentUser), [currentUser])
  const userCount = Array.isArray(participants) ? participants.length : 1
  const canvasRef = useRef(null)
  const hostRef = useRef(null)
  const stateRef = useRef(createDefaultState())
  const cursorBlinkRef = useRef(true)
  const interactionRef = useRef(null)
  const [shellState, setShellState] = useState(() => createDefaultState())
  const [input, setInput] = useState('')
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    stateRef.current = shellState
  }, [shellState])

  const syncState = useCallback((nextState, cue = 'selection_change') => {
    const normalized = { ...nextState, updatedAt: Date.now() }
    stateRef.current = normalized
    setShellState(normalized)
    sdk?.updateState?.({ templeVolt: normalized }, { serverRelay: true, cue })
  }, [sdk])

  useEffect(() => {
    if (!sdk) return undefined
    const offState = sdk.subscribeServerState?.((state) => {
      const incoming = normalizeState(state?.templeVolt)
      stateRef.current = incoming
      setShellState(incoming)
    })
    return () => {
      try { offState?.() } catch {}
    }
  }, [sdk])

  useEffect(() => {
    const blink = setInterval(() => {
      cursorBlinkRef.current = !cursorBlinkRef.current
    }, CURSOR_BLINK_MS)
    const tick = setInterval(() => {
      setShellState((current) => {
        const next = {
          ...current,
          wallpaperTick: current.wallpaperTick + WALLPAPER_TICK_STEP,
          snake: current.windows.some((win) => win.type === WINDOW_SNAKE) ? tickSnake(current.snake) : current.snake,
        }
        stateRef.current = next
        return next
      })
    }, CLOCK_TICK_MS)
    return () => {
      clearInterval(blink)
      clearInterval(tick)
    }
  }, [])

  useEffect(() => {
    let raf = 0
    const draw = () => {
      const canvas = canvasRef.current
      if (!canvas) {
        raf = requestAnimationFrame(draw)
        return
      }
      const ctx = canvas.getContext('2d')
      const palette = PALETTES[shellState.paletteIndex].colors
      renderScreen(ctx, palette, shellState, {
        input,
        focused,
        cursorOn: cursorBlinkRef.current,
        activeWindowId: shellState.activeWindowId,
        userCount,
        statusText: `${me.username.toUpperCase()} ${shellState.cwd}`,
      })
      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [focused, input, me.username, shellState, userCount])

  const submitCommand = useCallback(() => {
    const { state } = executeCommand(input, me.username, stateRef.current)
    syncState(state, 'button_click')
    setInput('')
  }, [input, me.username, syncState])

  const eventToCell = useCallback((event) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const x = Math.floor(((event.clientX - rect.left) / rect.width) * COLS)
    const y = Math.floor(((event.clientY - rect.top) / rect.height) * ROWS)
    return {
      x: clamp(x, 0, COLS - 1),
      y: clamp(y, 0, ROWS - 1),
    }
  }, [])

  const commitShellState = useCallback((updater, cue = 'selection_change') => {
    const computed = typeof updater === 'function' ? updater(stateRef.current) : updater
    syncState(computed, cue)
  }, [syncState])

  const handleWindowBodyPointer = useCallback((state, win) => {
    if (win.type === WINDOW_FILES) {
      return setActiveWindow(state, win.id)
    }
    return setActiveWindow(state, win.id)
  }, [])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (!focused || shouldIgnoreActivityHotkey(event)) return
      const current = stateRef.current
      const active = current.windows.find((win) => win.id === current.activeWindowId) || null

      if (event.key === 'Escape') {
        event.preventDefault()
        setFocused(false)
        commitShellState({ ...current, focusLock: false }, 'selection_change')
        hostRef.current?.blur()
        return
      }

      if (event.key === 'F5') {
        event.preventDefault()
        commitShellState(cyclePalette(current), 'selection_change')
        return
      }

      if (event.key === 'Tab') {
        event.preventDefault()
        commitShellState(cycleActiveWindow(current), 'selection_change')
        return
      }

      if (current.activeWindowId && !current.windows.some((win) => win.id === current.activeWindowId)) {
        commitShellState({ ...current, activeWindowId: null }, 'selection_change')
        return
      }

      if (active?.type === WINDOW_EDITOR) {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
          event.preventDefault()
          const fs = writeFileLines(current.fs, current.editor.path, current.editor.lines)
          if (!fs) return
          commitShellState(withLog({ ...current, fs, editor: { ...current.editor, dirty: false } }, `[editor] saved buffer ${current.editor.path}`, 10), 'button_click')
          return
        }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'l') {
          event.preventDefault()
          commitShellState({ ...current, editor: makeEditorForPath(current.fs, current.editor.path) }, 'button_click')
          return
        }
        if (event.key === 'Enter') {
          event.preventDefault()
          commitShellState(newlineEditor(current), 'selection_change')
          return
        }
        if (event.key === 'Backspace') {
          event.preventDefault()
          commitShellState(backspaceEditor(current), 'selection_change')
          return
        }
        if (event.key === 'ArrowLeft') {
          event.preventDefault()
          commitShellState(moveEditorCursor(current, -1, 0), 'selection_change')
          return
        }
        if (event.key === 'ArrowRight') {
          event.preventDefault()
          commitShellState(moveEditorCursor(current, 1, 0), 'selection_change')
          return
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault()
          commitShellState(moveEditorCursor(current, 0, -1), 'selection_change')
          return
        }
        if (event.key === 'ArrowDown') {
          event.preventDefault()
          commitShellState(moveEditorCursor(current, 0, 1), 'selection_change')
          return
        }
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          event.preventDefault()
          commitShellState(insertEditorChar(current, event.key), 'selection_change')
          return
        }
      }

      if (active?.type === WINDOW_TERM) {
        if (event.key === 'ArrowUp') {
          event.preventDefault()
          const nextIndex = current.historyIndex < 0 ? current.commandHistory.length - 1 : Math.max(0, current.historyIndex - 1)
          setInput(current.commandHistory[nextIndex] || '')
          commitShellState({ ...current, historyIndex: nextIndex }, 'selection_change')
          return
        }
        if (event.key === 'ArrowDown') {
          event.preventDefault()
          const nextIndex = current.historyIndex + 1
          if (nextIndex >= current.commandHistory.length) {
            setInput('')
            commitShellState({ ...current, historyIndex: -1 }, 'selection_change')
          } else {
            setInput(current.commandHistory[nextIndex] || '')
            commitShellState({ ...current, historyIndex: nextIndex }, 'selection_change')
          }
          return
        }
      }

      if (active?.type === WINDOW_FILES) {
        if (event.key === 'ArrowUp') {
          event.preventDefault()
          commitShellState(moveSelection(current, -1), 'selection_change')
          return
        }
        if (event.key === 'ArrowDown') {
          event.preventDefault()
          commitShellState(moveSelection(current, 1), 'selection_change')
          return
        }
        if (event.key === 'Enter') {
          event.preventDefault()
          commitShellState(openSelectedFileEntry(current), 'button_click')
          return
        }
        if (event.key === 'Backspace') {
          event.preventDefault()
          commitShellState(navigateFileUp(current), 'selection_change')
          return
        }
      }

      if (active?.type === WINDOW_SNAKE && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
        event.preventDefault()
        const map = { ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT' }
        commitShellState({ ...current, snake: { ...current.snake, dir: map[event.key] } }, 'selection_change')
        return
      }

      if (event.key === 'Enter') {
        event.preventDefault()
        submitCommand()
        return
      }
      if (event.key === 'Backspace') {
        event.preventDefault()
        setInput((value) => value.slice(0, -1))
        return
      }
      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault()
        setInput((value) => `${value}${event.key}`)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [commitShellState, focused, submitCommand])

  const onPointerDown = useCallback((event) => {
    hostRef.current?.focus()
    setFocused(true)
    const cell = eventToCell(event)
    if (!cell) return
    const base = { ...stateRef.current, pointer: cell, focusLock: true }
    if (cell.y === 0) {
      const menu = menuItemAt(cell.x)
      commitShellState({ ...base, menuFocus: menu }, 'selection_change')
      return
    }
    if (cell.y === ROWS - 1) {
      const minimized = sortByZ(base.windows).filter((win) => win.minimized)
      let taskX = 1
      for (const win of minimized) {
        const label = `<${win.title.slice(0, 10)}>`
        if (cell.x >= taskX && cell.x < taskX + label.length) {
          commitShellState(setActiveWindow(toggleMinimize(base, win.id), win.id), 'button_click')
          return
        }
        taskX += label.length + 1
      }
    }
    if (base.menuFocus && cell.y > 0) {
      let menuX = 1
      for (const item of MENU_ITEMS) {
        if (item === base.menuFocus) break
        menuX += item.length + 3
      }
      const actions = MENU_ACTIONS[base.menuFocus] || []
      const menuW = Math.min(24, Math.max(...actions.map((action) => action.length)) + 4)
      if (cell.x >= menuX - 1 && cell.x < menuX - 1 + menuW && cell.y >= 2 && cell.y < 2 + actions.length) {
        const action = actions[cell.y - 2]
        commitShellState(applyMenuAction(base, action), 'button_click')
        return
      }
      if (!menuItemAt(cell.x)) {
        commitShellState({ ...base, menuFocus: null }, 'selection_change')
      }
    }
    const win = getWindowAt(base, cell.x, cell.y)
    if (!win) {
      commitShellState(base, 'selection_change')
      return
    }
    let next = setActiveWindow(base, win.id)
    const hit = getChromeHit(win, cell.x, cell.y)
    if (hit === 'close') {
      commitShellState(withLog(closeWindow(next, win.id), `[wm] close ${win.type}`, 12), 'button_click')
      return
    }
    if (hit === 'minimize') {
      commitShellState(withLog(toggleMinimize(next, win.id), `[wm] minimize ${win.type}`, 8), 'button_click')
      return
    }
    if (hit === 'shade') {
      commitShellState(withLog(toggleShade(next, win.id), `[wm] shade ${win.type}`, 8), 'button_click')
      return
    }
    if (hit === 'maximize') {
      commitShellState(withLog(toggleMaximize(next, win.id), `[wm] maximize ${win.type}`, 8), 'button_click')
      return
    }
    if (hit === 'title') {
      interactionRef.current = {
        type: 'drag',
        id: win.id,
        dx: cell.x - win.x,
        dy: cell.y - win.y,
      }
      commitShellState(next, 'selection_change')
      return
    }
    if (hit === 'resize') {
      interactionRef.current = {
        type: 'resize',
        id: win.id,
        startX: cell.x,
        startY: cell.y,
        startW: win.w,
        startH: win.h,
      }
      commitShellState(next, 'selection_change')
      return
    }
    next = handleWindowBodyPointer(next, win)
    commitShellState(next, 'selection_change')
  }, [commitShellState, eventToCell, handleWindowBodyPointer])

  const onPointerMove = useCallback((event) => {
    const cell = eventToCell(event)
    if (!cell) return
    const current = stateRef.current
    if (!interactionRef.current) {
      setShellState((value) => ({ ...value, pointer: cell }))
      stateRef.current = { ...current, pointer: cell }
      return
    }
    const interaction = interactionRef.current
    if (interaction.type === 'drag') {
      setShellState((prev) => {
        const next = {
          ...prev,
          pointer: cell,
          windows: prev.windows.map((win) => {
            if (win.id !== interaction.id || win.maximized) return win
            return {
              ...win,
              x: clamp(cell.x - interaction.dx, 0, COLS - win.w),
              y: clamp(cell.y - interaction.dy, 1, ROWS - (win.shaded ? 3 : win.h) - 1),
            }
          }),
        }
        stateRef.current = next
        return next
      })
      return
    }
    if (interaction.type === 'resize') {
      setShellState((prev) => {
        const next = {
          ...prev,
          pointer: cell,
          windows: prev.windows.map((win) => {
            if (win.id !== interaction.id || !win.resizable || win.maximized) return win
            const w = clamp(interaction.startW + (cell.x - interaction.startX), win.minW, COLS - win.x)
            const h = clamp(interaction.startH + (cell.y - interaction.startY), win.minH, ROWS - win.y - 1)
            return { ...win, w, h }
          }),
        }
        stateRef.current = next
        return next
      })
    }
  }, [eventToCell])

  const onPointerUp = useCallback(() => {
    if (!interactionRef.current) return
    interactionRef.current = null
    commitShellState(stateRef.current, 'move_valid')
  }, [commitShellState])

  return (
    <GameCanvasShell
      title="TempleVolt"
      subtitle="Canvas Terminal"
      status="Keyboard-driven desktop chaos rendered into one big interactive canvas."
      skin="noir"
      musicProfile="noir"
      header={false}
      layout="stretch"
      contentStyle={{ padding: 12, boxSizing: 'border-box' }}
    >
      <div
        ref={hostRef}
        tabIndex={0}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{
          width: '100%',
          height: '100%',
          display: 'grid',
          placeItems: 'center',
          outline: 'none',
          cursor: focused ? 'none' : 'default',
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'grid',
            placeItems: 'center',
            borderRadius: 16,
            overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.18)',
            boxShadow: '0 24px 60px rgba(0,0,0,0.32)',
            background: '#000',
          }}
        >
          <canvas
            ref={canvasRef}
            width={WIDTH}
            height={HEIGHT}
            style={{
              width: '100%',
              height: '100%',
              display: 'block',
              imageRendering: 'pixelated',
            }}
          />
        </div>
      </div>
    </GameCanvasShell>
  )
}

export default TempleVoltActivity
