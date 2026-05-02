// Web Worker Optimization Service for VoltChat
// Offloads JavaScript execution to web workers for better main thread performance

class WebWorkerOptimizationService {
  constructor() {
    this.workers = new Map() // workerType -> WorkerPool
    this.tasks = new Map() // taskId -> task metadata
    this.workerScripts = new Map() // workerType -> script content
    this.taskQueue = []
    this.isProcessingQueue = false
    
    // Configuration
    this.config = {
      maxWorkers: navigator.hardwareConcurrency || 4,
      workerTimeout: 30000, // 30 seconds
      enableTaskBatching: true,
      batchSize: 10,
      retryAttempts: 3,
      enablePersistentWorkers: true,
      enableSharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
      enableTransferableObjects: true
    }
    
    // Task types and their worker assignments
    this.taskTypes = {
      'message-processing': {
        workerType: 'message',
        persistent: true,
        maxConcurrent: 2
      },
      'search-indexing': {
        workerType: 'search',
        persistent: true,
        maxConcurrent: 1
      },
      'image-processing': {
        workerType: 'image',
        persistent: false,
        maxConcurrent: 2
      },
      'data-processing': {
        workerType: 'data',
        persistent: true,
        maxConcurrent: 2
      },
      'compression': {
        workerType: 'compression',
        persistent: false,
        maxConcurrent: 1
      },
      'encryption': {
        workerType: 'crypto',
        persistent: true,
        maxConcurrent: 1
      }
    }
    
    // Performance tracking
    this.metrics = {
      tasksExecuted: 0,
      tasksSuccessful: 0,
      tasksFailed: 0,
      totalExecutionTime: 0,
      averageExecutionTime: 0,
      workersCreated: 0,
      workersTerminated: 0,
      mainThreadTimeSaved: 0
    }
    
    this.initialize()
  }

  async initialize() {
    // Generate worker scripts
    this.generateWorkerScripts()
    
    // Initialize persistent worker pools
    await this.initializePersistentWorkers()
    
    // Setup task processing
    this.setupTaskProcessing()
    
    // Setup performance monitoring
    this.setupPerformanceMonitoring()
    
    // Setup cleanup routines
    this.setupCleanup()
    
    console.log('[WebWorkerOpt] Web Worker optimization service initialized')
  }

  generateWorkerScripts() {
    // Message processing worker
    this.workerScripts.set('message', this.generateMessageWorkerScript())
    
    // Search indexing worker
    this.workerScripts.set('search', this.generateSearchWorkerScript())
    
    // Image processing worker
    this.workerScripts.set('image', this.generateImageWorkerScript())
    
    // Data processing worker
    this.workerScripts.set('data', this.generateDataWorkerScript())
    
    // Compression worker
    this.workerScripts.set('compression', this.generateCompressionWorkerScript())
    
    // Cryptography worker
    this.workerScripts.set('crypto', this.generateCryptoWorkerScript())
  }

