/**
 * Redis-based cache implementation with advanced features
 */

import { EventEmitter } from 'events';
import {
  RedisConfig,
  CacheEntry
} from '../types';
import { LayerMetrics } from './cache-manager';

// Mock Redis client interface for type safety
interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode?: string, duration?: number): Promise<string>;
  del(...keys: string[]): Promise<number>;
  keys(pattern: string): Promise<string[]>;
  ttl(key: string): Promise<number>;
  exists(...keys: string[]): Promise<number>;
  info(section?: string): Promise<string>;
  quit(): Promise<void>;
  on(event: string, callback: (...args: unknown[]) => void): void;
  off(event: string, callback: (...args: unknown[]) => void): void;
}

export class RedisCache extends EventEmitter {
  private readonly config: RedisConfig;
  private client?: RedisClient;
  private connected: boolean;
  private metrics: LayerMetrics;
  private reconnectAttempts: number;
  private reconnectTimer?: NodeJS.Timeout;

  constructor(config: RedisConfig) {
    super();
    this.config = config;
    this.connected = false;
    this.reconnectAttempts = 0;
    
    this.metrics = {
      layer: 1, // CacheLayer.REDIS
      hits: 0,
      misses: 0,
      hitRate: 0,
      avgResponseTime: 0,
      size: 0,
      memoryUsage: 0
    };

    this.initializeConnection();
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.isConnected()) {
      this.metrics.misses++;
      return null;
    }

    const startTime = Date.now();

