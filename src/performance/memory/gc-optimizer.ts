/**
 * Garbage collection optimization system
 */

import { EventEmitter } from 'events';
import { PerformanceObserver, PerformanceEntry } from 'perf_hooks';
import {
  GCOptimizationConfig,
  GCStrategy,
  GCMetrics
} from '../types';

interface GCEvent {
  type: 'minor' | 'major';
  startTime: number;
  endTime: number;
  duration: number;
  heapBefore: number;
  heapAfter: number;
  collected: number;
}

export class GCOptimizer extends EventEmitter {
  private readonly config: GCOptimizationConfig;
  private gcHistory: GCEvent[];
  private lastOptimization: Date;
  private optimizationTimer?: NodeJS.Timeout;
  private gcMetrics: GCMetrics;
  private gcObserver?: PerformanceObserver;

  constructor(config: GCOptimizationConfig) {
    super();
    this.config = config;
    this.gcHistory = [];
    this.lastOptimization = new Date();
    
    this.gcMetrics = {
      majorGCCount: 0,
      minorGCCount: 0,
      totalGCTime: 0,
      avgGCPause: 0,
      maxGCPause: 0,
      youngGenSize: 0,
      oldGenSize: 0,
      survivorRatio: 0
    };

    if (config.enabled) {
      this.initializeGCMonitoring();
      this.startOptimization();
    }
  }

  /**
   * Optimize garbage collection based on strategy
   */
  async optimize(): Promise<void> {
    if (!this.config.enabled) return;

    const memUsage = process.memoryUsage();
    const heapUsagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;

    this.emit('gc-triggered', { 
      strategy: this.config.strategy, 
      heapUsage: heapUsagePercent 
    });

    switch (this.config.strategy) {
      case GCStrategy.AGGRESSIVE:
        await this.aggressiveOptimization();
        break;
      case GCStrategy.BALANCED:
        await this.balancedOptimization();
        break;
      case GCStrategy.CONSERVATIVE:
        await this.conservativeOptimization();
        break;
      case GCStrategy.ADAPTIVE:
        await this.adaptiveOptimization();
        break;
    }

    this.lastOptimization = new Date();
    this.emit('gc-completed', this.gcMetrics);
  }

  /**
   * Force garbage collection
   */
  async forceGC(): Promise<void> {
    if (global.gc) {
      const startTime = Date.now();
      const memBefore = process.memoryUsage();
      
      global.gc();
      
      const endTime = Date.now();
      const memAfter = process.memoryUsage();
      
      const gcEvent: GCEvent = {
        type: 'major',
        startTime,
        endTime,
        duration: endTime - startTime,
        heapBefore: memBefore.heapUsed,
        heapAfter: memAfter.heapUsed,
        collected: memBefore.heapUsed - memAfter.heapUsed
      };

      this.recordGCEvent(gcEvent);
      this.emit('gc-forced', gcEvent);
    } else {
      this.emit('error', new Error('GC is not exposed. Use --expose-gc flag.'));
    }
  }

  /**
   * Get GC metrics
   */
  getMetrics(): GCMetrics {
    this.updateMetricsFromHistory();
    return { ...this.gcMetrics };
  }

  /**
   * Set GC parameters (Node.js specific)
   */
  setGCParameters(): void {
    if (!this.config.enabled) return;

    // These would be applied via V8 flags or at startup
    const params = {
      '--max-young-space-size': Math.floor(this.config.youngGenerationTargetSize / (1024 * 1024)),
      '--max-old-space-size': Math.floor(this.config.oldGenerationThreshold / (1024 * 1024)),
      '--incremental-marking': this.config.incrementalGCEnabled,
    };

    // Log the parameters that should be set
    this.emit('gc-parameters', params);
  }

  /**
   * Close GC optimizer
   */
  async close(): Promise<void> {
    if (this.optimizationTimer) {
      clearInterval(this.optimizationTimer);
    }

    if (this.gcObserver) {
      this.gcObserver.disconnect();
    }

    this.emit('closed');
  }