  generateMessageWorkerScript() {
    return `
      // Message Processing Worker
      let messageBuffer = [];
      let processingBatch = false;
      
      class MessageProcessor {
        static processMessage(message) {
          try {
            // Parse and validate message
            const processed = {
              id: message.id,
              content: this.sanitizeContent(message.content),
              mentions: this.extractMentions(message.content),
              links: this.extractLinks(message.content),
              timestamp: Date.now(),
              wordCount: this.getWordCount(message.content),
              sentiment: this.analyzeSentiment(message.content)
            };
            
            return processed;
          } catch (error) {
            throw new Error(\`Message processing failed: \${error.message}\`);
          }
        }
        
        static sanitizeContent(content) {
          // Remove potentially harmful content
          return content
            .replace(/<script[^>]*>.*?<\\/script>/gi, '')
            .replace(/javascript:/gi, '')
            .replace(/on\\w+\\s*=/gi, '');
        }
        
        static extractMentions(content) {
          const mentionRegex = /@([a-zA-Z0-9_]+)/g;
          const mentions = [];
          let match;
          
          while ((match = mentionRegex.exec(content)) !== null) {
            mentions.push(match[1]);
          }
          
          return mentions;
        }
        
        static extractLinks(content) {
          const urlRegex = /(https?:\\/\\/[^\\s]+)/g;
          return content.match(urlRegex) || [];
        }
        
        static getWordCount(content) {
          return content.split(/\\s+/).filter(word => word.length > 0).length;
        }
        
        static analyzeSentiment(content) {
          // Simple sentiment analysis
          const positiveWords = ['good', 'great', 'awesome', 'love', 'like', 'happy', 'thanks'];
          const negativeWords = ['bad', 'hate', 'terrible', 'awful', 'sad', 'angry', 'stupid'];
          
          const words = content.toLowerCase().split(/\\s+/);
          let score = 0;
          
          words.forEach(word => {
            if (positiveWords.includes(word)) score += 1;
            if (negativeWords.includes(word)) score -= 1;
          });
          
          if (score > 0) return 'positive';
          if (score < 0) return 'negative';
          return 'neutral';
        }
        
        static processBatch(messages) {
          return messages.map(msg => this.processMessage(msg));
        }
      }
      
      self.onmessage = function(event) {
        const { taskId, type, data, options } = event.data;
        
        try {
          let result;
          
          switch (type) {
            case 'process-message':
              result = MessageProcessor.processMessage(data);
              break;
            case 'process-batch':
              result = MessageProcessor.processBatch(data);
              break;
            default:
              throw new Error(\`Unknown task type: \${type}\`);
          }
          
          self.postMessage({
            taskId,
            success: true,
            result,
            executionTime: Date.now() - (event.data.startTime || Date.now())
          });
        } catch (error) {
          self.postMessage({
            taskId,
            success: false,
            error: error.message
          });
        }
      };
    `
  }

  generateSearchWorkerScript() {
    return `
      // Search Indexing Worker
      let searchIndex = new Map();
      let documents = new Map();
      
      class SearchIndexer {
        static buildIndex(documents) {
          const index = new Map();
          
          documents.forEach((doc, id) => {
            const tokens = this.tokenize(doc.content);
            
            tokens.forEach(token => {
              if (!index.has(token)) {
                index.set(token, new Set());
              }
              index.get(token).add(id);
            });
          });
          
          return index;
        }
        
        static tokenize(content) {
          return content
            .toLowerCase()
            .replace(/[^\\w\\s]/g, ' ')
            .split(/\\s+/)
            .filter(token => token.length > 2);
        }
        
        static search(query, index, documents, limit = 10) {
          const tokens = this.tokenize(query);
          const scores = new Map();
          
          tokens.forEach(token => {
            const docIds = index.get(token) || new Set();
            
            docIds.forEach(docId => {
              const score = scores.get(docId) || 0;
              scores.set(docId, score + 1);
            });
          });
          
          const results = Array.from(scores.entries())
            .sort(([,a], [,b]) => b - a)
            .slice(0, limit)
            .map(([docId, score]) => ({
              id: docId,
              score,
              document: documents.get(docId)
            }));
          
          return results;
        }
        
        static addDocument(id, document) {
          documents.set(id, document);
          
          const tokens = this.tokenize(document.content);
          tokens.forEach(token => {
            if (!searchIndex.has(token)) {
              searchIndex.set(token, new Set());
            }
            searchIndex.get(token).add(id);
          });
        }
        
        static removeDocument(id) {
          const document = documents.get(id);
          if (!document) return;
          
          const tokens = this.tokenize(document.content);
          tokens.forEach(token => {
            const docIds = searchIndex.get(token);
            if (docIds) {
              docIds.delete(id);
              if (docIds.size === 0) {
                searchIndex.delete(token);
              }
            }
          });
          
          documents.delete(id);
        }
      }
      
      self.onmessage = function(event) {
        const { taskId, type, data } = event.data;
        
        try {
          let result;
          
          switch (type) {
            case 'build-index':
              searchIndex = SearchIndexer.buildIndex(new Map(data.documents));
              documents = new Map(data.documents);
              result = { indexSize: searchIndex.size };
              break;
            case 'search':
              result = SearchIndexer.search(data.query, searchIndex, documents, data.limit);
              break;
            case 'add-document':
              SearchIndexer.addDocument(data.id, data.document);
              result = { success: true };
              break;
            case 'remove-document':
              SearchIndexer.removeDocument(data.id);
              result = { success: true };
              break;
            default:
              throw new Error(\`Unknown task type: \${type}\`);
          }
          
          self.postMessage({
            taskId,
            success: true,
            result
          });
        } catch (error) {
          self.postMessage({
            taskId,
            success: false,
            error: error.message
          });
        }
      };
    `
  }

