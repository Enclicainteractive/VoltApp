import React, { useState, useEffect, useCallback } from 'react'
import { 
  Music, Volume2, RotateCcw, X, Sliders, 
  Mic, Zap, Waves, Radio, Ghost, Cpu,
  Orbit, Disc, Play, Pause, Save, RotateCcw as Reset,
  Phone
} from 'lucide-react'
import '../assets/styles/VoiceFX.css'

const EFFECTS = {
  none: { name: 'None', icon: Volume2, params: {} },
  pitch: { 
    name: 'Pitch', 
    icon: RotateCcw, 
    params: { pitch: { min: 0.5, max: 2, default: 1, step: 0.1, label: 'Pitch' } }
  },
  reverb: { 
    name: 'Reverb', 
    icon: Waves, 
    params: { 
      decay: { min: 0.1, max: 10, default: 2, step: 0.1, label: 'Decay' },
      wet: { min: 0, max: 1, default: 0.3, step: 0.05, label: 'Wet' }
    } 
  },
  delay: { 
    name: 'Delay', 
    icon: Disc, 
    params: { 
      time: { min: 0.01, max: 1, default: 0.3, step: 0.01, label: 'Time (s)' },
      feedback: { min: 0, max: 0.9, default: 0.4, step: 0.05, label: 'Feedback' },
      wet: { min: 0, max: 1, default: 0.3, step: 0.05, label: 'Wet' }
    } 
  },
  distortion: { 
    name: 'Distortion', 
    icon: Zap, 
    params: { amount: { min: 0, max: 100, default: 20, step: 1, label: 'Amount' } }
  },
  chorus: { 
    name: 'Chorus', 
    icon: Music, 
    params: { 
      rate: { min: 0.1, max: 10, default: 1.5, step: 0.1, label: 'Rate (Hz)' },
      depth: { min: 0, max: 1, default: 0.5, step: 0.05, label: 'Depth' },
      wet: { min: 0, max: 1, default: 0.3, step: 0.05, label: 'Wet' }
    } 
  },
  flanger: { 
    name: 'Flanger', 
    icon: Sliders, 
    params: { 
      rate: { min: 0.1, max: 10, default: 0.5, step: 0.1, label: 'Rate (Hz)' },
      depth: { min: 0, max: 1, default: 0.5, step: 0.05, label: 'Depth' },
      wet: { min: 0, max: 1, default: 0.5, step: 0.05, label: 'Wet' }
    } 
  },
  tremolo: { 
    name: 'Tremolo', 
    icon: Radio, 
    params: { 
      rate: { min: 0.1, max: 20, default: 5, step: 0.1, label: 'Rate (Hz)' },
      depth: { min: 0, max: 1, default: 0.5, step: 0.05, label: 'Depth' }
    } 
  },
  vibrato: { 
    name: 'Vibrato', 
    icon: Ghost, 
    params: { 
      rate: { min: 0.1, max: 15, default: 5, step: 0.1, label: 'Rate (Hz)' },
      depth: { min: 0, max: 1, default: 0.3, step: 0.05, label: 'Depth' }
    } 
  },
  robot: { 
    name: 'Robot', 
    icon: Cpu, 
    params: { 
      freq: { min: 50, max: 500, default: 200, step: 10, label: 'Freq (Hz)' },
      modDepth: { min: 0, max: 1, default: 0.5, step: 0.05, label: 'Mod Depth' },
      wet: { min: 0, max: 1, default: 0.7, step: 0.05, label: 'Wet' }
    } 
  },
  alien: { 
    name: 'Alien', 
    icon: Orbit, 
    params: { 
      freq: { min: 100, max: 1000, default: 400, step: 10, label: 'Freq (Hz)' },
      wet: { min: 0, max: 1, default: 0.6, step: 0.05, label: 'Wet' }
    } 
  },
  vocoder: { 
    name: 'Vocoder', 
    icon: Mic, 
    params: { 
      bands: { min: 2, max: 32, default: 16, step: 1, label: 'Bands' },
      wet: { min: 0, max: 1, default: 0.8, step: 0.05, label: 'Wet' }
    } 
  },
  radio: {
    name: 'Radio',
    icon: Radio,
    params: {}
  },
  phone: {
    name: 'Phone',
    icon: Phone,
    params: {}
  }
}

