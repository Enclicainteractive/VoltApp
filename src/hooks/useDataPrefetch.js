// React hook for data prefetching
import { useEffect, useState, useCallback, useRef, useContext, createContext } from 'react'
import DataPrefetchService from '../services/dataPrefetchService'

// Context for sharing prefetch service across components
const PrefetchContext = createContext(null)

export const PrefetchProvider = ({ children, apiService }) => {
  const [prefetchService] = useState(() => new DataPrefetchService(apiService))
  
  useEffect(() => {
    return () => {
      prefetchService.destroy()
    }
  }, [prefetchService])
  
  return (
    <PrefetchContext.Provider value={prefetchService}>
      {children}
    </PrefetchContext.Provider>
  )
}

export const usePrefetchContext = () => {
  const context = useContext(PrefetchContext)
  if (!context) {
    throw new Error('usePrefetchContext must be used within PrefetchProvider')
  }
  return context
}

// Main data prefetching hook
export const useDataPrefetch = (endpoint, options = {}) => {
  const [state, setState] = useState({
    data: null,
    loading: false,
    error: null,
    fromCache: false
  })
  
  const prefetchService = usePrefetchContext()
  const optionsRef = useRef(options)
  optionsRef.current = options

  const fetchData = useCallback(async (force = false) => {
    if (!endpoint || !prefetchService) return
    
    // Try cache first unless forced
    if (!force) {
      const cached = prefetchService.getCachedData(endpoint, optionsRef.current)
      if (cached) {
        setState(prev => ({
          ...prev,
          data: cached,
          fromCache: true,
          loading: false,
          error: null
        }))
        return cached
      }
    }
    
    setState(prev => ({ ...prev, loading: true, error: null, fromCache: false }))
    
    try {
      const data = await prefetchService.prefetchData(endpoint, {
        ...optionsRef.current,
        priority: force ? 'high' : (optionsRef.current.priority || 'medium')
      })
      
      setState(prev => ({
        ...prev,
        data,
        loading: false,
        fromCache: false
      }))
      
      return data
    } catch (error) {
      setState(prev => ({
        ...prev,
        error,
        loading: false
      }))
      throw error
    }
  }, [endpoint, prefetchService])

  useEffect(() => {
    if (options.autoFetch !== false) {
      fetchData()
    }
  }, [fetchData, options.autoFetch])

  const prefetchOnly = useCallback((customEndpoint = endpoint, customOptions = {}) => {
    if (prefetchService) {
      return prefetchService.prefetchData(customEndpoint, {
        ...optionsRef.current,
        ...customOptions
      })
    }
  }, [endpoint, prefetchService])

  const invalidateCache = useCallback((pattern = endpoint) => {
    if (prefetchService) {
      prefetchService.invalidateCache(pattern)
    }
  }, [endpoint, prefetchService])

  return {
    ...state,
    refetch: () => fetchData(true),
    prefetch: prefetchOnly,
    invalidateCache
  }
}

// Hook for predictive prefetching based on user behavior
export const usePredictivePrefetch = (currentPath, dependencies = []) => {
  const prefetchService = usePrefetchContext()
  const [predictions, setPredictions] = useState([])
  
  useEffect(() => {
    if (!prefetchService || !currentPath) return
    
    const updatePredictions = async () => {
      const predicted = await prefetchService.predictNextActions(currentPath)
      setPredictions(predicted.slice(0, 5)) // Top 5 predictions
      
      // Prefetch high-confidence predictions
      const highConfidencePredictions = predicted.filter(
        p => p.confidence > prefetchService.config.predictionThreshold
      )
      
      for (const prediction of highConfidencePredictions) {
        prefetchService.prefetchData(prediction.endpoint, {
          priority: prefetchService.confidenceToPriority(prediction.confidence)
        })
      }
    }
    
    updatePredictions()
  }, [currentPath, prefetchService, ...dependencies])
  
  return predictions
}

