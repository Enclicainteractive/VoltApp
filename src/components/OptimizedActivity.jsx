import React, { Suspense, lazy, useMemo, useCallback, useState, useRef, useEffect } from 'react'
import performanceService from '../services/performanceService'

// Lazy load activity components for code splitting
const ActivityComponents = {
  VoltCraftActivity: lazy(() => import('../activities/builtin/components/VoltCraftActivity')),
  MiniGolfActivity: lazy(() => import('../activities/builtin/components/MiniGolfActivity')),
  ChessArenaActivity: lazy(() => import('../activities/builtin/components/ChessArenaActivity')),
  PixelArtActivity: lazy(() => import('../activities/builtin/components/PixelArtActivity')),
  CollaborativeDrawingActivity: lazy(() => import('../activities/builtin/components/CollaborativeDrawingActivity')),
  TicTacToeActivity: lazy(() => import('../activities/builtin/components/TicTacToeActivity')),
  PokerNightActivity: lazy(() => import('../activities/builtin/components/PokerNightActivity')),
  ConnectFourActivity: lazy(() => import('../activities/builtin/components/ConnectFourActivity')),
  SketchDuelActivity: lazy(() => import('../activities/builtin/components/SketchDuelActivity')),
  BytebeatActivity: lazy(() => import('../activities/builtin/components/BytebeatActivity')),
  OurVidsActivity: lazy(() => import('../activities/builtin/components/OurVidsActivity'))
}

// Performance-optimized activity loading component
const ActivityLoadingFallback = React.memo(({ activityName }) => (
  <div className="activity-loading">
    <div className="activity-loading-spinner">
      <div className="spinner"></div>
    </div>
    <div className="activity-loading-text">
      Loading {activityName}...
    </div>
    <div className="activity-loading-progress">
      <div className="progress-bar"></div>
    </div>
  </div>
))

ActivityLoadingFallback.displayName = 'ActivityLoadingFallback'

// Error boundary for activity components
class ActivityErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('Activity Error:', error, errorInfo)
    performanceService.recordMetric('activityError', {
      activityName: this.props.activityName,
      error: error.message,
      stack: error.stack
    })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="activity-error">
          <div className="activity-error-icon">⚠️</div>
          <div className="activity-error-title">Activity Failed to Load</div>
          <div className="activity-error-description">
            {this.props.activityName} encountered an error and couldn't be loaded.
          </div>
          <button 
            className="activity-error-retry"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Try Again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

// Main optimized activity component
const OptimizedActivity = React.memo(({
  activityType,
  activityProps = {},
  onActivityLoad,
  onActivityError,
  className = '',
  style = {},
  priority = 'normal' // 'high', 'normal', 'low'
}) => {
  const [isVisible, setIsVisible] = useState(false)
  const [loadStartTime, setLoadStartTime] = useState(null)
  const containerRef = useRef(null)
  const intersectionObserverRef = useRef(null)
  
  // Memoize the activity component
  const ActivityComponent = useMemo(() => {
    return ActivityComponents[activityType]
  }, [activityType])
  
  // Intersection observer for lazy loading
  useEffect(() => {
    if (!containerRef.current || priority === 'high') {
      setIsVisible(true)
      return
    }
    
    intersectionObserverRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            setIsVisible(true)
            setLoadStartTime(Date.now())
            intersectionObserverRef.current?.disconnect()
          }
        })
      },
      {
        threshold: 0.1,
        rootMargin: '50px' // Start loading 50px before visible
      }
    )
    
    intersectionObserverRef.current.observe(containerRef.current)
    
    return () => {
      intersectionObserverRef.current?.disconnect()
    }
  }, [priority])
  
  // Performance monitoring callbacks
  const handleActivityLoad = useCallback(() => {
    const loadTime = loadStartTime ? Date.now() - loadStartTime : 0
    performanceService.recordMetric('activityLoad', {
      activityType,
      loadTime,
      priority
    })
    onActivityLoad?.(activityType, loadTime)
  }, [activityType, loadStartTime, priority, onActivityLoad])
  
  const handleActivityError = useCallback((error) => {
    performanceService.recordMetric('activityError', {
      activityType,
      error: error.message,
      priority
    })
    onActivityError?.(activityType, error)
  }, [activityType, priority, onActivityError])
  
  // Memoized loading fallback
  const LoadingFallback = useMemo(() => (
    <ActivityLoadingFallback activityName={activityType} />
  ), [activityType])
  
  if (!ActivityComponent) {
    return (
      <div className="activity-not-found">
        <div className="activity-not-found-icon">🔍</div>
        <div className="activity-not-found-title">Activity Not Found</div>
        <div className="activity-not-found-description">
          The activity "{activityType}" is not available.
        </div>
      </div>
    )
  }
  
  return (
    <div 
      ref={containerRef}
      className={`optimized-activity ${className}`}
      style={style}
      data-activity-type={activityType}
      data-priority={priority}
    >
      {isVisible ? (
        <ActivityErrorBoundary activityName={activityType}>
          <Suspense fallback={LoadingFallback}>
            <ActivityComponent 
              {...activityProps}
              onLoad={handleActivityLoad}
              onError={handleActivityError}
            />
          </Suspense>
        </ActivityErrorBoundary>
      ) : (
        <div className="activity-placeholder">
          <div className="activity-placeholder-content">
            <div className="activity-placeholder-icon">🎮</div>
            <div className="activity-placeholder-text">
              {activityType}
            </div>
          </div>
        </div>
      )}
    </div>
  )
})

OptimizedActivity.displayName = 'OptimizedActivity'

// Hook for managing multiple activities with performance optimization
export const useOptimizedActivities = () => {
  const [activeActivities, setActiveActivities] = useState(new Map())
  const [activityMetrics, setActivityMetrics] = useState(new Map())
  
  const addActivity = useCallback((activityId, activityType, activityProps, priority = 'normal') => {
    setActiveActivities(prev => {
      const next = new Map(prev)
      next.set(activityId, {
        id: activityId,
        type: activityType,
        props: activityProps,
        priority,
        loadTime: null,
        status: 'loading'
      })
      return next
    })
  }, [])
  
  const removeActivity = useCallback((activityId) => {
    setActiveActivities(prev => {
      const next = new Map(prev)
      next.delete(activityId)
      return next
    })
    setActivityMetrics(prev => {
      const next = new Map(prev)
      next.delete(activityId)
      return next
    })
  }, [])
  
  const updateActivityStatus = useCallback((activityId, status, loadTime = null) => {
    setActiveActivities(prev => {
      if (!prev.has(activityId)) return prev
      const activity = prev.get(activityId)
      const next = new Map(prev)
      next.set(activityId, {
        ...activity,
        status,
        loadTime
      })
      return next
    })
    
    if (loadTime) {
      setActivityMetrics(prev => {
        const next = new Map(prev)
        next.set(activityId, { loadTime, status })
        return next
      })
    }
  }, [])
  
  const getActivityMetrics = useCallback(() => {
    return Array.from(activityMetrics.entries()).map(([id, metrics]) => ({
      id,
      ...metrics
    }))
  }, [activityMetrics])
  
  return {
    activeActivities: Array.from(activeActivities.values()),
    addActivity,
    removeActivity,
    updateActivityStatus,
    getActivityMetrics
  }
}

export default OptimizedActivity