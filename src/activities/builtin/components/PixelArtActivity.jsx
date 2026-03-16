import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */
const W = 32
const H = 24
const DEFAULT_COLOR = '#ffffff'

const COLORS = [
  /* grays   */ '#111827', '#374151', '#6b7280', '#9ca3af', '#d1d5db', '#f3f4f6',
  /* reds    */ '#ef4444', '#dc2626', '#b91c1c',
  /* oranges */ '#f97316', '#ea580c',
  /* ambers  */ '#f59e0b', '#d97706',
  /* yellows */ '#eab308', '#ca8a04',
  /* limes   */ '#84cc16', '#65a30d',
  /* greens  */ '#22c55e', '#16a34a',
  /* teals   */ '#14b8a6', '#0d9488',
  /* cyans   */ '#06b6d4', '#0891b2',
  /* blues   */ '#0ea5e9', '#3b82f6', '#2563eb',
  /* indigos */ '#6366f1', '#4f46e5',
  /* violets */ '#8b5cf6', '#7c3aed',
  /* purples */ '#a855f7', '#9333ea',
  /* pinks   */ '#d946ef', '#ec4899', '#f43f5e',
]

const TOOLS = {
  PEN: 'pen',
  ERASER: 'eraser',
  FILL: 'fill',
  EYEDROPPER: 'eyedropper',
}

const MAX_UNDO = 80
const SYNC_DEBOUNCE_MS = 120
const HISTORY_SNAPSHOT_INTERVAL = 8

/* ------------------------------------------------------------------ */
/*  SVG icons for tools (inline, no emoji)                             */
/* ------------------------------------------------------------------ */
const IconPen = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
  </svg>
)

const IconEraser = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 20H7L3 16a1 1 0 0 1 0-1.41l9.59-9.59a2 2 0 0 1 2.82 0L20.83 10.41a2 2 0 0 1 0 2.82L13 21" />
    <line x1="18" y1="13" x2="9" y2="4" />
    <line x1="2" y1="22" x2="22" y2="22" />
  </svg>
)

const IconFill = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2.5 2.5l19 19" />
    <path d="M12 2v6.5L7.5 13 2 18.5" />
    <path d="M19 13.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7z" />
  </svg>
)

const IconEyedropper = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 22l1-1h3l9-9" />
    <path d="M3 21v-3l9-9" />
    <path d="M15 6l3-3a2.12 2.12 0 0 1 3 3l-3 3" />
    <path d="M12 9l3 3" />
  </svg>
)

const IconUndo = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="1 4 1 10 7 10" />
    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
  </svg>
)

const IconRedo = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10" />
    <path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10" />
  </svg>
)

const IconGrid = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <line x1="3" y1="9" x2="21" y2="9" />
    <line x1="3" y1="15" x2="21" y2="15" />
    <line x1="9" y1="3" x2="9" y2="21" />
    <line x1="15" y1="3" x2="15" y2="21" />
  </svg>
)

const IconExport = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
)

const IconTrash = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </svg>
)

const IconHistory = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
)

/* ------------------------------------------------------------------ */
/*  Grid helpers                                                       */
/* ------------------------------------------------------------------ */
const makeGrid = () => Array.from({ length: H }, () => Array.from({ length: W }, () => DEFAULT_COLOR))

const isValidCoord = (x, y) =>
  Number.isInteger(x) && Number.isInteger(y) && x >= 0 && x < W && y >= 0 && y < H

const sanitizeColor = (value, fallback = DEFAULT_COLOR) =>
  typeof value === 'string' && value.length > 0 && value.length < 64 ? value : fallback

const sanitizeGrid = (value) => {
  if (!Array.isArray(value)) return makeGrid()
  const next = makeGrid()
  for (let y = 0; y < H; y += 1) {
    const row = Array.isArray(value[y]) ? value[y] : []
    for (let x = 0; x < W; x += 1) {
      next[y][x] = sanitizeColor(row[x], DEFAULT_COLOR)
    }
  }
  return next
}

const cloneGrid = (grid) => grid.map((row) => [...row])

const gridsEqual = (a, b) => {
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      if (a[y][x] !== b[y][x]) return false
    }
  }
  return true
}

