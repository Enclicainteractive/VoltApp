import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Image as ImageIcon, Pencil, Plus, Sticker, Trash2, Type, Upload, X } from 'lucide-react'
import { useTranslation } from '../hooks/useTranslation'
import { createVoiceOverlay } from '../services/voiceOverlayService'
import '../assets/styles/StreamOverlayModal.css'

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const MIN_WIDTH = 140
const MIN_HEIGHT = 90
const MAX_WIDTH = 640
const MAX_HEIGHT = 420

const createOverlayDraft = (type = 'image') => createVoiceOverlay(type)

const withBackgroundHex = (overlay) => {
  if (!overlay?.background || typeof overlay.background !== 'string') return overlay
  const match = overlay.background.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
  if (!match) return overlay
  const [, r, g, b] = match
  const backgroundHex = `#${[r, g, b].map((channel) => Number(channel).toString(16).padStart(2, '0')).join('')}`
  return { ...overlay, backgroundHex }
}

const StreamOverlayModal = ({ isOpen, onClose, target, onTargetChange, sourceStream, overlays, onChange }) => {
  const { t } = useTranslation()
  const previewRef = useRef(null)
  const previewStageRef = useRef(null)
  const uploadInputRef = useRef(null)
  const [draft, setDraft] = useState(() => createOverlayDraft('image'))
  const [selectedOverlayId, setSelectedOverlayId] = useState(null)
  const [editingOverlayId, setEditingOverlayId] = useState(null)

  const getStageBounds = useCallback(() => {
    const rect = previewStageRef.current?.getBoundingClientRect()
    return rect ? { width: rect.width, height: rect.height } : null
  }, [])

  const normalizeOverlayForStage = useCallback((overlay) => {
    const bounds = getStageBounds()
    const width = clamp(Number(overlay.width) || (overlay.type === 'text' ? 260 : 220), MIN_WIDTH, MAX_WIDTH)
    const height = clamp(Number(overlay.height) || (overlay.type === 'text' ? 120 : 160), MIN_HEIGHT, MAX_HEIGHT)
    const maxX = bounds ? Math.max(0, bounds.width - width) : Number.MAX_SAFE_INTEGER
    const maxY = bounds ? Math.max(0, bounds.height - height) : Number.MAX_SAFE_INTEGER
    return {
      ...overlay,
      width,
      height,
      x: clamp(Number(overlay.x) || 0, 0, maxX),
      y: clamp(Number(overlay.y) || 0, 0, maxY),
      stageWidth: Math.max(1, Math.round(bounds?.width || Number(overlay.stageWidth) || 1280)),
      stageHeight: Math.max(1, Math.round(bounds?.height || Number(overlay.stageHeight) || 720))
    }
  }, [getStageBounds])

  const beginCreateDraft = useCallback((type) => {
    setEditingOverlayId(null)
    setSelectedOverlayId(null)
    setDraft(createOverlayDraft(type))
  }, [])

  const beginEditOverlay = useCallback((overlayId) => {
    const overlay = (overlays || []).find((item) => item.id === overlayId)
    if (!overlay) return
    setSelectedOverlayId(overlayId)
    setEditingOverlayId(overlayId)
    setDraft(withBackgroundHex(overlay))
  }, [overlays])

  const updateOverlay = useCallback((overlayId, updater) => {
    const nextOverlays = (Array.isArray(overlays) ? overlays : []).map((overlay) => {
      if (overlay.id !== overlayId) return overlay
      const updated = typeof updater === 'function' ? updater(overlay) : { ...overlay, ...updater }
      return normalizeOverlayForStage(updated)
    })
    onChange?.(nextOverlays)
    const updatedOverlay = nextOverlays.find((overlay) => overlay.id === overlayId)
    if (updatedOverlay && editingOverlayId === overlayId) {
      setDraft(withBackgroundHex(updatedOverlay))
    }
  }, [editingOverlayId, normalizeOverlayForStage, onChange, overlays])

  const handlePointerTransform = useCallback((overlayId, event, mode) => {
    event.preventDefault()
    event.stopPropagation()
    const startBounds = getStageBounds()
    const targetOverlay = (overlays || []).find((overlay) => overlay.id === overlayId)
    if (!startBounds || !targetOverlay) return

    setSelectedOverlayId(overlayId)
    const startX = event.clientX
    const startY = event.clientY
    const baseX = Number(targetOverlay.x) || 0
    const baseY = Number(targetOverlay.y) || 0
    const baseWidth = Number(targetOverlay.width) || 220
    const baseHeight = Number(targetOverlay.height) || 160

    const onMove = (moveEvent) => {
      const deltaX = moveEvent.clientX - startX
      const deltaY = moveEvent.clientY - startY
      updateOverlay(overlayId, (overlay) => {
        if (mode === 'move') {
          const width = Number(overlay.width) || baseWidth
          const height = Number(overlay.height) || baseHeight
          return {
            ...overlay,
            x: clamp(baseX + deltaX, 0, Math.max(0, startBounds.width - width)),
            y: clamp(baseY + deltaY, 0, Math.max(0, startBounds.height - height))
          }
        }
        const width = clamp(baseWidth + deltaX, MIN_WIDTH, Math.min(MAX_WIDTH, startBounds.width))
        const height = clamp(baseHeight + deltaY, MIN_HEIGHT, Math.min(MAX_HEIGHT, startBounds.height))
        return {
          ...overlay,
          width,
          height,
          x: clamp(baseX, 0, Math.max(0, startBounds.width - width)),
          y: clamp(baseY, 0, Math.max(0, startBounds.height - height))
        }
      })
    }

    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [getStageBounds, overlays, updateOverlay])

  useEffect(() => {
    const node = previewRef.current
    if (!node) return
    if (!sourceStream) {
      node.srcObject = null
      return
    }
    node.srcObject = sourceStream
    node.play?.().catch(() => {})
    return () => {
      if (node.srcObject === sourceStream) {
        node.srcObject = null
      }
    }
  }, [sourceStream])

  const validDraft = useMemo(() => {
    if (draft.type === 'text') return Boolean(draft.content?.trim())
    return Boolean(draft.src?.trim())
  }, [draft])

  if (!isOpen) return null

  const addOrUpdateOverlay = () => {
    if (!validDraft) return
    const nextOverlay = normalizeOverlayForStage({
      ...draft,
      id: editingOverlayId || draft.id,
      title: draft.title?.trim() || createOverlayDraft(draft.type).title,
      content: draft.type === 'text' ? draft.content.trim() : '',
      src: draft.type === 'text' ? '' : draft.src.trim()
    })
    const base = Array.isArray(overlays) ? overlays : []
    const nextOverlays = editingOverlayId
      ? base.map((overlay) => overlay.id === editingOverlayId ? nextOverlay : overlay)
      : [...base, nextOverlay]
    onChange?.(nextOverlays)
    setSelectedOverlayId(nextOverlay.id)
    setEditingOverlayId(nextOverlay.id)
    setDraft(withBackgroundHex(nextOverlay))
  }

  const removeOverlay = (overlayId) => {
    onChange?.((overlays || []).filter((overlay) => overlay.id !== overlayId))
    if (selectedOverlayId === overlayId) setSelectedOverlayId(null)
    if (editingOverlayId === overlayId) {
      setEditingOverlayId(null)
      setDraft(createOverlayDraft(draft.type))
    }
  }

  const handleUpload = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setDraft((prev) => ({ ...prev, src: String(reader.result || '') }))
    }
    reader.readAsDataURL(file)
    event.target.value = ''
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content stream-overlay-modal" onClick={(event) => event.stopPropagation()}>
        <div className="stream-overlay-head">
          <div>
            <h2>{t('voice.overlayStudio', 'Overlay Studio')}</h2>
            <p>{t('voice.overlayStudioDesc', 'Add text, images, and GIF overlays to your camera or screen share. Other peers will see the composited result.')}</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} title={t('common.close', 'Close')}>
            <X size={18} />
          </button>
        </div>

        <div className="stream-overlay-layout">
          <div className="stream-overlay-preview-shell">
            <div className="stream-overlay-targets">
              <button type="button" className={target === 'camera' ? 'active' : ''} onClick={() => onTargetChange?.('camera')}>
                {t('voice.cameraFeed', 'Camera')}
              </button>
              <button type="button" className={target === 'screen' ? 'active' : ''} onClick={() => onTargetChange?.('screen')}>
                {t('voice.screenFeed', 'Screen Share')}
              </button>
            </div>
            <div
              ref={previewStageRef}
              className={`stream-overlay-preview ${selectedOverlayId ? 'has-selection' : ''}`}
              onMouseDown={() => setSelectedOverlayId(null)}
            >
              {sourceStream ? <video ref={previewRef} autoPlay playsInline muted /> : null}
              {!sourceStream ? (
                <div className="stream-overlay-empty">{t('voice.overlayNoSource', 'Start your camera or screen share to preview overlays here.')}</div>
              ) : null}
              {(overlays || []).map((overlay) => (
                overlay.type === 'text' ? (
                  <div
                    key={overlay.id}
                    className={`stream-overlay-preview-item text ${selectedOverlayId === overlay.id ? 'selected' : ''}`}
                    style={{
                      left: `${overlay.x}px`,
                      top: `${overlay.y}px`,
                      width: `${overlay.width}px`,
                      minHeight: `${overlay.height}px`,
                      color: overlay.color || '#fff',
                      background: overlay.background || 'rgba(7, 10, 18, 0.58)'
                    }}
                    onMouseDown={(event) => {
                      if (event.target.closest('button')) return
                      handlePointerTransform(overlay.id, event, 'move')
                    }}
                    onClick={(event) => {
                      event.stopPropagation()
                      setSelectedOverlayId(overlay.id)
                    }}
                  >
                    <div className="stream-overlay-box-toolbar">
                      <button type="button" className="stream-overlay-box-btn" onClick={() => beginEditOverlay(overlay.id)} title={t('common.edit', 'Edit')}>
                        <Pencil size={13} />
                      </button>
                      <button type="button" className="stream-overlay-box-btn danger" onClick={() => removeOverlay(overlay.id)} title={t('common.remove', 'Remove')}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <strong>{overlay.title}</strong>
                    <span>{overlay.content}</span>
                    <button type="button" className="stream-overlay-resize-handle" onMouseDown={(event) => handlePointerTransform(overlay.id, event, 'resize')} title={t('chat.resizeWidget', 'Resize widget')} />
                  </div>
                ) : overlay.src ? (
                  <div
                    key={overlay.id}
                    className={`stream-overlay-preview-item ${selectedOverlayId === overlay.id ? 'selected' : ''}`}
                    style={{
                      left: `${overlay.x}px`,
                      top: `${overlay.y}px`,
                      width: `${overlay.width}px`,
                      height: `${overlay.height}px`
                    }}
                    onMouseDown={(event) => {
                      if (event.target.closest('button')) return
                      handlePointerTransform(overlay.id, event, 'move')
                    }}
                    onClick={(event) => {
                      event.stopPropagation()
                      setSelectedOverlayId(overlay.id)
                    }}
                  >
                    <div className="stream-overlay-box-toolbar">
                      <button type="button" className="stream-overlay-box-btn" onClick={() => beginEditOverlay(overlay.id)} title={t('common.edit', 'Edit')}>
                        <Pencil size={13} />
                      </button>
                      <button type="button" className="stream-overlay-box-btn danger" onClick={() => removeOverlay(overlay.id)} title={t('common.remove', 'Remove')}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <img src={overlay.src} alt={overlay.title || 'overlay'} />
                    <button type="button" className="stream-overlay-resize-handle" onMouseDown={(event) => handlePointerTransform(overlay.id, event, 'resize')} title={t('chat.resizeWidget', 'Resize widget')} />
                  </div>
                ) : null
              ))}
            </div>
          </div>

          <div className="stream-overlay-editor">
            <div className="stream-overlay-type-row">
              <button type="button" className={draft.type === 'image' ? 'active' : ''} onClick={() => beginCreateDraft('image')}>
                <ImageIcon size={14} />
                {t('chat.imageWidget', 'Image')}
              </button>
              <button type="button" className={draft.type === 'gif' ? 'active' : ''} onClick={() => beginCreateDraft('gif')}>
                <Sticker size={14} />
                {t('chat.gifWidget', 'GIF')}
              </button>
              <button type="button" className={draft.type === 'text' ? 'active' : ''} onClick={() => beginCreateDraft('text')}>
                <Type size={14} />
                {t('chat.textWidget', 'Text')}
              </button>
            </div>

            <input
              className="input"
              type="text"
              value={draft.title || ''}
              placeholder={t('chat.widgetTitle', 'Widget title')}
              onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
            />

            {draft.type === 'text' ? (
              <textarea
                className="input stream-overlay-textarea"
                value={draft.content || ''}
                placeholder={t('chat.widgetText', 'Type the text you want to float on screen')}
                onChange={(event) => setDraft((prev) => ({ ...prev, content: event.target.value }))}
              />
            ) : (
              <div className="stream-overlay-url-row">
                <input
                  className="input"
                  type="text"
                  value={draft.src || ''}
                  placeholder={draft.type === 'gif' ? t('chat.widgetGifUrl', 'Paste a GIF URL') : t('chat.widgetImageUrl', 'Paste any image URL')}
                  onChange={(event) => setDraft((prev) => ({ ...prev, src: event.target.value }))}
                />
                <button type="button" className="btn btn-secondary" onClick={() => uploadInputRef.current?.click()}>
                  <Upload size={14} />
                  {t('chat.uploadWidgetImage', 'Upload')}
                </button>
              </div>
            )}

            <div className="stream-overlay-grid">
              <label><span>X</span><input className="input" type="number" value={draft.x} onChange={(event) => setDraft((prev) => ({ ...prev, x: Number(event.target.value) || 0 }))} /></label>
              <label><span>Y</span><input className="input" type="number" value={draft.y} onChange={(event) => setDraft((prev) => ({ ...prev, y: Number(event.target.value) || 0 }))} /></label>
              <label><span>{t('chat.width', 'Width')}</span><input className="input" type="number" value={draft.width} onChange={(event) => setDraft((prev) => ({ ...prev, width: Number(event.target.value) || MIN_WIDTH }))} /></label>
              <label><span>{t('chat.height', 'Height')}</span><input className="input" type="number" value={draft.height} onChange={(event) => setDraft((prev) => ({ ...prev, height: Number(event.target.value) || MIN_HEIGHT }))} /></label>
            </div>

            {draft.type === 'text' ? (
              <div className="stream-overlay-grid">
                <label><span>{t('chat.textColor', 'Text color')}</span><input type="color" value={draft.color || '#ffffff'} onChange={(event) => setDraft((prev) => ({ ...prev, color: event.target.value }))} /></label>
                <label><span>{t('chat.widgetBackground', 'Background')}</span><input type="color" value={draft.backgroundHex || '#101418'} onChange={(event) => {
                  const hex = event.target.value
                  const r = parseInt(hex.slice(1, 3), 16)
                  const g = parseInt(hex.slice(3, 5), 16)
                  const b = parseInt(hex.slice(5, 7), 16)
                  setDraft((prev) => ({ ...prev, backgroundHex: hex, background: `rgba(${r}, ${g}, ${b}, 0.72)` }))
                }} /></label>
              </div>
            ) : null}

            <div className="stream-overlay-actions">
              <button type="button" className="btn btn-primary" onClick={addOrUpdateOverlay} disabled={!validDraft}>
                {editingOverlayId ? <Check size={14} /> : <Plus size={14} />}
                {editingOverlayId ? t('common.saveChanges', 'Save Changes') : t('voice.addOverlay', 'Add Overlay')}
              </button>
              {editingOverlayId ? (
                <button type="button" className="btn btn-secondary" onClick={() => beginCreateDraft(draft.type)}>
                  <Plus size={14} />
                  {t('voice.newOverlay', 'New Overlay')}
                </button>
              ) : null}
            </div>

            <div className="stream-overlay-editor-hint">
              {t('voice.overlayEditorHint', 'Click an overlay to select it, drag it on the preview, and use the corner handle to resize.')}
            </div>

            {editingOverlayId ? (
              <div className="stream-overlay-active-card">
                <strong>{t('common.editing', 'Editing')}</strong>
                <span>{draft.title || draft.type}</span>
              </div>
            ) : null}

            <div className="stream-overlay-list">
              {(overlays || []).length > 0 ? (
                overlays.map((overlay) => (
                  <div
                    key={overlay.id}
                    className={`stream-overlay-list-item ${selectedOverlayId === overlay.id ? 'selected' : ''}`}
                    onClick={() => beginEditOverlay(overlay.id)}
                  >
                    <div>
                      <strong>{overlay.title || overlay.type}</strong>
                      <span>{overlay.type} • {overlay.width}x{overlay.height} • {overlay.x},{overlay.y}</span>
                    </div>
                    <div className="stream-overlay-list-actions">
                      <button type="button" className="icon-btn" onClick={(event) => {
                        event.stopPropagation()
                        beginEditOverlay(overlay.id)
                      }} title={t('common.edit', 'Edit')}>
                        <Pencil size={14} />
                      </button>
                      <button type="button" className="icon-btn" onClick={(event) => {
                        event.stopPropagation()
                        removeOverlay(overlay.id)
                      }} title={t('common.remove', 'Remove')}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="stream-overlay-list-empty">{t('voice.noOverlaysYet', 'No overlays added for this feed yet.')}</div>
              )}
            </div>
          </div>
        </div>

        <input ref={uploadInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleUpload} />
      </div>
    </div>
  )
}

export default StreamOverlayModal
