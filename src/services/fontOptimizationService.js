// Font Optimization Service for VoltChat
// Handles intelligent font loading with preload hints and optimization

class FontOptimizationService {
  constructor() {
    this.loadedFonts = new Map()
    this.fontLoadPromises = new Map()
    this.fontMetrics = new Map()
    this.preloadQueue = []
    
    // Configuration
    this.config = {
      enablePreloading: true,
      enableFontDisplay: true,
      fontDisplayStrategy: 'swap', // auto, block, swap, fallback, optional
      preloadCriticalFonts: true,
      enableFontSubsetting: true,
      enableVariableFonts: true,
      enableCompressionOptimization: true,
      maxPreloadFonts: 4,
      fontLoadTimeout: 3000
    }
    
    // Critical fonts that should be preloaded
    this.criticalFonts = [
      {
        family: 'Inter',
        weights: [400, 500, 600],
        formats: ['woff2', 'woff'],
        unicode: 'latin',
        display: 'swap',
        preload: true
      },
      {
        family: 'Inter Variable',
        weights: ['100 900'],
        formats: ['woff2'],
        unicode: 'latin',
        display: 'swap',
        preload: true,
        variable: true
      }
    ]
    
    // Font fallbacks and system font stacks
    this.fontStacks = {
      primary: [
        'Inter',
        '-apple-system',
        'BlinkMacSystemFont',
        'Segoe UI',
        'Roboto',
        'Helvetica Neue',
        'Arial',
        'sans-serif'
      ],
      monospace: [
        'SF Mono',
        'Monaco',
        'Inconsolata',
        'Roboto Mono',
        'Consolas',
        'Courier New',
        'monospace'
      ],
      emoji: [
        'Apple Color Emoji',
        'Segoe UI Emoji',
        'Segoe UI Symbol',
        'Noto Color Emoji'
      ]
    }
    
    // Performance tracking
    this.metrics = {
      fontsPreloaded: 0,
      fontsLoaded: 0,
      fontsFailed: 0,
      totalLoadTime: 0,
      averageLoadTime: 0,
      cacheHits: 0,
      bytesTransferred: 0
    }
    
    // Font loading observer
    this.fontObserver = null
    
    this.initialize()
  }

  async initialize() {
    // Setup font loading observer
    this.setupFontObserver()
    
    // Preload critical fonts
    await this.preloadCriticalFonts()
    
    // Setup font optimization strategies
    this.setupFontOptimization()
    
    // Setup progressive font enhancement
    this.setupProgressiveEnhancement()
    
    // Monitor font loading performance
    this.setupPerformanceMonitoring()
    
    console.log('[FontOpt] Font optimization service initialized')
  }

  setupFontObserver() {
    if ('fonts' in document) {
      this.fontObserver = document.fonts
      
      document.fonts.addEventListener('loadingdone', (event) => {
        this.handleFontLoadingDone(event)
      })
      
      document.fonts.addEventListener('loadingerror', (event) => {
        this.handleFontLoadingError(event)
      })
    }
  }

  async preloadCriticalFonts() {
    if (!this.config.preloadCriticalFonts) return
    
    const preloadPromises = []
    let preloadCount = 0
    
    for (const fontConfig of this.criticalFonts) {
      if (preloadCount >= this.config.maxPreloadFonts) break
      
      for (const weight of fontConfig.weights) {
        if (preloadCount >= this.config.maxPreloadFonts) break
        
        const promise = this.preloadFont(fontConfig, weight)
        preloadPromises.push(promise)
        preloadCount++
      }
    }
    
    try {
      await Promise.allSettled(preloadPromises)
      console.log(`[FontOpt] Preloaded ${preloadCount} critical fonts`)
    } catch (error) {
      console.warn('[FontOpt] Some critical fonts failed to preload:', error)
    }
  }

