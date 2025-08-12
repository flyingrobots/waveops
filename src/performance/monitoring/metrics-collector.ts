/**
 * Metrics collection and aggregation system
 */

import { EventEmitter } from 'events';
import {
  MetricsCollectionConfig,
  AggregationFunction,
  MetricsExporter,
  RetentionConfig,
  AggregationConfig
} from '../types';
import { PerformanceSnapshot } from './performance-monitor';

interface MetricValue {
  timestamp: Date;
  value: number;
  tags?: Record<string, string>;
}

interface AggregatedMetric {
  name: string;
  windowStart: Date;
  windowEnd: Date;
  function: AggregationFunction;
  value: number;
  count: number;
  tags?: Record<string, string>;
}

interface HistogramBucket {
  upperBound: number;
  count: number;
}

interface Histogram {
  name: string;
  buckets: HistogramBucket[];
  sum: number;
  count: number;
  min: number;
  max: number;
  lastUpdate: Date;
}

export class MetricsCollector extends EventEmitter {
  private readonly config: MetricsCollectionConfig;
  private readonly rawMetrics: Map<string, MetricValue[]>;
  private readonly aggregatedMetrics: Map<string, AggregatedMetric[]>;
  private readonly histograms: Map<string, Histogram>;
  private readonly counters: Map<string, number>;
  private collectionTimer?: NodeJS.Timeout;
  private aggregationTimer?: NodeJS.Timeout;
  private exportTimer?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;
  private isRunning: boolean;

  constructor(config: MetricsCollectionConfig) {
    super();
    this.config = config;
    this.rawMetrics = new Map();
    this.aggregatedMetrics = new Map();
    this.histograms = new Map();
    this.counters = new Map();
    this.isRunning = false;
  }

  /**
   * Start metrics collection
   */
  async start(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;

    // Start aggregation timer
    if (this.config.aggregation) {
      this.startAggregation();
    }

    // Start export timer
    this.startExporting();

    // Start cleanup timer
    this.startCleanup();

    this.emit('collector-started');
  }

  /**
   * Stop metrics collection
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.isRunning = false;

    // Clear timers
    if (this.collectionTimer) clearInterval(this.collectionTimer);
    if (this.aggregationTimer) clearInterval(this.aggregationTimer);
    if (this.exportTimer) clearInterval(this.exportTimer);
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);

    // Final export
    if (this.config.exporters && this.config.exporters.length > 0) {
      await this.exportMetrics();
    }

    this.emit('collector-stopped');
  }

  /**
   * Record a custom metric
   */
  recordCustomMetric(name: string, value: number, tags?: Record<string, string>): void {
    const metric: MetricValue = {
      timestamp: new Date(),
      value,
      tags
    };

    this.recordRawMetric(name, metric);
  }

  /**
   * Record histogram value
   */
  recordHistogram(name: string, value: number): void {
    let histogram = this.histograms.get(name);
    
    if (!histogram) {
      histogram = {
        name,
        buckets: this.createHistogramBuckets(),
        sum: 0,
        count: 0,
        min: value,
        max: value,
        lastUpdate: new Date()
      };
      this.histograms.set(name, histogram);
    }

    // Update histogram
    histogram.sum += value;
    histogram.count++;
    histogram.min = Math.min(histogram.min, value);
    histogram.max = Math.max(histogram.max, value);
    histogram.lastUpdate = new Date();

    // Update buckets
    for (const bucket of histogram.buckets) {
      if (value <= bucket.upperBound) {
        bucket.count++;
      }
    }

    this.emit('histogram-recorded', { name, value });
  }

  /**
   * Increment counter
   */
  incrementCounter(name: string, delta: number = 1): void {
    const current = this.counters.get(name) || 0;
    this.counters.set(name, current + delta);
    
    this.recordCustomMetric(name, current + delta);
  }

  /**
   * Record performance snapshot
   */
  recordSnapshot(snapshot: PerformanceSnapshot): void {
    const timestamp = snapshot.timestamp;

    // Record system metrics
    this.recordMetricsFromObject('system', snapshot.systemMetrics, timestamp);
    
    // Record application metrics
    this.recordMetricsFromObject('app', snapshot.applicationMetrics, timestamp);
    
    // Record resource metrics
    this.recordMetricsFromObject('resource', snapshot.resourceMetrics, timestamp);
    
    // Record custom metrics
    for (const [name, value] of Object.entries(snapshot.customMetrics)) {
      this.recordRawMetric(`custom.${name}`, {
        timestamp,
        value
      });
    }

    this.emit('snapshot-recorded', { timestamp, metricsCount: Object.keys(snapshot.customMetrics).length });
  }

  /**
   * Get all raw metrics
   */
  getRawMetrics(): Map<string, MetricValue[]> {
    return new Map(this.rawMetrics);
  }

  /**
   * Get aggregated metrics
   */
  getAggregatedMetrics(): Map<string, AggregatedMetric[]> {
    return new Map(this.aggregatedMetrics);
  }

