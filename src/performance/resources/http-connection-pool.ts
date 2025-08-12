/**
 * HTTP connection pool implementation for network optimization
 */

import { EventEmitter } from 'events';
import { ConnectionPoolConfig } from '../types';
import { ConnectionPoolMetrics } from './resource-manager';

interface HttpConnection {
  id: string;
  created: Date;
  lastUsed: Date;
  inUse: boolean;
  requestCount: number;
  errorCount: number;
  isValid: boolean;
  host: string;
  port: number;
  isSecure: boolean;
  agent?: unknown; // HTTP Agent
}

interface ConnectionRequest {
  id: string;
  timestamp: Date;
  host: string;
  port: number;
  isSecure: boolean;
  resolve: (connection: HttpConnection) => void;
  reject: (error: Error) => void;
  timeout?: NodeJS.Timeout;
}

export class HttpConnectionPool extends EventEmitter {
  private readonly config: ConnectionPoolConfig;
  private readonly connections: Map<string, HttpConnection>;
  private readonly connectionsByHost: Map<string, Set<string>>;
  private readonly availableConnections: Map<string, string[]>;
  private readonly pendingRequests: ConnectionRequest[];
  private connectionCounter: number;
  private isInitialized: boolean;
  private isClosing: boolean;
  private cleanupTimer?: NodeJS.Timeout;
  private healthCheckTimer?: NodeJS.Timeout;
  private metrics: ConnectionPoolMetrics;

  constructor(config: ConnectionPoolConfig) {
    super();
    this.config = config;
    this.connections = new Map();
    this.connectionsByHost = new Map();
    this.availableConnections = new Map();
    this.pendingRequests = [];
    this.connectionCounter = 0;
    this.isInitialized = false;
    this.isClosing = false;

    this.metrics = {
      name: config.name,
      type: config.type,
      totalConnections: 0,
      activeConnections: 0,
      idleConnections: 0,
      waitingRequests: 0,
      createdConnections: 0,
      destroyedConnections: 0,
      connectionErrors: 0,
      avgConnectionTime: 0,
      avgAcquisitionTime: 0,
      poolUtilization: 0,
      leakCount: 0
    };
  }

  /**
   * Initialize the connection pool
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {return;}

    // Start maintenance tasks
    this.startCleanupTimer();
    this.startHealthCheckTimer();

    this.isInitialized = true;
    this.emit('pool-initialized', { 
      poolName: this.config.name,
      type: 'HTTP'
    });
  }

  /**
   * Acquire a connection for a specific host
   */
  async acquire(host: string = 'api.github.com', port: number = 443, isSecure: boolean = true): Promise<HttpConnection> {
    if (this.isClosing) {
      throw new Error('HTTP connection pool is closing');
    }

    const startTime = Date.now();
    const hostKey = `${host}:${port}:${isSecure}`;
    
    // Try to get an available connection for this host
    const availableForHost = this.availableConnections.get(hostKey) || [];
    const connectionId = availableForHost.pop();
    
    if (connectionId) {
      const connection = this.connections.get(connectionId);
      if (connection && connection.isValid && this.isConnectionHealthy(connection)) {
        connection.inUse = true;
        connection.lastUsed = new Date();
        this.updateMetrics();
        this.updateAcquisitionTime(Date.now() - startTime);
        return connection;
      }
    }

    // Try to create a new connection if under limits
    if (this.canCreateConnection(hostKey)) {
      try {
        const connection = await this.createConnection(host, port, isSecure);
        connection.inUse = true;
        connection.lastUsed = new Date();
        this.updateMetrics();
        this.updateAcquisitionTime(Date.now() - startTime);
        return connection;
      } catch (error) {
        // Fall through to queuing
      }
    }

    // Queue the request if no connections available
    return this.queueConnectionRequest(host, port, isSecure, startTime);
  }

  /**
   * Release a connection back to the pool
   */
  async release(connection: HttpConnection): Promise<void> {
    if (!this.connections.has(connection.id)) {
      return; // Connection not from this pool
    }

    connection.inUse = false;
    connection.lastUsed = new Date();

    // Check if connection should be kept
    if (this.isConnectionHealthy(connection)) {
      const hostKey = `${connection.host}:${connection.port}:${connection.isSecure}`;
      const availableForHost = this.availableConnections.get(hostKey) || [];
      availableForHost.push(connection.id);
      this.availableConnections.set(hostKey, availableForHost);
      
      this.processPendingRequests();
    } else {
      // Remove unhealthy connection
      await this.destroyConnection(connection.id);
    }

    this.updateMetrics();
    this.emit('connection-released', { connectionId: connection.id });
  }

