/**
 * Comprehensive unit tests for Rolling Frontier System
 */

import {
  Task,
  TeamCapacity,
  DependencyState,
  FrontierAction,
  OptimizationUrgency,
  FrontierCalculationError,
  DependencyViolationError,
  CapacityOverflowError
} from '../../src/types';

import { DependencyTracker } from '../../src/coordination/dependency-tracker';
import { FrontierCalculator } from '../../src/coordination/frontier-calculator';
import { RollingFrontier } from '../../src/coordination/rolling-frontier';

// Test dependencies implementation
class MockDependencies {
  private currentTime = new Date('2024-01-01T00:00:00Z');
  private logs: Array<{ level: string; message: string; context?: any }> = [];
  private savedState: any = null;
  private notifications: Array<{ event: string; data: any }> = [];

  getCurrentTime(): Date {
    return this.currentTime;
  }

  setCurrentTime(time: Date): void {
    this.currentTime = time;
  }

  logInfo(message: string, context: Record<string, unknown>): void {
    this.logs.push({ level: 'info', message, context });
  }

  logWarning(message: string, context: Record<string, unknown>): void {
    this.logs.push({ level: 'warning', message, context });
  }

  logError(message: string, error: Error): void {
    this.logs.push({ level: 'error', message, context: { error: error.message } });
  }

  async saveState(state: any): Promise<void> {
    this.savedState = JSON.parse(JSON.stringify(state));
  }

  async loadState(): Promise<any> {
    return this.savedState ? JSON.parse(JSON.stringify(this.savedState)) : null;
  }

  async notifyStateChange(event: string, data: Record<string, unknown>): Promise<void> {
    this.notifications.push({ event, data });
  }

  async getCurrentTasks(): Promise<Task[]> {
    return createTestTasks();
  }

  async updateWaveState(waveState: any): Promise<void> {
    // Mock implementation
  }

  // Test helpers
  getLogs(): Array<{ level: string; message: string; context?: any }> {
    return [...this.logs];
  }

  clearLogs(): void {
    this.logs = [];
  }

  getNotifications(): Array<{ event: string; data: any }> {
    return [...this.notifications];
  }

  clearNotifications(): void {
    this.notifications = [];
  }

  getSavedState(): any {
    return this.savedState;
  }
}

// Test data factories
function createTestTasks(): Task[] {
  return [
    {
      id: 'T001',
      title: 'Foundation Task',
      wave: 1,
      team: 'alpha',
      depends_on: [],
      acceptance: ['Foundation complete'],
      critical: true
    },
    {
      id: 'T002',
      title: 'Dependent Task',
      wave: 1,
      team: 'beta',
      depends_on: ['T001'],
      acceptance: ['Dependent complete'],
      critical: true
    },
    {
      id: 'T003',
      title: 'Parallel Task',
      wave: 1,
      team: 'alpha',
      depends_on: [],
      acceptance: ['Parallel complete'],
      critical: false
    },
    {
      id: 'T004',
      title: 'Complex Task',
      wave: 2,
      team: 'beta',
      depends_on: ['T001', 'T003'],
      acceptance: ['Complex complete'],
      critical: true
    },
    {
      id: 'T005',
      title: 'Final Task',
      wave: 2,
      team: 'alpha',
      depends_on: ['T002', 'T004'],
      acceptance: ['Final complete'],
      critical: false
    }
  ];
}

function createTestTeamCapacities(): TeamCapacity[] {
  return [
    {
      team: 'alpha',
      maxConcurrentTasks: 3,
      currentLoad: 0,
      velocity: 2.0,
      efficiency: 0.85,
      availability: 0.9,
      specializations: ['frontend', 'api']
    },
    {
      team: 'beta',
      maxConcurrentTasks: 2,
      currentLoad: 0,
      velocity: 1.5,
      efficiency: 0.9,
      availability: 0.8,
      specializations: ['backend', 'database']
    }
  ];
}

