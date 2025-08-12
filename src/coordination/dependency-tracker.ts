/**
 * Advanced Dependency Graph Analysis and Management
 * Handles multi-dimensional dependencies and critical path calculation
 */

import { 
  DependencyNode, 
  DependencyState, 
  Task,
  DependencyViolationError,
  FrontierCalculationError 
} from '../types';

export interface DependencyAnalysis {
  criticalPath: string[];
  criticalPathLength: number;
  parallelizableTasks: string[][];
  blockingTasks: string[];
  readyTasks: string[];
  circularDependencies: string[][];
}

export interface DependencyInjectable {
  getCurrentTime(): Date;
  logWarning(message: string, context: Record<string, unknown>): void;
  logError(message: string, error: Error): void;
}

export class DependencyTracker {
  private dependencyGraph: Map<string, DependencyNode> = new Map();
  private adjacencyList: Map<string, Set<string>> = new Map();
  private reverseAdjacencyList: Map<string, Set<string>> = new Map();
  private taskStates: Map<string, DependencyState> = new Map();
  
  constructor(private deps: DependencyInjectable) {}

  /**
   * Initialize dependency graph from task definitions
   */
  initializeGraph(tasks: Task[]): void {
    try {
      // Clear existing state
      this.dependencyGraph.clear();
      this.adjacencyList.clear();
      this.reverseAdjacencyList.clear();
      this.taskStates.clear();

      // Build nodes
      for (const task of tasks) {
        const node: DependencyNode = {
          taskId: task.id,
          dependsOn: [...task.depends_on],
          dependedBy: [],
          state: DependencyState.WAITING,
          wave: task.wave,
          team: task.team,
          estimatedEffort: this.extractEffortFromTask(task),
          criticalPath: false,
          blockingFactor: 0
        };

        this.dependencyGraph.set(task.id, node);
        this.taskStates.set(task.id, DependencyState.WAITING);
        this.adjacencyList.set(task.id, new Set());
        this.reverseAdjacencyList.set(task.id, new Set());
      }

      // Build edges and reverse relationships
      for (const task of tasks) {
        for (const depId of task.depends_on) {
          if (!this.dependencyGraph.has(depId)) {
            throw new DependencyViolationError(
              `Task ${task.id} depends on non-existent task ${depId}`,
              task.id,
              depId,
              task.wave
            );
          }

          // Add forward edge
          this.adjacencyList.get(depId)?.add(task.id);
          
          // Add reverse edge
          this.reverseAdjacencyList.get(task.id)?.add(depId);

          // Update dependedBy
          const depNode = this.dependencyGraph.get(depId);
          if (depNode) {
            depNode.dependedBy.push(task.id);
          }
        }
      }

      // Calculate blocking factors
      this.calculateBlockingFactors();

      // Detect circular dependencies
      const circular = this.detectCircularDependencies();
      if (circular.length > 0) {
        throw new DependencyViolationError(
          `Circular dependencies detected: ${circular.map(cycle => cycle.join(' -> ')).join(', ')}`,
          circular[0][0],
          circular[0][1],
          this.dependencyGraph.get(circular[0][0])?.wave || 0
        );
      }

      this.deps.logWarning('Dependency graph initialized', {
        taskCount: tasks.length,
        edgeCount: this.getTotalEdgeCount()
      });

    } catch (error) {
      const contextError = error instanceof DependencyViolationError ? error : 
        new FrontierCalculationError(
          `Failed to initialize dependency graph: ${error instanceof Error ? error.message : 'Unknown error'}`,
          { taskCount: tasks.length },
          true
        );
      
      this.deps.logError('Dependency graph initialization failed', contextError);
      throw contextError;
    }
  }

  /**
   * Update task state and propagate readiness changes
   */
  updateTaskState(taskId: string, newState: DependencyState): string[] {
    const currentState = this.taskStates.get(taskId);
    if (currentState === newState) {
      return []; // No change
    }

    if (!this.dependencyGraph.has(taskId)) {
      throw new DependencyViolationError(
        `Cannot update state for non-existent task ${taskId}`,
        taskId,
        '',
        0
      );
    }

    // Validate state transition
    this.validateStateTransition(taskId, currentState || DependencyState.WAITING, newState);

    // Update state
    this.taskStates.set(taskId, newState);
    const node = this.dependencyGraph.get(taskId)!;
    node.state = newState;

    // Propagate readiness if task completed
    const newlyReady: string[] = [];
    if (newState === DependencyState.COMPLETED) {
      newlyReady.push(...this.checkDependentTasksReadiness(taskId));
    }

    return newlyReady;
  }

