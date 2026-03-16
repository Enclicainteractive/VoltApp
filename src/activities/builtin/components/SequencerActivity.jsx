import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/* ── SVG Icon Components ── */
const PlayIcon = ({ size = 16 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" stroke="none" aria-hidden="true">
    <polygon points="6,3 20,12 6,21" />
  </svg>
)
const StopIcon = ({ size = 16 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" stroke="none" aria-hidden="true">
    <rect x="4" y="4" width="16" height="16" rx="2" />
  </svg>
)
const ImportIcon = ({ size = 16 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
)
const PlusIcon = ({ size = 14 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
)
const TrashIcon = ({ size = 14 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
  </svg>
)
const MuteIcon = ({ size = 14 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" />
    <line x1="23" y1="9" x2="17" y2="15" />
    <line x1="17" y1="9" x2="23" y2="15" />
  </svg>
)
const UnmuteIcon = ({ size = 14 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" />
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
  </svg>
)
const SoloIcon = ({ size = 14 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <text x="12" y="16" textAnchor="middle" fill="currentColor" stroke="none" fontSize="12" fontWeight="bold">S</text>
  </svg>
)
const ClearIcon = ({ size = 14 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <line x1="9" y1="9" x2="15" y2="15" />
    <line x1="15" y1="9" x2="9" y2="15" />
  </svg>
)
const RemoveIcon = ({ size = 14 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <line x1="8" y1="12" x2="16" y2="12" />
  </svg>
)

const STEPS_PER_BAR = 16
const DEFAULT_BPM = 118
const DEFAULT_SWING = 8
const DEFAULT_BARS = 4
const MIN_BARS = 1
const MAX_BARS = 8
const MAX_TRACKS = 10
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const SYNTH_ENGINES = ['analog', 'fm', 'supersaw', 'pulse', 'glass', 'sub', 'pluck', 'noise']
const EFFECT_LIBRARY = ['filter', 'drive', 'chorus', 'delay', 'reverb', 'compressor']

const TRACK_PRESETS = {
  drum: {
    name: 'Drum Rack',
    color: '#ff6b9f',
    engine: 'noise',
    rows: [
      { id: 'kick', label: 'Kick', type: 'drum', drum: 'kick' },
      { id: 'snare', label: 'Snare', type: 'drum', drum: 'snare' },
      { id: 'hat', label: 'Hat', type: 'drum', drum: 'hatClosed' },
      { id: 'clap', label: 'Clap', type: 'drum', drum: 'clap' },
      { id: 'tom', label: 'Tom', type: 'drum', drum: 'tom' },
      { id: 'ride', label: 'Ride', type: 'drum', drum: 'ride' }
    ]
  },
  bass: {
    name: 'Bassline',
    color: '#52a7ff',
    engine: 'sub',
    rows: [
      { id: 'G1', label: 'G1', type: 'note', midi: 31, freq: 49.0 },
      { id: 'B1', label: 'B1', type: 'note', midi: 35, freq: 61.74 },
      { id: 'E2', label: 'E2', type: 'note', midi: 40, freq: 82.41 },
      { id: 'G2', label: 'G2', type: 'note', midi: 43, freq: 98.0 },
      { id: 'B2', label: 'B2', type: 'note', midi: 47, freq: 123.47 },
      { id: 'D3', label: 'D3', type: 'note', midi: 50, freq: 146.83 },
      { id: 'E3', label: 'E3', type: 'note', midi: 52, freq: 164.81 }
    ]
  },
  melody: {
    name: 'Lead',
    color: '#57d87f',
    engine: 'analog',
    rows: [
      { id: 'C4', label: 'C4', type: 'note', midi: 60, freq: 261.63 },
      { id: 'D4', label: 'D4', type: 'note', midi: 62, freq: 293.66 },
      { id: 'E4', label: 'E4', type: 'note', midi: 64, freq: 329.63 },
      { id: 'G4', label: 'G4', type: 'note', midi: 67, freq: 392.0 },
      { id: 'A4', label: 'A4', type: 'note', midi: 69, freq: 440.0 },
      { id: 'B4', label: 'B4', type: 'note', midi: 71, freq: 493.88 },
      { id: 'D5', label: 'D5', type: 'note', midi: 74, freq: 587.33 },
      { id: 'E5', label: 'E5', type: 'note', midi: 76, freq: 659.25 },
      { id: 'G5', label: 'G5', type: 'note', midi: 79, freq: 783.99 }
    ]
  },
  custom: {
    name: 'Custom Synth',
    color: '#c791ff',
    engine: 'fm',
    rows: Array.from({ length: 12 }, (_, index) => {
      const midi = 72 - index
      return {
        id: `midi-${midi}`,
        label: `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`,
        type: 'note',
        midi,
        freq: 440 * (2 ** ((midi - 69) / 12))
      }
    })
  }
}

const randomId = (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`
const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const midiToLabel = (midi) => `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`
const midiToFreq = (midi) => 440 * (2 ** ((midi - 69) / 12))

const createNoiseBuffer = (ctx) => {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let index = 0; index < data.length; index += 1) {
    data[index] = Math.random() * 2 - 1
  }
  return buffer
}

const createImpulseResponse = (ctx, seconds = 2.1, decay = 2.4) => {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds))
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate)
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel)
    for (let index = 0; index < length; index += 1) {
      const t = index / length
      data[index] = (Math.random() * 2 - 1) * ((1 - t) ** decay)
    }
  }
  return buffer
}

const createDefaultTrackSettings = (engine) => ({
  engine,
  volume: 0.84,
  pan: 0,
  attack: 0.02,
  release: 0.35,
  cutoff: 0.72,
  resonance: 0.16,
  detune: 6,
  drive: 0.16,
  chorus: 0.18,
  delay: 0.22,
  reverb: 0.16,
  modIndex: 90,
  pulseWidth: 0.52,
  enabledEffects: ['filter', 'delay', 'reverb']
})

const createTrack = (presetId = 'melody', index = 0) => {
  const preset = TRACK_PRESETS[presetId] || TRACK_PRESETS.melody
  return {
    id: randomId('track'),
    name: `${preset.name} ${index + 1}`,
    presetId,
    color: preset.color,
    rows: preset.rows.map((row) => ({ ...row })),
    notes: [],
    settings: createDefaultTrackSettings(preset.engine),
    muted: false,
    solo: false
  }
}

const createDefaultProject = () => {
  const drums = createTrack('drum', 0)
  const bass = createTrack('bass', 1)
  const lead = createTrack('melody', 2)

  drums.notes = [
    { id: randomId('note'), rowId: 'kick', step: 0, length: 1, velocity: 1 },
    { id: randomId('note'), rowId: 'kick', step: 4, length: 1, velocity: 0.96 },
    { id: randomId('note'), rowId: 'kick', step: 8, length: 1, velocity: 1 },
    { id: randomId('note'), rowId: 'kick', step: 12, length: 1, velocity: 0.96 },
    { id: randomId('note'), rowId: 'snare', step: 4, length: 1, velocity: 0.78 },
    { id: randomId('note'), rowId: 'snare', step: 12, length: 1, velocity: 0.82 },
    { id: randomId('note'), rowId: 'hat', step: 2, length: 1, velocity: 0.45 },
    { id: randomId('note'), rowId: 'hat', step: 6, length: 1, velocity: 0.45 },
    { id: randomId('note'), rowId: 'hat', step: 10, length: 1, velocity: 0.48 },
    { id: randomId('note'), rowId: 'hat', step: 14, length: 1, velocity: 0.46 }
  ]

  bass.notes = [
    { id: randomId('note'), rowId: 'E2', step: 0, length: 3, velocity: 0.78 },
    { id: randomId('note'), rowId: 'G2', step: 4, length: 3, velocity: 0.8 },
    { id: randomId('note'), rowId: 'B2', step: 8, length: 3, velocity: 0.8 },
    { id: randomId('note'), rowId: 'G2', step: 12, length: 3, velocity: 0.82 }
  ]

  lead.notes = [
    { id: randomId('note'), rowId: 'C4', step: 0, length: 2, velocity: 0.7 },
    { id: randomId('note'), rowId: 'E4', step: 4, length: 2, velocity: 0.72 },
    { id: randomId('note'), rowId: 'G4', step: 8, length: 4, velocity: 0.68 },
    { id: randomId('note'), rowId: 'E5', step: 12, length: 3, velocity: 0.76 }
  ]

  return {
    bpm: DEFAULT_BPM,
    swing: DEFAULT_SWING,
    bars: DEFAULT_BARS,
    tracks: [drums, bass, lead]
  }
}

const cloneProject = (project) => JSON.parse(JSON.stringify(project))

const sanitizeFloat = (value, fallback, min, max) => {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return clamp(num, min, max)
}

const sanitizeInt = (value, fallback, min, max) => {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.round(clamp(num, min, max))
}

const sanitizeEffects = (value) => {
  const source = Array.isArray(value) ? value : []
  return EFFECT_LIBRARY.filter((effect) => source.includes(effect))
}

const sanitizeRows = (rows, fallbackRows) => {
  if (!Array.isArray(rows) || rows.length === 0) return fallbackRows.map((row) => ({ ...row }))
  return rows.map((row, index) => {
    const safeMidi = Number.isFinite(Number(row?.midi)) ? Number(row.midi) : null
    return {
      id: typeof row?.id === 'string' ? row.id : `row-${index}`,
      label: typeof row?.label === 'string' ? row.label : (safeMidi != null ? midiToLabel(safeMidi) : `Lane ${index + 1}`),
      type: row?.type === 'drum' ? 'drum' : 'note',
      drum: row?.type === 'drum' ? (row?.drum || 'kick') : undefined,
      midi: safeMidi,
      freq: Number.isFinite(Number(row?.freq)) ? Number(row.freq) : (safeMidi != null ? midiToFreq(safeMidi) : 220)
    }
  })
}

const sanitizeTrack = (track, index = 0) => {
  const preset = TRACK_PRESETS[track?.presetId] || TRACK_PRESETS.custom
  const rows = sanitizeRows(track?.rows, preset.rows)
  const settings = {
    ...createDefaultTrackSettings(
      SYNTH_ENGINES.includes(track?.settings?.engine) ? track.settings.engine : preset.engine
    ),
    volume: sanitizeFloat(track?.settings?.volume, 0.84, 0, 1.2),
    pan: sanitizeFloat(track?.settings?.pan, 0, -1, 1),
    attack: sanitizeFloat(track?.settings?.attack, 0.02, 0.001, 0.4),
    release: sanitizeFloat(track?.settings?.release, 0.35, 0.05, 2.4),
    cutoff: sanitizeFloat(track?.settings?.cutoff, 0.72, 0.05, 1),
    resonance: sanitizeFloat(track?.settings?.resonance, 0.16, 0.01, 18),
    detune: sanitizeFloat(track?.settings?.detune, 6, 0, 24),
    drive: sanitizeFloat(track?.settings?.drive, 0.16, 0, 1),
    chorus: sanitizeFloat(track?.settings?.chorus, 0.18, 0, 1),
    delay: sanitizeFloat(track?.settings?.delay, 0.22, 0, 1),
    reverb: sanitizeFloat(track?.settings?.reverb, 0.16, 0, 1),
    modIndex: sanitizeFloat(track?.settings?.modIndex, 90, 0, 300),
    pulseWidth: sanitizeFloat(track?.settings?.pulseWidth, 0.52, 0.05, 0.95),
    enabledEffects: sanitizeEffects(track?.settings?.enabledEffects)
  }

  const rowIds = new Set(rows.map((row) => row.id))
  const notes = Array.isArray(track?.notes)
    ? track.notes
      .filter((note) => rowIds.has(note?.rowId))
      .map((note) => ({
        id: typeof note?.id === 'string' ? note.id : randomId('note'),
        rowId: note.rowId,
        step: sanitizeInt(note?.step, 0, 0, (MAX_BARS * STEPS_PER_BAR) - 1),
        length: sanitizeInt(note?.length, 1, 1, MAX_BARS * STEPS_PER_BAR),
        velocity: sanitizeFloat(note?.velocity, 0.8, 0.05, 1)
      }))
    : []

  return {
    id: typeof track?.id === 'string' ? track.id : randomId('track'),
    name: typeof track?.name === 'string' ? track.name : `${preset.name} ${index + 1}`,
    presetId: track?.presetId || 'custom',
    color: typeof track?.color === 'string' ? track.color : preset.color,
    rows,
    notes,
    settings,
    muted: !!track?.muted,
    solo: !!track?.solo
  }
}

const sanitizeProject = (value) => {
  const fallback = createDefaultProject()
  if (!value || typeof value !== 'object') return fallback
  const tracks = Array.isArray(value.tracks) && value.tracks.length > 0
    ? value.tracks.slice(0, MAX_TRACKS).map((track, index) => sanitizeTrack(track, index))
    : fallback.tracks
  return {
    bpm: sanitizeInt(value.bpm, DEFAULT_BPM, 70, 180),
    swing: sanitizeInt(value.swing, DEFAULT_SWING, 0, 35),
    bars: sanitizeInt(value.bars, DEFAULT_BARS, MIN_BARS, MAX_BARS),
    tracks
  }
}

const parseVariableLength = (bytes, cursorRef) => {
  let value = 0
  while (cursorRef.index < bytes.length) {
    const byte = bytes[cursorRef.index]
    cursorRef.index += 1
    value = (value << 7) | (byte & 0x7f)
    if ((byte & 0x80) === 0) break
  }
  return value
}

const parseMidiFile = async (file) => {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  const readUint32 = (offset) => ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0
  const readUint16 = (offset) => (bytes[offset] << 8) | bytes[offset + 1]

  if (String.fromCharCode(...bytes.slice(0, 4)) !== 'MThd') throw new Error('Unsupported MIDI header.')

  const headerLength = readUint32(4)
  const division = readUint16(12)
  let cursor = 8 + headerLength
  const tracks = []

  while (cursor < bytes.length) {
    const chunkType = String.fromCharCode(...bytes.slice(cursor, cursor + 4))
    const chunkLength = readUint32(cursor + 4)
    cursor += 8
    if (chunkType !== 'MTrk') {
      cursor += chunkLength
      continue
    }

    const trackBytes = bytes.slice(cursor, cursor + chunkLength)
    cursor += chunkLength
    const cursorRef = { index: 0 }
    let tick = 0
    let runningStatus = null
    const activeNotes = new Map()
    const notes = []

    while (cursorRef.index < trackBytes.length) {
      tick += parseVariableLength(trackBytes, cursorRef)
      if (cursorRef.index >= trackBytes.length) break

      let status = trackBytes[cursorRef.index]
      if (status < 0x80) {
        status = runningStatus
      } else {
        cursorRef.index += 1
        runningStatus = status
      }

      if (status == null) break

      if (status === 0xff) {
        cursorRef.index += 1
        const metaLength = parseVariableLength(trackBytes, cursorRef)
        cursorRef.index += metaLength
        runningStatus = null
        continue
      }

      if (status === 0xf0 || status === 0xf7) {
        const sysExLength = parseVariableLength(trackBytes, cursorRef)
        cursorRef.index += sysExLength
        runningStatus = null
        continue
      }

      const eventType = status & 0xf0
      const noteNumber = trackBytes[cursorRef.index]
      const velocity = trackBytes[cursorRef.index + 1]
      cursorRef.index += 2

      if (eventType === 0x90 && velocity > 0) {
        activeNotes.set(`${status & 0x0f}:${noteNumber}`, { start: tick, velocity: velocity / 127, midi: noteNumber })
      } else if (eventType === 0x80 || (eventType === 0x90 && velocity === 0)) {
        const key = `${status & 0x0f}:${noteNumber}`
        const startNote = activeNotes.get(key)
        if (!startNote) continue
        activeNotes.delete(key)
        notes.push({
          midi: startNote.midi,
          startTick: startNote.start,
          durationTick: Math.max(division / 4, tick - startNote.start),
          velocity: startNote.velocity
        })
      }
    }

    if (notes.length > 0) tracks.push(notes)
  }

  const merged = tracks.flat()
  if (merged.length === 0) throw new Error('No note events found in MIDI file.')
  return { division, notes: merged }
}

const createTrackRowsFromMidi = (notes) => {
  const uniqueMidis = Array.from(new Set(notes.map((note) => note.midi))).sort((a, b) => b - a)
  return uniqueMidis.slice(0, 24).map((midi) => ({
    id: `midi-${midi}`,
    label: midiToLabel(midi),
    type: 'note',
    midi,
    freq: midiToFreq(midi)
  }))
}

const buildDistortionCurve = (amount = 20) => {
  const curve = new Float32Array(1024)
  const k = amount
  for (let index = 0; index < curve.length; index += 1) {
    const x = (index * 2) / curve.length - 1
    curve[index] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + (k * Math.abs(x)))
  }
  return curve
}

const sliderValue = (value, factor = 100) => Math.round(value * factor)

const SequencerActivity = ({ sdk }) => {
  const [project, setProject] = useState(createDefaultProject)
  const [selectedTrackId, setSelectedTrackId] = useState(null)
  const [selectedNoteId, setSelectedNoteId] = useState(null)
  const [activeStep, setActiveStep] = useState(-1)
  const [isPlaying, setIsPlaying] = useState(false)
  const [statusMessage, setStatusMessage] = useState('Ready for custom tracks, layered effects, and MIDI import.')
  const fileInputRef = useRef(null)
  const audioContextRef = useRef(null)
  const timerRef = useRef(null)
  const stepRef = useRef(-1)
  const projectRef = useRef(createDefaultProject())
  const noiseBufferRef = useRef(null)
  const impulseBufferRef = useRef(null)

  const totalSteps = project.bars * STEPS_PER_BAR
  const selectedTrack = useMemo(
    () => project.tracks.find((track) => track.id === selectedTrackId) || project.tracks[0] || null,
    [project.tracks, selectedTrackId]
  )
  const selectedNote = useMemo(
    () => selectedTrack?.notes.find((note) => note.id === selectedNoteId) || null,
    [selectedTrack, selectedNoteId]
  )

  const ensureAudioContext = useCallback(() => {
    if (typeof window === 'undefined') return null
    const Context = window.AudioContext || window.webkitAudioContext
    if (!Context) return null
    if (!audioContextRef.current) audioContextRef.current = new Context()
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume().catch(() => {})
    }
    if (!noiseBufferRef.current) noiseBufferRef.current = createNoiseBuffer(audioContextRef.current)
    if (!impulseBufferRef.current) impulseBufferRef.current = createImpulseResponse(audioContextRef.current)
    return audioContextRef.current
  }, [])

  const pushProjectState = useCallback((nextProject) => {
    projectRef.current = nextProject
    if (!sdk) return
    sdk.updateState({ sequencer: nextProject }, { serverRelay: true })
  }, [sdk])

  const commitProject = useCallback((updater) => {
    setProject((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      const cloned = cloneProject(next)
      queueMicrotask(() => pushProjectState(cloned))
      return cloned
    })
  }, [pushProjectState])

  useEffect(() => {
    projectRef.current = project
  }, [project])

  useEffect(() => {
    if (selectedTrackId) return
    if (project.tracks[0]?.id) setSelectedTrackId(project.tracks[0].id)
  }, [project.tracks, selectedTrackId])

  useEffect(() => {
    if (!selectedTrack && selectedTrackId) setSelectedTrackId(project.tracks[0]?.id || null)
  }, [project.tracks, selectedTrack, selectedTrackId])

  useEffect(() => {
    if (selectedNoteId && !selectedNote) setSelectedNoteId(null)
  }, [selectedNote, selectedNoteId])

  useEffect(() => {
    if (!sdk) return undefined
    const offState = sdk.subscribeServerState((state) => {
      const incoming = sanitizeProject(state?.sequencer)
      setProject(incoming)
      projectRef.current = incoming
      if (!incoming.tracks.find((track) => track.id === selectedTrackId)) {
        setSelectedTrackId(incoming.tracks[0]?.id || null)
        setSelectedNoteId(null)
      }
    })
    return () => offState?.()
  }, [sdk, selectedTrackId])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (audioContextRef.current?.state && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {})
      }
    }
  }, [])

  const createTrackBus = useCallback((ctx, track, when) => {
    const input = ctx.createGain()
    const filter = ctx.createBiquadFilter()
    const drive = ctx.createWaveShaper()
    const chorusDelay = ctx.createDelay(0.05)
    const chorusDepth = ctx.createGain()
    const chorusMix = ctx.createGain()
    const chorusLfo = ctx.createOscillator()
    const trackGain = ctx.createGain()
    const panner = ctx.createStereoPanner()
    const delaySend = ctx.createGain()
    const delayNode = ctx.createDelay(0.8)
    const delayFeedback = ctx.createGain()
    const delayReturn = ctx.createGain()
    const reverbSend = ctx.createGain()
    const reverbNode = ctx.createConvolver()
    const reverbReturn = ctx.createGain()

    const { settings } = track
    const enabled = new Set(settings.enabledEffects || [])

    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(180 + (settings.cutoff * 6200), when)
    filter.Q.setValueAtTime(settings.resonance, when)
    drive.curve = buildDistortionCurve(8 + settings.drive * 90)
    drive.oversample = '2x'
    trackGain.gain.setValueAtTime(track.muted ? 0 : settings.volume, when)
    panner.pan.setValueAtTime(settings.pan, when)

    chorusDelay.delayTime.setValueAtTime(0.012 + (settings.chorus * 0.012), when)
    chorusDepth.gain.setValueAtTime(settings.chorus * 0.006, when)
    chorusMix.gain.setValueAtTime(enabled.has('chorus') ? 1 : 0, when)
    chorusLfo.frequency.setValueAtTime(0.22 + settings.chorus * 0.8, when)
    chorusLfo.connect(chorusDepth)
    chorusDepth.connect(chorusDelay.delayTime)
    chorusLfo.start(when)
    chorusLfo.stop(when + 3)

    delayNode.delayTime.setValueAtTime(0.18 + (projectRef.current.swing / 1000), when)
    delayFeedback.gain.setValueAtTime(0.22 + settings.delay * 0.32, when)
    delayReturn.gain.setValueAtTime(enabled.has('delay') ? settings.delay * 0.8 : 0, when)
    reverbNode.buffer = impulseBufferRef.current
    reverbReturn.gain.setValueAtTime(enabled.has('reverb') ? settings.reverb * 0.8 : 0, when)
    delaySend.gain.setValueAtTime(enabled.has('delay') ? settings.delay : 0, when)
    reverbSend.gain.setValueAtTime(enabled.has('reverb') ? settings.reverb : 0, when)

    let head = input
    if (enabled.has('filter')) {
      head.connect(filter)
      head = filter
    }
    if (enabled.has('drive')) {
      head.connect(drive)
      head = drive
    }

    head.connect(trackGain)
    head.connect(chorusDelay)
    chorusDelay.connect(chorusMix)
    chorusMix.connect(trackGain)

    trackGain.connect(panner)
    panner.connect(ctx.destination)
    panner.connect(delaySend)
    panner.connect(reverbSend)
    delaySend.connect(delayNode)
    delayNode.connect(delayFeedback)
    delayFeedback.connect(delayNode)
    delayNode.connect(delayReturn)
    delayReturn.connect(ctx.destination)
    reverbSend.connect(reverbNode)
    reverbNode.connect(reverbReturn)
    reverbReturn.connect(ctx.destination)

    return input
  }, [])

  const createSynthVoice = useCallback((ctx, track, row, when, duration, velocity, destination) => {
    const level = clamp(track.settings.volume * velocity, 0.04, 1)
    const amp = ctx.createGain()
    amp.gain.setValueAtTime(0.0001, when)
    amp.gain.linearRampToValueAtTime(level * 0.18, when + track.settings.attack)
    amp.gain.exponentialRampToValueAtTime(0.0001, when + Math.max(duration, track.settings.attack + 0.02) + track.settings.release)
    amp.connect(destination)

    const freq = row.freq || midiToFreq(row.midi || 60)
    const oscillators = []

    const addOscillator = (type, detune = 0, gainValue = 1) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = type
      osc.frequency.setValueAtTime(freq, when)
      osc.detune.setValueAtTime(detune, when)
      gain.gain.setValueAtTime(gainValue, when)
      osc.connect(gain)
      gain.connect(amp)
      osc.start(when)
      osc.stop(when + duration + track.settings.release + 0.08)
      oscillators.push(osc)
    }

    switch (track.settings.engine) {
      case 'fm': {
        const carrier = ctx.createOscillator()
        const mod = ctx.createOscillator()
        const modGain = ctx.createGain()
        carrier.type = 'sine'
        mod.type = 'sine'
        carrier.frequency.setValueAtTime(freq, when)
        mod.frequency.setValueAtTime(freq * 2, when)
        modGain.gain.setValueAtTime(track.settings.modIndex, when)
        mod.connect(modGain)
        modGain.connect(carrier.frequency)
        carrier.connect(amp)
        carrier.start(when)
        mod.start(when)
        carrier.stop(when + duration + track.settings.release + 0.08)
        mod.stop(when + duration + track.settings.release + 0.08)
        oscillators.push(carrier, mod)
        break
      }
      case 'supersaw':
        addOscillator('sawtooth', -track.settings.detune, 0.3)
        addOscillator('sawtooth', 0, 0.38)
        addOscillator('sawtooth', track.settings.detune, 0.3)
        break
      case 'pulse':
        addOscillator('square', -track.settings.detune * 0.5, 0.46)
        addOscillator('square', track.settings.detune * 0.5, 0.28)
        break
      case 'glass':
        addOscillator('triangle', 0, 0.36)
        addOscillator('sine', 1200, 0.14)
        break
      case 'sub':
        addOscillator('sine', -track.settings.detune * 0.5, 0.5)
        addOscillator('triangle', 0, 0.18)
        break
      case 'pluck':
        addOscillator('triangle', 0, 0.42)
        break
      case 'noise': {
        const source = ctx.createBufferSource()
        source.buffer = noiseBufferRef.current
        const filter = ctx.createBiquadFilter()
        filter.type = 'bandpass'
        filter.frequency.setValueAtTime(freq, when)
        filter.Q.setValueAtTime(3, when)
        source.connect(filter)
        filter.connect(amp)
        source.start(when)
        source.stop(when + Math.min(duration, 0.22) + 0.06)
        break
      }
      default:
        addOscillator('sawtooth', 0, 0.42)
        addOscillator('square', track.settings.detune * 0.6, 0.16)
        break
    }

    return oscillators
  }, [])

  const playDrum = useCallback((ctx, drumId, when, velocity, destination) => {
    if (drumId === 'kick') {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(150, when)
      osc.frequency.exponentialRampToValueAtTime(40, when + 0.18)
      gain.gain.setValueAtTime(0.0001, when)
      gain.gain.exponentialRampToValueAtTime(0.7 * velocity, when + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.24)
      osc.connect(gain)
      gain.connect(destination)
      osc.start(when)
      osc.stop(when + 0.26)
      return
    }

    const source = ctx.createBufferSource()
    const filter = ctx.createBiquadFilter()
    const gain = ctx.createGain()
    source.buffer = noiseBufferRef.current

    if (drumId === 'snare') {
      filter.type = 'highpass'
      filter.frequency.value = 1400
      gain.gain.setValueAtTime(0.0001, when)
      gain.gain.exponentialRampToValueAtTime(0.36 * velocity, when + 0.008)
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.18)
    } else if (drumId === 'hatClosed') {
      filter.type = 'highpass'
      filter.frequency.value = 5200
      gain.gain.setValueAtTime(0.0001, when)
      gain.gain.exponentialRampToValueAtTime(0.18 * velocity, when + 0.004)
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.06)
    } else if (drumId === 'ride') {
      filter.type = 'highpass'
      filter.frequency.value = 7000
      gain.gain.setValueAtTime(0.0001, when)
      gain.gain.exponentialRampToValueAtTime(0.12 * velocity, when + 0.004)
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.32)
    } else if (drumId === 'clap') {
      filter.type = 'bandpass'
      filter.frequency.value = 1900
      gain.gain.setValueAtTime(0.0001, when)
      gain.gain.exponentialRampToValueAtTime(0.28 * velocity, when + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.12)
    } else {
      filter.type = 'lowpass'
      filter.frequency.value = 360
      gain.gain.setValueAtTime(0.0001, when)
      gain.gain.exponentialRampToValueAtTime(0.28 * velocity, when + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.18)
    }

    source.connect(filter)
    filter.connect(gain)
    gain.connect(destination)
    source.start(when)
    source.stop(when + 0.34)
  }, [])

  const playStep = useCallback((step, playbackProject = projectRef.current) => {
    const ctx = ensureAudioContext()
    if (!ctx || step < 0) return

    const when = ctx.currentTime + 0.01
    const hasSolo = playbackProject.tracks.some((track) => track.solo)
    const stepSeconds = (60 / playbackProject.bpm) / 4

    playbackProject.tracks.forEach((track) => {
      if (track.muted) return
      if (hasSolo && !track.solo) return

      const triggerNotes = track.notes.filter((note) => note.step === step)
      if (triggerNotes.length === 0) return

      const bus = createTrackBus(ctx, track, when)
      triggerNotes.forEach((note) => {
        const row = track.rows.find((item) => item.id === note.rowId)
        if (!row) return
        if (row.type === 'drum') {
          playDrum(ctx, row.drum, when, note.velocity, bus)
          return
        }
        const duration = Math.max(stepSeconds * note.length * 0.92, 0.06)
        createSynthVoice(ctx, track, row, when, duration, note.velocity, bus)
      })
    })
  }, [createSynthVoice, createTrackBus, ensureAudioContext, playDrum])

  useEffect(() => {
    if (!isPlaying) {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = null
      setActiveStep(-1)
      stepRef.current = -1
      return undefined
    }

    const tick = () => {
      const nextStep = (stepRef.current + 1 + totalSteps) % totalSteps
      const baseStepMs = (60_000 / projectRef.current.bpm) / 4
      const swingRatio = projectRef.current.swing / 100
      const swingDelay = nextStep % 2 === 1
        ? baseStepMs * (1 + swingRatio)
        : baseStepMs * (1 - swingRatio)

      setActiveStep(nextStep)
      stepRef.current = nextStep
      playStep(nextStep, projectRef.current)
      timerRef.current = setTimeout(tick, Math.max(70, Math.round(swingDelay)))
    }

    timerRef.current = setTimeout(tick, 10)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [isPlaying, playStep, totalSteps])

  const togglePlayback = useCallback(() => {
    ensureAudioContext()
    setIsPlaying((prev) => !prev)
  }, [ensureAudioContext])

  const addTrack = useCallback((presetId) => {
    commitProject((prev) => {
      if (prev.tracks.length >= MAX_TRACKS) return prev
      const nextTrack = createTrack(presetId, prev.tracks.length)
      const next = {
        ...prev,
        tracks: [...prev.tracks, nextTrack]
      }
      queueMicrotask(() => {
        setSelectedTrackId(nextTrack.id)
        setSelectedNoteId(null)
      })
      return next
    })
    setStatusMessage(`Added ${TRACK_PRESETS[presetId]?.name || 'track'} with its own synth and effects UI.`)
  }, [commitProject])

  const removeTrack = useCallback((trackId) => {
    commitProject((prev) => {
      if (prev.tracks.length <= 1) return prev
      return {
        ...prev,
        tracks: prev.tracks.filter((track) => track.id !== trackId)
      }
    })
    setSelectedTrackId((prev) => (prev === trackId ? projectRef.current.tracks.find((track) => track.id !== trackId)?.id || null : prev))
    setSelectedNoteId(null)
  }, [commitProject])

  const updateProjectField = useCallback((field, value) => {
    commitProject((prev) => {
      if (field !== 'bars') return { ...prev, [field]: value }
      const nextBars = sanitizeInt(value, prev.bars, MIN_BARS, MAX_BARS)
      const nextTotalSteps = nextBars * STEPS_PER_BAR
      return {
        ...prev,
        bars: nextBars,
        tracks: prev.tracks.map((track) => ({
          ...track,
          notes: track.notes
            .filter((note) => note.step < nextTotalSteps)
            .map((note) => ({
              ...note,
              length: clamp(note.length, 1, nextTotalSteps - note.step)
            }))
        }))
      }
    })
  }, [commitProject])

  const updateTrack = useCallback((trackId, updater) => {
    commitProject((prev) => ({
      ...prev,
      tracks: prev.tracks.map((track) => (
        track.id === trackId ? updater(track) : track
      ))
    }))
  }, [commitProject])

  const toggleTrackEffect = useCallback((trackId, effectId) => {
    updateTrack(trackId, (track) => {
      const enabled = new Set(track.settings.enabledEffects || [])
      if (enabled.has(effectId)) enabled.delete(effectId)
      else enabled.add(effectId)
      return {
        ...track,
        settings: {
          ...track.settings,
          enabledEffects: EFFECT_LIBRARY.filter((effect) => enabled.has(effect))
        }
      }
    })
  }, [updateTrack])

  const toggleTrackMute = useCallback((trackId) => {
    updateTrack(trackId, (track) => ({ ...track, muted: !track.muted }))
  }, [updateTrack])

  const toggleTrackSolo = useCallback((trackId) => {
    updateTrack(trackId, (track) => ({ ...track, solo: !track.solo }))
  }, [updateTrack])

  const clearTrack = useCallback((trackId) => {
    updateTrack(trackId, (track) => ({ ...track, notes: [] }))
    setSelectedNoteId(null)
  }, [updateTrack])

  const findNoteAtStep = useCallback((track, rowId, step) => {
    if (!track) return null
    return track.notes.find((note) => (
      note.rowId === rowId &&
      step >= note.step &&
      step < note.step + note.length
    )) || null
  }, [])

  const upsertNote = useCallback((trackId, rowId, step) => {
    updateTrack(trackId, (track) => {
      const overlapping = findNoteAtStep(track, rowId, step)
      if (overlapping) {
        if (overlapping.step === step) {
          queueMicrotask(() => setSelectedNoteId(null))
          return {
            ...track,
            notes: track.notes.filter((note) => note.id !== overlapping.id)
          }
        }

        queueMicrotask(() => setSelectedNoteId(overlapping.id))
        return track
      }

      const note = {
        id: randomId('note'),
        rowId,
        step,
        length: 1,
        velocity: 0.8
      }
      queueMicrotask(() => setSelectedNoteId(note.id))
      return {
        ...track,
        notes: [...track.notes, note]
      }
    })
  }, [findNoteAtStep, updateTrack])

  const selectNote = useCallback((noteId) => {
    setSelectedNoteId(noteId)
  }, [])

  const updateSelectedNote = useCallback((field, value) => {
    if (!selectedTrack) return
    updateTrack(selectedTrack.id, (track) => ({
      ...track,
      notes: track.notes.map((note) => (
        note.id === selectedNoteId
          ? {
            ...note,
            [field]: field === 'velocity'
              ? sanitizeFloat(value, note.velocity, 0.05, 1)
              : sanitizeInt(value, note[field], field === 'step' ? 0 : 1, field === 'step' ? totalSteps - 1 : totalSteps)
          }
          : note
      )).map((note) => {
        if (note.id !== selectedNoteId) return note
        const maxLength = Math.max(1, totalSteps - note.step)
        return { ...note, length: clamp(note.length, 1, maxLength) }
      })
    }))
  }, [selectedNoteId, selectedTrack, totalSteps, updateTrack])

  const deleteSelectedNote = useCallback(() => {
    if (!selectedTrack || !selectedNoteId) return
    updateTrack(selectedTrack.id, (track) => ({
      ...track,
      notes: track.notes.filter((note) => note.id !== selectedNoteId)
    }))
    setSelectedNoteId(null)
  }, [selectedNoteId, selectedTrack, updateTrack])

  const renameTrack = useCallback((trackId, name) => {
    updateTrack(trackId, (track) => ({ ...track, name }))
  }, [updateTrack])

  const updateTrackSetting = useCallback((trackId, field, value, min, max, floatMode = true) => {
    updateTrack(trackId, (track) => ({
      ...track,
      settings: {
        ...track.settings,
        [field]: field === 'engine'
          ? (SYNTH_ENGINES.includes(value) ? value : track.settings.engine)
          : (floatMode ? sanitizeFloat(value, track.settings[field], min, max) : sanitizeInt(value, track.settings[field], min, max))
      }
    }))
  }, [updateTrack])

  const importMidi = useCallback(async (event) => {
    const file = event.target.files?.[0]
    if (!file || !selectedTrack) return

    try {
      const midi = await parseMidiFile(file)
      const midiRows = createTrackRowsFromMidi(midi.notes)
      const rowIds = new Set(midiRows.map((row) => row.id))
      const notes = midi.notes
        .map((note) => ({
          id: randomId('note'),
          rowId: `midi-${note.midi}`,
          step: Math.max(0, Math.round((note.startTick / midi.division) * 4)),
          length: Math.max(1, Math.round((note.durationTick / midi.division) * 4)),
          velocity: clamp(note.velocity, 0.05, 1)
        }))
        .filter((note) => rowIds.has(note.rowId))

      const importedBars = clamp(
        Math.max(projectRef.current.bars, Math.ceil((Math.max(...notes.map((note) => note.step + note.length), 1)) / STEPS_PER_BAR)),
        MIN_BARS,
        MAX_BARS
      )

      updateTrack(selectedTrack.id, (track) => ({
        ...track,
        presetId: 'custom',
        rows: midiRows,
        notes: notes.map((note) => ({
          ...note,
          step: clamp(note.step, 0, (importedBars * STEPS_PER_BAR) - 1),
          length: clamp(note.length, 1, importedBars * STEPS_PER_BAR)
        })),
        settings: {
          ...track.settings,
          engine: track.settings.engine === 'noise' ? 'fm' : track.settings.engine
        }
      }))

      updateProjectField('bars', importedBars)
      setStatusMessage(`Imported ${notes.length} MIDI notes into ${selectedTrack.name}.`)
    } catch (error) {
      setStatusMessage(error.message || 'Failed to import MIDI.')
    } finally {
      event.target.value = ''
    }
  }, [selectedTrack, updateProjectField, updateTrack])

  const activeNoteCount = useMemo(
    () => project.tracks.reduce((sum, track) => sum + track.notes.length, 0),
    [project.tracks]
  )

  const stepHeaders = useMemo(
    () => Array.from({ length: totalSteps }, (_, step) => ({
      step,
      label: `${(step % STEPS_PER_BAR) + 1}`,
      bar: Math.floor(step / STEPS_PER_BAR) + 1
    })),
    [totalSteps]
  )

  return (
    <div className="builtin-activity-body sequencer-activity">
      <input
        ref={fileInputRef}
        type="file"
        accept=".mid,.midi,audio/midi"
        style={{ display: 'none' }}
        onChange={importMidi}
      />

      <div className="sequencer-topbar">
        <div className="sequencer-meta">
          <strong>Sequencer Studio</strong>
          <span>{project.tracks.length} tracks, {project.bars} bars, {activeNoteCount} note clips, MIDI import, and per-track synth/effect racks.</span>
        </div>

        <div className="sequencer-controls">
          <button className={`sequencer-play-btn ${isPlaying ? 'playing' : ''}`} onClick={togglePlayback}>
            {isPlaying ? 'Stop' : 'Play'}
          </button>
          <button onClick={() => fileInputRef.current?.click()}>Import MIDI</button>
          <label>
            BPM
            <input type="range" min={70} max={180} value={project.bpm} onChange={(e) => updateProjectField('bpm', sanitizeInt(e.target.value, project.bpm, 70, 180))} />
            <span>{project.bpm}</span>
          </label>
          <label>
            Swing
            <input type="range" min={0} max={35} value={project.swing} onChange={(e) => updateProjectField('swing', sanitizeInt(e.target.value, project.swing, 0, 35))} />
            <span>{project.swing}%</span>
          </label>
          <label>
            Bars
            <input type="range" min={MIN_BARS} max={MAX_BARS} value={project.bars} onChange={(e) => updateProjectField('bars', sanitizeInt(e.target.value, project.bars, MIN_BARS, MAX_BARS))} />
            <span>{project.bars}</span>
          </label>
        </div>
      </div>

      <div className="sequencer-layer-stats">
        <div className="sequencer-layer-chip melody">
          <strong>Status</strong>
          <span>{statusMessage}</span>
        </div>
        <div className="sequencer-layer-chip bass">
          <strong>Selected Track</strong>
          <span>{selectedTrack?.name || 'None'}</span>
        </div>
        <div className="sequencer-layer-chip drums">
          <strong>Selected Note</strong>
          <span>{selectedNote ? `${selectedNote.step + 1} / len ${selectedNote.length}` : 'Click a note block'}</span>
        </div>
      </div>

      <div className="sequencer-studio-layout">
        <aside className="sequencer-sidebar">
          <div className="sequencer-panel-header">
            <div>
              <strong>Tracks</strong>
              <span>Custom racks and layered devices</span>
            </div>
          </div>

          <div className="sequencer-track-actions">
            <button onClick={() => addTrack('drum')}>+ Drum</button>
            <button onClick={() => addTrack('bass')}>+ Bass</button>
            <button onClick={() => addTrack('melody')}>+ Lead</button>
            <button onClick={() => addTrack('custom')}>+ Custom</button>
          </div>

          <div className="sequencer-track-list">
            {project.tracks.map((track) => (
              <div
                key={track.id}
                className={`sequencer-track-card ${selectedTrack?.id === track.id ? 'selected' : ''}`}
                style={{ '--track-color': track.color }}
                onClick={() => {
                  setSelectedTrackId(track.id)
                  setSelectedNoteId(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setSelectedTrackId(track.id)
                    setSelectedNoteId(null)
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <div className="sequencer-track-card-head">
                  <strong>{track.name}</strong>
                  <span>{track.notes.length} notes</span>
                </div>
                <div className="sequencer-track-card-meta">
                  <span>{track.settings.engine}</span>
                  <span>{track.rows.length} lanes</span>
                  <span>{track.settings.enabledEffects.length} fx</span>
                </div>
                <div className="sequencer-track-card-actions">
                  <button type="button" onClick={(e) => { e.stopPropagation(); toggleTrackMute(track.id) }}>{track.muted ? 'Unmute' : 'Mute'}</button>
                  <button type="button" onClick={(e) => { e.stopPropagation(); toggleTrackSolo(track.id) }}>{track.solo ? 'Unsolo' : 'Solo'}</button>
                  <button type="button" onClick={(e) => { e.stopPropagation(); clearTrack(track.id) }}>Clear</button>
                  <button type="button" onClick={(e) => { e.stopPropagation(); removeTrack(track.id) }}>Remove</button>
                </div>
              </div>
            ))}
          </div>
        </aside>

        <section className="sequencer-shell">
          <div className="sequencer-step-legend advanced">
            <div className="sequencer-step-spacer" />
            {stepHeaders.map((stepInfo) => (
              <div
                key={stepInfo.step}
                className={`sequencer-step-label ${activeStep === stepInfo.step ? 'active' : ''} ${(stepInfo.step % STEPS_PER_BAR) === 0 ? 'bar-start' : ''}`}
              >
                <span>B{stepInfo.bar}</span>
                <strong>{stepInfo.label}</strong>
              </div>
            ))}
          </div>

          <div className="sequencer-matrix">
            {selectedTrack ? selectedTrack.rows.map((row) => (
              <div key={row.id} className="sequencer-row advanced">
                <div className="sequencer-note-label">{row.label}</div>
                <div className="sequencer-row-steps advanced" style={{ gridTemplateColumns: `repeat(${totalSteps}, minmax(28px, 1fr))` }}>
                  {Array.from({ length: totalSteps }, (_, step) => {
                    const noteAtStep = findNoteAtStep(selectedTrack, row.id, step)
                    return (
                      <button
                        key={`${row.id}-${step}`}
                        type="button"
                        className={`sequencer-cell advanced ${activeStep === step ? 'active' : ''} ${noteAtStep ? 'filled' : ''} ${selectedTrack.presetId}`}
                        onClick={() => upsertNote(selectedTrack.id, row.id, step)}
                      />
                    )
                  })}

                  {selectedTrack.notes
                    .filter((note) => note.rowId === row.id)
                    .map((note) => (
                      <button
                        key={note.id}
                        type="button"
                        className={`sequencer-note-block ${selectedNoteId === note.id ? 'selected' : ''}`}
                        style={{
                          gridColumn: `${note.step + 1} / span ${Math.min(note.length, totalSteps - note.step)}`,
                          background: `linear-gradient(135deg, ${selectedTrack.color}, color-mix(in srgb, ${selectedTrack.color} 45%, #fff))`,
                          opacity: 0.62 + (note.velocity * 0.38)
                        }}
                        onClick={() => selectNote(note.id)}
                        title={`${row.label} step ${note.step + 1} length ${note.length}`}
                      >
                        <span>{row.label}</span>
                        <small>{Math.round(note.velocity * 100)}%</small>
                      </button>
                    ))}
                </div>
              </div>
            )) : null}
          </div>
        </section>

        <aside className="sequencer-inspector">
          <div className="sequencer-panel-header">
            <div>
              <strong>Inspector</strong>
              <span>Per-track synths, effects, and note shaping</span>
            </div>
          </div>

          {selectedTrack ? (
            <>
              <div className="sequencer-inspector-group">
                <label>
                  Track Name
                  <input type="text" value={selectedTrack.name} onChange={(e) => renameTrack(selectedTrack.id, e.target.value)} />
                </label>
                <label>
                  Engine
                  <select value={selectedTrack.settings.engine} onChange={(e) => updateTrackSetting(selectedTrack.id, 'engine', e.target.value, 0, 0)}>
                    {SYNTH_ENGINES.map((engine) => <option key={engine} value={engine}>{engine}</option>)}
                  </select>
                </label>
              </div>

              <div className="sequencer-inspector-group">
                <div className="sequencer-effects-header">
                  <strong>Effect Layers</strong>
                  <span>Stack and toggle device modules</span>
                </div>
                <div className="sequencer-effects-grid">
                  {EFFECT_LIBRARY.map((effect) => {
                    const enabled = selectedTrack.settings.enabledEffects.includes(effect)
                    return (
                      <button
                        key={effect}
                        type="button"
                        className={`sequencer-effect-chip ${enabled ? 'enabled' : ''}`}
                        onClick={() => toggleTrackEffect(selectedTrack.id, effect)}
                      >
                        {effect}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="sequencer-inspector-group">
                <label>
                  Volume
                  <input type="range" min={0} max={120} value={sliderValue(selectedTrack.settings.volume, 100)} onChange={(e) => updateTrackSetting(selectedTrack.id, 'volume', Number(e.target.value) / 100, 0, 1.2)} />
                </label>
                <label>
                  Pan
                  <input type="range" min={-100} max={100} value={sliderValue(selectedTrack.settings.pan, 100)} onChange={(e) => updateTrackSetting(selectedTrack.id, 'pan', Number(e.target.value) / 100, -1, 1)} />
                </label>
                <label>
                  Attack
                  <input type="range" min={1} max={40} value={sliderValue(selectedTrack.settings.attack, 100)} onChange={(e) => updateTrackSetting(selectedTrack.id, 'attack', Number(e.target.value) / 100, 0.001, 0.4)} />
                </label>
                <label>
                  Release
                  <input type="range" min={5} max={240} value={sliderValue(selectedTrack.settings.release, 100)} onChange={(e) => updateTrackSetting(selectedTrack.id, 'release', Number(e.target.value) / 100, 0.05, 2.4)} />
                </label>
                <label>
                  Cutoff
                  <input type="range" min={5} max={100} value={sliderValue(selectedTrack.settings.cutoff, 100)} onChange={(e) => updateTrackSetting(selectedTrack.id, 'cutoff', Number(e.target.value) / 100, 0.05, 1)} />
                </label>
                <label>
                  Resonance
                  <input type="range" min={1} max={180} value={sliderValue(selectedTrack.settings.resonance, 10)} onChange={(e) => updateTrackSetting(selectedTrack.id, 'resonance', Number(e.target.value) / 10, 0.01, 18)} />
                </label>
                <label>
                  Detune
                  <input type="range" min={0} max={24} value={selectedTrack.settings.detune} onChange={(e) => updateTrackSetting(selectedTrack.id, 'detune', Number(e.target.value), 0, 24)} />
                </label>
                <label>
                  Drive
                  <input type="range" min={0} max={100} value={sliderValue(selectedTrack.settings.drive, 100)} onChange={(e) => updateTrackSetting(selectedTrack.id, 'drive', Number(e.target.value) / 100, 0, 1)} />
                </label>
                <label>
                  Chorus
                  <input type="range" min={0} max={100} value={sliderValue(selectedTrack.settings.chorus, 100)} onChange={(e) => updateTrackSetting(selectedTrack.id, 'chorus', Number(e.target.value) / 100, 0, 1)} />
                </label>
                <label>
                  Delay Send
                  <input type="range" min={0} max={100} value={sliderValue(selectedTrack.settings.delay, 100)} onChange={(e) => updateTrackSetting(selectedTrack.id, 'delay', Number(e.target.value) / 100, 0, 1)} />
                </label>
                <label>
                  Reverb Send
                  <input type="range" min={0} max={100} value={sliderValue(selectedTrack.settings.reverb, 100)} onChange={(e) => updateTrackSetting(selectedTrack.id, 'reverb', Number(e.target.value) / 100, 0, 1)} />
                </label>
                <label>
                  FM Index
                  <input type="range" min={0} max={300} value={selectedTrack.settings.modIndex} onChange={(e) => updateTrackSetting(selectedTrack.id, 'modIndex', Number(e.target.value), 0, 300)} />
                </label>
              </div>

              <div className="sequencer-inspector-group">
                <div className="sequencer-effects-header">
                  <strong>Selected Note</strong>
                  <span>Extend notes and shape velocity</span>
                </div>
                {selectedNote ? (
                  <>
                    <label>
                      Start Step
                      <input type="range" min={0} max={Math.max(0, totalSteps - 1)} value={selectedNote.step} onChange={(e) => updateSelectedNote('step', e.target.value)} />
                      <span>{selectedNote.step + 1}</span>
                    </label>
                    <label>
                      Length
                      <input type="range" min={1} max={Math.max(1, totalSteps - selectedNote.step)} value={selectedNote.length} onChange={(e) => updateSelectedNote('length', e.target.value)} />
                      <span>{selectedNote.length} steps</span>
                    </label>
                    <label>
                      Velocity
                      <input type="range" min={5} max={100} value={sliderValue(selectedNote.velocity, 100)} onChange={(e) => updateSelectedNote('velocity', Number(e.target.value) / 100)} />
                      <span>{Math.round(selectedNote.velocity * 100)}%</span>
                    </label>
                    <button onClick={deleteSelectedNote}>Delete Note</button>
                  </>
                ) : (
                  <p className="sequencer-empty-copy">Click a note block in the grid to extend it, move it, or change velocity.</p>
                )}
              </div>
            </>
          ) : (
            <p className="sequencer-empty-copy">Add a track to start building synth racks and MIDI layers.</p>
          )}
        </aside>
      </div>
    </div>
  )
}

export default SequencerActivity
