/**
 * retroShooterAudio.js  –  8-Voice FM Synthesis Engine
 *
 * Full 8-operator FM synthesis engine inspired by Yamaha DX7/OPL3.
 * Voices:
 *   1. Distorted Guitar (4-op FM, high modulation index, feedback)
 *   2. Power Chord Layer (parallel 4-op, detuned)
 *   3. Bass Guitar (4-op series, sub-heavy)
 *   4. Kick Drum (2-op FM, pitch sweep)
 *   5. Snare (noise-modulated FM)
 *   6. Hi-Hat (high-freq FM noise burst)
 *   7. Screaming Lead (4-op parallel, extreme FM)
 *   8. Dark Pad / Atmosphere (slow-attack FM cluster)
 *
 * Combat track: E Phrygian/Locrian, tritones everywhere, BPM 185.
 * No happy intervals. Demons incoming.
 */

const getAudioContextCtor = () => {
  if (typeof window === 'undefined') return null
  return window.AudioContext || window.webkitAudioContext || null
}

const MIDI_TO_HZ = (note) => 440 * Math.pow(2, (note - 69) / 12)

// ─── OPL3 waveform table ──────────────────────────────────────────────────────
const buildOpl3Wave = (ctx, waveId) => {
  const N = 64
  const real = new Float32Array(N)
  const imag = new Float32Array(N)
  switch (waveId) {
    case 0: imag[1] = 1; break
    case 1:
      real[0] = 2 / Math.PI
      for (let k = 1; k < N; k += 1) {
        if (k === 1) { imag[1] = 0.5; continue }
        if (k % 2 === 0) real[k] = (2 / Math.PI) * (1 / (1 - k * k)) * (k % 4 === 0 ? 1 : -1)
      }
      break
    case 2:
      real[0] = 4 / Math.PI
      for (let k = 1; k < N / 2; k += 1) {
        real[k * 2] = (4 / Math.PI) * (1 / (1 - 4 * k * k)) * (k % 2 === 0 ? 1 : -1)
      }
      break
    case 3: imag[1] = 0.8; imag[3] = 0.2; imag[5] = 0.1; break
    case 4: imag[2] = 1; imag[4] = 0.3; break
    case 5: real[0] = 0.5; real[2] = 0.6; real[4] = 0.2; real[6] = 0.08; break
    case 6:
      for (let k = 0; k < N / 2; k += 1) { const n = 2 * k + 1; if (n < N) imag[n] = (4 / Math.PI) / n }
      break
    case 7:
      for (let k = 0; k < N / 2; k += 1) { const n = 2 * k + 1; if (n < N) imag[n] = (4 / Math.PI) / n * (k % 2 === 0 ? 1 : 0.7) }
      break
    default: imag[1] = 1
  }
  try { return ctx.createPeriodicWave(real, imag, { disableNormalization: false }) } catch { return null }
}

// ─── Core FM note builder ─────────────────────────────────────────────────────
// Builds an N-operator FM chain and connects to output
// ops = array of { waveId, freqMult, modIndex, attack, decay, sustain, release, volume }
// algorithm: 'chain' (each op modulates next), 'parallel' (all carriers to output)
const fmNote = (ctx, out, {
  freq = 440,
  duration = 0.3,
  delay = 0,
  pan = 0,
  volume = 0.15,
  ops = [],
  algorithm = 'chain',
} = {}) => {
  if (!ctx || !out || !ops.length) return
  const now = ctx.currentTime + delay
  const stopAt = now + duration + 0.12

  const panNode = pan !== 0 && ctx.createStereoPanner ? ctx.createStereoPanner() : null
  if (panNode) { panNode.pan.value = pan; panNode.connect(out) }
  const dest = panNode || out

  const nodes = ops.map((op) => {
    const osc = ctx.createOscillator()
    const env = ctx.createGain()
    const w = buildOpl3Wave(ctx, op.waveId || 0)
    if (w) { try { osc.setPeriodicWave(w) } catch { osc.type = 'sine' } } else { osc.type = 'sine' }
    osc.frequency.setValueAtTime(freq * (op.freqMult || 1), now)
    osc.connect(env)
    return { osc, env, op }
  })

  if (algorithm === 'chain') {
    // ops[0] = deepest modulator, ops[last] = carrier
    for (let i = 0; i < nodes.length - 1; i += 1) {
      const modGain = ctx.createGain()
      modGain.gain.setValueAtTime(nodes[i].op.modIndex || 60, now)
      modGain.gain.exponentialRampToValueAtTime(Math.max((nodes[i].op.modIndex || 60) * (nodes[i].op.sustain || 0.5), 0.001), now + duration)
      nodes[i].env.connect(modGain)
      modGain.connect(nodes[i + 1].osc.frequency)
    }
    // Carrier envelope
    const carrier = nodes[nodes.length - 1]
    const { attack = 0.004, decay = 0.08, sustain = 0.6, release = 0.1 } = carrier.op
    carrier.env.gain.setValueAtTime(0.0001, now)
    carrier.env.gain.linearRampToValueAtTime(volume, now + attack)
    carrier.env.gain.linearRampToValueAtTime(volume * sustain, now + attack + decay)
    carrier.env.gain.setValueAtTime(volume * sustain, now + duration - release)
    carrier.env.gain.linearRampToValueAtTime(0.0001, now + duration)
    carrier.env.connect(dest)
  } else {
    // parallel: each op is an independent carrier, all connect to dest
    nodes.forEach((node) => {
      const { attack = 0.004, decay = 0.08, sustain = 0.6, release = 0.1, vol = volume } = node.op
      node.env.gain.setValueAtTime(0.0001, now)
      node.env.gain.linearRampToValueAtTime(vol || volume, now + attack)
      node.env.gain.linearRampToValueAtTime((vol || volume) * sustain, now + attack + decay)
      node.env.gain.setValueAtTime((vol || volume) * sustain, now + duration - release)
      node.env.gain.linearRampToValueAtTime(0.0001, now + duration)
      node.env.connect(dest)
    })
  }

  nodes.forEach(({ osc }) => { osc.start(now); osc.stop(stopAt) })
}

// ─── Voice 1: Distorted Guitar ────────────────────────────────────────────────
// 4-op FM chain: noise modulator → harmonic modulator → distortion modulator → carrier
// High modulation indices create the "power chord crunch" of a distorted guitar
const guitarNote = (ctx, out, { freq = 82, duration = 0.35, delay = 0, pan = 0, volume = 0.22 } = {}) => {
  fmNote(ctx, out, {
    freq, duration, delay, pan, volume,
    algorithm: 'chain',
    ops: [
      // Op1: sub-harmonic noise modulator (creates the "pick attack" transient)
      { waveId: 7, freqMult: 0.5, modIndex: 320, attack: 0.001, decay: 0.02, sustain: 0.05, release: 0.01 },
      // Op2: harmonic distortion modulator (creates odd harmonics like a clipped waveform)
      { waveId: 6, freqMult: 2, modIndex: 180, attack: 0.001, decay: 0.04, sustain: 0.4, release: 0.05 },
      // Op3: feedback modulator (self-modulation approximation via high-index FM)
      { waveId: 7, freqMult: 1, modIndex: 95, attack: 0.002, decay: 0.06, sustain: 0.6, release: 0.08 },
      // Op4: carrier (the actual pitch)
      { waveId: 6, freqMult: 1, attack: 0.002, decay: 0.08, sustain: 0.7, release: 0.12 },
    ],
  })
}

