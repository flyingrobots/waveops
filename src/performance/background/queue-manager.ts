/**
 * Advanced background processing system with worker queues
 */

import { EventEmitter } from 'events';
import {
  BackgroundConfig,
  QueueConfig,
  QueueType,
  QueuePriority,
  WorkerConfig,
  QueueMonitoringConfig,
  BackoffType
} from '../types';
import { WorkerPool, WorkerInstance } from './worker-pool';
import { TaskScheduler } from './task-scheduler';
import { QueueMetricsCollector } from './queue-metrics-collector';

export interface Task {
  id: string;
  type: string;
  data: unknown;
  priority: number;
  retries: number;
  maxRetries: number;
  createdAt: Date;
  scheduledAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  failedAt?: Date;
  error?: string;
  timeout?: number;
  dependencies?: string[];
  metadata?: Record<string, unknown>;
}

export interface TaskResult {
  taskId: string;
  success: boolean;
  result?: unknown;
  error?: string;
  duration: number;
  retryCount: number;
}

export interface QueueMetrics {
  name: string;
  size: number;
  processing: number;
  completed: number;
  failed: number;
  avgProcessingTime: number;
  throughput: number; // tasks per second
  errorRate: number;
  retryRate: number;
}

export class QueueManager extends EventEmitter {
  private readonly config: BackgroundConfig;
  private readonly queues: Map<string, TaskQueue>;
  private readonly workerPool: WorkerPool;
  private readonly scheduler: TaskScheduler;
  private readonly metricsCollector: QueueMetricsCollector;
  private readonly taskHandlers: Map<string, TaskHandler>;
  private isShuttingDown: boolean;

  constructor(config: BackgroundConfig) {
    super();
    this.config = config;
    this.queues = new Map();
    this.taskHandlers = new Map();
    this.isShuttingDown = false;

    this.workerPool = new WorkerPool(config.workers);
    this.scheduler = new TaskScheduler(config.scheduling);
    this.metricsCollector = new QueueMetricsCollector(config.monitoring);

    this.initializeQueues();
    this.setupEventListeners();
  }

  /**
   * Register a task handler for a specific task type
   */
  registerTaskHandler(taskType: string, handler: TaskHandler): void {
    this.taskHandlers.set(taskType, handler);
    this.emit('handler-registered', { taskType });
  }

