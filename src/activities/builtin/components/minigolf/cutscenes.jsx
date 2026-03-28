/**
 * cutscenes.jsx - Cinematic cutscene system for MiniGolf
 * 
 * Provides dramatic camera animations and visual effects for key moments:
 * - Hole-in-one celebrations
 * - Course completions
 * - Black hole consumption (with camera follow-in)
 * - Perfect par achievements
 * - Comeback victories
 * - And more...
 */
import React, { useEffect, useRef, useState } from 'react'
import { MINIGOLF_CUTSCENE_TYPES } from './constants'

// Cutscene configuration - defines timing, camera movements, and visuals
const CUTSCENE_CONFIGS = {
  [MINIGOLF_CUTSCENE_TYPES.HOLE_IN_ONE]: {
    duration: 2800,
    label: '🎯 HOLE IN ONE!',
    sublabel: 'Incredible shot!',
    color: '#fbbf24',
    bgGradient: 'radial-gradient(circle, rgba(251,191,36,0.15), rgba(0,0,0,0.9))',
    particles: true,
    cameraZoom: true,
    skipable: true
  },
  [MINIGOLF_CUTSCENE_TYPES.EAGLE]: {
    duration: 2200,
    label: '🦅 EAGLE!',
    sublabel: '2 under par',
    color: '#22c55e',
    bgGradient: 'radial-gradient(circle, rgba(34,197,94,0.12), rgba(0,0,0,0.9))',
    particles: true,
    skipable: true
  },
  [MINIGOLF_CUTSCENE_TYPES.ALBATROSS]: {
    duration: 3000,
    label: '🦅 ALBATROSS!',
    sublabel: '3 under par - Legendary!',
    color: '#10b981',
    bgGradient: 'radial-gradient(circle, rgba(16,185,129,0.18), rgba(0,0,0,0.9))',
    particles: true,
    cameraZoom: true,
    skipable: true
  },
  [MINIGOLF_CUTSCENE_TYPES.PERFECT_PAR]: {
    duration: 2000,
    label: '✨ PERFECT PAR',
    sublabel: 'Exactly on target',
    color: '#38bdf8',
    bgGradient: 'radial-gradient(circle, rgba(56,189,248,0.1), rgba(0,0,0,0.9))',
    skipable: true
  },
  [MINIGOLF_CUTSCENE_TYPES.COURSE_COMPLETE]: {
    duration: 3500,
    label: '🏆 COURSE COMPLETE!',
    sublabel: 'Congratulations!',
    color: '#fbbf24',
    bgGradient: 'radial-gradient(circle, rgba(251,191,36,0.2), rgba(0,0,0,0.95))',
    particles: true,
    fireworks: true,
    skipable: true
  },
  [MINIGOLF_CUTSCENE_TYPES.COURSE_UNLOCK]: {
    duration: 3000,
    label: '🔓 NEW COURSE UNLOCKED!',
    sublabel: '',
    color: '#a855f7',
    bgGradient: 'radial-gradient(circle, rgba(168,85,247,0.15), rgba(0,0,0,0.95))',
    particles: true,
    skipable: true
  },
  [MINIGOLF_CUTSCENE_TYPES.POWERUP_COLLECTED]: {
    duration: 1500,
    label: '⚡ POWERUP!',
    sublabel: '',
    color: '#facc15',
    bgGradient: 'radial-gradient(circle, rgba(250,204,21,0.12), transparent)',
    skipable: true
  },
  [MINIGOLF_CUTSCENE_TYPES.COMEBACK_VICTORY]: {
    duration: 3200,
    label: '🔥 COMEBACK VICTORY!',
    sublabel: 'From behind to first place!',
    color: '#ef4444',
    bgGradient: 'radial-gradient(circle, rgba(239,68,68,0.18), rgba(0,0,0,0.95))',
    particles: true,
    fireworks: true,
    skipable: true
  },
  [MINIGOLF_CUTSCENE_TYPES.FIRST_PLACE_TAKEOVER]: {
    duration: 2400,
    label: '👑 FIRST PLACE!',
    sublabel: 'You\'ve taken the lead!',
    color: '#fbbf24',
    bgGradient: 'radial-gradient(circle, rgba(251,191,36,0.15), rgba(0,0,0,0.9))',
    particles: true,
    skipable: true
  },
  [MINIGOLF_CUTSCENE_TYPES.LAVA_RESET]: {
    duration: 1800,
    label: '🔥 INCINERATED',
    sublabel: 'Ball reset to checkpoint',
    color: '#ef4444',
    bgGradient: 'radial-gradient(circle, rgba(239,68,68,0.2), rgba(26,0,0,0.95))',
    shake: true,
    skipable: false
  },
  [MINIGOLF_CUTSCENE_TYPES.MOVING_HAZARD_HIT]: {
    duration: 1200,
    label: '💥 COLLISION!',
    sublabel: 'Hit by moving hazard',
    color: '#f59e0b',
    bgGradient: 'radial-gradient(circle, rgba(245,158,11,0.15), transparent)',
    shake: true,
    skipable: false
  }
}

