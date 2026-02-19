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
    this.volume  = 0.25

    this._queue          = []     // fns waiting for first gesture
    this._gestureReady   = false  // true once context is running
    this._listenerAdded  = false  // native gesture listeners registered
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

  _play(fn) {
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
        d[i] = (Math.random() * 2 - 1) * e * 0.9
      }
    }
    const c = ctx.createConvolver(); c.buffer = buf; return c
  }

  _delay(ctx, time = 0.15, fb = 0.25) {
    const d = ctx.createDelay(1); d.delayTime.value = time
    const f = this._gain(ctx, fb)
    const w = this._gain(ctx, 0.3)
    d.connect(w); f.connect(d)
    return { node: d, feedback: f, wet: w }
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
  }

  _sat(ctx, k = 1) {
    const s = ctx.createWaveShaper()
    const c = new Float32Array(256)
    for (let i=0;i<256;i++){const x=(i-128)/128;c[i]=(Math.PI*k*x)/(Math.PI*k*Math.abs(x)+1)}
    s.curve = c; s.oversample = '4x'; return s
  }

  // ─── Sound methods ────────────────────────────────────────────────────────

  // Message sent — liquid pop
  messageSent() {
    this._play((ctx) => {
      const t   = ctx.currentTime
      const out = this._out
      const lp  = this._filter(ctx, 'lowpass', 6000, 1.5)
      const rev = this._reverb(ctx, 1.2, 0.2)
      const rg  = this._gain(ctx, 0.12)
      lp.connect(out); lp.connect(rev); rev.connect(rg); rg.connect(out)
      this._detunedOsc(ctx, { freq:1046, freqEnd:1568, start:t,      dur:0.08, vol:0.14, detune:5, out:lp })
      this._detunedOsc(ctx, { freq:1568, freqEnd:2093, start:t+.02,  dur:0.09, vol:0.08, detune:4, out:lp })
      this._osc(ctx,         { freq:523,  freqEnd:784,  start:t,      dur:0.09, vol:0.04, type:'triangle', out:lp })
      this._fm(ctx,          { carr:523,  mod:1046, idx:1.5,          start:t,  dur:0.06, vol:0.05, out:lp })
      this._noise(ctx,       { start:t, dur:0.018, vol:0.01, type:'pink', out:lp })
    })
  }

  // Message received — hollow pop
  messageReceived() {
    this._play((ctx) => {
      const t   = ctx.currentTime
      const out = this._out
      const lp  = this._filter(ctx, 'lowpass', 3200, 2)
      const rev = this._reverb(ctx, 1.5, 0.3)
      const rg  = this._gain(ctx, 0.18)
      lp.connect(out); lp.connect(rev); rev.connect(rg); rg.connect(out)
      this._fm(ctx,         { carr:440, mod:880, idx:2.5, start:t,      dur:0.14, vol:0.09, out:lp })
      this._detunedOsc(ctx, { freq:880, freqEnd:587,      start:t+.01,  dur:0.11, vol:0.08, detune:3, out:lp })
      this._osc(ctx,        { freq:220,                   start:t,      dur:0.10, vol:0.03, type:'triangle', out:lp })
      this._noise(ctx,      { start:t, dur:0.012, vol:0.015, type:'brown', out:lp })
    })
  }

  // DM received — two-note chime
  dmReceived() {
    this._play((ctx) => {
      const t   = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 1.5, 0.4)
      const rg  = this._gain(ctx, 0.14)
      rev.connect(rg); rg.connect(out)
      ;[{f:659, dt:0},{f:784, dt:.18}].forEach(({f,dt}) => {
        const lp = this._filter(ctx, 'lowpass', 3000, 1)
        lp.connect(out); lp.connect(rev)
        this._osc(ctx, { freq:f,   start:t+dt, dur:0.5, vol:0.08, out:lp })
        this._osc(ctx, { freq:f*2, start:t+dt, dur:0.2, vol:0.02, out:lp })
        this._fm(ctx,  { carr:f*.5, mod:f, idx:1, start:t+dt, dur:0.25, vol:0.025, out:lp })
      })
    })
  }

  // @mention — sharp ping
  mention() {
    this._play((ctx) => {
      const t   = ctx.currentTime
      const out = this._out
      const bp  = this._filter(ctx, 'bandpass', 2500, 3)
      const rev = this._reverb(ctx, 1.2, 0.25)
      const rg  = this._gain(ctx, 0.12)
      bp.connect(out); bp.connect(rev); rev.connect(rg); rg.connect(out)
      this._detunedOsc(ctx, { freq:1760, start:t,      dur:0.10, vol:0.16, detune:4, attack:0.001, out:bp })
      this._detunedOsc(ctx, { freq:2217, start:t+.03,  dur:0.13, vol:0.12, detune:3, attack:0.001, out:bp })
      this._osc(ctx,        { freq:2794, start:t+.06,  dur:0.16, vol:0.06, attack:0.001, out:bp })
      this._fm(ctx,         { carr:880, mod:1320, idx:3, start:t, dur:0.12, vol:0.04, out:bp })
      this._noise(ctx,      { start:t, dur:0.01, vol:0.015, type:'pink', out:bp })
    })
  }

  // DM @mention — stronger ping
  dmMention() {
    this._play((ctx) => {
      const t   = ctx.currentTime
      const out = this._out
      const lp  = this._filter(ctx, 'lowpass', 7000, 2)
      const rev = this._reverb(ctx, 1.8, 0.38)
      const rg  = this._gain(ctx, 0.20)
      const del = this._delay(ctx, 0.12, 0.28)
      lp.connect(out); lp.connect(rev); rev.connect(rg); rg.connect(out)
      lp.connect(del.node); del.wet.connect(out)
      this._detunedOsc(ctx, { freq:2093, start:t,      dur:0.18, vol:0.16, detune:4, attack:0.001, out:lp })
      this._detunedOsc(ctx, { freq:2637, start:t+.04,  dur:0.22, vol:0.14, detune:3, attack:0.001, out:lp })
      this._osc(ctx,        { freq:3136, start:t+.08,  dur:0.28, vol:0.09, attack:0.001, out:lp })
      this._fm(ctx,         { carr:1046, mod:2093, idx:3, start:t, dur:0.20, vol:0.06, out:lp })
      this._noise(ctx,      { start:t, dur:0.012, vol:0.018, type:'pink', out:lp })
    })
  }

  // Self joins voice — ascending arpeggio (C E G C E)
  callJoin() {
    this._play((ctx) => {
      const t   = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 2.5, 0.7)
      const rg  = this._gain(ctx, 0.30)
      const del = this._delay(ctx, 0.10, 0.22)
      rev.connect(rg); rg.connect(out)
      ;[523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((freq, i) => {
        const st = t + i * 0.07
        const lp = this._filter(ctx, 'lowpass', 4500, 1.2)
        lp.connect(out); lp.connect(rev); lp.connect(del.node); del.wet.connect(out)
        this._detunedOsc(ctx, { freq, start:st, dur:0.42 - i*.03, vol:0.10 - i*.008, detune:5, attack:0.006, out:lp })
        this._osc(ctx,        { freq:freq*.5, start:st, dur:0.26, vol:0.022, type:'triangle', out:lp })
        this._fm(ctx,         { carr:freq, mod:freq*2, idx:1.2, start:st, dur:0.20, vol:0.022, out:lp })
      })
      this._noise(ctx, { start:t, dur:0.015, vol:0.012, type:'pink', out })
    })
  }

  // Microphone acquired / voice connected
  callConnected() {
    this._play((ctx) => {
      const t   = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 1.8, 0.45)
      const rg  = this._gain(ctx, 0.22)
      rev.connect(rg); rg.connect(out)
      ;[[659.25,830.61,987.77],[880,1108,1318,1568]].forEach((freqs, ci) => {
        const dt = ci * 0.13
        freqs.forEach((freq, fi) => {
          const lp = this._filter(ctx, 'lowpass', 5000, 1)
          lp.connect(out); lp.connect(rev)
          this._detunedOsc(ctx, { freq, start:t+dt, dur:0.22+ci*.1, vol:0.09-fi*.01, detune:3, attack:0.004, out:lp })
        })
      })
      this._noise(ctx, { start:t+.13, dur:0.022, vol:0.012, type:'pink', out })
    })
  }

  // Self leaves voice — descending minor arpeggio
  callLeft() {
    this._play((ctx) => {
      const t   = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 2.8, 0.65)
      const rg  = this._gain(ctx, 0.26)
      rev.connect(rg); rg.connect(out)
      ;[
        {freq:698, freqEnd:523, dt:0,   dur:.28},
        {freq:587, freqEnd:392, dt:.14, dur:.38},
        {freq:440, freqEnd:330, dt:.28, dur:.44},
      ].forEach(({freq,freqEnd,dt,dur}) => {
        const lp = this._filter(ctx, 'lowpass', 3000, 1.5)
        lp.connect(out); lp.connect(rev)
        this._detunedOsc(ctx, { freq, freqEnd, start:t+dt, dur, vol:0.10, detune:5, attack:0.005, out:lp })
        this._osc(ctx,        { freq:freq*.5, freqEnd:freqEnd*.5, start:t+dt, dur:dur*.6, vol:0.022, type:'triangle', out:lp })
        this._fm(ctx,         { carr:freq*.5, mod:freq, idx:1.5, start:t+dt, dur:dur*.3, vol:0.025, out:lp })
      })
    })
  }

  // Call ended (hang-up tone)
  callEnded() {
    this._play((ctx) => {
      const t   = ctx.currentTime
      const out = this._out
      const lp  = this._filter(ctx, 'lowpass', 3000, 1.5)
      lp.connect(out)
      this._osc(ctx, { freq:350, start:t,      dur:.15, vol:0.12, out:lp })
      this._osc(ctx, { freq:350, start:t+.18,  dur:.14, vol:0.12, out:lp })
      this._osc(ctx, { freq:175, start:t,      dur:.25, vol:0.03, type:'triangle', out:lp })
    })
  }

  // Call declined
  callDeclined() {
    this._play((ctx) => {
      const t   = ctx.currentTime
      const out = this._out
      const lp  = this._filter(ctx, 'lowpass', 2500, 2)
      lp.connect(out)
      this._osc(ctx, { freq:523, freqEnd:261, start:t,      dur:.20, vol:0.13, out:lp })
      this._osc(ctx, { freq:392, freqEnd:196, start:t+.10,  dur:.26, vol:0.11, out:lp })
      this._noise(ctx, { start:t, dur:.035, vol:0.022, type:'brown', out:lp })
    })
  }

  // Incoming call ringtone
  callRingtone() {
    this._play((ctx) => {
      const t   = ctx.currentTime
      const out = this._out
      const lp  = this._filter(ctx, 'lowpass', 4500, 1)
      const hp  = this._filter(ctx, 'highpass', 300, 0.5)
      lp.connect(hp); hp.connect(out)
      ;[0, 0.42, 0.84, 1.26, 1.68].forEach(dt => {
        this._osc(ctx, { freq:1000, start:t+dt,       dur:.15, vol:0.13, attack:0.002, out:lp })
        this._osc(ctx, { freq:1500, start:t+dt+.02,   dur:.11, vol:0.07, attack:0.002, out:lp })
        this._osc(ctx, { freq:500,  start:t+dt,       dur:.09, vol:0.04, type:'triangle', out:lp })
        this._fm(ctx,  { carr:800, mod:1600, idx:2,   start:t+dt+.01, dur:.09, vol:0.04, out:lp })
      })
    })
  }

  // Another user joins the voice channel you're in
  userJoined() {
    this._play((ctx) => {
      const t   = ctx.currentTime
      const out = this._out
      const lp  = this._filter(ctx, 'lowpass', 5000, 1.5)
      const sat = this._sat(ctx, 0.3)
      const rev = this._reverb(ctx, 1.0, 0.22)
      const rg  = this._gain(ctx, 0.10)
      lp.connect(sat); sat.connect(out); sat.connect(rev); rev.connect(rg); rg.connect(out)
      this._detunedOsc(ctx, { freq:587, start:t,      dur:.09, vol:0.15, detune:4, attack:0.002, out:lp })
      this._detunedOsc(ctx, { freq:784, start:t+.06,  dur:.14, vol:0.17, detune:3, attack:0.002, out:lp })
      this._osc(ctx,        { freq:1174,start:t+.11,  dur:.18, vol:0.09, attack:0.003, out:lp })
      this._fm(ctx,         { carr:440, mod:880, idx:2, start:t, dur:.10, vol:0.04, out:lp })
      this._noise(ctx,      { start:t, dur:.01, vol:0.015, type:'pink', out:lp })
    })
  }

  // Another user leaves the voice channel you're in
  userLeft() {
    this._play((ctx) => {
      const t   = ctx.currentTime
      const out = this._out
      const lp  = this._filter(ctx, 'lowpass', 4000, 1.5)
      const rev = this._reverb(ctx, 1.3, 0.28)
      const rg  = this._gain(ctx, 0.13)
      lp.connect(out); lp.connect(rev); rev.connect(rg); rg.connect(out)
      this._detunedOsc(ctx, { freq:698, start:t,      dur:.10, vol:0.13, detune:3, attack:0.002, out:lp })
      this._detunedOsc(ctx, { freq:494, start:t+.07,  dur:.15, vol:0.15, detune:4, attack:0.002, out:lp })
      this._osc(ctx,        { freq:349, start:t,      dur:.12, vol:0.03, type:'triangle', out:lp })
      this._noise(ctx,      { start:t+.08, dur:.012, vol:0.010, type:'brown', out:lp })
    })
  }

  // Mute mic
  mute() {
    this._play((ctx) => {
      const t   = ctx.currentTime
      const out = this._out
      const lp  = this._filter(ctx, 'lowpass', 600, 4)
      const sat = this._sat(ctx, 0.8)
      lp.frequency.setValueAtTime(600, t)
      lp.frequency.exponentialRampToValueAtTime(150, t+.15)
      lp.connect(sat); sat.connect(out)
      this._osc(ctx, { freq:220, freqEnd:110, start:t,      dur:.15, vol:0.20, attack:0.002, out:lp })
      this._osc(ctx, { freq:110, freqEnd:55,  start:t+.05,  dur:.17, vol:0.12, out:lp })
      this._osc(ctx, { freq:80,              start:t,       dur:.08, vol:0.03, type:'square', out:lp })
      this._noise(ctx, { start:t, dur:.022, vol:0.035, type:'brown', out:lp })
    })
  }

  // Unmute mic
  unmute() {
    this._play((ctx) => {
      const t   = ctx.currentTime
      const out = this._out
      const lp  = this._filter(ctx, 'lowpass', 500, 2)
      const rev = this._reverb(ctx, 1.0, 0.18)
      const rg  = this._gain(ctx, 0.09)
      lp.frequency.setValueAtTime(500, t)
      lp.frequency.exponentialRampToValueAtTime(6000, t+.12)
      lp.connect(out); lp.connect(rev); rev.connect(rg); rg.connect(out)
      this._detunedOsc(ctx, { freq:440, freqEnd:1046, start:t,     dur:.10, vol:0.16, detune:4, attack:0.001, out:lp })
      this._detunedOsc(ctx, { freq:880, freqEnd:1568, start:t+.03, dur:.12, vol:0.09, detune:3, out:lp })
      this._fm(ctx,         { carr:660, mod:1320, idx:2, start:t, dur:.10, vol:0.04, out:lp })
      this._noise(ctx,      { start:t+.01, dur:.016, vol:0.018, type:'pink', out:lp })
    })
  }

  // Deafen headphones
  deafen() {
    this._play((ctx) => {
      const t   = ctx.currentTime
      const out = this._out
      const lp  = this._filter(ctx, 'lowpass', 400, 5)
      const sat = this._sat(ctx, 1)
      lp.connect(sat); sat.connect(out)
      this._osc(ctx, { freq:180, freqEnd:80, start:t,      dur:.15, vol:0.20, attack:0.001, out:lp })
      this._osc(ctx, { freq:120, freqEnd:60, start:t+.08,  dur:.20, vol:0.16, out:lp })
      this._osc(ctx, { freq:50,             start:t,       dur:.10, vol:0.04, type:'square', out:lp })
      this._noise(ctx, { start:t, dur:.032, vol:0.045, type:'brown', out:lp })
    })
  }

  // Undeafen
  undeafen() {
    this._play((ctx) => {
      const t   = ctx.currentTime
      const out = this._out
      const lp  = this._filter(ctx, 'lowpass', 300, 1.5)
      const rev = this._reverb(ctx, 1.8, 0.42)
      const rg  = this._gain(ctx, 0.16)
      lp.frequency.setValueAtTime(300, t)
      lp.frequency.exponentialRampToValueAtTime(7000, t+.25)
      lp.connect(out); lp.connect(rev); rev.connect(rg); rg.connect(out)
      this._detunedOsc(ctx, { freq:350,  freqEnd:1046, start:t,      dur:.18, vol:0.14, detune:4, attack:0.002, out:lp })
      this._detunedOsc(ctx, { freq:698,  freqEnd:1568, start:t+.06,  dur:.26, vol:0.11, detune:3, out:lp })
      this._osc(ctx,        { freq:1397,               start:t+.12,  dur:.32, vol:0.08, attack:0.01, out:lp })
      this._noise(ctx,      { start:t+.14, dur:.022, vol:0.016, type:'pink', out:lp })
    })
  }

  // Text channel switch
  channelSwitch() {
    this._play((ctx) => {
      const t   = ctx.currentTime
      const out = this._out
      const bp  = this._filter(ctx, 'bandpass', 3500, 6)
      const sat = this._sat(ctx, 0.4)
      bp.connect(sat); sat.connect(out)
      this._noise(ctx,      { start:t, dur:.016, vol:0.08, type:'pink', out:bp })
      this._detunedOsc(ctx, { freq:2500, freqEnd:1500, start:t, dur:.032, vol:0.06, detune:4, attack:0.001, out:bp })
      this._osc(ctx,        { freq:1200, start:t, dur:.018, vol:0.022, type:'square', out:bp })
      this._fm(ctx,         { carr:1800, mod:3600, idx:2, start:t, dur:.028, vol:0.028, out:bp })
    })
  }

  // Notification / friend request
  notification() {
    this._play((ctx) => {
      const t   = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 2.0, 0.48)
      const rg  = this._gain(ctx, 0.22)
      rev.connect(rg); rg.connect(out)
      ;[{f:1046,dt:0},{f:1318,dt:.12},{f:1568,dt:.24}].forEach(({f,dt}) => {
        const lp = this._filter(ctx, 'lowpass', 6000, 1.2)
        lp.connect(out); lp.connect(rev)
        this._detunedOsc(ctx, { freq:f,     start:t+dt,      dur:.30, vol:0.11, detune:4, attack:0.002, out:lp })
        this._osc(ctx,        { freq:f*2,   start:t+dt,      dur:.14, vol:0.03, out:lp })
        this._osc(ctx,        { freq:f*3.02,start:t+dt+.01,  dur:.07, vol:0.01, out:lp })
        this._fm(ctx,         { carr:f*.5, mod:f, idx:1.2, start:t+dt, dur:.36*.4, vol:0.022, out:lp })
      })
    })
  }

  // Error
  error() {
    this._play((ctx) => {
      const t   = ctx.currentTime
      const out = this._out
      const lp  = this._filter(ctx, 'lowpass', 1000, 5)
      const sat = this._sat(ctx, 1.5)
      lp.connect(sat); sat.connect(out)
      this._osc(ctx, { freq:150, freqEnd:100, start:t,      dur:.20, vol:0.09, type:'sawtooth', out:lp })
      this._osc(ctx, { freq:160, freqEnd:110, start:t,      dur:.18, vol:0.05, type:'square', out:lp })
      this._osc(ctx, { freq:145, freqEnd:95,  start:t+.05,  dur:.19, vol:0.04, type:'square', out:lp })
      this._osc(ctx, { freq:100, freqEnd:60,  start:t+.08,  dur:.20, vol:0.09, out:lp })
      this._fm(ctx,  { carr:120, mod:240, idx:3, start:t, dur:.15, vol:0.04, out:lp })
      this._noise(ctx, { start:t, dur:.038, vol:0.045, type:'brown', out:lp })
    })
  }

  // Success
  success() {
    this._play((ctx) => {
      const t   = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 2.0, 0.50)
      const rg  = this._gain(ctx, 0.24)
      rev.connect(rg); rg.connect(out)
      ;[523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
        const lp = this._filter(ctx, 'lowpass', 5000, 1)
        lp.connect(out); lp.connect(rev)
        this._detunedOsc(ctx, { freq, start:t+i*.05, dur:.45, vol:0.08-i*.011, detune:4, attack:0.003, out:lp })
        this._osc(ctx,        { freq:freq*2, start:t+i*.05+.01, dur:.24, vol:0.016, out:lp })
        this._fm(ctx,         { carr:freq*.5, mod:freq, idx:1.5, start:t+i*.05, dur:.22, vol:0.018, out:lp })
      })
      this._noise(ctx, { start:t+.10, dur:.016, vol:0.010, type:'pink', out })
    })
  }

  // Screen share start
  screenShareStart() {
    this._play((ctx) => {
      const t   = ctx.currentTime
      const out = this._out
      const lp  = this._filter(ctx, 'lowpass', 2500, 1.2)
      const rev = this._reverb(ctx, 1.6, 0.40)
      const rg  = this._gain(ctx, 0.18)
      lp.frequency.setValueAtTime(2500, t)
      lp.frequency.exponentialRampToValueAtTime(9000, t+.28)
      lp.connect(out); lp.connect(rev); rev.connect(rg); rg.connect(out)
      this._detunedOsc(ctx, { freq:440,  freqEnd:1397, start:t,      dur:.22, vol:0.13, detune:4, out:lp })
      this._detunedOsc(ctx, { freq:880,  freqEnd:2637, start:t+.03,  dur:.19, vol:0.06, detune:3, type:'triangle', out:lp })
      this._osc(ctx,        { freq:1397, freqEnd:2093, start:t+.14,  dur:.32, vol:0.09, attack:0.008, out:lp })
      this._noise(ctx,      { start:t+.11, dur:.022, vol:0.022, type:'pink', out:lp })
    })
  }

  // Screen share stop
  screenShareStop() {
    this._play((ctx) => {
      const t   = ctx.currentTime
      const out = this._out
      const lp  = this._filter(ctx, 'lowpass', 7000, 1.5)
      const rev = this._reverb(ctx, 1.3, 0.32)
      const rg  = this._gain(ctx, 0.13)
      lp.frequency.setValueAtTime(7000, t)
      lp.frequency.exponentialRampToValueAtTime(600, t+.24)
      lp.connect(out); lp.connect(rev); rev.connect(rg); rg.connect(out)
      this._detunedOsc(ctx, { freq:1568, freqEnd:440, start:t,      dur:.22, vol:0.13, detune:4, out:lp })
      this._detunedOsc(ctx, { freq:784,  freqEnd:220, start:t+.02,  dur:.19, vol:0.06, detune:3, type:'triangle', out:lp })
      this._osc(ctx,        { freq:1046, freqEnd:349, start:t+.05,  dur:.17, vol:0.05, out:lp })
      this._noise(ctx,      { start:t, dur:.018, vol:0.030, type:'pink', out:lp })
    })
  }

  // Camera on
  cameraOn() {
    this._play((ctx) => {
      const t   = ctx.currentTime
      const out = this._out
      const lp  = this._filter(ctx, 'lowpass', 5500, 1.5)
      const sat = this._sat(ctx, 0.35)
      const rev = this._reverb(ctx, 1.0, 0.22)
      const rg  = this._gain(ctx, 0.10)
      lp.connect(sat); sat.connect(out); sat.connect(rev); rev.connect(rg); rg.connect(out)
      this._detunedOsc(ctx, { freq:784,  freqEnd:1318, start:t,      dur:.09, vol:0.15, detune:4, attack:0.001, out:lp })
      this._detunedOsc(ctx, { freq:1318, freqEnd:1760, start:t+.06,  dur:.13, vol:0.12, detune:3, attack:0.002, out:lp })
      this._osc(ctx,        { freq:1760,               start:t+.10,  dur:.18, vol:0.08, attack:0.003, out:lp })
      this._fm(ctx,         { carr:880, mod:1760, idx:2, start:t, dur:.12, vol:0.04, out:lp })
      this._noise(ctx,      { start:t, dur:.010, vol:0.018, type:'pink', out:lp })
    })
  }

  // Camera off
  cameraOff() {
    this._play((ctx) => {
      const t   = ctx.currentTime
      const out = this._out
      const lp  = this._filter(ctx, 'lowpass', 1000, 3)
      const sat = this._sat(ctx, 0.6)
      lp.frequency.setValueAtTime(1000, t)
      lp.frequency.exponentialRampToValueAtTime(200, t+.12)
      lp.connect(sat); sat.connect(out)
      this._detunedOsc(ctx, { freq:440, freqEnd:220, start:t,      dur:.10, vol:0.16, detune:4, attack:0.001, out:lp })
      this._osc(ctx,        { freq:220, freqEnd:110, start:t+.03,  dur:.11, vol:0.09, out:lp })
      this._osc(ctx,        { freq:180, freqEnd:90,  start:t,      dur:.06, vol:0.03, type:'square', out:lp })
      this._noise(ctx,      { start:t, dur:.018, vol:0.030, type:'brown', out:lp })
    })
  }

  // Voice kick
  voiceKick() {
    this._play((ctx) => {
      const t   = ctx.currentTime
      const out = this._out
      const lp  = this._filter(ctx, 'lowpass', 500, 4)
      const sat = this._sat(ctx, 0.8)
      lp.connect(sat); sat.connect(out)
      this._detunedOsc(ctx, { freq:300, freqEnd:80, start:t,      dur:.20, vol:0.18, detune:4, attack:0.001, out:lp })
      this._osc(ctx,        { freq:150, freqEnd:50, start:t+.08,  dur:.26, vol:0.12, out:lp })
      this._osc(ctx,        { freq:60,             start:t,       dur:.12, vol:0.03, type:'square', out:lp })
      this._noise(ctx,      { start:t, dur:.036, vol:0.045, type:'brown', out:lp })
    })
  }

  // Server joined
  serverJoined() {
    this._play((ctx) => {
      const t   = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 2.5, 0.70)
      const rg  = this._gain(ctx, 0.28)
      rev.connect(rg); rg.connect(out)
      ;[
        {f:523,dt:0,  dur:.22},
        {f:659,dt:.10,dur:.22},
        {f:784,dt:.20,dur:.22},
        {f:1046,dt:.30,dur:.42},
        {f:1318,dt:.40,dur:.52},
      ].forEach(({f,dt,dur}) => {
        const lp = this._filter(ctx, 'lowpass', 5000, 1)
        lp.connect(out); lp.connect(rev)
        this._detunedOsc(ctx, { freq:f,     start:t+dt,      dur, vol:0.09, detune:5, attack:0.005, out:lp })
        this._osc(ctx,        { freq:f*2,   start:t+dt+.01,  dur:dur*.4, vol:0.022, out:lp })
        this._fm(ctx,         { carr:f*.5, mod:f, idx:1.5, start:t+dt, dur:dur*.3, vol:0.022, out:lp })
      })
      this._noise(ctx, { start:t+.32, dur:.032, vol:0.016, type:'pink', out })
    })
  }

  // Role added
  roleAdded() {
    this._play((ctx) => {
      const t   = ctx.currentTime
      const out = this._out
      const lp  = this._filter(ctx, 'lowpass', 4500, 1.5)
      lp.frequency.setValueAtTime(2000, t)
      lp.frequency.exponentialRampToValueAtTime(5000, t+.15)
      lp.connect(out)
      this._detunedOsc(ctx, { freq:440, freqEnd:880,  start:t,      dur:.12, vol:0.13, detune:4, out:lp })
      this._detunedOsc(ctx, { freq:660, freqEnd:1320, start:t+.04,  dur:.14, vol:0.11, detune:3, out:lp })
      this._fm(ctx,         { carr:550, mod:1100, idx:2, start:t, dur:.12, vol:0.032, out:lp })
      this._noise(ctx,      { start:t+.09, dur:.016, vol:0.016, type:'pink', out:lp })
    })
  }

  // Role removed
  roleRemoved() {
    this._play((ctx) => {
      const t   = ctx.currentTime
      const out = this._out
      const lp  = this._filter(ctx, 'lowpass', 4000, 1.5)
      lp.frequency.setValueAtTime(4000, t)
      lp.frequency.exponentialRampToValueAtTime(1500, t+.15)
      lp.connect(out)
      this._detunedOsc(ctx, { freq:880, freqEnd:440, start:t,      dur:.12, vol:0.11, detune:4, out:lp })
      this._detunedOsc(ctx, { freq:660, freqEnd:330, start:t+.04,  dur:.13, vol:0.09, detune:3, out:lp })
      this._fm(ctx,         { carr:550, mod:275, idx:2, start:t+.02, dur:.11, vol:0.028, out:lp })
    })
  }

  // Typing indicator
  typing() {
    this._play((ctx) => {
      const t   = ctx.currentTime
      const out = this._out
      const bp  = this._filter(ctx, 'bandpass', 4000, 8)
      bp.connect(out)
      this._noise(ctx,      { start:t, dur:.011, vol:0.045, type:'pink', out:bp })
      this._detunedOsc(ctx, { freq:3000, start:t, dur:.018, vol:0.030, detune:5, attack:0.001, out:bp })
    })
  }
}

export const soundService = new SoundService()
export default soundService
