// Critical CSS Service for VoltChat
// Optimizes CSS delivery with critical path rendering

class CriticalCssService {
  constructor() {
    this.criticalRules = new Set()
    this.nonCriticalRules = new Set()
    this.loadedStylesheets = new Map()
    this.pendingStylesheets = new Set()
    this.mediaQueryCache = new Map()
    
    // Performance tracking
    this.metrics = {
      criticalCssSize: 0,
      nonCriticalCssSize: 0,
      renderBlockingTime: 0,
      stylesheetCount: 0,
      unusedRulesRemoved: 0
    }
    
    // Configuration
    this.config = {
      criticalViewportHeight: 600,
      criticalViewportWidth: 1200,
      maxCriticalCssSize: 14000, // 14KB target
      deferNonCriticalTimeout: 100,
      purgeUnusedAfter: 5000
    }
    
    this.initialize()
  }

  async initialize() {
    // Extract critical CSS rules
    await this.extractCriticalCss()
    
    // Setup media query monitoring
    this.setupMediaQueryMonitoring()
    
    // Setup unused CSS detection
    this.setupUnusedCssDetection()
    
    // Defer non-critical CSS loading
    this.deferNonCriticalCss()
    
    console.log('[CriticalCSS] Critical CSS service initialized')
  }

  async extractCriticalCss() {
    const startTime = performance.now()
    
    try {
      // Get all stylesheets
      const stylesheets = Array.from(document.styleSheets)
      
      for (const stylesheet of stylesheets) {
        await this.analyzeStylesheet(stylesheet)
      }
      
      // Generate critical CSS
      await this.generateCriticalCss()
      
      this.metrics.renderBlockingTime = performance.now() - startTime
      
    } catch (error) {
      console.error('[CriticalCSS] Failed to extract critical CSS:', error)
    }
  }

  async analyzeStylesheet(stylesheet) {
    try {
      if (!stylesheet.href || stylesheet.disabled) return
      
      // Skip external stylesheets we can't access
      if (stylesheet.href && !this.isSameOrigin(stylesheet.href)) return
      
      const rules = Array.from(stylesheet.cssRules || [])
      
      for (const rule of rules) {
        await this.analyzeRule(rule)
      }
      
      this.metrics.stylesheetCount++
      
    } catch (error) {
      // CORS or other access issues
      console.warn('[CriticalCSS] Cannot analyze stylesheet:', error)
    }
  }

  async analyzeRule(rule) {
    if (!rule) return
    
    switch (rule.type) {
      case CSSRule.STYLE_RULE:
        await this.analyzeStyleRule(rule)
        break
      case CSSRule.MEDIA_RULE:
        await this.analyzeMediaRule(rule)
        break
      case CSSRule.IMPORT_RULE:
        await this.analyzeImportRule(rule)
        break
      case CSSRule.FONT_FACE_RULE:
        await this.analyzeFontFaceRule(rule)
        break
    }
  }

  async analyzeStyleRule(rule) {
    const selector = rule.selectorText
    const cssText = rule.cssText
    
    // Check if rule affects above-the-fold content
    const isCritical = await this.isRuleCritical(selector)
    
    if (isCritical) {
      this.criticalRules.add(cssText)
    } else {
      this.nonCriticalRules.add(cssText)
    }
  }

  async analyzeMediaRule(rule) {
    const mediaText = rule.media.mediaText
    
    // Check if media query applies to critical viewport
    const appliesInCriticalViewport = this.mediaQueryAppliesInCriticalViewport(mediaText)
    
    const rules = Array.from(rule.cssRules || [])
    
    for (const nestedRule of rules) {
      if (appliesInCriticalViewport) {
        await this.analyzeRule(nestedRule)
      } else {
        if (nestedRule.cssText) {
          this.nonCriticalRules.add(`@media ${mediaText} { ${nestedRule.cssText} }`)
        }
      }
    }
  }

