/**
 * CustomCSSEditor.jsx
 *
 * A full custom CSS editor panel — like BetterDiscord/Vencord client mods but
 * native to VoltChat. Supports:
 *  - Live injection as you type (debounced)
 *  - Enable / disable toggle
 *  - Quick-insert snippet buttons for common patterns
 *  - CSS variable reference sidebar
 *  - Save to backend (syncs across devices)
 *  - Export / Import CSS files
 */

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { X, Code, Eye, EyeOff, Download, Upload, RotateCcw, Check, Info, Zap, ChevronDown, ChevronUp } from 'lucide-react'
import { customCSSService } from '../../services/customCSSService'
import { apiService } from '../../services/apiService'
import './CustomCSSEditor.css'

const SNIPPETS = [
  {
    label: 'Hide PLAIN badge',
    code: '.unencrypted-badge { display: none !important; }'
  },
  {
    label: 'Rounded avatars (square)',
    code: '.message-avatar, .avatar-img { border-radius: 4px !important; }'
  },
  {
    label: 'Compact messages',
    code: '.message-item { padding: 2px 16px !important; }\n.message-header { margin-bottom: 1px !important; }'
  },
  {
    label: 'Custom scrollbar',
    code: '::-webkit-scrollbar { width: 6px; }\n::-webkit-scrollbar-thumb { background: var(--volt-primary); border-radius: 3px; }\n::-webkit-scrollbar-track { background: transparent; }'
  },
  {
    label: 'Glassmorphism panels',
    code: '.channel-sidebar, .member-sidebar {\n  background: rgba(0,0,0,0.3) !important;\n  backdrop-filter: blur(12px) !important;\n}'
  },
  {
    label: 'Neon glow on primary',
    code: '.btn-primary {\n  box-shadow: 0 0 12px var(--volt-primary), 0 0 24px var(--volt-primary) !important;\n}'
  },
  {
    label: 'Hide sidebar header',
    code: '.channel-sidebar-header { display: none !important; }'
  },
  {
    label: 'Custom font size',
    code: '.message-content { font-size: 15px !important; }'
  },
  {
    label: 'Server icon glow',
    code: '.server-icon:hover {\n  box-shadow: 0 0 16px var(--volt-primary) !important;\n  border-radius: 14px !important;\n}'
  },
  {
    label: 'Dark member sidebar',
    code: '.member-sidebar { background: #090d14 !important; }'
  }
]

const CSS_VARS_REFERENCE = [
  { name: '--volt-primary', desc: 'Primary accent color' },
  { name: '--volt-success', desc: 'Green / success color' },
  { name: '--volt-warning', desc: 'Yellow / warning color' },
  { name: '--volt-danger', desc: 'Red / danger color' },
  { name: '--volt-bg-primary', desc: 'App base background' },
  { name: '--volt-bg-secondary', desc: 'Panel background' },
  { name: '--volt-bg-tertiary', desc: 'Card background' },
  { name: '--volt-bg-quaternary', desc: 'Input background' },
  { name: '--volt-text-primary', desc: 'Main text color' },
  { name: '--volt-text-secondary', desc: 'Secondary text' },
  { name: '--volt-text-muted', desc: 'Muted / disabled text' },
  { name: '--volt-border', desc: 'Border color' },
  { name: '--volt-font', desc: 'Current font family' },
]

const DEBOUNCE_MS = 600

