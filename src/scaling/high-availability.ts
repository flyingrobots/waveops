/**
 * High Availability Infrastructure for WaveOps Enterprise
 * Implements leader election, failover, circuit breakers, and graceful shutdown
 */

import { 
  HAConfiguration, 
  LeaderElectionConfig, 
  FailoverConfig, 
  CircuitBreakerConfig, 
  GracefulShutdownConfig,
  InstanceRole,
  InstanceStatus,
  ScalingInstance,
  HighAvailabilityError 
} from './types';

export interface HADependencies {
  leaderElection: LeaderElectionProvider;
  healthMonitor: HealthMonitor;
  failoverManager: FailoverManager;
  circuitBreakerRegistry: CircuitBreakerRegistry;
  metricsCollector: HAMetricsCollector;
  logger: Logger;
  eventEmitter: HAEventEmitter;
}

export interface LeaderElectionProvider {
  startElection(config: LeaderElectionConfig, instanceId: string): Promise<LeaderElectionResult>;
  stopElection(): Promise<void>;
  isLeader(): boolean;
  getLeaderInfo(): Promise<LeaderInfo | null>;
  renewLease(): Promise<boolean>;
  releaseLease(): Promise<void>;
}

export interface LeaderElectionResult {
  isLeader: boolean;
  leaderIdentity: string;
  leaseDuration: number;
  renewDeadline: number;
}

export interface LeaderInfo {
  identity: string;
  holderIdentity: string;
  leaseDurationSeconds: number;
  acquireTime: Date;
  renewTime: Date;
  leaderTransitions: number;
}

export interface HealthMonitor {
  startMonitoring(): void;
  stopMonitoring(): void;
  isHealthy(): boolean;
  getHealthStatus(): HealthStatus;
  addHealthCheck(check: HealthCheck): void;
  removeHealthCheck(name: string): void;
}

export interface HealthStatus {
  overall: 'healthy' | 'unhealthy' | 'degraded';
  checks: Map<string, HealthCheckResult>;
  lastCheck: Date;
}

export interface HealthCheck {
  name: string;
  check: () => Promise<HealthCheckResult>;
  interval: number;
  timeout: number;
  enabled: boolean;
}

export interface HealthCheckResult {
  healthy: boolean;
  message: string;
  details?: Record<string, unknown>;
  duration: number;
  timestamp: Date;
}

export interface FailoverManager {
  initiate(reason: FailoverReason): Promise<void>;
  canFailover(): boolean;
  getFailoverHistory(): FailoverEvent[];
  registerFailoverHandler(handler: FailoverHandler): void;
}

export interface FailoverEvent {
  id: string;
  reason: FailoverReason;
  fromInstance: string;
  toInstance?: string;
  timestamp: Date;
  duration: number;
  success: boolean;
  error?: string;
}

export enum FailoverReason {
  HEALTH_CHECK_FAILURE = 0,
  LEADER_ELECTION_FAILURE = 1,
  MANUAL_FAILOVER = 2,
  RESOURCE_EXHAUSTION = 3,
  NETWORK_PARTITION = 4
}

export interface FailoverHandler {
  (event: FailoverEvent): Promise<void>;
}

export interface CircuitBreakerRegistry {
  getCircuitBreaker(name: string): CircuitBreaker;
  createCircuitBreaker(name: string, config: CircuitBreakerConfig): CircuitBreaker;
  removeCircuitBreaker(name: string): void;
  getAllBreakers(): Map<string, CircuitBreaker>;
}

export interface CircuitBreaker {
  execute<T>(operation: () => Promise<T>): Promise<T>;
  getState(): CircuitBreakerState;
  getMetrics(): CircuitBreakerMetrics;
  reset(): void;
  forceOpen(): void;
  forceClose(): void;
}

export enum CircuitBreakerState {
  CLOSED = 0,
  OPEN = 1,
  HALF_OPEN = 2
}

