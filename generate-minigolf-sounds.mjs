/**
 * Generate 8-bit style WAV sound effects for MiniGolf.
 * Run: node generate-minigolf-sounds.mjs
 */
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

const SAMPLE_RATE = 22050
const OUT_DIR = join(import.meta.dirname, 'public', 'sounds', 'minigolf')

mkdirSync(OUT_DIR, { recursive: true })

// --- WAV encoder ---
function encodeWAV(samples, sampleRate = SAMPLE_RATE) {
  const numSamples = samples.length
  const byteRate = sampleRate * 2  // 16-bit mono
  const blockAlign = 2
  const dataSize = numSamples * 2
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  const writeStr = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
  }

  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)          // chunk size
  view.setUint16(20, 1, true)           // PCM
  view.setUint16(22, 1, true)           // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 16, true)          // bits per sample
  writeStr(36, 'data')
  view.setUint32(40, dataSize, true)

  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
  }
  return Buffer.from(buffer)
}

// --- Oscillators ---
function square(phase) { return phase % 1 < 0.5 ? 1 : -1 }
function triangle(phase) { const t = phase % 1; return t < 0.5 ? 4 * t - 1 : 3 - 4 * t }
function sawtooth(phase) { return 2 * (phase % 1) - 1 }
function sine(phase) { return Math.sin(2 * Math.PI * phase) }
function noise() { return Math.random() * 2 - 1 }

// --- Envelope ---
function envelope(t, attack, decay, sustain, release, duration) {
  if (t < attack) return t / attack
  if (t < attack + decay) return 1 - (1 - sustain) * ((t - attack) / decay)
  if (t < duration - release) return sustain
  if (t < duration) return sustain * (1 - (t - (duration - release)) / release)
  return 0
}

// --- Sound generators ---
function generatePutt() {
  const dur = 0.18
  const samples = new Float32Array(Math.floor(SAMPLE_RATE * dur))
  for (let i = 0; i < samples.length; i++) {
    const t = i / SAMPLE_RATE
    const env = envelope(t, 0.002, 0.04, 0.2, 0.1, dur)
    const freq = 220 - t * 400
    samples[i] = (square(t * freq * 0.8) * 0.3 + noise() * 0.5) * env * 0.6
  }
  return samples
}

function generateHoleIn() {
  const dur = 0.8
  const samples = new Float32Array(Math.floor(SAMPLE_RATE * dur))
  const notes = [523, 659, 784, 1047, 1319]
  for (let i = 0; i < samples.length; i++) {
    const t = i / SAMPLE_RATE
    let v = 0
    for (let n = 0; n < notes.length; n++) {
      const noteStart = n * 0.12
      const noteDur = 0.25
      if (t >= noteStart && t < noteStart + noteDur) {
        const nt = t - noteStart
        const env = envelope(nt, 0.005, 0.05, 0.6, 0.12, noteDur)
        v += square(t * notes[n]) * env * 0.22
        v += triangle(t * notes[n] * 2) * env * 0.1
      }
    }
    samples[i] = Math.max(-1, Math.min(1, v))
  }
  return samples
}

function generateWallHit() {
  const dur = 0.12
  const samples = new Float32Array(Math.floor(SAMPLE_RATE * dur))
  for (let i = 0; i < samples.length; i++) {
    const t = i / SAMPLE_RATE
    const env = envelope(t, 0.001, 0.03, 0.15, 0.06, dur)
    const freq = 180 - t * 600
    samples[i] = (square(t * Math.max(freq, 40)) * 0.35 + noise() * 0.4) * env * 0.7
  }
  return samples
}

function generateSplash() {
  const dur = 0.4
  const samples = new Float32Array(Math.floor(SAMPLE_RATE * dur))
  for (let i = 0; i < samples.length; i++) {
    const t = i / SAMPLE_RATE
    const env = envelope(t, 0.005, 0.1, 0.3, 0.2, dur)
    const freq = 300 - t * 500
    samples[i] = (noise() * 0.6 + sine(t * Math.max(freq, 50)) * 0.2) * env * 0.5
  }
  return samples
}

