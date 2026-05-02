// Efficient Search Indexing Service for VoltChat
// High-performance search with real-time indexing and intelligent ranking

class SearchIndexingService {
  constructor() {
    this.indexes = new Map() // indexType -> SearchIndex
    this.documentStore = new Map() // documentId -> document
    this.searchHistory = []
    this.popularQueries = new Map()
    this.queryCache = new Map()
    
    // Configuration
    this.config = {
      enableRealTimeIndexing: true,
      enableQueryCaching: true,
      enablePopularityRanking: true,
      enableFuzzySearch: true,
      enableAutoComplete: true,
      maxCacheSize: 1000,
      cacheTTL: 5 * 60 * 1000, // 5 minutes
      maxSearchResults: 50,
      minQueryLength: 2,
      enableStemming: true,
      enableStopWords: true,
      enableNGrams: true
    }
    
    // Stop words for filtering
    this.stopWords = new Set([
      'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
      'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the',
      'to', 'was', 'were', 'will', 'with', 'the', 'this', 'but', 'they',
      'have', 'had', 'what', 'said', 'each', 'which', 'she', 'do', 'how',
      'their', 'if', 'up', 'out', 'many', 'then', 'them', 'so', 'some',
      'her', 'would', 'make', 'like', 'into', 'him', 'time', 'two', 'more',
      'very', 'when', 'come', 'may', 'see', 'need', 'down', 'should', 'now',
      'over', 'such', 'our', 'out', 'way', 'these', 'well', 'get'
    ])
    
    // Search index types
    this.indexTypes = {
      messages: {
        fields: ['content', 'author_name'],
        weights: { content: 1.0, author_name: 0.5 },
        boost: (doc) => this.calculateMessageBoost(doc)
      },
      users: {
        fields: ['username', 'display_name', 'bio'],
        weights: { username: 1.5, display_name: 1.0, bio: 0.3 },
        boost: (doc) => this.calculateUserBoost(doc)
      },
      channels: {
        fields: ['name', 'description', 'topic'],
        weights: { name: 2.0, description: 1.0, topic: 0.8 },
        boost: (doc) => this.calculateChannelBoost(doc)
      },
      servers: {
        fields: ['name', 'description'],
        weights: { name: 2.0, description: 1.0 },
        boost: (doc) => this.calculateServerBoost(doc)
      }
    }
    
    // Performance tracking
    this.metrics = {
      documentsIndexed: 0,
      searchesPerformed: 0,
      cacheHits: 0,
      cacheMisses: 0,
      averageSearchTime: 0,
      totalSearchTime: 0,
      indexSize: 0,
      popularQueries: 0
    }
    
    this.initialize()
  }

  async initialize() {
    // Initialize search indexes
    this.initializeIndexes()
    
    // Setup real-time indexing
    this.setupRealTimeIndexing()
    
    // Setup query caching
    this.setupQueryCaching()
    
    // Setup auto-complete
    this.setupAutoComplete()
    
    // Setup performance monitoring
    this.setupPerformanceMonitoring()
    
    console.log('[SearchIndexing] Search indexing service initialized')
  }

  initializeIndexes() {
    for (const [indexType, config] of Object.entries(this.indexTypes)) {
      const searchIndex = new SearchIndex(indexType, config)
      this.indexes.set(indexType, searchIndex)
    }
  }

  setupRealTimeIndexing() {
    if (!this.config.enableRealTimeIndexing) return
    
    // Listen for data changes
    window.addEventListener('dataChange', (event) => {
      this.handleDataChange(event.detail)
    })
    
    // Listen for WebSocket messages for real-time updates
    window.addEventListener('websocketMessage', (event) => {
      this.handleWebSocketMessage(event.detail)
    })
  }

  setupQueryCaching() {
    if (!this.config.enableQueryCaching) return
    
    // Clean cache periodically
    setInterval(() => {
      this.cleanupQueryCache()
    }, 60000) // Every minute
  }

  setupAutoComplete() {
    if (!this.config.enableAutoComplete) return
    
    this.autoCompleteIndex = new AutoCompleteIndex()
    
    // Build auto-complete from search history
    setInterval(() => {
      this.updateAutoComplete()
    }, 5 * 60 * 1000) // Every 5 minutes
  }

