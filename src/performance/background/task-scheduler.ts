/**
 * Task scheduling system for background processing
 */

import { EventEmitter } from 'events';
import { SchedulingConfig, CronConfig, IntervalConfig, CleanupConfig } from '../types';

export interface ScheduledTask {
  id: string;
  type: 'cron' | 'interval' | 'delayed' | 'cleanup';
  name: string;
  handler: string;
  schedule: string | number; // cron string or interval in ms
  nextRun: Date;
  lastRun?: Date;
  enabled: boolean;
  runCount: number;
  errorCount: number;
  avgDuration: number;
  metadata?: Record<string, unknown>;
}

export interface SchedulerMetrics {
  totalTasks: number;
  activeTasks: number;
  completedRuns: number;
  failedRuns: number;
  avgRunDuration: number;
  nextScheduledRun?: Date;
}

export class TaskScheduler extends EventEmitter {
  private readonly config: SchedulingConfig;
  private readonly scheduledTasks: Map<string, ScheduledTask>;
  private readonly runningTasks: Set<string>;
  private readonly timers: Map<string, NodeJS.Timeout>;
  private schedulerTimer?: NodeJS.Timeout;
  private isRunning: boolean;

  constructor(config: SchedulingConfig) {
    super();
    this.config = config;
    this.scheduledTasks = new Map();
    this.runningTasks = new Set();
    this.timers = new Map();
    this.isRunning = false;

    this.initializeScheduledTasks();
  }

  /**
   * Start the task scheduler
   */
  async start(): Promise<void> {
    if (this.isRunning) {return;}

    this.isRunning = true;
    
    // Start the main scheduler loop
    this.schedulerTimer = setInterval(() => {
      this.checkScheduledTasks();
    }, 1000); // Check every second

    // Schedule all initial tasks
    for (const task of this.scheduledTasks.values()) {
      if (task.enabled) {
        this.scheduleNextRun(task);
      }
    }

    this.emit('scheduler-started', { taskCount: this.scheduledTasks.size });
  }

  /**
   * Stop the task scheduler
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {return;}

    this.isRunning = false;

    // Clear main scheduler timer
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
    }

    // Clear all task timers
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();

    // Wait for running tasks to complete
    await this.waitForRunningTasks();

    this.emit('scheduler-stopped');
  }

  /**
   * Schedule a one-time task
   */
  async scheduleTask(taskId: string, runAt: Date): Promise<void> {
    const task: ScheduledTask = {
      id: taskId,
      type: 'delayed',
      name: `delayed-${taskId}`,
      handler: 'delayed-task',
      schedule: runAt.getTime(),
      nextRun: runAt,
      enabled: true,
      runCount: 0,
      errorCount: 0,
      avgDuration: 0
    };

    this.scheduledTasks.set(taskId, task);
    
    if (this.isRunning) {
      this.scheduleNextRun(task);
    }

    this.emit('task-scheduled', { taskId, runAt });
  }

  /**
   * Cancel a scheduled task
   */
  async cancelTask(taskId: string): Promise<boolean> {
    const task = this.scheduledTasks.get(taskId);
    if (!task) {return false;}

    // Clear timer if exists
    const timer = this.timers.get(taskId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(taskId);
    }

    // Remove task
    this.scheduledTasks.delete(taskId);
    this.emit('task-cancelled', { taskId });
    
    return true;
  }

  /**
   * Get scheduler metrics
   */
  getMetrics(): SchedulerMetrics {
    let completedRuns = 0;
    let failedRuns = 0;
    let totalDuration = 0;
    let nextScheduledRun: Date | undefined;

    for (const task of this.scheduledTasks.values()) {
      completedRuns += task.runCount;
      failedRuns += task.errorCount;
      totalDuration += task.avgDuration * task.runCount;

      if (!nextScheduledRun || task.nextRun < nextScheduledRun) {
        nextScheduledRun = task.nextRun;
      }
    }

    return {
      totalTasks: this.scheduledTasks.size,
      activeTasks: this.runningTasks.size,
      completedRuns,
      failedRuns,
      avgRunDuration: completedRuns > 0 ? totalDuration / completedRuns : 0,
      nextScheduledRun
    };
  }

