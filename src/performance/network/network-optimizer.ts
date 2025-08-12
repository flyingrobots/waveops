/**
 * Network optimization system with request batching and rate limiting
 */

import { EventEmitter } from 'events';
import {
  NetworkConfig,
  RateLimitStrategy,
  BatchingConfig,
  RetryStrategy,
  CircuitBreakerConfig,
  NetworkOptimizationError,
  NetworkOperation
} from '../types';
import { RequestBatcher } from './request-batcher';
import { RateLimiter } from './rate-limiter';
import { ConnectionPool } from './connection-pool';
import { CircuitBreaker } from './circuit-breaker';

export interface NetworkMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  avgResponseTime: number;
  throughput: number; // requests per second
  batchMetrics: BatchMetrics;
  rateLimitMetrics: RateLimitMetrics;
  circuitBreakerMetrics: CircuitBreakerMetrics;
  connectionMetrics: ConnectionMetrics;
}

export interface BatchMetrics {
  totalBatches: number;
  avgBatchSize: number;
  batchingEfficiency: number; // percentage
  avgBatchWaitTime: number;
}

export interface RateLimitMetrics {
  requestsAllowed: number;
  requestsThrottled: number;
  currentRate: number;
  burstCapacityUsed: number;
}

export interface CircuitBreakerMetrics {
  circuitState: 'closed' | 'open' | 'half-open';
  failureCount: number;
  successCount: number;
  lastFailureTime?: Date;
  nextRetryTime?: Date;
}

export interface ConnectionMetrics {
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  connectionErrors: number;
  avgConnectionTime: number;
}

export interface NetworkRequest {
  id: string;
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
  retryable?: boolean;
  priority?: number;
  metadata?: Record<string, unknown>;
}

export interface NetworkResponse {
  id: string;
  status: number;
  headers: Record<string, string>;
  body: unknown;
  responseTime: number;
  fromCache?: boolean;
  retryCount?: number;
}

export class NetworkOptimizer extends EventEmitter {
  private readonly config: NetworkConfig;
  private readonly batcher: RequestBatcher;
  private readonly rateLimiter: RateLimiter;
  private readonly connectionPool: ConnectionPool;
  private readonly circuitBreakers: Map<string, CircuitBreaker>;
  private readonly metrics: NetworkMetrics;
  private readonly requestTimings: Map<string, number>;

  constructor(config: NetworkConfig) {
    super();
    this.config = config;
    this.circuitBreakers = new Map();
    this.requestTimings = new Map();
    
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      avgResponseTime: 0,
      throughput: 0,
      batchMetrics: {
        totalBatches: 0,
        avgBatchSize: 0,
        batchingEfficiency: 0,
        avgBatchWaitTime: 0
      },
      rateLimitMetrics: {
        requestsAllowed: 0,
        requestsThrottled: 0,
        currentRate: 0,
        burstCapacityUsed: 0
      },
      circuitBreakerMetrics: {
        circuitState: 'closed',
        failureCount: 0,
        successCount: 0
      },
      connectionMetrics: {
        totalConnections: 0,
        activeConnections: 0,
        idleConnections: 0,
        connectionErrors: 0,
        avgConnectionTime: 0
      }
    };

    this.batcher = new RequestBatcher(config.github.batchingConfig);
    this.rateLimiter = new RateLimiter(config.github.rateLimitStrategy);
    this.connectionPool = new ConnectionPool(config.connections);

