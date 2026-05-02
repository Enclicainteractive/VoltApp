// React Component Re-render Optimization Service for VoltChat
// Tracks and optimizes React component performance

class ReactOptimizationService {
  constructor() {
    this.componentMetrics = new Map()
    this.renderCache = new Map()
    this.memoizedComponents = new Set()
    this.reRenderAnalyzer = new ReRenderAnalyzer()
    
    // Configuration
    this.config = {
      trackRenders: process.env.NODE_ENV === 'development',
      enableProfiling: true,
      maxCacheSize: 1000,
      renderThreshold: 100, // ms
      reRenderThreshold: 10 // renders per second
    }
    
    // Performance tracking
    this.metrics = {
      totalRenders: 0,
      unnecessaryRenders: 0,
      optimizedComponents: 0,
      cacheHits: 0,
      renderTimesSaved: 0
    }
    
    this.initialize()
  }

  initialize() {
    if (this.config.trackRenders) {
      this.setupRenderTracking()
      this.setupPerformanceObserver()
    }
    
    this.startCleanupInterval()
    console.log('[ReactOpt] React optimization service initialized')
  }

  setupRenderTracking() {
    // Monkey patch React's render methods for tracking
    if (typeof window !== 'undefined' && window.React) {
      this.patchReactFiber()
    }
  }

