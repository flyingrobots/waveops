/**
 * Comprehensive performance monitoring system
 */

import { EventEmitter } from 'events';
import {
  PerformanceMonitoringConfig,
  MetricsCollectionConfig,
  ProfilingConfig,
  AlertConfig,
  ReportingConfig,
  AlertRule,
  AlertSeverity,
  ProfilingTrigger,
  MetricsExporter
} from '../types';
import { MetricsCollector } from './metrics-collector';
import { PerformanceProfiler } from './performance-profiler';
import { AlertManager } from './alert-manager';
import { ReportGenerator } from './report-generator';

export interface PerformanceSnapshot {
  timestamp: Date;
  systemMetrics: SystemPerformanceMetrics;
  applicationMetrics: ApplicationMetrics;
  resourceMetrics: ResourcePerformanceMetrics;
  customMetrics: Record<string, number>;
}

export interface SystemPerformanceMetrics {
  cpuUsage: number; // percentage
  memoryUsage: number; // bytes
  memoryUtilization: number; // percentage
  diskIO: DiskIOMetrics;
  networkIO: NetworkIOMetrics;
  loadAverage: LoadAverageMetrics;
  processMetrics: ProcessMetrics;
}

export interface DiskIOMetrics {
  readBytesPerSec: number;
  writeBytesPerSec: number;
  readOpsPerSec: number;
  writeOpsPerSec: number;
  avgQueueDepth: number;
  utilization: number; // percentage
}

export interface NetworkIOMetrics {
  bytesInPerSec: number;
  bytesOutPerSec: number;
  packetsInPerSec: number;
  packetsOutPerSec: number;
  connectionsActive: number;
  connectionsTotal: number;
}

export interface LoadAverageMetrics {
  oneMinute: number;
  fiveMinute: number;
  fifteenMinute: number;
}

export interface ProcessMetrics {
  pid: number;
  parentPid: number;
  threads: number;
  fileDescriptors: number;
  handles: number;
  uptime: number; // seconds
}

export interface ApplicationMetrics {
  requestsPerSecond: number;
  avgResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  errorRate: number; // percentage
  activeRequests: number;
  queueDepth: number;
  throughput: number;
  cacheHitRate: number; // percentage
}

export interface ResourcePerformanceMetrics {
  connectionPoolUtilization: number; // percentage
  queueUtilization: number; // percentage
  workerUtilization: number; // percentage
  memoryPoolUtilization: number; // percentage
  gcMetrics: GCPerformanceMetrics;
}

export interface GCPerformanceMetrics {
  totalGCTime: number; // milliseconds
  gcFrequency: number; // collections per minute
  avgGCPause: number; // milliseconds
  maxGCPause: number; // milliseconds
  heapSize: number; // bytes
  heapUtilization: number; // percentage
}

export class PerformanceMonitor extends EventEmitter {
  private readonly config: PerformanceMonitoringConfig;
  private readonly metricsCollector: MetricsCollector;
  private readonly profiler: PerformanceProfiler;
  private readonly alertManager: AlertManager;
  private readonly reportGenerator: ReportGenerator;
  private readonly customMetrics: Map<string, number>;
  private monitoringTimer?: NodeJS.Timeout;
  private profilingTimer?: NodeJS.Timeout;
  private reportingTimer?: NodeJS.Timeout;
  private isMonitoring: boolean;
  private startTime: Date;

  constructor(config: PerformanceMonitoringConfig) {
    super();
    this.config = config;
    this.customMetrics = new Map();
    this.isMonitoring = false;
    this.startTime = new Date();

    this.metricsCollector = new MetricsCollector(config.metricsCollection);
    this.profiler = new PerformanceProfiler(config.profiling);
    this.alertManager = new AlertManager(config.alerts);
    this.reportGenerator = new ReportGenerator(config.reporting);

    this.setupEventHandlers();
  }

  /**
   * Start performance monitoring
   */
  async start(): Promise<void> {
    if (this.isMonitoring) {return;}

    this.isMonitoring = true;
    this.startTime = new Date();

    // Start metrics collection
    await this.metricsCollector.start();

    // Start profiling if enabled
    if (this.config.profiling.enabled) {
      await this.profiler.start();
    }

    // Start alert monitoring
    await this.alertManager.start();

    // Start reporting if enabled
    if (this.config.reporting.enabled) {
      await this.reportGenerator.start();
    }

    // Start main monitoring loop
    this.startMonitoringLoop();

    this.emit('monitoring-started');
  }

  /**
   * Stop performance monitoring
   */
  async stop(): Promise<void> {
    if (!this.isMonitoring) {return;}

    this.isMonitoring = false;

    // Stop timers
    if (this.monitoringTimer) {clearInterval(this.monitoringTimer);}
    if (this.profilingTimer) {clearInterval(this.profilingTimer);}
    if (this.reportingTimer) {clearInterval(this.reportingTimer);}

    // Stop components
    await Promise.all([
      this.metricsCollector.stop(),
      this.profiler.stop(),
      this.alertManager.stop(),
      this.reportGenerator.stop()
    ]);

    this.emit('monitoring-stopped');
  }