  async analyzeImportRule(rule) {
    // Import rules are typically non-critical
    this.nonCriticalRules.add(rule.cssText)
  }

  async analyzeFontFaceRule(rule) {
    const fontFamily = this.extractFontFamily(rule.cssText)
    
    // Check if font is used in critical elements
    const isUsedInCritical = await this.isFontUsedInCritical(fontFamily)
    
    if (isUsedInCritical) {
      this.criticalRules.add(rule.cssText)
    } else {
      this.nonCriticalRules.add(rule.cssText)
    }
  }

  async isRuleCritical(selector) {
    try {
      // Check if selector matches elements in critical viewport
      const elements = document.querySelectorAll(selector)
      
      for (const element of elements) {
        if (this.isElementInCriticalViewport(element)) {
          return true
        }
      }
      
      // Check for critical selectors patterns
      return this.isCriticalSelector(selector)
      
    } catch (error) {
      // Invalid selector
      return false
    }
  }

  isElementInCriticalViewport(element) {
    const rect = element.getBoundingClientRect()
    
    // Element is visible and within critical viewport
    return (
      rect.top < this.config.criticalViewportHeight &&
      rect.left < this.config.criticalViewportWidth &&
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.width > 0 &&
      rect.height > 0
    )
  }

  isCriticalSelector(selector) {
    const criticalPatterns = [
      /^body/,
      /^html/,
      /^\.app/,
      /^\.header/,
      /^\.nav/,
      /^\.loading/,
      /^\.skeleton/,
      /^\.critical/,
      /^\.above-fold/,
      // VoltChat specific
      /^\.server-sidebar/,
      /^\.channel-sidebar/,
      /^\.chat-area/,
      /^\.message-list/
    ]
    
    return criticalPatterns.some(pattern => pattern.test(selector))
  }

  mediaQueryAppliesInCriticalViewport(mediaText) {
    // Cache media query results
    if (this.mediaQueryCache.has(mediaText)) {
      return this.mediaQueryCache.get(mediaText)
    }
    
    // Simple media query parsing for common cases
    const applies = this.testMediaQuery(mediaText)
    this.mediaQueryCache.set(mediaText, applies)
    
    return applies
  }

  testMediaQuery(mediaText) {
    // Test against critical viewport dimensions
    const testQuery = `(max-width: ${this.config.criticalViewportWidth}px) and (max-height: ${this.config.criticalViewportHeight}px)`
    
    try {
      return window.matchMedia(mediaText).matches || window.matchMedia(testQuery).matches
    } catch {
      // Assume applies if we can't parse
      return true
    }
  }

  extractFontFamily(cssText) {
    const match = cssText.match(/font-family:\s*['"]?([^'";]+)['"]?/)
    return match ? match[1].trim() : null
  }

  async isFontUsedInCritical(fontFamily) {
    if (!fontFamily) return false
    
    // Check computed styles of critical elements
    const criticalElements = document.querySelectorAll(`
      .app, .header, .nav, .loading, .skeleton,
      .server-sidebar, .channel-sidebar, .chat-area
    `)
    
    for (const element of criticalElements) {
      const computedStyle = window.getComputedStyle(element)
      if (computedStyle.fontFamily.includes(fontFamily)) {
        return true
      }
    }
    
    return false
  }

  async generateCriticalCss() {
    const criticalCssArray = Array.from(this.criticalRules)
    const criticalCss = criticalCssArray.join('\n')
    
    // Minify critical CSS
    const minifiedCss = this.minifyCss(criticalCss)
    
    this.metrics.criticalCssSize = new Blob([minifiedCss]).size
    this.metrics.nonCriticalCssSize = new Blob([Array.from(this.nonCriticalRules).join('\n')]).size
    
    // Check size constraints
    if (this.metrics.criticalCssSize > this.config.maxCriticalCssSize) {
      console.warn(`[CriticalCSS] Critical CSS size (${this.metrics.criticalCssSize}B) exceeds target (${this.config.maxCriticalCssSize}B)`)
      await this.optimizeCriticalCss()
    }
    
    // Inject critical CSS
    this.injectCriticalCss(minifiedCss)
  }

