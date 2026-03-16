let pending = new Set()
let unlocked = false
let listening = false
let unlockHandler = null
let audioContext = null

const isSecureOrigin = () => {
  if (typeof window === 'undefined') return true
  const origin = window.location?.origin || ''
  return origin.startsWith('https://') || 
         origin.startsWith('http://localhost') || 
         origin.startsWith('http://127.0.0.1') ||
         origin.startsWith('voltchat://') ||
         origin.startsWith('tauri://')
}

const getAudioContext = () => {
  if (!audioContext) {
    const AudioContext = window.AudioContext || window.webkitAudioContext
    if (AudioContext) {
      audioContext = new AudioContext()
    }
  }
  if (audioContext && audioContext.state === 'suspended') {
    audioContext.resume().catch(() => {})
  }
  return audioContext
}

const tryPlay = (el) => {
  if (!el) return
  getAudioContext()
  const playPromise = el.play()
  if (playPromise) {
    playPromise.catch((err) => {
      console.warn('[voiceAudio] Play failed:', err?.name, isSecureOrigin() ? '' : '(insecure origin)')
      pending.add(el)
    })
  }
}

const addGestureListeners = () => {
  if (listening) return
  listening = true

  unlockHandler = () => {
    unlocked = true
    getAudioContext()
    removeGestureListeners()
    for (const el of pending) {
      tryPlay(el)
    }
    pending.clear()
  }

  const opts = { capture: true, passive: true }
  document.addEventListener('pointerdown', unlockHandler, opts)
  document.addEventListener('keydown', unlockHandler, opts)
  document.addEventListener('touchstart', unlockHandler, opts)
}

const removeGestureListeners = () => {
  if (!unlockHandler) return
  const opts = { capture: true }
  document.removeEventListener('pointerdown', unlockHandler, opts)
  document.removeEventListener('keydown', unlockHandler, opts)
  document.removeEventListener('touchstart', unlockHandler, opts)
  unlockHandler = null
  listening = false
}

const register = (el) => {
  if (!el) return
  el.autoplay = true
  el.playsInline = true
  el.muted = false
  el.volume = 1
  getAudioContext()
  if (!unlocked) addGestureListeners()
  tryPlay(el)
}

const unlock = () => {
  if (unlocked) return
  getAudioContext()
  addGestureListeners()
  if (unlockHandler) unlockHandler()
}

const forget = (el) => {
  if (!el) return
  pending.delete(el)
}

export const voiceAudio = {
  register,
  unlock,
  forget,
  getAudioContext,
}
