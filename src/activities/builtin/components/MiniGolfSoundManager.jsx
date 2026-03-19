import { useEffect, useRef, useCallback, useState } from 'react'

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

// ─── Music tracks ─────────────────────────────────────────────────────────────
// Each track is a sequence of notes that loops. Notes are scheduled relative
// to the loop start time so they overlap naturally and create a musical phrase
// rather than a single repeating tone.
//
// Lobby: bright, bouncy, G-major feel – 16-bar phrase at ~120 bpm
// Playing: laid-back groove, C-major pentatonic – 12-bar phrase
// Summary: triumphant fanfare arpeggio – 8-bar phrase
// Finished: victory jingle with tail – 10-bar phrase
const TRACK_LIBRARY = {
  lobby: {
    loopSeconds: 16.0,
    notes: [
      // Bar 1-2: opening chord spread
      { freq: 392, delay: 0,    duration: 0.35, type: 'triangle', vol: 0.048, harmony: 494 },
      { freq: 523, delay: 0.5,  duration: 0.3,  type: 'sine',     vol: 0.042 },
      { freq: 659, delay: 1.0,  duration: 0.3,  type: 'triangle', vol: 0.044 },
      { freq: 784, delay: 1.5,  duration: 0.45, type: 'sine',     vol: 0.046, harmony: 988 },
      // Bar 3-4: descending run
      { freq: 740, delay: 2.5,  duration: 0.25, type: 'triangle', vol: 0.04 },
      { freq: 659, delay: 2.85, duration: 0.25, type: 'sine',     vol: 0.038 },
      { freq: 587, delay: 3.2,  duration: 0.25, type: 'triangle', vol: 0.038 },
      { freq: 523, delay: 3.55, duration: 0.4,  type: 'sine',     vol: 0.042 },
      // Bar 5-6: mid phrase lift
      { freq: 440, delay: 4.5,  duration: 0.3,  type: 'triangle', vol: 0.04 },
      { freq: 523, delay: 5.0,  duration: 0.3,  type: 'sine',     vol: 0.042 },
      { freq: 659, delay: 5.5,  duration: 0.3,  type: 'triangle', vol: 0.044 },
      { freq: 784, delay: 6.0,  duration: 0.5,  type: 'sine',     vol: 0.046, harmony: 988 },
      // Bar 7-8: playful skip
      { freq: 880, delay: 7.0,  duration: 0.2,  type: 'triangle', vol: 0.038 },
      { freq: 784, delay: 7.3,  duration: 0.2,  type: 'sine',     vol: 0.036 },
      { freq: 659, delay: 7.6,  duration: 0.2,  type: 'triangle', vol: 0.036 },
      { freq: 523, delay: 7.9,  duration: 0.35, type: 'sine',     vol: 0.04 },
      // Bar 9-10: bass walk
      { freq: 196, delay: 9.0,  duration: 0.4,  type: 'triangle', vol: 0.032 },
      { freq: 220, delay: 9.5,  duration: 0.4,  type: 'triangle', vol: 0.03 },
      { freq: 247, delay: 10.0, duration: 0.4,  type: 'triangle', vol: 0.03 },
      { freq: 262, delay: 10.5, duration: 0.5,  type: 'triangle', vol: 0.034 },
      // Bar 11-12: melody return
      { freq: 523, delay: 11.5, duration: 0.3,  type: 'sine',     vol: 0.042 },
      { freq: 659, delay: 12.0, duration: 0.3,  type: 'triangle', vol: 0.044 },
      { freq: 784, delay: 12.5, duration: 0.3,  type: 'sine',     vol: 0.046 },
      { freq: 1047,delay: 13.0, duration: 0.5,  type: 'sine',     vol: 0.04 },
      // Bar 13-16: resolution
      { freq: 880, delay: 14.0, duration: 0.3,  type: 'triangle', vol: 0.038 },
      { freq: 784, delay: 14.4, duration: 0.3,  type: 'sine',     vol: 0.036 },
      { freq: 659, delay: 14.8, duration: 0.3,  type: 'triangle', vol: 0.036 },
      { freq: 523, delay: 15.2, duration: 0.6,  type: 'sine',     vol: 0.042, harmony: 392 },
    ]
  },
  playing: {
    loopSeconds: 20.0,
    notes: [
      // Phrase A – calm groove (bars 1-4)
      { freq: 262, delay: 0,    duration: 0.4,  type: 'triangle', vol: 0.036 },
      { freq: 330, delay: 0.75, duration: 0.35, type: 'sine',     vol: 0.034 },
      { freq: 392, delay: 1.5,  duration: 0.35, type: 'triangle', vol: 0.036 },
      { freq: 440, delay: 2.25, duration: 0.5,  type: 'sine',     vol: 0.038, harmony: 554 },
      { freq: 392, delay: 3.25, duration: 0.3,  type: 'triangle', vol: 0.034 },
      { freq: 330, delay: 4.0,  duration: 0.3,  type: 'sine',     vol: 0.032 },
      { freq: 294, delay: 4.75, duration: 0.4,  type: 'triangle', vol: 0.034 },
      { freq: 262, delay: 5.5,  duration: 0.6,  type: 'sine',     vol: 0.036, harmony: 196 },
      // Phrase B – slight tension (bars 5-8)
      { freq: 247, delay: 7.0,  duration: 0.35, type: 'triangle', vol: 0.032 },
      { freq: 294, delay: 7.6,  duration: 0.35, type: 'sine',     vol: 0.034 },
      { freq: 370, delay: 8.2,  duration: 0.35, type: 'triangle', vol: 0.036 },
      { freq: 440, delay: 8.8,  duration: 0.5,  type: 'sine',     vol: 0.038 },
      { freq: 494, delay: 9.8,  duration: 0.3,  type: 'triangle', vol: 0.036 },
      { freq: 440, delay: 10.4, duration: 0.3,  type: 'sine',     vol: 0.034 },
      { freq: 392, delay: 11.0, duration: 0.3,  type: 'triangle', vol: 0.034 },
      { freq: 330, delay: 11.6, duration: 0.5,  type: 'sine',     vol: 0.036, harmony: 247 },
      // Phrase C – resolution (bars 9-12)
      { freq: 262, delay: 13.0, duration: 0.3,  type: 'triangle', vol: 0.034 },
      { freq: 330, delay: 13.5, duration: 0.3,  type: 'sine',     vol: 0.034 },
      { freq: 392, delay: 14.0, duration: 0.3,  type: 'triangle', vol: 0.036 },
      { freq: 523, delay: 14.5, duration: 0.4,  type: 'sine',     vol: 0.038, harmony: 659 },
      { freq: 494, delay: 15.5, duration: 0.3,  type: 'triangle', vol: 0.034 },
      { freq: 440, delay: 16.0, duration: 0.3,  type: 'sine',     vol: 0.032 },
      { freq: 392, delay: 16.5, duration: 0.3,  type: 'triangle', vol: 0.032 },
      { freq: 330, delay: 17.0, duration: 0.3,  type: 'sine',     vol: 0.034 },
      { freq: 262, delay: 17.5, duration: 0.3,  type: 'triangle', vol: 0.034 },
      { freq: 196, delay: 18.0, duration: 0.8,  type: 'sine',     vol: 0.036, harmony: 262 },
    ]
  },
  summary: {
    loopSeconds: 12.0,
    notes: [
      // Fanfare arpeggio up
      { freq: 392, delay: 0,    duration: 0.22, type: 'triangle', vol: 0.055 },
      { freq: 494, delay: 0.22, duration: 0.22, type: 'triangle', vol: 0.052 },
      { freq: 587, delay: 0.44, duration: 0.22, type: 'sine',     vol: 0.05 },
      { freq: 659, delay: 0.66, duration: 0.22, type: 'triangle', vol: 0.05 },
      { freq: 784, delay: 0.88, duration: 0.22, type: 'sine',     vol: 0.052 },
      { freq: 988, delay: 1.1,  duration: 0.35, type: 'triangle', vol: 0.054 },
      { freq: 1175,delay: 1.45, duration: 0.7,  type: 'sine',     vol: 0.05, harmony: 784 },
      // Settle
      { freq: 988, delay: 2.5,  duration: 0.3,  type: 'triangle', vol: 0.044 },
      { freq: 784, delay: 2.9,  duration: 0.3,  type: 'sine',     vol: 0.042 },
      { freq: 659, delay: 3.3,  duration: 0.4,  type: 'triangle', vol: 0.042 },
      { freq: 523, delay: 3.8,  duration: 0.6,  type: 'sine',     vol: 0.044, harmony: 392 },
      // Second phrase – gentler
      { freq: 392, delay: 5.5,  duration: 0.3,  type: 'triangle', vol: 0.04 },
      { freq: 494, delay: 6.0,  duration: 0.3,  type: 'sine',     vol: 0.038 },
      { freq: 587, delay: 6.5,  duration: 0.3,  type: 'triangle', vol: 0.038 },
      { freq: 659, delay: 7.0,  duration: 0.3,  type: 'sine',     vol: 0.04 },
      { freq: 784, delay: 7.5,  duration: 0.5,  type: 'triangle', vol: 0.042, harmony: 523 },
      // Tail
      { freq: 659, delay: 9.0,  duration: 0.3,  type: 'sine',     vol: 0.036 },
      { freq: 523, delay: 9.5,  duration: 0.3,  type: 'triangle', vol: 0.034 },
      { freq: 392, delay: 10.0, duration: 0.3,  type: 'sine',     vol: 0.034 },
      { freq: 330, delay: 10.5, duration: 0.6,  type: 'triangle', vol: 0.036, harmony: 247 },
    ]
  },
  finished: {
    loopSeconds: 14.0,
    notes: [
      // Victory fanfare
      { freq: 523, delay: 0,    duration: 0.18, type: 'sine',     vol: 0.06 },
      { freq: 659, delay: 0.18, duration: 0.18, type: 'sine',     vol: 0.058 },
      { freq: 784, delay: 0.36, duration: 0.18, type: 'triangle', vol: 0.056 },
      { freq: 1047,delay: 0.54, duration: 0.55, type: 'sine',     vol: 0.06, harmony: 784 },
      { freq: 988, delay: 1.2,  duration: 0.18, type: 'triangle', vol: 0.05 },
      { freq: 1047,delay: 1.5,  duration: 0.7,  type: 'sine',     vol: 0.055, harmony: 659 },
      // Celebration run
      { freq: 784, delay: 2.5,  duration: 0.2,  type: 'triangle', vol: 0.046 },
      { freq: 880, delay: 2.8,  duration: 0.2,  type: 'sine',     vol: 0.044 },
      { freq: 988, delay: 3.1,  duration: 0.2,  type: 'triangle', vol: 0.044 },
      { freq: 1047,delay: 3.4,  duration: 0.4,  type: 'sine',     vol: 0.048, harmony: 784 },
      // Gentle middle section
      { freq: 659, delay: 5.0,  duration: 0.35, type: 'triangle', vol: 0.04 },
      { freq: 784, delay: 5.5,  duration: 0.35, type: 'sine',     vol: 0.042 },
      { freq: 880, delay: 6.0,  duration: 0.35, type: 'triangle', vol: 0.042 },
      { freq: 988, delay: 6.5,  duration: 0.5,  type: 'sine',     vol: 0.044, harmony: 659 },
      { freq: 880, delay: 7.5,  duration: 0.3,  type: 'triangle', vol: 0.038 },
      { freq: 784, delay: 8.0,  duration: 0.3,  type: 'sine',     vol: 0.036 },
      { freq: 659, delay: 8.5,  duration: 0.3,  type: 'triangle', vol: 0.036 },
      { freq: 523, delay: 9.0,  duration: 0.5,  type: 'sine',     vol: 0.04, harmony: 392 },
      // Final reprise
      { freq: 523, delay: 10.5, duration: 0.18, type: 'sine',     vol: 0.055 },
      { freq: 659, delay: 10.7, duration: 0.18, type: 'sine',     vol: 0.052 },
      { freq: 784, delay: 10.9, duration: 0.18, type: 'triangle', vol: 0.05 },
      { freq: 1047,delay: 11.1, duration: 0.8,  type: 'sine',     vol: 0.055, harmony: 784 },
      { freq: 784, delay: 12.2, duration: 0.3,  type: 'triangle', vol: 0.042 },
      { freq: 523, delay: 12.7, duration: 0.8,  type: 'sine',     vol: 0.044, harmony: 392 },
    ]
  }
}

