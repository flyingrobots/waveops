/**
 * WaveOps Performance Optimization System
 * 
 * Comprehensive performance optimization suite for massive scale operations
 */

export * from './types';

// Core performance systems
export * from './cache';
export * from './memory';
export * from './network';
export * from './background';
export * from './resources';
export * from './monitoring';

// Main performance coordinator
export { PerformanceCoordinator } from './performance-coordinator';

// Utility functions and helpers
export * from './utils';

/**
 * Performance optimization entry point
 * 
 * Usage:
 * 
 * ```typescript
 * import { PerformanceCoordinator } from '@waveops/performance';
 * 
 * const coordinator = new PerformanceCoordinator({
 *   cache: { ... },
 *   memory: { ... },
 *   network: { ... },
 *   background: { ... },
 *   resources: { ... },
 *   monitoring: { ... }
 * });
 * 
 * await coordinator.initialize();
 * ```
 */