/**
 * CutsceneOverlay - Renders a full-screen cutscene with animations
 */
export function CutsceneOverlay({ type, data = {}, onComplete, onSkip }) {
  const [progress, setProgress] = useState(0)
  const [skipped, setSkipped] = useState(false)
  const rafRef = useRef(null)
  const startRef = useRef(performance.now())
  const config = CUTSCENE_CONFIGS[type] || {
    duration: 2000,
    label: 'Event',
    sublabel: '',
    color: '#ffffff',
    bgGradient: 'radial-gradient(circle, rgba(255,255,255,0.1), rgba(0,0,0,0.9))',
    skipable: true
  }

  useEffect(() => {
    setProgress(0)
    setSkipped(false)
    startRef.current = performance.now()

    const tick = () => {
      const elapsed = performance.now() - startRef.current
      const p = Math.min(1, elapsed / config.duration)
      setProgress(p)

      if (p >= 1) {
        onComplete?.()
        return
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [type, config.duration, onComplete])

  useEffect(() => {
    if (!config.skipable) return
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' || e.key === ' ') {
        e.preventDefault()
        setSkipped(true)
        onSkip?.()
        onComplete?.()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [config.skipable, onSkip, onComplete])

  if (skipped) return null

  // Animation curves
  const fadeIn = progress < 0.15 ? progress / 0.15 : 1
  const fadeOut = progress > 0.85 ? 1 - (progress - 0.85) / 0.15 : 1
  const opacity = Math.min(fadeIn, fadeOut)
  const scale = 0.8 + (1 - Math.abs(progress - 0.5) * 2) * 0.2
  const shake = config.shake ? Math.sin(progress * 40) * (1 - progress) * 3 : 0

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      zIndex: 50,
      pointerEvents: config.skipable ? 'auto' : 'none',
      fontFamily: 'system-ui,-apple-system,sans-serif',
      background: config.bgGradient,
      opacity,
      transition: 'opacity 0.1s',
    }}>
      {/* Particle effects */}
      {config.particles && (
        <div style={{
          position: 'absolute',
          inset: 0,
          overflow: 'hidden',
          pointerEvents: 'none',
        }}>
          {Array.from({ length: 20 }, (_, i) => {
            const angle = (i / 20) * Math.PI * 2
            const distance = 30 + (progress * 70)
            const x = 50 + Math.cos(angle + progress * 2) * distance
            const y = 50 + Math.sin(angle + progress * 2) * distance
            const particleOpacity = (1 - progress) * 0.6
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: `${x}%`,
                  top: `${y}%`,
                  width: 4 + (i % 3) * 2,
                  height: 4 + (i % 3) * 2,
                  borderRadius: '50%',
                  background: config.color,
                  opacity: particleOpacity,
                  boxShadow: `0 0 ${8 + (i % 4) * 4}px ${config.color}`,
                  transform: `translate(-50%, -50%) scale(${1 + progress * 0.5})`,
                }}
              />
            )
          })}
        </div>
      )}

      {/* Fireworks */}
      {config.fireworks && progress > 0.3 && (
        <div style={{
          position: 'absolute',
          inset: 0,
          overflow: 'hidden',
          pointerEvents: 'none',
        }}>
          {Array.from({ length: 12 }, (_, i) => {
            const burstProgress = Math.max(0, (progress - 0.3 - i * 0.05) / 0.4)
            if (burstProgress <= 0) return null
            const x = 20 + (i * 7) % 60
            const y = 20 + (i * 11) % 60
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: `${x}%`,
                  top: `${y}%`,
                  width: 60 + burstProgress * 120,
                  height: 60 + burstProgress * 120,
                  borderRadius: '50%',
                  border: `2px solid ${config.color}`,
                  opacity: (1 - burstProgress) * 0.6,
                  transform: 'translate(-50%, -50%)',
                }}
              />
            )
          })}
        </div>
      )}

      {/* Main content */}
      <div style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        transform: `scale(${scale}) translateX(${shake}px)`,
      }}>
        <div style={{
          fontSize: 'clamp(32px, 6vw, 64px)',
          fontWeight: 900,
          color: config.color,
          letterSpacing: '-0.03em',
          textShadow: `0 0 30px ${config.color}, 0 0 60px ${config.color}88, 0 4px 20px rgba(0,0,0,0.5)`,
          textAlign: 'center',
          animation: 'minigolfCutscenePulse 1.5s ease-in-out infinite',
        }}>
          {config.label}
        </div>
        {(config.sublabel || data.sublabel) && (
          <div style={{
            fontSize: 'clamp(14px, 2vw, 18px)',
            color: 'rgba(255,255,255,0.85)',
            textAlign: 'center',
            maxWidth: 400,
            textShadow: '0 2px 10px rgba(0,0,0,0.5)',
          }}>
            {data.sublabel || config.sublabel}
          </div>
        )}
        {data.playerName && (
          <div style={{
            fontSize: 'clamp(16px, 2.5vw, 22px)',
            color: data.playerColor || '#ffffff',
            fontWeight: 600,
            textShadow: `0 0 20px ${data.playerColor || '#ffffff'}, 0 2px 10px rgba(0,0,0,0.5)`,
          }}>
            {data.playerName}
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div style={{
        position: 'absolute',
        bottom: 40,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'min(80%, 400px)',
        height: 4,
        background: 'rgba(255,255,255,0.15)',
        borderRadius: 2,
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${progress * 100}%`,
          height: '100%',
          background: config.color,
          transition: 'width 0.05s linear',
          boxShadow: `0 0 10px ${config.color}`,
        }} />
      </div>

      {/* Skip hint */}
      {config.skipable && progress < 0.9 && (
        <div style={{
          position: 'absolute',
          bottom: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: 11,
          color: 'rgba(255,255,255,0.5)',
          textAlign: 'center',
        }}>
          Press ESC or SPACE to skip
        </div>
      )}

      <style>{`
        @keyframes minigolfCutscenePulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
      `}</style>
    </div>
  )
}

/**
 * BlackHoleCutscene - Special cutscene with camera following ball into black hole
 * This creates a dramatic zoom-in effect as the ball gets consumed
 */
export function BlackHoleCutscene({ ballPosition, blackHolePosition, onComplete, cameraRef, controlsRef }) {
  const [phase, setPhase] = useState(0) // 0: zoom in, 1: darkness, 2: respawn
  const [progress, setProgress] = useState(0)
  const rafRef = useRef(null)
  const startRef = useRef(performance.now())
  
  const PHASES = [
    { name: 'zoom', duration: 1400 },
    { name: 'darkness', duration: 900 },
    { name: 'respawn', duration: 1200 }
  ]

  useEffect(() => {
    setPhase(0)
    setProgress(0)
    startRef.current = performance.now()
    let currentPhase = 0

    const tick = () => {
      const elapsed = performance.now() - startRef.current
      const phaseDur = PHASES[currentPhase]?.duration || 1000
      const p = Math.min(1, elapsed / phaseDur)
      setProgress(p)
      setPhase(currentPhase)

      // Animate camera during zoom phase
      if (currentPhase === 0 && cameraRef?.current && controlsRef?.current && ballPosition && blackHolePosition) {
        const targetX = ballPosition.x + (blackHolePosition.x - ballPosition.x) * p
        const targetZ = ballPosition.z + (blackHolePosition.z - ballPosition.z) * p
        const height = 12 * (1 - p * 0.85) // Zoom down from 12 to ~1.8
        const distance = 14 * (1 - p * 0.9) // Zoom in from 14 to ~1.4
        
        controlsRef.current.target.set(targetX, 0.1, targetZ)
        cameraRef.current.position.set(
          targetX,
          height,
          targetZ + distance
        )
        controlsRef.current.update()
      }

      if (p >= 1) {
        currentPhase += 1
        if (currentPhase >= PHASES.length) {
          onComplete?.()
          return
        }
        startRef.current = performance.now()
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [ballPosition, blackHolePosition, cameraRef, controlsRef, onComplete])

  const phaseName = PHASES[phase]?.name || 'zoom'
  
  // Visual effects per phase
  let overlayOpacity = 0
  let overlayBg = '#000000'
  let textOpacity = 0
  let vignetteStrength = 0

  if (phaseName === 'zoom') {
    vignetteStrength = progress * 0.95
    overlayOpacity = progress * 0.7
    overlayBg = `rgba(30,0,60,${progress * 0.7})`
  } else if (phaseName === 'darkness') {
    overlayOpacity = 1
    overlayBg = '#000000'
    textOpacity = progress > 0.3 ? (progress - 0.3) / 0.7 : 0
  } else if (phaseName === 'respawn') {
    overlayOpacity = 1 - progress
    overlayBg = '#000000'
    textOpacity = progress < 0.5 ? 1 - progress * 2 : 0
  }

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      zIndex: 60,
      pointerEvents: 'none',
      fontFamily: 'system-ui,-apple-system,sans-serif',
    }}>
      {/* Main overlay */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: overlayBg,
        opacity: overlayOpacity,
        transition: 'opacity 0.08s',
      }} />

      {/* Vignette */}
      {vignetteStrength > 0 && (
        <div style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(ellipse at center, transparent 15%, rgba(0,0,0,${vignetteStrength}) 100%)`,
        }} />
      )}

      {/* Spiral rings during zoom */}
      {phaseName === 'zoom' && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: progress,
        }}>
          {[0, 1, 2, 3].map(i => (
            <div key={i} style={{
              position: 'absolute',
              width: `${(4 - i) * 20 + 25}vmin`,
              height: `${(4 - i) * 20 + 25}vmin`,
              borderRadius: '50%',
              border: `${3 + i}px solid rgba(124,58,237,${0.35 + i * 0.15})`,
              transform: `rotate(${progress * 360 * (i % 2 === 0 ? 1 : -1) * (1 + i * 0.4)}deg) scale(${1 - progress * 0.5 + i * 0.06})`,
              boxShadow: `0 0 ${10 + i * 8}px rgba(124,58,237,0.5)`,
            }} />
          ))}
          <div style={{
            width: `${10 + progress * 15}vmin`,
            height: `${10 + progress * 15}vmin`,
            borderRadius: '50%',
            background: `radial-gradient(circle, rgba(0,0,0,1) 35%, rgba(124,58,237,0.9) 100%)`,
            boxShadow: '0 0 50px rgba(124,58,237,0.7), 0 0 100px rgba(0,0,0,0.9)',
          }} />
        </div>
      )}

      {/* Text during darkness phase */}
      {phaseName === 'darkness' && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: textOpacity,
          gap: 12,
        }}>
          <div style={{
            fontSize: 'clamp(28px, 5.5vw, 52px)',
            fontWeight: 900,
            color: '#7c3aed',
            letterSpacing: '-0.02em',
            textShadow: '0 0 25px #7c3aed, 0 0 50px #7c3aed88',
          }}>
            ⚫ CONSUMED
          </div>
          <div style={{
            fontSize: 'clamp(12px, 2vw, 16px)',
            color: 'rgba(255,255,255,0.75)',
            textAlign: 'center',
            maxWidth: 380,
          }}>
            Ball destroyed · +20 strokes · Replacement deployed
          </div>
        </div>
      )}

      {/* Respawn flash */}
      {phaseName === 'respawn' && progress < 0.4 && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <div style={{
            width: `${(1 - progress / 0.4) * 70}vmin`,
            height: `${(1 - progress / 0.4) * 70}vmin`,
            borderRadius: '50%',
            background: `radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(124,58,237,0.7) 50%, transparent 100%)`,
            opacity: 1 - progress / 0.4,
          }} />
        </div>
      )}
    </div>
  )
}