  setupPerformanceMonitoring() {
    setInterval(() => {
      this.logPerformanceMetrics()
    }, 60000) // Every minute
  }

  // Main search method
  async search(query, options = {}) {
    const startTime = performance.now()
    
    const {
      types = ['messages', 'users', 'channels'],
      limit = this.config.maxSearchResults,
      fuzzy = this.config.enableFuzzySearch,
      cacheResults = this.config.enableQueryCaching,
      filters = {},
      sortBy = 'relevance',
      sortOrder = 'desc'
    } = options
    
    // Validate query
    if (!query || query.length < this.config.minQueryLength) {
      return { results: [], total: 0, time: 0 }
    }
    
    // Normalize query
    const normalizedQuery = this.normalizeQuery(query)
    
    // Check cache first
    const cacheKey = this.generateCacheKey(normalizedQuery, options)
    if (cacheResults && this.queryCache.has(cacheKey)) {
      const cached = this.queryCache.get(cacheKey)
      if (Date.now() - cached.timestamp < this.config.cacheTTL) {
        this.metrics.cacheHits++
        return cached.results
      } else {
        this.queryCache.delete(cacheKey)
      }
    }
    
    this.metrics.cacheMisses++
    
    try {
      // Perform search across specified types
      const searchPromises = types.map(type => 
        this.searchIndex(type, normalizedQuery, { ...options, fuzzy, filters })
      )
      
      const indexResults = await Promise.all(searchPromises)
      
      // Combine and rank results
      const combinedResults = this.combineResults(indexResults, query)
      
      // Apply sorting
      const sortedResults = this.sortResults(combinedResults, sortBy, sortOrder)
      
      // Limit results
      const limitedResults = sortedResults.slice(0, limit)
      
      const searchTime = performance.now() - startTime
      
      const results = {
        results: limitedResults,
        total: sortedResults.length,
        time: searchTime,
        query: normalizedQuery
      }
      
      // Cache results
      if (cacheResults) {
        this.cacheSearchResults(cacheKey, results)
      }
      
      // Update metrics and history
      this.updateSearchMetrics(query, searchTime, limitedResults.length)
      
      return results
      
    } catch (error) {
      console.error('[SearchIndexing] Search failed:', error)
      return { results: [], total: 0, time: 0, error: error.message }
    }
  }

  async searchIndex(indexType, query, options = {}) {
    const index = this.indexes.get(indexType)
    if (!index) {
      throw new Error(`Index not found: ${indexType}`)
    }
    
    return index.search(query, options)
  }

  // Document indexing
  async addDocument(indexType, document) {
    const index = this.indexes.get(indexType)
    if (!index) {
      throw new Error(`Index not found: ${indexType}`)
    }
    
    // Store document
    const documentId = `${indexType}:${document.id}`
    this.documentStore.set(documentId, document)
    
    // Add to index
    await index.addDocument(document)
    
    this.metrics.documentsIndexed++
    
    // Update auto-complete if enabled
    if (this.config.enableAutoComplete) {
      this.updateAutoCompleteFromDocument(document)
    }
  }

  async updateDocument(indexType, document) {
    const index = this.indexes.get(indexType)
    if (!index) {
      throw new Error(`Index not found: ${indexType}`)
    }
    
    // Update document store
    const documentId = `${indexType}:${document.id}`
    this.documentStore.set(documentId, document)
    
    // Update index
    await index.updateDocument(document)
    
    // Invalidate related cache entries
    this.invalidateRelatedCache(document)
  }

  async removeDocument(indexType, documentId) {
    const index = this.indexes.get(indexType)
    if (!index) {
      throw new Error(`Index not found: ${indexType}`)
    }
    
    // Remove from document store
    const fullDocumentId = `${indexType}:${documentId}`
    this.documentStore.delete(fullDocumentId)
    
    // Remove from index
    await index.removeDocument(documentId)
    
    // Invalidate cache
    this.invalidateRelatedCache({ id: documentId, type: indexType })
  }

  // Auto-complete functionality
  async getAutoComplete(query, options = {}) {
    const { limit = 10 } = options
    
    if (!this.autoCompleteIndex || query.length < 1) {
      return []
    }
    
    const suggestions = this.autoCompleteIndex.getSuggestions(query, limit)
    
    // Enhance with popular queries
    const popularSuggestions = this.getPopularQuerySuggestions(query, limit)
    
    // Combine and deduplicate
    const combined = [...suggestions, ...popularSuggestions]
    const unique = Array.from(new Set(combined))
    
    return unique.slice(0, limit)
  }

