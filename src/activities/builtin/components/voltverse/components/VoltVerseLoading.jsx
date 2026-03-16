import React from 'react'
import {
  CircleStackIcon,
  CpuChipIcon,
  GlobeAltIcon,
  PaintBrushIcon
} from '@heroicons/react/24/outline'
import { useStore } from '../stores/voltverseStore'
import { LOADING_PHASES } from '../utils/roomFile'

const PhaseProgress = {
  [LOADING_PHASES.IDLE]: 0,
  [LOADING_PHASES.LOADING]: 10,
  [LOADING_PHASES.DECOMPRESSING]: 25,
  [LOADING_PHASES.PARSING]: 40,
  [LOADING_PHASES.LOADING_TEXTURES]: 55,
  [LOADING_PHASES.LOADING_MODELS]: 75,
  [LOADING_PHASES.LOADING_SHADERS]: 85,
  [LOADING_PHASES.CONSTRUCTING]: 95,
  [LOADING_PHASES.CONNECTING]: 98,
  [LOADING_PHASES.READY]: 100
}

const PhaseLabels = {
  [LOADING_PHASES.IDLE]: 'Initializing...',
  [LOADING_PHASES.LOADING]: 'Loading file...',
  [LOADING_PHASES.DECOMPRESSING]: 'Decompressing data...',
  [LOADING_PHASES.PARSING]: 'Parsing world data...',
  [LOADING_PHASES.LOADING_TEXTURES]: 'Loading textures...',
  [LOADING_PHASES.LOADING_MODELS]: 'Loading 3D models...',
  [LOADING_PHASES.LOADING_SHADERS]: 'Compiling shaders...',
  [LOADING_PHASES.CONSTRUCTING]: 'Constructing world...',
  [LOADING_PHASES.CONNECTING]: 'Connecting to instance...',
  [LOADING_PHASES.READY]: 'Ready!',
  [LOADING_PHASES.ERROR]: 'Error loading world'
}

const featureItems = [
  { label: 'Peer-to-Peer Networking', Icon: GlobeAltIcon },
  { label: 'VR + Desktop', Icon: CpuChipIcon },
  { label: 'Custom Shaders', Icon: PaintBrushIcon },
  { label: 'Portable Worlds', Icon: CircleStackIcon }
]

