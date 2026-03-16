import { useState, useEffect, useCallback } from 'react'
import { 
  isFeatureEnabled, 
  subscribeToFeatures, 
  toggleFeature,
  enableFeature,
  disableFeature,
  getAllFeatureStates,
  EXPERIMENTAL_FEATURES
} from '../utils/experimentalFeatures'

/**
 * React hook to use an experimental feature
 * @param {string} featureId - The feature identifier
 * @returns {boolean} Whether the feature is enabled
 * 
 * Usage:
 * const isActivityGridEnabled = useExperimentalFeature('activity-grid-view')
 */
export const useExperimentalFeature = (featureId) => {
  const [enabled, setEnabled] = useState(() => isFeatureEnabled(featureId))
  
  useEffect(() => {
    // Set initial state
    setEnabled(isFeatureEnabled(featureId))
    
    // Subscribe to changes
    const unsubscribe = subscribeToFeatures((changedFeatureId, newState) => {
      if (changedFeatureId === featureId || changedFeatureId === null) {
        setEnabled(isFeatureEnabled(featureId))
      }
    })
    
    return unsubscribe
  }, [featureId])
  
  return enabled
}

/**
 * Hook to get all experimental feature states
 * @returns {Object} Object with feature IDs as keys and boolean states as values
 */
export const useAllExperimentalFeatures = () => {
  const [features, setFeatures] = useState(() => getAllFeatureStates())
  
  useEffect(() => {
    setFeatures(getAllFeatureStates())
    
    const unsubscribe = subscribeToFeatures(() => {
      setFeatures(getAllFeatureStates())
    })
    
    return unsubscribe
  }, [])
  
  return features
}

/**
 * Hook to get features by category
 * @returns {Object} Features grouped by category
 */
export const useFeaturesByCategory = () => {
  const [features, setFeatures] = useState(() => {
    const cats = {}
    Object.entries(EXPERIMENTAL_FEATURES).forEach(([id, info]) => {
      const cat = info.category || 'other'
      if (!cats[cat]) cats[cat] = []
      cats[cat].push({ id, ...info })
    })
    return cats
  })
  
  return features
}

/**
 * Hook to toggle a feature with callbacks
 * @param {string} featureId - The feature identifier
 * @returns {Object} { toggle: Function, enable: Function, disable: Function, isEnabled: boolean }
 */
export const useFeatureToggle = (featureId) => {
  const enabled = useExperimentalFeature(featureId)
  
  const toggle = useCallback(() => {
    return toggleFeature(featureId)
  }, [featureId])
  
  const enable = useCallback(() => {
    return enableFeature(featureId)
  }, [featureId])
  
  const disable = useCallback(() => {
    return disableFeature(featureId)
  }, [featureId])
  
  return { toggle, enable, disable, isEnabled: enabled }
}

export default useExperimentalFeature
