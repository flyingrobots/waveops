/**
 * Worker pool management for background processing
 */

import { EventEmitter } from 'events';
import { Worker } from 'worker_threads';
import { WorkerConfig, AutoScalingConfig } from '../types';

export interface WorkerMetrics {
  totalWorkers: number;
  activeWorkers: number;
  idleWorkers: number;
  queuedTasks: number;
  completedTasks: number;
  failedTasks: number;
  avgTaskDuration: number;
  workerUtilization: number; // percentage
}

interface WorkerInstance {
  id: string;
  worker?: Worker;
  busy: boolean;
  createdAt: Date;
  lastUsed: Date;
  tasksCompleted: number;
  tasksSuccessful: number;
  tasksFailed: number;
  totalTaskTime: number;
  isHealthy: boolean;
  errorCount: number;
  restartCount: number;
}

interface TaskExecution {
  id: string;
  workerId: string;
  startTime: Date;
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timeout?: NodeJS.Timeout;
}

export class WorkerPool extends EventEmitter {
  private readonly config: WorkerConfig;
  private readonly workers: Map<string, WorkerInstance>;
  private readonly availableWorkers: string[];
  private readonly pendingTasks: TaskExecution[];
  private readonly activeTasks: Map<string, TaskExecution>;
  private workerIdCounter: number;
  private isShuttingDown: boolean;
  private healthCheckTimer?: NodeJS.Timeout;
  private scaleTimer?: NodeJS.Timeout;

  constructor(config: WorkerConfig) {
    super();
    this.config = config;
    this.workers = new Map();
    this.availableWorkers = [];
    this.pendingTasks = [];
    this.activeTasks = new Map();
    this.workerIdCounter = 0;
    this.isShuttingDown = false;

    this.startHealthChecks();
    if (config.autoScaling?.enabled) {
      this.startAutoScaling();
    }
  }

  /**
   * Start the worker pool
   */
  async start(): Promise<void> {
    const initialWorkers = Math.max(1, this.config.concurrency);
    
    for (let i = 0; i < initialWorkers; i++) {
      await this.createWorker();
    }

    this.emit('pool-started', { 
      workerCount: this.workers.size,
      concurrency: this.config.concurrency 
    });
  }

  /**
   * Get an available worker
   */
  async getWorker(): Promise<WorkerInstance | null> {
    // Try to get an available worker
    const availableId = this.availableWorkers.pop();
    if (availableId) {
      const worker = this.workers.get(availableId);
      if (worker && worker.isHealthy) {
        worker.busy = true;
        worker.lastUsed = new Date();
        return worker;
      }
    }

    // Try to create a new worker if under limit
    if (this.canCreateWorker()) {
      return await this.createWorker(true);
    }

    // No workers available
    return null;
  }

  /**
   * Release a worker back to the pool
   */
  releaseWorker(worker: WorkerInstance): void {
    if (!this.workers.has(worker.id)) {
      return;
    }

    worker.busy = false;
    worker.lastUsed = new Date();

    // Add back to available pool if healthy
    if (worker.isHealthy && !this.isShuttingDown) {
      this.availableWorkers.push(worker.id);
    } else {
      // Remove unhealthy worker
      this.removeWorker(worker.id);
    }
  }

