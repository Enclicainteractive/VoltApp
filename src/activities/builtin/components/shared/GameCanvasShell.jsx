import React, { useEffect, useMemo, useRef } from 'react'
import { createGameShellAudio } from './gameShellAudio'

const backgrounds = {
  arcade: {
    base: 'radial-gradient(circle at top, #13233d 0%, #08111f 52%, #030712 100%)',
    grid: 'rgba(56,189,248,0.18)',
    particle: 'rgba(148,163,184,0.6)',
    glow: 'rgba(56,189,248,0.18)'
  },
  strategy: {
    base: 'radial-gradient(circle at top, #2b1a1a 0%, #130d12 50%, #04060b 100%)',
    grid: 'rgba(251,191,36,0.12)',
    particle: 'rgba(248,113,113,0.5)',
    glow: 'rgba(244,114,182,0.16)'
  },
  sport: {
    base: 'radial-gradient(circle at top, #12323a 0%, #09151f 48%, #03070f 100%)',
    grid: 'rgba(74,222,128,0.15)',
    particle: 'rgba(125,211,252,0.55)',
    glow: 'rgba(74,222,128,0.14)'
  },
  noir: {
    base: 'radial-gradient(circle at top, #26141d 0%, #100d17 52%, #05060a 100%)',
    grid: 'rgba(192,132,252,0.12)',
    particle: 'rgba(244,114,182,0.45)',
    glow: 'rgba(192,132,252,0.14)'
  }
}

const defaultHeaderStyle = {
  position: 'absolute',
  top: 14,
  left: 14,
  zIndex: 3,
  width: 'min(280px, calc(100vw - 28px))',
  borderRadius: 18,
  border: '1px solid rgba(148,163,184,0.18)',
  background: 'rgba(2,6,23,0.68)',
  backdropFilter: 'blur(12px)',
  padding: 14,
  color: '#e2e8f0',
  pointerEvents: 'auto'
}

const GameCanvasBackdrop = ({ skin = 'arcade', interactive = true }) => {
  const canvasRef = useRef(null)
  const pointerRef = useRef({ x: 0.5, y: 0.5, active: false })
  const theme = backgrounds[skin] || backgrounds.arcade

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined
    let raf = 0
    let frame = 0
    const particles = Array.from({ length: 28 }, (_, index) => ({
      x: ((index * 37) % 100) / 100,
      y: ((index * 19) % 100) / 100,
      radius: 1.5 + ((index * 11) % 7),
      speed: 0.0005 + (index % 5) * 0.00015
    }))

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      canvas.width = width * dpr
      canvas.height = height * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const draw = () => {
      frame += 1
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      ctx.clearRect(0, 0, width, height)

      ctx.fillStyle = theme.glow
      const pointerX = pointerRef.current.x * width
      const pointerY = pointerRef.current.y * height
      const glow = ctx.createRadialGradient(pointerX, pointerY, 0, pointerX, pointerY, Math.max(width, height) * 0.42)
      glow.addColorStop(0, theme.glow)
      glow.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = glow
      ctx.fillRect(0, 0, width, height)

      ctx.strokeStyle = theme.grid
      ctx.lineWidth = 1
      for (let x = 0; x <= width; x += 46) {
        ctx.beginPath()
        ctx.moveTo(x + (frame * 0.15) % 46, 0)
        ctx.lineTo(x + (frame * 0.15) % 46, height)
        ctx.stroke()
      }
      for (let y = 0; y <= height; y += 46) {
        ctx.beginPath()
        ctx.moveTo(0, y + (frame * 0.09) % 46)
        ctx.lineTo(width, y + (frame * 0.09) % 46)
        ctx.stroke()
      }

      particles.forEach((particle, index) => {
        particle.y = (particle.y + particle.speed) % 1.1
        const drift = Math.sin((frame * 0.012) + index) * 0.015
        const x = (particle.x + drift + (pointerRef.current.active ? (pointerRef.current.x - 0.5) * 0.04 : 0)) * width
        const y = particle.y * height
        ctx.beginPath()
        ctx.fillStyle = theme.particle
        ctx.arc(x, y, particle.radius, 0, Math.PI * 2)
        ctx.fill()
      })

      raf = window.requestAnimationFrame(draw)
    }

    raf = window.requestAnimationFrame(draw)
    return () => {
      window.cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [theme.glow, theme.grid, theme.particle])

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.96 }}
      onPointerMove={interactive ? (event) => {
        const rect = event.currentTarget.getBoundingClientRect()
        pointerRef.current = {
          x: (event.clientX - rect.left) / rect.width,
          y: (event.clientY - rect.top) / rect.height,
          active: true
        }
      } : undefined}
      onPointerLeave={interactive ? () => { pointerRef.current.active = false } : undefined}
    />
  )
}

const GameCanvasShell = ({
  title,
  subtitle,
  status,
  skin = 'arcade',
  musicProfile = 'arcade',
  musicEnabled = true,
  interactiveBackdrop = true,
  header = true,
  headerSlot = null,
  headerPointerEvents = 'none',
  backgroundNode = null,
  layout = 'center',
  contentPointerEvents = 'auto',
  contentStyle,
  children
}) => {
  const audioRef = useRef(null)
  const theme = backgrounds[skin] || backgrounds.arcade
  const shellStyle = useMemo(() => ({
    position: 'relative',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    background: theme.base,
    color: '#f8fafc'
  }), [theme.base])

  useEffect(() => {
    if (!musicEnabled) return undefined
    if (!audioRef.current) audioRef.current = createGameShellAudio(musicProfile)
    const audio = audioRef.current
    const arm = () => audio.start(0.42)
    window.addEventListener('pointerdown', arm, { once: true })
    window.addEventListener('keydown', arm, { once: true })
    return () => {
      window.removeEventListener('pointerdown', arm)
      window.removeEventListener('keydown', arm)
      audio.stop()
    }
  }, [musicEnabled, musicProfile])

  useEffect(() => () => {
    audioRef.current?.dispose?.()
  }, [])

  return (
    <div style={shellStyle}>
      <GameCanvasBackdrop skin={skin} interactive={interactiveBackdrop} />
      {backgroundNode ? <div style={{ position: 'absolute', inset: 0 }}>{backgroundNode}</div> : null}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0))', pointerEvents: 'none' }} />
      {header ? (
        <div style={{ ...defaultHeaderStyle, pointerEvents: headerPointerEvents }}>
          <div style={{ fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#93c5fd' }}>{title}</div>
          {subtitle ? <div style={{ marginTop: 6, fontSize: 20, fontWeight: 900, lineHeight: 1 }}>{subtitle}</div> : null}
          {status ? <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.55, color: '#cbd5e1' }}>{status}</div> : null}
          {headerSlot ? <div style={{ marginTop: 10, pointerEvents: 'auto' }}>{headerSlot}</div> : null}
        </div>
      ) : null}
      <div
        style={layout === 'stretch'
          ? { position: 'absolute', inset: 0, zIndex: 2, pointerEvents: contentPointerEvents, ...contentStyle }
          : {
            position: 'absolute',
            inset: 0,
            zIndex: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            pointerEvents: contentPointerEvents,
            ...contentStyle
          }}
      >
        {children}
      </div>
    </div>
  )
}

export default GameCanvasShell
