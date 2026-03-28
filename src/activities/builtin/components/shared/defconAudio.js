const getAudioContextCtor = () => {
  if (typeof window === 'undefined') return null
  return window.AudioContext || window.webkitAudioContext || null
}

const midiToHz = (note) => 440 * Math.pow(2, (note - 69) / 12)

const fmPulse = (ctx, out, { freq = 110, duration = 0.2, volume = 0.08, modIndex = 40, modMult = 2, sweep = 0, delay = 0 } = {}) => {
  if (!ctx || !out) return
  const now = ctx.currentTime + delay
  const modOsc = ctx.createOscillator()
  const modGain = ctx.createGain()
  const carOsc = ctx.createOscillator()
  const carGain = ctx.createGain()
  modOsc.type = 'sine'
  modOsc.frequency.setValueAtTime(freq * modMult, now)
  modGain.gain.setValueAtTime(modIndex, now)
  modGain.gain.exponentialRampToValueAtTime(0.001, now + duration)
  modOsc.connect(modGain)
  carOsc.type = 'triangle'
  carOsc.frequency.setValueAtTime(freq, now)
  if (sweep) carOsc.frequency.linearRampToValueAtTime(Math.max(30, freq + sweep), now + duration)
  modGain.connect(carOsc.frequency)
  carGain.gain.setValueAtTime(0.0001, now)
  carGain.gain.exponentialRampToValueAtTime(volume, now + 0.01)
  carGain.gain.exponentialRampToValueAtTime(0.0001, now + duration)
  carOsc.connect(carGain)
  carGain.connect(out)
  modOsc.start(now)
  modOsc.stop(now + duration + 0.05)
  carOsc.start(now)
  carOsc.stop(now + duration + 0.05)
}

const drone = (ctx, out, { freq = 55, duration = 3.5, volume = 0.045, delay = 0 } = {}) => {
  if (!ctx || !out) return
  const now = ctx.currentTime + delay
  const stopAt = now + duration + 0.1
  const oscA = ctx.createOscillator()
  const oscB = ctx.createOscillator()
  const gain = ctx.createGain()
  const filter = ctx.createBiquadFilter()
  oscA.type = 'sawtooth'
  oscB.type = 'triangle'
  oscA.frequency.setValueAtTime(freq, now)
  oscB.frequency.setValueAtTime(freq * 1.003, now)
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(280, now)
  filter.frequency.linearRampToValueAtTime(180, now + duration)
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.linearRampToValueAtTime(volume, now + 0.18)
  gain.gain.linearRampToValueAtTime(volume * 0.7, now + duration - 0.4)
  gain.gain.linearRampToValueAtTime(0.0001, now + duration)
  oscA.connect(filter)
  oscB.connect(filter)
  filter.connect(gain)
  gain.connect(out)
  oscA.start(now)
  oscB.start(now)
  oscA.stop(stopAt)
  oscB.stop(stopAt)
}

