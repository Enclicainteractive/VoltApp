import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Play, Square, Volume2, VolumeX, Users, Activity, Copy, Eraser, Wand2 } from 'lucide-react'

const STEPS = 16
const SCENES = 8
const ARRANGEMENT_BARS = 16
const HOST_CLAIM_DELAY_MS = 1200
const SYNC_SUPPRESS_MS = 700

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value)

const TRACK_LIBRARY = [
  { id: 'kick', name: 'Kick', type: 'drum', color: '#ef4444', note: 56 },
  { id: 'snare', name: 'Snare', type: 'drum', color: '#f59e0b', note: 180 },
  { id: 'hihat', name: 'Hi-Hat', type: 'drum', color: '#10b981', note: 320 },
  { id: 'clap', name: 'Clap', type: 'drum', color: '#f97316', note: 220 },
  { id: 'bass', name: 'Bass', type: 'synth', color: '#3b82f6', note: 82.41 },
  { id: 'chord', name: 'Chord', type: 'synth', color: '#8b5cf6', note: 220.0 },
  { id: 'lead', name: 'Lead', type: 'synth', color: '#a855f7', note: 329.63 },
  { id: 'arp', name: 'Arp', type: 'synth', color: '#06b6d4', note: 392.0 }
]

const makeSceneSteps = () => Array(STEPS).fill(false)
const makePatterns = () => Array.from({ length: SCENES }, () => makeSceneSteps())

const buildDefaultTracks = () => TRACK_LIBRARY.map((track, idx) => ({
  id: track.id,
  name: track.name,
  type: track.type,
  color: track.color,
  baseFrequency: track.note,
  volume: idx < 4 ? 0.82 : 0.72,
  muted: false,
  patterns: makePatterns()
}))

const buildDefaultArrangement = () => {
  const arrangement = Array(ARRANGEMENT_BARS).fill(0)
  arrangement[4] = 1
  arrangement[8] = 2
  arrangement[12] = 3
  return arrangement
}

const cloneTrack = (track) => ({
  ...track,
  patterns: Array.isArray(track.patterns)
    ? track.patterns.map((scene) => Array.isArray(scene) ? scene.map(Boolean).slice(0, STEPS) : makeSceneSteps())
    : makePatterns()
})

const cloneTracks = (tracks) => tracks.map(cloneTrack)

const sanitizePatterns = (rawPatterns) => {
  const patterns = Array.from({ length: SCENES }, (_, sceneIndex) => {
    const rawScene = Array.isArray(rawPatterns) ? rawPatterns[sceneIndex] : null
    const scene = Array.isArray(rawScene) ? rawScene.slice(0, STEPS).map(Boolean) : makeSceneSteps()
    while (scene.length < STEPS) scene.push(false)
    return scene
  })
  return patterns
}

const sanitizeTracks = (inputTracks) => {
  const defaults = buildDefaultTracks()
  if (!Array.isArray(inputTracks) || inputTracks.length === 0) return defaults

  const baseById = new Map(TRACK_LIBRARY.map((t) => [t.id, t]))
  const seen = new Set()
  const sanitized = []

  for (const raw of inputTracks) {
    if (!raw || typeof raw !== 'object') continue
    const id = typeof raw.id === 'string' ? raw.id : ''
    const base = baseById.get(id)
    if (!base || seen.has(id)) continue
    seen.add(id)

    sanitized.push({
      id,
      name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.slice(0, 32) : base.name,
      type: base.type,
      color: typeof raw.color === 'string' ? raw.color : base.color,
      baseFrequency: clamp(isFiniteNumber(raw.baseFrequency) ? raw.baseFrequency : base.note, 20, 2400),
      volume: clamp(isFiniteNumber(raw.volume) ? raw.volume : 0.75, 0, 1),
      muted: !!raw.muted,
      patterns: sanitizePatterns(raw.patterns)
    })
  }

  for (const track of defaults) {
    if (!seen.has(track.id)) sanitized.push(track)
  }

  return sanitized
}