// Hook for hover-based prefetching
export const useHoverPrefetch = (ref, endpoint, options = {}) => {
  const prefetchService = usePrefetchContext()
  const timeoutRef = useRef(null)
  const [isPrefetched, setIsPrefetched] = useState(false)
  
  useEffect(() => {
    const element = ref.current
    if (!element || !prefetchService || !endpoint) return
    
    const handleMouseEnter = () => {
      timeoutRef.current = setTimeout(async () => {
        if (!isPrefetched) {
          await prefetchService.prefetchData(endpoint, {
            priority: 'medium',
            ...options
          })
          setIsPrefetched(true)
        }
      }, options.delay || 150)
    }
    
    const handleMouseLeave = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
    
    element.addEventListener('mouseenter', handleMouseEnter)
    element.addEventListener('mouseleave', handleMouseLeave)
    
    return () => {
      element.removeEventListener('mouseenter', handleMouseEnter)
      element.removeEventListener('mouseleave', handleMouseLeave)
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [ref, endpoint, options, prefetchService, isPrefetched])
  
  return isPrefetched
}

// Hook for scroll-based prefetching
export const useScrollPrefetch = (endpoint, options = {}) => {
  const prefetchService = usePrefetchContext()
  const [hasTriggered, setHasTriggered] = useState(false)
  
  useEffect(() => {
    if (!prefetchService || !endpoint || hasTriggered) return
    
    const threshold = options.threshold || 0.8
    
    const handleScroll = () => {
      const scrollPosition = window.scrollY + window.innerHeight
      const documentHeight = document.documentElement.scrollHeight
      const scrollPercentage = scrollPosition / documentHeight
      
      if (scrollPercentage >= threshold && !hasTriggered) {
        prefetchService.prefetchData(endpoint, {
          priority: 'low',
          ...options
        })
        setHasTriggered(true)
      }
    }
    
    window.addEventListener('scroll', handleScroll, { passive: true })
    
    return () => {
      window.removeEventListener('scroll', handleScroll)
    }
  }, [endpoint, options, prefetchService, hasTriggered])
  
  return hasTriggered
}

// Hook for batch prefetching multiple endpoints
export const useBatchPrefetch = (endpoints, options = {}) => {
  const prefetchService = usePrefetchContext()
  const [batchState, setBatchState] = useState({
    completed: [],
    failed: [],
    inProgress: false,
    progress: 0
  })
  
  const startBatch = useCallback(async () => {
    if (!prefetchService || endpoints.length === 0) return
    
    setBatchState(prev => ({ ...prev, inProgress: true }))
    
    const completed = []
    const failed = []
    
    try {
      const promises = endpoints.map(async (endpoint, index) => {
        try {
          const data = await prefetchService.prefetchData(endpoint, options)
          completed.push({ endpoint, data, index })
          
          setBatchState(prev => ({
            ...prev,
            progress: ((completed.length + failed.length) / endpoints.length) * 100
          }))
          
          return { success: true, endpoint, data }
        } catch (error) {
          failed.push({ endpoint, error, index })
          
          setBatchState(prev => ({
            ...prev,
            progress: ((completed.length + failed.length) / endpoints.length) * 100
          }))
          
          return { success: false, endpoint, error }
        }
      })
      
      const results = await Promise.allSettled(promises)
      
      setBatchState(prev => ({
        ...prev,
        completed,
        failed,
        inProgress: false,
        progress: 100
      }))
      
      return results
    } catch (error) {
      setBatchState(prev => ({
        ...prev,
        inProgress: false,
        failed: [...failed, { error }]
      }))
      throw error
    }
  }, [endpoints, options, prefetchService])
  
  useEffect(() => {
    if (options.autoStart !== false && endpoints.length > 0) {
      startBatch()
    }
  }, [startBatch, options.autoStart, endpoints.length])
  
  return {
    ...batchState,
    startBatch
  }
}

// Hook for cache warming
export const useCacheWarmup = (warmupEndpoints) => {
  const prefetchService = usePrefetchContext()
  const [warmedUp, setWarmedUp] = useState(false)
  
  useEffect(() => {
    if (!prefetchService || !warmupEndpoints?.length || warmedUp) return
    
    prefetchService.warmupCache(warmupEndpoints)
    setWarmedUp(true)
  }, [prefetchService, warmupEndpoints, warmedUp])
  
  return warmedUp
}

// Hook for prefetch metrics
export const usePrefetchMetrics = () => {
  const prefetchService = usePrefetchContext()
  const [metrics, setMetrics] = useState(null)
  
  useEffect(() => {
    if (!prefetchService) return
    
    const updateMetrics = () => {
      setMetrics(prefetchService.getMetrics())
    }
    
    updateMetrics()
    const interval = setInterval(updateMetrics, 5000) // Update every 5 seconds
    
    return () => clearInterval(interval)
  }, [prefetchService])
  
  return metrics
}

// Hook for intelligent route prefetching
export const useRoutePrefetch = (currentRoute, routeMap = {}) => {
  const prefetchService = usePrefetchContext()
  
  useEffect(() => {
    if (!prefetchService || !currentRoute) return
    
    const routeEndpoints = routeMap[currentRoute]
    if (routeEndpoints && Array.isArray(routeEndpoints)) {
      routeEndpoints.forEach(endpoint => {
        prefetchService.prefetchData(endpoint, { priority: 'low' })
      })
    }
    
    // Also prefetch based on learned patterns
    prefetchService.prefetchForPath(currentRoute)
  }, [currentRoute, routeMap, prefetchService])
}

export default useDataPrefetch