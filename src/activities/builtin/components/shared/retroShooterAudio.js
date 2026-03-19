/**
 * retroShooterAudio.js  –  OPL3-style FM synthesis engine
 *
 * Emulates the Yamaha OPL3 (YMF262) sound card used in DOS-era games:
 *  • 18 channels (vs OPL2's 9)
 *  • 4-operator (4-op) FM synthesis for richer timbres
 *  • Native stereo panning per channel
 *  • 8 waveforms: sine, half-sine, absolute-sine, pulse-sine,
 *    sine-even, absolute-sine-even, square, derived-square
 *  • Envelope: Attack / Decay / Sustain / Release (ADSR)
 *  • Vibrato and tremolo LFOs
 *  • Background music sequencer with multiple tracks
 *
 * The Web Audio API doesn't have native OPL3 hardware, so we build it
 * from oscillators + gain nodes + custom periodic waves.
 */

const getAudioContextCtor = () => {
  if (typeof window === 'undefined') return null
  return window.AudioContext || window.webkitAudioContext || null
}

// ─── OPL3 waveform table ──────────────────────────────────────────────────────
// Each waveform is described as a PeriodicWave built from Fourier coefficients.
// We approximate the 8 OPL3 waveforms using harmonic series.
const buildOpl3Wave = (ctx, waveId) => {
  const N = 64
  const real = new Float32Array(N)
  const imag = new Float32Array(N)

  switch (waveId) {
    case 0: // Sine (standard)
      imag[1] = 1
      break
    case 1: // Half-sine (positive half only)
      // Fourier series of half-wave rectified sine
      real[0] = 2 / Math.PI
      for (let k = 1; k < N; k += 1) {
        if (k === 1) { imag[1] = 0.5; continue }
        if (k % 2 === 0) real[k] = (2 / Math.PI) * (1 / (1 - k * k)) * (k % 4 === 0 ? 1 : -1)
      }
      break
    case 2: // Absolute sine (full-wave rectified)
      real[0] = 4 / Math.PI
      for (let k = 1; k < N / 2; k += 1) {
        real[k * 2] = (4 / Math.PI) * (1 / (1 - 4 * k * k)) * (k % 2 === 0 ? 1 : -1)
      }
      break
    case 3: // Pulse-sine (quarter-wave)
      imag[1] = 0.8
      imag[3] = 0.2
      imag[5] = 0.1
      break
    case 4: // Sine even-periods only (OPL3 wave 4)
      imag[2] = 1
      imag[4] = 0.3
      break
    case 5: // Absolute-sine even (OPL3 wave 5)
      real[0] = 0.5
      real[2] = 0.6
      real[4] = 0.2
      real[6] = 0.08
      break
    case 6: // Square
      for (let k = 0; k < N / 2; k += 1) {
        const n = 2 * k + 1
        if (n < N) imag[n] = (4 / Math.PI) / n
      }
      break
    case 7: // Derived square (OPL3 wave 7 – square with extra harmonics)
      for (let k = 0; k < N / 2; k += 1) {
        const n = 2 * k + 1
        if (n < N) imag[n] = (4 / Math.PI) / n * (k % 2 === 0 ? 1 : 0.7)
      }
      break
    default:
      imag[1] = 1
  }

  try {
    return ctx.createPeriodicWave(real, imag, { disableNormalization: false })
  } catch {
    return null
  }
}

// ─── FM operator (carrier or modulator) ──────────────────────────────────────
// An OPL3 operator = oscillator + ADSR envelope + optional vibrato LFO
class FmOperator {
  constructor(ctx, masterGain) {
    this.ctx = ctx
    this.masterGain = masterGain
    this.osc = null
    this.envGain = null
    this.panNode = null
    this.vibratoLfo = null
    this.vibratoGain = null
    this.tremoloLfo = null
    this.tremoloGain = null
  }

