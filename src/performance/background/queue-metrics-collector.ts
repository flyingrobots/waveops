/**
 * Queue metrics collection and monitoring system
 */

import { EventEmitter } from 'events';
import { QueueMonitoringConfig, QueueAlertThresholds } from '../types';
import { QueueMetrics, TaskResult } from './queue-manager';

export interface AlertEvent {
  type: 'high_watermark' | 'processing_latency' | 'error_rate' | 'dead_letter_threshold';
  queueName: string;
  severity: 'warning' | 'critical';
  value: number;
  threshold: number;
  timestamp: Date;
  message: string;
}

export interface MetricsSnapshot {
  timestamp: Date;
  queueMetrics: Record<string, QueueMetrics>;
  systemMetrics: SystemMetrics;
  alertsTriggered: number;
}

export interface SystemMetrics {
  totalQueues: number;
  totalTasks: number;
  totalProcessingTasks: number;
  averageProcessingTime: number;
  systemThroughput: number;
  overallErrorRate: number;
  memoryUsage: number;
}

interface QueueState {
  name: string;
  metrics: QueueMetrics;
  lastUpdate: Date;
  recentTasks: TaskResult[];
  throughputHistory: number[];
  errorRateHistory: number[];
  latencyHistory: number[];
}

export class QueueMetricsCollector extends EventEmitter {
  private readonly config: QueueMonitoringConfig;
  private readonly queueStates: Map<string, QueueState>;
  private readonly metricsHistory: MetricsSnapshot[];
  private readonly alertHistory: AlertEvent[];
  private readonly maxHistorySize: number = 1000;
  private metricsTimer?: NodeJS.Timeout;
  private alertCooldowns: Map<string, Date>;

  constructor(config: QueueMonitoringConfig) {
    super();
    this.config = config;
    this.queueStates = new Map();
    this.metricsHistory = [];
    this.alertHistory = [];
    this.alertCooldowns = new Map();

    if (config.enabled) {
      this.startMetricsCollection();
    }
  }

  /**
   * Record task completion
   */
  recordTaskCompletion(queueName: string, result: TaskResult): void {
    const state = this.getOrCreateQueueState(queueName);
    
    state.recentTasks.push(result);
    state.lastUpdate = new Date();
    
    // Keep only recent tasks (last 100)
    if (state.recentTasks.length > 100) {
      state.recentTasks = state.recentTasks.slice(-100);
    }

    this.updateQueueMetrics(state);
    this.checkAlerts(state);
  }

  /**
   * Record task failure
   */
  recordTaskFailure(queueName: string, result: TaskResult): void {
    this.recordTaskCompletion(queueName, result);
  }

  /**
   * Update queue size and processing count
   */
  updateQueueStatus(queueName: string, size: number, processing: number): void {
    const state = this.getOrCreateQueueState(queueName);
    
    state.metrics.size = size;
    state.metrics.processing = processing;
    state.lastUpdate = new Date();

    this.checkAlerts(state);
  }

  /**
   * Get current metrics snapshot
   */
  getMetricsSnapshot(): MetricsSnapshot {
    const queueMetrics: Record<string, QueueMetrics> = {};
    
    for (const [queueName, state] of this.queueStates.entries()) {
      queueMetrics[queueName] = { ...state.metrics };
    }

    const systemMetrics = this.calculateSystemMetrics();
    
    const snapshot: MetricsSnapshot = {
      timestamp: new Date(),
      queueMetrics,
      systemMetrics,
      alertsTriggered: this.alertHistory.filter(
        alert => alert.timestamp > new Date(Date.now() - 3600000) // Last hour
      ).length
    };

    // Store in history
    this.metricsHistory.push(snapshot);
    if (this.metricsHistory.length > this.maxHistorySize) {
      this.metricsHistory.shift();
    }

    return snapshot;
  }

