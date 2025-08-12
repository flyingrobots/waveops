/**
 * Connection pool management for network optimization
 */

import { EventEmitter } from 'events';
import { ConnectionConfig } from '../types';

export interface ConnectionMetrics {
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  connectionErrors: number;
  avgConnectionTime: number;
}

interface Connection {
  id: string;
  created: Date;
  lastUsed: Date;
  inUse: boolean;
  host: string;
  port: number;
  isValid: boolean;
  errorCount: number;
  totalRequests: number;
}

interface ConnectionRequest {
  id: string;
  timestamp: number;
  resolve: (connection: Connection) => void;
  reject: (error: Error) => void;
  timeout?: NodeJS.Timeout;
}

export class ConnectionPool extends EventEmitter {
  private readonly config: ConnectionConfig;
  private readonly connections: Map<string, Connection>;
  private readonly activeConnections: Set<string>;
  private readonly pendingRequests: ConnectionRequest[];
  private readonly metrics: ConnectionMetrics;
  private connectionCounter: number;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(config: ConnectionConfig) {
    super();
    this.config = config;
    this.connections = new Map();
    this.activeConnections = new Set();
    this.pendingRequests = [];
    this.connectionCounter = 0;
    
    this.metrics = {
      totalConnections: 0,
      activeConnections: 0,
      idleConnections: 0,
      connectionErrors: 0,
      avgConnectionTime: 0
    };

    if (config.pooling?.enabled) {
      this.startMaintenanceTasks();
    }
  }

  /**
   * Acquire a connection from the pool
   */
  async acquire(): Promise<Connection> {
    const startTime = Date.now();
    
    if (!this.config.pooling?.enabled) {
      return this.createConnection('direct');
    }

    // Try to get an available connection
    const availableConnection = this.getAvailableConnection();
    if (availableConnection) {
      this.markConnectionInUse(availableConnection);
      this.updateConnectionTime(Date.now() - startTime);
      return availableConnection;
    }

    // Create new connection if under limit
    if (this.canCreateNewConnection()) {
      const connection = await this.createConnection('pooled');
      this.markConnectionInUse(connection);
      this.updateConnectionTime(Date.now() - startTime);
      return connection;
    }

    // Wait for connection to become available
    return this.waitForConnection(startTime);
  }

  /**
   * Release a connection back to the pool
   */
  release(connection: Connection): void {
    if (!this.connections.has(connection.id)) {
      return; // Connection not from this pool
    }

    connection.inUse = false;
    connection.lastUsed = new Date();
    this.activeConnections.delete(connection.id);

    // Process pending requests
    this.processPendingRequests();

    this.emit('connection-released', { connectionId: connection.id });
  }

  /**
   * Close a specific connection
   */
  async closeConnection(connection: Connection): Promise<void> {
    this.connections.delete(connection.id);
    this.activeConnections.delete(connection.id);
    
    connection.isValid = false;
    
    this.metrics.totalConnections--;
    this.updateMetrics();

    this.emit('connection-closed', { connectionId: connection.id });
  }

  /**
   * Get connection pool metrics
   */
  getMetrics(): ConnectionMetrics {
    this.updateMetrics();
    return { ...this.metrics };
  }

  /**
   * Close all connections and shutdown pool
   */
  async close(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    // Reject all pending requests
    for (const request of this.pendingRequests) {
      if (request.timeout) {
        clearTimeout(request.timeout);
      }
      request.reject(new Error('Connection pool is closing'));
    }
    this.pendingRequests.length = 0;

    // Close all connections
    const closePromises: Promise<void>[] = [];
    for (const connection of this.connections.values()) {
      closePromises.push(this.closeConnection(connection));
    }

    await Promise.allSettled(closePromises);
    
    this.connections.clear();
    this.activeConnections.clear();

    this.emit('pool-closed');
  }

  private getAvailableConnection(): Connection | null {
    for (const connection of this.connections.values()) {
      if (!connection.inUse && connection.isValid && this.isConnectionHealthy(connection)) {
        return connection;
      }
    }
    return null;
  }

  private canCreateNewConnection(): boolean {
    const poolConfig = this.config.pooling;
    if (!poolConfig) return true;

    return this.connections.size < poolConfig.maxConnections;
  }

