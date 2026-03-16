import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { PlayIcon, TrophyIcon, ClockIcon, UsersIcon, TrashIcon, PencilIcon, CheckIcon, ArrowUturnLeftIcon, ArrowUturnRightIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline'

// --- SVG Icon Components ---
const EraserIcon = ({ width = 16 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={width} height={width} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 20H7L3 16c-.8-.8-.8-2 0-2.8L14.6 1.6c.8-.8 2-.8 2.8 0L21.4 5.6c.8.8.8 2 0 2.8L12 18" />
    <path d="M6 12l5 5" />
  </svg>
)

const StarIcon = ({ width = 16 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={width} height={width} viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
  </svg>
)

// --- Sound manager (Web Audio API synthesized sounds) ---
class SketchSoundManager {
  constructor() {
    this.ctx = null
    this.master = null
    this.ready = false
    this.muted = false
  }

  init() {
    if (this.ready) return
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)()
      this.master = this.ctx.createGain()
      this.master.gain.value = 0.6
      this.master.connect(this.ctx.destination)
      this.ready = true
    } catch { /* silent */ }
  }

  _tone(freq, dur, type = 'sine', vol = 0.2, delay = 0) {
    if (!this.ctx || this.muted) return
    try {
      if (this.ctx.state === 'suspended') this.ctx.resume()
      const t = this.ctx.currentTime + delay
      const osc = this.ctx.createOscillator()
      const g = this.ctx.createGain()
      osc.type = type
      osc.frequency.setValueAtTime(freq, t)
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(vol, t + 0.008)
      g.gain.exponentialRampToValueAtTime(0.001, t + dur)
      osc.connect(g)
      g.connect(this.master)
      osc.start(t)
      osc.stop(t + dur + 0.01)
    } catch { /* silent */ }
  }

  play(name) {
    if (!this.ready || this.muted) return
    switch (name) {
      case 'join':
        this._tone(523, 0.1, 'sine', 0.18)
        this._tone(659, 0.14, 'sine', 0.2, 0.08)
        break
      case 'start':
        this._tone(440, 0.1, 'sine', 0.22)
        this._tone(554, 0.1, 'sine', 0.22, 0.1)
        this._tone(659, 0.15, 'sine', 0.25, 0.2)
        this._tone(880, 0.2, 'sine', 0.25, 0.32)
        break
      case 'stroke':
        this._tone(1400, 0.02, 'sine', 0.04)
        break
      case 'undo':
        this._tone(600, 0.06, 'triangle', 0.12)
        this._tone(480, 0.08, 'triangle', 0.1, 0.04)
        break
      case 'redo':
        this._tone(480, 0.06, 'triangle', 0.12)
        this._tone(600, 0.08, 'triangle', 0.1, 0.04)
        break
      case 'clear':
        this._tone(300, 0.12, 'sawtooth', 0.12)
        this._tone(200, 0.16, 'sawtooth', 0.1, 0.08)
        break
      case 'vote':
        this._tone(784, 0.06, 'sine', 0.2)
        this._tone(1047, 0.12, 'sine', 0.22, 0.06)
        break
      case 'tick':
        this._tone(1000, 0.04, 'square', 0.1)
        break
      case 'tickUrgent':
        this._tone(1200, 0.06, 'square', 0.18)
        break
      case 'timesUp':
        this._tone(800, 0.1, 'square', 0.2)
        this._tone(600, 0.1, 'square', 0.2, 0.1)
        this._tone(400, 0.2, 'square', 0.2, 0.2)
        break
      case 'results':
        this._tone(523, 0.12, 'sine', 0.22)
        this._tone(659, 0.12, 'sine', 0.22, 0.1)
        this._tone(784, 0.12, 'sine', 0.24, 0.2)
        this._tone(1047, 0.3, 'sine', 0.28, 0.32)
        break
      case 'winner':
        this._tone(523, 0.12, 'sine', 0.24)
        this._tone(659, 0.12, 'sine', 0.24, 0.1)
        this._tone(784, 0.12, 'sine', 0.26, 0.2)
        this._tone(1047, 0.2, 'sine', 0.3, 0.32)
        this._tone(784, 0.1, 'sine', 0.2, 0.48)
        this._tone(1047, 0.35, 'sine', 0.24, 0.56)
        break
      case 'hover':
        this._tone(1200, 0.02, 'sine', 0.05)
        break
    }
  }
}

const soundMgr = new SketchSoundManager()

// --- Helpers ---
const getCanvasPoint = (canvas, clientX, clientY) => {
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY
  }
}

