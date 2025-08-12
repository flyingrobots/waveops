/**
 * Frontier Calculator - Wave boundary optimization algorithms
 * Uses constraint satisfaction and multi-objective optimization
 */

import {
  WaveBoundary,
  TeamCapacity,
  DependencyNode,
  FrontierOptimization,
  FrontierAction,
  OptimizationUrgency,
  OptimizationImpact,
  DependencyState,
  FrontierCalculationError,
  CapacityOverflowError,
  OptimizationConflictError,
  Task
} from '../types';

export interface BoundaryConstraints {
  maxWaveSize: number;
  minTeamUtilization: number; // 0-1
  maxCoordinationOverhead: number; // 0-1
  criticalPathBuffer: number; // time buffer for critical tasks
  parallelismThreshold: number; // min tasks to justify wave split
}

export interface OptimizationObjectives {
  throughputWeight: number; // 0-1
  coordinationWeight: number; // 0-1
  riskWeight: number; // 0-1
  balanceWeight: number; // 0-1
}

export interface FrontierCalculatorDeps {
  getCurrentTime(): Date;
  logInfo(message: string, context: Record<string, unknown>): void;
  logWarning(message: string, context: Record<string, unknown>): void;
  logError(message: string, error: Error): void;
}

export class FrontierCalculator {
  private readonly DEFAULT_CONSTRAINTS: BoundaryConstraints = {
    maxWaveSize: 20,
    minTeamUtilization: 0.7,
    maxCoordinationOverhead: 0.2,
    criticalPathBuffer: 0.15, // 15% buffer
    parallelismThreshold: 3
  };

  private readonly DEFAULT_OBJECTIVES: OptimizationObjectives = {
    throughputWeight: 0.4,
    coordinationWeight: 0.3,
    riskWeight: 0.2,
    balanceWeight: 0.1
  };

  constructor(
    private deps: FrontierCalculatorDeps,
    private constraints: BoundaryConstraints = {} as BoundaryConstraints,
    private objectives: OptimizationObjectives = {} as OptimizationObjectives
  ) {
    // Apply defaults for missing constraints
    this.constraints = { ...this.DEFAULT_CONSTRAINTS, ...constraints };
    this.objectives = { ...this.DEFAULT_OBJECTIVES, ...objectives };
  }

  /**
   * Calculate optimal wave boundaries based on current state
   */
  calculateOptimalBoundaries(
    tasks: Task[],
    dependencyGraph: Map<string, DependencyNode>,
    teamCapacities: Map<string, TeamCapacity>,
    currentWave: number
  ): WaveBoundary[] {
    try {
      this.deps.logInfo('Starting boundary optimization', {
        taskCount: tasks.length,
        currentWave,
        teamCount: teamCapacities.size
      });

      // Group tasks by readiness and dependencies
      const taskGroups = this.groupTasksByReadiness(tasks, dependencyGraph);
      
      // Calculate capacity constraints
      const capacityConstraints = this.calculateCapacityConstraints(teamCapacities);
      
      // Generate boundary candidates
      const candidates = this.generateBoundaryCandidates(
        taskGroups,
        dependencyGraph,
        capacityConstraints,
        currentWave
      );

      // Evaluate and select optimal boundaries
      const optimalBoundaries = this.selectOptimalBoundaries(
        candidates,
        dependencyGraph,
        teamCapacities
      );

      this.deps.logInfo('Boundary optimization completed', {
        candidateCount: candidates.length,
        selectedBoundaries: optimalBoundaries.length
      });

      return optimalBoundaries;

    } catch (error) {
      const calcError = new FrontierCalculationError(
        `Boundary calculation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {
          taskCount: tasks.length,
          currentWave,
          teamCount: teamCapacities.size
        },
        true
      );

      this.deps.logError('Boundary calculation failed', calcError);
      throw calcError;
    }
  }

  /**
   * Generate frontier optimizations based on current performance
   */
  generateOptimizations(
    currentBoundaries: WaveBoundary[],
    dependencyGraph: Map<string, DependencyNode>,
    teamCapacities: Map<string, TeamCapacity>,
    performanceMetrics: {
      averageVelocity: number;
      throughput: number;
      coordinationOverhead: number;
      blockedTaskCount: number;
    }
  ): FrontierOptimization[] {
    const optimizations: FrontierOptimization[] = [];

    try {
      // Identify bottlenecks
      const bottlenecks = this.identifyBottlenecks(
        currentBoundaries,
        dependencyGraph,
        teamCapacities,
        performanceMetrics
      );

      // Generate optimization actions for each bottleneck
      for (const bottleneck of bottlenecks) {
        optimizations.push(...this.generateBottleneckOptimizations(bottleneck));
      }

      // Identify task promotion opportunities
      const promotionOpportunities = this.identifyPromotionOpportunities(
        dependencyGraph,
        teamCapacities
      );

      optimizations.push(...promotionOpportunities);

      // Identify wave restructuring opportunities
      const restructuringOps = this.identifyRestructuringOpportunities(
        currentBoundaries,
        dependencyGraph,
        teamCapacities
      );

      optimizations.push(...restructuringOps);

      // Resolve conflicts and prioritize
      return this.resolveOptimizationConflicts(optimizations);

    } catch (error) {
      const optError = new FrontierCalculationError(
        `Optimization generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {
          boundaryCount: currentBoundaries.length,
          metricsProvided: Object.keys(performanceMetrics).length
        },
        true
      );

      this.deps.logError('Optimization generation failed', optError);
      throw optError;
    }
  }

