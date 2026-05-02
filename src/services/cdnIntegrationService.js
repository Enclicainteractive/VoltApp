// CDN Integration Service for VoltChat
// Optimizes static asset delivery through CDN integration

class CdnIntegrationService {
  constructor() {
    this.cdnEndpoints = {
      primary: process.env.REACT_APP_CDN_PRIMARY || 'https://cdn.voltagechat.app',
      fallback: process.env.REACT_APP_CDN_FALLBACK || 'https://backup-cdn.voltagechat.app',
      images: process.env.REACT_APP_CDN_IMAGES || 'https://images.voltagechat.app',
      assets: process.env.REACT_APP_CDN_ASSETS || 'https://assets.voltagechat.app'
    }
    
    this.config = {
      enablePreloading: true,
      enableBrotliCompression: true,
      enableWebPConversion: true,
      cacheControlMaxAge: 31536000, // 1 year
      imageCacheMaxAge: 86400, // 1 day
      retryAttempts: 3,
      retryDelay: 1000,
      healthCheckInterval: 30000, // 30 seconds
      fallbackTimeout: 5000
    }
    
    // CDN health monitoring
    this.endpointHealth = new Map()
    this.loadBalancer = new CdnLoadBalancer(this.cdnEndpoints)
    
    // Performance tracking
    this.metrics = {
      totalRequests: 0,
      cacheHits: 0,
      cdnHits: 0,
      fallbackUsed: 0,
      averageResponseTime: 0,
      bytesServed: 0,
      compressionSavings: 0
    }
    
    // Asset cache
    this.assetCache = new Map()
    this.preloadQueue = []
    
    this.initialize()
  }

  async initialize() {
    // Initialize CDN health monitoring
    this.startHealthMonitoring()
    
    // Setup intelligent preloading
    this.setupIntelligentPreloading()
    
    // Setup compression detection
    this.detectCompressionSupport()
    
    // Setup image format detection
    this.detectImageFormatSupport()
    
    console.log('[CDN] CDN integration service initialized')
  }

  // Asset URL generation with CDN integration
  getCdnUrl(assetPath, options = {}) {
    const {
      type = 'assets',
      version = 'v1',
      format = null,
      quality = 85,
      width = null,
      height = null,
      optimization = true
    } = options
    
    // Get optimal CDN endpoint
    const endpoint = this.getOptimalEndpoint(type)
    
    // Build optimized URL
    let url = `${endpoint}/${version}${assetPath}`
    
    // Add optimization parameters
    if (optimization && this.shouldOptimize(assetPath)) {
      const params = new URLSearchParams()
      
      // Image optimizations
      if (this.isImage(assetPath)) {
        if (format) params.set('format', format)
        if (quality !== 85) params.set('quality', quality)
        if (width) params.set('w', width)
        if (height) params.set('h', height)
        
        // Auto format selection
        if (this.supportsWebP && !format) {
          params.set('format', 'webp')
        }
        
        // Responsive sizing
        if (!width && !height) {
          const optimalSize = this.calculateOptimalImageSize()
          if (optimalSize.width) params.set('w', optimalSize.width)
          if (optimalSize.height) params.set('h', optimalSize.height)
        }
      }
      
      // Compression
      if (this.config.enableBrotliCompression && this.supportsBrotli) {
        params.set('compression', 'br')
      }
      
      // Cache busting for development
      if (process.env.NODE_ENV === 'development') {
        params.set('t', Date.now())
      }
      
      if (params.toString()) {
        url += `?${params.toString()}`
      }
    }
    
    return url
  }

  getOptimalEndpoint(type) {
    const typeEndpoint = this.cdnEndpoints[type] || this.cdnEndpoints.primary
    
    // Use load balancer to get best endpoint
    return this.loadBalancer.getOptimalEndpoint(typeEndpoint)
  }

  // Intelligent asset preloading
  async preloadAssets(assetPaths, priority = 'low') {
    const preloadPromises = assetPaths.map(assetPath => {
      return this.preloadAsset(assetPath, { priority })
    })
    
    return Promise.allSettled(preloadPromises)
  }

