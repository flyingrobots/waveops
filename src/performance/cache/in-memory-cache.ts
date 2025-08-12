/**
 * High-performance in-memory cache with intelligent eviction strategies
 */

import { EventEmitter } from 'events';
import {
  InMemoryConfig,
  CacheEntry,
  EvictionStrategy,
  CachePriority
} from '../types';
import { LayerMetrics } from './cache-manager';

interface EvictionCandidate<T> {
  key: string;
  entry: CacheEntry<T>;
  score: number;
}

export class InMemoryCache extends EventEmitter {
  private readonly config: InMemoryConfig;
  private readonly data: Map<string, CacheEntry<unknown>>;
  private readonly accessOrder: Map<string, number>;
  private readonly frequencies: Map<string, number>;
  private currentSize: number;
  private accessCounter: number;
  private cleanupTimer?: NodeJS.Timeout;
  private metrics: LayerMetrics;

  constructor(config: InMemoryConfig) {
    super();
    this.config = config;
    this.data = new Map();
    this.accessOrder = new Map();
    this.frequencies = new Map();
    this.currentSize = 0;
    this.accessCounter = 0;
    
    this.metrics = {
      layer: 0, // CacheLayer.IN_MEMORY
      hits: 0,
      misses: 0,
      hitRate: 0,
      avgResponseTime: 0,
      size: 0,
      memoryUsage: 0
    };

    this.startCleanupTimer();
  }

  async get<T>(key: string): Promise<T | null> {
    const startTime = Date.now();
    
    const entry = this.data.get(key) as CacheEntry<T> | undefined;
    
    if (!entry) {
      this.metrics.misses++;
      this.updateMetrics(Date.now() - startTime);
      return null;
    }

    // Check expiration
    if (entry.expiresAt && entry.expiresAt < new Date()) {
      this.data.delete(key);
      this.accessOrder.delete(key);
      this.frequencies.delete(key);
      this.currentSize -= entry.size;
      this.metrics.misses++;
      this.updateMetrics(Date.now() - startTime);
      return null;
    }

    // Update access tracking
    this.updateAccessTracking(key, entry);
    
    this.metrics.hits++;
    this.updateMetrics(Date.now() - startTime);
    
    return entry.value;
  }

  async set<T>(key: string, entry: CacheEntry<T>, ttl: number): Promise<void> {
    // Check if we need to evict items
    if (this.needsEviction(entry.size)) {
      await this.evictItems(entry.size);
    }

    // Remove existing entry if present
    const existingEntry = this.data.get(key);
    if (existingEntry) {
      this.currentSize -= existingEntry.size;
    }

    // Set expiration time
    const finalEntry = {
      ...entry,
      expiresAt: new Date(Date.now() + ttl)
    };

    this.data.set(key, finalEntry);
    this.currentSize += entry.size;
    this.updateAccessTracking(key, finalEntry);

    this.metrics.size = this.data.size;
    this.metrics.memoryUsage = this.currentSize;
  }

  async delete(key: string): Promise<void> {
    const entry = this.data.get(key);
    if (entry) {
      this.data.delete(key);
      this.accessOrder.delete(key);
      this.frequencies.delete(key);
      this.currentSize -= entry.size;
      
      this.metrics.size = this.data.size;
      this.metrics.memoryUsage = this.currentSize;
    }
  }

