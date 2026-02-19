/**
 * SoundService — Web Audio API UI sound synthesizer
 *
 * Browser autoplay policy means an AudioContext created before the first user
 * gesture starts in the "suspended" state and cannot produce sound.  Every
 * sound method therefore goes through `_play(fn)` which:
 *
 *   1. If the context is already "running"  → calls fn(ctx) immediately.
 *   2. If the context is "suspended"         → queues fn; the context is
 *      resumed inside the very next native pointer/keyboard event (registered
 *      with `capture:true` so it fires before React's synthetic events), then
 *      the queue is flushed.
 *
 * The AudioContext and master gain chain are created lazily on the first call
 * to `_ensureContext()`, which is called both from the gesture handler and
 * from `_play`.
 *
 * Key invariants:
 *   • `this._out`  is the node every sound should connect to (= masterGain).
 *     It is set synchronously in `_ensureContext` so it is always valid when
 *     a queued `fn(ctx)` finally runs.
 *   • Queued functions receive a freshly-validated running `ctx` so
 *     `ctx.currentTime` is correct at the moment they execute.
 */
class SoundService {
  constructor() {
    this._ctx   = null   // AudioContext
    this._out   = null   // master GainNode  (the output node)
    this._comp  = null   // DynamicsCompressor

    this.enabled = true
    this.volume  = 0.2
    this.pitchShift = 0.6

    this._queue          = []     // fns waiting for first gesture
    this._gestureReady   = false  // true once context is running
    this._listenerAdded  = false  // native gesture listeners registered
    this._playingSources = []     // currently playing audio sources for UI sounds
  }

