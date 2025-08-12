/**
 * Memory management system exports
 */

export { MemoryManager, IMemoryManager } from './memory-manager';
export { ObjectPoolManager } from './object-pool-manager';
export { LeakDetector } from './leak-detector';
export { GCOptimizer } from './gc-optimizer';

// Re-export memory-related types
export {
  MemoryConfig,
  ObjectPool,
  MemoryMetrics,
  GCMetrics,
  PoolMetrics,
  LeakSuspect,
  ObjectPoolingConfig,
  PoolConfig,
  GCOptimizationConfig,
  GCStrategy,
  MemoryLimitsConfig,
  LeakDetectionConfig,
  MemoryManagementError,
  MemoryErrorType
} from '../types';