  async invalidate(pattern: string): Promise<void> {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    const keysToDelete: string[] = [];

    for (const key of this.data.keys()) {
      if (regex.test(key)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      await this.delete(key);
    }

    this.emit('invalidation', { pattern, deletedCount: keysToDelete.length });
  }

  getMetrics(): LayerMetrics {
    if (this.metrics.hits + this.metrics.misses > 0) {
      this.metrics.hitRate = this.metrics.hits / (this.metrics.hits + this.metrics.misses);
    }
    
    return { ...this.metrics };
  }

  async close(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.data.clear();
    this.accessOrder.clear();
    this.frequencies.clear();
  }

  private needsEviction(newEntrySize: number): boolean {
    return (
      this.data.size >= this.config.maxEntries ||
      this.currentSize + newEntrySize > this.config.maxSize
    );
  }

  private async evictItems(requiredSpace: number): Promise<void> {
    const candidates = this.getEvictionCandidates();
    let freedSpace = 0;
    let evictedCount = 0;

    for (const candidate of candidates) {
      if (freedSpace >= requiredSpace && this.data.size < this.config.maxEntries) {
        break;
      }

      this.data.delete(candidate.key);
      this.accessOrder.delete(candidate.key);
      this.frequencies.delete(candidate.key);
      freedSpace += candidate.entry.size;
      evictedCount++;
    }

    this.currentSize -= freedSpace;
    this.emit('eviction', { 
      evictedCount, 
      freedSpace, 
      strategy: this.config.evictionStrategy 
    });
  }

  private getEvictionCandidates(): EvictionCandidate<unknown>[] {
    const candidates: EvictionCandidate<unknown>[] = [];

    for (const [key, entry] of this.data.entries()) {
      const score = this.calculateEvictionScore(key, entry);
      candidates.push({ key, entry, score });
    }

    // Sort by eviction score (lower score = higher priority for eviction)
    return candidates.sort((a, b) => a.score - b.score);
  }

  private calculateEvictionScore(key: string, entry: CacheEntry<unknown>): number {
    const now = new Date();
    const age = now.getTime() - entry.lastAccessed.getTime();
    const frequency = this.frequencies.get(key) || 0;
    const priority = entry.metadata.priority;

    switch (this.config.evictionStrategy) {
      case EvictionStrategy.LRU:
        return age * (priority === CachePriority.IMMORTAL ? 0.1 : 1);
      
      case EvictionStrategy.LFU:
        return (1 / Math.max(frequency, 1)) * (priority === CachePriority.IMMORTAL ? 0.1 : 1);
      
      case EvictionStrategy.FIFO:
        return entry.metadata.createdAt.getTime() * (priority === CachePriority.IMMORTAL ? 0.1 : 1);
      
      case EvictionStrategy.TTL_BASED:
        if (!entry.expiresAt) return age;
        const ttlRemaining = entry.expiresAt.getTime() - now.getTime();
        return ttlRemaining * (priority === CachePriority.IMMORTAL ? 0.1 : 1);
      
      case EvictionStrategy.RANDOM:
        return Math.random() * (priority === CachePriority.IMMORTAL ? 0.1 : 1);
      
      default:
        return age;
    }
  }

  private updateAccessTracking<T>(key: string, entry: CacheEntry<T>): void {
    this.accessCounter++;
    this.accessOrder.set(key, this.accessCounter);
    
    const currentFreq = this.frequencies.get(key) || 0;
    this.frequencies.set(key, currentFreq + 1);
    
    entry.accessCount++;
    entry.lastAccessed = new Date();
    entry.metadata.hitCount++;
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupInterval);
  }

  private cleanup(): void {
    const now = new Date();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.data.entries()) {
      if (entry.expiresAt && entry.expiresAt < now) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      const entry = this.data.get(key);
      if (entry) {
        this.data.delete(key);
        this.accessOrder.delete(key);
        this.frequencies.delete(key);
        this.currentSize -= entry.size;
      }
    }

    if (expiredKeys.length > 0) {
      this.metrics.size = this.data.size;
      this.metrics.memoryUsage = this.currentSize;
      this.emit('cleanup', { expiredCount: expiredKeys.length });
    }
  }

  private updateMetrics(responseTime: number): void {
    const totalRequests = this.metrics.hits + this.metrics.misses;
    const totalTime = this.metrics.avgResponseTime * (totalRequests - 1);
    this.metrics.avgResponseTime = (totalTime + responseTime) / totalRequests;
  }
}