export class DefconAudio {
  constructor(volume = 0.16) {
    this.ctx = null
    this.master = null
    this.musicGain = null
    this.sfxGain = null
    this.musicTimer = null
    this.currentMode = null
    this.volume = volume
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
      this.musicGain = this.ctx.createGain()
      this.musicGain.gain.value = 0.7
      this.musicGain.connect(this.master)
      this.sfxGain = this.ctx.createGain()
      this.sfxGain.gain.value = 1
      this.sfxGain.connect(this.master)
      return true
    } catch {
      this.ctx = null
      this.master = null
      return false
    }
  }

  resume() {
    if (!this.ensure()) return false
    if (this.ctx?.state === 'suspended') void this.ctx.resume().catch(() => {})
    return true
  }

  playLoop(mode = 'coldwar', intensity = 0) {
    if (!this.resume()) return
    this.currentMode = mode
    const ctx = this.ctx
    const out = this.musicGain
    const threat = Math.max(0, Math.min(1, intensity))
    if (mode === 'nullfire') {
      drone(ctx, out, { freq: midiToHz(28), duration: 4, volume: 0.06 })
      drone(ctx, out, { freq: midiToHz(29), duration: 4, volume: 0.05, delay: 0.14 })
      for (let index = 0; index < 10; index += 1) {
        fmPulse(ctx, out, { freq: 60 + index * 8, duration: 0.12, volume: 0.045, modIndex: 34, modMult: 1.2, delay: index * 0.34, sweep: 18 })
      }
      fmPulse(ctx, out, { freq: 220, duration: 1.4, volume: 0.04, modIndex: 120, modMult: 0.5, sweep: -110, delay: 1.6 })
      if (this.musicTimer) clearTimeout(this.musicTimer)
      this.musicTimer = setTimeout(() => {
        if (this.currentMode === mode) this.playLoop(mode, intensity)
      }, 4000)
      return
    }

    drone(ctx, out, { freq: midiToHz(29 - Math.round(threat * 2)), duration: 4, volume: 0.045 + threat * 0.02 })
    drone(ctx, out, { freq: midiToHz(34), duration: 3.6, volume: 0.03 + threat * 0.018, delay: 0.12 })
    const pulseSpacing = 0.66 - threat * 0.16
    const pulses = 6 + Math.round(threat * 4)
    for (let index = 0; index < pulses; index += 1) {
      fmPulse(ctx, out, {
        freq: threat > 0.55 ? 92 : 78,
        duration: 0.09 + threat * 0.03,
        volume: 0.026 + threat * 0.02,
        modIndex: 22 + threat * 28,
        modMult: 1.5 + threat,
        delay: index * pulseSpacing,
        sweep: -6
      })
      if (index % 2 === 1) {
        fmPulse(ctx, out, {
          freq: 180 + threat * 40,
          duration: 0.07,
          volume: 0.012 + threat * 0.015,
          modIndex: 18,
          modMult: 2.5,
          delay: index * pulseSpacing + 0.08,
          sweep: 12
        })
      }
    }
    if (this.musicTimer) clearTimeout(this.musicTimer)
    this.musicTimer = setTimeout(() => {
      if (this.currentMode === mode) this.playLoop(mode, intensity)
    }, 4000)
  }

  stopMusic() {
    this.currentMode = null
    if (this.musicTimer) clearTimeout(this.musicTimer)
    this.musicTimer = null
  }

  tick(defcon = 5) {
    if (!this.resume()) return
    const speed = 0.05 + (5 - defcon) * 0.01
    fmPulse(this.ctx, this.sfxGain, { freq: 720 - (5 - defcon) * 60, duration: speed, volume: 0.04 + (5 - defcon) * 0.01, modIndex: 10, modMult: 1 })
  }

  confirm() {
    if (!this.resume()) return
    fmPulse(this.ctx, this.sfxGain, { freq: 440, duration: 0.08, volume: 0.05, modIndex: 18, modMult: 2, sweep: 14 })
    fmPulse(this.ctx, this.sfxGain, { freq: 660, duration: 0.09, volume: 0.04, modIndex: 12, modMult: 2, delay: 0.05 })
  }

  alarm() {
    if (!this.resume()) return
    fmPulse(this.ctx, this.sfxGain, { freq: 190, duration: 0.16, volume: 0.08, modIndex: 42, modMult: 1.4, sweep: 40 })
    fmPulse(this.ctx, this.sfxGain, { freq: 140, duration: 0.18, volume: 0.07, modIndex: 54, modMult: 0.8, delay: 0.12, sweep: -30 })
  }

  launch() {
    if (!this.resume()) return
    fmPulse(this.ctx, this.sfxGain, { freq: 80, duration: 0.6, volume: 0.09, modIndex: 110, modMult: 0.8, sweep: 140 })
    fmPulse(this.ctx, this.sfxGain, { freq: 240, duration: 0.5, volume: 0.05, modIndex: 48, modMult: 2, delay: 0.12, sweep: -80 })
  }

  dispose() {
    this.stopMusic()
    try { this.master?.disconnect?.() } catch {}
    if (this.ctx?.close) void this.ctx.close().catch(() => {})
    this.ctx = null
    this.master = null
    this.musicGain = null
    this.sfxGain = null
  }
}

export const createDefconAudio = () => new DefconAudio()
