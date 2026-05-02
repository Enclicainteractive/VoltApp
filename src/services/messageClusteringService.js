// Intelligent Message Clustering Service for VoltChat
// Groups related messages to reduce render overhead and improve UX

class MessageClusteringService {
  constructor() {
    // Clustering configuration
    this.config = {
      maxTimeGap: 5 * 60 * 1000, // 5 minutes
      maxMessageGap: 10, // Maximum messages between same author
      minClusterSize: 2,
      maxClusterSize: 20,
      sameAuthorTimeGap: 2 * 60 * 1000, // 2 minutes for same author
      systemMessageGap: 30 * 1000, // 30 seconds for system messages
      enableSmartGrouping: true,
      enableSemanticClustering: true
    }
    
    // Performance tracking
    this.metrics = {
      clustersCreated: 0,
      messagesProcessed: 0,
      renderReduction: 0,
      processingTime: 0
    }
    
    // Clustering algorithms
    this.clusteringStrategies = new Map([
      ['temporal', this.temporalClustering.bind(this)],
      ['author', this.authorClustering.bind(this)],
      ['semantic', this.semanticClustering.bind(this)],
      ['thread', this.threadClustering.bind(this)],
      ['reaction', this.reactionClustering.bind(this)]
    ])
    
    // Message type handlers
    this.messageTypeHandlers = new Map([
      ['text', this.handleTextMessage.bind(this)],
      ['image', this.handleImageMessage.bind(this)],
      ['file', this.handleFileMessage.bind(this)],
      ['system', this.handleSystemMessage.bind(this)],
      ['join', this.handleJoinMessage.bind(this)],
      ['leave', this.handleLeaveMessage.bind(this)]
    ])
    
    // Cache for processed clusters
    this.clusterCache = new Map()
    this.semanticCache = new Map()
    
    console.log('[MessageClustering] Message clustering service initialized')
  }

  // Main clustering method
  clusterMessages(messages, options = {}) {
    const startTime = performance.now()
    
    if (!messages || messages.length === 0) {
      return { clusters: [], metrics: this.getMetrics() }
    }
    
    const {
      strategy = ['temporal', 'author', 'semantic'],
      enableCache = true,
      forceRecalculate = false
    } = options
    
    // Check cache first
    const cacheKey = this.generateCacheKey(messages, strategy)
    if (enableCache && !forceRecalculate && this.clusterCache.has(cacheKey)) {
      return this.clusterCache.get(cacheKey)
    }
    
    // Sort messages by timestamp
    const sortedMessages = [...messages].sort((a, b) => 
      new Date(a.timestamp) - new Date(b.timestamp)
    )
    
    // Apply clustering strategies
    let clusters = this.initializeClusters(sortedMessages)
    
    for (const strategyName of strategy) {
      const strategyFn = this.clusteringStrategies.get(strategyName)
      if (strategyFn) {
        clusters = strategyFn(clusters)
      }
    }
    
    // Post-process clusters
    clusters = this.optimizeClusters(clusters)
    clusters = this.addClusterMetadata(clusters)
    
    const processingTime = performance.now() - startTime
    this.updateMetrics(messages.length, clusters.length, processingTime)
    
    const result = {
      clusters,
      metrics: {
        originalCount: messages.length,
        clusterCount: clusters.length,
        reduction: ((messages.length - clusters.length) / messages.length * 100).toFixed(1),
        processingTime: processingTime.toFixed(2)
      }
    }
    
    // Cache result
    if (enableCache) {
      this.clusterCache.set(cacheKey, result)
    }
    
    return result
  }

  initializeClusters(messages) {
    return messages.map(message => ({
      id: this.generateClusterId(),
      type: 'single',
      messages: [message],
      author: message.author,
      timestamp: message.timestamp,
      endTimestamp: message.timestamp,
      metadata: {
        canMerge: true,
        priority: this.calculateMessagePriority(message)
      }
    }))
  }

  // Temporal clustering - group messages by time proximity
  temporalClustering(clusters) {
    const result = []
    let currentCluster = null
    
    for (const cluster of clusters) {
      const message = cluster.messages[0]
      const messageTime = new Date(message.timestamp).getTime()
      
      if (!currentCluster) {
        currentCluster = { ...cluster, type: 'temporal' }
      } else {
        const clusterEndTime = new Date(currentCluster.endTimestamp).getTime()
        const timeGap = messageTime - clusterEndTime
        const maxGap = this.getTimeGapForMessageType(message.type)
        
        if (timeGap <= maxGap && currentCluster.messages.length < this.config.maxClusterSize) {
          // Merge into current cluster
          currentCluster.messages.push(...cluster.messages)
          currentCluster.endTimestamp = message.timestamp
          currentCluster.metadata.canMerge = this.canMergeClusters(currentCluster, cluster)
        } else {
          // Start new cluster
          result.push(currentCluster)
          currentCluster = { ...cluster, type: 'temporal' }
        }
      }
    }
    
    if (currentCluster) {
      result.push(currentCluster)
    }
    
    return result
  }

