/**
 * Request batching system for network optimization
 */

import { EventEmitter } from 'events';
import {
  BatchingConfig,
  BatchGroupingStrategy,
  BatchPriority
} from '../types';

export interface BatchMetrics {
  totalBatches: number;
  avgBatchSize: number;
  batchingEfficiency: number;
  avgBatchWaitTime: number;
}

interface BatchRequest {
  id: string;
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
  priority?: number;
  timestamp: number;
  resolve: (response: unknown) => void;
  reject: (error: unknown) => void;
}

interface BatchGroup {
  key: string;
  requests: BatchRequest[];
  timer?: NodeJS.Timeout;
  createdAt: number;
}

export class RequestBatcher extends EventEmitter {
  private readonly config: BatchingConfig;
  private readonly pendingBatches: Map<string, BatchGroup>;
  private readonly metrics: BatchMetrics;

  constructor(config: BatchingConfig) {
    super();
    this.config = config;
    this.pendingBatches = new Map();
    
    this.metrics = {
      totalBatches: 0,
      avgBatchSize: 0,
      batchingEfficiency: 0,
      avgBatchWaitTime: 0
    };
  }

  /**
   * Add a request to be batched
   */
  async addRequest(request: {
    id: string;
    url: string;
    method: string;
    headers?: Record<string, string>;
    body?: unknown;
    timeout?: number;
    priority?: number;
  }): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const batchRequest: BatchRequest = {
        ...request,
        timestamp: Date.now(),
        resolve,
        reject
      };