  /**
   * Calculate team load balancing across waves
   */
  calculateLoadBalancing(
    boundaries: WaveBoundary[],
    teamCapacities: Map<string, TeamCapacity>,
    dependencyGraph: Map<string, DependencyNode>
  ): Map<string, number> {
    const teamLoads = new Map<string, number>();
    
    // Initialize all teams with zero load
    for (const team of teamCapacities.keys()) {
      teamLoads.set(team, 0);
    }

    for (const boundary of boundaries) {
      const waveLoad = this.calculateWaveLoad(boundary, dependencyGraph);
      
      for (const taskId of boundary.tasks) {
        const node = dependencyGraph.get(taskId);
        if (node) {
          const currentLoad = teamLoads.get(node.team) || 0;
          teamLoads.set(node.team, currentLoad + node.estimatedEffort);
        }
      }
    }

    // Normalize by team capacity
    for (const [team, load] of teamLoads) {
      const capacity = teamCapacities.get(team);
      if (capacity) {
        teamLoads.set(team, load / capacity.maxConcurrentTasks);
      }
    }

    return teamLoads;
  }

  /**
   * Group tasks by their readiness to execute
   */
  private groupTasksByReadiness(
    tasks: Task[],
    dependencyGraph: Map<string, DependencyNode>
  ): {
    ready: Task[];
    waiting: Task[];
    blocked: Task[];
    inProgress: Task[];
  } {
    const groups = {
      ready: [] as Task[],
      waiting: [] as Task[],
      blocked: [] as Task[],
      inProgress: [] as Task[]
    };

    for (const task of tasks) {
      const node = dependencyGraph.get(task.id);
      if (!node) continue;

      switch (node.state) {
        case DependencyState.READY:
          groups.ready.push(task);
          break;
        case DependencyState.WAITING:
          groups.waiting.push(task);
          break;
        case DependencyState.BLOCKED:
          groups.blocked.push(task);
          break;
        case DependencyState.IN_PROGRESS:
          groups.inProgress.push(task);
          break;
      }
    }

    return groups;
  }

  /**
   * Calculate capacity constraints for each team
   */
  private calculateCapacityConstraints(
    teamCapacities: Map<string, TeamCapacity>
  ): Map<string, { maxTasks: number; availableCapacity: number }> {
    const constraints = new Map<string, { maxTasks: number; availableCapacity: number }>();

    for (const [team, capacity] of teamCapacities) {
      const availableCapacity = Math.max(0, capacity.maxConcurrentTasks - capacity.currentLoad);
      constraints.set(team, {
        maxTasks: capacity.maxConcurrentTasks,
        availableCapacity
      });
    }

    return constraints;
  }

  /**
   * Generate candidate wave boundaries using different optimization strategies
   */
  private generateBoundaryCandidates(
    taskGroups: { ready: Task[]; waiting: Task[]; blocked: Task[]; inProgress: Task[] },
    dependencyGraph: Map<string, DependencyNode>,
    capacityConstraints: Map<string, { maxTasks: number; availableCapacity: number }>,
    currentWave: number
  ): WaveBoundary[] {
    const candidates: WaveBoundary[] = [];

    // Strategy 1: Capacity-first assignment
    candidates.push(...this.generateCapacityFirstBoundaries(
      taskGroups,
      capacityConstraints,
      currentWave
    ));

    // Strategy 2: Dependency-first assignment
    candidates.push(...this.generateDependencyFirstBoundaries(
      taskGroups,
      dependencyGraph,
      currentWave
    ));

    // Strategy 3: Balanced assignment
    candidates.push(...this.generateBalancedBoundaries(
      taskGroups,
      dependencyGraph,
      capacityConstraints,
      currentWave
    ));

    // Strategy 4: Critical path optimization
    candidates.push(...this.generateCriticalPathBoundaries(
      taskGroups,
      dependencyGraph,
      currentWave
    ));

    return candidates;
  }