  /**
   * Get pool metrics
   */
  getMetrics(): ConnectionPoolMetrics {
    this.updateMetrics();
    return { ...this.metrics };
  }

  /**
   * Perform pool cleanup
   */
  async cleanup(): Promise<void> {
    const now = Date.now();
    const maxIdleTime = this.config.idleTimeout;
    const connectionsToDestroy: string[] = [];

    // Find connections that have been idle too long
    for (const [connectionId, connection] of this.connections.entries()) {
      if (!connection.inUse) {
        const idleTime = now - connection.lastUsed.getTime();
        if (idleTime > maxIdleTime) {
          connectionsToDestroy.push(connectionId);
        }
      }
    }

    // Destroy idle connections
    const destroyPromises = connectionsToDestroy.map(id => this.destroyConnection(id));
    await Promise.allSettled(destroyPromises);

    this.emit('cleanup-completed', { 
      destroyedConnections: connectionsToDestroy.length,
      remainingConnections: this.connections.size
    });
  }

  /**
   * Close the connection pool gracefully
   */
  async close(): Promise<void> {
    this.isClosing = true;

    // Clear timers
    if (this.cleanupTimer) {clearInterval(this.cleanupTimer);}
    if (this.healthCheckTimer) {clearInterval(this.healthCheckTimer);}

    // Reject pending requests
    for (const request of this.pendingRequests) {
      if (request.timeout) {clearTimeout(request.timeout);}
      request.reject(new Error('HTTP connection pool is closing'));
    }
    this.pendingRequests.length = 0;

    // Wait for active connections to be returned
    await this.waitForActiveConnections();

    // Destroy all connections
    const destroyPromises: Promise<void>[] = [];
    for (const connectionId of this.connections.keys()) {
      destroyPromises.push(this.destroyConnection(connectionId));
    }

    await Promise.allSettled(destroyPromises);
    
    this.connections.clear();
    this.connectionsByHost.clear();
    this.availableConnections.clear();

    this.emit('pool-closed', { poolName: this.config.name });
  }

  /**
   * Force close the connection pool immediately
   */
  async forceClose(): Promise<void> {
    this.isClosing = true;

    // Clear timers
    if (this.cleanupTimer) {clearInterval(this.cleanupTimer);}
    if (this.healthCheckTimer) {clearInterval(this.healthCheckTimer);}

    // Reject pending requests
    for (const request of this.pendingRequests) {
      if (request.timeout) {clearTimeout(request.timeout);}
      request.reject(new Error('HTTP connection pool force closed'));
    }
    this.pendingRequests.length = 0;

    // Force destroy all connections
    const destroyPromises: Promise<void>[] = [];
    for (const connectionId of this.connections.keys()) {
      destroyPromises.push(this.destroyConnection(connectionId, true));
    }

    await Promise.allSettled(destroyPromises);
    
    this.connections.clear();
    this.connectionsByHost.clear();
    this.availableConnections.clear();

    this.emit('pool-force-closed', { poolName: this.config.name });
  }

  private async createConnection(host: string, port: number, isSecure: boolean): Promise<HttpConnection> {
    const connectionId = `http-conn-${++this.connectionCounter}`;
    const startTime = Date.now();

    try {
      // Mock HTTP agent/connection creation
      const agent = await this.createHttpAgent(host, port, isSecure);
      
      const connection: HttpConnection = {
        id: connectionId,
        created: new Date(),
        lastUsed: new Date(),
        inUse: false,
        requestCount: 0,
        errorCount: 0,
        isValid: true,
        host,
        port,
        isSecure,
        agent
      };

      this.connections.set(connectionId, connection);
      
      // Track by host
      const hostKey = `${host}:${port}:${isSecure}`;
      const hostConnections = this.connectionsByHost.get(hostKey) || new Set();
      hostConnections.add(connectionId);
      this.connectionsByHost.set(hostKey, hostConnections);
      
      this.metrics.createdConnections++;
      
      const connectionTime = Date.now() - startTime;
      this.updateConnectionTime(connectionTime);

      this.emit('connection-created', { 
        connectionId, 
        poolName: this.config.name,
        host,
        port,
        isSecure,
        connectionTime 
      });

      return connection;
    } catch (error) {
      this.metrics.connectionErrors++;
      this.emit('connection-error', { 
        poolName: this.config.name, 
        host,
        port,
        error: error instanceof Error ? error.message : String(error) 
      });
      throw error;
    }
  }

