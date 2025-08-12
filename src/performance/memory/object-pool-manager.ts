/**
 * Object pool management for memory optimization
 */

import { EventEmitter } from 'events';
import {
  ObjectPoolingConfig,
  ObjectPool,
  PoolConfig,
  PoolMetrics
} from '../types';

interface PoolInstance<T> extends ObjectPool<T> {
  config: PoolConfig;
  available: T[];
  inUse: Set<T>;
  creationTimes: Map<T, number>;
  borrowTimes: Map<T, number>;
  lastCleanup: number;
}

export class ObjectPoolManager extends EventEmitter {
  private readonly config: ObjectPoolingConfig;
  private readonly pools: Map<string, PoolInstance<unknown>>;
  private totalObjects: number;

  constructor(config: ObjectPoolingConfig) {
    super();
    this.config = config;
    this.pools = new Map();
    this.totalObjects = 0;
  }

  /**
   * Create a new object pool
   */
  createPool<T>(
    name: string,
    factory: () => T,
    reset: (obj: T) => void,
    maxSize?: number
  ): ObjectPool<T> {
    if (this.pools.has(name)) {
      throw new Error(`Pool '${name}' already exists`);
    }

    const poolConfig = this.config.pools[name] || this.getDefaultPoolConfig();
    const finalMaxSize = maxSize || poolConfig.maxSize;

    const pool: PoolInstance<T> = {
      name,
      factory,
      reset,
      size: 0,
      maxSize: finalMaxSize,
      created: 0,
      borrowed: 0,
      returned: 0,
      destroyed: 0,
      config: poolConfig,
      available: [],
      inUse: new Set(),
      creationTimes: new Map(),
      borrowTimes: new Map(),
      lastCleanup: Date.now()
    };

    // Pre-allocate objects if configured
    if (this.config.preallocationEnabled && poolConfig.initialSize > 0) {
      this.preallocateObjects(pool);
    }

    this.pools.set(name, pool as PoolInstance<unknown>);
    this.emit('pool-created', { name, maxSize: finalMaxSize });

    return pool as ObjectPool<T>;
  }

  /**
   * Get an existing pool
   */
  getPool<T>(name: string): ObjectPool<T> | null {
    const pool = this.pools.get(name);
    return pool ? (pool as ObjectPool<T>) : null;
  }

  /**
   * Borrow an object from a pool
   */
  borrowObject<T>(poolName: string): T | null {
    const pool = this.pools.get(poolName) as PoolInstance<T>;
    if (!pool) {
      return null;
    }

    const startTime = Date.now();
    
    // Get object from available pool or create new one
    let obj: T | null = null;
    
    if (pool.available.length > 0) {
      obj = pool.available.pop()!;
    } else if (pool.size < pool.maxSize) {
      obj = this.createObject(pool);
    } else {
      // Pool exhausted
      this.emit('pool-exhausted', { poolName, size: pool.size, maxSize: pool.maxSize });
      return null;
    }

    if (obj) {
      pool.inUse.add(obj);
      pool.borrowTimes.set(obj, startTime);
      pool.borrowed++;
      
      // Validate object if configured
      if (pool.config.validationEnabled && pool.validate && !pool.validate(obj)) {
        pool.inUse.delete(obj);
        pool.borrowTimes.delete(obj);
        this.destroyObject(pool, obj);
        return this.borrowObject<T>(poolName); // Retry
      }
    }

    return obj;
  }

  /**
   * Return an object to a pool
   */
  returnObject<T>(poolName: string, obj: T): void {
    const pool = this.pools.get(poolName) as PoolInstance<T>;
    if (!pool || !pool.inUse.has(obj)) {
      return;
    }

    // Record metrics
    const borrowTime = pool.borrowTimes.get(obj);
    if (borrowTime) {
      const usageDuration = Date.now() - borrowTime;
      pool.borrowTimes.delete(obj);
    }

    pool.inUse.delete(obj);
    pool.returned++;

    try {
      // Reset object state
      pool.reset(obj);
      
      // Check if object should be kept or destroyed
      if (this.shouldKeepObject(pool, obj)) {
        pool.available.push(obj);
      } else {
        this.destroyObject(pool, obj);
      }
    } catch (error) {
      // If reset fails, destroy the object
      this.destroyObject(pool, obj);
      this.emit('error', new Error(`Failed to reset object in pool '${poolName}': ${error}`));
    }
  }

  /**
   * Expand a pool if possible
   */
  expandPool(poolName: string): boolean {
    const pool = this.pools.get(poolName);
    if (!pool) {return false;}

    const newMaxSize = Math.min(
      pool.maxSize * pool.config.growthFactor,
      this.config.globalMaxSize
    );

    if (newMaxSize > pool.maxSize && this.totalObjects < this.config.globalMaxSize) {
      pool.maxSize = newMaxSize;
      this.emit('pool-expanded', { poolName, newMaxSize });
      return true;
    }

    return false;
  }

