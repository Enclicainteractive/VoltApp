const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

class VoltCraftAudioEngine {
  constructor() {
    this.ctx = null
    this.master = null
    this.enabled = true
  }

  ensure() {
    if (typeof window === 'undefined') return null
    if (this.ctx) return this.ctx
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return null
    this.ctx = new AudioCtx()
    this.master = this.ctx.createGain()
    this.master.gain.value = 0.12
    this.master.connect(this.ctx.destination)
    return this.ctx
  }

  resume() {
    const ctx = this.ensure()
    if (!ctx) return
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  }

  setEnabled(enabled) {
    this.enabled = !!enabled
    if (this.master) {
      this.master.gain.linearRampToValueAtTime(this.enabled ? 0.12 : 0.0001, this.ctx.currentTime + 0.08)
    }
  }

  tone({ frequency = 220, duration = 0.18, type = 'sine', gain = 0.18, attack = 0.01, release = 0.12, detune = 0 }) {
    if (!this.enabled) return
    const ctx = this.ensure()
    if (!ctx || !this.master) return
    const osc = ctx.createOscillator()
    const env = ctx.createGain()
    osc.type = type
    osc.frequency.value = frequency
    osc.detune.value = detune
    env.gain.value = 0.0001
    osc.connect(env)
    env.connect(this.master)
    const now = ctx.currentTime
    env.gain.cancelScheduledValues(now)
    env.gain.setValueAtTime(0.0001, now)
    env.gain.linearRampToValueAtTime(gain, now + attack)
    env.gain.exponentialRampToValueAtTime(0.0001, now + duration + release)
    osc.start(now)
    osc.stop(now + duration + release + 0.02)
  }

  noise({ duration = 0.08, gain = 0.12, lowpass = 1600 }) {
    if (!this.enabled) return
    const ctx = this.ensure()
    if (!ctx || !this.master) return
    const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * duration)), ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length)
    }
    const source = ctx.createBufferSource()
    const filter = ctx.createBiquadFilter()
    const env = ctx.createGain()
    filter.type = 'lowpass'
    filter.frequency.value = lowpass
    env.gain.value = gain
    source.buffer = buffer
    source.connect(filter)
    filter.connect(env)
    env.connect(this.master)
    source.start()
    source.stop(ctx.currentTime + duration + 0.02)
  }

  playBreak(blockName) {
    const heavy = /(stone|ore|deepslate|obsidian|brick|furnace)/.test(blockName || '')
    this.noise({ duration: heavy ? 0.12 : 0.07, gain: heavy ? 0.16 : 0.1, lowpass: heavy ? 900 : 1800 })
    this.tone({ frequency: heavy ? 120 : 180, duration: 0.05, type: heavy ? 'triangle' : 'square', gain: 0.07 })
  }

  playPlace(blockName) {
    const airy = /(glass|torch|wire|power)/.test(blockName || '')
    this.tone({ frequency: airy ? 420 : 240, duration: 0.06, type: airy ? 'sine' : 'triangle', gain: 0.08 })
  }

  playCraft() {
    this.tone({ frequency: 392, duration: 0.08, type: 'triangle', gain: 0.09 })
    this.tone({ frequency: 523.25, duration: 0.1, type: 'triangle', gain: 0.09, detune: 6 })
  }

  playDamage() {
    this.noise({ duration: 0.11, gain: 0.14, lowpass: 1200 })
    this.tone({ frequency: 110, duration: 0.12, type: 'sawtooth', gain: 0.08 })
  }

  playJump() {
    this.tone({ frequency: 300, duration: 0.06, type: 'triangle', gain: 0.05 })
  }

  playQuest() {
    this.tone({ frequency: 440, duration: 0.08, type: 'triangle', gain: 0.08 })
    this.tone({ frequency: 554.37, duration: 0.12, type: 'triangle', gain: 0.08 })
    this.tone({ frequency: 659.25, duration: 0.16, type: 'triangle', gain: 0.08 })
  }

  playBiome() {
    this.tone({ frequency: 261.63, duration: 0.09, type: 'sine', gain: 0.05 })
    this.tone({ frequency: 329.63, duration: 0.13, type: 'sine', gain: 0.05 })
  }

  playIgnite() {
    this.noise({ duration: 0.14, gain: 0.08, lowpass: 2200 })
    this.tone({ frequency: 620, duration: 0.04, type: 'square', gain: 0.04 })
  }

  playAmbient(time, weather, healthRatio = 1) {
    if (!this.enabled) return
    const ctx = this.ensure()
    if (!ctx || !this.master) return
    const nightFactor = time >= 1140 || time < 360 ? 1 : 0
    const rainFactor = weather === '🌧️' ? 1 : 0
    const base = 170 + (nightFactor ? -28 : 22) + rainFactor * -10
    const volume = clamp(0.016 + rainFactor * 0.01 + (1 - healthRatio) * 0.02, 0.012, 0.05)
    this.tone({ frequency: base, duration: 0.42, type: nightFactor ? 'sawtooth' : 'sine', gain: volume, attack: 0.08, release: 0.18 })
  }
}

export function createVoltCraftAudio() {
  return new VoltCraftAudioEngine()
}
