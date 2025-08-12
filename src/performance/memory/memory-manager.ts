/**
 * Advanced memory management system with object pooling and GC optimization
 */

import { EventEmitter } from 'events';
import {
  MemoryConfig,
  ObjectPool,
  MemoryMetrics,
  GCMetrics,
  PoolMetrics,
  LeakSuspect,
  GCStrategy,
  MemoryManagementError,
  MemoryErrorType
} from '../types';
import { ObjectPoolManager } from './object-pool-manager';
import { LeakDetector } from './leak-detector';
import { GCOptimizer } from './gc-optimizer';

export interface IMemoryManager {
  getPool<T>(name: string): ObjectPool<T> | null;
  createPool<T>(name: string, factory: () => T, reset: (obj: T) => void, maxSize?: number): ObjectPool<T>;
  borrowObject<T extends object>(poolName: string): T | null;
  returnObject<T extends object>(poolName: string, obj: T): void;
  getMemoryMetrics(): MemoryMetrics;
  optimizeGC(): Promise<void>;
  detectLeaks(): Promise<LeakSuspect[]>;
  cleanup(): Promise<void>;
  close(): Promise<void>;
}

export class MemoryManager extends EventEmitter implements IMemoryManager {
  private readonly config: MemoryConfig;
  private readonly poolManager: ObjectPoolManager;
  private readonly leakDetector: LeakDetector;
  private readonly gcOptimizer: GCOptimizer;
  private metricsTimer?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;
  private gcTimer?: NodeJS.Timeout;
  private startTime: Date;

  constructor(config: MemoryConfig) {
    super();
    this.config = config;
    this.startTime = new Date();
    
    this.poolManager = new ObjectPoolManager(config.objectPooling);
    this.leakDetector = new LeakDetector(config.leakDetection);
    this.gcOptimizer = new GCOptimizer(config.gcOptimization);

    this.setupEventHandlers();
    this.startPeriodicTasks();
  }

  /**
   * Get an existing object pool
   */
  getPool<T>(name: string): ObjectPool<T> | null {
    return this.poolManager.getPool<T>(name);
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
    try {
      return this.poolManager.createPool(name, factory, reset, maxSize);
    } catch (error) {
      const managementError = new MemoryManagementError(
        `Failed to create pool '${name}': ${error instanceof Error ? error.message : 'Unknown error'}`,
        MemoryErrorType.POOL_CREATION_FAILED,
        { poolName: name, maxSize }
      );
      this.emit('error', managementError);
      throw managementError;
    }
  }

  /**
   * Borrow an object from a pool
   */
  borrowObject<T extends object>(poolName: string): T | null {
    try {
      const obj = this.poolManager.borrowObject<T>(poolName);
      
      if (obj && this.config.leakDetection.enabled) {
        this.leakDetector.trackObject(poolName, obj);
      }
      
      return obj;
    } catch (error) {
      const managementError = new MemoryManagementError(
        `Failed to borrow object from pool '${poolName}': ${error instanceof Error ? error.message : 'Unknown error'}`,
        MemoryErrorType.OBJECT_CREATION_FAILED,
        { poolName }
      );
      this.emit('error', managementError);
      return null;
    }
  }

  /**
   * Return an object to a pool
   */
  returnObject<T extends object>(poolName: string, obj: T): void {
    try {
      if (this.config.leakDetection.enabled) {
        this.leakDetector.untrackObject(poolName, obj);
      }
      
      this.poolManager.returnObject(poolName, obj);
    } catch (error) {
      const managementError = new MemoryManagementError(
        `Failed to return object to pool '${poolName}': ${error instanceof Error ? error.message : 'Unknown error'}`,
        MemoryErrorType.OBJECT_CREATION_FAILED,
        { poolName }
      );
      this.emit('error', managementError);
    }
  }

  /**
   * Get comprehensive memory metrics
   */
  getMemoryMetrics(): MemoryMetrics {
    const memUsage = process.memoryUsage();
    const poolMetrics = this.poolManager.getAllPoolMetrics();
    const gcMetrics = this.gcOptimizer.getMetrics();
    const leakSuspects = this.leakDetector.getSuspects();

    return {
      timestamp: new Date(),
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss,
      gcMetrics,
      poolMetrics,
      leakSuspects
    };
  }

  /**
   * Optimize garbage collection
   */
  async optimizeGC(): Promise<void> {
    try {
      await this.gcOptimizer.optimize();
      this.emit('gc-optimized');
    } catch (error) {
      const managementError = new MemoryManagementError(
        `GC optimization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        MemoryErrorType.GC_OPTIMIZATION_FAILED
      );
      this.emit('error', managementError);
      throw managementError;
    }
  }

  /**
   * Detect memory leaks
   */
  async detectLeaks(): Promise<LeakSuspect[]> {
    try {
      const suspects = await this.leakDetector.detectLeaks();
      
      if (suspects.length > 0) {
        this.emit('leaks-detected', suspects);
        
        // Auto-cleanup if enabled
        if (this.config.leakDetection.automaticCleanupEnabled) {
          await this.cleanupLeaks(suspects);
        }
      }
      
      return suspects;
    } catch (error) {
      const managementError = new MemoryManagementError(
        `Leak detection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        MemoryErrorType.MEMORY_LEAK_DETECTED
      );
      this.emit('error', managementError);
      throw managementError;
    }
  }

