/**
 * Enhanced Wave Coordinator with Rolling Frontier Integration
 * Combines intelligent work stealing with dynamic frontier management
 */

import {
  WaveState,
  Task,
  TeamCapacity,
  FrontierState,
  DependencyState,
  FrontierOptimization,
  FrontierAction,
  WorkStealingConfig,
  WorkStealingError,
  FrontierCalculationError,
  OptimizationUrgency
} from '../types';

import { WaveCoordinator, CoordinatorDependencies } from '../core/coordinator';
import { RollingFrontier, RollingFrontierConfig, RollingFrontierDeps } from './rolling-frontier';

export interface EnhancedCoordinatorDependencies extends CoordinatorDependencies {
  // Additional dependencies for frontier management
  getTeamCapacities: () => Promise<TeamCapacity[]>;
  saveFrontierState: (state: FrontierState) => Promise<void>;
  loadFrontierState: () => Promise<FrontierState | null>;
  notifyFrontierEvent: (event: string, data: Record<string, unknown>) => Promise<void>;
  getCurrentTasks: () => Promise<Task[]>;
  
  // Task state management
  updateTaskState: (taskId: string, state: DependencyState, context?: Record<string, unknown>) => Promise<void>;
  getTaskState: (taskId: string) => Promise<DependencyState>;
}

export interface EnhancedCoordinationResult {
  success: boolean;
  waveReady: boolean;
  workStealingActive: boolean;
  frontierActive: boolean;
  transfersExecuted: number;
  optimizationsApplied: number;
  utilizationImprovement: number;
  frontierMetrics: {
    currentWave: number;
    activeTasks: number;
    readyTasks: number;
    blockedTasks: number;
    predictedCompletion: Date;
  };
  errors: string[];
  recommendations: string[];
  frontierOptimizations: FrontierOptimization[];
}

export class EnhancedWaveCoordinator {
  private baseCoordinator: WaveCoordinator;
  private rollingFrontier: RollingFrontier;
  private frontierInitialized = false;

  constructor(
    private readonly deps: EnhancedCoordinatorDependencies,
    workStealingConfig?: Partial<WorkStealingConfig>,
    frontierConfig?: Partial<RollingFrontierConfig>
  ) {
    // Initialize base coordinator with work stealing
    this.baseCoordinator = new WaveCoordinator(deps, workStealingConfig);

    // Create rolling frontier dependencies
    const frontierDeps: RollingFrontierDeps = {
      // Time and logging
      getCurrentTime: () => new Date(),
      logInfo: (message, context) => console.log(`[Frontier] ${message}`, context),
      logWarning: (message, context) => console.warn(`[Frontier] ${message}`, context),
      logError: (message, error) => console.error(`[Frontier] ${message}`, error),

      // State persistence
      saveState: this.deps.saveFrontierState,
      loadState: this.deps.loadFrontierState,
      notifyStateChange: this.deps.notifyFrontierEvent,

      // Task and wave management
      getCurrentTasks: () => this.deps.getCurrentTasks(),
      updateWaveState: this.deps.updateWaveState
    };

    // Initialize rolling frontier with proper defaults
    const finalFrontierConfig = frontierConfig ? {
      updateInterval: 30000,
      optimizationThreshold: 0.7,
      maxWaveLookahead: 3,
      adaptiveBoundaries: true,
      realTimePromotions: true,
      rollbackOnFailure: true,
      ...frontierConfig
    } : undefined;
    
    this.rollingFrontier = new RollingFrontier(frontierDeps, finalFrontierConfig);
  }