const AMBIENT_LIBRARY = {
  default: {
    loopSeconds: 7.2,
    noises: [
      { delay: 0.2, duration: 0.28, vol: 0.018, filter: 1100 },
      { delay: 3.2, duration: 0.34, vol: 0.02, filter: 900 }
    ]
  },
  city: {
    loopSeconds: 6.6,
    notes: [
      { freq: 1760, delay: 1.0, duration: 0.08, type: 'sine', vol: 0.012 },
      { freq: 1320, delay: 4.3, duration: 0.08, type: 'sine', vol: 0.012 }
    ],
    noises: [
      { delay: 0.15, duration: 0.22, vol: 0.018, filter: 1600 },
      { delay: 3.8, duration: 0.18, vol: 0.012, filter: 2200 }
    ]
  },
  industrial: {
    loopSeconds: 6.4,
    notes: [
      { freq: 82, delay: 0, duration: 0.7, type: 'sawtooth', vol: 0.016 },
      { freq: 110, delay: 2.6, duration: 0.55, type: 'triangle', vol: 0.014 }
    ],
    noises: [
      { delay: 1.0, duration: 0.15, vol: 0.024, filter: 700 },
      { delay: 4.7, duration: 0.18, vol: 0.02, filter: 850 }
    ]
  },
  snow: {
    loopSeconds: 7.4,
    notes: [
      { freq: 880, delay: 1.2, duration: 0.16, type: 'sine', vol: 0.012 },
      { freq: 1175, delay: 4.8, duration: 0.14, type: 'sine', vol: 0.01 }
    ],
    noises: [
      { delay: 0.1, duration: 0.36, vol: 0.016, filter: 1400 },
      { delay: 3.4, duration: 0.26, vol: 0.014, filter: 1000 }
    ]
  },
  water: {
    loopSeconds: 6.8,
    notes: [
      { freq: 523, delay: 2.0, duration: 0.1, type: 'sine', vol: 0.012 },
      { freq: 659, delay: 5.1, duration: 0.08, type: 'sine', vol: 0.01 }
    ],
    noises: [
      { delay: 0.35, duration: 0.2, vol: 0.018, filter: 1300 },
      { delay: 2.75, duration: 0.22, vol: 0.017, filter: 950 },
      { delay: 4.95, duration: 0.2, vol: 0.017, filter: 1200 }
    ]
  }
}

