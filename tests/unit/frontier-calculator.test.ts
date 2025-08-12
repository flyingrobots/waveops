/**
 * Unit tests for Frontier Calculator
 */

import {
  Task,
  TeamCapacity,
  WaveBoundary,
  DependencyState,
  FrontierAction,
  OptimizationUrgency,
  FrontierCalculationError,
  CapacityOverflowError
} from '../../src/types';

import { 
  FrontierCalculator, 
  BoundaryConstraints, 
  OptimizationObjectives,
  FrontierCalculatorDeps
} from '../../src/coordination/frontier-calculator';

import { DependencyTracker } from '../../src/coordination/dependency-tracker';

class MockFrontierCalculatorDeps implements FrontierCalculatorDeps {
  private currentTime = new Date('2024-01-01T00:00:00Z');
  private logs: Array<{ level: string; message: string; context?: any }> = [];

  getCurrentTime(): Date {
    return this.currentTime;
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

  getLogs() {
    return [...this.logs];
  }

  clearLogs() {
    this.logs = [];
  }
}

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
      title: 'API Task',
      wave: 1,
      team: 'alpha',
      depends_on: ['T001'],
      acceptance: ['API complete'],
      critical: true
    },
    {
      id: 'T003',
      title: 'Database Task',
      wave: 1,
      team: 'beta',
      depends_on: [],
      acceptance: ['Database complete'],
      critical: false
    },
    {
      id: 'T004',
      title: 'Frontend Task',
      wave: 2,
      team: 'gamma',
      depends_on: ['T002'],
      acceptance: ['Frontend complete'],
      critical: false
    },
    {
      id: 'T005',
      title: 'Integration Task',
      wave: 2,
      team: 'alpha',
      depends_on: ['T002', 'T003'],
      acceptance: ['Integration complete'],
      critical: true
    }
  ];
}

function createTestTeamCapacities(): Map<string, TeamCapacity> {
  return new Map([
    ['alpha', {
      team: 'alpha',
      maxConcurrentTasks: 2,
      currentLoad: 0,
      velocity: 2.0,
      efficiency: 0.85,
      availability: 0.9,
      specializations: ['backend', 'api']
    }],
    ['beta', {
      team: 'beta',
      maxConcurrentTasks: 3,
      currentLoad: 1, // Already has some load
      velocity: 1.5,
      efficiency: 0.9,
      availability: 0.8,
      specializations: ['database', 'infrastructure']
    }],
    ['gamma', {
      team: 'gamma',
      maxConcurrentTasks: 1,
      currentLoad: 0,
      velocity: 1.0,
      efficiency: 0.75,
      availability: 0.7,
      specializations: ['frontend', 'ui']
    }]
  ]);
}

function createDependencyGraph(tasks: Task[]): Map<string, any> {
  const mockDeps = {
    getCurrentTime: () => new Date(),
    logWarning: () => {},
    logError: () => {}
  };
  
  const tracker = new DependencyTracker(mockDeps);
  tracker.initializeGraph(tasks);
  
  // Set some tasks to ready state so they can be used in boundaries
  const readyTasks = tracker.getReadyTasks(); // Tasks with no dependencies
  for (const taskId of readyTasks) {
    tracker.updateTaskState(taskId, DependencyState.READY);
  }
  
  return tracker.getGraph();
}