const sanitizeArrangement = (raw) => {
  const output = Array.from({ length: ARRANGEMENT_BARS }, (_, index) => {
    const value = Array.isArray(raw) ? raw[index] : 0
    return Number.isInteger(value) ? clamp(value, 0, SCENES - 1) : 0
  })
  return output
}

const sanitizeDawState = (rawState, fallbackHostId = null) => {
  const state = rawState && typeof rawState === 'object' ? rawState : {}
  return {
    hostId: typeof state.hostId === 'string' && state.hostId ? state.hostId : fallbackHostId,
    bpm: clamp(isFiniteNumber(state.bpm) ? state.bpm : 122, 60, 190),
    swing: clamp(isFiniteNumber(state.swing) ? state.swing : 0.08, 0, 0.5),
    isPlaying: !!state.isPlaying,
    playMode: state.playMode === 'song' ? 'song' : 'pattern',
    selectedScene: clamp(Number.isInteger(state.selectedScene) ? state.selectedScene : 0, 0, SCENES - 1),
    selectedTrackId: typeof state.selectedTrackId === 'string' ? state.selectedTrackId : 'kick',
    currentStep: clamp(Number.isInteger(state.currentStep) ? state.currentStep : -1, -1, STEPS - 1),
    currentBar: clamp(Number.isInteger(state.currentBar) ? state.currentBar : 0, 0, ARRANGEMENT_BARS - 1),
    activeScene: clamp(Number.isInteger(state.activeScene) ? state.activeScene : 0, 0, SCENES - 1),
    masterVolume: clamp(isFiniteNumber(state.masterVolume) ? state.masterVolume : 0.9, 0, 1),
    tracks: sanitizeTracks(state.tracks),
    arrangement: sanitizeArrangement(state.arrangement),
    updatedAt: isFiniteNumber(state.updatedAt) ? state.updatedAt : Date.now()
  }
}