const SOUND_ALIASES = {
  hole: 'holeComplete',
  cup: 'holeComplete',
  score: 'holeComplete',
  wall: 'wallHit',
  wallHit: 'wallHit',
  bounce: 'wallHit',
  hazard: 'hazardReset',
  hazardReset: 'hazardReset',
  lava: 'hazardReset',
  void: 'hazardReset',
  water: 'hazardReset',
  ballRoll: 'roll',
  roll: 'roll',
  pickup: 'powerup',
  powerupPickup: 'powerup',
  uiOpen: 'transition',
  uiClose: 'click'
}

class MiniGolfSoundManager {
  constructor() {
    this.context = null
    this.masterGain = null
    this.sfxGain = null
    this.musicGain = null
    this.ambientGain = null
    this.initialized = false
    this.muted = false
    this.musicMuted = false
    this.volume = 0.7
    this.musicVolume = 0.45
    this.sfxVolume = 1
    this.currentTrack = null
    this.currentEnvironment = null
    this.musicTimer = null
    this.ambientTimer = null
    this.blackHoleOsc = null
    this.blackHoleGain = null
    this.blackHoleFilter = null
  }

  async init() {
    if (this.initialized) return

    try {
      this.context = new (window.AudioContext || window.webkitAudioContext)()

      this.masterGain = this.context.createGain()
      this.sfxGain = this.context.createGain()
      this.musicGain = this.context.createGain()
      this.ambientGain = this.context.createGain()

      this.sfxGain.connect(this.masterGain)
      this.musicGain.connect(this.masterGain)
      this.ambientGain.connect(this.masterGain)
      this.masterGain.connect(this.context.destination)

      this.masterGain.gain.value = this.volume
      this.sfxGain.gain.value = this.sfxVolume
      this.musicGain.gain.value = this.musicVolume
      this.ambientGain.gain.value = this.musicVolume * 0.65

      this.initialized = true
    } catch (e) {
      console.warn('[MiniGolfSound] Audio context failed to initialize:', e)
    }
  }

