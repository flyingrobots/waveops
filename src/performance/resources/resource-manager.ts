/**
 * Comprehensive resource management system
 */

import { EventEmitter } from 'events';
import {
  ResourceConfig,
  ConnectionPoolConfig,
  ConnectionType,
  ResourceType,
  ResourceMonitoringConfig,
  ResourceAlertThresholds,
  LifecycleConfig
} from '../types';
import { DatabaseConnectionPool, DatabaseConnection } from './database-connection-pool';
import { HttpConnectionPool, HttpConnection } from './http-connection-pool';
import { ResourceMonitor } from './resource-monitor';
import { ResourceLifecycleManager } from './resource-lifecycle-manager';

export interface ResourceMetrics {
  timestamp: Date;
  connectionPools: Record<string, ConnectionPoolMetrics>;
  systemResources: SystemResourceMetrics;
  leakDetection: LeakDetectionMetrics;
  lifecycleMetrics: LifecycleMetrics;
}

export interface ConnectionPoolMetrics {
  name: string;
  type: ConnectionType;
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  waitingRequests: number;
  createdConnections: number;
  destroyedConnections: number;
  connectionErrors: number;
  avgConnectionTime: number;
  avgAcquisitionTime: number;
  poolUtilization: number; // percentage
  leakCount: number;
}

export interface SystemResourceMetrics {
  cpuUsage: number; // percentage
  memoryUsage: number; // bytes
  memoryUtilization: number; // percentage
  fileHandles: number;
  networkConnections: number;
  activeTimers: number;
  eventListeners: number;
}

export interface LeakDetectionMetrics {
  suspectedLeaks: number;
  leakTypes: Record<string, number>;
  memoryGrowthRate: number; // bytes per minute
  connectionGrowthRate: number; // connections per minute
}

export interface LifecycleMetrics {
  resourcesCreated: number;
  resourcesDestroyed: number;
  cleanupOperations: number;
  gracefulShutdowns: number;
  forcefulShutdowns: number;
}

export class ResourceManager extends EventEmitter {
  private readonly config: ResourceConfig;
  private readonly connectionPools: Map<string, DatabaseConnectionPool | HttpConnectionPool>;
  private readonly resourceMonitor: ResourceMonitor;
  private readonly lifecycleManager: ResourceLifecycleManager;
  private isShuttingDown: boolean;
  private metricsTimer?: NodeJS.Timeout;

  constructor(config: ResourceConfig) {
    super();
    this.config = config;
    this.connectionPools = new Map();
    this.isShuttingDown = false;

    this.resourceMonitor = new ResourceMonitor(config.monitoring);
    this.lifecycleManager = new ResourceLifecycleManager(config.lifecycleManagement);

    this.initializeConnectionPools();
    this.setupEventListeners();
    
    if (config.monitoring.enabled) {
      this.startMonitoring();
    }
  }

  /**
   * Get a connection from a specific pool
   */
  async getConnection(poolName: string): Promise<unknown> {
    if (this.isShuttingDown) {
      throw new Error('Resource manager is shutting down');
    }

    const pool = this.connectionPools.get(poolName);
    if (!pool) {
      throw new Error(`Connection pool '${poolName}' not found`);
    }

    try {
      const connection = await pool.acquire();
      this.emit('connection-acquired', { poolName, connectionId: this.getConnectionId(connection) });
      return connection;
    } catch (error) {
      this.emit('connection-error', { poolName, error });
      throw error;
    }
  }

  /**
   * Release a connection back to its pool
   */
  async releaseConnection(poolName: string, connection: unknown): Promise<void> {
    const pool = this.connectionPools.get(poolName);
    if (!pool) {
      return; // Pool might have been removed during shutdown
    }

    try {
      await pool.release(connection as DatabaseConnection & HttpConnection);
      this.emit('connection-released', { poolName, connectionId: this.getConnectionId(connection) });
    } catch (error) {
      this.emit('connection-error', { poolName, error });
    }
  }