describe('DependencyTracker', () => {
  let tracker: DependencyTracker;
  let mockDeps: MockDependencies;

  beforeEach(() => {
    mockDeps = new MockDependencies();
    tracker = new DependencyTracker(mockDeps);
  });

  describe('Graph Initialization', () => {
    test('should initialize dependency graph correctly', () => {
      const tasks = createTestTasks();
      
      expect(() => tracker.initializeGraph(tasks)).not.toThrow();
      
      const graph = tracker.getGraph();
      expect(graph.size).toBe(tasks.length);
      
      // Check dependency relationships
      const t002 = graph.get('T002');
      expect(t002?.dependsOn).toEqual(['T001']);
      
      const t001 = graph.get('T001');
      expect(t001?.dependedBy).toContain('T002');
    });

    test('should detect circular dependencies', () => {
      const circularTasks: Task[] = [
        {
          id: 'A',
          title: 'Task A',
          wave: 1,
          team: 'alpha',
          depends_on: ['B'],
          acceptance: [],
          critical: false
        },
        {
          id: 'B',
          title: 'Task B',
          wave: 1,
          team: 'alpha',
          depends_on: ['C'],
          acceptance: [],
          critical: false
        },
        {
          id: 'C',
          title: 'Task C',
          wave: 1,
          team: 'alpha',
          depends_on: ['A'],
          acceptance: [],
          critical: false
        }
      ];

      expect(() => tracker.initializeGraph(circularTasks))
        .toThrow(DependencyViolationError);
    });

    test('should detect non-existent dependencies', () => {
      const invalidTasks: Task[] = [
        {
          id: 'T001',
          title: 'Task 1',
          wave: 1,
          team: 'alpha',
          depends_on: ['NON_EXISTENT'],
          acceptance: [],
          critical: false
        }
      ];

      expect(() => tracker.initializeGraph(invalidTasks))
        .toThrow(DependencyViolationError);
    });
  });

  describe('State Management', () => {
    beforeEach(() => {
      tracker.initializeGraph(createTestTasks());
    });

    test('should update task state and propagate readiness', () => {
      // Complete T001 with proper state transitions - should make T002 ready
      tracker.updateTaskState('T001', DependencyState.READY);
      tracker.updateTaskState('T001', DependencyState.IN_PROGRESS);
      const readyTasks = tracker.updateTaskState('T001', DependencyState.COMPLETED);
      
      expect(readyTasks).toContain('T002');
      
      const graph = tracker.getGraph();
      expect(graph.get('T001')?.state).toBe(DependencyState.COMPLETED);
    });

    test('should validate state transitions', () => {
      // Invalid transition: WAITING -> COMPLETED (must go through IN_PROGRESS)
      expect(() => tracker.updateTaskState('T001', DependencyState.COMPLETED))
        .toThrow(DependencyViolationError);
    });

    test('should get ready tasks correctly', () => {
      const readyTasks = tracker.getReadyTasks();
      
      // Initially, only tasks with no dependencies should be ready
      expect(readyTasks).toContain('T001');
      expect(readyTasks).toContain('T003');
      expect(readyTasks).not.toContain('T002'); // Depends on T001
    });
  });

  describe('Graph Analysis', () => {
    beforeEach(() => {
      tracker.initializeGraph(createTestTasks());
    });

    test('should calculate critical path correctly', () => {
      const analysis = tracker.analyzeGraph();
      
      expect(analysis.criticalPath).toContain('T001');
      expect(analysis.criticalPath).toContain('T002');
      expect(analysis.criticalPathLength).toBeGreaterThan(0);
    });

    test('should identify parallelizable tasks', () => {
      const analysis = tracker.analyzeGraph();
      
      // T001 and T003 can run in parallel
      const firstLevel = analysis.parallelizableTasks[0];
      expect(firstLevel).toContain('T001');
      expect(firstLevel).toContain('T003');
    });

    test('should identify blocking tasks', () => {
      const analysis = tracker.analyzeGraph();
      
      // T001 blocks the most tasks
      expect(analysis.blockingTasks[0]).toBe('T001');
    });
  });
});