// ─── Voice 2: Power Chord Layer ───────────────────────────────────────────────
// Two detuned guitar voices a perfect 5th apart (power chord = root + 5th)
// Plus a sub-octave for thickness
const powerChord = (ctx, out, { freq = 82, duration = 0.35, delay = 0, pan = 0, volume = 0.18 } = {}) => {
  // Root
  guitarNote(ctx, out, { freq, duration, delay, pan: pan - 0.15, volume: volume * 0.55 })
  // Perfect 5th (×1.5)
  guitarNote(ctx, out, { freq: freq * 1.498, duration, delay, pan: pan + 0.15, volume: volume * 0.45 })
  // Sub-octave (×0.5) – adds the "wall of sound" low end
  fmNote(ctx, out, {
    freq: freq * 0.5, duration, delay, pan, volume: volume * 0.35,
    algorithm: 'chain',
    ops: [
      { waveId: 6, freqMult: 1, modIndex: 200, attack: 0.001, decay: 0.03, sustain: 0.8, release: 0.05 },
      { waveId: 7, freqMult: 1, modIndex: 100, attack: 0.001, decay: 0.05, sustain: 0.75, release: 0.08 },
      { waveId: 6, freqMult: 1, attack: 0.001, decay: 0.06, sustain: 0.8, release: 0.1 },
    ],
  })
}

// ─── Voice 3: Bass Guitar ─────────────────────────────────────────────────────
// 4-op series: heavy sub-bass with pick attack transient
const bassNote = (ctx, out, { freq = 41, duration = 0.25, delay = 0, pan = -0.3, volume = 0.28 } = {}) => {
  fmNote(ctx, out, {
    freq, duration, delay, pan, volume,
    algorithm: 'chain',
    ops: [
      // Pick attack transient
      { waveId: 7, freqMult: 3, modIndex: 280, attack: 0.001, decay: 0.015, sustain: 0.02, release: 0.01 },
      // Mid harmonic
      { waveId: 6, freqMult: 2, modIndex: 140, attack: 0.001, decay: 0.03, sustain: 0.5, release: 0.04 },
      // Sub modulator
      { waveId: 7, freqMult: 1, modIndex: 70, attack: 0.001, decay: 0.04, sustain: 0.85, release: 0.06 },
      // Sub carrier
      { waveId: 6, freqMult: 1, attack: 0.001, decay: 0.05, sustain: 0.9, release: 0.08 },
    ],
  })
}

// ─── Voice 4: Kick Drum ───────────────────────────────────────────────────────
// 2-op FM with rapid pitch sweep (classic FM kick)
const kickDrum = (ctx, out, { delay = 0, volume = 0.45 } = {}) => {
  if (!ctx || !out) return
  const now = ctx.currentTime + delay
  const dur = 0.28

  const modOsc = ctx.createOscillator()
  const modEnv = ctx.createGain()
  modOsc.type = 'sine'
  modOsc.frequency.setValueAtTime(180, now)
  modOsc.frequency.exponentialRampToValueAtTime(30, now + 0.06)
  modEnv.gain.setValueAtTime(400, now)
  modEnv.gain.exponentialRampToValueAtTime(0.001, now + 0.08)
  modOsc.connect(modEnv)

  const carOsc = ctx.createOscillator()
  const carEnv = ctx.createGain()
  carOsc.type = 'sine'
  carOsc.frequency.setValueAtTime(80, now)
  carOsc.frequency.exponentialRampToValueAtTime(28, now + 0.12)
  modEnv.connect(carOsc.frequency)
  carEnv.gain.setValueAtTime(0.0001, now)
  carEnv.gain.linearRampToValueAtTime(volume, now + 0.003)
  carEnv.gain.exponentialRampToValueAtTime(0.0001, now + dur)
  carOsc.connect(carEnv)
  carEnv.connect(out)

  // Click transient (adds the "thud")
  const clickOsc = ctx.createOscillator()
  const clickEnv = ctx.createGain()
  clickOsc.type = 'square'
  clickOsc.frequency.setValueAtTime(220, now)
  clickEnv.gain.setValueAtTime(volume * 0.4, now)
  clickEnv.gain.exponentialRampToValueAtTime(0.0001, now + 0.018)
  clickOsc.connect(clickEnv)
  clickEnv.connect(out)

  modOsc.start(now); modOsc.stop(now + dur + 0.05)
  carOsc.start(now); carOsc.stop(now + dur + 0.05)
  clickOsc.start(now); clickOsc.stop(now + 0.025)
}

// ─── Voice 5: Snare Drum ──────────────────────────────────────────────────────
// FM tone + noise burst (classic FM snare)
const snareDrum = (ctx, out, { delay = 0, volume = 0.32 } = {}) => {
  if (!ctx || !out) return
  const now = ctx.currentTime + delay
  const dur = 0.18

  // Tonal body (FM)
  const modOsc = ctx.createOscillator()
  const modEnv = ctx.createGain()
  modOsc.type = 'sine'
  modOsc.frequency.setValueAtTime(220, now)
  modEnv.gain.setValueAtTime(180, now)
  modEnv.gain.exponentialRampToValueAtTime(0.001, now + 0.06)
  modOsc.connect(modEnv)

  const carOsc = ctx.createOscillator()
  const carEnv = ctx.createGain()
  carOsc.type = 'sine'
  carOsc.frequency.setValueAtTime(185, now)
  modEnv.connect(carOsc.frequency)
  carEnv.gain.setValueAtTime(0.0001, now)
  carEnv.gain.linearRampToValueAtTime(volume * 0.5, now + 0.002)
  carEnv.gain.exponentialRampToValueAtTime(0.0001, now + dur)
  carOsc.connect(carEnv)
  carEnv.connect(out)

  // Noise burst (the "snare wire" rattle)
  const bufSize = ctx.sampleRate * 0.15
  const noiseBuffer = ctx.createBuffer(1, bufSize, ctx.sampleRate)
  const data = noiseBuffer.getChannelData(0)
  for (let i = 0; i < bufSize; i += 1) data[i] = Math.random() * 2 - 1
  const noiseSource = ctx.createBufferSource()
  noiseSource.buffer = noiseBuffer
  const noiseFilter = ctx.createBiquadFilter()
  noiseFilter.type = 'bandpass'
  noiseFilter.frequency.value = 3200
  noiseFilter.Q.value = 0.8
  const noiseEnv = ctx.createGain()
  noiseEnv.gain.setValueAtTime(0.0001, now)
  noiseEnv.gain.linearRampToValueAtTime(volume * 0.7, now + 0.002)
  noiseEnv.gain.exponentialRampToValueAtTime(0.0001, now + dur * 0.8)
  noiseSource.connect(noiseFilter)
  noiseFilter.connect(noiseEnv)
  noiseEnv.connect(out)

  modOsc.start(now); modOsc.stop(now + dur + 0.05)
  carOsc.start(now); carOsc.stop(now + dur + 0.05)
  noiseSource.start(now); noiseSource.stop(now + dur)
}