  // Query processing
  normalizeQuery(query) {
    return query
      .toLowerCase()
      .trim()
      .replace(/[^\w\s]/g, ' ') // Replace non-alphanumeric with spaces
      .replace(/\s+/g, ' ') // Collapse multiple spaces
  }

  tokenizeQuery(query) {
    const tokens = query.split(/\s+/)
    
    if (this.config.enableStopWords) {
      return tokens.filter(token => !this.stopWords.has(token))
    }
    
    return tokens
  }

  stemToken(token) {
    if (!this.config.enableStemming) return token
    
    // Simple stemming rules
    if (token.endsWith('ing') && token.length > 4) {
      return token.slice(0, -3)
    }
    if (token.endsWith('ed') && token.length > 3) {
      return token.slice(0, -2)
    }
    if (token.endsWith('s') && token.length > 2) {
      return token.slice(0, -1)
    }
    
    return token
  }

  generateNGrams(text, n = 3) {
    if (!this.config.enableNGrams || text.length < n) return []
    
    const ngrams = []
    for (let i = 0; i <= text.length - n; i++) {
      ngrams.push(text.slice(i, i + n))
    }
    return ngrams
  }

  // Result processing
  combineResults(indexResults, originalQuery) {
    const combined = []
    
    for (const { type, results } of indexResults) {
      for (const result of results) {
        combined.push({
          ...result,
          type,
          originalQuery
        })
      }
    }
    
    return combined
  }

  sortResults(results, sortBy, sortOrder) {
    const sortFunctions = {
      relevance: (a, b) => b.score - a.score,
      date: (a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0),
      popularity: (a, b) => (b.popularity || 0) - (a.popularity || 0),
      alphabetical: (a, b) => (a.title || a.name || '').localeCompare(b.title || b.name || '')
    }
    
    const sortFn = sortFunctions[sortBy] || sortFunctions.relevance
    const sorted = results.sort(sortFn)
    
    return sortOrder === 'asc' ? sorted.reverse() : sorted
  }

  // Boost calculation for different content types
  calculateMessageBoost(document) {
    let boost = 1.0
    
    // Recent messages get higher boost
    const age = Date.now() - new Date(document.timestamp || 0).getTime()
    const dayInMs = 24 * 60 * 60 * 1000
    
    if (age < dayInMs) boost *= 2.0
    else if (age < dayInMs * 7) boost *= 1.5
    else if (age < dayInMs * 30) boost *= 1.2
    
    // Messages with reactions get boost
    if (document.reactions && document.reactions.length > 0) {
      boost *= 1 + (document.reactions.length * 0.1)
    }
    
    // Messages from popular users get boost
    if (document.author_popularity) {
      boost *= 1 + (document.author_popularity * 0.3)
    }
    
    return boost
  }

  calculateUserBoost(document) {
    let boost = 1.0
    
    // Active users get higher boost
    if (document.last_active) {
      const lastActive = Date.now() - new Date(document.last_active).getTime()
      const hourInMs = 60 * 60 * 1000
      
      if (lastActive < hourInMs) boost *= 2.0
      else if (lastActive < hourInMs * 24) boost *= 1.5
    }
    
    // Users with more connections get boost
    if (document.connection_count) {
      boost *= 1 + Math.min(document.connection_count * 0.01, 0.5)
    }
    
    return boost
  }

  calculateChannelBoost(document) {
    let boost = 1.0
    
    // Active channels get higher boost
    if (document.last_message_at) {
      const lastMessage = Date.now() - new Date(document.last_message_at).getTime()
      const hourInMs = 60 * 60 * 1000
      
      if (lastMessage < hourInMs) boost *= 2.0
      else if (lastMessage < hourInMs * 24) boost *= 1.5
    }
    
    // Channels with more members get boost
    if (document.member_count) {
      boost *= 1 + Math.min(document.member_count * 0.001, 0.3)
    }
    
    return boost
  }

