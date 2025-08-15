/**
 * Database connection pool implementation
 */

import { EventEmitter } from 'events';
import { ConnectionPoolConfig } from '../types';
import { ConnectionPoolMetrics } from './resource-manager';

interface DatabaseConnection {
  id: string;
  created: Date;
  lastUsed: Date;
  inUse: boolean;
  queryCount: number;
  errorCount: number;
  isValid: boolean;
  client?: unknown; // Actual database client
}

interface ConnectionRequest {
  id: string;
  timestamp: Date;
  resolve: (connection: DatabaseConnection) => void;
  reject: (error: Error) => void;
  timeout?: NodeJS.Timeout;
}

export class DatabaseConnectionPool extends EventEmitter {
  private readonly config: ConnectionPoolConfig;
  private readonly connections: Map<string, DatabaseConnection>;
  private readonly availableConnections: string[];
  private readonly pendingRequests: ConnectionRequest[];
  private connectionCounter: number;
  private isInitialized: boolean;
  private isClosing: boolean;
  private validationTimer?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;
  private metrics: ConnectionPoolMetrics;

  constructor(config: ConnectionPoolConfig) {
    super();
    this.config = config;
    this.connections = new Map();
    this.availableConnections = [];
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

    // Create minimum connections
    const createPromises: Promise<void>[] = [];
    for (let i = 0; i < this.config.minConnections; i++) {
      createPromises.push(this.createConnection().then(() => {}));
    }

    await Promise.allSettled(createPromises);

    // Start maintenance tasks
    this.startValidationTimer();
    this.startCleanupTimer();

    this.isInitialized = true;
    this.emit('pool-initialized', { 
      poolName: this.config.name,
      initialConnections: this.connections.size 
    });
  }

