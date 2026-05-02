// API Response Compression Service for VoltChat
// Handles compression and decompression of API requests/responses

class ApiCompressionService {
  constructor() {
    this.compressionSupport = {
      gzip: false,
      deflate: false,
      brotli: false,
      lz4: false
    }
    
    this.config = {
      enableCompression: true,
      compressionThreshold: 1024, // 1KB minimum
      preferredEncoding: 'br', // Brotli preferred
      compressionLevel: 6, // 1-9 scale
      enableDecompressionWorker: true,
      cacheCompressedResponses: true,
      maxCacheSize: 50 * 1024 * 1024 // 50MB
    }
    
    // Performance tracking
    this.metrics = {
      requestsCompressed: 0,
      responsesDecompressed: 0,
      bytesBeforeCompression: 0,
      bytesAfterCompression: 0,
      compressionTime: 0,
      decompressionTime: 0,
      cacheHits: 0
    }
    
    // Compression cache
    this.compressionCache = new Map()
    this.decompressionCache = new Map()
    
    // WebAssembly modules for high-performance compression
    this.wasmModules = new Map()
    
    // Worker for background compression/decompression
    this.compressionWorker = null
    
    this.initialize()
  }

  async initialize() {
    // Detect browser compression support
    await this.detectCompressionSupport()
    
    // Initialize WebAssembly modules if available
    await this.initializeWasmModules()
    
    // Setup compression worker
    await this.setupCompressionWorker()
    
    // Setup automatic request/response interceptors
    this.setupInterceptors()
    
    console.log('[APICompression] API compression service initialized', {
      support: this.compressionSupport,
      preferredEncoding: this.config.preferredEncoding
    })
  }

  async detectCompressionSupport() {
    // Check for native compression streams
    if ('CompressionStream' in window) {
      try {
        const testStream = new CompressionStream('gzip')
        this.compressionSupport.gzip = true
        testStream.abort?.()
      } catch (e) {
        this.compressionSupport.gzip = false
      }
      
      try {
        const testStream = new CompressionStream('deflate')
        this.compressionSupport.deflate = true
        testStream.abort?.()
      } catch (e) {
        this.compressionSupport.deflate = false
      }
    }
    
    // Check for Brotli support
    if ('DecompressionStream' in window) {
      try {
        const testStream = new DecompressionStream('gzip')
        this.compressionSupport.brotli = true
        testStream.abort?.()
      } catch (e) {
        this.compressionSupport.brotli = false
      }
    }
    
    // Fallback detection through feature testing
    if (!this.compressionSupport.gzip) {
      this.compressionSupport.gzip = this.testCompressionSupport('gzip')
    }
  }

  testCompressionSupport(algorithm) {
    try {
      // Test if we can create the required objects
      switch (algorithm) {
        case 'gzip':
          return typeof pako !== 'undefined' || 'CompressionStream' in window
        case 'deflate':
          return typeof pako !== 'undefined' || 'CompressionStream' in window
        case 'brotli':
          return typeof BrotliDecode !== 'undefined'
        default:
          return false
      }
    } catch {
      return false
    }
  }

  async initializeWasmModules() {
    try {
      // Try to load high-performance WASM compression modules
      if (this.compressionSupport.brotli) {
        // Load Brotli WASM if available
        const brotliModule = await this.loadWasmModule('brotli')
        if (brotliModule) {
          this.wasmModules.set('brotli', brotliModule)
        }
      }
      
      if (this.compressionSupport.gzip) {
        // Load zlib WASM if available
        const zlibModule = await this.loadWasmModule('zlib')
        if (zlibModule) {
          this.wasmModules.set('zlib', zlibModule)
        }
      }
    } catch (error) {
      console.warn('[APICompression] WASM modules not available:', error)
    }
  }

  async loadWasmModule(name) {
    // In a real implementation, this would load actual WASM modules
    // For now, we'll simulate the interface
    return null
  }

  async setupCompressionWorker() {
    if (this.config.enableDecompressionWorker && 'Worker' in window) {
      try {
        // Create worker for background compression/decompression
        const workerCode = this.generateWorkerCode()
        const blob = new Blob([workerCode], { type: 'application/javascript' })
        const workerUrl = URL.createObjectURL(blob)
        
        this.compressionWorker = new Worker(workerUrl)
        
        this.compressionWorker.onmessage = (event) => {
          this.handleWorkerMessage(event)
        }
        
        this.compressionWorker.onerror = (error) => {
          console.error('[APICompression] Worker error:', error)
          this.compressionWorker = null
        }
        
        URL.revokeObjectURL(workerUrl)
      } catch (error) {
        console.warn('[APICompression] Could not create compression worker:', error)
      }
    }
  }

