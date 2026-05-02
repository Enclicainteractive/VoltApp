// Resource Preloading Service for VoltChat
// Optimizes startup time by preloading critical resources

class ResourcePreloadService {
  constructor() {
    this.preloadedResources = new Map()
    this.preloadQueue = []
    this.isPreloading = false
    this.preloadPriorities = {
      critical: 0,
      important: 1,
      normal: 2,
      low: 3
    }
    
    // Performance tracking
    this.metrics = {
      totalPreloaded: 0,
      failedPreloads: 0,
      averagePreloadTime: 0,
      cacheHits: 0
    }
    
    this.initializePreloading()
  }

  async initializePreloading() {
    // Start preloading critical resources immediately
    await this.preloadCriticalResources()
    
    // Set up intersection observer for progressive preloading
    this.setupProgressivePreloading()
    
    // Preload based on user patterns
    this.setupPredictivePreloading()
  }

  // Preload critical resources needed for app startup
  async preloadCriticalResources() {
    const criticalResources = [
      // Critical fonts
      {
        type: 'font',
        url: '/fonts/Inter-Regular.woff2',
        priority: 'critical',
        crossorigin: 'anonymous'
      },
      {
        type: 'font', 
        url: '/fonts/Inter-Medium.woff2',
        priority: 'critical',
        crossorigin: 'anonymous'
      },
      
      // Critical CSS
      {
        type: 'style',
        url: '/static/css/critical.css',
        priority: 'critical'
      },
      
      // Essential app data
      {
        type: 'fetch',
        url: '/api/user/profile',
        priority: 'critical',
        cache: 'user-profile'
      },
      {
        type: 'fetch',
        url: '/api/servers',
        priority: 'critical',
        cache: 'user-servers'
      },
      
      // Critical images
      {
        type: 'image',
        url: '/images/volt-logo.svg',
        priority: 'critical'
      },
      {
        type: 'image',
        url: '/images/default-avatar.png',
        priority: 'important'
      }
    ]

    await Promise.allSettled(
      criticalResources.map(resource => this.preloadResource(resource))
    )
  }

  // Preload a single resource with appropriate strategy
  async preloadResource(resource) {
    const startTime = performance.now()
    
    try {
      // Check if already preloaded
      if (this.preloadedResources.has(resource.url)) {
        this.metrics.cacheHits++
        return this.preloadedResources.get(resource.url)
      }

      let result
      
      switch (resource.type) {
        case 'font':
          result = await this.preloadFont(resource)
          break
        case 'style':
          result = await this.preloadStylesheet(resource)
          break
        case 'script':
          result = await this.preloadScript(resource)
          break
        case 'image':
          result = await this.preloadImage(resource)
          break
        case 'fetch':
          result = await this.preloadData(resource)
          break
        case 'module':
          result = await this.preloadModule(resource)
          break
        default:
          result = await this.preloadGeneric(resource)
      }

      // Cache the result
      this.preloadedResources.set(resource.url, result)
      
      // Update metrics
      const loadTime = performance.now() - startTime
      this.updateMetrics(loadTime)
      
      console.log(`[Preload] Successfully loaded ${resource.type}: ${resource.url} (${loadTime.toFixed(2)}ms)`)
      
      return result
      
    } catch (error) {
      this.metrics.failedPreloads++
      console.warn(`[Preload] Failed to load ${resource.type}: ${resource.url}`, error)
      throw error
    }
  }

  async preloadFont(resource) {
    return new Promise((resolve, reject) => {
      const link = document.createElement('link')
      link.rel = 'preload'
      link.as = 'font'
      link.type = 'font/woff2'
      link.href = resource.url
      link.crossOrigin = resource.crossorigin || 'anonymous'
      
      link.onload = () => {
        // Force font loading
        const fontFace = new FontFace(
          resource.fontFamily || 'preloaded-font',
          `url(${resource.url})`
        )
        
        fontFace.load().then(() => {
          document.fonts.add(fontFace)
          resolve(fontFace)
        }).catch(reject)
      }
      
      link.onerror = reject
      document.head.appendChild(link)
    })
  }