  // Start a note with full OPL3-style parameters
  // Returns the output gain node so it can be connected as a modulator
  start({
    freq = 440,
    waveId = 0,
    volume = 0.2,
    attack = 0.004,
    decay = 0.08,
    sustain = 0.6,
    release = 0.12,
    duration = 0.3,
    pan = 0,           // -1 (left) to +1 (right)
    freqMult = 1,      // OPL3 frequency multiplier (MULT field)
    vibrato = false,   // OPL3 vibrato flag
    tremolo = false,   // OPL3 tremolo flag
    delay = 0,
    modInput = null,   // optional gain node from a modulator operator
    wave = null,       // pre-built PeriodicWave (optional)
  } = {}) {
    if (!this.ctx) return null
    const now = this.ctx.currentTime + delay
    const actualFreq = freq * freqMult

    this.osc = this.ctx.createOscillator()
    this.envGain = this.ctx.createGain()

    // Set waveform
    if (wave) {
      try { this.osc.setPeriodicWave(wave) } catch { this.osc.type = 'sine' }
    } else {
      this.osc.type = 'sine'
    }

    this.osc.frequency.setValueAtTime(actualFreq, now)

    // Vibrato LFO (OPL3 uses ~6.1 Hz vibrato)
    if (vibrato) {
      this.vibratoLfo = this.ctx.createOscillator()
      this.vibratoGain = this.ctx.createGain()
      this.vibratoLfo.type = 'sine'
      this.vibratoLfo.frequency.value = 6.1
      this.vibratoGain.gain.value = actualFreq * 0.007  // ~0.7% pitch deviation
      this.vibratoLfo.connect(this.vibratoGain)
      this.vibratoGain.connect(this.osc.frequency)
      this.vibratoLfo.start(now)
    }

    // Tremolo LFO (OPL3 uses ~3.7 Hz tremolo)
    if (tremolo) {
      this.tremoloLfo = this.ctx.createOscillator()
      this.tremoloGain = this.ctx.createGain()
      this.tremoloLfo.type = 'sine'
      this.tremoloLfo.frequency.value = 3.7
      this.tremoloGain.gain.value = volume * 0.12
      this.tremoloLfo.connect(this.tremoloGain)
      this.tremoloGain.connect(this.envGain.gain)
      this.tremoloLfo.start(now)
    }

    // FM modulation input (modulator feeds into carrier frequency)
    if (modInput) {
      modInput.connect(this.osc.frequency)
    }

    // ADSR envelope
    this.envGain.gain.setValueAtTime(0.0001, now)
    this.envGain.gain.linearRampToValueAtTime(volume, now + attack)
    this.envGain.gain.linearRampToValueAtTime(volume * sustain, now + attack + decay)
    this.envGain.gain.setValueAtTime(volume * sustain, now + duration - release)
    this.envGain.gain.linearRampToValueAtTime(0.0001, now + duration)

    // Stereo pan
    if (pan !== 0 && this.ctx.createStereoPanner) {
      this.panNode = this.ctx.createStereoPanner()
      this.panNode.pan.value = pan
      this.osc.connect(this.envGain)
      this.envGain.connect(this.panNode)
      this.panNode.connect(this.masterGain)
    } else {
      this.osc.connect(this.envGain)
      this.envGain.connect(this.masterGain)
    }

    this.osc.start(now)
    this.osc.stop(now + duration + 0.05)

    return this.envGain  // return so caller can chain as modulator
  }

  stop() {
    try { this.osc?.stop() } catch {}
    try { this.vibratoLfo?.stop() } catch {}
    try { this.tremoloLfo?.stop() } catch {}
  }
}

