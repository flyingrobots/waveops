/**
 * Intelligent multi-layer cache management system
 * Provides Redis and in-memory caching with smart invalidation and warming strategies
 */

import { EventEmitter } from 'events';
import {
  CacheConfig,
  CacheEntry,
  CacheLayer,
  CacheMetadata,
  CachePriority,
  CacheStrategy,
  InvalidationStrategy,
  EvictionStrategy,
  CacheError,
  CacheOperation
} from '../types';
import { RedisCache } from './redis-cache';
import { InMemoryCache } from './in-memory-cache';

export interface ICacheManager {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  invalidate(pattern: string): Promise<void>;
  warm(keys: string[]): Promise<void>;
  getMetrics(): CacheMetrics;
  close(): Promise<void>;
}

export interface CacheMetrics {
  hits: number;
  misses: number;
  hitRate: number;
  totalRequests: number;
  avgResponseTime: number;
  layerMetrics: Record<string, LayerMetrics>;
  memoryUsage: number;
  evictions: number;
  errors: number;
}

export interface LayerMetrics {
  layer: CacheLayer;
  hits: number;
  misses: number;
  hitRate: number;
  avgResponseTime: number;
  size: number;
  memoryUsage: number;
}

export class CacheManager extends EventEmitter implements ICacheManager {
  private readonly config: CacheConfig;
  private readonly redisCache: RedisCache;
  private readonly inMemoryCache: InMemoryCache;
  private readonly metrics: CacheMetrics;
  private readonly startTime: Date;

  constructor(config: CacheConfig) {
    super();
    this.config = config;
    this.startTime = new Date();
    
    this.metrics = {
      hits: 0,
      misses: 0,
      hitRate: 0,
      totalRequests: 0,
      avgResponseTime: 0,
      layerMetrics: {},
      memoryUsage: 0,
      evictions: 0,
      errors: 0
    };

    // Initialize cache layers
    this.redisCache = new RedisCache(config.redis);
    this.inMemoryCache = new InMemoryCache(config.inMemory);

    // Setup event listeners
    this.setupEventListeners();
  }

  /**
   * Get value from cache with intelligent layer selection
   */
  async get<T>(key: string): Promise<T | null> {
    const startTime = Date.now();
    this.metrics.totalRequests++;

    try {
      // Determine cache strategy for this key
      const strategy = this.getCacheStrategy(key);
      
      // Try layers in order
      for (const layer of strategy.layers) {
        const result = await this.getFromLayer<T>(key, layer);
        if (result !== null) {
          this.recordHit(layer, Date.now() - startTime);
          
          // Populate higher priority layers if configured
          if (strategy.prefetchEnabled) {
            this.populateHigherLayers(key, result, layer, strategy.layers);
          }
          
          return result;
        }
      }

      this.recordMiss(Date.now() - startTime);
      return null;
    } catch (error) {
      this.metrics.errors++;
      this.emit('error', new CacheError(
        `Cache get operation failed for key: ${key}`,
        CacheOperation.GET,
        CacheLayer.IN_MEMORY, // Default layer for error reporting
        key
      ));
      throw error;
    }
  }

  /**
   * Set value in cache with appropriate layers and TTL
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const startTime = Date.now();
    
    try {
      const strategy = this.getCacheStrategy(key);
      const finalTTL = ttl || this.getDefaultTTL(key);
      const metadata: CacheMetadata = {
        createdAt: new Date(),
        source: 'cache-manager',
        tags: this.extractTags(key),
        dependencies: this.extractDependencies(key),
        priority: this.determinePriority(key),
        hitCount: 0,
        missCount: 0
      };

      const cacheEntry: CacheEntry<T> = {
        key,
        value,
        metadata,
        expiresAt: new Date(Date.now() + finalTTL),
        accessCount: 0,
        lastAccessed: new Date(),
        lastModified: new Date(),
        size: this.calculateSize(value),
        version: 1
      };

      // Set in all configured layers
      const promises = strategy.layers.map(layer => 
        this.setInLayer(key, cacheEntry, layer, finalTTL)
      );

      await Promise.all(promises);
      
      this.emit('cache:set', { key, layers: strategy.layers, ttl: finalTTL });
    } catch (error) {
      this.metrics.errors++;
      this.emit('error', new CacheError(
        `Cache set operation failed for key: ${key}`,
        CacheOperation.SET,
        CacheLayer.IN_MEMORY,
        key
      ));
      throw error;
    }
  }

  /**
   * Delete key from all cache layers
   */
  async delete(key: string): Promise<void> {
    try {
      const promises = [
        this.inMemoryCache.delete(key),
        this.redisCache.delete(key)
      ];

      await Promise.all(promises);
      this.emit('cache:delete', { key });
    } catch (error) {
      this.metrics.errors++;
      this.emit('error', new CacheError(
        `Cache delete operation failed for key: ${key}`,
        CacheOperation.DELETE,
        CacheLayer.IN_MEMORY,
        key
      ));
      throw error;
    }
  }

