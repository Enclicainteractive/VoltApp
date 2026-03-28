const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

const profiles = {
  arcade: {
    root: 196,
    notes: [0, 3, 7, 10],
    wave: 'triangle',
    bassWave: 'sine',
    pulse: 1.8,
    padGain: 0.018,
    bassGain: 0.024,
    clickGain: 0.012
  },
  strategy: {
    root: 164.81,
    notes: [0, 5, 7, 10],
    wave: 'sawtooth',
    bassWave: 'triangle',
    pulse: 2.6,
    padGain: 0.014,
    bassGain: 0.022,
    clickGain: 0.01
  },
  sport: {
    root: 220,
    notes: [0, 4, 7, 12],
    wave: 'triangle',
    bassWave: 'square',
    pulse: 1.5,
    padGain: 0.017,
    bassGain: 0.026,
    clickGain: 0.011
  },
  noir: {
    root: 174.61,
    notes: [0, 1, 7, 8],
    wave: 'sine',
    bassWave: 'triangle',
    pulse: 3.1,
    padGain: 0.016,
    bassGain: 0.019,
    clickGain: 0.009
  }
}

const midiToFreq = (base, semitone) => base * (2 ** (semitone / 12))

export const createGameShellAudio = (profileId = 'arcade') => {
  const profile = profiles[profileId] || profiles.arcade
  let ctx = null
  let master = null
  let timer = null
  let step = 0
  let enabled = true

  const ensureContext = () => {
    if (ctx) return ctx
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)()
      master = ctx.createGain()
      master.gain.value = 0.18
      master.connect(ctx.destination)
    } catch {
      return null
    }
    return ctx
  }

  const tone = (frequency, duration, { type = 'sine', gain = 0.02, attack = 0.01, detune = 0 } = {}) => {
    const audio = ensureContext()
    if (!audio || !master || !enabled) return
    if (audio.state === 'suspended') audio.resume().catch(() => {})
    const oscillator = audio.createOscillator()
    const gainNode = audio.createGain()
    oscillator.type = type
    oscillator.frequency.setValueAtTime(frequency, audio.currentTime)
    oscillator.detune.setValueAtTime(detune, audio.currentTime)
    gainNode.gain.setValueAtTime(0.0001, audio.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(gain, audio.currentTime + attack)
    gainNode.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + duration)
    oscillator.connect(gainNode)
    gainNode.connect(master)
    oscillator.start()
    oscillator.stop(audio.currentTime + duration + 0.02)
  }

  const pulse = (intensity = 0.5) => {
    const note = profile.notes[step % profile.notes.length]
    const next = profile.notes[(step + 2) % profile.notes.length]
    const level = clamp(intensity, 0, 1)
    tone(midiToFreq(profile.root, note), 0.72, { type: profile.wave, gain: profile.padGain + level * 0.01, attack: 0.05 })
    tone(midiToFreq(profile.root / 2, next), 0.28, { type: profile.bassWave, gain: profile.bassGain + level * 0.01, attack: 0.01, detune: step % 2 === 0 ? -3 : 3 })
    if (step % 2 === 0) {
      tone(midiToFreq(profile.root * 2, note + 12), 0.09, { type: 'square', gain: profile.clickGain + level * 0.008, attack: 0.005 })
    }
    step += 1
  }

  return {
    start: (intensity = 0.45) => {
      if (timer) return
      pulse(intensity)
      timer = window.setInterval(() => pulse(intensity), profile.pulse * 1000)
    },
    stop: () => {
      if (timer) {
        window.clearInterval(timer)
        timer = null
      }
    },
    setEnabled: (value) => {
      enabled = !!value
      if (!enabled) master?.gain.setValueAtTime(0.0001, ctx?.currentTime || 0)
      else if (master && ctx) master.gain.setValueAtTime(0.18, ctx.currentTime)
    },
    ping: (accent = 1) => {
      tone(midiToFreq(profile.root * 2, profile.notes[(step + 1) % profile.notes.length]), 0.12, { type: 'triangle', gain: 0.025 + clamp(accent, 0, 1) * 0.02 })
    },
    dispose: () => {
      if (timer) window.clearInterval(timer)
      timer = null
      if (ctx) ctx.close().catch(() => {})
      ctx = null
      master = null
    }
  }
}
