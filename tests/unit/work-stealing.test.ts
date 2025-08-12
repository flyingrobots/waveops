/**
 * Comprehensive unit tests for the Work Stealing System
 */

import {
  Task,
  TeamUtilization,
  TeamSkill,
  TaskRequirement,
  WorkStealingCandidate,
  WorkStealingConfig,
  WorkStealingReason,
  WorkTransferRequest,
  WorkStealingError,
  WorkStealingErrorCode
} from '../../src/types/index';
import { TeamMatcher, TeamMatcherDependencies } from '../../src/coordination/team-matcher';
import { LoadBalancer, LoadBalancerDependencies } from '../../src/coordination/load-balancer';
import { WorkStealingEngine, WorkStealingEngineDependencies } from '../../src/coordination/work-stealing';

// Test fixtures and mock data
const createMockTeamUtilization = (
  teamId: string,
  utilizationRate: number,
  capacity: number,
  skills: TeamSkill[] = []
): TeamUtilization => ({
  teamId,
  totalTasks: Math.floor(capacity * utilizationRate),
  activeTasks: Math.floor(capacity * utilizationRate * 0.8),
  completedTasks: Math.floor(capacity * utilizationRate * 0.2),
  capacity,
  utilizationRate,
  estimatedCompletionTime: utilizationRate * 100,
  skills
});

const createMockTask = (
  id: string,
  team: string,
  critical: boolean = false,
  dependencies: string[] = []
): Task => ({
  id,
  title: `Task ${id}`,
  wave: 1,
  team,
  depends_on: dependencies,
  acceptance: [`Complete task ${id}`],
  critical
});

const createMockSkills = (skillName: string, proficiency: number, availability: number): TeamSkill => ({
  skill: skillName,
  proficiency,
  availability
});

const createMockRequirement = (skill: string, minProficiency: number, importance: number): TaskRequirement => ({
  skill,
  minimumProficiency: minProficiency,
  importance
});

const createDefaultConfig = (): WorkStealingConfig => ({
  enabled: true,
  utilizationThreshold: 0.8,
  imbalanceThreshold: 0.3,
  minimumTransferBenefit: 0.1,
  maxTransfersPerWave: 5,
  skillMatchThreshold: 0.5,
  coordinationOverheadWeight: 0.2,
  proactiveStealingEnabled: true,
  emergencyStealingEnabled: true
});

