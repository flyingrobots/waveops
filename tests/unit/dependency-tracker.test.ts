/**
 * Unit tests for Dependency Tracker
 */

import {
  Task,
  DependencyState,
  DependencyViolationError
} from '../../src/types';

import { DependencyTracker, DependencyInjectable } from '../../src/coordination/dependency-tracker';

class MockDependencyTrackerDeps implements DependencyInjectable {
  private currentTime = new Date('2024-01-01T00:00:00Z');
  private logs: Array<{ level: string; message: string; context?: any }> = [];

  getCurrentTime(): Date {
    return this.currentTime;
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

function createLinearDependencyTasks(): Task[] {
  return [
    {
      id: 'A',
      title: 'Task A',
      wave: 1,
      team: 'alpha',
      depends_on: [],
      acceptance: [],
      critical: true
    },
    {
      id: 'B',
      title: 'Task B',
      wave: 1,
      team: 'alpha',
      depends_on: ['A'],
      acceptance: [],
      critical: true
    },
    {
      id: 'C',
      title: 'Task C',
      wave: 1,
      team: 'beta',
      depends_on: ['B'],
      acceptance: [],
      critical: false
    }
  ];
}

function createDiamondDependencyTasks(): Task[] {
  return [
    {
      id: 'A',
      title: 'Root Task',
      wave: 1,
      team: 'alpha',
      depends_on: [],
      acceptance: [],
      critical: true
    },
    {
      id: 'B',
      title: 'Left Branch',
      wave: 1,
      team: 'alpha',
      depends_on: ['A'],
      acceptance: [],
      critical: true
    },
    {
      id: 'C',
      title: 'Right Branch',
      wave: 1,
      team: 'beta',
      depends_on: ['A'],
      acceptance: [],
      critical: true
    },
    {
      id: 'D',
      title: 'Merge Task',
      wave: 2,
      team: 'alpha',
      depends_on: ['B', 'C'],
      acceptance: [],
      critical: true
    }
  ];
}

describe('DependencyTracker - Graph Construction', () => {
  let tracker: DependencyTracker;
  let mockDeps: MockDependencyTrackerDeps;

  beforeEach(() => {
    mockDeps = new MockDependencyTrackerDeps();
    tracker = new DependencyTracker(mockDeps);
  });

  test('should build simple linear dependency chain', () => {
    const tasks = createLinearDependencyTasks();
    
    expect(() => tracker.initializeGraph(tasks)).not.toThrow();
    
    const graph = tracker.getGraph();
    expect(graph.size).toBe(3);
    
    // Check forward dependencies
    const nodeA = graph.get('A');
    expect(nodeA?.dependsOn).toEqual([]);
    expect(nodeA?.dependedBy).toEqual(['B']);
    
    const nodeB = graph.get('B');
    expect(nodeB?.dependsOn).toEqual(['A']);
    expect(nodeB?.dependedBy).toEqual(['C']);
    
    const nodeC = graph.get('C');
    expect(nodeC?.dependsOn).toEqual(['B']);
    expect(nodeC?.dependedBy).toEqual([]);
  });

  test('should build diamond dependency pattern', () => {
    const tasks = createDiamondDependencyTasks();
    
    tracker.initializeGraph(tasks);
    const graph = tracker.getGraph();
    
    const nodeA = graph.get('A');
    expect(nodeA?.dependedBy).toContain('B');
    expect(nodeA?.dependedBy).toContain('C');
    
    const nodeD = graph.get('D');
    expect(nodeD?.dependsOn).toContain('B');
    expect(nodeD?.dependsOn).toContain('C');
  });

  test('should calculate blocking factors correctly', () => {
    const tasks = createLinearDependencyTasks();
    
    tracker.initializeGraph(tasks);
    const graph = tracker.getGraph();
    
    // A blocks 2 tasks (B and C transitively)
    expect(graph.get('A')?.blockingFactor).toBe(2);
    
    // B blocks 1 task (C)
    expect(graph.get('B')?.blockingFactor).toBe(1);
    
    // C blocks 0 tasks
    expect(graph.get('C')?.blockingFactor).toBe(0);
  });

  test('should detect missing dependencies', () => {
    const invalidTasks: Task[] = [
      {
        id: 'A',
        title: 'Task A',
        wave: 1,
        team: 'alpha',
        depends_on: ['MISSING'],
        acceptance: [],
        critical: false
      }
    ];

    expect(() => tracker.initializeGraph(invalidTasks))
      .toThrow(DependencyViolationError);
  });

  test('should detect simple circular dependency', () => {
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
        depends_on: ['A'],
        acceptance: [],
        critical: false
      }
    ];

    expect(() => tracker.initializeGraph(circularTasks))
      .toThrow(DependencyViolationError);
  });

  test('should detect complex circular dependency', () => {
    const circularTasks: Task[] = [
      {
        id: 'A',
        title: 'Task A',
        wave: 1,
        team: 'alpha',
        depends_on: ['C'],
        acceptance: [],
        critical: false
      },
      {
        id: 'B',
        title: 'Task B',
        wave: 1,
        team: 'alpha',
        depends_on: ['A'],
        acceptance: [],
        critical: false
      },
      {
        id: 'C',
        title: 'Task C',
        wave: 1,
        team: 'alpha',
        depends_on: ['B'],
        acceptance: [],
        critical: false
      }
    ];

    expect(() => tracker.initializeGraph(circularTasks))
      .toThrow(DependencyViolationError);
  });
});

