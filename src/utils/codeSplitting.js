// Code splitting utilities for VoltChat

import { lazy } from 'react'

const lazyComponentCache = new Map()
const loaderRegistry = new Map()
const modulePromiseCache = new Map()
const resolvedModules = new Map()

const registerLoader = (componentName, importFunc) => {
  if (!componentName || typeof importFunc !== 'function') return
  loaderRegistry.set(componentName, importFunc)
}

const withResolvedDefault = (module) => ({
  default: module?.default || module
})

const loadModuleByName = (componentName, options = {}) => {
  const { retries = 2, delay = 300 } = options

  if (resolvedModules.has(componentName)) {
    return Promise.resolve(resolvedModules.get(componentName))
  }

  if (modulePromiseCache.has(componentName)) {
    return modulePromiseCache.get(componentName)
  }

  const loader = loaderRegistry.get(componentName)
  if (!loader) {
    return Promise.reject(new Error(`Component ${componentName} is not registered`))
  }

  const loadPromise = dynamicImport(loader, retries, delay)
    .then((module) => {
      resolvedModules.set(componentName, module)
      return module
    })
    .finally(() => {
      modulePromiseCache.delete(componentName)
    })

  modulePromiseCache.set(componentName, loadPromise)
  return loadPromise
}

// Enhanced lazy loading with caching
export const createLazyComponent = (importFunc, componentName) => {
  if (lazyComponentCache.has(componentName)) {
    return lazyComponentCache.get(componentName)
  }

  registerLoader(componentName, importFunc)

  const LazyComponent = lazy(() =>
    loadModuleByName(componentName).then(withResolvedDefault)
  )

  lazyComponentCache.set(componentName, LazyComponent)
  return LazyComponent
}

// Route-based code splitting
export const LazyRoutes = {
  // Main pages
  ChatPage: createLazyComponent(
    () => import('../pages/ChatPage'),
    'ChatPage'
  ),

  LoginPage: createLazyComponent(
    () => import('../pages/LoginPage'),
    'LoginPage'
  ),

  RegisterPage: createLazyComponent(
    () => import('../pages/RegisterPage'),
    'RegisterPage'
  ),

  SettingsPage: createLazyComponent(
    () => import('../pages/SettingsPage'),
    'SettingsPage'
  ),

  // Profile pages
  ProfilePage: createLazyComponent(
    () => import('../pages/ProfilePage'),
    'ProfilePage'
  ),

  // Server management
  ServerSettingsPage: createLazyComponent(
    () => import('../pages/ServerSettingsPage'),
    'ServerSettingsPage'
  ),

  CreateServerPage: createLazyComponent(
    () => import('../pages/CreateServerPage'),
    'CreateServerPage'
  )
}

// Component-based code splitting
export const LazyComponents = {
  // Heavy components
  MessageList: createLazyComponent(
    () => import('../components/MessageList'),
    'MessageList'
  ),

  VirtualizedMessageList: createLazyComponent(
    () => import('../components/VirtualizedMessageList'),
    'VirtualizedMessageList'
  ),

  FileAttachment: createLazyComponent(
    () => import('../components/FileAttachment'),
    'FileAttachment'
  ),

  EmojiPicker: createLazyComponent(
    () => import('../components/EmojiPicker'),
    'EmojiPicker'
  ),

  // Modals (loaded on demand)
  ProfileModal: createLazyComponent(
    () => import('../components/modals/ProfileModal'),
    'ProfileModal'
  ),

  SettingsModal: createLazyComponent(
    () => import('../components/modals/SettingsModal'),
    'SettingsModal'
  ),

  ServerSettingsModal: createLazyComponent(
    () => import('../components/modals/ServerSettingsModal'),
    'ServerSettingsModal'
  ),

  ChannelSettingsModal: createLazyComponent(
    () => import('../components/modals/ChannelSettingsModal'),
    'ChannelSettingsModal'
  ),

  // Activities (heavy components)
  ActivitiesPanel: createLazyComponent(
    () => import('../components/ActivitiesPanel'),
    'ActivitiesPanel'
  ),

  // Audio visualizer
  EnhancedAudioVisualizer: createLazyComponent(
    () => import('../components/EnhancedAudioVisualizer'),
    'EnhancedAudioVisualizer'
  )
}