  /**
   * Invalidate cache entries matching pattern
   */
  async invalidate(pattern: string): Promise<void> {
    try {
      const promises = [
        this.inMemoryCache.invalidate(pattern),
        this.redisCache.invalidate(pattern)
      ];

      await Promise.all(promises);
      this.emit('cache:invalidate', { pattern });
    } catch (error) {
      this.metrics.errors++;
      this.emit('error', new CacheError(
        `Cache invalidation failed for pattern: ${pattern}`,
        CacheOperation.INVALIDATE,
        CacheLayer.IN_MEMORY,
        pattern
      ));
      throw error;
    }
  }

  /**
   * Warm cache with specified keys
   */
  async warm(keys: string[]): Promise<void> {
    try {
      // Implement cache warming logic
      const warmingPromises = keys.map(async (key) => {
        const strategy = this.getCacheStrategy(key);
        if (strategy.warmupEnabled) {
          // Load data and populate cache layers
          // This would typically fetch from the source system
          return this.warmKey(key);
        }
      });

      await Promise.all(warmingPromises);
      this.emit('cache:warm', { keys: keys.length });
    } catch (error) {
      this.metrics.errors++;
      this.emit('error', new CacheError(
        `Cache warming failed`,
        CacheOperation.WARMUP,
        CacheLayer.IN_MEMORY
      ));
      throw error;
    }
  }

  /**
   * Get comprehensive cache metrics
   */
  getMetrics(): CacheMetrics {
    // Update hit rate
    if (this.metrics.totalRequests > 0) {
      this.metrics.hitRate = this.metrics.hits / this.metrics.totalRequests;
    }

    // Get layer-specific metrics
    this.metrics.layerMetrics = {
      'in-memory': this.inMemoryCache.getMetrics(),
      'redis': this.redisCache.getMetrics()
    };

    // Calculate total memory usage
    this.metrics.memoryUsage = 
      this.metrics.layerMetrics['in-memory'].memoryUsage +
      this.metrics.layerMetrics['redis'].memoryUsage;

    return { ...this.metrics };
  }

