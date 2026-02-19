const pending = new Set()
let unlocked = false
let listening = false
let unlockHandler = null

const tryPlay = (el) => {
  if (!el) return
  el.play().catch(() => pending.add(el))
}

const addGestureListeners = () => {
  if (listening) return
  listening = true

  unlockHandler = () => {
    unlocked = true
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
  if (!unlocked) addGestureListeners()
  tryPlay(el)
}

const unlock = () => {
  if (unlocked) return
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
}
