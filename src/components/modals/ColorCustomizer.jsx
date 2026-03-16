/**
 * ColorCustomizer.jsx
 * Feature 5: Full theme color customization with picker
 */
import React, { useState, useCallback } from 'react';
import { Check, Copy, RefreshCw, Palette, Sliders } from 'lucide-react';
import './ColorCustomizer.css';

const PRESET_COLORS = [
  '#12d8ff', 'var(--volt-primary)', '#8a5cf6', '#f472b6', 'var(--volt-danger)',
  'var(--volt-success)', 'var(--volt-warning)', '#fb923c', 'var(--volt-primary-light)', '#a78bfa',
  '#f472b6', '#2dd4bf', 'var(--volt-warning)', 'var(--volt-danger)', 'var(--volt-success)',
  'var(--volt-primary)', '#8b5cf6', '#ec4899', '#f97316', 'var(--volt-success)',
  '#06b6d4', '#6366f1', '#d946ef', '#84cc16', '#eab308'
];

const THEME_VARIABLES = [
  { key: 'primary', label: 'Primary', description: 'Main accent color' },
  { key: 'success', label: 'Success', description: 'Positive actions' },
  { key: 'warning', label: 'Warning', description: 'Caution states' },
  { key: 'danger', label: 'Danger', description: 'Errors and destructive' },
  { key: 'bgPrimary', label: 'Background Primary', description: 'Main background' },
  { key: 'bgSecondary', label: 'Background Secondary', description: 'Card backgrounds' },
  { key: 'bgTertiary', label: 'Background Tertiary', description: 'Elevated surfaces' },
  { key: 'textPrimary', label: 'Text Primary', description: 'Main text color' },
  { key: 'textSecondary', label: 'Text Secondary', description: 'Secondary text' },
  { key: 'textMuted', label: 'Text Muted', description: 'Subtle text' },
  { key: 'border', label: 'Border', description: 'Border color' },
];

const GRADIENT_PRESETS = [
  { name: 'Ocean', from: '#12d8ff', to: '#1e3a8a' },
  { name: 'Sunset', from: '#f97316', to: 'var(--volt-danger)' },
  { name: 'Forest', from: 'var(--volt-success)', to: '#15803d' },
  { name: 'Berry', from: '#ec4899', to: '#8b5cf6' },
  { name: 'Midnight', from: '#6366f1', to: '#1e1b4b' },
  { name: 'Gold', from: 'var(--volt-warning)', to: 'var(--volt-warning)' },
];

const adjustBrightness = (hex, percent) => {
  const num = parseInt(hex.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.min(255, Math.max(0, (num >> 16) + amt));
  const G = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + amt));
  const B = Math.min(255, Math.max(0, (num & 0x0000FF) + amt));
  return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
};

const generatePalette = (baseColor) => {
  return {
    primary: baseColor,
    primaryDark: adjustBrightness(baseColor, -20),
    primaryLight: adjustBrightness(baseColor, 20),
  };
};

