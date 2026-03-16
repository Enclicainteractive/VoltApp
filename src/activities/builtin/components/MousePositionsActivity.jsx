import React, { useEffect, useRef, useState, useCallback } from 'react'

const MAX_CURSOR_AGE_MS = 10000
const MAX_TRACKED_CURSORS = 64

const isFiniteNumber = (value) => Number.isFinite(value)
const clampPercent = (value) => Math.max(0, Math.min(100, value))

const MousePositionsActivity = ({ sdk, currentUser }) => {
  const areaRef = useRef(null)
  const [cursors, setCursors] = useState({})
  const lastEmitRef = useRef(0)
  const throttleMs = 100 // Only emit every 100ms to prevent rate limiting
  
  // Smoothing state - store previous positions for interpolation
  const smoothedCursorsRef = useRef({})
  const animationFrameRef = useRef(null)
  const [smoothedDisplay, setSmoothedDisplay] = useState({})

  // Get peer ID from SDK for filtering local cursor
  const peerIdRef = useRef(null)
  useEffect(() => {
    if (sdk?.getP2PStatus) {
      const status = sdk.getP2PStatus()
      peerIdRef.current = status?.peerId
    }
  }, [sdk])

  useEffect(() => {
    if (!sdk) return
    const off = sdk.on('event', (evt) => {
      if (evt?.eventType !== 'cursor:move') return
      if (!evt?.payload || typeof evt.payload !== 'object') return
      
      // Filter out local cursor - only show peer cursors
      const fromPeerId = evt.fromPeerId || evt.payload?.userId
      if (fromPeerId === currentUser?.id || fromPeerId === peerIdRef.current) return
      if (!fromPeerId) return

      const rawX = Number(evt.payload.x)
      const rawY = Number(evt.payload.y)
      if (!isFiniteNumber(rawX) || !isFiniteNumber(rawY)) return
      
      const pid = fromPeerId || 'peer'
      const now = Date.now()
      
      // Store raw cursor data
      setCursors(prev => {
        const next = { ...prev }
        // Drop stale cursors first.
        Object.entries(next).forEach(([id, cursor]) => {
          if (now - (cursor?.timestamp || 0) > MAX_CURSOR_AGE_MS) delete next[id]
        })
        // Soft cap to avoid unbounded growth from bogus peer ids.
        const keys = Object.keys(next)
        if (!next[pid] && keys.length >= MAX_TRACKED_CURSORS) {
          keys
            .sort((a, b) => (next[a]?.timestamp || 0) - (next[b]?.timestamp || 0))
            .slice(0, keys.length - (MAX_TRACKED_CURSORS - 1))
            .forEach((id) => delete next[id])
        }
        next[pid] = {
          username: typeof evt.payload.username === 'string' ? evt.payload.username : 'Anonymous',
          rawX: clampPercent(rawX),
          rawY: clampPercent(rawY),
          timestamp: now
        }
        return next
      })
    })
    return () => off?.()
  }, [sdk, currentUser?.id])

  // Smooth cursor positions using requestAnimationFrame
  useEffect(() => {
    const updateSmoothed = () => {
      const newSmoothed = {}
      const now = Date.now()
      
      Object.entries(cursors).forEach(([id, cursor]) => {
        if (!cursor || !isFiniteNumber(cursor.rawX) || !isFiniteNumber(cursor.rawY)) return
        const prev = smoothedCursorsRef.current[id] || { x: cursor.rawX, y: cursor.rawY, lastUpdate: now }
        
        // Smooth interpolation (lerp)
        const smoothingFactor = 0.3
        const newX = prev.x + (cursor.rawX - prev.x) * smoothingFactor
        const newY = prev.y + (cursor.rawY - prev.y) * smoothingFactor
        
        // Only update if significant change
        if (Math.abs(newX - prev.x) > 0.01 || Math.abs(newY - prev.y) > 0.01) {
          smoothedCursorsRef.current[id] = { x: newX, y: newY, lastUpdate: now }
          newSmoothed[id] = { x: newX, y: newY, username: cursor.username }
        } else {
          newSmoothed[id] = { x: prev.x, y: prev.y, username: cursor.username }
        }
      })
      
      if (Object.keys(newSmoothed).length > 0) {
        setSmoothedDisplay(() => newSmoothed)
      } else {
        setSmoothedDisplay({})
      }
      
      animationFrameRef.current = requestAnimationFrame(updateSmoothed)
    }
    
    animationFrameRef.current = requestAnimationFrame(updateSmoothed)
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [cursors])

  // Clean up stale cursors
  useEffect(() => {
    const cleanup = setInterval(() => {
      const now = Date.now()
      setCursors(prev => {
        const next = {}
        Object.entries(prev).forEach(([id, cursor]) => {
          // Keep cursor if it was updated in the last 10 seconds
          if (now - (cursor?.timestamp || 0) < MAX_CURSOR_AGE_MS) {
            next[id] = cursor
          }
        })
        // Keep smoothing map in sync so stale cursors disappear.
        Object.keys(smoothedCursorsRef.current).forEach((id) => {
          if (!next[id]) delete smoothedCursorsRef.current[id]
        })
        return next
      })
    }, 5000)
    
    return () => clearInterval(cleanup)
  }, [])

  const onMove = useCallback((e) => {
    if (!sdk || !areaRef.current) return
    
    const now = Date.now()
    if (now - lastEmitRef.current < throttleMs) return
    lastEmitRef.current = now
    
    const rect = areaRef.current.getBoundingClientRect()
    const payload = {
      userId: currentUser?.id,
      username: currentUser?.username || 'Anonymous',
      x: clampPercent(((e.clientX - rect.left) / rect.width) * 100),
      y: clampPercent(((e.clientY - rect.top) / rect.height) * 100),
      timestamp: now
    }
    sdk.emitEvent('cursor:move', payload, { serverRelay: true })
  }, [sdk, currentUser?.id, currentUser?.username])

  return (
    <div className="builtin-activity-body">
      <div className="builtin-canvas" ref={areaRef} onMouseMove={onMove}>
        {Object.entries(smoothedDisplay).map(([id, c]) => (
          <div key={id} className="cursor-dot" style={{ left: `${c.x || 0}%`, top: `${c.y || 0}%` }} title={c.username || id}>
            <span className="cursor-name">{c.username || id}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default MousePositionsActivity
