/**
 * Resource lifecycle management for graceful creation and cleanup
 */

import { EventEmitter } from 'events';
import { LifecycleConfig, ResourceType } from '../types';
import { LifecycleMetrics } from './resource-manager';

interface ManagedResource {
  id: string;
  type: ResourceType;
  name: string;
  created: Date;
  lastAccessed: Date;
  cleanup: () => Promise<void> | void;
  metadata?: Record<string, unknown>;
}

interface CleanupOperation {
  id: string;
  resourceId: string;
  startTime: Date;
  endTime?: Date;
  success: boolean;
  error?: string;
}

export class ResourceLifecycleManager extends EventEmitter {
  private readonly config: LifecycleConfig;
  private readonly managedResources: Map<string, ManagedResource>;
  private readonly cleanupHistory: CleanupOperation[];
  private readonly cleanupCallbacks: Map<ResourceType, (() => Promise<void> | void)[]>;
  private isShuttingDown: boolean;
  private resourceCounter: number;
  private cleanupTimer?: NodeJS.Timeout;
  private metrics: LifecycleMetrics;

  constructor(config: LifecycleConfig) {
    super();
    this.config = config;
    this.managedResources = new Map();
    this.cleanupHistory = [];
    this.cleanupCallbacks = new Map();
    this.isShuttingDown = false;
    this.resourceCounter = 0;

    this.metrics = {
      resourcesCreated: 0,
      resourcesDestroyed: 0,
      cleanupOperations: 0,
      gracefulShutdowns: 0,
      forcefulShutdowns: 0
    };

    if (config.resourceTrackingEnabled) {
      this.startPeriodicCleanup();
    }

    this.setupExitHandlers();
  }

  /**
   * Register a resource for lifecycle management
   */
  registerResource(
    type: ResourceType,
    name: string,
    cleanup: () => Promise<void> | void,
    metadata?: Record<string, unknown>
  ): string {
    const resourceId = `${type}-${++this.resourceCounter}`;
    
    const resource: ManagedResource = {
      id: resourceId,
      type,
      name,
      created: new Date(),
      lastAccessed: new Date(),
      cleanup,
      metadata
    };

    this.managedResources.set(resourceId, resource);
    this.metrics.resourcesCreated++;

    this.emit('resource-created', {
      resourceId,
      type,
      name,
      metadata
    });

    return resourceId;
  }