  generateImageWorkerScript() {
    return `
      // Image Processing Worker
      class ImageProcessor {
        static async processImage(imageData, options = {}) {
          const {
            resize = false,
            width = 100,
            height = 100,
            quality = 0.8,
            format = 'webp'
          } = options;
          
          // Create canvas in worker context
          const canvas = new OffscreenCanvas(width, height);
          const ctx = canvas.getContext('2d');
          
          // Create image bitmap
          const imageBitmap = await createImageBitmap(imageData);
          
          // Draw and resize
          ctx.drawImage(imageBitmap, 0, 0, width, height);
          
          // Convert to blob
          const blob = await canvas.convertToBlob({
            type: \`image/\${format}\`,
            quality
          });
          
          return blob;
        }
        
        static async generateThumbnail(imageData, size = 64) {
          return this.processImage(imageData, {
            resize: true,
            width: size,
            height: size,
            quality: 0.7,
            format: 'webp'
          });
        }
        
        static async compressImage(imageData, quality = 0.8) {
          const canvas = new OffscreenCanvas(imageData.width, imageData.height);
          const ctx = canvas.getContext('2d');
          
          const imageBitmap = await createImageBitmap(imageData);
          ctx.drawImage(imageBitmap, 0, 0);
          
          return canvas.convertToBlob({
            type: 'image/webp',
            quality
          });
        }
      }
      
      self.onmessage = async function(event) {
        const { taskId, type, data, options } = event.data;
        
        try {
          let result;
          
          switch (type) {
            case 'process-image':
              result = await ImageProcessor.processImage(data, options);
              break;
            case 'generate-thumbnail':
              result = await ImageProcessor.generateThumbnail(data, options.size);
              break;
            case 'compress-image':
              result = await ImageProcessor.compressImage(data, options.quality);
              break;
            default:
              throw new Error(\`Unknown task type: \${type}\`);
          }
          
          self.postMessage({
            taskId,
            success: true,
            result
          }, result instanceof Blob ? [result] : []);
        } catch (error) {
          self.postMessage({
            taskId,
            success: false,
            error: error.message
          });
        }
      };
    `
  }