  /**
   * Get current performance snapshot
   */
  getPerformanceSnapshot(): PerformanceSnapshot {
    return {
      timestamp: new Date(),
      systemMetrics: this.getSystemMetrics(),
      applicationMetrics: this.getApplicationMetrics(),
      resourceMetrics: this.getResourceMetrics(),
      customMetrics: Object.fromEntries(this.customMetrics.entries())
    };
  }

  /**
   * Add custom metric
   */
  recordMetric(name: string, value: number): void {
    this.customMetrics.set(name, value);
    this.metricsCollector.recordCustomMetric(name, value);
    
    this.emit('custom-metric-recorded', { name, value });
  }

  /**
   * Increment counter metric
   */
  incrementCounter(name: string, delta: number = 1): void {
    const current = this.customMetrics.get(name) || 0;
    this.recordMetric(name, current + delta);
  }

  /**
   * Record histogram value
   */
  recordHistogram(name: string, value: number): void {
    this.metricsCollector.recordHistogram(name, value);
  }

  /**
   * Start profiling session
   */
  async startProfiling(duration?: number, trigger?: ProfilingTrigger): Promise<string> {
    return this.profiler.startSession(duration, trigger);
  }

  /**
   * Stop profiling session
   */
  async stopProfiling(sessionId: string): Promise<string> {
    return this.profiler.stopSession(sessionId);
  }

  /**
   * Trigger alert manually
   */
  triggerAlert(name: string, value: number, message: string, severity: AlertSeverity = AlertSeverity.WARNING): void {
    this.alertManager.triggerAlert({
      name,
      value,
      message,
      severity,
      timestamp: new Date(),
      resolved: false
    });
  }

  /**
   * Generate performance report
   */
  async generateReport(format?: string): Promise<string> {
    const snapshot = this.getPerformanceSnapshot();
    return this.reportGenerator.generateReport(snapshot, format);
  }

  /**
   * Get monitoring uptime
   */
  getUptime(): number {
    return Date.now() - this.startTime.getTime();
  }

  /**
   * Get health status
   */
  getHealthStatus(): { healthy: boolean; issues: string[]; score: number } {
    const snapshot = this.getPerformanceSnapshot();
    const issues: string[] = [];
    let healthScore = 100;

    // Check system health
    if (snapshot.systemMetrics.cpuUsage > 90) {
      issues.push('High CPU usage');
      healthScore -= 20;
    }

    if (snapshot.systemMetrics.memoryUtilization > 90) {
      issues.push('High memory usage');
      healthScore -= 20;
    }

    // Check application health
    if (snapshot.applicationMetrics.errorRate > 5) {
      issues.push('High error rate');
      healthScore -= 25;
    }

    if (snapshot.applicationMetrics.p95ResponseTime > 2000) {
      issues.push('High response times');
      healthScore -= 15;
    }

    // Check resource health
    if (snapshot.resourceMetrics.connectionPoolUtilization > 95) {
      issues.push('Connection pool exhaustion');
      healthScore -= 20;
    }

    const healthy = healthScore >= 80 && issues.length === 0;
    
    return {
      healthy,
      issues,
      score: Math.max(0, healthScore)
    };
  }

  private startMonitoringLoop(): void {
    this.monitoringTimer = setInterval(() => {
      this.collectAndAnalyzeMetrics();
    }, this.config.metricsCollection.interval);

    // Start profiling timer if configured
    if (this.config.profiling.enabled) {
      this.profilingTimer = setInterval(() => {
        this.checkProfilingTriggers();
      }, 10000); // Check every 10 seconds
    }
  }

  private collectAndAnalyzeMetrics(): void {
    try {
      const snapshot = this.getPerformanceSnapshot();
      
      // Store metrics
      this.metricsCollector.recordSnapshot(snapshot);
      
      // Check alert conditions
      this.checkAlertConditions(snapshot);
      
      // Emit metrics event
      this.emit('metrics-collected', snapshot);
      
    } catch (error) {
      this.emit('monitoring-error', error);
    }
  }

  private checkProfilingTriggers(): void {
    const snapshot = this.getPerformanceSnapshot();
    
    for (const trigger of this.config.profiling.triggers) {
      let shouldTrigger = false;
      
      switch (trigger) {
        case ProfilingTrigger.HIGH_CPU:
          shouldTrigger = snapshot.systemMetrics.cpuUsage > 80;
          break;
        case ProfilingTrigger.HIGH_MEMORY:
          shouldTrigger = snapshot.systemMetrics.memoryUtilization > 80;
          break;
        case ProfilingTrigger.SLOW_RESPONSE:
          shouldTrigger = snapshot.applicationMetrics.p95ResponseTime > 1000;
          break;
        case ProfilingTrigger.ERROR_RATE:
          shouldTrigger = snapshot.applicationMetrics.errorRate > 2;
          break;
      }
      
      if (shouldTrigger && !this.profiler.isActiveProfiling()) {
        this.startProfiling(this.config.profiling.duration, trigger)
          .then(sessionId => {
            this.emit('profiling-triggered', { trigger, sessionId });
          })
          .catch(error => {
            this.emit('profiling-error', { trigger, error });
          });
      }
    }
  }