  /**
   * Close all cache connections
   */
  async close(): Promise<void> {
    try {
      await Promise.all([
        this.inMemoryCache.close(),
        this.redisCache.close()
      ]);
      this.emit('cache:closed');
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  private async getFromLayer<T>(key: string, layer: CacheLayer): Promise<T | null> {
    switch (layer) {
      case CacheLayer.IN_MEMORY:
        return this.inMemoryCache.get<T>(key);
      case CacheLayer.REDIS:
        return this.redisCache.get<T>(key);
      default:
        return null;
    }
  }

  private async setInLayer<T>(
    key: string, 
    entry: CacheEntry<T>, 
    layer: CacheLayer, 
    ttl: number
  ): Promise<void> {
    switch (layer) {
      case CacheLayer.IN_MEMORY:
        return this.inMemoryCache.set(key, entry, ttl);
      case CacheLayer.REDIS:
        return this.redisCache.set(key, entry, ttl);
    }
  }

  private async populateHigherLayers<T>(
    key: string, 
    value: T, 
    currentLayer: CacheLayer, 
    layers: CacheLayer[]
  ): Promise<void> {
    const currentIndex = layers.indexOf(currentLayer);
    if (currentIndex <= 0) return;

    const higherLayers = layers.slice(0, currentIndex);
    const ttl = this.getDefaultTTL(key);
    
    const metadata: CacheMetadata = {
      createdAt: new Date(),
      source: 'cache-prefetch',
      tags: this.extractTags(key),
      dependencies: this.extractDependencies(key),
      priority: this.determinePriority(key),
      hitCount: 0,
      missCount: 0
    };

    const cacheEntry: CacheEntry<T> = {
      key,
      value,
      metadata,
      expiresAt: new Date(Date.now() + ttl),
      accessCount: 1,
      lastAccessed: new Date(),
      lastModified: new Date(),
      size: this.calculateSize(value),
      version: 1
    };

    const promises = higherLayers.map(layer => 
      this.setInLayer(key, cacheEntry, layer, ttl)
    );

    await Promise.allSettled(promises);
  }

  private getCacheStrategy(key: string): CacheStrategy {
    // Determine strategy based on key patterns
    if (key.startsWith('wave:')) {
      return this.config.strategies.waveState;
    } else if (key.startsWith('team:')) {
      return this.config.strategies.teamMetrics;
    } else if (key.startsWith('github:')) {
      return this.config.strategies.githubData;
    } else if (key.startsWith('dep:')) {
      return this.config.strategies.dependencyGraph;
    } else if (key.startsWith('analytics:')) {
      return this.config.strategies.analyticsData;
    }

    // Default strategy
    return {
      layers: [CacheLayer.IN_MEMORY, CacheLayer.REDIS],
      invalidationStrategy: InvalidationStrategy.TTL_BASED,
      warmupEnabled: false,
      prefetchEnabled: true,
      compressionThreshold: 1024
    };
  }

  private getDefaultTTL(key: string): number {
    if (key.startsWith('wave:')) {
      return this.config.ttl.waveState;
    } else if (key.startsWith('team:')) {
      return this.config.ttl.teamMetrics;
    } else if (key.startsWith('github:')) {
      return this.config.ttl.githubData;
    } else if (key.startsWith('dep:')) {
      return this.config.ttl.dependencyGraph;
    } else if (key.startsWith('analytics:')) {
      return this.config.ttl.analyticsSnapshots;
    }

    return this.config.ttl.default;
  }

  private extractTags(key: string): string[] {
    const tags: string[] = [];
    const parts = key.split(':');
    
    if (parts.length > 0) tags.push(`type:${parts[0]}`);
    if (parts.length > 1) tags.push(`resource:${parts[1]}`);
    
    return tags;
  }

  private extractDependencies(key: string): string[] {
    // Extract cache dependencies based on key patterns
    const dependencies: string[] = [];
    
    if (key.startsWith('team:') && key.includes(':metrics')) {
      dependencies.push(`wave:${key.split(':')[1]}`);
    }
    
    return dependencies;
  }

  private determinePriority(key: string): CachePriority {
    if (key.includes(':critical') || key.startsWith('wave:current')) {
      return CachePriority.CRITICAL;
    } else if (key.startsWith('team:') || key.startsWith('dep:')) {
      return CachePriority.HIGH;
    } else if (key.startsWith('analytics:')) {
      return CachePriority.MEDIUM;
    }
    
    return CachePriority.LOW;
  }

  private calculateSize(value: unknown): number {
    // Estimate size in bytes
    return JSON.stringify(value).length * 2; // Rough estimate for UTF-16
  }

  private async warmKey(key: string): Promise<void> {
    // This would integrate with data sources to pre-load cache
    // Implementation depends on the specific data source
    this.emit('cache:warm-key', { key });
  }

  private recordHit(layer: CacheLayer, responseTime: number): void {
    this.metrics.hits++;
    this.updateAvgResponseTime(responseTime);
  }

  private recordMiss(responseTime: number): void {
    this.metrics.misses++;
    this.updateAvgResponseTime(responseTime);
  }

  private updateAvgResponseTime(responseTime: number): void {
    const totalTime = this.metrics.avgResponseTime * (this.metrics.totalRequests - 1);
    this.metrics.avgResponseTime = (totalTime + responseTime) / this.metrics.totalRequests;
  }

  private setupEventListeners(): void {
    this.inMemoryCache.on('eviction', (data) => {
      this.metrics.evictions++;
      this.emit('cache:eviction', { layer: 'in-memory', ...data });
    });

    this.redisCache.on('error', (error) => {
      this.metrics.errors++;
      this.emit('cache:redis-error', error);
    });

    this.redisCache.on('reconnect', () => {
      this.emit('cache:redis-reconnect');
    });
  }
}