const ColorCustomizer = ({ color, onChange, fullMode = false }) => {
  const [activeTab, setActiveTab] = useState('picker');
  const [copied, setCopied] = useState(false);
  const [customColors, setCustomColors] = useState({
    primary: '#12d8ff',
    success: 'var(--volt-success)',
    warning: 'var(--volt-warning)',
    danger: 'var(--volt-danger)',
    bgPrimary: '#08111e',
    bgSecondary: '#0c1a2c',
    bgTertiary: '#0f2137',
    textPrimary: '#e6f5ff',
    textSecondary: '#bad7f2',
    textMuted: '#7fa1c2',
    border: '#1e3a56',
  });
  const [gradientEnabled, setGradientEnabled] = useState(false);
  const [gradientFrom, setGradientFrom] = useState('#12d8ff');
  const [gradientTo, setGradientTo] = useState('#1e3a8a');
  const [gradientAngle, setGradientAngle] = useState(135);

  const handleColorChange = useCallback((newColor) => {
    onChange(newColor);
  }, [onChange]);

  const handleCopyColor = () => {
    navigator.clipboard.writeText(color);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const adjustBrightness = (hex, percent) => {
    const num = parseInt(hex.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.min(255, Math.max(0, (num >> 16) + amt));
    const G = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + amt));
    const B = Math.min(255, Math.max(0, (num & 0x0000FF) + amt));
    return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
  };

  const generateRandomColor = () => {
    const randomColor = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
    handleColorChange(randomColor);
  };

  const generatePalette = (baseColor) => {
    return {
      primary: baseColor,
      primaryDark: adjustBrightness(baseColor, -20),
      primaryLight: adjustBrightness(baseColor, 20),
    };
  };

  if (!fullMode) {
    // Simple mode - just color picker
    return (
      <div className="color-customizer simple">
        <div className="color-picker-main">
          <input
            type="color"
            value={color}
            onChange={(e) => handleColorChange(e.target.value)}
            className="color-input-native"
          />
          <div className="color-value-display">
            <input
              type="text"
              value={color.toUpperCase()}
              onChange={(e) => {
                const val = e.target.value;
                if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
                  handleColorChange(val);
                }
              }}
              className="color-hex-input"
            />
            <button className="color-copy-btn" onClick={handleCopyColor}>
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </div>
        </div>

        <div className="color-presets">
          {PRESET_COLORS.map(preset => (
            <button
              key={preset}
              className={`color-preset ${color === preset ? 'active' : ''}`}
              style={{ backgroundColor: preset }}
              onClick={() => handleColorChange(preset)}
            />
          ))}
        </div>
      </div>
    );
  }

  // Full mode - complete theme customization
  return (
    <div className="color-customizer full">
      <div className="color-tabs">
        <button
          className={`color-tab ${activeTab === 'picker' ? 'active' : ''}`}
          onClick={() => setActiveTab('picker')}
        >
          <Palette size={16} /> Color Picker
        </button>
        <button
          className={`color-tab ${activeTab === 'variables' ? 'active' : ''}`}
          onClick={() => setActiveTab('variables')}
        >
          <Sliders size={16} /> Theme Variables
        </button>
      </div>

      {activeTab === 'picker' && (
        <div className="color-picker-tab">
          <div className="color-preview-large" style={{ background: color }}>
            <span className="color-preview-text">Preview</span>
          </div>

          <div className="color-controls">
            <input
              type="color"
              value={color}
              onChange={(e) => handleColorChange(e.target.value)}
              className="color-input-native large"
            />
            <div className="color-input-group">
              <input
                type="text"
                value={color.toUpperCase()}
                onChange={(e) => {
                  const val = e.target.value;
                  if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
                    handleColorChange(val);
                  }
                }}
                className="color-hex-input"
              />
              <button className="btn btn-icon" onClick={generateRandomColor}>
                <RefreshCw size={16} />
              </button>
              <button className="btn btn-icon" onClick={handleCopyColor}>
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
          </div>

          <div className="color-presets-grid">
            <h4>Presets</h4>
            <div className="presets-row">
              {PRESET_COLORS.map(preset => (
                <button
                  key={preset}
                  className={`color-preset ${color === preset ? 'active' : ''}`}
                  style={{ backgroundColor: preset }}
                  onClick={() => handleColorChange(preset)}
                />
              ))}
            </div>
          </div>

          <div className="gradient-section">
            <label className="gradient-toggle">
              <input
                type="checkbox"
                checked={gradientEnabled}
                onChange={(e) => setGradientEnabled(e.target.checked)}
              />
              Enable Gradient Background
            </label>

            {gradientEnabled && (
              <div className="gradient-controls">
                <div className="gradient-presets">
                  {GRADIENT_PRESETS.map(grad => (
                    <button
                      key={grad.name}
                      className="gradient-preset"
                      style={{ background: `linear-gradient(135deg, ${grad.from}, ${grad.to})` }}
                      onClick={() => {
                        setGradientFrom(grad.from);
                        setGradientTo(grad.to);
                      }}
                      title={grad.name}
                    />
                  ))}
                </div>
                <div className="gradient-custom">
                  <div className="gradient-color-inputs">
                    <input
                      type="color"
                      value={gradientFrom}
                      onChange={(e) => setGradientFrom(e.target.value)}
                    />
                    <input
                      type="color"
                      value={gradientTo}
                      onChange={(e) => setGradientTo(e.target.value)}
                    />
                  </div>
                  <div className="gradient-angle">
                    <label>Angle</label>
                    <input
                      type="range"
                      min="0"
                      max="360"
                      value={gradientAngle}
                      onChange={(e) => setGradientAngle(parseInt(e.target.value))}
                    />
                    <span>{gradientAngle}°</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'variables' && (
        <div className="variables-tab">
          <div className="variables-list">
            {THEME_VARIABLES.map(variable => (
              <div key={variable.key} className="variable-item">
                <div className="variable-info">
                  <span className="variable-label">{variable.label}</span>
                  <span className="variable-desc">{variable.description}</span>
                </div>
                <div className="variable-input">
                  <input
                    type="color"
                    value={customColors[variable.key] || '#000000'}
                    onChange={(e) => {
                      setCustomColors(prev => ({ ...prev, [variable.key]: e.target.value }));
                    }}
                  />
                  <input
                    type="text"
                    value={(customColors[variable.key] || '#000000').toUpperCase()}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
                        setCustomColors(prev => ({ ...prev, [variable.key]: val }));
                      }
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ColorCustomizer;
export { PRESET_COLORS, generatePalette, adjustBrightness };