const PRESETS = [
  { name: 'Normal', effect: 'none', params: {} },
  { name: 'Deep Voice', effect: 'pitch', params: { pitch: 0.7 } },
  { name: 'Chipmunk', effect: 'pitch', params: { pitch: 1.8 } },
  { name: 'Cave', effect: 'reverb', params: { decay: 5, wet: 0.6 } },
  { name: 'Echo Chamber', effect: 'delay', params: { time: 0.5, feedback: 0.6, wet: 0.5 } },
  { name: 'Heavy Metal', effect: 'distortion', params: { amount: 60 } },
  { name: '80s Chorus', effect: 'chorus', params: { rate: 2, depth: 0.7, wet: 0.5 } },
  { name: 'Sci-Fi Flanger', effect: 'flanger', params: { rate: 3, depth: 0.8, wet: 0.6 } },
  { name: 'Radio Voice', effect: 'tremolo', params: { rate: 8, depth: 0.4 } },
  { name: 'Opera Singer', effect: 'vibrato', params: { rate: 5, depth: 0.2 } },
  { name: 'Robot', effect: 'robot', params: { freq: 150, modDepth: 0.6, wet: 0.8 } },
  { name: 'Space Alien', effect: 'alien', params: { freq: 600, wet: 0.7 } },
]

const VoiceFX = ({ 
  isOpen, 
  onClose, 
  applyEffect, 
  currentEffect = 'none',
  currentParams = {},
  isEnabled = false,
  onToggle,
  onReset
}) => {
  const [selectedEffect, setSelectedEffect] = useState(currentEffect)
  const [params, setParams] = useState(currentParams)
  const [enabled, setEnabled] = useState(isEnabled)
  const [savedPresets, setSavedPresets] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('voicefx_presets')) || []
    } catch { return [] }
  })

  // Sync with parent state but don't trigger parent updates
  useEffect(() => {
    setSelectedEffect(currentEffect)
    setParams(currentParams)
    setEnabled(isEnabled)
  }, [currentEffect, currentParams, isEnabled])

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
  }, [enabled, selectedEffect, params, applyEffect])

  const handleReset = useCallback(() => {
    setSelectedEffect('none')
    setParams({})
    setEnabled(false)
    applyEffect('none', {})
  }, [applyEffect])

  const savePreset = useCallback(() => {
    const name = prompt('Enter preset name:')
    if (!name) return
    const newPreset = { name, effect: selectedEffect, params }
    const updated = [...savedPresets, newPreset]
    setSavedPresets(updated)
    localStorage.setItem('voicefx_presets', JSON.stringify(updated))
  }, [savedPresets, selectedEffect, params])

  const deletePreset = useCallback((idx) => {
    const updated = savedPresets.filter((_, i) => i !== idx)
    setSavedPresets(updated)
    localStorage.setItem('voicefx_presets', JSON.stringify(updated))
  }, [savedPresets])

  if (!isOpen) return null

  const currentEffectConfig = EFFECTS[selectedEffect]

  return (
    <div className="voicefx-overlay" onClick={onClose}>
      <div className="voicefx-modal" onClick={e => e.stopPropagation()}>
        <div className="voicefx-header">
          <div className="voicefx-title">
            <Music size={20} />
            <span>VoiceFX</span>
          </div>
          <button className="voicefx-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="voicefx-content">
          <div className="voicefx-presets-section">
            <div className="voicefx-section-title">Presets</div>
            <div className="voicefx-presets-grid">
              {PRESETS.map((preset, idx) => (
                <button
                  key={idx}
                  className={`voicefx-preset-btn ${selectedEffect === preset.effect && JSON.stringify(params) === JSON.stringify(preset.params) ? 'active' : ''}`}
                  onClick={() => handlePresetClick(preset)}
                >
                  {preset.name}
                </button>
              ))}
              {savedPresets.map((preset, idx) => (
                <button
                  key={`saved-${idx}`}
                  className={`voicefx-preset-btn saved ${selectedEffect === preset.effect && JSON.stringify(params) === JSON.stringify(preset.params) ? 'active' : ''}`}
                  onClick={() => handlePresetClick(preset)}
                >
                  {preset.name}
                  <span 
                    className="voicefx-preset-delete"
                    onClick={(e) => { e.stopPropagation(); deletePreset(idx) }}
                  >
                    ×
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="voicefx-effects-section">
            <div className="voicefx-section-title">Effects</div>
            <div className="voicefx-effects-grid">
              {Object.entries(EFFECTS).map(([key, effect]) => {
                const Icon = effect.icon
                return (
                  <button
                    key={key}
                    className={`voicefx-effect-btn ${selectedEffect === key ? 'active' : ''}`}
                    onClick={() => handleEffectChange(key)}
                  >
                    <Icon size={20} />
                    <span>{effect.name}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {selectedEffect !== 'none' && currentEffectConfig?.params && (
            <div className="voicefx-params-section">
              <div className="voicefx-section-title">
                {currentEffectConfig.name} Settings
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
                      {(params[key] ?? config.default).toFixed(2)}
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
            {enabled ? <Pause size={16} /> : <Play size={16} />}
            {enabled ? 'Disable' : 'Enable'}
          </button>
          <button 
            className="voicefx-reset"
            onClick={handleReset}
          >
            <Reset size={16} />
            Reset
          </button>
          <button 
            className="voicefx-save" 
            onClick={savePreset}
            disabled={selectedEffect === 'none'}
          >
            <Save size={16} />
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

export default VoiceFX
export { EFFECTS, PRESETS }
