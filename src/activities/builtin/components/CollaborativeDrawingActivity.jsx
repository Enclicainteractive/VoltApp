import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowPathIcon,
  ArrowsUpDownIcon,
  CheckIcon,
  ChevronDownIcon,
  CursorArrowRaysIcon,
  DocumentDuplicateIcon,
  DocumentTextIcon,
  HandRaisedIcon,
  MinusIcon,
  PencilIcon,
  PhotoIcon,
  PlusIcon,
  RectangleStackIcon,
  Squares2X2Icon,
  TrashIcon,
  XMarkIcon
} from '@heroicons/react/24/outline'

const WORLD_LIMIT = 6400
const MIN_ZOOM = 0.2
const MAX_ZOOM = 4
const DEFAULT_COLOR = '#111827'
const DEFAULT_STROKE_SIZE = 6
const DEFAULT_TEXT_SIZE = 44
const SAVE_DEBOUNCE_MS = 180
const CURSOR_EMIT_THROTTLE_MS = 50
const REMOTE_CURSOR_TTL_MS = 4000
const MAX_IMAGE_EDGE = 960
const MIN_IMAGE_EDGE = 48
const RESIZE_HANDLE_RADIUS = 12
const MAX_IMAGE_BYTES = 220 * 1024
const MAX_BOARD_PAYLOAD_BYTES = 850 * 1024
const DEFAULT_STAGE_SIZE = { width: 1280, height: 760 }
const ZOOM_IDLE_MS = 120
const BOARD_CHUNK_SIZE = 32 * 1024
const STROKE_CHUNK_POINTS = 50

const TOOL_IDS = {
  SELECT: 'select',
  PEN: 'pen',
  TEXT: 'text',
  PAN: 'pan'
}

const FONT_FAMILIES = [
  { id: 'Inter, sans-serif', label: 'Inter' },
  { id: '"Helvetica Neue", Arial, sans-serif', label: 'Helvetica' },
  { id: 'Georgia, serif', label: 'Georgia' },
  { id: '"Times New Roman", serif', label: 'Times' },
  { id: '"Courier New", monospace', label: 'Courier' },
  { id: '"Trebuchet MS", sans-serif', label: 'Trebuchet' }
]

const PAPER_PRESETS = [
  { id: 'note', label: 'Note', width: 960, height: 720 },
  { id: 'poster', label: 'Poster', width: 1280, height: 900 },
  { id: 'landscape', label: 'Landscape', width: 1440, height: 900 },
  { id: 'storyboard', label: 'Storyboard', width: 1800, height: 1080 }
]

const PAPER_TONES = {
  white: {
    label: 'White',
    fill: '#ffffff',
    stroke: 'rgba(148, 163, 184, 0.42)',
    backdrop: '#dfe8f5'
  },
  cream: {
    label: 'Cream',
    fill: '#f8f1df',
    stroke: 'rgba(176, 149, 96, 0.38)',
    backdrop: '#e6decf'
  },
  blueprint: {
    label: 'Blueprint',
    fill: '#eff6ff',
    stroke: 'rgba(37, 99, 235, 0.22)',
    backdrop: '#d4e5ff'
  }
}

const PRESET_COLORS = [
  '#111827',
  '#f8fafc',
  '#0f766e',
  '#2563eb',
  '#dc2626',
  '#f97316',
  '#ca8a04',
  '#7c3aed'
]

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

const makeId = (prefix = 'wb') => `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`

const isFiniteNumber = (value) => Number.isFinite(value)

const getTextMeasureContext = () => {
  if (typeof document === 'undefined') return null
  if (!getTextMeasureContext.canvas) {
    getTextMeasureContext.canvas = document.createElement('canvas')
  }
  return getTextMeasureContext.canvas.getContext('2d')
}

const getTextLines = (text) => `${text || ''}`.replace(/\r/g, '').split('\n')