// ─── 4-operator FM channel ────────────────────────────────────────────────────
// OPL3 4-op mode: two 2-op cells chained together
// Algorithm: MOD1 → CAR1 → MOD2 → CAR2 (series) or parallel variants
const fm4op = (ctx, master, {
  freq = 440,
  volume = 0.18,
  duration = 0.4,
  delay = 0,
  pan: panValue = 0,
  // Operator 1 (modulator)
  op1Wave = 0, op1Mult = 1, op1ModIndex = 80, op1Attack = 0.004, op1Decay = 0.06, op1Sustain = 0.7,
  // Operator 2 (carrier 1)
  op2Wave = 0, op2Mult = 1, op2Attack = 0.006, op2Decay = 0.1, op2Sustain = 0.6,
  // Operator 3 (modulator 2)
  op3Wave = 6, op3Mult = 2, op3ModIndex = 40, op3Attack = 0.002, op3Decay = 0.04, op3Sustain = 0.5,
  // Operator 4 (carrier 2)
  op4Wave = 0, op4Mult = 1, op4Attack = 0.008, op4Decay = 0.12, op4Sustain = 0.55,
  vibrato = false, tremolo = false,
  algorithm = 'series',  // 'series' | 'parallel' | 'fm2'
} = {}) => {
  if (!ctx || !master) return

  const now = ctx.currentTime + delay
  const waves = [0, 1, 2, 3, 4, 5, 6, 7].map(id => buildOpl3Wave(ctx, id))

  const makeOsc = (waveId, freqMult, modGain = null) => {
    const osc = ctx.createOscillator()
    const env = ctx.createGain()
    const w = waves[waveId % 8]
    if (w) { try { osc.setPeriodicWave(w) } catch { osc.type = 'sine' } } else { osc.type = 'sine' }
    osc.frequency.setValueAtTime(freq * freqMult, now)
    if (modGain) modGain.connect(osc.frequency)
    osc.connect(env)
    return { osc, env }
  }

  const makeEnv = (env, vol, attack, decay, sustain, dur) => {
    env.gain.setValueAtTime(0.0001, now)
    env.gain.linearRampToValueAtTime(vol, now + attack)
    env.gain.linearRampToValueAtTime(vol * sustain, now + attack + decay)
    env.gain.setValueAtTime(vol * sustain, now + dur - 0.05)
    env.gain.linearRampToValueAtTime(0.0001, now + dur)
  }

  const panNode = ctx.createStereoPanner ? ctx.createStereoPanner() : null
  if (panNode) { panNode.pan.value = panValue; panNode.connect(master) }
  const out = panNode || master

  if (algorithm === 'series') {
    // MOD1 → CAR1 → MOD2 → CAR2 (full 4-op chain)
    const mod1Env = ctx.createGain()
    mod1Env.gain.setValueAtTime(op1ModIndex, now)
    const { osc: mod1Osc } = makeOsc(op1Wave, op1Mult)
    mod1Osc.connect(mod1Env)

    const { osc: car1Osc, env: car1Env } = makeOsc(op2Wave, op2Mult, mod1Env)
    makeEnv(car1Env, volume * 0.5, op2Attack, op2Decay, op2Sustain, duration)

    const mod2Env = ctx.createGain()
    mod2Env.gain.setValueAtTime(op3ModIndex, now)
    const { osc: mod2Osc } = makeOsc(op3Wave, op3Mult)
    mod2Osc.connect(mod2Env)

    const { osc: car2Osc, env: car2Env } = makeOsc(op4Wave, op4Mult, mod2Env)
    makeEnv(car2Env, volume * 0.5, op4Attack, op4Decay, op4Sustain, duration)

    car1Env.connect(out)
    car2Env.connect(out)

    const stopAt = now + duration + 0.08
    ;[mod1Osc, car1Osc, mod2Osc, car2Osc].forEach(o => { o.start(now); o.stop(stopAt) })

  } else if (algorithm === 'parallel') {
    // Two independent 2-op cells mixed together (OPL3 parallel mode)
    const mod1Env = ctx.createGain()
    mod1Env.gain.setValueAtTime(op1ModIndex, now)
    const { osc: mod1Osc } = makeOsc(op1Wave, op1Mult)
    mod1Osc.connect(mod1Env)
    const { osc: car1Osc, env: car1Env } = makeOsc(op2Wave, op2Mult, mod1Env)
    makeEnv(car1Env, volume * 0.55, op2Attack, op2Decay, op2Sustain, duration)
    car1Env.connect(out)

    const mod2Env = ctx.createGain()
    mod2Env.gain.setValueAtTime(op3ModIndex, now)
    const { osc: mod3Osc } = makeOsc(op3Wave, op3Mult)
    mod3Osc.connect(mod2Env)
    const { osc: car2Osc, env: car2Env } = makeOsc(op4Wave, op4Mult * 1.5, mod2Env)
    makeEnv(car2Env, volume * 0.45, op4Attack, op4Decay, op4Sustain, duration)
    car2Env.connect(out)

    const stopAt = now + duration + 0.08
    ;[mod1Osc, car1Osc, mod3Osc, car2Osc].forEach(o => { o.start(now); o.stop(stopAt) })

  } else {
    // fm2: simple 2-op FM (OPL2 compatible)
    const modEnv = ctx.createGain()
    modEnv.gain.setValueAtTime(op1ModIndex, now)
    const { osc: modOsc } = makeOsc(op1Wave, op1Mult)
    modOsc.connect(modEnv)
    const { osc: carOsc, env: carEnv } = makeOsc(op2Wave, op2Mult, modEnv)
    makeEnv(carEnv, volume, op2Attack, op2Decay, op2Sustain, duration)
    carEnv.connect(out)
    const stopAt = now + duration + 0.08
    ;[modOsc, carOsc].forEach(o => { o.start(now); o.stop(stopAt) })
  }
}

// ─── OPL3 music sequencer ─────────────────────────────────────────────────────
// Tracks are arrays of { note, delay, duration, channel } objects.
// note = MIDI note number (60 = C4), channel = instrument preset index
//
// Instrument presets emulate classic OPL3 patches:
//  0 = Piano (2-op FM)
//  1 = Bass (4-op series)
//  2 = Lead synth (4-op parallel)
//  3 = Pad (2-op with tremolo)
//  4 = Percussion hit
//  5 = Arpeggio lead (4-op)
//  6 = Chord stab (parallel)
//  7 = Flute/whistle (2-op vibrato)

const MIDI_TO_HZ = (note) => 440 * Math.pow(2, (note - 69) / 12)