  async optimizeCriticalCss() {
    // Remove less critical rules to meet size budget
    const sortedRules = Array.from(this.criticalRules)
      .map(rule => ({ rule, priority: this.calculateRulePriority(rule) }))
      .sort((a, b) => b.priority - a.priority)
    
    this.criticalRules.clear()
    
    let currentSize = 0
    for (const { rule } of sortedRules) {
      const ruleSize = new Blob([rule]).size
      if (currentSize + ruleSize <= this.config.maxCriticalCssSize) {
        this.criticalRules.add(rule)
        currentSize += ruleSize
      } else {
        this.nonCriticalRules.add(rule)
      }
    }
  }

  calculateRulePriority(rule) {
    let priority = 0
    
    // Higher priority for layout and structural rules
    if (rule.includes('display') || rule.includes('position')) priority += 10
    if (rule.includes('width') || rule.includes('height')) priority += 8
    if (rule.includes('margin') || rule.includes('padding')) priority += 6
    if (rule.includes('font')) priority += 4
    if (rule.includes('color') || rule.includes('background')) priority += 2
    
    // Lower priority for animations and effects
    if (rule.includes('animation') || rule.includes('transition')) priority -= 5
    if (rule.includes('box-shadow') || rule.includes('border-radius')) priority -= 2
    
    return priority
  }

  injectCriticalCss(css) {
    // Remove existing critical CSS
    const existingCritical = document.getElementById('critical-css')
    if (existingCritical) {
      existingCritical.remove()
    }
    
    // Inject new critical CSS
    const style = document.createElement('style')
    style.id = 'critical-css'
    style.textContent = css
    
    // Insert before any other stylesheets
    const head = document.head
    const firstLink = head.querySelector('link[rel="stylesheet"]')
    
    if (firstLink) {
      head.insertBefore(style, firstLink)
    } else {
      head.appendChild(style)
    }
  }

  deferNonCriticalCss() {
    setTimeout(() => {
      this.loadNonCriticalCss()
    }, this.config.deferNonCriticalTimeout)
  }

  async loadNonCriticalCss() {
    // Create non-critical stylesheet
    const nonCriticalCss = Array.from(this.nonCriticalRules).join('\n')
    const minifiedCss = this.minifyCss(nonCriticalCss)
    
    // Load as non-blocking stylesheet
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.media = 'print' // Initially load as print to avoid render blocking
    link.href = this.createStylesheetDataUrl(minifiedCss)
    
    // Switch to all media once loaded
    link.onload = () => {
      link.media = 'all'
    }
    
    document.head.appendChild(link)
  }

  createStylesheetDataUrl(css) {
    const blob = new Blob([css], { type: 'text/css' })
    return URL.createObjectURL(blob)
  }

  setupMediaQueryMonitoring() {
    // Monitor media query changes for responsive critical CSS
    const mediaQueries = [
      '(max-width: 768px)',
      '(max-width: 1024px)',
      '(prefers-color-scheme: dark)',
      '(prefers-reduced-motion: reduce)'
    ]
    
    mediaQueries.forEach(query => {
      const mq = window.matchMedia(query)
      mq.addEventListener('change', () => {
        this.handleMediaQueryChange(query, mq.matches)
      })
    })
  }

  handleMediaQueryChange(query, matches) {
    // Regenerate critical CSS for new viewport conditions
    if (query.includes('max-width')) {
      this.extractCriticalCss()
    }
  }

  setupUnusedCssDetection() {
    setTimeout(() => {
      this.detectAndRemoveUnusedCss()
    }, this.config.purgeUnusedAfter)
  }