const fillGrid = (grid, startX, startY, targetColor, nextColor) => {
  if (!isValidCoord(startX, startY) || targetColor === nextColor) return grid
  const next = cloneGrid(grid)
  const stack = [[startX, startY]]
  const seen = new Set()

  while (stack.length > 0) {
    const [x, y] = stack.pop()
    const key = (y << 8) | x
    if (seen.has(key) || !isValidCoord(x, y) || next[y][x] !== targetColor) continue
    seen.add(key)
    next[y][x] = nextColor
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1])
  }

  return next
}

/* ------------------------------------------------------------------ */
/*  Canvas-based grid renderer                                         */
/* ------------------------------------------------------------------ */
const drawGrid = (ctx, grid, cellSize, showGridOverlay) => {
  const w = W * cellSize
  const h = H * cellSize

  ctx.clearRect(0, 0, w, h)

  /* draw checkerboard background for "transparent" (white) pixels */
  const cSize = Math.max(4, cellSize >> 1)
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      if (grid[y][x] === DEFAULT_COLOR) {
        const px = x * cellSize
        const py = y * cellSize
        ctx.fillStyle = '#e5e7eb'
        ctx.fillRect(px, py, cellSize, cellSize)
        ctx.fillStyle = '#f3f4f6'
        ctx.fillRect(px, py, cSize, cSize)
        ctx.fillRect(px + cSize, py + cSize, cSize, cSize)
      }
    }
  }

  /* draw filled pixels, batching by color */
  const buckets = new Map()
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const c = grid[y][x]
      if (c === DEFAULT_COLOR) continue
      if (!buckets.has(c)) buckets.set(c, [])
      buckets.get(c).push(x, y)
    }
  }
  for (const [color, coords] of buckets) {
    ctx.fillStyle = color
    for (let i = 0; i < coords.length; i += 2) {
      ctx.fillRect(coords[i] * cellSize, coords[i + 1] * cellSize, cellSize, cellSize)
    }
  }

  /* grid lines */
  if (showGridOverlay) {
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let x = 0; x <= W; x += 1) {
      const px = x * cellSize + 0.5
      ctx.moveTo(px, 0)
      ctx.lineTo(px, h)
    }
    for (let y = 0; y <= H; y += 1) {
      const py = y * cellSize + 0.5
      ctx.moveTo(0, py)
      ctx.lineTo(w, py)
    }
    ctx.stroke()
  }
}