  generateWorkerCode() {
    return `
      // Compression Worker
      let pako = null;
      
      // Import compression library
      try {
        importScripts('https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js');
      } catch (e) {
        console.warn('Pako not available in worker');
      }
      
      self.onmessage = function(event) {
        const { id, operation, data, algorithm, options } = event.data;
        
        try {
          let result;
          
          if (operation === 'compress') {
            result = compress(data, algorithm, options);
          } else if (operation === 'decompress') {
            result = decompress(data, algorithm, options);
          }
          
          self.postMessage({
            id,
            success: true,
            result,
            originalSize: data.byteLength || data.length,
            compressedSize: result.byteLength || result.length
          });
        } catch (error) {
          self.postMessage({
            id,
            success: false,
            error: error.message
          });
        }
      };
      
      function compress(data, algorithm, options) {
        if (algorithm === 'gzip' && pako) {
          return pako.gzip(data, options);
        } else if (algorithm === 'deflate' && pako) {
          return pako.deflate(data, options);
        } else if ('CompressionStream' in self) {
          // Use native compression streams
          return compressWithStreams(data, algorithm);
        }
        throw new Error('Compression not supported: ' + algorithm);
      }
      
      function decompress(data, algorithm, options) {
        if (algorithm === 'gzip' && pako) {
          return pako.ungzip(data, options);
        } else if (algorithm === 'deflate' && pako) {
          return pako.inflate(data, options);
        } else if ('DecompressionStream' in self) {
          return decompressWithStreams(data, algorithm);
        }
        throw new Error('Decompression not supported: ' + algorithm);
      }
      
      async function compressWithStreams(data, algorithm) {
        const stream = new CompressionStream(algorithm);
        const writer = stream.writable.getWriter();
        const reader = stream.readable.getReader();
        
        writer.write(new Uint8Array(data));
        writer.close();
        
        const chunks = [];
        let done = false;
        
        while (!done) {
          const { value, done: readerDone } = await reader.read();
          done = readerDone;
          if (value) chunks.push(value);
        }
        
        return new Uint8Array(chunks.reduce((acc, chunk) => [...acc, ...chunk], []));
      }
      
      async function decompressWithStreams(data, algorithm) {
        const stream = new DecompressionStream(algorithm);
        const writer = stream.writable.getWriter();
        const reader = stream.readable.getReader();
        
        writer.write(new Uint8Array(data));
        writer.close();
        
        const chunks = [];
        let done = false;
        
        while (!done) {
          const { value, done: readerDone } = await reader.read();
          done = readerDone;
          if (value) chunks.push(value);
        }
        
        return new Uint8Array(chunks.reduce((acc, chunk) => [...acc, ...chunk], []));
      }
    `
  }

  setupInterceptors() {
    // Intercept fetch requests to add compression
    const originalFetch = window.fetch
    
    window.fetch = async (input, init = {}) => {
      const request = new Request(input, init)
      
      // Check if this is an API request that should be compressed
      if (this.shouldCompressRequest(request)) {
        const compressedInit = await this.compressRequest(init)
        return originalFetch(input, compressedInit)
      }
      
      const response = await originalFetch(input, init)
      
      // Check if response should be decompressed
      if (this.shouldDecompressResponse(response)) {
        return this.decompressResponse(response)
      }
      
      return response
    }
  }

  shouldCompressRequest(request) {
    // Only compress POST/PUT/PATCH requests to our API
    const method = request.method.toUpperCase()
    const url = request.url
    
    return (
      this.config.enableCompression &&
      ['POST', 'PUT', 'PATCH'].includes(method) &&
      url.includes('/api/') &&
      request.headers.get('content-type')?.includes('application/json')
    )
  }

  shouldDecompressResponse(response) {
    const contentEncoding = response.headers.get('content-encoding')
    return contentEncoding && ['gzip', 'deflate', 'br'].includes(contentEncoding)
  }

  async compressRequest(init) {
    if (!init.body) return init
    
    const body = init.body
    let data
    
    if (typeof body === 'string') {
      data = new TextEncoder().encode(body)
    } else if (body instanceof ArrayBuffer) {
      data = new Uint8Array(body)
    } else {
      return init // Can't compress
    }
    
    if (data.length < this.config.compressionThreshold) {
      return init // Too small to compress
    }
    
    const startTime = performance.now()
    
    try {
      const compressed = await this.compress(data, this.getOptimalCompressionAlgorithm())
      
      const compressionTime = performance.now() - startTime
      this.updateCompressionMetrics(data.length, compressed.length, compressionTime)
      
      return {
        ...init,
        body: compressed,
        headers: {
          ...init.headers,
          'Content-Encoding': this.config.preferredEncoding,
          'Content-Length': compressed.length.toString()
        }
      }
    } catch (error) {
      console.warn('[APICompression] Request compression failed:', error)
      return init
    }
  }