  async preloadFont(fontConfig, weight) {
    const startTime = performance.now()
    
    try {
      // Generate font URLs
      const fontUrls = this.generateFontUrls(fontConfig, weight)
      
      // Create preload links
      const preloadPromises = fontUrls.map(url => 
        this.createPreloadLink(url, fontConfig)
      )
      
      // Load font face
      const fontLoadPromise = this.loadFontFace(fontConfig, weight, fontUrls[0])
      
      await Promise.all([...preloadPromises, fontLoadPromise])
      
      const loadTime = performance.now() - startTime
      this.updateMetrics(fontConfig.family, weight, loadTime, true)
      
      this.metrics.fontsPreloaded++
      
    } catch (error) {
      console.warn(`[FontOpt] Failed to preload font: ${fontConfig.family} ${weight}`, error)
      this.metrics.fontsFailed++
    }
  }

  generateFontUrls(fontConfig, weight) {
    const urls = []
    const baseUrl = '/fonts'
    
    for (const format of fontConfig.formats) {
      let filename
      
      if (fontConfig.variable) {
        filename = `${fontConfig.family.replace(' ', '')}-Variable.${format}`
      } else {
        const weightSuffix = weight === 400 ? 'Regular' : 
                           weight === 500 ? 'Medium' :
                           weight === 600 ? 'SemiBold' :
                           weight === 700 ? 'Bold' : weight
        filename = `${fontConfig.family.replace(' ', '')}-${weightSuffix}.${format}`
      }
      
      // Add font optimization parameters
      const params = new URLSearchParams()
      if (fontConfig.unicode) params.set('unicode', fontConfig.unicode)
      if (this.config.enableFontSubsetting) params.set('subset', 'true')
      
      const url = `${baseUrl}/${filename}${params.toString() ? '?' + params.toString() : ''}`
      urls.push(url)
    }
    
    return urls
  }

  async createPreloadLink(url, fontConfig) {
    return new Promise((resolve, reject) => {
      // Check if already preloaded
      const existing = document.querySelector(`link[href="${url}"]`)
      if (existing) {
        resolve()
        return
      }
      
      const link = document.createElement('link')
      link.rel = 'preload'
      link.as = 'font'
      link.type = this.getFontMimeType(url)
      link.href = url
      link.crossOrigin = 'anonymous'
      
      if (fontConfig.display) {
        link.dataset.fontDisplay = fontConfig.display
      }
      
      link.onload = () => {
        this.metrics.cacheHits++
        resolve()
      }
      
      link.onerror = () => {
        reject(new Error(`Failed to preload font: ${url}`))
      }
      
      // Set timeout for preload
      setTimeout(() => {
        reject(new Error(`Font preload timeout: ${url}`))
      }, this.config.fontLoadTimeout)
      
      document.head.appendChild(link)
    })
  }

  async loadFontFace(fontConfig, weight, url) {
    const fontKey = `${fontConfig.family}-${weight}`
    
    // Check if already loaded
    if (this.loadedFonts.has(fontKey)) {
      return this.loadedFonts.get(fontKey)
    }
    
    // Check if loading in progress
    if (this.fontLoadPromises.has(fontKey)) {
      return this.fontLoadPromises.get(fontKey)
    }
    
    const loadPromise = this._loadFontFace(fontConfig, weight, url)
    this.fontLoadPromises.set(fontKey, loadPromise)
    
    try {
      const fontFace = await loadPromise
      this.loadedFonts.set(fontKey, fontFace)
      this.fontLoadPromises.delete(fontKey)
      return fontFace
    } catch (error) {
      this.fontLoadPromises.delete(fontKey)
      throw error
    }
  }

  async _loadFontFace(fontConfig, weight, url) {
    const fontFace = new FontFace(
      fontConfig.family,
      `url(${url})`,
      {
        weight: fontConfig.variable ? fontConfig.weights[0] : weight.toString(),
        style: 'normal',
        display: fontConfig.display || this.config.fontDisplayStrategy,
        unicodeRange: this.getUnicodeRange(fontConfig.unicode)
      }
    )
    
    // Load the font
    await fontFace.load()
    
    // Add to document fonts
    document.fonts.add(fontFace)
    
    return fontFace
  }

