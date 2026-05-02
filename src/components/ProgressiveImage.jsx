import React, { useState, useRef, useEffect, useCallback } from 'react'
import './ProgressiveImage.css'

const ProgressiveImage = ({
  src,
  alt = '',
  placeholder = null,
  lowQualitySrc = null,
  className = '',
  style = {},
  onLoad = () => {},
  onError = () => {},
  lazy = true,
  blurAmount = 10,
  fadeInDuration = 300,
  ...props
}) => {
  const [currentSrc, setCurrentSrc] = useState(placeholder || lowQualitySrc)
  const [isLoaded, setIsLoaded] = useState(false)
  const [isError, setIsError] = useState(false)
  const [isIntersecting, setIsIntersecting] = useState(!lazy)
  const [loadingState, setLoadingState] = useState('placeholder') // placeholder, lowQuality, highQuality, error
  
  const imgRef = useRef(null)
  const observerRef = useRef(null)

  // Generate low-quality placeholder if not provided
  const generatePlaceholder = useCallback(() => {
    if (placeholder) return placeholder
    
    // Create a tiny blurred version
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    canvas.width = 10
    canvas.height = 10
    
    // Generate a simple gradient based on image URL hash
    const hash = src.split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0)
      return a & a
    }, 0)
    
    const hue = Math.abs(hash) % 360
    const gradient = ctx.createLinearGradient(0, 0, 10, 10)
    gradient.addColorStop(0, `hsl(${hue}, 30%, 80%)`)
    gradient.addColorStop(1, `hsl(${hue + 60}, 30%, 60%)`)
    
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 10, 10)
    
    return canvas.toDataURL()
  }, [src, placeholder])

  // Set up intersection observer for lazy loading
  useEffect(() => {
    if (!lazy || isIntersecting) return

    observerRef.current = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsIntersecting(true)
        }
      },
      {
        threshold: 0.1,
        rootMargin: '50px'
      }
    )

    if (imgRef.current) {
      observerRef.current.observe(imgRef.current)
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect()
      }
    }
  }, [lazy, isIntersecting])

  // Load low-quality image first
  useEffect(() => {
    if (!isIntersecting) return

    if (lowQualitySrc && loadingState === 'placeholder') {
      const lowQualityImg = new Image()
      lowQualityImg.onload = () => {
        setCurrentSrc(lowQualitySrc)
        setLoadingState('lowQuality')
      }
      lowQualityImg.onerror = () => {
        // If low quality fails, skip to high quality
        setLoadingState('lowQuality')
      }
      lowQualityImg.src = lowQualitySrc
    }
  }, [isIntersecting, lowQualitySrc, loadingState])

  // Load high-quality image
  useEffect(() => {
    if (!isIntersecting || !src) return
    if (loadingState === 'highQuality' || loadingState === 'error') return

    const highQualityImg = new Image()
    
    highQualityImg.onload = () => {
      setCurrentSrc(src)
      setIsLoaded(true)
      setLoadingState('highQuality')
      onLoad()
    }
    
    highQualityImg.onerror = () => {
      setIsError(true)
      setLoadingState('error')
      onError()
    }
    
    highQualityImg.src = src
  }, [isIntersecting, src, loadingState, onLoad, onError])

  // Initialize placeholder
  useEffect(() => {
    if (!currentSrc && loadingState === 'placeholder') {
      setCurrentSrc(generatePlaceholder())
    }
  }, [currentSrc, loadingState, generatePlaceholder])

  const imageClasses = [
    'progressive-image',
    className,
    loadingState === 'placeholder' && 'progressive-image--placeholder',
    loadingState === 'lowQuality' && 'progressive-image--low-quality',
    loadingState === 'highQuality' && 'progressive-image--loaded',
    loadingState === 'error' && 'progressive-image--error'
  ].filter(Boolean).join(' ')

  const imageStyle = {
    ...style,
    filter: loadingState !== 'highQuality' ? `blur(${blurAmount}px)` : 'none',
    transition: `filter ${fadeInDuration}ms ease-in-out, opacity ${fadeInDuration}ms ease-in-out`,
    opacity: loadingState === 'error' ? 0.5 : 1
  }

  return (
    <div className="progressive-image-container" style={{ position: 'relative' }}>
      {/* Main image */}
      <img
        ref={imgRef}
        src={currentSrc}
        alt={alt}
        className={imageClasses}
        style={imageStyle}
        {...props}
      />
      
      {/* Loading indicator */}
      {loadingState !== 'highQuality' && loadingState !== 'error' && (
        <div className="progressive-image-loader">
          <div className="progressive-image-spinner"></div>
        </div>
      )}
      
      {/* Error fallback */}
      {loadingState === 'error' && (
        <div className="progressive-image-error">
          <span>⚠️ Failed to load image</span>
        </div>
      )}
      
      {/* Loading progress bar */}
      {isIntersecting && loadingState !== 'highQuality' && (
        <div className="progressive-image-progress">
          <div 
            className="progressive-image-progress-bar"
            style={{
              width: loadingState === 'placeholder' ? '20%' : 
                     loadingState === 'lowQuality' ? '60%' : '100%'
            }}
          />
        </div>
      )}
    </div>
  )
}

// Hook for preloading images
export const useImagePreloader = () => {
  const cache = useRef(new Map())
  
  const preloadImage = useCallback((src) => {
    if (cache.current.has(src)) {
      return Promise.resolve(cache.current.get(src))
    }
    
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        cache.current.set(src, img)
        resolve(img)
      }
      img.onerror = reject
      img.src = src
    })
  }, [])
  
  const preloadImages = useCallback(async (srcList) => {
    const promises = srcList.map(preloadImage)
    try {
      await Promise.all(promises)
      return true
    } catch (error) {
      console.warn('Some images failed to preload:', error)
      return false
    }
  }, [preloadImage])
  
  const isImageCached = useCallback((src) => {
    return cache.current.has(src)
  }, [])
  
  return {
    preloadImage,
    preloadImages,
    isImageCached
  }
}

// Utility function to generate low-quality image URLs
export const generateLowQualityUrl = (originalUrl, quality = 0.1, maxWidth = 50) => {
  // This would typically be handled by your image service/CDN
  // Examples for different services:
  
  if (originalUrl.includes('cloudinary.com')) {
    return originalUrl.replace('/upload/', `/upload/q_${Math.round(quality * 100)},w_${maxWidth}/`)
  }
  
  if (originalUrl.includes('imagekit.io')) {
    return `${originalUrl}?tr=q-${Math.round(quality * 100)},w-${maxWidth}`
  }
  
  if (originalUrl.includes('amazonaws.com')) {
    // For AWS Lambda image resizer
    return `${originalUrl}?width=${maxWidth}&quality=${Math.round(quality * 100)}`
  }
  
  // Fallback: return original URL (let server handle it)
  return originalUrl
}

export default ProgressiveImage