/**
 * Coordination System Exports
 * Rolling Frontier, Enhanced Coordination, and Supporting Components
 */

// Core coordination components
export { DependencyTracker } from './dependency-tracker';
export type { DependencyInjectable, DependencyAnalysis } from './dependency-tracker';

export { FrontierCalculator } from './frontier-calculator';
export type { 
  BoundaryConstraints, 
  OptimizationObjectives, 
  FrontierCalculatorDeps 
} from './frontier-calculator';

export { RollingFrontier } from './rolling-frontier';
export type { 
  RollingFrontierConfig, 
  RollingFrontierDeps, 
  FrontierEvent 
} from './rolling-frontier';

// Enhanced coordination
export { EnhancedWaveCoordinator } from './enhanced-coordinator';
export type { 
  EnhancedCoordinatorDependencies, 
  EnhancedCoordinationResult 
} from './enhanced-coordinator';

// Re-export relevant types from main types module
export type {
  TeamCapacity,
  DependencyNode,
  DependencyState,
  WaveBoundary,
  FrontierMetrics,
  FrontierOptimization,
  FrontierAction,
  OptimizationUrgency,
  OptimizationImpact,
  FrontierState,
  FrontierCalculationError,
  DependencyViolationError,
  CapacityOverflowError,
  OptimizationConflictError
} from '../types';