const CANVAS_W = 800
const CANVAS_H = 450

const PROMPTS = [
  'dragon', 'spaceship', 'burger', 'castle', 'robot',
  'island', 'volcano', 'octopus', 'pizza', 'ghost',
  'unicorn', 'car', 'tree', 'house', 'cat', 'dog',
  'lighthouse', 'submarine', 'pirate', 'wizard',
  'mushroom', 'penguin', 'rocket', 'helicopter',
  'rainbow', 'telescope', 'campfire', 'mermaid',
  'snowman', 'cactus', 'ninja', 'crown'
]

const PHASES = {
  LOBBY: 'lobby',
  DRAWING: 'drawing',
  VOTING: 'voting',
  RESULTS: 'results'
}

const DRAW_TIME = 60
const MAX_ROUNDS = 3

const compressStroke = (stroke) => ({
  p: stroke.points.map(pt => [Math.round(pt.x), Math.round(pt.y)]),
  c: stroke.color,
  s: stroke.size
})

const decompressStroke = (compressed) => ({
  points: compressed.p.map(pt => ({ x: pt[0], y: pt[1] })),
  color: compressed.c,
  size: compressed.s
})

const actionId = (prefix) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

const rememberEvent = (setRef, eventId) => {
  if (!eventId) return false
  if (setRef.current.has(eventId)) return false
  setRef.current.add(eventId)
  if (setRef.current.size > 400) {
    const first = setRef.current.values().next().value
    setRef.current.delete(first)
  }
  return true
}

// --- Draw a stroke onto a canvas context ---
const drawStroke = (ctx, stroke) => {
  if (!stroke?.points?.length) return
  const points = stroke.points.map(p => Array.isArray(p) ? { x: p[0], y: p[1] } : p)
  if (points.length < 1) return

  ctx.save()
  ctx.beginPath()
  ctx.lineWidth = stroke.size || 3
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  if (stroke.color === '#fff' || stroke.color === '#ffffff') {
    ctx.globalCompositeOperation = 'destination-out'
    ctx.strokeStyle = 'rgba(0,0,0,1)'
  } else {
    ctx.globalCompositeOperation = 'source-over'
    ctx.strokeStyle = stroke.color || '#111'
  }

  ctx.moveTo(points[0].x, points[0].y)
  if (points.length === 1) {
    ctx.lineTo(points[0].x + 0.1, points[0].y + 0.1)
  } else if (points.length === 2) {
    ctx.lineTo(points[1].x, points[1].y)
  } else {
    for (let i = 1; i < points.length - 1; i++) {
      const midX = (points[i].x + points[i + 1].x) / 2
      const midY = (points[i].y + points[i + 1].y) / 2
      ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY)
    }
    ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y)
  }
  ctx.stroke()
  ctx.restore()
}

// Re-render an entire stroke list onto a canvas
const renderStrokes = (canvas, strokes) => {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  if (Array.isArray(strokes)) {
    strokes.forEach(s => drawStroke(ctx, s))
  }
}