  calculateServerBoost(document) {
    let boost = 1.0
    
    // Popular servers get boost
    if (document.member_count) {
      boost *= 1 + Math.min(document.member_count * 0.0001, 0.2)
    }
    
    // Active servers get boost
    if (document.activity_score) {
      boost *= 1 + (document.activity_score * 0.1)
    }
    
    return boost
  }

  // Event handlers
  handleDataChange(event) {
    const { type, operation, data } = event
    
    switch (operation) {
      case 'create':
        this.addDocument(type, data)
        break
      case 'update':
        this.updateDocument(type, data)
        break
      case 'delete':
        this.removeDocument(type, data.id)
        break
    }
  }

  handleWebSocketMessage(event) {
    const { type, data } = event
    
    switch (type) {
      case 'message_created':
        this.addDocument('messages', {
          id: data.id,
          content: data.content,
          author_name: data.author.username,
          author_popularity: data.author.popularity || 0,
          timestamp: data.timestamp,
          channel_id: data.channel_id
        })
        break
      
      case 'user_updated':
        this.updateDocument('users', data)
        break
      
      case 'channel_updated':
        this.updateDocument('channels', data)
        break
    }
  }

  // Cache management
  generateCacheKey(query, options) {
    const optionsStr = JSON.stringify(options, Object.keys(options).sort())
    return `${query}:${btoa(optionsStr)}`
  }

  cacheSearchResults(cacheKey, results) {
    if (this.queryCache.size >= this.config.maxCacheSize) {
      // Remove oldest entries
      const oldest = Array.from(this.queryCache.entries())
        .sort(([, a], [, b]) => a.timestamp - b.timestamp)[0]
      
      this.queryCache.delete(oldest[0])
    }
    
    this.queryCache.set(cacheKey, {
      results,
      timestamp: Date.now()
    })
  }

  invalidateRelatedCache(document) {
    // Remove cache entries that might be affected by this document change
    const relatedKeys = []
    
    for (const [key, cached] of this.queryCache.entries()) {
      // Simple heuristic: if document type or ID appears in results
      const hasRelated = cached.results.results.some(result => 
        result.type === document.type || 
        result.id === document.id
      )
      
      if (hasRelated) {
        relatedKeys.push(key)
      }
    }
    
    relatedKeys.forEach(key => this.queryCache.delete(key))
  }

  cleanupQueryCache() {
    const now = Date.now()
    
    for (const [key, cached] of this.queryCache.entries()) {
      if (now - cached.timestamp > this.config.cacheTTL) {
        this.queryCache.delete(key)
      }
    }
  }

  // Auto-complete management
  updateAutoCompleteFromDocument(document) {
    if (!this.autoCompleteIndex) return
    
    // Extract searchable terms from document
    const terms = []
    
    if (document.title) terms.push(document.title)
    if (document.name) terms.push(document.name)
    if (document.username) terms.push(document.username)
    if (document.display_name) terms.push(document.display_name)
    
    terms.forEach(term => {
      this.autoCompleteIndex.addTerm(term)
    })
  }

  updateAutoComplete() {
    if (!this.autoCompleteIndex) return
    
    // Add popular search terms
    for (const [query, count] of this.popularQueries.entries()) {
      if (count > 5) { // Only add if searched more than 5 times
        this.autoCompleteIndex.addTerm(query, count)
      }
    }
  }

  getPopularQuerySuggestions(query, limit) {
    const suggestions = []
    const queryLower = query.toLowerCase()
    
    for (const [popularQuery, count] of this.popularQueries.entries()) {
      if (popularQuery.toLowerCase().includes(queryLower) && 
          popularQuery !== query) {
        suggestions.push(popularQuery)
      }
    }
    
    return suggestions
      .sort((a, b) => (this.popularQueries.get(b) || 0) - (this.popularQueries.get(a) || 0))
      .slice(0, limit)
  }

  // Metrics and monitoring
  updateSearchMetrics(query, searchTime, resultCount) {
    this.metrics.searchesPerformed++
    this.metrics.totalSearchTime += searchTime
    this.metrics.averageSearchTime = this.metrics.totalSearchTime / this.metrics.searchesPerformed
    
    // Track query popularity
    const normalizedQuery = this.normalizeQuery(query)
    this.popularQueries.set(normalizedQuery, (this.popularQueries.get(normalizedQuery) || 0) + 1)
    
    // Add to search history
    this.searchHistory.push({
      query: normalizedQuery,
      timestamp: Date.now(),
      resultCount,
      searchTime
    })
    
    // Keep history manageable
    if (this.searchHistory.length > 1000) {
      this.searchHistory = this.searchHistory.slice(-1000)
    }
  }

