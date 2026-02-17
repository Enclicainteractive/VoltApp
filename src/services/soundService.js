class SoundService {
  constructor() {
    this.audioContext = null
    this.masterGain = null
    this.compressor = null
    this.enabled = true
    this.volume = 0.5
    this.reverbPool = []
    this.initialized = false
  }

  init() {
    if (this.initialized) return
    try {
      this.getContext()
      this.initialized = true
    } catch (e) {
      console.warn('[Sound] Init failed:', e)
    }
  }

  getContext() {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext || window.mozAudioContext
        if (!AudioContextClass) {
          console.warn('[Sound] No AudioContext available')
          return null
        }
        this.audioContext = new AudioContextClass()
        
        if (this.audioContext.state === 'suspended') {
          const resume = () => {
            this.audioContext.resume()
            document.removeEventListener('click', resume)
            document.removeEventListener('keydown', resume)
            document.removeEventListener('touchstart', resume)
          }
          document.addEventListener('click', resume)
          document.addEventListener('keydown', resume)
          document.addEventListener('touchstart', resume)
        }
        
        this.compressor = this.audioContext.createDynamicsCompressor()
        this.compressor.threshold.value = -18
        this.compressor.knee.value = 8
        this.compressor.ratio.value = 6
        this.compressor.attack.value = 0.002
        this.compressor.release.value = 0.1
        this.masterGain = this.audioContext.createGain()
        this.masterGain.gain.value = this.volume
        this.masterGain.connect(this.compressor)
        this.compressor.connect(this.audioContext.destination)
      } catch (e) {
        console.error('[Sound] Failed to create AudioContext:', e)
        return null
      }
    }
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume()
    }
    return this.audioContext
  }

  get output() {
    this.getContext()
    return this.masterGain
  }

  setEnabled(enabled) {
    this.enabled = enabled
  }

  setVolume(vol) {
    this.volume = Math.max(0, Math.min(1, vol))
    if (this.masterGain) this.masterGain.gain.value = this.volume
  }

  createBitCrusher(ctx, bits = 8, normFreq = 0.1) {
    const bufferSize = 4096
    const crusher = ctx.createWaveShaper()
    const curve = new Float32Array(bufferSize)
    const step = Math.pow(0.5, bits)
    for (let i = 0; i < bufferSize; i++) {
      const x = (i * 2) / bufferSize - 1
      curve[i] = Math.round(x / step) * step
    }
    curve[0] = -1
    curve[bufferSize - 1] = 1
    crusher.curve = curve
    crusher.oversample = '4x'
    return crusher
  }

  createSaturation(ctx, amount = 1) {
    const saturation = ctx.createWaveShaper()
    const curve = new Float32Array(256)
    const k = amount
    for (let i = 0; i < 256; i++) {
      const x = (i - 128) / 128
      curve[i] = (Math.PI * k * x) / (Math.PI * k * x + Math.abs(x))
    }
    saturation.curve = curve
    saturation.oversample = '4x'
    return saturation
  }

  createReverb(ctx, decay = 1.5, duration = 0.5) {
    const sampleRate = ctx.sampleRate
    const length = sampleRate * duration
    const impulse = ctx.createBuffer(2, length, sampleRate)
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch)
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate
        const envelope = Math.pow(1 - t / duration, decay * 2)
        data[i] = ((Math.random() * 2 - 1) * envelope * 0.8 +
                  Math.sin(t * 50 + Math.random()) * envelope * 0.1 +
                  Math.sin(t * 120 + Math.random()) * envelope * 0.05)
      }
    }
    const convolver = ctx.createConvolver()
    convolver.buffer = impulse
    return convolver
  }

  createFilter(ctx, type, frequency, Q = 1) {
    const filter = ctx.createBiquadFilter()
    filter.type = type
    filter.frequency.value = frequency
    filter.Q.value = Q
    return filter
  }

  createDelay(ctx, time = 0.2, feedback = 0.3) {
    const delay = ctx.createDelay(1)
    delay.delayTime.value = time
    const feedbackGain = ctx.createGain()
    feedbackGain.gain.value = feedback
    const dryGain = ctx.createGain()
    dryGain.gain.value = 0.7
    const wetGain = ctx.createGain()
    wetGain.gain.value = 0.3
    delay.connect(wetGain)
    feedbackGain.connect(delay)
    delay.connect(dryGain)
    return { delay, feedback: feedbackGain, dry: dryGain, wet: wetGain }
  }

  createTremolo(ctx, rate = 5, depth = 0.3) {
    const tremolo = ctx.createGain()
    const lfo = ctx.createOscillator()
    const lfoGain = ctx.createGain()
    lfo.type = 'sine'
    lfo.frequency.value = rate
    lfoGain.gain.value = depth
    lfo.connect(lfoGain)
    lfoGain.connect(tremolo.gain)
    lfo.start()
    return { tremolo, lfo }
  }

  createChorus(ctx, rate = 1.5, depth = 0.002) {
    const chorus = ctx.createGain()
    const lfo = ctx.createOscillator()
    const lfoGain = ctx.createGain()
    lfo.type = 'sine'
    lfo.frequency.value = rate
    lfoGain.gain.value = depth
    lfo.connect(lfoGain)
    lfo.start()
    return { chorus, lfo }
  }

  createEnvelope(ctx, param, startTime, attack, decay, sustain, release, peak = 1, endValue = 0) {
    param.setValueAtTime(endValue, startTime)
    param.linearRampToValueAtTime(peak, startTime + attack)
    param.linearRampToValueAtTime(peak * sustain, startTime + attack + decay)
    param.linearRampToValueAtTime(endValue, startTime + attack + decay + release)
  }

  playOsc(ctx, { type = 'sine', freq, freqEnd, start, stop, vol = 0.2, attack = 0.005, decay, destination }) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, start)
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, stop)
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(vol, start + attack)
    const decayStart = decay !== undefined ? start + decay : stop - 0.01
    gain.gain.setValueAtTime(vol, Math.min(decayStart, stop - 0.01))
    gain.gain.exponentialRampToValueAtTime(0.0001, stop)
    osc.connect(gain)
    gain.connect(destination || this.output)
    osc.start(start)
    osc.stop(stop + 0.05)
    return { osc, gain }
  }

  playDetunedOsc(ctx, { type = 'sine', freq, freqEnd, start, stop, vol = 0.2, detune = 3, attack = 0.005, decay, destination }) {
    const oscs = []
    const gains = []
    const detuneValues = [-detune, 0, detune]
    const detuneVols = [0.4, 1, 0.4]
    detuneValues.forEach((d, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = type
      osc.frequency.setValueAtTime(freq, start)
      osc.detune.value = d
      if (freqEnd) {
        const ratio = freqEnd / freq
        osc.frequency.setValueAtTime(freq * ratio, stop)
      }
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(vol * detuneVols[i], start + attack)
      const decayStart = decay !== undefined ? start + decay : stop - 0.01
      gain.gain.setValueAtTime(vol * detuneVols[i], Math.min(decayStart, stop - 0.01))
      gain.gain.exponentialRampToValueAtTime(0.0001, stop)
      osc.connect(gain)
      gain.connect(destination || this.output)
      osc.start(start)
      osc.stop(stop + 0.05)
      oscs.push(osc)
      gains.push(gain)
    })
    return { oscs, gains }
  }

  playFMSynth(ctx, { carrierFreq, modFreq, modIndex, start, stop, vol = 0.15, attack = 0.005, destination }) {
    const carrier = ctx.createOscillator()
    const modulator = ctx.createOscillator()
    const modGain = ctx.createGain()
    const carrierGain = ctx.createGain()
    const outGain = ctx.createGain()
    
    carrier.type = 'sine'
    carrier.frequency.value = carrierFreq
    modulator.type = 'sine'
    modulator.frequency.value = modFreq
    modGain.gain.value = carrierFreq * modIndex
    
    modulator.connect(modGain)
    modGain.connect(carrier.frequency)
    carrier.connect(carrierGain)
    carrierGain.connect(outGain)
    outGain.connect(destination || this.output)
    
    carrierGain.gain.setValueAtTime(0, start)
    carrierGain.gain.linearRampToValueAtTime(vol, start + attack)
    carrierGain.gain.exponentialRampToValueAtTime(0.0001, stop)
    
    carrier.start(start)
    modulator.start(start)
    carrier.stop(stop + 0.05)
    modulator.stop(stop + 0.05)
    
    return { carrier, modulator, carrierGain, modGain, outGain }
  }

  createNoiseBuffer(ctx, duration, type = 'white') {
    const bufferSize = ctx.sampleRate * duration
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    if (type === 'white') {
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1
    } else if (type === 'pink') {
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1
        b0 = 0.99886 * b0 + white * 0.0555179
        b1 = 0.99332 * b1 + white * 0.0750759
        b2 = 0.96900 * b2 + white * 0.1538520
        b3 = 0.86650 * b3 + white * 0.3104856
        b4 = 0.55000 * b4 + white * 0.5329522
        b5 = -0.7616 * b5 - white * 0.0168980
        data[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362
        data[i] *= 0.11
        b6 = white * 0.115926
      }
    } else if (type === 'brown') {
      let lastOut = 0
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1
        data[i] = (lastOut + (0.02 * white)) / 1.02
        lastOut = data[i]
        data[i] *= 3.5
      }
    }
    return buffer
  }

  createNoiseBurst(ctx, start, duration, vol = 0.05, type = 'white', destination) {
    const buffer = this.createNoiseBuffer(ctx, duration, type)
    const source = ctx.createBufferSource()
    source.buffer = buffer
    const gain = ctx.createGain()
    const hp = this.createFilter(ctx, 'highpass', 3000, 0.5)
    const lp = this.createFilter(ctx, 'lowpass', 12000, 0.5)
    source.connect(hp)
    hp.connect(lp)
    lp.connect(gain)
    gain.gain.setValueAtTime(vol, start)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    gain.connect(destination || this.output)
    source.start(start)
    source.stop(start + duration + 0.01)
  }

  playTone(frequency, duration, type = 'sine', volume = 0.3) {
    if (!this.enabled) return
    try {
      const ctx = this.getContext()
      const now = ctx.currentTime
      this.playOsc(ctx, { type, freq: frequency, start: now, stop: now + duration, vol: volume })
    } catch (err) { console.error('Sound error:', err) }
  }

  // ── Message sent: rich liquid pop with harmonic overtones and delay ──
  messageSent() {
    if (!this.enabled) return
    try {
      const ctx = this.getContext()
      const now = ctx.currentTime
      const lp = this.createFilter(ctx, 'lowpass', 7000, 1.5)
      const saturation = this.createSaturation(ctx, 0.5)
      const reverb = this.createReverb(ctx, 1.2, 0.25)
      const reverbGain = ctx.createGain()
      reverbGain.gain.value = 0.15
      const delay = this.createDelay(ctx, 0.08, 0.25)
      lp.connect(saturation)
      saturation.connect(this.output)
      saturation.connect(reverb)
      reverb.connect(reverbGain)
      reverbGain.connect(this.output)
      saturation.connect(delay.dry)
      delay.wet.connect(this.output)
      delay.feedback.connect(saturation)

      this.playDetunedOsc(ctx, { type: 'sine', freq: 1046.5, freqEnd: 1568, start: now, stop: now + 0.08, vol: 0.16, detune: 5, attack: 0.002, destination: lp })
      this.playDetunedOsc(ctx, { type: 'sine', freq: 1568, freqEnd: 2093, start: now + 0.02, stop: now + 0.1, vol: 0.09, detune: 4, destination: lp })
      this.playOsc(ctx, { type: 'sine', freq: 2093, freqEnd: 2637, start: now + 0.04, stop: now + 0.12, vol: 0.04, destination: lp })
      this.playOsc(ctx, { type: 'triangle', freq: 523.25, freqEnd: 784, start: now, stop: now + 0.1, vol: 0.05, destination: lp })
      this.playOsc(ctx, { type: 'triangle', freq: 261.6, start: now, stop: now + 0.08, vol: 0.025, destination: lp })
      this.playFMSynth(ctx, { carrierFreq: 523.25, modFreq: 1046.5, modIndex: 1.5, start: now, stop: now + 0.06, vol: 0.06, destination: lp })
      this.createNoiseBurst(ctx, now, 0.02, 0.012, 'pink', lp)
    } catch (err) { console.error('Sound error:', err) }
  }

  // ── Message received: warm hollow pop with resonance and delay ──
  messageReceived() {
    if (!this.enabled) return
    try {
      const ctx = this.getContext()
      const now = ctx.currentTime
      const lp = this.createFilter(ctx, 'lowpass', 3500, 2)
      const reverb = this.createReverb(ctx, 1.8, 0.35)
      const reverbGain = ctx.createGain()
      reverbGain.gain.value = 0.22
      const delay = this.createDelay(ctx, 0.12, 0.3)
      lp.connect(this.output)
      lp.connect(reverb)
      lp.connect(delay.dry)
      reverb.connect(reverbGain)
      reverbGain.connect(this.output)
      delay.wet.connect(this.output)
      delay.feedback.connect(lp)

      this.playFMSynth(ctx, { carrierFreq: 440, modFreq: 880, modIndex: 2.5, start: now, stop: now + 0.15, vol: 0.1, destination: lp })
      this.playDetunedOsc(ctx, { type: 'sine', freq: 880, freqEnd: 587, start: now + 0.01, stop: now + 0.12, vol: 0.09, detune: 3, attack: 0.001, destination: lp })
      this.playOsc(ctx, { type: 'triangle', freq: 220, start: now, stop: now + 0.1, vol: 0.035, destination: lp })
      this.playOsc(ctx, { type: 'sine', freq: 440, start: now + 0.02, stop: now + 0.08, vol: 0.03, destination: lp })
      this.createNoiseBurst(ctx, now, 0.012, 0.02, 'brown', lp)
    } catch (err) { console.error('Sound error:', err) }
  }

  // ── DM received: soft gentle two-note chime ──
  dmReceived() {
    if (!this.enabled) return
    try {
      const ctx = this.getContext()
      const now = ctx.currentTime
      const reverb = this.createReverb(ctx, 1.5, 0.4)
      const reverbGain = ctx.createGain()
      reverbGain.gain.value = 0.15
      reverb.connect(reverbGain)
      reverbGain.connect(this.output)

      const notes = [
        { freq: 659.3, time: 0, dur: 0.5 },
        { freq: 783.99, time: 0.18, dur: 0.6 },
      ]
      notes.forEach(n => {
        const lp = this.createFilter(ctx, 'lowpass', 3000, 1)
        lp.connect(this.output)
        lp.connect(reverb)
        
        this.playOsc(ctx, { type: 'sine', freq: n.freq, start: now + n.time, stop: now + n.time + n.dur, vol: 0.08, destination: lp })
        this.playOsc(ctx, { type: 'sine', freq: n.freq * 2, start: now + n.time, stop: now + n.time + n.dur * 0.4, vol: 0.025, destination: lp })
        this.playOsc(ctx, { type: 'sine', freq: n.freq * 4, start: now + n.time + 0.01, stop: now + n.time + n.dur * 0.15, vol: 0.006, destination: lp })
        this.playFMSynth(ctx, { carrierFreq: n.freq * 0.5, modFreq: n.freq, modIndex: 1, start: now + n.time, stop: now + n.time + n.dur * 0.3, vol: 0.03, destination: lp })
      })
    } catch (err) { console.error('Sound error:', err) }
  }

  // ── Mention: sharp attention ping with metallic ring and delay ──
  mention() {
    if (!this.enabled) return
    try {
      const ctx = this.getContext()
      const now = ctx.currentTime
      const bp = this.createFilter(ctx, 'bandpass', 2500, 3)
      const reverb = this.createReverb(ctx, 1.4, 0.28)
      const reverbGain = ctx.createGain()
      reverbGain.gain.value = 0.14
      const delay = this.createDelay(ctx, 0.1, 0.25)
      bp.connect(this.output)
      bp.connect(reverb)
      bp.connect(delay.dry)
      reverb.connect(reverbGain)
      reverbGain.connect(this.output)
      delay.wet.connect(this.output)
      delay.feedback.connect(bp)

      this.playDetunedOsc(ctx, { type: 'sine', freq: 1760, start: now, stop: now + 0.1, vol: 0.18, detune: 4, attack: 0.001, destination: bp })
      this.playDetunedOsc(ctx, { type: 'sine', freq: 2217, start: now + 0.03, stop: now + 0.15, vol: 0.13, detune: 3, attack: 0.001, destination: bp })
      this.playOsc(ctx, { type: 'sine', freq: 2794, start: now + 0.06, stop: now + 0.2, vol: 0.07, attack: 0.001, destination: bp })
      this.playFMSynth(ctx, { carrierFreq: 880, modFreq: 1320, modIndex: 3.5, start: now, stop: now + 0.12, vol: 0.05, destination: bp })
      this.playOsc(ctx, { type: 'triangle', freq: 1760, start: now + 0.02, stop: now + 0.08, vol: 0.03, destination: bp })
      this.createNoiseBurst(ctx, now, 0.01, 0.018, 'pink', bp)
    } catch (err) { console.error('Sound error:', err) }
  }

  // ── Call join: ascending arpeggio C-E-G-C with warm reverb ──
  callJoin() {
    if (!this.enabled) return
    try {
      const ctx = this.getContext()
      const now = ctx.currentTime
      const reverb = this.createReverb(ctx, 2.2, 0.7)
      const reverbGain = ctx.createGain()
      reverbGain.gain.value = 0.3
      reverb.connect(reverbGain)
      reverbGain.connect(this.output)

      const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5]
      notes.forEach((freq, i) => {
        const t = now + i * 0.06
        const lp = this.createFilter(ctx, 'lowpass', 4500, 1.2)
        lp.connect(this.output)
        lp.connect(reverb)
        
        this.playDetunedOsc(ctx, { type: 'sine', freq, start: t, stop: t + 0.4 - i * 0.03, vol: 0.12 - i * 0.01, detune: 4, attack: 0.005, destination: lp })
        this.playOsc(ctx, { type: 'triangle', freq: freq * 0.5, start: t, stop: t + 0.25, vol: 0.03, destination: lp })
        this.playOsc(ctx, { type: 'sine', freq: freq * 2, start: t + 0.01, stop: t + 0.15, vol: 0.02, destination: lp })
      })
    } catch (err) { console.error('Sound error:', err) }
  }

  // ── Call connected: success chord with shimmer ──
  callConnected() {
    if (!this.enabled) return
    try {
      const ctx = this.getContext()
      const now = ctx.currentTime
      const reverb = this.createReverb(ctx, 2, 0.5)
      const reverbGain = ctx.createGain()
      reverbGain.gain.value = 0.25
      const delay = this.createDelay(ctx, 0.1, 0.2)
      reverb.connect(reverbGain)
      reverbGain.connect(this.output)

      const chords = [
        { freqs: [659.25, 830.61, 987.77], time: 0, dur: 0.2 },
        { freqs: [880, 1108.73, 1318.5, 1568], time: 0.12, dur: 0.35 },
      ]
      chords.forEach(chord => {
        chord.freqs.forEach((freq, fi) => {
          const lp = this.createFilter(ctx, 'lowpass', 5500, 1)
          lp.connect(this.output)
          lp.connect(reverb)
          lp.connect(delay.dry)
          
          this.playDetunedOsc(ctx, { type: 'sine', freq, start: now + chord.time, stop: now + chord.time + chord.dur, vol: 0.1 - fi * 0.01, detune: 3, attack: 0.003, destination: lp })
          this.playOsc(ctx, { type: 'sine', freq: freq * 2, start: now + chord.time + 0.01, stop: now + chord.time + chord.dur * 0.4, vol: 0.02, destination: lp })
        })
      })
      this.createNoiseBurst(ctx, now + 0.12, 0.025, 0.015, 'pink', this.output)
      delay.wet.connect(reverb)
    } catch (err) { console.error('Sound error:', err) }
  }

  // ── Incoming call: ringing phone with vintage character ──
  callRingtone() {
    if (!this.enabled) return
    try {
      const ctx = this.getContext()
      const now = ctx.currentTime
      const reverb = this.createReverb(ctx, 1.5, 0.3)
      const reverbGain = ctx.createGain()
      reverbGain.gain.value = 0.15
      const lp = this.createFilter(ctx, 'lowpass', 4500, 1)
      const hp = this.createFilter(ctx, 'highpass', 300, 0.5)
      
      lp.connect(hp)
      hp.connect(this.output)
      hp.connect(reverb)
      reverb.connect(reverbGain)
      reverbGain.connect(this.output)

      const ringTimes = [0, 0.4, 0.8, 1.2, 1.6]
      ringTimes.forEach((t, i) => {
        const ringNow = now + t
        this.playOsc(ctx, { type: 'sine', freq: 1000, start: ringNow, stop: ringNow + 0.15, vol: 0.14, attack: 0.002, destination: lp })
        this.playOsc(ctx, { type: 'sine', freq: 1500, start: ringNow + 0.02, stop: ringNow + 0.12, vol: 0.08, attack: 0.002, destination: lp })
        this.playOsc(ctx, { type: 'triangle', freq: 500, start: ringNow, stop: ringNow + 0.1, vol: 0.04, destination: lp })
        this.playFMSynth(ctx, { carrierFreq: 800, modFreq: 1600, modIndex: 2, start: ringNow + 0.01, stop: ringNow + 0.1, vol: 0.04, destination: lp })
      })
    } catch (err) { console.error('Sound error:', err) }
  }

  // ── Call declined: descending rejection tone ──
  callDeclined() {
    if (!this.enabled) return
    try {
      const ctx = this.getContext()
      const now = ctx.currentTime
      const lp = this.createFilter(ctx, 'lowpass', 2500, 2)
      const reverb = this.createReverb(ctx, 1.2, 0.25)
      const reverbGain = ctx.createGain()
      reverbGain.gain.value = 0.12
      lp.connect(this.output)
      lp.connect(reverb)
      reverb.connect(reverbGain)
      reverbGain.connect(this.output)

      this.playOsc(ctx, { type: 'sine', freq: 523.25, freqEnd: 261.6, start: now, stop: now + 0.2, vol: 0.14, attack: 0.002, destination: lp })
      this.playOsc(ctx, { type: 'sine', freq: 392, freqEnd: 196, start: now + 0.1, stop: now + 0.35, vol: 0.12, destination: lp })
      this.playOsc(ctx, { type: 'triangle', freq: 329.63, freqEnd: 164.8, start: now + 0.05, stop: now + 0.25, vol: 0.04, destination: lp })
      this.createNoiseBurst(ctx, now, 0.04, 0.025, 'brown', lp)
    } catch (err) { console.error('Sound error:', err) }
  }

  // ── Call ended: hangup tone ──
  callEnded() {
    if (!this.enabled) return
    try {
      const ctx = this.getContext()
      const now = ctx.currentTime
      const lp = this.createFilter(ctx, 'lowpass', 3000, 1.5)
      const reverb = this.createReverb(ctx, 1.8, 0.35)
      const reverbGain = ctx.createGain()
      reverbGain.gain.value = 0.18
      lp.connect(this.output)
      lp.connect(reverb)
      reverb.connect(reverbGain)
      reverbGain.connect(this.output)

      this.playOsc(ctx, { type: 'sine', freq: 350, start: now, stop: now + 0.15, vol: 0.12, destination: lp })
      this.playOsc(ctx, { type: 'sine', freq: 350, start: now + 0.18, stop: now + 0.32, vol: 0.12, destination: lp })
      this.playOsc(ctx, { type: 'triangle', freq: 175, start: now, stop: now + 0.25, vol: 0.03, destination: lp })
    } catch (err) { console.error('Sound error:', err) }
  }

  // ── Call left: melancholic descending minor with soft tail ──
  callLeft() {
    if (!this.enabled) return
    try {
      const ctx = this.getContext()
      const now = ctx.currentTime
      const reverb = this.createReverb(ctx, 2.8, 0.65)
      const reverbGain = ctx.createGain()
      reverbGain.gain.value = 0.28
      const delay = this.createDelay(ctx, 0.15, 0.3)
      reverb.connect(reverbGain)
      reverbGain.connect(this.output)

      const notes = [
        { freq: 698.46, freqEnd: 523.25, time: 0, dur: 0.28 },
        { freq: 587.33, freqEnd: 392, time: 0.14, dur: 0.4 },
        { freq: 440, freqEnd: 329.63, time: 0.28, dur: 0.45 },
      ]
      notes.forEach(n => {
        const lp = this.createFilter(ctx, 'lowpass', 3000, 1.5)
        lp.connect(this.output)
        lp.connect(reverb)
        lp.connect(delay.dry)
        
        this.playDetunedOsc(ctx, { type: 'sine', freq: n.freq, freqEnd: n.freqEnd, start: now + n.time, stop: now + n.time + n.dur, vol: 0.1, detune: 5, attack: 0.005, destination: lp })
        this.playOsc(ctx, { type: 'triangle', freq: n.freq * 0.5, freqEnd: n.freqEnd * 0.5, start: now + n.time, stop: now + n.time + n.dur * 0.6, vol: 0.025, destination: lp })
        this.playFMSynth(ctx, { carrierFreq: n.freq * 0.5, modFreq: n.freq, modIndex: 1.5, start: now + n.time, stop: now + n.time + n.dur * 0.3, vol: 0.03, destination: lp })
      })
      delay.wet.connect(reverb)
    } catch (err) { console.error('Sound error:', err) }
  }

  // ── Call join: ascending arpeggio C-E-G-C with warm reverb ──
  callJoin() {
    if (!this.enabled) return
    try {
      const ctx = this.getContext()
      const now = ctx.currentTime
      const reverb = this.createReverb(ctx, 2.5, 0.75)
      const reverbGain = ctx.createGain()
      reverbGain.gain.value = 0.32
      const delay = this.createDelay(ctx, 0.1, 0.25)
      reverb.connect(reverbGain)
      reverbGain.connect(this.output)

      const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5]
      notes.forEach((freq, i) => {
        const t = now + i * 0.06
        const lp = this.createFilter(ctx, 'lowpass', 4500, 1.2)
        lp.connect(this.output)
        lp.connect(reverb)
        lp.connect(delay.dry)
        
        this.playDetunedOsc(ctx, { type: 'sine', freq, start: t, stop: t + 0.45 - i * 0.03, vol: 0.1 - i * 0.008, detune: 5, attack: 0.005, destination: lp })
        this.playOsc(ctx, { type: 'triangle', freq: freq * 0.5, start: t, stop: t + 0.28, vol: 0.025, destination: lp })
        this.playOsc(ctx, { type: 'sine', freq: freq * 2, start: t + 0.01, stop: t + 0.18, vol: 0.016, destination: lp })
        this.playFMSynth(ctx, { carrierFreq: freq, modFreq: freq * 2, modIndex: 1.2, start: t, stop: t + 0.2, vol: 0.025, destination: lp })
      })
      this.createNoiseBurst(ctx, now, 0.015, 0.015, 'pink', this.output)
      delay.wet.connect(reverb)
    } catch (err) { console.error('Sound error:', err) }
  }

  // ── User joined voice: bright ascending blip with presence and delay ──
  userJoined() {
    if (!this.enabled) return
    try {
      const ctx = this.getContext()
      const now = ctx.currentTime
      const lp = this.createFilter(ctx, 'lowpass', 5000, 1.5)
      const saturation = this.createSaturation(ctx, 0.3)
      const reverb = this.createReverb(ctx, 1.2, 0.25)
      const reverbGain = ctx.createGain()
      reverbGain.gain.value = 0.12
      const delay = this.createDelay(ctx, 0.08, 0.2)
      lp.connect(saturation)
      saturation.connect(this.output)
      saturation.connect(reverb)
      saturation.connect(delay.dry)
      reverb.connect(reverbGain)
      reverbGain.connect(this.output)
      delay.wet.connect(this.output)

      this.playDetunedOsc(ctx, { type: 'sine', freq: 587.33, start: now, stop: now + 0.08, vol: 0.16, detune: 4, attack: 0.001, destination: lp })
      this.playDetunedOsc(ctx, { type: 'sine', freq: 783.99, start: now + 0.05, stop: now + 0.14, vol: 0.18, detune: 3, attack: 0.002, destination: lp })
      this.playOsc(ctx, { type: 'sine', freq: 1174.66, start: now + 0.1, stop: now + 0.2, vol: 0.1, attack: 0.003, destination: lp })
      this.playOsc(ctx, { type: 'triangle', freq: 293.66, start: now, stop: now + 0.1, vol: 0.035, destination: lp })
      this.playFMSynth(ctx, { carrierFreq: 440, modFreq: 880, modIndex: 2, start: now, stop: now + 0.1, vol: 0.04, destination: lp })
      this.createNoiseBurst(ctx, now, 0.01, 0.018, 'pink', lp)
    } catch (err) { console.error('Sound error:', err) }
  }

  // ── User left voice: soft descending two-note with delay ──
  userLeft() {
    if (!this.enabled) return
    try {
      const ctx = this.getContext()
      const now = ctx.currentTime
      const lp = this.createFilter(ctx, 'lowpass', 4000, 1.5)
      const reverb = this.createReverb(ctx, 1.5, 0.3)
      const reverbGain = ctx.createGain()
      reverbGain.gain.value = 0.15
      const delay = this.createDelay(ctx, 0.1, 0.25)
      lp.connect(this.output)
      lp.connect(reverb)
      lp.connect(delay.dry)
      reverb.connect(reverbGain)
      reverbGain.connect(this.output)
      delay.wet.connect(this.output)
      delay.feedback.connect(lp)

      this.playDetunedOsc(ctx, { type: 'sine', freq: 698.46, start: now, stop: now + 0.1, vol: 0.14, detune: 3, attack: 0.002, destination: lp })
      this.playDetunedOsc(ctx, { type: 'sine', freq: 493.88, start: now + 0.06, stop: now + 0.16, vol: 0.16, detune: 4, attack: 0.002, destination: lp })
      this.playOsc(ctx, { type: 'triangle', freq: 349.23, start: now, stop: now + 0.12, vol: 0.035, destination: lp })
      this.createNoiseBurst(ctx, now + 0.08, 0.012, 0.012, 'brown', lp)
    } catch (err) { console.error('Sound error:', err) }
  }

  // ── Mute: solid low thud with weight ──
  mute() {
    if (!this.enabled) return
    try {
      const ctx = this.getContext()
      const now = ctx.currentTime
      const lp = this.createFilter(ctx, 'lowpass', 600, 4)
      const saturation = this.createSaturation(ctx, 0.8)
      const delay = this.createDelay(ctx, 0.08, 0.15)
      lp.frequency.setValueAtTime(600, now)
      lp.frequency.exponentialRampToValueAtTime(150, now + 0.15)
      lp.connect(saturation)
      saturation.connect(this.output)
      saturation.connect(delay.dry)
      delay.wet.connect(this.output)

      this.playOsc(ctx, { type: 'sine', freq: 220, freqEnd: 110, start: now, stop: now + 0.15, vol: 0.22, attack: 0.002, destination: lp })
      this.playOsc(ctx, { type: 'sine', freq: 110, freqEnd: 55, start: now + 0.05, stop: now + 0.2, vol: 0.13, destination: lp })
      this.playOsc(ctx, { type: 'square', freq: 80, start: now, stop: now + 0.08, vol: 0.035, destination: lp })
      this.playFMSynth(ctx, { carrierFreq: 100, modFreq: 50, modIndex: 3, start: now, stop: now + 0.12, vol: 0.06, destination: lp })
      this.createNoiseBurst(ctx, now, 0.025, 0.04, 'brown', lp)
    } catch (err) { console.error('Sound error:', err) }
  }

  // ── Unmute: bright pop with filter sweep ──
  unmute() {
    if (!this.enabled) return
    try {
      const ctx = this.getContext()
      const now = ctx.currentTime
      const lp = this.createFilter(ctx, 'lowpass', 500, 2)
      const reverb = this.createReverb(ctx, 1.2, 0.2)
      const reverbGain = ctx.createGain()
      reverbGain.gain.value = 0.1
      lp.frequency.setValueAtTime(500, now)
      lp.frequency.exponentialRampToValueAtTime(6000, now + 0.12)
      lp.connect(this.output)
      lp.connect(reverb)
      reverb.connect(reverbGain)
      reverbGain.connect(this.output)

      this.playDetunedOsc(ctx, { type: 'sine', freq: 440, freqEnd: 1046.5, start: now, stop: now + 0.1, vol: 0.18, detune: 4, attack: 0.001, destination: lp })
      this.playDetunedOsc(ctx, { type: 'sine', freq: 880, freqEnd: 1568, start: now + 0.03, stop: now + 0.14, vol: 0.1, detune: 3, destination: lp })
      this.playOsc(ctx, { type: 'triangle', freq: 220, freqEnd: 440, start: now, stop: now + 0.08, vol: 0.04, destination: lp })
      this.playOsc(ctx, { type: 'square', freq: 120, start: now, stop: now + 0.05, vol: 0.018, destination: lp })
      this.playFMSynth(ctx, { carrierFreq: 660, modFreq: 1320, modIndex: 2, start: now, stop: now + 0.1, vol: 0.04, destination: lp })
      this.createNoiseBurst(ctx, now + 0.01, 0.018, 0.02, 'pink', lp)
    } catch (err) { console.error('Sound error:', err) }
  }

  // ── Deafen: heavy double-thud with depth ──
  deafen() {
    if (!this.enabled) return
    try {
      const ctx = this.getContext()
      const now = ctx.currentTime
      const lp = this.createFilter(ctx, 'lowpass', 400, 5)
      const saturation = this.createSaturation(ctx, 1)
      const delay = this.createDelay(ctx, 0.1, 0.2)
      lp.connect(saturation)
      saturation.connect(this.output)
      saturation.connect(delay.dry)
      delay.wet.connect(this.output)

      this.playOsc(ctx, { type: 'sine', freq: 180, freqEnd: 80, start: now, stop: now + 0.15, vol: 0.22, attack: 0.001, destination: lp })
      this.playOsc(ctx, { type: 'sine', freq: 120, freqEnd: 60, start: now + 0.08, stop: now + 0.25, vol: 0.18, destination: lp })
      this.playOsc(ctx, { type: 'square', freq: 50, start: now, stop: now + 0.1, vol: 0.04, destination: lp })
      this.playFMSynth(ctx, { carrierFreq: 80, modFreq: 40, modIndex: 3, start: now, stop: now + 0.15, vol: 0.06, destination: lp })
      this.createNoiseBurst(ctx, now, 0.035, 0.05, 'brown', lp)
    } catch (err) { console.error('Sound error:', err) }
  }

  // ── Undeafen: expansive opening sweep with chime ──
  undeafen() {
    if (!this.enabled) return
    try {
      const ctx = this.getContext()
      const now = ctx.currentTime
      const lp = this.createFilter(ctx, 'lowpass', 300, 1.5)
      const reverb = this.createReverb(ctx, 1.8, 0.45)
      const reverbGain = ctx.createGain()
      reverbGain.gain.value = 0.18
      const delay = this.createDelay(ctx, 0.12, 0.25)
      lp.frequency.setValueAtTime(300, now)
      lp.frequency.exponentialRampToValueAtTime(7000, now + 0.25)
      lp.connect(this.output)
      lp.connect(reverb)
      lp.connect(delay.dry)
      reverb.connect(reverbGain)
      reverbGain.connect(this.output)
      delay.wet.connect(reverb)

      this.playDetunedOsc(ctx, { type: 'sine', freq: 350, freqEnd: 1046.5, start: now, stop: now + 0.18, vol: 0.16, detune: 4, attack: 0.002, destination: lp })
      this.playDetunedOsc(ctx, { type: 'sine', freq: 698.46, freqEnd: 1568, start: now + 0.06, stop: now + 0.28, vol: 0.12, detune: 3, destination: lp })
      this.playOsc(ctx, { type: 'sine', freq: 1396.91, start: now + 0.12, stop: now + 0.35, vol: 0.09, attack: 0.01, destination: lp })
      this.playOsc(ctx, { type: 'triangle', freq: 175, freqEnd: 440, start: now, stop: now + 0.15, vol: 0.035, destination: lp })
      this.playFMSynth(ctx, { carrierFreq: 880, modFreq: 1760, modIndex: 2, start: now + 0.08, stop: now + 0.2, vol: 0.04, destination: lp })
      this.createNoiseBurst(ctx, now + 0.15, 0.025, 0.018, 'pink', lp)
    } catch (err) { console.error('Sound error:', err) }
  }

  // ── Channel switch: crisp click with presence ──
  channelSwitch() {
    if (!this.enabled) return
    try {
      const ctx = this.getContext()
      const now = ctx.currentTime
      const bp = this.createFilter(ctx, 'bandpass', 3500, 6)
      const saturation = this.createSaturation(ctx, 0.4)
      const reverb = this.createReverb(ctx, 1.2, 0.2)
      const reverbGain = ctx.createGain()
      reverbGain.gain.value = 0.1
      const delay = this.createDelay(ctx, 0.05, 0.15)
      bp.connect(saturation)
      saturation.connect(this.output)
      saturation.connect(reverb)
      saturation.connect(delay.dry)
      reverb.connect(reverbGain)
      reverbGain.connect(this.output)
      delay.wet.connect(this.output)

      this.createNoiseBurst(ctx, now, 0.018, 0.1, 'pink', bp)
      this.playDetunedOsc(ctx, { type: 'sine', freq: 2500, freqEnd: 1500, start: now, stop: now + 0.035, vol: 0.07, detune: 4, attack: 0.001, destination: bp })
      this.playOsc(ctx, { type: 'square', freq: 1200, start: now, stop: now + 0.02, vol: 0.025, destination: bp })
      this.playFMSynth(ctx, { carrierFreq: 1800, modFreq: 3600, modIndex: 2, start: now, stop: now + 0.03, vol: 0.03, destination: bp })
    } catch (err) { console.error('Sound error:', err) }
  }

  // ── Notification: three-bell chime with shimmer and delay ──
  notification() {
    if (!this.enabled) return
    try {
      const ctx = this.getContext()
      const now = ctx.currentTime
      const reverb = this.createReverb(ctx, 2, 0.5)
      const reverbGain = ctx.createGain()
      reverbGain.gain.value = 0.25
      const delay = this.createDelay(ctx, 0.12, 0.3)
      reverb.connect(reverbGain)
      reverbGain.connect(this.output)

      const bells = [
        { freq: 1046.5, time: 0, dur: 0.28 },
        { freq: 1318.5, time: 0.12, dur: 0.35 },
        { freq: 1568, time: 0.24, dur: 0.4 },
      ]
      bells.forEach(b => {
        const lp = this.createFilter(ctx, 'lowpass', 6000, 1.2)
        lp.connect(this.output)
        lp.connect(reverb)
        lp.connect(delay.dry)
        
        this.playDetunedOsc(ctx, { type: 'sine', freq: b.freq, start: now + b.time, stop: now + b.time + b.dur, vol: 0.12, detune: 4, attack: 0.002, destination: lp })
        this.playOsc(ctx, { type: 'sine', freq: b.freq * 2.01, start: now + b.time, stop: now + b.time + b.dur * 0.5, vol: 0.035, destination: lp })
        this.playOsc(ctx, { type: 'sine', freq: b.freq * 3.02, start: now + b.time + 0.01, stop: now + b.time + b.dur * 0.25, vol: 0.012, destination: lp })
        this.playOsc(ctx, { type: 'sine', freq: b.freq * 4.03, start: now + b.time + 0.02, stop: now + b.time + b.dur * 0.15, vol: 0.006, destination: lp })
        this.playFMSynth(ctx, { carrierFreq: b.freq * 0.5, modFreq: b.freq, modIndex: 1.2, start: now + b.time, stop: now + b.time + b.dur * 0.4, vol: 0.025, destination: lp })
      })
      delay.wet.connect(reverb)
    } catch (err) { console.error('Sound error:', err) }
  }

  // ── Error: dissonant buzzer with gritty texture ──
  error() {
    if (!this.enabled) return
    try {
      const ctx = this.getContext()
      const now = ctx.currentTime
      const lp = this.createFilter(ctx, 'lowpass', 1000, 5)
      const saturation = this.createSaturation(ctx, 1.5)
      lp.connect(saturation)
      saturation.connect(this.output)

      this.playOsc(ctx, { type: 'sawtooth', freq: 150, freqEnd: 100, start: now, stop: now + 0.2, vol: 0.1, destination: lp })
      this.playOsc(ctx, { type: 'square', freq: 160, freqEnd: 110, start: now, stop: now + 0.18, vol: 0.06, destination: lp })
      this.playOsc(ctx, { type: 'square', freq: 145, freqEnd: 95, start: now + 0.05, stop: now + 0.22, vol: 0.05, destination: lp })
      this.playOsc(ctx, { type: 'sine', freq: 100, freqEnd: 60, start: now + 0.08, stop: now + 0.25, vol: 0.12, destination: lp })
      this.createNoiseBurst(ctx, now, 0.05, 0.06, 'brown', lp)
    } catch (err) { console.error('Sound error:', err) }
  }

  // ── Screen share start: digital sweep with sparkle ──
  screenShareStart() {
    if (!this.enabled) return
    try {
      const ctx = this.getContext()
      const now = ctx.currentTime
      const reverb = this.createReverb(ctx, 1.8, 0.45)
      const reverbGain = ctx.createGain()
      reverbGain.gain.value = 0.2
      const delay = this.createDelay(ctx, 0.08, 0.2)
      reverb.connect(reverbGain)
      reverbGain.connect(this.output)

      const lp = this.createFilter(ctx, 'lowpass', 2500, 1.2)
      lp.frequency.setValueAtTime(2500, now)
      lp.frequency.exponentialRampToValueAtTime(9000, now + 0.3)
      lp.connect(this.output)
      lp.connect(reverb)
      lp.connect(delay.dry)

      this.playDetunedOsc(ctx, { type: 'sine', freq: 440, freqEnd: 1396.91, start: now, stop: now + 0.22, vol: 0.14, detune: 4, destination: lp })
      this.playDetunedOsc(ctx, { type: 'triangle', freq: 880, freqEnd: 2637, start: now + 0.03, stop: now + 0.2, vol: 0.07, detune: 3, destination: lp })
      this.playOsc(ctx, { type: 'sine', freq: 1396.91, freqEnd: 2093, start: now + 0.15, stop: now + 0.35, vol: 0.1, attack: 0.008, destination: lp })
      this.playFMSynth(ctx, { carrierFreq: 1174.66, modFreq: 2349.32, modIndex: 2.5, start: now + 0.08, stop: now + 0.25, vol: 0.045, destination: lp })
      this.playOsc(ctx, { type: 'triangle', freq: 2349.32, start: now + 0.1, stop: now + 0.22, vol: 0.03, destination: lp })
      this.createNoiseBurst(ctx, now + 0.12, 0.025, 0.025, 'pink', lp)
      delay.wet.connect(reverb)
    } catch (err) { console.error('Sound error:', err) }
  }

  // ── Screen share stop: descending digital sweep ──
  screenShareStop() {
    if (!this.enabled) return
    try {
      const ctx = this.getContext()
      const now = ctx.currentTime
      const reverb = this.createReverb(ctx, 1.5, 0.35)
      const reverbGain = ctx.createGain()
      reverbGain.gain.value = 0.15
      const lp = this.createFilter(ctx, 'lowpass', 7000, 1.5)
      lp.frequency.setValueAtTime(7000, now)
      lp.frequency.exponentialRampToValueAtTime(600, now + 0.25)
      lp.connect(this.output)
      lp.connect(reverb)
      reverb.connect(reverbGain)
      reverbGain.connect(this.output)

      this.playDetunedOsc(ctx, { type: 'sine', freq: 1568, freqEnd: 440, start: now, stop: now + 0.22, vol: 0.14, detune: 4, destination: lp })
      this.playDetunedOsc(ctx, { type: 'triangle', freq: 783.99, freqEnd: 220, start: now + 0.02, stop: now + 0.2, vol: 0.07, detune: 3, destination: lp })
      this.playOsc(ctx, { type: 'sine', freq: 1046.5, freqEnd: 349.23, start: now + 0.05, stop: now + 0.18, vol: 0.05, destination: lp })
      this.playFMSynth(ctx, { carrierFreq: 600, modFreq: 300, modIndex: 2, start: now, stop: now + 0.15, vol: 0.04, destination: lp })
      this.createNoiseBurst(ctx, now, 0.02, 0.035, 'pink', lp)
    } catch (err) { console.error('Sound error:', err) }
  }

  // ── Camera on: bright chirp with presence ──
  cameraOn() {
    if (!this.enabled) return
    try {
      const ctx = this.getContext()
      const now = ctx.currentTime
      const lp = this.createFilter(ctx, 'lowpass', 5500, 1.5)
      const saturation = this.createSaturation(ctx, 0.4)
      const reverb = this.createReverb(ctx, 1.2, 0.25)
      const reverbGain = ctx.createGain()
      reverbGain.gain.value = 0.12
      const delay = this.createDelay(ctx, 0.06, 0.15)
      lp.connect(saturation)
      saturation.connect(this.output)
      saturation.connect(reverb)
      saturation.connect(delay.dry)
      reverb.connect(reverbGain)
      reverbGain.connect(this.output)
      delay.wet.connect(this.output)

      this.playDetunedOsc(ctx, { type: 'sine', freq: 784, freqEnd: 1318.5, start: now, stop: now + 0.08, vol: 0.16, detune: 4, attack: 0.001, destination: lp })
      this.playDetunedOsc(ctx, { type: 'sine', freq: 1318.5, freqEnd: 1760, start: now + 0.05, stop: now + 0.14, vol: 0.13, detune: 3, attack: 0.002, destination: lp })
      this.playOsc(ctx, { type: 'sine', freq: 1760, start: now + 0.1, stop: now + 0.2, vol: 0.09, attack: 0.003, destination: lp })
      this.playOsc(ctx, { type: 'triangle', freq: 392, freqEnd: 587, start: now, stop: now + 0.1, vol: 0.035, destination: lp })
      this.playFMSynth(ctx, { carrierFreq: 880, modFreq: 1760, modIndex: 2, start: now, stop: now + 0.12, vol: 0.04, destination: lp })
      this.createNoiseBurst(ctx, now, 0.01, 0.02, 'pink', lp)
    } catch (err) { console.error('Sound error:', err) }
  }

  // ── Camera off: dull thunk with weight ──
  cameraOff() {
    if (!this.enabled) return
    try {
      const ctx = this.getContext()
      const now = ctx.currentTime
      const lp = this.createFilter(ctx, 'lowpass', 1000, 3)
      const saturation = this.createSaturation(ctx, 0.6)
      const reverb = this.createReverb(ctx, 1.5, 0.3)
      const reverbGain = ctx.createGain()
      reverbGain.gain.value = 0.15
      lp.frequency.setValueAtTime(1000, now)
      lp.frequency.exponentialRampToValueAtTime(200, now + 0.12)
      lp.connect(saturation)
      saturation.connect(this.output)
      saturation.connect(reverb)
      reverb.connect(reverbGain)
      reverbGain.connect(this.output)

      this.playDetunedOsc(ctx, { type: 'sine', freq: 440, freqEnd: 220, start: now, stop: now + 0.1, vol: 0.18, detune: 4, attack: 0.001, destination: lp })
      this.playOsc(ctx, { type: 'sine', freq: 220, freqEnd: 110, start: now + 0.03, stop: now + 0.12, vol: 0.1, destination: lp })
      this.playOsc(ctx, { type: 'square', freq: 180, freqEnd: 90, start: now, stop: now + 0.06, vol: 0.035, destination: lp })
      this.playFMSynth(ctx, { carrierFreq: 120, modFreq: 60, modIndex: 2.5, start: now, stop: now + 0.1, vol: 0.05, destination: lp })
      this.createNoiseBurst(ctx, now, 0.02, 0.035, 'brown', lp)
    } catch (err) { console.error('Sound error:', err) }
  }

  // ── Success: bright major chord resolve with delay ──
  success() {
    if (!this.enabled) return
    try {
      const ctx = this.getContext()
      const now = ctx.currentTime
      const reverb = this.createReverb(ctx, 2.2, 0.55)
      const reverbGain = ctx.createGain()
      reverbGain.gain.value = 0.28
      const delay = this.createDelay(ctx, 0.1, 0.25)
      reverb.connect(reverbGain)
      reverbGain.connect(this.output)

      const freqs = [523.25, 659.25, 783.99, 1046.5]
      freqs.forEach((freq, i) => {
        const lp = this.createFilter(ctx, 'lowpass', 5000, 1)
        lp.connect(this.output)
        lp.connect(reverb)
        lp.connect(delay.dry)
        
        this.playDetunedOsc(ctx, { type: 'sine', freq, start: now + i * 0.05, stop: now + 0.5, vol: 0.09 - i * 0.012, detune: 4, attack: 0.003, destination: lp })
        this.playOsc(ctx, { type: 'sine', freq: freq * 2, start: now + i * 0.05 + 0.01, stop: now + 0.28, vol: 0.018, destination: lp })
        this.playFMSynth(ctx, { carrierFreq: freq * 0.5, modFreq: freq, modIndex: 1.5, start: now + i * 0.05, stop: now + 0.25, vol: 0.02, destination: lp })
      })
      this.createNoiseBurst(ctx, now + 0.1, 0.018, 0.012, 'pink', this.output)
      delay.wet.connect(reverb)
    } catch (err) { console.error('Sound error:', err) }
  }

  // ── Error: dissonant buzzer with gritty texture ──
  error() {
    if (!this.enabled) return
    try {
      const ctx = this.getContext()
      const now = ctx.currentTime
      const lp = this.createFilter(ctx, 'lowpass', 1000, 5)
      const saturation = this.createSaturation(ctx, 1.5)
      const delay = this.createDelay(ctx, 0.06, 0.2)
      lp.connect(saturation)
      saturation.connect(this.output)
      saturation.connect(delay.dry)
      delay.wet.connect(this.output)
      delay.feedback.connect(lp)

      this.playOsc(ctx, { type: 'sawtooth', freq: 150, freqEnd: 100, start: now, stop: now + 0.2, vol: 0.09, destination: lp })
      this.playOsc(ctx, { type: 'square', freq: 160, freqEnd: 110, start: now, stop: now + 0.18, vol: 0.05, destination: lp })
      this.playOsc(ctx, { type: 'square', freq: 145, freqEnd: 95, start: now + 0.05, stop: now + 0.22, vol: 0.04, destination: lp })
      this.playOsc(ctx, { type: 'sine', freq: 100, freqEnd: 60, start: now + 0.08, stop: now + 0.25, vol: 0.1, destination: lp })
      this.playFMSynth(ctx, { carrierFreq: 120, modFreq: 240, modIndex: 3, start: now, stop: now + 0.15, vol: 0.04, destination: lp })
      this.createNoiseBurst(ctx, now, 0.04, 0.05, 'brown', lp)
    } catch (err) { console.error('Sound error:', err) }
  }

  // ── User mentioned in DM: enhanced ping with longer sustain and delay ──
  dmMention() {
    if (!this.enabled) return
    try {
      const ctx = this.getContext()
      const now = ctx.currentTime
      const reverb = this.createReverb(ctx, 1.8, 0.4)
      const reverbGain = ctx.createGain()
      reverbGain.gain.value = 0.22
      const delay = this.createDelay(ctx, 0.12, 0.3)
      reverb.connect(reverbGain)
      reverbGain.connect(this.output)

      const lp = this.createFilter(ctx, 'lowpass', 7000, 2)
      lp.connect(this.output)
      lp.connect(reverb)
      lp.connect(delay.dry)

      this.playDetunedOsc(ctx, { type: 'sine', freq: 2093, start: now, stop: now + 0.18, vol: 0.18, detune: 4, attack: 0.001, destination: lp })
      this.playDetunedOsc(ctx, { type: 'sine', freq: 2637, start: now + 0.04, stop: now + 0.25, vol: 0.16, detune: 3, attack: 0.001, destination: lp })
      this.playOsc(ctx, { type: 'sine', freq: 3136, start: now + 0.08, stop: now + 0.32, vol: 0.1, attack: 0.001, destination: lp })
      this.playFMSynth(ctx, { carrierFreq: 1046.5, modFreq: 2093, modIndex: 3.5, start: now, stop: now + 0.2, vol: 0.07, destination: lp })
      this.playOsc(ctx, { type: 'triangle', freq: 1046.5, start: now + 0.02, stop: now + 0.12, vol: 0.03, destination: lp })
      this.createNoiseBurst(ctx, now, 0.012, 0.02, 'pink', lp)
      delay.wet.connect(reverb)
    } catch (err) { console.error('Sound error:', err) }
  }

  // ── Typing indicator: subtle clicks ──
  typing() {
    if (!this.enabled) return
    try {
      const ctx = this.getContext()
      const now = ctx.currentTime
      const bp = this.createFilter(ctx, 'bandpass', 4000, 8)
      bp.connect(this.output)

      this.createNoiseBurst(ctx, now, 0.012, 0.05, 'pink', bp)
      this.playDetunedOsc(ctx, { type: 'sine', freq: 3000, start: now, stop: now + 0.02, vol: 0.035, detune: 5, attack: 0.001, destination: bp })
    } catch (err) { console.error('Sound error:', err) }
  }

  // ── Kick from voice: descending thump ──
  voiceKick() {
    if (!this.enabled) return
    try {
      const ctx = this.getContext()
      const now = ctx.currentTime
      const lp = this.createFilter(ctx, 'lowpass', 500, 4)
      const saturation = this.createSaturation(ctx, 0.8)
      const reverb = this.createReverb(ctx, 1.8, 0.35)
      const reverbGain = ctx.createGain()
      reverbGain.gain.value = 0.18
      const delay = this.createDelay(ctx, 0.1, 0.2)
      lp.connect(saturation)
      saturation.connect(this.output)
      saturation.connect(reverb)
      saturation.connect(delay.dry)
      reverb.connect(reverbGain)
      reverbGain.connect(this.output)
      delay.wet.connect(this.output)

      this.playDetunedOsc(ctx, { type: 'sine', freq: 300, freqEnd: 80, start: now, stop: now + 0.2, vol: 0.2, detune: 4, attack: 0.001, destination: lp })
      this.playOsc(ctx, { type: 'sine', freq: 150, freqEnd: 50, start: now + 0.08, stop: now + 0.3, vol: 0.13, destination: lp })
      this.playOsc(ctx, { type: 'square', freq: 60, start: now, stop: now + 0.12, vol: 0.035, destination: lp })
      this.playFMSynth(ctx, { carrierFreq: 100, modFreq: 50, modIndex: 3, start: now, stop: now + 0.15, vol: 0.05, destination: lp })
      this.createNoiseBurst(ctx, now, 0.04, 0.05, 'brown', lp)
    } catch (err) { console.error('Sound error:', err) }
  }

  // ── Server joined: fanfare with flourish ──
  serverJoined() {
    if (!this.enabled) return
    try {
      const ctx = this.getContext()
      const now = ctx.currentTime
      const reverb = this.createReverb(ctx, 2.8, 0.75)
      const reverbGain = ctx.createGain()
      reverbGain.gain.value = 0.32
      const delay = this.createDelay(ctx, 0.12, 0.3)
      reverb.connect(reverbGain)
      reverbGain.connect(this.output)

      const fanfare = [
        { freq: 523.25, time: 0, dur: 0.22 },
        { freq: 659.25, time: 0.1, dur: 0.22 },
        { freq: 783.99, time: 0.2, dur: 0.22 },
        { freq: 1046.5, time: 0.3, dur: 0.45 },
        { freq: 1318.5, time: 0.4, dur: 0.55 },
      ]
      fanfare.forEach(n => {
        const lp = this.createFilter(ctx, 'lowpass', 5000, 1)
        lp.connect(this.output)
        lp.connect(reverb)
        lp.connect(delay.dry)
        
        this.playDetunedOsc(ctx, { type: 'sine', freq: n.freq, start: now + n.time, stop: now + n.time + n.dur, vol: 0.1, detune: 5, attack: 0.005, destination: lp })
        this.playOsc(ctx, { type: 'sine', freq: n.freq * 2, start: now + n.time + 0.01, stop: now + n.time + n.dur * 0.4, vol: 0.025, destination: lp })
        this.playFMSynth(ctx, { carrierFreq: n.freq * 0.5, modFreq: n.freq, modIndex: 1.5, start: now + n.time, stop: now + n.time + n.dur * 0.3, vol: 0.025, destination: lp })
      })
      this.createNoiseBurst(ctx, now + 0.35, 0.035, 0.018, 'pink', this.output)
      delay.wet.connect(reverb)
    } catch (err) { console.error('Sound error:', err) }
  }

  // ── Role added: upward sweep ──
  roleAdded() {
    if (!this.enabled) return
    try {
      const ctx = this.getContext()
      const now = ctx.currentTime
      const lp = this.createFilter(ctx, 'lowpass', 4500, 1.5)
      const reverb = this.createReverb(ctx, 1.5, 0.3)
      const reverbGain = ctx.createGain()
      reverbGain.gain.value = 0.15
      const delay = this.createDelay(ctx, 0.08, 0.2)
      lp.frequency.setValueAtTime(2000, now)
      lp.frequency.exponentialRampToValueAtTime(5000, now + 0.15)
      lp.connect(this.output)
      lp.connect(reverb)
      lp.connect(delay.dry)
      reverb.connect(reverbGain)
      reverbGain.connect(this.output)
      delay.wet.connect(this.output)

      this.playDetunedOsc(ctx, { type: 'sine', freq: 440, freqEnd: 880, start: now, stop: now + 0.12, vol: 0.14, detune: 4, destination: lp })
      this.playDetunedOsc(ctx, { type: 'sine', freq: 660, freqEnd: 1320, start: now + 0.04, stop: now + 0.16, vol: 0.12, detune: 3, destination: lp })
      this.playOsc(ctx, { type: 'triangle', freq: 220, freqEnd: 440, start: now, stop: now + 0.1, vol: 0.035, destination: lp })
      this.playFMSynth(ctx, { carrierFreq: 550, modFreq: 1100, modIndex: 2, start: now, stop: now + 0.12, vol: 0.035, destination: lp })
      this.createNoiseBurst(ctx, now + 0.1, 0.018, 0.018, 'pink', lp)
    } catch (err) { console.error('Sound error:', err) }
  }

  // ── Role removed: downward sweep ──
  roleRemoved() {
    if (!this.enabled) return
    try {
      const ctx = this.getContext()
      const now = ctx.currentTime
      const lp = this.createFilter(ctx, 'lowpass', 4000, 1.5)
      const reverb = this.createReverb(ctx, 1.5, 0.3)
      const reverbGain = ctx.createGain()
      reverbGain.gain.value = 0.15
      const delay = this.createDelay(ctx, 0.08, 0.2)
      lp.frequency.setValueAtTime(4000, now)
      lp.frequency.exponentialRampToValueAtTime(1500, now + 0.15)
      lp.connect(this.output)
      lp.connect(reverb)
      lp.connect(delay.dry)
      reverb.connect(reverbGain)
      reverbGain.connect(this.output)
      delay.wet.connect(this.output)

      this.playDetunedOsc(ctx, { type: 'sine', freq: 880, freqEnd: 440, start: now, stop: now + 0.12, vol: 0.12, detune: 4, destination: lp })
      this.playDetunedOsc(ctx, { type: 'sine', freq: 660, freqEnd: 330, start: now + 0.04, stop: now + 0.14, vol: 0.1, detune: 3, destination: lp })
      this.playOsc(ctx, { type: 'triangle', freq: 440, freqEnd: 220, start: now, stop: now + 0.1, vol: 0.035, destination: lp })
      this.playFMSynth(ctx, { carrierFreq: 550, modFreq: 275, modIndex: 2, start: now + 0.02, stop: now + 0.12, vol: 0.03, destination: lp })
    } catch (err) { console.error('Sound error:', err) }
  }
}

export const soundService = new SoundService()
export default soundService
