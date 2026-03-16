import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const COLORS = {
  bg: '#120f1f',
  panel: '#211a35',
  panelAlt: '#2b2246',
  panelMuted: '#332956',
  panelGlass: '#181425',
  stroke: '#4f4271',
  strokeStrong: '#7a68a8',
  text: '#f5f1ff',
  textDim: '#bcaee2',
  textMuted: '#8e81b7',
  accent: '#ffbf2f',
  accentStrong: '#ffd76a',
  danger: '#ff6f7d',
  success: '#3fd8a3',
  cyan: '#6fd7ff',
  lavender: '#b690ff',
  playhead: '#ff6f7d',
  gridBeat: '#3f335d',
  gridBar: '#6b5a96',
  waveform: '#72b0ff'
}

const STEP_COUNT = 16
const BEATS_PER_BAR = 4
const PIANO_ROWS = 24
const TICKS_PER_QUARTER = 480
const TICKS_PER_STEP = TICKS_PER_QUARTER / 4
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

const INSTRUMENTS = [
  { id: 'analog', name: 'Analog Mono', color: '#ff8f7a' },
  { id: 'polysynth', name: 'Poly Synth', color: '#7edc9a' },
  { id: 'organ', name: 'Organ', color: '#ffcf70' },
  { id: 'pluck', name: 'Pluck', color: '#7ec0ff' },
  { id: 'string', name: 'String Machine', color: '#d39cff' },
  { id: 'fm', name: 'FM Bell', color: '#5fe0d4' },
  { id: 'wavetable', name: 'Wavetable', color: '#ff8be4' },
  { id: 'bytebeat', name: 'Bytebeat', color: '#97d1ff' },
  { id: 'sampler', name: 'Sampler', color: '#ffd166' },
  { id: 'drumkit', name: 'Drum Kit', color: '#ff6f7d' }
]

const EFFECTS = [
  { id: 'eq8', name: 'EQ Eight', color: '#72b0ff' },
  { id: 'compressor', name: 'Compressor', color: '#7edc9a' },
  { id: 'reverb', name: 'Hybrid Reverb', color: '#d39cff' },
  { id: 'delay', name: 'Echo', color: '#ffd166' },
  { id: 'chorus', name: 'Chorus-Ensemble', color: '#5fe0d4' },
  { id: 'saturator', name: 'Saturator', color: '#ff8f7a' },
  { id: 'gate', name: 'Gate', color: '#c4b2ff' },
  { id: 'utility', name: 'Utility', color: '#9fb3d9' }
]