  setupFontOptimization() {
    // Setup font-display CSS optimization
    this.injectFontDisplayCSS()
    
    // Setup variable font optimization
    this.optimizeVariableFonts()
    
    // Setup font subsetting
    this.setupFontSubsetting()
    
    // Setup compression optimization
    this.setupCompressionOptimization()
  }

  injectFontDisplayCSS() {
    if (!this.config.enableFontDisplay) return
    
    const css = `
      @font-face {
        font-family: 'Inter';
        src: url('/fonts/Inter-Regular.woff2') format('woff2'),
             url('/fonts/Inter-Regular.woff') format('woff');
        font-weight: 400;
        font-style: normal;
        font-display: ${this.config.fontDisplayStrategy};
        unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
      }
      
      @font-face {
        font-family: 'Inter';
        src: url('/fonts/Inter-Medium.woff2') format('woff2'),
             url('/fonts/Inter-Medium.woff') format('woff');
        font-weight: 500;
        font-style: normal;
        font-display: ${this.config.fontDisplayStrategy};
        unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
      }
      
      @font-face {
        font-family: 'Inter';
        src: url('/fonts/Inter-SemiBold.woff2') format('woff2'),
             url('/fonts/Inter-SemiBold.woff') format('woff');
        font-weight: 600;
        font-style: normal;
        font-display: ${this.config.fontDisplayStrategy};
        unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
      }
      
      /* Variable font fallback */
      @supports (font-variation-settings: normal) {
        @font-face {
          font-family: 'Inter Variable';
          src: url('/fonts/Inter-Variable.woff2') format('woff2-variations');
          font-weight: 100 900;
          font-style: normal;
          font-display: ${this.config.fontDisplayStrategy};
          font-named-instance: 'Regular';
        }
      }
      
      /* Font stack definitions */
      .font-primary {
        font-family: ${this.fontStacks.primary.join(', ')};
      }
      
      .font-mono {
        font-family: ${this.fontStacks.monospace.join(', ')};
      }
      
      /* Font loading states */
      .fonts-loading .font-primary {
        font-family: ${this.fontStacks.primary.slice(1).join(', ')};
      }
      
      .fonts-loaded .font-primary {
        font-family: ${this.fontStacks.primary.join(', ')};
      }
      
      .fonts-failed .font-primary {
        font-family: ${this.fontStacks.primary.slice(1).join(', ')};
      }
    `
    
    this.injectCSS(css, 'font-optimization')
  }

  optimizeVariableFonts() {
    if (!this.config.enableVariableFonts) return
    
    // Check for variable font support
    const supportsVariableFonts = CSS.supports('font-variation-settings', 'normal')
    
    if (supportsVariableFonts) {
      console.log('[FontOpt] Variable fonts supported, enabling optimizations')
      this.enableVariableFontOptimizations()
    } else {
      console.log('[FontOpt] Variable fonts not supported, using static fonts')
      this.fallbackToStaticFonts()
    }
  }

  enableVariableFontOptimizations() {
    const variableFontCSS = `
      /* Variable font optimizations */
      @supports (font-variation-settings: normal) {
        .font-primary {
          font-family: 'Inter Variable', ${this.fontStacks.primary.slice(1).join(', ')};
          font-variation-settings: 'wght' 400;
        }
        
        .font-medium {
          font-variation-settings: 'wght' 500;
        }
        
        .font-semibold {
          font-variation-settings: 'wght' 600;
        }
        
        .font-bold {
          font-variation-settings: 'wght' 700;
        }
      }
    `
    
    this.injectCSS(variableFontCSS, 'variable-fonts')
  }

  fallbackToStaticFonts() {
    // Ensure static font weights are available
    const staticFonts = [400, 500, 600].filter(weight => 
      !this.loadedFonts.has(`Inter-${weight}`)
    )
    
    staticFonts.forEach(weight => {
      const fontConfig = this.criticalFonts.find(f => f.family === 'Inter' && !f.variable)
      if (fontConfig) {
        this.preloadFont(fontConfig, weight)
      }
    })
  }