const OPL3_PRESETS = {
  piano: {
    algorithm: 'fm2',
    op1Wave: 1, op1Mult: 1, op1ModIndex: 120, op1Attack: 0.002, op1Decay: 0.08, op1Sustain: 0.4,
    op2Wave: 0, op2Mult: 1, op2Attack: 0.002, op2Decay: 0.12, op2Sustain: 0.35,
    volume: 0.14,
  },
  bass: {
    algorithm: 'series',
    op1Wave: 6, op1Mult: 1, op1ModIndex: 60, op1Attack: 0.001, op1Decay: 0.04, op1Sustain: 0.8,
    op2Wave: 0, op2Mult: 1, op2Attack: 0.001, op2Decay: 0.06, op2Sustain: 0.7,
    op3Wave: 6, op3Mult: 2, op3ModIndex: 20, op3Attack: 0.001, op3Decay: 0.03, op3Sustain: 0.6,
    op4Wave: 0, op4Mult: 1, op4Attack: 0.001, op4Decay: 0.08, op4Sustain: 0.65,
    volume: 0.18,
  },
  lead: {
    algorithm: 'parallel',
    op1Wave: 0, op1Mult: 1, op1ModIndex: 90, op1Attack: 0.006, op1Decay: 0.1, op1Sustain: 0.7,
    op2Wave: 2, op2Mult: 1, op2Attack: 0.006, op2Decay: 0.12, op2Sustain: 0.65,
    op3Wave: 4, op3Mult: 2, op3ModIndex: 45, op3Attack: 0.004, op3Decay: 0.08, op3Sustain: 0.5,
    op4Wave: 0, op4Mult: 2, op4Attack: 0.004, op4Decay: 0.1, op4Sustain: 0.45,
    volume: 0.13,
    vibrato: true,
  },
  pad: {
    algorithm: 'fm2',
    op1Wave: 0, op1Mult: 1, op1ModIndex: 30, op1Attack: 0.12, op1Decay: 0.2, op1Sustain: 0.8,
    op2Wave: 0, op2Mult: 1, op2Attack: 0.14, op2Decay: 0.22, op2Sustain: 0.75,
    volume: 0.1,
    tremolo: true,
  },
  stab: {
    algorithm: 'parallel',
    op1Wave: 6, op1Mult: 1, op1ModIndex: 70, op1Attack: 0.001, op1Decay: 0.05, op1Sustain: 0.3,
    op2Wave: 0, op2Mult: 1, op2Attack: 0.001, op2Decay: 0.06, op2Sustain: 0.25,
    op3Wave: 2, op3Mult: 2, op3ModIndex: 35, op3Attack: 0.001, op3Decay: 0.04, op3Sustain: 0.2,
    op4Wave: 0, op4Mult: 2, op4Attack: 0.001, op4Decay: 0.05, op4Sustain: 0.18,
    volume: 0.12,
  },
  flute: {
    algorithm: 'fm2',
    op1Wave: 0, op1Mult: 1, op1ModIndex: 25, op1Attack: 0.04, op1Decay: 0.06, op1Sustain: 0.85,
    op2Wave: 0, op2Mult: 1, op2Attack: 0.05, op2Decay: 0.08, op2Sustain: 0.8,
    volume: 0.1,
    vibrato: true,
  },
  arp: {
    algorithm: 'series',
    op1Wave: 2, op1Mult: 1, op1ModIndex: 100, op1Attack: 0.001, op1Decay: 0.04, op1Sustain: 0.5,
    op2Wave: 0, op2Mult: 1, op2Attack: 0.001, op2Decay: 0.05, op2Sustain: 0.45,
    op3Wave: 4, op3Mult: 3, op3ModIndex: 50, op3Attack: 0.001, op3Decay: 0.03, op3Sustain: 0.4,
    op4Wave: 0, op4Mult: 1, op4Attack: 0.001, op4Decay: 0.06, op4Sustain: 0.38,
    volume: 0.11,
  },
}

// ─── Music tracks ─────────────────────────────────────────────────────────────
// Each track is a sequence of { note (MIDI), delay (s), duration (s), preset, pan }
// Inspired by classic DOS FPS music (Doom, Quake, Duke3D era)