export interface CircuitBreakerMetrics {
  name: string;
  state: CircuitBreakerState;
  failureCount: number;
  successCount: number;
  requestCount: number;
  failureRate: number;
  lastFailureTime?: Date;
  lastSuccessTime?: Date;
  stateChangedTime: Date;
}

export interface HAMetricsCollector {
  recordLeaderElection(isLeader: boolean, duration: number): void;
  recordFailover(reason: FailoverReason, success: boolean, duration: number): void;
  recordHealthCheck(name: string, healthy: boolean, duration: number): void;
  recordCircuitBreakerStateChange(name: string, oldState: CircuitBreakerState, newState: CircuitBreakerState): void;
}

export interface Logger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, error?: Error, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;
}

export interface HAEventEmitter {
  emit(event: HAEvent): void;
  on(eventType: string, handler: (event: HAEvent) => void): void;
  off(eventType: string, handler: (event: HAEvent) => void): void;
}

export interface HAEvent {
  type: HAEventType;
  instanceId: string;
  timestamp: Date;
  data: Record<string, unknown>;
}

export enum HAEventType {
  LEADER_ELECTED = 0,
  LEADER_LOST = 1,
  FAILOVER_INITIATED = 2,
  FAILOVER_COMPLETED = 3,
  HEALTH_STATUS_CHANGED = 4,
  CIRCUIT_BREAKER_OPENED = 5,
  CIRCUIT_BREAKER_CLOSED = 6
}

/**
 * High Availability Manager
 * Orchestrates leader election, health monitoring, and failover
 */
export class HighAvailabilityManager {
  private readonly dependencies: HADependencies;
  private readonly configuration: HAConfiguration;
  private readonly instanceId: string;
  
  private currentRole: InstanceRole = InstanceRole.FOLLOWER;
  private currentStatus: InstanceStatus = InstanceStatus.STARTING;
  private isShuttingDown = false;
  private shutdownPromise?: Promise<void>;
  
  private leaderElectionTimer?: NodeJS.Timeout;
  private healthCheckTimer?: NodeJS.Timeout;
  private startTime = new Date();

  constructor(
    dependencies: HADependencies,
    configuration: HAConfiguration,
    instanceId: string
  ) {
    this.dependencies = dependencies;
    this.configuration = configuration;
    this.instanceId = instanceId;
    
    this.setupEventHandlers();
  }

  /**
   * Start the high availability infrastructure
   */
  async start(): Promise<void> {
    this.dependencies.logger.info('Starting High Availability Manager', {
      instanceId: this.instanceId,
      configuration: this.configuration
    });

    try {
      // Initialize circuit breakers
      await this.initializeCircuitBreakers();

      // Start health monitoring
      await this.startHealthMonitoring();

      // Start leader election if enabled
      if (this.configuration.leaderElection.enabled) {
        await this.startLeaderElection();
      }

      // Register failover handlers
      await this.setupFailoverHandlers();

      this.currentStatus = InstanceStatus.HEALTHY;
      
      this.dependencies.eventEmitter.emit({
        type: HAEventType.HEALTH_STATUS_CHANGED,
        instanceId: this.instanceId,
        timestamp: new Date(),
        data: { status: this.currentStatus }
      });

      this.dependencies.logger.info('High Availability Manager started successfully', {
        instanceId: this.instanceId,
        role: this.currentRole
      });

    } catch (error) {
      this.currentStatus = InstanceStatus.FAILED;
      this.dependencies.logger.error('Failed to start High Availability Manager', error as Error, {
        instanceId: this.instanceId
      });
      throw new HighAvailabilityError(
        'Failed to start HA infrastructure',
        this.instanceId,
        this.currentRole,
        'restart_instance'
      );
    }
  }

  /**
   * Stop the high availability infrastructure
   */
  async stop(): Promise<void> {
    if (this.shutdownPromise) {
      return this.shutdownPromise;
    }

    this.shutdownPromise = this.performGracefulShutdown();
    return this.shutdownPromise;
  }

