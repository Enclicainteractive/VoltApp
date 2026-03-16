/**
 * AnimationSettings.jsx
 * Feature 9: Animation presets and settings
 */
import React, { useState } from 'react';
import { Play, Pause, Zap, Sparkles, Wind, Waves, Activity, Box, RotateCcw } from 'lucide-react';
import './AnimationSettings.css';

const ANIMATION_PRESETS = [
  {
    id: 'none',
    name: 'None',
    description: 'No animations',
    icon: Pause,
    preview: 'static'
  },
  {
    id: 'fade',
    name: 'Fade',
    description: 'Smooth fade transitions',
    icon: Wind,
    preview: 'fade',
    duration: 300
  },
  {
    id: 'slide',
    name: 'Slide',
    description: 'Slide in from bottom',
    icon: Activity,
    preview: 'slide',
    duration: 400
  },
  {
    id: 'bounce',
    name: 'Bounce',
    description: 'Playful bouncy entrance',
    icon: Box,
    preview: 'bounce',
    duration: 500
  },
  {
    id: 'scale',
    name: 'Scale',
    description: 'Zoom in effect',
    icon: Zap,
    preview: 'scale',
    duration: 350
  },
  {
    id: 'elastic',
    name: 'Elastic',
    description: 'Elastic spring animation',
    icon: Waves,
    preview: 'elastic',
    duration: 600
  },
  {
    id: 'flip',
    name: 'Flip',
    description: '3D flip animation',
    icon: RotateCcw,
    preview: 'flip',
    duration: 500
  },
  {
    id: 'glitch',
    name: 'Glitch',
    description: 'Cyberpunk glitch effect',
    icon: Sparkles,
    preview: 'glitch',
    duration: 400
  }
];

const EXIT_ANIMATIONS = [
  { id: 'fade-out', name: 'Fade Out' },
  { id: 'slide-down', name: 'Slide Down' },
  { id: 'scale-out', name: 'Scale Out' },
  { id: 'slide-right', name: 'Slide Right' },
];

const ANIMATION_SPEEDS = [
  { id: 'slow', name: 'Slow', multiplier: 1.5 },
  { id: 'normal', name: 'Normal', multiplier: 1 },
  { id: 'fast', name: 'Fast', multiplier: 0.6 },
  { id: 'instant', name: 'Instant', multiplier: 0 },
];

