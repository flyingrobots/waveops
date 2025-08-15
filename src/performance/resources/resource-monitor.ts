/**
 * System resource monitoring and leak detection
 */

import { EventEmitter } from 'events';
import { ResourceMonitoringConfig } from '../types';
import { SystemResourceMetrics, LeakDetectionMetrics } from './resource-manager';

interface ResourceSample {
  timestamp: Date;
  memoryUsage: number;
  cpuUsage: number;
  fileHandles: number;
  networkConnections: number;
  activeTimers: number;
  eventListeners: number;
}

interface LeakSuspect {
  type: string;
  count: number;
  growthRate: number;
  firstDetected: Date;
  lastGrowth: Date;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export class ResourceMonitor extends EventEmitter {
  private readonly config: ResourceMonitoringConfig;
  private readonly resourceHistory: ResourceSample[];
  private readonly leakSuspects: Map<string, LeakSuspect>;
  private monitoringTimer?: NodeJS.Timeout;
  private leakDetectionTimer?: NodeJS.Timeout;
  private isMonitoring: boolean;
  private baselineMemory: number;
  private baselineConnections: number;

  constructor(config: ResourceMonitoringConfig) {
    super();
    this.config = config;
    this.resourceHistory = [];
    this.leakSuspects = new Map();
    this.isMonitoring = false;
    this.baselineMemory = 0;
    this.baselineConnections = 0;

    if (config.enabled) {
      this.startMonitoring();
    }
  }

  /**
   * Get current system resource metrics
   */
  getSystemMetrics(): SystemResourceMetrics {
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    return {
      cpuUsage: this.calculateCpuPercentage(cpuUsage),
      memoryUsage: memoryUsage.heapUsed + memoryUsage.external,
      memoryUtilization: (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100,
      fileHandles: this.getFileHandleCount(),
      networkConnections: this.getNetworkConnectionCount(),
      activeTimers: this.getActiveTimerCount(),
      eventListeners: this.getEventListenerCount()
    };
  }

  /**
   * Get leak detection metrics
   */
  getLeakMetrics(): LeakDetectionMetrics {
    const now = Date.now();
    const oneHourAgo = now - 3600000;
    
    // Calculate growth rates
    const recentSamples = this.resourceHistory.filter(sample => 
      sample.timestamp.getTime() >= oneHourAgo
    );

    let memoryGrowthRate = 0;
    let connectionGrowthRate = 0;

    if (recentSamples.length >= 2) {
      const oldestSample = recentSamples[0];
      const latestSample = recentSamples[recentSamples.length - 1];
      const timeDiff = latestSample.timestamp.getTime() - oldestSample.timestamp.getTime();
      
      if (timeDiff > 0) {
        const timeInMinutes = timeDiff / 60000;
        memoryGrowthRate = (latestSample.memoryUsage - oldestSample.memoryUsage) / timeInMinutes;
        connectionGrowthRate = (latestSample.networkConnections - oldestSample.networkConnections) / timeInMinutes;
      }
    }

    const leakTypes: Record<string, number> = {};
    for (const [type, suspect] of this.leakSuspects.entries()) {
      leakTypes[type] = suspect.count;
    }

    return {
      suspectedLeaks: this.leakSuspects.size,
      leakTypes,
      memoryGrowthRate,
      connectionGrowthRate
    };
  }

  /**
   * Add a resource sample manually
   */
  addResourceSample(sample: Partial<ResourceSample>): void {
    const fullSample: ResourceSample = {
      timestamp: new Date(),
      ...sample,
      ...this.getSystemMetrics()
    };

    this.resourceHistory.push(fullSample);
    
    // Keep history manageable
    if (this.resourceHistory.length > 1000) {
      this.resourceHistory.shift();
    }

    this.emit('resource-sample', fullSample);
  }

  /**
   * Perform resource cleanup
   */
  async cleanup(): Promise<void> {
    // Cleanup old resource history
    const cutoffTime = Date.now() - 24 * 60 * 60 * 1000; // 24 hours
    const initialLength = this.resourceHistory.length;
    
    for (let i = this.resourceHistory.length - 1; i >= 0; i--) {
      if (this.resourceHistory[i].timestamp.getTime() < cutoffTime) {
        this.resourceHistory.splice(0, i + 1);
        break;
      }
    }

    const cleanedCount = initialLength - this.resourceHistory.length;
    
    // Clear resolved leak suspects
    const resolvedSuspects: string[] = [];
    for (const [type, suspect] of this.leakSuspects.entries()) {
      const timeSinceLastGrowth = Date.now() - suspect.lastGrowth.getTime();
      if (timeSinceLastGrowth > 30 * 60 * 1000) { // 30 minutes
        resolvedSuspects.push(type);
      }
    }

    for (const type of resolvedSuspects) {
      this.leakSuspects.delete(type);
    }

    this.emit('cleanup-completed', { 
      cleanedSamples: cleanedCount,
      resolvedLeaks: resolvedSuspects.length
    });
  }

  /**
   * Close the resource monitor
   */
  async close(): Promise<void> {
    this.isMonitoring = false;
    
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
    }
    
    if (this.leakDetectionTimer) {
      clearInterval(this.leakDetectionTimer);
    }

    this.emit('monitor-closed');
  }

  /**
   * Force close the resource monitor
   */
  async forceClose(): Promise<void> {
    await this.close();
    
    this.resourceHistory.length = 0;
    this.leakSuspects.clear();
    
    this.emit('monitor-force-closed');
  }

  private startMonitoring(): void {
    if (this.isMonitoring) {return;}

    this.isMonitoring = true;
    this.establishBaseline();

    // Start resource sampling
    this.monitoringTimer = setInterval(() => {
      this.collectResourceSample();
    }, this.config.trackingInterval);

    // Start leak detection
    if (this.config.leakDetectionEnabled) {
      this.leakDetectionTimer = setInterval(() => {
        this.detectResourceLeaks();
      }, 60000); // Check for leaks every minute
    }

    this.emit('monitoring-started');
  }

  private establishBaseline(): void {
    const metrics = this.getSystemMetrics();
    this.baselineMemory = metrics.memoryUsage;
    this.baselineConnections = metrics.networkConnections;
    
    this.emit('baseline-established', {
      baselineMemory: this.baselineMemory,
      baselineConnections: this.baselineConnections
    });
  }

  private collectResourceSample(): void {
    const sample: ResourceSample = {
      timestamp: new Date(),
      ...this.getSystemMetrics()
    };

    this.resourceHistory.push(sample);
    
    // Keep history manageable
    if (this.resourceHistory.length > 1000) {
      this.resourceHistory.shift();
    }

    // Check thresholds
    this.checkResourceThresholds(sample);
    
    this.emit('resource-sample', sample);
  }

  private checkResourceThresholds(sample: ResourceSample): void {
    const thresholds = this.config.alertThresholds;
    const alerts: string[] = [];

    // Memory usage threshold - calculate utilization percentage
    const memoryUtilization = (sample.memoryUsage / (1024 * 1024 * 1024)) * 100; // Convert to GB and percentage
    if (memoryUtilization > thresholds.memoryUsage) {
      alerts.push(`Memory utilization: ${memoryUtilization.toFixed(1)}%`);
    }

    // File handle threshold (estimate based on system limits)
    const estimatedFileHandleLimit = 65536; // Common Linux default
    const fileHandlePercentage = (sample.fileHandles / estimatedFileHandleLimit) * 100;
    if (fileHandlePercentage > thresholds.fileHandleUsage) {
      alerts.push(`File handle usage: ${fileHandlePercentage.toFixed(1)}%`);
    }

    // Network connection threshold
    const estimatedConnectionLimit = 1024; // Reasonable default
    const connectionPercentage = (sample.networkConnections / estimatedConnectionLimit) * 100;
    if (connectionPercentage > thresholds.networkConnectionUsage) {
      alerts.push(`Network connection usage: ${connectionPercentage.toFixed(1)}%`);
    }

    if (alerts.length > 0) {
      this.emit('threshold-exceeded', {
        alerts,
        sample,
        thresholds
      });
    }
  }

  private detectResourceLeaks(): void {
    if (this.resourceHistory.length < 10) {
      return; // Need more data
    }

    const recentSamples = this.resourceHistory.slice(-10);
    this.detectMemoryLeaks(recentSamples);
    this.detectConnectionLeaks(recentSamples);
    this.detectTimerLeaks(recentSamples);
    this.detectEventListenerLeaks(recentSamples);
  }

  private detectMemoryLeaks(samples: ResourceSample[]): void {
    const memoryGrowth = this.calculateGrowthTrend(
      samples.map(s => ({ time: s.timestamp.getTime(), value: s.memoryUsage }))
    );

    if (memoryGrowth.trend > 1024 * 1024) { // 1MB growth trend
      this.recordLeakSuspect('memory', {
        count: samples[samples.length - 1].memoryUsage,
        growthRate: memoryGrowth.trend,
        severity: this.calculateLeakSeverity(memoryGrowth.trend, 10 * 1024 * 1024) // 10MB threshold
      });
    }
  }

  private detectConnectionLeaks(samples: ResourceSample[]): void {
    const connectionGrowth = this.calculateGrowthTrend(
      samples.map(s => ({ time: s.timestamp.getTime(), value: s.networkConnections }))
    );

    if (connectionGrowth.trend > 0.1) { // Connection growth trend
      this.recordLeakSuspect('connections', {
        count: samples[samples.length - 1].networkConnections,
        growthRate: connectionGrowth.trend,
        severity: this.calculateLeakSeverity(connectionGrowth.trend, 50) // 50 connections threshold
      });
    }
  }

  private detectTimerLeaks(samples: ResourceSample[]): void {
    const timerGrowth = this.calculateGrowthTrend(
      samples.map(s => ({ time: s.timestamp.getTime(), value: s.activeTimers }))
    );

    if (timerGrowth.trend > 0.1) { // Timer growth trend
      this.recordLeakSuspect('timers', {
        count: samples[samples.length - 1].activeTimers,
        growthRate: timerGrowth.trend,
        severity: this.calculateLeakSeverity(timerGrowth.trend, 100) // 100 timers threshold
      });
    }
  }

  private detectEventListenerLeaks(samples: ResourceSample[]): void {
    const listenerGrowth = this.calculateGrowthTrend(
      samples.map(s => ({ time: s.timestamp.getTime(), value: s.eventListeners }))
    );

    if (listenerGrowth.trend > 0.1) { // Event listener growth trend
      this.recordLeakSuspect('event-listeners', {
        count: samples[samples.length - 1].eventListeners,
        growthRate: listenerGrowth.trend,
        severity: this.calculateLeakSeverity(listenerGrowth.trend, 500) // 500 listeners threshold
      });
    }
  }

  private calculateGrowthTrend(data: { time: number; value: number }[]): { trend: number; r2: number } {
    if (data.length < 2) {return { trend: 0, r2: 0 };}

    // Simple linear regression
    const n = data.length;
    const sumX = data.reduce((sum, point, index) => sum + index, 0);
    const sumY = data.reduce((sum, point) => sum + point.value, 0);
    const sumXY = data.reduce((sum, point, index) => sum + index * point.value, 0);
    const sumXX = data.reduce((sum, point, index) => sum + index * index, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    
    // Calculate R-squared for trend confidence
    const meanY = sumY / n;
    const totalSumSquares = data.reduce((sum, point) => sum + Math.pow(point.value - meanY, 2), 0);
    const residualSumSquares = data.reduce((sum, point, index) => {
      const predicted = (sumY - slope * sumX) / n + slope * index;
      return sum + Math.pow(point.value - predicted, 2);
    }, 0);
    
    const r2 = totalSumSquares > 0 ? 1 - (residualSumSquares / totalSumSquares) : 0;

    return { trend: slope, r2 };
  }

  private recordLeakSuspect(type: string, data: { count: number; growthRate: number; severity: 'low' | 'medium' | 'high' | 'critical' }): void {
    let suspect = this.leakSuspects.get(type);
    
    if (!suspect) {
      suspect = {
        type,
        count: data.count,
        growthRate: data.growthRate,
        firstDetected: new Date(),
        lastGrowth: new Date(),
        severity: data.severity
      };
      this.leakSuspects.set(type, suspect);
      
      this.emit('leak-detected', suspect);
    } else {
      // Update existing suspect
      suspect.count = data.count;
      suspect.growthRate = data.growthRate;
      suspect.lastGrowth = new Date();
      suspect.severity = data.severity;
    }
  }

  private calculateLeakSeverity(growthRate: number, threshold: number): 'low' | 'medium' | 'high' | 'critical' {
    const ratio = growthRate / threshold;
    
    if (ratio >= 2) {return 'critical';}
    if (ratio >= 1) {return 'high';}
    if (ratio >= 0.5) {return 'medium';}
    return 'low';
  }

  // Mock system metric collection methods
  private calculateCpuPercentage(cpuUsage: NodeJS.CpuUsage): number {
    // This is a simplified CPU calculation
    // In production, you'd need to track CPU usage over time
    const totalTime = cpuUsage.user + cpuUsage.system;
    return Math.min(100, (totalTime / 1000000) * 100); // Convert microseconds to percentage
  }

  private getFileHandleCount(): number {
    // Mock file handle count
    // In production, you might read from /proc/self/fd/ on Linux
    return Math.floor(Math.random() * 100) + 50;
  }

  private getNetworkConnectionCount(): number {
    // Mock network connection count
    // In production, you might parse netstat output or read from /proc/net/tcp
    return Math.floor(Math.random() * 50) + 10;
  }

  private getActiveTimerCount(): number {
    // Mock active timer count
    // In Node.js, you might track this through process._getActiveHandles()
    return Math.floor(Math.random() * 20) + 5;
  }

  private getEventListenerCount(): number {
    // Mock event listener count
    // Could be tracked by monitoring EventEmitter instances
    return Math.floor(Math.random() * 100) + 20;
  }
}