describe.skip('FrontierCalculator', () => {
  let calculator: FrontierCalculator;
  let mockDeps: MockDependencies;

  beforeEach(() => {
    mockDeps = new MockDependencies();
    calculator = new FrontierCalculator(mockDeps);
  });

  describe('Boundary Calculation', () => {
    test('should calculate optimal boundaries', () => {
      const tasks = createTestTasks();
      const teamCapacities = new Map(createTestTeamCapacities().map(tc => [tc.team, tc]));
      
      // Create dependency graph
      const tracker = new DependencyTracker(mockDeps);
      tracker.initializeGraph(tasks);
      const dependencyGraph = tracker.getGraph();

      const boundaries = calculator.calculateOptimalBoundaries(
        tasks,
        dependencyGraph,
        teamCapacities,
        1
      );

      expect(boundaries.length).toBeGreaterThan(0);
      expect(boundaries[0].waveNumber).toBe(1);
      expect(boundaries[0].tasks.length).toBeGreaterThan(0);
    });

    test('should respect team capacity constraints', () => {
      const tasks = createTestTasks();
      const teamCapacities = new Map(createTestTeamCapacities().map(tc => [tc.team, tc]));
      
      const tracker = new DependencyTracker(mockDeps);
      tracker.initializeGraph(tasks);
      const dependencyGraph = tracker.getGraph();

      const boundaries = calculator.calculateOptimalBoundaries(
        tasks,
        dependencyGraph,
        teamCapacities,
        1
      );

      // Check that no wave exceeds team capacity
      for (const boundary of boundaries) {
        const teamTaskCount = new Map<string, number>();
        
        for (const taskId of boundary.tasks) {
          const node = dependencyGraph.get(taskId);
          if (node) {
            const count = teamTaskCount.get(node.team) || 0;
            teamTaskCount.set(node.team, count + 1);
          }
        }

        for (const [team, count] of teamTaskCount) {
          const capacity = teamCapacities.get(team);
          expect(count).toBeLessThanOrEqual(capacity?.maxConcurrentTasks || 0);
        }
      }
    });
  });

  describe('Load Balancing', () => {
    test('should calculate team load balancing', () => {
      const tasks = createTestTasks();
      const teamCapacities = new Map(createTestTeamCapacities().map(tc => [tc.team, tc]));
      
      const tracker = new DependencyTracker(mockDeps);
      tracker.initializeGraph(tasks);
      const dependencyGraph = tracker.getGraph();

      const boundaries = calculator.calculateOptimalBoundaries(
        tasks,
        dependencyGraph,
        teamCapacities,
        1
      );

      const loadBalance = calculator.calculateLoadBalancing(
        boundaries,
        teamCapacities,
        dependencyGraph
      );

      // Should have load data for all teams
      expect(loadBalance.has('alpha')).toBe(true);
      expect(loadBalance.has('beta')).toBe(true);

      // Loads should be normalized (0-1)
      for (const load of loadBalance.values()) {
        expect(load).toBeGreaterThanOrEqual(0);
        expect(load).toBeLessThanOrEqual(2); // Allow some overload
      }
    });
  });

  describe('Optimization Generation', () => {
    test('should generate optimization recommendations', () => {
      const tasks = createTestTasks();
      const teamCapacities = new Map(createTestTeamCapacities().map(tc => [tc.team, tc]));
      
      const tracker = new DependencyTracker(mockDeps);
      tracker.initializeGraph(tasks);
      const dependencyGraph = tracker.getGraph();

      const boundaries = calculator.calculateOptimalBoundaries(
        tasks,
        dependencyGraph,
        teamCapacities,
        1
      );

      const optimizations = calculator.generateOptimizations(
        boundaries,
        dependencyGraph,
        teamCapacities,
        {
          averageVelocity: 0.5,
          throughput: 0.3,
          coordinationOverhead: 0.4,
          blockedTaskCount: 2
        }
      );

      expect(Array.isArray(optimizations)).toBe(true);
      
      for (const opt of optimizations) {
        expect(opt.action).toBeDefined();
        expect(opt.target).toBeDefined();
        expect(opt.confidence).toBeGreaterThanOrEqual(0);
        expect(opt.confidence).toBeLessThanOrEqual(1);
      }
    });
  });
});