const TRACKS = {
  // Lobby: tense, atmospheric, slow arpeggios + pad
  lobby: {
    bpm: 100,
    loopSeconds: 16,
    notes: [
      // Bass line
      { note: 36, delay: 0,    dur: 0.45, preset: 'bass',  pan: -0.3 },
      { note: 36, delay: 0.6,  dur: 0.35, preset: 'bass',  pan: -0.3 },
      { note: 38, delay: 1.2,  dur: 0.45, preset: 'bass',  pan: -0.3 },
      { note: 36, delay: 2.4,  dur: 0.45, preset: 'bass',  pan: -0.3 },
      { note: 33, delay: 3.0,  dur: 0.45, preset: 'bass',  pan: -0.3 },
      { note: 31, delay: 3.6,  dur: 0.6,  preset: 'bass',  pan: -0.3 },
      { note: 36, delay: 4.8,  dur: 0.45, preset: 'bass',  pan: -0.3 },
      { note: 38, delay: 5.4,  dur: 0.35, preset: 'bass',  pan: -0.3 },
      { note: 40, delay: 6.0,  dur: 0.45, preset: 'bass',  pan: -0.3 },
      { note: 38, delay: 7.2,  dur: 0.45, preset: 'bass',  pan: -0.3 },
      { note: 36, delay: 7.8,  dur: 0.6,  preset: 'bass',  pan: -0.3 },
      // Pad chords
      { note: 48, delay: 0,    dur: 2.4,  preset: 'pad',   pan: 0.1 },
      { note: 52, delay: 0,    dur: 2.4,  preset: 'pad',   pan: 0.2 },
      { note: 55, delay: 0,    dur: 2.4,  preset: 'pad',   pan: -0.1 },
      { note: 48, delay: 2.4,  dur: 2.4,  preset: 'pad',   pan: 0.1 },
      { note: 50, delay: 2.4,  dur: 2.4,  preset: 'pad',   pan: 0.2 },
      { note: 53, delay: 2.4,  dur: 2.4,  preset: 'pad',   pan: -0.1 },
      { note: 45, delay: 4.8,  dur: 2.4,  preset: 'pad',   pan: 0.1 },
      { note: 48, delay: 4.8,  dur: 2.4,  preset: 'pad',   pan: 0.2 },
      { note: 52, delay: 4.8,  dur: 2.4,  preset: 'pad',   pan: -0.1 },
      { note: 43, delay: 7.2,  dur: 2.4,  preset: 'pad',   pan: 0.1 },
      { note: 47, delay: 7.2,  dur: 2.4,  preset: 'pad',   pan: 0.2 },
      { note: 50, delay: 7.2,  dur: 2.4,  preset: 'pad',   pan: -0.1 },
      // Arp lead
      { note: 60, delay: 0,    dur: 0.18, preset: 'arp',   pan: 0.4 },
      { note: 64, delay: 0.18, dur: 0.18, preset: 'arp',   pan: 0.4 },
      { note: 67, delay: 0.36, dur: 0.18, preset: 'arp',   pan: 0.4 },
      { note: 72, delay: 0.54, dur: 0.18, preset: 'arp',   pan: 0.4 },
      { note: 67, delay: 0.72, dur: 0.18, preset: 'arp',   pan: 0.4 },
      { note: 64, delay: 0.9,  dur: 0.18, preset: 'arp',   pan: 0.4 },
      { note: 62, delay: 2.4,  dur: 0.18, preset: 'arp',   pan: 0.4 },
      { note: 65, delay: 2.58, dur: 0.18, preset: 'arp',   pan: 0.4 },
      { note: 69, delay: 2.76, dur: 0.18, preset: 'arp',   pan: 0.4 },
      { note: 74, delay: 2.94, dur: 0.18, preset: 'arp',   pan: 0.4 },
      { note: 69, delay: 3.12, dur: 0.18, preset: 'arp',   pan: 0.4 },
      { note: 65, delay: 3.3,  dur: 0.18, preset: 'arp',   pan: 0.4 },
      // Flute melody
      { note: 72, delay: 9.6,  dur: 0.5,  preset: 'flute', pan: 0.2 },
      { note: 71, delay: 10.2, dur: 0.4,  preset: 'flute', pan: 0.2 },
      { note: 69, delay: 10.7, dur: 0.4,  preset: 'flute', pan: 0.2 },
      { note: 67, delay: 11.2, dur: 0.6,  preset: 'flute', pan: 0.2 },
      { note: 65, delay: 12.0, dur: 0.4,  preset: 'flute', pan: 0.2 },
      { note: 64, delay: 12.5, dur: 0.4,  preset: 'flute', pan: 0.2 },
      { note: 62, delay: 13.0, dur: 0.4,  preset: 'flute', pan: 0.2 },
      { note: 60, delay: 13.5, dur: 0.8,  preset: 'flute', pan: 0.2 },
    ]
  },

  // Combat: fast, aggressive, driving rhythm
  combat: {
    bpm: 160,
    loopSeconds: 12,
    notes: [
      // Driving bass
      { note: 33, delay: 0,    dur: 0.22, preset: 'bass',  pan: -0.4 },
      { note: 33, delay: 0.37, dur: 0.18, preset: 'bass',  pan: -0.4 },
      { note: 36, delay: 0.75, dur: 0.22, preset: 'bass',  pan: -0.4 },
      { note: 33, delay: 1.12, dur: 0.18, preset: 'bass',  pan: -0.4 },
      { note: 31, delay: 1.5,  dur: 0.22, preset: 'bass',  pan: -0.4 },
      { note: 31, delay: 1.87, dur: 0.18, preset: 'bass',  pan: -0.4 },
      { note: 33, delay: 2.25, dur: 0.22, preset: 'bass',  pan: -0.4 },
      { note: 36, delay: 2.62, dur: 0.22, preset: 'bass',  pan: -0.4 },
      { note: 38, delay: 3.0,  dur: 0.22, preset: 'bass',  pan: -0.4 },
      { note: 38, delay: 3.37, dur: 0.18, preset: 'bass',  pan: -0.4 },
      { note: 40, delay: 3.75, dur: 0.22, preset: 'bass',  pan: -0.4 },
      { note: 38, delay: 4.12, dur: 0.18, preset: 'bass',  pan: -0.4 },
      { note: 36, delay: 4.5,  dur: 0.22, preset: 'bass',  pan: -0.4 },
      { note: 33, delay: 4.87, dur: 0.22, preset: 'bass',  pan: -0.4 },
      { note: 31, delay: 5.25, dur: 0.22, preset: 'bass',  pan: -0.4 },
      { note: 29, delay: 5.62, dur: 0.35, preset: 'bass',  pan: -0.4 },
      // Chord stabs (right channel)
      { note: 57, delay: 0,    dur: 0.12, preset: 'stab',  pan: 0.5 },
      { note: 60, delay: 0,    dur: 0.12, preset: 'stab',  pan: 0.5 },
      { note: 64, delay: 0,    dur: 0.12, preset: 'stab',  pan: 0.5 },
      { note: 57, delay: 0.75, dur: 0.12, preset: 'stab',  pan: 0.5 },
      { note: 60, delay: 0.75, dur: 0.12, preset: 'stab',  pan: 0.5 },
      { note: 64, delay: 0.75, dur: 0.12, preset: 'stab',  pan: 0.5 },
      { note: 55, delay: 1.5,  dur: 0.12, preset: 'stab',  pan: 0.5 },
      { note: 59, delay: 1.5,  dur: 0.12, preset: 'stab',  pan: 0.5 },
      { note: 62, delay: 1.5,  dur: 0.12, preset: 'stab',  pan: 0.5 },
      { note: 53, delay: 2.25, dur: 0.12, preset: 'stab',  pan: 0.5 },
      { note: 57, delay: 2.25, dur: 0.12, preset: 'stab',  pan: 0.5 },
      { note: 60, delay: 2.25, dur: 0.12, preset: 'stab',  pan: 0.5 },
      // Lead melody
      { note: 69, delay: 0,    dur: 0.22, preset: 'lead',  pan: 0.1 },
      { note: 71, delay: 0.37, dur: 0.18, preset: 'lead',  pan: 0.1 },
      { note: 72, delay: 0.75, dur: 0.22, preset: 'lead',  pan: 0.1 },
      { note: 71, delay: 1.12, dur: 0.18, preset: 'lead',  pan: 0.1 },
      { note: 69, delay: 1.5,  dur: 0.22, preset: 'lead',  pan: 0.1 },
      { note: 67, delay: 1.87, dur: 0.18, preset: 'lead',  pan: 0.1 },
      { note: 65, delay: 2.25, dur: 0.22, preset: 'lead',  pan: 0.1 },
      { note: 64, delay: 2.62, dur: 0.35, preset: 'lead',  pan: 0.1 },
      { note: 67, delay: 3.0,  dur: 0.22, preset: 'lead',  pan: 0.1 },
      { note: 69, delay: 3.37, dur: 0.18, preset: 'lead',  pan: 0.1 },
      { note: 71, delay: 3.75, dur: 0.22, preset: 'lead',  pan: 0.1 },
      { note: 72, delay: 4.12, dur: 0.18, preset: 'lead',  pan: 0.1 },
      { note: 74, delay: 4.5,  dur: 0.22, preset: 'lead',  pan: 0.1 },
      { note: 72, delay: 4.87, dur: 0.18, preset: 'lead',  pan: 0.1 },
      { note: 71, delay: 5.25, dur: 0.22, preset: 'lead',  pan: 0.1 },
      { note: 69, delay: 5.62, dur: 0.45, preset: 'lead',  pan: 0.1 },
      // Fast arp (center)
      { note: 60, delay: 6.0,  dur: 0.12, preset: 'arp',   pan: 0 },
      { note: 64, delay: 6.12, dur: 0.12, preset: 'arp',   pan: 0 },
      { note: 67, delay: 6.24, dur: 0.12, preset: 'arp',   pan: 0 },
      { note: 72, delay: 6.36, dur: 0.12, preset: 'arp',   pan: 0 },
      { note: 67, delay: 6.48, dur: 0.12, preset: 'arp',   pan: 0 },
      { note: 64, delay: 6.6,  dur: 0.12, preset: 'arp',   pan: 0 },
      { note: 60, delay: 6.72, dur: 0.12, preset: 'arp',   pan: 0 },
      { note: 57, delay: 6.84, dur: 0.12, preset: 'arp',   pan: 0 },
      { note: 62, delay: 7.5,  dur: 0.12, preset: 'arp',   pan: 0 },
      { note: 65, delay: 7.62, dur: 0.12, preset: 'arp',   pan: 0 },
      { note: 69, delay: 7.74, dur: 0.12, preset: 'arp',   pan: 0 },
      { note: 74, delay: 7.86, dur: 0.12, preset: 'arp',   pan: 0 },
      { note: 69, delay: 7.98, dur: 0.12, preset: 'arp',   pan: 0 },
      { note: 65, delay: 8.1,  dur: 0.12, preset: 'arp',   pan: 0 },
      { note: 62, delay: 8.22, dur: 0.12, preset: 'arp',   pan: 0 },
      { note: 59, delay: 8.34, dur: 0.12, preset: 'arp',   pan: 0 },
    ]
  },

  // Victory: triumphant fanfare
  victory: {
    bpm: 120,
    loopSeconds: 10,
    notes: [
      { note: 60, delay: 0,    dur: 0.2,  preset: 'stab',  pan: -0.2 },
      { note: 64, delay: 0.2,  dur: 0.2,  preset: 'stab',  pan: -0.2 },
      { note: 67, delay: 0.4,  dur: 0.2,  preset: 'stab',  pan: -0.2 },
      { note: 72, delay: 0.6,  dur: 0.5,  preset: 'stab',  pan: -0.2 },
      { note: 71, delay: 1.2,  dur: 0.2,  preset: 'lead',  pan: 0.2 },
      { note: 72, delay: 1.5,  dur: 0.6,  preset: 'lead',  pan: 0.2 },
      { note: 67, delay: 2.4,  dur: 0.3,  preset: 'lead',  pan: 0.2 },
      { note: 69, delay: 2.8,  dur: 0.3,  preset: 'lead',  pan: 0.2 },
      { note: 71, delay: 3.2,  dur: 0.3,  preset: 'lead',  pan: 0.2 },
      { note: 72, delay: 3.6,  dur: 0.8,  preset: 'lead',  pan: 0.2 },
      { note: 48, delay: 0,    dur: 0.4,  preset: 'bass',  pan: -0.4 },
      { note: 52, delay: 0.5,  dur: 0.4,  preset: 'bass',  pan: -0.4 },
      { note: 55, delay: 1.0,  dur: 0.4,  preset: 'bass',  pan: -0.4 },
      { note: 60, delay: 1.5,  dur: 0.6,  preset: 'bass',  pan: -0.4 },
      { note: 55, delay: 2.4,  dur: 0.4,  preset: 'bass',  pan: -0.4 },
      { note: 57, delay: 2.9,  dur: 0.4,  preset: 'bass',  pan: -0.4 },
      { note: 59, delay: 3.4,  dur: 0.4,  preset: 'bass',  pan: -0.4 },
      { note: 60, delay: 3.9,  dur: 0.8,  preset: 'bass',  pan: -0.4 },
      { note: 76, delay: 5.0,  dur: 0.25, preset: 'arp',   pan: 0.4 },
      { note: 74, delay: 5.25, dur: 0.25, preset: 'arp',   pan: 0.4 },
      { note: 72, delay: 5.5,  dur: 0.25, preset: 'arp',   pan: 0.4 },
      { note: 71, delay: 5.75, dur: 0.25, preset: 'arp',   pan: 0.4 },
      { note: 72, delay: 6.0,  dur: 0.5,  preset: 'arp',   pan: 0.4 },
      { note: 67, delay: 6.6,  dur: 0.25, preset: 'arp',   pan: 0.4 },
      { note: 69, delay: 6.85, dur: 0.25, preset: 'arp',   pan: 0.4 },
      { note: 71, delay: 7.1,  dur: 0.25, preset: 'arp',   pan: 0.4 },
      { note: 72, delay: 7.35, dur: 0.8,  preset: 'arp',   pan: 0.4 },
    ]
  }
}