  logPerformanceMetrics() {
    if (this.metrics.searchesPerformed > 0) {
      const totalIndexSize = Array.from(this.indexes.values())
        .reduce((sum, index) => sum + index.getSize(), 0)
      
      console.log('[SearchIndexing] Performance metrics:', {
        documentsIndexed: this.metrics.documentsIndexed,
        searchesPerformed: this.metrics.searchesPerformed,
        averageSearchTime: this.metrics.averageSearchTime.toFixed(2) + 'ms',
        cacheHitRate: ((this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses)) * 100).toFixed(1) + '%',
        indexSize: totalIndexSize,
        popularQueries: this.popularQueries.size
      })
    }
  }

  // Public API
  getMetrics() {
    const totalIndexSize = Array.from(this.indexes.values())
      .reduce((sum, index) => sum + index.getSize(), 0)
    
    return {
      ...this.metrics,
      indexSize: totalIndexSize,
      cacheSize: this.queryCache.size,
      popularQueriesCount: this.popularQueries.size,
      searchHistorySize: this.searchHistory.length
    }
  }

  getPopularQueries(limit = 10) {
    return Array.from(this.popularQueries.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([query, count]) => ({ query, count }))
  }

  getSearchHistory(limit = 50) {
    return this.searchHistory
      .slice(-limit)
      .reverse()
  }

  rebuildIndex(indexType) {
    const index = this.indexes.get(indexType)
    if (index) {
      return index.rebuild()
    }
    throw new Error(`Index not found: ${indexType}`)
  }

  clearCache() {
    this.queryCache.clear()
    this.searchHistory = []
    this.popularQueries.clear()
  }

  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig }
  }

  // Cleanup
  destroy() {
    for (const index of this.indexes.values()) {
      index.destroy()
    }
    
    this.indexes.clear()
    this.documentStore.clear()
    this.queryCache.clear()
    this.searchHistory = []
    this.popularQueries.clear()
  }
}

// Individual search index implementation
class SearchIndex {
  constructor(type, config) {
    this.type = type
    this.config = config
    this.invertedIndex = new Map() // term -> Set of document IDs
    this.documents = new Map() // documentId -> document
    this.termFrequency = new Map() // term -> frequency
    this.documentCount = 0
  }

  async addDocument(document) {
    const documentId = document.id
    this.documents.set(documentId, document)
    
    // Extract terms from all searchable fields
    const terms = this.extractTerms(document)
    
    // Update inverted index
    for (const term of terms) {
      if (!this.invertedIndex.has(term)) {
        this.invertedIndex.set(term, new Set())
      }
      this.invertedIndex.get(term).add(documentId)
      
      // Update term frequency
      this.termFrequency.set(term, (this.termFrequency.get(term) || 0) + 1)
    }
    
    this.documentCount++
  }

  async updateDocument(document) {
    // Remove old version
    await this.removeDocument(document.id)
    
    // Add updated version
    await this.addDocument(document)
  }

  async removeDocument(documentId) {
    const document = this.documents.get(documentId)
    if (!document) return
    
    // Extract terms to remove
    const terms = this.extractTerms(document)
    
    // Update inverted index
    for (const term of terms) {
      const documentSet = this.invertedIndex.get(term)
      if (documentSet) {
        documentSet.delete(documentId)
        
        if (documentSet.size === 0) {
          this.invertedIndex.delete(term)
          this.termFrequency.delete(term)
        } else {
          this.termFrequency.set(term, this.termFrequency.get(term) - 1)
        }
      }
    }
    
    this.documents.delete(documentId)
    this.documentCount--
  }

