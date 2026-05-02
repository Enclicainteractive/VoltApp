// Global Lazy Loading Service for VoltApp
// Handles progressive loading, priority queues, and performance optimization

class LazyLoadingService {
  constructor() {
    this.loadQueue = new Map() // priority -> [items]
    this.componentsByName = new Map()
    this.loadedComponents = new Set()
    this.isLoading = new Map() // component -> promise
    this.preloadCache = new Map()
    this.intersectionObserver = null
    this.routeChunkLoaders = new Map()
    this.routeChunkPromises = new Map()
    this.idleTaskTimers = new Set()
    this.priorities = {
      CRITICAL: 0,     // Core app shell, auth
      HIGH: 1,         // Main chat area, active channel
      MEDIUM: 2,       // Sidebars, member lists
      LOW: 3,          // Settings, modals (until opened)
      BACKGROUND: 4    // Analytics, non-essential features
    }
    
    this.init()
  }
  
  init() {
    if (typeof window === 'undefined') return

    // Create intersection observer for viewport-based loading
    if ('IntersectionObserver' in window) {
      this.intersectionObserver = new IntersectionObserver(
        this.handleIntersection.bind(this),
        {
          root: null,
          rootMargin: '50px', // Start loading 50px before visible
          threshold: [0, 0.1]
        }
      )
    }
    
    // Defer startup preloads until all components are registered.
    this.scheduleIdleTask(() => this.preloadCriticalResources(), { timeout: 600, delay: 0 })
    
    // Setup idle callback for background loading
    this.setupIdleLoading()
  }
  
  // Register a component for lazy loading
  registerComponent(name, loader, priority = this.priorities.MEDIUM, dependencies = []) {
    const existing = this.componentsByName.get(name)
    if (existing) {
      existing.loader = loader
      existing.priority = priority
      existing.dependencies = dependencies
      return existing
    }

    const item = {
      name,
      loader,
      priority,
      dependencies,
      loaded: false,
      loading: false,
      element: null,
      callbacks: []
    }
    
    if (!this.loadQueue.has(priority)) {
      this.loadQueue.set(priority, [])
    }
    this.loadQueue.get(priority).push(item)
    this.componentsByName.set(name, item)
    
    return item
  }

  registerRouteChunk(routeKey, loader) {
    if (!routeKey || typeof loader !== 'function') return
    this.routeChunkLoaders.set(routeKey, loader)
  }
  
  // Load component with priority handling
  async loadComponent(name, options = {}) {
    const { 
      priority = this.priorities.MEDIUM, 
      timeout = 10000,
      retries = 3 
    } = options
    
    // Return if already loaded
    if (this.loadedComponents.has(name)) {
      return this.preloadCache.get(name)
    }
    
    // Return existing loading promise if in progress
    if (this.isLoading.has(name)) {
      return this.isLoading.get(name)
    }
    
    // Find component in queue
    const component = this.findComponent(name)
    if (!component) {
      throw new Error(`Component ${name} not registered`)
    }
    
    // Check dependencies first
    await this.loadDependencies(component.dependencies)
    
    // Start loading
    const loadPromise = this.performLoad(component, timeout, retries)
    this.isLoading.set(name, loadPromise)
    
    try {
      const result = await loadPromise
      this.loadedComponents.add(name)
      this.preloadCache.set(name, result)
      this.isLoading.delete(name)
      
      // Trigger callbacks
      component.callbacks.forEach(callback => callback(result))
      component.callbacks = []
      
      return result
    } catch (error) {
      this.isLoading.delete(name)
      throw error
    }
  }
  