function generateLava() {
  const dur = 0.5
  const samples = new Float32Array(Math.floor(SAMPLE_RATE * dur))
  for (let i = 0; i < samples.length; i++) {
    const t = i / SAMPLE_RATE
    const env = envelope(t, 0.01, 0.1, 0.4, 0.3, dur)
    const freq = 120 + Math.sin(t * 20) * 30
    samples[i] = (sawtooth(t * freq) * 0.4 + noise() * 0.3) * env * 0.55
  }
  return samples
}

function generateJoin() {
  const dur = 0.3
  const samples = new Float32Array(Math.floor(SAMPLE_RATE * dur))
  const freqs = [440, 554]
  for (let i = 0; i < samples.length; i++) {
    const t = i / SAMPLE_RATE
    let v = 0
    for (let n = 0; n < freqs.length; n++) {
      const start = n * 0.1
      const nd = 0.18
      if (t >= start && t < start + nd) {
        const nt = t - start
        v += square(t * freqs[n]) * envelope(nt, 0.005, 0.04, 0.5, 0.08, nd) * 0.25
      }
    }
    samples[i] = v
  }
  return samples
}

function generateReady() {
  const dur = 0.25
  const samples = new Float32Array(Math.floor(SAMPLE_RATE * dur))
  const freqs = [660, 880]
  for (let i = 0; i < samples.length; i++) {
    const t = i / SAMPLE_RATE
    let v = 0
    for (let n = 0; n < freqs.length; n++) {
      const start = n * 0.08
      const nd = 0.14
      if (t >= start && t < start + nd) {
        const nt = t - start
        v += triangle(t * freqs[n]) * envelope(nt, 0.004, 0.03, 0.6, 0.06, nd) * 0.3
      }
    }
    samples[i] = v
  }
  return samples
}

function generateVote() {
  const dur = 0.15
  const samples = new Float32Array(Math.floor(SAMPLE_RATE * dur))
  for (let i = 0; i < samples.length; i++) {
    const t = i / SAMPLE_RATE
    const env = envelope(t, 0.003, 0.03, 0.5, 0.06, dur)
    samples[i] = triangle(t * 988) * env * 0.25
  }
  return samples
}

function generateStart() {
  const dur = 0.7
  const samples = new Float32Array(Math.floor(SAMPLE_RATE * dur))
  const notes = [392, 494, 587, 784]
  for (let i = 0; i < samples.length; i++) {
    const t = i / SAMPLE_RATE
    let v = 0
    for (let n = 0; n < notes.length; n++) {
      const start = n * 0.12
      const nd = 0.2
      if (t >= start && t < start + nd) {
        const nt = t - start
        v += square(t * notes[n]) * envelope(nt, 0.005, 0.04, 0.5, 0.1, nd) * 0.22
        v += triangle(t * notes[n] * 2) * envelope(nt, 0.005, 0.04, 0.3, 0.1, nd) * 0.1
      }
    }
    samples[i] = v
  }
  return samples
}

function generateWin() {
  const dur = 1.2
  const samples = new Float32Array(Math.floor(SAMPLE_RATE * dur))
  const notes = [523, 659, 784, 1047, 784, 1047, 1319]
  const starts = [0, 0.12, 0.24, 0.36, 0.56, 0.68, 0.84]
  for (let i = 0; i < samples.length; i++) {
    const t = i / SAMPLE_RATE
    let v = 0
    for (let n = 0; n < notes.length; n++) {
      const nd = n === notes.length - 1 ? 0.35 : 0.18
      if (t >= starts[n] && t < starts[n] + nd) {
        const nt = t - starts[n]
        const env = envelope(nt, 0.005, 0.05, 0.55, 0.1, nd)
        v += square(t * notes[n]) * env * 0.2
        v += triangle(t * notes[n] * 0.5) * env * 0.12
      }
    }
    samples[i] = Math.max(-1, Math.min(1, v))
  }
  return samples
}

function generateTransition() {
  const dur = 0.4
  const samples = new Float32Array(Math.floor(SAMPLE_RATE * dur))
  for (let i = 0; i < samples.length; i++) {
    const t = i / SAMPLE_RATE
    const env = envelope(t, 0.01, 0.08, 0.4, 0.2, dur)
    const freq = 300 + t * 600
    samples[i] = (triangle(t * freq) * 0.3 + sine(t * freq * 0.5) * 0.15) * env * 0.5
  }
  return samples
}

