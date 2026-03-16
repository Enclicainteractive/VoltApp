const STORAGE_PREFIX = 'voltchat_voice_overlays_v1'

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

export const createVoiceOverlay = (type = 'image') => ({
  id: `overlay_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  type,
  title: type === 'text' ? 'Text Overlay' : type === 'gif' ? 'GIF Overlay' : 'Image Overlay',
  src: '',
  content: '',
  x: 32,
  y: 32,
  width: type === 'text' ? 260 : 220,
  height: type === 'text' ? 120 : 160,
  stageWidth: 1280,
  stageHeight: 720,
  color: '#ffffff',
  background: 'rgba(7, 10, 18, 0.58)'
})

const normalizeVoiceOverlay = (overlay = {}) => {
  const type = ['image', 'gif', 'text'].includes(overlay.type) ? overlay.type : 'image'
  return {
    ...createVoiceOverlay(type),
    ...overlay,
    type,
    width: clamp(Number(overlay.width ?? (type === 'text' ? 260 : 220)) || (type === 'text' ? 260 : 220), 140, 640),
    height: clamp(Number(overlay.height ?? (type === 'text' ? 120 : 160)) || (type === 'text' ? 120 : 160), 90, 420),
    x: Math.max(0, Number(overlay.x ?? 32) || 32),
    y: Math.max(0, Number(overlay.y ?? 32) || 32),
    stageWidth: Math.max(1, Number(overlay.stageWidth ?? 1280) || 1280),
    stageHeight: Math.max(1, Number(overlay.stageHeight ?? 720) || 720),
    title: String(overlay.title ?? '').trim() || createVoiceOverlay(type).title,
    src: typeof overlay.src === 'string' ? overlay.src : '',
    content: typeof overlay.content === 'string' ? overlay.content : '',
    color: typeof overlay.color === 'string' ? overlay.color : '#ffffff',
    background: typeof overlay.background === 'string' ? overlay.background : 'rgba(7, 10, 18, 0.58)'
  }
}

const getStorageKey = (channelId) => `${STORAGE_PREFIX}:${channelId}`

export const loadVoiceOverlayState = (channelId) => {
  if (!channelId) {
    return { camera: [], screen: [], target: 'camera' }
  }
  try {
    const stored = localStorage.getItem(getStorageKey(channelId))
    const parsed = stored ? JSON.parse(stored) : null
    return {
      camera: Array.isArray(parsed?.camera) ? parsed.camera.map(normalizeVoiceOverlay) : [],
      screen: Array.isArray(parsed?.screen) ? parsed.screen.map(normalizeVoiceOverlay) : [],
      target: parsed?.target === 'screen' ? 'screen' : 'camera'
    }
  } catch {
    return { camera: [], screen: [], target: 'camera' }
  }
}

export const saveVoiceOverlayState = (channelId, state = {}) => {
  if (!channelId) return { camera: [], screen: [], target: 'camera' }
  const normalized = {
    camera: Array.isArray(state.camera) ? state.camera.map(normalizeVoiceOverlay) : [],
    screen: Array.isArray(state.screen) ? state.screen.map(normalizeVoiceOverlay) : [],
    target: state.target === 'screen' ? 'screen' : 'camera'
  }
  try {
    localStorage.setItem(getStorageKey(channelId), JSON.stringify(normalized))
  } catch {}
  return normalized
}