  /**
   * Get histogram data
   */
  getHistograms(): Map<string, Histogram> {
    return new Map(this.histograms);
  }

  /**
   * Get counter values
   */
  getCounters(): Map<string, number> {
    return new Map(this.counters);
  }

  private recordRawMetric(name: string, metric: MetricValue): void {
    let metrics = this.rawMetrics.get(name);
    if (!metrics) {
      metrics = [];
      this.rawMetrics.set(name, metrics);
    }

    metrics.push(metric);
    
    // Keep metrics within retention limits
    const maxAge = this.config.retention.rawDataRetention;
    const cutoffTime = new Date(Date.now() - maxAge);
    
    while (metrics.length > 0 && metrics[0].timestamp < cutoffTime) {
      metrics.shift();
    }
  }

  private recordMetricsFromObject(prefix: string, obj: unknown, timestamp: Date): void {
    if (!obj || typeof obj !== 'object') return;

    for (const [key, value] of Object.entries(obj)) {
      const metricName = `${prefix}.${key}`;
      
      if (typeof value === 'number') {
        this.recordRawMetric(metricName, { timestamp, value });
      } else if (typeof value === 'object' && value !== null) {
        this.recordMetricsFromObject(metricName, value, timestamp);
      }
    }
  }

  private startAggregation(): void {
    if (!this.config.aggregation) return;

    this.aggregationTimer = setInterval(() => {
      this.performAggregation();
    }, Math.min(...this.config.aggregation.windows.map(w => w.duration)));
  }

  private performAggregation(): void {
    if (!this.config.aggregation) return;

    const now = new Date();
    
    for (const window of this.config.aggregation.windows) {
      const windowStart = new Date(now.getTime() - window.duration - window.offset);
      const windowEnd = new Date(now.getTime() - window.offset);
      
      for (const [metricName, values] of this.rawMetrics.entries()) {
        // Get values in window
        const windowValues = values.filter(v => 
          v.timestamp >= windowStart && v.timestamp < windowEnd
        );
        
        if (windowValues.length === 0) continue;
        
        // Apply aggregation functions
        for (const func of this.config.aggregation.functions) {
          const aggregatedValue = this.applyAggregationFunction(func, windowValues);
          const aggregated: AggregatedMetric = {
            name: `${metricName}.${AggregationFunction[func].toLowerCase()}`,
            windowStart,
            windowEnd,
            function: func,
            value: aggregatedValue,
            count: windowValues.length
          };
          
          this.storeAggregatedMetric(aggregated);
        }
      }
    }
  }

  private applyAggregationFunction(func: AggregationFunction, values: MetricValue[]): number {
    const numericValues = values.map(v => v.value);
    
    switch (func) {
      case AggregationFunction.SUM:
        return numericValues.reduce((sum, val) => sum + val, 0);
        
      case AggregationFunction.AVG:
        return numericValues.reduce((sum, val) => sum + val, 0) / numericValues.length;
        
      case AggregationFunction.MIN:
        return Math.min(...numericValues);
        
      case AggregationFunction.MAX:
        return Math.max(...numericValues);
        
      case AggregationFunction.COUNT:
        return numericValues.length;
        
      case AggregationFunction.PERCENTILE:
        // Assume P95 for percentile
        const sorted = numericValues.sort((a, b) => a - b);
        const index = Math.floor(sorted.length * 0.95);
        return sorted[index] || 0;
        
      case AggregationFunction.STDDEV:
        const avg = numericValues.reduce((sum, val) => sum + val, 0) / numericValues.length;
        const variance = numericValues.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / numericValues.length;
        return Math.sqrt(variance);
        
      default:
        return 0;
    }
  }

  private storeAggregatedMetric(metric: AggregatedMetric): void {
    let metrics = this.aggregatedMetrics.get(metric.name);
    if (!metrics) {
      metrics = [];
      this.aggregatedMetrics.set(metric.name, metrics);
    }

    metrics.push(metric);
    
    // Keep aggregated metrics within retention limits
    const maxAge = this.config.retention.aggregatedDataRetention;
    const cutoffTime = new Date(Date.now() - maxAge);
    
    while (metrics.length > 0 && metrics[0].windowStart < cutoffTime) {
      metrics.shift();
    }
  }

  private startExporting(): void {
    if (!this.config.exporters || this.config.exporters.length === 0) return;

    this.exportTimer = setInterval(() => {
      this.exportMetrics().catch(error => {
        this.emit('export-error', error);
      });
    }, this.config.interval);
  }

  private async exportMetrics(): Promise<void> {
    const exportData = {
      timestamp: new Date(),
      rawMetrics: this.formatRawMetricsForExport(),
      aggregatedMetrics: this.formatAggregatedMetricsForExport(),
      histograms: this.formatHistogramsForExport(),
      counters: Object.fromEntries(this.counters.entries())
    };

    for (const exporter of this.config.exporters) {
      try {
        await this.exportToTarget(exporter, exportData);
      } catch (error) {
        this.emit('export-error', { exporter, error });
      }
    }
  }