  async decompressResponse(response) {
    const contentEncoding = response.headers.get('content-encoding')
    
    if (!contentEncoding) return response
    
    const startTime = performance.now()
    
    try {
      const compressedData = await response.arrayBuffer()
      const decompressed = await this.decompress(new Uint8Array(compressedData), contentEncoding)
      
      const decompressionTime = performance.now() - startTime
      this.updateDecompressionMetrics(compressedData.byteLength, decompressed.length, decompressionTime)
      
      // Create new response with decompressed data
      const newResponse = new Response(decompressed, {
        status: response.status,
        statusText: response.statusText,
        headers: new Headers(response.headers)
      })
      
      // Remove compression headers
      newResponse.headers.delete('content-encoding')
      newResponse.headers.set('content-length', decompressed.length.toString())
      
      return newResponse
    } catch (error) {
      console.warn('[APICompression] Response decompression failed:', error)
      return response
    }
  }

  async compress(data, algorithm = 'gzip') {
    const cacheKey = this.generateCacheKey(data, algorithm, 'compress')
    
    if (this.compressionCache.has(cacheKey)) {
      this.metrics.cacheHits++
      return this.compressionCache.get(cacheKey)
    }
    
    let result
    
    // Try WASM first for best performance
    if (this.wasmModules.has(algorithm)) {
      result = await this.compressWithWasm(data, algorithm)
    }
    // Try worker for background processing
    else if (this.compressionWorker) {
      result = await this.compressWithWorker(data, algorithm)
    }
    // Fall back to main thread
    else {
      result = await this.compressMainThread(data, algorithm)
    }
    
    // Cache result
    if (this.compressionCache.size < this.config.maxCacheSize / 2) {
      this.compressionCache.set(cacheKey, result)
    }
    
    return result
  }

  async decompress(data, algorithm = 'gzip') {
    const cacheKey = this.generateCacheKey(data, algorithm, 'decompress')
    
    if (this.decompressionCache.has(cacheKey)) {
      this.metrics.cacheHits++
      return this.decompressionCache.get(cacheKey)
    }
    
    let result
    
    // Try WASM first
    if (this.wasmModules.has(algorithm)) {
      result = await this.decompressWithWasm(data, algorithm)
    }
    // Try worker
    else if (this.compressionWorker) {
      result = await this.decompressWithWorker(data, algorithm)
    }
    // Fall back to main thread
    else {
      result = await this.decompressMainThread(data, algorithm)
    }
    
    // Cache result
    if (this.decompressionCache.size < this.config.maxCacheSize / 2) {
      this.decompressionCache.set(cacheKey, result)
    }
    
    return result
  }

  async compressWithWasm(data, algorithm) {
    const module = this.wasmModules.get(algorithm)
    // Implementation would use actual WASM module
    return this.compressMainThread(data, algorithm)
  }

  async decompressWithWasm(data, algorithm) {
    const module = this.wasmModules.get(algorithm)
    // Implementation would use actual WASM module
    return this.decompressMainThread(data, algorithm)
  }

  async compressWithWorker(data, algorithm) {
    return new Promise((resolve, reject) => {
      const id = this.generateRequestId()
      
      const timeout = setTimeout(() => {
        reject(new Error('Compression timeout'))
      }, 5000)
      
      const handler = (event) => {
        if (event.data.id === id) {
          clearTimeout(timeout)
          this.compressionWorker.removeEventListener('message', handler)
          
          if (event.data.success) {
            resolve(event.data.result)
          } else {
            reject(new Error(event.data.error))
          }
        }
      }
      
      this.compressionWorker.addEventListener('message', handler)
      
      this.compressionWorker.postMessage({
        id,
        operation: 'compress',
        data,
        algorithm,
        options: { level: this.config.compressionLevel }
      })
    })
  }

  async decompressWithWorker(data, algorithm) {
    return new Promise((resolve, reject) => {
      const id = this.generateRequestId()
      
      const timeout = setTimeout(() => {
        reject(new Error('Decompression timeout'))
      }, 5000)
      
      const handler = (event) => {
        if (event.data.id === id) {
          clearTimeout(timeout)
          this.compressionWorker.removeEventListener('message', handler)
          
          if (event.data.success) {
            resolve(event.data.result)
          } else {
            reject(new Error(event.data.error))
          }
        }
      }
      
      this.compressionWorker.addEventListener('message', handler)
      
      this.compressionWorker.postMessage({
        id,
        operation: 'decompress',
        data,
        algorithm
      })
    })
  }

