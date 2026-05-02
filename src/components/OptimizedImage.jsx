// Optimized Image Component with WebP support and lazy loading
import React, { useState, useRef, useEffect, useCallback } from 'react'
import { getImageOptimizationService } from '../services/imageOptimizationService'
import './OptimizedImage.css'

const OptimizedImage = ({
  src,
  alt = '',
  className = '',
  placeholder,
  blurDataURL,
  sizes,
  srcSet,
  quality = 85,
  format = 'auto',
  lazy = true,
  progressive = true,
  thumbnails = false,
  onLoad,
  onError,
  style = {},
  ...props
}) => {
  const [currentSrc, setCurrentSrc] = useState(blurDataURL || placeholder)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoaded, setIsLoaded] = useState(false)
  const [error, setError] = useState(null)
  const [optimizedSources, setOptimizedSources] = useState([])
  
  const imgRef = useRef(null)
  const observerRef = useRef(null)
  const optimizationService = useRef(null)

  useEffect(() => {
    optimizationService.current = getImageOptimizationService()
  }, [])

  // Create optimized sources for different formats
  useEffect(() => {
    if (!src || !optimizationService.current) return

    const createOptimizedSources = async () => {
      try {
        const service = optimizationService.current
        
        // Check format support
        const sources = []
        
        // Add AVIF if supported
        if (service.supportsAVIF && format === 'auto') {
          sources.push({
            type: 'image/avif',
            srcSet: await generateSrcSet(src, 'avif', quality, sizes)
          })
        }
        
        // Add WebP if supported
        if (service.supportsWebP && format !== 'jpeg') {
          sources.push({
            type: 'image/webp',
            srcSet: await generateSrcSet(src, 'webp', quality, sizes)
          })
        }
        
        setOptimizedSources(sources)
      } catch (err) {
        console.warn('[OptimizedImage] Failed to create optimized sources:', err)
      }
    }

    createOptimizedSources()
  }, [src, format, quality, sizes])

  const generateSrcSet = async (imageSrc, targetFormat, imageQuality, imageSizes) => {
    if (!imageSizes) return imageSrc
    
    const srcSetEntries = await Promise.all(
      imageSizes.split(',').map(async (sizeEntry) => {
        const [url, descriptor] = sizeEntry.trim().split(' ')
        
        // For now, return original URL - in production, this would generate optimized versions
        return `${url} ${descriptor}`
      })
    )
    
    return srcSetEntries.join(', ')
  }

  // Intersection Observer for lazy loading
  useEffect(() => {
    if (!lazy || !imgRef.current) return

    const observerOptions = {
      root: null,
      rootMargin: '50px',
      threshold: 0.1
    }

    const observerCallback = (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          loadImage()
          if (observerRef.current) {
            observerRef.current.unobserve(entry.target)
          }
        }
      })
    }

    observerRef.current = new IntersectionObserver(observerCallback, observerOptions)
    observerRef.current.observe(imgRef.current)

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect()
      }
    }
  }, [lazy, src])

  // Load image immediately if not lazy
  useEffect(() => {
    if (!lazy) {
      loadImage()
    }
  }, [lazy, src])

  const loadImage = useCallback(async () => {
    if (!src || isLoaded) return

    setIsLoading(true)
    setError(null)

    try {
      // Create progressive loading stages
      if (progressive && !thumbnails) {
        await loadProgressively()
      } else {
        await loadDirectly()
      }
    } catch (err) {
      setError(err)
      setIsLoading(false)
      onError?.(err)
    }
  }, [src, progressive, thumbnails, isLoaded, onError])

  const loadProgressively = async () => {
    // Load low-quality version first if available
    if (blurDataURL) {
      setCurrentSrc(blurDataURL)
    }

    // Create a low-quality version for progressive loading
    const lowQualityImg = new Image()
    lowQualityImg.onload = () => {
      setCurrentSrc(lowQualityImg.src)
    }
    
    // In production, this would be a server-generated low-quality version
    lowQualityImg.src = src + '?quality=10&blur=2'
    
    // Then load the full quality version
    const fullQualityImg = new Image()
    fullQualityImg.onload = () => {
      setCurrentSrc(fullQualityImg.src)
      setIsLoaded(true)
      setIsLoading(false)
      onLoad?.(fullQualityImg)
    }
    
    fullQualityImg.onerror = (err) => {
      throw new Error(`Failed to load image: ${src}`)
    }
    
    fullQualityImg.src = src
  }

  const loadDirectly = async () => {
    const img = new Image()
    
    img.onload = () => {
      setCurrentSrc(img.src)
      setIsLoaded(true)
      setIsLoading(false)
      onLoad?.(img)
    }
    
    img.onerror = (err) => {
      throw new Error(`Failed to load image: ${src}`)
    }
    
    // Set srcset if provided
    if (srcSet) {
      img.srcset = srcSet
    }
    if (sizes) {
      img.sizes = sizes
    }
    
    img.src = src
  }

  const handleImageLoad = (event) => {
    if (!isLoaded) {
      setIsLoaded(true)
      setIsLoading(false)
      onLoad?.(event.target)
    }
  }

  const handleImageError = (event) => {
    setError(new Error('Image failed to load'))
    setIsLoading(false)
    onError?.(event.target)
  }

  const imageClasses = [
    'optimized-image',
    className,
    isLoading ? 'optimized-image--loading' : '',
    isLoaded ? 'optimized-image--loaded' : '',
    error ? 'optimized-image--error' : ''
  ].filter(Boolean).join(' ')

  const imageStyle = {
    ...style,
    opacity: isLoaded ? 1 : (currentSrc && currentSrc !== placeholder ? 0.1 : 0)
  }

  // If we have optimized sources, use a picture element
  if (optimizedSources.length > 0) {
    return (
      <picture className="optimized-picture">
        {optimizedSources.map((source, index) => (
          <source
            key={index}
            type={source.type}
            srcSet={source.srcSet}
            sizes={sizes}
          />
        ))}
        <img
          ref={imgRef}
          src={currentSrc || src}
          alt={alt}
          className={imageClasses}
          style={imageStyle}
          onLoad={handleImageLoad}
          onError={handleImageError}
          loading={lazy ? 'lazy' : 'eager'}
          decoding="async"
          {...props}
        />
        {isLoading && (
          <div className="optimized-image__loader">
            <div className="optimized-image__spinner" />
          </div>
        )}
        {error && (
          <div className="optimized-image__error">
            <span>Failed to load image</span>
          </div>
        )}
      </picture>
    )
  }

  // Fallback to regular img element
  return (
    <div className="optimized-image-container">
      <img
        ref={imgRef}
        src={currentSrc || src}
        srcSet={srcSet}
        sizes={sizes}
        alt={alt}
        className={imageClasses}
        style={imageStyle}
        onLoad={handleImageLoad}
        onError={handleImageError}
        loading={lazy ? 'lazy' : 'eager'}
        decoding="async"
        {...props}
      />
      {isLoading && (
        <div className="optimized-image__loader">
          <div className="optimized-image__spinner" />
        </div>
      )}
      {error && (
        <div className="optimized-image__error">
          <span>Failed to load image</span>
        </div>
      )}
    </div>
  )
}