describe('DependencyTracker - State Management', () => {
  let tracker: DependencyTracker;
  let mockDeps: MockDependencyTrackerDeps;

  beforeEach(() => {
    mockDeps = new MockDependencyTrackerDeps();
    tracker = new DependencyTracker(mockDeps);
    tracker.initializeGraph(createLinearDependencyTasks());
  });

  test('should validate state transitions', () => {
    // Valid transition: WAITING -> READY
    expect(() => tracker.updateTaskState('A', DependencyState.READY)).not.toThrow();
    
    // Valid transition: READY -> IN_PROGRESS
    expect(() => tracker.updateTaskState('A', DependencyState.IN_PROGRESS)).not.toThrow();
    
    // Valid transition: IN_PROGRESS -> COMPLETED
    expect(() => tracker.updateTaskState('A', DependencyState.COMPLETED)).not.toThrow();
  });

  test('should reject invalid state transitions', () => {
    // Invalid: WAITING -> COMPLETED (must go through IN_PROGRESS)
    expect(() => tracker.updateTaskState('A', DependencyState.COMPLETED))
      .toThrow(DependencyViolationError);
    
    // Invalid: COMPLETED -> WAITING (terminal state)
    tracker.updateTaskState('A', DependencyState.READY);
    tracker.updateTaskState('A', DependencyState.IN_PROGRESS);
    tracker.updateTaskState('A', DependencyState.COMPLETED);
    
    expect(() => tracker.updateTaskState('A', DependencyState.WAITING))
      .toThrow(DependencyViolationError);
  });

  test('should propagate readiness when task completes', () => {
    // Mark A as ready and in progress
    tracker.updateTaskState('A', DependencyState.READY);
    tracker.updateTaskState('A', DependencyState.IN_PROGRESS);
    
    // Complete A - should make B ready
    const readyTasks = tracker.updateTaskState('A', DependencyState.COMPLETED);
    
    expect(readyTasks).toContain('B');
    
    const graph = tracker.getGraph();
    expect(graph.get('A')?.state).toBe(DependencyState.COMPLETED);
    expect(graph.get('B')?.state).toBe(DependencyState.WAITING); // Still waiting until marked ready
  });

  test('should handle multiple dependencies correctly', () => {
    const tasks = createDiamondDependencyTasks();
    tracker = new DependencyTracker(mockDeps);
    tracker.initializeGraph(tasks);
    
    // Complete A
    tracker.updateTaskState('A', DependencyState.READY);
    tracker.updateTaskState('A', DependencyState.IN_PROGRESS);
    let readyTasks = tracker.updateTaskState('A', DependencyState.COMPLETED);
    
    expect(readyTasks).toContain('B');
    expect(readyTasks).toContain('C');
    
    // Complete B but not C - D should not be ready yet
    tracker.updateTaskState('B', DependencyState.READY);
    tracker.updateTaskState('B', DependencyState.IN_PROGRESS);
    readyTasks = tracker.updateTaskState('B', DependencyState.COMPLETED);
    
    expect(readyTasks).not.toContain('D');
    
    // Complete C - now D should be ready
    tracker.updateTaskState('C', DependencyState.READY);
    tracker.updateTaskState('C', DependencyState.IN_PROGRESS);
    readyTasks = tracker.updateTaskState('C', DependencyState.COMPLETED);
    
    expect(readyTasks).toContain('D');
  });

  test('should handle blocked state correctly', () => {
    tracker.updateTaskState('A', DependencyState.BLOCKED);
    
    let graph = tracker.getGraph();
    expect(graph.get('A')?.state).toBe(DependencyState.BLOCKED);
    
    // Unblock - should go back to waiting first
    tracker.updateTaskState('A', DependencyState.WAITING);
    graph = tracker.getGraph(); // Get fresh graph reference
    expect(graph.get('A')?.state).toBe(DependencyState.WAITING);
    
    // Then can be made ready
    tracker.updateTaskState('A', DependencyState.READY);
    graph = tracker.getGraph(); // Get fresh graph reference
    expect(graph.get('A')?.state).toBe(DependencyState.READY);
  });

  test('should handle failed state with retry', () => {
    tracker.updateTaskState('A', DependencyState.READY);
    tracker.updateTaskState('A', DependencyState.IN_PROGRESS);
    tracker.updateTaskState('A', DependencyState.FAILED);
    
    // Should be able to retry from failed
    expect(() => tracker.updateTaskState('A', DependencyState.WAITING)).not.toThrow();
    expect(() => tracker.updateTaskState('A', DependencyState.READY)).not.toThrow();
  });
});