  /**
   * Generate boundaries prioritizing team capacity utilization
   */
  private generateCapacityFirstBoundaries(
    taskGroups: { ready: Task[]; waiting: Task[]; blocked: Task[]; inProgress: Task[] },
    capacityConstraints: Map<string, { maxTasks: number; availableCapacity: number }>,
    currentWave: number
  ): WaveBoundary[] {
    const boundaries: WaveBoundary[] = [];
    const readyTasks = [...taskGroups.ready];
    const now = this.deps.getCurrentTime();

    // Sort tasks by team capacity availability
    readyTasks.sort((a, b) => {
      const capacityA = capacityConstraints.get(a.team)?.availableCapacity || 0;
      const capacityB = capacityConstraints.get(b.team)?.availableCapacity || 0;
      return capacityB - capacityA; // Descending order
    });

    let waveNumber = currentWave;
    let currentWaveTasks: string[] = [];
    let currentWaveTeams = new Set<string>();
    const teamUsage = new Map<string, number>();

    for (const task of readyTasks) {
      const constraint = capacityConstraints.get(task.team);
      if (!constraint) continue;

      const currentUsage = teamUsage.get(task.team) || 0;
      
      if (currentUsage < constraint.availableCapacity) {
        currentWaveTasks.push(task.id);
        currentWaveTeams.add(task.team);
        teamUsage.set(task.team, currentUsage + 1);
      } else if (currentWaveTasks.length > 0) {
        // Create boundary for current wave
        boundaries.push({
          waveNumber,
          startTime: now,
          estimatedEndTime: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), // 1 week default
          tasks: [...currentWaveTasks],
          teams: Array.from(currentWaveTeams),
          readinessScore: 1.0, // All ready tasks
          criticalPathLength: 0,
          parallelism: currentWaveTasks.length
        });

        // Start new wave
        waveNumber++;
        currentWaveTasks = [task.id];
        currentWaveTeams = new Set([task.team]);
        teamUsage.clear();
        teamUsage.set(task.team, 1);
      }
    }

    // Add final boundary if tasks remain
    if (currentWaveTasks.length > 0) {
      boundaries.push({
        waveNumber,
        startTime: now,
        estimatedEndTime: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        tasks: [...currentWaveTasks],
        teams: Array.from(currentWaveTeams),
        readinessScore: 1.0,
        criticalPathLength: 0,
        parallelism: currentWaveTasks.length
      });
    }