const BROWSER_SECTIONS = [
  { id: 'instruments', name: 'Instruments' },
  { id: 'effects', name: 'Effects' },
  { id: 'clips', name: 'Clips' },
  { id: 'io', name: 'I/O' }
]

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const randomId = (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`
const midiFromRow = (row) => 84 - row
const rowFromMidi = (midi) => clamp(84 - midi, 0, PIANO_ROWS - 1)

const drawRoundedRect = (ctx, x, y, width, height, radius) => {
  const r = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, width, height, r)
    return
  }
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + width - r, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + r)
  ctx.lineTo(x + width, y + height - r)
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
  ctx.lineTo(x + r, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
}

const defaultSampleState = () => ({
  sampleName: 'Factory Tone',
  sourceData: null,
  peaks: Array.from({ length: 96 }, (_, index) => Math.abs(Math.sin(index * 0.22)) * (0.55 + Math.sin(index * 0.03) * 0.25)),
  trimStart: 0,
  trimEnd: 1,
  gain: 1,
  rootNote: 60
})

const defaultInstrumentState = (instrumentId) => {
  switch (instrumentId) {
    case 'analog':
      return { id: 'analog', params: { detune: 8, cutoff: 0.72, drive: 0.2, wave: 'sawtooth' } }
    case 'polysynth':
      return { id: 'polysynth', params: { detune: 13, attack: 0.03, release: 0.45, spread: 0.55 } }
    case 'organ':
      return { id: 'organ', params: { drawbar1: 1, drawbar2: 0.6, drawbar3: 0.35, release: 0.26 } }
    case 'pluck':
      return { id: 'pluck', params: { brightness: 0.58, decay: 0.24, tone: 0.62 } }
    case 'string':
      return { id: 'string', params: { detune: 18, chorus: 0.3, release: 0.85 } }
    case 'fm':
      return { id: 'fm', params: { modRatio: 2, carrierRatio: 1, index: 140, release: 0.6 } }
    case 'wavetable':
      return { id: 'wavetable', params: { table: 'glass', brightness: 0.72, motion: 0.42 } }
    case 'bytebeat':
      return { id: 'bytebeat', params: { formula: 'classic', time: 8000, frequency: 1.2, release: 0.25 } }
    case 'sampler':
      return { id: 'sampler', params: { filter: 0.8, tune: 0, sample: defaultSampleState() } }
    case 'drumkit':
      return { id: 'drumkit', params: { punch: 0.85, snap: 0.55, air: 0.4 } }
    default:
      return { id: 'analog', params: { detune: 8, cutoff: 0.72, drive: 0.2, wave: 'sawtooth' } }
  }
}

const makeClip = (bar = 0, length = 1, name = 'Clip A') => ({
  id: randomId('clip'),
  bar,
  length,
  name
})

const makeTrack = (index = 0, instrumentId = INSTRUMENTS[index % INSTRUMENTS.length].id) => ({
  id: randomId('track'),
  name: ['Drums', 'Bass', 'Lead', 'Pad', 'Keys', 'FX'][index] || `Track ${index + 1}`,
  color: INSTRUMENTS.find((item) => item.id === instrumentId)?.color || '#72b0ff',
  volume: 0.82,
  pan: 0,
  muted: false,
  solo: false,
  instrument: defaultInstrumentState(instrumentId),
  effectChain: [],
  clips: [makeClip(index % 2, 1, 'Main')],
  notes: []
})

const makeDefaultProject = () => {
  const drums = makeTrack(0, 'drumkit')
  const bass = makeTrack(1, 'analog')
  const bell = makeTrack(2, 'fm')
  const sample = makeTrack(3, 'sampler')

  drums.notes = [
    { id: randomId('note'), clipId: drums.clips[0].id, step: 0, row: 20, length: 1, velocity: 0.96 },
    { id: randomId('note'), clipId: drums.clips[0].id, step: 4, row: 20, length: 1, velocity: 0.96 },
    { id: randomId('note'), clipId: drums.clips[0].id, step: 8, row: 20, length: 1, velocity: 0.96 },
    { id: randomId('note'), clipId: drums.clips[0].id, step: 12, row: 20, length: 1, velocity: 0.96 },
    { id: randomId('note'), clipId: drums.clips[0].id, step: 2, row: 13, length: 1, velocity: 0.55 },
    { id: randomId('note'), clipId: drums.clips[0].id, step: 6, row: 13, length: 1, velocity: 0.55 },
    { id: randomId('note'), clipId: drums.clips[0].id, step: 10, row: 13, length: 1, velocity: 0.55 },
    { id: randomId('note'), clipId: drums.clips[0].id, step: 14, row: 13, length: 1, velocity: 0.55 }
  ]

  bass.notes = [
    { id: randomId('note'), clipId: bass.clips[0].id, step: 0, row: 18, length: 2, velocity: 0.78 },
    { id: randomId('note'), clipId: bass.clips[0].id, step: 4, row: 17, length: 2, velocity: 0.78 },
    { id: randomId('note'), clipId: bass.clips[0].id, step: 8, row: 15, length: 2, velocity: 0.82 },
    { id: randomId('note'), clipId: bass.clips[0].id, step: 12, row: 17, length: 2, velocity: 0.8 }
  ]

  bell.notes = [
    { id: randomId('note'), clipId: bell.clips[0].id, step: 0, row: 9, length: 2, velocity: 0.72 },
    { id: randomId('note'), clipId: bell.clips[0].id, step: 3, row: 7, length: 2, velocity: 0.72 },
    { id: randomId('note'), clipId: bell.clips[0].id, step: 6, row: 5, length: 2, velocity: 0.72 },
    { id: randomId('note'), clipId: bell.clips[0].id, step: 12, row: 4, length: 2, velocity: 0.72 }
  ]

  sample.instrument.params.sample = {
    ...defaultSampleState(),
    sampleName: 'Factory Vox'
  }
  sample.notes = [
    { id: randomId('note'), clipId: sample.clips[0].id, step: 0, row: 11, length: 4, velocity: 0.65 },
    { id: randomId('note'), clipId: sample.clips[0].id, step: 8, row: 8, length: 4, velocity: 0.65 }
  ]

  return {
    name: 'ColabCreate Session',
    bpm: 124,
    bars: 8,
    swing: 0,
    tracks: [drums, bass, bell, sample]
  }
}

const cloneTrack = (track) => ({
  ...track,
  instrument: {
    ...track.instrument,
    params: JSON.parse(JSON.stringify(track.instrument?.params || {}))
  },
  effectChain: (track.effectChain || []).map((effect) => ({ ...effect })),
  clips: track.clips.map((clip) => ({ ...clip })),
  notes: track.notes.map((note) => ({ ...note }))
})

const copyProject = (project) => ({
  ...project,
  tracks: project.tracks.map(cloneTrack)
})

const dataUrlToArrayBuffer = (dataUrl) => {
  const [, base64 = ''] = dataUrl.split(',')
  const binary = window.atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes.buffer
}

const arrayBufferToBase64 = (buffer) => {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let index = 0; index < bytes.byteLength; index += 1) {
    binary += String.fromCharCode(bytes[index])
  }
  return window.btoa(binary)
}

const buildPeaks = (channelData, buckets = 128) => {
  if (!channelData?.length) return defaultSampleState().peaks
  const points = []
  const step = Math.max(1, Math.floor(channelData.length / buckets))
  for (let bucket = 0; bucket < buckets; bucket += 1) {
    const start = bucket * step
    const end = Math.min(channelData.length, start + step)
    let peak = 0
    for (let index = start; index < end; index += 1) {
      peak = Math.max(peak, Math.abs(channelData[index] || 0))
    }
    points.push(peak)
  }
  return points
}

const encodeVlq = (value) => {
  let next = value >>> 0
  const bytes = [next & 0x7f]
  while ((next >>= 7)) {
    bytes.unshift((next & 0x7f) | 0x80)
  }
  return bytes
}

const u16be = (value) => [(value >> 8) & 0xff, value & 0xff]
const u32be = (value) => [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]

const exportMidiBuffer = (project) => {
  const tempo = Math.round(60000000 / Math.max(1, project.bpm || 120))
  const events = [
    { tick: 0, kind: 'tempo', data: [0xff, 0x51, 0x03, (tempo >> 16) & 0xff, (tempo >> 8) & 0xff, tempo & 0xff] }
  ]

  project.tracks.forEach((track, trackIndex) => {
    const channel = trackIndex % 15
    track.clips.forEach((clip) => {
      track.notes
        .filter((note) => note.clipId === clip.id)
        .forEach((note) => {
          const pitch = clamp(midiFromRow(note.row), 0, 127)
          const velocity = clamp(Math.round(note.velocity * 127), 1, 127)
          const onTick = Math.round((clip.bar * STEP_COUNT + note.step) * TICKS_PER_STEP)
          const offTick = onTick + Math.max(TICKS_PER_STEP, Math.round(note.length * TICKS_PER_STEP))
          events.push({ tick: onTick, kind: 'on', order: 2, data: [0x90 | channel, pitch, velocity] })
          events.push({ tick: offTick, kind: 'off', order: 1, data: [0x80 | channel, pitch, 0] })
        })
    })
  })

  events.sort((a, b) => (a.tick - b.tick) || ((a.order || 0) - (b.order || 0)))

  const trackBytes = []
  let lastTick = 0
  events.forEach((event) => {
    trackBytes.push(...encodeVlq(event.tick - lastTick), ...event.data)
    lastTick = event.tick
  })
  trackBytes.push(0x00, 0xff, 0x2f, 0x00)

  const header = [
    0x4d, 0x54, 0x68, 0x64,
    ...u32be(6),
    ...u16be(0),
    ...u16be(1),
    ...u16be(TICKS_PER_QUARTER)
  ]
  const track = [
    0x4d, 0x54, 0x72, 0x6b,
    ...u32be(trackBytes.length),
    ...trackBytes
  ]
  return new Uint8Array([...header, ...track]).buffer
}

const readVlq = (view, offset) => {
  let value = 0
  let nextOffset = offset
  while (nextOffset < view.byteLength) {
    const byte = view.getUint8(nextOffset)
    nextOffset += 1
    value = (value << 7) | (byte & 0x7f)
    if ((byte & 0x80) === 0) break
  }
  return { value, offset: nextOffset }
}

const parseMidiBuffer = (arrayBuffer) => {
  const view = new DataView(arrayBuffer)
  const readString = (offset, length) => {
    let out = ''
    for (let index = 0; index < length; index += 1) {
      out += String.fromCharCode(view.getUint8(offset + index))
    }
    return out
  }

  if (readString(0, 4) !== 'MThd') {
    throw new Error('Not a MIDI file')
  }

  const division = view.getUint16(12)
  let offset = 14
  let bpm = 120
  const notes = []
  const activeNotes = new Map()

  while (offset < view.byteLength) {
    const chunkId = readString(offset, 4)
    const chunkLength = view.getUint32(offset + 4)
    offset += 8

    if (chunkId !== 'MTrk') {
      offset += chunkLength
      continue
    }

    const end = offset + chunkLength
    let tick = 0
    let runningStatus = null

    while (offset < end) {
      const delta = readVlq(view, offset)
      tick += delta.value
      offset = delta.offset
      let status = view.getUint8(offset)
      if (status < 0x80 && runningStatus !== null) {
        status = runningStatus
      } else {
        offset += 1
        runningStatus = status
      }

      if (status === 0xff) {
        const type = view.getUint8(offset)
        offset += 1
        const metaLength = readVlq(view, offset)
        offset = metaLength.offset
        if (type === 0x51 && metaLength.value === 3) {
          const tempo = (view.getUint8(offset) << 16) | (view.getUint8(offset + 1) << 8) | view.getUint8(offset + 2)
          bpm = Math.round(60000000 / tempo)
        }
        offset += metaLength.value
        continue
      }

      if (status === 0xf0 || status === 0xf7) {
        const sysExLength = readVlq(view, offset)
        offset = sysExLength.offset + sysExLength.value
        continue
      }

      const type = status & 0xf0
      const channel = status & 0x0f
      const data1 = view.getUint8(offset)
      offset += 1
      const data2 = type === 0xc0 || type === 0xd0 ? 0 : view.getUint8(offset++)

      if (type === 0x90 && data2 > 0) {
        activeNotes.set(`${channel}:${data1}`, { pitch: data1, tick, velocity: data2 / 127 })
      } else if (type === 0x80 || (type === 0x90 && data2 === 0)) {
        const key = `${channel}:${data1}`
        const active = activeNotes.get(key)
        if (active) {
          notes.push({
            pitch: active.pitch,
            tick: active.tick,
            duration: Math.max(TICKS_PER_STEP, tick - active.tick),
            velocity: active.velocity
          })
          activeNotes.delete(key)
        }
      }
    }
  }

  const barLengthTicks = TICKS_PER_STEP * STEP_COUNT
  const maxTick = notes.reduce((max, note) => Math.max(max, note.tick + note.duration), 0)
  const bars = Math.max(1, Math.ceil(maxTick / barLengthTicks))
  return {
    bpm,
    bars,
    notes: notes.map((note) => ({
      id: randomId('note'),
      step: Math.round((note.tick % barLengthTicks) / TICKS_PER_STEP),
      row: rowFromMidi(note.pitch),
      length: Math.max(1, Math.round(note.duration / TICKS_PER_STEP)),
      velocity: note.velocity,
      bar: Math.floor(note.tick / barLengthTicks)
    }))
  }
}

class StudioEngine {
  constructor() {
    this.audioContext = null
    this.master = null
    this.sampleBuffers = new Map()
    this.bytebeatCache = new Map()
  }

  ensureContext() {
    if (!this.audioContext) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      this.audioContext = AudioCtx ? new AudioCtx() : null
      if (this.audioContext) {
        this.master = this.audioContext.createGain()
        this.master.gain.value = 0.3
        this.master.connect(this.audioContext.destination)
      }
    }
    return this.audioContext
  }

  resume() {
    const ctx = this.ensureContext()
    if (ctx?.state === 'suspended') {
      ctx.resume().catch(() => {})
    }
    return ctx
  }

  connectOutput(pan = 0) {
    const ctx = this.resume()
    if (!ctx || !this.master) return null
    const gain = ctx.createGain()
    const stereo = ctx.createStereoPanner ? ctx.createStereoPanner() : null
    if (stereo) {
      stereo.pan.value = clamp(pan, -1, 1)
      gain.connect(stereo)
      stereo.connect(this.master)
    } else {
      gain.connect(this.master)
    }
    return { ctx, gain }
  }

  noteFrequency(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12)
  }

  createWaveTable(ctx, table = 'glass', brightness = 0.7, motion = 0.4) {
    const harmonicSets = {
      glass: [0, 1, 0.18, 0.46, 0.12, 0.06, 0.04, 0.03],
      brass: [0, 1, 0.62, 0.36, 0.22, 0.12, 0.06, 0.03],
      pulse: [0, 1, 0.1, 0.9, 0.08, 0.52, 0.04, 0.28]
    }
    const template = harmonicSets[table] || harmonicSets.glass
    const real = new Float32Array(template.length)
    const imag = new Float32Array(template.length)
    for (let index = 1; index < template.length; index += 1) {
      real[index] = template[index] * brightness * (1 - motion * 0.2 * index)
      imag[index] = template[index] * motion * 0.15 * index
    }
    return ctx.createPeriodicWave(real, imag)
  }

  async ensureSampleBuffer(trackId, sample) {
    if (!sample?.sourceData) return null
    if (this.sampleBuffers.has(trackId)) return this.sampleBuffers.get(trackId)
    const ctx = this.resume()
    if (!ctx) return null
    const arrayBuffer = dataUrlToArrayBuffer(sample.sourceData)
    const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0))
    this.sampleBuffers.set(trackId, decoded)
    return decoded
  }

  invalidateSampleBuffer(trackId) {
    this.sampleBuffers.delete(trackId)
  }

  createNoiseBuffer(ctx, duration = 0.35) {
    const length = Math.max(1, Math.floor(ctx.sampleRate * duration))
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let index = 0; index < length; index += 1) {
      data[index] = Math.random() * 2 - 1
    }
    return buffer
  }

  createBytebeatBuffer(ctx, params, midi, duration = 0.35) {
    const key = `${params.formula}:${params.time}:${params.frequency}:${midi}:${duration}`
    if (this.bytebeatCache.has(key)) return this.bytebeatCache.get(key)
    const length = Math.max(1, Math.floor(ctx.sampleRate * duration))
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    const freq = this.noteFrequency(midi) * (params.frequency || 1)
    const rate = Math.max(50, params.time || 8000)
    const formula = params.formula || 'classic'
    for (let index = 0; index < length; index += 1) {
      const t = Math.floor((index / ctx.sampleRate) * rate * (freq / 220))
      let value = 0
      if (formula === 'classic') value = ((t * (t >> 5 | t >> 8)) >> (t >> 16)) & 255
      if (formula === 'sierpinski') value = (t & (t >> 8)) & 255
      if (formula === 'pulse') value = ((t * 5 & t >> 7) | (t * 3 & t >> 10)) & 255
      data[index] = (value / 127.5) - 1
    }
    this.bytebeatCache.set(key, buffer)
    return buffer
  }

  async play(track, note, clip) {
    const output = this.connectOutput(track.pan ?? 0)
    if (!output) return
    const { ctx, gain } = output
    const now = ctx.currentTime
    const midi = midiFromRow(note.row)
    const instrumentId = track.instrument?.id || 'analog'
    const params = track.instrument?.params || {}
    const baseDuration = clamp((note.length / 4) * (60 / Math.max(40, clip?.bpm || 120)) * 2.2, 0.06, 2.8)
    const velocity = clamp(note.velocity ?? 0.8, 0.02, 1)
    const sampleGain = params.sample?.gain || 1
    const release = clamp(params.release || params.decay || 0.4, 0.05, 1.8)
    const duration = clamp(Math.max(baseDuration, release), 0.06, 2.8)
    const volume = clamp(track.volume ?? 0.8, 0, 1) * velocity * (track.instrument?.id === 'sampler' ? sampleGain : 1)

    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.linearRampToValueAtTime(Math.max(0.0001, volume * 0.36), now + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)

    if (instrumentId === 'sampler') {
      const sample = params.sample || clip?.sample || defaultSampleState()
      const buffer = await this.ensureSampleBuffer(track.id, sample)
      if (buffer) {
        const source = ctx.createBufferSource()
        source.buffer = buffer
        source.playbackRate.value = Math.pow(2, ((midi + (params.tune || 0)) - (sample.rootNote || 60)) / 12)
        const filter = ctx.createBiquadFilter()
        filter.type = 'lowpass'
        filter.frequency.value = 900 + (params.filter || 0.8) * 9000
        source.connect(filter)
        filter.connect(gain)
        const trimStart = clamp(sample.trimStart ?? 0, 0, 0.98)
        const trimEnd = clamp(sample.trimEnd ?? 1, trimStart + 0.01, 1)
        const sourceStart = buffer.duration * trimStart
        const sourceLength = Math.max(0.04, buffer.duration * (trimEnd - trimStart))
        source.start(now, sourceStart, sourceLength)
        source.stop(now + Math.min(sourceLength, duration) + 0.02)
        return
      }
    }

    if (instrumentId === 'bytebeat') {
      const source = ctx.createBufferSource()
      source.buffer = this.createBytebeatBuffer(ctx, params, midi, duration)
      source.connect(gain)
      source.start(now)
      source.stop(now + duration + 0.02)
      return
    }

    if (instrumentId === 'drumkit') {
      const drumRow = note.row
      if (drumRow >= 18) {
        const osc = ctx.createOscillator()
        const kickGain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(130, now)
        osc.frequency.exponentialRampToValueAtTime(45, now + 0.16)
        kickGain.gain.setValueAtTime(0.0001, now)
        kickGain.gain.linearRampToValueAtTime(volume * 0.9, now + 0.004)
        kickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22)
        osc.connect(kickGain)
        kickGain.connect(gain)
        osc.start(now)
        osc.stop(now + 0.24)
        return
      }
      const noise = ctx.createBufferSource()
      noise.buffer = this.createNoiseBuffer(ctx, 0.2)
      const filter = ctx.createBiquadFilter()
      filter.type = drumRow <= 12 ? 'highpass' : 'bandpass'
      filter.frequency.value = drumRow <= 12 ? 6000 : 1800
      noise.connect(filter)
      filter.connect(gain)
      noise.start(now)
      noise.stop(now + (drumRow <= 12 ? 0.08 : 0.18))
      return
    }

    const oscA = ctx.createOscillator()
    oscA.frequency.value = this.noteFrequency(midi)
    oscA.type = 'sawtooth'
    if (instrumentId === 'analog') {
      const oscB = ctx.createOscillator()
      oscB.type = params.wave || 'sawtooth'
      oscB.frequency.value = this.noteFrequency(midi)
      oscB.detune.value = params.detune || 8
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = 180 + (params.cutoff || 0.7) * 8000
      filter.Q.value = 7
      const drive = ctx.createWaveShaper()
      drive.curve = new Float32Array([-1, -0.5, 0, 0.7, 1])
      oscA.connect(filter)
      oscB.connect(filter)
      filter.connect(drive)
      drive.connect(gain)
      oscB.start(now)
      oscB.stop(now + duration + 0.02)
    } else if (instrumentId === 'polysynth') {
      const oscB = ctx.createOscillator()
      const oscC = ctx.createOscillator()
      oscA.type = 'sawtooth'
      oscB.type = 'sawtooth'
      oscC.type = 'triangle'
      oscB.frequency.value = this.noteFrequency(midi)
      oscC.frequency.value = this.noteFrequency(midi)
      oscB.detune.value = -(params.detune || 12)
      oscC.detune.value = params.detune || 12
      oscA.connect(gain)
      oscB.connect(gain)
      oscC.connect(gain)
      oscB.start(now)
      oscC.start(now)
      oscB.stop(now + duration + 0.02)
      oscC.stop(now + duration + 0.02)
    } else if (instrumentId === 'organ') {
      const harmonic1 = ctx.createOscillator()
      const harmonic2 = ctx.createOscillator()
      oscA.type = 'sine'
      harmonic1.type = 'sine'
      harmonic2.type = 'sine'
      harmonic1.frequency.value = this.noteFrequency(midi) * 2
      harmonic2.frequency.value = this.noteFrequency(midi) * 4
      const g1 = ctx.createGain()
      const g2 = ctx.createGain()
      g1.gain.value = params.drawbar2 || 0.55
      g2.gain.value = params.drawbar3 || 0.25
      oscA.connect(gain)
      harmonic1.connect(g1)
      harmonic2.connect(g2)
      g1.connect(gain)
      g2.connect(gain)
      harmonic1.start(now)
      harmonic2.start(now)
      harmonic1.stop(now + duration + 0.02)
      harmonic2.stop(now + duration + 0.02)
    } else if (instrumentId === 'pluck') {
      oscA.type = 'triangle'
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = 450 + (params.brightness || 0.6) * 7000
      oscA.connect(filter)
      filter.connect(gain)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + clamp(params.decay || 0.24, 0.08, 0.6))
    } else if (instrumentId === 'string') {
      const oscB = ctx.createOscillator()
      const oscC = ctx.createOscillator()
      oscA.type = 'sawtooth'
      oscB.type = 'sawtooth'
      oscC.type = 'sawtooth'
      oscB.frequency.value = this.noteFrequency(midi)
      oscC.frequency.value = this.noteFrequency(midi)
      oscB.detune.value = -(params.detune || 16)
      oscC.detune.value = params.detune || 16
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = 1800
      oscA.connect(filter)
      oscB.connect(filter)
      oscC.connect(filter)
      filter.connect(gain)
      oscB.start(now)
      oscC.start(now)
      oscB.stop(now + duration + 0.02)
      oscC.stop(now + duration + 0.02)
    } else if (instrumentId === 'fm') {
      oscA.type = 'sine'
      const mod = ctx.createOscillator()
      const modGain = ctx.createGain()
      mod.type = 'sine'
      mod.frequency.value = this.noteFrequency(midi) * (params.modRatio || 2)
      oscA.frequency.value = this.noteFrequency(midi) * (params.carrierRatio || 1)
      modGain.gain.value = params.index || 140
      mod.connect(modGain)
      modGain.connect(oscA.frequency)
      oscA.connect(gain)
      mod.start(now)
      mod.stop(now + duration + 0.02)
    } else if (instrumentId === 'wavetable') {
      oscA.setPeriodicWave(this.createWaveTable(ctx, params.table, params.brightness, params.motion))
      oscA.connect(gain)
    } else {
      oscA.connect(gain)
    }

    oscA.start(now)
    oscA.stop(now + duration + 0.02)
  }
}

const ColabCreateDAW = ({ sdk, currentUser }) => {
  const [revision, setRevision] = useState(0)
  const [surfaceSize, setSurfaceSize] = useState({ width: 1280, height: 820 })
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentBeat, setCurrentBeat] = useState(0)
  const [selectedTrackId, setSelectedTrackId] = useState(null)
  const [selectedClipId, setSelectedClipId] = useState(null)
  const [selectedNoteId, setSelectedNoteId] = useState(null)
  const [selectedTool, setSelectedTool] = useState('draw')
  const [editorMode, setEditorMode] = useState('piano')
  const [inspectorTab, setInspectorTab] = useState('sound')
  const [browserSection, setBrowserSection] = useState('instruments')
  const [deviceChainScroll, setDeviceChainScroll] = useState(0)
  const [midiRecordEnabled, setMidiRecordEnabled] = useState(false)
  const [midiStatus, setMidiStatus] = useState('MIDI idle')
  const [contextMenu, setContextMenu] = useState(null)

  const rootRef = useRef(null)
  const canvasRef = useRef(null)
  const importProjectRef = useRef(null)
  const importMidiRef = useRef(null)
  const importPresetRef = useRef(null)
  const importSampleRef = useRef(null)
  const projectRef = useRef(makeDefaultProject())
  const engineRef = useRef(null)
  const interactionsRef = useRef([])
  const dragRef = useRef(null)
  const playbackRef = useRef({ active: false, lastTickTs: performance.now(), lastStepKey: '' })
  const projectSyncEmitRef = useRef(0)
  const cursorSyncEmitRef = useRef(0)
  const remoteCursorsRef = useRef(new Map())

  const selectedTrack = useMemo(() => {
    const trackId = selectedTrackId || projectRef.current.tracks[0]?.id || null
    return projectRef.current.tracks.find((track) => track.id === trackId) || projectRef.current.tracks[0] || null
  }, [revision, selectedTrackId])

  const selectedClip = useMemo(() => {
    const track = selectedTrack
    if (!track) return null
    return track.clips.find((clip) => clip.id === selectedClipId) || track.clips[0] || null
  }, [revision, selectedClipId, selectedTrack])

  useEffect(() => {
    engineRef.current = new StudioEngine()
    const firstTrack = projectRef.current.tracks[0]
    if (firstTrack) {
      setSelectedTrackId(firstTrack.id)
      setSelectedClipId(firstTrack.clips[0]?.id || null)
    }
  }, [])

  useEffect(() => {
    const element = rootRef.current
    if (!element) return
    const update = () => {
      setSurfaceSize({
        width: Math.max(1120, Math.floor(element.clientWidth || 1280)),
        height: Math.max(760, Math.floor(element.clientHeight || 820))
      })
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const forceRedraw = useCallback(() => {
    setRevision((value) => value + 1)
  }, [])

  const ensureSelections = useCallback((project) => {
    const track = project.tracks.find((item) => item.id === selectedTrackId) || project.tracks[0] || null
    const clip = track?.clips.find((item) => item.id === selectedClipId) || track?.clips[0] || null
    if (!track) return
    if (track.id !== selectedTrackId) setSelectedTrackId(track.id)
    if (clip?.id && clip.id !== selectedClipId) setSelectedClipId(clip.id)
  }, [selectedClipId, selectedTrackId])

  const closeContextMenu = useCallback(() => {
    setContextMenu(null)
  }, [])

  const emitProjectSync = useCallback((reason = 'update') => {
    if (!sdk) return
    const now = Date.now()
    if (reason !== 'transport' && now - projectSyncEmitRef.current < 60) return
    projectSyncEmitRef.current = now
    sdk.emitEvent('daw:project-sync', {
      reason,
      project: copyProject(projectRef.current)
    }, { serverRelay: true })
  }, [sdk])

  const commitProject = useCallback((mutator, reason = 'update') => {
    const next = copyProject(projectRef.current)
    mutator(next)
    projectRef.current = next
    ensureSelections(next)
    forceRedraw()
    emitProjectSync(reason)
  }, [emitProjectSync, ensureSelections, forceRedraw])

  const runContextAction = useCallback((action, target) => {
    if (!target) return
    if (action === 'delete-note') {
      commitProject((draft) => {
        const track = draft.tracks.find((item) => item.id === target.trackId)
        if (!track) return
        track.notes = track.notes.filter((item) => item.id !== target.noteId)
      }, 'note-delete')
      if (selectedNoteId === target.noteId) setSelectedNoteId(null)
    }
    if (action === 'duplicate-note') {
      commitProject((draft) => {
        const track = draft.tracks.find((item) => item.id === target.trackId)
        const note = track?.notes.find((item) => item.id === target.noteId)
        const clip = track?.clips.find((item) => item.id === (target.clipId || note?.clipId))
        if (!track || !note) return
        track.notes.push({
          ...note,
          id: randomId('note'),
          step: clamp(note.step + 1, 0, Math.max(STEP_COUNT - 1, ((clip?.length || 1) * STEP_COUNT) - 1))
        })
      }, 'note-duplicate')
    }
    if (action === 'lengthen-note') {
      commitProject((draft) => {
        const track = draft.tracks.find((item) => item.id === target.trackId)
        const note = track?.notes.find((item) => item.id === target.noteId)
        const clip = track?.clips.find((item) => item.id === (target.clipId || note?.clipId))
        if (note) note.length = clamp(note.length + 1, 1, Math.max(1, ((clip?.length || 1) * STEP_COUNT) - note.step))
      }, 'note-length')
    }
    if (action === 'shorten-note') {
      commitProject((draft) => {
        const track = draft.tracks.find((item) => item.id === target.trackId)
        const note = track?.notes.find((item) => item.id === target.noteId)
        if (note) note.length = clamp(note.length - 1, 1, STEP_COUNT)
      }, 'note-length')
    }
    if (action === 'delete-clip') {
      commitProject((draft) => {
        const track = draft.tracks.find((item) => item.id === target.trackId)
        if (!track) return
        track.clips = track.clips.filter((item) => item.id !== target.clipId)
        track.notes = track.notes.filter((item) => item.clipId !== target.clipId)
      }, 'clip-delete')
      if (selectedClipId === target.clipId) setSelectedClipId(null)
    }
    if (action === 'duplicate-clip') {
      commitProject((draft) => {
        const track = draft.tracks.find((item) => item.id === target.trackId)
        const clip = track?.clips.find((item) => item.id === target.clipId)
        if (!track || !clip) return
        const duplicate = {
          ...clip,
          id: randomId('clip'),
          bar: clamp(clip.bar + clip.length, 0, draft.bars - 1),
          name: `${clip.name} Copy`
        }
        track.clips.push(duplicate)
        track.notes
          .filter((item) => item.clipId === clip.id)
          .forEach((note) => {
            track.notes.push({ ...note, id: randomId('note'), clipId: duplicate.id })
          })
      }, 'clip-duplicate')
    }
    if (action === 'rename-clip') {
      const next = window.prompt('Rename clip', target.clipName || 'Clip')
      if (!next) return
      commitProject((draft) => {
        const track = draft.tracks.find((item) => item.id === target.trackId)
        const clip = track?.clips.find((item) => item.id === target.clipId)
        if (clip) clip.name = next.trim() || clip.name
      }, 'clip-rename')
    }
    if (action === 'grow-clip') {
      commitProject((draft) => {
        const track = draft.tracks.find((item) => item.id === target.trackId)
        const clip = track?.clips.find((item) => item.id === target.clipId)
        if (clip) clip.length = clamp(clip.length + 1, 1, draft.bars - clip.bar)
      }, 'clip-resize')
    }
    if (action === 'shrink-clip') {
      commitProject((draft) => {
        const track = draft.tracks.find((item) => item.id === target.trackId)
        const clip = track?.clips.find((item) => item.id === target.clipId)
        if (clip) clip.length = clamp(clip.length - 1, 1, draft.bars - clip.bar)
      }, 'clip-resize')
    }
    closeContextMenu()
  }, [closeContextMenu, commitProject, selectedClipId, selectedNoteId])

  const uploadProject = useCallback((project, reason = 'import') => {
    projectRef.current = copyProject(project)
    ensureSelections(projectRef.current)
    setCurrentBeat(0)
    setIsPlaying(false)
    playbackRef.current.lastStepKey = ''
    forceRedraw()
    emitProjectSync(reason)
  }, [emitProjectSync, ensureSelections, forceRedraw])

  const playPreviewNote = useCallback((track, note, clipOverride = null) => {
    if (!track || track.muted || !engineRef.current) return
    const clip = clipOverride || track.clips.find((item) => item.id === note.clipId) || track.clips[0]
    engineRef.current.play(track, note, { ...clip, bpm: projectRef.current.bpm }).catch?.(() => {})
  }, [])

  const triggerPlaybackStep = useCallback((stepIndex, barIndex) => {
    const project = projectRef.current
    const soloTracks = project.tracks.filter((track) => track.solo)
    const activeTracks = soloTracks.length > 0 ? soloTracks : project.tracks
    activeTracks.forEach((track) => {
      if (track.muted) return
      const clip = track.clips.find((item) => barIndex >= item.bar && barIndex < item.bar + item.length)
      if (!clip) return
      const clipLocalStep = (barIndex - clip.bar) * STEP_COUNT + stepIndex
      track.notes
        .filter((note) => note.clipId === clip.id && note.step === clipLocalStep)
        .forEach((note) => {
          playPreviewNote(track, note, clip)
        })
    })
  }, [playPreviewNote])

  useEffect(() => {
    if (!isPlaying) {
      playbackRef.current.active = false
      return
    }
    playbackRef.current.active = true
    playbackRef.current.lastTickTs = performance.now()
    let rafId = 0

    const tick = (ts) => {
      if (!playbackRef.current.active) return
      const delta = ts - playbackRef.current.lastTickTs
      playbackRef.current.lastTickTs = ts
      const beatDelta = (delta / 1000) * (projectRef.current.bpm / 60)
      setCurrentBeat((prev) => {
        const totalBeats = projectRef.current.bars * BEATS_PER_BAR
        const next = totalBeats > 0 ? (prev + beatDelta) % totalBeats : 0
        const stepIndex = ((Math.floor(next * 4) % STEP_COUNT) + STEP_COUNT) % STEP_COUNT
        const barIndex = Math.floor(next / BEATS_PER_BAR)
        const key = `${barIndex}:${stepIndex}`
        if (key !== playbackRef.current.lastStepKey) {
          playbackRef.current.lastStepKey = key
          triggerPlaybackStep(stepIndex, barIndex)
        }
        return next
      })
      rafId = window.requestAnimationFrame(tick)
    }

    rafId = window.requestAnimationFrame(tick)
    return () => {
      playbackRef.current.active = false
      window.cancelAnimationFrame(rafId)
    }
  }, [isPlaying, triggerPlaybackStep])

  useEffect(() => {
    if (!sdk) return
    const offEvent = sdk.on('event', (evt = {}) => {
      const eventType = evt.eventType
      const payload = evt.payload || {}
      const senderId = evt.userId || payload.userId || payload.actorId
      if (senderId && senderId === currentUser?.id) return

      if (eventType === 'daw:project-sync' && payload.project) {
        projectRef.current = copyProject(payload.project)
        ensureSelections(projectRef.current)
        forceRedraw()
      }

      if (eventType === 'daw:transport') {
        setIsPlaying(Boolean(payload.playing))
        setCurrentBeat(Number(payload.beat || 0))
        playbackRef.current.lastStepKey = ''
      }

      if (eventType === 'daw:cursor' && senderId) {
        remoteCursorsRef.current.set(senderId, {
          x: Number(payload.x || 0),
          y: Number(payload.y || 0),
          username: payload.username || 'Collaborator',
          ts: Date.now()
        })
        forceRedraw()
      }
    })
    return () => offEvent?.()
  }, [currentUser?.id, ensureSelections, forceRedraw, sdk])

  useEffect(() => {
    if (!navigator.requestMIDIAccess) {
      setMidiStatus('Web MIDI unavailable')
      return undefined
    }

    let cancelled = false
    let midiAccess = null
    const cleanups = []

    const attachInputs = (access) => {
      const inputs = Array.from(access.inputs.values())
      setMidiStatus(inputs.length ? `MIDI connected: ${inputs.length}` : 'No MIDI input')
      inputs.forEach((input) => {
        const handler = (event) => {
          if (cancelled) return
          const [status, data1, data2] = event.data || []
          const type = status & 0xf0
          if (type !== 0x90 || data2 === 0) return
          const row = rowFromMidi(data1)
          const track = projectRef.current.tracks.find((item) => item.id === selectedTrackId) || projectRef.current.tracks[0]
          if (!track) return
          const targetClip = track.clips.find((item) => item.id === selectedClipId) || track.clips[0]
          if (!targetClip) return
          const liveNote = {
            id: randomId('note'),
            clipId: targetClip.id,
            step: clamp(Math.round(((currentBeat - targetClip.bar * BEATS_PER_BAR + (targetClip.length * BEATS_PER_BAR)) % (targetClip.length * BEATS_PER_BAR)) * 4), 0, Math.max(STEP_COUNT - 1, (targetClip.length * STEP_COUNT) - 1)),
            row,
            length: 1,
            velocity: clamp(data2 / 127, 0.05, 1)
          }
          playPreviewNote(track, liveNote, targetClip)
          if (midiRecordEnabled) {
            commitProject((draft) => {
              const draftTrack = draft.tracks.find((item) => item.id === track.id)
              if (!draftTrack) return
              draftTrack.notes.push(liveNote)
            }, 'midi-record')
          }
        }
        input.addEventListener('midimessage', handler)
        cleanups.push(() => input.removeEventListener('midimessage', handler))
      })
    }

    navigator.requestMIDIAccess().then((access) => {
      if (cancelled) return
      midiAccess = access
      attachInputs(access)
      const stateHandler = () => {
        cleanups.splice(0).forEach((cleanup) => cleanup())
        attachInputs(access)
      }
      access.addEventListener('statechange', stateHandler)
      cleanups.push(() => access.removeEventListener('statechange', stateHandler))
    }).catch(() => {
      if (!cancelled) setMidiStatus('MIDI permission denied')
    })

    return () => {
      cancelled = true
      cleanups.splice(0).forEach((cleanup) => cleanup())
      midiAccess = null
    }
  }, [commitProject, currentBeat, midiRecordEnabled, playPreviewNote, selectedClipId, selectedTrackId])

  useEffect(() => {
    const element = rootRef.current
    if (!element) return undefined

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        closeContextMenu()
        return
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedTrack) {
        if (selectedNoteId) {
          event.preventDefault()
          runContextAction('delete-note', { trackId: selectedTrack.id, noteId: selectedNoteId })
          return
        }
        if (selectedClipId) {
          event.preventDefault()
          runContextAction('delete-clip', {
            trackId: selectedTrack.id,
            clipId: selectedClipId,
            clipName: selectedClip?.name || 'Clip'
          })
        }
      }

      if ((event.key === 'd' || event.key === 'D') && (event.ctrlKey || event.metaKey) && selectedTrack) {
        event.preventDefault()
        if (selectedNoteId) {
          runContextAction('duplicate-note', { trackId: selectedTrack.id, noteId: selectedNoteId })
          return
        }
        if (selectedClipId) {
          runContextAction('duplicate-clip', {
            trackId: selectedTrack.id,
            clipId: selectedClipId,
            clipName: selectedClip?.name || 'Clip'
          })
        }
      }
    }

    element.addEventListener('keydown', onKeyDown)
    return () => element.removeEventListener('keydown', onKeyDown)
  }, [closeContextMenu, runContextAction, selectedClip, selectedClipId, selectedNoteId, selectedTrack])

  const getLayout = useCallback((width, height) => {
    const topBarH = 64
    const footerH = 28
    const leftPanelW = 286
    const rightPanelW = 192
    const editorH = Math.max(320, Math.floor(height * 0.42))
    const arrangementH = height - topBarH - footerH - editorH
    return {
      topBarH,
      footerH,
      leftPanel: { x: 0, y: topBarH, width: leftPanelW, height: height - topBarH - footerH },
      arrangement: { x: leftPanelW, y: topBarH, width: width - leftPanelW - rightPanelW, height: arrangementH },
      editor: { x: leftPanelW, y: topBarH + arrangementH, width: width - leftPanelW - rightPanelW, height: editorH },
      rightPanel: { x: width - rightPanelW, y: topBarH, width: rightPanelW, height: height - topBarH - footerH },
      footer: { x: 0, y: height - footerH, width, height: footerH }
    }
  }, [])

  const hitTest = useCallback((x, y) => {
    for (let index = interactionsRef.current.length - 1; index >= 0; index -= 1) {
      const item = interactionsRef.current[index]
      if (x >= item.x && x <= item.x + item.width && y >= item.y && y <= item.y + item.height) {
        return item
      }
    }
    return null
  }, [])

  const drawButton = (ctx, list, config) => {
    const { x, y, width, height, label, active = false, accent = false, danger = false, onClick } = config
    ctx.fillStyle = danger ? '#482232' : active ? COLORS.accent : accent ? COLORS.panelMuted : COLORS.panelAlt
    ctx.strokeStyle = active ? COLORS.accentStrong : danger ? COLORS.danger : COLORS.stroke
    ctx.lineWidth = 1
    drawRoundedRect(ctx, x, y, width, height, 10)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = active ? '#1f1600' : COLORS.text
    ctx.font = '12px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, x + width / 2, y + height / 2)
    list.push({ x, y, width, height, onClick, cursor: 'pointer' })
  }

  const drawSlider = (ctx, list, config) => {
    const { x, y, width, label, value, min, max, onChange, accent = COLORS.success } = config
    const normalized = clamp((value - min) / ((max - min) || 1), 0, 1)
    ctx.fillStyle = COLORS.textMuted
    ctx.font = '11px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText(label, x, y - 8)
    ctx.fillStyle = COLORS.panelMuted
    ctx.fillRect(x, y, width, 6)
    ctx.fillStyle = accent
    ctx.fillRect(x, y, width * normalized, 6)
    const knobX = x + width * normalized
    ctx.fillStyle = COLORS.text
    ctx.beginPath()
    ctx.arc(knobX, y + 3, 7, 0, Math.PI * 2)
    ctx.fill()
    list.push({
      x,
      y: y - 10,
      width,
      height: 24,
      cursor: 'ew-resize',
      onPointerDown: (px) => {
        const apply = (nextX) => {
          const ratio = clamp((nextX - x) / width, 0, 1)
          onChange(min + ratio * (max - min))
        }
        apply(px)
        dragRef.current = { type: 'slider', apply }
      }
    })
  }

  const exportProjectJson = useCallback(() => {
    const blob = new Blob([JSON.stringify(copyProject(projectRef.current), null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `colabcreate-${Date.now()}.json`
    link.click()
    URL.revokeObjectURL(url)
  }, [])

  const exportMidi = useCallback(() => {
    const buffer = exportMidiBuffer(projectRef.current)
    const blob = new Blob([buffer], { type: 'audio/midi' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `colabcreate-${Date.now()}.mid`
    link.click()
    URL.revokeObjectURL(url)
  }, [])

  const exportPreset = useCallback(() => {
    if (!selectedTrack) return
    const blob = new Blob([JSON.stringify(selectedTrack.instrument, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${selectedTrack.name.replace(/\s+/g, '-').toLowerCase()}-preset.json`
    link.click()
    URL.revokeObjectURL(url)
  }, [selectedTrack])

  const importProject = useCallback((event) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result)
        uploadProject(parsed, 'project-import')
      } catch (error) {
        console.error('[ColabCreate] Project import failed', error)
      }
    }
    reader.readAsText(file)
    event.target.value = ''
  }, [uploadProject])

  const importPreset = useCallback((event) => {
    const file = event.target.files?.[0]
    if (!file || !selectedTrack) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result)
        commitProject((draft) => {
          const track = draft.tracks.find((item) => item.id === selectedTrack.id)
          if (!track) return
          track.instrument = parsed
          if (track.instrument.id === 'sampler') {
            engineRef.current?.invalidateSampleBuffer(track.id)
          }
          const instrumentMeta = INSTRUMENTS.find((item) => item.id === track.instrument.id)
          if (instrumentMeta) track.color = instrumentMeta.color
        }, 'preset-import')
      } catch (error) {
        console.error('[ColabCreate] Preset import failed', error)
      }
    }
    reader.readAsText(file)
    event.target.value = ''
  }, [commitProject, selectedTrack])

  const importMidi = useCallback((event) => {
    const file = event.target.files?.[0]
    if (!file || !selectedTrack) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = parseMidiBuffer(reader.result)
        commitProject((draft) => {
          const track = draft.tracks.find((item) => item.id === selectedTrack.id)
          if (!track) return
          const clip = track.clips.find((item) => item.id === selectedClipId) || track.clips[0] || makeClip(0, Math.max(1, parsed.bars), 'Imported')
          if (!track.clips.find((item) => item.id === clip.id)) track.clips.push(clip)
          clip.bar = 0
          clip.length = Math.max(1, parsed.bars)
          clip.name = 'Imported MIDI'
          draft.bpm = clamp(parsed.bpm || draft.bpm, 40, 240)
          draft.bars = Math.max(draft.bars, parsed.bars)
          track.notes = parsed.notes.map((note) => ({
            ...note,
            clipId: clip.id,
            step: clamp((note.bar * STEP_COUNT) + note.step, 0, Math.max(STEP_COUNT - 1, (clip.length * STEP_COUNT) - 1))
          }))
        }, 'midi-import')
      } catch (error) {
        console.error('[ColabCreate] MIDI import failed', error)
      }
    }
    reader.readAsArrayBuffer(file)
    event.target.value = ''
  }, [commitProject, selectedClipId, selectedTrack])

  const importSample = useCallback((event) => {
    const file = event.target.files?.[0]
    if (!file || !selectedTrack) return
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const sourceData = reader.result
        const arrayBuffer = dataUrlToArrayBuffer(sourceData)
        const ctx = engineRef.current?.ensureContext()
        if (!ctx) return
        const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0))
        const peaks = buildPeaks(decoded.getChannelData(0), 112)
        commitProject((draft) => {
          const track = draft.tracks.find((item) => item.id === selectedTrack.id)
          if (!track) return
          track.instrument.id = 'sampler'
          track.instrument.params = track.instrument.params || {}
          track.instrument.params.sample = {
            sampleName: file.name,
            sourceData,
            peaks,
            trimStart: 0,
            trimEnd: 1,
            gain: 1,
            rootNote: 60
          }
          track.color = INSTRUMENTS.find((item) => item.id === 'sampler')?.color || track.color
        }, 'sample-import')
        engineRef.current?.invalidateSampleBuffer(selectedTrack.id)
      } catch (error) {
        console.error('[ColabCreate] Sample import failed', error)
      }
    }
    reader.readAsDataURL(file)
    event.target.value = ''
  }, [commitProject, selectedTrack])

  const drawSurface = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = surfaceSize.width
    canvas.height = surfaceSize.height
    const layout = getLayout(canvas.width, canvas.height)
    const interactions = []
    interactionsRef.current = interactions

    const project = projectRef.current
    const activeTrack = project.tracks.find((item) => item.id === selectedTrackId) || project.tracks[0] || null
    const activeClip = activeTrack?.clips.find((item) => item.id === selectedClipId) || activeTrack?.clips[0] || null
    const clipStepCount = Math.max(STEP_COUNT, (activeClip?.length || 1) * STEP_COUNT)
    const arrangementHeaderH = 34
    const arrangementRowH = 58
    const beatWidth = 34
    const barWidth = beatWidth * BEATS_PER_BAR
    const arrangementX = layout.arrangement.x + 16
    const arrangementY = layout.arrangement.y + arrangementHeaderH + 10
    const editorHeaderH = 30
    const editorX = layout.editor.x + 16
    const editorY = layout.editor.y + editorHeaderH + 8
    const deviceChainH = 118
    const editorMainH = Math.max(150, layout.editor.height - editorHeaderH - 18 - deviceChainH)
    const deviceY = editorY + editorMainH + 12
    const pianoKeyW = 76
    const pianoGridX = editorX + pianoKeyW
    const pianoGridW = layout.editor.width - 28 - pianoKeyW
    const pianoRowH = editorMainH / PIANO_ROWS
    const pianoStepW = pianoGridW / clipStepCount
    const browserSectionItems = browserSection === 'instruments'
      ? INSTRUMENTS
      : browserSection === 'effects'
        ? EFFECTS
        : browserSection === 'clips'
          ? (activeTrack?.clips || []).map((clip) => ({ id: clip.id, name: clip.name, color: activeTrack?.color || COLORS.accent }))
          : [
              { id: 'project-in', name: 'Import Project', color: COLORS.cyan },
              { id: 'project-out', name: 'Export Project', color: COLORS.accent },
              { id: 'midi-in', name: 'Import MIDI', color: COLORS.success },
              { id: 'midi-out', name: 'Export MIDI', color: COLORS.lavender }
            ]

    ctx.fillStyle = COLORS.bg
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = COLORS.panelGlass
    ctx.fillRect(0, 0, canvas.width, layout.topBarH)
    ctx.strokeStyle = COLORS.stroke
    ctx.beginPath()
    ctx.moveTo(0, layout.topBarH + 0.5)
    ctx.lineTo(canvas.width, layout.topBarH + 0.5)
    ctx.stroke()

    ;[layout.leftPanel, layout.arrangement, layout.editor, layout.rightPanel, layout.footer].forEach((panel) => {
      ctx.fillStyle = COLORS.panel
      ctx.fillRect(panel.x, panel.y, panel.width, panel.height)
      ctx.strokeStyle = COLORS.stroke
      ctx.strokeRect(panel.x + 0.5, panel.y + 0.5, panel.width - 1, panel.height - 1)
    })

    ctx.fillStyle = COLORS.text
    ctx.font = 'bold 18px sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(project.name, 18, 26)
    ctx.font = '12px sans-serif'
    ctx.fillStyle = COLORS.textDim
    ctx.fillText('Canvas IMGUI DAW  |  MIDI + Sampler + FM + Wavetable + Bytebeat', 18, 46)

    drawButton(ctx, interactions, {
      x: 336, y: 14, width: 66, height: 32, label: isPlaying ? 'Pause' : 'Play', active: isPlaying,
      onClick: () => {
        const next = !isPlaying
        setIsPlaying(next)
        if (!next) playbackRef.current.lastStepKey = ''
        sdk?.emitEvent('daw:transport', { playing: next, beat: currentBeat }, { serverRelay: true })
      }
    })
    drawButton(ctx, interactions, {
      x: 408, y: 14, width: 56, height: 32, label: 'Stop',
      onClick: () => {
        setIsPlaying(false)
        setCurrentBeat(0)
        playbackRef.current.lastStepKey = ''
        sdk?.emitEvent('daw:transport', { playing: false, beat: 0 }, { serverRelay: true })
      }
    })
    drawButton(ctx, interactions, {
      x: 470, y: 14, width: 74, height: 32, label: 'Track +',
      onClick: () => {
        commitProject((draft) => {
          const instrumentId = INSTRUMENTS[draft.tracks.length % INSTRUMENTS.length].id
          draft.tracks.push(makeTrack(draft.tracks.length, instrumentId))
        }, 'track-add')
      }
    })
    drawButton(ctx, interactions, {
      x: 550, y: 14, width: 64, height: 32, label: 'Piano', active: editorMode === 'piano',
      onClick: () => setEditorMode('piano')
    })
    drawButton(ctx, interactions, {
      x: 620, y: 14, width: 72, height: 32, label: 'Sample', active: editorMode === 'sample',
      onClick: () => setEditorMode('sample')
    })
    drawButton(ctx, interactions, {
      x: 698, y: 14, width: 68, height: 32, label: 'Select', active: selectedTool === 'select',
      onClick: () => setSelectedTool('select')
    })
    drawButton(ctx, interactions, {
      x: 772, y: 14, width: 58, height: 32, label: 'Draw', active: selectedTool === 'draw',
      onClick: () => setSelectedTool('draw')
    })
    drawButton(ctx, interactions, {
      x: 836, y: 14, width: 60, height: 32, label: 'Erase', active: selectedTool === 'erase',
      onClick: () => setSelectedTool('erase')
    })
    drawButton(ctx, interactions, {
      x: canvas.width - 468, y: 14, width: 70, height: 32, label: `BPM ${project.bpm}`,
      onClick: () => {
        const next = Number(window.prompt('Set BPM', String(project.bpm)))
        if (!Number.isFinite(next)) return
        commitProject((draft) => {
          draft.bpm = clamp(Math.round(next), 40, 240)
        }, 'tempo')
      }
    })
    drawButton(ctx, interactions, {
      x: canvas.width - 392, y: 14, width: 62, height: 32, label: 'Proj In',
      onClick: () => importProjectRef.current?.click?.()
    })
    drawButton(ctx, interactions, {
      x: canvas.width - 324, y: 14, width: 68, height: 32, label: 'Proj Out',
      onClick: exportProjectJson
    })
    drawButton(ctx, interactions, {
      x: canvas.width - 250, y: 14, width: 62, height: 32, label: 'MIDI In',
      onClick: () => importMidiRef.current?.click?.()
    })
    drawButton(ctx, interactions, {
      x: canvas.width - 182, y: 14, width: 72, height: 32, label: 'MIDI Out',
      onClick: exportMidi
    })
    drawButton(ctx, interactions, {
      x: canvas.width - 104, y: 14, width: 86, height: 32, label: midiRecordEnabled ? 'MIDI Rec' : 'MIDI Arm', active: midiRecordEnabled,
      onClick: () => setMidiRecordEnabled((value) => !value)
    })

    ctx.fillStyle = COLORS.text
    ctx.font = 'bold 13px sans-serif'
    ctx.fillText('Browser', layout.leftPanel.x + 18, layout.leftPanel.y + 24)
    ctx.font = '11px sans-serif'
    ctx.fillStyle = COLORS.textMuted
    ctx.fillText('Ableton-style workflow, Volt layout', layout.leftPanel.x + 18, layout.leftPanel.y + 43)

    BROWSER_SECTIONS.forEach((section, index) => {
      drawButton(ctx, interactions, {
        x: layout.leftPanel.x + 14 + index * 64,
        y: layout.leftPanel.y + 54,
        width: 58,
        height: 22,
        label: section.name.slice(0, 5),
        active: browserSection === section.id,
        onClick: () => setBrowserSection(section.id)
      })
    })

    ctx.fillStyle = COLORS.panelGlass
    ctx.fillRect(layout.leftPanel.x + 12, layout.leftPanel.y + 86, layout.leftPanel.width - 24, 222)
    ctx.strokeStyle = COLORS.stroke
    ctx.strokeRect(layout.leftPanel.x + 12.5, layout.leftPanel.y + 86.5, layout.leftPanel.width - 25, 221)
    ctx.fillStyle = COLORS.textMuted
    ctx.font = '11px sans-serif'
    ctx.fillText(browserSection === 'effects' ? 'Audio Effects' : browserSection === 'clips' ? 'Clip Browser' : browserSection === 'io' ? 'Project Actions' : 'Instruments', layout.leftPanel.x + 24, layout.leftPanel.y + 104)

    browserSectionItems.slice(0, 6).forEach((item, index) => {
      const itemY = layout.leftPanel.y + 114 + index * 30
      ctx.fillStyle = index % 2 === 0 ? COLORS.panelAlt : COLORS.panel
      ctx.fillRect(layout.leftPanel.x + 18, itemY, layout.leftPanel.width - 36, 24)
      ctx.fillStyle = item.color || COLORS.accent
      ctx.fillRect(layout.leftPanel.x + 24, itemY + 5, 8, 14)
      ctx.fillStyle = COLORS.text
      ctx.font = '11px sans-serif'
      ctx.fillText(item.name, layout.leftPanel.x + 40, itemY + 16)
      interactions.push({
        x: layout.leftPanel.x + 18,
        y: itemY,
        width: layout.leftPanel.width - 36,
        height: 24,
        cursor: 'pointer',
        onClick: () => {
          if (!activeTrack) return
          if (browserSection === 'instruments' && INSTRUMENTS.find((entry) => entry.id === item.id)) {
            commitProject((draft) => {
              const track = draft.tracks.find((entry) => entry.id === activeTrack.id)
              const instrument = INSTRUMENTS.find((entry) => entry.id === item.id)
              if (!track || !instrument) return
              track.instrument = defaultInstrumentState(instrument.id)
              track.color = instrument.color
            }, 'instrument-change')
            if (item.id === 'sampler') setEditorMode('sample')
          } else if (browserSection === 'effects' && EFFECTS.find((entry) => entry.id === item.id)) {
            commitProject((draft) => {
              const track = draft.tracks.find((entry) => entry.id === activeTrack.id)
              const effect = EFFECTS.find((entry) => entry.id === item.id)
              if (!track || !effect) return
              if (!track.effectChain.find((entry) => entry.id === effect.id)) {
                track.effectChain.push({ ...effect })
              }
            }, 'effect-add')
          } else if (browserSection === 'clips' && activeTrack.clips.find((entry) => entry.id === item.id)) {
            setSelectedClipId(item.id)
          } else if (browserSection === 'io') {
            if (item.id === 'project-in') importProjectRef.current?.click?.()
            if (item.id === 'project-out') exportProjectJson()
            if (item.id === 'midi-in') importMidiRef.current?.click?.()
            if (item.id === 'midi-out') exportMidi()
          }
        }
      })
    })

    ctx.fillStyle = COLORS.text
    ctx.font = 'bold 13px sans-serif'
    ctx.fillText('Session Tracks', layout.leftPanel.x + 18, layout.leftPanel.y + 334)
    ctx.font = '11px sans-serif'
    ctx.fillStyle = COLORS.textMuted
    ctx.fillText(midiStatus, layout.leftPanel.x + 18, layout.leftPanel.y + 352)

    project.tracks.forEach((track, trackIndex) => {
      const rowY = layout.leftPanel.y + 364 + trackIndex * arrangementRowH
      const selected = track.id === activeTrack?.id
      ctx.fillStyle = selected ? COLORS.panelMuted : COLORS.panelAlt
      ctx.fillRect(layout.leftPanel.x + 12, rowY, layout.leftPanel.width - 24, arrangementRowH - 8)
      ctx.strokeStyle = selected ? COLORS.accent : COLORS.stroke
      ctx.strokeRect(layout.leftPanel.x + 12.5, rowY + 0.5, layout.leftPanel.width - 25, arrangementRowH - 9)
      ctx.fillStyle = track.color
      ctx.fillRect(layout.leftPanel.x + 18, rowY + 10, 6, arrangementRowH - 28)
      ctx.fillStyle = COLORS.text
      ctx.font = 'bold 12px sans-serif'
      ctx.fillText(track.name, layout.leftPanel.x + 34, rowY + 18)
      ctx.font = '11px sans-serif'
      ctx.fillStyle = COLORS.textDim
      ctx.fillText(INSTRUMENTS.find((item) => item.id === track.instrument.id)?.name || track.instrument.id, layout.leftPanel.x + 34, rowY + 34)
      ctx.fillText(`${track.clips.length} clips  •  ${track.notes.length} notes`, layout.leftPanel.x + 34, rowY + 48)
      drawButton(ctx, interactions, {
        x: layout.leftPanel.x + layout.leftPanel.width - 82, y: rowY + 10, width: 24, height: 22, label: 'M', active: track.muted, danger: track.muted,
        onClick: () => commitProject((draft) => {
          const target = draft.tracks.find((item) => item.id === track.id)
          if (target) target.muted = !target.muted
        }, 'mute')
      })
      drawButton(ctx, interactions, {
        x: layout.leftPanel.x + layout.leftPanel.width - 52, y: rowY + 10, width: 24, height: 22, label: 'S', active: track.solo,
        onClick: () => commitProject((draft) => {
          const target = draft.tracks.find((item) => item.id === track.id)
          if (target) target.solo = !target.solo
        }, 'solo')
      })
      interactions.push({
        x: layout.leftPanel.x + 12, y: rowY, width: layout.leftPanel.width - 24, height: arrangementRowH - 8, cursor: 'pointer',
        onClick: () => {
          closeContextMenu()
          setSelectedTrackId(track.id)
          setSelectedClipId(track.clips[0]?.id || null)
          setSelectedNoteId(null)
        }
      })
    })

    ctx.fillStyle = COLORS.text
    ctx.font = 'bold 13px sans-serif'
    ctx.fillText('Arrangement', layout.arrangement.x + 18, layout.arrangement.y + 23)

    for (let bar = 0; bar < project.bars; bar += 1) {
      const x = arrangementX + bar * barWidth
      ctx.fillStyle = bar % 2 === 0 ? '#2a2141' : '#241d38'
      ctx.fillRect(x, arrangementY - 4, barWidth, project.tracks.length * arrangementRowH + 8)
      ctx.strokeStyle = COLORS.gridBar
      ctx.beginPath()
      ctx.moveTo(x + 0.5, arrangementY - 4)
      ctx.lineTo(x + 0.5, arrangementY + project.tracks.length * arrangementRowH + 4)
      ctx.stroke()
      ctx.fillStyle = COLORS.textDim
      ctx.font = '11px sans-serif'
      ctx.fillText(`Bar ${bar + 1}`, x + 10, layout.arrangement.y + 23)
      for (let beat = 1; beat < BEATS_PER_BAR; beat += 1) {
        const beatX = x + beat * beatWidth
        ctx.strokeStyle = COLORS.gridBeat
        ctx.beginPath()
        ctx.moveTo(beatX + 0.5, arrangementY - 4)
        ctx.lineTo(beatX + 0.5, arrangementY + project.tracks.length * arrangementRowH + 4)
        ctx.stroke()
      }
    }

    project.tracks.forEach((track, rowIndex) => {
      const rowY = arrangementY + rowIndex * arrangementRowH
      ctx.strokeStyle = COLORS.stroke
      ctx.beginPath()
      ctx.moveTo(arrangementX, rowY + arrangementRowH + 0.5)
      ctx.lineTo(arrangementX + project.bars * barWidth, rowY + arrangementRowH + 0.5)
      ctx.stroke()

      track.clips.forEach((clip) => {
        const clipX = arrangementX + clip.bar * barWidth + 4
        const clipW = clip.length * barWidth - 8
        const clipSelected = clip.id === activeClip?.id && track.id === activeTrack?.id
        ctx.fillStyle = clipSelected ? COLORS.accent : track.color
        ctx.globalAlpha = clipSelected ? 0.96 : 0.72
        ctx.fillRect(clipX, rowY + 8, clipW, arrangementRowH - 18)
        ctx.globalAlpha = 1
        ctx.strokeStyle = clipSelected ? '#fff5ce' : track.color
        ctx.strokeRect(clipX + 0.5, rowY + 8.5, clipW - 1, arrangementRowH - 19)
        ctx.fillStyle = clipSelected ? '#1c1400' : '#16111f'
        ctx.font = 'bold 11px sans-serif'
        ctx.fillText(clip.name, clipX + 8, rowY + 27)
        ctx.font = '10px sans-serif'
        ctx.fillText(`${clip.length} bar`, clipX + 8, rowY + 41)
        interactions.push({
          x: clipX, y: rowY + 8, width: clipW, height: arrangementRowH - 18,
          cursor: selectedTool === 'erase' ? 'not-allowed' : 'move',
          onClick: () => {
            closeContextMenu()
            setSelectedTrackId(track.id)
            setSelectedClipId(clip.id)
            setSelectedNoteId(null)
            if (selectedTool === 'erase') {
              commitProject((draft) => {
                const draftTrack = draft.tracks.find((item) => item.id === track.id)
                if (!draftTrack) return
                draftTrack.clips = draftTrack.clips.filter((item) => item.id !== clip.id)
                draftTrack.notes = draftTrack.notes.filter((item) => item.clipId !== clip.id)
              }, 'clip-delete')
            }
          },
          onPointerDown: (px) => {
            if (selectedTool === 'erase') return
            closeContextMenu()
            dragRef.current = { type: 'clip-move', startX: px, clipId: clip.id, trackId: track.id, originBar: clip.bar }
          },
          onContextMenu: (event) => {
            event.preventDefault()
            setSelectedTrackId(track.id)
            setSelectedClipId(clip.id)
            setSelectedNoteId(null)
            setContextMenu({
              x: event.clientX - canvas.getBoundingClientRect().left,
              y: event.clientY - canvas.getBoundingClientRect().top,
              kind: 'clip',
              trackId: track.id,
              clipId: clip.id,
              clipName: clip.name
            })
          }
        })

        interactions.push({
          x: clipX + clipW - 10,
          y: rowY + 8,
          width: 10,
          height: arrangementRowH - 18,
          cursor: 'ew-resize',
          onPointerDown: (px) => {
            closeContextMenu()
            dragRef.current = {
              type: 'clip-resize',
              startX: px,
              clipId: clip.id,
              trackId: track.id,
              originLength: clip.length,
              clipBar: clip.bar
            }
          }
        })
      })

      for (let bar = 0; bar < project.bars; bar += 1) {
        interactions.push({
          x: arrangementX + bar * barWidth, y: rowY, width: barWidth, height: arrangementRowH, cursor: 'crosshair',
          onClick: () => {
            closeContextMenu()
            setSelectedTrackId(track.id)
            setSelectedNoteId(null)
            if (selectedTool !== 'draw') return
            const existing = track.clips.find((item) => item.bar === bar)
            if (existing) {
              setSelectedClipId(existing.id)
              return
            }
            commitProject((draft) => {
              const draftTrack = draft.tracks.find((item) => item.id === track.id)
              if (!draftTrack) return
              const nextClip = makeClip(bar, 1, `Clip ${draftTrack.clips.length + 1}`)
              draftTrack.clips.push(nextClip)
            }, 'clip-add')
          }
        })
      }
    })

    const loopBeat = currentBeat % Math.max(1, project.bars * BEATS_PER_BAR)
    const playheadX = arrangementX + loopBeat * beatWidth
    ctx.strokeStyle = COLORS.playhead
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(playheadX + 0.5, layout.arrangement.y + 12)
    ctx.lineTo(playheadX + 0.5, layout.editor.y + layout.editor.height - 8)
    ctx.stroke()

    ctx.fillStyle = COLORS.panelAlt
    ctx.fillRect(layout.editor.x, layout.editor.y, layout.editor.width, editorHeaderH)
    ctx.fillStyle = COLORS.text
    ctx.font = 'bold 13px sans-serif'
    ctx.fillText(editorMode === 'sample' ? 'Clip / Sample Detail' : 'Clip / MIDI Detail', layout.editor.x + 18, layout.editor.y + 18)
    ctx.font = '11px sans-serif'
    ctx.fillStyle = COLORS.textDim
    ctx.fillText(activeClip ? activeClip.name : 'No clip selected', layout.editor.x + 156, layout.editor.y + 18)

    if (editorMode === 'piano') {
      for (let step = 0; step < clipStepCount; step += 1) {
        const x = pianoGridX + step * pianoStepW
        ctx.fillStyle = step % 4 === 0 ? '#342950' : '#2a2141'
        ctx.fillRect(x, editorY, pianoStepW, editorMainH)
        ctx.strokeStyle = step % STEP_COUNT === 0 ? COLORS.gridBar : COLORS.gridBeat
        ctx.beginPath()
        ctx.moveTo(x + 0.5, editorY)
        ctx.lineTo(x + 0.5, editorY + editorMainH)
        ctx.stroke()
        ctx.fillStyle = COLORS.textMuted
        ctx.font = '10px sans-serif'
        ctx.fillText(step % STEP_COUNT === 0 ? `Bar ${Math.floor(step / STEP_COUNT) + 1}` : String((step % STEP_COUNT) + 1), x + 6, layout.editor.y + 18)
      }

      for (let row = 0; row < PIANO_ROWS; row += 1) {
        const y = editorY + row * pianoRowH
        const midi = midiFromRow(row)
        const isBlack = [1, 3, 6, 8, 10].includes(midi % 12)
        ctx.fillStyle = isBlack ? '#494162' : '#d5cee7'
        ctx.fillRect(editorX, y, pianoKeyW - 2, pianoRowH)
        ctx.strokeStyle = COLORS.stroke
        ctx.strokeRect(editorX + 0.5, y + 0.5, pianoKeyW - 3, pianoRowH - 1)
        ctx.fillStyle = isBlack ? '#f7f3ff' : '#171326'
        ctx.font = '10px monospace'
        ctx.fillText(`${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`, editorX + 10, y + pianoRowH / 2 + 1)
        for (let step = 0; step < clipStepCount; step += 1) {
          const x = pianoGridX + step * pianoStepW
          ctx.strokeStyle = row % 2 === 0 ? '#3a2f58' : '#2f2647'
          ctx.strokeRect(x + 0.5, y + 0.5, pianoStepW - 1, pianoRowH - 1)
        }
      }

      activeTrack?.notes
        .filter((note) => note.clipId === activeClip?.id)
        .forEach((note) => {
          const x = pianoGridX + note.step * pianoStepW + 2
          const y = editorY + note.row * pianoRowH + 2
          const width = pianoStepW * note.length - 4
          const height = pianoRowH - 4
          const noteSelected = note.id === selectedNoteId
          ctx.fillStyle = noteSelected ? COLORS.accent : activeTrack.color
          ctx.globalAlpha = 0.88
          ctx.fillRect(x, y, width, height)
          ctx.globalAlpha = 1
          ctx.strokeStyle = noteSelected ? '#fff7d3' : '#fff5ce'
          ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1)
          interactions.push({
            x, y, width, height, cursor: selectedTool === 'erase' ? 'not-allowed' : 'pointer',
            onClick: () => {
              closeContextMenu()
              setSelectedNoteId(note.id)
              if (selectedTool === 'erase') {
                commitProject((draft) => {
                  const draftTrack = draft.tracks.find((item) => item.id === activeTrack.id)
                  if (!draftTrack) return
                  draftTrack.notes = draftTrack.notes.filter((item) => item.id !== note.id)
                }, 'note-delete')
                setSelectedNoteId(null)
              } else {
                playPreviewNote(activeTrack, note, activeClip)
              }
            },
            onPointerDown: () => {
              if (selectedTool === 'erase') return
              closeContextMenu()
              setSelectedNoteId(note.id)
              dragRef.current = {
                type: 'note-move',
                trackId: activeTrack.id,
                noteId: note.id,
                clipId: activeClip?.id,
                originStep: note.step,
                originRow: note.row
              }
            },
            onContextMenu: (event) => {
              event.preventDefault()
              setSelectedNoteId(note.id)
              setContextMenu({
                x: event.clientX - canvas.getBoundingClientRect().left,
                y: event.clientY - canvas.getBoundingClientRect().top,
                kind: 'note',
                trackId: activeTrack.id,
                clipId: activeClip?.id,
                noteId: note.id
              })
            }
          })
        })

      for (let row = 0; row < PIANO_ROWS; row += 1) {
        for (let step = 0; step < clipStepCount; step += 1) {
          interactions.push({
            x: pianoGridX + step * pianoStepW,
            y: editorY + row * pianoRowH,
            width: pianoStepW,
            height: pianoRowH,
            cursor: selectedTool === 'erase' ? 'not-allowed' : 'crosshair',
            onClick: () => {
              if (!activeTrack || !activeClip) return
              closeContextMenu()
              const existing = activeTrack.notes.find((note) => note.clipId === activeClip.id && note.step === step && note.row === row)
              if (selectedTool === 'erase') {
                if (!existing) return
                commitProject((draft) => {
                  const draftTrack = draft.tracks.find((item) => item.id === activeTrack.id)
                  if (!draftTrack) return
                  draftTrack.notes = draftTrack.notes.filter((item) => item.id !== existing.id)
                }, 'note-delete')
                setSelectedNoteId(null)
                return
              }
              if (existing) {
                setSelectedNoteId(existing.id)
                playPreviewNote(activeTrack, existing, activeClip)
                return
              }
              const note = {
                id: randomId('note'),
                clipId: activeClip.id,
                step,
                row,
                length: 1,
                velocity: 0.82
              }
              commitProject((draft) => {
                const draftTrack = draft.tracks.find((item) => item.id === activeTrack.id)
                if (!draftTrack) return
                  draftTrack.notes.push(note)
              }, 'note-add')
              setSelectedNoteId(note.id)
              playPreviewNote(activeTrack, note, activeClip)
            }
          })
        }
      }
    } else {
      const sample = activeTrack?.instrument?.params?.sample || defaultSampleState()
      const waveArea = {
        x: layout.editor.x + 20,
        y: layout.editor.y + 48,
        width: layout.editor.width - 40,
        height: editorMainH - 18
      }
      ctx.fillStyle = COLORS.panelAlt
      ctx.fillRect(waveArea.x, waveArea.y, waveArea.width, waveArea.height)
      ctx.strokeStyle = COLORS.stroke
      ctx.strokeRect(waveArea.x + 0.5, waveArea.y + 0.5, waveArea.width - 1, waveArea.height - 1)
      const peaks = sample.peaks?.length ? sample.peaks : defaultSampleState().peaks
      ctx.strokeStyle = COLORS.waveform
      ctx.lineWidth = 1.5
      ctx.beginPath()
      peaks.forEach((peak, index) => {
        const x = waveArea.x + (index / Math.max(1, peaks.length - 1)) * waveArea.width
        const midY = waveArea.y + waveArea.height / 2
        const amp = peak * (waveArea.height * 0.45)
        ctx.moveTo(x, midY - amp)
        ctx.lineTo(x, midY + amp)
      })
      ctx.stroke()
      const trimStartX = waveArea.x + waveArea.width * clamp(sample.trimStart || 0, 0, 1)
      const trimEndX = waveArea.x + waveArea.width * clamp(sample.trimEnd || 1, 0, 1)
      ctx.fillStyle = 'rgba(255, 191, 47, 0.12)'
      ctx.fillRect(trimStartX, waveArea.y, trimEndX - trimStartX, waveArea.height)
      ctx.strokeStyle = COLORS.accent
      ctx.lineWidth = 2
      ;[trimStartX, trimEndX].forEach((x) => {
        ctx.beginPath()
        ctx.moveTo(x + 0.5, waveArea.y)
        ctx.lineTo(x + 0.5, waveArea.y + waveArea.height)
        ctx.stroke()
      })

      ctx.fillStyle = COLORS.text
      ctx.font = 'bold 12px sans-serif'
      ctx.fillText(sample.sampleName || 'No sample loaded', waveArea.x, waveArea.y - 12)
      ctx.font = '11px sans-serif'
      ctx.fillStyle = COLORS.textDim
      ctx.fillText('Sampler clip editor: trim, gain, root note and import/export patch.', waveArea.x + 210, waveArea.y - 12)

      if (activeTrack?.instrument?.id !== 'sampler') {
        ctx.fillStyle = COLORS.textDim
        ctx.font = '13px sans-serif'
        ctx.fillText('Switch the selected track to Sampler to use the sample editor.', waveArea.x + 20, waveArea.y + 30)
      }

      drawSlider(ctx, interactions, {
        x: waveArea.x, y: layout.editor.y + layout.editor.height - 50, width: 160, label: 'Trim Start',
        value: sample.trimStart || 0, min: 0, max: Math.max(0.01, (sample.trimEnd || 1) - 0.01),
        onChange: (value) => commitProject((draft) => {
          const track = draft.tracks.find((item) => item.id === activeTrack?.id)
          if (!track?.instrument?.params?.sample) return
          track.instrument.params.sample.trimStart = value
        }, 'sample-trim')
      })
      drawSlider(ctx, interactions, {
        x: waveArea.x + 184, y: layout.editor.y + layout.editor.height - 50, width: 160, label: 'Trim End',
        value: sample.trimEnd || 1, min: Math.min(0.99, (sample.trimStart || 0) + 0.01), max: 1,
        onChange: (value) => commitProject((draft) => {
          const track = draft.tracks.find((item) => item.id === activeTrack?.id)
          if (!track?.instrument?.params?.sample) return
          track.instrument.params.sample.trimEnd = value
        }, 'sample-trim')
      })
      drawSlider(ctx, interactions, {
        x: waveArea.x + 368, y: layout.editor.y + layout.editor.height - 50, width: 150, label: 'Sample Gain',
        value: sample.gain || 1, min: 0, max: 2,
        onChange: (value) => commitProject((draft) => {
          const track = draft.tracks.find((item) => item.id === activeTrack?.id)
          if (!track?.instrument?.params?.sample) return
          track.instrument.params.sample.gain = value
        }, 'sample-gain')
      })
      drawSlider(ctx, interactions, {
        x: waveArea.x + 542, y: layout.editor.y + layout.editor.height - 50, width: 150, label: 'Root Note',
        value: sample.rootNote || 60, min: 36, max: 84,
        onChange: (value) => commitProject((draft) => {
          const track = draft.tracks.find((item) => item.id === activeTrack?.id)
          if (!track?.instrument?.params?.sample) return
          track.instrument.params.sample.rootNote = Math.round(value)
        }, 'sample-root')
      })
    }

    ctx.fillStyle = COLORS.panelGlass
    ctx.fillRect(layout.editor.x + 8, deviceY, layout.editor.width - 16, deviceChainH)
    ctx.strokeStyle = COLORS.stroke
    ctx.strokeRect(layout.editor.x + 8.5, deviceY + 0.5, layout.editor.width - 17, deviceChainH - 1)
    ctx.fillStyle = COLORS.text
    ctx.font = 'bold 12px sans-serif'
    ctx.fillText('Device Chain', layout.editor.x + 20, deviceY + 18)
    ctx.font = '11px sans-serif'
    ctx.fillStyle = COLORS.textMuted
    ctx.fillText('Layer instruments and effects here. Browser loads, rack shapes.', layout.editor.x + 112, deviceY + 18)

    const deviceCards = activeTrack
      ? [
          {
            id: `inst_${activeTrack.id}`,
            label: INSTRUMENTS.find((item) => item.id === activeTrack.instrument.id)?.name || activeTrack.instrument.id,
            type: 'Instrument',
            color: activeTrack.color,
            deviceType: 'instrument'
          },
          ...(activeTrack.effectChain || []).map((effect) => ({
            id: `fx_${effect.id}`,
            label: effect.name,
            type: 'Effect',
            color: effect.color || COLORS.cyan,
            effectId: effect.id,
            deviceType: 'effect'
          }))
        ]
      : []

    const chainViewportX = layout.editor.x + 52
    const chainViewportW = layout.editor.width - 104
    const deviceCardW = 164
    const deviceCardGap = 10
    const maxChainScroll = Math.max(0, deviceCards.length * (deviceCardW + deviceCardGap) - chainViewportW)
    const clampedChainScroll = clamp(deviceChainScroll, 0, maxChainScroll)
    if (clampedChainScroll !== deviceChainScroll) {
      setDeviceChainScroll(clampedChainScroll)
    }

    drawButton(ctx, interactions, {
      x: layout.editor.x + 16,
      y: deviceY + 34,
      width: 28,
      height: 56,
      label: '<',
      onClick: () => setDeviceChainScroll((value) => clamp(value - (deviceCardW + deviceCardGap), 0, maxChainScroll))
    })
    drawButton(ctx, interactions, {
      x: layout.editor.x + layout.editor.width - 44,
      y: deviceY + 34,
      width: 28,
      height: 56,
      label: '>',
      onClick: () => setDeviceChainScroll((value) => clamp(value + (deviceCardW + deviceCardGap), 0, maxChainScroll))
    })

    if (deviceCards.length === 0) {
      ctx.fillStyle = COLORS.textMuted
      ctx.fillText('Select a track to see its device chain.', layout.editor.x + 20, deviceY + 54)
    } else {
      deviceCards.forEach((device, index) => {
        const cardX = chainViewportX + index * (deviceCardW + deviceCardGap) - clampedChainScroll
        const cardY = deviceY + 30
        if (cardX + deviceCardW < chainViewportX - 4 || cardX > chainViewportX + chainViewportW + 4) return
        ctx.fillStyle = COLORS.panelAlt
        ctx.fillRect(cardX, cardY, deviceCardW, 72)
        ctx.strokeStyle = device.color
        ctx.strokeRect(cardX + 0.5, cardY + 0.5, deviceCardW - 1, 71)
        ctx.fillStyle = device.color
        ctx.fillRect(cardX + 8, cardY + 8, 8, 52)
        ctx.fillStyle = COLORS.text
        ctx.font = 'bold 12px sans-serif'
        ctx.fillText(device.label, cardX + 24, cardY + 22)
        ctx.font = '11px sans-serif'
        ctx.fillStyle = COLORS.textDim
        ctx.fillText(device.type, cardX + 24, cardY + 38)
        ctx.fillText(index === 0 ? 'Primary rack' : `Layer ${index}`, cardX + 24, cardY + 54)
        ctx.font = '10px sans-serif'
        ctx.fillText(device.deviceType === 'instrument' ? 'Macros' : 'Insert FX', cardX + 24, cardY + 67)

        interactions.push({
          x: cardX,
          y: cardY,
          width: deviceCardW,
          height: 72,
          cursor: 'pointer',
          onClick: () => setInspectorTab('sound')
        })

        if (device.deviceType === 'effect' && activeTrack) {
          drawButton(ctx, interactions, {
            x: cardX + deviceCardW - 54,
            y: cardY + 6,
            width: 18,
            height: 18,
            label: '<',
            onClick: () => commitProject((draft) => {
              const track = draft.tracks.find((item) => item.id === activeTrack.id)
              const effectIndex = track?.effectChain?.findIndex((item) => item.id === device.effectId) ?? -1
              if (!track || effectIndex <= 0) return
              const [effect] = track.effectChain.splice(effectIndex, 1)
              track.effectChain.splice(effectIndex - 1, 0, effect)
            }, 'effect-reorder')
          })
          drawButton(ctx, interactions, {
            x: cardX + deviceCardW - 32,
            y: cardY + 6,
            width: 18,
            height: 18,
            label: 'x',
            danger: true,
            onClick: () => commitProject((draft) => {
              const track = draft.tracks.find((item) => item.id === activeTrack.id)
              if (!track) return
              track.effectChain = track.effectChain.filter((item) => item.id !== device.effectId)
            }, 'effect-remove')
          })
          drawButton(ctx, interactions, {
            x: cardX + deviceCardW - 54,
            y: cardY + 28,
            width: 18,
            height: 18,
            label: '>',
            onClick: () => commitProject((draft) => {
              const track = draft.tracks.find((item) => item.id === activeTrack.id)
              const effectIndex = track?.effectChain?.findIndex((item) => item.id === device.effectId) ?? -1
              if (!track || effectIndex < 0 || effectIndex >= track.effectChain.length - 1) return
              const [effect] = track.effectChain.splice(effectIndex, 1)
              track.effectChain.splice(effectIndex + 1, 0, effect)
            }, 'effect-reorder')
          })
        }
      })
    }

    ctx.fillStyle = COLORS.text
    ctx.font = 'bold 13px sans-serif'
    ctx.fillText('Mixer / Inspector', layout.rightPanel.x + 18, layout.rightPanel.y + 24)
    ctx.font = '11px sans-serif'
    ctx.fillStyle = COLORS.textMuted
    ctx.fillText(activeTrack ? activeTrack.name : 'No track selected', layout.rightPanel.x + 18, layout.rightPanel.y + 42)

    if (activeTrack) {
      drawButton(ctx, interactions, {
        x: layout.rightPanel.x + 18, y: layout.rightPanel.y + 54, width: 48, height: 24, label: 'Snd', active: inspectorTab === 'sound',
        onClick: () => setInspectorTab('sound')
      })
      drawButton(ctx, interactions, {
        x: layout.rightPanel.x + 72, y: layout.rightPanel.y + 54, width: 48, height: 24, label: 'Clip', active: inspectorTab === 'clip',
        onClick: () => setInspectorTab('clip')
      })
      drawButton(ctx, interactions, {
        x: layout.rightPanel.x + 126, y: layout.rightPanel.y + 54, width: 48, height: 24, label: 'I/O', active: inspectorTab === 'io',
        onClick: () => setInspectorTab('io')
      })

      ctx.fillStyle = COLORS.panelAlt
      ctx.fillRect(layout.rightPanel.x + 12, layout.rightPanel.y + 88, layout.rightPanel.width - 24, 72)
      ctx.strokeStyle = COLORS.stroke
      ctx.strokeRect(layout.rightPanel.x + 12.5, layout.rightPanel.y + 88.5, layout.rightPanel.width - 25, 71)
      ctx.fillStyle = activeTrack.color
      ctx.fillRect(layout.rightPanel.x + 18, layout.rightPanel.y + 100, 8, 46)
      ctx.fillStyle = COLORS.text
      ctx.font = 'bold 13px sans-serif'
      ctx.fillText(INSTRUMENTS.find((item) => item.id === activeTrack.instrument.id)?.name || activeTrack.instrument.id, layout.rightPanel.x + 34, layout.rightPanel.y + 113)
      ctx.font = '11px sans-serif'
      ctx.fillStyle = COLORS.textDim
      ctx.fillText(`${activeTrack.clips.length} clips`, layout.rightPanel.x + 34, layout.rightPanel.y + 132)
      ctx.fillText(`${activeTrack.notes.filter((note) => note.clipId === activeClip?.id).length} notes`, layout.rightPanel.x + 34, layout.rightPanel.y + 147)

      if (inspectorTab === 'sound') {
      drawSlider(ctx, interactions, {
        x: layout.rightPanel.x + 12, y: layout.rightPanel.y + 182, width: layout.rightPanel.width - 24, label: 'Track Volume',
        value: activeTrack.volume, min: 0, max: 1,
        onChange: (value) => commitProject((draft) => {
          const track = draft.tracks.find((item) => item.id === activeTrack.id)
          if (track) track.volume = clamp(value, 0, 1)
        }, 'volume')
      })
      drawSlider(ctx, interactions, {
        x: layout.rightPanel.x + 12, y: layout.rightPanel.y + 236, width: layout.rightPanel.width - 24, label: 'Track Pan',
        value: activeTrack.pan, min: -1, max: 1, accent: COLORS.cyan,
        onChange: (value) => commitProject((draft) => {
          const track = draft.tracks.find((item) => item.id === activeTrack.id)
          if (track) track.pan = clamp(value, -1, 1)
        }, 'pan')
      })

      ctx.fillStyle = COLORS.textDim
      ctx.font = '11px sans-serif'
      ctx.fillText('Instrument', layout.rightPanel.x + 12, layout.rightPanel.y + 288)

      INSTRUMENTS.forEach((instrument, index) => {
        drawButton(ctx, interactions, {
          x: layout.rightPanel.x + 12,
          y: layout.rightPanel.y + 300 + Math.floor(index / 2) * 34,
          width: layout.rightPanel.width - 24,
          height: 26,
          label: instrument.name,
          active: activeTrack.instrument.id === instrument.id,
          onClick: () => {
            commitProject((draft) => {
              const track = draft.tracks.find((item) => item.id === activeTrack.id)
              if (!track) return
              track.instrument = defaultInstrumentState(instrument.id)
              track.color = instrument.color
            }, 'instrument-change')
            if (instrument.id === 'sampler') setEditorMode('sample')
          }
        })
      })

      const params = activeTrack.instrument.params || {}
      const paramBaseY = layout.rightPanel.y + 480
      ctx.fillStyle = COLORS.text
      ctx.font = 'bold 12px sans-serif'
      ctx.fillText('Engine Parameters', layout.rightPanel.x + 20, paramBaseY)

      const sliderWidth = layout.rightPanel.width - 24
      if (activeTrack.instrument.id === 'fm') {
        drawSlider(ctx, interactions, {
          x: layout.rightPanel.x + 12, y: paramBaseY + 28, width: sliderWidth, label: 'Mod Ratio',
          value: params.modRatio || 2, min: 0.5, max: 8,
          onChange: (value) => commitProject((draft) => {
            const track = draft.tracks.find((item) => item.id === activeTrack.id)
            if (track) track.instrument.params.modRatio = value
          }, 'param')
        })
        drawSlider(ctx, interactions, {
          x: layout.rightPanel.x + 12, y: paramBaseY + 82, width: sliderWidth, label: 'FM Index',
          value: params.index || 140, min: 0, max: 320,
          onChange: (value) => commitProject((draft) => {
            const track = draft.tracks.find((item) => item.id === activeTrack.id)
            if (track) track.instrument.params.index = value
          }, 'param')
        })
      } else if (activeTrack.instrument.id === 'wavetable') {
        ;['glass', 'brass', 'pulse'].forEach((table, index) => {
          drawButton(ctx, interactions, {
            x: layout.rightPanel.x + 12, y: paramBaseY + 24 + index * 28, width: sliderWidth, height: 24, label: table,
            active: params.table === table,
            onClick: () => commitProject((draft) => {
              const track = draft.tracks.find((item) => item.id === activeTrack.id)
              if (track) track.instrument.params.table = table
            }, 'param')
          })
        })
        drawSlider(ctx, interactions, {
          x: layout.rightPanel.x + 12, y: paramBaseY + 120, width: sliderWidth, label: 'Brightness',
          value: params.brightness || 0.72, min: 0, max: 1,
          onChange: (value) => commitProject((draft) => {
            const track = draft.tracks.find((item) => item.id === activeTrack.id)
            if (track) track.instrument.params.brightness = value
          }, 'param')
        })
        drawSlider(ctx, interactions, {
          x: layout.rightPanel.x + 12, y: paramBaseY + 174, width: sliderWidth, label: 'Motion',
          value: params.motion || 0.42, min: 0, max: 1,
          onChange: (value) => commitProject((draft) => {
            const track = draft.tracks.find((item) => item.id === activeTrack.id)
            if (track) track.instrument.params.motion = value
          }, 'param')
        })
      } else if (activeTrack.instrument.id === 'bytebeat') {
        ;['classic', 'sierpinski', 'pulse'].forEach((formula, index) => {
          drawButton(ctx, interactions, {
            x: layout.rightPanel.x + 12, y: paramBaseY + 24 + index * 28, width: sliderWidth, height: 24, label: formula,
            active: params.formula === formula,
            onClick: () => commitProject((draft) => {
              const track = draft.tracks.find((item) => item.id === activeTrack.id)
              if (track) track.instrument.params.formula = formula
            }, 'param')
          })
        })
        drawSlider(ctx, interactions, {
          x: layout.rightPanel.x + 12, y: paramBaseY + 120, width: sliderWidth, label: 'Time',
          value: params.time || 8000, min: 1000, max: 32000,
          onChange: (value) => commitProject((draft) => {
            const track = draft.tracks.find((item) => item.id === activeTrack.id)
            if (track) track.instrument.params.time = Math.round(value)
          }, 'param')
        })
        drawSlider(ctx, interactions, {
          x: layout.rightPanel.x + 12, y: paramBaseY + 174, width: sliderWidth, label: 'Frequency',
          value: params.frequency || 1.2, min: 0.2, max: 4,
          onChange: (value) => commitProject((draft) => {
            const track = draft.tracks.find((item) => item.id === activeTrack.id)
            if (track) track.instrument.params.frequency = value
          }, 'param')
        })
      } else if (activeTrack.instrument.id === 'sampler') {
        drawButton(ctx, interactions, {
          x: layout.rightPanel.x + 12, y: paramBaseY + 28, width: sliderWidth, height: 26, label: 'Load Sample',
          onClick: () => importSampleRef.current?.click?.()
        })
        drawButton(ctx, interactions, {
          x: layout.rightPanel.x + 12, y: paramBaseY + 60, width: sliderWidth, height: 26, label: 'Preset In',
          onClick: () => importPresetRef.current?.click?.()
        })
        drawButton(ctx, interactions, {
          x: layout.rightPanel.x + 12, y: paramBaseY + 92, width: sliderWidth, height: 26, label: 'Preset Out',
          onClick: exportPreset
        })
        drawSlider(ctx, interactions, {
          x: layout.rightPanel.x + 12, y: paramBaseY + 136, width: sliderWidth, label: 'Sampler Filter',
          value: params.filter || 0.8, min: 0, max: 1,
          onChange: (value) => commitProject((draft) => {
            const track = draft.tracks.find((item) => item.id === activeTrack.id)
            if (track) track.instrument.params.filter = value
          }, 'param')
        })
        drawSlider(ctx, interactions, {
          x: layout.rightPanel.x + 12, y: paramBaseY + 190, width: sliderWidth, label: 'Tune',
          value: params.tune || 0, min: -24, max: 24,
          onChange: (value) => commitProject((draft) => {
            const track = draft.tracks.find((item) => item.id === activeTrack.id)
            if (track) track.instrument.params.tune = Math.round(value)
          }, 'param')
        })
      } else {
        drawSlider(ctx, interactions, {
          x: layout.rightPanel.x + 12, y: paramBaseY + 28, width: sliderWidth, label: 'Character',
          value: params.detune || params.brightness || params.drawbar2 || params.punch || 0.5,
          min: 0, max: activeTrack.instrument.id === 'string' ? 30 : 1,
          onChange: (value) => commitProject((draft) => {
            const track = draft.tracks.find((item) => item.id === activeTrack.id)
            if (!track) return
            if (track.instrument.id === 'analog') track.instrument.params.detune = Math.round(value)
            if (track.instrument.id === 'polysynth') track.instrument.params.detune = Math.round(value * 20)
            if (track.instrument.id === 'organ') track.instrument.params.drawbar2 = value
            if (track.instrument.id === 'pluck') track.instrument.params.brightness = value
            if (track.instrument.id === 'string') track.instrument.params.detune = Math.round(value)
            if (track.instrument.id === 'drumkit') track.instrument.params.punch = value
          }, 'param')
        })
        drawSlider(ctx, interactions, {
          x: layout.rightPanel.x + 12, y: paramBaseY + 82, width: sliderWidth, label: 'Release',
          value: params.release || params.decay || 0.4, min: 0.05, max: 1.5,
          onChange: (value) => commitProject((draft) => {
            const track = draft.tracks.find((item) => item.id === activeTrack.id)
            if (!track) return
            track.instrument.params.release = value
            if (track.instrument.id === 'pluck') track.instrument.params.decay = value
          }, 'param')
        })
      }
      } else if (inspectorTab === 'clip') {
        const clipBaseY = layout.rightPanel.y + 188
        ctx.fillStyle = COLORS.text
        ctx.font = 'bold 12px sans-serif'
        ctx.fillText('Clip Actions', layout.rightPanel.x + 20, clipBaseY)
        drawButton(ctx, interactions, {
          x: layout.rightPanel.x + 20, y: clipBaseY + 18, width: 88, height: 26, label: 'Rename',
          onClick: () => activeClip && runContextAction('rename-clip', { trackId: activeTrack.id, clipId: activeClip.id, clipName: activeClip.name })
        })
        drawButton(ctx, interactions, {
          x: layout.rightPanel.x + 114, y: clipBaseY + 18, width: 88, height: 26, label: 'Duplicate',
          onClick: () => activeClip && runContextAction('duplicate-clip', { trackId: activeTrack.id, clipId: activeClip.id, clipName: activeClip.name })
        })
        drawButton(ctx, interactions, {
          x: layout.rightPanel.x + 208, y: clipBaseY + 18, width: 88, height: 26, label: 'Delete', danger: true,
          onClick: () => activeClip && runContextAction('delete-clip', { trackId: activeTrack.id, clipId: activeClip.id, clipName: activeClip.name })
        })
        drawSlider(ctx, interactions, {
          x: layout.rightPanel.x + 20, y: clipBaseY + 86, width: layout.rightPanel.width - 40, label: 'Clip Length',
          value: activeClip?.length || 1, min: 1, max: Math.max(1, project.bars - (activeClip?.bar || 0)),
          onChange: (value) => commitProject((draft) => {
            const track = draft.tracks.find((item) => item.id === activeTrack.id)
            const clip = track?.clips.find((item) => item.id === activeClip?.id)
            if (clip) clip.length = Math.round(value)
          }, 'clip-resize')
        })
        ctx.fillStyle = COLORS.textDim
        ctx.font = '11px sans-serif'
        ctx.fillText('Tip: drag clips to move, drag the right edge to resize, right click for more.', layout.rightPanel.x + 20, clipBaseY + 128)
        if (selectedNoteId) {
          drawButton(ctx, interactions, {
            x: layout.rightPanel.x + 20, y: clipBaseY + 154, width: 94, height: 26, label: 'Delete Note', danger: true,
            onClick: () => runContextAction('delete-note', { trackId: activeTrack.id, noteId: selectedNoteId })
          })
          drawButton(ctx, interactions, {
            x: layout.rightPanel.x + 120, y: clipBaseY + 154, width: 94, height: 26, label: 'Duplicate',
            onClick: () => runContextAction('duplicate-note', { trackId: activeTrack.id, noteId: selectedNoteId })
          })
        }
      } else {
        const ioBaseY = layout.rightPanel.y + 188
        ctx.fillStyle = COLORS.text
        ctx.font = 'bold 12px sans-serif'
        ctx.fillText('Project / Patch I/O', layout.rightPanel.x + 20, ioBaseY)
        drawButton(ctx, interactions, {
          x: layout.rightPanel.x + 20, y: ioBaseY + 18, width: 92, height: 26, label: 'Project In',
          onClick: () => importProjectRef.current?.click?.()
        })
        drawButton(ctx, interactions, {
          x: layout.rightPanel.x + 118, y: ioBaseY + 18, width: 92, height: 26, label: 'Project Out',
          onClick: exportProjectJson
        })
        drawButton(ctx, interactions, {
          x: layout.rightPanel.x + 216, y: ioBaseY + 18, width: 84, height: 26, label: 'MIDI In',
          onClick: () => importMidiRef.current?.click?.()
        })
        drawButton(ctx, interactions, {
          x: layout.rightPanel.x + 20, y: ioBaseY + 52, width: 92, height: 26, label: 'MIDI Out',
          onClick: exportMidi
        })
        drawButton(ctx, interactions, {
          x: layout.rightPanel.x + 118, y: ioBaseY + 52, width: 92, height: 26, label: 'Preset In',
          onClick: () => importPresetRef.current?.click?.()
        })
        drawButton(ctx, interactions, {
          x: layout.rightPanel.x + 216, y: ioBaseY + 52, width: 84, height: 26, label: 'Preset Out',
          onClick: exportPreset
        })
        if (activeTrack.instrument.id === 'sampler') {
          drawButton(ctx, interactions, {
            x: layout.rightPanel.x + 20, y: ioBaseY + 86, width: 92, height: 26, label: 'Load Sample',
            onClick: () => importSampleRef.current?.click?.()
          })
        }
        ctx.fillStyle = COLORS.textDim
        ctx.font = '11px sans-serif'
        ctx.fillText(midiStatus, layout.rightPanel.x + 20, ioBaseY + 132)
        ctx.fillText('Keyboard: Delete removes selected note/clip, Ctrl/Cmd+D duplicates, Esc closes menus.', layout.rightPanel.x + 20, ioBaseY + 154)
      }
    }

    ctx.fillStyle = COLORS.textDim
    ctx.font = '11px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText(`Beat ${loopBeat.toFixed(2)}  |  ${project.bpm} BPM  |  Bars ${project.bars}  |  Tool ${selectedTool}`, 16, layout.footer.y + 18)
    ctx.textAlign = 'right'
    ctx.fillText(`${project.tracks.length} tracks  |  ${activeTrack?.instrument?.id || 'none'}  |  Collab sync live`, canvas.width - 16, layout.footer.y + 18)

    const now = Date.now()
    Array.from(remoteCursorsRef.current.entries()).forEach(([key, cursor]) => {
      if (now - cursor.ts > 2200) {
        remoteCursorsRef.current.delete(key)
        return
      }
      ctx.strokeStyle = COLORS.cyan
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(cursor.x - 8, cursor.y)
      ctx.lineTo(cursor.x + 8, cursor.y)
      ctx.moveTo(cursor.x, cursor.y - 8)
      ctx.lineTo(cursor.x, cursor.y + 8)
      ctx.stroke()
      ctx.fillStyle = COLORS.cyan
      ctx.font = '11px sans-serif'
      ctx.fillText(cursor.username, cursor.x + 12, cursor.y - 10)
    })

    if (contextMenu) {
      const menuItems = contextMenu.kind === 'note'
        ? [
            { label: 'Delete Note', action: 'delete-note', danger: true },
            { label: 'Duplicate Note', action: 'duplicate-note' },
            { label: 'Length +1', action: 'lengthen-note' },
            { label: 'Length -1', action: 'shorten-note' }
          ]
        : [
            { label: 'Rename Clip', action: 'rename-clip' },
            { label: 'Duplicate Clip', action: 'duplicate-clip' },
            { label: 'Grow Clip', action: 'grow-clip' },
            { label: 'Shrink Clip', action: 'shrink-clip' },
            { label: 'Delete Clip', action: 'delete-clip', danger: true }
          ]
      const menuWidth = 170
      const itemHeight = 28
      const menuHeight = menuItems.length * itemHeight + 10
      const menuX = clamp(contextMenu.x, 8, canvas.width - menuWidth - 8)
      const menuY = clamp(contextMenu.y, 8, canvas.height - menuHeight - 8)
      ctx.fillStyle = '#1a1529'
      ctx.strokeStyle = COLORS.strokeStrong
      drawRoundedRect(ctx, menuX, menuY, menuWidth, menuHeight, 12)
      ctx.fill()
      ctx.stroke()
      menuItems.forEach((item, index) => {
        const itemY = menuY + 5 + index * itemHeight
        ctx.fillStyle = item.danger ? '#442434' : index % 2 === 0 ? COLORS.panelAlt : COLORS.panel
        ctx.fillRect(menuX + 4, itemY, menuWidth - 8, itemHeight - 2)
        ctx.fillStyle = item.danger ? '#ffd1d5' : COLORS.text
        ctx.font = '12px sans-serif'
        ctx.textAlign = 'left'
        ctx.fillText(item.label, menuX + 14, itemY + 17)
        interactions.push({
          x: menuX + 4,
          y: itemY,
          width: menuWidth - 8,
          height: itemHeight - 2,
          cursor: 'pointer',
          onClick: () => runContextAction(item.action, contextMenu)
        })
      })
    }
  }, [closeContextMenu, commitProject, contextMenu, currentBeat, editorMode, exportMidi, exportPreset, exportProjectJson, getLayout, inspectorTab, isPlaying, midiRecordEnabled, midiStatus, playPreviewNote, runContextAction, selectedClipId, selectedNoteId, selectedTool, selectedTrackId, sdk, surfaceSize.height, surfaceSize.width])

  useEffect(() => {
    drawSurface()
  }, [drawSurface, revision])

  const handlePointerDown = useCallback((event) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    const hit = hitTest(x, y)
    if (event.button === 0) closeContextMenu()
    if (hit?.onPointerDown) {
      hit.onPointerDown(x, y, event)
      return
    }
    if (hit?.onClick) hit.onClick(event)
  }, [closeContextMenu, hitTest])

  const handlePointerMove = useCallback((event) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    const hit = hitTest(x, y)
    canvas.style.cursor = dragRef.current?.type === 'slider' ? 'ew-resize' : hit?.cursor || 'default'

    const now = Date.now()
    if (sdk && now - cursorSyncEmitRef.current > 50) {
      sdk.emitEvent('daw:cursor', {
        userId: currentUser?.id || null,
        username: currentUser?.displayName || currentUser?.username || 'User',
        x,
        y
      }, { serverRelay: true })
      cursorSyncEmitRef.current = now
    }

    if (dragRef.current?.type === 'slider') {
      dragRef.current.apply(x)
      return
    }

    if (dragRef.current?.type === 'clip-move') {
      const layout = getLayout(surfaceSize.width, surfaceSize.height)
      const arrangementX = layout.arrangement.x + 16
      const beatWidth = 34
      const barWidth = beatWidth * BEATS_PER_BAR
      const rawBar = Math.max(0, Math.floor((x - arrangementX) / barWidth))
      const nextBar = clamp(rawBar, 0, Math.max(0, projectRef.current.bars - 1))
      if (nextBar !== dragRef.current.originBar) {
        const { trackId, clipId } = dragRef.current
        dragRef.current.originBar = nextBar
        commitProject((draft) => {
          const track = draft.tracks.find((item) => item.id === trackId)
          const clip = track?.clips.find((item) => item.id === clipId)
          if (!clip) return
          if (rawBar + clip.length > draft.bars) {
            draft.bars = rawBar + clip.length
          }
          clip.bar = clamp(rawBar, 0, Math.max(0, draft.bars - clip.length))
        }, 'clip-move')
      }
    }
    if (dragRef.current?.type === 'clip-resize') {
      const layout = getLayout(surfaceSize.width, surfaceSize.height)
      const arrangementX = layout.arrangement.x + 16
      const beatWidth = 34
      const barWidth = beatWidth * BEATS_PER_BAR
      const rawLength = Math.max(1, Math.round((x - (arrangementX + dragRef.current.clipBar * barWidth)) / barWidth))
      const nextLength = clamp(rawLength, 1, Math.max(1, projectRef.current.bars - dragRef.current.clipBar))
      if (nextLength !== dragRef.current.originLength) {
        const { trackId, clipId } = dragRef.current
        dragRef.current.originLength = nextLength
        commitProject((draft) => {
          const track = draft.tracks.find((item) => item.id === trackId)
          const clip = track?.clips.find((item) => item.id === clipId)
          if (!clip) return
          if (clip.bar + rawLength > draft.bars) {
            draft.bars = clip.bar + rawLength
          }
          clip.length = clamp(rawLength, 1, Math.max(1, draft.bars - clip.bar))
        }, 'clip-resize')
      }
    }

    if (dragRef.current?.type === 'note-move') {
      const layout = getLayout(surfaceSize.width, surfaceSize.height)
      const editorHeaderH = 30
      const editorX = layout.editor.x + 16
      const editorY = layout.editor.y + editorHeaderH + 8
      const pianoKeyW = 76
      const pianoGridX = editorX + pianoKeyW
      const activeTrack = projectRef.current.tracks.find((item) => item.id === dragRef.current.trackId)
      const activeClip = activeTrack?.clips.find((item) => item.id === dragRef.current.clipId)
      const clipStepCount = Math.max(STEP_COUNT, (activeClip?.length || 1) * STEP_COUNT)
      const pianoGridW = layout.editor.width - 28 - pianoKeyW
      const pianoStepW = pianoGridW / clipStepCount
      const pianoRowH = (layout.editor.height - editorHeaderH - 24) / PIANO_ROWS
      const rawStep = Math.max(0, Math.floor((x - pianoGridX) / pianoStepW))
      const nextStep = clamp(rawStep, 0, Math.max(STEP_COUNT - 1, clipStepCount - 1))
      const nextRow = clamp(Math.floor((y - editorY) / pianoRowH), 0, PIANO_ROWS - 1)
      if (nextStep !== dragRef.current.originStep || nextRow !== dragRef.current.originRow) {
        const { trackId, noteId } = dragRef.current
        dragRef.current.originStep = nextStep
        dragRef.current.originRow = nextRow
        commitProject((draft) => {
          const track = draft.tracks.find((item) => item.id === trackId)
          const note = track?.notes.find((item) => item.id === noteId)
          const clip = track?.clips.find((item) => item.id === dragRef.current.clipId)
          if (clip && rawStep >= clip.length * STEP_COUNT) {
            clip.length = Math.floor(rawStep / STEP_COUNT) + 1
          }
          if (note) {
            note.step = clamp(rawStep, 0, Math.max(STEP_COUNT - 1, ((clip?.length || 1) * STEP_COUNT) - 1))
            note.row = nextRow
          }
        }, 'note-move')
      }
    }
  }, [commitProject, currentUser?.displayName, currentUser?.id, currentUser?.username, getLayout, hitTest, sdk, surfaceSize.height, surfaceSize.width])

  const handlePointerUp = useCallback(() => {
    dragRef.current = null
  }, [])

  return (
    <div
      ref={rootRef}
      tabIndex={0}
      style={{
        width: '100%',
        height: '100%',
        minHeight: 760,
        background: COLORS.bg,
        overflow: 'hidden'
      }}
    >
      <input ref={importProjectRef} type="file" accept="application/json" onChange={importProject} style={{ display: 'none' }} />
      <input ref={importMidiRef} type="file" accept=".mid,.midi,audio/midi" onChange={importMidi} style={{ display: 'none' }} />
      <input ref={importPresetRef} type="file" accept="application/json" onChange={importPreset} style={{ display: 'none' }} />
      <input ref={importSampleRef} type="file" accept="audio/*,.wav,.mp3,.ogg,.flac,.m4a" onChange={importSample} style={{ display: 'none' }} />
      <canvas
        ref={canvasRef}
        onMouseDown={handlePointerDown}
        onMouseMove={handlePointerMove}
        onMouseUp={handlePointerUp}
        onMouseLeave={handlePointerUp}
        onContextMenu={(event) => {
          event.preventDefault()
          const rect = event.currentTarget.getBoundingClientRect()
          const x = event.clientX - rect.left
          const y = event.clientY - rect.top
          const hit = hitTest(x, y)
          if (hit?.onContextMenu) {
            hit.onContextMenu(event)
            return
          }
          setContextMenu(null)
        }}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          userSelect: 'none'
        }}
      />
    </div>
  )
}

export default ColabCreateDAW
