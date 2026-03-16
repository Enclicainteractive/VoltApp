import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Palette,
  Sparkles,
  Library,
  Type,
  LayoutTemplate,
  Layers3,
  Download,
  Upload,
  Save,
  Plus,
  Trash2,
  RotateCcw,
  X
} from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'
import { FONTS } from './FontSelector'
import './ThemeCustomizer.css'

const ENTRANCE_OPTIONS = ['fade', 'slide', 'scale', 'bounce']
const EXIT_OPTIONS = ['fade-out', 'slide-down', 'scale-out', 'slide-right']
const SPEED_OPTIONS = ['slow', 'normal', 'fast', 'instant']
const BG_TYPES = [
  { value: 'solid', label: 'Solid' },
  { value: 'gradient', label: 'Gradient' },
  { value: 'pattern', label: 'Pattern' },
  { value: 'image', label: 'Image' }
]
const BG_PATTERNS = ['dots', 'lines', 'grid', 'noise', 'cross', 'diagonal', 'waves']
const FONT_OPTIONS = FONTS.map((font) => ({ value: font.id, label: font.name }))

const FALLBACK_DRAFT = {
  name: 'Custom Theme',
  mode: 'dark',
  font: 'default',
  primary: '#12d8ff',
  success: '#3be3b2',
  warning: '#fbbf24',
  danger: '#ff6b81',
  bgPrimary: '#08111e',
  bgSecondary: '#0c1a2c',
  bgTertiary: '#0f2137',
  bgQuaternary: '#142b46',
  textPrimary: '#e6f5ff',
  textSecondary: '#bad7f2',
  textMuted: '#7fa1c2',
  border: '#1e3a56',
  bgType: 'solid',
  bgImage: '',
  bgOpacity: 100,
  bgOverlay: '#08111e',
  bgOverlayOpacity: 32,
  bgGradientAngle: 135,
  bgGradientFrom: '#12d8ff',
  bgGradientTo: '#0c1a2c',
  bgPattern: 'dots',
  bgPatternOpacity: 12,
  surfaceAlphaPrimary: 82,
  surfaceAlphaSecondary: 78,
  surfaceAlphaTertiary: 75,
  surfaceAlphaQuaternary: 72,
  animationSpeed: 'normal',
  entranceAnimation: 'fade',
  exitAnimation: 'fade-out',
  reducedMotion: false,
  smoothTransitions: true
}

const isHex = (value) => typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value.trim())