  private formatRawMetricsForExport(): Record<string, unknown> {
    const formatted: Record<string, unknown> = {};
    
    for (const [name, values] of this.rawMetrics.entries()) {
      // Get recent values (last 5 minutes)
      const cutoffTime = new Date(Date.now() - 300000);
      const recentValues = values.filter(v => v.timestamp >= cutoffTime);
      
      if (recentValues.length > 0) {
        formatted[name] = {
          latest: recentValues[recentValues.length - 1].value,
          count: recentValues.length,
          avg: recentValues.reduce((sum, v) => sum + v.value, 0) / recentValues.length
        };
      }
    }
    
    return formatted;
  }

  private formatAggregatedMetricsForExport(): Record<string, unknown> {
    const formatted: Record<string, unknown> = {};
    
    for (const [name, metrics] of this.aggregatedMetrics.entries()) {
      if (metrics.length > 0) {
        const latest = metrics[metrics.length - 1];
        formatted[name] = {
          value: latest.value,
          windowStart: latest.windowStart,
          windowEnd: latest.windowEnd,
          count: latest.count
        };
      }
    }
    
    return formatted;
  }

  private formatHistogramsForExport(): Record<string, unknown> {
    const formatted: Record<string, unknown> = {};
    
    for (const [name, histogram] of this.histograms.entries()) {
      formatted[name] = {
        sum: histogram.sum,
        count: histogram.count,
        min: histogram.min,
        max: histogram.max,
        avg: histogram.count > 0 ? histogram.sum / histogram.count : 0,
        buckets: histogram.buckets
      };
    }
    
    return formatted;
  }

  private async exportToTarget(exporter: MetricsExporter, data: unknown): Promise<void> {
    switch (exporter) {
      case MetricsExporter.PROMETHEUS:
        await this.exportToPrometheus(data);
        break;
        
      case MetricsExporter.GRAPHITE:
        await this.exportToGraphite(data);
        break;
        
      case MetricsExporter.STATSD:
        await this.exportToStatsd(data);
        break;
        
      case MetricsExporter.INFLUXDB:
        await this.exportToInfluxDB(data);
        break;
        
      case MetricsExporter.CUSTOM:
        await this.exportToCustomTarget(data);
        break;
    }
  }

  private async exportToPrometheus(data: unknown): Promise<void> {
    // Mock Prometheus export
    this.emit('metrics-exported', { target: 'prometheus', size: JSON.stringify(data).length });
  }

  private async exportToGraphite(data: unknown): Promise<void> {
    // Mock Graphite export
    this.emit('metrics-exported', { target: 'graphite', size: JSON.stringify(data).length });
  }

  private async exportToStatsd(data: unknown): Promise<void> {
    // Mock StatsD export
    this.emit('metrics-exported', { target: 'statsd', size: JSON.stringify(data).length });
  }

  private async exportToInfluxDB(data: unknown): Promise<void> {
    // Mock InfluxDB export
    this.emit('metrics-exported', { target: 'influxdb', size: JSON.stringify(data).length });
  }

  private async exportToCustomTarget(data: unknown): Promise<void> {
    // Mock custom export
    this.emit('metrics-exported', { target: 'custom', size: JSON.stringify(data).length });
  }

  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.performCleanup();
    }, 3600000); // Clean up every hour
  }

  private performCleanup(): void {
    let totalCleaned = 0;
    
    // Cleanup raw metrics
    const rawRetention = this.config.retention.rawDataRetention;
    const rawCutoff = new Date(Date.now() - rawRetention);
    
    for (const [name, values] of this.rawMetrics.entries()) {
      const initialLength = values.length;
      const filtered = values.filter(v => v.timestamp >= rawCutoff);
      totalCleaned += initialLength - filtered.length;
      this.rawMetrics.set(name, filtered);
    }
    
    // Cleanup aggregated metrics
    const aggRetention = this.config.retention.aggregatedDataRetention;
    const aggCutoff = new Date(Date.now() - aggRetention);
    
    for (const [name, metrics] of this.aggregatedMetrics.entries()) {
      const initialLength = metrics.length;
      const filtered = metrics.filter(m => m.windowStart >= aggCutoff);
      totalCleaned += initialLength - filtered.length;
      this.aggregatedMetrics.set(name, filtered);
    }
    
    this.emit('cleanup-completed', { cleanedMetrics: totalCleaned });
  }

  private createHistogramBuckets(): HistogramBucket[] {
    // Create exponential buckets: 1ms, 2ms, 5ms, 10ms, 25ms, 50ms, 100ms, 250ms, 500ms, 1s, 2.5s, 5s, 10s
    const bounds = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, Infinity];
    
    return bounds.map(upperBound => ({
      upperBound,
      count: 0
    }));
  }
}