  /**
   * Initialize the enhanced coordinator system
   */
  async initialize(): Promise<void> {
    try {
      // Get current tasks and team capacities
      const tasks = await this.deps.getCurrentTasks();
      const teamCapacities = await this.deps.getTeamCapacities();

      // Initialize rolling frontier
      await this.rollingFrontier.initialize(tasks, teamCapacities);
      this.frontierInitialized = true;

      console.log('[EnhancedCoordinator] System initialized successfully', {
        taskCount: tasks.length,
        teamCount: teamCapacities.length,
        frontierActive: true
      });

    } catch (error) {
      const initError = new FrontierCalculationError(
        `Enhanced coordinator initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {},
        false
      );

      console.error('[EnhancedCoordinator] Initialization failed', initError);
      throw initError;
    }
  }

  /**
   * Enhanced wave coordination with frontier management
   */
  async coordinateWave(): Promise<EnhancedCoordinationResult> {
    const result: EnhancedCoordinationResult = {
      success: false,
      waveReady: false,
      workStealingActive: false,
      frontierActive: this.frontierInitialized,
      transfersExecuted: 0,
      optimizationsApplied: 0,
      utilizationImprovement: 0,
      frontierMetrics: {
        currentWave: 1,
        activeTasks: 0,
        readyTasks: 0,
        blockedTasks: 0,
        predictedCompletion: new Date()
      },
      errors: [],
      recommendations: [],
      frontierOptimizations: []
    };

    try {
      // Ensure system is initialized
      if (!this.frontierInitialized) {
        await this.initialize();
      }

      // Run base coordination (work stealing and traditional logic)
      const baseResult = await this.baseCoordinator.coordinateWave();
      
      // Copy base results
      result.waveReady = baseResult.waveReady;
      result.workStealingActive = baseResult.workStealingActive;
      result.transfersExecuted = baseResult.transfersExecuted;
      result.utilizationImprovement = baseResult.utilizationImprovement;
      result.errors.push(...baseResult.errors);
      result.recommendations.push(...baseResult.recommendations);

      // Run frontier coordination if enabled
      if (this.frontierInitialized) {
        const frontierResult = await this.coordinateFrontier();
        
        result.optimizationsApplied = frontierResult.optimizationsApplied;
        result.frontierMetrics = frontierResult.metrics;
        result.frontierOptimizations = frontierResult.optimizations;
        result.errors.push(...frontierResult.errors);
        result.recommendations.push(...frontierResult.recommendations);

        // Integrate frontier recommendations with work stealing
        await this.integrateOptimizations(frontierResult.optimizations);
      }

      result.success = result.errors.length === 0;
      return result;

    } catch (error) {
      result.errors.push(`Enhanced coordination failed: ${error instanceof Error ? error.message : String(error)}`);
      return result;
    }
  }

  /**
   * Process task state change through both systems
   */
  async processTaskStateChange(
    taskId: string,
    newState: DependencyState,
    context?: Record<string, unknown>
  ): Promise<string[]> {
    const results: string[] = [];

    try {
      // Update task state in persistent storage
      await this.deps.updateTaskState(taskId, newState, context);

      // Process through frontier system if initialized
      if (this.frontierInitialized) {
        const frontierResults = await this.rollingFrontier.processTaskStateChange(
          taskId,
          newState,
          context
        );
        results.push(...frontierResults);

        // Update wave state based on frontier changes
        const frontierState = this.rollingFrontier.getFrontierState();
        await this.syncWaveStateWithFrontier(frontierState);
      }

      return results;

    } catch (error) {
      const stateError = new FrontierCalculationError(
        `Failed to process task state change: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { taskId, newState: DependencyState[newState], context },
        true
      );

      console.error('[EnhancedCoordinator] Task state change failed', stateError);
      throw stateError;
    }
  }

  /**
   * Get comprehensive system status
   */
  async getSystemStatus(): Promise<{
    coordination: EnhancedCoordinationResult;
    frontierState: FrontierState;
    recommendations: FrontierOptimization[];
  }> {
    const coordination = await this.coordinateWave();
    const frontierState = this.frontierInitialized ? 
      this.rollingFrontier.getFrontierState() : 
      this.createEmptyFrontierState();
    const recommendations = this.frontierInitialized ?
      await this.rollingFrontier.getOptimizationRecommendations() :
      [];

    return {
      coordination,
      frontierState,
      recommendations
    };
  }