  generateDataWorkerScript() {
    return `
      // Data Processing Worker
      class DataProcessor {
        static sortLargeArray(array, key, order = 'asc') {
          return array.sort((a, b) => {
            const aVal = key ? a[key] : a;
            const bVal = key ? b[key] : b;
            
            if (order === 'asc') {
              return aVal > bVal ? 1 : -1;
            } else {
              return aVal < bVal ? 1 : -1;
            }
          });
        }
        
        static filterLargeDataset(data, predicate) {
          return data.filter(predicate);
        }
        
        static aggregateData(data, groupBy, aggregateFn) {
          const groups = new Map();
          
          data.forEach(item => {
            const key = typeof groupBy === 'function' ? groupBy(item) : item[groupBy];
            
            if (!groups.has(key)) {
              groups.set(key, []);
            }
            groups.get(key).push(item);
          });
          
          const result = {};
          for (const [key, items] of groups) {
            result[key] = aggregateFn(items);
          }
          
          return result;
        }
        
        static transformData(data, transformer) {
          return data.map(transformer);
        }
        
        static calculateStatistics(numbers) {
          const sorted = numbers.slice().sort((a, b) => a - b);
          const length = numbers.length;
          
          return {
            count: length,
            sum: numbers.reduce((a, b) => a + b, 0),
            mean: numbers.reduce((a, b) => a + b, 0) / length,
            median: length % 2 === 0 
              ? (sorted[length / 2 - 1] + sorted[length / 2]) / 2
              : sorted[Math.floor(length / 2)],
            min: Math.min(...numbers),
            max: Math.max(...numbers)
          };
        }
      }
      
      self.onmessage = function(event) {
        const { taskId, type, data, options } = event.data;
        
        try {
          let result;
          
          switch (type) {
            case 'sort-array':
              result = DataProcessor.sortLargeArray(data.array, data.key, data.order);
              break;
            case 'filter-data':
              const predicate = new Function('item', data.predicateCode);
              result = DataProcessor.filterLargeDataset(data.dataset, predicate);
              break;
            case 'aggregate-data':
              const aggregateFn = new Function('items', data.aggregateCode);
              result = DataProcessor.aggregateData(data.dataset, data.groupBy, aggregateFn);
              break;
            case 'transform-data':
              const transformer = new Function('item', data.transformerCode);
              result = DataProcessor.transformData(data.dataset, transformer);
              break;
            case 'calculate-stats':
              result = DataProcessor.calculateStatistics(data.numbers);
              break;
            default:
              throw new Error(\`Unknown task type: \${type}\`);
          }
          
          self.postMessage({
            taskId,
            success: true,
            result
          });
        } catch (error) {
          self.postMessage({
            taskId,
            success: false,
            error: error.message
          });
        }
      };
    `
  }

  generateCompressionWorkerScript() {
    return `
      // Compression Worker
      importScripts('https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js');
      
      class CompressionProcessor {
        static compress(data, algorithm = 'gzip') {
          try {
            switch (algorithm) {
              case 'gzip':
                return pako.gzip(data);
              case 'deflate':
                return pako.deflate(data);
              default:
                throw new Error(\`Unsupported algorithm: \${algorithm}\`);
            }
          } catch (error) {
            throw new Error(\`Compression failed: \${error.message}\`);
          }
        }
        
        static decompress(data, algorithm = 'gzip') {
          try {
            switch (algorithm) {
              case 'gzip':
                return pako.ungzip(data);
              case 'deflate':
                return pako.inflate(data);
              default:
                throw new Error(\`Unsupported algorithm: \${algorithm}\`);
            }
          } catch (error) {
            throw new Error(\`Decompression failed: \${error.message}\`);
          }
        }
      }
      
      self.onmessage = function(event) {
        const { taskId, type, data, options } = event.data;
        
        try {
          let result;
          
          switch (type) {
            case 'compress':
              result = CompressionProcessor.compress(data, options.algorithm);
              break;
            case 'decompress':
              result = CompressionProcessor.decompress(data, options.algorithm);
              break;
            default:
              throw new Error(\`Unknown task type: \${type}\`);
          }
          
          self.postMessage({
            taskId,
            success: true,
            result
          }, result.buffer ? [result.buffer] : []);
        } catch (error) {
          self.postMessage({
            taskId,
            success: false,
            error: error.message
          });
        }
      };
    `
  }