  private async createConnection(type: 'direct' | 'pooled'): Promise<Connection> {
    const connectionId = `conn-${++this.connectionCounter}`;
    const startTime = Date.now();

    try {
      // Mock connection creation - in production this would create actual HTTP agents
      await this.simulateConnectionCreation();

      const connection: Connection = {
        id: connectionId,
        created: new Date(),
        lastUsed: new Date(),
        inUse: false,
        host: 'api.github.com',
        port: 443,
        isValid: true,
        errorCount: 0,
        totalRequests: 0
      };

      if (type === 'pooled') {
        this.connections.set(connectionId, connection);
      }

      this.metrics.totalConnections++;
      this.updateConnectionTime(Date.now() - startTime);

      this.emit('connection-created', {
        connectionId,
        type,
        creationTime: Date.now() - startTime
      });

      return connection;
    } catch (error) {
      this.metrics.connectionErrors++;
      
      const connectionError = new Error(
        `Failed to create connection: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      
      this.emit('connection-error', connectionError);
      throw connectionError;
    }
  }

  private async simulateConnectionCreation(): Promise<void> {
    // Simulate network connection setup
    const connectionTime = 50 + Math.random() * 100; // 50-150ms
    await new Promise(resolve => setTimeout(resolve, connectionTime));
    
    // Simulate occasional connection failures
    if (Math.random() < 0.02) { // 2% failure rate
      throw new Error('Connection failed');
    }
  }

  private markConnectionInUse(connection: Connection): void {
    connection.inUse = true;
    connection.lastUsed = new Date();
    connection.totalRequests++;
    this.activeConnections.add(connection.id);
  }

  private async waitForConnection(startTime: number): Promise<Connection> {
    return new Promise((resolve, reject) => {
      const timeoutMs = this.config.pooling?.acquireTimeoutMs || 10000;
      
      const request: ConnectionRequest = {
        id: `req-${Date.now()}-${Math.random()}`,
        timestamp: Date.now(),
        resolve,
        reject
      };

      request.timeout = setTimeout(() => {
        const index = this.pendingRequests.indexOf(request);
        if (index !== -1) {
          this.pendingRequests.splice(index, 1);
        }
        
        reject(new Error(`Connection acquisition timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingRequests.push(request);
    });
  }

  private processPendingRequests(): void {
    while (this.pendingRequests.length > 0) {
      const availableConnection = this.getAvailableConnection();
      if (!availableConnection && !this.canCreateNewConnection()) {
        break;
      }

      const request = this.pendingRequests.shift()!;
      if (request.timeout) {
        clearTimeout(request.timeout);
      }

      if (availableConnection) {
        this.markConnectionInUse(availableConnection);
        request.resolve(availableConnection);
      } else {
        // Create new connection
        this.createConnection('pooled')
          .then(connection => {
            this.markConnectionInUse(connection);
            request.resolve(connection);
          })
          .catch(error => {
            request.reject(error);
          });
      }
    }
  }

  private isConnectionHealthy(connection: Connection): boolean {
    const now = Date.now();
    const idleTime = now - connection.lastUsed.getTime();
    const poolConfig = this.config.pooling;

    // Check idle timeout
    if (poolConfig && idleTime > poolConfig.idleTimeoutMs) {
      return false;
    }

    // Check error rate
    if (connection.errorCount > 3 && connection.totalRequests > 0) {
      const errorRate = connection.errorCount / connection.totalRequests;
      if (errorRate > 0.1) { // 10% error rate
        return false;
      }
    }

    return true;
  }

  private startMaintenanceTasks(): void {
    this.cleanupTimer = setInterval(() => {
      this.performMaintenance();
    }, 30000); // Every 30 seconds
  }

  private performMaintenance(): void {
    const poolConfig = this.config.pooling;
    if (!poolConfig) return;

    const now = Date.now();
    const connectionsToClose: Connection[] = [];

    // Find connections to close
    for (const connection of this.connections.values()) {
      if (connection.inUse) continue;

      const idleTime = now - connection.lastUsed.getTime();
      const age = now - connection.created.getTime();

      // Close if idle too long
      if (idleTime > poolConfig.idleTimeoutMs) {
        connectionsToClose.push(connection);
        continue;
      }

      // Close if unhealthy
      if (!this.isConnectionHealthy(connection)) {
        connectionsToClose.push(connection);
        continue;
      }

      // Close if over max idle time
      if (poolConfig.idleTimeoutMs && age > poolConfig.idleTimeoutMs) {
        connectionsToClose.push(connection);
        continue;
      }
    }

    // Close identified connections
    for (const connection of connectionsToClose) {
      this.closeConnection(connection).catch(error => {
        this.emit('error', error);
      });
    }

    // Ensure minimum connections if configured
    const idleConnections = this.connections.size - this.activeConnections.size;
    if (poolConfig.minConnections && idleConnections < poolConfig.minConnections) {
      const needed = poolConfig.minConnections - idleConnections;
      
      for (let i = 0; i < needed; i++) {
        this.createConnection('pooled').catch(error => {
          this.emit('error', error);
        });
      }
    }

    this.emit('maintenance-completed', {
      closedConnections: connectionsToClose.length,
      totalConnections: this.connections.size
    });
  }

  private updateMetrics(): void {
    this.metrics.totalConnections = this.connections.size;
    this.metrics.activeConnections = this.activeConnections.size;
    this.metrics.idleConnections = this.connections.size - this.activeConnections.size;
  }

  private updateConnectionTime(time: number): void {
    const totalConnections = this.metrics.totalConnections;
    const totalTime = this.metrics.avgConnectionTime * (totalConnections - 1);
    this.metrics.avgConnectionTime = (totalTime + time) / totalConnections;
  }
}