  /**
   * Execute a task on a worker
   */
  async executeTask(taskId: string, taskType: string, data: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const execution: TaskExecution = {
        id: taskId,
        workerId: '',
        startTime: new Date(),
        resolve,
        reject
      };

      // Set task timeout
      execution.timeout = setTimeout(() => {
        this.handleTaskTimeout(execution);
      }, 30000); // 30 second default timeout

      this.pendingTasks.push(execution);
      this.processNextTask();
    });
  }

  /**
   * Get worker pool metrics
   */
  getMetrics(): WorkerMetrics {
    const totalWorkers = this.workers.size;
    const activeWorkers = Array.from(this.workers.values()).filter(w => w.busy).length;
    const idleWorkers = totalWorkers - activeWorkers;
    
    let totalTasks = 0;
    let successfulTasks = 0;
    let failedTasks = 0;
    let totalTaskTime = 0;

    for (const worker of this.workers.values()) {
      totalTasks += worker.tasksCompleted;
      successfulTasks += worker.tasksSuccessful;
      failedTasks += worker.tasksFailed;
      totalTaskTime += worker.totalTaskTime;
    }

    return {
      totalWorkers,
      activeWorkers,
      idleWorkers,
      queuedTasks: this.pendingTasks.length,
      completedTasks: successfulTasks,
      failedTasks,
      avgTaskDuration: totalTasks > 0 ? totalTaskTime / totalTasks : 0,
      workerUtilization: totalWorkers > 0 ? (activeWorkers / totalWorkers) * 100 : 0
    };
  }

  /**
   * Shutdown the worker pool gracefully
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
    
    if (this.scaleTimer) {
      clearInterval(this.scaleTimer);
    }

    // Wait for active tasks to complete
    await this.waitForActiveTasks();

    // Terminate all workers
    const shutdownPromises: Promise<void>[] = [];
    for (const worker of this.workers.values()) {
      shutdownPromises.push(this.terminateWorker(worker));
    }

    await Promise.allSettled(shutdownPromises);
    
    this.workers.clear();
    this.availableWorkers.length = 0;
    this.activeTasks.clear();

    this.emit('pool-shutdown');
  }

  /**
   * Force shutdown the worker pool
   */
  async forceShutdown(): Promise<void> {
    this.isShuttingDown = true;
    
    // Cancel all pending tasks
    for (const task of this.pendingTasks) {
      if (task.timeout) {clearTimeout(task.timeout);}
      task.reject(new Error('Worker pool force shutdown'));
    }
    this.pendingTasks.length = 0;

    // Cancel all active tasks
    for (const task of this.activeTasks.values()) {
      if (task.timeout) {clearTimeout(task.timeout);}
      task.reject(new Error('Worker pool force shutdown'));
    }
    this.activeTasks.clear();

    // Terminate all workers immediately
    for (const worker of this.workers.values()) {
      if (worker.worker) {
        worker.worker.terminate();
      }
    }

    this.workers.clear();
    this.availableWorkers.length = 0;

    this.emit('pool-force-shutdown');
  }

  private async createWorker(markAsBusy: boolean = false): Promise<WorkerInstance> {
    const workerId = `worker-${++this.workerIdCounter}`;
    
    const workerInstance: WorkerInstance = {
      id: workerId,
      busy: markAsBusy,
      createdAt: new Date(),
      lastUsed: new Date(),
      tasksCompleted: 0,
      tasksSuccessful: 0,
      tasksFailed: 0,
      totalTaskTime: 0,
      isHealthy: true,
      errorCount: 0,
      restartCount: 0
    };

    // In a real implementation, this would create actual worker threads
    // For now, we'll simulate workers
    try {
      // Simulate worker creation delay
      await new Promise(resolve => setTimeout(resolve, 10));
      
      this.workers.set(workerId, workerInstance);
      
      if (!markAsBusy) {
        this.availableWorkers.push(workerId);
      }

      this.emit('worker-created', { workerId, totalWorkers: this.workers.size });
      return workerInstance;
    } catch (error) {
      this.emit('worker-creation-failed', { workerId, error });
      throw error;
    }
  }

  private canCreateWorker(): boolean {
    if (this.isShuttingDown) {return false;}
    
    const maxWorkers = this.config.autoScaling?.enabled 
      ? this.config.autoScaling.maxWorkers 
      : this.config.maxConcurrency;
    
    return this.workers.size < maxWorkers;
  }

  private async removeWorker(workerId: string): Promise<void> {
    const worker = this.workers.get(workerId);
    if (!worker) {return;}

    this.workers.delete(workerId);
    
    // Remove from available pool
    const availableIndex = this.availableWorkers.indexOf(workerId);
    if (availableIndex !== -1) {
      this.availableWorkers.splice(availableIndex, 1);
    }

    await this.terminateWorker(worker);
    
    this.emit('worker-removed', { workerId, totalWorkers: this.workers.size });
  }

  private async terminateWorker(worker: WorkerInstance): Promise<void> {
    if (worker.worker) {
      try {
        await worker.worker.terminate();
      } catch (error) {
        // Worker might already be terminated
      }
    }
    
    worker.isHealthy = false;
    this.emit('worker-terminated', { workerId: worker.id });
  }

  private async processNextTask(): Promise<void> {
    if (this.pendingTasks.length === 0 || this.isShuttingDown) {
      return;
    }

    const worker = await this.getWorker();
    if (!worker) {
      // No workers available, try again later
      setTimeout(() => this.processNextTask(), 100);
      return;
    }

    const task = this.pendingTasks.shift()!;
    task.workerId = worker.id;
    this.activeTasks.set(task.id, task);

    try {
      // Simulate task execution
      const result = await this.simulateTaskExecution(task, worker);
      
      // Task completed successfully
      const duration = Date.now() - task.startTime.getTime();
      worker.tasksCompleted++;
      worker.tasksSuccessful++;
      worker.totalTaskTime += duration;
      
      if (task.timeout) {clearTimeout(task.timeout);}
      this.activeTasks.delete(task.id);
      task.resolve(result);
      
      this.emit('task-completed', { 
        taskId: task.id, 
        workerId: worker.id, 
        duration 
      });
    } catch (error) {
      // Task failed
      const duration = Date.now() - task.startTime.getTime();
      worker.tasksCompleted++;
      worker.tasksFailed++;
      worker.totalTaskTime += duration;
      worker.errorCount++;
      
      if (task.timeout) {clearTimeout(task.timeout);}
      this.activeTasks.delete(task.id);
      task.reject(error instanceof Error ? error : new Error(String(error)));
      
      this.emit('task-failed', { 
        taskId: task.id, 
        workerId: worker.id, 
        duration, 
        error 
      });
      
      // Check if worker should be restarted
      if (worker.errorCount > 5) {
        worker.isHealthy = false;
        this.restartWorker(worker);
      }
    } finally {
      this.releaseWorker(worker);
    }
  }

  private async simulateTaskExecution(task: TaskExecution, worker: WorkerInstance): Promise<unknown> {
    // Mock task execution - in production, this would communicate with actual worker threads
    const executionTime = 100 + Math.random() * 500; // 100-600ms
    await new Promise(resolve => setTimeout(resolve, executionTime));
    
    // Simulate occasional failures
    if (Math.random() < 0.05) { // 5% failure rate
      throw new Error('Task execution failed');
    }
    
    return { result: 'success', executedBy: worker.id, duration: executionTime };
  }

  private handleTaskTimeout(task: TaskExecution): void {
    if (!this.activeTasks.has(task.id)) {
      return; // Task already completed
    }

    this.activeTasks.delete(task.id);
    task.reject(new Error('Task execution timeout'));
    
    const worker = this.workers.get(task.workerId);
    if (worker) {
      worker.tasksFailed++;
      worker.errorCount++;
      this.emit('task-timeout', { taskId: task.id, workerId: worker.id });
    }
  }

  private async waitForActiveTasks(): Promise<void> {
    return new Promise((resolve) => {
      const checkTasks = () => {
        if (this.activeTasks.size === 0) {
          resolve();
        } else {
          setTimeout(checkTasks, 100);
        }
      };
      checkTasks();
    });
  }

  private startHealthChecks(): void {
    if (!this.config.healthChecks?.enabled) {return;}

    this.healthCheckTimer = setInterval(() => {
      this.performHealthChecks();
    }, this.config.healthChecks.checkInterval || 30000);
  }

  private performHealthChecks(): void {
    for (const worker of this.workers.values()) {
      const errorRate = worker.tasksCompleted > 0 ? 
        (worker.tasksFailed / worker.tasksCompleted) : 0;
      
      const wasHealthy = worker.isHealthy;
      worker.isHealthy = errorRate < 0.1; // 10% error threshold
      
      if (wasHealthy && !worker.isHealthy) {
        this.emit('worker-unhealthy', { 
          workerId: worker.id, 
          errorRate: errorRate * 100 
        });
        
        if (this.config.healthChecks?.restartOnFailure) {
          this.restartWorker(worker);
        }
      }
    }
  }

  private async restartWorker(worker: WorkerInstance): Promise<void> {
    if (worker.restartCount >= 3) {
      // Too many restarts, remove worker
      await this.removeWorker(worker.id);
      return;
    }

    worker.restartCount++;
    worker.errorCount = 0;
    worker.isHealthy = true;
    
    this.emit('worker-restarted', { 
      workerId: worker.id, 
      restartCount: worker.restartCount 
    });
  }

  private startAutoScaling(): void {
    if (!this.config.autoScaling?.enabled) {return;}

    this.scaleTimer = setInterval(() => {
      this.performAutoScaling();
    }, 60000); // Check every minute
  }

  private performAutoScaling(): void {
    const autoScaling = this.config.autoScaling;
    if (!autoScaling?.enabled) {return;}

    const metrics = this.getMetrics();
    const utilizationPercent = metrics.workerUtilization;
    const queueSize = metrics.queuedTasks;

    // Scale up conditions
    if ((utilizationPercent > autoScaling.scaleUpThreshold || queueSize > 10) &&
        metrics.totalWorkers < autoScaling.maxWorkers) {
      
      this.createWorker().then(() => {
        this.emit('auto-scale-up', { 
          totalWorkers: this.workers.size,
          utilization: utilizationPercent,
          queueSize 
        });
      });
    }
    // Scale down conditions
    else if (utilizationPercent < autoScaling.scaleDownThreshold &&
             metrics.totalWorkers > autoScaling.minWorkers &&
             queueSize === 0) {
      
      // Find least recently used worker
      let oldestWorker: WorkerInstance | null = null;
      for (const worker of this.workers.values()) {
        if (!worker.busy && (!oldestWorker || worker.lastUsed < oldestWorker.lastUsed)) {
          oldestWorker = worker;
        }
      }

      if (oldestWorker) {
        this.removeWorker(oldestWorker.id).then(() => {
          this.emit('auto-scale-down', { 
            totalWorkers: this.workers.size,
            utilization: utilizationPercent 
          });
        });
      }
    }
  }
}