describe('DependencyTracker - Analysis', () => {
  let tracker: DependencyTracker;
  let mockDeps: MockDependencyTrackerDeps;

  beforeEach(() => {
    mockDeps = new MockDependencyTrackerDeps();
    tracker = new DependencyTracker(mockDeps);
  });

  test('should calculate critical path for linear dependencies', () => {
    tracker.initializeGraph(createLinearDependencyTasks());
    const analysis = tracker.analyzeGraph();
    
    expect(analysis.criticalPath).toEqual(['A', 'B', 'C']);
    expect(analysis.criticalPathLength).toBe(3); // 3 tasks with effort 1 each
  });

  test('should calculate critical path for diamond dependencies', () => {
    tracker.initializeGraph(createDiamondDependencyTasks());
    const analysis = tracker.analyzeGraph();
    
    // Critical path should be one of: A->B->D or A->C->D
    expect(analysis.criticalPath).toContain('A');
    expect(analysis.criticalPath).toContain('D');
    expect(analysis.criticalPath.length).toBe(3);
  });

  test('should identify parallelizable tasks', () => {
    tracker.initializeGraph(createDiamondDependencyTasks());
    const analysis = tracker.analyzeGraph();
    
    // Level 0: A
    expect(analysis.parallelizableTasks[0]).toEqual(['A']);
    
    // Level 1: B and C can run in parallel
    expect(analysis.parallelizableTasks[1]).toContain('B');
    expect(analysis.parallelizableTasks[1]).toContain('C');
    
    // Level 2: D
    expect(analysis.parallelizableTasks[2]).toEqual(['D']);
  });

  test('should identify blocking tasks', () => {
    tracker.initializeGraph(createLinearDependencyTasks());
    const analysis = tracker.analyzeGraph();
    
    // Tasks should be sorted by blocking factor (highest first)
    expect(analysis.blockingTasks[0]).toBe('A'); // Blocks 2 tasks
    expect(analysis.blockingTasks[1]).toBe('B'); // Blocks 1 task
    // C doesn't appear as it blocks 0 tasks
  });

  test('should identify ready tasks', () => {
    tracker.initializeGraph(createDiamondDependencyTasks());
    const readyTasks = tracker.getReadyTasks();
    
    // Initially, only A should be ready (no dependencies)
    expect(readyTasks).toEqual(['A']);
    
    // After completing A, B and C should be ready
    tracker.updateTaskState('A', DependencyState.READY);
    tracker.updateTaskState('A', DependencyState.IN_PROGRESS);
    const newlyReadyTasks = tracker.updateTaskState('A', DependencyState.COMPLETED);
    
    // Check that B and C are now ready (returned from updateTaskState)
    expect(newlyReadyTasks).toContain('B');
    expect(newlyReadyTasks).toContain('C');
    
    // getReadyTasks should show B and C as ready (still in WAITING state but deps satisfied)
    const updatedReadyTasks = tracker.getReadyTasks();
    expect(updatedReadyTasks).toContain('B');
    expect(updatedReadyTasks).toContain('C');
  });

  test('should mark critical path nodes', () => {
    tracker.initializeGraph(createLinearDependencyTasks());
    tracker.analyzeGraph();
    
    const graph = tracker.getGraph();
    
    // All tasks in linear chain should be on critical path
    expect(graph.get('A')?.criticalPath).toBe(true);
    expect(graph.get('B')?.criticalPath).toBe(true);
    expect(graph.get('C')?.criticalPath).toBe(true);
  });

  test('should detect no circular dependencies in valid graph', () => {
    tracker.initializeGraph(createLinearDependencyTasks());
    const analysis = tracker.analyzeGraph();
    
    expect(analysis.circularDependencies).toEqual([]);
  });

  test('should handle empty graph', () => {
    tracker.initializeGraph([]);
    const analysis = tracker.analyzeGraph();
    
    expect(analysis.criticalPath).toEqual([]);
    expect(analysis.criticalPathLength).toBe(0);
    expect(analysis.parallelizableTasks).toEqual([]);
    expect(analysis.blockingTasks).toEqual([]);
    expect(analysis.readyTasks).toEqual([]);
    expect(analysis.circularDependencies).toEqual([]);
  });

  test('should handle single task graph', () => {
    const singleTask: Task[] = [{
      id: 'SINGLE',
      title: 'Single Task',
      wave: 1,
      team: 'alpha',
      depends_on: [],
      acceptance: [],
      critical: true
    }];
    
    tracker.initializeGraph(singleTask);
    const analysis = tracker.analyzeGraph();
    
    expect(analysis.criticalPath).toEqual(['SINGLE']);
    expect(analysis.criticalPathLength).toBe(1);
    expect(analysis.parallelizableTasks).toEqual([['SINGLE']]);
    expect(analysis.blockingTasks).toEqual([]); // Doesn't block anything
    expect(analysis.readyTasks).toEqual(['SINGLE']);
  });
});