  /**
   * Get all scheduled tasks
   */
  getScheduledTasks(): ScheduledTask[] {
    return Array.from(this.scheduledTasks.values());
  }

  /**
   * Enable or disable a task
   */
  setTaskEnabled(taskId: string, enabled: boolean): boolean {
    const task = this.scheduledTasks.get(taskId);
    if (!task) {return false;}

    task.enabled = enabled;

    if (enabled && this.isRunning) {
      this.scheduleNextRun(task);
    } else if (!enabled) {
      const timer = this.timers.get(taskId);
      if (timer) {
        clearTimeout(timer);
        this.timers.delete(taskId);
      }
    }

    this.emit('task-enabled-changed', { taskId, enabled });
    return true;
  }

  private initializeScheduledTasks(): void {
    // Initialize cron tasks
    for (const cronConfig of this.config.cron) {
      if (!cronConfig.enabled) {continue;}

      const task: ScheduledTask = {
        id: `cron-${cronConfig.name}`,
        type: 'cron',
        name: cronConfig.name,
        handler: cronConfig.handler,
        schedule: cronConfig.schedule,
        nextRun: this.calculateNextCronRun(cronConfig.schedule),
        enabled: cronConfig.enabled,
        runCount: 0,
        errorCount: 0,
        avgDuration: 0
      };

      this.scheduledTasks.set(task.id, task);
    }

    // Initialize interval tasks
    for (const intervalConfig of this.config.intervals) {
      if (!intervalConfig.enabled) {continue;}

      const nextRun = intervalConfig.immediate 
        ? new Date() 
        : new Date(Date.now() + intervalConfig.intervalMs);

      const task: ScheduledTask = {
        id: `interval-${intervalConfig.name}`,
        type: 'interval',
        name: intervalConfig.name,
        handler: intervalConfig.handler,
        schedule: intervalConfig.intervalMs,
        nextRun,
        enabled: intervalConfig.enabled,
        runCount: 0,
        errorCount: 0,
        avgDuration: 0
      };

      this.scheduledTasks.set(task.id, task);
    }

    // Initialize cleanup tasks
    if (this.config.cleanup.enabled) {
      const task: ScheduledTask = {
        id: 'cleanup-task',
        type: 'cleanup',
        name: 'System Cleanup',
        handler: 'cleanup',
        schedule: this.config.cleanup.schedule,
        nextRun: this.calculateNextCronRun(this.config.cleanup.schedule),
        enabled: true,
        runCount: 0,
        errorCount: 0,
        avgDuration: 0
      };

      this.scheduledTasks.set(task.id, task);
    }
  }

  private checkScheduledTasks(): void {
    const now = new Date();

    for (const task of this.scheduledTasks.values()) {
      if (!task.enabled || this.runningTasks.has(task.id)) {
        continue;
      }

      if (now >= task.nextRun) {
        this.executeTask(task);
      }
    }
  }

  private async executeTask(task: ScheduledTask): Promise<void> {
    if (this.runningTasks.has(task.id)) {
      return; // Task already running
    }

    const startTime = Date.now();
    this.runningTasks.add(task.id);
    
    this.emit('task-started', { 
      taskId: task.id, 
      taskName: task.name,
      type: task.type 
    });

    try {
      // Execute the task based on its type
      await this.performTaskExecution(task);
      
      // Update task metrics
      const duration = Date.now() - startTime;
      task.runCount++;
      task.lastRun = new Date(startTime);
      task.avgDuration = ((task.avgDuration * (task.runCount - 1)) + duration) / task.runCount;

      this.emit('task-completed', { 
        taskId: task.id, 
        taskName: task.name,
        duration 
      });

    } catch (error) {
      // Handle task failure
      const duration = Date.now() - startTime;
      task.errorCount++;
      task.lastRun = new Date(startTime);
      
      this.emit('task-failed', { 
        taskId: task.id, 
        taskName: task.name,
        error: error instanceof Error ? error.message : String(error),
        duration 
      });
    } finally {
      this.runningTasks.delete(task.id);
      
      // Schedule next run if task is still enabled
      if (task.enabled && this.isRunning) {
        this.scheduleNextRun(task);
      }
    }
  }