const normalizeHex = (value, fallback) => (isHex(value) ? value.trim() : fallback)
const normalizeBackgroundImage = (value) => {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed || trimmed === 'none') return ''
  return trimmed.replace(/^url\((.*)\)$/i, '$1').replace(/^['"]|['"]$/g, '')
}

const createDraftFromTheme = (themeItem, activeConfig) => {
  const vars = {
    ...(themeItem?.vars || {}),
    ...(activeConfig?.vars || {})
  }

  return {
    name: themeItem?.name || FALLBACK_DRAFT.name,
    mode: activeConfig?.mode || themeItem?.mode || FALLBACK_DRAFT.mode,
    font: activeConfig?.font || FALLBACK_DRAFT.font,
    primary: normalizeHex(vars['--volt-primary'], FALLBACK_DRAFT.primary),
    success: normalizeHex(vars['--volt-success'], FALLBACK_DRAFT.success),
    warning: normalizeHex(vars['--volt-warning'], FALLBACK_DRAFT.warning),
    danger: normalizeHex(vars['--volt-danger'], FALLBACK_DRAFT.danger),
    bgPrimary: normalizeHex(vars['--volt-bg-primary'], FALLBACK_DRAFT.bgPrimary),
    bgSecondary: normalizeHex(vars['--volt-bg-secondary'], FALLBACK_DRAFT.bgSecondary),
    bgTertiary: normalizeHex(vars['--volt-bg-tertiary'], FALLBACK_DRAFT.bgTertiary),
    bgQuaternary: normalizeHex(vars['--volt-bg-quaternary'], FALLBACK_DRAFT.bgQuaternary),
    textPrimary: normalizeHex(vars['--volt-text-primary'], FALLBACK_DRAFT.textPrimary),
    textSecondary: normalizeHex(vars['--volt-text-secondary'], FALLBACK_DRAFT.textSecondary),
    textMuted: normalizeHex(vars['--volt-text-muted'], FALLBACK_DRAFT.textMuted),
    border: normalizeHex(vars['--volt-border'], FALLBACK_DRAFT.border),
    bgType: vars['--volt-bg-type'] || FALLBACK_DRAFT.bgType,
    bgImage: normalizeBackgroundImage(vars['--volt-bg-image']),
    bgOpacity: Number(vars['--volt-bg-opacity'] || FALLBACK_DRAFT.bgOpacity),
    bgOverlay: normalizeHex(vars['--volt-bg-overlay'], FALLBACK_DRAFT.bgOverlay),
    bgOverlayOpacity: Number(vars['--volt-bg-overlay-opacity'] || FALLBACK_DRAFT.bgOverlayOpacity),
    bgGradientAngle: Number(vars['--volt-bg-gradient-angle'] || FALLBACK_DRAFT.bgGradientAngle),
    bgGradientFrom: normalizeHex(vars['--volt-bg-gradient-from'], normalizeHex(vars['--volt-primary'], FALLBACK_DRAFT.bgGradientFrom)),
    bgGradientTo: normalizeHex(vars['--volt-bg-gradient-to'], normalizeHex(vars['--volt-bg-secondary'], FALLBACK_DRAFT.bgGradientTo)),
    bgPattern: vars['--volt-bg-pattern'] || FALLBACK_DRAFT.bgPattern,
    bgPatternOpacity: Number(vars['--volt-bg-pattern-opacity'] || FALLBACK_DRAFT.bgPatternOpacity),
    surfaceAlphaPrimary: Number(vars['--volt-surface-primary-alpha'] || FALLBACK_DRAFT.surfaceAlphaPrimary),
    surfaceAlphaSecondary: Number(vars['--volt-surface-secondary-alpha'] || FALLBACK_DRAFT.surfaceAlphaSecondary),
    surfaceAlphaTertiary: Number(vars['--volt-surface-tertiary-alpha'] || FALLBACK_DRAFT.surfaceAlphaTertiary),
    surfaceAlphaQuaternary: Number(vars['--volt-surface-quaternary-alpha'] || FALLBACK_DRAFT.surfaceAlphaQuaternary),
    animationSpeed: vars['--volt-animation-speed'] || FALLBACK_DRAFT.animationSpeed,
    entranceAnimation: vars['--volt-entrance-animation'] || FALLBACK_DRAFT.entranceAnimation,
    exitAnimation: vars['--volt-exit-animation'] || FALLBACK_DRAFT.exitAnimation,
    reducedMotion: vars['--volt-reduced-motion'] === '1',
    smoothTransitions: vars['--volt-smooth-transitions'] !== '0'
  }
}

const buildVars = (draft) => ({
  '--volt-primary': draft.primary,
  '--volt-primary-dark': draft.primary,
  '--volt-primary-light': draft.primary,
  '--volt-success': draft.success,
  '--volt-warning': draft.warning,
  '--volt-danger': draft.danger,
  '--volt-bg-primary': draft.bgPrimary,
  '--volt-bg-secondary': draft.bgSecondary,
  '--volt-bg-tertiary': draft.bgTertiary,
  '--volt-bg-quaternary': draft.bgQuaternary,
  '--volt-bg-type': draft.bgType,
  '--volt-bg-image': draft.bgImage ? `url("${draft.bgImage}")` : 'none',
  '--volt-bg-opacity': String(draft.bgOpacity),
  '--volt-bg-overlay': draft.bgOverlay,
  '--volt-bg-overlay-opacity': String(draft.bgOverlayOpacity),
  '--volt-bg-gradient-angle': String(draft.bgGradientAngle),
  '--volt-bg-gradient-from': draft.bgGradientFrom,
  '--volt-bg-gradient-to': draft.bgGradientTo,
  '--volt-bg-pattern': draft.bgPattern,
  '--volt-bg-pattern-opacity': String(draft.bgPatternOpacity),
  '--volt-surface-primary-alpha': String(draft.surfaceAlphaPrimary),
  '--volt-surface-secondary-alpha': String(draft.surfaceAlphaSecondary),
  '--volt-surface-tertiary-alpha': String(draft.surfaceAlphaTertiary),
  '--volt-surface-quaternary-alpha': String(draft.surfaceAlphaQuaternary),
  '--volt-text-primary': draft.textPrimary,
  '--volt-text-secondary': draft.textSecondary,
  '--volt-text-muted': draft.textMuted,
  '--volt-border': draft.border,
  '--volt-hover': draft.mode === 'light' ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)',
  '--volt-active': draft.mode === 'light' ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.08)',
  '--volt-shadow': draft.mode === 'light' ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.38)',
  '--volt-animation-speed': draft.animationSpeed,
  '--volt-entrance-animation': draft.entranceAnimation,
  '--volt-exit-animation': draft.exitAnimation,
  '--volt-reduced-motion': draft.reducedMotion ? '1' : '0',
  '--volt-smooth-transitions': draft.smoothTransitions ? '1' : '0'
})