  /**
   * Cleanup a specific pool
   */
  async cleanupPool(poolName: string): Promise<void> {
    const pool = this.pools.get(poolName);
    if (!pool) {return;}

    const now = Date.now();
    const objectsToDestroy: unknown[] = [];

    // Find idle objects to remove
    for (let i = pool.available.length - 1; i >= 0; i--) {
      const obj = pool.available[i];
      const creationTime = pool.creationTimes.get(obj) || now;
      const idleTime = now - creationTime;

      if (idleTime > pool.config.maxIdleTime) {
        objectsToDestroy.push(pool.available.splice(i, 1)[0]);
      }
    }

    // Destroy idle objects
    for (const obj of objectsToDestroy) {
      this.destroyObject(pool, obj);
    }

    // Shrink pool if below threshold
    if (pool.available.length < pool.maxSize * pool.config.shrinkThreshold) {
      const targetSize = Math.max(pool.config.initialSize, pool.available.length);
      pool.maxSize = targetSize;
    }

    pool.lastCleanup = now;
    this.emit('pool-cleaned', { poolName, destroyedCount: objectsToDestroy.length });
  }

  /**
   * Cleanup all pools
   */
  async cleanup(): Promise<void> {
    const cleanupPromises = Array.from(this.pools.keys()).map(poolName => 
      this.cleanupPool(poolName)
    );
    
    await Promise.all(cleanupPromises);
  }

  /**
   * Get metrics for a specific pool
   */
  getPoolMetrics(poolName: string): PoolMetrics | null {
    const pool = this.pools.get(poolName);
    if (!pool) {return null;}

    const totalBorrows = pool.borrowed;
    const hitRate = totalBorrows > 0 ? (pool.returned / totalBorrows) : 0;
    
    const borrowTimes = Array.from(pool.borrowTimes.values());
    const avgBorrowTime = borrowTimes.length > 0 ? 
      borrowTimes.reduce((sum, time) => sum + (Date.now() - time), 0) / borrowTimes.length : 0;
    const maxBorrowTime = borrowTimes.length > 0 ? 
      Math.max(...borrowTimes.map(time => Date.now() - time)) : 0;

    return {
      name: poolName,
      size: pool.size,
      active: pool.inUse.size,
      idle: pool.available.length,
      created: pool.created,
      destroyed: pool.destroyed,
      hitRate,
      avgBorrowTime,
      maxBorrowTime
    };
  }

  /**
   * Get metrics for all pools
   */
  getAllPoolMetrics(): Record<string, PoolMetrics> {
    const metrics: Record<string, PoolMetrics> = {};
    
    for (const poolName of this.pools.keys()) {
      const poolMetrics = this.getPoolMetrics(poolName);
      if (poolMetrics) {
        metrics[poolName] = poolMetrics;
      }
    }
    
    return metrics;
  }

  /**
   * Close all pools and cleanup
   */
  async close(): Promise<void> {
    for (const [poolName, pool] of this.pools.entries()) {
      // Destroy all objects
      for (const obj of pool.available) {
        this.destroyObject(pool, obj);
      }
      for (const obj of pool.inUse) {
        this.destroyObject(pool, obj);
      }
      
      pool.available.length = 0;
      pool.inUse.clear();
      pool.creationTimes.clear();
      pool.borrowTimes.clear();
    }
    
    this.pools.clear();
    this.totalObjects = 0;
    this.emit('pools-closed');
  }

  private createObject<T>(pool: PoolInstance<T>): T {
    try {
      const obj = pool.factory();
      pool.size++;
      pool.created++;
      this.totalObjects++;
      
      pool.creationTimes.set(obj, Date.now());
      
      this.emit('object-created', { poolName: pool.name, totalObjects: this.totalObjects });
      
      return obj;
    } catch (error) {
      this.emit('error', new Error(`Failed to create object in pool '${pool.name}': ${error}`));
      throw error;
    }
  }

  private destroyObject<T>(pool: PoolInstance<T>, obj: T): void {
    pool.size--;
    pool.destroyed++;
    this.totalObjects--;
    
    pool.creationTimes.delete(obj);
    pool.borrowTimes.delete(obj);
    
    // Explicit cleanup for objects with dispose methods
    if (obj && typeof (obj as unknown as { dispose?: () => void }).dispose === 'function') {
      try {
        (obj as unknown as { dispose: () => void }).dispose();
      } catch (error) {
        this.emit('error', new Error(`Failed to dispose object in pool '${pool.name}': ${error}`));
      }
    }
  }

  private shouldKeepObject<T>(pool: PoolInstance<T>, obj: T): boolean {
    const creationTime = pool.creationTimes.get(obj);
    if (!creationTime) {return false;}

    const age = Date.now() - creationTime;
    if (age > pool.config.maxIdleTime) {return false;}

    // Keep if pool is not over capacity
    return pool.available.length < pool.maxSize;
  }

  private preallocateObjects<T>(pool: PoolInstance<T>): void {
    for (let i = 0; i < pool.config.initialSize; i++) {
      try {
        const obj = this.createObject(pool);
        pool.available.push(obj);
      } catch (error) {
        this.emit('error', new Error(`Failed to preallocate object in pool '${pool.name}': ${error}`));
        break;
      }
    }
  }

  private getDefaultPoolConfig(): PoolConfig {
    return {
      initialSize: 5,
      maxSize: 50,
      growthFactor: 1.5,
      shrinkThreshold: 0.3,
      maxIdleTime: 300000, // 5 minutes
      validationEnabled: false,
      metricsEnabled: true
    };
  }
}