  async search(query, options = {}) {
    const { fuzzy = false, limit = 50 } = options
    
    const queryTerms = this.tokenizeQuery(query)
    const results = []
    
    // Find matching documents
    const candidateDocuments = this.findCandidateDocuments(queryTerms, fuzzy)
    
    // Score documents
    for (const documentId of candidateDocuments) {
      const document = this.documents.get(documentId)
      if (!document) continue
      
      const score = this.calculateScore(document, queryTerms, query)
      
      results.push({
        id: documentId,
        document,
        score,
        title: document.title || document.name || document.username || 'Untitled',
        snippet: this.generateSnippet(document, queryTerms)
      })
    }
    
    // Sort by score and limit
    results.sort((a, b) => b.score - a.score)
    
    return {
      type: this.type,
      results: results.slice(0, limit)
    }
  }

  extractTerms(document) {
    const terms = new Set()
    
    for (const field of this.config.fields) {
      const fieldValue = document[field]
      if (fieldValue && typeof fieldValue === 'string') {
        const fieldTerms = this.tokenizeText(fieldValue)
        fieldTerms.forEach(term => terms.add(term))
      }
    }
    
    return terms
  }

  tokenizeText(text) {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(term => term.length > 1)
  }

  tokenizeQuery(query) {
    return this.tokenizeText(query)
  }

  findCandidateDocuments(queryTerms, fuzzy) {
    const candidates = new Set()
    
    for (const term of queryTerms) {
      // Exact matches
      const exactMatches = this.invertedIndex.get(term) || new Set()
      exactMatches.forEach(docId => candidates.add(docId))
      
      // Fuzzy matches
      if (fuzzy) {
        const fuzzyMatches = this.findFuzzyMatches(term)
        fuzzyMatches.forEach(docId => candidates.add(docId))
      }
    }
    
    return candidates
  }

  findFuzzyMatches(term) {
    const matches = new Set()
    const threshold = 0.8 // 80% similarity
    
    for (const indexTerm of this.invertedIndex.keys()) {
      const similarity = this.calculateSimilarity(term, indexTerm)
      if (similarity >= threshold) {
        const documents = this.invertedIndex.get(indexTerm) || new Set()
        documents.forEach(docId => matches.add(docId))
      }
    }
    
    return matches
  }

  calculateSimilarity(term1, term2) {
    // Simple Levenshtein distance-based similarity
    const distance = this.levenshteinDistance(term1, term2)
    const maxLength = Math.max(term1.length, term2.length)
    return maxLength === 0 ? 1 : 1 - (distance / maxLength)
  }