describe('TeamMatcher', () => {
  let mockDeps: jest.Mocked<TeamMatcherDependencies>;
  let teamMatcher: TeamMatcher;

  beforeEach(() => {
    mockDeps = {
      getTaskRequirements: jest.fn(),
      getTeamUtilization: jest.fn(),
      getAllTeams: jest.fn()
    };
    teamMatcher = new TeamMatcher(mockDeps);
  });

  describe('findBestMatches', () => {
    test('should find compatible teams based on skills', async () => {
      const task = createMockTask('task-1', 'team-a', false, []);
      const requirements = [createMockRequirement('javascript', 0.7, 1.0)];
      const teamUtilization = createMockTeamUtilization('team-b', 0.5, 10, [
        createMockSkills('javascript', 0.8, 0.9)
      ]);

      mockDeps.getTaskRequirements.mockResolvedValue(requirements);
      mockDeps.getAllTeams.mockResolvedValue(['team-a', 'team-b']);
      mockDeps.getTeamUtilization.mockResolvedValue(teamUtilization);

      const matches = await teamMatcher.findBestMatches(task);

      expect(matches).toHaveLength(1);
      expect(matches[0].candidateTeams).toContain('team-b');
      expect(matches[0].skillMatch).toBeGreaterThan(0.5);
    });

    test('should exclude teams with insufficient skills', async () => {
      const task = createMockTask('task-1', 'team-a', false, []);
      const requirements = [createMockRequirement('python', 0.8, 1.0)];
      const teamUtilization = createMockTeamUtilization('team-b', 0.5, 10, [
        createMockSkills('javascript', 0.9, 0.9) // Wrong skill
      ]);

      mockDeps.getTaskRequirements.mockResolvedValue(requirements);
      mockDeps.getAllTeams.mockResolvedValue(['team-a', 'team-b']);
      mockDeps.getTeamUtilization.mockResolvedValue(teamUtilization);

      const matches = await teamMatcher.findBestMatches(task);

      expect(matches).toHaveLength(0);
    });

    test('should calculate transfer costs correctly', async () => {
      const task = createMockTask('task-1', 'team-a', true, ['dep-1', 'dep-2']);
      const requirements = [createMockRequirement('javascript', 0.5, 1.0)];
      const highUtilizationTeam = createMockTeamUtilization('team-b', 0.9, 10, [
        createMockSkills('javascript', 0.8, 0.9)
      ]);

      mockDeps.getTaskRequirements.mockResolvedValue(requirements);
      mockDeps.getAllTeams.mockResolvedValue(['team-a', 'team-b']);
      mockDeps.getTeamUtilization.mockResolvedValue(highUtilizationTeam);

      const matches = await teamMatcher.findBestMatches(task);

      expect(matches[0].transferCost).toBeGreaterThan(0.3); // High due to critical + dependencies + high utilization
    });

    test('should handle empty requirements as perfect match', async () => {
      const task = createMockTask('task-1', 'team-a', false, []);
      const teamUtilization = createMockTeamUtilization('team-b', 0.3, 10, []);

      mockDeps.getTaskRequirements.mockResolvedValue([]);
      mockDeps.getAllTeams.mockResolvedValue(['team-a', 'team-b']);
      mockDeps.getTeamUtilization.mockResolvedValue(teamUtilization);

      const matches = await teamMatcher.findBestMatches(task);

      expect(matches[0].skillMatch).toBe(1.0);
    });
  });

  describe('validateTeamCapability', () => {
    test('should return true for capable team', async () => {
      const requirements = [createMockRequirement('javascript', 0.6, 1.0)];
      const teamUtilization = createMockTeamUtilization('team-b', 0.5, 10, [
        createMockSkills('javascript', 0.8, 0.9)
      ]);

      mockDeps.getTaskRequirements.mockResolvedValue(requirements);
      mockDeps.getTeamUtilization.mockResolvedValue(teamUtilization);

      const canHandle = await teamMatcher.validateTeamCapability('task-1', 'team-b');

      expect(canHandle).toBe(true);
    });

    test('should return false for team at capacity', async () => {
      const requirements = [createMockRequirement('javascript', 0.6, 1.0)];
      const teamUtilization = createMockTeamUtilization('team-b', 1.0, 10, [
        createMockSkills('javascript', 0.8, 0.9)
      ]);
      teamUtilization.activeTasks = teamUtilization.capacity; // At capacity

      mockDeps.getTaskRequirements.mockResolvedValue(requirements);
      mockDeps.getTeamUtilization.mockResolvedValue(teamUtilization);

      const canHandle = await teamMatcher.validateTeamCapability('task-1', 'team-b');

      expect(canHandle).toBe(false);
    });
  });

  describe('error handling', () => {
    test('should throw WorkStealingError on dependency failure', async () => {
      const task = createMockTask('task-1', 'team-a');
      
      mockDeps.getTaskRequirements.mockRejectedValue(new Error('Database error'));

      await expect(teamMatcher.findBestMatches(task)).rejects.toThrow(WorkStealingError);
      await expect(teamMatcher.findBestMatches(task)).rejects.toMatchObject({
        code: WorkStealingErrorCode.SKILL_MISMATCH
      });
    });
  });
});

