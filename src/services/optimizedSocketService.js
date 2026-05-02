import { io } from 'socket.io-client'

class OptimizedSocketService {
  constructor() {
    this.socket = null
    this.connectionState = 'disconnected'
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = 10
    this.reconnectDelay = 1000
    this.heartbeatInterval = null
    this.messageQueue = []
    this.eventListeners = new Map()
    this.connectionPromise = null
    this.lastActivity = Date.now()
    this.pingStartTime = null
    this.latency = 0
    
    // Connection pool for multiple instances
    this.connectionPool = new Map()
    this.maxPoolSize = 3
    this.poolCleanupInterval = null
    
    // Performance monitoring
    this.metrics = {
      messagesPerSecond: 0,
      averageLatency: 0,
      reconnectCount: 0,
      messagesSent: 0,
      messagesReceived: 0,
      bytesTransferred: 0
    }
    
    // Compression and batching
    this.compressionEnabled = true
    this.batchSize = 10
    this.batchTimeout = 50
    this.pendingBatch = []
    this.batchTimer = null
    
    this.setupPerformanceMonitoring()
  }

  // Initialize optimized socket connection
  async connect(options = {}) {
    if (this.connectionPromise) {
      return this.connectionPromise
    }

    this.connectionPromise = this._establishConnection(options)
    return this.connectionPromise
  }

  async _establishConnection(options) {
    try {
      const socketOptions = {
        transports: ['websocket', 'polling'],
        upgrade: true,
        rememberUpgrade: true,
        timeout: 20000,
        forceNew: false,
        reconnection: true,
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: this.reconnectDelay,
        reconnectionDelayMax: 5000,
        maxHttpBufferSize: 1e6,
        pingTimeout: 60000,
        pingInterval: 25000,
        autoConnect: false,
        compression: this.compressionEnabled,
        perMessageDeflate: {
          threshold: 1024,
          concurrencyLimit: 10,
          memLevel: 8
        },
        ...options
      }

      this.socket = io(socketOptions.url || '', socketOptions)
      
      this.setupEventListeners()
      this.setupHeartbeat()
      this.setupConnectionPooling()
      
      // Connect manually for better control
      this.socket.connect()
      
      return new Promise((resolve, reject) => {
        const connectTimeout = setTimeout(() => {
          reject(new Error('Connection timeout'))
        }, socketOptions.timeout)

        this.socket.once('connect', () => {
          clearTimeout(connectTimeout)
          this.connectionState = 'connected'
          this.reconnectAttempts = 0
          this.connectionPromise = null
          this.flushMessageQueue()
          resolve(this.socket)
        })

        this.socket.once('connect_error', (error) => {
          clearTimeout(connectTimeout)
          this.connectionPromise = null
          reject(error)
        })
      })

    } catch (error) {
      this.connectionPromise = null
      throw error
    }
  }

  setupEventListeners() {
    if (!this.socket) return

    // Connection events
    this.socket.on('connect', () => {
      console.log('[Socket] Connected successfully')
      this.connectionState = 'connected'
      this.metrics.reconnectCount += this.reconnectAttempts
      this.reconnectAttempts = 0
      this.startLatencyMonitoring()
    })

    this.socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason)
      this.connectionState = 'disconnected'
      this.stopLatencyMonitoring()
      