  async detectAndRemoveUnusedCss() {
    const usedSelectors = new Set()
    const allElements = document.querySelectorAll('*')
    
    // Track actually used selectors
    allElements.forEach(element => {
      // Add class selectors
      element.classList.forEach(className => {
        usedSelectors.add(`.${className}`)
      })
      
      // Add ID selector
      if (element.id) {
        usedSelectors.add(`#${element.id}`)
      }
      
      // Add tag selector
      usedSelectors.add(element.tagName.toLowerCase())
    })
    
    // Remove unused rules from non-critical CSS
    let removedCount = 0
    const unusedRules = new Set()
    
    for (const rule of this.nonCriticalRules) {
      const selector = this.extractSelector(rule)
      if (selector && !this.isSelectorUsed(selector, usedSelectors)) {
        unusedRules.add(rule)
        removedCount++
      }
    }
    
    // Remove unused rules
    unusedRules.forEach(rule => this.nonCriticalRules.delete(rule))
    
    this.metrics.unusedRulesRemoved = removedCount
    console.log(`[CriticalCSS] Removed ${removedCount} unused CSS rules`)
  }

  extractSelector(cssRule) {
    const match = cssRule.match(/^([^{]+){/)
    return match ? match[1].trim() : null
  }

  isSelectorUsed(selector, usedSelectors) {
    // Simple heuristic - check if any part of the selector is used
    const selectorParts = selector.split(/[\s>+~,]/)
    
    return selectorParts.some(part => {
      const cleanPart = part.trim()
      if (cleanPart.startsWith('.') || cleanPart.startsWith('#')) {
        return usedSelectors.has(cleanPart)
      }
      // Check tag selectors
      return usedSelectors.has(cleanPart.toLowerCase())
    })
  }

  minifyCss(css) {
    return css
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remove comments
      .replace(/\s+/g, ' ') // Collapse whitespace
      .replace(/;\s*}/g, '}') // Remove unnecessary semicolons
      .replace(/\s*{\s*/g, '{') // Clean braces
      .replace(/;\s*/g, ';') // Clean semicolons
      .replace(/,\s*/g, ',') // Clean commas
      .trim()
  }

  isSameOrigin(url) {
    try {
      const urlObj = new URL(url, window.location.href)
      return urlObj.origin === window.location.origin
    } catch {
      return false
    }
  }

  // Public API
  async regenerateCriticalCss() {
    await this.extractCriticalCss()
  }

  getCriticalCssSize() {
    return this.metrics.criticalCssSize
  }

  getNonCriticalCssSize() {
    return this.metrics.nonCriticalCssSize
  }

  getMetrics() {
    return {
      ...this.metrics,
      criticalRulesCount: this.criticalRules.size,
      nonCriticalRulesCount: this.nonCriticalRules.size,
      totalRulesCount: this.criticalRules.size + this.nonCriticalRules.size
    }
  }

  // Force load all CSS (for debugging)
  async loadAllCss() {
    await this.loadNonCriticalCss()
  }
}

// Utility function to create critical CSS from server-side rendering
export const extractCriticalCssFromHtml = (html, css) => {
  // This would be used in server-side rendering to extract
  // critical CSS based on the rendered HTML
  const usedSelectors = new Set()
  
  // Parse HTML and extract used classes/IDs
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  
  doc.querySelectorAll('*').forEach(element => {
    element.classList.forEach(className => {
      usedSelectors.add(`.${className}`)
    })
    
    if (element.id) {
      usedSelectors.add(`#${element.id}`)
    }
  })
  
  // Filter CSS rules based on used selectors
  // This is a simplified version - real implementation would need a CSS parser
  return css.split('}').filter(rule => {
    const selector = rule.split('{')[0]?.trim()
    return selector && Array.from(usedSelectors).some(used => 
      selector.includes(used)
    )
  }).join('}') + '}'
}

export default CriticalCssService