  // Author clustering - group consecutive messages from same author
  authorClustering(clusters) {
    const result = []
    let currentCluster = null
    
    for (const cluster of clusters) {
      const messages = cluster.messages
      const firstMessage = messages[0]
      
      if (!currentCluster) {
        currentCluster = { ...cluster, type: 'author' }
      } else {
        const sameAuthor = currentCluster.author.id === firstMessage.author.id
        const timeGap = new Date(firstMessage.timestamp) - new Date(currentCluster.endTimestamp)
        const withinTimeLimit = timeGap <= this.config.sameAuthorTimeGap
        const withinSizeLimit = currentCluster.messages.length < this.config.maxClusterSize
        
        if (sameAuthor && withinTimeLimit && withinSizeLimit) {
          // Merge into current cluster
          currentCluster.messages.push(...messages)
          currentCluster.endTimestamp = messages[messages.length - 1].timestamp
          currentCluster.type = 'author'
        } else {
          // Start new cluster
          result.push(currentCluster)
          currentCluster = { ...cluster, type: sameAuthor ? 'author' : 'mixed' }
        }
      }
    }
    
    if (currentCluster) {
      result.push(currentCluster)
    }
    
    return result
  }

  // Semantic clustering - group messages by content similarity
  semanticClustering(clusters) {
    if (!this.config.enableSemanticClustering) {
      return clusters
    }
    
    const result = []
    const semanticGroups = new Map()
    
    for (const cluster of clusters) {
      const messages = cluster.messages
      const semanticKey = this.calculateSemanticKey(messages)
      
      if (semanticGroups.has(semanticKey)) {
        const existingGroup = semanticGroups.get(semanticKey)
        const timeDiff = new Date(messages[0].timestamp) - new Date(existingGroup.endTimestamp)
        
        if (timeDiff <= this.config.maxTimeGap && existingGroup.messages.length < this.config.maxClusterSize) {
          existingGroup.messages.push(...messages)
          existingGroup.endTimestamp = messages[messages.length - 1].timestamp
          existingGroup.type = 'semantic'
          continue
        }
      }
      
      const newCluster = { ...cluster, type: 'semantic' }
      semanticGroups.set(semanticKey, newCluster)
      result.push(newCluster)
    }
    
    return result
  }

  // Thread clustering - group reply chains
  threadClustering(clusters) {
    const threads = new Map() // parentId -> cluster
    const result = []
    
    for (const cluster of clusters) {
      const messages = cluster.messages
      const hasReplies = messages.some(msg => msg.reply_to)
      
      if (hasReplies) {
        for (const message of messages) {
          if (message.reply_to) {
            const parentId = message.reply_to
            
            if (threads.has(parentId)) {
              const threadCluster = threads.get(parentId)
              threadCluster.messages.push(message)
              threadCluster.endTimestamp = message.timestamp
              threadCluster.type = 'thread'
            } else {
              // Create new thread cluster
              const threadCluster = {
                id: this.generateClusterId(),
                type: 'thread',
                messages: [message],
                author: message.author,
                timestamp: message.timestamp,
                endTimestamp: message.timestamp,
                metadata: {
                  parentId,
                  threadDepth: this.calculateThreadDepth(message),
                  canMerge: false
                }
              }
              threads.set(parentId, threadCluster)
              result.push(threadCluster)
            }
          } else {
            // Non-reply message
            result.push({
              ...cluster,
              messages: [message]
            })
          }
        }
      } else {
        result.push(cluster)
      }
    }
    
    return result
  }

  // Reaction clustering - group messages with similar reaction patterns
  reactionClustering(clusters) {
    const result = []
    let currentCluster = null
    
    for (const cluster of clusters) {
      const messages = cluster.messages
      const hasReactions = messages.some(msg => msg.reactions && msg.reactions.length > 0)
      
      if (hasReactions && currentCluster && this.haveSimilarReactions(currentCluster.messages, messages)) {
        // Merge into reaction cluster
        currentCluster.messages.push(...messages)
        currentCluster.endTimestamp = messages[messages.length - 1].timestamp
        currentCluster.type = 'reaction'
      } else {
        if (currentCluster) {
          result.push(currentCluster)
        }
        currentCluster = { ...cluster, type: hasReactions ? 'reaction' : 'normal' }
      }
    }
    
    if (currentCluster) {
      result.push(currentCluster)
    }
    
    return result
  }