  _now() {
    return this.context?.currentTime || 0
  }

  _ensureRunning() {
    if (!this.context || this.muted) return false
    try {
      if (this.context.state === 'suspended') this.context.resume()
      return true
    } catch {
      return false
    }
  }

  _clearTimer(timerName) {
    if (this[timerName]) {
      clearTimeout(this[timerName])
      this[timerName] = null
    }
  }

  _tone(freq, duration, type = 'sine', vol = 0.3, delay = 0, targetGain = this.sfxGain, detune = 0) {
    if (!this._ensureRunning() || !targetGain) return
    try {
      const t = this._now() + delay
      const osc = this.context.createOscillator()
      const gain = this.context.createGain()
      const filter = this.context.createBiquadFilter()

      filter.type = type === 'sawtooth' ? 'lowpass' : 'bandpass'
      filter.frequency.value = type === 'sawtooth' ? Math.max(freq * 3, 240) : Math.max(freq * 2, 400)
      filter.Q.value = 0.8

      osc.type = type
      osc.frequency.setValueAtTime(freq, t)
      osc.detune.setValueAtTime(detune, t)

      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(vol, t + Math.min(0.02, duration * 0.25))
      gain.gain.exponentialRampToValueAtTime(0.001, t + duration)

      osc.connect(filter)
      filter.connect(gain)
      gain.connect(targetGain)
      osc.start(t)
      osc.stop(t + duration + 0.02)
    } catch {
      // Silent fail for audio
    }
  }