describe('DependencyTracker - Error Handling', () => {
  let tracker: DependencyTracker;
  let mockDeps: MockDependencyTrackerDeps;

  beforeEach(() => {
    mockDeps = new MockDependencyTrackerDeps();
    tracker = new DependencyTracker(mockDeps);
  });

  test('should handle malformed task data gracefully', () => {
    const malformedTasks: Task[] = [
      {
        id: '',
        title: 'Empty ID Task',
        wave: 1,
        team: 'alpha',
        depends_on: [],
        acceptance: [],
        critical: false
      }
    ];

    // Should handle empty ID gracefully
    expect(() => tracker.initializeGraph(malformedTasks)).not.toThrow();
  });

  test('should reject state updates for non-existent tasks', () => {
    tracker.initializeGraph(createLinearDependencyTasks());
    
    expect(() => tracker.updateTaskState('NONEXISTENT', DependencyState.COMPLETED))
      .toThrow(DependencyViolationError);
  });

  test('should log warnings for suspicious patterns', () => {
    const tasks = createLinearDependencyTasks();
    tracker.initializeGraph(tasks);
    
    const logs = mockDeps.getLogs();
    const warningLogs = logs.filter(log => log.level === 'warning');
    
    // Should log graph initialization
    expect(warningLogs.some(log => log.message.includes('initialized'))).toBe(true);
  });

  test('should recover from analysis errors', () => {
    tracker.initializeGraph(createLinearDependencyTasks());
    
    // Even if analysis has issues, it should not crash
    expect(() => tracker.analyzeGraph()).not.toThrow();
  });
});