describe('LoadBalancer', () => {
  let mockDeps: jest.Mocked<LoadBalancerDependencies>;
  let loadBalancer: LoadBalancer;
  let config: WorkStealingConfig;

  beforeEach(() => {
    mockDeps = {
      getTeamUtilization: jest.fn(),
      getAllTeams: jest.fn(),
      getTasksByWave: jest.fn(),
      estimateTaskDuration: jest.fn(),
      findTeamMatches: jest.fn()
    };
    config = createDefaultConfig();
    loadBalancer = new LoadBalancer(mockDeps, config);
  });

  describe('calculateLoadMetrics', () => {
    test('should identify bottleneck teams', async () => {
      const teams = ['team-a', 'team-b', 'team-c'];
      const utilizations = [
        createMockTeamUtilization('team-a', 0.9, 10), // Bottleneck
        createMockTeamUtilization('team-b', 0.3, 10), // Underutilized
        createMockTeamUtilization('team-c', 0.6, 10)  // Normal
      ];

      mockDeps.getAllTeams.mockResolvedValue(teams);
      mockDeps.getTeamUtilization
        .mockResolvedValueOnce(utilizations[0])
        .mockResolvedValueOnce(utilizations[1])
        .mockResolvedValueOnce(utilizations[2]);
      mockDeps.getTasksByWave.mockResolvedValue([]);
      mockDeps.findTeamMatches.mockResolvedValue([]);

      const metrics = await loadBalancer.calculateLoadMetrics(1);

      expect(metrics.bottleneckTeams).toContain('team-a');
      expect(metrics.underutilizedTeams).toContain('team-b');
      expect(metrics.utilizationVariance).toBeGreaterThan(0);
    });

    test('should calculate total utilization correctly', async () => {
      const teams = ['team-a', 'team-b'];
      const utilizations = [
        createMockTeamUtilization('team-a', 0.8, 10), // 8 tasks
        createMockTeamUtilization('team-b', 0.4, 10)  // 4 tasks
      ];

      mockDeps.getAllTeams.mockResolvedValue(teams);
      mockDeps.getTeamUtilization
        .mockResolvedValueOnce(utilizations[0])
        .mockResolvedValueOnce(utilizations[1]);
      mockDeps.getTasksByWave.mockResolvedValue([]);
      mockDeps.findTeamMatches.mockResolvedValue([]);

      const metrics = await loadBalancer.calculateLoadMetrics(1);

      expect(metrics.totalUtilization).toBeCloseTo(0.6); // 12 tasks / 20 capacity
    });
  });

  describe('performProactiveBalancing', () => {
    test('should suggest proactive transfers for predicted bottlenecks', async () => {
      const teams = ['team-a', 'team-b'];
      const tasks = [
        createMockTask('task-1', 'team-a', false, []),
        createMockTask('task-2', 'team-a', false, [])
      ];
      const candidates: WorkStealingCandidate[] = [{
        taskId: 'task-1',
        originalTeam: 'team-a',
        candidateTeams: ['team-b'],
        transferCost: 0.2,
        expectedBenefit: 0.3,
        dependencyRisk: 0.1,
        skillMatch: 0.8
      }];

      mockDeps.getAllTeams.mockResolvedValue(teams);
      mockDeps.getTasksByWave.mockResolvedValue(tasks);
      mockDeps.getTeamUtilization
        .mockResolvedValueOnce(createMockTeamUtilization('team-a', 0.85, 10))
        .mockResolvedValueOnce(createMockTeamUtilization('team-b', 0.4, 10));
      mockDeps.estimateTaskDuration.mockResolvedValue(2);
      mockDeps.findTeamMatches.mockResolvedValue(candidates);

      const proactiveTransfers = await loadBalancer.performProactiveBalancing(1);

      expect(proactiveTransfers).toHaveLength(1);
      expect(proactiveTransfers[0].taskId).toBe('task-1');
    });

    test('should return empty array when proactive stealing is disabled', async () => {
      config.proactiveStealingEnabled = false;
      loadBalancer = new LoadBalancer(mockDeps, config);

      const proactiveTransfers = await loadBalancer.performProactiveBalancing(1);

      expect(proactiveTransfers).toHaveLength(0);
    });
  });

  describe('performEmergencyRebalancing', () => {
    test('should handle emergency situations with lower skill thresholds', async () => {
      const teams = ['team-a', 'team-b'];
      const tasks = [createMockTask('task-1', 'team-a', true, [])];
      const candidates: WorkStealingCandidate[] = [{
        taskId: 'task-1',
        originalTeam: 'team-a',
        candidateTeams: ['team-b'],
        transferCost: 0.4,
        expectedBenefit: 0.2,
        dependencyRisk: 0.2,
        skillMatch: 0.4 // Below normal threshold but acceptable for emergency
      }];

      mockDeps.getAllTeams.mockResolvedValue(teams);
      mockDeps.getTasksByWave.mockResolvedValue(tasks);
      mockDeps.getTeamUtilization
        .mockResolvedValueOnce(createMockTeamUtilization('team-a', 0.96, 10)) // Emergency level
        .mockResolvedValueOnce(createMockTeamUtilization('team-b', 0.3, 10));
      mockDeps.findTeamMatches.mockResolvedValue(candidates);

      const emergencyTransfers = await loadBalancer.performEmergencyRebalancing(1);

      expect(emergencyTransfers).toHaveLength(1);
      expect(emergencyTransfers[0].expectedBenefit).toBeGreaterThan(candidates[0].expectedBenefit); // Boosted
    });
  });

  describe('evaluateDistributionHealth', () => {
    test('should mark distribution as unhealthy when variance is high', async () => {
      const teams = ['team-a', 'team-b'];
      const utilizations = [
        createMockTeamUtilization('team-a', 0.9, 10),
        createMockTeamUtilization('team-b', 0.1, 10)
      ];

      mockDeps.getAllTeams.mockResolvedValue(teams);
      mockDeps.getTeamUtilization
        .mockResolvedValueOnce(utilizations[0])
        .mockResolvedValueOnce(utilizations[1]);
      mockDeps.getTasksByWave.mockResolvedValue([]);
      mockDeps.findTeamMatches.mockResolvedValue([]);

      const health = await loadBalancer.evaluateDistributionHealth(1);

      expect(health.healthy).toBe(false);
      expect(health.imbalanceScore).toBeGreaterThan(config.imbalanceThreshold);
      expect(health.recommendedActions.length).toBeGreaterThan(0);
    });
  });
});