  /**
   * Create a new connection pool
   */
  async createConnectionPool(config: ConnectionPoolConfig): Promise<void> {
    if (this.connectionPools.has(config.name)) {
      throw new Error(`Connection pool '${config.name}' already exists`);
    }

    let pool: DatabaseConnectionPool | HttpConnectionPool;

    switch (config.type) {
      case ConnectionType.DATABASE:
        pool = new DatabaseConnectionPool(config);
        break;
      case ConnectionType.HTTP:
      case ConnectionType.WEBSOCKET:
        pool = new HttpConnectionPool(config);
        break;
      default:
        throw new Error(`Unsupported connection type: ${config.type}`);
    }

    await pool.initialize();
    this.connectionPools.set(config.name, pool);
    
    this.setupPoolEventHandlers(pool);
    this.emit('pool-created', { poolName: config.name, type: config.type });
  }

  /**
   * Remove a connection pool
   */
  async removeConnectionPool(poolName: string): Promise<void> {
    const pool = this.connectionPools.get(poolName);
    if (!pool) {
      return;
    }

    await pool.close();
    this.connectionPools.delete(poolName);
    
    this.emit('pool-removed', { poolName });
  }

  /**
   * Get comprehensive resource metrics
   */
  getResourceMetrics(): ResourceMetrics {
    const connectionPoolMetrics: Record<string, ConnectionPoolMetrics> = {};
    
    for (const [poolName, pool] of this.connectionPools.entries()) {
      connectionPoolMetrics[poolName] = pool.getMetrics();
    }

    return {
      timestamp: new Date(),
      connectionPools: connectionPoolMetrics,
      systemResources: this.resourceMonitor.getSystemMetrics(),
      leakDetection: this.resourceMonitor.getLeakMetrics(),
      lifecycleMetrics: this.lifecycleManager.getMetrics()
    };
  }

  /**
   * Perform resource cleanup
   */
  async cleanup(): Promise<void> {
    this.emit('cleanup-started');
    
    try {
      // Cleanup connection pools
      const cleanupPromises = Array.from(this.connectionPools.values()).map(pool => 
        pool.cleanup()
      );
      await Promise.allSettled(cleanupPromises);

      // Perform system resource cleanup
      await this.resourceMonitor.cleanup();
      await this.lifecycleManager.cleanup();

      this.emit('cleanup-completed');
    } catch (error) {
      this.emit('cleanup-error', error);
      throw error;
    }
  }

  /**
   * Graceful shutdown of all resources
   */
  async shutdown(timeoutMs: number = 30000): Promise<void> {
    this.isShuttingDown = true;
    this.emit('shutdown-started');

    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
    }

    try {
      // Attempt graceful shutdown
      const shutdownPromise = this.performGracefulShutdown();
      
      await Promise.race([
        shutdownPromise,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Shutdown timeout')), timeoutMs)
        )
      ]);

