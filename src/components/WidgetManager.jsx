import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Eraser, Image as ImageIcon, LayoutGrid, Pencil, Plus, Sticker, Trash2, Type, Upload, X } from 'lucide-react'
import { useTranslation } from '../hooks/useTranslation'
import { createWidget, loadWidgets, saveWidgets, subscribeWidgets } from '../services/widgetService'
import '../assets/styles/WidgetManager.css'

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const MIN_WIDTH = 140
const MIN_HEIGHT = 90
const MAX_WIDTH = 640
const MAX_HEIGHT = 420

const withBackgroundHex = (widget) => {
  if (!widget?.background || typeof widget.background !== 'string') return widget
  const match = widget.background.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
  if (!match) return widget
  const [, r, g, b] = match
  return {
    ...widget,
    backgroundHex: `#${[r, g, b].map((channel) => Number(channel).toString(16).padStart(2, '0')).join('')}`
  }
}

const WidgetManager = ({ className = '', showClose = false, onClose = null }) => {
  const { t } = useTranslation()
  const [widgets, setWidgets] = useState([])
  const [draftWidget, setDraftWidget] = useState(() => createWidget('image'))
  const [selectedWidgetId, setSelectedWidgetId] = useState(null)
  const [editingWidgetId, setEditingWidgetId] = useState(null)
  const fileInputRef = useRef(null)
  const previewRef = useRef(null)

  useEffect(() => {
    setWidgets(loadWidgets())
    return subscribeWidgets(setWidgets)
  }, [])

  const draftType = draftWidget.type || 'image'
  const activeWidget = useMemo(
    () => widgets.find((widget) => widget.id === (editingWidgetId || selectedWidgetId)) || null,
    [editingWidgetId, selectedWidgetId, widgets]
  )

  const getPreviewBounds = useCallback(() => {
    const rect = previewRef.current?.getBoundingClientRect()
    return rect ? { width: rect.width, height: rect.height } : null
  }, [])

  const normalizeWidgetForStage = useCallback((widget) => {
    const bounds = getPreviewBounds()
    const width = clamp(Number(widget.width) || (widget.type === 'text' ? 260 : 280), MIN_WIDTH, MAX_WIDTH)
    const height = clamp(Number(widget.height) || (widget.type === 'text' ? 120 : 160), MIN_HEIGHT, MAX_HEIGHT)
    const maxX = bounds ? Math.max(0, bounds.width - width) : Number.MAX_SAFE_INTEGER
    const maxY = bounds ? Math.max(0, bounds.height - height) : Number.MAX_SAFE_INTEGER
    return {
      ...widget,
      width,
      height,
      x: clamp(Number(widget.x) || 0, 0, maxX),
      y: clamp(Number(widget.y) || 0, 0, maxY)
    }
  }, [getPreviewBounds])

  const persistWidgets = useCallback((nextWidgets) => {
    saveWidgets(nextWidgets.map((widget) => normalizeWidgetForStage(widget)))
  }, [normalizeWidgetForStage])

  const editWidget = useCallback((widgetId) => {
    const widget = widgets.find((item) => item.id === widgetId)
    if (!widget) return
    setSelectedWidgetId(widgetId)
    setEditingWidgetId(widgetId)
    setDraftWidget(withBackgroundHex(widget))
  }, [widgets])

  const updateWidget = useCallback((widgetId, updater) => {
    const nextWidgets = widgets.map((widget) => {
      if (widget.id !== widgetId) return widget
      const updated = typeof updater === 'function' ? updater(widget) : { ...widget, ...updater }
      return normalizeWidgetForStage(updated)
    })
    persistWidgets(nextWidgets)
    const updatedWidget = nextWidgets.find((widget) => widget.id === widgetId)
    if (updatedWidget && editingWidgetId === widgetId) {
      setDraftWidget(withBackgroundHex(updatedWidget))
    }
  }, [editingWidgetId, normalizeWidgetForStage, persistWidgets, widgets])

  const handlePointerTransform = useCallback((widgetId, event, mode) => {
    event.preventDefault()
    event.stopPropagation()
    const bounds = getPreviewBounds()
    const targetWidget = widgets.find((widget) => widget.id === widgetId)
    if (!bounds || !targetWidget) return

    setSelectedWidgetId(widgetId)
    const startX = event.clientX
    const startY = event.clientY
    const baseX = Number(targetWidget.x) || 0
    const baseY = Number(targetWidget.y) || 0
    const baseWidth = Number(targetWidget.width) || 280
    const baseHeight = Number(targetWidget.height) || 160

    const onMove = (moveEvent) => {
      const deltaX = moveEvent.clientX - startX
      const deltaY = moveEvent.clientY - startY
      updateWidget(widgetId, (widget) => {
        if (mode === 'move') {
          const width = Number(widget.width) || baseWidth
          const height = Number(widget.height) || baseHeight
          return {
            ...widget,
            x: clamp(baseX + deltaX, 0, Math.max(0, bounds.width - width)),
            y: clamp(baseY + deltaY, 0, Math.max(0, bounds.height - height))
          }
        }
        const width = clamp(baseWidth + deltaX, MIN_WIDTH, Math.min(MAX_WIDTH, bounds.width))
        const height = clamp(baseHeight + deltaY, MIN_HEIGHT, Math.min(MAX_HEIGHT, bounds.height))
        return {
          ...widget,
          width,
          height,
          x: clamp(baseX, 0, Math.max(0, bounds.width - width)),
          y: clamp(baseY, 0, Math.max(0, bounds.height - height))
        }
      })
    }

    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [getPreviewBounds, updateWidget, widgets])

  const handleWidgetUpload = useCallback((event) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setDraftWidget((prev) => ({ ...prev, src: String(reader.result || '') }))
    }
    reader.readAsDataURL(file)
    event.target.value = ''
  }, [])

  const resetDraft = useCallback((type = draftType) => {
    setEditingWidgetId(null)
    setSelectedWidgetId(null)
    setDraftWidget(createWidget(type))
  }, [draftType])

  const isValidDraft = useMemo(() => {
    if (draftType === 'text') return Boolean(draftWidget.content?.trim())
    return Boolean(draftWidget.src?.trim())
  }, [draftType, draftWidget])

  const addOrUpdateWidget = useCallback(() => {
    if (!isValidDraft) return
    const normalized = normalizeWidgetForStage({
      ...draftWidget,
      id: editingWidgetId || draftWidget.id,
      title: draftWidget.title?.trim() || createWidget(draftType).title,
      content: draftType === 'text' ? (draftWidget.content || '').trim() : '',
      src: draftType === 'text' ? '' : (draftWidget.src || '').trim()
    })
    const nextWidgets = editingWidgetId
      ? widgets.map((widget) => widget.id === editingWidgetId ? normalized : widget)
      : [...widgets, normalized]
    persistWidgets(nextWidgets)
    setSelectedWidgetId(normalized.id)
    setEditingWidgetId(normalized.id)
    setDraftWidget(withBackgroundHex(normalized))
  }, [draftType, draftWidget, editingWidgetId, isValidDraft, normalizeWidgetForStage, persistWidgets, widgets])

  const removeWidget = useCallback((widgetId) => {
    persistWidgets(widgets.filter((widget) => widget.id !== widgetId))
    if (selectedWidgetId === widgetId) setSelectedWidgetId(null)
    if (editingWidgetId === widgetId) {
      setEditingWidgetId(null)
      setDraftWidget(createWidget(draftType))
    }
  }, [draftType, editingWidgetId, persistWidgets, selectedWidgetId, widgets])

  const changeType = useCallback((type) => {
    setEditingWidgetId(null)
    setSelectedWidgetId(null)
    setDraftWidget((prev) => ({
      ...createWidget(type),
      title: prev.title?.trim() ? prev.title : createWidget(type).title
    }))
  }, [])

  return (
    <div className={`widget-manager ${className}`.trim()}>
      <div className="widget-manager-head">
        <div>
          <strong>{t('chat.widgets', 'Widgets')}</strong>
          <span>{t('chat.widgetsDesc', 'Add and manage universal widgets that float above chat.')}</span>
        </div>
        <div className="widget-manager-head-actions">
          <span className="widget-manager-count">{widgets.length} {t('chat.activeWidgets', 'active')}</span>
          {showClose ? (
            <button type="button" className="icon-btn" onClick={onClose} title={t('common.close', 'Close')}>
              <X size={14} />
            </button>
          ) : null}
        </div>
      </div>

      <div className="widget-manager-panel widget-manager-stage-shell">
        <div
          ref={previewRef}
          className="widget-stage"
          onMouseDown={() => setSelectedWidgetId(null)}
        >
          <div className="widget-stage-grid" />
          {widgets.map((widget) => (
            <div
              key={widget.id}
              className={`widget-stage-item ${widget.type === 'text' ? 'text' : 'media'} ${selectedWidgetId === widget.id ? 'selected' : ''}`}
              style={{
                width: `${widget.width}px`,
                height: `${widget.height}px`,
                left: `${widget.x}px`,
                top: `${widget.y}px`,
                color: widget.color || '#ffffff',
                background: widget.type === 'text' ? (widget.background || 'rgba(10, 10, 14, 0.72)') : undefined
              }}
              onMouseDown={(event) => {
                if (event.target.closest('button')) return
                handlePointerTransform(widget.id, event, 'move')
              }}
              onClick={(event) => {
                event.stopPropagation()
                setSelectedWidgetId(widget.id)
              }}
            >
              <div className="widget-stage-toolbar">
                <button type="button" className="widget-stage-btn" onClick={() => editWidget(widget.id)} title={t('common.edit', 'Edit')}>
                  <Pencil size={13} />
                </button>
                <button type="button" className="widget-stage-btn danger" onClick={() => removeWidget(widget.id)} title={t('common.remove', 'Remove')}>
                  <Trash2 size={13} />
                </button>
              </div>
              {widget.type === 'text' ? (
                <div className="widget-stage-text-copy">
                  <strong>{widget.title || t('chat.widget', 'Widget')}</strong>
                  <span>{widget.content}</span>
                </div>
              ) : (
                <>
                  <img src={widget.src} alt={widget.title || t('chat.widget', 'Widget')} />
                  <div className="widget-stage-label">{widget.title || t('chat.widget', 'Widget')}</div>
                </>
              )}
              <button type="button" className="widget-stage-resize" onMouseDown={(event) => handlePointerTransform(widget.id, event, 'resize')} title={t('chat.resizeWidget', 'Resize widget')} />
            </div>
          ))}
          {widgets.length === 0 ? (
            <div className="widget-stage-empty">
              <LayoutGrid size={24} />
              <span>{t('chat.noWidgetsYet', 'No widgets yet. Add one here and it will appear everywhere in VoltApp.')}</span>
            </div>
          ) : null}
        </div>

        <div className="widget-manager-hint">
          {t('chat.widgetStageHint', 'Click a widget to select it, drag it on the stage, and use the corner handle to resize.')}
        </div>
      </div>

      <div className="widget-manager-panel widget-manager-editor">
        <div className="widget-type-row">
          <button type="button" className={`widget-type-chip ${draftType === 'image' ? 'active' : ''}`} onClick={() => changeType('image')}>
            <ImageIcon size={14} />
            {t('chat.imageWidget', 'Image')}
          </button>
          <button type="button" className={`widget-type-chip ${draftType === 'gif' ? 'active' : ''}`} onClick={() => changeType('gif')}>
            <Sticker size={14} />
            {t('chat.gifWidget', 'GIF')}
          </button>
          <button type="button" className={`widget-type-chip ${draftType === 'text' ? 'active' : ''}`} onClick={() => changeType('text')}>
            <Type size={14} />
            {t('chat.textWidget', 'Text')}
          </button>
        </div>

        {activeWidget ? (
          <div className="widget-manager-active-card">
            <strong>{activeWidget.title || t('chat.widget', 'Widget')}</strong>
            <span>{activeWidget.type} • {activeWidget.width}x{activeWidget.height} • {activeWidget.x},{activeWidget.y}</span>
          </div>
        ) : null}

        <div className="chat-widget-editor-row">
          <input
            type="text"
            className="input"
            placeholder={t('chat.widgetTitle', 'Widget title')}
            value={draftWidget.title || ''}
            onChange={(event) => setDraftWidget((prev) => ({ ...prev, title: event.target.value }))}
          />
        </div>

        {draftType === 'text' ? (
          <>
            <div className="chat-widget-editor-row">
              <textarea
                className="input widget-textarea"
                placeholder={t('chat.widgetText', 'Type the text you want to float on screen')}
                value={draftWidget.content || ''}
                onChange={(event) => setDraftWidget((prev) => ({ ...prev, content: event.target.value }))}
              />
            </div>
            <div className="chat-widget-editor-row compact">
              <label>
                <span>{t('chat.textColor', 'Text color')}</span>
                <input
                  type="color"
                  value={draftWidget.color || '#ffffff'}
                  onChange={(event) => setDraftWidget((prev) => ({ ...prev, color: event.target.value }))}
                />
              </label>
              <label>
                <span>{t('chat.widgetBackground', 'Background')}</span>
                <input
                  type="color"
                  value={draftWidget.backgroundHex || '#101418'}
                  onChange={(event) => {
                    const hex = event.target.value
                    const r = parseInt(hex.slice(1, 3), 16)
                    const g = parseInt(hex.slice(3, 5), 16)
                    const b = parseInt(hex.slice(5, 7), 16)
                    setDraftWidget((prev) => ({
                      ...prev,
                      backgroundHex: hex,
                      background: `rgba(${r}, ${g}, ${b}, 0.72)`
                    }))
                  }}
                />
              </label>
            </div>
          </>
        ) : (
          <div className="chat-widget-editor-row">
            <input
              type="text"
              className="input"
              placeholder={draftType === 'gif' ? t('chat.widgetGifUrl', 'Paste a GIF URL') : t('chat.widgetImageUrl', 'Paste any image URL')}
              value={draftWidget.src || ''}
              onChange={(event) => setDraftWidget((prev) => ({ ...prev, src: event.target.value }))}
            />
            <button type="button" className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>
              <Upload size={14} />
              {t('chat.uploadWidgetImage', 'Upload')}
            </button>
          </div>
        )}

        <div className="chat-widget-editor-row compact">
          <label>
            <span>{t('chat.width', 'Width')}</span>
            <input
              type="range"
              min={MIN_WIDTH}
              max={MAX_WIDTH}
              value={draftWidget.width || 280}
              onChange={(event) => setDraftWidget((prev) => ({ ...prev, width: Number(event.target.value) }))}
            />
          </label>
          <label>
            <span>{t('chat.height', 'Height')}</span>
            <input
              type="range"
              min={MIN_HEIGHT}
              max={MAX_HEIGHT}
              value={draftWidget.height || 160}
              onChange={(event) => setDraftWidget((prev) => ({ ...prev, height: Number(event.target.value) }))}
            />
          </label>
        </div>

        <div className="chat-widget-editor-row compact">
          <label>
            <span>X</span>
            <input
              type="number"
              className="input"
              value={draftWidget.x || 0}
              onChange={(event) => setDraftWidget((prev) => ({ ...prev, x: Number(event.target.value) || 0 }))}
            />
          </label>
          <label>
            <span>Y</span>
            <input
              type="number"
              className="input"
              value={draftWidget.y || 0}
              onChange={(event) => setDraftWidget((prev) => ({ ...prev, y: Number(event.target.value) || 0 }))}
            />
          </label>
        </div>

        <div className="chat-widget-editor-actions">
          <button type="button" className="btn btn-primary" onClick={addOrUpdateWidget} disabled={!isValidDraft}>
            {editingWidgetId ? <Check size={14} /> : <Plus size={14} />}
            {editingWidgetId ? t('common.saveChanges', 'Save Changes') : draftType === 'text' ? t('chat.addTextWidget', 'Add Text Widget') : draftType === 'gif' ? t('chat.addGifWidget', 'Add GIF Widget') : t('chat.addImageWidget', 'Add Image Widget')}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => resetDraft(draftType)}>
            <Eraser size={14} />
            {editingWidgetId ? t('chat.newWidget', 'New Widget') : t('chat.resetWidgetDraft', 'Reset')}
          </button>
        </div>

        {widgets.length > 0 ? (
          <div className="chat-widget-list">
            {widgets.map((widget) => (
              <div
                key={widget.id}
                className={`chat-widget-list-item ${selectedWidgetId === widget.id ? 'selected' : ''}`}
                onClick={() => editWidget(widget.id)}
              >
                <div>
                  <strong>{widget.title || t('chat.widget', 'Widget')}</strong>
                  <span>{widget.type} • {widget.width}x{widget.height} • {widget.x},{widget.y}</span>
                </div>
                <div className="widget-list-actions">
                  <button type="button" className="icon-btn" onClick={(event) => {
                    event.stopPropagation()
                    editWidget(widget.id)
                  }} title={t('common.edit', 'Edit')}>
                    <Pencil size={14} />
                  </button>
                  <button type="button" className="icon-btn" onClick={(event) => {
                    event.stopPropagation()
                    removeWidget(widget.id)
                  }} title={t('chat.removeWidget', 'Remove widget')}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleWidgetUpload}
      />
    </div>
  )
}

export default WidgetManager
