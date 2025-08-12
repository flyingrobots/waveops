/**
 * Circuit breaker implementation for fault tolerance
 */

import { EventEmitter } from 'events';
import { CircuitBreakerConfig } from '../types';

export interface CircuitBreakerMetrics {
  state: 'closed' | 'open' | 'half-open';
  failureCount: number;
  successCount: number;
  lastFailureTime?: Date;
  nextRetryTime?: Date;
  totalRequests: number;
  failureRate: number;
}

enum CircuitState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half-open'
}

export class CircuitBreaker extends EventEmitter {
  private readonly config: CircuitBreakerConfig;
  private state: CircuitState;
  private failureCount: number;
  private successCount: number;
  private totalRequests: number;
  private lastFailureTime?: Date;
  private nextRetryTime?: Date;
  private halfOpenSuccesses: number;
  private halfOpenFailures: number;

  constructor(config: CircuitBreakerConfig) {
    super();
    this.config = config;
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.totalRequests = 0;
    this.halfOpenSuccesses = 0;
    this.halfOpenFailures = 0;

    if (config.enabled && config.monitoringEnabled) {
      this.startMonitoring();
    }
  }

  /**
   * Check if the circuit breaker is open
   */
  isOpen(): boolean {
    if (this.state === CircuitState.OPEN) {
      // Check if we should transition to half-open
      if (this.shouldAttemptReset()) {
        this.transitionToHalfOpen();
      }
    }

    return this.state === CircuitState.OPEN;
  }

  /**
   * Record a successful operation
   */
  recordSuccess(): void {
    this.successCount++;
    this.totalRequests++;

    switch (this.state) {
      case CircuitState.CLOSED:
        this.resetFailureCount();
        break;
      
      case CircuitState.HALF_OPEN:
        this.halfOpenSuccesses++;
        if (this.halfOpenSuccesses >= this.getRequiredSuccessesForReset()) {
          this.transitionToClosed();
        }
        break;
    }

    this.emit('success-recorded', {
      state: this.state,
      successCount: this.successCount
    });
  }

  /**
   * Record a failed operation
   */
  recordFailure(): void {
    this.failureCount++;
    this.totalRequests++;
    this.lastFailureTime = new Date();

    switch (this.state) {
      case CircuitState.CLOSED:
        if (this.shouldOpen()) {
          this.transitionToOpen();
        }
        break;
      
      case CircuitState.HALF_OPEN:
        this.halfOpenFailures++;
        this.transitionToOpen();
        break;
    }

    this.emit('failure-recorded', {
      state: this.state,
      failureCount: this.failureCount
    });
  }

  /**
   * Get circuit breaker metrics
   */
  getMetrics(): CircuitBreakerMetrics {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      nextRetryTime: this.nextRetryTime,
      totalRequests: this.totalRequests,
      failureRate: this.calculateFailureRate()
    };
  }

  /**
   * Manually reset the circuit breaker
   */
  reset(): void {
    this.transitionToClosed();
    this.emit('manual-reset');
  }

  /**
   * Force the circuit breaker to open
   */
  forceOpen(): void {
    this.transitionToOpen();
    this.emit('forced-open');
  }

  private shouldOpen(): boolean {
    if (!this.config.enabled) return false;

    // Check if we have enough requests to make a decision
    if (this.totalRequests < 10) return false;

    // Check failure rate
    const failureRate = this.calculateFailureRate();
    return failureRate >= (this.config.failureThreshold / 100);
  }

  private shouldAttemptReset(): boolean {
    if (!this.nextRetryTime) return false;
    return Date.now() >= this.nextRetryTime.getTime();
  }

  private transitionToOpen(): void {
    this.state = CircuitState.OPEN;
    this.nextRetryTime = new Date(Date.now() + this.config.resetTimeout);
    
    this.emit('state-change', {
      from: this.state,
      to: CircuitState.OPEN,
      reason: 'failure-threshold-exceeded'
    });
  }

  private transitionToHalfOpen(): void {
    this.state = CircuitState.HALF_OPEN;
    this.halfOpenSuccesses = 0;
    this.halfOpenFailures = 0;
    this.nextRetryTime = undefined;
    
    this.emit('state-change', {
      from: CircuitState.OPEN,
      to: CircuitState.HALF_OPEN,
      reason: 'retry-timeout-elapsed'
    });
  }

  private transitionToClosed(): void {
    const previousState = this.state;
    this.state = CircuitState.CLOSED;
    this.resetFailureCount();
    this.nextRetryTime = undefined;
    this.halfOpenSuccesses = 0;
    this.halfOpenFailures = 0;
    
    this.emit('state-change', {
      from: previousState,
      to: CircuitState.CLOSED,
      reason: 'successful-operations'
    });
  }

  private resetFailureCount(): void {
    this.failureCount = 0;
    this.lastFailureTime = undefined;
  }

  private calculateFailureRate(): number {
    if (this.totalRequests === 0) return 0;
    return (this.failureCount / this.totalRequests) * 100;
  }

  private getRequiredSuccessesForReset(): number {
    // Require at least 3 consecutive successes in half-open state
    return Math.max(3, Math.ceil(this.config.failureThreshold / 10));
  }

  private startMonitoring(): void {
    // Periodic health check and state evaluation
    setInterval(() => {
      this.performHealthCheck();
    }, 30000); // Every 30 seconds
  }

  private performHealthCheck(): void {
    const metrics = this.getMetrics();
    
    // Emit health status
    this.emit('health-check', {
      state: this.state,
      failureRate: metrics.failureRate,
      totalRequests: this.totalRequests,
      isHealthy: metrics.failureRate < this.config.failureThreshold
    });

    // Auto-recovery logic for long-term failures
    if (this.state === CircuitState.OPEN) {
      const timeSinceLastFailure = this.lastFailureTime ? 
        Date.now() - this.lastFailureTime.getTime() : 0;
      
      // If no failures for extended period, consider recovery
      if (timeSinceLastFailure > this.config.resetTimeout * 5) {
        this.emit('auto-recovery-candidate', {
          timeSinceLastFailure,
          state: this.state
        });
      }
    }

    // Warning for high failure rates in closed state
    if (this.state === CircuitState.CLOSED && metrics.failureRate > 50) {
      this.emit('high-failure-rate-warning', {
        failureRate: metrics.failureRate,
        threshold: this.config.failureThreshold
      });
    }
  }
}