  generateCryptoWorkerScript() {
    return `
      // Cryptography Worker
      class CryptoProcessor {
        static async generateHash(data, algorithm = 'SHA-256') {
          const encoder = new TextEncoder();
          const dataBuffer = encoder.encode(data);
          const hashBuffer = await crypto.subtle.digest(algorithm, dataBuffer);
          
          return Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
        }
        
        static async generateRandomBytes(length) {
          const buffer = new Uint8Array(length);
          crypto.getRandomValues(buffer);
          return Array.from(buffer);
        }
        
        static async deriveKey(password, salt) {
          const encoder = new TextEncoder();
          const passwordBuffer = encoder.encode(password);
          const saltBuffer = encoder.encode(salt);
          
          const keyMaterial = await crypto.subtle.importKey(
            'raw',
            passwordBuffer,
            'PBKDF2',
            false,
            ['deriveKey']
          );
          
          return await crypto.subtle.deriveKey(
            {
              name: 'PBKDF2',
              salt: saltBuffer,
              iterations: 100000,
              hash: 'SHA-256'
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
          );
        }
      }
      
      self.onmessage = async function(event) {
        const { taskId, type, data, options } = event.data;
        
        try {
          let result;
          
          switch (type) {
            case 'hash':
              result = await CryptoProcessor.generateHash(data, options.algorithm);
              break;
            case 'random-bytes':
              result = await CryptoProcessor.generateRandomBytes(data.length);
              break;
            case 'derive-key':
              result = await CryptoProcessor.deriveKey(data.password, data.salt);
              break;
            default:
              throw new Error(\`Unknown task type: \${type}\`);
          }
          
          self.postMessage({
            taskId,
            success: true,
            result
          });
        } catch (error) {
          self.postMessage({
            taskId,
            success: false,
            error: error.message
          });
        }
      };
    `
  }

  async initializePersistentWorkers() {
    for (const [taskType, config] of Object.entries(this.taskTypes)) {
      if (config.persistent) {
        const pool = new WorkerPool(
          config.workerType,
          this.workerScripts.get(config.workerType),
          config.maxConcurrent
        )
        
        await pool.initialize()
        this.workers.set(config.workerType, pool)
        
        console.log(`[WebWorkerOpt] Initialized ${config.maxConcurrent} persistent workers for ${config.workerType}`)
      }
    }
  }

  setupTaskProcessing() {
    setInterval(() => {
      if (!this.isProcessingQueue && this.taskQueue.length > 0) {
        this.processTaskQueue()
      }
    }, 100)
  }

  setupPerformanceMonitoring() {
    setInterval(() => {
      this.logPerformanceMetrics()
    }, 60000) // Every minute
  }

  setupCleanup() {
    // Cleanup terminated workers
    setInterval(() => {
      this.cleanupTerminatedWorkers()
    }, 5 * 60 * 1000) // Every 5 minutes
  }

  // Main task execution method
  async executeTask(taskType, data, options = {}) {
    const taskId = this.generateTaskId()
    const startTime = performance.now()
    
    const task = {
      id: taskId,
      type: taskType,
      data,
      options,
      startTime,
      retryCount: 0
    }
    
    this.tasks.set(taskId, task)
    
    try {
      const result = await this.processTask(task)
      
      const executionTime = performance.now() - startTime
      this.updateMetrics(true, executionTime)
      
      return result
    } catch (error) {
      this.updateMetrics(false, 0)
      throw error
    } finally {
      this.tasks.delete(taskId)
    }
  }

  async processTask(task) {
    const taskConfig = this.taskTypes[task.type]
    if (!taskConfig) {
      throw new Error(`Unknown task type: ${task.type}`)
    }
    
    const workerType = taskConfig.workerType
    let worker
    
    if (taskConfig.persistent) {
      // Use persistent worker pool
      const pool = this.workers.get(workerType)
      if (!pool) {
        throw new Error(`Worker pool not available for ${workerType}`)
      }
      worker = await pool.getWorker()
    } else {
      // Create dedicated worker
      worker = await this.createWorker(workerType)
    }
    
    try {
      const result = await this.executeOnWorker(worker, task)
      return result
    } finally {
      if (taskConfig.persistent) {
        const pool = this.workers.get(workerType)
        pool.releaseWorker(worker)
      } else {
        this.terminateWorker(worker)
      }
    }
  }