  async compressMainThread(data, algorithm) {
    switch (algorithm) {
      case 'gzip':
        if ('CompressionStream' in window) {
          return this.compressWithStreams(data, 'gzip')
        } else if (typeof pako !== 'undefined') {
          return pako.gzip(data, { level: this.config.compressionLevel })
        }
        break
      
      case 'deflate':
        if ('CompressionStream' in window) {
          return this.compressWithStreams(data, 'deflate')
        } else if (typeof pako !== 'undefined') {
          return pako.deflate(data, { level: this.config.compressionLevel })
        }
        break
      
      case 'br':
      case 'brotli':
        if (typeof BrotliCompress !== 'undefined') {
          return BrotliCompress(data)
        }
        break
    }
    
    throw new Error(`Compression algorithm not supported: ${algorithm}`)
  }

  async decompressMainThread(data, algorithm) {
    switch (algorithm) {
      case 'gzip':
        if ('DecompressionStream' in window) {
          return this.decompressWithStreams(data, 'gzip')
        } else if (typeof pako !== 'undefined') {
          return pako.ungzip(data)
        }
        break
      
      case 'deflate':
        if ('DecompressionStream' in window) {
          return this.decompressWithStreams(data, 'deflate')
        } else if (typeof pako !== 'undefined') {
          return pako.inflate(data)
        }
        break
      
      case 'br':
      case 'brotli':
        if (typeof BrotliDecode !== 'undefined') {
          return BrotliDecode(data)
        }
        break
    }
    
    throw new Error(`Decompression algorithm not supported: ${algorithm}`)
  }

  async compressWithStreams(data, algorithm) {
    const stream = new CompressionStream(algorithm)
    const writer = stream.writable.getWriter()
    const reader = stream.readable.getReader()
    
    writer.write(data)
    writer.close()
    
    const chunks = []
    let done = false
    
    while (!done) {
      const { value, done: readerDone } = await reader.read()
      done = readerDone
      if (value) chunks.push(value)
    }
    
    return new Uint8Array(chunks.reduce((acc, chunk) => [...acc, ...chunk], []))
  }

  async decompressWithStreams(data, algorithm) {
    const stream = new DecompressionStream(algorithm)
    const writer = stream.writable.getWriter()
    const reader = stream.readable.getReader()
    
    writer.write(data)
    writer.close()
    
    const chunks = []
    let done = false
    
    while (!done) {
      const { value, done: readerDone } = await reader.read()
      done = readerDone
      if (value) chunks.push(value)
    }
    
    return new Uint8Array(chunks.reduce((acc, chunk) => [...acc, ...chunk], []))
  }

  getOptimalCompressionAlgorithm() {
    // Choose best algorithm based on support and performance
    if (this.compressionSupport.brotli && this.config.preferredEncoding === 'br') {
      return 'brotli'
    } else if (this.compressionSupport.gzip) {
      return 'gzip'
    } else if (this.compressionSupport.deflate) {
      return 'deflate'
    }
    
    return 'gzip' // Fallback
  }

  generateCacheKey(data, algorithm, operation) {
    const dataHash = this.hashArrayBuffer(data)
    return `${operation}_${algorithm}_${dataHash}`
  }

  generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  hashArrayBuffer(data) {
    let hash = 0
    const view = new Uint8Array(data)
    
    for (let i = 0; i < Math.min(view.length, 1000); i++) {
      hash = ((hash << 5) - hash + view[i]) & 0xffffffff
    }
    
    return hash.toString(36)
  }

  updateCompressionMetrics(originalSize, compressedSize, time) {
    this.metrics.requestsCompressed++
    this.metrics.bytesBeforeCompression += originalSize
    this.metrics.bytesAfterCompression += compressedSize
    this.metrics.compressionTime += time
  }

  updateDecompressionMetrics(compressedSize, originalSize, time) {
    this.metrics.responsesDecompressed++
    this.metrics.decompressionTime += time
  }

  handleWorkerMessage(event) {
    // Worker message handling is done in the compress/decompress promises
  }

  // Public API
  getCompressionSupport() {
    return { ...this.compressionSupport }
  }

  getMetrics() {
    const totalBytes = this.metrics.bytesBeforeCompression
    const savedBytes = totalBytes - this.metrics.bytesAfterCompression
    const compressionRatio = totalBytes > 0 ? (savedBytes / totalBytes * 100).toFixed(1) : '0'
    
    return {
      ...this.metrics,
      compressionRatio: `${compressionRatio}%`,
      averageCompressionTime: (this.metrics.compressionTime / Math.max(1, this.metrics.requestsCompressed)).toFixed(2),
      averageDecompressionTime: (this.metrics.decompressionTime / Math.max(1, this.metrics.responsesDecompressed)).toFixed(2),
      bytesSaved: savedBytes,
      cacheSize: this.compressionCache.size + this.decompressionCache.size
    }
  }

  clearCache() {
    this.compressionCache.clear()
    this.decompressionCache.clear()
  }

  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig }
  }

  // Cleanup
  destroy() {
    if (this.compressionWorker) {
      this.compressionWorker.terminate()
      this.compressionWorker = null
    }
    
    this.clearCache()
  }
}

export default ApiCompressionService