      this.emit('shutdown-completed');
    } catch (error) {
      this.emit('shutdown-error', error);
      
      // Force shutdown if graceful fails
      await this.forceShutdown();
    }
  }

  /**
   * Force immediate shutdown of all resources
   */
  async forceShutdown(): Promise<void> {
    this.isShuttingDown = true;
    this.emit('force-shutdown-started');

    // Force close all connection pools
    const forceClosePromises: Promise<void>[] = [];
    for (const pool of this.connectionPools.values()) {
      forceClosePromises.push(pool.forceClose());
    }

    await Promise.allSettled(forceClosePromises);
    
    // Force cleanup
    await Promise.allSettled([
      this.resourceMonitor.forceClose(),
      this.lifecycleManager.forceClose()
    ]);

    this.connectionPools.clear();
    this.emit('force-shutdown-completed');
  }

  /**
   * Check resource health and trigger alerts
   */
  async performHealthCheck(): Promise<void> {
    const metrics = this.getResourceMetrics();
    const alerts: string[] = [];
    const thresholds = this.config.monitoring.alertThresholds;

    // Check connection pool usage
    for (const [poolName, poolMetrics] of Object.entries(metrics.connectionPools)) {
      if (poolMetrics.poolUtilization > thresholds.connectionPoolUsage) {
        alerts.push(`Connection pool '${poolName}' usage: ${poolMetrics.poolUtilization}%`);
      }
      
      if (poolMetrics.leakCount > 0) {
        alerts.push(`Connection leaks detected in pool '${poolName}': ${poolMetrics.leakCount}`);
      }
    }

    // Check system resource usage
    if (metrics.systemResources.memoryUtilization > thresholds.memoryUsage) {
      alerts.push(`Memory usage: ${metrics.systemResources.memoryUtilization}%`);
    }

    if (metrics.systemResources.fileHandles > thresholds.fileHandleUsage * 0.01 * 65536) { // Assume 64k limit
      alerts.push(`File handle usage high: ${metrics.systemResources.fileHandles}`);
    }

    if (metrics.systemResources.networkConnections > thresholds.networkConnectionUsage * 0.01 * 1000) { // Assume 1k limit
      alerts.push(`Network connection count high: ${metrics.systemResources.networkConnections}`);
    }

    // Check for memory leaks
    if (metrics.leakDetection.memoryGrowthRate > 10 * 1024 * 1024) { // 10MB per minute
      alerts.push(`Memory growth rate: ${metrics.leakDetection.memoryGrowthRate / 1024 / 1024}MB/min`);
    }

    if (alerts.length > 0) {
      this.emit('health-alert', { alerts, metrics, timestamp: new Date() });
    } else {
      this.emit('health-ok', { metrics, timestamp: new Date() });
    }
  }

  private initializeConnectionPools(): void {
    for (const poolConfig of this.config.connectionPools) {
      this.createConnectionPool(poolConfig).catch(error => {
        this.emit('pool-creation-error', { poolName: poolConfig.name, error });
      });
    }
  }

  private setupEventListeners(): void {
    // Resource monitor events
    this.resourceMonitor.on('leak-detected', (leak) => {
      this.emit('resource-leak', leak);
    });

    this.resourceMonitor.on('threshold-exceeded', (alert) => {
      this.emit('resource-alert', alert);
    });

    // Lifecycle manager events
    this.lifecycleManager.on('resource-created', (resource) => {
      this.emit('resource-created', resource);
    });

    this.lifecycleManager.on('resource-destroyed', (resource) => {
      this.emit('resource-destroyed', resource);
    });

    // Process events for graceful shutdown
    process.on('SIGINT', () => {
      if (!this.isShuttingDown) {
        this.shutdown().catch(() => {
          process.exit(1);
        });
      }
    });

    process.on('SIGTERM', () => {
      if (!this.isShuttingDown) {
        this.shutdown().catch(() => {
          process.exit(1);
        });
      }
    });
  }

  private setupPoolEventHandlers(pool: DatabaseConnectionPool | HttpConnectionPool): void {
    pool.on('connection-created', (data) => {
      this.emit('pool-connection-created', data);
    });

    pool.on('connection-destroyed', (data) => {
      this.emit('pool-connection-destroyed', data);
    });

    pool.on('connection-error', (error) => {
      this.emit('pool-connection-error', error);
    });

    pool.on('pool-exhausted', (data) => {
      this.emit('pool-exhausted', data);
    });

    pool.on('leak-detected', (leak) => {
      this.emit('connection-leak', leak);
    });
  }

  private startMonitoring(): void {
    this.metricsTimer = setInterval(() => {
      this.performHealthCheck().catch(error => {
        this.emit('monitoring-error', error);
      });
    }, this.config.monitoring.trackingInterval);
  }

  private async performGracefulShutdown(): Promise<void> {
    // Close connection pools gracefully
    const gracefulClosePromises: Promise<void>[] = [];
    for (const pool of this.connectionPools.values()) {
      gracefulClosePromises.push(pool.close());
    }

    await Promise.all(gracefulClosePromises);

    // Close monitoring and lifecycle management
    await Promise.all([
      this.resourceMonitor.close(),
      this.lifecycleManager.close()
    ]);

    this.connectionPools.clear();
  }

  private getConnectionId(connection: unknown): string {
    // Generate a unique ID for the connection
    if (connection && typeof connection === 'object' && 'id' in connection) {
      return String((connection as { id: unknown }).id);
    }
    return `conn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}