  private async destroyConnection(connectionId: string, force: boolean = false): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) {return;}

    // Remove from host tracking
    const hostKey = `${connection.host}:${connection.port}:${connection.isSecure}`;
    const hostConnections = this.connectionsByHost.get(hostKey);
    if (hostConnections) {
      hostConnections.delete(connectionId);
      if (hostConnections.size === 0) {
        this.connectionsByHost.delete(hostKey);
      }
    }

    // Remove from available connections
    const availableForHost = this.availableConnections.get(hostKey);
    if (availableForHost) {
      const index = availableForHost.indexOf(connectionId);
      if (index !== -1) {
        availableForHost.splice(index, 1);
      }
    }

    // Close HTTP agent/connection
    if (connection.agent) {
      try {
        await this.closeHttpAgent(connection.agent, force);
      } catch (error) {
        this.emit('connection-error', { 
          connectionId, 
          error: error instanceof Error ? error.message : String(error) 
        });
      }
    }

    this.connections.delete(connectionId);
    this.metrics.destroyedConnections++;

    this.emit('connection-destroyed', { 
      connectionId, 
      poolName: this.config.name,
      host: connection.host,
      port: connection.port
    });
  }

  private canCreateConnection(hostKey: string): boolean {
    // Check global connection limit
    if (this.connections.size >= this.config.maxConnections) {
      return false;
    }

    // Check per-host connection limit (if applicable)
    const hostConnections = this.connectionsByHost.get(hostKey);
    const maxPerHost = Math.ceil(this.config.maxConnections / 10); // Max 10% per host
    
    if (hostConnections && hostConnections.size >= maxPerHost) {
      return false;
    }

    return true;
  }

  private async queueConnectionRequest(
    host: string, 
    port: number, 
    isSecure: boolean, 
    startTime: number
  ): Promise<HttpConnection> {
    return new Promise((resolve, reject) => {
      const request: ConnectionRequest = {
        id: `req-${Date.now()}-${Math.random()}`,
        timestamp: new Date(),
        host,
        port,
        isSecure,
        resolve: (connection) => {
          this.updateAcquisitionTime(Date.now() - startTime);
          resolve(connection);
        },
        reject
      };

      // Set timeout
      request.timeout = setTimeout(() => {
        const index = this.pendingRequests.indexOf(request);
        if (index !== -1) {
          this.pendingRequests.splice(index, 1);
        }
        reject(new Error(`HTTP connection acquisition timeout after ${this.config.connectionTimeout}ms`));
      }, this.config.connectionTimeout);

      this.pendingRequests.push(request);
      this.updateMetrics();
    });
  }

  private processPendingRequests(): void {
    for (let i = this.pendingRequests.length - 1; i >= 0; i--) {
      const request = this.pendingRequests[i];
      const hostKey = `${request.host}:${request.port}:${request.isSecure}`;
      const availableForHost = this.availableConnections.get(hostKey);
      
      if (availableForHost && availableForHost.length > 0) {
        const connectionId = availableForHost.pop()!;
        const connection = this.connections.get(connectionId);

        if (connection && connection.isValid && this.isConnectionHealthy(connection)) {
          // Remove request from queue
          this.pendingRequests.splice(i, 1);
          
          if (request.timeout) {clearTimeout(request.timeout);}
          
          connection.inUse = true;
          connection.lastUsed = new Date();
          request.resolve(connection);
        }
      } else if (this.canCreateConnection(hostKey)) {
        // Try to create a new connection
        this.createConnection(request.host, request.port, request.isSecure)
          .then(connection => {
            // Remove request from queue
            const index = this.pendingRequests.indexOf(request);
            if (index !== -1) {
              this.pendingRequests.splice(index, 1);
            }
            
            if (request.timeout) {clearTimeout(request.timeout);}
            
            connection.inUse = true;
            connection.lastUsed = new Date();
            request.resolve(connection);
          })
          .catch(error => {
            // Keep request in queue for retry
          });
        break; // Only try to create one connection per processing cycle
      }
    }
    
    this.updateMetrics();
  }

  private isConnectionHealthy(connection: HttpConnection): boolean {
    if (!connection.isValid) {return false;}

    const now = Date.now();
    const age = now - connection.created.getTime();
    const maxAge = this.config.maxLifetime || 3600000; // 1 hour default

    // Check connection age
    if (age > maxAge) {return false;}

    // Check error rate
    if (connection.requestCount > 0) {
      const errorRate = connection.errorCount / connection.requestCount;
      if (errorRate > 0.1) {return false;} // 10% error threshold
    }

    return true;
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup().catch(error => {
        this.emit('cleanup-error', error);
      });
    }, 60000); // Clean up every minute
  }

  private startHealthCheckTimer(): void {
    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck().catch(error => {
        this.emit('health-check-error', error);
      });
    }, 30000); // Health check every 30 seconds
  }

  private async performHealthCheck(): Promise<void> {
    const connectionsToDestroy: string[] = [];

    for (const [connectionId, connection] of this.connections.entries()) {
      if (!connection.inUse && !this.isConnectionHealthy(connection)) {
        connectionsToDestroy.push(connectionId);
      }
    }

    // Destroy unhealthy connections
    const destroyPromises = connectionsToDestroy.map(id => this.destroyConnection(id));
    await Promise.allSettled(destroyPromises);

    if (connectionsToDestroy.length > 0) {
      this.emit('unhealthy-connections-removed', { 
        count: connectionsToDestroy.length,
        poolName: this.config.name
      });
    }
  }

  private async waitForActiveConnections(): Promise<void> {
    return new Promise((resolve) => {
      const checkActive = () => {
        const activeCount = Array.from(this.connections.values()).filter(c => c.inUse).length;
        if (activeCount === 0) {
          resolve();
        } else {
          setTimeout(checkActive, 100);
        }
      };
      checkActive();
    });
  }

  private updateMetrics(): void {
    const activeConnections = Array.from(this.connections.values()).filter(c => c.inUse).length;
    
    this.metrics.totalConnections = this.connections.size;
    this.metrics.activeConnections = activeConnections;
    this.metrics.idleConnections = this.connections.size - activeConnections;
    this.metrics.waitingRequests = this.pendingRequests.length;
    this.metrics.poolUtilization = this.config.maxConnections > 0 ? 
      (this.connections.size / this.config.maxConnections) * 100 : 0;

    // Check for potential leaks
    this.detectConnectionLeaks();
  }

  private updateConnectionTime(time: number): void {
    const totalConnections = this.metrics.createdConnections;
    const totalTime = this.metrics.avgConnectionTime * (totalConnections - 1);
    this.metrics.avgConnectionTime = (totalTime + time) / totalConnections;
  }

  private updateAcquisitionTime(time: number): void {
    const totalAcquisitions = this.metrics.createdConnections;
    if (totalAcquisitions > 0) {
      const totalTime = this.metrics.avgAcquisitionTime * (totalAcquisitions - 1);
      this.metrics.avgAcquisitionTime = (totalTime + time) / totalAcquisitions;
    }
  }

  private detectConnectionLeaks(): void {
    const now = Date.now();
    const leakThreshold = this.config.leakDetectionThreshold || 600000; // 10 minutes
    let leakCount = 0;

    for (const connection of this.connections.values()) {
      if (connection.inUse) {
        const usageTime = now - connection.lastUsed.getTime();
        if (usageTime > leakThreshold) {
          leakCount++;
        }
      }
    }

    if (leakCount > this.metrics.leakCount) {
      this.emit('leak-detected', { 
        poolName: this.config.name,
        leakCount,
        previousLeakCount: this.metrics.leakCount
      });
    }

    this.metrics.leakCount = leakCount;
  }

  // Mock HTTP agent methods
  private async createHttpAgent(host: string, port: number, isSecure: boolean): Promise<unknown> {
    // Simulate agent creation time
    await new Promise(resolve => setTimeout(resolve, 10 + Math.random() * 20));
    
    // Simulate occasional connection failures
    if (Math.random() < 0.01) {
      throw new Error('HTTP agent creation failed');
    }

    return {
      id: `agent-${Date.now()}`,
      host,
      port,
      isSecure,
      connected: true,
      requests: 0,
      keepAlive: true
    };
  }

  private async closeHttpAgent(agent: unknown, force: boolean = false): Promise<void> {
    const httpAgent = agent as { 
      connected: boolean; 
      keepAlive: boolean;
      destroy?: () => void;
    };

    if (force && httpAgent.destroy) {
      // Force close
      httpAgent.destroy();
    } else {
      // Graceful close
      httpAgent.keepAlive = false;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    httpAgent.connected = false;
  }
}