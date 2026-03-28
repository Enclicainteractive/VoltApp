const DEFAULT_FIRE_TONES = {
  striker: { freq: 140, duration: 0.08, type: 'sawtooth', volume: 0.22, sweep: -40 },
  interceptor: { freq: 220, duration: 0.08, type: 'sawtooth', volume: 0.22, sweep: -40 },
  hauler: { freq: 120, duration: 0.1, type: 'square', volume: 0.2, sweep: -28 }
}

const FALLBACK_FIRE_TONE = DEFAULT_FIRE_TONES.interceptor

const getAudioContextCtor = () => {
  if (typeof window === 'undefined') return null
  return window.AudioContext || window.webkitAudioContext || null
}

export class FlightActivityAudio {
  constructor(options = {}) {
    this.ctx = null
    this.master = null
    this.masterVolume = Number.isFinite(options.masterVolume) ? options.masterVolume : 0.18
    this.resolveCraftTone = typeof options.resolveCraftTone === 'function'
      ? options.resolveCraftTone
      : null
  }

  ensure() {
    if (this.ctx && this.master) return true

    const AudioContextCtor = getAudioContextCtor()
    if (!AudioContextCtor) return false

    try {
      this.ctx = new AudioContextCtor()
      this.master = this.ctx.createGain()
      this.master.gain.value = this.masterVolume
      this.master.connect(this.ctx.destination)
      return true
    } catch {
      this.ctx = null
      this.master = null
      return false
    }
  }

  setMasterVolume(volume = 0.18) {
    this.masterVolume = Number.isFinite(volume) ? volume : 0.18
    if (this.master?.gain && this.ctx) {
      this.master.gain.setValueAtTime(this.masterVolume, this.ctx.currentTime)
    }
  }

  pulse({ freq = 440, duration = 0.12, type = 'sine', volume = 0.25, sweep = 0 } = {}) {
    if (!this.ensure() || !this.ctx || !this.master) return

    const now = this.ctx.currentTime
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()

    osc.type = type
    osc.frequency.setValueAtTime(freq, now)
    if (sweep) {
      osc.frequency.linearRampToValueAtTime(freq + sweep, now + duration)
    }

    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(Math.max(volume, 0.0002), now + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)

    osc.connect(gain)
    gain.connect(this.master)
    osc.start(now)
    osc.stop(now + duration + 0.02)
  }

  resolveFireTone(craftId) {
    if (this.resolveCraftTone) {
      const customTone = this.resolveCraftTone(craftId)
      if (customTone && typeof customTone === 'object') {
        return { ...FALLBACK_FIRE_TONE, ...customTone }
      }
    }
    return DEFAULT_FIRE_TONES[craftId] || FALLBACK_FIRE_TONE
  }

  fire(craftId) {
    this.pulse(this.resolveFireTone(craftId))
  }

  impact() {
    this.pulse({ freq: 88, duration: 0.22, type: 'square', volume: 0.28, sweep: -30 })
  }

  checkpoint() {
    this.pulse({ freq: 620, duration: 0.1, type: 'triangle', volume: 0.18, sweep: 120 })
  }

  boost() {
    this.pulse({ freq: 320, duration: 0.16, type: 'sawtooth', volume: 0.18, sweep: 220 })
  }

  ready() {
    this.pulse({ freq: 520, duration: 0.09, type: 'triangle', volume: 0.14, sweep: 80 })
  }

  countdown(step = 0) {
    this.pulse({ freq: 420 + Number(step || 0) * 80, duration: 0.08, type: 'square', volume: 0.13, sweep: 20 })
  }

  victory() {
    this.pulse({ freq: 660, duration: 0.18, type: 'triangle', volume: 0.18, sweep: 120 })
    if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
      window.setTimeout(() => {
        this.pulse({ freq: 880, duration: 0.22, type: 'triangle', volume: 0.16, sweep: 160 })
      }, 110)
    }
  }

  dispose() {
    try {
      this.master?.disconnect?.()
    } catch {}

    if (this.ctx?.close) {
      void this.ctx.close().catch(() => {})
    }

    this.ctx = null
    this.master = null
  }
}

export const createFlightActivityAudio = (options) => new FlightActivityAudio(options)

export default FlightActivityAudio
