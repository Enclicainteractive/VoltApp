/**
 * React Performance Optimization Hooks
 * 
 * Custom hooks that provide automatic performance optimizations
 * for React components to reduce UI lag
 */

import { useCallback, useMemo, useRef, useEffect, useState } from 'react'

// Throttled state updates to reduce re-renders
export const useThrottledState = (initialValue, delay = 100) => {
  const [state, setState] = useState(initialValue)
  const throttleRef = useRef(null)

  const throttledSetState = useCallback((value) => {
    if (throttleRef.current) {
      clearTimeout(throttleRef.current)
    }
    
    throttleRef.current = setTimeout(() => {
      setState(value)
      throttleRef.current = null
    }, delay)
  }, [delay])

  return [state, throttledSetState]
}

// Debounced state updates for input fields
export const useDebouncedState = (initialValue, delay = 300) => {
  const [state, setState] = useState(initialValue)
  const [debouncedState, setDebouncedState] = useState(initialValue)
  const debounceRef = useRef(null)

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    
    debounceRef.current = setTimeout(() => {
      setDebouncedState(state)
    }, delay)

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [state, delay])

  return [state, setState, debouncedState]
}

// Optimized callback that prevents unnecessary re-renders
export const useOptimizedCallback = (callback, deps = []) => {
  const stableDepsRef = useRef(deps)
  const callbackRef = useRef(callback)
  
  // Only update if dependencies actually changed
  const depsChanged = useMemo(() => {
    if (stableDepsRef.current.length !== deps.length) return true
    return deps.some((dep, index) => dep !== stableDepsRef.current[index])
  }, deps)
  
  if (depsChanged) {
    stableDepsRef.current = deps
    callbackRef.current = callback
  }
  
  return useCallback(callbackRef.current, stableDepsRef.current)
}

// Optimized memo that tracks performance
export const useOptimizedMemo = (factory, deps = [], debugName = 'anonymous') => {
  const start = performance.now()
  const result = useMemo(() => {
    const memoStart = performance.now()
    const value = factory()
    const memoEnd = performance.now()
    
    if (memoEnd - memoStart > 5) {
      console.warn(`[Performance] Expensive memo: ${debugName} took ${(memoEnd - memoStart).toFixed(2)}ms`)
    }
    
    return value
  }, deps)
  
  const end = performance.now()
  if (end - start > 1) {
    console.warn(`[Performance] Memo overhead: ${debugName} hook took ${(end - start).toFixed(2)}ms`)
  }
  
  return result
}

// Virtual scrolling for large lists
export const useVirtualScrolling = (items = [], itemHeight = 50, containerHeight = 400, buffer = 5) => {
  const [scrollTop, setScrollTop] = useState(0)
  
  const visibleRange = useOptimizedMemo(() => {
    const start = Math.floor(scrollTop / itemHeight)
    const visibleCount = Math.ceil(containerHeight / itemHeight)
    
    return {
      start: Math.max(0, start - buffer),
      end: Math.min(items.length - 1, start + visibleCount + buffer)
    }
  }, [scrollTop, itemHeight, containerHeight, items.length, buffer], 'virtualScrolling')

  const visibleItems = useOptimizedMemo(() => 
    items.slice(visibleRange.start, visibleRange.end + 1).map((item, index) => ({
      ...item,
      index: visibleRange.start + index,
      style: {
        position: 'absolute',
        top: (visibleRange.start + index) * itemHeight,
        height: itemHeight,
        width: '100%'
      }
    }))
  , [items, visibleRange.start, visibleRange.end, itemHeight], 'visibleItems')

  const handleScroll = useOptimizedCallback((e) => {
    setScrollTop(e.target.scrollTop)
  }, [])

  return {
    visibleItems,
    totalHeight: items.length * itemHeight,
    onScroll: handleScroll,
    visibleRange
  }
}

// Intersection observer for lazy loading
export const useIntersectionObserver = (options = {}) => {
  const [isVisible, setIsVisible] = useState(false)
  const [hasBeenVisible, setHasBeenVisible] = useState(false)
  const targetRef = useRef(null)

  useEffect(() => {
    const target = targetRef.current
    if (!target || typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries
        const isCurrentlyVisible = entry.isIntersecting
        
        setIsVisible(isCurrentlyVisible)
        if (isCurrentlyVisible && !hasBeenVisible) {
          setHasBeenVisible(true)
        }
      },
      {
        threshold: 0.1,
        rootMargin: '50px',
        ...options
      }
    )

    observer.observe(target)
    return () => observer.disconnect()
  }, [hasBeenVisible, options])

  return { targetRef, isVisible, hasBeenVisible }
}

// RAF-based state updates for smooth animations
export const useRAFState = (initialValue) => {
  const [state, setState] = useState(initialValue)
  const rafRef = useRef(null)

  const setRAFState = useOptimizedCallback((value) => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
    }
    
    rafRef.current = requestAnimationFrame(() => {
      setState(value)
      rafRef.current = null
    })
  }, [])

  useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
      }
    }
  }, [])

  return [state, setRAFState]
}

// Batched state updates
export const useBatchedState = (initialState) => {
  const [state, setState] = useState(initialState)
  const batchedUpdates = useRef([])
  const timeoutRef = useRef(null)

  const batchedSetState = useOptimizedCallback((updates) => {
    batchedUpdates.current.push(updates)
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    
    timeoutRef.current = setTimeout(() => {
      setState(prevState => {
        return batchedUpdates.current.reduce((acc, update) => {
          return typeof update === 'function' ? update(acc) : { ...acc, ...update }
        }, prevState)
      })
      batchedUpdates.current = []
      timeoutRef.current = null
    }, 0)
  }, [])

  return [state, batchedSetState]
}

// Performance monitoring hook
export const usePerformanceMonitor = (componentName) => {
  const renderCount = useRef(0)
  const renderTimes = useRef([])
  const mountTime = useRef(performance.now())

  useEffect(() => {
    renderCount.current++
    const renderTime = performance.now()
    renderTimes.current.push(renderTime)
    
    // Keep only last 10 render times
    if (renderTimes.current.length > 10) {
      renderTimes.current = renderTimes.current.slice(-10)
    }
    
    // Log slow renders
    const renderDuration = renderTime - mountTime.current
    if (renderDuration > 16.67) { // Slower than 60fps
      console.warn(`[Performance] Slow render: ${componentName} #${renderCount.current} took ${renderDuration.toFixed(2)}ms`)
    }
    
    mountTime.current = renderTime
  })

  return {
    renderCount: renderCount.current,
    averageRenderTime: renderTimes.current.length > 1 
      ? renderTimes.current.reduce((a, b) => a + b, 0) / renderTimes.current.length 
      : 0
  }
}

// Prevent unnecessary re-renders from object/array props
export const useStableReference = (value) => {
  const ref = useRef(value)
  
  return useMemo(() => {
    // For objects, do a shallow comparison
    if (typeof value === 'object' && value !== null) {
      if (Array.isArray(value)) {
        if (!Array.isArray(ref.current) || 
            value.length !== ref.current.length || 
            value.some((item, index) => item !== ref.current[index])) {
          ref.current = value
        }
      } else {
        const currentKeys = Object.keys(value)
        const refKeys = Object.keys(ref.current || {})
        
        if (currentKeys.length !== refKeys.length ||
            currentKeys.some(key => value[key] !== ref.current[key])) {
          ref.current = value
        }
      }
    } else if (value !== ref.current) {
      ref.current = value
    }
    
    return ref.current
  }, [value])
}