/**
 * WaveOps - GPU-style waves for teams
 * Main entry point for the coordination engine
 */

export { WaveCoordinator } from './core/coordinator';
export { GitHubClient } from './github/client';

// Work Stealing System
export { WorkStealingEngine } from './coordination/work-stealing';
export { TeamMatcher } from './coordination/team-matcher';  
export { LoadBalancer } from './coordination/load-balancer';
export { WorkStealingCLI } from './cli/work-stealing';

// Analytics and Metrics System
export { MetricsAdvisor } from './analytics/metrics-advisor';
export { MetricsCollector } from './analytics/metrics-collector';
export { PerformanceAnalyzer } from './analytics/performance-analyzer';
export { 
  AnalyticsError, 
  MetricsCollectionError, 
  PerformanceAnalysisError,
  DataValidationError,
  PredictionError,
  ConfigurationError,
  GitHubIntegrationError 
} from './analytics/errors';

// Export all types
export * from './types';

console.log('WaveOps initialized with Work Stealing and Metrics Advisor systems');