  /**
   * Get current instance information
   */
  getInstanceInfo(): ScalingInstance {
    return {
      instanceId: this.instanceId,
      role: this.currentRole,
      status: this.currentStatus,
      configuration: {
        repositoryConfigurations: [],
        haConfiguration: this.configuration,
        autoScalingConfig: {} as any,
        securityConfig: {} as any,
        observabilityConfig: {} as any
      },
      metrics: this.collectInstanceMetrics(),
      lastHeartbeat: new Date(),
      startTime: this.startTime
    };
  }

  /**
   * Check if instance is healthy
   */
  isHealthy(): boolean {
    return this.currentStatus === InstanceStatus.HEALTHY;
  }

  /**
   * Check if instance is leader
   */
  isLeader(): boolean {
    return this.currentRole === InstanceRole.LEADER;
  }

  /**
   * Force failover to another instance
   */
  async initiateFailover(reason: FailoverReason): Promise<void> {
    this.dependencies.logger.warn('Initiating failover', {
      instanceId: this.instanceId,
      reason,
      currentRole: this.currentRole
    });

    await this.dependencies.failoverManager.initiate(reason);
  }

  private async initializeCircuitBreakers(): Promise<void> {
    const circuitBreakerConfigs = [
      {
        name: 'database',
        config: this.configuration.circuitBreaker
      },
      {
        name: 'redis',
        config: this.configuration.circuitBreaker
      },
      {
        name: 'github-api',
        config: this.configuration.circuitBreaker
      }
    ];

    for (const { name, config } of circuitBreakerConfigs) {
      this.dependencies.circuitBreakerRegistry.createCircuitBreaker(name, config);
    }

    this.dependencies.logger.info('Circuit breakers initialized', {
      instanceId: this.instanceId,
      breakersCount: circuitBreakerConfigs.length
    });
  }

  private async startHealthMonitoring(): Promise<void> {
    // Add default health checks
    this.dependencies.healthMonitor.addHealthCheck({
      name: 'memory',
      check: async () => this.checkMemoryUsage(),
      interval: 30000, // 30 seconds
      timeout: 5000,   // 5 seconds
      enabled: true
    });

    this.dependencies.healthMonitor.addHealthCheck({
      name: 'disk',
      check: async () => this.checkDiskUsage(),
      interval: 60000, // 1 minute
      timeout: 10000,  // 10 seconds
      enabled: true
    });

    this.dependencies.healthMonitor.addHealthCheck({
      name: 'database',
      check: async () => this.checkDatabaseConnection(),
      interval: 15000, // 15 seconds
      timeout: 5000,   // 5 seconds
      enabled: true
    });

    this.dependencies.healthMonitor.startMonitoring();

    this.healthCheckTimer = setInterval(() => {
      this.evaluateHealthStatus();
    }, 10000); // Check every 10 seconds

    this.dependencies.logger.info('Health monitoring started', {
      instanceId: this.instanceId
    });
  }

  private async startLeaderElection(): Promise<void> {
    const electionResult = await this.dependencies.leaderElection.startElection(
      this.configuration.leaderElection,
      this.instanceId
    );

    if (electionResult.isLeader) {
      this.currentRole = InstanceRole.LEADER;
      this.dependencies.eventEmitter.emit({
        type: HAEventType.LEADER_ELECTED,
        instanceId: this.instanceId,
        timestamp: new Date(),
        data: { previousRole: InstanceRole.FOLLOWER }
      });
    } else {
      this.currentRole = InstanceRole.FOLLOWER;
    }

    // Set up lease renewal timer
    this.leaderElectionTimer = setInterval(async () => {
      try {
        const renewed = await this.dependencies.leaderElection.renewLease();
        if (!renewed && this.currentRole === InstanceRole.LEADER) {
          // Lost leadership
          this.currentRole = InstanceRole.FOLLOWER;
          this.dependencies.eventEmitter.emit({
            type: HAEventType.LEADER_LOST,
            instanceId: this.instanceId,
            timestamp: new Date(),
            data: { reason: 'lease_renewal_failed' }
          });
        }
      } catch (error) {
        this.dependencies.logger.error('Lease renewal failed', error as Error, {
          instanceId: this.instanceId
        });
      }
    }, this.configuration.leaderElection.retryPeriodSeconds * 1000);

    this.dependencies.logger.info('Leader election started', {
      instanceId: this.instanceId,
      isLeader: electionResult.isLeader,
      role: this.currentRole
    });
  }