// ─── Voice 6: Hi-Hat ──────────────────────────────────────────────────────────
// High-frequency FM noise burst
const hiHat = (ctx, out, { delay = 0, volume = 0.18, open = false } = {}) => {
  if (!ctx || !out) return
  const now = ctx.currentTime + delay
  const dur = open ? 0.22 : 0.055

  // Six detuned square oscillators (classic hi-hat synthesis)
  const freqs = [205.3, 369.4, 415.3, 461.6, 580.3, 812.0]
  freqs.forEach((f) => {
    const osc = ctx.createOscillator()
    const env = ctx.createGain()
    const filter = ctx.createBiquadFilter()
    filter.type = 'highpass'
    filter.frequency.value = 7000
    osc.type = 'square'
    osc.frequency.value = f
    env.gain.setValueAtTime(0.0001, now)
    env.gain.linearRampToValueAtTime(volume / freqs.length, now + 0.001)
    env.gain.exponentialRampToValueAtTime(0.0001, now + dur)
    osc.connect(filter)
    filter.connect(env)
    env.connect(out)
    osc.start(now); osc.stop(now + dur + 0.02)
  })
}

// ─── Voice 7: Screaming Lead ──────────────────────────────────────────────────
// 4-op parallel FM, extreme modulation, no vibrato – raw demonic scream
const leadNote = (ctx, out, { freq = 330, duration = 0.2, delay = 0, pan = 0.1, volume = 0.16 } = {}) => {
  fmNote(ctx, out, {
    freq, duration, delay, pan, volume,
    algorithm: 'parallel',
    ops: [
      // Voice A: heavily distorted carrier
      { waveId: 7, freqMult: 1, modIndex: 200, attack: 0.002, decay: 0.05, sustain: 0.75, release: 0.08, vol: volume * 0.45 },
      // Voice B: octave up, slightly detuned
      { waveId: 6, freqMult: 2.003, modIndex: 120, attack: 0.002, decay: 0.06, sustain: 0.65, release: 0.09, vol: volume * 0.3 },
      // Voice C: tritone layer (adds the demonic dissonance)
      { waveId: 7, freqMult: 1.414, modIndex: 90, attack: 0.003, decay: 0.07, sustain: 0.55, release: 0.1, vol: volume * 0.15 },
      // Voice D: sub-octave growl
      { waveId: 6, freqMult: 0.5, modIndex: 160, attack: 0.001, decay: 0.04, sustain: 0.8, release: 0.07, vol: volume * 0.1 },
    ],
  })
}

// ─── Voice 8: Dark Pad / Atmosphere ──────────────────────────────────────────
// Slow-attack FM cluster, dissonant intervals, tremolo
const padNote = (ctx, out, { freq = 82, duration = 2.0, delay = 0, pan = 0, volume = 0.1 } = {}) => {
  if (!ctx || !out) return
  const now = ctx.currentTime + delay
  const stopAt = now + duration + 0.2

  // Three detuned FM voices forming a dissonant cluster
  const detunes = [1.0, 1.007, 0.994]
  detunes.forEach((detune, i) => {
    const modOsc = ctx.createOscillator()
    const modEnv = ctx.createGain()
    const carOsc = ctx.createOscillator()
    const carEnv = ctx.createGain()
    const tremoloLfo = ctx.createOscillator()
    const tremoloGain = ctx.createGain()

    const w = buildOpl3Wave(ctx, 6)
    if (w) { try { modOsc.setPeriodicWave(w) } catch { modOsc.type = 'square' } } else { modOsc.type = 'square' }
    modOsc.frequency.setValueAtTime(freq * detune * 2, now)
    modEnv.gain.setValueAtTime(55, now)
    modEnv.gain.linearRampToValueAtTime(35, now + duration)
    modOsc.connect(modEnv)
    modEnv.connect(carOsc.frequency)

    const w2 = buildOpl3Wave(ctx, 7)
    if (w2) { try { carOsc.setPeriodicWave(w2) } catch { carOsc.type = 'square' } } else { carOsc.type = 'square' }
    carOsc.frequency.setValueAtTime(freq * detune, now)

    tremoloLfo.type = 'sine'
    tremoloLfo.frequency.value = 3.2 + i * 0.4
    tremoloGain.gain.value = volume * 0.08
    tremoloLfo.connect(tremoloGain)
    tremoloGain.connect(carEnv.gain)

    carEnv.gain.setValueAtTime(0.0001, now)
    carEnv.gain.linearRampToValueAtTime(volume / detunes.length, now + 0.18)
    carEnv.gain.setValueAtTime(volume / detunes.length, now + duration - 0.3)
    carEnv.gain.linearRampToValueAtTime(0.0001, now + duration)

    const panNode = ctx.createStereoPanner ? ctx.createStereoPanner() : null
    if (panNode) {
      panNode.pan.value = pan + (i - 1) * 0.25
      carOsc.connect(carEnv)
      carEnv.connect(panNode)
      panNode.connect(out)
    } else {
      carOsc.connect(carEnv)
      carEnv.connect(out)
    }

    modOsc.start(now); modOsc.stop(stopAt)
    carOsc.start(now); carOsc.stop(stopAt)
    tremoloLfo.start(now); tremoloLfo.stop(stopAt)
  })
}

// ─── Simple 2-op FM pulse (SFX) ──────────────────────────────────────────────
const fmPulse = (ctx, sfxGain, { freq = 440, duration = 0.09, waveId = 6, volume = 0.2, sweep = 0, modIndex = 60, modMult = 1, delay = 0, pan = 0 } = {}) => {
  if (!ctx || !sfxGain) return
  const now = ctx.currentTime + delay
  const modOsc = ctx.createOscillator()
  const modEnv = ctx.createGain()
  modOsc.type = 'sine'
  modOsc.frequency.setValueAtTime(freq * modMult, now)
  modEnv.gain.setValueAtTime(modIndex, now)
  modEnv.gain.exponentialRampToValueAtTime(0.001, now + duration)
  modOsc.connect(modEnv)

  const carOsc = ctx.createOscillator()
  const carEnv = ctx.createGain()
  const w = buildOpl3Wave(ctx, waveId)
  if (w) { try { carOsc.setPeriodicWave(w) } catch { carOsc.type = 'square' } } else { carOsc.type = 'square' }
  carOsc.frequency.setValueAtTime(freq, now)
  if (sweep) carOsc.frequency.linearRampToValueAtTime(freq + sweep, now + duration)
  modEnv.connect(carOsc.frequency)
  carEnv.gain.setValueAtTime(0.0001, now)
  carEnv.gain.exponentialRampToValueAtTime(Math.max(volume, 0.0002), now + 0.006)
  carEnv.gain.exponentialRampToValueAtTime(0.0001, now + duration)
  carOsc.connect(carEnv)

  if (pan !== 0 && ctx.createStereoPanner) {
    const panNode = ctx.createStereoPanner()
    panNode.pan.value = pan
    carEnv.connect(panNode)
    panNode.connect(sfxGain)
  } else {
    carEnv.connect(sfxGain)
  }

  modOsc.start(now); modOsc.stop(now + duration + 0.04)
  carOsc.start(now); carOsc.stop(now + duration + 0.04)
}