  /**
   * Add a task to a queue
   */
  async addTask(queueName: string, task: Omit<Task, 'id' | 'createdAt' | 'retries'>): Promise<string> {
    if (this.isShuttingDown) {
      throw new Error('Queue manager is shutting down');
    }

    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found`);
    }

    const fullTask: Task = {
      ...task,
      id: this.generateTaskId(),
      createdAt: new Date(),
      retries: 0
    };

    await queue.enqueue(fullTask);
    this.emit('task-added', { queueName, taskId: fullTask.id });
    
    return fullTask.id;
  }

  /**
   * Schedule a task for future execution
   */
  async scheduleTask(
    queueName: string, 
    task: Omit<Task, 'id' | 'createdAt' | 'retries'>, 
    scheduledAt: Date
  ): Promise<string> {
    const taskWithSchedule = {
      ...task,
      scheduledAt
    };

    const taskId = await this.addTask(queueName, taskWithSchedule);
    await this.scheduler.scheduleTask(taskId, scheduledAt);
    
    this.emit('task-scheduled', { queueName, taskId, scheduledAt });
    return taskId;
  }

  /**
   * Get task status
   */
  async getTaskStatus(taskId: string): Promise<Task | null> {
    for (const queue of this.queues.values()) {
      const task = await queue.getTask(taskId);
      if (task) {return task;}
    }
    return null;
  }

  /**
   * Cancel a task
   */
  async cancelTask(taskId: string): Promise<boolean> {
    for (const queue of this.queues.values()) {
      if (await queue.removeTask(taskId)) {
        this.emit('task-cancelled', { taskId });
        return true;
      }
    }
    return false;
  }

  /**
   * Get queue metrics
   */
  getQueueMetrics(queueName?: string): QueueMetrics[] {
    if (queueName) {
      const queue = this.queues.get(queueName);
      return queue ? [queue.getMetrics()] : [];
    }

    return Array.from(this.queues.values()).map(queue => queue.getMetrics());
  }

  /**
   * Start processing tasks
   */
  async start(): Promise<void> {
    if (this.isShuttingDown) {return;}

    await this.workerPool.start();
    await this.scheduler.start();
    
    // Start processing queues
    for (const queue of this.queues.values()) {
      this.startQueueProcessing(queue);
    }

    this.emit('started');
  }

  /**
   * Stop processing and shutdown gracefully
   */
  async shutdown(timeout: number = 30000): Promise<void> {
    this.isShuttingDown = true;
    this.emit('shutdown-started');

    // Stop accepting new tasks
    await this.scheduler.stop();

    // Wait for current tasks to complete or timeout
    const shutdownPromise = Promise.all([
      this.workerPool.shutdown(),
      this.waitForTasksCompletion()
    ]);

    try {
      await Promise.race([
        shutdownPromise,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Shutdown timeout')), timeout)
        )
      ]);
    } catch (error) {
      // Force shutdown if timeout
      await this.forceShutdown();
    }

    this.emit('shutdown-completed');
  }

  private initializeQueues(): void {
    for (const queueConfig of this.config.queues) {
      const queue = new TaskQueue(queueConfig);
      this.queues.set(queueConfig.name, queue);
      
      queue.on('task-completed', (result) => {
        this.emit('task-completed', result);
        this.metricsCollector.recordTaskCompletion(queueConfig.name, result);
      });

      queue.on('task-failed', (result) => {
        this.emit('task-failed', result);
        this.metricsCollector.recordTaskFailure(queueConfig.name, result);
      });
    }
  }

  private setupEventListeners(): void {
    this.workerPool.on('worker-error', (error) => {
      this.emit('worker-error', error);
    });

    this.scheduler.on('task-due', async (taskId) => {
      // Move scheduled task to appropriate queue
      const task = await this.getTaskStatus(taskId);
      if (task && task.scheduledAt && task.scheduledAt <= new Date()) {
        // Task is due for processing
        this.emit('scheduled-task-due', { taskId });
      }
    });

    this.metricsCollector.on('alert', (alert) => {
      this.emit('queue-alert', alert);
    });
  }

  private async startQueueProcessing(queue: TaskQueue): Promise<void> {
    const processNext = async () => {
      if (this.isShuttingDown) {return;}

      const task = await queue.dequeue();
      if (!task) {
        // No tasks available, wait and try again
        setTimeout(processNext, 100);
        return;
      }

      // Get available worker
      const worker = await this.workerPool.getWorker();
      if (!worker) {
        // No workers available, requeue task and wait
        await queue.enqueue(task);
        setTimeout(processNext, 500);
        return;
      }

      // Process task
      this.processTask(task, worker, queue)
        .finally(() => {
          this.workerPool.releaseWorker(worker);
          // Process next task
          setImmediate(processNext);
        });
    };

    // Start multiple processing loops based on concurrency
    const concurrency = Math.min(queue.config.maxConcurrency || 5, this.config.workers.concurrency);
    for (let i = 0; i < concurrency; i++) {
      processNext();
    }
  }

  private async processTask(task: Task, worker: WorkerInstance, queue: TaskQueue): Promise<void> {
    const startTime = Date.now();
    task.startedAt = new Date();

    try {
      const handler = this.taskHandlers.get(task.type);
      if (!handler) {
        throw new Error(`No handler registered for task type: ${task.type}`);
      }

      // Execute task with timeout
      const result = await this.executeWithTimeout(
        handler.execute(task.data, task.metadata),
        task.timeout || 30000
      );

      // Task completed successfully
      task.completedAt = new Date();
      const duration = Date.now() - startTime;
      
      const taskResult: TaskResult = {
        taskId: task.id,
        success: true,
        result,
        duration,
        retryCount: task.retries
      };

      queue.emit('task-completed', taskResult);
      this.emit('task-completed', { queueName: queue.config.name, taskResult });

    } catch (error) {
      // Task failed
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      task.error = errorMessage;
      task.retries++;

      const taskResult: TaskResult = {
        taskId: task.id,
        success: false,
        error: errorMessage,
        duration,
        retryCount: task.retries
      };

      // Check if task should be retried
      if (task.retries < task.maxRetries && this.shouldRetry(error, queue.config)) {
        // Schedule retry with backoff
        const delay = this.calculateRetryDelay(task.retries, queue.config);
        setTimeout(async () => {
          if (!this.isShuttingDown) {
            await queue.enqueue(task);
          }
        }, delay);

        this.emit('task-retry-scheduled', { 
          queueName: queue.config.name, 
          taskId: task.id, 
          attempt: task.retries,
          delay 
        });
      } else {
        // Task failed permanently
        task.failedAt = new Date();
        queue.emit('task-failed', taskResult);
        this.emit('task-failed', { queueName: queue.config.name, taskResult });

        // Send to dead letter queue if configured
        if (queue.config.deadLetterQueue) {
          await this.sendToDeadLetterQueue(task, queue.config.name);
        }
      }
    }
  }

  private async executeWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => 
        setTimeout(() => reject(new Error('Task timeout')), timeoutMs)
      )
    ]);
  }

  private shouldRetry(error: unknown, queueConfig: QueueConfig): boolean {
    if (!queueConfig.retryPolicy) {return false;}

    const retryableErrors = queueConfig.retryPolicy.retryableErrors || [];
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    return retryableErrors.some(pattern => errorMessage.includes(pattern));
  }

  private calculateRetryDelay(attempt: number, queueConfig: QueueConfig): number {
    const retryPolicy = queueConfig.retryPolicy;
    if (!retryPolicy) {return 1000;}

    let delay = retryPolicy.initialDelay;

    switch (retryPolicy.backoffType) {
      case BackoffType.EXPONENTIAL:
        delay = retryPolicy.initialDelay * Math.pow(2, attempt - 1);
        break;
      case BackoffType.LINEAR:
        delay = retryPolicy.initialDelay * attempt;
        break;
      case BackoffType.POLYNOMIAL:
        delay = retryPolicy.initialDelay * Math.pow(attempt, 2);
        break;
      case BackoffType.FIXED:
      default:
        delay = retryPolicy.initialDelay;
        break;
    }

    return Math.min(delay, retryPolicy.maxDelay);
  }

  private async sendToDeadLetterQueue(task: Task, originalQueue: string): Promise<void> {
    const deadLetterQueueName = `${originalQueue}-dlq`;
    let dlq = this.queues.get(deadLetterQueueName);

    if (!dlq) {
      // Create dead letter queue if it doesn't exist
      const dlqConfig: QueueConfig = {
        name: deadLetterQueueName,
        type: QueueType.FIFO,
        maxSize: 10000,
        maxConcurrency: 1,
        priority: QueuePriority.LOW,
        deadLetterQueue: false,
        retryPolicy: {
          maxRetries: 0,
          backoffType: BackoffType.FIXED,
          initialDelay: 1000,
          maxDelay: 1000,
          retryableErrors: []
        },
        rateLimiting: {
          enabled: false,
          requestsPerSecond: 0,
          burstCapacity: 0,
          windowSizeMs: 0
        }
      };

      dlq = new TaskQueue(dlqConfig);
      this.queues.set(deadLetterQueueName, dlq);
    }

    await dlq.enqueue(task);
    this.emit('task-sent-to-dlq', { taskId: task.id, originalQueue, deadLetterQueue: deadLetterQueueName });
  }

  private async waitForTasksCompletion(): Promise<void> {
    return new Promise((resolve) => {
      const checkCompletion = () => {
        let hasActiveTasks = false;
        
        for (const queue of this.queues.values()) {
          if (queue.getMetrics().processing > 0) {
            hasActiveTasks = true;
            break;
          }
        }

        if (!hasActiveTasks) {
          resolve();
        } else {
          setTimeout(checkCompletion, 1000);
        }
      };

      checkCompletion();
    });
  }

  private async forceShutdown(): Promise<void> {
    // Force close all resources
    await Promise.allSettled([
      this.workerPool.forceShutdown(),
      this.metricsCollector.close()
    ]);
  }

  private generateTaskId(): string {
    return `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

interface TaskHandler {
  execute(data: unknown, metadata?: Record<string, unknown>): Promise<unknown>;
}

interface Worker {
  id: string;
  busy: boolean;
  execute(task: Task, handler: TaskHandler): Promise<TaskResult>;
}

class TaskQueue extends EventEmitter {
  public readonly config: QueueConfig;
  private readonly tasks: Map<string, Task>;
  private readonly pendingTasks: Task[];
  private readonly processingTasks: Set<string>;
  private readonly completedTasks: number;
  private readonly failedTasks: number;
  private totalProcessingTime: number;

  constructor(config: QueueConfig) {
    super();
    this.config = config;
    this.tasks = new Map();
    this.pendingTasks = [];
    this.processingTasks = new Set();
    this.completedTasks = 0;
    this.failedTasks = 0;
    this.totalProcessingTime = 0;
  }

  async enqueue(task: Task): Promise<void> {
    if (this.tasks.size >= this.config.maxSize) {
      throw new Error(`Queue '${this.config.name}' is full`);
    }

    this.tasks.set(task.id, task);
    
    // Insert task based on priority and type
    const insertIndex = this.findInsertIndex(task);
    this.pendingTasks.splice(insertIndex, 0, task);

    this.emit('task-enqueued', { taskId: task.id, queueSize: this.tasks.size });
  }

  async dequeue(): Promise<Task | null> {
    if (this.pendingTasks.length === 0) {
      return null;
    }

    const task = this.pendingTasks.shift()!;
    this.processingTasks.add(task.id);

    this.emit('task-dequeued', { taskId: task.id });
    return task;
  }

  async getTask(taskId: string): Promise<Task | null> {
    return this.tasks.get(taskId) || null;
  }

  async removeTask(taskId: string): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task) {return false;}

    // Remove from pending queue
    const pendingIndex = this.pendingTasks.findIndex(t => t.id === taskId);
    if (pendingIndex !== -1) {
      this.pendingTasks.splice(pendingIndex, 1);
    }

    // Remove from processing set
    this.processingTasks.delete(taskId);

    // Remove from tasks map
    this.tasks.delete(taskId);

    this.emit('task-removed', { taskId });
    return true;
  }