  setupPerformanceObserver() {
    if ('PerformanceObserver' in window) {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name.includes('React')) {
            this.analyzeRenderPerformance(entry)
          }
        }
      })
      
      try {
        observer.observe({ entryTypes: ['measure', 'mark'] })
      } catch (error) {
        console.warn('[ReactOpt] Performance observer not supported:', error)
      }
    }
  }

  patchReactFiber() {
    // This is a simplified version - in production you'd use React DevTools profiler
    const originalCreateElement = window.React.createElement
    
    window.React.createElement = (type, props, ...children) => {
      if (typeof type === 'function' || typeof type === 'object') {
        this.trackComponentRender(type, props)
      }
      
      return originalCreateElement(type, props, ...children)
    }
  }

  trackComponentRender(Component, props) {
    const componentName = this.getComponentName(Component)
    const renderKey = this.generateRenderKey(componentName, props)
    
    const now = performance.now()
    const existing = this.componentMetrics.get(componentName)
    
    const metrics = existing || {
      name: componentName,
      renderCount: 0,
      totalRenderTime: 0,
      lastRender: 0,
      renders: [],
      propsHistory: []
    }
    
    metrics.renderCount++
    metrics.lastRender = now
    metrics.renders.push(now)
    metrics.propsHistory.push(this.serializeProps(props))
    
    // Keep only recent renders
    if (metrics.renders.length > 100) {
      metrics.renders = metrics.renders.slice(-100)
    }
    if (metrics.propsHistory.length > 50) {
      metrics.propsHistory = metrics.propsHistory.slice(-50)
    }
    
    this.componentMetrics.set(componentName, metrics)
    this.metrics.totalRenders++
    
    // Analyze for unnecessary renders
    this.analyzeUnnecessaryRender(componentName, props, metrics)
  }

  analyzeUnnecessaryRender(componentName, props, metrics) {
    if (metrics.propsHistory.length < 2) return
    
    const currentProps = this.serializeProps(props)
    const previousProps = metrics.propsHistory[metrics.propsHistory.length - 2]
    
    // Check if props are identical
    if (currentProps === previousProps) {
      this.metrics.unnecessaryRenders++
      
      // Log suggestion for optimization
      console.warn(`[ReactOpt] Unnecessary render detected: ${componentName}`)
      this.suggestOptimization(componentName, 'memo')
    }
    
    // Check render frequency
    const recentRenders = metrics.renders.filter(
      time => performance.now() - time < 1000
    )
    
    if (recentRenders.length > this.config.reRenderThreshold) {
      console.warn(`[ReactOpt] High render frequency: ${componentName} (${recentRenders.length} renders/sec)`)
      this.suggestOptimization(componentName, 'throttle')
    }
  }

  suggestOptimization(componentName, type) {
    const suggestion = {
      component: componentName,
      type,
      timestamp: Date.now(),
      applied: false
    }
    
    window.dispatchEvent(new CustomEvent('reactOptimizationSuggestion', {
      detail: suggestion
    }))
  }

  // Optimized component creators
  createMemoizedComponent(Component, compareFunction = null) {
    const MemoizedComponent = React.memo(Component, compareFunction)
    
    // Track that this component has been optimized
    this.memoizedComponents.add(this.getComponentName(Component))
    this.metrics.optimizedComponents++
    
    return MemoizedComponent
  }

  createOptimizedSelector(selector, dependencies = []) {
    // Create a memoized selector that only recalculates when dependencies change
    return React.useMemo(selector, dependencies)
  }

  // Render performance analysis
  analyzeRenderPerformance(entry) {
    if (entry.duration > this.config.renderThreshold) {
      const componentName = this.extractComponentName(entry.name)
      
      console.warn(`[ReactOpt] Slow render detected: ${componentName} took ${entry.duration.toFixed(2)}ms`)
      
      this.suggestOptimization(componentName, 'performance')
    }
  }

  // Component props optimization
  optimizeProps(props, optimizationRules = {}) {
    const optimized = { ...props }
    
    for (const [key, value] of Object.entries(optimized)) {
      const rule = optimizationRules[key]
      
      if (rule) {
        optimized[key] = this.applyOptimizationRule(value, rule)
      } else {
        optimized[key] = this.autoOptimizeProp(value)
      }
    }
    
    return optimized
  }

  applyOptimizationRule(value, rule) {
    switch (rule.type) {
      case 'memoize':
        return this.memoizeValue(value, rule.dependencies)
      case 'callback':
        return this.optimizeCallback(value, rule.dependencies)
      case 'stable':
        return this.stabilizeReference(value)
      default:
        return value
    }
  }

  autoOptimizeProp(value) {
    if (typeof value === 'function') {
      return this.optimizeCallback(value)
    } else if (Array.isArray(value)) {
      return this.stabilizeArray(value)
    } else if (typeof value === 'object' && value !== null) {
      return this.stabilizeObject(value)
    }
    
    return value
  }

  memoizeValue(value, dependencies = []) {
    const key = this.generateCacheKey(value, dependencies)
    
    if (this.renderCache.has(key)) {
      this.metrics.cacheHits++
      return this.renderCache.get(key)
    }
    
    this.renderCache.set(key, value)
    return value
  }

  optimizeCallback(callback, dependencies = []) {
    // This would typically use useCallback in the actual component
    return React.useCallback(callback, dependencies)
  }

  stabilizeReference(value) {
    const key = this.generateStableKey(value)
    
    if (this.renderCache.has(key)) {
      return this.renderCache.get(key)
    }
    
    this.renderCache.set(key, value)
    return value
  }

  stabilizeArray(arr) {
    const key = JSON.stringify(arr)
    
    if (this.renderCache.has(key)) {
      this.metrics.cacheHits++
      return this.renderCache.get(key)
    }
    
    const stableArray = [...arr]
    this.renderCache.set(key, stableArray)
    return stableArray
  }

  stabilizeObject(obj) {
    const key = this.generateObjectKey(obj)
    
    if (this.renderCache.has(key)) {
      this.metrics.cacheHits++
      return this.renderCache.get(key)
    }
    
    const stableObject = { ...obj }
    this.renderCache.set(key, stableObject)
    return stableObject
  }

  // Virtual DOM optimization
  shouldComponentUpdate(prevProps, nextProps, prevState, nextState) {
    // Shallow comparison for props
    if (!this.shallowEqual(prevProps, nextProps)) {
      return true
    }
    
    // Shallow comparison for state
    if (!this.shallowEqual(prevState, nextState)) {
      return true
    }
    
    return false
  }

  shallowEqual(obj1, obj2) {
    const keys1 = Object.keys(obj1 || {})
    const keys2 = Object.keys(obj2 || {})
    
    if (keys1.length !== keys2.length) {
      return false
    }
    
    for (const key of keys1) {
      if (obj1[key] !== obj2[key]) {
        return false
      }
    }
    
    return true
  }

  // Utility methods
  getComponentName(Component) {
    if (typeof Component === 'string') {
      return Component
    } else if (Component.displayName) {
      return Component.displayName
    } else if (Component.name) {
      return Component.name
    } else {
      return 'AnonymousComponent'
    }
  }

  serializeProps(props) {
    try {
      return JSON.stringify(props, (key, value) => {
        if (typeof value === 'function') {
          return '[Function]'
        }
        if (value instanceof HTMLElement) {
          return '[HTMLElement]'
        }
        return value
      })
    } catch {
      return '[Unserializable]'
    }
  }

  generateRenderKey(componentName, props) {
    const propsKey = this.serializeProps(props)
    return `${componentName}:${propsKey}`
  }

  generateCacheKey(value, dependencies) {
    const depKey = dependencies.map(dep => typeof dep).join(',')
    const valueKey = typeof value === 'object' ? JSON.stringify(value) : String(value)
    return `${valueKey}:${depKey}`
  }

  generateStableKey(value) {
    if (typeof value === 'object' && value !== null) {
      return JSON.stringify(value, Object.keys(value).sort())
    }
    return String(value)
  }

  generateObjectKey(obj) {
    const sortedKeys = Object.keys(obj).sort()
    const keyValuePairs = sortedKeys.map(key => `${key}:${typeof obj[key]}`)
    return keyValuePairs.join(',')
  }

  extractComponentName(entryName) {
    const match = entryName.match(/React\.(.+?)\.render/)
    return match ? match[1] : 'UnknownComponent'
  }

  // Cache management
  startCleanupInterval() {
    setInterval(() => {
      this.cleanupCache()
    }, 60000) // Every minute
  }

  cleanupCache() {
    if (this.renderCache.size > this.config.maxCacheSize) {
      // Remove oldest entries
      const entries = Array.from(this.renderCache.entries())
      const toRemove = entries.slice(0, entries.length - this.config.maxCacheSize)
      
      toRemove.forEach(([key]) => {
        this.renderCache.delete(key)
      })
    }
  }

  // Performance recommendations
  getPerformanceRecommendations() {
    const recommendations = []
    
    for (const [componentName, metrics] of this.componentMetrics.entries()) {
      // High render frequency
      const recentRenders = metrics.renders.filter(
        time => performance.now() - time < 5000 // Last 5 seconds
      )
      
      if (recentRenders.length > 20) {
        recommendations.push({
          type: 'high_frequency',
          component: componentName,
          severity: 'high',
          suggestion: 'Consider using React.memo or optimizing state updates',
          metrics: {
            renderCount: recentRenders.length,
            timeWindow: '5s'
          }
        })
      }
      
      // Not memoized but should be
      if (!this.memoizedComponents.has(componentName) && metrics.renderCount > 50) {
        recommendations.push({
          type: 'not_memoized',
          component: componentName,
          severity: 'medium',
          suggestion: 'Consider memoizing this component',
          metrics: {
            totalRenders: metrics.renderCount
          }
        })
      }
    }
    
    return recommendations
  }

  // Public API
  getMetrics() {
    return {
      ...this.metrics,
      componentCount: this.componentMetrics.size,
      cacheSize: this.renderCache.size,
      memoizedComponents: this.memoizedComponents.size
    }
  }

  getComponentMetrics(componentName = null) {
    if (componentName) {
      return this.componentMetrics.get(componentName) || null
    }
    
    return Object.fromEntries(this.componentMetrics)
  }

  clearMetrics() {
    this.componentMetrics.clear()
    this.renderCache.clear()
    this.metrics = {
      totalRenders: 0,
      unnecessaryRenders: 0,
      optimizedComponents: 0,
      cacheHits: 0,
      renderTimesSaved: 0
    }
  }
}

