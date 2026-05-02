// Image Optimization Service for VoltChat
// Handles WebP conversion, compression, and progressive loading

class ImageOptimizationService {
  constructor() {
    this.canvas = null
    this.context = null
    this.supportsWebP = null
    this.supportsAVIF = null
    this.compressionCache = new Map()
    this.optimizationQueue = []
    this.isProcessing = false
    
    // Optimization settings
    this.settings = {
      webp: {
        quality: 0.85,
        method: 4, // 0-6, higher = better compression
        autoFilter: true
      },
      jpeg: {
        quality: 0.85,
        progressive: true
      },
      png: {
        quality: 0.9,
        compressionLevel: 6
      },
      thumbnails: {
        sizes: [64, 128, 256, 512],
        quality: 0.8
      }
    }
    
    // Performance metrics
    this.metrics = {
      conversions: 0,
      totalSavings: 0,
      averageCompressionRatio: 0,
      cacheHits: 0
    }
    
    this.initialize()
  }

  async initialize() {
    // Create canvas for image processing
    this.canvas = document.createElement('canvas')
    this.context = this.canvas.getContext('2d')
    
    // Detect format support
    await this.detectFormatSupport()
    
    console.log('[ImageOpt] Initialized with support:', {
      webp: this.supportsWebP,
      avif: this.supportsAVIF
    })
  }

  async detectFormatSupport() {
    // Test WebP support
    this.supportsWebP = await this.testImageFormat('data:image/webp;base64,UklGRjoAAABXRUJQVlA4IC4AAACyAgCdASoCAAIALmk0mk0iIiIiIgBoSygABc6WWgAA/veff/0PP8bA//LwYAAA')
    
    // Test AVIF support  
    this.supportsAVIF = await this.testImageFormat('data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAABUAAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAIAAAACAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQ0MAAAAABNjb2xybmNseAACAAIAAYAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAACVtZGF0EgAKCBgABogQEAwgMgkQAAAAB8dSLfI=')
  }