  /**
   * Manual task claiming with frontier integration
   */
  async claimTask(taskId: string, claimingTeam: string): Promise<boolean> {
    try {
      // First attempt through base coordinator (work stealing)
      const claimed = await this.baseCoordinator.claimTask(taskId, claimingTeam);

      if (claimed && this.frontierInitialized) {
        // Update frontier state to reflect the claim
        await this.processTaskStateChange(taskId, DependencyState.IN_PROGRESS, {
          claimedBy: claimingTeam,
          claimTime: new Date().toISOString()
        });
      }

      return claimed;

    } catch (error) {
      console.error(`[EnhancedCoordinator] Failed to claim task ${taskId}:`, error);
      throw error;
    }
  }

  /**
   * Manual task release with frontier integration
   */
  async releaseTask(taskId: string, releasingTeam: string): Promise<string> {
    try {
      // Release through base coordinator
      const newTeam = await this.baseCoordinator.releaseTask(taskId, releasingTeam);

      if (this.frontierInitialized) {
        // Update frontier state to reflect the release
        const newState = newTeam === releasingTeam ? 
          DependencyState.BLOCKED : 
          DependencyState.READY;
        
        await this.processTaskStateChange(taskId, newState, {
          releasedBy: releasingTeam,
          reassignedTo: newTeam,
          releaseTime: new Date().toISOString()
        });
      }

      return newTeam;

    } catch (error) {
      console.error(`[EnhancedCoordinator] Failed to release task ${taskId}:`, error);
      throw error;
    }
  }

  /**
   * Force frontier recalculation
   */
  async recalculateFrontier(): Promise<void> {
    if (!this.frontierInitialized) {
      throw new Error('Frontier system not initialized');
    }

    try {
      const tasks = await this.deps.getCurrentTasks();
      await this.rollingFrontier.recalculateBoundaries(tasks);
      
      const frontierState = this.rollingFrontier.getFrontierState();
      await this.syncWaveStateWithFrontier(frontierState);

      console.log('[EnhancedCoordinator] Frontier recalculated successfully');

    } catch (error) {
      console.error('[EnhancedCoordinator] Frontier recalculation failed:', error);
      throw error;
    }
  }

  /**
   * Apply specific optimization
   */
  async applyOptimization(optimization: FrontierOptimization): Promise<boolean> {
    if (!this.frontierInitialized) {
      return false;
    }

    try {
      const success = await this.rollingFrontier.applyOptimization(optimization);
      
      if (success) {
        // Sync changes with wave state
        const frontierState = this.rollingFrontier.getFrontierState();
        await this.syncWaveStateWithFrontier(frontierState);
      }

      return success;

    } catch (error) {
      console.error('[EnhancedCoordinator] Optimization application failed:', error);
      return false;
    }
  }

  /**
   * Shutdown the enhanced coordinator
   */
  async shutdown(): Promise<void> {
    try {
      if (this.frontierInitialized) {
        await this.rollingFrontier.shutdown();
      }

      console.log('[EnhancedCoordinator] System shutdown complete');

    } catch (error) {
      console.error('[EnhancedCoordinator] Shutdown error:', error);
    }
  }

  // Private implementation methods