  // Perform the actual loading with retry logic
  async performLoad(component, timeout, retries) {
    let lastError = null
    
    for (let i = 0; i <= retries; i++) {
      try {
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Load timeout')), timeout)
        })
        
        const loadPromise = component.loader()
        const result = await Promise.race([loadPromise, timeoutPromise])
        
        // Track performance
        this.trackLoadPerformance(component.name, true)
        
        return result
      } catch (error) {
        lastError = error
        console.warn(`Load attempt ${i + 1}/${retries + 1} failed for ${component.name}:`, error)
        
        if (i < retries) {
          // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000))
        }
      }
    }
    
    this.trackLoadPerformance(component.name, false)
    throw lastError
  }
  
  // Load dependencies in order
  async loadDependencies(dependencies) {
    for (const dep of dependencies) {
      await this.loadComponent(dep)
    }
  }
  
  // Find component by name
  findComponent(name) {
    return this.componentsByName.get(name) || null
  }
  
  // Progressive loading based on priority
  async loadByPriority(targetPriority = this.priorities.MEDIUM) {
    const sortedPriorities = Array.from(this.loadQueue.keys()).sort((a, b) => a - b)
    
    for (const priority of sortedPriorities) {
      if (priority > targetPriority) break
      
      const components = this.loadQueue.get(priority) || []
      const loadPromises = components
        .filter(c => !this.loadedComponents.has(c.name))
        .map(c => this.loadComponent(c.name))
      
      // Load in parallel for same priority level
      await Promise.allSettled(loadPromises)
    }
  }
  
  // Intersection observer handler
  handleIntersection(entries) {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const componentName = entry.target.dataset.lazyComponent
        if (componentName && this.findComponent(componentName) && !this.loadedComponents.has(componentName)) {
          this.loadComponent(componentName, { priority: this.priorities.HIGH })
        }
      }
    })
  }
  
  // Setup idle loading for background components
  setupIdleLoading() {
    const idleLoad = () => {
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback((deadline) => {
          while (deadline.timeRemaining() > 0) {
            this.loadNextBackgroundComponent()
            if (this.isAllLoaded()) break
          }
        })
      } else {
        // Fallback for browsers without requestIdleCallback
        setTimeout(() => {
          this.loadNextBackgroundComponent()
        }, 100)
      }
    }
    
    // Start idle loading after initial render
    setTimeout(idleLoad, 2000)
  }

  scheduleIdleTask(task, options = {}) {
    const { timeout = 1500, delay = 0 } = options
    const enqueue = () => {
      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        window.requestIdleCallback(() => {
          try {
            task()
          } catch (error) {
            console.warn('Idle task failed:', error)
          }
        }, { timeout })
        return
      }
      const timer = setTimeout(() => {
        this.idleTaskTimers.delete(timer)
        try {
          task()
        } catch (error) {
          console.warn('Deferred task failed:', error)
        }
      }, 120)
      this.idleTaskTimers.add(timer)
    }

    if (delay > 0) {
      const timer = setTimeout(() => {
        this.idleTaskTimers.delete(timer)
        enqueue()
      }, delay)
      this.idleTaskTimers.add(timer)
      return
    }

    enqueue()
  }

  preloadComponents(componentNames = [], options = {}) {
    const names = Array.isArray(componentNames) ? componentNames : [componentNames]
    const trigger = () => {
      names.forEach((name) => {
        if (!name || this.loadedComponents.has(name)) return
        this.preload(name)
      })
    }

    if (options.idle) {
      this.scheduleIdleTask(trigger, { timeout: options.timeout || 1500 })
      return
    }
    trigger()
  }

  preloadRouteChunk(routeKey) {
    const loader = this.routeChunkLoaders.get(routeKey)
    if (!loader) return Promise.resolve(null)
    if (this.routeChunkPromises.has(routeKey)) return this.routeChunkPromises.get(routeKey)

    const loadPromise = loader()
      .catch((error) => {
        this.routeChunkPromises.delete(routeKey)
        throw error
      })
    this.routeChunkPromises.set(routeKey, loadPromise)
    return loadPromise
  }

  preloadRouteChunks(routeKeys = [], options = {}) {
    const keys = Array.isArray(routeKeys) ? routeKeys : [routeKeys]
    const trigger = () => {
      keys.forEach((key) => {
        if (!key) return
        this.preloadRouteChunk(key).catch((error) => {
          console.warn('Route preload failed:', key, error)
        })
      })
    }

    if (options.idle) {
      this.scheduleIdleTask(trigger, { timeout: options.timeout || 1800 })
      return
    }
    trigger()
  }
  
  // Load next component in background priority
  loadNextBackgroundComponent() {
    const backgroundComponents = this.loadQueue.get(this.priorities.BACKGROUND) || []
    const unloaded = backgroundComponents.find(c => !this.loadedComponents.has(c.name))
    
    if (unloaded) {
      this.loadComponent(unloaded.name).catch(error => {
        console.warn('Background load failed:', unloaded.name, error)
      })
    }
  }
  
  // Check if all components are loaded
  isAllLoaded() {
    for (const [_, components] of this.loadQueue) {
      if (components.some(c => !this.loadedComponents.has(c.name))) {
        return false
      }
    }
    return true
  }
  
  // Preload critical resources
  async preloadCriticalResources() {
    const criticalComponents = this.loadQueue.get(this.priorities.CRITICAL) || []
    const loadPromises = criticalComponents.map(c => this.loadComponent(c.name))
    
    try {
      await Promise.all(loadPromises)
      console.log('Critical resources preloaded')
    } catch (error) {
      console.error('Failed to preload critical resources:', error)
    }
  }
  
  // Observe element for lazy loading
  observe(element, componentName) {
    if (this.intersectionObserver && element && componentName && this.findComponent(componentName)) {
      element.dataset.lazyComponent = componentName
      this.intersectionObserver.observe(element)
    }
  }
  
  // Unobserve element
  unobserve(element) {
    if (this.intersectionObserver && element) {
      this.intersectionObserver.unobserve(element)
    }
  }
  
  // Preload component without executing
  async preload(componentName) {
    try {
      await this.loadComponent(componentName)
    } catch (error) {
      console.warn('Preload failed:', componentName, error)
    }
  }
  
  // Track loading performance
  trackLoadPerformance(componentName, success) {
    const metric = {
      component: componentName,
      success,
      timestamp: Date.now(),
      memory: this.getMemoryUsage()
    }
    
    // Store in performance service if available
    if (window.performanceService) {
      window.performanceService.recordMetric('lazyLoad', metric)
    }
  }
  
  // Get memory usage
  getMemoryUsage() {
    if ('memory' in performance) {
      return {
        used: performance.memory.usedJSHeapSize,
        total: performance.memory.totalJSHeapSize
      }
    }
    return null
  }
  
  // Get loading statistics
  getStats() {
    const totalComponents = Array.from(this.loadQueue.values()).reduce((sum, arr) => sum + arr.length, 0)
    const loadedCount = this.loadedComponents.size
    const loadingCount = this.isLoading.size
    
    return {
      total: totalComponents,
      loaded: loadedCount,
      loading: loadingCount,
      pending: totalComponents - loadedCount - loadingCount,
      progress: loadedCount / totalComponents
    }
  }
  
  // Reset service
  reset() {
    this.loadQueue.clear()
    this.componentsByName.clear()
    this.loadedComponents.clear()
    this.isLoading.clear()
    this.preloadCache.clear()
    this.routeChunkPromises.clear()
    this.idleTaskTimers.forEach(timer => clearTimeout(timer))
    this.idleTaskTimers.clear()
    
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect()
    }
  }
  
  // Dispose service
  dispose() {
    this.reset()
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect()
      this.intersectionObserver = null
    }
  }
}