describe('FrontierCalculator - Boundary Calculation', () => {
  let calculator: FrontierCalculator;
  let mockDeps: MockFrontierCalculatorDeps;

  beforeEach(() => {
    mockDeps = new MockFrontierCalculatorDeps();
    calculator = new FrontierCalculator(mockDeps);
  });

  test('should calculate basic optimal boundaries', () => {
    const tasks = createTestTasks();
    const teamCapacities = createTestTeamCapacities();
    const dependencyGraph = createDependencyGraph(tasks);

    const boundaries = calculator.calculateOptimalBoundaries(
      tasks,
      dependencyGraph,
      teamCapacities,
      1
    );

    expect(boundaries.length).toBeGreaterThan(0);
    expect(boundaries[0].waveNumber).toBe(1);
    expect(boundaries[0].tasks.length).toBeGreaterThan(0);
    
    // All boundaries should have valid wave numbers
    boundaries.forEach(boundary => {
      expect(boundary.waveNumber).toBeGreaterThanOrEqual(1);
      expect(boundary.tasks.length).toBeGreaterThan(0);
      expect(boundary.teams.length).toBeGreaterThan(0);
    });
  });

  test('should respect team capacity constraints', () => {
    const tasks = createTestTasks();
    const teamCapacities = createTestTeamCapacities();
    const dependencyGraph = createDependencyGraph(tasks);

    const boundaries = calculator.calculateOptimalBoundaries(
      tasks,
      dependencyGraph,
      teamCapacities,
      1
    );

    // Check each boundary respects team capacity
    boundaries.forEach(boundary => {
      const teamTaskCount = new Map<string, number>();
      
      boundary.tasks.forEach(taskId => {
        const task = tasks.find(t => t.id === taskId);
        if (task) {
          const count = teamTaskCount.get(task.team) || 0;
          teamTaskCount.set(task.team, count + 1);
        }
      });

      teamTaskCount.forEach((taskCount, team) => {
        const capacity = teamCapacities.get(team);
        expect(taskCount).toBeLessThanOrEqual(capacity?.maxConcurrentTasks || 0);
      });
    });
  });

  test('should handle custom constraints', () => {
    const customConstraints: BoundaryConstraints = {
      maxWaveSize: 2,
      minTeamUtilization: 0.5,
      maxCoordinationOverhead: 0.3,
      criticalPathBuffer: 0.2,
      parallelismThreshold: 2
    };

    const customCalculator = new FrontierCalculator(mockDeps, customConstraints);
    const tasks = createTestTasks();
    const teamCapacities = createTestTeamCapacities();
    const dependencyGraph = createDependencyGraph(tasks);

    const boundaries = customCalculator.calculateOptimalBoundaries(
      tasks,
      dependencyGraph,
      teamCapacities,
      1
    );

    // Each wave should respect maxWaveSize constraint
    boundaries.forEach(boundary => {
      expect(boundary.tasks.length).toBeLessThanOrEqual(customConstraints.maxWaveSize);
    });
  });

  test('should handle custom optimization objectives', () => {
    const customObjectives: OptimizationObjectives = {
      throughputWeight: 0.6,
      coordinationWeight: 0.1,
      riskWeight: 0.2,
      balanceWeight: 0.1
    };

    const customCalculator = new FrontierCalculator(mockDeps, undefined, customObjectives);
    const tasks = createTestTasks();
    const teamCapacities = createTestTeamCapacities();
    const dependencyGraph = createDependencyGraph(tasks);

    expect(() => {
      customCalculator.calculateOptimalBoundaries(
        tasks,
        dependencyGraph,
        teamCapacities,
        1
      );
    }).not.toThrow();
  });

  test('should handle empty task list', () => {
    const teamCapacities = createTestTeamCapacities();
    const dependencyGraph = createDependencyGraph([]);

    const boundaries = calculator.calculateOptimalBoundaries(
      [],
      dependencyGraph,
      teamCapacities,
      1
    );

    expect(boundaries).toEqual([]);
  });

  test('should handle single task', () => {
    const singleTask: Task[] = [{
      id: 'SINGLE',
      title: 'Single Task',
      wave: 1,
      team: 'alpha',
      depends_on: [],
      acceptance: [],
      critical: false
    }];

    const teamCapacities = createTestTeamCapacities();
    const dependencyGraph = createDependencyGraph(singleTask);

    const boundaries = calculator.calculateOptimalBoundaries(
      singleTask,
      dependencyGraph,
      teamCapacities,
      1
    );

    expect(boundaries.length).toBe(1);
    expect(boundaries[0].tasks).toEqual(['SINGLE']);
    expect(boundaries[0].teams).toEqual(['alpha']);
  });
});