const measureTextBox = (text, {
  fontFamily = FONT_FAMILIES[0].id,
  fontSize = DEFAULT_TEXT_SIZE,
  fontWeight = 500,
  fontStyle = 'normal'
} = {}) => {
  const lines = getTextLines(text)
  const context = getTextMeasureContext()
  if (context) {
    context.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`
  }

  const widths = lines.map((line) => Math.max(
    fontSize * 0.6,
    context?.measureText(line || ' ').width || ((line || ' ').length * fontSize * 0.58)
  ))
  const lineHeight = Math.round(fontSize * 1.28)

  return {
    width: clamp(Math.ceil(Math.max(...widths, fontSize)), MIN_IMAGE_EDGE, 2200),
    height: clamp(Math.max(lineHeight, lines.length * lineHeight), Math.round(fontSize * 1.3), 2200),
    lines,
    lineHeight
  }
}

const normalizeDimension = (value, fallback) => clamp(Number(value) || fallback, 480, 3600)

const normalizePoint = (point, boardWidth = WORLD_LIMIT, boardHeight = WORLD_LIMIT) => {
  if (!point || !isFiniteNumber(point.x) || !isFiniteNumber(point.y)) return null
  return {
    x: clamp(point.x, 0, boardWidth),
    y: clamp(point.y, 0, boardHeight)
  }
}

const clampPointToBoard = (point, boardWidth, boardHeight) => {
  if (!point) return point
  return {
    x: clamp(point.x, 0, boardWidth),
    y: clamp(point.y, 0, boardHeight)
  }
}

const normalizeBoardSettings = (value, fallbackHostId = null) => ({
  width: normalizeDimension(value?.width, PAPER_PRESETS[1].width),
  height: normalizeDimension(value?.height, PAPER_PRESETS[1].height),
  paperTone: PAPER_TONES[value?.paperTone] ? value.paperTone : 'white',
  hostId: typeof value?.hostId === 'string' && value.hostId ? value.hostId : fallbackHostId
})

const normalizeItem = (item, fallbackIndex = 0, boardWidth = WORLD_LIMIT, boardHeight = WORLD_LIMIT) => {
  if (!item || typeof item !== 'object') return null

  if (item.type === 'stroke' && Array.isArray(item.points)) {
    const points = item.points.map((p) => normalizePoint(p, boardWidth, boardHeight)).filter(Boolean)
    if (points.length < 2) return null

    return {
      id: typeof item.id === 'string' ? item.id : makeId('stroke'),
      type: 'stroke',
      points,
      color: typeof item.color === 'string' ? item.color : DEFAULT_COLOR,
      size: clamp(Number(item.size) || DEFAULT_STROKE_SIZE, 1, 28),
      opacity: clamp(Number(item.opacity) || 1, 0.15, 1),
      userId: item.userId || null,
      username: item.username || 'Guest',
      createdAt: Number(item.createdAt) || Date.now(),
      updatedAt: Number(item.updatedAt) || Date.now(),
      layer: Number.isInteger(item.layer) ? item.layer : fallbackIndex
    }
  }

  if (item.type === 'image' && typeof item.src === 'string' && item.src) {
    return {
      id: typeof item.id === 'string' ? item.id : makeId('image'),
      type: 'image',
      src: item.src,
      x: clamp(Number(item.x) || 0, 0, boardWidth),
      y: clamp(Number(item.y) || 0, 0, boardHeight),
      width: clamp(Number(item.width) || 320, MIN_IMAGE_EDGE, 2600),
      height: clamp(Number(item.height) || 240, MIN_IMAGE_EDGE, 2600),
      opacity: clamp(Number(item.opacity) || 1, 0.15, 1),
      userId: item.userId || null,
      username: item.username || 'Guest',
      createdAt: Number(item.createdAt) || Date.now(),
      updatedAt: Number(item.updatedAt) || Date.now(),
      layer: Number.isInteger(item.layer) ? item.layer : fallbackIndex
    }
  }

  if (item.type === 'text') {
    const fontFamily = typeof item.fontFamily === 'string' && item.fontFamily ? item.fontFamily : FONT_FAMILIES[0].id
    const fontSize = clamp(Number(item.fontSize) || DEFAULT_TEXT_SIZE, 12, 180)
    const fontWeight = Number(item.fontWeight) >= 700 ? 700 : 500
    const fontStyle = item.fontStyle === 'italic' ? 'italic' : 'normal'
    const textAlign = ['left', 'center', 'right'].includes(item.textAlign) ? item.textAlign : 'left'
    const text = typeof item.text === 'string' ? item.text : 'Text'
    const { width, height } = measureTextBox(text, { fontFamily, fontSize, fontWeight, fontStyle })

    return {
      id: typeof item.id === 'string' ? item.id : makeId('text'),
      type: 'text',
      text,
      x: clamp(Number(item.x) || 0, 0, boardWidth),
      y: clamp(Number(item.y) || 0, 0, boardHeight),
      width,
      height,
      color: typeof item.color === 'string' ? item.color : DEFAULT_COLOR,
      opacity: clamp(Number(item.opacity) || 1, 0.15, 1),
      fontFamily,
      fontSize,
      fontWeight,
      fontStyle,
      textAlign,
      userId: item.userId || null,
      username: item.username || 'Guest',
      createdAt: Number(item.createdAt) || Date.now(),
      updatedAt: Number(item.updatedAt) || Date.now(),
      layer: Number.isInteger(item.layer) ? item.layer : fallbackIndex
    }
  }

  return null
}

const normalizeBoard = (value, fallbackHostId = null) => {
  const settings = normalizeBoardSettings(value?.settings, fallbackHostId)
  const items = Array.isArray(value?.items)
    ? value.items.map((item, index) => normalizeItem(item, index, settings.width, settings.height)).filter(Boolean)
    : []

  return {
    revision: Number(value?.revision) || 0,
    updatedAt: Number(value?.updatedAt) || 0,
    updatedBy: typeof value?.updatedBy === 'string' ? value.updatedBy : null,
    settings,
    items: items.sort((a, b) => a.layer - b.layer).map((item, index) => ({ ...item, layer: index }))
  }
}

const getStrokeBounds = (points = []) => {
  if (!points.length) return null

  let minX = points[0].x
  let maxX = points[0].x
  let minY = points[0].y
  let maxY = points[0].y

  points.forEach((point) => {
    minX = Math.min(minX, point.x)
    maxX = Math.max(maxX, point.x)
    minY = Math.min(minY, point.y)
    maxY = Math.max(maxY, point.y)
  })

  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY)
  }
}

const getItemBounds = (item) => {
  if (!item) return null
  if (item.type === 'stroke') return getStrokeBounds(item.points)
  if (item.type === 'image' || item.type === 'text') {
    return {
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height
    }
  }
  return null
}

const getSelectionBounds = (items = [], selectedIds = []) => {
  const selectedItems = items.filter((item) => selectedIds.includes(item.id))
  if (!selectedItems.length) return null

  const bounds = selectedItems.map(getItemBounds).filter(Boolean)
  if (!bounds.length) return null

  const minX = Math.min(...bounds.map((box) => box.x))
  const minY = Math.min(...bounds.map((box) => box.y))
  const maxX = Math.max(...bounds.map((box) => box.x + box.width))
  const maxY = Math.max(...bounds.map((box) => box.y + box.height))

  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY)
  }
}

const translateItems = (items, selectedIds, deltaX, deltaY) => (
  items.map((item) => {
    if (!selectedIds.includes(item.id)) return item

    if (item.type === 'stroke') {
      return {
        ...item,
        points: item.points.map((point) => ({ x: point.x + deltaX, y: point.y + deltaY })),
        updatedAt: Date.now()
      }
    }

    if (item.type === 'image' || item.type === 'text') {
      return {
        ...item,
        x: item.x + deltaX,
        y: item.y + deltaY,
        updatedAt: Date.now()
      }
    }

    return item
  })
)

const reorderLayers = (items, selectedIds, direction) => {
  const list = [...items]

  if (direction === 'front') {
    const rest = list.filter((item) => !selectedIds.includes(item.id))
    const selected = list.filter((item) => selectedIds.includes(item.id))
    return [...rest, ...selected].map((item, index) => ({ ...item, layer: index }))
  }

  if (direction === 'back') {
    const rest = list.filter((item) => !selectedIds.includes(item.id))
    const selected = list.filter((item) => selectedIds.includes(item.id))
    return [...selected, ...rest].map((item, index) => ({ ...item, layer: index }))
  }

  const ordered = [...list]
  const indexes = ordered
    .map((item, index) => (selectedIds.includes(item.id) ? index : -1))
    .filter((index) => index >= 0)

  if (!indexes.length) return items

  if (direction === 'up') {
    for (let idx = indexes.length - 1; idx >= 0; idx -= 1) {
      const index = indexes[idx]
      if (index < ordered.length - 1 && !selectedIds.includes(ordered[index + 1].id)) {
        ;[ordered[index], ordered[index + 1]] = [ordered[index + 1], ordered[index]]
      }
    }
  }

  if (direction === 'down') {
    for (let idx = 0; idx < indexes.length; idx += 1) {
      const index = indexes[idx]
      if (index > 0 && !selectedIds.includes(ordered[index - 1].id)) {
        ;[ordered[index], ordered[index - 1]] = [ordered[index - 1], ordered[index]]
      }
    }
  }

  return ordered.map((item, index) => ({ ...item, layer: index }))
}

const hitStroke = (point, item) => {
  const threshold = Math.max(8, item.size * 1.6)
  const thresholdSq = threshold * threshold

  for (let i = 1; i < item.points.length; i += 1) {
    const a = item.points[i - 1]
    const b = item.points[i]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const segmentLengthSq = dx * dx + dy * dy || 1
    const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / segmentLengthSq, 0, 1)
    const projX = a.x + dx * t
    const projY = a.y + dy * t
    const distX = point.x - projX
    const distY = point.y - projY
    if ((distX * distX) + (distY * distY) <= thresholdSq) return true
  }

  return false
}

const hitItem = (point, item) => {
  if (!item) return false
  if (item.type === 'stroke') return hitStroke(point, item)
  if (item.type === 'image' || item.type === 'text') {
    return (
      point.x >= item.x &&
      point.x <= item.x + item.width &&
      point.y >= item.y &&
      point.y <= item.y + item.height
    )
  }
  return false
}

const hitResizeHandle = (point, item, viewportZoom = 1) => {
  if (!point || !item || item.type !== 'image') return false
  const handleRadius = RESIZE_HANDLE_RADIUS / Math.max(0.5, viewportZoom)
  const handleX = item.x + item.width
  const handleY = item.y + item.height
  return Math.hypot(point.x - handleX, point.y - handleY) <= handleRadius
}

const getFitViewport = (settings, stageSize = DEFAULT_STAGE_SIZE) => {
  const zoom = clamp(
    Math.min((stageSize.width - 160) / settings.width, (stageSize.height - 140) / settings.height, 1.2),
    MIN_ZOOM,
    MAX_ZOOM
  )

  return {
    zoom,
    x: (settings.width / 2) - (stageSize.width / (2 * zoom)),
    y: (settings.height / 2) - (stageSize.height / (2 * zoom))
  }
}

const getViewportZoomAtPoint = (viewport, worldPoint, nextZoom) => {
  const safeZoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM)
  if (!worldPoint || !Number.isFinite(worldPoint.x) || !Number.isFinite(worldPoint.y)) {
    return { ...viewport, zoom: safeZoom }
  }

  const zoomRatio = safeZoom / viewport.zoom
  return {
    x: worldPoint.x - ((worldPoint.x - viewport.x) / zoomRatio),
    y: worldPoint.y - ((worldPoint.y - viewport.y) / zoomRatio),
    zoom: safeZoom
  }
}

const estimateBoardPayloadSize = (board) => {
  try {
    return new Blob([JSON.stringify(board)]).size
  } catch {
    return 0
  }
}

const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onerror = () => reject(new Error('Failed to read image'))
  reader.onload = () => resolve(reader.result)
  reader.readAsDataURL(file)
})

const dataUrlFromBlob = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onerror = () => reject(new Error('Failed to read compressed image'))
  reader.onload = () => resolve(reader.result)
  reader.readAsDataURL(blob)
})

const canvasToBlob = (canvas, type, quality) => new Promise((resolve) => {
  canvas.toBlob((blob) => resolve(blob), type, quality)
})

const loadImageElement = (src) => new Promise((resolve, reject) => {
  const img = new window.Image()
  img.onload = () => resolve(img)
  img.onerror = () => reject(new Error('Failed to decode image'))
  img.src = src
})

const compressImageFile = async (file) => {
  const dataUrl = await readFileAsDataUrl(file)
  const img = await loadImageElement(dataUrl)
  const mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
  const targetType = mimeType === 'image/png' ? 'image/webp' : mimeType
  let ratio = Math.min(1, MAX_IMAGE_EDGE / Math.max(img.naturalWidth, img.naturalHeight))
  let bestBlob = null
  let bestWidth = 0
  let bestHeight = 0

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const width = Math.max(48, Math.round(img.naturalWidth * ratio))
    const height = Math.max(48, Math.round(img.naturalHeight * ratio))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, width, height)
    ctx.drawImage(img, 0, 0, width, height)

    for (const quality of [0.86, 0.76, 0.66, 0.56, 0.46]) {
      const blob = await canvasToBlob(canvas, targetType, quality)
      if (!blob) continue

      if (!bestBlob || blob.size < bestBlob.size) {
        bestBlob = blob
        bestWidth = width
        bestHeight = height
      }

      if (blob.size <= MAX_IMAGE_BYTES) {
        return {
          src: await dataUrlFromBlob(blob),
          width,
          height,
          name: file.name,
          bytes: blob.size
        }
      }
    }

    ratio *= 0.82
  }

  if (!bestBlob) {
    throw new Error('Failed to compress image')
  }

  return {
    src: await dataUrlFromBlob(bestBlob),
    width: bestWidth,
    height: bestHeight,
    name: file.name,
    bytes: bestBlob.size
  }
}

const ToolButton = ({ active, title, onClick, Icon }) => (
  <button type="button" className={`tool-btn${active ? ' active' : ''}`} onClick={onClick} title={title} aria-label={title}>
    <Icon className="tool-btn-icon" />
  </button>
)

const SelectField = ({ label, value, onChange, children, disabled = false }) => (
  <label className="drawing-select-input">
    <span>{label}</span>
    <div className="drawing-select-shell">
      <select value={value} onChange={onChange} disabled={disabled}>
        {children}
      </select>
      <ChevronDownIcon />
    </div>
  </label>
)

const FloatingColorRow = ({ strokeColor, setStrokeColor }) => (
  <div className="drawing-popup-row drawing-popup-row-colors">
    {PRESET_COLORS.map((color) => (
      <button
        key={color}
        type="button"
        className={`drawing-swatch${strokeColor === color ? ' active' : ''}`}
        style={{ background: color }}
        onClick={() => setStrokeColor(color)}
        aria-label={`Use ${color}`}
      />
    ))}
    <label className="drawing-color-input">
      <span>Ink</span>
      <input type="color" value={strokeColor} onChange={(event) => setStrokeColor(event.target.value)} />
    </label>
  </div>
)

const CollaborativeDrawingActivity = ({ sdk, currentUser }) => {
  const localUserId = currentUser?.id || 'guest'
  const localUsername = currentUser?.username || currentUser?.displayName || 'Guest'
  const initialBoard = useMemo(() => normalizeBoard(undefined, localUserId), [localUserId])

  const canvasRef = useRef(null)
  const stageShellRef = useRef(null)
  const boardStateRef = useRef(initialBoard)
  const boardRef = useRef(initialBoard)
  const viewportRef = useRef(getFitViewport(initialBoard.settings, DEFAULT_STAGE_SIZE))
  const saveTimerRef = useRef(null)
  const interactionRef = useRef(null)
  const pressedKeysRef = useRef(new Set())
  const temporaryToolRef = useRef(null)
  const lastCursorEmitRef = useRef(0)
  const fileInputRef = useRef(null)
  const imageCacheRef = useRef(new Map())
  const wheelFrameRef = useRef(null)
  const wheelZoomStateRef = useRef(null)
  const zoomingRef = useRef(false)
  const zoomIdleTimerRef = useRef(null)
  const pendingBoardChunksRef = useRef({})
  const pendingStrokeChunksRef = useRef({})
  const isRemoteUpdateRef = useRef(false)
  const lastStrokeEmitRef = useRef(0)

  const [board, setBoard] = useState(initialBoard)
  const [selectedIds, setSelectedIds] = useState([])
  const [tool, setTool] = useState(TOOL_IDS.SELECT)
  const [strokeColor, setStrokeColor] = useState(DEFAULT_COLOR)
  const [strokeSize, setStrokeSize] = useState(DEFAULT_STROKE_SIZE)
  const [textFontFamily, setTextFontFamily] = useState(FONT_FAMILIES[0].id)
  const [textFontSize, setTextFontSize] = useState(DEFAULT_TEXT_SIZE)
  const [textFontWeight, setTextFontWeight] = useState(500)
  const [textFontStyle, setTextFontStyle] = useState('normal')
  const [textAlign, setTextAlign] = useState('left')
  const [viewport, setViewport] = useState(() => getFitViewport(initialBoard.settings, DEFAULT_STAGE_SIZE))
  const [draftStroke, setDraftStroke] = useState(null)
  const [marquee, setMarquee] = useState(null)
  const [remoteUsers, setRemoteUsers] = useState({})
  const [paperDraft, setPaperDraft] = useState(() => initialBoard.settings)
  const [textEditor, setTextEditor] = useState(null)
  const [stageSize, setStageSize] = useState(DEFAULT_STAGE_SIZE)
  const [notice, setNotice] = useState('')
  const [imageVersion, setImageVersion] = useState(0)

  const paperTheme = PAPER_TONES[board.settings.paperTone] || PAPER_TONES.white
  const isHost = !board.settings.hostId || board.settings.hostId === localUserId

  useEffect(() => {
    boardRef.current = board
  }, [board])

  useEffect(() => {
    viewportRef.current = viewport
  }, [viewport])

  useEffect(() => {
    setPaperDraft(board.settings)
  }, [board.settings])

  useEffect(() => {
    if (!notice) return undefined
    const timer = window.setTimeout(() => setNotice(''), 3600)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => () => {
    if (wheelFrameRef.current) window.cancelAnimationFrame(wheelFrameRef.current)
    if (zoomIdleTimerRef.current) window.clearTimeout(zoomIdleTimerRef.current)
  }, [])

  useEffect(() => {
    if (!stageShellRef.current || typeof ResizeObserver === 'undefined') return undefined

    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (!rect) return
      setStageSize({
        width: Math.max(320, Math.round(rect.width)),
        height: Math.max(320, Math.round(rect.height))
      })
    })

    observer.observe(stageShellRef.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!textEditor) return
    setTextEditor((prev) => {
      if (!prev) return prev
      const next = normalizeItem({
        ...prev,
        type: 'text',
        text: prev.text,
        color: strokeColor,
        fontFamily: textFontFamily,
        fontSize: textFontSize,
        fontWeight: textFontWeight,
        fontStyle: textFontStyle,
        textAlign
      }, prev.layer ?? boardRef.current.items.length)
      return next ? { ...prev, ...next } : prev
    })
  }, [strokeColor, textAlign, textFontFamily, textFontSize, textFontStyle, textFontWeight, textEditor])

  const scheduleSave = useCallback((nextBoard) => {
    boardStateRef.current = nextBoard
    if (!sdk?.updateState) return
    if (isRemoteUpdateRef.current) return

    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)

    saveTimerRef.current = window.setTimeout(() => {
      const candidate = {
        ...boardStateRef.current,
        updatedAt: Date.now(),
        updatedBy: localUserId
      }

      if (estimateBoardPayloadSize(candidate) > MAX_BOARD_PAYLOAD_BYTES) {
        setNotice('Board payload is too large. Add smaller images or remove some media.')
        return
      }

      const payloadStr = JSON.stringify(candidate)
      
      if (payloadStr.length > BOARD_CHUNK_SIZE) {
        const chunks = []
        for (let i = 0; i < payloadStr.length; i += BOARD_CHUNK_SIZE) {
          chunks.push(payloadStr.slice(i, i + BOARD_CHUNK_SIZE))
        }
        
        const chunkId = Date.now().toString(36)
        
        chunks.forEach((chunk, idx) => {
          setTimeout(() => {
            sdk.emitEvent('drawing:board-chunk', {
              chunkId,
              idx,
              total: chunks.length,
              chunk
            }, { serverRelay: true })
          }, idx * 50)
        })
      } else {
        sdk.updateState({ drawingBoard: candidate }, { serverRelay: true })
      }
    }, SAVE_DEBOUNCE_MS)
  }, [localUserId, sdk])

  const emitStrokeChunk = useCallback((strokeId, points, color, size, opacity, userId, username) => {
    if (!sdk?.emitEvent) return
    
    const pointsStr = JSON.stringify(points)
    
    if (pointsStr.length > 2048) {
      const chunkPoints = []
      for (let i = 0; i < points.length; i += STROKE_CHUNK_POINTS) {
        chunkPoints.push(points.slice(i, i + STROKE_CHUNK_POINTS))
      }
      
      const chunkId = Date.now().toString(36)
      const chunkMeta = { color, size, opacity, userId, username }
      
      chunkPoints.forEach((chunk, idx) => {
        setTimeout(() => {
          sdk.emitEvent('drawing:stroke-chunk', {
            chunkId,
            strokeId,
            idx,
            total: chunkPoints.length,
            chunk: chunkMeta,
            chunkPoints: chunk
          }, { serverRelay: true })
        }, idx * 30)
      })
    } else {
      sdk.emitEvent('drawing:stroke', {
        stroke: {
          id: strokeId,
          points,
          color,
          size,
          opacity,
          userId,
          username
        }
      }, { serverRelay: true })
    }
  }, [sdk])

  const commitBoard = useCallback((updater) => {
    setBoard((prev) => {
      const candidate = typeof updater === 'function' ? updater(prev) : updater
      const nextBoard = normalizeBoard({
        ...candidate,
        settings: {
          ...candidate?.settings,
          hostId: candidate?.settings?.hostId || prev.settings.hostId || localUserId
        },
        revision: (prev.revision || 0) + 1,
        updatedAt: Date.now(),
        updatedBy: localUserId
      }, prev.settings.hostId || localUserId)
      scheduleSave(nextBoard)
      return nextBoard
    })
  }, [localUserId, scheduleSave])

  const emitPresence = useCallback((kind = 'update') => {
    sdk?.emitEvent?.('drawing:presence', {
      kind,
      userId: localUserId,
      username: localUsername,
      color: strokeColor,
      tool,
      strokeSize,
      textFontFamily,
      textFontSize,
      textFontWeight,
      textFontStyle,
      textAlign
    }, { serverRelay: true })
  }, [localUserId, localUsername, sdk, strokeColor, strokeSize, textAlign, textFontFamily, textFontSize, textFontStyle, textFontWeight, tool])

  useEffect(() => {
    if (!sdk) return undefined

    const offState = sdk.subscribeServerState?.((state) => {
      const incoming = normalizeBoard(state?.drawingBoard, boardRef.current.settings.hostId || localUserId)
      if (!incoming.items.length && !incoming.updatedAt && !incoming.settings.hostId) return
      if (incoming.updatedAt <= (boardRef.current.updatedAt || 0)) return
      if (incoming.updatedBy && incoming.updatedBy === localUserId) return
      setBoard(incoming)
      boardStateRef.current = incoming
    })

    const offEvent = sdk.on?.('event', (evt = {}) => {
      if (evt.eventType === 'drawing:presence') {
        const payload = evt.payload || {}
        const userId = payload.userId
        if (!userId) return
        setRemoteUsers((prev) => {
          if (payload.kind === 'leave') {
            if (!prev[userId]) return prev
            const next = { ...prev }
            delete next[userId]
            return next
          }
          return {
            ...prev,
            [userId]: {
              username: payload.username || 'Guest',
              color: payload.color || '#38bdf8',
              cursor: prev[userId]?.cursor || null,
              tool: payload.tool || prev[userId]?.tool || TOOL_IDS.PEN,
              strokeSize: Number(payload.strokeSize) || prev[userId]?.strokeSize || DEFAULT_STROKE_SIZE,
              textFontFamily: payload.textFontFamily || prev[userId]?.textFontFamily || FONT_FAMILIES[0].id,
              textFontSize: Number(payload.textFontSize) || prev[userId]?.textFontSize || DEFAULT_TEXT_SIZE,
              textFontWeight: Number(payload.textFontWeight) || prev[userId]?.textFontWeight || 500,
              textFontStyle: payload.textFontStyle || prev[userId]?.textFontStyle || 'normal',
              textAlign: payload.textAlign || prev[userId]?.textAlign || 'left',
              lastSeen: Date.now()
            }
          }
        })
        return
      }

      if (evt.eventType === 'drawing:cursor') {
        const payload = evt.payload || {}
        const userId = payload.userId
        if (!userId || userId === localUserId) return

        setRemoteUsers((prev) => {
          const existing = prev[userId] || {}
          return {
            ...prev,
            [userId]: {
              username: payload.username || existing.username || 'Guest',
              color: payload.color || existing.color || '#38bdf8',
              tool: payload.tool || existing.tool || TOOL_IDS.PEN,
              strokeSize: Number(payload.strokeSize) || existing.strokeSize || DEFAULT_STROKE_SIZE,
              textFontFamily: payload.textFontFamily || existing.textFontFamily || FONT_FAMILIES[0].id,
              textFontSize: Number(payload.textFontSize) || existing.textFontSize || DEFAULT_TEXT_SIZE,
              textFontWeight: Number(payload.textFontWeight) || existing.textFontWeight || 500,
              textFontStyle: payload.textFontStyle || existing.textFontStyle || 'normal',
              textAlign: payload.textAlign || existing.textAlign || 'left',
              cursor: normalizePoint({ x: Number(payload.x), y: Number(payload.y) }),
              lastSeen: Date.now()
            }
          }
        })
      }

      if (evt.eventType === 'drawing:board-chunk') {
        const { chunkId, idx, total, chunk } = evt.payload || {}
        if (chunkId && chunk !== undefined) {
          if (!pendingBoardChunksRef.current[chunkId]) {
            pendingBoardChunksRef.current[chunkId] = { chunks: [], total }
          }
          const pending = pendingBoardChunksRef.current[chunkId]
          
          // Handle both string and object formats
          let chunkData = chunk
          if (typeof chunk === 'string') {
            try {
              chunkData = JSON.parse(chunk)
            } catch (e) {
              // Keep as string
            }
          }
          pending.chunks[idx] = chunkData

          if (pending.chunks.filter(Boolean).length === total) {
            try {
              // If chunks are objects, combine them; if strings, join and parse
              const allObjects = pending.chunks.every(c => typeof c === 'object')
              let fullBoard
              if (allObjects) {
                // Combine objects - merge their properties
                fullBoard = pending.chunks.reduce((acc, c) => ({ ...acc, ...c }), {})
              } else {
                fullBoard = JSON.parse(pending.chunks.join(''))
              }
              isRemoteUpdateRef.current = true
              const incoming = normalizeBoard(fullBoard, boardRef.current?.settings?.hostId || localUserId)
              if (incoming.updatedAt > (boardRef.current?.updatedAt || 0)) {
                setBoard(incoming)
                boardStateRef.current = incoming
              }
              isRemoteUpdateRef.current = false
            } catch (err) {
              console.error('[Drawing] Failed to parse board chunk:', err)
              isRemoteUpdateRef.current = false
            }
            delete pendingBoardChunksRef.current[chunkId]
          }
        }
      }

      if (evt.eventType === 'drawing:stroke-chunk') {
        const { chunkId, idx, total, chunk, strokeId } = evt.payload || {}
        
        // Handle both string and object formats for chunk data
        let chunkData = chunk
        let chunkPoints = evt.payload?.chunkPoints
        
        // If chunk is a string, it might be pre-stringified data
        if (typeof chunk === 'string') {
          try {
            const parsed = JSON.parse(chunk)
            chunkData = parsed
          } catch (e) {
            // Not a stringified object, use as-is
          }
        }
        
        if (chunkId && chunkData && strokeId) {
          if (!pendingStrokeChunksRef.current[strokeId]) {
            pendingStrokeChunksRef.current[strokeId] = { chunks: [], total }
          }
          const pending = pendingStrokeChunksRef.current[strokeId]
          
          // Handle points - could be array or string
          let pointsData = chunkPoints
          if (typeof chunkPoints === 'string') {
            try {
              pointsData = JSON.parse(chunkPoints)
            } catch (e) {
              pointsData = chunkPoints
            }
          }
          
          // Store both metadata and points
          pending.chunks[idx] = { ...chunkData, points: pointsData }

          if (pending.chunks.filter(Boolean).length === total) {
            try {
              // Combine all chunks
              const combined = pending.chunks.map(c => c?.points || []).flat()
              const metadata = pending.chunks[0] || {}
              
              const boardSettings = boardRef.current?.settings || { width: 1280, height: 760 }
              const strokeItem = normalizeItem({
                type: 'stroke',
                id: strokeId,
                points: combined,
                color: metadata.color,
                size: metadata.size,
                opacity: metadata.opacity,
                userId: metadata.userId,
                username: metadata.username
              }, boardRef.current?.items?.length || 0, boardSettings.width, boardSettings.height)

              if (strokeItem && strokeItem.points.length >= 2) {
                isRemoteUpdateRef.current = true
                const metadata = pending.chunks[0] || {}
                setBoard((prev) => {
                  const next = normalizeBoard({
                    ...prev,
                    items: [...(prev.items || []), strokeItem],
                    updatedAt: Date.now(),
                    updatedBy: metadata.userId
                  }, prev.settings?.hostId || localUserId)
                  boardRef.current = next
                  return next
                })
                isRemoteUpdateRef.current = false
              }
            } catch (err) {
              console.error('[Drawing] Failed to parse stroke chunk:', err)
              isRemoteUpdateRef.current = false
            }
            delete pendingStrokeChunksRef.current[strokeId]
          }
        }
      }

      if (evt.eventType === 'drawing:stroke') {
        const { stroke: strokeData } = evt.payload || {}
        if (strokeData?.points && strokeData.id) {
          const boardSettings = boardRef.current?.settings || { width: 1280, height: 760 }
          const strokeItem = normalizeItem({
            ...strokeData,
            type: 'stroke'
          }, boardRef.current.items.length, boardSettings.width, boardSettings.height)

          if (strokeItem && strokeItem.points.length >= 2) {
            isRemoteUpdateRef.current = true
            setBoard((prev) => {
              const next = normalizeBoard({
                ...prev,
                items: [...prev.items, strokeItem],
                updatedAt: Date.now(),
                updatedBy: strokeItem.userId
              }, prev.settings.hostId || localUserId)
              boardRef.current = next
              return next
            })
            isRemoteUpdateRef.current = false
          }
        }
      }
    })

    emitPresence('join')

    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
      sdk.emitEvent?.('drawing:presence', { kind: 'leave', userId: localUserId }, { serverRelay: true })
      try { offState?.() } catch {}
      try { offEvent?.() } catch {}
    }
  }, [emitPresence, localUserId, sdk])

  useEffect(() => {
    if (!sdk) return
    emitPresence('update')
  }, [emitPresence, sdk])

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now()
      setRemoteUsers((prev) => {
        let changed = false
        const next = {}
        Object.entries(prev).forEach(([userId, user]) => {
          if (now - (user?.lastSeen || 0) <= REMOTE_CURSOR_TTL_MS) {
            next[userId] = user
          } else {
            changed = true
          }
        })
        return changed ? next : prev
      })
    }, 1500)

    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!board.settings.hostId) {
      commitBoard((prev) => ({
        ...prev,
        settings: {
          ...prev.settings,
          hostId: localUserId
        }
      }))
    }
  }, [board.settings.hostId, commitBoard, localUserId])

  const visibleUsers = useMemo(() => {
    const entries = Object.entries(remoteUsers)
    if (!entries.find(([userId]) => userId === localUserId)) {
      entries.unshift([localUserId, { username: localUsername, color: strokeColor, tool }])
    }
    return entries.slice(0, 8)
  }, [localUserId, localUsername, remoteUsers, strokeColor, tool])

  const remoteCursorEntries = useMemo(
    () => Object.entries(remoteUsers).filter(([userId, user]) => userId !== localUserId && user?.cursor),
    [localUserId, remoteUsers]
  )

  const selectionBounds = useMemo(() => getSelectionBounds(board.items, selectedIds), [board.items, selectedIds])
  const selectedImage = useMemo(() => {
    if (selectedIds.length !== 1) return null
    const selectedItem = board.items.find((item) => item.id === selectedIds[0])
    return selectedItem?.type === 'image' ? selectedItem : null
  }, [board.items, selectedIds])
  const selectedText = useMemo(() => {
    if (selectedIds.length !== 1) return null
    const selectedItem = board.items.find((item) => item.id === selectedIds[0])
    return selectedItem?.type === 'text' ? selectedItem : null
  }, [board.items, selectedIds])

  const worldToScreen = useCallback((point) => ({
    x: (point.x - viewport.x) * viewport.zoom,
    y: (point.y - viewport.y) * viewport.zoom
  }), [viewport])

  const screenToWorld = useCallback((clientX, clientY) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return { x: viewportRef.current.x, y: viewportRef.current.y }
    return {
      x: viewportRef.current.x + ((clientX - rect.left) / viewportRef.current.zoom),
      y: viewportRef.current.y + ((clientY - rect.top) / viewportRef.current.zoom)
    }
  }, [])

  const selectionScreenBounds = useMemo(() => {
    if (!selectionBounds) return null
    const topLeft = worldToScreen({ x: selectionBounds.x, y: selectionBounds.y })
    const bottomRight = worldToScreen({
      x: selectionBounds.x + selectionBounds.width,
      y: selectionBounds.y + selectionBounds.height
    })
    return {
      left: topLeft.x,
      top: topLeft.y,
      width: bottomRight.x - topLeft.x,
      height: bottomRight.y - topLeft.y
    }
  }, [selectionBounds, worldToScreen])

  const resetView = useCallback(() => {
    setViewport(getFitViewport(boardRef.current.settings, stageSize))
  }, [stageSize])

  const adjustZoom = useCallback((nextZoom, worldPoint = null) => {
    setViewport((prev) => getViewportZoomAtPoint(prev, worldPoint, nextZoom))
  }, [])

  const zoomAroundStageCenter = useCallback((delta) => {
    const currentViewport = viewportRef.current
    const anchor = {
      x: currentViewport.x + (stageSize.width / (2 * currentViewport.zoom)),
      y: currentViewport.y + (stageSize.height / (2 * currentViewport.zoom))
    }
    adjustZoom(currentViewport.zoom + delta, anchor)
  }, [adjustZoom, stageSize.height, stageSize.width])

  const emitCursorPosition = useCallback((point) => {
    if (!sdk?.emitEvent || !point) return
    const now = Date.now()
    if (now - lastCursorEmitRef.current < CURSOR_EMIT_THROTTLE_MS) return
    lastCursorEmitRef.current = now
    sdk.emitEvent('drawing:cursor', {
      userId: localUserId,
      username: localUsername,
      color: strokeColor,
      tool,
      strokeSize,
      textFontFamily,
      textFontSize,
      textFontWeight,
      textFontStyle,
      textAlign,
      x: point.x,
      y: point.y
    }, { serverRelay: true })
  }, [localUserId, localUsername, sdk, strokeColor, strokeSize, textAlign, textFontFamily, textFontSize, textFontStyle, textFontWeight, tool])

  const syncTextControls = useCallback((item) => {
    if (!item) return
    setTextFontFamily(item.fontFamily || FONT_FAMILIES[0].id)
    setTextFontSize(item.fontSize || DEFAULT_TEXT_SIZE)
    setTextFontWeight(item.fontWeight || 500)
    setTextFontStyle(item.fontStyle || 'normal')
    setTextAlign(item.textAlign || 'left')
    if (item.color) setStrokeColor(item.color)
  }, [])

  useEffect(() => {
    if (selectedText && !textEditor) {
      syncTextControls(selectedText)
    }
  }, [selectedText, syncTextControls, textEditor])

  const openTextEditor = useCallback((draft) => {
    const normalized = normalizeItem({
      id: draft.id || makeId('text'),
      type: 'text',
      text: draft.text ?? '',
      x: draft.x ?? 0,
      y: draft.y ?? 0,
      color: draft.color || strokeColor,
      fontFamily: draft.fontFamily || textFontFamily,
      fontSize: draft.fontSize || textFontSize,
      fontWeight: draft.fontWeight || textFontWeight,
      fontStyle: draft.fontStyle || textFontStyle,
      textAlign: draft.textAlign || textAlign,
      userId: draft.userId || localUserId,
      username: draft.username || localUsername,
      createdAt: draft.createdAt || Date.now(),
      updatedAt: Date.now(),
      layer: draft.layer ?? boardRef.current.items.length
    }, boardRef.current.items.length)

    if (!normalized) return

    setTextEditor({
      ...normalized,
      isNew: Boolean(draft.isNew),
      originalId: draft.originalId || normalized.id
    })
    setSelectedIds([normalized.id])
    setTool(TOOL_IDS.TEXT)
    syncTextControls(normalized)
  }, [localUserId, localUsername, strokeColor, syncTextControls, textAlign, textFontFamily, textFontSize, textFontStyle, textFontWeight])

  const commitTextEditor = useCallback(() => {
    if (!textEditor) return
    const trimmed = (textEditor.text || '').trim()
    if (!trimmed) {
      setTextEditor(null)
      if (textEditor.isNew) {
        setSelectedIds([])
      } else {
        setSelectedIds([textEditor.id])
      }
      setTool(TOOL_IDS.SELECT)
      return
    }

    const textItem = normalizeItem({
      ...textEditor,
      type: 'text',
      text: textEditor.text,
      userId: textEditor.userId || localUserId,
      username: textEditor.username || localUsername,
      updatedAt: Date.now(),
      createdAt: textEditor.createdAt || Date.now(),
      layer: textEditor.layer ?? boardRef.current.items.length
    }, boardRef.current.items.length)

    if (!textItem) return

    commitBoard((prev) => {
      const existingIndex = prev.items.findIndex((item) => item.id === textItem.id)
      if (existingIndex >= 0) {
        return {
          ...prev,
          items: prev.items.map((item) => (item.id === textItem.id ? textItem : item))
        }
      }
      return {
        ...prev,
        items: [...prev.items, { ...textItem, layer: prev.items.length }]
      }
    })
    setSelectedIds([textItem.id])
    setTextEditor(null)
    setTool(TOOL_IDS.SELECT)
  }, [commitBoard, localUserId, localUsername, textEditor])

  const cancelTextEditor = useCallback(() => {
    if (!textEditor) return
    setTextEditor(null)
    setSelectedIds(textEditor.isNew ? [] : [textEditor.id])
    setTool(TOOL_IDS.SELECT)
  }, [textEditor])

  const handleDeleteSelection = useCallback(() => {
    if (!selectedIds.length) return
    commitBoard((prev) => ({
      ...prev,
      items: prev.items.filter((item) => !selectedIds.includes(item.id))
    }))
    setSelectedIds([])
  }, [commitBoard, selectedIds])

  const handleDuplicateSelection = useCallback(() => {
    if (!selectedIds.length) return
    const selectedItems = board.items.filter((item) => selectedIds.includes(item.id))
    if (!selectedItems.length) return

    const duplicates = selectedItems
      .map((item, index) => normalizeItem({
        ...item,
        id: makeId(item.type === 'image' ? 'image' : item.type === 'text' ? 'text' : 'clone'),
        x: item.type === 'image' || item.type === 'text' ? item.x + 26 : item.x,
        y: item.type === 'image' || item.type === 'text' ? item.y + 26 : item.y,
        points: item.type === 'stroke'
          ? item.points.map((point) => ({ x: point.x + 24, y: point.y + 24 }))
          : item.points,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        layer: board.items.length + index
      }, board.items.length + index))
      .filter(Boolean)

    commitBoard((prev) => ({
      ...prev,
      items: [...prev.items, ...duplicates]
    }))
    setSelectedIds(duplicates.map((item) => item.id))
  }, [board.items, commitBoard, selectedIds])

  const handleLayerAction = useCallback((direction) => {
    if (!selectedIds.length) return
    commitBoard((prev) => ({
      ...prev,
      items: reorderLayers(prev.items, selectedIds, direction)
    }))
  }, [commitBoard, selectedIds])

  const clearBoard = useCallback(() => {
    commitBoard((prev) => ({ ...prev, items: [] }))
    setSelectedIds([])
  }, [commitBoard])

  const applyPaperDraft = useCallback(() => {
    if (!isHost) return
    commitBoard((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        hostId: prev.settings.hostId || localUserId,
        width: normalizeDimension(paperDraft.width, prev.settings.width),
        height: normalizeDimension(paperDraft.height, prev.settings.height),
        paperTone: PAPER_TONES[paperDraft.paperTone] ? paperDraft.paperTone : prev.settings.paperTone
      }
    }))
    setViewport(getFitViewport({
      ...boardRef.current.settings,
      width: normalizeDimension(paperDraft.width, boardRef.current.settings.width),
      height: normalizeDimension(paperDraft.height, boardRef.current.settings.height)
    }, stageSize))
  }, [commitBoard, isHost, localUserId, paperDraft, stageSize])

  const handlePaperPreset = useCallback((presetId) => {
    const preset = PAPER_PRESETS.find((item) => item.id === presetId)
    if (!preset) return
    setPaperDraft((prev) => ({
      ...prev,
      width: preset.width,
      height: preset.height
    }))
  }, [])

  const openImagePicker = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleImageSelected = useCallback(async (event) => {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (!files.length) return

    try {
      const asset = await compressImageFile(files[0])
      const centerX = viewportRef.current.x + (stageSize.width / (2 * viewportRef.current.zoom))
      const centerY = viewportRef.current.y + (stageSize.height / (2 * viewportRef.current.zoom))
      const nextItem = normalizeItem({
        id: makeId('image'),
        type: 'image',
        src: asset.src,
        x: centerX - (asset.width / 2),
        y: centerY - (asset.height / 2),
        width: asset.width,
        height: asset.height,
        userId: localUserId,
        username: localUsername,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        layer: boardRef.current.items.length
      }, boardRef.current.items.length)

      if (!nextItem) return

      const candidateBoard = normalizeBoard({
        ...boardRef.current,
        items: [...boardRef.current.items, nextItem],
        updatedAt: Date.now(),
        updatedBy: localUserId
      }, boardRef.current.settings.hostId || localUserId)

      if (estimateBoardPayloadSize(candidateBoard) > MAX_BOARD_PAYLOAD_BYTES) {
        setNotice('Compressed image is still too large for sync. Use a smaller image.')
        return
      }

      commitBoard((prev) => ({
        ...prev,
        items: [...prev.items, nextItem]
      }))
      setSelectedIds([nextItem.id])
      setTool(TOOL_IDS.SELECT)
      setNotice(`Image compressed to ${Math.round(asset.bytes / 1024)} KB before sync.`)
    } catch (error) {
      console.error('Failed to add board image', error)
      setNotice('Image import failed.')
    }
  }, [commitBoard, localUserId, localUsername, stageSize.height, stageSize.width])

  const handleWheel = useCallback((event) => {
    event.preventDefault()
    const point = screenToWorld(event.clientX, event.clientY)
    const current = wheelZoomStateRef.current || {
      zoom: viewportRef.current.zoom,
      point
    }

    const intensity = clamp(Math.abs(event.deltaY), 4, 90)
    const factor = Math.exp((-Math.sign(event.deltaY) * intensity) / 540)
    wheelZoomStateRef.current = {
      zoom: clamp(current.zoom * factor, MIN_ZOOM, MAX_ZOOM),
      point
    }

    zoomingRef.current = true
    if (zoomIdleTimerRef.current) window.clearTimeout(zoomIdleTimerRef.current)
    zoomIdleTimerRef.current = window.setTimeout(() => {
      zoomingRef.current = false
      wheelZoomStateRef.current = null
    }, ZOOM_IDLE_MS)

    if (wheelFrameRef.current) return
    wheelFrameRef.current = window.requestAnimationFrame(() => {
      wheelFrameRef.current = null
      const pending = wheelZoomStateRef.current
      if (!pending) return
      setViewport((prev) => getViewportZoomAtPoint(prev, pending.point, pending.zoom))
    })
  }, [screenToWorld])

  const endInteraction = useCallback(() => {
    interactionRef.current = null
    setDraftStroke(null)
    setMarquee(null)
  }, [])

  const handleBoardPointerDown = useCallback((event) => {
    if (!canvasRef.current) return
    if (event.button !== 0 && event.button !== 1) return

    canvasRef.current.focus()
    const rawPoint = screenToWorld(event.clientX, event.clientY)
    const boardSettings = boardRef.current?.settings || { width: 1280, height: 760 }
    const point = clampPointToBoard(rawPoint, boardSettings.width, boardSettings.height)
    emitCursorPosition(point)

    if (canvasRef.current.setPointerCapture) {
      try {
        canvasRef.current.setPointerCapture(event.pointerId)
      } catch {}
    }

    if (tool === TOOL_IDS.PAN || event.button === 1 || temporaryToolRef.current === TOOL_IDS.PAN) {
      interactionRef.current = {
        mode: 'pan',
        startClientX: event.clientX,
        startClientY: event.clientY,
        viewport: viewportRef.current
      }
      return
    }

    if (tool === TOOL_IDS.PEN) {
      const strokeId = makeId('stroke')
      const stroke = {
        type: 'stroke',
        id: strokeId,
        color: strokeColor,
        size: strokeSize,
        opacity: 1,
        points: [point]
      }
      interactionRef.current = {
        mode: 'draw',
        stroke,
        strokeId,
        start: point
      }
      setDraftStroke(stroke)
      return
    }

    if (tool === TOOL_IDS.TEXT) {
      const hitText = [...boardRef.current.items].reverse().find((item) => item.type === 'text' && hitItem(point, item))
      if (hitText) {
        openTextEditor({ ...hitText, isNew: false })
        return
      }

      openTextEditor({
        id: makeId('text'),
        type: 'text',
        text: '',
        x: point.x,
        y: point.y,
        color: strokeColor,
        fontFamily: textFontFamily,
        fontSize: textFontSize,
        fontWeight: textFontWeight,
        fontStyle: textFontStyle,
        textAlign,
        userId: localUserId,
        username: localUsername,
        isNew: true,
        layer: boardRef.current.items.length
      })
      return
    }

    if (selectedImage && hitResizeHandle(point, selectedImage, viewportRef.current.zoom)) {
      interactionRef.current = {
        mode: 'resize-image',
        origin: point,
        item: selectedImage,
        board: boardRef.current
      }
      return
    }

    const hit = [...boardRef.current.items].reverse().find((item) => hitItem(point, item))
    if (hit) {
      if (hit.type === 'text' && event.detail >= 2) {
        openTextEditor({ ...hit, isNew: false })
        return
      }

      const nextSelection = event.shiftKey
        ? (selectedIds.includes(hit.id)
            ? selectedIds.filter((id) => id !== hit.id)
            : [...selectedIds, hit.id])
        : [hit.id]

      setSelectedIds(nextSelection)
      interactionRef.current = {
        mode: 'drag-selection',
        origin: point,
        board: boardRef.current,
        selectedIds: nextSelection,
        additive: event.shiftKey
      }
      return
    }

    setSelectedIds(event.shiftKey ? selectedIds : [])
    interactionRef.current = {
      mode: 'marquee',
      origin: point,
      additive: event.shiftKey,
      initialSelection: selectedIds
    }
  }, [
    emitCursorPosition,
    localUserId,
    localUsername,
    openTextEditor,
    screenToWorld,
    selectedIds,
    selectedImage,
    strokeColor,
    strokeSize,
    textAlign,
    textFontFamily,
    textFontSize,
    textFontStyle,
    textFontWeight,
    tool
  ])

  useEffect(() => {
    const handlePointerMove = (event) => {
      const interaction = interactionRef.current
      if (!interaction) return

      const boardSettings = boardRef.current?.settings || { width: 1280, height: 760 }
      const rawPoint = screenToWorld(event.clientX, event.clientY)
      const point = clampPointToBoard(rawPoint, boardSettings.width, boardSettings.height)
      emitCursorPosition(point)

      if (interaction.mode === 'draw') {
        setDraftStroke((prev) => {
          const next = prev ? [...prev.points, point] : [interaction.start, point]
          
          if (next.length >= STROKE_CHUNK_POINTS && interaction.strokeId) {
            const now = Date.now()
            if (now - lastStrokeEmitRef.current > 50) {
              lastStrokeEmitRef.current = now
              const chunkPoints = next.slice(-STROKE_CHUNK_POINTS)
              emitStrokeChunk(
                interaction.strokeId,
                chunkPoints,
                interaction.stroke.color,
                interaction.stroke.size,
                interaction.stroke.opacity,
                localUserId,
                localUsername
              )
            }
          }
          
          return {
            ...interaction.stroke,
            points: next
          }
        })
        return
      }

      if (interaction.mode === 'pan') {
        zoomingRef.current = true
        if (zoomIdleTimerRef.current) window.clearTimeout(zoomIdleTimerRef.current)
        zoomIdleTimerRef.current = window.setTimeout(() => {
          zoomingRef.current = false
        }, ZOOM_IDLE_MS)
        const deltaX = (event.clientX - interaction.startClientX) / interaction.viewport.zoom
        const deltaY = (event.clientY - interaction.startClientY) / interaction.viewport.zoom
        setViewport({
          ...interaction.viewport,
          x: interaction.viewport.x - deltaX,
          y: interaction.viewport.y - deltaY
        })
        return
      }

      if (interaction.mode === 'drag-selection') {
        const deltaX = point.x - interaction.origin.x
        const deltaY = point.y - interaction.origin.y
        setBoard(() => {
          const next = normalizeBoard({
            ...interaction.board,
            items: translateItems(interaction.board.items, interaction.selectedIds, deltaX, deltaY),
            updatedAt: Date.now(),
            updatedBy: localUserId
          }, interaction.board.settings.hostId || localUserId)
          boardRef.current = next
          return next
        })
        return
      }

      if (interaction.mode === 'resize-image') {
        const item = interaction.item
        if (!item || item.type !== 'image') return

        const widthRatio = item.width / Math.max(item.height, 1)
        const nextWidth = clamp(point.x - item.x, MIN_IMAGE_EDGE, 2600)
        const nextHeight = clamp(nextWidth / widthRatio, MIN_IMAGE_EDGE, 2600)

        setBoard(() => {
          const next = normalizeBoard({
            ...interaction.board,
            items: interaction.board.items.map((candidate) => (
              candidate.id === item.id
                ? {
                    ...candidate,
                    width: nextWidth,
                    height: nextHeight,
                    updatedAt: Date.now()
                  }
                : candidate
            )),
            updatedAt: Date.now(),
            updatedBy: localUserId
          }, interaction.board.settings.hostId || localUserId)
          boardRef.current = next
          return next
        })
        return
      }

      if (interaction.mode === 'marquee') {
        const nextMarquee = {
          x: Math.min(interaction.origin.x, point.x),
          y: Math.min(interaction.origin.y, point.y),
          width: Math.abs(point.x - interaction.origin.x),
          height: Math.abs(point.y - interaction.origin.y)
        }
        setMarquee(nextMarquee)

        const hits = boardRef.current.items
          .filter((item) => {
            const bounds = getItemBounds(item)
            if (!bounds) return false
            return (
              bounds.x < nextMarquee.x + nextMarquee.width &&
              bounds.x + bounds.width > nextMarquee.x &&
              bounds.y < nextMarquee.y + nextMarquee.height &&
              bounds.y + bounds.height > nextMarquee.y
            )
          })
          .map((item) => item.id)

        setSelectedIds(interaction.additive
          ? Array.from(new Set([...interaction.initialSelection, ...hits]))
          : hits
        )
      }
    }

    const handlePointerUp = () => {
      const interaction = interactionRef.current
      if (!interaction) return

      if (interaction.mode === 'draw' && draftStroke?.points?.length >= 2) {
        const strokeId = interaction.strokeId || makeId('stroke')
        
        if (interaction.strokeId && sdk?.emitEvent) {
          emitStrokeChunk(
            strokeId,
            draftStroke.points,
            draftStroke.color,
            draftStroke.size,
            draftStroke.opacity,
            localUserId,
            localUsername
          )
        }
        
        const item = normalizeItem({
          ...draftStroke,
          id: strokeId,
          userId: localUserId,
          username: localUsername,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          layer: boardRef.current.items.length
        }, boardRef.current.items.length, boardRef.current.settings.width, boardRef.current.settings.height)

        if (item) {
          commitBoard((prev) => ({
            ...prev,
            items: [...prev.items, item]
          }))
          if (tool === TOOL_IDS.SELECT) {
            setSelectedIds([item.id])
          }
        }
      }

      if (interaction.mode === 'drag-selection' || interaction.mode === 'resize-image') {
        scheduleSave(boardRef.current)
      }

      endInteraction()
      if (zoomIdleTimerRef.current) window.clearTimeout(zoomIdleTimerRef.current)
      zoomIdleTimerRef.current = window.setTimeout(() => {
        zoomingRef.current = false
      }, 40)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [commitBoard, draftStroke, emitCursorPosition, emitStrokeChunk, endInteraction, localUserId, localUsername, scheduleSave, screenToWorld, tool])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return

      const key = event.key.toLowerCase()
      pressedKeysRef.current.add(key)

      if ((event.key === 'Backspace' || event.key === 'Delete') && selectedIds.length) {
        event.preventDefault()
        handleDeleteSelection()
      }
      if (key === 'escape') {
        setSelectedIds([])
        setMarquee(null)
        if (textEditor) cancelTextEditor()
        if (tool !== TOOL_IDS.SELECT && !temporaryToolRef.current) {
          setTool(TOOL_IDS.SELECT)
        }
      }
      if (key === 'v') setTool(TOOL_IDS.SELECT)
      if (key === 'b' || key === 'p') setTool(TOOL_IDS.PEN)
      if (key === 't') setTool(TOOL_IDS.TEXT)
      if (key === 'h') setTool(TOOL_IDS.PAN)
      if (key === 'i') {
        event.preventDefault()
        openImagePicker()
      }
      if (key === ' ') {
        event.preventDefault()
        if (!temporaryToolRef.current) {
          temporaryToolRef.current = tool
          setTool(TOOL_IDS.PAN)
        }
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
        event.preventDefault()
        handleDuplicateSelection()
      }
      if ((event.ctrlKey || event.metaKey) && key === 'a') {
        event.preventDefault()
        setSelectedIds(boardRef.current.items.map((item) => item.id))
      }
      if ((event.ctrlKey || event.metaKey) && key === '0') {
        event.preventDefault()
        resetView()
      }
      if ((event.ctrlKey || event.metaKey) && (key === '=' || key === '+')) {
        event.preventDefault()
        zoomAroundStageCenter(0.15)
      }
      if ((event.ctrlKey || event.metaKey) && key === '-') {
        event.preventDefault()
        zoomAroundStageCenter(-0.15)
      }
      if ((event.ctrlKey || event.metaKey) && key === 'backspace') {
        event.preventDefault()
        clearBoard()
      }
      if ((event.ctrlKey || event.metaKey) && key === 'enter' && textEditor) {
        event.preventDefault()
        commitTextEditor()
      }
    }

    const onKeyUp = (event) => {
      const key = event.key.toLowerCase()
      pressedKeysRef.current.delete(key)
      if (key === ' ' && temporaryToolRef.current) {
        setTool(temporaryToolRef.current)
        temporaryToolRef.current = null
      }
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [
    cancelTextEditor,
    clearBoard,
    commitTextEditor,
    handleDeleteSelection,
    handleDuplicateSelection,
    openImagePicker,
    resetView,
    selectedIds.length,
    textEditor,
    tool,
    zoomAroundStageCenter
  ])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    const deviceDpr = Math.max(1, window.devicePixelRatio || 1)
    const dpr = zoomingRef.current ? Math.min(1.25, deviceDpr) : Math.min(2, deviceDpr)
    const displayWidth = Math.max(1, stageSize.width)
    const displayHeight = Math.max(1, stageSize.height)
    const pixelWidth = Math.round(displayWidth * dpr)
    const pixelHeight = Math.round(displayHeight * dpr)

    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth
      canvas.height = pixelHeight
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const worldToScreenPoint = (x, y) => ({
      x: (x - viewport.x) * viewport.zoom,
      y: (y - viewport.y) * viewport.zoom
    })

    ctx.save()
    ctx.scale(dpr, dpr)
    ctx.fillStyle = paperTheme.backdrop
    ctx.fillRect(0, 0, displayWidth, displayHeight)

    const paperTopLeft = worldToScreenPoint(0, 0)
    const paperWidth = board.settings.width * viewport.zoom
    const paperHeight = board.settings.height * viewport.zoom

    ctx.save()
    if (!zoomingRef.current) {
      ctx.shadowColor = 'rgba(15, 23, 42, 0.18)'
      ctx.shadowBlur = 26
      ctx.shadowOffsetY = 14
    }
    ctx.fillStyle = paperTheme.fill
    ctx.strokeStyle = paperTheme.stroke
    ctx.lineWidth = 1.5
    const paperPath = new Path2D()
    paperPath.roundRect(paperTopLeft.x, paperTopLeft.y, paperWidth, paperHeight, 22)
    ctx.fill(paperPath)
    ctx.stroke(paperPath)
    ctx.restore()

    ctx.save()
    ctx.translate(-viewport.x * viewport.zoom, -viewport.y * viewport.zoom)
    ctx.scale(viewport.zoom, viewport.zoom)

    board.items.forEach((item) => {
      if (item.type === 'stroke') {
        ctx.save()
        ctx.strokeStyle = item.color
        ctx.globalAlpha = item.opacity
        ctx.lineWidth = item.size
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.beginPath()
        item.points.forEach((point, index) => {
          if (index === 0) {
            ctx.moveTo(point.x, point.y)
          } else {
            ctx.lineTo(point.x, point.y)
          }
        })
        ctx.stroke()
        ctx.restore()
      }

      if (item.type === 'image') {
        let cached = imageCacheRef.current.get(item.src)
        if (!cached) {
          const img = new window.Image()
          img.onload = () => {
            imageCacheRef.current.set(item.src, { element: img, loaded: true })
            setImageVersion((prev) => prev + 1)
          }
          img.src = item.src
          cached = { element: img, loaded: false }
          imageCacheRef.current.set(item.src, cached)
        }
        if (cached.loaded) {
          ctx.save()
          ctx.globalAlpha = item.opacity
          ctx.drawImage(cached.element, item.x, item.y, item.width, item.height)
          ctx.restore()
        } else {
          ctx.save()
          ctx.fillStyle = 'rgba(148, 163, 184, 0.18)'
          ctx.fillRect(item.x, item.y, item.width, item.height)
          ctx.restore()
        }
      }

      if (item.type === 'text') {
        const lines = getTextLines(item.text)
        const lineHeight = Math.round(item.fontSize * 1.28)
        ctx.save()
        ctx.globalAlpha = item.opacity
        ctx.fillStyle = item.color
        ctx.font = `${item.fontStyle} ${item.fontWeight} ${item.fontSize}px ${item.fontFamily}`
        ctx.textBaseline = 'top'
        lines.forEach((line, index) => {
          const drawY = item.y + (index * lineHeight)
          if (item.textAlign === 'center') {
            ctx.textAlign = 'center'
            ctx.fillText(line || ' ', item.x + (item.width / 2), drawY)
          } else if (item.textAlign === 'right') {
            ctx.textAlign = 'right'
            ctx.fillText(line || ' ', item.x + item.width, drawY)
          } else {
            ctx.textAlign = 'left'
            ctx.fillText(line || ' ', item.x, drawY)
          }
        })
        ctx.restore()
      }
    })

    if (draftStroke?.points?.length >= 2) {
      ctx.save()
      ctx.strokeStyle = draftStroke.color
      ctx.lineWidth = draftStroke.size
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.globalAlpha = 0.92
      ctx.beginPath()
      draftStroke.points.forEach((point, index) => {
        if (index === 0) {
          ctx.moveTo(point.x, point.y)
        } else {
          ctx.lineTo(point.x, point.y)
        }
      })
      ctx.stroke()
      ctx.restore()
    }

    if (selectionBounds) {
      ctx.save()
      ctx.strokeStyle = 'rgba(14, 165, 233, 0.92)'
      ctx.fillStyle = 'rgba(14, 165, 233, 0.06)'
      ctx.lineWidth = 2 / viewport.zoom
      ctx.setLineDash([12 / viewport.zoom, 8 / viewport.zoom])
      const padding = 18 / viewport.zoom
      const selectionPath = new Path2D()
      selectionPath.roundRect(
        selectionBounds.x - padding,
        selectionBounds.y - padding,
        selectionBounds.width + (padding * 2),
        selectionBounds.height + (padding * 2),
        22 / viewport.zoom
      )
      ctx.fill(selectionPath)
      ctx.stroke(selectionPath)
      ctx.restore()
    }

    if (marquee) {
      ctx.save()
      ctx.fillStyle = 'rgba(14, 165, 233, 0.12)'
      ctx.strokeStyle = 'rgba(14, 165, 233, 0.85)'
      ctx.lineWidth = 2 / viewport.zoom
      ctx.setLineDash([10 / viewport.zoom, 6 / viewport.zoom])
      const marqueePath = new Path2D()
      marqueePath.roundRect(marquee.x, marquee.y, marquee.width, marquee.height, 12 / viewport.zoom)
      ctx.fill(marqueePath)
      ctx.stroke(marqueePath)
      ctx.restore()
    }

    if (selectedImage) {
      ctx.save()
      ctx.fillStyle = '#ffffff'
      ctx.strokeStyle = 'rgba(14, 165, 233, 0.96)'
      ctx.lineWidth = 2 / viewport.zoom
      ctx.beginPath()
      ctx.arc(
        selectedImage.x + selectedImage.width,
        selectedImage.y + selectedImage.height,
        RESIZE_HANDLE_RADIUS / viewport.zoom,
        0,
        Math.PI * 2
      )
      ctx.fill()
      ctx.stroke()
      ctx.restore()
    }

    ctx.restore()
    ctx.restore()
  }, [board, draftStroke, imageVersion, marquee, paperTheme.backdrop, paperTheme.fill, paperTheme.stroke, selectedImage, selectionBounds, stageSize.height, stageSize.width, viewport])

  const textEditorLayout = useMemo(() => {
    if (!textEditor) return null
    const point = worldToScreen({ x: textEditor.x, y: textEditor.y })
    return {
      left: clamp(point.x, 12, Math.max(12, stageSize.width - 260)),
      top: clamp(point.y, 12, Math.max(12, stageSize.height - 180)),
      width: clamp(textEditor.width * viewport.zoom, 220, Math.max(220, stageSize.width - 24)),
      minHeight: clamp(textEditor.height * viewport.zoom, 120, Math.max(120, stageSize.height - 24))
    }
  }, [stageSize.height, stageSize.width, textEditor, viewport.zoom, worldToScreen])

  const selectionPopoverStyle = useMemo(() => {
    if (!selectionScreenBounds) return null
    return {
      left: clamp(selectionScreenBounds.left + (selectionScreenBounds.width / 2), 120, Math.max(120, stageSize.width - 120)),
      top: clamp(selectionScreenBounds.top - 18, 18, Math.max(18, stageSize.height - 18))
    }
  }, [selectionScreenBounds, stageSize.height, stageSize.width])

  const remoteCursorOverlays = useMemo(() => remoteCursorEntries.map(([userId, user]) => {
    const point = worldToScreen(user.cursor)
    return {
      userId,
      user,
      left: clamp(point.x, 0, stageSize.width - 20),
      top: clamp(point.y, 0, stageSize.height - 20)
    }
  }), [remoteCursorEntries, stageSize.height, stageSize.width, worldToScreen])

  if (!sdk) {
    return <div className="builtin-activity-loading"><div className="loading-spinner" /><p>Loading Drawing Board...</p></div>
  }

  return (
    <div className="builtin-activity-body collaborative-drawing collaborative-drawing-v2">
      <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleImageSelected} />

      <div className="drawing-toolbar drawing-toolbar-v2">
        <div className="drawing-cluster">
          <ToolButton active={tool === TOOL_IDS.SELECT} title="Select (V)" onClick={() => setTool(TOOL_IDS.SELECT)} Icon={CursorArrowRaysIcon} />
          <ToolButton active={tool === TOOL_IDS.PEN} title="Pen (B)" onClick={() => setTool(TOOL_IDS.PEN)} Icon={PencilIcon} />
          <ToolButton active={tool === TOOL_IDS.TEXT} title="Text (T)" onClick={() => setTool(TOOL_IDS.TEXT)} Icon={DocumentTextIcon} />
          <ToolButton active={tool === TOOL_IDS.PAN} title="Pan (H or Space)" onClick={() => setTool(TOOL_IDS.PAN)} Icon={HandRaisedIcon} />
          <button type="button" className="drawing-chip-btn" onClick={openImagePicker}>
            <PhotoIcon />
            <span>Image</span>
          </button>
        </div>

        <div className="drawing-cluster">
          <FloatingColorRow strokeColor={strokeColor} setStrokeColor={setStrokeColor} />
          <label className="drawing-size-input">
            <span>{strokeSize}px</span>
            <input type="range" min="1" max="28" value={strokeSize} onChange={(event) => setStrokeSize(Number(event.target.value))} />
          </label>
        </div>

        <div className="drawing-cluster drawing-paper-controls">
          <SelectField
            label="Preset"
            value={PAPER_PRESETS.find((item) => item.width === Number(paperDraft.width) && item.height === Number(paperDraft.height))?.id || 'custom'}
            onChange={(event) => handlePaperPreset(event.target.value)}
            disabled={!isHost}
          >
            {PAPER_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
            <option value="custom">Custom</option>
          </SelectField>
          <label className="drawing-size-input compact">
            <span>W</span>
            <input
              type="number"
              min="480"
              max="3600"
              value={paperDraft.width}
              onChange={(event) => setPaperDraft((prev) => ({ ...prev, width: Number(event.target.value) || prev.width }))}
              disabled={!isHost}
            />
          </label>
          <label className="drawing-size-input compact">
            <span>H</span>
            <input
              type="number"
              min="480"
              max="3600"
              value={paperDraft.height}
              onChange={(event) => setPaperDraft((prev) => ({ ...prev, height: Number(event.target.value) || prev.height }))}
              disabled={!isHost}
            />
          </label>
          <SelectField
            label="Paper"
            value={paperDraft.paperTone}
            onChange={(event) => setPaperDraft((prev) => ({ ...prev, paperTone: event.target.value }))}
            disabled={!isHost}
          >
            {Object.entries(PAPER_TONES).map(([toneId, tone]) => <option key={toneId} value={toneId}>{tone.label}</option>)}
          </SelectField>
          <button type="button" className="drawing-chip-btn" onClick={applyPaperDraft} disabled={!isHost}>
            <ArrowPathIcon />
            <span>Apply Paper</span>
          </button>
        </div>

        <div className="drawing-cluster drawing-actions">
          <button type="button" className="drawing-chip-btn" onClick={resetView}>
            <ArrowPathIcon />
            <span>Reset View</span>
          </button>
          <button type="button" className="drawing-chip-btn danger" onClick={clearBoard} disabled={!board.items.length}>
            <TrashIcon />
            <span>Clear</span>
          </button>
        </div>
      </div>

      <div className="drawing-status-bar">
        <div className="drawing-status-copy">
          <strong>Shared Paper Board</strong>
          <span>{board.items.length} items</span>
          <span>{selectedIds.length} selected</span>
          <span>{board.settings.width} x {board.settings.height}</span>
          <span>{Math.round(viewport.zoom * 100)}% zoom</span>
          <span>{isHost ? 'You control paper settings' : 'Only the host can change paper settings'}</span>
          <span>Shortcuts: V select, B pen, T text, I image, Space pan, wheel zoom</span>
          {notice ? <span className="drawing-status-notice">{notice}</span> : null}
        </div>
        <div className="drawing-status-users">
          {visibleUsers.map(([userId, user]) => (
            <div key={userId} className="drawing-user-pill">
              <span className="drawing-user-dot" style={{ background: user.color }} />
              <span>
                {user.username}
                {userId === localUserId ? ' (you)' : ''}
                {userId === board.settings.hostId ? ' · host' : ''}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="drawing-stage-shell drawing-stage-shell-canvas" ref={stageShellRef}>
        <canvas
          ref={canvasRef}
          className="drawing-stage drawing-stage-canvas"
          onPointerDown={handleBoardPointerDown}
          onWheel={handleWheel}
          tabIndex={0}
          aria-label="Collaborative drawing board"
        />

        <div className="drawing-zoom-controls">
          <button type="button" onClick={() => zoomAroundStageCenter(-0.15)}>
            <MinusIcon />
          </button>
          <button type="button" onClick={() => zoomAroundStageCenter(0.15)}>
            <PlusIcon />
          </button>
          <button type="button" onClick={resetView}>
            <ArrowsUpDownIcon />
          </button>
        </div>

        <div className="drawing-stage-overlay">
          {(tool === TOOL_IDS.TEXT || textEditor || selectedText) ? (
            <div className="drawing-floating-popover drawing-text-popover">
              <div className="drawing-popover-title">Text</div>
              <div className="drawing-popup-row">
                <SelectField label="Font" value={textFontFamily} onChange={(event) => setTextFontFamily(event.target.value)}>
                  {FONT_FAMILIES.map((font) => <option key={font.id} value={font.id}>{font.label}</option>)}
                </SelectField>
                <label className="drawing-size-input compact">
                  <span>Size</span>
                  <input
                    type="number"
                    min="12"
                    max="180"
                    value={textFontSize}
                    onChange={(event) => setTextFontSize(clamp(Number(event.target.value) || DEFAULT_TEXT_SIZE, 12, 180))}
                  />
                </label>
                <button type="button" className={`drawing-chip-btn${textFontWeight >= 700 ? ' active' : ''}`} onClick={() => setTextFontWeight((prev) => (prev >= 700 ? 500 : 700))}>
                  <span>B</span>
                </button>
                <button type="button" className={`drawing-chip-btn${textFontStyle === 'italic' ? ' active' : ''}`} onClick={() => setTextFontStyle((prev) => (prev === 'italic' ? 'normal' : 'italic'))}>
                  <span>I</span>
                </button>
                <SelectField label="Align" value={textAlign} onChange={(event) => setTextAlign(event.target.value)}>
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </SelectField>
              </div>
              <FloatingColorRow strokeColor={strokeColor} setStrokeColor={setStrokeColor} />
              <div className="drawing-popup-footnote">Click the canvas to place text. Ctrl/Cmd+Enter saves.</div>
            </div>
          ) : null}

          {selectionPopoverStyle && selectedIds.length ? (
            <div
              className="drawing-floating-popover drawing-selection-popover"
              style={{ left: selectionPopoverStyle.left, top: selectionPopoverStyle.top }}
            >
              <button type="button" className="drawing-chip-btn" onClick={() => handleLayerAction('back')}>
                <Squares2X2Icon />
                <span>To Back</span>
              </button>
              <button type="button" className="drawing-chip-btn" onClick={() => handleLayerAction('down')}>
                <MinusIcon />
                <span>Back</span>
              </button>
              <button type="button" className="drawing-chip-btn" onClick={() => handleLayerAction('up')}>
                <PlusIcon />
                <span>Forward</span>
              </button>
              <button type="button" className="drawing-chip-btn" onClick={() => handleLayerAction('front')}>
                <RectangleStackIcon />
                <span>To Front</span>
              </button>
              <button type="button" className="drawing-chip-btn" onClick={handleDuplicateSelection}>
                <DocumentDuplicateIcon />
                <span>Duplicate</span>
              </button>
              <button type="button" className="drawing-chip-btn danger" onClick={handleDeleteSelection}>
                <TrashIcon />
                <span>Delete</span>
              </button>
            </div>
          ) : null}

          {selectedImage ? (
            <div className="drawing-floating-popover drawing-image-popover">
              <div className="drawing-popover-title">Image</div>
              <div className="drawing-popup-row">
                <span>{Math.round(selectedImage.width)} x {Math.round(selectedImage.height)}</span>
                <button type="button" className="drawing-chip-btn" onClick={openImagePicker}>
                  <PhotoIcon />
                  <span>Add Another</span>
                </button>
              </div>
              <div className="drawing-popup-footnote">Images are downscaled and compressed before sync to avoid payload errors.</div>
            </div>
          ) : null}

          {textEditor && textEditorLayout ? (
            <div
              className="drawing-text-editor-shell"
              style={{
                left: textEditorLayout.left,
                top: textEditorLayout.top,
                width: textEditorLayout.width,
                minHeight: textEditorLayout.minHeight
              }}
            >
              <textarea
                autoFocus
                value={textEditor.text}
                onChange={(event) => setTextEditor((prev) => (prev ? { ...prev, text: event.target.value } : prev))}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    cancelTextEditor()
                  }
                  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                    event.preventDefault()
                    commitTextEditor()
                  }
                }}
                placeholder="Type text..."
                className="drawing-text-editor-input"
                style={{
                  color: textEditor.color,
                  fontFamily: textEditor.fontFamily,
                  fontSize: `${Math.max(16, textEditor.fontSize * viewport.zoom)}px`,
                  fontWeight: textEditor.fontWeight,
                  fontStyle: textEditor.fontStyle,
                  textAlign: textEditor.textAlign
                }}
              />
              <div className="drawing-text-editor-actions">
                <button type="button" className="drawing-chip-btn" onClick={cancelTextEditor}>
                  <XMarkIcon />
                  <span>Cancel</span>
                </button>
                <button type="button" className="drawing-chip-btn active" onClick={commitTextEditor}>
                  <CheckIcon />
                  <span>Apply</span>
                </button>
              </div>
            </div>
          ) : null}

          {remoteCursorOverlays.map(({ userId, user, left, top }) => (
            <div key={userId} className="drawing-remote-cursor" style={{ left, top }}>
              <div className="drawing-remote-pointer" style={{ borderTopColor: user.color || '#38bdf8' }} />
              <div className="drawing-remote-pill" style={{ borderColor: user.color || '#38bdf8' }}>
                {user.username || 'Guest'}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default CollaborativeDrawingActivity
