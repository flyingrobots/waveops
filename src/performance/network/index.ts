/**
 * Network optimization system exports
 */

export { NetworkOptimizer, NetworkMetrics, NetworkRequest, NetworkResponse } from './network-optimizer';
export { RequestBatcher, BatchMetrics } from './request-batcher';
export { RateLimiter, RateLimitMetrics } from './rate-limiter';
export { ConnectionPool, ConnectionMetrics } from './connection-pool';
export { CircuitBreaker, CircuitBreakerMetrics } from './circuit-breaker';

// Re-export network-related types
export {
  NetworkConfig,
  RateLimitStrategy,
  BatchingConfig,
  BatchGroupingStrategy,
  BatchPriority,
  RetryStrategy,
  CircuitBreakerConfig,
  CompressionConfig,
  ConnectionConfig,
  ConnectionPoolingConfig,
  RetryStrategiesConfig,
  NetworkOptimizationError,
  NetworkOperation
} from '../types';