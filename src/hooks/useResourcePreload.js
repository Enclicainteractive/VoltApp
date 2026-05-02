// React hook for resource preloading
import { useEffect, useState, useCallback, useRef } from 'react'
import { getResourcePreloadService } from '../services/resourcePreloadService'

export const useResourcePreload = (resources = [], options = {}) => {
  const [preloadState, setPreloadState] = useState({
    loading: false,
    loaded: [],
    failed: [],
    progress: 0
  })
  
  const preloadService = useRef(null)
  const mountedRef = useRef(true)
  
  useEffect(() => {
    preloadService.current = getResourcePreloadService()
    
    return () => {
      mountedRef.current = false
    }
  }, [])

  const preloadResources = useCallback(async (resourcesToPreload = resources) => {
    if (!preloadService.current || resourcesToPreload.length === 0) {
      return
    }

    setPreloadState(prev => ({ ...prev, loading: true }))
    
    const loaded = []
    const failed = []
    let completed = 0
    
    try {
      const preloadPromises = resourcesToPreload.map(async (resource, index) => {
        try {
          const result = await preloadService.current.preloadResource(resource)
          loaded.push({ ...resource, result, index })
          
          completed++
          if (mountedRef.current) {
            setPreloadState(prev => ({
              ...prev,
              progress: (completed / resourcesToPreload.length) * 100
            }))
          }
          
          return result
        } catch (error) {
          failed.push({ ...resource, error, index })
          
          completed++
          if (mountedRef.current) {
            setPreloadState(prev => ({
              ...prev,
              progress: (completed / resourcesToPreload.length) * 100
            }))
          }
          
          throw error
        }
      })
      
      await Promise.allSettled(preloadPromises)
      
    } finally {
      if (mountedRef.current) {
        setPreloadState(prev => ({
          ...prev,
          loading: false,
          loaded,
          failed,
          progress: 100
        }))
      }
    }
    
    return { loaded, failed }
  }, [resources])

  useEffect(() => {
    if (options.autoPreload !== false && resources.length > 0) {
      preloadResources()
    }
  }, [resources, options.autoPreload, preloadResources])

  const queuePreload = useCallback((resource) => {
    if (preloadService.current) {
      preloadService.current.queuePreload(resource)
    }
  }, [])

  const getCachedData = useCallback((cacheKey) => {
    return preloadService.current?.getCachedData(cacheKey) || null
  }, [])

  const preloadRoute = useCallback((routeName) => {
    if (preloadService.current) {
      preloadService.current.preloadRoute(routeName)
    }
  }, [])

  return {
    ...preloadState,
    preloadResources,
    queuePreload,
    getCachedData,
    preloadRoute,
    isPreloading: preloadState.loading,
    hasErrors: preloadState.failed.length > 0,
    isComplete: preloadState.progress === 100
  }
}

// Hook for preloading critical app resources
export const useCriticalResourcePreload = () => {
  const [isReady, setIsReady] = useState(false)
  const [error, setError] = useState(null)
  
  useEffect(() => {
    const preloadService = getResourcePreloadService()
    
    preloadService.preloadCriticalResources()
      .then(() => {
        setIsReady(true)
      })
      .catch((err) => {
        setError(err)
        setIsReady(true) // Still mark as ready to not block app
      })
  }, [])
  
  return { isReady, error }
}

// Hook for route-specific preloading
export const useRoutePreload = (routeName, dependencies = []) => {
  const preloadService = useRef(null)
  
  useEffect(() => {
    preloadService.current = getResourcePreloadService()
  }, [])
  
  useEffect(() => {
    if (preloadService.current && routeName) {
      preloadService.current.preloadRoute(routeName)
    }
  }, [routeName, ...dependencies])
  
  const preloadSpecificRoute = useCallback((route) => {
    if (preloadService.current) {
      preloadService.current.preloadRoute(route)
    }
  }, [])
  
  return { preloadRoute: preloadSpecificRoute }
}

// Hook for image preloading with progressive loading
export const useImagePreload = (src, options = {}) => {
  const [state, setState] = useState({
    loading: true,
    loaded: false,
    error: null,
    src: null
  })
  
  useEffect(() => {
    if (!src) return
    
    setState(prev => ({ ...prev, loading: true, error: null }))
    
    const preloadService = getResourcePreloadService()
    
    preloadService.preloadResource({
      type: 'image',
      url: src,
      priority: options.priority || 'normal'
    })
    .then((img) => {
      setState({
        loading: false,
        loaded: true,
        error: null,
        src: img.src
      })
    })
    .catch((error) => {
      setState({
        loading: false,
        loaded: false,
        error,
        src: null
      })
    })
  }, [src, options.priority])
  
  return state
}

// Hook for data preloading with caching
export const useDataPreload = (url, cacheKey, options = {}) => {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  
  const preloadService = useRef(null)
  
  useEffect(() => {
    preloadService.current = getResourcePreloadService()
  }, [])
  
  const loadData = useCallback(async () => {
    if (!url || !preloadService.current) return
    
    // Try to get cached data first
    const cached = preloadService.current.getCachedData(cacheKey)
    if (cached) {
      setData(cached)
      return cached
    }
    
    setLoading(true)
    setError(null)
    
    try {
      const result = await preloadService.current.preloadResource({
        type: 'fetch',
        url,
        cache: cacheKey,
        priority: options.priority || 'normal'
      })
      
      setData(result)
      return result
    } catch (err) {
      setError(err)
      throw err
    } finally {
      setLoading(false)
    }
  }, [url, cacheKey, options.priority])
  
  useEffect(() => {
    if (options.autoLoad !== false) {
      loadData()
    }
  }, [loadData, options.autoLoad])
  
  return { data, loading, error, reload: loadData }
}

export default useResourcePreload