  getMetrics(): QueueMetrics {
    const processing = this.processingTasks.size;
    const completed = this.completedTasks;
    const failed = this.failedTasks;
    const totalTasks = completed + failed;

    return {
      name: this.config.name,
      size: this.pendingTasks.length,
      processing,
      completed,
      failed,
      avgProcessingTime: totalTasks > 0 ? this.totalProcessingTime / totalTasks : 0,
      throughput: 0, // Would be calculated based on time window
      errorRate: totalTasks > 0 ? (failed / totalTasks) * 100 : 0,
      retryRate: 0 // Would be calculated based on retry attempts
    };
  }

  private findInsertIndex(newTask: Task): number {
    // Insert based on priority (higher priority first), then FIFO for same priority
    for (let i = 0; i < this.pendingTasks.length; i++) {
      const existing = this.pendingTasks[i];
      
      if (newTask.priority > existing.priority) {
        return i;
      }
      
      if (newTask.priority === existing.priority) {
        // For same priority, maintain FIFO unless it's a delayed queue
        if (this.config.type === QueueType.DELAYED && newTask.scheduledAt && existing.scheduledAt) {
          if (newTask.scheduledAt < existing.scheduledAt) {
            return i;
          }
        } else if (this.config.type !== QueueType.PRIORITY) {
          // For non-priority queues with same priority, just append
          continue;
        }
      }
    }
    
    return this.pendingTasks.length;
  }
}