  // Message type specific handlers
  handleTextMessage(message, cluster) {
    // Check for continuation indicators
    const content = message.content.toLowerCase()
    const isContinuation = content.startsWith('and ') || 
                          content.startsWith('also ') || 
                          content.startsWith('but ')
    
    return {
      canCluster: true,
      priority: isContinuation ? 'high' : 'normal',
      semanticWeight: this.calculateTextSemanticWeight(content)
    }
  }

  handleImageMessage(message, cluster) {
    return {
      canCluster: true,
      priority: 'medium',
      semanticWeight: 0.3,
      requiresSeparateRendering: message.attachments.length > 1
    }
  }

  handleFileMessage(message, cluster) {
    return {
      canCluster: message.attachments.length === 1,
      priority: 'low',
      semanticWeight: 0.1
    }
  }

  handleSystemMessage(message, cluster) {
    return {
      canCluster: false,
      priority: 'high',
      semanticWeight: 0,
      requiresSeparateRendering: true
    }
  }

  handleJoinMessage(message, cluster) {
    return {
      canCluster: true,
      priority: 'low',
      semanticWeight: 0.8, // High semantic similarity
      groupWithSimilar: true
    }
  }

  handleLeaveMessage(message, cluster) {
    return {
      canCluster: true,
      priority: 'low', 
      semanticWeight: 0.8,
      groupWithSimilar: true
    }
  }

  // Utility methods
  calculateSemanticKey(messages) {
    const cacheKey = messages.map(m => m.id).join(',')
    
    if (this.semanticCache.has(cacheKey)) {
      return this.semanticCache.get(cacheKey)
    }
    
    let semanticKey = ''
    
    for (const message of messages) {
      const handler = this.messageTypeHandlers.get(message.type) || this.handleTextMessage
      const analysis = handler(message)
      
      // Extract semantic features
      const features = this.extractSemanticFeatures(message)
      semanticKey += features.join(',') + '|'
    }
    
    const hashedKey = this.hashString(semanticKey)
    this.semanticCache.set(cacheKey, hashedKey)
    
    return hashedKey
  }

  extractSemanticFeatures(message) {
    const features = []
    
    // Message type
    features.push(`type:${message.type}`)
    
    // Author role/status
    if (message.author.roles) {
      features.push(`role:${message.author.roles[0]}`)
    }
    
    // Content features for text messages
    if (message.type === 'text' && message.content) {
      const content = message.content.toLowerCase()
      
      // Sentiment indicators
      if (content.includes('!') || content.includes('?')) {
        features.push('punctuation:expressive')
      }
      
      // Question vs statement
      if (content.includes('?')) {
        features.push('type:question')
      }
      
      // Length category
      if (content.length > 100) {
        features.push('length:long')
      } else if (content.length > 30) {
        features.push('length:medium')
      } else {
        features.push('length:short')
      }
      
      // Common patterns
      if (content.match(/^(lol|haha|😂|👍)/)) {
        features.push('reaction:positive')
      }
    }
    
    // Attachment features
    if (message.attachments && message.attachments.length > 0) {
      const attachmentTypes = message.attachments.map(att => att.content_type.split('/')[0])
      features.push(`attachments:${attachmentTypes.join(',')}`)
    }
    
    // Reaction features
    if (message.reactions && message.reactions.length > 0) {
      features.push('has_reactions:true')
    }
    
    return features
  }

  calculateTextSemanticWeight(content) {
    // Simple heuristic for semantic similarity
    const commonWords = ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of']
    const words = content.split(/\s+/).filter(word => !commonWords.includes(word.toLowerCase()))
    
    return Math.min(words.length / 10, 1.0)
  }

  calculateMessagePriority(message) {
    if (message.type === 'system') return 'high'
    if (message.reply_to) return 'medium'
    if (message.attachments && message.attachments.length > 0) return 'medium'
    return 'normal'
  }

  calculateThreadDepth(message) {
    // Calculate nesting depth in reply chain
    // This would require traversing the reply chain
    return 1 // Simplified for now
  }

  getTimeGapForMessageType(messageType) {
    switch (messageType) {
      case 'system':
      case 'join':
      case 'leave':
        return this.config.systemMessageGap
      default:
        return this.config.maxTimeGap
    }
  }

  canMergeClusters(cluster1, cluster2) {
    // Check various merge constraints
    if (cluster1.messages.length + cluster2.messages.length > this.config.maxClusterSize) {
      return false
    }
    
    // Don't merge system messages with regular messages
    const hasSystemMessages1 = cluster1.messages.some(m => m.type === 'system')
    const hasSystemMessages2 = cluster2.messages.some(m => m.type === 'system')
    
    if (hasSystemMessages1 !== hasSystemMessages2) {
      return false
    }
    
    return true
  }