  levenshteinDistance(str1, str2) {
    const matrix = []
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i]
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1]
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          )
        }
      }
    }
    
    return matrix[str2.length][str1.length]
  }

  calculateScore(document, queryTerms, originalQuery) {
    let score = 0
    
    // TF-IDF scoring
    for (const term of queryTerms) {
      const tf = this.getTermFrequencyInDocument(document, term)
      const idf = this.getInverseDocumentFrequency(term)
      score += tf * idf
    }
    
    // Field weight bonus
    for (const [field, weight] of Object.entries(this.config.weights)) {
      const fieldValue = document[field] || ''
      const fieldScore = this.calculateFieldScore(fieldValue, queryTerms)
      score += fieldScore * weight
    }
    
    // Boost factor
    if (this.config.boost) {
      const boostFactor = this.config.boost(document)
      score *= boostFactor
    }
    
    // Exact phrase bonus
    if (this.containsExactPhrase(document, originalQuery)) {
      score *= 2.0
    }
    
    return score
  }

  getTermFrequencyInDocument(document, term) {
    let count = 0
    
    for (const field of this.config.fields) {
      const fieldValue = document[field] || ''
      const terms = this.tokenizeText(fieldValue)
      count += terms.filter(t => t === term).length
    }
    
    return count
  }

  getInverseDocumentFrequency(term) {
    const documentFrequency = (this.invertedIndex.get(term) || new Set()).size
    return Math.log(this.documentCount / (documentFrequency + 1))
  }

  calculateFieldScore(fieldValue, queryTerms) {
    let score = 0
    const fieldTerms = this.tokenizeText(fieldValue)
    
    for (const queryTerm of queryTerms) {
      const matches = fieldTerms.filter(term => term === queryTerm).length
      score += matches
    }
    
    return score
  }

  containsExactPhrase(document, phrase) {
    const normalizedPhrase = phrase.toLowerCase()
    
    for (const field of this.config.fields) {
      const fieldValue = (document[field] || '').toLowerCase()
      if (fieldValue.includes(normalizedPhrase)) {
        return true
      }
    }
    
    return false
  }

  generateSnippet(document, queryTerms, maxLength = 150) {
    // Find the best field that contains query terms
    let bestField = ''
    let maxMatches = 0
    
    for (const field of this.config.fields) {
      const fieldValue = document[field] || ''
      const matches = queryTerms.filter(term => 
        fieldValue.toLowerCase().includes(term.toLowerCase())
      ).length
      
      if (matches > maxMatches) {
        maxMatches = matches
        bestField = fieldValue
      }
    }
    
    if (!bestField) {
      bestField = document[this.config.fields[0]] || ''
    }
    
    // Generate snippet around query terms
    const snippet = this.extractSnippet(bestField, queryTerms, maxLength)
    return this.highlightTerms(snippet, queryTerms)
  }

  extractSnippet(text, queryTerms, maxLength) {
    const words = text.split(/\s+/)
    
    // Find first occurrence of any query term
    let startIndex = 0
    for (let i = 0; i < words.length; i++) {
      if (queryTerms.some(term => words[i].toLowerCase().includes(term.toLowerCase()))) {
        startIndex = Math.max(0, i - 10) // Start 10 words before
        break
      }
    }
    
    // Extract snippet
    const snippetWords = words.slice(startIndex, startIndex + 30) // Up to 30 words
    let snippet = snippetWords.join(' ')
    
    if (snippet.length > maxLength) {
      snippet = snippet.substring(0, maxLength - 3) + '...'
    }
    
    return snippet
  }

  highlightTerms(text, queryTerms) {
    let highlighted = text
    
    for (const term of queryTerms) {
      const regex = new RegExp(`(${term})`, 'gi')
      highlighted = highlighted.replace(regex, '<mark>$1</mark>')
    }
    
    return highlighted
  }

  getSize() {
    return this.documentCount
  }

  rebuild() {
    // Clear indexes
    this.invertedIndex.clear()
    this.termFrequency.clear()
    
    // Rebuild from documents
    const documents = Array.from(this.documents.values())
    this.documents.clear()
    this.documentCount = 0
    
    return Promise.all(documents.map(doc => this.addDocument(doc)))
  }

  destroy() {
    this.invertedIndex.clear()
    this.documents.clear()
    this.termFrequency.clear()
    this.documentCount = 0
  }
}

// Auto-complete index for query suggestions
class AutoCompleteIndex {
  constructor() {
    this.trie = new TrieNode()
    this.termCounts = new Map()
  }

  addTerm(term, weight = 1) {
    const normalizedTerm = term.toLowerCase().trim()
    if (normalizedTerm.length < 2) return
    
    // Add to trie
    let node = this.trie
    for (const char of normalizedTerm) {
      if (!node.children.has(char)) {
        node.children.set(char, new TrieNode())
      }
      node = node.children.get(char)
    }
    node.isEnd = true
    node.term = normalizedTerm
    node.weight = (node.weight || 0) + weight
    
    // Update term counts
    this.termCounts.set(normalizedTerm, (this.termCounts.get(normalizedTerm) || 0) + weight)
  }

  getSuggestions(prefix, limit = 10) {
    const normalizedPrefix = prefix.toLowerCase().trim()
    if (normalizedPrefix.length === 0) return []
    
    // Navigate to prefix node
    let node = this.trie
    for (const char of normalizedPrefix) {
      if (!node.children.has(char)) {
        return []
      }
      node = node.children.get(char)
    }
    
    // Collect suggestions
    const suggestions = []
    this.collectSuggestions(node, suggestions, limit)
    
    // Sort by weight/popularity
    suggestions.sort((a, b) => (b.weight || 0) - (a.weight || 0))
    
    return suggestions.slice(0, limit).map(s => s.term)
  }

  collectSuggestions(node, suggestions, limit) {
    if (suggestions.length >= limit) return
    
    if (node.isEnd && node.term) {
      suggestions.push({ term: node.term, weight: node.weight })
    }
    
    for (const child of node.children.values()) {
      this.collectSuggestions(child, suggestions, limit)
      if (suggestions.length >= limit) break
    }
  }
}

class TrieNode {
  constructor() {
    this.children = new Map()
    this.isEnd = false
    this.term = null
    this.weight = 0
  }
}

export default SearchIndexingService