    this.setupEventListeners();
  }

  /**
   * Execute a network request with all optimizations applied
   */
  async executeRequest(request: NetworkRequest): Promise<NetworkResponse> {
    const startTime = Date.now();
    this.requestTimings.set(request.id, startTime);
    this.metrics.totalRequests++;

    try {
      // Check circuit breaker
      const circuitBreaker = this.getOrCreateCircuitBreaker(this.getEndpointKey(request));
      if (circuitBreaker.isOpen()) {
        throw new NetworkOptimizationError(
          `Circuit breaker is open for ${request.url}`,
          NetworkOperation.RETRY_STRATEGY,
          false
        );
      }

      // Apply rate limiting
      await this.rateLimiter.waitForSlot(request);

      // Batch request if applicable
      if (this.shouldBatch(request)) {
        return await this.batcher.addRequest(request) as NetworkResponse;
      }

      // Execute single request
      const response = await this.executeSingleRequest(request);
      
      // Record success
      circuitBreaker.recordSuccess();
      this.recordSuccess(request.id, response, startTime);
      
      return response;
    } catch (error) {
      // Record failure
      const circuitBreaker = this.getOrCreateCircuitBreaker(this.getEndpointKey(request));
      circuitBreaker.recordFailure();
      
      this.recordFailure(request.id, error, startTime);
      
      // Retry if configured
      if (this.shouldRetry(request, error)) {
        return await this.retryRequest(request);
      }
      
      throw error;
    }
  }

  /**
   * Execute multiple requests concurrently with optimizations
   */
  async executeBatch(requests: NetworkRequest[]): Promise<NetworkResponse[]> {
    // Group requests by endpoint for better batching
    const groupedRequests = this.groupRequestsByEndpoint(requests);
    const results: NetworkResponse[] = [];

    for (const [endpoint, endpointRequests] of groupedRequests.entries()) {
      // Check if we should batch these requests
      if (endpointRequests.length > 1 && this.config.github.batchingConfig.enabled) {
        const batchedResponse = await this.batcher.executeBatch(endpointRequests);
        results.push(...(batchedResponse as NetworkResponse[]));
      } else {
        // Execute individually with concurrency control
        const concurrentResponses = await this.executeConcurrent(endpointRequests);
        results.push(...concurrentResponses);
      }
    }

    return results;
  }

  /**
   * Get network optimization metrics
   */
  getMetrics(): NetworkMetrics {
    // Update throughput
    this.updateThroughputMetrics();
    
    // Get metrics from components
    this.metrics.batchMetrics = this.batcher.getMetrics();
    this.metrics.rateLimitMetrics = this.rateLimiter.getMetrics();
    this.metrics.connectionMetrics = this.connectionPool.getMetrics();
    
    // Update circuit breaker metrics (aggregate)
    this.updateCircuitBreakerMetrics();

    return { ...this.metrics };
  }

  /**
   * Close network optimizer and cleanup resources
   */
  async close(): Promise<void> {
    await Promise.all([
      this.batcher.close(),
      this.rateLimiter.close(),
      this.connectionPool.close()
    ]);

    this.circuitBreakers.clear();
    this.requestTimings.clear();
    
    this.emit('closed');
  }

  private async executeSingleRequest(request: NetworkRequest): Promise<NetworkResponse> {
    const connection = await this.connectionPool.acquire();
    
    try {
      // Simulate network request execution
      // In a real implementation, this would use the actual HTTP client
      const response = await this.performHttpRequest(request, connection);
      return response;
    } finally {
      this.connectionPool.release(connection);
    }
  }

  private async performHttpRequest(
    request: NetworkRequest, 
    connection: unknown
  ): Promise<NetworkResponse> {
    // Mock HTTP request - in production, this would use axios, node-fetch, etc.
    const startTime = Date.now();
    
    // Simulate network latency
    await new Promise(resolve => setTimeout(resolve, Math.random() * 100 + 50));
    
    const responseTime = Date.now() - startTime;
    
    // Simulate occasional failures
    if (Math.random() < 0.05) { // 5% failure rate
      throw new Error('Network request failed');
    }

    return {
      id: request.id,
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: { success: true, data: 'mock response' },
      responseTime
    };
  }

  private async executeConcurrent(requests: NetworkRequest[]): Promise<NetworkResponse[]> {
    const maxConcurrency = this.config.github.parallelismLimits.maxConcurrentRequests;
    const results: NetworkResponse[] = [];
    
    for (let i = 0; i < requests.length; i += maxConcurrency) {
      const batch = requests.slice(i, i + maxConcurrency);
      const batchPromises = batch.map(request => this.executeRequest(request));
      const batchResults = await Promise.allSettled(batchPromises);
      
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          // Handle error - could retry or log
          this.emit('error', result.reason);
        }
      }
    }
    
    return results;
  }

  private shouldBatch(request: NetworkRequest): boolean {
    if (!this.config.github.batchingConfig.enabled) return false;
    
    // Check if request is batchable based on endpoint patterns
    const batchablePatterns = ['/repos/', '/issues/', '/pulls/'];
    return batchablePatterns.some(pattern => request.url.includes(pattern));
  }

  private shouldRetry(request: NetworkRequest, error: unknown): boolean {
    if (!request.retryable) return false;
    
    const retryStrategy = this.config.retryStrategies.github;
    const isRetryableError = this.isRetryableError(error, retryStrategy.retryableErrors);
    
    return isRetryableError;
  }

  private async retryRequest(request: NetworkRequest): Promise<NetworkResponse> {
    const retryStrategy = this.config.retryStrategies.github;
    let lastError: unknown;
    
    for (let attempt = 1; attempt <= retryStrategy.maxAttempts; attempt++) {
      try {
        const delay = this.calculateRetryDelay(attempt, retryStrategy);
        if (delay > 0) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        const response = await this.executeSingleRequest(request);
        response.retryCount = attempt;
        return response;
      } catch (error) {
        lastError = error;
        this.emit('retry-attempt', { request: request.id, attempt, error });
      }
    }
    
    throw lastError;
  }

  private calculateRetryDelay(attempt: number, strategy: RetryStrategy): number {
    let delay = strategy.initialDelayMs * Math.pow(strategy.backoffMultiplier, attempt - 1);
    delay = Math.min(delay, strategy.maxDelayMs);
    
    if (strategy.jitterEnabled) {
      delay *= 0.5 + Math.random() * 0.5; // Add 50% jitter
    }
    
    return delay;
  }

  private isRetryableError(error: unknown, retryableErrors: string[]): boolean {
    if (error instanceof Error) {
      return retryableErrors.some(pattern => error.message.includes(pattern));
    }
    return false;
  }

  private getOrCreateCircuitBreaker(key: string): CircuitBreaker {
    let circuitBreaker = this.circuitBreakers.get(key);
    
    if (!circuitBreaker) {
      const config = this.config.retryStrategies.github.circuitBreaker;
      circuitBreaker = new CircuitBreaker(config);
      this.circuitBreakers.set(key, circuitBreaker);
    }
    
    return circuitBreaker;
  }

  private getEndpointKey(request: NetworkRequest): string {
    // Extract endpoint pattern for circuit breaker grouping
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/').slice(0, 3); // Group by first few path segments
    return `${request.method}:${pathParts.join('/')}`;
  }

  private groupRequestsByEndpoint(requests: NetworkRequest[]): Map<string, NetworkRequest[]> {
    const groups = new Map<string, NetworkRequest[]>();
    
    for (const request of requests) {
      const endpoint = this.getEndpointKey(request);
      const existingGroup = groups.get(endpoint) || [];
      existingGroup.push(request);
      groups.set(endpoint, existingGroup);
    }
    
    return groups;
  }

  private recordSuccess(requestId: string, response: NetworkResponse, startTime: number): void {
    this.metrics.successfulRequests++;
    this.updateAvgResponseTime(response.responseTime);
    this.requestTimings.delete(requestId);
    
    this.emit('request-success', { requestId, response });
  }

  private recordFailure(requestId: string, error: unknown, startTime: number): void {
    this.metrics.failedRequests++;
    const responseTime = Date.now() - startTime;
    this.updateAvgResponseTime(responseTime);
    this.requestTimings.delete(requestId);
    
    this.emit('request-failure', { requestId, error, responseTime });
  }

  private updateAvgResponseTime(responseTime: number): void {
    const totalRequests = this.metrics.successfulRequests + this.metrics.failedRequests;
    const totalTime = this.metrics.avgResponseTime * (totalRequests - 1);
    this.metrics.avgResponseTime = (totalTime + responseTime) / totalRequests;
  }

  private updateThroughputMetrics(): void {
    // Calculate requests per second over the last minute
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    let recentRequests = 0;
    for (const [requestId, startTime] of this.requestTimings.entries()) {
      if (startTime >= oneMinuteAgo) {
        recentRequests++;
      }
    }
    
    this.metrics.throughput = recentRequests / 60; // requests per second
  }

  private updateCircuitBreakerMetrics(): void {
    let totalFailures = 0;
    let totalSuccesses = 0;
    let openCircuits = 0;
    
    for (const breaker of this.circuitBreakers.values()) {
      const metrics = breaker.getMetrics();
      totalFailures += metrics.failureCount;
      totalSuccesses += metrics.successCount;
      
      if (metrics.state === 'open') {
        openCircuits++;
      }
    }
    
    this.metrics.circuitBreakerMetrics = {
      circuitState: openCircuits > 0 ? 'open' : 'closed',
      failureCount: totalFailures,
      successCount: totalSuccesses
    };
  }

  private setupEventListeners(): void {
    this.batcher.on('batch-executed', (metrics) => {
      this.emit('network:batch-executed', metrics);
    });

    this.rateLimiter.on('request-throttled', (data) => {
      this.emit('network:request-throttled', data);
    });

    this.connectionPool.on('connection-created', (data) => {
      this.emit('network:connection-created', data);
    });

    this.connectionPool.on('connection-error', (error) => {
      this.emit('network:connection-error', error);
    });
  }
}