  private async setupFailoverHandlers(): Promise<void> {
    this.dependencies.failoverManager.registerFailoverHandler(async (event: FailoverEvent) => {
      this.dependencies.logger.info('Failover event received', {
        instanceId: this.instanceId,
        event
      });

      // Handle different types of failover events
      switch (event.reason) {
        case FailoverReason.HEALTH_CHECK_FAILURE:
          await this.handleHealthFailover(event);
          break;
        case FailoverReason.LEADER_ELECTION_FAILURE:
          await this.handleLeadershipFailover(event);
          break;
        case FailoverReason.MANUAL_FAILOVER:
          await this.handleManualFailover(event);
          break;
        default:
          this.dependencies.logger.warn('Unknown failover reason', {
            instanceId: this.instanceId,
            reason: event.reason
          });
      }
    });
  }

  private async performGracefulShutdown(): Promise<void> {
    this.isShuttingDown = true;
    this.currentStatus = InstanceStatus.SHUTTING_DOWN;

    const shutdownTimeout = this.configuration.gracefulShutdown.timeoutSeconds * 1000;
    const shutdownStartTime = Date.now();

    this.dependencies.logger.info('Starting graceful shutdown', {
      instanceId: this.instanceId,
      timeout: shutdownTimeout
    });

    try {
      // Stop accepting new requests
      // This would typically involve stopping HTTP servers, etc.

      // Wait for current operations to complete
      await this.waitForOperationsToComplete();

      // Stop leader election
      if (this.leaderElectionTimer) {
        clearInterval(this.leaderElectionTimer);
        await this.dependencies.leaderElection.stopElection();
      }

      // Stop health monitoring
      if (this.healthCheckTimer) {
        clearInterval(this.healthCheckTimer);
        this.dependencies.healthMonitor.stopMonitoring();
      }

      // Execute pre-stop hook if configured
      if (this.configuration.gracefulShutdown.preStopHook) {
        await this.executePreStopHook();
      }

      const shutdownDuration = Date.now() - shutdownStartTime;
      this.dependencies.logger.info('Graceful shutdown completed', {
        instanceId: this.instanceId,
        duration: shutdownDuration
      });

    } catch (error) {
      this.dependencies.logger.error('Error during graceful shutdown', error as Error, {
        instanceId: this.instanceId
      });
      throw error;
    } finally {
      this.currentStatus = InstanceStatus.FAILED;
    }
  }

  private async evaluateHealthStatus(): Promise<void> {
    const healthStatus = this.dependencies.healthMonitor.getHealthStatus();
    
    let newStatus = InstanceStatus.HEALTHY;
    
    if (healthStatus.overall === 'unhealthy') {
      newStatus = InstanceStatus.UNHEALTHY;
    } else if (healthStatus.overall === 'degraded') {
      newStatus = InstanceStatus.UNHEALTHY; // Treat degraded as unhealthy for simplicity
    }

    if (newStatus !== this.currentStatus && !this.isShuttingDown) {
      const previousStatus = this.currentStatus;
      this.currentStatus = newStatus;

      this.dependencies.eventEmitter.emit({
        type: HAEventType.HEALTH_STATUS_CHANGED,
        instanceId: this.instanceId,
        timestamp: new Date(),
        data: { 
          previousStatus,
          newStatus,
          healthChecks: Array.from(healthStatus.checks.entries())
        }
      });

      // Record metrics
      for (const [name, result] of healthStatus.checks) {
        this.dependencies.metricsCollector.recordHealthCheck(
          name,
          result.healthy,
          result.duration
        );
      }

      // If we became unhealthy and we're the leader, consider failover
      if (newStatus === InstanceStatus.UNHEALTHY && this.currentRole === InstanceRole.LEADER) {
        if (this.configuration.failover.automaticFailover) {
          await this.initiateFailover(FailoverReason.HEALTH_CHECK_FAILURE);
        }
      }
    }
  }

