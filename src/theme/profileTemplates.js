/**
 * profileTemplates.js
 *
 * Preset profile templates users can apply to their profile.
 * Each template provides:
 *  - id: unique identifier
 *  - name: display name
 *  - description: short description
 *  - preview: { banner: gradient/color string, accent: hex color }
 *  - profileCSS: CSS string scoped with .profile-modal-container when viewing the owner's profile
 *  - settings: { bannerEffect, profileLayout, accentColor }
 */

export const PROFILE_TEMPLATES = [
  {
    id: 'default',
    name: 'Default',
    description: 'Clean default layout',
    preview: { banner: 'var(--volt-primary)', accent: null },
    profileCSS: '',
    settings: { bannerEffect: 'none', profileLayout: 'standard', accentColor: null }
  },
  {
    id: 'midnight',
    name: 'Midnight',
    description: 'Deep dark aesthetic with purple accents',
    preview: { banner: 'linear-gradient(135deg, #0d0d1a 0%, #1a0a2e 50%, #120826 100%)', accent: '#8b5cf6' },
    profileCSS: `
/* Midnight template - comprehensive */
.profile-modal-container {
  --profile-accent: #8b5cf6;
  --profile-bg: #0d0d1a;
  background: linear-gradient(180deg, #0d0d1a 0%, #0f0b1e 100%) !important;
  border: 1px solid rgba(139,92,246,0.2) !important;
}
.profile-banner-bg { background: linear-gradient(135deg, #0d0d1a 0%, #1a0a2e 50%, #120826 100%) !important; }
.profile-banner-bg::after { background: linear-gradient(transparent, #0d0d1a) !important; }
.profile-tab-btn.active { color: #8b5cf6 !important; border-bottom-color: #8b5cf6 !important; }
.profile-display-name { color: #e2d9f3 !important; }
.profile-username, .profile-host { color: rgba(226,217,243,0.55) !important; }
.profile-section { background: rgba(26,10,46,0.8) !important; border-color: rgba(139,92,246,0.12) !important; }
.section-header h3 { color: #8b5cf6 !important; }
.profile-tab-btn { color: rgba(226,217,243,0.55) !important; }
.profile-tab-btn:hover { color: #e2d9f3 !important; }
.bio-content, .member-date, .activity-text, .privacy-label { color: #e2d9f3 !important; }
.empty-state, .privacy-desc, .activity-time, .char-count, .stat-label { color: rgba(226,217,243,0.55) !important; }
.stat-item { background: rgba(18,8,38,0.95) !important; }
.stat-value { color: #8b5cf6 !important; }
.activity-item, .privacy-option { background: rgba(18,8,38,0.95) !important; }
.activity-icon, .mutual-acronym { background: #8b5cf6 !important; }
.social-link { background: rgba(26,10,46,0.8) !important; color: #e2d9f3 !important; }
.social-link:hover { background: rgba(18,8,38,0.95) !important; }
.btn-primary { background: #8b5cf6 !important; border-color: #8b5cf6 !important; color: #fff !important; }
.btn-secondary { background: rgba(26,10,46,0.8) !important; border-color: rgba(139,92,246,0.2) !important; color: #e2d9f3 !important; }
.loading-spinner { border-color: rgba(139,92,246,0.3) !important; border-top-color: #8b5cf6 !important; }
.profile-comment-body { background: rgba(26,10,46,0.8) !important; }
.profile-comment-author { color: #e2d9f3 !important; }
.profile-comment-text { color: #e2d9f3 !important; }
.profile-comment-time { color: rgba(226,217,243,0.55) !important; }
.profile-comment-input { background: rgba(18,8,38,0.95) !important; border-color: rgba(139,92,246,0.2) !important; color: #e2d9f3 !important; }
.profile-comment-input:focus { border-color: #8b5cf6 !important; }
.status-display { background: rgba(26,10,46,0.8) !important; }
.status-text { color: #e2d9f3 !important; }
.custom-status { color: rgba(226,217,243,0.55) !important; border-color: rgba(139,92,246,0.2) !important; }
.mutual-name { color: rgba(226,217,243,0.55) !important; }
`,
    settings: { bannerEffect: 'none', profileLayout: 'standard', accentColor: '#8b5cf6' }
  },
  {
    id: 'neon-cyber',
    name: 'Neon Cyber',
    description: 'Cyberpunk-inspired neon glow',
    preview: { banner: 'linear-gradient(135deg, #000b18 0%, #001428 50%, #000f22 100%)', accent: '#00d4ff' },
    profileCSS: `
/* Neon Cyber template - comprehensive */
.profile-modal-container {
  --profile-accent: #00d4ff;
  --profile-bg: #000b18;
  background: #000b18 !important;
  border: 1px solid rgba(0,212,255,0.3) !important;
  box-shadow: 0 0 40px rgba(0,212,255,0.08), 0 25px 80px rgba(0,0,0,0.7) !important;
}
.profile-banner-bg { background: linear-gradient(135deg, #000b18 0%, #001428 50%, #000f22 100%) !important; }
.profile-banner-bg::after { background: linear-gradient(transparent, #000b18) !important; }
.profile-display-name { color: #00d4ff !important; text-shadow: 0 0 20px rgba(0,212,255,0.5) !important; }
.profile-username, .profile-host { color: rgba(0,212,255,0.55) !important; }
.profile-section { background: rgba(0,20,40,0.9) !important; border-color: rgba(0,212,255,0.1) !important; }
.section-header h3 { color: #00d4ff !important; }
.profile-tab-btn { color: rgba(0,212,255,0.55) !important; }
.profile-tab-btn:hover { color: #00d4ff !important; }
.profile-tab-btn.active { color: #00d4ff !important; border-bottom-color: #00d4ff !important; text-shadow: 0 0 10px rgba(0,212,255,0.5) !important; }
.bio-content, .member-date, .activity-text, .privacy-label { color: #00d4ff !important; }
.empty-state, .privacy-desc, .activity-time, .char-count, .stat-label { color: rgba(0,212,255,0.55) !important; }
.stat-item { background: rgba(0,15,34,0.95) !important; }
.stat-value { color: #00d4ff !important; }
.activity-item, .privacy-option { background: rgba(0,15,34,0.95) !important; }
.activity-icon, .mutual-acronym { background: #00d4ff !important; }
.social-link { background: rgba(0,20,40,0.9) !important; color: #00d4ff !important; }
.social-link:hover { background: rgba(0,15,34,0.95) !important; }
.btn-primary { background: #00d4ff !important; border-color: #00d4ff !important; color: #000 !important; }
.btn-secondary { background: rgba(0,20,40,0.9) !important; border-color: rgba(0,212,255,0.3) !important; color: #00d4ff !important; }
.loading-spinner { border-color: rgba(0,212,255,0.3) !important; border-top-color: #00d4ff !important; }
.profile-comment-body { background: rgba(0,20,40,0.9) !important; }
.profile-comment-author { color: #00d4ff !important; }
.profile-comment-text { color: #00d4ff !important; }
.profile-comment-time { color: rgba(0,212,255,0.55) !important; }
.profile-comment-input { background: rgba(0,15,34,0.95) !important; border-color: rgba(0,212,255,0.3) !important; color: #00d4ff !important; }
.profile-comment-input:focus { border-color: #00d4ff !important; }
.status-display { background: rgba(0,20,40,0.9) !important; }
.status-text { color: #00d4ff !important; }
.custom-status { color: rgba(0,212,255,0.55) !important; border-color: rgba(0,212,255,0.3) !important; }
.mutual-name { color: rgba(0,212,255,0.55) !important; }
.profile-avatar-img { border-color: rgba(0,212,255,0.5) !important; box-shadow: 0 0 20px rgba(0,212,255,0.3) !important; }
`,
    settings: { bannerEffect: 'aurora', profileLayout: 'standard', accentColor: '#00d4ff' }
  },
  {
    id: 'sunset',
    name: 'Sunset',
    description: 'Warm orange and pink tones',
    preview: { banner: 'linear-gradient(135deg, #ff6b35 0%, #f7c59f 50%, #e05c97 100%)', accent: '#ff6b35' },
    profileCSS: `
/* Sunset template */
.profile-modal-container {
  --profile-accent: #ff6b35;
  background: #1a0c0a !important;
  border: 1px solid rgba(255,107,53,0.2) !important;
}
.profile-banner-bg {
  background: linear-gradient(135deg, #ff6b35 0%, #f7c59f 50%, #e05c97 100%) !important;
}
.profile-display-name { color: #ffdacc !important; }
.profile-tab-btn.active {
  color: #ff6b35 !important;
  border-bottom-color: #ff6b35 !important;
}
.section-header h3 { color: #ff8c5e !important; }
.profile-section { border-color: rgba(255,107,53,0.12) !important; }
`,
    settings: { bannerEffect: 'gradient-shift', profileLayout: 'standard', accentColor: '#ff6b35' }
  },
  {
    id: 'forest',
    name: 'Forest',
    description: 'Natural green calm',
    preview: { banner: 'linear-gradient(135deg, #0a1a0f 0%, #1a3a20 50%, #0d2412 100%)', accent: '#4ade80' },
    profileCSS: `
/* Forest template */
.profile-modal-container {
  --profile-accent: #4ade80;
  background: #0a1a0f !important;
  border: 1px solid rgba(74,222,128,0.15) !important;
}
.profile-banner-bg {
  background: linear-gradient(135deg, #0a1a0f 0%, #1a3a20 50%, #0d2412 100%) !important;
}
.profile-display-name { color: #bbf7d0 !important; }
.profile-tab-btn.active { color: #4ade80 !important; border-bottom-color: #4ade80 !important; }
.section-header h3 { color: #4ade80 !important; }
.profile-section { border-color: rgba(74,222,128,0.1) !important; }
.profile-avatar-img { border-color: rgba(74,222,128,0.4) !important; }
`,
    settings: { bannerEffect: 'none', profileLayout: 'standard', accentColor: '#4ade80' }
  },
  {
    id: 'rose-gold',
    name: 'Rose Gold',
    description: 'Elegant rose gold aesthetic',
    preview: { banner: 'linear-gradient(135deg, #1a0a10 0%, #2d1520 50%, #1f0e16 100%)', accent: '#f9a8d4' },
    profileCSS: `
/* Rose Gold template */
.profile-modal-container {
  --profile-accent: #f9a8d4;
  background: #1a0a10 !important;
  border: 1px solid rgba(249,168,212,0.2) !important;
}
.profile-banner-bg {
  background: linear-gradient(135deg, #b76e79 0%, #f9a8d4 50%, #d4a0b0 100%) !important;
}
.profile-display-name { color: #fce7f3 !important; }
.profile-tab-btn.active { color: #f9a8d4 !important; border-bottom-color: #f9a8d4 !important; }
.section-header h3 { color: #f9a8d4 !important; }
.profile-section { border-color: rgba(249,168,212,0.1) !important; }
.profile-avatar-img { border-color: rgba(249,168,212,0.4) !important; }
`,
    settings: { bannerEffect: 'pulse', profileLayout: 'standard', accentColor: '#f9a8d4' }
  },
  {
    id: 'ocean',
    name: 'Ocean',
    description: 'Deep ocean blues and teals',
    preview: { banner: 'linear-gradient(135deg, #0a1628 0%, #0e2a4a 50%, #0d2240 100%)', accent: '#38bdf8' },
    profileCSS: `
/* Ocean template */
.profile-modal-container {
  --profile-accent: #38bdf8;
  background: #060f1e !important;
  border: 1px solid rgba(56,189,248,0.2) !important;
}
.profile-banner-bg {
  background: linear-gradient(135deg, #0a1628 0%, #0e2a4a 50%, #0d2240 100%) !important;
}
.profile-display-name { color: #bae6fd !important; }
.profile-tab-btn.active { color: #38bdf8 !important; border-bottom-color: #38bdf8 !important; }
.section-header h3 { color: #38bdf8 !important; }
.profile-section { border-color: rgba(56,189,248,0.1) !important; }
.profile-avatar-img { border-color: rgba(56,189,248,0.4) !important; }
`,
    settings: { bannerEffect: 'wave', profileLayout: 'standard', accentColor: '#38bdf8' }
  },
  {
    id: 'synthwave',
    name: 'Synthwave',
    description: '80s retro wave vibes',
    preview: { banner: 'linear-gradient(180deg, #0d001a 0%, #1a0030 40%, #2d0050 100%)', accent: '#f200ff' },
    profileCSS: `
/* Synthwave template */
.profile-modal-container {
  --profile-accent: #f200ff;
  background: #0d001a !important;
  border: 1px solid rgba(242,0,255,0.25) !important;
  box-shadow: 0 0 60px rgba(242,0,255,0.05), 0 0 120px rgba(0,200,255,0.03) !important;
}
.profile-banner-bg {
  background: linear-gradient(180deg, #0d001a 0%, #1a0030 40%, #2d0050 100%) !important;
}
.profile-display-name {
  color: #ff77ff !important;
  text-shadow: 0 0 20px rgba(242,0,255,0.8), 0 0 40px rgba(242,0,255,0.4) !important;
}
.profile-tab-btn.active { color: #f200ff !important; border-bottom-color: #f200ff !important; }
.section-header h3 {
  color: #00e5ff !important;
  text-shadow: 0 0 10px rgba(0,229,255,0.5) !important;
}
.profile-section { border-color: rgba(242,0,255,0.12) !important; }
.profile-avatar-img {
  border-color: rgba(242,0,255,0.6) !important;
  box-shadow: 0 0 20px rgba(242,0,255,0.4), 0 0 40px rgba(0,229,255,0.2) !important;
}
`,
    settings: { bannerEffect: 'aurora', profileLayout: 'standard', accentColor: '#f200ff' }
  },
  {
    id: 'minimal-light',
    name: 'Minimal Light',
    description: 'Clean light minimal look',
    preview: { banner: 'linear-gradient(135deg, #f0f4f8 0%, #e2eaf4 100%)', accent: '#3b82f6' },
    profileCSS: `
/* Minimal Light template */
.profile-modal-container {
  --profile-accent: #3b82f6;
  background: #ffffff !important;
  border: 1px solid rgba(0,0,0,0.1) !important;
  box-shadow: 0 10px 40px rgba(0,0,0,0.1) !important;
}
.profile-banner-bg {
  background: linear-gradient(135deg, #f0f4f8 0%, #e2eaf4 100%) !important;
}
.profile-banner-bg::after { background: linear-gradient(transparent, #ffffff) !important; }
.profile-display-name { color: #111827 !important; }
.profile-username { color: #6b7280 !important; }
.profile-tab-btn { color: #374151 !important; }
.profile-tab-btn.active { color: #3b82f6 !important; border-bottom-color: #3b82f6 !important; }
.profile-section { border-color: rgba(0,0,0,0.08) !important; }
.section-header h3 { color: #374151 !important; }
.profile-tabs-nav { border-color: rgba(0,0,0,0.1) !important; }
.profile-tabs-content { background: #ffffff !important; }
.profile-avatar-img { border-color: #ffffff !important; }
.bio-content, .empty-state { color: #6b7280 !important; }
`,
    settings: { bannerEffect: 'none', profileLayout: 'standard', accentColor: '#3b82f6' }
  },
  {
    id: 'hacker',
    name: 'Hacker',
    description: 'Terminal green on pure black',
    preview: { banner: '#000000', accent: '#00ff41' },
    profileCSS: `
/* Hacker template */
.profile-modal-container {
  --profile-accent: #00ff41;
  background: #000000 !important;
  border: 1px solid rgba(0,255,65,0.3) !important;
  font-family: 'Courier New', Courier, monospace !important;
}
.profile-banner-bg {
  background: #000000 !important;
}
.profile-display-name {
  color: #00ff41 !important;
  text-shadow: 0 0 10px rgba(0,255,65,0.7) !important;
  font-family: monospace !important;
}
.profile-username { color: #00cc33 !important; font-family: monospace !important; }
.profile-tab-btn { color: #00bb2c !important; font-family: monospace !important; }
.profile-tab-btn.active { color: #00ff41 !important; border-bottom-color: #00ff41 !important; text-shadow: 0 0 8px rgba(0,255,65,0.6) !important; }
.section-header h3 { color: #00ff41 !important; font-family: monospace !important; }
.profile-section { border-color: rgba(0,255,65,0.15) !important; }
.profile-avatar-img { border-color: rgba(0,255,65,0.5) !important; filter: grayscale(20%) !important; }
.bio-content { color: #00cc33 !important; font-family: monospace !important; }
`,
    settings: { bannerEffect: 'none', profileLayout: 'standard', accentColor: '#00ff41' }
  }
]

export const getTemplateById = (id) =>
  PROFILE_TEMPLATES.find(t => t.id === id) || PROFILE_TEMPLATES[0]

export default PROFILE_TEMPLATES