  /**
   * Unregister a resource
   */
  async unregisterResource(resourceId: string): Promise<void> {
    const resource = this.managedResources.get(resourceId);
    if (!resource) return;

    try {
      await this.cleanupResource(resource);
      this.managedResources.delete(resourceId);
      this.metrics.resourcesDestroyed++;

      this.emit('resource-destroyed', {
        resourceId,
        type: resource.type,
        name: resource.name
      });
    } catch (error) {
      this.emit('resource-cleanup-error', {
        resourceId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Update resource last accessed time
   */
  touchResource(resourceId: string): void {
    const resource = this.managedResources.get(resourceId);
    if (resource) {
      resource.lastAccessed = new Date();
    }
  }

  /**
   * Register cleanup callbacks for resource types
   */
  onResourceTypeCleanup(type: ResourceType, callback: () => Promise<void> | void): void {
    const callbacks = this.cleanupCallbacks.get(type) || [];
    callbacks.push(callback);
    this.cleanupCallbacks.set(type, callbacks);
  }

  /**
   * Perform cleanup of all managed resources
   */
  async cleanup(): Promise<void> {
    if (this.managedResources.size === 0) return;

    this.emit('cleanup-started', { resourceCount: this.managedResources.size });

    const cleanupPromises: Promise<void>[] = [];
    const startTime = new Date();

    // Group resources by type for ordered cleanup
    const resourcesByType = this.groupResourcesByType();

    // Cleanup resources in specific order
    const cleanupOrder = [
      ResourceType.STREAMS,
      ResourceType.TIMERS,
      ResourceType.EVENT_LISTENERS,
      ResourceType.WORKERS,
      ResourceType.CONNECTIONS,
      ResourceType.FILE_HANDLES
    ];

    for (const type of cleanupOrder) {
      const resources = resourcesByType.get(type) || [];
      const typeCleanupPromises = resources.map(resource => this.cleanupResource(resource));
      
      // Run type-specific cleanup callbacks
      const callbacks = this.cleanupCallbacks.get(type) || [];
      const callbackPromises = callbacks.map(callback => 
        Promise.resolve(callback()).catch(error => {
          this.emit('cleanup-callback-error', { type, error });
        })
      );

      cleanupPromises.push(...typeCleanupPromises, ...callbackPromises);
    }

    const results = await Promise.allSettled(cleanupPromises);
    
    // Count successful vs failed cleanups
    let successCount = 0;
    let failureCount = 0;
    
    for (const result of results) {
      if (result.status === 'fulfilled') {
        successCount++;
      } else {
        failureCount++;
        this.emit('cleanup-error', { error: result.reason });
      }
    }

    this.managedResources.clear();
    this.metrics.cleanupOperations++;

    this.emit('cleanup-completed', {
      totalResources: results.length,
      successCount,
      failureCount,
      duration: Date.now() - startTime.getTime()
    });
  }

  /**
   * Get lifecycle metrics
   */
  getMetrics(): LifecycleMetrics {
    return { ...this.metrics };
  }

  /**
   * Get all managed resources
   */
  getManagedResources(): ManagedResource[] {
    return Array.from(this.managedResources.values());
  }

  /**
   * Get cleanup history
   */
  getCleanupHistory(): CleanupOperation[] {
    return [...this.cleanupHistory];
  }

  /**
   * Close the lifecycle manager gracefully
   */
  async close(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    await this.performGracefulShutdown();
    
    this.emit('lifecycle-manager-closed');
  }

  /**
   * Force close the lifecycle manager
   */
  async forceClose(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    await this.performForcefulShutdown();
    
    this.emit('lifecycle-manager-force-closed');
  }

  private async cleanupResource(resource: ManagedResource): Promise<void> {
    const operationId = `cleanup-${Date.now()}-${Math.random()}`;
    const operation: CleanupOperation = {
      id: operationId,
      resourceId: resource.id,
      startTime: new Date(),
      success: false
    };

    try {
      await Promise.resolve(resource.cleanup());
      
      operation.success = true;
      operation.endTime = new Date();
      
      this.emit('resource-cleanup-success', {
        resourceId: resource.id,
        type: resource.type,
        duration: operation.endTime.getTime() - operation.startTime.getTime()
      });
    } catch (error) {
      operation.success = false;
      operation.endTime = new Date();
      operation.error = error instanceof Error ? error.message : String(error);
      
      this.emit('resource-cleanup-error', {
        resourceId: resource.id,
        type: resource.type,
        error: operation.error
      });
      
      throw error;
    } finally {
      this.cleanupHistory.push(operation);
      
      // Keep cleanup history manageable
      if (this.cleanupHistory.length > 1000) {
        this.cleanupHistory.shift();
      }
    }
  }

  private groupResourcesByType(): Map<ResourceType, ManagedResource[]> {
    const groups = new Map<ResourceType, ManagedResource[]>();
    
    for (const resource of this.managedResources.values()) {
      const typeGroup = groups.get(resource.type) || [];
      typeGroup.push(resource);
      groups.set(resource.type, typeGroup);
    }
    
    return groups;
  }

  private startPeriodicCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.performPeriodicCleanup().catch(error => {
        this.emit('periodic-cleanup-error', error);
      });
    }, 300000); // Every 5 minutes
  }

  private async performPeriodicCleanup(): Promise<void> {
    if (this.isShuttingDown || !this.config.cleanupOnExit) return;

    const now = Date.now();
    const staleThreshold = 3600000; // 1 hour
    const resourcesToCleanup: ManagedResource[] = [];

    // Find stale resources
    for (const resource of this.managedResources.values()) {
      const timeSinceAccess = now - resource.lastAccessed.getTime();
      if (timeSinceAccess > staleThreshold) {
        resourcesToCleanup.push(resource);
      }
    }

    if (resourcesToCleanup.length === 0) return;

    this.emit('periodic-cleanup-started', { 
      staleResourceCount: resourcesToCleanup.length 
    });

    // Clean up stale resources
    const cleanupPromises = resourcesToCleanup.map(async resource => {
      try {
        await this.cleanupResource(resource);
        this.managedResources.delete(resource.id);
        this.metrics.resourcesDestroyed++;
      } catch (error) {
        this.emit('stale-resource-cleanup-error', {
          resourceId: resource.id,
          error
        });
      }
    });

    await Promise.allSettled(cleanupPromises);

    this.emit('periodic-cleanup-completed', {
      cleanedResourceCount: resourcesToCleanup.length
    });
  }

  private async performGracefulShutdown(): Promise<void> {
    this.isShuttingDown = true;
    this.emit('graceful-shutdown-started');

    try {
      // Wait for resources to be cleaned up gracefully
      const shutdownTimeout = this.config.gracefulShutdownTimeout;
      const shutdownPromise = this.cleanup();
      
      await Promise.race([
        shutdownPromise,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Graceful shutdown timeout')), shutdownTimeout)
        )
      ]);

      this.metrics.gracefulShutdowns++;
      this.emit('graceful-shutdown-completed');
    } catch (error) {
      this.emit('graceful-shutdown-failed', { error });
      throw error;
    }
  }

