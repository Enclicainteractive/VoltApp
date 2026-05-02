import React, { Suspense, useState, useEffect, useRef, useMemo } from 'react'
import lazyLoadingService from '../services/lazyLoadingService'

// Skeleton loader variations
const SkeletonLoaders = {
  card: ({ width = '100%', height = '120px', className = '' }) => (
    <div className={`skeleton-card ${className}`} style={{ width, height }}>
      <div className="skeleton-avatar"></div>
      <div className="skeleton-content">
        <div className="skeleton-line skeleton-line-title"></div>
        <div className="skeleton-line skeleton-line-text"></div>
        <div className="skeleton-line skeleton-line-text short"></div>
      </div>
    </div>
  ),
  
  list: ({ items = 3, className = '' }) => (
    <div className={`skeleton-list ${className}`}>
      {Array(items).fill(0).map((_, i) => (
        <div key={i} className="skeleton-list-item">
          <div className="skeleton-circle"></div>
          <div className="skeleton-line"></div>
        </div>
      ))}
    </div>
  ),
  
  message: ({ className = '' }) => (
    <div className={`skeleton-message ${className}`}>
      <div className="skeleton-avatar"></div>
      <div className="skeleton-message-content">
        <div className="skeleton-line skeleton-line-short"></div>
        <div className="skeleton-line"></div>
        <div className="skeleton-line skeleton-line-medium"></div>
      </div>
    </div>
  ),
  
  sidebar: ({ className = '' }) => (
    <div className={`skeleton-sidebar ${className}`}>
      <div className="skeleton-header">
        <div className="skeleton-line skeleton-line-title"></div>
      </div>
      <div className="skeleton-nav">
        {Array(5).fill(0).map((_, i) => (
          <div key={i} className="skeleton-nav-item">
            <div className="skeleton-circle small"></div>
            <div className="skeleton-line"></div>
          </div>
        ))}
      </div>
    </div>
  ),
  
  modal: ({ className = '' }) => (
    <div className={`skeleton-modal ${className}`}>
      <div className="skeleton-modal-header">
        <div className="skeleton-line skeleton-line-title"></div>
      </div>
      <div className="skeleton-modal-content">
        <div className="skeleton-line"></div>
        <div className="skeleton-line"></div>
        <div className="skeleton-line skeleton-line-medium"></div>
      </div>
      <div className="skeleton-modal-footer">
        <div className="skeleton-button"></div>
        <div className="skeleton-button primary"></div>
      </div>
    </div>
  )
}

