/**
 * ProfileCustomizer.jsx
 *
 * Full profile customization panel. Lets users:
 *  - Pick from preset profile templates
 *  - Write custom profile CSS (shown to everyone who views their profile)
 *  - Set banner effects, layout, badge style, accent color
 *  - Set profile theme, background, font, animation, background type/opacity
 *  - All changes sync to the backend via /theme/settings
 */

import React, { useState, useCallback, useRef, useEffect } from 'react'
import { X, Check, Code, Palette, Layout, Sparkles, RotateCcw, Download, Upload, Eye, Image } from 'lucide-react'
import { PROFILE_TEMPLATES, getTemplateById } from '../../theme/profileTemplates'
import { apiService } from '../../services/apiService'
import { useAuth } from '../../contexts/AuthContext'
import './ProfileCustomizer.css'

const MAX_PROFILE_CSS = 20 * 1024 // 20 KB

const BANNER_EFFECTS = [
  { value: 'none', label: 'None' },
  { value: 'gradient-shift', label: 'Gradient Shift' },
  { value: 'pulse', label: 'Pulse' },
  { value: 'wave', label: 'Wave' },
  { value: 'aurora', label: 'Aurora' },
  { value: 'shimmer', label: 'Shimmer' },
  { value: 'particles', label: 'Particles' },
]

const LAYOUT_OPTIONS = [
  { value: 'standard', label: 'Standard' },
  { value: 'compact', label: 'Compact' },
  { value: 'expanded', label: 'Expanded' },
  { value: 'card', label: 'Card' },
]

const BADGE_STYLES = [
  { value: 'default', label: 'Default' },
  { value: 'glow', label: 'Glow' },
  { value: 'bordered', label: 'Bordered' },
  { value: 'minimal', label: 'Minimal' },
  { value: '3d', label: '3D' },
]

const PROFILE_FONTS = [
  { value: 'default', label: 'Default' },
  { value: 'system', label: 'System' },
  { value: 'inter', label: 'Inter' },
  { value: 'roboto', label: 'Roboto' },
  { value: 'poppins', label: 'Poppins' },
  { value: 'open-sans', label: 'Open Sans' },
  { value: 'lato', label: 'Lato' },
  { value: 'montserrat', label: 'Montserrat' },
  { value: 'source-code-pro', label: 'Source Code Pro' },
  { value: 'fira-code', label: 'Fira Code' },
  { value: 'jetbrains-mono', label: 'JetBrains Mono' },
]

const PROFILE_ANIMATIONS = [
  { value: 'none', label: 'None' },
  { value: 'fade', label: 'Fade In' },
  { value: 'slide', label: 'Slide Up' },
  { value: 'bounce', label: 'Bounce' },
  { value: 'pulse', label: 'Pulse' },
  { value: 'wave', label: 'Wave' },
]

const PROFILE_BG_TYPES = [
  { value: 'solid', label: 'Solid Color' },
  { value: 'gradient', label: 'Gradient' },
  { value: 'image', label: 'Image URL' },
  { value: 'blur', label: 'Blur' },
]

const TABS = [
  { id: 'templates', label: 'Templates', icon: Layout },
  { id: 'css', label: 'Profile CSS', icon: Code },
  { id: 'effects', label: 'Effects', icon: Sparkles },
  { id: 'background', label: 'Background', icon: Image },
]

const DEBOUNCE_MS = 500