  private async checkMemoryUsage(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      const memUsage = process.memoryUsage();
      const heapUsed = memUsage.heapUsed;
      const heapTotal = memUsage.heapTotal;
      const heapUsedMB = Math.round(heapUsed / 1024 / 1024 * 100) / 100;
      const heapTotalMB = Math.round(heapTotal / 1024 / 1024 * 100) / 100;
      const usagePercent = (heapUsed / heapTotal) * 100;

      const healthy = usagePercent < 90; // Consider unhealthy if using > 90% of heap

      return {
        healthy,
        message: `Memory usage: ${heapUsedMB}MB / ${heapTotalMB}MB (${usagePercent.toFixed(1)}%)`,
        details: {
          heapUsed: heapUsedMB,
          heapTotal: heapTotalMB,
          usagePercent: usagePercent,
          rss: Math.round(memUsage.rss / 1024 / 1024 * 100) / 100,
          external: Math.round(memUsage.external / 1024 / 1024 * 100) / 100
        },
        duration: Date.now() - startTime,
        timestamp: new Date()
      };
    } catch (error) {
      return {
        healthy: false,
        message: `Memory check failed: ${(error as Error).message}`,
        duration: Date.now() - startTime,
        timestamp: new Date()
      };
    }
  }

  private async checkDiskUsage(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      // This is a simplified disk check - in a real implementation,
      // you would use a library like 'node-disk-info' or execute 'df' command
      const stats = await import('fs').then(fs => fs.promises.stat('.'));
      
      return {
        healthy: true,
        message: 'Disk usage check passed',
        details: {
          size: stats.size,
          birthtime: stats.birthtime,
          mtime: stats.mtime
        },
        duration: Date.now() - startTime,
        timestamp: new Date()
      };
    } catch (error) {
      return {
        healthy: false,
        message: `Disk check failed: ${(error as Error).message}`,
        duration: Date.now() - startTime,
        timestamp: new Date()
      };
    }
  }

  private async checkDatabaseConnection(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      // This would use the actual database connection in a real implementation
      const circuitBreaker = this.dependencies.circuitBreakerRegistry.getCircuitBreaker('database');
      
      await circuitBreaker.execute(async () => {
        // Simulate database ping
        return new Promise(resolve => setTimeout(resolve, 10));
      });

      return {
        healthy: true,
        message: 'Database connection healthy',
        duration: Date.now() - startTime,
        timestamp: new Date()
      };
    } catch (error) {
      return {
        healthy: false,
        message: `Database connection failed: ${(error as Error).message}`,
        duration: Date.now() - startTime,
        timestamp: new Date()
      };
    }
  }

  private collectInstanceMetrics() {
    const memUsage = process.memoryUsage();
    return {
      cpuUtilization: 0, // Would be implemented with actual CPU monitoring
      memoryUtilization: (memUsage.heapUsed / memUsage.heapTotal) * 100,
      diskUtilization: 0, // Would be implemented with actual disk monitoring
      networkIn: 0,
      networkOut: 0,
      coordinationLatency: 0,
      activeConnections: 0,
      requestRate: 0,
      errorRate: 0,
      customMetrics: {
        leaderElections: this.currentRole === InstanceRole.LEADER ? 1 : 0,
        healthChecks: this.dependencies.healthMonitor.isHealthy() ? 1 : 0,
        uptime: Date.now() - this.startTime.getTime()
      }
    };
  }

  private setupEventHandlers(): void {
    // Handle process signals for graceful shutdown
    process.on('SIGTERM', async () => {
      this.dependencies.logger.info('Received SIGTERM, starting graceful shutdown');
      await this.stop();
    });

    process.on('SIGINT', async () => {
      this.dependencies.logger.info('Received SIGINT, starting graceful shutdown');
      await this.stop();
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      this.dependencies.logger.error('Uncaught exception', error, {
        instanceId: this.instanceId
      });
      
      // Initiate emergency shutdown
      this.currentStatus = InstanceStatus.FAILED;
      process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      this.dependencies.logger.error('Unhandled promise rejection', reason as Error, {
        instanceId: this.instanceId,
        promise
      });
    });
  }

  private async handleHealthFailover(event: FailoverEvent): Promise<void> {
    // Implementation for health-related failover
    this.dependencies.logger.info('Handling health failover', {
      instanceId: this.instanceId,
      event
    });
  }

  private async handleLeadershipFailover(event: FailoverEvent): Promise<void> {
    // Implementation for leadership-related failover
    this.dependencies.logger.info('Handling leadership failover', {
      instanceId: this.instanceId,
      event
    });
  }

  private async handleManualFailover(event: FailoverEvent): Promise<void> {
    // Implementation for manual failover
    this.dependencies.logger.info('Handling manual failover', {
      instanceId: this.instanceId,
      event
    });
  }

  private async waitForOperationsToComplete(): Promise<void> {
    // Wait for current operations to complete
    // This would typically involve checking active requests, database transactions, etc.
    return new Promise(resolve => {
      setTimeout(resolve, this.configuration.gracefulShutdown.drainTimeout);
    });
  }

  private async executePreStopHook(): Promise<void> {
    // Execute pre-stop hook if configured
    if (this.configuration.gracefulShutdown.preStopHook) {
      // Implementation would execute the configured pre-stop script/command
      this.dependencies.logger.info('Executing pre-stop hook', {
        instanceId: this.instanceId,
        hook: this.configuration.gracefulShutdown.preStopHook
      });
    }
  }
}

