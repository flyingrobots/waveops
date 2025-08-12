/**
 * Main performance optimization coordinator
 * Orchestrates all performance systems for WaveOps
 */

import { EventEmitter } from 'events';
/* eslint-env node */
import {
  CacheConfig,
  MemoryConfig,
  NetworkConfig,
  BackgroundConfig,
  ResourceConfig,
  PerformanceMonitoringConfig
} from './types';

import { CacheManager } from './cache';
import { MemoryManager } from './memory';
import { NetworkOptimizer } from './network';
import { QueueManager } from './background';
import { ResourceManager } from './resources';
import { PerformanceMonitor } from './monitoring';

export interface PerformanceConfig {
  cache: CacheConfig;
  memory: MemoryConfig;
  network: NetworkConfig;
  background: BackgroundConfig;
  resources: ResourceConfig;
  monitoring: PerformanceMonitoringConfig;
}

export interface PerformanceMetrics {
  timestamp: Date;
  uptime: number;
  cache: {
    hitRate: number;
    memoryUsage: number;
    operations: number;
  };
  memory: {
    heapUsed: number;
    heapUtilization: number;
    gcMetrics: {
      collections: number;
      totalTime: number;
    };
  };
  network: {
    requestsPerSecond: number;
    avgResponseTime: number;
    errorRate: number;
  };
  background: {
    queueSize: number;
    processingRate: number;
    workerUtilization: number;
  };
  resources: {
    connectionPoolUsage: number;
    leakCount: number;
    cleanupOperations: number;
  };
  healthScore: number;
}

export class PerformanceCoordinator extends EventEmitter {
  private readonly config: PerformanceConfig;
  private readonly cacheManager: CacheManager;
  private readonly memoryManager: MemoryManager;
  private readonly networkOptimizer: NetworkOptimizer;
  private readonly queueManager: QueueManager;
  private readonly resourceManager: ResourceManager;
  private readonly performanceMonitor: PerformanceMonitor;

  private isInitialized: boolean;
  private isRunning: boolean;
  private startTime: Date;
  private metricsTimer?: ReturnType<typeof setInterval>;
  private healthCheckTimer?: ReturnType<typeof setInterval>;

  constructor(config: PerformanceConfig) {
    super();
    this.config = config;
    this.isInitialized = false;
    this.isRunning = false;
    this.startTime = new Date();

    // Initialize performance systems
    this.cacheManager = new CacheManager(config.cache);
    this.memoryManager = new MemoryManager(config.memory);
    this.networkOptimizer = new NetworkOptimizer(config.network);
    this.queueManager = new QueueManager(config.background);
    this.resourceManager = new ResourceManager(config.resources);
    this.performanceMonitor = new PerformanceMonitor(config.monitoring);

    this.setupEventHandlers();
  }

  /**
   * Initialize all performance systems
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {return;}

    this.emit('initialization-started');

    try {
      // Initialize systems in dependency order
      await this.resourceManager.start?.() || Promise.resolve();
      await this.memoryManager.start?.() || Promise.resolve();
      await this.cacheManager.start?.() || Promise.resolve();
      await this.networkOptimizer.start?.() || Promise.resolve();
      await this.queueManager.start();
      await this.performanceMonitor.start();

      this.isInitialized = true;
      this.emit('initialization-completed');
    } catch (error) {
      this.emit('initialization-failed', error);
      throw error;
    }
  }

  /**
   * Start performance optimization
   */
  async start(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (this.isRunning) {return;}

    this.isRunning = true;
    this.startTime = new Date();

    // Start periodic tasks
    this.startMetricsCollection();
    this.startHealthChecks();

    this.emit('performance-started');
  }