// ─── Music tracks ─────────────────────────────────────────────────────────────
// Each note: { voice, freq (Hz), delay (s), dur (s), pan, vol }
// Voices: 'guitar', 'power', 'bass', 'kick', 'snare', 'hat', 'hatOpen', 'lead', 'pad'

const TRACKS = {
  // Lobby: dark atmospheric tension – slow bass, dissonant pad, sparse hi-hats
  lobby: {
    loopSeconds: 16,
    notes: [
      // Kick pattern (4/4 at ~90 BPM, beat = 0.667s)
      { voice: 'kick',  delay: 0 },
      { voice: 'kick',  delay: 1.333 },
      { voice: 'kick',  delay: 2.667 },
      { voice: 'kick',  delay: 4.0 },
      { voice: 'kick',  delay: 5.333 },
      { voice: 'kick',  delay: 6.667 },
      { voice: 'kick',  delay: 8.0 },
      { voice: 'kick',  delay: 9.333 },
      { voice: 'kick',  delay: 10.667 },
      { voice: 'kick',  delay: 12.0 },
      { voice: 'kick',  delay: 13.333 },
      // Sparse snare (beats 2 and 4)
      { voice: 'snare', delay: 1.333 },
      { voice: 'snare', delay: 4.0 },
      { voice: 'snare', delay: 6.667 },
      { voice: 'snare', delay: 9.333 },
      { voice: 'snare', delay: 12.0 },
      // Sparse hi-hats
      { voice: 'hat',   delay: 0.667 },
      { voice: 'hat',   delay: 2.0 },
      { voice: 'hat',   delay: 3.333 },
      { voice: 'hat',   delay: 5.333 },
      { voice: 'hat',   delay: 7.333 },
      { voice: 'hat',   delay: 10.0 },
      { voice: 'hat',   delay: 12.667 },
      // Bass: E1 chromatic descent
      { voice: 'bass', freq: MIDI_TO_HZ(28), delay: 0,     dur: 0.55 }, // E1
      { voice: 'bass', freq: MIDI_TO_HZ(28), delay: 0.667, dur: 0.45 },
      { voice: 'bass', freq: MIDI_TO_HZ(27), delay: 1.333, dur: 0.55 }, // Eb1
      { voice: 'bass', freq: MIDI_TO_HZ(26), delay: 2.667, dur: 0.55 }, // D1
      { voice: 'bass', freq: MIDI_TO_HZ(25), delay: 4.0,   dur: 0.7  }, // C#1
      { voice: 'bass', freq: MIDI_TO_HZ(26), delay: 5.333, dur: 0.55 },
      { voice: 'bass', freq: MIDI_TO_HZ(28), delay: 6.667, dur: 0.55 },
      { voice: 'bass', freq: MIDI_TO_HZ(28), delay: 7.333, dur: 0.45 },
      { voice: 'bass', freq: MIDI_TO_HZ(27), delay: 8.0,   dur: 0.55 },
      { voice: 'bass', freq: MIDI_TO_HZ(25), delay: 9.333, dur: 0.7  },
      { voice: 'bass', freq: MIDI_TO_HZ(24), delay: 10.667,dur: 0.7  }, // C1
      { voice: 'bass', freq: MIDI_TO_HZ(25), delay: 12.0,  dur: 0.55 },
      { voice: 'bass', freq: MIDI_TO_HZ(26), delay: 13.333,dur: 0.55 },
      // Dark pad clusters (E Phrygian: E+F+Bb)
      { voice: 'pad', freq: MIDI_TO_HZ(40), delay: 0,    dur: 4.0 }, // E2
      { voice: 'pad', freq: MIDI_TO_HZ(41), delay: 0.1,  dur: 4.0 }, // F2 – flat-2
      { voice: 'pad', freq: MIDI_TO_HZ(46), delay: 0.2,  dur: 4.0 }, // Bb2 – tritone
      { voice: 'pad', freq: MIDI_TO_HZ(38), delay: 4.0,  dur: 4.0 }, // D2
      { voice: 'pad', freq: MIDI_TO_HZ(44), delay: 4.1,  dur: 4.0 }, // Ab2 – tritone from D
      { voice: 'pad', freq: MIDI_TO_HZ(36), delay: 8.0,  dur: 4.0 }, // C2
      { voice: 'pad', freq: MIDI_TO_HZ(42), delay: 8.1,  dur: 4.0 }, // F#2 – tritone from C
      { voice: 'pad', freq: MIDI_TO_HZ(40), delay: 12.0, dur: 4.0 },
      { voice: 'pad', freq: MIDI_TO_HZ(46), delay: 12.1, dur: 4.0 },
    ]
  },

  // Combat: DOOM-style demonic assault
  // BPM 185 → beat = 0.324s, 16th = 0.081s, 8th = 0.162s, half = 0.649s
  // E Phrygian/Locrian: E F G Ab Bb C D (tritones everywhere)
  combat: {
    loopSeconds: 13,
    notes: [
      // ── DRUMS ──────────────────────────────────────────────────────────────
      // Kick: beats 1, 1.5, 2.5, 3, 3.5, 4 (double-kick pattern)
      { voice: 'kick',    delay: 0 },
      { voice: 'kick',    delay: 0.162 },
      { voice: 'kick',    delay: 0.649 },
      { voice: 'kick',    delay: 0.973 },
      { voice: 'kick',    delay: 1.297 },
      { voice: 'kick',    delay: 1.622 },
      { voice: 'kick',    delay: 1.946 },
      { voice: 'kick',    delay: 2.27 },
      { voice: 'kick',    delay: 2.595 },
      { voice: 'kick',    delay: 2.757 },
      { voice: 'kick',    delay: 3.243 },
      { voice: 'kick',    delay: 3.568 },
      { voice: 'kick',    delay: 3.892 },
      { voice: 'kick',    delay: 4.054 },
      { voice: 'kick',    delay: 4.541 },
      { voice: 'kick',    delay: 4.865 },
      { voice: 'kick',    delay: 5.189 },
      { voice: 'kick',    delay: 5.351 },
      { voice: 'kick',    delay: 5.838 },
      { voice: 'kick',    delay: 6.162 },
      { voice: 'kick',    delay: 6.486 },
      { voice: 'kick',    delay: 6.649 },
      { voice: 'kick',    delay: 7.135 },
      { voice: 'kick',    delay: 7.459 },
      { voice: 'kick',    delay: 7.784 },
      { voice: 'kick',    delay: 7.946 },
      { voice: 'kick',    delay: 8.432 },
      { voice: 'kick',    delay: 8.757 },
      { voice: 'kick',    delay: 9.081 },
      { voice: 'kick',    delay: 9.243 },
      { voice: 'kick',    delay: 9.73 },
      { voice: 'kick',    delay: 10.054 },
      { voice: 'kick',    delay: 10.378 },
      { voice: 'kick',    delay: 10.541 },
      { voice: 'kick',    delay: 11.027 },
      { voice: 'kick',    delay: 11.351 },
      { voice: 'kick',    delay: 11.676 },
      { voice: 'kick',    delay: 11.838 },
      { voice: 'kick',    delay: 12.324 },
      { voice: 'kick',    delay: 12.649 },
      // Snare: beats 2 and 4 (every 0.649s offset by 0.649)
      { voice: 'snare',   delay: 0.649 },
      { voice: 'snare',   delay: 1.297 },
      { voice: 'snare',   delay: 1.946 },
      { voice: 'snare',   delay: 2.595 },
      { voice: 'snare',   delay: 3.243 },
      { voice: 'snare',   delay: 3.892 },
      { voice: 'snare',   delay: 4.541 },
      { voice: 'snare',   delay: 5.189 },
      { voice: 'snare',   delay: 5.838 },
      { voice: 'snare',   delay: 6.486 },
      { voice: 'snare',   delay: 7.135 },
      { voice: 'snare',   delay: 7.784 },
      { voice: 'snare',   delay: 8.432 },
      { voice: 'snare',   delay: 9.081 },
      { voice: 'snare',   delay: 9.73 },
      { voice: 'snare',   delay: 10.378 },
      { voice: 'snare',   delay: 11.027 },
      { voice: 'snare',   delay: 11.676 },
      { voice: 'snare',   delay: 12.324 },
      // Hi-hat: 16th notes throughout
      ...[...Array(80)].map((_, i) => ({ voice: i % 8 === 7 ? 'hatOpen' : 'hat', delay: i * 0.081 })),

      // ── POWER CHORDS (guitar + 5th + sub) ──────────────────────────────────
      // Riff: E5 E5 F5 E5 Bb4 E5 D5 C5 (classic metal riff pattern)
      // E2 = 82.4 Hz, F2 = 87.3, Bb1 = 58.3, D2 = 73.4, C2 = 65.4, Ab1 = 51.9
      { voice: 'power', freq: 82.4,  delay: 0,     dur: 0.14, pan: 0 },
      { voice: 'power', freq: 82.4,  delay: 0.162, dur: 0.12, pan: 0 },
      { voice: 'power', freq: 87.3,  delay: 0.324, dur: 0.14, pan: 0 }, // F – flat-2
      { voice: 'power', freq: 82.4,  delay: 0.486, dur: 0.12, pan: 0 },
      { voice: 'power', freq: 58.3,  delay: 0.649, dur: 0.22, pan: 0 }, // Bb – tritone
      { voice: 'power', freq: 82.4,  delay: 0.973, dur: 0.12, pan: 0 },
      { voice: 'power', freq: 73.4,  delay: 1.135, dur: 0.14, pan: 0 }, // D – minor 7th
      { voice: 'power', freq: 65.4,  delay: 1.297, dur: 0.22, pan: 0 }, // C – minor 6th
      { voice: 'power', freq: 82.4,  delay: 1.622, dur: 0.14, pan: 0 },
      { voice: 'power', freq: 82.4,  delay: 1.784, dur: 0.12, pan: 0 },
      { voice: 'power', freq: 87.3,  delay: 1.946, dur: 0.14, pan: 0 },
      { voice: 'power', freq: 82.4,  delay: 2.108, dur: 0.12, pan: 0 },
      { voice: 'power', freq: 58.3,  delay: 2.27,  dur: 0.22, pan: 0 },
      { voice: 'power', freq: 51.9,  delay: 2.595, dur: 0.28, pan: 0 }, // Ab – tritone from D
      { voice: 'power', freq: 82.4,  delay: 3.243, dur: 0.14, pan: 0 },
      { voice: 'power', freq: 82.4,  delay: 3.405, dur: 0.12, pan: 0 },
      { voice: 'power', freq: 87.3,  delay: 3.568, dur: 0.14, pan: 0 },
      { voice: 'power', freq: 82.4,  delay: 3.73,  dur: 0.12, pan: 0 },
      { voice: 'power', freq: 58.3,  delay: 3.892, dur: 0.22, pan: 0 },
      { voice: 'power', freq: 82.4,  delay: 4.216, dur: 0.12, pan: 0 },
      { voice: 'power', freq: 73.4,  delay: 4.378, dur: 0.14, pan: 0 },
      { voice: 'power', freq: 65.4,  delay: 4.541, dur: 0.28, pan: 0 },
      { voice: 'power', freq: 82.4,  delay: 4.865, dur: 0.14, pan: 0 },
      { voice: 'power', freq: 87.3,  delay: 5.027, dur: 0.12, pan: 0 },
      { voice: 'power', freq: 82.4,  delay: 5.189, dur: 0.14, pan: 0 },
      { voice: 'power', freq: 58.3,  delay: 5.351, dur: 0.22, pan: 0 },
      { voice: 'power', freq: 73.4,  delay: 5.676, dur: 0.14, pan: 0 },
      { voice: 'power', freq: 65.4,  delay: 5.838, dur: 0.14, pan: 0 },
      { voice: 'power', freq: 51.9,  delay: 6.0,   dur: 0.35, pan: 0 },
      { voice: 'power', freq: 82.4,  delay: 6.486, dur: 0.14, pan: 0 },
      { voice: 'power', freq: 82.4,  delay: 6.649, dur: 0.12, pan: 0 },
      { voice: 'power', freq: 87.3,  delay: 6.811, dur: 0.14, pan: 0 },
      { voice: 'power', freq: 82.4,  delay: 6.973, dur: 0.12, pan: 0 },
      { voice: 'power', freq: 58.3,  delay: 7.135, dur: 0.22, pan: 0 },
      { voice: 'power', freq: 82.4,  delay: 7.459, dur: 0.12, pan: 0 },
      { voice: 'power', freq: 73.4,  delay: 7.622, dur: 0.14, pan: 0 },
      { voice: 'power', freq: 65.4,  delay: 7.784, dur: 0.28, pan: 0 },

      // ── BASS (follows guitar root notes) ───────────────────────────────────
      { voice: 'bass', freq: 41.2,  delay: 0,     dur: 0.14 }, // E1
      { voice: 'bass', freq: 41.2,  delay: 0.162, dur: 0.12 },
      { voice: 'bass', freq: 43.65, delay: 0.324, dur: 0.14 }, // F1
      { voice: 'bass', freq: 41.2,  delay: 0.486, dur: 0.12 },
      { voice: 'bass', freq: 29.14, delay: 0.649, dur: 0.22 }, // Bb0 – tritone
      { voice: 'bass', freq: 41.2,  delay: 0.973, dur: 0.12 },
      { voice: 'bass', freq: 36.71, delay: 1.135, dur: 0.14 }, // D1
      { voice: 'bass', freq: 32.7,  delay: 1.297, dur: 0.22 }, // C1
      { voice: 'bass', freq: 41.2,  delay: 1.622, dur: 0.14 },
      { voice: 'bass', freq: 43.65, delay: 1.946, dur: 0.14 },
      { voice: 'bass', freq: 29.14, delay: 2.27,  dur: 0.22 },
      { voice: 'bass', freq: 25.96, delay: 2.595, dur: 0.28 }, // Ab0 – tritone from D
      { voice: 'bass', freq: 41.2,  delay: 3.243, dur: 0.14 },
      { voice: 'bass', freq: 43.65, delay: 3.568, dur: 0.14 },
      { voice: 'bass', freq: 29.14, delay: 3.892, dur: 0.22 },
      { voice: 'bass', freq: 41.2,  delay: 4.216, dur: 0.12 },
      { voice: 'bass', freq: 36.71, delay: 4.378, dur: 0.14 },
      { voice: 'bass', freq: 32.7,  delay: 4.541, dur: 0.28 },
      { voice: 'bass', freq: 41.2,  delay: 4.865, dur: 0.14 },
      { voice: 'bass', freq: 43.65, delay: 5.027, dur: 0.12 },
      { voice: 'bass', freq: 29.14, delay: 5.351, dur: 0.22 },
      { voice: 'bass', freq: 36.71, delay: 5.676, dur: 0.14 },
      { voice: 'bass', freq: 25.96, delay: 6.0,   dur: 0.35 },
      { voice: 'bass', freq: 41.2,  delay: 6.486, dur: 0.14 },
      { voice: 'bass', freq: 43.65, delay: 6.811, dur: 0.14 },
      { voice: 'bass', freq: 29.14, delay: 7.135, dur: 0.22 },
      { voice: 'bass', freq: 36.71, delay: 7.622, dur: 0.14 },
      { voice: 'bass', freq: 32.7,  delay: 7.784, dur: 0.28 },

      // ── SCREAMING LEAD (E Phrygian chromatic descent, tritone arps) ────────
      // Phrase 1: E5→F5→E5→D5→C5→B4→Bb4 (chromatic + tritone landing)
      { voice: 'lead', freq: MIDI_TO_HZ(76), delay: 0,     dur: 0.14 }, // E5
      { voice: 'lead', freq: MIDI_TO_HZ(77), delay: 0.162, dur: 0.12 }, // F5 – flat-2
      { voice: 'lead', freq: MIDI_TO_HZ(76), delay: 0.324, dur: 0.14 }, // E5
      { voice: 'lead', freq: MIDI_TO_HZ(74), delay: 0.486, dur: 0.12 }, // D5
      { voice: 'lead', freq: MIDI_TO_HZ(72), delay: 0.649, dur: 0.12 }, // C5
      { voice: 'lead', freq: MIDI_TO_HZ(71), delay: 0.811, dur: 0.12 }, // B4
      { voice: 'lead', freq: MIDI_TO_HZ(70), delay: 0.973, dur: 0.22 }, // Bb4 – tritone
      // Phrase 2: G5→F#5→F5→E5→Eb5
      { voice: 'lead', freq: MIDI_TO_HZ(79), delay: 1.297, dur: 0.14 }, // G5
      { voice: 'lead', freq: MIDI_TO_HZ(78), delay: 1.459, dur: 0.12 }, // F#5
      { voice: 'lead', freq: MIDI_TO_HZ(77), delay: 1.622, dur: 0.12 }, // F5
      { voice: 'lead', freq: MIDI_TO_HZ(76), delay: 1.784, dur: 0.12 }, // E5
      { voice: 'lead', freq: MIDI_TO_HZ(75), delay: 1.946, dur: 0.28 }, // Eb5
      // Phrase 3: E5→D5→C5→B4→Bb4→A4
      { voice: 'lead', freq: MIDI_TO_HZ(76), delay: 2.595, dur: 0.12 },
      { voice: 'lead', freq: MIDI_TO_HZ(74), delay: 2.757, dur: 0.12 },
      { voice: 'lead', freq: MIDI_TO_HZ(72), delay: 2.919, dur: 0.12 },
      { voice: 'lead', freq: MIDI_TO_HZ(71), delay: 3.081, dur: 0.12 },
      { voice: 'lead', freq: MIDI_TO_HZ(70), delay: 3.243, dur: 0.12 },
      { voice: 'lead', freq: MIDI_TO_HZ(69), delay: 3.405, dur: 0.28 }, // A4
      // Phrase 4: Bb4→C5→Eb5→F5→Bb5 (tritone arpeggio upward)
      { voice: 'lead', freq: MIDI_TO_HZ(70), delay: 3.892, dur: 0.12 }, // Bb4
      { voice: 'lead', freq: MIDI_TO_HZ(72), delay: 4.054, dur: 0.12 }, // C5
      { voice: 'lead', freq: MIDI_TO_HZ(75), delay: 4.216, dur: 0.12 }, // Eb5
      { voice: 'lead', freq: MIDI_TO_HZ(77), delay: 4.378, dur: 0.12 }, // F5
      { voice: 'lead', freq: MIDI_TO_HZ(82), delay: 4.541, dur: 0.35 }, // Bb5 – tritone from E
      // Phrase 5: E5→F5→G5→Ab5→G5→F5→E5
      { voice: 'lead', freq: MIDI_TO_HZ(76), delay: 5.189, dur: 0.12 },
      { voice: 'lead', freq: MIDI_TO_HZ(77), delay: 5.351, dur: 0.12 },
      { voice: 'lead', freq: MIDI_TO_HZ(79), delay: 5.514, dur: 0.12 },
      { voice: 'lead', freq: MIDI_TO_HZ(80), delay: 5.676, dur: 0.12 }, // Ab5
      { voice: 'lead', freq: MIDI_TO_HZ(79), delay: 5.838, dur: 0.12 },
      { voice: 'lead', freq: MIDI_TO_HZ(77), delay: 6.0,   dur: 0.12 },
      { voice: 'lead', freq: MIDI_TO_HZ(76), delay: 6.162, dur: 0.28 },
      // Phrase 6: Bb4→Ab4→G4→F#4→F4→E4 (chromatic descent to root)
      { voice: 'lead', freq: MIDI_TO_HZ(70), delay: 6.649, dur: 0.12 },
      { voice: 'lead', freq: MIDI_TO_HZ(68), delay: 6.811, dur: 0.12 }, // Ab4
      { voice: 'lead', freq: MIDI_TO_HZ(67), delay: 6.973, dur: 0.12 }, // G4
      { voice: 'lead', freq: MIDI_TO_HZ(66), delay: 7.135, dur: 0.12 }, // F#4
      { voice: 'lead', freq: MIDI_TO_HZ(65), delay: 7.297, dur: 0.12 }, // F4
      { voice: 'lead', freq: MIDI_TO_HZ(64), delay: 7.459, dur: 0.35 }, // E4 – root, no resolution
      // Phrase 7: fast tritone arp E4+Bb4 alternating
      { voice: 'lead', freq: MIDI_TO_HZ(64), delay: 8.108, dur: 0.08 },
      { voice: 'lead', freq: MIDI_TO_HZ(70), delay: 8.189, dur: 0.08 },
      { voice: 'lead', freq: MIDI_TO_HZ(64), delay: 8.27,  dur: 0.08 },
      { voice: 'lead', freq: MIDI_TO_HZ(70), delay: 8.351, dur: 0.08 },
      { voice: 'lead', freq: MIDI_TO_HZ(65), delay: 8.432, dur: 0.08 }, // F4
      { voice: 'lead', freq: MIDI_TO_HZ(71), delay: 8.514, dur: 0.08 }, // B4
      { voice: 'lead', freq: MIDI_TO_HZ(65), delay: 8.595, dur: 0.08 },
      { voice: 'lead', freq: MIDI_TO_HZ(71), delay: 8.676, dur: 0.08 },
      { voice: 'lead', freq: MIDI_TO_HZ(64), delay: 8.757, dur: 0.08 },
      { voice: 'lead', freq: MIDI_TO_HZ(70), delay: 8.838, dur: 0.08 },
      { voice: 'lead', freq: MIDI_TO_HZ(62), delay: 8.919, dur: 0.08 }, // D4
      { voice: 'lead', freq: MIDI_TO_HZ(68), delay: 9.0,   dur: 0.08 }, // Ab4 – tritone from D
      { voice: 'lead', freq: MIDI_TO_HZ(60), delay: 9.081, dur: 0.08 }, // C4
      { voice: 'lead', freq: MIDI_TO_HZ(66), delay: 9.162, dur: 0.08 }, // F#4 – tritone from C
      { voice: 'lead', freq: MIDI_TO_HZ(59), delay: 9.243, dur: 0.08 }, // B3
      { voice: 'lead', freq: MIDI_TO_HZ(65), delay: 9.324, dur: 0.08 }, // F4 – tritone from B
      // Phrase 8: screaming high run
      { voice: 'lead', freq: MIDI_TO_HZ(76), delay: 9.73,  dur: 0.08 },
      { voice: 'lead', freq: MIDI_TO_HZ(79), delay: 9.811, dur: 0.08 },
      { voice: 'lead', freq: MIDI_TO_HZ(82), delay: 9.892, dur: 0.08 }, // Bb5
      { voice: 'lead', freq: MIDI_TO_HZ(84), delay: 9.973, dur: 0.08 }, // C6
      { voice: 'lead', freq: MIDI_TO_HZ(82), delay: 10.054,dur: 0.08 },
      { voice: 'lead', freq: MIDI_TO_HZ(80), delay: 10.135,dur: 0.08 }, // Ab5
      { voice: 'lead', freq: MIDI_TO_HZ(79), delay: 10.216,dur: 0.08 },
      { voice: 'lead', freq: MIDI_TO_HZ(77), delay: 10.297,dur: 0.08 },
      { voice: 'lead', freq: MIDI_TO_HZ(76), delay: 10.378,dur: 0.35 },
      // Phrase 9: final descent
      { voice: 'lead', freq: MIDI_TO_HZ(75), delay: 10.865,dur: 0.12 }, // Eb5
      { voice: 'lead', freq: MIDI_TO_HZ(73), delay: 11.027,dur: 0.12 }, // Db5
      { voice: 'lead', freq: MIDI_TO_HZ(72), delay: 11.189,dur: 0.12 }, // C5
      { voice: 'lead', freq: MIDI_TO_HZ(70), delay: 11.351,dur: 0.12 }, // Bb4
      { voice: 'lead', freq: MIDI_TO_HZ(68), delay: 11.514,dur: 0.12 }, // Ab4
      { voice: 'lead', freq: MIDI_TO_HZ(67), delay: 11.676,dur: 0.12 }, // G4
      { voice: 'lead', freq: MIDI_TO_HZ(65), delay: 11.838,dur: 0.12 }, // F4
      { voice: 'lead', freq: MIDI_TO_HZ(64), delay: 12.0,  dur: 0.5  }, // E4 – root

      // ── DARK PAD (dissonant cluster swells) ────────────────────────────────
      { voice: 'pad', freq: MIDI_TO_HZ(40), delay: 0,    dur: 3.5 }, // E2
      { voice: 'pad', freq: MIDI_TO_HZ(41), delay: 0.05, dur: 3.5 }, // F2 – minor 2nd
      { voice: 'pad', freq: MIDI_TO_HZ(46), delay: 0.1,  dur: 3.5 }, // Bb2 – tritone
      { voice: 'pad', freq: MIDI_TO_HZ(38), delay: 3.5,  dur: 3.5 }, // D2
      { voice: 'pad', freq: MIDI_TO_HZ(44), delay: 3.55, dur: 3.5 }, // Ab2 – tritone from D
      { voice: 'pad', freq: MIDI_TO_HZ(36), delay: 7.0,  dur: 3.5 }, // C2
      { voice: 'pad', freq: MIDI_TO_HZ(42), delay: 7.05, dur: 3.5 }, // F#2 – tritone from C
      { voice: 'pad', freq: MIDI_TO_HZ(40), delay: 10.5, dur: 2.5 },
      { voice: 'pad', freq: MIDI_TO_HZ(46), delay: 10.55,dur: 2.5 },
    ]
  },

  // Victory: still dark but with a triumphant edge
  victory: {
    loopSeconds: 10,
    notes: [
      { voice: 'kick',  delay: 0 },
      { voice: 'kick',  delay: 0.5 },
      { voice: 'snare', delay: 1.0 },
      { voice: 'kick',  delay: 1.5 },
      { voice: 'kick',  delay: 2.0 },
      { voice: 'snare', delay: 2.5 },
      { voice: 'kick',  delay: 3.0 },
      { voice: 'kick',  delay: 3.5 },
      { voice: 'snare', delay: 4.0 },
      { voice: 'kick',  delay: 4.5 },
      { voice: 'kick',  delay: 5.0 },
      { voice: 'snare', delay: 5.5 },
      { voice: 'kick',  delay: 6.0 },
      { voice: 'kick',  delay: 6.5 },
      { voice: 'snare', delay: 7.0 },
      { voice: 'kick',  delay: 7.5 },
      { voice: 'kick',  delay: 8.0 },
      { voice: 'snare', delay: 8.5 },
      { voice: 'kick',  delay: 9.0 },
      { voice: 'kick',  delay: 9.5 },
      { voice: 'power', freq: 82.4,  delay: 0,   dur: 0.4 },
      { voice: 'power', freq: 87.3,  delay: 0.5, dur: 0.3 },
      { voice: 'power', freq: 98.0,  delay: 1.0, dur: 0.4 }, // G2
      { voice: 'power', freq: 110.0, delay: 1.5, dur: 0.6 }, // A2
      { voice: 'power', freq: 82.4,  delay: 2.5, dur: 0.4 },
      { voice: 'power', freq: 87.3,  delay: 3.0, dur: 0.3 },
      { voice: 'power', freq: 98.0,  delay: 3.5, dur: 0.4 },
      { voice: 'power', freq: 123.5, delay: 4.0, dur: 0.8 }, // B2
      { voice: 'lead', freq: MIDI_TO_HZ(76), delay: 0,   dur: 0.3 },
      { voice: 'lead', freq: MIDI_TO_HZ(79), delay: 0.4, dur: 0.3 },
      { voice: 'lead', freq: MIDI_TO_HZ(82), delay: 0.8, dur: 0.3 },
      { voice: 'lead', freq: MIDI_TO_HZ(84), delay: 1.2, dur: 0.6 },
      { voice: 'lead', freq: MIDI_TO_HZ(82), delay: 2.0, dur: 0.3 },
      { voice: 'lead', freq: MIDI_TO_HZ(79), delay: 2.4, dur: 0.3 },
      { voice: 'lead', freq: MIDI_TO_HZ(76), delay: 2.8, dur: 0.6 },
      { voice: 'bass', freq: 41.2,  delay: 0,   dur: 0.4 },
      { voice: 'bass', freq: 43.65, delay: 0.5, dur: 0.3 },
      { voice: 'bass', freq: 49.0,  delay: 1.0, dur: 0.4 },
      { voice: 'bass', freq: 55.0,  delay: 1.5, dur: 0.6 },
      { voice: 'bass', freq: 41.2,  delay: 2.5, dur: 0.4 },
      { voice: 'bass', freq: 43.65, delay: 3.0, dur: 0.3 },
      { voice: 'bass', freq: 49.0,  delay: 3.5, dur: 0.4 },
      { voice: 'bass', freq: 61.74, delay: 4.0, dur: 0.8 },
    ]
  }
}