  async testImageFormat(dataUrl) {
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => resolve(true)
      img.onerror = () => resolve(false)
      img.src = dataUrl
    })
  }

  // Main optimization function
  async optimizeImage(file, options = {}) {
    const startTime = performance.now()
    const originalSize = file.size
    
    try {
      // Check cache first
      const cacheKey = this.generateCacheKey(file, options)
      if (this.compressionCache.has(cacheKey)) {
        this.metrics.cacheHits++
        return this.compressionCache.get(cacheKey)
      }

      const config = { ...this.settings, ...options }
      let result

      // Load image
      const img = await this.loadImage(file)
      
      // Determine best format
      const targetFormat = this.getBestFormat(file.type, config)
      
      // Generate optimized versions
      if (config.generateThumbnails) {
        result = await this.generateThumbnails(img, targetFormat, config)
      } else {
        result = await this.compressImage(img, targetFormat, config)
      }
      
      // Update metrics
      const compressionRatio = originalSize / result.size
      this.updateMetrics(originalSize, result.size, compressionRatio)
      
      // Cache result
      this.compressionCache.set(cacheKey, result)
      
      const processingTime = performance.now() - startTime
      console.log(`[ImageOpt] Optimized ${file.name}: ${originalSize}B -> ${result.size}B (${(compressionRatio * 100 - 100).toFixed(1)}% savings, ${processingTime.toFixed(2)}ms)`)
      
      return result
      
    } catch (error) {
      console.error('[ImageOpt] Optimization failed:', error)
      return {
        blob: file,
        format: file.type,
        size: file.size,
        error: error.message
      }
    }
  }

  async loadImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = reject
      
      if (file instanceof File) {
        const reader = new FileReader()
        reader.onload = (e) => { img.src = e.target.result }
        reader.readAsDataURL(file)
      } else {
        img.src = file
      }
    })
  }

  getBestFormat(originalFormat, config) {
    // AVIF is best but has limited support
    if (this.supportsAVIF && config.preferAVIF) {
      return 'image/avif'
    }
    
    // WebP is widely supported and efficient
    if (this.supportsWebP && originalFormat !== 'image/gif') {
      return 'image/webp'
    }
    
    // Fall back to original or JPEG
    if (originalFormat === 'image/png' && config.convertPNGtoJPEG) {
      return 'image/jpeg'
    }
    
    return originalFormat
  }

  async compressImage(img, format, config) {
    const { width, height } = this.calculateDimensions(img, config)
    
    // Set canvas dimensions
    this.canvas.width = width
    this.canvas.height = height
    
    // Clear and draw image
    this.context.clearRect(0, 0, width, height)
    this.context.drawImage(img, 0, 0, width, height)
    
    // Get quality setting for format
    const quality = this.getQualityForFormat(format, config)
    
    // Convert to blob
    return new Promise((resolve) => {
      this.canvas.toBlob((blob) => {
        resolve({
          blob,
          format,
          width,
          height,
          size: blob.size,
          quality
        })
      }, format, quality)
    })
  }

  async generateThumbnails(img, format, config) {
    const thumbnails = []
    const originalDimensions = { width: img.width, height: img.height }
    
    for (const size of config.thumbnails.sizes) {
      const dimensions = this.calculateThumbnailDimensions(img, size)
      
      this.canvas.width = dimensions.width
      this.canvas.height = dimensions.height
      
      this.context.clearRect(0, 0, dimensions.width, dimensions.height)
      this.context.drawImage(img, 0, 0, dimensions.width, dimensions.height)
      
      const quality = config.thumbnails.quality || this.getQualityForFormat(format, config)
      
      const blob = await new Promise((resolve) => {
        this.canvas.toBlob(resolve, format, quality)
      })
      
      thumbnails.push({
        blob,
        format,
        size: blob.size,
        width: dimensions.width,
        height: dimensions.height,
        quality,
        thumbnailSize: size
      })
    }
    
    return {
      original: originalDimensions,
      thumbnails,
      format
    }
  }

  calculateDimensions(img, config) {
    let { width, height } = img
    
    // Apply max dimensions
    if (config.maxWidth && width > config.maxWidth) {
      height = (height * config.maxWidth) / width
      width = config.maxWidth
    }
    
    if (config.maxHeight && height > config.maxHeight) {
      width = (width * config.maxHeight) / height
      height = config.maxHeight
    }
    
    // Apply resize factor
    if (config.resizeFactor && config.resizeFactor !== 1) {
      width *= config.resizeFactor
      height *= config.resizeFactor
    }
    
    // Ensure even dimensions for better compression
    width = Math.round(width / 2) * 2
    height = Math.round(height / 2) * 2
    
    return { width, height }
  }

  calculateThumbnailDimensions(img, maxSize) {
    const { width: originalWidth, height: originalHeight } = img
    const aspectRatio = originalWidth / originalHeight
    
    let width, height
    
    if (originalWidth > originalHeight) {
      width = Math.min(maxSize, originalWidth)
      height = width / aspectRatio
    } else {
      height = Math.min(maxSize, originalHeight)
      width = height * aspectRatio
    }
    
    return {
      width: Math.round(width / 2) * 2,
      height: Math.round(height / 2) * 2
    }
  }

  getQualityForFormat(format, config) {
    switch (format) {
      case 'image/webp':
        return config.webp?.quality || 0.85
      case 'image/jpeg':
        return config.jpeg?.quality || 0.85
      case 'image/avif':
        return config.avif?.quality || 0.8
      default:
        return 0.9
    }
  }

  generateCacheKey(file, options) {
    const fileHash = `${file.name}-${file.size}-${file.lastModified}`
    const optionsHash = JSON.stringify(options)
    return `${fileHash}-${btoa(optionsHash)}`
  }

  // Queue-based processing for multiple images
  queueOptimization(file, options = {}) {
    return new Promise((resolve, reject) => {
      this.optimizationQueue.push({
        file,
        options,
        resolve,
        reject
      })
      
      if (!this.isProcessing) {
        this.processQueue()
      }
    })
  }

  async processQueue() {
    if (this.isProcessing || this.optimizationQueue.length === 0) {
      return
    }
    
    this.isProcessing = true
    
    while (this.optimizationQueue.length > 0) {
      const task = this.optimizationQueue.shift()
      
      try {
        const result = await this.optimizeImage(task.file, task.options)
        task.resolve(result)
      } catch (error) {
        task.reject(error)
      }
    }
    
    this.isProcessing = false
  }

  // Create progressive JPEG
  async createProgressiveJPEG(img, quality = 0.85) {
    return new Promise((resolve) => {
      this.canvas.width = img.width
      this.canvas.height = img.height
      this.context.drawImage(img, 0, 0)
      
      // Create multiple quality versions
      const qualities = [0.1, 0.3, 0.6, quality]
      const progressiveImages = []
      
      let processed = 0
      
      qualities.forEach((q, index) => {
        this.canvas.toBlob((blob) => {
          progressiveImages[index] = {
            blob,
            quality: q,
            size: blob.size
          }
          
          processed++
          if (processed === qualities.length) {
            resolve(progressiveImages)
          }
        }, 'image/jpeg', q)
      })
    })
  }

  // Convert image to Data URL for caching
  async toDataURL(file, format, quality) {
    const img = await this.loadImage(file)
    const result = await this.compressImage(img, format, { quality })
    
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.readAsDataURL(result.blob)
    })
  }

  // Batch optimize multiple images
  async batchOptimize(files, options = {}) {
    const results = []
    const batchSize = options.batchSize || 3
    
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize)
      
      const batchPromises = batch.map(file => 
        this.queueOptimization(file, options)
      )
      
      const batchResults = await Promise.allSettled(batchPromises)
      results.push(...batchResults)
    }
    
    return results
  }

  // Smart format detection and recommendation
  recommendOptimizations(file) {
    const recommendations = {
      format: file.type,
      quality: 0.85,
      resize: false,
      thumbnails: false
    }
    
    // Large images should be resized
    if (file.size > 2 * 1024 * 1024) { // 2MB
      recommendations.resize = true
      recommendations.maxWidth = 1920
      recommendations.maxHeight = 1080
    }
    
    // PNG images often benefit from WebP conversion
    if (file.type === 'image/png' && this.supportsWebP) {
      recommendations.format = 'image/webp'
      recommendations.quality = 0.9
    }
    
    // Large JPEG images can use progressive loading
    if (file.type === 'image/jpeg' && file.size > 500 * 1024) {
      recommendations.progressive = true
    }
    
    // Profile pictures should have thumbnails
    if (file.name.toLowerCase().includes('avatar') || 
        file.name.toLowerCase().includes('profile')) {
      recommendations.thumbnails = true
    }
    
    return recommendations
  }

  updateMetrics(originalSize, newSize, compressionRatio) {
    this.metrics.conversions++
    this.metrics.totalSavings += (originalSize - newSize)
    
    const currentAvg = this.metrics.averageCompressionRatio
    this.metrics.averageCompressionRatio = 
      ((currentAvg * (this.metrics.conversions - 1)) + compressionRatio) / this.metrics.conversions
  }

  // Get service metrics
  getMetrics() {
    return {
      ...this.metrics,
      formatSupport: {
        webp: this.supportsWebP,
        avif: this.supportsAVIF
      },
      cacheSize: this.compressionCache.size,
      queueLength: this.optimizationQueue.length
    }
  }

  // Clear optimization cache
  clearCache() {
    this.compressionCache.clear()
  }
}