const DAWSequencerActivity = ({ sdk, session, currentUser }) => {
  if (!sdk) {
    return <div className="builtin-activity-loading"><div className="loading-spinner" /><p>Loading DAW...</p></div>
  }

  const myUserId = currentUser?.id || null
  const audioContextRef = useRef(null)
  const schedulerTimeoutRef = useRef(null)
  const hostClaimTimeoutRef = useRef(null)
  const suppressOutgoingUntilRef = useRef(0)
  const participantsRef = useRef([])

  const [participants, setParticipants] = useState([])
  const [dawState, setDawState] = useState(() => sanitizeDawState({ hostId: session?.hostId || null }, session?.hostId || null))

  const isHost = !!myUserId && dawState.hostId === myUserId
  const selectedTrack = dawState.tracks.find((track) => track.id === dawState.selectedTrackId) || dawState.tracks[0]

  const activeParticipantsCount = useMemo(() => {
    const unique = new Set(participants.map((p) => p.id).filter(Boolean))
    if (myUserId) unique.add(myUserId)
    return unique.size
  }, [participants, myUserId])

  const isSuppressed = useCallback(() => Date.now() < suppressOutgoingUntilRef.current, [])
  const suppressOutgoing = useCallback((ms = SYNC_SUPPRESS_MS) => {
    suppressOutgoingUntilRef.current = Date.now() + Math.max(0, ms)
  }, [])

  const setLocalState = useCallback((updater) => {
    setDawState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      return sanitizeDawState(next, prev.hostId || myUserId)
    })
  }, [myUserId])

  const ensureAudioContext = useCallback(async () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)()
    }
    if (audioContextRef.current.state === 'suspended') {
      try {
        await audioContextRef.current.resume()
      } catch {
        // Ignore resume failures (usually gesture-gated)
      }
    }
    return audioContextRef.current
  }, [])

  const emitHostEvent = useCallback((eventType, payload = {}) => {
    if (!isHost || !sdk || isSuppressed()) return
    sdk.emitEvent(eventType, { ...payload, actorId: myUserId }, { serverRelay: true })
  }, [isHost, sdk, isSuppressed, myUserId])

  const pushHostState = useCallback((nextState) => {
    if (!isHost || !sdk || isSuppressed()) return
    sdk.updateState({
      daw: {
        ...nextState,
        tracks: cloneTracks(nextState.tracks),
        arrangement: [...nextState.arrangement],
        updatedAt: Date.now()
      }
    }, { serverRelay: true })
  }, [isHost, sdk, isSuppressed])

  const playVoice = useCallback((ctx, frequency, volume, lengthMs, shape = 'sawtooth', sweepTo = null) => {
    const osc = ctx.createOscillator()
    const amp = ctx.createGain()

    osc.type = shape
    osc.frequency.setValueAtTime(frequency, ctx.currentTime)

    if (isFiniteNumber(sweepTo) && sweepTo > 10) {
      osc.frequency.exponentialRampToValueAtTime(sweepTo, ctx.currentTime + lengthMs / 1000)
    }

    amp.gain.setValueAtTime(0.0001, ctx.currentTime)
    amp.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.008)
    amp.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + lengthMs / 1000)

    osc.connect(amp)
    amp.connect(ctx.destination)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + lengthMs / 1000 + 0.02)
  }, [])

  const playStep = useCallback(async (step, sceneIndex, tracks, masterVolume) => {
    const ctx = await ensureAudioContext()
    const clampedMaster = clamp(masterVolume, 0, 1)

    for (const track of tracks) {
      if (!track || track.muted) continue
      const scene = track.patterns?.[sceneIndex]
      if (!Array.isArray(scene) || !scene[step]) continue

      const gain = clamp(track.volume * clampedMaster, 0, 1)
      if (gain <= 0.001) continue

      if (track.type === 'drum') {
        playVoice(ctx, clamp(track.baseFrequency, 20, 1200), gain, 90, 'triangle', clamp(track.baseFrequency * 0.5, 20, 800))
      } else if (track.id === 'bass') {
        playVoice(ctx, clamp(track.baseFrequency, 30, 440), gain * 0.95, 200, 'square')
      } else if (track.id === 'chord') {
        const root = clamp(track.baseFrequency, 110, 880)
        playVoice(ctx, root, gain * 0.55, 220, 'sawtooth')
        playVoice(ctx, root * 1.25, gain * 0.45, 220, 'triangle')
        playVoice(ctx, root * 1.5, gain * 0.35, 220, 'triangle')
      } else {
        playVoice(ctx, clamp(track.baseFrequency, 80, 1600), gain * 0.8, 150, 'sawtooth')
      }
    }
  }, [ensureAudioContext, playVoice])

  const getNextClockState = useCallback((prev) => {
    const nextStep = (prev.currentStep + 1 + STEPS) % STEPS
    const wrapped = nextStep === 0
    const nextBar = wrapped ? (prev.currentBar + 1) % ARRANGEMENT_BARS : prev.currentBar

    const activeScene = prev.playMode === 'song'
      ? clamp(prev.arrangement[nextBar] ?? 0, 0, SCENES - 1)
      : clamp(prev.selectedScene, 0, SCENES - 1)

    return {
      ...prev,
      currentStep: nextStep,
      currentBar: nextBar,
      activeScene,
      updatedAt: Date.now()
    }
  }, [])

  const scheduleTick = useCallback(() => {
    if (!isHost) return

    setLocalState((prev) => {
      if (!prev.isPlaying) return prev
      const next = getNextClockState(prev)

      playStep(next.currentStep, next.activeScene, next.tracks, next.masterVolume)

      emitHostEvent('daw:clock', {
        currentStep: next.currentStep,
        currentBar: next.currentBar,
        activeScene: next.activeScene,
        isPlaying: true
      })

      return next
    })
  }, [isHost, setLocalState, getNextClockState, playStep, emitHostEvent])

  useEffect(() => {
    if (!isHost || !dawState.isPlaying) {
      if (schedulerTimeoutRef.current) {
        clearTimeout(schedulerTimeoutRef.current)
        schedulerTimeoutRef.current = null
      }
      return
    }

    const run = () => {
      scheduleTick()

      const stepMsBase = (60_000 / clamp(dawState.bpm, 60, 190)) / 4
      const isOdd = (dawState.currentStep + 1) % 2 === 1
      const swingOffset = dawState.swing * stepMsBase * (isOdd ? 1 : -1)
      const delay = Math.max(35, stepMsBase + swingOffset)

      schedulerTimeoutRef.current = setTimeout(run, delay)
    }

    schedulerTimeoutRef.current = setTimeout(run, 20)

    return () => {
      if (schedulerTimeoutRef.current) {
        clearTimeout(schedulerTimeoutRef.current)
        schedulerTimeoutRef.current = null
      }
    }
  }, [isHost, dawState.isPlaying, dawState.bpm, dawState.swing, dawState.currentStep, scheduleTick])

  useEffect(() => {
    if (!sdk) return

    const offState = sdk.subscribeServerState((state) => {
      if (!state?.daw || typeof state.daw !== 'object') return

      const incoming = sanitizeDawState(state.daw, session?.hostId || null)
      suppressOutgoing(650)

      setDawState((prev) => {
        const prevTs = isFiniteNumber(prev.updatedAt) ? prev.updatedAt : 0
        const nextTs = isFiniteNumber(incoming.updatedAt) ? incoming.updatedAt : Date.now()
        if (nextTs < prevTs) return prev
        return incoming
      })
    })

    const offEvent = sdk.on('event', (evt = {}) => {
      const eventType = evt.eventType
      const payload = evt.payload && typeof evt.payload === 'object' ? evt.payload : {}

      if (eventType === 'daw:join') {
        const joined = payload.user && typeof payload.user === 'object' ? payload.user : null
        if (joined?.id) {
          setParticipants((prev) => {
            const next = prev.filter((entry) => entry.id !== joined.id)
            next.push({ id: joined.id, username: joined.username || 'User' })
            participantsRef.current = next
            return next
          })

          if (isHost && joined.id !== myUserId) {
            const snapshot = sanitizeDawState(dawState, myUserId)
            sdk.emitEvent('daw:sync-state', {
              targetUserId: joined.id,
              state: {
                ...snapshot,
                tracks: cloneTracks(snapshot.tracks),
                arrangement: [...snapshot.arrangement]
              }
            }, { serverRelay: true })
          }
        }
        return
      }

      if (eventType === 'daw:leave') {
        const userId = typeof payload.userId === 'string' ? payload.userId : null
        if (!userId) return
        setParticipants((prev) => {
          const next = prev.filter((entry) => entry.id !== userId)
          participantsRef.current = next
          return next
        })
        return
      }

      if (eventType === 'daw:sync-request') {
        const targetUserId = typeof payload.userId === 'string' ? payload.userId : null
        if (!isHost || !targetUserId || targetUserId === myUserId) return

        const snapshot = sanitizeDawState(dawState, myUserId)
        sdk.emitEvent('daw:sync-state', {
          targetUserId,
          state: {
            ...snapshot,
            tracks: cloneTracks(snapshot.tracks),
            arrangement: [...snapshot.arrangement]
          }
        }, { serverRelay: true })
        return
      }

      if (eventType === 'daw:sync-state') {
        if (payload.targetUserId && payload.targetUserId !== myUserId) return
        suppressOutgoing(850)
        setDawState((prev) => sanitizeDawState(payload.state, prev.hostId || session?.hostId || null))
        return
      }

      if (eventType === 'daw:clock') {
        if (isHost) return

        const nextStep = Number.isInteger(payload.currentStep) ? clamp(payload.currentStep, -1, STEPS - 1) : -1
        const nextBar = Number.isInteger(payload.currentBar) ? clamp(payload.currentBar, 0, ARRANGEMENT_BARS - 1) : 0
        const nextScene = Number.isInteger(payload.activeScene) ? clamp(payload.activeScene, 0, SCENES - 1) : 0
        const shouldPlay = payload.isPlaying !== false

        suppressOutgoing(450)
        setDawState((prev) => {
          const next = {
            ...prev,
            currentStep: nextStep,
            currentBar: nextBar,
            activeScene: nextScene,
            isPlaying: shouldPlay
          }

          if (shouldPlay && nextStep >= 0) {
            playStep(nextStep, nextScene, next.tracks, next.masterVolume)
          }

          return next
        })
      }
    })

    if (myUserId) {
      sdk.emitEvent('daw:join', { user: { id: myUserId, username: currentUser?.username || 'You' } }, { serverRelay: true })
      sdk.emitEvent('daw:sync-request', { userId: myUserId }, { serverRelay: true })
    }

    hostClaimTimeoutRef.current = setTimeout(() => {
      setDawState((prev) => {
        if (prev.hostId || !myUserId) return prev
        const claimed = { ...prev, hostId: myUserId, updatedAt: Date.now() }
        sdk.updateState({ daw: claimed }, { serverRelay: true })
        return claimed
      })
    }, HOST_CLAIM_DELAY_MS)

    return () => {
      offState?.()
      offEvent?.()
      if (hostClaimTimeoutRef.current) clearTimeout(hostClaimTimeoutRef.current)
      if (myUserId) {
        sdk.emitEvent('daw:leave', { userId: myUserId }, { serverRelay: true })
      }
    }
  }, [sdk, session?.hostId, myUserId, currentUser?.username, isHost, dawState, suppressOutgoing, playStep])

  useEffect(() => {
    return () => {
      if (schedulerTimeoutRef.current) clearTimeout(schedulerTimeoutRef.current)
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {})
      }
    }
  }, [])

  const withHostMutation = useCallback((mutator, emitNetwork = true) => {
    if (!isHost) return

    setLocalState((prev) => {
      const next = sanitizeDawState(mutator(prev), prev.hostId || myUserId)
      if (emitNetwork) pushHostState(next)
      return next
    })
  }, [isHost, setLocalState, myUserId, pushHostState])

  const toggleCell = (trackId, sceneIndex, step) => {
    withHostMutation((prev) => ({
      ...prev,
      tracks: prev.tracks.map((track) => {
        if (track.id !== trackId) return track
        const patterns = track.patterns.map((scene) => [...scene])
        patterns[sceneIndex][step] = !patterns[sceneIndex][step]
        return { ...track, patterns }
      }),
      updatedAt: Date.now()
    }))
  }

  const randomizeScene = () => {
    withHostMutation((prev) => ({
      ...prev,
      tracks: prev.tracks.map((track, trackIndex) => {
        const patterns = track.patterns.map((scene) => [...scene])
        patterns[prev.selectedScene] = patterns[prev.selectedScene].map((_, idx) => {
          const chance = trackIndex < 4 ? 0.26 : 0.18
          return Math.random() < chance && idx % (trackIndex % 2 === 0 ? 2 : 1) === 0
        })
        return { ...track, patterns }
      }),
      updatedAt: Date.now()
    }))
  }

  const clearScene = () => {
    withHostMutation((prev) => ({
      ...prev,
      tracks: prev.tracks.map((track) => {
        const patterns = track.patterns.map((scene) => [...scene])
        patterns[prev.selectedScene] = Array(STEPS).fill(false)
        return { ...track, patterns }
      }),
      updatedAt: Date.now()
    }))
  }

  const duplicateScene = () => {
    withHostMutation((prev) => {
      const source = prev.selectedScene
      const destination = (source + 1) % SCENES
      return {
        ...prev,
        tracks: prev.tracks.map((track) => {
          const patterns = track.patterns.map((scene) => [...scene])
          patterns[destination] = [...patterns[source]]
          return { ...track, patterns }
        }),
        selectedScene: destination,
        updatedAt: Date.now()
      }
    })
  }

  const setTrackVolume = (trackId, value) => {
    const volume = clamp(Number(value), 0, 1)
    withHostMutation((prev) => ({
      ...prev,
      tracks: prev.tracks.map((track) => track.id === trackId ? { ...track, volume } : track),
      updatedAt: Date.now()
    }))
  }

  const toggleTrackMute = (trackId) => {
    withHostMutation((prev) => ({
      ...prev,
      tracks: prev.tracks.map((track) => track.id === trackId ? { ...track, muted: !track.muted } : track),
      updatedAt: Date.now()
    }))
  }

  const setArrangementScene = (barIndex, sceneIndex) => {
    withHostMutation((prev) => {
      const arrangement = [...prev.arrangement]
      arrangement[barIndex] = clamp(sceneIndex, 0, SCENES - 1)
      return { ...prev, arrangement, updatedAt: Date.now() }
    })
  }

  const cycleArrangementScene = (barIndex) => {
    withHostMutation((prev) => {
      const arrangement = [...prev.arrangement]
      arrangement[barIndex] = (arrangement[barIndex] + 1) % SCENES
      return { ...prev, arrangement, updatedAt: Date.now() }
    })
  }

  const startTransport = async () => {
    if (!isHost) return
    await ensureAudioContext()

    withHostMutation((prev) => {
      const activeScene = prev.playMode === 'song'
        ? clamp(prev.arrangement[prev.currentBar] ?? 0, 0, SCENES - 1)
        : prev.selectedScene

      const next = {
        ...prev,
        isPlaying: true,
        activeScene,
        currentStep: -1,
        updatedAt: Date.now()
      }

      emitHostEvent('daw:clock', {
        currentStep: -1,
        currentBar: next.currentBar,
        activeScene,
        isPlaying: true
      })

      pushHostState(next)
      return next
    }, false)
  }

  const stopTransport = () => {
    if (!isHost) return

    withHostMutation((prev) => {
      const next = {
        ...prev,
        isPlaying: false,
        currentStep: -1,
        updatedAt: Date.now()
      }

      emitHostEvent('daw:clock', {
        currentStep: -1,
        currentBar: next.currentBar,
        activeScene: next.activeScene,
        isPlaying: false
      })

      pushHostState(next)
      return next
    }, false)
  }

  const resetSongPosition = () => {
    withHostMutation((prev) => ({
      ...prev,
      currentBar: 0,
      currentStep: -1,
      activeScene: prev.playMode === 'song' ? prev.arrangement[0] : prev.selectedScene,
      updatedAt: Date.now()
    }))
  }

  const sceneActivity = useMemo(() => {
    return Array.from({ length: SCENES }, (_, sceneIdx) => {
      let count = 0
      for (const track of dawState.tracks) {
        const steps = track.patterns?.[sceneIdx] || []
        for (const enabled of steps) if (enabled) count++
      }
      return count
    })
  }, [dawState.tracks])

  return (
    <div className="builtin-activity-body" style={{ padding: 16, display: 'grid', gap: 12, color: 'var(--volt-text-primary)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--volt-bg-secondary)', border: '1px solid var(--volt-border)', borderRadius: 12, padding: '12px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Activity size={18} />
          <strong>Volt DAW Studio</strong>
          <span style={{ fontSize: 12, opacity: 0.72 }}>
            {isHost ? 'Host producer mode' : 'Follower mode (host controls transport)'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, opacity: 0.85 }}>
          <Users size={14} /> {activeParticipantsCount}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'auto auto auto auto auto auto 1fr', gap: 10, alignItems: 'center', background: 'var(--volt-bg-secondary)', border: '1px solid var(--volt-border)', borderRadius: 12, padding: '10px 12px' }}>
        <button onClick={startTransport} disabled={!isHost || dawState.isPlaying} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--volt-border)', background: 'var(--volt-bg-tertiary)', color: 'inherit', opacity: (!isHost || dawState.isPlaying) ? 0.55 : 1 }}>
          <Play size={16} />
        </button>
        <button onClick={stopTransport} disabled={!isHost || !dawState.isPlaying} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--volt-border)', background: 'var(--volt-bg-tertiary)', color: 'inherit', opacity: (!isHost || !dawState.isPlaying) ? 0.55 : 1 }}>
          <Square size={16} />
        </button>
        <button onClick={resetSongPosition} disabled={!isHost} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--volt-border)', background: 'var(--volt-bg-tertiary)', color: 'inherit', opacity: !isHost ? 0.55 : 1 }}>
          Reset
        </button>

        <button onClick={() => withHostMutation((prev) => ({ ...prev, playMode: 'pattern', updatedAt: Date.now() }))} disabled={!isHost} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--volt-border)', background: dawState.playMode === 'pattern' ? 'rgba(59,130,246,0.25)' : 'var(--volt-bg-tertiary)', color: 'inherit', opacity: !isHost ? 0.6 : 1 }}>
          Pattern
        </button>
        <button onClick={() => withHostMutation((prev) => ({ ...prev, playMode: 'song', updatedAt: Date.now() }))} disabled={!isHost} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--volt-border)', background: dawState.playMode === 'song' ? 'rgba(16,185,129,0.25)' : 'var(--volt-bg-tertiary)', color: 'inherit', opacity: !isHost ? 0.6 : 1 }}>
          Song
        </button>

        <div style={{ minWidth: 140 }}>
          <label style={{ display: 'block', fontSize: 11, opacity: 0.7 }}>BPM {dawState.bpm}</label>
          <input type="range" min={60} max={190} step={1} value={dawState.bpm} disabled={!isHost} onChange={(e) => withHostMutation((prev) => ({ ...prev, bpm: clamp(Number(e.target.value), 60, 190), updatedAt: Date.now() }))} style={{ width: '100%' }} />
        </div>

        <div style={{ minWidth: 140 }}>
          <label style={{ display: 'block', fontSize: 11, opacity: 0.7 }}>Swing {Math.round(dawState.swing * 100)}%</label>
          <input type="range" min={0} max={0.5} step={0.01} value={dawState.swing} disabled={!isHost} onChange={(e) => withHostMutation((prev) => ({ ...prev, swing: clamp(Number(e.target.value), 0, 0.5), updatedAt: Date.now() }))} style={{ width: '100%' }} />
        </div>
      </div>

      <div style={{ background: 'var(--volt-bg-secondary)', border: '1px solid var(--volt-border)', borderRadius: 12, padding: 10, display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {Array.from({ length: SCENES }, (_, sceneIdx) => {
            const selected = dawState.selectedScene === sceneIdx
            const playingScene = dawState.activeScene === sceneIdx && dawState.isPlaying
            return (
              <button
                key={`scene-${sceneIdx}`}
                onClick={() => withHostMutation((prev) => ({ ...prev, selectedScene: sceneIdx, updatedAt: Date.now() }))}
                disabled={!isHost}
                style={{
                  padding: '6px 10px',
                  borderRadius: 8,
                  border: '1px solid var(--volt-border)',
                  background: selected ? 'rgba(59,130,246,0.28)' : (playingScene ? 'rgba(16,185,129,0.28)' : 'var(--volt-bg-tertiary)'),
                  color: 'inherit',
                  opacity: !isHost ? 0.65 : 1,
                  display: 'grid',
                  gap: 2,
                  minWidth: 72
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 600 }}>Scene {sceneIdx + 1}</span>
                <span style={{ fontSize: 10, opacity: 0.75 }}>{sceneActivity[sceneIdx]} notes</span>
              </button>
            )
          })}

          <button onClick={duplicateScene} disabled={!isHost} title="Duplicate scene to next" style={{ padding: 7, borderRadius: 8, border: '1px solid var(--volt-border)', background: 'var(--volt-bg-tertiary)', color: 'inherit', opacity: !isHost ? 0.6 : 1 }}><Copy size={14} /></button>
          <button onClick={clearScene} disabled={!isHost} title="Clear scene" style={{ padding: 7, borderRadius: 8, border: '1px solid var(--volt-border)', background: 'var(--volt-bg-tertiary)', color: 'inherit', opacity: !isHost ? 0.6 : 1 }}><Eraser size={14} /></button>
          <button onClick={randomizeScene} disabled={!isHost} title="Generate idea" style={{ padding: 7, borderRadius: 8, border: '1px solid var(--volt-border)', background: 'var(--volt-bg-tertiary)', color: 'inherit', opacity: !isHost ? 0.6 : 1 }}><Wand2 size={14} /></button>
        </div>
      </div>

      <div style={{ background: 'var(--volt-bg-secondary)', border: '1px solid var(--volt-border)', borderRadius: 12, padding: 10, display: 'grid', gap: 8, overflowX: 'auto' }}>
        {dawState.tracks.map((track) => {
          const sceneSteps = track.patterns[dawState.selectedScene] || makeSceneSteps()
          return (
            <div key={track.id} style={{ display: 'grid', gridTemplateColumns: '220px repeat(16, minmax(24px, 1fr))', gap: 6, alignItems: 'center' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 8, padding: '6px 8px', background: selectedTrack?.id === track.id ? 'rgba(59,130,246,0.12)' : 'var(--volt-bg-tertiary)', borderRadius: 8, borderLeft: `4px solid ${track.color}` }}>
                <div onClick={() => withHostMutation((prev) => ({ ...prev, selectedTrackId: track.id, updatedAt: Date.now() }))} style={{ cursor: isHost ? 'pointer' : 'default' }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{track.name}</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 2 }}>
                    <label style={{ fontSize: 11, opacity: 0.75 }}>Vol</label>
                    <input type="range" min={0} max={1} step={0.01} value={track.volume} disabled={!isHost} onChange={(e) => setTrackVolume(track.id, e.target.value)} style={{ width: 90 }} />
                  </div>
                </div>
                <button onClick={() => toggleTrackMute(track.id)} disabled={!isHost} style={{ border: '1px solid var(--volt-border)', background: track.muted ? 'rgba(239,68,68,0.2)' : 'transparent', color: 'inherit', borderRadius: 7, padding: 6, opacity: !isHost ? 0.55 : 1 }}>
                  {track.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                </button>
              </div>

              {sceneSteps.map((enabled, stepIndex) => {
                const isNow = stepIndex === dawState.currentStep && dawState.activeScene === dawState.selectedScene && dawState.isPlaying
                return (
                  <button
                    key={`${track.id}-${dawState.selectedScene}-${stepIndex}`}
                    onClick={() => toggleCell(track.id, dawState.selectedScene, stepIndex)}
                    disabled={!isHost}
                    style={{
                      height: 28,
                      borderRadius: 6,
                      border: isNow ? `2px solid ${track.color}` : '1px solid var(--volt-border)',
                      background: enabled ? `${track.color}bb` : 'var(--volt-bg-tertiary)',
                      boxShadow: isNow ? `0 0 0 2px ${track.color}33 inset` : 'none',
                      opacity: !isHost ? 0.72 : 1,
                      transition: 'all 100ms ease'
                    }}
                  />
                )
              })}
            </div>
          )
        })}
      </div>

      <div style={{ background: 'var(--volt-bg-secondary)', border: '1px solid var(--volt-border)', borderRadius: 12, padding: 10, display: 'grid', gap: 8 }}>
        <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 600 }}>Arrangement (click bar to cycle scene)</div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${ARRANGEMENT_BARS}, minmax(38px, 1fr))`, gap: 6 }}>
          {dawState.arrangement.map((sceneIndex, barIndex) => {
            const isCurrentBar = dawState.currentBar === barIndex && dawState.isPlaying
            return (
              <button
                key={`bar-${barIndex}`}
                onClick={() => cycleArrangementScene(barIndex)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setArrangementScene(barIndex, dawState.selectedScene)
                }}
                disabled={!isHost}
                style={{
                  height: 42,
                  borderRadius: 8,
                  border: isCurrentBar ? '2px solid #10b981' : '1px solid var(--volt-border)',
                  background: isCurrentBar ? 'rgba(16,185,129,0.2)' : 'var(--volt-bg-tertiary)',
                  color: 'inherit',
                  opacity: !isHost ? 0.7 : 1,
                  display: 'grid',
                  placeItems: 'center',
                  gap: 1
                }}
              >
                <span style={{ fontSize: 10, opacity: 0.7 }}>B{barIndex + 1}</span>
                <span style={{ fontSize: 12, fontWeight: 700 }}>S{sceneIndex + 1}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div style={{ fontSize: 12, opacity: 0.75, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <span>
          {isHost ? 'Left-click steps to compose. Pattern mode loops current scene. Song mode follows arrangement bars.' : 'Viewing host session in follower mode.'}
        </span>
        <span>{dawState.isPlaying ? `Playing ${dawState.playMode === 'song' ? `Bar ${dawState.currentBar + 1}` : `Scene ${dawState.activeScene + 1}`}` : 'Stopped'}</span>
      </div>
    </div>
  )
}

export default DAWSequencerActivity