/**
 * Simple Circuit Breaker Implementation
 */
export class SimpleCircuitBreaker implements CircuitBreaker {
  private readonly name: string;
  private readonly config: CircuitBreakerConfig;
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private requestCount = 0;
  private lastFailureTime?: Date;
  private lastSuccessTime?: Date;
  private stateChangedTime = new Date();
  private nextAttempt?: Date;

  constructor(name: string, config: CircuitBreakerConfig) {
    this.name = name;
    this.config = config;
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    this.requestCount++;

    if (this.state === CircuitBreakerState.OPEN) {
      if (!this.nextAttempt || Date.now() < this.nextAttempt.getTime()) {
        throw new Error(`Circuit breaker ${this.name} is OPEN`);
      }
      
      // Transition to half-open
      this.state = CircuitBreakerState.HALF_OPEN;
      this.stateChangedTime = new Date();
    }

    try {
      const result = await operation();
      
      this.successCount++;
      this.lastSuccessTime = new Date();
      
      if (this.state === CircuitBreakerState.HALF_OPEN) {
        // Reset to closed
        this.state = CircuitBreakerState.CLOSED;
        this.failureCount = 0;
        this.stateChangedTime = new Date();
      }
      
      return result;
    } catch (error) {
      this.failureCount++;
      this.lastFailureTime = new Date();
      
      if (this.failureCount >= this.config.failureThreshold) {
        this.state = CircuitBreakerState.OPEN;
        this.stateChangedTime = new Date();
        this.nextAttempt = new Date(Date.now() + this.config.recoveryTimeout);
      }
      
      throw error;
    }
  }

  getState(): CircuitBreakerState {
    return this.state;
  }

  getMetrics(): CircuitBreakerMetrics {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      requestCount: this.requestCount,
      failureRate: this.requestCount > 0 ? this.failureCount / this.requestCount : 0,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      stateChangedTime: this.stateChangedTime
    };
  }

  reset(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.requestCount = 0;
    this.stateChangedTime = new Date();
    this.nextAttempt = undefined;
  }

  forceOpen(): void {
    this.state = CircuitBreakerState.OPEN;
    this.stateChangedTime = new Date();
    this.nextAttempt = new Date(Date.now() + this.config.recoveryTimeout);
  }

  forceClose(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.failureCount = 0;
    this.stateChangedTime = new Date();
    this.nextAttempt = undefined;
  }
}