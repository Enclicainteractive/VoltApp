const SETTINGS_KEY = 'voltchat_settings'

const defaultSettings = {
  notifications: true,
  pushNotifications: false,
  sounds: true,
  messageNotifications: true,
  friendRequests: true,
  volume: 100,
  inputVolume: 100,
  muteAll: false,
  dmPermissions: 'everyone',
  inputDevice: 'default',
  outputDevice: 'default',
  videoDevice: 'default',
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: true,
  serverMutes: {},
  soundpack: 'default',
  soundpackVolume: 100,
  // Voice state persistence
  voiceMuted: false,
  voiceDeafened: false,
  rememberVoiceState: true
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