const VoltVerseLoading = () => {
  const { loadingProgress, loadingPhase } = useStore()
  
  const progress = loadingProgress || PhaseProgress[loadingPhase] || 0
  const label = PhaseLabels[loadingPhase] || 'Loading...'

  return (
    <div className="voltverse-loading-screen">
      <div className="voltverse-loading-background">
        <div className="voltverse-loading-grid" />
        <div className="voltverse-loading-particles">
          {Array.from({ length: 50 }).map((_, i) => (
            <div 
              key={i} 
              className="particle"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 3}s`,
                animationDuration: `${2 + Math.random() * 2}s`
              }}
            />
          ))}
        </div>
      </div>

      <div className="voltverse-loading-content">
        <div className="voltverse-logo-section">
          <h1 className="voltverse-title">VoltVerse</h1>
          <p className="voltverse-subtitle">3D Social Platform</p>
        </div>

        <div className="voltverse-loading-visualization">
          <canvas id="loading-canvas" width={400} height={400} />
          
          <div className="voltverse-orb-container">
            <div className="voltverse-orb">
              <div className="orb-core" />
              <div className="orb-ring ring-1" />
              <div className="orb-ring ring-2" />
              <div className="orb-ring ring-3" />
            </div>
            <div className="voltverse-scanning">
              <div className="scan-line" />
            </div>
          </div>
        </div>

        <div className="voltverse-loading-progress-section">
          <div className="voltverse-progress-bar-container">
            <div 
              className="voltverse-progress-bar"
              style={{ width: `${progress}%` }}
            />
            <div 
              className="voltverse-progress-glow"
              style={{ left: `${progress}%` }}
            />
          </div>
          
          <div className="voltverse-loading-info">
            <span className="voltverse-phase-label">{label}</span>
            <span className="voltverse-percentage">{Math.round(progress)}%</span>
          </div>
        </div>

        <div className="voltverse-loading-features">
          {featureItems.map(({ label: featureLabel, Icon }) => (
            <div key={featureLabel} className="feature-item">
              <span className="feature-icon"><Icon width={18} height={18} /></span>
              <span>{featureLabel}</span>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        .voltverse-loading-screen {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: linear-gradient(135deg, #0a0a15 0%, #1a1a2e 50%, #0f0f1f 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          overflow: hidden;
        }

        .voltverse-loading-background {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          overflow: hidden;
        }

        .voltverse-loading-grid {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-image: 
            linear-gradient(rgba(99, 102, 241, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(99, 102, 241, 0.03) 1px, transparent 1px);
          background-size: 50px 50px;
          animation: gridMove 20s linear infinite;
        }

        @keyframes gridMove {
          0% { transform: perspective(500px) rotateX(60deg) translateY(0); }
          100% { transform: perspective(500px) rotateX(60deg) translateY(50px); }
        }

        .voltverse-loading-particles {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
        }

        .particle {
          position: absolute;
          width: 4px;
          height: 4px;
          background: #6366f1;
          border-radius: 50%;
          opacity: 0.6;
          animation: particleFloat 3s ease-in-out infinite;
        }

        @keyframes particleFloat {
          0%, 100% { transform: translateY(0) scale(1); opacity: 0.6; }
          50% { transform: translateY(-30px) scale(1.5); opacity: 0.2; }
        }

        .voltverse-loading-content {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 30px;
          padding: 40px;
        }

        .voltverse-logo-section {
          text-align: center;
        }

        .voltverse-title {
          font-size: 56px;
          font-weight: 800;
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin: 0;
          text-shadow: 0 0 60px rgba(99, 102, 241, 0.5);
          letter-spacing: -2px;
        }

        .voltverse-subtitle {
          font-size: 16px;
          color: #64748b;
          margin: 8px 0 0 0;
          letter-spacing: 4px;
          text-transform: uppercase;
        }

        .voltverse-loading-visualization {
          width: 300px;
          height: 300px;
          position: relative;
        }

        .voltverse-orb-container {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
        }

        .voltverse-orb {
          position: relative;
          width: 120px;
          height: 120px;
        }

        .orb-core {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 40px;
          height: 40px;
          background: radial-gradient(circle, #fff 0%, #6366f1 50%, transparent 70%);
          border-radius: 50%;
          animation: pulse 2s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% { transform: translate(-50%, -50%) scale(1); }
          50% { transform: translate(-50%, -50%) scale(1.2); }
        }

        .orb-ring {
          position: absolute;
          top: 50%;
          left: 50%;
          border: 2px solid rgba(99, 102, 241, 0.5);
          border-radius: 50%;
          animation: ringExpand 3s ease-out infinite;
        }

        .ring-1 { width: 60px; height: 60px; margin: -30px 0 0 -30px; animation-delay: 0s; }
        .ring-2 { width: 90px; height: 90px; margin: -45px 0 0 -45px; animation-delay: 1s; }
        .ring-3 { width: 120px; height: 120px; margin: -60px 0 0 -60px; animation-delay: 2s; }

        @keyframes ringExpand {
          0% { transform: scale(0.5); opacity: 1; }
          100% { transform: scale(1.5); opacity: 0; }
        }

        .voltverse-scanning {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 150px;
          height: 150px;
          overflow: hidden;
        }

        .scan-line {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 4px;
          background: linear-gradient(90deg, transparent, #6366f1, transparent);
          animation: scanMove 2s ease-in-out infinite;
        }

        @keyframes scanMove {
          0%, 100% { top: 0; }
          50% { top: calc(100% - 4px); }
        }

        .voltverse-construction-scene {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 200px;
          height: 150px;
        }

        .voltverse-loading-progress-section {
          width: 400px;
          max-width: 90vw;
        }

        .voltverse-progress-bar-container {
          position: relative;
          height: 8px;
          background: rgba(99, 102, 241, 0.1);
          border-radius: 4px;
          overflow: visible;
        }

        .voltverse-progress-bar {
          position: absolute;
          top: 0;
          left: 0;
          height: 100%;
          background: linear-gradient(90deg, #6366f1, #8b5cf6, #ec4899);
          border-radius: 4px;
          transition: width 0.3s ease-out;
        }

        .voltverse-progress-glow {
          position: absolute;
          top: -4px;
          width: 20px;
          height: 16px;
          background: radial-gradient(ellipse, rgba(139, 92, 246, 0.8), transparent);
          transform: translateX(-50%);
          animation: glowPulse 1s ease-in-out infinite;
        }

        @keyframes glowPulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }

        .voltverse-loading-info {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 12px;
        }

        .voltverse-phase-label {
          font-size: 14px;
          color: #94a3b8;
          font-weight: 500;
        }

        .voltverse-percentage {
          font-size: 14px;
          color: #6366f1;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
        }

        .voltverse-construction-effects {
          position: relative;
          margin-top: 20px;
          height: 60px;
        }

        .construct-beam {
          position: absolute;
          bottom: 0;
          width: 2px;
          height: 40px;
          background: linear-gradient(to top, transparent, #10b981);
          animation: beamRise 1.5s ease-out infinite;
        }

        .beam-1 { left: 30%; animation-delay: 0s; }
        .beam-2 { right: 30%; animation-delay: 0.5s; }

        @keyframes beamRise {
          0% { height: 0; opacity: 1; }
          100% { height: 40px; opacity: 0; }
        }

        .construct-sparkles {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
        }

        .sparkle {
          position: absolute;
          left: var(--x);
          top: var(--y);
          width: 6px;
          height: 6px;
          background: #10b981;
          border-radius: 50%;
          animation: sparkle 0.6s ease-out infinite;
          animation-delay: var(--delay);
        }

        @keyframes sparkle {
          0% { transform: scale(0); opacity: 1; }
          50% { transform: scale(1.5); opacity: 0.8; }
          100% { transform: scale(0); opacity: 0; }
        }

        .voltverse-loading-features {
          display: flex;
          gap: 24px;
          flex-wrap: wrap;
          justify-content: center;
        }

        .feature-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          background: rgba(99, 102, 241, 0.1);
          border: 1px solid rgba(99, 102, 241, 0.2);
          border-radius: 20px;
          font-size: 12px;
          color: #94a3b8;
        }

        .feature-icon {
          width: 18px;
          height: 18px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
      `}</style>
    </div>
  )
}

export default VoltVerseLoading