const ProfileCustomizer = ({ onClose, settings, onSettingsChange }) => {
  const { user, refreshUser } = useAuth()

  const [activeTab, setActiveTab] = useState('templates')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState('')

  // Template / CSS / Effects
  const [selectedTemplate, setSelectedTemplate] = useState(
    () => user?.profileTemplate || 'default'
  )
  const [profileCSS, setProfileCSS] = useState(
    () => user?.profileCSS || ''
  )
  const [bannerEffect, setBannerEffect] = useState(
    () => settings?.bannerEffect || user?.bannerEffect || 'none'
  )
  const [profileLayout, setProfileLayout] = useState(
    () => settings?.profileLayout || user?.profileLayout || 'standard'
  )
  const [badgeStyle, setBadgeStyle] = useState(
    () => settings?.badgeStyle || user?.badgeStyle || 'default'
  )
  const [accentColor, setAccentColor] = useState(
    () => user?.accentColor || ''
  )
  const [previewCSS, setPreviewCSS] = useState('')

  // Profile theme fields (saved via /theme/settings)
  const [profileTheme, setProfileTheme] = useState(null)
  const [profileAccentColor, setProfileAccentColor] = useState('')
  const [profileFont, setProfileFont] = useState('default')
  const [profileAnimation, setProfileAnimation] = useState('none')
  const [profileBackground, setProfileBackground] = useState('')
  const [profileBackgroundType, setProfileBackgroundType] = useState('solid')
  const [profileBackgroundOpacity, setProfileBackgroundOpacity] = useState(100)

  const debounceRef = useRef(null)
  const fileInputRef = useRef(null)

  // Load saved theme settings on mount
  useEffect(() => {
    const loadThemeSettings = async () => {
      try {
        const res = await apiService.getProfileTheme()
        const data = res.data
        if (data) {
          if (data.profileTheme !== undefined) setProfileTheme(data.profileTheme)
          if (data.profileAccentColor !== undefined && data.profileAccentColor !== null) setProfileAccentColor(data.profileAccentColor)
          if (data.profileFont !== undefined && data.profileFont !== null) setProfileFont(data.profileFont || 'default')
          if (data.profileAnimation !== undefined && data.profileAnimation !== null) setProfileAnimation(data.profileAnimation || 'none')
          if (data.profileBackground !== undefined && data.profileBackground !== null) setProfileBackground(data.profileBackground || '')
          if (data.profileBackgroundType !== undefined && data.profileBackgroundType !== null) setProfileBackgroundType(data.profileBackgroundType || 'solid')
          if (data.profileBackgroundOpacity !== undefined && data.profileBackgroundOpacity !== null) setProfileBackgroundOpacity(data.profileBackgroundOpacity ?? 100)
          // Also load app-level accent if no profile-specific one
          if (!data.profileAccentColor && data.accentColor) setAccentColor(data.accentColor)
        }
      } catch (err) {
        console.error('[ProfileCustomizer] Failed to load theme settings:', err)
      } finally {
        setLoading(false)
      }
    }
    loadThemeSettings()
  }, [])

  // Apply template immediately for preview
  const applyTemplatePreview = useCallback((templateId) => {
    const tpl = getTemplateById(templateId)
    if (!tpl) return
    setPreviewCSS(tpl.profileCSS)
  }, [])

  useEffect(() => {
    applyTemplatePreview(selectedTemplate)
  }, [selectedTemplate, applyTemplatePreview])

  const handleTemplateSelect = (id) => {
    setSelectedTemplate(id)
    const tpl = getTemplateById(id)
    if (tpl) {
      if (tpl.settings.bannerEffect) setBannerEffect(tpl.settings.bannerEffect)
      if (tpl.settings.profileLayout) setProfileLayout(tpl.settings.profileLayout)
      if (tpl.settings.accentColor) setAccentColor(tpl.settings.accentColor || '')
      // Auto-fill profileCSS from template if user hasn't overridden it
      if (tpl.profileCSS && !profileCSS) {
        setProfileCSS(tpl.profileCSS.trim())
      }
    }
  }

  const handleProfileCSSChange = (value) => {
    setProfileCSS(value)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setPreviewCSS(value)
    }, DEBOUNCE_MS)
  }

  const handleSave = async () => {
    setSaving(true)
    setSaveStatus('')
    clearTimeout(debounceRef.current)
    const cleanCSS = profileCSS.slice(0, MAX_PROFILE_CSS)
    try {
      // Save profile CSS / template / effects via updateProfile
      await apiService.updateProfile({
        profileTemplate: selectedTemplate,
        profileCSS: cleanCSS,
        bannerEffect,
        profileLayout,
        badgeStyle,
        accentColor: accentColor || null,
      })

      // Save profile theme fields via /theme/settings
      await apiService.updateProfileTheme({
        profileTheme: profileTheme || null,
        profileAccentColor: profileAccentColor || null,
        profileFont: profileFont !== 'default' ? profileFont : null,
        profileAnimation: profileAnimation !== 'none' ? profileAnimation : null,
        profileBackground: profileBackground || null,
        profileBackgroundType: profileBackground ? profileBackgroundType : null,
        profileBackgroundOpacity: profileBackgroundOpacity,
      })

      await refreshUser?.()
      setSaveStatus('saved')
      onSettingsChange?.({ bannerEffect, profileLayout, badgeStyle })
    } catch (err) {
      setSaveStatus('error')
      console.error('[ProfileCustomizer] Save failed:', err)
    } finally {
      setSaving(false)
      setTimeout(() => setSaveStatus(''), 3000)
    }
  }

  const handleExportCSS = () => {
    const blob = new Blob([profileCSS], { type: 'text/css' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'my-profile.css'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImportCSS = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => handleProfileCSSChange(ev.target.result)
    reader.readAsText(file)
    e.target.value = ''
  }

  const handleResetCSS = () => {
    if (!confirm('Reset profile CSS to the selected template default?')) return
    const tpl = getTemplateById(selectedTemplate)
    handleProfileCSSChange(tpl?.profileCSS?.trim() || '')
  }

  const byteCount = new TextEncoder().encode(profileCSS).length
  const maxKB = (MAX_PROFILE_CSS / 1024).toFixed(0)
  const usedKB = (byteCount / 1024).toFixed(1)

  if (loading) {
    return (
      <div className="profile-customizer">
        <div className="pc-header">
          <div className="pc-header-left">
            <Palette size={20} />
            <h3>Profile Customization</h3>
          </div>
          {onClose && (
            <button className="pc-close-btn" onClick={onClose}>
              <X size={18} />
            </button>
          )}
        </div>
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--volt-text-muted)' }}>
          Loading settings...
        </div>
      </div>
    )
  }

  return (
    <div className="profile-customizer">
      {/* Header */}
      <div className="pc-header">
        <div className="pc-header-left">
          <Palette size={20} />
          <h3>Profile Customization</h3>
        </div>
        <div className="pc-header-actions">
          {saveStatus === 'saved' && (
            <span className="pc-save-status success"><Check size={14} /> Saved</span>
          )}
          {saveStatus === 'error' && (
            <span className="pc-save-status error">Save failed</span>
          )}
          <button
            className="btn btn-primary btn-sm"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          {onClose && (
            <button className="pc-close-btn" onClick={onClose}>
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="pc-tabs">
        {TABS.map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              className={`pc-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={15} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      <div className="pc-body">
        {/* Templates tab */}
        {activeTab === 'templates' && (
          <div className="pc-templates">
            <p className="pc-hint">
              Choose a preset template. Templates apply CSS styling that everyone sees when viewing your profile.
              Selecting one will also update the CSS tab — you can then customize it further.
            </p>
            <div className="pc-template-grid">
              {PROFILE_TEMPLATES.map(tpl => (
                <button
                  key={tpl.id}
                  className={`pc-template-card ${selectedTemplate === tpl.id ? 'selected' : ''}`}
                  onClick={() => handleTemplateSelect(tpl.id)}
                >
                  <div
                    className="pc-template-preview"
                    style={{ background: tpl.preview.banner }}
                  >
                    {tpl.preview.accent && (
                      <div
                        className="pc-template-accent-dot"
                        style={{ background: tpl.preview.accent }}
                      />
                    )}
                    {selectedTemplate === tpl.id && (
                      <div className="pc-template-check"><Check size={16} /></div>
                    )}
                  </div>
                  <div className="pc-template-info">
                    <span className="pc-template-name">{tpl.name}</span>
                    <span className="pc-template-desc">{tpl.description}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Profile CSS tab */}
        {activeTab === 'css' && (
          <div className="pc-css-tab">
            <div className="pc-css-header">
              <div>
                <h4>Profile CSS</h4>
                <p className="pc-hint">
                  CSS written here is shown to <strong>everyone</strong> who views your profile.
                  It is scoped to <code>.profile-modal-container</code> automatically.
                  Max {maxKB} KB.
                </p>
              </div>
              <div className="pc-css-actions">
                <span className={`pc-byte-counter ${byteCount > MAX_PROFILE_CSS * 0.8 ? 'warning' : ''}`}>
                  {usedKB} / {maxKB} KB
                </span>
                <button className="cce-icon-btn" onClick={handleExportCSS} title="Export CSS">
                  <Download size={15} />
                </button>
                <button className="cce-icon-btn" onClick={() => fileInputRef.current?.click()} title="Import CSS">
                  <Upload size={15} />
                </button>
                <button className="cce-icon-btn danger" onClick={handleResetCSS} title="Reset to template">
                  <RotateCcw size={15} />
                </button>
                <input ref={fileInputRef} type="file" accept=".css,text/css" style={{ display: 'none' }} onChange={handleImportCSS} />
              </div>
            </div>

            <p className="pc-css-scope-hint">
              <code>.profile-modal-container {'{'} /* your CSS here */ {'}'}</code>
            </p>

            <div className="pc-css-editor-wrapper">
              <textarea
                className="pc-css-textarea"
                value={profileCSS}
                onChange={e => handleProfileCSSChange(e.target.value)}
                placeholder={`/* Customize how your profile looks to others */\n\n.profile-display-name {\n  color: var(--volt-primary);\n  text-shadow: 0 0 20px currentColor;\n}\n\n.profile-banner-bg {\n  background: linear-gradient(135deg, #1a0030, #0d001a) !important;\n}`}
                spellCheck={false}
                autoCapitalize="none"
                autoCorrect="off"
                wrap="off"
              />
            </div>

            <div className="pc-usage-bar">
              <div
                className="pc-usage-fill"
                style={{
                  width: `${Math.min(100, (byteCount / MAX_PROFILE_CSS) * 100)}%`,
                  background: byteCount > MAX_PROFILE_CSS * 0.8 ? 'var(--volt-warning)' : 'var(--volt-primary)'
                }}
              />
            </div>

            <div className="pc-css-snippets-row">
              <span className="pc-snippets-label">Quick targets:</span>
              {['.profile-display-name', '.profile-banner-bg', '.profile-avatar-img', '.profile-section', '.profile-tab-btn.active'].map(sel => (
                <button
                  key={sel}
                  className="pc-snippet-chip"
                  onClick={() => handleProfileCSSChange(profileCSS + `\n\n${sel} {\n  \n}`)}
                >
                  {sel}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Effects tab */}
        {activeTab === 'effects' && (
          <div className="pc-effects-tab">
            <div className="form-group">
              <label>Profile Accent Color</label>
              <p className="pc-hint">Overrides the accent color shown on your profile (separate from your app accent).</p>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input
                  type="color"
                  className="input"
                  style={{ width: 56, height: 36, padding: 2, cursor: 'pointer', borderRadius: 8 }}
                  value={profileAccentColor || '#1fb6ff'}
                  onChange={e => setProfileAccentColor(e.target.value)}
                />
                <input
                  type="text"
                  className="input"
                  style={{ width: 110, fontFamily: 'monospace', fontSize: 13 }}
                  value={profileAccentColor}
                  placeholder="#1fb6ff"
                  onChange={e => setProfileAccentColor(e.target.value)}
                  maxLength={7}
                />
                {profileAccentColor && (
                  <button className="btn btn-secondary btn-sm" onClick={() => setProfileAccentColor('')}>
                    Reset
                  </button>
                )}
              </div>
            </div>

            <div className="form-group">
              <label>App Accent Color</label>
              <p className="pc-hint">Shown on your profile header (fallback if no profile accent set).</p>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input
                  type="color"
                  className="input"
                  style={{ width: 56, height: 36, padding: 2, cursor: 'pointer', borderRadius: 8 }}
                  value={accentColor || '#1fb6ff'}
                  onChange={e => setAccentColor(e.target.value)}
                />
                <input
                  type="text"
                  className="input"
                  style={{ width: 110, fontFamily: 'monospace', fontSize: 13 }}
                  value={accentColor}
                  placeholder="#1fb6ff"
                  onChange={e => setAccentColor(e.target.value)}
                  maxLength={7}
                />
                {accentColor && (
                  <button className="btn btn-secondary btn-sm" onClick={() => setAccentColor('')}>
                    Reset
                  </button>
                )}
              </div>
            </div>

            <div className="form-group">
              <label>Profile Font</label>
              <p className="pc-hint">Font used on your profile page.</p>
              <div className="pc-layout-grid">
                {PROFILE_FONTS.map(f => (
                  <button
                    key={f.value}
                    className={`pc-layout-card ${profileFont === f.value ? 'selected' : ''}`}
                    onClick={() => setProfileFont(f.value)}
                    style={f.value !== 'default' ? { fontFamily: f.value } : {}}
                  >
                    {f.label}
                    {profileFont === f.value && <Check size={12} />}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label>Profile Entrance Animation</label>
              <p className="pc-hint">Animation when your profile modal opens.</p>
              <div className="pc-layout-grid">
                {PROFILE_ANIMATIONS.map(a => (
                  <button
                    key={a.value}
                    className={`pc-layout-card ${profileAnimation === a.value ? 'selected' : ''}`}
                    onClick={() => setProfileAnimation(a.value)}
                  >
                    {a.label}
                    {profileAnimation === a.value && <Check size={12} />}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label>Banner Effect</label>
              <p className="pc-hint">Animated effect overlaid on your profile banner.</p>
              <div className="pc-effect-grid">
                {BANNER_EFFECTS.map(e => (
                  <button
                    key={e.value}
                    className={`pc-effect-card ${bannerEffect === e.value ? 'selected' : ''}`}
                    onClick={() => setBannerEffect(e.value)}
                  >
                    <div className={`pc-effect-preview banner-effect-${e.value}`} />
                    <span>{e.label}</span>
                    {bannerEffect === e.value && <Check size={12} className="pc-effect-check" />}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label>Profile Layout</label>
              <p className="pc-hint">Changes the overall structure of your profile.</p>
              <div className="pc-layout-grid">
                {LAYOUT_OPTIONS.map(l => (
                  <button
                    key={l.value}
                    className={`pc-layout-card ${profileLayout === l.value ? 'selected' : ''}`}
                    onClick={() => setProfileLayout(l.value)}
                  >
                    {l.label}
                    {profileLayout === l.value && <Check size={12} />}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label>Badge Style</label>
              <p className="pc-hint">How role and status badges look on your profile.</p>
              <div className="pc-layout-grid">
                {BADGE_STYLES.map(b => (
                  <button
                    key={b.value}
                    className={`pc-layout-card ${badgeStyle === b.value ? 'selected' : ''}`}
                    onClick={() => setBadgeStyle(b.value)}
                  >
                    {b.label}
                    {badgeStyle === b.value && <Check size={12} />}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Background tab */}
        {activeTab === 'background' && (
          <div className="pc-effects-tab">
            <div className="form-group">
              <label>Background Type</label>
              <p className="pc-hint">How the profile background is rendered.</p>
              <div className="pc-layout-grid">
                {PROFILE_BG_TYPES.map(t => (
                  <button
                    key={t.value}
                    className={`pc-layout-card ${profileBackgroundType === t.value ? 'selected' : ''}`}
                    onClick={() => setProfileBackgroundType(t.value)}
                  >
                    {t.label}
                    {profileBackgroundType === t.value && <Check size={12} />}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label>
                {profileBackgroundType === 'image' ? 'Image URL' :
                 profileBackgroundType === 'gradient' ? 'CSS Gradient' :
                 profileBackgroundType === 'blur' ? 'Blur (leave blank to use default)' :
                 'Background Color (hex or CSS)'}
              </label>
              <p className="pc-hint">
                {profileBackgroundType === 'image' && 'Enter a direct image URL (https://...).'}
                {profileBackgroundType === 'gradient' && 'Enter a CSS gradient, e.g. linear-gradient(135deg, #1a0030, #0d001a)'}
                {profileBackgroundType === 'solid' && 'Enter a hex color, e.g. #1a0030'}
                {profileBackgroundType === 'blur' && 'Blur effect uses the opacity slider below.'}
              </p>
              <input
                type="text"
                className="input"
                value={profileBackground}
                onChange={e => setProfileBackground(e.target.value)}
                placeholder={
                  profileBackgroundType === 'image' ? 'https://example.com/bg.jpg' :
                  profileBackgroundType === 'gradient' ? 'linear-gradient(135deg, #1a0030, #0d001a)' :
                  profileBackgroundType === 'blur' ? '' :
                  '#1a0030'
                }
                style={{ width: '100%', fontFamily: 'monospace', fontSize: 13 }}
              />
              {profileBackground && profileBackgroundType === 'image' && (
                <div style={{ marginTop: 8, borderRadius: 8, overflow: 'hidden', maxHeight: 120 }}>
                  <img
                    src={profileBackground}
                    alt="Background preview"
                    style={{ width: '100%', objectFit: 'cover', maxHeight: 120 }}
                    onError={e => { e.target.style.display = 'none' }}
                  />
                </div>
              )}
              {profileBackground && profileBackgroundType === 'gradient' && (
                <div style={{
                  marginTop: 8, borderRadius: 8, height: 40,
                  background: profileBackground
                }} />
              )}
            </div>

            <div className="form-group">
              <label>Background Opacity: {profileBackgroundOpacity}%</label>
              <p className="pc-hint">Controls how visible the background is (100 = fully visible).</p>
              <input
                type="range"
                min={0}
                max={100}
                value={profileBackgroundOpacity}
                onChange={e => setProfileBackgroundOpacity(Number(e.target.value))}
                style={{ width: '100%' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--volt-text-muted)' }}>
                <span>0% (transparent)</span>
                <span>100% (opaque)</span>
              </div>
            </div>

            {profileBackground && (
              <div className="form-group">
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setProfileBackground('')
                    setProfileBackgroundType('solid')
                    setProfileBackgroundOpacity(100)
                  }}
                >
                  <RotateCcw size={14} /> Clear Background
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default ProfileCustomizer
