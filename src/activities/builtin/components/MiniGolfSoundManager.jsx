import { useEffect, useRef, useCallback, useState } from 'react'

class MiniGolfSoundManager {
  constructor() {
    this.context = null
    this.masterGain = null
    this.initialized = false
    this.muted = false
    this.volume = 0.7
  }

  async init() {
    if (this.initialized) return

    try {
      this.context = new (window.AudioContext || window.webkitAudioContext)()
      this.masterGain = this.context.createGain()
      this.masterGain.connect(this.context.destination)
      this.masterGain.gain.value = this.volume
      this.initialized = true
    } catch (e) {
      console.warn('[MiniGolfSound] Audio context failed to initialize:', e)
    }
  }

  _now() {
    return this.context?.currentTime || 0
  }

  _tone(freq, duration, type = 'sine', vol = 0.3, delay = 0) {
    if (!this.context || this.muted) return
    try {
      if (this.context.state === 'suspended') this.context.resume()

      const t = this._now() + delay
      const osc = this.context.createOscillator()
      const gain = this.context.createGain()

      osc.type = type
      osc.frequency.setValueAtTime(freq, t)

      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(vol, t + 0.008)
      gain.gain.exponentialRampToValueAtTime(0.001, t + duration)

      osc.connect(gain)
      gain.connect(this.masterGain)
      osc.start(t)
      osc.stop(t + duration + 0.01)
    } catch {
      // Silent fail for audio
    }
  }

  _noise(duration, vol = 0.15, delay = 0) {
    if (!this.context || this.muted) return
    try {
      if (this.context.state === 'suspended') this.context.resume()

      const t = this._now() + delay
      const sampleRate = this.context.sampleRate
      const frames = Math.floor(sampleRate * duration)
      const buffer = this.context.createBuffer(1, frames, sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < frames; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.5
      }

      const src = this.context.createBufferSource()
      src.buffer = buffer

      const bandpass = this.context.createBiquadFilter()
      bandpass.type = 'bandpass'
      bandpass.frequency.value = 3200
      bandpass.Q.value = 0.8

      const gain = this.context.createGain()
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(vol, t + 0.005)
      gain.gain.exponentialRampToValueAtTime(0.001, t + duration)

      src.connect(bandpass)
      bandpass.connect(gain)
      gain.connect(this.masterGain)
      src.start(t)
      src.stop(t + duration + 0.01)
    } catch {
      // Silent fail
    }
  }