      const groupKey = this.getGroupKey(batchRequest);
      this.addRequestToGroup(groupKey, batchRequest);
    });
  }

  /**
   * Execute a batch of requests immediately
   */
  async executeBatch(requests: {
    id: string;
    url: string;
    method: string;
    headers?: Record<string, string>;
    body?: unknown;
  }[]): Promise<unknown[]> {
    const batchRequests: BatchRequest[] = requests.map(req => ({
      ...req,
      timestamp: Date.now(),
      resolve: () => {},
      reject: () => {}
    }));

    return this.performBatchExecution(batchRequests);
  }

  /**
   * Get batching metrics
   */
  getMetrics(): BatchMetrics {
    return { ...this.metrics };
  }

  /**
   * Close batcher and execute pending batches
   */
  async close(): Promise<void> {
    // Execute all pending batches
    const executionPromises: Promise<void>[] = [];
    
    for (const group of this.pendingBatches.values()) {
      if (group.timer) {
        clearTimeout(group.timer);
      }
      
      if (group.requests.length > 0) {
        executionPromises.push(this.executeBatchGroup(group));
      }
    }

    await Promise.allSettled(executionPromises);
    this.pendingBatches.clear();
    
    this.emit('closed');
  }

  private getGroupKey(request: BatchRequest): string {
    const strategies = this.config.groupingStrategies;
    const keyParts: string[] = [];

    for (const strategy of strategies) {
      switch (strategy) {
        case BatchGroupingStrategy.BY_ENDPOINT:
          keyParts.push(this.extractEndpoint(request.url));
          break;
        case BatchGroupingStrategy.BY_REPOSITORY:
          keyParts.push(this.extractRepository(request.url));
          break;
        case BatchGroupingStrategy.BY_USER:
          keyParts.push(this.extractUser(request.url));
          break;
        case BatchGroupingStrategy.BY_PRIORITY:
          keyParts.push(`priority:${request.priority || 0}`);
          break;
        case BatchGroupingStrategy.BY_SIZE:
          keyParts.push(this.getSizeCategory(request));
          break;
      }
    }

    return keyParts.join('|');
  }

  private addRequestToGroup(groupKey: string, request: BatchRequest): void {
    let group = this.pendingBatches.get(groupKey);
    
    if (!group) {
      group = {
        key: groupKey,
        requests: [],
        createdAt: Date.now()
      };
      this.pendingBatches.set(groupKey, group);
    }

    // Insert request based on priority
    const insertIndex = this.findInsertIndex(group.requests, request);
    group.requests.splice(insertIndex, 0, request);

    // Check if batch should be executed
    if (this.shouldExecuteBatch(group)) {
      this.executeBatchGroup(group);
    } else if (!group.timer) {
      // Set timer for maximum wait time
      group.timer = setTimeout(() => {
        this.executeBatchGroup(group!);
      }, this.config.maxWaitTime);
    }
  }

  private shouldExecuteBatch(group: BatchGroup): boolean {
    // Execute if batch is full
    if (group.requests.length >= this.config.maxBatchSize) {
      return true;
    }

    // Execute if max wait time exceeded
    const waitTime = Date.now() - group.createdAt;
    if (waitTime >= this.config.maxWaitTime) {
      return true;
    }

    // Execute if high priority request with minimal delay
    const highPriorityRequest = group.requests.find(req => (req.priority || 0) >= 8);
    if (highPriorityRequest) {
      const maxDelay = this.getMaxDelayForPriority(highPriorityRequest.priority || 0);
      const requestAge = Date.now() - highPriorityRequest.timestamp;
      if (requestAge >= maxDelay) {
        return true;
      }
    }

    return false;
  }

  private async executeBatchGroup(group: BatchGroup): Promise<void> {
    if (group.timer) {
      clearTimeout(group.timer);
    }

    this.pendingBatches.delete(group.key);
    
    if (group.requests.length === 0) {return;}

    try {
      const results = await this.performBatchExecution(group.requests);
      
      // Resolve individual requests
      for (let i = 0; i < group.requests.length; i++) {
        const request = group.requests[i];
        const result = results[i];
        request.resolve(result);
      }

      // Update metrics
      this.updateMetrics(group);
      
      this.emit('batch-executed', {
        groupKey: group.key,
        batchSize: group.requests.length,
        waitTime: Date.now() - group.createdAt
      });
    } catch (error) {
      // Reject all requests in the batch
      for (const request of group.requests) {
        request.reject(error);
      }

      this.emit('batch-error', {
        groupKey: group.key,
        batchSize: group.requests.length,
        error
      });
    }
  }

  private async performBatchExecution(requests: BatchRequest[]): Promise<unknown[]> {
    // Group requests by actual HTTP endpoint for efficient batching
    const endpointGroups = this.groupByActualEndpoint(requests);
    const results: unknown[] = new Array(requests.length);

    for (const [endpoint, groupRequests] of endpointGroups.entries()) {
      try {
        if (this.supportsBatchAPI(endpoint)) {
          // Use batch API if available
          const batchResults = await this.executeBatchAPI(endpoint, groupRequests);
          
          // Map results back to original positions
          for (let i = 0; i < groupRequests.length; i++) {
            const originalIndex = requests.indexOf(groupRequests[i]);
            results[originalIndex] = batchResults[i];
          }
        } else {
          // Execute individual requests concurrently
          const promises = groupRequests.map(req => this.executeIndividualRequest(req));
          const groupResults = await Promise.allSettled(promises);
          
          // Map results back to original positions
          for (let i = 0; i < groupRequests.length; i++) {
            const originalIndex = requests.indexOf(groupRequests[i]);
            const result = groupResults[i];
            
            if (result.status === 'fulfilled') {
              results[originalIndex] = result.value;
            } else {
              results[originalIndex] = { error: result.reason };
            }
          }
        }
      } catch (error) {
        // Mark all requests in this group as failed
        for (const request of groupRequests) {
          const originalIndex = requests.indexOf(request);
          results[originalIndex] = { error };
        }
      }
    }

    return results;
  }

  private groupByActualEndpoint(requests: BatchRequest[]): Map<string, BatchRequest[]> {
    const groups = new Map<string, BatchRequest[]>();
    
    for (const request of requests) {
      const endpoint = this.extractEndpoint(request.url);
      const existing = groups.get(endpoint) || [];
      existing.push(request);
      groups.set(endpoint, existing);
    }
    
    return groups;
  }

  private supportsBatchAPI(endpoint: string): boolean {
    // GitHub API endpoints that support batch operations
    const batchEndpoints = [
      '/repos/batch',
      '/issues/batch',
      '/pulls/batch',
      '/search/batch'
    ];
    
    return batchEndpoints.some(batchEndpoint => endpoint.includes(batchEndpoint));
  }

  private async executeBatchAPI(endpoint: string, requests: BatchRequest[]): Promise<unknown[]> {
    // Mock batch API execution
    // In production, this would make actual batch API calls
    const batchPayload = {
      requests: requests.map(req => ({
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: req.body
      }))
    };

    // Simulate batch API call
    await new Promise(resolve => setTimeout(resolve, 100));
    
    return requests.map((req, index) => ({
      id: req.id,
      status: 200,
      body: { message: 'Batch response', index },
      batchIndex: index
    }));
  }

  private async executeIndividualRequest(request: BatchRequest): Promise<unknown> {
    // Mock individual request execution
    // In production, this would use the actual HTTP client
    await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 50));
    
    return {
      id: request.id,
      status: 200,
      body: { message: 'Individual response' }
    };
  }

  private findInsertIndex(requests: BatchRequest[], newRequest: BatchRequest): number {
    // Insert based on priority (higher priority first)
    const newPriority = newRequest.priority || 0;
    
    for (let i = 0; i < requests.length; i++) {
      const existingPriority = requests[i].priority || 0;
      if (newPriority > existingPriority) {
        return i;
      }
    }
    
    return requests.length;
  }

  private getMaxDelayForPriority(priority: number): number {
    const priorityConfig = this.config.priorities.find(p => 
      priority >= p.priority
    );
    
    return priorityConfig ? priorityConfig.maxDelay : this.config.maxWaitTime;
  }

  private extractEndpoint(url: string): string {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/');
      
      // Extract meaningful endpoint pattern
      if (pathParts.includes('repos')) {
        const repoIndex = pathParts.indexOf('repos');
        return pathParts.slice(0, repoIndex + 3).join('/'); // /repos/owner/repo
      }
      
      return pathParts.slice(0, 3).join('/');
    } catch {
      return 'unknown';
    }
  }

  private extractRepository(url: string): string {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/');
      
      if (pathParts.includes('repos') && pathParts.length >= 4) {
        const repoIndex = pathParts.indexOf('repos');
        return `${pathParts[repoIndex + 1]}/${pathParts[repoIndex + 2]}`;
      }
      
      return 'unknown';
    } catch {
      return 'unknown';
    }
  }

  private extractUser(url: string): string {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/');
      
      if (pathParts.includes('users') && pathParts.length >= 3) {
        const userIndex = pathParts.indexOf('users');
        return pathParts[userIndex + 1];
      } else if (pathParts.includes('repos') && pathParts.length >= 3) {
        const repoIndex = pathParts.indexOf('repos');
        return pathParts[repoIndex + 1];
      }
      
      return 'unknown';
    } catch {
      return 'unknown';
    }
  }

  private getSizeCategory(request: BatchRequest): string {
    const bodySize = request.body ? JSON.stringify(request.body).length : 0;
    
    if (bodySize < 1024) {return 'small';}
    if (bodySize < 10240) {return 'medium';}
    if (bodySize < 102400) {return 'large';}
    return 'xlarge';
  }

  private updateMetrics(group: BatchGroup): void {
    this.metrics.totalBatches++;
    
    const batchSize = group.requests.length;
    const waitTime = Date.now() - group.createdAt;
    
    // Update average batch size
    const totalRequests = this.metrics.avgBatchSize * (this.metrics.totalBatches - 1) + batchSize;
    this.metrics.avgBatchSize = totalRequests / this.metrics.totalBatches;
    
    // Update average wait time
    const totalWaitTime = this.metrics.avgBatchWaitTime * (this.metrics.totalBatches - 1) + waitTime;
    this.metrics.avgBatchWaitTime = totalWaitTime / this.metrics.totalBatches;
    
    // Update batching efficiency (requests batched vs. max possible)
    const efficiency = batchSize / this.config.maxBatchSize;
    const totalEfficiency = this.metrics.batchingEfficiency * (this.metrics.totalBatches - 1) + efficiency;
    this.metrics.batchingEfficiency = totalEfficiency / this.metrics.totalBatches;
  }
}