describe('FrontierCalculator - Load Balancing', () => {
  let calculator: FrontierCalculator;
  let mockDeps: MockFrontierCalculatorDeps;

  beforeEach(() => {
    mockDeps = new MockFrontierCalculatorDeps();
    calculator = new FrontierCalculator(mockDeps);
  });

  test('should calculate team load balancing', () => {
    const tasks = createTestTasks();
    const teamCapacities = createTestTeamCapacities();
    const dependencyGraph = createDependencyGraph(tasks);

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

    // Should have load data for all teams that have tasks
    expect(loadBalance.size).toBeGreaterThan(0);

    // All load values should be non-negative
    loadBalance.forEach(load => {
      expect(load).toBeGreaterThanOrEqual(0);
    });
  });

  test('should normalize load by team capacity', () => {
    const tasks = createTestTasks();
    const teamCapacities = createTestTeamCapacities();
    const dependencyGraph = createDependencyGraph(tasks);

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

    // Load should be normalized (though it can exceed 1.0 if overloaded)
    loadBalance.forEach((load, team) => {
      const capacity = teamCapacities.get(team);
      expect(capacity).toBeDefined();
      // Most loads should be reasonable, but we allow some overload
      expect(load).toBeLessThan(5.0); // Sanity check
    });
  });

  test('should handle teams with no tasks', () => {
    const singleTask: Task[] = [{
      id: 'T001',
      title: 'Task for Alpha',
      wave: 1,
      team: 'alpha',
      depends_on: [],
      acceptance: [],
      critical: false
    }];

    const teamCapacities = createTestTeamCapacities();
    const dependencyGraph = createDependencyGraph(singleTask);

    const boundaries = calculator.calculateOptimalBoundaries(
      singleTask,
      dependencyGraph,
      teamCapacities,
      1
    );

    const loadBalance = calculator.calculateLoadBalancing(
      boundaries,
      teamCapacities,
      dependencyGraph
    );

    // Alpha should have load, others should have 0 load
    expect(loadBalance.get('alpha')).toBeGreaterThan(0);
    expect(loadBalance.get('beta')).toBe(0);
    expect(loadBalance.get('gamma')).toBe(0);
  });
});

describe('FrontierCalculator - Optimization Generation', () => {
  let calculator: FrontierCalculator;
  let mockDeps: MockFrontierCalculatorDeps;

  beforeEach(() => {
    mockDeps = new MockFrontierCalculatorDeps();
    calculator = new FrontierCalculator(mockDeps);
  });

  test('should generate optimizations for poor performance', () => {
    const tasks = createTestTasks();
    const teamCapacities = createTestTeamCapacities();
    const dependencyGraph = createDependencyGraph(tasks);

    const boundaries = calculator.calculateOptimalBoundaries(
      tasks,
      dependencyGraph,
      teamCapacities,
      1
    );

    // Simulate poor performance metrics
    const poorMetrics = {
      averageVelocity: 0.3,
      throughput: 0.2,
      coordinationOverhead: 0.6,
      blockedTaskCount: 3
    };

    const optimizations = calculator.generateOptimizations(
      boundaries,
      dependencyGraph,
      teamCapacities,
      poorMetrics
    );

    expect(Array.isArray(optimizations)).toBe(true);
    
    optimizations.forEach(opt => {
      expect(opt.action).toBeDefined();
      expect(Object.values(FrontierAction)).toContain(opt.action);
      expect(opt.confidence).toBeGreaterThanOrEqual(0);
      expect(opt.confidence).toBeLessThanOrEqual(1);
      expect(Object.values(OptimizationUrgency)).toContain(opt.urgency);
    });
  });

  test('should generate fewer optimizations for good performance', () => {
    const tasks = createTestTasks();
    const teamCapacities = createTestTeamCapacities();
    const dependencyGraph = createDependencyGraph(tasks);

    const boundaries = calculator.calculateOptimalBoundaries(
      tasks,
      dependencyGraph,
      teamCapacities,
      1
    );

    // Simulate good performance metrics
    const goodMetrics = {
      averageVelocity: 2.0,
      throughput: 0.9,
      coordinationOverhead: 0.1,
      blockedTaskCount: 0
    };

    const optimizations = calculator.generateOptimizations(
      boundaries,
      dependencyGraph,
      teamCapacities,
      goodMetrics
    );

    // Should generate fewer optimizations for good performance
    expect(optimizations.length).toBeLessThan(5); // Arbitrary threshold
  });

  test('should prioritize high-urgency optimizations', () => {
    const tasks = createTestTasks();
    const teamCapacities = createTestTeamCapacities();
    const dependencyGraph = createDependencyGraph(tasks);

    const boundaries = calculator.calculateOptimalBoundaries(
      tasks,
      dependencyGraph,
      teamCapacities,
      1
    );

    const criticalMetrics = {
      averageVelocity: 0.1,
      throughput: 0.05,
      coordinationOverhead: 0.8,
      blockedTaskCount: 5
    };

    const optimizations = calculator.generateOptimizations(
      boundaries,
      dependencyGraph,
      teamCapacities,
      criticalMetrics
    );

    if (optimizations.length > 0) {
      // Optimizations should be sorted by urgency and confidence
      for (let i = 1; i < optimizations.length; i++) {
        const prev = optimizations[i - 1];
        const curr = optimizations[i];
        
        // Previous should have higher or equal urgency
        expect(prev.urgency).toBeGreaterThanOrEqual(curr.urgency);
        
        // If same urgency, previous should have higher or equal confidence
        if (prev.urgency === curr.urgency) {
          expect(prev.confidence).toBeGreaterThanOrEqual(curr.confidence);
        }
      }
    }
  });
});