function generateClick() {
  const dur = 0.05
  const samples = new Float32Array(Math.floor(SAMPLE_RATE * dur))
  for (let i = 0; i < samples.length; i++) {
    const t = i / SAMPLE_RATE
    const env = envelope(t, 0.001, 0.01, 0.3, 0.02, dur)
    samples[i] = square(t * 900) * env * 0.2
  }
  return samples
}

function generateCountdown() {
  const dur = 0.08
  const samples = new Float32Array(Math.floor(SAMPLE_RATE * dur))
  for (let i = 0; i < samples.length; i++) {
    const t = i / SAMPLE_RATE
    const env = envelope(t, 0.002, 0.015, 0.4, 0.03, dur)
    samples[i] = square(t * 1200) * env * 0.25
  }
  return samples
}

function generateSand() {
  const dur = 0.15
  const samples = new Float32Array(Math.floor(SAMPLE_RATE * dur))
  for (let i = 0; i < samples.length; i++) {
    const t = i / SAMPLE_RATE
    const env = envelope(t, 0.003, 0.04, 0.25, 0.08, dur)
    samples[i] = noise() * env * 0.35
  }
  return samples
}

function generateIce() {
  const dur = 0.12
  const samples = new Float32Array(Math.floor(SAMPLE_RATE * dur))
  for (let i = 0; i < samples.length; i++) {
    const t = i / SAMPLE_RATE
    const env = envelope(t, 0.002, 0.02, 0.4, 0.06, dur)
    samples[i] = (sine(t * 2800) * 0.3 + triangle(t * 3600) * 0.2) * env * 0.4
  }
  return samples
}

function generatePowerup() {
  const dur = 0.35
  const samples = new Float32Array(Math.floor(SAMPLE_RATE * dur))
  for (let i = 0; i < samples.length; i++) {
    const t = i / SAMPLE_RATE
    const env = envelope(t, 0.005, 0.05, 0.5, 0.15, dur)
    const freq = 600 + t * 2000
    samples[i] = (triangle(t * freq) * 0.3 + square(t * freq * 0.5) * 0.15) * env * 0.45
  }
  return samples
}

function generateBounce() {
  const dur = 0.1
  const samples = new Float32Array(Math.floor(SAMPLE_RATE * dur))
  for (let i = 0; i < samples.length; i++) {
    const t = i / SAMPLE_RATE
    const env = envelope(t, 0.001, 0.02, 0.3, 0.05, dur)
    const freq = 400 + (1 - t / dur) * 300
    samples[i] = (triangle(t * freq) * 0.4 + square(t * freq * 1.5) * 0.15) * env * 0.5
  }
  return samples
}

function generateRoll() {
  const dur = 0.6
  const samples = new Float32Array(Math.floor(SAMPLE_RATE * dur))
  for (let i = 0; i < samples.length; i++) {
    const t = i / SAMPLE_RATE
    const env = envelope(t, 0.01, 0.1, 0.3, 0.3, dur)
    const wobble = Math.sin(t * 60) * 0.3
    samples[i] = (noise() * 0.15 + sine(t * (80 + wobble * 20)) * 0.2) * env * 0.35
  }
  return samples
}

