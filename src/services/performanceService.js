// Performance monitoring and optimization service
class PerformanceService {
  constructor() {
    this.metrics = new Map()
    this.observers = new Map()
    this.isEnabled = process.env.NODE_ENV === 'development'
    
    if (this.isEnabled) {
      this.initializeObservers()
    }
  }
  
  // Initialize performance observers
  initializeObservers() {
    // Long Task Observer
    if ('PerformanceObserver' in window && 'PerformanceLongTaskTiming' in window) {
      const longTaskObserver = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          console.warn(`Long task detected: ${entry.duration}ms`, entry)
          this.recordMetric('longTask', {
            duration: entry.duration,
            startTime: entry.startTime,
            name: entry.name
          })
        })
      })
      
      try {
        longTaskObserver.observe({ entryTypes: ['longtask'] })
        this.observers.set('longTask', longTaskObserver)
      } catch (e) {
        console.warn('Long task observer not supported:', e)
      }
    }
    
    // Layout Shift Observer
    if ('PerformanceObserver' in window) {
      const clsObserver = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          if (!entry.hadRecentInput) {
            console.warn(`Layout shift detected: ${entry.value}`, entry)
            this.recordMetric('layoutShift', {
              value: entry.value,
              startTime: entry.startTime,
              sources: entry.sources
            })
          }
        })
      })
      
      try {
        clsObserver.observe({ entryTypes: ['layout-shift'] })
        this.observers.set('layoutShift', clsObserver)
      } catch (e) {
        console.warn('Layout shift observer not supported:', e)
      }
    }
    
    // Memory monitoring
    this.monitorMemory()
  }
  
  // Monitor memory usage
  monitorMemory() {
    if ('memory' in performance) {
      setInterval(() => {
        const memInfo = performance.memory
        this.recordMetric('memory', {
          used: memInfo.usedJSHeapSize,
          total: memInfo.totalJSHeapSize,
          limit: memInfo.jsHeapSizeLimit,
          timestamp: Date.now()
        })
        
        // Warn if memory usage is high
        const usagePercent = (memInfo.usedJSHeapSize / memInfo.jsHeapSizeLimit) * 100
        if (usagePercent > 80) {
          console.warn(`High memory usage: ${usagePercent.toFixed(2)}%`)
        }
      }, 30000) // Check every 30 seconds
    }
  }
  
  // Record performance metrics
  recordMetric(type, data) {
    if (!this.metrics.has(type)) {
      this.metrics.set(type, [])
    }
    
    const metrics = this.metrics.get(type)
    metrics.push({
      timestamp: Date.now(),
      ...data
    })
    
    // Keep only last 100 entries per metric type
    if (metrics.length > 100) {
      metrics.splice(0, metrics.length - 100)
    }
  }
  
  // Measure component render time
  measureRender(componentName, renderFn) {
    if (!this.isEnabled) return renderFn()
    
    const startTime = performance.now()
    const result = renderFn()
    const endTime = performance.now()
    
    this.recordMetric('componentRender', {
      component: componentName,
      duration: endTime - startTime
    })
    
    if (endTime - startTime > 16) { // > 1 frame at 60fps
      console.warn(`Slow render in ${componentName}: ${(endTime - startTime).toFixed(2)}ms`)
    }
    
    return result
  }
  
  // Debounce function for performance optimization
  debounce(func, wait, immediate = false) {
    let timeout
    return function executedFunction(...args) {
      const later = () => {
        timeout = null
        if (!immediate) func.apply(this, args)
      }
      const callNow = immediate && !timeout
      clearTimeout(timeout)
      timeout = setTimeout(later, wait)
      if (callNow) func.apply(this, args)
    }
  }
  
  // Throttle function for performance optimization
  throttle(func, wait) {
    let inThrottle
    return function(...args) {
      if (!inThrottle) {
        func.apply(this, args)
        inThrottle = true
        setTimeout(() => inThrottle = false, wait)
      }
    }
  }
  
  // Optimize images for better performance
  optimizeImage(img, maxWidth = 800, quality = 0.8) {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      
      // Calculate new dimensions
      const aspectRatio = img.height / img.width
      const newWidth = Math.min(img.width, maxWidth)
      const newHeight = newWidth * aspectRatio
      
      canvas.width = newWidth
      canvas.height = newHeight
      
      // Draw and compress
      ctx.drawImage(img, 0, 0, newWidth, newHeight)
      canvas.toBlob(resolve, 'image/jpeg', quality)
    })
  }
  
  // Lazy loading utility
  createLazyLoader(threshold = 0.1) {
    if (!('IntersectionObserver' in window)) {
      return {
        observe: () => {},
        unobserve: () => {},
        disconnect: () => {}
      }
    }
    
    return new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const element = entry.target
          const src = element.dataset.src
          if (src) {
            element.src = src
            element.removeAttribute('data-src')
            this.unobserve(element)
          }
        }
      })
    }, { threshold })
  }
  
  // Get performance metrics
  getMetrics(type) {
    return this.metrics.get(type) || []
  }
  
  // Get performance summary
  getPerformanceSummary() {
    const summary = {}
    
    for (const [type, metrics] of this.metrics.entries()) {
      if (metrics.length > 0) {
        const values = metrics.map(m => m.duration || m.value || 0)
        summary[type] = {
          count: metrics.length,
          avg: values.reduce((a, b) => a + b, 0) / values.length,
          max: Math.max(...values),
          min: Math.min(...values)
        }
      }
    }
    
    return summary
  }
  
  // Clear metrics
  clearMetrics() {
    this.metrics.clear()
  }
  
  // Dispose of observers
  dispose() {
    for (const [name, observer] of this.observers.entries()) {
      observer.disconnect()
    }
    this.observers.clear()
    this.metrics.clear()
  }
}

// Create singleton instance
const performanceService = new PerformanceService()

export { performanceService }
export default performanceService