  async preloadAsset(assetPath, options = {}) {
    const { priority = 'low', type = 'assets' } = options
    
    // Check cache first
    const cacheKey = this.generateCacheKey(assetPath, options)
    if (this.assetCache.has(cacheKey)) {
      this.metrics.cacheHits++
      return this.assetCache.get(cacheKey)
    }
    
    const url = this.getCdnUrl(assetPath, { type, ...options })
    
    try {
      const response = await this.fetchWithRetry(url, {
        priority,
        cache: 'force-cache'
      })
      
      if (response.ok) {
        const asset = await this.processAssetResponse(response, assetPath)
        this.assetCache.set(cacheKey, asset)
        this.metrics.cdnHits++
        
        return asset
      } else {
        throw new Error(`HTTP ${response.status}`)
      }
      
    } catch (error) {
      console.warn(`[CDN] Failed to preload asset: ${assetPath}`, error)
      
      // Try fallback endpoint
      return this.preloadAssetFromFallback(assetPath, options)
    }
  }

  async preloadAssetFromFallback(assetPath, options) {
    const fallbackUrl = `${this.cdnEndpoints.fallback}${assetPath}`
    
    try {
      const response = await this.fetchWithRetry(fallbackUrl, {
        timeout: this.config.fallbackTimeout
      })
      
      if (response.ok) {
        const asset = await this.processAssetResponse(response, assetPath)
        this.metrics.fallbackUsed++
        return asset
      }
      
    } catch (error) {
      console.error(`[CDN] Fallback also failed for: ${assetPath}`, error)
      throw error
    }
  }

  async processAssetResponse(response, assetPath) {
    const startTime = performance.now()
    
    let data
    if (this.isImage(assetPath)) {
      data = await response.blob()
    } else if (this.isTextAsset(assetPath)) {
      data = await response.text()
    } else {
      data = await response.arrayBuffer()
    }
    
    const loadTime = performance.now() - startTime
    this.updateMetrics(data, loadTime)
    
    return {
      data,
      url: response.url,
      size: data.size || data.byteLength,
      type: response.headers.get('content-type'),
      loadTime,
      cached: response.headers.get('x-cache') === 'HIT'
    }
  }