// Avatar component with optimized loading
export const OptimizedAvatar = ({ 
  src, 
  alt, 
  size = 40, 
  className = '',
  fallback,
  ...props 
}) => {
  const [imageError, setImageError] = useState(false)
  
  const handleError = () => {
    setImageError(true)
  }
  
  if (imageError && fallback) {
    return fallback
  }
  
  return (
    <OptimizedImage
      src={src}
      alt={alt}
      className={`optimized-avatar ${className}`}
      style={{ width: size, height: size, borderRadius: '50%' }}
      onError={handleError}
      lazy={true}
      quality={90}
      format="webp"
      {...props}
    />
  )
}

// Thumbnail gallery component
export const OptimizedThumbnailGallery = ({ 
  images, 
  onImageClick,
  className = '' 
}) => {
  return (
    <div className={`optimized-gallery ${className}`}>
      {images.map((image, index) => (
        <div 
          key={index} 
          className="optimized-gallery__item"
          onClick={() => onImageClick?.(image, index)}
        >
          <OptimizedImage
            src={image.thumbnail || image.src}
            alt={image.alt || `Image ${index + 1}`}
            lazy={true}
            quality={80}
            format="webp"
            className="optimized-gallery__thumbnail"
          />
        </div>
      ))}
    </div>
  )
}

export default OptimizedImage