// Create singleton instance
const lazyLoadingService = new LazyLoadingService()

// Register common components
lazyLoadingService.registerComponent('ChatArea', () => import('../components/ChatArea'), lazyLoadingService.priorities.CRITICAL)
lazyLoadingService.registerComponent('MessageList', () => import('../components/MessageList'), lazyLoadingService.priorities.CRITICAL)
lazyLoadingService.registerComponent('ServerSidebar', () => import('../components/ServerSidebar'), lazyLoadingService.priorities.HIGH)
lazyLoadingService.registerComponent('MemberSidebar', () => import('../components/MemberSidebar'), lazyLoadingService.priorities.HIGH)
lazyLoadingService.registerComponent('ChannelSidebar', () => import('../components/ChannelSidebar'), lazyLoadingService.priorities.HIGH)
lazyLoadingService.registerComponent('ActivitiesPanel', () => import('../components/ActivitiesPanel'), lazyLoadingService.priorities.MEDIUM)
lazyLoadingService.registerComponent('VoiceChannel', () => import('../components/VoiceChannel'), lazyLoadingService.priorities.MEDIUM)
lazyLoadingService.registerComponent('SettingsModal', () => import('../components/modals/SettingsModal'), lazyLoadingService.priorities.LOW)
lazyLoadingService.registerComponent('ProfileModal', () => import('../components/modals/ProfileModal'), lazyLoadingService.priorities.LOW)
lazyLoadingService.registerComponent('AdminPanel', () => import('../components/AdminPanel'), lazyLoadingService.priorities.LOW)
lazyLoadingService.registerComponent('FriendsPage', () => import('../components/FriendsPage'), lazyLoadingService.priorities.MEDIUM)
lazyLoadingService.registerComponent('Discovery', () => import('../components/Discovery'), lazyLoadingService.priorities.MEDIUM)
lazyLoadingService.registerComponent('DMList', () => import('../components/DMList'), lazyLoadingService.priorities.MEDIUM)
lazyLoadingService.registerComponent('DMChat', () => import('../components/DMChat'), lazyLoadingService.priorities.MEDIUM)
lazyLoadingService.registerComponent('IncomingCallModal', () => import('../components/IncomingCallModal'), lazyLoadingService.priorities.LOW)
lazyLoadingService.registerComponent('VoiceChannelPreview', () => import('../components/VoiceChannelPreview'), lazyLoadingService.priorities.MEDIUM)

// Route-level chunk warmup targets
lazyLoadingService.registerRouteChunk('route:chat', () => import('../pages/ChatPage'))
lazyLoadingService.registerRouteChunk('route:login', () => import('../pages/LoginPage'))
lazyLoadingService.registerRouteChunk('route:invite', () => import('../pages/InvitePage'))
lazyLoadingService.registerRouteChunk('route:reset-password', () => import('../pages/ResetPasswordPage'))
lazyLoadingService.registerRouteChunk('route:callback', () => import('../pages/CallbackPage'))
lazyLoadingService.registerRouteChunk('route:settings-modal', () => import('../components/modals/SettingsModal'))
lazyLoadingService.registerRouteChunk('route:admin-panel', () => import('../components/AdminPanel'))

export { lazyLoadingService }
export default lazyLoadingService