// Utility functions for WebP detection and polyfill
export const detectWebPSupport = async () => {
  return new Promise((resolve) => {
    const webP = new Image()
    webP.onload = webP.onerror = () => {
      resolve(webP.height === 2)
    }
    webP.src = 'data:image/webp;base64,UklGRjoAAABXRUJQVlA4IC4AAACyAgCdASoCAAIALmk0mk0iIiIiIgBoSygABc6WWgAA/veff/0PP8bA//LwYAAA'
  })
}

// Create srcset for responsive images
export const createSrcSet = (thumbnails, baseUrl = '') => {
  return thumbnails
    .map(thumb => `${baseUrl}${thumb.url} ${thumb.width}w`)
    .join(', ')
}

// Get optimal image size for container
export const getOptimalImageSize = (containerWidth, availableSizes) => {
  // Account for device pixel ratio
  const targetWidth = containerWidth * (window.devicePixelRatio || 1)
  
  // Find the smallest size that's larger than target
  const optimal = availableSizes
    .filter(size => size >= targetWidth)
    .sort((a, b) => a - b)[0]
  
  // If no size is large enough, use the largest available
  return optimal || Math.max(...availableSizes)
}

// Singleton instance
let imageOptimizationService = null

export const getImageOptimizationService = () => {
  if (!imageOptimizationService) {
    imageOptimizationService = new ImageOptimizationService()
  }
  return imageOptimizationService
}

export default ImageOptimizationService