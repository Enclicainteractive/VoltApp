export const WIDGET_STORAGE_KEY = 'voltchat_widgets_global'
export const WIDGETS_UPDATED_EVENT = 'voltchat:widgets-updated'

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

export const createWidget = (type = 'image') => ({
  id: `widget_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  type,
  title: type === 'text' ? 'Text Widget' : type === 'gif' ? 'GIF Widget' : 'Image Widget',
  src: '',
  content: '',
  width: type === 'text' ? 260 : 280,
  height: type === 'text' ? 120 : 160,
  x: 16,
  y: 16,
  color: '#ffffff',
  background: 'rgba(10, 10, 14, 0.72)'
})

const normalizeWidget = (widget = {}) => {
  const type = ['image', 'gif', 'text'].includes(widget.type) ? widget.type : 'image'
  return {
    ...createWidget(type),
    ...widget,
    type,
    width: clamp(Number(widget.width ?? (type === 'text' ? 260 : 280)) || (type === 'text' ? 260 : 280), 140, 640),
    height: clamp(Number(widget.height ?? (type === 'text' ? 120 : 160)) || (type === 'text' ? 120 : 160), 90, 420),
    x: Math.max(0, Number(widget.x ?? 16) || 16),
    y: Math.max(0, Number(widget.y ?? 16) || 16),
    title: String(widget.title ?? '').trim() || (type === 'text' ? 'Text Widget' : type === 'gif' ? 'GIF Widget' : 'Image Widget'),
    src: typeof widget.src === 'string' ? widget.src : '',
    content: typeof widget.content === 'string' ? widget.content : '',
    color: typeof widget.color === 'string' ? widget.color : '#ffffff',
    background: typeof widget.background === 'string' ? widget.background : 'rgba(10, 10, 14, 0.72)'
  }
}

export const loadWidgets = () => {
  try {
    const stored = localStorage.getItem(WIDGET_STORAGE_KEY)
    const parsed = stored ? JSON.parse(stored) : []
    return Array.isArray(parsed) ? parsed.map(normalizeWidget) : []
  } catch {
    return []
  }
}

export const saveWidgets = (widgets) => {
  const normalized = Array.isArray(widgets) ? widgets.map(normalizeWidget) : []
  try {
    localStorage.setItem(WIDGET_STORAGE_KEY, JSON.stringify(normalized))
    window.dispatchEvent(new CustomEvent(WIDGETS_UPDATED_EVENT, { detail: normalized }))
  } catch {}
  return normalized
}

export const subscribeWidgets = (listener) => {
  const handleUpdated = (event) => {
    listener(Array.isArray(event.detail) ? event.detail.map(normalizeWidget) : loadWidgets())
  }
  const handleStorage = (event) => {
    if (event.key === WIDGET_STORAGE_KEY) {
      listener(loadWidgets())
    }
  }
  window.addEventListener(WIDGETS_UPDATED_EVENT, handleUpdated)
  window.addEventListener('storage', handleStorage)
  return () => {
    window.removeEventListener(WIDGETS_UPDATED_EVENT, handleUpdated)
    window.removeEventListener('storage', handleStorage)
  }
}