  /**
   * Stop performance optimization gracefully
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {return;}

    this.isRunning = false;

    // Stop timers
    if (this.metricsTimer) {clearInterval(this.metricsTimer);}
    if (this.healthCheckTimer) {clearInterval(this.healthCheckTimer);}

    this.emit('shutdown-started');

    try {
      // Shutdown systems in reverse order
      await Promise.all([
        this.performanceMonitor.stop(),
        this.queueManager.shutdown(),
        this.networkOptimizer.close(),
        this.cacheManager.close(),
        this.memoryManager.close(),
        this.resourceManager.shutdown()
      ]);

      this.emit('shutdown-completed');
    } catch (error) {
      this.emit('shutdown-error', error);
      throw error;
    }
  }

  /**
   * Get comprehensive performance metrics
   */
  getPerformanceMetrics(): PerformanceMetrics {
    const cacheMetrics = this.cacheManager.getMetrics();
    const memoryMetrics = this.memoryManager.getMemoryMetrics();
    const networkMetrics = this.networkOptimizer.getMetrics();
    const queueMetrics = this.queueManager.getQueueMetrics();
    const resourceMetrics = this.resourceManager.getResourceMetrics();

    const healthScore = this.calculateHealthScore();

    return {
      timestamp: new Date(),
      uptime: Date.now() - this.startTime.getTime(),
      cache: {
        hitRate: cacheMetrics.hitRate,
        memoryUsage: cacheMetrics.memoryUsage,
        operations: cacheMetrics.hits + cacheMetrics.misses
      },
      memory: {
        heapUsed: memoryMetrics.heapUsed,
        heapUtilization: (memoryMetrics.heapUsed / memoryMetrics.heapTotal) * 100,
        gcMetrics: {
          collections: memoryMetrics.gcMetrics.majorGCCount + memoryMetrics.gcMetrics.minorGCCount,
          totalTime: memoryMetrics.gcMetrics.totalGCTime
        }
      },
      network: {
        requestsPerSecond: networkMetrics.throughput,
        avgResponseTime: networkMetrics.avgResponseTime,
        errorRate: (networkMetrics.failedRequests / Math.max(networkMetrics.totalRequests, 1)) * 100
      },
      background: {
        queueSize: queueMetrics.reduce((sum, q) => sum + q.size, 0),
        processingRate: queueMetrics.reduce((sum, q) => sum + q.throughput, 0),
        workerUtilization: 75 // Placeholder - would need actual worker metrics
      },
      resources: {
        connectionPoolUsage: this.calculateAveragePoolUsage(resourceMetrics.connectionPools),
        leakCount: resourceMetrics.leakDetection.suspectedLeaks,
        cleanupOperations: resourceMetrics.lifecycleMetrics.cleanupOperations
      },
      healthScore
    };
  }

  /**
   * Optimize specific aspect of performance
   */
  async optimizeCache(): Promise<void> {
    // Trigger cache optimization
    this.emit('cache-optimization-started');
    // Implementation would depend on specific optimizations
    this.emit('cache-optimization-completed');
  }

  async optimizeMemory(): Promise<void> {
    this.emit('memory-optimization-started');
    await this.memoryManager.optimizeGC();
    await this.memoryManager.cleanup();
    this.emit('memory-optimization-completed');
  }

  async optimizeResources(): Promise<void> {
    this.emit('resource-optimization-started');
    await this.resourceManager.cleanup();
    this.emit('resource-optimization-completed');
  }

  /**
   * Perform comprehensive health check
   */
  async performHealthCheck(): Promise<{
    healthy: boolean;
    issues: string[];
    recommendations: string[];
    score: number;
  }> {
    const issues: string[] = [];
    const recommendations: string[] = [];
    let score = 100;

    // Check each system
    const metrics = this.getPerformanceMetrics();

    // Cache health
    if (metrics.cache.hitRate < 70) {
      issues.push('Low cache hit rate');
      recommendations.push('Review cache configuration and TTL settings');
      score -= 15;
    }

    // Memory health
    if (metrics.memory.heapUtilization > 85) {
      issues.push('High memory usage');
      recommendations.push('Increase heap size or optimize memory usage');
      score -= 20;
    }

    // Network health
    if (metrics.network.avgResponseTime > 1000) {
      issues.push('High response times');
      recommendations.push('Optimize network configuration or increase capacity');
      score -= 25;
    }

    if (metrics.network.errorRate > 5) {
      issues.push('High error rate');
      recommendations.push('Investigate error sources and improve error handling');
      score -= 30;
    }

    // Background processing health
    if (metrics.background.queueSize > 1000) {
      issues.push('High queue backlog');
      recommendations.push('Increase worker capacity or optimize processing');
      score -= 15;
    }

    // Resource health
    if (metrics.resources.connectionPoolUsage > 90) {
      issues.push('High connection pool usage');
      recommendations.push('Increase connection pool size or optimize usage');
      score -= 10;
    }

    if (metrics.resources.leakCount > 0) {
      issues.push('Resource leaks detected');
      recommendations.push('Investigate and fix resource leaks');
      score -= 20;
    }

    const healthy = score >= 80 && issues.length === 0;

    return {
      healthy,
      issues,
      recommendations,
      score: Math.max(0, score)
    };
  }