  _noise(duration, vol = 0.15, delay = 0, targetGain = this.sfxGain, filterFreq = 3200) {
    if (!this._ensureRunning() || !targetGain) return
    try {
      const t = this._now() + delay
      const sampleRate = this.context.sampleRate
      const frames = Math.floor(sampleRate * duration)
      const buffer = this.context.createBuffer(1, frames, sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < frames; i += 1) {
        data[i] = (Math.random() * 2 - 1) * 0.5
      }

      const src = this.context.createBufferSource()
      src.buffer = buffer

      const bandpass = this.context.createBiquadFilter()
      bandpass.type = 'bandpass'
      bandpass.frequency.value = filterFreq
      bandpass.Q.value = 0.8

      const gain = this.context.createGain()
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(vol, t + 0.008)
      gain.gain.exponentialRampToValueAtTime(0.001, t + duration)

      src.connect(bandpass)
      bandpass.connect(gain)
      gain.connect(targetGain)
      src.start(t)
      src.stop(t + duration + 0.02)
    } catch {
      // Silent fail
    }
  }

  // ── Demonic-angelic black hole choir ─────────────────────────────────────────
  // Multiple detuned sine oscillators at harmonic intervals, slowly modulated
  // by a sub-Hz LFO to create a slowed angelic choir that warps into dread.
  // The closer the ball, the more the choir swells and the pitch drops.
  _ensureBlackHoleHum() {
    if (!this._ensureRunning() || !this.sfxGain) return false
    if (this.blackHoleOsc && this.blackHoleGain && this.blackHoleFilter) return true
    try {
      const ctx = this.context
      const now = this._now()

      // Master gain for the whole choir
      this.blackHoleGain = ctx.createGain()
      this.blackHoleGain.gain.setValueAtTime(0.0001, now)

      // Lowpass filter – opens up as proximity increases
      this.blackHoleFilter = ctx.createBiquadFilter()
      this.blackHoleFilter.type = 'lowpass'
      this.blackHoleFilter.frequency.setValueAtTime(180, now)
      this.blackHoleFilter.Q.value = 2.4

      // Reverb-like convolver using a short noise impulse
      try {
        const irLen = Math.floor(ctx.sampleRate * 1.8)
        const irBuf = ctx.createBuffer(2, irLen, ctx.sampleRate)
        for (let ch = 0; ch < 2; ch += 1) {
          const d = irBuf.getChannelData(ch)
          for (let i = 0; i < irLen; i += 1) {
            d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 2.2)
          }
        }
        this.blackHoleReverb = ctx.createConvolver()
        this.blackHoleReverb.buffer = irBuf
        this.blackHoleReverbGain = ctx.createGain()
        this.blackHoleReverbGain.gain.value = 0.55
        this.blackHoleFilter.connect(this.blackHoleReverb)
        this.blackHoleReverb.connect(this.blackHoleReverbGain)
        this.blackHoleReverbGain.connect(this.blackHoleGain)
      } catch {
        // reverb optional
      }

      this.blackHoleFilter.connect(this.blackHoleGain)
      this.blackHoleGain.connect(this.sfxGain)

      // Choir voices: angelic harmonic series, detuned for beating/warble
      // Base ~55 Hz (A1) – very low, sub-bass angelic choir
      const voiceFreqs = [55, 82.5, 110, 137.5, 165, 220]
      const voiceDetunes = [0, +8, -12, +5, -7, +14]
      this.blackHoleVoices = voiceFreqs.map((freq, i) => {
        const osc = ctx.createOscillator()
        const vGain = ctx.createGain()
        // LFO for slow tremolo on each voice (different rates for organic feel)
        const lfo = ctx.createOscillator()
        const lfoGain = ctx.createGain()
        lfo.type = 'sine'
        lfo.frequency.value = 0.08 + i * 0.03  // 0.08–0.23 Hz – very slow
        lfoGain.gain.value = freq * 0.012        // subtle pitch wobble
        lfo.connect(lfoGain)
        lfoGain.connect(osc.frequency)
        lfo.start(now)

        osc.type = i % 2 === 0 ? 'sine' : 'triangle'
        osc.frequency.setValueAtTime(freq, now)
        osc.detune.setValueAtTime(voiceDetunes[i], now)
        vGain.gain.setValueAtTime(0.0001, now)
        osc.connect(vGain)
        vGain.connect(this.blackHoleFilter)
        osc.start(now)
        return { osc, vGain, lfo, lfoGain, baseFreq: freq }
      })

      // Keep a reference to the primary osc for legacy API compat
      this.blackHoleOsc = this.blackHoleVoices[0].osc

      return true
    } catch {
      return false
    }
  }

  setBlackHoleProximity(value = 0) {
    const proximity = clamp(value, 0, 1)
    if (!this.initialized || this.muted || !this._ensureBlackHoleHum()) return
    const now = this._now()
    try {
      // Master volume swells dramatically with proximity
      this.blackHoleGain.gain.cancelScheduledValues(now)
      this.blackHoleGain.gain.linearRampToValueAtTime(
        Math.min(0.3, 0.0001 + proximity * proximity * 0.14),
        now + 0.12
      )

      // Filter opens up – from muffled to full choir as you approach
      this.blackHoleFilter.frequency.cancelScheduledValues(now)
      this.blackHoleFilter.frequency.linearRampToValueAtTime(
        140 + proximity * 1800,
        now + 0.12
      )

      // Each voice pitch drops and swells – the closer, the more demonic
      if (this.blackHoleVoices) {
        this.blackHoleVoices.forEach(({ osc, vGain, lfo, baseFreq }, i) => {
          try {
            // Pitch drops by up to a tritone (×0.71) as proximity → 1
            const pitchScale = 1 - proximity * 0.29
            osc.frequency.cancelScheduledValues(now)
            osc.frequency.linearRampToValueAtTime(baseFreq * pitchScale, now + 0.18)

            // LFO rate increases – warble gets faster and more unstable
            lfo.frequency.cancelScheduledValues(now)
            lfo.frequency.linearRampToValueAtTime(
              0.08 + i * 0.03 + proximity * 0.6,
              now + 0.18
            )

            // Each voice volume – higher harmonics swell more for angelic quality
            const voiceVol = (0.0001 + proximity * (0.04 + i * 0.008)) * (1 - i * 0.06)
            vGain.gain.cancelScheduledValues(now)
            vGain.gain.linearRampToValueAtTime(Math.max(0.0001, voiceVol), now + 0.12)
          } catch {
            // no-op per voice
          }
        })
      }
    } catch {
      // no-op
    }
  }

  _playTrackLoop(trackName = 'playing') {
    if (!this.initialized || this.muted || this.musicMuted) return
    const track = TRACK_LIBRARY[trackName] || TRACK_LIBRARY.playing
    track.notes.forEach((note) => {
      this._tone(note.freq, note.duration, note.type, note.vol, note.delay, this.musicGain, note.detune || 0)
      if (note.harmony) {
        this._tone(note.harmony, note.duration * 1.1, 'sine', note.vol * 0.65, note.delay, this.musicGain)
      }
    })
    this._clearTimer('musicTimer')
    this.musicTimer = setTimeout(() => {
      if (this.currentTrack === trackName) this._playTrackLoop(trackName)
    }, track.loopSeconds * 1000)
  }

  _playAmbientLoop(environment = 'default') {
    if (!this.initialized || this.muted || this.musicMuted) return
    const ambient = AMBIENT_LIBRARY[environment] || AMBIENT_LIBRARY.default
    ;(ambient.notes || []).forEach((note) => {
      this._tone(note.freq, note.duration, note.type, note.vol, note.delay, this.ambientGain, note.detune || 0)
    })
    ;(ambient.noises || []).forEach((noise) => {
      this._noise(noise.duration, noise.vol, noise.delay, this.ambientGain, noise.filter || 1400)
    })
    this._clearTimer('ambientTimer')
    this.ambientTimer = setTimeout(() => {
      if (this.currentEnvironment === environment) this._playAmbientLoop(environment)
    }, ambient.loopSeconds * 1000)
  }

  playEvent(soundName, options = {}) {
    if (!this.initialized || this.muted) return
    const name = SOUND_ALIASES[soundName] || soundName
    const intensity = clamp(Number(options.intensity ?? 1), 0.3, 2.5)

    switch (name) {
      case 'putt':
        this._noise(0.05, 0.18 * intensity, 0, this.sfxGain, 2200)
        this._tone(170, 0.08, 'triangle', 0.22 * intensity)
        this._tone(118, 0.13, 'sine', 0.14 * intensity, 0.03)
        break
      case 'roll':
        this._noise(0.08, 0.03 * intensity, 0, this.sfxGain, 900)
        this._tone(190, 0.08, 'sine', 0.045 * intensity)
        break
      case 'holeComplete':
        this._noise(0.04, 0.18, 0, this.sfxGain, 1800)
        this._tone(150, 0.1, 'triangle', 0.2)
        this._tone(523, 0.12, 'sine', 0.25, 0.08)
        this._tone(659, 0.12, 'sine', 0.25, 0.18)
        this._tone(784, 0.18, 'sine', 0.28, 0.28)
        this._tone(1047, 0.25, 'sine', 0.22, 0.4)
        break
      case 'join':
        this._tone(440, 0.12, 'sine', 0.18)
        this._tone(554, 0.16, 'sine', 0.2, 0.1)
        break
      case 'ready':
        this._tone(660, 0.08, 'sine', 0.22)
        this._tone(880, 0.14, 'sine', 0.25, 0.08)
        break
      case 'vote':
        this._tone(784, 0.06, 'sine', 0.18)
        this._tone(988, 0.1, 'sine', 0.2, 0.06)
        break
      case 'start':
        this._tone(392, 0.1, 'sine', 0.2)
        this._tone(494, 0.1, 'sine', 0.22, 0.1)
        this._tone(587, 0.1, 'sine', 0.24, 0.2)
        this._tone(784, 0.25, 'sine', 0.28, 0.3)
        this._tone(784, 0.15, 'triangle', 0.12, 0.3)
        break
      case 'win':
        this._tone(523, 0.15, 'sine', 0.26)
        this._tone(659, 0.15, 'sine', 0.26, 0.12)
        this._tone(784, 0.15, 'sine', 0.28, 0.24)
        this._tone(1047, 0.35, 'sine', 0.3, 0.36)
        this._tone(1047, 0.3, 'triangle', 0.14, 0.36)
        this._tone(784, 0.15, 'sine', 0.18, 0.56)
        this._tone(1047, 0.4, 'sine', 0.2, 0.68)
        break
      case 'powerup':
        this._tone(880, 0.06, 'sine', 0.2)
        this._tone(1109, 0.06, 'sine', 0.22, 0.06)
        this._tone(1319, 0.06, 'sine', 0.24, 0.12)
        this._tone(1760, 0.15, 'sine', 0.26, 0.18)
        break
      case 'transition':
        this._tone(300, 0.12, 'sine', 0.16)
        this._tone(420, 0.12, 'sine', 0.18, 0.06)
        this._tone(560, 0.16, 'sine', 0.2, 0.12)
        break
      case 'countdown':
        this._tone(1000, 0.06, 'square', 0.12)
        break
      case 'click':
        this._tone(900, 0.035, 'square', 0.1)
        break
      case 'hover':
        this._tone(1200, 0.02, 'sine', 0.06)
        break
      case 'error':
        this._tone(160, 0.18, 'sawtooth', 0.2)
        this._tone(120, 0.25, 'sawtooth', 0.16, 0.12)
        break
      case 'wallHit':
        this._noise(0.04, 0.16 * intensity, 0, this.sfxGain, 1600)
        this._tone(200, 0.06, 'triangle', 0.2 * intensity)
        break
      case 'sand':
        this._noise(0.08, 0.1 * intensity, 0, this.sfxGain, 850)
        this._tone(100, 0.06, 'sine', 0.08 * intensity)
        break
      case 'ice':
        this._tone(2400, 0.08, 'sine', 0.08 * intensity)
        this._tone(3200, 0.06, 'sine', 0.06 * intensity, 0.03)
        break
      case 'boost':
        this._tone(780, 0.08, 'triangle', 0.13)
        this._tone(980, 0.12, 'sine', 0.14, 0.04)
        this._tone(1319, 0.14, 'sine', 0.12, 0.08)
        break
      case 'sticky':
        this._noise(0.09, 0.08, 0, this.sfxGain, 700)
        this._tone(140, 0.1, 'sawtooth', 0.08)
        break
      case 'hazardReset':
        this._tone(300, 0.1, 'sawtooth', 0.2)
        this._tone(180, 0.2, 'sawtooth', 0.22, 0.08)
        this._tone(90, 0.3, 'sine', 0.18, 0.2)
        break
      default:
        this._tone(600, 0.08, 'sine', 0.15)
    }
  }

  play(soundName, options = {}) {
    this.playEvent(soundName, options)
  }

  startBackgroundMusic(trackName = 'playing') {
    this.currentTrack = trackName
    this._playTrackLoop(trackName)
  }

  stopBackgroundMusic() {
    this.currentTrack = null
    this._clearTimer('musicTimer')
  }

  setEnvironment(environment = 'default') {
    this.currentEnvironment = environment
    this._playAmbientLoop(environment)
  }

  stopEnvironment() {
    this.currentEnvironment = null
    this._clearTimer('ambientTimer')
  }

  setVolume(value) {
    this.volume = clamp(value, 0, 1)
    if (this.masterGain) this.masterGain.gain.value = this.volume
  }

  setMusicVolume(value) {
    this.musicVolume = clamp(value, 0, 1)
    if (this.musicGain) this.musicGain.gain.value = this.musicMuted ? 0 : this.musicVolume
    if (this.ambientGain) this.ambientGain.gain.value = this.musicMuted ? 0 : this.musicVolume * 0.65
  }

  setMuted(muted) {
    this.muted = muted
    if (this.masterGain) this.masterGain.gain.value = muted ? 0 : this.volume
    if (muted) this.setBlackHoleProximity(0)
  }

  toggleMute() {
    this.setMuted(!this.muted)
    return this.muted
  }

  setMusicMuted(muted) {
    this.musicMuted = muted
    if (this.musicGain) this.musicGain.gain.value = muted ? 0 : this.musicVolume
    if (this.ambientGain) this.ambientGain.gain.value = muted ? 0 : this.musicVolume * 0.65
  }

  toggleMusicMute() {
    this.setMusicMuted(!this.musicMuted)
    return this.musicMuted
  }
}

