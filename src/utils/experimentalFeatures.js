/**
 * Experimental Features System
 * 
 * Hidden experimental features that can only be enabled via console command.
 * Normal users won't see these in the UI - they're hidden behind a secret command.
 * 
 * Usage in console:
 *   window.enableExperimentalFeature('featureName')
 *   window.disableExperimentalFeature('featureName')
 *   window.listExperimentalFeatures()
 *   window.toggleExperimentalFeature('featureName') // toggle
 * 
 * Or use the secret command in the app:
 *   Press Ctrl+Shift+E to open experimental features console
 */

// Available experimental features
export const EXPERIMENTAL_FEATURES = {
  // Voice/Activity features
  'activity-grid-view': {
    name: 'Activity Grid View',
    description: 'Display activities in a grid layout similar to voice participants',
    defaultValue: false,
    category: 'activities'
  },
  'enhanced-voice-ui': {
    name: 'Enhanced Voice UI',
    description: 'Additional voice channel UI improvements and animations',
    defaultValue: false,
    category: 'voice'
  },
  'voice-participant-grid': {
    name: 'Voice Participant Grid',
    description: 'Improved grid layout for voice participants',
    defaultValue: false,
    category: 'voice'
  },
  
  // Chat features
  'enhanced-typing-indicators': {
    name: 'Enhanced Typing Indicators',
    description: 'Show typing status from multiple users with avatars',
    defaultValue: false,
    category: 'chat'
  },
  'message-reactions': {
    name: 'Message Reactions',
    description: 'Allow reacting to messages with emojis',
    defaultValue: false,
    category: 'chat'
  },
  'thread-support': {
    name: 'Thread Support',
    description: 'Create and manage message threads',
    defaultValue: false,
    category: 'chat'
  },
  
  // Video features
  'video-background-blur': {
    name: 'Video Background Blur',
    description: 'Blur your background during video calls',
    defaultValue: false,
    category: 'video'
  },
  'virtual-backgrounds': {
    name: 'Virtual Backgrounds',
    description: 'Use custom images as your video background',
    defaultValue: false,
    category: 'video'
  },
  
  // UI/UX features
  'compact-mode': {
    name: 'Compact Mode',
    description: 'Use a more compact UI layout',
    defaultValue: false,
    category: 'ui'
  },
  'dark-mode-plus': {
    name: 'Dark Mode Plus',
    description: 'Additional dark theme customizations',
    defaultValue: false,
    category: 'ui'
  },
  'animated-status': {
    name: 'Animated Status',
    description: 'Show animated custom status indicators',
    defaultValue: false,
    category: 'ui'
  },
  
  // Advanced features (potentially risky)
  'raw-websocket': {
    name: 'Raw WebSocket Debug',
    description: 'Show raw WebSocket traffic in console (may trigger rate limits)',
    defaultValue: false,
    category: 'advanced',
    warning: 'May cause rate limits or bans from backend if abused'
  },
  'skip-encryption': {
    name: 'Skip Message Encryption',
    description: 'Send messages without E2EE encryption (DANGEROUS - may expose messages)',
    defaultValue: false,
    category: 'advanced',
    warning: 'May expose unencrypted messages - use with caution'
  },
  'force-reconnect': {
    name: 'Force Reconnect',
    description: 'Force immediate reconnection on connection issues',
    defaultValue: false,
    category: 'advanced'
  },
  
  // Developer features
  'debug-mode': {
    name: 'Debug Mode',
    description: 'Enable verbose debugging information',
    defaultValue: false,
    category: 'developer'
  },
  'perf-monitor': {
    name: 'Performance Monitor',
    description: 'Show FPS and memory usage overlay',
    defaultValue: false,
    category: 'developer'
  }
}

// Storage key for experimental features
const STORAGE_KEY = 'voltchat_experimental_features'

// Get current feature states from localStorage
const getStoredFeatures = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : {}
  } catch {
    return {}
  }
}

// Save feature states to localStorage
const saveStoredFeatures = (features) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(features))
  } catch {
    console.warn('[Experimental] Could not save to localStorage')
  }
}

// Initialize features with defaults
const initializeFeatures = () => {
  const stored = getStoredFeatures()
  const initial = {}
  
  Object.keys(EXPERIMENTAL_FEATURES).forEach(key => {
    // Use stored value if exists, otherwise use default
    initial[key] = stored[key] !== undefined ? stored[key] : EXPERIMENTAL_FEATURES[key].defaultValue
  })
  
  return initial
}

// Current feature states
let experimentalFeatures = initializeFeatures()

// Subscribe to changes
const listeners = new Set()

/**
 * Get the current state of an experimental feature
 * @param {string} featureId - The feature identifier
 * @returns {boolean} Whether the feature is enabled
 */
export const isFeatureEnabled = (featureId) => {
  return experimentalFeatures[featureId] === true
}

/**
 * Get all experimental feature states
 * @returns {Object} Object with feature IDs as keys and boolean states as values
 */
export const getAllFeatureStates = () => {
  return { ...experimentalFeatures }
}

/**
 * Get feature information
 * @param {string} featureId - The feature identifier
 * @returns {Object|null} Feature info object or null if not found
 */
export const getFeatureInfo = (featureId) => {
  return EXPERIMENTAL_FEATURES[featureId] || null
}

/**
 * Get all features by category
 * @returns {Object} Object with category names as keys and arrays of features as values
 */
