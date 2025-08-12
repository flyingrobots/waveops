/**
 * Resource management system exports
 */

export { 
  ResourceManager, 
  ResourceMetrics, 
  ConnectionPoolMetrics,
  SystemResourceMetrics,
  LeakDetectionMetrics,
  LifecycleMetrics
} from './resource-manager';
export { DatabaseConnectionPool } from './database-connection-pool';
export { HttpConnectionPool } from './http-connection-pool';
export { ResourceMonitor } from './resource-monitor';
export { ResourceLifecycleManager } from './resource-lifecycle-manager';

// Re-export resource-related types
export {
  ResourceConfig,
  ConnectionPoolConfig,
  ConnectionType,
  ResourceType,
  ResourceMonitoringConfig,
  ResourceAlertThresholds,
  LifecycleConfig,
  ResourceCleanupConfig
} from '../types';