const colorRows = [
  ['primary', 'Primary'],
  ['success', 'Success'],
  ['warning', 'Warning'],
  ['danger', 'Danger'],
  ['bgPrimary', 'Bg Primary'],
  ['bgSecondary', 'Bg Secondary'],
  ['bgTertiary', 'Bg Tertiary'],
  ['bgQuaternary', 'Bg Quaternary'],
  ['textPrimary', 'Text Primary'],
  ['textSecondary', 'Text Secondary'],
  ['textMuted', 'Text Muted'],
  ['border', 'Border']
]

const surfaceRows = [
  ['surfaceAlphaPrimary', 'App Base'],
  ['surfaceAlphaSecondary', 'Panels'],
  ['surfaceAlphaTertiary', 'Cards'],
  ['surfaceAlphaQuaternary', 'Inputs']
]

const ThemePreview = ({ draft }) => {
  const style = {
    '--preview-primary': draft.primary,
    '--preview-success': draft.success,
    '--preview-warning': draft.warning,
    '--preview-danger': draft.danger,
    '--preview-bg-primary': draft.bgPrimary,
    '--preview-bg-secondary': draft.bgSecondary,
    '--preview-bg-tertiary': draft.bgTertiary,
    '--preview-bg-quaternary': draft.bgQuaternary,
    '--preview-text-primary': draft.textPrimary,
    '--preview-text-secondary': draft.textSecondary,
    '--preview-text-muted': draft.textMuted,
    '--preview-border': draft.border,
    '--preview-bg-image': draft.bgImage ? `url("${draft.bgImage}")` : 'none',
    '--preview-bg-type': draft.bgType,
    '--preview-bg-overlay': draft.bgOverlay,
    '--preview-bg-overlay-opacity': draft.bgOverlayOpacity / 100,
    '--preview-bg-gradient-angle': `${draft.bgGradientAngle}deg`,
    '--preview-bg-gradient-from': draft.bgGradientFrom,
    '--preview-bg-gradient-to': draft.bgGradientTo,
    '--preview-bg-pattern-opacity': draft.bgPatternOpacity / 100
  }

  return (
    <div className={`theme-studio-preview preview-bg-${draft.bgType} preview-pattern-${draft.bgPattern}`} style={style}>
      <div className="preview-sidebar">
        <div className="dot active" />
        <div className="dot" />
        <div className="dot" />
      </div>
      <div className="preview-channel-list">
        <div className="title"># general</div>
        <div className="item active">welcome</div>
        <div className="item">updates</div>
        <div className="item">support</div>
      </div>
      <div className="preview-chat">
        <div className="preview-chat-head">Theme Studio Preview</div>
        <div className="preview-msg">
          <span className="name">Volt</span>
          <span className="text">This is how your theme will look.</span>
        </div>
        <div className="preview-msg">
          <span className="name you">You</span>
          <span className="text">Saving now applies globally.</span>
        </div>
      </div>
    </div>
  )
}

