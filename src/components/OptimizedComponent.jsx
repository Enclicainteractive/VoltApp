/**
 * Optimized Component Wrapper
 * 
 * High-performance React component wrapper that automatically
 * applies performance optimizations to reduce UI lag
 */

import React, { memo, forwardRef, useRef, useEffect } from 'react'
import { usePerformanceMonitor, useVirtualScrolling, useStableReference } from '../hooks/usePerformanceOptimization'

// Enhanced memo with deep comparison for complex props
const isEqual = (prevProps, nextProps) => {
  // Skip comparison for functions and refs (assume they're stable)
  const prevKeys = Object.keys(prevProps)
  const nextKeys = Object.keys(nextProps)
  
  if (prevKeys.length !== nextKeys.length) {
    return false
  }
  
  for (const key of prevKeys) {
    const prevValue = prevProps[key]
    const nextValue = nextProps[key]
    
    // Skip function props (assume they're memoized)
    if (typeof prevValue === 'function' || typeof nextValue === 'function') {
      continue
    }
    
    // Shallow comparison for objects and arrays
    if (typeof prevValue === 'object' && typeof nextValue === 'object') {
      if (prevValue === null || nextValue === null) {
        if (prevValue !== nextValue) return false
        continue
      }
      
      if (Array.isArray(prevValue) && Array.isArray(nextValue)) {
        if (prevValue.length !== nextValue.length) return false
        for (let i = 0; i < prevValue.length; i++) {
          if (prevValue[i] !== nextValue[i]) return false
        }
        continue
      }
      
      if (Array.isArray(prevValue) || Array.isArray(nextValue)) {
        return false
      }
      
      const prevObjKeys = Object.keys(prevValue)
      const nextObjKeys = Object.keys(nextValue)
      
      if (prevObjKeys.length !== nextObjKeys.length) return false
      
      for (const objKey of prevObjKeys) {
        if (prevValue[objKey] !== nextValue[objKey]) return false
      }
      
      continue
    }
    
    // Direct comparison for primitives
    if (prevValue !== nextValue) {
      return false
    }
  }
  
  return true
}

// Performance-optimized component wrapper
const OptimizedComponent = memo(forwardRef((props, ref) => {
  const {
    component: Component,
    enableProfiling = false,
    enableVirtualization = false,
    throttleUpdates = false,
    displayName = 'OptimizedComponent',
    children,
    ...restProps
  } = props
  
  const performanceMetrics = usePerformanceMonitor(displayName)
  const renderCountRef = useRef(0)
  
  useEffect(() => {
    renderCountRef.current++
    
    if (enableProfiling && renderCountRef.current > 1) {
      console.log(`[OptimizedComponent] ${displayName} rendered ${renderCountRef.current} times`)
    }
  })
  
  // If it's a function component, render it
  if (typeof Component === 'function') {
    return <Component ref={ref} {...restProps}>{children}</Component>
  }
  
  // If it's a class component or element, clone it
  if (React.isValidElement(Component)) {
    return React.cloneElement(Component, { ref, ...restProps }, children)
  }
  
  // Fallback: render children
  return children || null
}), isEqual)

OptimizedComponent.displayName = 'OptimizedComponent'

// HOC for automatic optimization
export const withOptimization = (WrappedComponent, options = {}) => {
  const {
    displayName = WrappedComponent.displayName || WrappedComponent.name || 'Component',
    enableProfiling = process.env.NODE_ENV === 'development',
    memoization = true,
    throttleProps = [],
    stableProps = []
  } = options
  
  const OptimizedWrappedComponent = forwardRef((props, ref) => {
    const optimizedProps = { ...props }
    
    // Apply throttling to specific props
    throttleProps.forEach(propName => {
      if (propName in optimizedProps) {
        // Implement prop-level throttling if needed
        // This is a simplified version
      }
    })
    
    // Stabilize specific props
    stableProps.forEach(propName => {
      if (propName in optimizedProps && typeof optimizedProps[propName] === 'object') {
        // Apply reference stability
        optimizedProps[propName] = useStableReference(optimizedProps[propName])
      }
    })
    
    return (
      <OptimizedComponent
        component={WrappedComponent}
        ref={ref}
        enableProfiling={enableProfiling}
        displayName={displayName}
        {...optimizedProps}
      />
    )
  })
  
  OptimizedWrappedComponent.displayName = `withOptimization(${displayName})`
  
  return memoization ? memo(OptimizedWrappedComponent, isEqual) : OptimizedWrappedComponent
}

// Lazy component with performance tracking
export const LazyOptimizedComponent = ({ importFunction, fallback = null, ...props }) => {
  const LazyComponent = React.lazy(importFunction)
  
  return (
    <React.Suspense fallback={fallback}>
      <OptimizedComponent component={LazyComponent} {...props} />
    </React.Suspense>
  )
}

// Virtual list optimization
export const VirtualizedList = memo(({ items, itemHeight = 50, containerHeight = 400, renderItem, ...props }) => {
  const { visibleItems, totalHeight, onScroll } = useVirtualScrolling(
    items, 
    itemHeight, 
    containerHeight
  )
  
  return (
    <div 
      style={{ height: containerHeight, overflow: 'auto' }}
      onScroll={onScroll}
      {...props}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        {visibleItems.map((item) => (
          <div key={item.index || item.id} style={item.style}>
            {renderItem(item, item.index)}
          </div>
        ))}
      </div>
    </div>
  )
})

VirtualizedList.displayName = 'VirtualizedList'

export default OptimizedComponent