  private async performForcefulShutdown(): Promise<void> {
    this.isShuttingDown = true;
    this.emit('forceful-shutdown-started');

    try {
      // Force cleanup with shorter timeout
      const forceTimeout = this.config.forceShutdownTimeout;
      const cleanupPromise = this.forceCleanupAll();
      
      await Promise.race([
        cleanupPromise,
        new Promise(resolve => setTimeout(resolve, forceTimeout))
      ]);

      this.managedResources.clear();
      this.metrics.forcefulShutdowns++;
      this.emit('forceful-shutdown-completed');
    } catch (error) {
      this.emit('forceful-shutdown-error', { error });
    }
  }

  private async forceCleanupAll(): Promise<void> {
    const resources = Array.from(this.managedResources.values());
    const forceCleanupPromises = resources.map(async resource => {
      try {
        // Give each resource a short timeout for cleanup
        await Promise.race([
          Promise.resolve(resource.cleanup()),
          new Promise(resolve => setTimeout(resolve, 1000)) // 1 second max per resource
        ]);
      } catch (error) {
        // Ignore errors during force cleanup
      }
    });

    await Promise.allSettled(forceCleanupPromises);
  }

  private setupExitHandlers(): void {
    if (!this.config.cleanupOnExit) return;

    // Graceful shutdown handlers
    process.once('SIGINT', () => {
      this.handleProcessExit('SIGINT');
    });

    process.once('SIGTERM', () => {
      this.handleProcessExit('SIGTERM');
    });

    // Handle uncaught exceptions
    process.once('uncaughtException', (error) => {
      this.emit('uncaught-exception', { error });
      this.handleProcessExit('uncaughtException');
    });

    // Handle unhandled promise rejections
    process.once('unhandledRejection', (reason) => {
      this.emit('unhandled-rejection', { reason });
      this.handleProcessExit('unhandledRejection');
    });
  }

  private handleProcessExit(signal: string): void {
    if (this.isShuttingDown) return;

    this.emit('process-exit-signal', { signal });

    this.performGracefulShutdown()
      .catch(() => {
        // If graceful shutdown fails, try forceful
        return this.performForcefulShutdown();
      })
      .finally(() => {
        process.exit(signal === 'uncaughtException' || signal === 'unhandledRejection' ? 1 : 0);
      });
  }
}