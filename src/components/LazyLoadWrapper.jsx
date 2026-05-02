import React, { Suspense, lazy, useState, useEffect } from 'react'
import LoadingSpinner from './LoadingSpinner'

// Enhanced lazy loading with error boundary
const LazyLoadWrapper = ({ 
  importFunc, 
  fallback = <LoadingSpinner />, 
  errorFallback = null,
  retryCount = 3,
  retryDelay = 1000,
  preload = false,
  children,
  ...props 
}) => {
  const [Component, setComponent] = useState(null)
  const [error, setError] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [attempts, setAttempts] = useState(0)

  // Create lazy component with retry logic
  const LazyComponent = lazy(() => {
    return importFunc().catch(err => {
      console.error('Failed to load component:', err)
      
      if (attempts < retryCount) {
        setAttempts(prev => prev + 1)
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve(importFunc())
          }, retryDelay * Math.pow(2, attempts)) // Exponential backoff
        })
      }
      
      setError(err)
      throw err
    })
  })

  // Preload component if requested
  useEffect(() => {
    if (preload && !Component && !error) {
      setIsLoading(true)
      importFunc()
        .then(module => {
          setComponent(() => module.default || module)
          setIsLoading(false)
        })
        .catch(err => {
          setError(err)
          setIsLoading(false)
        })
    }
  }, [preload, importFunc, Component, error])

  // Error boundary for lazy loading failures
  const DefaultErrorFallback = ({ error, retry }) => (
    <div className="lazy-load-error">
      <h3>Failed to load component</h3>
      <p>{error.message}</p>
      <button onClick={retry} className="retry-button">
        Try Again
      </button>
    </div>
  )

  const handleRetry = () => {
    setError(null)
    setAttempts(0)
    setComponent(null)
  }

  if (error) {
    const ErrorComponent = errorFallback || DefaultErrorFallback
    return <ErrorComponent error={error} retry={handleRetry} />
  }

  if (preload && Component) {
    return <Component {...props}>{children}</Component>
  }

  return (
    <Suspense fallback={fallback}>
      <LazyComponent {...props}>{children}</LazyComponent>
    </Suspense>
  )
}

// HOC for lazy loading components
export const withLazyLoading = (importFunc, options = {}) => {
  return React.forwardRef((props, ref) => (
    <LazyLoadWrapper 
      importFunc={importFunc} 
      {...options}
      ref={ref}
      {...props} 
    />
  ))
}

// Hook for dynamic imports with caching
export const useDynamicImport = (importFunc, dependencies = []) => {
  const [module, setModule] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let mounted = true
    
    setLoading(true)
    setError(null)

    importFunc()
      .then(moduleExports => {
        if (mounted) {
          setModule(moduleExports.default || moduleExports)
          setLoading(false)
        }
      })
      .catch(err => {
        if (mounted) {
          setError(err)
          setLoading(false)
        }
      })

    return () => {
      mounted = false
    }
  }, dependencies)

  return { module, loading, error }
}

// Preloader for critical components
export const ComponentPreloader = () => {
  useEffect(() => {
    // Preload critical components after initial render
    const preloadComponents = [
      () => import('../pages/ChatPage'),
      () => import('./MessageList'),
      () => import('./ChannelSidebar'),
      () => import('./ServerSidebar')
    ]

    // Preload with delay to not block initial render
    setTimeout(() => {
      preloadComponents.forEach(importFunc => {
        importFunc().catch(err => {
          console.warn('Failed to preload component:', err)
        })
      })
    }, 1000)
  }, [])

  return null
}

export default LazyLoadWrapper