  setupFontSubsetting() {
    if (!this.config.enableFontSubsetting) return
    
    // Define character subsets for optimization
    const subsets = {
      latin: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
      latinExt: 'U+0100-024F, U+0259, U+1E00-1EFF, U+2020, U+20A0-20AB, U+20AD-20CF, U+2113, U+2C60-2C7F, U+A720-A7FF',
      symbols: 'U+2190-21FF, U+2600-26FF, U+2700-27BF'
    }
    
    // Analyze page content to determine needed subsets
    this.analyzeContentForSubsets(subsets)
  }

  analyzeContentForSubsets(subsets) {
    // Analyze current page content to determine which character subsets are needed
    const textContent = document.body.textContent || ''
    const neededSubsets = []
    
    // Check for extended Latin characters
    if (/[À-ÿ]/.test(textContent)) {
      neededSubsets.push('latinExt')
    }
    
    // Check for symbols
    if (/[→←↑↓⭐❤️]/.test(textContent)) {
      neededSubsets.push('symbols')
    }
    
    // Always include basic Latin
    neededSubsets.unshift('latin')
    
    console.log('[FontOpt] Detected needed font subsets:', neededSubsets)
    return neededSubsets
  }

  setupCompressionOptimization() {
    if (!this.config.enableCompressionOptimization) return
    
    // Prefer WOFF2 over WOFF
    // WOFF2 provides ~30% better compression than WOFF
    this.optimizeCompressionFormats()
  }

  optimizeCompressionFormats() {
    // Test WOFF2 support
    const supportsWoff2 = this.testFontFormatSupport('woff2')
    const supportsWoff = this.testFontFormatSupport('woff')
    
    console.log('[FontOpt] Font format support:', {
      woff2: supportsWoff2,
      woff: supportsWoff
    })
    
    // Update font configurations based on support
    this.criticalFonts.forEach(font => {
      if (supportsWoff2) {
        font.formats = ['woff2', ...font.formats.filter(f => f !== 'woff2')]
      } else if (supportsWoff) {
        font.formats = ['woff', ...font.formats.filter(f => f !== 'woff')]
      }
    })
  }

  testFontFormatSupport(format) {
    // Test font format support
    const testFont = new FontFace('test', `url(data:font/${format};base64,)`)
    
    try {
      return testFont.status !== 'error'
    } catch {
      return false
    }
  }

  setupProgressiveEnhancement() {
    // Add font loading classes to body
    document.body.classList.add('fonts-loading')
    
    // Setup font loading completion handler
    if (document.fonts) {
      document.fonts.ready.then(() => {
        document.body.classList.remove('fonts-loading')
        document.body.classList.add('fonts-loaded')
        this.handleFontsReady()
      })
    } else {
      // Fallback for browsers without Font Loading API
      setTimeout(() => {
        document.body.classList.remove('fonts-loading')
        document.body.classList.add('fonts-loaded')
      }, 3000)
    }
  }