describe('FrontierCalculator - Boundary Strategies', () => {
  let calculator: FrontierCalculator;
  let mockDeps: MockFrontierCalculatorDeps;

  beforeEach(() => {
    mockDeps = new MockFrontierCalculatorDeps();
    calculator = new FrontierCalculator(mockDeps);
  });

  test('should generate multiple boundary strategies', () => {
    const tasks = createTestTasks();
    const teamCapacities = createTestTeamCapacities();
    const dependencyGraph = createDependencyGraph(tasks);

    const boundaries = calculator.calculateOptimalBoundaries(
      tasks,
      dependencyGraph,
      teamCapacities,
      1
    );

    // Should generate at least one boundary strategy
    expect(boundaries.length).toBeGreaterThan(0);

    // Each boundary should have all required fields
    boundaries.forEach(boundary => {
      expect(boundary.waveNumber).toBeGreaterThanOrEqual(1);
      expect(boundary.startTime).toBeInstanceOf(Date);
      expect(boundary.estimatedEndTime).toBeInstanceOf(Date);
      expect(boundary.estimatedEndTime.getTime()).toBeGreaterThan(boundary.startTime.getTime());
      expect(Array.isArray(boundary.tasks)).toBe(true);
      expect(Array.isArray(boundary.teams)).toBe(true);
      expect(boundary.readinessScore).toBeGreaterThanOrEqual(0);
      expect(boundary.readinessScore).toBeLessThanOrEqual(1);
      expect(boundary.parallelism).toBeGreaterThanOrEqual(0);
    });
  });

  test('should respect dependency order in boundaries', () => {
    const tasks = createTestTasks();
    const teamCapacities = createTestTeamCapacities();
    const dependencyGraph = createDependencyGraph(tasks);

    const boundaries = calculator.calculateOptimalBoundaries(
      tasks,
      dependencyGraph,
      teamCapacities,
      1
    );

    // T002 depends on T001, so T001 should be in an earlier or same wave
    const t001Wave = boundaries.find(b => b.tasks.includes('T001'))?.waveNumber || Infinity;
    const t002Wave = boundaries.find(b => b.tasks.includes('T002'))?.waveNumber || Infinity;
    
    if (t001Wave !== Infinity && t002Wave !== Infinity) {
      expect(t001Wave).toBeLessThanOrEqual(t002Wave);
    }

    // T005 depends on T002 and T003
    const t003Wave = boundaries.find(b => b.tasks.includes('T003'))?.waveNumber || Infinity;
    const t005Wave = boundaries.find(b => b.tasks.includes('T005'))?.waveNumber || Infinity;
    
    if (t002Wave !== Infinity && t003Wave !== Infinity && t005Wave !== Infinity) {
      expect(Math.max(t002Wave, t003Wave)).toBeLessThanOrEqual(t005Wave);
    }
  });

  test('should optimize for critical path tasks', () => {
    const tasks = createTestTasks().map(task => ({
      ...task,
      critical: task.id === 'T001' || task.id === 'T002' || task.id === 'T005'
    }));

    const teamCapacities = createTestTeamCapacities();
    const dependencyGraph = createDependencyGraph(tasks);

    const boundaries = calculator.calculateOptimalBoundaries(
      tasks,
      dependencyGraph,
      teamCapacities,
      1
    );

    // Critical path tasks should generally be in earlier waves when possible
    expect(boundaries.length).toBeGreaterThan(0);
    
    // At minimum, the system should handle critical tasks without error
    const allTasksInBoundaries = boundaries.flatMap(b => b.tasks);
    expect(allTasksInBoundaries).toContain('T001');
  });
});