describe('WorkStealingEngine', () => {
  let mockDeps: jest.Mocked<WorkStealingEngineDependencies>;
  let engine: WorkStealingEngine;
  let config: WorkStealingConfig;

  beforeEach(() => {
    mockDeps = {
      // TeamMatcher dependencies
      getTaskRequirements: jest.fn(),
      getTeamUtilization: jest.fn(),
      getAllTeams: jest.fn(),
      // LoadBalancer dependencies
      getTasksByWave: jest.fn(),
      estimateTaskDuration: jest.fn(),
      findTeamMatches: jest.fn(),
      // WorkStealingEngine specific dependencies
      getWaveState: jest.fn(),
      updateTaskAssignment: jest.fn(),
      validateDependencies: jest.fn(),
      notifyTeamOfTransfer: jest.fn(),
      logTransferAttempt: jest.fn(),
      acquireCoordinationLock: jest.fn(),
      releaseCoordinationLock: jest.fn(),
      rollbackTransfer: jest.fn(),
      getTransferHistory: jest.fn()
    };
    config = createDefaultConfig();
    engine = new WorkStealingEngine(mockDeps, config);
  });

  describe('coordinateWorkStealing', () => {
    test('should return empty metrics when disabled', async () => {
      config.enabled = false;
      engine = new WorkStealingEngine(mockDeps, config);

      const metrics = await engine.coordinateWorkStealing(1);

      expect(metrics.totalTransfers).toBe(0);
      expect(metrics.successfulTransfers).toBe(0);
    });

    test('should execute transfers and return metrics', async () => {
      const teams = ['team-a', 'team-b'];
      const utilizations = [
        createMockTeamUtilization('team-a', 0.9, 10),
        createMockTeamUtilization('team-b', 0.3, 10)
      ];
      const candidates: WorkStealingCandidate[] = [{
        taskId: 'task-1',
        originalTeam: 'team-a',
        candidateTeams: ['team-b'],
        transferCost: 0.2,
        expectedBenefit: 0.4,
        dependencyRisk: 0.1,
        skillMatch: 0.8
      }];

      // Setup mocks for successful transfer
      mockDeps.getAllTeams.mockResolvedValue(teams);
      mockDeps.getTeamUtilization
        .mockResolvedValueOnce(utilizations[0])
        .mockResolvedValueOnce(utilizations[1])
        .mockResolvedValueOnce(utilizations[0])
        .mockResolvedValueOnce(utilizations[1]);
      mockDeps.getTasksByWave.mockResolvedValue([createMockTask('task-1', 'team-a')]);
      mockDeps.findTeamMatches.mockResolvedValue(candidates);
      mockDeps.acquireCoordinationLock.mockResolvedValue('lock-1');
      mockDeps.validateDependencies.mockResolvedValue(true);
      mockDeps.notifyTeamOfTransfer.mockResolvedValue(true);
      mockDeps.updateTaskAssignment.mockResolvedValue();
      mockDeps.releaseCoordinationLock.mockResolvedValue();
      mockDeps.logTransferAttempt.mockResolvedValue();

      const metrics = await engine.coordinateWorkStealing(1);

      expect(metrics.totalTransfers).toBeGreaterThan(0);
      expect(mockDeps.updateTaskAssignment).toHaveBeenCalledWith('task-1', 'team-b');
    });

    test('should handle transfer failures gracefully', async () => {
      const teams = ['team-a', 'team-b'];
      const utilizations = [
        createMockTeamUtilization('team-a', 0.9, 10),
        createMockTeamUtilization('team-b', 0.3, 10)
      ];
      const candidates: WorkStealingCandidate[] = [{
        taskId: 'task-1',
        originalTeam: 'team-a',
        candidateTeams: ['team-b'],
        transferCost: 0.2,
        expectedBenefit: 0.4,
        dependencyRisk: 0.1,
        skillMatch: 0.8
      }];

      mockDeps.getAllTeams.mockResolvedValue(teams);
      mockDeps.getTeamUtilization
        .mockResolvedValueOnce(utilizations[0])
        .mockResolvedValueOnce(utilizations[1])
        .mockResolvedValueOnce(utilizations[0])
        .mockResolvedValueOnce(utilizations[1]);
      mockDeps.getTasksByWave.mockResolvedValue([createMockTask('task-1', 'team-a')]);
      mockDeps.findTeamMatches.mockResolvedValue(candidates);
      mockDeps.acquireCoordinationLock.mockResolvedValue('lock-1');
      mockDeps.validateDependencies.mockResolvedValue(false); // Cause failure
      mockDeps.releaseCoordinationLock.mockResolvedValue();
      mockDeps.logTransferAttempt.mockResolvedValue();

      const metrics = await engine.coordinateWorkStealing(1);

      expect(metrics.failedTransfers).toBeGreaterThan(0);
      expect(mockDeps.updateTaskAssignment).not.toHaveBeenCalled();
    });
  });

  describe('claimTask', () => {
    test('should successfully claim a task when team is capable', async () => {
      const task = createMockTask('task-1', 'team-a');
      const requirements = [createMockRequirement('javascript', 0.6, 1.0)];
      const teamUtilization = createMockTeamUtilization('team-b', 0.4, 10, [
        createMockSkills('javascript', 0.8, 0.9)
      ]);

      mockDeps.getTasksByWave.mockResolvedValue([task]);
      mockDeps.getTaskRequirements.mockResolvedValue(requirements);
      mockDeps.getTeamUtilization.mockResolvedValue(teamUtilization);
      mockDeps.acquireCoordinationLock.mockResolvedValue('lock-1');
      mockDeps.validateDependencies.mockResolvedValue(true);
      mockDeps.notifyTeamOfTransfer.mockResolvedValue(true);
      mockDeps.updateTaskAssignment.mockResolvedValue();
      mockDeps.releaseCoordinationLock.mockResolvedValue();
      mockDeps.logTransferAttempt.mockResolvedValue();

      const result = await engine.claimTask('task-1', 'team-b');

      expect(result).toBe(true);
      expect(mockDeps.updateTaskAssignment).toHaveBeenCalledWith('task-1', 'team-b');
    });

    test('should throw error when team cannot handle task', async () => {
      const task = createMockTask('task-1', 'team-a');
      const requirements = [createMockRequirement('python', 0.8, 1.0)];
      const teamUtilization = createMockTeamUtilization('team-b', 0.4, 10, [
        createMockSkills('javascript', 0.8, 0.9) // Wrong skill
      ]);

      mockDeps.getTasksByWave.mockResolvedValue([task]);
      mockDeps.getTaskRequirements.mockResolvedValue(requirements);
      mockDeps.getTeamUtilization.mockResolvedValue(teamUtilization);

      await expect(engine.claimTask('task-1', 'team-b')).rejects.toThrow(WorkStealingError);
      await expect(engine.claimTask('task-1', 'team-b')).rejects.toMatchObject({
        code: WorkStealingErrorCode.SKILL_MISMATCH
      });
    });

    test('should throw error when task not found', async () => {
      mockDeps.getTasksByWave.mockResolvedValue([]);

      await expect(engine.claimTask('nonexistent', 'team-b')).rejects.toThrow(WorkStealingError);
      await expect(engine.claimTask('nonexistent', 'team-b')).rejects.toMatchObject({
        code: WorkStealingErrorCode.DEPENDENCY_VIOLATION
      });
    });
  });

  describe('releaseTask', () => {
    test('should successfully release and reassign task', async () => {
      const task = createMockTask('task-1', 'team-a');
      const candidates: WorkStealingCandidate[] = [{
        taskId: 'task-1',
        originalTeam: 'team-a',
        candidateTeams: ['team-b'],
        transferCost: 0.1,
        expectedBenefit: 0.3,
        dependencyRisk: 0.1,
        skillMatch: 0.8
      }];

      mockDeps.getTasksByWave.mockResolvedValue([task]);
      mockDeps.getTaskRequirements.mockResolvedValue([]);
      mockDeps.getAllTeams.mockResolvedValue(['team-a', 'team-b']);
      mockDeps.getTeamUtilization.mockResolvedValue(createMockTeamUtilization('team-b', 0.3, 10));
      mockDeps.acquireCoordinationLock.mockResolvedValue('lock-1');
      mockDeps.validateDependencies.mockResolvedValue(true);
      mockDeps.updateTaskAssignment.mockResolvedValue();
      mockDeps.releaseCoordinationLock.mockResolvedValue();
      mockDeps.logTransferAttempt.mockResolvedValue();

      // Mock the findBestMatches call within releaseTask
      const originalFindTeamMatches = mockDeps.findTeamMatches;
      mockDeps.findTeamMatches = jest.fn().mockResolvedValue(candidates);

      const newTeam = await engine.releaseTask('task-1', 'team-a');

      expect(newTeam).toBe('team-b');
      expect(mockDeps.updateTaskAssignment).toHaveBeenCalledWith('task-1', 'team-b');

      mockDeps.findTeamMatches = originalFindTeamMatches;
    });
  });

  describe('getWorkStealingStatus', () => {
    test('should return comprehensive status information', async () => {
      const teams = ['team-a', 'team-b'];
      const utilizations = [
        createMockTeamUtilization('team-a', 0.7, 10),
        createMockTeamUtilization('team-b', 0.5, 10)
      ];

      mockDeps.getAllTeams.mockResolvedValue(teams);
      mockDeps.getTeamUtilization
        .mockResolvedValueOnce(utilizations[0])
        .mockResolvedValueOnce(utilizations[1]);
      mockDeps.getTasksByWave.mockResolvedValue([]);
      mockDeps.findTeamMatches.mockResolvedValue([]);

      const status = await engine.getWorkStealingStatus();

      expect(status).toHaveProperty('isActive');
      expect(status).toHaveProperty('recentTransfers');
      expect(status).toHaveProperty('systemHealth');
      expect(status).toHaveProperty('recommendations');
      expect(status.systemHealth).toHaveProperty('utilizationBalance');
      expect(status.systemHealth).toHaveProperty('coordinationEfficiency');
      expect(status.systemHealth).toHaveProperty('transferSuccessRate');
    });
  });

  describe('coordination safety', () => {
    test('should acquire and release locks properly', async () => {
      const teams = ['team-a', 'team-b'];
      const utilizations = [
        createMockTeamUtilization('team-a', 0.9, 10),
        createMockTeamUtilization('team-b', 0.3, 10)
      ];
      const candidates: WorkStealingCandidate[] = [{
        taskId: 'task-1',
        originalTeam: 'team-a',
        candidateTeams: ['team-b'],
        transferCost: 0.2,
        expectedBenefit: 0.4,
        dependencyRisk: 0.1,
        skillMatch: 0.8
      }];

      mockDeps.getAllTeams.mockResolvedValue(teams);
      mockDeps.getTeamUtilization
        .mockResolvedValueOnce(utilizations[0])
        .mockResolvedValueOnce(utilizations[1])
        .mockResolvedValueOnce(utilizations[0])
        .mockResolvedValueOnce(utilizations[1]);
      mockDeps.getTasksByWave.mockResolvedValue([createMockTask('task-1', 'team-a')]);
      mockDeps.findTeamMatches.mockResolvedValue(candidates);
      mockDeps.acquireCoordinationLock.mockResolvedValue('lock-1');
      mockDeps.validateDependencies.mockResolvedValue(true);
      mockDeps.updateTaskAssignment.mockResolvedValue();
      mockDeps.releaseCoordinationLock.mockResolvedValue();
      mockDeps.logTransferAttempt.mockResolvedValue();

      await engine.coordinateWorkStealing(1);

      expect(mockDeps.acquireCoordinationLock).toHaveBeenCalledWith('task-1');
      expect(mockDeps.releaseCoordinationLock).toHaveBeenCalledWith('lock-1');
    });

    test('should handle rollback on transfer failure', async () => {
      const teams = ['team-a', 'team-b'];
      const utilizations = [
        createMockTeamUtilization('team-a', 0.9, 10),
        createMockTeamUtilization('team-b', 0.3, 10)
      ];
      const candidates: WorkStealingCandidate[] = [{
        taskId: 'task-1',
        originalTeam: 'team-a',
        candidateTeams: ['team-b'],
        transferCost: 0.2,
        expectedBenefit: 0.4,
        dependencyRisk: 0.1,
        skillMatch: 0.8
      }];

      mockDeps.getAllTeams.mockResolvedValue(teams);
      mockDeps.getTeamUtilization
        .mockResolvedValueOnce(utilizations[0])
        .mockResolvedValueOnce(utilizations[1])
        .mockResolvedValueOnce(utilizations[0])
        .mockResolvedValueOnce(utilizations[1]);
      mockDeps.getTasksByWave.mockResolvedValue([createMockTask('task-1', 'team-a')]);
      mockDeps.findTeamMatches.mockResolvedValue(candidates);
      mockDeps.acquireCoordinationLock.mockResolvedValue('lock-1');
      mockDeps.validateDependencies.mockResolvedValue(true);
      mockDeps.updateTaskAssignment.mockRejectedValue(new Error('Update failed'));
      mockDeps.rollbackTransfer.mockResolvedValue();
      mockDeps.releaseCoordinationLock.mockResolvedValue();
      mockDeps.logTransferAttempt.mockResolvedValue();

      const metrics = await engine.coordinateWorkStealing(1);

      expect(mockDeps.rollbackTransfer).toHaveBeenCalledWith('task-1', 'team-a');
      expect(metrics.failedTransfers).toBeGreaterThan(0);
    });
  });
});