// ─── Main audio class ─────────────────────────────────────────────────────────
export class RetroShooterAudio {
  constructor(volume = 0.14) {
    this.ctx = null
    this.master = null
    this.musicGain = null
    this.sfxGain = null
    this.volume = volume
    this.musicVolume = 0.42
    this.currentTrack = null
    this.musicTimer = null
  }

  ensure() {
    if (this.ctx && this.master) return true
    const AudioContextCtor = getAudioContextCtor()
    if (!AudioContextCtor) return false
    try {
      this.ctx = new AudioContextCtor()
      this.master = this.ctx.createGain()
      this.master.gain.value = this.volume
      this.master.connect(this.ctx.destination)
      this.sfxGain = this.ctx.createGain()
      this.sfxGain.gain.value = 1.0
      this.sfxGain.connect(this.master)
      this.musicGain = this.ctx.createGain()
      this.musicGain.gain.value = this.musicVolume
      this.musicGain.connect(this.master)
      return true
    } catch {
      this.ctx = null; this.master = null; return false
    }
  }

  _resume() {
    if (this.ctx?.state === 'suspended') void this.ctx.resume().catch(() => {})
  }

  _playNote(note) {
    if (!this.ctx || !this.musicGain) return
    const { voice, freq = 82.4, delay = 0, dur = 0.25, pan = 0, vol } = note
    const volume = vol || this.musicVolume * 0.5
    switch (voice) {
      case 'guitar': guitarNote(this.ctx, this.musicGain, { freq, duration: dur, delay, pan, volume }); break
      case 'power':  powerChord(this.ctx, this.musicGain, { freq, duration: dur, delay, pan, volume }); break
      case 'bass':   bassNote(this.ctx, this.musicGain, { freq, duration: dur, delay, pan, volume }); break
      case 'kick':   kickDrum(this.ctx, this.musicGain, { delay, volume: volume * 1.8 }); break
      case 'snare':  snareDrum(this.ctx, this.musicGain, { delay, volume: volume * 1.4 }); break
      case 'hat':    hiHat(this.ctx, this.musicGain, { delay, volume: volume * 0.9, open: false }); break
      case 'hatOpen':hiHat(this.ctx, this.musicGain, { delay, volume: volume * 0.7, open: true }); break
      case 'lead':   leadNote(this.ctx, this.musicGain, { freq, duration: dur, delay, pan, volume }); break
      case 'pad':    padNote(this.ctx, this.musicGain, { freq, duration: dur, delay, pan, volume: volume * 0.7 }); break
      default: break
    }
  }