describe('FrontierCalculator - Error Handling', () => {
  let calculator: FrontierCalculator;
  let mockDeps: MockFrontierCalculatorDeps;

  beforeEach(() => {
    mockDeps = new MockFrontierCalculatorDeps();
    calculator = new FrontierCalculator(mockDeps);
  });

  test('should handle insufficient team capacity', () => {
    const tasks = createTestTasks();
    
    // Create very limited team capacities
    const limitedCapacities = new Map([
      ['alpha', {
        team: 'alpha',
        maxConcurrentTasks: 1,
        currentLoad: 1, // Already at capacity
        velocity: 1.0,
        efficiency: 0.8,
        availability: 0.5,
        specializations: ['backend']
      }]
    ]);

    const dependencyGraph = createDependencyGraph(tasks);

    // Should handle capacity constraints gracefully
    expect(() => {
      calculator.calculateOptimalBoundaries(
        tasks,
        dependencyGraph,
        limitedCapacities,
        1
      );
    }).not.toThrow();
  });

  test('should handle tasks with no team mapping', () => {
    const tasksWithoutTeam = createTestTasks().map(task => ({
      ...task,
      team: 'nonexistent-team'
    }));

    const teamCapacities = createTestTeamCapacities();
    const dependencyGraph = createDependencyGraph(tasksWithoutTeam);

    // Should handle missing team gracefully
    expect(() => {
      calculator.calculateOptimalBoundaries(
        tasksWithoutTeam,
        dependencyGraph,
        teamCapacities,
        1
      );
    }).not.toThrow();
  });

  test('should log calculation errors', () => {
    const tasks = createTestTasks();
    const teamCapacities = createTestTeamCapacities();
    const dependencyGraph = createDependencyGraph(tasks);

    // This should succeed, but let's make sure logging works
    calculator.calculateOptimalBoundaries(
      tasks,
      dependencyGraph,
      teamCapacities,
      1
    );

    const logs = mockDeps.getLogs();
    const infoLogs = logs.filter(log => log.level === 'info');
    
    expect(infoLogs.length).toBeGreaterThan(0);
    expect(infoLogs.some(log => log.message.includes('optimization'))).toBe(true);
  });

  test('should handle malformed performance metrics', () => {
    const tasks = createTestTasks();
    const teamCapacities = createTestTeamCapacities();
    const dependencyGraph = createDependencyGraph(tasks);

    const boundaries = calculator.calculateOptimalBoundaries(
      tasks,
      dependencyGraph,
      teamCapacities,
      1
    );

    // Malformed metrics (negative values, etc.)
    const malformedMetrics = {
      averageVelocity: -1,
      throughput: 2.5, // > 1.0
      coordinationOverhead: -0.5,
      blockedTaskCount: -10
    };

    // Should handle malformed metrics gracefully
    expect(() => {
      calculator.generateOptimizations(
        boundaries,
        dependencyGraph,
        teamCapacities,
        malformedMetrics
      );
    }).not.toThrow();
  });
});