// ====================================================================
// Component
// ====================================================================
const SketchDuelActivity = ({ sdk, currentUser }) => {
  // Refs
  const canvasRef = useRef(null)
  const previewCanvasRefs = useRef({})
  const drawingRef = useRef(false)
  const currentStrokeRef = useRef([])
  const timerRef = useRef(null)
  const seenEventsRef = useRef(new Set())
  const batchTimerRef = useRef(null)
  const pendingStrokesRef = useRef([])
  const myDrawingRef = useRef([])

  // Stable refs for pointer callbacks
  const isEraserRef = useRef(false)
  const selectedColorRef = useRef('#111111')
  const brushSizeRef = useRef(3)
  const phaseRef = useRef(PHASES.LOBBY)

  // State
  const [gameState, setGameState] = useState({
    phase: PHASES.LOBBY,
    prompt: '',
    players: [],
    drawings: {},      // { [playerId]: { strokes, playerName } }
    votes: {},          // { [voterId]: votedForId }
    scores: {},         // { [playerId]: totalScore }
    timeLeft: 0,
    round: 0,
    maxRounds: MAX_ROUNDS,
    host: null,
  })

  const [myDrawing, setMyDrawing] = useState([])
  const [redoStack, setRedoStack] = useState([])
  const [selectedColor, setSelectedColor] = useState('#111111')
  const [brushSize, setBrushSize] = useState(3)
  const [isEraser, setIsEraser] = useState(false)
  const [hasVoted, setHasVoted] = useState(false)
  const [soundReady, setSoundReady] = useState(false)

  const colors = useMemo(() => [
    '#111111', '#e74c3c', '#3498db', '#2ecc71',
    '#f39c12', '#9b59b6', '#e91e63', '#00bcd4',
    '#ff6b6b', '#feca57', '#48dbfb', '#ff9ff3'
  ], [])

  // Keep refs in sync
  useEffect(() => { myDrawingRef.current = myDrawing }, [myDrawing])
  useEffect(() => { isEraserRef.current = isEraser }, [isEraser])
  useEffect(() => { selectedColorRef.current = selectedColor }, [selectedColor])
  useEffect(() => { brushSizeRef.current = brushSize }, [brushSize])
  useEffect(() => { phaseRef.current = gameState.phase }, [gameState.phase])

  // Init sounds on first interaction
  useEffect(() => {
    const handleInteraction = () => {
      soundMgr.init()
      setSoundReady(true)
      document.removeEventListener('click', handleInteraction)
      document.removeEventListener('keydown', handleInteraction)
    }
    document.addEventListener('click', handleInteraction)
    document.addEventListener('keydown', handleInteraction)
    return () => {
      document.removeEventListener('click', handleInteraction)
      document.removeEventListener('keydown', handleInteraction)
    }
  }, [])

  // --- Flush pending strokes over the wire ---
  const flushPendingStrokes = useCallback(() => {
    if (!sdk || pendingStrokesRef.current.length === 0) return
    const batch = pendingStrokesRef.current.map(compressStroke)
    const aid = actionId('sd_stroke')
    rememberEvent(seenEventsRef, aid)
    sdk.emitEvent('sketchduel:stroke', {
      playerId: currentUser?.id,
      playerName: currentUser?.username || 'Player',
      stroke: batch.length === 1 ? batch[0] : undefined,
      strokes: batch.length > 1 ? batch : undefined,
      actionId: aid
    }, { serverRelay: true })
    pendingStrokesRef.current = []
  }, [sdk, currentUser?.id, currentUser?.username])

  // --- SDK event listeners ---
  useEffect(() => {
    if (!sdk) return

    const offState = sdk.subscribeServerState((st) => {
      if (st?.sketchduel) {
        setGameState(prev => ({ ...prev, ...st.sketchduel }))
      }
    })

    const offEvent = sdk.on('event', (evt) => {
      const { eventType, payload } = evt
      if (!eventType?.startsWith('sketchduel:')) return

      const eid = payload?.actionId
      if (eid && !rememberEvent(seenEventsRef, eid)) return

      switch (eventType) {
        case 'sketchduel:join':
          setGameState(prev => {
            if (!payload.player?.id) return prev
            if (prev.players.some(p => p.id === payload.player.id)) return prev
            return { ...prev, players: [...prev.players, payload.player] }
          })
          soundMgr.play('join')
          break

        case 'sketchduel:leave':
          setGameState(prev => ({
            ...prev,
            players: prev.players.filter(p => p.id !== payload.playerId)
          }))
          break

        case 'sketchduel:start': {
          setGameState(prev => ({
            ...prev,
            phase: PHASES.DRAWING,
            prompt: payload.prompt,
            timeLeft: DRAW_TIME,
            round: (payload.round != null) ? payload.round : prev.round + 1,
            drawings: {},
            votes: {}
          }))
          setMyDrawing([])
          setRedoStack([])
          setHasVoted(false)
          pendingStrokesRef.current = []
          const canvas = canvasRef.current
          if (canvas) {
            const ctx = canvas.getContext('2d')
            ctx.fillStyle = '#ffffff'
            ctx.fillRect(0, 0, canvas.width, canvas.height)
          }
          soundMgr.play('start')
          break
        }

        case 'sketchduel:stroke':
          if (payload.playerId !== currentUser?.id) {
            const newStrokes = []
            if (payload.stroke) newStrokes.push(decompressStroke(payload.stroke))
            if (Array.isArray(payload.strokes)) {
              payload.strokes.forEach(s => newStrokes.push(decompressStroke(s)))
            }
            if (newStrokes.length > 0) {
              setGameState(prev => ({
                ...prev,
                drawings: {
                  ...prev.drawings,
                  [payload.playerId]: {
                    strokes: [...(prev.drawings[payload.playerId]?.strokes || []), ...newStrokes],
                    playerName: payload.playerName
                  }
                }
              }))
            }
          }
          break

        case 'sketchduel:submit':
          // A player submitted their drawing (could be us from another tab, or another player)
          if (payload.playerId && payload.drawing) {
            setGameState(prev => ({
              ...prev,
              drawings: {
                ...prev.drawings,
                [payload.playerId]: payload.drawing
              }
            }))
          }
          break

        case 'sketchduel:voting':
          setGameState(prev => ({
            ...prev,
            phase: PHASES.VOTING,
            drawings: payload.drawings || prev.drawings
          }))
          soundMgr.play('timesUp')
          break

        case 'sketchduel:vote':
          setGameState(prev => ({
            ...prev,
            votes: { ...prev.votes, [payload.voterId]: payload.votedFor }
          }))
          soundMgr.play('vote')
          break

        case 'sketchduel:results':
          setGameState(prev => ({
            ...prev,
            phase: PHASES.RESULTS,
            votes: payload.votes || prev.votes,
            scores: payload.scores || prev.scores || {}
          }))
          soundMgr.play('results')
          break

        case 'sketchduel:timer':
          setGameState(prev => {
            const tl = payload.timeLeft
            if (tl <= 5 && tl > 0) soundMgr.play('tickUrgent')
            else if (tl <= 15 && tl > 0 && tl % 5 === 0) soundMgr.play('tick')
            return { ...prev, timeLeft: tl }
          })
          break

        case 'sketchduel:clear':
          if (payload?.playerId !== currentUser?.id) {
            // Another player cleared their canvas (only relevant if we're watching their strokes)
            setGameState(prev => ({
              ...prev,
              drawings: {
                ...prev.drawings,
                [payload.playerId]: { strokes: [], playerName: prev.drawings[payload.playerId]?.playerName || 'Player' }
              }
            }))
          }
          break
      }
    })

    // Join the game
    const joinId = actionId('sd_join')
    rememberEvent(seenEventsRef, joinId)
    sdk.emitEvent('sketchduel:join', {
      player: { id: currentUser?.id, username: currentUser?.username || 'Player' },
      actionId: joinId
    }, { serverRelay: true })

    return () => {
      offState?.()
      offEvent?.()
      if (batchTimerRef.current) clearTimeout(batchTimerRef.current)
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [sdk, currentUser?.id, currentUser?.username])

  // --- Redraw canvas when myDrawing changes ---
  useEffect(() => {
    renderStrokes(canvasRef.current, myDrawing)
  }, [myDrawing])

  // --- Render preview canvases in voting phase ---
  useEffect(() => {
    if (gameState.phase !== PHASES.VOTING || !gameState.drawings) return
    const render = () => {
      Object.entries(gameState.drawings).forEach(([playerId, drawing]) => {
        const canvas = previewCanvasRefs.current[playerId]
        if (canvas && drawing.strokes) {
          renderStrokes(canvas, drawing.strokes)
        }
      })
    }
    render()
    const t = setTimeout(render, 150)
    return () => clearTimeout(t)
  }, [gameState.phase, gameState.drawings, gameState.votes])

  // --- Pointer handlers ---
  const handlePointerDown = useCallback((e) => {
    if (phaseRef.current !== PHASES.DRAWING) return
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.setPointerCapture(e.pointerId)
    drawingRef.current = true
    const point = getCanvasPoint(canvas, e.clientX, e.clientY)
    currentStrokeRef.current = [{ x: point.x, y: point.y }]
  }, [])

  const handlePointerMove = useCallback((e) => {
    if (!drawingRef.current || phaseRef.current !== PHASES.DRAWING) return
    const canvas = canvasRef.current
    if (!canvas) return

    const point = getCanvasPoint(canvas, e.clientX, e.clientY)
    currentStrokeRef.current.push({ x: point.x, y: point.y })

    const ctx = canvas.getContext('2d')
    const points = currentStrokeRef.current
    if (points.length > 1) {
      const last = points[points.length - 2]
      const curr = points[points.length - 1]
      ctx.save()
      ctx.lineWidth = brushSizeRef.current
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      if (isEraserRef.current) {
        ctx.globalCompositeOperation = 'destination-out'
        ctx.strokeStyle = 'rgba(0,0,0,1)'
      } else {
        ctx.globalCompositeOperation = 'source-over'
        ctx.strokeStyle = selectedColorRef.current
      }
      ctx.beginPath()
      ctx.moveTo(last.x, last.y)
      ctx.lineTo(curr.x, curr.y)
      ctx.stroke()
      ctx.restore()
    }
  }, [])

  const handlePointerUp = useCallback((e) => {
    if (!drawingRef.current) return
    drawingRef.current = false
    const canvas = canvasRef.current
    if (canvas) canvas.releasePointerCapture(e.pointerId)
    if (currentStrokeRef.current.length === 0) return

    const stroke = {
      points: [...currentStrokeRef.current],
      color: isEraserRef.current ? '#ffffff' : selectedColorRef.current,
      size: brushSizeRef.current
    }

    setMyDrawing(prev => [...prev, stroke])
    setRedoStack([])
    soundMgr.play('stroke')

    pendingStrokesRef.current.push(stroke)
    if (batchTimerRef.current) clearTimeout(batchTimerRef.current)
    batchTimerRef.current = setTimeout(flushPendingStrokes, 120)
    currentStrokeRef.current = []
  }, [flushPendingStrokes])

  // --- Undo / Redo ---
  const undo = useCallback(() => {
    setMyDrawing(prev => {
      if (prev.length === 0) return prev
      const removed = prev[prev.length - 1]
      setRedoStack(rs => [...rs, removed])
      soundMgr.play('undo')
      return prev.slice(0, -1)
    })
  }, [])

  const redo = useCallback(() => {
    setRedoStack(prev => {
      if (prev.length === 0) return prev
      const stroke = prev[prev.length - 1]
      setMyDrawing(d => [...d, stroke])
      soundMgr.play('redo')
      return prev.slice(0, -1)
    })
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (phaseRef.current !== PHASES.DRAWING) return
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [undo, redo])

  // --- Game actions ---
  const startGame = useCallback(() => {
    if (!sdk) return
    const prompt = PROMPTS[Math.floor(Math.random() * PROMPTS.length)]
    const round = gameState.round + 1
    const aid = actionId('sd_start')
    rememberEvent(seenEventsRef, aid)

    setGameState(prev => ({
      ...prev,
      phase: PHASES.DRAWING,
      prompt,
      timeLeft: DRAW_TIME,
      round,
      drawings: {},
      votes: {}
    }))
    setMyDrawing([])
    setRedoStack([])
    setHasVoted(false)
    pendingStrokesRef.current = []
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height)
    }

    sdk.emitEvent('sketchduel:start', { prompt, round, actionId: aid }, { serverRelay: true, cue: 'round_start' })

    // Start local timer - only the initiator drives the timer
    if (timerRef.current) clearInterval(timerRef.current)
    let timeLeft = DRAW_TIME
    timerRef.current = setInterval(() => {
      timeLeft--
      sdk.emitEvent('sketchduel:timer', { timeLeft, actionId: actionId('sd_tick') }, { serverRelay: true })
      if (timeLeft <= 0) {
        clearInterval(timerRef.current)
        timerRef.current = null
        endDrawingPhase()
      }
    }, 1000)
    soundMgr.play('start')
  }, [sdk, gameState.round])

  const endDrawingPhase = useCallback(() => {
    flushPendingStrokes()
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

    const myDrawingData = { strokes: myDrawingRef.current, playerName: currentUser?.username || 'Player' }
    const aid = actionId('sd_voting')
    rememberEvent(seenEventsRef, aid)

    // Submit our drawing first
    const submitAid = actionId('sd_submit')
    rememberEvent(seenEventsRef, submitAid)
    sdk.emitEvent('sketchduel:submit', {
      playerId: currentUser?.id,
      drawing: myDrawingData,
      actionId: submitAid
    }, { serverRelay: true })

    setGameState(prev => {
      const allDrawings = {
        ...prev.drawings,
        [currentUser?.id]: myDrawingData
      }
      sdk.emitEvent('sketchduel:voting', { drawings: allDrawings, actionId: aid }, { serverRelay: true })
      return { ...prev, phase: PHASES.VOTING, drawings: allDrawings }
    })

    soundMgr.play('timesUp')
  }, [sdk, currentUser?.id, currentUser?.username, flushPendingStrokes])

  const vote = useCallback((playerId) => {
    if (hasVoted || playerId === currentUser?.id || !sdk) return
    const aid = actionId('sd_vote')
    rememberEvent(seenEventsRef, aid)
    sdk.emitEvent('sketchduel:vote', { voterId: currentUser?.id, votedFor: playerId, actionId: aid }, { serverRelay: true })
    setHasVoted(true)
    setGameState(prev => ({ ...prev, votes: { ...prev.votes, [currentUser?.id]: playerId } }))
    soundMgr.play('vote')
  }, [sdk, hasVoted, currentUser?.id])

  const showResults = useCallback(() => {
    if (!sdk) return
    const aid = actionId('sd_results')
    rememberEvent(seenEventsRef, aid)

    setGameState(prev => {
      // Calculate scores from votes
      const voteCounts = {}
      const allVotes = prev.votes
      Object.values(allVotes).forEach(votedFor => {
        voteCounts[votedFor] = (voteCounts[votedFor] || 0) + 1
      })
      const newScores = { ...(prev.scores || {}) }
      Object.entries(voteCounts).forEach(([pid, count]) => {
        newScores[pid] = (newScores[pid] || 0) + count
      })

      sdk.emitEvent('sketchduel:results', { votes: allVotes, scores: newScores, actionId: aid }, { serverRelay: true, cue: 'round_end' })
      return { ...prev, phase: PHASES.RESULTS, scores: newScores }
    })
    soundMgr.play('results')
  }, [sdk])

  const clearCanvas = useCallback(() => {
    setMyDrawing([])
    setRedoStack([])
    pendingStrokesRef.current = []
    const aid = actionId('sd_clear')
    rememberEvent(seenEventsRef, aid)
    sdk?.emitEvent('sketchduel:clear', { playerId: currentUser?.id, actionId: aid }, { serverRelay: true })
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height)
    }
    soundMgr.play('clear')
  }, [sdk, currentUser?.id])

  const exportImage = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const exportCanvas = document.createElement('canvas')
    exportCanvas.width = canvas.width
    exportCanvas.height = canvas.height
    const ctx = exportCanvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height)
    ctx.drawImage(canvas, 0, 0)
    const link = document.createElement('a')
    link.download = `sketchduel-${gameState.prompt || 'drawing'}-${Date.now()}.png`
    link.href = exportCanvas.toDataURL('image/png')
    link.click()
  }, [gameState.prompt])

  const calculateResults = useCallback(() => {
    const voteCounts = {}
    Object.values(gameState.votes).forEach(votedFor => {
      voteCounts[votedFor] = (voteCounts[votedFor] || 0) + 1
    })
    return Object.entries(voteCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([playerId, count]) => ({
        playerId,
        count,
        playerName: gameState.drawings[playerId]?.playerName || gameState.players.find(p => p.id === playerId)?.username || 'Unknown',
        totalScore: gameState.scores?.[playerId] || 0
      }))
  }, [gameState.votes, gameState.drawings, gameState.scores, gameState.players])

  const isHost = gameState.host?.id === currentUser?.id || gameState.players[0]?.id === currentUser?.id

  if (!sdk) {
    return <div className="builtin-activity-loading"><div className="loading-spinner" /><p>Loading Sketch Duel...</p></div>
  }

  // ========== LOBBY ==========
  if (gameState.phase === PHASES.LOBBY) {
    return (
      <div className="builtin-activity-body sketch-duel-lobby">
        <div className="sketch-header">
          <h2>Sketch Duel</h2>
          <p>Draw the prompt and vote for the best drawing!</p>
          {gameState.round > 0 && gameState.scores && Object.keys(gameState.scores).length > 0 && (
            <div className="sketch-scoreboard-mini">
              <h4>Scores</h4>
              {Object.entries(gameState.scores)
                .sort((a, b) => b[1] - a[1])
                .map(([pid, score]) => {
                  const player = gameState.players.find(p => p.id === pid)
                  return (
                    <div key={pid} className="score-row">
                      <span>{player?.username || 'Unknown'}</span>
                      <span className="score-value">{score} pts</span>
                    </div>
                  )
                })}
            </div>
          )}
        </div>

        <div className="sketch-players">
          <h3><UsersIcon width={18} style={{ display: 'inline', verticalAlign: 'text-bottom' }} /> Players ({gameState.players.length})</h3>
          <div className="player-list">
            {gameState.players.map(p => (
              <div key={p.id} className="player-item">
                <span>{p.username}</span>
                {p.id === currentUser?.id && <span className="you-badge">You</span>}
                {p.id === gameState.players[0]?.id && <span className="host-badge">Host</span>}
              </div>
            ))}
          </div>
        </div>

        {gameState.players.length >= 2 && isHost ? (
          <button className="start-game-btn" onClick={startGame}>
            <PlayIcon width={20} /> {gameState.round > 0 ? 'Next Round' : 'Start Game'}
          </button>
        ) : gameState.players.length < 2 ? (
          <p className="waiting-text">Waiting for more players... (need 2+)</p>
        ) : (
          <p className="waiting-text">Waiting for host to start...</p>
        )}
      </div>
    )
  }

  // ========== DRAWING ==========
  if (gameState.phase === PHASES.DRAWING) {
    return (
      <div className="builtin-activity-body sketch-duel-drawing">
        <div className="sketch-info-bar">
          <div className="prompt-display">
            <span className="label">Draw:</span>
            <span className="prompt">{gameState.prompt}</span>
          </div>
          <div className="sketch-round-badge">
            Round {gameState.round}/{gameState.maxRounds}
          </div>
          <div className={`timer ${gameState.timeLeft <= 10 ? 'urgent' : ''}`}>
            <ClockIcon width={16} />
            {gameState.timeLeft}s
          </div>
        </div>

        <div className="sketch-canvas-container">
          <canvas
            ref={canvasRef}
            width={CANVAS_W}
            height={CANVAS_H}
            className="sketch-canvas"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            style={{ touchAction: 'none', cursor: isEraser ? 'crosshair' : 'default' }}
          />
        </div>

        <div className="sketch-toolbar">
          <button
            className={`tool-btn ${!isEraser ? 'active' : ''}`}
            onClick={() => setIsEraser(false)}
            title="Pen"
          >
            <PencilIcon width={16} />
          </button>

          <button
            className={`tool-btn ${isEraser ? 'active' : ''}`}
            onClick={() => setIsEraser(!isEraser)}
            title="Eraser"
          >
            <EraserIcon width={16} />
          </button>

          <div className="color-picker">
            {colors.map(color => (
              <button
                key={color}
                className={`color-btn ${selectedColor === color && !isEraser ? 'active' : ''}`}
                style={{ background: color }}
                onClick={() => { setSelectedColor(color); setIsEraser(false) }}
              />
            ))}
          </div>

          <div className="brush-size">
            <label>Size:</label>
            <input
              type="range"
              min={1}
              max={30}
              value={brushSize}
              onChange={(e) => setBrushSize(parseInt(e.target.value))}
            />
            <span>{brushSize}px</span>
          </div>

          <button className="tool-btn" onClick={undo} disabled={myDrawing.length === 0} title="Undo (Ctrl+Z)">
            <ArrowUturnLeftIcon width={16} />
          </button>
          <button className="tool-btn" onClick={redo} disabled={redoStack.length === 0} title="Redo (Ctrl+Shift+Z)">
            <ArrowUturnRightIcon width={16} />
          </button>

          <button className="clear-btn" onClick={clearCanvas}>
            <TrashIcon width={16} /> Clear
          </button>

          <button className="tool-btn" onClick={exportImage} title="Export as PNG">
            <ArrowDownTrayIcon width={16} />
          </button>

          {isHost && (
            <button className="tool-btn end-early-btn" onClick={endDrawingPhase} title="End drawing early">
              <CheckIcon width={16} /> Done
            </button>
          )}
        </div>
      </div>
    )
  }

  // ========== VOTING ==========
  if (gameState.phase === PHASES.VOTING) {
    const drawingsList = Object.entries(gameState.drawings || {})
      .filter(([playerId]) => playerId !== currentUser?.id)

    const myVoteTarget = gameState.votes[currentUser?.id]

    return (
      <div className="builtin-activity-body sketch-duel-voting">
        <div className="sketch-header">
          <h2>Vote for the Best Drawing!</h2>
          <p>Prompt was: <strong>{gameState.prompt}</strong></p>
          <div className="sketch-round-badge">Round {gameState.round}/{gameState.maxRounds}</div>
        </div>

        <div className="drawings-grid">
          {drawingsList.map(([playerId, drawing]) => (
            <div
              key={playerId}
              className={`drawing-card ${myVoteTarget === playerId ? 'voted-for' : ''}`}
            >
              <div className="drawing-canvas-preview">
                <canvas
                  ref={el => { previewCanvasRefs.current[playerId] = el }}
                  width={CANVAS_W / 2}
                  height={CANVAS_H / 2}
                  className="preview-canvas"
                />
              </div>
              <div className="drawing-info">
                <span className="drawing-author">{drawing.playerName}</span>
                {hasVoted && myVoteTarget === playerId && (
                  <span className="voted-badge"><CheckIcon width={14} /> Voted</span>
                )}
                {!hasVoted && (
                  <button
                    className="vote-btn"
                    onClick={() => vote(playerId)}
                  >
                    <StarIcon width={14} /> Vote
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {drawingsList.length === 0 && (
          <p className="waiting-text">No other drawings submitted yet.</p>
        )}

        {isHost && (
          <button className="end-voting-btn" onClick={showResults}>
            End Voting & Show Results
          </button>
        )}
      </div>
    )
  }

  // ========== RESULTS ==========
  if (gameState.phase === PHASES.RESULTS) {
    const results = calculateResults()
    const winnerId = results[0]?.playerId
    const canPlayMore = gameState.round < gameState.maxRounds

    return (
      <div className="builtin-activity-body sketch-duel-results">
        <div className="sketch-header">
          <TrophyIcon width={48} className="trophy-icon" />
          <h2>{canPlayMore ? 'Round Results' : 'Final Results!'}</h2>
          <p>Prompt: <strong>{gameState.prompt}</strong></p>
          <div className="sketch-round-badge">Round {gameState.round}/{gameState.maxRounds}</div>
        </div>

        <div className="results-list">
          {results.map((result, idx) => (
            <div key={result.playerId} className={`result-item rank-${idx + 1}`}>
              <span className="rank">#{idx + 1}</span>
              <span className="name">{result.playerName}</span>
              <span className="votes">{result.count} vote{result.count !== 1 ? 's' : ''}</span>
              <span className="total-score">{result.totalScore} pts total</span>
              {idx === 0 && <span className="winner-badge"><TrophyIcon width={14} /> Winner!</span>}
            </div>
          ))}
          {results.length === 0 && (
            <p className="waiting-text">No votes were cast this round.</p>
          )}
        </div>

        {/* Show all drawings in results */}
        {Object.keys(gameState.drawings || {}).length > 0 && (
          <div className="results-drawings">
            <h3>Drawings</h3>
            <div className="drawings-grid compact">
              {Object.entries(gameState.drawings).map(([playerId, drawing]) => (
                <div key={playerId} className={`drawing-card mini ${playerId === winnerId ? 'winner-card' : ''}`}>
                  <div className="drawing-canvas-preview">
                    <canvas
                      ref={el => { previewCanvasRefs.current[`result_${playerId}`] = el }}
                      width={CANVAS_W / 2}
                      height={CANVAS_H / 2}
                      className="preview-canvas"
                    />
                  </div>
                  <span className="drawing-author">{drawing.playerName}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {isHost && canPlayMore && (
          <button className="next-round-btn" onClick={startGame}>
            <PlayIcon width={18} /> Next Round ({gameState.round}/{gameState.maxRounds})
          </button>
        )}
        {isHost && !canPlayMore && (
          <button className="play-again-btn" onClick={() => {
            setGameState(prev => ({ ...prev, round: 0, scores: {} }))
            startGame()
          }}>
            <PlayIcon width={18} /> Play Again
          </button>
        )}
      </div>
    )
  }

  return <div className="builtin-activity-loading"><div className="loading-spinner" /><p>Loading Sketch Duel...</p></div>
}

export default SketchDuelActivity
