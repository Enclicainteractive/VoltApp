let ctx = null
let master = null
let reverb = null
let delay = null
let delayFeedback = null

const ensureAudio = () => {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext
    if (!AudioContext) return null
    ctx = new AudioContext()
    master = ctx.createGain()
    master.gain.value = 0.85

    delay = ctx.createDelay(0.4)
    delay.delayTime.value = 0.19
    delayFeedback = ctx.createGain()
    delayFeedback.gain.value = 0.26
    delay.connect(delayFeedback)
    delayFeedback.connect(delay)

    reverb = ctx.createConvolver()
    reverb.buffer = createImpulseResponse(ctx, 2.3, 2.2)

    master.connect(ctx.destination)
    master.connect(reverb)
    master.connect(delay)
    reverb.connect(ctx.destination)
    delay.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {})
  }
  return ctx
}

const createImpulseResponse = (audioCtx, seconds = 2, decay = 2) => {
  const rate = audioCtx.sampleRate
  const length = Math.floor(rate * seconds)
  const ir = audioCtx.createBuffer(2, length, rate)
  for (let ch = 0; ch < 2; ch++) {
    const data = ir.getChannelData(ch)
    for (let i = 0; i < length; i++) {
      const t = i / length
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay)
    }
  }
  return ir
}

const tone = ({ freq = 440, type = 'sine', start = 0, dur = 0.16, gain = 0.18, pan = 0, detune = 0, target = 'master' }) => {
  const audioCtx = ensureAudio()
  if (!audioCtx) return

  const osc = audioCtx.createOscillator()
  const env = audioCtx.createGain()
  const panner = audioCtx.createStereoPanner()

  osc.type = type
  osc.frequency.value = freq
  osc.detune.value = detune
  panner.pan.value = pan

  env.gain.setValueAtTime(0.0001, audioCtx.currentTime + start)
  env.gain.exponentialRampToValueAtTime(gain, audioCtx.currentTime + start + 0.01)
  env.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + start + dur)

  osc.connect(env)
  env.connect(panner)

  if (target === 'reverb') panner.connect(reverb)
  else if (target === 'delay') panner.connect(delay)
  else panner.connect(master)

  osc.start(audioCtx.currentTime + start)
  osc.stop(audioCtx.currentTime + start + dur + 0.04)
}

const chord = (root, intervals, opts = {}) => {
  intervals.forEach((semi, i) => {
    const freq = root * Math.pow(2, semi / 12)
    tone({
      ...opts,
      freq,
      pan: (i - (intervals.length - 1) / 2) * 0.18,
      detune: (i % 2 === 0 ? -4 : 4)
    })
  })
}

const CUES = {
  session_created: () => {
    chord(261.63, [0, 4, 7], { type: 'triangle', gain: 0.12, dur: 0.28, target: 'reverb' })
    tone({ freq: 523.25, type: 'sine', start: 0.08, dur: 0.2, gain: 0.13, target: 'delay' })
  },
  session_joined: () => {
    tone({ freq: 392, type: 'sine', dur: 0.12, gain: 0.12 })
    tone({ freq: 523.25, type: 'sine', start: 0.06, dur: 0.14, gain: 0.11 })
  },
  session_left: () => {
    tone({ freq: 440, type: 'triangle', dur: 0.14, gain: 0.1 })
    tone({ freq: 330, type: 'triangle', start: 0.06, dur: 0.16, gain: 0.1 })
  },
  round_start: () => {
    chord(293.66, [0, 5, 9], { type: 'sawtooth', gain: 0.08, dur: 0.2, target: 'reverb' })
    tone({ freq: 587.33, type: 'square', start: 0.07, dur: 0.15, gain: 0.08, target: 'delay' })
  },
  round_end: () => {
    tone({ freq: 659.25, type: 'triangle', dur: 0.12, gain: 0.1 })
    tone({ freq: 523.25, type: 'triangle', start: 0.05, dur: 0.12, gain: 0.09 })
    tone({ freq: 392.0, type: 'triangle', start: 0.1, dur: 0.14, gain: 0.08 })
  },
  score_update: () => {
    tone({ freq: 784, type: 'sine', dur: 0.08, gain: 0.11 })
    tone({ freq: 988, type: 'sine', start: 0.04, dur: 0.08, gain: 0.1 })
  },
  ready_check: () => {
    tone({ freq: 740, type: 'square', dur: 0.05, gain: 0.09 })
    tone({ freq: 740, type: 'square', start: 0.08, dur: 0.05, gain: 0.09 })
  },
  error: () => {
    tone({ freq: 190, type: 'sawtooth', dur: 0.14, gain: 0.1, target: 'delay' })
    tone({ freq: 150, type: 'sawtooth', start: 0.06, dur: 0.16, gain: 0.1 })
  }
}

export const playActivityCueOTF = (cue, volume = 0.82) => {
  const audioCtx = ensureAudio()
  if (!audioCtx || !master) return
  master.gain.value = Math.max(0, Math.min(1, Number(volume || 0.82)))
  const fn = CUES[cue]
  if (fn) fn()
}

export const warmupActivityAudio = () => {
  ensureAudio()
}

export default {
  playActivityCueOTF,
  warmupActivityAudio
}