  private async performTaskExecution(task: ScheduledTask): Promise<void> {
    // In a real implementation, this would dispatch to actual task handlers
    // For now, we'll simulate task execution
    
    switch (task.type) {
      case 'cron':
      case 'interval':
        await this.simulateTaskExecution(task);
        break;
      
      case 'delayed':
        await this.simulateTaskExecution(task);
        // Remove one-time tasks after execution
        this.scheduledTasks.delete(task.id);
        this.emit('task-due', task.id);
        break;
      
      case 'cleanup':
        await this.performCleanupTask();
        break;
      
      default:
        throw new Error(`Unknown task type: ${task.type}`);
    }
  }

  private async simulateTaskExecution(task: ScheduledTask): Promise<void> {
    // Simulate task execution time
    const executionTime = 100 + Math.random() * 1000; // 100ms to 1.1s
    await new Promise(resolve => setTimeout(resolve, executionTime));
    
    // Simulate occasional failures
    if (Math.random() < 0.05) { // 5% failure rate
      throw new Error(`Task ${task.name} execution failed`);
    }
  }

  private async performCleanupTask(): Promise<void> {
    const cutoffTime = new Date(Date.now() - this.config.cleanup.retentionPeriod);
    let cleanedItems = 0;

    // Clean up old completed tasks (simulation)
    for (const [taskId, task] of this.scheduledTasks.entries()) {
      if (task.lastRun && task.lastRun < cutoffTime && task.type === 'delayed') {
        this.scheduledTasks.delete(taskId);
        cleanedItems++;
        
        if (cleanedItems >= this.config.cleanup.batchSize) {
          break;
        }
      }
    }

    this.emit('cleanup-completed', { itemsCleaned: cleanedItems });
  }

  private scheduleNextRun(task: ScheduledTask): void {
    // Calculate next run time based on task type
    switch (task.type) {
      case 'cron':
        task.nextRun = this.calculateNextCronRun(task.schedule as string);
        break;
      
      case 'interval':
        const intervalMs = task.schedule as number;
        task.nextRun = new Date(Date.now() + intervalMs);
        break;
      
      case 'delayed':
        // One-time task, already has nextRun set
        break;
      
      case 'cleanup':
        task.nextRun = this.calculateNextCronRun(task.schedule as string);
        break;
    }

    // Set up timer for next run
    const delay = task.nextRun.getTime() - Date.now();
    if (delay > 0) {
      const timer = setTimeout(() => {
        this.timers.delete(task.id);
        if (task.enabled && this.isRunning) {
          this.executeTask(task);
        }
      }, Math.min(delay, 2147483647)); // Max setTimeout value

      // Clear existing timer if any
      const existingTimer = this.timers.get(task.id);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      this.timers.set(task.id, timer);
    }
  }

  private calculateNextCronRun(cronExpression: string): Date {
    // This is a simplified cron parser
    // In production, you would use a library like node-cron or cron-parser
    
    const now = new Date();
    const nextMinute = new Date(now.getTime() + 60000);
    nextMinute.setSeconds(0, 0);
    
    // Handle some basic cron expressions
    if (cronExpression === '0 * * * *') { // Every hour
      const nextHour = new Date(now);
      nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
      return nextHour;
    } else if (cronExpression === '0 0 * * *') { // Every day at midnight
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      return tomorrow;
    } else if (cronExpression === '*/5 * * * *') { // Every 5 minutes
      const nextFiveMinutes = new Date(now);
      nextFiveMinutes.setMinutes(Math.ceil(nextFiveMinutes.getMinutes() / 5) * 5, 0, 0);
      return nextFiveMinutes;
    }
    
    // Default: next minute
    return nextMinute;
  }

  private async waitForRunningTasks(): Promise<void> {
    return new Promise((resolve) => {
      const checkTasks = () => {
        if (this.runningTasks.size === 0) {
          resolve();
        } else {
          setTimeout(checkTasks, 100);
        }
      };
      checkTasks();
    });
  }
}