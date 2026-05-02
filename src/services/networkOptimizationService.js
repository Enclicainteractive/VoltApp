class NetworkOptimizationService {
    constructor() {
        this.requestQueue = new Map();
        this.connectionPool = new Map();
        this.http2Sessions = new Map();
        this.multiplexedRequests = new Map();
        this.priorityQueue = new Map();
        this.retryQueue = new Map();
        
        this.config = {
            maxConcurrentRequests: 6,
            maxRequestsPerHost: 3,
            http2MaxConcurrentStreams: 100,
            requestTimeout: 30000,
            retryAttempts: 3,
            retryDelay: 1000,
            keepAliveTimeout: 60000,
            priorityLevels: {
                critical: 1,
                high: 2,
                normal: 3,
                low: 4,
                background: 5
            }
        };

        this.metrics = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            averageResponseTime: 0,
            http2RequestsCount: 0,
            multiplexedRequestsCount: 0,
            connectionReuseCount: 0
        };

        this.initializeService();
    }

    initializeService() {
        this.setupConnectionDetection();
        this.setupRequestInterception();
        this.startConnectionPoolCleanup();
        this.monitorNetworkPerformance();
    }

    setupConnectionDetection() {
        if ('connection' in navigator) {
            navigator.connection.addEventListener('change', () => {
                this.handleConnectionChange();
            });
        }

        if ('onLine' in navigator) {
            window.addEventListener('online', () => this.handleOnlineStatusChange(true));
            window.addEventListener('offline', () => this.handleOnlineStatusChange(false));
        }
    }

    handleConnectionChange() {
        const connection = navigator.connection;
        const effectiveType = connection?.effectiveType;
        
        if (effectiveType === '2g' || effectiveType === 'slow-2g') {
            this.config.maxConcurrentRequests = 2;
            this.config.requestTimeout = 60000;
        } else if (effectiveType === '3g') {
            this.config.maxConcurrentRequests = 4;
            this.config.requestTimeout = 45000;
        } else {
            this.config.maxConcurrentRequests = 6;
            this.config.requestTimeout = 30000;
        }

        this.adjustQueueProcessing();
    }

    handleOnlineStatusChange(isOnline) {
        if (isOnline) {
            this.processQueuedRequests();
        } else {
            this.pauseAllRequests();
        }
    }

    setupRequestInterception() {
        if (typeof window !== 'undefined' && window.fetch) {
            const originalFetch = window.fetch;
            
            window.fetch = async (resource, options = {}) => {
                return this.optimizedFetch(originalFetch, resource, options);
            };
        }
    }

    async optimizedFetch(originalFetch, resource, options = {}) {
        const url = typeof resource === 'string' ? resource : resource.url;
        const hostname = new URL(url, window.location.origin).hostname;
        
        const requestConfig = {
            url,
            options,
            priority: options.priority || 'normal',
            retries: 0,
            timestamp: Date.now(),
            hostname
        };

        try {
            if (this.supportsHTTP2(hostname)) {
                return await this.handleHTTP2Request(originalFetch, requestConfig);
            } else {
                return await this.handleHTTP1Request(originalFetch, requestConfig);
            }
        } catch (error) {
            return await this.handleRequestError(originalFetch, requestConfig, error);
        }
    }

    supportsHTTP2(hostname) {
        return true;
    }

    async handleHTTP2Request(originalFetch, requestConfig) {
        const { url, options, hostname, priority } = requestConfig;
        
        if (!this.http2Sessions.has(hostname)) {
            this.http2Sessions.set(hostname, {
                activeStreams: 0,
                maxConcurrentStreams: this.config.http2MaxConcurrentStreams,
                lastUsed: Date.now(),
                pendingRequests: []
            });
        }

        const session = this.http2Sessions.get(hostname);

        if (session.activeStreams >= session.maxConcurrentStreams) {
            return this.queueHTTP2Request(originalFetch, requestConfig);
        }

        session.activeStreams++;
        session.lastUsed = Date.now();
        this.metrics.http2RequestsCount++;

        try {
            const enhancedOptions = {
                ...options,
                headers: {
                    ...options.headers,
                    'Connection': 'keep-alive',
                    'Keep-Alive': `timeout=${Math.floor(this.config.keepAliveTimeout / 1000)}`
                }
            };

            const startTime = Date.now();
            const response = await Promise.race([
                originalFetch(url, enhancedOptions),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Request timeout')), this.config.requestTimeout)
                )
            ]);

            this.updateMetrics(true, Date.now() - startTime);
            this.processNextHTTP2Request(originalFetch, hostname);

            return response;

        } finally {
            session.activeStreams--;
        }
    }

    async queueHTTP2Request(originalFetch, requestConfig) {
        const { hostname } = requestConfig;
        const session = this.http2Sessions.get(hostname);
        
        return new Promise((resolve, reject) => {
            session.pendingRequests.push({
                requestConfig,
                resolve,
                reject,
                originalFetch
            });

            session.pendingRequests.sort((a, b) => {
                const aPriority = this.config.priorityLevels[a.requestConfig.priority] || 3;
                const bPriority = this.config.priorityLevels[b.requestConfig.priority] || 3;
                return aPriority - bPriority;
            });
        });
    }

    async processNextHTTP2Request(originalFetch, hostname) {
        const session = this.http2Sessions.get(hostname);
        if (!session || session.pendingRequests.length === 0) {
            return;
        }

        const { requestConfig, resolve, reject } = session.pendingRequests.shift();
        
        try {
            const response = await this.handleHTTP2Request(originalFetch, requestConfig);
            resolve(response);
        } catch (error) {
            reject(error);
        }
    }

    async handleHTTP1Request(originalFetch, requestConfig) {
        const { url, options, hostname } = requestConfig;

        if (!this.connectionPool.has(hostname)) {
            this.connectionPool.set(hostname, {
                activeConnections: 0,
                maxConnections: this.config.maxRequestsPerHost,
                lastUsed: Date.now(),
                pendingRequests: []
            });
        }

        const pool = this.connectionPool.get(hostname);

        if (pool.activeConnections >= pool.maxConnections) {
            return this.queueHTTP1Request(originalFetch, requestConfig);
        }

        pool.activeConnections++;
        pool.lastUsed = Date.now();
        this.metrics.connectionReuseCount++;

        try {
            const enhancedOptions = {
                ...options,
                headers: {
                    ...options.headers,
                    'Connection': 'keep-alive'
                }
            };

            const startTime = Date.now();
            const response = await Promise.race([
                originalFetch(url, enhancedOptions),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Request timeout')), this.config.requestTimeout)
                )
            ]);

            this.updateMetrics(true, Date.now() - startTime);
            this.processNextHTTP1Request(originalFetch, hostname);

            return response;

        } finally {
            pool.activeConnections--;
        }
    }

    async queueHTTP1Request(originalFetch, requestConfig) {
        const { hostname } = requestConfig;
        const pool = this.connectionPool.get(hostname);
        
        return new Promise((resolve, reject) => {
            pool.pendingRequests.push({
                requestConfig,
                resolve,
                reject,
                originalFetch
            });

            pool.pendingRequests.sort((a, b) => {
                const aPriority = this.config.priorityLevels[a.requestConfig.priority] || 3;
                const bPriority = this.config.priorityLevels[b.requestConfig.priority] || 3;
                return aPriority - bPriority;
            });
        });
    }

    async processNextHTTP1Request(originalFetch, hostname) {
        const pool = this.connectionPool.get(hostname);
        if (!pool || pool.pendingRequests.length === 0) {
            return;
        }

        const { requestConfig, resolve, reject } = pool.pendingRequests.shift();
        
        try {
            const response = await this.handleHTTP1Request(originalFetch, requestConfig);
            resolve(response);
        } catch (error) {
            reject(error);
        }
    }

    async handleRequestError(originalFetch, requestConfig, error) {
        const { url, options, retries } = requestConfig;

        if (retries < this.config.retryAttempts && this.isRetryableError(error)) {
            requestConfig.retries++;
            
            const delay = this.calculateRetryDelay(retries);
            await new Promise(resolve => setTimeout(resolve, delay));

            return this.optimizedFetch(originalFetch, url, options);
        }

        this.metrics.failedRequests++;
        throw error;
    }

    isRetryableError(error) {
        const retryableErrors = [
            'Request timeout',
            'NetworkError',
            'Failed to fetch',
            'AbortError'
        ];

        return retryableErrors.some(retryableError => 
            error.message?.includes(retryableError)
        );
    }

    calculateRetryDelay(attempt) {
        const exponentialDelay = this.config.retryDelay * Math.pow(2, attempt);
        const jitter = Math.random() * 1000;
        return Math.min(exponentialDelay + jitter, 10000);
    }

    async batchRequests(requests, options = {}) {
        const { 
            batchSize = 5, 
            concurrency = 3,
            priority = 'normal',
            timeout = 30000 
        } = options;

        const batches = [];
        for (let i = 0; i < requests.length; i += batchSize) {
            batches.push(requests.slice(i, i + batchSize));
        }

        const results = [];
        
        for (const batch of batches) {
            const batchPromises = batch.map(async (request) => {
                try {
                    const response = await fetch(request.url, {
                        ...request.options,
                        priority,
                        signal: AbortSignal.timeout(timeout)
                    });
                    return { success: true, data: await response.json(), request };
                } catch (error) {
                    return { success: false, error: error.message, request };
                }
            });

            const semaphore = new Array(concurrency).fill(null);
            const batchResults = await Promise.allSettled(
                batch.map(async (request, index) => {
                    await semaphore[index % concurrency];
                    return batchPromises[index];
                })
            );

            results.push(...batchResults.map(result => result.value));
        }

        this.metrics.multiplexedRequestsCount += requests.length;
        return results;
    }

    async prefetchResources(urls, priority = 'low') {
        const prefetchPromises = urls.map(async (url) => {
            try {
                const response = await fetch(url, {
                    method: 'GET',
                    mode: 'cors',
                    credentials: 'same-origin',
                    priority,
                    headers: {
                        'Purpose': 'prefetch'
                    }
                });

                if (response.ok) {
                    const blob = await response.blob();
                    if ('caches' in window) {
                        const cache = await caches.open('prefetch-cache');
                        await cache.put(url, new Response(blob));
                    }
                }

                return { url, success: true };
            } catch (error) {
                return { url, success: false, error: error.message };
            }
        });

        return Promise.allSettled(prefetchPromises);
    }

    async multicastRequest(urls, options = {}) {
        const { 
            selectBestResponse = true,
            timeout = 10000,
            priority = 'normal' 
        } = options;

        const requestPromises = urls.map(async (url) => {
            try {
                const response = await fetch(url, {
                    ...options,
                    priority,
                    signal: AbortSignal.timeout(timeout)
                });

                return {
                    url,
                    response,
                    timing: Date.now(),
                    success: true
                };
            } catch (error) {
                return {
                    url,
                    error: error.message,
                    timing: Date.now(),
                    success: false
                };
            }
        });

        if (selectBestResponse) {
            const firstSuccessful = await Promise.race(
                requestPromises.map(async (promise) => {
                    const result = await promise;
                    if (result.success) {
                        return result;
                    }
                    throw new Error(result.error);
                })
            );

            return firstSuccessful.response;
        } else {
            const allResults = await Promise.allSettled(requestPromises);
            return allResults.map(result => result.value);
        }
    }

    createRequestPipeline(requests) {
        const pipeline = {
            requests: [...requests],
            currentIndex: 0,
            results: [],
            
            async execute(concurrency = 3) {
                const executing = [];
                
                while (this.currentIndex < this.requests.length || executing.length > 0) {
                    while (executing.length < concurrency && this.currentIndex < this.requests.length) {
                        const request = this.requests[this.currentIndex++];
                        const promise = this.executeRequest(request)
                            .then(result => {
                                this.results.push(result);
                                const index = executing.indexOf(promise);
                                if (index > -1) {
                                    executing.splice(index, 1);
                                }
                                return result;
                            });
                        executing.push(promise);
                    }
                    
                    if (executing.length > 0) {
                        await Promise.race(executing);
                    }
                }
                
                return this.results;
            },
            
            async executeRequest(request) {
                return fetch(request.url, request.options);
            }
        };
        
        return pipeline;
    }

    startConnectionPoolCleanup() {
        setInterval(() => {
            this.cleanupConnectionPools();
        }, 30000);
    }

    cleanupConnectionPools() {
        const now = Date.now();
        const timeout = this.config.keepAliveTimeout;

        for (const [hostname, pool] of this.connectionPool.entries()) {
            if (now - pool.lastUsed > timeout) {
                this.connectionPool.delete(hostname);
            }
        }

        for (const [hostname, session] of this.http2Sessions.entries()) {
            if (now - session.lastUsed > timeout) {
                this.http2Sessions.delete(hostname);
            }
        }
    }

    adjustQueueProcessing() {
        for (const [hostname, pool] of this.connectionPool.entries()) {
            pool.maxConnections = Math.max(1, Math.floor(this.config.maxRequestsPerHost * 0.8));
        }

        for (const [hostname, session] of this.http2Sessions.entries()) {
            session.maxConcurrentStreams = Math.max(10, Math.floor(this.config.http2MaxConcurrentStreams * 0.8));
        }
    }

    pauseAllRequests() {
        for (const [hostname, pool] of this.connectionPool.entries()) {
            pool.pendingRequests.forEach(pending => {
                pending.reject(new Error('Network unavailable'));
            });
            pool.pendingRequests.length = 0;
        }

        for (const [hostname, session] of this.http2Sessions.entries()) {
            session.pendingRequests.forEach(pending => {
                pending.reject(new Error('Network unavailable'));
            });
            session.pendingRequests.length = 0;
        }
    }

    processQueuedRequests() {
        for (const [hostname, pool] of this.connectionPool.entries()) {
            while (pool.pendingRequests.length > 0 && pool.activeConnections < pool.maxConnections) {
                this.processNextHTTP1Request(null, hostname);
            }
        }

        for (const [hostname, session] of this.http2Sessions.entries()) {
            while (session.pendingRequests.length > 0 && session.activeStreams < session.maxConcurrentStreams) {
                this.processNextHTTP2Request(null, hostname);
            }
        }
    }

    monitorNetworkPerformance() {
        if ('PerformanceObserver' in window) {
            const observer = new PerformanceObserver((list) => {
                list.getEntries().forEach((entry) => {
                    if (entry.entryType === 'navigation' || entry.entryType === 'resource') {
                        this.analyzePerformanceEntry(entry);
                    }
                });
            });

            observer.observe({ entryTypes: ['navigation', 'resource'] });
        }
    }

    analyzePerformanceEntry(entry) {
        const timing = {
            dnsLookup: entry.domainLookupEnd - entry.domainLookupStart,
            tcpConnect: entry.connectEnd - entry.connectStart,
            tlsNegotiation: entry.secureConnectionStart > 0 ? entry.connectEnd - entry.secureConnectionStart : 0,
            requestSent: entry.responseStart - entry.requestStart,
            responseReceived: entry.responseEnd - entry.responseStart,
            total: entry.responseEnd - entry.startTime
        };

        if (timing.total > this.config.requestTimeout * 0.8) {
            this.optimizeSlowEndpoint(entry.name);
        }
    }

    optimizeSlowEndpoint(url) {
        const hostname = new URL(url).hostname;
        
        if (this.connectionPool.has(hostname)) {
            const pool = this.connectionPool.get(hostname);
            pool.maxConnections = Math.max(1, pool.maxConnections - 1);
        }

        if (this.http2Sessions.has(hostname)) {
            const session = this.http2Sessions.get(hostname);
            session.maxConcurrentStreams = Math.max(10, session.maxConcurrentStreams - 5);
        }
    }

    updateMetrics(success, responseTime) {
        this.metrics.totalRequests++;
        
        if (success) {
            this.metrics.successfulRequests++;
        } else {
            this.metrics.failedRequests++;
        }

        const totalCompleted = this.metrics.successfulRequests + this.metrics.failedRequests;
        this.metrics.averageResponseTime = (
            (this.metrics.averageResponseTime * (totalCompleted - 1) + responseTime) / totalCompleted
        );
    }

    getMetrics() {
        const successRate = this.metrics.totalRequests > 0 
            ? (this.metrics.successfulRequests / this.metrics.totalRequests) * 100 
            : 0;

        return {
            ...this.metrics,
            successRate: Math.round(successRate * 100) / 100,
            activeConnections: Array.from(this.connectionPool.values())
                .reduce((sum, pool) => sum + pool.activeConnections, 0),
            activeHTTP2Streams: Array.from(this.http2Sessions.values())
                .reduce((sum, session) => sum + session.activeStreams, 0),
            pendingRequests: Array.from(this.connectionPool.values())
                .reduce((sum, pool) => sum + pool.pendingRequests.length, 0) +
                Array.from(this.http2Sessions.values())
                .reduce((sum, session) => sum + session.pendingRequests.length, 0)
        };
    }

    getConnectionStatus() {
        return {
            isOnline: navigator.onLine,
            connectionType: navigator.connection?.type || 'unknown',
            effectiveType: navigator.connection?.effectiveType || 'unknown',
            downlink: navigator.connection?.downlink || 0,
            rtt: navigator.connection?.rtt || 0,
            saveData: navigator.connection?.saveData || false
        };
    }

    destroy() {
        this.connectionPool.clear();
        this.http2Sessions.clear();
        this.multiplexedRequests.clear();
        this.priorityQueue.clear();
        this.retryQueue.clear();
    }
}

export default NetworkOptimizationService;