  /**
   * Perform comprehensive dependency analysis
   */
  analyzeGraph(): DependencyAnalysis {
    try {
      const criticalPath = this.calculateCriticalPath();
      const parallelizable = this.identifyParallelizableTasks();
      const blocking = this.identifyBlockingTasks();
      const ready = this.getReadyTasks();
      const circular = this.detectCircularDependencies();

      // Mark critical path nodes
      for (const taskId of criticalPath) {
        const node = this.dependencyGraph.get(taskId);
        if (node) {
          node.criticalPath = true;
        }
      }

      return {
        criticalPath,
        criticalPathLength: this.calculateCriticalPathLength(criticalPath),
        parallelizableTasks: parallelizable,
        blockingTasks: blocking,
        readyTasks: ready,
        circularDependencies: circular
      };

    } catch (error) {
      const analysisError = new FrontierCalculationError(
        `Dependency analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { 
          graphSize: this.dependencyGraph.size,
          edgeCount: this.getTotalEdgeCount()
        },
        true
      );
      
      this.deps.logError('Dependency analysis failed', analysisError);
      throw analysisError;
    }
  }

  /**
   * Get tasks ready for execution (all dependencies satisfied)
   */
  getReadyTasks(): string[] {
    const ready: string[] = [];
    
    for (const [taskId, node] of this.dependencyGraph) {
      if (node.state === DependencyState.WAITING && this.areAllDependenciesSatisfied(taskId)) {
        ready.push(taskId);
      }
    }

    return ready;
  }

  /**
   * Get dependency graph for external use
   */
  getGraph(): Map<string, DependencyNode> {
    // Return deep copy to prevent external mutations
    const copy = new Map<string, DependencyNode>();
    for (const [id, node] of this.dependencyGraph) {
      copy.set(id, { ...node, dependsOn: [...node.dependsOn], dependedBy: [...node.dependedBy] });
    }
    return copy;
  }

  /**
   * Calculate critical path using longest path algorithm
   */
  private calculateCriticalPath(): string[] {
    // Topological sort for critical path calculation
    const inDegree = new Map<string, number>();
    const distances = new Map<string, number>();
    const predecessors = new Map<string, string>();

    // Initialize
    for (const taskId of this.dependencyGraph.keys()) {
      inDegree.set(taskId, this.reverseAdjacencyList.get(taskId)?.size || 0);
      distances.set(taskId, 0);
    }

    const queue: string[] = [];
    for (const [taskId, degree] of inDegree) {
      if (degree === 0) {
        queue.push(taskId);
      }
    }

    // Process in topological order
    while (queue.length > 0) {
      const current = queue.shift()!;
      const currentDistance = distances.get(current)!;
      const currentNode = this.dependencyGraph.get(current)!;

      for (const neighbor of this.adjacencyList.get(current) || []) {
        const neighborNode = this.dependencyGraph.get(neighbor)!;
        const edgeWeight = neighborNode.estimatedEffort;
        const newDistance = currentDistance + edgeWeight;

        if (newDistance > distances.get(neighbor)!) {
          distances.set(neighbor, newDistance);
          predecessors.set(neighbor, current);
        }

        const newInDegree = inDegree.get(neighbor)! - 1;
        inDegree.set(neighbor, newInDegree);
        if (newInDegree === 0) {
          queue.push(neighbor);
        }
      }
    }

    // Find the task with maximum distance
    let maxDistance = -1;
    let endTask = '';
    for (const [taskId, distance] of distances) {
      if (distance > maxDistance) {
        maxDistance = distance;
        endTask = taskId;
      }
    }

    // Reconstruct path
    const path: string[] = [];
    let current = endTask;
    while (current) {
      path.unshift(current);
      current = predecessors.get(current) || '';
    }

    return path;
  }

  /**
   * Calculate the total effort along the critical path
   */
  private calculateCriticalPathLength(criticalPath: string[]): number {
    return criticalPath.reduce((total, taskId) => {
      const node = this.dependencyGraph.get(taskId);
      return total + (node?.estimatedEffort || 0);
    }, 0);
  }

  /**
   * Identify sets of tasks that can be executed in parallel
   */
  private identifyParallelizableTasks(): string[][] {
    const levels: string[][] = [];
    const visited = new Set<string>();
    const processing = new Set<string>();

    const getLevel = (taskId: string): number => {
      if (visited.has(taskId)) {
        return levels.findIndex(level => level.includes(taskId));
      }

      if (processing.has(taskId)) {
        throw new DependencyViolationError(
          `Circular dependency detected involving task ${taskId}`,
          taskId,
          '',
          this.dependencyGraph.get(taskId)?.wave || 0
        );
      }

      processing.add(taskId);
      
      let maxDepLevel = -1;
      for (const depId of this.reverseAdjacencyList.get(taskId) || []) {
        maxDepLevel = Math.max(maxDepLevel, getLevel(depId));
      }

      const level = maxDepLevel + 1;
      
      if (!levels[level]) {
        levels[level] = [];
      }
      
      levels[level].push(taskId);
      visited.add(taskId);
      processing.delete(taskId);

      return level;
    };

    for (const taskId of this.dependencyGraph.keys()) {
      if (!visited.has(taskId)) {
        getLevel(taskId);
      }
    }

    return levels.filter(level => level.length > 0);
  }

  /**
   * Identify tasks that are currently blocking others
   */
  private identifyBlockingTasks(): string[] {
    const blocking: string[] = [];
    
    for (const [taskId, node] of this.dependencyGraph) {
      if (node.state !== DependencyState.COMPLETED && node.blockingFactor > 0) {
        blocking.push(taskId);
      }
    }

    // Sort by blocking factor (most blocking first)
    return blocking.sort((a, b) => {
      const nodeA = this.dependencyGraph.get(a)!;
      const nodeB = this.dependencyGraph.get(b)!;
      return nodeB.blockingFactor - nodeA.blockingFactor;
    });
  }

  /**
   * Detect circular dependencies using DFS
   */
  private detectCircularDependencies(): string[][] {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const pathStack: string[] = [];
    const cycles: string[][] = [];

    const dfs = (taskId: string): void => {
      visited.add(taskId);
      recursionStack.add(taskId);
      pathStack.push(taskId);

      for (const neighbor of this.adjacencyList.get(taskId) || []) {
        if (!visited.has(neighbor)) {
          dfs(neighbor);
        } else if (recursionStack.has(neighbor)) {
          // Found cycle
          const cycleStart = pathStack.indexOf(neighbor);
          const cycle = pathStack.slice(cycleStart);
          cycle.push(neighbor); // Complete the cycle
          cycles.push(cycle);
        }
      }

      recursionStack.delete(taskId);
      pathStack.pop();
    };

    for (const taskId of this.dependencyGraph.keys()) {
      if (!visited.has(taskId)) {
        dfs(taskId);
      }
    }

    return cycles;
  }

  /**
   * Check if all dependencies of a task are satisfied
   */
  private areAllDependenciesSatisfied(taskId: string): boolean {
    const dependencies = this.reverseAdjacencyList.get(taskId) || new Set();
    
    for (const depId of dependencies) {
      const depState = this.taskStates.get(depId);
      if (depState !== DependencyState.COMPLETED) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check which dependent tasks become ready after task completion
   */
  private checkDependentTasksReadiness(completedTaskId: string): string[] {
    const newlyReady: string[] = [];
    
    for (const dependentId of this.adjacencyList.get(completedTaskId) || []) {
      if (this.taskStates.get(dependentId) === DependencyState.WAITING &&
          this.areAllDependenciesSatisfied(dependentId)) {
        newlyReady.push(dependentId);
      }
    }

    return newlyReady;
  }

  /**
   * Calculate blocking factor for each task (number of tasks it transitively blocks)
   */
  private calculateBlockingFactors(): void {
    const calculateFactor = (taskId: string, visited = new Set<string>()): number => {
      if (visited.has(taskId)) {
        return 0; // Prevent infinite recursion in case of cycles
      }

      visited.add(taskId);
      let factor = 0;

      for (const dependentId of this.adjacencyList.get(taskId) || []) {
        factor += 1 + calculateFactor(dependentId, new Set(visited));
      }

      const node = this.dependencyGraph.get(taskId);
      if (node) {
        node.blockingFactor = factor;
      }

      return factor;
    };

    for (const taskId of this.dependencyGraph.keys()) {
      calculateFactor(taskId);
    }
  }

  /**
   * Validate state transition is legal
   */
  private validateStateTransition(taskId: string, from: DependencyState, to: DependencyState): void {
    const validTransitions: Record<DependencyState, DependencyState[]> = {
      [DependencyState.WAITING]: [DependencyState.READY, DependencyState.BLOCKED],
      [DependencyState.READY]: [DependencyState.IN_PROGRESS, DependencyState.BLOCKED],
      [DependencyState.IN_PROGRESS]: [DependencyState.COMPLETED, DependencyState.FAILED, DependencyState.BLOCKED],
      [DependencyState.COMPLETED]: [], // Terminal state
      [DependencyState.BLOCKED]: [DependencyState.WAITING, DependencyState.READY],
      [DependencyState.FAILED]: [DependencyState.WAITING, DependencyState.READY] // Can be retried
    };

    if (!validTransitions[from].includes(to)) {
      throw new DependencyViolationError(
        `Invalid state transition for task ${taskId}: ${DependencyState[from]} -> ${DependencyState[to]}`,
        taskId,
        '',
        this.dependencyGraph.get(taskId)?.wave || 0
      );
    }
  }

  /**
   * Extract effort estimate from task (default to 1 if not specified)
   */
  private extractEffortFromTask(task: Task): number {
    // Try to extract effort from task properties or use default
    // This could be enhanced to parse from task description or other fields
    return 1; // Default effort
  }

  /**
   * Get total number of edges in the graph
   */
  private getTotalEdgeCount(): number {
    let count = 0;
    for (const edges of this.adjacencyList.values()) {
      count += edges.size;
    }
    return count;
  }
}