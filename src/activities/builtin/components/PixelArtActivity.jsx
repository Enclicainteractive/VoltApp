import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const GRID_WIDTH = 32
const GRID_HEIGHT = 24
const EMPTY_COLOR = '#ffffff'
const DEFAULT_ZOOM = 22
const MIN_ZOOM = 10
const MAX_ZOOM = 40
const SYNC_DEBOUNCE_MS = 120
const MAX_UNDO = 90

const COLORS = [
  '#0f172a', '#334155', '#64748b', '#94a3b8', '#cbd5e1', '#f8fafc',
  '#7f1d1d', '#b91c1c', '#ef4444', '#fb7185',
  '#7c2d12', '#ea580c', '#fb923c', '#fdba74',
  '#78350f', '#ca8a04', '#facc15', '#fde68a',
  '#365314', '#65a30d', '#84cc16', '#bef264',
  '#14532d', '#16a34a', '#22c55e', '#86efac',
  '#134e4a', '#0f766e', '#14b8a6', '#5eead4',
  '#164e63', '#0891b2', '#0ea5e9', '#7dd3fc',
  '#1e3a8a', '#2563eb', '#3b82f6', '#93c5fd',
  '#4c1d95', '#7c3aed', '#8b5cf6', '#c4b5fd',
  '#831843', '#db2777', '#ec4899', '#f9a8d4'
]

const TOOLS = {
  BRUSH: 'brush',
  ERASER: 'eraser',
  FILL: 'fill',
  PICKER: 'picker',
}

const makeGrid = () => Array.from({ length: GRID_HEIGHT }, () => Array.from({ length: GRID_WIDTH }, () => EMPTY_COLOR))
const cloneGrid = (grid) => grid.map((row) => [...row])
const validCoord = (x, y) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && x < GRID_WIDTH && y >= 0 && y < GRID_HEIGHT

const sanitizeColor = (value) => typeof value === 'string' && value.length > 0 && value.length < 64 ? value : EMPTY_COLOR

const sanitizeGrid = (value) => {
  if (!Array.isArray(value)) return makeGrid()
  return Array.from({ length: GRID_HEIGHT }, (_, y) => Array.from({ length: GRID_WIDTH }, (_, x) => sanitizeColor(value?.[y]?.[x])))
}

const gridsEqual = (a, b) => {
  for (let y = 0; y < GRID_HEIGHT; y += 1) {
    for (let x = 0; x < GRID_WIDTH; x += 1) {
      if (a[y][x] !== b[y][x]) return false
    }
  }
  return true
}

const fillAt = (grid, sx, sy, color) => {
  if (!validCoord(sx, sy)) return grid
  const target = grid[sy][sx]
  if (target === color) return grid
  const next = cloneGrid(grid)
  const stack = [[sx, sy]]
  while (stack.length) {
    const [x, y] = stack.pop()
    if (!validCoord(x, y) || next[y][x] !== target) continue
    next[y][x] = color
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1])
  }
  return next
}

const makeThumbnail = (grid, scale = 4) => {
  const canvas = document.createElement('canvas')
  canvas.width = GRID_WIDTH * scale
  canvas.height = GRID_HEIGHT * scale
  const ctx = canvas.getContext('2d')
  for (let y = 0; y < GRID_HEIGHT; y += 1) {
    for (let x = 0; x < GRID_WIDTH; x += 1) {
      ctx.fillStyle = grid[y][x]
      ctx.fillRect(x * scale, y * scale, scale, scale)
    }
  }
  return canvas.toDataURL('image/png')
}