  haveSimilarReactions(messages1, messages2) {
    const reactions1 = this.extractReactionSignature(messages1)
    const reactions2 = this.extractReactionSignature(messages2)
    
    const similarity = this.calculateReactionSimilarity(reactions1, reactions2)
    return similarity > 0.7 // 70% similarity threshold
  }

  extractReactionSignature(messages) {
    const reactions = new Set()
    
    for (const message of messages) {
      if (message.reactions) {
        message.reactions.forEach(reaction => {
          reactions.add(reaction.emoji)
        })
      }
    }
    
    return Array.from(reactions).sort()
  }

  calculateReactionSimilarity(reactions1, reactions2) {
    if (reactions1.length === 0 && reactions2.length === 0) return 1
    if (reactions1.length === 0 || reactions2.length === 0) return 0
    
    const set1 = new Set(reactions1)
    const set2 = new Set(reactions2)
    const intersection = new Set([...set1].filter(x => set2.has(x)))
    const union = new Set([...set1, ...set2])
    
    return intersection.size / union.size
  }

  optimizeClusters(clusters) {
    // Remove single-message clusters that don't benefit from clustering
    return clusters.filter(cluster => {
      if (cluster.messages.length === 1) {
        const message = cluster.messages[0]
        return this.shouldKeepSingleCluster(message)
      }
      return cluster.messages.length >= this.config.minClusterSize || cluster.type === 'thread'
    })
  }

  shouldKeepSingleCluster(message) {
    // Keep system messages as separate clusters
    if (message.type === 'system') return true
    
    // Keep messages with special significance
    if (message.attachments && message.attachments.length > 0) return true
    if (message.reactions && message.reactions.length > 2) return true
    
    return false
  }

  addClusterMetadata(clusters) {
    return clusters.map(cluster => ({
      ...cluster,
      metadata: {
        ...cluster.metadata,
        messageCount: cluster.messages.length,
        timeSpan: new Date(cluster.endTimestamp) - new Date(cluster.timestamp),
        authors: [...new Set(cluster.messages.map(m => m.author.id))].length,
        hasAttachments: cluster.messages.some(m => m.attachments && m.attachments.length > 0),
        hasReactions: cluster.messages.some(m => m.reactions && m.reactions.length > 0),
        avgMessageLength: cluster.messages.reduce((sum, m) => sum + (m.content?.length || 0), 0) / cluster.messages.length
      }
    }))
  }

  generateClusterId() {
    return `cluster_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  generateCacheKey(messages, strategy) {
    const messageIds = messages.map(m => m.id).join(',')
    const strategyKey = Array.isArray(strategy) ? strategy.join(',') : strategy
    return `${this.hashString(messageIds)}_${strategyKey}`
  }

  hashString(str) {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return hash.toString()
  }

  updateMetrics(originalCount, clusterCount, processingTime) {
    this.metrics.messagesProcessed += originalCount
    this.metrics.clustersCreated += clusterCount
    this.metrics.renderReduction += originalCount - clusterCount
    this.metrics.processingTime += processingTime
  }

  // Public API
  getMetrics() {
    const avgProcessingTime = this.metrics.processingTime / Math.max(1, this.metrics.clustersCreated)
    const avgReduction = this.metrics.renderReduction / Math.max(1, this.metrics.messagesProcessed) * 100
    
    return {
      ...this.metrics,
      averageProcessingTime: avgProcessingTime.toFixed(2),
      averageReduction: avgReduction.toFixed(1),
      cacheSize: this.clusterCache.size,
      semanticCacheSize: this.semanticCache.size
    }
  }

  clearCache() {
    this.clusterCache.clear()
    this.semanticCache.clear()
  }

  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig }
  }

  // Analyze clustering effectiveness
  analyzeClusteringEffectiveness(originalMessages, clusters) {
    const analysis = {
      totalReduction: originalMessages.length - clusters.length,
      reductionPercentage: ((originalMessages.length - clusters.length) / originalMessages.length * 100).toFixed(1),
      clusterTypes: {},
      avgClusterSize: clusters.reduce((sum, c) => sum + c.messages.length, 0) / clusters.length,
      largestCluster: Math.max(...clusters.map(c => c.messages.length)),
      singleMessageClusters: clusters.filter(c => c.messages.length === 1).length
    }
    
    // Count cluster types
    clusters.forEach(cluster => {
      analysis.clusterTypes[cluster.type] = (analysis.clusterTypes[cluster.type] || 0) + 1
    })
    
    return analysis
  }
}

export default MessageClusteringService