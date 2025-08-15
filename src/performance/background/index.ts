/**
 * Background processing system exports
 */

export { QueueManager, Task, TaskResult, QueueMetrics, TaskHandler } from './queue-manager';
export { WorkerPool, WorkerMetrics } from './worker-pool';
export { TaskScheduler, ScheduledTask, SchedulerMetrics } from './task-scheduler';
export { QueueMetricsCollector, AlertEvent, MetricsSnapshot, SystemMetrics } from './queue-metrics-collector';

// Re-export background processing types
export {
  BackgroundConfig,
  QueueConfig,
  QueueType,
  QueuePriority,
  WorkerConfig,
  AutoScalingConfig,
  WorkerHealthConfig,
  SchedulingConfig,
  CronConfig,
  IntervalConfig,
  CleanupConfig,
  QueueMonitoringConfig,
  QueueAlertThresholds,
  QueueRetryPolicy,
  QueueRateLimiting,
  BackoffType
} from '../types';