      if (reason === 'io server disconnect') {
        // Server initiated disconnect - don't reconnect automatically
        this.socket.connect()
      }
    })

    this.socket.on('connect_error', (error) => {
      console.error('[Socket] Connection error:', error)
      this.connectionState = 'error'
      this.reconnectAttempts++
      
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error('[Socket] Max reconnection attempts reached')
        this.emit('maxReconnectAttemptsReached', error)
      }
    })

    this.socket.on('reconnect', (attemptNumber) => {
      console.log(`[Socket] Reconnected after ${attemptNumber} attempts`)
      this.connectionState = 'connected'
    })

    this.socket.on('reconnect_attempt', (attemptNumber) => {
      console.log(`[Socket] Reconnection attempt ${attemptNumber}`)
      this.connectionState = 'reconnecting'
    })

    // Performance monitoring events
    this.socket.on('ping', () => {
      this.pingStartTime = performance.now()
    })

    this.socket.on('pong', (latency) => {
      if (this.pingStartTime) {
        this.latency = performance.now() - this.pingStartTime
        this.updateAverageLatency(this.latency)
      }
    })

    // Message events with compression
    this.socket.onAny((eventName, ...args) => {
      this.metrics.messagesReceived++
      this.lastActivity = Date.now()
      
      // Estimate bytes transferred
      const estimatedSize = this.estimateMessageSize(eventName, args)
      this.metrics.bytesTransferred += estimatedSize
      
      this.emit(eventName, ...args)
    })
  }

  setupHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (this.connectionState === 'connected') {
        const now = Date.now()
        
        // Send heartbeat if no recent activity
        if (now - this.lastActivity > 30000) {
          this.socket.emit('heartbeat', { timestamp: now })
        }
      }
    }, 30000)
  }

  setupConnectionPooling() {
    // Clean up old pool connections
    this.poolCleanupInterval = setInterval(() => {
      this.cleanupConnectionPool()
    }, 60000) // Every minute
  }

  setupPerformanceMonitoring() {
    // Calculate messages per second
    setInterval(() => {
      this.updateMessagesPerSecond()
    }, 1000)
  }

  // Optimized message sending with batching
  emit(eventName, data, options = {}) {
    if (!this.socket || this.connectionState !== 'connected') {
      if (options.queue !== false) {
        this.queueMessage(eventName, data, options)
      }
      return false
    }

    if (options.batch && this.batchSize > 1) {
      this.addToBatch(eventName, data, options)
    } else {
      this._sendMessage(eventName, data, options)
    }

    return true
  }

  _sendMessage(eventName, data, options = {}) {
    try {
      // Apply compression for large messages
      let payload = data
      if (this.compressionEnabled && this.estimateMessageSize(eventName, [data]) > 1024) {
        payload = this.compressData(data)
      }

      this.socket.emit(eventName, payload, options.callback)
      this.metrics.messagesSent++
      this.lastActivity = Date.now()

      const estimatedSize = this.estimateMessageSize(eventName, [payload])
      this.metrics.bytesTransferred += estimatedSize

    } catch (error) {
      console.error('[Socket] Failed to send message:', error)
      if (options.queue !== false) {
        this.queueMessage(eventName, data, options)
      }
    }
  }

  addToBatch(eventName, data, options) {
    this.pendingBatch.push({ eventName, data, options })

    if (this.pendingBatch.length >= this.batchSize) {
      this.flushBatch()
    } else if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => {
        this.flushBatch()
      }, this.batchTimeout)
    }
  }

  flushBatch() {
    if (this.pendingBatch.length === 0) return

    const batch = this.pendingBatch
    this.pendingBatch = []
    
    if (this.batchTimer) {
      clearTimeout(this.batchTimer)
      this.batchTimer = null
    }

    // Send batch as single message
    this._sendMessage('batch', {
      messages: batch,
      timestamp: Date.now()
    })
  }

  queueMessage(eventName, data, options) {
    if (this.messageQueue.length > 1000) {
      // Prevent memory leaks from large queues
      this.messageQueue.shift()
    }
    
    this.messageQueue.push({
      eventName,
      data,
      options,
      timestamp: Date.now()
    })
  }

  flushMessageQueue() {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift()
      
      // Skip expired messages
      if (Date.now() - message.timestamp > 30000) {
        continue
      }
      
      this.emit(message.eventName, message.data, { 
        ...message.options, 
        queue: false 
      })
    }
  }

  // Event listener management
  on(eventName, callback) {
    if (!this.eventListeners.has(eventName)) {
      this.eventListeners.set(eventName, new Set())
    }
    this.eventListeners.get(eventName).add(callback)

    if (this.socket) {
      this.socket.on(eventName, callback)
    }
  }

  off(eventName, callback) {
    if (this.eventListeners.has(eventName)) {
      this.eventListeners.get(eventName).delete(callback)
    }

    if (this.socket) {
      this.socket.off(eventName, callback)
    }
  }

  once(eventName, callback) {
    const wrappedCallback = (...args) => {
      this.off(eventName, wrappedCallback)
      callback(...args)
    }
    this.on(eventName, wrappedCallback)
  }

  // Connection pool management
  getPooledConnection(namespace) {
    if (this.connectionPool.has(namespace)) {
      const connection = this.connectionPool.get(namespace)
      if (connection.connected) {
        return connection
      } else {
        this.connectionPool.delete(namespace)
      }
    }

    if (this.connectionPool.size >= this.maxPoolSize) {
      // Remove oldest connection
      const oldestKey = this.connectionPool.keys().next().value
      const oldestConnection = this.connectionPool.get(oldestKey)
      oldestConnection.disconnect()
      this.connectionPool.delete(oldestKey)
    }

    // Create new connection for namespace
    const namespacedSocket = this.socket.to(namespace)
    this.connectionPool.set(namespace, {
      socket: namespacedSocket,
      connected: true,
      lastUsed: Date.now()
    })

    return namespacedSocket
  }

  cleanupConnectionPool() {
    const now = Date.now()
    const maxIdleTime = 5 * 60 * 1000 // 5 minutes

    for (const [namespace, connection] of this.connectionPool) {
      if (now - connection.lastUsed > maxIdleTime) {
        connection.socket.disconnect()
        this.connectionPool.delete(namespace)
      }
    }
  }

  // Performance utilities
  startLatencyMonitoring() {
    this.latencyInterval = setInterval(() => {
      if (this.socket && this.connectionState === 'connected') {
        this.pingStartTime = performance.now()
        this.socket.emit('ping')
      }
    }, 10000) // Every 10 seconds
  }

  stopLatencyMonitoring() {
    if (this.latencyInterval) {
      clearInterval(this.latencyInterval)
      this.latencyInterval = null
    }
  }

  updateAverageLatency(latency) {
    // Exponential moving average
    this.metrics.averageLatency = this.metrics.averageLatency === 0 
      ? latency 
      : (this.metrics.averageLatency * 0.8) + (latency * 0.2)
  }

  updateMessagesPerSecond() {
    const now = Date.now()
    if (this.lastMetricsUpdate) {
      const timeDiff = now - this.lastMetricsUpdate
      const messagesDiff = this.metrics.messagesReceived - (this.lastMessagesCount || 0)
      
      this.metrics.messagesPerSecond = (messagesDiff / timeDiff) * 1000
    }
    
    this.lastMetricsUpdate = now
    this.lastMessagesCount = this.metrics.messagesReceived
  }

  estimateMessageSize(eventName, args) {
    // Rough estimate of message size in bytes
    try {
      const serialized = JSON.stringify({ event: eventName, args })
      return new Blob([serialized]).size
    } catch {
      return eventName.length + 100 // Fallback estimate
    }
  }

  compressData(data) {
    // Simple compression for large objects
    try {
      return {
        compressed: true,
        data: JSON.stringify(data) // In production, use actual compression
      }
    } catch {
      return data
    }
  }

  // Connection management
  async disconnect() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }

    if (this.poolCleanupInterval) {
      clearInterval(this.poolCleanupInterval)
      this.poolCleanupInterval = null
    }

    if (this.latencyInterval) {
      clearInterval(this.latencyInterval)
      this.latencyInterval = null
    }

    // Close pooled connections
    for (const [namespace, connection] of this.connectionPool) {
      connection.socket.disconnect()
    }
    this.connectionPool.clear()

    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
    }

    this.connectionState = 'disconnected'
    this.connectionPromise = null
  }

  // Getters for monitoring
  getConnectionState() {
    return this.connectionState
  }

  getMetrics() {
    return {
      ...this.metrics,
      latency: this.latency,
      queueSize: this.messageQueue.length,
      poolSize: this.connectionPool.size,
      connected: this.connectionState === 'connected'
    }
  }

  getHealthStatus() {
    return {
      status: this.connectionState,
      latency: this.latency,
      reconnectAttempts: this.reconnectAttempts,
      queueSize: this.messageQueue.length,
      lastActivity: this.lastActivity,
      healthy: this.connectionState === 'connected' && this.latency < 500
    }
  }
}

// Singleton instance
let socketService = null

export const getOptimizedSocketService = () => {
  if (!socketService) {
    socketService = new OptimizedSocketService()
  }
  return socketService
}

export default OptimizedSocketService