  setupPerformanceMonitoring() {
    // Monitor Cumulative Layout Shift (CLS)
    if ('PerformanceObserver' in window) {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.hadRecentInput) continue
          
          this.analyzeFontRelatedLayoutShift(entry)
        }
      })
      
      try {
        observer.observe({ entryTypes: ['layout-shift'] })
      } catch (error) {
        console.warn('[FontOpt] Layout shift monitoring not supported')
      }
    }
  }

  analyzeFontRelatedLayoutShift(entry) {
    // Check if layout shift is likely font-related
    if (entry.value > 0.1) { // Significant layout shift
      console.warn('[FontOpt] Significant layout shift detected, possibly font-related:', {
        value: entry.value,
        time: entry.startTime
      })
      
      // Suggest font optimization improvements
      this.suggestFontOptimizations()
    }
  }

  suggestFontOptimizations() {
    const suggestions = []
    
    if (this.config.fontDisplayStrategy === 'auto') {
      suggestions.push('Consider using font-display: swap for better perceived performance')
    }
    
    if (!this.config.enablePreloading) {
      suggestions.push('Enable font preloading for critical fonts')
    }
    
    if (suggestions.length > 0) {
      console.log('[FontOpt] Optimization suggestions:', suggestions)
    }
  }

  handleFontLoadingDone(event) {
    event.fontfaces.forEach(fontFace => {
      const key = `${fontFace.family}-${fontFace.weight}`
      this.loadedFonts.set(key, fontFace)
      this.metrics.fontsLoaded++
      
      console.log(`[FontOpt] Font loaded: ${fontFace.family} ${fontFace.weight}`)
    })
  }

  handleFontLoadingError(event) {
    event.fontfaces.forEach(fontFace => {
      console.error(`[FontOpt] Font failed to load: ${fontFace.family} ${fontFace.weight}`)
      this.metrics.fontsFailed++
    })
    
    document.body.classList.add('fonts-failed')
  }

  handleFontsReady() {
    console.log('[FontOpt] All fonts ready')
    
    // Calculate final metrics
    const totalLoadTime = this.metrics.totalLoadTime
    const fontsLoaded = this.metrics.fontsLoaded
    this.metrics.averageLoadTime = fontsLoaded > 0 ? totalLoadTime / fontsLoaded : 0
  }

  // Utility methods
  getFontMimeType(url) {
    if (url.includes('.woff2')) return 'font/woff2'
    if (url.includes('.woff')) return 'font/woff'
    if (url.includes('.ttf')) return 'font/truetype'
    if (url.includes('.otf')) return 'font/opentype'
    return 'font/woff2'
  }

  getUnicodeRange(subset) {
    const ranges = {
      latin: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
      latinExt: 'U+0100-024F, U+0259, U+1E00-1EFF, U+2020, U+20A0-20AB, U+20AD-20CF, U+2113, U+2C60-2C7F, U+A720-A7FF',
      cyrillic: 'U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116',
      greek: 'U+0370-03FF',
      symbols: 'U+2190-21FF, U+2600-26FF, U+2700-27BF'
    }
    
    return ranges[subset] || ranges.latin
  }

  injectCSS(css, id) {
    // Remove existing
    const existing = document.getElementById(id)
    if (existing) {
      existing.remove()
    }
    
    // Inject new CSS
    const style = document.createElement('style')
    style.id = id
    style.textContent = css
    document.head.appendChild(style)
  }

  updateMetrics(family, weight, loadTime, success) {
    this.metrics.totalLoadTime += loadTime
    
    if (success) {
      this.metrics.fontsLoaded++
    } else {
      this.metrics.fontsFailed++
    }
    
    // Store detailed metrics
    const key = `${family}-${weight}`
    this.fontMetrics.set(key, {
      family,
      weight,
      loadTime,
      success,
      timestamp: Date.now()
    })
  }

  // Public API
  async loadFont(family, weight = 400, options = {}) {
    const fontConfig = this.criticalFonts.find(f => f.family === family) || {
      family,
      weights: [weight],
      formats: ['woff2', 'woff'],
      display: 'swap'
    }
    
    return this.loadFontFace(fontConfig, weight)
  }

  isFontLoaded(family, weight = 400) {
    const key = `${family}-${weight}`
    return this.loadedFonts.has(key)
  }

  getFontLoadingStatus() {
    return {
      loaded: this.loadedFonts.size,
      failed: this.metrics.fontsFailed,
      preloaded: this.metrics.fontsPreloaded,
      total: this.loadedFonts.size + this.metrics.fontsFailed
    }
  }

  getMetrics() {
    return {
      ...this.metrics,
      loadedFonts: this.loadedFonts.size,
      fontLoadingStatus: this.getFontLoadingStatus()
    }
  }

  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig }
    
    // Re-initialize if needed
    if (newConfig.fontDisplayStrategy) {
      this.injectFontDisplayCSS()
    }
  }

  // Cleanup
  destroy() {
    // Remove injected styles
    const injectedStyles = document.querySelectorAll('style[id^="font-"]')
    injectedStyles.forEach(style => style.remove())
    
    // Clear caches
    this.loadedFonts.clear()
    this.fontLoadPromises.clear()
    this.fontMetrics.clear()
  }
}

export default FontOptimizationService