const drawHover = (ctx, x, y, cellSize, tool, color) => {
  const px = x * cellSize
  const py = y * cellSize

  ctx.save()
  if (tool === TOOLS.ERASER) {
    ctx.strokeStyle = 'rgba(239,68,68,0.8)'
    ctx.lineWidth = 2
    ctx.setLineDash([3, 3])
    ctx.strokeRect(px + 1, py + 1, cellSize - 2, cellSize - 2)
  } else if (tool === TOOLS.EYEDROPPER) {
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.lineWidth = 2
    ctx.strokeRect(px + 1, py + 1, cellSize - 2, cellSize - 2)
  } else {
    ctx.fillStyle = tool === TOOLS.FILL ? color : color
    ctx.globalAlpha = 0.45
    ctx.fillRect(px, py, cellSize, cellSize)
    ctx.globalAlpha = 1
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'
    ctx.lineWidth = 1.5
    ctx.strokeRect(px + 0.5, py + 0.5, cellSize - 1, cellSize - 1)
  }
  ctx.restore()
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
const PixelArtActivity = ({ sdk }) => {
  const [color, setColor] = useState(COLORS[0])
  const [tool, setTool] = useState(TOOLS.PEN)
  const [zoom, setZoom] = useState(18)
  const [showGrid, setShowGrid] = useState(true)
  const [showHistory, setShowHistory] = useState(false)

  /* grid state held in a ref for perf; we use a render counter to trigger repaints */
  const gridRef = useRef(makeGrid())
  const [, setRenderTick] = useState(0)
  const forceRender = useCallback(() => setRenderTick((n) => n + 1), [])

  /* undo/redo stacks */
  const undoStackRef = useRef([])
  const redoStackRef = useRef([])

  /* history timeline snapshots */
  const historyRef = useRef([]) // { grid, ts }[]
  const changeCounterRef = useRef(0)

  const pushUndo = useCallback((grid) => {
    undoStackRef.current.push(cloneGrid(grid))
    if (undoStackRef.current.length > MAX_UNDO) undoStackRef.current.shift()
    redoStackRef.current = []
  }, [])

  /* ---- canvas refs ---- */
  const canvasRef = useRef(null)
  const overlayCanvasRef = useRef(null)
  const hoverRef = useRef({ x: -1, y: -1 })
  const isPointerDownRef = useRef(false)
  const lastPaintRef = useRef({ x: -1, y: -1, color: '' })
  const rafIdRef = useRef(0)

  /* ---- sync debounce ---- */
  const syncTimerRef = useRef(null)
  const pendingSyncRef = useRef(false)

  /* ---- mounted guard ---- */
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  /* ---- computed ---- */
  const canvasW = W * zoom
  const canvasH = H * zoom

  /* count filled pixels for display */
  const filledCount = useMemo(() => {
    const g = gridRef.current
    let n = 0
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g[y][x] !== DEFAULT_COLOR) n++
    return n
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridRef.current])

  /* ---------------------------------------------------------------- */
  /*  Rendering                                                        */
  /* ---------------------------------------------------------------- */
  const repaint = useCallback(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    drawGrid(ctx, gridRef.current, zoom, showGrid)
  }, [zoom, showGrid])

  const repaintOverlay = useCallback(() => {
    const ctx = overlayCanvasRef.current?.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvasW, canvasH)
    const { x, y } = hoverRef.current
    if (isValidCoord(x, y)) {
      drawHover(ctx, x, y, zoom, tool, color)
    }
  }, [canvasW, canvasH, zoom, tool, color])

  /* schedule a repaint via rAF to avoid redundant paints */
  const scheduleRepaint = useCallback(() => {
    cancelAnimationFrame(rafIdRef.current)
    rafIdRef.current = requestAnimationFrame(() => {
      repaint()
      repaintOverlay()
    })
  }, [repaint, repaintOverlay])

  useEffect(() => {
    scheduleRepaint()
    return () => cancelAnimationFrame(rafIdRef.current)
  }, [scheduleRepaint])

  /* ---------------------------------------------------------------- */
  /*  Sync helpers                                                     */
  /* ---------------------------------------------------------------- */
  const syncGridToRemote = useCallback((nextGrid, cue = 'button_click') => {
    if (!sdk) return
    sdk.emitEvent('pixel:replace-grid', { grid: nextGrid }, { serverRelay: true, cue })
    sdk.updateState({ pixel: { grid: nextGrid } }, { serverRelay: true })
  }, [sdk])

  /* debounced sync: coalesces rapid pixel-level changes into a single grid sync */
  const debouncedSync = useCallback(() => {
    pendingSyncRef.current = true
    if (syncTimerRef.current) return
    syncTimerRef.current = setTimeout(() => {
      syncTimerRef.current = null
      if (pendingSyncRef.current && mountedRef.current) {
        pendingSyncRef.current = false
        syncGridToRemote(gridRef.current, 'score_update')
      }
    }, SYNC_DEBOUNCE_MS)
  }, [syncGridToRemote])

  /* record a history snapshot periodically */
  const maybeSnapshot = useCallback(() => {
    changeCounterRef.current += 1
    if (changeCounterRef.current % HISTORY_SNAPSHOT_INTERVAL === 0) {
      historyRef.current = [
        ...historyRef.current,
        { grid: cloneGrid(gridRef.current), ts: Date.now() },
      ]
      /* keep last ~50 snapshots */
      if (historyRef.current.length > 50) historyRef.current = historyRef.current.slice(-50)
    }
  }, [])

  /* apply a single pixel locally + schedule remote sync */
  const setPixel = useCallback((x, y, nextColor) => {
    if (!isValidCoord(x, y)) return
    const safeColor = sanitizeColor(nextColor)
    const prev = gridRef.current
    if (prev[y][x] === safeColor) return
    if (lastPaintRef.current.x === x && lastPaintRef.current.y === y && lastPaintRef.current.color === safeColor) return

    gridRef.current[y][x] = safeColor
    lastPaintRef.current = { x, y, color: safeColor }

    /* emit individual pixel for fast remote updates */
    if (sdk) {
      sdk.emitEvent('pixel:set', { x, y, color: safeColor }, { serverRelay: true, cue: 'score_update' })
    }
    debouncedSync()
    maybeSnapshot()
    scheduleRepaint()
    forceRender()
  }, [sdk, debouncedSync, maybeSnapshot, scheduleRepaint, forceRender])

  /* ---------------------------------------------------------------- */
  /*  Tool application                                                 */
  /* ---------------------------------------------------------------- */
  const applyTool = useCallback((x, y) => {
    if (!isValidCoord(x, y)) return

    if (tool === TOOLS.EYEDROPPER) {
      setColor(gridRef.current[y][x] || DEFAULT_COLOR)
      setTool(TOOLS.PEN)
      return
    }

    if (tool === TOOLS.FILL) {
      const targetColor = gridRef.current[y][x]
      const nextColor = color
      if (targetColor === nextColor) return
      pushUndo(gridRef.current)
      const nextGrid = fillGrid(gridRef.current, x, y, targetColor, nextColor)
      gridRef.current = nextGrid
      syncGridToRemote(nextGrid, 'round_start')
      maybeSnapshot()
      scheduleRepaint()
      forceRender()
      return
    }

    setPixel(x, y, tool === TOOLS.ERASER ? DEFAULT_COLOR : color)
  }, [tool, color, setPixel, syncGridToRemote, pushUndo, maybeSnapshot, scheduleRepaint, forceRender])

  /* ---------------------------------------------------------------- */
  /*  Pointer handling on the canvas                                   */
  /* ---------------------------------------------------------------- */
  const cellFromPointerEvent = useCallback((e) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const sx = (e.clientX - rect.left) / rect.width
    const sy = (e.clientY - rect.top) / rect.height
    const cx = Math.floor(sx * W)
    const cy = Math.floor(sy * H)
    return isValidCoord(cx, cy) ? { x: cx, y: cy } : null
  }, [])

  const handlePointerDown = useCallback((e) => {
    e.preventDefault()
    const cell = cellFromPointerEvent(e)
    if (!cell) return
    isPointerDownRef.current = true
    lastPaintRef.current = { x: -1, y: -1, color: '' }

    /* push undo state before a stroke begins (pen/eraser) */
    if (tool === TOOLS.PEN || tool === TOOLS.ERASER) {
      pushUndo(gridRef.current)
    }

    applyTool(cell.x, cell.y)
  }, [cellFromPointerEvent, applyTool, pushUndo, tool])

  const handlePointerMove = useCallback((e) => {
    const cell = cellFromPointerEvent(e)
    if (!cell) {
      if (hoverRef.current.x !== -1) {
        hoverRef.current = { x: -1, y: -1 }
        repaintOverlay()
      }
      return
    }
    if (hoverRef.current.x !== cell.x || hoverRef.current.y !== cell.y) {
      hoverRef.current = cell
      repaintOverlay()
    }
    if (!isPointerDownRef.current) return
    if (tool === TOOLS.PEN || tool === TOOLS.ERASER) {
      applyTool(cell.x, cell.y)
    }
  }, [cellFromPointerEvent, applyTool, repaintOverlay, tool])

  const handlePointerUp = useCallback(() => {
    isPointerDownRef.current = false
    lastPaintRef.current = { x: -1, y: -1, color: '' }
  }, [])

  const handlePointerLeave = useCallback(() => {
    hoverRef.current = { x: -1, y: -1 }
    repaintOverlay()
  }, [repaintOverlay])

  /* global pointerup in case pointer leaves the canvas while held */
  useEffect(() => {
    const stop = () => {
      isPointerDownRef.current = false
      lastPaintRef.current = { x: -1, y: -1, color: '' }
    }
    window.addEventListener('pointerup', stop)
    return () => window.removeEventListener('pointerup', stop)
  }, [])

  /* ---------------------------------------------------------------- */
  /*  Undo / Redo                                                      */
  /* ---------------------------------------------------------------- */
  const undo = useCallback(() => {
    if (undoStackRef.current.length === 0) return
    redoStackRef.current.push(cloneGrid(gridRef.current))
    gridRef.current = undoStackRef.current.pop()
    syncGridToRemote(gridRef.current, 'button_click')
    scheduleRepaint()
    forceRender()
  }, [syncGridToRemote, scheduleRepaint, forceRender])

  const redo = useCallback(() => {
    if (redoStackRef.current.length === 0) return
    undoStackRef.current.push(cloneGrid(gridRef.current))
    gridRef.current = redoStackRef.current.pop()
    syncGridToRemote(gridRef.current, 'button_click')
    scheduleRepaint()
    forceRender()
  }, [syncGridToRemote, scheduleRepaint, forceRender])

  /* keyboard shortcuts */
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  /* ---------------------------------------------------------------- */
  /*  SDK event listeners                                              */
  /* ---------------------------------------------------------------- */
  useEffect(() => {
    if (!sdk) return undefined

    const offEvent = sdk.on('event', (evt) => {
      if (!mountedRef.current) return

      if (evt?.eventType === 'pixel:set') {
        const x = Number(evt?.payload?.x)
        const y = Number(evt?.payload?.y)
        const c = sanitizeColor(evt?.payload?.color)
        if (!isValidCoord(x, y)) return
        if (gridRef.current[y][x] === c) return
        gridRef.current[y][x] = c
        scheduleRepaint()
        forceRender()
      }

      if (evt?.eventType === 'pixel:replace-grid' && Array.isArray(evt?.payload?.grid)) {
        const incoming = sanitizeGrid(evt.payload.grid)
        if (!gridsEqual(gridRef.current, incoming)) {
          gridRef.current = incoming
          scheduleRepaint()
          forceRender()
        }
      }

      if (evt?.eventType === 'pixel:clear') {
        gridRef.current = makeGrid()
        scheduleRepaint()
        forceRender()
      }
    })

    const offState = sdk.subscribeServerState((state) => {
      if (!mountedRef.current) return
      if (Array.isArray(state?.pixel?.grid)) {
        const incoming = sanitizeGrid(state.pixel.grid)
        if (!gridsEqual(gridRef.current, incoming)) {
          gridRef.current = incoming
          scheduleRepaint()
          forceRender()
        }
      }
    })

    return () => {
      offEvent?.()
      offState?.()
    }
  }, [sdk, scheduleRepaint, forceRender])

  /* ---------------------------------------------------------------- */
  /*  Actions                                                          */
  /* ---------------------------------------------------------------- */
  const clearGrid = useCallback(() => {
    if (!sdk) return
    pushUndo(gridRef.current)
    const cleared = makeGrid()
    gridRef.current = cleared
    sdk.emitEvent('pixel:clear', {}, { serverRelay: true, cue: 'round_end' })
    sdk.updateState({ pixel: { grid: cleared } }, { serverRelay: true })
    scheduleRepaint()
    forceRender()
  }, [sdk, pushUndo, scheduleRepaint, forceRender])

  const exportGrid = useCallback(() => {
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const g = gridRef.current
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        ctx.fillStyle = g[y][x]
        ctx.fillRect(x, y, 1, 1)
      }
    }
    const link = document.createElement('a')
    link.download = `pixel-art-${Date.now()}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  }, [])

  /* restore from history */
  const restoreSnapshot = useCallback((idx) => {
    const snap = historyRef.current[idx]
    if (!snap) return
    pushUndo(gridRef.current)
    gridRef.current = cloneGrid(snap.grid)
    syncGridToRemote(gridRef.current, 'button_click')
    scheduleRepaint()
    forceRender()
  }, [pushUndo, syncGridToRemote, scheduleRepaint, forceRender])

  /* ---------------------------------------------------------------- */
  /*  Cleanup                                                          */
  /* ---------------------------------------------------------------- */
  useEffect(() => {
    return () => {
      clearTimeout(syncTimerRef.current)
      cancelAnimationFrame(rafIdRef.current)
      syncTimerRef.current = null
    }
  }, [])

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */
  const toolButtons = [
    { id: TOOLS.PEN, Icon: IconPen, label: 'Pen' },
    { id: TOOLS.ERASER, Icon: IconEraser, label: 'Eraser' },
    { id: TOOLS.FILL, Icon: IconFill, label: 'Fill' },
    { id: TOOLS.EYEDROPPER, Icon: IconEyedropper, label: 'Pick' },
  ]

  const formatTs = (ts) => {
    const d = new Date(ts)
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`
  }

  return (
    <div className="builtin-activity-body pixel-art-canvas">
      {/* -------- TOOLBAR -------- */}
      <div className="pixel-toolbar">
        {/* tools */}
        <div className="pixel-tool-group">
          {toolButtons.map(({ id, Icon, label }) => (
            <button
              key={id}
              className={`pixel-tool-btn${tool === id ? ' active' : ''}`}
              onClick={() => setTool(id)}
              title={label}
            >
              <Icon /> {label}
            </button>
          ))}
        </div>

        {/* color panel */}
        <div className="pixel-color-panel">
          <div className="pixel-selected-color">
            <div className="pixel-selected-preview" style={{ background: color }} />
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          </div>
          <div className="pixel-palette">
            {COLORS.map((c) => (
              <button
                key={c}
                className={`pixel-color${color === c ? ' active' : ''}`}
                style={{ background: c }}
                onClick={() => setColor(c)}
                title={c}
              />
            ))}
          </div>
        </div>

        {/* meta */}
        <div className="pixel-meta">
          <label>
            Zoom
            <input type="range" min={8} max={32} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
          </label>
          <span>{zoom}px &middot; {filledCount} filled</span>
        </div>

        {/* actions */}
        <div className="pixel-actions">
          <button onClick={undo} disabled={undoStackRef.current.length === 0} title="Undo (Ctrl+Z)">
            <IconUndo /> Undo
          </button>
          <button onClick={redo} disabled={redoStackRef.current.length === 0} title="Redo (Ctrl+Y)">
            <IconRedo /> Redo
          </button>
          <button onClick={() => setShowGrid((v) => !v)} className={showGrid ? 'active' : ''} title="Toggle grid overlay">
            <IconGrid /> Grid
          </button>
          <button onClick={() => setShowHistory((v) => !v)} className={showHistory ? 'active' : ''} title="History timeline">
            <IconHistory /> History
          </button>
          <button onClick={clearGrid} title="Clear canvas">
            <IconTrash /> Clear
          </button>
          <button onClick={exportGrid} title="Export as PNG">
            <IconExport /> Export
          </button>
        </div>
      </div>

      {/* -------- HISTORY TIMELINE -------- */}
      {showHistory && (
        <div className="pixel-history-bar">
          {historyRef.current.length === 0 ? (
            <span className="pixel-history-empty">No snapshots yet. Keep drawing to build timeline.</span>
          ) : (
            <div className="pixel-history-list">
              {historyRef.current.map((snap, idx) => (
                <button
                  key={snap.ts}
                  className="pixel-history-thumb"
                  onClick={() => restoreSnapshot(idx)}
                  title={`Restore snapshot ${idx + 1} (${formatTs(snap.ts)})`}
                >
                  <HistoryThumbnail grid={snap.grid} />
                  <span>{formatTs(snap.ts)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* -------- GRID (Canvas) -------- */}
      <div className="pixel-grid-shell">
        <div
          className="pixel-grid-canvas-wrap"
          style={{ width: canvasW, height: canvasH }}
        >
          <canvas
            ref={canvasRef}
            width={canvasW}
            height={canvasH}
            className="pixel-canvas-main"
          />
          <canvas
            ref={overlayCanvasRef}
            width={canvasW}
            height={canvasH}
            className="pixel-canvas-overlay"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerLeave}
            style={{ touchAction: 'none' }}
          />
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Tiny thumbnail for history bar                                     */
/* ------------------------------------------------------------------ */
const HistoryThumbnail = React.memo(({ grid }) => {
  const ref = useRef(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        ctx.fillStyle = grid[y][x]
        ctx.fillRect(x, y, 1, 1)
      }
    }
  }, [grid])

  return <canvas ref={ref} width={W} height={H} className="pixel-history-thumbnail-canvas" />
})
HistoryThumbnail.displayName = 'HistoryThumbnail'

export default PixelArtActivity
