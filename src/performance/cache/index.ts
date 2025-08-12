/**
 * Cache system exports
 */

export { CacheManager, ICacheManager, CacheMetrics, LayerMetrics } from './cache-manager';
export { InMemoryCache } from './in-memory-cache';
export { RedisCache } from './redis-cache';

// Re-export cache-related types
export {
  CacheConfig,
  CacheEntry,
  CacheLayer,
  CacheMetadata,
  CachePriority,
  CacheStrategy,
  InvalidationStrategy,
  EvictionStrategy,
  RedisConfig,
  InMemoryConfig,
  CacheStrategies,
  TTLConfig,
  CacheError,
  CacheOperation
} from '../types';