  async fetchWithRetry(url, options = {}) {
    const { retryAttempts = this.config.retryAttempts, retryDelay = this.config.retryDelay } = options
    
    for (let attempt = 1; attempt <= retryAttempts; attempt++) {
      try {
        const controller = new AbortController()
        const timeout = options.timeout || 10000
        
        const timeoutId = setTimeout(() => controller.abort(), timeout)
        
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
          headers: {
            'Accept-Encoding': this.getAcceptEncoding(),
            ...options.headers
          }
        })
        
        clearTimeout(timeoutId)
        
        if (response.ok) {
          return response
        } else if (response.status >= 500 && attempt < retryAttempts) {
          // Server error - retry
          await this.delay(retryDelay * Math.pow(2, attempt - 1))
          continue
        } else {
          throw new Error(`HTTP ${response.status}`)
        }
        
      } catch (error) {
        if (attempt === retryAttempts) {
          throw error
        }
        
        await this.delay(retryDelay * Math.pow(2, attempt - 1))
      }
    }
  }

  // Image optimization
  optimizeImageUrl(imagePath, options = {}) {
    const {
      width = null,
      height = null,
      quality = 85,
      format = 'auto',
      fit = 'cover',
      dpr = window.devicePixelRatio || 1
    } = options
    
    // Calculate responsive dimensions
    let finalWidth = width
    let finalHeight = height
    
    if (width && dpr > 1) {
      finalWidth = Math.round(width * dpr)
    }
    if (height && dpr > 1) {
      finalHeight = Math.round(height * dpr)
    }
    
    return this.getCdnUrl(imagePath, {
      type: 'images',
      width: finalWidth,
      height: finalHeight,
      quality,
      format: format === 'auto' ? this.getOptimalImageFormat() : format,
      fit
    })
  }

  getOptimalImageFormat() {
    if (this.supportsAVIF) return 'avif'
    if (this.supportsWebP) return 'webp'
    return 'jpeg'
  }

  // Generate responsive image srcset
  generateSrcSet(imagePath, widths, options = {}) {
    return widths.map(width => {
      const url = this.optimizeImageUrl(imagePath, { ...options, width })
      return `${url} ${width}w`
    }).join(', ')
  }

  // Setup intelligent preloading based on user behavior
  setupIntelligentPreloading() {
    // Preload assets on hover
    document.addEventListener('mouseover', (event) => {
      const link = event.target.closest('a[href], img[data-src]')
      if (link) {
        this.handleHoverPreload(link)
      }
    })
    
    // Preload on intersection (viewport entry)
    this.setupIntersectionPreloading()
    
    // Preload based on navigation patterns
    this.setupPredictivePreloading()
  }

  handleHoverPreload(element) {
    if (element.tagName === 'IMG' && element.dataset.src) {
      this.preloadAsset(element.dataset.src, { type: 'images', priority: 'medium' })
    } else if (element.href) {
      // Preload page assets
      this.preloadPageAssets(element.href)
    }
  }

  setupIntersectionPreloading() {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const element = entry.target
          if (element.dataset.preload) {
            this.preloadAsset(element.dataset.preload, { priority: 'high' })
            observer.unobserve(element)
          }
        }
      })
    }, { rootMargin: '100px' })
    
    // Observe elements with preload data
    document.querySelectorAll('[data-preload]').forEach(el => {
      observer.observe(el)
    })
  }

  setupPredictivePreloading() {
    // Analyze navigation patterns and preload likely next pages
    const navigationHistory = this.getNavigationHistory()
    
    if (navigationHistory.length > 5) {
      const predictions = this.predictNextNavigation(navigationHistory)
      
      predictions.forEach(prediction => {
        if (prediction.confidence > 0.7) {
          this.preloadPageAssets(prediction.url)
        }
      })
    }
  }

  // CDN health monitoring
  startHealthMonitoring() {
    setInterval(() => {
      this.checkEndpointHealth()
    }, this.config.healthCheckInterval)
    
    // Initial health check
    this.checkEndpointHealth()
  }

  async checkEndpointHealth() {
    const healthPromises = Object.entries(this.cdnEndpoints).map(async ([name, endpoint]) => {
      try {
        const startTime = performance.now()
        const response = await fetch(`${endpoint}/health`, {
          method: 'HEAD',
          cache: 'no-cache'
        })
        const responseTime = performance.now() - startTime
        
        this.endpointHealth.set(name, {
          healthy: response.ok,
          responseTime,
          lastCheck: Date.now(),
          status: response.status
        })
        
      } catch (error) {
        this.endpointHealth.set(name, {
          healthy: false,
          responseTime: Infinity,
          lastCheck: Date.now(),
          error: error.message
        })
      }
    })
    
    await Promise.allSettled(healthPromises)
  }

  // Utility methods
  isImage(path) {
    return /\.(jpg|jpeg|png|gif|webp|svg|avif)$/i.test(path)
  }

  isTextAsset(path) {
    return /\.(css|js|json|xml|txt)$/i.test(path)
  }

  shouldOptimize(path) {
    return this.isImage(path) || this.isTextAsset(path)
  }

  calculateOptimalImageSize() {
    const containerWidth = window.innerWidth
    const devicePixelRatio = window.devicePixelRatio || 1
    
    return {
      width: Math.min(containerWidth * devicePixelRatio, 2048),
      height: null
    }
  }

  detectCompressionSupport() {
    this.supportsBrotli = 'CompressionStream' in window
    this.supportsGzip = true // Assume all browsers support gzip
  }

  detectImageFormatSupport() {
    // WebP detection
    const webpTestImage = 'data:image/webp;base64,UklGRjoAAABXRUJQVlA4IC4AAACyAgCdASoCAAIALmk0mk0iIiIiIgBoSygABc6WWgAA/veff/0PP8bA//LwYAAA'
    const webpImg = new Image()
    webpImg.onload = () => { this.supportsWebP = true }
    webpImg.onerror = () => { this.supportsWebP = false }
    webpImg.src = webpTestImage
    
    // AVIF detection
    const avifTestImage = 'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAABUAAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAIAAAACAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQ0MAAAAABNjb2xybmNseAACAAIAAYAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAACVtZGF0EgAKCBgABogQEAwgMgkQAAAAB8dSLfI='
    const avifImg = new Image()
    avifImg.onload = () => { this.supportsAVIF = true }
    avifImg.onerror = () => { this.supportsAVIF = false }
    avifImg.src = avifTestImage
  }

  getAcceptEncoding() {
    const encodings = []
    
    if (this.supportsBrotli) encodings.push('br')
    if (this.supportsGzip) encodings.push('gzip')
    encodings.push('deflate')
    
    return encodings.join(', ')
  }

  generateCacheKey(assetPath, options) {
    return `${assetPath}_${JSON.stringify(options)}`
  }

  updateMetrics(data, loadTime) {
    this.metrics.totalRequests++
    this.metrics.bytesServed += data.size || data.byteLength
    
    // Update rolling average response time
    const currentAvg = this.metrics.averageResponseTime
    this.metrics.averageResponseTime = 
      ((currentAvg * (this.metrics.totalRequests - 1)) + loadTime) / this.metrics.totalRequests
  }

  getNavigationHistory() {
    const history = JSON.parse(localStorage.getItem('navigation_history') || '[]')
    return history.slice(-20) // Keep last 20 entries
  }

  predictNextNavigation(history) {
    // Simple prediction based on frequency
    const pathCounts = {}
    history.forEach(entry => {
      pathCounts[entry.path] = (pathCounts[entry.path] || 0) + 1
    })
    
    return Object.entries(pathCounts)
      .map(([path, count]) => ({
        url: path,
        confidence: count / history.length
      }))
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3)
  }

  preloadPageAssets(url) {
    // Extract likely assets from URL
    const commonAssets = [
      '/static/js/main.js',
      '/static/css/main.css',
      '/static/media/logo.svg'
    ]
    
    commonAssets.forEach(asset => {
      this.preloadAsset(asset, { priority: 'low' })
    })
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  // Public API
  getMetrics() {
    return {
      ...this.metrics,
      endpointHealth: Object.fromEntries(this.endpointHealth),
      cacheSize: this.assetCache.size
    }
  }

  clearCache() {
    this.assetCache.clear()
  }

  // Get CDN statistics
  getCdnStats() {
    const hitRate = this.metrics.cdnHits / Math.max(this.metrics.totalRequests, 1)
    const fallbackRate = this.metrics.fallbackUsed / Math.max(this.metrics.totalRequests, 1)
    
    return {
      hitRate,
      fallbackRate,
      averageResponseTime: this.metrics.averageResponseTime,
      totalBytesServed: this.metrics.bytesServed
    }
  }
}

// Load balancer for CDN endpoints
class CdnLoadBalancer {
  constructor(endpoints) {
    this.endpoints = endpoints
    this.endpointStats = new Map()
  }

  getOptimalEndpoint(defaultEndpoint) {
    // Simple round-robin with health checking
    // In production, this would use more sophisticated algorithms
    return defaultEndpoint
  }

  recordResponse(endpoint, responseTime, success) {
    const stats = this.endpointStats.get(endpoint) || {
      totalRequests: 0,
      successCount: 0,
      averageResponseTime: 0
    }
    
    stats.totalRequests++
    if (success) stats.successCount++
    
    stats.averageResponseTime = 
      ((stats.averageResponseTime * (stats.totalRequests - 1)) + responseTime) / stats.totalRequests
    
    this.endpointStats.set(endpoint, stats)
  }
}

export default CdnIntegrationService