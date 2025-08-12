/**
 * Advanced rate limiting system with multiple strategies
 */

import { EventEmitter } from 'events';
import { RateLimitStrategy } from '../types';

export interface RateLimitMetrics {
  requestsAllowed: number;
  requestsThrottled: number;
  currentRate: number;
  burstCapacityUsed: number;
}

interface RateLimitWindow {
  requests: number;
  windowStart: number;
  burstTokens: number;
}

interface RequestInfo {
  id: string;
  priority: number;
  timestamp: number;
}

export class RateLimiter extends EventEmitter {
  private readonly strategy: RateLimitStrategy;
  private readonly windows: Map<string, RateLimitWindow>;
  private readonly requestQueue: RequestInfo[];
  private readonly metrics: RateLimitMetrics;
  private readonly windowSize: number = 60000; // 1 minute
  private readonly maxRequestsPerWindow: number = 5000; // GitHub API limit
  private readonly burstCapacity: number = 1000;
  private processingTimer?: NodeJS.Timeout;

  constructor(strategy: RateLimitStrategy) {
    super();
    this.strategy = strategy;
    this.windows = new Map();
    this.requestQueue = [];
    
    this.metrics = {
      requestsAllowed: 0,
      requestsThrottled: 0,
      currentRate: 0,
      burstCapacityUsed: 0
    };

    this.startProcessing();
  }

  /**
   * Wait for a slot to become available for the request
   */
  async waitForSlot(request: { id: string; priority?: number; url?: string }): Promise<void> {
    const requestInfo: RequestInfo = {
      id: request.id,
      priority: request.priority || 0,
      timestamp: Date.now()
    };

    const key = this.getWindowKey(request.url || '');
    
    if (await this.tryAcquireSlot(key, requestInfo)) {
      this.metrics.requestsAllowed++;
      return;
    }

    // Add to queue if slot not available
    this.addToQueue(requestInfo);
    this.metrics.requestsThrottled++;
    
    this.emit('request-throttled', {
      requestId: request.id,
      queuePosition: this.requestQueue.length
    });

    return this.waitInQueue(request.id);
  }

  /**
   * Get rate limiting metrics
   */
  getMetrics(): RateLimitMetrics {
    this.updateCurrentRateMetric();
    return { ...this.metrics };
  }

