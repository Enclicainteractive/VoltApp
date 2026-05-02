// React optimization hooks for VoltChat components
import { useMemo, useCallback, useRef, useState, useEffect } from 'react'

// Hook for stable object references
export const useStableObject = (obj) => {
  const stableRef = useRef()
  
  return useMemo(() => {
    const currentHash = JSON.stringify(obj, Object.keys(obj).sort())
    
    if (!stableRef.current || stableRef.current.hash !== currentHash) {
      stableRef.current = {
        hash: currentHash,
        value: { ...obj }
      }
    }
    
    return stableRef.current.value
  }, [obj])
}

// Hook for stable array references
export const useStableArray = (arr) => {
  const stableRef = useRef()
  
  return useMemo(() => {
    const currentHash = JSON.stringify(arr)
    
    if (!stableRef.current || stableRef.current.hash !== currentHash) {
      stableRef.current = {
        hash: currentHash,
        value: [...arr]
      }
    }
    
    return stableRef.current.value
  }, [arr])
}

// Hook for memoized calculations with dependency tracking
export const useMemoizedCalculation = (calculateFn, dependencies, options = {}) => {
  const { enableCache = true, maxCacheSize = 100 } = options
  const cacheRef = useRef(new Map())
  
  return useMemo(() => {
    if (!enableCache) {
      return calculateFn()
    }
    
    const cacheKey = JSON.stringify(dependencies)
    
    if (cacheRef.current.has(cacheKey)) {
      return cacheRef.current.get(cacheKey)
    }
    
    const result = calculateFn()
    
    // Manage cache size
    if (cacheRef.current.size >= maxCacheSize) {
      const firstKey = cacheRef.current.keys().next().value
      cacheRef.current.delete(firstKey)
    }
    
    cacheRef.current.set(cacheKey, result)
    return result
  }, dependencies)
}

// Hook for optimized event handlers
export const useOptimizedCallback = (callback, dependencies = []) => {
  const stableCallback = useCallback(callback, dependencies)
  
  // Track callback usage in development
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      const callbackName = callback.name || 'anonymous'
      console.debug(`[OptimizedCallback] Created: ${callbackName}`)
    }
  }, [callback])
  
  return stableCallback
}