export const getFeaturesByCategory = () => {
  const categories = {}
  
  Object.entries(EXPERIMENTAL_FEATURES).forEach(([id, info]) => {
    const cat = info.category || 'other'
    if (!categories[cat]) categories[cat] = []
    categories[cat].push({ id, ...info, enabled: experimentalFeatures[id] })
  })
  
  return categories
}

/**
 * Enable an experimental feature
 * @param {string} featureId - The feature identifier
 * @returns {boolean} Success status
 */
export const enableFeature = (featureId) => {
  if (!EXPERIMENTAL_FEATURES[featureId]) {
    console.warn(`[Experimental] Unknown feature: ${featureId}`)
    return false
  }
  
  experimentalFeatures[featureId] = true
  saveStoredFeatures(experimentalFeatures)
  
  // Notify listeners
  listeners.forEach(listener => listener(featureId, true))
  
  console.log(`[Experimental] Enabled: ${featureId}`)
  return true
}

/**
 * Disable an experimental feature
 * @param {string} featureId - The feature identifier
 * @returns {boolean} Success status
 */
export const disableFeature = (featureId) => {
  if (!EXPERIMENTAL_FEATURES[featureId]) {
    console.warn(`[Experimental] Unknown feature: ${featureId}`)
    return false
  }
  
  experimentalFeatures[featureId] = false
  saveStoredFeatures(experimentalFeatures)
  
  // Notify listeners
  listeners.forEach(listener => listener(featureId, false))
  
  console.log(`[Experimental] Disabled: ${featureId}`)
  return true
}

/**
 * Toggle an experimental feature
 * @param {string} featureId - The feature identifier
 * @returns {boolean|null} New state or null if feature not found
 */
export const toggleFeature = (featureId) => {
  if (!EXPERIMENTAL_FEATURES[featureId]) {
    console.warn(`[Experimental] Unknown feature: ${featureId}`)
    return null
  }
  
  const newState = !experimentalFeatures[featureId]
  experimentalFeatures[featureId] = newState
  saveStoredFeatures(experimentalFeatures)
  
  // Notify listeners
  listeners.forEach(listener => listener(featureId, newState))
  
  console.log(`[Experimental] Toggled ${featureId}: ${newState ? 'ON' : 'OFF'}`)
  return newState
}

/**
 * Subscribe to feature changes
 * @param {Function} callback - Called with (featureId, newState) on change
 * @returns {Function} Unsubscribe function
 */
export const subscribeToFeatures = (callback) => {
  listeners.add(callback)
  return () => listeners.delete(callback)
}

/**
 * Reset all experimental features to defaults
 */
export const resetAllFeatures = () => {
  experimentalFeatures = {}
  Object.keys(EXPERIMENTAL_FEATURES).forEach(key => {
    experimentalFeatures[key] = EXPERIMENTAL_FEATURES[key].defaultValue
  })
  saveStoredFeatures(experimentalFeatures)
  listeners.forEach(listener => listener(null, null))
  console.log('[Experimental] All features reset to defaults')
}

/**
 * Get a formatted list of all features and their states
 * @returns {string} Formatted string for console output
 */
export const listFeatures = () => {
  const categories = getFeaturesByCategory()
  let output = '\n=== Experimental Features ===\n\n'
  
  Object.entries(categories).forEach(([category, features]) => {
    output += `${category.toUpperCase()}:\n`
    features.forEach(f => {
      const status = f.enabled ? '✅ ON' : '❌ OFF'
      output += `  ${status} - ${f.name}\n`
      output += `          ${f.description}\n`
      if (f.warning) {
        output += `          ⚠️  ${f.warning}\n`
      }
    })
    output += '\n'
  })
  
  output += '\nUse window.enableExperimentalFeature("name") or window.disableExperimentalFeature("name")'
  output += '\nOr use window.toggleExperimentalFeature("name") to toggle'
  output += '\nPress Ctrl+Shift+E in-app to open this list\n'
  
  return output
}

// Console commands - exposed to window for easy access
if (typeof window !== 'undefined') {
  window.enableExperimentalFeature = enableFeature
  window.disableExperimentalFeature = disableFeature
  window.toggleExperimentalFeature = toggleFeature
  window.listExperimentalFeatures = () => {
    console.log(listFeatures())
    return listFeatures()
  }
  window.getExperimentalFeatureState = isFeatureEnabled
  window.getAllExperimentalFeatures = getAllFeatureStates
  window.resetExperimentalFeatures = resetAllFeatures
  window.EXPERIMENTAL_FEATURES = EXPERIMENTAL_FEATURES
  
  console.log('%c⚡ Experimental Features System Loaded', 'color: #5ca8ff; font-size: 14px; font-weight: bold')
  console.log('%cUse window.listExperimentalFeatures() to see available features', 'color: #8c96a8')
  console.log('%cUse window.toggleExperimentalFeature("name") to enable/disable', 'color: #8c96a8')
  console.log('%c⚠️  Some features may cause issues if misused', 'color: var(--volt-warning)')
}

export default {
  isFeatureEnabled,
  getAllFeatureStates,
  getFeatureInfo,
  getFeaturesByCategory,
  enableFeature,
  disableFeature,
  toggleFeature,
  subscribeToFeatures,
  resetAllFeatures,
  listFeatures,
  EXPERIMENTAL_FEATURES
}