  async preloadStylesheet(resource) {
    return new Promise((resolve, reject) => {
      const link = document.createElement('link')
      link.rel = 'preload'
      link.as = 'style'
      link.href = resource.url
      
      link.onload = () => {
        // Apply the stylesheet
        link.rel = 'stylesheet'
        resolve(link)
      }
      
      link.onerror = reject
      document.head.appendChild(link)
    })
  }

  async preloadScript(resource) {
    return new Promise((resolve, reject) => {
      const link = document.createElement('link')
      link.rel = 'preload'
      link.as = 'script'
      link.href = resource.url
      
      link.onload = () => resolve(link)
      link.onerror = reject
      document.head.appendChild(link)
    })
  }

  async preloadImage(resource) {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = resource.url
    })
  }

  async preloadData(resource) {
    const response = await fetch(resource.url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Cache-Control': 'no-cache'
      }
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    
    const data = await response.json()
    
    // Cache the data if cache key provided
    if (resource.cache && window.localStorage) {
      try {
        localStorage.setItem(
          `preload-${resource.cache}`,
          JSON.stringify({
            data,
            timestamp: Date.now(),
            url: resource.url
          })
        )
      } catch (e) {
        console.warn('[Preload] Failed to cache data:', e)
      }
    }
    
    return data
  }

  async preloadModule(resource) {
    const module = await import(resource.url)
    return module
  }

  async preloadGeneric(resource) {
    return new Promise((resolve, reject) => {
      const link = document.createElement('link')
      link.rel = 'preload'
      link.href = resource.url
      
      if (resource.as) link.as = resource.as
      if (resource.type) link.type = resource.type
      if (resource.crossorigin) link.crossOrigin = resource.crossorigin
      
      link.onload = () => resolve(link)
      link.onerror = reject
      document.head.appendChild(link)
    })
  }

  // Queue resources for later preloading
  queuePreload(resource) {
    const priority = this.preloadPriorities[resource.priority] || this.preloadPriorities.normal
    
    this.preloadQueue.push({ ...resource, priority })
    this.preloadQueue.sort((a, b) => a.priority - b.priority)
    
    // Start processing queue if not already running
    if (!this.isPreloading) {
      this.processPreloadQueue()
    }
  }

  async processPreloadQueue() {
    if (this.isPreloading || this.preloadQueue.length === 0) {
      return
    }
    
    this.isPreloading = true
    
    while (this.preloadQueue.length > 0) {
      const resource = this.preloadQueue.shift()
      
      try {
        await this.preloadResource(resource)
      } catch (error) {
        console.warn('[Preload] Queue processing failed for:', resource.url, error)
      }
      
      // Small delay to prevent blocking
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    
    this.isPreloading = false
  }

  // Setup progressive preloading based on user interaction
  setupProgressivePreloading() {
    // Preload resources when user hovers over navigation items
    document.addEventListener('mouseover', (event) => {
      const link = event.target.closest('a[data-preload]')
      if (link) {
        const preloadUrl = link.dataset.preload
        this.queuePreload({
          type: 'fetch',
          url: preloadUrl,
          priority: 'normal'
        })
      }
    })
    
    // Preload channel data when user focuses on channel list
    document.addEventListener('focusin', (event) => {
      if (event.target.matches('.channel-item')) {
        const channelId = event.target.dataset.channelId
        if (channelId) {
          this.queuePreload({
            type: 'fetch',
            url: `/api/channels/${channelId}/messages?limit=50`,
            priority: 'important',
            cache: `channel-${channelId}`
          })
        }
      }
    })
  }

  // Setup predictive preloading based on user patterns
  setupPredictivePreloading() {
    // Track user navigation patterns
    let navigationHistory = JSON.parse(localStorage.getItem('nav-history') || '[]')
    
    // Preload likely next destinations
    if (navigationHistory.length > 0) {
      const mostVisited = this.analyzeMostVisited(navigationHistory)
      mostVisited.slice(0, 3).forEach(path => {
        this.queuePreload({
          type: 'fetch',
          url: path,
          priority: 'low'
        })
      })
    }
    
    // Track current navigation
    window.addEventListener('popstate', () => {
      const currentPath = window.location.pathname
      navigationHistory.push({
        path: currentPath,
        timestamp: Date.now()
      })
      
      // Keep only recent history
      navigationHistory = navigationHistory.slice(-100)
      localStorage.setItem('nav-history', JSON.stringify(navigationHistory))
    })
  }

  analyzeMostVisited(history) {
    const pathCounts = {}
    
    history.forEach(entry => {
      pathCounts[entry.path] = (pathCounts[entry.path] || 0) + 1
    })
    
    return Object.entries(pathCounts)
      .sort(([,a], [,b]) => b - a)
      .map(([path]) => path)
  }

  // Get cached preloaded data
  getCachedData(cacheKey) {
    if (!window.localStorage) return null
    
    try {
      const cached = localStorage.getItem(`preload-${cacheKey}`)
      if (!cached) return null
      
      const parsed = JSON.parse(cached)
      
      // Check if cache is still valid (5 minutes)
      if (Date.now() - parsed.timestamp > 5 * 60 * 1000) {
        localStorage.removeItem(`preload-${cacheKey}`)
        return null
      }
      
      return parsed.data
    } catch (e) {
      return null
    }
  }

  // Preload resources for specific routes
  preloadRoute(routeName) {
    const routeResources = {
      chat: [
        { type: 'fetch', url: '/api/channels/recent', priority: 'important' },
        { type: 'image', url: '/images/emoji-sprite.png', priority: 'normal' }
      ],
      settings: [
        { type: 'fetch', url: '/api/user/preferences', priority: 'important' },
        { type: 'module', url: './components/SettingsModal.jsx', priority: 'normal' }
      ],
      voice: [
        { type: 'script', url: '/static/js/webrtc-adapter.js', priority: 'critical' },
        { type: 'fetch', url: '/api/voice/servers', priority: 'important' }
      ]
    }
    
    const resources = routeResources[routeName] || []
    resources.forEach(resource => this.queuePreload(resource))
  }

  // Preload user avatars in viewport
  preloadVisibleAvatars() {
    const avatarImages = document.querySelectorAll('.user-avatar[data-src]:not([data-preloaded])')
    
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target
          const src = img.dataset.src
          
          this.queuePreload({
            type: 'image',
            url: src,
            priority: 'normal'
          }).then(() => {
            img.src = src
            img.dataset.preloaded = 'true'
          })
          
          observer.unobserve(img)
        }
      })
    }, {
      rootMargin: '100px'
    })
    
    avatarImages.forEach(img => observer.observe(img))
  }

  updateMetrics(loadTime) {
    this.metrics.totalPreloaded++
    
    // Update rolling average
    this.metrics.averagePreloadTime = 
      (this.metrics.averagePreloadTime * (this.metrics.totalPreloaded - 1) + loadTime) / 
      this.metrics.totalPreloaded
  }

  // Get performance metrics
  getMetrics() {
    return {
      ...this.metrics,
      cacheSize: this.preloadedResources.size,
      queueLength: this.preloadQueue.length,
      successRate: this.metrics.totalPreloaded / 
        Math.max(1, this.metrics.totalPreloaded + this.metrics.failedPreloads)
    }
  }

  // Clear preload cache
  clearCache() {
    this.preloadedResources.clear()
    
    // Clear localStorage cache
    if (window.localStorage) {
      const keys = Object.keys(localStorage)
      keys.forEach(key => {
        if (key.startsWith('preload-')) {
          localStorage.removeItem(key)
        }
      })
    }
  }

  // Shutdown service
  shutdown() {
    this.preloadQueue = []
    this.clearCache()
  }
}

// Singleton instance
let resourcePreloadService = null

export const getResourcePreloadService = () => {
  if (!resourcePreloadService) {
    resourcePreloadService = new ResourcePreloadService()
  }
  return resourcePreloadService
}

export default ResourcePreloadService