const ThemeCustomizer = ({ onClose }) => {
  const {
    theme,
    setTheme,
    allThemes,
    customThemes,
    addCustomTheme,
    removeCustomTheme,
    saveActiveThemeConfig,
    activeThemeConfig,
    resetThemeSystem,
    exportThemeState,
    importThemeState
  } = useTheme()

  const [tab, setTab] = useState('design')
  const [status, setStatus] = useState('')
  const [draft, setDraft] = useState(FALLBACK_DRAFT)
  const importRef = useRef(null)
  const backgroundImageRef = useRef(null)

  const selectedFont = useMemo(
    () => FONTS.find((font) => font.id === draft.font) || FONTS[0],
    [draft.font]
  )

  const activeTheme = useMemo(
    () => allThemes.find((item) => item.id === theme) || allThemes.find((item) => item.id === 'dark') || allThemes[0],
    [allThemes, theme]
  )

  useEffect(() => {
    if (!activeTheme) return
    setDraft(createDraftFromTheme(activeTheme, activeThemeConfig))
  }, [activeTheme, activeThemeConfig])

  const setField = (key, value) => {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  const handleBackgroundImageUpload = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setStatus('Background upload failed. Select an image file.')
      event.target.value = ''
      return
    }

    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || ''))
        reader.onerror = () => reject(new Error('Failed to read image'))
        reader.readAsDataURL(file)
      })

      setField('bgImage', dataUrl)
      setField('bgType', 'image')
      setStatus(`Loaded local background: ${file.name}`)
    } catch (error) {
      console.error('Background upload failed', error)
      setStatus('Background upload failed. Try a smaller image.')
    } finally {
      event.target.value = ''
    }
  }

  const saveToActive = () => {
    saveActiveThemeConfig({
      id: theme,
      mode: draft.mode,
      font: draft.font,
      vars: buildVars(draft)
    })
    setStatus('Saved to active theme.')
  }

  const saveAsCustom = () => {
    const name = (draft.name || '').trim() || 'Custom Theme'
    const newId = addCustomTheme({
      name,
      mode: draft.mode,
      vars: buildVars(draft),
      preview: [draft.bgPrimary, draft.primary]
    })

    saveActiveThemeConfig({
      id: newId,
      mode: draft.mode,
      font: draft.font,
      vars: buildVars(draft)
    })

    setTheme(newId)
    setStatus(`Created custom theme: ${name}`)
  }

  const overwriteActiveCustom = () => {
    if (!activeTheme?.isCustom) return
    addCustomTheme({
      id: activeTheme.id,
      name: (draft.name || '').trim() || activeTheme.name,
      mode: draft.mode,
      vars: buildVars(draft),
      preview: [draft.bgPrimary, draft.primary],
      isCustom: true
    })

    saveActiveThemeConfig({
      id: activeTheme.id,
      mode: draft.mode,
      font: draft.font,
      vars: buildVars(draft)
    })
    setStatus('Updated active custom theme.')
  }

  const exportThemes = () => {
    const payload = exportThemeState()
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `voltchat-theme-studio-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    setStatus('Theme package exported.')
  }

  const importThemes = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      importThemeState(JSON.parse(text))
      setStatus('Theme package imported.')
    } catch (error) {
      console.error('Theme import failed', error)
      setStatus('Theme import failed. File is invalid.')
    } finally {
      event.target.value = ''
    }
  }

  const resetStudio = () => {
    if (!window.confirm('Reset the entire theme system to defaults?')) return
    resetThemeSystem()
    setStatus('Theme system reset.')
  }

  const deleteActiveCustom = () => {
    if (!activeTheme?.isCustom) return
    removeCustomTheme(activeTheme.id)
    setStatus('Custom theme deleted.')
  }

  return (
    <div className="theme-studio-modal">
      <div className="theme-studio-shell">
        <header className="theme-studio-header">
          <div>
            <h2><Palette size={18} /> Theme Studio</h2>
            <p>Remade from scratch. Single save/load pipeline, global application.</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close theme studio">
            <X size={18} />
          </button>
        </header>

        <div className="theme-studio-body">
          <aside className="theme-studio-left">
            <div className="studio-tabs">
              <button className={tab === 'design' ? 'active' : ''} onClick={() => setTab('design')}><Palette size={15} /> Design</button>
              <button className={tab === 'motion' ? 'active' : ''} onClick={() => setTab('motion')}><Sparkles size={15} /> Motion</button>
              <button className={tab === 'library' ? 'active' : ''} onClick={() => setTab('library')}><Library size={15} /> Library</button>
            </div>

            <div className="studio-panel">
              {tab === 'design' && (
                <>
                  <section className="studio-section">
                    <div className="section-heading">
                      <Type size={15} />
                      <div>
                        <h4>Identity</h4>
                        <p>Set the base mood, typography, and theme mode.</p>
                      </div>
                    </div>
                    <div className="field-grid two">
                      <label>
                        Theme Name
                        <input className="input" value={draft.name} onChange={(e) => setField('name', e.target.value)} />
                      </label>
                      <label>
                        Mode
                        <select className="input" value={draft.mode} onChange={(e) => setField('mode', e.target.value)}>
                          <option value="dark">Dark</option>
                          <option value="light">Light</option>
                          <option value="auto">Auto</option>
                        </select>
                      </label>
                      <label className="field-span-2">
                        Font
                        <select className="input" value={draft.font} onChange={(e) => setField('font', e.target.value)}>
                          {FONT_OPTIONS.map((font) => (
                            <option key={font.value} value={font.value}>{font.label}</option>
                          ))}
                        </select>
                        <div className="font-inline-preview" style={{ fontFamily: selectedFont.family }}>
                          <strong>{selectedFont.name}</strong>
                          <span>The quick brown fox jumps over the lazy dog.</span>
                        </div>
                      </label>
                    </div>
                  </section>

                  <section className="studio-section">
                    <div className="section-heading">
                      <LayoutTemplate size={15} />
                      <div>
                        <h4>Background System</h4>
                        <p>Drive the app-wide canvas and every translucent panel from one place.</p>
                      </div>
                    </div>

                    <div className="segmented-row" role="tablist" aria-label="Background type">
                      {BG_TYPES.map((type) => (
                        <button
                          key={type.value}
                          className={draft.bgType === type.value ? 'active' : ''}
                          onClick={() => setField('bgType', type.value)}
                        >
                          {type.label}
                        </button>
                      ))}
                    </div>

                    {draft.bgType === 'gradient' && (
                      <div className="field-grid two">
                        <label>
                          Gradient From
                          <input type="color" value={draft.bgGradientFrom} onChange={(e) => setField('bgGradientFrom', e.target.value)} />
                        </label>
                        <label>
                          Gradient To
                          <input type="color" value={draft.bgGradientTo} onChange={(e) => setField('bgGradientTo', e.target.value)} />
                        </label>
                        <label className="field-span-2">
                          Angle
                          <input type="range" min="0" max="360" value={draft.bgGradientAngle} onChange={(e) => setField('bgGradientAngle', Number(e.target.value))} />
                          <span className="range-value">{draft.bgGradientAngle}deg</span>
                        </label>
                      </div>
                    )}

                    {draft.bgType === 'image' && (
                      <div className="field-grid">
                        <input
                          ref={backgroundImageRef}
                          hidden
                          type="file"
                          accept="image/*"
                          onChange={handleBackgroundImageUpload}
                        />
                        <div className="background-image-tools">
                          <button className="btn btn-secondary btn-sm" type="button" onClick={() => backgroundImageRef.current?.click()}>
                            <Upload size={14} /> Upload From Device
                          </button>
                          {draft.bgImage && (
                            <button className="btn btn-secondary btn-sm" type="button" onClick={() => setField('bgImage', '')}>
                              <Trash2 size={14} /> Clear Image
                            </button>
                          )}
                        </div>
                        {draft.bgImage && (
                          <div className="background-image-preview">
                            <img src={draft.bgImage} alt="Theme background preview" />
                          </div>
                        )}
                        <label>
                          Background Image URL
                          <input className="input" value={draft.bgImage} onChange={(e) => setField('bgImage', e.target.value)} placeholder="https://example.com/background.jpg" />
                        </label>
                        <div className="field-grid two">
                          <label>
                            Image Strength
                            <input type="range" min="10" max="100" value={draft.bgOpacity} onChange={(e) => setField('bgOpacity', Number(e.target.value))} />
                            <span className="range-value">{draft.bgOpacity}%</span>
                          </label>
                          <label>
                            Overlay
                            <input type="color" value={draft.bgOverlay} onChange={(e) => setField('bgOverlay', e.target.value)} />
                          </label>
                          <label className="field-span-2">
                            Overlay Strength
                            <input type="range" min="0" max="90" value={draft.bgOverlayOpacity} onChange={(e) => setField('bgOverlayOpacity', Number(e.target.value))} />
                            <span className="range-value">{draft.bgOverlayOpacity}%</span>
                          </label>
                        </div>
                      </div>
                    )}

                    {draft.bgType === 'pattern' && (
                      <div className="field-grid two">
                        <label>
                          Pattern
                          <select className="input" value={draft.bgPattern} onChange={(e) => setField('bgPattern', e.target.value)}>
                            {BG_PATTERNS.map((pattern) => <option key={pattern} value={pattern}>{pattern}</option>)}
                          </select>
                        </label>
                        <label>
                          Pattern Strength
                          <input type="range" min="4" max="40" value={draft.bgPatternOpacity} onChange={(e) => setField('bgPatternOpacity', Number(e.target.value))} />
                          <span className="range-value">{draft.bgPatternOpacity}%</span>
                        </label>
                      </div>
                    )}
                  </section>

                  <section className="studio-section">
                    <div className="section-heading">
                      <Layers3 size={15} />
                      <div>
                        <h4>Interface Surfaces</h4>
                        <p>Tune the translucency used by sidebars, cards, modals, inputs, and message surfaces.</p>
                      </div>
                    </div>
                    <div className="surface-grid">
                      {surfaceRows.map(([key, label]) => (
                        <label className="surface-card" key={key}>
                          <span>{label}</span>
                          <input type="range" min="35" max="100" value={draft[key]} onChange={(e) => setField(key, Number(e.target.value))} />
                          <strong>{draft[key]}%</strong>
                        </label>
                      ))}
                    </div>
                  </section>

                  <section className="studio-section">
                    <div className="section-heading">
                      <Palette size={15} />
                      <div>
                        <h4>Color Tokens</h4>
                        <p>Primary palette, surfaces, text, and borders.</p>
                      </div>
                    </div>
                    <div className="color-grid">
                      {colorRows.map(([key, label]) => (
                        <div className="color-row" key={key}>
                          <span>{label}</span>
                          <input type="color" value={draft[key]} onChange={(e) => setField(key, e.target.value)} />
                          <input
                            className="input"
                            value={draft[key]}
                            onChange={(e) => {
                              const value = e.target.value.trim()
                              if (value === '' || /^#[0-9A-Fa-f]{0,6}$/.test(value)) {
                                if (isHex(value)) setField(key, value)
                              }
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </section>
                </>
              )}

              {tab === 'motion' && (
                <div className="field-grid two">
                  <label>
                    Animation Speed
                    <select className="input" value={draft.animationSpeed} onChange={(e) => setField('animationSpeed', e.target.value)}>
                      {SPEED_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </label>
                  <label>
                    Entrance Animation
                    <select className="input" value={draft.entranceAnimation} onChange={(e) => setField('entranceAnimation', e.target.value)}>
                      {ENTRANCE_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </label>
                  <label>
                    Exit Animation
                    <select className="input" value={draft.exitAnimation} onChange={(e) => setField('exitAnimation', e.target.value)}>
                      {EXIT_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </label>

                  <label className="switch-row">
                    <input type="checkbox" checked={draft.smoothTransitions} onChange={(e) => setField('smoothTransitions', e.target.checked)} />
                    <span>Smooth Transitions</span>
                  </label>

                  <label className="switch-row">
                    <input type="checkbox" checked={draft.reducedMotion} onChange={(e) => setField('reducedMotion', e.target.checked)} />
                    <span>Reduced Motion</span>
                  </label>
                </div>
              )}

              {tab === 'library' && (
                <>
                  <h4 className="section-title">Built-in + Custom Themes</h4>
                  <div className="preset-grid">
                    {allThemes.map((item) => {
                      const p1 = item.preview?.[0] || item.vars?.['--volt-bg-primary'] || '#08111e'
                      const p2 = item.preview?.[1] || item.vars?.['--volt-primary'] || '#12d8ff'
                      return (
                        <button
                          key={item.id}
                          className={`preset-card ${theme === item.id ? 'active' : ''}`}
                          onClick={() => setTheme(item.id)}
                        >
                          <span className="swatch" style={{ background: `linear-gradient(135deg, ${p1}, ${p2})` }} />
                          <strong>{item.name}</strong>
                          <small>{item.isCustom ? 'Custom' : item.mode}</small>
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          </aside>

          <section className="theme-studio-right">
            <ThemePreview draft={draft} />

            <div className="studio-actions">
              <button className="btn btn-primary btn-sm" onClick={saveToActive}><Save size={14} /> Save Active</button>
              <button className="btn btn-secondary btn-sm" onClick={saveAsCustom}><Plus size={14} /> Save New</button>
              {activeTheme?.isCustom && (
                <button className="btn btn-secondary btn-sm" onClick={overwriteActiveCustom}><Save size={14} /> Update Custom</button>
              )}
              <button className="btn btn-secondary btn-sm" onClick={() => setDraft(createDraftFromTheme(activeTheme, activeThemeConfig))}><RotateCcw size={14} /> Revert</button>
            </div>

            <div className="studio-actions secondary">
              <button className="btn btn-secondary btn-sm" onClick={exportThemes}><Download size={14} /> Export</button>
              <button className="btn btn-secondary btn-sm" onClick={() => importRef.current?.click()}><Upload size={14} /> Import</button>
              <input ref={importRef} hidden type="file" accept="application/json" onChange={importThemes} />
              {activeTheme?.isCustom && (
                <button className="btn btn-danger btn-sm" onClick={deleteActiveCustom}><Trash2 size={14} /> Delete Custom</button>
              )}
              <button className="btn btn-danger btn-sm" onClick={resetStudio}><RotateCcw size={14} /> Reset All</button>
            </div>

            {status && <div className="studio-status">{status}</div>}
            <div className="studio-note">Custom themes: {customThemes.length}</div>
          </section>
        </div>
      </div>
    </div>
  )
}

export default ThemeCustomizer
