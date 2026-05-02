import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react'

const VISUALIZER_STYLES = [
  { value: 'bars', label: 'Bars' },
  { value: 'mirror', label: 'Mirror' },
  { value: 'pulse', label: 'Pulse' },
  { value: 'circular', label: 'Circular' },
  { value: 'spiral', label: 'Spiral' },
  { value: 'particle', label: 'Particle' }
]

const VISUALIZER_MODES = [
  { value: 'spectrum', label: 'Spectrum' },
  { value: 'wave', label: 'Wave' },
  { value: 'frequency', label: 'Frequency' },
  { value: 'timeDomain', label: 'Time Domain' },
  { value: 'energy', label: 'Energy' }
]

const CANVAS_WIDTH = 400
const CANVAS_HEIGHT = 200

const EnhancedAudioVisualizer = ({ 
  analyser, 
  isPlaying, 
  style = 'bars', 
  mode = 'spectrum',
  onStyleChange,
  onModeChange
}) => {
  const canvasRef = useRef(null)
  const animationFrameRef = useRef(null)
  const particlesRef = useRef([])
  const [canvasReady, setCanvasReady] = useState(false)

  // Initialize particles for particle mode
  const initializeParticles = useCallback(() => {
    const particles = []
    const particleCount = 50
    
    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * CANVAS_WIDTH,
        y: Math.random() * CANVAS_HEIGHT,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
        life: Math.random(),
        maxLife: 1,
        size: Math.random() * 3 + 1
      })
    }
    
    particlesRef.current = particles
  }, [])

  // Setup canvas and context
  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return null

    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1

    // Set actual canvas size
    canvas.width = CANVAS_WIDTH * dpr
    canvas.height = CANVAS_HEIGHT * dpr

    // Scale context
    ctx.scale(dpr, dpr)

    // Set canvas display size
    canvas.style.width = `${CANVAS_WIDTH}px`
    canvas.style.height = `${CANVAS_HEIGHT}px`

    setCanvasReady(true)
    return ctx
  }, [])

  // Get frequency data based on mode
  const getFrequencyData = useCallback((analyser) => {
    if (!analyser) return new Uint8Array(128)

    switch (mode) {
      case 'wave':
      case 'timeDomain': {
        const buffer = new Uint8Array(analyser.fftSize)
        analyser.getByteTimeDomainData(buffer)
        return buffer
      }
      case 'energy': {
        const buffer = new Uint8Array(analyser.frequencyBinCount)
        analyser.getByteFrequencyData(buffer)
        // Calculate energy bands
        const energyBands = new Uint8Array(32)
        const bandSize = Math.floor(buffer.length / energyBands.length)
        
        for (let i = 0; i < energyBands.length; i++) {
          let sum = 0
          for (let j = 0; j < bandSize; j++) {
            sum += buffer[i * bandSize + j]
          }
          energyBands[i] = sum / bandSize
        }
        return energyBands
      }
      case 'frequency':
      default: {
        const buffer = new Uint8Array(analyser.frequencyBinCount)
        analyser.getByteFrequencyData(buffer)
        return buffer
      }
    }
  }, [mode])

  // Draw bars visualizer
  const drawBars = useCallback((ctx, data) => {
    const barCount = 64
    const barWidth = CANVAS_WIDTH / barCount
    
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
    
    // Create gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT)
    gradient.addColorStop(0, '#00f5ff')
    gradient.addColorStop(0.5, '#ff006e')
    gradient.addColorStop(1, '#8338ec')
    
    for (let i = 0; i < barCount; i++) {
      const dataIndex = Math.floor((i / barCount) * data.length)
      const value = data[dataIndex] / 255
      const barHeight = value * CANVAS_HEIGHT * 0.8
      
      ctx.fillStyle = gradient
      ctx.fillRect(
        i * barWidth,
        CANVAS_HEIGHT - barHeight,
        barWidth - 1,
        barHeight
      )
      
      // Add glow effect
      ctx.shadowColor = '#00f5ff'
      ctx.shadowBlur = 10
      ctx.fillRect(
        i * barWidth,
        CANVAS_HEIGHT - barHeight,
        barWidth - 1,
        Math.min(barHeight, 20)
      )
      ctx.shadowBlur = 0
    }
  }, [])

  // Draw mirror visualizer
  const drawMirror = useCallback((ctx, data) => {
    const barCount = 32
    const barWidth = CANVAS_WIDTH / (barCount * 2)
    const centerX = CANVAS_WIDTH / 2
    
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
    
    const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT)
    gradient.addColorStop(0, '#ff9500')
    gradient.addColorStop(0.5, '#ff006e')
    gradient.addColorStop(1, '#3c096c')
    
    for (let i = 0; i < barCount; i++) {
      const dataIndex = Math.floor((i / barCount) * data.length)
      const value = data[dataIndex] / 255
      const barHeight = value * CANVAS_HEIGHT * 0.9
      
      ctx.fillStyle = gradient
      
      // Left side
      ctx.fillRect(
        centerX - (i + 1) * barWidth,
        CANVAS_HEIGHT / 2 - barHeight / 2,
        barWidth - 1,
        barHeight
      )
      
      // Right side
      ctx.fillRect(
        centerX + i * barWidth,
        CANVAS_HEIGHT / 2 - barHeight / 2,
        barWidth - 1,
        barHeight
      )
    }
  }, [])

  // Draw pulse visualizer
  const drawPulse = useCallback((ctx, data) => {
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
    
    // Calculate average amplitude
    let sum = 0
    for (let i = 0; i < data.length; i++) {
      sum += data[i]
    }
    const average = sum / data.length / 255
    
    const centerX = CANVAS_WIDTH / 2
    const centerY = CANVAS_HEIGHT / 2
    const maxRadius = Math.min(centerX, centerY) - 20
    const radius = average * maxRadius
    
    // Create radial gradient
    const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius)
    gradient.addColorStop(0, 'rgba(0, 245, 255, 0.8)')
    gradient.addColorStop(0.7, 'rgba(255, 0, 110, 0.4)')
    gradient.addColorStop(1, 'rgba(131, 56, 236, 0.1)')
    
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
    ctx.fill()
    
    // Add outer ring
    ctx.strokeStyle = '#00f5ff'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
    ctx.stroke()
  }, [])

  // Draw circular visualizer
  const drawCircular = useCallback((ctx, data) => {
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
    
    const centerX = CANVAS_WIDTH / 2
    const centerY = CANVAS_HEIGHT / 2
    const innerRadius = 40
    const maxRadius = Math.min(centerX, centerY) - 20
    const bars = 64
    
    for (let i = 0; i < bars; i++) {
      const dataIndex = Math.floor((i / bars) * data.length)
      const value = data[dataIndex] / 255
      const barHeight = value * (maxRadius - innerRadius)
      
      const angle = (i / bars) * Math.PI * 2
      const startRadius = innerRadius
      const endRadius = innerRadius + barHeight
      
      // Calculate positions
      const startX = centerX + Math.cos(angle) * startRadius
      const startY = centerY + Math.sin(angle) * startRadius
      const endX = centerX + Math.cos(angle) * endRadius
      const endY = centerY + Math.sin(angle) * endRadius
      
      // Color based on position
      const hue = (i / bars) * 360
      ctx.strokeStyle = `hsl(${hue}, 100%, 60%)`
      ctx.lineWidth = 3
      
      ctx.beginPath()
      ctx.moveTo(startX, startY)
      ctx.lineTo(endX, endY)
      ctx.stroke()
    }
  }, [])

  // Draw spiral visualizer
  const drawSpiral = useCallback((ctx, data) => {
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
    
    const centerX = CANVAS_WIDTH / 2
    const centerY = CANVAS_HEIGHT / 2
    const maxRadius = Math.min(centerX, centerY) - 20
    
    ctx.beginPath()
    ctx.strokeStyle = '#00f5ff'
    ctx.lineWidth = 2
    
    for (let i = 0; i < data.length; i++) {
      const value = data[i] / 255
      const angle = (i / data.length) * Math.PI * 6 // Multiple spirals
      const radius = (i / data.length) * maxRadius + value * 20
      
      const x = centerX + Math.cos(angle) * radius
      const y = centerY + Math.sin(angle) * radius
      
      if (i === 0) {
        ctx.moveTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }
    }
    
    ctx.stroke()
  }, [])

  // Draw particle visualizer
  const drawParticle = useCallback((ctx, data) => {
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
    
    // Calculate energy
    let energy = 0
    for (let i = 0; i < data.length; i++) {
      energy += data[i]
    }
    energy = energy / data.length / 255
    
    const particles = particlesRef.current
    
    // Update particles
    particles.forEach((particle, index) => {
      // Apply audio influence
      const influence = energy * 2
      particle.vx += (Math.random() - 0.5) * influence
      particle.vy += (Math.random() - 0.5) * influence
      
      // Apply damping
      particle.vx *= 0.98
      particle.vy *= 0.98
      
      // Update position
      particle.x += particle.vx
      particle.y += particle.vy
      
      // Update life
      particle.life -= 0.01
      
      // Wrap around edges
      if (particle.x < 0) particle.x = CANVAS_WIDTH
      if (particle.x > CANVAS_WIDTH) particle.x = 0
      if (particle.y < 0) particle.y = CANVAS_HEIGHT
      if (particle.y > CANVAS_HEIGHT) particle.y = 0
      
      // Reset particle if life is over
      if (particle.life <= 0) {
        particle.x = Math.random() * CANVAS_WIDTH
        particle.y = Math.random() * CANVAS_HEIGHT
        particle.vx = (Math.random() - 0.5) * 2
        particle.vy = (Math.random() - 0.5) * 2
        particle.life = 1
      }
      
      // Draw particle
      const alpha = particle.life * energy
      ctx.fillStyle = `rgba(0, 245, 255, ${alpha})`
      ctx.beginPath()
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2)
      ctx.fill()
    })
  }, [])

  // Main render function
  const render = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    
    if (!ctx || !canvasReady || !isPlaying || !analyser) {
      // Clear canvas when not playing
      if (ctx) {
        ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
      }
      return
    }

    const data = getFrequencyData(analyser)

    switch (style) {
      case 'bars':
        drawBars(ctx, data)
        break
      case 'mirror':
        drawMirror(ctx, data)
        break
      case 'pulse':
        drawPulse(ctx, data)
        break
      case 'circular':
        drawCircular(ctx, data)
        break
      case 'spiral':
        drawSpiral(ctx, data)
        break
      case 'particle':
        drawParticle(ctx, data)
        break
      default:
        drawBars(ctx, data)
    }

    if (isPlaying) {
      animationFrameRef.current = requestAnimationFrame(render)
    }
  }, [analyser, isPlaying, style, canvasReady, getFrequencyData, drawBars, drawMirror, drawPulse, drawCircular, drawSpiral, drawParticle])

  // Initialize canvas
  useEffect(() => {
    setupCanvas()
    initializeParticles()
  }, [setupCanvas, initializeParticles])

  // Start/stop animation
  useEffect(() => {
    if (isPlaying && analyser && canvasReady) {
      render()
    } else {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [isPlaying, analyser, canvasReady, render])

  return (
    <div className="enhanced-audio-visualizer">
      <div className="visualizer-controls">
        <label className="media-select-wrap">
          <span>Style</span>
          <select
            className="media-select"
            value={style}
            onChange={(e) => onStyleChange?.(e.target.value)}
          >
            {VISUALIZER_STYLES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="media-select-wrap">
          <span>Mode</span>
          <select
            className="media-select"
            value={mode}
            onChange={(e) => onModeChange?.(e.target.value)}
          >
            {VISUALIZER_MODES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="visualizer-canvas-container">
        <canvas
          ref={canvasRef}
          className="visualizer-canvas"
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
        />
        {!isPlaying && (
          <div className="visualizer-overlay">
            <span>Play audio to see visualization</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default EnhancedAudioVisualizer