    try {
      const fullKey = this.getFullKey(key);
      const data = await this.client!.get(fullKey);
      
      if (!data) {
        this.metrics.misses++;
        this.updateMetrics(Date.now() - startTime);
        return null;
      }

      const entry = this.deserialize<T>(data);
      if (!entry) {
        this.metrics.misses++;
        this.updateMetrics(Date.now() - startTime);
        return null;
      }

      // Check expiration (Redis should handle this, but double-check)
      if (entry.expiresAt && entry.expiresAt < new Date()) {
        await this.delete(key);
        this.metrics.misses++;
        this.updateMetrics(Date.now() - startTime);
        return null;
      }

      // Update access tracking
      entry.accessCount++;
      entry.lastAccessed = new Date();
      entry.metadata.hitCount++;

      // Update the entry in Redis with new access info
      await this.updateAccessInfo(fullKey, entry);

      this.metrics.hits++;
      this.updateMetrics(Date.now() - startTime);
      
      return entry.value;
    } catch (error) {
      this.metrics.misses++;
      this.updateMetrics(Date.now() - startTime);
      this.emit('error', error);
      return null;
    }
  }

  async set<T>(key: string, entry: CacheEntry<T>, ttl: number): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('Redis client not connected');
    }

    try {
      const fullKey = this.getFullKey(key);
      const serializedData = this.serialize(entry);
      const ttlSeconds = Math.ceil(ttl / 1000);

      await this.client!.set(fullKey, serializedData, 'EX', ttlSeconds);
      
      // Update metrics (size estimation)
      this.metrics.size++;
      this.metrics.memoryUsage += entry.size;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    if (!this.isConnected()) {
      return;
    }

    try {
      const fullKey = this.getFullKey(key);
      const result = await this.client!.del(fullKey);
      
      if (result > 0) {
        this.metrics.size = Math.max(0, this.metrics.size - 1);
        // Note: We can't accurately track memory usage decrease without storing size
      }
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  async invalidate(pattern: string): Promise<void> {
    if (!this.isConnected()) {
      return;
    }

    try {
      const fullPattern = this.getFullKey(pattern);
      const keys = await this.client!.keys(fullPattern);
      
      if (keys.length > 0) {
        const result = await this.client!.del(...keys);
        this.metrics.size = Math.max(0, this.metrics.size - result);
        this.emit('invalidation', { pattern, deletedCount: result });
      }
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  getMetrics(): LayerMetrics {
    if (this.metrics.hits + this.metrics.misses > 0) {
      this.metrics.hitRate = this.metrics.hits / (this.metrics.hits + this.metrics.misses);
    }
    
    return { ...this.metrics };
  }

  async close(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    if (this.client && this.connected) {
      try {
        await this.client.quit();
      } catch (error) {
        this.emit('error', error);
      }
    }

    this.connected = false;
    this.emit('disconnected');
  }

  private async initializeConnection(): Promise<void> {
    try {
      // In a real implementation, this would use a Redis client like ioredis
      // For now, we'll create a mock implementation
      this.client = this.createMockRedisClient();
      
      this.setupClientEventHandlers();
      this.connected = true;
      this.reconnectAttempts = 0;
      
      this.emit('connected');
    } catch (error) {
      this.emit('error', error);
      this.scheduleReconnect();
    }
  }

  private createMockRedisClient(): RedisClient {
    // Mock Redis client for development/testing
    const store = new Map<string, { value: string; ttl: number; setAt: number }>();
    
    const cleanupExpired = () => {
      const now = Date.now();
      for (const [key, data] of store.entries()) {
        if (data.ttl > 0 && now - data.setAt > data.ttl * 1000) {
          store.delete(key);
        }
      }
    };

    setInterval(cleanupExpired, 1000);

    return {
      async get(key: string): Promise<string | null> {
        cleanupExpired();
        const data = store.get(key);
        if (!data) {return null;}
        
        if (data.ttl > 0 && Date.now() - data.setAt > data.ttl * 1000) {
          store.delete(key);
          return null;
        }
        
        return data.value;
      },

      async set(key: string, value: string, mode?: string, duration?: number): Promise<string> {
        const ttl = mode === 'EX' && duration ? duration : 0;
        store.set(key, { value, ttl, setAt: Date.now() });
        return 'OK';
      },

      async del(...keys: string[]): Promise<number> {
        let deleted = 0;
        for (const key of keys) {
          if (store.delete(key)) {
            deleted++;
          }
        }
        return deleted;
      },

      async keys(pattern: string): Promise<string[]> {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return Array.from(store.keys()).filter(key => regex.test(key));
      },

      async ttl(key: string): Promise<number> {
        const data = store.get(key);
        if (!data) {return -2;}
        if (data.ttl === 0) {return -1;}
        
        const remaining = data.ttl - Math.floor((Date.now() - data.setAt) / 1000);
        return remaining > 0 ? remaining : -2;
      },

      async exists(...keys: string[]): Promise<number> {
        return keys.filter(key => store.has(key)).length;
      },

      async info(section?: string): Promise<string> {
        return `# Memory\nused_memory:${store.size * 100}\nmaxmemory:10mb\n`;
      },

      async quit(): Promise<void> {
        store.clear();
      },

      on(event: string, callback: (...args: unknown[]) => void): void {
        // Mock event handling
      },

      off(event: string, callback: (...args: unknown[]) => void): void {
        // Mock event handling
      }
    };
  }

  private setupClientEventHandlers(): void {
    if (!this.client) {return;}

    this.client.on('error', (error) => {
      this.connected = false;
      this.emit('error', error);
      this.scheduleReconnect();
    });

    this.client.on('connect', () => {
      this.connected = true;
      this.reconnectAttempts = 0;
      this.emit('connected');
    });

    this.client.on('disconnect', () => {
      this.connected = false;
      this.emit('disconnected');
      this.scheduleReconnect();
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxRetries) {
      this.emit('error', new Error('Max reconnection attempts reached'));
      return;
    }

    const delay = Math.min(
      this.config.retryDelayOnFailover * Math.pow(2, this.reconnectAttempts),
      30000
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      this.initializeConnection();
    }, delay);
  }

  private isConnected(): boolean {
    return this.connected && this.client !== undefined;
  }

  private getFullKey(key: string): string {
    return `${this.config.keyPrefix}${key}`;
  }

  private serialize<T>(entry: CacheEntry<T>): string {
    return JSON.stringify({
      ...entry,
      expiresAt: entry.expiresAt?.toISOString(),
      lastAccessed: entry.lastAccessed.toISOString(),
      lastModified: entry.lastModified.toISOString(),
      metadata: {
        ...entry.metadata,
        createdAt: entry.metadata.createdAt.toISOString()
      }
    });
  }

  private deserialize<T>(data: string): CacheEntry<T> | null {
    try {
      const parsed = JSON.parse(data);
      return {
        ...parsed,
        expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt) : undefined,
        lastAccessed: new Date(parsed.lastAccessed),
        lastModified: new Date(parsed.lastModified),
        metadata: {
          ...parsed.metadata,
          createdAt: new Date(parsed.metadata.createdAt)
        }
      };
    } catch (error) {
      this.emit('error', new Error(`Failed to deserialize cache entry: ${error}`));
      return null;
    }
  }

  private async updateAccessInfo<T>(key: string, entry: CacheEntry<T>): Promise<void> {
    // In a production environment, we might batch these updates
    // or use Redis data structures to track access patterns more efficiently
    try {
      const serializedData = this.serialize(entry);
      const ttl = await this.client!.ttl(key);
      
      if (ttl > 0) {
        await this.client!.set(key, serializedData, 'EX', ttl);
      }
    } catch (error) {
      // Log but don't throw - access info update is not critical
      this.emit('error', new Error(`Failed to update access info: ${error}`));
    }
  }

  private updateMetrics(responseTime: number): void {
    const totalRequests = this.metrics.hits + this.metrics.misses;
    const totalTime = this.metrics.avgResponseTime * (totalRequests - 1);
    this.metrics.avgResponseTime = (totalTime + responseTime) / totalRequests;
  }
}