  _playTrack(trackName) {
    if (!this.ensure() || !this.ctx || !this.musicGain) return
    this._resume()
    const track = TRACKS[trackName] || TRACKS.lobby
    track.notes.forEach((note) => this._playNote(note))
    if (this.musicTimer) clearTimeout(this.musicTimer)
    this.musicTimer = setTimeout(() => {
      if (this.currentTrack === trackName) this._playTrack(trackName)
    }, track.loopSeconds * 1000)
  }

  startMusic(trackName = 'lobby') {
    this.currentTrack = trackName
    this._playTrack(trackName)
  }

  stopMusic() {
    this.currentTrack = null
    if (this.musicTimer) { clearTimeout(this.musicTimer); this.musicTimer = null }
  }

  setMusicVolume(v) {
    this.musicVolume = Math.max(0, Math.min(1, v))
    if (this.musicGain) this.musicGain.gain.value = this.musicVolume
  }

  // ── SFX ──────────────────────────────────────────────────────────────────────
  pulse(opts = {}) {
    if (!this.ensure() || !this.ctx || !this.sfxGain) return
    this._resume()
    fmPulse(this.ctx, this.sfxGain, opts)
  }

  shoot() {
    this.pulse({ freq: 130, duration: 0.08, waveId: 6, volume: 0.26, sweep: -35, modIndex: 80, modMult: 2 })
  }