  private initializeGCMonitoring(): void {
    // Monitor GC events if available
    if (typeof PerformanceObserver !== 'undefined') {
      try {
        this.gcObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          
          for (const entry of entries) {
            if (entry.entryType === 'gc') {
              this.handleGCEntry(entry as PerformanceEntry);
            }
          }
        });

        this.gcObserver.observe({ entryTypes: ['gc'] });
      } catch (error) {
        // GC monitoring may not be available in all environments
        this.emit('error', new Error(`GC monitoring not available: ${error}`));
      }
    }
  }

  private handleGCEntry(entry: PerformanceEntry): void {
    // This is a simplified version - in a real implementation,
    // we would parse the GC entry details
    const gcEvent: GCEvent = {
      type: entry.name?.includes('major') ? 'major' : 'minor',
      startTime: entry.startTime,
      endTime: entry.startTime + entry.duration,
      duration: entry.duration,
      heapBefore: 0, // Would need to be captured separately
      heapAfter: 0,   // Would need to be captured separately
      collected: 0    // Would need to be calculated
    };

    this.recordGCEvent(gcEvent);
  }

  private recordGCEvent(event: GCEvent): void {
    this.gcHistory.push(event);
    
    // Keep only recent history (last 100 events)
    if (this.gcHistory.length > 100) {
      this.gcHistory.shift();
    }

    // Update metrics
    if (event.type === 'major') {
      this.gcMetrics.majorGCCount++;
    } else {
      this.gcMetrics.minorGCCount++;
    }

    this.gcMetrics.totalGCTime += event.duration;
    this.gcMetrics.maxGCPause = Math.max(this.gcMetrics.maxGCPause, event.duration);
    
    const totalGCs = this.gcMetrics.majorGCCount + this.gcMetrics.minorGCCount;
    if (totalGCs > 0) {
      this.gcMetrics.avgGCPause = this.gcMetrics.totalGCTime / totalGCs;
    }
  }

  private startOptimization(): void {
    if (this.config.strategy !== GCStrategy.ADAPTIVE) return;

    // For adaptive strategy, optimize periodically
    this.optimizationTimer = setInterval(() => {
      this.optimize().catch(error => {
        this.emit('error', error);
      });
    }, 60000); // Every minute
  }

  private async aggressiveOptimization(): Promise<void> {
    // Force GC frequently and aggressively
    const memUsage = process.memoryUsage();
    const heapUsagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;

    if (heapUsagePercent > 50) {
      await this.forceGC();
    }

    // Set aggressive GC parameters
    this.setGCParameters();
  }

  private async balancedOptimization(): Promise<void> {
    // Balance between performance and memory efficiency
    const memUsage = process.memoryUsage();
    const heapUsagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;

    if (heapUsagePercent > this.config.forceGCThreshold) {
      await this.forceGC();
    }

    // Trigger GC if average pause time is getting high
    if (this.gcMetrics.avgGCPause > 100) { // 100ms
      await this.forceGC();
    }
  }

  private async conservativeOptimization(): Promise<void> {
    // Only optimize when absolutely necessary
    const memUsage = process.memoryUsage();
    const heapUsagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;

    if (heapUsagePercent > 90) {
      await this.forceGC();
    }
  }

  private async adaptiveOptimization(): Promise<void> {
    // Analyze recent GC patterns and adapt
    const recentEvents = this.gcHistory.slice(-20); // Last 20 events
    
    if (recentEvents.length < 5) {
      // Not enough data, use balanced approach
      await this.balancedOptimization();
      return;
    }

    const avgPauseTime = recentEvents.reduce((sum, event) => sum + event.duration, 0) / recentEvents.length;
    const gcFrequency = recentEvents.length / ((recentEvents[recentEvents.length - 1].endTime - recentEvents[0].startTime) / 60000); // GCs per minute

    // Adapt strategy based on patterns
    if (avgPauseTime > 200) { // High pause times
      // Use more frequent, smaller GCs
      if (gcFrequency < 1) {
        await this.forceGC();
      }
    } else if (gcFrequency > 5) { // Too frequent GCs
      // Let GC happen naturally for a while
      return;
    } else {
      // Normal operation
      await this.balancedOptimization();
    }
  }

  private updateMetricsFromHistory(): void {
    if (this.gcHistory.length === 0) return;

    // Update heap size estimates (would need actual measurements)
    const memUsage = process.memoryUsage();
    this.gcMetrics.youngGenSize = Math.floor(memUsage.heapUsed * 0.3); // Estimate
    this.gcMetrics.oldGenSize = Math.floor(memUsage.heapUsed * 0.7);   // Estimate
    
    // Calculate survivor ratio (simplified)
    if (this.gcMetrics.minorGCCount > 0) {
      this.gcMetrics.survivorRatio = this.gcMetrics.majorGCCount / this.gcMetrics.minorGCCount;
    }
  }
}