  async createWorker(workerType) {
    const script = this.workerScripts.get(workerType)
    if (!script) {
      throw new Error(`No script available for worker type: ${workerType}`)
    }
    
    const blob = new Blob([script], { type: 'application/javascript' })
    const workerUrl = URL.createObjectURL(blob)
    
    const worker = new Worker(workerUrl)
    worker._url = workerUrl
    worker._type = workerType
    worker._created = Date.now()
    
    this.metrics.workersCreated++
    
    return worker
  }

  async executeOnWorker(worker, task) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Task timeout: ${task.id}`))
      }, this.config.workerTimeout)
      
      const messageHandler = (event) => {
        const { taskId, success, result, error } = event.data
        
        if (taskId === task.id) {
          clearTimeout(timeout)
          worker.removeEventListener('message', messageHandler)
          
          if (success) {
            resolve(result)
          } else {
            reject(new Error(error))
          }
        }
      }
      
      worker.addEventListener('message', messageHandler)
      
      // Send task to worker
      const message = {
        taskId: task.id,
        type: task.type.replace(task.type.split('-')[0] + '-', ''), // Remove prefix
        data: task.data,
        options: task.options,
        startTime: task.startTime
      }
      
      // Use transferable objects if supported
      const transferables = this.getTransferables(task.data)
      worker.postMessage(message, transferables)
    })
  }

  getTransferables(data) {
    if (!this.config.enableTransferableObjects) return []
    
    const transferables = []
    
    if (data instanceof ArrayBuffer) {
      transferables.push(data)
    } else if (data && data.buffer instanceof ArrayBuffer) {
      transferables.push(data.buffer)
    }
    
    return transferables
  }

  terminateWorker(worker) {
    worker.terminate()
    
    if (worker._url) {
      URL.revokeObjectURL(worker._url)
    }
    
    this.metrics.workersTerminated++
  }

  processTaskQueue() {
    this.isProcessingQueue = true
    
    const batch = this.taskQueue.splice(0, this.config.batchSize)
    
    Promise.allSettled(
      batch.map(task => this.processTask(task))
    ).finally(() => {
      this.isProcessingQueue = false
    })
  }

  generateTaskId() {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  updateMetrics(success, executionTime) {
    this.metrics.tasksExecuted++
    
    if (success) {
      this.metrics.tasksSuccessful++
      this.metrics.totalExecutionTime += executionTime
      this.metrics.averageExecutionTime = 
        this.metrics.totalExecutionTime / this.metrics.tasksSuccessful
      
      // Estimate main thread time saved (assuming 70% would have run on main thread)
      this.metrics.mainThreadTimeSaved += executionTime * 0.7
    } else {
      this.metrics.tasksFailed++
    }
  }

  cleanupTerminatedWorkers() {
    for (const pool of this.workers.values()) {
      pool.cleanup()
    }
  }

  logPerformanceMetrics() {
    if (this.metrics.tasksExecuted > 0) {
      console.log('[WebWorkerOpt] Performance metrics:', {
        tasksExecuted: this.metrics.tasksExecuted,
        successRate: ((this.metrics.tasksSuccessful / this.metrics.tasksExecuted) * 100).toFixed(1) + '%',
        averageExecutionTime: this.metrics.averageExecutionTime.toFixed(2) + 'ms',
        mainThreadTimeSaved: this.metrics.mainThreadTimeSaved.toFixed(2) + 'ms',
        activeWorkers: Array.from(this.workers.values()).reduce((sum, pool) => sum + pool.activeWorkers, 0)
      })
    }
  }

  // Public API methods
  async processMessage(message, options = {}) {
    return this.executeTask('message-processing', message, options)
  }

  async processMessageBatch(messages, options = {}) {
    return this.executeTask('message-processing', messages, { ...options, batch: true })
  }

  async buildSearchIndex(documents, options = {}) {
    return this.executeTask('search-indexing', { documents }, options)
  }

  async search(query, limit = 10, options = {}) {
    return this.executeTask('search-indexing', { query, limit }, options)
  }

  async processImage(imageData, options = {}) {
    return this.executeTask('image-processing', imageData, options)
  }

  async compressData(data, algorithm = 'gzip', options = {}) {
    return this.executeTask('compression', data, { ...options, algorithm })
  }

  async generateHash(data, algorithm = 'SHA-256', options = {}) {
    return this.executeTask('encryption', data, { ...options, algorithm })
  }

  async sortLargeArray(array, key, order = 'asc', options = {}) {
    return this.executeTask('data-processing', { array, key, order }, options)
  }

  async filterData(dataset, predicateCode, options = {}) {
    return this.executeTask('data-processing', { dataset, predicateCode }, options)
  }

  getMetrics() {
    return {
      ...this.metrics,
      activeWorkers: Array.from(this.workers.values()).reduce((sum, pool) => sum + pool.activeWorkers, 0),
      totalWorkers: Array.from(this.workers.values()).reduce((sum, pool) => sum + pool.workers.length, 0),
      queueLength: this.taskQueue.length
    }
  }

  // Configuration
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig }
  }

  // Cleanup
  destroy() {
    // Terminate all workers
    for (const pool of this.workers.values()) {
      pool.destroy()
    }
    
    this.workers.clear()
    this.tasks.clear()
    this.taskQueue = []
  }
}

// Worker Pool implementation
class WorkerPool {
  constructor(workerType, script, maxWorkers = 2) {
    this.workerType = workerType
    this.script = script
    this.maxWorkers = maxWorkers
    this.workers = []
    this.availableWorkers = []
    this.activeWorkers = 0
  }

  async initialize() {
    for (let i = 0; i < this.maxWorkers; i++) {
      const worker = await this.createWorker()
      this.workers.push(worker)
      this.availableWorkers.push(worker)
    }
  }

  async createWorker() {
    const blob = new Blob([this.script], { type: 'application/javascript' })
    const workerUrl = URL.createObjectURL(blob)
    
    const worker = new Worker(workerUrl)
    worker._url = workerUrl
    worker._type = this.workerType
    worker._created = Date.now()
    worker._lastUsed = Date.now()
    
    return worker
  }

  async getWorker() {
    if (this.availableWorkers.length > 0) {
      const worker = this.availableWorkers.pop()
      worker._lastUsed = Date.now()
      this.activeWorkers++
      return worker
    }
    
    // Wait for worker to become available
    return new Promise((resolve) => {
      const checkAvailable = () => {
        if (this.availableWorkers.length > 0) {
          const worker = this.availableWorkers.pop()
          worker._lastUsed = Date.now()
          this.activeWorkers++
          resolve(worker)
        } else {
          setTimeout(checkAvailable, 10)
        }
      }
      checkAvailable()
    })
  }

  releaseWorker(worker) {
    this.availableWorkers.push(worker)
    this.activeWorkers--
  }

  cleanup() {
    // Remove workers that have been idle for too long
    const now = Date.now()
    const idleThreshold = 5 * 60 * 1000 // 5 minutes
    
    this.workers = this.workers.filter(worker => {
      if (now - worker._lastUsed > idleThreshold && this.availableWorkers.includes(worker)) {
        worker.terminate()
        URL.revokeObjectURL(worker._url)
        this.availableWorkers = this.availableWorkers.filter(w => w !== worker)
        return false
      }
      return true
    })
  }

  destroy() {
    this.workers.forEach(worker => {
      worker.terminate()
      if (worker._url) {
        URL.revokeObjectURL(worker._url)
      }
    })
    
    this.workers = []
    this.availableWorkers = []
    this.activeWorkers = 0
  }
}

export default WebWorkerOptimizationService