  /**
   * Get metrics history
   */
  getMetricsHistory(since?: Date): MetricsSnapshot[] {
    if (!since) {
      return [...this.metricsHistory];
    }

    return this.metricsHistory.filter(snapshot => snapshot.timestamp >= since);
  }

  /**
   * Get alert history
   */
  getAlertHistory(since?: Date): AlertEvent[] {
    if (!since) {
      return [...this.alertHistory];
    }

    return this.alertHistory.filter(alert => alert.timestamp >= since);
  }

  /**
   * Get queue-specific metrics
   */
  getQueueMetrics(queueName: string): QueueMetrics | null {
    const state = this.queueStates.get(queueName);
    return state ? { ...state.metrics } : null;
  }

  /**
   * Close metrics collector
   */
  async close(): Promise<void> {
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
    }

    this.emit('metrics-collector-closed');
  }

  private startMetricsCollection(): void {
    this.metricsTimer = setInterval(() => {
      this.collectMetrics();
    }, this.config.metricsInterval);
  }

  private collectMetrics(): void {
    const snapshot = this.getMetricsSnapshot();
    
    this.emit('metrics-collected', snapshot);
    
    // Update throughput and latency histories
    for (const state of this.queueStates.values()) {
      this.updateThroughputHistory(state);
      this.updateLatencyHistory(state);
      this.updateErrorRateHistory(state);
    }
  }

  private getOrCreateQueueState(queueName: string): QueueState {
    let state = this.queueStates.get(queueName);
    
    if (!state) {
      state = {
        name: queueName,
        metrics: {
          name: queueName,
          size: 0,
          processing: 0,
          completed: 0,
          failed: 0,
          avgProcessingTime: 0,
          throughput: 0,
          errorRate: 0,
          retryRate: 0
        },
        lastUpdate: new Date(),
        recentTasks: [],
        throughputHistory: [],
        errorRateHistory: [],
        latencyHistory: []
      };
      
      this.queueStates.set(queueName, state);
    }
    
    return state;
  }

  private updateQueueMetrics(state: QueueState): void {
    const recentTasks = state.recentTasks.slice(-50); // Last 50 tasks
    
    if (recentTasks.length === 0) return;

    // Calculate completed and failed counts
    const completed = recentTasks.filter(task => task.success).length;
    const failed = recentTasks.filter(task => !task.success).length;
    
    state.metrics.completed += completed;
    state.metrics.failed += failed;

    // Calculate average processing time
    const totalDuration = recentTasks.reduce((sum, task) => sum + task.duration, 0);
    state.metrics.avgProcessingTime = totalDuration / recentTasks.length;

    // Calculate error rate
    state.metrics.errorRate = failed > 0 ? (failed / recentTasks.length) * 100 : 0;

    // Calculate retry rate
    const retriedTasks = recentTasks.filter(task => task.retryCount > 0).length;
    state.metrics.retryRate = retriedTasks > 0 ? (retriedTasks / recentTasks.length) * 100 : 0;
  }

  private updateThroughputHistory(state: QueueState): void {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    // Count tasks completed in the last minute
    const recentCompletions = state.recentTasks.filter(
      task => {
        const taskTime = now - task.duration; // Approximate completion time
        return taskTime >= oneMinuteAgo;
      }
    );

    const throughput = recentCompletions.length / 60; // Tasks per second
    state.metrics.throughput = throughput;
    
    state.throughputHistory.push(throughput);
    if (state.throughputHistory.length > 60) { // Keep last 60 measurements (1 hour)
      state.throughputHistory.shift();
    }
  }

  private updateLatencyHistory(state: QueueState): void {
    const avgLatency = state.metrics.avgProcessingTime;
    
    state.latencyHistory.push(avgLatency);
    if (state.latencyHistory.length > 60) { // Keep last 60 measurements
      state.latencyHistory.shift();
    }
  }

  private updateErrorRateHistory(state: QueueState): void {
    const errorRate = state.metrics.errorRate;
    
    state.errorRateHistory.push(errorRate);
    if (state.errorRateHistory.length > 60) { // Keep last 60 measurements
      state.errorRateHistory.shift();
    }
  }

  private checkAlerts(state: QueueState): void {
    const thresholds = this.config.alertThresholds;
    const now = new Date();

    // Check high water mark
    if (state.metrics.size >= thresholds.highWaterMark) {
      this.triggerAlert({
        type: 'high_watermark',
        queueName: state.name,
        severity: state.metrics.size >= thresholds.highWaterMark * 1.5 ? 'critical' : 'warning',
        value: state.metrics.size,
        threshold: thresholds.highWaterMark,
        timestamp: now,
        message: `Queue ${state.name} size (${state.metrics.size}) exceeds high watermark (${thresholds.highWaterMark})`
      });
    }

    // Check processing latency
    if (state.metrics.avgProcessingTime >= thresholds.processingLatency) {
      this.triggerAlert({
        type: 'processing_latency',
        queueName: state.name,
        severity: state.metrics.avgProcessingTime >= thresholds.processingLatency * 2 ? 'critical' : 'warning',
        value: state.metrics.avgProcessingTime,
        threshold: thresholds.processingLatency,
        timestamp: now,
        message: `Queue ${state.name} processing latency (${state.metrics.avgProcessingTime}ms) exceeds threshold (${thresholds.processingLatency}ms)`
      });
    }

    // Check error rate
    if (state.metrics.errorRate >= thresholds.errorRate) {
      this.triggerAlert({
        type: 'error_rate',
        queueName: state.name,
        severity: state.metrics.errorRate >= thresholds.errorRate * 2 ? 'critical' : 'warning',
        value: state.metrics.errorRate,
        threshold: thresholds.errorRate,
        timestamp: now,
        message: `Queue ${state.name} error rate (${state.metrics.errorRate}%) exceeds threshold (${thresholds.errorRate}%)`
      });
    }

    // Check dead letter threshold (if applicable)
    // This would need to be implemented based on actual dead letter queue monitoring
  }

  private triggerAlert(alert: AlertEvent): void {
    // Check alert cooldown to avoid spam
    const alertKey = `${alert.queueName}-${alert.type}`;
    const lastAlert = this.alertCooldowns.get(alertKey);
    const cooldownPeriod = 300000; // 5 minutes
    
    if (lastAlert && alert.timestamp.getTime() - lastAlert.getTime() < cooldownPeriod) {
      return; // Still in cooldown
    }

    this.alertCooldowns.set(alertKey, alert.timestamp);
    this.alertHistory.push(alert);
    
    // Keep alert history manageable
    if (this.alertHistory.length > this.maxHistorySize) {
      this.alertHistory.shift();
    }

    this.emit('alert', alert);
  }

  private calculateSystemMetrics(): SystemMetrics {
    let totalTasks = 0;
    let totalProcessingTasks = 0;
    let totalCompleted = 0;
    let totalFailed = 0;
    let totalProcessingTime = 0;
    let totalThroughput = 0;

    for (const state of this.queueStates.values()) {
      totalTasks += state.metrics.size;
      totalProcessingTasks += state.metrics.processing;
      totalCompleted += state.metrics.completed;
      totalFailed += state.metrics.failed;
      totalProcessingTime += state.metrics.avgProcessingTime;
      totalThroughput += state.metrics.throughput;
    }

    const queueCount = this.queueStates.size;
    const totalCompletedAndFailed = totalCompleted + totalFailed;

    // Get memory usage (Node.js specific)
    const memoryUsage = process.memoryUsage();

    return {
      totalQueues: queueCount,
      totalTasks,
      totalProcessingTasks,
      averageProcessingTime: queueCount > 0 ? totalProcessingTime / queueCount : 0,
      systemThroughput: totalThroughput,
      overallErrorRate: totalCompletedAndFailed > 0 ? (totalFailed / totalCompletedAndFailed) * 100 : 0,
      memoryUsage: memoryUsage.heapUsed
    };
  }
}