  /**
   * Acquire a connection from the pool
   */
  async acquire(): Promise<DatabaseConnection> {
    if (this.isClosing) {
      throw new Error('Connection pool is closing');
    }

    const startTime = Date.now();
    
    // Try to get an available connection
    const connectionId = this.availableConnections.pop();
    if (connectionId) {
      const connection = this.connections.get(connectionId);
      if (connection && connection.isValid) {
        connection.inUse = true;
        connection.lastUsed = new Date();
        this.updateMetrics();
        this.updateAcquisitionTime(Date.now() - startTime);
        return connection;
      }
    }

    // Try to create a new connection if under limit
    if (this.connections.size < this.config.maxConnections) {
      try {
        const connection = await this.createConnection();
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
    return this.queueConnectionRequest(startTime);
  }

  /**
   * Release a connection back to the pool
   */
  async release(connection: DatabaseConnection): Promise<void> {
    if (!this.connections.has(connection.id)) {
      return; // Connection not from this pool
    }

    connection.inUse = false;
    connection.lastUsed = new Date();

    // Validate connection before returning to pool
    if (await this.validateConnection(connection)) {
      this.availableConnections.push(connection.id);
      this.processPendingRequests();
    } else {
      // Remove invalid connection
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

    // Ensure we maintain minimum connections
    const keepCount = Math.max(
      this.config.minConnections,
      this.connections.size - connectionsToDestroy.length
    );
    connectionsToDestroy.splice(keepCount);

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
    if (this.validationTimer) {clearInterval(this.validationTimer);}
    if (this.cleanupTimer) {clearInterval(this.cleanupTimer);}

    // Reject pending requests
    for (const request of this.pendingRequests) {
      if (request.timeout) {clearTimeout(request.timeout);}
      request.reject(new Error('Connection pool is closing'));
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
    this.availableConnections.length = 0;

    this.emit('pool-closed', { poolName: this.config.name });
  }

  /**
   * Force close the connection pool immediately
   */
  async forceClose(): Promise<void> {
    this.isClosing = true;

    // Clear timers
    if (this.validationTimer) {clearInterval(this.validationTimer);}
    if (this.cleanupTimer) {clearInterval(this.cleanupTimer);}

    // Reject pending requests
    for (const request of this.pendingRequests) {
      if (request.timeout) {clearTimeout(request.timeout);}
      request.reject(new Error('Connection pool force closed'));
    }
    this.pendingRequests.length = 0;

    // Force destroy all connections
    const destroyPromises: Promise<void>[] = [];
    for (const connectionId of this.connections.keys()) {
      destroyPromises.push(this.destroyConnection(connectionId, true));
    }

    await Promise.allSettled(destroyPromises);
    
    this.connections.clear();
    this.availableConnections.length = 0;

    this.emit('pool-force-closed', { poolName: this.config.name });
  }

  private async createConnection(): Promise<DatabaseConnection> {
    const connectionId = `db-conn-${++this.connectionCounter}`;
    const startTime = Date.now();

    try {
      // Mock database connection creation
      const client = await this.createDatabaseClient();
      
      const connection: DatabaseConnection = {
        id: connectionId,
        created: new Date(),
        lastUsed: new Date(),
        inUse: false,
        queryCount: 0,
        errorCount: 0,
        isValid: true,
        client
      };

      this.connections.set(connectionId, connection);
      this.availableConnections.push(connectionId);
      this.metrics.createdConnections++;
      
      const connectionTime = Date.now() - startTime;
      this.updateConnectionTime(connectionTime);

      this.emit('connection-created', { 
        connectionId, 
        poolName: this.config.name,
        connectionTime 
      });

      return connection;
    } catch (error) {
      this.metrics.connectionErrors++;
      this.emit('connection-error', { 
        poolName: this.config.name, 
        error: error instanceof Error ? error.message : String(error) 
      });
      throw error;
    }
  }

  private async destroyConnection(connectionId: string, force: boolean = false): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) {return;}

    // Remove from available connections
    const availableIndex = this.availableConnections.indexOf(connectionId);
    if (availableIndex !== -1) {
      this.availableConnections.splice(availableIndex, 1);
    }

    // Close database client
    if (connection.client) {
      try {
        await this.closeDatabaseClient(connection.client, force);
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
      poolName: this.config.name 
    });
  }

  private async queueConnectionRequest(startTime: number): Promise<DatabaseConnection> {
    return new Promise((resolve, reject) => {
      const request: ConnectionRequest = {
        id: `req-${Date.now()}-${Math.random()}`,
        timestamp: new Date(),
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
        reject(new Error(`Connection acquisition timeout after ${this.config.connectionTimeout}ms`));
      }, this.config.connectionTimeout);

      this.pendingRequests.push(request);
      this.updateMetrics();
    });
  }

  private processPendingRequests(): void {
    while (this.pendingRequests.length > 0 && this.availableConnections.length > 0) {
      const request = this.pendingRequests.shift()!;
      const connectionId = this.availableConnections.pop()!;
      const connection = this.connections.get(connectionId);

      if (request.timeout) {clearTimeout(request.timeout);}

      if (connection && connection.isValid) {
        connection.inUse = true;
        connection.lastUsed = new Date();
        request.resolve(connection);
      } else {
        // Connection is invalid, try again
        if (connection) {
          this.destroyConnection(connection.id);
        }
        this.pendingRequests.unshift(request); // Put request back
        break;
      }
    }
    
    this.updateMetrics();
  }

  private async validateConnection(connection: DatabaseConnection): Promise<boolean> {
    if (!this.config.validationQuery) {
      return connection.isValid;
    }

    try {
      // Mock validation query
      await this.executeValidationQuery(connection.client);
      connection.isValid = true;
      return true;
    } catch (error) {
      connection.isValid = false;
      connection.errorCount++;
      this.emit('connection-validation-failed', { 
        connectionId: connection.id, 
        error 
      });
      return false;
    }
  }

  private startValidationTimer(): void {
    if (!this.config.testInterval) {return;}

    this.validationTimer = setInterval(() => {
      this.validateAllConnections().catch(error => {
        this.emit('validation-error', error);
      });
    }, this.config.testInterval);
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup().catch(error => {
        this.emit('cleanup-error', error);
      });
    }, 60000); // Clean up every minute
  }

  private async validateAllConnections(): Promise<void> {
    const validationPromises: Promise<void>[] = [];

    for (const connection of this.connections.values()) {
      if (!connection.inUse) {
        validationPromises.push(
          this.validateConnection(connection).then(isValid => {
            if (!isValid) {
              this.destroyConnection(connection.id);
            }
          })
        );
      }
    }

    await Promise.allSettled(validationPromises);
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
    const totalAcquisitions = this.metrics.createdConnections + this.metrics.waitingRequests;
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

  // Mock database client methods
  private async createDatabaseClient(): Promise<unknown> {
    // Simulate connection time
    await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));
    
    // Simulate occasional connection failures
    if (Math.random() < 0.02) {
      throw new Error('Database connection failed');
    }

    return {
      id: `client-${Date.now()}`,
      connected: true,
      queries: 0
    };
  }

  private async closeDatabaseClient(client: unknown, force: boolean = false): Promise<void> {
    // Simulate client closure
    if (force) {
      // Immediate termination
      (client as { connected: boolean }).connected = false;
    } else {
      // Graceful shutdown
      await new Promise(resolve => setTimeout(resolve, 10));
      (client as { connected: boolean }).connected = false;
    }
  }

  private async executeValidationQuery(client: unknown): Promise<void> {
    // Simulate validation query
    await new Promise(resolve => setTimeout(resolve, 5));
    
    if (!(client as { connected: boolean }).connected) {
      throw new Error('Connection is closed');
    }

    // Simulate occasional validation failures
    if (Math.random() < 0.01) {
      throw new Error('Validation query failed');
    }

    (client as { queries: number }).queries++;
  }
}