// Theme music: short 8-bit loop
function generateTheme() {
  const bpm = 140
  const beatDur = 60 / bpm
  const bars = 8
  const dur = bars * 4 * beatDur
  const samples = new Float32Array(Math.floor(SAMPLE_RATE * dur))

  // Melody: simple catchy 8-bit tune
  const melody = [
    // bar 1
    [523, 0.5], [659, 0.5], [784, 0.5], [659, 0.5],
    // bar 2
    [523, 0.5], [784, 0.5], [659, 1],
    // bar 3
    [587, 0.5], [698, 0.5], [880, 0.5], [698, 0.5],
    // bar 4
    [587, 0.5], [880, 0.5], [698, 1],
    // bar 5
    [523, 0.5], [659, 0.5], [784, 1],
    // bar 6
    [880, 0.5], [784, 0.5], [659, 0.5], [523, 0.5],
    // bar 7
    [587, 0.5], [698, 0.5], [784, 1],
    // bar 8
    [1047, 1], [784, 0.5], [523, 0.5]
  ]

  // Bass line
  const bass = [
    [131, 2], [131, 2],  // C
    [147, 2], [147, 2],  // D
    [131, 2], [131, 2],  // C
    [147, 2], [131, 2],  // D, C
  ]

  let melodyTime = 0
  let bassTime = 0

  // Render melody
  for (const [freq, beats] of melody) {
    const noteDur = beats * beatDur
    const startSample = Math.floor(melodyTime * SAMPLE_RATE)
    const endSample = Math.floor((melodyTime + noteDur) * SAMPLE_RATE)
    for (let i = startSample; i < endSample && i < samples.length; i++) {
      const t = i / SAMPLE_RATE
      const nt = t - melodyTime
      const env = envelope(nt, 0.005, 0.04, 0.45, 0.08, noteDur)
      samples[i] += square(t * freq) * env * 0.18
      samples[i] += triangle(t * freq * 2) * env * 0.06
    }
    melodyTime += noteDur
  }

  // Render bass
  for (const [freq, beats] of bass) {
    const noteDur = beats * beatDur
    const startSample = Math.floor(bassTime * SAMPLE_RATE)
    const endSample = Math.floor((bassTime + noteDur) * SAMPLE_RATE)
    for (let i = startSample; i < endSample && i < samples.length; i++) {
      const t = i / SAMPLE_RATE
      const nt = t - bassTime
      const env = envelope(nt, 0.01, 0.1, 0.35, 0.15, noteDur)
      samples[i] += triangle(t * freq) * env * 0.2
    }
    bassTime += noteDur
  }

  // Drums (simple kick + hi-hat pattern)
  for (let beat = 0; beat < bars * 4; beat++) {
    const beatStart = beat * beatDur
    const startSample = Math.floor(beatStart * SAMPLE_RATE)
    const isKick = beat % 4 === 0 || beat % 4 === 2
    const isHat = beat % 2 === 1

    for (let i = 0; i < Math.floor(0.08 * SAMPLE_RATE) && startSample + i < samples.length; i++) {
      const t = i / SAMPLE_RATE
      if (isKick) {
        const kickEnv = Math.exp(-t * 40)
        const kickFreq = 150 * Math.exp(-t * 20)
        samples[startSample + i] += sine(t * kickFreq) * kickEnv * 0.25
      }
      if (isHat) {
        const hatEnv = Math.exp(-t * 60)
        samples[startSample + i] += noise() * hatEnv * 0.08
      }
    }
  }

  // Clamp
  for (let i = 0; i < samples.length; i++) {
    samples[i] = Math.max(-0.95, Math.min(0.95, samples[i]))
  }
  return samples
}

// --- Generate and save all sounds ---
const sounds = {
  'putt': generatePutt,
  'hole-in': generateHoleIn,
  'wall-hit': generateWallHit,
  'splash': generateSplash,
  'lava': generateLava,
  'join': generateJoin,
  'ready': generateReady,
  'vote': generateVote,
  'start': generateStart,
  'win': generateWin,
  'transition': generateTransition,
  'click': generateClick,
  'countdown': generateCountdown,
  'sand': generateSand,
  'ice': generateIce,
  'powerup': generatePowerup,
  'bounce': generateBounce,
  'roll': generateRoll,
  'theme': generateTheme,
}

console.log(`Generating ${Object.keys(sounds).length} 8-bit sound effects...`)

for (const [name, generator] of Object.entries(sounds)) {
  const samples = generator()
  const wav = encodeWAV(samples)
  const path = join(OUT_DIR, `${name}.wav`)
  writeFileSync(path, wav)
  console.log(`  ${name}.wav (${(wav.length / 1024).toFixed(1)} KB, ${(samples.length / SAMPLE_RATE).toFixed(2)}s)`)
}

console.log(`\nDone! Files saved to: ${OUT_DIR}`)