  play(soundName) {
    if (!this.initialized || this.muted) return

    switch (soundName) {
      // -- Golf putt: thwack impact + ball roll rumble --
      case 'putt':
        this._noise(0.06, 0.22)
        this._tone(180, 0.08, 'triangle', 0.25)
        this._tone(120, 0.12, 'sine', 0.15, 0.03)
        break

      // -- Ball drops into cup: hollow thunk + cheerful arpeggio --
      case 'holeComplete':
        this._noise(0.04, 0.18)
        this._tone(150, 0.1, 'triangle', 0.2)
        this._tone(523, 0.12, 'sine', 0.25, 0.08)
        this._tone(659, 0.12, 'sine', 0.25, 0.18)
        this._tone(784, 0.18, 'sine', 0.28, 0.28)
        this._tone(1047, 0.25, 'sine', 0.22, 0.4)
        break

      // -- Player joins: two-note welcome chime --
      case 'join':
        this._tone(440, 0.12, 'sine', 0.18)
        this._tone(554, 0.16, 'sine', 0.2, 0.1)
        break

      // -- Player ready: bright confirmation ping --
      case 'ready':
        this._tone(660, 0.08, 'sine', 0.22)
        this._tone(880, 0.14, 'sine', 0.25, 0.08)
        break

      // -- Course vote tap --
      case 'vote':
        this._tone(784, 0.06, 'sine', 0.18)
        this._tone(988, 0.1, 'sine', 0.2, 0.06)
        break

      // -- Game start: ascending fanfare --
      case 'start':
        this._tone(392, 0.1, 'sine', 0.2)
        this._tone(494, 0.1, 'sine', 0.22, 0.1)
        this._tone(587, 0.1, 'sine', 0.24, 0.2)
        this._tone(784, 0.25, 'sine', 0.28, 0.3)
        this._tone(784, 0.15, 'triangle', 0.12, 0.3)
        break

      // -- Win fanfare: triumphant major chord arpeggio --
      case 'win':
        this._tone(523, 0.15, 'sine', 0.26)
        this._tone(659, 0.15, 'sine', 0.26, 0.12)
        this._tone(784, 0.15, 'sine', 0.28, 0.24)
        this._tone(1047, 0.35, 'sine', 0.3, 0.36)
        this._tone(1047, 0.3, 'triangle', 0.14, 0.36)
        this._tone(784, 0.15, 'sine', 0.18, 0.56)
        this._tone(1047, 0.4, 'sine', 0.2, 0.68)
        break

      // -- Power-up: ascending sparkle --
      case 'powerup':
        this._tone(880, 0.06, 'sine', 0.2)
        this._tone(1109, 0.06, 'sine', 0.22, 0.06)
        this._tone(1319, 0.06, 'sine', 0.24, 0.12)
        this._tone(1760, 0.15, 'sine', 0.26, 0.18)
        break

      // -- Hole transition: woosh sweep --
      case 'transition':
        this._tone(300, 0.12, 'sine', 0.16)
        this._tone(420, 0.12, 'sine', 0.18, 0.06)
        this._tone(560, 0.16, 'sine', 0.2, 0.12)
        break

      // -- Countdown tick --
      case 'countdown':
        this._tone(1000, 0.06, 'square', 0.12)
        break

      // -- UI click --
      case 'click':
        this._tone(900, 0.035, 'square', 0.1)
        break

      // -- UI hover --
      case 'hover':
        this._tone(1200, 0.02, 'sine', 0.06)
        break

      // -- Error / hazard: low buzz --
      case 'error':
        this._tone(160, 0.18, 'sawtooth', 0.2)
        this._tone(120, 0.25, 'sawtooth', 0.16, 0.12)
        break

      // -- Ball hits wall: impact thud --
      case 'wallHit':
        this._noise(0.04, 0.16)
        this._tone(200, 0.06, 'triangle', 0.2)
        break

      // -- Ball on sand: soft crunch --
      case 'sand':
        this._noise(0.08, 0.1)
        this._tone(100, 0.06, 'sine', 0.08)
        break

      // -- Ball on ice: glassy slide --
      case 'ice':
        this._tone(2400, 0.08, 'sine', 0.08)
        this._tone(3200, 0.06, 'sine', 0.06, 0.03)
        break

      // -- Lava / void reset: ominous drop --
      case 'hazardReset':
        this._tone(300, 0.1, 'sawtooth', 0.2)
        this._tone(180, 0.2, 'sawtooth', 0.22, 0.08)
        this._tone(90, 0.3, 'sine', 0.18, 0.2)
        break

      default:
        this._tone(600, 0.08, 'sine', 0.15)
    }
  }

  setVolume(value) {
    this.volume = Math.max(0, Math.min(1, value))
    if (this.masterGain) {
      this.masterGain.gain.value = this.volume
    }
  }

  toggleMute() {
    this.muted = !this.muted
    return this.muted
  }

  setMuted(muted) {
    this.muted = muted
  }
}

const soundManager = new MiniGolfSoundManager()

export const useMiniGolfSound = () => {
  const [initialized, setInitialized] = useState(false)
  const [muted, setMuted] = useState(false)
  const [volume, setVolumeState] = useState(0.7)

  useEffect(() => {
    const initAudio = async () => {
      await soundManager.init()
      setInitialized(true)
    }

    const handleInteraction = () => {
      if (!initialized) {
        initAudio()
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

  const play = useCallback((soundName) => {
    if (initialized && !muted) {
      soundManager.play(soundName)
    }
  }, [initialized, muted])

  const setVolume = useCallback((value) => {
    soundManager.setVolume(value)
    setVolumeState(value)
  }, [])

  const toggleMute = useCallback(() => {
    const newMuted = soundManager.toggleMute()
    setMuted(newMuted)
    return newMuted
  }, [])

  const setMuteState = useCallback((value) => {
    soundManager.setMuted(value)
    setMuted(value)
  }, [])

  return {
    play,
    setVolume,
    toggleMute,
    setMuted: setMuteState,
    muted,
    volume,
    initialized
  }
}

export default soundManager