// Re-render analyzer for detailed analysis
class ReRenderAnalyzer {
  constructor() {
    this.renderPatterns = new Map()
    this.stateChangePatterns = new Map()
  }

  analyzeRenderPattern(componentName, renderTime, stateChanges = []) {
    const pattern = this.renderPatterns.get(componentName) || {
      renders: [],
      stateChanges: [],
      patterns: []
    }
    
    pattern.renders.push({
      timestamp: renderTime,
      stateChanges: [...stateChanges]
    })
    
    // Keep only recent data
    if (pattern.renders.length > 100) {
      pattern.renders = pattern.renders.slice(-100)
    }
    
    this.renderPatterns.set(componentName, pattern)
    this.detectPatterns(componentName, pattern)
  }

  detectPatterns(componentName, pattern) {
    const recentRenders = pattern.renders.slice(-10)
    
    if (recentRenders.length >= 5) {
      // Check for rapid successive renders
      const intervals = []
      for (let i = 1; i < recentRenders.length; i++) {
        intervals.push(recentRenders[i].timestamp - recentRenders[i - 1].timestamp)
      }
      
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length
      
      if (avgInterval < 50) { // Less than 50ms between renders
        console.warn(`[ReactOpt] Rapid render pattern detected in ${componentName}`)
      }
    }
  }
}

export default ReactOptimizationService