const AnimationSettings = ({ settings = {}, onChange }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [previewAnimation, setPreviewAnimation] = useState(null);

  const handlePlayPreview = (presetId) => {
    setPreviewAnimation(presetId);
    setIsPlaying(true);
    setTimeout(() => {
      setIsPlaying(false);
      setPreviewAnimation(null);
    }, 1000);
  };

  const updateSetting = (key, value) => {
    onChange({ ...settings, [key]: value });
  };

  return (
    <div className="animation-settings">
      {/* Entrance Animations */}
      <div className="animation-section">
        <h4><Play size={16} /> Entrance Animation</h4>
        <div className="animation-presets">
          {ANIMATION_PRESETS.map(preset => {
            const Icon = preset.icon;
            return (
              <button
                key={preset.id}
                className={`animation-preset-card ${settings.entranceAnimation === preset.id ? 'active' : ''}`}
                onClick={() => updateSetting('entranceAnimation', preset.id)}
              >
                <div className={`preset-preview ${preset.preview} ${previewAnimation === preset.id && isPlaying ? 'playing' : ''}`}>
                  <div className="preview-box" />
                </div>
                <div className="preset-info">
                  <span className="preset-name">{preset.name}</span>
                  <span className="preset-desc">{preset.description}</span>
                </div>
                {settings.entranceAnimation === preset.id && (
                  <button
                    className="preset-play"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePlayPreview(preset.id);
                    }}
                  >
                    <Play size={14} />
                  </button>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Exit Animations */}
      <div className="animation-section">
        <h4>Exit Animation</h4>
        <div className="exit-animation-options">
          {EXIT_ANIMATIONS.map(anim => (
            <button
              key={anim.id}
              className={`exit-option ${settings.exitAnimation === anim.id ? 'active' : ''}`}
              onClick={() => updateSetting('exitAnimation', anim.id)}
            >
              {anim.name}
            </button>
          ))}
        </div>
      </div>

      {/* Animation Speed */}
      <div className="animation-section">
        <h4>Animation Speed</h4>
        <div className="speed-options">
          {ANIMATION_SPEEDS.map(speed => (
            <button
              key={speed.id}
              className={`speed-option ${settings.animationSpeed === speed.id ? 'active' : ''}`}
              onClick={() => updateSetting('animationSpeed', speed.id)}
              data-speed={speed.id}
            >
              <div className="speed-indicator">
                <div className="speed-bar" />
                <div className="speed-bar" />
                <div className="speed-bar" />
              </div>
              <span>{speed.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Advanced Settings */}
      <div className="animation-section">
        <h4>Advanced Options</h4>
        <div className="advanced-options">
          <div
            className="advanced-option"
            onClick={() => updateSetting('smoothTransitions', !settings.smoothTransitions)}
          >
            <div className="option-info">
              <span className="option-label">Smooth Transitions</span>
              <span className="option-desc">Use easing for smoother animations</span>
            </div>
            <input
              type="checkbox"
              checked={settings.smoothTransitions !== false}
              onChange={(e) => updateSetting('smoothTransitions', e.target.checked)}
              onClick={(e) => e.stopPropagation()}
            />
          </div>

          <div
            className="advanced-option"
            onClick={() => updateSetting('reducedMotion', !settings.reducedMotion)}
          >
            <div className="option-info">
              <span className="option-label">Reduced Motion</span>
              <span className="option-desc">Minimize animations for accessibility</span>
            </div>
            <input
              type="checkbox"
              checked={settings.reducedMotion || false}
              onChange={(e) => updateSetting('reducedMotion', e.target.checked)}
              onClick={(e) => e.stopPropagation()}
            />
          </div>

          <div
            className="advanced-option"
            onClick={() => updateSetting('staggerChildren', !settings.staggerChildren)}
          >
            <div className="option-info">
              <span className="option-label">Stagger Children</span>
              <span className="option-desc">Animate list items sequentially</span>
            </div>
            <input
              type="checkbox"
              checked={settings.staggerChildren || false}
              onChange={(e) => updateSetting('staggerChildren', e.target.checked)}
              onClick={(e) => e.stopPropagation()}
            />
          </div>

          <div
            className="advanced-option"
            onClick={() => updateSetting('parallaxEffects', !settings.parallaxEffects)}
          >
            <div className="option-info">
              <span className="option-label">Parallax Effects</span>
              <span className="option-desc">Enable depth-based animations</span>
            </div>
            <input
              type="checkbox"
              checked={settings.parallaxEffects || false}
              onChange={(e) => updateSetting('parallaxEffects', e.target.checked)}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      </div>

      {/* Animation Preview */}
      <div className="animation-section">
        <h4>Live Preview</h4>
        <div className="live-preview-container">
          <div 
            className={`live-preview-box ${isPlaying ? `animating-${previewAnimation || settings.entranceAnimation}` : ''}`}
            style={{
              animationDuration: settings.animationSpeed ? 
                `${ANIMATION_SPEEDS.find(s => s.id === settings.animationSpeed)?.multiplier * 0.5 || 0.5}s` : '0.5s'
            }}
          >
            <Sparkles size={24} />
            <span>Preview</span>
          </div>
          <button 
            className="preview-trigger-btn"
            onClick={() => handlePlayPreview(settings.entranceAnimation || 'fade')}
            disabled={isPlaying}
          >
            {isPlaying ? <Pause size={16} /> : <Play size={16} />}
            {isPlaying ? 'Playing...' : 'Play Animation'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AnimationSettings;
export { ANIMATION_PRESETS, EXIT_ANIMATIONS, ANIMATION_SPEEDS };