    return boundaries;
  }

  /**
   * Generate boundaries prioritizing dependency resolution
   */
  private generateDependencyFirstBoundaries(
    taskGroups: { ready: Task[]; waiting: Task[]; blocked: Task[]; inProgress: Task[] },
    dependencyGraph: Map<string, DependencyNode>,
    currentWave: number
  ): WaveBoundary[] {
    const boundaries: WaveBoundary[] = [];
    const readyTasks = [...taskGroups.ready];
    const now = this.deps.getCurrentTime();

    // Sort by blocking factor (most blocking first)
    readyTasks.sort((a, b) => {
      const nodeA = dependencyGraph.get(a.id);
      const nodeB = dependencyGraph.get(b.id);
      const blockingA = nodeA?.blockingFactor || 0;
      const blockingB = nodeB?.blockingFactor || 0;
      return blockingB - blockingA;
    });

    // Group into waves of similar blocking factors
    let currentWave_num = currentWave;
    let currentGroup: Task[] = [];
    let lastBlockingFactor: number | null = null;

    for (const task of readyTasks) {
      const node = dependencyGraph.get(task.id);
      const blockingFactor = node?.blockingFactor || 0;

      if (lastBlockingFactor === null || blockingFactor === lastBlockingFactor) {
        currentGroup.push(task);
        lastBlockingFactor = blockingFactor;
      } else {
        if (currentGroup.length > 0) {
          boundaries.push(this.createBoundaryFromTasks(currentGroup, currentWave_num, now));
          currentWave_num++;
        }
        currentGroup = [task];
        lastBlockingFactor = blockingFactor;
      }
    }

    if (currentGroup.length > 0) {
      boundaries.push(this.createBoundaryFromTasks(currentGroup, currentWave_num, now));
    }

    return boundaries;
  }

  /**
   * Generate balanced boundaries considering multiple factors
   */
  private generateBalancedBoundaries(
    taskGroups: { ready: Task[]; waiting: Task[]; blocked: Task[]; inProgress: Task[] },
    dependencyGraph: Map<string, DependencyNode>,
    capacityConstraints: Map<string, { maxTasks: number; availableCapacity: number }>,
    currentWave: number
  ): WaveBoundary[] {
    // This combines capacity and dependency considerations
    // Implementation would use multi-objective optimization
    // For brevity, returning a simplified version
    const boundaries: WaveBoundary[] = [];
    const readyTasks = [...taskGroups.ready];
    const now = this.deps.getCurrentTime();

    // Score tasks based on multiple criteria
    const taskScores = readyTasks.map(task => {
      const node = dependencyGraph.get(task.id);
      const capacity = capacityConstraints.get(task.team);
      
      const blockingScore = (node?.blockingFactor || 0) * 0.4;
      const capacityScore = (capacity?.availableCapacity || 0) * 0.3;
      const criticalScore = node?.criticalPath ? 0.3 : 0;
      
      return {
        task,
        score: blockingScore + capacityScore + criticalScore
      };
    });

    // Sort by composite score
    taskScores.sort((a, b) => b.score - a.score);

    // Create balanced waves
    let waveNumber = currentWave;
    let currentWaveTasks: Task[] = [];
    const maxWaveSize = this.constraints.maxWaveSize;

    for (const { task } of taskScores) {
      currentWaveTasks.push(task);
      
      if (currentWaveTasks.length >= maxWaveSize) {
        boundaries.push(this.createBoundaryFromTasks(currentWaveTasks, waveNumber, now));
        waveNumber++;
        currentWaveTasks = [];
      }
    }

    if (currentWaveTasks.length > 0) {
      boundaries.push(this.createBoundaryFromTasks(currentWaveTasks, waveNumber, now));
    }

    return boundaries;
  }

  /**
   * Generate boundaries optimizing critical path execution
   */
  private generateCriticalPathBoundaries(
    taskGroups: { ready: Task[]; waiting: Task[]; blocked: Task[]; inProgress: Task[] },
    dependencyGraph: Map<string, DependencyNode>,
    currentWave: number
  ): WaveBoundary[] {
    const boundaries: WaveBoundary[] = [];
    const readyTasks = [...taskGroups.ready];
    const now = this.deps.getCurrentTime();

    // Separate critical path tasks
    const criticalTasks = readyTasks.filter(task => {
      const node = dependencyGraph.get(task.id);
      return node?.criticalPath;
    });

    const nonCriticalTasks = readyTasks.filter(task => {
      const node = dependencyGraph.get(task.id);
      return !node?.criticalPath;
    });

    // Prioritize critical path tasks in early waves
    if (criticalTasks.length > 0) {
      boundaries.push(this.createBoundaryFromTasks(criticalTasks, currentWave, now));
    }

    if (nonCriticalTasks.length > 0) {
      const waveNum = criticalTasks.length > 0 ? currentWave + 1 : currentWave;
      boundaries.push(this.createBoundaryFromTasks(nonCriticalTasks, waveNum, now));
    }

    return boundaries;
  }

  /**
   * Create boundary object from task list
   */
  private createBoundaryFromTasks(tasks: Task[], waveNumber: number, startTime: Date): WaveBoundary {
    const teams = new Set<string>();
    let totalEffort = 0;

    for (const task of tasks) {
      teams.add(task.team);
      totalEffort += 1; // Default effort
    }

    const estimatedDuration = totalEffort * 24 * 60 * 60 * 1000; // Convert to milliseconds
    
    return {
      waveNumber,
      startTime,
      estimatedEndTime: new Date(startTime.getTime() + estimatedDuration),
      tasks: tasks.map(t => t.id),
      teams: Array.from(teams),
      readinessScore: 1.0, // All tasks are ready
      criticalPathLength: totalEffort,
      parallelism: tasks.length
    };
  }

  /**
   * Select optimal boundaries from candidates using multi-objective optimization
   */
  private selectOptimalBoundaries(
    candidates: WaveBoundary[],
    dependencyGraph: Map<string, DependencyNode>,
    teamCapacities: Map<string, TeamCapacity>
  ): WaveBoundary[] {
    if (candidates.length === 0) return [];

    const scoredCandidates = candidates.map(candidate => ({
      boundary: candidate,
      score: this.calculateBoundaryScore(candidate, dependencyGraph, teamCapacities)
    }));

    // Sort by score (highest first)
    scoredCandidates.sort((a, b) => b.score - a.score);

    // Select top candidate set that doesn't conflict
    const selected: WaveBoundary[] = [];
    const usedTasks = new Set<string>();

    for (const { boundary } of scoredCandidates) {
      const hasConflict = boundary.tasks.some(taskId => usedTasks.has(taskId));
      
      if (!hasConflict) {
        selected.push(boundary);
        boundary.tasks.forEach(taskId => usedTasks.add(taskId));
      }
    }

    return selected;
  }

  /**
   * Calculate multi-objective score for a boundary
   */
  private calculateBoundaryScore(
    boundary: WaveBoundary,
    dependencyGraph: Map<string, DependencyNode>,
    teamCapacities: Map<string, TeamCapacity>
  ): number {
    const throughputScore = this.calculateThroughputScore(boundary);
    const coordinationScore = this.calculateCoordinationScore(boundary, teamCapacities);
    const riskScore = this.calculateRiskScore(boundary, dependencyGraph);
    const balanceScore = this.calculateBalanceScore(boundary, teamCapacities);

    return (
      throughputScore * this.objectives.throughputWeight +
      coordinationScore * this.objectives.coordinationWeight +
      riskScore * this.objectives.riskWeight +
      balanceScore * this.objectives.balanceWeight
    );
  }

  private calculateThroughputScore(boundary: WaveBoundary): number {
    return Math.min(1.0, boundary.parallelism / 10); // Normalize to 0-1
  }

  private calculateCoordinationScore(boundary: WaveBoundary, teamCapacities: Map<string, TeamCapacity>): number {
    const coordinationCost = boundary.teams.length * 0.1; // Simple coordination cost model
    return Math.max(0, 1 - coordinationCost);
  }

  private calculateRiskScore(boundary: WaveBoundary, dependencyGraph: Map<string, DependencyNode>): number {
    let riskFactor = 0;
    for (const taskId of boundary.tasks) {
      const node = dependencyGraph.get(taskId);
      if (node?.criticalPath) {
        riskFactor += 0.2; // Critical path tasks increase risk
      }
    }
    return Math.max(0, 1 - riskFactor);
  }

  private calculateBalanceScore(boundary: WaveBoundary, teamCapacities: Map<string, TeamCapacity>): number {
    const teamTaskCount = new Map<string, number>();
    
    for (const taskId of boundary.tasks) {
      // Would need to get team from task - simplified for now
      const team = boundary.teams[0]; // Placeholder
      teamTaskCount.set(team, (teamTaskCount.get(team) || 0) + 1);
    }

    let variance = 0;
    const avgTasksPerTeam = boundary.tasks.length / boundary.teams.length;
    
    for (const count of teamTaskCount.values()) {
      variance += Math.pow(count - avgTasksPerTeam, 2);
    }

    return Math.max(0, 1 - Math.sqrt(variance) / boundary.tasks.length);
  }

  private calculateWaveLoad(boundary: WaveBoundary, dependencyGraph: Map<string, DependencyNode>): number {
    return boundary.tasks.reduce((load, taskId) => {
      const node = dependencyGraph.get(taskId);
      return load + (node?.estimatedEffort || 1);
    }, 0);
  }

  // Placeholder implementations for optimization methods
  private identifyBottlenecks(
    boundaries: WaveBoundary[],
    dependencyGraph: Map<string, DependencyNode>,
    teamCapacities: Map<string, TeamCapacity>,
    metrics: { averageVelocity: number; throughput: number; coordinationOverhead: number; blockedTaskCount: number }
  ): Array<{ type: string; target: string; severity: number }> {
    return []; // Placeholder
  }

  private generateBottleneckOptimizations(
    bottleneck: { type: string; target: string; severity: number }
  ): FrontierOptimization[] {
    return []; // Placeholder
  }

  private identifyPromotionOpportunities(
    dependencyGraph: Map<string, DependencyNode>,
    teamCapacities: Map<string, TeamCapacity>
  ): FrontierOptimization[] {
    return []; // Placeholder
  }

  private identifyRestructuringOpportunities(
    boundaries: WaveBoundary[],
    dependencyGraph: Map<string, DependencyNode>,
    teamCapacities: Map<string, TeamCapacity>
  ): FrontierOptimization[] {
    return []; // Placeholder
  }

  private resolveOptimizationConflicts(optimizations: FrontierOptimization[]): FrontierOptimization[] {
    // Sort by urgency and confidence
    return optimizations.sort((a, b) => {
      if (a.urgency !== b.urgency) {
        return b.urgency - a.urgency;
      }
      return b.confidence - a.confidence;
    });
  }
}