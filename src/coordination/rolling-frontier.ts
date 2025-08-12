/**
 * Rolling Frontier Manager - Main coordination system for dynamic wave management
 * Integrates dependency tracking, boundary calculation, and real-time optimization
 */

import {
  Task,
  WaveState,
  TeamCapacity,
  FrontierState,
  FrontierMetrics,
  WaveBoundary,
  DependencyNode,
  DependencyState,
  FrontierOptimization,
  FrontierAction,
  OptimizationUrgency,
  FrontierCalculationError,
  DependencyViolationError,
  CapacityOverflowError,
  OptimizationConflictError
} from '../types';

import { DependencyTracker, DependencyInjectable } from './dependency-tracker';
import { FrontierCalculator, BoundaryConstraints, OptimizationObjectives, FrontierCalculatorDeps } from './frontier-calculator';

export interface RollingFrontierConfig {
  updateInterval: number; // milliseconds
  optimizationThreshold: number; // 0-1, trigger optimization when efficiency drops below
  maxWaveLookahead: number; // how many waves to plan ahead
  adaptiveBoundaries: boolean; // enable dynamic boundary adjustment
  realTimePromotions: boolean; // enable automatic task promotion
  rollbackOnFailure: boolean; // rollback frontier on optimization failure
}

export interface RollingFrontierDeps extends DependencyInjectable, FrontierCalculatorDeps {
  // Combined dependencies for all components
  saveState(state: FrontierState): Promise<void>;
  loadState(): Promise<FrontierState | null>;
  notifyStateChange(event: string, data: Record<string, unknown>): Promise<void>;
  getCurrentTasks(): Promise<Task[]>;
  updateWaveState(waveState: WaveState): Promise<void>;
}

export interface FrontierEvent {
  type: 'boundary_adjusted' | 'task_promoted' | 'optimization_applied' | 'rollback_executed' | 'frontier_initialized' | 'frontier_shutdown';
  timestamp: Date;
  data: Record<string, unknown>;
  impact: {
    tasksAffected: string[];
    teamsAffected: string[];
    estimatedTimeChange: number;
  };
}

export class RollingFrontier {
  private dependencyTracker: DependencyTracker;
  private frontierCalculator: FrontierCalculator;
  private frontierState: FrontierState;
  private updateTimer: NodeJS.Timeout | null = null;
  private isOptimizing = false;
  private eventHistory: FrontierEvent[] = [];
  private rollbackStack: FrontierState[] = [];

  private readonly DEFAULT_CONFIG: RollingFrontierConfig = {
    updateInterval: 30000, // 30 seconds
    optimizationThreshold: 0.7,
    maxWaveLookahead: 3,
    adaptiveBoundaries: true,
    realTimePromotions: true,
    rollbackOnFailure: true
  };

  constructor(
    private deps: RollingFrontierDeps,
    private config: RollingFrontierConfig = {} as RollingFrontierConfig,
    constraints?: BoundaryConstraints,
    objectives?: OptimizationObjectives
  ) {
    this.config = { ...this.DEFAULT_CONFIG, ...config };
    this.dependencyTracker = new DependencyTracker(deps);
    this.frontierCalculator = new FrontierCalculator(deps, constraints, objectives);
    
    this.frontierState = {
      currentBoundaries: [],
      metrics: this.createInitialMetrics(),
      optimizations: [],
      dependencyGraph: new Map(),
      teamCapacities: new Map(),
      lastUpdate: new Date(),
      coordinationVersion: 1
    };
  }