// ─── Main audio class ─────────────────────────────────────────────────────────
export class RetroShooterAudio {
  constructor(volume = 0.16) {
    this.ctx = null
    this.master = null
    this.musicGain = null
    this.sfxGain = null
    this.volume = volume
    this.musicVolume = 0.38
    this.currentTrack = null
    this.musicTimer = null
    this._waveCache = new Map()
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
      this.ctx = null
      this.master = null
      return false
    }
  }

  _resume() {
    if (this.ctx?.state === 'suspended') {
      void this.ctx.resume().catch(() => {})
    }
  }

  _getWave(waveId) {
    if (!this.ctx) return null
    if (this._waveCache.has(waveId)) return this._waveCache.get(waveId)
    const w = buildOpl3Wave(this.ctx, waveId)
    if (w) this._waveCache.set(waveId, w)
    return w
  }

  // Simple 2-op FM pulse for SFX
  pulse({ freq = 440, duration = 0.09, waveId = 6, volume = 0.2, sweep = 0, modIndex = 60, modMult = 1, delay = 0, pan = 0 } = {}) {
    if (!this.ensure() || !this.ctx || !this.sfxGain) return
    this._resume()
    const now = this.ctx.currentTime + delay

    // Modulator
    const modOsc = this.ctx.createOscillator()
    const modEnv = this.ctx.createGain()
    modOsc.type = 'sine'
    modOsc.frequency.setValueAtTime(freq * modMult, now)
    modEnv.gain.setValueAtTime(modIndex, now)
    modEnv.gain.exponentialRampToValueAtTime(0.001, now + duration)
    modOsc.connect(modEnv)

    // Carrier
    const carOsc = this.ctx.createOscillator()
    const carEnv = this.ctx.createGain()
    const w = this._getWave(waveId)
    if (w) { try { carOsc.setPeriodicWave(w) } catch { carOsc.type = 'square' } } else { carOsc.type = 'square' }
    carOsc.frequency.setValueAtTime(freq, now)
    if (sweep) carOsc.frequency.linearRampToValueAtTime(freq + sweep, now + duration)
    modEnv.connect(carOsc.frequency)

    carEnv.gain.setValueAtTime(0.0001, now)
    carEnv.gain.exponentialRampToValueAtTime(Math.max(volume, 0.0002), now + 0.006)
    carEnv.gain.exponentialRampToValueAtTime(0.0001, now + duration)
    carOsc.connect(carEnv)

    if (pan !== 0 && this.ctx.createStereoPanner) {
      const panNode = this.ctx.createStereoPanner()
      panNode.pan.value = pan
      carEnv.connect(panNode)
      panNode.connect(this.sfxGain)
    } else {
      carEnv.connect(this.sfxGain)
    }

    modOsc.start(now); modOsc.stop(now + duration + 0.04)
    carOsc.start(now); carOsc.stop(now + duration + 0.04)
  }

  // Play a music note using an OPL3 preset
  _musicNote(note, preset, delay, duration, pan = 0) {
    if (!this.ctx || !this.musicGain) return
    const freq = MIDI_TO_HZ(note)
    const p = OPL3_PRESETS[preset] || OPL3_PRESETS.piano
    fm4op(this.ctx, this.musicGain, {
      freq,
      volume: p.volume || 0.12,
      duration,
      delay,
      pan,
      algorithm: p.algorithm || 'fm2',
      op1Wave: p.op1Wave || 0,
      op1Mult: p.op1Mult || 1,
      op1ModIndex: p.op1ModIndex || 60,
      op1Attack: p.op1Attack || 0.004,
      op1Decay: p.op1Decay || 0.08,
      op1Sustain: p.op1Sustain || 0.6,
      op2Wave: p.op2Wave || 0,
      op2Mult: p.op2Mult || 1,
      op2Attack: p.op2Attack || 0.006,
      op2Decay: p.op2Decay || 0.1,
      op2Sustain: p.op2Sustain || 0.55,
      op3Wave: p.op3Wave || 6,
      op3Mult: p.op3Mult || 2,
      op3ModIndex: p.op3ModIndex || 40,
      op3Attack: p.op3Attack || 0.002,
      op3Decay: p.op3Decay || 0.04,
      op3Sustain: p.op3Sustain || 0.5,
      op4Wave: p.op4Wave || 0,
      op4Mult: p.op4Mult || 1,
      op4Attack: p.op4Attack || 0.008,
      op4Decay: p.op4Decay || 0.12,
      op4Sustain: p.op4Sustain || 0.55,
      vibrato: p.vibrato || false,
      tremolo: p.tremolo || false,
    })
  }

  _playTrack(trackName) {
    if (!this.ensure() || !this.ctx || !this.musicGain) return
    this._resume()
    const track = TRACKS[trackName] || TRACKS.lobby
    track.notes.forEach(n => {
      this._musicNote(n.note, n.preset, n.delay, n.dur, n.pan || 0)
    })
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
  shoot() {
    // OPL3-style laser: sawtooth carrier, fast FM sweep
    this.pulse({ freq: 130, duration: 0.08, waveId: 6, volume: 0.26, sweep: -35, modIndex: 80, modMult: 2, pan: 0 })
  }

  hit() {
    // Impact: square wave with downward pitch sweep
    this.pulse({ freq: 96, duration: 0.14, waveId: 6, volume: 0.22, sweep: -24, modIndex: 40, modMult: 1 })
  }

  pickup() {
    // Pickup chime: triangle + FM shimmer
    this.pulse({ freq: 560, duration: 0.08, waveId: 0, volume: 0.14, sweep: 90, modIndex: 30, modMult: 3, pan: 0.2 })
    this.pulse({ freq: 840, duration: 0.1, waveId: 0, volume: 0.1, sweep: 60, modIndex: 20, modMult: 2, delay: 0.06, pan: -0.2 })
  }

  ready() {
    // Ready beep: two-tone OPL3 chord
    this.pulse({ freq: 480, duration: 0.07, waveId: 0, volume: 0.12, sweep: 60, modIndex: 25, modMult: 2 })
    this.pulse({ freq: 720, duration: 0.09, waveId: 0, volume: 0.1, sweep: 40, modIndex: 20, modMult: 2, delay: 0.05 })
  }

  countdown(step = 0) {
    // Countdown tick: OPL3 square pulse
    this.pulse({ freq: 360 + Number(step || 0) * 70, duration: 0.07, waveId: 6, volume: 0.12, sweep: 16, modIndex: 15, modMult: 1 })
  }

  respawn() {
    // Respawn: ascending FM arpeggio
    this.pulse({ freq: 300, duration: 0.08, waveId: 2, volume: 0.12, sweep: 60, modIndex: 40, modMult: 2 })
    this.pulse({ freq: 450, duration: 0.08, waveId: 2, volume: 0.11, sweep: 80, modIndex: 35, modMult: 2, delay: 0.07 })
    this.pulse({ freq: 600, duration: 0.1, waveId: 2, volume: 0.1, sweep: 100, modIndex: 30, modMult: 2, delay: 0.14 })
  }

  win() {
    // Victory: OPL3 fanfare
    this.pulse({ freq: 523, duration: 0.12, waveId: 0, volume: 0.16, sweep: 0, modIndex: 50, modMult: 2 })
    this.pulse({ freq: 659, duration: 0.12, waveId: 0, volume: 0.15, sweep: 0, modIndex: 45, modMult: 2, delay: 0.1 })
    this.pulse({ freq: 784, duration: 0.12, waveId: 0, volume: 0.15, sweep: 0, modIndex: 40, modMult: 2, delay: 0.2 })
    this.pulse({ freq: 1047, duration: 0.3, waveId: 0, volume: 0.14, sweep: 0, modIndex: 35, modMult: 2, delay: 0.3 })
  }

  dispose() {
    this.stopMusic()
    try { this.master?.disconnect?.() } catch {}
    if (this.ctx?.close) { void this.ctx.close().catch(() => {}) }
    this.ctx = null
    this.master = null
    this.sfxGain = null
    this.musicGain = null
    this._waveCache.clear()
  }
}

export const createRetroShooterAudio = () => new RetroShooterAudio()
