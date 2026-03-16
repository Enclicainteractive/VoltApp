import React, { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { MusicalNoteIcon, SpeakerWaveIcon, ArrowUturnDownIcon, XMarkIcon, AdjustmentsHorizontalIcon, MicrophoneIcon, BoltIcon, SignalIcon, SparklesIcon, CpuChipIcon, CircleStackIcon, PlayIcon, PauseIcon, DocumentCheckIcon, PhoneIcon, RadioIcon, MegaphoneIcon, GlobeAltIcon, TrashIcon } from '@heroicons/react/24/outline'
import { useTranslation } from '../hooks/useTranslation'
import '../assets/styles/VoiceFX.css'

const OrbitIcon = GlobeAltIcon
const Reset = ArrowUturnDownIcon

const EFFECTS = {
  none: { name: 'None', nameKey: 'none', icon: SpeakerWaveIcon, params: {} },
  pitch: { 
    name: 'Pitch', 
    nameKey: 'pitch',
    icon: ArrowUturnDownIcon, 
    params: { pitch: { min: 0.5, max: 2, default: 1, step: 0.1, label: 'Pitch', labelKey: 'pitch' } }
  },
  reverb: { 
    name: 'Reverb', 
    nameKey: 'reverb',
    icon: SignalIcon, 
    params: { 
      decay: { min: 0.1, max: 10, default: 2, step: 0.1, label: 'Decay', labelKey: 'decay' },
      wet: { min: 0, max: 1, default: 0.3, step: 0.05, label: 'Wet', labelKey: 'wet' }
    } 
  },
  delay: { 
    name: 'Delay', 
    nameKey: 'delay',
    icon: CircleStackIcon, 
    params: { 
      time: { min: 0.01, max: 1, default: 0.3, step: 0.01, label: 'Time (s)', labelKey: 'timeSeconds' },
      feedback: { min: 0, max: 0.9, default: 0.4, step: 0.05, label: 'Feedback', labelKey: 'feedback' },
      wet: { min: 0, max: 1, default: 0.3, step: 0.05, label: 'Wet', labelKey: 'wet' }
    } 
  },
  distortion: { 
    name: 'Distortion', 
    nameKey: 'distortion',
    icon: BoltIcon, 
    params: { amount: { min: 0, max: 100, default: 20, step: 1, label: 'Amount', labelKey: 'amount' } }
  },
  chorus: { 
    name: 'Chorus', 
    nameKey: 'chorus',
    icon: MusicalNoteIcon, 
    params: { 
      rate: { min: 0.1, max: 10, default: 1.5, step: 0.1, label: 'Rate (Hz)', labelKey: 'rateHz' },
      depth: { min: 0, max: 1, default: 0.5, step: 0.05, label: 'Depth', labelKey: 'depth' },
      wet: { min: 0, max: 1, default: 0.3, step: 0.05, label: 'Wet', labelKey: 'wet' }
    } 
  },
  flanger: { 
    name: 'Flanger', 
    nameKey: 'flanger',
    icon: AdjustmentsHorizontalIcon, 
    params: { 
      rate: { min: 0.1, max: 10, default: 0.5, step: 0.1, label: 'Rate (Hz)', labelKey: 'rateHz' },
      depth: { min: 0, max: 1, default: 0.5, step: 0.05, label: 'Depth', labelKey: 'depth' },
      wet: { min: 0, max: 1, default: 0.5, step: 0.05, label: 'Wet', labelKey: 'wet' }
    } 
  },
  tremolo: { 
    name: 'Tremolo', 
    nameKey: 'tremolo',
    icon: RadioIcon, 
    params: { 
      rate: { min: 0.1, max: 20, default: 5, step: 0.1, label: 'Rate (Hz)', labelKey: 'rateHz' },
      depth: { min: 0, max: 1, default: 0.5, step: 0.05, label: 'Depth', labelKey: 'depth' }
    } 
  },
  vibrato: { 
    name: 'Vibrato', 
    nameKey: 'vibrato',
    icon: SparklesIcon, 
    params: { 
      rate: { min: 0.1, max: 15, default: 5, step: 0.1, label: 'Rate (Hz)', labelKey: 'rateHz' },
      depth: { min: 0, max: 1, default: 0.3, step: 0.05, label: 'Depth', labelKey: 'depth' }
    } 
  },
  robot: { 
    name: 'Robot', 
    nameKey: 'robot',
    icon: CpuChipIcon, 
    params: { 
      freq: { min: 50, max: 500, default: 200, step: 10, label: 'Freq (Hz)', labelKey: 'freqHz' },
      modDepth: { min: 0, max: 1, default: 0.5, step: 0.05, label: 'Mod Depth', labelKey: 'modDepth' },
      wet: { min: 0, max: 1, default: 0.7, step: 0.05, label: 'Wet', labelKey: 'wet' }
    } 
  },
  alien: { 
    name: 'Alien', 
    nameKey: 'alien',
    icon: OrbitIcon, 
    params: { 
      freq: { min: 100, max: 1000, default: 400, step: 10, label: 'Freq (Hz)', labelKey: 'freqHz' },
      wet: { min: 0, max: 1, default: 0.6, step: 0.05, label: 'Wet', labelKey: 'wet' }
    } 
  },
  vocoder: { 
    name: 'Vocoder', 
    nameKey: 'vocoder',
    icon: MicrophoneIcon, 
    params: { 
      bands: { min: 2, max: 32, default: 16, step: 1, label: 'Bands', labelKey: 'bands' },
      wet: { min: 0, max: 1, default: 0.8, step: 0.05, label: 'Wet', labelKey: 'wet' }
    } 
  },
  radio: { name: 'Radio', nameKey: 'radio', icon: RadioIcon, params: {} },
  phone: { name: 'Phone', nameKey: 'phone', icon: PhoneIcon, params: {} },
  megaphone: { 
    name: 'Megaphone', nameKey: 'megaphone', icon: MegaphoneIcon, 
    params: { drive: { min: 0.5, max: 4, default: 1.8, step: 0.1, label: 'Drive', labelKey: 'drive' }, tone: { min: 700, max: 2800, default: 1500, step: 50, label: 'Tone (Hz)', labelKey: 'toneHz' } }
  },
  whisper: { 
    name: 'Whisper', nameKey: 'whisper', icon: SparklesIcon, 
    params: { airy: { min: 0, max: 1, default: 0.65, step: 0.05, label: 'Airy', labelKey: 'airy' } }
  },
  demon: { 
    name: 'Demon', nameKey: 'demon', icon: CpuChipIcon, 
    params: { pitch: { min: 0.4, max: 1, default: 0.68, step: 0.05, label: 'Pitch', labelKey: 'pitch' }, drive: { min: 0.5, max: 3, default: 1.6, step: 0.1, label: 'Drive', labelKey: 'drive' } }
  },
  helium: { name: 'Helium', nameKey: 'helium', icon: SparklesIcon, params: {} },
  underwater: { name: 'Underwater', nameKey: 'underwater', icon: SignalIcon, params: {} },
  cave: { name: 'Cave', nameKey: 'cave', icon: SignalIcon, params: {} },
  cyberpunk: { 
    name: 'Cyberpunk', nameKey: 'cyberpunk', icon: MusicalNoteIcon,
    params: { rate: { min: 0.1, max: 12, default: 3.2, step: 0.1, label: 'Rate (Hz)', labelKey: 'rateHz' }, wet: { min: 0, max: 1, default: 0.4, step: 0.05, label: 'Wet', labelKey: 'wet' } }
  }
}

const PRESETS = [
  { name: 'Normal', nameKey: 'normal', effect: 'none', params: {} },
  { name: 'Deep Voice', nameKey: 'deepVoice', effect: 'pitch', params: { pitch: 0.7 } },
  { name: 'Chipmunk', nameKey: 'chipmunk', effect: 'pitch', params: { pitch: 1.8 } },
  { name: 'Cave', nameKey: 'cave', effect: 'reverb', params: { decay: 5, wet: 0.6 } },
  { name: 'Echo Chamber', nameKey: 'echoChamber', effect: 'delay', params: { time: 0.5, feedback: 0.6, wet: 0.5 } },
  { name: 'Heavy Metal', nameKey: 'heavyMetal', effect: 'distortion', params: { amount: 60 } },
  { name: '80s Chorus', nameKey: 'chorus80s', effect: 'chorus', params: { rate: 2, depth: 0.7, wet: 0.5 } },
  { name: 'Sci-Fi Flanger', nameKey: 'sciFiFlanger', effect: 'flanger', params: { rate: 3, depth: 0.8, wet: 0.6 } },
  { name: 'Radio Voice', nameKey: 'radioVoice', effect: 'radio', params: {} },
  { name: 'Phone Call', nameKey: 'phoneCall', effect: 'phone', params: {} },
  { name: 'Robot', nameKey: 'robot', effect: 'robot', params: { freq: 150, modDepth: 0.6, wet: 0.8 } },
  { name: 'Space Alien', nameKey: 'spaceAlien', effect: 'alien', params: { freq: 600, wet: 0.7 } },
  { name: 'Demon', nameKey: 'demon', effect: 'demon', params: { pitch: 0.68, drive: 1.6 } },
  { name: 'Whisper', nameKey: 'whisper', effect: 'whisper', params: { airy: 0.65 } },
  { name: 'Helium', nameKey: 'helium', effect: 'helium', params: {} },
]

const VoiceFX = ({ 
  isOpen, 
  onClose, 
  applyEffect, 
  currentEffect = 'none',
  currentParams = {},
  isEnabled = false,
  isPreviewEnabled = false,
  onPreviewToggle,
  onToggle,
  onReset
}) => {
  const { t } = useTranslation()
  const [selectedEffect, setSelectedEffect] = useState(currentEffect)
  const [params, setParams] = useState(currentParams)
  const [enabled, setEnabled] = useState(isEnabled)
  const [previewEnabled, setPreviewEnabled] = useState(isPreviewEnabled)
  const [savedPresets, setSavedPresets] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('voicefx_presets')) || []
    } catch { return [] }
  })
  const modalRef = useRef(null)

  // Sync with parent state
  useEffect(() => {
    setSelectedEffect(currentEffect)
    setParams(currentParams)
    setEnabled(isEnabled)
    setPreviewEnabled(isPreviewEnabled)
  }, [currentEffect, currentParams, isEnabled, isPreviewEnabled])

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // Focus trap
  useEffect(() => {
    if (isOpen && modalRef.current) {
      modalRef.current.focus()
    }
  }, [isOpen])

  const handleEffectChange = useCallback((effectName) => {
    const effect = EFFECTS[effectName]
    const defaultParams = {}
    if (effect?.params) {
      Object.entries(effect.params).forEach(([key, config]) => {
        defaultParams[key] = config.default
      })
    }
    setSelectedEffect(effectName)
    setParams(defaultParams)
    setEnabled(effectName !== 'none')
    applyEffect(effectName, defaultParams)
  }, [applyEffect])

  const handleParamChange = useCallback((paramName, value) => {
    const newParams = { ...params, [paramName]: parseFloat(value) }
    setParams(newParams)
    applyEffect(selectedEffect, newParams)
  }, [params, selectedEffect, applyEffect])

  const handlePresetClick = useCallback((preset) => {
    setSelectedEffect(preset.effect)
    setParams(preset.params)
    setEnabled(preset.effect !== 'none')
    applyEffect(preset.effect, preset.params)
  }, [applyEffect])

  const handleToggle = useCallback(() => {
    const newEnabled = !enabled
    setEnabled(newEnabled)
    if (!newEnabled) {
      applyEffect('none', {})
    } else if (selectedEffect !== 'none') {
      applyEffect(selectedEffect, params)
    }
    onToggle?.(newEnabled)
  }, [enabled, selectedEffect, params, applyEffect, onToggle])

  const handlePreviewToggle = useCallback(() => {
    const next = !previewEnabled
    setPreviewEnabled(next)
    onPreviewToggle?.(next)
  }, [previewEnabled, onPreviewToggle])

  const handleReset = useCallback(() => {
    setSelectedEffect('none')
    setParams({})
    setEnabled(false)
    setPreviewEnabled(false)
    applyEffect('none', {})
    onReset?.()
  }, [applyEffect, onReset])

  const savePreset = useCallback(() => {
    const name = prompt(t('voicefx.enterPresetName', 'Enter preset name:'))
    if (!name) return
    const newPreset = { name, effect: selectedEffect, params }
    const updated = [...savedPresets, newPreset]
    setSavedPresets(updated)
    localStorage.setItem('voicefx_presets', JSON.stringify(updated))
  }, [savedPresets, selectedEffect, params, t])

  const deletePreset = useCallback((idx, presetName) => {
    const shouldDelete = confirm(t('voicefx.confirmDeletePreset', 'Delete preset "{{name}}"?', { name: presetName }))
    if (!shouldDelete) return
    const updated = savedPresets.filter((_, i) => i !== idx)
    setSavedPresets(updated)
    localStorage.setItem('voicefx_presets', JSON.stringify(updated))
  }, [savedPresets, t])

  const effectName = useCallback((effectKey, fallback) => {
    return t(`voicefx.effectNames.${effectKey}`, fallback)
  }, [t])

  const currentEffectConfig = EFFECTS[selectedEffect]

  if (!isOpen) return null

  const portalRoot = document.getElementById('portal-root')

  const modalContent = (
    <div 
      className="modal-overlay voicefx-overlay" 
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="voicefx-title"
    >
      <div 
        className="modal-content voicefx-modal" 
        ref={modalRef}
        tabIndex={-1}
        onClick={e => e.stopPropagation()}
      >
        <div className="voicefx-header">
          <div className="voicefx-title">
            <MusicalNoteIcon size={20} />
            <span id="voicefx-title">{t('voicefx.title', 'VoiceFX')}</span>
          </div>
          <button 
            className="voicefx-close" 
            onClick={onClose} 
            title={t('common.close', 'Close')}
            aria-label={t('common.close', 'Close')}
          >
            <XMarkIcon size={20} />
          </button>
        </div>

        <div className="voicefx-content">
          {/* Presets */}
          <div className="voicefx-presets-section">
            <div className="voicefx-section-title">{t('voicefx.presets', 'Presets')}</div>
            <div className="voicefx-presets-grid">
              {PRESETS.map((preset, idx) => (
                <button
                  key={`preset-${idx}`}
                  className={`voicefx-preset-btn ${selectedEffect === preset.effect && JSON.stringify(params) === JSON.stringify(preset.params) ? 'active' : ''}`}
                  onClick={() => handlePresetClick(preset)}
                  title={t('voicefx.applyPreset', 'Apply preset')}
                >
                  {preset.nameKey ? t(`voicefx.presetNames.${preset.nameKey}`, preset.name) : preset.name}
                </button>
              ))}
              {savedPresets.map((preset, idx) => (
                <button
                  key={`saved-${idx}`}
                  className={`voicefx-preset-btn saved ${selectedEffect === preset.effect && JSON.stringify(params) === JSON.stringify(preset.params) ? 'active' : ''}`}
                  onClick={() => handlePresetClick(preset)}
                  title={t('voicefx.applyPreset', 'Apply preset')}
                >
                  {preset.name}
                  <TrashIcon 
                    size={12} 
                    className="voicefx-preset-delete"
                    onClick={(e) => {
                      e.stopPropagation()
                      deletePreset(idx, preset.name)
                    }}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Effects */}
          <div className="voicefx-effects-section">
            <div className="voicefx-section-title">{t('voicefx.effects', 'Effects')}</div>
            <div className="voicefx-effects-grid">
              {Object.entries(EFFECTS).map(([key, effect]) => {
                const Icon = effect.icon
                return (
                  <button
                    key={key}
                    className={`voicefx-effect-btn ${selectedEffect === key ? 'active' : ''}`}
                    onClick={() => handleEffectChange(key)}
                    title={effect.name}
                  >
                    <Icon size={20} />
                    <span>{effect.name}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Parameters */}
          {currentEffectConfig?.params && Object.keys(currentEffectConfig.params).length > 0 && (
            <div className="voicefx-params-section">
              <div className="voicefx-section-title">
                {t('voicefx.effectSettings', '{{effect}} Settings', { effect: currentEffectConfig.name })}
              </div>
              <div className="voicefx-params-grid">
                {Object.entries(currentEffectConfig.params).map(([key, config]) => (
                  <div key={key} className="voicefx-param">
                    <label>{config.label}</label>
                    <input
                      type="range"
                      min={config.min}
                      max={config.max}
                      step={config.step}
                      value={params[key] ?? config.default}
                      onChange={(e) => handleParamChange(key, e.target.value)}
                    />
                    <span className="voicefx-param-value">
                      {(params[key] ?? config.default).toFixed(config.step < 1 ? 2 : 0)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="voicefx-footer">
          <button 
            className={`voicefx-toggle ${enabled ? 'active' : ''}`}
            onClick={handleToggle}
          >
            {enabled ? t('voicefx.disable', 'Disable') : t('voicefx.enable', 'Enable')}
          </button>
          <button 
            className="voicefx-reset"
            onClick={handleReset}
          >
            {t('common.reset', 'Reset')}
          </button>
          <button 
            className="voicefx-save"
            onClick={savePreset}
            disabled={selectedEffect === 'none'}
          >
            <DocumentCheckIcon size={16} />
            {t('common.save', 'Save')}
          </button>
        </div>
      </div>
    </div>
  )

  // Use portal-root if available, otherwise fall back to body
  if (portalRoot) {
    return createPortal(modalContent, portalRoot)
  }
  
  return createPortal(modalContent, document.body)
}

export default VoiceFX
export { EFFECTS, PRESETS }