/**
 * Determine if a cutscene should be triggered based on shot result
 */
export function detectCutscene(result, playerState, leaderboard, holeIndex, holeCount) {
  const strokes = result?.strokesThisHole || playerState?.strokesThisHole || 0
  const par = result?.par || 3
  const relativeToPar = strokes - par

  // Hole in one
  if (strokes === 1 && result?.inHole) {
    return { type: MINIGOLF_CUTSCENE_TYPES.HOLE_IN_ONE, data: {} }
  }

  // Albatross (3 under par)
  if (relativeToPar === -3 && result?.inHole) {
    return { type: MINIGOLF_CUTSCENE_TYPES.ALBATROSS, data: {} }
  }

  // Eagle (2 under par)
  if (relativeToPar === -2 && result?.inHole) {
    return { type: MINIGOLF_CUTSCENE_TYPES.EAGLE, data: {} }
  }

  // Perfect par
  if (relativeToPar === 0 && result?.inHole && strokes === par) {
    return { type: MINIGOLF_CUTSCENE_TYPES.PERFECT_PAR, data: {} }
  }

  // Course complete
  if (result?.inHole && holeIndex === holeCount - 1) {
    return { type: MINIGOLF_CUTSCENE_TYPES.COURSE_COMPLETE, data: {} }
  }

  // Powerup collected (minor cutscene)
  if (result?.awardedPowerup) {
    return {
      type: MINIGOLF_CUTSCENE_TYPES.POWERUP_COLLECTED,
      data: { sublabel: `Collected ${result.awardedPowerup.label}` }
    }
  }

  // Moving hazard hit
  if (result?.collisionCount > 2 && result?.resultType !== 'cup') {
    return { type: MINIGOLF_CUTSCENE_TYPES.MOVING_HAZARD_HIT, data: {} }
  }

  return null
}

/**
 * Detect leaderboard-based cutscenes (first place takeover, comeback)
 */
export function detectLeaderboardCutscene(prevLeaderboard, newLeaderboard, playerId) {
  if (!prevLeaderboard?.length || !newLeaderboard?.length) return null

  const prevPosition = prevLeaderboard.findIndex(p => p.id === playerId)
  const newPosition = newLeaderboard.findIndex(p => p.id === playerId)
  const prevLeader = prevLeaderboard[0]?.id
  const newLeader = newLeaderboard[0]?.id

  // First place takeover
  if (newPosition === 0 && prevPosition > 0 && newLeader === playerId && prevLeader !== playerId) {
    return {
      type: MINIGOLF_CUTSCENE_TYPES.FIRST_PLACE_TAKEOVER,
      data: { playerName: newLeaderboard[0]?.username }
    }
  }

  // Comeback victory (from 3rd+ to 1st)
  if (newPosition === 0 && prevPosition >= 2 && newLeader === playerId) {
    return {
      type: MINIGOLF_CUTSCENE_TYPES.COMEBACK_VICTORY,
      data: { playerName: newLeaderboard[0]?.username }
    }
  }

  return null
}