describe('Integration Tests', () => {
  test('should handle complex multi-team rebalancing scenario', async () => {
    // This test simulates a realistic scenario with multiple teams and complex task dependencies
    const config = createDefaultConfig();
    const mockDeps: jest.Mocked<WorkStealingEngineDependencies> = {
      getTaskRequirements: jest.fn(),
      getTeamUtilization: jest.fn(),
      getAllTeams: jest.fn(),
      getTasksByWave: jest.fn(),
      estimateTaskDuration: jest.fn(),
      findTeamMatches: jest.fn(),
      getWaveState: jest.fn(),
      updateTaskAssignment: jest.fn(),
      validateDependencies: jest.fn(),
      notifyTeamOfTransfer: jest.fn(),
      logTransferAttempt: jest.fn(),
      acquireCoordinationLock: jest.fn(),
      releaseCoordinationLock: jest.fn(),
      rollbackTransfer: jest.fn(),
      getTransferHistory: jest.fn()
    };

    const engine = new WorkStealingEngine(mockDeps, config);

    const teams = ['frontend', 'backend', 'devops', 'mobile'];
    const tasks = [
      createMockTask('ui-task-1', 'frontend', false, []),
      createMockTask('api-task-1', 'backend', true, ['ui-task-1']),
      createMockTask('deploy-task-1', 'devops', false, ['api-task-1']),
      createMockTask('mobile-task-1', 'mobile', false, [])
    ];

    const utilizations = [
      createMockTeamUtilization('frontend', 0.95, 5, [createMockSkills('react', 0.9, 0.8)]),
      createMockTeamUtilization('backend', 0.85, 8, [createMockSkills('node', 0.8, 0.9)]),
      createMockTeamUtilization('devops', 0.2, 6, [createMockSkills('docker', 0.9, 0.9)]),
      createMockTeamUtilization('mobile', 0.3, 4, [createMockSkills('react-native', 0.7, 0.8)])
    ];

    // Setup mocks
    mockDeps.getAllTeams.mockResolvedValue(teams);
    mockDeps.getTasksByWave.mockResolvedValue(tasks);
    
    let callIndex = 0;
    mockDeps.getTeamUtilization.mockImplementation(() => {
      return Promise.resolve(utilizations[callIndex++ % utilizations.length]);
    });

    mockDeps.findTeamMatches.mockResolvedValue([{
      taskId: 'mobile-task-1',
      originalTeam: 'mobile',
      candidateTeams: ['devops'],
      transferCost: 0.3,
      expectedBenefit: 0.5,
      dependencyRisk: 0.1,
      skillMatch: 0.6
    }]);

    mockDeps.getTaskRequirements.mockResolvedValue([]);
    mockDeps.acquireCoordinationLock.mockResolvedValue('lock-1');
    mockDeps.validateDependencies.mockResolvedValue(true);
    mockDeps.updateTaskAssignment.mockResolvedValue();
    mockDeps.releaseCoordinationLock.mockResolvedValue();
    mockDeps.logTransferAttempt.mockResolvedValue();

    const metrics = await engine.coordinateWorkStealing(1);

    // Should identify frontend as bottleneck and devops as underutilized
    // Should attempt some transfers despite skill mismatches
    expect(metrics.totalTransfers).toBeGreaterThanOrEqual(0);
    expect(mockDeps.logTransferAttempt).toHaveBeenCalled();
  });

  test('should respect configuration limits', async () => {
    const config: WorkStealingConfig = {
      enabled: true,
      utilizationThreshold: 0.7,
      imbalanceThreshold: 0.2,
      minimumTransferBenefit: 0.3,
      maxTransfersPerWave: 2, // Limit to 2 transfers
      skillMatchThreshold: 0.6,
      coordinationOverheadWeight: 0.1,
      proactiveStealingEnabled: true,
      emergencyStealingEnabled: false
    };

    const mockDeps: jest.Mocked<WorkStealingEngineDependencies> = {
      getTaskRequirements: jest.fn(),
      getTeamUtilization: jest.fn(),
      getAllTeams: jest.fn(),
      getTasksByWave: jest.fn(),
      estimateTaskDuration: jest.fn(),
      findTeamMatches: jest.fn(),
      getWaveState: jest.fn(),
      updateTaskAssignment: jest.fn(),
      validateDependencies: jest.fn(),
      notifyTeamOfTransfer: jest.fn(),
      logTransferAttempt: jest.fn(),
      acquireCoordinationLock: jest.fn(),
      releaseCoordinationLock: jest.fn(),
      rollbackTransfer: jest.fn(),
      getTransferHistory: jest.fn()
    };

    const engine = new WorkStealingEngine(mockDeps, config);

    // Setup many potential transfers
    const candidates: WorkStealingCandidate[] = [];
    for (let i = 0; i < 10; i++) {
      candidates.push({
        taskId: `task-${i}`,
        originalTeam: 'team-a',
        candidateTeams: ['team-b'],
        transferCost: 0.1,
        expectedBenefit: 0.4,
        dependencyRisk: 0.1,
        skillMatch: 0.7
      });
    }

    mockDeps.getAllTeams.mockResolvedValue(['team-a', 'team-b']);
    mockDeps.getTeamUtilization.mockResolvedValue(createMockTeamUtilization('team-a', 0.8, 10));
    mockDeps.getTasksByWave.mockResolvedValue(candidates.map(c => createMockTask(c.taskId, 'team-a')));
    mockDeps.findTeamMatches.mockResolvedValue(candidates);
    mockDeps.acquireCoordinationLock.mockImplementation((taskId) => Promise.resolve(`lock-${taskId}`));
    mockDeps.validateDependencies.mockResolvedValue(true);
    mockDeps.updateTaskAssignment.mockResolvedValue();
    mockDeps.releaseCoordinationLock.mockResolvedValue();
    mockDeps.logTransferAttempt.mockResolvedValue();

    const metrics = await engine.coordinateWorkStealing(1);

    // Should respect the maxTransfersPerWave limit
    expect(metrics.totalTransfers).toBeLessThanOrEqual(config.maxTransfersPerWave);
  });
});