  hit() {
    this.pulse({ freq: 96, duration: 0.14, waveId: 6, volume: 0.22, sweep: -24, modIndex: 40, modMult: 1 })
  }

  pickup() {
    this.pulse({ freq: 560, duration: 0.08, waveId: 0, volume: 0.14, sweep: 90, modIndex: 30, modMult: 3, pan: 0.2 })
    this.pulse({ freq: 840, duration: 0.1, waveId: 0, volume: 0.1, sweep: 60, modIndex: 20, modMult: 2, delay: 0.06, pan: -0.2 })
  }

  ready() {
    this.pulse({ freq: 480, duration: 0.07, waveId: 0, volume: 0.12, sweep: 60, modIndex: 25, modMult: 2 })
    this.pulse({ freq: 720, duration: 0.09, waveId: 0, volume: 0.1, sweep: 40, modIndex: 20, modMult: 2, delay: 0.05 })
  }

  countdown(step = 0) {
    this.pulse({ freq: 360 + Number(step || 0) * 70, duration: 0.07, waveId: 6, volume: 0.12, sweep: 16, modIndex: 15, modMult: 1 })
  }

  respawn() {
    this.pulse({ freq: 300, duration: 0.08, waveId: 2, volume: 0.12, sweep: 60, modIndex: 40, modMult: 2 })
    this.pulse({ freq: 450, duration: 0.08, waveId: 2, volume: 0.11, sweep: 80, modIndex: 35, modMult: 2, delay: 0.07 })
    this.pulse({ freq: 600, duration: 0.1, waveId: 2, volume: 0.1, sweep: 100, modIndex: 30, modMult: 2, delay: 0.14 })
  }

  win() {
    this.pulse({ freq: 523, duration: 0.12, waveId: 0, volume: 0.16, sweep: 0, modIndex: 50, modMult: 2 })
    this.pulse({ freq: 659, duration: 0.12, waveId: 0, volume: 0.15, sweep: 0, modIndex: 45, modMult: 2, delay: 0.1 })
    this.pulse({ freq: 784, duration: 0.12, waveId: 0, volume: 0.15, sweep: 0, modIndex: 40, modMult: 2, delay: 0.2 })
    this.pulse({ freq: 1047, duration: 0.3, waveId: 0, volume: 0.14, sweep: 0, modIndex: 35, modMult: 2, delay: 0.3 })
  }

  dispose() {
    this.stopMusic()
    try { this.master?.disconnect?.() } catch {}
    if (this.ctx?.close) void this.ctx.close().catch(() => {})
    this.ctx = null; this.master = null; this.sfxGain = null; this.musicGain = null
  }
}

export const createRetroShooterAudio = () => new RetroShooterAudio()