  /**
   * Perform memory cleanup
   */
  async cleanup(): Promise<void> {
    try {
      // Cleanup object pools
      await this.poolManager.cleanup();
      
      // Clean up leak detector
      await this.leakDetector.cleanup();
      
      // Force GC if memory usage is high
      const memUsage = process.memoryUsage();
      const heapUsagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
      
      if (heapUsagePercent > this.config.gcOptimization.forceGCThreshold) {
        await this.gcOptimizer.forceGC();
      }
      
      this.emit('cleanup-completed');
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Close memory manager and cleanup resources
   */
  async close(): Promise<void> {
    try {
      // Stop timers
      if (this.metricsTimer) clearInterval(this.metricsTimer);
      if (this.cleanupTimer) clearInterval(this.cleanupTimer);
      if (this.gcTimer) clearInterval(this.gcTimer);

      // Cleanup components
      await this.poolManager.close();
      await this.leakDetector.close();
      await this.gcOptimizer.close();

      this.emit('closed');
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  private setupEventHandlers(): void {
    // Pool manager events
    this.poolManager.on('pool-created', (data) => {
      this.emit('memory:pool-created', data);
    });

    this.poolManager.on('pool-exhausted', (data) => {
      this.emit('memory:pool-exhausted', data);
      
      // Try to expand pool or trigger cleanup
      this.handlePoolExhaustion(data.poolName);
    });

    this.poolManager.on('object-created', (data) => {
      this.emit('memory:object-created', data);
    });

    // Leak detector events
    this.leakDetector.on('leak-detected', (suspects) => {
      this.emit('memory:leak-detected', suspects);
    });

    this.leakDetector.on('leak-cleaned', (data) => {
      this.emit('memory:leak-cleaned', data);
    });

    // GC optimizer events
    this.gcOptimizer.on('gc-triggered', (data) => {
      this.emit('memory:gc-triggered', data);
    });

    this.gcOptimizer.on('gc-completed', (metrics) => {
      this.emit('memory:gc-completed', metrics);
    });
  }

  private startPeriodicTasks(): void {
    // Metrics collection
    this.metricsTimer = setInterval(() => {
      const metrics = this.getMemoryMetrics();
      this.emit('memory:metrics', metrics);
      
      // Check memory limits
      this.checkMemoryLimits(metrics);
    }, 30000); // Every 30 seconds

    // Cleanup task
    this.cleanupTimer = setInterval(() => {
      this.cleanup().catch(error => {
        this.emit('error', error);
      });
    }, this.config.objectPooling.cleanupInterval);

    // GC optimization (if enabled and adaptive)
    if (this.config.gcOptimization.enabled && 
        this.config.gcOptimization.strategy === GCStrategy.ADAPTIVE) {
      this.gcTimer = setInterval(() => {
        this.optimizeGC().catch(error => {
          this.emit('error', error);
        });
      }, 60000); // Every minute
    }

    // Leak detection
    if (this.config.leakDetection.enabled) {
      setInterval(() => {
        this.detectLeaks().catch(error => {
          this.emit('error', error);
        });
      }, this.config.leakDetection.reportingInterval);
    }
  }

  private checkMemoryLimits(metrics: MemoryMetrics): void {
    const heapUsagePercent = (metrics.heapUsed / metrics.heapTotal) * 100;
    
    if (heapUsagePercent >= 85) { // Critical threshold
      this.emit('memory:critical', { usage: heapUsagePercent, metrics });
      
      // Trigger aggressive cleanup
      this.cleanup().catch(error => {
        this.emit('error', error);
      });
    } else if (heapUsagePercent >= 70) { // Warning threshold
      this.emit('memory:warning', { usage: heapUsagePercent, metrics });
    }
  }

  private async handlePoolExhaustion(poolName: string): Promise<void> {
    try {
      // Try to expand the pool
      const expanded = this.poolManager.expandPool(poolName);
      
      if (!expanded) {
        // Trigger cleanup to free up objects
        await this.poolManager.cleanupPool(poolName);
      }
    } catch (error) {
      this.emit('error', error);
    }
  }

  private async cleanupLeaks(suspects: LeakSuspect[]): Promise<void> {
    for (const suspect of suspects) {
      try {
        await this.leakDetector.cleanupSuspect(suspect);
        this.emit('memory:leak-cleaned', { type: suspect.type, count: suspect.count });
      } catch (error) {
        this.emit('error', new MemoryManagementError(
          `Failed to cleanup leak suspect: ${suspect.type}`,
          MemoryErrorType.MEMORY_LEAK_DETECTED,
          { suspect }
        ));
      }
    }
  }
}