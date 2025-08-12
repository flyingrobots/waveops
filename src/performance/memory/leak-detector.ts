/**
 * Memory leak detection and prevention system
 */

import { EventEmitter } from 'events';
import {
  LeakDetectionConfig,
  LeakSuspect
} from '../types';

interface ObjectTracker {
  type: string;
  count: number;
  totalSize: number;
  firstSeen: Date;
  lastSeen: Date;
  instances: WeakSet<object>;
  stackTraces?: string[];
  growthRate: number;
  previousCount: number;
  lastMeasurement: Date;
}

export class LeakDetector extends EventEmitter {
  private readonly config: LeakDetectionConfig;
  private readonly trackers: Map<string, ObjectTracker>;
  private readonly instanceCounts: Map<string, number>;
  private detectionTimer?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(config: LeakDetectionConfig) {
    super();
    this.config = config;
    this.trackers = new Map();
    this.instanceCounts = new Map();

    if (config.enabled) {
      this.startDetection();
    }
  }

  /**
   * Track an object for potential leaks
   */
  trackObject(type: string, obj: object): void {
    if (!this.config.enabled || Math.random() > this.config.samplingRate) {
      return;
    }

    let tracker = this.trackers.get(type);
    
    if (!tracker) {
      tracker = {
        type,
        count: 0,
        totalSize: 0,
        firstSeen: new Date(),
        lastSeen: new Date(),
        instances: new WeakSet(),
        stackTraces: this.config.stackTraceEnabled ? [] : undefined,
        growthRate: 0,
        previousCount: 0,
        lastMeasurement: new Date()
      };
      this.trackers.set(type, tracker);
    }

    tracker.instances.add(obj);
    tracker.count++;
    tracker.lastSeen = new Date();
    tracker.totalSize += this.estimateObjectSize(obj);

    // Capture stack trace if enabled
    if (this.config.stackTraceEnabled && tracker.stackTraces) {
      const stackTrace = new Error().stack;
      if (stackTrace && tracker.stackTraces.length < 10) { // Limit stack traces
        tracker.stackTraces.push(stackTrace);
      }
    }

    // Update instance count
    const currentCount = this.instanceCounts.get(type) || 0;
    this.instanceCounts.set(type, currentCount + 1);
  }

  /**
   * Stop tracking an object
   */
  untrackObject(type: string, obj: object): void {
    if (!this.config.enabled) {return;}

    const tracker = this.trackers.get(type);
    if (tracker && tracker.instances.has(obj)) {
      tracker.count = Math.max(0, tracker.count - 1);
      tracker.totalSize = Math.max(0, tracker.totalSize - this.estimateObjectSize(obj));
      
      // Update instance count
      const currentCount = this.instanceCounts.get(type) || 0;
      this.instanceCounts.set(type, Math.max(0, currentCount - 1));
    }
  }

  /**
   * Detect memory leaks
   */
  async detectLeaks(): Promise<LeakSuspect[]> {
    if (!this.config.enabled) {return [];}

    const suspects: LeakSuspect[] = [];
    const now = new Date();

    for (const [type, tracker] of this.trackers.entries()) {
      // Calculate growth rate
      const timeDiff = now.getTime() - tracker.lastMeasurement.getTime();
      if (timeDiff > 60000) { // Only calculate if more than 1 minute has passed
        const countDiff = tracker.count - tracker.previousCount;
        tracker.growthRate = countDiff / (timeDiff / 60000); // Objects per minute
        tracker.previousCount = tracker.count;
        tracker.lastMeasurement = now;
      }

      // Check if this is a leak suspect
      if (this.isLeakSuspect(tracker)) {
        const suspect: LeakSuspect = {
          type: tracker.type,
          count: tracker.count,
          size: tracker.totalSize,
          firstSeen: tracker.firstSeen,
          lastSeen: tracker.lastSeen,
          stackTrace: tracker.stackTraces?.[0],
          growthRate: tracker.growthRate
        };

        suspects.push(suspect);
      }
    }

    if (suspects.length > 0) {
      this.emit('leak-detected', suspects);
    }

    return suspects;
  }

  /**
   * Clean up a specific leak suspect
   */
  async cleanupSuspect(suspect: LeakSuspect): Promise<void> {
    const tracker = this.trackers.get(suspect.type);
    if (!tracker) {return;}

    // Clear the tracker
    tracker.count = 0;
    tracker.totalSize = 0;
    tracker.instances = new WeakSet();
    tracker.stackTraces = this.config.stackTraceEnabled ? [] : undefined;
    tracker.growthRate = 0;
    tracker.previousCount = 0;
    
    this.instanceCounts.set(suspect.type, 0);
    
    this.emit('leak-cleaned', { type: suspect.type });
  }

  /**
   * Get current leak suspects
   */
  getSuspects(): LeakSuspect[] {
    const suspects: LeakSuspect[] = [];

    for (const tracker of this.trackers.values()) {
      if (this.isLeakSuspect(tracker)) {
        suspects.push({
          type: tracker.type,
          count: tracker.count,
          size: tracker.totalSize,
          firstSeen: tracker.firstSeen,
          lastSeen: tracker.lastSeen,
          stackTrace: tracker.stackTraces?.[0],
          growthRate: tracker.growthRate
        });
      }
    }

    return suspects;
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    // Clear all trackers periodically to prevent memory leaks in the detector itself
    const now = new Date();
    const cutoffTime = now.getTime() - (24 * 60 * 60 * 1000); // 24 hours

    for (const [type, tracker] of this.trackers.entries()) {
      if (tracker.lastSeen.getTime() < cutoffTime && tracker.count === 0) {
        this.trackers.delete(type);
        this.instanceCounts.delete(type);
      }
    }

    this.emit('cleanup-completed', { trackerCount: this.trackers.size });
  }

  /**
   * Close leak detector
   */
  async close(): Promise<void> {
    if (this.detectionTimer) {
      clearInterval(this.detectionTimer);
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    this.trackers.clear();
    this.instanceCounts.clear();
    this.emit('closed');
  }

  private startDetection(): void {
    // Periodic leak detection
    this.detectionTimer = setInterval(() => {
      this.detectLeaks().catch(error => {
        this.emit('error', error);
      });
    }, this.config.reportingInterval);

    // Periodic cleanup
    this.cleanupTimer = setInterval(() => {
      this.cleanup().catch(error => {
        this.emit('error', error);
      });
    }, 60 * 60 * 1000); // Every hour
  }

  private isLeakSuspect(tracker: ObjectTracker): boolean {
    const now = new Date();
    const age = now.getTime() - tracker.firstSeen.getTime();

    // Must be tracking for at least 5 minutes
    if (age < 5 * 60 * 1000) {return false;}

    // Check count threshold
    if (tracker.count < 100) {return false;}

    // Check size threshold
    if (tracker.totalSize < this.config.detectionThreshold) {return false;}

    // Check growth rate (objects per minute)
    if (tracker.growthRate > 10) {return true;}

    // Check if count is consistently high
    const highCountDuration = now.getTime() - tracker.lastSeen.getTime();
    if (tracker.count > 500 && highCountDuration > 10 * 60 * 1000) {return true;}

    return false;
  }

  private estimateObjectSize(obj: object): number {
    try {
      // Simple size estimation - in production, you might use a more sophisticated method
      const jsonString = JSON.stringify(obj);
      return jsonString.length * 2; // UTF-16 estimation
    } catch {
      // If object can't be serialized, use a default estimate
      return 100;
    }
  }
}