  /**
   * Initialize the rolling frontier system
   */
  async initialize(tasks: Task[], teamCapacities: TeamCapacity[]): Promise<void> {
    try {
      this.deps.logInfo('Initializing Rolling Frontier', {
        taskCount: tasks.length,
        teamCount: teamCapacities.length,
        config: this.config
      });

      // Load previous state if available
      const savedState = await this.deps.loadState();
      if (savedState) {
        // Restore Maps from serialized data
        this.frontierState = {
          ...savedState,
          dependencyGraph: new Map(Array.isArray(savedState.dependencyGraph) ? 
            savedState.dependencyGraph : Object.entries(savedState.dependencyGraph || {})),
          teamCapacities: new Map(Array.isArray(savedState.teamCapacities) ? 
            savedState.teamCapacities : Object.entries(savedState.teamCapacities || {}))
        };
        this.deps.logInfo('Restored frontier state', {
          version: savedState.coordinationVersion,
          boundaryCount: savedState.currentBoundaries.length
        });
      }

      // Initialize dependency tracker
      this.dependencyTracker.initializeGraph(tasks);
      this.frontierState.dependencyGraph = this.dependencyTracker.getGraph();

      // Initialize team capacities
      this.initializeTeamCapacities(teamCapacities);

      // Calculate initial boundaries
      await this.recalculateBoundaries(tasks);

      // Start real-time updates if enabled
      if (this.config.adaptiveBoundaries) {
        this.startRealTimeUpdates();
      }

      // Save initial state
      await this.saveCurrentState();

      this.deps.logInfo('Rolling Frontier initialized successfully', {
        boundaryCount: this.frontierState.currentBoundaries.length,
        readyTasks: this.dependencyTracker.getReadyTasks().length
      });

      await this.notifyEvent('frontier_initialized', {
        taskCount: tasks.length,
        boundaryCount: this.frontierState.currentBoundaries.length
      });

    } catch (error) {
      const initError = new FrontierCalculationError(
        `Failed to initialize Rolling Frontier: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {
          taskCount: tasks.length,
          teamCount: teamCapacities.length
        },
        false
      );

      this.deps.logError('Rolling Frontier initialization failed', initError);
      throw initError;
    }
  }

  /**
   * Process task state change and update frontier accordingly
   */
  async processTaskStateChange(
    taskId: string, 
    newState: DependencyState,
    context?: Record<string, unknown>
  ): Promise<string[]> {
    try {
      this.deps.logInfo('Processing task state change', {
        taskId,
        newState: DependencyState[newState],
        context
      });

      // Create rollback point
      if (this.config.rollbackOnFailure) {
        this.createRollbackPoint();
      }

      // Update dependency tracker
      const newlyReadyTasks = this.dependencyTracker.updateTaskState(taskId, newState);

      // Update frontier state
      this.updateFrontierMetrics();
      this.frontierState.lastUpdate = this.deps.getCurrentTime();
      this.frontierState.coordinationVersion++;

      // Handle newly ready tasks
      if (newlyReadyTasks.length > 0 && this.config.realTimePromotions) {
        const promotions = await this.handleTaskPromotions(newlyReadyTasks);
        
        if (promotions.length > 0) {
          await this.notifyEvent('task_promoted', {
            promotedTasks: newlyReadyTasks,
            promotions: promotions.map(p => ({ action: FrontierAction[p.action], target: p.target }))
          });
        }
      }

      // Check if optimization is needed
      if (this.shouldOptimize()) {
        await this.runOptimization();
      }

      // Save state
      await this.saveCurrentState();

      this.deps.logInfo('Task state change processed', {
        taskId,
        newlyReadyTasks: newlyReadyTasks.length,
        currentMetrics: this.frontierState.metrics
      });

      return newlyReadyTasks;

    } catch (error) {
      if (this.config.rollbackOnFailure) {
        await this.rollbackToLastKnownGood();
      }

      const stateError = new FrontierCalculationError(
        `Failed to process task state change: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { taskId, newState: DependencyState[newState], context },
        true
      );

      this.deps.logError('Task state change processing failed', stateError);
      throw stateError;
    }
  }