  /**
   * Run frontier-specific coordination logic
   */
  private async coordinateFrontier(): Promise<{
    optimizationsApplied: number;
    metrics: EnhancedCoordinationResult['frontierMetrics'];
    optimizations: FrontierOptimization[];
    errors: string[];
    recommendations: string[];
  }> {
    const result = {
      optimizationsApplied: 0,
      metrics: {
        currentWave: 1,
        activeTasks: 0,
        readyTasks: 0,
        blockedTasks: 0,
        predictedCompletion: new Date()
      },
      optimizations: [] as FrontierOptimization[],
      errors: [] as string[],
      recommendations: [] as string[]
    };

    try {
      const frontierState = this.rollingFrontier.getFrontierState();
      
      // Update metrics from frontier state
      result.metrics = {
        currentWave: frontierState.metrics.currentWave,
        activeTasks: frontierState.metrics.activeTasks,
        readyTasks: this.countReadyTasks(frontierState),
        blockedTasks: frontierState.metrics.blockedTasks,
        predictedCompletion: frontierState.metrics.predictedCompletionTime
      };

      // Get optimization recommendations
      const optimizations = await this.rollingFrontier.getOptimizationRecommendations();
      result.optimizations = optimizations;

      // Apply high-urgency optimizations automatically
      let applied = 0;
      for (const opt of optimizations) {
        if (opt.urgency >= OptimizationUrgency.HIGH && opt.confidence > 0.8) {
          const success = await this.rollingFrontier.applyOptimization(opt);
          if (success) {
            applied++;
          }
        }
      }

      result.optimizationsApplied = applied;

      // Generate recommendations
      if (frontierState.metrics.coordinationOverhead > 0.3) {
        result.recommendations.push('High coordination overhead detected - consider wave restructuring');
      }

      if (frontierState.metrics.bottleneckTeams.length > 0) {
        result.recommendations.push(`Bottleneck teams detected: ${frontierState.metrics.bottleneckTeams.join(', ')}`);
      }

      if (result.metrics.blockedTasks > result.metrics.activeTasks * 0.3) {
        result.recommendations.push('High number of blocked tasks - review dependencies');
      }

    } catch (error) {
      result.errors.push(`Frontier coordination failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    return result;
  }

  /**
   * Integrate frontier optimizations with work stealing system
   */
  private async integrateOptimizations(optimizations: FrontierOptimization[]): Promise<void> {
    for (const opt of optimizations) {
      try {
        // Convert frontier optimizations to work stealing actions where applicable
        switch (opt.action) {
          case FrontierAction.REASSIGN_TASK:
            // Use work stealing to reassign task
            const taskId = opt.target;
            const currentTasks = await this.deps.getCurrentTasks();
            const task = currentTasks.find((t: Task) => t.id === taskId);
            
            if (task) {
              // Release from current team and let work stealing find new team
              await this.releaseTask(taskId, task.team);
            }
            break;
            
          case FrontierAction.PROMOTE_TASK:
            // Mark task as ready for earlier execution
            await this.processTaskStateChange(opt.target, DependencyState.READY, {
              promotion: true,
              reason: opt.reason
            });
            break;

          default:
            // Other optimizations handled by frontier system
            break;
        }

      } catch (error) {
        console.warn(`[EnhancedCoordinator] Failed to integrate optimization ${opt.action} for ${opt.target}:`, error);
      }
    }
  }

  /**
   * Sync wave state with frontier state
   */
  private async syncWaveStateWithFrontier(frontierState: FrontierState): Promise<void> {
    try {
      const currentWaveState = await this.deps.getWaveState();
      
      // Update wave number if frontier suggests changes
      if (frontierState.metrics.currentWave !== currentWaveState.wave) {
        currentWaveState.wave = frontierState.metrics.currentWave;
      }

      // Update team readiness based on frontier metrics
      const totalTasks = frontierState.dependencyGraph.size;
      const readyRatio = totalTasks > 0 ? frontierState.metrics.completedTasks / totalTasks : 1.0;
      
      currentWaveState.all_ready = readyRatio > 0.95; // 95% completion threshold

      // Update timestamp
      currentWaveState.updated_at = frontierState.lastUpdate.toISOString();

      await this.deps.updateWaveState(currentWaveState);

    } catch (error) {
      console.error('[EnhancedCoordinator] Failed to sync wave state with frontier:', error);
    }
  }

  /**
   * Count ready tasks from frontier state
   */
  private countReadyTasks(frontierState: FrontierState): number {
    let readyCount = 0;
    for (const [, node] of frontierState.dependencyGraph) {
      if (node.state === DependencyState.READY) {
        readyCount++;
      }
    }
    return readyCount;
  }

  /**
   * Create empty frontier state for fallback
   */
  private createEmptyFrontierState(): FrontierState {
    return {
      currentBoundaries: [],
      metrics: {
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
      },
      optimizations: [],
      dependencyGraph: new Map(),
      teamCapacities: new Map(),
      lastUpdate: new Date(),
      coordinationVersion: 0
    };
  }
}