const soundManager = new MiniGolfSoundManager()

export const useMiniGolfSound = () => {
  const [initialized, setInitialized] = useState(false)
  const [muted, setMuted] = useState(false)
  const [musicMuted, setMusicMuted] = useState(false)
  const [volume, setVolumeState] = useState(0.7)
  const [musicVolume, setMusicVolumeState] = useState(0.45)
  const hasBoundRef = useRef(false)

  useEffect(() => {
    const initAudio = async () => {
      await soundManager.init()
      setInitialized(true)
    }

    const handleInteraction = () => {
      if (!initialized) initAudio()
      if (!hasBoundRef.current) {
        hasBoundRef.current = true
        document.removeEventListener('click', handleInteraction)
        document.removeEventListener('keydown', handleInteraction)
      }
    }

    document.addEventListener('click', handleInteraction)
    document.addEventListener('keydown', handleInteraction)

    return () => {
      document.removeEventListener('click', handleInteraction)
      document.removeEventListener('keydown', handleInteraction)
    }
  }, [initialized])

  const play = useCallback((soundName, options) => {
    if (initialized && !muted) soundManager.play(soundName, options)
  }, [initialized, muted])

  const playEvent = useCallback((soundName, options) => {
    if (initialized && !muted) soundManager.playEvent(soundName, options)
  }, [initialized, muted])

  const startBackgroundMusic = useCallback((trackName) => {
    if (initialized) soundManager.startBackgroundMusic(trackName)
  }, [initialized])

  const stopBackgroundMusic = useCallback(() => {
    soundManager.stopBackgroundMusic()
  }, [])

  const setEnvironment = useCallback((environment) => {
    if (initialized) soundManager.setEnvironment(environment)
  }, [initialized])

  const stopEnvironment = useCallback(() => {
    soundManager.stopEnvironment()
  }, [])

  const setVolume = useCallback((value) => {
    soundManager.setVolume(value)
    setVolumeState(value)
  }, [])

  const setMusicVolume = useCallback((value) => {
    soundManager.setMusicVolume(value)
    setMusicVolumeState(value)
  }, [])

  const toggleMute = useCallback(() => {
    const nextMuted = soundManager.toggleMute()
    setMuted(nextMuted)
    return nextMuted
  }, [])

  const setMuteState = useCallback((value) => {
    soundManager.setMuted(value)
    setMuted(value)
  }, [])

  const toggleMusicMute = useCallback(() => {
    const nextMuted = soundManager.toggleMusicMute()
    setMusicMuted(nextMuted)
    return nextMuted
  }, [])

  const setMusicMuteState = useCallback((value) => {
    soundManager.setMusicMuted(value)
    setMusicMuted(value)
  }, [])

  const setBlackHoleProximity = useCallback((value) => {
    if (initialized && !muted) soundManager.setBlackHoleProximity(value)
  }, [initialized, muted])

  return {
    play,
    playEvent,
    startBackgroundMusic,
    stopBackgroundMusic,
    setEnvironment,
    stopEnvironment,
    setVolume,
    setMusicVolume,
    toggleMute,
    toggleMusicMute,
    setMuted: setMuteState,
    setMusicMuted: setMusicMuteState,
    setBlackHoleProximity,
    muted,
    musicMuted,
    volume,
    musicVolume,
    initialized
  }
}

export default soundManager