  /**
   * Force boundary recalculation (useful for external triggers)
   */
  async recalculateBoundaries(tasks?: Task[]): Promise<WaveBoundary[]> {
    try {
      this.deps.logInfo('Recalculating wave boundaries', {
        taskCount: tasks?.length || 'using existing',
        currentBoundaries: this.frontierState.currentBoundaries.length
      });

      if (!tasks) {
        tasks = await this.deps.getCurrentTasks();
      }

      // Create rollback point
      if (this.config.rollbackOnFailure) {
        this.createRollbackPoint();
      }

      const currentWave = this.getCurrentWave();
      
      // Ensure some tasks are ready for boundary calculation
      const readyTasks = this.dependencyTracker.getReadyTasks();
      for (const taskId of readyTasks.slice(0, Math.min(3, readyTasks.length))) {
        this.dependencyTracker.updateTaskState(taskId, DependencyState.READY);
      }
      
      // Update dependency graph after state changes
      this.frontierState.dependencyGraph = this.dependencyTracker.getGraph();
      
      // Calculate new boundaries
      const newBoundaries = this.frontierCalculator.calculateOptimalBoundaries(
        tasks,
        this.frontierState.dependencyGraph,
        this.frontierState.teamCapacities,
        currentWave
      );

      // Validate boundaries don't violate constraints
      this.validateBoundaries(newBoundaries);

      // Update state
      const oldBoundaries = [...this.frontierState.currentBoundaries];
      this.frontierState.currentBoundaries = newBoundaries;
      this.frontierState.lastUpdate = this.deps.getCurrentTime();
      this.frontierState.coordinationVersion++;

      // Update metrics
      this.updateFrontierMetrics();

      // Save state
      await this.saveCurrentState();

      // Notify of boundary change
      await this.notifyEvent('boundary_adjusted', {
        oldBoundaryCount: oldBoundaries.length,
        newBoundaryCount: newBoundaries.length,
        wavesAffected: this.calculateWavesAffected(oldBoundaries, newBoundaries)
      });

      this.deps.logInfo('Boundaries recalculated successfully', {
        newBoundaryCount: newBoundaries.length,
        totalTasks: newBoundaries.reduce((sum, b) => sum + b.tasks.length, 0)
      });

      return newBoundaries;

    } catch (error) {
      if (this.config.rollbackOnFailure) {
        await this.rollbackToLastKnownGood();
      }

      const recalcError = new FrontierCalculationError(
        `Boundary recalculation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { taskCount: tasks?.length },
        true
      );

      this.deps.logError('Boundary recalculation failed', recalcError);
      throw recalcError;
    }
  }

  /**
   * Get current frontier state (immutable copy)
   */
  getFrontierState(): FrontierState {
    return {
      currentBoundaries: this.frontierState.currentBoundaries.map(b => ({ ...b, tasks: [...b.tasks], teams: [...b.teams] })),
      metrics: { ...this.frontierState.metrics, bottleneckTeams: [...this.frontierState.metrics.bottleneckTeams] },
      optimizations: this.frontierState.optimizations.map(o => ({ ...o })),
      dependencyGraph: new Map(this.frontierState.dependencyGraph),
      teamCapacities: new Map(this.frontierState.teamCapacities),
      lastUpdate: new Date(this.frontierState.lastUpdate),
      coordinationVersion: this.frontierState.coordinationVersion
    };
  }

  /**
   * Get optimization recommendations
   */
  async getOptimizationRecommendations(): Promise<FrontierOptimization[]> {
    try {
      const optimizations = this.frontierCalculator.generateOptimizations(
        this.frontierState.currentBoundaries,
        this.frontierState.dependencyGraph,
        this.frontierState.teamCapacities,
        {
          averageVelocity: this.frontierState.metrics.averageVelocity,
          throughput: this.frontierState.metrics.throughput,
          coordinationOverhead: this.frontierState.metrics.coordinationOverhead,
          blockedTaskCount: this.frontierState.metrics.blockedTasks
        }
      );

      // Filter by urgency threshold
      const urgentOptimizations = optimizations.filter(opt => 
        opt.urgency >= OptimizationUrgency.MEDIUM
      );

      this.deps.logInfo('Generated optimization recommendations', {
        totalOptimizations: optimizations.length,
        urgentOptimizations: urgentOptimizations.length
      });

      return urgentOptimizations;

    } catch (error) {
      const optError = new FrontierCalculationError(
        `Failed to generate optimization recommendations: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {},
        true
      );

      this.deps.logError('Optimization recommendation generation failed', optError);
      throw optError;
    }
  }