// Hook for component render tracking
export const useRenderTracking = (componentName) => {
  const renderCountRef = useRef(0)
  const lastRenderTimeRef = useRef(0)
  
  useEffect(() => {
    renderCountRef.current++
    lastRenderTimeRef.current = performance.now()
    
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[RenderTracker] ${componentName} rendered ${renderCountRef.current} times`)
    }
  })
  
  return {
    renderCount: renderCountRef.current,
    lastRenderTime: lastRenderTimeRef.current
  }
}

// Hook for preventing unnecessary re-renders with deep comparison
export const useDeepMemo = (value) => {
  const ref = useRef()
  
  if (!ref.current || !deepEqual(ref.current, value)) {
    ref.current = value
  }
  
  return ref.current
}

// Hook for throttled state updates
export const useThrottledState = (initialValue, throttleMs = 100) => {
  const [state, setState] = useState(initialValue)
  const throttleRef = useRef()
  
  const setThrottledState = useCallback((newValue) => {
    clearTimeout(throttleRef.current)
    
    throttleRef.current = setTimeout(() => {
      setState(newValue)
    }, throttleMs)
  }, [throttleMs])
  
  const setImmediateState = useCallback((newValue) => {
    clearTimeout(throttleRef.current)
    setState(newValue)
  }, [])
  
  return [state, setThrottledState, setImmediateState]
}

// Hook for debounced state updates
export const useDebouncedState = (initialValue, debounceMs = 300) => {
  const [state, setState] = useState(initialValue)
  const [debouncedState, setDebouncedState] = useState(initialValue)
  const debounceRef = useRef()
  
  useEffect(() => {
    clearTimeout(debounceRef.current)
    
    debounceRef.current = setTimeout(() => {
      setDebouncedState(state)
    }, debounceMs)
    
    return () => clearTimeout(debounceRef.current)
  }, [state, debounceMs])
  
  return [state, setState, debouncedState]
}

// Hook for stable callback references
export const useStableCallback = (callback) => {
  const callbackRef = useRef(callback)
  
  // Always update the ref but return a stable function
  callbackRef.current = callback
  
  return useCallback((...args) => {
    return callbackRef.current(...args)
  }, [])
}

// Hook for conditional rendering optimization
export const useConditionalRender = (condition, renderFn, dependencies = []) => {
  const lastResultRef = useRef()
  
  return useMemo(() => {
    if (condition) {
      lastResultRef.current = renderFn()
      return lastResultRef.current
    }
    
    // Return last result to prevent unnecessary work
    return lastResultRef.current || null
  }, [condition, ...dependencies])
}

// Hook for list optimization with keys
export const useOptimizedList = (items, keyExtractor, renderItem) => {
  return useMemo(() => {
    const keyedItems = new Map()
    
    return items.map((item, index) => {
      const key = keyExtractor(item, index)
      
      if (!keyedItems.has(key)) {
        keyedItems.set(key, renderItem(item, index, key))
      }
      
      return keyedItems.get(key)
    })
  }, [items, keyExtractor, renderItem])
}

// Hook for performance monitoring
export const usePerformanceMonitor = (componentName, options = {}) => {
  const { threshold = 16, enableLogging = false } = options
  const startTimeRef = useRef()
  const metricsRef = useRef({
    renders: 0,
    totalTime: 0,
    slowRenders: 0
  })
  
  useEffect(() => {
    startTimeRef.current = performance.now()
  })
  
  useEffect(() => {
    if (startTimeRef.current) {
      const renderTime = performance.now() - startTimeRef.current
      const metrics = metricsRef.current
      
      metrics.renders++
      metrics.totalTime += renderTime
      
      if (renderTime > threshold) {
        metrics.slowRenders++
        
        if (enableLogging) {
          console.warn(`[Performance] Slow render in ${componentName}: ${renderTime.toFixed(2)}ms`)
        }
      }
      
      if (enableLogging && metrics.renders % 100 === 0) {
        const avgTime = metrics.totalTime / metrics.renders
        console.log(`[Performance] ${componentName} - Avg: ${avgTime.toFixed(2)}ms, Slow: ${metrics.slowRenders}`)
      }
    }
  })
  
  return metricsRef.current
}

// Hook for preventing child re-renders
export const useChildrenMemo = (children, dependencies = []) => {
  return useMemo(() => children, dependencies)
}

// Hook for component lazy loading
export const useLazyComponent = (importFn, fallback = null) => {
  const [Component, setComponent] = useState(fallback)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  
  const loadComponent = useCallback(async () => {
    if (Component && Component !== fallback) return
    
    setLoading(true)
    setError(null)
    
    try {
      const module = await importFn()
      const LoadedComponent = module.default || module
      setComponent(() => LoadedComponent)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [importFn, Component, fallback])
  
  return { Component, loading, error, loadComponent }
}

// Hook for preventing layout thrashing
export const useLayoutOptimization = () => {
  const [isLayoutStable, setIsLayoutStable] = useState(false)
  
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      setIsLayoutStable(false)
      
      setTimeout(() => {
        setIsLayoutStable(true)
      }, 100) // Allow layout to stabilize
    })
    
    observer.observe(document.body)
    
    return () => observer.disconnect()
  }, [])
  
  return isLayoutStable
}

// Utility function for deep equality checking
const deepEqual = (a, b) => {
  if (a === b) return true
  
  if (a == null || b == null) return false
  
  if (typeof a !== typeof b) return false
  
  if (typeof a !== 'object') return false
  
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  
  if (keysA.length !== keysB.length) return false
  
  for (const key of keysA) {
    if (!keysB.includes(key)) return false
    if (!deepEqual(a[key], b[key])) return false
  }
  
  return true
}

// Higher-order component for automatic optimization
export const withOptimization = (Component, options = {}) => {
  const {
    memo = true,
    trackRenders = false,
    stableProps = false
  } = options
  
  let OptimizedComponent = Component
  
  if (memo) {
    OptimizedComponent = React.memo(OptimizedComponent, (prevProps, nextProps) => {
      // Custom comparison logic
      return shallowEqual(prevProps, nextProps)
    })
  }
  
  if (trackRenders || stableProps) {
    OptimizedComponent = (props) => {
      const renderTracking = trackRenders ? useRenderTracking(Component.name) : null
      const stablePropsObj = stableProps ? useStableObject(props) : props
      
      return React.createElement(Component, stablePropsObj)
    }
  }
  
  OptimizedComponent.displayName = `Optimized(${Component.displayName || Component.name})`
  
  return OptimizedComponent
}

// Shallow equality check
const shallowEqual = (obj1, obj2) => {
  const keys1 = Object.keys(obj1)
  const keys2 = Object.keys(obj2)
  
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

export default {
  useStableObject,
  useStableArray,
  useMemoizedCalculation,
  useOptimizedCallback,
  useRenderTracking,
  useDeepMemo,
  useThrottledState,
  useDebouncedState,
  useStableCallback,
  useConditionalRender,
  useOptimizedList,
  usePerformanceMonitor,
  useChildrenMemo,
  useLazyComponent,
  useLayoutOptimization,
  withOptimization
}