// Progressive loading wrapper component
const LazyComponent = React.memo(({ 
  componentName,
  loaderComponent: LoaderComponent,
  skeletonType = 'card',
  skeletonProps = {},
  priority = lazyLoadingService.priorities.MEDIUM,
  fallback: CustomFallback,
  errorFallback: CustomErrorFallback,
  loadOnMount = false,
  loadOnVisible = true,
  retries = 3,
  timeout = 10000,
  className = '',
  style = {},
  onLoad,
  onError,
  children,
  ...props
}) => {
  const [isLoaded, setIsLoaded] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [Component, setComponent] = useState(null)
  const elementRef = useRef(null)
  const mountedRef = useRef(true)
  const canLoadComponent = Boolean(LoaderComponent || componentName)
  
  // Memoize skeleton component
  const SkeletonComponent = useMemo(() => {
    if (CustomFallback) return CustomFallback
    
    const SkeletonType = SkeletonLoaders[skeletonType] || SkeletonLoaders.card
    return () => <SkeletonType {...skeletonProps} className={`loading ${className}`} />
  }, [skeletonType, skeletonProps, CustomFallback, className])
  
  // Load component function
  const loadComponent = async () => {
    if (isLoading || isLoaded) return
    
    setIsLoading(true)
    setError(null)
    
    try {
      let result
      
      if (LoaderComponent) {
        // Direct component loader
        result = await LoaderComponent()
      } else if (componentName) {
        // Use lazy loading service
        result = await lazyLoadingService.loadComponent(componentName, {
          priority,
          timeout,
          retries
        })
      } else {
        throw new Error('No component loader or name provided')
      }
      
      if (!mountedRef.current) return
      
      // Handle different import formats
      const component = result.default || result
      setComponent(() => component)
      setIsLoaded(true)
      onLoad?.(component)
      
    } catch (err) {
      if (!mountedRef.current) return
      
      console.error(`Failed to load component ${componentName || 'Unknown'}:`, err)
      setError(err)
      onError?.(err)
    } finally {
      if (mountedRef.current) {
        setIsLoading(false)
      }
    }
  }
  
  // Setup intersection observer for viewport-based loading
  useEffect(() => {
    if (loadOnVisible && canLoadComponent && elementRef.current) {
      if (componentName) {
        lazyLoadingService.observe(elementRef.current, componentName)
      }
      
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting && !isLoaded && !isLoading) {
              loadComponent()
            }
          })
        },
        { threshold: 0.1, rootMargin: '100px' }
      )
      
      observer.observe(elementRef.current)
      
      return () => {
        observer.disconnect()
        if (elementRef.current) {
          lazyLoadingService.unobserve(elementRef.current)
        }
      }
    }
  }, [loadOnVisible, canLoadComponent, componentName, isLoaded, isLoading])
  
  // Load on mount if requested
  useEffect(() => {
    if (loadOnMount && canLoadComponent && !isLoaded && !isLoading) {
      loadComponent()
    }
  }, [loadOnMount, canLoadComponent, isLoaded, isLoading])
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false
    }
  }, [])
  
  // Error boundary fallback
  const ErrorFallback = CustomErrorFallback || (({ error, retry }) => (
    <div className={`component-error ${className}`} style={style}>
      <div className="error-icon">⚠️</div>
      <div className="error-title">Failed to Load</div>
      <div className="error-message">{error.message}</div>
      <button onClick={retry} className="error-retry-btn">
        Try Again
      </button>
    </div>
  ))
  
  // Handle error state
  if (error) {
    return <ErrorFallback error={error} retry={loadComponent} />
  }
  
  // Handle loading state
  if (!isLoaded || !Component) {
    return (
      <div 
        ref={elementRef}
        className={`lazy-component-container ${className}`}
        style={style}
        data-component={componentName}
        data-loading={isLoading}
      >
        <SkeletonComponent />
      </div>
    )
  }
  
  // Render loaded component
  return (
    <div 
      ref={elementRef}
      className={`lazy-component-container loaded ${className}`}
      style={style}
      data-component={componentName}
    >
      <Suspense fallback={<SkeletonComponent />}>
        <Component {...props}>
          {children}
        </Component>
      </Suspense>
    </div>
  )
})

LazyComponent.displayName = 'LazyComponent'

// Hook for lazy loading management
export const useLazyLoading = () => {
  const [stats, setStats] = useState(lazyLoadingService.getStats())
  
  useEffect(() => {
    const updateStats = () => {
      setStats(lazyLoadingService.getStats())
    }
    
    const interval = setInterval(updateStats, 1000)
    return () => clearInterval(interval)
  }, [])
  
  return {
    ...stats,
    loadComponent: (name, options) => lazyLoadingService.loadComponent(name, options),
    preload: (name) => lazyLoadingService.preload(name),
    loadByPriority: (priority) => lazyLoadingService.loadByPriority(priority)
  }
}

// HOC for lazy loading
export const withLazyLoading = (componentName, options = {}) => {
  return (WrappedComponent) => {
    const LazyWrappedComponent = (props) => (
      <LazyComponent 
        componentName={componentName}
        {...options}
        {...props}
      >
        <WrappedComponent {...props} />
      </LazyComponent>
    )
    
    LazyWrappedComponent.displayName = `LazyLoading(${WrappedComponent.displayName || WrappedComponent.name})`
    return LazyWrappedComponent
  }
}

export default LazyComponent
