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
    this.volume  = 1.0   // Global volume — full by default; user controls via slider
    this.pitchShift = 0.6

    this._queue          = []     // fns waiting for first gesture
    this._gestureReady   = false  // true once context is running
    this._listenerAdded  = false  // native gesture listeners registered
    this._playingSources = []     // currently playing audio sources for UI sounds
    
    this.soundpack = 'default'
    this.soundpackVolume = 1
    this._audioElements = {}
    
    // Ringtone loop state
    this._ringtoneInterval = null  // Interval ID for ringtone loop
    this._ringtonePlaying = false  // Whether ringtone is currently looping
    
    // Cache for sounds setting to avoid repeated localStorage reads
    this._soundsEnabled = null
    this._soundsEnabledCacheTime = 0
    this._SOUNDS_CACHE_TTL = 100 // Cache for 100ms to avoid thrashing
    this._soundpackVersion = 'royalty-v1'
  }

  getAvailableSoundpacks() {
    return [
      'default',
      'classic',
      'kenney_interface',
      'button_hitech',
      'owlish',
      'ui51',
      'digital63',
      'retro512',
      'rpg50',
      'kenney_interface_alt1',
      'kenney_interface_alt2',
      'button_hitech_alt',
      'owlish_ui',
      'owlish_scifi',
      'ui51_alt',
      'digital63_alt',
      'retro512_alt1',
      'retro512_alt2',
      'rpg50_alt'
    ]
  }

  getPreviewSoundKeys(pack = this.soundpack) {
    const targetPack = pack || this.soundpack
    if (this._isRuntimeGeneratedSoundpack(targetPack)) {
      return this._getSoundKeys()
    }

    const sounds = this._getSoundpackSounds(targetPack)
    return this._getSoundKeys().filter((key) => Boolean(sounds[key]))
  }

  _isRuntimeGeneratedSoundpack(pack) {
    return pack === 'default'
  }

  _getCurrentGeneratedProfile() {
    return { wave: 'sine', freqScale: 1, gainScale: 1, durationScale: 1, attackScale: 1, detuneCents: 5 }
  }

  _getSoundKeys() {
    return [
      'ringtone',
      'messageReceived',
      'dmReceived',
      'mention',
      'dmMention',
      'callJoin',
      'callConnected',
      'callLeft',
      'callEnded',
      'callDeclined',
      'userJoined',
      'userLeft',
      'mute',
      'unmute',
      'deafen',
      'undeafen',
      'screenShareStart',
      'screenShareStop',
      'cameraOn',
      'cameraOff',
      'voiceKick',
      'serverJoined',
      'roleAdded',
      'roleRemoved',
      'notification',
      'error',
      'success',
      'typing',
      'welcome',
      'logout',
      'victory',
      'defeat',
      'draw',
      'gameStart',
      'gameEnd',
      'playerJoin',
      'playerLeave',
      'yourTurn',
      'countdown',
      'timerStart',
      'timerEnd',
      'moveValid',
      'moveInvalid',
      'turnSwitch',
      'combo',
      'streak',
      'powerUp',
      'damage',
      'heal',
      'levelUp',
      'achievementUnlock',
      'buttonClick',
      'menuOpen',
      'menuClose',
      'popupOpen',
      'popupClose',
      'spectatorJoin',
      'spectatorLeave',
      'hostTransfer',
      'playerReady',
      'playerNotReady',
      'roundWin',
      'roundLoss',
      'suddenDeath',
      'overtime',
      'intermission',
      'pause',
      'resume',
      'selectionChange',
      'coinCollect',
      'xpGain',
      'winner',
      'loser'
    ]
  }
  
  // Check if sounds are enabled in settings (notification sounds toggle)
  _areSoundsEnabled() {
    const now = Date.now()
    if (this._soundsEnabled !== null && (now - this._soundsEnabledCacheTime) < this._SOUNDS_CACHE_TTL) {
      return this._soundsEnabled
    }
    
    try {
      const saved = localStorage.getItem('voltchat_settings')
      if (saved) {
        const settings = JSON.parse(saved)
        this._soundsEnabled = settings.sounds !== false // Default to true if not set
        this._soundsEnabledCacheTime = now
        return this._soundsEnabled
      }
    } catch (e) {}
    
    this._soundsEnabled = true
    this._soundsEnabledCacheTime = now
    return true
  }

  setSoundpack(pack) {
    const validPacks = this.getAvailableSoundpacks()
    if (!validPacks.includes(pack)) {
      pack = 'default'
    }
    console.log('[Sound] Setting soundpack to:', pack)
    this._stopAllSoundpackAudio()
    this.soundpack = pack
    this._preloadSounds(pack)
  }

  setSoundpackVolume(vol) {
    this.soundpackVolume = Math.max(0, Math.min(1, vol / 100))
    // Apply to Web Audio API master gain for generated sounds
    if (this._out) {
      this._out.gain.value = this.volume * this.soundpackVolume
    }
    // Apply volume to all currently playing audio elements (file-based packs)
    Object.values(this._audioElements).forEach(audio => {
      if (audio && !audio.paused) {
        audio.volume = this.soundpackVolume * this.volume
      }
    })
  }

  _preloadSounds(pack) {
    if (this._isRuntimeGeneratedSoundpack(pack)) return

    const sounds = this._getSoundpackSounds(pack)
    Object.entries(sounds).forEach(([key, filename]) => {
      const cacheKey = `${pack}:${key}`
      if (!this._audioElements[cacheKey]) {
        const audio = new Audio(filename)
        audio.preload = 'auto'
        this._audioElements[cacheKey] = audio
      }
    })
  }

  _getSoundpackSounds(pack) {
    if (pack === 'classic') {
      const raw = {
        ringtone: 'ring.mp3',
        messageReceived: 'noti7.mp3',
        dmReceived: 'message.mp3',
        mention: 'noti6.mp3',
        dmMention: 'noti6.mp3',
        callJoin: 'noti4.mp3',
        callConnected: 'connecting_call.mp3',
        callLeft: 'declined_call.mp3',
        callEnded: 'declined_call.mp3',
        callDeclined: 'declined_call.mp3',
        userJoined: 'connecting_call.mp3',
        userLeft: 'declined_call.mp3',
        mute: 'denied1.mp3',
        unmute: 'noti4.mp3',
        deafen: 'denied1.mp3',
        undeafen: 'noti4.mp3',
        screenShareStart: 'denied2.mp3',
        screenShareStop: 'denied1.mp3',
        cameraOn: 'noti4.mp3',
        cameraOff: 'denied1.mp3',
        voiceKick: 'denied1.mp3',
        serverJoined: 'welcome.mp3',
        roleAdded: 'noti4.mp3',
        roleRemoved: 'denied1.mp3',
        notification: 'noti7.mp3',
        error: 'denied1.mp3',
        success: 'noti4.mp3',
        typing: 'message.mp3',
        welcome: 'welcome.mp3',
        logout: 'logout.mp3'
      }
      return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, `/sounds/classic/${v}`]))
    }

    const royaltyPacks = {
      kenney_interface: 'ogg',
      button_hitech: 'wav',
      owlish: 'wav',
      ui51: 'wav',
      digital63: 'mp3',
      retro512: 'wav',
      rpg50: 'ogg',
      kenney_interface_alt1: 'ogg',
      kenney_interface_alt2: 'ogg',
      button_hitech_alt: 'wav',
      owlish_ui: 'wav',
      owlish_scifi: 'wav',
      ui51_alt: 'wav',
      digital63_alt: 'mp3',
      retro512_alt1: 'wav',
      retro512_alt2: 'wav',
      rpg50_alt: 'ogg'
    }

    const ext = royaltyPacks[pack]
    if (!ext) return {}

    return this._getSoundKeys().reduce((acc, key) => {
      acc[key] = `/sounds/royalty/${pack}/${key}.${ext}?v=${this._soundpackVersion}`
      return acc
    }, {})
  }

  _tryPlaySoundpack(soundKey) {
    // Check if sounds are enabled in settings
    if (!this._areSoundsEnabled()) return true // Return true to prevent fallback
    
    if (this._isRuntimeGeneratedSoundpack(this.soundpack)) {
      return false
    }

    return this._playSoundpackSound(soundKey, {
      fallback: () => this._playGeneratedSoundByKey(soundKey)
    })
  }

  _playSoundpackSound(soundKey, opts = {}) {
    if (this._isRuntimeGeneratedSoundpack(this.soundpack)) return false
    const { fallback } = opts

    const sounds = this._getSoundpackSounds(this.soundpack)
    const filename = sounds[soundKey]

    if (!filename) {
      console.log('[Sound] No sound file for', soundKey, 'in pack', this.soundpack)
      return false
    }

    const cacheKey = `${this.soundpack}:${soundKey}`
    let audio = this._audioElements[cacheKey]
    if (!audio) {
      audio = new Audio(filename)
      audio.preload = 'auto'
      this._audioElements[cacheKey] = audio
    }

    if (audio) {
      audio.volume = Math.min(1, this.soundpackVolume * this.volume)
      audio.currentTime = 0

      // Use a promise-based play with proper error handling for browser autoplay policies
      const playPromise = audio.play()
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.log('[Sound] Error playing sound:', soundKey, err.name, err.message)
          try { audio.pause() } catch {}
          audio.currentTime = 0
          // On NotAllowedError (autoplay blocked), fall back to generated sound
          if (typeof fallback === 'function') {
            fallback()
          }
        })
      }
      return true
    }
    return false
  }

  playSound(soundKey) {
    if (!this.enabled) return
    if (!this._areSoundsEnabled()) return
    
    // If using soundpack and sound exists in pack, play from pack
    if (!this._isRuntimeGeneratedSoundpack(this.soundpack)) {
      if (this._playSoundpackSound(soundKey, {
        fallback: () => this._playGeneratedSoundByKey(soundKey)
      })) {
        return
      }
    }
    
    // Fall back to default generated sound
    this._playGeneratedSoundByKey(soundKey)
  }

  _playGeneratedSoundByKey(soundKey) {
    const methodMap = {
      ringtone: 'callRingtone',
      messageReceived: 'messageReceived',
      dmReceived: 'dmReceived',
      mention: 'mention',
      dmMention: 'dmMention',
      callJoin: 'callJoin',
      callConnected: 'callConnected',
      callLeft: 'callLeft',
      callEnded: 'callEnded',
      callDeclined: 'callDeclined',
      userJoined: 'userJoined',
      userLeft: 'userLeft',
      mute: 'mute',
      unmute: 'unmute',
      deafen: 'deafen',
      undeafen: 'undeafen',
      screenShareStart: 'screenShareStart',
      screenShareStop: 'screenShareStop',
      cameraOn: 'cameraOn',
      cameraOff: 'cameraOff',
      voiceKick: 'voiceKick',
      serverJoined: 'serverJoined',
      roleAdded: 'roleAdded',
      roleRemoved: 'roleRemoved',
      notification: 'notification',
      error: 'error',
      success: 'success',
       typing: 'typing',
      messageSent: 'messageSent',
      welcome: 'welcome',
      logout: 'logoutSound',
      victory: 'victory',
      defeat: 'defeat',
      draw: 'draw',
      gameStart: 'gameStart',
      gameEnd: 'gameEnd',
      playerJoin: 'playerJoin',
      playerLeave: 'playerLeave',
      yourTurn: 'yourTurn',
      countdown: 'countdown',
      timerStart: 'timerStart',
      timerEnd: 'timerEnd',
      moveValid: 'moveValid',
      moveInvalid: 'moveInvalid',
      turnSwitch: 'turnSwitch',
      combo: 'combo',
      streak: 'streak',
      powerUp: 'powerUp',
      damage: 'damage',
      heal: 'heal',
      levelUp: 'levelUp',
      achievementUnlock: 'achievementUnlock',
      buttonClick: 'buttonClick',
      menuOpen: 'menuOpen',
      menuClose: 'menuClose',
      popupOpen: 'popupOpen',
      popupClose: 'popupClose',
      spectatorJoin: 'spectatorJoin',
      spectatorLeave: 'spectatorLeave',
      hostTransfer: 'hostTransfer',
      playerReady: 'playerReady',
      playerNotReady: 'playerNotReady',
      roundWin: 'roundWin',
      roundLoss: 'roundLoss',
      suddenDeath: 'suddenDeath',
      overtime: 'overtime',
      intermission: 'intermission',
      pause: 'pause',
      resume: 'resume',
      selectionChange: 'selectionChange',
      coinCollect: 'coinCollect',
      xpGain: 'xpGain',
      winner: 'winner',
      loser: 'loser'
    }
    
    const method = methodMap[soundKey]
    if (method && typeof this[method] === 'function') {
      const prevPack = this.soundpack
      this.soundpack = 'default'
      try {
        this[method]()
      } finally {
        this.soundpack = prevPack
      }
    }
  }

  _stopAllSoundpackAudio() {
    Object.values(this._audioElements).forEach((audio) => {
      if (!audio) return
      try { audio.pause() } catch {}
      audio.currentTime = 0
    })
  }

  welcome() {
    if (this._tryPlaySoundpack('welcome')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 5, 5)
      const dly = this._delay(ctx, 0.18, 0.65)
      const rg = this._gain(ctx, 0.28)
      const dg = this._gain(ctx, 0.55)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [261.63, 329.63, 392, 523.25]
      notes.forEach((freq, i) => {
        const g = this._ambient(ctx, freq, t + i * 0.12, 0.5, 0.08, 0.05)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  logoutSound() {
    if (this._tryPlaySoundpack('logout')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 4, 4)
      const dly = this._delay(ctx, 0.14, 0.55)
      const rg = this._gain(ctx, 0.25)
      const dg = this._gain(ctx, 0.5)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [392, 329.63, 261.63, 196]
      notes.forEach((freq, i) => {
        const g = this._ambient(ctx, freq, t + i * 0.1, 0.35, 0.065, 0.02)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  previewSound(soundKey) {
    this.playSound(soundKey)
  }

  prime() {
    this._ensureContext()
    if (!this._ctx) return
    if (this._ctx.state === 'running') {
      this._gestureReady = true
      this._flush()
      return
    }
    this._ctx.resume().then(() => {
      if (this._ctx?.state === 'running') {
        this._gestureReady = true
        this._flush()
      }
    }).catch(() => {})
  }

  stopPreview(soundKey) {
    if (!soundKey) return

    if (this._isRuntimeGeneratedSoundpack(this.soundpack)) {
      if (soundKey === 'ringtone') this.stopRingtone()
      this._stopCurrentSounds()
      return
    }

    const cacheKey = `${this.soundpack}:${soundKey}`
    const audio = this._audioElements[cacheKey]
    if (audio) {
      try { audio.pause() } catch {}
      audio.currentTime = 0
    }
  }

  _playUISound(freq, dur) {
    this._play((ctx) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(this._out || ctx.destination)
      osc.frequency.value = freq
      osc.type = 'sine'
      gain.gain.setValueAtTime(0.3 * this.volume, ctx.currentTime)
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
    
    // Load soundpack settings
    this._loadSoundpackSettings()
    
    // Subscribe to settings changes
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key === 'voltchat_settings' && e.newValue) {
          try {
            const settings = JSON.parse(e.newValue)
            if (settings.soundpack && settings.soundpack !== this.soundpack) {
              this.setSoundpack(settings.soundpack)
            }
            if (settings.soundpackVolume !== undefined) {
              this.setSoundpackVolume(settings.soundpackVolume)
            }
          } catch (e) {}
        }
      })
    }
  }

  _loadSoundpackSettings() {
    try {
      const saved = localStorage.getItem('voltchat_settings')
      if (saved) {
        const settings = JSON.parse(saved)
        console.log('[Sound] Loading soundpack settings:', settings.soundpack, settings.soundpackVolume)
        if (settings.soundpack) {
          this.setSoundpack(settings.soundpack)
        }
        if (settings.soundpackVolume !== undefined) {
          this.setSoundpackVolume(settings.soundpackVolume)
        }
      } else {
        console.log('[Sound] No soundpack settings found')
      }
    } catch (e) {
      console.error('[Sound] Error loading soundpack settings:', e)
    }
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
      this._comp.threshold.value = -12   // softer threshold = more compression headroom
      this._comp.knee.value      = 16    // wide knee = smooth, transparent compression
      this._comp.ratio.value     = 4     // gentle ratio to tame peaks without pumping
      this._comp.attack.value    = 0.002
      this._comp.release.value   = 0.25
      this._out = this._ctx.createGain()
      this._out.gain.value = this.volume * this.soundpackVolume
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
    
    // Check if sounds are enabled in settings (notification sounds toggle)
    if (!this._areSoundsEnabled()) return

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
    if (this._out) this._out.gain.value = this.volume * this.soundpackVolume
    // Also update all cached audio elements
    Object.values(this._audioElements).forEach(audio => {
      if (audio) {
        audio.volume = Math.min(1, this.soundpackVolume * this.volume)
      }
    })
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
    const profile = this._getCurrentGeneratedProfile()
    const tunedFreq = Math.max(1, freq * (profile.freqScale || 1))
    const tunedDur = Math.max(0.03, dur * (profile.durationScale || 1))
    const tunedAttack = Math.max(0.002, attack * (profile.attackScale || 1))
    const tunedVol = Math.max(0.001, vol * (profile.gainScale || 1))
    const g = ctx.createGain()
    const end = start + tunedDur
    const holdEnd = Math.max(start + tunedAttack, end - 0.02)
    g.gain.setValueAtTime(0.0001, start)
    g.gain.linearRampToValueAtTime(tunedVol, start + tunedAttack)
    g.gain.setValueAtTime(tunedVol, holdEnd)
    g.gain.exponentialRampToValueAtTime(0.0001, end)
    const osc = ctx.createOscillator()
    osc.type = profile.wave || 'sine'
    osc.frequency.value = tunedFreq
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
    if (this._tryPlaySoundpack('messageReceived')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 4, 4)
      const dly = this._delay(ctx, 0.15, 0.7)
      const rg = this._gain(ctx, 0.18)
      const dg = this._gain(ctx, 0.8)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [174.61, 220, 261.63]
      notes.forEach((freq, i) => {
        const g = this._ambient(ctx, freq, t + i * 0.08, 0.3, 0.09, 0.05)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  dmReceived() {
    if (this._tryPlaySoundpack('messageReceived')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 4, 4)
      const dly = this._delay(ctx, 0.15, 0.7)
      const rg = this._gain(ctx, 0.18)
      const dg = this._gain(ctx, 0.8)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [196, 246.94, 293.66]
      notes.forEach((freq, i) => {
        const g = this._ambient(ctx, freq, t + i * 0.08, 0.3, 0.085, 0.05)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  mention() {
    if (this._tryPlaySoundpack('mention')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 4, 4)
      const dly = this._delay(ctx, 0.15, 0.7)
      const rg = this._gain(ctx, 0.18)
      const dg = this._gain(ctx, 0.8)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [261.63, 329.63, 392]
      notes.forEach((freq, i) => {
        const g = this._ambient(ctx, freq, t + i * 0.08, 0.3, 0.08, 0.05)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  dmMention() {
    if (this._tryPlaySoundpack('mention')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 4, 4)
      const dly = this._delay(ctx, 0.15, 0.7)
      const rg = this._gain(ctx, 0.18)
      const dg = this._gain(ctx, 0.8)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [220, 277.18, 329.63]
      notes.forEach((freq, i) => {
        const g = this._ambient(ctx, freq, t + i * 0.08, 0.3, 0.08, 0.05)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  callJoin() {
    if (this._tryPlaySoundpack('callJoin')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 4, 4)
      const dly = this._delay(ctx, 0.12, 0.55)
      const rg = this._gain(ctx, 0.22)
      const dg = this._gain(ctx, 0.5)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [293.66, 440]
      notes.forEach((freq, i) => {
        const g = this._ambient(ctx, freq, t + i * 0.1, 0.25, 0.07, 0.02)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  callConnected() {
    if (this._tryPlaySoundpack('callConnected')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 4, 4)
      const dly = this._delay(ctx, 0.15, 0.7)
      const rg = this._gain(ctx, 0.18)
      const dg = this._gain(ctx, 0.8)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [196, 246.94, 293.66]
      notes.forEach((freq, i) => {
        const g = this._ambient(ctx, freq, t + i * 0.08, 0.3, 0.08, 0.05)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  callLeft() {
    if (this._tryPlaySoundpack('callLeft')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 4, 4)
      const dly = this._delay(ctx, 0.15, 0.7)
      const rg = this._gain(ctx, 0.18)
      const dg = this._gain(ctx, 0.8)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [246.94, 196, 146.83]
      notes.forEach((freq, i) => {
        const g = this._ambient(ctx, freq, t + i * 0.08, 0.3, 0.08, 0.05)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  callEnded() {
    if (this._tryPlaySoundpack('callEnded')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 4, 4)
      const dly = this._delay(ctx, 0.15, 0.7)
      const rg = this._gain(ctx, 0.18)
      const dg = this._gain(ctx, 0.8)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [196, 185]
      notes.forEach((freq, i) => {
        const g = this._ambient(ctx, freq, t + i * 0.08, 0.3, 0.08, 0.05)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  callDeclined() {
    if (this._tryPlaySoundpack('callDeclined')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 4, 4)
      const dly = this._delay(ctx, 0.15, 0.7)
      const rg = this._gain(ctx, 0.18)
      const dg = this._gain(ctx, 0.8)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [220, 185, 146.83]
      notes.forEach((freq, i) => {
        const g = this._ambient(ctx, freq, t + i * 0.08, 0.3, 0.075, 0.05)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  userJoined() {
    if (this._tryPlaySoundpack('userJoined')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 2, 2)
      const dly = this._delay(ctx, 0.05, 0.4)
      const rg = this._gain(ctx, 0.1)
      const dg = this._gain(ctx, 0.5)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [392]
      notes.forEach((freq) => {
        const g = this._ambient(ctx, freq, t, 0.08, 0.07, 0.01)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  userLeft() {
    if (this._tryPlaySoundpack('userLeft')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 2, 2)
      const dly = this._delay(ctx, 0.05, 0.4)
      const rg = this._gain(ctx, 0.1)
      const dg = this._gain(ctx, 0.5)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [330]
      notes.forEach((freq) => {
        const g = this._ambient(ctx, freq, t, 0.08, 0.07, 0.01)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  mute() {
    if (this._tryPlaySoundpack('mute')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 2, 2)
      const dly = this._delay(ctx, 0.05, 0.4)
      const rg = this._gain(ctx, 0.2)
      const dg = this._gain(ctx, 0.7)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [146.83]
      notes.forEach((freq) => {
        const g = this._ambient(ctx, freq, t, 0.15, 0.22, 0.02)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  unmute() {
    if (this._tryPlaySoundpack('unmute')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 2, 2)
      const dly = this._delay(ctx, 0.05, 0.4)
      const rg = this._gain(ctx, 0.2)
      const dg = this._gain(ctx, 0.7)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [220]
      notes.forEach((freq) => {
        const g = this._ambient(ctx, freq, t, 0.15, 0.22, 0.02)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  deafen() {
    if (this._tryPlaySoundpack('deafen')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 2, 2)
      const dly = this._delay(ctx, 0.05, 0.4)
      const rg = this._gain(ctx, 0.2)
      const dg = this._gain(ctx, 0.7)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [130.81]
      notes.forEach((freq) => {
        const g = this._ambient(ctx, freq, t, 0.15, 0.22, 0.02)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  undeafen() {
    if (this._tryPlaySoundpack('undeafen')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 2, 2)
      const dly = this._delay(ctx, 0.05, 0.4)
      const rg = this._gain(ctx, 0.2)
      const dg = this._gain(ctx, 0.7)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [246.94]
      notes.forEach((freq) => {
        const g = this._ambient(ctx, freq, t, 0.15, 0.22, 0.02)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  screenShareStart() {
    if (this._tryPlaySoundpack('screenShareStart')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 2, 2)
      const dly = this._delay(ctx, 0.05, 0.4)
      const rg = this._gain(ctx, 0.1)
      const dg = this._gain(ctx, 0.5)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [523.25]
      notes.forEach((freq) => {
        const g = this._ambient(ctx, freq, t, 0.08, 0.07, 0.01)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  screenShareStop() {
    if (this._tryPlaySoundpack('screenShareStop')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 2, 2)
      const dly = this._delay(ctx, 0.05, 0.4)
      const rg = this._gain(ctx, 0.1)
      const dg = this._gain(ctx, 0.5)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [392]
      notes.forEach((freq) => {
        const g = this._ambient(ctx, freq, t, 0.08, 0.07, 0.01)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  cameraOn() {
    if (this._tryPlaySoundpack('cameraOn')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 2, 2)
      const dly = this._delay(ctx, 0.05, 0.4)
      const rg = this._gain(ctx, 0.1)
      const dg = this._gain(ctx, 0.5)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [440]
      notes.forEach((freq) => {
        const g = this._ambient(ctx, freq, t, 0.08, 0.07, 0.01)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  cameraOff() {
    if (this._tryPlaySoundpack('cameraOff')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 2, 2)
      const dly = this._delay(ctx, 0.05, 0.4)
      const rg = this._gain(ctx, 0.1)
      const dg = this._gain(ctx, 0.5)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [330]
      notes.forEach((freq) => {
        const g = this._ambient(ctx, freq, t, 0.08, 0.07, 0.01)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  voiceKick() {
    if (this._tryPlaySoundpack('voiceKick')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 2, 2)
      const dly = this._delay(ctx, 0.05, 0.4)
      const rg = this._gain(ctx, 0.1)
      const dg = this._gain(ctx, 0.5)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [98]
      notes.forEach((freq) => {
        const g = this._ambient(ctx, freq, t, 0.08, 0.06, 0.01)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  // ─── Ringtone Loop Control ────────────────────────────────────────────────

  // Start repeating ringtone - plays until stopRingtone() is called
  // Call this when an incoming call arrives
  startRingtone() {
    if (this._ringtonePlaying) return  // Already playing
    this._ringtonePlaying = true

    const ringtoneDuration = 6500

    // Play immediately
    this.callRingtone()

    // Set up interval to repeat
    this._ringtoneInterval = setInterval(() => {
      if (this._ringtonePlaying) {
        this.callRingtone()
      }
    }, ringtoneDuration)
  }

  // Stop the ringtone loop - call when call is accepted, declined, or cancelled
  stopRingtone() {
    this._ringtonePlaying = false

    if (this._ringtoneInterval) {
      clearInterval(this._ringtoneInterval)
      this._ringtoneInterval = null
    }

    // Also stop any currently playing sounds
    this._stopCurrentSounds()
  }

  // Improved ringtone: melodic, recognisable, pleasant but attention-grabbing
  callRingtone() {
    if (this._tryPlaySoundpack('ringtone')) return

    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out

      // Reverb for space
      const rev = this._reverb(ctx, 2.5, 2.5)
      const revGain = this._gain(ctx, 0.18)
      rev.connect(revGain); revGain.connect(out)

      // Delay for shimmer
      const dly = this._delay(ctx, 0.18, 0.35)
      const dlyGain = this._gain(ctx, 0.22)
      dly.node.connect(dlyGain); dlyGain.connect(out)

      // Melodic pattern: two-bar phrase, repeated twice
      // Uses a pleasant ascending/descending motif in C major
      const phrase = [
        { freq: 523.25, time: 0.00, dur: 0.18, vol: 0.28 },  // C5
        { freq: 659.25, time: 0.22, dur: 0.18, vol: 0.26 },  // E5
        { freq: 783.99, time: 0.44, dur: 0.18, vol: 0.26 },  // G5
        { freq: 1046.50, time: 0.66, dur: 0.28, vol: 0.24 }, // C6
        { freq: 783.99, time: 1.10, dur: 0.18, vol: 0.22 },  // G5
        { freq: 659.25, time: 1.32, dur: 0.18, vol: 0.22 },  // E5
        { freq: 523.25, time: 1.54, dur: 0.32, vol: 0.24 },  // C5 (hold)
      ]

      for (let repeat = 0; repeat < 2; repeat++) {
        const offset = repeat * 2.2

        phrase.forEach((note) => {
          const startTime = t + note.time + offset

          // Main bell-like tone: sine + triangle blend
          const mainOsc = ctx.createOscillator()
          const mainGain = ctx.createGain()
          mainOsc.type = 'sine'
          mainOsc.frequency.setValueAtTime(note.freq, startTime)
          mainGain.gain.setValueAtTime(0.0001, startTime)
          mainGain.gain.linearRampToValueAtTime(note.vol, startTime + 0.008)
          mainGain.gain.exponentialRampToValueAtTime(0.0001, startTime + note.dur + 0.15)
          mainOsc.connect(mainGain)
          mainGain.connect(out)
          mainGain.connect(rev)
          mainGain.connect(dly.node)
          mainOsc.start(startTime)
          mainOsc.stop(startTime + note.dur + 0.2)
          this._playingSources.push(mainOsc)

          // Harmonic overtone at 2x frequency (octave) for brightness
          const harmOsc = ctx.createOscillator()
          const harmGain = ctx.createGain()
          harmOsc.type = 'triangle'
          harmOsc.frequency.setValueAtTime(note.freq * 2, startTime)
          harmGain.gain.setValueAtTime(0.0001, startTime)
          harmGain.gain.linearRampToValueAtTime(note.vol * 0.18, startTime + 0.006)
          harmGain.gain.exponentialRampToValueAtTime(0.0001, startTime + note.dur * 0.6)
          harmOsc.connect(harmGain)
          harmGain.connect(out)
          harmGain.connect(rev)
          harmOsc.start(startTime)
          harmOsc.stop(startTime + note.dur + 0.1)
          this._playingSources.push(harmOsc)

          // Soft attack click for definition
          const clickBuf = ctx.createBuffer(1, Math.max(32, Math.floor(ctx.sampleRate * 0.012)), ctx.sampleRate)
          const clickData = clickBuf.getChannelData(0)
          for (let i = 0; i < clickData.length; i++) {
            clickData[i] = (Math.random() * 2 - 1) * (1 - i / clickData.length) * 0.4
          }
          const clickSrc = ctx.createBufferSource()
          const clickGain = ctx.createGain()
          const clickFilter = ctx.createBiquadFilter()
          clickSrc.buffer = clickBuf
          clickFilter.type = 'bandpass'
          clickFilter.frequency.value = note.freq * 1.5
          clickFilter.Q.value = 2
          clickGain.gain.setValueAtTime(note.vol * 0.12, startTime)
          clickGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.015)
          clickSrc.connect(clickFilter)
          clickFilter.connect(clickGain)
          clickGain.connect(out)
          clickSrc.start(startTime)
          clickSrc.stop(startTime + 0.02)
          this._playingSources.push(clickSrc)
        })
      }
    })
  }

  serverJoined() {
    if (this._tryPlaySoundpack('serverJoined')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 2, 2)
      const dly = this._delay(ctx, 0.05, 0.4)
      const rg = this._gain(ctx, 0.1)
      const dg = this._gain(ctx, 0.5)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [523.25]
      notes.forEach((freq) => {
        const g = this._ambient(ctx, freq, t, 0.08, 0.07, 0.01)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  roleAdded() {
    if (this._tryPlaySoundpack('roleAdded')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 2, 2)
      const dly = this._delay(ctx, 0.05, 0.4)
      const rg = this._gain(ctx, 0.1)
      const dg = this._gain(ctx, 0.5)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [440]
      notes.forEach((freq) => {
        const g = this._ambient(ctx, freq, t, 0.08, 0.07, 0.01)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  roleRemoved() {
    if (this._tryPlaySoundpack('roleRemoved')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 2, 2)
      const dly = this._delay(ctx, 0.05, 0.4)
      const rg = this._gain(ctx, 0.1)
      const dg = this._gain(ctx, 0.5)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [330]
      notes.forEach((freq) => {
        const g = this._ambient(ctx, freq, t, 0.08, 0.06, 0.01)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  notification() {
    if (this._tryPlaySoundpack('notification')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 2, 2)
      const dly = this._delay(ctx, 0.05, 0.4)
      const rg = this._gain(ctx, 0.1)
      const dg = this._gain(ctx, 0.5)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [523.25]
      notes.forEach((freq) => {
        const g = this._ambient(ctx, freq, t, 0.08, 0.07, 0.01)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  error() {
    if (this._tryPlaySoundpack('error')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 2, 2)
      const dly = this._delay(ctx, 0.05, 0.4)
      const rg = this._gain(ctx, 0.1)
      const dg = this._gain(ctx, 0.5)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [130.81]
      notes.forEach((freq) => {
        const g = this._ambient(ctx, freq, t, 0.08, 0.06, 0.01)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  success() {
    if (this._tryPlaySoundpack('success')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 2, 2)
      const dly = this._delay(ctx, 0.05, 0.4)
      const rg = this._gain(ctx, 0.1)
      const dg = this._gain(ctx, 0.5)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [523.25]
      notes.forEach((freq) => {
        const g = this._ambient(ctx, freq, t, 0.08, 0.07, 0.01)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  typing() {
    if (this._tryPlaySoundpack('typing')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 1, 1)
      const dly = this._delay(ctx, 0.03, 0.3)
      const rg = this._gain(ctx, 0.05)
      const dg = this._gain(ctx, 0.35)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const g = this._ambient(ctx, 800, t, 0.05, 0.025, 0.005)
      g.connect(out); g.connect(dly.node); g.connect(rev)
    })
  }

  messageSent() {
    if (this._tryPlaySoundpack('messageSent')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 2, 2)
      const dly = this._delay(ctx, 0.06, 0.35)
      const rg = this._gain(ctx, 0.1)
      const dg = this._gain(ctx, 0.4)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const g = this._ambient(ctx, 440, t, 0.1, 0.055, 0.01)
      g.connect(out); g.connect(dly.node); g.connect(rev)
    })
  }

  victory() {
    if (this._tryPlaySoundpack('victory')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 4, 4)
      const dly = this._delay(ctx, 0.2, 0.6)
      const rg = this._gain(ctx, 0.18)
      const dg = this._gain(ctx, 0.8)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [523.25, 659.25, 783.99, 1046.50]
      notes.forEach((freq, i) => {
        const g = this._ambient(ctx, freq, t + i * 0.1, 0.4, 0.1, 0.05)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  defeat() {
    if (this._tryPlaySoundpack('defeat')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 3, 3)
      const dly = this._delay(ctx, 0.15, 0.5)
      const rg = this._gain(ctx, 0.15)
      const dg = this._gain(ctx, 0.6)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [392, 349.23, 311.13, 261.63]
      notes.forEach((freq, i) => {
        const g = this._ambient(ctx, freq, t + i * 0.12, 0.35, 0.09, 0.05)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  draw() {
    if (this._tryPlaySoundpack('draw')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 2, 2)
      const dly = this._delay(ctx, 0.1, 0.4)
      const rg = this._gain(ctx, 0.12)
      const dg = this._gain(ctx, 0.5)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [440, 440, 415.30, 415.30]
      notes.forEach((freq, i) => {
        const g = this._ambient(ctx, freq, t + i * 0.15, 0.3, 0.08, 0.04)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  gameStart() {
    if (this._tryPlaySoundpack('gameStart')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 3, 3)
      const dly = this._delay(ctx, 0.15, 0.5)
      const rg = this._gain(ctx, 0.15)
      const dg = this._gain(ctx, 0.6)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [523.25, 659.25, 783.99]
      notes.forEach((freq, i) => {
        const g = this._ambient(ctx, freq, t + i * 0.1, 0.35, 0.1, 0.04)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  gameEnd() {
    if (this._tryPlaySoundpack('gameEnd')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 3, 3)
      const dly = this._delay(ctx, 0.12, 0.5)
      const rg = this._gain(ctx, 0.14)
      const dg = this._gain(ctx, 0.6)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [392, 329.63, 261.63]
      notes.forEach((freq, i) => {
        const g = this._ambient(ctx, freq, t + i * 0.12, 0.3, 0.09, 0.05)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  playerJoin() {
    if (this._tryPlaySoundpack('playerJoin')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 2, 2)
      const dly = this._delay(ctx, 0.08, 0.4)
      const rg = this._gain(ctx, 0.1)
      const dg = this._gain(ctx, 0.5)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [440, 554.37]
      notes.forEach((freq, i) => {
        const g = this._ambient(ctx, freq, t + i * 0.08, 0.2, 0.07, 0.02)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  playerLeave() {
    if (this._tryPlaySoundpack('playerLeave')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 2, 2)
      const dly = this._delay(ctx, 0.08, 0.4)
      const rg = this._gain(ctx, 0.1)
      const dg = this._gain(ctx, 0.5)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [440, 369.99]
      notes.forEach((freq, i) => {
        const g = this._ambient(ctx, freq, t + i * 0.1, 0.2, 0.07, 0.02)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  yourTurn() {
    if (this._tryPlaySoundpack('yourTurn')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 3, 3)
      const dly = this._delay(ctx, 0.1, 0.5)
      const rg = this._gain(ctx, 0.14)
      const dg = this._gain(ctx, 0.6)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [587.33, 880]
      notes.forEach((freq, i) => {
        const g = this._ambient(ctx, freq, t + i * 0.1, 0.25, 0.09, 0.03)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  countdown() {
    if (this._tryPlaySoundpack('countdown')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 3, 3)
      const dly = this._delay(ctx, 0.1, 0.45)
      const rg = this._gain(ctx, 0.18)
      const dg = this._gain(ctx, 0.5)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [523.25, 523.25, 523.25, 783.99]
      notes.forEach((freq, i) => {
        const g = this._ambient(ctx, freq, t + i * 0.5, 0.3, 0.12, 0.02)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  timerStart() {
    if (this._tryPlaySoundpack('timerStart')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 2, 2)
      const rg = this._gain(ctx, 0.1)
      rev.connect(rg); rg.connect(out)
      const notes = [659.25]
      notes.forEach((freq) => {
        const g = this._ambient(ctx, freq, t, 0.15, 0.08, 0.01)
        g.connect(out); g.connect(rev)
      })
    })
  }

  timerEnd() {
    if (this._tryPlaySoundpack('timerEnd')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 2, 2)
      const dly = this._delay(ctx, 0.1, 0.5)
      const rg = this._gain(ctx, 0.12)
      const dg = this._gain(ctx, 0.6)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [329.63]
      notes.forEach((freq) => {
        const g = this._ambient(ctx, freq, t, 0.25, 0.1, 0.02)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  moveValid() {
    if (this._tryPlaySoundpack('moveValid')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 2, 2)
      const dly = this._delay(ctx, 0.06, 0.4)
      const rg = this._gain(ctx, 0.12)
      const dg = this._gain(ctx, 0.45)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const g = this._ambient(ctx, 880, t, 0.12, 0.07, 0.01)
      g.connect(out); g.connect(dly.node); g.connect(rev)
    })
  }

  moveInvalid() {
    if (this._tryPlaySoundpack('moveInvalid')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 2, 2)
      const dly = this._delay(ctx, 0.06, 0.35)
      const rg = this._gain(ctx, 0.12)
      const dg = this._gain(ctx, 0.4)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const g = this._ambient(ctx, 220, t, 0.18, 0.09, 0.01)
      g.connect(out); g.connect(dly.node); g.connect(rev)
    })
  }

  turnSwitch() {
    if (this._tryPlaySoundpack('turnSwitch')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 2, 2)
      const rg = this._gain(ctx, 0.1)
      rev.connect(rg); rg.connect(out)
      const notes = [440]
      notes.forEach((freq) => {
        const g = this._ambient(ctx, freq, t, 0.15, 0.07, 0.015)
        g.connect(out); g.connect(rev)
      })
    })
  }

  combo() {
    if (this._tryPlaySoundpack('combo')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 3, 3)
      const dly = this._delay(ctx, 0.1, 0.5)
      const rg = this._gain(ctx, 0.14)
      const dg = this._gain(ctx, 0.6)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [523.25, 659.25, 783.99, 1046.50]
      notes.forEach((freq, i) => {
        const g = this._ambient(ctx, freq, t + i * 0.08, 0.2, 0.09, 0.02)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  streak() {
    if (this._tryPlaySoundpack('streak')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 3, 3)
      const dly = this._delay(ctx, 0.08, 0.5)
      const rg = this._gain(ctx, 0.12)
      const dg = this._gain(ctx, 0.6)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [698.46, 880, 1046.50]
      notes.forEach((freq, i) => {
        const g = this._ambient(ctx, freq, t + i * 0.06, 0.15, 0.08, 0.015)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  powerUp() {
    if (this._tryPlaySoundpack('powerUp')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 4, 4)
      const dly = this._delay(ctx, 0.12, 0.6)
      const rg = this._gain(ctx, 0.15)
      const dg = this._gain(ctx, 0.7)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [523.25, 659.25, 783.99, 987.77, 1174.66]
      notes.forEach((freq, i) => {
        const g = this._ambient(ctx, freq, t + i * 0.07, 0.25, 0.08, 0.02)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  damage() {
    if (this._tryPlaySoundpack('damage')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 2, 2)
      const dly = this._delay(ctx, 0.05, 0.35)
      const rg = this._gain(ctx, 0.14)
      const dg = this._gain(ctx, 0.4)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const g = this._ambient(ctx, 110, t, 0.18, 0.16, 0.01)
      g.connect(out); g.connect(dly.node); g.connect(rev)
    })
  }

  heal() {
    if (this._tryPlaySoundpack('heal')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 3, 3)
      const dly = this._delay(ctx, 0.15, 0.5)
      const rg = this._gain(ctx, 0.12)
      const dg = this._gain(ctx, 0.6)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [523.25, 659.25]
      notes.forEach((freq, i) => {
        const g = this._ambient(ctx, freq, t + i * 0.1, 0.25, 0.08, 0.02)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  levelUp() {
    if (this._tryPlaySoundpack('levelUp')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 4, 4)
      const dly = this._delay(ctx, 0.15, 0.6)
      const rg = this._gain(ctx, 0.16)
      const dg = this._gain(ctx, 0.7)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51, 1567.98]
      notes.forEach((freq, i) => {
        const g = this._ambient(ctx, freq, t + i * 0.08, 0.3, 0.09, 0.03)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  achievementUnlock() {
    if (this._tryPlaySoundpack('achievementUnlock')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 4, 4)
      const dly = this._delay(ctx, 0.15, 0.6)
      const rg = this._gain(ctx, 0.15)
      const dg = this._gain(ctx, 0.7)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51]
      notes.forEach((freq, i) => {
        const g = this._ambient(ctx, freq, t + i * 0.1, 0.35, 0.09, 0.03)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  buttonClick() {
    if (this._tryPlaySoundpack('buttonClick')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 1.5, 1.5)
      const rg = this._gain(ctx, 0.1)
      rev.connect(rg); rg.connect(out)
      const g = this._ambient(ctx, 1200, t, 0.06, 0.05, 0.005)
      g.connect(out); g.connect(rev)
    })
  }

  menuOpen() {
    if (this._tryPlaySoundpack('menuOpen')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 2, 2)
      const rg = this._gain(ctx, 0.08)
      rev.connect(rg); rg.connect(out)
      const notes = [392]
      notes.forEach((freq) => {
        const g = this._ambient(ctx, freq, t, 0.12, 0.06, 0.015)
        g.connect(out); g.connect(rev)
      })
    })
  }

  menuClose() {
    if (this._tryPlaySoundpack('menuClose')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 2, 2)
      const rg = this._gain(ctx, 0.08)
      rev.connect(rg); rg.connect(out)
      const notes = [349.23]
      notes.forEach((freq) => {
        const g = this._ambient(ctx, freq, t, 0.1, 0.06, 0.015)
        g.connect(out); g.connect(rev)
      })
    })
  }

  popupOpen() {
    if (this._tryPlaySoundpack('popupOpen')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 3, 3)
      const rg = this._gain(ctx, 0.1)
      rev.connect(rg); rg.connect(out)
      const notes = [440, 554.37]
      notes.forEach((freq, i) => {
        const g = this._ambient(ctx, freq, t + i * 0.05, 0.1, 0.06, 0.01)
        g.connect(out); g.connect(rev)
      })
    })
  }

  popupClose() {
    if (this._tryPlaySoundpack('popupClose')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 2, 2)
      const rg = this._gain(ctx, 0.08)
      rev.connect(rg); rg.connect(out)
      const notes = [415.30, 349.23]
      notes.forEach((freq, i) => {
        const g = this._ambient(ctx, freq, t + i * 0.05, 0.1, 0.06, 0.01)
        g.connect(out); g.connect(rev)
      })
    })
  }

  spectatorJoin() {
    if (this._tryPlaySoundpack('spectatorJoin')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 2, 2)
      const dly = this._delay(ctx, 0.07, 0.4)
      const rg = this._gain(ctx, 0.1)
      const dg = this._gain(ctx, 0.45)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const g = this._ambient(ctx, 587.33, t, 0.18, 0.06, 0.015)
      g.connect(out); g.connect(dly.node); g.connect(rev)
    })
  }

  spectatorLeave() {
    if (this._tryPlaySoundpack('spectatorLeave')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 2, 2)
      const dly = this._delay(ctx, 0.07, 0.4)
      const rg = this._gain(ctx, 0.1)
      const dg = this._gain(ctx, 0.45)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const g = this._ambient(ctx, 493.88, t, 0.18, 0.06, 0.015)
      g.connect(out); g.connect(dly.node); g.connect(rev)
    })
  }

  hostTransfer() {
    if (this._tryPlaySoundpack('hostTransfer')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 3, 3)
      const dly = this._delay(ctx, 0.12, 0.5)
      const rg = this._gain(ctx, 0.12)
      const dg = this._gain(ctx, 0.6)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [523.25, 659.25, 523.25, 783.99]
      notes.forEach((freq, i) => {
        const g = this._ambient(ctx, freq, t + i * 0.1, 0.2, 0.08, 0.02)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  playerReady() {
    if (this._tryPlaySoundpack('playerReady')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 2, 2)
      const dly = this._delay(ctx, 0.07, 0.4)
      const rg = this._gain(ctx, 0.1)
      const dg = this._gain(ctx, 0.45)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const g = this._ambient(ctx, 698.46, t, 0.18, 0.07, 0.015)
      g.connect(out); g.connect(dly.node); g.connect(rev)
    })
  }

  playerNotReady() {
    if (this._tryPlaySoundpack('playerNotReady')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 2, 2)
      const dly = this._delay(ctx, 0.07, 0.35)
      const rg = this._gain(ctx, 0.1)
      const dg = this._gain(ctx, 0.4)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const g = this._ambient(ctx, 392, t, 0.18, 0.07, 0.015)
      g.connect(out); g.connect(dly.node); g.connect(rev)
    })
  }

  roundWin() {
    if (this._tryPlaySoundpack('roundWin')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 4, 4)
      const dly = this._delay(ctx, 0.15, 0.6)
      const rg = this._gain(ctx, 0.15)
      const dg = this._gain(ctx, 0.7)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [587.33, 739.99, 880, 1108.73]
      notes.forEach((freq, i) => {
        const g = this._ambient(ctx, freq, t + i * 0.08, 0.3, 0.09, 0.03)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  roundLoss() {
    if (this._tryPlaySoundpack('roundLoss')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 3, 3)
      const dly = this._delay(ctx, 0.12, 0.5)
      const rg = this._gain(ctx, 0.14)
      const dg = this._gain(ctx, 0.6)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [440, 369.99, 311.13, 261.63]
      notes.forEach((freq, i) => {
        const g = this._ambient(ctx, freq, t + i * 0.1, 0.25, 0.08, 0.03)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  suddenDeath() {
    if (this._tryPlaySoundpack('suddenDeath')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 3, 3)
      const dly = this._delay(ctx, 0.1, 0.5)
      const rg = this._gain(ctx, 0.15)
      const dg = this._gain(ctx, 0.6)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [261.63, 246.94, 220, 196]
      notes.forEach((freq, i) => {
        const g = this._ambient(ctx, freq, t + i * 0.3, 0.35, 0.1, 0.02)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  overtime() {
    if (this._tryPlaySoundpack('overtime')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 3, 3)
      const dly = this._delay(ctx, 0.12, 0.5)
      const rg = this._gain(ctx, 0.14)
      const dg = this._gain(ctx, 0.6)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [349.23, 349.23, 440]
      notes.forEach((freq, i) => {
        const g = this._ambient(ctx, freq, t + i * 0.15, 0.25, 0.09, 0.02)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  intermission() {
    if (this._tryPlaySoundpack('intermission')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 2, 2)
      const dly = this._delay(ctx, 0.1, 0.4)
      const rg = this._gain(ctx, 0.1)
      const dg = this._gain(ctx, 0.5)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [440, 493.88, 523.25]
      notes.forEach((freq, i) => {
        const g = this._ambient(ctx, freq, t + i * 0.2, 0.3, 0.08, 0.02)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  pause() {
    if (this._tryPlaySoundpack('pause')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 2, 2)
      const dly = this._delay(ctx, 0.06, 0.35)
      const rg = this._gain(ctx, 0.1)
      const dg = this._gain(ctx, 0.4)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const g = this._ambient(ctx, 330, t, 0.12, 0.07, 0.01)
      g.connect(out); g.connect(dly.node); g.connect(rev)
    })
  }

  resume() {
    if (this._tryPlaySoundpack('resume')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 2, 2)
      const dly = this._delay(ctx, 0.06, 0.4)
      const rg = this._gain(ctx, 0.1)
      const dg = this._gain(ctx, 0.45)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const g = this._ambient(ctx, 440, t, 0.12, 0.07, 0.01)
      g.connect(out); g.connect(dly.node); g.connect(rev)
    })
  }

  selectionChange() {
    if (this._tryPlaySoundpack('selectionChange')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 1.5, 1.5)
      const rg = this._gain(ctx, 0.08)
      rev.connect(rg); rg.connect(out)
      const g = this._ambient(ctx, 660, t, 0.07, 0.04, 0.008)
      g.connect(out); g.connect(rev)
    })
  }

  coinCollect() {
    if (this._tryPlaySoundpack('coinCollect')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 3, 3)
      const rg = this._gain(ctx, 0.1)
      rev.connect(rg); rg.connect(out)
      const notes = [987.77, 1318.51]
      notes.forEach((freq, i) => {
        const g = this._ambient(ctx, freq, t + i * 0.05, 0.1, 0.07, 0.01)
        g.connect(out); g.connect(rev)
      })
    })
  }

  xpGain() {
    if (this._tryPlaySoundpack('xpGain')) return
    this._play((ctx) => {
      const t = ctx.currentTime
      const out = this._out
      const rev = this._reverb(ctx, 3, 3)
      const dly = this._delay(ctx, 0.1, 0.5)
      const rg = this._gain(ctx, 0.1)
      const dg = this._gain(ctx, 0.5)
      rev.connect(rg); rg.connect(out)
      dly.node.connect(dg); dg.connect(out)
      const notes = [523.25, 659.25]
      notes.forEach((freq, i) => {
        const g = this._ambient(ctx, freq, t + i * 0.08, 0.15, 0.07, 0.015)
        g.connect(out); g.connect(dly.node); g.connect(rev)
      })
    })
  }

  winner() {
    this.victory()
  }

  loser() {
    this.defeat()
  }
}

export const soundService = new SoundService()
export default soundService