const CustomCSSEditor = ({ onClose, onSaved }) => {
  const [css, setCSS] = useState(() => customCSSService.getCSS())
  const [enabled, setEnabled] = useState(() => customCSSService.isEnabled())
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState('')
  const [showVarsRef, setShowVarsRef] = useState(false)
  const [showSnippets, setShowSnippets] = useState(true)
  const [byteCount, setByteCount] = useState(0)
  const debounceRef = useRef(null)
  const fileInputRef = useRef(null)
  const textareaRef = useRef(null)

  // Update byte count whenever CSS changes
  useEffect(() => {
    setByteCount(new TextEncoder().encode(css).length)
  }, [css])

  // Live inject on change (debounced)
  const handleChange = useCallback((value) => {
    setCSS(value)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      customCSSService.setCSS(value, enabled)
    }, DEBOUNCE_MS)
  }, [enabled])

  useEffect(() => () => clearTimeout(debounceRef.current), [])

  const handleToggle = () => {
    const next = !enabled
    setEnabled(next)
    customCSSService.setEnabled(next)
  }

  const handleSaveToProfile = async () => {
    setSaving(true)
    setSaveStatus('')
    // Flush pending debounce immediately
    clearTimeout(debounceRef.current)
    const clean = customCSSService.setCSS(css, enabled)
    try {
      await apiService.updateProfile({ clientCSS: clean, clientCSSEnabled: enabled })
      setSaveStatus('saved')
      onSaved?.()
    } catch (err) {
      setSaveStatus('error')
      console.error('[CustomCSS] Failed to save to profile:', err)
    } finally {
      setSaving(false)
      setTimeout(() => setSaveStatus(''), 3000)
    }
  }

  const handleExport = () => {
    const blob = new Blob([css], { type: 'text/css' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'voltchat-custom.css'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target.result
      handleChange(text)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const handleReset = () => {
    if (!confirm('Clear all custom CSS? This cannot be undone.')) return
    setCSS('')
    customCSSService.setCSS('', enabled)
  }

  const insertSnippet = (code) => {
    const ta = textareaRef.current
    if (!ta) {
      handleChange(css + (css ? '\n\n' : '') + code)
      return
    }
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const before = css.slice(0, start)
    const after = css.slice(end)
    const sep = before && !before.endsWith('\n') ? '\n\n' : ''
    const newCSS = before + sep + code + '\n' + after
    handleChange(newCSS)
    // Restore cursor after insertion
    requestAnimationFrame(() => {
      ta.selectionStart = ta.selectionEnd = start + sep.length + code.length + 1
      ta.focus()
    })
  }

  const maxKB = (customCSSService.MAX_BYTES / 1024).toFixed(0)
  const usedKB = (byteCount / 1024).toFixed(1)
  const usedPct = Math.min(100, (byteCount / customCSSService.MAX_BYTES) * 100)

  return (
    <div className="custom-css-editor">
      {/* Header */}
      <div className="cce-header">
        <div className="cce-header-left">
          <Code size={20} />
          <h3>Custom CSS</h3>
        </div>
        <div className="cce-header-actions">
          <button
            className={`cce-toggle-btn ${enabled ? 'enabled' : 'disabled'}`}
            onClick={handleToggle}
            title={enabled ? 'Disable custom CSS' : 'Enable custom CSS'}
          >
            {enabled ? <Eye size={16} /> : <EyeOff size={16} />}
            {enabled ? 'Enabled' : 'Disabled'}
          </button>
          <button className="cce-icon-btn" onClick={handleExport} title="Export CSS file">
            <Download size={16} />
          </button>
          <button className="cce-icon-btn" onClick={() => fileInputRef.current?.click()} title="Import CSS file">
            <Upload size={16} />
          </button>
          <button className="cce-icon-btn danger" onClick={handleReset} title="Clear all CSS">
            <RotateCcw size={16} />
          </button>
          {onClose && (
            <button className="cce-icon-btn" onClick={onClose} title="Close">
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      <input ref={fileInputRef} type="file" accept=".css,text/css" style={{ display: 'none' }} onChange={handleImport} />

      <div className="cce-body">
        {/* Left panel: snippets + variable reference */}
        <div className="cce-sidebar">
          <div className="cce-section-toggle" onClick={() => setShowSnippets(s => !s)}>
            <span><Zap size={14} /> Quick Snippets</span>
            {showSnippets ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </div>
          {showSnippets && (
            <div className="cce-snippets">
              {SNIPPETS.map((s, i) => (
                <button key={i} className="cce-snippet-btn" onClick={() => insertSnippet(s.code)} title={s.code}>
                  {s.label}
                </button>
              ))}
            </div>
          )}

          <div className="cce-section-toggle" style={{ marginTop: 12 }} onClick={() => setShowVarsRef(v => !v)}>
            <span><Info size={14} /> CSS Variables</span>
            {showVarsRef ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </div>
          {showVarsRef && (
            <div className="cce-vars-ref">
              {CSS_VARS_REFERENCE.map((v) => (
                <div
                  key={v.name}
                  className="cce-var-row"
                  onClick={() => insertSnippet(`var(${v.name})`)}
                  title={`Click to insert: var(${v.name})`}
                >
                  <code className="cce-var-name">{v.name}</code>
                  <span className="cce-var-desc">{v.desc}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Main editor */}
        <div className="cce-editor-area">
          <div className="cce-editor-label">
            <span>Your CSS — applied on top of the current theme</span>
            <span className={`cce-byte-counter ${usedPct > 80 ? 'warning' : ''}`}>
              {usedKB} / {maxKB} KB
            </span>
          </div>

          <div className="cce-textarea-wrapper">
            {/* Line number gutter */}
            <div className="cce-line-numbers" aria-hidden="true">
              {css.split('\n').map((_, i) => (
                <div key={i} className="cce-line-num">{i + 1}</div>
              ))}
            </div>
            <textarea
              ref={textareaRef}
              className={`cce-textarea ${!enabled ? 'disabled' : ''}`}
              value={css}
              onChange={e => handleChange(e.target.value)}
              placeholder={`/* Write your custom CSS here */\n\n/* Example: */\n.message-author { color: var(--volt-primary) !important; }`}
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="off"
              wrap="off"
            />
          </div>

          {/* Usage bar */}
          <div className="cce-usage-bar">
            <div className="cce-usage-fill" style={{ width: `${usedPct}%`, background: usedPct > 80 ? 'var(--volt-warning)' : 'var(--volt-primary)' }} />
          </div>

          <div className="cce-footer">
            <span className="cce-status-hint">
              {enabled ? 'Changes apply live as you type.' : 'Custom CSS is disabled. Enable it to apply.'}
            </span>
            <div className="cce-footer-actions">
              {saveStatus === 'saved' && (
                <span className="cce-save-status success"><Check size={14} /> Saved to profile</span>
              )}
              {saveStatus === 'error' && (
                <span className="cce-save-status error">Save failed</span>
              )}
              <button
                className="btn btn-primary btn-sm"
                onClick={handleSaveToProfile}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save to Profile'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CustomCSSEditor
