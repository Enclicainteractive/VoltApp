const SETTINGS_KEY = 'voltchat_settings'

const defaultSettings = {
  notifications: true,
  pushNotifications: false,
  mentionNotifications: true,
  sounds: true,
  messageNotifications: true,
  friendRequests: true,
  volume: 100,
  inputVolume: 100,
  muteAll: false,
  dmPermissions: 'everyone',
  nsfwImageFilter: true,
  inputDevice: 'default',
  outputDevice: 'default',
  videoDevice: 'default',
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: true,
  serverMutes: {},
  soundpack: 'default',
  soundpackVolume: 100,
  discordRichPresence: false,
  voiceMuted: false,
  voiceDeafened: false,
  rememberVoiceState: true,
  keyboardShortcuts: {
    toggleMute: { key: 'M', ctrl: false, shift: true, alt: false, description: 'Toggle microphone mute' },
    toggleDeafen: { key: 'D', ctrl: false, shift: true, alt: false, description: 'Toggle audio deafen' },
    pushToTalk: { key: 'V', ctrl: false, shift: false, alt: true, description: 'Push to talk' },
    toggleSelfVideo: { key: 'V', ctrl: false, shift: true, alt: false, description: 'Toggle self video' },
    toggleScreenShare: { key: 'S', ctrl: false, shift: true, alt: false, description: 'Toggle screen share' },
    openSettings: { key: ',', ctrl: true, shift: false, alt: false, description: 'Open settings' },
    quickSwitcher: { key: 'K', ctrl: true, shift: false, alt: false, description: 'Quick switcher' },
    markAllRead: { key: 'R', ctrl: true, shift: false, alt: false, description: 'Mark all as read' },
    focusChat: { key: '/', ctrl: false, shift: false, alt: false, description: 'Focus chat input' },
    toggleSidebar: { key: 'B', ctrl: true, shift: false, alt: false, description: 'Toggle server sidebar' },
    goToHome: { key: 'H', ctrl: false, shift: true, alt: false, description: 'Go to home' },
    goToDMs: { key: 'I', ctrl: true, shift: false, alt: false, description: 'Go to DMs' },
    goToFriends: { key: 'F', ctrl: false, shift: true, alt: false, description: 'Go to friends' },
    goToDiscovery: { key: 'X', ctrl: false, shift: true, alt: false, description: 'Go to discovery' },
    toggleServerDrawer: { key: 'C', ctrl: true, shift: false, alt: false, description: 'Toggle channel drawer' }
  }
}

// Simple event emitter so components can react to live settings changes
const listeners = new Set()

export const settingsService = {
  getSettings() {
    try {
      const saved = localStorage.getItem(SETTINGS_KEY)
      if (saved) {
        return { ...defaultSettings, ...JSON.parse(saved) }
      }
    } catch (err) {
      console.error('[Settings] Error loading settings:', err)
    }
    return { ...defaultSettings }
  },

  saveSettings(settings) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
      // Notify all subscribers of the change
      listeners.forEach(fn => { try { fn(settings) } catch {} })
    } catch (err) {
      console.error('[Settings] Error saving settings:', err)
    }
  },

  getSetting(key) {
    const settings = this.getSettings()
    return settings[key] ?? defaultSettings[key]
  },

  setSetting(key, value) {
    const settings = this.getSettings()
    settings[key] = value
    this.saveSettings(settings)
  },

  // Subscribe to settings changes. Returns unsubscribe function.
  subscribe(fn) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },

  resetSettings() {
    localStorage.removeItem(SETTINGS_KEY)
    const defaults = { ...defaultSettings }
    listeners.forEach(fn => { try { fn(defaults) } catch {} })
    return defaults
  }
}
