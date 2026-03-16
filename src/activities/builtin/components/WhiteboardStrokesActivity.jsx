import React, { useEffect, useRef, useState } from 'react'

const MAX_STROKES = 2000
const MAX_POINTS_PER_STROKE = 5000

// Helper to get accurate mouse position relative to canvas, accounting for transforms
const getCanvasPoint = (canvas, clientX, clientY) => {
  const rect = canvas.getBoundingClientRect()
  // Calculate scale factors in case canvas is scaled via CSS
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY
  }
}

const isValidPoint = (point) =>
  point &&
  Number.isFinite(point.x) &&
  Number.isFinite(point.y)

const normalizeStroke = (stroke) => {
  if (!Array.isArray(stroke)) return null
  const cleaned = stroke
    .filter(isValidPoint)
    .slice(0, MAX_POINTS_PER_STROKE)
    .map((p) => ({ x: p.x, y: p.y }))
  return cleaned.length >= 2 ? cleaned : null
}

const WhiteboardStrokesActivity = ({ sdk }) => {
  // Defensive check - don't render if SDK is not available
  if (!sdk) {
    return <div className="builtin-activity-loading"><div className="loading-spinner" /><p>Loading whiteboard...</p></div>
  }

  const canvasRef = useRef(null)
  const drawingRef = useRef(false)
  const [strokes, setStrokes] = useState([])
  const lastPointRef = useRef(null)
  const currentStroke = useRef([])

  useEffect(() => {
    if (!sdk) return
    const off = sdk.on('event', (evt) => {
      if (evt?.eventType !== 'board:stroke') return
      const stroke = normalizeStroke(evt.payload?.stroke)
      if (!stroke) return
      setStrokes(prev => {
        const next = [...prev, stroke]
        return next.length > MAX_STROKES ? next.slice(next.length - MAX_STROKES) : next
      })
    })
    return () => off?.()
  }, [sdk])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.lineWidth = 2
    ctx.strokeStyle = '#59a8ff'
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    strokes.forEach(stroke => {
      if (!stroke.length) return
      ctx.beginPath()
      ctx.moveTo(stroke[0].x, stroke[0].y)
      for (let i = 1; i < stroke.length; i++) ctx.lineTo(stroke[i].x, stroke[i].y)
      ctx.stroke()
    })
  }, [strokes])

  const pushPoint = (e) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const point = getCanvasPoint(canvas, e.clientX, e.clientY)
    currentStroke.current.push(point)
    if (currentStroke.current.length > MAX_POINTS_PER_STROKE) {
      currentStroke.current.shift()
    }
    return point
  }

  const onDown = (e) => {
    drawingRef.current = true
    currentStroke.current = []
    lastPointRef.current = pushPoint(e)
  }
  const onMove = (e) => {
    if (!drawingRef.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const point = pushPoint(e)
    const previous = lastPointRef.current
    if (!point || !previous) return
    ctx.beginPath()
    ctx.moveTo(previous.x, previous.y)
    ctx.lineTo(point.x, point.y)
    ctx.stroke()
    lastPointRef.current = point
  }
  const onUp = () => {
    if (!drawingRef.current) return
    drawingRef.current = false
    const stroke = normalizeStroke(currentStroke.current)
    if (stroke) {
      setStrokes(prev => {
        const next = [...prev, stroke]
        return next.length > MAX_STROKES ? next.slice(next.length - MAX_STROKES) : next
      })
      sdk.emitEvent('board:stroke', { stroke })
    }
    currentStroke.current = []
    lastPointRef.current = null
  }

  return (
    <div className="builtin-activity-body">
      <canvas
        ref={canvasRef}
        width={720}
        height={360}
        className="whiteboard-canvas"
        onMouseDown={onDown}
        onMouseMove={onMove}
        onMouseUp={onUp}
        onMouseLeave={onUp}
      />
    </div>
  )
}

export default WhiteboardStrokesActivity