  /**
   * Get system uptime
   */
  getUptime(): number {
    return Date.now() - this.startTime.getTime();
  }

  /**
   * Force cleanup of all systems
   */
  async forceCleanup(): Promise<void> {
    this.emit('force-cleanup-started');

    await Promise.allSettled([
      this.memoryManager.cleanup(),
      this.resourceManager.cleanup()
    ]);

    this.emit('force-cleanup-completed');
  }

  private setupEventHandlers(): void {
    // Cache events
    this.cacheManager.on('error', (error) => {
      this.emit('cache-error', error);
    });

    this.cacheManager.on('cache:eviction', (data) => {
      this.emit('cache-eviction', data);
    });

    // Memory events
    this.memoryManager.on('memory:critical', (data) => {
      this.emit('memory-critical', data);
      // Trigger emergency cleanup
      this.memoryManager.cleanup().catch(() => {});
    });

    this.memoryManager.on('memory:leak-detected', (suspects) => {
      this.emit('memory-leak-detected', suspects);
    });

    // Network events
    this.networkOptimizer.on('network:request-throttled', (data) => {
      this.emit('network-throttled', data);
    });

    // Background processing events
    this.queueManager.on('queue-alert', (alert) => {
      this.emit('queue-alert', alert);
    });

    // Resource events
    this.resourceManager.on('resource-leak', (leak) => {
      this.emit('resource-leak-detected', leak);
    });

    this.resourceManager.on('pool-exhausted', (data) => {
      this.emit('connection-pool-exhausted', data);
    });

    // Monitoring events
    this.performanceMonitor.on('alert-triggered', (alert) => {
      this.emit('performance-alert', alert);
    });

    this.performanceMonitor.on('profiling-completed', (data) => {
      this.emit('profiling-completed', data);
    });
  }

  private startMetricsCollection(): void {
    this.metricsTimer = setInterval(() => {
      try {
        const metrics = this.getPerformanceMetrics();
        this.performanceMonitor.recordMetric('performance.health_score', metrics.healthScore);
        this.performanceMonitor.recordMetric('performance.uptime', metrics.uptime);
        this.emit('metrics-collected', metrics);
      } catch (error) {
        this.emit('metrics-error', error);
      }
    }, 30000); // Every 30 seconds
  }

  private startHealthChecks(): void {
    this.healthCheckTimer = setInterval(async () => {
      try {
        const health = await this.performHealthCheck();
        this.emit('health-check-completed', health);

        // Take action on health issues
        if (!health.healthy) {
          this.emit('health-issues-detected', health);
          
          // Trigger automatic optimizations
          if (health.score < 50) {
            await this.forceCleanup();
          }
        }
      } catch (error) {
        this.emit('health-check-error', error);
      }
    }, 60000); // Every minute
  }

  private calculateHealthScore(): number {
    const metrics = this.getPerformanceMetrics();
    let score = 100;

    // Deduct points based on various factors
    if (metrics.cache.hitRate < 80) {score -= 10;}
    if (metrics.memory.heapUtilization > 80) {score -= 15;}
    if (metrics.network.avgResponseTime > 500) {score -= 15;}
    if (metrics.network.errorRate > 2) {score -= 20;}
    if (metrics.background.queueSize > 100) {score -= 10;}
    if (metrics.resources.leakCount > 0) {score -= 15;}

    return Math.max(0, score);
  }

  private calculateAveragePoolUsage(pools: Record<string, unknown>): number {
    const poolUsages = Object.values(pools).map(pool => 
      (pool as { poolUtilization: number }).poolUtilization || 0
    );
    
    if (poolUsages.length === 0) {return 0;}
    
    return poolUsages.reduce((sum, usage) => sum + usage, 0) / poolUsages.length;
  }
}