// Feature-based splitting
export const LazyFeatures = {
  // Voice features
  VoiceChannel: createLazyComponent(
    () => import('../components/VoiceChannel'),
    'VoiceChannel'
  ),

  VoiceRecorder: createLazyComponent(
    () => import('../components/VoiceRecorder'),
    'VoiceRecorder'
  ),

  // Game activities
  GameActivities: createLazyComponent(
    () => import('../components/activities/GameActivities'),
    'GameActivities'
  )
}

export const prefetchComponent = (componentName, options = {}) => {
  return loadModuleByName(componentName, options).catch((error) => {
    if (process.env.NODE_ENV === 'development') {
      console.warn(`Prefetch failed for ${componentName}:`, error)
    }
    return null
  })
}

export const prefetchComponents = (componentNames = [], options = {}) => {
  const names = Array.isArray(componentNames) ? componentNames : [componentNames]
  return Promise.allSettled(
    names
      .filter(Boolean)
      .map((name) => prefetchComponent(name, options))
  )
}

export const prefetchWhenIdle = (componentNames = [], timeout = 1800) => {
  const trigger = () => {
    void prefetchComponents(componentNames)
  }

  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    window.requestIdleCallback(trigger, { timeout })
    return
  }

  setTimeout(trigger, 120)
}

// Preload critical components
export const preloadCriticalComponents = () => {
  prefetchWhenIdle([
    'ChatPage',
    'MessageList',
    'ChannelSidebar',
    'ServerSidebar',
    'DMList',
    'FriendsPage',
    'Discovery'
  ])
}

// Preload components based on user interaction
export const preloadOnHover = (componentName) => {
  return prefetchComponent(componentName)
}

// Bundle analyzer helper
export const getBundleInfo = () => {
  if (process.env.NODE_ENV === 'development') {
    return {
      registeredComponents: Array.from(loaderRegistry.keys()),
      cachedLazyComponents: Array.from(lazyComponentCache.keys()),
      loadedModules: Array.from(resolvedModules.keys()),
      cacheSize: resolvedModules.size,
      memoryUsage: performance.memory ? {
        usedJSHeapSize: `${(performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(2)} MB`,
        totalJSHeapSize: `${(performance.memory.totalJSHeapSize / 1024 / 1024).toFixed(2)} MB`
      } : 'Not available'
    }
  }
  return null
}

// Cleanup unused components from cache
export const cleanupComponentCache = () => {
  let removed = 0
  modulePromiseCache.clear()

  resolvedModules.forEach((_, name) => {
    if (!loaderRegistry.has(name)) {
      resolvedModules.delete(name)
      removed += 1
    }
  })

  return removed
}

// Dynamic import with retry logic
export const dynamicImport = (importFunc, retries = 3, delay = 1000) => {
  return new Promise((resolve, reject) => {
    importFunc()
      .then(resolve)
      .catch(error => {
        if (retries > 0) {
          setTimeout(() => {
            dynamicImport(importFunc, retries - 1, delay * 2)
              .then(resolve)
              .catch(reject)
          }, delay)
        } else {
          reject(error)
        }
      })
  })
}

// WebPack chunk name hints for better debugging
export const createNamedLazyComponent = (importFunc, chunkName) => {
  return lazy(() =>
    importFunc().then(module => {
      if (process.env.NODE_ENV === 'development') {
        console.log(`Loaded chunk: ${chunkName}`)
      }
      return module
    })
  )
}

// Performance monitoring for code splitting
export const measureChunkLoadTime = (chunkName, importFunc) => {
  return lazy(() => {
    const startTime = performance.now()

    return importFunc().then(module => {
      const loadTime = performance.now() - startTime

      if (process.env.NODE_ENV === 'development') {
        console.log(`Chunk "${chunkName}" loaded in ${loadTime.toFixed(2)}ms`)
      }

      // Send to analytics in production
      if (process.env.NODE_ENV === 'production' && window.gtag) {
        window.gtag('event', 'chunk_load_time', {
          chunk_name: chunkName,
          load_time: Math.round(loadTime)
        })
      }

      return module
    })
  })
}