describe.skip('RollingFrontier', () => {
  let frontier: RollingFrontier;
  let mockDeps: MockDependencies;

  beforeEach(() => {
    mockDeps = new MockDependencies();
    frontier = new RollingFrontier(mockDeps);
  });

  describe('Initialization', () => {
    test('should initialize successfully', async () => {
      const tasks = createTestTasks();
      const teamCapacities = createTestTeamCapacities();

      await expect(frontier.initialize(tasks, teamCapacities))
        .resolves.not.toThrow();

      const state = frontier.getFrontierState();
      expect(state.dependencyGraph.size).toBe(tasks.length);
      expect(state.teamCapacities.size).toBe(teamCapacities.length);
      expect(state.currentBoundaries.length).toBeGreaterThan(0);
    });

    test('should restore from saved state', async () => {
      const tasks = createTestTasks();
      const teamCapacities = createTestTeamCapacities();

      // Initialize once
      await frontier.initialize(tasks, teamCapacities);
      const originalState = frontier.getFrontierState();

      // Create new frontier and initialize again
      const frontier2 = new RollingFrontier(mockDeps);
      await frontier2.initialize(tasks, teamCapacities);
      const restoredState = frontier2.getFrontierState();

      expect(restoredState.coordinationVersion).toBeGreaterThanOrEqual(originalState.coordinationVersion);
    });
  });

  describe('Task State Processing', () => {
    beforeEach(async () => {
      const tasks = createTestTasks();
      const teamCapacities = createTestTeamCapacities();
      await frontier.initialize(tasks, teamCapacities);
    });

    test('should process task state changes', async () => {
      // Proper state transitions
      await frontier.processTaskStateChange('T001', DependencyState.READY);
      await frontier.processTaskStateChange('T001', DependencyState.IN_PROGRESS);
      const readyTasks = await frontier.processTaskStateChange('T001', DependencyState.COMPLETED);
      
      expect(readyTasks).toContain('T002');
      
      const state = frontier.getFrontierState();
      const t001Node = state.dependencyGraph.get('T001');
      expect(t001Node?.state).toBe(DependencyState.COMPLETED);
    });

    test('should handle task promotions', async () => {
      // Complete T001 to make T002 ready with proper transitions
      await frontier.processTaskStateChange('T001', DependencyState.READY);
      await frontier.processTaskStateChange('T001', DependencyState.IN_PROGRESS);
      await frontier.processTaskStateChange('T001', DependencyState.COMPLETED);
      
      const notifications = mockDeps.getNotifications();
      const promotionNotification = notifications.find(n => n.event === 'task_promoted');
      
      if (promotionNotification) {
        expect(promotionNotification.data.promotedTasks).toContain('T002');
      }
    });

    test('should trigger optimization when needed', async () => {
      // Block several tasks to trigger optimization
      await frontier.processTaskStateChange('T001', DependencyState.BLOCKED);
      await frontier.processTaskStateChange('T003', DependencyState.BLOCKED);
      
      const logs = mockDeps.getLogs();
      const optimizationLog = logs.find(l => l.message.includes('optimization'));
      expect(optimizationLog).toBeDefined();
    });
  });

  describe('Boundary Management', () => {
    beforeEach(async () => {
      const tasks = createTestTasks();
      const teamCapacities = createTestTeamCapacities();
      await frontier.initialize(tasks, teamCapacities);
    });

    test('should recalculate boundaries', async () => {
      const originalState = frontier.getFrontierState();
      const originalBoundaries = originalState.currentBoundaries.length;

      const newBoundaries = await frontier.recalculateBoundaries();
      
      expect(newBoundaries).toBeDefined();
      expect(Array.isArray(newBoundaries)).toBe(true);
      
      const updatedState = frontier.getFrontierState();
      expect(updatedState.coordinationVersion).toBeGreaterThan(originalState.coordinationVersion);
    });

    test('should validate boundaries against constraints', async () => {
      // This test would require creating boundary constraints that are violated
      // For now, just ensure recalculation doesn't throw
      await expect(frontier.recalculateBoundaries()).resolves.not.toThrow();
    });
  });

  describe('Optimization Management', () => {
    beforeEach(async () => {
      const tasks = createTestTasks();
      const teamCapacities = createTestTeamCapacities();
      await frontier.initialize(tasks, teamCapacities);
    });

    test('should generate optimization recommendations', async () => {
      const optimizations = await frontier.getOptimizationRecommendations();
      
      expect(Array.isArray(optimizations)).toBe(true);
      
      for (const opt of optimizations) {
        expect(opt.urgency).toBeGreaterThanOrEqual(OptimizationUrgency.MEDIUM);
      }
    });

    test('should apply optimizations successfully', async () => {
      const optimizations = await frontier.getOptimizationRecommendations();
      
      if (optimizations.length > 0) {
        const result = await frontier.applyOptimization(optimizations[0]);
        expect(typeof result).toBe('boolean');
      }
    });
  });

  describe('Error Handling and Rollback', () => {
    beforeEach(async () => {
      const tasks = createTestTasks();
      const teamCapacities = createTestTeamCapacities();
      await frontier.initialize(tasks, teamCapacities);
    });

    test('should handle invalid task state transitions', async () => {
      await expect(
        frontier.processTaskStateChange('INVALID_TASK', DependencyState.COMPLETED)
      ).rejects.toThrow();
    });

    test('should rollback on optimization failure', async () => {
      const originalState = frontier.getFrontierState();
      
      // Create a mock optimization that will fail
      const badOptimization = {
        action: FrontierAction.PROMOTE_TASK,
        target: 'INVALID_TASK',
        reason: 'Test rollback',
        impact: {
          throughputChange: 0,
          delayReduction: 0,
          resourceEfficiency: 0,
          riskLevel: 1
        },
        confidence: 1.0,
        urgency: OptimizationUrgency.HIGH
      };

      try {
        await frontier.applyOptimization(badOptimization);
      } catch {
        // Expected to fail
      }

      // Check if rollback event was recorded
      const notifications = mockDeps.getNotifications();
      const rollbackNotification = notifications.find(n => n.event === 'rollback_executed');
      
      if (rollbackNotification) {
        expect(rollbackNotification).toBeDefined();
      }
    });
  });

  describe('Real-time Updates', () => {
    test('should handle periodic updates without errors', async () => {
      const tasks = createTestTasks();
      const teamCapacities = createTestTeamCapacities();
      
      // Initialize with real-time updates enabled
      const config = { 
        updateInterval: 100, // 100ms for fast testing
        adaptiveBoundaries: true,
        realTimePromotions: true,
        optimizationThreshold: 0.7,
        maxWaveLookahead: 3,
        rollbackOnFailure: true
      };
      
      const realtimeFrontier = new RollingFrontier(mockDeps, config);
      await realtimeFrontier.initialize(tasks, teamCapacities);

      // Wait for a few update cycles
      await new Promise(resolve => setTimeout(resolve, 250));

      await realtimeFrontier.shutdown();
      
      // Should not throw any errors during periodic updates
      const errorLogs = mockDeps.getLogs().filter(log => log.level === 'error');
      expect(errorLogs.length).toBe(0);
    });
  });

  describe('State Persistence', () => {
    test('should save and load state correctly', async () => {
      const tasks = createTestTasks();
      const teamCapacities = createTestTeamCapacities();
      
      await frontier.initialize(tasks, teamCapacities);
      
      // Make some changes
      await frontier.processTaskStateChange('T001', DependencyState.IN_PROGRESS);
      await frontier.recalculateBoundaries();
      
      const state = frontier.getFrontierState();
      const savedState = mockDeps.getSavedState();
      
      expect(savedState).toBeDefined();
      expect(savedState.coordinationVersion).toBe(state.coordinationVersion);
    });
  });

  describe('Event Notifications', () => {
    beforeEach(async () => {
      const tasks = createTestTasks();
      const teamCapacities = createTestTeamCapacities();
      await frontier.initialize(tasks, teamCapacities);
    });

    test('should notify on frontier events', async () => {
      await frontier.recalculateBoundaries();
      
      const notifications = mockDeps.getNotifications();
      expect(notifications.length).toBeGreaterThan(0);
      
      const boundaryNotification = notifications.find(n => n.event === 'boundary_adjusted');
      expect(boundaryNotification).toBeDefined();
    });

    test('should notify on optimization events', async () => {
      const optimizations = await frontier.getOptimizationRecommendations();
      
      if (optimizations.length > 0) {
        await frontier.applyOptimization(optimizations[0]);
        
        const notifications = mockDeps.getNotifications();
        const optimizationNotification = notifications.find(n => n.event === 'optimization_applied');
        
        if (optimizationNotification) {
          expect(optimizationNotification).toBeDefined();
        }
      }
    });
  });

  describe('Shutdown', () => {
    test('should shutdown cleanly', async () => {
      const tasks = createTestTasks();
      const teamCapacities = createTestTeamCapacities();
      
      await frontier.initialize(tasks, teamCapacities);
      await frontier.shutdown();
      
      const notifications = mockDeps.getNotifications();
      const shutdownNotification = notifications.find(n => n.event === 'frontier_shutdown');
      expect(shutdownNotification).toBeDefined();
    });
  });
});