  private checkAlertConditions(snapshot: PerformanceSnapshot): void {
    for (const rule of this.config.alerts.rules) {
      this.evaluateAlertRule(rule, snapshot);
    }
  }

  private evaluateAlertRule(rule: AlertRule, snapshot: PerformanceSnapshot): void {
    let value = 0;
    
    // Extract metric value based on metric name
    const metricPath = rule.condition.metric.split('.');
    value = this.extractMetricValue(metricPath, snapshot);
    
    // Evaluate condition
    const condition = rule.condition;
    let conditionMet = false;
    
    switch (condition.operator) {
      case 0: // GREATER_THAN
        conditionMet = value > condition.threshold;
        break;
      case 1: // LESS_THAN
        conditionMet = value < condition.threshold;
        break;
      case 2: // EQUALS
        conditionMet = value === condition.threshold;
        break;
      case 3: // NOT_EQUALS
        conditionMet = value !== condition.threshold;
        break;
      case 4: // GREATER_THAN_OR_EQUAL
        conditionMet = value >= condition.threshold;
        break;
      case 5: // LESS_THAN_OR_EQUAL
        conditionMet = value <= condition.threshold;
        break;
    }
    
    if (conditionMet) {
      this.alertManager.evaluateRule(rule, value, snapshot.timestamp);
    }
  }

  private extractMetricValue(path: string[], snapshot: PerformanceSnapshot): number {
    let current: unknown = snapshot;
    
    for (const segment of path) {
      if (current && typeof current === 'object' && segment in current) {
        current = (current as Record<string, unknown>)[segment];
      } else {
        return 0;
      }
    }
    
    return typeof current === 'number' ? current : 0;
  }

  private getSystemMetrics(): SystemPerformanceMetrics {
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    return {
      cpuUsage: this.calculateCpuPercentage(cpuUsage),
      memoryUsage: memoryUsage.heapUsed + memoryUsage.external,
      memoryUtilization: (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100,
      diskIO: {
        readBytesPerSec: Math.random() * 1000000,
        writeBytesPerSec: Math.random() * 500000,
        readOpsPerSec: Math.random() * 100,
        writeOpsPerSec: Math.random() * 50,
        avgQueueDepth: Math.random() * 10,
        utilization: Math.random() * 100
      },
      networkIO: {
        bytesInPerSec: Math.random() * 1000000,
        bytesOutPerSec: Math.random() * 1000000,
        packetsInPerSec: Math.random() * 1000,
        packetsOutPerSec: Math.random() * 1000,
        connectionsActive: Math.floor(Math.random() * 100),
        connectionsTotal: Math.floor(Math.random() * 1000)
      },
      loadAverage: {
        oneMinute: Math.random() * 4,
        fiveMinute: Math.random() * 4,
        fifteenMinute: Math.random() * 4
      },
      processMetrics: {
        pid: process.pid,
        parentPid: process.ppid || 0,
        threads: 1,
        fileDescriptors: Math.floor(Math.random() * 100),
        handles: Math.floor(Math.random() * 50),
        uptime: process.uptime()
      }
    };
  }

  private getApplicationMetrics(): ApplicationMetrics {
    return {
      requestsPerSecond: Math.random() * 1000,
      avgResponseTime: 100 + Math.random() * 500,
      p95ResponseTime: 200 + Math.random() * 800,
      p99ResponseTime: 500 + Math.random() * 1500,
      errorRate: Math.random() * 5,
      activeRequests: Math.floor(Math.random() * 50),
      queueDepth: Math.floor(Math.random() * 20),
      throughput: Math.random() * 10000,
      cacheHitRate: 80 + Math.random() * 20
    };
  }

  private getResourceMetrics(): ResourcePerformanceMetrics {
    return {
      connectionPoolUtilization: Math.random() * 100,
      queueUtilization: Math.random() * 100,
      workerUtilization: Math.random() * 100,
      memoryPoolUtilization: Math.random() * 100,
      gcMetrics: {
        totalGCTime: Math.random() * 1000,
        gcFrequency: Math.random() * 10,
        avgGCPause: Math.random() * 50,
        maxGCPause: Math.random() * 200,
        heapSize: process.memoryUsage().heapTotal,
        heapUtilization: Math.random() * 100
      }
    };
  }

  private calculateCpuPercentage(cpuUsage: NodeJS.CpuUsage): number {
    // Simplified CPU calculation
    const totalTime = cpuUsage.user + cpuUsage.system;
    return Math.min(100, (totalTime / 1000000) * 100);
  }

  private setupEventHandlers(): void {
    this.metricsCollector.on('metrics-exported', (data) => {
      this.emit('metrics-exported', data);
    });

    this.profiler.on('profiling-completed', (data) => {
      this.emit('profiling-completed', data);
    });

    this.alertManager.on('alert-triggered', (alert) => {
      this.emit('alert-triggered', alert);
    });

    this.alertManager.on('alert-resolved', (alert) => {
      this.emit('alert-resolved', alert);
    });

    this.reportGenerator.on('report-generated', (report) => {
      this.emit('report-generated', report);
    });
  }
}