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
  serverMutes: {}
}

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

  resetSettings() {
    localStorage.removeItem(SETTINGS_KEY)
    return { ...defaultSettings }
  }
}