  /**
   * Apply a specific optimization
   */
  async applyOptimization(optimization: FrontierOptimization): Promise<boolean> {
    try {
      this.deps.logInfo('Applying optimization', {
        action: FrontierAction[optimization.action],
        target: optimization.target,
        confidence: optimization.confidence
      });

      // Create rollback point
      if (this.config.rollbackOnFailure) {
        this.createRollbackPoint();
      }

      let success = false;

      switch (optimization.action) {
        case FrontierAction.PROMOTE_TASK:
          success = await this.promoteTask(optimization.target);
          break;
        case FrontierAction.DELAY_TASK:
          success = await this.delayTask(optimization.target);
          break;
        case FrontierAction.REASSIGN_TASK:
          success = await this.reassignTask(optimization.target, optimization.reason);
          break;
        case FrontierAction.SPLIT_WAVE:
          success = await this.splitWave(parseInt(optimization.target));
          break;
        case FrontierAction.MERGE_WAVES:
          success = await this.mergeWaves(optimization.target);
          break;
        case FrontierAction.ADJUST_CAPACITY:
          success = await this.adjustCapacity(optimization.target, optimization.impact);
          break;
        default:
          this.deps.logWarning('Unknown optimization action', { action: optimization.action });
          success = false;
      }

      if (success) {
        // Update state
        this.frontierState.lastUpdate = this.deps.getCurrentTime();
        this.frontierState.coordinationVersion++;
        this.updateFrontierMetrics();

        // Remove applied optimization
        this.frontierState.optimizations = this.frontierState.optimizations.filter(
          opt => opt.target !== optimization.target || opt.action !== optimization.action
        );

        await this.saveCurrentState();

        await this.notifyEvent('optimization_applied', {
          optimization: {
            action: FrontierAction[optimization.action],
            target: optimization.target,
            confidence: optimization.confidence
          }
        });

        this.deps.logInfo('Optimization applied successfully', {
          action: FrontierAction[optimization.action],
          target: optimization.target
        });
      } else {
        this.deps.logWarning('Optimization application failed', {
          action: FrontierAction[optimization.action],
          target: optimization.target
        });

        if (this.config.rollbackOnFailure) {
          await this.rollbackToLastKnownGood();
        }
      }

      return success;

    } catch (error) {
      if (this.config.rollbackOnFailure) {
        await this.rollbackToLastKnownGood();
      }

      const applyError = new FrontierCalculationError(
        `Failed to apply optimization: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {
          action: FrontierAction[optimization.action],
          target: optimization.target
        },
        true
      );

      this.deps.logError('Optimization application failed', applyError);
      throw applyError;
    }
  }

  /**
   * Shutdown the rolling frontier system
   */
  async shutdown(): Promise<void> {
    try {
      this.deps.logInfo('Shutting down Rolling Frontier', {
        version: this.frontierState.coordinationVersion,
        eventCount: this.eventHistory.length
      });

      // Stop real-time updates
      if (this.updateTimer) {
        clearInterval(this.updateTimer);
        this.updateTimer = null;
      }

      // Save final state
      await this.saveCurrentState();

      await this.notifyEvent('frontier_shutdown', {
        finalVersion: this.frontierState.coordinationVersion,
        totalEvents: this.eventHistory.length
      });

      this.deps.logInfo('Rolling Frontier shutdown complete', {});

    } catch (error) {
      this.deps.logError('Error during shutdown', error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Initialize team capacities
   */
  private initializeTeamCapacities(teamCapacities: TeamCapacity[]): void {
    this.frontierState.teamCapacities.clear();
    
    for (const capacity of teamCapacities) {
      this.frontierState.teamCapacities.set(capacity.team, { ...capacity });
    }

    this.deps.logInfo('Team capacities initialized', {
      teamCount: teamCapacities.length,
      totalCapacity: teamCapacities.reduce((sum, t) => sum + t.maxConcurrentTasks, 0)
    });
  }

  /**
   * Create initial metrics structure
   */
  private createInitialMetrics(): FrontierMetrics {
    return {
      currentWave: 1,
      activeTasks: 0,
      completedTasks: 0,
      blockedTasks: 0,
      averageVelocity: 0,
      throughput: 0,
      coordinationOverhead: 0,
      bottleneckTeams: [],
      criticalPathDelay: 0,
      predictedCompletionTime: new Date()
    };
  }

  /**
   * Update frontier metrics based on current state
   */
  private updateFrontierMetrics(): void {
    const metrics = this.frontierState.metrics;
    const now = this.deps.getCurrentTime();

    // Count tasks by state
    let activeTasks = 0;
    let completedTasks = 0;
    let blockedTasks = 0;

    for (const [, node] of this.frontierState.dependencyGraph) {
      switch (node.state) {
        case DependencyState.IN_PROGRESS:
          activeTasks++;
          break;
        case DependencyState.COMPLETED:
          completedTasks++;
          break;
        case DependencyState.BLOCKED:
          blockedTasks++;
          break;
      }
    }

    // Calculate current wave
    const currentWave = Math.max(1, ...this.frontierState.currentBoundaries.map(b => b.waveNumber));

    // Update metrics
    metrics.currentWave = currentWave;
    metrics.activeTasks = activeTasks;
    metrics.completedTasks = completedTasks;
    metrics.blockedTasks = blockedTasks;

    // Calculate throughput and velocity (simplified)
    const totalTasks = this.frontierState.dependencyGraph.size;
    if (totalTasks > 0) {
      metrics.throughput = completedTasks / Math.max(1, totalTasks);
    }

    // Identify bottleneck teams
    metrics.bottleneckTeams = this.identifyBottleneckTeams();

    // Update prediction
    metrics.predictedCompletionTime = this.calculatePredictedCompletion();
  }

  /**
   * Identify teams that are bottlenecks
   */
  private identifyBottleneckTeams(): string[] {
    const teamLoads = this.frontierCalculator.calculateLoadBalancing(
      this.frontierState.currentBoundaries,
      this.frontierState.teamCapacities,
      this.frontierState.dependencyGraph
    );

    // Teams with load > 0.9 are considered bottlenecks
    const bottlenecks: string[] = [];
    for (const [team, load] of teamLoads) {
      if (load > 0.9) {
        bottlenecks.push(team);
      }
    }

    return bottlenecks;
  }

  /**
   * Calculate predicted completion time
   */
  private calculatePredictedCompletion(): Date {
    const now = this.deps.getCurrentTime();
    const remainingWork = this.frontierState.dependencyGraph.size - this.frontierState.metrics.completedTasks;
    
    // Simple prediction based on current throughput
    const avgThroughput = Math.max(0.1, this.frontierState.metrics.throughput);
    const estimatedDays = remainingWork / avgThroughput;
    
    return new Date(now.getTime() + estimatedDays * 24 * 60 * 60 * 1000);
  }

  /**
   * Start real-time update timer
   */
  private startRealTimeUpdates(): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
    }

    this.updateTimer = setInterval(async () => {
      if (!this.isOptimizing) {
        try {
          await this.performPeriodicUpdate();
        } catch (error) {
          this.deps.logError('Periodic update failed', error instanceof Error ? error : new Error(String(error)));
        }
      }
    }, this.config.updateInterval);

    this.deps.logInfo('Real-time updates started', {
      interval: this.config.updateInterval
    });
  }

  /**
   * Perform periodic optimization check
   */
  private async performPeriodicUpdate(): Promise<void> {
    this.updateFrontierMetrics();

    if (this.shouldOptimize()) {
      await this.runOptimization();
    }

    // Check for automatic promotions
    if (this.config.realTimePromotions) {
      const readyTasks = this.dependencyTracker.getReadyTasks();
      if (readyTasks.length > 0) {
        await this.handleTaskPromotions(readyTasks);
      }
    }

    await this.saveCurrentState();
  }

  /**
   * Check if optimization should be triggered
   */
  private shouldOptimize(): boolean {
    const metrics = this.frontierState.metrics;
    
    // Optimize if efficiency below threshold
    if (metrics.throughput < this.config.optimizationThreshold) {
      return true;
    }

    // Optimize if bottlenecks detected
    if (metrics.bottleneckTeams.length > 0) {
      return true;
    }

    // Optimize if too many blocked tasks
    const blockedRatio = metrics.blockedTasks / Math.max(1, this.frontierState.dependencyGraph.size);
    if (blockedRatio > 0.3) {
      return true;
    }

    return false;
  }

  /**
   * Run the optimization process
   */
  private async runOptimization(): Promise<void> {
    if (this.isOptimizing) {
      return; // Already optimizing
    }

    this.isOptimizing = true;

    try {
      this.deps.logInfo('Running frontier optimization', {
        currentMetrics: this.frontierState.metrics
      });

      const optimizations = await this.getOptimizationRecommendations();
      
      // Apply high-confidence, high-urgency optimizations automatically
      for (const opt of optimizations) {
        if (opt.confidence > 0.8 && opt.urgency >= OptimizationUrgency.HIGH) {
          await this.applyOptimization(opt);
        }
      }

      // Store remaining optimizations for manual review
      this.frontierState.optimizations = optimizations.filter(opt => 
        opt.confidence <= 0.8 || opt.urgency < OptimizationUrgency.HIGH
      );

    } finally {
      this.isOptimizing = false;
    }
  }

  /**
   * Handle task promotions when dependencies are resolved
   */
  private async handleTaskPromotions(readyTasks: string[]): Promise<FrontierOptimization[]> {
    const promotions: FrontierOptimization[] = [];

    for (const taskId of readyTasks) {
      const node = this.frontierState.dependencyGraph.get(taskId);
      if (!node) {continue;}

      // Check if task can be promoted to earlier wave
      const currentWave = node.wave;
      const earliestWave = this.findEarliestPossibleWave(taskId);

      if (earliestWave < currentWave) {
        const promotion: FrontierOptimization = {
          action: FrontierAction.PROMOTE_TASK,
          target: taskId,
          reason: `Dependencies resolved, can execute in wave ${earliestWave} instead of ${currentWave}`,
          impact: {
            throughputChange: 1,
            delayReduction: (currentWave - earliestWave) * 7, // Assume 7 days per wave
            resourceEfficiency: 0.1,
            riskLevel: 0.1
          },
          confidence: 0.9,
          urgency: OptimizationUrgency.HIGH
        };

        promotions.push(promotion);
        await this.applyOptimization(promotion);
      }
    }

    return promotions;
  }

  /**
   * Find the earliest wave a task can be executed in
   */
  private findEarliestPossibleWave(taskId: string): number {
    const node = this.frontierState.dependencyGraph.get(taskId);
    if (!node) {return 1;}

    let maxDepWave = 0;
    for (const depId of node.dependsOn) {
      const depNode = this.frontierState.dependencyGraph.get(depId);
      if (depNode && depNode.state !== DependencyState.COMPLETED) {
        maxDepWave = Math.max(maxDepWave, depNode.wave);
      }
    }

    return maxDepWave + 1;
  }

  /**
   * Get current active wave number
   */
  private getCurrentWave(): number {
    if (this.frontierState.currentBoundaries.length === 0) {
      return 1;
    }

    return Math.min(...this.frontierState.currentBoundaries.map(b => b.waveNumber));
  }

  /**
   * Validate that boundaries don't violate constraints
   */
  private validateBoundaries(boundaries: WaveBoundary[]): void {
    for (const boundary of boundaries) {
      // Check wave size constraint
      if (boundary.tasks.length > this.config.maxWaveLookahead * 10) { // Simplified constraint
        throw new FrontierCalculationError(
          `Wave ${boundary.waveNumber} exceeds maximum size`,
          { waveNumber: boundary.waveNumber, taskCount: boundary.tasks.length },
          true
        );
      }

      // Check team capacity constraints
      for (const team of boundary.teams) {
        const capacity = this.frontierState.teamCapacities.get(team);
        if (!capacity) {
          throw new CapacityOverflowError(
            `Team ${team} not found in capacity map`,
            team,
            0,
            0
          );
        }

        const teamTasks = boundary.tasks.filter(taskId => {
          const node = this.frontierState.dependencyGraph.get(taskId);
          return node?.team === team;
        }).length;

        if (teamTasks > capacity.maxConcurrentTasks) {
          throw new CapacityOverflowError(
            `Wave ${boundary.waveNumber} assigns too many tasks to team ${team}`,
            team,
            teamTasks,
            capacity.maxConcurrentTasks
          );
        }
      }
    }
  }

  /**
   * Calculate which waves are affected by boundary changes
   */
  private calculateWavesAffected(oldBoundaries: WaveBoundary[], newBoundaries: WaveBoundary[]): number[] {
    const affectedWaves = new Set<number>();
    
    // Add old wave numbers
    for (const boundary of oldBoundaries) {
      affectedWaves.add(boundary.waveNumber);
    }

    // Add new wave numbers
    for (const boundary of newBoundaries) {
      affectedWaves.add(boundary.waveNumber);
    }

    return Array.from(affectedWaves).sort((a, b) => a - b);
  }

  /**
   * Create a rollback point
   */
  private createRollbackPoint(): void {
    // Keep only last 5 rollback points
    if (this.rollbackStack.length >= 5) {
      this.rollbackStack.shift();
    }

    // Deep copy current state
    const rollbackState: FrontierState = {
      currentBoundaries: this.frontierState.currentBoundaries.map(b => ({
        ...b,
        tasks: [...b.tasks],
        teams: [...b.teams]
      })),
      metrics: { 
        ...this.frontierState.metrics,
        bottleneckTeams: [...this.frontierState.metrics.bottleneckTeams]
      },
      optimizations: this.frontierState.optimizations.map(o => ({ ...o })),
      dependencyGraph: new Map(this.frontierState.dependencyGraph),
      teamCapacities: new Map(this.frontierState.teamCapacities),
      lastUpdate: new Date(this.frontierState.lastUpdate),
      coordinationVersion: this.frontierState.coordinationVersion
    };

    this.rollbackStack.push(rollbackState);
  }

  /**
   * Rollback to last known good state
   */
  private async rollbackToLastKnownGood(): Promise<void> {
    if (this.rollbackStack.length === 0) {
      this.deps.logWarning('No rollback state available', {});
      return;
    }

    const rollbackState = this.rollbackStack.pop()!;
    this.frontierState = rollbackState;

    await this.saveCurrentState();

    await this.notifyEvent('rollback_executed', {
      rolledBackToVersion: rollbackState.coordinationVersion,
      timestamp: rollbackState.lastUpdate
    });

    this.deps.logWarning('Rolled back to previous state', {
      version: rollbackState.coordinationVersion,
      timestamp: rollbackState.lastUpdate
    });
  }

  /**
   * Save current state
   */
  private async saveCurrentState(): Promise<void> {
    try {
      await this.deps.saveState(this.frontierState);
    } catch (error) {
      this.deps.logError('Failed to save frontier state', error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Notify about frontier events
   */
  private async notifyEvent(type: FrontierEvent['type'], data: Record<string, unknown>): Promise<void> {
    const event: FrontierEvent = {
      type,
      timestamp: this.deps.getCurrentTime(),
      data,
      impact: {
        tasksAffected: [], // Would be calculated based on event type
        teamsAffected: [],
        estimatedTimeChange: 0
      }
    };

    this.eventHistory.push(event);

    // Keep only last 100 events
    if (this.eventHistory.length > 100) {
      this.eventHistory.shift();
    }

    try {
      await this.deps.notifyStateChange(type, { ...data, event });
    } catch (error) {
      this.deps.logError('Failed to notify state change', error instanceof Error ? error : new Error(String(error)));
    }
  }

  // Placeholder implementations for optimization actions
  private async promoteTask(taskId: string): Promise<boolean> {
    // Implementation would move task to earlier wave
    return true; // Placeholder
  }

  private async delayTask(taskId: string): Promise<boolean> {
    // Implementation would move task to later wave
    return true; // Placeholder
  }

  private async reassignTask(taskId: string, reason: string): Promise<boolean> {
    // Implementation would reassign task to different team
    return true; // Placeholder
  }

  private async splitWave(waveNumber: number): Promise<boolean> {
    // Implementation would split large wave into smaller ones
    return true; // Placeholder
  }

  private async mergeWaves(waveCriteria: string): Promise<boolean> {
    // Implementation would merge compatible waves
    return true; // Placeholder
  }

  private async adjustCapacity(team: string, impact: any): Promise<boolean> {
    // Implementation would adjust team capacity
    return true; // Placeholder
  }
}