export default function PixelArtActivity({ sdk }) {
  const canvasRef = useRef(null)
  const overlayRef = useRef(null)
  const syncTimerRef = useRef(null)
  const drawingRef = useRef(false)
  const historyRef = useRef([])
  const undoRef = useRef([])
  const redoRef = useRef([])
  const gridRef = useRef(makeGrid())
  const strokeStartRef = useRef(null)

  const [gridVersion, setGridVersion] = useState(0)
  const [tool, setTool] = useState(TOOLS.BRUSH)
  const [color, setColor] = useState(COLORS[0])
  const [zoom, setZoom] = useState(DEFAULT_ZOOM)
  const [showGrid, setShowGrid] = useState(true)
  const [hoverCell, setHoverCell] = useState(null)
  const [status, setStatus] = useState('Fresh board loaded.')
  const [historyOpen, setHistoryOpen] = useState(true)

  const canvasWidth = GRID_WIDTH * zoom
  const canvasHeight = GRID_HEIGHT * zoom

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const overlay = overlayRef.current
    if (!canvas || !overlay) return
    const ctx = canvas.getContext('2d')
    const overlayCtx = overlay.getContext('2d')
    const grid = gridRef.current

    ctx.clearRect(0, 0, canvasWidth, canvasHeight)
    for (let y = 0; y < GRID_HEIGHT; y += 1) {
      for (let x = 0; x < GRID_WIDTH; x += 1) {
        const px = x * zoom
        const py = y * zoom
        if (grid[y][x] === EMPTY_COLOR) {
          ctx.fillStyle = (x + y) % 2 === 0 ? '#f8fafc' : '#e2e8f0'
        } else {
          ctx.fillStyle = grid[y][x]
        }
        ctx.fillRect(px, py, zoom, zoom)
      }
    }

    if (showGrid) {
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.12)'
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let x = 0; x <= GRID_WIDTH; x += 1) {
        const px = x * zoom + 0.5
        ctx.moveTo(px, 0)
        ctx.lineTo(px, canvasHeight)
      }
      for (let y = 0; y <= GRID_HEIGHT; y += 1) {
        const py = y * zoom + 0.5
        ctx.moveTo(0, py)
        ctx.lineTo(canvasWidth, py)
      }
      ctx.stroke()
    }

    overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight)
    if (hoverCell) {
      overlayCtx.strokeStyle = tool === TOOLS.ERASER ? '#ef4444' : '#0f172a'
      overlayCtx.lineWidth = 2
      overlayCtx.setLineDash(tool === TOOLS.PICKER ? [4, 3] : [])
      overlayCtx.strokeRect((hoverCell.x * zoom) + 1, (hoverCell.y * zoom) + 1, zoom - 2, zoom - 2)
    }
  }, [canvasHeight, canvasWidth, hoverCell, showGrid, tool, zoom])

  useEffect(() => {
    draw()
  }, [draw, gridVersion])

  useEffect(() => {
    if (!sdk) return undefined

    const applyRoomState = (state) => {
      const next = sanitizeGrid(state?.pixel?.grid)
      if (gridsEqual(next, gridRef.current)) return
      gridRef.current = next
      setGridVersion((version) => version + 1)
      setStatus('Board synced from room state.')
    }

    applyRoomState(sdk.getState?.() || {})

    const offEvent = sdk.on?.('event', (evt) => {
      if (!evt?.eventType?.startsWith('pixel:')) return
      if (evt.eventType === 'pixel:set') {
        const { x, y, color: nextColor } = evt.payload || {}
        if (!validCoord(x, y)) return
        const next = cloneGrid(gridRef.current)
        next[y][x] = sanitizeColor(nextColor)
        gridRef.current = next
        setGridVersion((version) => version + 1)
      }
      if (evt.eventType === 'pixel:replace-grid') {
        gridRef.current = sanitizeGrid(evt.payload?.grid)
        setGridVersion((version) => version + 1)
      }
      if (evt.eventType === 'pixel:clear') {
        gridRef.current = makeGrid()
        setGridVersion((version) => version + 1)
      }
    })

    const offState = sdk.subscribeServerState?.(applyRoomState)
    return () => {
      offEvent?.()
      offState?.()
    }
  }, [sdk])

  const queueStateSync = useCallback((nextGrid) => {
    if (!sdk?.updateState) return
    if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current)
    syncTimerRef.current = window.setTimeout(() => {
      sdk.updateState({ pixel: { grid: nextGrid } }, { serverRelay: true })
      sdk.emitEvent?.('pixel:replace-grid', { grid: nextGrid }, { serverRelay: true })
    }, SYNC_DEBOUNCE_MS)
  }, [sdk])

  const commitSnapshot = useCallback((previousGrid, notice) => {
    if (previousGrid && !gridsEqual(previousGrid, gridRef.current)) {
      undoRef.current.push(previousGrid)
      if (undoRef.current.length > MAX_UNDO) undoRef.current.shift()
      redoRef.current = []
      historyRef.current = [{ id: Date.now(), image: makeThumbnail(gridRef.current), label: new Date().toLocaleTimeString() }, ...historyRef.current].slice(0, 10)
      setStatus(notice)
    }
  }, [])

  const applyTool = useCallback((x, y) => {
    if (!validCoord(x, y)) return
    if (tool === TOOLS.PICKER) {
      setColor(gridRef.current[y][x])
      setStatus(`Picked ${gridRef.current[y][x]}.`)
      return
    }
    if (tool === TOOLS.FILL) {
      const previous = cloneGrid(gridRef.current)
      const next = fillAt(gridRef.current, x, y, color)
      if (gridsEqual(previous, next)) return
      gridRef.current = next
      setGridVersion((version) => version + 1)
      queueStateSync(next)
      commitSnapshot(previous, 'Flood fill applied.')
      return
    }

    const nextColor = tool === TOOLS.ERASER ? EMPTY_COLOR : color
    if (gridRef.current[y][x] === nextColor) return
    const next = cloneGrid(gridRef.current)
    next[y][x] = nextColor
    gridRef.current = next
    setGridVersion((version) => version + 1)
    sdk?.emitEvent?.('pixel:set', { x, y, color: nextColor }, { serverRelay: true })
    queueStateSync(next)
  }, [color, commitSnapshot, queueStateSync, sdk, tool])

  const eventToCell = useCallback((event) => {
    const rect = overlayRef.current?.getBoundingClientRect()
    if (!rect) return null
    const x = Math.floor((event.clientX - rect.left) / zoom)
    const y = Math.floor((event.clientY - rect.top) / zoom)
    return validCoord(x, y) ? { x, y } : null
  }, [zoom])

  const handlePointerDown = useCallback((event) => {
    const cell = eventToCell(event)
    if (!cell) return
    if (tool === TOOLS.BRUSH || tool === TOOLS.ERASER) {
      drawingRef.current = true
      strokeStartRef.current = cloneGrid(gridRef.current)
    }
    applyTool(cell.x, cell.y)
    setHoverCell(cell)
  }, [applyTool, eventToCell, tool])

  const handlePointerMove = useCallback((event) => {
    const cell = eventToCell(event)
    setHoverCell(cell)
    if (!cell) return
    if (drawingRef.current && (tool === TOOLS.BRUSH || tool === TOOLS.ERASER)) {
      applyTool(cell.x, cell.y)
    }
  }, [applyTool, eventToCell, tool])

  const handlePointerUp = useCallback(() => {
    if (drawingRef.current) {
      commitSnapshot(strokeStartRef.current, tool === TOOLS.ERASER ? 'Pixels erased.' : 'Stroke committed.')
    }
    drawingRef.current = false
    strokeStartRef.current = null
  }, [commitSnapshot, tool])

  useEffect(() => {
    window.addEventListener('pointerup', handlePointerUp)
    return () => window.removeEventListener('pointerup', handlePointerUp)
  }, [handlePointerUp])

  const handleUndo = useCallback(() => {
    const previous = undoRef.current.pop()
    if (!previous) return
    redoRef.current.push(cloneGrid(gridRef.current))
    gridRef.current = previous
    setGridVersion((version) => version + 1)
    setStatus('Undo applied.')
    queueStateSync(previous)
  }, [queueStateSync])

  const handleRedo = useCallback(() => {
    const next = redoRef.current.pop()
    if (!next) return
    undoRef.current.push(cloneGrid(gridRef.current))
    gridRef.current = next
    setGridVersion((version) => version + 1)
    setStatus('Redo applied.')
    queueStateSync(next)
  }, [queueStateSync])

  const handleClear = useCallback(() => {
    const previous = cloneGrid(gridRef.current)
    gridRef.current = makeGrid()
    setGridVersion((version) => version + 1)
    sdk?.emitEvent?.('pixel:clear', {}, { serverRelay: true })
    queueStateSync(gridRef.current)
    commitSnapshot(previous, 'Canvas cleared.')
  }, [commitSnapshot, queueStateSync, sdk])

  const handleExport = useCallback(() => {
    const canvas = document.createElement('canvas')
    canvas.width = GRID_WIDTH * 18
    canvas.height = GRID_HEIGHT * 18
    const ctx = canvas.getContext('2d')
    for (let y = 0; y < GRID_HEIGHT; y += 1) {
      for (let x = 0; x < GRID_WIDTH; x += 1) {
        ctx.fillStyle = gridRef.current[y][x]
        ctx.fillRect(x * 18, y * 18, 18, 18)
      }
    }
    const link = document.createElement('a')
    link.href = canvas.toDataURL('image/png')
    link.download = `voltapp-pixel-${Date.now()}.png`
    link.click()
  }, [])

  const selectedToolLabel = useMemo(() => ({
    [TOOLS.BRUSH]: 'Brush',
    [TOOLS.ERASER]: 'Eraser',
    [TOOLS.FILL]: 'Fill',
    [TOOLS.PICKER]: 'Picker',
  }[tool]), [tool])

  return (
    <div style={{ width: '100%', height: '100%', padding: 18, display: 'grid', gridTemplateRows: 'auto auto 1fr', gap: 16, background: 'linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%)', color: '#0f172a', overflow: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 800 }}>Pixel Art Board</div>
          <div style={{ fontSize: 14, color: '#475569', marginTop: 4 }}>Rebuilt shared editor with stronger rendering and stable room sync.</div>
        </div>
        <div style={{ alignSelf: 'start', padding: '10px 14px', borderRadius: 999, background: '#ffffff', boxShadow: '0 10px 28px rgba(15, 23, 42, 0.08)' }}>
          {status}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 280px', gap: 16 }}>
        <div style={{ display: 'grid', gap: 12, padding: 14, borderRadius: 24, background: 'rgba(255,255,255,0.9)', boxShadow: '0 18px 40px rgba(15, 23, 42, 0.08)' }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {Object.values(TOOLS).map((toolId) => (
              <button
                key={toolId}
                type="button"
                onClick={() => setTool(toolId)}
                style={{
                  padding: '10px 14px',
                  borderRadius: 999,
                  border: 'none',
                  cursor: 'pointer',
                  background: tool === toolId ? '#0f172a' : '#e2e8f0',
                  color: tool === toolId ? '#f8fafc' : '#0f172a',
                  fontWeight: 700
                }}
              >
                {toolId}
              </button>
            ))}
            <button type="button" onClick={handleUndo} disabled={!undoRef.current.length} style={{ padding: '10px 14px', borderRadius: 999, border: 'none', background: '#dbeafe', cursor: 'pointer', fontWeight: 700 }}>Undo</button>
            <button type="button" onClick={handleRedo} disabled={!redoRef.current.length} style={{ padding: '10px 14px', borderRadius: 999, border: 'none', background: '#dbeafe', cursor: 'pointer', fontWeight: 700 }}>Redo</button>
            <button type="button" onClick={handleClear} style={{ padding: '10px 14px', borderRadius: 999, border: 'none', background: '#fee2e2', cursor: 'pointer', fontWeight: 700 }}>Clear</button>
            <button type="button" onClick={handleExport} style={{ padding: '10px 14px', borderRadius: 999, border: 'none', background: '#dcfce7', cursor: 'pointer', fontWeight: 700 }}>Export PNG</button>
          </div>

          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 700 }}>Zoom</span>
              <input type="range" min={MIN_ZOOM} max={MAX_ZOOM} value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
              <span>{zoom}px</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={showGrid} onChange={(event) => setShowGrid(event.target.checked)} />
              <span>Grid lines</span>
            </label>
            <div style={{ padding: '8px 12px', borderRadius: 999, background: '#e2e8f0', fontSize: 13 }}>
              Tool: <strong>{selectedToolLabel}</strong>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(26px, 1fr))', gap: 8 }}>
            {COLORS.map((paletteColor) => (
              <button
                key={paletteColor}
                type="button"
                onClick={() => setColor(paletteColor)}
                title={paletteColor}
                style={{
                  height: 28,
                  borderRadius: 10,
                  border: color === paletteColor ? '3px solid #0f172a' : '1px solid rgba(15, 23, 42, 0.12)',
                  background: paletteColor,
                  cursor: 'pointer'
                }}
              />
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 12, border: '1px solid rgba(15, 23, 42, 0.16)', background: color }} />
            <input type="color" value={color} onChange={(event) => setColor(event.target.value)} style={{ width: 48, height: 36, border: 'none', background: 'transparent' }} />
            <div style={{ fontSize: 13, color: '#475569' }}>Selected color: {color}</div>
          </div>
        </div>

        <div style={{ padding: 14, borderRadius: 24, background: 'rgba(255,255,255,0.9)', boxShadow: '0 18px 40px rgba(15, 23, 42, 0.08)', display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong>Timeline</strong>
            <button type="button" onClick={() => setHistoryOpen((open) => !open)} style={{ border: 'none', background: '#e2e8f0', borderRadius: 999, padding: '8px 12px', cursor: 'pointer' }}>
              {historyOpen ? 'Hide' : 'Show'}
            </button>
          </div>
          {historyOpen ? (
            <div style={{ display: 'grid', gap: 10, maxHeight: 340, overflow: 'auto' }}>
              {historyRef.current.length ? historyRef.current.map((entry) => (
                <div key={entry.id} style={{ display: 'grid', gridTemplateColumns: '88px 1fr', gap: 10, alignItems: 'center', padding: 8, borderRadius: 16, background: '#f8fafc' }}>
                  <img src={entry.image} alt="" style={{ width: 88, height: 66, borderRadius: 12, imageRendering: 'pixelated', border: '1px solid rgba(15, 23, 42, 0.08)' }} />
                  <div>
                    <strong style={{ display: 'block' }}>{entry.label}</strong>
                    <span style={{ fontSize: 12, color: '#64748b' }}>Snapshot</span>
                  </div>
                </div>
              )) : <div style={{ color: '#64748b', fontSize: 14 }}>No snapshots yet. Start drawing to build history.</div>}
            </div>
          ) : null}
        </div>
      </div>

      <div style={{ display: 'grid', placeItems: 'center', overflow: 'auto', padding: 16, borderRadius: 28, background: 'rgba(15, 23, 42, 0.04)' }}>
        <div style={{ position: 'relative', width: canvasWidth, height: canvasHeight, borderRadius: 22, overflow: 'hidden', boxShadow: '0 30px 70px rgba(15, 23, 42, 0.16)' }}>
          <canvas ref={canvasRef} width={canvasWidth} height={canvasHeight} style={{ display: 'block', width: canvasWidth, height: canvasHeight }} />
          <canvas
            ref={overlayRef}
            width={canvasWidth}
            height={canvasHeight}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerLeave={() => setHoverCell(null)}
            style={{ position: 'absolute', inset: 0, width: canvasWidth, height: canvasHeight, cursor: 'crosshair' }}
          />
        </div>
      </div>
    </div>
  )
}