  /**
   * Close rate limiter
   */
  async close(): Promise<void> {
    if (this.processingTimer) {
      clearInterval(this.processingTimer);
    }

    // Process remaining queued requests quickly
    while (this.requestQueue.length > 0) {
      await this.processQueue();
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    this.windows.clear();
    this.emit('closed');
  }

  private async tryAcquireSlot(windowKey: string, request: RequestInfo): Promise<boolean> {
    const now = Date.now();
    let window = this.windows.get(windowKey);

    if (!window || this.isWindowExpired(window, now)) {
      // Create new window
      window = {
        requests: 0,
        windowStart: now,
        burstTokens: this.burstCapacity
      };
      this.windows.set(windowKey, window);
    }

    // Apply strategy-specific logic
    switch (this.strategy) {
      case RateLimitStrategy.CONSERVATIVE:
        return this.tryConservativeAcquisition(window, request);
      case RateLimitStrategy.AGGRESSIVE:
        return this.tryAggressiveAcquisition(window, request);
      case RateLimitStrategy.ADAPTIVE:
        return this.tryAdaptiveAcquisition(window, request);
      case RateLimitStrategy.BURST_THEN_THROTTLE:
        return this.tryBurstThenThrottleAcquisition(window, request);
      default:
        return this.tryConservativeAcquisition(window, request);
    }
  }

  private tryConservativeAcquisition(window: RateLimitWindow, request: RequestInfo): boolean {
    const safeLimit = Math.floor(this.maxRequestsPerWindow * 0.7); // Use 70% of limit
    
    if (window.requests < safeLimit) {
      window.requests++;
      return true;
    }
    
    return false;
  }

  private tryAggressiveAcquisition(window: RateLimitWindow, request: RequestInfo): boolean {
    const aggressiveLimit = Math.floor(this.maxRequestsPerWindow * 0.95); // Use 95% of limit
    
    if (window.requests < aggressiveLimit) {
      window.requests++;
      return true;
    }
    
    return false;
  }

  private tryAdaptiveAcquisition(window: RateLimitWindow, request: RequestInfo): boolean {
    // Adapt based on current queue size and historical success rate
    const queueRatio = this.requestQueue.length / 100; // Normalize queue size
    const adaptiveLimit = Math.floor(
      this.maxRequestsPerWindow * Math.max(0.5, 0.9 - queueRatio)
    );
    
    if (window.requests < adaptiveLimit) {
      window.requests++;
      return true;
    }
    
    return false;
  }

  private tryBurstThenThrottleAcquisition(window: RateLimitWindow, request: RequestInfo): boolean {
    // Allow burst usage, then throttle
    if (window.burstTokens > 0 && window.requests < this.maxRequestsPerWindow) {
      window.requests++;
      
      if (window.requests > Math.floor(this.maxRequestsPerWindow * 0.8)) {
        window.burstTokens--;
        this.metrics.burstCapacityUsed = this.burstCapacity - window.burstTokens;
      }
      
      return true;
    }
    
    return false;
  }

  private addToQueue(request: RequestInfo): void {
    // Insert based on priority
    const insertIndex = this.findQueueInsertIndex(request);
    this.requestQueue.splice(insertIndex, 0, request);
  }

  private findQueueInsertIndex(newRequest: RequestInfo): number {
    // Higher priority first, then FIFO for same priority
    for (let i = 0; i < this.requestQueue.length; i++) {
      const existing = this.requestQueue[i];
      
      if (newRequest.priority > existing.priority) {
        return i;
      }
      
      if (newRequest.priority === existing.priority && 
          newRequest.timestamp < existing.timestamp) {
        return i;
      }
    }
    
    return this.requestQueue.length;
  }

  private async waitInQueue(requestId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const checkQueue = () => {
        const requestIndex = this.requestQueue.findIndex(req => req.id === requestId);
        
        if (requestIndex === -1) {
          // Request was processed
          resolve();
        } else {
          // Still in queue, check again later
          setTimeout(checkQueue, 100);
        }
      };
      
      checkQueue();
    });
  }

  private startProcessing(): void {
    this.processingTimer = setInterval(async () => {
      await this.processQueue();
      this.cleanupExpiredWindows();
    }, 100); // Process every 100ms
  }

  private async processQueue(): Promise<void> {
    if (this.requestQueue.length === 0) return;

    const processed: string[] = [];
    
    for (let i = 0; i < Math.min(this.requestQueue.length, 10); i++) {
      const request = this.requestQueue[i];
      const windowKey = this.getWindowKey(''); // Default window for queued requests
      
      if (await this.tryAcquireSlot(windowKey, request)) {
        processed.push(request.id);
        this.metrics.requestsAllowed++;
        
        this.emit('request-processed', {
          requestId: request.id,
          waitTime: Date.now() - request.timestamp
        });
      } else {
        break; // Stop processing if no slots available
      }
    }

    // Remove processed requests
    for (const processedId of processed) {
      const index = this.requestQueue.findIndex(req => req.id === processedId);
      if (index !== -1) {
        this.requestQueue.splice(index, 1);
      }
    }
  }

  private cleanupExpiredWindows(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];
    
    for (const [key, window] of this.windows.entries()) {
      if (this.isWindowExpired(window, now)) {
        expiredKeys.push(key);
      }
    }
    
    for (const key of expiredKeys) {
      this.windows.delete(key);
    }
  }

  private isWindowExpired(window: RateLimitWindow, now: number): boolean {
    return now - window.windowStart > this.windowSize;
  }

  private getWindowKey(url: string): string {
    // Group by endpoint pattern for more granular rate limiting
    if (url.includes('/repos/')) {
      return 'repos';
    } else if (url.includes('/search/')) {
      return 'search';
    } else if (url.includes('/issues/')) {
      return 'issues';
    } else if (url.includes('/pulls/')) {
      return 'pulls';
    }
    
    return 'default';
  }

  private updateCurrentRateMetric(): void {
    const now = Date.now();
    let totalRequests = 0;
    let validWindows = 0;
    
    for (const window of this.windows.values()) {
      if (!this.isWindowExpired(window, now)) {
        totalRequests += window.requests;
        validWindows++;
      }
    }
    
    if (validWindows > 0) {
      // Requests per minute across all windows
      this.metrics.currentRate = totalRequests / validWindows;
    }
  }
}