  _playUISound(freq, dur) {
    this._play((ctx) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(this._out || ctx.destination)
      osc.frequency.value = freq
      osc.type = 'sine'
      gain.gain.setValueAtTime(0.1 * this.volume, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + dur)
    })
  }

  channelSwitch() {
    if (!this.enabled) return
    this._playUISound(800, 0.05)
  }

  // ─── Public bootstrap (call once at app start) ────────────────────────────

  init() {
    this._addGestureListeners()
  }

  // ─── Private: native-event gesture listeners ─────────────────────────────
  // capture:true fires BEFORE React's synthetic event system, guaranteeing we
  // resume the AudioContext inside the same user-gesture tick that the browser
  // requires.

  _addGestureListeners() {
    if (this._listenerAdded) return
    this._listenerAdded = true

    const unlock = () => {
      this._ensureContext()
      if (!this._ctx) return

      if (this._ctx.state === 'running') {
        this._gestureReady = true
        this._flush()
        this._removeGestureListeners()
        return
      }

      // suspended → resume
      this._ctx.resume().then(() => {
        if (this._ctx.state === 'running') {
          this._gestureReady = true
          this._flush()
        }
        this._removeGestureListeners()
      }).catch(() => {
        this._removeGestureListeners()
      })
    }

    // Use multiple event types; capture:true = runs in capture phase = before
    // React's bubble-phase synthetic events = still counts as "user gesture"
    const opts = { capture: true, passive: true }
    document.addEventListener('pointerdown', unlock, opts)
    document.addEventListener('keydown',     unlock, opts)
    document.addEventListener('touchstart',  unlock, opts)

    this._unlockHandler = unlock
  }

  _removeGestureListeners() {
    if (!this._unlockHandler) return
    const opts = { capture: true }
    document.removeEventListener('pointerdown', this._unlockHandler, opts)
    document.removeEventListener('keydown',     this._unlockHandler, opts)
    document.removeEventListener('touchstart',  this._unlockHandler, opts)
    this._unlockHandler = null
  }

  // ─── Private: AudioContext lifecycle ─────────────────────────────────────

  _ensureContext() {
    if (this._ctx && this._ctx.state !== 'closed') return this._ctx

    const Cls = window.AudioContext || window.webkitAudioContext
    if (!Cls) return null

    try {
      this._ctx  = new Cls()
      this._comp = this._ctx.createDynamicsCompressor()
      this._comp.threshold.value = -12
      this._comp.knee.value      = 10
      this._comp.ratio.value     = 4
      this._comp.attack.value    = 0.003
      this._comp.release.value   = 0.15
      this._out = this._ctx.createGain()
      this._out.gain.value = this.volume
      this._out.connect(this._comp)
      this._comp.connect(this._ctx.destination)
    } catch (e) {
      console.error('[Sound] AudioContext creation failed:', e)
      return null
    }

    return this._ctx
  }

  // ─── Private: queue flush ─────────────────────────────────────────────────

  _flush() {
    const q = this._queue.splice(0)
    q.forEach(fn => {
      try { fn(this._ctx) } catch (e) { console.error('[Sound] flush error:', e) }
    })
  }

  // ─── Core dispatcher ──────────────────────────────────────────────────────
  // fn receives the running AudioContext and should use `this._out` as the
  // terminal output node.

  _stopCurrentSounds() {
    this._playingSources.forEach(source => {
      try {
        source.stop()
      } catch (e) {
      }
    })
    this._playingSources = []
  }

  _play(fn) {
    this._stopCurrentSounds()

    if (!this.enabled) return

    // Lazily ensure context + gesture listeners exist
    if (!this._listenerAdded) this._addGestureListeners()
    this._ensureContext()

    if (!this._ctx) return  // no WebAudio support

    if (this._ctx.state === 'running') {
      // Hot path — play immediately
      try { fn(this._ctx) } catch (e) { console.error('[Sound]', e) }
      return
    }

    // Context suspended (pre-gesture) — queue the function.
    // Also try a programmatic resume; it will be a no-op until the browser
    // allows it, but on some browsers a previous gesture is enough.
    this._queue.push(fn)
    this._ctx.resume().then(() => {
      if (this._ctx.state === 'running' && this._queue.length) {
        this._gestureReady = true
        this._flush()
        this._removeGestureListeners()
      }
    }).catch(() => {})
  }

  // ─── Settings ─────────────────────────────────────────────────────────────

  setEnabled(v) { this.enabled = v }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v))
    if (this._out) this._out.gain.value = this.volume
  }

  // ─── DSP helpers ──────────────────────────────────────────────────────────
  // All helpers accept `out` as the destination node so they stay independent
  // of `this._out` lookups inside the synthesis callbacks.

  _filter(ctx, type, freq, Q = 1) {
    const f = ctx.createBiquadFilter()
    f.type = type; f.frequency.value = freq; f.Q.value = Q
    return f
  }

  _gain(ctx, v) {
    const g = ctx.createGain(); g.gain.value = v; return g
  }

  _reverb(ctx, decay = 1.5, dur = 0.5) {
    const sr = ctx.sampleRate, len = sr * dur
    const buf = ctx.createBuffer(2, len, sr)
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch)
      for (let i = 0; i < len; i++) {
        const t = i / sr, e = Math.pow(1 - t / dur, decay * 2)
        d[i] = (Math.random() * 2 - 1) * e
      }
    }
    const c = ctx.createConvolver(); c.buffer = buf; return c
  }

  _delay(ctx, time = 0.15, fb = 0.25) {
    const d = ctx.createDelay(5); d.delayTime.value = time
    const f = this._gain(ctx, fb)
    const w = this._gain(ctx, 0.6)
    d.connect(w); f.connect(d)
    return { node: d, feedback: f, wet: w }
  }

  _ambient(ctx, freq, start, dur, vol, attack = 0.1) {
    const g = ctx.createGain()
    const end = start + dur
    g.gain.setValueAtTime(0.0001, start)
    g.gain.linearRampToValueAtTime(vol, start + attack)
    g.gain.setValueAtTime(vol, start + 1)
    g.gain.exponentialRampToValueAtTime(0.0001, end)
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = freq
    osc.connect(g)
    osc.start(start)
    osc.stop(end + 0.1)
    return g
  }

  _osc(ctx, { type = 'sine', freq, freqEnd, start, dur, vol = 0.2, attack = 0.005, out }) {
    const osc = ctx.createOscillator()
    const g   = ctx.createGain()
    const end = start + dur
    osc.type = type
    osc.frequency.setValueAtTime(freq, start)
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), end)
    g.gain.setValueAtTime(0.0001, start)
    g.gain.linearRampToValueAtTime(vol, start + attack)
    g.gain.setValueAtTime(vol, Math.max(start + attack, end - 0.015))
    g.gain.exponentialRampToValueAtTime(0.0001, end)
    osc.connect(g); g.connect(out)
    osc.start(start); osc.stop(end + 0.05)
    this._playingSources.push(osc)
  }

  _detunedOsc(ctx, { type = 'sine', freq, freqEnd, start, dur, vol = 0.2, detune = 4, attack = 0.005, out }) {
    ;[-detune, 0, detune].forEach((d, i) => {
      const vols = [0.4, 1.0, 0.4]
      this._osc(ctx, { type, freq, freqEnd, start, dur, vol: vol * vols[i], attack, out })
    })
  }

  _fm(ctx, { carr, mod, idx, start, dur, vol = 0.12, out }) {
    const carrier = ctx.createOscillator()
    const modOsc  = ctx.createOscillator()
    const modGain = ctx.createGain()
    const g       = ctx.createGain()
    carrier.frequency.value = carr
    modOsc.frequency.value  = mod
    modGain.gain.value      = carr * idx
    modOsc.connect(modGain); modGain.connect(carrier.frequency)
    carrier.connect(g); g.connect(out)
    const end = start + dur
    g.gain.setValueAtTime(0.0001, start)
    g.gain.linearRampToValueAtTime(vol, start + 0.005)
    g.gain.exponentialRampToValueAtTime(0.0001, end)
    carrier.start(start); modOsc.start(start)
    carrier.stop(end + 0.05); modOsc.stop(end + 0.05)
  }

  _noise(ctx, { start, dur, vol = 0.05, type = 'white', out }) {
    const n   = Math.ceil(ctx.sampleRate * dur)
    const buf = ctx.createBuffer(1, n, ctx.sampleRate)
    const d   = buf.getChannelData(0)
    if (type === 'pink') {
      let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0
      for (let i=0;i<n;i++){const w=Math.random()*2-1;b0=.99886*b0+w*.0555179;b1=.99332*b1+w*.0750759;b2=.969*b2+w*.153852;b3=.8665*b3+w*.3104856;b4=.55*b4+w*.5329522;b5=-.7616*b5-w*.016898;d[i]=(b0+b1+b2+b3+b4+b5+b6+w*.5362)*.11;b6=w*.115926}
    } else if (type === 'brown') {
      let last=0; for(let i=0;i<n;i++){const w=Math.random()*2-1;d[i]=(last+.02*w)/1.02;last=d[i];d[i]*=3.5}
    } else {
      for (let i=0;i<n;i++) d[i]=Math.random()*2-1
    }
    const src = ctx.createBufferSource(); src.buffer = buf
    const g   = ctx.createGain()
    const hp  = this._filter(ctx, 'highpass', 2000, 0.5)
    src.connect(hp); hp.connect(g); g.connect(out)
    g.gain.setValueAtTime(vol, start)
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur)
    src.start(start); src.stop(start + dur + 0.01)
    this._playingSources.push(src)
  }

  _sat(ctx, k = 1) {
    const s = ctx.createWaveShaper()
    const c = new Float32Array(256)
    for (let i=0;i<256;i++){const x=(i-128)/128;c[i]=(Math.PI*k*x)/(Math.PI*k*Math.abs(x)+1)}
    s.curve = c; s.oversample = '4x'; return s
  }

  // ─── Sound methods ────────────────────────────────────────────────────────

  messageReceived() {
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 4, 4)
      const dly = this._delay(ctx, 0.15, 0.7)
      const rg = this._gain(ctx, 0.08)
      const dg = this._gain(ctx, 0.7)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [174.61, 220, 261.63]
      notes.forEach((freq, i) => {
        const g = this._ambient(ctx, freq, t + i * 0.08, 0.3, 0.035, 0.05)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  dmReceived() {
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 4, 4)
      const dly = this._delay(ctx, 0.15, 0.7)
      const rg = this._gain(ctx, 0.08)
      const dg = this._gain(ctx, 0.7)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [196, 246.94, 293.66]
      notes.forEach((freq, i) => {
        const g = this._ambient(ctx, freq, t + i * 0.08, 0.3, 0.032, 0.05)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  mention() {
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 4, 4)
      const dly = this._delay(ctx, 0.15, 0.7)
      const rg = this._gain(ctx, 0.08)
      const dg = this._gain(ctx, 0.7)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [261.63, 329.63, 392]
      notes.forEach((freq, i) => {
        const g = this._ambient(ctx, freq, t + i * 0.08, 0.3, 0.03, 0.05)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  dmMention() {
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 4, 4)
      const dly = this._delay(ctx, 0.15, 0.7)
      const rg = this._gain(ctx, 0.08)
      const dg = this._gain(ctx, 0.7)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [220, 277.18, 329.63]
      notes.forEach((freq, i) => {
        const g = this._ambient(ctx, freq, t + i * 0.08, 0.3, 0.03, 0.05)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  callJoin() {
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 2, 2)
      const dly = this._delay(ctx, 0.05, 0.4)
      const rg = this._gain(ctx, 0.04)
      const dg = this._gain(ctx, 0.4)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [293.66]
      notes.forEach((freq) => {
        const g = this._ambient(ctx, freq, t, 0.08, 0.025, 0.01)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  callConnected() {
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 2, 2)
      const dly = this._delay(ctx, 0.05, 0.4)
      const rg = this._gain(ctx, 0.04)
      const dg = this._gain(ctx, 0.4)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [440]
      notes.forEach((freq) => {
        const g = this._ambient(ctx, freq, t, 0.08, 0.025, 0.01)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  callLeft() {
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 2, 2)
      const dly = this._delay(ctx, 0.05, 0.4)
      const rg = this._gain(ctx, 0.04)
      const dg = this._gain(ctx, 0.4)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [220]
      notes.forEach((freq) => {
        const g = this._ambient(ctx, freq, t, 0.08, 0.025, 0.01)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  callEnded() {
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 2, 2)
      const dly = this._delay(ctx, 0.05, 0.4)
      const rg = this._gain(ctx, 0.04)
      const dg = this._gain(ctx, 0.4)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [196]
      notes.forEach((freq) => {
        const g = this._ambient(ctx, freq, t, 0.08, 0.02, 0.01)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  callDeclined() {
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 2, 2)
      const dly = this._delay(ctx, 0.05, 0.4)
      const rg = this._gain(ctx, 0.04)
      const dg = this._gain(ctx, 0.4)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [185]
      notes.forEach((freq) => {
        const g = this._ambient(ctx, freq, t, 0.08, 0.02, 0.01)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  userJoined() {
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 2, 2)
      const dly = this._delay(ctx, 0.05, 0.4)
      const rg = this._gain(ctx, 0.04)
      const dg = this._gain(ctx, 0.4)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [392]
      notes.forEach((freq) => {
        const g = this._ambient(ctx, freq, t, 0.08, 0.02, 0.01)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  userLeft() {
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 2, 2)
      const dly = this._delay(ctx, 0.05, 0.4)
      const rg = this._gain(ctx, 0.04)
      const dg = this._gain(ctx, 0.4)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [330]
      notes.forEach((freq) => {
        const g = this._ambient(ctx, freq, t, 0.08, 0.02, 0.01)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  mute() {
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 2, 2)
      const dly = this._delay(ctx, 0.05, 0.4)
      const rg = this._gain(ctx, 0.04)
      const dg = this._gain(ctx, 0.4)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [146.83]
      notes.forEach((freq) => {
        const g = this._ambient(ctx, freq, t, 0.08, 0.015, 0.01)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  unmute() {
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 2, 2)
      const dly = this._delay(ctx, 0.05, 0.4)
      const rg = this._gain(ctx, 0.04)
      const dg = this._gain(ctx, 0.4)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [220]
      notes.forEach((freq) => {
        const g = this._ambient(ctx, freq, t, 0.08, 0.02, 0.01)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  deafen() {
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 2, 2)
      const dly = this._delay(ctx, 0.05, 0.4)
      const rg = this._gain(ctx, 0.04)
      const dg = this._gain(ctx, 0.4)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [130.81]
      notes.forEach((freq) => {
        const g = this._ambient(ctx, freq, t, 0.08, 0.015, 0.01)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  undeafen() {
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 2, 2)
      const dly = this._delay(ctx, 0.05, 0.4)
      const rg = this._gain(ctx, 0.04)
      const dg = this._gain(ctx, 0.4)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [246.94]
      notes.forEach((freq) => {
        const g = this._ambient(ctx, freq, t, 0.08, 0.02, 0.01)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  screenShareStart() {
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 2, 2)
      const dly = this._delay(ctx, 0.05, 0.4)
      const rg = this._gain(ctx, 0.04)
      const dg = this._gain(ctx, 0.4)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [523.25]
      notes.forEach((freq) => {
        const g = this._ambient(ctx, freq, t, 0.08, 0.02, 0.01)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  screenShareStop() {
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 2, 2)
      const dly = this._delay(ctx, 0.05, 0.4)
      const rg = this._gain(ctx, 0.04)
      const dg = this._gain(ctx, 0.4)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [392]
      notes.forEach((freq) => {
        const g = this._ambient(ctx, freq, t, 0.08, 0.02, 0.01)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  cameraOn() {
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 2, 2)
      const dly = this._delay(ctx, 0.05, 0.4)
      const rg = this._gain(ctx, 0.04)
      const dg = this._gain(ctx, 0.4)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [440]
      notes.forEach((freq) => {
        const g = this._ambient(ctx, freq, t, 0.08, 0.02, 0.01)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  cameraOff() {
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 2, 2)
      const dly = this._delay(ctx, 0.05, 0.4)
      const rg = this._gain(ctx, 0.04)
      const dg = this._gain(ctx, 0.4)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [330]
      notes.forEach((freq) => {
        const g = this._ambient(ctx, freq, t, 0.08, 0.02, 0.01)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  voiceKick() {
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 2, 2)
      const dly = this._delay(ctx, 0.05, 0.4)
      const rg = this._gain(ctx, 0.04)
      const dg = this._gain(ctx, 0.4)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [98]
      notes.forEach((freq) => {
        const g = this._ambient(ctx, freq, t, 0.08, 0.015, 0.01)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  callConnected() {
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 4, 4)
      const dly = this._delay(ctx, 0.15, 0.7)
      const rg = this._gain(ctx, 0.08)
      const dg = this._gain(ctx, 0.7)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [196, 246.94, 293.66]
      notes.forEach((freq, i) => {
        const g = this._ambient(ctx, freq, t + i * 0.08, 0.3, 0.03, 0.05)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  callLeft() {
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 4, 4)
      const dly = this._delay(ctx, 0.15, 0.7)
      const rg = this._gain(ctx, 0.08)
      const dg = this._gain(ctx, 0.7)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [246.94, 196, 146.83]
      notes.forEach((freq, i) => {
        const g = this._ambient(ctx, freq, t + i * 0.08, 0.3, 0.03, 0.05)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  callEnded() {
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 4, 4)
      const dly = this._delay(ctx, 0.15, 0.7)
      const rg = this._gain(ctx, 0.08)
      const dg = this._gain(ctx, 0.7)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [196, 185]
      notes.forEach((freq, i) => {
        const g = this._ambient(ctx, freq, t + i * 0.08, 0.3, 0.03, 0.05)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  callDeclined() {
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 4, 4)
      const dly = this._delay(ctx, 0.15, 0.7)
      const rg = this._gain(ctx, 0.08)
      const dg = this._gain(ctx, 0.7)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [220, 185, 146.83]
      notes.forEach((freq, i) => {
        const g = this._ambient(ctx, freq, t + i * 0.08, 0.3, 0.028, 0.05)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  callRingtone() {
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 2, 2)
      const dly = this._delay(ctx, 0.05, 0.4)
      const rg = this._gain(ctx, 0.04)
      const dg = this._gain(ctx, 0.4)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [440]
      ;[0, 0.1, 0.2].forEach((dt) => {
        notes.forEach((freq) => {
          const g = this._ambient(ctx, freq, t + dt, 0.08, 0.015, 0.01)
          g.connect(out); g.connect(dly.node); g.connect(rev)
        })
      })
    })
  }

  serverJoined() {
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 2, 2)
      const dly = this._delay(ctx, 0.05, 0.4)
      const rg = this._gain(ctx, 0.04)
      const dg = this._gain(ctx, 0.4)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [523.25]
      notes.forEach((freq) => {
        const g = this._ambient(ctx, freq, t, 0.08, 0.02, 0.01)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  roleAdded() {
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 2, 2)
      const dly = this._delay(ctx, 0.05, 0.4)
      const rg = this._gain(ctx, 0.04)
      const dg = this._gain(ctx, 0.4)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [440]
      notes.forEach((freq) => {
        const g = this._ambient(ctx, freq, t, 0.08, 0.02, 0.01)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  roleRemoved() {
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 2, 2)
      const dly = this._delay(ctx, 0.05, 0.4)
      const rg = this._gain(ctx, 0.04)
      const dg = this._gain(ctx, 0.4)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [330]
      notes.forEach((freq) => {
        const g = this._ambient(ctx, freq, t, 0.08, 0.015, 0.01)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  notification() {
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 2, 2)
      const dly = this._delay(ctx, 0.05, 0.4)
      const rg = this._gain(ctx, 0.04)
      const dg = this._gain(ctx, 0.4)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [523.25]
      notes.forEach((freq) => {
        const g = this._ambient(ctx, freq, t, 0.08, 0.02, 0.01)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  error() {
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 2, 2)
      const dly = this._delay(ctx, 0.05, 0.4)
      const rg = this._gain(ctx, 0.04)
      const dg = this._gain(ctx, 0.4)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [130.81]
      notes.forEach((freq) => {
        const g = this._ambient(ctx, freq, t, 0.08, 0.015, 0.01)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  success() {
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 2, 2)
      const dly = this._delay(ctx, 0.05, 0.4)
      const rg = this._gain(ctx, 0.04)
      const dg = this._gain(ctx, 0.4)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [523.25]
      notes.forEach((freq) => {
        const g = this._ambient(ctx, freq, t, 0.08, 0.02, 0.01)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  typing() {
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 1, 1)
      const dly = this._delay(ctx, 0.03, 0.3)
      const rg = this._gain(ctx, 0.02)
      const dg = this._gain(ctx, 0.3)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const g = this._ambient(ctx, 800, t, 0.05, 0.008, 0.005)
      g.connect(out); g.connect(dly.node); g.connect(rev)
    })
  }

  messageSent() {
  }
}

export const soundService = new SoundService()
export default soundService